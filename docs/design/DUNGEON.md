# THE DUNGEON: one crawler, two entrances

**Status:** design, 2026-10-07, revised after the Consortium run (section 8). Research and sources
in `DUNGEON-research.md`. No gameplay code ships with this document.

**What this is.** The definitive design for a reusable dungeon-crawler engine, built once and
entered twice: THE SUB-BASEMENTS under Department Headquarters first (Scott's choice, 2026-10-06),
then THE SAFARI ZONE from the Outfitter in the foothills on the same engine, with capture instead
of killing and a ZOO to fill. Scott's brief, verbatim where it matters: *"Gauntlet Legends / Diablo /
Neverwinter feel, Stardew-mines depth. THE SUB-BASEMENTS (from Dept HQ): B4 to B-infinity, rogue
machines, feral data, escaped paperwork. Deeper = stranger + richer. Rewards: unbuyable
furniture/clothes, zoo animals, some verified CYCLES (daily cap). Go down = wake at the entrance,
lose the run's pack only (never home, wallet, zoo). Solo first, built lockstep-ready; 2-4 player
co-op next via a small Cloudflare relay + share-link parties. Almost everything we build will have
another purpose; never rush, always the best way. Looks don't matter yet; feel, rules and AI do."*

**How to read it.** Section 1 says where the two doors already are in the city and what the
repository already provides (with file and line). Section 2 is the research digest. Section 3 is the
engine: the run loop, floor generation, entities and AI, combat, loot, themes, capture, controls,
difficulty, replay and rewards, co-op readiness, the satire. Section 4 is the first slice's content.
Section 5 is the checks that can fail. Section 6 is the staged plan with what Scott sees after each
stage. Section 7 is what carries to the second entrance and beyond. Section 8 is the Consortium
record, section 9 the open questions. A one-page flowchart of 3.3 and 6 is published alongside.

---

## 1. Fit with HVI: the doors, the hooks, the rules already in force

### 1.1 The two entrances exist as places

| Door | Where it is today | What changes |
|---|---|---|
| THE SUB-BASEMENTS | Department Headquarters has six floors: PH EXECUTIVE, 1F THE BAR, G LOBBY / INTAKE, B1 BREAK ROOM, B2 THE ARCHIVE, **B3 PROCESSING** (`src/building.js` 20-27; `src/city/sim.js` 337 `HQ_LEVEL … B3: -3`). HQ is CLASSIFIED: its cutaway "runs its own simulation. The Department trusts only itself" (`src/city/City.jsx` 456; `src/city/city3d.js` 344); the building view renders the Holding Pen (`src/city/BuildingView.jsx` 58-59: "SIX FLOORS, THREE OF THEM BELOW THE STREET …", then `<Pen embedded>`), and the 3D view gives a CLASSIFIED building no floor to focus (`src/city/City3D.jsx` 87). | B4 is the first floor that does not exist. The door is drawn **in the Pen**: a SERVICE LIFT: B4 AND BELOW beside the PROCESSING door in `src/Pen.jsx`'s B3 strip, plus one line in BuildingView's HQ branch; City3D's CLASSIFIED rule is left alone. The run opens at `#basements`; a tile joins THE GAMES (`src/play/games.js`, one line per game; a route App.jsx does not serve renders COMING SOON). |
| THE SAFARI ZONE | THE OUTFITTER is the foothills' ranger post: "CAPTURE PERMITS ISSUED. THE ANIMALS WILL BE HOUSED, AT GREAT EXPENSE." and "SAFARI ZONE: OPENING SOON." (`src/city/funnels.js` 52, 73, 178; `src/city/FunnelOverlay.jsx` 145, 221-231; `docs/CITY_SPEC.md` 1255-1259). The real-scale plan puts the lodge in a 150 m forest belt on the core's north edge (`docs/design/CITY2.md` 705, 920). | The OUTFITTER panel's "opening soon" line becomes the door: `#safari`. The wilderness beyond the frontier (`CITY2.md` 1.5) is what the zone draws from (3.6). |

### 1.2 What the repository already gives the engine

- **Pure seeded sims with a run-length input log, replay and frozen versions** are the house
  pattern: `pack`/`unpack`/`rleEncode`/`rleDecode` and `VERSION`/`HZ` in `src/play/ski/sim.js`
  56-77; `rngStep` (mulberry32 as a pure step, `src/play/fish/data.js` 56-62) and `fnv` (one string
  in, `data.js` 50); a version router in `src/play/fish/replay.js`; hoops' `v4/` frozen with
  `scripts/fixtures/hoops-v4-records.json` and the pure `engine/` split proven bit-identical
  (`BASKETBALL.md` 10). The purity grep in `scripts/check-ski.mjs` 32-36 fails on `Math.random`,
  `Date.now`, `performance`, trig, `hypot`, `pow`, `exp`, `log`, `**`, `document`, `window`; it scans
  one file, and bans neither `new Date` nor `Intl` nor a `.sort(` without a tie-break (the crawl grep
  adds those and walks every file under `engine*/`).
- **Server replay before anything lands**: the mountain issues a permit (`start`) whose time is
  the server's, then re-plays the log in node and files only what replays exactly as claimed, with
  the log bounded by the wall clock since the permit (`netlify/functions/ski.js` `CLOCK_SLACK_TICKS`,
  `MAX_LOG` 200,000, `RUN_TTL_MS`, `validLog` in pairs; the case record keeps the last `KEEP_RUNS` =
  20 permits, `netlify/lib/ski-store.js` 12). The cabinet issues the **seed** itself inside an
  HMAC-signed permit so nobody shops seeds offline (`netlify/functions/hunt.js`;
  `netlify/lib/hunt-store.js` 14-24). The aquarium verifies on the version a trip was played on
  (`netlify/functions/aquarium.js`, `verifyCatchV`). Both patterns mark a run filed **before** the
  side effects and answer 409 on a retry (`ski.js` 97-110); the trophies, by contrast, retry delivery
  for 30 days (`netlify/lib/tournament-awards.js` `AWARD_RETRY_MS`). The crawl copies the trophies.
- **A file-bound write needs the account's session**: `requireCaseAuth(req, caseId, {write: true})`
  (`netlify/lib/auth.js`), as ski, economy and shops do; `NO_SUCH_FILE` and the guess limiter come
  from `netlify/functions/case.js`. **Purge** deletes a case from every store through one deleter per
  store (`netlify/functions/purge.js` 9-15): the crawl store and the zoo's plaques each need one.
- **Rewards that are not bought already exist.** Tournament trophies are furniture granted by the
  ledger's `econ_award`: an item with a `claim` transaction and no CYCLES moved, idempotent by key
  (`netlify/lib/tournament-db.js` 9-20; `supabase/migrations/20261008000000_tournament_trophies.sql`).
  The shop refuses to sell them: `it.award` answers "TROPHIES ARE WON. THE DEPARTMENT DOES NOT SELL
  THEM." (`netlify/lib/shops.js` 57). The SKU shapes are `f:<furniture id>` and `w:<wear id>.<way>`
  (`src/economy/shops.js` 184-199); a garment must be in `src/wear.js` for `avatar.js` to draw it and
  a piece in `src/city/furniture.js` `CATALOG` for a flat to hold it; `MAX_FURN_EACH` is 3 and a
  garment is one per file (`econ_items_wear_once`, `supabase/migrations/20261006010000_shops_slice1.sql`).
  **`econ_award` cannot grant salvage as it stands**: its idempotency regex is `^award:f:trophy\.`,
  its SKU regex `^f:trophy\.…`, it hard-codes kind `furn`, it never checks `MAX_FURN_EACH` (only
  `econ_shop_buy` does) and a second garment would hit the unique index as an exception. Salvage
  needs its own function (3.11, `econ_salvage`).
- **CYCLES are play money with a documented ledger.** UBI is 1,000 a day, about 300 of it spent by
  the citizen's own schedule (`src/economy/rules.js` 8-13); UBI vests from a file's third day
  (`VEST_DAYS` 2) and needs an enrolled wallet; every transaction is balanced legs on one case's
  accounts with an idempotency key and optional per-day `claims` (`netlify/lib/economy-db.js`
  `econ_post`; a claim key that already exists returns `dup`, so claims give one transaction a day,
  not a running total); purchases burn to `dept:burned` (`netlify/lib/shops-db.js`); the transaction
  kinds are a SQL check constraint extended by each migration (`shops_slice1.sql` 12). The legal
  lines say CYCLES "cannot be bought, cashed out, sold, gifted or transferred" and "wealth never
  raises your score" (`rules.js` 21-24); `scripts/check-economy.mjs` 186-192 and 313-325 fail the
  build on any transfer, gift or cash-out path. **One conflict to settle (9.1)**:
  `docs/design/ECONOMY_PROPERTY.md` 11 says "no prizes", and `tournament-awards.js` 6-8 reads that as
  "no CYCLES purse", while Scott's 2026-10-06 decision names "some verified CYCLES (daily cap)" and the
  fish-to-restaurants design (`ECONOMY_PROPERTY.md` 740-749) already mints CYCLES from verified play
  under a daily cap.
- **Records go on the file the tournaments' way**: `c:<caseId>` carries `honours` and MY FILE reads
  them (`netlify/lib/tournament-store.js` 7, 139-141).
- **Shared menus, guides, pads and the bot discipline**: `GameMenu` (end and pause rows,
  `gameMenuLogic.js` `ROWS`), `guideKit.jsx` (`HowTo`, `PadSketch`, `Tip`, `profileHand`,
  `usePlayMode`), `src/city/gamepad.js` (`readPad` reads the **first** pad only, merges the d-pad into
  the stick, names RT "run" in every `GLYPHS` family, and swaps A/B for Nintendo), and a casual-human
  bot that must clear the easy default in >= 70 % of runs (`scripts/check-hunt.mjs` 154-192: ~250 ms
  reaction, 4-12 px slop, no lead; `check-ski.mjs` has a **first-timer** bot that reads only what the
  screen shows). Every game is a lazy chunk; the entry bundle must stay <= 90 KB gzip
  (`scripts/check-bundle.mjs`). Two players already share one input word in FOURTH AND LONG
  (`src/play/tecmo/sim.js` 8: player 1 in the low byte, player 2 in the next).

### 1.3 Rules in force that the design must not break

No living person speaks or is given a crime (the Sub-Basements' monsters are machines, data and
paperwork; the Safari Zone's are animals). CYCLES stay play money: no purchase, no cash-out, no
transfer between players (so no item changes hands either), daily-capped minting from verified play
only. Plain copy in play, the Overlord's voice in menus and memos. Controller first, touch and keys
always, a left-handed option from the profile's hand. The casual-human bot beats the easy default in
at least 70 % of runs. Nothing in `engine/` imports from outside it.

---

## 2. Research digest

Full notes and sources in `DUNGEON-research.md`; this is what the design uses.

### 2.1 What makes Stardew's mines work

1. **A fixed checkpoint cadence** (the elevator every five floors) is what players plan their day
   around: "a good goal for your mining day is to complete five floors." Skull Cavern, which has no
   elevator and restarts on every visit, is where the frustration lives (research A.1, A.8, A.9).
2. **The way down appears from what you break and kill**, by chance, with a guarantee only on
   cleared infested floors; **the chance rises as the rocks run out**, so the last rocks on a floor
   are the likeliest, which is the whole "one more rock" pull; shafts drop several floors for health
   (A.2).
3. **Bands by depth, with a ten-floor cadence inside them**: the wiki's three monster bands hide
   a new monster roughly every ten floors (bats and golems from 31, frost from 41, ghosts 51,
   skeletons 71, squid kids 91); ore starts at 2 / 41 / 81; every tenth floor is a quiet reward floor
   with a fixed chest on most of them. Deeper is stranger and richer by table, not by scaling alone
   (A.3-A.5, corrected by QC).
4. **A daily condition you can check before you go** (Daily Luck) moves the odds of a ladder from a
   broken rock and of drops; the pre-run ritual (fortune teller, food, totem) is half the fun (A.6, A.9).
5. **Two very different losses**: passing out costs at most 1,000g; a combat death costs money and
   random items ("can cost 15,000g"). Players tolerate the first and restart the day after the second
   (A.7, A.9). Our rule is already the gentler one: the run's pack only, never home.
6. **Staircases** (stone for speed) are the resource-for-depth trade players love to optimise (A.8).

### 2.2 How the best generators work

7. **Brogue's accretion**: start with one room, slide the next around until it fits snugly and
   punch a door, repeat; the result is a tree and therefore connected by construction, no pruning.
   Then add loops, then lakes placed only where everything else stays connected, then "machines"
   (71 hand-designed cause-and-effect set pieces, three kinds), then stairs, then items (B.10-B.14).
8. **Spelunky's critical path first**: trace the solution route through a 4 x 4 grid, pick room
   templates whose exits fit it, fill the rest with side rooms. The exit is guaranteed and the route's
   length is chosen, not discovered (C.15).
9. **Cellular automata** make organic caves but guarantee nothing; keep the largest blob. **Wave
   Function Collapse** enforces local adjacency and nothing global. **Room graphs of authored rooms**
   (Isaac, Gungeon, Hades) give pacing control and repeat when the pool is small (D.17-D.21).
10. **Determinism for replay** is an integer PRNG, a fixed draw order, no platform-dependent math in
    generation and a versioned generator (D.22). Already the house rule.

### 2.3 Combat feel on a pad

11. **One stick moves; attacks follow facing with a soft aim assist; a roll with invulnerability
    frames.** Diablo III's console conversion replaced click-to-move with exactly this and reviewers
    called it better than the mouse; the recurring gripe was auto-aim's target priority (E.24).
12. **A short verb set** (Hades: Attack, Special, Cast, Dash, Call) with the dash as the rhythm, not
    a speed boost; hit-stop and shake so a hit registers (E.25, E.28). Twin-stick aim (Gungeon) is
    precise but costs a second stick that touch does not have (E.26-E.27).
13. **Gauntlet's pressure is structural**: generators that spawn until destroyed, health that drains
    and food that restores it, keys and doors, a screen-clearing potion, four players on one screen
    competing for food (E.23). The drain is what players forgive, not what they love.
14. **Enemies are decisions**: chaser, turret, swarm, brute, exploder, summoner, elite affix. Ask
    what each makes the player do: move, aim, prioritise, interrupt, evade (E.29).

### 2.4 Death and pacing players accept

15. Loss is accepted when the run is short, the loss is legible and chosen, the home persists, and
    even a failed run leaves something durable: knowledge, an unlock, a story beat (F.30-F.31).
16. Pacing devices that work expose the trade before the commitment: a previewed reward behind a door,
    a timed invulnerable pursuer (Spelunky's ghost, **which passes through walls**, which is why it
    cannot be waited out by circling), a daily condition, a resource-for-speed trade, a visible route
    (F.32, C.16).

### 2.5 Co-op

17. Shared loot makes generosity meaningful and disputes possible; instanced loot removes the dispute.
    A revive is a rescue objective for the living with a cost that keeps death weighty (G.34).
18. Lockstep exchanges inputs over a deterministic sim; input-delay lockstep buffers a few frames and
    a late input stalls everyone; a relay simplifies connectivity and hides addresses but makes nothing
    deterministic and proves nothing by itself (G.35). Rollback is out of scope: the engine will save
    and restore state (plain JSON, as `check-ski.mjs` proves for the mountain), but no stage here needs
    it.

---

## 3. The engine

### 3.1 Principles

1. **The run is the unit.** Every rule, reward and record hangs on a run: one permit, one seed, one
   configuration stamped by the server, one input log per seat, one verified result. A floor is a
   stage of a run; the file remembers runs.
2. **Pure, deterministic, replayable.** No clock, no `Math.random`, no trig, no DOM, no camera in
   the engine. A run is `f(version, record.cfg, inputs per frame per seat)` and **everything the sim
   reads is in the record**. The server re-plays it before any reward exists. Floor generation is
   inside the sim and draws from its own seeded sub-stream. Hit-stop is sim state; shake is not.
3. **Theme is data, engine is code.** The Sub-Basements and the Safari Zone are two theme packs:
   tiles, room templates, machines, enemy rosters by band, loot tables by band, the words. Nothing in
   the engine knows a form-monster from a leopard.
4. **The way down is guaranteed and its length is chosen; the shortcuts are luck.** The critical
   path is built first, to the band's length (Spelunky); hatches found by breaking and killing are the
   Stardew chance on top, and the chance rises as the floor empties.
5. **Loss is the pack, never the home.** A run that does not end at a lift keeps nothing it carried:
   hearts at zero and the shift clock running out are the same loss. Lifts reached stay reached.
   Apartment, wardrobe, wallet, zoo are never read by the engine and never written by a loss. A
   dropped pack belongs to the seat that dropped it and to nobody else.
6. **Facing melee plus an aimed tool, one stick.** Movement on the left stick, attacks along facing
   with a soft assist, a roll with invulnerability frames, a tool (stapler gun, tranquiliser rifle)
   that aims at the assisted target. A right stick is an option, never a requirement; touch and keys
   get everything.
7. **Calibration is measured, never chosen; a version is a contract.** Every shipped behaviour
   change bumps the engine version with a frozen snapshot and fixtures that must replay forever.
   Measurements use N >= 400 runs and a bot whose error model is fixed before any dial moves and that
   knows no more than the screen shows.
8. **Seats from the first commit.** The state carries `seats[]`, `step` takes one word per seat in
   seat order, the record carries one log per seat and the case of every seat. Solo is a party of one.
   Lockstep is transport; the relay signs, it does not decide.
9. **Nothing the client says is trusted, and nothing the client holds predicts a reward.** Depth,
   lifts, the pack and the bounty come from the server's replay; the contents of a crate come from a
   server secret, so no seed, log or file view can be shopped for salvage.
10. **Looks are a separate module.** `render.js`, `audio.js`, `calls.js` consume the state and an
    event stream.

### 3.2 Module map

```
src/play/crawl/engine/            (zero imports from outside this directory; the purity grep walks every file under engine*/)
  rng.js          fnv over a string, mulberry32 step, named sub-streams (gen, loot, ai) so a draw-order change in one cannot move another
  grid.js         the tile grid as plain arrays (JSON-safe): solid/floor/water/hazard, flood fill, BFS/A* with a fixed tie order, line of sight
  gen/
    plan.js       the floor plan: band -> size, critical path length, side-room count, machine budget, infested and vault flags, water
    path.js       the critical path FIRST: accrete a chain of N rooms from the arrival room (Spelunky's route in Brogue's clothes); the last is the descent room
    accrete.js    side rooms accreted anywhere on the chain (Brogue), loops by band, then lakes that keep the rest connected
    machines.js   set pieces from the theme, never on the critical path when they lock a door (the keycard two or more doors away)
    populate.js   spawns, containers, pickups, the hatch chance that rises as containers shrink, the vault on vault floors
    verify.js     the in-sim guarantees the checks also assert: shortest arrival-to-descent route within the band's range after loops
  entities.js     the entity table: players (one per seat), monsters, machines (generators), containers, pickups, projectiles, hazards
  ai/
    archetypes.js chaser, swarm (flock), charger, turret, splitter, brute, generator, stalker (wall-passing, accelerating), flee+graze, stalk+pounce
    brain.js      per-entity state machines over per-seat flow fields that live IN the state (rebuilt every 10 frames or on a door; snapshots re-play at any frame)
  combat.js       facing attacks (windup/active/recovery), the aim-assist cone, the roll's i-frames, knockback, hit-stop as sim frames, armour, the tool
  capture.js      the pluggable "subdue" module: sedation meters, crating, recovery; a theme turns it on and names what it does
  items.js        the pack (slots), item kinds (bounty, consumable, keycard (slotless), salvage crate, specimen), use rules, the owner-only drop on a loss
  loot.js         loot tables by band, rarity, the daily condition's multipliers; what a container, a monster, a vault gives; generator spawns give nothing
  rules/
    run.js        the run state machine (3.3): LANDING, FLOOR, DESCENT, LIFT, LOST(hearts | shift), FILED
    floor.js      the floor's own machine: EXPLORE, INFESTED (clear to descend), VAULT, the loiter timer -> STALKER
    levels.js     LEVELS (the casual-human dials), NEUTRAL for parties, the dial -> hook table, the bounty multiplier by level
  themes/
    index.js      the theme contract (what a pack must provide) and validation
    subbasements.js   tiles, rooms, machines, bands B4.., monsters, loot, the words, the daily condition's name
    safari.js         zones outward from the lodge, animals by distance, capture on, infested = "capture every animal", the zoo's species table, the frontier hook
  input/
    word.js       the input word (3.9): heading, magnitude, buttons, slot, optional aim; pack/unpack/IDLE
    seats.js      per-seat control state (facing, aim lock, slot); nothing per-human lives outside seats[]
  game.js         newRun(cfg), step(st, words), resultOf(st), claimOf(st) (what the server compares), events
  record.js       the record schema {v, cfg, logs: [rle per seat]} where cfg is the server-stamped permit (3.11); rleEncode/Decode, logTicks, validLog
src/play/crawl/                   (the Sub-Basements adapter; the Safari adapter is a sibling that reuses it)
  Crawl.jsx, render.js (tiles, sprites, the camera window, shake), audio.js, calls.js (the Overlord's memos and PA lines),
  input.js (pads/keys/touch -> words; the lefty presets), replay.js (the version router), records.js (this browser's bests),
  api.js (permit, file, the zoo), Guide.jsx
netlify/functions/crawl.js        permits and verified filings (3.11); netlify/lib/crawl-store.js (the file's runs, lifts, deepest, reward states; deleteCrawl for purge)
netlify/functions/zoo.js          the zoo: captures per case, the public zoo, a plaque scrub for purge (D3)
```

The version router stays in the adapter because it must import every frozen version. Freezing:
`scripts/freeze-crawl.mjs` copies `engine/` to `engine-v<N>/` **before the first behaviour-changing
commit of the next version**, with `scripts/fixtures/crawl-v<N>-records.json` cut at the same moment
(bot and casual-human tapes for every level and both themes once both exist).

### 3.3 The run loop and state machine

```
LOBBY (the adapter: level, hand, the lifts the file has reached, the daily NOTICE, "DESCEND")
  ─permit from the server: cfg = {theme, level, entry, day, cleared, seats: [caseHash], seed, at, v}, signed─▶ LANDING(entry)
  (a practice run with no file gets a local cfg and files nothing)
LANDING(floor f)  the arrival room; the lift car if f is a lift floor; the pack shown; 60 frames of grace (no spawns in view)
  ─▶ FLOOR(f).EXPLORE   break containers, fight, pick up; the loiter clock runs
FLOOR(f).EXPLORE
  ─descent reached (the stairwell at the end of the critical path, always there)─▶ DESCENT(f)
  ─a HATCH opened by chance (containers: 2 % rising to 25 % as the floor's containers run out; kills: 15 %; both scaled by the daily condition;
    generator spawns never roll)─▶ DESCENT(f) (a shortcut: the same transition)
  ─a CHUTE entered (B12+; drops 2-4 floors for 1 heart per floor, never below 1)─▶ LANDING(f + k)
  ─infested floor: the descent is sealed─▶ FLOOR(f).INFESTED ─every monster filed (safari: every animal crated)─▶ EXPLORE, unsealed
  ─vault floor (B10, B20, …): the vault room holds one guaranteed salvage crate─▶ (no transition; a tag on populate)
  ─loiter clock expires (2:30 on CLERK; the level dial moves it)─▶ STALKER on: THE AUDITOR arrives through the nearest wall, invulnerable,
    0.8 x walk speed rising 5 % every 10 s to 1.4 x, through walls and doors, a 2-heart hit with a stagger; it never leaves the floor
  ─the lift called on a lift floor (B8, B12, B16, …)─▶ LIFT: the pack is kept; the run ends FILED(exit: "lift")
  ─hearts 0─▶ LOST(hearts): the pack is dropped where you fell, for its owner's seat only; the run ends FILED(exit: "lost", why: "hearts")
  ─shift clock 20:00 (real) expires─▶ LOST(shift): the night cleaners take what you carried; FILED(exit: "lost", why: "shift")
     (warnings at 18:00 and 19:00; the only way to keep a pack is a lift, as the only way to keep a Stardew day is bed)
DESCENT(f) ─▶ LANDING(f + 1): a new floor from the gen sub-stream seeded fnv(`${cfg.seed}|${f}`)
FILED  claimOf(st) = {depth, exit, why, lifts: [lift floors reached], pack: [crate ids and item kinds], bounty, filedAt tick}
       the adapter posts {runId, logs, claim}; the server re-plays and lands the rewards (3.11)
```

Three clocks, all in frames: the **loiter clock** per floor (the Stalker), the **shift clock** per
run (20 real minutes = 72,000 frames; the server also refuses a log longer than the wall clock since
the permit), and the **grace** on landing. Lifts are at B8 and every four floors after; the entrance
landing is B4, or any lift floor the file has reached (`cfg.entry`, checked by the server against the
record). **A lift reached stays reached**: the file records it the moment the server replays the
run, whichever way the run then ended (research A.1: the elevator is the promise players plan around;
9.2 asks Scott to confirm). The pack converts to rewards only on `exit: "lift"`; a loss converts
nothing but the record (deepest floor, lifts). The Auditor's wall-passing and acceleration are what
make the shift clock honest: a player who circles a loop for seventeen minutes is caught, and a bot
that tries it must file nothing (section 5).

Every transition emits a typed event (`floor.enter`, `hatch.open`, `infested.cleared`,
`stalker.arrive`, `lift.called`, `lost`, `pickup`, `hit`, `kill`, `capture`) consumed by the render,
the audio, the Overlord's lines, the HUD and the checks.

### 3.4 Floor generation (`gen/`)

Spelunky's guarantee first, then Brogue's growth:

1. **Plan** (`plan.js`): the band table gives the floor's size (B4-B7: 40 x 28 tiles; wider and
   taller by band), the critical path length N (5-7 rooms on band 1), side-room count, machine
   budget, infested chance, vault flag, water budget.
2. **Path** (`path.js`): the arrival room (a theme template: a lift lobby or a stairwell landing),
   then N − 1 rooms accreted **as a chain**, each slid on a scratch grid until it fits snugly against
   the previous room only, with a door punched between them; the last room is the descent room (the
   stairwell). The route exists and has the planned length before anything else is drawn. If the chain
   cannot grow to N in the floor's bounds the plan retries with the next seed in the sub-stream (bounded,
   counted, asserted rare).
