Yes — I’d build this as a **simple current-leader engine**:

> **Do not predict UP or DOWN from market odds.**
> Watch BTC versus the price-to-beat, wait until late in the 5-minute window, then paper-buy whichever side BTC is already leading — unless the path looks fragile.

Your uploaded heatmap supports that approach: the `<=0.5 bps` zone is treated as **no decision/noise**, and late leader reliability gets much stronger with distance. For example, at **T+220**, the checkpoint leader won **88.8%** in the `5–7.5 bps` bucket, **92.7%** in `7.5–10 bps`, and **97.8%** in `>10 bps`; at **T+240**, the same style of late-distance leader stayed very strong, including **89.8%** for `5–7.5 bps` and **98.1%** for `>10 bps`.

## The 4 signals

Use only these:

| Signal                      | Meaning                                  | Action       |
| --------------------------- | ---------------------------------------- | ------------ |
| **1. Leader distance**      | How far BTC is above/below price-to-beat | Main signal  |
| **2. Recent lock risk**     | Leader just took control                 | Adds caution |
| **3. Multi-flip chop risk** | BTC has crossed the line repeatedly      | Adds caution |
| **4. Near-line-heavy risk** | BTC spent too much time in noise         | Adds caution |

The uploaded risk definitions line up well with this: recent lock is based on the current lead/last flip being under 30 seconds; multi-flip is based on at least two recent crosses or at least three prior flips; near-line-heavy is based on at least 30 near-line seconds or near-line share of at least 25%.

## Simple decision rule

The engine watches continuously, but only decides late:

```text
Before T+220: never bet.
T+220 to T+239: only bet if BTC leader distance >= 5 bps.
T+240 or later: only bet if BTC leader distance >= 4 bps.

If 0 risk flags: allow normal threshold.
If 1 risk flag: require +2.5 bps more distance.
If 2+ risk flags: no bet.
If BTC is within 0.5 bps of price-to-beat: no bet.
```

So practically:

| Time      | Risk flags | Minimum distance | Action     |
| --------- | ---------: | ---------------: | ---------- |
| T+220–239 |          0 |            5 bps | Bet leader |
| T+220–239 |          1 |          7.5 bps | Bet leader |
| T+220–239 |         2+ |                — | Skip       |
| T+240+    |          0 |            4 bps | Bet leader |
| T+240+    |          1 |      6.5–7.5 bps | Bet leader |
| T+240+    |         2+ |                — | Skip       |

This keeps the engine easy to understand: **distance is the only positive signal; the other three are reasons to wait or skip.**

## Important design choice

Do **not** flip the bet because of risk.

Bad logic:

```text
BTC is leading UP, but chop risk is high, so buy DOWN.
```

Better logic:

```text
BTC is leading UP, but chop risk is high, so skip.
```

The engine should be a **leader-following engine**, not a reversal engine. Your data shows late distance helps leader reliability; the risk flags mainly identify weaker paths, not clean opposite-side opportunities. The uploaded scope notes also warn that these analytics are discovery-tier and should not be treated as validated strategy claims yet.

## What the engine logs

Even though UP/DOWN market prices should not affect the decision, log them for review.

```json
{
  "marketId": "btc-5m-...",
  "paper": true,
  "stakeUsd": 5,
  "side": "UP",
  "reason": "leader_distance_passed",
  "btcAtBet": 81234.12,
  "priceToBeat": 81200.00,
  "distanceBps": 4.2,
  "secondsElapsed": 242,
  "secondsRemaining": 58,
  "upMarketPrice": 0.76,
  "downMarketPrice": 0.24,
  "riskFlags": {
    "recentLock": false,
    "multiFlipChop": false,
    "nearLineHeavy": false
  },
  "riskCount": 0,
  "result": null
}
```

## End-of-market check

At the end of the 5-minute market:

```text
If close BTC > priceToBeat: actual winner = UP
If close BTC < priceToBeat: actual winner = DOWN
If close BTC == priceToBeat: mark as tie/unknown unless official resolution says otherwise

correct = paperBet.side == actual winner
```

Then update the log:

```json
{
  "closeBtc": 81251.44,
  "actualWinner": "UP",
  "correct": true
}
```

## TypeScript-style engine skeleton

