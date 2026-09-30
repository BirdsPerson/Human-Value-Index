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

## Next sessions

The machinery takes a session id; a second session needs its own lot, content and a
`SESSION` bump. ROADMAP b5 continues: councils, a legitimacy meter, elections.