3. **Accrete** (`accrete.js`): side rooms from the theme's templates slid until they fit snugly
   against any existing room, a door punched; repeat to the room count. Then `loops`: for pairs of
   rooms adjacent on the grid but far apart on the graph, punch a door with probability from the band
   (deeper floors loop more). Then `lakes`: water or hazard blobs drawn by cellular automata and placed
   only where the passable remainder stays fully connected (flood fill), so nothing forces a crossing.
4. **Verify in-sim** (`verify.js`): the shortest arrival-to-descent route on the finished graph is
   within the band's range (loops may shorten it; the plan's N allows for that); every room is tagged
   by its distance off the shortest route (0 = on it). Containers and loot are weighted toward side
   rooms; spawns toward the route.
5. **Machines** (`machines.js`), from the theme's table, by budget: a **locked store** (a door that
   needs the keycard spawned in a side room two or more doors away; **never on the critical path**), a
   **copier room** (a generator with a chokepoint door), a **flooded stack** (a lake with a pump switch
   that drains it), a **mandatory training** zone (a hazard strip that roots you for 2 s unless you roll
   through), a **notice board** (a readable memo; no mechanics). Area machines may re-run accretion
   inside their region with other parameters (cramped mailroom cells; a server hall of long rows).
6. **Populate** (`populate.js`): spawns by band from the theme's roster, never inside the arrival
   room or with line of sight to its door; containers (cabinets, crates) carrying the hatch roll;
   pickups; the vault crate on vault floors; the infested roll; the Stalker's timer.
