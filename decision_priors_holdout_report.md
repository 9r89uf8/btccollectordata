# Decision Priors Holdout Report

Generated: 2026-04-27T19:44:45.173Z

Phase: 1 holdout validation before encoding decision constants.

## Versions

| Item | Version |
| --- | --- |
| market analytics | 3 |
| stability analytics | 4 |
| dashboard rollup | 5 |

## Executive Summary

| Metric | Value |
| --- | --- |
| All target empirical leader win rate | 81.2% |
| Training-prior weighted target win rate | 81.2% |
| Held-out target win rate for training-prior comparison | 81.2% |
| Training-prior comparison observations | 15708 |
| Scored p_est observations | 15708 |
| Unscored p_est observations | 0 |
| Scored p_est average | 77.5% |
| Scored p_est empirical win rate | 81.2% |
| Scored p_est calibration error | 0.037 |

No held-out p_est observations were dropped for insufficient base-prior support.

Cell drift summary:

| Source | Cells | Usable | Warning | Ignored | Holdout N | Mean abs drift | P90 abs drift |
| --- | --- | --- | --- | --- | --- | --- | --- |
| base | 40 | 40 | 0 | 0 | 15708 | 6.2% | 9.8% |
| chop | 128 | 73 | 37 | 18 | 15708 | 10.9% | 17.5% |
| leaderAge | 206 | 37 | 50 | 119 | 15708 | 17.0% | 30.2% |
| momentum | 128 | 71 | 47 | 10 | 15708 | 10.1% | 16.4% |
| prePathShape | 30 | 20 | 5 | 5 | 15708 | 5.3% | 10.8% |
| risk | 18 | 13 | 5 | 0 | 12712 | 8.1% | 16.7% |

## Dataset

| Metric | Value |
| --- | --- |
| market_analytics rows | 3401 |
| clean market_analytics rows | 3371 |
| market_stability_analytics rows | 3399 |
| clean market_stability_analytics rows | 3371 |
| target checkpoint observations outside 0.5 bps band | 15708 |
| target checkpoint stability observations outside 0.5 bps band | 15708 |
| leave-one-day-out folds | 12 |

Clean analytics rows by day:

| Day | Clean rows |
| --- | --- |
| 2026-04-16 | 270 |
| 2026-04-17 | 288 |
| 2026-04-18 | 288 |
| 2026-04-19 | 288 |
| 2026-04-20 | 288 |
| 2026-04-21 | 288 |
| 2026-04-22 | 288 |
| 2026-04-23 | 285 |
| 2026-04-24 | 278 |
| 2026-04-25 | 288 |
| 2026-04-26 | 288 |
| 2026-04-27 | 234 |

## Method

- Validation uses leave-one-day-out folds.
- Each fold rebuilds the dashboard-shaped training inputs from all non-holdout days.
- Chop and pre-path-shape rank thresholds are fitted on training days only.
- Held-out rows are projected onto the training-day empirical rank distributions.
- Split priors are shrunk toward the checkpoint x distance base prior before p_est calibration.
- Split priors can reduce p_est, but cannot increase p_est above p_base.
- Usable cells require N >= 100; warning-only cells require 50 <= N < 100; ignored cells have N < 50.
- Shrinkage K: 200.

## Dashboard Rollup Sanity

The holdout script rebuilds dashboard-shaped priors locally. This panel checks the all-data dashboard builder output against the rows used by the holdout, and shows the training-fold rank-threshold range.

| Metric | Value |
| --- | --- |
| dashboard clean analytics rows | 3371 |
| holdout clean analytics rows | 3371 |
| dashboard clean stability rows | 3371 |
| holdout clean stability rows | 3371 |

| Rank threshold | All-data dashboard | Fold mean | Fold min | Fold max |
| --- | --- | --- | --- | --- |
| lowThreshold | 0.386 | 0.387 | 0.376 | 0.392 |
| highThreshold | 0.613 | 0.612 | 0.608 | 0.624 |
| nearLineHighThreshold | 0.667 | 0.668 | 0.667 | 0.673 |
| oscillationHighThreshold | 0.666 | 0.666 | 0.643 | 0.678 |

## Calibration By p_est Bucket

Support tiers use the same Phase 1 floors as prior cells. Fold metrics are unweighted averages across folds where the bucket appeared.

| p_est bucket | Tier | Pooled N | Pooled avg p_est | Pooled win | Pooled error | Folds | Mean fold p_est | Mean fold win | Mean fold error | Mean abs fold error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0_70_0_75 | usable | 1836 | 72.2% | 74.0% | 0.018 | 12 | 72.2% | 73.8% | 0.017 | 0.051 |
| 0_75_0_80 | usable | 2824 | 77.7% | 82.8% | 0.051 | 12 | 77.7% | 82.9% | 0.053 | 0.058 |
| 0_80_0_85 | usable | 1970 | 82.6% | 85.7% | 0.031 | 12 | 82.6% | 86.2% | 0.037 | 0.048 |
| 0_85_0_90 | usable | 3914 | 87.7% | 93.3% | 0.056 | 12 | 87.7% | 93.5% | 0.059 | 0.059 |
| 0_90_0_95 | usable | 1188 | 91.3% | 96.5% | 0.053 | 12 | 91.3% | 96.9% | 0.056 | 0.056 |
| 0_95_1_00 | ignored | 8 | 96.8% | 87.5% | -0.093 | 6 | 96.9% | 91.7% | -0.052 | 0.105 |
| lt_0_70 | usable | 3968 | 63.0% | 64.7% | 0.016 | 12 | 63.1% | 64.1% | 0.010 | 0.041 |

Per-fold calibration detail:

| Fold | p_est bucket | N | Average p_est | Win rate | Error |
| --- | --- | --- | --- | --- | --- |
| 2026-04-16 | 0_70_0_75 | 162 | 71.9% | 72.8% | 0.009 |
| 2026-04-16 | 0_75_0_80 | 246 | 77.5% | 85.0% | 0.075 |
| 2026-04-16 | 0_80_0_85 | 167 | 82.3% | 86.8% | 0.045 |
| 2026-04-16 | 0_85_0_90 | 375 | 87.5% | 91.7% | 0.042 |
| 2026-04-16 | 0_90_0_95 | 129 | 91.4% | 93.8% | 0.024 |
| 2026-04-16 | 0_95_1_00 | 1 | 96.7% | 100.0% | 0.033 |
| 2026-04-16 | lt_0_70 | 201 | 62.7% | 66.2% | 0.035 |
| 2026-04-17 | 0_70_0_75 | 133 | 72.2% | 60.9% | -0.113 |
| 2026-04-17 | 0_75_0_80 | 279 | 77.9% | 79.9% | 0.020 |
| 2026-04-17 | 0_80_0_85 | 195 | 82.8% | 83.1% | 0.003 |
| 2026-04-17 | 0_85_0_90 | 397 | 88.1% | 90.9% | 0.028 |
| 2026-04-17 | 0_90_0_95 | 108 | 91.4% | 96.3% | 0.049 |
| 2026-04-17 | 0_95_1_00 | 1 | 98.0% | 100.0% | 0.020 |
| 2026-04-17 | lt_0_70 | 237 | 62.8% | 57.0% | -0.058 |
| 2026-04-18 | 0_70_0_75 | 131 | 71.8% | 76.3% | 0.046 |
| 2026-04-18 | 0_75_0_80 | 236 | 77.4% | 86.9% | 0.094 |
| 2026-04-18 | 0_80_0_85 | 167 | 82.3% | 92.2% | 0.099 |
| 2026-04-18 | 0_85_0_90 | 338 | 87.7% | 91.1% | 0.034 |
| 2026-04-18 | 0_90_0_95 | 78 | 91.3% | 94.9% | 0.035 |
| 2026-04-18 | lt_0_70 | 391 | 62.8% | 72.1% | 0.094 |
| 2026-04-19 | 0_70_0_75 | 165 | 73.0% | 80.0% | 0.070 |
| 2026-04-19 | 0_75_0_80 | 223 | 77.4% | 87.9% | 0.105 |
| 2026-04-19 | 0_80_0_85 | 179 | 82.7% | 86.0% | 0.033 |
| 2026-04-19 | 0_85_0_90 | 363 | 87.6% | 95.6% | 0.080 |
| 2026-04-19 | 0_90_0_95 | 102 | 91.1% | 96.1% | 0.050 |
| 2026-04-19 | lt_0_70 | 322 | 63.2% | 70.5% | 0.073 |
| 2026-04-20 | 0_70_0_75 | 121 | 72.3% | 79.3% | 0.071 |
| 2026-04-20 | 0_75_0_80 | 220 | 77.6% | 78.6% | 0.010 |
| 2026-04-20 | 0_80_0_85 | 180 | 82.9% | 80.0% | -0.029 |
| 2026-04-20 | 0_85_0_90 | 423 | 87.8% | 92.4% | 0.047 |
| 2026-04-20 | 0_90_0_95 | 145 | 91.6% | 94.5% | 0.029 |
| 2026-04-20 | 0_95_1_00 | 2 | 97.0% | 50.0% | -0.470 |
| 2026-04-20 | lt_0_70 | 289 | 63.1% | 63.3% | 0.002 |
| 2026-04-21 | 0_70_0_75 | 118 | 72.4% | 68.6% | -0.038 |
| 2026-04-21 | 0_75_0_80 | 273 | 77.7% | 78.4% | 0.007 |
| 2026-04-21 | 0_80_0_85 | 209 | 82.9% | 85.6% | 0.028 |
| 2026-04-21 | 0_85_0_90 | 396 | 87.7% | 94.7% | 0.070 |
| 2026-04-21 | 0_90_0_95 | 135 | 91.4% | 97.8% | 0.064 |
| 2026-04-21 | lt_0_70 | 244 | 63.8% | 59.0% | -0.048 |
| 2026-04-22 | 0_70_0_75 | 150 | 72.0% | 72.0% | -0.000 |
| 2026-04-22 | 0_75_0_80 | 254 | 77.8% | 78.7% | 0.010 |
| 2026-04-22 | 0_80_0_85 | 167 | 82.6% | 85.6% | 0.030 |
| 2026-04-22 | 0_85_0_90 | 322 | 87.5% | 95.0% | 0.075 |
| 2026-04-22 | 0_90_0_95 | 101 | 91.0% | 98.0% | 0.071 |
| 2026-04-22 | 0_95_1_00 | 1 | 97.0% | 100.0% | 0.030 |
| 2026-04-22 | lt_0_70 | 353 | 63.1% | 65.4% | 0.023 |
| 2026-04-23 | 0_70_0_75 | 135 | 72.3% | 73.3% | 0.011 |
| 2026-04-23 | 0_75_0_80 | 256 | 77.8% | 82.0% | 0.042 |
| 2026-04-23 | 0_80_0_85 | 192 | 82.6% | 80.7% | -0.019 |
| 2026-04-23 | 0_85_0_90 | 360 | 87.7% | 91.9% | 0.042 |
| 2026-04-23 | 0_90_0_95 | 154 | 91.0% | 97.4% | 0.064 |
| 2026-04-23 | 0_95_1_00 | 2 | 96.5% | 100.0% | 0.035 |
| 2026-04-23 | lt_0_70 | 252 | 63.6% | 57.5% | -0.061 |
| 2026-04-24 | 0_70_0_75 | 148 | 72.3% | 68.2% | -0.041 |
| 2026-04-24 | 0_75_0_80 | 213 | 78.0% | 75.1% | -0.029 |
| 2026-04-24 | 0_80_0_85 | 169 | 82.4% | 80.5% | -0.019 |
| 2026-04-24 | 0_85_0_90 | 356 | 87.8% | 93.8% | 0.060 |
| 2026-04-24 | 0_90_0_95 | 100 | 91.3% | 98.0% | 0.067 |
| 2026-04-24 | lt_0_70 | 311 | 63.6% | 61.7% | -0.018 |
| 2026-04-25 | 0_70_0_75 | 244 | 71.7% | 70.5% | -0.012 |
| 2026-04-25 | 0_75_0_80 | 191 | 77.6% | 84.8% | 0.072 |
| 2026-04-25 | 0_80_0_85 | 89 | 82.4% | 93.3% | 0.108 |
| 2026-04-25 | 0_85_0_90 | 85 | 87.4% | 94.1% | 0.067 |
| 2026-04-25 | 0_90_0_95 | 18 | 91.2% | 100.0% | 0.088 |
| 2026-04-25 | lt_0_70 | 631 | 62.4% | 62.9% | 0.005 |
| 2026-04-26 | 0_70_0_75 | 205 | 72.3% | 83.4% | 0.111 |
| 2026-04-26 | 0_75_0_80 | 231 | 77.5% | 91.3% | 0.139 |
| 2026-04-26 | 0_80_0_85 | 103 | 82.3% | 87.4% | 0.051 |
| 2026-04-26 | 0_85_0_90 | 210 | 87.3% | 96.2% | 0.089 |
| 2026-04-26 | 0_90_0_95 | 34 | 91.4% | 97.1% | 0.057 |
| 2026-04-26 | 0_95_1_00 | 1 | 96.0% | 100.0% | 0.040 |
| 2026-04-26 | lt_0_70 | 482 | 63.0% | 68.7% | 0.057 |
| 2026-04-27 | 0_70_0_75 | 124 | 72.1% | 80.6% | 0.086 |
| 2026-04-27 | 0_75_0_80 | 202 | 77.6% | 86.6% | 0.090 |
| 2026-04-27 | 0_80_0_85 | 153 | 82.7% | 93.5% | 0.108 |
| 2026-04-27 | 0_85_0_90 | 289 | 87.7% | 94.8% | 0.071 |
| 2026-04-27 | 0_90_0_95 | 84 | 91.1% | 98.8% | 0.077 |
| 2026-04-27 | lt_0_70 | 255 | 63.1% | 65.1% | 0.020 |

## Phase 2 Readout

Default clean-threshold cells from the combined plan:

| Cell | Tier | N | All-data win | Mean fold drift |
| --- | --- | --- | --- | --- |
| T+180 5_7_5 | usable | 506 | 82.4% | 4.0% |
| T+200 5_7_5 | usable | 529 | 85.3% | 5.2% |
| T+210 4_5 | usable | 249 | 83.1% | 10.3% |
| T+220 4_5 | usable | 261 | 82.0% | 8.9% |
| T+240 4_5 | usable | 263 | 89.0% | 7.2% |

Risk readout:

| Cell | Tier | N | All-data win | Mean fold drift |
| --- | --- | --- | --- | --- |
| all recent_lock | usable | 421 | 67.0% | 8.2% |
| T+180 recent_lock | warning-only | 56 | 55.4% | 22.8% |
| T+240 recent_lock | warning-only | 97 | 74.2% | 8.2% |
| all near_line_heavy | usable | 1614 | 72.7% | 6.7% |
| all momentum_against | usable | 4273 | 77.9% | 2.6% |

Interpretation for Phase 2:

- The clean base threshold cells are all usable and clear the 0.80 probability floor.
- Recent-lock remains a hard-veto candidate: aggregate performance is materially below the entry floor, and per-checkpoint recent-lock cells are only warning-only support.
- Near-line-heavy remains a meaningful risk flag; aggregate performance is below the entry floor before distance and EV filters.
- Momentum-against remains a risk flag, especially before T+220.
- Leader-age split support is uneven, so only high-support leader-age cells should be eligible to reduce p_est in v0.
- Held-out p_est is under-confident by 0.037 on aggregate (77.5% estimated vs. 81.2% empirical).
- This conservatism supports the min-of-priors design; it should not be used to let split priors raise p_est above base priors.

## Fold Summary

| Holdout day | Rows | Base obs | Stability obs | Train rank entries | p_est N | Unscored | Avg p_est | Win rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-04-16 | 270 | 1281 | 1281 | 15495 | 1281 | 0 | 79.4% | 83.6% |
| 2026-04-17 | 288 | 1350 | 1350 | 15405 | 1350 | 0 | 79.5% | 79.0% |
| 2026-04-18 | 288 | 1341 | 1341 | 15405 | 1341 | 0 | 76.6% | 83.7% |
| 2026-04-19 | 288 | 1354 | 1354 | 15405 | 1354 | 0 | 78.0% | 85.2% |
| 2026-04-20 | 288 | 1380 | 1380 | 15405 | 1380 | 0 | 79.4% | 81.5% |
| 2026-04-21 | 288 | 1375 | 1375 | 15405 | 1375 | 0 | 79.8% | 81.8% |
| 2026-04-22 | 288 | 1348 | 1348 | 15405 | 1348 | 0 | 77.2% | 80.7% |
| 2026-04-23 | 285 | 1351 | 1351 | 15420 | 1351 | 0 | 79.5% | 80.8% |
| 2026-04-24 | 278 | 1297 | 1297 | 15460 | 1297 | 0 | 78.2% | 78.7% |
| 2026-04-25 | 288 | 1258 | 1258 | 15410 | 1258 | 0 | 70.1% | 72.5% |
| 2026-04-26 | 288 | 1266 | 1266 | 15405 | 1266 | 0 | 73.5% | 82.1% |
| 2026-04-27 | 234 | 1107 | 1107 | 15675 | 1107 | 0 | 78.0% | 85.0% |

## Live Usability

Usable cells require N >= 100; warning-only cells require 50 <= N < 100; ignored cells have N < 50.

Usable cells:

