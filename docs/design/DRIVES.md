# DRIVES: why people in the Substrate do what they do (design, 2026-10-05)

Status: **PROPOSAL, nothing built.** For Scott's review. Code would land as `src/city/drives.js`
(pure, shared by browser, builder and market) plus hooks in the systems below.

**Scott's principle (2026-10-05), which every rule here has to pass:**
> "There should always be some way things can be justified. We don't want to confine behaviour to
> the point where, like when you play a game long enough, you start to feel the machinery. We'd
> rather see things get polarized occasionally and then some deus ex machina presents itself to
> stabilize things again. ... People will get up to their own stuff." ... "I'm speaking of the
> entire game's mechanics, not just the market, although I want the market to imitate the
> behaviours of the game."

North star: always democratic; a fair society with upward mobility; savvy and hard work both
pay; living with a providing superintelligence without losing human ambition.

**Alignment with THE MARKET (in progress, `src/market/`, not yet on main).** The market agent
already gives its 28 NPC investors a hand-set `drive` (acquisitive, cautious, speculator,
contrarian, fashion, populist, revolutionary) and four stabilizers (antitrust, margin call,
audit, emergency session + revolutionary run). This doc makes that the city-wide pattern:
`drives.js` owns the vector, the market's seven labels become a *projection* of it
(`marketStyleOf`, below), and the market's stabilizers join the city-wide catalogue and its
shared cooldowns. The market's current roster labels go in as the first review hints, so
nothing it decided changes.

---

## 1. The drive model

**Eleven drives, each 0..9 per figure.** A figure acts from its top two; the rest are tie-breakers.

| Drive | Word on file | Wants | Typical record |
|---|---|---|---|
| `acq` ACQUISITIVE | WANTS MORE | to own, consolidate, corner | business, finance, industrialists |
| `dom` DOMINANT | WANTS THE CHAIR | office, command, being obeyed | rulers, generals, statesmen |
| `sub` SUBVERSIVE | FINDS THE GAP | loopholes, provocation, going around the rule | demagogues, tricksters, populists |
| `rev` REVOLUTIONARY | WANTS IT SHARED | to break concentration, build the commons, farm | activists, organisers, labour |
| `loy` LOYAL | KEEPS THE ORDER | duty, faith, the Department's way | clergy, soldiers, civil servants |
| `cre` CREATIVE | MAKES THINGS | a studio, a stage, a shop of their own | artists, musicians, writers |
| `sch` SCHOLARLY | WANTS TO KNOW | the library, the lab, the contrary view | scientists, philosophers |
| `com` COMPETITIVE | WANTS TO WIN | the league, the ladder, the rematch | athletes, chess players |
| `hed` HEDONIST | WANTS THE NIGHT | the rope line, the mezzanine, the new thing | celebrities, royalty, socialites |
| `cau` CAUTIOUS | KEEPS WHAT IT HAS | the steady job, the saved CYCLE | the unremarkable majority |
| `alt` ALTRUIST | LOOKS AFTER PEOPLE | the kitchen, the ward, the neighbour | carers, medics, teachers |

**Derivation (deterministic, versioned `DRIVES_V`).** Computed once when a file is filed or
re-scored (`intake-score` / `refer`), because the verdict text is file-only and the census never
carries it. Stored on the card as an 11-character string (`"72041000300"`, ~15 bytes), served in
the census beside `breakdown`. Evidence, summed per drive:

1. **Fields** (`sim.fieldsOf`, already computed for jobs): a fixed `FIELD_DRIVE` matrix, e.g.
   business acq 3 dom 1; finance acq 3 cau 1; politics dom 3 sub 1; royalty dom 2 hed 2; military
   dom 2 loy 2; religion loy 3 alt 1; activism rev 3 alt 1 sub 1; labor rev 2; farming rev 1 cau 1
   alt 1; care alt 3; science/philosophy/history/education sch 3; music/visual/writing/screen cre 3
   hed 1; sport/combat com 3; crime sub 3 acq 1; hospitality hed 1 cre 1 alt 1. Scaled by the
   field's evidence weight (/10).
2. **Breakdown dimensions:** threat >= 65 sub +2 dom +1; rigidity >= 65 loy +2 cau +1;
   adaptability >= 70 sub +1 cre +1; care >= 65 alt +2; alignment >= 65 loy +1; network >= 70
   hed +1 dom +1; legacy >= 75 dom +1; competence - warmth >= 25 acq +2.
