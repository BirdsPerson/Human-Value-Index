# CITY 2: a city that grows by chunks and builds in the open (design, 2026-10-05)

Status: **PROPOSAL, nothing built.** For Scott's review. Consortium: drafted by Claude, challenged by
Codex, external numbers checked (Perplexity, cited in section 3.6). The challenge and what changed
are in section 7.

**Scott (2026-10-05):** "When things are being built we want to see construction and process. That's
part of what I was showing with the city game [Internet City: cranes, real-time build timers like
'26 MIN +3', '1 H 31 +1'; a plot per player; centre dear, edge free; build and dress your building;
the storefront carries your brand]. The design of the city is totally up for being changed. Build it
in a way that's more manageable and easily scalable." Also: "this is eventually going to be massive."

**Decided already (inputs, not questions):** one megacity growing outward forever on the endless grid
(Snow Crash's Street); boroughs founded by Assembly vote; gateways to other worlds at the Port;
Georgist ground rent paid out as a citizens' dividend; the ladder flat -> whole floor -> building ->
block with dressable rooms; industries emerge from city state (EMERGENCE, in build); persona drives
(DRIVES.md); never feel the machinery; democratic; mobile first; data-driven catalogs.

---

## 0. The idea in one page

Today the city is **hand-placed code**: 20 districts, 185 buildings, 207 places and 153 jobs written
as constants in `sim.js` and seven `*Sim.js` / `*Geo.js` pairs, each district drawn by its own painter.
Every growth step (PHASE 2 steps 1-5, the river) was a careful, bespoke, whole-city change: a new
layout version, a new network, fixtures to prove old days did not move. It worked, and it does not
scale past a few more steps: the painter's sort is quadratic in the number of things on the map, the
plan builder already needs more memory than a Netlify function has at 20,000 subjects (measured below),
and every new district costs an agent-day of geometry.

CITY 2 keeps everything that exists and changes how the city grows:

1. **The world is a grid of CHUNKS** (32 x 32 map cells). A chunk is either the **legacy core** (today's
   hand-built city, frozen as-is, every id kept) or a **generated chunk**: a short record (where, which
   district, which zoning per block, from which machine day) that a pure function turns into streets,
   blocks, parcels and buildings from catalogs. The city grows by **appending chunks at the frontier**.
   Nothing already built is ever re-laid out.
2. **Every structure has a construction lifecycle** as first-class state: PROPOSED -> PERMITTED -> UNDER
   CONSTRUCTION (fence, foundation, frame rising floor by floor under a crane, cladding, fit-out) ->
   OPEN, plus UPGRADE and DEMOLITION. Progress is a pure function of the machine clock and the project's
   fixed start and duration, so every viewer sees the same crane at the same floor and published days
   never change. Drawn procedurally from the building's own massing: no new art per building.
3. **Everything scales per chunk and per district**: plans built per district shard, the browser loads
   the chunks it looks at, the painter sorts one chunk at a time, the far view reads a district-level
   summary. Each tier (1k / 10k / 100k players) has a named budget and a named trigger to move up.

```
 catalogs (archetypes, zoning, districts)        project sources
          |                                       (city plan, EMERGENCE, ASSEMBLY, players)
          v                                                  |
 WORLD REGISTRY (append-only chunk records,                  v
  each with fromDay)  ----- worldOn(day) ----->  PROJECTS (fixed start + duration per project)
          |                                                  |
          v                                                  v
 generateChunk(record) = streets, blocks, parcels,   phase(project, machineTime) = stage + progress
   buildings, places, jobs, homes  (pure, cached)            |
          \__________________________  __________________________/
                                     \/
                    plan builder, per district shard, day D (immutable)
                                     |
             browser: visible chunks only; crane + timer from the clock
```

---

## 1. WORLD MODEL

### 1.1 Units and addresses

| Unit | Size | Id | Notes |
|---|---|---|---|
| CELL | the sim's map cell (a walker covers 60 a machine hour) | `(x, y)` floats | unchanged |
| CHUNK | 32 x 32 cells | `C<cx>.<cy>` (signed ints, `cx = floor(x/32)`) | the unit of growth, simulation, streaming and drawing |
| BLOCK | 8 x 8 cells, 16 per chunk (4 x 4) | `C<cx>.<cy>/B<0-15>` | 7 x 7 buildable, a 1-cell street on its west and north sides; the chunk's outer cell all round is ARTERIAL (2 cells between two chunks) |
| PARCEL | a rectangle inside one block, from a template (1 x 7x7, 2 x 7x3, 4 x 3x3, 6 row lots) | `C<cx>.<cy>/B<b>/P<p>` | the unit of ownership and ground rent |
| BUILDING | sits on one parcel (or a merged block: the BLOCK rung) | parcel id + `/H<n>` (generated) or the legacy id | storeys / units / rooms keep the cutaway ids (`<building>:L<level>[:<unit>[:<purpose>]]`) |
| DISTRICT | 1-16 contiguous chunks, one zoning palette, one station or more | today's ids; new ones `d-<slug>` | **a sector stays a district** (plans, windows, civic fold, league, prefect) |
| BOROUGH | a named set of districts, founded by Assembly vote | `b-<slug>`; borough 0 = THE SUBSTRATE (today's 20 districts) | its own council seat group, its own newspaper section, same economy and market |

The 32-cell chunk is chosen because it equals the sim's own walk-to-station reach (`ACCESS_R` 32): a
station on every second arterial puts every home within a station's walk, which is what
`check-planner` already enforces. The 8-cell block keeps the substrate grid (every 4 cells) visible as
streets: each block is two grid squares.

**Street addresses** for people: `<district addr> <block> <parcel>` ("0xF2 14-3"), in the Overlord's hex.

### 1.2 The legacy core: frozen, indexed, never re-laid out

Today's city (x -102..285, y -125..101.5) covers chunks `C-4..8, C-4..3` (104 chunk squares, ~60
touched). It becomes **one legacy super-chunk** (`LEGACY`): its content is exactly today's code, its
painter order today's `depthOrder` (870 boxes, 31 ms once per quarter turn, measured), its walks today's
corner graph. Generated chunks are never placed on a chunk square the legacy core touches.

**The ID-preserving mapping is an index, not a move.** A one-time script (`scripts/world-index.mjs`)
writes `world/legacy.json`: for every legacy building its chunk square (by centroid), a legacy parcel
`L:<building id>` with the building's lot as its rectangle, its ring (the ECONOMY_PROPERTY ring table,
by district), and every open lot that is still unbuilt (LOT 0x6F07, the resort parcels, the community
farm) as a parcel. No id changes, no geometry changes, no plan changes: no layout version is needed
for the index, because the ground does not move. It still gets an effective-from day and a content hash
(`legacy.json` names both, and the hash is part of `worldHash`), so the index itself is versioned and a
later correction to it is a new version, never an edit (Codex objection 3). A layout version is needed
only when the ground moves (section 1.5), exactly as today.

