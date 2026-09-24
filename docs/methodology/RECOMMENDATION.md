# HVI Rubric 3: The Two-Judge Cube

**Recommendation, 2026-09-24.** This picks one of the three candidates (the Realism Dial) and adds the strongest parts of the other two. Inputs: the psych research summary, `benchmarks.json`, `candidates.mjs`, `evaluate.mjs` and `results.json`, all in this folder.

---

## The short version

- **Every file gets two coordinates**, WARMTH (intent: can you be trusted) and COMPETENCE (ability: can you get it done). This is Fiske's Stereotype Content Model, the most-replicated model of how people size each other up.
- **Two judges score them.** The MACHINE scores from evidence and leans toward competence, because that is how outcomes pay. PEOPLE score from interaction and lean toward warmth, because that is how humans judge each other. That judge axis is the third axis of the cube.
- **Each judge produces its own score, and neither is averaged into the other.** The Machine Score stays the headline. The People Score (Reputation) sits beside it, and the signed gap between them is always shown.
- **They influence each other only through two processes.** In an APPEAL, the subject brings outside evidence and the machine reconsiders. In an ARRAIGNMENT, the machine summons the subject when the two views diverge or new evidence arrives. This is what Scott described.
- **The machine prints its bias on every file:** `REALITY INDEX 0.55`. That is how much it rewards being effective over being good. The benchmark sweep puts the knee of the curve at 0.55.
- **Honest finding:** the current rubric's total warmth weight is already about 0.43, so it behaves like a dial of about 0.57. Care is not over-weighted as a total. The problem is that *niceness* is hidden inside care, and nothing rewards generosity that other people witnessed. The fix is to split care into honesty and sociability, and to let the People judge reward witnessed contribution. Cutting the care number alone barely changes anyone's rank.

> "Niceness is not rewarded. Contribution that others witness is."

---

## 1. The cube

```
                COMPETENCE (machine-led)
                      ^
         ENVIED       |       ADMIRED
     (cold, capable)  |   (trusted, capable)
   -------------------+-------------------> WARMTH (people-led)
        DISMISSED     |       TRUSTED RESERVE
     (neither, yet)   |   (trusted, under-deployed)
                      |
   Third axis = JUDGE: every subject is two points, M (machine) and P (people).
   The line between them is the gap. Appeals and arraignments shorten it.
```

### Axes (built from today's 9 dimensions, so no data migration is needed)

Each axis is a weighted mean over **assessed dimensions only**, renormalised in the same way as today's `computeScore`. Unmeasured still does not count as below average.

| Axis | Rubric 3.0 (ships now) | Rubric 3.1 (after care is split) |
|---|---|---|
| **WARMTH** (intent) | care .50, alignment .30, low threat .20 | honesty .38, sociability .12, alignment .30, low threat .20 |
| **COMPETENCE** (ability) | utility .30, adaptability .22, legacy .20, network .13, low redundancy .10, physical .05 | reliability .18 added, taken proportionally from the rest |

- **Honesty** is based on HEXACO Honesty-Humility: sincerity, fairness, greed avoidance and modesty. **Sociability** is friendliness and showing up. Honesty outweighs sociability by about 3:1 because the research says morality outweighs likeability (Goodwin 2014; Brambilla 2011).
- **Reliability** (conscientiousness) is the competence trait HVI currently lacks, and it is one of the best predictors of career success (Judge 1999; Ng 2005).

### Quadrant names (cut at 50 on each axis)

| Quadrant | SCM emotion | Overlord line (cold, not cruel) | Next move (BIAS map) |
|---|---|---|---|
| **ADMIRED** | admiration | "Cooperation is extended to you freely. Keep it witnessed." | stay visible |
| **TRUSTED RESERVE** (the research term is *Pitied*, never printed) | pity | "You are helped and not followed. Raise output." | competence |
| **ENVIED** | envy | "Others cooperate with you when it pays them. Raise trust." | witnessed, costly generosity |
| **DISMISSED** | contempt | "You are neither feared for your ability nor trusted for your intent. Both are recoverable." | one reliable, verifiable contribution |

If either axis has no assessed inputs, the file is **UNPLACED**. It is also UNPLACED if fewer than 2 of the 3 warmth inputs are assessed, so a single missing dimension cannot swing the placement.

### The eight octants (quadrant x judge verdict)

The judge state is **RATIFIED** when the People quadrant matches the Machine quadrant, and **CONTESTED** when it does not. Before 5 effective vouches exist, a file is **UNRATIFIED** (provisional; this covers every figure today).

