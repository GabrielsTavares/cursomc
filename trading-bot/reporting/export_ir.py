"""Exporta os trades fechados para CSV com valores em reais, para apoio à declaração do IR.

Gera dois arquivos (separador ";" e vírgula decimal, abrem direto no Excel em português):
    <prefixo>_trades.csv   um trade por linha, convertido pela cotação USDT/BRL do dia do fechamento
    <prefixo>_mensal.csv   resumo por mês

Uso:
    python -m reporting.export_ir --year 2026
    python -m reporting.export_ir --year 2026 --db user_data/tradesv3.sqlite --out user_data/ir/ir_2026

As regras de tributação de cripto mudam com frequência: confirme o enquadramento com um contador.
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

from reporting import binance_public
from reporting.trades_db import load_closed_trades

ROOT = Path(__file__).resolve().parent.parent


def to_brl(trades: pd.DataFrame, usdt_brl: pd.Series) -> pd.DataFrame:
    """Anexa a cotação USDT/BRL do dia do fechamento e os valores convertidos."""
    rates = usdt_brl.sort_index()
    day = trades["close_date"].dt.normalize()
    # Usa o fechamento do próprio dia; se faltar, o último disponível antes dele.
    lookup = rates.reindex(rates.index.union(pd.DatetimeIndex(day.unique()))).ffill()
    rate = lookup.reindex(day).to_numpy()
    out = pd.DataFrame(
        {
            "data_abertura": trades["open_date"].dt.strftime("%Y-%m-%d %H:%M"),
            "data_fechamento": trades["close_date"].dt.strftime("%Y-%m-%d %H:%M"),
            "par": trades["pair"],
            "direcao": trades["is_short"].map({True: "venda (short)", False: "compra (long)"}),
            "alavancagem": trades["leverage"],
            "preco_entrada": trades["open_rate"],
            "preco_saida": trades["close_rate"],
            "quantidade": trades["amount"],
            "margem_usdt": trades["stake_amount"],
            "taxas_usdt": trades["fees"],
            "funding_usdt": trades["funding_fees"],
            "resultado_usdt": trades["profit_abs"],
            "cotacao_usdt_brl": rate,
        }
    )
    out["resultado_brl"] = out["resultado_usdt"] * out["cotacao_usdt_brl"]
    out["taxas_brl"] = out["taxas_usdt"] * out["cotacao_usdt_brl"]
    out["motivo_saida"] = trades["exit_reason"]
    return out


def monthly_summary(rows: pd.DataFrame) -> pd.DataFrame:
    month = pd.to_datetime(rows["data_fechamento"]).dt.strftime("%Y-%m")
    grouped = rows.groupby(month)
    summary = pd.DataFrame(
        {
            "trades": grouped.size(),
            "ganhos_brl": grouped["resultado_brl"].apply(lambda s: s[s > 0].sum()),
            "perdas_brl": grouped["resultado_brl"].apply(lambda s: s[s < 0].sum()),
            "resultado_brl": grouped["resultado_brl"].sum(),
            "taxas_brl": grouped["taxas_brl"].sum(),
            "resultado_usdt": grouped["resultado_usdt"].sum(),
        }
    )
    summary.index.name = "mes"
    summary["resultado_acumulado_brl"] = summary["resultado_brl"].cumsum()
    return summary.reset_index()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--db", default=str(ROOT / "user_data" / "tradesv3.sqlite"))
    parser.add_argument("--out", help="Prefixo dos arquivos (padrão: user_data/ir/ir_<ano>)")
    args = parser.parse_args()

    trades = load_closed_trades(args.db)
    start = pd.Timestamp(f"{args.year}-01-01", tz="UTC")
    end = pd.Timestamp(f"{args.year + 1}-01-01", tz="UTC") - pd.Timedelta(seconds=1)
    trades = trades[(trades["close_date"] >= start) & (trades["close_date"] <= end)]
    if trades.empty:
        print(f"Nenhum trade fechado em {args.year}.")
        return 0

    usdt_brl = binance_public.daily_closes("USDTBRL", start - pd.Timedelta(days=7), end)
    rows = to_brl(trades, usdt_brl)
    summary = monthly_summary(rows)

    prefix = Path(args.out or ROOT / "user_data" / "ir" / f"ir_{args.year}")
    prefix.parent.mkdir(parents=True, exist_ok=True)
    csv_opts = {"sep": ";", "decimal": ",", "index": False, "encoding": "utf-8-sig"}
    usdt_cols = ["margem_usdt", "taxas_usdt", "funding_usdt", "resultado_usdt"]
    brl_cols = ["resultado_brl", "taxas_brl"]
    rows.round({**dict.fromkeys(usdt_cols, 4), **dict.fromkeys(brl_cols, 2), "cotacao_usdt_brl": 4}).to_csv(
        f"{prefix}_trades.csv", **csv_opts
    )
    summary.round(2).to_csv(f"{prefix}_mensal.csv", **csv_opts)
    print(f"{len(rows)} trades exportados para {prefix}_trades.csv e {prefix}_mensal.csv")
    print(f"Resultado no ano: R$ {rows['resultado_brl'].sum():.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
