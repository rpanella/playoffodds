# 03 — SportsCrunch Integration

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.**
Proposed resolutions to Q9–Q11 are in §8. One new upstream ask surfaced by doc 04's verification work: game end-type exposure (§4.5).

The data contract between PlayoffOdds (consumer) and SportsCrunch (provider). Per D5: consume the Sanctum-authed `/api/v1` + webhooks; make small, well-specified additions to SportsCrunch rather than reading its DB. Per D9: SportsCrunch's data acquisition/completeness is its own roadmap — this doc specs only what PlayoffOdds *consumes* and the *new* upstream surface it needs.

---

## 1. Existing endpoints consumed (no upstream work)

| Endpoint | Used for | Notes |
|---|---|---|
| `GET /seasons` (`?league=`) | Season discovery; `has_market_lines` gates backfillable seasons | Cache daily |
| `GET /seasons/{s}/teams` | Team identity + per-season conference/division alignment (seeding structure; handles relocations) | **Verify during implementation** that the resource exposes conference/division ids — the underlying `season_team` has them |
| `GET /seasons/{s}/games` | Full-season schedule, statuses, scores, week, neutral flag; current blended odds + 24h deltas | Unpaginated full-season pull — fine, bundles want whole seasons |
| `GET /seasons/{s}/historical-odds?at=` | **The anchor feed** — every unplayed regular-season game's odds as of `at` (real consensus or time-traveled projection), with `is_projected` | Throttle 30/min; regular season only |
| Webhooks (`resource: games`, season-scoped) | Intraday snapshot triggers (D16); schedule-change awareness | Signed (`whsec_…`); `request_id` for idempotency; `sync` re-delivery on startup |

## 2. Bundle assembly recipes (pipeline → engine)

### 2.1 Live snapshot (spine or intraday), per league

1. `GET /seasons?league=X` → active season (cached).
2. `GET /seasons/{s}/teams` → `TeamInput[]` (cached daily; alignment changes are rare and never mid-season).
3. `GET /seasons/{s}/games` → full schedule: split `final` (results) vs `remaining` (status scheduled/live), statuses mapped conservatively (live/delayed games are *not yet final*: they stay "remaining" with their pre-game anchor — in-flight scores are ignored by v1 sims).
4. `GET /seasons/{s}/historical-odds?at=<snapshot instant>` → per remaining game: `home_win_probability` + `is_projected` → `baseLogit = logit(p)`.
5. `GET /seasons/{s}/ratings?at=<snapshot instant>` (**new endpoint**, §4.1) → ratings + league params (`k`, HFA).
6. Assemble `SnapshotBundle` (doc 01 §3); record every call's timestamp/counts into `snapshots.upstream_meta` (provenance, doc 02 §3).

Call budget: ≤5 requests per league per snapshot — throttle-irrelevant.

### 2.2 Backfill snapshot (as-of date D)

Same recipe with `at=D`, plus **as-of masking** of the games response:

- The `historical-odds?at=D` response is the **authority on "remaining as of D"** — any game it returns was unplayed then, whatever the games endpoint now says about it (it may have been postponed/rescheduled later).
- Games *not* in that response with `game_time < D` and status `final` supply results-as-of-D. Games later canceled/forfeited are taken at their current final disposition only if that disposition predates D; otherwise masked to remaining. (Edge cases here are rare and bounded; the assembler logs any game whose classification required a judgment call into `upstream_meta` for audit.)
- Ratings, era rule set (doc 04), and calibration constants all selected as-of D — the lookahead-hygiene rule (doc 02 §7).

### 2.3 Degradation rules (consume defensively, per D9)

