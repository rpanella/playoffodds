# 90 — Build Order, Dependencies, and Phase Gates

**Status: DRAFT v2 (2026-07-22).** Dates are targets for solo + agent-assisted development. Gate evidence, not calendar pressure, authorizes progression (D39). The September NFL launch remains a target only if Phase 4 passes.

## Phase 0 — Contracts, upstream foundation, and risk prototypes

**Depends on:** confirmed SportsCrunch boundary D30; no application scaffold.

**Deliverables**

- Freeze canonical terminology, local ERD/DTO boundaries, `SnapshotBundle` canonicalization/retention/replay contract, `PostseasonState`, binary plane semantics, publication pointer and correction policy (docs 01–04/06).
- SportsCrunch: canonical rules JSON Schema/canonicalization, current MLB/NFL rule artifacts + citations + shared fixtures, immutable selection, PHP evaluator, and exact-`as_of` standings endpoints with `official`/`if_season_ended` modes. Ratings/parameters and required teams/games/end-type/exception fields become contract-tested versioned APIs.
- PlayoffOdds: TypeScript generic rule evaluator prototype; shared primitive/procedure/golden differential harness; consumer-driven SportsCrunch contract tests.
- Assemble one retained canonical MLB bundle, rebuild local baseline, compare PHP/TypeScript, simulate a representative batch, persist a prototype result, and replay offline under the recorded runtime envelope.
- Prototype corrected outcome math (NFL W/L/T, NHL constrained classes, overlap batching, integer scores) and benchmark representative 100k server and 2k/5k mobile workloads. Record results; do not promote planning estimates to guarantees.
- Research/select proof-safe method candidates and dependency-graph representation for Phase 5E; no early product flags required.
- Verify current supported framework/package versions and O1. Proposed default: Laravel 13 + Inertia 3 + Vue 3 + TypeScript. Verify SSR/no-JS approach, Node supervision/deploy coupling, and rollback before scaffolding.
- Threat model, privacy/retention draft, data/license/team-mark inventory, accessibility test plan, deployment topology, backup/restore design, capacity/cost model, and proposed O4/O7 targets.
- Verify the exact small API/MCP discovery/fetch contract and current vendor/package requirements; record separate OAI-SearchBot/GPTBot O2 choice for later launch configuration.

**Exit gates**

1. Zero material PHP/TypeScript differences across every shared MLB/NFL current primitive/procedure fixture and agreed golden/edge corpus; invalid checksum/schema/selection tests fail closed.
2. The MLB prototype bundle includes all required bytes/lineage, replays with no network, and reproduces declared binary/aggregate checksums within the exact replay envelope.
3. Failure injection proves parity mismatch, bad rule checksum, missing required input, and upstream outage cannot advance a publication pointer prototype.
4. Benchmarks report p50/p95 runtime, memory, artifact bytes/compression/decode and mobile conditions; any missed target has an accepted degradation/optimization plan.
5. O1 is decided; security-supported versions and SSR/no-JS topology are documented. Phase 1 scaffolding does not begin with a placeholder framework choice.
6. Cross-cutting Phase 0 artifacts exist and any material legal/upstream blocker is named `BLOCKED`, not deferred invisibly.

**Failure/rollback:** No public current pointer exists. Failed candidates/fixtures are quarantined; the affected league does not advance. PlayoffOdds may continue contract/prototype work while SportsCrunch gaps are repaired, but cannot claim trustworthy simulation.

**Deliberately deferred:** production UI, production scheduling, broad historical backfill, exact clinch product, push, lottery, full public API/MCP/key ecosystem.

## Phase 1 — Narrow vertical proof: MLB first, then NFL

**Depends on:** Phase 0 gates; current MLB and NFL rule/contracts available before each league starts.

### 1A — MLB vertical

- Minimal selected web/worker repository scaffold plus pure TypeScript engine.
- Local league/team/season/season-team/game materialization.
- Exact bundle assembly from SportsCrunch, local standings/qualification/seeding, anchored/dynamic simulation, postseason-state fixture, aggregate + versioned matrix persistence, parity and offline replay.
- Minimal operator inspection only: candidate lineage, baseline diff, aggregate table and artifact/replay report. It is not a public product UI.
- Calibration/evaluation report on agreed held-out cutoffs, clearly labeled captured/reconstructed/frozen-modern as applicable.

