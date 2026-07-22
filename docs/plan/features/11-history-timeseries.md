# Features 11 — History & Time Series

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc features #8, #9, #10. Reads spine snapshots only (D16) — the daily axis is the whole point. The backfill advantage (00 §4, D18) makes this a launch-day differentiator instead of a year-two feature.

---

## 1. The odds chart (#8) — the marquee component

One reusable `OddsChart` component (shared `ui/` package, doc 10 §7):

- **X-axis:** league period (weeks for NFL, dates for daily leagues), spanning the season; preseason snapshot as the left edge once available.
- **Y-axis:** 0–100%, fixed (odds charts must be comparable across teams/seasons — no auto-scaling).
- **Series:** the selected metric per team — `p_playoffs` (default), `p_division`, `p_seed[1]`, `p_championship` selectable via segmented control. Data = `team_odds` rows across spine snapshots (doc 02 §4.3), one point per day.
- **Overlays:** team page defaults to division rivals (muted) behind the subject team (accent); league view supports pick-any-teams compare (max ~6 for legibility).
- **Hover/tap annotations:** each point joins to the games that resolved between it and the prior spine snapshot — "Oct 12: beat GB 27–20 (+4.1%)". Days with movement but no games get a "line movement" tag (doc 01 §11's result-driven vs line-driven distinction, derivable from `upstream_meta` anchor deltas). Clinch/elimination days get a milestone marker (`x`/`e` glyph on the line).
- Mobile: tap-and-drag scrubbing with a fixed readout row above the chart (no hover dependence); pinch/zoom deliberately omitted — season-at-a-glance is the product.
- Implementation note: chart library chosen at Phase 3 with the dataviz skill loaded; requirements it must meet — SVG or canvas SSR-safe placeholder, <15KB added to bundle preferred (uPlot-class or hand-rolled SVG; not a 300KB charting suite for line charts).

## 2. Date selector / archive (#9)

Every league page accepts `?date=YYYY-MM-DD` → renders **that day's spine snapshot** — table, matrix, and team pages all time-travel with one query param, because pages are already pure functions of `snapshot_id` (doc 10 §1). UI: a compact date control in the "as of" header slot; URLs are shareable/citable permalinks ("here's what the odds said on deadline day"). Immutable snapshots ⇒ these pages cache forever. Out-of-range or missing dates fall to the nearest earlier spine snapshot with a notice. This is also the public API's archive semantics later (features/16) — same parameter, same meaning.

## 3. Preseason vs. current (#10) — movers

- **Movers module** (home + league hub): biggest risers/fallers over selectable windows — 1d, 7d, season-to-date (vs. the season's first spine snapshot). Direct reads of the delta columns + a season-open self-join.
- Framing rule: always show the pair ("62% → 34%"), not just the delta — the story is the journey.
- This module is the recurring-content engine: its top entries feed notification candidates (features/15) and the home dashboard's daily narrative.

## 4. Backfill presentation & honesty

- Backfilled spine rows (`backfilled=true`, D18: previous season at launch, deeper later) render **identically** in charts — the data is honest by construction (as-of-date inputs, era rules, no lookahead; doc 02 §7) — but the chart footer shows "odds before {first-live-date} computed retroactively from historical market data" linking to the methodology note on `/model`.
- The methodology note states plainly: what was reconstructed (anchors, ratings, rules eras), what wasn't knowable (nothing — that's the claim), and the calibration evidence (doc 01 §10 coverage tests).
- Prior-season pages (`/{league}?season=2025`) reuse everything: a season selector next to the date selector, reading the same immutable rows.

## 5. Sharing (#31-adjacent)

- **OG cards at launch:** server-rendered share images per team page and league page — template: team mark/colors, hero number ("Vikings playoff odds: 52.9%"), 1d delta, date, site mark. Static-template rendering (headless Chrome or an image lib) into a cached PNG per (page, snapshot).
- **Chart-image shares (v1.1):** rendering the actual odds chart into the OG card — higher effort, do after launch.
- Every chart gets a "copy link" that preserves full state (`?date=`, `?season=`, compare set, metric) — URL-addressable state is a hard requirement on the components.

## 6. Data access

Site API resource: `GET /api/site/{league}/series?teams=…&metric=…&season=…` → `[ {team_id, points: [[instant, value], …]} ]`, spine rows only, immutable-cached. One covered index query (doc 02 §4.3). No client ever queries snapshots generically — named resources only, so the public API (features/16) can mirror them 1:1.

## 7. Launch scope (PROPOSED)

**In for NFL launch:** team-page chart with annotations, league compare view, date selector, movers module, backfilled previous season (D18), static-template OG cards, methodology note. **v1.1:** chart-image OG cards, multi-season selector UI polish (data supports it day one). Rationale: the chart + archive are the "538 is back" moment and the whole point of the backfill work; OG chart images are additive polish.

## 8. Open questions
- Annotation coverage for backfilled seasons: game-result joins work identically (results are in the DB); "line movement" tags need `upstream_meta` from backfill runs — confirm the backfill pipeline records it (doc 02 §7 says yes; verify in Phase 2).
- Whether the home dashboard shows cross-league movers merged or per-league tabs *(lean: merged, ranked by |Δ| — it's the "what happened in sports last night" page)*.
