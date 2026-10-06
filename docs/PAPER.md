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