**1A exit:** at least 20 representative live/reconstructed cutoffs including late-race/edge fixtures publish through the local proof pipeline with zero material parity/input/invariant failures; repeated exact-envelope replay succeeds; no untriaged material anomaly; representative 100k run meets the accepted Phase 0 target or approved safe-degradation envelope; postseason-in-progress fixture resumes rather than restarts.

### 1B — NFL vertical

- Add NFL schedule/outcome/bracket modules without changing core interfaces or duplicating rules.
- Validate probability-preserving W/L/T and integer score accumulators; exercise SOV/SOS and deep multi-team dependency fixtures.
- Run against the latest completed NFL season and representative current preseason inputs.

**1B exit:** zero material differential mismatch on the NFL corpus; categorical probabilities/rounding/accumulators pass properties; official final standings/seeds match curated fixtures across the agreed supported era set; runtime/replay/invariant gates pass on representative production hardware.

**Failure/rollback:** A failed league remains disabled and cannot contaminate the other. Dynamic evolution can roll back to versioned `eta=0` if proper-score/calibration gates fail; rules parity, exact bundle retention and input validation cannot be bypassed.

**Deliberately deferred:** unattended operations, public pages, proof-safe clinch/magic, NBA/NHL, picker/leverage, draft and notifications.

## Phase 2 — Production data spine and atomic publication

**Depends on:** Phase 1A; Phase 1B before NFL production activation; doc 02/06 contracts.

**Deliverables**

- Production `podds` schema for all local identities/schedule/events/snapshot games/standings/odds/artifacts/pointers plus immutable correction lineage.
- Scheduler and signed-event ingestion; fresh-pull reconciliation; spine/intraday classification; idempotent candidate orchestration; bounded retries/backoff, dead-letter/quarantine and operator replay.
- Permanent canonical bundles/source/rule lineage; versioned matrices/client payloads; artifact checksums and retention/pruning audit.
- Validation/parity/simulation/persist gates followed by atomic compare-and-swap publication pointer; current site/service reads last-good local data only.
- Data-quality/anomaly/correction workflow; stale/degraded status; no partial publication.
- Observability, alert/runbooks, queue isolation, capacity/cost tracking, backups and isolated restore + offline replay.
- Current MLB daily spine plus debounced intraday operation; add NFL when 1B passes. Backfill only dates whose reconstruction coverage passes D34 labeling/gates.

**Exit gates**

1. Two continuous weeks of unattended MLB operation with every expected spine accounted for, ≥99% within the proposed 30-minute window when upstream prerequisites are available, zero duplicate current publications, zero material parity publications, and all failures reconciled/audited. Final thresholds follow O7.
2. Upstream outage, parity failure, worker crash, duplicate webhook, malformed input, artifact-write failure and post-write/pre-pointer crash tests leave the prior pointer/current pages intact.
3. DB/artifact restore in isolation meets the proposed O4 envelope, serves a last-good snapshot and completes offline replay.
4. Tonight/history/notification-candidate queries use only local materialization and meet representative query budgets.
5. A late correction creates a new linked snapshot revision and visible event; the old immutable snapshot remains addressable.

**Failure/rollback:** Keep/restore the prior verified pointer via audited update, pause the affected league pipeline, serve honest stale timestamp/banner, and quarantine the candidate. Never fetch upstream in a render to hide pipeline failure.

**Deliberately deferred:** exact clinch/magic flags, broad UI, API keys/downloads, push delivery, advanced conditionals.

## Phase 3 — Core public experience plus small agent/API slice

**Depends on:** Phase 2 soak; O1-selected stack; accessibility/privacy/security foundations.

**Deliverables**

