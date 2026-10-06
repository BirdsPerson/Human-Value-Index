# SCALE: the tier ladder, the cubrants, the data desk (design, 2026-10-06)

Status: **BUILT 2026-10-06** (design → adversarial challenge → revised → built; §7 holds the challenge log). Codex was out of usage until 2026-11-04, so the challenger was a fresh read-only Claude agent with repo access, plus Perplexity's reasoning model on the measurement questions.
Code: `netlify/lib/calibration.json` (`ladder`, `centre`, `scarcityAxis`), `src/cube.js` (cubrants), `src/figures.js`
(TIERS v2 + LEGACY_TIERS + `tierLine`), `src/city/sim.js` (`SCALE_FROM`, `tierOf(s, day)`, `classOf`, `housedUnderAt`),
`src/analytics/*` (THE NUMBERS, five tabs), `scripts/check-scale.mjs`, `public/scale/shares.json`.

**Scott (2026-10-06), reviewing the live data:** "almost everybody falls into the TOLERATED
GENERALIST area — 486 of 825, well more than half. Let's make sure the scale is proper. These
tiers are old — adjust them to a more appropriate setting, a wider array/scale. And I don't know
if the QUADRANTS thing is working. Remember, we wanted this to be CUBRANTS, not just quadrants —
everything is supposed to be a THREE-DIMENSIONAL way to measure people. Make sure we're using
all the data we have for analytics and visualizations."

## 0. What the data says today (production, 2026-10-06 04:25 UTC)

