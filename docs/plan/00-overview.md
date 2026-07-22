# 00 — PlayoffOdds Master Plan

**Status: APPROVED v1 (2026-07-16) — all plan docs reviewed and approved; sole remaining open question is Q19 (Vue vs React, deferred to Phase 3 by design)**

This is the top-level plan for PlayoffOdds: a cross-sport playoff probability platform built on top of SportsCrunch. It captures everything decided and discussed to date, and it is the entry point to a set of deeper documents that will be developed and reviewed one at a time — docs first, code later. The full plan is written so that an LLM agent can eventually execute each section with minimal additional context.

**How to use these docs:** start here, then follow the doc map (§9). Every locked decision lives in [99-decisions-open-questions.md](99-decisions-open-questions.md) with rationale; if a deeper doc contradicts a decision there, the decision log wins until explicitly changed.

---

## 1. Product vision

A website — **PlayoffOdds, at playoffodds.com** (D24) — that computes and presents playoff odds for the four major North American sports — NFL, MLB, NBA, NHL — filling the hole left by FiveThirtyEight's death:

- **Probabilistic core:** make-playoffs %, division/seed odds, round-by-round advancement, championship odds, full win distributions — from Monte Carlo simulation with correct tiebreakers.
- **The wedge:** an interactive what-if picker **fused with live simulation** — pick winners and watch probabilities (not just brackets) recalculate. Incumbents are either probabilistic (FanGraphs, MoneyPuck) or interactive (ESPN Playoff Machine) — almost nobody is both.
- **The moats:** (a) verified-correct, era-versioned tiebreakers sourced from official league publications, where most competitors quietly guess; (b) odds-over-time history that — uniquely — we can *backfill* years into the past (§4); (c) mobile-first design in a desktop-first field; (d) cross-sport breadth with single-sport depth; (e) **agent-native from day one** — server-rendered answer-first pages, a no-auth API, and an MCP server, aimed at making playoffodds.com the source LLM agents cite for playoff odds ([05-agent-and-search-discovery.md](05-agent-and-search-discovery.md)); incumbents are client-rendered and API-less.
- **The daily hooks:** game leverage ("tonight's game swings your odds ±9%"), rooting guides, clinch/elimination scenarios, and eventually push notifications on odds movement — retention mechanics no incumbent has.

