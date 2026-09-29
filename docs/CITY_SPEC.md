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
