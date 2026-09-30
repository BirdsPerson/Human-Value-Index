# THE ASSEMBLY — session 001 (2026-09-30)

Scott's design: the city's first public debate and vote, the start of the subjects'
attempt to form a government. The first step of ROADMAP b5 (THE CIVIC MACHINE): a
PROPOSAL (two developer applications) -> APPROVAL (a vote) -> BUILD (a site with a crew)
-> OUTCOME (a course or a farm in the city). Non-binding civic theatre; satire notice and
DISPUTE link on the page.

## What it is

- **The motion.** What shall be built on LOT 0x6F07 in the Commons?
  - APPLICATION 001: an 18-hole golf course. APPLICANT: DONALD J. TRUMP.
  - APPLICATION 002: a community farm. APPLICANT: ZACK DE LA ROCHA.
  The applicants are living: they appear only as filings (Department paperwork). Their
  STATEMENT field reads "NONE ON FILE. LIVING APPLICANTS DO NOT SPEAK IN THIS CITY. THEY
  FILE." No text anywhere quotes them or reports them speaking; the loser's reaction is an
  action line ("APPLICANT'S DISAPPOINTMENT LOGGED ON FORM DP-9").
- **The debate.** Dead figures on file argue each side, four short speeches each, written
  once and reviewed (no model at runtime; `src/assembly/content.js`):
  JOHN D. ROCKEFELLER (1839-1937) for the course (took up golf at about sixty, played most
  days into old age, handed out dimes), THOMAS JEFFERSON (1743-1826) for the farm (wrote
  to John Jay in 1785 that cultivators of the earth are the most valuable citizens; kept a
  Garden Book for nearly sixty years). The Overlord, chairing, reads each advocate's record
  into the minutes first (the Standard Oil trust; the more than 600 people Jefferson
  enslaved). The speeches are marked as reconstructions, not quotations, and carry no
  quotation marks. Each advocate has a pre-written reaction to whichever reason leads.
- **Discourse without free text.** A ballot is one application plus 1-3 reasons from a
  fixed list: JOBS, LEISURE, FOOD, LAND, BEAUTY, SPITE. The DEBATE BOARD tallies votes and
  reasons per application.
- **Who votes.** Any assessed case file (a case with at least one history entry), one
  ballot per case, changeable until the close (up to 10 revisions). The case number is the
  credential (as with /api/quest). Limits: 4 distinct voting files per IP hash, 2 per
  device (a random id in localStorage, salted and hashed on the server), 30 ballot POSTs
  per IP hash per hour. The owner's case has no exemption (checked).
- **Duration.** Three real days from the first run after deploy: the first GET of
  /api/assembly writes `meta` {openAt, closeAt} once (onlyIfNew). Nothing is in code.

## THE SUBSTRATE (ADVISORY) (Scott 2026-09-30: "NPCs vote, and may abstain")

Rule chosen: PLAYERS DECIDE, NPCs ADVISORY. Every subject in the census (the full roster the
city simulates) casts one deterministic advisory ballot, or abstains, from its record alone
(`src/assembly/substrate.js`, leans in `content.js` SUBSTRATE): fields (athletes, business,
finance, royalty lean golf; care, activism, farming, food lean farm), tier band (the top leans
golf, the bottom farm), values (care, network), ties on file (a friend or relative of an
applicant leans with them; a grudge votes the other way, citing SPITE), and the mood of the
district they work in (a SEETHING or RESTLESS district leans against what the top of the
ladder would pick, and spitefully). Abstention: low network, high threat, the bottom of the
ladder, an INDIFFERENT district, or no preference either way. The applicants are recused.
Reasons come from the same fixed list; one to three, like a player's.

- Counted by `refreshSubstrate` (netlify/lib/assembly.js) at most every 10 minutes while the
  polls are open, from the census and today's moods (`netlify/lib/substrate-source.js`): the
  plan builder's run asks every 10 minutes, the page's GET asks too. Stored as `s001/substrate`;
  a failed or empty census read keeps the last count; frozen at the close.
