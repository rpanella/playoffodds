# Features 16 — Public API

**Status: DRAFT v3 (2026-10-21).** A small read-only API is an M4 fast-follow (D49), free with attribution (D26). Keys, bulk downloads and more resources come later.

## 1. Principles

- Serve PlayoffOdds outputs from published local snapshots only: no SportsCrunch calls, no simulations, no raw sportsbook lines.
- Use the same IDs, numbers and `as_of` as the pages; the MCP server ([05](../05-agent-and-search-discovery.md) §3) wraps these same responses.
- Write API responses as explicit resource classes, so database changes don't silently change the API.

## 2. Endpoints (v1)

Base path `/api/v1`. All endpoints are `GET`, anonymous, with CORS open.

| Endpoint | Returns |
|---|---|
| `/leagues` | Leagues and seasons with data available |
| `/{league}/teams` | Teams with conference, division, slug, page URL |
| `/{league}/odds` | Current odds for every team (playoffs, division, top seed, rounds, champion, projected wins) |
| `/{league}/teams/{team}` | One team's odds, record, seed distribution and remaining schedule |
| `/{league}/teams/{team}/history` | Daily series for the season, each point with `origin` (live/reconstructed) |
| `/snapshots/{id}` | One snapshot's metadata and its odds (immutable) |

`?date=YYYY-MM-DD` on `odds` and team endpoints returns the daily point for that date. The response states both the requested and the resolved date.

## 3. Response shape

```json
{
  "data": { "team": "nfl-buf", "p_playoffs": 0.874, "p_playoffs_text": "87.4%" },
  "snapshot": { "id": "01JBQ7…", "as_of": "2026-11-03T14:00:00Z", "origin": "live",
                "sims": 100000, "engine_version": "0.3.0+a1b2c3d", "rules_id": "nfl@2020" },
  "url": "https://playoffodds.com/nfl/buffalo-bills",
  "attribution": "PlayoffOdds (playoffodds.com)"
}
```

- Probabilities are decimals in [0, 1], with optional formatted text alongside.
- Every response has a canonical page `url`.
- Probability and clinch status are separate fields. The status says whether it came from our check or an official source, and `p_playoffs: 1` never implies clinched.
- **Errors** use one JSON shape: status, code, message, plus `Retry-After` on 429. The cases are an unknown league or team (404), a bad date (422), no data yet (503) and rate limited (429).

## 4. Caching and limits

- `/snapshots/{id}` is immutable and gets long cache headers and an ETag.
- Current endpoints get a short cache with an ETag based on the snapshot ID.
- Rate limit per IP, starting around 30 requests per minute, adjusted from real traffic.

## 5. Later

- API keys for higher limits (accounts-lite, D25).
- Bulk CSV per season.
- Leverage, clinch-proof and draft resources.
- OpenAPI docs.
- A deprecation policy (old O6).
- The exact license and attribution wording (O3) must be settled before announcing the API publicly.