| Source | Cell | N | All-data win | Mean fold drift |
| --- | --- | --- | --- | --- |
| base | T+180 0_5_1 | 253 | 55.3% | 9.8% |
| base | T+180 1_2 | 439 | 61.0% | 6.9% |
| base | T+180 2_3 | 371 | 63.9% | 7.2% |
| base | T+180 3_4 | 341 | 76.2% | 5.5% |
| base | T+180 4_5 | 280 | 80.0% | 10.5% |
| base | T+180 5_7_5 | 506 | 82.4% | 4.0% |
| base | T+180 7_5_10 | 326 | 89.0% | 5.5% |
| base | T+180 gt_10 | 599 | 94.8% | 1.6% |
| base | T+200 0_5_1 | 234 | 62.8% | 5.8% |
| base | T+200 1_2 | 432 | 63.4% | 6.0% |
| base | T+200 2_3 | 373 | 66.8% | 6.8% |
| base | T+200 3_4 | 319 | 77.4% | 9.2% |
| base | T+200 4_5 | 261 | 80.5% | 9.4% |
| base | T+200 5_7_5 | 529 | 85.3% | 5.2% |
| base | T+200 7_5_10 | 346 | 88.4% | 4.7% |
| base | T+200 gt_10 | 652 | 96.8% | 1.2% |
| base | T+210 0_5_1 | 221 | 53.8% | 9.6% |
| base | T+210 1_2 | 424 | 64.9% | 7.4% |
| base | T+210 2_3 | 356 | 70.8% | 5.9% |
| base | T+210 3_4 | 333 | 77.5% | 10.2% |
| base | T+210 4_5 | 249 | 83.1% | 10.3% |
| base | T+210 5_7_5 | 540 | 86.7% | 3.2% |
| base | T+210 7_5_10 | 336 | 91.7% | 6.2% |
| base | T+210 gt_10 | 687 | 96.4% | 1.5% |
| base | T+220 0_5_1 | 217 | 59.0% | 5.6% |
| base | T+220 1_2 | 410 | 67.8% | 5.9% |
| base | T+220 2_3 | 372 | 72.8% | 6.2% |
| base | T+220 3_4 | 315 | 78.4% | 9.8% |
| base | T+220 4_5 | 261 | 82.0% | 8.9% |
| base | T+220 5_7_5 | 513 | 88.7% | 4.4% |
| base | T+220 7_5_10 | 374 | 91.7% | 3.5% |
| base | T+220 gt_10 | 692 | 97.7% | 1.7% |
| base | T+240 0_5_1 | 201 | 67.2% | 8.9% |
| base | T+240 1_2 | 399 | 71.4% | 10.8% |
| base | T+240 2_3 | 371 | 71.2% | 6.8% |
| base | T+240 3_4 | 310 | 80.0% | 6.4% |
| base | T+240 4_5 | 263 | 89.0% | 7.2% |
| base | T+240 5_7_5 | 517 | 89.2% | 3.2% |
| base | T+240 7_5_10 | 358 | 94.1% | 3.1% |
| base | T+240 gt_10 | 728 | 98.1% | 1.2% |
| chop | T+180 0_5_1 high | 150 | 56.7% | 12.6% |
| chop | T+180 1_2 high | 220 | 59.5% | 6.6% |
| chop | T+180 1_2 medium | 178 | 64.6% | 13.0% |
| chop | T+180 2_3 high | 154 | 63.6% | 11.9% |
| chop | T+180 2_3 medium | 142 | 62.7% | 11.5% |
| chop | T+180 3_4 high | 132 | 76.5% | 10.6% |
| chop | T+180 3_4 medium | 112 | 75.0% | 11.0% |
| chop | T+180 4_5 high | 115 | 74.8% | 16.4% |
| chop | T+180 5_7_5 high | 162 | 84.0% | 9.7% |
| chop | T+180 5_7_5 low | 207 | 83.1% | 8.2% |
| chop | T+180 5_7_5 medium | 137 | 79.6% | 8.9% |
| chop | T+180 7_5_10 low | 148 | 88.5% | 5.7% |
| chop | T+180 7_5_10 medium | 103 | 90.3% | 10.9% |
| chop | T+180 gt_10 high | 102 | 92.2% | 6.9% |
| chop | T+180 gt_10 low | 326 | 96.9% | 2.6% |
| chop | T+180 gt_10 medium | 171 | 92.4% | 4.4% |
| chop | T+200 0_5_1 high | 133 | 61.7% | 6.8% |
| chop | T+200 1_2 high | 222 | 66.2% | 8.4% |
| chop | T+200 1_2 medium | 165 | 60.6% | 11.1% |
| chop | T+200 2_3 high | 163 | 68.7% | 12.0% |
| chop | T+200 2_3 medium | 132 | 68.9% | 8.9% |
| chop | T+200 3_4 high | 127 | 74.0% | 5.3% |
| chop | T+200 3_4 medium | 107 | 78.5% | 16.4% |
| chop | T+200 5_7_5 high | 148 | 82.4% | 9.9% |
| chop | T+200 5_7_5 low | 205 | 88.3% | 5.8% |
| chop | T+200 5_7_5 medium | 176 | 84.1% | 9.1% |
| chop | T+200 7_5_10 low | 153 | 88.9% | 6.1% |
| chop | T+200 7_5_10 medium | 107 | 87.9% | 8.6% |
| chop | T+200 gt_10 high | 102 | 94.1% | 6.4% |
| chop | T+200 gt_10 low | 358 | 98.0% | 2.0% |
| chop | T+200 gt_10 medium | 192 | 95.8% | 3.9% |
| chop | T+210 0_5_1 high | 112 | 56.3% | 9.8% |
| chop | T+210 1_2 high | 215 | 66.0% | 12.0% |
| chop | T+210 1_2 medium | 164 | 65.9% | 10.2% |
| chop | T+210 2_3 high | 152 | 67.8% | 11.4% |
| chop | T+210 2_3 medium | 131 | 72.5% | 7.9% |
| chop | T+210 3_4 high | 121 | 79.3% | 10.0% |
| chop | T+210 3_4 medium | 117 | 77.8% | 15.9% |
| chop | T+210 5_7_5 high | 136 | 86.0% | 8.8% |
| chop | T+210 5_7_5 low | 230 | 87.8% | 7.0% |
| chop | T+210 5_7_5 medium | 174 | 85.6% | 5.4% |
| chop | T+210 7_5_10 low | 163 | 92.0% | 7.7% |
| chop | T+210 7_5_10 medium | 100 | 90.0% | 10.3% |
| chop | T+210 gt_10 low | 415 | 96.9% | 1.7% |
| chop | T+210 gt_10 medium | 173 | 97.7% | 2.7% |
| chop | T+220 0_5_1 high | 126 | 61.1% | 10.9% |
| chop | T+220 1_2 high | 190 | 70.0% | 5.8% |
| chop | T+220 1_2 medium | 172 | 67.4% | 7.0% |
| chop | T+220 2_3 high | 160 | 76.3% | 10.1% |
| chop | T+220 2_3 medium | 141 | 69.5% | 13.8% |
| chop | T+220 3_4 high | 106 | 72.6% | 15.4% |
| chop | T+220 3_4 medium | 114 | 82.5% | 6.8% |
| chop | T+220 5_7_5 high | 113 | 91.2% | 10.6% |
| chop | T+220 5_7_5 low | 239 | 87.4% | 6.3% |
| chop | T+220 5_7_5 medium | 161 | 88.8% | 6.2% |
| chop | T+220 7_5_10 low | 180 | 92.2% | 5.5% |
| chop | T+220 7_5_10 medium | 111 | 91.9% | 6.1% |
| chop | T+220 gt_10 low | 460 | 97.4% | 2.2% |
| chop | T+220 gt_10 medium | 152 | 98.7% | 2.2% |
| chop | T+240 1_2 high | 197 | 70.1% | 13.0% |
| chop | T+240 1_2 medium | 168 | 73.8% | 11.8% |
| chop | T+240 2_3 high | 146 | 73.3% | 11.2% |
| chop | T+240 2_3 medium | 143 | 67.1% | 10.0% |
| chop | T+240 3_4 high | 108 | 80.6% | 10.2% |
| chop | T+240 3_4 medium | 114 | 80.7% | 9.7% |
| chop | T+240 4_5 low | 119 | 85.7% | 10.9% |
| chop | T+240 5_7_5 high | 117 | 88.9% | 6.5% |
| chop | T+240 5_7_5 low | 238 | 91.2% | 4.6% |
| chop | T+240 5_7_5 medium | 162 | 86.4% | 6.7% |
| chop | T+240 7_5_10 low | 174 | 90.8% | 6.7% |
| chop | T+240 7_5_10 medium | 111 | 96.4% | 5.2% |
| chop | T+240 gt_10 low | 490 | 98.6% | 1.3% |
| chop | T+240 gt_10 medium | 163 | 98.2% | 2.7% |
| leaderAge | T+180 1_2 gte_120 | 168 | 63.7% | 11.2% |
| leaderAge | T+180 2_3 gte_120 | 183 | 65.6% | 9.5% |
| leaderAge | T+180 3_4 gte_120 | 173 | 79.8% | 7.7% |
| leaderAge | T+180 4_5 gte_120 | 148 | 81.8% | 9.2% |
| leaderAge | T+180 5_7_5 60_120 | 107 | 81.3% | 10.1% |
| leaderAge | T+180 5_7_5 gte_120 | 324 | 82.7% | 4.9% |
| leaderAge | T+180 7_5_10 gte_120 | 235 | 89.8% | 4.6% |
| leaderAge | T+180 gt_10 60_120 | 104 | 94.2% | 5.7% |
| leaderAge | T+180 gt_10 gte_120 | 469 | 95.7% | 2.0% |
| leaderAge | T+200 1_2 gte_120 | 175 | 63.4% | 11.7% |
| leaderAge | T+200 2_3 gte_120 | 194 | 65.5% | 7.5% |
| leaderAge | T+200 3_4 gte_120 | 193 | 80.3% | 9.9% |
| leaderAge | T+200 4_5 gte_120 | 159 | 81.8% | 7.2% |
| leaderAge | T+200 5_7_5 gte_120 | 368 | 87.5% | 5.4% |
| leaderAge | T+200 7_5_10 gte_120 | 252 | 88.9% | 5.5% |
| leaderAge | T+200 gt_10 gte_120 | 542 | 97.4% | 0.8% |
| leaderAge | T+210 1_2 gte_120 | 166 | 64.5% | 11.3% |
| leaderAge | T+210 2_3 gte_120 | 187 | 71.1% | 6.5% |
| leaderAge | T+210 3_4 gte_120 | 198 | 75.8% | 10.7% |
| leaderAge | T+210 4_5 gte_120 | 148 | 86.5% | 10.4% |
| leaderAge | T+210 5_7_5 gte_120 | 380 | 88.4% | 4.2% |
| leaderAge | T+210 7_5_10 gte_120 | 255 | 92.9% | 6.1% |
| leaderAge | T+210 gt_10 gte_120 | 582 | 97.3% | 1.3% |
| leaderAge | T+220 1_2 gte_120 | 179 | 67.6% | 10.3% |
| leaderAge | T+220 2_3 gte_120 | 189 | 71.4% | 8.0% |
| leaderAge | T+220 3_4 gte_120 | 191 | 79.1% | 8.4% |
| leaderAge | T+220 4_5 gte_120 | 158 | 86.7% | 8.5% |
| leaderAge | T+220 5_7_5 gte_120 | 377 | 88.6% | 4.6% |
| leaderAge | T+220 7_5_10 gte_120 | 286 | 93.4% | 4.5% |
| leaderAge | T+220 gt_10 gte_120 | 598 | 98.3% | 1.4% |
| leaderAge | T+240 1_2 gte_120 | 162 | 72.8% | 14.4% |
| leaderAge | T+240 2_3 gte_120 | 193 | 68.9% | 9.1% |
| leaderAge | T+240 3_4 gte_120 | 187 | 78.6% | 8.2% |
| leaderAge | T+240 4_5 gte_120 | 182 | 89.6% | 8.8% |
| leaderAge | T+240 5_7_5 gte_120 | 380 | 90.5% | 3.5% |
| leaderAge | T+240 7_5_10 gte_120 | 273 | 93.4% | 4.9% |
| leaderAge | T+240 gt_10 gte_120 | 646 | 98.5% | 1.2% |
| momentum | T+180 0_5_1 flat | 100 | 58.0% | 12.5% |
| momentum | T+180 1_2 agrees | 146 | 61.0% | 9.4% |
| momentum | T+180 1_2 disagrees | 134 | 54.5% | 12.3% |
| momentum | T+180 1_2 flat | 158 | 66.5% | 9.6% |
| momentum | T+180 2_3 agrees | 142 | 62.7% | 14.9% |
| momentum | T+180 2_3 flat | 130 | 63.1% | 14.1% |
| momentum | T+180 3_4 agrees | 156 | 75.6% | 6.6% |
| momentum | T+180 4_5 agrees | 133 | 77.4% | 12.6% |
| momentum | T+180 5_7_5 agrees | 244 | 87.7% | 5.6% |
| momentum | T+180 5_7_5 disagrees | 143 | 74.8% | 8.7% |
| momentum | T+180 5_7_5 flat | 119 | 80.7% | 5.8% |
| momentum | T+180 7_5_10 agrees | 196 | 90.8% | 8.3% |
| momentum | T+180 gt_10 agrees | 380 | 94.5% | 2.3% |
| momentum | T+180 gt_10 disagrees | 159 | 95.0% | 3.8% |
| momentum | T+200 1_2 agrees | 173 | 70.5% | 7.0% |
| momentum | T+200 1_2 disagrees | 122 | 57.4% | 12.6% |
| momentum | T+200 1_2 flat | 136 | 59.6% | 10.7% |
| momentum | T+200 2_3 agrees | 152 | 67.8% | 12.6% |
| momentum | T+200 2_3 flat | 124 | 68.5% | 13.6% |
| momentum | T+200 3_4 agrees | 139 | 74.8% | 8.5% |
| momentum | T+200 4_5 agrees | 129 | 79.8% | 11.4% |
| momentum | T+200 5_7_5 agrees | 273 | 86.8% | 5.9% |
| momentum | T+200 5_7_5 disagrees | 156 | 80.1% | 7.4% |
| momentum | T+200 5_7_5 flat | 100 | 89.0% | 9.4% |
| momentum | T+200 7_5_10 agrees | 208 | 88.0% | 7.4% |
| momentum | T+200 gt_10 agrees | 413 | 97.1% | 1.9% |
| momentum | T+200 gt_10 disagrees | 174 | 95.4% | 3.8% |
| momentum | T+210 1_2 agrees | 160 | 70.0% | 11.3% |
| momentum | T+210 1_2 disagrees | 125 | 59.2% | 14.3% |
| momentum | T+210 1_2 flat | 139 | 64.0% | 13.6% |
| momentum | T+210 2_3 agrees | 137 | 73.0% | 10.2% |
| momentum | T+210 2_3 flat | 119 | 71.4% | 10.1% |
| momentum | T+210 3_4 agrees | 155 | 76.8% | 12.3% |
| momentum | T+210 4_5 agrees | 130 | 78.5% | 13.1% |
| momentum | T+210 5_7_5 agrees | 284 | 88.4% | 4.0% |
| momentum | T+210 5_7_5 disagrees | 138 | 78.3% | 9.3% |
| momentum | T+210 5_7_5 flat | 118 | 92.4% | 5.0% |
| momentum | T+210 7_5_10 agrees | 184 | 90.8% | 7.8% |
| momentum | T+210 gt_10 agrees | 442 | 96.4% | 2.6% |
| momentum | T+210 gt_10 disagrees | 181 | 96.1% | 3.7% |
| momentum | T+220 1_2 agrees | 148 | 64.9% | 11.4% |
| momentum | T+220 1_2 disagrees | 109 | 68.8% | 7.6% |
| momentum | T+220 1_2 flat | 152 | 69.7% | 6.2% |
| momentum | T+220 2_3 agrees | 143 | 80.4% | 9.6% |
| momentum | T+220 2_3 disagrees | 105 | 63.8% | 9.2% |
| momentum | T+220 2_3 flat | 123 | 71.5% | 12.3% |
| momentum | T+220 3_4 agrees | 127 | 82.7% | 11.1% |
| momentum | T+220 3_4 flat | 117 | 79.5% | 11.3% |
| momentum | T+220 4_5 agrees | 124 | 80.6% | 12.3% |
| momentum | T+220 5_7_5 agrees | 255 | 91.0% | 3.8% |
| momentum | T+220 5_7_5 disagrees | 147 | 85.0% | 9.0% |
| momentum | T+220 5_7_5 flat | 111 | 88.3% | 10.7% |
| momentum | T+220 7_5_10 agrees | 219 | 90.0% | 3.8% |
| momentum | T+220 7_5_10 disagrees | 100 | 92.0% | 8.8% |
| momentum | T+220 gt_10 agrees | 439 | 97.0% | 2.3% |
| momentum | T+220 gt_10 disagrees | 173 | 98.3% | 2.3% |
| momentum | T+240 1_2 agrees | 142 | 67.6% | 15.2% |
| momentum | T+240 1_2 disagrees | 109 | 71.6% | 18.5% |
| momentum | T+240 1_2 flat | 148 | 75.0% | 11.2% |
| momentum | T+240 2_3 agrees | 154 | 70.8% | 11.8% |
| momentum | T+240 2_3 flat | 119 | 69.7% | 9.3% |
| momentum | T+240 3_4 agrees | 127 | 78.7% | 12.3% |
| momentum | T+240 3_4 flat | 107 | 80.4% | 16.0% |
| momentum | T+240 4_5 agrees | 123 | 91.9% | 8.6% |
| momentum | T+240 5_7_5 agrees | 224 | 91.1% | 5.7% |
| momentum | T+240 5_7_5 disagrees | 159 | 84.9% | 5.7% |
| momentum | T+240 5_7_5 flat | 134 | 91.0% | 9.0% |
| momentum | T+240 7_5_10 agrees | 207 | 94.2% | 5.1% |
| momentum | T+240 gt_10 agrees | 430 | 97.9% | 1.8% |
| momentum | T+240 gt_10 disagrees | 198 | 97.5% | 2.3% |
| momentum | T+240 gt_10 flat | 100 | 100.0% | 0.0% |
| prePathShape | T+180 clean-lock | 986 | 84.6% | 1.5% |
| prePathShape | T+180 multi-flip-chop | 1110 | 71.8% | 4.5% |
| prePathShape | T+180 near-line-heavy | 351 | 68.9% | 5.6% |
| prePathShape | T+180 unresolved | 610 | 81.6% | 5.1% |
| prePathShape | T+200 clean-lock | 1013 | 86.9% | 1.8% |
| prePathShape | T+200 multi-flip-chop | 1075 | 74.9% | 3.8% |
| prePathShape | T+200 near-line-heavy | 315 | 70.2% | 6.6% |
| prePathShape | T+200 unresolved | 665 | 83.6% | 4.4% |
| prePathShape | T+210 clean-lock | 1094 | 87.9% | 1.5% |
| prePathShape | T+210 multi-flip-chop | 1001 | 75.4% | 3.7% |
| prePathShape | T+210 near-line-heavy | 298 | 72.5% | 8.2% |
| prePathShape | T+210 unresolved | 656 | 84.1% | 3.1% |
| prePathShape | T+220 clean-lock | 1156 | 89.1% | 2.5% |
| prePathShape | T+220 multi-flip-chop | 946 | 77.4% | 3.8% |
| prePathShape | T+220 near-line-heavy | 327 | 74.6% | 8.0% |
| prePathShape | T+220 unresolved | 626 | 85.9% | 4.1% |
| prePathShape | T+240 clean-lock | 1211 | 90.9% | 2.0% |
| prePathShape | T+240 multi-flip-chop | 872 | 79.5% | 3.8% |
| prePathShape | T+240 near-line-heavy | 323 | 77.7% | 8.0% |
| prePathShape | T+240 unresolved | 642 | 87.1% | 4.6% |
| risk | all momentum_against | 4273 | 77.9% | 2.6% |
| risk | all near_line_heavy | 1614 | 72.7% | 6.7% |
| risk | all recent_lock | 421 | 67.0% | 8.2% |
| risk | T+180 momentum_against | 858 | 73.4% | 4.2% |
| risk | T+180 near_line_heavy | 351 | 68.9% | 5.6% |
| risk | T+200 momentum_against | 874 | 76.2% | 4.0% |
| risk | T+200 near_line_heavy | 315 | 70.2% | 6.6% |
| risk | T+210 momentum_against | 853 | 76.6% | 4.7% |
| risk | T+210 near_line_heavy | 298 | 72.5% | 8.2% |
| risk | T+220 momentum_against | 835 | 80.0% | 2.6% |
| risk | T+220 near_line_heavy | 327 | 74.6% | 8.0% |
| risk | T+240 momentum_against | 853 | 83.5% | 3.6% |
| risk | T+240 near_line_heavy | 323 | 77.7% | 8.0% |

Warning-only cells:

