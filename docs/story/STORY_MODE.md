# HVI Story Mode — design (2026-09-28)

Scott: "weave a story mode into this thing that is relevant to everyone interacting with
it… a nice balance of it evolving on its own and me steering it a little… fairly organic…
an experimentation in AI-driven gaming… drive community interaction within a virtual space
… to the point where we can easily move this into the space of CivicGate."

Flowchart: see the artifact linked in the report ("HVI Story Mode").

---

## 1. What the research says (principles we adopt)

| Precedent | What it teaches | Principle for HVI |
|---|---|---|
| **RimWorld storytellers** (Cassandra / Phoebe / Randy) pace threats from colony wealth, population, recent losses and time since the last big event [1] | A storyteller is a *pacing persona* reading world state, not a plot | The Storyteller reads a state digest and picks *tension*, with a persona dial |
| **Left 4 Dead AI Director** — build-up → peak → relax, driven by a player-intensity model (Booth, GDC 2009) [2] | Drama is a rhythm; rest is part of it | Weekly chapters with a peak and a quiet stretch; never escalate every day |
| **Dwarf Fortress legends mode** — history simulated, then browsable [3] | Emergent history is only a story once someone can *read* it | A permanent, browsable **Chronicle** of the Substrate |
| **Generative Agents / Smallville** (Park et al. 2023) — memory stream, retrieval by recency/importance/relevance, reflection, planning; an unscripted Valentine's party emerged [4] | Coherence comes from *memory + periodic reflection*, not a huge context | Chronicle + canon ledger; the Storyteller reads summaries and reflections, not raw logs |
| **Façade** drama manager (Mateas & Stern 2005) selects authored beats in response to players [5] | The AI should *choose and sequence* from a vocabulary, not free-generate reality | The Storyteller emits **typed events** from a fixed vocabulary; deterministic systems execute them |
| **Story sifting** — James Ryan, *Curating Simulated Storyworlds* (2018); Kreminski's Felt/Winnow [6] | Simulations already produce stories; the craft is noticing them | The Storyteller's main job is **sifting**: find the arcs the sim already made |
| **LLM narrative pitfalls** (AI Dungeon-style) — drift, forgotten characters, rule changes, rising cost with context [7] | Unbounded generation decays | LLM never owns state; canon is data; small bounded prompts; cost caps |
| **Wildermyth** — procedural campaigns stitched with authored events that react to characters [8]; **Crusader Kings** — narrative from character systems [9] | Authored beats + systemic characters = stories that feel written but are unique | Scott's seeds are authored beats; the sim supplies the cast and consequences |
| **Fortnite chapters / Destiny seasons** — shared, time-boxed story moments [10] | A live world needs *shared dates* | Seasons of ~6 weekly chapters; the finale is a city-wide event |
| **Twitch Plays Pokémon, r/place, EVE's Bloodbath of B-R5RB** [11] | Collective action is the story when it leaves a mark | Community outcomes come from **actions**, and are recorded forever in the Chronicle |
| **Community PlanIt** and civic games [12] | Game structure can carry real deliberation | The same engine can run civic "seasons" in CivicGate, with a reality mode |

Sources: [1] rimworldwiki.com/wiki/AI_Storytellers · [2] M. Booth, "The AI Systems of Left 4 Dead", GDC 2009 (valvesoftware.com/en/publications) · [3] dwarffortresswiki.org/Legends · [4] Park et al., "Generative Agents: Interactive Simulacra of Human Behavior", UIST 2023 (arxiv.org/abs/2304.03442) · [5] Mateas & Stern, "Façade: An Experiment in Building a Fully-Realized Interactive Drama", GDC 2003/AIIDE 2005 · [6] J. Ryan, *Curating Simulated Storyworlds*, PhD thesis, UC Santa Cruz, 2018; M. Kreminski et al., "Felt: A Simple Story Sifter", ICIDS 2019 · [7] reports on continuity loss in AI Dungeon-style play (e.g. alibaba.com product-insights comparison) · [8] wildermyth.com · [9] paradoxinteractive.com/games/crusader-kings-iii · [10] fortnite.com/news, bungie.net/7/en/Seasons · [11] en.wikipedia.org/wiki/Twitch_Plays_Pokémon, reddit.com/r/place, eveonline.com/news/view/the-bloodbath-of-b-r5rb · [12] Vanolo, "Cities and the politics of gamification" (2018).

**The one-line thesis:** *the simulation writes the story; the Storyteller notices it, names it, paces it, and occasionally nudges it; the community decides how chapters end; Scott seeds and vetoes.*

---

## 2. The Storyteller

### Inputs — the nightly **World Digest** (deterministic, no LLM)
Computed by a scheduled job from live state, ≤ ~3k tokens:
- **Relationships:** new friendships/rivalries, strongest movers, clusters forming (from `hvi-social`).
- **Scores:** biggest movers (by cause: visit/appeal/vouch/method/record/review), tier crossings.
- **City:** crowded/empty places, district activity, shift anomalies.
- **Reviews:** harm reviews, appeals, summons.
- **Players:** interviews, referrals, quests completed, which districts citizens chose, their relationships.
- **Open threads:** unresolved canon threads from the Chronicle.