- Shown on the debate board as THE SUBSTRATE (ADVISORY) beside THE CITIZENRY (the page, the
  forum's board in the city, the PA). Totals only: no subject's advisory ballot is published by
  name.
- At the close: if ZERO players voted, the substrate's preference is adopted (`decidedBy:
  "substrate"`, the notice THE CITIZENRY ABSTAINED. THE SUBSTRATE'S PREFERENCE IS ADOPTED.);
  otherwise the players' majority decides (the coin on a tie), whatever the substrate says. A
  level substrate, or none on record, with no players leaves it to the chair's coin. The
  result carries the substrate's final count.

## Where

- `#assembly` (menu item 7; linked from the city's directory row and the Commons):
  the applications, the transcript, the board, the ballot, the countdown, and after the
  close the result.
- The city (Commons, laid out by hand since this change, extended 7 rows south like the
  Sprawl; its station and every old building unmoved): THE ASSEMBLY (0x6F08, an open-air
  forum: dais, lectern, THE CHAIR obelisk, banner, debate board with the live tally,
  benches) and LOT 0x6F07 (scrub and a PROPOSED DEVELOPMENT sign). While the polls are
  open the two advocates stand at the lectern by projection (translucent, scan lines,
  speaking in turn; they are also elsewhere in the city, so they are drawn as projections
  and are not tappable). The PA reads the running tally in the Commons and on the map.

## After the close

- The first reader after `closeAt` (a GET, or the plan builder) recounts every ballot and
  writes `result` once (onlyIfNew): the majority wins; a tie goes to the chair's coin
  (fixed per session).
- The city reads `{closeAt, winner}` (`sim.setCivic`): the plan builder before building a
  day (`netlify/lib/plans.js` io.civic; a failed read builds nothing), the browser from
  /api/assembly. `sim.lotPhase(mt)`: approved until machine day close + 4 (the builder
  never plans more than 3 days ahead, so every site day is planned after the result is on
  record), a site for 5 machine days (hoarding, a tower crane, the site office, a digger,
  a crew in hard hats; greens or furrows appear with the progress), then the course
  (18 holes, flags, bunkers, a pond, the clubhouse; golfers, caddies, putters, a
  greenkeeper) or the farm (four crop beds, barn, silo, stand, scarecrow, tractor;
  pickers, hoers, a seller, buyers). Visitors: the lot takes no leisure visits until the
  site opens; then the site draws the lower tier bands, the course the top, the farm the
  middle and lower. Everything is clock math on the recorded outcome: every viewer sees
  the same construction.

## Storage (lean, per the scaling plan)

Store `hvi-assembly`, keys under `s001/`: `meta`, `v/<voterKey>` (one per voter: salted
hash of the case number; onlyIfNew, then CAS on the etag), `ip/<hash>` and `dev/<hash>`
(capped lists of voter keys), `tally` ({seen: {voterKey: [rev, choice, reasonMask]}},
folded on write by CAS, idempotent per voter revision so a retried or late fold never
double-counts), `result`. A fold that loses its race leaves the ballot saved; a GET
recounts from the ballots every 10 minutes (while under 2,000 voters) and the close always
recounts. `scripts/check-assembly.mjs` holds: one vote per case, change, closed after the
deadline, every limit (owner's case included), the tally equal to the ballots under 320
concurrent writes with and without injected fold failures, concurrent closes agreeing,
the city build deterministic and ordered, no lot visitors before the site, and the
no-quotes rule over every content string.

**When to move to a database:** past ~2,000 voters in a session (the GET stops
recounting and the tally blob passes ~60 KB), or sustained ballot writes over ~5 per
second (CAS retries on the one tally blob), or the second concurrent session. Then:
ballots as rows with a unique (session, voter) key, the tally as a GROUP BY or a counter
table updated in the same transaction.

## Session 002: THE RESORT PARCELS (2026-09-30)

Scott: "keep building the city outward... mountain and ski resort type stuff, maybe a resort
area like a beach area. You should ask the developers about that." The city grew two
expansion districts (docs/CITY_SPEC.md "The city built outward"), each with a vacant resort
parcel; the developers on file bid for them.

- **Opens when 001 closes, not before** (one open session at a time): the first reader after
  001's close (a GET, or the plan builder's `civicOf`) writes `s002/meta` once (onlyIfNew) with
  `openAt` = 001's `closeAt` and `closeAt` three days on, so every reader writes the same times.
  001 closes 2026-10-03 09:48:53 UTC; 002 then runs to 2026-10-06 09:48:53 UTC.
- **Two motions, four bids** (`src/assembly/content002.js`, reviewed; no model at runtime):
  - PARCEL 0xAD06, THE COAST: APPLICATION 003, A BEACH RESORT (JIMMY BUFFETT, 1946-2023: he
    built restaurants, hotels and retirement communities on one song) or APPLICATION 004,
    OCEANFRONT APARTMENT TOWERS (FRED TRUMP, 1905-1999: some 27,000 apartments and row houses
    in Brooklyn and Queens; the chair reads the 1973 federal rental-discrimination suit,
    settled in 1975 without an admission, and the 1966 demolition party at Steeplechase
    Park into the minutes).
  - PARCEL 0xBE06, THE HEIGHTS: APPLICATION 005, A SKI RESORT (RICHARD BRANSON, living: a
    filing only; his group keeps a ski lodge in Verbier) or APPLICATION 006, A MOUNTAIN LODGE
    AND PRESERVE (JOHN D. ROCKEFELLER JR., 1874-1960: the Jackson Hole land he gave for Grand
    Teton National Park; the chair reads Ludlow, 1914, into the minutes).
  The dead applicants pitch their own bids, in their manner; the living applicant's bid has a
  dead advocate, TENZING NORGAY (1914-1986: Everest in 1953; the chair notes that Hillary was
  knighted and he was given a medal). Four speeches each, reconstructions, no quotation marks;
  a reaction per reason per bid. The living applicant never speaks (checked, as in 001).
- **The same rules**: one ballot per assessed file (a bid for EACH parcel, one set of 1-3
  reasons counted for both), the same limits, changeable until the close. THE SUBSTRATE
  advises on each parcel (`SUBSTRATE2`: leans for each bid; the applicants recused); with zero
  player ballots each parcel adopts the substrate's preference (THE CITIZENRY ABSTAINED...),
  otherwise players decide each parcel, a tie to that parcel's own coin.
- **Storage**: `s002/...` exactly as 001's; a ballot's `c` is `{coast, heights}` and the tally
  folds it as one number (motion i's choice index times 2^i); the result holds `winners`,
  `ties`, `decidedBy` and `substrate` per motion. `civicOf` gives the city `resorts:
  {closeAt, winners}` beside 001's `{closeAt, winner}`.
- **Built**: `sim.resortPhase(parcel, t)`, 001's timings from 002's close: approved, a site for
  LOT_BUILD machine days from closeDay + LOT_BREAK (hoarding, a crane, foundations rising, a
  crew in hard hats), then what won: THE LOW TIDE RESORT (a low hotel, a pool, a thatched bar,
  cabanas), THE OCEANFRONT TOWERS (two towers on a podium with a pool deck), THE SUMMIT RESORT
  (two more chairlifts, four groomed runs, snow cannons, the lodge) or THE HEIGHTS PRESERVE (a
  timber lodge, trails through the pines, a lookout on the ridge). The parcels take no
  visitors before the ground breaks; then the crew, then whoever the winner draws by tier.
- **Where**: #assembly shows 002 once it opens (001's result stays on the record at the foot);
  the forum's board, banner and projections follow the session (the parcels' speakers a pair
  at a time); the city's row and PA name the parcels; proposals may not build on them.

## Next sessions

The machinery takes a session id (`SESSIONS` in netlify/lib/assembly.js): a session names the
one before it (`after`) and its motions; content, leans and a lot per motion go beside it. ROADMAP b5 continues: councils, a legitimacy meter, elections. Since the
civic fold (docs/CITY_SPEC.md "The civic fold") each district has a vacant COUNCIL seat, and
this session's result is recorded as the Council's first act in every district's record
(from the day the ground breaks); the outcome also moves the districts' moods.
