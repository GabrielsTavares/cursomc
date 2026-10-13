from dataclasses import dataclass
from math import sqrt

import pandas as pd

DAYS_PER_YEAR = 365


@dataclass(frozen=True)
class Performance:
    trades: int
    profit_abs: float
    profit_pct: float
    win_rate: float
    profit_factor: float | None
    expectancy: float
    max_drawdown: float
    sharpe: float | None
    sortino: float | None


def daily_equity(
    trades: pd.DataFrame, starting_balance: float, start: pd.Timestamp, end: pd.Timestamp
) -> pd.Series:
    """Saldo no fim de cada dia, somando o lucro dos trades fechados naquele dia."""
    days = pd.date_range(start.normalize(), end.normalize(), freq="D", tz="UTC")
    if trades.empty:
        return pd.Series(starting_balance, index=days, dtype="float64")
    pnl = trades.groupby(trades["close_date"].dt.normalize())["profit_abs"].sum()
    pnl = pnl.reindex(days, fill_value=0.0)
    return starting_balance + pnl.cumsum()


def max_drawdown(equity: pd.Series) -> float:
    if equity.empty:
        return 0.0
    return float((1 - equity / equity.cummax()).max())


def sharpe_sortino(equity: pd.Series) -> tuple[float | None, float | None]:
    returns = equity.pct_change().dropna()
    if len(returns) < 2:
        return None, None
    mean = returns.mean()
    std = returns.std()
    downside = sqrt((returns.clip(upper=0) ** 2).mean())
    sharpe = mean / std * sqrt(DAYS_PER_YEAR) if std > 0 else None
    sortino = mean / downside * sqrt(DAYS_PER_YEAR) if downside > 0 else None
    return sharpe, sortino


def performance(
    trades: pd.DataFrame, starting_balance: float, start: pd.Timestamp, end: pd.Timestamp
) -> Performance:
    """Métricas de um período. `trades` precisa das colunas `close_date` (UTC) e `profit_abs`."""
    in_period = trades[(trades["close_date"] >= start) & (trades["close_date"] <= end)]
    profits = in_period["profit_abs"]
    gains = profits[profits > 0].sum()
    losses = -profits[profits < 0].sum()

    equity = daily_equity(in_period, starting_balance, start, end)
    sharpe, sortino = sharpe_sortino(equity)
    total = float(profits.sum())
    return Performance(
        trades=len(in_period),
        profit_abs=total,
        profit_pct=total / starting_balance if starting_balance else 0.0,
        win_rate=float((profits > 0).mean()) if len(profits) else 0.0,
        profit_factor=float(gains / losses) if losses > 0 else None,
        expectancy=float(profits.mean()) if len(profits) else 0.0,
        max_drawdown=max_drawdown(equity),
        sharpe=sharpe,
        sortino=sortino,
    )


def buy_and_hold_return(prices: pd.Series, start: pd.Timestamp, end: pd.Timestamp) -> float | None:
    """Retorno de comprar no primeiro fechamento >= start e segurar até o último <= end."""
    window = prices[(prices.index >= start.normalize()) & (prices.index <= end)]
    if len(window) < 2:
        return None
    return float(window.iloc[-1] / window.iloc[0] - 1)
