# 04 — Rules, Standings, Qualification, and Seeding Architecture

**Status: DRAFT v3 (2026-07-22) — confirmed ownership model D30; schema and artifacts are Phase 0 deliverables.**

This document specifies how immutable SportsCrunch rules are selected, transported, interpreted, compared, and used locally. It does not duplicate league procedures; canonical ladders, citations, and era boundaries live in SportsCrunch artifacts.

## 1. Scope

The initial shared rule registry covers:

- standings record/points calculation;
- ordering and tiebreak procedures, including multi-team restart/reduction behavior;
- qualification paths; and
- seed assignment.

Playoff bracket formats, playoff probability models, postseason exact-search algorithms, and draft/lottery rules remain PlayoffOdds-owned initially. Expansion requires a versioned schema/contract decision, shared fixtures, and a compatibility plan.

The rules layer supports two distinct evaluations:

- **Simulation evaluation:** apply a complete simulated world, resolve qualification/seeding under the pinned artifact, and return compact results. It is performance-sensitive and can use a rules-authorized seeded terminal draw only where the league procedure calls for one or the simulation contract explicitly permits a disclosed fallback.
- **Authoritative/display evaluation:** apply actual results through exact `as_of`, preserve unresolved ties, and return ordered/shared positions plus an explanation trace and warnings. It never invents or randomly breaks an unresolved in-season display tie.

Proof-safe clinch/elimination search consumes the same evaluator but is a separate Phase 5E subsystem (D33 and features/14).

## 2. Ownership and single source of truth

SportsCrunch owns the canonical JSON Schema, immutable artifacts, citations/docs, fixtures, selection/exceptions, PHP interpreter, and authoritative standings service. PlayoffOdds owns one generic TypeScript interpreter and local accumulators. Rule definitions are not copied into TypeScript source or a PlayoffOdds-owned registry.

“Authored once, interpreted twice” replaces the earlier “standings logic written once” wording:

1. An era rule is authored as one canonical artifact in SportsCrunch.
2. PHP and TypeScript execute the same primitive/procedure graph.
3. Shared fixtures and differential tests prevent interpreter drift.
4. Snapshot publication pins the payload and blocks on material output disagreement.

## 3. Immutable rule artifact contract

Every artifact contains or references immutable, checksum-bound values for:

| Area | Required fields/semantics |
|---|---|
| Identity | Stable `ruleset_id`, league, semantic artifact version, creation time, payload checksum. |
| Applicability | Season/era range and explicit exception selectors; ambiguous or overlapping selection is invalid. |
| Schema | Schema ID/version/checksum, canonicalization algorithm, minimum compatible interpreter capability/version. |
| Standings | Primary record/points calculation and every accumulator field it requires. |
| Procedures | Ordered primitives, parameters, grouping, multi-team split/restart/reduction behavior, qualification paths, and seed assignment. |
| Resolution | Rules-authorized terminal behavior, unresolved policy by mode, and whether non-standard season behavior applies. |
| Proof metadata | Declared outcome dependencies for each primitive: direct game, opponent record, defeated-opponent record, score/margin, cross-group eligibility, postseason result, or other named dependency. |
| Provenance | Human-readable document ID/URL, official citations/retrieval dates, adjacent-version change note. |
| Verification | Fixture-set ID/checksum and manifest of primitives/procedures/edge cases exercised. |

A conceptual family is `rules/nfl/standings-2002-v1.json`, `.md`, and `fixtures.json`; filenames are illustrative. APIs resolve selection to a concrete immutable artifact. A correction creates `…-v2` with a new checksum and change note.

## 4. Generic interpreter contract

Both interpreters implement the same observable operations:

- Create an accumulator state from season teams, schedule metadata, and the pinned artifact.
- Apply one normalized final game result using explicit league outcome/rounding rules.
- Produce standings in `official` or `if_season_ended` mode.
- Produce qualification paths and seeds when meaningful.
- Emit a structured explanation trace in non-hot paths.
- Expose dependency metadata used by proof-safe search.
- Reject unknown primitives, unsupported schema/capability versions, invalid procedure graphs, and incomplete required inputs.

Interpreter behavior is generic. Adding a new era normally adds an artifact and fixtures, not league/year branches. A genuinely new primitive changes the schema/interpreter capability version and requires compatibility tests before selection can return it.

## 5. Primitive and procedure families

The schema must be expressive enough for the currently supported official procedures without embedding executable code. Expected primitive families include:

- direct and pooled head-to-head records/points, sweep tests, odd-game exclusions;
- division/conference/league/common-opponent records;
- strength of victory/schedule and record-vs-eligible-set dependencies;
- regulation/extra-time wins, points percentage, goal/run/point differential and totals;
- ordered schedule-window/backward-walk comparisons;
- division-winner precedence, group reduction, quarantine, and seed-path precedence; and
- rules-authorized draw/coin procedure.

Expected procedural controls include two-team versus multi-team ladders, partial split, subgroup recursion, restart at a declared step, one-team-advances/repool, original-order preservation, and cross-ladder application. Each artifact declares needed accumulators and dependencies so unused state is not maintained.

This list is a schema design input, not the rule definition for any league or era.

## 6. Accumulator and normalized result contract

The local baseline is built only from normalized snapshot inputs. Per-artifact accumulator requirements may include:

- W/L/T or W/L/OTL, points, regulation/extra-time wins;
- division/conference/league splits;
- pairwise head-to-head state;
- opponent/result graphs for SOV/SOS-like dependencies;
- scored/allowed totals and league-defined differential treatment;
- ordered game histories for schedule-window procedures; and
- static membership, schedule, common-opponent, eligibility, and exception maps.

Schedule-derived state is precomputed once per snapshot. Played results establish the immutable baseline once; each simulation world extends a copy/incremental representation. Raw games are not reparsed inside every world.

`GameResult` normalization is explicit and fixture-tested: actual start/finality, participating season-team IDs, discrete scores, W/L/T/outcome class, regulation/OT/SO end type when relevant, neutral/site metadata, and correction lineage. Missing a required field is a validation error, not a guessed default.

## 7. Modes and unresolved ties

`official` and `if_season_ended` are explicit inputs, never inferred from the route.

- `official`: reproduce the league-recognized table/status at exact `as_of`. During the season, tied clubs may share an unresolved display position.
- `if_season_ended`: apply the selected final qualification/seeding procedures to games completed by `as_of`. It may assign seeds when the official live table does not; it may still return unresolved when required inputs/procedures cannot determine a unique order.
- Simulation: evaluate a complete hypothetical state. A seeded random terminal is allowed only when declared by the artifact or by a separately disclosed simulation-only fallback. Reach counts for fallbacks are retained; an unexpected reach rate fails validation.

Public displays carry mode and unresolved/degraded warnings. No output calls a random or unsupported resolution “official.”

## 8. Rule selection and exceptional seasons

Selection is SportsCrunch-owned and deterministic over league, season, and explicit modeled exceptions. The selection response explains which selector matched. Requirements:

- exactly one artifact matches; zero or multiple matches are errors;
- non-standard seasons are explicit artifacts/overlays or explicitly unsupported, never silently excluded from verification while still served;
- backfill pins the artifact selected for that historical season, not today's artifact;
- a later correction selects a new immutable version only for newly assembled snapshots; and
- PlayoffOdds archives the selected response and payload, not merely an ID.

## 9. PHP/TypeScript conformance

Required layers:

1. **Schema tests:** valid/invalid artifact corpus, canonical byte/checksum parity, capability negotiation.
2. **Primitive fixtures:** every primitive, parameter variant, pass/split/resolve outcome, and numeric normalization edge.
3. **Procedure fixtures:** multi-team restart/reduction/recursion, unresolved modes, qualification paths, seed assignment, and explicitly modeled exceptions.
4. **Golden seasons:** curated official final standings/brackets across supported eras, including non-standard cases when the product serves them.
5. **Differential tests:** PHP and TypeScript receive identical artifact/input bytes and must agree on all material fields.
6. **Snapshot baseline test:** authoritative SportsCrunch response and PlayoffOdds rebuilt baseline agree before publication.

Material parity is exact for IDs, ruleset/schema/checksums, records, qualification paths, seeds, resolved/unresolved grouping, and discrete stats. Any numeric tolerance is field-specific and documented. Trace text may differ; trace step IDs and decisions should agree where emitted.

Every primitive/procedure used by an artifact must be named in its fixture coverage manifest. “Golden seasons pass” alone is insufficient because real seasons rarely reach deep rules.

## 10. Proof dependency graph

Each rule step declares all future outcomes/statistics capable of changing it. The Phase 5E proof subsystem composes these declarations into a dependency graph before choosing DP, SAT, MILP, branch-and-bound, or another proven method.

For example, an opponent-record dependency can make games between two third parties relevant; record-bound pruning that ignores that edge is unsound. Score/margin and multi-valued NHL outcome dependencies are likewise explicit. If the graph includes an unsupported dependency, the proof API returns `unknown/not_proven` and cites it.

The rules evaluator supplies facts and deterministic evaluation; it does not itself claim that a bounded search proved a universal statement.

## 11. Performance and observability

Targets—not promises until benchmarked—include average end-of-world standings/seed evaluation below 50 μs for an NFL representative bundle and acceptable total league budgets in doc 01. Benchmarks run on target server hardware and representative mobile browser workers.

Record per snapshot/batch: evaluator/schema/ruleset IDs, evaluation counts/duration, primitive reach/split/resolve counts, fallback/unresolved counts, parity outcome, and unsupported dependency counts. Published transparency may summarize these without exposing internal or licensed source data.

## 12. Phase 0 deliverables and exit gate

- Canonical schema/canonicalization and compatibility policy.
- Current MLB and NFL cited artifacts plus shared fixture manifests.
- SportsCrunch selection and standings endpoints in both modes.
- PHP and TypeScript generic evaluators passing the full shared/differential suite.
- At least one golden season and curated deep-step/edge fixtures per MLB and NFL before its Phase 1 proof; the larger historical corpus grows before historical claims.
- Failure tests for unknown primitive, bad checksum, ambiguous selection, incomplete result, unresolved tie, and material interpreter disagreement.
- Documented process for preseason source review and immutable corrections.

Phase 0 is blocked if material parity is not zero-diff or if a current-season artifact lacks source/fixture coverage. NBA/NHL artifacts may follow in their gated onboarding phases, but their schema needs must be represented in the Phase 0 design corpus so the first schema is not MLB/NFL-only by accident.
