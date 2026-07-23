# Features 16 — Public API, MCP DTOs, and Data Downloads

**Status: DRAFT v2 (2026-07-22).** A small anonymous v1 read surface ships by Phase 3/4 (D38); keys, bulk and broad expansion remain Phase 6.

## 1. Contract boundaries

- Public DTOs are stable product contracts, not `team_odds`/database serialization.
- Every response comes from a locally published immutable snapshot or explicit current pointer; no request calls SportsCrunch or runs simulation.
- The API serves PlayoffOdds outputs and permitted metadata, not a proxy for raw SportsCrunch/sportsbook inputs.
- HTML, API and MCP share public IDs, decimal units, current/spine/intraday/mode/reconstruction/correction semantics and canonical URLs.
- MCP search/fetch wraps these DTOs with structured content and a non-empty canonical URL as specified in doc 05; a generic attribution object alone is insufficient.

Base path is conceptually `/api/public/v1`; exact routing is frozen before Phase 3.

## 2. Stable identifiers and units

- `league_id`: stable lowercase public code, data-driven rather than a compile-time count.
- `season_id`, `team_id`, `game_id`: stable public opaque/string IDs; slugs are accepted aliases where documented but responses return canonical IDs.
- `snapshot_id`: opaque immutable ID for one revision. Never derive or increment it client-side.
- Timestamps: RFC 3339 UTC instants; league-local dates are `YYYY-MM-DD` plus league/timezone metadata.
- Probabilities: decimal fractions `[0,1]`; UI-formatted percentages may appear only as supplemental text.
- Deltas: decimal probability-point differences, not relative percent change, and name their comparison snapshot.
- Rank/seed/path: integers/enums under a declared league/version; unresolved/shared rank and null/not-applicable remain distinct.

## 3. Common success envelope

Every response provides:

- `api_version` and request ID;
- `data` using named DTO schema/version;
- non-empty canonical HTTPS page `url` matching the resource;
- `snapshot` metadata when data is snapshot-derived: ID/revision, exact `as_of`, publish time, class, spine/intraday, `official`/`if_season_ended` mode, reconstruction class, rules/schema/model/parameter/build IDs, correction/retraction relationship;
- structured `warnings[]` for stale, degraded, unresolved, reconstructed or corrected output;
- attribution/terms metadata after O3, supplementary to canonical URL; and
- pagination cursor/count when applicable.

Probability and proof/official status are separate fields. A DTO with `probability: 1` cannot imply `proven`.

## 4. Snapshot selection semantics

Selection parameters are mutually exclusive and validated:

- no selector: **current** publication pointer, which may be spine or intraday;
- `snapshot_id`: exact immutable revision;
- `date=YYYY-MM-DD`: latest valid **spine** at or before the requested league-local date, returning requested and resolved date/`as_of`;
- future explicit `at=...`: only on endpoints whose contract defines latest snapshot at/before instant and requires a class filter; it is not an alias for SportsCrunch arbitrary-as-of computation.

`season_id` is explicit when not inferable. Historical index endpoints expose class so clients can distinguish spine/intraday/backfill. `official` and `if_season_ended` are explicit `mode` values; an endpoint never mixes rows from both.

Missing coverage, out-of-range date, retracted-only result and unavailable current pointer have distinct typed errors/warnings. The API never silently returns today's state for a historical selector.

## 5. Phase 3/4 anonymous slice

| Conceptual endpoint | DTO |
|---|---|
| `GET /v1/leagues` | supported league/season discovery and availability |
| `GET /v1/{league}/teams` | season-team identity/alignment/display metadata safe to redistribute |
| `GET /v1/{league}/odds` | current/exact/date-selected team probability summary |
| `GET /v1/{league}/standings?mode=` | ordered/shared standings and qualification/seed state for one mode |
| `GET /v1/{league}/seeds` | team × qualification/seed probability DTO |
| `GET /v1/snapshots/{snapshot_id}` | immutable metadata/lineage plus links to supported resources |
| `GET /v1/{league}/series` | bounded basic spine series for team(s)/metric/season |

This slice is anonymous, cache-first and read-only. It is sufficient for basic agent discovery/fetch/citation. It deliberately omits arbitrary scenario simulation, raw matrices/bundles, bulk season export and account management.

## 6. Phase 6 expansion