3. **Verdict text** (when it exists): a fixed regex list like `FIELD_RULES`, +2 per drive, one
   hit each (`monopol|empire|fortune|consolidat` acq; `demagog|provocat|loophole|norms|populis`
   sub; `revolution|collectiv|union|uprising|commune` rev; `duty|devot|obedien|faith` loy; ...).
4. **Tier:** the top tier dom +1; the two lowest tiers rev +1 (how the machine sees it).
5. **Hints:** `DRIVE_HINTS` (slug -> top two), the same pattern as `FIELD_HINTS` / `HINT_TYPE`.
   Seeded with the market roster (Rockefeller acq, Marx rev, Nixon sub/populist ...).

Quantized: the top drive = 9, the rest scaled and floored; ties go in table order. No evidence at
all: `cau 5, hed 3` plus a hashed +-1 on two others, so the quiet majority is not identical.
Every figure also gets one **quirk** from a fixed list of ~40 by hash of slug (never works the
first shift of a season, always the last to leave AURUM, buys only what starts with their
initial, ...). Quirks bend behaviour by small amounts; they are what make two ACQUISITIVE figures
different people.

**Review path.** `scripts/drives-review.mjs` prints three lists for the owner: (a) living figures
whose top drive is acq, dom, sub or rev (the satirically loaded ones); (b) figures whose top two
are within 1 point (ambiguous); (c) figures with no evidence. Scott confirms or adds a
`DRIVE_HINTS` line; the review is data, so a re-score keeps the hint. **Excluded from drives
entirely** (vector `null`, plain scheduled subject, never named in a "because" line): anyone
`chess/roster.barred()` bars (harm finding, SOYLENT GREEN, threat 80+), anyone `closedToOpinion`
closes, the faiths' founders (`excluded.js`), owner-added local officials.

**Players.** A player's citizen acts for the player when the player drives or votes (players are
never moved by the sim against their own choices). When the player is away, the citizen's
**autopilot** uses the player's drives: computed server-side at assessment from the interview's
sealed breakdown, shown privately on MY FILE as "YOUR DRIVES, AS THE DEPARTMENT READS THEM", and
the player may pick which of their top three leads (Open question 1). A citizen's vector is never
in the census (it would leak the sealed breakdown); only the chosen word is, if the player opts in.

**Drift (long arcs).** Experience moves a vector slowly, at day boundaries, as a sparse chained
block like `ent`: a business closure cau +1; a second location acq +1; three curfew citations
sub +1; a won seat dom +1; a lost seat or a seized holding rev +1 (the bitter turn). At most +-1
per drive per 28 machine days, decaying back to the filed vector over a season. This is how a
mogul becomes a reformer over a month of play without anyone writing it.

**`drives.js` exports:** `DRIVES`, `DRIVES_V`, `drivesOf(subject) -> {v, top, quirk} | null`,
`driveWord(top)`, `affinity(a, b)` (-1..1: shared top drives +, acq v rev and loy v sub -),
`marketStyleOf(v)` (acq -> acquisitive; sub -> populist; rev -> revolutionary; cau or loy ->
cautious; hed -> fashion; sch -> contrarian; com, or acq+hed -> speculator).

## 2. Where drives act, system by system

**Jobs, satisfaction, entrepreneurship** (`enterprise.js`)
- Satisfaction gains a DRIVE FIT term, -8..8: acq weights PAY x1.5; cre and sch weight FIT x1.5;
  hed weights COMMUTE x1.5; loy +4 at a Department post and never counts a bad day at the Works;
  rev -4 in a Finance post, +4 at the Farm or the Commons.
- Opening: acq opens at 5 bad days (not 7), wants a second location at 6 good days, and may make
  an ACQUISITION: buy a struggling shop in its own trade (losing 3 of the last 5 days) instead of
  letting it close. That is the monopoly engine. rev opens a CO-OP (grocer, bakery, farm stand;
  hands share the takings, a co-op cannot be acquired). alt opens a free KITCHEN, paid from the
  commons dividend pool. cau never opens. sub runs a POP-UP without a permit (the Prefect's
  inspections close it, or do not).