- League standings/odds table, team page, seed matrix, and one basic odds-over-time chart using spine points; mobile-first semantic components.
- Visible `as_of`, current/spine/reconstruction/correction semantics and exact snapshot/rules/model lineage links.
- Methodology/model card with calibration/coverage/limitations, rule verification evidence and retrospective-history disclosures.
- Useful SSR/no-JavaScript HTML for current tables/pages; supervised SSR Node process if retained; accessible table/chart alternative, keyboard/focus/reduced-motion/contrast behavior.
- Stable canonical routes, error/stale/unavailable states, caching keyed by snapshot/pointer version.
- **Small anonymous read API:** discovery/leagues/teams, current odds/standings, seed distribution, snapshot fetch and basic spine series using stable v1 DTOs.
- **Basic MCP slice:** discovery/search and fetch of the same canonical resources, including structured content and a non-empty canonical URL. Exact supported search/fetch behavior follows the verified Phase 0 contract.

**Exit gates**

1. Critical pages pass automated and manual keyboard/no-JS/screen-reader sampling toward WCAG 2.2 AA; odds/timestamps/table relationships remain useful without hydration.
2. No SportsCrunch/simulation call occurs in request/render tests; last-good/stale and missing-data behavior is correct.
3. Representative mobile/web performance and SSR restart/health/rollback gates pass; deploy manifests reject mixed engine/SSR/client compatibility.
4. API DTO/error/validation/ETag/rate-limit/version contract tests pass; MCP search/fetch returns canonical non-empty URLs and structured text suitable for citation.
5. MLB is fully inspectable on staging and NFL current/preseason data is ready only if its Phase 1/2 gates passed.

**Failure/rollback:** Roll back the coupled app/SSR/assets release; immutable snapshots/pointer remain. Disable a failing API/MCP route behind a controlled feature flag while core pages continue; do not change DTO semantics silently.

**Deliberately deferred:** multiple chart types/polish, picker, leverage/rooting, proof-safe clinch, push, keys/bulk downloads and full MCP listings.

## Phase 4 — Beta, soft launch, and public-launch gate

**Depends on:** Phase 3; Phase 2 continues meeting freshness/replay gates; launch leagues individually qualified.

**Deliverables**

- Private beta then rate-limited public soft launch for MLB/NFL; feedback/correction channel and status communication.
- Production-shaped load/capacity/cost test including slate burst, crawlers, anonymous API/MCP and one process/worker loss.
- Independent/focused security review; legal/license/marks/terms/privacy/attribution approvals; O2 crawler matrix implemented distinctly for discovery versus training.
- Alert/runbook/on-call review; backup restore, bad deploy, bad snapshot/pointer and SSR/worker restart drills; measured rollback time.
- Search/canonical/sitemap registrations and WAF/CDN bot behavior verified, not assumed. Model card/citation guidance live.
- Launch success/error-budget baseline and O7 sign-off.

**Exit gates**

1. No unresolved critical/high security, material legal/license/mark, WCAG-critical-task, parity/replay or data-quality blocker.
2. Load test meets approved availability/latency/queue/headroom/cost limits; overload degrades through bounded 429/queue/stale-read behavior without starving publication.
3. Full restore and deploy/pointer rollback drills meet O4 targets; alerts fire and link to correct runbooks.
4. Beta shows correct freshness/correction/citation behavior for an agreed observation window; anonymous API/MCP abuse controls and cache isolation pass.
5. Owner signs the launch checklist. “Fix in week one” is not an exit criterion.

**Failure/rollback:** Remain private/soft-launched or roll back app/pointer to last verified state. Disable the affected league/feature with explicit unavailable/stale messaging. Calendar target slips rather than waiving a hard gate.

**Deliberately deferred:** advanced features below; public launch needs only the small API/MCP slice, not the full developer platform.

## Phase 5A — Interactive picker

**Depends on:** retained compatible client payloads/matrices, direct conditioned simulation capacity, accessible worker UI.

**Deliverables:** stable URL pins; canonical scenario seed; immediate 2k then additive 5k client refinement; conditional-matrix estimate only when pin-count/ESS gate passes; direct conditioned server fallback; uncertainty/ESS diagnostics; stale/corrected game handling; full `PostseasonState`/rules/build compatibility.

