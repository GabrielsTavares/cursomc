from datetime import datetime, timedelta

import talib.abstract as ta
from pandas import DataFrame

from freqtrade.persistence import Trade
from freqtrade.strategy import IStrategy, stoploss_from_absolute


def stop_price(
    is_short: bool,
    open_rate: float,
    entry_atr: float,
    extreme_since_entry: float,
    atr_now: float,
    atr_init: float,
    atr_trail: float,
    max_stop_distance: float,
) -> float:
    """Preço do stop: o mais protetor entre o stop inicial (limitado) e o chandelier."""
    initial_offset = min(atr_init * entry_atr, max_stop_distance * open_rate)
    if is_short:
        return min(open_rate + initial_offset, extreme_since_entry + atr_trail * atr_now)
    return max(open_rate - initial_offset, extreme_since_entry - atr_trail * atr_now)


def position_stake(
    total: float,
    stop_distance: float,
    leverage: float,
    risk_per_trade: float,
    cap: float,
    min_stake: float | None,
    max_stop_distance: float,
) -> float:
    """Margem para perder `risk_per_trade` do saldo até o stop. Retorna 0 para pular a entrada."""
    if total <= 0 or stop_distance <= 0 or stop_distance > max_stop_distance:
        return 0
    stake = total * risk_per_trade / (stop_distance * leverage)
    if min_stake and stake < min_stake:
        # Conta pequena: aceita o mínimo da corretora só se o risco real ficar até 2x o alvo.
        real_risk = min_stake * leverage * stop_distance / total
        return min_stake if real_risk <= risk_per_trade * 2 and min_stake <= cap else 0
    return min(stake, cap)


