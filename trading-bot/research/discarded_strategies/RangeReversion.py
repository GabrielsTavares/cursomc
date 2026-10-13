from datetime import datetime, timedelta

import talib.abstract as ta
from pandas import DataFrame

from freqtrade.persistence import Trade
from freqtrade.exchange import timeframe_to_minutes
from freqtrade.strategy import IStrategy, stoploss_from_absolute


class RangeReversion(IStrategy):
    """Reversão à média em mercado lateral (pesquisa, REPROVADA).

    Backtest 2022-2024, 8 pares de futuros, 1.990 USDT:
    4h: -17,9% (profit factor 0,74); 1h: -65,7% (profit factor 0,60).

    - Só opera sem tendência: ADX abaixo de `adx_max`.
    - Long quando fecha abaixo da banda inferior de Bollinger com RSI em sobrevenda;
      short no espelho. Sai ao tocar a média da banda.
    - Stop fixo em `atr_stop` x ATR a partir da entrada.
    """

    INTERFACE_VERSION = 3

    timeframe = "4h"
    can_short = True
    process_only_new_candles = True
    startup_candle_count = 220

    stoploss = -0.25
    use_custom_stoploss = True
    trailing_stop = False
    minimal_roi = {"0": 100}
    use_exit_signal = True

    max_leverage = 2.0
    risk_per_trade = 0.01
    max_stake_ratio = 0.35

    adx_max = 20
    rsi_low = 30
    rsi_high = 70
    atr_stop = 2.0
    max_hold_candles = 12

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        bands = ta.BBANDS(dataframe, timeperiod=20, nbdevup=2.0, nbdevdn=2.0)
        dataframe["bb_upper"] = bands["upperband"]
        dataframe["bb_mid"] = bands["middleband"]
        dataframe["bb_lower"] = bands["lowerband"]
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        ranging = (dataframe["adx"] < self.adx_max) & (dataframe["volume"] > 0)
        dataframe.loc[
            ranging & (dataframe["close"] < dataframe["bb_lower"]) & (dataframe["rsi"] < self.rsi_low),
            ["enter_long", "enter_tag"],
        ] = (1, "range_long")
        dataframe.loc[
            ranging & (dataframe["close"] > dataframe["bb_upper"]) & (dataframe["rsi"] > self.rsi_high),
            ["enter_short", "enter_tag"],
        ] = (1, "range_short")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[dataframe["high"] >= dataframe["bb_mid"], ["exit_long", "exit_tag"]] = (1, "mean_reached")
        dataframe.loc[dataframe["low"] <= dataframe["bb_mid"], ["exit_short", "exit_tag"]] = (1, "mean_reached")
        return dataframe

    def custom_exit(self, pair: str, trade: Trade, current_time: datetime, current_rate: float,
                    current_profit: float, **kwargs):
        if current_time - trade.open_date_utc >= timedelta(minutes=timeframe_to_minutes(self.timeframe) * self.max_hold_candles):
            return "time_exit"
        return None

    def custom_stoploss(self, pair: str, trade: Trade, current_time: datetime, current_rate: float,
                        current_profit: float, after_fill: bool, **kwargs) -> float | None:
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        signal = dataframe.loc[dataframe["date"] >= trade.open_date_utc - timedelta(minutes=timeframe_to_minutes(self.timeframe))]
        if signal.empty:
            return None
        atr = signal["atr"].iloc[0]
        offset = self.atr_stop * atr
        stop_rate = trade.open_rate + offset if trade.is_short else trade.open_rate - offset
        return stoploss_from_absolute(stop_rate, current_rate, is_short=trade.is_short, leverage=trade.leverage)

    def leverage(self, pair: str, current_time: datetime, current_rate: float, proposed_leverage: float,
                 max_leverage: float, entry_tag: str | None, side: str, **kwargs) -> float:
        return min(self.max_leverage, max_leverage)

    def custom_stake_amount(self, pair: str, current_time: datetime, current_rate: float,
                            proposed_stake: float, min_stake: float | None, max_stake: float,
                            leverage: float, entry_tag: str | None, side: str, **kwargs) -> float:
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        last = dataframe.iloc[-1]
        stop_distance = self.atr_stop * last["atr"] / last["close"]
        total = self.wallets.get_total_stake_amount()
        stake = total * self.risk_per_trade / (stop_distance * leverage)
        return min(stake, max_stake, total * self.max_stake_ratio)


class RangeReversion1h(RangeReversion):
    timeframe = "1h"