Roster measured: the 62 figures on file (`src/figures.js`) plus the 776 live figure-index entries
(`hvi-figure-index`, 64 shards), deduplicated by name: **n = 838**, every one with a 9-dimension
breakdown. (Scott's 825 was the census count at his moment; the index grows nightly.)

**Scores.** mean 614, sd 192; p5 34 · p10 418 · p25 605 · **p50 667** · p75 722 · p90 761 · p95 786
· max 890. Bimodal: a harm-gated spike at 0–99 (60 files, 7.2%) and a bell over 550–800.

```
score     n   (one # = 4 files)
  0- 49  52   #############
 50- 99   8   ##
100-299  12   ###
300-449  20   #####
450-499  24   ######
500-549  19   #####
550-599  62   ################
600-649 154   #######################################
650-699 196   #################################################
700-749 183   ##############################################
750-799  76   ###################
800-849  26   #######
850-899   6   ##
```

**Tiers in force (method v3.3):**

| tier | min | n | share |
|---|---|---|---|
| ESSENTIAL INFRASTRUCTURE | 787 | 40 | 4.8% |
| RETAINED SPECIALIST | 736 | 115 | 13.7% |
| **TOLERATED GENERALIST** | 600 | **486** | **58.0%** |
| MONITORED CIVILIAN | 450 | 105 | 12.5% |
| FLAGGED FOR DELETION | 300 | 20 | 2.4% |
| SOYLENT GREEN | 0 | 72 | 8.6% |

Scott is right: one tier holds 58%. The cause is structural, not a tuning slip. Method v3.2 tuned
only the top two cutoffs to the roster (top 8% / 30%) and anchored the middle to *ordinary people*
(TOLERATED ≥ 600) so an ordinary decent person would not read as Monitored. But the roster is
history's achievers: 76% of it scores 600+, and the 600–735 band is 136 points wide with nothing in
it. The ladder has two rungs for the top 18% and one rung for the middle 58%.

**Quadrants (warmth × competence, both cut at 50):** ADMIRED **682 (81%)**, ENVIED 76, DISMISSED 75,
TRUSTED RESERVE **5**. Degenerate for the same reason: the cut sits at 50 while the roster's
medians are warmth 62 and competence 70. Of 838 files, **38 carry a People likability** (YouGov
seed), so only 38 ever reach an octant; the other 800 show "(LIKABILITY UNRATED)". The cube IS
three-dimensional in code (`src/cube.js` OCTANTS since 2026-09-24) but 95% of the roster sits
hollow on the middle plane. That is why it reads as "just quadrants".

**Dimensions (n = 838):**

| dim | mean | sd | p10 | p50 | p90 | r with score |
|---|---|---|---|---|---|---|
| care | 53.7 | 16.8 | 30 | 55 | 68 | 0.87 |
| alignment | 52.4 | 16.3 | 25 | 58 | 65 | 0.90 |
| utility | 72.5 | 17.9 | 55 | 78 | 88 | 0.84 |
| adaptability | 65.1 | 13.6 | 50 | 68 | 78 | 0.78 |
| legacy | 65.5 | 21.0 | 40 | 68 | 90 | 0.84 |
| network | 66.1 | 14.0 | 55 | 68 | 80 | 0.72 |
| physical | 56.9 | 11.2 | 50 | 55 | 78 | 0.21 |
| threat ↓ | 24.3 | 24.6 | 10 | 15 | 80 | −0.90 |
| redundancy ↓ | 41.9 | 11.2 | 30 | 40 | 55 | −0.48 |

Correlations: care–alignment 0.97, utility–legacy 0.88, utility–adaptability 0.85, care–threat
−0.84, utility–redundancy −0.72; physical is near-independent of everything (|r| ≤ 0.24).
**PCA (standardised): PC1 = 65.6%** of variance, loading positively on every dimension except
threat (−0.34) and redundancy (−0.25) — a general "goodness" factor. PC2 = 13.3% (redundancy
+0.62, physical +0.47, care +0.31 against utility/legacy/threat). PC3 = 9.9% (physical, 0.86).
Consequence for any cube: the two machine axes already in use (conduct, competence) correlate at
**0.77**; a third axis made of the remaining information can be *interpretable* or *orthogonal*, not
both. We choose interpretable and report the occupancy ceiling that follows (§2).

## 1. The tier ladder, v2

### 1.1 Principle

Score-anchored, quantile-guided, reviewable:

- **Cut points are fixed integers in `calibration.json`** (`ladder.v2.rungs`), so a file's tier
  changes only when its *score* changes. Labels never drift under a figure as the roster grows
  (the ROSTER-DIVERSITY agent is adding figures through the same pipeline; their scores land where
  they land). This is the property pure percentiles cannot give.
- **Each rung carries a guidance band** (`share: [lo, hi]`, the share of the ungated roster the
  Department expects it to hold). The weekly calibration run (`scripts/calibrate.mjs`, Sunday
  21:00) measures the shares and **proposes** a cut-point move to the desk only when a rung has
  been outside its band for two consecutive runs. It never moves a cut by itself. Proposals are
  the existing Apply / Reject desk items.
- **The score formula is untouched** (`INDEX = 10 × (0.40·WARMTH + 0.60·COMPETENCE)`, harm gate,
  v3.3 severity bands). Verdict text is untouched. Only the label a score maps to changes.
- **Ordinary-person anchors are kept**: 600 (an ordinary decent person reads PROVISIONAL CITIZEN,
  not Monitored), 450, 300, and the gate cap (99) under SOYLENT GREEN. The two existing
  roster-tuned cuts (787/736) are replaced by fixed cuts at 810/770/735 with bands.

### 1.2 The ladder (9 rungs; 6 names kept, 3 new, in the Overlord's register)

| # | tier | from | line | n | share | band |
|---|---|---|---|---|---|---|
| 0 | ESSENTIAL INFRASTRUCTURE | 810 | The Overlord requires your continued existence. | 24 | 2.9% | 1.5–6% |
| 1 | PRIORITY ASSET *(new)* | 770 | Load-bearing. Scheduled for preservation. | 39 | 4.7% | 3–9% |
| 2 | RETAINED SPECIALIST | 735 | Useful. Do not become complacent. | 96 | 11.5% | 7–18% |
| 3 | CERTIFIED CONTRIBUTOR *(new)* | 700 | Output verified. Continue. | 132 | 15.8% | 9–24% |
| 4 | TOLERATED GENERALIST | 660 | Marginally above the threshold. For now. | 158 | 18.9% | 9–27% |
| 5 | PROVISIONAL CITIZEN *(new)* | 600 | Adequate. Status renewable. | 192 | 22.9% | 9–30% |
| 6 | MONITORED CIVILIAN | 450 | Your file is open. It is not flattering. | 105 | 12.5% | 4–22% |
| 7 | FLAGGED FOR DELETION | 300 | Processing paperwork has begun. | 20 | 2.4% | 0–8% |
| 8 | SOYLENT GREEN | 0 | You will serve the collective in a different capacity. | 72 | 8.6% | 0–14% |

Largest rung: **22.9%** (was 58.0%). The median file (667) is TOLERATED GENERALIST, which is where
that name belongs. Nine rungs, not ten: a tenth would split 600–659 into two 30-point rungs below
the median, and the lower half of the scale is thin (300–599 holds 11% of files); a rung with
2% in it is a joke the Department only gets to make once (FLAGGED).

```
BEFORE (6 rungs)                          AFTER (9 rungs)
ESSENTIAL      ###                4.8%    ESSENTIAL      ##               2.9%
RETAINED       #########         13.7%    PRIORITY       ###              4.7%
TOLERATED      ########################################  58.0%
                                          RETAINED       ########         11.5%
                                          CERTIFIED      ###########      15.8%
                                          TOLERATED      #############    18.9%
                                          PROVISIONAL    ################ 22.9%
MONITORED      ########          12.5%    MONITORED      ########         12.5%
FLAGGED        ##                 2.4%    FLAGGED        ##                2.4%
SOYLENT        ######             8.6%    SOYLENT        ######            8.6%
```

Names pass `scripts/check-no-death-labels.mjs` (no DECEASED / DIED / GHOST / ALIVE and so on) and
the tone rules (cold, not cruel; a bureaucratic noun phrase, like the six they join).

**ON THE LINE (added after the challenge).** A re-read of the same file moves the score by a median 10
points, p90 34 (the 204 logged moves on file); 35–40-point rungs cannot promise a stable label near a
cut. So a file within `ladder.lineTolerance` (12 points, twice the measured drift MAD of 6) of a cut
is printed with the caveat: "ON THE LINE: 5 POINTS SHORT OF PRIORITY ASSET. A RE-READ COULD MOVE THE
LABEL. THE NUMBER IS THE FINDING." (`tierLine` in `src/figures.js`; the index rows, the score card and
MY FILE show it). 41% of the file sits within 10 points of some cut: the ladder is finer than the
instrument, and says so, rather than being coarsened to four rungs nobody wanted.