- Snapshot index with class/time/cursor filters; explicitly requested intraday history.
- Local tonight/leverage/rooting resources with sample/ESS/uncertainty.
- Proof resources with immutable proof ID/status/certificate summary after Phase 5E.
- Draft/lottery resources only for validated supported league/era modules.
- Accounts-lite keys for higher limits/usage visibility; key creation/revocation/deletion.
- Bulk spine CSV and possibly Parquet after demand/benchmark/legal review.
- Broader MCP tools and registry/directory submissions; v1 search/fetch remains stable.

Bulk files have a standard machine-readable schema plus a companion metadata/license/lineage document. Do not use non-standard “comment rows” that break CSV readers. Active-season files are versioned/regenerated; completed immutable versions retain checksums and correction links.

## 7. Validation, errors, and pagination

Use one structured problem/error envelope with HTTP status, stable code, human message, request ID, field errors and recovery link. Required cases include invalid league/team/season/snapshot/date/mode/metric/cursor, mutually exclusive selectors, not found, unavailable/stale, retracted, rate limited and internal dependency unavailable.

- `400/422`: syntax/semantic validation with allowed enum/range.
- `404`: canonical resource/snapshot not found or unsupported league/season.
- `409/410` as contractually selected: retracted/superseded exact resource with correction link, never an unannounced replacement.
- `429`: `Retry-After`, limit scope and key-upgrade guidance when available.
- `503`: no valid current data or controlled degraded dependency; may include last-good link if safe.

Collections use opaque stable cursors, deterministic sort and bounded `limit`; no offset guarantee. Cursor binds filters/sort/version to prevent cross-query reuse. Default/max sizes and maximum series range are load-tested.

## 8. Caching and consistency

- Immutable snapshot/date-resolved responses: strong content ETag/checksum, long public cache lifetime and `immutable` where correction semantics permit a new revision rather than byte mutation.
- Current alias: ETag includes pointer version/snapshot checksum, short max-age/revalidation and coherent canonical current URL.
- `If-None-Match` returns 304 without recomputation/upstream calls.
- Pointer advancement makes all resource DTOs coherent for one snapshot; never mix current standings from one revision and odds from another.
- Correction publishes a new revision/ETag. Exact old snapshot remains addressable with correction warning unless legally withdrawn.

## 9. Rate limits, CORS, and abuse

Public GET supports open CORS as documented. State-changing key/account routes use strict origins/CSRF/auth controls.

Limits combine per-IP/key, endpoint cost, global concurrency and egress budgets. Cache hits still receive abuse protection. **PROPOSED for O6/load test:** anonymous 30 requests/minute with bounded daily/series limits; keyed 60/minute and 20k/day. These are not promises until Phase 4/6 capacity/cost evidence and owner approval.

Errors expose no stack/raw payload/secrets. Logs use route templates/public IDs/request IDs and privacy-minimized IP handling (doc 06). API/MCP traffic cannot starve snapshot publication or conditioned simulation queues.

## 10. Versioning and deprecation

- `/v1` freezes field meaning, units, identifiers, selector behavior and error codes. Additive optional fields may appear; clients must tolerate unknown fields.
- Breaking/semantic change uses a new major path/DTO version. Old and new may run together from the same immutable store.
- Deprecation/sunset is published in docs/changelog and machine-readable headers/fields as verified; notice length remains O6 rather than an invented guarantee.
- Rules/model changes normally do not change API version because lineage IDs reveal them; a field semantic/unit change does.
- OpenAPI 3.1 (or then-current verified format), examples and compatibility tests are generated from the contract at stable URLs.

## 11. License and attribution

D26 says initial access is free with attribution; exact legal instrument remains O3. Until approved, docs say “terms pending” in non-public environments and do not assert CC BY compatibility. Team marks and raw/upstream fields are reviewed separately. Every DTO's canonical URL enables citation; attribution metadata names terms/retrieval guidance but does not replace URL-bearing MCP content.

## 12. Acceptance and rollback

**Phase 3/4 slice:**

- HTML/API/MCP fixtures agree on IDs, decimal values, mode, snapshot and warnings.
- Current/date/snapshot, spine/intraday, requested/resolved and correction cases pass contract tests.
- Validation/error/pagination/ETag/CORS/rate-limit/cache-isolation tests pass; no DB schema field leaks as an implicit guarantee.
- MCP search→fetch returns structured content and non-empty canonical URL in each targeted verified client.
- Load/abuse tests meet Phase 4 cost/headroom and never starve publication.

**Phase 6:** keys/deletion/bulk/docs/deprecation and new DTOs repeat security/privacy/legal/load/accessibility review.

Rollback can disable an additive endpoint/tool or revert the coupled release while retaining v1 core reads. It may not silently change units/selection semantics; a broken major version is withdrawn with typed status and migration guidance.