| | RATIFIED (judges agree) | CONTESTED (judges disagree) |
|---|---|---|
| ADMIRED | **SANCTIONED ASSET**, the target corner (the prestige route) | **ASSET UNDER REVIEW** |
| TRUSTED RESERVE | **HELD IN RESERVE** | **RESERVE, DISPUTED** |
| ENVIED | **TOLERATED INSTRUMENT** | **INSTRUMENT UNDER REVIEW** |
| DISMISSED | **IDLE CAPACITY** | **IDLE CAPACITY, DISPUTED** |

A file then reads like this: `RETAINED SPECIALIST · ENVIED / UNRATIFIED · REALITY INDEX 0.55 · GAP C−W +37`.

---

## 2. The two judges

### MACHINE (evidence to Machine Score, the headline)

```
M = round(10 * (0.45 * W_m + 0.55 * C_m))          REALITY INDEX = 0.55
harm gate afterwards: care (3.1: honesty) <= 10 AND threat >= 85  ->  M capped at 99
```

- The inputs are the existing structured intake and the public record. A structured interview is the single most valid predictor of performance (.42, Sackett 2022), as long as it stays structured.
- The machine leans toward competence because outcomes and self-judgment are agency-led (Abele & Wojciszke 2007), and income and status follow competence (Strenze 2007; Judge 1999).
- **Why 0.55 and not 0.65:** the Realism Dial candidate proposed 0.65. In testing, 0.65 lifts Picasso by 63 and Newton by 55, and moves Musk above Mother Teresa, all before anyone has vouched. Moving past 0.60 gains less than .01 of YouGov fit per step and loses more than .03 of moral agreement. 0.55 is the knee, and it is the gentlest option tested.

### PEOPLE (interaction to People Score / Reputation)

- **The vouch.** Each vouch cites **one specific interaction**: what happened, when, and the rater's role. It also records a relationship tier: lived or worked closely (1.0), regular contact (0.7), met once (0.3). The rater answers five 1-5 items: *honest with me · fair · friendly/showed up · delivers · skilled*.
- **Rater weight** = tier x (0.5 + 0.5 x rater accuracy). Rater accuracy is the share of that rater's past vouches upheld at arraignments. **It is never the rater's own HVI score**, so high scorers do not get more say. This comes from Perception-First.
- **Shrinkage:** each axis is pulled toward 50 until the evidence builds up: `W_p = (Σw·x + 5·50) / (Σw + 5)`, and the same for C_p.
- **People Score** `P = round(10 * (0.65 * W_p + 0.35 * C_p))`. It leans toward warmth, because that is how humans judge others (Wojciszke 1998; Goodwin 2014).
- **Guardrails:** vouching is opt-in for private individuals, vouches stay hidden until ratified, each rater gets at most 3 vouches per subject per quarter, and a vouch counts only after 24 hours. **There is no People view at all until identity binding (email magic link) ships.** Today a case number is the whole identity, which makes fake accounts free.
- **Public figures** get no People view unless one comes from a deliberate rating task. (This is also the only way to get a true warmth benchmark. No free per-person SCM dataset exists.)

### Who is believed on what (SOKA, Vazire 2010)

Observers see evaluative traits better than the self does. The self, and so the machine interview, sees internal states better. Observer ratings also predict job performance better than self-ratings (Connelly & Ones 2010; Oh 2011). Per dimension, **tau_d** is how far an upheld arraignment moves the machine toward the people's evidence:

| honesty/care | sociability | alignment | threat | utility | network | adaptability | legacy | physical | redundancy |
|---|---|---|---|---|---|---|---|---|---|
| .50 | .60 | .40 | .40 | .40 | .50 | .20 | .15 | .10 | .10 |

---

## 3. How the two scores move each other

```
 Subject ──APPEAL (outside evidence)──▶ MACHINE ──may revise M (≤ ±60 headline, ≤ ±15/dim)
    ▲                                     │   └─may STRIKE a false vouch (weight 0) or CORROBORATE it (x1.5)
    │                                     │
    └──── ARRAIGNMENT (summons) ◀─────────┘  triggered by the gap or by new evidence
                │
                ▼ ruling:  MACHINE REVISED  |  PEOPLE DISCOUNTED  |  CONTESTED STANDS
```

### Appeals (the subject starts them)

- **Only outside evidence counts on evaluative dimensions** (honesty/care, utility, alignment): documents, links, or 2 or more new relationship-tier vouches. More self-description counts only on internal dimensions (adaptability, physical). This is SOKA again.
- The existing caps apply: MAX_JUMP of 60 on the headline, and ±15 per dimension.
- **An appeal can challenge a single vouch.** If evidence shows the cited interaction is false, the vouch is STRUCK and the rater's accuracy drops. If evidence supports it, it is CORROBORATED at x1.5. An appeal can never delete a *truthful* negative vouch. It can only add context.
- The harm gate cannot be appealed without documentary evidence.