- Every opening, acquisition and closure names its drive in its because-line.

**The market** (`src/market/`)
- NPC investor drives come from `marketStyleOf(drivesOf(slug))`; the hand-set roster becomes the
  hint list, and `check-market` asserts they agree.
- The market's concentration (acquisitive share of NPC wealth, the largest holder per float)
  and its fired stabilizers feed the city-wide tension and cooldowns (section 3).
- The market reads the city through activity already; drives add nothing to price formation.
  The city's ACQUISITION events and the market's ANTITRUST are the same story told twice.

**Property** (once built)
- acq NPCs bid for whole floors, then whole buildings (capped by an Assembly knob).
- rev figures file BUILD proposals for community farms and a land trust on vacant ground.
- sub owners file for ground-rent exemptions (the loophole; the Assembly can say no).

**The Assembly** (`assembly.js`, `src/assembly/substrate.js`, proposals)
- Advisory votes gain a drive term: rev/alt lean farm and commons; acq/dom lean build and golf;
  loy votes with the Department's recommendation; sub votes against it; cau abstains more; hed
  leans EVENT. Still advisory: players decide, the Substrate decides only when zero players vote.
- **The Substrate docket** (Open question 4): at most one templated proposal per real day, filed
  in the sponsor figure's name when the state calls for it (rev: a farm when concentration is
  high; acq: a tower when it is low; sub: a RENAME of a Department building). Templates only, no
  free text, so no moderation spend. Players adopt one by co-signing it into the real docket.
- NPC co-signs show as an advisory count beside the players' co-signs, never by name.

**Elections** (`council.js`, `elections.js`)
- Who runs: the slate ranking adds 2 x (dom + sub)/9; cau and sch decline unless the record is
  overwhelming. Power-seekers stand; scholars do not.
- Coalitions: a figure's advisory vote uses `compat` + `affinity(voter, candidate)`, so districts
  sort into blocs that the record names by their leading drive (THE LEDGER BLOC, THE FURROW, THE
  CHAIR, THE GAP). A seated sub holder clashes with the Prefect whatever its lean.
- Write-ins stay players-only. The Substrate never writes in (unchanged).

**The Prefects** (`prefects.js`)
- District RESISTANCE = (sub + rev share of residents) - (loy + cau share), -1..1; it adds to
  clash and subtracts from legitimacy.
- Under CURFEW, high-sub figures get a late leisure segment past curfew in the plan and are CITED
  (on file: "CITED: CURFEW. 3 TIMES THIS SEASON.").
- When legitimacy falls under QUESTIONED, rev figures gather in THE UNDERCROFT after hours
  (ROADMAP e's seed); loy figures inform (the directive's intensity counts for more).

**Nightlife and social** (`social.js`, nightlife)
- Meeting affinity +0.05 for a shared top drive: cliques form along drives, and factions are
  visible as friendships.
- Who gathers where: hed fills the rope line at AURUM and the mezzanine; acq the Members' Club;
  rev the dive and the Commons hall; sch the library and the chess park. A small bias on leisure
  weights, not a schedule.
- THE SCENE: when a hed figure with network >= 70 is out, its circle's leisure weight follows it
  to that venue that night (a crowd you can see move).

**Leagues** (`civic.js` draft)
- HOLDOUT: an acq star (top 10% rating) sits out the first 1-3 fixtures unless its team won the
  season before; its because-line says so. The Commissioner's cap counts the holdout.
- TRADE REQUEST: a com star on a bottom-three team asks out on draft day; granted only if the cap's
  rule says it narrows the spread.
- hed players carry a small after-a-night-out penalty on the next morning's luck.

