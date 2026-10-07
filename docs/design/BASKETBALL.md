# BASKETBALL: one engine, two games

**Status:** design, 2026-10-06, revised after the Consortium run (section 8). Research and sources
in `BASKETBALL-research.md`. No gameplay code changes ship with this document.

**What this is.** The definitive design for a reusable basketball engine: one module that powers
THE COURTS (`#hoops`) in Human Value Index now and a standalone basketball game later. Scott's
brief, verbatim where it matters: *"Why don't you have to inbound the ball after a bucket? I keep
walking to the baseline and out of bounds. There needs to be a DEFENSIVE MODE. The passing is
still not good. The basketball IQ of the players is very low — they leave the center alone to
bring the ball up himself. There's a full-court press all the time. When I adjust the camera, the
controls don't adjust with it. Nothing should be rushed; always the best way. Looks don't matter
yet — feel, rules and AI do."*

**How to read it.** Section 1 maps each complaint to its cause in the code. Section 2 is the
research digest. Section 3 is the full gap list with file and line. Sections 4–5 are the design
and the AI quality targets. Section 6 is the staged plan with what Scott sees after each stage.
Section 7 lists what carries into the second game. Section 8 is the Consortium record; section 9
the open questions. A one-page flowchart of sections 4.3 and 4.2 is published alongside.

---

## 1. What Scott felt, and why the code does it

| What Scott said | What the code does | Where |
|---|---|---|
| "Why don't you have to inbound after a bucket?" | After a make the ball is placed **live in a player's hands 3.1 m inside his own baseline**. There is no throw-in, no inbounder behind the line, no 5-second count. The "inbound" is a dead-ball pause followed by a hand-off from nowhere. | `sim.js` 1165 → 280, 1477-1489 |
| "I keep walking to the baseline and out of bounds" | Side-out spots are **0.3 m inside the sideline** (the near one, the bottom of the screen); the OOB throw-in spot from `turnover` is clamped onto the floor too; corner spacing spots are 0.67 m inside; pass landing points are clamped only 0.4 m inside; dribble moves set a court-y velocity and ignore the lines (a crossover from the corner spot goes out 20 of 20 times, measured); the human holder gets **no line awareness** — one stick push over the line is an instant turnover, while a CPU holder is silently clamped inside. | `sim.js` 554, 1143, 266-267, 603, 656, 1446, 1456 |
| "There's a full-court press all the time" | `markSpot` puts every defender **1.0 m goal-side of the ball handler wherever he is on the floor**; `giveBall` sets `close = 40` on **every** catch, the inbound included, so the handler's man sprints at him in the backcourt; `onDefence` goes into intense D inside 1.4 m anywhere; after a make the defence is lined up **at mid-court on the offence's men**. There is no pick-up point and no notion of backcourt. | `sim.js` 747-757, 246-247, 836-839, 844, 290-292 |
| "They leave the center alone to bring the ball up himself" | The inbounder after a make is **roster row 0 = the best-rated player** (the page sorts "best first: the best brings the ball up"); on THE CURATED that is Nikola Jokić. Teammates sprint to their half-court spots the moment the ball is live; nobody offers an outlet. There are no roles. | `sim.js` 178-179, 282, 822-827; `roster.js` 99-100 |
| "The passing is still not good" | The **human's** receiver is chosen by stick direction and distance only — openness and the lane are ignored (the CPU's `carrier` does check `laneClear` and openness, but only after holding the ball 14 frames and only toward a man with a better shot); there is no skip, overhead, give-and-go, lead-to-basket or pass fake; every pass is on target (no bad-pass turnovers); icon letters **re-shuffle every time the ball changes hands**. The flight model (lead passes, arcs, per-frame deflections in the lane) is good and stays. | `sim.js` 562-572, 903-915, 1038-1042; kept: 575-620, 1199-1213 |
| "There needs to be a DEFENSIVE MODE" | On defence the right stick does nothing (gestures are read only while `has` is true), LB and RB do nothing, there is no hands-up or contest, no shade, no double team, no icon switch. LT (intense D) is real and calibrated — it raises the contest, the steal chance and the drive slow-down and cuts ankle-breaks — but it is the only defensive verb beyond steal, block, charge and switch. The HUD says ON DEFENCE and changes nothing else. | `sim.js` 1021, 1044, 1076-1083; LT's effects 345, 410, 628, 668, 1403 |
| "When I adjust the camera, the controls don't adjust" | The stick is read on **court axes** (`UP` = +y, the far sideline) in `input.js` and goes straight into `step()`; touch swipes are measured on screen and encoded as court-axis right-stick bits. The camera lives only in `render.js`, which the sim never sees — correct for determinism, but nothing translates screen directions to court directions. Two different errors result: in the end-on cameras (BASELINE, DRIVE) and the 10°-turned LOW, up-stick is not up on screen at all; in the side-on cameras (2K, BROADCAST, HIGH) the axes agree but **perspective slants the floor's +y by up to ~35° on screen** for a player off-centre (vanishing point y′ ≈ −88 at F = 350), so "straight up" on the stick is a diagonal on the floor. | `input.js` 36-39; `Hoops.jsx` 518-531, 547-553, 629-651; `render.js` 55-83, 100-102 |
| "The basketball IQ is very low" | Spacing is five static spots plus jitter, and the four-out-one-in big's spot is **inside the lane** (42 % of live frames, measured); cuts are random rolls; the pick is called on 5 % of think-ticks; help comes only when the ball is inside 6 m; a screen switch is a coin flip; nobody gets back in transition; the shot clock resets to 24 on every miss and on every inbound. | `sim.js` 266-269, 816-821, 926, 759-776, 731, 1255, 1484 |

The common root: the sim was built outward from the shot (which is good and calibrated) and the
possession was never modelled. There is a `phase` (`tip | live | dead | ft | over`) but no state
for *where the possession is* — throw-in, backcourt, early offence, set, action — so rules, AI
and controls have nothing to hang on. The engine design below starts from the possession.

---

## 2. Research digest

Full notes and 48 numbered sources in `BASKETBALL-research.md`; this is what the design uses.

### 2.1 What makes 2K 2K

1. **Timing is the skill people accept; aiming is the one they reject.** Twenty years of control
   changes rhyme: the Shot Stick (2K8) was praised for feel and attacked for sensitivity; the
   Control/Pro Stick (2K13-14) consolidated one stick as "the body"; 2K21's shot *aiming* was
   removed within a year; 2K26's Green-or-Miss is loved and hated for the same reason.
   Our meter-and-release model is the right centre. Keep it.
2. **The right stick is the body, the left stick is the feet.** Dribble moves, shot, contest,
   hands up, the 2K25 lateral cut-off: all right stick, all phrased relative to the rim or the
   man, not the court.
