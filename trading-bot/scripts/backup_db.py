"""Backup consistente do banco de trades (pode rodar com o bot ligado).

Uso (ex.: no cron do servidor, todo dia às 03:00):
    0 3 * * * cd /opt/trading-bot && python3 scripts/backup_db.py >> user_data/logs/backup.log 2>&1
"""

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def backup(db: Path, dest_dir: Path, keep: int) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / f"{db.stem}-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.sqlite"
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as src, sqlite3.connect(target) as dst:
        src.backup(dst)
    for old in sorted(dest_dir.glob(f"{db.stem}-*.sqlite"))[:-keep]:
        old.unlink()
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--db", type=Path, default=ROOT / "user_data" / "tradesv3.sqlite")
    parser.add_argument("--dest", type=Path, default=ROOT / "backups")
    parser.add_argument("--keep", type=int, default=30, help="Quantos backups manter")
    args = parser.parse_args()
    if not args.db.exists():
        print(f"Banco não encontrado: {args.db}", file=sys.stderr)
        return 1
    print(f"Backup criado: {backup(args.db, args.dest, args.keep)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