| Source | Cell | N | All-data win | Mean fold drift |
| --- | --- | --- | --- | --- |
| chop | T+180 0_5_1 medium | 85 | 55.3% | 13.4% |
| chop | T+180 2_3 low | 75 | 66.7% | 10.4% |
| chop | T+180 3_4 low | 96 | 77.1% | 10.1% |
| chop | T+180 4_5 low | 79 | 81.0% | 10.4% |
| chop | T+180 4_5 medium | 86 | 86.0% | 13.3% |
| chop | T+180 7_5_10 high | 75 | 88.0% | 11.8% |
| chop | T+200 0_5_1 medium | 90 | 64.4% | 15.9% |
| chop | T+200 2_3 low | 77 | 58.4% | 15.5% |
| chop | T+200 3_4 low | 85 | 81.2% | 12.9% |
| chop | T+200 4_5 high | 94 | 80.9% | 11.0% |
| chop | T+200 4_5 low | 90 | 80.0% | 11.0% |
| chop | T+200 4_5 medium | 77 | 80.5% | 19.8% |
| chop | T+200 7_5_10 high | 86 | 88.4% | 6.7% |
| chop | T+210 0_5_1 medium | 98 | 54.1% | 11.7% |
| chop | T+210 2_3 low | 71 | 73.2% | 13.4% |
| chop | T+210 3_4 low | 95 | 74.7% | 12.0% |
| chop | T+210 4_5 high | 93 | 80.6% | 14.0% |
| chop | T+210 4_5 low | 78 | 89.7% | 11.4% |
| chop | T+210 4_5 medium | 78 | 79.5% | 19.3% |
| chop | T+210 7_5_10 high | 73 | 93.2% | 8.7% |
| chop | T+210 gt_10 high | 99 | 91.9% | 10.0% |
| chop | T+220 0_5_1 medium | 80 | 58.8% | 13.6% |
| chop | T+220 2_3 low | 70 | 71.4% | 17.5% |
| chop | T+220 3_4 low | 95 | 80.0% | 13.1% |
| chop | T+220 4_5 high | 88 | 76.1% | 14.1% |
| chop | T+220 4_5 low | 79 | 87.3% | 9.3% |
| chop | T+220 4_5 medium | 94 | 83.0% | 15.2% |
| chop | T+220 7_5_10 high | 83 | 90.4% | 10.1% |
| chop | T+220 gt_10 high | 80 | 97.5% | 4.6% |
| chop | T+240 0_5_1 high | 95 | 65.3% | 15.7% |
| chop | T+240 0_5_1 medium | 90 | 70.0% | 12.7% |
| chop | T+240 2_3 low | 80 | 73.8% | 13.4% |
| chop | T+240 3_4 low | 88 | 78.4% | 15.2% |
| chop | T+240 4_5 high | 61 | 85.2% | 14.3% |
| chop | T+240 4_5 medium | 83 | 96.4% | 6.0% |
| chop | T+240 7_5_10 high | 73 | 98.6% | 2.7% |
| chop | T+240 gt_10 high | 75 | 94.7% | 5.6% |
| leaderAge | T+180 0_5_1 60_120 | 52 | 55.8% | 18.1% |
| leaderAge | T+180 0_5_1 gte_120 | 69 | 50.7% | 18.7% |
| leaderAge | T+180 1_2 10_30 | 57 | 54.4% | 13.7% |
| leaderAge | T+180 1_2 30_60 | 70 | 54.3% | 22.1% |
| leaderAge | T+180 1_2 60_120 | 99 | 62.6% | 17.9% |
| leaderAge | T+180 2_3 30_60 | 51 | 56.9% | 20.3% |
| leaderAge | T+180 2_3 60_120 | 73 | 71.2% | 18.9% |
| leaderAge | T+180 3_4 60_120 | 89 | 75.3% | 13.1% |
| leaderAge | T+180 4_5 60_120 | 79 | 83.5% | 15.3% |
| leaderAge | T+180 5_7_5 30_60 | 54 | 81.5% | 12.9% |
| leaderAge | T+180 7_5_10 60_120 | 64 | 84.4% | 11.8% |
| leaderAge | T+200 0_5_1 gte_120 | 69 | 62.3% | 12.5% |
| leaderAge | T+200 0_5_1 lt_10 | 52 | 67.3% | 16.2% |
| leaderAge | T+200 1_2 10_30 | 73 | 75.3% | 14.7% |
| leaderAge | T+200 1_2 60_120 | 80 | 60.0% | 11.7% |
| leaderAge | T+200 1_2 lt_10 | 56 | 58.9% | 17.5% |
| leaderAge | T+200 2_3 60_120 | 73 | 68.5% | 17.4% |
| leaderAge | T+200 3_4 60_120 | 64 | 78.1% | 18.2% |
| leaderAge | T+200 5_7_5 30_60 | 50 | 88.0% | 10.0% |
| leaderAge | T+200 5_7_5 60_120 | 82 | 76.8% | 16.1% |
| leaderAge | T+200 7_5_10 60_120 | 58 | 89.7% | 7.8% |
| leaderAge | T+200 gt_10 60_120 | 85 | 94.1% | 7.8% |
| leaderAge | T+210 0_5_1 gte_120 | 77 | 50.6% | 12.3% |
| leaderAge | T+210 1_2 10_30 | 67 | 65.7% | 14.4% |
| leaderAge | T+210 1_2 30_60 | 62 | 67.7% | 19.1% |
| leaderAge | T+210 1_2 60_120 | 87 | 60.9% | 12.7% |
| leaderAge | T+210 2_3 60_120 | 70 | 60.0% | 14.4% |
| leaderAge | T+210 5_7_5 60_120 | 94 | 86.2% | 12.9% |
| leaderAge | T+210 7_5_10 60_120 | 54 | 90.7% | 12.4% |
| leaderAge | T+210 gt_10 60_120 | 77 | 90.9% | 8.7% |
| leaderAge | T+220 0_5_1 gte_120 | 63 | 54.0% | 15.7% |
| leaderAge | T+220 0_5_1 lt_10 | 51 | 52.9% | 16.5% |
| leaderAge | T+220 1_2 30_60 | 50 | 68.0% | 23.4% |
| leaderAge | T+220 1_2 60_120 | 80 | 67.5% | 13.7% |
| leaderAge | T+220 1_2 lt_10 | 54 | 66.7% | 16.5% |
| leaderAge | T+220 2_3 60_120 | 70 | 74.3% | 11.2% |
| leaderAge | T+220 3_4 60_120 | 51 | 72.5% | 23.5% |
| leaderAge | T+220 4_5 60_120 | 53 | 71.7% | 19.9% |
| leaderAge | T+220 5_7_5 60_120 | 67 | 92.5% | 10.1% |
| leaderAge | T+220 7_5_10 60_120 | 55 | 87.3% | 11.3% |
| leaderAge | T+220 gt_10 60_120 | 75 | 93.3% | 7.1% |
| leaderAge | T+240 0_5_1 gte_120 | 74 | 66.2% | 12.2% |
| leaderAge | T+240 1_2 10_30 | 68 | 70.6% | 16.5% |
| leaderAge | T+240 1_2 30_60 | 51 | 70.6% | 18.1% |
| leaderAge | T+240 1_2 60_120 | 77 | 72.7% | 20.4% |
| leaderAge | T+240 2_3 60_120 | 68 | 75.0% | 15.3% |
| leaderAge | T+240 3_4 60_120 | 61 | 80.3% | 16.1% |
| leaderAge | T+240 5_7_5 60_120 | 79 | 84.8% | 11.9% |
| leaderAge | T+240 7_5_10 60_120 | 54 | 98.1% | 3.7% |
| leaderAge | T+240 gt_10 60_120 | 62 | 96.8% | 4.8% |
| momentum | T+180 0_5_1 agrees | 79 | 55.7% | 17.4% |
| momentum | T+180 0_5_1 disagrees | 74 | 51.4% | 15.3% |
| momentum | T+180 2_3 disagrees | 99 | 66.7% | 14.8% |
| momentum | T+180 3_4 disagrees | 85 | 72.9% | 6.9% |
| momentum | T+180 3_4 flat | 99 | 79.8% | 12.5% |
| momentum | T+180 4_5 disagrees | 76 | 75.0% | 16.7% |
| momentum | T+180 4_5 flat | 71 | 90.1% | 11.6% |
| momentum | T+180 7_5_10 disagrees | 88 | 86.4% | 10.6% |
| momentum | T+180 gt_10 flat | 60 | 96.7% | 5.5% |
| momentum | T+200 0_5_1 agrees | 78 | 66.7% | 15.2% |
| momentum | T+200 0_5_1 disagrees | 69 | 59.4% | 11.4% |
| momentum | T+200 0_5_1 flat | 87 | 62.1% | 12.3% |
| momentum | T+200 2_3 disagrees | 96 | 62.5% | 13.3% |
| momentum | T+200 3_4 disagrees | 93 | 75.3% | 12.5% |
| momentum | T+200 3_4 flat | 87 | 83.9% | 13.6% |
| momentum | T+200 4_5 disagrees | 73 | 75.3% | 15.9% |
| momentum | T+200 4_5 flat | 59 | 88.1% | 13.9% |
| momentum | T+200 7_5_10 disagrees | 91 | 86.8% | 7.8% |
| momentum | T+200 gt_10 flat | 65 | 98.5% | 3.2% |
| momentum | T+210 0_5_1 agrees | 74 | 56.8% | 17.8% |
| momentum | T+210 0_5_1 disagrees | 65 | 47.7% | 12.1% |
| momentum | T+210 0_5_1 flat | 82 | 56.1% | 15.1% |
| momentum | T+210 2_3 disagrees | 98 | 66.3% | 9.3% |
| momentum | T+210 3_4 disagrees | 89 | 70.8% | 17.4% |
| momentum | T+210 3_4 flat | 89 | 85.4% | 15.6% |
| momentum | T+210 4_5 disagrees | 65 | 86.2% | 16.4% |
| momentum | T+210 4_5 flat | 54 | 90.7% | 10.2% |
| momentum | T+210 7_5_10 disagrees | 92 | 89.1% | 11.6% |
| momentum | T+210 7_5_10 flat | 60 | 98.3% | 3.4% |
| momentum | T+210 gt_10 flat | 64 | 96.9% | 5.3% |
| momentum | T+220 0_5_1 agrees | 79 | 62.0% | 16.9% |
| momentum | T+220 0_5_1 disagrees | 55 | 47.3% | 19.7% |
| momentum | T+220 0_5_1 flat | 83 | 63.9% | 15.4% |
| momentum | T+220 3_4 disagrees | 71 | 69.0% | 15.6% |
| momentum | T+220 4_5 disagrees | 75 | 85.3% | 13.0% |
| momentum | T+220 4_5 flat | 62 | 80.6% | 19.4% |
| momentum | T+220 7_5_10 flat | 55 | 98.2% | 3.5% |
| momentum | T+220 gt_10 flat | 80 | 100.0% | 0.0% |
| momentum | T+240 0_5_1 agrees | 62 | 64.5% | 21.0% |
| momentum | T+240 0_5_1 disagrees | 53 | 62.3% | 20.4% |
| momentum | T+240 0_5_1 flat | 86 | 72.1% | 11.1% |
| momentum | T+240 2_3 disagrees | 96 | 72.9% | 17.1% |
| momentum | T+240 3_4 disagrees | 76 | 81.6% | 11.0% |
| momentum | T+240 4_5 disagrees | 79 | 81.0% | 11.8% |
| momentum | T+240 4_5 flat | 61 | 93.4% | 10.5% |
| momentum | T+240 7_5_10 disagrees | 83 | 92.8% | 7.6% |
| momentum | T+240 7_5_10 flat | 68 | 95.6% | 8.5% |
| prePathShape | T+180 recent-lock | 56 | 55.4% | 22.8% |
| prePathShape | T+200 recent-lock | 76 | 67.1% | 16.7% |
| prePathShape | T+210 recent-lock | 95 | 65.3% | 14.6% |
| prePathShape | T+220 recent-lock | 97 | 68.0% | 10.8% |
| prePathShape | T+240 recent-lock | 97 | 74.2% | 8.2% |
| risk | T+180 recent_lock | 56 | 55.4% | 22.8% |
| risk | T+200 recent_lock | 76 | 67.1% | 16.7% |
| risk | T+210 recent_lock | 95 | 65.3% | 14.6% |
| risk | T+220 recent_lock | 97 | 68.0% | 10.8% |
| risk | T+240 recent_lock | 97 | 74.2% | 8.2% |

Ignored cells:

| Source | Cell | N | All-data win | Mean fold drift |
| --- | --- | --- | --- | --- |
| chop | T+180 0_5_1 low | 18 | 44.4% | 20.0% |
| chop | T+180 1_2 low | 40 | 52.5% | 25.0% |
| chop | T+180 1_2 unknown | 1 | 100.0% | - |
| chop | T+180 3_4 unknown | 1 | 100.0% | - |
| chop | T+200 0_5_1 low | 11 | 63.6% | 53.0% |
| chop | T+200 1_2 low | 44 | 59.1% | 19.3% |
| chop | T+200 1_2 unknown | 1 | 100.0% | - |
| chop | T+200 2_3 unknown | 1 | 100.0% | - |
| chop | T+210 0_5_1 low | 11 | 27.3% | 23.3% |
| chop | T+210 1_2 low | 45 | 55.6% | 22.9% |
| chop | T+210 2_3 unknown | 2 | 100.0% | 0.0% |
| chop | T+220 0_5_1 low | 11 | 36.4% | 31.9% |
| chop | T+220 1_2 low | 47 | 59.6% | 18.6% |
| chop | T+220 1_2 unknown | 1 | 100.0% | - |
| chop | T+220 2_3 unknown | 1 | 100.0% | - |
| chop | T+240 0_5_1 low | 16 | 62.5% | 24.9% |
| chop | T+240 1_2 low | 34 | 67.6% | 33.2% |
| chop | T+240 2_3 unknown | 2 | 100.0% | 0.0% |
| leaderAge | T+180 0_5_1 10_30 | 49 | 57.1% | 23.3% |
| leaderAge | T+180 0_5_1 30_60 | 37 | 56.8% | 21.0% |
| leaderAge | T+180 0_5_1 lt_10 | 46 | 58.7% | 28.2% |
| leaderAge | T+180 1_2 lt_10 | 44 | 65.9% | 22.7% |
| leaderAge | T+180 1_2 unknown | 1 | 100.0% | - |
| leaderAge | T+180 2_3 10_30 | 41 | 51.2% | 20.7% |
| leaderAge | T+180 2_3 lt_10 | 23 | 65.2% | 27.8% |
| leaderAge | T+180 3_4 10_30 | 28 | 78.6% | 16.2% |
| leaderAge | T+180 3_4 30_60 | 38 | 63.2% | 19.6% |
| leaderAge | T+180 3_4 lt_10 | 12 | 66.7% | 45.4% |
| leaderAge | T+180 3_4 unknown | 1 | 100.0% | - |
| leaderAge | T+180 4_5 10_30 | 19 | 63.2% | 27.4% |
| leaderAge | T+180 4_5 30_60 | 31 | 71.0% | 30.2% |
| leaderAge | T+180 4_5 lt_10 | 3 | 100.0% | 0.0% |
| leaderAge | T+180 5_7_5 10_30 | 18 | 88.9% | 23.1% |
| leaderAge | T+180 5_7_5 lt_10 | 3 | 66.7% | 50.0% |
| leaderAge | T+180 7_5_10 10_30 | 10 | 90.0% | 19.4% |
| leaderAge | T+180 7_5_10 30_60 | 16 | 93.8% | 12.4% |
| leaderAge | T+180 7_5_10 lt_10 | 1 | 100.0% | - |
| leaderAge | T+180 gt_10 10_30 | 6 | 66.7% | 56.7% |
| leaderAge | T+180 gt_10 30_60 | 18 | 83.3% | 19.3% |
| leaderAge | T+180 gt_10 lt_10 | 2 | 100.0% | 0.0% |
| leaderAge | T+200 0_5_1 10_30 | 35 | 65.7% | 18.1% |
| leaderAge | T+200 0_5_1 30_60 | 39 | 69.2% | 21.2% |
| leaderAge | T+200 0_5_1 60_120 | 39 | 48.7% | 23.7% |
| leaderAge | T+200 1_2 30_60 | 47 | 55.3% | 16.9% |
| leaderAge | T+200 1_2 unknown | 1 | 100.0% | - |
| leaderAge | T+200 2_3 10_30 | 41 | 75.6% | 20.5% |
| leaderAge | T+200 2_3 30_60 | 41 | 56.1% | 32.9% |
| leaderAge | T+200 2_3 lt_10 | 23 | 73.9% | 20.1% |
| leaderAge | T+200 2_3 unknown | 1 | 100.0% | - |
| leaderAge | T+200 3_4 10_30 | 14 | 78.6% | 33.9% |
| leaderAge | T+200 3_4 30_60 | 27 | 66.7% | 25.3% |
| leaderAge | T+200 3_4 lt_10 | 21 | 61.9% | 28.0% |
| leaderAge | T+200 4_5 10_30 | 18 | 88.9% | 18.3% |
| leaderAge | T+200 4_5 30_60 | 30 | 83.3% | 24.9% |
| leaderAge | T+200 4_5 60_120 | 49 | 73.5% | 18.6% |
| leaderAge | T+200 4_5 lt_10 | 5 | 60.0% | 60.0% |
| leaderAge | T+200 5_7_5 10_30 | 23 | 82.6% | 20.3% |
| leaderAge | T+200 5_7_5 lt_10 | 6 | 50.0% | 40.0% |
| leaderAge | T+200 7_5_10 10_30 | 6 | 100.0% | 0.0% |
| leaderAge | T+200 7_5_10 30_60 | 28 | 78.6% | 14.1% |
| leaderAge | T+200 7_5_10 lt_10 | 2 | 100.0% | 0.0% |
| leaderAge | T+200 gt_10 10_30 | 4 | 100.0% | 0.0% |
| leaderAge | T+200 gt_10 30_60 | 20 | 90.0% | 16.4% |
| leaderAge | T+200 gt_10 lt_10 | 1 | 100.0% | - |
| leaderAge | T+210 0_5_1 10_30 | 36 | 55.6% | 22.3% |
| leaderAge | T+210 0_5_1 30_60 | 35 | 51.4% | 18.0% |
| leaderAge | T+210 0_5_1 60_120 | 32 | 56.3% | 23.6% |
| leaderAge | T+210 0_5_1 lt_10 | 41 | 58.5% | 23.0% |
| leaderAge | T+210 1_2 lt_10 | 42 | 69.0% | 14.8% |
| leaderAge | T+210 2_3 10_30 | 37 | 75.7% | 18.4% |
| leaderAge | T+210 2_3 30_60 | 41 | 78.0% | 24.2% |
| leaderAge | T+210 2_3 lt_10 | 19 | 78.9% | 17.5% |
| leaderAge | T+210 2_3 unknown | 2 | 100.0% | 0.0% |
| leaderAge | T+210 3_4 10_30 | 35 | 80.0% | 20.3% |
| leaderAge | T+210 3_4 30_60 | 35 | 77.1% | 21.3% |
| leaderAge | T+210 3_4 60_120 | 49 | 85.7% | 18.7% |
| leaderAge | T+210 3_4 lt_10 | 16 | 68.8% | 37.8% |
| leaderAge | T+210 4_5 10_30 | 17 | 94.1% | 10.7% |
| leaderAge | T+210 4_5 30_60 | 30 | 63.3% | 23.9% |
| leaderAge | T+210 4_5 60_120 | 47 | 83.0% | 15.2% |
| leaderAge | T+210 4_5 lt_10 | 7 | 71.4% | 52.4% |
| leaderAge | T+210 5_7_5 10_30 | 22 | 68.2% | 29.6% |
| leaderAge | T+210 5_7_5 30_60 | 39 | 82.1% | 19.7% |
| leaderAge | T+210 5_7_5 lt_10 | 5 | 80.0% | 35.0% |
| leaderAge | T+210 7_5_10 10_30 | 9 | 100.0% | 0.0% |
| leaderAge | T+210 7_5_10 30_60 | 16 | 68.8% | 40.2% |
| leaderAge | T+210 7_5_10 lt_10 | 2 | 100.0% | 0.0% |
| leaderAge | T+210 gt_10 10_30 | 3 | 100.0% | 0.0% |
| leaderAge | T+210 gt_10 30_60 | 22 | 95.5% | 8.9% |
| leaderAge | T+210 gt_10 lt_10 | 3 | 66.7% | 66.7% |
| leaderAge | T+220 0_5_1 10_30 | 39 | 69.2% | 17.7% |
| leaderAge | T+220 0_5_1 30_60 | 30 | 76.7% | 17.8% |
| leaderAge | T+220 0_5_1 60_120 | 34 | 50.0% | 19.7% |
| leaderAge | T+220 1_2 10_30 | 46 | 69.6% | 15.1% |
| leaderAge | T+220 1_2 unknown | 1 | 100.0% | - |
| leaderAge | T+220 2_3 10_30 | 38 | 73.7% | 14.6% |
| leaderAge | T+220 2_3 30_60 | 45 | 80.0% | 16.5% |
| leaderAge | T+220 2_3 lt_10 | 29 | 65.5% | 24.8% |
| leaderAge | T+220 2_3 unknown | 1 | 100.0% | - |
| leaderAge | T+220 3_4 10_30 | 28 | 82.1% | 25.0% |
| leaderAge | T+220 3_4 30_60 | 40 | 82.5% | 14.8% |
| leaderAge | T+220 3_4 lt_10 | 5 | 60.0% | 60.0% |
| leaderAge | T+220 4_5 10_30 | 17 | 76.5% | 19.4% |
| leaderAge | T+220 4_5 30_60 | 28 | 78.6% | 23.3% |
| leaderAge | T+220 4_5 lt_10 | 5 | 80.0% | 40.0% |
| leaderAge | T+220 5_7_5 10_30 | 26 | 80.8% | 30.2% |
| leaderAge | T+220 5_7_5 30_60 | 40 | 87.5% | 13.0% |
| leaderAge | T+220 5_7_5 lt_10 | 3 | 100.0% | 0.0% |
| leaderAge | T+220 7_5_10 10_30 | 17 | 82.4% | 25.6% |
| leaderAge | T+220 7_5_10 30_60 | 15 | 86.7% | 25.5% |
| leaderAge | T+220 7_5_10 lt_10 | 1 | 100.0% | - |
| leaderAge | T+220 gt_10 10_30 | 5 | 80.0% | 40.0% |
| leaderAge | T+220 gt_10 30_60 | 13 | 100.0% | 0.0% |
| leaderAge | T+220 gt_10 lt_10 | 1 | 100.0% | - |
| leaderAge | T+240 0_5_1 10_30 | 25 | 68.0% | 25.1% |
| leaderAge | T+240 0_5_1 30_60 | 28 | 78.6% | 27.7% |
| leaderAge | T+240 0_5_1 60_120 | 32 | 59.4% | 22.6% |
| leaderAge | T+240 0_5_1 lt_10 | 42 | 66.7% | 32.2% |
| leaderAge | T+240 1_2 lt_10 | 41 | 65.9% | 11.6% |
| leaderAge | T+240 2_3 10_30 | 39 | 66.7% | 16.9% |
| leaderAge | T+240 2_3 30_60 | 49 | 79.6% | 12.0% |
| leaderAge | T+240 2_3 lt_10 | 20 | 65.0% | 39.8% |
| leaderAge | T+240 2_3 unknown | 2 | 100.0% | 0.0% |
| leaderAge | T+240 3_4 10_30 | 21 | 95.2% | 9.0% |
| leaderAge | T+240 3_4 30_60 | 35 | 80.0% | 25.3% |
| leaderAge | T+240 3_4 lt_10 | 6 | 66.7% | 56.7% |
| leaderAge | T+240 4_5 10_30 | 17 | 94.1% | 11.2% |
| leaderAge | T+240 4_5 30_60 | 25 | 84.0% | 18.3% |
| leaderAge | T+240 4_5 60_120 | 38 | 89.5% | 11.7% |
| leaderAge | T+240 4_5 lt_10 | 1 | 0.0% | - |
| leaderAge | T+240 5_7_5 10_30 | 14 | 85.7% | 15.5% |
| leaderAge | T+240 5_7_5 30_60 | 41 | 85.4% | 15.7% |
| leaderAge | T+240 5_7_5 lt_10 | 3 | 100.0% | 0.0% |
| leaderAge | T+240 7_5_10 10_30 | 10 | 90.0% | 21.1% |
| leaderAge | T+240 7_5_10 30_60 | 21 | 95.2% | 9.3% |
| leaderAge | T+240 gt_10 10_30 | 3 | 100.0% | 0.0% |
| leaderAge | T+240 gt_10 30_60 | 17 | 88.2% | 19.5% |
| momentum | T+180 1_2 unknown | 1 | 100.0% | - |
| momentum | T+180 3_4 unknown | 1 | 100.0% | - |
| momentum | T+180 7_5_10 flat | 42 | 85.7% | 19.3% |
| momentum | T+200 1_2 unknown | 1 | 100.0% | - |
| momentum | T+200 2_3 unknown | 1 | 100.0% | - |
| momentum | T+200 7_5_10 flat | 47 | 93.6% | 9.1% |
| momentum | T+210 2_3 unknown | 2 | 100.0% | 0.0% |
| momentum | T+220 1_2 unknown | 1 | 100.0% | - |
| momentum | T+220 2_3 unknown | 1 | 100.0% | - |
| momentum | T+240 2_3 unknown | 2 | 100.0% | 0.0% |
| prePathShape | T+180 unknown | 2 | 100.0% | 0.0% |
| prePathShape | T+200 unknown | 2 | 100.0% | 0.0% |
| prePathShape | T+210 unknown | 2 | 100.0% | 0.0% |
| prePathShape | T+220 unknown | 2 | 100.0% | 0.0% |
| prePathShape | T+240 unknown | 2 | 100.0% | 0.0% |

## Cell Validation

This table contains every cell that had at least one held-out observation.

