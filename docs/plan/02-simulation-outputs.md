# 02 — Local Data Model, Snapshot Store, Publication, and Replay

**Status: DRAFT v2 (2026-07-22) — contract/ERD level; physical indexes and encodings are Phase 1/2 benchmark outputs.**

PlayoffOdds serves every normal page/API response from local materialized data. SportsCrunch is an assembly-time upstream, never a request-time dependency (D40). Immutable snapshots and an atomic publication pointer separate computation from serving.

## 1. Canonical terminology

These terms are binding across the plan (D42):

| Term | Meaning |
|---|---|
| `as_of` | Exact inclusive cutoff instant represented by inputs/results. It is not fetch time or publish time. |
| snapshot | One immutable, versioned output and lineage set for a league-season at exact `as_of`. A correction creates another snapshot/revision. |
| current | The snapshot referenced by the stable publication pointer for a league-season/surface. It changes atomically. |
| spine | The one scheduled snapshot per league-day eligible for the canonical chart/history axis. |
| intraday | Event-driven immutable snapshot between spine points; used for current/tonight/alerts, not the default daily chart axis. |
| official | SportsCrunch/league-recognized standings status at exact `as_of`; unresolved live ties remain unresolved. |
| `if_season_ended` | Standings/qualification/seeding obtained by applying final procedures to games complete at `as_of`. It may differ from `official`. |
| retrospective reconstruction | Historical output assembled later from reconstructed inputs; not represented as originally published at the cutoff. |
| captured walk-forward | Artifact assembled and retained when the cutoff was current, using then-captured inputs/builds. |

Fetch, assembly, simulation, and publish timestamps are separate fields. Public DTOs expose `as_of`, publish time, snapshot ID/revision, class, standings mode, reconstruction classification, and lineage IDs as applicable.

## 2. Local domain materialization

The following logical entities are required. JSON fields may hold versioned league-specific extensions, but stable identifiers, relationships, and fields used for filtering/serving are first-class columns.

### 2.1 Identity and schedule spine

| Entity | Required contract |
|---|---|
| `leagues` | Stable code/ID, display metadata, timezone/snapshot policy reference, active flag. No hard-coded league count. |
| `teams` | Local ID, stable SportsCrunch/provider ID, slug/name/abbreviation, active dates, display/mark asset reference and licensing status. Team identity is not season alignment. |
| `seasons` | Local/provider IDs, league, year/label, start/end/status, timezone, upstream revision/checksum, selected current rule reference for diagnostics. |
| `season_teams` | Stable local ID joining season/team; conference/division/group IDs and names, alignment effective metadata, upstream checksum. Games and standings reference this row to preserve relocations/realignments. |
| `games` | Local/provider stable ID, season, home/away `season_team`, scheduled/actual start, season type, neutral/site, local current status, final scores, end type, upstream revision/checksum, observed/corrected timestamps. This is the local current game state for tonight/notifications. |
| `game_change_events` | Immutable event/change ID, game, upstream request/source ID, observed/effective time, event kind, previous/new normalized state checksums, changed-field summary, correction/retraction link, and annotation text/code. Powers history annotations and stale-event suppression. |

Every SportsCrunch refresh upserts materialized current entities transactionally and appends a change event when normalized material state changes. Webhooks enqueue/annotate work; a fresh pull determines state. Duplicate request IDs and identical content checksums are idempotent.

### 2.2 Snapshot and publication entities

