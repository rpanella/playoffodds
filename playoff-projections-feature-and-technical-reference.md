# Playoff Projections: Feature Catalog & Technical Implementation Reference

**Status: REFERENCE — amended 2026-07-22.** This competitive catalog is background, not the PlayoffOdds implementation contract. The versioned documents under [`docs/plan/`](docs/plan/00-overview.md) and the decision log control where product-specific architecture, sequencing, evidence gates, or terminology differ. Market/vendor details here must be reverified before use.

Compiled from the competitive survey of FanGraphs, Baseball Prospectus, MoneyPuck, The Athletic, ESPN FPI/BPI, FTN/DVOA, Basketball-Reference, PlayoffPredictors, PlayoffStatus, Sports Club Stats, Inpredictable, Tankathon, Neil Paine, and the defunct FiveThirtyEight.

---

# Part 1 — Feature Catalog

Each entry: what it is, who does it well, and a build note.

## A. Core Probability Outputs

### 1. Make-the-playoffs probability
The headline number: percent chance a team qualifies for the postseason. Everything else is downstream of this.
- **Best in class:** FanGraphs (MLB), MoneyPuck (NHL), ESPN FPI (NFL)
- **Build note:** Table stakes. Nobody looks at your product without it.

### 2. Division / conference / wild card probability
Odds of winning the division outright, and separately the wild card path. In the NFL a division win guarantees a home game, so the distinction carries real meaning to fans.
- **Best in class:** FanGraphs splits "win division" vs. "win Wild Card" explicitly
- **Build note:** Model the *paths* separately, not just the aggregate. Fans care about the route, not only the destination.

### 3. Round-by-round advancement odds
Probability of reaching the Divisional Series, Conference Finals, Championship, etc. A cascade of conditional probabilities.
- **Best in class:** FanGraphs (LDS/LCS/WS), MoneyPuck (each playoff round)
- **Build note:** Requires simulating the bracket itself, including matchup-dependent reseeding.

### 4. Championship probability
Win the Super Bowl / World Series / Stanley Cup / NBA Finals.
- **Best in class:** MoneyPuck, FTN/DVOA, Neil Paine
- **Build note:** Nearly free once you're simulating the bracket. High marketing value — it's the number people screenshot.

### 5. Seeding probability matrix
Probability of finishing in each individual seed (1–7 in NFL, 1–8 plus play-in in NBA). Usually rendered as a grid or heatmap.
- **Best in class:** FTN/DVOA (odds for each seed), Basketball-Reference
- **Build note:** One of the most-loved 538 features, currently underserved. Cheap to compute from sims you're already running.

### 6. Projected final record / win distribution
Not just a median but the full Monte Carlo distribution — "10th percentile: 78 wins, median: 87, 90th: 95."
- **Best in class:** FanGraphs added explicit win distributions; Baseball Prospectus publishes PECOTA percentile ranges
- **Build note:** BP's framing is worth stealing — the model identifies an estimated *range*, it doesn't pick a winner. Distributions communicate uncertainty honestly and differentiate you from single-point projections.

### 7. Presidents' Trophy / best-record / first-round-bye odds
Secondary honors and byes.
- **Best in class:** MoneyPuck
- **Build note:** Free output from existing sims. Adds surface area for content.

## B. Temporal & Historical Features

### 8. Odds-over-season time-series charts
Line charts showing each team's playoff probability evolving day by day. The single most-missed 538 feature.
- **Best in class:** FanGraphs Playoff Odds Graphs (the canonical implementation)
- **Build note:** Persist captured daily snapshots from day one. Retrospective reconstruction may be possible when exact cutoff inputs can be reconstructed, but it must be labeled separately from captured walk-forward history and retain full model/rules/input lineage.

### 9. Historical odds archive / date selector
Rewind and view the odds as they stood on any prior date.
- **Best in class:** FanGraphs has a date selector on the playoff odds page
- **Build note:** Same storage requirement as #8. Also a natural archive/API feature; PlayoffOdds does not assume a paid tier at launch.

### 10. Preseason vs. current comparison
Show how far a team has moved from preseason expectations.
- **Best in class:** PowerRankingsGuru tracks preseason vs. current
- **Build note:** Trivial once snapshots exist. Good recurring content hook — "biggest risers and fallers."