| Source | Cell | Tier | All-data N | All-data win | Min train N | Min train tier | Usable folds | Warning+ folds | Holdout N | Train prior | Holdout win | Mean fold drift | Aggregate drift | Max fold drift |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| base | T+180 0_5_1 | usable | 253 | 55.3% | 204 | usable | 12/12 | 12/12 | 253 | 55.1% | 55.3% | 9.8% | 0.2% | 24.0% |
| base | T+180 1_2 | usable | 439 | 61.0% | 367 | usable | 12/12 | 12/12 | 439 | 61.0% | 61.0% | 6.9% | 0.1% | 19.0% |
| base | T+180 2_3 | usable | 371 | 63.9% | 321 | usable | 12/12 | 12/12 | 371 | 63.8% | 63.9% | 7.2% | 0.0% | 21.3% |
| base | T+180 3_4 | usable | 341 | 76.2% | 299 | usable | 12/12 | 12/12 | 341 | 76.2% | 76.2% | 5.5% | 0.1% | 11.8% |
| base | T+180 4_5 | usable | 280 | 80.0% | 246 | usable | 12/12 | 12/12 | 280 | 80.1% | 80.0% | 10.5% | 0.1% | 20.8% |
| base | T+180 5_7_5 | usable | 506 | 82.4% | 455 | usable | 12/12 | 12/12 | 506 | 82.4% | 82.4% | 4.0% | 0.0% | 8.2% |
| base | T+180 7_5_10 | usable | 326 | 89.0% | 287 | usable | 12/12 | 12/12 | 326 | 89.1% | 89.0% | 5.5% | 0.1% | 11.3% |
| base | T+180 gt_10 | usable | 599 | 94.8% | 525 | usable | 12/12 | 12/12 | 599 | 94.8% | 94.8% | 1.6% | 0.0% | 5.2% |
| base | T+200 0_5_1 | usable | 234 | 62.8% | 191 | usable | 12/12 | 12/12 | 234 | 62.8% | 62.8% | 5.8% | 0.0% | 17.3% |
| base | T+200 1_2 | usable | 432 | 63.4% | 358 | usable | 12/12 | 12/12 | 432 | 63.5% | 63.4% | 6.0% | 0.0% | 16.6% |
| base | T+200 2_3 | usable | 373 | 66.8% | 317 | usable | 12/12 | 12/12 | 373 | 66.8% | 66.8% | 6.8% | 0.1% | 24.1% |
| base | T+200 3_4 | usable | 319 | 77.4% | 276 | usable | 12/12 | 12/12 | 319 | 77.3% | 77.4% | 9.2% | 0.2% | 20.8% |
| base | T+200 4_5 | usable | 261 | 80.5% | 232 | usable | 12/12 | 12/12 | 261 | 80.4% | 80.5% | 9.4% | 0.0% | 21.7% |
| base | T+200 5_7_5 | usable | 529 | 85.3% | 478 | usable | 12/12 | 12/12 | 529 | 85.3% | 85.3% | 5.2% | 0.0% | 12.0% |
| base | T+200 7_5_10 | usable | 346 | 88.4% | 309 | usable | 12/12 | 12/12 | 346 | 88.5% | 88.4% | 4.7% | 0.0% | 11.7% |
| base | T+200 gt_10 | usable | 652 | 96.8% | 572 | usable | 12/12 | 12/12 | 652 | 96.8% | 96.8% | 1.2% | 0.0% | 3.5% |
| base | T+210 0_5_1 | usable | 221 | 53.8% | 178 | usable | 12/12 | 12/12 | 221 | 53.6% | 53.8% | 9.6% | 0.2% | 33.0% |
| base | T+210 1_2 | usable | 424 | 64.9% | 349 | usable | 12/12 | 12/12 | 424 | 64.8% | 64.9% | 7.4% | 0.1% | 20.5% |
| base | T+210 2_3 | usable | 356 | 70.8% | 303 | usable | 12/12 | 12/12 | 356 | 70.8% | 70.8% | 5.9% | 0.0% | 19.6% |
| base | T+210 3_4 | usable | 333 | 77.5% | 293 | usable | 12/12 | 12/12 | 333 | 77.4% | 77.5% | 10.2% | 0.1% | 22.9% |
| base | T+210 4_5 | usable | 249 | 83.1% | 220 | usable | 12/12 | 12/12 | 249 | 83.1% | 83.1% | 10.3% | 0.0% | 21.6% |
| base | T+210 5_7_5 | usable | 540 | 86.7% | 487 | usable | 12/12 | 12/12 | 540 | 86.7% | 86.7% | 3.2% | 0.0% | 9.8% |
| base | T+210 7_5_10 | usable | 336 | 91.7% | 293 | usable | 12/12 | 12/12 | 336 | 91.7% | 91.7% | 6.2% | 0.1% | 9.8% |
| base | T+210 gt_10 | usable | 687 | 96.4% | 605 | usable | 12/12 | 12/12 | 687 | 96.4% | 96.4% | 1.5% | 0.0% | 4.2% |
| base | T+220 0_5_1 | usable | 217 | 59.0% | 173 | usable | 12/12 | 12/12 | 217 | 59.0% | 59.0% | 5.6% | 0.0% | 17.0% |
| base | T+220 1_2 | usable | 410 | 67.8% | 335 | usable | 12/12 | 12/12 | 410 | 67.8% | 67.8% | 5.9% | 0.0% | 15.3% |
| base | T+220 2_3 | usable | 372 | 72.8% | 319 | usable | 12/12 | 12/12 | 372 | 72.7% | 72.8% | 6.2% | 0.1% | 27.3% |
| base | T+220 3_4 | usable | 315 | 78.4% | 275 | usable | 12/12 | 12/12 | 315 | 78.3% | 78.4% | 9.8% | 0.1% | 15.0% |
| base | T+220 4_5 | usable | 261 | 82.0% | 233 | usable | 12/12 | 12/12 | 261 | 82.0% | 82.0% | 8.9% | 0.0% | 16.7% |
| base | T+220 5_7_5 | usable | 513 | 88.7% | 460 | usable | 12/12 | 12/12 | 513 | 88.7% | 88.7% | 4.4% | 0.0% | 8.0% |
| base | T+220 7_5_10 | usable | 374 | 91.7% | 335 | usable | 12/12 | 12/12 | 374 | 91.7% | 91.7% | 3.5% | 0.0% | 11.4% |
| base | T+220 gt_10 | usable | 692 | 97.7% | 608 | usable | 12/12 | 12/12 | 692 | 97.7% | 97.7% | 1.7% | 0.0% | 3.0% |
| base | T+240 0_5_1 | usable | 201 | 67.2% | 151 | usable | 12/12 | 12/12 | 201 | 66.9% | 67.2% | 8.9% | 0.3% | 22.0% |
| base | T+240 1_2 | usable | 399 | 71.4% | 339 | usable | 12/12 | 12/12 | 399 | 71.3% | 71.4% | 10.8% | 0.1% | 37.1% |
| base | T+240 2_3 | usable | 371 | 71.2% | 322 | usable | 12/12 | 12/12 | 371 | 71.1% | 71.2% | 6.8% | 0.1% | 18.2% |
| base | T+240 3_4 | usable | 310 | 80.0% | 273 | usable | 12/12 | 12/12 | 310 | 79.9% | 80.0% | 6.4% | 0.1% | 14.5% |
| base | T+240 4_5 | usable | 263 | 89.0% | 233 | usable | 12/12 | 12/12 | 263 | 88.9% | 89.0% | 7.2% | 0.0% | 30.7% |
| base | T+240 5_7_5 | usable | 517 | 89.2% | 459 | usable | 12/12 | 12/12 | 517 | 89.2% | 89.2% | 3.2% | 0.0% | 12.1% |
| base | T+240 7_5_10 | usable | 358 | 94.1% | 318 | usable | 12/12 | 12/12 | 358 | 94.1% | 94.1% | 3.1% | 0.0% | 11.0% |
| base | T+240 gt_10 | usable | 728 | 98.1% | 637 | usable | 12/12 | 12/12 | 728 | 98.1% | 98.1% | 1.2% | 0.0% | 2.2% |
| chop | T+180 0_5_1 high | usable | 150 | 56.7% | 130 | usable | 12/12 | 12/12 | 150 | 56.6% | 56.7% | 12.6% | 0.0% | 29.0% |
| chop | T+180 0_5_1 low | ignored | 18 | 44.4% | 15 | ignored | 0/10 | 0/10 | 18 | 44.4% | 44.4% | 20.0% | 0.0% | 58.8% |
| chop | T+180 0_5_1 medium | warning-only | 85 | 55.3% | 60 | warning-only | 0/12 | 12/12 | 85 | 55.1% | 55.3% | 13.4% | 0.2% | 56.6% |
| chop | T+180 1_2 high | usable | 220 | 59.5% | 192 | usable | 12/12 | 12/12 | 220 | 59.3% | 59.5% | 6.6% | 0.2% | 15.1% |
| chop | T+180 1_2 low | ignored | 40 | 52.5% | 32 | ignored | 0/12 | 0/12 | 41 | 53.4% | 51.2% | 25.0% | 2.2% | 58.3% |
| chop | T+180 1_2 medium | usable | 178 | 64.6% | 130 | usable | 12/12 | 12/12 | 177 | 65.1% | 65.0% | 13.0% | 0.2% | 37.1% |
| chop | T+180 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| chop | T+180 2_3 high | usable | 154 | 63.6% | 136 | usable | 12/12 | 12/12 | 154 | 63.8% | 63.6% | 11.9% | 0.2% | 22.2% |
| chop | T+180 2_3 low | warning-only | 75 | 66.7% | 62 | warning-only | 0/12 | 12/12 | 74 | 66.8% | 66.2% | 10.4% | 0.6% | 34.2% |
| chop | T+180 2_3 medium | usable | 142 | 62.7% | 114 | usable | 12/12 | 12/12 | 143 | 62.2% | 62.9% | 11.5% | 0.8% | 38.8% |
| chop | T+180 3_4 high | usable | 132 | 76.5% | 112 | usable | 12/12 | 12/12 | 132 | 76.6% | 76.5% | 10.6% | 0.1% | 28.7% |
| chop | T+180 3_4 low | warning-only | 96 | 77.1% | 76 | warning-only | 0/12 | 12/12 | 96 | 77.4% | 79.2% | 10.1% | 1.8% | 79.6% |
| chop | T+180 3_4 medium | usable | 112 | 75.0% | 93 | warning-only | 8/12 | 12/12 | 112 | 74.7% | 73.2% | 11.0% | 1.4% | 26.7% |
| chop | T+180 3_4 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| chop | T+180 4_5 high | usable | 115 | 74.8% | 94 | warning-only | 11/12 | 12/12 | 115 | 75.2% | 74.8% | 16.4% | 0.4% | 27.9% |
| chop | T+180 4_5 low | warning-only | 79 | 81.0% | 68 | warning-only | 0/12 | 12/12 | 79 | 81.2% | 81.0% | 10.4% | 0.1% | 33.8% |
| chop | T+180 4_5 medium | warning-only | 86 | 86.0% | 73 | warning-only | 0/12 | 12/12 | 86 | 85.9% | 86.0% | 13.3% | 0.1% | 37.0% |
| chop | T+180 5_7_5 high | usable | 162 | 84.0% | 138 | usable | 12/12 | 12/12 | 160 | 83.8% | 83.8% | 9.7% | 0.0% | 34.5% |
| chop | T+180 5_7_5 low | usable | 207 | 83.1% | 183 | usable | 12/12 | 12/12 | 210 | 82.8% | 83.3% | 8.2% | 0.5% | 26.9% |
| chop | T+180 5_7_5 medium | usable | 137 | 79.6% | 114 | usable | 12/12 | 12/12 | 136 | 80.2% | 79.4% | 8.9% | 0.8% | 22.6% |
| chop | T+180 7_5_10 high | warning-only | 75 | 88.0% | 60 | warning-only | 0/12 | 12/12 | 72 | 88.3% | 88.9% | 11.8% | 0.5% | 34.0% |
| chop | T+180 7_5_10 low | usable | 148 | 88.5% | 128 | usable | 12/12 | 12/12 | 150 | 88.7% | 88.7% | 5.7% | 0.1% | 11.9% |
| chop | T+180 7_5_10 medium | usable | 103 | 90.3% | 88 | warning-only | 4/12 | 12/12 | 104 | 90.1% | 89.4% | 10.9% | 0.6% | 15.8% |
| chop | T+180 gt_10 high | usable | 102 | 92.2% | 85 | warning-only | 0/11 | 11/11 | 101 | 92.3% | 92.1% | 6.9% | 0.3% | 13.3% |
| chop | T+180 gt_10 low | usable | 326 | 96.9% | 279 | usable | 12/12 | 12/12 | 324 | 96.9% | 96.9% | 2.6% | 0.0% | 7.4% |
| chop | T+180 gt_10 medium | usable | 171 | 92.4% | 144 | usable | 11/11 | 11/11 | 174 | 92.5% | 92.5% | 4.4% | 0.0% | 18.7% |
| chop | T+200 0_5_1 high | usable | 133 | 61.7% | 111 | usable | 12/12 | 12/12 | 133 | 61.5% | 61.7% | 6.8% | 0.2% | 23.4% |
| chop | T+200 0_5_1 low | ignored | 11 | 63.6% | 9 | ignored | 0/8 | 0/8 | 11 | 62.5% | 63.6% | 53.0% | 1.1% | 72.7% |
| chop | T+200 0_5_1 medium | warning-only | 90 | 64.4% | 71 | warning-only | 0/12 | 12/12 | 90 | 64.9% | 64.4% | 15.9% | 0.5% | 36.9% |
| chop | T+200 1_2 high | usable | 222 | 66.2% | 196 | usable | 12/12 | 12/12 | 221 | 66.2% | 66.5% | 8.4% | 0.3% | 14.5% |
| chop | T+200 1_2 low | ignored | 44 | 59.1% | 36 | ignored | 0/11 | 0/11 | 43 | 58.9% | 60.5% | 19.3% | 1.6% | 60.5% |
| chop | T+200 1_2 medium | usable | 165 | 60.6% | 121 | usable | 12/12 | 12/12 | 167 | 61.1% | 59.9% | 11.1% | 1.2% | 32.3% |
| chop | T+200 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| chop | T+200 2_3 high | usable | 163 | 68.7% | 138 | usable | 12/12 | 12/12 | 164 | 68.7% | 68.9% | 12.0% | 0.2% | 25.6% |
| chop | T+200 2_3 low | warning-only | 77 | 58.4% | 56 | warning-only | 0/12 | 12/12 | 72 | 58.6% | 59.7% | 15.5% | 1.1% | 43.2% |
| chop | T+200 2_3 medium | usable | 132 | 68.9% | 106 | usable | 12/12 | 12/12 | 136 | 68.9% | 67.6% | 8.9% | 1.2% | 42.6% |
| chop | T+200 2_3 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| chop | T+200 3_4 high | usable | 127 | 74.0% | 110 | usable | 12/12 | 12/12 | 127 | 74.2% | 74.0% | 5.3% | 0.2% | 17.2% |
| chop | T+200 3_4 low | warning-only | 85 | 81.2% | 68 | warning-only | 0/12 | 12/12 | 84 | 80.5% | 81.0% | 12.9% | 0.4% | 82.1% |
| chop | T+200 3_4 medium | usable | 107 | 78.5% | 94 | warning-only | 5/12 | 12/12 | 108 | 78.0% | 78.7% | 16.4% | 0.7% | 30.2% |
| chop | T+200 4_5 high | warning-only | 94 | 80.9% | 82 | warning-only | 0/12 | 12/12 | 96 | 80.9% | 80.2% | 11.0% | 0.7% | 21.7% |
| chop | T+200 4_5 low | warning-only | 90 | 80.0% | 77 | warning-only | 0/12 | 12/12 | 90 | 79.8% | 80.0% | 11.0% | 0.2% | 80.9% |
| chop | T+200 4_5 medium | warning-only | 77 | 80.5% | 65 | warning-only | 0/12 | 12/12 | 75 | 80.8% | 81.3% | 19.8% | 0.5% | 34.1% |
| chop | T+200 5_7_5 high | usable | 148 | 82.4% | 130 | usable | 12/12 | 12/12 | 149 | 82.7% | 82.6% | 9.9% | 0.1% | 20.0% |
| chop | T+200 5_7_5 low | usable | 205 | 88.3% | 180 | usable | 12/12 | 12/12 | 203 | 88.3% | 88.2% | 5.8% | 0.2% | 12.8% |
| chop | T+200 5_7_5 medium | usable | 176 | 84.1% | 148 | usable | 12/12 | 12/12 | 177 | 84.0% | 84.2% | 9.1% | 0.2% | 16.9% |
| chop | T+200 7_5_10 high | warning-only | 86 | 88.4% | 76 | warning-only | 0/12 | 12/12 | 87 | 88.4% | 88.5% | 6.7% | 0.1% | 12.8% |
| chop | T+200 7_5_10 low | usable | 153 | 88.9% | 133 | usable | 12/12 | 12/12 | 153 | 88.9% | 88.9% | 6.1% | 0.0% | 11.9% |
| chop | T+200 7_5_10 medium | usable | 107 | 87.9% | 94 | warning-only | 3/11 | 11/11 | 106 | 87.9% | 87.7% | 8.6% | 0.2% | 22.3% |
| chop | T+200 gt_10 high | usable | 102 | 94.1% | 85 | warning-only | 3/12 | 12/12 | 104 | 94.5% | 94.2% | 6.4% | 0.3% | 15.5% |
| chop | T+200 gt_10 low | usable | 358 | 98.0% | 309 | usable | 12/12 | 12/12 | 358 | 98.0% | 98.0% | 2.0% | 0.0% | 2.5% |
| chop | T+200 gt_10 medium | usable | 192 | 95.8% | 160 | usable | 12/12 | 12/12 | 190 | 95.9% | 95.8% | 3.9% | 0.1% | 6.5% |
| chop | T+210 0_5_1 high | usable | 112 | 56.3% | 91 | warning-only | 11/12 | 12/12 | 114 | 55.7% | 55.3% | 9.8% | 0.5% | 40.7% |
| chop | T+210 0_5_1 low | ignored | 11 | 27.3% | 8 | ignored | 0/7 | 0/7 | 11 | 25.8% | 27.3% | 23.3% | 1.5% | 30.0% |
| chop | T+210 0_5_1 medium | warning-only | 98 | 54.1% | 76 | warning-only | 0/12 | 12/12 | 96 | 53.9% | 55.2% | 11.7% | 1.3% | 55.2% |
| chop | T+210 1_2 high | usable | 215 | 66.0% | 189 | usable | 12/12 | 12/12 | 215 | 66.2% | 66.5% | 12.0% | 0.3% | 21.3% |
| chop | T+210 1_2 low | ignored | 45 | 55.6% | 35 | ignored | 0/12 | 0/12 | 44 | 53.9% | 56.8% | 22.9% | 2.9% | 56.8% |
| chop | T+210 1_2 medium | usable | 164 | 65.9% | 121 | usable | 12/12 | 12/12 | 165 | 66.4% | 64.8% | 10.2% | 1.5% | 34.2% |
| chop | T+210 2_3 high | usable | 152 | 67.8% | 136 | usable | 12/12 | 12/12 | 152 | 68.0% | 67.8% | 11.4% | 0.2% | 25.9% |
| chop | T+210 2_3 low | warning-only | 71 | 73.2% | 51 | warning-only | 0/12 | 12/12 | 66 | 72.9% | 72.7% | 13.4% | 0.2% | 72.7% |
| chop | T+210 2_3 medium | usable | 131 | 72.5% | 107 | usable | 12/12 | 12/12 | 136 | 72.8% | 72.8% | 7.9% | 0.0% | 31.1% |
| chop | T+210 2_3 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| chop | T+210 3_4 high | usable | 121 | 79.3% | 103 | usable | 12/12 | 12/12 | 121 | 79.4% | 79.3% | 10.0% | 0.1% | 21.6% |
| chop | T+210 3_4 low | warning-only | 95 | 74.7% | 71 | warning-only | 0/12 | 12/12 | 91 | 74.5% | 73.6% | 12.0% | 0.8% | 26.4% |
| chop | T+210 3_4 medium | usable | 117 | 77.8% | 104 | usable | 12/12 | 12/12 | 121 | 77.9% | 78.5% | 15.9% | 0.6% | 35.7% |
| chop | T+210 4_5 high | warning-only | 93 | 80.6% | 80 | warning-only | 0/12 | 12/12 | 94 | 80.6% | 80.9% | 14.0% | 0.2% | 28.5% |
| chop | T+210 4_5 low | warning-only | 78 | 89.7% | 64 | warning-only | 0/12 | 12/12 | 78 | 89.8% | 89.7% | 11.4% | 0.0% | 31.8% |
| chop | T+210 4_5 medium | warning-only | 78 | 79.5% | 68 | warning-only | 0/12 | 12/12 | 77 | 79.5% | 79.2% | 19.3% | 0.3% | 46.8% |
| chop | T+210 5_7_5 high | usable | 136 | 86.0% | 120 | usable | 12/12 | 12/12 | 136 | 86.1% | 86.0% | 8.8% | 0.0% | 18.0% |
| chop | T+210 5_7_5 low | usable | 230 | 87.8% | 202 | usable | 12/12 | 12/12 | 228 | 87.9% | 88.2% | 7.0% | 0.3% | 18.0% |
| chop | T+210 5_7_5 medium | usable | 174 | 85.6% | 150 | usable | 12/12 | 12/12 | 176 | 85.6% | 85.2% | 5.4% | 0.4% | 16.1% |
| chop | T+210 7_5_10 high | warning-only | 73 | 93.2% | 62 | warning-only | 0/11 | 11/11 | 74 | 93.2% | 93.2% | 8.7% | 0.1% | 13.3% |
| chop | T+210 7_5_10 low | usable | 163 | 92.0% | 142 | usable | 12/12 | 12/12 | 161 | 92.1% | 91.9% | 7.7% | 0.1% | 12.7% |
| chop | T+210 7_5_10 medium | usable | 100 | 90.0% | 83 | warning-only | 1/12 | 12/12 | 101 | 90.3% | 90.1% | 10.3% | 0.2% | 91.3% |
| chop | T+210 gt_10 high | warning-only | 99 | 91.9% | 83 | warning-only | 0/12 | 12/12 | 100 | 91.6% | 91.0% | 10.0% | 0.6% | 26.8% |
| chop | T+210 gt_10 low | usable | 415 | 96.9% | 362 | usable | 12/12 | 12/12 | 415 | 96.8% | 96.9% | 1.7% | 0.0% | 4.0% |
| chop | T+210 gt_10 medium | usable | 173 | 97.7% | 146 | usable | 12/12 | 12/12 | 172 | 97.9% | 98.3% | 2.7% | 0.4% | 4.6% |
| chop | T+220 0_5_1 high | usable | 126 | 61.1% | 98 | warning-only | 11/12 | 12/12 | 126 | 60.9% | 61.9% | 10.9% | 1.0% | 38.6% |
| chop | T+220 0_5_1 low | ignored | 11 | 36.4% | 7 | ignored | 0/7 | 0/7 | 11 | 33.5% | 36.4% | 31.9% | 2.8% | 75.0% |
| chop | T+220 0_5_1 medium | warning-only | 80 | 58.8% | 66 | warning-only | 0/11 | 11/11 | 80 | 59.4% | 57.5% | 13.6% | 1.9% | 25.8% |
| chop | T+220 1_2 high | usable | 190 | 70.0% | 165 | usable | 12/12 | 12/12 | 190 | 69.7% | 69.5% | 5.8% | 0.3% | 21.6% |
| chop | T+220 1_2 low | ignored | 47 | 59.6% | 35 | ignored | 0/11 | 0/11 | 46 | 59.2% | 58.7% | 18.6% | 0.5% | 45.2% |
| chop | T+220 1_2 medium | usable | 172 | 67.4% | 128 | usable | 12/12 | 12/12 | 173 | 68.2% | 68.2% | 7.0% | 0.0% | 19.6% |
| chop | T+220 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| chop | T+220 2_3 high | usable | 160 | 76.3% | 141 | usable | 12/12 | 12/12 | 162 | 76.0% | 75.3% | 10.1% | 0.7% | 27.6% |
| chop | T+220 2_3 low | warning-only | 70 | 71.4% | 48 | ignored | 0/11 | 10/11 | 70 | 72.6% | 71.4% | 17.5% | 1.2% | 72.9% |
| chop | T+220 2_3 medium | usable | 141 | 69.5% | 121 | usable | 12/12 | 12/12 | 139 | 68.3% | 70.5% | 13.8% | 2.2% | 29.6% |
| chop | T+220 2_3 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| chop | T+220 3_4 high | usable | 106 | 72.6% | 88 | warning-only | 4/12 | 12/12 | 104 | 72.6% | 72.1% | 15.4% | 0.5% | 47.2% |
| chop | T+220 3_4 low | warning-only | 95 | 80.0% | 77 | warning-only | 0/12 | 12/12 | 92 | 80.2% | 79.3% | 13.1% | 0.9% | 31.1% |
| chop | T+220 3_4 medium | usable | 114 | 82.5% | 99 | warning-only | 11/12 | 12/12 | 119 | 81.9% | 83.2% | 6.8% | 1.3% | 19.0% |
| chop | T+220 4_5 high | warning-only | 88 | 76.1% | 74 | warning-only | 0/12 | 12/12 | 88 | 76.4% | 76.1% | 14.1% | 0.3% | 24.7% |
| chop | T+220 4_5 low | warning-only | 79 | 87.3% | 57 | warning-only | 0/12 | 12/12 | 77 | 87.7% | 88.3% | 9.3% | 0.6% | 21.9% |
| chop | T+220 4_5 medium | warning-only | 94 | 83.0% | 80 | warning-only | 0/12 | 12/12 | 96 | 82.6% | 82.3% | 15.2% | 0.3% | 29.8% |
| chop | T+220 5_7_5 high | usable | 113 | 91.2% | 96 | warning-only | 7/12 | 12/12 | 113 | 91.0% | 91.2% | 10.6% | 0.2% | 25.6% |
| chop | T+220 5_7_5 low | usable | 239 | 87.4% | 209 | usable | 12/12 | 12/12 | 237 | 87.9% | 87.3% | 6.3% | 0.6% | 12.9% |
| chop | T+220 5_7_5 medium | usable | 161 | 88.8% | 139 | usable | 12/12 | 12/12 | 163 | 88.4% | 89.0% | 6.2% | 0.6% | 12.3% |
| chop | T+220 7_5_10 high | warning-only | 83 | 90.4% | 72 | warning-only | 0/12 | 12/12 | 83 | 90.6% | 90.4% | 10.1% | 0.2% | 20.4% |
| chop | T+220 7_5_10 low | usable | 180 | 92.2% | 158 | usable | 12/12 | 12/12 | 180 | 92.4% | 92.2% | 5.5% | 0.2% | 11.2% |
| chop | T+220 7_5_10 medium | usable | 111 | 91.9% | 94 | warning-only | 7/12 | 12/12 | 111 | 91.5% | 91.9% | 6.1% | 0.4% | 24.9% |
| chop | T+220 gt_10 high | warning-only | 80 | 97.5% | 65 | warning-only | 0/12 | 12/12 | 79 | 97.4% | 97.5% | 4.6% | 0.1% | 15.3% |
| chop | T+220 gt_10 low | usable | 460 | 97.4% | 400 | usable | 12/12 | 12/12 | 461 | 97.4% | 97.4% | 2.2% | 0.0% | 4.1% |
| chop | T+220 gt_10 medium | usable | 152 | 98.7% | 126 | usable | 12/12 | 12/12 | 152 | 98.7% | 98.7% | 2.2% | 0.0% | 5.1% |
| chop | T+240 0_5_1 high | warning-only | 95 | 65.3% | 70 | warning-only | 0/12 | 12/12 | 93 | 64.1% | 64.5% | 15.7% | 0.5% | 35.5% |
| chop | T+240 0_5_1 low | ignored | 16 | 62.5% | 12 | ignored | 0/7 | 0/7 | 16 | 63.2% | 62.5% | 24.9% | 0.7% | 61.5% |
| chop | T+240 0_5_1 medium | warning-only | 90 | 70.0% | 68 | warning-only | 0/12 | 12/12 | 92 | 71.1% | 70.7% | 12.7% | 0.5% | 53.2% |
| chop | T+240 1_2 high | usable | 197 | 70.1% | 173 | usable | 12/12 | 12/12 | 196 | 70.1% | 70.4% | 13.0% | 0.3% | 45.3% |
| chop | T+240 1_2 low | ignored | 34 | 67.6% | 26 | ignored | 0/11 | 0/11 | 32 | 65.2% | 68.8% | 33.2% | 3.5% | 69.7% |
| chop | T+240 1_2 medium | usable | 168 | 73.8% | 134 | usable | 12/12 | 12/12 | 171 | 73.9% | 73.1% | 11.8% | 0.8% | 36.3% |
| chop | T+240 2_3 high | usable | 146 | 73.3% | 128 | usable | 12/12 | 12/12 | 150 | 73.3% | 72.0% | 11.2% | 1.3% | 27.9% |
| chop | T+240 2_3 low | warning-only | 80 | 73.8% | 62 | warning-only | 0/12 | 12/12 | 78 | 73.7% | 73.1% | 13.4% | 0.6% | 36.0% |
| chop | T+240 2_3 medium | usable | 143 | 67.1% | 118 | usable | 12/12 | 12/12 | 141 | 67.3% | 68.8% | 10.0% | 1.5% | 32.9% |
| chop | T+240 2_3 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| chop | T+240 3_4 high | usable | 108 | 80.6% | 94 | warning-only | 5/12 | 12/12 | 107 | 80.4% | 81.3% | 10.2% | 0.9% | 25.0% |
| chop | T+240 3_4 low | warning-only | 88 | 78.4% | 72 | warning-only | 0/12 | 12/12 | 87 | 78.3% | 78.2% | 15.2% | 0.2% | 46.7% |
| chop | T+240 3_4 medium | usable | 114 | 80.7% | 101 | usable | 12/12 | 12/12 | 116 | 80.4% | 80.2% | 9.7% | 0.3% | 33.0% |
| chop | T+240 4_5 high | warning-only | 61 | 85.2% | 51 | warning-only | 0/12 | 12/12 | 62 | 85.7% | 85.5% | 14.3% | 0.2% | 27.7% |
| chop | T+240 4_5 low | usable | 119 | 85.7% | 97 | warning-only | 10/12 | 12/12 | 115 | 85.7% | 85.2% | 10.9% | 0.5% | 30.2% |
| chop | T+240 4_5 medium | warning-only | 83 | 96.4% | 71 | warning-only | 0/12 | 12/12 | 86 | 96.1% | 96.5% | 6.0% | 0.4% | 30.8% |
| chop | T+240 5_7_5 high | usable | 117 | 88.9% | 103 | usable | 12/12 | 12/12 | 119 | 88.9% | 89.1% | 6.5% | 0.2% | 89.6% |
| chop | T+240 5_7_5 low | usable | 238 | 91.2% | 208 | usable | 12/12 | 12/12 | 234 | 91.2% | 91.0% | 4.6% | 0.2% | 22.2% |
| chop | T+240 5_7_5 medium | usable | 162 | 86.4% | 140 | usable | 12/12 | 12/12 | 164 | 86.5% | 86.6% | 6.7% | 0.1% | 17.5% |
| chop | T+240 7_5_10 high | warning-only | 73 | 98.6% | 63 | warning-only | 0/11 | 11/11 | 74 | 98.6% | 98.6% | 2.7% | 0.0% | 16.7% |
| chop | T+240 7_5_10 low | usable | 174 | 90.8% | 154 | usable | 12/12 | 12/12 | 173 | 90.9% | 90.8% | 6.7% | 0.1% | 19.2% |
| chop | T+240 7_5_10 medium | usable | 111 | 96.4% | 94 | warning-only | 5/12 | 12/12 | 111 | 96.3% | 96.4% | 5.2% | 0.1% | 30.7% |
| chop | T+240 gt_10 high | warning-only | 75 | 94.7% | 60 | warning-only | 0/11 | 11/11 | 76 | 94.8% | 94.7% | 5.6% | 0.1% | 8.3% |
| chop | T+240 gt_10 low | usable | 490 | 98.6% | 426 | usable | 12/12 | 12/12 | 489 | 98.6% | 98.6% | 1.3% | 0.0% | 7.1% |
| chop | T+240 gt_10 medium | usable | 163 | 98.2% | 137 | usable | 12/12 | 12/12 | 163 | 98.2% | 98.2% | 2.7% | 0.0% | 9.8% |
| leaderAge | T+180 0_5_1 10_30 | ignored | 49 | 57.1% | 41 | ignored | 0/12 | 0/12 | 49 | 57.7% | 57.1% | 23.3% | 0.6% | 59.6% |
| leaderAge | T+180 0_5_1 30_60 | ignored | 37 | 56.8% | 30 | ignored | 0/11 | 0/11 | 37 | 56.4% | 56.8% | 21.0% | 0.4% | 60.0% |
| leaderAge | T+180 0_5_1 60_120 | warning-only | 52 | 55.8% | 39 | ignored | 0/12 | 3/12 | 52 | 55.6% | 55.8% | 18.1% | 0.2% | 56.9% |
| leaderAge | T+180 0_5_1 gte_120 | warning-only | 69 | 50.7% | 52 | warning-only | 0/12 | 12/12 | 69 | 49.8% | 50.7% | 18.7% | 0.9% | 53.0% |
| leaderAge | T+180 0_5_1 lt_10 | ignored | 46 | 58.7% | 40 | ignored | 0/12 | 0/12 | 46 | 58.8% | 58.7% | 28.2% | 0.1% | 45.2% |
| leaderAge | T+180 1_2 10_30 | warning-only | 57 | 54.4% | 49 | ignored | 0/12 | 11/12 | 57 | 54.6% | 54.4% | 13.7% | 0.2% | 48.1% |
| leaderAge | T+180 1_2 30_60 | warning-only | 70 | 54.3% | 60 | warning-only | 0/12 | 12/12 | 70 | 54.0% | 54.3% | 22.1% | 0.3% | 56.7% |
| leaderAge | T+180 1_2 60_120 | warning-only | 99 | 62.6% | 71 | warning-only | 0/12 | 12/12 | 99 | 63.5% | 62.6% | 17.9% | 0.8% | 44.9% |
| leaderAge | T+180 1_2 gte_120 | usable | 168 | 63.7% | 137 | usable | 12/12 | 12/12 | 168 | 63.6% | 63.7% | 11.2% | 0.1% | 32.1% |
| leaderAge | T+180 1_2 lt_10 | ignored | 44 | 65.9% | 37 | ignored | 0/12 | 0/12 | 44 | 65.8% | 65.9% | 22.7% | 0.1% | 70.7% |
| leaderAge | T+180 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+180 2_3 10_30 | ignored | 41 | 51.2% | 35 | ignored | 0/11 | 0/11 | 41 | 51.4% | 51.2% | 20.7% | 0.1% | 55.3% |
| leaderAge | T+180 2_3 30_60 | warning-only | 51 | 56.9% | 42 | ignored | 0/12 | 1/12 | 51 | 57.2% | 56.9% | 20.3% | 0.4% | 58.0% |
| leaderAge | T+180 2_3 60_120 | warning-only | 73 | 71.2% | 62 | warning-only | 0/12 | 12/12 | 73 | 71.3% | 71.2% | 18.9% | 0.0% | 75.4% |
| leaderAge | T+180 2_3 gte_120 | usable | 183 | 65.6% | 146 | usable | 12/12 | 12/12 | 183 | 65.4% | 65.6% | 9.5% | 0.2% | 28.8% |
| leaderAge | T+180 2_3 lt_10 | ignored | 23 | 65.2% | 20 | ignored | 0/10 | 0/10 | 23 | 65.3% | 65.2% | 27.8% | 0.1% | 68.2% |
| leaderAge | T+180 3_4 10_30 | ignored | 28 | 78.6% | 21 | ignored | 0/9 | 0/9 | 28 | 78.8% | 78.6% | 16.2% | 0.2% | 30.8% |
| leaderAge | T+180 3_4 30_60 | ignored | 38 | 63.2% | 32 | ignored | 0/11 | 0/11 | 38 | 63.3% | 63.2% | 19.6% | 0.1% | 64.9% |
| leaderAge | T+180 3_4 60_120 | warning-only | 89 | 75.3% | 75 | warning-only | 0/12 | 12/12 | 89 | 75.1% | 75.3% | 13.1% | 0.2% | 45.0% |
| leaderAge | T+180 3_4 gte_120 | usable | 173 | 79.8% | 145 | usable | 12/12 | 12/12 | 173 | 79.7% | 79.8% | 7.7% | 0.1% | 19.7% |
| leaderAge | T+180 3_4 lt_10 | ignored | 12 | 66.7% | 9 | ignored | 0/8 | 0/8 | 12 | 64.3% | 66.7% | 45.4% | 2.3% | 72.7% |
| leaderAge | T+180 3_4 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+180 4_5 10_30 | ignored | 19 | 63.2% | 14 | ignored | 0/9 | 0/9 | 19 | 62.2% | 63.2% | 27.4% | 1.0% | 66.7% |
| leaderAge | T+180 4_5 30_60 | ignored | 31 | 71.0% | 25 | ignored | 0/10 | 0/10 | 31 | 71.4% | 71.0% | 30.2% | 0.5% | 73.3% |
| leaderAge | T+180 4_5 60_120 | warning-only | 79 | 83.5% | 68 | warning-only | 0/12 | 12/12 | 79 | 83.6% | 83.5% | 15.3% | 0.0% | 34.4% |
| leaderAge | T+180 4_5 gte_120 | usable | 148 | 81.8% | 130 | usable | 12/12 | 12/12 | 148 | 81.6% | 81.8% | 9.2% | 0.1% | 23.3% |
| leaderAge | T+180 4_5 lt_10 | ignored | 3 | 100.0% | 2 | ignored | 0/3 | 0/3 | 3 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+180 5_7_5 10_30 | ignored | 18 | 88.9% | 14 | ignored | 0/7 | 0/7 | 18 | 88.0% | 88.9% | 23.1% | 0.9% | 100.0% |
| leaderAge | T+180 5_7_5 30_60 | warning-only | 54 | 81.5% | 46 | ignored | 0/12 | 6/12 | 54 | 81.4% | 81.5% | 12.9% | 0.1% | 84.6% |
| leaderAge | T+180 5_7_5 60_120 | usable | 107 | 81.3% | 94 | warning-only | 3/12 | 12/12 | 107 | 81.2% | 81.3% | 10.1% | 0.2% | 25.9% |
| leaderAge | T+180 5_7_5 gte_120 | usable | 324 | 82.7% | 288 | usable | 12/12 | 12/12 | 324 | 82.7% | 82.7% | 4.9% | 0.0% | 12.1% |
| leaderAge | T+180 5_7_5 lt_10 | ignored | 3 | 66.7% | 1 | ignored | 0/2 | 0/2 | 3 | 83.3% | 66.7% | 50.0% | 16.7% | 50.0% |
| leaderAge | T+180 7_5_10 10_30 | ignored | 10 | 90.0% | 8 | ignored | 0/7 | 0/7 | 10 | 90.6% | 90.0% | 19.4% | 0.6% | 50.0% |
| leaderAge | T+180 7_5_10 30_60 | ignored | 16 | 93.8% | 14 | ignored | 0/9 | 0/9 | 16 | 93.8% | 93.8% | 12.4% | 0.1% | 50.0% |
| leaderAge | T+180 7_5_10 60_120 | warning-only | 64 | 84.4% | 52 | warning-only | 0/11 | 11/11 | 64 | 85.0% | 84.4% | 11.8% | 0.6% | 21.8% |
| leaderAge | T+180 7_5_10 gte_120 | usable | 235 | 89.8% | 209 | usable | 12/12 | 12/12 | 235 | 89.8% | 89.8% | 4.6% | 0.1% | 10.4% |
| leaderAge | T+180 7_5_10 lt_10 | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+180 gt_10 10_30 | ignored | 6 | 66.7% | 4 | ignored | 0/5 | 0/5 | 6 | 63.3% | 66.7% | 56.7% | 3.3% | 80.0% |
| leaderAge | T+180 gt_10 30_60 | ignored | 18 | 83.3% | 14 | ignored | 0/8 | 0/8 | 18 | 83.8% | 83.3% | 19.3% | 0.4% | 37.5% |
| leaderAge | T+180 gt_10 60_120 | usable | 104 | 94.2% | 84 | warning-only | 0/11 | 11/11 | 104 | 94.4% | 94.2% | 5.7% | 0.1% | 11.6% |
| leaderAge | T+180 gt_10 gte_120 | usable | 469 | 95.7% | 409 | usable | 12/12 | 12/12 | 469 | 95.7% | 95.7% | 2.0% | 0.0% | 4.4% |
| leaderAge | T+180 gt_10 lt_10 | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+200 0_5_1 10_30 | ignored | 35 | 65.7% | 30 | ignored | 0/12 | 0/12 | 35 | 65.8% | 65.7% | 18.1% | 0.1% | 67.6% |
| leaderAge | T+200 0_5_1 30_60 | ignored | 39 | 69.2% | 29 | ignored | 0/11 | 0/11 | 39 | 68.4% | 69.2% | 21.2% | 0.8% | 73.0% |
| leaderAge | T+200 0_5_1 60_120 | ignored | 39 | 48.7% | 28 | ignored | 0/10 | 0/10 | 39 | 49.1% | 48.7% | 23.7% | 0.4% | 55.6% |
| leaderAge | T+200 0_5_1 gte_120 | warning-only | 69 | 62.3% | 56 | warning-only | 0/12 | 12/12 | 69 | 62.3% | 62.3% | 12.5% | 0.0% | 64.2% |
| leaderAge | T+200 0_5_1 lt_10 | warning-only | 52 | 67.3% | 45 | ignored | 0/12 | 2/12 | 52 | 67.5% | 67.3% | 16.2% | 0.2% | 45.8% |
| leaderAge | T+200 1_2 10_30 | warning-only | 73 | 75.3% | 64 | warning-only | 0/12 | 12/12 | 73 | 75.5% | 75.3% | 14.7% | 0.2% | 56.5% |
| leaderAge | T+200 1_2 30_60 | ignored | 47 | 55.3% | 41 | ignored | 0/12 | 0/12 | 47 | 55.5% | 55.3% | 16.9% | 0.2% | 46.7% |
| leaderAge | T+200 1_2 60_120 | warning-only | 80 | 60.0% | 63 | warning-only | 0/12 | 12/12 | 80 | 60.3% | 60.0% | 11.7% | 0.3% | 41.6% |
| leaderAge | T+200 1_2 gte_120 | usable | 175 | 63.4% | 130 | usable | 12/12 | 12/12 | 175 | 63.5% | 63.4% | 11.7% | 0.0% | 28.2% |
| leaderAge | T+200 1_2 lt_10 | warning-only | 56 | 58.9% | 47 | ignored | 0/11 | 7/11 | 56 | 59.4% | 58.9% | 17.5% | 0.5% | 41.8% |
| leaderAge | T+200 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+200 2_3 10_30 | ignored | 41 | 75.6% | 34 | ignored | 0/12 | 0/12 | 41 | 75.0% | 75.6% | 20.5% | 0.6% | 79.5% |
| leaderAge | T+200 2_3 30_60 | ignored | 41 | 56.1% | 35 | ignored | 0/12 | 0/12 | 41 | 55.6% | 56.1% | 32.9% | 0.5% | 60.5% |
| leaderAge | T+200 2_3 60_120 | warning-only | 73 | 68.5% | 61 | warning-only | 0/12 | 12/12 | 73 | 68.7% | 68.5% | 17.4% | 0.3% | 46.0% |
| leaderAge | T+200 2_3 gte_120 | usable | 194 | 65.5% | 149 | usable | 12/12 | 12/12 | 194 | 65.6% | 65.5% | 7.5% | 0.1% | 20.7% |
| leaderAge | T+200 2_3 lt_10 | ignored | 23 | 73.9% | 19 | ignored | 0/11 | 0/11 | 23 | 73.9% | 73.9% | 20.1% | 0.0% | 77.3% |
| leaderAge | T+200 2_3 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+200 3_4 10_30 | ignored | 14 | 78.6% | 12 | ignored | 0/11 | 0/11 | 14 | 78.4% | 78.6% | 33.9% | 0.2% | 84.6% |
| leaderAge | T+200 3_4 30_60 | ignored | 27 | 66.7% | 21 | ignored | 0/10 | 0/10 | 27 | 67.1% | 66.7% | 25.3% | 0.4% | 69.2% |
| leaderAge | T+200 3_4 60_120 | warning-only | 64 | 78.1% | 56 | warning-only | 0/12 | 12/12 | 64 | 77.9% | 78.1% | 18.2% | 0.2% | 63.1% |
| leaderAge | T+200 3_4 gte_120 | usable | 193 | 80.3% | 160 | usable | 12/12 | 12/12 | 193 | 79.9% | 80.3% | 9.9% | 0.4% | 41.4% |
| leaderAge | T+200 3_4 lt_10 | ignored | 21 | 61.9% | 16 | ignored | 0/10 | 0/10 | 21 | 62.0% | 61.9% | 28.0% | 0.1% | 65.0% |
| leaderAge | T+200 4_5 10_30 | ignored | 18 | 88.9% | 15 | ignored | 0/10 | 0/10 | 18 | 89.2% | 88.9% | 18.3% | 0.3% | 43.8% |
| leaderAge | T+200 4_5 30_60 | ignored | 30 | 83.3% | 25 | ignored | 0/11 | 0/11 | 30 | 82.7% | 83.3% | 24.9% | 0.7% | 86.2% |
| leaderAge | T+200 4_5 60_120 | ignored | 49 | 73.5% | 43 | ignored | 0/12 | 0/12 | 49 | 73.8% | 73.5% | 18.6% | 0.3% | 37.3% |
| leaderAge | T+200 4_5 gte_120 | usable | 159 | 81.8% | 140 | usable | 12/12 | 12/12 | 159 | 81.7% | 81.8% | 7.2% | 0.1% | 25.8% |
| leaderAge | T+200 4_5 lt_10 | ignored | 5 | 60.0% | 4 | ignored | 0/5 | 0/5 | 5 | 60.0% | 60.0% | 60.0% | 0.0% | 75.0% |
| leaderAge | T+200 5_7_5 10_30 | ignored | 23 | 82.6% | 19 | ignored | 0/10 | 0/10 | 23 | 82.5% | 82.6% | 20.3% | 0.1% | 86.4% |
| leaderAge | T+200 5_7_5 30_60 | warning-only | 50 | 88.0% | 41 | ignored | 0/11 | 0/11 | 50 | 88.3% | 88.0% | 10.0% | 0.3% | 15.5% |
| leaderAge | T+200 5_7_5 60_120 | warning-only | 82 | 76.8% | 71 | warning-only | 0/12 | 12/12 | 82 | 76.7% | 76.8% | 16.1% | 0.1% | 39.2% |
| leaderAge | T+200 5_7_5 gte_120 | usable | 368 | 87.5% | 334 | usable | 12/12 | 12/12 | 368 | 87.5% | 87.5% | 5.4% | 0.0% | 13.7% |
| leaderAge | T+200 5_7_5 lt_10 | ignored | 6 | 50.0% | 4 | ignored | 0/5 | 0/5 | 6 | 50.0% | 50.0% | 40.0% | 0.0% | 60.0% |
| leaderAge | T+200 7_5_10 10_30 | ignored | 6 | 100.0% | 4 | ignored | 0/5 | 0/5 | 6 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+200 7_5_10 30_60 | ignored | 28 | 78.6% | 23 | ignored | 0/10 | 0/10 | 28 | 78.5% | 78.6% | 14.1% | 0.0% | 30.8% |
| leaderAge | T+200 7_5_10 60_120 | warning-only | 58 | 89.7% | 49 | ignored | 0/12 | 11/12 | 58 | 89.7% | 89.7% | 7.8% | 0.1% | 15.7% |
| leaderAge | T+200 7_5_10 gte_120 | usable | 252 | 88.9% | 225 | usable | 12/12 | 12/12 | 252 | 88.9% | 88.9% | 5.5% | 0.0% | 11.3% |
| leaderAge | T+200 7_5_10 lt_10 | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+200 gt_10 10_30 | ignored | 4 | 100.0% | 3 | ignored | 0/4 | 0/4 | 4 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+200 gt_10 30_60 | ignored | 20 | 90.0% | 15 | ignored | 0/9 | 0/9 | 20 | 89.8% | 90.0% | 16.4% | 0.2% | 94.7% |
| leaderAge | T+200 gt_10 60_120 | warning-only | 85 | 94.1% | 69 | warning-only | 0/12 | 12/12 | 85 | 94.4% | 94.1% | 7.8% | 0.3% | 12.6% |
| leaderAge | T+200 gt_10 gte_120 | usable | 542 | 97.4% | 473 | usable | 12/12 | 12/12 | 542 | 97.4% | 97.4% | 0.8% | 0.0% | 2.7% |
| leaderAge | T+200 gt_10 lt_10 | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+210 0_5_1 10_30 | ignored | 36 | 55.6% | 30 | ignored | 0/12 | 0/12 | 36 | 55.0% | 55.6% | 22.3% | 0.5% | 58.8% |
| leaderAge | T+210 0_5_1 30_60 | ignored | 35 | 51.4% | 28 | ignored | 0/11 | 0/11 | 35 | 51.7% | 51.4% | 18.0% | 0.3% | 54.5% |
| leaderAge | T+210 0_5_1 60_120 | ignored | 32 | 56.3% | 22 | ignored | 0/11 | 0/11 | 32 | 56.3% | 56.3% | 23.6% | 0.1% | 62.1% |
| leaderAge | T+210 0_5_1 gte_120 | warning-only | 77 | 50.6% | 60 | warning-only | 0/11 | 11/11 | 77 | 50.5% | 50.6% | 12.3% | 0.1% | 51.3% |
| leaderAge | T+210 0_5_1 lt_10 | ignored | 41 | 58.5% | 35 | ignored | 0/12 | 0/12 | 41 | 58.2% | 58.5% | 23.0% | 0.4% | 61.5% |
| leaderAge | T+210 1_2 10_30 | warning-only | 67 | 65.7% | 57 | warning-only | 0/12 | 12/12 | 67 | 65.5% | 65.7% | 14.4% | 0.1% | 49.4% |
| leaderAge | T+210 1_2 30_60 | warning-only | 62 | 67.7% | 54 | warning-only | 0/12 | 12/12 | 62 | 68.1% | 67.7% | 19.1% | 0.3% | 35.7% |
| leaderAge | T+210 1_2 60_120 | warning-only | 87 | 60.9% | 66 | warning-only | 0/12 | 12/12 | 87 | 60.8% | 60.9% | 12.7% | 0.1% | 63.9% |
| leaderAge | T+210 1_2 gte_120 | usable | 166 | 64.5% | 122 | usable | 12/12 | 12/12 | 166 | 64.4% | 64.5% | 11.3% | 0.0% | 36.6% |
| leaderAge | T+210 1_2 lt_10 | ignored | 42 | 69.0% | 35 | ignored | 0/11 | 0/11 | 42 | 69.3% | 69.0% | 14.8% | 0.2% | 38.5% |
| leaderAge | T+210 2_3 10_30 | ignored | 37 | 75.7% | 32 | ignored | 0/12 | 0/12 | 37 | 75.3% | 75.7% | 18.4% | 0.4% | 77.8% |
| leaderAge | T+210 2_3 30_60 | ignored | 41 | 78.0% | 36 | ignored | 0/12 | 0/12 | 41 | 78.3% | 78.0% | 24.2% | 0.3% | 58.8% |
| leaderAge | T+210 2_3 60_120 | warning-only | 70 | 60.0% | 62 | warning-only | 0/12 | 12/12 | 70 | 60.0% | 60.0% | 14.4% | 0.0% | 25.5% |
| leaderAge | T+210 2_3 gte_120 | usable | 187 | 71.1% | 143 | usable | 12/12 | 12/12 | 187 | 71.2% | 71.1% | 6.5% | 0.1% | 44.2% |
| leaderAge | T+210 2_3 lt_10 | ignored | 19 | 78.9% | 15 | ignored | 0/9 | 0/9 | 19 | 79.5% | 78.9% | 17.5% | 0.6% | 32.4% |
| leaderAge | T+210 2_3 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+210 3_4 10_30 | ignored | 35 | 80.0% | 30 | ignored | 0/12 | 0/12 | 35 | 80.4% | 80.0% | 20.3% | 0.4% | 33.9% |
| leaderAge | T+210 3_4 30_60 | ignored | 35 | 77.1% | 29 | ignored | 0/12 | 0/12 | 35 | 77.1% | 77.1% | 21.3% | 0.0% | 79.4% |
| leaderAge | T+210 3_4 60_120 | ignored | 49 | 85.7% | 41 | ignored | 0/12 | 0/12 | 49 | 85.7% | 85.7% | 18.7% | 0.0% | 89.4% |
| leaderAge | T+210 3_4 gte_120 | usable | 198 | 75.8% | 170 | usable | 12/12 | 12/12 | 198 | 75.4% | 75.8% | 10.7% | 0.3% | 32.1% |
| leaderAge | T+210 3_4 lt_10 | ignored | 16 | 68.8% | 12 | ignored | 0/7 | 0/7 | 16 | 67.2% | 68.8% | 37.8% | 1.6% | 73.3% |
| leaderAge | T+210 4_5 10_30 | ignored | 17 | 94.1% | 12 | ignored | 0/9 | 0/9 | 17 | 95.2% | 94.1% | 10.7% | 1.1% | 20.0% |
| leaderAge | T+210 4_5 30_60 | ignored | 30 | 63.3% | 26 | ignored | 0/11 | 0/11 | 30 | 63.1% | 63.3% | 23.9% | 0.2% | 67.9% |
| leaderAge | T+210 4_5 60_120 | ignored | 47 | 83.0% | 40 | ignored | 0/12 | 0/12 | 47 | 82.8% | 83.0% | 15.2% | 0.2% | 84.8% |
| leaderAge | T+210 4_5 gte_120 | usable | 148 | 86.5% | 126 | usable | 12/12 | 12/12 | 148 | 86.5% | 86.5% | 10.4% | 0.0% | 30.8% |
| leaderAge | T+210 4_5 lt_10 | ignored | 7 | 71.4% | 5 | ignored | 0/6 | 0/6 | 7 | 76.2% | 71.4% | 52.4% | 4.8% | 100.0% |
| leaderAge | T+210 5_7_5 10_30 | ignored | 22 | 68.2% | 18 | ignored | 0/9 | 0/9 | 22 | 68.3% | 68.2% | 29.6% | 0.1% | 71.4% |
| leaderAge | T+210 5_7_5 30_60 | ignored | 39 | 82.1% | 33 | ignored | 0/11 | 0/11 | 39 | 82.2% | 82.1% | 19.7% | 0.2% | 37.9% |
| leaderAge | T+210 5_7_5 60_120 | warning-only | 94 | 86.2% | 82 | warning-only | 0/12 | 12/12 | 94 | 86.1% | 86.2% | 12.9% | 0.0% | 31.4% |
| leaderAge | T+210 5_7_5 gte_120 | usable | 380 | 88.4% | 340 | usable | 12/12 | 12/12 | 380 | 88.4% | 88.4% | 4.2% | 0.0% | 13.1% |
| leaderAge | T+210 5_7_5 lt_10 | ignored | 5 | 80.0% | 3 | ignored | 0/4 | 0/4 | 5 | 85.0% | 80.0% | 35.0% | 5.0% | 50.0% |
| leaderAge | T+210 7_5_10 10_30 | ignored | 9 | 100.0% | 7 | ignored | 0/7 | 0/7 | 9 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+210 7_5_10 30_60 | ignored | 16 | 68.8% | 12 | ignored | 0/10 | 0/10 | 16 | 66.7% | 68.8% | 40.2% | 2.0% | 73.3% |
| leaderAge | T+210 7_5_10 60_120 | warning-only | 54 | 90.7% | 46 | ignored | 0/10 | 4/10 | 54 | 91.0% | 90.7% | 12.4% | 0.2% | 22.2% |
| leaderAge | T+210 7_5_10 gte_120 | usable | 255 | 92.9% | 222 | usable | 12/12 | 12/12 | 255 | 93.0% | 92.9% | 6.1% | 0.0% | 9.3% |
| leaderAge | T+210 7_5_10 lt_10 | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+210 gt_10 10_30 | ignored | 3 | 100.0% | 2 | ignored | 0/3 | 0/3 | 3 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+210 gt_10 30_60 | ignored | 22 | 95.5% | 17 | ignored | 0/9 | 0/9 | 22 | 95.7% | 95.5% | 8.9% | 0.2% | 25.0% |
| leaderAge | T+210 gt_10 60_120 | warning-only | 77 | 90.9% | 65 | warning-only | 0/12 | 12/12 | 77 | 91.1% | 90.9% | 8.7% | 0.2% | 25.2% |
| leaderAge | T+210 gt_10 gte_120 | usable | 582 | 97.3% | 515 | usable | 12/12 | 12/12 | 582 | 97.2% | 97.3% | 1.3% | 0.0% | 2.8% |
| leaderAge | T+210 gt_10 lt_10 | ignored | 3 | 66.7% | 2 | ignored | 0/3 | 0/3 | 3 | 66.7% | 66.7% | 66.7% | 0.0% | 100.0% |
| leaderAge | T+220 0_5_1 10_30 | ignored | 39 | 69.2% | 32 | ignored | 0/10 | 0/10 | 39 | 69.1% | 69.2% | 17.7% | 0.1% | 49.3% |
| leaderAge | T+220 0_5_1 30_60 | ignored | 30 | 76.7% | 25 | ignored | 0/11 | 0/11 | 30 | 76.7% | 76.7% | 17.8% | 0.0% | 79.3% |
| leaderAge | T+220 0_5_1 60_120 | ignored | 34 | 50.0% | 24 | ignored | 0/12 | 0/12 | 34 | 48.7% | 50.0% | 19.7% | 1.3% | 53.1% |
| leaderAge | T+220 0_5_1 gte_120 | warning-only | 63 | 54.0% | 47 | ignored | 0/12 | 11/12 | 63 | 54.9% | 54.0% | 15.7% | 0.9% | 55.7% |
| leaderAge | T+220 0_5_1 lt_10 | warning-only | 51 | 52.9% | 43 | ignored | 0/12 | 1/12 | 51 | 52.8% | 52.9% | 16.5% | 0.1% | 54.0% |
| leaderAge | T+220 1_2 10_30 | ignored | 46 | 69.6% | 40 | ignored | 0/12 | 0/12 | 46 | 69.6% | 69.6% | 15.1% | 0.0% | 48.8% |
| leaderAge | T+220 1_2 30_60 | warning-only | 50 | 68.0% | 43 | ignored | 0/11 | 0/11 | 50 | 67.3% | 68.0% | 23.4% | 0.7% | 46.7% |
| leaderAge | T+220 1_2 60_120 | warning-only | 80 | 67.5% | 66 | warning-only | 0/12 | 12/12 | 80 | 67.6% | 67.5% | 13.7% | 0.1% | 44.7% |
| leaderAge | T+220 1_2 gte_120 | usable | 179 | 67.6% | 130 | usable | 12/12 | 12/12 | 179 | 68.0% | 67.6% | 10.3% | 0.4% | 33.3% |
| leaderAge | T+220 1_2 lt_10 | warning-only | 54 | 66.7% | 44 | ignored | 0/11 | 5/11 | 54 | 66.9% | 66.7% | 16.5% | 0.2% | 36.7% |
| leaderAge | T+220 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+220 2_3 10_30 | ignored | 38 | 73.7% | 32 | ignored | 0/10 | 0/10 | 38 | 73.8% | 73.7% | 14.6% | 0.1% | 77.8% |
| leaderAge | T+220 2_3 30_60 | ignored | 45 | 80.0% | 39 | ignored | 0/12 | 0/12 | 45 | 80.0% | 80.0% | 16.5% | 0.0% | 50.0% |
| leaderAge | T+220 2_3 60_120 | warning-only | 70 | 74.3% | 60 | warning-only | 0/12 | 12/12 | 70 | 74.3% | 74.3% | 11.2% | 0.0% | 26.9% |
| leaderAge | T+220 2_3 gte_120 | usable | 189 | 71.4% | 145 | usable | 12/12 | 12/12 | 189 | 71.3% | 71.4% | 8.0% | 0.2% | 39.3% |
| leaderAge | T+220 2_3 lt_10 | ignored | 29 | 65.5% | 22 | ignored | 0/11 | 0/11 | 29 | 64.9% | 65.5% | 24.8% | 0.6% | 67.9% |
| leaderAge | T+220 2_3 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+220 3_4 10_30 | ignored | 28 | 82.1% | 23 | ignored | 0/9 | 0/9 | 28 | 82.5% | 82.1% | 25.0% | 0.3% | 85.2% |
| leaderAge | T+220 3_4 30_60 | ignored | 40 | 82.5% | 33 | ignored | 0/12 | 0/12 | 40 | 82.3% | 82.5% | 14.8% | 0.2% | 84.6% |
| leaderAge | T+220 3_4 60_120 | warning-only | 51 | 72.5% | 44 | ignored | 0/12 | 1/12 | 51 | 72.2% | 72.5% | 23.5% | 0.4% | 51.6% |
| leaderAge | T+220 3_4 gte_120 | usable | 191 | 79.1% | 164 | usable | 12/12 | 12/12 | 191 | 78.9% | 79.1% | 8.4% | 0.2% | 22.7% |
| leaderAge | T+220 3_4 lt_10 | ignored | 5 | 60.0% | 4 | ignored | 0/5 | 0/5 | 5 | 60.0% | 60.0% | 60.0% | 0.0% | 75.0% |
| leaderAge | T+220 4_5 10_30 | ignored | 17 | 76.5% | 12 | ignored | 0/7 | 0/7 | 17 | 77.8% | 76.5% | 19.4% | 1.4% | 30.0% |
| leaderAge | T+220 4_5 30_60 | ignored | 28 | 78.6% | 20 | ignored | 0/11 | 0/11 | 28 | 80.4% | 78.6% | 23.3% | 1.8% | 81.5% |
| leaderAge | T+220 4_5 60_120 | warning-only | 53 | 71.7% | 44 | ignored | 0/12 | 5/12 | 53 | 71.7% | 71.7% | 19.9% | 0.0% | 57.1% |
| leaderAge | T+220 4_5 gte_120 | usable | 158 | 86.7% | 134 | usable | 12/12 | 12/12 | 158 | 86.6% | 86.7% | 8.5% | 0.1% | 19.0% |
| leaderAge | T+220 4_5 lt_10 | ignored | 5 | 80.0% | 4 | ignored | 0/5 | 0/5 | 5 | 80.0% | 80.0% | 40.0% | 0.0% | 100.0% |
| leaderAge | T+220 5_7_5 10_30 | ignored | 26 | 80.8% | 22 | ignored | 0/10 | 0/10 | 26 | 81.0% | 80.8% | 30.2% | 0.2% | 84.0% |
| leaderAge | T+220 5_7_5 30_60 | ignored | 40 | 87.5% | 33 | ignored | 0/11 | 0/11 | 40 | 87.3% | 87.5% | 13.0% | 0.2% | 89.7% |
| leaderAge | T+220 5_7_5 60_120 | warning-only | 67 | 92.5% | 57 | warning-only | 0/12 | 12/12 | 67 | 92.6% | 92.5% | 10.1% | 0.0% | 27.1% |
| leaderAge | T+220 5_7_5 gte_120 | usable | 377 | 88.6% | 336 | usable | 12/12 | 12/12 | 377 | 88.6% | 88.6% | 4.6% | 0.0% | 10.1% |
| leaderAge | T+220 5_7_5 lt_10 | ignored | 3 | 100.0% | 2 | ignored | 0/3 | 0/3 | 3 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+220 7_5_10 10_30 | ignored | 17 | 82.4% | 13 | ignored | 0/9 | 0/9 | 17 | 81.9% | 82.4% | 25.6% | 0.5% | 87.5% |
| leaderAge | T+220 7_5_10 30_60 | ignored | 15 | 86.7% | 13 | ignored | 0/10 | 0/10 | 15 | 85.9% | 86.7% | 25.5% | 0.7% | 92.9% |
| leaderAge | T+220 7_5_10 60_120 | warning-only | 55 | 87.3% | 47 | ignored | 0/12 | 8/12 | 55 | 87.2% | 87.3% | 11.3% | 0.1% | 30.0% |
| leaderAge | T+220 7_5_10 gte_120 | usable | 286 | 93.4% | 255 | usable | 12/12 | 12/12 | 286 | 93.3% | 93.4% | 4.5% | 0.0% | 8.2% |
| leaderAge | T+220 7_5_10 lt_10 | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+220 gt_10 10_30 | ignored | 5 | 80.0% | 4 | ignored | 0/5 | 0/5 | 5 | 80.0% | 80.0% | 40.0% | 0.0% | 100.0% |
| leaderAge | T+220 gt_10 30_60 | ignored | 13 | 100.0% | 11 | ignored | 0/9 | 0/9 | 13 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+220 gt_10 60_120 | warning-only | 75 | 93.3% | 61 | warning-only | 0/12 | 12/12 | 75 | 93.6% | 93.3% | 7.1% | 0.2% | 10.9% |
| leaderAge | T+220 gt_10 gte_120 | usable | 598 | 98.3% | 525 | usable | 12/12 | 12/12 | 598 | 98.3% | 98.3% | 1.4% | 0.0% | 3.3% |
| leaderAge | T+220 gt_10 lt_10 | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| leaderAge | T+240 0_5_1 10_30 | ignored | 25 | 68.0% | 20 | ignored | 0/12 | 0/12 | 25 | 68.3% | 68.0% | 25.1% | 0.3% | 70.8% |
| leaderAge | T+240 0_5_1 30_60 | ignored | 28 | 78.6% | 21 | ignored | 0/11 | 0/11 | 28 | 78.2% | 78.6% | 27.7% | 0.4% | 84.6% |
| leaderAge | T+240 0_5_1 60_120 | ignored | 32 | 59.4% | 25 | ignored | 0/9 | 0/9 | 32 | 59.5% | 59.4% | 22.6% | 0.2% | 61.3% |
| leaderAge | T+240 0_5_1 gte_120 | warning-only | 74 | 66.2% | 46 | ignored | 0/12 | 11/12 | 74 | 67.3% | 66.2% | 12.2% | 1.0% | 67.1% |
| leaderAge | T+240 0_5_1 lt_10 | ignored | 42 | 66.7% | 34 | ignored | 0/12 | 0/12 | 42 | 67.5% | 66.7% | 32.2% | 0.9% | 70.0% |
| leaderAge | T+240 1_2 10_30 | warning-only | 68 | 70.6% | 58 | warning-only | 0/12 | 12/12 | 68 | 70.2% | 70.6% | 16.5% | 0.4% | 40.9% |
| leaderAge | T+240 1_2 30_60 | warning-only | 51 | 70.6% | 45 | ignored | 0/12 | 0/12 | 51 | 70.3% | 70.6% | 18.1% | 0.3% | 73.5% |
| leaderAge | T+240 1_2 60_120 | warning-only | 77 | 72.7% | 66 | warning-only | 0/12 | 12/12 | 77 | 72.4% | 72.7% | 20.4% | 0.4% | 77.8% |
| leaderAge | T+240 1_2 gte_120 | usable | 162 | 72.8% | 120 | usable | 12/12 | 12/12 | 162 | 73.4% | 72.8% | 14.4% | 0.5% | 31.3% |
| leaderAge | T+240 1_2 lt_10 | ignored | 41 | 65.9% | 33 | ignored | 0/12 | 0/12 | 41 | 65.9% | 65.9% | 11.6% | 0.1% | 67.5% |
| leaderAge | T+240 2_3 10_30 | ignored | 39 | 66.7% | 32 | ignored | 0/11 | 0/11 | 39 | 66.6% | 66.7% | 16.9% | 0.0% | 37.1% |
| leaderAge | T+240 2_3 30_60 | ignored | 49 | 79.6% | 41 | ignored | 0/12 | 0/12 | 49 | 79.7% | 79.6% | 12.0% | 0.1% | 30.9% |
| leaderAge | T+240 2_3 60_120 | warning-only | 68 | 75.0% | 60 | warning-only | 0/12 | 12/12 | 68 | 74.9% | 75.0% | 15.3% | 0.1% | 43.6% |
| leaderAge | T+240 2_3 gte_120 | usable | 193 | 68.9% | 158 | usable | 12/12 | 12/12 | 193 | 68.8% | 68.9% | 9.1% | 0.1% | 24.9% |
| leaderAge | T+240 2_3 lt_10 | ignored | 20 | 65.0% | 17 | ignored | 0/10 | 0/10 | 20 | 64.3% | 65.0% | 39.8% | 0.7% | 72.2% |
| leaderAge | T+240 2_3 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+240 3_4 10_30 | ignored | 21 | 95.2% | 17 | ignored | 0/11 | 0/11 | 21 | 95.7% | 95.2% | 9.0% | 0.5% | 25.0% |
| leaderAge | T+240 3_4 30_60 | ignored | 35 | 80.0% | 29 | ignored | 0/11 | 0/11 | 35 | 79.9% | 80.0% | 25.3% | 0.1% | 84.8% |
| leaderAge | T+240 3_4 60_120 | warning-only | 61 | 80.3% | 53 | warning-only | 0/12 | 12/12 | 61 | 80.2% | 80.3% | 16.1% | 0.1% | 59.2% |
| leaderAge | T+240 3_4 gte_120 | usable | 187 | 78.6% | 159 | usable | 12/12 | 12/12 | 187 | 78.4% | 78.6% | 8.2% | 0.2% | 20.2% |
| leaderAge | T+240 3_4 lt_10 | ignored | 6 | 66.7% | 4 | ignored | 0/5 | 0/5 | 6 | 63.3% | 66.7% | 56.7% | 3.3% | 80.0% |
| leaderAge | T+240 4_5 10_30 | ignored | 17 | 94.1% | 13 | ignored | 0/8 | 0/8 | 17 | 94.7% | 94.1% | 11.2% | 0.6% | 25.0% |
| leaderAge | T+240 4_5 30_60 | ignored | 25 | 84.0% | 19 | ignored | 0/10 | 0/10 | 25 | 83.8% | 84.0% | 18.3% | 0.2% | 87.5% |
| leaderAge | T+240 4_5 60_120 | ignored | 38 | 89.5% | 31 | ignored | 0/12 | 0/12 | 38 | 89.6% | 89.5% | 11.7% | 0.1% | 24.8% |
| leaderAge | T+240 4_5 gte_120 | usable | 182 | 89.6% | 154 | usable | 12/12 | 12/12 | 182 | 89.4% | 89.6% | 8.8% | 0.1% | 41.9% |
| leaderAge | T+240 4_5 lt_10 | ignored | 1 | 0.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 0.0% | - | - | - |
| leaderAge | T+240 5_7_5 10_30 | ignored | 14 | 85.7% | 10 | ignored | 0/6 | 0/6 | 14 | 87.3% | 85.7% | 15.5% | 1.6% | 16.7% |
| leaderAge | T+240 5_7_5 30_60 | ignored | 41 | 85.4% | 35 | ignored | 0/11 | 0/11 | 41 | 85.2% | 85.4% | 15.7% | 0.1% | 87.5% |
| leaderAge | T+240 5_7_5 60_120 | warning-only | 79 | 84.8% | 70 | warning-only | 0/12 | 12/12 | 79 | 84.7% | 84.8% | 11.9% | 0.1% | 37.7% |
| leaderAge | T+240 5_7_5 gte_120 | usable | 380 | 90.5% | 339 | usable | 12/12 | 12/12 | 380 | 90.5% | 90.5% | 3.5% | 0.0% | 12.9% |
| leaderAge | T+240 5_7_5 lt_10 | ignored | 3 | 100.0% | 2 | ignored | 0/3 | 0/3 | 3 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+240 7_5_10 10_30 | ignored | 10 | 90.0% | 6 | ignored | 0/6 | 0/6 | 10 | 88.9% | 90.0% | 21.1% | 1.1% | 50.0% |
| leaderAge | T+240 7_5_10 30_60 | ignored | 21 | 95.2% | 18 | ignored | 0/11 | 0/11 | 21 | 95.5% | 95.2% | 9.3% | 0.2% | 33.3% |
| leaderAge | T+240 7_5_10 60_120 | warning-only | 54 | 98.1% | 46 | ignored | 0/12 | 5/12 | 54 | 98.1% | 98.1% | 3.7% | 0.0% | 20.0% |
| leaderAge | T+240 7_5_10 gte_120 | usable | 273 | 93.4% | 243 | usable | 12/12 | 12/12 | 273 | 93.4% | 93.4% | 4.9% | 0.0% | 18.7% |
| leaderAge | T+240 gt_10 10_30 | ignored | 3 | 100.0% | 2 | ignored | 0/3 | 0/3 | 3 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| leaderAge | T+240 gt_10 30_60 | ignored | 17 | 88.2% | 13 | ignored | 0/8 | 0/8 | 17 | 88.2% | 88.2% | 19.5% | 0.1% | 43.3% |
| leaderAge | T+240 gt_10 60_120 | warning-only | 62 | 96.8% | 49 | ignored | 0/12 | 11/12 | 62 | 97.0% | 96.8% | 4.8% | 0.3% | 9.2% |
| leaderAge | T+240 gt_10 gte_120 | usable | 646 | 98.5% | 571 | usable | 12/12 | 12/12 | 646 | 98.5% | 98.5% | 1.2% | 0.0% | 3.1% |
| momentum | T+180 0_5_1 agrees | warning-only | 79 | 55.7% | 68 | warning-only | 0/12 | 12/12 | 79 | 55.8% | 55.7% | 17.4% | 0.1% | 47.3% |
| momentum | T+180 0_5_1 disagrees | warning-only | 74 | 51.4% | 65 | warning-only | 0/12 | 12/12 | 74 | 51.3% | 51.4% | 15.3% | 0.0% | 54.3% |
| momentum | T+180 0_5_1 flat | usable | 100 | 58.0% | 65 | warning-only | 0/12 | 12/12 | 100 | 58.2% | 58.0% | 12.5% | 0.2% | 58.6% |
| momentum | T+180 1_2 agrees | usable | 146 | 61.0% | 127 | usable | 12/12 | 12/12 | 146 | 60.9% | 61.0% | 9.4% | 0.1% | 22.5% |
| momentum | T+180 1_2 disagrees | usable | 134 | 54.5% | 117 | usable | 12/12 | 12/12 | 134 | 54.3% | 54.5% | 12.3% | 0.2% | 46.5% |
| momentum | T+180 1_2 flat | usable | 158 | 66.5% | 117 | usable | 12/12 | 12/12 | 158 | 66.5% | 66.5% | 9.6% | 0.0% | 54.6% |
| momentum | T+180 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| momentum | T+180 2_3 agrees | usable | 142 | 62.7% | 123 | usable | 12/12 | 12/12 | 142 | 62.6% | 62.7% | 14.9% | 0.1% | 35.2% |
| momentum | T+180 2_3 disagrees | warning-only | 99 | 66.7% | 88 | warning-only | 0/12 | 12/12 | 99 | 66.7% | 66.7% | 14.8% | 0.0% | 35.5% |
| momentum | T+180 2_3 flat | usable | 130 | 63.1% | 98 | warning-only | 11/12 | 12/12 | 130 | 62.6% | 63.1% | 14.1% | 0.5% | 37.8% |
| momentum | T+180 3_4 agrees | usable | 156 | 75.6% | 135 | usable | 12/12 | 12/12 | 156 | 75.4% | 75.6% | 6.6% | 0.2% | 26.3% |
| momentum | T+180 3_4 disagrees | warning-only | 85 | 72.9% | 73 | warning-only | 0/12 | 12/12 | 85 | 73.0% | 72.9% | 6.9% | 0.0% | 27.7% |
| momentum | T+180 3_4 flat | warning-only | 99 | 79.8% | 81 | warning-only | 0/12 | 12/12 | 99 | 79.8% | 79.8% | 12.5% | 0.0% | 32.4% |
| momentum | T+180 3_4 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| momentum | T+180 4_5 agrees | usable | 133 | 77.4% | 115 | usable | 12/12 | 12/12 | 133 | 77.5% | 77.4% | 12.6% | 0.1% | 23.6% |
| momentum | T+180 4_5 disagrees | warning-only | 76 | 75.0% | 63 | warning-only | 0/12 | 12/12 | 76 | 74.9% | 75.0% | 16.7% | 0.1% | 37.5% |
| momentum | T+180 4_5 flat | warning-only | 71 | 90.1% | 59 | warning-only | 0/12 | 12/12 | 71 | 90.2% | 90.1% | 11.6% | 0.1% | 91.4% |
| momentum | T+180 5_7_5 agrees | usable | 244 | 87.7% | 217 | usable | 12/12 | 12/12 | 244 | 87.7% | 87.7% | 5.6% | 0.0% | 13.4% |
| momentum | T+180 5_7_5 disagrees | usable | 143 | 74.8% | 124 | usable | 12/12 | 12/12 | 143 | 74.7% | 74.8% | 8.7% | 0.1% | 31.8% |
| momentum | T+180 5_7_5 flat | usable | 119 | 80.7% | 105 | usable | 12/12 | 12/12 | 119 | 80.7% | 80.7% | 5.8% | 0.0% | 20.4% |
| momentum | T+180 7_5_10 agrees | usable | 196 | 90.8% | 171 | usable | 12/12 | 12/12 | 196 | 91.0% | 90.8% | 8.3% | 0.1% | 20.9% |
| momentum | T+180 7_5_10 disagrees | warning-only | 88 | 86.4% | 76 | warning-only | 0/11 | 11/11 | 88 | 86.4% | 86.4% | 10.6% | 0.0% | 21.9% |
| momentum | T+180 7_5_10 flat | ignored | 42 | 85.7% | 35 | ignored | 0/11 | 0/11 | 42 | 86.0% | 85.7% | 19.3% | 0.3% | 39.5% |
| momentum | T+180 gt_10 agrees | usable | 380 | 94.5% | 331 | usable | 12/12 | 12/12 | 380 | 94.5% | 94.5% | 2.3% | 0.0% | 6.3% |
| momentum | T+180 gt_10 disagrees | usable | 159 | 95.0% | 137 | usable | 11/11 | 11/11 | 159 | 94.9% | 95.0% | 3.8% | 0.0% | 28.8% |
| momentum | T+180 gt_10 flat | warning-only | 60 | 96.7% | 51 | warning-only | 0/10 | 10/10 | 60 | 96.8% | 96.7% | 5.5% | 0.1% | 12.4% |
| momentum | T+200 0_5_1 agrees | warning-only | 78 | 66.7% | 67 | warning-only | 0/12 | 12/12 | 78 | 66.9% | 66.7% | 15.2% | 0.3% | 37.7% |
| momentum | T+200 0_5_1 disagrees | warning-only | 69 | 59.4% | 58 | warning-only | 0/12 | 12/12 | 69 | 59.5% | 59.4% | 11.4% | 0.1% | 41.8% |
| momentum | T+200 0_5_1 flat | warning-only | 87 | 62.1% | 63 | warning-only | 0/11 | 11/11 | 87 | 61.9% | 62.1% | 12.3% | 0.2% | 41.8% |
| momentum | T+200 1_2 agrees | usable | 173 | 70.5% | 154 | usable | 12/12 | 12/12 | 173 | 70.6% | 70.5% | 7.0% | 0.0% | 22.9% |
| momentum | T+200 1_2 disagrees | usable | 122 | 57.4% | 105 | usable | 12/12 | 12/12 | 122 | 57.4% | 57.4% | 12.6% | 0.1% | 30.1% |
| momentum | T+200 1_2 flat | usable | 136 | 59.6% | 90 | warning-only | 11/12 | 12/12 | 136 | 59.5% | 59.6% | 10.7% | 0.1% | 41.7% |
| momentum | T+200 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| momentum | T+200 2_3 agrees | usable | 152 | 67.8% | 132 | usable | 12/12 | 12/12 | 152 | 67.6% | 67.8% | 12.6% | 0.2% | 41.1% |
| momentum | T+200 2_3 disagrees | warning-only | 96 | 62.5% | 84 | warning-only | 0/12 | 12/12 | 96 | 62.6% | 62.5% | 13.3% | 0.1% | 40.4% |
| momentum | T+200 2_3 flat | usable | 124 | 68.5% | 97 | warning-only | 11/12 | 12/12 | 124 | 68.9% | 68.5% | 13.6% | 0.4% | 34.2% |
| momentum | T+200 2_3 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| momentum | T+200 3_4 agrees | usable | 139 | 74.8% | 122 | usable | 12/12 | 12/12 | 139 | 74.8% | 74.8% | 8.5% | 0.0% | 23.1% |
| momentum | T+200 3_4 disagrees | warning-only | 93 | 75.3% | 80 | warning-only | 0/12 | 12/12 | 93 | 75.1% | 75.3% | 12.5% | 0.2% | 58.4% |
| momentum | T+200 3_4 flat | warning-only | 87 | 83.9% | 68 | warning-only | 0/12 | 12/12 | 87 | 83.1% | 83.9% | 13.6% | 0.8% | 52.4% |
| momentum | T+200 4_5 agrees | usable | 129 | 79.8% | 112 | usable | 12/12 | 12/12 | 129 | 79.8% | 79.8% | 11.4% | 0.0% | 23.7% |
| momentum | T+200 4_5 disagrees | warning-only | 73 | 75.3% | 61 | warning-only | 0/12 | 12/12 | 73 | 75.7% | 75.3% | 15.9% | 0.4% | 30.3% |
| momentum | T+200 4_5 flat | warning-only | 59 | 88.1% | 50 | warning-only | 0/11 | 11/11 | 59 | 88.1% | 88.1% | 13.9% | 0.0% | 23.9% |
| momentum | T+200 5_7_5 agrees | usable | 273 | 86.8% | 241 | usable | 12/12 | 12/12 | 273 | 86.8% | 86.8% | 5.9% | 0.0% | 9.1% |
| momentum | T+200 5_7_5 disagrees | usable | 156 | 80.1% | 137 | usable | 12/12 | 12/12 | 156 | 80.2% | 80.1% | 7.4% | 0.0% | 21.1% |
| momentum | T+200 5_7_5 flat | usable | 100 | 89.0% | 87 | warning-only | 0/12 | 12/12 | 100 | 88.9% | 89.0% | 9.4% | 0.1% | 18.9% |
| momentum | T+200 7_5_10 agrees | usable | 208 | 88.0% | 185 | usable | 12/12 | 12/12 | 208 | 88.0% | 88.0% | 7.4% | 0.1% | 12.9% |
| momentum | T+200 7_5_10 disagrees | warning-only | 91 | 86.8% | 78 | warning-only | 0/11 | 11/11 | 91 | 86.8% | 86.8% | 7.8% | 0.0% | 14.5% |
| momentum | T+200 7_5_10 flat | ignored | 47 | 93.6% | 41 | ignored | 0/11 | 0/11 | 47 | 93.8% | 93.6% | 9.1% | 0.2% | 15.2% |
| momentum | T+200 gt_10 agrees | usable | 413 | 97.1% | 358 | usable | 12/12 | 12/12 | 413 | 97.1% | 97.1% | 1.9% | 0.0% | 5.5% |
| momentum | T+200 gt_10 disagrees | usable | 174 | 95.4% | 144 | usable | 11/11 | 11/11 | 174 | 95.5% | 95.4% | 3.8% | 0.1% | 5.6% |
| momentum | T+200 gt_10 flat | warning-only | 65 | 98.5% | 54 | warning-only | 0/12 | 12/12 | 65 | 98.4% | 98.5% | 3.2% | 0.1% | 25.0% |
| momentum | T+210 0_5_1 agrees | warning-only | 74 | 56.8% | 60 | warning-only | 0/12 | 12/12 | 74 | 56.5% | 56.8% | 17.8% | 0.2% | 58.3% |
| momentum | T+210 0_5_1 disagrees | warning-only | 65 | 47.7% | 52 | warning-only | 0/12 | 12/12 | 65 | 47.7% | 47.7% | 12.1% | 0.0% | 54.0% |
| momentum | T+210 0_5_1 flat | warning-only | 82 | 56.1% | 57 | warning-only | 0/12 | 12/12 | 82 | 55.3% | 56.1% | 15.1% | 0.8% | 58.2% |
| momentum | T+210 1_2 agrees | usable | 160 | 70.0% | 141 | usable | 12/12 | 12/12 | 160 | 69.9% | 70.0% | 11.3% | 0.1% | 32.4% |
| momentum | T+210 1_2 disagrees | usable | 125 | 59.2% | 112 | usable | 12/12 | 12/12 | 125 | 59.1% | 59.2% | 14.3% | 0.1% | 37.8% |
| momentum | T+210 1_2 flat | usable | 139 | 64.0% | 94 | warning-only | 11/12 | 12/12 | 139 | 64.3% | 64.0% | 13.6% | 0.3% | 40.2% |
| momentum | T+210 2_3 agrees | usable | 137 | 73.0% | 120 | usable | 12/12 | 12/12 | 137 | 73.0% | 73.0% | 10.2% | 0.0% | 20.5% |
| momentum | T+210 2_3 disagrees | warning-only | 98 | 66.3% | 85 | warning-only | 0/12 | 12/12 | 98 | 66.3% | 66.3% | 9.3% | 0.0% | 35.5% |
| momentum | T+210 2_3 flat | usable | 119 | 71.4% | 92 | warning-only | 11/12 | 12/12 | 119 | 71.4% | 71.4% | 10.1% | 0.0% | 57.7% |
| momentum | T+210 2_3 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| momentum | T+210 3_4 agrees | usable | 155 | 76.8% | 135 | usable | 12/12 | 12/12 | 155 | 76.9% | 76.8% | 12.3% | 0.2% | 30.7% |
| momentum | T+210 3_4 disagrees | warning-only | 89 | 70.8% | 75 | warning-only | 0/12 | 12/12 | 89 | 70.5% | 70.8% | 17.4% | 0.3% | 40.2% |
| momentum | T+210 3_4 flat | warning-only | 89 | 85.4% | 69 | warning-only | 0/12 | 12/12 | 89 | 84.6% | 85.4% | 15.6% | 0.7% | 55.8% |
| momentum | T+210 4_5 agrees | usable | 130 | 78.5% | 114 | usable | 12/12 | 12/12 | 130 | 78.4% | 78.5% | 13.1% | 0.0% | 36.5% |
| momentum | T+210 4_5 disagrees | warning-only | 65 | 86.2% | 57 | warning-only | 0/11 | 11/11 | 65 | 86.0% | 86.2% | 16.4% | 0.1% | 65.2% |
| momentum | T+210 4_5 flat | warning-only | 54 | 90.7% | 46 | ignored | 0/11 | 5/11 | 54 | 90.7% | 90.7% | 10.2% | 0.1% | 25.5% |
| momentum | T+210 5_7_5 agrees | usable | 284 | 88.4% | 250 | usable | 12/12 | 12/12 | 284 | 88.4% | 88.4% | 4.0% | 0.0% | 12.3% |
| momentum | T+210 5_7_5 disagrees | usable | 138 | 78.3% | 117 | usable | 12/12 | 12/12 | 138 | 78.2% | 78.3% | 9.3% | 0.0% | 22.1% |
| momentum | T+210 5_7_5 flat | usable | 118 | 92.4% | 104 | usable | 12/12 | 12/12 | 118 | 92.4% | 92.4% | 5.0% | 0.0% | 12.9% |
| momentum | T+210 7_5_10 agrees | usable | 184 | 90.8% | 160 | usable | 12/12 | 12/12 | 184 | 90.8% | 90.8% | 7.8% | 0.0% | 18.1% |
| momentum | T+210 7_5_10 disagrees | warning-only | 92 | 89.1% | 78 | warning-only | 0/12 | 12/12 | 92 | 89.5% | 89.1% | 11.6% | 0.3% | 32.1% |
| momentum | T+210 7_5_10 flat | warning-only | 60 | 98.3% | 46 | ignored | 0/12 | 11/12 | 60 | 98.3% | 98.3% | 3.4% | 0.0% | 16.7% |
| momentum | T+210 gt_10 agrees | usable | 442 | 96.4% | 388 | usable | 12/12 | 12/12 | 442 | 96.4% | 96.4% | 2.6% | 0.0% | 4.9% |
| momentum | T+210 gt_10 disagrees | usable | 181 | 96.1% | 157 | usable | 11/11 | 11/11 | 181 | 96.1% | 96.1% | 3.7% | 0.1% | 17.1% |
| momentum | T+210 gt_10 flat | warning-only | 64 | 96.9% | 55 | warning-only | 0/12 | 12/12 | 64 | 97.0% | 96.9% | 5.3% | 0.1% | 10.7% |
| momentum | T+220 0_5_1 agrees | warning-only | 79 | 62.0% | 66 | warning-only | 0/12 | 12/12 | 79 | 61.8% | 62.0% | 16.9% | 0.3% | 63.6% |
| momentum | T+220 0_5_1 disagrees | warning-only | 55 | 47.3% | 48 | ignored | 0/12 | 8/12 | 55 | 47.3% | 47.3% | 19.7% | 0.0% | 40.5% |
| momentum | T+220 0_5_1 flat | warning-only | 83 | 63.9% | 54 | warning-only | 0/12 | 12/12 | 83 | 65.2% | 63.9% | 15.4% | 1.4% | 65.4% |
| momentum | T+220 1_2 agrees | usable | 148 | 64.9% | 129 | usable | 12/12 | 12/12 | 148 | 64.9% | 64.9% | 11.4% | 0.0% | 28.1% |
| momentum | T+220 1_2 disagrees | usable | 109 | 68.8% | 94 | warning-only | 7/12 | 12/12 | 109 | 68.9% | 68.8% | 7.6% | 0.1% | 18.1% |
| momentum | T+220 1_2 flat | usable | 152 | 69.7% | 104 | usable | 11/11 | 11/11 | 152 | 69.9% | 69.7% | 6.2% | 0.2% | 21.7% |
| momentum | T+220 1_2 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| momentum | T+220 2_3 agrees | usable | 143 | 80.4% | 126 | usable | 12/12 | 12/12 | 143 | 80.3% | 80.4% | 9.6% | 0.1% | 24.1% |
| momentum | T+220 2_3 disagrees | usable | 105 | 63.8% | 92 | warning-only | 2/12 | 12/12 | 105 | 63.7% | 63.8% | 9.2% | 0.2% | 31.4% |
| momentum | T+220 2_3 flat | usable | 123 | 71.5% | 90 | warning-only | 11/12 | 12/12 | 123 | 71.7% | 71.5% | 12.3% | 0.2% | 48.1% |
| momentum | T+220 2_3 unknown | ignored | 1 | 100.0% | 0 | ignored | 0/1 | 0/1 | 1 | - | 100.0% | - | - | - |
| momentum | T+220 3_4 agrees | usable | 127 | 82.7% | 111 | usable | 12/12 | 12/12 | 127 | 82.5% | 82.7% | 11.1% | 0.2% | 30.8% |
| momentum | T+220 3_4 disagrees | warning-only | 71 | 69.0% | 61 | warning-only | 0/12 | 12/12 | 71 | 69.3% | 69.0% | 15.6% | 0.3% | 33.3% |
| momentum | T+220 3_4 flat | usable | 117 | 79.5% | 94 | warning-only | 11/12 | 12/12 | 117 | 79.2% | 79.5% | 11.3% | 0.3% | 21.3% |
| momentum | T+220 4_5 agrees | usable | 124 | 80.6% | 107 | usable | 12/12 | 12/12 | 124 | 80.8% | 80.6% | 12.3% | 0.1% | 23.5% |
| momentum | T+220 4_5 disagrees | warning-only | 75 | 85.3% | 65 | warning-only | 0/12 | 12/12 | 75 | 85.1% | 85.3% | 13.0% | 0.2% | 36.3% |
| momentum | T+220 4_5 flat | warning-only | 62 | 80.6% | 51 | warning-only | 0/12 | 12/12 | 62 | 80.4% | 80.6% | 19.4% | 0.3% | 33.9% |
| momentum | T+220 5_7_5 agrees | usable | 255 | 91.0% | 227 | usable | 12/12 | 12/12 | 255 | 91.0% | 91.0% | 3.8% | 0.0% | 9.2% |
| momentum | T+220 5_7_5 disagrees | usable | 147 | 85.0% | 126 | usable | 12/12 | 12/12 | 147 | 85.0% | 85.0% | 9.0% | 0.0% | 25.8% |
| momentum | T+220 5_7_5 flat | usable | 111 | 88.3% | 97 | warning-only | 10/12 | 12/12 | 111 | 88.3% | 88.3% | 10.7% | 0.0% | 33.2% |
| momentum | T+220 7_5_10 agrees | usable | 219 | 90.0% | 193 | usable | 12/12 | 12/12 | 219 | 89.9% | 90.0% | 3.8% | 0.0% | 16.1% |
| momentum | T+220 7_5_10 disagrees | usable | 100 | 92.0% | 86 | warning-only | 0/12 | 12/12 | 100 | 92.0% | 92.0% | 8.8% | 0.0% | 32.1% |
| momentum | T+220 7_5_10 flat | warning-only | 55 | 98.2% | 47 | ignored | 0/12 | 7/12 | 55 | 98.3% | 98.2% | 3.5% | 0.1% | 12.5% |
| momentum | T+220 gt_10 agrees | usable | 439 | 97.0% | 382 | usable | 12/12 | 12/12 | 439 | 97.1% | 97.0% | 2.3% | 0.0% | 4.2% |
| momentum | T+220 gt_10 disagrees | usable | 173 | 98.3% | 142 | usable | 11/11 | 11/11 | 173 | 98.3% | 98.3% | 2.3% | 0.1% | 4.3% |
| momentum | T+220 gt_10 flat | warning-only | 80 | 100.0% | 68 | warning-only | 0/11 | 11/11 | 80 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| momentum | T+240 0_5_1 agrees | warning-only | 62 | 64.5% | 54 | warning-only | 0/12 | 12/12 | 62 | 64.8% | 64.5% | 21.0% | 0.3% | 40.5% |
| momentum | T+240 0_5_1 disagrees | warning-only | 53 | 62.3% | 44 | ignored | 0/12 | 4/12 | 53 | 63.1% | 62.3% | 20.4% | 0.9% | 40.8% |
| momentum | T+240 0_5_1 flat | warning-only | 86 | 72.1% | 51 | warning-only | 0/11 | 11/11 | 86 | 71.4% | 72.1% | 11.1% | 0.7% | 73.8% |
| momentum | T+240 1_2 agrees | usable | 142 | 67.6% | 124 | usable | 12/12 | 12/12 | 142 | 67.3% | 67.6% | 15.2% | 0.3% | 29.7% |
| momentum | T+240 1_2 disagrees | usable | 109 | 71.6% | 94 | warning-only | 8/12 | 12/12 | 109 | 71.5% | 71.6% | 18.5% | 0.1% | 45.9% |
| momentum | T+240 1_2 flat | usable | 148 | 75.0% | 106 | usable | 12/12 | 12/12 | 148 | 75.2% | 75.0% | 11.2% | 0.2% | 36.2% |
| momentum | T+240 2_3 agrees | usable | 154 | 70.8% | 138 | usable | 12/12 | 12/12 | 154 | 70.9% | 70.8% | 11.8% | 0.1% | 23.5% |
| momentum | T+240 2_3 disagrees | warning-only | 96 | 72.9% | 84 | warning-only | 0/12 | 12/12 | 96 | 73.0% | 72.9% | 17.1% | 0.1% | 31.4% |
| momentum | T+240 2_3 flat | usable | 119 | 69.7% | 88 | warning-only | 10/12 | 12/12 | 119 | 69.4% | 69.7% | 9.3% | 0.3% | 20.8% |
| momentum | T+240 2_3 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| momentum | T+240 3_4 agrees | usable | 127 | 78.7% | 112 | usable | 12/12 | 12/12 | 127 | 78.6% | 78.7% | 12.3% | 0.1% | 31.2% |
| momentum | T+240 3_4 disagrees | warning-only | 76 | 81.6% | 66 | warning-only | 0/12 | 12/12 | 76 | 81.7% | 81.6% | 11.0% | 0.1% | 20.9% |
| momentum | T+240 3_4 flat | usable | 107 | 80.4% | 88 | warning-only | 6/12 | 12/12 | 107 | 79.7% | 80.4% | 16.0% | 0.7% | 67.5% |
| momentum | T+240 4_5 agrees | usable | 123 | 91.9% | 106 | usable | 12/12 | 12/12 | 123 | 91.9% | 91.9% | 8.6% | 0.0% | 15.0% |
| momentum | T+240 4_5 disagrees | warning-only | 79 | 81.0% | 69 | warning-only | 0/12 | 12/12 | 79 | 80.9% | 81.0% | 11.8% | 0.1% | 33.6% |
| momentum | T+240 4_5 flat | warning-only | 61 | 93.4% | 49 | ignored | 0/12 | 11/12 | 61 | 93.2% | 93.4% | 10.5% | 0.3% | 63.2% |
| momentum | T+240 5_7_5 agrees | usable | 224 | 91.1% | 200 | usable | 12/12 | 12/12 | 224 | 91.1% | 91.1% | 5.7% | 0.0% | 15.3% |
| momentum | T+240 5_7_5 disagrees | usable | 159 | 84.9% | 139 | usable | 12/12 | 12/12 | 159 | 84.9% | 84.9% | 5.7% | 0.0% | 13.1% |
| momentum | T+240 5_7_5 flat | usable | 134 | 91.0% | 117 | usable | 12/12 | 12/12 | 134 | 91.0% | 91.0% | 9.0% | 0.1% | 26.1% |
| momentum | T+240 7_5_10 agrees | usable | 207 | 94.2% | 180 | usable | 12/12 | 12/12 | 207 | 94.2% | 94.2% | 5.1% | 0.0% | 11.2% |
| momentum | T+240 7_5_10 disagrees | warning-only | 83 | 92.8% | 73 | warning-only | 0/11 | 11/11 | 83 | 92.8% | 92.8% | 7.6% | 0.1% | 14.5% |
| momentum | T+240 7_5_10 flat | warning-only | 68 | 95.6% | 58 | warning-only | 0/11 | 11/11 | 68 | 95.4% | 95.6% | 8.5% | 0.2% | 38.4% |
| momentum | T+240 gt_10 agrees | usable | 430 | 97.9% | 372 | usable | 12/12 | 12/12 | 430 | 97.9% | 97.9% | 1.8% | 0.0% | 5.7% |
| momentum | T+240 gt_10 disagrees | usable | 198 | 97.5% | 171 | usable | 12/12 | 12/12 | 198 | 97.5% | 97.5% | 2.3% | 0.0% | 3.0% |
| momentum | T+240 gt_10 flat | usable | 100 | 100.0% | 86 | warning-only | 0/12 | 12/12 | 100 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| prePathShape | T+180 clean-lock | usable | 986 | 84.6% | 882 | usable | 12/12 | 12/12 | 989 | 84.6% | 84.7% | 1.5% | 0.2% | 5.0% |
| prePathShape | T+180 multi-flip-chop | usable | 1110 | 71.8% | 997 | usable | 12/12 | 12/12 | 1104 | 71.8% | 71.7% | 4.5% | 0.0% | 8.7% |
| prePathShape | T+180 near-line-heavy | usable | 351 | 68.9% | 257 | usable | 12/12 | 12/12 | 357 | 70.5% | 69.5% | 5.6% | 1.1% | 20.5% |
| prePathShape | T+180 recent-lock | warning-only | 56 | 55.4% | 42 | ignored | 0/12 | 11/12 | 57 | 55.4% | 56.1% | 22.8% | 0.7% | 57.4% |
| prePathShape | T+180 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| prePathShape | T+180 unresolved | usable | 610 | 81.6% | 516 | usable | 12/12 | 12/12 | 606 | 81.6% | 81.2% | 5.1% | 0.4% | 10.9% |
| prePathShape | T+200 clean-lock | usable | 1013 | 86.9% | 911 | usable | 12/12 | 12/12 | 1004 | 86.8% | 87.2% | 1.8% | 0.3% | 4.2% |
| prePathShape | T+200 multi-flip-chop | usable | 1075 | 74.9% | 975 | usable | 12/12 | 12/12 | 1081 | 75.0% | 75.0% | 3.8% | 0.0% | 8.6% |
| prePathShape | T+200 near-line-heavy | usable | 315 | 70.2% | 233 | usable | 12/12 | 12/12 | 320 | 71.2% | 70.3% | 6.6% | 0.8% | 30.3% |
| prePathShape | T+200 recent-lock | warning-only | 76 | 67.1% | 64 | warning-only | 0/12 | 12/12 | 75 | 67.7% | 66.7% | 16.7% | 1.1% | 35.9% |
| prePathShape | T+200 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| prePathShape | T+200 unresolved | usable | 665 | 83.6% | 580 | usable | 12/12 | 12/12 | 664 | 83.4% | 83.1% | 4.4% | 0.3% | 9.6% |
| prePathShape | T+210 clean-lock | usable | 1094 | 87.9% | 985 | usable | 12/12 | 12/12 | 1080 | 87.8% | 88.1% | 1.5% | 0.2% | 7.0% |
| prePathShape | T+210 multi-flip-chop | usable | 1001 | 75.4% | 910 | usable | 12/12 | 12/12 | 1006 | 75.4% | 75.3% | 3.7% | 0.1% | 10.4% |
| prePathShape | T+210 near-line-heavy | usable | 298 | 72.5% | 250 | usable | 12/12 | 12/12 | 309 | 74.3% | 72.5% | 8.2% | 1.8% | 28.0% |
| prePathShape | T+210 recent-lock | warning-only | 95 | 65.3% | 77 | warning-only | 0/12 | 12/12 | 93 | 65.4% | 65.6% | 14.6% | 0.2% | 35.7% |
| prePathShape | T+210 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| prePathShape | T+210 unresolved | usable | 656 | 84.1% | 565 | usable | 12/12 | 12/12 | 656 | 84.3% | 84.3% | 3.1% | 0.0% | 10.9% |
| prePathShape | T+220 clean-lock | usable | 1156 | 89.1% | 1025 | usable | 12/12 | 12/12 | 1149 | 89.3% | 89.1% | 2.5% | 0.2% | 9.6% |
| prePathShape | T+220 multi-flip-chop | usable | 946 | 77.4% | 851 | usable | 12/12 | 12/12 | 945 | 77.2% | 77.1% | 3.8% | 0.1% | 9.2% |
| prePathShape | T+220 near-line-heavy | usable | 327 | 74.6% | 277 | usable | 12/12 | 12/12 | 334 | 75.8% | 75.1% | 8.0% | 0.6% | 26.2% |
| prePathShape | T+220 recent-lock | warning-only | 97 | 68.0% | 79 | warning-only | 2/12 | 12/12 | 99 | 67.2% | 68.7% | 10.8% | 1.5% | 34.7% |
| prePathShape | T+220 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| prePathShape | T+220 unresolved | usable | 626 | 85.9% | 542 | usable | 12/12 | 12/12 | 625 | 85.7% | 86.1% | 4.1% | 0.4% | 9.9% |
| prePathShape | T+240 clean-lock | usable | 1211 | 90.9% | 1086 | usable | 12/12 | 12/12 | 1197 | 90.9% | 90.9% | 2.0% | 0.0% | 6.4% |
| prePathShape | T+240 multi-flip-chop | usable | 872 | 79.5% | 793 | usable | 12/12 | 12/12 | 877 | 79.5% | 79.5% | 3.8% | 0.1% | 7.3% |
| prePathShape | T+240 near-line-heavy | usable | 323 | 77.7% | 286 | usable | 12/12 | 12/12 | 341 | 79.7% | 78.0% | 8.0% | 1.7% | 28.7% |
| prePathShape | T+240 recent-lock | warning-only | 97 | 74.2% | 76 | warning-only | 0/11 | 11/11 | 98 | 74.5% | 74.5% | 8.2% | 0.0% | 26.0% |
| prePathShape | T+240 unknown | ignored | 2 | 100.0% | 1 | ignored | 0/2 | 0/2 | 2 | 100.0% | 100.0% | 0.0% | 0.0% | 0.0% |
| prePathShape | T+240 unresolved | usable | 642 | 87.1% | 559 | usable | 12/12 | 12/12 | 632 | 86.9% | 87.3% | 4.6% | 0.4% | 11.5% |
| risk | all momentum_against | usable | 4273 | 77.9% | 3845 | usable | 12/12 | 12/12 | 4273 | 77.9% | 77.9% | 2.6% | 0.0% | 12.3% |
| risk | all near_line_heavy | usable | 1614 | 72.7% | 1303 | usable | 12/12 | 12/12 | 1661 | 74.4% | 73.1% | 6.7% | 1.3% | 22.4% |
| risk | all recent_lock | usable | 421 | 67.0% | 338 | usable | 12/12 | 12/12 | 422 | 67.0% | 67.3% | 8.2% | 0.3% | 16.7% |
| risk | T+180 momentum_against | usable | 858 | 73.4% | 765 | usable | 12/12 | 12/12 | 858 | 73.4% | 73.4% | 4.2% | 0.0% | 10.5% |
| risk | T+180 near_line_heavy | usable | 351 | 68.9% | 257 | usable | 12/12 | 12/12 | 357 | 70.5% | 69.5% | 5.6% | 1.1% | 20.5% |
| risk | T+180 recent_lock | warning-only | 56 | 55.4% | 42 | ignored | 0/12 | 11/12 | 57 | 55.4% | 56.1% | 22.8% | 0.7% | 57.4% |
| risk | T+200 momentum_against | usable | 874 | 76.2% | 781 | usable | 12/12 | 12/12 | 874 | 76.2% | 76.2% | 4.0% | 0.0% | 14.7% |
| risk | T+200 near_line_heavy | usable | 315 | 70.2% | 233 | usable | 12/12 | 12/12 | 320 | 71.2% | 70.3% | 6.6% | 0.8% | 30.3% |
| risk | T+200 recent_lock | warning-only | 76 | 67.1% | 64 | warning-only | 0/12 | 12/12 | 75 | 67.7% | 66.7% | 16.7% | 1.1% | 35.9% |
| risk | T+210 momentum_against | usable | 853 | 76.6% | 767 | usable | 12/12 | 12/12 | 853 | 76.5% | 76.6% | 4.7% | 0.1% | 21.1% |
| risk | T+210 near_line_heavy | usable | 298 | 72.5% | 250 | usable | 12/12 | 12/12 | 309 | 74.3% | 72.5% | 8.2% | 1.8% | 28.0% |
| risk | T+210 recent_lock | warning-only | 95 | 65.3% | 77 | warning-only | 0/12 | 12/12 | 93 | 65.4% | 65.6% | 14.6% | 0.2% | 35.7% |
| risk | T+220 momentum_against | usable | 835 | 80.0% | 742 | usable | 12/12 | 12/12 | 835 | 80.0% | 80.0% | 2.6% | 0.0% | 11.4% |
| risk | T+220 near_line_heavy | usable | 327 | 74.6% | 277 | usable | 12/12 | 12/12 | 334 | 75.8% | 75.1% | 8.0% | 0.6% | 26.2% |
| risk | T+220 recent_lock | warning-only | 97 | 68.0% | 79 | warning-only | 2/12 | 12/12 | 99 | 67.2% | 68.7% | 10.8% | 1.5% | 34.7% |
| risk | T+240 momentum_against | usable | 853 | 83.5% | 770 | usable | 12/12 | 12/12 | 853 | 83.5% | 83.5% | 3.6% | 0.0% | 11.7% |
| risk | T+240 near_line_heavy | usable | 323 | 77.7% | 286 | usable | 12/12 | 12/12 | 341 | 79.7% | 78.0% | 8.0% | 1.7% | 28.7% |
| risk | T+240 recent_lock | warning-only | 97 | 74.2% | 76 | warning-only | 0/11 | 11/11 | 98 | 74.5% | 74.5% | 8.2% | 0.0% | 26.0% |

## Phase 1 Status

This report is the durable holdout artifact required before Phase 2 freezes shared decision config. Threshold confirmation or revision should be based on the usable and warning-only cell tables above, with ignored cells excluded from live priors unless more data is collected.
