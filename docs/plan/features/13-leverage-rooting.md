# Features 13 — Leverage & Rooting Guide

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc features #15, #17, #18, and the deferred-but-designed #11. All computation is **partitioning the stored outcome matrix** (doc 02 §4.2/§5) — one sim batch answers every conditional question; nothing here simulates.

---

## 1. Definitions (fixed here, used everywhere)

For team T and game G with home-win probability p:

- **Swing:** `swing(T,G) = P(T makes playoffs | home wins) − P(T | home loses)` — signed; the sign encodes who T should root for. Displayed to users (it's concrete: "±6.2%").
- **Leverage index:** `lev(T,G) = |swing| × 2p(1−p)` — uncertainty-weighted; maximized at coin flips. **Used for ranking only, never displayed** (per the outline lean, now confirmed): a 20%-swing game that's 95/5 is a formality; a 6%-swing coin flip is tonight's drama. Ranking by leverage, showing swing, serves both truths.
- **Game leverage (league-wide, #18):** `LEV(G) = Σ_T lev(T,G)` over all teams — how much tonight's game matters *to the league*. The leaderboard metric.
- Division-title swings (`p_division` conditionals) computed alongside playoff swings where either club shares a division with T (doc 02 §4.2).

Hygiene rules (enforced at write time, doc 02): both partitions ≥ 2k sims, |swing| < 0.1% dropped; displayed swings round to 0.1%. **Swings are not additive across games** — the UI never sums them; "everything goes right tonight" is a scenario question and deep-links to the picker (features/12 §6) which answers it exactly.

## 2. Surfaces

### 2.1 `/{league}/tonight` — the daily page (#18)
Every game on today's slate, ranked by `LEV(G)`, each card showing: matchup + start time + anchored win prob; "matters most to" — the top 3–5 teams by |swing| with signed chips ("MIN +6.2 if PHI loses"); and a leverage tier glyph (🔥 tiers by league-relative percentile, not absolute thresholds — leverage inflates late-season, and tiers should stay meaningful in September). Header line doubles as the daily editorial hook ("Tonight's biggest game for the playoff race: CLE @ SEA"). Cross-league merged version on the home dashboard.

### 2.2 Team-page schedule badges
Each remaining game within the 7-day conditional horizon (doc 02 §4.2) gets a leverage tier badge + swing tooltip on the team page's schedule list (doc 10 §5). Beyond the horizon, no badge (don't fake precision about three-weeks-out conditionals).

### 2.3 `/{league}/{team}/rooting` — the rooting guide (#15)
"You're a Twins fan. Tonight:" — the team's own game first (its swing is just P(playoffs | win) − P(playoffs | loss)), then every *other* game tonight ranked by |swing|, each with a big root-for arrow and the conditional pair spelled out ("Root **Guardians**: 61.3% if they win, 55.1% if they lose"). Footer: "best case tonight → see it in the picker" (pins every favorable outcome, exact math via the scenario endpoint). Extremely shareable in September pennant races — OG card shows the top 3 rooting targets.

### 2.4 Intraday behavior
Intraday snapshots (D16) rewrite `game_conditionals` for the remaining slate (doc 02 §9 note, resolved yes) — as early games final, the tonight page re-ranks the late games. This is the page fans keep open on a Sunday.

## 3. Editorial framing rules

Language stays concrete and causal-honest: "swings your odds ±6.2%" (what the number is), "root for X" (direction), never "X eliminates you" for probabilistic statements — elimination language is reserved for the deterministic flags (features/14). Small-swing games get neutral framing ("low stakes for you tonight") rather than manufactured drama.

## 4. Live in-game approximation (#11 — designed now, shipped later)

The conditional pair *is* the precomputation: during a live game, a team's live playoff odds are the interpolation
`p_live(T) = wp_live × P(T | home wins) + (1 − wp_live) × P(T | home loses)`
where `wp_live` is a live in-game win probability. The branch values are already in `game_conditionals`; the only missing input is `wp_live`. SportsCrunch already *stores* in-game odds (`live_game_lines`, 5-min crawl) but doesn't expose them via API — a small future upstream ask, **deliberately not added to Phase 0** (doc 03 stays lean). When it ships: the tonight page's cards tick in near-real-time during games for the cost of one multiply — no re-simulation, exactly the reference doc's suggested approximation. Multi-game concurrent interpolation is naive (independence assumption) — acceptable for a live ticker, labeled "live estimate," with the next intraday snapshot as the exact correction.

## 5. Data & API

Everything reads `game_conditionals` (+ `team_odds` for context): `GET /api/site/{league}/tonight`, `GET /api/site/{league}/teams/{id}/rooting?date=`. Both cache per snapshot id. The public API mirrors them later (features/16) — the leverage feed is exactly the kind of thing writers cite.

## 6. PROPOSED resolutions

| Item | Proposal | Rationale |
|---|---|---|
| (outline) leverage definition surfaced | **Show swing, rank by leverage index** (§1); tier glyphs are league-relative percentiles | Users get a concrete number; ranking still prioritizes genuine drama |
| (outline) multi-team rooting | **Defer.** v1 rooting is per-team-page context; "my teams" preferences arrive with notifications (features/15, tied to Q13 accounts) | No prefs storage exists yet; the per-team page covers the core use |
| #11 live approximation | Interpolation design locked (§4); shipping gated on a future SportsCrunch live-odds endpoint, not requested in Phase 0 | Branch data is already stored; keep the upstream ask list minimal until this is prioritized |

## 7. Launch scope (PROPOSED)

`game_conditionals` exists from Phase 2, so: **tonight page + team-page badges are early-ship candidates at NFL launch (Phase 4)** — they're reads of existing data and give launch a daily hook. Rooting guide pages + picker deep-links land with the picker (Phase 5). Live approximation whenever the upstream feed materializes.
