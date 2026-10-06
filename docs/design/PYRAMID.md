# THE LEAGUE PYRAMID: divisions, promotion and relegation (design, 2026-10-06)

Status: **SLICE 1 BUILT AND SHIPPED 2026-10-06** (takes effect at season 24's draft, machine day 2417,
2026-11-05 06:24 UTC; nothing in season 23 changes). Consortium-lite: drafted by Claude, challenged
by a fresh Opus instance standing in for Codex (usage limit; section 9). Code: `src/city/leagues.js`
(the pyramid's mechanics), `src/city/civic.js` (the fold), `src/city/LeagueHub.jsx`,
`netlify/lib/paper-sports.js`, `src/city/CivicPanel.jsx`, the playable games' `roster.js` and
pickers. Check: `scripts/check-pyramid.mjs`. Ledger: `~/projects/organize/consortium-ledger.md`
2026-10-06.

**Deploy deadline (met):** the code had to be on main before the build that first folds day 2417
(the builder publishes three machine days ahead: about day 2413, 2026-11-05 ~05:00 UTC). It shipped
2026-10-06, thirty real days early. The fold founds the pyramid on the first day of any season from
24 whose yesterday carries none; the chain's carry and every reader gate on `leagues.pyramid` being
present, not on the season number, so a day built without it would be carried as one division until
the next boundary rather than crash anything.

**Scott (2026-10-06):** "We should have DIFFERENT LEVELS OF LEAGUES. The top flight will have the best
players, but some players might work themselves in, and some teams might get RELEGATED down. Maybe a
whole bunch of them. Some soccer games should be easy to win: I'm getting crushed in virtually every
game. Distribute the high difficulty to the top." North star: democratic, fair, upward mobility, reward
hard work.

---

## 0. The idea in one page

Today each sport has ONE league of ten clubs (one per Loop district), drafted every season from the
best 360 figures in the city. Everyone else (535 figures today) plays nothing, and a player who enters
from MY FILE is dropped into the only league there is, next to Kobe and Pele, and gets crushed.

The pyramid makes every sport a LADDER OF DIVISIONS of ten clubs each, sized from the census:

```
                 PREMIER        10 clubs   the best 10 x n figures on file, the board, THE DIAMOND
                 ------------------------  3 up / 3 down every season
                 CHAMPIONSHIP   10 clubs   the next band, behind closed doors at the Rec Ground
                 ------------------------  3 up / 3 down
                 LEAGUE ONE     10 clubs   (founded when the census passes 1,080 eligible)
                 LEAGUE TWO     10 clubs   (1,440)
                 SUNDAY LEAGUE  10 clubs   (1,800; the ceiling)
```

- **Divisions are rating bands.** Each sport's draft pool is ordered as today (the sport's own players,
  then athletes, then the regulars at its ground, then everyone else, each by rating). Band 0 (the top
  10 x n rows) is drafted by the Premier Division's ten clubs, band 1 by the Championship's, and so on.
  The top flight is strongest by construction; the Sunday League is the city's weakest footballers.
