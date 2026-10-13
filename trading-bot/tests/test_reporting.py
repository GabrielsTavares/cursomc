import pandas as pd
import pytest

from reporting.export_ir import monthly_summary, to_brl
from reporting.trades_db import load_closed_trades
from reporting.weekly_report import build_report, seconds_until_next_send


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value, tz="UTC")


def test_load_closed_trades_ignores_open(trades_db):
    trades = load_closed_trades(trades_db)
    assert trades["id"].tolist() == [1, 2, 3]
    assert str(trades["close_date"].dt.tz) == "UTC"
    assert trades["is_short"].tolist() == [False, True, False]
    assert trades.loc[0, "fees"] == pytest.approx(0.031)


def test_to_brl_uses_close_day_rate_with_fallback(trades_db):
    trades = load_closed_trades(trades_db)
    rates = pd.Series(
        [5.0, 5.5, 6.0],
        index=pd.to_datetime(["2026-01-07", "2026-01-11", "2026-01-31"], utc=True),
    )
    rows = to_brl(trades, rates)
    # Trade 3 fecha em 03/02, sem cotação no dia: usa a última anterior (31/01).
    assert rows["cotacao_usdt_brl"].tolist() == [5.0, 5.5, 6.0]
    assert rows["resultado_brl"].tolist() == pytest.approx([14.5, -6.875, 5.4])
    assert rows["direcao"].tolist() == ["compra (long)", "venda (short)", "compra (long)"]


def test_to_brl_with_several_trades_closing_same_day(trades_db):
    trades = load_closed_trades(trades_db)
    trades["close_date"] = ts("2026-01-07 12:00")
    rates = pd.Series([5.0], index=pd.to_datetime(["2026-01-07"], utc=True))
    assert to_brl(trades, rates)["cotacao_usdt_brl"].tolist() == [5.0, 5.0, 5.0]


def test_monthly_summary(trades_db):
    trades = load_closed_trades(trades_db)
    rates = pd.Series([5.0], index=pd.to_datetime(["2026-01-01"], utc=True))
    summary = monthly_summary(to_brl(trades, rates)).set_index("mes")
    assert summary.loc["2026-01", "trades"] == 2
    assert summary.loc["2026-01", "ganhos_brl"] == pytest.approx(14.5)
    assert summary.loc["2026-01", "perdas_brl"] == pytest.approx(-6.25)
    assert summary.loc["2026-02", "resultado_acumulado_brl"] == pytest.approx(12.75)


def test_build_report_sections(trades_db):
    trades = load_closed_trades(trades_db)
    btc = pd.Series([100.0, 90.0], index=pd.to_datetime(["2026-01-05", "2026-02-05"], utc=True))
    text = build_report(trades, 99.0, ts("2026-01-05"), ts("2026-02-05"), btc, 5.0)
    assert "Últimos 7 dias" in text
    assert "Desde 05/01/2026" in text
    assert "Trades: 1 " in text  # só o trade de 03/02 cai na última semana
    assert "BTC no mesmo período = -10.00%" in text
    assert "Saldo realizado: 101.55 USDT (R$ 507.75)" in text


def test_seconds_until_next_send_is_next_monday_noon_utc():
    sunday = ts("2026-10-11 20:00")
    assert seconds_until_next_send(sunday) == pytest.approx(16 * 3600)
    monday_after = ts("2026-10-12 12:00:01")
    assert seconds_until_next_send(monday_after) == pytest.approx(7 * 86400 - 1)
