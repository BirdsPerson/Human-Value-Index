# City v1 — "The Substrate" (watch mode)

Design artifact: https://claude.ai/artifact/YYh7b4zML4qb5HH5jbzokE
Scott's direction: mostly passive (SimTower / Theme Park), terminal/ASCII look,
everyone uploaded into the mainframe, everyone has an Overlord-assigned job.
Economy (CYCLES/UBI) and player decisions come later; v1 is the living city you watch.

## Non-negotiables

- Terminal aesthetic (see docs/avatar-design-system.md, src/term.jsx, the building in src/building.js).
- Overlord voice on every string.
- Client-side, deterministic: the whole city is computed from `seed` + the machine
  clock, so every viewer sees the same city at the same moment. No server sim, no new API cost.
- Passive: no action controls. Tap/click to inspect; optional "follow" a subject.
- Performance: 300+ subjects; one rAF loop; only the visible layer is simulated in
  detail (others advance by schedule math, not per-frame physics).
- Works at 400px (map pans/zooms; district views stack).

## Module contract (src/city/)

```js
// sim.js — pure, no DOM. Testable in node.
export const DISTRICTS = [ { id:'hq', name:'DEPT HQ', addr:'0x0000', places:[...], rect:{x,y,w,h} }, ... ];
// ids: hq, arts, campus, finance, strip, arena, commons, archive, works, sprawl
export const PLACES = { 'dive-bar': { district:'strip', kind:'leisure', cap: 14 }, ... };
export const JOBS = [ { id, title, district, place, ladder:[rank titles], fields:[...], dims:[...] }, ... ];
export function assignJob(subject)            // deterministic from field/qualifier, top-2 dims, tier -> {jobId, rank}
export function homeOf(subject)               // deterministic (sprawl blocks; archive for the dead; exec for top tier)
export function schedule(subject, day)        // [{from:hour, to:hour, placeId, activity:'commute'|'work'|'leisure'|'home'}]
export function whereAt(subject, machineTime) // {placeId, districtId, activity, progress} (commute = on the bus between places)
export function machineClock(realMs, scale)   // -> {day, hour, minute}; default scale 1 real min = 1 machine hour (configurable)
export function occupancy(subjects, machineTime) // counts per place/district
```

Inputs per subject: the existing figure/card fields (slug, name, qualifier, tier,
octant/quadrant, breakdown, died, places (engine tendencies), avatar/sprite).
Place tendencies from the engine map onto PLACES; unknown ones fall back by tier/field.
The dead live in the Archive and haunt their tendencies at night. Low tiers work at
The Works (waste reclamation / PROCESSING) — a shift, not a mob.

## Views (src/city/)

- `CityMap.jsx` — the whole Substrate: ASCII district blocks, the data-bus loop,
  subjects as tiny dots/sprites moving along the bus and inside districts, district
  labels with live counts, the machine clock + day/shift banner. Tap a district → its view.
- `DistrictView.jsx` — interior of one district (reuse building.js room machinery
  where possible): its places as rooms, subjects at work/leisure with sprites,
  job titles in tooltips. HQ district = the existing six-floor building.
