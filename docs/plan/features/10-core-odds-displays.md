# Features 10 — Core Odds Displays

**Status: DRAFT v3 (2026-10-21).** Launch scope (M2). Every page reads the current snapshot from local tables ([02](../02-simulation-outputs.md) §6). None calls SportsCrunch or runs a simulation.

## 1. Routes

| Route | Content |
|---|---|
| `/` | Leagues with live odds, the biggest movers since yesterday, and links |
| `/nfl` | League odds table |
| `/nfl/seeds` | Seed probability matrix |
| `/nfl/{team-slug}` | Team page |
| `/methodology` | How it works, limitations, versions |

Other leagues reuse the same routes with their own code (`/nba`, `/nhl`, `/mlb`) once live.

## 2. League odds table (`/nfl`)

One row per team, grouped by conference and division, with a toggle to sort by playoff probability. Columns:

- record (W-L-T) and "if season ended" seed, labeled as such;
- projected wins (mean, with the 10th–90th percentile range in details);
- make playoffs, win division, top seed (bye), make the Super Bowl, win the Super Bowl;
- 1-day and 7-day change in playoff odds;
- clinch or elimination status from our clinch check, or official where the league announced first (D50).

On phones, show a compact table (team, record, playoffs %, champion %) with the other columns behind a row expander or horizontal scroll inside the table. Keep a real `<table>` with headers.

## 3. Seed matrix (`/nfl/seeds`)

Rows are teams and columns are seeds 1–7 plus "miss". Each cell is a probability, with cell shading as a supplement to the printed number, not a replacement. Each row sums to 100% within rounding. The header row stays visible while scrolling.

## 4. Team page

1. Team name, record, "if season ended" seed, and the answer sentence ([05](../05-agent-and-search-discovery.md) §1).
2. Odds summary: playoffs, division, top seed, each round, championship, and the change since yesterday.
3. History chart ([features/11](11-history-timeseries.md)).
4. Projected wins distribution (small bar chart plus the numbers).
5. Remaining schedule with each game's win probability (marked *projected* when it comes from the model rather than a market line).
6. Link to the methodology page.

Picker, leverage and draft modules come later.

## 5. Number formatting and honesty

- Show one decimal place. Values that round to 0 or 100 show as "<0.1%" or ">99.9%".
- A simulated 100% is never shown as "clinched". "Clinched" or "eliminated" appear only from our clinch check or an official marker ([features/14](14-clinch-magic-elimination.md) §7), and the two are labeled differently. "Controls own destiny" appears on the team page when proven.
- Unresolved ties in "if season ended" standings show as "tied".
- Every page shows "Updated {as_of}" in the league's timezone, plus a stale banner when the data is old.
- Status and changes use text or icons as well as color (for example ▲ 4.1, not only green text).

## 6. Methodology page (`/methodology`)

- Explain in plain language:
  - where game probabilities come from (sportsbook consensus, SportsCrunch's model for games without lines);
  - how a season is simulated, including in-season rating drift;
  - how tiebreakers are applied, with links to the cited rule summaries.
- Simulation count, engine version and rules version of the current snapshot.
- Known limitations ([01](../01-simulation-engine.md) §8).
- What "reconstructed" history means.
- Later: backtest and calibration results.

## 7. Done when

- Pages render the current snapshot correctly at desktop and phone widths.
- The answer and tables are present without JavaScript.
- Formatting rules hold in tests: no "clinched" from probabilities; correct "<0.1%" and ">99.9%" edges.
- Numbers match the database rows for the snapshot shown.