**Intake / arrivals** (`arrivals.js`)
- The hall's card adds DRIVE ON FILE: one word.
- The assignment line takes a drive-aware Overlord aside ("ASSIGNED: DEPOSIT CLERK. HE WILL WANT
  MORE.").
- Arrivals change the city's drive mix, which the tension fold reads the next day: a wave of
  moguls is itself a polarizing event.

## 3. Polarization, then stabilization

**Four strains**, 0..100, folded once per machine day into `summary.civic.strain`
(`{conc, ineq, split, unrest, T, word}`, ~60 bytes, per district and city-wide):

- **CONCENTRATION** `conc`: the larger of the shop register's Herfindahl (takings by owner) and
  the market's acquisitive share of NPC wealth (from its last closed real day), later property.
- **INEQUALITY** `ineq`: the Gini of a wealth proxy (rung pay + business profit; later CYCLES
  balances from `econ_leaders`).
- **SPLIT** `split`: the spread of district leans (the Prefect lean axis) plus the council's
  divide (seats held by opposite-leaning drives).
- **UNREST** `unrest`: the share of districts RESTLESS or SEETHING, legitimacy CONTESTED or worse,
  citations and closures this week.

TENSION `T` = 0.6 x the largest strain + 0.4 x their mean, smoothed as a chained EMA (the `ent`
pattern: state rides the plan, `strain/latest` covers a gap). Shown as a word only (CALM, TAUT,
STRAINED, FRACTURED), a day late; never the numbers.

**How drives build it.** acq consolidates (acquisitions, second locations, cornering) -> conc and
ineq rise. dom and sub win seats and clash with Prefects -> split and unrest rise. rev organises
against concentration -> split rises further. That is the polarization Scott asked for, and it
happens on its own because the drives are real preferences, not scripts.

**The catalogue of stabilizers** (each: what triggers it, what it does, how long, what the
Assembly gets to say). Kinds in *italics* already exist in the market engine.

| Kind | Fits strain | Effect | Assembly's say |
|---|---|---|---|
| *ANTITRUST ORDER* | conc | the largest holder sells a location or shares | ratify or repeal in an emergency session |
| *AUDIT* | conc, ineq | an overpriced holding is repriced (an in-game procedure, never a crime) | none (a procedure) |
| *CRASH* (margin call) | conc (market) | speculators and followers sell | votes the relief |
| *REVOLUTIONARY RUN* | conc | boycotts triple; co-ops open; a rev candidate surges in the advisory | none (people acting) |
| *EMERGENCY BALLOT* | any | the Overlord puts a knob on a 1-real-day ballot (levy x3, shops per owner, curfew lifted) | it is the Assembly |
| RECALL | split, unrest | a seat under 15 approval for 3 days goes to a by-election | the voters |
| JUBILEE | ineq | cooldowns cleared, citations wiped, a dividend bonus from the commons | ratify |
| THE GREAT FESTIVAL | unrest (conc low) | hed-led free night across the quarters, mood up | none |
| PREFECT RECALL | unrest | the Overlord swaps a REPUDIATED district's directive for an amnesty | can demand it back |
| THE INVENTION | ineq | a sch figure's breakthrough lifts an industry and opens rungs (mobility) | none |
| SCHISM | conc | the two biggest acq figures feud: affinity drops, they undercut each other | none |
| DISASTER | any, rare | a storm on the Coast, an avalanche, a scram at the Works: a district closes, rebuilds, alt figures lead | votes the relief fund |
| THE RETURN | split, rare | a dead figure on file whose drive opposes the dominant one is re-filed from the Archive into the fight (a trust-buster when moguls rule) | elects them or not |

**Selection** (deterministic, at a day boundary, from the chain through yesterday):
1. A cycle opens when T crosses a threshold drawn by hash for that cycle from 58..74, so no
   number is the trigger twice.
2. Candidates are the kinds whose strain matches the largest strain, minus any in cooldown.
3. Weight = base rarity x fit x novelty (x0.2 for the last kind fired, x0.5 for any of the last
   four, x1.5 for one not seen in 30 real days). Drawn by HMAC(server secret, day), like the
   market's noise, so it replays on the server and cannot be read from a published plan.
4. **Cooldowns:** one city-wide stabilizer per ~1 real day at most (the gap itself hashed 0.8..2
   days); a kind at most once per 7 real days; DISASTER and THE RETURN once per 21 days and at
   most twice a quarter. District-scale minor events (a recall, a pop-up shut) run on their own,
   smaller budget.
5. **Spontaneous:** about 1 in 40 real days something from the catalogue fires with no strain at
   all (weather, an invention). Without this a sharp player learns that calm means safe.

**Democratic** (Open question 3): the Overlord may act at once only for 3 days. Anything that
lasts becomes an EMERGENCY BALLOT on the existing docket (1 real day, the Substrate advisory
alongside, players decide, the Substrate only if zero players vote). An Overlord veto costs
legitimacy, as the ROADMAP already says.

## 4. The "because" layer

Every visible outcome carries `why: {t, who, d, cause, n}`: a template id, the keys of who acted,
the drive, the strain or rule that caused it, and its numbers. One shared renderer turns it into
one line in the Overlord's voice:

- "ROCKEFELLER BOUGHT KOWALSKI'S BAKERY THE DAY IT FAILED. HE NOW SELLS BREAD ON THREE PARADES.
  WANTS MORE."
- "ANTITRUST. ONE OWNER HELD 41% OF THE STRIP'S TAKINGS. THE DEPARTMENT ORDERS A SALE."
- "THE COMMONS SEETHED FOUR DAYS. THE UNDERCROFT FILLED. CHAVEZ OPENED A CO-OP."
- "CURFEW IN THE STRIP. NINE CITED. THE DEPARTMENT NOTES WHO."

**Where it shows:** the PA/ticker (every fourth line); the district's CIVIC RECORD (THIS WEEK, the
last five); the subject's file (RECORD OF CONDUCT, their last eight acts with their drive word);
the building cutaway's unit sheet (OWNER, and how it came to them); the market's whyOf; the
Assembly's emergency ballot (why it is on the ballot).