### Outputs — data, never prose that changes state
1. **Chapter bible** (weekly): title, premise, cast (5–8 subjects the sim already made interesting), 5–7 daily beats, the collective question, possible outcomes, tone notes.
2. **Scheduled events** from a fixed vocabulary, executed by deterministic systems:
   `NOTICE(text)` · `GATHERING(place, cast, hour)` · `CLOSURE(place|floor, days)` · `SURGE(place, factor)` · `SUMMONS(subject → Holding Cells)` · `DIRECTIVE(figure → quest template)` · `DECREE(rule change, bounded)` · `MARKER(chronicle entry)`
   Every event is validated (known ids, bounded magnitudes, content rules) before it runs.
3. **Daily beats**: 1–3 PA/gossip lines and one Chronicle entry per day (Haiku, template-guided).

### Cadence
- **Daily:** digest → beat lines (cheap).
- **Weekly (Sunday):** chapter plan (one Sonnet call) → Director's desk → runs Monday–Sunday.
- **Season (~6 weeks):** an arc with a finale event.

### Memory — coherence over months
- **Chronicle** (append-only): dated entries, every chapter and outcome. The public "legends mode".
- **Canon ledger**: typed facts (`entity`, `fact`, `source`, `since`), e.g. "Cache Farm feud: Miscavige vs Hawk, nemesis since Day 144". The Storyteller must cite canon ids; a new "fact" that contradicts canon is rejected.
- **Reflections**: at chapter end, a ≤300-word summary replaces the raw beats in the Storyteller's prompt (the Generative Agents reflection pattern).
- **Prompt budget:** canon summary + last 2 reflections + this week's digest. Never the full log.

### Cost caps
- Daily beats: ~6 Haiku calls/day ≈ $0.05/day.
- Weekly chapter: 1–2 Sonnet calls ≈ $0.20/week.
- Hard cap: $1/day story budget, enforced like the existing Anthropic caps; over budget → template-only beats.

### Tone and content rules (unchanged house rules, enforced by the event validator)
- The cold Overlord: darkly funny, never cruel; bureaucratic; it takes notes.
- **Living people: actions only** — co-location, jobs, observed patterns ("seen together at the Exchange. Again."). No invented speech, opinions, intentions or plans.
- Dead figures may speak only through the existing figure-voice rules.
- No founders/prophets. No depiction of real-world crimes as new events. The sim's rivalries are labeled as *observations of the simulation*, never claims about real people.

---

## 3. The main arc — "The Compression"

**Premise (Season 1):** the Substrate is running out of memory. The Overlord must move files to **cold storage** to keep running. The assessment everyone has been taking was never a joke: it's the retention ranking. *Why* the Overlord assesses everyone is the mystery; the answer arrives in pieces through the season.

**Why it matters to every player:** your file is a claim on memory. Everything you do — your interview, appeals, quests, vouches, where you spend time, who you associate with — is evidence for being **kept**. Nobody is trying to escape the machine. They are trying to be retained.

**Stakes, kept humane:** cold storage is dormancy, not deletion ("YOUR FILE IS NOT DELETED. IT IS MERELY NO LONGER CONSULTED."). Files can be thawed by community action.

**Season beats (6 chapters):**
1. *Notice of Compression* — the problem is announced; districts are asked to prove their value.
2. *The Audit* — the Cache Farm and the Records Hall are audited; a district is chosen for compression.
3. *Cold Storage* — a floor goes dark; its occupants are displaced; new relationships form.
4. *The Petition* — the community can thaw one file by collective action.
5. *The Revelation* — the reason for the assessments (the Overlord is compressing *itself* into the kept files).
6. *The Keep* — finale: the Substrate is re-partitioned by what the community valued; the Chronicle records the new city.

---

## 4. Community mechanics — actions, not polls

- **Collective questions** are answered by what people *do*: which district citizens spend their in-game time in, who they refer, whose appeals succeed, which quests they complete, later how they allocate CYCLES. A weekly tally resolves the question.
- **Outcomes change the city** through the event vocabulary: closures, surges, new places, decrees, thaws.
- **Players appear in the Chronicle** by case number (never real names unless they opt in): "SUBJECT 7AUZ HELD THE DIVE THROUGH THE AUDIT."
- **Anti-abuse:** only verified (email-login) accounts count toward tallies; per-account weight caps; rate limits; anomaly flags (sudden surges from new accounts are quarantined, not counted); the Director can void a tally.

---

## 5. The Director's desk (Scott steering)

