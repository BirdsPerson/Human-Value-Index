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
- Passive: no action controls. Tap/click to inspect; optional "follow" a subject. One exception since
  2026-09-30: DRIVE YOURSELF (below), your own citizen, in your own browser only.
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

## Animation rig (2026-09-30)

Scott: "add some generic animations that everybody could use, the sprites." Every subject's
own sprite, cut into body parts once when it loads and moved by one shared set of keyframed
animations. No image is generated and nobody is redrawn: the face, the outfit and the prop
stay theirs. Code: `src/city/rig.js` (the cut, the animations, drawing),
`src/city/rigReact.js` (acts, reactions, the crowd), a two-line hook in `poses.drawPose`.

**The cut** (`splitParts`, frame 0 of the 32x48 sheet, style C proportions): the head is the
run of pixels round the head's centre above the neck (the narrowest row 8 to 14 rows under
the head top); anything beside it at that height (a bat on the shoulder, a raised hand) stays
with the head and marks that arm *posed*. The arms are what lies outside the torso core
(the shoulder row less an arm each side, nudged to the outline seam between arm and body)
from the shoulders down to where that side stops carrying colour: hands at the hip, or arms
folded over the chest. Each arm is an upper and a fore segment, split halfway. A thin prop
running below the hand clear of the legs (a staff, a crook) goes with the hand. The legs are
everything from the hip (27 rows, poses.js HIP) down, split left and right at the gap
between the feet; a dress, a robe or a chair (lower body as wide as the torso) is one skirt
that moves only as a whole. The torso is the rest. Every opaque pixel is in exactly one part.

**The moves**: an animation is 4 to 8 held keyframes (never tweened) of whole-pixel offsets
(body, torso, head) and arm and leg angles (0 = as drawn, positive = outward; a forearm
relative to its upper arm). Rotations are cut once per (part, 15-degree step) with
nearest-neighbour sampling and cached per sprite: a frame is a few `drawImage` calls, no
pixel work. A swung limb gets a 1 px outline where it met the body, and the body gets one
where the limb was. The head is drawn over raised arms (a cheer never hides the face) and
under them only for the hands-to-the-front moves. The torso and head never move up off what
they sit on (a gap); the whole body does. A swung foot is lifted back to the ground. An arm
with a big prop (a guitar, a rocket, a robe's sleeve) is *heavy* and swings at most 40
degrees; a *posed* arm (drawn raised) does not move; a one-handed move (wave, point, phone)
goes to the free hand when the leading one is busy.

**The animations** (`ANIMS`): `idle`, `wave`, `clap`, `cheer`, `point`, `talk`, `dance`,
`dance2`, `run`, `jump`, `shrug`, `sittalk` (seated), `facepalm`, `stumble` (a trip and a
recovery, nobody falls), `swim` (for the Coast: under water from the waist, a crawl),
`ski` and `snowboard` (the Heights), `golf` (address, backswing, through, follow-through),
`deal` and `chips` (the casino), `arcade` (hands on the controls), `type`, `sweep`, `carry`
(a box), `phone`. Props the move needs (cards, chips, a box, a broom, a club, poles and skis,
a board, a phone, the waterline) are drawn by the rig, a few pixels each.

**API** (browser):
- `drawRig(ctx, sheet, anim, t, x, y, scale, facing, {ph, seat, seatY})`: one subject doing
  one animation; `x, y` the feet, `scale` canvas px per sprite px, `facing` 1 turned right.
  Returns the box drawn, or null when the sheet cannot be rigged yet (draw it as before).
- `poses.drawPose` asks `rigPose` first: an animation is drawn when the subject has a
  reaction under way, the anchor names one (`{..., anim: "wave"}`), or the act is one
  (`RIG_ACTS`: `dance`, `dance2`, `wave`, `clap`/`applaud`, `point`, `shrug`, `facepalm`,
  `stumble`, `swim`, `ski`, `snowboard`, `golf`, `deal`, `chips`, `arcade`, `phone`, `carry`,
  `sittalk`, `hooray` (cheer)). Seated anchors sit (the shins below the seat, as poses.js).
  Everything else is poses.js as before; walkers and bunks are never rigged.
- `react(sheet, anim, t, secs, turn)`: start an animation on a subject for a few seconds
  (`turn`: face the other way). `reactionOf(sheet, t)`.
- `greet(scope, [{s, sheet}], t)`: everyone together in one place this frame; a pair of
  friends (the social ledger's published friends) who were not together a moment ago wave,
  a beat apart; rivals: one shrugs, the other turns away.
- `scoreCheer(place, game, t)`: true for 4 s after a fixture's score goes up (never on first
  sight). `assemblyCrowd(view, act, t, ph)`: the Assembly benches' animation now.

**Where it runs** (first set): the Assembly's benches applaud a result for two days after the
polls close, in waves, the `cheer` seats on their feet, and clap each vote as the tally rises
(civicDraw.js); the stands at the Diamond, the Courts, the Bowl and the pitch cheer and clap
for 4 s when the score changes (parkDraw.js); friends who meet in a room wave, rivals shrug
and turn away (RoomStage.jsx, the iso cutaways in CityIso.jsx); at the Dive (and the Lantern)
from 23:00 to 03:00 every other stool is up dancing, two styles (props.actAt); casino dealers
deal (act `deal`); the course's golfers swing (act `golf`). The arcade, the Coast and the
Heights use `arcade`, `swim`, `ski`, `snowboard` by naming the act or `anim` on an anchor.

**Timing**: the caller's clock (performance.now seconds) plus the subject's phase
(`poses.phaseOf`), so a crowd never moves in lockstep; `t = 0` (reduced motion) holds each
animation's key pose and no reaction fires.

**The lab**: `?rig=1` shows six figures doing every animation, both facings (`&t=1.3`
freezes the clock, `&frames=1` lays out every frame, `&parts=1` colours the cut, `&figs=a,b`
picks the sprites). Screens: `docs/screens/rig/`.

**Checks** (`scripts/check-rig.mjs`): the cut covers every opaque pixel exactly once for all
repo sprites, 14 referral sprites (`scripts/fixtures/rig-referrals/`), the local referral
cache when the machine has one, and 24 procedural stand-ins and citizens; every frame of
every animation stays inside the sprite's own box plus 22 px each side, 22 px above and 2 px
below; fewer than 4% of frames show a piece the standing sprite does not (a detached limb);
cutting and drawing are deterministic; the wiring above behaves.

**Limitations**: the cut is a heuristic over hand-varied art. Arms drawn folded over the
chest move from the elbow out while what they hold stays on the chest; a sprite drawn with
both arms raised keeps them there; robes, capes and big props swing only a little; a skirt
never splits into legs. No back view yet.

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

## Plans: the day built once, server side (scaling step 3, 2026-09-29)

Every browser used to build each machine day itself: the capacity allocation over the whole
roster (`allocFor`, whole-roster coupling) and every subject's street routes (81% of the cold
build). Now the day is built once and published; every reader loads the same file.

- **Format** (`sim.js` `buildPlan` / `setPlan`, `PLAN_FORMAT` 1): per subject, `schedule()`'s
  segments for the day, compact: home place, then each segment's end time, place, activity
  (work / leisure / commute / home), haunt, the clipped span, and for a Loop trip the train,
  car and boarding time. Times are the sim's own floats (JSON round-trips them exactly), so
  `whereAt` from a plan is identical to `whereAt` from the sim. Routes are not in the plan:
  a commuter's street path is laid out from their personal spot when first drawn (only the
  few people in transit pay it, not the whole roster). The plan names the roster version
  and the social snapshot versions (day and day - 1) it was built with.
