# 01 — Simulation Engine Contract

**Status: DRAFT v2 (2026-07-22) — architecture and acceptance gates; calibration parameters remain measured Phase 0/1 outputs.**

`@playoffodds/engine` is a pure TypeScript package consumed by a Node worker and, for the picker, a browser worker. It performs no network, database, filesystem, clock, locale, or ambient-randomness I/O. It receives an exact pinned bundle and returns versioned results.

## 1. Invariants and ownership

1. **Pure and pinned.** All games, state, parameters, bracket configuration, and the exact SportsCrunch rule artifact are explicit inputs.
2. **Local evaluation.** The engine never calls SportsCrunch. Its generic TypeScript rules evaluator implements doc 04 and must pass PHP/TypeScript differential tests.
3. **Full-world consistency.** Each simulated future produces one coherent regular-season, postseason, and draft-relevant world. Known results are never resimulated.
4. **Deterministic within a declared replay envelope.** Same canonical bundle bytes, build, options, recorded runtime envelope, and seed produce identical versioned binary output. Cross-runtime behavior outside that envelope is a conformance test, not an unqualified bit-exact promise.
5. **No false proof.** Simulation aggregates and matrix filters are estimates. Clinch/elimination/magic proof belongs to the separate subsystem in features/14.
6. **Rules authored once.** League/year rule definitions come only from the pinned SportsCrunch artifact; PlayoffOdds duplicates only the generic evaluator.

## 2. Canonical `SnapshotBundle`

Doc 02 owns storage/canonicalization; this engine contract requires these logical sections:

| Section | Required content |
|---|---|
| Identity | Bundle schema/version, immutable candidate ID, league, season, exact `as_of`, source mode(s), creation instant. |
| Teams/seasons | Stable team and season-team IDs, season-scoped conference/division alignment, display identity references. |
| Games | Full relevant schedule and results with stable IDs, actual/scheduled start instant, season type, status/finality, neutral/site, scores/outcome/end type, and anchor/provenance for remaining games. |
| State | Normalized current standings inputs plus resumable `PostseasonState` (§3). Authoritative SportsCrunch standings are retained for parity, not trusted as a substitute for local rebuilding. |
| Model | Team ratings/state, declared anchor semantics, calibrated league/outcome parameters, model/parameter IDs and checksums. |
| Rules | Exact canonical standings rule payload, schema, IDs/checksums, selection explanation, fixture manifest reference. |
| Playoffs | Versioned bracket/play-in/wild-card configuration, venue/home assignment rules, series format, reseeding behavior. |
| Lineage | Upstream response artifact checksums, normalization version, warnings/corrections/coverage, and exact cutoff semantics. |

Every ID referenced by a result or feature has a stable mapping in the bundle. Validation rejects unknown teams/games, duplicate IDs, contradictory statuses, missing league-required fields, checksum mismatch, unsupported schema/capability, or impossible postseason state.

## 3. Resumable `PostseasonState`

The bundle always declares postseason phase: `not_started`, `in_progress`, or `complete`. The state includes, as applicable:

- bracket/play-in/wild-card node IDs and known matchups;
- completed postseason games and series with scores/end types;
- current series scores and home/venue progression;
- teams already advanced or eliminated;
- unresolved/conditional remaining bracket nodes and reseeding inputs; and
- the bracket configuration/checksum that interprets the state.

The engine validates that completed games imply the stated series scores and advancement, no eliminated team remains eligible, and known matchups agree with bracket rules. A simulation starts at the first unresolved node. It does not replay earlier rounds or infer missing state from today's bracket.

Historical snapshots use the state known at their exact cutoff and record whether it was captured or retrospectively reconstructed (D34).

## 4. API and outputs

The public engine surface accepts a bundle plus explicit options: simulation count, seed/stream range, forced outcomes, whether to record raw outcomes, and requested reducers. It returns:

- versioned multi-valued outcome planes for remaining regular/postseason games when requested;
- versioned per-team finish fields (regular-season record/points, qualification path, seed, round reached, champion, bottom/draft-relevant rank);
- aggregate probabilities, distributions, reach/fallback counters, and uncertainty diagnostics; and
- build/rules/parameters/bundle checksums copied into result metadata.

The engine refuses incompatible build/bundle/rule/binary versions. It does not silently upgrade an artifact or reinterpret a stored plane.

## 5. Randomness and replay