| Entity | Required contract |
|---|---|
| `snapshots` | Immutable ID, league/season, exact `as_of`, class, revision, reconstruction class, candidate status, idempotency key, bundle/result/payload checksums and paths, rules/schema/model/parameters/build IDs, seed/count, binary version, runtime envelope, warnings, parity result, correction/supersession links, assembled/simulated/published timestamps. |
| `publication_pointers` | Stable key such as `(league, season, surface='current')`, referenced snapshot ID, monotonic pointer version, updated time. A single atomic update publishes all snapshot data. |
| `snapshot_games` | One normalized row per game input/result in the snapshot: state as of cutoff, start/site/neutral, status, discrete result/end type, anchor value and declared semantics/source, projected/fallback flag, input checksum and lineage reference. Immutable. |
| `snapshot_team_standings` | Snapshot, season-team, mode (`official`/`if_season_ended`), grouping/rank/shared-rank, qualification path, seed where meaningful, records/points/splits used by rules, resolved flag/warnings, authoritative/local values or parity checksum, ruleset/checksum. |
| `snapshot_events` | Snapshot-to-change-event/annotation links with classification (result, line/model movement, schedule change, correction, clinch status) and display-safe summary. |
| `snapshot_artifacts` | Typed artifact records (bundle, source response, rule payload, matrix, client payload, replay report) with content checksum, format/compression, size, retention class, storage location, verification state. |

A database row never substitutes for the retained bundle bytes. Tables support serving/querying; artifacts support exact replay/audit.

### 2.3 Product outputs

| Entity | Required contract |
|---|---|
| `team_odds` | Snapshot/team probabilities for playoff/qualification path/division/seed/round/championship; record/points distributions; rating/SOS; deltas; explicit proof statuses (`proven`, `not_proven`, `unknown`, `not_applicable`) separate from probabilities. |
| `game_conditionals` | Snapshot/game/affected-team conditional Monte Carlo estimates by outcome class, sample count/ESS, standard error/interval, swing/ranking metrics, method/version. |
| `simulation_diagnostics` | Batch-level runtime, calibration/model version, primitive reach/fallback, invalid/unsupported counts, aggregate invariants, and uncertainty. |
| `proof_results` | Later Phase 5E immutable target/team/status/method/dependency-graph/result/witness-or-counterexample/budget/timeout metadata. Not required for Phase 2 publication. |

Seed and round arrays may be JSON or child rows after query benchmarks; public DTOs remain stable either way. The public API is not a 1:1 export of these tables.

### 2.4 Notification/local serving support

`push_subscriptions`, preferences, delivery attempts, and notification candidates are specified in features/15 and doc 06. They reference local team/game/snapshot/event IDs only. The notification evaluator and tonight pages use `games`, `game_change_events`, `publication_pointers`, `team_odds`, and `game_conditionals`; they do not fetch SportsCrunch.

## 3. Canonical immutable `SnapshotBundle`

Every successfully assembled candidate permanently retains one compressed canonical bundle after validation; every published snapshot must have one. The bundle contains exact normalized bytes for all engine inputs and comparison evidence:

- bundle schema/canonicalization/compression version and identity;
- teams, season-team alignment, all relevant games/results/anchors and exact cutoff semantics;
- ratings/team state and every model/league parameter byte;
- bracket configuration and full `PostseasonState`;
- exact canonical rule payload, schema, selection response, IDs and checksums;
- authoritative SportsCrunch standings responses for required modes;
- normalized source lineage, response/artifact checksums, coverage, warnings, anomalies and corrections;
- engine source/build ID, dependency/build-lock checksum, parameters/model checksums;
- simulation seed/count/stream range, binary serialization version, and deterministic runtime metadata.

Canonicalization defines field order, numeric representation, timestamp normalization, string encoding, null/absent semantics, array ordering, and hash algorithm. Compression is outside the canonical hash: checksum the canonical uncompressed bytes and also checksum the stored compressed artifact.

Source response bytes required to audit normalization are retained as permanent referenced artifacts or embedded in the bundle. Secrets/authorization headers are removed before canonicalization and never retained.

## 4. Retention and immutability

| Data | Policy |
|---|---|
| Published bundle, rule payload, lineage, snapshot metadata, aggregate outputs, publication/correction history | Permanent for the supported life of the product; backed up and restore-tested. |
| Validated but failed/quarantined bundle | Retain at least through incident resolution and the operational audit window; checksum/schema/parity failures used as fixtures are promoted to permanent test artifacts. Exact duration is an ops policy, not silently pruned. |
| Client payload for published snapshot | Permanent while its immutable URL/API snapshot remains supported. |
| Raw outcome/finish matrix | All current-season snapshots plus 30 days after season completion per D17; then eligible for verified pruning. A backfill matrix may be pruned after aggregates/replay verification. |
| Mutable materialized current rows | Retain current state plus immutable change/correction events; snapshots preserve historical state. |
| Privacy/security/delivery logs | Minimized and time-bounded under doc 06/O5; never inherit permanent model-artifact retention. |