- **Builder** (`netlify/lib/plans.js`): `plan-build.js` (scheduled every 10 real minutes)
  wakes `plan-build-background.js` (15 min, lease like the social tick), which builds every
  missing day in [today - 1, today + 3], oldest first, from the strict census and the
  published snapshots. A day more than one ahead waits for its snapshot; today and tomorrow
  never wait. Each day: blob `f1/day/<day>/<ver>` (write-once) first, then the manifest
  `f1/manifest` with an etag condition (written last: a listed day is always complete, and a
  listed day never changes). Days older than today - 2 retire from the manifest and Blobs.
- **Readers**: `/api/plan` (manifest, 30 s) and `/api/plan/<day>/<ver>` (immutable, a year).
  The browser (`planClient.js`) loads today's plan before the first census (tomorrow's in
  the last machine hours of today) and falls back to the local sim when there is none. The
  quest check (`quest.js`) loads the plans for every day its 90 s look-back touches
  (`questDays`), the social tick the plans for the days it advances (`state.plans` records
  which plan placed each day). A subject the plan does not hold (indexed after it was
  built) is placed by the sim without the capacity allocation, the same for every viewer.
  Since step 6 the quest check and the tick read format 2 first (see "Relations"); format 1
  is their fallback for a day not yet split.
- **Checks** (`scripts/check-plans.mjs`): plan whereAt == sim whereAt for every subject
  every 15 machine minutes over 2 days (production-shaped 430 and synthetic 1,500 with
  friend snapshots); quest judgement server (figures on file + plans) == browser (census +
  plans) including across midnight; the ledger advanced over plans == advanced by the sim;
  the builder's cadence never skips a day at 10- or 60-minute runs.
- **Where it runs, measured** (`scripts/bench-plans.mjs`, Mac M5 Pro; Netlify Lambda runs
  this code ~9x slower, measured on the social tick): cold day / each further day / 4-day
  backfill: 432 (live) 0.34 / 0.11 / 0.66 s (Lambda ~3 / 1 / 6 s), 5k 3.6 / 1.2 / 7.3 s
  (~33 / 11 / 66 s, 189 MB), 20k 15 / 5.4 / 31 s (~135 / 49 / 281 s, 520 MB). A run is
  bounded at 12 minutes and publishes day by day, so it fits Background Functions to ~20k
  (the roster engine's 48 a week reaches 5k in ~2 years); past ~40k the heap outgrows
  1 GB, which the sector split (step 4) removes.
- **Payload** (one file per day): 432 → 109 KB raw / 47 KB gzip; 5k → 1.25 MB / 0.5 MB;
  20k → 5 MB / 2 MB (the 6 MB function response limit is near: step 4 splits by sector).
- **Known seam**: a day's overnight tail is recomputed when the next day is built; if the
  roster changed between the two builds, someone out past midnight may jump at 00:00
  (before, a roster change could move anyone at any moment).

## Sectors: a browser downloads what it looks at (scaling step 4, 2026-09-29)

Before, every visit to #city fetched the whole census (`/api/pen`) and the whole day's plan,
so a visit grew with the roster (and `/api/pen` passes Netlify's 6 MB response limit near
9,400). Now the published day is also split for browsers, and the city holds only what it
shows.

- **Format 2** (`src/city/planSplit.js`, written by `netlify/lib/plans.js` after each day's
  format-1 plan, under the same version; a day already planned is split from its f1 blob):
  - `w/<sector>/<w>/<p>`: a SECTOR is a district, a WINDOW 6 machine hours. The file lists
    everyone with a segment in that district during those hours, each with its display record
    (the census record less breakdown, stratum and place tendencies, plus `cj`: the job the
    sim assigned) and its window row: every segment overlapping the window, wherever it is
    (`[homeIdx, from0, ...format-1 entries]`, `sim.js splitRow`). A window of more than
    `PART_MAX` (3,000) subjects is spread over parts by a hash of the key.
  - `summary`: every 30 machine minutes, the census the city takes, counted the way it counts
    (per district, building (simApi.roomIn), place, at work / at home, walkers per district,
    on each platform and waiting, riders per car and on the Loop), the roster's family mix,
    the parts per window, and the whole-day rows of the figures on file (quests, the Loop panel).
  - `find`: key, display name, the sector each subject is in per window (`/api/find`).
  - `f2/manifest` written last, per day `{ver, n, files: {sector: [[n, bytes, parts] x4]}}`.
    `/api/plan` lists the split days as `sectors: {day: ver}`; `/api/plan/<day>/<ver>/summary`
    and `/api/plan/<day>/<ver>/<sector>/<w>/<p>` are immutable.
- **Browser** (`src/city/planClient.js`): the manifest and today's summary (the next day's in
  the last 45 machine minutes). A view names the districts it shows up close
  (`wantSectors`): CITY when zoomed past 1.6x the fit (and people ~25 px tall), the open
  cutaway's district, a followed subject's; MAP once faces show; STACK the opened building's;
  STREET within 45 cells; a district or building page its own. Each loads the current window
  (the next one 45 machine minutes before it starts) into the sim (`addPlanRows`: whereAt is
  the whole plan's, to the float). The census (City.jsx) reads everyone held where the plan
  covers them (`covers`), and fills every district not loaded with the summary's crowd
  (`src/city/crowd.js`): anonymous stand-ins shaped like whereAt answers (sim.js `standIn*`),
  as many as the summary counts less whoever is held there, capped at 1.25x a place's
  capacity, wearing the likenesses of the figures on file. They are drawn like anyone at that
  size and never open, list or count; the header and the directory print the summary's counts
  for districts not loaded, their own for loaded ones. FIND asks `/api/find` (the same
  ranking, server side); a pick, a `?find=` link, FIND ME and a follow are pinned: their rows
  come from `/api/find?slug=&day=&w=` one window ahead. The Loop panel names the riders held
  and counts the rest.
- **Fallback** ("legacy"): a day with no split (builder behind, office down) runs as before:
  the whole census from `/api/pen` page by page, the f1 plan when there is one, else the sim.
  `plan-health.mjs` also alarms when tomorrow is planned but not split.
- **Lists**: `/api/pen` is paged (`limit` up to 2000, `cursor` = last slug, `fields=list|cube`,
  `kind=figure`); the pen (`fields=list`), the cube (`fields=cube&kind=figure`) and the
  analytics (`kind=figure`) walk the pages (`src/penClient.js`).
- **Checks** (`check-plans` section 7): every window loaded reassembles to the whole day
  (whereAt equal every 15 machine minutes); one window alone places everyone in it for its
  hours; each segment is in every sector it touches and nobody is listed where they never are;
  the summary equals the plan's occupancy at every sample; the crowd is the summary less what
  is held (zero when everyone is held or every district is loaded); the find index points at a
  file holding the subject; parts partition a window; /api/plan and /api/find serve them.

## Sector sheets: a browser downloads the faces it draws (scaling step 5, 2026-09-30)

Before, the production atlas was a few 256-face sheets filled in slug order, and one
atlas.json naming every face. A zoom drew a few hundred faces scattered over every sheet, so
it fetched them all: at 20k (synthetic, `scripts/bench-sectors.mjs`) 81 image requests,
11.8 MB, for one district.

- **Sheets by sector** (`scripts/prod-atlas.mjs`): a face is packed with the others of its
  SECTOR, the subject's work district (`sim.js assignJob` on the census record: the same
  answer the plan builder gives, the `cj` a window carries, so the browser knows it without
  a lookup). Within a sector, a sheet holds a workplace together where it can (a room's
  cutaway draws from one or two sheets). Sheets are 8 x 8 faces (512x384, ~40 KB). A face
  stays in its sheet while its ?v= and its sector hold; a new one joins the sheet of its
  sector with room holding most of its workplace. So a referral re-encodes one sheet and one
  map; a redraw or a change of job moves one face. A sprite that will not decode is
  remembered (`skipped`) and left out until redrawn.