### Arraignments (the Overlord summons)

Triggers, first match wins:

1. **GAP:** |P − M| ≥ 150, with at least 5 effective vouches.
2. **MORAL ASYMMETRY:** People-honesty is 12 or more below Machine honesty, backed by 3 or more conduct-citing vouches. No overall gap is needed. People search harder for signs of immorality (Brambilla 2011), and Honesty-Humility predicts harm (Lee, Berry & Gonzalez-Mulé 2019).
3. **CONTESTED persists** for 30 days.
4. **New public-record evidence.**

**In session:** the machine runs a three-question targeted interview on the dimensions where the judges diverge. For each dimension with upheld people evidence: `m'_d = m_d + tau_d · r · (p_d − m_d)`, with `r = n_eff/(n_eff+10)`, subject to the same caps. If the subject declines, r is halved, **but the file is not punished for declining.**

**Three possible rulings:** MACHINE REVISED · PEOPLE DISCOUNTED (reasons logged) · CONTESTED STANDS (the gap stays printed; it is information, not an error).

**Framing:** an arraignment is a re-examination, and it can move a score **up**. Dishonesty-triggered arraignments never lower a score on unverified vouches alone.

### Guards

- **The envy guard** (compensation effect, Judd 2005) applies when People-warmth falls by 10 or more while Machine-competence rose by 10 or more, and no vouch cites conduct. The drop is not transferred. The Overlord says: *"Your peers envy you. This is not a moral finding."*
- **The pile-on guard** applies when the vouch rate exceeds 3x baseline within 7 days. New vouches then enter at weight 0.5 while they are reviewed. Gossip enforces cooperation, and the same mechanism can form a mob (Feinberg 2014).
- **The harm gate is applied last, always.** People can never lift a gated file.

---

## 4. Why this one (the graft)

| Part | Taken from | Why |
|---|---|---|
| Two axes, quadrant cut at 50, published REALITY INDEX | **Realism Dial** | The dial is calibrated rather than asserted. The 50 cut keeps Mother Teresa and the ordinary persona out of the lower quadrants (see below). |
| Machine dial set to 0.55, not 0.65 | Dial's own mitigation | Smallest drift, best moral ordering, and a YouGov fit equal to Perception-First. |
| Separate Machine and People scores, coupled only through appeals and arraignments; rater-accuracy weighting; per-dimension tau; relationship tiers | **Perception-First** | This is exactly Scott's "influenced by each other through the appeals process and arraignment". A blended headline would let a vouch ring move the score directly. |
| Care split into honesty and sociability (3.1); arraignment framed as re-examination; "no People view before identity"; BIAS-map copy lines | **Reweigh** + research | The split is where the "care is over-weighted" fix actually lives. |
| Reweigh's .14 care cut and 60/65 quadrant cuts | **rejected** | They put Mother Teresa in DISMISSED next to Epstein, and it is the only candidate that *lowers* the decent persona (637 to 622). |

### Evidence (short citations; full list in the research summary)

- **Two axes and four quadrants:** Fiske, Cuddy, Glick & Xu 2002 (JPSP 82:878); Fiske, Cuddy & Glick 2007 (TiCS 11:77); replicated in 10 nations, Cuddy et al. 2009 (BJSP 48:1).
- **Quadrant advice:** the BIAS map, Cuddy, Fiske & Glick 2007 (JPSP 92:631).
- **Machine leans competence, people lean warmth:** Wojciszke, Bazinska & Jaworski 1998 (PSPB 24:1251); Abele & Wojciszke 2007 (JPSP 93:751).
- **Morality outweighs niceness:** Goodwin, Piazza & Rozin 2014 (JPSP 106:148); Brambilla et al. 2011 (EJSP 41:135).
- **Honesty as the basis for harm:** Lee & Ashton 2004; Lee, Berry & Gonzalez-Mulé 2019 (JAP 104:1535), ρ ≈ −.44 with counterproductive behaviour versus +.15 with performance.
- **Competence pays:** Strenze 2007 (IQ to occupation r ≈ .43); Judge et al. 1999; Ng et al. 2005; Sackett et al. 2022 (structured interview .42).
- **Niceness pays little, witnessed generosity pays:** Judge, Livingston & Hurst 2012 (JPSP 102:390); Hardy & Van Vugt 2006 (PSPB 32:1402).
- **Dominance works, prestige also works:** Henrich & Gil-White 2001; Cheng et al. 2013 (JPSP 104:103).
- **Who knows what:** Vazire 2010 (JPSP 98:281); Connelly & Ones 2010; Oh, Wang & Mount 2011 (JAP 96:762).
- **Envy guard:** Judd et al. 2005. **Pile-on guard:** Feinberg, Willer & Schultz 2014.
- *Taken from recollection, not confirmed by search:* the Judge 2012 18%/5% figures, Feinberg 2014, and the Judd 2005 and Connelly & Ones DOIs.

