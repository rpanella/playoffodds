# 02 — Simulation Outputs, Snapshot Store & Backfill

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.**
Proposed resolutions to Q6, Q7, Q8 (and the DB-naming open) are in §9.

Everything the engine emits, how it's persisted, and how historical backfill works. Design rule: **every feature must be servable from stored outputs without re-simulation.** Features read this store; nothing user-facing ever waits on a sim (the browser picker being the deliberate exception, and it runs on a payload this store produced).

---

## 1. The snapshot concept

A **snapshot** is one engine run over one league-season as of one instant, with full provenance. It is the unit of storage, serving, charting, and backfill.

Two snapshot classes (proposed resolution to Q6, §9):

- **Spine snapshots** — scheduled daily per active league at the league's natural instant (mirroring SportsCrunch's `snapshotInstant()`: NFL Sun 10:00 PT, daily leagues 09:00 PT). These form the **official time series**: charts, preseason-vs-now, the archive/date-selector all read spine snapshots only, so the historical axis has one point per day at a consistent time.
- **Intraday snapshots** — event-driven re-sims as results land (webhook-triggered when games go final, debounced: run when the slate has been quiet ~30 min or every game in progress is final). These feed "right now" surfaces — current odds, leverage, notifications ("your odds jumped 12% tonight") — and are superseded by the next spine snapshot. NFL Sundays naturally produce several; that's a feature (odds visibly move as games final), not noise, because the chart spine stays daily.

Anchor-only movement (lines moving with no games played) is picked up by the next spine snapshot in v1; an optional threshold-triggered refresh is a flag we can enable later without schema changes.

## 2. Storage overview

- **PlayoffOdds application MySQL DB** (its own database, new server — named `podds` to avoid any collision with the legacy `playoffodds` DB that SportsCrunch imports from): all Layer-1 aggregates + snapshot metadata. Aggregates are kept **forever** — they are the archive and the product.
- **Artifact store** (local disk `storage/app/snapshots/...` first, S3-compatible layout so relocation is a config change): Layer-2 outcome matrices + client payloads, referenced by path from the DB.

## 3. Snapshot metadata (table `snapshots`)

| Column | Notes |
|---|---|
| `id`, `league`, `season_year` | |
| `snapshot_instant` | the as-of instant (UTC) — for backfill this is a past instant |
| `class` | `spine` \| `intraday` \| `backfill` \| `adhoc` |
| `engine_version`, `rules_version`, `params_version` | full reproducibility triple (engine package semver; era rule-set id per doc 04; calibration constants version per doc 01 §10) |
| `n_sims`, `seed` | seed = stable hash of (league, season, instant) per doc 01 §11 |
| `input_hash` | hash of the assembled SnapshotBundle — detects "inputs changed" vs "inputs identical" (jitter audits) |
| `upstream_meta` JSON | which SportsCrunch calls fed it, their fetched-at times, counts of `is_projected` anchors (provenance + gap forensics) |
| `artifact_path`, `payload_path` | Layer-2 binary + client payload locations (nullable for pruned/old snapshots) |
| `backfilled` (bool), `status`, `created_at` | `status`: running/complete/failed |

## 4. Layer 1 — aggregates (MySQL)

### 4.1 `team_odds` — one row per (snapshot, team). The workhorse.

| Group | Columns |
|---|---|
| Reach | `p_playoffs`, `p_division`, `p_wildcard` (path-split), `p_bye`, `p_best_record` |
| Seeds | `p_seed` JSON array (index = seed; includes play-in distinctions for NBA) |
| Advancement | `p_round` JSON array (made playoffs → won round 1 → … → champion; monotone cascade), `p_championship` (denormalized from it for indexing/sorting) |
| Record | `wins_mean`, `wins_p10/p25/p50/p75/p90` (NHL: also `points_*`), `proj_record` display string |
| Draft | `p_bottom` JSON (P(finish with j-th worst record)) — lottery math applied downstream (features/17) |
| Context | `rating` (published, transparency), `sos_remaining` |
| Status | `clinched_playoffs/division/bye`, `eliminated_*` (from deterministic mode, doc 04 — fused displays need both in one row) |
| Movement | `d1_p_playoffs`, `d7_p_playoffs` (+ same for championship) — denormalized vs prior spine snapshots for movers/notifications feeds |