- **Maps**: `/api/atlas.json` is an index `{v, at, count, maps: {sector: hash}}` (60 s);
  `/api/atlas/<hash>.json` is one sector's map `{sector, sheets: [[hash, bytes]], sprites:
  {slug: [v, i, x, y, w, h, frames]}}` and `/api/atlas/<hash>.png` a sheet, both immutable.
  A map indexes its own sheets, so it changes only with its sector. The packer keeps its
  full record (`current`: sheets, sprites, skipped, sig) and the previous pack's sheets and
  maps (a page loaded a minute ago still asks for them).
- **Which predicts where a face is seen** (measured at 18:15, the faces the bench zoom
  draws, over the sectors that zoom loads): work district 23-29% of the faces drawn in the
  Arts zoom (4 sectors loaded), 73% after the Sprawl zoom (8 loaded), at 432, 5k and 20k
  alike. Home is useless (four in five live in the Sprawl: 0% in the Arts); the district
  a subject is usually in over a week (not stable anyway) does no better (25% / 76%). The
  city moves: evenings are leisure, spread over every district.
- **Rent, then buy** (`src/sprites.js loadSprite`): a zoom draws 1-6% of the faces of the
  sectors it loads, so a sheet is almost never worth its bytes: every sheet a view touches
  cost ~20x the faces it used. So a face costs its own URL (`/api/sprite/<slug>?v=`, ~1.2 KB,
  edge-cached and immutable) until its sheet has been asked for as many faces as it weighs
  (`buyNow`: faces x 1.5 KB >= sheet bytes, ~26 faces), then the sheet is fetched and the
  rest are cut from it (a room full of one workplace, a long stay, a small roster). Only
  sectors in view count toward a sheet (`spriteBank.sectorFor`: `sectorsWanted`, every
  district in legacy mode); a visitor from elsewhere is always its own URL, and no map is
  fetched for them. The pen (every face at once) calls `loadSprite(src)`: every map, each
  sheet on first need. A file photo is one face: its own URL.
- **Measured** (`bench-sectors.mjs`, desktop 1440x900, cache off, 18:15; image bytes =
  atlas index + maps + sheets + own URLs; the fit view's 42 KB is the repo atlas the stand-ins
  wear, unchanged):

  | roster | fit | Arts zoom (before -> after) | + Sprawl zoom (before -> after) |
  |---|---|---|---|
  | 432 (live) | 42 KB | 348 KB, 6 req -> 59 KB, 18 req | 348 KB, 6 req -> 152 KB, 91 req |
  | 5k | 42 KB | 2.8 MB, 22 req -> 130 KB, 66 req | 3.0 MB, 23 req -> 530 KB, 339 req |
  | 20k | 42 KB | 11.8 MB, 81 req -> 520 KB, 353 req | 11.8 MB, 81 req -> 1.5 MB, 1,050 req |

  Bytes now scale with the faces drawn (~1.4 KB each), not the roster; requests do too (one
  per face, HTTP/2, each cached forever by the browser and the edge).
- **Far view**: the dots are coloured by family again (`FAMILY_COLOR[familyOf(s).family]`:
  the views indexed it with the object, so every far dot was the fallback green).
- **Checks** (`scripts/check-atlas.mjs`): every packed sprite in exactly one map and one
  sheet of its own sector (unit roster and 900 clones of the figures on file), none over
  the cap; the same census packs the same sheets and maps (nothing re-encoded or fetched);
  a new face re-encodes one sheet and changes one map; a redraw, a takedown, a new job move
  only that face; an old roster-wide atlas is repacked once; the lookup falls back to the
  own URL (redrawn, left out, another sector's map, a missing sheet, no map); `buyNow`.

## Relations: bounded per subject, stored in buckets (scaling step 6, 2026-09-30)

Before, the ledger kept at most 6,000 pairs city-wide (`MAX_PAIRS`) in one blob, and every
room drew its meetings from everyone in it. Both diluted friendship as the roster grew:
measured (synthetic, 30 machine days) 0.116 friends per subject at 430, 0.036 at 1,000,
~0 at 5,000 and 20,000. Production sat at the cap between day boundaries.

- **The bound** (`src/city/social.js`, `K` = 24): at each day boundary, after decay, every
  subject ranks its pairs by `|affinity| + 2 x this week's meetings` (`keepScore`: meetings
  count only if the pair last met within 7 machine days), ties by the latest meeting, then
  the key, and keeps its best 24. **A pair survives only if both sides keep it**, so nobody
  holds more than 24 after a boundary (between boundaries a subject can hold one machine
  day of new pairs over). Deterministic and chunk-invariant: it runs only at day
  boundaries, like the old cap. The ledger is at most 12 x N pairs.
- **Circles**: a roster of R is `floor(R / 400)` circles (`circlesFor`). At any place, any
  hour, a subject meets only their own circle there (`circleOf`: a jump consistent hash of
  place and subject, so growth by one circle moves 1/G of them, all into the new one). A
  city of 20,000 is socially 50 overlapping towns of 400, each regular meeting the same few
  hundred faces. Under 800 the city is one circle, drawn exactly as before (production).
  Without circles the bound alone does not hold density: a room of 400 drawn at random
  never repeats a pair, and a friendship needs ~20 meetings.
