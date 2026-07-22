# 99 — Decision Log & Open Questions

**Status: LIVE — append-only decision log; questions get promoted to decisions as they're resolved.**

## Decisions

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-07-16 | Docs-first: detailed reviewable plan before any code | Owner directive; docs must be executable by LLM agents |
| D2 | 2026-07-16 | Engine sport-agnostic; MLB = live dev/validation sport; public launch at NFL kickoff (~Sep 10, 2026); NBA/NHL in Oct | MLB season is live now (real daily data all summer); NFL is the biggest-audience debut |
| D3 | 2026-07-16 | Website: Laravel 12 + Inertia; frontend framework (Vue vs React) deferred to Phase 3 → Q19 | Owner has light Vue experience, none in React, but agents write all code — pick whichever serves the project best when the website phase starts |
| D4 | 2026-07-16 | Sim engine: **shared TypeScript** package — Node worker server-side, same code in browser | Standings/tiebreakers/sim written once; the picker needs client-side sims anyway; typed arrays fast enough |
| D5 | 2026-07-16 | Data via SportsCrunch **API + small additions** (not direct DB) | Decoupling, dogfoods the API, reuses HistoricalOddsCalculator logic; possible pragmatic exception for bulk backfill (Q3) |
| D6 | 2026-07-16 | Sims use **dynamic in-sim rating evolution** (zero-mean Elo-style updates), not frozen odds | Frozen odds understate variance/tails; precedent FTN & 538 |
| D7 | 2026-07-16 | Per-game probabilities **anchored to SportsCrunch blended market/model probability** in logit space; deltas ride on top | Keeps market sharpness (injuries/pitchers priced in) while allowing in-sim evolution; needs only league `k` |
| D8 | 2026-07-16 | Calibrate drift rate η per league by **measuring historical market-implied rating drift**; validate with coverage tests | Turns the biggest free parameter into a measurement; SportsCrunch time-travel makes it possible |
| D9 | 2026-07-16 | SportsCrunch's data acquisition/completeness (legacy backfill, gap recovery, source redundancy) is **out of scope** — this project only specs the new SportsCrunch additions it needs | Owner will backfill older seasons upstream independently; PlayoffOdds consumes what exists and degrades gracefully |
| D10 | 2026-07-16 | (resolves Q1) No per-sim talent draw (σ_est) in v1; coverage tests are the objective trigger to add it | Doc 01 §14 approved by owner |
| D11 | 2026-07-16 | (resolves Q2) 100k sims server-side all leagues; 2–5k browser | Doc 01 §14 approved by owner |
| D12 | 2026-07-16 | (resolves Q3) Margin-first outcome model for NFL/NBA (margin drawn, outcome = sign); MLB Bernoulli-only | Doc 01 §14 approved by owner |
| D13 | 2026-07-16 | (resolves Q4) NHL five-outcome decomposition: closeness-conditional P(regulation), league-constant OT/SO split, compressed extra-time win prob | Doc 01 §14 approved by owner |
| D14 | 2026-07-16 | (resolves Q5) Playoff games reuse regular-season HFA; brackets as data tables re-verified preseason; ratings+deltas price playoff matchups | Doc 01 §14 approved by owner |
| D15 | 2026-07-16 | **OLD_playoffodds is not used** (no code, no reference). Tiebreaker rules are sourced from official league publications and stored **era-versioned**: paired text (`.md`, cited + dated) and encoded (`.json` ladder over step primitives) rule sets with applicability year ranges, selected by season year | Owner: the legacy app is ~10 years old and every step of the procedures has changed over time; rules must come from the leagues, versioned per era, in both human-readable and code form |
| D16 | 2026-07-16 | (resolves Q6) Snapshot cadence: daily **spine** at league snapshot instant (sole charting axis) + webhook-triggered **intraday** re-sims on game finals (debounced); anchor-only refresh behind a flag | Doc 02 §9 approved by owner |
| D17 | 2026-07-16 | (resolves Q7) Outcome matrices: custom versioned binary, engine-owned reader/writer, disk with S3-ready layout; retained current season + 30 days; aggregates & payloads forever; pruned artifacts reproducible via provenance triple + seed | Doc 02 §9 approved by owner |
| D18 | 2026-07-16 | (resolves Q8) Backfill at launch = current + previous season per league via per-day API assembly; deeper seasons opportunistically post-launch (bounded by upstream coverage per D9) | Doc 02 §9 approved by owner |
| D19 | 2026-07-16 | PlayoffOdds application DB is named **`podds`** — never `playoffodds` | Permanent guard against collision with the legacy `playoffodds` DB that SportsCrunch imports from |
| D20 | 2026-07-16 | (resolves Q9) SportsCrunch ratings endpoint ships **raw ratings + league params** (`k`, HFA); matchup probabilities derived engine-side | A matchup matrix is a redundant N² expansion of the N-vector, can't absorb in-sim deltas or venue variants, and ratings feed the transparency page directly |
| D21 | 2026-07-16 | (resolves Q10) Backfill via **per-day API assembly** — no bulk export, no throttle change, no direct-DB exception to D5 | A league-season is ~14 min of API time + overnight compute (doc 02 §7) |
| D22 | 2026-07-16 | (resolves Q11) Postseason matchups priced **ratings-side** (D14); `historical-odds` stays regular-season-only; no upstream postseason work | Brackets are hypothetical pairings — anchors can't exist for them anyway |
| D23 | 2026-07-16 | (resolves Q18) Scenario share links are **URL-only** (stable game ids, delta-encoded, ~2 chars/pick); no short-link service; links apply pins to the current snapshot | Zero infrastructure; scenarios stay alive as the season moves; short-links only if platform URL limits ever bite |
| D24 | 2026-07-16 | (resolves Q12) Brand: **PlayoffOdds / playoffodds.com** | Owner call; exact-match name; app DB stays `podds` per D19 regardless |
| D25 | 2026-07-16 | (resolves Q13) **No user accounts in v1**: device-local push subscriptions (features/15 §3); **accounts-lite** (email + API key) arrives only with the public API | Matches casual-fan behavior; identity only where keys demand it |
| D26 | 2026-07-16 | (resolves Q14 + Q20) **All free at launch**: site free; public API + CSV downloads free with required attribution (CC BY-style terms); paid tiers revisited post-traction | Adoption + citations are the launch currency |
| D27 | 2026-07-16 | (resolves Q15) Draft features: **NBA + NHL first**, NFL table anytime, MLB lottery last; pick trades/protections deferred; MLB eligibility restrictions footnoted in v1 | features/17 §4 approved by owner |
| D28 | 2026-07-16 | (resolves Q16) Hosting: **same Forge/AWS environment as SportsCrunch, dedicated server** for the podds app + Node sim worker (queue-triggered) | One ops surface; sims never contend with the 5-min crawlers |
| D29 | 2026-07-16 | (resolves Q17) College sports: **maybe someday — keep doors open.** No hardcoded league counts/enums; leagues stay data-driven modules; no college work planned | Zero cost to keep open; NCAAM/selection-committee modeling is a different problem for a different day |

## Open questions

**Engine (doc 01)** — ~~Q1–Q5~~ all resolved → D10–D14 (doc 01 approved 2026-07-16).

**Outputs & pipeline (doc 02)** — ~~Q6–Q8~~ all resolved → D16–D18 (doc 02 approved 2026-07-16).

**Integration (doc 03)** — ~~Q9–Q11~~ all resolved → D20–D22 (doc 03 approved 2026-07-16).

**Product**
- ~~Q12–Q18, Q20~~ all resolved → D23–D29 (2026-07-16).
- Q19: Frontend framework — Vue or React. **Deferred by design to Phase 3 start** (owner open to either since agents write the code; weigh ecosystem fit for charts/interactive components and Inertia support at decision time).
- Q21: Claude connectors directory listing requires a Team/Enterprise plan — buy seats for the listing, or rely on connect-by-URL until the MCP server shows traction? (doc 05 §7 proposes: defer the spend.)

## Question workflow
When a deeper doc's detail pass needs an answer, it cites the Q number; resolution gets a D number and the Q is struck through with a pointer.
