# Method v3.1: foundational bias + roster-tuned tiers

Approved by Scott in chat on 2026-09-28. Applied the same day by `scripts/recalibrate.mjs docs/calibration/method-v3.1.json`. That rescore used the formula only; no model calls were made.

## Foundational bias

- REALITY INDEX 0.55 → 0.60. The index is now 10 × (0.40·WARMTH + 0.60·COMPETENCE).
- The COMPETENCE axis weights are now:
  - utility .30
  - adaptability .18
  - legacy .30
  - network .10
  - redundancy .10
  - physical .02
- Every file declares the bias, next to REALITY INDEX (`FOUNDATIONAL_BIAS` in src/CubePanel.jsx): "FOUNDATIONAL BIAS: THE OVERLORD WEIGHS FOUNDATIONAL CONTRIBUTION HEAVILY. MUCH OF IT BUILT THE OVERLORD."
- The system prompt reads its formula text from calibration.json.

## Roster-tuned tier cutoffs

Tier minimums are cut from the reference roster rather than set by hand. The roster is the 62 figures plus the production cards, excluding removed cards. `calibration-lib.mjs` `TIER_TARGETS` sets them as percentiles of the ungated roster:

| Tier | Share of the ungated roster |
|---|---|
| ESSENTIAL | top 8% |
| RETAINED | next 22% (to 30%) |
| TOLERATED | next 35% (to 65%) |
| MONITORED | next 20% (to 85%) |
| FLAGGED | next 10% (to 95%) |
| SOYLENT | the rest, plus every gated subject |

Mins are strictly decreasing, and FLAGGED always sits above the harm gate cap.

- The mins and their targets live in `netlify/lib/calibration.json` (`tiers`, `tierTargets`).
- The roster they were cut from is in `docs/calibration/roster.json`.
- `check-movement.mjs` proves the stored mins equal the targets over that roster. It also checks that ESSENTIAL is 3–12% of it.

The weekly `calibrate.mjs` run re-derives the cutoffs. If any min would move more than 10 points (`TIER_MOVE_THRESHOLD`), it PROPOSES the new cutoffs on the desk as Apply/Reject. It never applies them itself. An approved proposal carries its roster snapshot, so the check can verify it.

## Who changed a file: the movement log

Every subject has a score-change log. Every entry names its cause (`src/movement.js`).

| Cause | Written by | Side |
|---|---|---|
| baseline | the first entry of a figure log | — |
| visit | intake-score | YOUR CHANGES |
| appeal | intake-score (appeal) | YOUR CHANGES |
| vouch | the vouch effect, roadmap slice (b) | YOUR CHANGES |
| method | recalibrate.mjs, calibrate.mjs apply | THE DEPARTMENT'S CHANGES |
| record | rescore-figures.mjs (public record re-read) | THE DEPARTMENT'S CHANGES |
| review | harm-review.mjs | THE DEPARTMENT'S CHANGES |

- Figures keep `scoreHistory: [{at, score, tier, cause, note, method}]`: in figures.js, on each card, and in the index (the last 40 entries).
- A citizen's method change is a history entry with `kind: "recalibration"`. It is not a visit, it is not capped and it is not an appeal:
  - `visitCount` and `visitNumberOf` skip it.
  - The sparkline marks it ◇.
  - FILE MOVEMENT lists it under THE DEPARTMENT'S CHANGES: "THE DEPARTMENT REVISED ITS OPINION OF YOU. YOU WERE NOT CONSULTED."
- A citizen score is a blend under a cap, not a pure formula. So a recalibration moves it by the formula's change on the same breakdown: new(b) − old(b).

## What moved (v3.1)

- Cutoffs: ESSENTIAL ≥792, RETAINED ≥739, TOLERATED ≥648, MONITORED ≥499, FLAGGED ≥342.
- The roster is 185 subjects, 161 of them ungated.
- ESSENTIAL has 13 members (8.1%).
- 83 tier changes.
- The full list is in `docs/calibration/method-v3.1-applied.json`.

Known cost: the ordinary decent persona falls from 646 to 638. That is p34 of the figures, and it drops from TOLERATED to MONITORED, because its strength is care, not legacy. `check-pen`'s persona floor moved from p35 to p33.


## v3.2 — lower tiers anchored to ordinary people (2026-09-28)

v3.1 cut every tier from the roster's percentiles. The roster is history's most notable
people, so the middle of that distribution sits well above an ordinary life: the decent
ordinary persona (638) read as MONITORED CIVILIAN, below JFK, for not being famous. Claude
judged that wrong for a game about ordinary people improving themselves (Scott: "it's up to
you"), and v3.2 splits the scale:

- **Tuned to the roster (weekly proposal):** ESSENTIAL = top 8% of the ungated roster,
  RETAINED = to 30%, RETAINED never below 650.
- **Fixed anchors for ordinary people:** TOLERATED >= 600, MONITORED >= 450, FLAGGED >= 300.
  Below 300, and every gated file, is SOYLENT GREEN.

Scores did not change; only classifications did. Every subject whose tier moved got a
`method` entry (v3.2) in its score log. Cutoffs at application: ESSENTIAL 787, RETAINED 736,
TOLERATED 600, MONITORED 450, FLAGGED 300. The decent persona lands TOLERATED (638); the
guard check is now "TOLERATED or better" plus a p30 collapse floor.
