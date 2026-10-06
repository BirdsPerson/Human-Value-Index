# EMERGENCE: the city grows its own industries (design + slice 1, 2026-10-06)

Status: **SLICE 1 BUILT** (delivery drones, helicopters, the model). Sequence items 3-6 are design.
Code: `src/city/emergence.js` (pure), `src/city/emergeDraw.js`, `src/city/emergeClient.js`, the
builder (`netlify/lib/plans.js` `emergenceFor`), `scripts/check-emergence.mjs`.

**Scott (2026-10-05):** "As the higher society starts to form and carve itself out, we start to see
other jobs forming, other economies forming: a transportation industry, transport drones and
helicopters flying around the city."

The rules it has to pass (DRIVES.md, ECONOMY_PROPERTY.md): every new thing has a **because**; no
visible fixed cycle (**never feel the machinery**); **democratic** (big infrastructure goes to the
Assembly); **upward mobility** (new industries open new rungs for the middle, not the top); **no new
chrome** (it lives in the city itself, the NOW list, the PA, the market, the file).

## 1. The model in one paragraph

Once per machine day, at the boundary, the plan builder **measures** yesterday's published city,
compares the measures to **thresholds**, and an industry **opens** when they have held for a few
days running. An open industry **staffs itself** from the census and shows up **in the sky**,
derived from what people actually did that day. It **declines** only when the measures fall well
below where it opened, for longer (hysteresis), or when the Assembly or a stabilizer stops it.
Nothing runs on a clock: the same city state always gives the same industries, and a different
city gets them at a different time.

```
yesterday's plan + its shop register
        |  measureDay
        v
  MEASURES (pop, storefronts, orders, penthouses, top-5% share, longest commute)
        |  advance: held K days over -> OPEN ; K' days well under -> DECLINED (new draw)
        v
  STATE (rides the plan as `emerge`, ledger emerge/latest)
        |                 \
        | staff            \ summaryBlock (today's plan)
        v                   v
  POSTS -> THE MALL's     ROUTES: a drone per shop visit, a helicopter
  work map -> the plan    per long top-band trip -> summary.emerge -> the sky
```

## 2. The measures (per machine day, from yesterday's plan)