| Failure | Behavior |
|---|---|
| Upstream unreachable at spine time | Retry ×3 with backoff → mark snapshot `failed`, alert; **never** publish partial odds; site keeps serving the last good snapshot |
| Some remaining games missing anchors | Engine prices them from ratings (`k·Δrating + hfaLogit`) — the same math as playoff games; per-game `anchorSource` recorded; alert if > 5% of slate |
| All anchors `is_projected` beyond the market horizon | Normal (books don't post full-season lines) — no action; `is_projected` counts logged per snapshot |
| Season status not `active` upstream | Skip league, alert (upstream crawlers are gated on active status — stale data risk) |
| Webhook delivery gap | Spine snapshot is the daily catch-all; a `sync` request re-baselines after any suspected gap |

## 3. Webhook consumption (intraday triggers, D16)

- One subscription per active league season, `resource: games`.
- Verify signature; dedupe on `request_id`; persist last-processed cursor.
- **Debounce:** on a `final` transition, start/extend a 30-minute quiet-window timer per league; when it fires (or when every in-progress game has gone final), enqueue one intraday snapshot. Ten near-simultaneous finals ⇒ one re-sim.
- Schedule-change events (postponements, game_time moves) don't trigger re-sims by themselves; they're picked up by the next snapshot's fresh games pull.

## 4. New SportsCrunch surface (the asks) — specs to hand upstream

### 4.1 Ratings & params endpoint (the one hard dependency)
`GET /api/v1/seasons/{season}/ratings?at={ISO8601, optional, default now}` →
```json
{ "success": true, "data": {
    "as_of": "…",
    "params": { "sigmoid_k": 2.4, "home_field_win_probability": 0.55 },
    "teams": [ { "team_id": 12, "rating": 0.183 }, … ],
    "model": { "predictor": "RecentOddsPredictor", "version": "…" } } }
```
Implementation note for upstream: this is a thin serialization of `Season::gamePredictor()`'s power-rankings array plus `League::gamePredictorConfig()` values; the `?at=` variant reuses the same time-travel machinery the predictor backtester already uses (`PeriodTimeTraveler`). Powers playoff-matchup pricing (doc 01 §8), anchor-fallback pricing (§2.3), the transparency page (features/10), and backfill (doc 02 §7). Throttle like historical-odds.

### 4.2 `is_projected` on the games endpoint
Expose the existing `market_line_types` semantics as a boolean on `GameResource` (bit 1 unset ⇒ projected). Today only historical-odds reveals it; the live surface should match. (PlayoffOdds primarily reads anchors from historical-odds anyway — this is belt-and-suspenders plus general API hygiene.)

### 4.3 MLB All-Star break date per season
The MLB tiebreaker "last half" anchors at the All-Star break (doc 04 A.2). Ask: add `all_star_break_date` (nullable, MLB-only) to `SeasonResource`. Fallback if declined: derive from the schedule's mid-July gap ≥ 3 days with no MLB games — workable but brittle across eras; the explicit field is strongly preferred.

### 4.4 Postseason pricing — no upstream work (proposed Q11 resolution)
Playoff *matchups* are priced entirely from ratings + in-sim deltas (D14); actual postseason games' schedules/results flow through the existing games endpoint once scheduled. `historical-odds` staying regular-season-only is **fine** — withdraw the "extend historical-odds to postseason" idea.

### 4.5 Game end-type exposure (NEW — surfaced by doc 04 verification)
NHL accumulators need **regulation vs OT vs SO** per played game (RW/ROW columns), and the OT-model calibration (doc 01 §7) needs the same historically. The `games` table's `period` column (>3 ⇒ extra time) plus parsed end-type strings exist upstream; ask: expose `end_type: "REG" | "OT" | "SO"` (nullable, NHL; `OT` for NFL tie-adjacent finals is derivable from scores and not needed) on `GameResource`. Without this, NHL standings state cannot be built — **this is a hard dependency for NHL onboarding (Phase 5), though not for Phase 1 (MLB/NFL)**.

### 4.6 Nice-to-haves (not blocking anything)
- Bulk backfill export — downgraded (doc 02 §7: per-day assembly fits the throttle).
- NFL per-game touchdown counts, only if ESPN data already carries them — powers the deterministic net-TD tiebreak step (doc 04 §5); never simulated.

## 5. Auth & tokens

Sanctum personal access token minted upstream via `api:token` (same pattern as poolcrunch), stored in `podds` env. One token, named `playoffodds`. All calls `Authorization: Bearer`. No user-level auth flows anywhere in the pipeline.

## 6. Provenance & auditability

Every snapshot's `upstream_meta` records: request URLs + fetched-at timestamps, response counts (games, anchors, projected/real split), ratings model version, and any degradation-rule activations (§2.3). This is what makes "why did Tuesday's odds look weird?" answerable six months later.

## 7. Sequencing with 90-build-order

Phase 0 upstream work, in priority order: **4.1 ratings endpoint** (blocks Phase 1 playoff pricing + all backfill), 4.3 ASB date (blocks MLB tiebreakers in Phase 1 — or ship the schedule-gap fallback first), 4.2 flag (any time), 4.5 end-type (blocks Phase 5 NHL only), 4.6 whenever. All are small: 4.1 is the only one touching non-trivial upstream code, and it wraps machinery that already exists.

## 8. PROPOSED resolutions (owner review requested)

| Q | Proposal | Rationale |
|---|---|---|
| Q9 (ratings endpoint shape) | **Raw ratings + league params** (§4.1), not a matchup-probability service | One cheap endpoint serves pricing, fallback, transparency, and backfill; matchup math lives in the engine where deltas exist |
| Q10 (backfill mechanism) | **Per-day API assembly** (§2.2) — no bulk export, no throttle change, no direct-DB exception to D5 | Doc 02 §7 throughput math: a league-season backfills overnight, ~14 min of API time |
| Q11 (postseason anchors) | **Ratings-side pricing; no upstream postseason work** (§4.4) | D14 already prices brackets from ratings + deltas; historical-odds stays as-is |

New opens: none promoted to 99 — §4.3's schedule-gap fallback and §2.2's edge-case masking rules are implementation details with defined defaults.

## 9. Dependencies

Feeds doc 01 (bundle schema §3), doc 02 (assembly, provenance, backfill), doc 04 (ASB date, end types, era selection inputs). Consumed by 90-build-order Phase 0 (the asks) and Phase 2 (pipeline build).
