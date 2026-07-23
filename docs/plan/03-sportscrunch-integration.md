# 03 — SportsCrunch Integration Contract

**Status: DRAFT v2 (2026-07-22) — implementation-ready contract; confirmed ownership boundary D30, endpoint delivery pending Phase 0.**

This document defines the system boundary, data lineage, publication handshake, and failure behavior between SportsCrunch and PlayoffOdds. It is a contract, not a claim that every endpoint already exists.

## 1. Boundary and invariants

### SportsCrunch owns

- Canonical immutable, era-versioned rule definitions for standings record/points calculation, ordering, tiebreak procedures, qualification paths, and seed assignment.
- Human-readable rule documentation and citations, the canonical JSON Schema, and shared conformance fixtures.
- Rule selection by league, season, and explicitly modeled exception; rulesets never mutate. A correction produces a new ID/version/checksum.
- The PHP generic rules interpreter and authoritative standings service for an arbitrary supported `as_of` instant.
- Versioned teams, games, historical-odds, ratings/parameters, standings, and rule-artifact API contracts, plus signed event delivery.

### PlayoffOdds owns

- The TypeScript simulation engine and generic TypeScript evaluator for the canonical rule schema.
- Local standings accumulators, simulated-result application, qualification/seeding, bracket/playoff simulation, and deterministic future-outcome proof searches.
- Local materialization/cache, immutable snapshot publication, and permanent retention of exact input bundles and lineage.
- Playoff bracket formats, playoff probability models, exact clinch-search algorithms, and draft/lottery rules initially. Moving one into the shared registry requires an explicit contract/version change.

### Hard invariants

1. Rule definitions are authored once in SportsCrunch and interpreted by two small parity-tested generic evaluators; league/year ladders are never duplicated in PlayoffOdds code.
2. A published PlayoffOdds snapshot pins the exact rule payload and checksum. Later upstream correction never changes it.
3. No SportsCrunch call occurs in a simulation hot loop, browser worker, or normal HTTP request/rendering path. Public reads use local published data only.
4. Publication fails closed on schema/checksum failure, missing required input, or material authoritative-PHP versus local-TypeScript disagreement. The last good snapshot remains current.
5. A rule artifact is content-addressable and immutable. Endpoint caching must not turn mutable aliases into snapshot lineage.

## 2. Verified current reality and Phase 0 gaps

SportsCrunch currently provides versioned season/team/game and historical-odds APIs plus signed webhook plumbing. Its historical-odds reconstruction can depend on the schedule, model code, and configuration available when reconstruction runs; it is not proof that every byte was captured at the historical cutoff. These are integration assumptions to verify with contract tests, not source-code guarantees owned by this plan.

The following are **required upstream Phase 0 work and do not exist yet**:

- Canonical rule registry, JSON Schema, cited documents, fixtures, immutable selection/versioning.
- PHP rule interpreter plus authoritative `as_of` standings service with explicit modes.
- Ratings/parameters at exact `as_of` (D20).
- Any missing fields required by a supported league, including reliable season-team alignment, neutral-site/start/status/result data, NHL final end type, and MLB rule-selection exceptions such as an All-Star-break anchor when the ruleset needs one.

Existing strengths to preserve: `/api/v1` versioning, authenticated service access, signed events, request IDs/deduplication, bounded retries, and conservative rate limiting. Endpoint and payload assumptions must be frozen in consumer-driven contract tests before Phase 1.

Existing conceptual surface to verify and retain:

| Existing endpoint/surface | PlayoffOdds use | Phase 0 verification focus |
|---|---|---|
| `GET /api/v1/seasons?league=…` | season discovery | stable IDs/status and cache semantics |
| `GET /api/v1/seasons/{season}/teams` | team identity and season alignment | conference/division/group fields and historical alignment |
| `GET /api/v1/seasons/{season}/games` | schedule, local game state and final results | exact starts, neutral/site, season type, corrections, scores/end type |
| `GET /api/v1/seasons/{season}/historical-odds?at=…` | remaining-game anchors at cutoff | reconstruction semantics, coverage/warnings and real/projected provenance |
| Versioned signed webhook APIs | enqueue intraday reconciliation | signature bytes/timestamp, request ID, replay/sync and retry behavior |

