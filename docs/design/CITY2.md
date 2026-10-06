# CITY 2: a city that grows by chunks and builds in the open (design, 2026-10-05)

Status: **PROPOSAL, nothing built.** For Scott's review. Consortium: drafted by Claude, challenged by
Codex, external numbers checked (Perplexity, cited in section 3.6). The challenge and what changed
are in section 7.

**Revised 2026-10-06, section 8: THE REAL-SCALE REBUILD.** Scott reversed decision 1 ("keep the
hand-built core frozen"): the city is rebuilt at real-world scale, every id kept, at one announced
day boundary. Sections 1-5 stand except where section 8 says otherwise (the legacy core is no longer
frozen; it becomes the first generated world). Section 8 was challenged by a fresh Opus seat (Codex
was out of usage until 2026-11-04); its objections and what changed are in 8.9.

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

## 8. THE REAL-SCALE REBUILD (2026-10-06, supersedes decision 1)

**Scott (2026-10-06):** "It still doesn't seem like I can walk through the streets with a controller.
I don't have the third person view. Let's have the user interface reflect more of an actual
world-scaled view. When scaling the city, consider how big everything is. The up and down onto the
Strip stations: people just float up and down. There should be stairwells, and actual stations for
them to sit at. This is why I was asking: do we want to rebuild the city?" Decision: **REBUILD AT
REAL SCALE.**

### 8.0 Why the city floats (measured, `origin/main` 0bcc420)

The city has no unit. Everything is a "cell", and the cell means different things to different
things:

| Thing | Today | In cells | What it implies |
|---|---|---|---|
| a person (sprite) | `PERSON_H 1.9`, "up to ~2.8 cells tall on the map" (`streetKit.js:16`, `sim.js:2087`) | 1.9 | a person is **as tall as a storey** |
| a storey | `STOREY 2.1` (`iso.js:20`) | 2.1 | at 3.2 m a storey, a cell is 1.5 m, a person 2.9 m |
| a 5-storey walk-up of 60 homes | `cathedral-walkups` lot 11 x 5 (`sim.js:436`) | 55 | at 4 m a cell it is a real 44 x 20 m building; at 1.5 m a cell it is a shed |
| walking | `V_WALK 60` cells a machine hour (`sim.js:1688`) | 1 cell a real second | at 4 m a cell people walk at **0.24 km/h**, twenty times slower than life |
| the Loop's deck | `DECK 1.5` storeys = 3.15 cells (`iso.js:22`), 2.6 storeys in the stack view (`city3d.js:22`) | 3.15 | a platform at 3 m: head height, not an elevated railway |
| the stairs | `stairsDur = dist(gate, entrance) / V_WALK` (`sim.js:2284`); `PLATFORM_OFF 0.9` | 0.9 | **a 0.9-cell horizontal hop with `climb` 0 -> 1 and no z**: the float Scott saw |
| a train car | `CAR_LEN 2.4`, 16 seats (`sim.js:1691`) | 2.4 | a 16-seat car the length of a person |
| the river | 1.2-1.5 cells wide through the city (`river.js:97-107`) | 1.3 | a ditch, if a cell is a metre |
| the whole city | x -104..286, y -125..102 | 390 x 227 | 20 districts, 185 buildings, 4,972 homes |

The ratios cancel on screen (a walker moves a body length a second, so it reads as a stroll) and the
dollhouse looks fine from the iso camera. The moment a camera stands on the street at a person's
height, every one of these contradictions is visible at once: the platform is at head height, a
person is a storey tall, a train is two people long, the stairs are a teleport. **The commute data
says the same thing from the sim's side** (`commuteHours` over every home x work pair, 5,720 pairs,
nominal worst-case wait): **median 103 machine minutes, p95 186, max 216.** People in the Substrate
spend three to six hours of every machine day commuting, because the city is wide in cells and
walkers are slow in cells. Real scale with real speeds fixes both the look and the day.

### 8.1 CITY UNITS: the one scale standard

**1 cell = 1 metre.** x east, y south, z up, positions to 0.05 m. Every renderer, the sim, the
checks and the catalogs read `src/city/units.js` and nothing else defines a size. (The published
days before the switch keep their old cells and are drawn by the frozen legacy module; 8.5.)

**People and motion**

| | Value | Why |
|---|---|---|
| stature | 1.75 m (sprite `statureOf` spreads +-0.1), eye 1.6 m, seated 1.3 m, shoulders 0.5 m, footprint radius 0.3 m | anthropometric medians |
| walking | **1.4 m/s = 5.0 km/h = `V_WALK` 5,000 m a machine hour** (83 m a machine minute); 1.0 m/s where a place holds more than 2 people a square metre | Fruin's pedestrian levels of service |
| stairs | 0.6 m/s along the slope up, 0.75 down (about 0.3 m/s of rise); `V_STAIR` | Fruin, Templer |
| escalator | 0.5 m/s along a 30 degree incline (0.25 m/s of rise), standing; walkers add their stair speed | EN 115 / NFPA 130 standard speed |
| lift (station) | 1.0 m/s, 13 persons, cab 1.6 x 1.4 m, door 1.1 m, 12 s of doors a stop | low-rise traction |
| lift (tower) | 2.5 m/s to 20 storeys, 4.0 m/s above; 10 s of doors a stop; one car per 6 storeys or 60 units, at least two from 7 storeys, an express shaft from 14 (the cutaway has one) | office-building rules of thumb |
| the player (DRIVE YOURSELF) | walk 1.4 m/s, run 3.0 m/s, the same stairs and lifts as everyone (today `WALK_SPEED 3.2` cells/s, `RUN 6.4`) | you are a citizen, not a drone |

**Buildings**

| | Value |
|---|---|
| storey, residential | 3.2 m floor to floor |
| storey, office / civic | 3.8 m |
| ground floor (shopfront, lobby) | 4.5 m; a tower lobby 6.0 m (one level) |
| basement | 3.5 m; parapet 1.1 m; roof plant 2.5 m |
| doors | flat 0.9 m; shop 1.0 m, double 1.8 m; lobby 2 x 1.8 m; station gateline 2.4 m (4 gates x 0.6 m, no fares: the Department logs you); lift 1.1 m |
| storeys per building | `tower.js` `STOREYS` by style (projects 8, brownstone 5, lofts 6, glass 14, office 14, hotel 7 ...), which `check-cutaway` already holds equal to the massing's `rise`: these become the authority. A 14-storey glass tower = 4.5 + 13 x 3.8 = **53.9 m**; a brownstone 4.5 + 4 x 3.2 = 17.3 m; HQ's monolith (rise 11.5, civic) 6 + 10.5 x 3.8 = 46 m |
| footprint | from the legacy lot at **4 m a legacy cell** (a 11 x 5 lot -> 44 x 20 m -> the 40 x 20 parcel template), never below 80% of that area |
| helipad | 18 x 18 m FATO on a 1 m deck; helicopters at 60 m over the roofline at 160 km/h, drones 15 m over it at 50 km/h, 1.2 m across (`emergence.js` `HELI_ALT`/`DRONE_ALT` in metres) |

**Streets and blocks** (the chunk model of section 1 at real size)