| Measure | How | Production day 607 |
|---|---|---|
| `pop` | subjects in the plan | 840 |
| `units` | storefronts trading (THE MALL's register) | 24 |
| `visits` / `rate` | leisure visits to a storefront = orders implied; per 1,000 people | 152 / 181 |
| `ph`, `lux` | residents of the Meridian's penthouses; of every top-band home | 10, 40 |
| `top` | the top 5%'s share of a wealth proxy (home band 10/3/1 + shop profit / 20) | 0.173 |
| `commute` | the longest district pair by mean commute (20+ trips) | coast~suburbs 2.53 h |

**When property exists** (ECONOMY_PROPERTY slice 2+): `ph` becomes the number of floor and
penthouse OWNERS, and `top` the top 5%'s share of CYCLES + holdings from the ledger's closed day.
The thresholds are re-drawn at that switch (a new attempt number), never compared across it.

## 3. Thresholds, hysteresis, jitter

Each industry's thresholds are drawn by hash per **attempt** (`thresholdsOf(id, n)`), inside bands
calibrated against production (days 605-608 measured): no number is the trigger twice, and a city
that declines and recovers meets a different bar the second time.

- **Open:** every measure over its threshold for `on` days running (2-4, drawn). One day under
  resets the count.
- **Hold:** between the open thresholds and the decline line (0.6-0.85 of them) nothing changes.
- **Decline:** a measure under the decline line for `off` days running (5-9, drawn; always longer
  than `on`). The posts are freed, the next attempt's thresholds are drawn.
- **Paced by data, not time:** helicopters need the drones to have flown N deliveries (5,200-8,400:
  the airspace proven). At ~140 orders a day that is ~48 machine days (~19 real hours), faster if
  the parades boom, slower if they slump.

## 4. The sequence

Each: what appears, the jobs (title, place, wage via the job ladder's PAY term), the businesses
entrepreneurs can open, the market industry, the because-line.

**1. DELIVERY DRONES** (built). *Opens:* storefronts trading >= 15-19 and orders >= 120-160 per 1,000.
- *Appears:* quadcopters with parcels flying THE PARTS DEPOT (the Works) -> the shop -> the home of
  someone who visited it that day; three parked on the depot's roof.
- *Jobs:* DRONE DISPATCHER (day) and DRONE MECHANIC (evening), at the Parts Depot; 2-4 posts sized
  by the orders.
- *Business (slice 2):* a COURIER trade in THE MALL (`SHOP_TYPES.courier`, the "tools" group):
  the record fits computing/engineering.
- *Market:* AIR FREIGHT (Works).
- *Because:* "THE PARADES FILLED: 24 STOREFRONTS TRADING, 152 ORDERS A DAY. THE PARTS DEPOT FILED
  FOR AIRSPACE. DELIVERY DRONES ARE CLEARED OVER THE CITY. THE PAVEMENT IS RELIEVED."

**2. ROOFTOP HELIPADS + PRIVATE HELICOPTERS** (built). *Opens:* drones open and N deliveries flown,
penthouse residents >= 6-9, top-5% share >= 0.15-0.17.
- *Appears:* helipads on the Meridian, the Reserve Tower, the Surfside, Engine Tower A, the Chalets
  and the Airport's hangar roof; a helicopter for each top-band trip of 1.2 h or more between two
  pads 25+ cells apart (the Meridian to the Reserve Tower is a walk).
- *Jobs:* PILOT (the Hangars), PAD ATTENDANT (the Reserve Tower's rooftop).
- *Noise:* the PA logs complaints from the Sprawl. *Slice 2:* a NOISE factor in the civic fold
  (-1..-4 to the districts under the most hops, the poorer first), which feeds unrest (DRIVES
  strain) and so the stabilizers.
- *Market:* ROTOR CHARTER (Finance, the Airport).
- *Because:* "THE DRONES FLEW 6,800 DELIVERIES WITHOUT INCIDENT. THE TOP 5% NOW HOLD 17% OF THE
  CITY'S MEANS. THE MERIDIAN'S PENTHOUSES FILED FOR AIRSPACE. THE DEPARTMENT GRANTED IT, FOR A FEE."

**3. THE AIR TAXI LINE** (design). *Opens:* the longest commute >= 2.4-2.8 h mean on 30+ trips for
5+ days, helicopters open. It is infrastructure, so it does not open itself: the Substrate files
an **advisory ballot** on the Assembly docket (DRIVES "Substrate docket": templated, one a real
day at most): "AN AIR TAXI BETWEEN THE COAST AND FINANCE. 41 COMMUTERS SPEND 2.5 HOURS A DAY IN
TRANSIT." Players decide; the Substrate only if nobody votes. Approved: a new entry APPENDED to
`LINES` (lines.js, append-only: a new id and index, never a retime) from a boundary after the
newest published plan + LOOKAHEAD + 1, with SKYPORTS on existing roofs as its stops; trips take it
by the router's own rule. Jobs: SKYPORT AGENT, AIR TAXI PILOT. Market: AIR TRANSIT. Refused: the
ballot's because-line says so, and the measure must fall and rise again before it is asked twice.

**4. CARGO AIRSHIPS + THE AIRPORT HELIPORT** (design). The Port's tonnage (fish, the foundry) and
the Airport's flights: slow airships Port -> Airport; a ground heliport on the apron. Jobs:
RIGGER, LOADMASTER.

**5. THE DRONE-RACING LEAGUE** (design). Drones open 30+ days and a competitive-drive share (DRIVES
`com`) over a draw: a course through the Works, a fixture on THE LEAGUES' calendar (hashed day,
never a fixed weekday), a tradable team.

**6. Further** (each its own measures): a SKY CLINIC (air ambulances, when the Ward's load is high),
ROOFTOP GARDENS (the farm co-ops on the towers, rev-drive led).

## 5. What makes an industry decline

- **The measures fall** (the hysteresis above): the parades empty, the penthouses empty.
- **A ban by Assembly vote.** Any open industry can be put on the docket by a player (a BAN
  proposal) or by the Substrate when its strain is high (noise unrest for helicopters). Approved:
  `state.ban[id] = {from, until}` is set from the next boundary; the industry is DECLINED with the
  ballot as its because ("THE ASSEMBLY GROUNDED THE HELICOPTERS. 61% IN FAVOUR. THE PENTHOUSES
  TAKE THE LOOP."), and cannot reopen before `until`.
- **A crash, as a DRIVES stabilizer.** DISASTER's air variant: a drone falls on Market Row, a
  helicopter noise riot in the Sprawl. Chosen by DRIVES' selection (cooldowns, entropy), never on
  a timer. Effect: the industry is grounded for 1-3 real days (the Overlord's emergency power),
  then an EMERGENCY BALLOT decides whether it flies again.

## 6. Determinism and the immutable plans

- `EMERGE_FROM` (machine day 622): chosen after the newest published plan (609) + LOOKAHEAD + 1 when
  it shipped (13 machine days of margin), the MARKET_SIM_FROM rule. Before it, the builder runs exactly as before: no `emerge`
  on the plan or the summary, THE MALL's work map is the same object, every published day rebuilds
  byte-identical (checked: built with and without, compared as bytes).
- The state rides the plan (`emerge`), the ledger `emerge/latest` covers a gap; what is measured is
  only a published plan. No clock, no random (checked by reading the source).
- **Posts ride the plan:** `withJobs` adds them to THE MALL's work map (`sim.setEnterprise`), so
  the plan puts a DRONE DISPATCHER at the Parts Depot and the file reads "DRONE DISPATCHER // PARTS
  DEPOT" (from the day's summary). Shop owners and hands are never also posted; posts are kept day
  to day and freed when the file is withdrawn, the holder opens a shop, or the industry declines.
- **Who gets a post:** the living, off the lowest grades, not a citizen; the record's fit first,
  the middle band ahead of the top (a new rung, not a perk). Players (later): a post opens on MY FILE
  as an application, chosen over an NPC at equal fit.

## 7. Rendering

- In the iso view's sky pass (after THE AIRPORT's aircraft): pads first, the depot's parked drones,
  then what flies. A drone is a cross, four rotor discs, a parcel and a shadow; a helicopter a
  cabin, boom, skids, rotor disc and shadow. Night: steady nav lights; the helicopter's beacon
  blinks slowly (never a strobe).
- **Caps:** desktop 14 drones / 4 helicopters at once; phones (< 640 px) 6 / 3; reduced motion
  4 / 2, every third drone only, still rotors, no blinking, and the iso view's own reduced redraw.
- **Size:** the day's block is <= 200 drone routes and 24 hops (~2.5 KB in the summary).

## 8. Where it shows (no new chrome)

- **The city:** the sky, the pads, the depot.
- **NOW IN THE SUBSTRATE:** "NEW: DELIVERY DRONES OVER THE CITY." the day it opens (first line),
  then "THE AIR: 5 DELIVERY DRONES UP. 1 HELICOPTER BETWEEN THE PADS."
- **The PA:** the because-line the day it opens or declines, then the standing lines (the day's
  delivery count; the helicopter movements and the noise complaints).
- **The file:** the assignment line names the post.
- **The market (hook, not built):** THE SEVEN INDUSTRIES are a fixed list in
  `src/economy/rules.js` and `herding()` divides by its length, so adding one would move every
  holder's yield: not data-addable at a boundary today. The hook: each industry carries
  `market: {id, name, districts}`; the market slice that makes industries data (an `industries`
  list in the market state, applied at the next 00:00 UTC like the knobs) lists an industry from the
  first real day after it opened, its yield read from its own districts' takings, and delists it
  (holders paid out at the last price) when it declines.

## 9. Calibration and when it shows

Measured on production days 605-608: storefronts 22-24, orders 129-152 a day (154-181 per 1,000),
10 in the penthouses, top-5% share 0.171-0.174, 24 helicopter hops a day once open. The first
attempt's thresholds: drones 18 storefronts / 141 per 1,000, held 2 days; helicopters 6,762
deliveries, 6 in the penthouses, 0.163, held 2 days. So, if the city holds: **drones from machine
day 623** (2026-10-06 08:48 UTC), **helicopters around day 673** (2026-10-07 ~05:00 UTC), later
if the parades slump.