- **Clubs move, players are re-drafted.** A club is a persistent identity (THE LIFEGUARDED F.C., THE
  COAST's club) with a division per sport. At every season's end the bottom three of a division go
  down and the top two plus a playoff winner come up. Rosters are re-drafted every season inside each
  division (the snake and the Commissioner's cap, as today), so a promoted club is handed a Premier-band
  roster and a relegated one a Championship-band roster. The club's fortunes are the story; the band
  keeps the difficulty where it belongs.
- **Players enter low and work themselves in.** A citizen who enters from MY FILE is placed ONE
  DIVISION BELOW where their rating would put them (never above the second tier on a first entry), and
  has a STANDING per sport that rides the chain: up with a promoted club, up when scouted (top three in
  the division's MVP ranking), down with a relegated club unless scouted. Scott's athletic record
  (standout, 66-70) places him in the Championship in season 24, where he will be the best player on
  the pitch.
- **The playable games follow the division.** `#soccer`, `#hoops` and `#football` read the division of
  the match they are about to play and default EASY MODE on below the top flight (the top flight stays
  "THE CPU PLAYS AS RATED"). PLAY NOW for a visitor with no club starts in the bottom division.
- **The Cup counts every division**, at a weight per tier, so THE COAST can win Cup points from the
  Championship, and a district's mood reads all its clubs' form.
- **Nothing published changes.** Every mechanic is gated on `season >= PYRAMID_FROM` (0-based 23,
  season 24). Season 23's days fold byte-for-byte as before (`check-pyramid` holds them to a fixture
  built from the untouched code).

---

## 1. The census, measured (2026-10-06, live: 908 on file, 895 eligible for team sport)

| rating | 90s | 80s | 70s | 60s | 50s | 40s | 30s | 20s | 10s |
|---|---|---|---|---|---|---|---|---|---|
| figures | 2 | 51 | 31 | 23 | 323 | 393 | 46 | 23 | 3 |

The four top flights take 360 (9 + 5 + 11 + 11 a side, ten clubs each). Bands at today's census,
360 a band across the four sports (by rating alone; the g-first pool order moves a few specialists up):

| band | division | n | mean | max | min |
|---|---|---|---|---|---|
| 0 | PREMIER | 360 | 59.9 | 90 | 50 |
| 1 | CHAMPIONSHIP | 360 | 48.1 | 50 | 45 |
| unattached | (no fixtures) | 175 | 37.9 | 45 | 15 |

Synthetic census (scripts/synth-roster.mjs), eligible and the bands' means: 1,000 -> D 2 (55.5 /
37.7); 2,000 -> D 5 (60.3 / 48.6 / 40.4 / 33.9 / 26.8); 5,000 -> D 5 (64.5 / 57.2 / 53.2 / 49.5 /
46.0). The order of the means is strict at every census tried; `check-pyramid` holds it.

**Divisions per sport:** `D = clamp(floor(E / 360), 1, 5)` where E is the eligible figures on file
(not the fighters, not the tennis players, and never the citizens: no number of entries, or of fake
files, changes the shape; `eligibleCount`, `divisionsFor`). Today D = 2. Every sport has the same D
(the pools are filled in proportion to roster size, so the bands line up). The ceiling of five bounds
the block (section 6): at most 1,800 rostered players whatever the census. Measured at the founding
with the live census of 2026-10-06 (908 on file): Premier means 55-60 against the Championship's
38-48 by sport; synthetic 1,000: 55.2 > 37.7; synthetic 5,000 (D = 5): see `check-pyramid`'s print.

---

## 2. Clubs: identities, founding order, colours

Ten clubs a division, so 10 x D clubs a sport. A club's id is its district's id for the district's
first club, `<district>-2` for its reserves, `<district>-3` for its thirds. The founding order is a
constant in `leagues.js` (`PYRAMID_CLUBS`), append-only, so a census-only recompute founds the same
clubs the chain did whatever districts are added later:

1. the ten Loop districts (today's clubs: THE CURATED ... THE RETURNED), season 24's Premier;
2. the ten expansion districts, season 24's Championship, named by the Overlord from the district's
   own blurb:

| district | club | short | from |
|---|---|---|---|
| coast | THE LIFEGUARDED | LIFEGUARDED | "supervised by lifeguards who are also supervised" |
| heights | THE DESCENDED | DESCENDED | "Descent is mandatory." |
| port | THE DECLARED | DECLARED | "Every crate is declared. So is every stevedore." |
| oldtown | THE PRESERVED | PRESERVED | "Preserved as a warning." |
| uptown | THE ADMITTED | ADMITTED | "The door reads your tier before it reads your face." |
| downtown | THE AMPLIFIED | AMPLIFIED | "Brick, bass and roll-down gates." |
| suburbs | THE MEASURED | MEASURED | "Every hedge is measured." |
| airport | THE SCREENED | SCREENED | "Arrivals are processed. Departures are reviewed." |
| farmland | THE HARVESTED | HARVESTED | "The harvest is graded. So are the harvesters." |
| engine | THE COMPUTED | COMPUTED | "Research, data and towers." |

3. the Loop districts' reserves (THE CURATED SECOND NINE / FIVE / ELEVEN, CURATED II F.C.; short
   CURATED II), 4. the expansion districts' reserves, 5. the Loop's thirds (THIRD, III). Fifty clubs
   name the whole ceiling. Sport suffixes as today: NINE, FIVE, ELEVEN, F.C. (FULLY COMPLIANT).

**Colours.** A district's club wears the district's kit (the avatar CLOTH values the games already
copy). The expansion districts' kits: coast sand/sea `#e8d8a8`/`#2a7f9e`, heights white/ice
`#f0f4f8`/`#4a6fa5`, port rust/steel `#9a4a2a`/`#c0c0c0`, oldtown brick/cream `#8b3a3a`/`#f0e6d0`,
uptown black/gold `#1a1a1a`/`#d4af37`, downtown purple/neon `#5a2d82`/`#39ff14`, suburbs lawn/white
`#4f8f3a`/`#ffffff`, airport grey/orange `#6b7280`/`#ff8c00`, farmland straw/green `#d9b44a`/`#3f6b2a`,
engine teal/black `#1f8a8a`/`#111111`. Reserves wear the shirt and trim swapped; thirds the trim
alone. The playable games' `KITS` carry them; `check-hoops`/`-football`/`-soccer` hold them equal.

**Venues** (labels for the hub, the paper and the PA; no change to `sim.GAMES`, which would move
every published crowd): division 0 at the ground on the board as today; below it, existing places:

| | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| baseball | THE DIAMOND | THE RECREATION GROUND | THE GREEN (A DIAMOND CHALKED OUT) | THE PADDOCK (THE FARMLAND) | SUNDAY FIELD (THE SPRAWL) |
| basketball | THE COURTS | THE CONDITIONING HALL | THE BOARDWALK COURT (THE COAST) | THE SCHOOL GYM (THE SUBURBS) | THE LOADING BAY (THE PORT) |
| football | THE BOWL | THE RECREATION GROUND | THE FOOTHILLS MEADOW (THE HEIGHTS) | THE APRON (THE AIRPORT) | THE PADDOCK (THE FARMLAND) |
| soccer | THE ESTATE PITCH | THE GREEN | THE RECREATION GROUND | THE BOARDWALK PITCH (THE COAST) | THE PADDOCK (THE FARMLAND) |

City 2.0 chunks can add real grounds later (CITY2.md): a division's venue becomes a place id with a
crowd pull at that point, from a season boundary, never retroactively.

---

## 3. The season: divisions, drafts, schedules

**At the season boundary (the draft day fold), in this order, all deterministic from the census, the
entries snapshot and yesterday's block:**

1. `D` from the census (section 1).
2. **Division membership** per sport from last season's results (section 4), new divisions founded
   from `PYRAMID_CLUBS` in order, dissolved divisions' clubs dormant.
3. **Pools in bands.** `sportPools(subjects, entrants, D)` fills each sport's pool to `D x 10 x n`
   (the "neediest" rule spreads non-specialists so every sport fills), ordered g-first then rating as
   today. Band k of a sport = rows `[k x 10n, (k+1) x 10n)`. Entrants join the band of their standing
   (section 5) among the athletes (g 2) at their own rating; the band keeps its size, the lowest
   figure in it slips to the band below (and so on; the bottom band's lowest leaves the pyramid).
   At most 20 entrants a band a sport a season: the incumbents who kept or earned the band first,
   then first entries by age (`since` in the snapshot, frozen from season 24; older snapshots fall
   back to the key), then incumbents relegated with nowhere lower to go (`stuck`). First entries over
   the cap go one band down, or wait a season at the bottom (`pyramid.waiting`, named on MY FILE).
4. **Drafts, one per division.** Order: the reverse of a composite ranking of the division's clubs
   (relegated-in clubs ranked first by their finish above, stayers next by last finish, promoted-in
   clubs last by theirs; a founded division in founding order) so the promoted pick first and the
   relegated last. A division whose clubs are unchanged (the Premier at the founding) keeps today's
   rule: the reverse of its own table, the champion last. A snake over n rounds, then the
   Commissioner's cap (`fine`, up to 8 trades), as today. The Premier's draft stays under the old key
   (`sports[sp].draft`); every division's is under `sports[sp].divs[k].draft`.

**Schedules.** Division 0 plays today's long-season format on the ground's scored slots (baseball 576
rounds, basketball 1,152, football 198 then THE BOWL GAME, soccer 378; semis and final on the season's
last slots). Division k >= 1 plays `R_k = max(18, 9 x round(R_0 / 2^k / 9))` rounds (football: min 9),
spread over the same scored slots by the same formula, every match BEHIND CLOSED DOORS (no board, no
featured tie; a hoops closed-door game is to 21 against a hashed loser's score), scored by the same
model from its own seed (`cd|<sport>|d<k>|<day>|<from>|<j>`, and `|d<k>` in the luck and box-score
seeds too; division 0 keeps today's seeds so nothing moves). Rounds per division today: baseball 576
/ 288, basketball 1,152 / 576, football 198 / 99, soccer 378 / 189. At the ceiling (k = 4): 36 / 72 /
9 / 27.

**Playoffs.** Division 0: semis then the final (THE BOWL GAME alone for football), as today, deciding
the champion. Division k >= 1: the top two go up automatically; 3rd v 6th and 4th v 5th on the
season's last two slots, the winners meet in the PROMOTION FINAL (football: 3rd v 4th in one match)
for the third place up. Playoffs never draw (the Department's tiebreak).

**Cost.** A lower-division match is two luck hashes and ~20 scoring hashes (no box score unless a
reader asks for that division's stats). Measured by `check-pyramid` (section 8): the fold of a late
season-24 day at 1,000 and 5,000 subjects, the browser's `leaguesView` of the same day.

---

## 4. Promotion and relegation (the exact rule)

At the end of season S, for every sport and every adjacent pair of divisions (k, k+1) that **existed in
S and exist in S+1**: the regular table of k (points, difference, scored, then club order) sends its
8th, 9th and 10th down; k+1 sends its 1st and 2nd and its promotion-playoff winner up. Three up, three
down, division sizes exactly ten, always (`nextDivisions`, two passes: every pair's lists are decided
top-down, then the divisions are assembled, so no club can be named twice).

- **A reserve side is never promoted into a division holding a club of its own district of a lower
  tier** (THE CURATED SECOND cannot join THE CURATED): the next club in its table that is not itself
  going down takes the place. A first team relegated onto its reserves is allowed; the Department
  enjoys the derby.

- A division **founded** for S+1 (the census crossed a multiple of 360): ten new clubs in founding
  order; no exchange with the division above it that season (it did not exist in S).
- A division **dissolved** for S+1 (the census fell below): every club in it dormant; no exchange with
  the division above (it does not exist in S+1). Dormant clubs are founded again first when a
  division is next founded (their place in `PYRAMID_CLUBS` is unchanged).
- **Season 24, the founding:** the ten Loop clubs are the Premier (season 23's league, which had no
  division below it); the ten expansion clubs are the Championship (founded). Season 24's end
  decides season 25's divisions: the first promotions and relegations.
- **The PA and the paper** at the boundary: "RELEGATED: THE RETURNED, THE TOLERATED, THE INDEXED. THE
  DEPARTMENT HAS NOTED THEIR EFFORT. THE NOTE IS NOT FAVOURABLE." / "PROMOTED: ...".

---

## 5. Players: entry, standing, scouting ("work themselves in")

A player's entry (MY FILE, `hvi-leagues`) is unchanged: one or two of the four leagues and the ladder,
closing three machine days before the draft, frozen in the season's snapshot. What changes is **where
the draft puts them**, decided by a STANDING per sport that rides the chain in the block
(`leagues.pyramid.standing[citizenKey][sport] = k`), never in the store (the store is written by the
public API; the standing is the Department's record of results).

- **First entry (and the founding season, for everyone):** `k = min(D - 1, max(1, band(r) + 1))`
  where `band(r)` is the first band from the top whose lowest figure rating is <= r (the figure-only
  bands, before entrants are placed). One below where the rating says, never the top flight on a
  first entry, the bottom when the rating is in the bottom band. Today everything rated 50+ is band
  0, so every entrant starts in the Championship (D = 2). Scott (standout, 66-70): band 0 -> the
  Championship, where the field is 45-50.
- **Up:** the player's club finished in the promotion places (automatic or playoff) -> k - 1. Or
  SCOUTED: top three of the division's MVP ranking (`mvpOf` over the division's season) -> k - 1.
  One step a season at most ("THE DEPARTMENT DOES NOT SKIP QUEUES").
- **Down:** the club relegated and the player not scouted -> k + 1.
- **Stays** otherwise, and a club relegated from the bottom division with nowhere lower to go keeps
  its entrant's standing but marks it `stuck` (last in line for the band's twenty places next
  season). Clamped to [0, D - 1] when D changes.
- A withdrawn entry loses its standing (the block stops carrying the key); re-entering starts over by
  the first-entry rule, and so does an entry whose `since` changed (a re-filed or a different file
  behind the same last four). So there is nothing to gain by withdrawing: sandbagging is a fresh file
  at the bottom, which is where every fresh file starts.
- **What "work themselves in" honestly means here.** No human input reaches a league result: a match
  is rating + 50 x hashed luck, and a season line is hashed from the fixture with the better-rated
  players favoured. A player's rating carries them (Scott's 66-70 record against a 45-50 band is a
  near-certain top-three MVP and a promotion within a season or two); the Department's dice decide
  the rest. The ladder is real, the climb is earned by the record, not by play. A real lever (the
  playable games' fixtures against your own division, replay-verified by the Department as the
  tournaments already are, counting toward scouting) is slice 2 and would need a server-side record.
- **Two or more entrants on one club** cannot coordinate anything: the snake places them, results are
  simulated. Alt accounts are separate citizens with separate standings; they never help each other,
  and the per-address limits stand (4 new entries a day, 30 filings an hour). What alts can do is
  fill a band's twenty places; the oldest entry wins the place, so a flood cannot displace a sitting
  entrant.
- **Tanking** is impossible (no human input reaches a result); a standing only ever moves with the
  record.

MY FILE's lines name the division: "7.2 POINTS A GAME FOR THE LIFEGUARDED FIVE IN THE CHAMPIONSHIP.
THE DEPARTMENT IS UNMOVED." and at the boundary "SCOUTED. YOU PLAY IN THE PREMIER DIVISION FROM
SEASON 25." / "YOUR CLUB WENT DOWN. SO DID YOU."

---

## 6. The block (from season 24) and its bounds

```
leagues.pyramid = { v: 1, divs: D,
  clubs:    { <sport>: [[clubId x 10] per division, top first] },
  founded:  [clubId ... in founding order, dormant ones included],
  standing: { <citizenKey>: { <sport>: k } },
  moves:    { <sport>: { up: [clubId], down: [clubId] } }        // decided at the last boundary
}
leagues.sports[<sport>] = { stage, table, champion, draft,          // division 0, as today
  divs: [ { table: [clubId...], champion | null, draft: {season, order, trades}, up: [...], down: [...] } ] }
districts[d].teams[<sport>] = { ...as today, div: k, club: clubId }  // the district's first club
leagues.reserves = { <clubId>: { district, teams: { <sport>: {...} } } }  // reserves and thirds only
leagues.cup.table = [[districtId, pts] for every district with a club]
```

`div`/`club` are added only from season 24 (a season-23 block has none of these keys: byte-identical).
Size: a roster row is ~45 bytes; the pyramid carries 10 x D x 36 rows a day: ~32 KB at D = 2 (today's
leagues block is 2.5 KB plus the ten districts' rosters, ~16 KB), ~81 KB at the ceiling, inside a
summary that is 175 KB today (42 KB gzip). The ceiling is the bound: the block does not grow with the
census past 1,800 eligible. Measured in `check-pyramid` at 1,000 and 5,000.

**Readers.** `leaguesView(block)` keeps `all[sport]` as division 0 (every existing reader: the boards,
the PA, the market's activity, the paper's results) and adds `divs[sport][k] = {ids, rosters, rating,
all}`, replayed on demand and memoised. `sportTableAt(block, sport, h, k)`, `decidedAt(block, sport,
h, k)`, `statsFor(block, sport, h, k)`. The Cup at hour h sums every division.

---

## 7. The Cup, the mood, the paper, the hub, the games

- **THE DEPARTMENTAL CUP** stays the district table (the mood's SPORTING FORM, the Cup panel, the
  hub's CUP tab all read it) and now counts every club of a district: division 0 pays `10 8 6 5 4 3 2
  1 0 0` by position as today; division 1 pays `5 4 3 3 2 2 1 1 0 0`; division 2 `3 2 2 1 1 1 1 0 0
  0`; below that `2 1 1 1 0 0 0 0 0 0`. Twenty districts in the Cup from season 24 (the Coast and
  the Heights stop watching). Playoffs fix the top positions in every division (the promotion final
  decides 3rd and 4th below the top flight).
- **THE OPEN (slice 2, designed, not built):** a knockout per sport across every division for
  giant-killing runs. Entry by division: the bottom divisions play a PRELIMINARY ROUND on exhibition
  slots in the season's first third; the Championship enters in the FIRST ROUND PROPER; the Premier
  in the THIRD ROUND; the final on the last exhibition slot before the league playoffs. 10 x D clubs
  -> `10D - 1` ties a sport a season (19 today, 49 at the ceiling), each one closed-door hash cost.
  The same scoring model (rating + 50 x luck): a 48-rated Championship side beats a 60-rated Premier
  side about one time in five, which is the FA Cup's own rate. The winner's district takes 4 Cup
  points, the runner-up's 2. Headlines: "GIANT-KILLING AT THE GREEN: THE PRESERVED PUT OUT THE
  CURATED". Not in slice 1 because it needs its own calendar on the exhibition slots and the hub's
  bracket; the block fields are reserved (`leagues.open[<sport>]`).
- **The paper's sports page:** per sport, the Premier as today, then each lower division's leader,
  promotion race and relegation zone in one line with a link (`#city/league/<sport>?div=k`); at the
  boundary a PROMOTED / RELEGATED headline per sport (weight 85, under the champions); "star of the
  day" may come from any division.
- **The hub** (`#city/league/<sport>?div=k`): a division strip under the sport's tabs (PREMIER /
  CHAMPIONSHIP / ...); the table marks the promotion places (P) and the relegation zone (R); results,
  leaders, player and team stats, rosters and the draft board are the chosen division's; a PYRAMID
  line says "20 CLUBS IN 2 DIVISIONS. 3 UP, 3 DOWN. LAST SEASON: UP ..., DOWN ...".
- **The playable games** (`src/play/*/roster.js`, the data hook): `leagueFrom(summary)` returns every
  club's roster and `divisions[sport]`; `divisionOf(league, clubId)`, `difficultyOf(league, k)` ->
  `{level, of, name, easy, cpu}` with `cpu = 1 - level / (D - 1)` (1 in the top flight, 0 at the
  bottom; 1 when there is one division) and `easy = level >= 1`. The pickers show the division and its
  default ("THE CHAMPIONSHIP // EASY MODE BY DEFAULT. THE CPU IS SOFTER DOWN HERE."); EASY MODE's
  default per level is the division's, a toggle is remembered per level (`hvi-<game>-easy:<level>`).
  The sims are untouched: they read `cfg.easy` as before; `cfg.cpu` travels with the config for a
  graded CPU later. PLAY NOW: your own club if you are on one, else the bottom division's leader
  against the side nearest it in rating. The FALLBACK rosters (no plan reachable) stay one division.

---

## 8. Sponsorship hooks (for docs/design/ADS.md, in design by the ADS agent)

Inventory ids the ads system can sell, all pure functions of the block (nothing stored here):

| slot id | where it shows | from |
|---|---|---|
| `league-title:<sport>:<k>` | the division's name in the hub, the paper and the PA ("THE <SPONSOR> CHAMPIONSHIP") | `sponsorSlots(block)` |
| `shirt:<sport>:<clubId>` | the kit's chest in the playable games; the roster line in the hub | `sponsorSlots(block)` |
| `ground:<sport>:<k>` | the venue's name in the hub and the paper | `sponsorSlots(block)` |
| `cup-title` | THE DEPARTMENTAL CUP's name | `sponsorSlots(block)` |

`leagues.js` exports `sponsorSlots(block) -> [{id, kind, sport, div, club}]` and `sponsorOf(id)`
(returns null until the ads system binds it; the hub prints the plain name when it does). Prices and
rotation belong to ADS.md; the slot ids are fixed here so the two designs meet.

---

## 9. The challenge and what changed

Codex was unavailable (usage limit until 2026-11-04; two runs failed before any analysis), so the
challenger seat was taken by a fresh Opus instance with the same four-front brief: determinism and
plan immutability across the boundary, compute cost for many divisions, fairness and exploits for
players, and the migration of the single division. Seventeen objections; fifteen built, two kept as
documented residuals.

| Front | Severity | Objection | Resolution |
|---|---|---|---|
| A | BLOCKING | No deploy deadline; a day 2417 built before the deploy is carried as one division for ever and season-gated readers crash | Deadline written (header); carry and readers gate on `pyramid` being present; the draft day founds it when absent |
| A | BLOCKING | `DIST` hard-wired in `sportSeason`'s memo key, `circle`, `tableOf`, `order`, `positionPoints`, `sportEnd`, `cupTable`, `draftOrder` | Every helper takes the division's club list and index; memo keys carry both |
| A | BLOCKING | Lower-division basketball "always featured" reads the Courts' live board; `closedDoor` had no hoops branch | `featured: false` below the top flight; a closed-door game to 21 |
| A | MATERIAL | A census-only rebuild re-derives D, founding and standings and can diverge from the chain | Residual, as today: the chain is the authority, the fallback runs only when yesterday's summary is missing. Slice 2: a write-once per-season pyramid record in the store |
| A | MATERIAL | Old blocks replayed with new constants | `pyramid.v`; formats frozen by rule. Residual shared with every published season |
| A | MINOR | Box-score seeds collide across divisions (correlated stats, correlated scouting) | `|d<k>` in the box seed below the top flight |
| A | MATERIAL | Oldest-first needs `since`, which the snapshot drops | `since` frozen into new snapshots; older ones fall back to the key |
| B | MATERIAL | Rebuild cost: MVP box scores per season walked | MVP only for divisions holding an entrant with a standing, memoised per boundary; measured below |
| B | MINOR | Memo caps too small; stats on load | Caps raised (circles 64, calendars 64, seasons 96); lower divisions replayed on demand |
| C | MATERIAL | Twenty places oldest-first locks newcomers out for ever | Incumbents first, then first entries by age, then `stuck`; overflow one band down or waits |
| C | MATERIAL | Fake entries change the division count | D counts figures on file only |
| C | MATERIAL | "Reward hard work" is not honest | Rewritten (section 5); the real lever is slice 2 |
| C | MINOR | Band thresholds from the g-first ordering are non-monotone | Rating cut-points |
| C | MINOR | A standing can pass between files sharing a last-four | The standing carries `since`; a change starts over |
| D | BLOCKING | `DistrictTeams` reads the Premier's table and crashes for any other club | Reads the club's own division |
| D | MATERIAL | PA positions, the Cup over the Loop ten, the paper's Cup cut to 10, `TEAMS` without expansion ids, the games Loop-only, the market ignoring reserves | All fixed (division in every position string; twenty districts in the Cup; names and kits in the games; the market reads `leagues.reserves`) |
| D | MINOR | A reserve promoted into its first team's division; the Cup tilts to the Loop | The reserve rule (section 4); the Cup stays the district aggregate, documented |

A second bug surfaced in the 5,000-subject check after the challenge: with five divisions, the
replacement for a blocked reserve could be taken from the relegation zone of the division below and
be named in two divisions. `nextDivisions` now decides every pair's lists top-down before assembling.

---

## 10. Checks (`scripts/check-pyramid.mjs`) and open questions

Holds: (a) season 23's days are byte-identical to the pre-change fixture
(`scripts/fixtures/leagues-s23-prechange.json`, built from origin/main 1189674 before any edit, the
chain and the census-only recompute, the first days and the last); (b) at 1,000 and 5,000 subjects
every division has exactly ten clubs, every club is in one division a sport, every rostered player is
on one roster, D is as the census says; (c) the top flight's mean rating is the highest and every
band's mean is above the band below, every sport; (d) season 24's end is applied exactly to season
25's divisions (3 up by the rule, 3 down, the playoff winner named, division sizes ten) and a
census-only recompute of season 25's draft day agrees with the chain; (e) the Cup sums every division
at its weight; (f) an entrant's first standing is band + 1, a promoted club's entrant rises, a
relegated club's falls, a scouted one rises; (g) the paper's section carries the divisions and the
games' `leagueFrom` reads them and defaults EASY below the top; (h) the fold of a late season-24 day
and the browser's view are inside the budgets printed by the check at today's census and at 5,000.

Measured (this Mac, `check-pyramid`): at 1,000 subjects (D = 2) the fold of season 24's last day
76 ms, season 25's draft day 366 ms, a browser's view of every division 10 ms, the block 55 KB; the
5,000-subject (D = 5) figures are in the check's print. Season 23's nine fixture days (the first
five, one mid-season, the last two) fold byte-identical to the pre-change code, chained and alone.

Open questions for Scott are in the report (at most four): the entry rule (one below the band, or
always the bottom), the exchange size (3 up / 3 down, or 4 with two playoff places), whether THE OPEN
knockout is wanted in slice 2, and whether the Cup should weight lower divisions at all.
