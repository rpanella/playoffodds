# Features 13 — Leverage, Tonight, and Rooting Guides

**Status: DRAFT v2 (2026-07-22).** Phase 5B; all branch values are conditional Monte Carlo estimates with diagnostics.

## 1. Definitions

For affected team `T`, game `G` and modeled outcome classes `c`:

- `P_T(c)` is the estimated target probability conditional on outcome class `c`.
- For a binary decisive game, signed swing is `P_T(home win) - P_T(away win)`.
- For multi-valued NFL/NHL games, the stored vector retains tie/regulation/extra-time classes. A simplified “root for team” comparison may pool classes only with a declared weighting/semantic; regulation-loss implications remain separately expressible.
- A ranking leverage metric combines dispersion across conditional values with the modeled outcome probabilities. Its exact versioned formula is internal/ranking-only and handles all outcome classes; it is not forced into a binary `2p(1-p)` framing for NHL.
- League-wide game leverage aggregates team-level ranking values using a declared target set and normalization so cross-date/league comparisons are not implied accidentally.

Display the concrete conditional pair/vector and uncertainty, not the opaque index. Swings are not additive. “Everything goes right” is a joint picker/direct-conditioned scenario.

## 2. Estimation and quality gates

`game_conditionals` is derived from the same published matrix/worlds and stores branch sample count/ESS, standard error/interval, method/build and suppression reason. It is not “zero extra uncertainty” and never labeled exact.

- Publish a branch only when all displayed outcome classes meet the Phase 5B sample/ESS and uncertainty gates.
- Rare multi-valued branches can use stratified/direct conditioned computation if product value justifies it; otherwise show unavailable rather than a noisy number.
- Rows below an effect-size display floor may be omitted, but diagnostics remain and the floor is above measured sampling noise.
- Joint paths and scenario cards use features/12 direct conditioned simulation when matrix ESS is inadequate.

## 3. Local data sources

- Current slate/status/start/neutral/finality: local `games` and `game_change_events`.
- Snapshot identity and current semantics: `publication_pointers`/`snapshots`.
- Branch estimates: `game_conditionals` linked to immutable matrix/build.
- Team context: `team_odds` and `snapshot_team_standings`.
- Annotations/corrections: `snapshot_events`.

No page or notification candidate calls SportsCrunch or simulates in the request path.

## 4. Surfaces

### `/{league}/tonight`

Use the league-local current slate with actual start times and status. Rank eligible games by the versioned leverage metric. Cards show matchup, start/status, anchor probability/source warning, the top affected teams, conditional outcome values and an estimate/uncertainty disclosure. Intraday pointer advance recomputes the remaining slate from new stored rows.

### Team rooting page

Show the team's own game first, then other current-slate games by estimated impact. Text says, for example, “Estimated playoff chance: 61.3% if A wins vs 55.1% if B wins,” with interval/details. NHL can state “needs a regulation loss” only when the class-level result supports it.

The “best case tonight” link canonicalizes favorable outcome classes and sends one joint scenario to the picker; it never sums individual swings.

### Team schedule badges

Only games inside the published conditional horizon with quality-passing rows receive a badge. Missing/low-ESS rows show no fake tier. Badge/tooltip content is keyboard/touch accessible and has a textual alternative.

## 5. Language and proof separation

Use “estimated swing,” “root for,” and conditional values. Do not say a result clinches/eliminates unless Phase 5E returns `proven` evidence or the official standings source declares the status. A 100% branch estimate remains probabilistic.

Correction events can reverse a previously sent impact story. Current pages display the corrected snapshot/event; notification policy handles retraction separately.

## 6. Live in-game approximation (deferred)

With a future contract-tested local live win-probability feed, binary pregame branches can be interpolated for one active game and labeled **live estimate**. Multi-game overlap, ties and NHL class probabilities require a declared approximation; independence interpolation is not presented as exact.

This remains deferred until the feed is locally materialized with timestamps/quality and evaluated. It is not a Phase 0 SportsCrunch requirement and never causes live upstream calls from rendering.

## 7. API and caching

Feature endpoints return stable DTOs over current snapshot/game/branch estimates, with decimal units, class semantics, branch counts/ESS/uncertainty, exact `as_of`, correction warning and canonical URL. Current responses revalidate by pointer version; immutable snapshot variants cache by checksum. Broader public API/MCP exposure may land in Phase 6, but site DTOs are public-shaped from first implementation.

## 8. Phase 5B acceptance and failure

- Binary and multi-valued fixture calculations match the declared metric and never drop NHL loser-point/tie semantics silently.
- Every displayed branch passes sample/ESS/uncertainty gates and exposes diagnostics; suppressed rows remain absent/unknown.
- Current/intraday/final/corrected slate transitions use local materialization and do not show stale games as upcoming.
- Joint scenarios use conditioned computation; UI/tests prohibit swing summation.
- Keyboard/touch/no-color/reduced-motion and mobile layouts pass doc 06 gates.
- Load/overload does not compete with publication capacity.

On missing matrices, low ESS, stale pointer or failed recomputation, suppress the affected estimate/page module and keep core odds available with an honest unavailable state.
