# 01 — Simulation Engine

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.**
Proposed resolutions to Q1–Q5 are in §14 and marked **PROPOSED** until reviewed.

The core Monte Carlo engine: a TypeScript package (`@playoffodds/engine`) with **zero runtime I/O** — pure functions over typed inputs — consumed by (a) a Node worker for server-side batches and (b) the browser for the interactive picker. All league rules, simulation math, and tiebreakers live here, written once (decision D4).

---

## 1. Design principles

1. **Pure core.** The engine never fetches, reads disk, or knows about SportsCrunch. It receives a `SnapshotBundle` and returns results. The pipeline (doc 03) assembles bundles; the store (doc 02) persists results.
2. **Deterministic.** Same bundle + same seed → identical output *within a runtime*. (Bit-exactness **across** runtimes — Node vs browser, or different JS engines — is not promised: transcendental functions like `Math.exp` may differ in the last ulp. Per-runtime determinism is sufficient for the jitter guarantee and for debugging; do not build features that require cross-runtime bit-equality.)
3. **Structure-of-arrays, typed arrays everywhere.** No per-sim objects. The hot loop is flat `Float32Array`/`Uint8Array`/`Int16Array` math that JIT compiles well in both V8 and browsers.
4. **Single source of truth for season state.** The bundle contains the *full* season schedule (played games with scores, remaining games with anchors). The engine derives current standings, head-to-head matrices, and tiebreaker precomputes itself — the same code path that handles simulated games handles played ones, so sim standings and real standings can never disagree structurally.
5. **League rules are data + small modules.** One `LeagueModule` per sport implementing a shared interface (schedule semantics, outcome model, standings/tiebreakers, playoff bracket). Adding NBA/NHL later must not touch the core loop.

## 2. Package layout & public API

```
packages/engine/
  src/
    core/        rng.ts, simLoop.ts, margins.ts, aggregate.ts
    leagues/     nfl/, mlb/, nba/, nhl/   (module per league: rules.ts, standings.ts, tiebreakers.ts, bracket.ts)
    types.ts     (SnapshotBundle, SimOptions, SimRun, ...)
    index.ts
  test/          unit, golden-master seasons, property tests, benchmarks
```

```ts
// Primary entry point
function simulateSeason(bundle: SnapshotBundle, opts: SimOptions): SimRun;

interface SimOptions {
  nSims: number;              // server: 100_000; browser: 2_000–5_000
  seed: number;               // fixed per snapshot (jitter guarantee)
  pins?: GamePin[];           // forced outcomes for the interactive picker
  recordOutcomes?: boolean;   // emit per-sim outcome matrix (server: true)
}

interface SimRun {
  // Layer-2 raw results (doc 02 owns persistence format)
  outcomes?: OutcomeMatrix;         // bit-packed per-sim per-game results (+ NHL end types)
  finishes: TeamFinishMatrix;       // per-sim per-team: seed, round reached, champion, W/L(/OTL), draft slot order
  // Layer-1 aggregate helpers (reducers over the matrices)
  aggregate(): TeamAggregates[];    // p_playoffs, p_division, p_seed[], p_round[], p_championship, win percentiles, ...
  partitionByGame(gameId: GameId): ConditionalAggregates;  // leverage / rooting guide (features/13)
}
```

`GamePin` support in the core loop (outcome forced, no RNG draw, **dynamic update still applied** — a pinned upset makes that team stronger downstream) is what makes the picker probabilistically honest (features/12).

## 3. SnapshotBundle schema

Assembled by the pipeline from SportsCrunch (contract in doc 03). Everything the engine needs; nothing it doesn't.

