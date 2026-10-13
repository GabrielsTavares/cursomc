import pytest

from DonchianAtrLongShort import DonchianAtrLongShort, position_stake, stop_price

S = DonchianAtrLongShort


def stop(is_short, open_rate, entry_atr, extreme, atr_now):
    return stop_price(is_short, open_rate, entry_atr, extreme, atr_now, S.atr_init, S.atr_trail,
                      S.max_stop_distance)


def test_initial_stop_uses_atr():
    assert stop(False, 100.0, 2.0, 100.0, 2.0) == pytest.approx(95.0)
    assert stop(True, 100.0, 2.0, 100.0, 2.0) == pytest.approx(105.0)


def test_initial_stop_is_capped_before_liquidation():
    # Short em SOL no colapso da FTX (09/11/2022): ATR enorme levaria o stop além da liquidação.
    open_rate, atr = 11.746, 2.958
    rate = stop(True, open_rate, atr, open_rate, atr)
    assert rate == pytest.approx(open_rate * (1 + S.max_stop_distance))
    liquidation_2x = open_rate * 1.48
    assert rate < liquidation_2x


def test_chandelier_trails_in_favour():
    # Long: preço foi a 130 com ATR 3 => chandelier 121, acima do stop inicial 95.
    assert stop(False, 100.0, 2.0, 130.0, 3.0) == pytest.approx(121.0)
    # Short: mínima 70 com ATR 3 => chandelier 79, abaixo do stop inicial 105.
    assert stop(True, 100.0, 2.0, 70.0, 3.0) == pytest.approx(79.0)


def test_position_stake_risks_target_fraction():
    stake = position_stake(total=2000, stop_distance=0.05, leverage=2, risk_per_trade=0.01,
                           cap=700, min_stake=5, max_stop_distance=0.10)
    assert stake == pytest.approx(200)
    assert stake * 2 * 0.05 == pytest.approx(20)  # perda no stop = 1% de 2000


def test_position_stake_respects_cap():
    assert position_stake(2000, 0.005, 2, 0.01, 700, 5, 0.10) == 700


def test_position_stake_skips_extreme_volatility():
    assert position_stake(2000, 0.15, 2, 0.01, 700, 5, 0.10) == 0


def test_small_account_accepts_exchange_minimum_within_twice_target_risk():
    # 99 USDT, stop 6%: alvo 8,25 de margem; mínimo de 10,5 => risco real 1,27% (aceito).
    assert position_stake(99, 0.06, 2, 0.01, 34.65, 10.5, 0.10) == 10.5


def test_small_account_skips_when_minimum_is_too_risky():
    # Mínimo de 21 com stop de 6% => risco real 2,5% (> 2%): pula a entrada.
    assert position_stake(99, 0.06, 2, 0.01, 34.65, 21.0, 0.10) == 0
