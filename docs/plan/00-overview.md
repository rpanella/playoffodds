# 00 — PlayoffOdds Master Plan

**Status: DRAFT v2 (2026-07-22) — internally consolidated for owner review.** Individual documents retain their own status; this overview does not imply blanket approval.

PlayoffOdds is a cross-sport playoff probability product for NFL, MLB, NBA, and NHL. It combines reproducible Monte Carlo forecasts, locally evaluated official era rules, historical lineage, interactive scenarios, and agent-readable public surfaces. The goal is not merely to display a percentage; it is to make every published number traceable to an immutable cutoff, rule artifact, model build, and input bundle.

Use [99-decisions-open-questions.md](99-decisions-open-questions.md) for authoritative decisions/status language and the one canonical open-decision list. A downstream contradiction is resolved through a new superseding decision, not by silently rewriting history.

## 1. Product vision and honest differentiators

- Core odds: qualification/playoffs, division/path, seed, record/points distribution, round advancement and championship.
- The wedge: pick future results and receive a fast conditional forecast, with stable share links and direct conditioned simulation when a precomputed sample is too thin.
- Rules credibility: official, immutable era definitions authored once in SportsCrunch and evaluated locally by parity-tested PHP/TypeScript generic interpreters.
- Historical utility: captured walk-forward points where available and clearly labeled retrospective reconstruction elsewhere, always with exact rules/model/input lineage.
- Daily hooks: game leverage, rooting guides, correction-aware movement and, later, safe clinch proof and push notifications.
- Agent/search differentiation: useful server-rendered/no-JS pages, a small anonymous stable read API and MCP search/fetch surface by launch, then a larger developer platform later.
- Mobile/accessibility: WCAG 2.2 AA, keyboard/touch/responsive data views and resilient HTML are architecture requirements, not launch polish.

Claims remain measurable. Monte Carlo 100% is not proof, reconstruction is not captured history, compression/runtime figures are benchmark targets, and unsupported league procedures yield degraded/unknown—not invented answers.

The competitive feature catalog remains [playoff-projections-feature-and-technical-reference.md](../../playoff-projections-feature-and-technical-reference.md); this plan supersedes its generic implementation suggestions where PlayoffOdds-specific decisions differ.

## 2. Architecture and system boundary

```text
SportsCrunch existing APIs + required Phase 0 rules/standings APIs
        │ exact cutoff inputs, immutable rule, authoritative PHP standings
        ▼
PlayoffOdds assembler → schema/checksum validation → TS baseline rebuild/parity
        │                                      failure: quarantine, keep last good
        ▼
permanent canonical SnapshotBundle → local TS simulation/aggregation
        ▼
immutable DB/artifacts → atomic publication pointer
        ▼
SSR/no-JS site · anonymous API · MCP · browser worker payload · notifications
```

Normal requests and browser workers never call SportsCrunch. They read local materialization and immutable published artifacts. All candidate data is invisible until the pointer advances atomically; any validation/parity/persistence failure leaves current on the last good snapshot.

### SportsCrunch confirmed boundary (D30)

SportsCrunch is the system of record for immutable, era-versioned standings/qualification/seeding rules and authoritative arbitrary-`as_of` standings. It owns canonical cited docs, JSON Schema, fixtures, selection/exceptions, PHP interpreter, and conceptual versioned endpoints for standings and rule artifacts. It already has versioned teams/games/historical-odds/webhook strengths, but the rule registry and standings endpoints are **required Phase 0 work, not existing functionality**.

PlayoffOdds pins the exact artifact into every bundle, rebuilds the baseline with a generic TypeScript evaluator, and blocks publication on material PHP/TypeScript disagreement. It owns simulation, local accumulators, postseason/bracket modeling, proof-search algorithms, draft/lottery initially, materialization/cache and permanent exact bundle retention. See [03-sportscrunch-integration.md](03-sportscrunch-integration.md) and [04-standings-tiebreakers.md](04-standings-tiebreakers.md).

## 3. Immutable snapshot product contract

A snapshot is an immutable league-season output at exact `as_of`, not merely a database row or random seed. Its permanently retained compressed canonical `SnapshotBundle` contains every normalized input, `PostseasonState`, exact rule payload, authoritative comparison response, model/parameter/build IDs and checksums, seed/count, binary format, runtime replay metadata, source artifacts/lineage and coverage/correction warnings.