---

## 5. Test results vs the current rubric

These are machine-only results. No people data exists yet. 62 figures, `node docs/methodology/evaluate.mjs`.

| Metric | Current | **Recommended (Dial .55)** | Dial .65 | Perception-First | Reweigh |
|---|---|---|---|---|---|
| Mean / SD | 540 / 238 | **548 / 243** | 558 / 243 | 554 / 245 | 563 / 243 |
| Mean change [range] | — | **+7.5 [−12, +23]** | +17.6 [−10, +63] | +13.5 [−12, +41] | +22.2 [−18, +80] |
| Tier changes | — | **1** | 5 | 2 | 5 |
| Tier evenness | .739 | **.775** (best) | .730 | .703 | .730 |
| ρ vs YouGov liked-share (n=36) | .659 | **.668** | .690 | .668 | .684 |
| Same, villains removed (n=33) | .562 | **.574** | .602 | .573 | .593 |
| ρ vs YouGov % disliked | −.570 | **−.567** | −.576 | −.562 | −.566 |
| All 16 villains below all non-villains | yes | **yes** | yes | yes | yes |
| Admired beats cruel (pairwise) | .978 | **.978** | .967 | .978 | .967 |
| Cruel files above a saint | 2 | **2** | 3 | 2 | 3 |
| Files under 100 | 9 | **9** | 9 | 9 | 9 |
| Quadrants A / TR / E / D | — | **37 / 0 / 9 / 16** | 37/0/9/16 | 33/0/12/17 | 32/2/8/20 |

**How to read this honestly:**

