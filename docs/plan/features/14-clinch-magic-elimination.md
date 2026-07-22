# Features 14 — Clinch, Magic Numbers & Elimination

**Status: DRAFT v1 (2026-07-16) — detail pass complete, pending owner review.** Covers reference-doc features #19, #20, #21 (#22 tiebreaker correctness lives in doc 04). The deterministic layer, fused with probability — "magic number 6, and 87% to get there by Sep 22" — a combination almost nobody ships.

All deterministic answers come from the doc 04 engine in deterministic mode (real results only, tiebreaker-exact, era rules). Probabilistic companions come from the outcome matrices (doc 02 §5). Nothing here has its own model.

---

## 1. Clinch/elimination flags (the foundation)

Computed at every snapshot per team per target — playoffs, division, bye/top-seed, each seed threshold, and eliminated-from each: written to `team_odds` status columns (doc 02 §4.1), rendered as the classic `x/y/z/e` badges (doc 10 §2), and gating the 100%/0% display honesty rule.

**Method — tiered, cheapest first:**
1. **Sim screening:** if any of 100k sims has the team missing the target, it is not clinched (and vice versa for elimination). Screens out ~all cases instantly; a target with 100k/100k sims is a *candidate* clinch, never a verdict (100k sims ≠ proof).
2. **Arithmetic bounds:** pessimistic/optimistic record bounds (team's floor vs rivals' ceilings, tiebreaks assumed lost / won respectively). Conclusive for most candidates.
3. **Exact adversarial check:** only for candidates the bounds can't settle — search over remaining relevant games' outcomes for any world where the target fails, with pruning (relevant games only: those involving teams whose ceiling/floor crosses the subject's bound — late-season this is a handful; mid-season step 2 always settles it). Deterministic engine evaluates leaf standings. If the search space exceeds a budget (~2²⁰ leaves after pruning), report "not yet decidable" and keep the probabilistic display — with a logged counter (expected ~never; the budget exists so the pipeline can't hang).

Flags must match the leagues' official clinch announcements — a parity check worth automating: when a league publishes x/y/z updates, any mismatch is a P1 bug (or a rules-file error). Forfeits/suspended games follow the era rule files.

## 2. Magic & tragic numbers (#20), fused with probability

- **Definition (exact, tiebreak-aware):** magic number M for target = the smallest M such that *any* combination of team wins + key-rival losses summing to M guarantees the target under **pessimistic tiebreaks**. Computed from the arithmetic-bounds machinery (§1.2). Where optimistic tiebreaks would clinch earlier, the UI notes "could clinch sooner via tiebreakers" — honest about the band instead of pretending one number.
- **Fusion:** next to every magic number, the probabilistic ETA from the sims: **P(target is reached at all)** = the existing aggregate; **clinch-date distribution** = per sim world, the date the simple magic-number arithmetic hits zero (a documented approximation — running the full deterministic engine per sim-day is not worth it; the arithmetic date is within a day of truth in practice, and the real-world flag §1 is always exact). Displayed: "Magic number **6** · 87% to clinch · median clinch date **Sep 22**."
- Tragic (elimination) numbers mirror everything with roles reversed.

## 3. Control-your-destiny indicator (#19)

"Win out ⇒ in, regardless of anyone else": the §1 machinery with the team's remaining games pinned to wins — screening via sims where the team won out (late season there are enough such worlds to screen; when the filter is thin the arithmetic bound almost always settles it, because winning out mid-season is overwhelming), then bounds, then exact adversarial if needed. Rendered as the PlayoffStatus-style green/red chip on team pages and the league table's expanded row: **"In control"** / "Needs help" — with "needs help" linking to the rooting guide (features/13) for *what* help, and the picker (features/12) to explore it.

## 4. Clinch/elimination tonight — scenario sentences (#21)

The shareable output: **"CLE clinches tonight if: CLE win AND SEA loss."**

1. **Trigger check (cheap, every snapshot):** partition sims by tonight's outcomes — if no combination of tonight's results produces a clinch/elimination flag by §1's screening, nothing can happen tonight; stop. (This is a `game_conditionals`-style single pass.)
2. **Exact enumeration:** when tonight-clinch is possible, enumerate outcomes of the *relevant* games only (contenders in that race — in practice ≤ 8 games ⇒ ≤ 256 combos; NHL adds the loser-point dimension where the rule set needs it), evaluate each with the deterministic engine, build the truth table.
3. **Sentence generation:** minimize the truth table's true-set into minimal AND/OR terms (trivial Quine–McCluskey at ≤ 8 variables) → human sentences, ordered simplest-first. Multiple paths render as "or": "win AND (SEA loss OR HOU loss)."

Surfaces: a clinch ticker on league hubs and the tonight page during clinch season ("3 teams can clinch tonight"), team status panels, notification triggers (features/15), and picker deep-links with the clinching combination pre-pinned (features/12 §6).

## 5. Scope & horizon (PROPOSED, resolving the outline's opens)

| Item | Proposal | Rationale |
|---|---|---|
| Enumeration horizon | **Tonight/this-slate only** (#21); multi-day "clinch scenarios this week" stays probabilistic (sim fractions: "62% chance the division is decided by Sunday") | Exactness×combinatorics is only cheap for one slate; the weekly question is better answered probabilistically anyway |
| Official-parity edge cases | Automated parity check vs league announcements (§1); forfeits/suspended per era rule files | The badges are a correctness showcase — treat divergence as P1 |
| Clinch-date distribution method | Simple-arithmetic magic date per sim world (§2), labeled approximate; real-world flags always exact | Honest, cheap, and within a day of truth |

Launch: flags + badges + magic numbers ship with the doc-10 surfaces (they're `team_odds` columns — Phase 2/3); tonight-scenario sentences and control-your-destiny chips target Phase 5 with the other daily hooks, early-shippable like features/13 if Phase 4 has slack.