- **Two phases**. Presence: who is at which work or leisure place at each machine hour's
  half (whereAt's answer), from segments (`simPresence`) or per SECTOR from a day's window
  files (`sectorPresence`: a file emits only the hours spent at places in its own district,
  so each (hour, place) comes from exactly one file; census subjects no file lists are
  placed raw, as the plan would). Meetings: per (hour, place) from the people present and
  `rng(seed, hour, place[, circle])`, never from the ledger. Fold: each meeting reads and
  writes only its pair, with its own draws `rng(seed, hour, pair)`; the pair's latest event
  hour is on the record (`rec[5]`: "again" is news once in 72 machine hours without reading
  anyone else's log). Meetings fold per bucket in canonical (hour, place, pair) order.
  Only the day boundary (decay, the bound, the next snapshot, pairs read in key order)
  looks across buckets.
- **Buckets** (`bucketOf`: 64 by a hash of the pair key; each holds `{pairs, events}`, the
  latest 24 events of its pairs). Blobs (`netlify/lib/social-store.js`, store hvi-social):
  `rel/b/<tag>/<nn>` write-once (a checkpoint writes only the buckets whose JSON changed,
  under a new tag), then `rel/head` (`{v: 2, seed, hour, snapshots, rosters, plans, tick,
  buckets: [64 keys]}`) with an etag condition: the header is the commit. A run killed
  between its buckets and its header leaves orphans no header names; the next run reads the
  last committed ledger and sweeps them (at the end of every run, under the lease). A
  bucket the header names but Blobs cannot read stops the run before any write. Names are
  not stored (the census has them).
- **The tick** (`netlify/lib/social-tick.js`): a chunk is one 6-machine-hour window. It
  reads the window's sector files (`plans.js loadWindows`, every part of every sector),
  else the day's one-file plan (`loadPlans`), else the sim; `state.plans[day]` records the
  plan version (the same for both formats) or "sim"; the run reports `sources`. The
  background worker checkpoints at most every 20 s of work (`checkpointMs`) and always
  after its last chunk.
- **Public**: `public` is the city view `/api/social` serves (friends, rivals, gossip,
  counts, snapshots), unchanged in shape. Each subject's relations (12) and events (8) are
  in `pub/s/<nn>` (64 shards by slug hash); `/api/social/<slug>` and `/api/social?subject=`
  read the subject's shard (the card's ASSOCIATES fetch `/api/social/<slug>`).
- **Quests** (`plans.js loadOnFile`): the figures on file's whole-day rows from each split
  day's summary (every quest figure and partner is on file), the one-file plan only for a
  day not split.
- **Migration** (2026-09-30): with no header, the first run converted the one-blob `state`
  (`fromV1`: every record kept as it was, each event filed with its pair, each pair's
  latest event hour noted). Shipped in three steps: write both (the header and buckets,
  plus `state` rewritten each run and `bySubject` kept in `public`), switch the readers,
  stop writing the old. Rollback: `node scripts/social-rollback.mjs --write` writes the
  buckets back as `state` under the lease, then deploy the old code; to roll forward after
  the old code has run, delete `rel/head` and the next run migrates again.
- **Still reading format 1** (the one-file plan): the builder (the sector split is cut from
  it), `/api/plan/<day>/<ver>` and the browser's legacy fallback (`planClient.js`, a day
  with no split), and the tick's and quests' fallback for a day not split. Nothing reads it
  when the builder is current.
