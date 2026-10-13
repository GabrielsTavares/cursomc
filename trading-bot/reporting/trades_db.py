import sqlite3
from pathlib import Path

import pandas as pd

QUERY = """
SELECT id, pair, is_short, leverage, open_date, close_date, open_rate, close_rate, amount,
       stake_amount, close_profit_abs AS profit_abs, close_profit AS profit_ratio,
       COALESCE(fee_open_cost, 0) + COALESCE(fee_close_cost, 0) AS fees,
       COALESCE(funding_fees, 0) AS funding_fees, exit_reason, enter_tag
FROM trades
WHERE is_open = 0 AND close_date IS NOT NULL
ORDER BY close_date
"""


def load_closed_trades(db_path: str | Path) -> pd.DataFrame:
    """Lê os trades fechados do banco SQLite do Freqtrade (somente leitura)."""
    uri = f"file:{Path(db_path).resolve()}?mode=ro"
    with sqlite3.connect(uri, uri=True) as conn:
        df = pd.read_sql_query(QUERY, conn)
    for col in ("open_date", "close_date"):
        df[col] = pd.to_datetime(df[col], utc=True, format="mixed")
    df["is_short"] = df["is_short"].astype(bool)
    return df