Daily **spine** snapshots form the chart axis. **Intraday** snapshots can be current and power tonight/alerts but do not introduce irregular default chart points. `official` and `if_season_ended` standings are explicit distinct modes. All terminology and the complete local ERD—teams, seasons, alignments, games, snapshot games/standings, events/corrections, odds, artifacts and publication pointers—live in [02-simulation-outputs.md](02-simulation-outputs.md).

Postseason snapshots resume from known matchups, completed games/series, current scores, advanced/eliminated teams and remaining bracket state. Published snapshots never change when SportsCrunch later corrects a source or rule; corrections create linked revisions.

## 4. Simulation and mathematical boundaries

The TypeScript engine is pure and shared by Node and browser workers. Anchored probabilities plus calibrated dynamic rating evolution remain the model direction, but centered latent increments do not guarantee unchanged mean probabilities through a sigmoid. Phase 0/1 measures induced drift and requires held-out Brier/log loss, calibration and interval-coverage evidence against a frozen baseline.

Games use actual start/overlap information batches, not dates. NFL uses a declared probability-preserving W/L/T construction and discrete joint scores; NHL uses a constrained six-terminal-class hierarchy (home/away winner × REG/OT/SO) that preserves outright win probability; all rounding/accumulator updates are versioned and fixture-tested. Performance counts/times are targets until representative server/mobile prototypes pass.

The browser payload includes ratings/state, complete remaining game timing/neutral flags, standings baseline, bracket configuration, `PostseasonState`, exact rule artifact and engine compatibility—not only a schedule. See [01-simulation-engine.md](01-simulation-engine.md).

## 5. Proof, conditioning, draft, and historical limitations

- Matrix filtering estimates conditional probabilities; it is not exact. It is used only with adequate branch count/ESS. Low-sample scenarios run a direct conditioned server simulation with a stable seed derived from snapshot + ordered pins.
- Clinch/elimination/control/magic guarantees use a later proof-safe deterministic subsystem with explicit rule dependency graphs. Timeouts/unsupported dependencies return `unknown/not_proven`. Exact flags are Phase 5E, not Phase 2.
- Magic numbers can be per-opponent or scenario-dependent; the product does not force every league race into one scalar.
- Draft/lottery draws are sampled jointly without replacement in the same simulated season world under validated era eligibility/team-state rules. Known-incomplete MLB restrictions block the module rather than ship behind a footnote.
- Historical output labels captured walk-forward versus retrospective reconstruction versus frozen-modern-model evaluation. SportsCrunch's historical-odds endpoint can depend on current schedule/model/configuration semantics; coverage, anomalies, versions and late corrections are visible.

## 6. Product surfaces and data sources

| Surface | Local source/contract | Phase |
|---|---|---|
| League/team/seed/current standings | `publication_pointers`, `snapshot_team_standings`, `team_odds`, local teams/games | 3 |
| Basic history chart/archive | spine `snapshots` + `team_odds` + `snapshot_events` | 3 |
| Methodology/model/rules lineage | snapshot diagnostics, retained rule/model/replay artifacts | 3 |
| Anonymous API + MCP search/fetch | stable DTOs over the same current/snapshot/spine resources | 3/4 launch gate |
| Picker | complete client payload + matrix with ESS gate + direct conditioned server simulation | 5A |
| Leverage/rooting/tonight | local games + `game_conditionals` uncertainty + current pointer | 5B |
| NBA/NHL | same contracts after league-specific rule/data/model gates | 5C/5D |
| Clinch/elimination/magic | `proof_results` from dependency-aware proof subsystem | 5E |
| Notifications | local snapshots/events/conditionals + privacy-minimized push subscriptions | 6 |
| Draft/lottery | joint sim finish worlds + validated PlayoffOdds era rules/team state | 6 |
| API/MCP/download expansion | versioned DTOs/keys/pagination/bulk over published local outputs | 6 |

No feature is authorized without an explicit local source and failure/unknown state.

## 7. Web framework and operations

The **PROPOSED** greenfield default is Laravel 13 + Inertia 3 + Vue 3 + TypeScript, subject to current support/package/SSR verification and owner decision O1 in Phase 0. React is an intentional alternative only for a concrete owner-confirmed reason; it is not a silent implementation-agent preference.

Useful odds/tables/navigation must render without JavaScript. If Inertia SSR provides that, its Node process is a first-class supervised deployment unit with coupled build manifests, health/readiness, restarts/backoff, logs/metrics, graceful rollback and no-JS integration tests. Node simulation workers are separately supervised and isolated from request latency. Full requirements are in [06-cross-cutting-requirements.md](06-cross-cutting-requirements.md).

## 8. Cross-cutting release contract