```ts
interface SnapshotBundle {
  league: 'nfl' | 'mlb' | 'nba' | 'nhl';
  seasonYear: number;               // upstream convention: NBA/NHL year = ending year
  asOf: string;                     // ISO instant this bundle represents (backfill uses past instants)
  teams: TeamInput[];               // id, conference, division (from season_team alignment)
  games: GameInput[];               // FULL season, regular + postseason-so-far
  ratings: Record<TeamId, number>;  // current power ratings, SportsCrunch scale (playoff pricing + picker display)
  params: LeagueParams;             // see below
}

interface GameInput {
  id: GameId;
  date: string;                     // local league date (simultaneity bucketing, §5)
  homeId: TeamId; awayId: TeamId;
  neutral: boolean;
  seasonType: 'regular' | 'postseason';
  status: 'final' | 'remaining';
  // status === 'final':
  homeScore?: number; awayScore?: number;
  endType?: 'REG' | 'OT' | 'SO';    // NHL (and NFL tie detection via equal scores)
  // status === 'remaining':
  baseLogit?: number;               // logit(anchored wp): market consensus if a real line exists, else model projection
  isProjected?: boolean;            // provenance flag (display/debug only; math identical)
}

interface LeagueParams {
  k: number;                        // sigmoid constant (upstream-tuned: NFL 2.4, NBA 2.5, NHL/MLB 2.0)
  hfaLogit: number;                 // home advantage in logit space = −ln(1/hfaWP − 1) (regular season AND playoffs, §8)
  eta: number;                      // dynamic drift rate, OUR calibration (§10)
  marginSigma?: number;             // NFL/NBA margin model (§6); absent for MLB
  nhl?: NhlOutcomeParams;           // §7
}
```

**Anchor semantics (D7).** For remaining regular-season games the per-game probability is *anchored*: `baseLogit` already contains everything SportsCrunch knows (market lines where they exist — pricing injuries, rest, starting pitchers — model projection elsewhere, HFA included). The engine never re-derives regular-season probabilities from ratings; ratings are used **only** for postseason matchups that don't exist yet (§8) and for published transparency displays.

## 4. RNG

- **splitmix64 seeding → xoshiro128++** core, implemented locally (~30 lines, no dependency), identical source for Node and browser.
- One master seed per snapshot; per-sim streams derived by `seed ⊕ simIndex` jumps so any subset of sims is reproducible independently (lets the browser run "sims 0–1999" and later extend to 5000 without redoing work).
- `Math.random` is banned in the package (lint rule).

## 5. The regular-season simulation loop

Per-snapshot precomputation (once, not per sim):

1. Sort remaining games chronologically; group into **date buckets**.
2. Build per-game index arrays: `homeIdx`, `awayIdx`, `baseLogit` as flat typed arrays.
3. Derive current standings state from `final` games (records, division/conference splits, H2H, points/goals — the same accumulators simulated outcomes will extend).

Per sim world (vectorized across all sims — the loop is per *game*, operating on all-sims arrays):

```
Δ = Float32Array(nSims × nTeams)          // rating deltas, start 0
for each date bucket B (chronological):
  for each game g in B:
    lg = baseLogit[g] + k · (Δ[home(g)] − Δ[away(g)])     // per-sim logit
    wp = 1 / (1 + exp(−lg))
    outcome, margin = outcomeModel(league, wp, rng)        // §6/§7; pins short-circuit the draw
    record(outcome, margin)
  after bucket B:                                          // simultaneity: same-day games can't inform each other
    for each game g in B:
      d = η · (outcome(g) − wp(g))
      Δ[home(g)] += d;  Δ[away(g)] −= d                    // zero-mean (martingale): widens tails, never biases means
```

Notes:
- Bucketing by date (not per-game sequential) mirrors real information flow — a 1:00pm result can't have influenced another 1:00pm game — and makes results order-independent within a slate.
- The update uses the **outright binary outcome** (NHL: win incl. OT/SO) against the pre-game `wp`.
- Memory at 100k sims: `Δ` = 100k × 32 × 4B ≈ 12.8 MB; NFL outcome bits ≈ 3.4 MB; MLB ≈ 30 MB bit-packed. Comfortable server-side; the browser runs 2–5k sims (< 2 MB total).