- Use one documented, versioned PRNG implementation shared by Node and browser; ambient `Math.random` is prohibited.
- Derive independent per-simulation streams from the run seed and simulation ordinal so a 2k client result can extend to 5k without rerunning earlier streams.
- The server snapshot seed derives from immutable snapshot identity. A picker seed derives from snapshot identity plus the canonical ordered pin encoding (D35), so all viewers of a shared scenario receive the same streams.
- Record PRNG version, seed, stream range/count, engine source/build ID, package-lock/build checksum, runtime name/version, architecture, relevant numeric flags, and binary serialization version.
- Phase 0 defines the supported exact replay envelope. If host transcendental behavior prevents cross-runtime byte identity, archived server replay uses the recorded supported runtime/container; Node/browser aggregates must still pass declared differential tolerances and invariant tests.

Replay verification reads the retained bundle without network access, validates every checksum, reruns the recorded build/options, and compares binary and aggregate checksums according to the declared envelope. Failures quarantine the artifact and alert; they do not rewrite it.

## 6. Information timing and dynamic rating evolution

Remaining games are ordered by actual/scheduled start instants and grouped by an explicit **information-overlap policy**, never calendar-date buckets. Games whose playing intervals overlap cannot influence one another. For future games, the bundle carries a derived information-batch ID based on scheduled start plus a versioned league duration/overlap assumption; played games use known start/finality when available.

Within each information batch:

1. Compute probabilities from anchors plus the world's pre-batch team deltas.
2. Sample every game/outcome in the batch.
3. Apply standings accumulators for those results.
4. Apply centered rating-delta updates only after all batch outcomes are fixed.

The pairwise latent update remains zero-sum and its sampled residual is centered as designed. That **does not** prove aggregate mean probabilities remain unchanged after a nonlinear sigmoid. Tests must:

- verify update residuals/latent deltas are centered;
- measure induced probability and aggregate-odds drift against a frozen-delta baseline with confidence intervals;
- set a product tolerance or recalibrate the update if material drift appears; and
- validate out of sample with Brier score, log loss, calibration curves/bins, and interval coverage.

Dynamic evolution (D6) ships only if it meets those gates and is no worse than the frozen baseline on agreed proper scores. Otherwise the safe rollback is `eta=0` while preserving the architecture.

## 7. Outcome and discrete score models

All per-game outputs are sampled from a valid probability simplex. Calibrated parameters are versioned inputs, not hard-coded planning constants.

### MLB

Sample the declared home-win probability as Bernoulli. Runs are not required by the initial standings registry; if a future procedure/feature requires them, it is a versioned model capability.

### NBA

Use a calibrated discrete joint score/margin distribution whose probability of positive home margin equals the anchored home-win probability within calibration tolerance. Scores are non-negative integers; ties are disallowed by the final-game procedure. The conversion from latent total/margin to integer scores, overtime handling, and any reconciliation step are versioned and fixture-tested. Accumulators consume the final integer scores only.

### NFL W/L/T

The anchor contract is normalized to expected home win credit `m = P(home win) + 0.5·P(tie)`. A calibrated matchup/era tie model supplies `tau`, constrained by `0 ≤ tau ≤ 2·min(m, 1-m)`. Then:

- `P(home win) = m - tau/2`;
- `P(tie) = tau`; and
- `P(away win) = 1 - m - tau/2`.

This preserves the anchored expected W/L/T credit and total probability; it does not carve a tie band silently out of win probability. A versioned discrete joint score model samples integer scores conditional on the chosen class, preserving win/tie/loss and supplying PF/PA for rules that need them. If SportsCrunch exposes a different anchor semantic, Phase 0 must define and validate the normalization to `m` rather than guessing.

### NHL six terminal classes

Use a hierarchical constrained model whose terminal classes are home/away winner × REG/OT/SO:

1. Sample winner from the anchored outright win probability.
2. Conditional on winner/loser strengths and closeness, sample regulation versus extra time using calibrated logistic probabilities in `[0,1]`.
3. If extra time, sample OT versus SO using a calibrated bounded probability.
4. Sample a discrete regulation goal margin or apply the league-defined one-goal extra-time/SO standings treatment.

This produces six non-negative terminal-class probabilities summing to one and preserves the anchored outright winner probability by construction. Accumulators update points, RW, ROW, wins, GF/GA, and differential from the final discrete class/score under the pinned rule artifact. Calibration reports class-level reliability, not merely outright-win accuracy.