**Exit:** representative mid-range mobile p95 target, worker memory/payload budgets or accepted degradation; identical shared scenarios use identical seed/state; low-ESS never masquerades as precision; accessibility/security/load tests pass.

**Failure/rollback:** client-only or server-refinement feature flag can disable independently; fall back to static current odds with honest unavailable state.

**Deferred:** NHL loser-point UI and bulk/full-season pin UX until measured.

## Phase 5B — Leverage and rooting

**Depends on:** conditionals with branch counts/uncertainty, local game state, picker links for joint scenarios.

**Deliverables:** tonight slate, team rooting page, local game badges and event annotations; conditional MC language; direct conditioned scenario for multi-game paths.

**Exit:** branch sample/ESS suppression works; intraday reranking uses current local pointer; uncertainty and non-additivity are tested/disclosed; load/notification-candidate isolation passes.

**Failure/rollback:** suppress low-quality rows/page while odds remain available. No re-simulation occurs in request rendering.

**Deferred:** in-game interpolation until a contract-tested local live-win-probability feed exists.

## Phase 5C — NBA onboarding

**Depends on:** canonical NBA rules/artifacts/fixtures and as-of standings; calibrated score model; play-in `PostseasonState`/bracket.

**Deliverables:** parity/replay/calibration/current pipeline plus core UI/API/MCP for NBA.

**Exit:** same league gates as Phase 1/2, including deep rule/play-in/postseason fixtures and representative runtime/capacity.

**Failure/rollback:** NBA remains disabled; no generic core or other league is forked.

**Deferred:** NBA lottery until Phase 6 rule validation.

## Phase 5D — NHL onboarding

**Depends on:** REG/OT/SO upstream data, canonical NHL artifacts/fixtures, constrained six-terminal-class model, postseason state/bracket.

**Deliverables:** parity/replay/class calibration/current pipeline plus core UI/API/MCP for NHL.

**Exit:** class probabilities sum/preserve anchor, outcome/end-type coverage is complete, points/RW/ROW/GF/GA parity fixtures pass, runtime/capacity and postseason resume gates pass.

**Failure/rollback:** NHL remains disabled or explicitly unsupported for affected eras; never infer end types.

**Deferred:** regulation-loss picker option until 5A extension passes.

## Phase 5E — Proof-safe clinch, elimination, control, and magic

**Depends on:** rule dependency metadata, validated evaluator, Phase 0 research, curated official announcement/history fixtures.

**Deliverables:** versioned dependency graph; proven DP/SAT/MILP/branch-and-bound or other selected exact solver by league/target; witness/counterexample artifacts; tri-state proof status; per-opponent/scenario-dependent magic semantics; curated historical/edge parity.

**Exit:** solver soundness/completeness for its declared supported dependency set; independent brute-force agreement on bounded fixtures; no false positive across curated official cases; timeout/unsupported always returns `unknown/not_proven`; operational time/memory budgets and cancellation pass.

**Failure/rollback:** withhold deterministic badge/number and show probability only. A displayed 100.0% estimate is never relabeled clinched.

**Deferred:** unsupported league/era/target dependencies stay explicit, not approximated as proof.

## Phase 6 — Product and developer-platform expansion

**Depends on:** Phase 4 foundations and the applicable 5x feature/league gates.

- Hardened Web Push: iOS Home Screen/user-gesture onboarding, unsubscribe/deletion, 404/410 cleanup, caps/expiry/idempotency, stale/correction/retraction handling (features/15).
- Draft/lottery: joint season-world, without-replacement draws and validated era eligibility/team-state rules; unsupported MLB module remains blocked (features/17).
- Public API/MCP expansion: accounts-lite keys/higher limits, pagination/bulk CSV, broader history/intraday/leverage resources, complete docs/OpenAPI, registry/directory submission where worthwhile. This expands—not creates—the Phase 3/4 read surface.
- Additional charts, live approximations, model/player context and other experiments only with their own data contracts/gates.

Each expansion repeats threat/privacy/accessibility/legal/load/rollback review. Failure disables the new surface without weakening current snapshot publication or core public reads.