The competitive survey and feature-by-feature market analysis lives in [`playoff-projections-feature-and-technical-reference.md`](../../playoff-projections-feature-and-technical-reference.md) (repo root). Feature numbers cited below (#1–#31) refer to that document.

## 2. Starting assets

### 2.1 SportsCrunch (`C:\Users\rpane\projects\sportscrunch`)

The owner's existing Laravel 12 app. It already implements stages 1–2 of the universal pipeline (`team strength → per-game win probability`), which means PlayoffOdds builds **only the simulation and product layers**. What SportsCrunch provides:

| Capability | Detail |
|---|---|
| Schedules & results | ESPN API; future schedules 2×/day, live scores every 5 min while games are active. Suspended/postponed/makeup handling. |
| Sportsbook lines | TheOddsApi, ~10 books, every 5 min, NFL/NBA/MLB/NHL. Store-on-change history (`game_lines` + `game_line_histories`); live coverage from ~2020, legacy import (Pinnacle et al. 2014–2024, ~1M snapshots) built. |
| Power ratings | Market-implied: iterative regression fitting team ratings to de-vigged consensus win probabilities, with recency decay, preseason anchor blend, MLB pitcher sub-model, NCAAF conference priors. Computed in memory (`app/Predictors/`), **not persisted, not exposed via API** — an export endpoint is one of our asks. |
| Per-game win probability | Every remaining game carries `market_home_win_probability` on `games`: real market consensus where lines exist, model projection otherwise (refreshed hourly). `market_line_types` bitmask flags real vs projected. |
| Rating→probability model | Logistic: `wp = 1/(1 + e^(−k·(r_home − r_away + hfa)))`, per-league tuned `k` (NFL 2.4, NBA 2.5, NHL/MLB 2.0), HFA additive in logit space. This structure is load-bearing for our sim design (§5). |
| Point-in-time odds | `GET /api/v1/seasons/{season}/historical-odds?at=<ISO8601>` — time-travels every unplayed regular-season game's odds to any past instant, real or projected, with `is_projected` flag. Rate-limited 30/min. |
| API plumbing | Sanctum-authed `/api/v1`: seasons, teams (with conference/division alignment), games, historical-odds, webhooks (push on game/score/line changes). OpenAPI documented. Existing consumer: poolcrunch. |
| Backtest machinery | Walk-forward `PredictorTester` + `PeriodTimeTraveler` — reusable pattern for calibrating and validating our sim. |

**Scope boundary (D9):** SportsCrunch's own data acquisition and completeness — legacy-season line backfill, gap recovery, source redundancy, flat-file hardening — are SportsCrunch's roadmap, not this project's. The owner will backfill older seasons there independently. This project's SportsCrunch-side scope is limited to the **new additions PlayoffOdds needs** ([03-sportscrunch-integration.md](03-sportscrunch-integration.md)): ratings/params endpoint, projected-vs-real flag on the games endpoint, postseason coverage decision, and a bulk-read path for backfill. The sim pipeline must still *consume defensively* — missing or gappy upstream history should degrade gracefully (shallower backfill), never silently corrupt odds.

### 2.2 OLD_playoffodds (`C:\Users\rpane\projects\OLD_playoffodds`)

The owner's hand-built playoff-odds app from ~10 years ago. **Decision D15: not used — not as code, not as a reference.** League tiebreaker procedures have changed at every step since it was written (spot-checks confirmed divergences from current official rules). All tiebreaker rules are sourced fresh from the leagues' official publications and stored **era-versioned** — paired human-readable + machine-encoded rule sets with applicability year ranges ([04-standings-tiebreakers.md](04-standings-tiebreakers.md) §2). Naming note: the *legacy* "playoffodds" MySQL DB is a historical-lines source being imported INTO SportsCrunch — distinct from this new product.

## 3. Locked decisions (summary)

Full log with rationale: [99-decisions-open-questions.md](99-decisions-open-questions.md).

| # | Decision |
|---|---|
| D1 | Docs-first: detailed, reviewable plan docs before any code. |
| D2 | Sport order: engine built sport-agnostic; **MLB is the live development/validation sport** (season in progress now); **public launch targets NFL kickoff** (~Sept 10, 2026); NBA/NHL follow in October. |
| D3 | Website: **Laravel 12 + Inertia**. Frontend framework Vue or React — final call deferred to Phase 3 (owner has light Vue experience and none in React, but is open to React since LLM agents write all the code). |
| D4 | Simulation engine: **TypeScript, shared** — one engine runs as a Node worker (server batches) and in the browser (interactive picker). Standings/tiebreaker logic written once. |
| D5 | Data access: **SportsCrunch API + small additions** (ratings/params endpoint, projected flag, postseason coverage) rather than direct DB reads. |
| D6 | Simulation uses **dynamic in-sim rating evolution** (zero-mean Elo-style updates), not frozen per-game odds. |
| D7 | Per-game probabilities are **anchored to SportsCrunch's blended market/model probability** in logit space; the sim applies rating deltas on top (§5). |

## 4. The backfill advantage

The reference doc's loudest warning — "you cannot backfill odds-over-time charts; start snapshotting before you build UI" — **largely does not apply to us.** Because SportsCrunch can reconstruct every game's win probability as of any past instant (`historical-odds?at=`), we can re-run the full season simulation *as of* past dates and generate historical playoff-odds time series: back to ~2020 from live-crawled lines, and deeper as SportsCrunch's own historical backfill progresses (older seasons are SportsCrunch's roadmap; our backfill depth simply follows whatever upstream coverage exists). Launch-day charts with multi-year history is a feature nobody else can cheaply copy.

We still persist forward-looking daily snapshots from the first week of engine operation (recomputation is expensive and throttled), but backfill converts the doc's hardest constraint into a differentiator. Details: [02-simulation-outputs.md](02-simulation-outputs.md).

## 5. Simulation methodology (summary)

Full detail: [01-simulation-engine.md](01-simulation-engine.md).

