# Features 13 — Leverage, Tonight, and Rooting Guides

**Status: DRAFT v3 (2026-10-21).** Later feature. All values are simulation estimates.

## 1. What it shows

For a team **T** and an upcoming game **G**, the key numbers are T's playoff odds if each side of G wins:

> "Bills playoff odds: 61.3% if the Jets win vs 55.1% if the Dolphins win."

- **Swing** is the difference between those two numbers.
- **Leverage** for ranking combines the swing with how uncertain the game is, for example `swing × 2·p·(1−p)` for a two-outcome game. The index is used only to rank; pages show the conditional numbers.

## 2. How to compute it

There's no need for extra simulation runs. During the normal snapshot run, the engine can accumulate conditional counts for games in the next few days: for each game × outcome × team, count playoff appearances (and other headline outcomes) in the worlds where that outcome happened. This gives every game's split for every team in one pass, without storing per-sim results.

Store the results in a `game_conditionals` table per snapshot with the counts, so pages can show sample sizes and hide noisy rows.

## 3. Surfaces

- **`/nfl/tonight`, or "this week" for the NFL:** upcoming games ranked by league-wide leverage. Each card shows the most affected teams and their conditional odds.
- **Team rooting guide:** the team's own game first, then other games by how much they matter to this team, with "root for X".
- **Schedule badges:** high, medium or low stakes on the team's upcoming games.
- **"Best case this week" link:** opens the picker with the favorable outcomes as one joint scenario.

## 4. Rules

- **Swings are not additive.** "Everything goes right" is a joint scenario computed by the picker, never a sum of individual swings.
- **Hide noisy rows.** Rows where one outcome has too few matching sims are hidden.
- **No clinch claims.** A conditional 100% is not "clinches"; that needs a proof ([features/14](14-clinch-magic-elimination.md)).
- **Multi-outcome games.** For NHL (and NFL ties), outcomes have more than two classes. Keep them separate, for example "needs a regulation loss", or pool them with a stated rule.
- **Live in-game odds** are deferred until a live win-probability feed exists. The approach would be interpolating between the two pregame branches.
