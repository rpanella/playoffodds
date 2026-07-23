# Features 11 — History, Time Series, and Archive Semantics

**Status: DRAFT v2 (2026-07-22).** Phase 3 ships one basic spine chart and archive semantics; deeper visualization is incremental.

## 1. Time-series contract

The default chart axis contains one resolved **spine** snapshot per league-day. Intraday snapshots are available through explicit snapshot/API access and current movement features but do not create irregular default chart points.

Each point carries:

- immutable snapshot ID/revision, exact `as_of`, publish time and spine key;
- probability/metric value and simulation/method lineage;
- rules/model/parameter/build IDs;
- captured walk-forward, retrospective reconstruction or frozen-modern-model classification;
- coverage/degraded/correction warning; and
- links to local `snapshot_events` for result/schedule/model/correction annotations.

When multiple revisions exist for a spine key, the normal chart resolves to the latest non-retracted published revision and exposes its correction relationship. Immutable snapshot fetch retains the earlier revision; history is corrected by linked publication, not mutation.

## 2. Basic Phase 3 chart

- Fixed 0–100% probability axis and league-date/week axis.
- One selected team/metric with an optional small comparison set after accessibility/performance gates.
- Visible exact value/readout for keyboard, pointer and touch; no hover-only information.
- Adjacent semantic data table/download containing date, value and warnings.
- Result annotations join local game/change events between spine cutoffs. “Line/model movement” appears only when lineage proves input movement without a result; otherwise use neutral “model/input update.”
- Clinch/elimination milestone appears only from official/proven status with source, never from sampling 0/1.

Additional metrics, overlays, chart-image sharing and multi-season polish follow after the basic component meets no-JS/accessibility/mobile budgets.

## 3. Date, season, current, and immutable access

- `current` resolves the atomic league-season pointer, which may reference an intraday snapshot.
- `?date=YYYY-MM-DD` on normal archive pages resolves to the latest valid spine at or before the requested league-local date. UI/API return both requested and resolved date/`as_of`.
- An immutable snapshot identifier resolves exactly that revision and never follows current or later corrections.
- `season` selects the local season; season-team identity/alignment comes from that season, not today's team metadata.
- Out-of-range, missing, retracted and materially degraded dates return explicit typed behavior. They do not silently substitute present values.

Canonical/current/archive URL policy follows doc 05. Share state includes season/date/team/metric/compare set without leaking internal mutable indexes.

## 4. Historical honesty

Three labels are mandatory (D34):

1. **Captured walk-forward:** required inputs and build were retained when the cutoff was current.
2. **Retrospective reconstruction:** assembled later; SportsCrunch historical odds and status can reflect schedule, corrected source data, model code or configuration available at reconstruction time.
3. **Frozen-modern-model evaluation:** intentionally evaluates history under one newer fixed model; it is an analysis series, not “what the odds were.”

Every historical point records input coverage, missing/substituted data, anomalies/corrections and exact model/rules versions. The product never says “nothing was unknowable.” A true status-history or calibration claim requires evidence that the corresponding cutoff inputs were captured.

Methodology text explains whether calibration parameters are era-appropriate/walk-forward or modern/frozen. It does not compare scores from mixed experiment designs as if equivalent.

If a postponed/suspended/finality state cannot be reconstructed materially, exclude the point or show degraded/unknown according to doc 02 policy; do not infer precise cutoff state from today's final schedule row.

## 5. Movement and annotations

- 1-day/7-day movements compare named spine snapshots; current intraday movement states its spine/current comparison explicitly.
- Always show the endpoints (“62.0% → 34.0%”) plus delta and exact cutoffs.
- A late correction uses a correction/retraction annotation, not ordinary team-performance framing.
- `game_change_events` and `snapshot_events` supply local schedule/result/correction data; no historical page calls SportsCrunch.
- Multiple causes may be listed. If attribution cannot be separated, say “model/input update” rather than invent a causal result/line story.

## 6. Backfill gates and scope

Launch target remains current + prior season only where bundle/parity/replay/coverage gates pass (D18). Depth is bounded by trustworthy reconstructability, not API availability alone.

A backfilled point must have a permanent canonical bundle, selected era rule artifact, authoritative/local parity outcome, model/parameter lineage, reconstruction classification and coverage report. A failed material cutoff stays absent/degraded. Backfill outcome matrices may be pruned under doc 02, but bundle/aggregates/history remain.

## 7. API and caching

The small v1 API exposes basic spine series by stable team/metric/season with cursor or bounded range, decimal units and immutable snapshot references. It does not expose database rows 1:1. Current aliases use short revalidation; immutable series/revisions use ETag/content checksum and long caching.

Series pagination/order, requested/resolved date, empty coverage, correction and unsupported metric errors are specified in features/16. MCP fetch returns the same semantics and canonical URL.

## 8. Acceptance

- No intraday point leaks into the default spine series.
- Requested/resolved/corrected/retracted fixtures behave identically across HTML/API/MCP.
- Captured/reconstructed/frozen-modern labels are present and tested; methodology links name input/model/rule versions and limitations.
- Chart and data table pass keyboard/touch/no-JS/reduced-motion/contrast checks and show warnings without color-only encoding.
- Backfill with unknown material status fails or degrades visibly; source correction creates a new revision/annotation.
- Queries read local covered indexes/materialization within the Phase 3 performance budget.
