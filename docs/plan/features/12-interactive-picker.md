# Features 12 — Interactive Picker (The Wedge)

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc features #12, #13, #14. Proposed resolution to Q18 in §7.

Pick winners of remaining games and watch **probabilities** — not just brackets — recalculate live. Incumbents are probabilistic *or* interactive; nobody is both. Enabled by D4 (shared TS engine in the browser) and D17 (server outcome matrices for exact conditionals).

---

## 1. Hybrid computation model

Two answers to every interaction, layered:

1. **Instant (client):** the browser runs the engine (Web Worker, never the UI thread) on the client payload (doc 02 §6). Pins are forced outcomes — **with dynamic rating updates still applied** (doc 01 §2), so pinning a big upset correctly strengthens that team downstream; this alone beats every deterministic picker on the market. Time-sliced: ~2k sims render immediately (<200ms budget), extended to 5k during idle (per-sim seed streams, doc 01 §4, make extension additive — sims 0–1999 don't rerun).
2. **Precise (server, ~1s later):** debounced (500ms after the last toggle) `POST /api/site/{league}/scenario {pins}` filters the 100k-sim outcome matrix to worlds matching every pin and recomputes aggregates over survivors — **exact** conditional odds. Response includes `survivors`; below ~2k the server result is suppressed and the client result stands (the sample-collapse rule, doc 02 §5: 10+ pins ⇒ ~100k/2¹⁰ ≈ 98 survivors — not enough). Responses cache by `(snapshot_id, pins_hash)` — popular shared scenarios become cache hits.

**Jitter control:** the client seed is fixed per (snapshot, session), so toggling a pick off returns *exactly* the prior numbers — re-running the same scenario never shows different odds. When the precise result lands it swaps in with a subtle indicator ("±exact"); client-vs-server discrepancies are invisible in practice (2k sims ⇒ ±1%; display rounds to whole percents inside the picker context).

## 2. UX specification

- **Slate navigation:** NFL by week; daily leagues by date with a week-strip scroller. Each game row: teams, anchored win prob, three-state toggle (home / away / unpicked). NFL ties are not pickable (rate ~0.4%; the sim still produces them unpinned).
- **Two result modes**, switchable: **My Team panel** (choose a team → hero card with playoffs/division/seed odds recalculating per pick, plus its seed-distribution strip) and **League table mode** (the doc-10 odds table, live-updating — "what does this Sunday do to the whole conference").
- **"What do we need" mode:** pick a target team → the slate re-sorts by that team's |swing| per game (from `game_conditionals`), highest-impact first, with root-for arrows pre-marked. One tap ("show me the path") pins the favorable outcome of the top N games — turning the leverage data (features/13) into an interactive story.
- **Live deterministic flags:** after each recompute, the deterministic engine (doc 04, same package) checks the pinned scenario — if the pins alone clinch or eliminate, the panel states it outright: "**Clinched** with these results" (100% earned, per the doc-10 honesty rule).
- **Quick actions:** reset; undo; "chalk" (pin all favorites); "coin-flips only" (pin favorites in games with p > 65%, leave the rest live — the interesting middle).
- **Stale-pin handling:** on snapshot rollover, pins on now-final games auto-resolve — matching picks absorb silently; contradicted picks surface a banner ("2 of your picks went the other way") with one-tap clear. Shared links referencing decided games get the same treatment.

## 3. Scenario links (#14) — the viral loop

- **Encoding:** stable game IDs (not snapshot-relative indices), sorted, delta-encoded varints + outcome bit, base64url — `?s=<blob>` plus league. ~2 chars/pick; even a 50-pin scenario is a short URL. Decoding tolerates unknown/finished game ids (see stale handling).
- **Semantics:** a shared link applies the pins to the **current** snapshot — the viewer sees *today's* odds given those results, not a frozen screenshot. That's deliberate: "here's how the Niners get the 1 seed" stays alive as the season moves, and the page says "as of {date}" like every other page.
- **Scenario OG cards:** server renders the share image from the matrix-filter result — "If these 6 games go this way → Vikings 84%" with the pin list. Cached by pins-hash; this is the screenshot people post.

## 4. Performance budgets & benchmarks

| Metric | Budget |
|---|---|
| Toggle → client numbers | < 200 ms end-to-end on a mid-range phone (2k sims incl. tiebreaks) |
| Payload | < 100 KB gz (doc 02 §6; MLB is the stress case) |
| Precise endpoint p95 | < 500 ms (bit-plane filter + aggregate over survivors) |
| Worker memory | < 50 MB |

MLB is the risk (2,430-game seasons client-side): the Phase 5 benchmark gate runs the worker on a mid-range Android profile; if 2k sims misses 200ms, first lever is 1k sims + earlier server assist, second is pruning decided-race teams from tiebreak work. NFL (272 games) will be comfortably fast.

## 5. NHL nuance (v1.1)

Winner-only picks in v1 (the OT/SO split rides the model). v1.1 adds the **loser-point option** — "OT loss" as a pickable third state — because in real NHL races "we need Boston to lose *in regulation*" is exactly what fans track; the five-outcome engine (D13) already supports forcing outcome classes, so this is UI + encoding (2 bits/pick) only.

## 6. Cross-links

"What do we need" consumes features/13's conditionals; rooting-guide pages deep-link *into* the picker with pins preloaded ("best case tonight →"). Clinch scenarios (features/14) link to the picker with the clinching combination pinned. The picker is the hub the daily features feed.

## 7. PROPOSED resolutions

| Q | Proposal | Rationale |
|---|---|---|
| Q18 (share links) | **URL-only encoding at launch** (§3); no short-link service, no DB state | ~2 chars/pick keeps real scenarios short; zero infrastructure; add short-links later only if platform URL-length limits actually bite |
| (outline) client sim count vs jitter | Fixed per-(snapshot, session) seed + 2k→5k idle extension + whole-percent display in picker context (§1) | Determinism beats smoothing: identical scenario ⇒ identical numbers, every time |

## 8. Launch scope (Phase 5, PROPOSED)

v1: winner-only pins, single league at a time, both result modes, "what do we need," quick actions, share links + scenario OG cards, stale-pin handling. v1.1: NHL loser-point picks, cross-league moved-odds notifications tie-in (features/15).
