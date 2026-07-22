# Features 17 — Draft Order & Lottery

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc feature #29. The tanking side of the same engine — every fan is chasing a playoff spot or a lottery pick, and Tankathon owns this space alone. The sims already contain the bottom of the standings; this is lottery math + presentation.

---

## 1. The math — closed-form on top of existing outputs

Per team: `P(pick = j) = Σ_position P(finish in reverse-standings position i) × L(i → j)` — the finish-position distribution (`p_bottom`, already in `team_odds`; per-sim bottom-rank already in the finish matrix) times the league's lottery matrix. **No new simulation**: lottery odds are exact matrix multiplication, and where draft position depends on tiebreaks (NFL), the deterministic machinery already exists.

Our structural edge over Tankathon: they apply lottery odds to *frozen current standings*; we integrate over the **distribution of final standings** — a team 60% to finish last shows its true P(1st pick), weeks before the standings settle.

## 2. League rule modules — rules-as-data, same architecture as doc 04

Draft procedures live in the same era-versioned `rules/` system (`rules/nba/draft-2019-present.*`, …), sourced from official league publications at implementation time — **including the NFL's separate official draft tiebreaking procedure** surfaced by the doc 04 verification pass (reverse standings → opponents' aggregate win pct, lowest first → divisional/conference ladders → coin flip, with round-to-round rotation). To research and encode per league (initial understanding, to be verified from official sources like doc 04's Appendix A process):

| League | Mechanism | Notes to verify |
|---|---|---|
| NBA | Lottery over 14 non-playoff teams; flattened odds (14/14/14/12.5…); four drawings for picks 1–4, then reverse standings; ties split combinations | Current combination table; play-in losers' status |
| NHL | Lottery over 16 non-playoff teams; two drawings (picks 1–2); max 10-spot climb; win-once-per-N-years rule | Current constraints post-2021 changes |
| MLB | Lottery over all 18 non-playoff teams for picks 1–6 (2022 CBA); revenue-sharing/repeat-appearance eligibility restrictions | Restriction details are fiddly — v1 may ship slot odds with restrictions footnoted |
| NFL | No lottery: pure reverse standings + the official draft tiebreak procedure + rotation | Already sourced (doc 04 A.1) |

Era-versioning matters here more than anywhere — lottery formats change constantly (NBA 2019 flattening, NHL 2021, MLB 2023 debut).

## 3. Surfaces

- **`/{league}/draft`:** the draft-order odds table — teams × picks heatmap (mirror of the seeding matrix component, doc 10 §3), expected pick value, current-if-season-ended order alongside the probabilistic view.
- **Lottery simulator:** interactive draw (the Tankathon crowd-pleaser) — but seeded from our live finish-position *distributions*, with a toggle for "if the season ended today" to match the incumbent's framing. Runs client-side (trivial: sample position, sample lottery); share-card for the result.
- **Team pages:** the draft module (doc 10 §5's reserved slot) — activates automatically as `p_playoffs` falls (proposal: visible below 25%, promoted above the playoff modules when `eliminated` flags fire). The full-fan-picture view no incumbent offers: playoff odds and pick odds on one page.
- **Tonight-page integration:** late season, leverage has a mirror image — games that swing *draft position*. Same `game_conditionals` machinery pointed at `p_bottom`. (v1.1; the partition pass just needs a second metric.)

## 4. Scope (PROPOSED, resolving the outline's opens)

| Item | Proposal | Rationale |
|---|---|---|
| Launch order | **NBA + NHL first** (lottery leagues, October starts — peak tanking audience), NFL draft table cheap anytime after, MLB lottery last | Matches Phase 5/6 league onboarding and where the audience is |
| Pick trades/protections | **Defer.** v1 shows each team's own slot odds, labeled "own pick" | Trade/protection data is a new external dependency (no SportsCrunch source); Tankathon's moat is partly this data — revisit post-launch |
| MLB eligibility restrictions | v1 slot odds computed without restrictions, footnoted; exact restrictions when the MLB module ships | Restrictions affect a handful of edge teams; honesty note beats delay |

Dependencies: `p_bottom` + finish matrix (exist from Phase 2); draft rule files (research pass mirrors doc 04 §2.3); the seeding-matrix UI component (doc 10). No upstream SportsCrunch asks.
