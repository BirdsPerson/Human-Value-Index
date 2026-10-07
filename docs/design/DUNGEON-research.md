# THE DUNGEON: research notes

**Status:** research for `DUNGEON.md`, 2026-10-07. Gathered with Perplexity (`perplexity_ask`,
`perplexity_search`; the deep `perplexity_research` call timed out twice and was replaced by
shorter grounded passes) plus direct reads of the cited pages where a claim mattered. Every claim
the design leans on carries a source number; a claim QC could not re-confirm is marked **UNCONFIRMED**
and the design treats it as a hypothesis to measure, not a fact to copy.

The method is the house one: find what the best do, cite it, adapt it. The games studied are the
ones Scott named (Stardew Valley's mines for depth and rhythm; Gauntlet Legends, Diablo and
Neverwinter for combat feel) plus the roguelites whose generation, death rules and co-op are the
best documented (Brogue, Spelunky, Hades, Enter the Gungeon, Dead Cells, Risk of Rain).

---

## A. Stardew Valley: the mines, Skull Cavern, the daily loop

What the design takes: elevator checkpoints at a fixed cadence; the way down appears by chance from
the things you break and kill, with a guarantee on cleared infested floors; monster and loot bands by
depth; a daily mood that moves the odds; a death that costs the run's carry and never the home.

1. **Structure.** The Mines are 120 floors. The elevator saves every fifth floor reached; floor
   120 holds the Skull Key that opens Skull Cavern. [1]
2. **Ladders.** Breaking a rock can reveal a ladder by chance, **and the chance rises as the rocks
   on the floor run out** (so the last rocks are the likeliest; the challenger confirmed this against
   the wiki); killing a monster can reveal one too (and costs no stamina). On infested ("overrun")
   floors every monster must be defeated before the ladder appears. [1] A shaft in Skull Cavern replaces a ladder 20 % of the time and drops the
   player 3-9, 11, 13 or 15 floors for 3 health per floor skipped, never below 1 health. [3]
3. **Monster bands.** The wiki's three bands (1-39 green slimes, cave flies, bugs, duggies, grubs,
   rock crabs; 40-79 bats, stone golems, dust sprites, frost bats, blue slimes, ghosts, skeletons;
   80-119 lava bats and crabs, metal heads, red slimes, shadow brutes and shamans, squid kids) hide a
   finer cadence, which QC corrected: bats and stone golems arrive from 31, frost creatures and dust
   sprites from 41, ghosts from 51, skeletons from 71, the volcanic roster from 81, squid kids from 91.
   **A new monster roughly every ten floors inside a band** is the pattern the design copies (3.6).
   [1][5][39]
4. **Ore bands.** Copper from floor 2; iron from 41 (concentrated 40-79); gold from 81. [2][6][39]
5. **Special floors.** Infested floors (clear to proceed), mushroom floors (the layout replaced by a
   mushroom room), and every tenth floor a quiet reward floor; the chests with items sit on 10, 20,
   40, 50, 60, 70, 80, 90, 100, 110 and 120 (30 has none), each a fixed reward (boots, a sword, the
   slingshots, a Stardrop at 100, the Skull Key at 120). QC corrected the first pass, which had missed
   40 and 80. [1][39]
6. **Daily Luck** changes the chance of finding a ladder from a broken rock and the geode and coal
   drop chances (the Luck page, read directly) and "high luck increases the frequency of
   ladders/shafts" (Skull Cavern page, read directly). The first pass also credited it with infested
   and mushroom floor odds; that part is **UNCONFIRMED** and the design does not depend on it. [1][3][40]
7. **The day.** Energy caps the work; the day ends at 2:00 a.m. Passing out costs 10 % of money up
   to 1,000g and no items. Being knocked out in combat costs money and randomly removes items; the
   Adventurer's Guild recovers one lost item. [1] Players describe the difference sharply: a combat
   death "can cost 15,000g", passing out "at most 1,000g". [7-R]
