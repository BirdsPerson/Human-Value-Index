# THE DAILY COMPLIANCE — the city's newspaper

Scott, 2026-10-05: "There should be a citywide NEWSPAPER": the regular updates, how to get
involved (jobs, offers), everything going on in the city, sports, comics.

## Where it lives (buckets, not new chrome)
- `#paper` today's edition, `#paper/<YYYY-MM-DD>` an archived one, `?s=<section>` a section.
- The logon's returning-visitor area: one line, today's lead headline, opens the paper.
- MENU, MORE ROOMS: THE PAPER. The city's NOW box: READ TODAY'S PAPER. The Plaza's newsstand
  (BuildingView door + a PAPER toolbar button, `funnels.js`).

## Publishing
- `paper-tick` (every 15 min) wakes `paper-build-background`, which prints today's edition
  (America/New_York date) once: `hvi-paper` `e/<date>` written `onlyIfNew`, never changed;
  `index` under its etag. A reader finding today missing wakes the press too.
- Inputs: the site's own public endpoints (`/api/plan` summary for the civic block, THE MALL and
  EMERGENCE; `/api/market`, `/api/assembly`, `/api/elections`, `/api/proposals`, `/api/arrivals`,
  `/api/social`, `/api/aquarium`, `/api/ebtv-frame`) and `/paper/notices.json` (git, at build).
  What a visitor may see is what the paper may print.
- `buildEdition` is pure: the same input gives the same edition (`scripts/check-paper.mjs`).
- The window: "since the last edition" is the previous edition's press time on the machine clock.
- The WIRE is live (`/api/paper?wire=1`, 60 s): race/Pit/tennis calls, the market's because-lines
  and events, gossip.

## Sections (teletext pages)
P100 front page (ranked headlines: stabilizer 95, emergence 89, river 88, election 87, assembly 85,
market run 80, notices 60, record catch 50 ...), the leader, the WIRE, weather (the machine
clock's mountain and waters), the index. P200 the city (the air and its because-lines, district
moods, THE MALL opened/closed, INTAKE releases, overheard). P300 classifieds (enter a league,
staff wanted, council and Assembly ballots, file a proposal, invest, the treasury, shop units to
let, angling and the aquarium, the Pit, the race, exhibitions; each one tap). P400 sports (four
leagues: results, star of the day from the box score, table, leaders, next fixtures; the Cup,
tennis ladder, the Pit, the weekend race, the aquarium's plaques). P500 markets. P600 the
Assembly, the council, Prefect directives, the docket. P700 tonight's bill, EBTV, the arcade.
P800 the strip and the scramble. P900 Department notices (git). P999 the archive.

## Rules
- Nobody on file is quoted; a candidate's platform never prints; no quotation marks at all.
- No death labels (check-no-death-labels' markers on every printed string); arrivals under a
  harm finding are not announced.
- The comic (`netlify/lib/paper-comic.js`) casts only the Department's own characters: the
  Prefects, ADJUDICATOR UNIT 40-LOVE, the six EBSN hosts. Facts are teams, trades, districts, numbers.
- The leader: at most one model call a day (`chargeGlobal`, inside HVI_ANTHROPIC_DAILY_CAP),
  given only the edition's facts, told to name nobody; the guard withholds it on any quote, life
  or death word or accusation, and cuts sentences with numbers the facts lack. Else the template.

## Reading (2026-10-09; Scott: "readable and legible ... it should link to everywhere the user would want to go")
- The edition is stored as printed, in capitals. The reader (`src/paper/read.js`, pure) renders the
  copy in sentence case with names restored; headlines, kickers, tabs and section heads keep the
  Department's capitals. Body 16px, line height 1.6, measure about 68ch, the paper on `--panel`.
- Edition shape v2 (`PAPER_V`): v1 plus `ents` ({UPPER NAME: {h, n?, p?}}: every name printed and
  where it goes) and listings that point at the place in the city (a venue's building, a district,
  a seat holder's file, a shop's unit). A v1 edition (Nos. 1-5) is never rewritten: `/api/paper`
  looks its names up at read time (`entsOf` over the board's rows and the city's places) and sends
  them beside it. Both render.
- Where a name goes: a figure on the board -> `#market/<slug>` (their file); a Pit fighter, racer
  or tennis player not on the board -> their venue's page; a performer not on the board ->
  `#city?find=<slug>`; a team -> its league table; a ground -> its league; a district ->
  `#city/<district>`; a venue or shop -> `#city/<district>/<building>[?floor=n]`; an institution
  (the Assembly, the Treasury, Intake, the Pit, EBTV's station...) -> its room (`GLOSSARY`).
  Each name is linked once per story. `validHref` admits only routes the app answers.
- The front page opens on TODAY IN 30 SECONDS (`briefOf`: the lead, two stories, the index, one way
  to take part, one tap each). Every story ends in one next step (`nextOf`); every section ends in
  WHERE TO NEXT. Phone: the section tabs wrap (short names), one column.

## Pictures (wire photos)
- `src/paper/wirephoto.js`: drawn in the browser at 160x100 from what the site has (the file
  sprites via the atlas or `/api/sprite`, else the procedural placeholder; the edition's own
  numbers), halftoned with a 4x4 ordered dither in the theme's two inks, scaled up pixelated.
  Zero spend: no model, no upload, nothing stored.
- Deterministic: the scene is chosen and laid out from the edition alone, seeded by date + story,
  so an archived edition draws the same picture (only a likeness drawn since can sharpen).
- Scenes: the Pit's ring (the two fighters), the race podium, the scoreboard, a league's table as
  bars, the market's movers, the Intake queue, a shopfront, the ballot box, a district's skyline
  (dark under curfew). Lead story large with caption; stories as thumbnails.
- People: only a name the edition marks `p` (listed on the board, no harm finding on file) is drawn,
  in the sprite's neutral frame, in a scene the story's data states. Everyone else is named and
  linked, never pictured. Every picture is captioned "Department illustration."

## Checks (`scripts/check-paper.mjs`, section 9)
- Every printed string: a figure it names is linked (roster, board names, performers, fighters,
  racers, players); no long line still reads in capitals; every `ents` href and `dhref` routes.
- Every text colour in Paper.jsx's stylesheet is listed in `PAPER_PAIRS` and each pair holds WCAG
  AA (4.5:1) on its surface in all twelve themes.
- Pictures: deterministic, only `p` people, captioned; a harm-flagged figure is never drawable.
