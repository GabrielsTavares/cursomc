import pandas as pd
import pytest

from reporting.metrics import buy_and_hold_return, daily_equity, max_drawdown, performance


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value, tz="UTC")


@pytest.fixture
def trades() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "close_date": [ts("2026-01-02 10:00"), ts("2026-01-03 10:00"), ts("2026-01-03 18:00"),
                           ts("2026-01-05 09:00")],
            "profit_abs": [10.0, -20.0, -5.0, 30.0],
        }
    )


def test_daily_equity_accumulates_per_day(trades):
    equity = daily_equity(trades, 100.0, ts("2026-01-01"), ts("2026-01-05 23:00"))
    assert equity.tolist() == [100.0, 110.0, 85.0, 85.0, 115.0]


def test_daily_equity_without_trades_is_flat():
    empty = pd.DataFrame({"close_date": pd.Series(dtype="datetime64[ns, UTC]"), "profit_abs": []})
    equity = daily_equity(empty, 50.0, ts("2026-01-01"), ts("2026-01-03"))
    assert equity.tolist() == [50.0, 50.0, 50.0]


def test_max_drawdown_from_peak():
    assert max_drawdown(pd.Series([100.0, 120.0, 90.0, 130.0])) == pytest.approx(0.25)


def test_performance_metrics(trades):
    perf = performance(trades, 100.0, ts("2026-01-01"), ts("2026-01-06"))
    assert perf.trades == 4
    assert perf.profit_abs == pytest.approx(15.0)
    assert perf.profit_pct == pytest.approx(0.15)
    assert perf.win_rate == pytest.approx(0.5)
    assert perf.profit_factor == pytest.approx(40 / 25)
    assert perf.expectancy == pytest.approx(3.75)
    assert perf.max_drawdown == pytest.approx(25 / 110)
    assert perf.sharpe is not None and perf.sortino is not None


def test_performance_filters_period_and_handles_no_losses(trades):
    perf = performance(trades, 100.0, ts("2026-01-05"), ts("2026-01-06"))
    assert perf.trades == 1
    assert perf.profit_factor is None
    assert perf.max_drawdown == 0


def test_buy_and_hold_return():
    prices = pd.Series([100.0, 110.0, 80.0], index=pd.date_range("2026-01-01", periods=3, tz="UTC"))
    assert buy_and_hold_return(prices, ts("2026-01-01 15:00"), ts("2026-01-03")) == pytest.approx(-0.2)
    assert buy_and_hold_return(prices, ts("2026-02-01"), ts("2026-02-03")) is None