- **Measured** (`scripts/bench-social.mjs`, synthetic census, 30 machine days from empty,
  then a steady hourly run of 60 machine hours; Mac M5 Pro, Lambda ~9x; before = 2799413):

  | roster | friends per subject (before -> after) | figures on file | engine figures | steady tick over published plans (before: one-file plan -> after: sector windows), x9 |
  |---|---|---|---|---|
  | 430 | 0.116 -> 0.116 | 0.68 -> 0.68 | 0.023 -> 0.023 | 0.61 s -> 0.08 s (~5.5 s -> 0.7 s) |
  | 1,000 | 0.036 -> 0.076 | 0.39 -> 0.68 | 0.013 -> 0.038 | 1.8 s -> 0.25 s (~16 s -> 2.2 s) |
  | 5,000 | 0 (1 pair) -> 0.044 (110) | 0.03 -> 0.40 | 0 -> 0.040 | 6.1 s -> 0.95 s (~54 s -> 8.6 s) |
  | 20,000 | 0 -> 0.032 (320) | 0 -> 0.16 | 0 -> 0.032 | 24 s -> 5.0 s (~215 s -> 45 s) |

  Engine figures (the bulk of any roster) hold ~0.03 friends each at every size. The
  figures on file (62, full breakdowns, the city's friendliest) fall at 20,000 because 50
  circles scatter them: fewer of them share a circle. The average falls with the mix. The
  tick no longer calls whereAt per subject per hour (segments are read straight from the
  rows), so a steady run over published days is 5-8x faster; with no plan the sim itself
  dominates, unchanged (1.1 / 3 / 14 / ~50 s), as does the first run's 30-day fast-forward
  (10 s / 27 s / 2.6 min / 9.4 min). Ledger after 30 days: 4.6k / 10.7k / 53k / 213k pairs
  (at most 12 x N); at 20,000 ~13.6 MB over 64 buckets (~210 KB each); a subject shard 42 KB;
  `/api/social` 275 KB raw / 45 KB gzip, mostly the snapshots (every boosted subject).
  Production at the migration (machine hour 6121, 560 subjects): 6,005 pairs, 190 subjects
  over 24 (the busiest held 91); K = 24 prunes 2,472 at the first boundary, no friendship
  lost (141 before and after). After the 07:00 and 08:00 ticks: 5,190 then 6,280 pairs
  (mid-day), 143 then 140 friendships, 132 blobs (64 buckets, 64 shards, head, public,
  state, lease).
- **Checks** (`scripts/check-social.mjs`): nobody over K after a boundary (and the bound is
  what bit); a pair survives only if both keep it; this week's meetings rank, last week's
  do not; same state in one run or 5-hour chunks with the bound biting; circles evenly
  filled, one more circle moves only its share, meetings stay within a circle; **sharded
  == monolith**: a 712-subject census (12 files indexed after the plans), three machine
  days, three circles: presence from the sector windows (in parts) folded per bucket ==
  whereAt at every half hour folded in one pass == segments from the one-file plan, pair
  for pair and event for event; buckets folded in reverse order == in order; the store:
  migration keeps every record, one header per checkpoint, resume after every chunk ==
  one run, fewer checkpoints == same ledger, an unchanged ledger rewrites no bucket, a
  killed run and a run killed before its header both resume identically and the orphans
  are swept, a missing bucket writes nothing, lease, CAS on the header, create-only first
  write; `/api/social/<slug>` and `?subject=` serve the shard. `check-plans`: the tick
  records its sources; quest figures from the summary == from the one-file plan.

## THE ASSEMBLY and LOT 0x6F07 (2026-09-30)

The Commons is laid out by hand (the six buildings exactly where the grid had them) and runs
7 rows further south (h 13 -> 20), like the Sprawl; its station did not move. The new row:
THE ASSEMBLY (`forum`, leisure, cap 18: an open-air forum with the lectern) and LOT 0x6F07
(`dev-lot`, leisure, cap 24). Both are open ground drawn by `civicGeo.js` / `civicDraw.js`.
The lot's face follows the Assembly's recorded vote (`sim.setCivic`, `sim.lotPhase`):
vacant, approved, a construction site, then the golf course or the farm; it takes no
visitors until the site opens. Design, storage and the rules: docs/ASSEMBLY.md.

## The civic fold: mood, leagues, council seats (scaling step 7, 2026-09-30)

Per-district civic state, computed once per machine day by the plan builder and written into
that day's SUMMARY (`summary.civic`), so it scales with the sectors and every viewer reads
the same record. It is the substrate for councils, elections, leagues and the economy.
Code: `src/city/civic.js` (the fold, pure), `netlify/lib/plans.js` (`publishSplit`,
`yesterdayCivic`), `src/city/CivicPanel.jsx` (the city's reading), `src/city/simApi.js`
(`gameAt` / `gameEvents` name the league teams), `src/city/parkDraw.js` (the STANDINGS
board). Check: `scripts/check-civic.mjs`.

- **The block.** `{v: 1, day, league, districts: {<district>: {mood, team, seat}}}`.
  - `mood`: `{s, raw, was, f}`. `f` holds the factors, each an integer: `crowd` (room
    person-hours over capacity per capacity-hour, homes at half weight, saturating at -35),
    `tier` (the mean tier of the district's workers and residents, +-20), `housing` (their
    shares in the Meridian's glass tower against the projects, +-14), `commute` (a worker's
    machine hours in transit past the two a round trip costs, to -20), `league` (the team's
    last five: W +3, L -3; first +4, last -4), `assembly` (what LOT 0x6F07 became, from the
    day the ground breaks: a course pleases Finance and HQ and costs the Commons, the Sprawl
    and the Works; a farm the reverse; half during the build). `raw` = their sum (clamped
    -100..100); `was` = yesterday's raw; `s` = round(0.6 raw + 0.4 was). Words (Overlord):
    PLACATED >= 45, COMPLIANT >= 15, INDIFFERENT >= -14, RESTLESS >= -44, else SEETHING.
  - `team`: `{rating, roster: [[key, name, rating] x 9], pos, p, w, d, l, f, a, pts, form}`:
    the table entering the day.
  - `seat`: `{holder: null, term: null, approval (= mood s), status: "VACANT", acts}`, or once
    an election is decided and sworn in `{holder, name, term, cycle, by, approval, status: "HELD",
    acts}` ("Council elections" below).
    `acts`: the Assembly's result as the Council's first act, `["A001", closeDay, winner]`,
    in every district's record from the day the ground breaks.
  - `league`: `{season, day (1..28), days, stage, table (district order), today (the day's
    matches with results), recent (the last six), champion}`.
- **The chain.** The mood's smoothing window is two days, on purpose: yesterday's raw is read
  from yesterday's summary (this run's own block first); if that summary is missing (or was
  published before the fold existed) yesterday is folded again from its format-1 plan, which
  gives the same raw the chain would have read (`check-civic`: recompute == chain, and a
  re-split through the builder with yesterday's summary deleted gives the same block). No
  hidden state: a longer (exponential) memory would need every earlier day to recompute.
  The Assembly moves a mood only from `closeDay + LOT_BREAK`: the builder plans at most 3
  days ahead, so every day with an effect is folded after the result is on record.
- **Leagues.** One team per district, its workforce (`assignJob`): THE CURATED (Arts), THE
  TENURED (Campus), THE LEVERAGED (Finance), THE HOUSE EDGE (Strip), THE CONDITIONED
  (Arena), THE DEPARTMENT (HQ), THE INDEXED (Archive), THE TOLERATED (Commons), THE
  PROCESSED (Works), THE RETURNED (Sprawl). Nine players drafted on a season's first day:
  athletes on record (a sport field >= 5), then those who play at the grounds (>= 12% of
  their leisure weight at the Diamond, the Courts, the Bowl or the Pitch), then the rest;
  each by rating = 0.45 physical + 0.35 competence + 2 x sport field (0..99). The rosters
  ride the chain for the season (a mid-season arrival waits for the next draft; a broken
  chain re-drafts from the same census, which agrees). A season is 28 machine days on the
  existing GAMES timetable (14 scored fixtures a week; Thursday practice keeps no score):
  fixtures 0-44 a single round robin (the circle method, reshuffled each season), 45-46
  semi-finals (1st v 4th, 2nd v 3rd), 47 the final, then exhibitions under the old generic
  sides. A result is the scoreboard's own final (`sim.gameAt` at the whistle; the Courts
  count games won, each game's winner hashed), and the side that won it goes to the team
  better on the day (rating + 50 x a hashed luck), so the board, the PA and the table
  always agree. Win 3, draw 1; playoffs have no draws (the better team takes the
  Department's tiebreak). Standings = the sum of the results (checked), and `tableAt(block,
  h)` adds each match once its whistle has gone, so the page never shows a result early.
- **In the city.** A district page: a CIVIC RECORD panel (MOOD word + bar + cause + the
  factors, TEAM + standing + form + roster, COUNCIL: SEAT VACANT. ELECTIONS PENDING., acts)
  and MOOD in the header. The city page: mood words in the district directory, THE
  DEPARTMENTAL LEAGUE (table, today's fixtures, recent results) as a panel, and the page
  `#city/league`. The Diamond's scoreboard, the Bowl's and the Pitch's name the league
  teams; a STANDINGS board beside the Diamond's scoreboard shows the top four as the table
  stands that minute. The PA: kickoffs and finals name the teams and the stage ("FINAL AT
  THE DIAMOND: ... THE TABLE HAS BEEN UPDATED."), and every seventh line is from the civic
  record (inside a district its mood and standing; on the map the notable swings, >= 8 on
  yesterday's raw, and the top and bottom of the table). Legacy mode (no summary): generic
  sides, and the panels say the record is being counted.
- **Size** (measured, `check-civic`): the block is ~750-790 bytes per district, the same at
  430, 5,000 and 20,000 subjects (7.5 / 7.8 / 7.9 KB), against a live summary of ~50 KB.
  The fold costs 2 / 34 / 152 ms at 430 / 5k / 20k (one pass over the plan's rows).
- **The draft (from season 12, machine day 309; Scott 2026-09-30: "the league is bullshit,
  break it up and get a draft in there").** The teams keep their districts' names; every roster
  comes from one league-wide draft (`civic.js` `draftFrom` / `snakeDraft`). The pool: the city's
  best teams x 9 players, athletes on record first (a sport field >= 5), then the regulars at the
  grounds (>= 12% of leisure at the Diamond, the Courts, the Bowl or the Pitch), then the rest,
  each by rating then key. The order: last season's final table reversed, the champion last
  (`draftOrder`). A snake over 9 rounds, every team taking the best player left; no keepers. A
  player plays for whoever drafted them, wherever they work or live. THE COMMISSIONER'S CAP: while
  the strongest team's rating is more than 2 over the weakest's, the two swap their picks of the
  round that narrows the gap most (at most 4 trades, only if it narrows). Measured: the live census
  (725 subjects) had a spread of 40 under the workforce draft (the Arena 88: Kobe, Ali, Ohtani,
  Bruce Lee; the Archive 52); the snake alone leaves 65.0-66.2 (spread 1), so the cap stays idle
  there; on the synthetic 430 roster 45 -> 2; a pool with three 99s (the case the cap is for)
  4.2 -> 3.0 after 4 trades (`check-civic`). Seasons 1-11 keep the old workforce draft (no
  mid-season change). The block carries `league.draft` `{season, order, trades}`; rosters are in
  round order, so the board is derived. Draft day is the season's first day: the PA reads the
  first five picks and the last ("WITH THE FIRST PICK IN THE SEASON 12 DRAFT, THE CURATED SELECT
  ..."), and `#city/league` shows THE DRAFT BOARD (the order, round 1, rounds 2-9, the cap's
  trades). A broken chain recomputes the draft from the census: each season since the first draft
  is replayed from the one before (memoised; a snake over 90 players and 48 fixtures a season).

## Council elections (2026-09-30)

One council seat per district, filled by election. Code: `src/city/council.js` (the slate, the
Substrate's lean, the decision), `src/city/councilCalendar.js` (windows, terms, seats by day,
sittings), `netlify/lib/elections.js` + `netlify/functions/elections.js` (`/api/elections`),
`src/elections/` (`#elections`, menu item 8), `CivicPanel.jsx` (the seat on district pages),
`spriteBank.js` (the sash), `councilDraw.js` (the chamber). Checks: `scripts/check-civic.mjs`.

- **Candidates.** 2-3 per district, drawn when a cycle opens from the census and stored with it:
  figures who work there with a record in politics, activism or business (field >= 5), then those
  who live there, then anyone who works or lives there; ranked by 3 x that record + competence/2
  + network/2. Nobody stands twice. Never a private citizen, a local official added from public
  sources, or a real-world candidate. The incumbent stands again. Living and dead alike.
- **Speech.** Living candidates never speak: STATEMENT: NONE ON FILE, and a filing (Form C-1, the
  record, their job in the city, competence, network). A dead candidate may carry one line in
  their manner from `PLATFORMS`, marked as the Department's reconstruction, no quotation marks.
  Nothing on the page labels anyone living or dead (`check-no-death-labels`).
- **Voting: players decide, the Substrate advises.** Every assessed case file has one ballot per
  race (the Assembly's pattern: salted voter key, one blob per voter holding its races, CAS
  tallies per race idempotent per revision, 4 files per address, 2 per device, 60 ballot POSTs
  per address-hour, 10 revisions per race; a ballot can be withdrawn, and a file with no ballot
  left gets its place back). Every figure "votes" where it works for the candidate it is most
  compatible with (`social.js compat` + a tie on the record), or abstains below 0.05; shown as
  advisory. Most ballots win; a players' tie goes to the Substrate's lean; a race with zero
  player ballots adopts the Substrate's preference with "THE CITIZENRY ABSTAINED. THE
  SUBSTRATE'S PREFERENCE IS ADOPTED."
- **Write-ins (2026-09-30).** Scott: "so no write-ins for elections?" A ballot may name, instead
  of a listed candidate, any subject on file who lives or works in the district (homeOf /
  assignJob over the census, the slate's own reading), or the voter's own citizen (players may
  run). Never free text: the page's picker (`src/elections/WriteIn.jsx`) searches
  `GET /api/elections?writein=<district>&q=` (find.js ranking, accents off) and the POST sends
  the subject's key, which the server checks against the same pool (`writeinPool`, cached 10
  min per instance). Excluded, with one neutral refusal: every file `petition.js
  closedToOpinion` closes (harm finding made or pending, harm-gated, serious-cap, withheld
  verdict, the real-world candidate flag, owner-source local officials, noDangle), anyone on a
  slate, and every player citizen but your own (so only you can write yourself in). Still one
  ballot per race per file, changeable and withdrawable, same limits. A write-in with
  `WRITEIN_SHOW` (3) ballots joins the board as WRITE-IN with its tally; below that the race shows
  "N WRITE-IN BALLOTS". Living write-ins: STATEMENT NONE ON FILE; dead ones carry their
  `PLATFORMS` line if they have one. Winner: most player ballots over listed and write-ins; ties
  to the Substrate's lean (write-ins have none), then slate order; zero ballots adopts the
  Substrate's pick among the listed (it never writes in). A subject can win only one seat per
  cycle (the next in that race's ranking takes the other). The result keeps the whole ranking
  (`order`, never served): a player citizen elected (seat.holder = `citizen-<tag>`, shown as
  SUBJECT <TAG>, never the case number) can DECLINE or RESIGN from MY FILE
  (`src/elections/MySeat.jsx`, `c<NNN>/resign`), and the runner-up serves the rest of the term.
  Checks: check-civic section 3d.
- **Calendar.** The first request anchors it (`hvi-elections` `anchor`): cycle 1's polls are
  open 3 real days from then. A term is 15 seasons = 420 machine days = exactly 7 real days;
  cycle k opens 7 real days after cycle k-1 (so re-election opens 4 real days into a term and
  closes as it ends). Winners are seated 4 machine days after the close (the builder plans at
  most 3 ahead, so every seated day is folded after the result exists).
- **In the record.** The plan builder reads `seatRecord` (`io.elections`, strict like
  `io.civic`) and the fold writes `seat: {holder, name, term: [from, to], cycle, by, approval
  (= mood), status: "HELD"}`. Holders wear a red-and-gold sash in every view; THE ASSEMBLY's dais
  has the COUNCIL CHAMBER bench (ten seats, one lamp each), and on machine Tuesdays and Fridays
  10:00-13:00 the holders sit there by projection.
- **Fix on the way:** `planIo` used to drop its `civic` reader, so the builder never read the
  Assembly's result; it now passes `civic` and `elections` through.

- **Database: not yet.** Everything here is derived from published, immutable inputs (the
  plans, the census, the Assembly's recorded result) and needs no concurrent writes. The
  trigger (docs/ASSEMBLY.md, the consortium plan): the first sustained concurrent human
  writes. That is elections with player votes at scale (the Assembly's tally blob stops
  recounting past ~2,000 voters or ~5 ballots a second), or CYCLES balances (the economy:
  every wage and purchase is a write against a balance). Then ballots and balances become
  rows (unique (session, voter); balances with transactional updates), and the fold reads
  their aggregates the way it reads the Assembly's result now.

## STREET in the city's language (pass 1, 2026-09-30)

Scott: "if it's not too much trouble, maybe we could start polishing [the street view] a little
bit at a time to make it look like everything else at least." The STREET view was a green
wireframe (flat boxes, a window grid, a line for the Loop). Pass 1 makes it draw with the same
code as the CITY view, so a building looks the same from the street as from above.

- **One drawing kit, two cameras.** archDraw.js, parkDraw.js (and CityIso) draw through a kit
  G = {ctx, Q, poly, prism, wall, facing, z, r}. `src/city/streetArch.js` builds that kit for
  the street camera: Q(x, y, h) is the perspective projection (h storeys of STOREY cells, the
  iso view's own proportion), so `drawBody`, `drawYardProp`, `drawArchGround` and `drawParkLot`
  run unchanged. What the kit absorbs: `facing` asks the camera (outward side; a face wholly
  behind the near plane is hidden); `r` is picked per building (`quarterFor`) so archDraw's
  "nearer = larger u + v" painter's order inside a building holds; `z` is px per cell at the
  depth of the last point projected, so figures, trees and players drawn at their own point come
  out at their own size; `poly` drops an up-facing surface the eye is under (a roof seen from
  below is behind its walls) unless it is thin (a balcony slab, a canopy); Q clamps depth to the
  near plane.
- **Heights** follow the city: a storey is STOREY (2.1) cells, the Loop's deck DECK (1.5)
  storeys up (`streetKit.FLOOR_H`, `LOOP_H`); buildings stand at their massing's `rise`.
- **Scene** (Street.jsx render): a dark machine sky (a touch lighter by day), the district
  ground in the city's GROUND tints with pavements and the faint street grid, open lots in the
  city's LOT_FILL, the buildings' flat ground (courts, plazas, lawns); then, far to near by the
  nearest point of each footprint: bodies (archDraw, LOD by depth, lit by the census counted the
  city's way, `simApi.roomIn`; HQ keeps office hours), yard props, the grounds (parkDraw, with the
  people there posed at their anchors), the Loop (concrete deck and piers, the line's cyan on the
  fascia, the underside when overhead; stations with the yellow edge and a canopy lit while a
  train stands; steel cars with the cyan stripe, windows glass by day and warm by night with rider
  silhouettes, headlamps and tail lamps), people on the streets and platforms (sprites to scale
  with a shadow; riders are in the windows, the grounds' people are parkDraw's). Labels in the
  city's style (dark box, `#a7d7b5`; stations cyan-underlined), nearest first, none through a
  nearer building's walls.
- The auto-tour walks TOUR_SIDE (1.5) cells inside the viaduct, not under it.
- `check-street`: the heights are the city's; `quarterFor` faces every offset; facing (front,
  back, behind the camera); the top rule (roof above the eye hidden, low slab and thin slab
  shown, walls pass); z halves at twice the depth; every building is drawable.

Measured (headless Chromium, dev build, walking): 1440 Sprawl 22:00 draw 2.2 ms avg / 3.2 max,
frame gap 16.6 / p95 17.3; 1440 Finance 12:00 1.9 / 6.1, 16.6 / 17.4; 1440 tour 18:30 2.4 / 4.1,
16.6 / 17.1; 390 Sprawl 22:00 2.4 / 3.2, 16.7 / 17.4; no frame over 20 ms. Screens:
docs/screens/street-pass1/compare-*.png (before and after, same spot and hour). Next passes:
docs/ROADMAP.md item 9a.

## DRIVE YOURSELF: your citizen, in your hands (2026-09-30)

Scott: "is there a mechanism for taking control of and controlling your character, and can we
introduce a controller function". v1 is solo: you drive your own citizen, nobody else sees it.

- **Taking control**: FIND ME, then TAKE CONTROL on the tracking strip; MY FILE's ENTER THE
  SUBSTRATE (`#city?control=1`, opens the CITY view and hands over once it is up); or Start on
  a controller while the CITY view is open. Only your own file (`s.you`: a case with a result
  in this browser). Your citizen starts where the schedule has it (on the street, inside its
  room, on its platform, aboard its car; from HQ it is let out at the door). Strip:
  `DRIVING // YOU // <where>` and RELEASE; the Overlord: SCHEDULE SUSPENDED. THE DEPARTMENT IS
  WATCHING YOU WALK.
- **What it is not**: the sim. The controlled avatar is a client-side overlay: the plan, the
  census, the header counts, the Loop panel, the quest check and every other viewer still see
  the scheduled self at its job. This browser's census leaves the scheduled self out while it
  is driven (`ctl.skipSelf`), so there is one of you on screen. RELEASE (Esc, Start, the strip)
  hands you back: SCHEDULE RESUMED. YOU WERE NEVER ANYWHERE ELSE.
- **Input**: keys (WASD / arrows, Shift runs, E acts, B / Backspace backs out, Q / R turn, Esc
  releases; read on the window, never while typing or with a file open); a controller through
  the Gamepad API (`gamepad.js`: left stick or d-pad, radial dead zone 0.2; standard mapping;
  Xbox A / PlayStation cross / Switch A act, B / circle / B back, LB RB turn, RT or a full
  stick runs, Start releases; connect and disconnect are noticed and announced); touch (a
  thumbstick bottom-left, ACT and BACK bottom-right, 48 px and up, `touch-action: none` on
  those only; the TAP TO OPERATE veil stays, shrunk into a corner, so a swipe elsewhere still
  scrolls the page). The legend says what E does now, in the words of the input in use.
- **Moving**: "up" is screen up at every quarter turn (`screenToMapDir`). Solid: every building
  with a massed body (archGeo box, stoops included); lots, fields and the Bowl are walked onto.
  Sliding along walls. The camera follows until a hand drags the map; any move follows again.
  Behind a building you show through it (a faint copy drawn over the scene) and YOU marks you.
- **E**, nearest first: a subject within reach (their file opens), a door (ENTER; leaning on it
  0.4 s goes in too; HQ: IT IS OPEN ABOUT YOU), open ground underfoot (STEP INTO), station stairs
  (CLIMB), a yard bench (SIT). Inside the cutaway: left / right walk the floor through its rooms,
  up / down walk to the lift at the west wall and ride it, E sits at the nearer free seat (stool,
  pew, bleacher) or opens the nearer subject's file, the east end of the ground floor (or B)
  leaves by the front door. Platform: E boards a standing train or waits for the next (boards it
  when it stands); aboard, E (or B) gets off at the next stop, onto that station's platform.
- **Quests**: REPORT CONTACT and witness work where you stand: a file opened while your avatar
  is in a building passes that building (`controlBuildingId()`) exactly as the building page
  always did. Honest: the server never checked where the reporter stood, only that the figure
  is in the named building, and it still checks that.
- **Kept**: `localStorage["hvi-control"]` (try/catch), saved each second; a reload or Back from a
  building page resumes the drive for 6 hours; RELEASE clears it. Another self never inherits it.
- **Modules**: `control.js` (rules, pure; `scripts/check-control.mjs`: collision, doors of every
  building, the lift to every floor, the exit, seat snapping, keys, the touch stick, mocked
  Xbox / PlayStation / Switch / d-pad / non-standard pads, the Loop's stairs and platform, the
  store), `gamepad.js`, `controlIso.js` (step, camera, drawing), `ControlLayer.jsx` (strip,
  legend, touch pad). CityIso.jsx hooks are marked `DRIVE YOURSELF`.
- **Not yet**: STREET view (its drone camera still walks by keys and the on-screen pad, not your
  citizen); others seeing you (multiplayer); bumping into people; a seat can be taken by someone
  scheduled onto it after you sit.
- Measured (headless Chromium, dev build): 1440 walking 16.6 ms average frame, p95 17.2; 390
  touch emulation 16.6 / 18.0. Screens: docs/screens/control/.


## The funnels (2026-09-30)

Scott: "we should always be putting our funnels to everything else": the city's doors out to
the real work, built into the world. Everything lives in its own modules; the shared files carry
one-line hooks.

- **Where.** THE ARCADE (the Strip's free lot, 0x4D04, two floors of cabinets and a prize
  counter; not named Iridescent). EB SHOP (Campus's free lot, 0x2B04: the shop floor, THE UNION
  LOUNGE upstairs). The Arts sound stages are now ELECTRIC BASEMENT TV (same building id
  `studio-block`, style `station`: mast, dish, ON AIR). JETSAM! cabinets also stand in the Dive,
  the Lantern, the all-night diner, a corner of the casino and among the stalls on the Coast's boardwalk (its own `boardwalk` room type: the market plan plus the cabinet); JETSAM! and ANAMNESIS in the Union.
  Data: `funnelSim.js` (places, buildings, the prize clerk's job, who visits), spread into
  `sim.js` after everything else, so each took its district's next free grid cell and nothing
  moved.
- **The cabinets** follow `src/city/arcade.json`, written from the Iridescent works list by
  `scripts/sync-arcade.mjs` before every build (sibling checkout, or `$ARCADE_WORKS`, or the
  studio site's `/works.json` if it is ever published; else the committed file stands). Status
  `live` is a playable cabinet; `beta` (or a `beta`/`play` URL on a work not yet live) is a
  playable cabinet marked BETA; anything else is OUT OF ORDER. Human Value Index's own cabinet
  says you are already inside it. The marquee's high score is per game per machine day, held by
  a dead figure on file (`funnels.highScore`).
- **Drawing.** Outside: `funnelGeo.js` (massing) and `funnelDraw.js` (facades, the invader on the
  roof, the shop windows, the mast), merged into archGeo/archDraw with their kit. Inside:
  `funnelProps.js` plans (`arcade`, `recordshop`, `union`, `ebtv`), the cabinets (screen and
  marquee per game, taped and dark when out of order), EBSN host standees (cardboard: props,
  never subjects; faces from `public/funnels/hosts.png`, keyed from eb-command-center/hosts), the
  EBSN desk, and a TV showing EBTV's now-playing in the bars, the diner and the Union. Poses:
  `arcade`, `browse`, `present`.
- **Taps.** In the cutaway a cabinet opens its game, the shop floor the shop, the stage EBTV, the
  arcade floor its cabinet list (`funnelRoomHits`); the toolbar and the building page offer
  PLAY / SHOP / WATCH / JETSAM! (`funnelButtons`). Overlays: `FunnelOverlay.jsx` (portal on the
  body, mounted once by City.jsx): the game in a CRT (iframe; both live games send no
  X-Frame-Options, and OPEN IN A NEW TAB is always there), "AN IRIDESCENT PRODUCTION. ALSO ON
  ITCH.IO"; the shop's live stock with each item's turntable video and BUY AT THE EB SHOP; EBTV's
  own stream (hls.js 1.6.15 from cdnjs with SRI wherever Media Source exists, native HLS on iPhone) and now.json's NOW PLAYING.
- **The shop proxy.** `/api/funnel?shop=1` (`netlify/lib/funnels.js`): Shopify's public
  `products.json` (up to 3 pages) and the newest 36 in-stock products' `.js` pages for their
  video, the shop's own listings (vendor EBShop) first, 24 shown, videos first. Blobs keeps the
  answer 15 minutes; the CDN holds it as long (`Netlify-CDN-Cache-Control: durable, s-maxage=900`).
  Shopify down: the last copy (under 24 h) marked stale, else CLOSED FOR INVENTORY (cached 1 min).
- **Tags and counts.** Every link out goes through `utm()`: `utm_source=humanvalueindex&
  utm_medium=city&utm_campaign=<building>` (+ `utm_content=<product>` in the shop). Opens, plays
  and links followed are counted per real day, per building, per destination host
  (`POST /api/funnel`, sendBeacon; no IP, no id, no path). Read: `node scripts/funnel-clicks.mjs`
  (the nightly loop puts its `--line` under `## Funnels` in MORNING_REPORT.md), or
  `GET /api/funnel?stats=1&days=N`.
- **No re-hosting.** The only stream in the code is live.electricbasement.tv's own, played
  straight from there; the function never touches it.
- `scripts/check-funnels.mjs`: arcade.json current with works.json and every live game a
  cabinet (the sync's beta/dev rules on a made-up list too), every playable cabinet on the
  arcade floor at cutaway widths, the cabinets in their rooms, the standees, utm on every link
  and the frame, no third-party stream, the proxy's cache / stale / closed paths, the counter's
  sums and refusals, nothing personal stored. Screens: docs/screens/funnels/.

## The city built outward: THE COAST and THE HEIGHTS (2026-09-30)

Scott: "keep building the city outward... mountain and ski resort type stuff, maybe a resort
area like a beach area." Two expansion districts at the edges, appended to `DISTRICTS` (so to
the sectors, the summary, the find index and the civic fold) with `expansion: true`:

- **THE COAST** (0xAD00, south, rows 68-90): the beach (towels, umbrellas, three lifeguard
  towers, a volleyball net, the shallows), the boardwalk (stalls, benches, lamps, THE WHEEL),
  the pier on piles into the sea, THE BREAK (surf), and housing by tier: THE SURFSIDE
  (oceanfront condominiums, the top tier), BUNGALOW ROW and SEAVIEW FLATS (the middle), THE
  SURF SHACKS and THE SEAWALL ESTATE (the bottom). PARCEL 0xAD06 is the resort lot.
- **THE HEIGHTS** (0xBE00, north, rows -31 to -3): the mountain (one terrain, `coastGeo.js
  terrainH`, flat at the village, rising to a ridge with two peaks, falling away behind),
  THE SLOPES (three pistes, a chairlift with its chairs climbing one side, pines, the patrol
  hut), THE BASE LODGE (the hearth and the apres bar), and housing by tier: THE CHALETS (top),
  ALPINE FLATS (middle), THE BUNKHOUSE (the lift crews: the bottom). PARCEL 0xBE06, the upper
  slopes, is the resort lot.
- **Jobs**: lifeguards, boardwalk vendors, pier wardens, surf instructors; ski patrol, lift
  operators, ski instructors, lodge cooks. Their fields put care, labour, coaching and
  medicine first and sport after, so the athletes on file stay athletes (the quests' meetings
  hold). The PROCESSING grades stay at the Works.
- **Homes**: each tier band's homes (`HOMES_BY_BAND`) gained a seaside and an alpine block, and
  a subject's block is now drawn in proportion to capacity, not one-in-n.
- **Transit: the spurs.** Not on the Loop, whose timetable (and so every published plan's
  trains) is untouched. THE SHORE LINE (from the Works station) and THE ALPINE LINE (from
  Campus): surface tramways of personal pods ("ONE SUBJECT, ONE POD. SHARING IS
  UNMONITORABLE."), stop by the hub station, along the street and down the gutter, to a
  terminal in the district. A pod leaves when its rider boards, so the ride is a fixed leg of
  the route (`sim.SPURS`, `V_POD` 360 cells an hour, 4-5 machine minutes): the plan format is
  unchanged. `hubOf(district)` is the station a district uses; `segDistricts` counts a hub
  among a trip's districts (the window files hold everyone who passes through). whereAt
  reports a pod ride as `sub: "walking"` with `leg: "pod"`, `spur`, `podDir` (views that do
  not know pods draw a walker), and every commute leg a `dir` (out before the Loop, in after).
  The subway is a later project (ROADMAP b5).
- **Plans at the day boundary.** Days already published keep their city (nobody lives on the
  Coast in them); the first day the builder builds after a deploy is the first with the new
  districts in it (today + 4 at the latest). Old days' windows have no coast or heights files;
  the browser marks them missing and draws nobody there, which is what those plans say.
- **The civic fold**: the Coast and the Heights have a MOOD and a council SEAT like every
  district; the league stays the ten it was drawn with (`team.pos: null` outside it).
- **Crowding** (`scripts/bench-crowding.mjs`, day 289; the ten old districts' crowding
  factors summed): live census (725) -7 before, -2 after; 2,000 subjects -95 -> -59; 5,000
  -230 -> -187. At 2,000 about half the city lives on the Coast or in the Heights.
  `scripts/check-coast.mjs` holds the 2,000 figure below -80.
- **Drawn** (`coastGeo.js`, `coastDraw.js`, archGeo/archDraw styles shacks, seawall,
  bungalow, seaview, condo, bunkhouse, alpine, lodge, chalet): the sea rolls in, the wheel
  turns, the chairs climb, skiers come down the pistes and surfers ride in; the snow goes blue
  at night and the boardwalk's lamps come on. Far: shapes, colours, dots; mid and near: props,
  people at their business (sunbathers on towels, swimmers to the waist, rods over the pier's
  rails, riders on the chairs). The mountain is painted in cells back to front with everything
  on it, so at every quarter turn a ridge hides what is behind it.
