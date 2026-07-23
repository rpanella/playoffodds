# Features 10 — Core Odds, Standings, Team, and Seed Displays

**Status: DRAFT v2 (2026-07-22).** Phase 3 core experience; reads local published data only.

## 1. Routes and source contract

| Route | Primary local source |
|---|---|
| `/` | current publication pointers, local games, selected movement/conditionals when available |
| `/{league}` | `snapshot_team_standings` + `team_odds` for current pointer |
| `/{league}/seeds` | seed/path aggregates + explicit standings mode |
| `/{league}/{team}` | local team/season/game materialization + standings/odds/history |
| `/model` | retained model/rules/replay/calibration/lineage artifacts |

All pages identify snapshot ID/revision, exact `as_of`, published time, spine/intraday, `official` versus `if_season_ended`, captured/reconstructed status, stale/degraded state and material correction link. No page fetches SportsCrunch or simulates during rendering.

## 2. League table

One row per season-team, grouped by the league's season-scoped divisions/conferences. Core fields:

- official record/points and official shared rank/status;
- separately labeled “if season ended” seed/path where meaningful;
- projected final record/points interval;
- playoff/qualification, division/path, bye/top-seed and championship probabilities;
- 1-day/7-day movement with explicit comparison snapshots; and
- local next game and start time where useful.

Do not collapse official live standing and final-procedure seed into one unlabeled “current seed.” If SportsCrunch returns an unresolved tie, rows share the displayed position/warning; the UI never randomly orders them as official.

Default sort is probability on the odds view and official order on the standings view; the user's selected view is URL-addressable. Mobile presents semantically equivalent cards/expanders without losing headers/relationships; a table remains available for screen readers/data access.

## 3. Probability and proof honesty

- Stored/API probabilities are decimals `[0,1]`; UI normally displays one decimal percentage with `<0.1%`/`>99.9%` at tails.
- A simulated `0` or `1` remains an estimate and does not produce clinched/eliminated language.
- Official league-recognized status may be shown as **Official** with SportsCrunch `official` lineage. PlayoffOdds mathematical status appears only after Phase 5E with `proven` evidence.
- Before proof exists, 100.0% sampling output formats as `>99.9%` and “not mathematically proven.” `unknown/not_proven` never looks like false.
- Correction, degraded input and retrospective reconstruction indicators are textual/icons with accessible labels, not color alone.

## 4. Seed/path matrix

Rows are teams; columns are league-versioned qualification/seed/play-in slots plus miss. Header and page state name the standings mode. Cells are aggregate probabilities, not current official placement. Each row sums to 1 within displayed rounding tolerance; a textual/table alternative exposes exact values and lineage.

Heatmap intensity is supplementary. Use visible percentages, sufficient contrast, labels/patterns for status, keyboard-accessible scrolling and sticky headers without trapping focus. Screenshot/share output includes date, mode, reconstruction/correction warning and canonical URL.

## 5. Team page

Phase 3 composition:

1. team identity, official record/status, exact `as_of`, current probability and movement;
2. odds/path/seed/championship summary;
3. one basic accessible spine history chart plus data table;
4. projected record/points interval;
5. remaining local schedule with start/neutral/anchor source warning; and
6. concise methodology/lineage/correction links.

Leverage/rooting/picker/proof/draft modules occupy defined extension slots only after their phase gates. The initial page does not promise a magic number or exact status field that Phase 2 does not produce.

## 6. Methodology/model page

Publish:

- what anchors, ratings, dynamic evolution and brackets do, in plain language;
- versioned model/parameter/build identifiers and change history;
- held-out proper scores, calibration and interval coverage with sample sizes/limitations;
- SportsCrunch rule ownership, pinned artifact ID/checksum and PHP/TypeScript conformance evidence;
- replay/retention/correction policy and current diagnostic summary;
- captured walk-forward versus retrospective/frozen-modern history definitions; and
- known unavailable inputs/simplifications (for example hypothetical pitcher/player context) without claiming them immaterial unless measured.

Rules citations link to the human-readable SportsCrunch artifact/approved local representation for the exact era. Marketing claims such as “reproduces every era exactly” require corpus evidence and scoped wording.

## 7. SSR/no-JS, accessibility, and failure states

Core answer, table, team summary, timestamp, warnings and model link exist in server HTML. Hydration adds sorting/toggles/chart interaction but cannot change semantic numbers for the same snapshot.

Meet doc 06 WCAG 2.2 AA requirements: keyboard/focus, real table headers/captions, chart data alternative, non-color status, reduced motion and 320px reflow. Dynamic current-pointer refresh never steals focus and announces a concise update.

If no valid current pointer exists, show typed unavailable state. If the last good snapshot exceeds freshness threshold, keep its true timestamp and show stale/degraded banner. Never substitute a SportsCrunch response in the request path.

## 8. Phase 3 acceptance

- DTO/page values and lineage match the same immutable snapshot across HTML, hydrated UI and anonymous API.
- `official`/`if_season_ended`, unresolved, proof and probabilistic states are distinguishable in automated fixtures.
- No-JS core tasks and accessibility critical paths pass doc 06 gates.
- Current/stale/correction/unavailable and SSR restart/rollback behavior passes production-shaped tests.
- Representative mobile performance meets the Phase 3 budget or an approved measured degradation; advanced visualization polish is deferred rather than weakening semantics.