3. **Defence is a mode with its own grammar.** LT stance, RS hands/contest, X steal, Y block,
   B charge, A/RB switch, LB double team, LT+RT shuffle, and a Defensive Assist slider that
   steers for you (verified against the 2K25 Xbox manual's text, section 8.2). Players hate
   skating and "suction"; they praise body-ups that stop a drive and rotations that arrive.
4. **Passing is a profile, not a button.** The receiver is chosen by weighted Direction /
   Distance / Openness (55/40/5 default; 60/30/10 in a common slider set); there are eight pass
   verbs (tap/hold A, B, double B, Y, double Y, hold Y lead, RB icon, Y+B fake) and openness,
   lane and ratings decide whether it arrives.
5. **The team plays basketball around you.** 2K25's spacing engine gives the AI 20+ spacing
   targets and reworked cut logic so cutters stop clogging lanes; coach settings (pressure,
   PnR coverage, zones, press presets) are data the player can change.
6. **Controls follow the camera.** The stick is read in the active camera's screen directions;
   Auto Flip is a camera option; guides tell defenders to avoid side-on broadcast views because
   the picture hides the rotation.

### 2.2 What makes basketball basketball

- **The ball is put in play by a throw-in**, from behind the end line after a make (the thrower
  may run the line, five seconds), from the designated spot after OOB or a violation.
- **The possession has a shape**: secure → outlet → push or organise → early offence → the set →
  an action → reads → second side → the shot → crash or get back. Eight seconds to cross; no
  going back; 24 to shoot, 14 after an offensive rebound.
- **Roles, not just positions**: the handler brings it up, the big outlets and runs the floor,
  wings fill lanes, the inbounder trails. A big bringing it up is a read (Jokić), not a rule.
- **Defence picks the ball up around the arc.** Full-court pressure is a situational choice:
  after makes, trailing late, to change rhythm. It is never the default.
- **Man defence is positions relative to ball and man**: ball-you-man, deny one pass away, help
  two away, help the helper, closeouts, box out; pick-and-roll is covered by a named scheme
  (drop, hedge, switch, ICE, trap); zones and presses are alignments.
- **Passes fail for reasons**: telegraphed, lazy cross-court through help, into a crowded lane,
  late, a bounce into a tall man's reach, a lob into traffic.
- **Fouls have a ledger**: team penalty from the fifth team foul a quarter (second in the last
  two minutes), six and out, offensive fouls are personal only; seven timeouts, one of which
  advances the ball late.

### 2.3 What passing should be (the synthesis)

A pass is a *decision* (who, which type, when), a *flight* (speed, arc, lane), and a *catch*
(hands, the next action). Today the flight is modelled well: the lead pass, the arcs, and a
per-frame deflection roll for every defender the ball passes within reach of. The decision needs
the profile and a lane read for the human; the catch needs hands and a turnover branch. "Pass to
the right man" is a dial: the openness weight rises on ROOKIE/PRO and falls on HALL OF FAME,
measured against the casual-human bot like every other dial.

---

## 3. Gap analysis (origin/main 8826c41, `src/play/hoops/`)

Severity: **R** rules (the game is not basketball), **F** feel (Scott's hands), **AI**, **E**
engineering (blocks reuse or determinism). Line numbers are from the files on `origin/main`.
Rows 27-37 were found by the challenger's read and probes (section 8).

| # | Sev | Defect | File:line | Evidence |
|---|---|---|---|---|
| 1 | R | No throw-in after a made basket; ball goes live in hand inside the court | `sim.js` 1165, 280, 1485 | `dead(st, 75, "inbound", 1 - S.t, null)` → `sp = spot \|\| [-d * 11.2, C.cy - 1.5]` → `giveBall(st, I)` |
| 2 | R | Side-out "inbound" spot is 0.3 m **inside** the sideline; the inbounder stands on the floor with a live ball | `sim.js` 554 | `sideSpot = (x) => [clamp(x, …), 0.3]` |
| 3 | R | A check asserts the defect: "the inbound is on the floor" | `scripts/check-hoops.mjs` 234-243 | `assert.ok(st.p[st.ball.own].y >= 0 && … <= C.w, "the inbound is on the floor")` |
| 4 | R | No 8-second count, no backcourt (over-and-back) violation, no frontcourt status | `sim.js` 1140, 1454-1468 | only `inBounds`, shot clock and game clock are checked |
| 5 | R | Shot clock resets to the full 24 on **every** miss, at the miss (not the rebound); 14 only after a defensive foul | `sim.js` 1255, 549-550 | `b.st = "loose"; b.rim = true; st.shot = st.cfg.shot * HZ` |
| 6 | R | No 3-second rule, no 5-second inbound count, no timeouts, no substitutions | `sim.js` 1168-1180 | `endPeriod` resets clocks only |
| 7 | F | Human holder over a line = instant turnover; CPU holder silently clamped inside; no line awareness or slowdown | `sim.js` 1456, 1446, 1434 | `if (H && !inBounds(st, H.x, H.y)) turnover(…)` vs `if (H && !human(st, H)) { H.x = clamp(…) }` |
| 8 | F | Corner spots 0.67 m from the sideline; pass landing points clamped only 0.4 m inside; receivers run to the line | `sim.js` 266-267, 603 | `[1.0, ±6.95]` → y = 0.67 / 14.57; `clamp(ty, 0.4, C.w - 0.4)` |
| 9 | F | **Controls are court-relative** in every camera; the camera basis never reaches the input layer; in the side-on cameras perspective slants the floor axes by up to ~35° on screen | `input.js` 36-39; `Hoops.jsx` 518-531; `render.js` 80-81, 100-102 | `if (L.y < -t) m \|= BTN.UP` → `step(st, m)`; camera only in `draw` |
| 10 | F | Right-stick gestures are read on the court's x axis times the attacking direction, not the camera or the rim line | `sim.js` 980-985 | `const [x, y] = codeXY(codes[0]), along = x * d` |
| 11 | F | Pass aim (`passTarget`) uses the same court-axis bits | `sim.js` 562-563 | `dx = (m & BTN.RIGHT ? 1 : 0) - …` |
| 12 | F | Icon letters re-shuffle whenever the holder changes | `sim.js` 1040 | `teamOf(st, P.t).filter(Q => Q !== P).map((Q, k) => ({ g: Q.g, b: ICONS[k] }))` |
| 13 | F | No defensive mode: RS gestures only while holding the ball; LB and RB unused on D; no hands-up/contest, shade, double team, icon switch. LT is a real, calibrated stance (contest ×1.1 vs ×0.8, steal +0.03, ankles ×0.7, drive −0.12, shooting foul +0.02) that S3 must keep | `sim.js` 1021, 1044, 1076-1083; 345, 410, 628, 668, 1403 | `const gst = proStick(…)` only under `if (has)`; `P.intense = Boolean(m & BTN.LT)` |
| 14 | AI | **Permanent press**: defenders sit 1.0 / 1.6 m goal-side of their man anywhere on the floor; intense D inside 1.4 m anywhere | `sim.js` 747-757, 844 | `let gap = hasBall ? 1.0 : 1.6` with no court-position term |
| 15 | AI | After a make the defence is placed matched-up at mid-court | `sim.js` 290-292 | `mx = spot ? mx0 : mx0 - d * 6` then 1.6 m goal-side of it |
| 16 | AI | The best-rated player inbounds and brings it up (the centre when he is the best); no roles; the human is therefore always the inbounder when his side inbounds, by rating not by role | `sim.js` 282, 178-179, 244, 1485; `roster.js` 99-100 | `let inb = offence[0]`; "the best brings the ball up" |
| 17 | AI | No outlet: teammates sprint to half-court spots at the whistle; nobody comes to the ball | `sim.js` 822-827 | `far = len(sx - P.x, sy - P.y) > 6; P.sprint = far` |
| 18 | AI | `spotOf` treats a big at roster index 0 as a perimeter player | `sim.js` 271 | `big = team.find(P => P.arch === "big" && P.i !== 0)` |
| 19 | AI | CPU pass decision: hold ≥ 14 frames first; pass only to a higher shot-EV man; no swing, entry, outlet or reversal; 5 % pick calls; drive decided by archetype dice | `sim.js` 903-915, 926, 928 | `if (P.hold > 14) { … }`; `rnd(st) < 0.05) callPick`; `P.drive = rnd(st) < (big\|slasher ? 0.45 : 0.15)` |
| 20 | AI | The **human's** receiver choice ignores openness and the lane; passes are always accurate (no bad-pass TO). (The per-frame lane deflection model at 1199-1213 is right and stays.) | `sim.js` 562-572 | `s = cos * 10 - dd * 0.15` |
| 21 | AI | Help only when the ball is inside 6 m and the on-ball man is beaten; helper choice barely weighs his own man's threat; no help-the-helper | `sim.js` 759-776 | `if (r > 6) return;` `- 0.4 * len(M.x - H.x, M.y - H.y) * 0.3` |
| 22 | AI | Screen switch is a dice roll on contact; no PnR coverage; no zone; no press call; the 150-frame "transition" only suppresses cuts | `sim.js` 731, 239, 817 | `rnd(st) < 0.15 + 0.6 * min(perD)` |
| 23 | AI | Rebounding: box-out only while the shot is up; crash/get-back is by distance rank, not role or situation | `sim.js` 855-870 | `rank < 2 && (st.poss !== P.t \|\| rank === 0 \|\| big)` |
| 24 | E | One 1,542-line file holds rules, AI, physics, input interpretation, stats and the record; versions are whole-file forks (`v1/ v2/ v3/`) | `sim.js`, `replay.js` | a multi-file engine cannot be frozen this way |
| 25 | E | The input frame is one 17-bit court-axis mask: 8-way movement, no analog magnitude, one human only; all per-human state is global (`ctl`, `ctlFor`, `prev`, `gest`, `yPend`, `icons`, `tipPress`) and `human()`/`you()` hard-wire team 0 | `sim.js` 35, 173, 193, 202, 1323-1327 | `BTN = {…RB: 65536}`; `step(st, mask = 0)` |
| 26 | E | Control jumps to the holder at every catch; no off-ball control | `sim.js` 244, 615, 1355 | `if (P.t === 0 && !st.cfg.auto) st.ctl = P.i` |
| 27 | R | `st.poss = -1` before `giveBall` resets the shot clock to full on **every** inbound, including when the offence keeps the ball after a defensive deflection out; only fouls keep the time | `sim.js` 1484, 1482-1486 | `st.poss = -1; giveBall(st, I); if (keep) st.shot = sc` |
| 28 | AI | `giveBall` sets the holder's marker `close = 40` on every catch, the inbound included: the closeout sprint is a second source of the press | `sim.js` 246-247, 836-839 | `const M = markerOf(st, P); if (M) M.close = 40` |
| 29 | R | The OOB throw-in spot from `turnover` is clamped onto the floor (y 0.3..w−0.3, x ±(hx−0.4)) | `sim.js` 1143 | `sp = [clamp(x, -C.hx + 0.4, …), clamp(y, 0.3, C.w - 0.3)]` |
| 30 | F | Dribble moves set a court-y velocity and ignore the lines: a crossover from the corner spot goes out of bounds 20/20 (probe) | `sim.js` 656, 1456 | `vy = a.side * sp * 0.62` |
| 31 | AI | The four-out-one-in big's spot `[1.6, 2.3]` and the 3v3 TWO_IN spot are inside the lane (\|dy\| 2.3 < 2.44); offensive bigs are in the lane 42 % of live held-ball frames (probe); the off-ball sag target (rim−3, cy) is in the lane too | `sim.js` 267, 269, 755 | `FOUR_IN = [… [1.6, 2.3]]` |
| 32 | R | FIRST TO 21: team fouls never reset, so the bonus is permanent after the 4th | `sim.js` 41, 1175 | `tf` reset only in `endPeriod` |
| 33 | E | The difficulty harness always makes the best player the guard; real rosters whose star is a wing or a centre (4 of 10) are never measured | `check-hoops.mjs` 158 | `five = (p, base) => [[p + "g", "G", base + 6, "guard"], …]` |
| 34 | E | **No v4 fixture**: `replay.js` sends `v >= 4` to the live sim and the checks only assert that v4 *is* the live sim; players' saved v4 records would break at the first behaviour change | `replay.js` 13; `check-hoops.mjs` 326-327; `Hoops.jsx` 508-511 | `simOf = (v) => (v >= 4 ? live : …)` |
| 35 | F | The pad's d-pad moves the player; 2K puts plays on it | `input.js` 39 | `if (down(pad, 12)) m \|= BTN.UP …` |
| 36 | F | Touch swipes are measured on screen and encoded as court-axis right-stick bits (the camera defect for touch) | `Hoops.jsx` 629-651 | `if (dx > Math.abs(dy) * 0.45) bits \|= BTN.RSR` |
| 37 | E | The module boundary already leaks outward: `check-ads.mjs` imports `COURT` from `hoops/sim.js`; the purity grep scans only `sim.js` | `scripts/check-ads.mjs` 54; `check-hoops.mjs` 182-183 | — |

What is **right** and must be kept: the pure 60 Hz step over a seeded generator with only
`+ - * / sqrt` (1-5); the shot model and its calibration (317-392, CPU v CPU FG 47.5 / 3P 37.7 /
FT 76); the lead-pass flight model and the per-frame lane deflections (575-620, 1199-1213); the
contest model; the intense-D stance (row 13); the casual-human difficulty measurement
(`check-hoops.mjs` 55-178, "measured, not chosen"); the record (`rleEncode`, `replay`, frozen
versions); the render/sim separation; the street ruleset (`clear`, `check`, make-it-take-it).
Measured baselines to carry forward (probes, 40 CPU v CPU games): turnovers **12.1 per 100
possessions**; passes intercepted or deflected **1.2 per 100 passes**; the casual bot's own OOB
turnovers **1.18 per game on ROOKIE, 0.85 on HOF**, all on the sideline; the bot crosses half
court in a median **141-162 frames** (p90 ≤ 191, never over 480), the CPU in 147 (max 233) — the
8-second rule will not bite anyone who is trying.

---

## 4. The engine

### 4.1 Principles

1. **The possession is the unit.** Every rule, AI behaviour and control reads the possession
   state. Nothing is "live" without knowing whether it is a throw-in, the backcourt, early
   offence, the set, an action, a shot or a scramble.
2. **Pure, deterministic, replayable.** No clock, no `Math.random`, no trig, no DOM, no camera in
   the engine. A game is `f(version, seed, cfg, inputs per frame)`. This is what lets the league
   verify a tape and what makes lockstep multiplayer transport-only.
3. **Camera-relative at the hands, court-relative in the record.** The adapter maps the stick
   from screen to court using the camera; the engine and the record never learn which camera was
   used. The record does carry the camera id as metadata, so a tape can be watched as it was played.
4. **Rules are data.** NBA, the HVI short game, FIBA, street: one state machine, one table each.
5. **Roles, schemes and sets are data.** The AI runs behaviours; what it runs is a coach table a
   human can change (and the standalone game can expose).
6. **Looks are a separate module.** `render.js`, `audio.js`, `calls.js` consume the state and an
   event stream; the engine never imports them.
7. **Calibration is measured, never chosen; a version is a contract.** Every shipped behaviour
   change — a dial re-tune included — is a new engine version with a frozen snapshot and a
   fixture that must replay forever. Measurements use N ≥ 400 games and a bot whose error model
   is fixed before any dial moves.
8. **Two games, one engine.** The engine directory imports nothing from HVI. `Hoops.jsx` is one
   adapter; the standalone game is another.

### 4.2 Module map

```
src/play/hoops/engine/            (zero imports from outside this directory; the purity grep runs on every file under engine*/)
  court.js        geometry, lines, spots, frontcourt/backcourt tests, isThree
  rules/          index.js (the possession state machine), nba.js, hvi.js, fiba.js, street.js
  physics.js      player motion, ball flight, contact, boundaries, the keep-apart
  shot.js         greenOf, gradeOf, contestOf, shotProb, ftProb, release (today's model)
  pass.js         pass verbs, the human's target profile, flight + per-frame lane rolls, catch, bad-pass branches
  ai/
    roles.js      role tags from ratings and positions (BH1, BH2, WING, BIG, …)
    coach.js      scheme/tempo/settings tables; the CPU coach's situational calls (press late)
    offence.js    transition (outlet, push/walk, lanes), sets, actions, reads, second side
    defence.js    pick-up point, man principles, PnR coverages, help/rotate, zones, press
    rebound.js    crash vs get back, box-out, pursuit
    carrier.js    the ball handler's utility scorer (shoot / drive / pass / move / action)
  input/
    intents.js    the input frame (today's 17-bit court-axis mask; the analog frame when needed), encode/decode
    controls.js   control profiles: OFFENCE and DEFENCE verbs → engine commands (2K default layout)
    assist.js     line awareness (stick and moves), defensive assist, pass-to-the-right-man (level dials)
  levels.js       LEVELS (the casual-human dials, re-measured per version), NEUTRAL, the dial→hook table
  game.js         newGame, step(st, frames), resultOf, boxScore, events
  record.js       rleEncode/Decode, the record schema
src/play/hoops/                   (the HVI adapter)
  Hoops.jsx, render.js (camera rig + picture), audio.js, calls.js, roster.js,
  input.js (pads/keys/touch → court-space mask via the camera map), replay.js (the version router: v1..v4 files, engine-v5+ directories)
```

The version router stays in the adapter (`replay.js`), because it must import every frozen
version. Freezing: from v5 a version is a directory snapshot (`scripts/freeze-hoops.mjs` copies
`engine/` → `engine-v5/`), taken **before the first behaviour-changing commit of the next
version**, with a fixture `scripts/fixtures/hoops-v5-records.json` cut at the same moment.
`v4/sim.js` is cut first of all (section 6, S0). `check-ads.mjs` moves its `COURT` import to
`engine/court.js`.

### 4.3 The possession state machine

```
JUMP_BALL ─tip─▶ LIVE.BACKCOURT
DEAD(reason) ─walk N frames─▶ THROW_IN(spot, team, inbounder, endLineRun, 5 s, clock rule)
THROW_IN ─ball touched inbounds─▶ LIVE.BACKCOURT (if in the backcourt) | LIVE.FRONTCOURT.*   (shot clock starts here)
LIVE.BACKCOURT  8-second count; outlet / push / walk; the defence is in retreat unless PRESS
   ─ball + both feet of the dribbler wholly in the frontcourt─▶ LIVE.FRONTCOURT.EARLY
LIVE.FRONTCOURT.EARLY  until the defence is set (n−1 defenders goal-side within 9 m of the rim) or 6 s
   ─▶ LIVE.FRONTCOURT.SET (alignment reached) ─action chosen─▶ ACTION(kind) ─reads─▶ SET | SHOT
LIVE.SHOT  (shot clock paused while the ball is in flight)
          ─made─▶ DEAD(made) ─▶ THROW_IN(end line, run allowed, 24)
          ─miss─▶ LIVE.LOOSE ─OREB─▶ SET (shot clock 14) | ─DREB─▶ LIVE.BACKCOURT (24)
          ─blocked/deflected/fumbled─▶ LIVE.LOOSE
any LIVE ─OOB | 8 s | over-and-back | shot clock | 3 s─▶ DEAD(violation) ─▶ THROW_IN(designated spot; the offence keeps the unexpired time after a defensive deflection out)
any LIVE ─foul─▶ FREE_THROWS | DEAD(foul) ─▶ THROW_IN(by rule; frontcourt max(14, left))
FREE_THROWS ─last made─▶ DEAD(made) ─▶ THROW_IN(end line) | ─last missed─▶ LIVE.LOOSE
any DEAD ─timeout called─▶ TIMEOUT ─▶ THROW_IN (advanced to the frontcourt when the rule allows)
clock ≤ 0 ─▶ PERIOD_END ─▶ THROW_IN | OVERTIME | FINAL
street: THROW_IN is CHECK at the top; DREB/steal sets CLEAR until the ball is past the arc; an and-one keeps the ball
```

The game clock runs only in LIVE and FREE_THROWS' live rebound. Every transition emits a typed
event (`made`, `throwIn`, `violation.backcourt`, `foul.shooting`, `timeout`, …) consumed by
calls, audio, the HUD, the league recap and the checks.

### 4.4 Rules as data

```js
RULES.nba    = { periods: 4, len: 720, ot: 300, shot: 24, oreb: 14, backcourt: 8, inbound: 5,
                 endLineRun: true, lane3: true, def3: true, closelyGuarded: "nba-post",
                 penalty: { teamFouls: 5, lateSecs: 120, lateFouls: 2 }, foulOut: 6,
                 timeouts: { reg: 7, q4max: 4, late: 2, ot: 2, advance: true }, swapEnds: 2, jump: "nba" }
RULES.hvi    = { ...nba, len: 120, ot: 60, foulOut: 3, def3: false,
                 penalty: { teamFouls: 3, lateSecs: 20, lateFouls: 2 },          // "the last two minutes" scaled to the last 20 s of a 2-minute quarter
                 timeouts: { reg: 2, q4max: 2, late: 1, ot: 1, advance: true }, swapEnds: 0 }   // team 0 attacks +x all game: wired into P.d, the render focus and the checks
RULES.to21   = { ...hvi, periods: 0, target: 21, penalty: { teamFouls: 4, resetEvery: 7 } }      // team fouls reset each time the leading score passes 7 and 14
RULES.fiba   = { ...nba, len: 600, def3: false, closelyGuarded: "fiba-1m", jump: "arrow" }
RULES.street = { target: 21 | 11, winBy: 1, ones: true, check: true, clear: true, mitt: cfg.mitt,
                 ft: false, andOneKeeps: true, shot: 24 | 14, foulOut: 99, lines: ["half"] }
```

Violations the engine *knows* and violations it *calls* are separate (section 4.11). `lane3` is
known from S1b but called against the CPU only once the AI tracks lane seconds (S2); it is never
called on ROOKIE. `def3` is off for `hvi`.

### 4.5 Team AI

**Roles** (`ai/roles.js`), assigned at tip-off from the five and refreshed on substitutions.
`BH1` = the highest `0.6·handle + 0.4·pass + posBonus` **across all five** (posBonus PG +8, SG +4,
else 0); `BH2` the next. On the real rosters this gives Larry Bird (90/85) the ball for THE
DEPARTMENT, not Taylor Swift (59/57 + 8), LeBron for THE INDEXED, Kareem's guard for THE HOUSE
EDGE only if he outscores Kareem — the harness checks all ten (section 5). `WING` × 1-2, `BIG` ×
1-2 (C/PF or arch big), plus tags any player can carry: `SHOOTER` (three ≥ 65), `ROLLER`/`POPPER`,
`POST` (close ≥ 70 and height), `RIM_PROTECTOR` (block ≥ 65), `INBOUNDER` (a BIG, else the lowest
handle), `CRASHER`. **Grab-and-go** is relative: the rebounder pushes himself only if his handle is
within 10 of BH1's or no guard is within 6 m (Jokić at 73 does not clear Brunson at ~89).

**The coach** (`ai/coach.js`), one table per team, human-editable in S4:
```js
{ tempo: "push" | "balanced" | "walk", crash: 1 | 2 | 3, set: "5out" | "4out1in" | "horns",
  pickUp: "arc" | "half" | "full", pnr: "drop" | "hedge" | "switch" | "ice" | "trap",
  offBall: "deny" | "tight" | "sag", help: "normal" | "pre-rotate", zone: null | "2-3" | "3-2" | "1-3-1",
  press: null | "man" | "1-2-1-1" }
```
Defaults: push, crash 2, 5out (4out1in with a POST), **pickUp "arc"**, drop vs a non-shooter big,
switch like-for-like, sag off three < 55, help normal, no zone, **no press**. The CPU coach calls
PRESS only when trailing by two possessions or more inside the last 20 % of the final period (or
down 4+ at 15 in a game to 21), and drops it after a stop. That is the whole press rule.

**Offence** (`ai/offence.js`), by possession state:
- **DEAD(made) → THROW_IN**: the INBOUNDER takes the ball behind the end line; BH1 shows at the
  near elbow extended, BH2 flares as the safety behind the ball, wings sprint wide, the other big
  rim-runs. The inbounder passes to BH1 (BH2 if denied) and trails. **The human controls BH1**;
  A calls for the ball and the CPU inbounder throws it; controlling the inbounder is an option.
- **DREB → outlet**: the rebounder pivots and outlets to BH1/BH2 within 1.5 s, or grabs and goes
  by the relative rule above.
- **BACKCOURT**: `tempo` decides sprint (numbers advantage or push) vs jog; the handler never
  dribbles toward his own baseline; the safety stays behind the ball until it crosses.
- **EARLY**: an advantage read (a lane, a numbers edge, a trailing shooter) → attack; else SET.
- **SET**: the alignment's spots (from `coach.set`), with spacing targets: a spot is vacated
  when a driver needs the lane, filled by a lift or a drift; no two attackers stand inside 2.5 m
  of each other except in an action; the big's spot is on the block (|dy| ≥ 2.7), and the AI
  tracks lane seconds so no one camps.
- **ACTION** library, scored by utility against the defence's coverage: pick-and-roll / pop,
  dribble hand-off, pin-down for a SHOOTER, post entry for a POST, isolation for the best creator
  when a mismatch exists, drive-and-kick, backdoor on a denying defender, give-and-go.
- **Second side**: when the first action dies the ball swings (skip if the far side is open).
- **Shot → crash/get-back**: `crash` bigs go, BH1 and one more get back; the human's man is
  excused.

**Defence** (`ai/defence.js`):
- **Transition**: the two nearest the rim sprint goal-side first and build the wall; the rest
  match as they arrive. Nobody picks the ball up above `pickUp` except under PRESS, and the
  closeout (`close`) fires only inside the frontcourt.
- **Pick-up point**: `arc` ≈ 1 m outside the three-point line; above it the on-ball defender
  shadows at 3-4 m and retreats with the ball; `half` and `full` are the pressure options.
- **Man principles** become `guardSpot(me, myMan, ball, scheme)`: on ball → goal-side at a gap set
  by on-ball pressure; one pass away → `offBall` (deny: on the line up the line; sag: toward the
  lane line, **outside** the lane); two passes away → help position at the lane line with a view
  of both.
- **PnR coverage** per `coach.pnr`, with the switch decision made by role and size, not dice.
- **Help**: the helper is the defender whose man is least dangerous (openness × shooting × his
  distance to his shot spot) and nearest the drive line; help-the-helper rotates to the vacated
  man; closeouts sprint then chop inside 1.5 m with a hand up.
- **Zones and presses** are alignments with area ownership; S4.

**Rebounding** (`ai/rebound.js`): box out at the shot by role, pursue the ball's landing point,
crash count from the coach, get-back for the rest.

### 4.6 The pass model

- **Verbs** (OFFENCE profile). Every pass **leaves on the press**, so nothing gains lag; the type
  comes from geometry and from what is still held afterwards: tap A pass (skip/overhead
  automatically when the chosen receiver is across the floor, > 8 m with a defender between);
  A still held at the catch = give-and-go (the passer keeps control and cuts; release brings it
  back); B bounce; double B flashy (faster, riskier); Y lob (today's 12-frame wait for the
  double-tap alley-oop stays, it is 2K's too); hold Y lead-to-basket (the receiver cuts, release
  passes); RB + button icon pass; Y+B pass fake.
- **The human's target profile**: `score = wD·cos(stick, receiver) + wd·(1 − dist/20) + wO·openness`
  with a lane penalty; defaults 55/40/5 (HALL OF FAME), openness rising to 25 on ROOKIE as the
  "pass to the right man" dial, measured like every dial. Icon passing bypasses the profile.
  The CPU's choice stays utility-driven (`carrier`) and gains the swing, entry and outlet actions.
- **Icons are stable**: assigned at tip-off by roster slot; when the holder changes, his freed
  letter goes to the previous holder — a swap of two, never a reshuffle of four.
- **Lane risk**: today's **per-frame** model stays (one roll per defender the ball passes within
  reach of, weighted by steal rating and pass type); it gains the defender's facing, the pass
  type's full table (bounce 0.6, lob 0.7, flashy 1.2) and a telegraph term (the stick held toward
  the receiver > 20 frames before the pass). Deciding the outcome at release would ignore
  defenders who step in after it.