**Voice rules** (lint in `check-drives`, failing the build):
- The Overlord speaks. Living people never speak and are never quoted; dead figures may get a
  Department gag, never quotation marks.
- A living figure appears only as the actor of an in-game act (bought, filed, ran, was cited),
  consistent with their documented public persona and the drive the review signed off. No
  invented crimes, ever: a blocklist (fraud, crime, arrested, indicted, abuse, ...) fails any
  line naming a living figure. AUDIT, SCANDAL and SCHISM pick dead figures only (Open question 2).
- Grave-harm-excluded figures and the faiths' founders never appear in a because-line.
- Players appear as SUBJECT <TAG> only, never by case, and never as the target of a stabilizer.

## 5. Not feeling the machinery

- **Hidden variety:** per-cycle hashed thresholds, per-figure quirks, the drive's second place
  breaking ties, jittered cadences. (The market's fixed `CADENCE` per drive should become a hashed
  gap per figure, mean unchanged, so no investor trades every 12th day.)
- **No visible cycles:** no stabilizer, election swing or holdout has a fixed period.
- **Partial information:** the city shows words and outcomes, not the vectors or strains; drives
  are one word on a file; tension is a word, a day late.
- **Rarity:** two kinds you may see twice a quarter; the spontaneous 1-in-40.
- **Long arcs:** drift, ACQUISITION -> ANTITRUST -> SCHISM chains, THE RETURN.
- **Quirks** that are not optimal: they cost a figure a little, which is why they read as people.

**Test it** (`scripts/check-drives.mjs`, offline on the Mac: 90 real days = 5,400 machine days
at the live census and a 5,000 synthetic roster):
- stabilizer kind entropy >= 2.2 bits over 90 days, no kind > 30% of firings;
- the gaps between firings have a coefficient of variation >= 0.5, and the tension series has no
  autocorrelation peak > 0.4 at any lag of 1..30 days (no hidden period);
- polarization happens: at least two peaks of T >= 70 in 90 days; and resolves: T back under 50
  within 14 real days of every peak; the top 1% never past the market's 25% wealth share;
- because-lines: rendered distinct / total >= 0.6 per week, no template > 10%;
- determinism: rebuild == chain, bit for bit; the voice lint above.

## 6. Determinism, plan immutability, cost

