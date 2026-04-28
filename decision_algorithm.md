My strongest recommendation: **do not use 73% as a green-light entry rule.** Use it as a **watchlist / tiny-size threshold** only. For real entry, I would require **separation + persistence + no path veto + market-price edge**.

The biggest fix to your examples is this: **“BTC is over X bps” is not the same as the cell at exactly that bucket.** At T+60, the 5–7.5 bps bucket is 73.4%, but “≥5 bps” looks better only because it also includes 7.5–10 and >10 bps. At T+90, the 4–5 bps bucket is 73.1%, so a market at 4.2 bps is not really an 80% setup even though the aggregate of all ≥4 bps is stronger. The heatmap also shows why early entries are fragile: T+60 5–7.5 bps has p90 adverse move of 10.53 bps, larger than the entry margin itself.

## The entry rule I would use

**Enter only when the current leader has enough distance for the checkpoint, and no hard risk veto is active.** The threshold means absolute BTC distance from price-to-beat in favor of the current leader, so it applies symmetrically to UP and DOWN.

| Checkpoint |                     Minimum / tiny size |        Default entry |                  Size-up entry |
| ---------: | --------------------------------------: | -------------------: | -----------------------------: |
|       T+30 | No trade, unless ≥10 bps and very cheap |             No trade |                       No trade |
|       T+60 |                                ≥7.5 bps |              ≥10 bps |                     No size-up |
|       T+90 |                                  ≥5 bps |              ≥10 bps |                   ≥10 bps only |
|      T+120 |                                  ≥5 bps |             ≥7.5 bps |                        ≥10 bps |
|      T+180 |                                  ≥3 bps |               ≥5 bps |       ≥7.5 bps, cleaner if ≥10 |
|      T+200 |                                  ≥3 bps |               ≥5 bps |     ≥5 bps, cleaner if ≥7.5/10 |
|      T+210 |                                  ≥3 bps |             ≥4–5 bps |                         ≥5 bps |
|      T+220 |                                  ≥3 bps |             ≥4–5 bps |                         ≥5 bps |
|      T+240 |                                  ≥3 bps |               ≥4 bps |                       ≥4–5 bps |
|     T+270+ |                 Only if still mispriced | Usually no new chase | Add only on extreme mispricing |

The reason I like **T+180 to T+240** as the main entry window is that the win rate and p90 adverse profile become much cleaner. For example, at T+180, ≥5 bps aggregates to about 88.9%, while at T+200 ≥5 bps is about 90.9%, T+210 ≥5 bps is about 92.0%, T+220 ≥5 bps is about 93.3%, and T+240 ≥4 bps is about 93.5%. Earlier than T+120, you are buying a lot more path volatility.

## Hard vetoes

I would not enter when any of these are true, even if the simple distance heatmap says “good.”

### 1. Recent lock risk: hard veto

This is the most dangerous one. A leader that just took control is not a real leader yet. In the path-shape split, **Recent lock** is weak across T+180–T+240: leader win rate is only about 56% at T+180, 67% at T+200, 65% at T+210, 69% at T+220, and 75% at T+240; stable leader win rate is much worse, roughly 15–34%.

**Rule:** no entry immediately after a flip. Require at least one of these before entry:

* The same leader holds through the next checkpoint.
* The leader has held for 30–60 seconds without crossing back.
* Distance expands to a high-confidence threshold, usually ≥7.5 or ≥10 bps.

### 2. Multi-flip chop risk: require bigger distance

Multi-flip markets are not automatic no-trades, but they need a distance premium. The path-shape data shows **Multi-flip chop** leader win rates around 71–79% from T+180 to T+240, with stable leader win rates only about 48–58%. That means the leader can be right at close while still being path-fragile.

**Rule:** if multi-flip chop is active, do not use the minimum threshold. Use this instead:

| Checkpoint | High/multi-flip chop threshold |
| ---------: | -----------------------------: |
|      T+180 |                       ≥7.5 bps |
|      T+200 |                       ≥7.5 bps |
|      T+210 |                         ≥5 bps |
|      T+220 |                         ≥5 bps |
|      T+240 |                       ≥4–5 bps |

### 3. Near-line-heavy risk: no entry unless BTC has escaped

Near-line-heavy means the apparent leader was built inside noise. In the path-shape split, near-line-heavy leader win rates are only about 69–78% from T+180 to T+240, again with materially lower stable win rates.

**Rule:** if near-line rank is high, do not enter below 5 bps. Treat it as “unresolved” until BTC breaks out and holds.

My minimum for near-line-heavy:

* T+180/T+200: require ≥7.5 bps.
* T+210/T+220: require ≥5 bps.
* T+240: require ≥4–5 bps.
* If it is also high chop or momentum-against, require ≥7.5 bps or skip.

### 4. Momentum-against-leader risk: add a threshold tax

Momentum-against does not kill the trade when the distance is huge, but it makes marginal entries bad. In the momentum split, disagreement cells at T+180 are weak below 7.5 bps: 3–4 bps is about 73.2%, 4–5 bps is about 74.0%, and 5–7.5 bps is about 74.6%. It becomes much cleaner at ≥7.5 bps.

**Rule:** when 30s momentum is against the current leader:

| Checkpoint |                 Momentum-against threshold |
| ---------: | -----------------------------------------: |
|      T+180 |                                   ≥7.5 bps |
|      T+200 |                                   ≥7.5 bps |
|      T+210 | ≥7.5 bps for high confidence; ≥5 only tiny |
|      T+220 |                                   ≥4–5 bps |
|      T+240 |              ≥3 bps tiny, ≥7.5 bps size-up |