- **Accuracy**: a bad pass is a new branch — fumble at the catch (loose) or sail (OOB) — with a
  rate from passer `pass`, pressure on the passer (a hand in his face, a jump pass), distance and
  the pass type.
- **The turnover budget**, CPU v CPU per 100 possessions, total **12-15** (today 12.1): bad
  passes 5-6, steals / strips / lost dribbles 4-5, violations + OOB + charges 2-3. The existing
  `lose`, strip and steal rates are rebalanced inside the budget, not added to.
- **Catch**: a **standing** receiver steps to the ball (never away) with a catch radius that
  grows with his hands rating; a moving receiver keeps running onto it (today's `runOnto`, the
  lead pass that must be kept); a pass input inside the catch window is a touch pass.

### 4.7 The shot model

Kept as is (section 3). Two additions that the research supports and the calibration tolerates:
the contest is sampled at the gather **and** at the release (2K24's two-sample contest; 30/70
weight) so a late closeout matters; a layup through a set wall is a `block`/`charge`/`finish`
read, not a 4-frame dunk. No rhythm shooting, no aiming: timing is the skill (section 2.1).

### 4.8 The input layer and camera-relative controls

**The input frame.** Today's 17-bit court-axis mask (`BTN`) stays through S1b: the adapter maps
the stick from screen to court and quantises to the existing 8 directions, so the record format,
the RLE compression and the fixtures are untouched. The analog frame (heading 24-way with
hysteresis, magnitude, right-stick heading, buttons; 28 bits) comes **only when a feature needs
it** (analog walking, a second seat) and is then built with a literal 24-entry cos/sin table in
the adapter (no trig in the engine, as `0.70710678` at `sim.js` 1059 already does) and an
engine-side reduction of the right stick to 8 rim-relative sectors for gestures.