class DonchianAtrLongShort(IStrategy):
    """Rompimento de canal (Donchian) a favor do regime, long e short, em futuros USDT-M.

    - Regime: EMA 50 vs EMA 200 no próprio 4h.
    - Entrada: fechamento rompe a máxima (long) ou mínima (short) dos últimos `entry_period` candles.
    - Stop inicial: `atr_init` x ATR, limitado a `max_stop_distance` do preço. Depois vira um
      chandelier stop: extremo desde a entrada menos `atr_trail` x ATR, que só anda a favor.
    - Não entra quando a volatilidade exigiria stop maior que `max_stop_distance` (ex.: crashes).
    - Saída por sinal: fechamento rompe o canal curto contrário (`exit_period`).
    - Tamanho de posição: arrisca `risk_per_trade` do saldo até o stop inicial.
    """

    INTERFACE_VERSION = 3

    timeframe = "4h"
    can_short = True
    process_only_new_candles = True
    startup_candle_count = 220

    # Rede de segurança relativa ao stake (2x => 12,5% do preço); o stop efetivo é o custom_stoploss.
    stoploss = -0.25
    use_custom_stoploss = True
    trailing_stop = False
    minimal_roi = {"0": 100}

    use_exit_signal = True
    exit_profit_only = False

    max_leverage = 2.0
    risk_per_trade = 0.01
    max_stake_ratio = 0.35
    # Precisa ficar bem abaixo da distância de liquidação (~48% com 2x isolado).
    max_stop_distance = 0.10

    entry_period = 20
    exit_period = 10
    atr_init = 2.5
    atr_trail = 3.0
    adx_min = 20

    @property
    def protections(self):
        return [
            {"method": "CooldownPeriod", "stop_duration_candles": 1},
            {
                "method": "StoplossGuard",
                "lookback_period_candles": 6,
                "trade_limit": 3,
                "stop_duration_candles": 6,
                "only_per_pair": False,
            },
            {
                # Aproxima um limite de perda diária: pausa entradas por 24h se cair 3% em 24h.
                "method": "MaxDrawdown",
                "lookback_period_candles": 6,
                "trade_limit": 1,
                "stop_duration_candles": 6,
                "max_allowed_drawdown": 0.03,
            },
            {
                "method": "MaxDrawdown",
                "lookback_period_candles": 6 * 30,
                "trade_limit": 5,
                "stop_duration_candles": 6 * 7,
                "max_allowed_drawdown": 0.12,
            },
        ]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        dataframe["dc_high"] = dataframe["high"].rolling(self.entry_period).max().shift(1)
        dataframe["dc_low"] = dataframe["low"].rolling(self.entry_period).min().shift(1)
        dataframe["exit_high"] = dataframe["high"].rolling(self.exit_period).max().shift(1)
        dataframe["exit_low"] = dataframe["low"].rolling(self.exit_period).min().shift(1)
        dataframe["stop_distance"] = self.atr_init * dataframe["atr"] / dataframe["close"]
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        bull = (dataframe["ema50"] > dataframe["ema200"]) & (dataframe["close"] > dataframe["ema200"])
        bear = (dataframe["ema50"] < dataframe["ema200"]) & (dataframe["close"] < dataframe["ema200"])
        tradable = (
            (dataframe["adx"] > self.adx_min)
            & (dataframe["stop_distance"] <= self.max_stop_distance)
            & (dataframe["volume"] > 0)
        )

        dataframe.loc[
            bull & tradable & (dataframe["close"] > dataframe["dc_high"]),
            ["enter_long", "enter_tag"],
        ] = (1, "donchian_breakout_long")
        dataframe.loc[
            bear & tradable & (dataframe["close"] < dataframe["dc_low"]),
            ["enter_short", "enter_tag"],
        ] = (1, "donchian_breakout_short")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[dataframe["close"] < dataframe["exit_low"], ["exit_long", "exit_tag"]] = (
            1,
            "channel_exit",
        )
        dataframe.loc[dataframe["close"] > dataframe["exit_high"], ["exit_short", "exit_tag"]] = (
            1,
            "channel_exit",
        )
        return dataframe

    def custom_stoploss(
        self,
        pair: str,
        trade: Trade,
        current_time: datetime,
        current_rate: float,
        current_profit: float,
        after_fill: bool,
        **kwargs,
    ) -> float | None:
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        if dataframe.empty:
            return None

        since_entry = dataframe.loc[dataframe["date"] >= trade.open_date_utc - timedelta(hours=4)]
        if since_entry.empty:
            return None

        extreme = since_entry["low"].min() if trade.is_short else since_entry["high"].max()
        rate = stop_price(
            is_short=trade.is_short,
            open_rate=trade.open_rate,
            entry_atr=since_entry["atr"].iloc[0],
            extreme_since_entry=extreme,
            atr_now=dataframe["atr"].iloc[-1],
            atr_init=self.atr_init,
            atr_trail=self.atr_trail,
            max_stop_distance=self.max_stop_distance,
        )
        return stoploss_from_absolute(rate, current_rate, is_short=trade.is_short, leverage=trade.leverage)

    def leverage(
        self,
        pair: str,
        current_time: datetime,
        current_rate: float,
        proposed_leverage: float,
        max_leverage: float,
        entry_tag: str | None,
        side: str,
        **kwargs,
    ) -> float:
        return min(self.max_leverage, max_leverage)

    def custom_stake_amount(
        self,
        pair: str,
        current_time: datetime,
        current_rate: float,
        proposed_stake: float,
        min_stake: float | None,
        max_stake: float,
        leverage: float,
        entry_tag: str | None,
        side: str,
        **kwargs,
    ) -> float:
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        if dataframe.empty:
            return 0
        total = self.wallets.get_total_stake_amount()
        return position_stake(
            total=total,
            stop_distance=dataframe["stop_distance"].iloc[-1],
            leverage=leverage,
            risk_per_trade=self.risk_per_trade,
            cap=min(max_stake, total * self.max_stake_ratio),
            min_stake=min_stake,
            max_stop_distance=self.max_stop_distance,
        )