Pruning a matrix requires verified bundle availability, artifact checksum, replay compatibility metadata, aggregate checksum, and an auditable prune record. It never deletes the bundle or changes snapshot metadata. Compression/storage estimates are capacity hypotheses measured in Phase 0/2, not guarantees.

## 5. Versioned binary matrices

The format is engine-owned, columnar/bit-plane, endian- and bit-order-specified, and self-describing. It contains magic, format version, snapshot/bundle/build checksums, counts, stable game/team index maps, plane descriptors (semantic ID, width, offset, length, checksum), and optional-stat capability flags.

### Outcome planes

- MLB/NBA decisive winner: 1 bit per simulation-game.
- NFL W/L/T: 2 bits per simulation-game with one invalid/reserved code.
- NHL six terminal classes (home/away winner × REG/OT/SO): 3 bits per simulation-game with two reserved codes.
- Postseason planes use the league's required width and include only unresolved games/nodes represented by the format manifest.

### Finish planes

The earlier “one byte per team finish” claim is withdrawn. A minimum illustrative base layout is:

| Field | Width | Semantics |
|---|---:|---|
| seed/path slot | 4 bits | `0` missed/not applicable; version defines league mapping. |
| round reached | 3 bits | Versioned stage index. |
| champion | 1 bit | Explicit flag, even if derivable. |
| bottom/final rank | 6 bits | Supports up to 64 teams; version declares sentinel. |

That base is **14 bits per simulation-team** before padding/index/header, or about 5.6 MB for 100k × 32 teams. Optional record/points/path planes add documented widths. Example raw full-schedule outcome upper bounds are roughly 6.8 MB for 272 NFL games at 2 bits, 30.4 MB for 2,430 MLB games at 1 bit, and 49.2 MB for 1,312 NHL games at 3 bits, before headers/optional planes. Actual remaining-game sizes shrink through the season.

These are byte-accounting examples, not storage promises. Phase 0/2 benchmarks record raw, compressed, transfer, decode, and filter sizes/times on representative bundles. Gzip/zstd ratios are hypotheses; no acceptance gate assumes “roughly halves.”

Readers reject unknown versions/planes unless the header declares a safe skippable extension. Stored semantics never change in place.

## 6. Aggregates and uncertainty

`team_odds` stores probabilities as decimal fractions in `[0,1]` with simulation count and method lineage. Seed/path/round values must satisfy versioned sum/monotonic invariants within a documented numerical tolerance. Proof status is never inferred from an aggregate equal to 0 or 1.

`game_conditionals` is a conditional Monte Carlo estimate. Each branch records raw/weighted sample count, ESS when weighting/stratification applies, standard error or interval, and suppression reason. Small-effect and low-ESS rows may be withheld from the public DTO but diagnostics remain local.

Movement deltas reference explicit prior snapshots: 1-day/7-day normally compare spine-to-spine; intraday movement identifies its comparison anchor. A correction may produce a correction delta/event rather than pretending ordinary model movement.

## 7. Atomic candidate lifecycle

Candidate states are `assembling → validated → simulating → persisted → publishable → published`, with terminal `failed` or `quarantined`. Transitions are idempotent and append operational events.

Publication transaction/gate:

1. Bundle/source/rule checksums and schema are valid; required exact-cutoff inputs are complete.
2. Authoritative PHP versus local TypeScript baseline has no material disagreement.
3. Simulation completed under declared build/runtime/options; aggregate/binary invariants pass.
4. Immutable snapshot rows and required artifacts are durably written and checksum-verified.
5. Cache/index jobs needed for coherent serving are ready or version-keyed to the new snapshot.
6. Atomically compare-and-swap `publication_pointers.snapshot_id` and increment pointer version.