- Subject tooltip/card: name, job + rank, current activity ("ON SHIFT — Radiant
  Systems Engineer, The Works"), opens the existing SubjectCard.
- Route `#city`, menu item on the logon menu, link from the pen.

## Known gap: what the live city is fed

The sim reads `places` (engine tendencies), `stratum` ({domain, occupation}) and
`description` when a subject carries them, but `/api/pen` does not send them:
`publicFigure` (netlify/lib/refer.js) sends slug, name, qualifier (namesakes only), tier,
warmth/competence, died, and the breakdown once the verdict is published. The 62 figures
on file carry none of them either. So in production ENGINE_PLACE, TENDENCY_FIELD,
DOMAIN_FIELD, stratum.occupation and "the dead haunt their tendencies" never fire: an
engine subject is placed by its qualifier if it has one, and is otherwise drafted into
general labour in proportion to each job's room (sim.js `draft`). Closing the gap means
adding `places` and `stratum: {domain, occupation}` to publicFigure, a netlify/lib change
that needs sign-off. scripts/check-city.mjs builds its engine population in the real API
shape, so its capacity and spread numbers describe the live city; the richer inputs are
covered by a separate unit check.

Capacity (2026-09-28): leisure is placed with room capacity in mind. Every client and
function registers its roster (`setRoster`: useRoster, the social tick, /api/quest with the
figures on file); per machine day, figures on file claim rooms first (work, then visits),
then everyone else. A visit to a full room goes to the nearest room of the same kind
(`OVERFLOW`: bars, cafés, culture, green, market, study, sport), then any leisure room;
people bumped together land together. Because figures on file claim first, their
placement does not depend on the census, so quest checks agree with every browser
(check-quests asserts it). check-city: with a production-shaped roster of 250, every
room's peak is within 1.1x capacity; the 422 stress roster stays within 2x.

No dead/alive split in anything a user sees (Scott, 2026-09-28): no death years, no
"deceased" labels, no ghost jokes. The internal rules stay: the living never speak or
vouch; past tense for the dead in verdicts; Wikidata dates for fact-checks; the dead's
day-shift quest tuning. scripts/check-no-death-labels.mjs scans the built bundle.

---

# City v2 (Scott, 2026-09-26)

"City is a good start but will need a lot more. Train works better than buses.
Buildings should be enterable. Like the cube, a 3D view of the city — can be
rendered in layers of 2D planes."

## 1. The Loop (train, replaces the bus)
- Elevated ring line with one STATION per district (name + address), platforms.
- Multi-car trains (3-4 cars) running on a timetable derived from the machine clock
  (deterministic); commuters walk to the station, wait on the platform, board,
  ride, alight. whereAt reports `activity:'commute'` sub-states: walking, waiting
  (platform), riding (train id, car), alighting. Keep continuity checks.
- PA: arrival/departure lines in the Overlord voice ("THE LOOP ARRIVES AT CAMPUS.
  THOSE WITH SOMEWHERE TO BE, BOARD. THE REST OF YOU ALSO BOARD.").

## 2. Enterable buildings (hierarchy city → district → building → floor → room)
- Every PLACE belongs to a BUILDING; buildings have 1-6 FLOORS; floors hold ROOMS
  (places). Extend sim.js: BUILDINGS catalog, place→building/floor mapping,
  whereAt adds {buildingId, floor}. HQ = existing six-floor building (reuse).
- Routes: #city → #city/<district> → #city/<district>/<building> (floor list with
  occupants, room-level sprites, job titles) → tap floor to focus.
- Breadcrumb in terminal style. Keyboard + 400px usable.

## 3. 3D view from 2D planes (like the cube)
- Oblique/axonometric wireframe projection (reuse src/cube3d.js projection math):
  ground plane with district outlines, each building a stack of floor planes
  (rectangles at height = floor index), the Loop as a raised ring with stations,
  trains moving along it, subjects as dots on their floor plane (sprites when
  zoomed).
- Drag to rotate (yaw, clamped pitch), wheel/pinch zoom, idle slow orbit,
  reduced-motion static. Tap a building → its floors "explode" apart vertically
  (animated separation) showing occupants per floor; tap a floor → building view
  at that floor. Toggle [2D MAP] / [3D] — both views stay.
- Painter's-algorithm ordering of planes; only draw visible; 300+ subjects at 60fps.
- Green wireframe terminal aesthetic; labels legible; octant-coloured dots.

## City v2: as built (2026-09-26)

Routes: `#city` (the Substrate; `[2D MAP]` / `[3D]` toggle, remembered per viewer) →
`#city/<district>` (buildings list, the station platform, the rooms) →
`#city/<district>/<building>[?floor=N]` (cross-section, floor N focused; N is the
ground-up floor index). `#city/hq/hq` is the Holding Pen. `?at=HH:MM` / `?stress=N`
(dev only) survive every move; `floor` is dropped when leaving a building.
Breadcrumb: `> CITY › DISTRICT › BUILDING › FLOOR`.

Views (src/city/):
- `CityMap.jsx`: the Loop as two rails with sleepers, a platform per station (painted
  edge on the track side, lit cyan while a train stands there), trains from
  `trainsAt(mt)`; riders drawn as lit windows spread along their car.
- `City3D.jsx` + `city3d.js`: the 3D view, wired to the real sim (BUILDINGS, STATIONS,
  trainsAt). Tapping a floor of an opened building routes to the building view.
- `RoomStage.jsx`: the shared room canvas (terminal-box rooms, sprites walking, door
  in/out, one rAF loop). Caller supplies `cells`, `layout(cssW)` and `assign(w, s)`.
  A `platform` cell draws the board (next two trains) or the standing train with its
  doors open; boarders walk into the car, alighters step off it.
- `DistrictView.jsx`: blurb, BUILDINGS list (counts by the rooms' own rule), then the
  platform and the rooms on one RoomStage.
- `BuildingView.jsx`: floors top to bottom with the lift shaft and floor codes; one
  room per place on the floor; tap a floor (or its directory row) to focus it; the
  focused floor lists occupants with sprites and assignments.
- PA (`City.jsx` / `cityKit.paLine`): every other line is the Loop's latest
  announcement (`loopEvents`); inside a district, its own station's arrivals and
  departures are announced the machine minute they happen.

Review pass (2026-09-26):
- One counting rule: `simApi.roomIn(w, s)` (on a floor, or walking in/out of a building
  inside its district). The header's `N INSIDE`, the district's building list, the
  building rooms and the 3D floor labels all count with it. HQ is never counted in
  public (`CLASSIFIED`); `#city/hq/hq` takes no `?floor=`; DEPT HQ's platform is shown
  above the Pen.
- 3D keyboard: `]` / `[` open the next / previous building (district order, then
  address), Enter moves to its floor list, Escape seals it; a polite status line
  announces each. The canvas is `role="application"` with a visible focus ring.
- 3D drawing: the opened building is drawn last over a scrim; a closed building's
  occupants are drawn after its slabs; rail pieces sort by midpoint and a car sorts
  nearer than every piece under it (`carDepth`); opening a building eases pitch into
  -0.95..-0.45; platforms light (and say TRAIN IN) while a train stands; station tags
  show at the rest zoom; narrow floor labels are code and count only.
- Stairs: whereAt gives walkers a `climb` (0 street .. 1 platform) on the gate <-> platform
  leg, so 3D commuters rise to the deck instead of jumping. ALIGHT is 0.8 DWELL (1.2
  machine min), longer than a census period, so every alighter is seen on the platform.
- Moving city > district > building > floor puts focus on the breadcrumb's "here" when
  the control that had it is gone. Picking a floor in the directory keeps the page and
  the focus where they are (App only scrolls to the top when the hash path changes).
- The clock ticks in its own component; City re-renders only when the census signature
  changes. RoomStage reads its position once per frame, not once per scroll event.
  3D commuters off the screen wait for the next census; located subjects keep their
  ground position and only recompute height.

Measured (headless Chromium, 1280x900, 400 subjects, busy hour): 3D frame gap 16.7 ms
average, p95 17.8 ms; frame script time 0.6-0.8 ms. Screens: docs/screens/city-v2/.

## Rooms as workplaces (Fallout Shelter pass, 2026-09-29)

Scott: "add detail to the environments, bar stools for people to sit at, activity to show
people are actually doing work instead of loitering; use Fallout Shelter for reference."
Fallout Shelter's recipe: a side-on room whose furniture says what it is for, one station
per dweller, each dweller AT a station doing a small looping task, capacity following width.

- `props.js` holds a PLAN per room type (41 types): rows of furniture modules, each with at
  most one ANCHOR `{kind: seat|station|stand|bed|counter, act, role: staff|patron|rest|any,
  face, walk}`. Deep rooms get a back row (0.8 scale, up the wall) and a front row; row-long
  pieces (the bar's counter, the conveyor, the stage, the bleachers) span the room. With a
  capacity, the plan holds exactly that many places, spread across the width, so a full room
  looks full and a quiet one shows its empty stools.
- `assignAnchors` seats people: workers on shift (`activity: work`) take the staff stations,
  visitors the seats (never behind the counter), residents the bunks (bunks first at night).
  Anyone already seated keeps their place when someone new arrives. More people than places
  is a `+K` badge. More workers than stations (the sim drafts general labour) puts the extra
  staff to work at the other furniture (`actAt`: a waiter at a café table, a warden by the
  cots): no worker on shift ever runs a leisure loop.
- `poses.js` draws each person from their own sprite: sit (torso lowered onto the seat, shins
  below), lie (on the bunk, blanket, a Z), walk (paces its module), stand, plus the act's
  motion and a tiny tool (a glass lifted, a bottle tipped, keys, a brush, a tray, a valve rod,
  a barbell). Deterministic phase per person; `t = 0` under reduced motion gives still poses.
- Ambient life, per type, subtle: the neon that nearly gives up, steam off grills and vats,
  the exchange ticker scrolling, racks blinking, the reactor's pulse, the ward monitor, lamps
  that go off in the habs at night (a reading lamp or two stays on).
- Both renderers use it: the iso cutaway (`CityIso.jsx`, sprites 16-64px by floor height) and
  the room canvas (`RoomStage.jsx`, district tiles and building floors). In RoomStage, arrivals
  walk from the door to their anchor and leavers walk back out; the platform is unchanged.
- District tiles show a whole place in one box, so busy places badge the rest; the building
  view, one row per floor, has a place for each of the floor's share of capacity.
- `scripts/check-cityview.mjs` checks anchor typing (kinds, roles, acts with poses, walkers
  inside their module, spans), capacity (building view: places == the floor's cap), the
  assignment rules, and a production-shaped roster through `whereAt` at four hours: every
  worker placed is working, residents asleep at night.

Measured (headless Chromium, 422 subjects): hab block at 21:00, 1440: frame gap 16.7 ms avg,
p95 17.8; iso cutaway on a hab block: 16.7 / 18.0; works district at 390: 16.7 / 18.1; no
long tasks. Screens: docs/screens/rooms-detail/.

## The Loop as an elevated line (iso view, 2026-09-29)

Scott: "the train kind of looks like shit." It was a thin cyan line with cyan dashes.

- `loopGeo.js` (pure, checked in node): the viaduct round the ring with radius-2 curves at
  the corners; the sim's arc within 6 cells of a corner is spread evenly over the drawn
  straight-curve-straight, so cars ease through the bend and sit exactly where the sim has
  them everywhere else (platforms included). A car is placed by its two bogies (centre
  between them, heading along the chord). Straight deck pieces (at most 3 cells), four
  corner pieces and one station item per STATIONS entry are boxes for `depthOrder`.
- `CityIso.jsx`: concrete deck (top, fascia with the Loop's cyan line, parapets, rails,
  sleepers up close), piers every other piece, steel cars (roof, shaded sides, cyan stripe,
  window band then individual windows, doors, gangways, cab windscreen and headlamps on the
  lead car, tail lamps on the last, roof units), warm windows 19:00-06:30 with a headlight
  pool on the deck, glass by day, rider silhouettes in the windows from the census (`riding`,
  trainId, car). Stations: platform with a yellow edge strip, glazed canopy on posts with a
  lit fascia, stairs down beside the platform (commuters' `climb` is drawn along them), a
  name board in the label pass; lit and `// TRAIN IN` while a train stands.
- LOD: far = deck, piers, car bodies with the stripe; mid = rails, parapets, window bands,
  doors, stairs, name boards; near = windows, riders, sleepers, lamps, roof units.
- Painter's order: `iso.slotForBox` slots a car after every deck piece its box overlaps and
  never after a building in front of it. `check-cityview` asserts car counts, spacing (the
  sim's pitch on straights, >= 3/4 of it round a bend), no overlap between coupled cars,
  bodies on the deck through all four corners, and the building order at all four turns.

Measured (headless Chromium, 420 subjects, rush 08:20): frame gap 16.7 ms avg, p95 17.2-17.5
at 1440 (fit, district, street) and 390x844; draw() 1.9 ms avg / 4.6 p95 at the busiest
(1440 fit), 0.5-0.7 ms up close. Screens: docs/screens/city-loop/ (before-*.png = the old line).

## The recreation ground (Arena, 2026-09-29)

Scott: "Can we have a baseball diamond and basketball courts, like a park?" Three open lots
beside the Bowl, on free ground inside the Loop (the Arena is now laid out by hand: every
building there carries a `lot`, `sim.js` B()). The Bowl and Conditioning Hall take the west
column; the lots take the rest.

- Places: `ball-field` THE DIAMOND (mixed, cap 24), `courts` THE COURTS (mixed, 14),
  `rec-park` RECREATION GROUND (leisure, 16). Buildings `the-diamond`, `the-courts`,
  `rec-ground`, all in `OPEN_LOTS` (walkable, drawn as ground).
- Jobs: Umpire (evening) and Diamond Groundskeeper at the Diamond, Court Referee (evening) at
  the Courts. `draft` caps how many of the unplaceable each takes (general labour is otherwise
  drafted in proportion to a place's capacity, which would staff a ballpark like a factory).
- Leisure: sport (and coaching) figures lean to the Diamond and the Courts; middle tiers to all
  three; low tiers to the Courts. Overflow families: the Diamond and Courts with the gym and the
  Bowl; the Recreation Ground with the Green, the Allotment, the Plaza and the Street.
- Fixtures (`GAMES`, `gameAt`, `gameEvents`): LEAGUE NIGHT at the Diamond 18:00-20:30 on
  weekdays 2 and 4, THE WEEKEND FIXTURE 16:00-19:00 on 6 and 7; EVENING PICKUP at the Courts
  17:30-21:30 on weekdays, THE WEEKEND RUN 14:30-20:00. Innings, runs and hoop scores are
  hashed from the day, so every viewer sees the same score. A fixture on when a visit starts
  pulls people to it (x3 their own liking). The PA calls first pitch and the final (Overlord
  voice) on the map and in the Arena, and every fourth line reads the score while one is on.
- Iso view (`parkGeo.js` pure geometry and anchors, `parkDraw.js` drawing): far = the green
  fan, the dirt, blue courts, paths round the fountain, people as dots; mid = foul lines,
  bases, the wall, stands, dugouts, hoops, the fence, trees, tables, small sprites; near =
  chain-link, nets, the scoreboard (live score), light towers lit for an evening fixture, the
  pitch and the odd hit, the ball dribbled and shot, everyone posed at their anchor: pitcher,
  catcher and umpire crouched, batter, seven fielders, on deck, dugouts, both stands; two 2-on-2
  games with who has next, the referee, the bench; strollers round the fountain, picnickers,
  readers, a pigeon feeder, the groundskeeper. Anchors fill in order (the battery first).
  The lots' labels carry the score; tapping one opens the cutaway with the fixture line.
- Side-on rooms (cutaway, district and building views): `ballfield`, `courts`, `picnic` plans
  in `props.js` with their decor (wall, scoreboard, lights; chain-link and a hoop; treeline and
  fountain) and new acts in `poses.js` (pitch, bat, ready, catch, umpire, shoot, dribble,
  defend, whistle, feed).
- `check-cityview` checks the lots (in the Arena, overlapping no building, clear of the
  viaduct at all four turns), the anchors (typed, posed, on their own ground, apart, at least
  capacity, a staff post), the ordered fill, and the fixtures (sane scores, runs never come off
  the board, 22 PA calls a week).

- **A corner ballpark (2026-09-29).** Scott: "arranged in the corner so that you can have
  seating behind the wall also. The first-base foul line should be against the basketball
  court fence and the park." Home plate sits in the lot's south-west corner (3 cells in, 2.4
  up); the first-base line runs east along the south edge (THE COURTS' fence, then the
  RECREATION GROUND), the third-base line north up the west edge, centre field towards the
  far (north-east) corner. The wall is an arc (8.75 cells, the left-field pole just inside the
  north edge). Beyond it, three tiers of outfield bleachers curve round from the north edge to
  just past the right-field pole; the scoreboard stands above and behind them facing the
  plate (its back is steel, see-through only when it stands between the viewer and the
  field). A three-tier grandstand wraps behind the plate along both lines and round the
  corner, the backstop mesh along its front, the dugouts in front of it; light towers at the
  four corners. Everything is drawn in segments (one tier, about a cell, one seat each) so the
  painter's order holds at every turn. Capacity 24 -> 30; after the battery and the field, a
  bench player, a fan behind the plate and a fan beyond the wall fill in turn. At far zoom the
  stands show as footprints. `check-cityview` asserts home at a corner, the first-base line
  along the Courts/park edge, the third-base line along the west edge, 20+ outfield seats all
  beyond the wall, the scoreboard behind them, and a full house reaching both.
  Screens: docs/screens/rec-ground/corner-*.png.

Measured (headless Chromium, 250 subjects, league night): frame gap 16.6 ms avg, p95 17.5 at
1440 street zoom on the Diamond; draw() 1.6 ms. Screens: docs/screens/rec-ground/.

## The Bowl's gridiron and the estate pitch (2026-09-29)

Scott: "We need a soccer field, though, too, and a football field." The Arena was full, so:

- **Football inside the Bowl.** The Bowl was a stadium with no sport and a plain block for a
  body; it is now drawn open to the sky: concrete stands on all four sides (three tiers
  stepping up and away, in segments so the painter's order holds along them), a 120-yard
  field with end zones in each side's colour (THE ENFORCERS gold, THE ASSETS purple), a line
  every ten yards, goalposts on the end lines, a bench on each sideline, the chain crew, a
  kicker at his net, the cheer squad, corner light masts and a scoreboard over the north stand.
  It stays a solid building for walking (nobody cuts across a stadium) and keeps its two
  floors; its place (`stadium`, cap 50) and jobs are unchanged, plus a Gridiron Official
  (`draft: 8`), and the Turf Technician is now capped (`draft: 10`) so the Bowl is not staffed
  like a factory.
- **Soccer on the estate pitch.** The Sprawl's grid had two empty cells; the Sprawl now runs 7
  rows further south (`h: 20`) and is laid out by hand: the hab blocks exactly where the grid
  had them, the Street and the Plaza as two long strips under A and B, THE ESTATE PITCH under C
  and D (`pitch`, cap 28, an open lot). A bottom-row district's station sits over its centre
  column, so the Sprawl's stop, the ring and the timetable did not move. Full markings
  (halfway line, centre circle, boxes, spots and D's, corner arcs), goals with nets, corner
  flags, two dugouts, a rail and a standing crowd, a three-tier terrace behind the east goal,
  the scoreboard behind the west, floodlights. Seven a side: SPRAWL UNITED (red) and
  RECLAMATION ATHLETIC (blue), keepers in their own colours; a referee and two assistants.
  Jobs: Club Footballer (soccer players train there by day), Match Referee (`draft: 8`), Pitch
  Groundskeeper (`draft: 6`).
- Who goes: two new fields, `soccer` (footballer, not "american football") and `gridiron`
  (american football, quarterback...), send soccer players to the pitch (5) and American
  football players to the Bowl (5); sport and coaching like both; the middle and low bands
  like the pitch (it is on their estate). Overflow family: gym, stadium, diamond, courts,
  pitch. `parkGeo.fieldRole`: a footballer or athlete on shift at their ground plays (a
  visitor's role, first), sporting visitors are placed before the rest (`pri`, honoured by
  `assignAnchors`), so the field fills with the people who would be on it. The Bowl's fill
  order is sixteen players, the long sides' front rows, the rest of the teams, then the crowd.
- Fixtures (sim `GAMES`, weekday as the sim counts it): THE SUNDAY GAME at the Bowl, day 7,
  16:30-20:00 (four quarters, twenty drives hashed from the day, a half-time break, down and
  distance on the board); THURSDAY PRACTICE, day 4, 18:00-20:30 (no score, "EFFORT: GRADED");
  SATURDAY MATCHDAY at the pitch, day 6, 17:30-19:30 (ninety minutes, a goal possible in each
  five-minute slot, half time); THE MIDWEEK FIXTURE, day 3, 19:00-21:00. Fixtures sit where
  visits start (after the day shift), or the stands stay empty. `gameAt` now gives every game a
  `label` ("Q3 14-10", "63' 1-0", "HALF 7-17", "PRACTICE") for the lot labels, and
  `gameEvents` calls every touchdown, field goal and goal as well as kickoff and final. The PA
  reads a ground's calls on the map and in its own district (`City.jsx GAME_DISTRICTS`).
- Iso view (`parkGeo.js` BOWL/PITCH and anchors, `parkDraw.js` bowl/pitchLot): far = the
  stands, the green, the end zones, the pitch; mid = lines, posts, goals, benches, dugouts, the
  crowd as small sprites, a colour disc under each player for their side, the broadcast lines
  (scrimmage blue, first down yellow) while a game is on; near = yard numbers, hash marks,
  pylons, the midfield seal, nets, waving corner flags, scoreboards with the live score, the
  ball snapped, thrown and caught on one play clock (`poses.PLAY_S`), the soccer ball passed
  about with the odd shot, everyone posed. The mast on the corner nearest the viewer is left
  out, and a scoreboard seen from behind goes see-through (the Diamond's too).
- Poses (`poses.js`): snap and stance (the crouch; they come up and block at the snap), throw,
  receive, carry, wrap (arms out, never a hit), kick (off a tee), signal (arms up: it counts),
  chain (the rod and marker); footwork (the ball at the feet), kickball, header, keeper (gloves,
  and a full-length dive now and then), mark, chase, flag (OFFSIDE, logged).
- Side-on rooms: `gridiron` (the line of scrimmage in facing pairs up the field, the
  quarterback and the snap; the official, the chain, the kicker and the bench in front) and
  `soccer` (a keeper in the goalmouth, the game up the pitch, hab blocks over the far touchline;
  the referee, the corner flag, the dugout and the rail in front).
- `check-cityview`: the new lots (in their districts, overlapping nothing, clear of the viaduct
  at all four turns), anchors (typed, posed, on their own ground, apart), 22 and 14 players
  inside the lines in two even sides, the first few make a drill, the referee takes the
  referee's post, the sporting are placed first, the footballer's job and role, soccer vs
  gridiron reading; fixtures (quarters, downs, minutes, labels, no score coming off the board,
  practice keeps none), and the PA calls exactly the changes on the board.
- Dev: `#city?at=18:10&wd=7` jumps to that hour on the next machine day with that weekday.

Measured (headless Chromium, 250 subjects, the Sunday game): frame gap 16.7 ms avg, p95
17.3-18.2 at 1440 and 390 (street zoom on the Bowl and the pitch, district, fit); draw() 1.2 ms
on the Bowl up close, 1.7 ms district, 1.8 ms fit at 1440. Screens: docs/screens/fields/.

## Architecture per building (the building design pass, 2026-09-29)

Scott: "Are we going to start to have different buildings that look differently, like big
low-income housing projects versus high-income high-rises for the wealthier residents?" Every
building was the same lit box in its district's colour. Now each has a style, and the style
is drawn procedurally (no image assets).

- **Data.** `sim.js` `ARCH` gives every building an `arch` (district default in
  `ARCH_BY_DISTRICT`); `BUILDINGS[].arch` carries it. Housing styles carry the tiers that live
  there (`HOUSING_TIERS`): the top tier in `glass`, tiers 1-2 in `brownstone` and `lofts`,
  tiers 3-5 in `projects`. `homeOf` follows it: ESSENTIAL INFRASTRUCTURE in the Meridian,
  RETAINED and TOLERATED in Hab C, Hab D or the Archive Lofts, the rest in Hab A or Hab B,
  living and dead alike.
- **The Meridian.** The top tier's homes (`penthouses`) moved out of HQ into THE MERIDIAN, a
  six-floor glass tower in Finance (cap 72; the `suite` plan now has a bed at every place).
  HQ's executive floor keeps the Executive Suite. Finance is gridded into two lots: the
  Reserve Tower (north) and the Meridian (south).
- **Massing** (`archGeo.js`, pure): per style, the body's parts (boxes with a roof shape:
  flat, gable, pyramid, barrel, sawtooth; cylinders; the cooling tower), yard props (trees,
  the hoop, chain-link panels, planters, the doorman, the ambulance under its canopy, stalls,
  the conveyor, containers under the gantry, the watchtower, cameras, bollards) and flat
  ground (the court slab, the quad, the monolith's plaza, the ambulance bay). `rise` is how
  tall it reads (a tower's floor is several storeys of glass; HQ's monolith is 11.5).
  `isoItems(r)` gives the view's boxes: each body, and each yard prop as its own box, so a
  walker between the tower and the fence is painted between them.
- **Drawing** (`archDraw.js`): the styles. Projects: brick slab, eight storeys, balcony stacks
  every third bay with see-through railings, laundry on the lines, AC units, broken and
  boarded panes, graffiti, the court behind chain-link with two hoops, a water tank.
  Brownstones: a row of five, brownstone (stoop with railings, bay window, cornice, lintels)
  alternating with red-brick walk-ups (fire escape up the front), trees on the pavement,
  chimneys. Lofts: arched windows, fire escapes, the water tower on its legs, a painted sign,
  a courtyard. Glass: curtain wall with a sky gradient and a reflection by day, lit flats at
  night, setbacks with planted terraces, the pool on the podium with loungers and umbrellas,
  the canopy, THE MERIDIAN on it, the doorman, a fountain plaza. Office: ribbon windows lit
  by who is at a desk (dark at night), the exchange's colonnade, the ticker scrolling the
  Overlord's tape (HVI up, DISSENT down, HOPE SUSPENDED), the rooftop lounge. Monolith: black
  slab, faint green seams, one eye band whose pupil sweeps the plaza, a searchlight at night,
  cameras on poles, bollards, lit strips converging on it. Gothic: pointed windows,
  buttresses, ivy, slate gables, turrets; the lab's fume stacks; the clock tower tells the
  machine time on every face, with its belfry and spire over a quad. The Strip: the Dive's
  neon (it flickers) and blade sign, the casino's gold pilasters, chasing neon, the marquee
  with its bulbs and the rooftop HOUSE EDGE sign, the diner's chrome band, lit 24 hours, under
  the newsroom. Arts: the gallery's banners and glass atrium, the playhouse's marquee and fly
  tower, the Grind's striped awning and tables, the sound stages (sawtooth, roller door, ON AIR
  in working hours). Commons: Ward 7 (white, window bands, red crosses lit at night, helipad,
  the ambulance bay, lights flashing after dark), the chapel (steeple, rose window glowing),
  the market (striped awnings, stalls, the NIGHT MARKET's lanterns), the schoolhouse (cupola,
  flag, hopscotch). The Works: sawtooth sheds with roller doors and a dock, the conveyor to
  its hopper, the reactor (dome, cooling tower, steam, a cold glow at night), the foundry
  (glowing doors, banded stacks, smoke), the cache farm (vents, blinking LEDs, turning fans),
  the docks (containers, the gantry and its trolley), hydroponics (greenhouse, magenta at
  night, tanks), the barracks (slits, antenna, floodlight), the prison (barred slits, razor
  wire, the watchtower's searchlight), the canteen (steamed windows, chimney).
- **Light.** Windows light by occupancy (as before), so flats light up at night and offices go
  dark; by day a window is glass. Neon and bulbs run after dusk and are ghosted by day. Walls
  darken at night.
- **LOD.** Far: silhouettes, roof shapes, one colour per type, and each type's signature
  (the eye, the casino's stripes, the cross, the ticker, the projects' balcony stacks), a warm
  wash where lit at night. Mid: windows, balconies, fire escapes, signs, smoke. Near: laundry,
  AC units, railings, bulbs, the clock's hands, fans, the doorman, and whoever is walking in or
  out drawn at the front door (sprites to scale, tappable).
- **Painter's order.** Parts back to front inside a body (`partOrder`: stacked parts bottom
  first), each part's walls, then what is on them, then its roof. Bodies and yard props sort
  with the Loop's pieces in `depthOrder`; movers slot as before.
- `check-cityview`: every building has a style with a massing and a drawer; every yard prop
  kind has a drawer; bodies and props stay off the pavement (0.4 in from the lot edge), props
  off the body and each other; no body, prop or piece of the Loop overlaps another at any
  quarter turn; stacked parts paint bottom first; housing follows the tier of its residents
  (every tier of each band lives there); every home is in a housing style.

Measured (headless Chromium, 420 subjects, 08:20; draw() is one full frame of drawing): 1440
fit draw 4.8 ms avg / 9.4 p95 (was 2.9 / 5.9), district 2.6 / 2.9 (1.2 / 1.8), street 1.2 / 1.6
(0.5 / 0.6); 390 fit 1.2 / 1.7, district 1.1 / 1.7, street 1.6 / 2.1. Frame gap 16.7-17.4 ms
p95 everywhere; five seconds at 1440 fit: 300 frames, none over 20 ms. Screens:
docs/screens/buildings/ (compare-*.png: before and after side by side; after-*.png: the rest).