JSON arrays (vs child tables) because per-seed/per-round values are always read as a unit (heatmap rows, cascade displays) and never filtered on individually. Indexes: `(snapshot_id)`, `(league, season_year, team_id, snapshot_instant)` for time-series pulls.

### 4.2 `game_conditionals` — one row per (snapshot, near-term game, affected team)

The leverage/rooting store (features/13): for each game within the **conditional horizon** (games in the next 7 days) and each team in the league: `p_playoffs_if_home_win`, `p_playoffs_if_home_loss`, `swing` (difference), `leverage` (swing × 2p(1−p)), plus the same for `p_division` where the affected team is in either club's division. Produced by partitioning the outcome matrix once (single pass over sims covers *all* games × *all* teams simultaneously — doc 01's `partitionByGame`).

Volume check: 30 teams × ~60 games/week worst case (MLB) × ~2 tracked metrics ≈ 3.6k rows/snapshot — trivial. Rows with `|swing| < 0.1%` are dropped (noise floor at 100k sims, and nobody roots based on them).

### 4.3 Time-series reads

Charts read `team_odds` across spine snapshots directly — no separate series table. A season of daily snapshots × 32 teams ≈ 6k rows/league/season: a covered-index range scan, cacheable aggressively since historical spine rows are immutable.

## 5. Layer 2 — outcome matrices (artifact per snapshot)

Custom **versioned binary format, engine-owned reader/writer** (proposed Q7 resolution — no parquet dependency in the browser or Node for v1):

```
header: magic, format_version, snapshot_id, n_sims, game index (gameId[], chronological), team index
outcomes: per game, n_sims bits (home win) — NFL/NBA/MLB
          NHL: + 2 bits/sim end-type plane (REG/OT/SO)
finishes: per team per sim, 1 byte: seed (0 = missed) | round_reached | champion flag | bottom-rank
```

Sizes at 100k sims: NFL ≈ 3.4 MB outcomes + 3.2 MB finishes; MLB (worst, full season remaining) ≈ 30 MB + 3 MB; gzip on disk roughly halves it. Comfortable.