8. **Skull Cavern.** No elevator, so every visit starts at floor 1; shafts; staircases crafted from
   stone are the "staircase meta" (99 stone each) that players use to skip infested, prehistoric and
   spiral floors; iridium rises with depth; Qi's first challenge is floor 25, later ones floor 100.
   [3][7] The "Dangerous Mines" (Shrine of Challenge, after "Danger in the Deep") toughen monsters
   and add radioactive ore. [1][6]
9. **What players say.** The five-floor elevator is treated as the natural stopping point for a day
   ("a good goal for your mining day is to complete five floors") [5-R]; staircases are saved for
   "infested, prehistoric and spiral levels" [4-R][6-R]; Skull Cavern resetting on exit is the
   sharpest complaint, together with dying near floor 100 [9-R][7-R]; the ritual before a deep run is
   checking the fortune teller for a very lucky day, stacking food buffs and a desert warp totem
   [7-R]; the standard advice after a costly death is to restart the day [4-R].

## B. Brogue: how the best-regarded dungeon generator works

What the design takes: room accretion (connectivity by construction, no pruning), loops added
afterwards, lakes placed only where the rest stays connected, and "machines" as data-driven set
pieces. This is the generator the engine's `gen/` is modelled on, with Spelunky's critical path on
top.

10. **Accretion.** Start with one room placed at random; draw the next room on a separate grid and
    slide it "like a piece of cellophane" until it fits snugly against the structure without
    overlapping, then punch a door. Repeat until nothing fits. The result is a tree, inherently
    traversable, so nothing has to be pruned or re-connected. [10][11]
11. **Room shapes** are chosen at random from a few templates: overlapping rectangles, a cellular
    automata blob (5 generations; the largest flood-filled blob is kept so a room is never
    disconnected), a circle, several small circles, sometimes with a hallway whose end must be the
    connection. The first room can be a cavern: 55 % floor / 45 % wall noise smoothed five rounds
    (a floor cell with < 4 floor neighbours becomes wall; a wall cell with >= 6 floor neighbours
    becomes floor), largest connected blob kept. [10][11]
12. **Loops** are added after accretion so the map is not a pure tree; **lakes** (water, lava, chasm,
    brimstone) are drawn by cellular automata and slid around until every passable part not under the
    lake is still fully connected, so the player is never forced across. [11]
13. **Machines.** A hand-designed table (71 at the interview) of clustered terrain features with
    cause and effect at a distance (lift the key off the altar, the torch lights the grass). Three
    kinds: room machines behind one chokepoint, door machines that guard it, area machines that
    spread to size. Some bulldoze a region and re-run generation with other parameters (goblin
    warrens, sentinel temples). Stairs are placed after the machines; items after that. [11]
14. Walker's goal: a dungeon that is "a living and atmospheric place to explore, filled with useful
    information and tactical significance", not "a flat substrate for monsters and items". [11]

## C. Spelunky: critical path first

15. A level is a 4 x 4 grid of 16 rooms, each 10 x 8 tiles. The generator traces a solution path
    through the grid first, assigning room types whose exits fit the path, then fills the off-path
    cells with side-room templates. The critical route is therefore guaranteed by construction. [12][13]
16. The ghost: an invulnerable pursuer that arrives after about two and a half minutes on a level
    (three in Spelunky 2), **passes through terrain** and kills on touch, so it cannot be waited out
    by circling; it turns "search for more" into "leave now". **UNCONFIRMED** on the exact timings in
    QC's search; the mechanic and its wall-passing are widely documented and the design's Auditor
    copies the wall-passing (DUNGEON.md 8.1 row 1). [14]

## D. Other generators, briefly

17. **Rooms and corridors / BSP**: split the map recursively, a room per leaf, connect siblings up the
    tree; readable, controllable, but regular-looking, and connectivity depends on the connection pass
    working. [15]
18. **Cellular automata alone** produces organic caves but no connectivity guarantee: keep the
    largest region, tunnel between regions, or reject and regenerate. [16]
19. **Room graphs with hand-made rooms** (The Binding of Isaac, Enter the Gungeon): a progression
    graph with start and boss nodes populated from an authored pool; secret rooms are optional links.
    Pacing is easy to control; a small pool repeats. Exact per-game rules **UNCONFIRMED**. [17]