| | Value | Why |
|---|---|---|
| **BLOCK** | **80 x 80 m** buildable (6,400 m2); edge blocks on an avenue 75 m deep | Portland 61 m, Manhattan 80 m short side; the walkable-city range (Jacobs, Speck) |
| **local street** | **20 m**: 2 lanes x 3.3, 2 parking / loading x 2.5, 2 sidewalks x 4.2 (2.4 m clear + 1.8 m of trees, lamps, benches, signs) | NACTO Urban Street Design Guide |
| **avenue** | **30 m**: 4 lanes x 3.3, 2 parking x 2.5, median 1.8, 2 sidewalks x 5.0; the Loop and the shuttles run on avenue medians | NACTO; Chicago's L over Wabash, Vancouver's SkyTrain |
| service lane | 6 m, mid-block on the row-lot template, no sidewalk | |
| promenade / plaza | 12-30 m, pedestrian (THE BOARDWALK 1,200 x 12 m; HQ's plaza 200 x 200 m) | |
| **grid pitch** | 100 m (80 + 20) | |
| **CHUNK** | **400 x 400 m = 4 x 4 blocks**, the chunk-edge street an avenue; the 5-minute walk | ITDP / TOD standard 400 m |
| parcels per block | 1 whole (tower, civic, venue); 2 halves 80 x 40; 4 quarters 40 x 40; 16 small 20 x 20; 2 rows of 8 row lots 10 x 40 with the 6 m lane (a Philadelphia row house) | the section 1.1 templates, sized |
| setbacks | 0 on avenues (shopfront to the back of the sidewalk), 3 m on local streets, 6 m front yards in THE SUBURBS; lot lines 15 x 30 m there | |
| ACCESS_R | **400 m of walking** to a station entrance (not crow-flies; today 32 cells crow-flies) | TOD |

**Rail**

| | Value | Why |
|---|---|---|
| car | **18.0 x 2.65 x 3.5 m, 40 seats, 60 at the sim's 1.5 x seated rule** (`CAR_CAP` 40) | a metro car |
| train | 2-4 cars, 36-74 m; `V_TRAIN` **36,000 m a machine hour**: the running speed between stations, acceleration and braking included (70 km/h top); dwell is on top of it, counted once; `DWELL` **1.5 machine minutes kept** (90 s: long for a metro, right for a people mover with level boarding, and longer than the one-minute census period so every alighter is seen alighting, `sim.js:1695`); terminal `LAYOVER` 3 min kept; `LOOP_CLEAR` becomes a **braking distance of 150-200 m** (today 1.1 cells) | metro running speeds 30-40 km/h |
| `PLATFORM_MIN` | **1 machine minute** (today `0.1` h = **6 minutes**, `sim.js:1694`: it stood in for the stairs and the gateline, which are now explicit edges with their own durations) | |
| the Loop | a **downtown people mover**: ring 3.2 km on the core's north and south avenues and two cross avenues, 10 stations ~320 m apart, 10 three-car trains, headway 122 s (`minGap` = 90 s dwell + ~15-20 s for the braking distance and the train lengths at 10 m/s: feasible), **lap 20.3 machine min** (3,200 m / 10 m/s + 10 x 90 s), 1,800 riders aboard at the rule (today 15 trains, lap 42.8 min, 1,296) | Detroit People Mover 4.7 km / 13 stations; Miami Metromover |
| elevated line | rail top **8.0 m** over the street (5.5 m clearance for an avenue, 1.2 m deck, 1.3 m structure); platform **9.1 m** (1.1 m over rail); double-track viaduct 9 m wide, single 4 m; piers every 25 m, 1.2 m square | |
| **platform** | **80 m** (4 cars + 4), side platform 4.0 m wide, island 8 m; a 0.6 m yellow edge strip; canopy over the middle 48 m at 3.0 m; **6 benches of 3 seats (1.8 x 0.5 m) a side = 18 seats**, a 10 m leaning rail, a timetable board, a shelter at the stair head | NFPA 130, ADA |
| **vertical circulation per station** | a stair at each end of the platform, an escalator pair at the busy end, one lift (two means of egress, NFPA 130) | |
| stairs | riser 0.17 m, tread 0.28 m (31 degrees), flights of up to 16 risers, 1.5 m landings, **2.4 m wide**; 9.1 m of rise = 54 risers = 4 flights, a dog-leg core 2.4 x 6.5 m, climbed in **~30 s up, ~25 s down** | IBC 7/11 |
| escalator | 30 degrees, 1.0 m step, 0.5 m/s; 9.1 m of rise = 15.8 m of run + 2 x 2.3 m landings = 20.4 m, **36 s standing**; a pair 2.6 m wide | EN 115 |
| lift | 9.1 m in 9 s + 12 s of doors: ~21 s a cycle | |

**Terrain and water**

| | Value |
|---|---|
| the river (THE ATTRITION) | **12-18 m bank to bank** through the city (today 1.2-1.5 cells), 60 m at the mouth, 100 m in the sea; banks 1.5 m over the water; bridge decks 3 m over it: foot 4 m, trail 2.5 m, road 20 m, rail 9 m, the boardwalk's 12 m |
| the mountain (THE HEIGHTS) | footprint 1.6 x 1.6 km, **summit 320 m** over the village (its signs keep the ski resort's own feet: "4,241 FT" is fiction on a board, not geometry); the Alpine Line climbs 280 m over 2.4 km, a 12% rack railway; chairlifts 2.5 m/s, the gondola 5 m/s; terrain a procedural heightfield in metres (`terrainH`), 10 m resolution where it is sampled |
| the coast | a beach 60 m deep from the boardwalk to the water; THE PIER 200 x 8 m; sea level z 0, the city's ground z 3 |
| the airport | a 1,500 x 30 m runway, 20 m taxiway, apron, THE TERMINAL building: 2.0 x 0.4 km (5 x 1 chunks) |
| farmland | fields 200 x 100 m; THE ORCHARDS 280 x 260 m; a farm chunk is 16 ha |

**Venues** (game space stays the game's own; this is the footprint in the city)

| Venue | Footprint | Where |
|---|---|---|
| THE BOWL (stadium) | 220 x 180 m (2 x 2 blocks and the street between) | THE ARENA |
| THE DIAMOND (ball field) | 120 x 120 m (a 330 ft outfield) | THE ARENA |
| the pitch | 120 x 80 m (105 x 68 + run-off) | THE SPRAWL |
| the courts (tennis club) | 4 x (36 x 18 m), a quarter block | THE SPRAWL |
| THE LANES | indoors: a 20-lane alley is 40 x 30 m, on the Arcade's 80 x 40 upper floor | THE STRIP (id unchanged) |
| THE GREENS (golf) | 9 holes on 32 ha (2 chunks); a real 9 is 30-40 ha | THE HEIGHTS' foothills |
| skate park | 60 x 40 m | THE COMMONS |
| THE PIT | below ground, 1 block | THE WORKS |
| the hunt lodge | in the 1.2 km x 150 m forest belt | THE FOOTHILLS |

**Cameras and zoom**

| View | Standard |
|---|---|
| THIRD PERSON (DRIVE YOURSELF, `streetScene.js`) | chase camera 3.5 m behind, 2.2 m high (today `CHASE` 6.2 cells / 2.7), FOV 72 degrees, FAR **220 m desktop / 140 m phone** with fog (today 64 / 40 cells) |
| STREET (the drone tour) | eye 1.6 m (a person's), same FAR |
| ISO | px a metre: **far** 0.15-1 (a district a phone screen; chunk impostors), **mid** 1-6 (a block a phone screen; massing, people as dots), **near** 6-16 (a storefront a phone screen; facades, sprites: at 14 px/m a person is the same 25 px the sprite bank draws today) |
| MAP | the same model in 2D; 1 px/m makes a chunk 400 px |
| CUTAWAY | levels at their real z; a person 1.75 m in a 3.2 m storey (today a person fills the storey) |

### 8.2 One world model, four views

Today three renderers read three height conventions (iso: `STOREY` 2.1 cells and massing `rise`;
stack view: `FLOOR_H 2.1 / SPAN`, deck 2.6 storeys; street: `(topLevel + 1) * FLOOR_H` for collision
but the massing for drawing), and the sim has no z at all, only `climb` on one leg. The rebuild
replaces them with **one world model** that every view derives from:

```
 src/city/world/
   units.js        the standard above, as constants (METRE, STOREY_RES, V_WALK, ...)
   worldOn(day)    (section 1.5) -> WORLD: chunks, blocks, streets, parcels, buildings, places,
                   stations, lines, river, terrain, props, venues: every one with x, y, z, ids
   building        footprint polygon (m), z0 from terrain, levels[] {id "<b>:L<n>", z0, z1, use},
                   lobby level, cores[] {kind stair|lift|express, x, y, zRange}, doors[] {x, y, z, w, street}
   station         entrances[] (gateline, x, y, z), circulation[] {kind stair|escalator|lift, path [[x,y,z]...],
                   speed, dir}, platforms[] {rect, z, edge, benches[] {x, y, yaw, seats}, shelter, board}
   line            track centreline with z(s) (viaduct 8 m, the Alpine ramp, at grade in the Port), stops -> platforms
   street          centreline, class (local|avenue|lane|promenade), profile (lanes, parking, sidewalks), lamps/trees from the profile
   terrain         z(x, y): 3 m city datum, the mountain's heightfield, the beach to z 0
   props           benches, shelters, lamps, trees, signs, bins, the beige PCs' kiosks: id, kind, x, y, z, yaw
```

- **The iso view** projects `(x, y, z)` with `Q(x, y, z) = [(u - v) z_px, (u + v) z_px / 2 - z z_px]`
  (today's `project` with h in storeys replaced by z in metres); the massing drawers (`archGeo`,
  `archDraw`) keep their parts in storeys and multiply through the building's own level table.
- **The street and third-person views** project the same `(x, y, z)` through the perspective camera
  (`streetKit.toCam / project`), as they do now; the buildings' walls come from the footprint polygon
  and the level table, not from `(topLevel + 1) * 2.1`.
- **The map** draws footprints and streets in 2D and shades by z (the mountain, the deck).
- **The cutaway** reads `levels[]` and `cores[]`: the storeys it already draws (`tower.js`) get real
  heights; the lift shaft it already draws (`Cutaway.jsx`) is the building's `lift` core; the lobby
  unit it already has (`tower.js:132`) is where the lift bank stands.
- **The sim** returns `whereAt -> {x, y, z, pose, heading, ...}`: z from the leg's geometry, pose one
  of `walking | standing | seated | climbing | on-escalator | in-lift | riding (seated|standing)`.
  **The no-floating invariant:** between two consecutive samples a subject's z changes by more than
  0.3 m only on a `stair`, `escalator` or `lift` edge of the circulation graph (checked, 8.7).

### 8.3 Vertical circulation as walkable geometry

**The walk graph gains a third axis.** Section 1.5's street lattice (block corners and mid-block
doors on the sidewalks, z from terrain) is joined by CIRCULATION edges: STAIR (a polyline with z,
cost = length / `V_STAIR`), ESCALATOR (directed, cost = run / 0.5), LIFT (a node pair with a fixed
cycle cost and a hashed wait of 0-20 s), DOOR (a threshold), PLATFORM (a rect at z with spots). A
commute is then one path on one graph: home door -> sidewalk -> gateline -> stair or escalator ->
platform spot -> board at the car's door -> ride -> alight -> stair -> sidewalk -> lobby door ->
lift -> floor -> unit. The old special cases (`stairsDur`, `offDur`, `PLATFORM_OFF`, `climb`) go.

**The plan does not grow: not by one byte.** Format 1 stores legs as (to, place, activity, train,
car, board) and derives every x, y at read time (`whereAt`, section 7 survey). The vertical legs are
a **deterministic expansion** of what is already stored: `expandLeg(leg, world, key, day)` picks the
stair, escalator or lift by a hash of (subject, day, station) with fixed weights (up: escalator 60%,
stairs 30%, lift 10%; down: stairs 45%, escalator 50%, lift 5%), and the builder and the browser run
the same function, so the builder's travel times and the browser's positions agree to the metre
without a byte stored. **The seat is a hash, not a byte** (challenge 5: a seat assigned by arrival
order needs a global pass per platform, which the sharded builder, partial `addPlanRows` and the
raw-simulated off-roster subjects all break): a waiting person's seat is `hash(key, day, station,
arrival minute)` over the platform's **seat ring** (18 bench seats, then the leaning rail, then
edge spots); when two people hash to one seat the later arrival stands, resolved by the drawer from
the people it is already drawing. Deterministic, derivable by anyone from the plan alone, no builder
pass, no byte. That is what "actual stations for them to sit at" means in data: the benches are
props with seats, and a seat is a place a person is at, with a `seated` pose, visible from the
street.

**Riders** get a seat or a standing spot in their car by the same hash (today they are counts in
the car windows); at street level a passing train shows its people.

**Doors are nodes.** The route memo is shared by everyone using a door only if the memo key stops
naming the subject: today `route()` keys on the subject because `spotIn` puts each person at their
own hashed spot inside the place (`sim.js:2316`). At real scale the walk ends at the **door node**
and the spot inside is a derived offset, so one memo entry serves a block.

**Towers.** Entering a building: lobby door -> lobby (4.5-6 m, the lift bank) -> lift (the cutaway's
shaft) -> the floor's corridor -> the unit. The lift ride is a `lift` edge (2.5 m/s + doors). The
cutaway draws the cab moving in the shaft with its riders; the iso view draws nothing new (the
person is inside); the sim's `floor` is the level reached. A building of up to 3 storeys has stairs
only (a walk-up); 4-6 one lift and a stair; 7-13 two lifts; 14+ an express shaft (the cutaway's).

**Stations.** Every station is one of three archetypes from the catalog, instanced by the line and
the platform count: ELEVATED SIDE (two 80 x 4 m side platforms at 9.1 m, a stair at each end of
each, an escalator pair and a lift at the gateline end, the gateline under the deck between the
piers: the Loop, the East and West lines), ELEVATED ISLAND (one 80 x 8 m island between the tracks,
two stairs and an escalator pair down the middle: the Shore Line's terminals, the Central Line),
AT GRADE (platforms at 1.1 m with ramps: the Port's quay stops, the Alpine Line's summit). Stations
are drawn procedurally from the archetype like buildings from massing: no art per station.

### 8.4 Time: two clocks, one plan

**Keep 1 real minute = 1 machine hour.** The clock is load-bearing far beyond the city: 60 machine
days a real day is the builder's cadence (24 real minutes a day), the economy's close, the market's
"ended days", the social tick, the construction timers ("26 MIN"), the leagues (season 24 opens on
machine day 2,417 = 2026-11-05, `PYRAMID_FROM`), the mail ("once a real day from the day's events").
Nothing here touches it.

**Commutes get shorter, not longer**, because the sim walks at 5 km/h over a real city instead of
0.24 km/h over a dollhouse. **The baseline, with its method:** `commuteHours(home, work)` over every
home place x work place with the sim's router (`route().nominal`, `sim.js:2339`: the **worst case,
every train just missed**: walks + `PLATFORM_MIN` + headway + ride + `ALIGHT` + the stairs, per
ride). 44 homes x 130 work-or-mixed places = 5,720 pairs: **103 / 186 / 216** (median / p95 / max
machine minutes); over the 113 places that post jobs, 4,972 pairs: **107 / 185 / 250**. The median
trip takes **two rides** (on foot 376 pairs, 1 ride 1,689, 2 rides 1,669, 3 rides 1,136, 4 rides 102),
and walking is 44% of the median. The script lands as `scripts/bench-commutes.mjs` in S1 so the
number is reproducible, not quoted.

**The fixed costs per ride matter more than the distance** (challenge 3): today every ride adds
`PLATFORM_MIN` 6 min + `ALIGHT` 1.2 min + a worst-case headway, so two rides cost ~20 minutes before
anyone walks or rides. With `PLATFORM_MIN` at 1 minute (8.1) and the stairs explicit, estimated on
the 8.5 layout with the 8.1 speeds and the measured ride mix:

| Trip | Today (measured) | Real scale (estimated, nominal) | How |
|---|---|---|---|
| across the core (ARTS -> SPRAWL), 1 ride | ~100 min | **~19 min** | 400 m walk 5 + gate and stairs 1 + wait (headway) 2 + `PLATFORM_MIN` 1 + ride 600 m with 2 stops 4 + alight 1.2 + stairs 0.5 + 300 m walk 4 |
| core -> THE SUBURBS, 2 rides | ~140 min | **~31 min** | the above to ARCHIVE, transfer 100 m 1.2 + wait 2 + `PLATFORM_MIN` 1, East Line 2.5 km with 3 stops 9, alight and stairs 1.7, walk 5 |
| FARMLAND -> AIRPORT (the longest), 3 rides | ~210 min | **~50 min** | West Line, Loop, East Line: two transfers |
| median / p95 / max of all home x work pairs | 103-107 / 185-186 / 216-250 | **~30 / ~55 / ~75** | the acceptance band in 8.7: **<= 30 / <= 60 / <= 90** nominal; S3 replaces the estimate with a built day |

Still a 3.5x shorter day on the road. The day gets 1-2.5 machine hours back per citizen. **What that
changes downstream** (challenge 4): work length is fixed by shift (`sim.js:2556`), so the hours go to
later stays, not to work; and four things read commute length as an input and are tuned to today's
long ones: the civic district mood `(commute - 2) x 12` (`civic.js:326`), shop satisfaction
`(commute - 2.5) x 5` and its "IN TRANSIT, MOSTLY" line (`enterprise.js:296, 315`), **the helicopter
hops, which need a commute of at least `HOP_MIN` 1.2 h** (`emergence.js:255, 280`: after the switch
nobody qualifies and the helicopters stop flying), and the social tick's hourly co-presence sampling
(`social.js:234`). **Each threshold is re-based to the percentile it hits today**, measured by
`check-rebuild` on the S3 synthetic day (HOP_MIN to today's share of hop-eligible commutes; mood and
satisfaction centred on the new median), so no behaviour silently vanishes at the boundary.

**But motion on screen runs 60x.** A walker at 1.4 m/s in machine seconds covers 84 m a real second;
at the iso's near zoom (14 px/m) that is 1,200 px a second, and at street level a person crosses the
whole view in two seconds. Today this is hidden because walkers crawl (one cell a real second, a
body length). It cannot stay hidden at real scale, and no single speed fixes it: a speed that looks
right on the street (1.4 m a real second = 84 m a machine hour) gives a 14-hour walk across the
core. So:

- **The iso view and the map run on the machine clock at every zoom** (and EBTV, NOW IN THE
  SUBSTRATE). **Nothing is drawn moving at 60x** (challenge 9: at mid zoom a walker is ~500 px a
  second and a train 3,600, strobes either way): movers are drawn as **flow**. Walkers are density
  ribbons on the sidewalks (how many are on this pavement this minute, from the same rows), a train
  is shown standing at a platform during its dwell (90 s = 1.5 real seconds, like a board blinking)
  and as a streak on the line between, and people who are somewhere (at work, at home, seated, on
  a platform) are sprites standing still at near zoom. The city visibly breathes at 60x: the
  commute waves, the night. That is the Overlord's view and the live clock belongs to it.
- **STREET TIME is an explicit mode, not a zoom band** (challenge 9): STREET, THIRD PERSON (DRIVE
  YOURSELF), the cutaway, and a `LOCAL` chip at the iso near zoom that the viewer presses. Entering
  fixes `mt0 = now` and runs a local clock `mt = mt0 + (real seconds elapsed) / 3600` (1:1).
  Everything drawn is `whereAt(mt)` from the same immutable plan, so people walk at 1.4 m/s, climb a
  stair in 30 s, a train dwells a real minute and a half, a crane raises a storey an hour. **The
  promise "every viewer sees the same city at the same machine time" is kept exactly**: street time
  changes which `mt` a viewer looks at, never what the city is at that `mt`; nothing a street viewer
  does writes anything (DRIVE YOURSELF is a client-only avatar, `control.js`).
- **The clock is page-level and the plan follows it** (challenge 2, BLOCKING as first written: the
  plan client pumps on the live clock, `planClient.js:29 nowMt`, drops every earlier day once the
  live hour passes 2 (`:199`) and fetches only the live window, so a street session started at live
  23:00 would lose its ground three real minutes later and the street would empty to `homeDay`).
  The mechanism already exists for dev (`simApi.setClockOffset -> planClient`): street time drives
  **that** offset, so window fetching, the NOW panel and `whereOf` all read the local clock; the
  client keeps the local day's windows for as long as the mode lasts and the server keeps
  `KEEP_BEHIND` 2 days (`plans.js:35`). **Server-verified actions are off in street time** (a quest
  "report a meeting" is checked against `Date.now()` on the server, `quest.js:60`; the market, the
  Assembly, mail): the button reads `CUT TO LIVE TO FILE`, and does.
- **Drift and the cut.** After `r` real minutes in the mode the local clock lags the live one by
  ~`r` machine hours. At 20 real minutes the view cuts to live ("THE DEPARTMENT ADVANCES YOUR
  CLOCK. +19 H 40."), and so does leaving the mode. **Sitting is how time moves:** a bench, a
  platform seat or a train seat offers SKIP (fast-forward at 60x to the next train, the next hour,
  the alight stop), which also pays the lag down. Scott's "stations to sit at" is also the
  mechanic that keeps the two clocks honest.
- The HUD says which clock it is on: `LOCAL 14:07` in the mode, the machine clock everywhere else.

### 8.5 The rebuild plan: every id kept, one switchover

**Principle: a re-layout, not a re-authoring.** Every district, building, place, job, line, stop,
train, bridge, billboard, helipad, venue, parcel and cutaway unit keeps its id, its name, its
district, its storeys, its places and its people. What changes is geometry: positions, footprints,
streets, the ring, the platforms, the river's width, the mountain's height. The economy's
ownership rows key on `L:<building id>` (section 1.2) and never notice.

**The legacy core becomes the first generated world.** Instead of a frozen super-chunk with its own
painter, corner graph and portal nodes (section 1.2, 1.5, Codex objection 2), today's 20 districts
are re-laid by the section 1.3 generator from **mapping records**: one per district (its chunk
allocation and block module), one per building (its parcel, its storeys, its style), with the places
and the lines placed by rule. The special cases the freeze needed (the verbatim corner graph, the
open-lot walk rule, the portal nodes, the legacy painter group) are **deleted**, not carried: the
whole city is one lattice, one painter order, one generator. This is the simplification the rebuild
buys, and the reason it costs less than a freeze plus a frontier.

**The mapping (districts -> chunks).** Scale: a legacy lot is 4 m a cell (footprints); a district's
land is set by its content, so streets and open ground grow more than buildings do. The city at real
scale is about **6 x 3.4 km**, 70 chunks, 11.2 km2; the legacy city is 390 x 227 cells.

| District (id kept) | Today (cells, content) | Real scale | What changes shape |
|---|---|---|---|
| **THE CORE** (the Loop's 10) | 109 x 74; 67 buildings, 872 homes | **3 x 3 chunks (1.2 x 1.2 km) with THE COAST as the south row**; north row ARTS 2, CAMPUS 3, FINANCE 3, STRIP 4 blocks wide x 2 deep; middle row (inside the ring) ARENA 4 x 4, HQ a 2 x 2 superblock in a plaza, ARCHIVE 4 x 4; south row COMMONS 3, WORKS 3, SPRAWL 6 blocks x 3 deep | the Loop ring 3.2 km on the north and south avenues and two cross avenues (today 278 cells through the gutters); HQ's station on the north avenue between CAMPUS and FINANCE as today; ARENA and ARCHIVE on the flanks |
| arts | 25 x 13; 4 bld | 2 x 2 blocks | the gallery and the theatre on the avenue, 0 setback |
| campus | 25 x 13; 8 bld | 3 x 2 | a quad in the middle block |
| finance | 25 x 13; 2 bld, 72 homes | 3 x 2 | THE MERIDIAN 14 storeys = 53.9 m on a whole block; THE RESERVE beside it |
| strip | 25 x 13; 8 bld (casino, arcade + THE LANES, the dive, billboards) | 4 x 2 | the Strip's avenue frontage 400 m long, 0 setback, every sign on it; the station a full ELEVATED SIDE with 2 stairs, escalators, a lift |
| arena | 30 x 22; 5 bld | 4 x 4 | THE BOWL 220 x 180 m, THE DIAMOND 120 x 120 m, the river round the grounds |
| hq | 37 x 22; 1 bld (the monolith) | 2 x 2 superblock | the monolith 60 x 40 m, 46 m tall in a 200 x 200 m plaza; the Central Line's three stops cross the plaza north to south |
| archive | 30 x 22; 3 bld, 240 homes | 4 x 4 | the stacks on a whole block; the flats on two |
| commons / works / sprawl | 25 x 29 / 25 x 29 / 53 x 29; 36 bld, 560 homes | 3 x 3 / 3 x 3 / 6 x 3 | THE PIT below a block; the pitch and the courts on SPRAWL's south blocks; the community farm (LOT 0x6F07) a quarter block |
| coast | 109 x 22; 16 bld, 656 homes | the core's south row, 1.2 km x 300 m | THE BOARDWALK 1,200 x 12 m; the beach 60 m; THE SHORE PLAZA (Sam's at street level 4.5 m, Irene's brewhouse over it, THE TERMINAL cafe in the old counter, the helipad at 8 storeys) on the promenade; THE PIER 200 m |
| oldtown | 46 x 42; 14 bld, 740 homes | 2 x 2 chunks, **its own module: 60 m blocks, 12 m streets** | the cathedral walk-ups 44 x 20 m, the market square 60 x 60 m; crooked by rule, not by hand |
| port | 50 x 72; 15 bld, 600 homes | 2 x 3 chunks | 400 m of quay; the gateway (section 1.5) on the quay; the Shore Line at grade |
| farmland | 96 x 58; 13 bld, 300 homes | 3 x 2 chunks | fields 200 x 100 m, THE ORCHARDS 280 x 260 m, the farm track bridge |
| heights | 117 x 122; 14 bld, 374 homes; the mountain | **5 x 5 chunks** (2 x 2 km; challenge 11: 4 x 4 was all mountain) | the mountain 1.6 x 1.6 km, summit 320 m; the village row at its foot; THE FOOTHILLS a forest belt on the core's north edge, 150 m deep and **400 m deep for the 2 chunks that hold THE GREENS' 32 ha** (the hunt lodge in the belt); the Alpine Line a 2.4 km rack railway; the ski game keeps its own slopes |
| uptown / downtown | 12 x 28 / 23 x 17.5; 16 bld | 1 x 2 chunks east of the core | the glass towers 53.9 m on uptown's 2 x 4 blocks |
| suburbs | 58 x 70; 16 bld, 890 homes | 3 x 3 chunks (144 ha, 6 homes a hectare) | **an ESTATE building kind** (challenge 11): a suburb "building" is a whole cul-de-sac (`maple-close` 12 x 12.5 cells, 89 homes = ~4 ha), so an estate spans several parcels or blocks with its own street mouth (`eastGeo` `entry`), keeps its id and units, and the containment check reads estate >= parcels; lots 15 x 30 m; THE MALL on 2 blocks with its East Line station |
| airport | 84 x 40; 5 bld | 5 x 1 chunks | a 1,500 m runway; the terminal on the East Line |
| engine | 64 x 52; 9 bld, 540 homes | 2 x 2 chunks | the towers 53.9 m; the Engine shuttle |

**Lines (9 ids kept, every one a new version on network 9).** Loop 3.2 km / 10 stations / 10 trains
(L1-L10 run; L11-L15 stay in the depot on version 3: a version is a timetable, trains are never
deleted); Shore Line 2.4 km; Alpine 2.4 km climbing 280 m; Central 400 m through HQ's plaza (3 stops
200 m apart, the "transit mall" shuttle); West 2.4 km; East 4.0 km; Engine shuttle 1.6 km. The
retired versions (shore v1, west v1) stay retired. 70 stop ids kept, each now a platform with
circulation.

**The river** keeps its topology (in from the north, THE BURNOUT off the mountain to THE RETENTION
POOL and THE MERGER, the diagonal through THE FOOTHILLS, the gutters between the districts, under
the Loop twice, THE OUTPLACEMENT beside THE PIER) at 12-18 m wide; the 19 named bridges keep their
ids on the corresponding streets; the real-scale grid crosses it more often, so new crossings get
new ids appended, never a renamed one.

**Players.** Nobody loses a flat: `housedUnder` (SCALE, day 648) names a place id, and the place
keeps its id and its units. Properties keyed by parcel `L:<id>` keep their rows. Avatars, shops,
items: untouched.

**The switchover: one announced machine-day boundary.** `REBUILD_DAY` is set at the push, past
every published day plus the lookahead (`newest published + LOOKAHEAD + 2`, the RIVER_DAY /
SCALE_FROM rule); `layoutOn(day)` returns 8 from it, `netOn(day)` 9, `worldOn(day)` world v2.

**The tails are clipped** (challenge 1, BLOCKING as first written). Every day's plan folds
yesterday's tail into its first hours (`simSchedule`, `sim.js:2657`: a commute that set out at
23:40 is still walking at 00:10), and a ride is stored as **line and stop indices**
(`[line, a, b, k, car, board]`, `sim.js:2737`) that `whereAt` decodes against whatever geometry the
module holds; its departure-day switch swaps only the ground and the Plaza (`sim.js:2998`), not the
world. So a tail from the last legacy day, decoded in the metre world, would stand people in the old
cells. On `REBUILD_DAY` the builder therefore **completes every journey in progress at 00:00**:
anyone in transit starts the day at their destination, and the paper says so ("ALL JOURNEYS IN
PROGRESS WERE COMPLETED BY THE DEPARTMENT. YOU ARRIVED."). `check-rebuild` holds that no
`REBUILD_DAY` row has a commute segment with `span0 < 0`. The same clip applies to any future
world version that moves ground, as a rule of `worldOn`.

**The legacy geometry is Node-only** (challenge 6). `sim.js` is one 3,000-line module of geometry
interleaved with state (`PLANS`, `NET`, `GROUND`, the roster, social, enterprise and civic setters,
the memo), and the server reads it too (`plans.js:339` splits windows through `whereAt`, the social
tick, `quest.js`, `cam.js`, `find.js`); two instances in a browser would mean every setter called
twice behind a day router. So: today's geometry (`sim.js` tables and router, `iso` constants,
`loopGeo`, `lineGeo`, `river`, `mountainGeo`) is frozen as-is into `src/city/legacy/` **for Node**:
the fixtures (`layout1`, `net2-7`, `river-pre`, `shoreplaza-pre`, `lanes-pre`, `terminal-pre`,
`scale`, plus a new `rebuild-pre.json` built before the push) keep passing byte for byte there, and
the server's reads of the `KEEP_BEHIND` days before the switch go through it. With the tails
clipped, **no browser ever draws a legacy day after the switch** (the client only ever holds the live
day and yesterday's tail, `planClient.js:199`), so the browser carries both worlds only between the
push and the boundary (about two real hours at `LOOKAHEAD + 2`), and a follow-up deploy the same day
drops the legacy chunk from the bundle. The in-module per-day pattern the code already uses
(`onGround`, `layoutOn`, `MOVED_FROM`, the pace-to-fit walks at `sim.js:3018`) stays for the small
gates; it is not how the rebuild is gated. About 25 of the 86 `check-*.mjs` scripts assert city
geometry (8 of those are game space and untouched): each is re-targeted at world v2 or moved to the
legacy module's own test set, listed in S3. Retiring the legacy module and its fixtures is a later
decision of Scott's, not part of the switch.

**Saved state** (challenge 14): the DRIVE YOURSELF store keeps x, y for 6 hours (`control.js:328`),
so its key is versioned (`v2`) and a legacy position is dropped, not reloaded into metres;
`econ_placements.room` begins with the flat's unit id, so **level numbers are never renumbered**:
the lobby is `L0`, basements negative, exactly as `tower.js` builds them today.

**Re-derivation.** Routing re-derives from the world (lattice + circulation; the memo keyed by
`worldHash`, network and ground, section 1.5). Schedules re-derive from the routes. Housing and jobs
are unchanged (`homeOf`, `assignJob` are by place id and tier, not geometry). The civic phases, the
Plaza's day, the Lanes' day, the cafe's day, the ladder's day are all before `REBUILD_DAY` and keep
their gates. The paper runs the story on the day ("THE SUBSTRATE IS RESURVEYED. EVERY ADDRESS
STANDS. THE DISTANCES WERE WRONG.").

### 8.6 Performance at real scale

The counts are the same 185 buildings, 210 places, 9 lines; the new things are streets (about 1,000
block edges), stations with circulation (70), and props (about 28,000 lamps, trees, benches and
signs across 70 chunks, all from street profiles and station archetypes, none hand-placed). What
grows is **the number of drawable pieces per screen**, and both painters need changing for it
(challenges 7 and 8).

- **Streaming (section 3.5 unchanged):** the registry (~70 mapping records now, ~200 bytes each) once
  per world version; `generateChunk` for the chunks in view, cached by chunk; props generated with
  the chunk, never stored.
- **Iso: the order comes from the lattice, not from `depthOrder`.** Measured on the M5:
  `depthOrder` (O(n2) edges and a sort per pop, `iso.js:79`) takes **25 ms at 1,700 items and 134 ms
  at 3,400**, so a flat per-chunk sort is out, and a flat order is wrong anyway for the things that
  straddle chunk edges (THE BOWL at 220 m, the 1.5 km runway, the river, every viaduct). Instead:
  blocks order trivially on the lattice (by diagonal, per quarter turn); inside a block at most ~16
  items are sorted by `depthOrder` once at generation time and cached; straddlers are **split per
  block** at generation (a viaduct, a river reach, a runway strip, a stadium stand is one piece per
  block it covers), movers (trains, cranes, people) are inserted into their block's order by
  `slotForBox` each frame (the border-strip pass of section 3.5), and labels draw last. Far: chunk
  impostors into the cached ground layer; mid: massing without windows, flow ribbons for people, no
  props; near: full facades, sprites, props. Budget: the per-frame work is the insertion of movers
  only, under 5 ms a chunk (checked); the cached orders cost nothing per frame.
- **Street and third person: a depth buffer, decided in S2.** Today's renderer is one painter's
  sort by distance (`streetScene.js:213`) in which a whole station is one item (`:188`) and the
  Loop's deck is cut every 2.5 cells (`:186`): at metre resolution that is ~1,280 pieces for the
  Loop alone, and people on stairs, benches and escalators cannot interleave correctly with an 80 m
  platform, its piers and its canopy as one item. Two ways out, built for THE STRIP in S2 and
  measured on a phone before S3: (a) **split** stations and long walls into per-block pieces and
  keep the canvas painter, or (b) **a depth-buffered WebGL path** for these two views only (the
  same world model, the same sprites as textured quads, the iso stays canvas). **Recommend (b):**
  a depth buffer is what real scale asks for, the geometry is already flat planes and billboards,
  and the painter's piece count only grows with every slice after. FAR 220 / 140 m, so 1-2 chunks
  are in view; LOD: beyond 120 m massing boxes without windows and no props; beyond 60 m people as
  3-px marks; props as billboards; sprite sheets unchanged (the near-zoom sprite is the same 25 px).
  The scene reads the same chunk cache as the iso view: streaming is by chunk, two ahead in the
  walking direction.
- **Determinism across engines** (challenge 10): the browser re-lays footpaths and the generator's
  geometry, and Safari's JavaScriptCore and V8 may differ in the last bit of `Math.hypot`, `sin`,
  `cos`, `exp` (about 48 such calls across `mountainGeo`, `lines`, `loopGeo`, `sim`, `river`,
  `lineGeo` today), which a `clear()` / `crosses()` comparison can flip. This exposure exists today;
  real scale widens it. So the generator and the lattice router do their arithmetic as **integers on
  a 5 cm grid**, use `sqrt` only (correctly rounded everywhere), keep transcendental functions for
  drawing, and `check-rebuild` runs a WebKit leg (the screenshot rig already drives both engines).
- **Terrain:** procedural (`terrainH` in metres), sampled on a 10 m grid per chunk when the chunk is
  generated: 1,600 floats a chunk.
- **The builder:** routes on the lattice are cheaper than today's all-corners visibility graph (740
  corner nodes with O(n2) visibility edges) and the memo per (world, door node, door node) is
  shared by everyone using a door (8.3); travel times include the circulation edges (pure
  functions). Plan bytes: **unchanged format** (no seat byte, 8.3). Expected: a cold day at 5k at or
  under today's 5.0 s (checked as a budget, section 4.4).
- **Phone budget:** 30 fps at 390 px with 2 chunks in view at street level, 60 fps at iso mid; the
  Mac at 1440 60 fps everywhere. S2 measures both before S3 starts.

### 8.7 Migration checks: `scripts/check-rebuild.mjs` (in `run-checks.mjs`)

| Check | Rule |
|---|---|
| **ID census** | every id in the legacy world (20 districts, 185 buildings, 210 places, 153 jobs, 9 lines, 70 stops, 71 trains, 19 bridges, the billboards, 6 pads, the venues, every `<b>:L<n>:<u>` unit) appears exactly once in world v2; the diff is empty; no new id collides |
| **Containment** | place inside building, building inside parcel, parcel inside block, no overlaps; every door on a sidewalk; every footprint between 80% and 100% of its parcel and at least 80% of its legacy area x 16 m2 |
| **Reachability** | every door reaches every door on one graph on foot; every home within 400 m of walking of a station entrance; every platform reached by two independent vertical paths; every stop on a line in service; every arterial the river crosses bridged |
| **Everyone housed, every job placed** | home capacity >= roster at 5k and at today's census; every job's place exists; the six housing classes by style unchanged (`check-scale`) |
| **Travel times, realistic speeds** | `bench-commutes.mjs` on the S3 synthetic day (nominal, worst-case wait, the baseline's method): **median <= 30 machine min, p95 <= 60, max <= 90; no walking leg over 1.5 km**; stairs add 25-60 s a station end; every line's lap and headway feasible with dwell, braking distance and train lengths (`minGap`); no car over 1.5 x seated at 5k. Against today's 103-107 / 185-186 / 216-250 |
| **Thresholds re-based** | `HOP_MIN`, the civic mood's commute term, shop satisfaction's, the social tick's sampling: each set so the share of subjects it touches on the S3 day equals today's share +- 10% (the helicopters keep flying) |
| **The boundary** | no `REBUILD_DAY` row has a commute segment with `span0 < 0`; the `REBUILD_DAY - 1` plan is byte-identical before and after the push (`rebuild-pre.json`) |
| **No floating** | over a day's rows at one-minute samples, |dz| > 0.3 m between samples only on a stair, escalator or lift edge; z on a stair monotone; nobody inside a wall (the sprite's footprint against footprints); the chase camera never inside a building |
| **Determinism** | world v2 generated twice in two processes gives the same bytes; a day built twice gives the same bytes; `rebuild-pre.json` and every older fixture byte-identical in the legacy module; `expandLeg` and the seat hash builder == browser on 10,000 sampled legs, **in V8 and in WebKit** (the rig's two engines); no `Math.sin/cos/exp/hypot` in the generator or the router (grep, as section 4.4 greps for `Math.random`) |
| **Scale** | a person is 1.75 m against a 3.2 m storey in every view (a pixel test on the screenshot rig at 1440 and 390: the sprite's height / the storey's height = 0.55 +- 0.05); the cutaway's levels x heights == the massing height +- 0.5 m; the Loop's deck at 8.0 m in iso, street and map (one constant) |
| **Saved state** | a v1 DRIVE YOURSELF position is dropped on load; every `econ_placements.room` prefix resolves to a unit in world v2 |
| **Budgets** | mover insertion < 5 ms a chunk a frame (the block orders are cached); street frame at 390 with 2 chunks < 33 ms on the rig's throttled phone profile, in whichever renderer S2 chose; cold day at 5k under today's time + 20% |

### 8.8 Staging: what Scott sees after each slice

| Slice | What lands | What Scott sees | Checks |
|---|---|---|---|
| **S1 UNITS + STAIRS (draw-only proof, on today's layout)** | `units.js`; `whereAt` derives z and pose from the legs it already has (the stairs leg's `climb` becomes a climb along a drawn stair core, a hashed bench spot while waiting); stair cores and benches drawn at every station (a stylised 3-flight zigzag at today's dollhouse scale: the mechanics, not the look); `bench-commutes.mjs`. **No plan byte, no day gate** (challenge 16: an `S1_DAY` plan gate on the dollhouse would have to be frozen into the legacy module and migrated twice) | at the Strip station people walk to the stair, climb it step by step, sit on the benches, stand at the edge; nobody floats; the third-person camera follows your own climb | no-floating on every published day; the plan bytes unchanged (no gate to prove) |
| **S2 THE STRIP AT SCALE (side by side)** | the real-scale generator for one district: THE STRIP (8 buildings, every id, the casino, the Arcade with THE LANES upstairs, the dive, its billboards) on 100 m blocks, its Loop station as a full ELEVATED SIDE; `#city?preview=2` renders it in iso, street and third person with today's plan's people stood in by place; STREET TIME in the preview; **the street renderer decision** (split painter vs WebGL depth path, 8.6) built for this one district and measured on a phone | the Strip at 1.75 m tall: a 400 m avenue of signs, an 80 m platform 9 m up with two stairs, escalators and a lift, people at human pace; Scott walks it with the controller and judges proportion, pace and look | scale pixel test; phone and Mac frame budgets measured here, before S3; the renderer decision recorded |
| **S3 FULL REBUILD PREVIEW** | all 20 districts, 9 lines, the river, the mountain, the coast, the airport at scale from mapping records (the ESTATE kind, the Heights at 5 x 5); `check-rebuild` complete; a synthetic day built on world v2 with its commute distribution and **the thresholds re-based** (8.4); the ~25 geometry-asserting check scripts re-targeted or moved to the legacy set; the preview with the live plan's people mapped by place (commuters approximately, labelled PREVIEW) | the whole city at scale at `#city?preview=2`, walkable end to end; the commute table (8.4) with real numbers in place of estimates; the helicopters still flying on the preview day | every 8.7 check green; the travel-time band |
| **S4 SWITCHOVER** | `REBUILD_DAY` set at the push; layout 8, network 9, world v2; **the tails clipped on the day**; the legacy module frozen for Node; `rebuild-pre.json`; the DRIVE YOURSELF store key versioned; the paper's story; the preview flag retired; **a follow-up deploy the same day drops the legacy chunk from the browser bundle** | the day turns and the city is at scale; nothing of his is lost: his flat, his shop, his seat in the Assembly, every address | the whole suite; the live manifest's days before `REBUILD_DAY` untouched |
| **S5 GROWTH CHUNKS AT SCALE** | section 5 slice 4 on the real-scale generator: the first frontier district builds itself in with cranes (section 2) | a new district rising at the edge, at the scale of the one he walks | `check-world` (section 4.4) |

**Order against the rest of the plan.** Section 5's slice 1 (construction you can watch) is
geometry-free on the sim side (project records, `phase()`, `summary.build`) and lands any time; its
painter draws from massing and scales with the world, so it is finished after S4, not before (a
dollhouse crane is wasted art). Slice 2 (the chunk index) is absorbed: the mapping records are the
index. Slice 3 (the sharded builder) is independent and stays on its own trigger. S1 is the smallest
visible fix to the thing Scott named, and ships first.

### 8.9 The challenge (Opus seat, 2026-10-06)

Codex was out of usage until 2026-11-04, so a fresh Opus subagent took the challenger's seat with
the same brief (migration risk, determinism, cost, the sim's time budget; verify against the code
before asserting). Sixteen objections, two BLOCKING; every code citation was re-checked before
acceptance. Nothing was rejected.

| # | Objection | Verdict | What changed |
|---|---|---|---|
| 1 | **BLOCKING:** yesterday's tail is folded into every day (`simSchedule`), rides are stored as line and stop indices, and `whereAt`'s departure-day switch swaps only ground and Plaza: a legacy tail decoded in the metre world stands people in old cells | right, verified | the `REBUILD_DAY` builder completes every journey in progress at 00:00; a check that no boundary row has a commute with `span0 < 0`; the paper's line (8.5) |
| 2 | **BLOCKING:** the plan client pumps on the live clock, drops earlier days after 02:00 and fetches only the live window, so a STREET TIME session loses its ground; server-verified actions use `Date.now()` | right, verified (`planClient.js:29, 199`, `quest.js:60`) | street time drives the page-level clock offset that already exists (`setClockOffset`), so fetching follows it; server-verified actions read `CUT TO LIVE TO FILE` (8.4) |
| 3 | MATERIAL: the ~18 / ~40 estimate omits the fixed per-ride costs (`PLATFORM_MIN` 6 min, `ALIGHT`, headway) and the measured median trip has two rides; the gate fails by construction | right (today's mix: 376 / 1,689 / 1,669 / 1,136 / 102 pairs by rides) | `PLATFORM_MIN` 1 min; the estimate redone from the ride mix: ~30 / ~55 / ~75; the gate <= 30 / <= 60 / <= 90 (8.1, 8.4, 8.7) |
| 4 | MATERIAL: shift length is fixed, so saved hours go to later stays; commute length feeds civic mood, shop satisfaction, the social tick, and **`HOP_MIN` 1.2 h, so the helicopters would stop** | right, verified (`emergence.js:280`) | thresholds re-based to today's percentiles on the S3 day; a check (8.4, 8.7) |
| 5 | MATERIAL: a seat by arrival order needs a global per-platform pass; conflicts with the sharded builder, partial rows, off-roster subjects; rider seats were a second unbudgeted byte | right | the seat is a hash over a seat ring, double-sits resolved by the drawer; no byte at all (8.3) |
| 6 | MATERIAL: `sim.js` carries global state and the server reads it; two module instances in a browser is not a plan; ~25 check scripts assert geometry | right | the legacy module is Node-only; with the tails clipped no browser draws a legacy day after the switch; the dual bundle lasts ~2 real hours then a follow-up deploy; the scripts listed in S3 (8.5) |
| 7 | MATERIAL: `depthOrder` measured 25 ms at 1,700 items, 134 ms at 3,400; straddlers (THE BOWL, the runway, the river, viaducts) break a per-chunk order | right, measured | order from the block lattice at generation time, straddlers split per block, movers inserted per frame (8.6) |
| 8 | MATERIAL: the street renderer is one distance sort with a station as one item; ~1,280 deck pieces for the Loop at metre resolution | right, verified (`streetScene.js:186-213`) | S2 builds and measures split-painter vs a WebGL depth path for the two street views; recommend WebGL (8.6, 8.8) |
| 9 | MATERIAL: mid zoom strobes at 60x; switching clocks by zoom band jumps the clock on every pinch | right | STREET TIME is an explicit mode; the iso draws movers as flow at every zoom (8.4) |
| 10 | MATERIAL: "builder == browser" proved by running Node twice; JSC and V8 can differ in the last bit of `hypot/sin/cos/exp` (~48 calls), flipping `clear()` / `crosses()` | right; an existing exposure | integer arithmetic on a 5 cm grid, `sqrt` only, a WebKit leg in the check (8.6, 8.7) |
| 11 | MATERIAL: a suburb "building" is a cul-de-sac estate (`maple-close`, 89 homes, ~4 ha); the Heights at 4 x 4 was all mountain; THE GREENS' 32 ha cannot fit an 18 ha belt | right | the ESTATE building kind; the Heights 5 x 5 with a 400 m belt where THE GREENS sit; 70 chunks, 11.2 km2 (8.5) |
| 12 | MINOR: the 20.3-minute lap used the 90 s dwell while the text said 60 s; "average with stops" plus dwell double counts; `LOOP_CLEAR` must be a braking distance | right | dwell 90 s kept and stated; `V_TRAIN` is the running speed; `LOOP_CLEAR` 150-200 m (8.1) |
| 13 | MINOR: the baseline re-measures at 4,972 pairs 107 / 185 / 250 against 5,720 pairs 103 / 186 / 216 | right (two work sets) | both recorded with their sets; `bench-commutes.mjs` lands in S1 (8.4) |
| 14 | MINOR: the DRIVE YOURSELF store keeps cell positions for 6 h; `econ_placements.room` prefixes are unit ids | right | versioned store key; level numbers never renumbered (8.5, 8.7) |
| 15 | MINOR: the route memo keys on the subject (`spotIn`), so it cannot be shared by a block | right | doors are nodes; the spot is a derived offset (8.3) |
| 16 | MINOR: an `S1_DAY` plan gate on the dollhouse layout would be frozen into the legacy module and migrated twice | right | S1 is draw-only: no byte, no gate (8.8) |

What survived unchanged: the diagnosis (every 8.0 constant confirmed; walking is 44% of today's
median commute), ids keyed by place and tier not geometry (`sim.js:993, 1036`), no Supabase table
storing positions, the `REBUILD_DAY` rule, the 60x clock, deleting the frozen core's special cases,
the chunk arithmetic, and ten three-car Loop trains under `minGap`.

### 8.10 Open questions for Scott (4)

1. **The street renderer at real scale: a WebGL depth buffer for STREET and THIRD PERSON, or keep
   the canvas painter and split everything into pieces?** Options: WebGL for the two street views
   (the iso stays canvas) / split painter. **Recommend WebGL**, decided by the S2 measurement on a
   phone: real scale multiplies pieces with every slice, and a depth buffer stops paying for them.
2. **Street time at 1:1 with a cut at 20 real minutes, or a brisker local clock (2:1) with a longer
   session?** Options: 1:1 and the cut / 2:1 (people at a fast walk, sessions to ~40 minutes).
   **Recommend 1:1:** the point is that an hour is an hour on the street; sitting pays the lag down.
3. **THE HEIGHTS at 5 x 5 chunks (2 x 2 km) to hold the mountain, the village, the belt and THE
   GREENS, or 4 x 4 with THE GREENS moved to the Farmland's edge?** Options: 5 x 5 / 4 x 4 + move.
   **Recommend 5 x 5:** the course stays in the foothills where the hunt and the lodge are.
4. **The travel-time gate: accept a nominal (worst-case-wait) median of <= 30 machine minutes, or
   buy <= 20 with tighter headways (more trains on every line)?** Options: <= 30 as drafted / <= 20
   with more trains. **Recommend <= 30:** the expected (not worst-case) median is ~22, already a
   fifth of today's, and more trains cost plan bytes and painter time for a number nobody feels.

---

## Appendix: where today's code maps

| Today | In CITY 2 |
|---|---|
| `sim.DISTRICTS` (20, hand rects) | mapping records -> chunks at real scale (8.5); new ones from `districts.json` + chunk records |
| `BUILDING_LIST`, `*Sim.js`, `*Geo.js` | mapping records (parcel, storeys, style) generated like every other building; the hand geometry moves to `src/city/legacy/` for days before `REBUILD_DAY` and the fixtures |
| `layoutOn(day)`, `RIVER_DAY`, `NET` | `worldOn(day)` folding the registry; layout 8 / network 9 / world v2 from `REBUILD_DAY`; `LINES` append-only (every line a new version) |
| `STOREY 2.1`, `DECK 1.5`, `PERSON_H 1.9`, `V_WALK 60`, `V_TRAIN 600` | `units.js`: metres, 3.2 / 3.8 / 4.5 m storeys, deck 8.0 m, 1.75 m, 5,000 and 36,000 m a machine hour (8.1) |
| `stairsDur`, `offDur`, `PLATFORM_OFF`, `climb` | circulation edges (stair, escalator, lift) and `expandLeg`; `whereAt` returns z and pose (8.3) |
| the live clock in every view | machine clock in far and mid views; STREET TIME (1:1, local, from the same plan) in the near views (8.4) |
| `lotPhase`, `farmParcelPhase`, `resortPhase` | `construction.phase()` over project records |
| `enterprise.js` units, `emergence.js` pads | project sources |
| `iso.depthOrder` over everything | legacy group + per-chunk orders |
| `plans.js buildPlans` (one process) | ALLOC / ROWS / SPLIT, Mac or Lambda |
| ECONOMY_PROPERTY rings by district | RING by district (legacy) or chunk distance (generated) |

## Decisions (Scott, 2026-10-06)

1. ~~Keep the hand-built core frozen; growth happens around it.~~ **REVERSED later the same day:
   REBUILD AT REAL SCALE** (section 8). Every id kept; one announced day boundary; the legacy core
   is re-laid by the generator, not frozen. The frontier still grows round it (S5).
2. Construction runs on the machine clock (shop fit-out 26 MIN, 9-storey tower ~3 H 06).
3. New chunks inside an existing borough are added automatically once its homes pass 90% full; new boroughs still go to an Assembly vote.
4. Players may spend CYCLES on a bigger crew, capped at 2x speed, CYCLES only.
5. R2 vs Netlify credits: decide when the 10k-player trigger hits (default R2).
Build order: slice 1 (construction you can watch) after the current integration pass; the plan-builder lock renewal fix lands before any Mac builder runs.