### Shared rounding/update rule

Each league model owns a versioned deterministic transformation from sampled latent values to discrete outcome class and integer score/margin. It declares tie handling, overtime reconciliation, minimum/maximum/clamping behavior, and standings-stat updates. Property tests ensure rounding cannot flip the previously selected outcome class and that applying a result produces the same accumulator fields in PHP fixtures and TypeScript.

## 8. Standings, qualification, and seeding

Played games build one local baseline through the TypeScript evaluator; simulated results extend it. The evaluator loads the exact artifact in the bundle, not a package-local league/year ladder. At end of regular season it returns ordered standings, qualification paths, and seeds. It also emits primitive reach/fallback counters.

The snapshot assembler compares the played-game baseline to authoritative SportsCrunch PHP output before the engine run can publish (doc 03). The simulation engine itself remains pure and does not decide whether a mismatch is publishable.

## 9. Playoff simulation

Simulation begins from `PostseasonState`. Known games/series remain fixed; only unresolved games/nodes are sampled. Hypothetical matchup pricing uses pinned ratings plus the world's accumulated deltas, declared venue/neutral flags, and bracket configuration. Series advance game by game and preserve the joint world.

Bracket formats, series patterns, reseeding, qualification-to-node mapping, and home-site rules are versioned PlayoffOdds inputs and reverified preseason. Reusing regular-season HFA is an initial calibrated simplification, not an eternal invariant. MLB hypothetical pitcher effects and other unavailable player context are documented model limitations and evaluated through calibration.

## 10. Browser execution and picker conditioning

The browser receives a derived immutable payload from the same retained bundle, including:

- stable team/game mappings and complete remaining-game start/neutral/anchor data;
- ratings and dynamic state/parameters;
- serialized locally rebuilt standings baseline;
- bracket configuration and `PostseasonState`;
- the exact pinned rule artifact/schema/checksum; and
- engine-build/binary compatibility requirements.

It does not receive merely “remaining games.” The worker rejects incompatibility and requests a fresh payload. Progressive 2k→5k refinement and direct conditioned server fallback are product contracts in features/12; performance targets require representative mobile benchmarks.

## 11. Calibration and historical evaluation

For every league/model version:

- Fit only from training data available under the declared experiment design.
- Evaluate on held-out seasons/cutoffs with proper scoring rules, calibration, class frequencies, and central/tail interval coverage.
- Separate walk-forward artifacts from retrospective reconstruction and frozen-modern-model studies (D34).
- Report input coverage, correction/anomaly policy, sample sizes, and confidence intervals.
- Compare dynamic versus frozen-delta variants and the prior production model before promotion.
- Version and retain all parameter bytes/checksums in each bundle.

“Historical replay” means rules/standings reproduction; “forecast backtest” means predictive evaluation. They are not interchangeable.

## 12. Performance targets and rollback

Initial targets are: NFL 100k under 10 s, MLB under 60 s, NBA/NHL under 30 s on representative production hardware; client 2k first result under 200 ms and worker memory under 50 MB on a representative mid-range mobile profile. These are hypotheses until Phase 0/1 prototypes establish measured p50/p95, hardware, bundle, and browser conditions.

CI tracks representative benchmarks and flags material regressions, but production gates use measured target hardware. Safe degradation options are reduced simulation count with visible uncertainty metadata, disabling dynamic updates, and server-only picker refinement. None may bypass rules parity, bundle retention, or publication validation.

## 13. Acceptance tests

- Canonical bundle validation plus offline exact-envelope replay.
- PHP/TypeScript shared primitive/procedure/golden differential suite (doc 04).
- Postseason-in-progress fixtures for each league: no completed game is resimulated; state advances correctly.
- Probability-simplex, anchor-preservation, score-rounding, accumulator, and impossible-state properties.
- Centered-delta and induced-drift measurement; proper-score/calibration/coverage reports.
- Actual start/overlap fixtures proving overlapping games cannot inform one another and later non-overlapping games can.
- Seed/stream extension: first 2k of a 5k run match the standalone 2k run within the exact replay envelope.
- Build/rules/payload incompatibility fails closed.
- Representative server/mobile benchmarks with recorded environments.

Phase 1 cannot exit on runtime alone: MLB must pass end-to-end pinned bundle, parity, replay, calibration, postseason-state, and aggregate-invariant gates; NFL follows with its W/L/T and dependency-heavy standings fixtures.
