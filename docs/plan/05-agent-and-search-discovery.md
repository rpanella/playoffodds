# 05 — Search and Agent Discovery

**Status: DRAFT v3 (2026-10-21).** Pages are launch scope; the API and MCP are the M4 fast-follow (D49). Bot names and vendor requirements change often, so verify them at launch and again when building the MCP server.

**Goal:** when a person or an AI agent asks "what are the Bills' playoff odds?", PlayoffOdds is easy to find, fetch, understand and cite.

## 1. Pages that answer the question (launch)

Every league and team page puts the answer in the server-rendered HTML, not only after JavaScript runs:

- A title and H1 such as "Buffalo Bills Playoff Odds 2026".
- An answer sentence near the top: "The Bills have an 87.4% chance to make the playoffs (as of Nov 3, 2026, 9:00 AM ET), including 61.0% to win the AFC East and 12.0% to win the Super Bowl."
- The odds table as a real `<table>` with headers.
- A link to the methodology page.
- A canonical URL (`/nfl/buffalo-bills`), an accurate `dateModified`, and a sitemap entry.

How the HTML is produced without JavaScript (Inertia SSR or another approach within D37) is open question **O8**, decided in M2. Whichever approach is chosen, the answer and table must be present when fetching a page with JavaScript disabled. Test this.

## 2. Crawler policy (launch)

| Bots | Policy |
|---|---|
| Search engines (Googlebot, Bingbot) | Allow |
| AI search/citation and user-triggered fetchers (e.g. `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`) | Allow |
| AI training crawlers (e.g. `GPTBot`, `ClaudeBot`, `Google-Extended`) | Owner decision **O2** |
| Unknown aggressive bots | Rate-limit |

- **Cloudflare blocks AI bots by default on new zones** (found in the July research). If the site is behind Cloudflare, check the AI-bot and managed-robots settings so they match this table.
- At launch, fetch a few pages as these user agents from outside the network and confirm they get the HTML answer, not a challenge page.
- `llms.txt` is cheap and optional. Add it if it's easy, but it is not a substitute for good HTML.

## 3. JSON API and MCP (M4)

- **JSON API:** a small read-only API over the same snapshot data as the pages ([features/16](features/16-public-api.md)). Every response includes the canonical page URL, `as_of` and snapshot ID.
- **MCP server:** built with `laravel/mcp`, exposing `search` (find a league or team) and `fetch` (get its current odds).
  - Results include a plain-text answer with `as_of`, structured data using the API's fields, and a non-empty canonical URL to cite.
  - It is read-only, with bounded inputs and rate limits.
  - When building it, verify the current requirements of the main clients (for example ChatGPT connectors' search/fetch tool shape).
  - Listing in the MCP Registry and other directories comes after it works.

## 4. Content rules for agents

- Probabilities are decimals in the API (`0.874`) with a formatted string alongside (`"87.4%"`).
- Always include `as_of`. Never say "clinched" for a simulated result. Clinch status is a separate field from our clinch check or an official source (D50).
- Reconstructed history is labeled as such.
- Canonical URLs point to the specific league or team page, not the home page.

## 5. Later

- Structured data (schema.org) where it is truthful and supported.
- IndexNow or search-console registrations.
- A methodology page with backtest results once the calibration pass is done.
- Measure crawler hits, referrals from AI products, and API/MCP usage.
- Re-check bot names and client requirements every few months.
