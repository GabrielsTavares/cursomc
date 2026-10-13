import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "user_data" / "strategies"))

TRADE_COLUMNS = """
    id INTEGER PRIMARY KEY, pair TEXT, is_open BOOLEAN, is_short BOOLEAN, leverage FLOAT,
    open_date DATETIME, close_date DATETIME, open_rate FLOAT, close_rate FLOAT, amount FLOAT,
    stake_amount FLOAT, close_profit_abs FLOAT, close_profit FLOAT, fee_open_cost FLOAT,
    fee_close_cost FLOAT, funding_fees FLOAT, exit_reason TEXT, enter_tag TEXT
"""


@pytest.fixture
def trades_db(tmp_path: Path) -> Path:
    """Banco no mesmo formato da tabela `trades` do Freqtrade, com 3 fechados e 1 aberto."""
    path = tmp_path / "tradesv3.sqlite"
    with sqlite3.connect(path) as conn:
        conn.execute(f"CREATE TABLE trades ({TRADE_COLUMNS})")
        rows = [
            (1, "ETH/USDT:USDT", 0, 0, 2.0, "2026-01-05 08:00:00", "2026-01-07 12:00:00.123456",
             3000.0, 3150.0, 0.01, 15.0, 2.9, 0.19, 0.015, 0.016, -0.01, "trailing_stop_loss", "long"),
            (2, "SOL/USDT:USDT", 0, 1, 2.0, "2026-01-10 00:00:00", "2026-01-11 04:00:00",
             200.0, 206.0, 0.1, 10.0, -1.25, -0.12, 0.01, 0.01, 0.0, "stop_loss", "short"),
            (3, "XRP/USDT:USDT", 0, 0, 2.0, "2026-02-02 00:00:00", "2026-02-03 00:00:00",
             2.0, 2.1, 10.0, 10.0, 0.9, 0.09, 0.01, 0.01, 0.0, "channel_exit", "long"),
            (4, "ADA/USDT:USDT", 1, 0, 2.0, "2026-02-04 00:00:00", None,
             1.0, None, 10.0, 5.0, None, None, 0.01, None, 0.0, None, "long"),
        ]
        conn.executemany(f"INSERT INTO trades VALUES ({','.join('?' * 18)})", rows)
    return path
