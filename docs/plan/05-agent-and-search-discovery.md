# 05 — Agent and Search Discovery Contract

**Status: DRAFT v2 (2026-07-22) — product requirements stable; crawler/vendor/package specifics require Phase 0 and pre-launch verification.**

Goal: when a person or agent asks for current playoff odds, PlayoffOdds can be discovered, fetched, understood, and cited with the exact snapshot lineage. Discovery pages, anonymous API and MCP are one product surface over stable local DTOs—not separate interpretations of the data.

## 1. Principles

1. **Answer-first resilient HTML.** A team/league page includes its primary odds, exact `as_of`, mode, reconstruction status and canonical link as semantic server-rendered text/table. JavaScript adds interaction; it is not required to discover the answer.
2. **Fresh but reproducible.** `current` canonical pages point to the atomic local snapshot pointer. Immutable snapshot/archive URLs remain citable and identify rules/model/input lineage.
3. **One DTO meaning.** HTML, API and MCP agree on identifiers, decimal units, snapshot/spine/intraday semantics, warnings and correction state.
4. **Zero-friction core reads.** The small Phase 3/4 anonymous API/MCP slice does not require an account. Abuse is controlled with caching, rate/concurrency limits and bounded inputs.
5. **No citation theater.** A generic attribution object is not sufficient. Search/fetch results carry a non-empty canonical HTTPS URL in the representation expected by the verified target client, plus structured human-readable content.
6. **Verify fast-moving details.** Bot names, user agents, directory processes, MCP/OpenAI package behavior, crawler rendering and framework versions are rechecked against primary vendor/spec sources in Phase 0, before launch and quarterly. This plan does not promise future vendor behavior.

## 2. Crawlable page contract

Every indexable current team/league page has:

- a stable canonical URL independent of snapshot internals;
- a first-screen sentence/table answer containing team/league, metric, percentage, exact `as_of`, and current/reconstruction warning when material;
- visible link to an immutable snapshot or date-resolved archive and methodology/model lineage;
- useful navigation, table headers/captions and status without JavaScript;
- accurate `dateModified`, canonical metadata, title/H1, sitemap entry and structured data only where supported and truthful;
- correction/retraction link when the current result supersedes a materially wrong published revision; and
- cache/SSR behavior keyed by pointer/snapshot version so stale HTML cannot claim a newer timestamp.

Team pages use `/{league}/{team-slug}`. Archive query/route semantics follow doc 02/features/11 and reveal requested versus resolved spine date. Immutable snapshot IDs are available through API/MCP even if the primary browser route remains friendly.

SSR operational requirements—supervised Node process if used, coupled deploy/build, health/restart/logs/metrics/rollback and no-JS tests—are in doc 06. If SSR fails, the service must prefer last-good semantic HTML or an explicit unavailable state, not a blank hydrated shell.

## 3. Crawler and robots policy

Crawler discovery and model training are separate owner choices (O2):

| Purpose | Example policy decision | Proposed posture |
|---|---|---|
| Search/discovery/citation | `OAI-SearchBot` and equivalent verified search agents | Allow, subject to abuse/cost controls. |
| User-triggered fetch | verified user/agent fetchers | Allow public pages/API within limits. |
| Model training | `GPTBot` and other training crawlers | Separate owner decision; do not infer from discovery permission. |
| Conventional search | major search crawlers | Allow indexable public pages. |
| Unknown/high-cost automation | unverified bot traffic | Rate-limit/challenge/block based on behavior without breaking recorded verified-bot policy. |

Phase 3 produces a checked-in policy matrix mapping verified current user agents/purposes to robots, CDN/WAF and rate-limit behavior. Pre-launch tests fetch representative pages from outside the origin path and verify status, HTML answer, cache, robots and no challenge for allowed agents. Managed CDN robots/bot defaults must not contradict the repository policy.

No directive is added merely because it sounds agent-friendly. Sitemap/`lastmod`, IndexNow/search registrations, structured data, markdown mirrors, `llms.txt` or emerging discovery files ship only when truthful, low-risk and verified useful; none substitutes for accessible HTML and stable API/MCP contracts.

## 4. Small anonymous API slice

By Phase 3 or the Phase 4 launch gate (D38), expose stable versioned GET DTOs for:

- leagues and teams discovery;
- current odds/standings and seed distribution;
- immutable snapshot fetch;
- basic spine series/history.

Exact endpoints and full contract are in features/16. All reads use local published data, carry a non-empty canonical page URL and snapshot/rules/model lineage, and use decimal probabilities in `[0,1]`. Open CORS is limited to public GETs. Errors are structured and agent-legible; 429 includes `Retry-After`. API docs/OpenAPI are generated/tested from the same contract and identify anonymous limits.