**What it powers, all without re-simulation:** leverage/rooting partitions (§4.2 generation), server-side high-precision picker results (filter sims matching a user's pins → recompute aggregates over survivors; falls back to client sims when survivors < ~2k), clinch screening (features/14), and any future conditional question we haven't thought of yet — which is the real reason to keep raw sims, not just aggregates.

**Margins are not stored.** They exist transiently in-sim for tiebreaks/accumulators; finishes already encode their consequences. (Revisit only if a future feature needs conditional *margin* queries.)

**Retention:** artifacts kept for the **current season + 30 days**, then pruned (aggregates + payloads keep forever). Any pruned snapshot is exactly reproducible from the provenance triple + seed (§3) if ever needed — that's what reproducibility is for.

## 6. Client payload (browser sims, features/12)

Per spine/intraday snapshot per league, a gzipped JSON artifact, immutable and CDN-cacheable (URL keyed by snapshot id):

```
teams[], params (k, eta, marginSigma, nhl), rules_version,
baseline: serialized SeasonAccumulators   ← computed server-side by the SAME engine code
remainingGames[]: { id, date, homeId, awayId, baseLogit }
seedBase
```

Shipping the **serialized accumulator baseline** instead of the full played-game list keeps the payload small (MLB full-season game list is the bulk) while preserving doc 01's single-source-of-truth principle — the baseline is produced by the same `applyResult` code the browser would have run. **Doc 01 addendum (small):** `simulateSeason` accepts `{baseline, remainingGames}` as an alternative to the full-schedule bundle; the Node worker always uses full-schedule, the browser always uses baseline. Includes the MLB ordered intraleague logs and H2H matrix the tiebreakers need (~tens of KB). Budget: **< 100 KB gzipped** per league (MLB worst case; measure in Phase 2 and trim encoding if over).

## 7. Backfill pipeline

Re-run history through the same pipeline, one spine snapshot per past league-day:

1. For date D (at the league's snapshot instant): assemble the bundle **as of D** — anchors from `historical-odds?at=D`; results = games with final status and start time < D (the assembler must *mask* later games' scores from the full-season games response — and treat postponed/suspended games as they stood on D, using `game_changes`-style status if exposed, else conservative masking by start time); ratings from the new `ratings?at=D` endpoint (doc 03); **era rule set for that season** (doc 04); calibration constants as-of that season.
2. Run the engine (same versions recorded); write `class='backfill'`, `backfilled=true`.
3. Artifacts: backfill snapshots keep **payloads but not outcome matrices** (retention rule §5 — nobody runs leverage queries against 2021; reproducible if ever wrong).

Throughput: ~200 snapshot-days per league-season × 1 `historical-odds` call each = well inside the 30/min throttle (~7 min of API time per season); engine time dominates (< 60 s/snapshot ⇒ a league-season backfills overnight on one worker). **Consequence: no bulk-export or throttle exemption needed — softens doc 03's ask #4 to "nice to have."**

Ordering: current season first (launch charts), then previous season per league, then deeper as upstream coverage allows (D9).

**Lookahead hygiene:** anything the bundle consumes must be as-of D — anchors, ratings, rules era, calibration constants. The one acceptable anachronism: current *team alignment* metadata for old seasons is wrong (relocations) — use `season_team` alignment for that season, which SportsCrunch already models per-season. Charts label backfilled ranges; methodology note published (features/11).

## 8. Serving

Laravel reads MySQL aggregates only; artifacts served as static immutable files. API resources for the site mirror these shapes 1:1 and become the public API's v1 surface later (features/16) — design resource names now as if public. No simulation in any request path.

## 9. PROPOSED resolutions (owner review requested)

| Q | Proposal | Rationale |
|---|---|---|
| Q6 (cadence) | **Daily spine + finals-triggered intraday** (§1); spine is the sole charting axis; anchor-only refresh deferred behind a flag | Consistent time series, live-feeling product, minimal machinery |
| Q7 (matrix storage) | **Custom versioned binary, engine-owned, local disk with S3-ready layout** (§5); retention: current season + 30 days, aggregates/payloads forever; pruned snapshots reproducible via provenance triple + seed | No heavy format deps; sizes are modest; reproducibility beats hoarding |
| Q8 (backfill depth) | **Launch = current + previous season per league; extend opportunistically** as upstream coverage allows (D9); per-day API assembly is fast enough that depth is a scheduling choice, not an architecture one | Overnight per league-season; throttle non-issue (§7) |
| (outline) own DB | **Yes — `podds` application DB**, distinct name from the legacy `playoffodds` DB | Avoids the naming collision permanently |

New opens surfaced: exact payload encoding if MLB exceeds the 100 KB budget (measure first); whether intraday snapshots also write `game_conditionals` (lean yes — leverage should update as the slate resolves); as-of-D status semantics for postponed games in backfill (needs doc 03 confirmation of what `historical-odds` already handles vs what the assembler must mask).

## 10. Dependencies

- **Doc 01:** the `{baseline, remainingGames}` input variant (§6) — small addendum, flagged there when implemented; `partitionByGame` powers §4.2.
- **Doc 03:** `ratings?at=` endpoint (backfill), games-as-of masking semantics, webhook debounce feeding intraday triggers; ask #4 (bulk export) downgraded per §7.
- **Doc 04:** era rule-set selection per backfilled season; clinch/elimination flags for §4.1.
- **Features 12/13/14:** consume §5 matrices, §6 payloads, §4.2 conditionals — their detail passes must not invent parallel stores.
