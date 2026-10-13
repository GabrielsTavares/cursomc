"""Baixa candles de futuros USDT-M do data.binance.vision e grava no formato do Freqtrade.

Alternativa ao `freqtrade download-data` quando a API da Binance está bloqueada
(ex.: servidores nos EUA retornam HTTP 451). Também baixa mark price e funding,
que o backtest de futuros precisa.

Uso:
    python scripts/download_binance_vision.py --pairs BTC ETH SOL --start 2023-01 --end 2026-09
"""

import argparse
import io
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd
from freqtrade.data.history import get_datahandler
from freqtrade.enums import CandleType

BASE = "https://data.binance.vision/data/futures/um/monthly"
OHLCV_COLS = ["date", "open", "high", "low", "close", "volume"]


def months(start: str, end: str) -> list[str]:
    return [p.strftime("%Y-%m") for p in pd.period_range(start, end, freq="M")]


def fetch_csv(url: str) -> pd.DataFrame | None:
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None
        raise
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        content = zf.read(zf.namelist()[0])
    first_line = content.split(b"\n", 1)[0]
    has_header = not first_line[:1].isdigit()
    return pd.read_csv(io.BytesIO(content), header=0 if has_header else None)


def load_klines(kind: str, symbol: str, timeframe: str, month_list: list[str]) -> pd.DataFrame:
    frames = []
    for month in month_list:
        url = f"{BASE}/{kind}/{symbol}/{timeframe}/{symbol}-{timeframe}-{month}.zip"
        df = fetch_csv(url)
        if df is None:
            continue
        df = df.iloc[:, :6]
        df.columns = OHLCV_COLS
        frames.append(df)
    if not frames:
        return pd.DataFrame(columns=OHLCV_COLS)
    df = pd.concat(frames, ignore_index=True)
    df["date"] = pd.to_datetime(df["date"].astype("int64"), unit="ms", utc=True)
    df[OHLCV_COLS[1:]] = df[OHLCV_COLS[1:]].astype("float64")
    return df.drop_duplicates("date").sort_values("date").reset_index(drop=True)


def load_funding(symbol: str, month_list: list[str]) -> pd.DataFrame:
    frames = []
    for month in month_list:
        url = f"{BASE}/fundingRate/{symbol}/{symbol}-fundingRate-{month}.zip"
        df = fetch_csv(url)
        if df is not None:
            frames.append(df)
    if not frames:
        return pd.DataFrame(columns=["date", "funding_rate"])
    df = pd.concat(frames, ignore_index=True)
    date = pd.to_datetime(df["calc_time"].astype("int64"), unit="ms", utc=True).dt.floor("h")
    out = pd.DataFrame({"date": date, "funding_rate": df["last_funding_rate"].astype("float64")})
    return out.drop_duplicates("date").sort_values("date").reset_index(drop=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--pairs", nargs="+", required=True, help="Moedas base, ex.: BTC ETH SOL")
    parser.add_argument("--quote", default="USDT")
    parser.add_argument("--timeframes", nargs="+", default=["1h", "4h"])
    parser.add_argument("--start", required=True, help="Mês inicial AAAA-MM")
    parser.add_argument("--end", required=True, help="Mês final AAAA-MM")
    parser.add_argument("--datadir", default="user_data/data/binance")
    args = parser.parse_args()

    month_list = months(args.start, args.end)
    datadir = Path(args.datadir)
    (datadir / "futures").mkdir(parents=True, exist_ok=True)
    handler = get_datahandler(datadir, "feather")

    for base in args.pairs:
        symbol = f"{base}{args.quote}"
        pair = f"{base}/{args.quote}:{args.quote}"
        for tf in args.timeframes:
            df = load_klines("klines", symbol, tf, month_list)
            handler.ohlcv_store(pair, tf, df, CandleType.FUTURES)
            print(f"{pair} {tf} futures: {len(df)} candles")
        mark = load_klines("markPriceKlines", symbol, "1h", month_list)
        handler.ohlcv_store(pair, "1h", mark, CandleType.MARK)
        funding = load_funding(symbol, month_list)
        handler.ohlcv_store(pair, "1h", funding, CandleType.FUNDING_RATE)
        print(f"{pair} mark: {len(mark)} | funding: {len(funding)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
