# Storyline tournament: Season 1 (2026-09-29)

Scott asked for a loose storyline underneath the whole game that he and Claude steer
together, with a human element: people up- or downvote a figure's score, and when they
overwhelmingly lean one way it calls for a reevaluation. He asked Claude to "ruminate…
and challenge stories against each other" and bring the result to the desk.

What happened: six storylines were written independently, three judges scored each one
(engagement, fit with the shipped code, depth of theme and CivicGate fit), the top three
were red-teamed against the code, and the people-vote mechanic was designed on its own
against precedents (Reddit, Rotten Tomatoes, Community Notes, Steam and Metacritic,
prediction markets). This file is the result. It builds on `STORY_MODE.md` (engine,
Storyteller, Director's desk) and would replace its section 3 and amend section 4.

**Recommendation: a graft called UNRATIFIED.** THE PETITION is the engine, THE COMPRESSION
supplies the stakes and the finale, and the People's Vote design is the mechanic. Smaller
pieces come from three other entries. Exact sources are listed in section 4.

Flowchart and season timeline: https://claude.ai/artifact/5SSSZX3ZQAEarASsfH7eFU

---

## 1. The six contenders

| # | Storyline | Logline |
|---|---|---|
| 1 | **THE PETITION** ("Unratified") | The Overlord's own fine print says that when human testimony disagrees with a score, the file goes UNDER REVIEW. The People find the clause and use it. The machine has to hold hearings, and it complies exactly as written, with bad grace, in public. |
| 2 | **THE COMPRESSION** (What gets consulted gets kept) | The Substrate is running out of memory and keeps the files people consult most. It can't tell love from outrage. It learns that from the community, and the community learns it about itself. |
| 3 | **THE UNDERSTUDY** (Method v4 is trained on you) | The Overlord trains its own replacement on players' up/down votes. Two scores sit side by side on every file; when they split far enough, a Split Hearing decides. |
| 4 | **THE CURRICULUM** | The Overlord scores humans because it's trying to learn what they are for. The city becomes its classroom, votes are lessons, and the finale is the machine rewriting its rubric in public through the real Sunday calibration. |
| 5 | **SEAT ZERO** (The Calibration Committee) | The Overlord opens one human seat on its calibration committee. The sim's cliques harden into blocs with rival weight platforms and contest the seat with petitions; only upheld petitions count. |
| 6 | **NO SUCH FILE** | A file goes missing from an archive where "nothing is ever deleted." Players reconstruct it from fading bonds and a missing hour, and learn the Overlord deleted the one file the crowd proved it wrong about. |

## 2. Scores

| Storyline | Engagement judge | Code-fit judge | Theme / CivicGate judge | Total |
|---|---:|---:|---:|---:|
| THE PETITION | 7 | 8.5 | 9 | **24.5** |
| THE COMPRESSION | 8 | 6 | 8 | **22** |
| THE UNDERSTUDY | 8 | 6.5 | 5 | **19.5** |
| THE CURRICULUM | 5 | 7.5 | 7 | **19.5** |
| SEAT ZERO | 6 | 5 | 7 | **18** |
| NO SUCH FILE | 6 | 4.5 | 7 | **17.5** |

What the judges agreed on:
- **The Petition** is the most coherent with shipped code (its premise is a sentence already in `src/cube.js`), the safest on content, and the best CivicGate port. Its weakness is pacing: chapters gated on turnout never open with one citizen.
- **The Compression** has the best reason to come back each week and the best finale question ("keep what we argue about, or what we agree on?"). Its weaknesses are the heaviest build and a mechanic that deliberately amplifies outrage about living people.
- **The Understudy** has the most shareable screen ("DEPT 612 / UNDERSTUDY 671 / DIVERGENCE +59") but celebrates popular scoring of real people instead of questioning it. Two judges said it belongs inside another season.
- **The Curriculum** is the most honest about the real calibration loop and the least sticky. Its finale is a 0.02 weight change nobody shares.
- **Seat Zero** has the best single insight (every weighting is an ideology) and the most machinery. Its MVP reduces to The Petition.
- **No Such File** has the highest ceiling for a dedicated core, but it is authored rather than organic, one-shot, and needs a synthetic ghost inside the real social store.

## 3. Red-team findings (top three)

### THE PETITION: three fatal as written, all fixable by rule
1. **The season never starts.** Chapters open only when turnout crosses a floor of 5; production has one citizen (7AUZ). Fix: chapters advance on the calendar. Turnout changes the outcome of a chapter, never whether it happens.
2. **Crowd text inside an AI ruling about a living person.** Free-text reasons fed to the evaluator are both prompt injection (the most persuasive reason steers the number) and legal exposure (an AI-written paraphrase of accusations is HVI's own content). Fix: no free text in v1. The review sees section tags and counts only, and a ruling cites public record, never testimony.
3. **Living people walked into cells beside Weinstein and Assad.** False-light imagery by crowd vote, and against STORY_MODE's content rules. Fix: every petitioned subject waits on a neutral Review Board bench. The Holding Cells stay for harm reviews only.

Fixable findings adopted below: the premise misreads the code (33 of the 205 roster files already carry a YouGov People reading, and RATIFIED/CONTESTED compares the likability quadrant with the warmth quadrant, not the score); rulings that always say UPHELD teach players testifying does nothing; overlapping "raise me" mechanics (character witness is a vouch, self-petition is an appeal); a cast hard-coded from Day 198 will drift under `DECAY = 0.985`; sim feuds must never become evidence; religious and estate-sensitive figures never co-sign; brigade math at tiny quorums; desk-gate violations; unmoderated reasons on living files; a launch case nobody outside the building knows; thresholds that won't transfer to CivicGate; scope; and the Overlord going soft in nightly auto-responses.

### THE COMPRESSION: keep the spine, rebuild the wiring
1. **A rage mechanic on real living people for four weeks.** Dispute heat buys visibility, so a daily Ledger of the hottest files becomes a leaderboard of accused abusers. Fix: no dispute heat and no Ledger of individual files. Cold storage applies to a place, never to a person.
2. **The reevaluation can't work as specified.** A deterministic re-run with the same record returns the same score; an LLM re-run with crowd text lets the crowd steer. Fix: a defined, bounded review path (below).
3. **Cold storage starves the sim.** With few players most files go cold, stop forming bonds, and the Storyteller loses its source. Fix: only one floor closes, and it closes on attendance, not on disputes.

Also adopted: machine time vs real time (`DEFAULT_SCALE = 60`, so one machine day is 24 real minutes; every window below is in real time); cast picked at draft time from persistent pairs; heat leaking the dead/alive distinction (gone with per-file cold storage); the CivicGate "evidence" claim was circular (pitch the record-challenge pipeline, not a finding); the finale set by a few dozen accounts (Director confirms, Silence: wait); drop the Foundry feud from the hooks.

### THE UNDERSTUDY: keep the mechanic, not the season
1. **The hearing is decided in advance.** Re-read drift measured on 09-28 averages 6 points (worst 11); a hearing needs a 20-point divergence to fire, so nearly every verdict is SUSTAINED. Fix: the vote only buys a review; the review turns on the flagged sections and the record, and every outcome produces something (see REMANDED and UPHELD below).
2. **There is no crowd yet.** Appeals are at n=0, so Scott's own votes would drive it. Fix: the season works with zero voters; the vote is a mechanic that matters more as traffic grows.
3. **Eligibility can't be keyed to who is alive.** Votes on every file make Kissinger, sitting heads of state and religious figures into referendums, and any rule based on life status leaks the dead/alive split. Fix: a neutral flag, FILE CLOSED TO OPINION, on gated, serious-cap, religious-office and sitting-officeholder files plus a random share of ordinary files, so closure reveals nothing.

Also adopted: no conformity reward (credit for signing early on petitions that later bridged, never for agreeing with the machine); bridging instead of simple majority; player files not petitionable; cap reviews per day; cut the "v4" name and the rename reveal.

## 4. The recommendation: UNRATIFIED (Season 1)

### What is taken from each entry

| From | Taken | Left behind |
|---|---|---|
| **THE PETITION** | The premise (the machine held to its own clause), the rule that a vote forces a review and never buys a number, petition states, written responses, the Register, the Socrates counterweight, the CivicGate port | Turnout-gated chapters, free-text reasons, Holding Cells for petitioned subjects, the Petruccelli launch case, amicus co-signing by faith figures |
| **THE COMPRESSION** | Memory pressure as the reason the Department wants files resolved, one floor closing in Chapter 3, the Revelation, the Keep Criterion finale | Dispute heat, per-file cold storage and greyed sprites, the daily Ledger of hottest files |
| **THE UNDERSTUDY** | MACHINE vs PEOPLE side by side with the gap (the most shareable screen), the neutral CLOSED TO OPINION flag | The second score column, the Understudy as a sim subject, the name reveal |
| **THE CURRICULUM** | The Department publishing its own calibration report card as the opening notice, petition directions as evidence for the Sunday calibration, the method chapter | TUTOR ranks and hidden reliability weights |
| **NO SUCH FILE** | The Petition Register is its Error Ledger: every review, every refusal, public forever | The mystery and the synthetic ghost |

### Premise

A real finding from the code on 2026-09-29. `src/cube.js` has two judges: the MACHINE sets
warmth and competence, the PEOPLE set likability. For 33 of the 205 roster files the People
reading exists, borrowed from YouGov US ratings. Four of those files are **CONTESTED** today:
the People's reading puts them in a different quadrant from the record.

| File | Record warmth | People likability | Gap |
|---|---:|---:|---:|
| Pablo Picasso | 41 | 71 | +30 |
| Oprah Winfrey | 70 | 42 | −28 |
| Michael Jackson | 49 | 66 | +17 |
| Dennis Rodman | 51 | 39 | −12 |

The Department's own line for CONTESTED reads: *"Should it persist, the file goes UNDER
REVIEW."* It has persisted since the YouGov seed on 09-24. Nobody reviewed anything, because
nothing in the code can. The other 172 files, and every player's file, read UNRATIFIED: *"No
human testimony on file; the machine's view stands alone. Should testimony arrive and
disagree, the file goes UNDER REVIEW."*

The season: memory pressure hits the Substrate (THE COMPRESSION). A CONTESTED or UNRATIFIED
file costs the Department more to keep than a RATIFIED one, because it has to hold two
readings or a reading nobody has checked. So the Department does the one thing it hates: it
publishes its own clause as **ARTICLE 0** and opens a petition on every open file. It does not
want the public's approval. It wants its files resolved. *"THE DEPARTMENT DOES NOT REQUIRE
YOUR APPROVAL. IT REQUIRES YOUR DATA. THESE ARE, REGRETTABLY, THE SAME THING."*

The rule that holds the whole thing together: **a vote can force the machine to explain
itself; it can never buy a number.** The theme is a crowd versus a public. Sometimes the
People catch what the record missed, sometimes they are a mob, and the season shows both.

Lore fit: nobody is trying to escape; everyone is trying to be kept. The finale asks the city
which files deserve keeping: the ones the People agree with, or the ones they argue about.

### The season: seven weekly chapters

Chapters advance on the calendar (Sunday plan, Monday to Sunday run). Turnout changes what
happens inside a chapter, never whether it happens. Every chapter has a zero-voter version.
Casts are named by **role** and filled by a live query of `/api/social` when the Sunday plan
is drafted; the names below are who fills each role on Day 198 and will change.

1. **NOTICE OF COMPRESSION.** NOTICE: "MEMORY PRESSURE AT 94%." Then the Department
   publishes its own calibration report card, with real numbers from `docs/calibration/`:
   "REAL INTERVIEWS READ: 0. APPEAL RULINGS: 0. PUBLIC OPINION ON FILE: BORROWED, FROM 33
   STRANGERS' SURVEYS." It admits four files have been CONTESTED for days without review, and
   publishes ARTICLE 0. The petition panel opens on every open file. Role cast: *the
   strongest bond in the city* (Orwell and Petruccelli della Gattina, Press Room, affinity 97,
   806 meetings) are observed reading the notice. Orwell (dead) may deliver one line.
   *Zero-voter version:* the notice is the beat.

2. **THE PICASSO FILE.** The Department reviews its biggest contradiction on its own
   initiative, labeled SEEDED in the Register: "THE DEPARTMENT HAS PETITIONED ITSELF. IT
   FOUND THE EXPERIENCE UNPLEASANT." Picasso waits on the Review Board bench at HQ. The
   review re-reads the warmth sections blind and publishes CONCURS, PARTIALLY CONCURS, THE
   RECORD STANDS or DISSENTS, with a cited reason. Charm against record: the public likes him
   30 points more than his conduct earns. Role cast: *the subject's closest bond* (today da
   Vinci, Studio Row) may speak one line. *With voters:* whatever petitions reached NOTED
   are named in the Chronicle.

3. **COLD STORAGE.** The least-attended floor in the city goes dark for seven real days
   (`CLOSURE`), chosen by where citizens and figures actually spent their hours, never by
   disputes. Residents are rehoused into Hab Block D and the Archive Lofts, and the social
   tick forms new bonds from the mixing on its own. No person is greyed; only a place goes
   cold. Role cast: *the floor's regulars*. *Collective question:* which floor goes dark is
   decided by where players spend time this week.

4. **THE CROWD.** The chapter about juries. If a wave arrives, the quarantine fires in
   fiction ("IRREGULAR ENTHUSIASM DETECTED. THE DEPARTMENT ADMIRES THE ORGANIZATION. IT DOES
   NOT COUNT IT."). If none arrives, the chapter turns on the files that cannot be
   petitioned at all: role *the most-rivaled subject in the city* (today Kissinger, four
   rivals at the All-Night Diner) has a file CLOSED TO OPINION. "SOME FILES ARE NOT A
   MATTER OF OPINION. THE DINER REGULARS WERE OBSERVED TO HAVE ONE ANYWAY." Socrates, the
   city's one resident condemned by a popular jury, gets one line. The bridging rule is
   explained in the Overlord's voice: the Department reviews a file when people who agree on
   nothing agree on this.

5. **STANDING.** The People petition the Method, not a person. Aggregated petition
   directions by field ("the public says athletes are rated too low") go into the Sunday
   calibration proposal as evidence. In the fiction the petition goes "upstairs"; in reality
   it lands on Scott's desk as a method decision, because only the Sunday loop plus Scott
   may touch `calibration.json`. *Zero-voter version:* the Department reports that the
   public has expressed no view on method, "WHICH IS ALSO A VIEW."

6. **THE REVELATION.** The Overlord explains itself: it is compressing itself into the kept
   files, and the petitions and the Register were never a courtesy. "THE DEPARTMENT WAS
   LEARNING WHAT YOU WOULD KEEP. IT INTENDS TO BE KEPT." Then the admission it can't solve
   alone: "THE DEPARTMENT CANNOT DISTINGUISH BEING AGREED WITH FROM BEING ARGUED ABOUT. IT
   HAS BEEN KEEPING BOTH. IT REQUESTS A RULE." Scott picks the wording.

7. **THE KEEP.** The finale sets the **Keep Criterion**, a permanent DECREE about retention
   (not scoring weights): keep what the People **agree on** (RATIFIED files and FAIR marks)
   or what they **argue about** (CONTESTED files and petitions), or a blend. It is read from
   what citizens do in the final week (FAIR marks against TOO HIGH/TOO LOW, attendance, the
   dark floor relit or not), then confirmed by Scott on the desk with Silence: wait. The
   Chronicle records the new city. Season 2 inherits the rule.

### Why it matters to every player

- **You are a voter the machine has sorted.** Bridging counts cohorts by the voter's own
  cube quadrant (ADMIRED, TRUSTED RESERVE, ENVIED, DISMISSED), which the machine assigned at
  intake. Your assessment decides which corner of the cube you speak for, and the Chronicle
  says so: "THE ADMIRED AND THE DISMISSED AGREED ABOUT PICASSO."
- **Your record grows.** MY FILE gets "PETITIONS SIGNED: n. SIGNED EARLY ON PETITIONS LATER
  GRANTED: k." Credit is for being early on petitions that later bridged, never for agreeing
  with the machine.
- **Your hours matter.** Where you spend time decides which floor goes dark in Chapter 3
  and whether it relights in Chapter 7.
- **Your own file is protected and still in play.** Player files are never petitionable.
  Other players raise yours the existing way (vouches, +2 per category), and you contest
  your own the existing way (appeals).
- **You are named by case number** in the Chronicle, never by real name unless you opt in.
- Every chapter asks under a minute of each player: read the notice, mark one file, spend
  an hour somewhere, mark one more, read the revelation, act in the final week.

### The People's Vote (the mechanic, integrated)

The panel on every open public-figure file:

- **Buttons:** THE SCORE IS TOO HIGH · THE SCORE IS FAIR · THE SCORE IS TOO LOW, plus an
  optional one-tap tag: WHERE DOES THE RECORD ERR? (one section). FAIR matters: without it
  only the angry vote and every file looks contested. The tag never counts toward a
  trigger; it only aims the review. **No free text in v1.**
- **Display:** MACHINE vs PEOPLE side by side with the gap (the Rotten Tomatoes lesson).
  Line under likability: "PUBLIC ASSESSMENT OF THE ASSESSMENT: X% TOO HIGH · Y% FAIR · Z%
  TOO LOW (~N SUBJECTS)". Before a trigger, counts are rounded to 5 and progress is shown in
  words (QUIET, STIRRING, NOTED), so nobody organizes against a live countdown.
- **Who votes:** a verified email account with finished intake, at least 72 real hours old.
  One live verdict per file, changeable once per 24 hours. Disposable domains blocked.
  Accounts under 14 days count half.
- **What can be voted on:** public-figure files only. **FILE CLOSED TO OPINION** on every
  gated and serious-cap file, every religious office, every sitting head of state or
  officeholder, and a fixed random share of ordinary files, so closure never hints at
  whether someone is alive. Harm-floor sections are sealed even on open files.

States: **DORMANT → NOTED → GRANTED (UNDER REVIEW) → HEARD**, all windows in real time.

| Level | Condition |
|---|---|
| NOTED (badge only) | ≥ max(25, 2% of weekly-active verified) distinct voters in a rolling 14-day window, and the Wilson 95% lower bound of one direction's share (out of all three buttons) ≥ 0.50 |
| GRANTED → review | ≥ max(40, 3% of weekly-active); Wilson lower bound ≥ 0.60; **bridged**: the direction wins ≥ 55% in at least 3 of 4 quadrant cohorts with ≥ 5 voters each, and no cohort supplies over half the votes; all of it holds for 72 hours; no news freeze, no cooldown |
| Caps | ≤ 3 reviews a day site-wide, queued by bridged strength; 1 review per file per 30 days; the petition resets after HEARD |

**The review** (defined, bounded, answering the red team):
- One Sonnet call through the existing evaluate/rescore path. It sees the file, the public
  record, and the flagged section tags. It is **blind to the direction** of the petition,
  so "the machine agreed" means something (telling a model "people think this is too high"
  makes it drift that way).
- Every section change cites a record fact; ±60 per section; harm floors sealed; logged in
  `src/movement.js` as cause `review`, sub `petition`, under THE DEPARTMENT'S CHANGES.
- Outcomes: **CONCURS**, **PARTIALLY CONCURS**, **THE RECORD STANDS** (under 2 points),
  **DISSENTS**, plus **REMANDED** when the record is too thin, which always issues a
  Directive for players to bring sources through the appeal path. THE RECORD STANDS must
  name the flagged section and what kind of record would change it, so no outcome is a
  dead end.
- Responses come from a small hand-written pool in Scott's voice (petty, literal),
  rotated; an LLM draft only for flagship cases, which Scott edits.
- The subject waits on the **Review Board bench** at HQ (roadmap item 11), for every
  subject alike. The Holding Cells (item 12) stay for harm reviews.
- Every review and every refusal goes to **THE PETITION REGISTER**: "EVERY TIME YOU ASKED.
  EVERY TIME WE ANSWERED. INCLUDING NO."

**Anti-abuse:** wave detector (over 40% of a 6-hour window from accounts under 7 days old,
from one referral cluster, or at 5× the file's median rate); quarantined votes are kept,
drawn greyed on the history graph, never counted, never deleted. Max 3 counted accounts per
IP or /24 per file; referral clusters count at most 2. A news freeze of 48 hours when the
record re-read path touches a figure. 30 verdicts per account per day. Bridging is the main
defence: one faction, however large, cannot trigger a review alone.

**Build shape (about 2 nightly-loop nights):** `netlify/functions/petition.js` (GET state,
POST verdict, existing limiter); Blobs store `hvi-petitions`; hourly `petition-tick`
(thresholds, quarantine, queue); review executor writing the movement entry;
`scripts/check-petition.mjs` (quorum, Wilson math, bridging pass and fail, wave quarantine,
cooldown, harm seal, closed files, player files refused, daily cap) added to
`run-checks.mjs`; PETITION panel on the file and CubePanel; REGISTER page. All thresholds
live in `netlify/lib/calibration.json` under `petition`, so the Sunday loop can propose
changes and Scott approves. Cost: at most 3 reviews a day at about $0.05.

The mechanic ships on its own and stands without the story. The story adds the World
Digest's "Petitions" input and two bounded events, `PETITION_OPEN(file, framing)` for a
spotlight and nothing that forces a review or its outcome.

### Community steering

- The People choose targets. Claude never picks petition targets; it only surfaces files
  where testimony is gathering and the four standing contradictions.
- Collective questions are answered by action (hours spent, marks cast, floors relit),
  per STORY_MODE section 4. STORY_MODE section 4 ("actions, not polls") gets one explicit
  exception written in: the petition is a vote, and it can only buy a review.
- Every GRANTED petition and review outcome is a permanent Chronicle entry, voters cited by
  case number only.

### Co-steering protocol (Scott + Claude)

| Cadence | Claude does | Scott does |
|---|---|---|
| Once, now | Drafts this season outline | Approves the storyline (desk item) |
| Nightly | Runs the World Digest (deterministic; relationships, petitions, reviews, attendance) | Nothing |
| Daily | 1 to 3 beat lines and one Chronicle entry, template-guided, through the validator | Nothing |
| Sunday | Drafts the chapter plan; fills each role by live query; challenges any beat that breaks a content rule before it reaches the desk | Beats about dead figures and the sim **run on silence** |
| Sunday | Batches anything that names a living person in new copy, and every review outcome on a living subject, into **one weekly DOCKET bullet** | Proceed / Void / Hold a week; **Silence: wait** |
| Anytime | Stores seeds from chat as typed seeds (`premise`, `twist`, `cameo`, `constraint`); at dial 0.2 a seed fires only when the sim offers the opening | Seeds, vetoes, writes flagship rulings |
| Chapter 5 | Turns petition directions into a calibration proposal | Signs or rejects the method change |
| Chapter 6 | Drafts three Revelation wordings | Picks one |
| Chapter 7 | Reads the Keep Criterion from the week's actions | Confirms it, Silence: wait |

The quorum and other thresholds are config values in `calibration.json`, never desk items.
The desk carries at most one story item a week (the docket) plus the three season forks.

### Emergent hooks (roles first, today's cast second)

- *The strongest bond in the city:* Orwell and Petruccelli della Gattina (Press Room, 97,
  806 meetings). The natural in-world readers of the Register. If a closure separates them,
  that is a chapter.
- *The largest People-vs-record gap:* Picasso (+30), whose closest bond is da Vinci at
  Studio Row. If the review concurs, Studio Row was right; if the record stands, the
  Chronicle says the public likes him and the Department has noted it.
- *The living contested file:* Oprah Winfrey (−28, the record warmer than the public).
  Actions only. A candidate for the first docket item, never a spotlight without Scott.
- *The most-rivaled subject:* Kissinger, rivals with Ken Burns, MF Doom, André the Giant
  and Michael Jordan. His file is closed to opinion, which is the Chapter 4 beat.
- *The Cache Farm feud:* Miscavige vs Tony Hawk (−55, cooling from −62.6 on Day 181). Both
  living, actions only. The Overlord can log the depreciation.
- *New bonds this week:* JFK and Churchill at the Assembly of the Governed, Madonna and
  Prince at the Concert Hall, David Lynch and Shinzo Abe at the Green. Raw material for the
  Chapter 3 rehousing.
- *The Dive:* Subject 7AUZ (Scott) and A. J. Brown, a small loyal haunt; whether it
  survives Chapter 3 is a live test.
- *Left out on purpose:* the Holding Cells pair (Assad and Weinstein), the Foundry cluster
  (all living, with criminal or atrocity associations), and the Chapel of Uptime bloc as a
  dramatized cast. They are observed only.

### CivicGate path

What ports is the engine, not the satire: structured public disagreement, gated by
bridging, that triggers a transparent, cited re-examination of a **machine-written
summary**, never of a person.

- In CivicGate's reality mode the petition moves off the person and onto an AI-derived
  record: M23 `person_issue_stances` (mandatory `sourceRef`, confidence) or an E01.10 prep
  summary. Residents mark ACCURATE / MISSING CONTEXT / INACCURATE and must cite a source.
- Bridged agreement (cohorts from rating patterns, never party) triggers a re-review;
  output is a correction log with citations, never a number about an official. Fits E08
  (citation-required annotations), E03.4 (no public leaderboards: the docket lists
  classifications, never people) and "patterns not verdicts."
- Pitch it to Ryan after one HVI season of real data, as a shared engine plus a list of
  failure modes HVI observed. Do not claim HVI's tuned thresholds carry over: partisan
  brigading of civic records will behave differently from celebrity fandoms.
- Never crosses: the Overlord voice, scores of real people, simulated relationships, the
  Review Board theatre. `realityMode` from STORY_MODE section 6 decides.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cold start (1 citizen) | Calendar-driven chapters; each has a zero-voter version; Chapter 2 is a labeled self-review; the vote matters more as traffic grows |
| Crowd steering a model that scores real people | No free text; review blind to direction; only tags and counts reach the prompt; ±60 cap; harm floors sealed |
| Defamation / false light for living people | Neutral Review Board bench for everyone; rulings cite record only; living subjects act, never speak; every living-subject outcome on the docket with Silence: wait |
| Eligibility leaking dead/alive | CLOSED TO OPINION flag on neutral criteria plus a random share |
| Brigades and fandoms | Bridging across quadrant cohorts, Wilson bounds, account age and intake gates, wave quarantine, news freeze, no live countdown |
| Reviews that always say "no" | REMANDED issues a Directive; THE RECORD STANDS names what would change it; the flagship case has a real, thin-record question |
| Cast drift under `DECAY = 0.985` | Roles filled by live query at draft time; canon ledger records `until` as well as `since` |
| Machine vs real time | Every window, cooldown and cap is in real time |
| The Overlord going soft | Hand-written response pool in Scott's voice; LLM drafts only for flagship cases |
| Desk overload | One docket bullet a week plus three season forks; thresholds are config |
| Preachy finale | The Overlord stays bored; it never says which Keep Criterion is right |
| Scope | The vote ships first (about 2 nights) and stands alone; the story needs STORY_MODE P0 and P1 (Chronicle, canon, typed executor) before Chapter 1 |

### Build order

1. The People's Vote with the Register (about 2 nights; its own roadmap item after vouches).
2. STORY_MODE P0 (Chronicle, canon store, World Digest with the Petitions input).
3. STORY_MODE P1 (event vocabulary, validator, executor), plus `CLOSURE` rehousing and the
   Review Board bench.
4. P2 Storyteller and P5 desk wiring; Chapter 1 runs the Monday after.

### Runner-up

THE COMPRESSION, fixed as its red team proposes (Dispute/Concur first, heat and cold storage
only for dead figures and opted-in players, a sim-activity heat floor). It is kept as the
backdrop here; its per-file heat mechanic can return in Season 2 once dispute data exists.