After the last regular-season bucket: standings → tiebreakers (doc 04) → seeds → playoff bracket (§8) → finishes recorded.

## 6. Outcome & margin model (NFL, NBA — margin-first)

Leagues whose tiebreaker ladders reference points (NFL: SOV/SOS are W/L-based but steps 7–10 are points-based; NBA: point differential step) get a **margin-first** model — one draw yields both margin and outcome, guaranteeing consistency:

```
μ = marginSigma · Φ⁻¹(wp)          // chosen so P(margin > 0) = wp exactly
margin ~ Normal(μ, marginSigma)     // NFL σ ≈ 13.5, NBA σ ≈ 11.5 (calibrate from history)
outcome = margin > 0
```

- Cost: one Gaussian draw (Ziggurat or Box–Muller from the xoshiro stream) instead of one uniform — negligible, and it makes *every* points-based tiebreak step exact rather than approximated. This supersedes the "lazy margins only when a tie reaches a points step" idea: always-on is simpler and effectively free.
- **NFL ties:** map `|margin| < 0.5` → tie (≈3% of raw draws land there; real NFL tie rate is ≈0.4%, so compress: only draws in a narrow calibrated band become ties, others round away). Detail: pick band width so simulated tie rate matches the historical rate. Ties enter standings as 0.5 wins (the ported tiebreaker code already handles them).
- **MLB:** Bernoulli on `wp` only. Its ladder (H2H → intradivision → interdivision → last-half intraleague) never needs runs.
- Margins accumulate into per-sim PF/PA accumulators only for leagues that need them (`Int32Array` per team).
- Normal margins ignore NFL key-number lumpiness (3, 7). Irrelevant here: only *aggregated season net points* feed tiebreaks, and the CLT washes key numbers out. Documented as a non-goal.

## 7. NHL outcome model (five outcomes)

SportsCrunch's `wp` is outright (win incl. OT/SO). NHL standings need more: points (2/2/2/1/0), regulation wins (RW), regulation+OT wins (ROW), goal differential. Decomposition per game:

```
pReg   = P(regulation decision | wp)     // logistic in closeness: fit a + b·(1 − 2·|wp − 0.5|) on history
                                          // (closer games → more OT; league OT rate ≈ 23%)
if regulation decision:
    winner via compressed prob?  NO — regulation winner prob ≈ wpReg where wpReg solves:
    wp = pReg·wpReg + (1−pReg)·wpExtra,  wpExtra = 0.5 + c·(wp − 0.5)   // OT/SO compresses skill, c ≈ 0.35, calibrated
    margin: discrete goal margin ≥ 1 sampled from historical distribution conditional on wpReg
else (OT/SO):
    OT vs SO: league-constant split (≈ 55/45, calibrated); margin = ±1
    winner: Bernoulli(wpExtra)
```

Outputs per game: outcome class ∈ {regW, otW, soW, otsoL, regL} per team → points, RW, ROW, GD accumulate directly. The five-class split gives the tiebreaker ladder everything except the final "goals scored" step, which uses sampled margins + a league-average goals baseline (documented approximation; that step is effectively never decisive — log a counter to verify).

Calibration inputs: upstream `games.period` (>3 ⇒ extra time) and end-type parsing give historical `pReg`, OT/SO split, and margin distributions. Dynamic deltas shift the *outright* `wp` (via `baseLogit` as usual); the decomposition re-derives from the shifted value.

## 8. Playoff bracket simulation

Runs inside each sim world after seeding. Matchup pricing (no anchors exist for hypothetical games):

```
lg = k · ((r_home + Δ_home) − (r_away + Δ_away)) + hfaLogit   // ratings + that world's accumulated deltas
```