20. **Wave Function Collapse** enforces local tile adjacency and nothing global: no connectivity, no
    route, contradictions possible; needs a plan above it or a validate-and-retry loop. Its use in
    Caves of Qud is reported by developers on r/roguelikedev [18]; details **UNCONFIRMED**.
21. **Hades**: an authored room pool with weighted selection and a door that shows the reward behind
    it before you choose. [19] **Dead Cells**: a biome graph decides where a run may go, not the rooms'
    insides. [17]
22. **Determinism for replay**: a specified integer PRNG, a stable draw order, no platform-dependent
    math in generation decisions, and a versioned generator so old replays do not change meaning. [17]
    (This is already the repository's rule: `fish/data.js` `rngStep` is mulberry32 as a pure step;
    `check-ski.mjs` fails on `Math.random`, `Date.now`, trig, `hypot`, `pow`, `exp`, `log` and `**`.)

## E. Combat feel on a controller

What the design takes: one stick moves, attacks follow facing with a soft aim assist (Diablo III on
consoles), a dodge with invulnerability frames (Hades, Gungeon), hit-stop and shake as presentation
only (Vlambeer), a short verb set (Hades), generators and food pressure (Gauntlet).

23. **Gauntlet (1985) / Legends / Dark Legacy.** Hordes from monster generators that keep spawning
    until destroyed; health drains over time and food restores it ("Elf needs food badly"; "Red
    Warrior needs food badly" in the Legends era); keys open doors; potions clear the screen; four
    players at once compete for food and treasure while surviving together. [20][21][22] Players
    remember the shared chaos and the secret characters fondly, and the constant drain less so; a
    Dreamcast guide notes mashing fire out-paces holding it, evidence of players optimising around a
    repetitive attack. [23][20]
24. **Diablo III on consoles.** Click-to-move became direct left-stick movement, skills on face
    buttons, a dodge roll on the right stick, and auto-targeting that picks nearby targets with some
    directional influence. Reviews called it natural and in places better than mouse and keyboard
    because analog movement and the roll made positioning active, at the price of less exact target
    priority. [24][25][26]
25. **Hades.** Five verbs: Attack, Special, Cast, Dash, Call. The dash's invulnerability frames are
    the rhythm, not a speed boost. Hit-stop and screen shake make a hit register. Door rewards are
    shown before the choice. Enemies come in lesser and greater kinds, armoured enemies need the armour
    broken first, elites add affixes to known enemies. [27][28] Exact Supergiant talk citation
    **UNCONFIRMED** in QC's search; the mechanics are the game's own.
26. **Enter the Gungeon.** Twin-stick aim, dodge roll with i-frames, blanks that clear every bullet
    on screen as a limited escape. [29][30]
27. **Facing melee vs twin-stick.** Zelda-style attacks follow a 4- or 8-way facing, binding turn,
    spacing and attack intent together; twin-stick separates aim from movement and lets the player
    retreat while firing, at the cost of a second stick (none on touch) and more on-screen reading. [27]
28. **Vlambeer, "The Art of Screenshake"** (Jan Willem Nijman): a live-iterated list of feel devices:
    screen shake, hit-stop (sleep), knockback, muzzle flash, permanence, camera lerp, bigger bullets,
    sound. The lesson is proportion: enough to communicate impact, never so much that hazards are
    obscured. [31]
29. **Enemy archetypes** (a working taxonomy, not a standard; QC found no single canonical source):
    chaser/grunt, ranged/turret, swarm, tank/brute, exploder, support/summoner, elite/affix. The
    useful question is which decision each imposes: move, aim, prioritise, interrupt, evade. [27]

## F. Death penalties and risk/reward

What the design takes: a short run, a legible loss (the run's carry only), a home that persists
(apartment, wardrobe, wallet, zoo never touched), a durable gain even from a failed run (knowledge,
the lift unlocked, the record), and pacing devices that expose the trade before you commit.

30. **Hades**: run powers vanish, permanent resources, knowledge and story remain. Greg Kasavin's
    stated goal: death part of the story; no run should feel wasted. [32][33][34]
31. **Rogue Legacy** (legacy spending), **Dead Cells** (unbanked cells lost, unlocks kept),
    **Spelunky** (no power progression; knowledge is the progression), **Stardew** (carry lost, home
    kept), **Minecraft** (drop everything; the `keepInventory` debate), **Dark Souls** (corpse run; a
    second death loses the souls), **Diablo II** (hardcore as an opt-in contract), **Terraria**
    (mediumcore drops carried items), **Darkest Dungeon** (permanent hero loss, tolerable when the odds
    are legible). The pattern: loss is accepted when it is caused by a risk the player chose,
    proportionate to the time invested, and paired with something durable. [32][34]
32. **Pacing devices**: previewed rewards (Hades doors); a timed threat (Spelunky's ghost); variable
    daily conditions you can prepare for (Daily Luck); a resource-for-speed trade (staircases); an
    escalating difficulty clock (Risk of Rain); a visible route map (Slay the Spire). They work because
    the trade is visible before the commitment. [32][7][8]

## G. Co-op and netcode

33. **Gauntlet Legends**: four on one screen, shared space and shared resources (memorable and a
    source of friction). **Spelunky 2**: online co-op keeps the systemic chaos and adds rescues and
    more ways to trigger hazards. **Enter the Gungeon**: two players in one run. **Risk of Rain 2**:
    the balancing question is enemy and reward scaling per player. **The Binding of Isaac**: an
    asymmetric "baby" for the second player. [32]
34. **Shared vs instanced loot**: shared makes generosity meaningful and disputes possible; instanced
    removes the dispute and some of the feeling of a common haul. **Revives**: a rescue objective for
    the living; too cheap and death has no weight, too hard and the downed player waits. [32]
35. **Deterministic lockstep** exchanges inputs, not state; it needs a deterministic sim and a fixed
    start, and a late input stalls everyone (the "1500 archers" model). **Input-delay lockstep**
    buffers a few frames; the right count is a per-game, per-network measurement, not a constant.
    **Rollback** (GGPO) predicts the remote input, shows the local action at once and re-simulates on
    correction; it needs save/restore and tolerates late inputs without removing latency. A **relay**
    simplifies connectivity and hides addresses; it does not make anything deterministic. [35][36][37]

## H. What players say, in their words

- Stardew mines: "a good goal for your mining day is to complete five floors" [5-R]; save stairs
  for "infested, prehistoric, and spiral levels" [4-R][6-R]; a death "can cost 15,000g" against a
  pass-out's 1,000g cap [7-R]; Skull Cavern restarting from the top each visit is the complaint, and
  the pre-run ritual (fortune teller, food buffs, warp totem) is the response [7-R][9-R].
- Gauntlet: the four-player chaos and "needs food badly" are what is remembered; the health drain is
  what is forgiven rather than loved [20][22][23].
- Diablo on a pad: "what couches were made for"; the roll and direct movement praised; auto-aim's
  target priority the recurring gripe [24][25].
- Hades: death that advances the story, and God Mode's gradual resistance, are why a failed run does
  not feel bad [32][33][34].
- Gungeon's run length and item-pool-only meta-progression, and co-op pains (desync, one player
  rushing ahead, a camera that must hold everyone, loot taken) are widely repeated but QC found no
  single thread to quote: **UNCONFIRMED** as sourced consensus, kept as risks to design against. [38]

---

## QC record (2026-10-07)

Perplexity's reasoning pass timed out twice; two shorter grounded passes checked 22 claims, then the
pages QC could not reach were fetched directly (`curl`, text-stripped, grepped). Outcome:

| Claim | QC | Settled by |
|---|---|---|
| Mines 120 floors, elevator every 5, Skull Key at 120 (A.1) | TRUE | wiki |
| Ladders from rocks and kills; infested floors must be cleared (A.2) | TRUE | wiki |
| Monster bands (A.3) | FALSE as first written: the bands hide a ten-floor cadence (bats and golems 31, frost 41, ghosts 51, skeletons 71, volcanic 81, squid kids 91) | corrected above [39] |
| Ore bands (A.4) | TRUE with the precise starts 2 / 41 / 81 | corrected above |
| Treasure floors (A.5) | FALSE as first written: 40 and 80 were missing | corrected above |
| Pass-out vs knock-out costs; the Guild recovers one item (A.7) | TRUE (QC's "FALSE" restated the same one-item rule) | wiki |
| Skull Cavern: no elevator, shaft 20 %, 3-9 / 11 / 13 / 15 floors, 3 health a floor never below 1, staircases 99 stone (A.8) | UNCERTAIN to QC | **confirmed by direct read** of the Skull Cavern page |
| Daily Luck's effects (A.6) | UNCERTAIN | ladders-from-rocks and drops confirmed by direct read of the Luck page; infested/mushroom odds left UNCONFIRMED |
| Brogue accretion, loops, lakes, 71 machines in three kinds, stairs then items, the 55/45 cavern rule (B.10-B.13) | UNCERTAIN to QC | **the Rock Paper Shotgun interview text was read directly** via the search tool's excerpt; the JavaScript re-implementation's post likewise [10][11] |
| Spelunky 16 rooms in a 4 x 4 grid, solution path first (C.15) | UNCERTAIN to QC | **confirmed by direct read** of Kazemi's generator page ("The level is made of 16 rooms in a 4x4 grid … generating the level's solution path, before the spikes, arrow traps, enemies, and treasures") [13]; the 10 x 8 room size rests on [12] |
| Spelunky ghost at 2:30 / 3:00 (C.16) | UNCERTAIN | the fandom page could not be fetched (script shell); **UNCONFIRMED**, the design uses "a timed invulnerable pursuer", not the number |
| Diablo III console controls (E.24) | TRUE | reviews [24][25] |
| Hades verbs, dash i-frames, door previews, armour, elites (E.25) | UNCERTAIN | fandom pages could not be fetched; the verbs and door previews are the shipped game's own UI; **kept as the game's own, not independently sourced** |
| Gungeon twin-stick, roll i-frames, blanks (E.26) | UNCERTAIN | reviews [29][30] describe all three; fandom pages could not be fetched |
| Gauntlet generators, health drain as a time limit, food, keys, potions that destroy every enemy on screen, four players (E.23) | UNCERTAIN to QC | **confirmed by direct read** of Wikipedia's Gauntlet (1985) page [41]; "Elf needs food badly" is the series' line [20] |
| Vlambeer, "The Art of Screenshake", INDIGO Classes 2013 (E.28) | UNCERTAIN to QC | **confirmed by direct read** of the YouTube title [31]; the device list is from the talk itself, as summarised in [27] |
| "1500 Archers on a 28.8", Paul Bettner (G.35) | UNCERTAIN to QC | **author confirmed by direct read** of the Game Developer page's metadata [35] |
| GGPO is rollback for peer-to-peer games, 2009 (G.35) | UNCERTAIN to QC | **confirmed by direct read** of ggpo.net [36] |
| Kasavin on death as story; God Mode (F.30) | UNCERTAIN to QC | the interviews [33][34] say it; kept |
| Minecraft drop-on-death and `keepInventory` (F.31) | TRUE | [32] |

Nothing in the design hangs on an UNCONFIRMED number. Where a number was corrected (A.3-A.5) the
design's reading improved: a new monster every ten floors inside a band, and a vault every ten.

---

## Sources

Game pages and wikis
1. Stardew Valley Wiki, The Mines: https://stardewvalleywiki.com/The_Mines
2. Stardew Valley Wiki, Mining: https://stardewvalleywiki.com/Mining
3. Stardew Valley Wiki, Skull Cavern: https://stardewvalleywiki.com/Skull_Cavern
4. Stardew Valley Wiki, Minerals: https://www.stardewvalleywiki.com/Minerals
5. Stardew Valley Wiki, Monsters: https://www.stardewvalleywiki.com/Monsters
6. Stardew Valley Wiki, Ore distribution: https://stardewvalleywiki.com/The_Mines/Ore_Distribution
7. Stardew Valley Wiki, Quests: https://stardewvalleywiki.com/Quests
8. Skull Cavern guide (community): https://www.switchbladegaming.com/stardew-valley/skull-cavern-guide/
9. Stardew Valley Wiki, The Desert: https://stardewvalleywiki.com/The_Desert

Brogue
10. "Broguelike Dungeon Creation, Part 1" (a JavaScript re-implementation from Walker's Roguelike Celebration talk and the source): http://anderoonies.github.io/2020/03/17/brogue-generation.html
11. Graham Smith, "How do roguelikes generate levels?", Rock Paper Shotgun, interview with Brian Walker: https://www.rockpapershotgun.com/how-do-roguelikes-generate-levels
11b. Brian Walker, "Procedural level design in Brogue and beyond" (Roguelike Celebration talk): https://www.youtube.com/watch?v=Uo9-IcHhq_w

Spelunky and generators
12. Darius Kazemi, "Spelunky's Procedural Space": http://tinysubversions.com/2009/09/spelunkys-procedural-space/index.html
13. Darius Kazemi, "Spelunky Generator Lessons": https://tinysubversions.com/spelunkyGen/
14. Spelunky Wiki, Ghost: https://spelunky.fandom.com/wiki/Ghost
15. RogueBasin, "Basic BSP Dungeon generation": https://www.roguebasin.com/index.php/Basic_BSP_Dungeon_generation
16. RogueBasin, "Cellular Automata Method for Generating Random Cave-Like Levels": https://www.roguebasin.com/index.php/Cellular_Automata_Method_for_Generating_Random_Cave-Like_Levels
17. Perplexity grounded pass on generators (BSP, CA, Spelunky, room graphs, WFC, Hades, Dead Cells, determinism), 2026-10-07; the paper it surfaced: "Combining Constructive Procedural Dungeon Generation…", SBGames 2020: https://www.sbgames.org/proceedings2020/ComputacaoShort/207911.pdf
18. r/roguelikedev, "Level Design in RogueLikes" (Brogue talk, Unexplored's cyclic generation, Caves of Qud's WFC): https://www.reddit.com/r/roguelikedev/comments/waf2ht/level_design_in_roguelikes/
19. Hades Wiki, Chambers: https://hades.fandom.com/wiki/Chambers

Combat feel
20. TV Tropes, Gauntlet (series): https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Gauntlet
21. Wikipedia, Gauntlet Dark Legacy: https://en.wikipedia.org/wiki/Gauntlet_Dark_Legacy
22. StrategyWiki, Gauntlet Dark Legacy, Gameplay: https://strategywiki.org/wiki/Gauntlet_Dark_Legacy/Gameplay
23. GameFAQs, Gauntlet Legends (Dreamcast) FAQ: https://gamefaqs.gamespot.com/dreamcast/197430-gauntlet-legends/faqs/7906
24. GeekTyrant, "Diablo III console version: what couches were made for": https://geektyrant.com/news/2013/9/4/review-diablo-iii-console-version-what-couches-were-made-for
25. EGM, Diablo III console review: https://egmnow.com/egm-review-diablo-iii-console-version/
26. NG+ blog, hands-on with Diablo III console: https://ngplusblog.wordpress.com/2013/06/14/hands-on-with-diablo-iii-console-version/
27. Perplexity grounded pass on combat feel (Gauntlet, Diablo III console, Hades, Gungeon, facing vs twin-stick, archetypes), 2026-10-07
28. Hades Wiki, Enemies: https://hades.fandom.com/wiki/Enemies
29. Eurogamer, Enter the Gungeon review: https://www.eurogamer.net/enter-the-gungeon-review
30. Use a Potion, Enter the Gungeon review: https://www.useapotion.com/2016/04/review-enter-the-gungeon/
31. Jan Willem Nijman (Vlambeer), "The Art of Screenshake", INDIGO Classes 2013: https://www.youtube.com/watch?v=AJdEqssNZ-U (discussed: https://www.idlethumbs.net/forums/topic/9192-game-dev-talkslectures/)

Death, pacing, co-op
32. Perplexity grounded pass on death penalties, pacing devices, co-op and netcode, 2026-10-07
33. Vice, "How Hades made a genre known for being impossibly hard accessible": https://www.vice.com/en/article/how-hades-made-a-genre-known-for-being-impossibly-hard-accessible/
34. Game Developer, "How Supergiant weaves narrative rewards into Hades' cycle of perpetual death": https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death
35. Paul Bettner and Mark Terrano, "1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond", GDC 2001 / Gamasutra: https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
36. Tony Cannon, GGPO: https://www.ggpo.net/
37. Hacker News thread on deterministic lockstep vs rollback (secondary discussion): https://news.ycombinator.com/item?id=31512257
38. Choost Games, "Best roguelites for power fantasy" (Gungeon's item-pool meta-progression; not a player review): https://choostgames.com/blog/best-roguelites-power-fantasy/
39. IGN, Stardew Valley Mines guide (floor-by-floor monster and ore introductions; used by QC to correct A.3-A.5): https://www.ign.com/wikis/stardew-valley/Mines
40. Stardew Valley Wiki, Luck: https://stardewvalleywiki.com/Luck
41. Wikipedia, Gauntlet (1985 video game): https://en.wikipedia.org/wiki/Gauntlet_(1985_video_game)

Reddit (what players say)
- 4-R https://www.reddit.com/r/StardewValley/comments/1lspbnd/i_have_no_words_this_is_the_angriest_ive_ever/
- 5-R https://www.reddit.com/r/StardewValley/comments/1o2r5d5/i_messed_up_in_ways_i_didnt_know_i_could/
- 6-R https://www.reddit.com/r/StardewValley/comments/1ioqzrq/almost_ragequit_stardew_valley_today/
- 7-R https://www.reddit.com/r/StardewValley/comments/1fzgyw9/finally/
- 8-R https://www.reddit.com/r/StardewValley/comments/seox5w/your_updated_guide_to_the_skull_cavern/
- 9-R https://www.reddit.com/r/StardewValley/comments/1wqeu8m/im_never_playing_this_game_again/

In the repository (the conventions the design must fit; read 2026-10-07 on `origin/main` 393d7bf)
- `docs/design/BASKETBALL.md` (the model engine doc), `src/play/hoops/engine/` (the pure split, v4 frozen with fixtures)
- `src/play/ski/sim.js` 56-77 (`VERSION`, `HZ`, `pack`/`unpack`, `rleEncode`/`rleDecode`), `src/play/fish/data.js` 56-62 (`rngStep`, mulberry32 as a pure step), `src/play/fish/replay.js` (the version router)
- `netlify/functions/ski.js` (permit `start` / verified `file`, wall-clock bound, `MAX_LOG`), `netlify/functions/hunt.js` + `netlify/lib/hunt-store.js` 14-24 (server-issued seed in a signed permit), `netlify/functions/aquarium.js` (per-version verification)
- `netlify/lib/economy-db.js` (balanced legs, one case per txn, idempotency keys, claims), `netlify/lib/shops-db.js` (`econ_shop_buy` burns to `dept:burned`), `netlify/lib/tournament-db.js` 9-20 (`econ_award`: an item with no CYCLES moved, trophy SKUs only), `netlify/lib/tournament-awards.js` 1-9 (why no CYCLES purse)
- `src/economy/rules.js` (UBI 1,000 a day, ~300 spent, the legal lines), `src/economy/shops.js` (SKU forms `w:<id>.<way>` and `f:<id>`, `award` items refuse `buy`, `MAX_FURN_EACH` 3, seasonal collections), `src/wear.js` (every garment avatar.js can draw), `src/city/furniture.js` (the catalog every flat can hold)
- `src/building.js` 20-27 and `src/city/sim.js` 337 (HQ's floors end at B3 PROCESSING), `src/city/funnels.js` 52/73/178 and `src/city/FunnelOverlay.jsx` 221-231 (THE OUTFITTER, "SAFARI ZONE: OPENING SOON"), `docs/CITY_SPEC.md` 1255-1259, `docs/design/CITY2.md` 155-160 and 920 (the frontier, the foothills forest belt)
- `scripts/check-hunt.mjs` 154-192 (the casual-human bot: ~250 ms reaction, 4-12 px slop, >= 70 % clears), `scripts/check-ski.mjs` 24-29 (the purity grep), `scripts/check-bundle.mjs` (entry <= 90 KB gzip)
