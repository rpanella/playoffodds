# Features 10 — Core Odds Displays

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc features #1–7, #27, #28, #31. Everything here reads Layer-1 aggregates (doc 02 §4) from the latest snapshot — no simulation in any request path.

---

## 1. Information architecture & routes

| Route | Page | Primary content |
|---|---|---|
| `/` | Home | Cross-league dashboard: today's headline movers, tonight's highest-leverage games (features/13 teaser), league entry cards |
| `/{league}` | League hub | The odds table (§2) — the default league view |
| `/{league}/seeds` | Seeding matrix (§3) | |
| `/{league}/{team}` | Team page (§5) | e.g. `/nfl/vikings` — slug from team shortname |
| `/model` | Transparency (§6) | Ratings, methodology, verification counters |

Inertia + Vue-or-React (Q19, decided at Phase 3 start) with SSR enabled — odds pages are prime search/share targets and must render server-side. Every page is static per snapshot: cache keyed on `(route, snapshot_id)`, invalidated only when a new snapshot lands. A slim global header shows league nav + "as of {snapshot time}" with the date-selector entry point (features/11).

## 2. League odds table (#1–4, #7)

One row per team, grouped by division (collapsible on mobile), columns:

| Column | Source | Notes |
|---|---|---|
| Record + projected record | `wins_mean`, `proj_record` | "10-7 → 11.2 wins" framing |
| Playoffs % | `p_playoffs` | The headline column; default sort |
| Division % / Wild card % | `p_division`, `p_wildcard` | The path split, side by side — a stated differentiator |
| Top seed / Bye % | `p_seed[1]`, `p_bye` | League-appropriate (bye: NFL/MLB; Presidents' Trophy: NHL) |
| Championship % | `p_championship` | The screenshot number |
| Δ 1d / Δ 7d | `d1_p_playoffs`, `d7_p_playoffs` | Delta chips, signed + colored |

- **Status badges** replace/augment probabilities when deterministic flags fire: `x` clinched playoffs, `y` clinched division, `z` clinched bye, `e` eliminated — same visual grammar fans know from newspaper standings, backed by our tiebreaker-correct flags (features/14).
- **Probability display honesty rule (site-wide):** one decimal ≥1%; below that "<1%", above 99% ">99%". **Exact 100%/0% appear only when the deterministic clinch/elimination flag says so** — a Monte Carlo 100% is not a promise, a clinch is. This rule is a shared formatter used by every surface.
- Mobile: division groups become stacked cards; columns beyond Playoffs/Division/Champ collapse behind a per-row expander. No horizontal page scroll ever (390px-first, features/15 discipline).

## 3. Seeding probability matrix (#5)

Teams (rows, ordered by expected seed) × seeds (columns: 1–7 NFL; 1–6 MLB; 1–10 NBA including play-in slots 7–10 visually distinguished; 1–8 NHL by conference with wild-card columns) — cell = `p_seed[j]`, rendered as a heatmap with in-cell percentages. Conference toggle. A "miss" column on the right completes each row to 100%. Mobile: sticky team column, horizontally scrollable grid *within its own container*. The most-loved dead-538 artifact — this page is a marketing asset; make it screenshot-clean (title, date, watermark URL in the corner).

## 4. Win distributions (#6) & advancement cascade (#3)

- **Distribution strip** per team: a compact percentile bar (p10–p90 band, p25–p75 emphasized, median tick) rendered inline on team pages and as an expandable row detail in the league table. BP-style honest framing: "the model identifies a range."
- **Advancement cascade**: per team, the monotone chain P(playoffs) ≥ P(win round 1) ≥ … ≥ P(champion) as a stepped bar — team-page module + a league-wide sortable table at `/{league}/playoffs`.

## 5. Team page

Composition (top to bottom): header (record, seed-as-of-today, playoff% as the hero number + 1d/7d delta); status panel (clinch/magic-number fusion — "magic number 4 · 94% to clinch by Sep 20", features/14); odds summary cards (division / wild card / bye / championship); **odds history chart** (the features/11 component, division-rivals overlay default); win distribution strip; remaining schedule list — each game with date, opponent, anchored win prob, and a leverage badge when `game_conditionals` has a row (features/13); draft odds module slot (hidden until features/17 ships). Eliminated teams flip the page's framing: draft module promotes to the top, playoff modules compress (the Tankathon audience, same engine).

## 6. Transparency page (#27, #28) — the trust asset

- Published **power ratings** table per league (from the ratings endpoint) with plain-language explanation of the market-implied method and the dynamic-sim layer (anchors + drift, in accessible prose).
- **SOS-remaining** per team (from `sos_remaining`).
- **Verification receipts:** golden-season replay results ("our tiebreaker engine reproduces the official seeding of the last N seasons of every league, exactly"), tiebreak reach-frequency counters (doc 04 §6.4), the beyond-official `randomDraw` disclosure (doc 04 §8), coverage-test calibration stats (doc 01 §10), and the backfill methodology note (features/11).
- Era rules pages: rendered `.md` rule files per league per era (doc 04 §2.1) — "the exact rules we apply, per season."

## 7. Visual system (#31)

Load the dataviz design skill before building any chart component (Phase 3 implementation note). System rules set here, used everywhere: one accent hue per league context with an intensity ramp for probability cells; clinched = saturated success state, eliminated = desaturated; delta chips green/red with neutral gray at |Δ|<0.1%; dark mode is first-class from the first component; every chart/table is a Vue-or-React component in a shared `ui/` package (`ProbCell`, `DeltaChip`, `HeatGrid`, `PercentileStrip`, `CascadeBar`, `OddsChart`) so features 11–17 compose rather than reinvent. Design benchmark per the reference doc: beat Tankathon on clarity, never ship "Excel screenshot" energy.

## 8. Launch scope (PROPOSED)

**In for NFL launch:** league odds table, seeding matrix, team pages (with history chart + status panel), transparency page, home dashboard. **v1.1 (weeks after):** advancement cascade page (`/{league}/playoffs` — the aggregates exist day one; it's pure UI), distribution expander in the league table. Rationale: the table + matrix + team page are the shareable core; the cascade is additive.

## 9. Open questions
- Q12 (brand/domain) — non-blocking for this doc's build, blocking for launch (watermarks, OG cards, header).
- League hub default sort: playoffs % vs current standings order? *(lean: playoffs % — we are an odds site, not a standings site)*