A team that ran hot in-sim carries its heat into the bracket — this is what makes championship tails realistic. Dynamic updates continue through playoff games (same η). Regular-season HFA is reused for playoff home games (v1 simplification; leagues' playoff HFA is empirically close — log calibration data to revisit).

Per-league formats (encode as data; re-verify against official rules each season — they drift):

| League | Field | Structure |
|---|---|---|
| NFL | 7/conf (4 div winners seeded 1–4 by record+tiebreaks, 3 WC 5–7) | Seed 1 bye; 2v7 3v6 4v5; **reseed each round** (highest remaining hosts); single games; Super Bowl neutral |
| MLB | 6/league (3 div winners, 3 WC) | Seeds 1–2 bye; WC best-of-3 all at higher seed (3v6, 4v5); **fixed bracket** (1 meets 4/5 winner); LDS Bo5 (2-2-1), LCS/WS Bo7 (2-3-2); WS home field to better record |
| NBA | Play-in: 7v8 (winner = 7 seed), 9v10, loser-of-7v8 v winner-of-9v10 (winner = 8 seed); then 8/conf | Fixed bracket 1v8 2v7 3v6 4v5; all series Bo7 (2-2-1-1-1); home court by record |
| NHL | Top 3 per division + 2 WC per conf | Divisional bracket: best div winner v WC2, other div winner v WC1, 2v3 within divisions; winners meet in round 2; conf final; SCF; all Bo7 (2-2-1-1-1); home ice by points/seeding |

Series are simulated game-by-game with the home pattern applied (HFA flips per game). Engine emits per-team round-reached and champion flags. MLB playoff starting pitchers are ignored (team-level pricing) — documented v1 limitation; the market anchor advantage doesn't exist for hypothetical games.

## 9. Standings, tiebreakers, and deterministic mode

Standings/tiebreaker modules are specified in doc 04 and consumed here through one interface:

```ts
interface StandingsModule {
  seedRegularSeason(state: SeasonAccumulators): SeedResult;   // per conference/league: seeds + explanation trace
  // deterministic mode: same code, real games only — powers clinch/magic/scenario features (features/14)
}
```

Performance rule (reference doc §5): tiebreakers, not game sims, are the bottleneck. H2H matrices and common-opponent sets are precomputed **per snapshot** for played games and *incrementally extended* per sim with simulated results — never rebuilt from scratch inside a sim. Budget: tiebreak resolution must average < 50µs per sim world (profiled per league; NFL worst).

## 10. Calibration (η per league) — measurement, not guesswork (D8)

η is the drift rate: how fast a sim world's belief about a team moves per game of evidence. Procedure:

1. **Measure real drift.** Using SportsCrunch's time-travel reconstruction, compute market-implied ratings for every team at every period of the last N seasons (N ≥ 3 per league). For horizons h ∈ {2, 4, 8, …} periods, collect `rating(t+h) − rating(t)` distributions.
2. **Match in-sim drift.** Simulated rating trajectories under candidate η must reproduce those horizon-drift variances (sim drift variance ≈ η² · Σ wp(1−wp) per game played; solve analytically, then verify by simulation).
3. **Validate end-to-end (coverage).** Run the full engine from historical mid-season dates (every 2 weeks, ≥ 3 seasons): actual final win totals should land in the simulated [10th, 90th] percentile band ~80% of the time, [25th, 75th] ~50%. Under-coverage ⇒ η too small (or σ_est needed, Q1); over-coverage ⇒ too large.
4. **Sanity: martingale check.** Mean aggregate odds across sims with η > 0 must equal the η = 0 baseline within Monte Carlo noise (updates are zero-mean by construction; a drift in means indicates an implementation bug).
5. Also validate: Brier score / log-loss of `p_playoffs` against realized outcomes, benchmarked against the frozen-odds (η = 0) engine — dynamic must not be *worse* on proper scores.

Calibration artifacts (η, marginSigma, NHL params, tie-band widths) are versioned constants in the engine package with a doc trail — recalibrated preseason per league, not per snapshot.

## 11. Determinism & the jitter guarantee

- Snapshot seed = stable hash of `(league, seasonYear, snapshotInstant)` → two runs of the same snapshot are identical; consecutive daily snapshots with **no games played and unchanged anchors** produce identical odds (the reference doc's trust requirement).
- When anchors move without games (line movement), odds move for real reasons — display layer may annotate "line-driven" vs "result-driven" changes (feeds features/11 annotations).
- 100k sims ⇒ Monte Carlo SE ≈ 0.16% on a 50% probability — sub-display-precision.

## 12. Performance budgets

| Target | Budget |
|---|---|
| NFL 100k sims (272 games + tiebreaks + brackets) | < 10 s single Node worker |
| MLB 100k sims (2,430 games) | < 60 s |
| NBA/NHL 100k sims (1,230/1,312 games + brackets) | < 30 s |
| Browser: 2k sims after one pick toggled | < 200 ms (Web Worker, features/12) |
| Full backfill re-sim (one season-day snapshot) | same as above — a season backfill (~200 snapshots) is an overnight batch job |

Benchmarks live in the package (`npm run bench`) and run in CI against golden bundles; a >20% regression fails the build.

## 13. Testing strategy

1. **Tiebreaker verification (the moat):** golden-master tests replaying ≥ 5 past final seasons per league → exact official seeding (doc 04 owns the harness; runs in this package's CI).
2. **Property tests:** per team, Σ p_seed + p_miss = 1; p_championship ≤ p_round[r] ≤ p_playoffs monotone cascade; pins reduce to conditional probabilities consistent with `partitionByGame` on the unpinned run.
3. **Martingale test** (§10.4) and **coverage tests** (§10.3) as slow-suite CI.
4. **Cross-runtime smoke:** Node vs headless-browser run of the same small bundle — aggregate odds agree within MC noise (not bit-exact, §1.2).
5. **Golden bundles:** frozen SnapshotBundle fixtures per league (mid-season, late-season race, clinch-eve) so behavior changes are always visible in review diffs.

## 14. PROPOSED resolutions to open questions (owner review requested)

| Q | Proposal | Rationale |
|---|---|---|
| Q1 (σ_est per-sim talent draw) | **Defer.** Ship η-only; add σ_est only if coverage tests (§10.3) show early-season under-dispersion. | Fewer free parameters; the anchor already embeds market uncertainty; coverage tests give an objective trigger. |
| Q2 (sim counts) | **100k server-side for all four leagues** (budgets §12); 2–5k browser. Sim count is a knob, not architecture. | 100k ⇒ invisible jitter + reliable tails; runtimes are comfortably inside budget in typed-array JS. |
| Q3 (NFL margins) | **Margin-first model for NFL/NBA (§6), always on.** No lazy evaluation. | One draw yields outcome + margin consistently; makes every points-based tiebreak exact; cost negligible. |
| Q4 (NHL OT model) | **Five-outcome decomposition (§7):** closeness-conditional P(regulation), league-constant OT/SO split, compressed extra-time win prob, discrete goal margins. | Matches exactly what the standings ladder consumes (points/RW/ROW/GD); every parameter measurable from upstream history. |
| Q5 (playoff HFA/brackets) | **Reuse regular-season `hfaLogit` for playoff home games; ratings+deltas price matchups; formats as data tables (§8), re-verified preseason.** | Simple, defensible v1; empirical playoff-HFA deltas are small; logged data enables later refinement. |

New minor opens surfaced by this pass (tracked here, not promoted to 99 unless they grow): NFL tie-band calibration; NHL "goals scored" final-step approximation; MLB playoff pitcher-blindness disclosure text.

## 15. Dependencies

- **Doc 03:** bundle assembly (anchors via games/historical-odds endpoints; ratings/params endpoint is the one hard new upstream dependency — needed by §8).
- **Doc 04:** standings/tiebreaker modules (this doc consumes their interface; port order NFL → MLB first per D2).
- **Doc 02:** owns persistence formats for `OutcomeMatrix`/`TeamFinishMatrix` and the client payload derived from bundles.