These rows describe current integration reality, not permission to depend on undocumented fields. Ratings, rules and standings below are additive required contracts.

## 3. Required versioned endpoints

Exact resource names may change during Phase 0; these semantics may not.

### 3.1 Authoritative standings

`GET /api/v1/seasons/{season}/standings?at={ISO8601}&mode={official|if_season_ended}&trace={0|1}`

Response contract:

- Identifiers: league, season ID/year, requested `at`, exact normalized `as_of`, and mode.
- Ordered standings by the grouping relevant to the league, with stable team IDs.
- Qualification status and assigned seeds where meaningful for the chosen mode.
- Records, points, and all splits/derived values actually consumed by a tiebreak procedure; do not return only display totals.
- Selected `ruleset_id`, rule version, schema ID/version, rule payload checksum, and fixture-set checksum.
- Optional structured rule trace when requested.
- Structured `warnings[]` for unresolved display ties, incomplete data, unsupported historical coverage, or degraded inputs.
- Source/reconstruction lineage sufficient to compare and archive the response.

`official` means the table/qualification status the league recognizes at that instant. `if_season_ended` applies final qualification/seeding procedures to games completed by `as_of`. Those can legitimately differ during a season. Neither mode invents or randomly breaks an unresolved in-season display tie: it returns shared/unresolved ordering and a warning unless an official deterministic procedure applies.

### 3.2 Selected rules and immutable artifacts

- `GET /api/v1/seasons/{season}/standings-rules` returns the immutable artifact selected for that season plus the explicit selector/exceptions that caused the choice.
- `GET /api/v1/standings-rules/{ruleset_id}` returns an immutable artifact by stable ID.

Artifact contract:

- `ruleset_id`, league, effective/applicable range, explicit exception selectors, version, and creation timestamp.
- Canonical rule payload conforming to a named JSON Schema; canonicalization algorithm and payload SHA-256.
- Human document identifier/URL, source citations and retrieval dates.
- Fixture manifest plus checksums; fixtures cover every primitive/procedure used by the artifact.
- Compatibility/minimum-interpreter version and declared capabilities/dependencies.
- No mutable “latest” artifact may be archived as lineage; selection resolves to a concrete immutable ID/checksum.

Conceptual artifact family: `rules/nfl/standings-2002-v1.json` with matching `.md` and `fixtures.json`. Storage layout is not the API contract.

### 3.3 Games, teams, odds, ratings, and events

PlayoffOdds consumes contract-tested versions of:

- Season discovery and season-team identity/alignment (conference/division membership is season-scoped).
- Full schedule/results with stable game IDs, actual start instant, neutral-site flag, season type, status/finality, scores, and league-required end type.
- Historical anchors at exact cutoff with real/projected provenance and reconstruction warnings.
- Raw ratings plus league parameters at exact cutoff, model identifier/version, and coverage warnings. PlayoffOdds derives matchup probabilities.
- Signed game events. Verify signature, deduplicate by request ID, persist receipt/cursor, and use events only to enqueue refresh; a fresh pull remains authoritative.

Current APIs must be treated as mutable external inputs until their normalized response bytes are captured in a `SnapshotBundle`.

## 4. Snapshot assembly and publication handshake

For every spine, intraday, backfill, or ad hoc candidate:

1. Fetch the selected immutable rule artifact and validate its ID, schema, canonicalization, and checksum.
2. Fetch authoritative SportsCrunch standings for the exact cutoff and required mode (normally both modes when they differ for product surfaces).
3. Fetch games, season-team alignment, anchors, ratings/parameters, and every other required input at the same cutoff semantics.
4. Normalize inputs and rebuild the played-game baseline locally with the TypeScript evaluator and pinned artifact.
5. Compare authoritative PHP output and TypeScript output. Block publication on material disagreement; permitted presentational differences must be explicitly allowlisted and tested.
6. Store the exact rule payload/checksum inside the compressed immutable `SnapshotBundle` alongside upstream standings responses, normalized inputs, raw-response artifact checksums/locations, and lineage.
7. Run simulation/aggregation, validate outputs, write all immutable rows/artifacts, then atomically advance the stable publication pointer in one transaction/compare-and-swap operation.
8. Ship that exact artifact to Node/browser only where required and only with an engine-build compatibility declaration.