```ts
type Side = "UP" | "DOWN";
type RiskFlags = {
  recentLock: boolean;
  multiFlipChop: boolean;
  nearLineHeavy: boolean;
};

type Tick = {
  tsMs: number;
  btc: number;
};

type MarketState = {
  marketId: string;
  startMs: number;
  nowMs: number;
  btc: number;
  priceToBeat: number;
  upMarketPrice?: number;     // logged only
  downMarketPrice?: number;   // logged only
  ticks: Tick[];
  alreadyBet: boolean;
};

type PaperBet = {
  marketId: string;
  paper: true;
  stakeUsd: number;
  side: Side;
  reason: string;
  btcAtBet: number;
  priceToBeat: number;
  distanceBps: number;
  secondsElapsed: number;
  secondsRemaining: number;
  upMarketPrice?: number;
  downMarketPrice?: number;
  riskFlags: RiskFlags;
  riskCount: number;
  result: null | {
    closeBtc: number;
    actualWinner: Side | "TIE";
    correct: boolean;
  };
};

const MARKET_SECONDS = 300;
const PAPER_STAKE_USD = 5;
const NOISE_BPS = 0.5;

function signedDistanceBps(btc: number, priceToBeat: number): number {
  return ((btc - priceToBeat) / priceToBeat) * 10_000;
}

function leaderFromDistance(distanceBps: number): Side | null {
  if (Math.abs(distanceBps) <= NOISE_BPS) return null;
  return distanceBps > 0 ? "UP" : "DOWN";
}

function sideAtPrice(btc: number, priceToBeat: number): Side | null {
  const d = signedDistanceBps(btc, priceToBeat);
  return leaderFromDistance(d);
}

function countHardCrosses(ticks: Tick[], priceToBeat: number, fromMs?: number): number {
  let crosses = 0;
  let lastSide: Side | null = null;

  for (const tick of ticks) {
    if (fromMs !== undefined && tick.tsMs < fromMs) continue;

    const side = sideAtPrice(tick.btc, priceToBeat);
    if (!side) continue; // ignore noise-band ticks

    if (lastSide && side !== lastSide) crosses += 1;
    lastSide = side;
  }

  return crosses;
}

function currentLeaderAgeSeconds(
  ticks: Tick[],
  priceToBeat: number,
  nowMs: number,
  currentLeader: Side
): number {
  let ageStartMs = nowMs;

  for (let i = ticks.length - 1; i >= 0; i--) {
    const side = sideAtPrice(ticks[i].btc, priceToBeat);

    if (side === currentLeader || side === null) {
      ageStartMs = ticks[i].tsMs;
    } else {
      break;
    }
  }

  return Math.max(0, (nowMs - ageStartMs) / 1000);
}

function secondsNearLine(ticks: Tick[], priceToBeat: number): number {
  // Simple approximation: count tick-to-tick time spent inside noise band.
  // Good enough for v0 paper logging.
  let seconds = 0;

  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1];
    const curr = ticks[i];

    const prevDistance = Math.abs(signedDistanceBps(prev.btc, priceToBeat));
    if (prevDistance <= NOISE_BPS) {
      seconds += (curr.tsMs - prev.tsMs) / 1000;
    }
  }

  return seconds;
}

function computeRiskFlags(state: MarketState, currentLeader: Side): RiskFlags {
  const elapsedMs = state.nowMs - state.startMs;
  const last60StartMs = state.nowMs - 60_000;

  const totalFlips = countHardCrosses(state.ticks, state.priceToBeat);
  const flipsLast60s = countHardCrosses(state.ticks, state.priceToBeat, last60StartMs);
  const leaderAge = currentLeaderAgeSeconds(
    state.ticks,
    state.priceToBeat,
    state.nowMs,
    currentLeader
  );

  const nearLineSec = secondsNearLine(state.ticks, state.priceToBeat);
  const nearLinePct = elapsedMs > 0 ? nearLineSec / (elapsedMs / 1000) : 0;

  return {
    recentLock: leaderAge < 30,
    multiFlipChop: flipsLast60s >= 2 || totalFlips >= 3,
    nearLineHeavy: nearLineSec >= 30 || nearLinePct >= 0.25,
  };
}

function maybeCreatePaperBet(state: MarketState): PaperBet | null {
  if (state.alreadyBet) return null;

  const secondsElapsed = Math.floor((state.nowMs - state.startMs) / 1000);
  const secondsRemaining = MARKET_SECONDS - secondsElapsed;

  // Do not bet early.
  if (secondsElapsed < 220) return null;

  // Avoid last-second weirdness. Optional but useful.
  if (secondsElapsed > 285) return null;

  const distanceBps = signedDistanceBps(state.btc, state.priceToBeat);
  const absDistanceBps = Math.abs(distanceBps);
  const leader = leaderFromDistance(distanceBps);

  if (!leader) return null;

  const riskFlags = computeRiskFlags(state, leader);
  const riskCount = Object.values(riskFlags).filter(Boolean).length;

  if (riskCount >= 2) return null;

  let requiredDistanceBps = secondsElapsed >= 240 ? 4.0 : 5.0;

  if (riskCount === 1) {
    requiredDistanceBps += 2.5;
  }

  if (absDistanceBps < requiredDistanceBps) return null;

  return {
    marketId: state.marketId,
    paper: true,
    stakeUsd: PAPER_STAKE_USD,
    side: leader,
    reason: `leader_distance_${absDistanceBps.toFixed(2)}bps_risk_${riskCount}`,
    btcAtBet: state.btc,
    priceToBeat: state.priceToBeat,
    distanceBps,
    secondsElapsed,
    secondsRemaining,
    upMarketPrice: state.upMarketPrice,
    downMarketPrice: state.downMarketPrice,
    riskFlags,
    riskCount,
    result: null,
  };
}

function settlePaperBet(bet: PaperBet, closeBtc: number): PaperBet {
  let actualWinner: Side | "TIE";

  if (closeBtc > bet.priceToBeat) actualWinner = "UP";
  else if (closeBtc < bet.priceToBeat) actualWinner = "DOWN";
  else actualWinner = "TIE";

  return {
    ...bet,
    result: {
      closeBtc,
      actualWinner,
      correct: actualWinner !== "TIE" && bet.side === actualWinner,
    },
  };
}
```

## The plain-English version

The engine says:

```text
I only care where BTC is versus price-to-beat.

If BTC is barely above/below the line, I do nothing.
If the leader is new, I demand more distance.
If BTC has chopped across the line, I demand more distance.
If BTC lived near the noise band too long, I demand more distance.
If two or more of those risks are present, I skip.

Otherwise, I paper-buy the current BTC leader for $5 and check at close.
```

That is simple, symmetric, and does not care whether the side is UP or DOWN.
