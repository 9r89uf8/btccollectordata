# Paper Trading Replay Report

Generated: 2026-05-02T01:49:45.808Z
Replay mode: flat
Decision window: T+240-285

## Flat $5

- Markets scanned: 5
- Paper trades: 3
- No-trade markets: 2
- Win rate: 100.0%
- Average stake: $5.00
- Dollars risked: $15.00
- Simulated gross PnL: $0.80
- ROI on dollars risked: 5.3%
- Average entry distance: 8.39 bps
- Average entry price: 0.950

### Entry Window

| Cohort | Trades | Win rate | Avg stake | Dollars risked | PnL | ROI | Avg entry distance |
|---|---:|---:|---:|---:|---:|---:|---:|
| T+220-239 | 0 | n/a | n/a | $0.00 | n/a | n/a | n/a bps |
| T+240-285 | 3 | 100.0% | $5.00 | $15.00 | $0.80 | 5.3% | 8.39 bps |

### Risk Count

| Cohort | Trades | Win rate | Avg stake | Dollars risked | PnL | ROI | Avg entry distance |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0 risk flags | 2 | 100.0% | $5.00 | $10.00 | $0.70 | 7.0% | 7.95 bps |
| 1 risk flag | 1 | 100.0% | $5.00 | $5.00 | $0.10 | 2.0% | 9.26 bps |

### Skip Reasons

| Reason | Count |
|---|---:|
| below_required_distance | 56 |
| too_many_risk_flags | 18 |
| missing_btc | 18 |

### Trades

| Market | Entry | Side | Stake | Price | Distance | Required | Risk | Correct | PnL |
|---|---:|---|---:|---:|---:|---:|---:|---|---:|
| btc-updown-5m-1777685700 | T+240s | down | $5.00 | 0.920 | 7.69 | 4.00 | 0 | true | $0.43 |
| btc-updown-5m-1777685400 | T+240s | up | $5.00 | 0.980 | 9.26 | 6.50 | 1 | true | $0.10 |
| btc-updown-5m-1777684500 | T+240s | down | $5.00 | 0.950 | 8.21 | 4.00 | 0 | true | $0.26 |