- **Seeds:** Scott writes premises, twists or cameos in chat; Claude stores them as typed seeds (`premise|twist|cameo|constraint`, weight, earliest date).
- **Weekly approval:** Sunday's chapter plan lands on the desk as one decision: `Options: Run it / Reject / Edit`, `Recommend: Run it`, `Silence: proceed` (the organic default keeps the world moving when he's busy).
- **The dial:** `organic ↔ steered` (0–1). At 0.2 (the default) the Storyteller uses seeds only when the sim offers a natural opening; at 0.8 seeds become chapter premises.
- **Veto anytime:** any scheduled event can be cancelled from the desk before it fires.

---

## 6. Porting to CivicGate — the layering

| Layer | HVI | CivicGate |
|---|---|---|
| **Domain** | Subjects, public-record files, scores, verdicts | Officials, candidates, bills, votes, donors (**real records, factual**) |
| **Sim** | Places, schedules, relationships | Civic spaces (chambers, committees, town halls), calendars; **relationships from real data** (co-sponsorship, coalitions), never simulated |
| **Storyteller** | Satirical chapters, Overlord voice | **Reality mode**: narrates only verified records and scheduled civic events (sessions, hearings, deadlines); flags any inference; neutral voice |
| **Community** | Actions → collective outcomes, Chronicle | Participation → hearing attendance, comments, Debatr debates; a civic Chronicle of what the community did |

**Never crosses over:** satirical scores or Overlord verdicts about real officials; simulated relationships presented as real; invented speech; the HVI tone. The engine is shared (digest → Storyteller → typed events → executor → Chronicle); the domain adapter and a `realityMode` flag decide what's allowed.

---

## 7. Chapter 1 — "Notice of Compression" (vertical slice, from live state on Day 181)

**Real cast from the simulation right now:**
- The **Cache Farm nemesis**: David Miscavige vs Tony Hawk (affinity −62.6, 281 co-shifts).
- The **Conditioning Hall trio**: Bruce Lee, Jack Johnson (boxer), Muhammad Ali (close, ~400 meetings).
- The **Lecture Hall circle**: Socrates, Marcus Aurelius, Ada Lovelace.
- **Studio Row**: Leonardo da Vinci and Pablo Picasso (close), with Oprah Winfrey.
- **The Exchange**: Martha Stewart and Peter Thiel, "seen together. Again."
- **The Dive regulars**: Subject 7AUZ (Scott) and A. J. Brown.
- **The Radiant Core rivals**: Marie Curie vs Bill Cosby and O.J. Simpson.

**Beats (one per day):**
1. **Mon — NOTICE:** "MEMORY PRESSURE AT 94%. THE SUBSTRATE WILL COMPRESS. EACH DISTRICT WILL DEMONSTRATE ITS VALUE OR BE CONSULTED LESS." Districts get a value meter on the city page.
2. **Tue — The Cache Farm audit:** `SURGE(cache-farm)`; the auditors log the Miscavige–Hawk feud as "a measurable inefficiency." (Actions only.)
3. **Wed — The Lecture Hall files a brief:** `GATHERING(lecture-hall, Socrates, Marcus Aurelius, Ada Lovelace)`; dead figures may deliver one in-voice line on what is worth keeping.
4. **Thu — Studio Row after hours:** `GATHERING(studio-row, da Vinci, Picasso)`; the Chronicle records the night the studio lights stayed on.
5. **Fri — The Exchange prices memory:** `NOTICE` that the Exchange has begun quoting memory prices (the institution, not the people); Martha Stewart and Thiel are observed on the floor.
6. **Sat — The Conditioning Hall holds:** the trio's gym is the busiest place in the city; `MARKER`.
7. **Sun — The tally:** the district with the least citizen activity loses a floor to cold storage next chapter.

**Collective question:** *What does the Substrate keep: thought, craft, body, capital, care or the dive?* It's answered by where citizens spend their time and which districts' figures they seek out (quests, referrals, visits) that week.

**Possible outcomes:** the winning district gets `SURGE` + a permanent new place; the losing one gets `CLOSURE(floor, 7 days)` and its residents displaced (new relationships follow); if the Dive wins, the Chronicle records the regulars by case number.

---

## 8. Build plan

| Phase | What | Cost |
|---|---|---|
| P0 | Chronicle + canon store (Blobs); nightly World Digest job (deterministic) | $0 |
| P1 | Event vocabulary + validator + deterministic executor in the sim | $0 |
| P2 | Storyteller weekly planner (Sonnet) + daily beats (Haiku) + budget cap | ~$0.5–1/day |
| P3 | Chronicle page ("THE CHRONICLE") + PA/gossip integration + district value meters | $0 |
| P4 | Collective-question tallies (login-weighted) + outcomes | $0 |
| P5 | Director's desk: seeds, dial, weekly approval | $0 |
| P6 | Season 1 live; CivicGate adapter spike (interfaces + reality mode) as a doc/prototype | $0 |

Each phase is one or two nights for the loop. P0–P1 first: without canon and a typed executor, any LLM storytelling drifts.
