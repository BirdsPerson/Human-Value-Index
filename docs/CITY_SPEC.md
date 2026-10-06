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
(a box), `phone`; since the master plan, `box` (the guard, a bob, a jab into the air: THE PIT's
ring, gloves drawn), `grapple` (the octagon's low stance and a check kick) and `tennis` (ready,
backswing, contact, follow-through, a racket), all stylised: nobody is struck, nobody falls. Since park chess (below), `chessmove` (a reach over the board with a piece between the fingers), `chinstroke` and `clocktap`. Props the move needs (cards, chips, a box, a broom, a club, poles and skis,
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
- **Candidacy (2026-09-30).** Scott wants players to be able to run: with other players' citizens
  closed, a player could only vote for itself. A player whose citizen is on the census and lives
  or works in a district may DECLARE there (the race's write-in panel, writing yourself in, or
  MY FILE's council panel; `POST /api/elections {caseId, declare: {district, withdraw?}}`),
  and WITHDRAW until the close. A declared citizen joins that race's write-in picker for every
  file, as SUBJECT and its tag, marked DECLARED, STATEMENT NONE ON FILE (no free text).
  Undeclared citizens stay closed. Refused, with one neutral line: unassessed, a harm finding
  (made or pending), not on the census, not living or working there. A later harm finding
  withdraws every candidacy (`intake-score.js` -> `dropCandidacy`). Limits as ballots: 4 files
  per address and 2 per device (their own lists, `c<NNN>/dip`, `ddev`), 60 POSTs per
  address-hour (shared), 10 declares-or-withdraws per file per cycle. Stored as
  `c<NNN>/decl/<voterKey>` and `c<NNN>/cands` (voter key -> citizen key; never served); the
  public view adds `declared` (a count per race, and a flag on the board's write-ins). The board
  threshold and every winner rule are unchanged; ballots cast before a withdrawal still count.
  `GET /api/elections?candidacy=1&caseId=` feeds MY FILE. Checks: check-civic section 3d.
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

## GAMEPAD BROWSE: the controller for everything else (2026-10-05)

Scott: "right stick controls camera, left stick controls cursor." Whenever a pad is connected,
has been touched, and you are not driving, the CITY and MAP views take it (`padBrowse.js`;
CityIso.jsx / CityMap.jsx hooks marked `GAMEPAD BROWSE`). A connected pad nobody touches changes
nothing; a mouse move or a tap hands the city back to the pointer until the pad is used again.

- **Left stick**: a pixel reticle. Speed grows with the push squared and ramps over half a
  second held; it slows to half over something it can name, and, let go, settles onto a person
  (or prefect, or fishing spot) within 26 px. At the rim it stops and pushes the camera. It
  hovers exactly as a mouse does: that one label, said aloud through the selection status.
- **Buttons** (glyphs per family, `gamepad.GLYPHS`; Nintendo swaps A/B and X/Y by print):
  A taps (a building: first its chip, A again opens the cutaway, even if someone walked in
  front; a person: their file); B backs out (the chip, the river's name, a find; over a card or
  an overlay it closes it); X focuses FIND (d-pad up / down choose, A picks, A on an empty box
  is FIND ME, B or X again leaves); Y is LABELS; d-pad steps through the buildings in view,
  nearest the centre first, cursor and chip on each (like `[` `]`).
- **Camera**: right stick pans (eased, none under reduced motion), RT in / LT out about the
  cursor, LB / RB a quarter turn, right-stick click FIT.
- **Cutaway**: the stick (with repeat) or d-pad moves between rooms, nearest that way; A goes
  in among its people, cabinets, shop items, hosts and TVs (a room with none: its own tap, or
  ENTER); A again opens one (a cabinet plays, a shop item opens its card, a person their file);
  B comes back out, then closes. Y is ENTER (the building page). Brackets mark the focus.
- **Start / Select**: Start takes your own citizen when you have a file (`gamepad.driveToggle`);
  driving, Start or Select release. Select otherwise flips CITY / MAP (on the MAP, Start goes to
  the CITY view and takes control there). A button held through the switch is not a press there.
- **Hint strip**: one 10 px line bottom-left, only while the pad is in use, in that pad's glyphs.
- **Checks**: `check-control.mjs` section 11, mocked getGamepads: dead zone, acceleration, aim
  assist, rim push, pan easing, triggers, stick repeat, every press per mode, A-then-A, B,
  bumpers, Start / Select, driving stands the browse down, unplugging.
- **Not yet**: STREET and STACK views; the building page (BuildingView); typing a name with the
  pad (no on-screen keyboard: FIND takes the keyboard, or FIND ME).


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
- **Taps.** In the city's cutaway and on the building page and district view alike (RoomStage,
  `funnelTapAt`; before 2026-10-05 only the city's cutaway answered, so ENTER led to a shop and
  an arcade where nothing could be bought or played) a cabinet opens its game, a rack on the
  shop floor its product, the rest of the shop floor the shop, the stage EBTV, the arcade floor
  its cabinet list (`funnelRoomHits`); the toolbar and the building page offer
  PLAY / SHOP / WATCH / JETSAM! (`funnelButtons`). Overlays: `FunnelOverlay.jsx` (portal on the
  body, mounted once by City.jsx): the game in a CRT (iframe; both live games send no
  X-Frame-Options, and OPEN IN A NEW TAB is always there), "AN IRIDESCENT PRODUCTION. ALSO ON
  ITCH.IO"; the shop's live stock with each item's turntable video and BUY AT THE EB SHOP; EBTV's
  own stream (hls.js 1.6.15 from cdnjs with SRI wherever Media Source exists, native HLS on iPhone) and now.json's NOW PLAYING.
- **The racks** (2026-10-05, Scott: "I should be able to see the listings of things on the wall,
  and they should be clickable"). `shopStock.js`: one fetch of `/api/funnel?shop=1` per page,
  shared by the overlay, the walls and the keyboard links, asked for only when the shop room is
  first drawn. The shop floor's back wall holds the live stock as framed pixel thumbnails
  (`shopSlots`: two racks where the wall is tall enough, one where it is not), the item with a
  turntable video turning on the stand behind the till; each opens that item in the overlay
  (`{kind: "shop", item: handle}`: video or image, title, price, BUY AT THE EB SHOP with
  `utm_content=<handle>`). Stale or closed stock: the racks carry CLOSED FOR INVENTORY and answer
  nothing; the floor still opens the overlay, which says why. Keyboard and screen readers: one
  link per rack ("BUY <title>, $<price>, at the EB Shop"), hidden until focused, its frame lit.
  FIND > finds the EB SHOP, THE ARCADE and EBTV by name (`findFunnel`) above the people.
  `scripts/check-funnel-shop.mjs`.
- **The hosts, live** (2026-10-05; Scott: "bots that actually walk around and do stuff, or sit
  behind the counter and talk to each other, or that you could interact with"). The cardboard
  standees are gone (their plan slots stay and draw nothing; the sim is untouched). `hostsLive.js`:
  the six EBSN hosts (Scott's own characters, eb-command-center/edit/qvc_hosts.md) work the shop
  floor in shifts on the city clock, deterministic from the building and the machine day and
  hour: the daypart's pair (DALE and CAROL 06-14, HÉCTOR and ASUKA 14-22, VERN and JOAN
  after) plus one other covering, dealt REGISTER (behind the till), TURNTABLE (beside the stand)
  and FLOOR (walking the bins, a stop at each end); the other three are off the clock in THE
  UNION LOUNGE upstairs. Each is their face from `hosts.png` on a small pixel body in their own
  clothes (no two alike). One bubble per room at a time: a line of chatter every 7 s in the
  speaker's voice (10+ scripted lines each, no shipping or discount promises). A tap (or the
  TALK TO buttons for the keyboard, the reply announced) turns a host to you: a pitch for a real
  item from the live stock (its title and price only) opens that item with their line over it;
  the next tap another item; the third a line of banter; off the clock, an off-duty line.
  Reduced motion: nobody walks, bubbles hold still. No model calls: `hostSay()` is the one seam
  a future voice or chat would replace. DALE and CAROL sit at the EBSN desk on EBTV's stage too.
- **The neighbours** (2026-10-05). Other people's games get a tribute cabinet: entries in
  `arcade.json` marked `"neighbour": true`, which `sync-arcade.mjs` keeps after Iridescent's own.
  First: INTERNET CITY (internetcitygame.com, not ours): first in THE ARCADE's front row and the
  Port's first gateway (THE CUSTOMS HOUSE, room type `customs`: the office plus the cabinet;
  Scott: one megacity, gateways to other worlds at the Port). Its screen is our own drawing (a
  little isometric skyline), never their art; its site refuses frames (X-Frame-Options DENY,
  frame-ancestors 'none'), so the cabinet shows our attract screen and a link out in a new tab,
  `utm_campaign=internet-city-cabinet` wherever it stands. No high score: not our game to score.
  The share link `#city?welcome=internetcity` glides to THE ARCADE, opens it and shows one
  dismissable line, "WELCOME, NEIGHBOUR. YOUR CITY HAS A CABINET HERE."; the parameter is
  dropped from the address at once (City.jsx `WELCOMES`).
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
  The subway is a later project (ROADMAP b5). **Since PHASE 2 step 2 the pods are replaced by
  THE SHORE LINE and THE ALPINE LINE (rail, below); a day built before keeps its pods.**
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

## The Prefects (2026-09-30)

Scott: "each district will have an elected representative, polarization will follow... the Overlord
puts in place a representative of its own for each district, tailored to the specific tastes and
population of each. Not the same dude over and over." Twelve DEPARTMENT PREFECTS, one per district
(the Coast and the Heights included): machine constructs of the Overlord, never people, each with its
own designation, look, temperament and voice. Code: `src/city/prefectData.js` (the twelve: temper,
look, 14 lines each), `src/city/prefects.js` (lean, directive, clash, legitimacy, patrol; pure),
`src/city/prefectDraw.js` (the procedural sprites, the iso drawing), `src/city/PrefectPanel.jsx`
(district rows, the PREFECT card, `#city/prefects` = `#prefects`). Hooks: `civic.js` (the fold),
`CityIso.jsx` (patrol, tap, tags), `CivicPanel.jsx`, `City.jsx` (page, card host, PA), `App.jsx`
(the `#prefects` route). Check: `scripts/check-prefects.mjs`.

| District | Designation | Style |
|---|---|---|
| Finance | FIN-01 THE AUDITOR | ledger-visor; strict on paper, lenient on capital |
| The Strip | STR-04 THE PIT BOSS | dealer's eyeshade, chips; permissive after dark |
| Campus | CAM-02 THE PROCTOR | mortarboard, gown, clipboard; silent, severe |
| The Works | WRK-09 THE FOREMAN | hard-hat drone on treads, wrench; strict, shift-bound |
| The Coast | CST-11 THE LIFEGUARD SENTINEL | periscope head, buoy; lenient by day, the sea closes at dusk |
| The Heights | HTS-12 THE SKI PATROL | helmet and goggles, pole; orderly, controlled descent |
| The Commons | COM-08 THE CHAPLAIN | hood, halo, lantern, robe; gentle, persistent, every door |
| The Archive | ARC-07 THE LIBRARIAN | card-catalogue head, stamp; quiet, exacting |
| The Arts Quarter | ART-03 THE CURATOR | picture-frame head, velvet rope; permissive but petty |
| The Arena | ARN-05 THE REFEREE UNIT | siren dome, stripes, raised yellow card; by the book |
| The Sprawl | SPR-10 THE HOUSING OFFICER | intercom-panel head, keys; door to door |
| Dept HQ | HQ-00 THE AIDE | black monolith head, earpiece, tablet; loyal, correct |
| The Port | PRT-15 THE HARBOURMASTER | peaked cap over a lighthouse lantern, foghorn; strict on the quay (ALL CARGO DECLARED.) |
| The Old Town | OLD-16 THE BEADLE | tricorne over a one-eyed brass bell, mace, gown; ceremonial, fussy about bylaws (BY ORDER OF THE BYLAWS.) |
| The Suburbs | SUB-17 THE COVENANT OFFICER | mailbox head with its flag up, a lawn ruler; petty, measures grass (PLEASE REVIEW THE COVENANTS.) - arrives with its district |
| The Airport | AIR-18 THE SCREENER | walk-through scanner arch for a head, wand; by the book (REMOVE YOUR SHOES.) - arrives with its district |
| The Farmland | FRM-19 THE GRANGE INSPECTOR | straw boater over a sack face, pitchfork, overalls; slow, seasonal (GRADED AND STAMPED.) - arrives with its district |
| The Engine | ENG-20 THE HELPDESK | CRT monitor head with a blinking cursor, the ticket printout; closes every ticket (TICKET CLOSED.) - arrives with its district |

PHASE 2's prefects (`src/city/phase2Prefects.js`): prefectData.js takes the ones whose district exists in
`sim.DISTRICT`, so each of the four later ones goes live the day its district is added (no other change
needed); check-prefects holds all six to the uniqueness rules now (codes 13-14 are the nightlife quarters').

- **The lean** (one axis, PEOPLE -100 <-> ORDER +100). A subject: ORDER = threat, utility, rigidity
  (100 - adaptability) and an ordering record (military, law, finance, business, royalty,
  management, crime); PEOPLE = care, alignment and a caring record (activism, care, labour,
  medicine, education, farming, philosophy, the arts). Citizens: competence over warmth. A
  councillor (`seat.lean`, held seats only) = LEAN_GAIN (2.2) x (half its own lean + half the mean
  lean of its district's workforce that would back it, `compat >= 0.05`), each less the city's
  mean. Players' ballots are secret and carry no values, so they count through the holder; a player
  citizen holding a seat leans by its own file and its backers.
- **Polarization** = |lean| + the mood past the extremes (|raw| - 45), 0..100.
- **The directive**, once per machine day: PERMITS (control -2), DECREES (0), WELLNESS CHECKS (1),
  PATROLS (2), INSPECTIONS (2), CURFEW (3). Target C = temper strictness - lean/40 (it
  COUNTERBALANCES: a PEOPLE council draws order, an ORDER council draws festivals) + the mood's pull
  (seething: +1.6 clamp or -2 placate by temper; restless +-0.8; placated: +1 probe or -0.8 relax),
  clamped -2..3. Chosen: the nearest control, its two preferred instruments favoured (0.45, 0.25),
  a hashed day's whim (0..0.35). Intensity 1..5 = 1 + round(|C| + polarization/50). Input mood =
  today's raw before the prefect's own factor, so the block stays recomputable from one plan.
- **Clash** = |lean|/100 x the directive's control where it opposes the lean x intensity x 6,
  0..100; vacant seat: none. **Mood**: new factor `prefect` = directive weight (curfew -4 ... permits
  +3, scaled by intensity) - clash/5, -25..6. **Legitimacy** raw = 50 + 12 (a council sits) +
  mood/4 - 0.8 clash - polarization/5 - 5 (heavy hand), 0..100, smoothed 0.6 today + 0.4
  yesterday's raw; SANCTIONED 70 / ACCEPTED 50 / QUESTIONED 30 / CONTESTED 15 / REPUDIATED. The seed
  of the unrest arc (ROADMAP e); nothing riots yet.
- **In the record**: `summary.civic.districts[id].prefect = {directive, intensity, clash, polar,
  legit: {s, raw, was}, was (yesterday's directive)}` (~110 bytes a district; 917 B/district at 5,000
  subjects with every seat held, fold 76 ms), `seat.lean` on held seats.
- **The patrol** (every viewer the same): one stop per 0.75 machine hours, walked along the streets
  (`sim.footpath`) at 0.8 walking pace, then standing and gesturing via the rig. Stops: while the
  Council sits, all twelve in a row before THE ASSEMBLY; a game in the district, the ground;
  otherwise the busiest building of the district that hour (`summary.b`), the directive's haunts
  preferred (homes for curfew / wellness, workplaces for inspections, leisure for permits), on the
  kerb of the building's most open side. Tags (the designation) and speech bubbles (its own lines)
  draw over everything so a prefect behind a building is still found; its lens glows at night. Tap
  opens the PREFECT card (designation, jurisdiction, style, today's temper, directive and decree,
  council v prefect, legitimacy, record of acts from the summaries held, patrol lines).
- **Speech**: they are machines, not people, so they speak freely in the Overlord's register; each
  line ends in its own sign-off (RECONCILED. / SHHH. / PLAY ON. ...). The PA reads their decrees.

## THE MASTER PLAN: layout 2 (2026-09-30)

Scott: "Maybe we should hire a city planner." The review, the findings (with the numbers), the
moves and what they cost: docs/planning/MASTER_PLAN.md. In the code:

- **Layout 2** (`sim.js LAYOUT_VERSION`, `HEIGHTS_DY` -10, `COAST_DY` +9): the Heights pulled back
  behind THE FOOTHILLS (`the-foothills`, a Heights place drawn by `coastGeo/coastDraw`: pines, a
  trail, the ranger's post, the Alpine Line's right of way); the bottom row runs to row 74 as a
  belt (DEPT OF PLANNING in the Commons, THE PIT in the Works, THE ESTATE GARDENS and THE TENNIS
  CLUB in the Sprawl); the Coast moved south behind it; the Works laid out by hand, heavy in, light
  out (`WK(col, row)`, the old grid's cells); the Commons' school and allotment swapped. The Loop,
  every id, every capacity and every home band are exactly layout 1's. The 3D view's `SPAN` grew
  to 78 so the whole city fits at rest.
- **At a day boundary**: plans name their layout; published days keep their segments and are
  drawn on the new ground, `whereAt` fitting a trip's legs to the plan's own times (a local walk,
  walk1 before the platform, walk2 after the train) whenever the ground has moved, so nobody jumps
  mid-day; the first day built after a deploy is the first on the new ground.
- **The venues' data** (`venueSim.js`, spread into `sim.js` like the funnels): places `pit`,
  `tennis`, `planning-office`, `estate-gardens`, `foothills`; jobs Bout Referee, Ring Announcer,
  Club Professional, Line Judge, Planning Officer, Forest Ranger (drafted a few each, the pros for
  the tennis players); a `tennis` field; hints for the fighters and tennis players on the census;
  `VENUE_FIXTURES` (the Pit's card, the club's fixtures) pull a crowd like `GAMES` without joining
  the league's timetable.
- **THE PIT** (`pit.js`, `venueGeo.js`, `venueDraw.js`, `PitPanel.jsx`, `social.js pitBoundary`):
  the ring, the octagon, the stands, the locker rooms, the fight board; Friday cards; grievance
  nights booked from nemesis pairs at a day boundary (the dead fight in person, the living name a
  dead fighter on file as champion, never fight); `/api/social` publishes `pit`. Fighters and
  finalists are drawn by projection (the council's pattern), anyone on the bill left out of the
  crowd so nobody is drawn twice.
- **THE TENNIS CLUB** (`tennis.js`): four courts, the clubhouse, the show court's fixture.
- **DEPT OF PLANNING** (`planning.js`): the office's massing and facade (style `planning`, THE
  PANORAMA on its plinth), the drawing office (room type `planning`, the advocates at their
  lecterns as props), `planningLines` in the PA. The hook for future sessions: MASTER_PLAN.md.
- **Billboard sites** (`billboards.js`): reserved, not drawn.
- `scripts/check-planner.mjs`; the layout-1 fixtures in `scripts/fixtures/layout1-*.json`.

## The leagues and the Departmental Cup (from season 13, machine day 337; Scott 2026-09-30)

Scott chose per-sport leagues and an overall DEPARTMENTAL CUP in place of the single mixed league,
from the season boundary after the running one: seasons 1-12 keep the league they were drawn with
(season 12's league-wide draft included; `check-civic` folds season 12's last day exactly as before).
Code: `src/city/leagues.js` (pure mechanics: pools, drafts, the calendar, results, box scores, stats,
the ladder, the Pit, the Cup), `src/city/civic.js` (`LEAGUES_FROM`, `sportDraft`,
`sportSeasonRosters`, the fold, `leaguesView` / `sportTableAt` / `cupTableAt` / `decidedAt`),
`src/city/LeagueHub.jsx` (`#city/league/<tab>`), `CivicPanel.jsx` (district teams, the Cup panel,
the PA), `simApi.js` (boards and PA). Check: `scripts/check-civic.mjs` section 3d.

- **Four leagues, one team per Loop district per sport.** BASEBALL at the Diamond (THE CURATED NINE,
  9 a side), BASKETBALL at the Courts (THE CURATED FIVE, 5), FOOTBALL at the Bowl (THE CURATED
  ELEVEN, 11), SOCCER at the Estate Pitch (CURATED F.C., 11; F.C. STANDS FOR FULLY COMPLIANT). The
  scoreboards keep the district's short name (the ground says the sport); the PA and the pages use
  the sport's name.
- **The drafts.** Each league drafts its own every season: the reverse of its own last table, the
  champion last (season 13: the mixed league's season-12 end), a snake over the roster's rounds, then
  the Commissioner's cap (`snakeDraftN` `fine`: up to 8 trades between the strongest and weakest,
  each lowering the league's variance of team means). The pools (`sportPools`) are exclusive: the
  sport's specialists on file first (`specialtyOf`: named figures, then the record's text: MLB to
  baseball, NBA to basketball, NFL to football, footballers to soccer), then athletes (spread to the
  least-filled league), then the regulars at that ground (>= 12% of leisure), then the rest, each by
  `sportRating` (playerRating with a sport record for the named athletes; the mixed league's rating
  is untouched). Fighters on file and tennis players are not drafted. Live census, first picks:
  Ohtani, Kobe, Brady, Ronaldo/Pele (THE HOUSE EDGE picks first everywhere: it finished last).
- **Matchdays.** Every scored GAMES slot at a league's ground is a matchday: a full round of five.
  The Courts play all five on the board, one game to 21 after another (the board now shows 21 at the
  final basket). The other grounds put one tie on the board (rotating through the round; the first
  semi and the final); the other four are played BEHIND CLOSED DOORS at a Department facility, scored
  by the same model from their own seed, released at the whistle. The side that won a board goes to
  the team better on the day (rating + 50 x hashed luck). Formats (the calendar decides): baseball 16
  matchdays: 9 rounds, semis, final; basketball 28: 18 rounds (every pair twice), semis, final;
  soccer 8: 6 rounds of the circle, semis, final; football 4: 3 rounds, then THE BOWL GAME (1st v
  2nd). Win 3, draw 1; playoffs never draw (the Department's tiebreak). (These are the short
  seasons'; the long seasons' formats are below.)
- **The season length: one real month from season 23** (Scott 2026-10-05: "a season should last one
  real month"). One calendar, `src/city/seasons.js` (`seasonOf`, `seasonStart`, `seasonDays`,
  `LONG_FROM`), re-exported by `leagues.js` and `civic.js` and read by `race.js` (the mountain
  standings); no other module defines a season. Seasons 1-22 are 28 machine days (11h12m real) and
  stay so: every day of them was published. From season 23 (0-based `LONG_FROM` 22, machine day 617,
  2026-10-06 06:24 UTC / 02:24 EDT) every season is a fixed 1800 machine days = 30 real days (not
  calendar months): season 24 opens day 2417 (2026-11-05 06:24 UTC), season 25 day 4217, and so on.
  The cutover was the first boundary no plan had published (the builder publishes today + 3 machine
  days; on 2026-10-05 20:30 UTC it had published through day 595). 1800 is not a multiple of 7, so a
  long season starts on any weekday: the calendar counts a season's scored slots by weekday from its
  first day (`slotsBetween`), which reproduces every short season's matchdays exactly.
  **Long-season formats** (`SPORT[sp].longRounds`, `roundsOf`): today's rate of league rounds per
  real hour kept, 64 x the short season's rounds rounded to whole home-and-away circles where it
  isn't one: baseball 576 rounds (every pair 64 times), basketball 1152 (128), football 198 (22), then
  THE BOWL GAME; soccer 378 (42). The rounds are spread evenly over the season's scored slots (round i
  on slot floor(i x (M - P) / R)), the slots between them are exhibitions (the board's generic sides),
  and the playoffs (semis, then the final; the Bowl Game alone) take the season's last scored slots,
  so the final is the season's last league fixture and the Cup is decided on its last day or two. A
  long season's `matchdays(sport, season)` counts league matchdays only (the hub's MATCHDAY x OF y).
  Cost at the end of a long season: about 10 ms a sport to replay its matches, under 100 ms for a
  sport's season stats (node). The ladder and the Pit replay only to the hour asked for.
- **Individual.** THE TENNIS LADDER (`ladderRun`): seeded each season (the tennis players on file,
  the club's regulars, then athletes; 10 rungs); the show court's match (tennis.js) counts, and Ladder
  Night adds three challenges one or two rungs up; a winning challenger takes the rung. THE PIT
  RANKINGS (`pitRun`): the season's Friday cards, W 3 D 1, fewer losses then stoppages break ties.
  Individuals score for the district they work in (the club's pros work in the Sprawl, most fighters
  in the Arena: a standing bias, documented, not corrected).
- **THE DEPARTMENTAL CUP** (`cupTable`, `positionPoints`): per league 10 8 6 5 4 3 2 1 0 0 by
  position (the playoffs decide the top; teams level on points, difference and scored share; nothing
  before a ball is played), plus 3/2/1 for the ladder's and the Pit's top three. Decided at the last
  final whistle (the season's last league fixture); the next season records it
  (`leagues.cup.last`). The mood's `league` factor (label SPORTING FORM) is now the Cup form: the last
  five results across the district's four teams (W +3, L -3) plus Cup first +4 / last -4, clamped
  +-19.
- **Box scores and stats** (`boxScore`, `seasonStats`, `leadersOf`, `mvpOf`): every match's player
  lines hashed from its seed and summed to the final exactly (runs and RBIs, points from 2s, 3s and
  free throws, touchdowns/kicks to points with passing yards = receiving yards, goals and assists;
  pitchers' ER and keepers' clean sheets from the other side). Never stored: the browser recomputes
  the season's matches from the block's rosters with the fold's own code, then the stats.
- **The block** (from season 13): `leagues {season, day, days, sports {<sport>: {stage, table,
  champion, draft}}, tennis {seed, ladder}, pit {dist, rank}, cup {table, last}}`;
  `districts[id].teams {<sport>: {rating, roster, pos, p, w, d, l, f, a, pts, form}}` and `cup {pos,
  pts}` (the Coast and the Heights: `cup.pos` null, no teams); no `league`, no `team`. Measured:
  2,507 / 2,620 / 2,670 bytes per district at 430 / 5,000 / 20,000 subjects (the rosters are
  most of it; the mixed league's was ~950-990), fold 127 / 534 ms at 5,000 / 20,000 on draft day.
- **Players' entries: JOIN THE LEAGUES** (Scott 2026-10-05: "my character is not on any sports teams.
  I was a multi-sport varsity athlete in high school. I would like to be in the sports competitions.")
  MY FILE (`src/leagues/MyLeagues.jsx`, `/api/leagues`, `netlify/lib/league-entries.js`) enters the
  file's citizen in one or two of BASEBALL, BASKETBALL, FOOTBALL, SOCCER and THE TENNIS LADDER, from
  season 23 (`ENTRIES_FROM` 22, draft day 617). The entry stands every season until withdrawn (Blobs
  `hvi-leagues` `e/<salted hash of the case>`: the citizen key, the sports, the rating inputs; never the
  case number; 30 filings an address an hour, 4 new entries an address a day, 10 filings a file before
  one draft). Entries close at the start of machine day `seasonStart - 3` (72 real minutes before the
  draft; the builder folds up to three days ahead): an entry or a withdrawal before it counts for that
  draft, after it for the next. The plan builder (`planIo` `entries`) freezes the season's snapshot
  (`snap/s<NNN>`, onlyIfNew; the first write after the close freezes it too) and sets every snapshot
  (`civic.js setEntries`) before it folds, so a season's drafts are always drawn from the same list,
  chained or from the census alone. **The rating** (`entrantRating`): 0.45 physical + 0.25 competence +
  0.10 adaptability from the file's latest assessment (an unassessed body is the rubric's neutral 50),
  + 4 when the subject's own words (or the commendations) record athletics (`athleticsOf`: varsity,
  lettered, played X, X team...), + 3 more in a sport they named; ceiling 87, below the stars on file. No
  record in sport: that is the athletes'. **The athletic record** (Scott 2026-10-05: three years varsity
  basketball, a division winner every year and the South Jersey finals, varsity soccer and baseball, the
  school's #1 in the 400 and the long jump; the formula put him in the low 50s, under the city's
  non-athletes): an ADMIN-SET field on the case (`hvi-cases` `athleticRecord {level, played, track, by,
  at}`), written only by the operator (`scripts/set-athletic-record.mjs <case> --level
  <varsity|standout|college|none> --sports a,b [--track] [--dry-run]`, under the case's etag), never by
  a public API (`src/leagues/record.js`). It sets a floor: HIGH SCHOOL VARSITY 60, VARSITY STANDOUT 66
  (multi-sport, a captain, a school record or #1, a title-contending team), COLLEGE 72; + 3 in each league
  sport played at that level; + 1 in football, soccer and basketball for track & field; the floor never
  passes 72 (the pros on file are drafted in the 80s and 90s). PRO is not a level. The rating is the
  higher of the file's formula and the floor (the interview bonus and the floor never add; a record never
  lowers the file's rating). A changed record re-rates a standing entry (MY FILE) until the close; the
  snapshot carries each entry's record with its ratings. MY FILE shows it read-only ("ATHLETIC RECORD ON
  FILE: VARSITY STANDOUT // BASKETBALL, SOCCER, BASEBALL, TRACK"); the public path to athletics stays the
  interview's bonus. **The draft**: an entrant joins the pools of the sports entered
  among the athletes (g 2) at their own rating, the census's row for that citizen giving way and the
  pool keeping its size (the lowest of the rest drops), at most 20 entrants a league a season; placed by
  the same snake and cap. The ladder: below the seeded ten, at most six, challenging up. Shown as
  SUBJECT and the case's last four (`entrantName`, made from the key) on rosters, box scores, leaders
  and the draft board. MY FILE shows the next draft (season, close and draft times), the ratings, the
  drafts the citizen is in, and the season lines (`civic.js entrantLines`: "BATTING .287 FOR THE
  CURATED NINE (...). THE DEPARTMENT IS UNMOVED."). A harm finding or a purge drops the entry; refused
  for unassessed files and files under a harm finding.
- **In the city.** `#city/league` is a hub: BASEBALL / BASKETBALL / FOOTBALL / SOCCER (table with
  Cup points, today, results with box scores, leaders, sortable player stats, team stats, rosters,
  the draft board), TENNIS, PIT, CUP. A district page shows its Cup position and its four teams; the
  city page's panel is the Cup; a person's file carries their SEASON LINE. The PA reads each league's
  first pick on draft day, kickoffs and finals with the sport's teams, every league game at the
  Courts, one closed-doors line a matchday, the Cup's leader and the champions. Before day 337 the
  hub shows the mixed league and the date. Dev: `window.__HVI_CIVIC_PREVIEW__` (a civic block) is
  read in place of the summary under `vite` only.


## Park chess (2026-09-30)

Scott: "what happened to the chess boards in the park? Are those there?" They were on the roadmap (b2)
and never built. Now: stone tables (Washington Square's, more or less) in the green spaces, the city's
figures playing each other on them all day with a crowd of kibitzers, THE PARK CHESS LADDER, and a
real game of chess against any figure the Department will seat. Code: `src/chess/`.

- **The tables** (`park.js TABLES`, placed from the lots' own rectangles): two on THE RECREATION
  GROUND's north-east lawn beside the fountain's ring (the groundskeeper's anchor moved round to the
  east lawn to make room), a row of three across THE GREEN (the Commons), two beside the path through
  THE ESTATE GARDENS (the master plan's green for the Sprawl), placed where its trees leave room.
- **Who plays** (`roster.js`): the chess players on file first, with the Department's own park rating
  (0..99, set like the Pit's fighters): Bobby Fischer 99, Peter Thiel 82, Stanley Kubrick 80 (he
  hustled chess in Washington Square), Alan Turing 70, Benjamin Franklin 68, RZA 66, Karl Marx 64,
  Bill Gates 45; then the file's strongest (rating from competence x 0.55 + adaptability x 0.25,
  capped at 78; the top fourteen at 60 and up); then eight nameless regulars (THE MAN WITH THE THERMOS,
  AN UNLICENSED SPEED HUSTLER, A PIGEON FEEDER...) drawn with procedural avatars that never open.
  Nobody whose file documents grave harm sits: a `harm` band, the SOYLENT GREEN tier, threat 80+.
- **The day** (`park.js`): open 07:00-23:00, a game per 45 machine minutes per table, pairings hashed
  per day, slot and table (chess players weighted first, close ratings favoured, a mismatch now and
  then). Results from the two park ratings (Elo expectation) and a hashed luck; draws likelier between
  strong, even players; decisive mismatches are short. The last stretch of a slot the result stands.
  Pairings and results read the park ratings only, so a day's games are the same however the ladder
  is counted. **THE LADDER**: Elo, K 24, over the last 120 machine days, fixed at the start of each
  machine day (today's games move tomorrow's). Every viewer sees the same games and the same ladder.
- **Drawn** (`tableDraw.js`; hooks: `parkDraw.recGround`, CityIso's open-lot branch for the Green and
  the gardens): stone top on a pedestal, the board inlaid (8x8 up close), two stone stools, the clock;
  the one to move reaches over the board with a piece (`chessmove`) and taps the clock (`clocktap`),
  the other strokes a chin (`chinstroke`); kibitzers (ladder players not at a board, more round a
  chess player on file) stroke chins, point, clap or shrug a result; the pieces left on the board thin
  out as the game goes on. Over: the winner talks it through (`sittalk`), the loser `facepalm`s, a
  draw is two shrugs. Players are drawn by projection (the Pit's pattern).
- **The PA** (`park.paLines`, in City.jsx with the venues): a result from the last hour ("FISCHER BEAT A
  PIGEON FEEDER IN 14 MOVES. THE PIGEONS ARE APPEALING."; upsets, routs, long grinds and draws have
  their own), the game on at a board, the ladder's top three (on the map and in the Arena).
- **Play a figure** (`#chess?vs=<slug>[&table=<id>]`, `Chess.jsx`): tap a table (you sit across the
  stronger figure at it) or E at one while driving yourself, or pick from the list. Full rules
  (`rules.js`: 0x88, castling, en passant, promotion to any piece, check, mate, stalemate, threefold,
  fifty moves, dead material; SAN; perft-checked). The figure's engine (`engine.js`) runs in a Web
  Worker: iterative-deepening alpha-beta, a node budget (never a clock: deterministic), strength from
  the park rating: >= 95 sees 5 plies, 80-94 4, 65-79 3, 45-64 2, below 1; >= 55 also searches every
  capture to the end; every position misjudged by up to (100 - rating) x 2.2 centipawns (fixed per
  position and game); below 50 a blunder in (50 - rating) / 160 of its moves; threat on file makes it
  attack the king. The dead talk (their own written lines, or the house's); the living only act
  ("PETER THIEL ADJUSTS A PIECE THAT WAS ALREADY STRAIGHT."). Tap-to-move, 44 px squares at 390, pixel
  pieces, the move list, resign.
- **On file** (`/api/chess`, `netlify/lib/chess-store.js`, `chess-verify.js`): the server deals a game
  (a seed for the figure's engine) and files the result only when it replays: every move legal, the
  end real (or a resignation), a sample of the figure's moves (always the last) re-played by the
  engine with the game's seed, at least 1.2 s a move since the deal, a win at least five moves, the
  same winning line never twice, one result per game, 40 starts and 40 results an hour. A citizen
  rating (Elo from 1200, K 32, against the figure's park rating), a leaderboard (case last-4 only,
  with the best scalp) and lines on MY FILE ("DEFEATED BOBBY FISCHER. THE DEPARTMENT DOUBTS IT.").
  No stakes, no prizes. The purge deletes the record.
- **Checks** (`scripts/check-chess.mjs`): perft on seven standard positions (start depth 4 = 197281),
  special moves and every draw rule, engine determinism and strength ordering by self-play, the
  roster's content rules, the tables' ground, the ladder's determinism, the API end to end.

## PHASE 2: rail lines as first-class things (2026-09-30)

The brief: docs/planning/MASTER_PLAN.md, "PHASE 2". Step 1, the line abstraction:

- **Lines** (`src/city/lines.js`, pure; registered in `sim.js`): a line is a closed arc its trains
  run round on a fixed timetable from machine hour 0, stops at arcs, trains of cars. THE LOOP is
  line 0 (`sim.LOOP`), its own functions untouched. Every other line is a SHUTTLE: a double-track
  viaduct along a centreline (an orthogonal polyline with round corners), out on one track and back
  on the other, folded into one arc of 2L; a station is two stops (a platform per track). At each
  end the tracks close to one over a stub: the train runs in, stands, and leaves on the other side
  of the stub (push-pull), so the turn takes no arc a car rides. `LINES` is append-only (plans name
  a line by index); a line is never retimed in place (a new version at a new index; the old one
  stays decodable, `retired`). `STOPS` is every stop by id (the Loop's are its stations),
  `TRAIN` every train, `lineTrainsAt(mt)` every line's trains (the Loop's rows exactly
  `trainsAt`'s, with `line`), `stopTimetable`, `nextArrivalAt`, `stationName`.
- **Networks** (`sim.NET`): 2 = the Loop and the pods (layout 2), 3 = the rail lines. A trip
  between two Loop districts is the Loop's on every network. On network 3 a trip touching any
  other district is planned over every line in service (`railRoute`: on foot to a stop of its
  district or within 14 cells, ride, alight, on foot to another line's platform at an interchange
  within 18 cells, ride, ...; or all the way on foot when that is quicker), each ride's train
  caught in turn (`railTrip`: the connection it makes is the one recorded).
- **Plan format** (still format 1): flag 32 marks a trip built on network 3; with 8 it is all the
  way on foot, else its extras are one group per ride `[line, a, b, k, car, board]`. A trip without
  32 is the Loop's as before, so every published plan decodes unchanged, and a day built on
  network 2 keeps its pods (`net: 2` on its decoded trips).
- **whereAt** on a rail trip: walking (dir `out`), waiting / riding / alighting per ride (with
  `line`, the stop as `stationId`), walking between rides (dir `xfer`: down the stairs, the street,
  up to the next platform), walking home (dir `in`); every walk paced to fit the plan's own times.
- **Checked identical** (`check-plans` section 7, and a one-off comparison against commit 44f1b9c):
  plans built by the new code are byte-identical to the old at 430 and 1,500 subjects over two
  days, whereAt and trainsAt too; a network-2 day built by 44f1b9c (`fixtures/net2-plan-day300.json`)
  keeps every rider's train, car and place aboard, and every platform, minute by minute.

Step 2, THE SHORE LINE and THE ALPINE LINE (rail in place of the pods), layout 3:

- **THE SHORE LINE** (line 1, `S1`-`S6`, teal): its WORKS terminal in the gutter between the Works and
  the Sprawl (a stub off the Loop's Works station, 12 cells' walk), south down the gutter, round a
  corner into the street behind the Coast, west: COAST CENTRAL (x 45.5), COAST WEST (the terminal,
  x 19). **THE ALPINE LINE** (line 2, `A1`-`A6`, red): its CAMPUS terminal in the gutter between
  Campus and Finance, north through a cleared right of way in the foothills (FOOTHILLS), the
  village's gap (HEIGHTS VILLAGE), and up the mountain on a ramp to the crest (SUMMIT, the deck
  level at the crest's height, 3.9 storeys). Six trains of three cars each, 3 machine minutes'
  layover at a terminal; lap 24 minutes, a train every 4. A terminal's stairs run toward the stub's
  end (the way to the interchange).
- **Layout 3**: the Coast three more rows south (`COAST_DY` 12) for the Shore Line's double deck and
  its platforms in the street between the belt and the seaside rows. Published days keep their
  segments and pods and are drawn on the new ground (the master plan's rule).
- **Network 3** (`NET`): every day built from this deploy on. A trip touching the Coast or the
  Heights rides the lines (or the Loop: from the Heights' west end the Arts and Campus stations are a
  walk through the foothills; any station within 32 cells is in reach), or walks all the way. A day
  built on network 2 keeps its pods (`check-plans`: its every train, car and platform unchanged).
- **Drawn** (`lineGeo.js`, `CityIso.jsx`): each line's double-track viaduct in the Loop's concrete
  with its colour on the fascia, closing to one track over each terminal's stub; piers; a platform,
  canopy and stairs per track; cars by their bogies, the line's stripe, riders in the windows. Over
  the foothills (open ground) the deck is slotted after the ground like a walker on it; on the
  mountain the mountain paints it (`coastDraw.js` `G.extra`), cell by cell, so a ridge hides it at
  every quarter turn. The 2D map draws each line, its stations and its cars. DRIVE YOURSELF climbs to,
  waits on, boards and alights at every line's platforms (`control.js` `stationGeoOf` is any stop's).
  The 3D view draws the Loop's trains; a rider on another line is drawn at its car's place.
- **Measured** (synthetic census, machine day 300; machine minutes in transit a day, base 44f1b9c ->
  step 2): THE BUNKHOUSE 252 -> 206 (725), 249 -> 203 (2,000), 252 -> 210 (5,000); THE SEAWALL ESTATE
  194 -> 182, 197 -> 184, 203 -> 188; the lowest tier band 199 -> 182, 198 -> 182, 204 -> 187. The
  pods had no wait, so the homes nearest the old pod terminal lost: SEAVIEW FLATS 197 -> 221 (725),
  193 -> 211 (5,000), THE SURFSIDE 180 -> 225, 182 -> 222 (its 96 homes are 17 cells from Coast
  Central). Busiest car at 5,000: Shore 17 seated-equivalents, Alpine 9 (cars of 16); the Loop's
  busiest is 69 (unchanged by the lines, and its own capacity question). Plan build at 430: 0.34 s
  -> 0.63 s; plan 106 -> 131 KB.


Step 3, THE PORT, THE OLD TOWN and THE WEST LINE (layout 4, network 4):

- **THE PORT** (`port`, 0xCF00, x -58..-8, y 30..102; the sea runs on west under its quay): the
  CONTAINER QUAY (stacks, two ship-to-shore gantries, a container ship at the berth), THE SHIPYARD
  (the fabrication shed, a hull on the slipway, a tower crane), the CUSTOMS HOUSE (portico, clock
  tower), the BONDED WAREHOUSE, THE CHANDLERY (shops under flats), THE ANCHOR (the dockers' pub);
  heavy industry moved here from the Works: the FOUNDRY and the RECLAMATION LINE (ids kept,
  `sim.MOVED_FROM`), twenty rows south of the nearest home, PORT PARK (the green buffer) between.
  Worker housing round PORT TOWN station: TENEMENT ROWS A-D (110 each, tiers 3-5), DOCKERS' and
  PILOTS' TERRACES (80 each, tiers 1-2). Jobs: stevedores, crane operators, shipwrights, customs
  officers, bonded clerks, the chandler, the publican (and the foundry's and the line's, moved).
- **THE OLD TOWN** (`oldtown`, 0xD100, x -52..-6, y -16..26): the CATHEDRAL OF THE FIRST UPLOAD
  (nave, transepts, the west front's towers, the crossing spire), CATHEDRAL SQUARE, the MUSEUM OF
  THE CITY (portico and dome), THE COVERED MARKET (a barrel vault, the stalls), THE OLD BELL (a
  tavern), THE BOWLING GREEN, THE CLOSE (a lawn between the rows); brownstone rows (CANAL, CHAPEL,
  BELL, GUILD: 140 each) and shops under flats (THE HIGH STREET, MARKET ROW: 60 flats each, shops
  below), CATHEDRAL WALK-UPS (60): tiers 1-2. Jobs: vergers, market traders, museum guides,
  shopkeepers, the publican.
- **The Works keeps light industry**: THE WORKSHOPS and the PARTS DEPOT where the foundry and the
  reclamation line stood; THE PIT stays.
- **THE WEST LINE** (line 4, `W1`-`W6`, purple): its ARENA terminal just west of the Loop's Arena
  station (a four-cell walk), west along the street between the Old Town and the Port, north up
  x -24 (OLD TOWN CATHEDRAL), west along y 2 to OLD TOWN MARKET (the Farmland later: a new version).
  **THE SHORE LINE version 2** (line 3, `S7`-`S14`): on past Coast West to PORT QUAY and north to PORT
  TOWN. Version 1 (line 1) is `retired` from network 4 and still decodes every day published on
  network 3 (`check-plans`: a network-3 day built by 5218e14 keeps every train, car and platform).
- **The day boundary**: a trip published before the move to or from the foundry or the reclamation
  line rode the Loop from the Works: it is read with its old district (`MOVED_FROM`), walked at the
  pace that fits its times (`check-planner` holds it apart: at most 40 cells a machine minute, never
  a jump); a walk built since to or from a moved place carries plan flag 8 | 32.
- **Drawn** (`westGeo.js` massing, `westDraw.js` facades and the quay's gantries, ship, hull and
  crane, the berth's water and the slipway): styles tenement, terrace, walkup, shopflats, tavern,
  customs, museum, cathedral, covered, quay, shipyard; the open lots port-park, cathedral-square,
  bowling-green, the-close. The 3D view's `SPAN` grew to 100 so the whole city fits at rest.
- **Not yet**: the Port's and the Old Town's PREFECTS (each needs its own look and voice: TODO;
  the fold, the patrol and the panels skip a district without one; `check-prefects` names them).
- **Measured** (synthetic census, machine day 300). Homes 1,902 -> 3,242 (+600 the Port, +740 the Old
  Town). Crowding, the ten core districts' factors summed (all fourteen in brackets): 725 -1 -> -1;
  2,000 -47 -> -20 (-53 -> -27); 5,000 -166 -> -114 (-208 -> -176). Machine minutes in transit a day,
  step 2 -> step 3: THE BUNKHOUSE 203 -> 264 (2,000), 210 -> 249 (5,000), because its PROCESSING-grade
  workers now ride to the reclamation line in the Port; THE SEAWALL 184 -> 192, 188 -> 199; the
  lowest band 182 -> 199, 187 -> 201 (base 44f1b9c: 198, 204). The Port's own homes sit 8-12 cells
  from Port Town, the Old Town's 4-12 from its two stations.

THE CENTRAL LINE through the monolith (Scott 2026-09-30: "it would make sense for the train to
run through the central building"; and the monolith stays where it is). DEPT HQ's monolith stands in
the centre of its plaza as it always did; a portal now runs through its short axis between two
narrow legs, the tower standing on them from above the canopy (3 storeys) to the roof, the eye band
still sweeping at 9.4 over the portal. THE CENTRAL LINE (line 5, `C1`-`C4`, yellow, two-car trains,
a train every 3.7 machine minutes; network 5) runs across the core on the city's axis (x 54.5),
inside the ring: HQ NORTH (beside the Loop's DEPT HQ station, the Alpine Line's Campus terminal across
the street), DEPT HQ CENTRAL (its platforms under the tower), HQ SOUTH (beside the Shore Line's Works
terminal, under the Loop). The Heights and the Coast meet through the core instead of riding round
the ring (at 2,000 subjects it carries 392 rides a day). The Loop, its stations and its timetable are
untouched; the HQ lot is the sim's and stays; DEPT HQ's plaza is crossed on foot (`sim.WALK_BLOCK`:
only the monolith is solid). Painter: the west leg is HQ's body item (a deck under the tower), the
east leg an item of its own, the tower (`archGeo.towerItems`) slotted after every deck and car under
it (iso.slotForBox at the soffit) and drawn after the trains of its slot; `drawBody(..., only)` draws
a building's parts by segment. DRIVE YOURSELF holds the legs solid. `check-cityview`: the monolith
stands in its own plaza, the tower over DEPT HQ CENTRAL, the soffit clears the canopy, the legs clear
the line's deck, platforms and stairs, and every Central Line car wholly under the tower paints
before it at all four turns (a car half out of the portal is drawn over the tower's end face). The
junctions are interchanges on foot (HQ NORTH to the Loop's DEPT HQ station 1.5 cells; HQ SOUTH to
the Shore Line 5); the Central Line does not share the Loop's track.

Screens (PHASE 2): docs/screens/phase2/ (production whole city at the four quarter turns and at 390;
the Port, the Old Town, the Shore Line, the Alpine Line and the monolith with the Central Line, by day
and by night, at 1440 and 390, from the dev build of the same commit).

THE MONOLITH ON THE LINE (Scott 2026-09-30: "it would make sense for the train to run through the
central building"). DEPT HQ's tower now stands over the Loop at the DEPT HQ station: a black slab
15 cells long over the viaduct, its soffit at 3 storeys (over the platform's canopy), pylons at its
north corners beside the deck, the concourse wall on the plaza side (DEPT HQ // THE LOOP STOPS HERE,
the door), the eye band still sweeping at 9.4. The trains run through the portal under it. Nothing
in the sim moved: the track, the station, its gate, the timetable, the HQ lot and every published
day are exactly as they were; only the massing (`archGeo.js` monolith: `seg` base / pylon / tower,
`m.solid` the concourse) and the painter: the concourse is HQ's body item (a deck under the tower),
each pylon an item of its own, the tower (`towerItems`) slotted after every deck and car under it
(iso.slotForBox at its soffit) and drawn after the trains of its slot; `drawBody(..., only)` draws a
building's parts by segment. DRIVE YOURSELF holds the concourse and the pylons solid (the station's
stairs come down beside them). `check-cityview`: the tower covers the platform, the soffit clears
the canopy, the concourse and pylons clear the viaduct, and every car wholly under the tower paints
before it at all four turns (a car half out of the portal is drawn over the tower's end face).
THE LOOP'S VERSION 2 (capacity; network 6). At 5,000 subjects version 1's busiest car carried 43-57
riders over a machine week (days 300-306, synthetic census, `scripts/bench-phase2.mjs`: exact loads
from each plan's rides) against the 1.5x-seated limit of 24.

- **More trains, never a retiming** (`sim.js` `LOOP_VERSION` 2): version 1's five trains (L1-L5: 4, 3,
  4, 4, 3 cars) keep their ids, indices (a published plan's `k`), cars and offsets to the last bit
  (`k x LAP / 5`); in each gap between two of them two new four-car trains (L6-L15). So every train of
  every day published on version 1 runs where it always ran and is drawn there, and the new ones run
  empty through those days. The first day built after the deploy is the first planned on version 2.
  `check-plans` holds a network-5 day built by b54a241 (`fixtures/net5-plan-day300.json`: every
  rider's train, car and place aboard, minute by minute) and version 1's five against version 1's own
  timetable formula at 2,000 instants.
- **Sized by the plan builder's car counts.** A train carries whoever reached the platforms since the
  one before it, so each new slot is sized to the cars of the train it brings in: the gap ahead of a
  three-car train is the shorter (2.58 machine minutes, against 2.99 and 2.85), never so short that a
  train reaches a platform before the one ahead has cleared it (`LOOP_CLEAR` 1.1 cells; the dwell and
  the train lengths bound the Loop at three trains per version-1 gap). `HEADWAY` is the longest wait
  (3.0 min, was 8.6); `LOOP_GAPS` the range.
- **Network 6: every trip over every line.** Until network 5 a trip between two Loop districts always
  rode the Loop, the long way round a one-way ring if need be; from 6 it is planned like any other
  (`railRoute`: the Loop, the Central Line, a walk, whichever is quickest), flag 32 in the plan.
- **Routing at scale.** `railRoute` reads the network as a graph built once per network (from boarding
  at each stop, the quickest way to alight at every other, with the path), and `footpath` tests only the
  blocks near a leg (a grid) and only the corners that could matter (checked identical to the old search
  on 3,000 walks). Plan build at 5,000: 19 s -> 8 s; at 725: 2.8 s -> 1.2 s.
- **Measured** (5,000, synthetic census, busiest car of the day, `scripts/bench-phase2.mjs`): the Loop
  43-51 (days 300-302, version 1) -> 17-24 (days 300-306, version 2), under the 1.5x-seated limit of 24
  every day. With the Loop relieved the other lines, days 300-306: the Shore Line 22-29 (its next
  version is the next capacity step), the Central Line 11-16, the Alpine Line 9-14, the West Line 7-9.
  Machine minutes in transit a day by tier band (top, middle, lowest): 210-218, 215-219, 197-200. Plan
  about 1,500 KB; build about 3 s.

## THE MALL: emergent small business (2026-09-30)

Scott: "if people get dissatisfied with their jobs, they should try to open their own businesses...
Shaun White would be the perfect guy to start a ski shop / snowboard shop at the foot of the
mountain." ROADMAP b1c. Code: `src/city/enterprise.js` (the rules, pure), `storefrontSim.js` (the
units and the landmarks as city data, spread into `sim.js` like the funnels), `storefrontGeo.js` /
`storefrontDraw.js` (massing and drawing), `storefrontProps.js` (the rooms), `enterpriseClient.js`
(the browser's reading), `EnterprisePanel.jsx` (the BUSINESS card, the register, the file's line).
Hooks: `sim.js` (places/buildings/jobs spread; FRONTAGE lots laid out apart from the district's grid;
`setEnterprise`: a storefront worker's job and the shops' pull on leisure, per day), `plans.js` (the
step before each day is built; `ent` in the plan; the summary's block; satisfaction beside the
window rows; the `ent/latest` ledger), `civic.js` (the mood factor and the shops per district),
`CityIso.jsx` (labels, the BUSINESS button, the tram car), `City.jsx` (PA, page, card host, file line),
`planClient.js` (satisfaction rows), `props.js`, `archGeo.js`, `archDraw.js`. Check: `scripts/check-enterprise.mjs`.

- **SATISFACTION**, per subject per machine day, from that day's plan: 52 + FIT (the job's fields
  against the record, -14 + 26 x field match + 6 x dimension match, -6 when the record fits nothing
  about the post; drafted labour -9 + 8 x dimension match; -20..20) + PAY (the rung: -10..10;
  PROCESSING -16) + COMMUTE (hours in transit on a working day past 2.5, x5, to -15) + MOOD (the work
  district's crowding, tier mix and housing, the civic fold's own measures, /4, -8..8) + FRIENDS AT WORK
  (coworkers met off shift that day: none -2, else 3 + 2 each to 10); 0..100. The words: the worst
  factor names it ("SATISFACTION: 34 // MISFILED. THE DEPARTMENT IS AWARE."). Shown on the subject's
  file (`EnterpriseLine`), from `[s, fit, pay, commute, mood, friends, flags]` beside each window row
  (the figures on file's in `summary.sat`). A rest day is not counted.
- **OPENING.** An entrepreneur: living, not a citizen (players are never moved by the sim), not
  PROCESSING grade, and a record in business / finance / management (>= 5), or competence >= 70,
  network >= 65 and adaptability >= 70, or a record that fits a trade. Under 35 on a working day
  counts one; 35-44 holds the count; 45+ clears it. At 7 the subject QUITS and opens; the longest
  counts first, at most 2 a day, one business each, cooldown 14 days after a closure. The trade:
  a name the Department knows (`HINT_TYPE`: Shaun White ski, Kelly Slater surf, Tony Hawk skate,
  Gordon Ramsay restaurant, Rick Rubin records, Ronnie Fieg sneakers, Criss Angel magic, Stephen
  King books, the Coppolas wine...), else the strongest trade field (music records/venue,
  hospitality restaurant/bakery, visual gallery, writing books, screen video/comedy, sport sporting
  goods/gym, combat gym, computing/engineering repair, finance pawn, farming grocer...), else the top
  public dimension (physical gym, care cafe, network restaurant, utility repair...). 25 trades, each
  with the districts it suits; the unit: a vacant one in the first suiting district (ski only at the
  Heights, surf only on the Coast), else the busiest vacant one. Named in the Overlord's voice:
  surname + the trade's line + its last word ("WHITE'S. SKI. SNOWBOARD. NO REFUNDS.").
- **STAFF.** One hand on opening, from the subjects under 50 yesterday who suit the trade best;
  another after 4 good days (profit > 20), to 3. Their work moves to the shop (the plan says so);
  nobody is an owner or a hand twice.
- **TRADE.** Customers are the sim's own leisure visits: each trading unit takes ~3% of a subject's
  leisure weight x (0.4 + their liking for the trade) x the district's foot traffic, only while it is
  open (day trades 9-19, evening 12-24). Takings = yesterday's visits x price x fit (1 in a suiting
  district, 0.7 elsewhere; x 0.8-1.2 by how well the owner knows the trade); costs = rent (Strip 60,
  Coast/Heights 48, Campus 45, Commons 30, Sprawl 24) + 16 a hand. 5 losing days of the last 7:
  CLOSED (the owner and hands back to their assigned posts the same day; the unit shows CLOSED.
  THE DEPARTMENT EXPECTED THIS., then TO LET; re-let from 2 days later). 8 good days: a SECOND
  LOCATION in a suiting vacant unit.
- **LICENCE 0001.** Shaun White is on the live census (a referral, no occupation, competence 68,
  network 62, adaptability 72): he qualifies by name (a record that fits a trade), but the rules
  need 7 counted days and he would not have been first, so the first day built after the deploy
  grants DEPARTMENT LICENSE 0001 to him, once: WHITE'S at BASE PARADE, UNIT 4 (nearest the lifts and
  the Alpine Line). The grant is on his business file; every later licence follows the rules.
- **THE STOREFRONTS** (24 units, each a one-room building on a FRONTAGE lot clear of everything
  standing): the Heights' BASE PARADE (4, between ALPINE FLATS and the Alpine Line), the Coast's
  BOARDWALK EAST (4, a new row east of the pier, each lot running down over its boards), STRIP
  FRONTAGE (4) and COLLEGE ROW (4) on the north edge of the Strip and Campus, COMMONS PARADE (3) and
  ESTATE PARADE (5) on the Loop's street. A unit TO LET takes nobody and no overflow.
- **THE LANDMARKS** (never owned, never close): SAM'S PIZZA at the head of the east boardwalk (an
  affectionate homage to the Wildwood boardwalk institution: the counter open to the boards, slices
  in the window, the sign on the roof, the heat shimmering off the ovens, stools on the boards;
  Pizza Counter Hands drafted, 5) and GOODNIGHT IRENE'S on the corner at the row's east end (homage to
  the Wildwood brewpub, its palette from the specials archive: #8c1622, #a3a028, #f7f5ec; the long
  bar, the copper tanks upstairs, the neon, the patio under string lights; bartenders and a brewer;
  live music Thursday to Saturday nights, a fixture that pulls the crowd). No menus, no prices, no
  claims. THE TRAM CAR runs the old boardwalk end to end (drawn only); the PA: "WATCH THE TRAM CAR, PLEASE."
- **In the record.** The state rides each format-1 plan as `ent` (businesses, the closed list, the
  counts, cooldowns, vacancies, licences), stepped from yesterday's plan before the day is built; a
  published day never changes. `ent/latest` keeps the register across a gap in the plans (no trade is
  counted for days missed). `summary.enterprise` = `publicBlock`: the 24 units, the open businesses
  (owner, trade, staff, takings, profit, visits, status), the last 12 closures, the day's events
  (~8 KB at 24 open, the same at any census size). The civic fold: `mood.f.enterprise` (a thriving
  shop +2, an open one +1, a closure in the last 3 days -3; -6..6) and `biz: {open, closed}`.
- **In the city.** The shopfronts: the trade's awning, a window dressed for the trade (boards, gear,
  plates, sleeves, frames, spines, rails, gadgets, bottles, goods), the name on the fascia and on a
  board on the roof, OPEN/CLOSED in the door by the hour; the room: a counter and the trade's racks
  (`shop-<group>`), the bill TO LET in an empty one. Labels name the business. Tap a storefront:
  BUSINESS opens its file (owner, trade, licence, opened, premises, staff, takings trend, profit,
  foot traffic, status); a landmark: LANDMARK. `#enterprise` (and `#city/enterprise`): THE SMALL
  BUSINESS REGISTER (open, newest openings, closures, TO LET, the landmarks, the rules). The PA
  every fifth line: openings ("NOW OPEN: ... HAS QUIT AS ... THE DEPARTMENT HAS NOTED THE
  INITIATIVE."), closures, hires, second locations, the thriving and the struggling.
- **Measured** (the live census of 667 + the figures on file, 30 machine days from scratch): mean
  satisfaction 44, about a fifth of working subjects under 35; the first organic openings on day 8,
  every unit let by day 20, closures from day 14 (a churn of about one a day after that).

## THE MOUNTAIN: the Heights to the summit (2026-09-30)

Scott: "mountains can be very tall; Killington is over 4,000 feet; many trails that wind and
intersect, some much more difficult; some have slalom gates for competition; a lodge at the bottom;
render the whole mountain up to the top; at least one lodge up there too." Code: `src/city/mountainSim.js`
(places, bands, jobs, leisure, the race fixture: spread into `sim.js` like the venues),
`mountainGeo.js` (the terrain, trails, lifts, lodges, gates, park, guns, cats, weather and status,
the network and every skier's place at a machine moment; pure), `mountainDraw.js` (the iso painter),
`race.js` (THE WEEKEND RACE; pure), `trailMap.js` + `HeightsPage.jsx` (`#heights`). Hooks:
`coastGeo.js` (TERRAIN / terrainH are the mountain's; the bands are coast lots), `coastDraw.js` (every
mountain lot, the parcel's ground too, painted by `drawMountainBand`), `archGeo.js` (a band's box is
as tall as its ground), `iso.js` (`cityExtent` takes in the summit; `hiddenByTerrain`), `CityIso.jsx`
(the crowd once a frame, labels the mountain hides left off, the racer, the board), `City.jsx` (PA,
the page), `props.js` (room types). Check: `scripts/check-mountain.mjs`.

- **Scale.** A storey is the city's: the Meridian is 14. PEAK PERFORMANCE stands 50 storeys over the
  village (4,370 FT on the board, the village 1,165 FT: 3,200 FT of vertical at 64 feet a storey);
  MIDDLE MANAGEMENT (the east peak) 43, THE GLASS CEILING (the west shoulder) 32. Tree line 30.
- **The ground.** The Heights runs on north to row -125 and wider (x -5 to 112). One heightfield:
  flat at the village's back (y -21), THE SLOPES' gentle apron (the learners' ground, x 9-100 as
  before), then the massif: the crest from the west shoulder over the summit and a col to the east
  peak, three spurs south off it, the bowl under the summit and the col, gullies (faded near the
  crests, so every ridge climbs to its peak), the north face falling away, the flanks easing out to
  the district's edges. Graded benches under the summit lodge, the mid-mountain lodge and THE UPPER
  BASE. THE ALPINE LINE (the PHASE 2 agent's, untouched) climbs a cut up x 54.5: the ground under its
  deck stays at most 0.35 storeys under the deck's base (`ALPINE`, held by check-mountain against
  `lineGeo.baseAt`).
- **The bands** (sim buildings, open ground, painted by the mountain): THE SLOPES (unchanged rect, now
  open ground), PARCEL 0xBE06 (unchanged, still THE ASSEMBLY's; its faces draw on the new ground),
  THE UPPER MOUNTAIN (y -58..-40.5: the upper trails, THE RACE COURSE), THE MID-MOUNTAIN LODGE
  (-82..-58), THE SUMMIT LODGE (-125..-82). A building with a lot is now its lot (identical for every
  other building); the mountain's places arrive at their own spots (`MOUNTAIN_SPOTS`): THE UPPER
  BASE by the Alpine Line's SUMMIT, the race's finish, the lodges' doors, the patrol hut.
- **Places and jobs.** `upper-mountain` (36), `race-course` (30), `mid-lodge` (40), `summit-lodge`
  (36), `summit-patrol` (8); Summit Patrol, Summit Bartender, Summit Lodge Cook, Mid-Mountain Cook,
  Night Groomer, Snowmaker, Race Official. The lodges are buildings with floors (THE CAFETERIA, THE SUN
  DECK; THE SUMMIT BAR, THE OBSERVATION DECK, THE PATROL HUT): their cutaways open.
- **Trails** (21): GREEN CIRCLE: COMPLIANCE, ORIENTATION, THE PAPER TRAIL (cat track from the summit),
  THE GRACE PERIOD, THE COOL-DOWN. BLUE SQUARE: THE PERFORMANCE REVIEW, QUARTERLY TARGETS, MANDATORY FUN,
  OPEN DOOR POLICY, CORE COMPETENCY, THE LONG MEMO, THE SANDBOX (terrain park: kickers, rails, THE
  PIPELINE halfpipe). BLACK DIAMOND: THE AUDIT, HOSTILE TAKEOVER (moguls), DOWNSIZING, ZERO TOLERANCE
  (moguls), THE REDACTED WOODS (glades), THE GAUNTLET (the race course, gates). DOUBLE BLACK:
  TERMINATION GLADES, EXIT INTERVIEW, NON-COMPLIANCE CHUTES. Each runs from a lift's top to a lift's
  foot, the base, or into another trail; they wind (Catmull-Rom through their control points) and
  cross. Drawn as groomed ribbons through the forest, each piece painted after the ground under it;
  the rating's colour faint down the middle, signs at the heads, corduroy and moguls up close.
- **Lifts** (7): THE ASCENT (gondola, base to the summit lodge, a mid-station at THE UPPER BASE), THE
  INDUCTION, THE COMPLIANCE EXPRESS (to the mid-mountain lodge), THE STARTING GATE (the race course),
  THE PROMOTION (to MIDDLE MANAGEMENT), THE ESCALATION (out of the bowl to the col), THE HEADCOUNT (to
  THE GLASS CEILING). Cars by machine time (every viewer the same), parked out of hours; towers stand
  between the trails; the upper lifts close at 16:00-16:30, the lower run under the lights to 21:00.
- **Weather and status** (`weatherOn(day)`): CLEAR, FRESH SNOW, WIND (the gondola and the summit chairs
  on hold), WHITEOUT (the upper mountain closed), COLD (the guns run all night). A trail is open when
  the lift that feeds it runs; at night they close for GROOMING: three cats work their rounds 21:30-
  06:30 with their headlamps; the guns blow at night.
- **Skiers.** Whoever the plan puts at `slopes`, `upper-mountain` or `race-course` skis: from their
  home (the base, THE UPPER BASE, the finish) a cycle of walk, queue, ride (the very car the lift is
  carrying), the trails down, picked by hash among the open trails within their rating (`skiSkill`:
  0.4 physical + 0.3 adaptability + 0.3 competence, +20 for a skier or boarder on file; greens under 40,
  blues, blacks from 62, doubles from 78); boarders by hash (Shaun White always). A rider beyond their
  comfort may stumble (the rig's `stumble`, non-graphic). Ski patrol on duty ski the mountain with the
  cross on their jacket; lift crews, instructors and race officials stand at their posts.
- **THE WEEKEND RACE** (`race.js`): Saturdays 13:00-15:00, SLALOM one week, GIANT SLALOM the next, on
  THE GAUNTLET (start house, gates, finish arch, the board at the finish and at the base). The field:
  the skiers and boarders on file first (Shaun White on his board, Tenzing Norgay), then the athletes
  on file the Department enters (12, ratings from their records); Lindsey Vonn, Mikaela Shiffrin and
  the rest of `SKI_ON_FILE` join when they are on file. Two runs, run 2 in reverse order; time = par x
  (1 + (100 - rating)/180) x the day's form x the run's luck; a straddled gate is DNF. The racer on the
  course is drawn by projection with a bib, the race course's visitors line it, the PA calls every
  start and finish and the result. THE MOUNTAIN STANDINGS: World Cup points over the leagues' season.
  The Departmental Cup: `leagues.cupTable` takes fixed kinds, so the hook is documented
  (`race.CUP_HOOK`, `raceTop3`) and scores nothing until a directive sets `from`; no published table
  changes.
- **`#heights`**: the trail map (the mountain drawn at a fixed turn, trails in their colours, the
  double blacks dashed, glades dotted, lifts, lodges, peaks with their elevations, what the mountain
  hides from that side left off), trail status, lifts, lodges, the race (live, or the last), the
  standings.
- **The painter.** Each band paints its share back to front by u + v: ground cells (culled to what the
  screen can show; LOD by zoom: 2.6, 1.5, 1 cell), trail pieces after the ground under them, pines
  (bucketed), towers, rope lengths, cars, lodges, stations, gates, the park, guns, cats, people. A
  label whose anchor the mountain hides at the current turn is left off (`iso.hiddenByTerrain`).
- **Day boundary.** Published days keep their places; the first day built after the deploy is the
  first with anyone on the upper mountain. No layout or network change: every id, the Loop and the
  lines are as they were.
- **The flanks and the Base Parade.** The district's strips beside THE SLOPES and the parcel (x -4..9,
  100..111, up to the village's back) are laid as flat snow with the district floor
  (`drawMountainApron`). The Base Parade (x 37-51, y -18) stays behind the Finance towers
  from the default NW camera: it sits on the village's flat floor, and no terrain short of lifting the
  storefronts ten storeys clears the towers, so the storefronts are seen from the NE and SW turns
  and up close. Screens: `docs/screens/mountain/` (live = production; night = the same build, `?at=21:30`).

## THE NIGHTLIFE QUARTERS (2026-09-30)

Scott: "nightclubs in a downtown district, more than one; the one near FINANCE higher end (plus
higher-end restaurants); the one in the LOWER-INCOME district more clubs, dance clubs, other kinds of
clubs, liquor stores." Placement and its reasons: docs/planning/MASTER_PLAN.md, addendum. Code:
`src/city/nightlifeSim.js` (the districts, venues, hours, staff, tier weights, the rope, the lineups;
pure data and functions, spread into `sim.js` like the venues and the Mall), `nightlife.js` (the
civic factor, the PA, the label), `nightlifeGeo.js` / `nightlifeDraw.js` (massing and drawing),
`nightlifeProps.js` (the rooms), `nightlifePrefects.js` (the two prefects). Hooks: `sim.js` (spreads;
the night out and the booked sets in `planStops`; a venue's hours in `pickLeisure`, the overflow chain
and `planDay`), `archGeo.js` / `archDraw.js` (styles, materials, ground, yard), `props.js` (rooms),
`civic.js` (the factor; `dayStats` exposes its per-place load), `prefects.js` (`nightPressure` in the
directive), `prefectData.js` / `prefectDraw.js` (two prefects: heads, uniforms, props), `CityIso.jsx`
(ground colours, the label), `City.jsx` (the PA). Check: `scripts/check-nightlife.mjs`.

- **UPTOWN** (`uptown`, 0xE100, x 113-125, y -1 to 27; marble and glass): AURUM (the nightclub: a
  white-marble box under a gold cornice, the glass VIP mezzanine on the roof line, searchlights at
  night; the forecourt: the red carpet, the velvet rope on brass stanchions, the door supervisor, the
  queue along the rope after 22:00; inside, the DJ booth and the floor, and upstairs THE MEZZANINE:
  velvet booths, ice buckets, sparklers, the bottle bar), THE CEILING (a slim glass tower, the lounge
  on its roof: umbrellas, string lights, the skyline behind the bar), THE BITTERS (black marble and
  brass, a deco fin; cocktails, EBTV on a small screen), THE CUT (limestone, an oxblood awning,
  carriage lamps; the grill, white cloths, leather), HINOKI (pale cypress slats, the noren, a gravel
  bed and a pine; the omakase counter), THE MINOR KEY (deco marble, a bulb-edged marquee with
  tonight's bill, a JAZZ blade; the bandstand, the piano, supper tables).
- **DOWNTOWN** (`downtown`, 0xE200, x 113-136, y 28.5-46; brick, murals, roll-down gates): VOLTAGE
  and STROBE (dance clubs: long brick boxes, neon edging, a mural down the flank, crowd barriers and a
  queue, the colour wash and STROBE's flash in the blacked-out glass), THE CYPHER (hip-hop: sooty
  brick, tags, a gate kept a hand's width down), BASEMENT 0x00 (punk: a low front, flyers on every
  wall, the stairs down lit red at punk tempo; inside, the band at floor level and the pit jumping),
  KARAOKE BOX (a pink box, a neon microphone, the lyric bar filling as it is sung), EIGHT BALL (the
  pool hall: green neon, the eight ball on a sign, the tables under their lamps, EBTV over the bar),
  THE HECKLE (comedy: a bulb marquee with tonight's headliner, the brick wall and the spotlight), THE
  COOP (chicken and halal, 24 hours: the red-and-yellow counter and the halal cart at the kerb, its
  umbrella and steam), LIQUOR 24 and CUT-RATE SPIRITS (squat boxes, barred windows, the roll-down
  gate down after hours).
- **No adult venues.** The site is 16+: no strip club, nothing like one, by name, type, engine
  tendency, room or job title. `check-nightlife` refuses any (`FORBIDDEN_TYPES`).
- **Hours** (machine time, `HOURS`): the clubs 22:00-03:00 uptown (the rope closes early) and
  22:00-04:00 downtown (BASEMENT from 21:00); the lounge 17:00-01:00, the bar 17:00-02:00, THE CUT
  17:30-23:30, HINOKI 18:00-23:00, THE MINOR KEY 19:00-01:00; karaoke 20:00-03:00, pool 16:00-03:00,
  comedy 20:00-01:30; THE COOP always; the liquor stores to 02:00. A venue takes visitors only while it
  is open when the visit starts (`pickLeisure`), is no overflow while shut (the allocator's chain), a
  stay ends at closing time, and nobody walks in before the doors (`planDay` holds them at the stay
  before) or sets out for one they would reach at closing.
- **The night out** (`sim.js nightStops`): after a day's stops, a subject may go out (6% a weeknight,
  16% Thursday, 34% Friday, 38% Saturday; night wanderers 1.6x), from 21:54-23:30, to a venue open
  then, picked by tier band and record (`pickNight`; never an errand or a dinner). Half stay to closing
  time (the crowd spills out at 03:00 and 04:00), half leave earlier. Nobody on a night shift goes
  out; a day-shift worker is home by 02:30 (03:30 on Fridays and Saturdays). Stays run past midnight
  into the next day's overnight tail, as night shifts always have.
- **The rope at AURUM** (`ropeCheck`, `sim.ropeOf`): the top band (ESSENTIAL INFRASTRUCTURE and
  RETAINED SPECIALIST) walks in; the middle band waits and is let in about one night in three; the
  lowest is turned away and goes elsewhere. The mezzanine is the top band's alone, and neither is an
  overflow for anyone the door turns away. The queue on the pavement is drawn from the hour and the
  night of the week; the PA: "AURUM // THE ROPE IS UP. TOP TIERS, PROCEED. RETAINED SPECIALISTS, WAIT.
  EVERYONE ELSE: DOWNTOWN IS THAT WAY."
- **Tier skew** (`check-nightlife`, synthetic census of 725, machine days 302-308; bands top /
  middle / lowest): the census 31% / 47% / 22%; uptown's patrons 69% / 30% / 1% (762 visits);
  downtown's 10% / 59% / 31% (1,022 visits). The rope on a Friday: 223 walk in, 102 wait and are let
  in, 400 turned away.
- **The lineups** (`lineupFor(day)`, pure): performers on file (by field, music or comedy on the
  record; the census's referrals by name; the living and the dead alike) booked into eight sets a
  night (AURUM's decks 23:00, THE MINOR KEY's bandstand 20:30, THE HECKLE 21:00, THE CYPHER's mic 23:30,
  VOLTAGE and STROBE's decks, BASEMENT's stage 22:30, an acoustic set on THE CEILING's roof 21:00), the
  headline rooms first, nobody in two rooms, one room in five dark a night, every name coming round in
  turn. A booked performer works the set (a work stop at the venue; the evening before kept clear: a
  ride across the city can take two hours); the set pulls a crowd like a fixture; the PA: "TONIGHT AT
  THE MINOR KEY: STING, AT THE BANDSTAND, 20:30. ATTENDANCE IS RECORDED. ENJOYMENT IS ESTIMATED." and
  "NOW AT AURUM: PRINCE ON THE DECKS."; the marquees and AURUM's board show the name. Night 306:
  PRINCE on AURUM's decks, STING at THE MINOR KEY, JIM JEFFERIES at THE HECKLE, TRAVIS SCOTT at THE
  CYPHER, JOHN OATES at STROBE, JACK WHITE at BASEMENT 0x00. The field rules gain the bassist and the DJ
  (music) and the comedian (a `comedy` field).
- **Staff**: Door Supervisor, Bottle Service Host, Rooftop Lounge Attendant, Mixologist, Steakhouse
  Chef, Itamae, Supper Club Waiter (uptown); club bartenders, the Cypher's floor host, Door and Sound,
  Karaoke Host, Pool Hall Attendant, Comedy Club Door, Fry Cook, two Liquor Clerks (downtown): a few
  each (draft caps), club staff on the night shift.
- **Life**: the rig dances (`dance`, `dance2`) on the floors, the pit jumps, the karaoke room cheers and
  claps, the comedy room laughs; neon buzzes and flickers by the house rule, the bass throbs on the
  pavement in front of an open club at 124 to the minute, the mirror ball's flecks and the beams sweep
  inside, STROBE flashes, AURUM's searchlights cross over the Strip.
- **The prefects**: UPT-13 THE MAITRE D' (a silver cloche head, a cream dinner jacket, the guest
  list: lenient on capital, festivals and decrees first) and DWN-14 THE LICENSING OFFICER (a
  loudspeaker horn, a hi-vis tabard, the sound meter: curfews and inspections first). `prefects.js`
  adds `nightPressure` to every prefect's target control: downtown +0.5 (+0.9 on Fridays, +1.4 on
  Saturdays), uptown -0.3, everyone else 0. On a calm district's mood, downtown's Fridays draw
  INSPECTIONS and its Saturdays the CURFEW (from 22:00: the clubs may stay open, the street may not);
  uptown's days draw festival permits and decrees.
- **The civic fold**: a new mood factor `nightlife` (-3..4), from how full the quarter ran 21:00-24:00
  (`civic.js dayStats` keeps its per-place load): a busy quarter cheers its own district (up to +4);
  downtown at a roar costs itself 1 and the Sprawl 1, and the Archive 1 at the very loudest. Absent
  elsewhere.
- **At the day boundary**: the two districts appear in days built after the deploy; days already
  published have no nightlife files and draw nobody there (the Coast's rule).
- Screens: docs/screens/nightlife/.
## PHASE 2 step 4: THE SUBURBS, THE AIRPORT and THE EAST LINE (2026-10-05)

Layout 5, network 7 (docs/planning/MASTER_PLAN.md "PHASE 2" step 4). `src/city/eastSim.js` (the data),
`eastGeo.js` (massing), `eastDraw.js` (facades, ground, the parks, the airfield, the aircraft),
`airport.js` (the flight schedule), `scripts/check-east.mjs`.

- **THE SUBURBS** (`suburbs`, 0xE300, x 140-198, y 30-100), past the nightlife quarters: ten estates
  round three East Line stations. Detached houses round curving cul-de-sacs (MAPLE CLOSE, LARCHMONT,
  BIRCH CRESCENT, ORCHARD WAY, CEDAR LOOP, FOXGLOVE DRIVE: the middle band, tiers 1-2) and starter
  townhouses round shared courts (WILLOW BEND, ASPEN ROW, PRIMROSE COURT, HAWTHORN RISE: the lowest
  band's tier 3 alone, `sim.HOME_ONLY_TIERS`). EASTGATE MALL and its food court, RIDGEMONT HIGH (the
  track, the Friday night game), the clinic; NORTH PARK, THE VILLAGE GREEN and SOUTH PARK (the pond):
  every home within twenty cells of one, within ten (plus half its block) of a platform. 890 homes.
- **THE AIRPORT** (`airport`, 0xE400, x 202-286, y 54-94): jobs and visitors, no homes. THE DEPARTURES
  HALL (the city's door: its toolbar offers ARRIVALS, `#arrivals`), security, the airfield (runway
  09/27 along its north side, the taxiway, four stands), the control tower, the hangars, the airport
  hotel. The aircraft are clock math (`airport.js`): an arrival every half hour 05:00-22:30, in from
  the east and out to the east (never west of the airport: never over the Suburbs or the core), forty
  minutes on the stand, no movements in the curfew; every viewer sees the same aircraft.
- **THE EAST LINE** (`east`, line 6, version 1, nets [7]): ARCHIVE (EAST LINE) in the street between
  Downtown and the Sprawl's north-east corner (an interchange 17.9 cells from the Loop's Archive gate,
  within `XFER_R`), east along y 48.5 (SUBURBS NORTH), south down the street between the estates and
  the mall (SUBURBS MALL), east to SUBURBS SOUTH and AIRPORT TERMINAL at the departures hall's doors.
  Ten three-car trains, a train every 5.1 machine minutes. Published days keep their trains:
  check-plans holds a network-6 day (`fixtures/net6-plan-day300.json`, built by 3d6a2c0).
- **Leisure** at half its listed strength (`EAST_PULL`), as the Port's, the Old Town's and THE MALL's
  landmarks: the roster's haunts stay where friends find each other. The general jobs (the mall, the
  ground crew, the mechanics, the tower) draft a few each, so the core's rooms keep their staff.
- **Estates' doors.** A cul-de-sac's or a court's way in is its street mouth (`massingOf(b).entry`,
  `control.js doorOf`), not a house's front door inside the estate.
- **Measured** (5,000, synthetic census, days 300-302): homes 3,242 -> 4,132; crowding (the civic
  fold's factor, summed) core -98 -> -77, all -152 -> -125; busiest car of the day: the East Line 14-17,
  the Loop 16-19, the Shore Line 20-27, the Central Line 14-15, the Alpine Line 10-12, the West Line 9.
  Plan about 1,600 KB, built in about 4 s.
- The prefects SUB-17 THE COVENANT OFFICER and AIR-18 THE SCREENER take their seats (phase2Prefects.js).

## PHASE 2 step 5: THE FARMLAND, THE ENGINE, THE COMMUNITY FARM (2026-10-05)

Layout 6, network 8 (docs/planning/MASTER_PLAN.md "PHASE 2" step 5). `src/city/farmSim.js` (the data,
both districts), `farmGeo.js` / `farmDraw.js` (the cottages, the manor, the dairy and its cows, the grain
elevator, the fields, the orchards), `civicGeo.js` / `civicDraw.js` (THE COMMUNITY FARM and the garden),
`scripts/check-growth.mjs`.

- **THE FARMLAND** (`farmland`, 0xE500, x -104 to -8, y -76 to -18), north-west behind the Old Town and
  clear of the Heights: the fields (four crops, a tractor working them by the clock), the orchards, the
  dairy and its pasture, the grain elevator by the line, the vet; a market town round FARMLAND MARKET:
  the farmers' market at the station's head, THE PLOUGH, the market green, Grange Row and the manor
  (the middle band), the farmhands' and dairy cottages (tiers 4-5: `HOME_ONLY_TIERS`, tier 3 keeps the
  Suburbs' starter homes). 300 homes.
- **THE ENGINE** (`engine`, 0xE600, x 116-180, y -60 to -8), the second business district: the research
  park, the university annex, the Engine offices, THE UPTIME, the quad, three towers (glass for the top
  band, lofts for the middle, the service floors for the lowest: 540 homes), and the data hall: CACHE FARM
  moved out of the Works with its ids (`MOVED_FROM`; THE TOOL LIBRARY keeps the Works' cell and its
  addresses). The core's styles keep their own footprints, so each lot is sized to its style.
- **THE WEST LINE, version 2** (`west2`, line 7, nets [8]): version 1's stations and route on past OLD
  TOWN MARKET, west out of the Old Town and north up x -56 to FARMLAND MARKET; trains W7-W14. Version 1
  (`west`, nets 4-7, `retired: 8`) keeps running for every day published on it.
- **THE ENGINE SHUTTLE** (`engine`, line 8, nets [8]): STRIP (ENGINE SHUTTLE) in the street east of the
  Strip (an interchange within `XFER_R` of the Loop's Strip gate), north past the Heights' foot (terrain
  0 there), east along y -6, north up x 134 to ENGINE CAMPUS and east along y -40 to ENGINE TOWERS
  between the towers. Eight two-car trains, one every 3.3 machine minutes.
- **THE COMMUNITY FARM.** THE ASSEMBLY's session 001 approved the farm (APPLICATION 002); Scott: the
  winner gets a full-size site in the growth districts. Its parcel (`community-farm`, 30 x 24 cells,
  five times LOT 0x6F07) is a civic lot like 0x6F07 (`sim.farmParcelPhase`): approved, then a site for
  LOT_BUILD machine days from `FARM_PARCEL.breakDay` (hoarding, the crane, a bigger crew, furrows growing
  with the work), then the farm (as many crop beds as fit, the barn and silo at scale, the orchard row,
  the stand, the scarecrow, the tractor), visited like the lot (closed until the site opens). From the day
  it opens LOT 0x6F07 is its smaller companion: THE COMMUNITY GARDEN (`lotPhase(...).garden`: raised
  beds between paths, the tool shed, the water butt, the compost bays, a bench). Had the course won, the
  parcel would stay reserved and the Commons would keep the course.
- **Measured** (5,000, synthetic census, days 300-301): homes 4,132 -> 4,972; crowding core -77 -> -65
  to -62 (all -125 -> -117 to -113); busiest car of the day: the Loop 18-20, the Shore Line 24-25, the
  East Line 13-15, the West Line (v2) 12-14, the Engine Shuttle 12-13, the Central Line 13-14, the Alpine
  Line 8-10. Plan about 1,720 KB, built in about 2.5 s.
- **Checks.** check-growth (43): the land, the bands, the moved data hall, the lines' versions, the
  interchange, the farm's timing and faces, the prefects FRM-19 and ENG-20 live. check-plans holds a
  network-7 day (`fixtures/net7-plan-day300.json`, built by 018ffd3). check-city measures "nearly every
  place gets used" over the production-sized census too (840), and the morning rush as the peak quarter
  in 07:00-07:45 at 1.7x the 06:30 count (the far districts' commuters leave earlier).

Screens (PHASE 2 steps 4-5): docs/screens/phase2b/ (`prod-*`: production, the whole city at the four
quarter turns and at 390, the Farmland and the Engine at 1440 and every new district at 390, with the
prefects on patrol; the rest from the dev build of the same commit: the Suburbs, the Airport, the
Farmland and the Engine by day and by night at 1440, `?at=12:00` / `?at=21:30`).

## PLAYABLE SPORTS (2026-10-05)

Scott: the city's sports should be playable, at NES feel (Tecmo Bowl, NES Tennis), with
controllers. Phase 1 is exhibitions only: no result reaches a league, the ladder, the Cup, a file
or any score.

### Tennis

- **Where**: `#tennis[?vs=<key>][&fmt=short][&court=clay|grass]` (`src/play/tennis/Tennis.jsx`). Entries: the Pit
  panel's TENNIS CLUB line (PLAY AN EXHIBITION), and DRIVE YOURSELF: E inside the club's fence
  (`venueGeo.js TENNIS.fence`) offers PLAY TENNIS: AN EXHIBITION (`controlIso.js`, kind `tennis`).
- **The game**: singles, one end each (you are always the near end; ends do not change), a 256 x 240
  canvas scaled by whole device pixels, behind-the-baseline three-quarter view. A swings (a high ball
  is smashed), B lobs, DOWN + B slices; the d-pad held at contact aims (LEFT / RIGHT the lines, UP
  deep, DOWN short); contact 6-8 frames into the swing is cleanest. Serve: A tosses, A again just
  under the top (the height sets pace and accuracy), LEFT / RIGHT aim; second serves are safer. Lets
  are not called; a net cord is a fault or the point.
- **Scoring** (`score.js`): 15/30/40, deuce and advantage, ONE SET (six by two, a tiebreak to seven
  by two at six-all, its serve order 1-2-2) or FIRST TO 4 (games, no margin, no tiebreak).
- **Opponents** (`roster.js`): the club's tennis players on file (`tennis.js TENNIS_ON_FILE`: Serena
  Williams 98, Venus Williams 93, John McEnroe 92, Arthur Ashe 91; `check-tennis` holds the slugs and
  ratings equal), then THE CLUB PRO (62) and A LINE JUDGE ON A DAY OFF (40). The rating sets the CPU's
  speed, reaction delay, accuracy, power and how often it leaves a ball going out (`cpuProfile`). The
  CPU reads the ball the moment it is struck (plays the flight forward on a copy) and runs to the
  earliest point after the bounce it can reach. The living never speak (a Department line of what
  they do at the start and end); Ashe, dead, has three written lines.
- **Faces**: the head cut from the file photo (`/api/sprite/<slug>`; the regulars and you from the
  procedural photo; your own file's photo and kit when this browser holds a case, else SUBJECT in
  grey); bodies drawn procedurally.
- **Input** (`input.js`): keys (arrows / WASD, Z or J = A, X or K = B, C = challenge, Enter or Esc =
  pause), a pad through `city/gamepad.js` (A, B or the left face button, SELECT to challenge, Start;
  also chooses on the picker and rematches), the pointer (see Mouse and touch below), touch (an
  eight-way pad, A, B, START) on coarse pointers when asked for.
- **Determinism and the record** (`sim.js`): a fixed 60 Hz step, a seeded mulberry32, only + - * /
  and sqrt. A match is `{version, seed, fmt, opp, inputLog, result}` with the human's input one
  bitmask a frame (UP 1, DOWN 2, LEFT 4, RIGHT 8, A 16, B 32), run-length encoded. Pause never reaches
  the sim. At the whistle the browser replays the record and says whether it reproduced; the last
  five records are kept in `localStorage["hvi-tennis-exhibitions"]`. No server endpoint yet: a later
  check can `replay(rec, profileOf(rec.opp))` and compare.
- **Sound** (`audio.js`): WebAudio blips; MUTE kept in `localStorage["hvi-tennis-muted"]`.
- **Check**: `scripts/check-tennis.mjs` (scoring units, purity, a bot's recorded match replayed twice
  to the same result, a doctored log refused, the roster, a stronger CPU beating a weaker one).
- **The event** (2026-10-05, Scott: "more detail, like the actual event"; "we need an umpire"):
  the far stand and both side stands seat a pixel crowd whose heads follow the ball, that claps
  after a point and stands for a game, an ace or a rally of six; sponsor-free boards (THE
  DEPARTMENT OF LEISURE, APPLAUSE IS MONITORED, QUIET, HVI); a grained hard court with wear behind
  the baselines; shadows under everyone. Officials: THE CHAIR (ADJUDICATOR UNIT 40-LOVE, a
  Department official, not a person) on a high chair at the net, its visor's eye scanning with the
  ball, leaning to a lit microphone as it calls ("FIFTEEN-LOVE", "DEUCE", "ADVANTAGE <NAME>",
  "GAME AND SET, <NAME>", "<NAME> TO SERVE. PLAY.") in a speech box on the picture; eight line
  judges who stand and put an arm out for OUT / FAULT (the one nearest the bounce); a net judge
  who raises a hand for NET; four ball kids who run for the dead ball and carry it off.
- **The broadcast** (`show.js`, `gallery.js`, render only): roughly every 3-5 points, between
  points, never in a rally or a serve, the picture cuts to a close-up in the stand: the face from
  its file photo in a seat, doing something (cheer, clap, yawn, hot dog, watch), with a lower
  third ("IN ATTENDANCE: ALBERT EINSTEIN" / "HAS NOT CLAPPED SINCE 1955.") and sometimes THE
  CHAIR itself. A or B (or a tap) returns to the match; CROWD CAMERAS on/off is kept in
  `localStorage["hvi-tennis-cutaways"]`. Who: every figure on file not barred by the park's rule
  (`chess/roster.js barred()`: documented harm, SOYLENT GREEN, threat 80+; copied in gallery.js,
  held equal by the check) plus the club's tennis players not on court today, three times as
  likely. Nobody in the stand speaks or is quoted; spectators who are alive get neutral lines
  about being there; others may get a Department gag, never about how they died (a short list
  gets plain lines only). The match is held during a cutaway (no step, nothing logged) and waits
  for A/B to be let go after one; the broadcast has its own seeded generator and never writes the
  sim, so `check-tennis` plays the same bot match with cutaways on (some skipped) and off and
  requires the same masks, the same final state and the same replay.
- **Controls on screen**: a legend under the court in the hands in use (keyboard keys, the
  connected pad's own glyphs via `gamepad.js GLYPHS`, or the touch pad), with the serve timing
  and aim hints; collapsible, kept in `localStorage["hvi-tennis-legend"]`; repeated on the pause
  screen. When you serve, a toss meter beside you shows the ball against the green band where the
  hit is best.
- **Surfaces and the camera** (2026-10-05, Scott: clay and grass; "a little disproportionate, not
  considering linear perspective"; his pizza peel on court): three courts, chosen under the folded
  options (PLAY NOW keeps the picked one, HARD by default; `&court=clay|grass` in the route): HARD
  (THE SHOW COURT), CLAY (THE RED CLAY COURT: brushed red, white tape, the ball's marks where it
  lands, the players slide), GRASS (THE LAWN: mown stripes, worn to earth at the baselines). Sim
  version 2 (`sim.js SURFACES`): clay bounces higher and keeps less pace, spin departs further from a
  flat bounce, and the legs carry momentum (slow to stop or turn); grass bounces low and keeps more
  pace; hard is version 1's physics exactly. The surface is in the record; a version-1 record (no
  surface) replays under version 1 (`scripts/fixtures/tennis-v1-record.json`, recorded before the
  change, is held to its result). The picture is one pinhole camera (`render.js proj`, solved from
  where the baselines sit and how wide), so lines, net height, the taller back wall (two rows of
  boards) and side walls, the stands' tiers and seats, the officials, ball kids, players (1.8 m: about
  half a service box's depth at the near baseline) and the ball all follow one projection; the sim
  never sees it. Heads come off the file photo with `src/play/heads.js` (shared with golf): the blob on
  the body's axis, trimmed to the face's width, so a held prop stays home; a prop baked into the head
  gives no cut and the page draws a head from the photo's skin and hair.
- **Line-call challenges** (2026-10-05, Scott: "Can you approach the ref and challenge calls? ...
  recreate that little ... spot-checker thing"). Sim version 3 (`sim.js CALLS`, `judge`,
  `resolve`): the line judges are human. Each first bounce is measured against its nearest line
  (`lineMargin`: metres the ball's mark overlaps the line's outer edge, below zero the gap; the call
  rule is unchanged, touching the line is in); within `BAND` (8 cm) the seeded generator sometimes
  calls it wrong, up to `MISS` (60%) on the line itself and less the further off, at 0.4x on clay (the
  ball leaves a mark) and 1.2x on grass. Any call within `CH_CLOSE` (20 cm) that ended a point or a
  first serve opens a CHALLENGE window for the player it went against: 2 s (3 s on a touch screen;
  `win`, part of the record). C, the pad's SELECT (Xbox VIEW, PlayStation CREATE, Switch minus), or
  a tap on the prompt; the prompt (CHALLENGE? and the key, the count left, a bar for the time) is
  the only new chrome, and the board carries a discreet count (one bar a challenge left; W1 / W2 for
  warnings). Pressing it: the player walks toward the chair with a hand up, THE CHAIR leans to the
  microphone: "MR./MS. SUBJECT .... IS CHALLENGING THE CALL." (figures by their honorific,
  `roster.js formalName`; the chair speaking about a living figure is not the figure speaking).
  CPUs challenge too: a wrong call against them by their rating, a right one by their temper
  (`roster.js temper`, hand-set: McEnroe 0.97, Ashe 0.08, the line judge on a day off 0.03). The
  verdict is decided in the sim at once; the review only shows it. Rules: a right challenge
  overturns the call and costs nothing (a ball called out that was in: the point to its hitter; a
  winner or ace called good that was out: the point to the receiver, or for a first serve a fault and
  the second serve; a serve called a fault that was good: the point replayed); a wrong one stands
  and costs one; three a set, one more in a tiebreak, three again with each set; none after the
  window. Holding C at the umpire for 1.5 s (the opponent will not serve meanwhile), or challenging
  with none left, is a code violation: "THE UMPIRE HAS NOTED YOUR TONE. CODE VIOLATION, WARNING,
  ...", the third a point penalty.
- **THE DEPARTMENT'S EYE // PROBABLY ACCURATE** (`render.js drawReview`, `show.js REVIEW`; our own
  parody of a television line review: no other system's names or marks): 8 s, skippable with A / B /
  C / a click after the first second. The flight replays as a trail from a camera of its own,
  slowing to the bounce; the camera finds the bounce and comes down to a top-down view a few
  centimetres across; the mark (an ellipse exactly the ball's 3 cm either side of its centre across
  the line, so the gap on screen is the margin measured) against the line at its 5 cm width, every
  floor pixel ray-cast; the measurement ("OUT BY 3 MM", "IN — TOUCHING THE LINE"); CALL OVERTURNED
  or CALL STANDS; then "THE DEPARTMENT'S EYE IS SPONSORED BY NOBODY. IT DOES NOT BLINK." The crowd
  (`crowdAudio.js slowclap`) claps slowly and then faster under the reveal; a cheer for an overturn,
  a groan for a call that stands. Reduced motion: four still frames, no camera move. The match is
  held during the review exactly as for a crowd camera (no step, nothing logged) and the board
  holds still until it ends; the screen reader hears the challenge and the verdict ("THE BALL WAS
  OUT BY 3 MILLIMETRES. CALL STANDS.").
- **Mouse and touch** (2026-10-05, Scott: "the character only moves when you've pointed and
  clicked, and the release of your click is the timing of the swing"). Press on the court: your
  player runs there. Hold while the ball comes; RELEASE is the swing (the same contact windows as
  A). The drag while held sets the shot (`sim.js gestureShot`): up (toward the net) topspin, further
  up deeper topspin, a big flick up a lob, down a slice, still a flat drive (new in version 3: less
  net clearance, more pace); left / right aim for the lines; the longer the hold, a little more pace.
  A small arrow beside the player shows the shot (green topspin, blue slice, white flat, gold lob)
  and a cross marks where you are running. Serving: press to toss, release on the way down to hit
  (a quick click's release on the way up is ignored); drag left / right places it, up kicks, down
  slices (`gestureServe`). The pointer goes into the same mask as the buttons (`ptrBits`: PTR 128,
  the pressed spot to 10 cm in bits 8-23, the drag as -3..3 each way in bits 24-29), so mouse, keys
  and pad mix in one match and the record replays. The legend switches to MOUSE / TOUCH when the
  pointer is used; on a phone tap-to-move replaces the on-screen pad, and "+ Touch buttons" (kept in
  `localStorage["hvi-tennis-classic-touch"]`) brings the classic pad back.
- **Records**: `{version: 3, seed, fmt, surface, win, opp, inputLog, result}`; the result adds
  `chLeft`, `viol` and `mis` (miscalls). The check holds the version-1 record
  (`scripts/fixtures/tennis-v1-record.json`) and a version-2 clay record made just before
  (`tennis-v2-record.json`) to their results, plays version-3 matches with challenges both ways and a
  mouse-driven match (with key points mixed in) and replays them, and plays a challenged match with
  the broadcast on and off to the same masks.
- **Not yet**: changing ends, lets, doubles, counting results, a server replay check, other viewers,
  figures referred after the bundle in the stand.

### Golf: THE DEPARTMENT LINKS (`#golf`, 2026-10-05)

- **The course**: APPLICATION 001's eighteen holes, the course THE ASSEMBLY declined (session 001
  voted for the farm; the city never builds it). `src/play/golf/course.js` expands civicGeo.js `GOLF`
  (the six-by-three serpentine routing, its bunkers and pond) into full holes from a fixed seed
  (`COURSE_SEED = 0x6F07`): par 72 (36 + 36, four 3s, four 5s, ten 4s, no back-to-back 3s), 6,884
  yards, doglegs bending with the routing's row, fairway, rough, trees along the corridor, greenside
  and fairway bunkers, water where the city's pond sat near the green (or seeded), a green with a
  pin and a varying fall (`slopeAt`). Out of bounds past the corridor. Same course for everyone.
- **The round** (`sim.js`, pure, 60 Hz fixed step, seeded mulberry32 in the state, no DOM, no
  clock): AIM (left/right, held speeds up), club (B/X or down shorter, up longer; the caddie picks a
  default each shot), the three-press meter (start, power on the way up, accuracy on the red line on
  the way down: early hooks, late slices, missed shanks), wind per hole (0-14 mph, 8 directions),
  trees stop a low ball, water +1 and a dry drop back along the line, OB +1 and replay from the spot,
  10 strokes is a pick-up. On or near the green the putter rolls the ball over the slope; the cup
  takes a ball under 2.1 yd/s. Modes: stroke play alone (18, front 9, back 9) or match play against
  a figure (honour on the tee, farthest away plays, holes won/halved; winner by holes up).
- **Replay**: a round is `{v, seed, cfg, inputLog, result}`; the log is run-length button bits
  (`[bits, count, ...]`, ~1,500 numbers for 18 holes). `replay(cfg, log)` reproduces it tick for
  tick. Kept in localStorage `hvi-golf-rounds` (last 8) and the tab's memory; no endpoint yet.
- **The figures** (`roster.js`): Tiger Woods 97, Jack Nicklaus 97, Rory McIlroy 91, Phil Mickelson 88,
  John Daly 79, Michael Jordan 62, Bill Murray 55, John F. Kennedy 52, Babe Ruth 46, Adam Sandler 38
  (golf ratings set here; census files for the living, bundled files for JFK and Ruth). Rating sets
  the spread of their power, aim and accuracy errors and how much wind and break they read. Nobody
  speaks, living or dead; the Department's lines are about the game.
- **You**: your own file when this browser has a case (`SUBJECT <last four>`, shirt and trousers from
  your avatar), else SUBJECT. WATCH THE CADDIE PLAY runs the bot on your side (attract mode; not kept).
- **THE DEPARTMENT OPEN** (2026-10-05, the default course; the links stay one click away):
  eighteen famous real holes as one par-72 course (6,946 yards), data only in
  `src/play/golf/holes/famous.js` (one compact object per hole with a `// source:` URL: par,
  yardage, bends, fairway width profile, bunkers, ponds, sea/creek/cross bands, the island, OB lines
  and roads, tree kind and density, green size, fall and pin, scene, elevation feel, gallery side).
  `course.js` builds each hole's geometry from it deterministically (`buildFamous`, `famousSurface`,
  `frameOf`); 50-100 more holes is more data. In-world name + "AFTER: <COURSE> NO. <N>" + one
  Department note per hole; no tournament marks, no quotes, no copied course art. The holes:
  Pebble Beach 7, Oakmont 3, Augusta National 13, Carnoustie 6, Royal Troon 8, Pebble Beach 8,
  Merion East 11, Bethpage Black 4, Augusta National 12 (out 36); Riviera 10, Pine Valley 7,
  Cypress Point 16, Whistling Straits 18, Pebble Beach 18, TPC Sawgrass 17 and 18, St Andrews Old
  17 and 18 (in 36). A round's cfg names its course (`course: "open"`); a cfg without one is the
  links, so every round kept before replays unchanged. On the Open only, the caddie's lay-up steps
  back off water and sand (`safeLayup`) and trees have their own heights (gorse is low).
- **Screen**: 256x224 canvas, integer scale in device pixels, imageSmoothing off, 5x7 bitmap font,
  NES palette, framed like the cartridge golf games (Fighting Golf): the golfer large, from behind,
  on the left; the hole runs away from him to a horizon (sky bands, drifting clouds, a far tree
  line, dunes or the sea, chosen per hole and per view direction). The turf is a stretched-depth
  floor (a row d yards out sits sqrt(K/d) rows under the horizon) sampled from a lazily filled
  half-yard raster of the hole: mowing stripes, speckled rough, bunker lips (far edge shadowed,
  near edge lit), waste sand with scrub, water with a shimmer, five tree sprites (pine, oak,
  Monterey cypress, palm, gorse), a gallery round each green, a flag that streams with the wind.
  The top-down hole is a picture-in-picture window (top right) with the aim, the pin, the balls and
  the wind. After contact the camera follows the ball down the hole; on the green it drops low
  behind the putter and slope arrows are drawn on the turf (and in the window). The render keeps
  only its own camera and trail; the sim never sees it. WebAudio blips, mute kept.
- **Looks** (`looks.js`): every golfer is their file's face (frame 0 head, as the tennis club cuts
  it; `/api/figure/<slug>` names the sprite, so a pending likeness is never fetched as a 404) on
  one standard outfit (polo, trousers, cap, one white glove) recoloured from the figure's kit; skin
  and hair are read off the head. A figure with no likeness yet gets a head painted by `avatar.js`
  from `roster.js` HINTS (pending on 2026-10-05: Nicklaus, McIlroy, Mickelson, Daly, Murray). The
  player is their own case's sprite or procedural photo. Portrait top left, front-view cards on the
  hole card and in the picker.
- **Input**: keys (arrows, Space/Z swing, X club, Enter/Esc pause; a press shorter than a tick still
  counts), `src/city/gamepad.js` (d-pad/stick, A/cross swing, B/circle and RB shorter club, LB longer,
  Start pauses), touch pad on phones (aim, CLUB, pause, SWING, 56 px); behind a "+" since v3), and the mouse or a finger
  on the picture (sim v3, below).
- **Ways in**: `#golf`, `#golf?vs=<slug>` (offers the match), `#golf?course=open|links`; THE ASSEMBLY's APPLICATION 001 frame;
  THE LEAGUES hub (an exhibitions line).
- Check: `scripts/check-golf.mjs` (course shape, the scripted round twice and its replay identical,
  holed ball ends the hole, OB and water penalties, score v par, a 97 beats a 20; the Open: 18
  holes, par 72, names/credits/notes/sources, builds the same, the bot holes every hole on four
  seeds, a match replays tick for tick, a round naming no course is the links tick for tick; v2:
  the v1 fixtures replay exactly through replay.js, no green is a circle, OSM greens are OSM's,
  fairway out-rolls rough, a wedge checks, sand holds, the road is fast, tailwind > calm > headwind,
  crosswind drifts its way and less for a soft shot, two-tap putts, the gallery's reactions, the
  end scene is the same on replay).
- **Sim v2** (2026-10-05, Scott's notes; `VERSION = 2`, `cfg.v = 2`). v1 (circle greens, three-press
  putts, the first flight and roll) is frozen in `src/play/golf/v1/` (sim, course, famous holes and a
  snapshot of the civicGeo routing); `replay.js` replays any record on the sim it was played on
  (`{v, cfg, inputLog}`; no version = v1). `scripts/fixtures/golf-v1-rounds.json` holds six rounds
  recorded on v1 (bot and sloppy-human logs) that must replay to the same result, tick and resting
  spots. v2:
  - **Real shapes**: the Open's greens, fairways, bunkers, tees, water, streams and coastline are
    OpenStreetMap's (`scripts/golf-osm-import.mjs`, run offline: one Overpass query per course,
    cached and spaced; the `golf=hole` way with the hole's ref inside the named course; features
    nearest that hole's line, turned tee-to-green up the screen, scaled to the card's yardage,
    simplified, big lakes clipped to the hole) in `holes/osm.js`. All 18 holes found (St Andrews has
    no fairways mapped: the drawn band stays). Map data (c) OpenStreetMap contributors, ODbL: credited
    on each hole card and on the page. Where OSM has nothing (and on the links), greens, bunkers and
    ponds are organic blobs (a seeded sum of harmonics, area kept), fairway edges wander. The Road
    Hole's road is a surface (`path`, fast) and the wall behind it is out. The game never queries OSM.
  - **Ball**: per-surface bounce, grip, plough and roll (`GROUND`); rolling deceleration = c0 + c1 *
    speed (a smooth stop); backspin by club checks wedges on greens, the driver runs out; steep
    landings stop sooner; slopes pull everywhere (the green's most); plugged lies; lip-outs.
  - **Wind**: scaled by the shot's height (exposure); headwind costs ~0.85% carry per mph, tailwind
    adds ~0.48%; crosswind drift ~0.56% of carry per mph; putts unaffected. HUD: the arrow turned to
    the aim plus HELP/INTO and L>R/R>L in mph; the flag streams and trees sway with it.
  - **Putting is two taps** (start, pace; no accuracy press); the putter meter is pace = marker^1.5
    (fine control short), a green mark where a flat putt reaches the cup; left alone the marker
    falls back and the putt is called off. Full swings stay three presses.
  - The caddie (bot) and the CPU play each shot out in their heads (`solveShot`, `predict`): wind,
    roll and the break; the CPU reads part of the wind and adds its rating's errors.
- **Look v2**: 320x224 (16-bit wide mode), integer scale, smoothing off. Ramps of 4-9 shades per
  material through a 4x4 Bayer dither (sky, mowing stripes, slope-lit greens, distance haze), a
  far-hills layer at a third of the near tree line's parallax, tree crowns that sway, soft shadows.
  The golfer (`golfer.js`) is posed in 3D and projected through the view: seen from behind, left of
  the ball facing it; the club goes back toward the camera and over the right shoulder, through the
  ball, to a finish with his back to us. Draw time median 1.6 ms (1440 and 390 px viewports;
  ~4.3 ms at a 4x CPU throttle; v1 was 0.6 / 2.5 ms); static layers cached.
- **The gallery**: `gallery.js` (pure) turns each shot's outcome into roar / cheer / warm / polite /
  thin / ooh / groan / crickets; the crowd's arms move to it (render), `src/play/crowdAudio.js`
  plays it (synthesised: claps, formant crowd voices, crickets, a cough, a bell; no sample files;
  under each game's remembered mute; nothing before the first gesture) and the screen reader hears
  a line ("THE GALLERY GROANS."). Shared with THE TENNIS CLUB (aces, breaks, long rallies, match
  point roar; double faults groan; out and net calls gasp; the toss quiets it) and THE COURTS.
- **After the round** (`scenes.js`, render-only, chosen from the result and seed so a replay shows
  the same): champagne and the bell (under par or the match won), the 19th hole (beer, then a hot
  dog; the opponent silently sips, eats or reads the card), alone at the end of the bar (poor),
  a club over the knee and the bag in the pond while the caddie drives off (terrible), and about
  one round in ten a goose takes the hot dog. Any button skips to the card; reduced motion shows
  one still frame; the caption is read out.
- **Sim v3: THE MOUSE / A FINGER** (2026-10-05, Scott: "I definitely want to do mouse controls for
  golf"; `VERSION = 3`). v2 is frozen in `src/play/golf/v2/sim.js` (it shares `course.js`: a change
  to the course must freeze a copy first); `scripts/fixtures/golf-v2-rounds.json` holds four v2 rounds
  that must replay exactly, and a bits-only round plays on v3 exactly as on v2. Keys and pads are
  unchanged; the mouse coexists and is detected per stroke:
  - **Aim**: click/tap a spot on the corner map (or on the ground ahead in the top half of the view;
    the sky aims the direction at the club's reach). The aim swings there (0.035 rad a tick), a gold
    cross marks the spot, and the club for the distance comes out (`clubFor`: the shortest that
    reaches, the putter on the green). The wheel, or a click on the club box, still changes club.
  - **Drag swing** (`gesture.js`, pure): press in the lower half, drag down (the pull is power, full
    at 64 canvas px, capped; the meter and the golfer's backswing follow it), push up past where the
    press began: the ball is struck at that moment. Drift off vertical on the way up is the line
    (right slices, left hooks; a dead zone, then a ramp, so a wobble is a small curve); the forward
    stroke's time is contact (70-280 ms pure, slower FAT and short, a flick THIN, low and running).
    Let go before pushing through: called off, no stroke. EASY SWING widens the dead zone and the
    band and keeps two fifths of a miss. A press that does not move is still the meter's button.
  - **Spin**: a small ball under the map (full swings, mouse only): click where to strike it (low
    backspin checks, high topspin runs, left side a draw, right a fade); back to the middle each shot.
  - **Drag putt**: drag down for pace on the putter's own scale (the green mark shows where a flat
    putt reaches) and let go; drifting sideways pushes the line by up to 0.025 rad.
  - **Determinism**: the samples never reach the sim. A stroke is logged as ONE event of quantised
    computed numbers between the button bits: `["a", x*10, y*10]` (aim), `["s", power, line,
    contact, spinX, spinY]*1000` (swing), `["p", marker*1000, offset*1e5]` (putt), kept as
    `[event, 0]` in the run-length log; `act(st, e)` plays them, only in the player's own aim phase.
  - **UI**: the legend under the picture switches to MOUSE / TOUCH on pointer use (back to keys on
    a key); the first three drag strokes carry the hint "DRAG DOWN TO TAKE IT BACK. PUSH UP TO
    SWING."; the screen reader hears the aim ("AIM: 141 YARDS. 7I."), each stroke ("SWING: POWER 82
    PERCENT, FADE, PURE.") and a called-off swing. On a phone the finger drags the same way, the
    canvas takes the touch (`touch-action: none`), and the classic buttons wait behind a "+".
  - Check (`check-golf.mjs`): straight push = straight ball; drift right = slice, left = hook,
    scaled; a longer pull is more power, capped; fat short, thin low; called off = no stroke; a click
    is the meter; events out of turn are ignored; the map click aims and picks the club; a nine-hole
    match played entirely by mouse events finishes and replays from its log (and through JSON).
- **The right stick** (a pad, like the PGA Tour games' analog swing): the same gesture model as the
  mouse (`gesture.js stickSwing`): pull the right stick down to take it back (how far = power, held
  at the bottom = full), push up past -0.45 to swing through (struck as it crosses); drift off
  vertical is the line, the push's time the contact (its own band, 30-190 ms); settle back to the
  centre for 140 ms first and the swing is called off. Putts: pull back for pace, push forward. Dead
  zone 0.18 and light smoothing; logged as the same swing / putt events. A still runs the meter.
- **The simple golfer** (Scott: "keep it simple"): `golfer.js` is a classic sprite now, 60x80 at
  the scene's scale (the 3D-posed 2.5x figure is gone): six key poses for a full swing (address,
  half back, top, impact, through, finish), three for the putter, a few joints each drawn as flat
  two-tone limbs with one dark outline, a light dark-outlined shaft that reads on the grass. The
  meter (or the drag, or the stick) picks the backswing frame; the downswing runs on the shot's
  clock. The player's own head (heads.js) and kit colours. Render-only.
- **The adaptive corner map**: it frames the shot, not the hole: the ball 12 px off the bottom, the
  aim straight up, the far edge a little past the target (the spot clicked, else the club's carry)
  and the pin when the pin is near enough to matter; approaches show the green complex, on or near
  the green the green itself with its fall arrows. Yardage rings every 50 / 25 / 10 / 5 yards by
  scale (numbered up the line, the spacing printed bottom left), the club's carry marked in red, the
  wind arrow turned to the shot. Zoom, turn and centre ease between shots (snap under reduced
  motion); a drag on the map holds it still so a click lands where it looks (`pipToWorld` reads the
  framing as drawn).
- **Difficulty, measured** (Scott's first round: "pretty awful"): EASY SWING is on for a new player
  and remembered (`hvi-golf-easy`). New easy rounds carry `cfg.assist = 2` (`easeOf`): the meter at
  ~half speed (x1.9), a quarter of a missed line and no shank, fat/thin at 35%, a kinder cup on the
  player's putts. Easy rounds without `assist` keep the first easy exactly (x1.5, two fifths), so
  they replay. check-golf plays a casual first-timer (keys, a fifth of the wind read, ~100 ms timing
  sd, putts within 25% pace) over the Open's front nine: about +8 on easy (bogey golf), about +29
  without.
- **Not yet**: a server that verifies a submitted log; the course in the city map; a replay viewer.
- **Menus**: the shared `src/play/GameMenu.jsx`. Pause (Enter / Esc / Start / II): RESUME, RESTART,
  CONTROLS (the how-to legend), SOUND, QUIT TO PLAY; the sim and the input log stand still under it.
  After the round, 90 frames after the card comes up: PLAY AGAIN (same settings, a new seed), NEW
  COURSE (the other course), CHANGE SETTINGS (the setup screen), BACK TO PLAY, BACK TO THE CITY; B
  closes it to look at the card.

### Basketball: THE COURTS (`#hoops`, 2026-10-05)

- **Where**: `#hoops[?home=<district>][&vs=<district>][&fmt=to21][&shot=14]` (alias `#basketball`;
  `src/play/hoops/Hoops.jsx`), one line on `#play`. Ways in: THE LEAGUES hub's exhibitions line, and
  DRIVE YOURSELF: E in the middle of THE COURTS' hardcourt offers PLAY BASKETBALL: AN EXHIBITION
  (`controlIso.js`, kind `hoops`; the lot's edge still steps in).
- **The teams** (`roster.js`): the basketball league's own fives for the current season, read from
  today's plan summary (`civic.districts[id].teams.basketball.roster`, the day before while today's is
  built), best first; a bundled snapshot (season 22, machine day 603) when the plan does not answer.
  Team names are the league's (`<TEAM> FIVE`); kits are the district's colours on one standard uniform
  (the away side changes into its trim on a clash). **PLAY NOW**: your own five when this browser's
  case is a league entrant on a basketball roster (`citizen-<last four>`; you play as yourself, your
  own file photo, at your rating), else THE DEPARTMENT FIVE; against the team nearest in rating.
  Options behind "+": your team, the opponent (starts at once), length, shot clock.
- **Why five a side**: the league drafts fives, so every rostered player appears; 10 sprites at 256 x
  240 cost nothing on a phone, and Tecmo-style control means you only ever steer one of them.
- **The game** (`sim.js`, pure: 60 Hz fixed step, seeded mulberry32, only + - * / sqrt): NBA lines in
  metres, rims 3.05 m. FOUR 2-MINUTE QUARTERS (the clock runs only while the ball is live; level after
  four means one-minute overtimes; the tip to the side that lost it opens Q2 and Q3) or FIRST TO 21; a
  24- or 14-second shot clock (reset on a change of possession or the rim). Two inside the arc, three
  outside it or past 6.71 m in a corner; a shot clock violation or stepping over a line with the ball
  turns it over; a loose ball out goes to the side that did not touch it last. No fouls or free
  throws yet. You attack right all game (ends do not change).
- **Control** (Tecmo): you steer the ball carrier on offence, on defence the defender nearest the
  ball when it changed hands; C switches to the teammate nearest the ball. A held = the jump shot:
  let go at the top of the jump (a meter beside the shooter lights the window; PERFECT / EARLY / LATE
  after); near the rim a layup, a dunk for anyone rated 75+ (a leap to the rim, the rim bends, sparks,
  a two-pixel shake). B passes toward the d-pad (the nearest teammate with none). On defence A jumps
  (blocks, rebounds) and B reaches (about one in eight, more with a good defender; a missed reach
  leaves you off balance). Makes are decided at the release from distance, the shooter's rating, the
  timing and the nearest defender. CPU players (both sides) play from their league rating: speed,
  touch, defence, hands, leap; man-to-man marking, a defender squared up slows a drive, the carrier
  drives, pulls up, kicks out to the open man or beats the shot clock. **EASY MODE** (on for a first
  visit, remembered in `hvi-hoops-easy`): a wider shot window, a little help on makes and steals,
  softer CPU hands, and your man guards when you let go of the pad.
- **The picture** (`render.js`): a true one-point perspective from high in the near stand (camera
  level along +y, horizon just above the frame): verticals stay vertical, lines across the court stay
  horizontal, depth lines run to one vanishing point; width, height and jumps share one scale per
  depth (20 px a metre at the near sideline, 8.4 at the far), so a 2 m player is 40 px near and 17 px
  far and the rim stands 3.05 m over its own spot on the floor. The camera pans with the ball. Heads
  are drawn at 0.5 m (the 16-bit habit) so faces read. A 26-row far stand in shadow to the top of the
  frame, every seat a person who cheers, stands or hangs their head; Department boards on the apron;
  stanchions, glass boards seen at their true angle, shot clocks on top of the boards, rims and nets.
- **Faces**: cut from each file photo's frame 0 (`/api/sprite/<slug>`) by the sports pages' shared
  cut (`src/play/heads.js headFrom`: the head only, so an everyday prop such as a pizza peel stays
  home; when the prop is part of the head, a head drawn from the photo's skin and hair), shrunk for
  depth by `shrinkHead`; `roster.js CROPS` overrides by hand. Pending likenesses (the API answers 204)
  get a head painted from `roster.js HINTS`.
- **Presentation**: an arena scoreboard (teams in their colours, the ball's side, quarter, clock,
  shot clock), the Overlord's calls under it (`calls.js`, the Department's voice about the play; nobody
  on the floor speaks or is quoted), a live region with the score, crowd moods (cheer on dunks,
  threes and blocks; groan on airballs, shot-clock violations, rim-outs). Sound (`audio.js`): blips and
  a noise-band crowd; it uses the shared `src/play/crowdAudio.js` when that is in the build
  (`import.meta.glob`, so its absence costs nothing). Mute in `hvi-hoops-muted`.
- **Input** (`input.js`): keys (arrows / WASD, Z J or Space = A, X or K = B, C or L = C, Enter / Esc
  pause), a pad via `city/gamepad.js` (A, B, a bumper or the left face button = C, Start), touch on
  coarse pointers (an eight-way pad; SWITCH, PASS/STEAL, SHOOT/JUMP labelled for the side you are on;
  START). The legend under the court names the buttons in the hands in use (`hvi-hoops-legend`).
  Reduced motion: no shake, no sparks, a still crowd.
- **The record**: `{version, seed, cfg (format, shot clock, easy, both fives), home, away, inputLog,
  result}`, the human's input one bitmask a frame (UP 1, DOWN 2, LEFT 4, RIGHT 8, A 16, B 32, C 64),
  run-length encoded. At the buzzer the browser replays it and says whether it reproduced; the last
  five are kept in `localStorage["hvi-hoops-exhibitions"]`. WATCH THE TAPE plays the game back from
  the log at 2x (or straight to the end).
- **Check**: `scripts/check-hoops.mjs` (purity; the arc and the corners; forced makes for 2 and 3;
  a miss; shot clock and out-of-bounds turnovers; FIRST TO 21 and four quarters end properly; a bot's
  game replayed twice to the same result, another seed differs, a doctored log fails, a wrong version
  is refused; a strong five beats a weak one 11+ of 12; dunks only by 75+; team names and the copied
  clock equal the league's and the city's; the calls quote nobody).
- **Not yet**: fouls and free throws, backcourt and three-second rules, changing ends, a server
  replay check, counting results anywhere.

### Fishing: THE WATERS (`#fish`, 2026-10-05)

- **Where**: `#fish[?spot=pier|break|estuary|river|lake]` (`src/play/fish/Fish.jsx`, lazy chunk). Ways in:
  `#fish`, one line on `#play`, E at the seaward half of THE PIER's deck in DRIVE YOURSELF
  (`controlIso.js`, kind `fish`), and the door line in THE PIER's and THE BREAK's building view
  (`BuildingView.jsx` `WATERS_DOOR`). River spots join the same two hooks when `src/city/river.js` lands.
- **The spots** (`data.js` `SPOTS`, shape `{id, name, water: ocean | river | lake | estuary}`, the river
  layout's export shape): THE PIER (ocean, 22 ft, coast place `pier`), THE BREAK (ocean surf casting,
  place `surf`), and THE RIVER MOUTH (estuary), THE FOOTHILLS REACH (river), THE RESERVOIR (lake) as
  data until river.js exports its spots (then its list replaces these, same ids where it names the
  same water).
- **The clock**: the city's machine clock (`CITY_EPOCH`, one real minute = one machine hour, so one
  real second of fishing is one machine minute). The light: dawn 05-08, day, dusk 17-20, night. The
  water year: 112 machine days, four seasons of 28 (spring, summer, autumn, winter; every season comes
  round twice a real week). The weather: one per machine day (`fishwx|<day>`): clear, overcast, rain,
  fog, wind. Overcast and rain feed the fish; wind shortens the cast; fog shortens their sight.
- **The species** (`data.js` `SPECIES`, 19): ocean striped bass, bluefish, summer flounder, black sea
  bass; river rainbow trout, smallmouth, channel catfish, bluegill, eel; lake yellow perch, northern
  pike, largemouth, trout, smallmouth, bluegill, catfish; estuary blue crab, American eel, white perch,
  striped bass, flounder, catfish. One legend per spot, rare and only in its hours: THE SILVER STRIPER
  (pier), THE OLD BULL RED (break), THE ATLANTIC STURGEON (river mouth; protected, always released),
  OLD MOSSBACK (river), THE WARDEN (reservoir). Each: weight range (skewed small), length by the
  anglers' weight-length rule (`k * lb^(1/3)`, an arithmetic Newton cube root), depth band, taste per
  lure, appetite by season, light and weather, pull, stamina, wariness, jumps.
- **The trip** (`sim.js`, pure, 60 Hz, seeded mulberry32 in the state, no DOM, no clock, and no
  transcendental Math so every engine and node agree to the bit): a pool of 4-5 fish spawned by the
  hour's appetites, each with its weight fixed at spawn. LEFT/RIGHT picks the lure (worm, minnow,
  spoon, popper); A, A casts on a swinging power meter; in the water hold A to reel (the lure swims
  and rises), let go to sink (a popper floats); B jerks (a twitch, a pop). A fish that sees the lure
  comes to it (bait wants stillness, a spoon wants swimming, a popper wants pops and only surface
  feeders), nibbles 0-3 times, then takes it: B inside its window (12-30 ticks, shorter for wary
  fish) sets the hook; B on a nibble scares it off; a missed take steals the bait. The fight: tension
  follows the reel and the fish's pull (runs, jumps, stamina): red for 18 ticks snaps the line,
  slack (under 0.12) for 100 ticks (40 for a crab, 45 in a jump) throws the hook, a fish that still
  has strength at the net runs again. Landed: species, weight (hundredths of a pound), length (tenths
  of an inch), lure, machine day and hour; then KEEP (A) or RELEASE (B). A trip ends at two real hours.
- **Replay**: `{cfg: {seed, spot, at}, inputLog}`, run-length bits like golf. `replay`, `verifyCatch`.
- **Screen**: 256x224, integer scale, smoothing off, the golf page's 5x7 font. The angler on the left
  (on the pier's deck, the sand, or the bank), the water in cross-section with the fish visible (dimmer
  at night and in fog), the far side by water (the sea and the lighthouse, the reservoir's trees, the
  river's hills, the marsh and the city), sky by the light, sun and moon by the hour, rain, fog, wind
  caps. The rod bends with the bite and the tension; the line sags when slack and flashes red when
  too tight. The catch card overlays the frame. Fish are drawn from data (`art.js`), no image files.
  Reduced motion stills the water, the tails and the weather. WebAudio blips, mute kept.
- **Background anglers**: at dawn and dusk two figures fish along the rail or the shore behind you,
  render-side only. They never speak. (The city's pier already seats anglers with rods on its 14 rod
  anchors, `coastGeo.js pierAnchors`; a dawn-and-dusk crowd there is a hook left for the river
  layout's version, not a sim change.)
- **Input**: keys (arrows, Z/Space reel and cast, X jerk, Enter/Esc pause), `gamepad.js` (d-pad or
  bumpers lure, A/cross reel, B/circle jerk, Start), touch (lure, JERK, II, REEL, 56 px). The legend
  under the frame follows the hands in use with the pad's glyphs. Screen reader: each line of the
  Department's commentary is announced; the catch card is real buttons (KEEP, RELEASE, DONATE).
- **Your records**: this browser keeps the tackle box (kept fish), personal bests per species (every
  landed fish) and the last three permitted trips' logs (`box.js`). MY FILE shows the aquarium's
  donations and the city records the file holds (`MyFish.jsx`). THE RECORD BOARD on `#fish` reads the
  aquarium's tanks.
- **Mounted fish**: `furniture.js` CATALOG `mounted-fish` (wall, data only; the furniture shop sells
  it; the owner's catch is drawn on it by `art.js` when the cutaway is given one).
- Check: `scripts/check-fish.mjs`.

### THE AQUARIUM (`#aquarium`, `/api/aquarium`, 2026-10-05)

Scott: Animal Crossing's museum for the city's fish. The first place the city checks a game by
replaying it on the server.

- **The building**: the AQUARIUM WING of the MUSEUM OF THE CITY (Old Town, `city-museum`); no layout
  change. Its building view carries the door line; `#aquarium` is the page (one line on `#play` via
  THE WATERS' entry, and from the catch card).
- **The tanks**: one per species (19). A donated species swims in a pixel tank over its plaque: the
  city record (weight, length), CAUGHT BY <SUBJECT XXXX> AT <SPOT>, DAY <n>, PREVIOUS RECORDS, FIRST
  DONORS. An empty tank holds the species' silhouette: NOT YET DONATED, and where it lives (a legend:
  ONLY AT <SPOT>). The count of filled tanks is the collecting drive.
- **The permit (why the server issues the seed)**: a trip that may be donated starts with `POST
  {action: "trip", spot}`; the server picks the seed and stamps the start time (`at`), which also fixes
  the clock, the season, the light and the weather. Binding the seed to (case, machine day, spot)
  instead would let anyone replay the same day's water offline as often as they liked and submit the
  best; a server seed is new each trip, kept on the file (last 12), void after six hours, and the
  file gets 30 an hour. A log may not hold more ticks than real time has passed since the permit
  (plus ten seconds), so a trip cannot be fast-forwarded. Without a case file (or offline) you still
  fish, with a local seed, and the catches stay in the browser.
- **The donation**: `POST {action: "donate", tripId, n, claim: {sp, cw, tl}, inputLog}` re-runs
  `src/play/fish/sim.js` in node on the permit's `{seed, spot, at}` and the log, and files catch n only
  if it comes out exactly as claimed and was not released. One donation per fish (the permit records
  it before the plaque moves). Cost: a two-hour trip (432,000 ticks) replays in well under a second in
  node (check-fish prints it: about 65 ms for the full two hours, half a millisecond per real minute of fishing).
- **The plaque's rule** (`aquarium-store.js fileDonation`, pure): the heavier fish takes the plaque, a
  tie keeps the holder; the old holder moves to PREVIOUS RECORDS (newest first, 10 kept); the donor
  list keeps each subject's first donation of the species, in order (100). Names are `SUBJECT <last
  four>`; the case number is stored only as a hash. A purge deletes the file's record and renames its
  plaques A PURGED FILE.
- **Limits**: 300 requests an hour per address, 30 permits and 30 donations an hour per file, 40
  donations an hour per device, 30 wrong case numbers an hour; a log of at most 200,000 numbers. No
  money: no chips, no CYCLES, no Treasury (selling fish is design only, ECONOMY_PROPERTY.md).
- **What replay does not prove**: that a human played. A bot that reads the sim can fish perfectly; the
  permit and the clock bound how often and how fast. The plaque says CHECKED, not HONEST.

## The unbuilt Substrate, and a quiet map (2026-10-05)

- **Endless grid.** The faint street grid (every 4 cells, `rgba(74,222,128,0.05)`, 1 px) no longer
  stops at the city's bounding rectangle: CITY draws it out to the edge of the view at every zoom
  and turn (`iso.gridStep`, `iso.viewCells`: only the lines the view crosses; the step doubles
  while lines would sit under ~10 px apart, so coarse lines are still 4-cell lines). Full strength
  over the city's bounds, then two bands down to a 0.02 floor further out (`GRID_BANDS`), drawn
  as solid passes into a layer redrawn only when the camera moves. MAP's solder points run past
  the layout the same way. Render-only.
- **Labels off by default.** Building, station, person and prefect names show only for what the
  mouse is over or what is selected (tap, `[` `]`, a find). The four landmark tags show only at the
  whole-city overview and fade as soon as a zoom starts. **LABELS** in the control row brings
  every name back (remembered per viewer, `hvi-city-labels`).
- **Touch: tap to name, tap to open.** On a touch screen the first tap on a building outlines and
  names it and puts a one-line chip (name, head count, **OPEN**) in the control row; OPEN or a second
  tap opens its cutaway; a tap on the open building goes inside; a tap on empty ground clears it.
  A mouse click still opens the cutaway at once.
## Tower cutaways (SimTower pass, 2026-10-05)

Scott (2026-10-05): the property ladder runs assigned flat -> buy a flat -> **own a whole floor**
-> building -> block; every room of a flat is its own thing, to be dressed later; **build the
cutaways first**, no money or ownership yet. So every residential, office and mixed-use tower
opens as a SimTower cross-section.

- **Which buildings** (`tower.js isTower`): a tower style (the projects, brownstones, lofts, glass,
  the seaside and alpine flats, tenements, terraces, walk-ups, shops-under-flats, offices, the
  hotel), not HQ (the Holding Pen keeps its own simulation), three storeys or more: 32 today. Every
  other building keeps the room view (`BuildingView` Floors).
- **How tall**: as many storeys as the tower stands in the city (archGeo `rise`, mirrored in
  `tower.js STOREYS` and held to it by the check). The sim's floors are the census's rooms: the
  ground floor is storey 0, a PH / RF floor the top storey, the floors between share the storeys
  between (a spread floor's storeys are renamed by level: "RESIDENCE LEVEL 3"); basements one each.
- **Units and rooms**: the lobby at the street; flats by who lives in the style (the top tier two
  five-room flats a floor and one penthouse flat, the middle three four-room flats, the bottom four
  three-room flats: bedroom, kitchen, living room, + bath, + study); offices, shops (two units on a
  shops-under-flats ground floor), venues and the vault from the floor's other places; the hotel's
  upper floors three suites each. Every room has `purpose` and `furniture[]` ({item, x}), drawn
  as pixel furniture (`Cutaway.jsx F`).
- **IDs**: storey `<building>:L<level>`, unit `<storey>:<letter>`, room `<unit>:<purpose>`.
  Every storey and unit has `owner` (THE DEPARTMENT). Golden ids in the check; change them only
  with a migration once ownership rows exist.
- **Who is where** (presentation only; whereAt still decides building, place and sim floor): a
  resident's flat is hashed from their key on the sim floor `floorOf` gives them (the nameplate and
  where they sleep agree); at home the room follows the clock (`homeRoom`: asleep in the bedroom,
  the bathroom on waking, the kitchen at 07-08:30 / 12-13 / 18-19:30, otherwise the living room or
  study); workers and visitors take a hashed storey, unit and room of their place; people walking in
  or out stand in the lobby. Crowd stand-ins are not drawn (as RoomStage). Owls stay up past 00:54.
- **The view** (`Cutaway.jsx` + `furniture.js`, a lazy chunk of ~18 KB gzip): one plain line on top ("A CROSS-SECTION
  OF <BUILDING>. TAP A FLOOR.", then the focused floor; it is the live status); a floor index (44px
  chips) above eight storeys; the roof (tank, antenna or chimneys), the storeys, the street, the
  basements; the local shaft on the left with a car moving on deterministic legs (and an express
  shaft on the right of towers of ten storeys or more, ground / middle / top). Rooms light by the
  city clock: daylight panes by day, lit windows where someone is awake after dark, dark otherwise;
  every unit its own paper and carpet. Tap a floor: it grows to fit its furniture, its plaque
  (`code // name // HELD BY THE DEPARTMENT`) and each unit's nameplate (surnames, the business,
  or VACANT) show: labels on the focused floor only. Tap a unit on it: a bottom sheet with its
  rooms large (two rows above three rooms), sprites in the room the clock says (asleep on the bed,
  a Z), who is present and the residents who are out (with where they are).
- **Route**: `?floor=N` stays the sim's floor (3D view, MY APARTMENT links); `&storey=<level>` names
  the storey drawn, for the breadcrumb and reloads.
- **Access**: the stage is one focusable application: Up / Down floors, Left / Right units,
  Enter opens, Escape closes the sheet (focus returns) or unfocuses the floor, Home / End top and
  street. A screen-reader list of every floor, unit and who is in which room. Reduced motion parks
  the cars and stills the sprites. 390px: 52px storeys, 44px chips, no horizontal scroll.
- **Performance**: one canvas as tall as the tower; each frame clears and draws only the rows
  inside the viewport (nothing when scrolled away); placement recomputed only on a new census.
- Check: `scripts/check-cutaway.mjs` (storeys = massing, every sim floor drawn, stable and unique
  ids, golden ids, placement order-independent and deterministic, nobody in two rooms or two towers,
  everyone home in the flat on their nameplate, residents in bed at 03:00, workers at work). Also the dressing: every catalog entry complete, every room has the piece its people use,
  every piece in its room type and tier, JETSAM cabinets occasional, Irene's taps top tier only,
  the Meridian's flats all distinct (neighbours and the flat below differ), determinism.
- **Dressing** (2026-10-05, `furniture.js`; Scott: "each floor its own thing", the player must not
  feel the machinery). Render-only: plans and ids unchanged. `CATALOG` is every piece (id, name,
  room types, footprint, tiers, role, draw), one module, so a later shop can sell exactly these for
  CYCLES (no prices yet). `dressUnit(unit, {band, penthouse, tags})` hashes the unit and room ids:
  four layouts per room type (mirrored half the time), each slot's piece from the variants its
  band allows (bunk beds and beanbags low, four-posters, clawfoot tubs, range cookers and
  sectionals high), the wall colour from the band's hues, paper (stripes, dots, damask, panel,
  brick, stains), floor (wood, carpet, lino, marble), curtains. The residents' files add one piece
  each: their job's prop (easel, piano, books, weights and trophies, EBTV for broadcasters, a
  computer, pots) and a JETSAM cabinet for the charm corner (about one flat in fifteen otherwise);
  a Goodnight Irene's tap in a fifth of the top tier's kitchens. An EBTV set that is on (someone watching; always in the
  open flat) shows the live frame (`ebtvFrame.js`, as every TV in the city); tapping it in the open
  flat opens the channel, with an sr-only link for keyboards and screen readers. The penthouse: double height,
  marble, chandelier, grand piano, gold trim. Each floor its own corridor carpet (the floor slab)
  and plaque colour. **Light**: by day, sky in the panes; after dark a room is warm where someone is
  up, dim blue with the curtains drawn where nobody is or all are asleep; a flat whose residents
  are out leaves a lamp on some evenings, and the vacant ones run on the Department's timers (one
  room, a stretch of the evening, hashed by flat and day; the sheet says so), so the tower reads
  as a pattern of lit and dark rooms; the facade edge glows beside a lit end room; corridor lights
  on every floor. No new labels: names and words on pieces appear only at sheet scale.


- **THE SHOPS in the cutaway** (2026-10-05; docs/design/ECONOMY_PROPERTY.md "The shops"): the
  pieces residents placed (`GET /api/shops?building=`) are laid over each flat's dressing
  (`shops.js furnishLook`; a whole-room piece clears the room's floor), so visitors see them. Your
  own flat (the server's MY APARTMENT, `residentFlat`) is marked YOUR FLAT in gold; its sheet holds
  the playable pieces (tap one: the cabinet's game, `#golf?preset=`, the live EBTV), THE BEDROOM
  CLOSET and FURNISH. At night three figures on the census gather round the top of an upgrade chain
  (render only; the sim never reads furniture until EFFECTS_FROM_DAY). New catalog pieces (the
  upgrade tiers) are never placed by `dressUnit`, so every flat's own dressing is unchanged.
## THE ATTRITION: the river from the mountain to the sea (layout 7, 2026-10-06)

Scott: "an endless river from the mountain to the sea." The move, why there and what it cost:
docs/planning/MASTER_PLAN.md "THE ATTRITION". Code: `src/city/river.js` (pure, no imports: the courses,
widths, bridges, walking blocks, fishing spots, the day), `src/city/riverDraw.js` (the iso painter),
hooks in `sim.js` (the ground), `CityIso.jsx`, `CityMap.jsx`, `Street.jsx`, `coastDraw.js`,
`mountainDraw.js`, `mountainGeo.js` (the pool's bench), `control.js` / `controlIso.js` (DRIVE
YOURSELF), `prefects.js` (patrols), `src/play/fish/data.js` (the fishing game's spots). Check:
`scripts/check-river.mjs`.

- **The course** (river.js `MAIN`, `MELT`: control points `[x, y, width, corner radius]`, filleted and
  sampled every half cell, `nearest`, `pointAt`, `waterAt`, `wetAt`). THE ATTRITION comes in from y -6000
  (beyond anything the view reaches: no source edge, it runs off the grid), down the seam between THE
  FARMLAND and the mountain's foot, joined at THE MERGER by THE BURNOUT (the snowmelt from 25 storeys under
  THE GLASS CEILING: falls, THE RETENTION POOL on a graded bench, rapids), across the village's west end
  and THE FOOTHILLS, through the city's gutters and streets, along THE CHANNEL behind the Pit, under the
  Shore Line, through the gap beside THE SURFSIDE and under the boardwalk, and out over the sand as THE
  OUTPLACEMENT (the estuary, sandbars) into the sea beside THE PIER. 1.2-1.5 cells wide in the city, 2.9
  in the coast gap, 6.4 at the sand's edge, 13 out in the sea.
- **The day** (`RIVER_DAY` 614, `RIVER_LAYOUT` 7). `sim.layoutOn(day)` names a plan's layout (6 before,
  7 from); `sim.onGround(day, fn)` lays walks out on that day's ground: ground 0 is the city's corner
  graph as it was, ground 1 adds `RIVER_BLOCKS` (the water as boxes, cut exactly at each walked bridge's
  deck). `planDay` uses its own day's ground (the tail of yesterday in today's plan is yesterday's);
  `whereAt` walks a trip on the ground of the day it set out; stand-ins and prefects' patrols on the
  moment's. Every route memo (`rt`, `rtm`, `rt3`, `dr`, `rl`) names its ground. A day before 614 is
  built byte for byte as before (check-river against `fixtures/river-pre.json`, built by c90be9f).
- **Bridges** (`BRIDGES`, 19, each `{id, name, kind, x, y, s, deck, span, walk}`): rail (the Loop north
  and south, the Shore Line: the viaduct's span over the water hung on a steel truss, `drawGirders`, and
  no viaduct pier in the water), road (a concrete deck, parapets, the centre line), foot (steel), trail
  (timber, THE FOOTHILLS), THE BOARDWALK (its own deck). Walkers, prefects and DRIVE YOURSELF (control.js
  `setRiverLive`: the water is solid) cross at the walked ones only.
- **Fishing spots** (`FISHING_SPOTS`, read by the fishing game: `{id, name, water, x, y (on the water),
  stand (the angler, dry), place, district, note}`): THE PIER (`pier`, ocean), THE OUTPLACEMENT
  (`estuary`), THE SEVERANCE, THE BREAK ROOM, THE UNDERPASS, THE COOLING-OFF PERIOD (`river`), THE MERGER
  (river), THE RETENTION POOL (`lake`). The ids `pier`, `estuary`, `river` and `lake` are the fishing
  game's placeholders', so every catch and plaque on file names its water; OLD MOSSBACK roams every
  riverbank spot. In DRIVE YOURSELF, from the river's day, E on a spot's bank fishes it (`#fish?spot=`).
- **The riverside** (`PATH`, `PARKS`): a paved path along the east bank of the two gutters; THE SEVERANCE
  GARDEN (the coast gap), THE WATERFRONT (MONITORED) (by the Diamond), THE BREAK ROOM (the Commons' bank):
  grass, benches, trees, a lamp lit after dark. Drawn only: no sim place was added (the plans' places
  are fixed).
- **Drawn** (riverDraw.js). CITY: the flat water, banks (stone in the city, earth in the woods, rock on
  the mountain), the road and foot bridges, the path and parks go into the cached ground layer with the
  substrate grid (redrawn only when the camera, the day/night or the level of detail changes); each frame
  the flow, light dashes in three lanes drifting downstream (still under reduced motion), and the floats
  at the fishing spots (near). THE FOOTHILLS and THE BEACH paint their own reach after their ground
  (`lotRiver`); the mountain's bands paint THE BURNOUT piece by piece after the ground under each (falls
  white, foam streaks running with the water) and THE RETENTION POOL (rings drifting out). The pines,
  towels, umbrellas and beach anchors in the water are left out. MAP: the water, a wave glyph every few
  cells, the bridges. STREET: the water and the bridges' decks near the eye.
- **Names** (the labels rule): the reach under the pointer is named (THE ATTRITION, THE BURNOUT, THE
  RETENTION POOL, THE OUTPLACEMENT; a float: its spot); a tap holds the name with its line ("THE
  ATTRITION // EVERYTHING FLOWS OUT. NOTHING IS REPLACED.") until the next tap elsewhere.
- **Dev**: `#city?river=1` (or `0`) shows or hides the water whatever the day (the views only; walks follow
  the day).
- **Checks** (check-river, 87): continuous from past the edge and from 25 storeys to the sea, downhill,
  widening; no lot (but the mountain's bands, the foothills, the sand, the boardwalk), platform, stair,
  lodge, lift station or ski trail in the water; the path and parks dry; every rail crossing bridged and
  every bridge carrying a line; every street the river crosses carried; the trail and the boardwalk;
  the blocks cover the water but the decks; every walked bridge walked straight across; no bank cut off
  (21 cells round at worst); days 612-613 byte for byte; day 614 on layout 7, read back from its plan the
  same as the sim, nobody on the water but over a bridge, nobody jumping at midnight; the views from 00:00
  of the day; every spot on its water with a dry stand within a cast; the fishing game reads them.

## EMERGENCE: industries the city grows (2026-10-06)

Design and as-built: `docs/design/EMERGENCE.md`. `src/city/emergence.js` (pure) measures each
published day (storefronts, orders, the penthouses, the top 5%'s share, the longest commute) and
opens an industry when its hashed thresholds hold for a few days (hysteresis both ways; a decline
re-draws them). The builder steps it after THE MALL from machine day `EMERGE_FROM` (622) only;
the state rides the plan (`emerge`, ledger `emerge/latest`), its posts ride THE MALL's work map,
the summary publishes `emerge` (status, posts, today's drone routes and helicopter hops, each
derived from that day's plan). Slice 1: DELIVERY DRONES (the Parts Depot) and PRIVATE
HELICOPTERS (rooftop pads). Drawn in the iso view's sky pass (`emergeDraw.js`); NOW, the PA and
the file's assignment line carry it. Check: `scripts/check-emergence.mjs`.