7. **The checks** (`check-crawl`): over 10,000 seeds per band, 100 % of floors have the descent
   reachable from the arrival within the band's route range; every keycard reachable without its own
   door and never needing a pack slot; every machine's switch reachable; no spawn in view at landing;
   generation inside its budget (section 5).

Floor seeds are `fnv(`${cfg.seed}|${f}`)`, and generation draws only from the `gen` sub-stream, so a
change in the AI's or loot's draw order cannot move a wall. The whole floor is generated when it is
entered, not before, so co-op clients never disagree on what was generated when. **Grids are plain
arrays** (or encoded strings), never typed arrays, so a JSON snapshot of the state at any frame re-plays
identically (typed arrays and `-0` do not survive `JSON.stringify`).

### 3.5 Entities and AI (`entities.js`, `ai/`)

**Archetypes are the engine's; monsters are the theme's.** Each archetype is a small state machine
over a per-seat flow field (a BFS distance grid from each player, part of the state, rebuilt every 10
frames or when a door opens). The theme binds a monster to an archetype with numbers (hearts, speed,
damage, armour, drops) and words.

| Archetype | Behaviour | What it asks of the player | Sub-Basements (band 1) | Safari |
|---|---|---|---|---|
| chaser | approaches along the flow field; attacks in melee; leash 14 tiles; gives up after 3 s unseen | spacing, facing | FILE CART (also a charger) | HYENA |
| swarm | 4-9 light bodies that flock (separation, cohesion, chase) and bite | crowd control, the roll | FORM 27-B (loose paper) | WILD DOGS |
| charger | lines up, telegraphs 30 frames, charges 8 tiles, stunned 40 frames on a wall | the sidestep | FILE CART | RHINO |
| turret | stationary; fires an arc every 90 frames at the assisted target; rotates slowly | line of sight, closing distance | TONER PRINTER | SPITTING COBRA |
| splitter | wanders; on death at size > 1 splits into two of size − 1; the children count toward "every monster filed" and are finite | finishing what you start | FERAL DATA (the slime) | (none) |
| brute | slow, armoured (hits bounce until the armour is broken), wide swing | patience, hit-and-run | SHREDDER | ELEPHANT (never aggressive unless cornered) |
| generator | stationary; spawns a bound monster every N frames until destroyed; Gauntlet's generator. **Its spawns drop no bounty and roll no hatch**, and they do not count toward "every monster filed"; breaking the generator does | prioritising | THE COPIER | THE DEN |
| stalker | arrives when the loiter clock expires; invulnerable; **passes through walls and doors**; 0.8 x walk rising 5 % every 10 s to 1.4 x walk; a 2-heart hit with a stagger, never a one-hit loss; targets the seat that has loitered longest | leaving | THE AUDITOR | THE RANGER'S PATROL (sends you back) |
| flee+graze | grazes; flees from players within 8 tiles; tires | the approach, the dart | (none) | ANTELOPE, ZEBRA |
| stalk+pounce | hides in cover, stalks, pounces (a charger with a wait) | reading the cover | (none) | LEOPARD |

