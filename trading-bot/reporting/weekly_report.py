"""Relatório semanal de desempenho no Telegram.

Uso:
    python -m reporting.weekly_report --once            # envia agora
    python -m reporting.weekly_report --once --dry      # só imprime, não envia
    python -m reporting.weekly_report                   # fica rodando; envia toda segunda 09:00 (Brasília)

Variáveis de ambiente:
    FREQTRADE__TELEGRAM__TOKEN / FREQTRADE__TELEGRAM__CHAT_ID  (as mesmas do bot)
    REPORT_DB                  caminho do SQLite (padrão: user_data/tradesv3.sqlite)
    REPORT_STARTING_BALANCE    saldo inicial em USDT (padrão: dry_run_wallet do config.json)
    REPORT_START_DATE          início do acompanhamento AAAA-MM-DD (padrão: primeiro trade)
"""

import argparse
import html
import json
import logging
import os
import sys
import time
from datetime import timedelta
from pathlib import Path

import pandas as pd

from reporting import binance_public, telegram
from reporting.metrics import Performance, buy_and_hold_return, performance
from reporting.trades_db import load_closed_trades

logger = logging.getLogger("weekly_report")

ROOT = Path(__file__).resolve().parent.parent
SEND_WEEKDAY = 0  # segunda-feira
SEND_HOUR_UTC = 12  # 09:00 em Brasília


def default_starting_balance() -> float:
    config = json.loads((ROOT / "user_data" / "config.json").read_text())
    return float(config.get("dry_run_wallet", 0))


def fmt_pct(value: float | None) -> str:
    return "n/d" if value is None else f"{value * 100:+.2f}%"


def fmt_num(value: float | None) -> str:
    return "n/d" if value is None else f"{value:.2f}"


def section(title: str, perf: Performance, usdt_brl: float | None) -> list[str]:
    brl = f" (R$ {perf.profit_abs * usdt_brl:+.2f})" if usdt_brl else ""
    return [
        f"<b>{html.escape(title)}</b>",
        f"Trades: {perf.trades} | Acerto: {perf.win_rate * 100:.0f}%",
        f"Resultado: {perf.profit_abs:+.2f} USDT{brl} | {fmt_pct(perf.profit_pct)}",
        f"Profit factor: {fmt_num(perf.profit_factor)} | Expectativa: {perf.expectancy:+.3f} USDT/trade",
        f"Drawdown máx.: {perf.max_drawdown * 100:.1f}% | Sharpe: {fmt_num(perf.sharpe)} | "
        f"Sortino: {fmt_num(perf.sortino)}",
    ]


def build_report(
    trades: pd.DataFrame,
    starting_balance: float,
    start: pd.Timestamp,
    now: pd.Timestamp,
    btc_closes: pd.Series,
    usdt_brl: float | None,
) -> str:
    week_start = now - timedelta(days=7)
    balance_before_week = starting_balance + trades.loc[trades["close_date"] < week_start, "profit_abs"].sum()

    week = performance(trades, balance_before_week, week_start, now)
    total = performance(trades, starting_balance, start, now)
    btc = buy_and_hold_return(btc_closes, start, now)

    balance = starting_balance + total.profit_abs
    lines = [
        "<b>Relatório semanal do bot</b>",
        f"Saldo realizado: {balance:.2f} USDT" + (f" (R$ {balance * usdt_brl:.2f})" if usdt_brl else ""),
        "",
        *section("Últimos 7 dias", week, usdt_brl),
        "",
        *section(f"Desde {start:%d/%m/%Y}", total, usdt_brl),
        "",
        f"Comparação: comprar e segurar BTC no mesmo período = {fmt_pct(btc)}",
    ]
    if total.max_drawdown >= 0.20:
        lines.append("ATENÇÃO: drawdown acima de 20%: revise a estratégia antes de aumentar o capital.")
    return "\n".join(lines)


def generate(now: pd.Timestamp | None = None) -> str:
    now = now or pd.Timestamp.now(tz="UTC")
    db = os.environ.get("REPORT_DB", str(ROOT / "user_data" / "tradesv3.sqlite"))
    starting_balance = float(os.environ.get("REPORT_STARTING_BALANCE") or default_starting_balance())
    trades = load_closed_trades(db)

    start_env = os.environ.get("REPORT_START_DATE")
    if start_env:
        start = pd.Timestamp(start_env, tz="UTC")
    elif not trades.empty:
        start = trades["open_date"].min()
    else:
        start = now - timedelta(days=7)

    btc = binance_public.daily_closes("BTCUSDT", start, now)
    brl = binance_public.daily_closes("USDTBRL", now - timedelta(days=3), now)
    usdt_brl = float(brl.iloc[-1]) if not brl.empty else None
    return build_report(trades, starting_balance, start, now, btc, usdt_brl)


def seconds_until_next_send(now: pd.Timestamp) -> float:
    target = now.normalize() + timedelta(days=(SEND_WEEKDAY - now.weekday()) % 7, hours=SEND_HOUR_UTC)
    if target <= now:
        target += timedelta(days=7)
    return (target - now).total_seconds()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--once", action="store_true", help="Envia uma vez e sai")
    parser.add_argument("--dry", action="store_true", help="Imprime em vez de enviar")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    def run() -> None:
        text = generate()
        if args.dry:
            print(text)
        else:
            telegram.send_message(text)
            logger.info("Relatório enviado")

    if args.once:
        run()
        return 0

    while True:
        wait = seconds_until_next_send(pd.Timestamp.now(tz="UTC"))
        logger.info("Próximo relatório em %.1f horas", wait / 3600)
        time.sleep(wait)
        try:
            run()
        except Exception:
            logger.exception("Falha ao gerar/enviar relatório; tentando de novo na próxima semana")


if __name__ == "__main__":
    sys.exit(main())