All simulation, proof evaluation, and browser evaluation is local and pinned. Rebuilding a snapshot later uses retained bytes, not fresh SportsCrunch calls.

### Material parity

Material agreement includes ordered/resolved positions, qualification paths, seeds, records/points/splits used by the rules, selected rule ID/schema/checksum, and unresolved status. Numeric normalization tolerances are declared per field; there is no blanket fuzzy comparison. A trace mismatch with identical outputs is warning-level until trace equivalence becomes a contract gate. Any output mismatch that can alter qualification or seed is publication-blocking.

## 5. Rules conformance program

The two-interpreter design is intentional: PHP belongs in SportsCrunch; TypeScript is required by PlayoffOdds Node workers and browser use. A Node sidecar, default microservice, Rust, or WASM is not the baseline; it can be reconsidered only after measured complexity or performance warrants it.

Required automated suites:

- JSON Schema and canonical-checksum validation for every artifact.
- Shared fixtures for every primitive and procedural behavior.
- Golden official historical seasons and curated edge cases across era boundaries.
- Differential PHP-versus-TypeScript evaluation of the same artifact, fixture, and input state.
- Consumer-driven HTTP contract tests for selection, standings modes, exact `as_of`, warnings, errors, caching, and immutability.
- Preseason source review: a change produces a new artifact/version/checksum, never an edit in place.

## 6. Failure and degradation contract

| Condition | Required behavior |
|---|---|
| Upstream unavailable/timeout/rate-limited | Bounded retry with jitter; candidate fails; last published pointer remains; alert with request ID. |
| Required input missing or cutoff semantics disagree | Quarantine candidate; do not substitute current values silently. |
| Rule schema/checksum/selection invalid | Block publication and browser payload creation; P1 alert. |
| PHP/TypeScript material mismatch | Quarantine full bundle and diff/trace for diagnosis; P1 alert; no pointer change. |
| Optional anchor missing | Use a ratings-derived fallback only if league policy allows it; label per-game source, quantify affected share, and fail above a Phase 0-set threshold. |
| Unresolved in-season tie | Preserve shared/unresolved status and warning; never randomize a public official table. Simulation-only random terminal behavior must be rules-authorized and seeded. |
| Late correction | Ingest as a new candidate with correction/event lineage; publish a new snapshot only after all gates. Never rewrite prior snapshots. |
| Webhook gap/duplicate | Deduplicate by request ID; scheduled spine is the reconciliation path; replay/sync re-baselines locally. |

Service authentication uses a least-privilege PlayoffOdds token stored as a secret, never in bundles/logs. Logs may contain route templates, status, timing, request ID and content checksum, but not bearer tokens or unnecessary payloads.

## 7. Historical semantics

Backfill assembly must record whether each upstream response came from data captured at the cutoff or from retrospective reconstruction. Present schedule state, source corrections, model code, and configuration can change a reconstruction. PlayoffOdds therefore labels the resulting product according to D34 and archives coverage/anomaly/correction metadata. A response for `at=D` is not by itself evidence of true walk-forward state at D.

When a historical status/reschedule/correction cannot be reconstructed safely, the assembler records `unknown` and either excludes that point or fails the candidate according to materiality. It never infers a precise historical state from today's final row without lineage.

## 8. Phase 0 acceptance gate

Phase 1 cannot claim trustworthy standings simulation until:

1. The canonical schema, current MLB and NFL artifacts/docs/fixtures, selection rules, and immutability behavior exist upstream.
2. Both standings modes and exact-cutoff behavior pass consumer contract tests.
3. PHP/TypeScript differential tests pass all shared fixtures and at least the agreed golden/edge corpus with zero material mismatches.
4. One MLB candidate bundle completes the full handshake, is replayed without network access, and produces the same normalized baseline and aggregate checksums under the pinned build/runtime contract.
5. Failure injection proves invalid checksum, parity mismatch, missing required input, and upstream outage cannot advance the publication pointer.

NHL onboarding additionally gates on reliable REG/OT/SO final-state data. Historical era coverage gates only the corresponding backfill range, not current-season MLB/NFL work.