AI quality rules the checks hold (section 5): no monster stands inside a wall or oscillates in a
doorway for more than 60 frames (the Stalker excepted on walls, by design); a chaser reaches a standing
player within the band's time; a swarm never stacks more than two bodies on one tile; turrets are
never placed facing a wall within 3 tiles; generators are never in the arrival room or the descent room.

### 3.6 Depth, bands and theme packs (`themes/`)

A theme pack provides, by **band** (four floors each in the Sub-Basements; one zone outward each in
the Safari Zone):

```js
{ id: "subbasements", depthLabel: (f) => `B${f}`, entry: 4, liftEvery: 4, vaultEvery: 10,
  bands: [
    { from: 4, name: "STORAGE",      size: [40, 28], rooms: [8, 11], path: [5, 7], loops: 0.1, water: 0, infested: 0.08, roster: ["feral-data", "form-27b", "file-cart", "toner-printer"], joins: { 6: "file-cart" }, generators: ["copier"], loot: "band1", strange: 0 },
    { from: 8, name: "THE STACKS",   size: [44, 30], rooms: [10, 13], path: [6, 8], loops: 0.15, water: 0, infested: 0.12, roster: [... + "shredder", "w9-wraith"], joins: { 10: "w9-wraith" }, loot: "band2", strange: 1 },
    { from: 12, name: "SERVER FARM", size: [48, 32], rooms: [11, 14], path: [6, 9], loops: 0.2, water: 0, chutes: true, infested: 0.15, roster: [...], loot: "band3", strange: 2 },
    { from: 16, name: "FLOODED",     size: [48, 34], rooms: [11, 15], path: [7, 9], loops: 0.25, water: 0.18, infested: 0.15, roster: [...], loot: "band4", strange: 3 },
    { from: 20, name: "THE DEEP RECORDS", …, strange: (f) => 4 + (f - 20) / 4 },   // the dial that makes deeper stranger
  ],
  daily: { name: "THE BUILDING'S MOOD", of: (day) => … },   // the Daily Luck analogue, from cfg.day (the permit's machine day), posted in the lobby
  words: { descend: "DESCEND", lift: "CALL THE LIFT", pack: "PACK", lost: "YOU WERE FOUND BY THE NIGHT CLEANERS.", … },
  capture: null }
```

**The roster grows by the ten-floor rule** (research A.3): `joins` names the floor at which one new
monster or affix enters inside a band, so there is something new roughly every other floor pair and
never a whole band that plays the same. **Deeper = stranger + richer** is two dials: `strange` (how
far populate may deviate: more machines, longer loops, lakes of toner, the memos stop making sense,
monsters gain affixes) and the loot band (rarer salvage, more bounty paper per container; the CYCLES
bounty saturates against the daily cap, so depth pays in things, not money, as 3.8 says). "B-infinity"
is the band table's last row applying to every floor after it with `strange` as a function of depth;
nothing else grows without bound.

**The Safari Zone** is the same shape read outward: `depthLabel: (z) => `${z} KM OUT``, `entry: 1`,
lifts are RANGER STATIONS every three zones, vaults are WATERING HOLES, `capture` is on (3.7), an
infested zone is cleared by **crating every animal in it** (nothing dies), the roster is animals
(flee+graze and stalk+pounce join the archetypes), lakes are rivers, machines are a hide, a salt lick,
a poachers' snare line (a hazard, no people). **The frontier hook**: `cfg.cleared` (stamped into the
permit by the server from the published plan's chunk count at the north edge, `CITY2.md` 1.5; zero
until the plan exists) makes the zone's first `cleared` zones CLEARED LAND (sparse animals, no vaults),
so as City 2.0 builds, the wild starts further out and the Safari Zone's edge moves with it, and an
old tape still re-plays on the frontier it was played on. The lodge never moves; the walk does.

### 3.7 Capture (`capture.js`), a pluggable module

Capture replaces killing when a theme turns it on, and it is the same code path the Sub-Basements
use to **recover** feral data:

- A **subdue meter** per target, filled by the tool's hits on a subduable target (the tranquiliser
  dart; in the Sub-Basements the stapler gun on FERAL DATA, which is subdued rather than split) and
  drained slowly; melee does not fill it (a clubbed animal is not a captured one). The tool needs no
  mode switch: on a subduable target it subdues, on anything else it damages.
- At full meter the target is **subdued** (animation state, no AI, 10 s window); the player crates it
  with A held 1.5 s; the crate is a pack item (`specimen:<species>`), heavy (two slots).
- Animals have **temperaments**: an antelope flees at 8 tiles; a leopard stalks; a rhino charges when
  approached head-on and is darted from behind cover; an elephant is never hostile unless cornered
  and takes four darts. Dart from range, never shoot to kill: the tool has no damage in the safari theme.