### 11. Live in-game odds
Playoff odds that move in real time as a game is being played.
- **Best in class:** MoneyPuck and ESPN (NFL); HockeyStats refreshes every 5 minutes
- **Build note:** Expensive — needs a live win-probability model plus fast re-simulation. High engagement payoff. Consider an approximation: precompute the win/loss branch odds before the game, then interpolate along live win probability.

## C. Interactive & Scenario Features

### 12. What-if scenario picker ("playoff machine")
User picks winners of remaining games and sees the resulting bracket.
- **Best in class:** ESPN Playoff Machine, PlayoffPredictors, Pro Football Network
- **Build note:** Saturated in the NFL, thinner in NHL/MLB/NBA. Critically, the saturation is all in *deterministic* pickers.

### 13. Interactive picker fused with live simulation
The gap. Pick games and watch the *probabilities* recalculate, not just the bracket. Incumbents are either probabilistic (FanGraphs, MoneyPuck) or interactive (ESPN Machine, PlayoffPredictors) — almost nobody is both.
- **Best in class:** Nobody, cleanly
- **Build note:** Your strongest wedge. Requires fast on-demand sims or conditional caching (see Part 2, §7).

### 14. Shareable scenario links
Encode a scenario into a URL so users can post "here's how the Niners get the 1 seed" on Reddit or X.
- **Best in class:** PlayoffPredictors supports sharing brackets
- **Build note:** Cheapest viral loop available. Encode game picks into a compact URL-safe payload.

### 15. Rooting guide — "who should I root for tonight"
Given your team, which of tonight's other games help you most.
- **Best in class:** Sports Club Stats ("who you should root for today")
- **Build note:** Directly derivable from conditional sims. Genuinely useful, badly underserved, extremely shareable during a pennant race.

### 16. Best-case / worst-case scenarios
Per-team tables showing the ceiling and floor of the remaining schedule.
- **Best in class:** PlayoffStatus "What If?" tables — next game, all remaining games, best and worst case
- **Build note:** Deterministic, cheap, and a good complement to the probabilistic view.

## D. Leverage & Game Importance

### 17. Playoff leverage / game importance
How much a single upcoming game swings a team's odds — combining outcome uncertainty with the size of the probability swing.
- **Best in class:** Inpredictable pioneered it (defined as how uncertain the outcome is *and* how much the playoff picture swings as a result), but is largely dormant. 538 published playoff implications of every game.
- **Build note:** Concept proven, incumbent dead, nobody has modernized it. Compute as the spread between P(playoffs | win) and P(playoffs | loss), optionally weighted by outcome uncertainty.

