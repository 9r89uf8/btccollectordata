# Decision Replay Policy Diagnostics

Generated: 2026-04-28

## Context

Phase 9 historical replay produced zero ENTER decisions even after the replay wiring was verified and the sample size was expanded.

The current diagnostic artifact is `decision_replay_report.md`, generated from a 1,000-market leave-day-out replay:

- Markets replayed: 1,000
- Total evaluations: 5,000
- ENTER_UP: 0
- ENTER_DOWN: 0
- WAIT: 5,000
- Market errors: 0
- Snapshot cap warnings: 0

This should be treated as a policy diagnostic, not as proof that the engine is broken.

## What Was Checked

The zero-entry result was investigated against the likely implementation failure modes:

- Runtime muting was not the cause. Replay hardcodes `decision_emit_actions: "all"` so ENTER actions are allowed.
- Action counting was not the cause. The replay records effective `result.action` directly from `decide()`.
- Missing priors were not the cause. Many rows reached the EV gate with populated `p_est`.
- Missing top-ask data was not the primary cause. Some rows failed `leader_ask_missing`, but the dominant executable-stage blocker was `no_ev_against_top_ask`.
- Anti-contamination is preserved. Replay uses leave-day-out priors and excludes the replay UTC start-day from both analytics and stability training rows.

Additional diagnostics were added to the replay report:

- WAIT gate diagnostics by reason
- Top no-EV rejections by edge
- Decision version
- Market data batch size
- Snapshot cap warnings

## Main Finding

The engine is not failing to enter because of a replay wiring bug. It is refusing entries because the executable top ask is usually far above the model probability.

From the 1,000-market replay:

| Reason | Count | Key Diagnostic |
| --- | ---: | --- |
| distance_too_small | 2,552 | Avg abs distance 2.772 bps vs required 6.698 bps |
| no_ev_against_top_ask | 1,123 | Avg p_est 86.6%, avg ask 0.990, avg edge -0.124 |
| inside_noise_band | 485 | Avg abs distance 0.252 bps |
| recent_lock | 472 | Hard veto |
| too_many_soft_risks | 173 | Hard/aggregate risk veto |
| leader_ask_missing | 92 | Missing execution quote |
| p_est_below_minimum | 82 | Avg p_est 78.4% |

The best no-EV rejections were still negative-edge rows. Example pattern:

| p_est | Ask | Edge | Required Edge |
| ---: | ---: | ---: | ---: |
| 92.2% | 0.990 | -0.068 | 0.040 |
| 91.9% | 0.990 | -0.071 | 0.040 |

That means simply lowering the required edge from 4-7% to a smaller positive number would not produce entries for these cases. The ask is above the estimated probability.

## Current Policy Bottlenecks

The replay suggests the current v0.1 policy is conservative in two different ways:

1. **Distance gates block many observations before probability/EV.**
   Most WAITs are `distance_too_small`. This is expected because the policy requires meaningful BTC distance from the line before considering entry.

2. **Executable ask prices block most otherwise-qualified observations.**
   Rows that survive to execution often face top asks near 0.99. With p_est below that, EV is negative. This is the strongest reason there are zero entries.

These are different problems. Easing the distance gate will increase the number of rows that reach probability/EV, but it may still produce zero ENTERs if top asks remain near 0.99.

## Policy Levers To Revisit Later

These are candidates to revisit after Phase 10/11 observability, not changes to apply blindly.

### 1. Add Pre-Execution Candidate Tracking

Add a diagnostic category for rows that pass:

- data quality
- checkpoint timing
- hard vetoes
- distance
- probability floor

but fail execution EV.

This would answer: "How often is the strategy directionally right before market price makes it untradeable?"

Possible reason code or report bucket:

```text
pre_execution_candidate
```

This should not place trades. It is for strategy diagnostics only.

### 2. Separate Shadow Strategy Signal From Executable Entry

Today the replay reports only real ENTER candidates. A second shadow action could make review clearer:

```text
SCOUT_SMALL or STRATEGY_SIGNAL
```

Meaning:

- model/gates like the direction
- market top ask is too expensive for an executable entry

This would avoid mistaking "zero executable entries" for "zero useful signals."

### 3. Revisit Distance Thresholds

The current required distance tables are conservative:

- clean: 4-5 bps
- one soft risk: 5-7.5 bps
- two soft risks: 7.5-10 bps

Potential experiment:

- reduce clean thresholds by 1-2 bps
- leave soft-risk thresholds unchanged initially
- compare pre-EV candidate count, p_est, and eventual win rate

Do not evaluate this against all-data priors; use leave-day-out replay.

### 4. Revisit Required Edge Only After Price Distribution Review

Lowering requiredEdge alone will not help rows with p_est 0.92 and ask 0.99. It could matter only for rows where:

```text
p_est - ask is positive but below requiredEdge
```

The report should add a bucket for:

```text
0 <= edge < requiredEdge
```

If that bucket is small, requiredEdge is not the main blocker.

### 5. Consider Maker-Style Limit Simulation

The current execution policy assumes crossing the top ask. That is appropriate for immediate executable entries, but it may be too strict for a shadow strategy study.

A future replay mode could simulate a maker limit:

```text
limitPrice = min(leaderAsk, p_est - requiredEdge)
```

and then evaluate whether the market later traded/fillable at that price. This requires historical order/trade data or a conservative proxy. Do not treat it as equivalent to executable top-ask trading.

### 6. Add Ask/Spread Quality Diagnostics

The no-EV rows had avg ask 0.990 and avg spread 0.980. Because EV is checked before spread, these rows are classified as `no_ev_against_top_ask` rather than `wide_spread`.

That ordering is intentional in the current engine, but the replay report should continue to show spread diagnostics so we can distinguish:

- fair but too expensive asks
- stale or crossed/empty book artifacts
- ultra-wide quote conditions

## Recommended Next Implementation Work

Before easing policy, add the following report sections:

1. **Pre-execution candidate count**
   Rows that pass strategy gates before EV/spread/depth.

2. **Edge distribution for EV failures**
   Buckets:
   - edge < 0
   - 0 <= edge < requiredEdge
   - edge >= requiredEdge but failed spread/depth

3. **Ask distribution by checkpoint**
   Especially for rows that reach EV.

4. **Distance-too-small near-miss distribution**
   How many rows are within 1 bps / 2 bps of required distance.

5. **Replay mode marker**
   Keep distinguishing:
   - executable top-ask replay
   - latest-priors smoke
   - possible future maker-limit simulation

## Current Conclusion

The zero-entry replay is a meaningful result: v0.1 policy is too conservative to generate executable entries on the sampled historical data.

The strongest blocker is not the probability model. It is executable price: when the model estimates 86-92% and the market asks 99%, the correct EV gate result is WAIT.

Policy easing should focus first on understanding pre-execution candidates and edge distribution, not on blindly lowering requiredEdge.
