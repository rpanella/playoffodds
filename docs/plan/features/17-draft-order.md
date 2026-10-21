# Features 17 — Draft Order and Lottery Odds

**Status: DRAFT v3 (2026-10-21).** Later feature. Order: NBA and NHL first, NFL when validated, MLB only when its lottery eligibility rules are fully modeled (D27, D36).

## 1. Approach

Draft position comes from the same simulated season as the playoff odds. In each simulated world:

1. finish the regular season and playoffs;
2. determine lottery-eligible teams and draft order under that league's era rules;
3. run the lottery draws without replacement, with that world's own random substream;
4. record every team's pick.

Lottery odds can't be computed per team independently, because the draws are shared and later picks depend on earlier ones, ties split lottery combinations, and NFL order depends on playoff results. Running the whole procedure inside each world handles all of this.

## 2. League notes

Verify current official procedures before building.

- **NBA:** non-playoff teams (after the play-in) enter the lottery; the top picks are drawn; tied teams split combinations; the rest go in reverse standings order.
- **NHL:** non-playoff teams; a small number of draws with limits on how far a team can move and how often it can win; the rest in reverse order.
- **NFL:** no lottery. Non-playoff teams pick in reverse record order; playoff teams pick in order of elimination round, then record. Its own draft tiebreakers (strength of schedule) apply.
- **MLB:** a lottery with eligibility restrictions (for example revenue-sharing status and repeat-lottery limits). Don't ship until every restriction is sourced and modeled. A footnote is not enough.

## 3. Rules and data

- **Draft rules** are era-versioned modules with cited `.md` sources and fixtures, like standings rules ([04](../04-standings-tiebreakers.md)). They can live in the standings package or alongside it.
- **Team-state inputs** (such as MLB revenue-sharing status or past lottery wins) are explicit inputs with a source.
- **Pick trades and protections are not modeled.** Pages say "own pick" to make that clear.

## 4. Surfaces

- `/nba/draft`: a team × pick probability table, expected pick, and the chance of a top-4 pick.
- A module on the team page: the team's own pick odds.
- A "simulate the lottery" button that shows one random draw, labeled as one possible outcome.
- Two modes, always labeled: **season forecast** (simulate the rest of the season, then the lottery) and **if the season ended today** (freeze current standings, then simulate only the lottery).

## 5. Validation

- Small synthetic lotteries are checked against exact enumerated probabilities.
- Past seasons' published lottery odds tables are reproduced for the "if season ended" mode.
- Every world assigns each pick exactly once.