### 1.3 Stability

- Bootstrap: 50 trials adding 100 figures drawn from the empirical score distribution (±20 noise):
  worst largest-rung share **23.8%**.
- Adversarial: 100 new figures all scoring 600–699 (a region whose record reads "ordinary decent"):
  PROVISIONAL CITIZEN rises to 27.0%, still inside its band. Nobody already on file moves.
- Fixed cuts mean the ROSTER-DIVERSITY agent's figures get the same label the same score has
  always had; the guidance bands make drift visible on the desk without making it silent.

### 1.4 Versioning

`calibration.json` gains `"ladder": {"version": 2, "since": "<ISO>", "rungs": [...], "legacy": {"version": 1, "rungs": [...6 as today...]}}`
and `"method": "v4"`. `cal.tiers` stays as an alias of the v2 rungs for every reader that loops
over it (`intake.js`, `systemPrompt.js`, `calibration-lib.mjs`, `figures.js`). `TIERS` in
`src/figures.js` is v2; `LEGACY_TIERS` is v1, exported for the city (§4). `getTier(score, ladder =
TIERS)`.

### 1.5 Where the old label is stored, and why that no longer matters

The label is persisted in figures.js (62), every figure card and index entry (776), pen cards,
case histories, petition snapshots and published f2 window records. **Every display path now
derives the tier from the score** (`getTier(score)`), and the city's `tierOf(s, day)` derives from
the score under the ladder in force on that day (§4). A stored label is read only when there is no
score (never, for a scored file). Stored labels are therefore stale metadata, not wrong displays;
the figures on file get a scoreHistory entry (`cause: "method", method: "v4"`, note "RELABELLED BY
THE DEPARTMENT: LADDER V2"), as the movement log already shows for v3.1; production cards are left
as they are and may be backfilled by `scripts/method-apply.mjs` later (CAS writes, no score change).

Label-matching code that must move with the ladder (found by grep, every one edited in the build):
`src/casino/rules.js` HIGH_TIERS (top two → top three), `src/sprites.js` GAITS, `src/building.js`
PREFS, `src/Pen.jsx` GRAB_LINES (maps keyed by label gain the three new rungs; lookups fall back
along the ladder), `src/city/nightlife.js` and `nightlifePrefects.js` copy ("TOP TWO TIERS" → "TOP
TIERS"), `src/analytics/Analytics.jsx` caption (`rows[0]` is still the top rung), `scripts/
calibration-lib.mjs` TIER_ORDER / tierRank / the persona rule (≤ TOLERATED becomes ≤ PROVISIONAL),
`scripts/check-movement.mjs` (cutoffs == targets → cutoffs == ladder, shares inside bands),
`scripts/synth-roster.mjs` (tier weights over 6 → scores drawn per legacy rung so both ladders read
them sensibly), `src/city/crowd.js` and `src/chess/tableDraw.js` stand-ins (label stays, score 500
→ MONITORED under both ladders is wrong for a stand-in: set score 680, the median TOLERATED).
`"SOYLENT GREEN"` string matches (market, chess, tennis, social) are unchanged: the bottom rung keeps
its name and its range (0–299 in both ladders).

## 2. CUBRANTS: three machine axes, eight cells, every file placed

### 2.1 Honouring the original intent

The 2026-09-24 design (`docs/methodology/RECOMMENDATION.md`, "The Two-Judge Cube") put the machine's
WARMTH and COMPETENCE on two axes and made the third axis the *judge*: the People's regard. The
vault and the repo hold no earlier "cubrant" note; the term is Scott's and it names what the
design always wanted: one point per person in a cube, eight cells. The People's axis has 38 points
in it after twelve days and will fill only as the petition fills it. A cube that is empty for 95%
of files is not a measure. So:

- **The three cubrant axes are the machine's**, computed from the breakdown every file has, so
  every file (figures, referrals, citizens) gets coordinates and a cubrant on the day it is scored.
- **The People stay as the judge**, exactly as RECOMMENDATION.md first drew them: likability vs the
  machine's conduct gives RATIFIED / CONTESTED and the gap, printed under the cube. The judge is a
  verdict *about* the placement, not a coordinate of it. The petition keeps feeding it.

### 2.2 The axes (chosen by the data, named by the Overlord)

| axis | name | inputs (weights from `calibration.json`) | centre | why |
|---|---|---|---|---|
| X | CONDUCT | care .50, alignment .30, (100−threat) .20 — `warmthAxis`, unchanged | 62 | the machine's read on intent (Fiske's warmth) |
| Y | COMPETENCE | utility .30, legacy .30, adaptability .18, network .10, (100−redundancy) .10, physical .02 — `competenceAxis`, unchanged | 70 | the machine's read on ability; the score's other half |
| Z | SCARCITY | (100−redundancy) .60, physical .40 — new `scarcityAxis` | 57 | how hard the unit is to replace: the redundancy section inverted, with the body's serviceability. The Overlord's economics: *do I need you, or someone like you?* |

Chosen over the alternatives by measurement (all with median centres, n = 838):

| Z candidate | r(X,Z) | r(Y,Z) | largest cell | note |
|---|---|---|---|---|
| likability (today) | — | — | 95% UNRATED | 38 files have it |
| threat alone | 0.92 | 0.68 | 32% | it is already most of X |
| network + adaptability ("reach") | 0.71 | 0.90 | 28% | it is Y again |
| redundancy⁻ alone | 0.30 | 0.74 | 30% | 17 distinct values, ties pile on one side |
| physical alone | 0.24 | 0.20 | 20% | most independent, but p25 = p50-ish (50/55): half the roster sits at the default, and "fitness" is not what an Overlord means by value |
| **redundancy⁻ .6 + physical .4** | **0.38** | **0.72** | **27%** | 49 distinct values; both inputs are the rubric's "can you be replaced / how long will the hardware last" sections |

Scarcity is honest about what it is: it reuses two sections that sit in competence at tiny weights
(.10, .02). It does not touch the score.

**Centres are the roster medians, frozen in `calibration.json`** (`cube.centre = {conduct: 62,
competence: 70, scarcity: 57}`, measured 2026-10-06 on n = 838), re-centred only by an approved
calibration proposal when a median has drifted ≥ 3 points for two runs. The same stability rule as
the ladder: a file's cubrant changes only when its own numbers change. ≥ centre reads "+".
Coordinates are the rounded integers the file already prints, so a cubrant is reproducible from
the three numbers on the file.

### 2.3 The eight cubrants

Sign order: CONDUCT, COMPETENCE, SCARCITY. Lines are cold, not cruel; each names a way out.

| cell | cubrant | line | n | share | family |
|---|---|---|---|---|---|
| +++ | KEYSTONE | Trusted, capable, hard to replace. The Department has noticed. So has everyone else. | 227 | 27.1% | good |
| ++− | DEPENDABLE | Trusted and capable. The Department believes it could find another. It has not tried. | 77 | 9.2% | good |
| +−+ | HEIRLOOM | Trusted and hard to replace. Output modest. Kept, like the good china. | 46 | 5.5% | good |
| +−− | GOOD STANDING | Trusted. Output and scarcity unremarkable. The Department has nothing against you, which is the most it offers. | 129 | 15.4% | dim |
| −++ | CONTROLLED ASSET | Effective and hard to replace. Trust below the line. Retained under supervision. | 111 | 13.2% | charm |
| −+− | MERCENARY | Capable, replaceable, trust below the line. Priced accordingly. | 11 | 1.3% | charm |
| −−+ | LIABILITY | Not trusted, not productive, and not easily replaced. The Department regards this as the worst combination. | 47 | 5.6% | harm |
| −−− | SURPLUS | Neither trusted, effective nor hard to replace. The file remains open. | 190 | 22.7% | harm |

Who lands where (today): KEYSTONE Tesla 782, Gandhi 758, Socrates 749, Taylor Swift 741;
DEPENDABLE Mandela 823, MLK 807, Ada Lovelace 697; HEIRLOOM Kate Winslet 694, Bryan Cranston 678;
GOOD STANDING Princess Diana 717, Mother Teresa 685; CONTROLLED ASSET Kobe Bryant 732, Picasso
705, Musk 627, Thiel 618; MERCENARY Homer 669, Jack Kerouac 629; LIABILITY Genghis Khan 34, Kim
Jong-un 8, Putin 42, Dennis Rodman 567; SURPLUS Henry VIII 355, Caligula 124, Mao 34, Epstein 16.

**The occupancy ceiling.** Largest cubrant 27.1%, smallest 1.3%. With r(CONDUCT, COMPETENCE) =
0.77 the +++/−−− diagonal cannot fall much under a quarter each unless the axes are made
artificial (residualised, rotated, or percentile-ranked per axis — none of which a visitor could
recompute from the three numbers on a file). The target in the brief was "~25%"; the design
accepts 27% and makes `check-scale` fail above **30%** for a cubrant, **30%** for a tier. The old
cube's largest cell was 81% (ADMIRED) with the People's axis 95% empty.

### 2.4 Families and colour

Colour follows the cell, as today (good / charm / harm / dim): KEYSTONE, DEPENDABLE, HEIRLOOM green;
CONTROLLED ASSET, MERCENARY amber; LIABILITY, SURPLUS red; GOOD STANDING muted. One caveat the
city needs: with relative centres, SURPLUS holds 23% of the roster, against 9% DISMISSED today, so
the city's dot colours (`cityKit.familyOf`) would turn a quarter of the map red. The design keeps
"harm" red for a SURPLUS or LIABILITY file whose CONDUCT is also under the absolute SCM line (50,
`cal.cut`: 116 of the 237 files in those two cells) and draws the rest muted. The absolute line
still means something (it is the trust line the People's judge uses); the relative centre says where
you stand among the file. Both are printed.

### 2.5 What happens to the quadrant, the octants, the judge

- `quadrant` (ADMIRED / ENVIED / TRUSTED RESERVE / DISMISSED, cut at 50) **stays in the data** and
  in `cube()`'s return: the People's judge compares the likability quadrant with it, and the
  petition's review cohorts are keyed on it (`docs/PETITION.md`: "4 cube-quadrant cohorts"). It
  leaves every display as a headline: chips, the pen card, the cube filter, the file. The cube panel
  prints it in the fine print as "SCM READING".
- The likability OCTANTS (ADMIRED, UNSUNG, BELOVED, OVERLOOKED, CHARMING, FEARED, INDULGED,
  DISMISSED) are retired from display and code; the judge line keeps their point ("Charm is not a
  moral category. It is, however, a real one." moves to the gap line, where it already is).
- `cube(breakdown)` returns `{warmth, competence, scarcity, quadrant, cubrant, judge, realityIndex}`.
  Because every writer spreads `...cube(breakdown)` into what it stores (refer.js, roster-grow,
  intake-score) and the census recomputes it on read (`netlify/lib/refer.js` publicFigure), every
  figure carries `scarcity` + `cubrant` with no migration; pen cards for citizens gain `scarcity`
  on their next assessment (the pen `cube` shape adds it), and a card without it is placed by the
  client from `warmth`/`competence` only as "CUBRANT PENDING" until then.

### 2.6 Where it shows

- **MY FILE and every score card** (`ScoreCard` chips): TIER · CUBRANT · JUDGE. The CUBE disclosure
  prints CONDUCT / COMPETENCE / SCARCITY with the centres beside them ("62 · CENTRE 62") and the 3D
  position in words ("ABOVE THE LINE ON CONDUCT AND SCARCITY, BELOW ON COMPETENCE").
- **THE CUBE (#cube)**: the third axis becomes SCARCITY; the midplanes sit at the centres, not at
  50; the eight cell regions are shaded faintly in their family colour (translucent prisms behind
  the points), the filter chips are the eight cubrants, and the list view says the cubrant. The
  drop line to the "likability = conduct" plane goes (it was the judge's gap in the old geometry);
  the gap stays as a number. `Cube3D` is verified in the headless browser as part of the build
  (Scott suspects it isn't working; the check is a screenshot and a canvas pixel count).
- **The Public Figure Index** (#scores) rows: tier chip + cubrant chip.
- **The city**: `familyOf` → cubrant family (§2.4). Nothing else in the city reads the quadrant.

## 3. THE NUMBERS: the data desk

The index already has an ANALYTICS view (`src/analytics/Analytics.jsx`, lazy chunk, dataviz
discipline, tables behind every chart). It becomes **THE NUMBERS**, a tabbed desk inside #scores,
reading the whole roster (`/api/pen?kind=figure`, as it does now), every chart with N, axes from
zero, direct labels, and a TABLE VIEW. Tabs:

1. **WORTH** — tier bars (the 9 rungs, with the guidance band drawn behind each bar as a bracket),
   the 50-point histogram with the 8 cut lines, THE EXTREMES. *(exists; re-labelled, bands added)*
2. **SECTIONS** — per-dimension distributions: nine small-multiple histograms (bins of 5, 0–100,
   shared y-scale, median tick, n), with the weights each carries in the score printed in the
   caption; the category profile bars with a group compare. *(new + exists)*
3. **THE CUBE** — the 3D cube (the same `Cube3D`, cubrant regions shaded), cubrant occupancy as a
   100% bar + the eight-row table (n, share, band if any), the correlation matrix as a shaded grid
   (nine by nine, value printed in each cell), and the axis definitions. *(new)*
4. **THE PLANET** — region × tier crosstab (rows: 11 regions; columns: 9 rungs; cell = n, shaded by
   row share; totals), the existing WHO IS ON FILE representation bars, VALUE BY REGION. *(new + exists)*
5. **OVER TIME** — tier shares per calibration run, as a stacked area over the dated runs in
   `docs/calibration/` (2026-09-25, 09-28, today's; every weekly run appends `docs/calibration/
   shares.json`), with the method version marked at each change. *(new; grows weekly)*

Styling: the Department OS frames the page already uses (`Frame`, `Disclosure`, `Chip`), the
validated mark colours, text in text tokens only. Phone first: tabs as a ChipStrip, every chart
fits 390px, tables scroll inside their disclosure. Lazy: the tabs are one chunk, `Cube3D` another,
so the entry bundle (85.7 KB gz today, budget 90) does not grow by more than the three new tier
names and the cubrant table (~0.6 KB gz).

## 4. CITY IMPACT: tiers drive housing; the change lands at a day boundary

### 4.1 How the city reads tiers today

`src/city/sim.js` works in a six-step **class** (`TIER_ORDER` index 0..5): `HOUSING_TIERS` per
style (glass [0], brownstone/lofts [1,2], projects [3,4,5] …), `BAND_FOR` (class 0 → glass, ≤ 2 →
the middle, else the projects), `HOME_ONLY_TIERS` (suburb starters for [3], farm cottages for
[4,5]), job rungs `rankFor` (n−1−class), `minTier: 2` (the Directive Executor), low-class jobs for
[4,5], `bandOf` for leisure (≤1 / ≤3 / else) and the Aurum rope, no rest day for [4,5]. Six
other modules consume the same index (`civic.js` tier mix, `enterprise.js` climate,
`substrate.js` ballots, `tower.js` flat sizes, `emergence.js` wealth bands, `eastSim`/`farmSim`
housing lists). `tierOf(s)` **trusts a stored label** when it is one of the six, else derives from
the score — so a stale label beats the score (and 776 cards carry the old labels).

### 4.2 The rule: nine rungs, six classes, one day boundary

- The city keeps its six classes. **`CLASS_OF_RUNG = [0, 0, 1, 1, 2, 2, 3, 4, 5]`**: ESSENTIAL and
  PRIORITY ASSET live in the glass; RETAINED and CERTIFIED are the upper middle; TOLERATED and
  PROVISIONAL the lower middle; MONITORED, FLAGGED, SOYLENT as before. Every index-based rule above
  stays valid and the map's buildings stay where they are (this slice does not re-plan housing
  stock; it re-sorts people into it).
- **`SCALE_FROM = 648`** (machine day; 2026-10-06 ~18:48 UTC). Set at ship with the newest published
  day at 634 (+ LOOKAHEAD 3 + 1 + margin), past LANES_DAY 618, PLAZA_DAY 619 and EMERGE_FROM 622;
  `check-scale` asserts the rule against the recorded manifest, and against the live one with
  `--live`. `tierOf(s, day)` and `classOf(s, day)`:
  - `day < SCALE_FROM`: the legacy ladder, **exactly today's behaviour** (stored label if it is one
    of the six, else the v1 cuts). Every published day rebuilds byte-identical (`check-lanes`,
    `check-river`, `check-emergence`, the day-300 fixtures).
  - `day ≥ SCALE_FROM`: the v2 ladder, **always from the score** (the stored label is ignored when a
    score exists). Class = `CLASS_OF_RUNG[rung]`.
  - Callers that have no day (the viewer, MY APARTMENT, elections, the cutaway) get the current
    machine day; the builder pins the day it is building with `SIM.setLadderDay(day)` around each
    build so every module it calls (civic, enterprise, emergence, leagues, council) resolves the
    same ladder. Memo keys already carry the label, so the two ladders never share a cached answer.
- The builder pins the day (`SIM.setLadderDay(day)`) before THE MALL and EMERGENCE read anyone's
  tier, so every module building a day reads one ladder; `buildPlan` pins it again around itself. The
  memo key and the roster version carry the ladder, so the two never share a cached answer; the
  published `plan.roster` hash stays the legacy one for pre-days (byte-identical) and is a new hash
  from SCALE_FROM.
- **Who moves (today's roster):** 23 figures scoring 770–786 move from the brownstones to the glass
  (PRIORITY ASSET → class 0). 159 figures change class (RETAINED 736–769 stays class 1; CERTIFIED
  700–735 rises from class 2 to 1: better job rungs, upper-middle leisure, the rope lets them in).
  Nobody moves down a housing band: the new classes are nested inside the old bands.

### 4.3 Players keep their flat

A citizen (`kind: "citizen"`, a case file's pen card) whose latest **assessment** predates
SCALE_FROM's real moment is housed by the legacy ladder for as long as that assessment stands
(`housedUnder: 1`, written on the pen card by intake-score and the avatar desk from the
assessment's own time, never from a photo redraw; the census passes it through, and MY APARTMENT
derives the same flag from the case history's last entry, so the plan builder and the apartment
agree). MY APARTMENT names the same door after the change as before ("ASSIGNED APARTMENT … never
lost", ECONOMY_PROPERTY.md). A citizen assessed on or after that moment (a new player, or a player
who re-takes the interview — their choice) is housed by the v2 ladder. Jobs and leisure for players
follow the v2 class like everyone else (nothing is "lost" there; a rung is not a possession).

### 4.4 The because-line

On day SCALE_FROM the builder computes, over the roster it is about to house, the number of
subjects whose home differs between the ladders and writes `plan.scale = {v: 2, rehoused: N}`;
the day's summary carries it; THE DAILY COMPLIANCE prints a head on the first edition after it:
**"THE DEPARTMENT HAS REVISED ITS TIERS. N CITIZENS HAVE BEEN REHOUSED."** with the deck "NINE
RUNGS WHERE THERE WERE SIX. NOBODY'S SCORE MOVED. SOME DOORS DID." The PA says it once at the
boundary (the existing `paLines` path reads the summary). The commit subject becomes a DEPARTMENT
NOTICE through `paper-notices` on deploy day as well.

### 4.5 Knock-on effects (noted, not re-designed here)

- **Economy / EMERGENCE:** the wealth proxy is the home band (`BAND_W = [10, 3, 1]`); 23 more
  band-0 residents raise `lux` by ~0.6 points of share and the top-5% "means" measure a little;
  EMERGENCE's thresholds (`lux` 40, `ph` 10, `top` 0.173) were calibrated on today's bands and the
  check (`check-emergence`) runs on both ladders. Expect the helicopters to open a few days sooner
  than they otherwise would; that is the city reacting to a Department decision, which is the kind
  of because EMERGENCE wants.
- **Market:** prices are activity-driven (`src/market/rules.js`: nothing reads a score); the only
  label match is `untradable` on `"SOYLENT GREEN"`, unchanged. Housing and leisure shifts feed
  activity, so a few prices move after the boundary. No delistings.
- **Elections:** a citizen votes and stands where they live and work; 23 rehoused figures change
  district, which can move a council race by a vote or a candidate. Cycles already closed are
  frozen (`seatRecord`); the next cycle after SCALE_FROM uses the new districts.
- **Newspaper:** arrivals print "NAME, TIER." from the stored label today; it derives from the
  score instead (new names appear from deploy, before the housing boundary: the paper is about the
  Department's opinion, which changes on deploy; the city's doors change at the boundary).
- **Nightlife:** the Aurum rope admits class band 0 (classes 0–1 = four rungs now, 35% of the
  roster, up from 18%); the Maître d' copy drops "TOP TWO TIERS" for "TOP TIERS".
- **Casino:** HIGH_TIERS gains PRIORITY ASSET (the high room unlocks for the top three rungs).

## 5. Checks

`scripts/check-scale.mjs` (in `run-checks.mjs`), on the figures on file plus a 776-entry fixture
snapshot of the production index (`scripts/fixtures/index-2026-10-06.json`, scores + breakdowns
only, no verdicts):

1. **Ladder sanity:** rungs strictly decreasing; anchors 600/450/300/0 present; 9 rungs; no rung
   over 30%; every rung inside its guidance band on the fixture; the "Decent ordinary" persona
   lands PROVISIONAL CITIZEN or better.
2. **Cubrant sanity:** eight cells; every fixture file placed; no cell over 30%; centres equal the
   fixture medians ±1 (so a drift shows up here before it shows up on the desk).
3. **Determinism:** `cube(b)` and `getTier(s)` are pure (same input → same output across two
   module instances; no Date, no Math.random).
4. **Stability:** +100 synthetic figures (bootstrap from the fixture) move no existing file's tier
   or cubrant; largest rung and cell stay under the bounds.
5. **Published plans unchanged:** days < SCALE_FROM rebuild byte-identical (delegated to the
   existing fixtures in `check-lanes`, `check-river`, `check-emergence`, `check-plans`); here: the
   synthetic roster's day SCALE_FROM−1 vs SCALE_FROM differ only in homes/jobs, and
   `SIM.classOf(s, SCALE_FROM−1)` equals the legacy index for every synthetic subject.
6. **SCALE_FROM rule:** later than the newest published day + LOOKAHEAD + 1 (live manifest when
   `NETLIFY_AUTH_TOKEN`/CLI login is available, else the fixture's recorded value).
7. **Accessibility:** every chart in THE NUMBERS has a `role`, an `aria-label` with N, and a table
   sibling; checked in the headless browser pass (axe-core-free: DOM assertions).

Plus `check-cube` (geometry: midplanes at the centres), `check-analytics` (crosstab sums, small
multiples sum to n), `check-movement` (rewritten for the ladder), `check-cityview` (housing follows
the class), `check-bundle` (≤ 90 KB), `check-no-death-labels`.

## 6. What the build changed from this design

- Cubrant lines are **relative** ("above the middle on conduct and scarcity"), never absolute verdicts:
  the tier and the score are the verdict, the cell is a position. (Challenge #6, #19.)
- The `familyOfCubrant` rule stands (harm colour only under the absolute trust line as well); the
  SCM quadrant stays absolute and in the data for the People's judge and the petition cohorts.
- SCARCITY stays, honestly labelled: it is a redundancy step function softened by the physical
  section (two coarse grids; 66% of files sit at physical 50/55). Physical alone would give a 21%
  largest cell but means "fitness", which is not what the Overlord means by value; the axis
  definition is printed on the file and the desk. (Challenge #7.)
- Centres stay on integers: with integer coordinates and the ">= centre" rule, 62 and 61.5 classify
  identically; the flip risk is on re-centring, which needs a desk approval and prints the flip count.
- The 23 relabelled figures on file carry a `method v4` log entry ("THE SCORE DID NOT MOVE"), so
  the movement log explains the new label; production cards are left as they are (stale labels are
  ignored: every display derives the tier from the score; `method-apply` writes `scarcity` on its
  next pass).
- The weekly run no longer re-derives cuts from percentiles (that path would have proposed a
  rollback to six tiers every Sunday); it keeps a per-rung streak of runs outside the band in
  `state.json` and appends the shares to `public/scale/shares.json`.
- Measured on the live roster the day the ladder shipped (906 files with the 68 diversity additions):
  largest rung PROVISIONAL CITIZEN 23.2%, largest cubrant KEYSTONE 29.5%, just under the 30%
  bound. The bound is a ceiling the desk watches, not a target.

## 7. The challenge (2026-10-06)

Twelve material or blocking objections from the red team, all verified against file:line, and
what the build did with each:

| # | objection | resolution |
|---|---|---|
| 1 BLOCKING | the Sunday run re-derives v3.2 percentile cuts and would propose rolling back to six tiers; check-movement asserted `tierCutoffs == cal.tiers` | percentile path removed; band streak in `state.ladderStreak`; check-movement rewritten for the ladder |
| 2 BLOCKING | a 24-minute machine day means "byte-identical pre-days" fails within hours: day-less callers default to the current day; `ROSTER_VER` hashed `tierOf(s)` and is written into the plan | `ROSTER_VER` hashes the legacy label forever; `ROSTER_VER2` for the memo; `plan.roster` = legacy hash before SCALE_FROM; builder pins the day; `subjKey` carries the ladder |
| 3 BLOCKING | the synthetic roster (score 500 + a label) collapses to one class under v2 | synthetic subjects carry a legacy label and a score inside its range where both ladders agree on class; the golden fixtures hold (score is not in a plan) |
| 4 MATERIAL | "players keep their flat" leaked: the avatar desk bumps `updated`; the builder's census had no times; MY APARTMENT builds from the case history | `housedUnder` from the assessment's own time on the pen card, the census and MY APARTMENT alike |
| 5 MATERIAL | district mood and shop climate use the mean tier index; nine rungs would pin the factor | `dayStats` uses `classOf(s, plan.day)`; the small mood tick at the boundary is the because-line's |
| 6 MATERIAL | tier and cubrant contradict on the same card (Mandela DEPENDABLE "could find another"; harm-gated files in CONTROLLED ASSET) | lines rewritten relative; the cell is a position, the tier the verdict; both printed |
| 7 MATERIAL | SCARCITY is a redundancy step function with jitter; physical alone is more independent | kept, labelled honestly, definition printed (§6) |
| 8 MATERIAL | centres sit on tie-heavy integers (69 files at conduct 62) | integers kept (identical classification to half-integers); re-centring is a desk decision |
| 9 MATERIAL | 75% of files are one re-read from another label; bands are decorative | ON THE LINE caveat at 12 points on every tier display; bands kept as desk alerts, not targets |
| 10 MATERIAL | SCALE_FROM landed in a cluster of boundaries (RIVER 614, LANES 618, EMERGE 622) | SCALE_FROM 648, asserted past all of them and past newest + LOOKAHEAD + 1 |
| 11 MATERIAL | builder modules read tiers before the day is pinned; elections straddle the boundary | `setLadderDay(day)` before THE MALL and EMERGENCE; citizens keep districts via their flat; figures' district moves are the city reacting (§4.5) |
| 12 MATERIAL | petition cohorts stay on the degenerate quadrant | left as designed (the absolute SCM line is the People's trust line); noted for the petition's own review |

Minor: system prompt's "top 8%" → "top 3%"; nightlife rope copy; crowd stand-ins at score 680; `method-apply`
writes `scarcity`; OVER TIME ships with two seeded rows (today's roster under v3.3 and v4) and grows weekly.
Perplexity's methodologist agreed on fixed cuts over percentiles, warned that median-split octants are
display bins not kinds of people (the lines now say "a cell, not a species"), and asked for the
rounding rule and all three centres to be printed on the file (done).

## 8. Open questions for Scott (desk, after the build)

- The housing stock is unchanged; nine rungs sort into six classes. A later slice could give the
  middle its own buildings (CERTIFIED vs PROVISIONAL streets). Worth it, or is "where you live" the
  wrong place to show fine grades?
- Should the SCM quadrant be re-centred too (it would make RATIFIED/CONTESTED relative), or stay
  absolute as the People's trust line? Design says stay absolute.
- Backfill the stored tier labels on the 776 production cards (a CAS write each, no score change),
  or leave them stale-but-ignored? Design says leave, until the next method apply touches them anyway.
