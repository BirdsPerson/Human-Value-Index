# HVI Roadmap — the nightly loop's backlog

Read by `scripts/hvi_nightly.sh` every night (02:00, launchd `com.hvi.nightly`).
The loop takes the TOP unblocked item that fits one night, ships it (HVI rule:
ship when checks pass), and moves it to Done with the commit. Scott reorders or
adds items by telling Claude in chat; Claude edits this file.

Status tags: [next] [blocked: reason] [in progress] [needs Scott]

## Backlog (priority order)

P. [in progress: slice 1 shipped 2026-10-10 = score index from the census, nav visited colour, first-day
   checklist count/order; every other bullet below is still open] **Playtest 2026-10-10 findings** (390x844 touch emulation + 1440; screens docs/screens/playtest/2026-10-10/).
   Bugs:
   - [fixed 2026-10-10: App.jsx merges the /api/pen census into the index (mergeCensus, check-score-index);
     not seen against the live census] ~~Score index lists 62 of ~1,209 files.~~
   - [fixed 2026-10-10: ui.css exempts .ui-bar / .ui-head-nav from the visited rule] ~~Command-bar labels vanish once visited.~~
   - **Floor counts disagree.** THE MERIDIAN: cutaway and the Finance directory say 6 FLOORS (PH, 4F-1F,
     lobby); #city/finance/the-meridian says 14F with PH, 12F..1F, G.
   - [fixed 2026-10-10: steps that cannot be taken yet (vesting allowance, invest included) sink below the
     doable ones, numbered in shown order; the intro line counts what the header counts (introOf, check-firstday)]
     ~~First-day checklist miscounts and leads with dead ends.~~
   - **"Release in ~31 real min" contradicts the city.** Intake lists your file as awaiting release, but
     FIND ME already shows you on the Arena platform boarding Loop 5. Pick one story.
   - **Your own file is absent from the cube** (FIND "Subject MU6P" finds nothing; no YOU marker) and the
     cube copy still says "HOLLOW POINTS: THE THIRD AXIS IS NOT YET ON FILE" with 0 pending.
   - **Phone tap on the iso city did not open a building** under touch emulation (synthetic tap at three spots;
     `]` key and desktop click both open the cutaway). Verify on a real phone before fixing (item 9).
   - **#pen redirects to #arrivals** silently; old links/bookmarks to the pen land on INTAKE.
   Confusions / polish:
   - Result screen: three badges (RETAINED SPECIALIST / KEYSTONE / UNRATIFIED) plus a fourth name in the copy
     (CERTIFIED CONTRIBUTOR); a new player cannot tell tier from cubrant from status. One line saying which is which.
   - Breakdown "EV 90%" is unexplained jargon; appeal checklist drops the ↓ (lower-is-better) marks, so
     THREAT 12 reads like a bad score worth appealing.
   - After the result, F3 swaps PLAY for APPEAL; "REQUEST RE-ASSESSMENT" and "APPEAL" sit side by side
     with no word on how they differ.
   - Returning assessed subject still gets "SHALL WE ASSESS YOUR VALUE?" and GET EVALUATED as option 1.
   - Three version numbers on one screen: BETA V2.0.0, VERSION 3.1, PROTOCOL V7.4.1 (and METHOD V4 on the cube).
   - Interview: officer acks repeat ("LOYALTY TO KIN" twice, "LARGE" twice), "DIRECTIVE 7" gag reappears as
     "DIRECTIVE 37" in the verdict; "how long to train someone" and "what skill took years" ask the same thing.
     "Nine billion other people" vs the boot's 8,045,311,447 entries.
   - Referral pick list renders every namesake twice (tap rows that file at once + a checkbox list with
     FILE SELECTED); row 1 is pre-highlighted, so one stray tap files John Smith the explorer. Keep one list.
   - Phone city: CLOCK.SYS + view tabs take ~55% of the first screen before the map; canvas is 344x340.
     Cutaway toolbar truncates the building name ("THE..."), ENTER/CLOSE text touches the borders.
   - MAP view labels only edge districts (centre unlabelled), truncates "SPRAW", short names differ from the
     directory (OLD / THE OLD TOWN, SUBURB / THE SUBURBS). STREET clips labels at the frame edge.
   - Four city views (CITY/MAP/STACK/STREET) with no line on what STACK is for.
   - MY FILE is ~11 phone screens; the first-day checklist sits above your own score.
   - Desktop: city controls fall below the 900px fold; cube tier chips overflow at 1440 (SURPLUS hidden);
     #cube highlights MENU in the command bar.
   - Header truncates "CASE UN…" / "CASE HV…" at 390 on every screen.
   Missing (what a player reached for): rank among all files on the result; "where am I" marker on the cube
   and MAP; a way to see what my sprite will look like / redo the photo description.