Every phase applies security/abuse limits, privacy/deletion/retention, WCAG 2.2 AA, legal/licensing/marks, analytics/metrics, observability/alerts, backup/restore/DR, process supervision, capacity/cost, data-quality/correction and API/model upgrade policies from doc 06.

Important launch gates include: threat/load/security review; owner-approved crawler discovery-vs-training matrix; exact output license/attribution compatibility; team-mark status; restore/replay and rollback drills; accessible no-JS critical paths; alert/runbooks; and measured headroom/cost. Unresolved numeric/policy choices live only as O1–O7 in doc 99.

## 9. Phase summary

1. **Phase 0:** contracts, SportsCrunch rule registry/as-of standings, PHP/TS parity, canonical bundle/replay/binary/math prototypes, local ERD, framework/version choice, and cross-cutting decisions.
2. **Phase 1:** narrow MLB end-to-end vertical proof, then NFL; retained bundle → local materialization → simulate/persist/aggregate → parity/replay/minimal inspection with quantitative gates.
3. **Phase 2:** production data spine, retries/dead-letter, atomic pointer, lineage/corrections, backup/restore, quality/observability and two-week soak. No proof-safe clinch requirement.
4. **Phase 3:** core SSR/no-JS accessible public experience, one basic chart, methodology/model card and small anonymous API/MCP slice.
5. **Phase 4:** private beta/soft launch, then public launch only after load/security/legal/accessibility/rollback/observability gates.
6. **Phases 5A–5E:** picker; leverage/rooting; NBA; NHL; proof-safe clinch/elimination/magic.
7. **Phase 6:** hardened push, joint draft/lottery and larger API/MCP/download platform.

Detailed dependencies, quantitative exits, rollback behavior and deferrals: [90-build-order.md](90-build-order.md).

## 10. Document map and status

| Document | Purpose | Status |
|---|---|---|
| 00 (this file) | Master architecture/product contract and map | DRAFT v2 |
| [01-simulation-engine.md](01-simulation-engine.md) | Pure engine, bundle inputs, math, postseason state, replay, performance gates | DRAFT v2 |
| [02-simulation-outputs.md](02-simulation-outputs.md) | Canonical vocabulary, local ERD, artifacts, atomic publication, retention/replay | DRAFT v2 |
| [03-sportscrunch-integration.md](03-sportscrunch-integration.md) | SportsCrunch ownership/endpoints/handshake/failure contract | DRAFT v2; confirmed boundary, upstream work pending |
| [04-standings-tiebreakers.md](04-standings-tiebreakers.md) | Shared schema/interpreter/procedure/conformance architecture | DRAFT v3 |
| [05-agent-and-search-discovery.md](05-agent-and-search-discovery.md) | Discovery, crawler policy, API/MCP citation behavior | DRAFT v2 |
| [06-cross-cutting-requirements.md](06-cross-cutting-requirements.md) | Security, privacy, accessibility, legal, operations, quality and upgrades | DRAFT v1 |
| [features/10-core-odds-displays.md](features/10-core-odds-displays.md) | Core tables/team/seed/methodology UX | DRAFT v2 |
| [features/11-history-timeseries.md](features/11-history-timeseries.md) | History, charts, archive and reconstruction labeling | DRAFT v2 |
| [features/12-interactive-picker.md](features/12-interactive-picker.md) | Hybrid conditioning, stable scenarios, client/server diagnostics | DRAFT v2 |
| [features/13-leverage-rooting.md](features/13-leverage-rooting.md) | Conditional estimates, tonight and rooting | DRAFT v2 |
| [features/14-clinch-magic-elimination.md](features/14-clinch-magic-elimination.md) | Proof-safe deterministic status contract | DRAFT v2 |
| [features/15-notifications-mobile.md](features/15-notifications-mobile.md) | PWA/mobile and hardened push lifecycle | DRAFT v2 |
| [features/16-public-api.md](features/16-public-api.md) | Stable anonymous API/MCP DTO and expansion | DRAFT v2 |
| [features/17-draft-order.md](features/17-draft-order.md) | Joint era-valid draft/lottery modeling | DRAFT v2 |
| [90-build-order.md](90-build-order.md) | Dependency- and evidence-gated implementation phases | DRAFT v2 |
| [99-decisions-open-questions.md](99-decisions-open-questions.md) | Append-only decisions and canonical O1–O7 | LIVE |
| [playoff-projections-feature-and-technical-reference.md](../../playoff-projections-feature-and-technical-reference.md) | Competitive/reference catalog; generic advice subordinate to this plan | REFERENCE, amended 2026-07-22 |
