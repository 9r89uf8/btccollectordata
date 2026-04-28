# Decision Historical Replay Report

Generated at: 2026-04-28T01:14:43.288Z
Decision version: decision-v0.1
Mode: leave-day-out
Markets replayed: 1000
Market data batch size: 50
Analytics rows loaded: 3467
Stability rows loaded: 3465

This run uses leave-day-out priors: each market is scored with priors rebuilt without markets from that UTC day.

## Summary

| Metric | Value |
| --- | --- |
| Total evaluations | 5000 |
| WAIT count | 5000 |
| ENTER_UP count | 0 |
| ENTER_DOWN count | 0 |
| Average p_est | n/a |
| Average ask | n/a |
| Average edge | n/a |
| Win rate | n/a |
| Estimated gross PnL | 0.000 |
| Estimated fee/slippage-adjusted PnL (0.010 cost/entry) | 0.000 |
| Max losing streak | 0 |
| Missed entries due to no official price-to-beat | 0 |
| Missed entries due to stale/gap snapshots | 4 |
| Snapshot cap warnings | 0 |

## WAIT Count By Reason

| Reason | Count |
| --- | --- |
| distance_too_small | 2552 |
| no_ev_against_top_ask | 1123 |
| inside_noise_band | 485 |
| recent_lock | 472 |
| too_many_soft_risks | 173 |
| leader_ask_missing | 92 |
| p_est_below_minimum | 82 |
| btc_too_old | 11 |
| weak_coverage | 6 |
| missed_checkpoint_window_no_snapshot | 4 |

## WAIT Gate Diagnostics

| Reason | N | Avg p_est | Avg ask | Avg edge | Avg req edge | Avg abs bps | Avg req bps | Avg spread |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| distance_too_small | 2552 | n/a | n/a | n/a | n/a | 2.772 | 6.698 | n/a |
| no_ev_against_top_ask | 1123 | 86.6% | 0.990 | -0.124 | 0.053 | 9.498 | 4.877 | 0.980 |
| inside_noise_band | 485 | n/a | n/a | n/a | n/a | 0.252 | n/a | n/a |
| recent_lock | 472 | n/a | n/a | n/a | n/a | 2.014 | n/a | n/a |
| too_many_soft_risks | 173 | n/a | n/a | n/a | n/a | 3.112 | n/a | n/a |
| leader_ask_missing | 92 | 89.5% | n/a | n/a | 0.049 | 24.922 | 4.625 | n/a |
| p_est_below_minimum | 82 | 78.4% | n/a | n/a | n/a | 10.380 | 7.360 | n/a |
| btc_too_old | 11 | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| weak_coverage | 6 | n/a | n/a | n/a | n/a | 2.114 | n/a | n/a |
| missed_checkpoint_window_no_snapshot | 4 | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

## Top No-EV Rejections By Edge

| Market | Checkpoint | Leader | p_est | Ask | Edge | Req Edge | Abs Bps | Req Bps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| btc-updown-5m-1777135200 | 240 | up | 92.2% | 0.990 | -0.068 | 0.040 | 12.414 | 4.000 |
| btc-updown-5m-1777132800 | 240 | up | 92.2% | 0.990 | -0.068 | 0.040 | 10.064 | 4.000 |
| btc-updown-5m-1777116000 | 240 | down | 92.2% | 0.990 | -0.068 | 0.040 | 11.877 | 4.000 |
| btc-updown-5m-1777246800 | 240 | up | 91.9% | 0.990 | -0.071 | 0.040 | 14.035 | 4.000 |
| btc-updown-5m-1777243500 | 240 | up | 91.9% | 0.990 | -0.071 | 0.040 | 10.413 | 4.000 |
| btc-updown-5m-1777241100 | 240 | up | 91.9% | 0.990 | -0.071 | 0.040 | 18.221 | 4.000 |
| btc-updown-5m-1777232400 | 240 | up | 91.9% | 0.990 | -0.071 | 0.040 | 11.425 | 4.000 |
| btc-updown-5m-1777227300 | 240 | up | 91.9% | 0.990 | -0.071 | 0.050 | 14.953 | 5.000 |
| btc-updown-5m-1777222800 | 240 | down | 91.9% | 0.990 | -0.071 | 0.040 | 10.073 | 4.000 |
| btc-updown-5m-1777215000 | 240 | up | 91.9% | 0.990 | -0.071 | 0.040 | 13.742 | 4.000 |

## Calibration By p_est Bucket

_No rows._

## Win Rate By Checkpoint

_No rows._

## Win Rate By Distance Bucket

_No rows._

## Win Rate By Risk Flag

_No rows._

## Training Fold Sizes

| Fold | Analytics N | Stability N |
| --- | --- | --- |
| 2026-04-28 | 3453 | 3453 |
| 2026-04-27 | 3179 | 3177 |
| 2026-04-26 | 3179 | 3177 |
| 2026-04-25 | 3179 | 3177 |
| 2026-04-24 | 3179 | 3177 |

## Market Errors

_No rows._

## Data Warnings

_No rows._