**Camera-relative mapping** lives in the adapter (`input.js`), never in the engine, and it is a
**floor-to-screen map at the controlled player**, not a camera-basis rotation: in the side-on
cameras the basis is the court's own axes, so a rotation changes nothing, while perspective slants
the floor's +y by up to ~35° on screen for a player off-centre.
```
P  = the controlled player's floor point (x, y, 0)
S0 = proj(P), Sx = proj(P + x̂), Sy = proj(P + ŷ)        // render.js toCam/fromCam, this frame
J  = [[Sx−S0], [Sy−S0]]                                   // 2×2 floor → screen, columns in screen px
court = J⁻¹ · stick                                       // stick (sx right, sy up on screen) → court direction
mask  = quantise8(court)                                   // today's BTN bits; 24-way later
```
Hold `J` while the stick is held (re-sample when it returns to centre), so a running man does
not drift as he moves across the frame. **Cuts**: presets never jump (the camera eases), but in
DRIVE and BASELINE a change of attacking direction swings the camera heading 180° in ~6 frames
through the top-down degenerate case. A cut is detected when the camera heading turns more than
45° within 12 frames; the old `J` is held until the stick returns to centre, 30 frames pass, or
the stick's own angle changes by more than 45°, then the maps blend over 6 frames. A
`controls: "camera" | "court"` option keeps today's behaviour for whoever prefers it. The right
stick is mapped the same way and then decomposed **rim-relative** (toward / away / left / right of
the man-to-rim line); when the man is within 1.5 m of the rim or past the rim plane the attacking
direction `d` is the reference instead, and a crossover's sideways motion runs perpendicular to
the rim line, not along court y. Touch swipes go through the same map. The record carries `cam`
(the camera id and its adjustments at the time) as metadata outside the input log.

