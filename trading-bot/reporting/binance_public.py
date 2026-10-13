import json
import urllib.request

import pandas as pd

# Endpoint só de dados de mercado: não exige chave e não é bloqueado por região.
BASE_URL = "https://data-api.binance.vision/api/v3/klines"
DAY_MS = 86_400_000


def daily_closes(symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Fechamentos diários (UTC) de um par spot da Binance entre `start` e `end`."""
    start_ms = int(start.normalize().timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)
    rows: list[list] = []
    while start_ms <= end_ms:
        url = f"{BASE_URL}?symbol={symbol}&interval=1d&startTime={start_ms}&endTime={end_ms}&limit=1000"
        with urllib.request.urlopen(url, timeout=30) as resp:
            batch = json.load(resp)
        if not batch:
            break
        rows.extend(batch)
        start_ms = batch[-1][0] + DAY_MS
    if not rows:
        return pd.Series(dtype="float64")
    index = pd.to_datetime([r[0] for r in rows], unit="ms", utc=True)
    return pd.Series([float(r[4]) for r in rows], index=index, name=symbol)