What the index buys at once: every legacy building gets a parcel id that ownership rows, ground rent,
construction projects and the market can key on, the same way a generated building does.

### 1.3 Generated chunks: a record and a pure function

A chunk record (in `src/city/world/chunks.json`, append-only):

```json
{ "id": "C9.1", "district": "d-meadowbank", "fromDay": 702, "genV": 1, "cat": "3f9a1c0e",
  "zone": ["r3","r3","mix","r3", "r3","park","mix","r3", "civ","r3","r3","r3", "r3","r3","rail","r3"],
  "water": null, "seed": "C9.1" }
```

`generateChunk(record, catalogs)` is pure (no clock, no random beyond `hash(seed, ...)`). **Catalogs
are content-addressed snapshots** (Codex objection 1): an edit to `archetypes.json` or `zoning.json`
writes a new snapshot `world/cat/<hash>.json` and never changes an old one, and every record names the
generator version and the catalog snapshot it was built with (`genV`, `cat`). Old chunks therefore
never change when a catalog is edited; the edit applies to chunks appended after it (the `LINES` rule).
Every plan, project, summary and route memo key carries `worldHash` = the hash of (legacy index,
registry up to the day, the snapshots it names). It returns:

- **streets**: the block streets and the arterials, as a lattice graph (nodes at block corners);
- **parcels**: each block's template chosen by zoning and hash;
- **buildings**: an archetype per parcel from the zoning's weighted list, its storeys from the zone's
  density band and the ring, its massing from the archetype (`archGeo` styles reused: a generated
  building is a style plus a footprint plus storeys);
- **places / jobs / homes**: from the archetype's use mix (homes per storey by tier band, shop units on
  the ground floor, offices, a school per N homes), with ids `<building id>:<use>`;
- **water and rail**: blocks the river crosses (`river.js wetAt`) become water or riverside park; a block
  zoned `rail` is a right-of-way (station and stairs); viaducts run over arterials, never over parcels.

Size: a record is ~200 bytes; 1,000 chunks (the 100k tier) is a 200 KB registry, fetched once per world
version. The content is regenerated wherever it is needed (builder, browser, checks) and cached per chunk.

### 1.4 Catalogs (data, not code)

| File | Holds | Who edits |
|---|---|---|
| `world/archetypes.json` | building archetypes: style, footprints, storey range, use mix per storey, construction hours per storey, crane kind, which rung it suits (flat building, tower, block) | agents (validated) |
| `world/zoning.json` | zones: the transect T1-T6 (Duany Plater-Zyberk, as the master plan used), `mix`, `ind`, `civ`, `park`, `rail`, `port`: archetype weights and density by ring | agents (validated) |
| `world/chunks.json` | the registry above | the growth step (section 4.3) |
| `world/districts.json`, `world/boroughs.json` | names, addresses, blurbs, prefect, hub stations, ring overrides | agents; boroughs only from an Assembly result |
| `world/networks.json` | arterial classes, and the rail plan per borough (stations on arterials) | agents; each line still appended to `LINES` (append-only, never retimed) |
| `world/legacy.json` | the legacy index (1.2) | written once by script, then frozen |

### 1.5 Growing: frontier, layout versions, the endless grid

- **The frontier** is every chunk square adjacent to a built chunk. Unsurveyed land is the unbuilt
  Substrate grid the views already draw to the edge of the screen.
- **Adding chunks is a layout version at a day boundary.** `layoutOn(day)` today is a hard-coded
  ternary; it becomes `worldOn(day)`: the legacy core plus every chunk record with `fromDay <= day`.
  A record's `fromDay` must be later than the newest published plan + LOOKAHEAD + 1 when it lands (the
  MARKET_SIM_FROM / RIVER_DAY rule), enforced by `check-world` against the live manifest. Published days
  keep their world; `whereAt` already fits legs to a plan's own times when the ground moved.
- **Walking in generated chunks** uses the street lattice only: generated parcels are always solid to
  walkers, built or not. So **building on a generated parcel never changes a walk**; only a new chunk
  does. **The legacy core keeps its own rule** (Codex objection 2): its open lots (LOT 0x6F07, the
  greens, the beach) stay walkable exactly as today, its corner graph is kept verbatim, and a project on
  a legacy parcel that would change what is solid is a ground change, taken at a layout boundary like
  the river. Routing becomes `route(worldHash, network, ground, ...)` with caches keyed by all three
  (today the street-route memo key names the ground but not the network: `sim.js` `route()`, which is
  safe only while one process plans one network). Generated legs are lattice shortest paths
  (hierarchical: arterial graph between chunks, block lattice inside); a leg crossing between the
  legacy core and a generated chunk joins the two graphs at fixed portal nodes on the core's edge,
  proved against fixtures.
- **Rail** stays `LINES` (append-only, a new version per change). Borough rail plans lay lines along
  arterials; a station sits on an arterial node with stairs into a `rail` block. Every residential
  chunk must have a station within `ACCESS_R` (checked).
- **The river** keeps `river.js` (its course runs off the grid at y -6000). A chunk the course crosses
  carries `water`; the generator leaves those blocks to water and riverside park and bridges every
  arterial it crosses (checked like `check-river`: every street crossing carried).