0. [in progress 2026-09-29, Scott's order: scale -> community -> HQ]
   a. [shipped 2026-09-29, see Done] **Scale.** Production sprite atlas + slim /api/pen.
   b. [slice 2 shipped 2026-10-08: named cliques + home hangout, docs/CITY_SPEC.md "GROUPS"; left: group
      outings, cross-group gossip, incidents] **Community + incidents.** Real-life ties from Wikidata (spouse, sibling, bandmates
      /member of, teammates, partners) raise affinity so real friends gravitate together;
      ties carry a sign from the public record where it exists (documented friendships warm, documented feuds/estrangements cold; Scott 2026-09-29: 'whatever's available'), then evolve freely in the sim; friendship cliques become named groups (Overlord-named) with a home hangout and group
      outings; odd cross-group pairs logged as gossip. Fallout Shelter incidents: a fire,
      reactor overload, vat flood, power cut; deterministic from the machine clock; nearby
      subjects with fitting jobs run to it and work it; logged on the PA and the Ledger.
   b1. [first step shipped 2026-09-30 with the civic fold, docs/CITY_SPEC.md "The civic fold":
      ten district teams, 28-day seasons on the GAMES fixtures, semis and a final, standings in
      the day summary, STANDINGS board at the Diamond, #city/league, the PA names the teams;
      left: MVP, rivalries into social.js, the Bowl/Pitch as their own divisions, wagers]
      **LEAGUES** (Scott 2026-09-29, after the rec ground shipped 70bbb2c): pickup games at
      THE DIAMOND / THE COURTS grow into leagues. Teams per district (later per group/sector,
      named by the Overlord), rosters drafted from who plays there (athletes first; ratings
      from physical/competence and real sport field), a season schedule on the machine
      calendar, deterministic results, STANDINGS board at the ground + a page, playoffs and a
      championship, MVP; league rivalries feed social.js; the PA calls it. Later: more sports
      (the Bowl for football/soccer), a second division with promotion/relegation, and wagers
      in CYCLES once the economy exists.
   b1b. **CITY SEARCH + FIND ME** (Scott 2026-09-29; SHIPPED 2026-09-29: src/city/find.js, CityFind.jsx, check-find.mjs; #city?find=<slug>):
      FIND box on the city screen, type-ahead over the census; picking someone flies the
      camera to where they are now (whereAt), highlights and follows them; inside a building
      the cutaway opens on their floor; status line "NAME — PLACE, FLOOR. ACTIVITY." FIND ME
      jumps to the viewer's own subject.
   b1c. [first step shipped 2026-09-30, docs/CITY_SPEC.md "THE MALL": job SATISFACTION per subject per day;
      dissatisfied entrepreneurs QUIT and open shops of their trade in 24 storefront units (Heights base,
      Coast boardwalk east, Strip, Campus, Commons, Sprawl), staffed from the dissatisfied, foot traffic
      decides, losers close; DEPARTMENT LICENSE 0001 to Shaun White (WHITE'S, the Heights base); SAM'S
      PIZZA and GOODNIGHT IRENE'S as Coast landmarks; the tram car; #enterprise. Next: players open
      one with CYCLES (item 5), the EB Shop's storefront, a developer's second mall]
   b1c. **THE MALL** (Scott 2026-09-29: "people can open their own businesses if they want;
      leave it up to them"). A mall of storefront units. Emergent: figures with business/
      entrepreneur fields and the drive for it (competence, network, adaptability) decide on
      their own to open a shop matching their record (a record store, a home-goods shop, a
      gym, a gallery...), staffed by other subjects; foot traffic from the sim decides
      whether it thrives or closes; vacancies get re-let. Players open one later with CYCLES
      (needs the economy, item 5). The EB Shop gets a storefront (lore). Shops feed the
      district mood and the civic machine (a developer can build a second mall).
   b2. [cabinet floor shipped 2026-09-30 with the funnels, docs/CITY_SPEC.md "The funnels": THE ARCADE on the
      Strip, cabinets synced from works.json (live / BETA / OUT OF ORDER), CRT overlay plays JETSAM! and ANAMNESIS,
      JETSAM! cabinets in the Dive, diner, casino, Union lounge. Next: the game room (chess, pool, cards)]
      [chess shipped 2026-09-30 as PARK CHESS, docs/CITY_SPEC.md "Park chess": stone tables at the Recreation Ground,
      the Green and the Estate Gardens, NPC games + the park ladder, #chess?vs=<slug> vs a figure (src/chess/), results on
      the file via /api/chess. Next: pool and cards in the game room]
      **The Arcade** (Scott 2026-09-29; built with b; NOT named "Iridescent" yet, later).
      A building on the Strip: a cabinet floor and a game room. Cabinets = every live game in
      ../iridescent-site/works.json (division games; JETSAM! play-jetsam.netlify.app and
      ANAMNESIS anamnesis-eb.netlify.app are live and embeddable), synced by a script so each
      new game appears automatically; in-development games stand as OUT OF ORDER cabinets.
      Tap a cabinet: play it in a CRT frame overlay. Game room: chess, pool, cards; subjects
      visiting play each other (deterministic results from the sim, rivalries and friendships
      feed social.js, results on the Ledger/PA). Player vs a figure at chess (chess.js rules +
      a small engine whose strength follows the figure's competence), result on the file.
   b3. [first step shipped 2026-09-30 with the funnels: EB SHOP (a real storefront on Campus, live Shopify stock
      with turntable videos, EBSN host standees), ELECTRIC BASEMENT TV (the Arts sound stages: EBSN set, the live
      stream in an overlay, ON AIR from now.json, EBTV on the bar TVs). Next: AUCTION HALL, CINEMA]
      **Our lore, built into the world** (Scott 2026-09-29: "let's build all of our lore into
      this world"). Buildings that show the real work, each with people doing jobs and an
      audience, tap a screen to watch in an overlay:
      - AUCTION HALL: bidders watching Electric Basement shop turntable product videos
        (source, found 2026-09-29: the Shopify store shop.electricbasement.tv hosts "turntable videos of items for sale" on cdn.shopify.com; pull product video media from the storefront, so new listings appear automatically), paddles up, an
        auctioneer figure.
      - CINEMA: rows of seated subjects watching EBTV channels (live.electricbasement.tv and
        the antenna lineup EBTV already carries; embed EB's own player, don't re-host third-
        party streams; Scott OK'd 2026-09-29). Haddonfield Film Society nights later.
      - EB TV STUDIO: the QVC-style set with the AI hosts from the host bible
        (eb-command-center/edit/qvc_hosts.md), cameras, crew, an ON AIR light.
      - The Arcade (b2) is part of this pass. Later candidates: Brainforest (analytics firm
        office), the Unfinished Business stream booth, a pizza place for the road doc.
   b4. **DEBATE HALL** (Scott 2026-09-29; later, the bridge to CivicGate). Build Debatr
      (~/projects/debater: card engine, JUDGING-ENGINE, SCORING; ~/projects/debater-private
      ARENA.md is the design) into the city. Stage 1 PvE: the player debates a figure on a
      resolution in structured rounds (opening/rebuttal/cross/close); the card engine grades
      factual claims live (VERIFIED/DISPUTED/DEBUNKED); an audience of subjects in the hall
      shifts pre-poll -> post-poll (minds-moved scoring). Opponents: dead figures only
      (content rule: the living never speak) or the Overlord itself. Results feed a debate
      rating on the file. Stage 2 PvP: live player-vs-player debates, audience = players,
      judge reliability weighting per ARENA.md. That stage is the CivicGate rehearsal.
   b5. [first step shipped 2026-09-30: THE ASSEMBLY, session 001, docs/ASSEMBLY.md: two
      applications for LOT 0x6F07 (golf course / community farm), dead advocates debate, assessed
      files vote with fixed reasons for 3 days, the winner is built in the Commons; 2026-09-30
      the civic fold (docs/CITY_SPEC.md): per-district MOOD in every day summary, one COUNCIL
      seat per district (vacant; holder/term/approval shape; the Assembly's result recorded as
      its first act). Next: elections fill the seats; 2026-09-30 THE SUBSTRATE votes (advisory) and session 002, THE RESORT PARCELS, opens
      when 001 closes: developers on file bid for the Coast's and the Heights' parcels, the
      city having grown outward (CITY_SPEC "The city built outward")] **THE CIVIC MACHINE** (Scott 2026-09-29 "how is it all going to work?"; Claude's design,
      review with the scale redesign since SECTORS are the natural data shards):
      DEMAND (census growth, crowding, district mood, incidents) -> PROPOSAL (Dept of Planning
      at HQ, or DEVELOPER figures bid: Trump, Robert Moses, Haussmann, Disney; Jane Jacobs
      opposes) -> APPROVAL (district COUNCIL, one elected seat per district; OVERLORD veto
      costs LEGITIMACY) -> BUILD (lot -> construction site with crews -> opening; overruns and
      quality follow the developer's competence/conduct) -> OUTCOME feeds mood -> elections.
      Elections: figures run; subjects vote by values/affinity; players vote (CivicGate
      rehearsal). Legitimacy low -> unrest (item e). Performance: per-shift score (fit,
      fatigue, incidents); bad streak -> warning -> demotion -> reassignment to the Works
      (nobody leaves: everyone must work); good streak -> promotion. Scuffles (rivals, the Dive
      late) among dead figures/anonymous only, living get heated arguments; accidents at
      reactor/foundry/construction; injured recover at WARD 7 (exists, has staff, no patients
      yet). Sprawl: new edge sectors built by the winning developer; SUBWAY extension is itself
      a project; THE UNDERCROFT beneath the city is where unrest organizes.
   b6. [shipped 2026-09-29, see CITY_SPEC "Architecture per building"; left: the decay /
      gentrify half, which waits for the economy] **BUILDING DESIGN PASS** (Scott 2026-09-29; next after the soccer/football fields):
      distinct architecture per building type instead of one generic block. Housing reads
      by tier: low tiers in big brick PROJECTS (repeating balconies, laundry lines, chain-
      link, broken lights), middle in BROWNSTONE rows/walk-ups with stoops, top tier in GLASS
      HIGH-RISES (penthouse terraces, doorman, rooftop pool). Works = industrial sheds,
      smokestacks, conveyors; Campus = gothic stone and ivy; Strip = neon and the casino
      marquee; HQ = the Overlord monolith. Later, with the economy: buildings decay or
      gentrify with their district's fortunes.
   b7. **CITY PLANNER + THE PIT + TENNIS** (Scott 2026-09-30; starts when the COAST/HEIGHTS
      expansion lands): (1) a whole-city planning review and master plan (zoning: industry away
      from homes, stations near density, the sports cluster, green space per district, resort
      edges), applied as deterministic rearrangements; in-world a Dept of Planning with ROBERT
      MOSES and JANE JACOBS as dead advocates arguing future developments. (2) THE PIT: a boxing
      ring + an MMA octagon; fight cards between real fighters on file (Ali, Tyson, Jack Johnson,
      Bruce Lee...); nemesis-level rivalries can be settled there: dead rivals fight, living
      non-fighters name a champion; non-graphic ("RETIRED FROM THE BOUT"); outcomes move the
      rivalry; PA calls. (3) TENNIS COURTS (placed by the master plan, not tied to the golf vote).
      [SHIPPED 2026-09-30: docs/planning/MASTER_PLAN.md. Layout 2 (the foothills, the belt, heavy
      industry inward, the school moved), THE PIT (Friday cards, grievance nights: the living
      name a dead champion), THE TENNIS CLUB, DEPT OF PLANNING (Moses and Jacobs), billboard
      sites reserved. Next: the subway to the edges (b5), a pocket park in the Archive, the
      reactor away from Hab A (layout 3), drawing the billboards.]
   c. **The Overlord tower (item 11) as the admin building:** Intake, Appeals desk, Review
      Board, Records, Calibration Lab, Holding Cells (item 12), and THE PEOPLE'S PETITION
      console = the People's Vote exactly as designed in docs/story/STORYLINE_TOURNAMENT.md
      (Scott approved 2026-09-29 in chat: TOO HIGH / FAIR / TOO LOW on public figures only,
      verified logins, NOTED at 25, review at 40 bridged across 3 of 4 quadrants over 72h,
      max 3 reviews/day, no free text, votes never move a score). Figures work there.
      [the mechanic SHIPPED 2026-09-30, docs/PETITION.md: the panel on every public figure's
      file, one vote per evaluation period, hourly tick, Mac review job, likability blend.
      Still open: the tower console in the city, the PETITION REGISTER page, wave quarantine.]
   Standing (Scott): environments keep getting more realistic: things to do, items used.
   d. **The city grows** (after c). Sectors develop over machine weeks: empty lots become
      construction sites (crews at work, cranes, scaffolds), then buildings (a sports arena
      first). Growth is driven by the census (more subjects -> more housing/jobs) and later
      by where CYCLES are invested (item 5). Always people involved: builders, inspectors.
   e. [the dissatisfaction meter exists: the civic fold's per-district MOOD, docs/CITY_SPEC.md;
      wages and CYCLES would add factors to it] **Economy -> inequality -> unrest -> enforcement** (design with Scott before building;
      Scott 2026-09-29 "things I want to be thinking about"). Chain: item 5 wages/CYCLES ->
      housing quality by earnings (penthouse vs bunk) -> a dissatisfaction meter per
      district (low tier, low wage, crowding) -> unrest events (strikes, sit-ins, a
      "revolution" in a sector) -> enforcement. Open question for the story: who runs the
      police? The Overlord's WARDENS, a human CIVIC WATCH, or both, clashing. [2026-09-30 first step: THE PREFECTS, one machine construct of the Overlord per district, a daily directive that counterbalances the elected councillor's PEOPLE <-> ORDER lean, clashes feeding mood and a per-district LEGITIMACY meter (docs/CITY_SPEC.md "The Prefects"). Next: low legitimacy -> unrest events; WARDENS as the prefects' force.] Candidate
      Season 2 spine after UNRATIFIED. Guardrails: crowds are anonymous subjects; named
      living people never shown rioting or doing violence; cold satire, non-graphic.

1. [in progress: slices 1, 2 and (b) shipped, see Done] **Side quests → vouches.**
   Remaining slices: (b) [shipped 2026-10-09: +2 to that category per vouch (max +14 across 7) as a history entry with cause "vouch"; an unassessed category is filed with no number moved; the next interview blends it like any prior reading];
   (c2) bring someone (needs a second player or a referral; witness shipped as c1);
   (d) real-world Directives
   reported back via appeal; (e) text-chat quests on Haiku (capped); (f) offers from
   roster-engine dead figures, not just the 7 hand-written ones.
   Original brief: Figures (dead only; living figures never speak)
   offer quests in their own voice, matched to their value lens. Two kinds:
   in-game (visit a place, bring someone, talk to a figure, witness an event in the
   city) and real-world Directives (reported back via appeal). Completing one earns a
   capped vouch in that figure's category (Tubman → care, Hemingway → nerve/physical,
   Curie → persistence/utility). Quest log on MY FILE. Overlord copy. Cost: text-chat
   quests on Haiku; cap per player per day. Acceptance: a player can accept, complete
   and receive a vouch end-to-end; vouch visible on the file; checks for caps/abuse.

2. **Your character in the city.** Player picks job (from 3 offers at a terminal) and
   2-3 hangouts; their sprite follows that schedule in the sim; "follow me" camera;
   promotion requests up the ladder. Passive (SimTower), no action controls.

3. [partly done: emergent relationships shipped b5619ab — next: Overlord lines for the dead, relationships feeding the People view] **NPC encounters.** Co-located figures (same place, same hour) have encounters,
   generated nightly in a small batch (Haiku, capped). Each encounter is a one-line
   Overlord log + a relationship delta computed from the pair's value lenses. The
   aggregate becomes a figure-to-figure People view (likability from peers) for figures
   without YouGov data. City gossip feed + encounter log on cards. Never for living
   people saying words (actions only for the living).

4. **Directives & promotions.** Weakest-category Directives delivered by a fitting
   figure; tier promotion ceremonies; floors/districts unlocked by tier.

5. **Economy v1** (unblocked 2026-09-28: DNS moved to Netlify, Resend domain verified, email login live):
   CYCLES UBI daily, invest in 7 district industries (herding thins returns), job
   ladder wages, society-allocation readout. Wealth never raises score; conduct does.

6. **Realism:** more places per district, day/night palette, weather, news → city
   events (a scandal empties a district, a promotion fills the bar).

7. **Pen long-press pickup** on touch, so a swipe that starts on a subject scrolls.

8. **Backfill field/domain on every subject.** 104 of 185 subjects (referrals + engine) carry no field, so analytics by field covers only 81. Classify field + era from Wikidata occupation/P106 and birth date for every card (cheap, no model needed where Wikidata has it), store on the card and index, and make referral + engine paths set it at creation.

9. **City polish from the iso build:** ward curtains drawn too tall; verify the "+K" crowd badge on a real crowded room; test pinch/twist on a real phone.

9a. [next] **STREET polish, a pass a night** (Scott 2026-09-30: "start polishing that a little
   bit at a time to make it look like everything else"). Pass 1 shipped 2026-09-30 (see Done and
   docs/CITY_SPEC.md "STREET in the city's language"): facades, ground, grounds, Loop palette.
   One pass per night, in order; each ships with before/after screens in docs/screens/street-pass<N>/,
   day (?at=12:00) and night (?at=22:00), 1440 and 390, and frame timings (60 fps both widths):
   - **Pass 2: the Loop as loopGeo builds it.** Draw the viaduct from `loopGeo.loopPieces()`
     (radius-2 curves at the corners, piers every other piece), cars from `trainPoses`/`carCorners`
     (bogie-placed, bending through the corners, gangways, roof units, cab with headlamps), the
     stations from `stationGeo` (platform + yellow edge strip, glazed canopy on posts with the lit
     fascia, the stairs down beside it, the name board; `// TRAIN IN` while one stands). Riders on
     the platform stand on it, commuters climb the stairs (`climb`). Walking collides with piers
     and stair bases. Lift the shared Loop drawer out of CityIso into a module both views call
     (coordinate with whoever holds CityIso.jsx).
   - **Pass 3: open ground and the civic lots.** The Green, the Allotment, THE STREET and THE PLAZA
     dressed as the city does (trees, beds, benches, lamps, stalls); THE ASSEMBLY and LOT 0x6F07
     through `civicDraw.drawCivicLot` (its kit already takes `prism`/`wall`); road markings and
     kerbs between the blocks; street lamps that light at dusk with a pool on the pavement.
   - **Pass 4: people with the city's poses.** Walkers and loiterers on the streets through
     `poses.drawPose` (walk cycle facing their heading, idle acts on the open lots, sitting on
     benches), whoever is walking in or out drawn at the front door (`archDraw.doorAt`, as the
     iso view does up close), the doorman/guards; LOD by depth (mini sprites far off), tap
     targets unchanged; perf budget re-measured at 1440 and 390.
   Later: a pass for weather/sky (dusk gradient, the searchlight at night), and the HUD chrome.

10. **Shared animation rig recoloured per person** (Scott 2026-09-28: faces hidden, identity by colours). Extract each subject's palette (hair, skin, top, bottom, shoes, accent) from their existing sprite; draw a small shared rig once (4-direction walk, sit, desk work, cheers, dance) in the design-system style; recolour per subject client-side (zero image generation). Real face only in front idle + file photo. Use in CITY iso, STREET, pen, building cutaways. (2026-09-30: a first rig SHIPPED without recolouring: each subject's own sprite is cut into parts and moved by 25 shared animations, docs/CITY_SPEC.md "Animation rig"; the recoloured shared body and a 4-direction walk are still open.)

11. **HQ as a tall SimTower building (~12 floors) of Overlord departments:** Intake, Records, Archive stacks, Calibration Lab (shows current method version), Review Board, Tribunal, Holding Cells, Operations, Executive Suite, roof. Real sim use per floor.

12. **Holding Cells with meaning:** subjects under Review (arraignment/summons, appeals under hearing, harm reviews, news re-scores) walk into a holding cell until their case is heard at the Tribunal, then are released ("RELEASED. FILE AMENDED."). Driven by real events; visible "who is in trouble" board.

## Standing tracks (Scott, 2026-10-09: "mostly self-improving ... I can check in and see how the place is growing")

The nightly build rotates through these by weekday unless an open bug is marked P0 or DESK_ANSWERS.md
holds an unacted answer (those go first). Take the next unshipped slice in that track, one night's work,
built well (research first for new systems, reusable engines, checks that can fail). Record the track
in the Shipped bullet. If a track has nothing shippable tonight, take the next weekday's track.

- **Mon: THE OCEAN, the coast and the clubs.** Order: the marina + public pier on the southwest coast;
  boats as transport and leisure; the YACHT CLUB and the GOLF & COUNTRY CLUB proposed through the
  Assembly as wealth concentrates (vault backlog "THE OCEAN, the clubs and the strata"); public
  alternatives always exist; THE SANCTIONED offshore last.
- **Tue: SURFING, then the other open games.** Surfing mini-game at THE COAST's break (vault backlog
  "Surfing mini-game": paddle, catch, carve, cutbacks, tubes, wipeouts, combos, casual bot, cabinet).
  When surfing ships, this day takes: the dungeon's next stage (docs/design/DUNGEON.md), football
  playtest notes (vault backlog "Football playtest notes"), basketball S2 (docs/design/BASKETBALL.md).
- **Wed: THE CITY, more real.** docs/CITY_SPEC.md + item 6 above: more places per district,
  day/night, weather, news into the city, realistic layouts, NPC routines.
- **Thu: DATA ANALYTICS.** The analytics view: field/era backfill (item 8), better charts, region
  and field breakdowns, trends over time, plain-English readings; every number traceable.
- **Fri: PEOPLE FROM ALL OVER THE WORLD.** Keep the intake flowing: if the newest
  docs/roster/diversity-*.json has fewer than 150 figures left to file, research and write the next
  list (docs/roster/diversity-YYYY-MM-DD.json, same shape) aimed at the regions and fields most
  under-represented vs UN population share (analytics WHO IS ON FILE); living people never get
  invented crimes; grave-harm exclusions stay. The daily com.hvi.roster-queue job files from the
  newest list automatically.
- **Sat/Sun:** the existing playtest (Sat) and calibration (Sun) jobs run; the build takes the top
  ROADMAP item.

Every Monday's report adds a "## How the place is growing" section: figures on file (and added this
week, by region), editions printed, games played and new players if the data exists, what shipped per
track, and what is next per track. Plain English, no internal codes.

## Guardrails (the loop must obey)

- One item per night; stop at the time budget and report partial work honestly.
- All scripts/check-*.mjs + scripts/check_sprite_qa.py + build must pass before push.
- Budgets per night: ≤10 Higgsfield credits; ≤$3 Anthropic API (count calls).
- Never change calibration.json weights (that's the Sunday calibration loop + Scott).
- Content rules: no founders/prophets; living people never speak or vouch; sprite QA.
- Write the summary to MORNING_REPORT.md (## Shipped / ## Needs you) and run
  ~/projects/organize/collect_reports.py.

## Done

- 2026-10-09 Side quests (b), vouch score effect (Scott 2026-09-28): completing a directive adds
  +2 to its category on the file (netlify/lib/quests.js vouchEffect): a history entry of cause
  "vouch", score moved by the formula's change (held remainders stay held), pen card updated,
  "SCORE +n" in the confirmation line. Check: check-quests.

- 2026-10-07 Park chess polish: the Recreation Ground keeps ONE stone table and one kibitzer
  (src/chess/park.js); its side-view cutaway has the chess table with two seated and a watcher
  (new `recpark` plan in props.js, the picnic plan plus `chessTable`); void games past 12 h are
  swept on one in ten starts (chess-store.js pruneGames). Check: check-chess.

- 2026-09-30 STREET polish, pass 1 (item 9a): the STREET view now draws with the city's own
  drawers through a perspective kit (src/city/streetArch.js): every building's architecture
  (archDraw: projects, brownstones, the Meridian, HQ's monolith, gothic campus, neon Strip...),
  windows lit by occupancy by day and night, yard props and flat ground, the grounds through
  parkDraw (players posed), the district ground and the Loop in the city's palette; heights are
  the iso view's (a storey = STOREY cells, the deck at DECK storeys); labels in the city's style,
  hidden behind nearer buildings; the auto-tour walks beside the viaduct. Screens:
  docs/screens/street-pass1/. Check: check-street (the kit's rules).

- 2026-09-29 Scale (item 0a): production sprite atlas (scripts/prod-atlas.mjs packs every
  ready referral sprite into content-hashed sheets in Blobs; /api/atlas.json + /api/atlas/<hash>.png;
  the referral job repacks each pass, skipping in two reads when nothing changed; a sprite
  newer than the pack loads its own /api/sprite URL). Slim census: /api/pen drops verdict,
  scoreHistory and harmReview (breakdown stays: city jobs, friendships and analytics read it);
  /api/figure/<slug> serves the whole file when it opens (src/fileDetail.js). Hashed /assets/*
  and the repo atlas PNG are cached immutable.
- 2026-09-29 Birth country on every subject (Scott: "notice who we're leaving out"): `origin`
  (ISO alpha-3, Wikidata birthplace country, else citizenship) on src/figures.js, every
  production card (scripts/backfill-origins.mjs) and at creation (refer, roster engine).
  Analytics: WHO IS ON FILE (region share vs UN 2025 population) + VALUE BY REGION. The
  roster engine's Pantheon draws are weighted by each region's shortfall (src/origin.js
  regionWeights); the Wikidata service/notorious pools are not steered yet. Check: check-origin.

- 2026-09-29 Social tick drops withdrawn subjects (commit in git log, "Social tick: forget
  withdrawn subjects"): every advance forgets pairs, events, names and friend-pull boosts
  of anyone missing from the census; the tick reads the census strictly (a failed figure
  read throws and writes nothing), social-seed refuses a figure-less /api/pen. Check:
  check-social withdraws a subject mid-run and through the tick.

- 2026-09-28 De-crowding + no dead/alive split: capacity-aware leisure placement with
  same-kind overflow, 8 new rooms, Hab Block D, Hab floors renamed RESIDENCE LEVEL n;
  every death label/year/ghost line removed from the UI; bundle check for death markers.

- 2026-09-28 Method v3.1/v3.2 scoring (55f766e, b12bf1e), analytics view (88eda07), STREET city (334bc39), emergent relationships (b5619ab), SimCity iso city of cutaway buildings (c9cc8df).

- 2026-09-28 Side quests slice 2, witness directives (91f148e): 7 more dead figures, one
  per category, each ask you to be in the building while they and a named partner are
  both on its floors (Gandhi+Mandela, Mandela+Tubman, Tesla+Curie, Einstein+Newton,
  Socrates+Marcus Aurelius, Franklin+Holiday, Pelé+Ruth). The held directive shows both
  locations and a countdown to the next meeting; REPORT MEETING on either file inside
  that building; /api/quest re-checks the meeting against the sim. Still one vouch per
  category: a category's other directive closes once it has one. check-quests covers
  meeting rates over 14 machine days, the countdown, and the new rules.
- 2026-09-27 Side quests slice 1 (3bd6439): 7 dead figures (one per category) offer a
  "find me" directive; accept on MY FILE > DIRECTIVES, find the figure in the city,
  open its file inside the same building, REPORT CONTACT; /api/quest re-checks contact
  against the sim server-side; vouch stored on the case and listed on MY FILE. Caps: 1
  held, 2/day, 60 s minimum, each figure once, 60 calls/IP/hour, intake required. No
  score effect yet. Check: scripts/check-quests.mjs. `node scripts/run-checks.mjs` runs
  every check.
- 2026-09-26 City v1 (c9175a6), City v2 train/buildings/3D (ee5602d), design + mobile pass (5a7478c), public launch.