**Control profiles** (`input/controls.js`), the 2K default layout, one table per mode:

| | OFFENCE (ball) | OFFENCE (off ball) | DEFENCE |
|---|---|---|---|
| LS | move (camera-mapped) | move / call for the ball (A at a throw-in) | move; with LT: shade the drive |
| RS | dribble moves, rim-relative; hold = shot stick (off by default) | — | **hands up (hold up)**, **contest (flick at the shooter)**, lateral cut-off (2K25) |
| X | shoot (hold, release at the top) | — | steal |
| A | pass (tap); held through the catch = give-and-go | call for the ball | switch to nearest |
| B | bounce / flashy (double) / Y+B fake | — | take charge (hold) |
| Y | lob / alley-oop (double) / lead-to-basket (hold) | — | block / rebound |
| LB | pick (hold: roll/fade, side) | — | **call double team** (hold); icon double (tap + button) |
| RB | icon pass (hold + button) | — | **icon switch** (tap + button) |
| LT | post up | — | **intense D / stance** (hold, today's calibrated effects kept); LT+RT fast shuffle |
| RT | sprint | sprint | sprint |
| D-pad (pad only; keys keep arrows for movement) | quick plays (left: the favourites menu; up/down: set; right: tempo) | — | scheme calls (up: press on/off; left: PnR coverage; right: zone) |

On a pad the d-pad stops moving the player (2K's layout); the left stick moves. Keyboards keep
arrows/WASD for movement and get the play and scheme calls on number keys.

**Defensive mode** is this column plus two assists: *Defensive Assist* (a level dial: the engine
keeps your body goal-side of your man when you hold LT and let the stick drift) and *auto-switch*
(`sw`, today's). The HUD flips to the DEFENCE legend, shows the man you guard and the scheme.
Two of its verbs — RS hands-up/contest and RB icon switch — use bits that already exist and ship
in S1b.

**Line awareness** (`input/assist.js`): a human holder inside 0.5 m of a line with the stick
pointing over it slows to a walk and stops 0.1 m inside unless RT is held; a LINE cue shows. It
applies to **dribble moves as well as the stick** (moves set velocity directly today). The CPU
never steps out. Spacing spots and pass landings sit ≥ 1.0 m inside the lines; the half line is a
line on the half court.

### 4.9 The camera rig

Stays in `render.js` (presentation). It exports `proj` for the floor-to-screen map and its
heading each frame for the cut detector. No other change; looks come last.

### 4.10 Data-driven rosters and ratings

A roster row stays `[key, name, rating, arch?, pos?, hand?]` for HVI; the engine accepts a
`Player` record with optional per-skill ratings and tendencies (`{ skills: { three, mid, … },
tend: { drive, pullUp, post, pass } }`) and derives the missing ones by archetype as today. The
standalone game ships full records; the league ships one rating.

### 4.11 Difficulty and the casual-human calibration

`LEVELS` stays the mechanism and every number stays measured. The dials are **hooks**, not just
numbers: each one scales a specific code path, and a new AI module must keep the hook or retire
the dial and re-measure from scratch. The table (today's lines):

| Dial | Hook | Stage that changes its meaning |
|---|---|---|
| green, contest, make, ft, cpuMake, street | `greenOf`/`shotProb`/`ftProb` 321-391 | none (the shot model is kept) |
| cpuBlock, react | the rim protector and block jumps 431, 456, 484, 1236 | none |
| cpuSteal | reach-ins 630, 847; lane deflections 1206 | S3 (pass model) |
| steal, foul | the human's reach-in 629, 633; shooting fouls 412; blocking fouls 1315 | S3 |
| help | the help sprint 834 | S2 (help becomes a rotation, the dial scales its speed) |
| cut | backdoor cuts 819, give-and-go 618 | S2 (cuts become actions; the dial scales their frequency) |
| mateD | teammates' contests 348 | none |
| lose, ankle | dribble moves 669, 673 | none |
| autoD, sw | the human's auto-guard 1075 and auto-switch 1360 | S1b (press off changes what "guarding" means) |
| sta, spd, drive | sprint drain 1424, speed 1060, drive slow-down 1403 | none |
| reb | the glass 1276 | S1b (14 s after an OREB changes rebounding's value) |
| tip | the jump 1341 | none |
| **new**: passAssist, line, inbound, defAssist, violations | the target profile, line awareness, the throw-in (`auto` after 3 s on ROOKIE/PRO, the 5-second call on ALL-STAR/HOF), the D steer, which known violations are called (ROOKIE 8 s only; PRO + over-and-back; ALL-STAR + 3 s; HOF everything) | S1b, S3 |

Measurement: N ≥ 400 games per level per mode (a full sweep is ~80 s wall on 12 workers; one
5v5 game is ~190 ms today, so a per-frame budget check guards the utility AI's cost); the bot's
error model (release sd 6 frames, 250 ms defensive lag, 30° pass slop) is **fixed before any dial
moves**, and when the bot learns a new verb (inbound, cross half court, the D buttons) its
parameters are published with the version. The bands (ROOKIE 65-75 %, PRO 45-55, ALL-STAR 30-40,
HOF 15-25 in 5v5; the half court keeps today's weaker bands — ROOKIE 65-75, monotone order,
HOF 10-30 — until a version makes them tighter on purpose; CPU v CPU FG 45-50, 3P 34-40, FT 72-80)
are the acceptance test; the harness adds real-roster shapes (a wing star, a centre star) beside
the synthetic guard-first five.

### 4.12 Deterministic, replayable, versioned

Unchanged contract: `replay({version, seed, cfg, inputLog}) → result`, bit-identical in any
browser or Node. **Every shipped behaviour change bumps the version** — AI, passing, a dial
re-tune — because a tape's result depends on everything `step()` does, not on the input format.
A version is a stage that has shipped; its snapshot is taken before the first behaviour-changing
commit of the next one, and its fixture is cut at the same time. v4 gets a fixture and a frozen
copy **first** (S0). Debug and tape-verify modes keep a rolling per-frame hash so a divergence is
located, not just detected; the buzzer re-run in `Hoops.jsx` 510 gets a performance budget.

### 4.13 Multiplayer-ready (lockstep)

Deferred to S4 with the standalone adapter, and specified now so nothing in S1-S3 blocks it:
every per-human field (`ctl`, `ctlFor`, `prev`/`mask`, `gest`, `yPend`, `iconOn`/`icons`,
`tipPress`) moves into `st.seats[k]`; `human(st, P)` and `you(st, t)` read the seat table instead
of team 0; `step(st, frames)` takes one input frame per seat in a fixed seat order; a two-human
game plays NEUTRAL (or an explicit per-seat handicap), since the LEVELS asymmetry is defined for
one human against the CPU. Lockstep is then transport only: both clients run the same engine,
exchange frames with a fixed input delay (3 frames = 50 ms), and the record is both logs.
Nothing in the engine reads wall time, the camera or the DOM. Rollback is out of scope.

### 4.14 Hooks

- **League**: `simulateGame(seed, cfg)` headless (`cfg.auto`), `resultOf`, `boxScore`, the typed
  `events` stream for recaps and the Overlord's calls. Today's `check-hoops` strength test is the
  template.
- **Standalone game**: imports `engine/` and brings its own adapter (presentation, menus, saves,
  net). Nothing in `engine/` knows about districts, cases or CYCLES.

---

## 5. AI quality targets ("basketball IQ" checks)

Every number below is a check in `scripts/check-hoops.mjs`, CPU v CPU (NEUTRAL) over 60+ games
unless stated, with the casual-human bot where the human matters. Each is written so it can fail.

| Check | Target |
|---|---|
| Bring-up | BH1 or BH2 carries the ball across half court on ≥ 95 % of possessions after a make or a defensive rebound; a BIG does on ≤ 3 % (and only by grab-and-go); on all ten real rosters the chosen BH1 is in the team's top two by handle |
| Throw-in | 100 % of made baskets are followed by a throw-in released from behind the end line; CPU 5-second violations = 0; the shot clock starts on the touch inbounds |
| Press off | With `press: null`, **defender-initiated** approach (the defender closing while the handler is not moving toward him) within 1.5 m in the backcourt on ≤ 5 % of possessions, excluding the first 1.5 s after a defensive rebound; with PRESS called, ≥ 90 % |
| Pick-up point | Median first defender-initiated contact distance from the rim with `pickUp: "arc"` between 7.5 and 9.5 m |
| Out of bounds | CPU holders step out 0 times a game; the casual-human bot's OOB turnovers per game ≤ 0.2 (today 1.18 ROOKIE / 0.85 HOF) in every mode |
| Backcourt | CPU 8-second and over-and-back violations = 0; the human's are called per the level table and the bot's rate is reported |
| Spacing | In SET, mean nearest-teammate distance ≥ 4.5 m; two attackers inside 2.5 m for > 1 s only during an action; an offensive player in the lane ≥ 2.5 s with team control ≤ 2 % of SET frames |
| Help | On a drive past the on-ball man, a helper reaches the lane line within 0.6 s on ≥ 70 % (NEUTRAL); the man the helper leaves is in the bottom two of his team by an **independent** danger score (three rating × distance from his spot) on ≥ 80 % |
| Passing lanes | Steals + deflections 3-5 per 100 passes (today 1.2); passes thrown through a defender's reach cylinder ≤ 10 % of passes by the CPU |
| Pass choice | With a teammate inside the stick's ±60° cone, the receiver the **bot intended** (it aims 30° off) is the one chosen ≥ 85 %; with two in the cone the more open one ≥ 70 % at ROOKIE |
| Turnovers | Total 12-15 per 100 possessions; bad passes 5-6, steals/strips/lost dribbles 4-5, violations+OOB+charges 2-3 |
| Transition D | After a change of possession, ≥ 2 defenders are goal-side of the ball within 1.5 s on ≥ 95 % (≥ 1 in 3v3) |
| Calibration | FG 45-50 %, 3P 34-40 %, FT 72-80 %, 3PA 35-45 % of shots; the casual-human bands of section 4.11 hold at N ≥ 400 |
| Determinism | Every fixture (v1-v4, then each engine version) replays; a doctored log does not; the per-frame hash of a tape matches its recording |
| Cost | A 5v5 game ≤ 400 ms headless (today ~190); no frame of a live game > 4 ms on the engine |

---

## 6. The staged build plan (smallest correct first)

Each stage ends with the checks green, the calibration re-measured at N ≥ 400 and, when the
behaviour changed, a frozen snapshot and a fixture.

### S0 — Lock what exists (no behaviour change)

Build: `scripts/fixtures/hoops-v4-records.json` from the live sim (bot and casual-human tapes
for 5v5, 3v3 and 1v1); copy `sim.js` → `v4/sim.js`; `replay.js` routes `v === 4` there; the
camera map in the adapter only (`input.js` floor-to-screen `J`, the cut detector, touch swipes
through it) emitting today's 8-way court bits; the camera id written into the record's metadata.
Checks: v4 fixtures replay; a tape played under BASELINE replays identically under 2K.

What Scott sees: in BASELINE and DRIVE up is up; in 2K a straight push runs straight; nothing
else changes. (The flowchart's decision table asks which camera he was in when the controls felt
wrong — this stage is the answer either way.)

### S1a — The pure split (VERSION stays 4)

Build: `engine/` with court, rules/index (today's `phase` behaviour wrapped, not yet changed),
physics, shot, pass, ai/*, input/*, levels, game, record — a refactor **proven bit-identical
against the v4 fixtures**; the purity grep over `engine*/`; `check-ads.mjs` re-pointed.
Checks: v4 fixtures replay on the split engine; the purity grep passes on every file.

What Scott sees: nothing. That is the point of this stage.

### S1b — Rules, possession flow, hands (engine v5)

Build: the state machine (4.3) and `RULES.hvi`/`to21`/`street`; throw-ins from behind the lines
(run the end line after a make; the designated spot otherwise; 5 s; the `inbound` dial); the
human controls BH1 at throw-ins and calls for the ball; 8-second and over-and-back; 24/14 resets
by rule, the unexpired time kept after a defensive deflection out; the pick-up point with **press
off** (`markSpot` and `close` respect the frontcourt); the BH1/BH2/INBOUNDER roles by the
all-five rule and the relative grab-and-go; line awareness for the stick **and** moves; spots and
landings ≥ 1 m inside, the big's spot on the block; stable icons; openness and a lane penalty in
the human's `passTarget`; RS hands-up/contest and RB icon switch on defence; `check-hoops` gains
the bring-up, throw-in, press-off, pick-up, OOB, backcourt, spacing-in-the-lane and determinism
checks and the real-roster shapes; the casual bot learns to inbound and cross half court; all
four levels re-measured; snapshot + fixture.

What Scott sees: after every bucket the other side takes it out from behind the baseline and a
guard brings it up with a man shadowing him from the arc, not the baseline; he gets the ball on
the wing with room, and the court's lines slow him before they beat him; a pass goes to the open
man he pointed at; on D a flick of the right stick puts a hand up; the icons stop moving.

### S2 — Team AI: roles, transition, half-court offence, man defence with help (v6)

Build: `ai/roles.js` complete, `ai/coach.js` with the default table, `ai/offence.js` (outlet,
push/walk, early, 5out/4out1in sets, spacing targets, lane seconds, the action library, second
side, crash/get-back), `ai/defence.js` (transition wall, guardSpot principles, drop/switch/hedge
coverage, help and help-the-helper, closeouts), `ai/rebound.js`; the carrier's utility scorer
replaces the hold-counter; the `help` and `cut` dials re-hooked and re-measured. Checks: spacing,
help, transition D, calibration, cost.

What Scott sees: a team that runs something — a screen comes when the handler needs it, the
weak side lifts when he drives, a shooter is found, the defence rotates and recovers; the CPU
pushes after a steal and walks it up after a make.

### S3 — Defensive mode and the passing rebuild (v7)

Build: the full DEFENCE control profile (LT stance with shade, LB double team, LT+RT shuffle,
B hold charge, the 2K25 lateral cut-off), the Defensive Assist dial, the DEFENCE HUD legend;
`pass.js` with the eight verbs, the target profile and the passAssist dial, the lane model's
facing and telegraph terms, bad-pass branches inside the turnover budget, step-to-the-ball for
standing receivers, touch passes, pass fakes; `cpuSteal`, `steal`, `foul` re-hooked and
re-measured. Checks: passing lanes, pass choice, turnovers, calibration; the casual bot learns
the D buttons.

What Scott sees: defence has hands — holding LT and sliding stops a drive, a double team can be
called; a lazy skip gets picked, a hold on A swings it and comes back, a hold on Y sends a cutter.

### S4 — Playcalling, schemes, timeouts, seats, presentation, the package (v8)

Build: D-pad quick plays and the favourites menu, the coach table editable in Pause (pressure,
PnR coverage, off-ball, press, zone 2-3 / 3-2 / 1-3-1), the CPU coach's situational calls,
timeouts (with the late advance), substitutions on fouls/fatigue; seats (`st.seats`, two-human
NEUTRAL) and the analog input frame if the second game wants analog walking; presentation
(replay cuts, the inbound camera, calls for the new events); the engine's `package.json` and the
standalone adapter skeleton. Checks: scheme behaviour (press ≥ 90 % when called, zone area
ownership), timeouts, a two-seat replay.

What Scott sees: a basketball game he can coach, and the first running build of the second game
on the same engine.

---

## 7. What carries to the second game

Everything under `engine/`: rules tables, the state machine, roles/coach/offence/defence, the
pass and shot models, the input intents and control profiles, the record, the seats, the
casual-human measurement harness and the dial→hook discipline. What does not carry: `Hoops.jsx`,
`roster.js` (the league), `calls.js` (the Overlord's voice), `replay.js` (HVI's frozen versions),
the kits and the heads. The camera rig carries as a reference implementation; the second game
will want its own presets but the same `proj` export and cut detector.

---

## 8. Consortium

Architect: Fable (this document). Challenger: a fresh Opus subagent with the code and the first
draft, briefed to verify every file:line claim before objecting (Codex is out of usage until
2026-11-04); it read all of `sim.js`, the adapter and the checks and ran four read-only probes
against the live sim. QC: Perplexity (one reasoning call timed out; two grounded passes), plus a
direct read of the NBA 2K25 Xbox manual (`pdftotext`) to settle the two label disputes.

### 8.1 Challenger objections and resolutions

| # | Sev | Objection (verified) | Resolution |
|---|---|---|---|
| 1 | BLOCKING | "One version bump only if the record changes" breaks the replay promise: a tape's result depends on everything `step()` does (`replay` = `newGame` + `step`, 1513-1519; LEVELS read inside the step), so S2, S3 and every dial re-tune would break v5 tapes | Adopted: every shipped behaviour change bumps the version; snapshot before the first behaviour-changing commit of the next; fixture per version (4.12) |
| 2 | BLOCKING | No v4 fixture exists; `replay.js` sends `v >= 4` to the live sim while players hold v4 records | Adopted: S0 cuts `hoops-v4-records.json` and `v4/sim.js` before any file moves |
| 3 | MATERIAL | S1 was three stages in a trench coat; refactor + behaviour change together throws away the bit-identical test | Adopted: S0 (adapter-only), S1a (pure split, v4 fixtures), S1b (v5 behaviour); the analog frame and seats deferred to S4 |
| 4 | MATERIAL | The camera-basis rotation is a no-op in 2K/STEADY/HIGH/SKYBOX (basis = court axes) and misses the real error, perspective slant up to ~35°; `normalize(u.xy + f.xy)` equals `normalize(f.xy)` | Adopted: floor-to-screen `J` at the controlled player, held while the stick is held; camera id logged with the tape (4.8); §1 corrected |
| 5 | MATERIAL | The "cut flag when a preset jumps" never fires (the camera eases); DRIVE swings 180° in ~6 frames through the top-down degenerate case; "until the stick returns to centre" can hold an inverted basis for a full-court sprint | Adopted: yaw-rate detector (> 45° in 12 frames); hold until centre, 30 frames or a 45° stick change; blend |
| 6 | MATERIAL | Rim-relative RS undefined under/behind the rim; moves set court-y velocity (corner crossover OOB 20/20, probe); line awareness covered the stick only | Adopted: `d` fallback inside 1.5 m / past the rim plane; crossover perpendicular to the rim line; awareness applies to moves |
| 7 | MATERIAL | 24-way heading breaks RLE runs and the 3-code spin gesture; atan2 in the engine fails the purity check | Adopted: frame deferred; when built, hysteresis quantiser and a literal cos/sin table in the adapter; RS reduced to 8 sectors in the engine |
| 8 | MATERIAL | Seats under-specified: all per-human state is global; `human()`/`you()` hard-wire team 0; which LEVELS apply with two humans | Adopted: `st.seats[k]`, NEUTRAL for two humans, seats out of S1 (4.13) |
| 9 | MATERIAL | BH1 by "handle+pass among PG/SG" hands the ball to Taylor Swift over Larry Bird, a celebrity over LeBron, Gordon Ramsay over Kareem (probe on the fallback rosters); Jokić's handle 73 clears a flat grab-and-go bar | Adopted: all-five score with a position bonus; relative grab-and-go; real-roster shapes in the harness; a bring-up check on all ten teams |
| 10 | MATERIAL | Who the human controls at a throw-in was unspecified; a BIG inbounder would leave the human waiting 3 s on ROOKIE | Adopted: the human controls BH1 and calls for the ball; controlling the inbounder is an option |
| 11 | MATERIAL | `last2min: 2` makes a whole 2-minute quarter "the last two minutes"; `to21` team fouls never reset (bonus permanent after 4, today too); `swapEnds: 2` fights `P.d`, the render focus, the bot and the checks | Adopted: `lateSecs: 20` for hvi; `to21` resets at 7 and 14; `swapEnds: 0` |
| 12 | MATERIAL | The 4-out-1-in big spot and the off-ball sag target are inside the lane (42 % of frames, probe); defensive 3 s would whistle CPU help | Adopted: block spot (\|dy\| ≥ 2.7), sag outside the lane, lane seconds in the AI, `def3: false` for hvi, offensive 3 s called on the CPU only from S2 |
| 13 | MATERIAL | Turnover targets summed to ~20 % against a 12.1 baseline and the NBA's 13-14 | Adopted: a total budget of 12-15 with a stated mix; existing rates rebalanced inside it |
| 14 | MATERIAL | Lane risk already exists per frame (1199-1213) and matches the spec; deciding at release would be worse; §1/§3 overstated "openness ignored" (true of the human's `passTarget`, not the CPU) | Adopted: per-frame model kept and extended; §1 and rows 19-20 rewritten |
| 15 | MATERIAL | Hold-A ambiguity (skip vs give-and-go) adds lag or is undecidable; "step to the ball" contradicts the kept lead-pass model | Adopted: throw on press, type by geometry, give-and-go by A held at the catch; step-to-ball for standing receivers only |
| 16 | MATERIAL | 100 games per level gives a 5-point standard error against 10-point bands (a true 50 % fails 45-55 a third of the time); the bot moving each stage makes tuning circular; cost is ~20 s a sweep, not the problem; the half-court bands were silently tightened | Adopted: N ≥ 400; the bot's error model fixed before tuning and published per version; half-court bands kept as today until tightened on purpose; a per-frame cost check |
| 17 | MATERIAL | Each stage changes the *meaning* of specific dials (`help` 834, `cut` 819/618, `cpuSteal` 630/847/1206, `steal`, `foul`, `autoD`, `reb`); the 8-second rule never bites (bot median 141-162 frames) | Adopted: the dial→hook table (4.11) with the stage that re-hooks each; the 8-second finding recorded in §3 |
| 18 | MATERIAL | Several §5 targets could not fail: OOB "< 1.0" already met at HOF; help "≥ 70 % (ALL-STAR+)" meaningless at NEUTRAL and the helper test tautological; pass choice 100 % by construction; press-off tripped by a handler driving at his man; "4+ goal-side" impossible in 3v3 | Adopted: OOB ≤ 0.2; help at NEUTRAL with an independent danger score; intended-vs-chosen receiver with the bot's 30° slop; defender-initiated approach excluding 1.5 s after a DREB; n−1 defenders |
| 19 | MINOR | Row 13 cited 964 (that is `function proStick`; the gating is 1021/1044); row 26 said the human "cannot be the inbounder" when 244 + 1485 make him always the inbounder; LT's calibrated effects understated; render.js also imports `dirOf` | Adopted: rows corrected |
| 20 | MINOR | `record.js` inside `engine/` would have to import every frozen version; `check-ads.mjs` imports from `sim.js`; the purity grep scans one file | Adopted: the router stays in the adapter; `check-ads` re-pointed; grep over `engine*/` |
| 21 | MINOR | "pass released" should be "touched inbounds"; the street table lacked the shot clock, foulOut 99, and-one-keeps and the half line | Adopted (4.3, 4.4) |
| 22 | MINOR | atan2 in the adapter is fine; no hidden camera dependence in the sim; a 300-frame hash detects but cannot locate; the buzzer re-run is synchronous | Adopted: literal tables, rolling per-frame hash in debug/verify, a budget for the re-run |

Twelve further defects the challenger found (rows 27-37 of section 3 and the `giveBall`
closeout) were all verified in the code and adopted. Its two "cheap wins" — openness and a lane
penalty in the human's pass target, and RS hands-up / RB icon switch on defence, all on bits that
already exist — moved from S3 into S1b. Nothing was rejected. The challenger's verdict: the
architecture is sound (possession as the unit, rules and coaching as data, camera mapping in
the adapter, a court-space record, a pure engine); what had to change before building was the
version policy, the v4 fixture, the stage split and the camera map. All four are in this revision.

### 8.2 QC findings

- **Rulebook (NBA Rules 5, 7, 8, 10, 12; FIBA 2024):** the end-line run after a made basket, the
  5-second count, the 8-second rule, the 14-second reset after an offensive rebound, the
  "max(remaining, 14)" rule on a frontcourt throw-in after a defensive foul, 7 timeouts / 4 in the
  fourth / 2 per OT / the late advance — confirmed. QC flagged two of the design's phrasings:
  "no running" on a designated-spot throw-in is right as a contrast with the end-line throw-in
  but has rule exceptions (the engine allows a small lateral step on the spot); "a backcourt
  throw-in resets to 24" was sourced from Rule 7 in the research pass but QC could not re-confirm
  it — the table keeps it and marks it to verify against the rulebook text when `rules/nba.js`
  is written. Team-foul penalty thresholds and the 6-foul limit were UNCERTAIN to QC's search
  but are the rulebook's text (research E).
- **2K controls:** 2K21 shot aiming and its removal in 2K22, 2K24 ProPLAY and the four visual
  cues, 2K25 Rhythm Shooting / Shot Timing Profiles / Defensive Movement System / spacing engine,
  2K23's three adrenaline boosts, and the Direction / Distance / Openness pass-target profile —
  confirmed against 2K's own pages. QC marked the two control-layout rows FALSE because the
  manual's button glyphs are images; the manual's text, read directly with `pdftotext`, lists
  Intense Defense (hold), Hands Up (hold), Contest (quickly move and release), Steal, Block,
  Take Charge (hold), Flop (double-tap), Ball Denial, Crowd Dribbler, Deny Hands Out, Double Team
  (hold), Icon Double Team, Fast Shuffle, Player Swap (closest to ball), Icon Swap; and Pass (tap)
  / Skip Pass (press and hold), Bounce (tap) / Flashy (double tap), Get Open Pass (press and
  hold), Lead to Basket (press and hold), Fake Pass, Jump Pass, Give & Go ("press and hold to
  retain control of passer") — the layout in 4.8 stands. 2K26 "Green or Miss" rests on the 2K26
  Courtside Report (research source 18); QC could not re-reach it.
- **Coaching claims** (pick-up point, outlet, trailing inbounder, press as a situational choice)
  rest on the coaching sources in research F; QC's search did not re-confirm them and did not
  contradict them.

---

## 9. Open questions for Scott: answered 2026-10-07

All four are decided. The original options are kept below each answer.

1. **Which camera were you in when the controls felt wrong?** **Answer: the BASELINE / end-on
   views** (up on the stick went sideways). S0 shipped the map for every camera anyway: the 2K side
   cam's perspective slant goes through the same floor-to-screen `J`, and every tape records its
   camera. *(Options were: the default 2K camera / BASELINE or DRIVE / both.)*
2. **Who throws it in after a made basket on your side?** **Answer: a CPU big inbounds and the
   human controls the guard, pressing A to call for it. Being the inbounder is a setting.** This is
   the S1b default (section 4.5 offence, section 6 S1b). *(Options were: the CPU big inbounds, you
   control the receiver / you inbound with A toward the stick / both, as a setting.)*
3. **Which violations get called on you, and when?** **Answer: the ladder by level.** ROOKIE calls
   the 8-second count only; PRO adds over-and-back; ALL-STAR adds 3 seconds; HALL OF FAME calls
   everything. Each step is measured by the casual bot (section 4.11, the `violations` dial).
   *(Options were: everything from S1b at every level / the ladder.)*
4. **When does the engine leave the HVI repo?** **Answer: it stays a directory now
   (`src/play/hoops/engine/`, zero outside imports, enforced by the purity and import checks) and
   becomes a package after S4.** *(Options were: now, as its own package / a directory now and the
   package after S4.)*

## 10. Build log

- **S0, 2026-10-07.** `v4/sim.js` frozen; `scripts/fixtures/hoops-v4-records.json` holds seven
  tapes (the check bot and the casual human; 5v5 quarters and to 21, 3v3, 1v1; every level);
  `replay.js` sends v4 records to the frozen copy. `input.js` reads every stick, key, d-pad, touch
  pad and swipe as a screen direction and turns it into a court direction through `J` at the
  controlled player, choosing the one of the eight court directions **nearest the stick on the
  screen** (rounding `J⁻¹ · stick` on the court would let a screen diagonal round to straight up
  the court, because the floor is foreshortened); `J` is held while the stick is held, with the
  cut detector and blend of 4.8. Measured worst screen error over seven floor spots, eight stick
  directions, both ends: BASELINE 31° (was 125°), DRIVE 18° (was 108°), 2K 25°, BROADCAST 28°,
  STEADY 32°, HIGH 16°, SKYBOX 3°; LOW is 58° at worst for both readings (its floor is nearly
  edge-on far from the camera: the eight-way frame's limit until the analog frame). The record
  carries `cam: {id, adj, controls, changes}`. A STICK setting (pause menu and the camera panel)
  keeps the old court reading.
- **S1a, 2026-10-07.** `sim.js` is gone; the engine is `src/play/hoops/engine/` (VERSION still 4):
  `court`, `state` (the seeded generator and the who-is-human / who-holds / event helpers),
  `levels`, `players` (ratings, positions, the player record), `rules/index` (today's phase
  machine, unchanged), `physics`, `shot`, `pass`, `moves` (dribble moves), `ai/{index, offence,
  defence, rebound, carrier}`, `input/{intents, controls}`, `record`, `game`, and `index.js` (the
  v4 public API). The split was mechanical: every top-level declaration moved whole, nothing
  edited but `export` and the imports. Proof: all seven v4 tapes replay on the engine, and for every
  tape the engine's whole state equals the frozen v4's (`JSON.stringify`) every 120 frames. The
  purity check now walks every file under `engine*/` and fails any import that leaves its engine
  directory. `check-ads.mjs` reads `COURT` from `engine/court.js`. Modules the map names but S1a has
  no code for yet (`ai/roles`, `ai/coach`, `input/assist`, the rules tables) arrive with S1b/S2.