**Anchored probabilities.** For each remaining game, SportsCrunch supplies a baseline probability (real de-vigged market consensus where a line exists — which prices in injuries, rest, starting pitchers; model projection otherwise). We precompute `base_logit[g] = logit(wp_base[g])` once per snapshot.

**Dynamic rating evolution.** Each simulated season world maintains per-team rating deltas (starting at 0). Games are simulated in chronological order:

```
wp      = sigmoid(base_logit[g] + k·(Δ_home − Δ_away))   // k = league's tuned sigmoid constant
outcome = bernoulli(wp)
Δ_home += η·(outcome − wp);  Δ_away −= η·(outcome − wp)  // zero-mean, martingale
```

A weak team that starts 4–0 *in a given sim world* gets stronger in that world — producing the fat tails, within-team game correlation, and realistic longshot/collapse scenarios that frozen-odds sims miss, without biasing mean odds (updates are zero-mean by construction). Optional second mechanism (per-sim initial talent draw `ε ~ N(0, σ_est)`) added only if calibration demands it. Precedent: FTN adjusts DAVE ±1.5% per simulated game; FiveThirtyEight ran Elo forward through simulated games.

**Calibration by measurement, not guesswork.** η (per league) is set by measuring how much SportsCrunch's *actual market-implied ratings* drifted over N-week horizons across past seasons (the time-travel machinery reconstructs ratings as-of any past week). Validation: run the engine from historical mid-season dates and check coverage — actual final win totals should land in the simulated 10th–90th percentile band ~80% of the time.

**Determinism & jitter.** Fixed RNG seed per snapshot; 100k sims target (10k floor). Odds must not visibly bounce when no games were played.

**Playoffs.** Bracket simulation continues within each sim world; playoff matchup probabilities come from exported ratings + the same deltas accumulated during that world's regular season (a team that got hot in-sim carries it into the bracket). Requires the SportsCrunch ratings/params endpoint ([03-sportscrunch-integration.md](03-sportscrunch-integration.md)).

**Per-sport gotchas** (detail in 01 and 04):

| Sport | Issue | Approach sketch |
|---|---|---|
| NHL | 3-point games: standings need P(reg win)/P(OT win)/P(OT loss)/P(reg loss); SportsCrunch WP is outright-win only | Layer an OT-frequency model (league OT rate conditional on closeness) splitting outright WP into the four outcomes; track ROW for tiebreakers |
| MLB | Pitcher effects; 162 games | Anchor already prices pitchers into near-term market lines; far games are team-level until lines arrive — acceptable |
| NFL | Brutal tiebreaker cascade; net-points steps want margins | Era-versioned ladder encoded from official NFL procedures (doc 04 §2); margin-first outcome model supplies net-points steps (D12) |
| NBA | Play-in tournament is a separate bracket stage | Simulate play-in explicitly inside each world |

## 6. Output data philosophy

Full detail: [02-simulation-outputs.md](02-simulation-outputs.md).

The engine's outputs are designed **feature-back**: every feature in Part 1 of the reference doc must be servable from stored outputs without re-simulation. Two layers per snapshot:

1. **Aggregates (MySQL, per team per snapshot):** make-playoffs %, division %, wild-card path %, seed distribution (P(seed=1..n)), round-by-round advancement, championship %, bye/best-record odds, win-total distribution percentiles, projected record, SOS-remaining, draft-order odds. Keyed `(league, season, snapshot_instant, team)`.
2. **Per-sim outcome matrix (compact artifact per snapshot):** every sim's remaining-game outcome vector + resulting per-team seeds/finishes. This single artifact powers the conditional features with zero extra simulation: leverage (partition sims by tonight's game outcome → P(playoffs | win) vs P(playoffs | loss)), rooting guide (partition by *other* teams' games), what-if picker server-precision results (filter sims matching user picks), and the compact client payload for browser sims.

## 7. Feature areas → docs

| Doc | Covers (ref-doc feature #s) | Depends on |
|---|---|---|
| [features/10-core-odds-displays.md](features/10-core-odds-displays.md) | #1–7 core probabilities, #27 power ratings, #28 SOS, #31 viz | Aggregates |
| [features/11-history-timeseries.md](features/11-history-timeseries.md) | #8 odds-over-season charts, #9 date selector, #10 preseason-vs-now | Snapshots + backfill |
| [features/12-interactive-picker.md](features/12-interactive-picker.md) | #12–14 picker + live sim fusion + shareable links | Browser TS engine, outcome matrix |
| [features/13-leverage-rooting.md](features/13-leverage-rooting.md) | #15 rooting guide, #17 leverage, #18 daily swing feed | Outcome matrix partitioning |
| [features/14-clinch-magic-elimination.md](features/14-clinch-magic-elimination.md) | #19 control-your-destiny, #20 magic numbers (+probability fusion), #21 clinch scenarios | Tiebreaker engine (deterministic mode) |
| [features/15-notifications-mobile.md](features/15-notifications-mobile.md) | #23 push notifications, #24 mobile-first UX | Snapshots, leverage |
| [features/16-public-api.md](features/16-public-api.md) | #25 public API / data downloads | Aggregates, snapshots |
| [features/17-draft-order.md](features/17-draft-order.md) | #29 draft order & lottery | Same sim outputs, bottom of standings |

Deliberately deferred: #11 live in-game odds (approximation path noted in 13), #30 injury/roster awareness (v2; SportsCrunch anchor partially prices it via market lines), #26 cross-sport is the product itself.

## 8. Build order (summary)

Full phasing with exit criteria: [90-build-order.md](90-build-order.md). Compressed view:

- **Phase 0 (now):** SportsCrunch additions — ratings/params endpoint, projected flag, postseason/bulk-read decisions. Finish these plan docs.
- **Phase 1 (Jul–Aug):** TS engine core against live MLB — schedule/standings/tiebreakers (MLB, NFL), anchored+dynamic sim, calibration harness, historical verification.
- **Phase 2 (Aug):** Snapshot pipeline + backfill; daily MLB snapshots running unattended.
- **Phase 3 (Aug–Sep):** Website (Laravel + Inertia/Vue): core odds tables, team pages, seed matrix, time-series charts (backfilled), NFL onboarding.
- **Phase 4 (Sep):** **NFL launch** at kickoff. NBA/NHL onboarding begins.
- **Phase 5 (Oct+):** Interactive picker (browser engine), leverage feed + rooting guide, clinch/magic, NBA/NHL live, then notifications, public API, draft order.

## 9. Doc map & status

| Doc | Purpose | Status |
|---|---|---|
| 00-overview.md (this) | Master plan, entry point | DRAFT v1 |
| [01-simulation-engine.md](01-simulation-engine.md) | Sim engine: math, algorithms, per-sport models, calibration | APPROVED v1 (2026-07-16) |
| [02-simulation-outputs.md](02-simulation-outputs.md) | Output schemas, snapshot store, outcome matrices, backfill | APPROVED v1 (2026-07-16) |
| [03-sportscrunch-integration.md](03-sportscrunch-integration.md) | Data contracts, SportsCrunch-side additions, pipeline triggers | APPROVED v1 (2026-07-16) |
| [04-standings-tiebreakers.md](04-standings-tiebreakers.md) | Era-versioned tiebreaker rules architecture + verification | APPROVED v2.1 (2026-07-16; all 4 leagues verified vs official sources) |
| [05-agent-and-search-discovery.md](05-agent-and-search-discovery.md) | Agent-friendliness + SEO/GEO: crawler posture, MCP server, anonymous API tier | DRAFT v1 — pending review |
| features/10, 11 | Core odds displays; history & time series (gate Phase 3) | APPROVED v1 (2026-07-16) |
| features/12, 13 | Interactive picker; leverage & rooting (gate Phase 5) | APPROVED v1 (2026-07-16) |
| features/14–17 | Clinch/magic; notifications/mobile; public API; draft order | APPROVED v1 (2026-07-16) |
| [90-build-order.md](90-build-order.md) | Phases, dependencies, exit criteria | DRAFT v1 |
| [99-decisions-open-questions.md](99-decisions-open-questions.md) | Decision log + open questions | LIVE |

**Process:** each OUTLINE doc gets a detail pass + owner review before any code that depends on it. Decisions made during reviews land in 99 with rationale.