## My preferred strategy

I would run this as a **wait-for-confirmation strategy**, not an early sniper strategy.

### Phase 1: T+60 to T+90 — scout only

Do not enter at T+60 merely because the leader is ≥5 bps. That setup is only around 73.4% in the 5–7.5 bucket and has ugly adverse movement. T+60 should require ≥10 bps for a default entry, or ≥7.5 bps only with tiny size and a very favorable market price.

At T+90, I would allow a small entry at ≥5 bps only if all risk flags are clean. Default entry still wants ≥10 bps.

### Phase 2: T+120 — first real entry point

At T+120:

* Clean/no-risk setup: enter at ≥7.5 bps.
* Very cheap market price and no risks: tiny entry at ≥5 bps.
* High chop, recent lock, near-line-heavy, or momentum-against: wait.

### Phase 3: T+180 to T+220 — main entry window

This is where I would focus. My default:

* **Clean path:** enter at ≥5 bps at T+180/T+200; enter at ≥4–5 bps at T+210/T+220.
* **One soft risk flag:** require ≥7.5 bps at T+180/T+200 or ≥5 bps at T+210/T+220.
* **Two risk flags:** require ≥10 bps or skip.
* **Recent lock:** skip, regardless of distance, unless it survives another checkpoint.

### Phase 4: T+240+ — only take mispriced layups

At T+240 the heatmap is very strong, but the market may already know that. I would not blindly chase late entries. Enter only when the contract price is still materially below the adjusted win probability.

At T+270/T+285/T+295, the signal is often obvious, so the edge may be gone. Use those checkpoints mostly to add to an existing position or take rare mispricings.

## Price/EV rule: the missing piece

A 73% win rate is not profitable if you pay 74c. For a binary $1 contract:

```text
edge per share = estimated_win_probability - entry_price
```

So:

* 73% win rate at 65c = good theoretical edge.
* 73% win rate at 71c = thin.
* 73% win rate at 74c = bad before costs/slippage.
* 85% win rate at 76c = attractive.
* 90% win rate at 86c = still only a 4-point edge.

Your uploaded scope notes matter here: the current analytics are reference-only and do not include live market prices, order book depth, bid/ask spread, or market imbalance. So the heatmap gives **p(win)**, not trade EV.

My EV gate would be:

|      Window |                             Required cushion versus ask |
| ----------: | ------------------------------------------------------: |
|   T+60/T+90 |                    p_est − ask ≥ 8–10 percentage points |
| T+120/T+180 |                     p_est − ask ≥ 6–8 percentage points |
| T+200/T+240 |                     p_est − ask ≥ 4–6 percentage points |
|      T+270+ | p_est − ask ≥ 3–5 points, but only with clean execution |

So if T+180 ≥5 bps gives you an estimated 82–89% depending on the exact bucket, I would not pay 83c just because the heatmap is green. I would want something like 75–80c depending on risk flags.

## The actual decision algorithm

Use this in production:

```text
1. Identify current leader:
   UP if BTC > price_to_beat + noise band.
   DOWN if BTC < price_to_beat - noise band.
   Otherwise no trade.

2. Compute leader distance in bps.

3. Assign checkpoint bucket:
   T+60, T+90, T+120, T+180, T+200, T+210, T+220, T+240, etc.

4. Check hard vetoes:
   - recent_lock = true -> WAIT
   - inside <=0.5 bps noise band -> WAIT
   - unknown/dirty data -> WAIT
   - just flipped within last 30s -> WAIT

5. Apply threshold tax:
   - high chop -> raise threshold one bucket
   - near-line-heavy -> raise threshold one bucket
   - oscillation high -> raise threshold one bucket
   - momentum-against -> raise threshold one bucket
   - two or more soft risks -> require ≥7.5/10 bps or WAIT

6. Estimate p_est from the most specific available cell:
   path/momentum/chop split if available,
   otherwise base heatmap.

7. Enter only if:
   distance passes threshold
   AND p_est >= 0.80 for default entry
   AND ask <= p_est - required_cushion
   AND spread/depth are acceptable.

8. Do not average down after a failed signal.
   If BTC crosses the line against the position, the original thesis is dead.
```

## The rule I would trade first

I would start with one simple, robust rule:

> **Enter the current leader from T+180 to T+240 only when distance passes the default threshold, no recent-lock veto is active, no more than one soft risk flag is active, and the ask is at least 5 percentage points below adjusted p_est.**

Concrete version:

* T+180: enter ≥5 bps only if clean; ≥7.5 bps if high chop/near-line/momentum-against.
* T+200: enter ≥5 bps clean; ≥7.5 bps if risky.
* T+210: enter ≥4–5 bps clean; ≥5–7.5 bps if risky.
* T+220: enter ≥4–5 bps clean; ≥5 bps if risky.
* T+240: enter ≥4 bps clean; ≥5–7.5 bps if risky.
* Never enter recent lock until it proves itself.

That is the cleanest balance between win rate, adverse movement, sample support, and execution realism.

## What I would not do

I would not build the bot around “T+60 ≥5 bps” or “T+90 ≥4 bps” as green entries. Those are useful observations, but they are too close to the lower edge of your comfort zone and too sensitive to chop. Use them only when the market price is very favorable and every risk flag is clean.

I would also avoid tuning dozens of custom rules on the same 3,299-market sample. Your own analytics scope correctly warns that these numbers are discovery-tier and should be validated with time-block or day-level holdouts before being treated as a live strategy. 