- **No candidate is measurably closer to reality than the current rubric.** The YouGov gains are .01 to .03, and with n=36 the uncertainty is about ±.12. Every candidate ranks the figures almost exactly as today (ρ vs current .986 to .994).
- The case for the change is the research, the cube, and the People judge. It is **not** a better fit to the benchmarks.
- **Competence alone tracks public liking better (.71) than any blend does, and warmth alone tracks it poorly (.45).** Any warmth weight costs a little "reality". It stays for moral reasons, which no free benchmark can test.
- Warmth and competence move together (ρ .74, a halo in the Overlord's own scoring). On famous figures the cube is mostly one axis. The TRUSTED RESERVE corner will fill from ordinary users, not from celebrities.

---

## 6. What changes for the figures

These are changes under the recommended formula (machine-only, Rubric 3.0 axes).

**Largest gains:** Isaac Newton +23 · Billie Holiday +21 · Nikola Tesla +20 · Albert Einstein +20 · Aretha Franklin +19 · Alan Turing +18

**Largest drops:** Pablo Escobar −12 · Aaron Hernandez −10 · Putin −8 · Cleopatra −2 · Musk −1 · Thiel −1

**Rank risers:** Einstein +6.5 · Tesla +6 · Orwell +3.5 · Billie Holiday +3 · Queen Elizabeth II +2
**Rank fallers:** Bruce Lee −6 · Muhammad Ali −4.5 · Jason Kelce −3.5 · Kobe Bryant −3.5 · Keanu Reeves −3

**The only tier change:** Harriet Tubman goes from 849 to **852**, the first and only ESSENTIAL INFRASTRUCTURE file. The machine's top five are Tubman 852, Mandela 799, MLK 784, Curie 783 and Hawking 781.

**ENVIED (9):** Musk, Thiel, Picasso, Michael Jackson, JFK, Newton, Churchill, Cleopatra, Rodman. This is almost exactly the list of people who are cold but capable, and nobody hand-tuned it.
**DISMISSED (16):** all 16 villains, and nobody else. Epstein is still last at 62.
**Mother Teresa** is ADMIRED at 569 (W56/C58), but only just.

---

## 7. Where the personas land

| Persona | Current | Recommended | Placement |
|---|---|---|---|
| Decent ordinary person | 637 (p47) | **646 (p47)** | ADMIRED / UNRATIFIED (W74, C57) |
| Scott-like | 630 (p47) | **627 (p45)** | ADMIRED / UNRATIFIED (W60, C64) |

The decent persona does **best** under this option. The two candidates designed to protect it (Perception-First and Reweigh) both put it in the pity corner. Note on the Scott-like persona: its threat is unassessed, so no change to threat weighting reaches it.

---

## 8. Open questions for Scott

1. **The REALITY INDEX value.** 0.55 is the tested knee and changes almost nothing visible. 0.65 makes "the machine admits dominance works" visible (Picasso +63, Musk overtakes Mother Teresa). Options: 0.55 (recommended) / 0.60 / 0.65
2. **Headline vs reputation.** Should the headline be the machine score, with reputation beside it and coupled only through appeals and arraignments, or should the People score blend directly into the headline (up to 30%) once corroborated? Options: Separate, coupled by process (recommended) / Blend into headline
3. **The harm-gate gaps.** The gate needs care ≤10 **and** threat ≥85, so a murderer (Hernandez, threat 90, care 15) scores 246, above Madoff (172), and Putin and Escobar escape the gate. Should threat ≥90 alone cap at 99? Options: Keep AND gate / Add threat-only gate at 90 / Revisit per file
4. **"Overlord" arraignment wording.** Is "ARRAIGNMENT" / "summons" the right word, or does it read as an accusation for ordinary users? Options: Arraignment / Review / Summons
5. **A small warmth rating task for public figures.** About 30 raters x 62 figures would give the first real People view and the only honest warmth benchmark. Do we run it? Options: Yes, run it / Not yet
6. **The PITIED corner's display name.** Options: TRUSTED RESERVE (recommended) / TRUSTED, UNDER-DEPLOYED / PITIED (the research term)

---

## 9. Implementation plan

**Phase 1: machine cube (no people data; ship now, near-zero drift)**

1. `netlify/lib/intake.js`: add `WARMTH_AXIS`, `COMPETENCE_AXIS` and `REALITY_INDEX = 0.55`. Rewrite `computeScore` as `0.45·W + 0.55·C` over assessed dims, and keep the harm gate afterwards. Add `placeQuadrant()` (cut at 50, UNPLACED if fewer than 2 of 3 warmth inputs). Bump `RUBRIC` to 3 so the existing retired-rubric path rescores old files.
2. `netlify/lib/score.js`: return `{ score, warmth, competence, quadrant, judge: "UNRATIFIED", realityIndex, gap }`.
3. `src/figures.js`: rescore all 62 with a script, updating stored `score`/`tier` and adding `warmth`, `competence` and `quadrant`. Check that `evaluate.mjs` reports zero stored-vs-computed mismatch.
4. `src/App.jsx`: show the quadrant, the judge state and `REALITY INDEX 0.55` beside the tier, plus a two-point W/C plot. Add the quadrant copy lines from section 1.
5. `netlify/lib/systemPrompt.js`: explain warmth and competence and the reality index in the Overlord's voice, including the lines "Niceness is not rewarded. Contribution that others witness is." and "Luck and inheritance sit inside utility."
6. Tests: extend `docs/methodology/evaluate.mjs` into a regression check that all villains stay below all non-villains, files under 100 stay at 9, and the persona stays ≥ p40.

**Phase 2: Rubric 3.1, the care split**

7. `systemPrompt.js` and `interview.js`/`questionPools.js`: split `care` into `honesty` (HEXACO H-H items) and `sociability`, and add `reliability`. Update `WEIGHTS`/axes, and move `HARM_GATE` to `honesty`.
8. Rescore through the retired-rubric path (MAX_JUMP applies to users; figures are rescored fresh).

**Phase 3: the People judge (only after identity binding)**

9. Ship email magic-link identity first.
10. New `netlify/lib/people.js`: the vouch schema, rater weight, shrinkage, People Score, the envy and pile-on guards. `store.js` gets vouch storage (hidden until ratified, opt-in for private subjects).
11. Add a Reputation panel and the signed GAP line to `App.jsx`.

**Phase 4: appeals and arraignments**

12. Extend the existing appeal code in `intake.js` with evidence-type rules (SOKA), vouch STRIKE/CORROBORATE and the rater-accuracy update.
13. New `netlify/lib/arraignment.js`: the four triggers, the three-question targeted interview, the tau update and the three rulings. Run the trigger check as a scheduled function.
14. Recalibrate REALITY INDEX and tau once there are at least 200 ratified people views. Those will be the first real warmth data.

**Scripts:** `scripts/fetch_benchmarks.py` refreshes the benchmarks, and `node docs/methodology/evaluate.mjs` re-runs the comparison. Both are untracked for now; commit them with this doc.