- **Nothing dies in the Safari Zone.** The player can be "killed" (knocked out: "YOU WAKE AT THE
  LODGE. THE CRATES WERE RELEASED."); animals cannot. `check-crawl` asserts no animal entity ever
  reaches hearts 0 in the safari theme, and that an infested zone can always be cleared by capture.
- The zoo receives verified specimens (3.11); a species' first captor is on the zoo's plaque like
  the aquarium's first donors, and purge scrubs the plaque.

### 3.8 Items, the pack and loot (`items.js`, `loot.js`)

- **The pack** is 12 slots (specimens take two; keycards take none and are floor-scoped). It is the
  only thing a loss costs. On a loss the pack is left where you fell, **for its owner's seat only**: a
  revive returns it (D4); when the seat is recalled it is destroyed. Nothing ever changes hands between
  players, which keeps the no-transfer rule intact.
- **Item kinds**: BOUNTY PAPER (the CYCLES value, tallied, never an object you keep), COFFEE (heals
  two hearts; Gauntlet's food), FORM 00 (a blank: clears every projectile and staggers everything in
  view; one per floor at most), KEYCARD (slotless, floor-scoped), SALVAGE CRATE (an unbuyable
  furniture or garment, revealed on filing: "DECOMMISSIONED TERMINAL", "FILING CABINET, DENTED",
  "SURPLUS COT"; "DEPARTMENT COVERALLS", "VISITOR LANYARD", "B-12 HARD HAT"), SPECIMEN (safari).
- **Loot tables by band**, with the daily condition as a multiplier on container drops and the hatch
  chance. Rarity: common / uncommon / rare / vault-only. Salvage is **one of each garment per file**
  (as `w:` items are today) and **at most 3 of a furniture piece** (`MAX_FURN_EACH`). **A crate is a
  crate until the server opens it**: its contents are `HMAC(serverSecret, runId, crateId)` resolved
  against the band's table and the file's holdings **inside the ledger function, under the case's
  lock** (3.11); a result the file already holds at its cap falls through to the next item on the
  table. No seed, no log and no view of the file predicts a crate, so permits cannot be shopped; and two
  filings in flight cannot over-grant.
- **Bounty**: BOUNTY PAPER per container and per kill, depth-weighted, totalled as `claim.bounty`,
  then multiplied by the level's factor (3.10; 9.4). Generator spawns pay nothing. The server mints
  `min(bounty, capLeftToday)` (3.11). The ceiling makes the first run of the day the one that pays; the
  second is for salvage and depth, which is the daily rhythm Scott asked for.
- **Hearts**: 6 at the start of a run, no permanent upgrades (no power creep across runs; knowledge is
  the progression, as Spelunky). COFFEE in the pack is the Gauntlet food decision.

### 3.9 Controls (`input/`), the adapter's hands

**The input word**, per seat, 22 bits: heading 4 bits (16-way, quantised with hysteresis so a stick
near a boundary does not chatter the RLE), magnitude 2 bits (still / walk / run), buttons 6 bits
(ATTACK, ROLL, TOOL, INTERACT, USE, AIM-LOCK), slot 4 bits (the pack slot the USE button acts on,
0-11; cycling and direct picks both write this field), aim heading 4 bits + 1 valid bit (an optional
right stick), 1 spare. Menus and pause never enter the word. `pack`/`unpack`/`IDLE` as the mountain
has them; RLE on the word.

**Speeds**: walk 4.5 tiles/s, run 6.5 tiles/s. Keys and touch run by default and walk on a modifier
(walking matters for the Safari approach); a pad walks at partial stick and runs at full stick or with
RT held (the house glyph for run).

| | Pad (right-handed preset; the legend uses the pad's own glyphs) | Pad (LEFT-HANDED preset) | Keys | Touch |
|---|---|---|---|---|
| Move | left stick / d-pad | left stick / d-pad (the left thumb still moves) | WASD / arrows | stick, left half (mirrored right for lefties) |
| Run | full stick or RT | full stick or LT | default; Shift walks | default; a WALK toggle |
| ATTACK (facing melee) | X | LB | J or Z | big button |
| ROLL (12 i-frames of 18) | B | RB | K or X | button |
| TOOL (stapler gun / tranq rifle; aimed at the assisted target or the aim stick) | Y | RT | L or C | button |
| INTERACT (pick up, open, call the lift, crate) | A | LT | E or Space | button (contextual label) |
| USE (the selected slot) | LB | X | Q | tray tap |
| Slot | RB next, d-pad up/down | B next, d-pad up/down | 1-9, 0, -, = | tray tap |
| AIM-LOCK (hold: facing stays while you strafe) | LT | Y | F | hold the attack button |
| Optional aim | right stick (`aim valid`) | right stick | none in D1 | none |
| Pause | Start | Start | Esc / Enter | pause glyph |

A full remap is under Pause > CONTROLS from D2. **Facing melee**: the attack goes where you face;
facing is the last movement direction, held by AIM-LOCK. **Aim assist**: within a 60-degree cone of
facing the nearest live target within 6 tiles is the assisted target; the tool fires at it; melee
snaps facing up to 22.5 degrees toward it on the press (Diablo III console's influenceable
auto-target). A `controls: "assist" | "manual"` option turns the snap off. **Lefty**: the profile's hand
(`profileHand()`) selects the left-handed pad preset and mirrors the touch layout; `hand` and the
preset are metadata in the record, outside the log. Couch co-op would need `readPads()` (today's
`readPad` returns the first pad only); it is not in D4's scope and is noted for later.

### 3.10 Visibility, difficulty and the casual-human calibration (`rules/levels.js`)

**What the player sees** (so the bot can be defined by it): the camera window is 24 x 14 tiles
around the seat (the party box in co-op); a room's interior is revealed when a seat enters it and
stays on the minimap; monsters are drawn only inside the window and in revealed rooms; the descent is
unknown until seen.

`LEVELS` is the mechanism; every number is measured. The dials are **hooks**, each scaling one code
path, and a new module must keep the hook or retire the dial and re-measure. **The permit stamps the
level** (`cfg.level`), so a filing cannot claim one level and play another.

| Level (the theme relabels) | Intended casual-bot outcome, Sub-Basements B4-B8 | Dials | Bounty factor (9.4) |
|---|---|---|---|
| INTERN (default; Safari: TOURIST) | reaches the B8 lift in 70-80 % of runs | hearts 8, monster damage x0.7, loiter 4:00, assist cone 90 deg, hatch curve x1.5, generator rate x0.7 | x0.6 |
| CLERK (RANGER) | 50-60 % | hearts 6, x1.0, 2:30, 60 deg, x1.0, x1.0 | x1.0 |
| OFFICER (WARDEN) | 30-40 % | hearts 6, x1.2, 2:00, 45 deg, x0.8, x1.3; elites appear | x1.3 |
| DIRECTOR (EXPEDITION) | 10-20 % | hearts 5, x1.4, 1:30, 30 deg, x0.6, x1.6; affixes from B6 | x1.6 |

**The bot** (`scripts/crawlBot.mjs`) is a **first-timer**, as the mountain's is: it knows nothing
of the floor but what has been revealed; it explores toward the nearest unrevealed door (a frontier
walk over seen tiles), so it exercises the loiter clock, the containers and the hatch curve; it has a
250 ms reaction with a 100 ms spread, attacks when a target is inside **its own fixed 45-degree
reading cone** (not the assist dial, so the dial can be measured against it), rolls late (150 ms after
a telegraph), opens every container it passes within 3 tiles, uses COFFEE at 2 hearts, calls the lift
when it stands on one. Its parameters are fixed and published with the version before any dial moves.

**Measurement and cost**: N >= 400 seeds per level per theme per version. **One engine budget**:
<= 20 µs a frame with one seat and 40 entities, <= 50 µs with four seats (a 72,000-frame solo run is
<= 1.5 s of engine time; a four-seat server replay <= 4 s, with the function's timeout set above it
in `netlify.toml`). A calibration sweep ends each run at its lift or loss, so the median run is far
shorter than the shift; 12 workers keep a full sweep under ten minutes. Bands are the acceptance test,
INTERN at or above the house floor of 70 %, monotone across levels.

Parties (D4) play NEUTRAL (CLERK's numbers) with monster hearts x(1 + 0.5 (n − 1)) and spawn counts
x(1 + 0.35 (n − 1)); loot is instanced, so nothing else scales.

### 3.11 Deterministic replay, server verification and how rewards land

**The record**: `{v, cfg, logs: [rle per seat]}` where `cfg` is **the permit, exactly as the server
signed it**: `{runId, theme, level, entry, day, cleared, seats: [caseHash], seed, at, v, hand}`
(`hand` and the control preset are the only client fields, and the sim does not read them).
`replay(record)` is bit-identical in any browser and in node; everything the sim reads is in `cfg`
and `logs`. **Every shipped behaviour change bumps `v`**; the snapshot is taken before the first
behaviour-changing commit of the next version and the fixtures cut then. Debug and verify modes keep a
rolling per-frame hash so a divergence is located, not just detected.

**The endpoint** (`netlify/functions/crawl.js`):

```
GET  /api/crawl?caseId=            the file's record: deepest, lifts, salvage filed, today's bounty used, the daily condition
POST {caseId, action: "start", theme, level, entry, hand}
                                   a permit: cfg signed with the server secret. The seed, the machine day (cfg.day), the frontier
                                   count (cfg.cleared), the seat's case hash and the clock are the server's; entry must be B4 or a lift
                                   the file has reached; ONE open permit per case (a new start files the open one as a loss first);
                                   written on the case record (RUN_TTL 40 min); requireCaseAuth for a secured file; the usual limiters
POST {caseId, action: "file", runId, logs, claim: {depth, exit, why, lifts, pack, bounty}}
                                   verifies the permit's signature; re-plays in node on cfg.v; refuses a log longer than the wall clock
                                   since the permit (+10 s slack) or than the shift (72,000 frames + 600), or over MAX_LOG_PER_SEAT
                                   (150,000 numbers; the body over 4 MB); compares claimOf(st) field for field with the claim
                                   (a mismatch is a 422, never a silent correction); then the reward steps, EACH with its own state on
                                   the run record (pending / done / lapsed) and retried on a later file or GET for 30 days, as the
                                   trophies are, so a ledger outage loses nothing:
                                     1. the record: deepest = max, lifts = union, runs kept 50 (crawl-store, Blobs "hvi-crawl")
                                     2. lifts reached -> the lift menu in the lobby (from the record)
                                     3. if exit is "lift": each SALVAGE CRATE -> econ_salvage(idem `salvage:<runId>:<crateId>`,
                                        secretKey = HMAC(serverSecret, runId, crateId), band, level): the function locks the case,
                                        resolves the contents against the table and the holdings (wear once, MAX_FURN_EACH), grants an
                                        item of the right kind (wear | furn) with a claim txn and no CYCLES, and returns the item or
                                        'lapsed' when the table is exhausted; each SPECIMEN -> the zoo store (D3)
                                     4. if exit is "lift": bounty -> econ_bounty(idem `bounty:<runId>`, amount = claim.bounty x the
                                        level's factor, day): a per-case per-day counter row locked FOR UPDATE; mints
                                        min(amount, CAP - used) from dept:treasury to cash:<h> as a txn of kind "bounty" (a migration
                                        adds the kind to econ_txns_kind_check); 0 when the cap is spent (the run still files);
                                        refused as 'no-wallet' for a file that is not enrolled and vested (it waits, like a trophy)
                                     5. a MY FILE line when deepest moved by a band ("REACHED B12. THE DEPARTMENT NOTED IT.")
```

Rate limits as the mountain's (`crawl-ip`, `crawl-start`, `crawl-file`, `crawl-miss`). Anyone can
play an unfiled practice run without a file; filing needs one. The memory twin of every new ledger
function mirrors the SQL rule for rule, and `check-economy` gains a race test (two filings of two runs
with the same crate table, the second must fall through) and the cap test (two filings over the cap
mint exactly `CAP` in total; a third mints 0 and files). `purge.js` gains `deleteCrawl` and the zoo's
plaque scrub.

**The daily cap** is one new ledger rule. Proposed `BOUNTY_CAP = 300` a day **shared across every
game that mints from verified play** (the fish sales to come, this one, any later one), so the ceiling
on play-minted CYCLES is one number beside `UBI` in `src/economy/rules.js`: 30 % of UBI, a morning's
wage, not a job. This is 9.1.

### 3.12 Co-op readiness (lockstep, D4) and what D1-D3 must not break

- `st.seats[k]` holds everything per human (the player entity id, facing, aim lock, slot, down
  state, the case hash from `cfg.seats[k]`); `step(st, words)` takes one word per seat in seat order;
  a missing seat's word is `IDLE`; the record is `logs[]`. Solo is `seats.length === 1`. Nothing in
  the engine reads wall time or the DOM.
- **One screen, Gauntlet's leash**: the camera (adapter) frames every living seat; the sim bounds
  the party to a **box of 20 x 12 tiles** (a soft wall at the box's edge for whoever would leave it),
  so the shared picture never exceeds one screen and no one runs ahead of it. Monsters target the
  nearest seat by flow field; the Stalker targets the seat that has loitered longest.
- **Downed and revived**: hearts 0 drops the seat's pack where it fell (owner-only) and leaves a
  body; a teammate holds A for 2 s to revive at 2 hearts, which returns the pack to its owner; after
  30 s undrawn the seat is recalled to the lift and its pack is destroyed. A party wipe is a loss for
  everyone.
- **Instanced loot**: a container drops one pickup per living seat, visible to its seat only (the sim
  knows; the render filters; there is nothing to cheat, because salvage is resolved on the server);
  bounty is per seat; the lift pays each seat.
- **The relay**: a Cloudflare Worker with one Durable Object per party, joined by a share link
  `#basements?party=<code>`. **Every seat authenticates at join** (its own `requireCaseAuth`
  session, exchanged for a seat token), and the party permit from `/api/crawl` names every seat's case
  hash in `cfg.seats`. The DO orders every frame's bundle of words with a fixed 3-frame input delay,
  substitutes `IDLE` for a seat whose word is late by more than 10 frames and records the substitution
  in the bundle, and **HMAC-signs the ordered stream** with a secret it shares with `/api/crawl`. Each
  case files its own seat with the signed stream; the server replays the whole party once and lands
  each seat's rewards. A forged four-seat stream from one client fails the signature. Rollback is out
  of scope.

### 3.13 Overlord satire in the Sub-Basements

Plain copy in play ("PACK FULL", "LIFT UNLOCKED: B8", "KEYCARD: B6"); the voice is in the memos
and the menus:

- **Memos** in the lift car and, from D2, on notice boards (Scott's beloved NOTICE boxes with an OK
  that does nothing): "MANDATORY TRAINING IS IN PROGRESS ON THIS FLOOR. ATTENDANCE IS AUTOMATIC.";
  "THE COPIER HAS BEEN REPORTED. THE REPORT HAS BEEN COPIED."; "B12 IS NOT A FLOOR. B12 IS A
  CONDITION." They get stranger with `strange`; by B20 the memos are to the player by case number.
- **Compliance hazards** (D2): WET FLOOR signs that are wet; MANDATORY TRAINING strips; a CONSENT
  FORM pressure plate that opens the door and the vents.
- **Form-monsters**: FORM 27-B (REQUEST FOR A FORM) swarms; the W-9 WRAITH (B10+) that asks for your
  details and drains a heart if you stand still; FORM 00, the blank, is the item that clears them.
- **THE AUDITOR** is the Stalker: it does not kill, it finds you non-compliant, repeatedly, through
  walls.
- **The daily condition** is THE BUILDING'S MOOD, posted in the lobby with a survey about it that
  changes nothing ("RATE YOUR SATISFACTION WITH THE SUB-BASEMENTS").
- **The loss**: "YOU WERE FOUND BY THE NIGHT CLEANERS. YOUR PACK WAS NOT." (hearts) / "SHIFT OVER.
  THE CLEANERS TOOK WHAT YOU CARRIED. THE LIFT WOULD HAVE TAKEN YOU." (shift). The Safari Zone's
  lines are the Outfitter's: polite, expensive, no satire of animals.

---

## 4. Content for the first slice (D1, THE SUB-BASEMENTS B4-B8)

| Kind | Items |
|---|---|
| Floors | B4 (entrance landing: the lift car, no spawns), B5, B6, B7, B8 (the first lift). Band STORAGE: 40 x 28 tiles, 8-11 rooms, route 5-7, infested 8 %, no water, no chutes |
| Rooms (templates) | lift lobby, stairwell landing, storeroom (rect), overlapping offices, a blob of collapsed shelving, a ring corridor round a cage, a hall with a dead-end hallway |
| Machines | **two**: the locked store + keycard (off the route); the copier room (chokepoint). Memos appear as the lift car's NOTICE; notice boards and the training strip are D2 |
| Monsters | FERAL DATA (splitter: 3 hearts, splits to size 2 then 1), FORM 27-B (swarm of 6), FILE CART (charger, joins at B6), TONER PRINTER (turret) |
| Generator | THE COPIER (spawns FORM 27-B every 6 s until broken, 6 hearts; its spawns pay nothing) |
| Stalker | THE AUDITOR (loiter 2:30 on CLERK; through walls; accelerating) |
| Items | BOUNTY PAPER (tallied; nothing minted until D2), COFFEE, KEYCARD (slotless), FORM 00 (one per floor at most), SALVAGE CRATE (a crate; D1 shows "CRATE: OPENED ON THE NEXT RELEASE") |
| Player | 6 hearts (INTERN 8), walk 4.5 / run 6.5 tiles/s, roll 10 tiles over 18 frames with 12 i-frames, melee windup 6 / active 4 / recovery 8 frames, hit-stop 3 sim frames, knockback 1 tile (never into a wall); stapler gun 1 damage at 8 tiles, 20-frame cooldown |
| Controls | the right-handed and left-handed pad presets, keys, touch (mirrored); no mouse aim and no right-stick aim in D1 (the `aim` bits exist and stay zero) |
| Entrances | `#basements` tile on THE GAMES; SERVICE LIFT: B4 AND BELOW in the Pen's B3 strip (`src/Pen.jsx`) and one line in `BuildingView.jsx`'s HQ branch |
| Records | this browser (`records.js`, as the mountain's): deepest, runs, lifts; replays watchable; the record already carries `cfg` in the permit's shape with a local seed and `seats: [null]` |
| Levels | INTERN (default), CLERK, OFFICER, DIRECTOR, all measured on the first-timer bot before shipping |
| Look | rectangles and pixel glyphs in the Department palette; sprites later. Feel first |

---

## 5. Quality checks that can fail (`scripts/check-crawl.mjs`)

Every row is an assertion, headless, written so it can fail.

| Check | Target |
|---|---|
| Purity | every file under `engine*/` passes the grep: the ski list plus `new Date`, `Date(`, `Intl`, `toLocale`, and any `.sort(` whose comparator lacks a tie-break; no import leaves its engine directory |
| Determinism | every fixture replays (bot and casual tapes, every level, both themes); a doctored log does not reproduce the result; another version is refused; a JSON snapshot taken at a frame that is **not** a multiple of 10 re-plays identically to the end; the per-frame hash matches; a record whose `cfg` differs in `day` or `cleared` produces a different floor |
| Route | 10,000 seeds per band: 100 % of floors have the descent reachable from the arrival, and the shortest route after loops is within the band's range; chain retries < 1 % of seeds |
| Connectivity | every keycard reachable without its own door; the locked store is never on the shortest route; every machine switch reachable; lakes never force a crossing |
| No softlock | infested floors: killing everything always unseals (splitter children finite; generator spawns excluded; the Stalker never counts); safari infested zones clear by capture; a full pack never blocks a keycard |
| Landing grace | no monster has line of sight to the arrival door at frame 0; no spawn within 6 tiles of it |
| Generation cost | <= 5 ms a floor headless at band 1, <= 12 ms at band 5 |
| Engine cost | <= 20 µs a frame with 40 entities and one seat, <= 50 µs with four seats; a 72,000-frame solo bot run <= 1.5 s of engine time; a four-seat replay <= 4 s |
| AI sanity | no entity but the Stalker inside a wall; no doorway oscillation > 60 frames; a chaser reaches a standing player within 4 s from 14 tiles; swarms never stack > 2 on a tile; turrets never face a wall within 3 tiles; generators never in the arrival or descent room |
| The Auditor | arrives on the loiter tick exactly; crosses a wall; reaches 1.4 x walk by 2:00 after arrival; a bot that circles the longest loop for 17 minutes after arrival ends the run as a loss and files no pack |
| Combat feel numbers | roll i-frames exactly 12 of 18; a hit during i-frames deals 0; knockback never pushes into a wall; hit-stop frames are in the fixture (removing them changes the result) |
| Loss rule | after `exit: "lost"` (either `why`) the claim's pack is empty and lifts are unchanged; a dropped pack is picked up only by its owner's seat; the server never calls a shops or economy function on a loss |
| Reward rule | `econ_bounty`: two filings over the cap mint exactly `CAP`; a third mints 0 and files; an unvested file gets 'no-wallet' and the step stays pending; `econ_salvage`: the contents cannot be computed from `cfg`, the log or the GET view (a test that tries with the client's data fails); a crate for a garment already held falls through to the next item; two concurrent filings never over-grant; every reward step is retried after a simulated `LedgerDown` and lands once |
| Permits | a second `start` with one open closes it as a loss; a filing against a tampered `cfg` fails the signature; `entry` above the file's lifts is refused |
| Capture (D3) | no animal reaches hearts 0 in the safari theme; a specimen crate needs a full meter; the zoo receives only verified specimens; purge scrubs a plaque |
| Calibration | INTERN 70-80 % B8 reach for the first-timer bot at N >= 400, bands monotone across levels, re-measured per version |
| Co-op (D4) | a two-seat tape replays; `IDLE` substitution is recorded and replays; the party box holds (<= 20 x 12 tiles); a revive at 2 hearts returns the pack to its owner; a wipe files a loss for all; an unsigned stream is refused |
| Bundle | the entry stays <= 90 KB gzip; the crawl chunk is lazy |

---

## 6. The staged build plan (smallest playable first)

Each stage ends with the checks green, calibration re-measured at N >= 400, and, when behaviour
changed, a frozen snapshot and fixtures. **Everything the v1 fixtures freeze is decided in D1**: the
input word, the record's `cfg` shape, hit-stop in the sim, the loss rule for the shift clock, the
Auditor's wall-passing, path-first generation, plain-array state, owner-only packs.

### D1: THE SUB-BASEMENTS, solo, B4-B8, one lift (engine v1)

Build: `engine/` complete for band 1 (rng, grid, gen with path-first chain + accretion + two
machines + populate + in-sim verify, four archetypes + generator + stalker, combat with facing melee /
roll / tool / aim assist / sim hit-stop, items and loot tables for band 1 with the bounty tallied and
crates as crates, the run and floor state machines with the three clocks and the two-way loss, levels
with the first-timer bot, seats and `cfg` from day one, the record with `logs[]`); the adapter
(`Crawl.jsx`, render in rectangles and glyphs with the 24 x 14 window and the minimap, input with both
pad presets and the touch mirror, `GameMenu` end and pause rows, `HowTo` with the pad sketch,
first-run tips, local records and replay); the two entrances; `check-crawl` with every row above that
does not need the server; `scripts/freeze-crawl.mjs` and the v1 fixtures cut at ship.

What Scott sees: he walks into HQ, takes the service lift from B3, lands at B4, breaks cabinets,
fights paper and feral data with a stapler gun and a roll that works, finds the stairwell (or a
hatch), takes a keycard to a locked store, breaks a copier before it buries him in forms, hears the
Auditor come through the wall when he dawdles, reaches B8 and calls the lift (or does not, and wakes
at B4 with an empty pack and the Overlord's line). A legend on the pad he is holding, with his hand.
INTERN-easy by default, measured.

### D2: depth, the file, and rewards that land (v2)

Build: bands 2-5 and the `strange` dial, chutes, water, vaults at B10 and B20, infested floors on
every band, the notice board and training strip machines, elites and affixes on OFFICER+;
`netlify/functions/crawl.js` and `crawl-store.js` (signed permits with the full `cfg`, one open permit
per case, verified filings, per-step reward states with retries, the record, the lobby's lift menu
from the file, `deleteCrawl` for purge); the salvage catalog (`src/city/salvagePieces.js` for the
flats, `salvage` entries in `src/wear.js` and `src/economy/shops.js` marked `award`); the migration
with `econ_salvage`, `econ_bounty`, the `bounty` kind and the per-day counter, with memory twins and
the `check-economy` race, cap and outage tests; `BOUNTY_CAP` shared across games; THE BUILDING'S MOOD
from `cfg.day`; MY FILE's line; the daily survey; the full remap under CONTROLS. Fixtures v2.

What Scott sees: a run that pays: salvage shows up in his apartment's furniture list and his closet
("DEPARTMENT COVERALLS", unbuyable), a few hundred CYCLES in the tray with "BOUNTY" on the ledger
line, and his deepest floor on his file. The second run of the day pays in things, not money.

### D3: THE SAFARI ZONE on the same engine, capture and the zoo (v3)

Build: `themes/safari.js` (zones, biomes, animals on the flee/stalk archetypes, rivers, hides,
ranger stations, infested-by-capture), `capture.js` on, the Outfitter door (`#safari`, the panel's line
changes), `netlify/functions/zoo.js` and `#zoo` (every species, first captor, counts; the aquarium's
shape; the plaque scrub), `cfg.cleared` stamped from the plan's chunk count, Safari words and lines.
Fixtures v3 (both themes).

What Scott sees: the lodge, a truck, a tranq rifle; an antelope that runs, a leopard in the grass,
a rhino he learns to dart from behind a hide; a crate on the truck; the ranger station three zones
out; the zoo with his name on the first zebra's plaque. Nothing dies.

### D4: parties of 2-4, the relay, share links (v4)

Build: the Cloudflare Worker + Durable Object relay (party codes, per-seat authentication at join,
permit brokering with `cfg.seats`, 3-frame input delay, `IDLE` substitution recorded, the signed
ordered stream), share links on both doors, the party box camera, downed/revive with owner-only
packs, instanced loot, NEUTRAL scaling, the multi-seat verification path and the function timeout for
it; the standalone engine `package.json` after this stage (as hoops, 9.4 of `BASKETBALL.md`).

What Scott sees: a link he texts to Cam; two players on one screen in the Stacks; "needs coffee
badly" in the Department's words; a revive; both packs filed.

---

## 7. What carries beyond the two entrances

Everything under `engine/`: the run and floor machines, path-first accretion, the archetypes and
brains, combat and capture, items and loot bands, themes as data, seats and the record, the bot and
the dial -> hook discipline. The relay is a product on its own (every future lockstep game in HVI, and
Iridescent's standalone games, can join a party by link). What does not carry: `Crawl.jsx`,
`calls.js` (the Overlord), `replay.js` (HVI's frozen versions), the salvage catalog, the zoo.

---

## 8. Consortium

Architect: Fable (this document). Challenger: a fresh Opus subagent briefed with the worktree and
the first draft, told to verify every file:line claim before objecting (Codex is out of usage until
2026-11-04); it read every cited file, ran four probes (an engine-cost skeleton, a tree-height
simulation of random accretion, a JSON round-trip of typed arrays and `-0`, one Perplexity check) and
returned 28 rows in 7 minutes. QC: Perplexity (the reasoning call timed out twice; two grounded passes
on 22 claims, then the pages it could not reach fetched directly; the record is in
`DUNGEON-research.md`, "QC record").

### 8.1 Challenger objections and resolutions

| # | Sev | Objection (verified) | Resolution |
|---|---|---|---|
| 1 | BLOCKING | Waiting out the shift beat death: SHIFT_OVER kept the pack, the Auditor was slow, wall-bound and non-lethal, and 3.4 adds loops on purpose, so circling a loop for seventeen minutes banked a pack safely; Spelunky's ghost works because it passes through walls and kills | Adopted: a shift ending is a loss like hearts 0 (the cleaners take what you carried); the Auditor passes through walls and doors and accelerates to 1.4 x walk; a check makes a circling bot file nothing (3.3, 3.5, 5) |
| 2 | BLOCKING | The seed in the client's hands plus holdings visible on GET let a player generate every floor offline and shop permits for vault-only salvage; abandoning a permit cost nothing (ski keeps 20) | Adopted: crate contents from `HMAC(serverSecret, runId, crateId)` resolved in the ledger function; one open permit per case (a new start closes the old one as a loss); a check that contents cannot be computed from client data (3.8, 3.11) |
| 3 | BLOCKING | The 24-bit word could not select an item (LB/RB and keys 1-9 had no bits); MENU had no place in a sim log; TOOL-MODE bound nowhere | Adopted: a 4-bit slot field, USE as the button, MENU out of the word, TOOL-MODE dropped (the tool subdues a subduable target by context) (3.9, 3.7) |
| 4 | BLOCKING | The record did not hold everything the sim reads: the daily mood, the entry floor, the frontier count, the seats' cases; old tapes would change meaning | Adopted: `cfg` is the server-signed permit `{theme, level, entry, day, cleared, seats, seed, at, v}`; the engine reads only `cfg` and `logs` (3.11) |
| 5 | MATERIAL | `econ_award` hard-codes kind `furn`, never checks `MAX_FURN_EACH`, and a second garment raises on the unique index; two filings in flight could over-grant | Adopted: a new `econ_salvage` that locks the case, resolves under the caps, grants the right kind, falls through; memory twin; a race test (3.11, 5) |
| 6 | MATERIAL | Kind `bounty` fails the SQL kind check; a claims-style day key allows one transaction a day, not a running total | Adopted: a migration adds the kind; `econ_bounty` with a per-case per-day counter row locked FOR UPDATE (3.11) |
| 7 | MATERIAL | Copying ski's "filed before side effects, 409 on retry" loses salvage and bounty for good on a ledger outage | Adopted: per-step reward states on the run record with 30-day retries, the trophies' pattern (3.11) |
| 8 | MATERIAL | The two engine budgets contradicted each other (1.5 ms a frame vs 400 ms a run) and a probe of a skeleton already cost 7.7 µs a frame; Netlify's default 10 s timeout | Adopted: one budget (20 µs a frame one seat, 50 µs four seats, a four-seat replay <= 4 s) and the function timeout set (3.10, 5) |
| 9 | MATERIAL | "The farthest room becomes the descent" fails the planned route length on 69 % of 8-room trees (100k-sample probe), and loops shortcut the tagged path | Adopted: the critical path is accreted first as a chain of N rooms, side rooms after, the route re-measured after loops with a check on its range (3.4, 5) |
| 10 | MATERIAL | Flow fields rebuilt every 10 frames are hidden state; typed arrays and `-0` do not survive JSON (probe), so the snapshot promise would fail | Adopted: plain-array grids, flow fields in the state, the snapshot check at a frame that is not a multiple of 10 (3.4, 3.5, 5) |
| 11 | MATERIAL | Hit-stop only in the render freezes the picture while the sim advances, so inputs act on unseen frames | Adopted: hit-stop is sim state (3 frames, in the fixtures); shake stays in the render (3.1, 4) |
| 12 | MATERIAL | The copier was a farm: endless spawns, each a 15 % hatch roll and bounty | Adopted: generator spawns pay nothing and roll nothing and do not count toward clearing; breaking the generator does (3.5) |
| 13 | MATERIAL | The bot was circular (it followed the flow field to a descent it should not know, its cone was the assist dial) and INTERN's 65-75 % band sat under the house floor of 70 %; visibility was undefined | Adopted: visibility defined (a 24 x 14 window, rooms revealed on entry); a first-timer bot that explores the frontier with its own fixed cone; INTERN 70-80 % (3.10) |
| 14 | MATERIAL | Rewards did not depend on level, so every rational filer picks INTERN; the level was a client field | Adopted in part: the permit stamps the level; a bounty factor by level (x0.6 / 1.0 / 1.3 / 1.6) with salvage tables the same at every level, put to Scott as 9.4 |
| 15 | MATERIAL | "STICKS SWAPPED" cannot be played: a right thumb on the stick cannot press the face buttons | Adopted: a left-handed pad preset keeps the left stick and moves the actions to bumpers and triggers; a full remap from D2 (3.9) |
| 16 | MATERIAL | No speeds for run and sprint; keys had no run; RT as ITEM broke the house convention that RT runs | Adopted: walk 4.5 / run 6.5 tiles/s; keys and touch run by default; RT runs; USE moves to LB (3.9) |
| 17 | MATERIAL | Picking up a teammate's pack is a transfer between players, which section 11 forbids and alts would exploit | Adopted: a dropped pack is owner-only; a revive returns it; a recall destroys it (3.8, 3.12) |
| 18 | MATERIAL | The relay's stream was trusted with nothing proving its origin; one client could upload a forged four-seat stream; the relay cannot hold four sessions | Adopted: every seat authenticates at join; the party permit names every case; the DO signs the stream; each case files its own seat (3.12) |
| 19 | MATERIAL | A 20-tile leash from the centroid lets two players stand 40 tiles apart and the camera frame the whole floor | Adopted: a party box of 20 x 12 tiles (3.12) |
| 20 | MATERIAL | Purge was not mentioned; the crawl store and zoo plaques hold case data | Adopted: `deleteCrawl` and a plaque scrub in `purge.js`, with a check (3.2, 3.11, 5) |
| 21 | MATERIAL | The HQ entrance needed files the draft did not name: the building view renders the Pen and City3D gives a CLASSIFIED building no floor | Adopted: the door is drawn in `Pen.jsx`'s B3 strip plus a line in `BuildingView.jsx`; City3D untouched (1.1, 4) |
| 22 | MINOR | Bounty skipped the anti-alt rules: UBI vests from day 3 and needs a wallet; a day-0 alt could mint | Adopted: `econ_bounty` refuses an unenrolled or unvested file; the step waits (3.11) |
| 23 | MINOR | Two softlocks: infested floors undefined for capture (an antelope flees forever); a keycard needing a slot with a full pack | Adopted: safari infested zones clear by capture; keycards are slotless; the locked store is never on the route (3.4, 3.6, 3.8) |
| 24 | MINOR | D1 was bigger than smallest and inconsistent (two vs four machines; "ROOKIE-easy") | Adopted in part: D1 keeps the locked store and the copier; the training strip and notice boards move to D2 while memos stay in the lift car; no mouse or right-stick aim in D1; the wording fixed (4, 6) |
| 25 | MINOR | `fnv` takes one string; three line citations were off; the ski grep scans one file and bans neither `new Date` nor `Intl` nor comparator ties | Adopted: `fnv(`${seed}|${f}`)`; citations corrected; the crawl grep widened (1.2, 3.4, 5) |
| 26 | MINOR | Research: Stardew's ladder odds rise as rocks run out (a flat 2-4 % drops the pull); the chest list missed 40 and 80; the ghost passes through terrain | Adopted: the hatch chance rises as a floor's containers shrink; A.5 corrected (QC had too); the ghost's wall-passing recorded in C.16 and used in row 1 |
| 27 | MINOR | A 300-a-day cap per game stacks across games (+43 % to daily savings each) | Adopted: one `BOUNTY_CAP` shared across every game that mints from play; 9.1 rewritten |
| 28 | MINOR | Log sizes fine but unstated (145,200 numbers worst case a seat; a 4-seat body ~3.2 MB); `readPad` reads the first pad only, so couch co-op is impossible as is | Adopted: `MAX_LOG_PER_SEAT` 150,000 and a 4 MB body; heading hysteresis; `readPads()` noted as outside D4 (3.9, 3.11) |

Nothing was rejected; two rows were adopted in part (14, where the level question goes to Scott,
and 24, where the memos stay as the lift's NOTICE). The challenger's verdict: the architecture is
sound (the run as the unit, a pure engine with seats from the first commit, themes as data, the server
replaying before any reward, the version and fixture discipline); what had to change before D1 was
the shift and Auditor rule, server-secret crate contents with one open permit, the input word, the
full `cfg` in the record, snapshot-safe state, hit-stop in the sim, path-first generation and a bot
that explores, because all of them freeze into the v1 fixtures. All eight are in this revision.

### 8.2 QC findings

Recorded in `DUNGEON-research.md`, "QC record": the Stardew bands and chest floors were corrected
(a ten-floor cadence inside the bands; chests on 40 and 80 too); Skull Cavern's shaft rule, Brogue's
algorithm, Spelunky's grid and path-first order, Gauntlet's generators and drain, Vlambeer's talk,
Bettner's authorship and GGPO's rollback were confirmed by direct reads; the Spelunky ghost's timing,
Daily Luck's effect on infested floors and the Hades and Gungeon specifics remain UNCONFIRMED and
nothing in the design hangs on them.

---

## 9. Open questions for Scott (4)

1. **CYCLES from verified play: one shared daily cap, and the "no prizes" line.** Section 11 of
   `ECONOMY_PROPERTY.md` says CYCLES carry "no prizes" and the tournaments read that as "no CYCLES
   purse", while your 2026-10-06 decision names verified CYCLES with a daily cap (and the fish-to-
   restaurants design already does the same). A cap per game would stack. Options: one `BOUNTY_CAP`
   of 300 a day shared by every game that mints from play (30 % of UBI, a morning's wage) and amend
   section 11 to "no real-world prizes; play rewards only from server-verified play, under one daily
   cap" / 100 a day shared (symbolic) / no CYCLES from play at all, salvage and records only.
   **Recommend: 300 a day, shared, with the amendment.** It keeps the sink-and-allowance economy
   intact, makes the first run of the day matter, and leaves depth paying in things.
2. **Does a lift reached stay unlocked when you then lose the run?** Options: yes, the lift is a
   fact on the record the moment the server replays the run (Stardew's elevator) / no, only a run that
   ends by lift keeps its lifts. **Recommend: yes.** The loss stays legible (the pack) and the
   checkpoint is the promise players plan their day around. (The shift clock is now a loss like any
   other: the only way to keep a pack is a lift, as the only way to keep a Stardew day is bed.)
3. **Facing melee with an aimed tool, or twin-stick?** Options: facing melee + assisted tool, right
   stick optional (Diablo III console) / twin-stick as the default (Gungeon), with a one-stick mode for
   touch. **Recommend: facing melee + assisted tool.** One scheme serves pad, keys and touch, the
   left-handed preset is a button swap, and the aim-assist dial is one more measured hook.
4. **Should rewards depend on the level?** Without it every rational filer plays INTERN. Options:
   a bounty factor by level (x0.6 INTERN, x1.0 CLERK, x1.3 OFFICER, x1.6 DIRECTOR) with the same salvage
   tables at every level / the same rewards everywhere / vault-only salvage from CLERK up as well.
   **Recommend: the bounty factor only.** The easy default stays fully rewarding in things, which is
   what the casual-beatable rule is for, and the harder levels pay more of a capped currency, which
   costs the economy nothing.

Decided here, from the research and the rules, and not put to Scott: co-op loot is instanced and a
dropped pack is owner-only (the no-transfer rule leaves no other reading); a shift that runs out is a
loss.

## 10. Build log

(Empty until D1 ships.)