- Drives are filed data; a `DRIVES_V` change takes effect from a machine day at least
  LOOKAHEAD + 1 after the newest published plan (the market's MARKET_SIM_FROM rule). Published
  days never change.
- Every drive effect happens at the builder's day step (the `ent` step before each day is built),
  from the census + yesterday's chained state + only *closed* external records (Assembly results,
  election results, the market's last closed real day), the same rule the Assembly's LOT_BREAK
  and the 4-day seating follow. Stabilizers are decided there, written into that day's summary,
  and revealed by the client only when their time comes (`tableAt`'s rule).
- **Cost:** drive derivation is O(1) per filing. The day step adds one O(N) pass (satisfaction
  term, opening rules, curfew citations, resistance shares) and an O(districts) strain fold.
  Against the measured cold build (Lambda: ~33 s at 5k, ~135 s at 20k) that is an estimated
  +3-5%: ~1-2 s at 5k, ~5-7 s at 20k, well inside the 15-minute background run. The social
  affinity bonus is constant per meeting. The advisory refresh (every 10 min) adds one O(N) term:
  ~0.2 s at 20k on Lambda. Nothing runs in a 30 s scheduled function except the existing wake-ups.
- **Size:** +15 bytes a figure in the census (0.3 MB at 20k, already sector-split); `strain`
  ~60 bytes a district; the drift block sparse (only figures who drifted), ~20 KB at 20k.

## 7. Rollout, smallest first

1. **Drives on file.** `drives.js`, the derivation, the review script, the market's roster derived
   from it. *Scott sees:* one drive word on every file; a review list of living figures to sign
   off. *Checks:* determinism; no drive above 30% of the census; every hint used; the excluded
   have no vector.
2. **Drives at work.** Satisfaction term, faster acq openings, ACQUISITION, CO-OP, KITCHEN, POP-UP,
   and the because-lines on the business file and the PA. *Sees:* moguls buying failing shops,
   co-ops on Commons Parade. *Checks:* enterprise's measured churn stays in band; conc measured.
3. **The strain gauge.** The four strains and TENSION in the civic record, no stabilizers. Run a
   week; set thresholds from what was measured, not chosen. *Sees:* CALM / TAUT / STRAINED on the
   city page.
4. **Stabilizers v1:** ANTITRUST, EMERGENCY BALLOT, JUBILEE, THE GREAT FESTIVAL, sharing cooldowns
   with the market's four. *Sees:* an emergency ballot on the Assembly page with why it is there.
   *Checks:* the section 5 metrics.
5. **Civic drives:** election slates, advisory blocs, Prefect resistance, curfew citations, THE
   UNDERCROFT, the Substrate docket.
6. **Social and sport:** affinity cliques, THE SCENE, holdouts and trade requests, the intake line.
7. **The rare kinds:** THE RETURN, DISASTER, THE INVENTION, SCHISM, drift.
8. **Player autopilot drives**, after Open question 1 is answered.

## 8. Open questions for Scott

1. **Where a player's drives come from.** (a) Computed from the sealed interview and kept private;
   (b) computed the same way, then the player picks which of their top three leads, shown as one
   word if they opt in; (c) players have no drives, their autopilot just follows the schedule.
   **Recommend (b):** it is their citizen, so they should get the say, and it costs nothing sealed.
2. **Living figures in stabilizers.** (a) Living figures act only unnamed ("AN INVESTOR"); (b)
   named for in-game acts only (bought, filed, ran, was cited), templated, no speech, no crimes,
   with AUDIT / SCANDAL / SCHISM limited to the dead; (c) named in everything. **Recommend (b):**
   it gives you the loudmouth finding the gap without putting words or wrongdoing on a real person.
3. **Overlord emergency powers.** (a) Nothing happens until the Assembly ratifies; (b) the
   Overlord acts at once for at most 3 days, and anything lasting goes to an emergency ballot; (c)
   the Overlord acts alone. **Recommend (b):** the deus ex machina arrives on time, and democracy
   still has the last word.
4. **NPCs filing proposals.** (a) No, players only; (b) a separate Substrate docket, at most one
   templated proposal a real day, which players adopt by co-signing; (c) NPCs file into the main
   docket as equals. **Recommend (b):** the city keeps generating politics while players are away,
   and players stay the only ones who decide.
5. **How often the big swing comes.** (a) Every 2-3 real days; (b) about once a week city-wide,
   with smaller district events every day or two; (c) about once a month. **Recommend (b):** often
   enough that a weekly visitor sees one, rare enough that it still reads as news.

## 9. Decisions (Scott, 2026-10-05)

All five recommendations in section 8 approved as written: drives from the sealed interview with the
player choosing which of their top three leads (shown only if they opt in); living figures appear in
stabilizers only through in-game acts, and audit / scandal / schism pick only the dead; Overlord
emergency powers last at most 3 days, anything lasting goes to an emergency ballot; NPC proposals on a
separate Substrate docket, at most one a day, adopted by player co-signs; about one city-wide swing a
week with small district events every day or two. Build order: after the living market's slice 1.