Failure before step 6 leaves the old pointer untouched. Failure after the pointer transaction triggers rollback to the previous verified pointer only through an audited pointer update; immutable bad artifacts remain for diagnosis and may receive a retraction/correction event.

An idempotency key includes league, season, class, exact `as_of`, normalized input checksum, engine build, rule checksum, and parameter checksum. The same event/input cannot create duplicate snapshots. A corrected input at the same cutoff creates a new revision linked to the superseded snapshot.

## 8. Spine, intraday, and historical selection

- One configured league-day spine instant produces at most one published canonical revision. Corrections remain linked revisions; chart resolution chooses the latest non-retracted published revision for that spine key.
- Intraday snapshots can become `current` but do not enter the default chart series. The next spine supersedes their current role, not their immutability.
- `?date=` resolves to the latest valid spine at or before the requested league-local date and returns requested/resolved values explicitly.
- Historical API access identifies spine versus intraday; it never conflates “latest snapshot before time” with the daily spine.
- A stable snapshot ID fetch always returns that immutable revision; `current` may advance.

## 9. Backfill and historical limitations

Backfill uses the same handshake and retained bundle as live assembly. It classifies each input as cutoff-captured, reconstructed, substituted, missing, or corrected and records coverage/anomalies. Present schedule/model/config semantics in SportsCrunch can affect retrospective reconstruction. Therefore:

- publish it as **retrospective reconstruction** unless every required input was captured at the cutoff;
- distinguish evaluation using era-appropriate historical model parameters from a frozen modern model applied to history;
- exclude or visibly degrade points with material unknown state rather than silently using today's final data;
- preserve rule/model/input versions per point; and
- communicate late source corrections as new revisions, never history rewrites.

Launch depth remains current plus previous season where coverage/gates pass (D18), not a promise that every date is reconstructable.

## 10. Replay verification and correction policy

Replay is offline: load retained bytes, verify checksums, run the recorded compatible build/runtime/options, compare binary/aggregate checksums under the engine's declared envelope, and write a `replay_report` artifact.

Minimum cadence/gates:

- every newly published snapshot gets bundle/artifact checksum verification and a small deterministic smoke replay before or immediately after pointer advance;
- the latest snapshot plus a rotating historical sample receive scheduled full replay;
- every engine/rules/binary/runtime upgrade replays the golden corpus and a representative retained snapshot set before promotion; and
- quarterly restore exercises replay at least one snapshot from backup without network access.

A replay failure alerts and quarantines the implicated build/artifact from new publication. Existing immutable output is not silently edited. If product-visible data is wrong, publish a corrected snapshot/retraction annotation and make APIs/pages expose the correction link.

## 11. Serving, DTOs, and failure behavior

Laravel/request handlers read the current pointer and local tables/artifacts. Immutable responses cache by snapshot/checksum with ETags; current aliases use short cache lifetime/revalidation. No normal render performs a SportsCrunch call or simulation.

If assembly/upstream/simulation fails, current continues to serve the last good snapshot with its actual timestamp and, when freshness crosses the product threshold, a visible stale/degraded banner. Missing current data yields a typed unavailable response; it does not fall through to upstream.

Public/site/API/MCP DTOs are versioned product contracts defined in features/16, with stable IDs, decimal units, errors, and lineage. Database refactors must not leak into them.

## 12. Phase 1/2 data gates

- Migrations/ERD cover every entity above with uniqueness, FK/immutability, idempotency, and pointer constraints.
- One MLB vertical snapshot retains canonical bundle/source/rule bytes; local standings match SportsCrunch; offline replay reproduces checksums.
- Postseason-in-progress fixture materializes and resumes correctly.
- Binary writer/reader has exact byte accounting, corruption/version tests, and measured compression/decode/filter benchmarks.
- Failure injection proves parity/checksum/input failures cannot advance current.
- Tonight/history/notification candidate queries run entirely from local data.
- Backup/restore retrieves DB pointer/history plus artifacts and completes an offline replay.
- Two-week Phase 2 soak meets agreed freshness, success, duplicate, correction, and replay-error thresholds before Phase 3 depends on the pipeline.