### 18. "This game swings your odds ±X%" daily feed
A league-wide leaderboard of the highest-leverage games on tonight's slate.
- **Best in class:** Nobody currently
- **Build note:** Natural pairing with push notifications (#23). This is your daily recurring engagement hook.

### 19. Control-your-destiny indicator
Whether a team clinches purely by winning out, regardless of other results.
- **Best in class:** PlayoffStatus (green/red control indicators)
- **Build note:** A deterministic universal-outcome proof problem, not a simulation output. Dependency-heavy tiebreakers can make it expensive; timeout/unsupported must return unknown.

## E. Deterministic Status Features

### 20. Magic numbers / elimination (tragic) numbers
The classic "any combination of our wins and their losses totaling N clinches." Not every league/race admits one rival-independent scalar.
- **Best in class:** Widely available, but rarely fused with probabilistic context
- **Build note:** Combine proven deterministic conditions with probability, but use opponent/scenario vectors when no scalar is sound.

### 21. Clinch / elimination scenario enumeration
"You clinch tonight if you win AND Seattle loses." Requires exhaustive tiebreaker-correct search.
- **Best in class:** PlayoffStatus, PlayoffPredictors
- **Build note:** Requires a proof-safe dependency model and sound complete search/solver. Pruning must be proven safe; timeout is unknown, never a clinch.

### 22. Tiebreaker resolution
Full implementation of head-to-head, division record, common opponents, strength of victory, and the rest.
- **Best in class:** PlayoffPredictors markets explicitly on this — most tools guess, they implement every verifiable step
- **Build note:** Where most competitors are quietly wrong. Correct tiebreakers are a credibility moat *and* a marketing claim. See Part 2, §5.

## F. Delivery & Platform Features

### 23. Push notifications on odds movement
"Your team's playoff odds jumped 12% tonight." "High-leverage game in 2 hours."
- **Best in class:** Nobody
- **Build note:** Zero incumbents do this. Combined with leverage (#17/#18), it's a defensible retention mechanic.

### 24. Native mobile app / mobile-first UX
Every strong incumbent is desktop-first. Tankathon and MoneyPuck are responsive; there's no dominant native app.
- **Best in class:** Tankathon is the UX benchmark to beat
- **Build note:** Mobile-first is arguably a bigger differentiator than model quality here.

### 25. Public API / downloadable data
Clean, documented programmatic access to odds.
- **Best in class:** Essentially nobody. BP offers subscriber spreadsheets; Neil Paine publishes Elo archives on GitHub; ESPN data is community-scraped
- **Build note:** Serves the analytics niche and drives inbound citations. PlayoffOdds launches its initial read surface free with attribution; monetization is not assumed.

### 26. Cross-sport unified coverage
All four leagues in one consistent interface.
- **Best in class:** PlayoffStatus and PlayoffPredictors have breadth but not depth; the deep products are single-sport silos
- **Build note:** The core 538-shaped hole in the market.

## G. Supporting Data Features

### 27. Power ratings / team strength ratings
The underlying rating driving everything — Elo, DVOA, FPI, BPI, PECOTA, xG-based.
- **Build note:** Publish it. Transparency is a repeatedly cited differentiator versus black-box "supercomputer" models.

### 28. Strength of remaining schedule
Difficulty of what's left, opponent-adjusted.
- **Best in class:** Tankathon surfaces remaining schedule strength
- **Build note:** Free output of your rating system.

### 29. Draft order / lottery projections
The tanking side of the same coin: live draft order, lottery simulators, pick-odds tables.
- **Best in class:** Tankathon (live order, interactive lottery sim, pick odds, expected pick value); Basketball-Reference and Hockey-Reference also project draft order
- **Build note:** Doubles your audience — every fan is chasing either a playoff spot or a lottery pick, and the same engine serves both ends of the standings.

### 30. Injury / roster awareness
Adjusting projections for who's actually playing.
- **Best in class:** The Athletic's player-based net-rating model; FanGraphs Depth Charts playing-time estimates
- **Build note:** Big accuracy lift, big data cost. Likely a v2 feature.

### 31. Visualization suite
Heatmaps, distribution charts, seeding grids, bracket renderings.
- **Build note:** Community complaints are explicit — independent modelers ship static, ugly Excel screenshots, and bookmaker interfaces are terrible. Design is a real moat here.

---

# Part 2 — Technical Implementation Reference

## 1. The universal architecture

Every serious product in this space is the same three-stage pipeline:

```
[Team strength model] → [Per-game win probability] → [Monte Carlo season simulation] → [Aggregate outcome counts]
```

Simulation mechanics alone are not a differentiator. Team-strength quality, official-rule correctness, reproducibility, historical lineage, conditioning/proof honesty, and presentation all affect trust.

## 2. Simulation counts in the wild

| Product | Sims | Sport |
|---|---|---|
| ZiPS projected standings | 1,000,000 | MLB |
| MoneyPuck | 100,000 | NHL |
| Inpredictable | 50,000 | NBA/NFL |
| FTN / DVOA | 20,000–25,000 | NFL |
| ESPN FPI | 10,000 (NFL), 20,000 (CFB) | NFL |
| FanGraphs | 10,000 | MLB |
| Basketball-Reference | 10,000 | NBA |

**Takeaway:** 10,000 is the accepted floor. Monte Carlo standard error scales as ~1/√N, so 10k gives roughly ±0.5% on a 50% probability — fine for display. Going to 100k buys smoother time-series charts and more reliable tail estimates for rare outcomes.

**Practical note:** the jitter problem is real and underrated. If your odds bounce 2% overnight with no games played, users lose trust in the model. Either run enough sims that noise is invisible, or fix your random seed per snapshot.

## 3. Team strength model options

Roughly ordered by cost to build:

**Elo** — Cheapest, battle-tested, transparent, self-updating. Used by 538 (with a QB adjustment for the NFL) and Neil Paine. Needs only game results and scores. Downside: slow to react to roster changes, ignores underlying performance quality.

**SRS / margin-of-victory ratings** — Simple linear adjustment of point differential for schedule strength. Nearly free if you have scores. Neil Paine uses Elo/SRS.

**Efficiency metrics (EPA-based)** — ESPN's FPI is built on EPA with Bayesian priors; in the NFL only the QB position affects the rating. FPI is expressed as points above or below average, which converts directly to a spread.

**DVOA / DAVE (FTN)** — Play-by-play opponent-adjusted efficiency. FTN's sim is notable for being *dynamic*: it adjusts a team's DAVE rating by ±1.5% per simulated win or loss inside the simulation, so a team on a hot simulated streak gets modestly stronger. A clever, cheap way to model in-season true-talent uncertainty.

**Expected goals / ML win probability (MoneyPuck)** — The most sophisticated public example, and notably not Elo. A gradient-boosted expected-goals model trained on 50,000+ goals and 800,000+ shots, feeding a pre-game win-probability model with three weighted components: scoring chances ~54%, goaltending ~29%, ability to win ~17%. Rebuilt January 2025. Python on AWS.

**Player-level projection aggregation (PECOTA, ZiPS, Depth Charts, The Athletic)** — Project each player, then roll up to team strength via depth charts and playing time. FanGraphs Depth Charts is a 50/50 Steamer/ZiPS blend scaled to playing-time estimates, converted to team runs via BaseRuns. The Athletic's NHL model rolls up player Game Score / net ratings. Highest accuracy, highest data cost, and it requires solving playing-time projection — arguably harder than the talent projection itself.

**Market-blended** — Neil Paine's NBA "Composite Mode" blends his dual-Elo with FanDuel implied odds. Cheap accuracy boost, but it makes you partly derivative of the market rather than an independent voice.

**Generic recommendation:** start with a transparent, measurable model. For PlayoffOdds, SportsCrunch anchors/ratings and captured immutable snapshots are already the decided direction; reconstructed history remains separately labeled.

## 4. Converting ratings to per-game win probability

- **Elo:** `P(A wins) = 1 / (1 + 10^((Elo_B - Elo_A + HFA) / 400))`
- **Points-based (FPI/DVOA/SRS):** compute a projected spread, then map spread → win probability with a logistic or normal CDF calibrated on historical results. Sport-specific σ (NFL ≈13.5 points, NBA ≈11–12).
- **Bradley-Terry / logistic regression:** DRatings uses this family for its Donchess Inference Index.
- **Score simulation:** for NHL and MLB you often need *scores*, not just outcomes, because tiebreakers use goal/run differential.

**Sport-specific gotchas:**
- **NHL:** three-point games. Simulating only W/L breaks the standings entirely. When REG/OT/SO must remain distinguishable for standings, the terminal model has six classes: home/away winner × REG/OT/SO. The loser point and RW/ROW distinctions are load-bearing.
- **MLB:** 162 games; starting-pitcher matchups matter enormously, which is the main reason MLB models use depth charts rather than team-level Elo.
- **NFL:** 17 games means huge variance and the most brutal tiebreaker complexity (strength of victory, strength of schedule, common games).
- **NBA:** the play-in tournament is a separate bracket stage. Basketball-Reference explicitly includes the play-in round in its 10,000 sims.

## 5. Tiebreakers — where competitors are wrong

The single most under-implemented piece, and PlayoffPredictors markets on it precisely because most tools guess.

- Tiebreakers must run **inside** each simulation, not as a post-hoc approximation. You cannot average your way to a correct seed.
- They are **sequential and recursive**: NFL rules cascade (head-to-head → division record → common games → conference record → strength of victory → strength of schedule → …), and multi-team ties reduce to two-team ties once teams are eliminated, which re-triggers the ladder from the top.
- This is usually the **performance bottleneck**, not the game simulation. Precompute head-to-head matrices and common-opponent sets once per snapshot rather than per sim.
- **Verify against historical seasons.** Replay past final standings through your tiebreaker code and assert you reproduce the actual seeding. Cheap test suite, high value, and it doubles as a marketing claim.

## 6. Computing leverage / game importance

Inpredictable's definition: outcome uncertainty combined with how much the playoff picture swings.

1. `P(playoffs | Team A wins game G)`
2. `P(playoffs | Team A loses game G)`
3. **Swing** = difference between the two
4. **Leverage** = swing × outcome uncertainty (e.g. × `2·p·(1−p)`, maximized at a coin-flip game)

**Efficient trick:** you don't need separate runs. Run one batch of sims, tag each sim by the outcome of game G, and partition. A single pass gives you the conditional split for *every* game on tonight's slate simultaneously — and it gives you the rooting guide (#15) for free: partition by any *other* team's game outcome and read off your own team's odds.

## 7. Making the interactive picker fast (the wedge)

The problem: a user toggles a game and needs updated probabilities in under ~200ms. You can't run 100k sims per click.

**(a) Conditional caching / stratified sims.** Run one large batch server-side. Store, per sim, the full outcome vector of remaining games plus the resulting playoff outcome. Filtering gives a fast **conditional Monte Carlo estimate**, not an exact probability; expose branch count/ESS/uncertainty and fall back to direct conditioned simulation when the surviving sample is thin.

**(b) Client-side simulation in JS/WASM.** Ship the win-probability matrix to the browser and run 1,000–5,000 sims locally per interaction. 1k sims gives ±1.5% — visibly noisy but acceptable with display smoothing. Zero server cost, instant feel, works offline. Probably the right answer.

**(c) Hybrid.** Client-side for immediate feedback, then a server request for a high-precision result that swaps in a second later.

For PlayoffOdds, the confirmed engine is a pure shared TypeScript package running in supervised Node and browser workers. Laravel serves only locally published outputs; no simulation or SportsCrunch call runs in a normal request path. A future sidecar/WASM/Rust alternative requires measured justification.

## 8. Data sources

- **ESPN:** no official public API; the analytics community scrapes it via packages like sportsdataverse / cfbfastR. Fragile, free.
- **Neil Paine:** publishes Elo and Estimated RAPTOR archives on GitHub — usable historical training data.
- **Baseball Prospectus:** subscriber-downloadable PECOTA percentile spreadsheets.
- **League APIs:** MLB's stats API and the NHL API are the most accessible of the four; NFL and NBA are harder.
- **Commercial:** Sportradar, Opta — the "license the data and build a sandbox" path the analytics community has openly wished someone would take. Expensive.

Platform-risk lesson worth internalizing: FiveThirtyEight died with Disney's cuts, and numberFire was absorbed into FanDuel Research and shut down. Owning your own pipeline is a strategic position, not just an engineering preference.

## 9. Infrastructure shape

MoneyPuck — a one-person operation — runs Python on AWS and updates many times a day. That's your proof point for scope: this is solo-buildable.

- **Upstream ingest:** SportsCrunch owns schedules/results, anchors and ratings; PlayoffOdds contract-tests and materializes the exact inputs at snapshot assembly.
- **Sim job:** queued supervised TypeScript/Node worker for PlayoffOdds; simulation counts and vectorization strategy are benchmarked on representative bundles.
- **Snapshot store:** retain captured daily outputs and exact canonical input bundles permanently. Retrospective backfill can add useful history only where cutoff inputs/rules/models are reconstructable and clearly labeled.
- **Serving:** Laravel reads precomputed snapshots. No live simulation in the request path.
- **Client:** ship a complete compatible payload: remaining games/timing/site, ratings/state, standings baseline, bracket/PostseasonState, pinned rule artifact and engine-build contract.

## 10. PlayoffOdds build-order application

The generic catalog translates into the evidence-gated roadmap in [`90-build-order.md`](docs/plan/90-build-order.md): contracts and SportsCrunch rules/standings first; an MLB vertical proof then NFL; production immutable snapshot spine; accessible core UI plus a small anonymous API/MCP slice; beta/launch gates; then picker, leverage, NBA, NHL and proof-safe clinch work; hardened push, draft and developer-platform expansion later.
