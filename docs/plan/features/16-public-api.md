# Features 16 — Public API & Data Downloads

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc feature #25. Essentially nobody offers clean programmatic playoff-odds access; this serves the analytics niche, drives inbound citations (the currency that made 538 famous), and is the second revenue line (Q14).

---

## 1. Surface — a 1:1 mirror of the site's internal resources

The site API resources (docs 10–13 §data) were designed public-shaped on purpose; the public API republishes them under `/api/public/v1` with keys and documented stability guarantees. No new computation — every endpoint is a cached read of the snapshot store.

| Endpoint | Returns |
|---|---|
| `GET /v1/{league}/odds` (`?date=`, `?season=`) | The full `team_odds` row set for the (spine) snapshot — current by default, any archive date via the same semantics as the site's date selector (features/11 §2) |
| `GET /v1/{league}/teams/{team}/series?metric=&season=` | Time series across spine snapshots |
| `GET /v1/{league}/seeds` (`?date=`) | Seeding probability matrix |
| `GET /v1/{league}/tonight` | The leverage slate (features/13) — the feed writers cite on deadline day |
| `GET /v1/{league}/snapshots` | Snapshot index (instants, class, backfilled flag, engine/rules versions) — provenance is part of the product |
| `GET /v1/leagues`, `/v1/{league}/teams` | Discovery/metadata |

Response envelope mirrors the site's; every payload carries `snapshot` metadata (instant, versions, `backfilled`) so citations are pinned to a reproducible artifact.

## 2. Bulk downloads — the citation engine

Per league-season CSV (one row per spine snapshot × team, all `team_odds` columns), regenerated nightly for the active season, frozen for completed ones; the Neil-Paine-archive pattern that earns goodwill and backlinks. Parquet variants later if demand appears. Linked from `/model` and the API docs; each file embeds a header row comment with license + citation format + generation date.

## 3. Keys, tiers, limits

- **Anonymous GET tier (amended 2026-07-16 by doc 05 §2):** core read endpoints (current odds, series, seeds, tonight) require **no key** — generous per-IP limits, open CORS, agent-legible 429s (`Retry-After` + JSON body explaining how to get a key). Agents fetching mid-conversation must never hit a signup wall.
- **Accounts-lite keys = the upgrade, not the gate:** email → verification → API key (no profile, no password if magic-link) for higher limits + bulk downloads. This is the identity model features/15 §3 deferred to — notifications stay account-free; keys need a mailbox.
- **Key tier (free):** 60 req/min, 20k req/day, attribution required (§5). Generous on purpose — adoption and citations are the launch-phase currency. Paid tiers (higher limits, SLA, commercial use) are a Q14 decision for later; the key infrastructure doesn't change.
- **Attribution objects (doc 05 §2.3):** every response embeds `attribution: { name, url: <canonical page deep link>, terms }` — the documented mechanism by which agent platforms generate citations.
- **MCP server (doc 05 §3):** ships alongside this API as a first-class deliverable — no-auth read-only tools over the same resources, plus the ChatGPT `search`/`fetch` contract.
- Standard hygiene: `429` with `Retry-After`, per-key metrics, key revocation, status page note in the docs.

## 4. Caching & stability

Snapshots are immutable ⇒ aggressive HTTP caching (`ETag` + long `max-age` on `?date=` responses; short `max-age` on "current"). Versioning: `/v1` frozen at launch semantics; additive changes only; breaking changes = `/v2`. OpenAPI spec published at `/api/public/docs` with a changelog. Deprecation policy stated up front (12 months notice) — stability *is* the product for this audience.

## 5. License, attribution, boundary (PROPOSED)

- **License:** free-with-attribution for odds outputs and CSVs (CC BY 4.0 or equivalent terms-of-use). Attribution format published ("Playoff odds via {SiteName}, {url}, retrieved {date}") with stable permalinks (`?date=` URLs) as the citable unit. → **Q20, owner call** (bundled with Q14 monetization posture).
- **Hard boundary:** the public API serves **PlayoffOdds outputs only** — odds, seeds, leverage, series. It never proxies SportsCrunch's raw inputs (lines, schedules-with-odds, ratings beyond the published transparency values). Positioning (our product is the odds) and licensing prudence (sportsbook-derived data has its own norms) both point the same way.

## 6. Launch scope (PROPOSED)

Phase 6 per build order, but sequenced cheap-first: the read endpoints are config + keys on top of existing resources (small), CSVs are a nightly job (small), docs page (moderate). Early-ship candidate if post-launch capacity allows — inbound citations compound, so earlier is strictly better. Prerequisite: Q12 (name/domain) resolved — you can't publish attribution guidelines for an unnamed site.
