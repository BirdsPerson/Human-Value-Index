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

## v3.3 — intent over body count (2026-09-29)

Scott: "There's a difference between being responsible for killing people through
legislation and being a serial killer. And you rate serial killers higher than most world
leaders." Under v3.2 a gated file sat at `cap - points`, and points were mostly victim
scale, so a head of state sat below every serial killer. Claude's call (invited: "this is
your world").

Each gated severity now carries `intent` and `personal`:

- `extermination`: killing civilians was the goal (genocide, purges with quotas, terror
  attacks on civilians).
- `predation`: personal murder or abuse for one's own ends (serial killers, abusers,
  trafficking, crime lords).
- `war_or_policy`: deaths from war, conquest, repression, famine or policy, where killing
  was not the goal in itself.
- `incidental`: none of the above dominates.
- `personal`: they killed or abused with their own hands.

Placement (`severityPlace`, netlify/lib/intake.js): extermination, predation and any
`personal` file share the **floor, 0-25**; war_or_policy and incidental sit at **30-90**,
still gated and still SOYLENT GREEN, but above every file on the floor. Inside a band the
v3.2 points order the files, scaled to the band, so "directed below instrument" and "more
below fewer" still hold within a class (Epstein 16 below Maxwell 19). A severity without
an intent keeps the v3.2 placement. Harm reviews are untouched.

Classification: three Sonnet readings per file from its Wikipedia extract (majority
wins), then Claude's review. Overrides: Du Yuesheng war_or_policy → predation (crime
lord, like Escobar); Mike Tyson incidental → predation/personal (1992 rape conviction; his
severity kind also corrected from `killing` to `violent_abuse`); William King Hale
personal → false (he hired the killers). The borderline heads of state:

- **Stalin: extermination.** The Great Terror ran on execution quotas (NKVD Order 00447)
  and Katyn was a planned massacre of prisoners; killing was the instrument and the aim.
- **Mao: war_or_policy.** The Great Leap famine killed tens of millions through policy
  pursued in the face of the famine, and the Cultural Revolution purges were political
  terror; the record does not show death as the goal. He sits at the bottom of the policy
  band (34), level with Xi and Genghis Khan.
- **Genghis Khan: war_or_policy.** Conquest; the massacres of cities that resisted were
  terror in service of conquest, not extermination as an end.
- **Lenin: war_or_policy.** Revolution and civil war; the Red Terror was a weapon of the
  war. 50, the top of the gated leaders.
- Kim Jong-un stays extermination (the UN Commission of Inquiry, 2014, found
  extermination in the political prison camps); Saddam (Anfal), Hitler, bin Laden too.

Checks (scripts/check-pen.mjs): every gated roster file carries an intent; floor files in
0-25, policy files in 30-90, max(floor) < min(policy); Genghis Khan and Mao in the policy
band; placement monotonic in every field for every intent × personal. Spec:
docs/calibration/method-v3.3.json (`keepTiers`: a severity-only change leaves the ungated
cutoffs and roster snapshot alone).