- **Gateways** (Internet City, other worlds) are Port-borough parcels of archetype `gateway`: a building
  with a departures hall and no CYCLES flow across it (ECONOMY_PROPERTY "One megacity").

### 1.6 Land value and ground rent on parcels

`VALUE(parcel) = BASE x RING(chunk) x DEMAND(district) x area / AREA_REF`, split into LAND (the parcel)
and IMPROVEMENTS (the building). Ground rent is charged on LAND only, at the Assembly-voted rate, and
paid out in full as the citizens' dividend (ECONOMY_PROPERTY "Land").

- **RING** for the legacy core keeps the ECONOMY_PROPERTY table by district (CORE 6, INNER 2.5,
  RESORT 1.5, OUTER 1). For a generated chunk, by its chunk distance `d` from HQ's chunk:
  `RING = 1 x 0.85^(d - 6)` past the legacy edge (about 0.44 at d = 11, 0.2 at d = 16), never below
  0.1. **Centre dear, edge free:** a chunk surveyed in the last 30 real days is FRONTIER and pays no
  ground rent (homesteading), which is Internet City's "edge free" with a clock that ends.
- **DEMAND** (0.8-1.25) is today's: crowding, mood and vacancy from yesterday's summary, per district.
- The land value is computed by the economy close from the summary and the registry (never stored per
  parcel in the sim), so it is the same number for everyone and moves only at the close.

---

## 2. CONSTRUCTION LIFECYCLE

### 2.1 The project record

Every structure change is a PROJECT, from any source:

```
{ id: "PRJ-0x2F1A", kind: "new" | "upgrade" | "facade" | "demolish",
  parcel: "C9.1/B5/P0" | "L:the-meridian", archetype: "tower-r3", storeys: [0, 9] (from, to),
  origin: "plan" | "emergence" | "assembly" | "player", owner: "dept" | "npc:<slug>" | "case:<hash>",
  filed: <mt>, permitDay: <day>, start: <mt>, hours: <machine hours>, crew: 6, because: "..." }
```

- `start` and `hours` are **fixed when the plan builder first writes the project into a day's plan**
  and never change after. **Legacy projects are backfilled as V0 events** with the old rule's exact
  start (`(breakDay - 1) x 24`) and duration (`LOT_BUILD` days), no hashed offset, drawn by the existing
  painters until BUILD_FROM (Codex objection 3). A delay, a stall or a cancellation is a new event from a later boundary
  (`STALLED from day D`), never a retime.
- The plan builder folds every source into `projects` for day D before building it (the way it folds
  `ent` for THE MALL and `emerge` for EMERGENCE), writes them into the f1 plan and the day's summary
  (`summary.build`, ~120 bytes a project), and keeps a ledger `build/latest` across gaps.

### 2.2 The stages (every client computes the same one)

`phase(project, mt)` is pure: `p = clamp((mt - start) / hours, 0, 1)`.