## 5. MCP search/fetch compatibility contract

Phase 0 verifies the current MCP/client specification and official package. The launch slice must nevertheless satisfy these observable semantics.

### `search`

Input: a bounded non-empty text query plus optional league/team/season filters and page cursor. It searches only published PlayoffOdds resources and returns an ordered result list. Every result contains:

- stable resource/result ID;
- concise title;
- **non-empty absolute canonical HTTPS `url`** to the matching public PlayoffOdds page/resource;
- short answer/snippet with `as_of` when the result includes odds;
- structured metadata: resource type, league/team IDs, snapshot ID, mode, reconstruction/correction warning; and
- next-page cursor when more results exist.

It never returns a search-results URL as the canonical team/league citation and never fabricates a current result if no published snapshot exists.

### `fetch`

Input: exactly one stable result/resource ID or previously returned canonical PlayoffOdds URL. URLs are normalized and restricted to the owned canonical domain/resources; arbitrary web fetch is rejected.

Successful output contains both:

- MCP text content suitable for direct quotation/summarization (title, plain-language answer, exact `as_of`, units, warnings, methodology/lineage links); and
- `structuredContent` using the same versioned public DTO fields.

The result itself and any resource/link content field required by the verified client carry the same **non-empty canonical HTTPS `url`**. Snapshot ID, rules/model versions, mode, captured/reconstructed status and correction links remain present. An embedded `attribution` object may also exist for terms, but it is not the citation mechanism by itself.

Unknown/withdrawn IDs, invalid URLs, unavailable current data and rate limits return typed errors with recovery guidance; no empty URL or success-with-empty-content response. Search followed by fetch is covered by end-to-end compatibility tests against each targeted client. Exact tool annotations/names/transports follow the then-current verified standard/package; read-only semantics and bounded inputs are mandatory.

## 6. MCP/API content quality

- Percentages are delivered as decimal fields plus formatted explanatory text; no ambiguity between `0.529` and `52.9%`.
- “Current” includes exact pointed snapshot; historical responses state spine/intraday and requested/resolved cutoff semantics.
- Probabilistic estimates never say “clinched.” Proven/unknown status is separate.
- Retrospective reconstruction is named in the answer when applicable.
- Canonical URLs identify the matching league/team/snapshot context, not a generic homepage.
- Responses stay compact: core answer first, then lineage/warnings; callers can follow model/rules links for detail.

## 7. Discovery content and measurement

The methodology/model page publishes model purpose, calibration/proper-score/coverage evidence, known limitations, rule parity/replay evidence, historical reconstruction policy, change log and a copyable citation format after O3. Rule pages render cited human artifacts or approved summaries without excessive copying.

Measure: allowed crawler fetch success and freshness; search referrals/citations where observable; API/MCP search→fetch success, error/rate-limit and canonical URL presence; agent-generated referral/citation samples; page no-JS answer availability. User-agent traffic is security/privacy-minimized under doc 06/O5.

Success means agents retrieve the correct current or immutable resource and preserve its URL/lineage—not merely that a bot hit robots.txt.

## 8. Security, privacy, and legal boundaries

- MCP/API are read-only over published PlayoffOdds outputs; they do not proxy raw SportsCrunch lines/inputs or expose private operational traces.
- Enforce query length, filter enums, page size, cursor integrity, response size, rate/concurrency/global budgets and cache isolation.
- Do not log full prompts, scenario encodings, API keys or personal identifiers by default.
- Attribution/license wording awaits O3 and upstream/mark review. Discovery permission does not grant data redistribution rights beyond published terms.
- Directory/registry submissions, paid marketplace listings and training access are optional distribution decisions; they do not block direct URL/MCP/API usefulness.

## 9. Phase gates

- **Phase 0:** verify target crawler/client/package behavior and exact MCP search/fetch schema; freeze stable DTO/canonical URL rules; prototype SSR/no-JS answer; create O2 matrix draft.
- **Phase 3:** current pages, small anonymous API and basic MCP search/fetch pass DTO, URL, lineage, error, caching, no-JS, accessibility and abuse tests in staging.
- **Phase 4:** external crawl/WAF/CDN verification, O2 owner choice, legal/attribution readiness, search registrations where useful, and measurement baseline before public launch.
- **Phase 6:** keys, bulk downloads, more resources/tools, registry/directory submissions and complete developer docs expand the surface without breaking v1.

Quarterly verification records source/date, observed change, affected contract/test and any migration. A vendor change can disable a listing/integration, but stable HTML/API resources remain the fallback.
