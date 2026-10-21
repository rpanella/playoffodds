# Features 11 — History Charts and Movement

**Status: DRAFT v3 (2026-10-21).** Launch scope: one chart on each team page, plus movement numbers. More chart types come later.

## 1. Data

- A series is one point per league-local day: the team's value from the last published, non-superseded snapshot that day ([02](../02-simulation-outputs.md) §5).
- Each point carries its snapshot ID, `as_of` and `origin` (`live` or `reconstructed`).
- Points before the pipeline went live are `reconstructed` (backfilled in M1).

## 2. Team chart (launch)

- **Line chart** of playoff probability over the season, with a fixed 0–100% axis and dates (or NFL weeks) on the x-axis.
- **Optional toggles:** division and Super Bowl odds.
- **Game markers:** each of the team's games marked (W/L/T), so jumps line up with results.
- **Reconstructed points:** the reconstructed portion is visually distinct (for example a dashed line) and noted in the caption ("Before Nov 10: reconstructed from historical lines").
- **Readout:** tapping or focusing a point shows the date, value and result. Never rely on hover only.
- **Data table:** a "Show data" table below the chart lists date, value and origin. It doubles as the no-JavaScript fallback.

Pick a lightweight chart library during M2 that works with Vue and supports keyboard and touch.

## 3. Movement

- 1-day and 7-day change compare current with the daily point 1 or 7 days earlier.
- Show both endpoints and the change: "62.0% → 34.0% (▼ 28.0)".
- The home page "biggest movers" list ranks by the absolute 1-day change in playoff odds.

## 4. Archive (later)

- Odds as of a past date (`?date=YYYY-MM-DD`): use the latest daily point on or before that date, and state both the requested and resolved date.
- League-wide charts (all teams in a division), multi-season views and annotations for notable events.

## 5. Done when

- Each team page's chart shows the full 2026 season with live and reconstructed portions clearly distinguished.
- The data table matches the chart.
- The chart is usable on a phone and by keyboard.