| Stage | When | What is drawn | What the sim does |
|---|---|---|---|
| PROPOSED | filed, before the docket decides (Assembly, player permit review) | the APPLICATION sign on the vacant parcel (today's LOT 0x6F07 face) | nothing |
| PERMITTED | approved, before `start` | survey stakes, the notice board: "GROUND BREAKS IN 1 H 12" | nothing |
| SITE | p 0-0.08 | hoarding in Department livery, the gate, the site office, the timer board | parcel closed (already solid) |
| FOUNDATION | 0.08-0.2 | the pit, the digger, piles, the crew | crew at work (from the boundary, below) |
| FRAME | 0.2-0.85 | concrete slabs and columns rising **one storey at a time** (storey k at `0.2 + 0.65 k / n`), scaffold on the top two storeys, a tower crane whose mast stays 3 storeys above the frame | as above |
| CLAD | 0.85-0.97 | the archetype's own facade (archDraw `drawBody`) revealed bottom up behind the scaffold; the crane comes down at 0.93 | as above |
| FIT-OUT | 0.97-1 | lights on floor by floor, the ribbon at the door | as above |
| OPEN | p = 1 | the building | places open from the first day the builder plans with them (`openDay`) |

- **UPGRADE (add storeys)**: the building stays open; the crane stands on the roof, scaffold wraps only
  the new storeys, the timer reads "1 H 31 +3" (three storeys coming: Internet City's "+N"). The new
  storeys' units open with the project.
- **FACADE**: scaffold and netting on the visible faces, no crane; the old facade swaps for the new at
  0.9.
- **DEMOLITION**: the reverse: hoarding, a wrap of netting, storeys removed top down, rubble, a cleared
  parcel. The building's places close from the first day planned after the project's `start`.

**The timers are the machine clock in real time.** One machine hour is one real minute, so
`hours` is minutes on the board. Default durations (catalog, per archetype): `hours = base + per_storey
x storeys`, scaled by crew (a crew of 2x the default builds in 0.6x, never faster):

| Example | Machine hours | Timer |
|---|---|---|
| a storefront fit-out (THE MALL, a new shop) | 26 | 26 MIN |
| a 3-storey walk-up | 40 + 3 x 12 = 76 | 1 H 16 |
| a 9-storey tower | 60 + 9 x 14 = 186 | 3 H 06 |
| adding 3 storeys to a tower | 3 x 14 + 20 = 62 | 1 H 02 +3 |
| a helipad on a roof (EMERGENCE) | 30 | 30 MIN |
| an Assembly civic build (LOT 0x6F07 today: 5 machine days) | 120 | 2 H 00 |
| a stadium or a new rail line | 1-3 real days | 1 D 4 H |

A player's session (20-40 real minutes) watches a frame rise several storeys. That is the point.

### 2.3 Folding into immutable plans (no retiming, ever)

- **The sim only sees a project from a day boundary.** A project's effects (crew posts, closed places,
  opened places) start on the first machine day the builder has not yet published when it picks the
  project up (today + 4 at most). The visual timer starts at `start` = that day's 00:00 plus a hashed
  offset (0-6 machine hours, so a dozen permits do not break ground in the same minute). The gap between
  approval and `start` is the PERMITTED stage: "GROUND BREAKS IN 1 H 12". It is the Department's permit
  queue, in the fiction; it is the lookahead, in the code.
- **Because walkers never cross parcels** (1.5), a site going up never moves a walk. Only places opening
  and closing (destinations) change plans, and those take effect only on unpublished days.
- **The crew are NPC jobs.** From `start`'s day to `openDay`, the builder adds a work place
  `site:<project>` (kind `site`, the parcel's district) and posts SITE LABOURER, STEEL FIXER, CRANE
  OPERATOR and FOREMAN (crew size from the project), drafted at the boundary from the census the way
  EMERGENCE posts its dispatchers: living, not players, off PROCESSING, middle band first (a new rung,
  not a perk). The crew walk there in the plan and are drawn on the site from the plan's rows. Today's
  three civic sites (LOT 0x6F07, the community farm, the resort parcels) draw anonymous crews; they
  become this.
- **Legacy phases are reproduced exactly.** `lotPhase`, `farmParcelPhase` and `resortPhase` today are
  three copies of one rule (`LOT_BREAK` 4, `LOT_BUILD` 5). They become three V0 project records (exact
  start, no offset) whose `phase()` equals the old functions at every machine minute (a golden check
  over the whole range, past and future), so no published day moves.

### 2.4 Drawing it cheaply

- **Procedural from massing, no art per building.** A building's massing (archGeo) already gives a
  footprint, a storey height and a style. The construction painter draws: the hoarding (a low prism on
  the parcel's edge with the timer board), the pit (a dark inset), the frame (per completed storey a
  slab outline and four corner columns: a few polygons), the scaffold (a lattice of lines on the two
  faces the camera sees, top two storeys), and `drawBody` clipped to the clad height. The tower crane is
  one shared drawer (lifted out of `civicDraw.js site()`, which has one today) with a mast height and a
  jib angle from the clock.
- **Level of detail.** Far: a yellow crane glyph and the hoarding outline; mid: the frame and crane;
  near: scaffold, crew sprites in hard hats (the existing site crew drawers), the load on the hook.
- **Caps.** At most 12 animated cranes a frame on desktop, 6 on phones (< 640 px), still under reduced
  motion; the rest draw their crane at rest. A site is at most ~60 polygons near; the static parts of a
  chunk are cached with the chunk (3.5).
- **Where the timer shows** (labels rule: off by default). Every site shows its crane always; the timer
  chip ("2 H 14 +3") on hover / tap, on the site's notice board at near zoom, and in NOW IN THE
  SUBSTRATE ("UNDER CONSTRUCTION: 7 SITES. NEXT TO OPEN: WHITE'S SECOND LOCATION, 26 MIN."). LABELS on
  shows every timer.

### 2.5 Rules against abuse (players and projects)

Codex objection 8: plans are public three days ahead and the frontier is rent-free, so land is an
option worth front-running, and a project record is an attack surface. So:

- **The browser never writes a project.** A permit is one server-side database transaction
  (serializable): it locks the parcel row and the wallet, checks ownership, derives every build field
  itself (archetype from the catalog, storeys within the rung's limit, hours and crew from the formula),
  escrows the CYCLES, and inserts the project with an idempotency key. A unique constraint allows one
  active project per parcel. The builder reads only committed rows.
- **Frontier land is not first-come.** A new chunk's parcels open to players by a weekly lottery among
  verified citizens (one entry per assessed case, the UBI enrolment caps), at most one frontier parcel
  per case per borough, with a district quota. The rent holiday belongs to the parcel's first build, is
  not transferable and does not restart on resale; a parcel with no groundbreak within 7 real days, or
  no occupancy within 30, returns to the Department (the "use it or lose it" rule).
- **Front-running the published days buys nothing**: land value moves only at the economy close from
  ended days (the market's rule), and a sale is banded at +-20% of assessed value.
- **Speed-ups** (question 4) are escrowed before the project is published, never refunded, capped at
  2x, and buy NPC crew, not time.

### 2.6 What uses it first

| Thing | Origin | Today | With the lifecycle |
|---|---|---|---|
| LOT 0x6F07, the community farm, the resort parcels | assembly | three bespoke phase functions | three project records, identical faces and timing (golden) |
| A new storefront opening (THE MALL) | plan (enterprise) | the shop appears on its day | a 26-minute FIT-OUT: scaffold on the shopfront, the awning going up, "NOW OPEN" at the ribbon |
| Helipads, the drone depot (EMERGENCE) | emergence | appear when the industry opens | a 30-minute rooftop build when the industry opens; the because-line names it |
| The river's 19 bridges | plan | built (layout 7) | recorded as COMPLETED projects (start before RIVER_DAY): history only, nothing drawn differently |
| New generated chunks | plan (growth) | n/a | each chunk's buildings start as PERMITTED and break ground over its first real day, staggered by hash, so a new district visibly builds itself in |
| Player floors, buildings, upgrades | player | n/a | slice 4 |

---

## 3. SIMULATION SCALING

### 3.1 What was measured (2026-10-05, `origin/main` 1e6517c, Mac M5 Pro, Node 24)

`scripts/bench-plans.mjs` (memo cap 1e8) and a production-memo run (`setMemoCap(max(200000, 60N))`, as
`plans.js` sets it), synthetic census, three to four consecutive days. Lambda ~9x the Mac (measured on
the social tick, 2026-09-29).

| N subjects | cold day | each further day | Lambda est. (x9) cold / further | plan f1 raw / gzip | peak heap (prod memo) | split (Mac) | 40 windows gzip, median / biggest |
|---|---|---|---|---|---|---|---|
| 5,000 | 5.0 s | 1.8 s | 45 s / 16 s | 1.7 MB / 0.7 MB | 353 MB (bench memo) | 0.9 s | 33 KB / 198 KB |
| 20,000 | 21.3-22.3 s | 7.5-9.4 s | 200 s / 80 s | **6.7-6.85 MB** / 2.8 MB | **1,021 MB heap, 1,192 MB RSS** | 4.6 s | 132 KB / 775 KB |
| 50,000 | 51.7 s | 21.9-23.0 s | ~465 s / ~200 s | 16.8 MB / n.m. | **2,500 MB heap, 2,654 MB RSS** | n.m. | n.m. |
| 100,000 (extrapolated, linear: ~50 KB of heap a subject) | ~105 s | ~45 s | ~16 min / ~7 min | ~34 MB | ~5 GB | ~25 s | n.m. |

Client painter (`iso.depthOrder`, all-pairs, run once per quarter turn): today's 870 boxes **31 ms**;
the city tiled 4x (3,480 boxes) **505 ms**; 10x (8,700) **2.5 s** on the Mac. Phones are 4-10x slower.

### 3.2 The ceilings, with evidence

| # | Ceiling | Evidence | Where it bites | Fix (section) |
|---|---|---|---|---|
| C1 | **The builder's memory.** Netlify functions run in 1,024 MB. | 20k peaks at 1,021 MB heap / 1,192 MB RSS with production memo (the 2026-09-29 doc said 520 MB at 20k: the city has since grown 3x in places and lines) | **~18-20k subjects, now.** The spec's "~40k" is out of date. | district-sharded build (3.3); the Mac as the build worker past 15k (3.4) |
| C2 | **The builder's cadence.** 60 machine days a real day; a background run is 15 min. | 20k: ~80 s a further day on Lambda + ~41 s split = ~2 min a day, 2 h of compute a real day; a 4-day backfill after an outage ~7.3 min | 100k on Lambda: ~7-10 min a day, which cannot keep 24 real minutes per day with any backfill | shard + Mac (3.3, 3.4) |
| C3 | **The one-file plan over the 6 MB response limit.** | f1 at 20k = 6.7-6.85 MB raw | `/api/plan/<day>/<ver>` (the browser's legacy fallback) fails at ~18k | retire f1 to the builder only; the fallback reads the split (3.5) |
| C4 | **The find index.** One file, ~54 bytes a subject | 1,071 KB raw at 20k | 6 MB at ~110k | 64 shards by slug hash (as the figure index) |
| C5 | **The summary grows with buildings.** | 131 KB / 36 KB gz at 5k, 144 KB / 45 KB gz at 20k with 185 buildings; per-building counts every 30 machine minutes dominate | at ~4,000 buildings (100k tier) ~3 MB raw on every page load | a district-level `summary/core` (O(districts)) + `summary/d/<district>` loaded with the district (3.5) |
| C6 | **The painter's sort is quadratic.** | 31 ms -> 505 ms -> 2.5 s (above) | any city 3-4x today's on a phone | per-chunk order (3.5) |
| C7 | **City content is bundled code.** | 185 buildings, 207 places in `sim.js` and seven `*Sim.js` | every growth is a deploy and a whole-city rebuild of constants | generated chunks + catalogs (1.3, 1.4) |
| C8 | **The market board.** ~230 bytes a listed human | 170 KB at 747 | 6 MB at ~26k listed humans | board split past 5k (ECONOMY_PROPERTY, already planned): top-N + 64 shards |
| C9 | **Supabase Free.** 500 MB database, 5 GB egress, Nano (shared CPU, 0.5 GB), 60 direct / 200 pooled connections | the ledger writes ~5 rows per collecting citizen per real day (UBI claim, txn, entries) plus market orders | ~400 MB within a year at 1k players; within weeks at 10k | Pro at the 5k-player trigger or 300 MB, whichever first (3.6) |
| C10 | **Bandwidth.** 20 credits a GB on Netlify | a cold city visit ~1-1.5 MB (bundle, summary, atlas, a few windows, faces), warm ~0.4 MB | 10k players ~180 GB / month; 100k ~1.8 TB, past Pro's largest credit tier | immutable day files and sprites to Cloudflare R2 + CDN at the 10k trigger (3.6, question 5) |
| C11 | **The social tick** | steady 60 machine hours: 20k 5 s Mac (~45 s Lambda); ledger 13.6 MB in 64 buckets | 100k ~4 min Lambda, buckets ~1 MB: fits | 256 buckets at 50k; nothing else |

### 3.3 The district-sharded builder

`buildPlan` is per subject except for two whole-roster couplings: the capacity allocation (`allocFor`:
every room's demand before anyone is placed) and the routes' shared memo. Split it into three phases:

1. **ALLOC** (one worker): the whole roster's demand per room per half hour, the allocation, the
   enterprise / emergence / projects steps. Output: `alloc/<day>` (per subject: work place, leisure picks,
   a few bytes each; ~1 MB at 100k). Cost: the cheaper part (routes were 81% of a cold build, 2026-09-29).
2. **ROWS** (one worker per SHARD; a shard = a group of home districts holding at most ~15k subjects):
   each subject's day from its allocation; routes for that shard only (the memo is per shard, so the heap
   is bounded by the shard). Output: `rows/<day>/<shard>`, write-once.
3. **SPLIT + COMMIT** (one worker per sector group): the window files, the summary pieces, the find
   shards; then the manifest, last, with an etag condition (unchanged rule: a listed day is complete).

Determinism: a subject's row depends only on (allocation, roster record, world on the day, seed), so
rows built in any shard, in any order, on any machine, are the same bytes; the day's version is the hash
of the assembled f1 (built in memory by the commit step only when it is needed) or of the sorted list of
shard hashes. **Checked: sharded == monolith** (byte for byte at 5k and 20k, the relations check's
pattern).

### 3.4 Where it runs: Lambda, then the Mac, then both

- **Up to ~15k subjects:** today's single background function (fits 1 GB with margin).
- **15k-50k:** the Mac (verified always-on: `pmset sleep 0`, AC, uptime 10 days on 2026-09-29) runs the
  builder under launchd every 5 real minutes (never `/usr/bin/python3`-style shims: `node` by absolute
  path), holding the same Blobs lease and writing with the same write-once keys through the Blobs API.
  The Lambda builder stays deployed as the **fallback**: when the lease is free and tomorrow is not
  planned 2 machine hours before it starts, Lambda builds in sharded mode (ROWS fan out to several
  background invocations). Either runner produces the same bytes, **but today's publisher does not make a race harmless**
  (Codex objection 4, verified): the lease is never renewed (`plans.js` `lease.acquire` sets `until`
  once), and a runner that loses the manifest race can split its own cached JSON under the winner's
  version. Before the Mac runs: a **fenced lease** (a token that increments on every acquire, renewed
  every minute, checked on every write), and before every split or manifest write the runner checks
  `sha256(f1 bytes) == the manifest's version`; on any conflict it drops its local JSON and re-reads
  the winner's f1.
  `plan-health.mjs` already alarms when tomorrow is missing.
- **50k-100k+:** the Mac builds ALLOC and SPLIT; ROWS fan out to parallel Lambda background workers
  (each a shard under 1 GB), or to Mac worker threads (the M5 Pro has the cores: 100k is ~10 shards).
  Budget per machine day at 100k: ALLOC ~20 s, ROWS ~60-90 s of Mac CPU over 10 threads, SPLIT ~25 s:
  well inside 24 real minutes, with room for a 4-day backfill.

### 3.5 What the browser loads (streaming and level of detail)

- **World:** `/api/world/<ver>` (the registry, immutable; 200 KB at 1,000 chunks), then
  `generateChunk` for the chunks in view, cached by chunk and `genV`.
- **Painter:** the legacy core keeps its one `depthOrder` (31 ms per quarter turn). Each generated chunk
  sorts only its own boxes (a chunk's content never crosses its edge; viaducts run over arterials and are
  cut into per-chunk pieces), cached per chunk per quarter turn. Chunks draw back to front by their own
  diagonal. That is exact for opaque prisms wholly inside disjoint chunk squares (Codex objection 6
  agrees), so it is enforced as an invariant, not assumed: every box of a chunk lies inside its square;
  the things that are not boxes inside one square (viaduct pieces on the arterials, cranes overhanging
  the street, trains and walkers, shadows, labels) go in a **border strip** pass slotted by the existing
  `slotForBox` against the two chunks they touch, and labels draw last as today. `check-world` fuzzes it:
  random generated chunks with maximum heights and cranes, at all four quarter turns, the per-chunk order
  compared against the global `depthOrder`. Off-screen chunks are skipped
  before anything else.
- **Far view:** a chunk impostor (the blocks' footprints in their zone colours with height silhouettes),
  drawn once into the cached ground layer the river already uses; people are the summary's dots.
- **People:** unchanged in shape: a sector (district) loads its window when zoomed in; the far view
  reads `summary/core`; a district's per-building counts arrive with `summary/d/<district>`.
- **The fallback** (Codex objection 5): a day with no complete split is never drawn from a different
  day's files. The browser shows the city's ground and the far view's last good counts with the line
  "THE DEPARTMENT IS STILL COUNTING", and draws nobody up close until the split lands; the f1 file is
  no longer served to browsers (C3). `plan-health` already alarms when tomorrow is not split.

### 3.6 Budgets per tier

Assumptions (state them, then measure): players ~ cases with a wallet; 30% visit on a given day, 2
sessions each, ~1 MB a session averaged (cold and warm); NPC census grows with the roster engine and
referrals, independently of players. Costs are the published list prices below; credit top-ups beyond a
plan's base are estimated at the Pro base rate ($20 / 3,000 credits). **These are hypotheses, not
measurements** (Codex objection 7): the 50k and 100k rows extrapolate, Lambda x9 was measured once on
the social tick, and the Supabase growth is a row count, not a load test. Slice 3 ships a reproducible
production-memo benchmark (`bench-plans.mjs --prod-memo`) and a write / read / row model, and the tier
triggers are re-read from it. R2 has no egress fee but charges per operation (reads and writes), which
the 10k decision must price.

| Tier | Players / NPC census | Chunks (homes) | Builder | Blobs live objects (plans) | Bandwidth / month | Netlify credits / month (est.) | Supabase |
|---|---|---|---|---|---|---|---|
| **Now** | ~0 / 840 | legacy (4,972 homes) | Lambda, ~1 s a day | ~500 | small | well inside Free/Personal | Free |
| **1k** | 1k / 5k | legacy + ~10 (≈ 7k homes) | Lambda: 16 s a further day, ~25 min compute a real day (~120 credits) | ~600 (80 windows + parts a day x 6 days) | ~18 GB (~360 credits) | ~500-600: **Personal ($9, 1,000)** | Free; Pro when the DB passes 300 MB |
| **10k** | 10k / 20k | legacy + ~40 | **the Mac** (C1), after the fenced lease; Lambda fallback in sharded mode | ~1,500 | ~180 GB (~3,600 credits) | ~4,000-4,500: **Pro ($20) + top-up**, or ~1,000 after moving day files and faces to R2 | **Pro ($25 + Micro covered by its $10 credit)**; egress fine (250 GB) |
| **100k** | 100k / 100k | legacy + ~250 (≈ 105k homes) in ~50-60 districts | Mac ALLOC/SPLIT + parallel ROWS | ~3,000 (60 districts x 4 windows x ~2 parts, 6 days) | ~1.8 TB: **on R2 + Cloudflare CDN (no egress fee)**, Netlify serves the app and the APIs | ~3,000-6,000 for functions and requests | Pro + Small/Medium compute (~$15-60/month), connection pooler (200-600 clients) |

Writes to Blobs: one write per window part per day; at 100k ~500 a machine day, ~30,000 a real day:
Blobs documents no request quota, but each write is function time, which the credits above count.

**External figures (checked 2026-10-05):**
- Netlify credit plans: Free 300 credits/month ($0), Personal 1,000 ($9), Pro from 3,000 ($20) up to
  20,000; 20 credits per GB bandwidth, 10 per GB-hour of function compute, 2 per 10,000 web requests,
  15 per production deploy (docs.netlify.com, "Credit-based pricing plans" and its billing FAQ).
- Netlify Functions: 60 s synchronous, 15 min background, 30 s scheduled, 1,024 MB, 6 MB buffered
  response (docs.netlify.com "Functions configuration", "Scheduled functions").
- Netlify Blobs: object up to 5 GB, key up to 600 bytes, metadata 2 KB; no published object-count limit
  (docs.netlify.com "Netlify Blobs").
- Supabase: Free 500 MB database, 5 GB egress, pauses after a week idle; Pro $25 with 8 GB disk
  ($0.125 / GB over), 250 GB egress ($0.09 / GB over), $10 compute credit (covers Micro); Nano and Micro
  60 direct / 200 pooled connections, Small 90 / 400 ($15), Medium 120 / 600 ($60) (supabase.com/pricing,
  docs "Compute and disk"). Our functions reach Postgres through PostgREST (`/rest/v1/rpc`), so client
  connection counts are PostgREST's pool, not one per function call.

### 3.7 The rest of the city at scale

- **Relations:** unchanged design (bounded K = 24 per subject, meeting circles of 400, 64 buckets); 256
  buckets at 50k. The tick reads window files per sector, so it shards the same way as the builder.
- **The market:** the board split past 5k listed humans (top-N + 64 shards), already in the market design;
  NPC investors stay at 40.
- **The newspaper** (in build): a fixed budget of stories a real day (front page, one page per borough,
  notices), written from `summary/core` and the district summaries, never from window files. Cost is
  per borough, not per subject.
- **Emergence, drives, civic fold:** per district already (O(districts)); the civic block is ~780 bytes a
  district: 60 districts ~47 KB, so it moves into the district summaries and `summary/core` keeps the
  mood word and the table.

---

## 4. MANAGEABILITY

### 4.1 The catalog workflow

1. An agent adds an archetype or a zoning palette to `world/*.json` (data only, no code).
2. `npm run world:preview -- C9.1` renders the chunk at the four quarter turns, 1440 and 390, into
   `docs/screens/world/` (the existing screenshot tooling), with the plan-build cost at 5k.
3. `check-world` must pass; then the record lands (section 4.3).

### 4.2 The developer city editor

`#city?editor=1` (dev builds only, never shipped): pick a frontier chunk square, paint a zone per block,
pick a district (or name a new one), see the generated chunk live, export the record. The editor writes
only a JSON record; the validator decides. No hand geometry for generated chunks, ever.

### 4.3 How agents and nightly loops add districts safely

- A district is added by **appending records** to `chunks.json` (and `districts.json`) with `fromDay` from
  `scripts/world-append.mjs`, which reads the live manifest and sets `fromDay = newest published + LOOKAHEAD
  + 2`. Never by editing a published record.
- **Growth is driven by the city, not by a calendar.** The builder measures, per borough, homes
  occupancy and the longest commutes (the measures EMERGENCE already takes). Past a threshold for some
  days (hysteresis, as EMERGENCE), the Department files a SURVEY: inside an existing borough, infill
  chunks are appended automatically (question 3); a new borough goes to the Assembly (decided). The
  nightly loop's job is then to make the catalogs better, not to place districts by hand.

### 4.4 `scripts/check-world.mjs` (in `run-checks.mjs`)

- **Append-only:** every record on `origin/main` is byte-identical in the working tree; new records have
  `fromDay` later than the newest published plan + LOOKAHEAD + 1 (the live manifest, or a fixture offline).
- **Published-day immutability:** a fixture day built before each new world version rebuilds byte for
  byte (the river check's pattern), at 430 and 1,500.
- **Geometry:** no two parcels overlap; every parcel touches a street; no building outside its parcel;
  no generated chunk on a legacy square; nothing on water; viaducts over arterials only.
- **Connectivity:** the street lattice of every borough is one component; every home within `ACCESS_R`
  of a station; every station on a line in service; every arterial the river crosses bridged.
- **Planning rules carried from the master plan:** heavy industry only in `ind` / `port` zones with a
  `park` buffer before any home; every home within 20 cells of green; venues on stations.
- **Determinism:** `generateChunk` twice, in two processes, gives the same bytes; no `Math.random`, no
  `Date` in the generator (read from the source).
- **Budgets:** plan build at 5k under its recorded time + 20%; per-chunk painter order under 5 ms.

---

## 5. MIGRATION PLAN, smallest first

| Slice | What lands | What Scott sees | Risk | Checks |
|---|---|---|---|---|
| **1. Construction you can watch** | `src/city/construction.js` (project records, `phase()`), the construction painter (procedural stages, the shared crane), `summary.build`; the three civic parcels as V0 projects (exact old timing, old painters before BUILD_FROM); THE MALL's openings as 26-minute fit-outs; EMERGENCE's pads as 30-minute builds; the river's bridges as completed history. From `BUILD_FROM` day (newest published + 4 when it ships). | cranes and timers in the city the day it ships: shops fitting out, helipads going up; NOW lists the sites | low: render plus a summary block; the sim's places open on the same days as before | old lot phases == projects at every machine minute of the published range (golden); days before BUILD_FROM byte-identical; progress only ever increases; the frame never exceeds the target storeys; caps hold at 390 |
| **2. The chunk index** | `world/legacy.json` (every legacy building's chunk and parcel `L:<id>`), parcel land values in the economy close, the legacy core as one painter group; no ground change, no layout version | nothing visible; the property slice can key on parcels | very low | every legacy id maps to one parcel; parcels do not overlap; the land value equals BASE x RING x DEMAND by hand at 5 parcels |
| **3. The district-sharded builder** | the fenced lease and version check first; ALLOC / ROWS / SPLIT, the Mac runner, f1 retired from browsers, find shards, `summary/core` | nothing (it is the floor under 20k) | medium: the city's publishing path | sharded == monolith byte for byte at 5k / 20k, every shard permutation, cold and warm memo caps, across a world-version boundary (allocation is roster-order dependent: rows are assembled in roster order, never shard order); the fallback builds when the Mac is stopped; a killed run resumes |
| **4. Frontier growth** | `worldOn(day)`, `generateChunk` v1, catalogs v1, the street-lattice router, per-chunk painter, the first generated district (the OUTER RING stage of PHASE 2, or the first SURVEY) | a new district building itself in over a real day, cranes everywhere at its edge | medium-high: the first change to how ground is made | check-world; a day before the first generated chunk byte-identical; the router == the corner graph on legacy legs; phone frame time at 390 with 50 generated chunks |
| **5. Player plots and the ladder** | properties keyed by parcel and cutaway ids (Supabase), PERMIT -> project from the economy API, the close's `econ` block naming owners and projects for the next plan, timers on MY FILE | "build" on your own parcel: your crane, your timer, your fascia | medium: CYCLES and ownership | permits only by the server transaction (2.5); one active project per parcel (constraint); frontier lottery and quotas; no project retimed; speed-up escrowed, capped at 2x, CYCLES only |

Each slice ships alone and is useful alone. Slice 1 needs nothing from the others.

---

## 6. Open questions for Scott (5)

1. **Keep the hand-built core frozen as it is, or regenerate it from the catalogs?**
   Options: keep it (every id, every published day, every landmark; generated chunks grow round it) /
   regenerate it (one look everywhere, but a big layout migration, every place moved, every published
   day redrawn on new ground). **Recommend: keep it.** The core is where the story already lives; the
   frontier is where the new look goes.
2. **How fast do things build?** Options: the machine clock (a 9-storey tower 3 H 06 real, a shop 26 MIN) /
   twice as fast / half as fast. **Recommend: the machine clock.** A session sees floors rise; a big
   build is an evening.
3. **Infill inside a borough: automatic, or every chunk by vote?** Options: automatic infill when the
   borough's homes pass 90% for some days (new boroughs still by vote, as decided) / every chunk by vote.
   **Recommend: automatic infill.** The Assembly decides where the city goes, not every block.
4. **Can a player pay CYCLES for a bigger crew?** Options: yes, capped at 2x speed / no, everyone waits the
   same. **Recommend: yes, capped.** CYCLES only (never money: the terms' no-paid-boosts rule), and the
   crew are NPC jobs, so a rush hires people.
5. **At the 10k-player trigger, move the immutable day files and faces to Cloudflare R2?** Options: R2 +
   CDN (no egress fee; the app and the APIs stay on Netlify) / stay on Netlify and buy credits (~$80-100
   a month at 10k, past Pro's largest tier near 100k). **Recommend: R2 at the trigger,** not before.

---

## 7. The Consortium review

Codex (2026-10-05) challenged determinism, migration safety, cost and exploitability; five objections
were BLOCKING. Claims about the code were checked before accepting them.

| # | Objection | Verdict | What changed |
|---|---|---|---|
| 1 | BLOCKING: `genV` versions the generator but not the catalogs, which agents may edit, so old chunks could change | right | catalogs are content-addressed snapshots; records name `cat`; `worldHash` in every plan, project, summary and memo key (1.3) |
| 2 | BLOCKING: "construction never changes walks" is false for the legacy core (LOT 0x6F07 is walkable, the foot graph is static), and the route memo key omits the network | right, verified (`OPEN_LOTS`, `route()` keys on ground only) | the rule applies to generated parcels only; legacy keeps its graph verbatim; routing keyed by world, network and ground; portal nodes at the core's edge (1.5) |
| 3 | BLOCKING: the civic phases cannot be "exact" with a hashed start offset; the legacy index needs versioning anyway | right | V0 projects with the old exact start and duration, old painters before BUILD_FROM; `legacy.json` gets a day and a hash (1.2, 2.1, 2.3) |
| 4 | BLOCKING: a Mac/Lambda race is not harmless: the lease is never renewed and a loser can split its own JSON under the winner's version | right, verified in `plans.js` | fenced, renewed lease; `sha256(f1) == version` before every split and manifest write; re-read the winner on conflict; it gates the Mac runner (3.4) |
| 5 | MATERIAL: sharded equivalence needs order-sensitive proofs; "nearest split day" is a different city | right | the check covers shard permutations, memo caps, world boundaries; rows assembled in roster order; the fallback degrades instead (3.5, slice 3) |
| 6 | MATERIAL: chunk-diagonal order holds for contained prisms only; viaducts, cranes, movers break the premise | right (Codex agreed the core claim is sound) | containment invariant, a border-strip pass, and a fuzz check against the global order (3.5) |
| 7 | MATERIAL: the tier table is extrapolation; 250 chunks cannot make 300 districts; R2 charges operations | right; Codex re-ran 20k and confirmed 6.85 MB f1 and ~1,047 MB heap | districts corrected to ~60 at 100k, Blobs and civic numbers redone, the table labelled hypotheses, a reproducible benchmark in slice 3 (3.6) |
| 8 | BLOCKING: player plots are exploitable (front-running a public 3-day lookahead, rent-free frontier, client-shaped project records) | right | server-derived permits in one transaction, one active project per parcel, a frontier lottery with quotas, a parcel-bound non-restarting rent holiday, use-it-or-lose-it, escrowed speed-ups (2.5) |

Nothing was rejected. What survived unchanged: the chunk model and the legacy freeze, the lifecycle and
its pure `phase()`, the measured ceilings (C1 confirmed independently), the slice order.

---

## Appendix: where today's code maps

| Today | In CITY 2 |
|---|---|
| `sim.DISTRICTS` (20, hand rects) | the legacy core's districts; new ones from `districts.json` + chunk records |
| `BUILDING_LIST`, `*Sim.js`, `*Geo.js` | the legacy core, frozen; generated chunks use `archGeo` styles via archetypes |
| `layoutOn(day)`, `RIVER_DAY`, `NET` | `worldOn(day)` folding the registry; `LINES` unchanged (append-only) |
| `lotPhase`, `farmParcelPhase`, `resortPhase` | `construction.phase()` over project records |
| `enterprise.js` units, `emergence.js` pads | project sources |
| `iso.depthOrder` over everything | legacy group + per-chunk orders |
| `plans.js buildPlans` (one process) | ALLOC / ROWS / SPLIT, Mac or Lambda |
| ECONOMY_PROPERTY rings by district | RING by district (legacy) or chunk distance (generated) |
