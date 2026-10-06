// THE TENNIS CLUB, playable (src/play/tennis/): the match sim and the scoring, headless.
//   determinism  a match played from a scripted input log (a bot that reads the court, recorded
//                frame by frame) replays from {seed, version, fmt, opp, inputLog} to the same
//                result, twice; a different seed plays differently; the RLE log round-trips;
//                a record of another version is refused
//   scoring      15/30/40, deuce and advantage both ways, the set to six by two, 7-5, the
//                tiebreak at six-all (to seven by two, its serve order), FIRST TO 4, the calls
//   purity       sim.js and score.js use no clock, no Math.random, no trig
//   roster       the playable figures are the club's tennis players on file (city/tennis.js),
//                slug for slug, rating for rating; the living carry no lines
//   strength     a stronger CPU beats a weaker one, the CPU playing itself
//   broadcast    show.js (crowd, officials, cutaways) is render-only: a match played with the
//                cutaways on (some skipped mid-shot, some left to run) logs the same masks, ends in
//                the same state and replays to the same result as the match with them off; the
//                stand holds no one barred (chess/roster.js barred()), not today's opponent, and
//                no caption quotes anyone; the living get only the neutral lines
//   surfaces     (version 2) the same shot bounces higher and slower on clay than on grass, skids
//                lower and quicker on grass than on hard; hard is version 1's physics exactly; a
//                version-1 record (scripts/fixtures/tennis-v1-record.json, recorded before the
//                surfaces existed) replays to its result; clay and grass matches replay too
//   challenges   (version 3) the judges miss only balls within CALLS.BAND of a line, and only now
//                and then; every call's truth is the margin's sign; a challenge of a wrong call
//                overturns it (the point to whoever the true call favoured, a serve replayed) and
//                costs nothing, a challenge of a right call stands and costs one; three a set, one
//                more in a tiebreak; holding C at the umpire is a warning, the third a point
//                penalty; challenging with none left is a violation; a version-2 record
//                (scripts/fixtures/tennis-v2-record.json, clay, made before challenges) replays to
//                its result; a version-3 match with challenges both ways replays to its own
//   pointer      (version 3) the drag -> the shot (up topspin, down slice, still flat, a big flick
//                up a lob; left / right aims); the packed pointer round-trips; a match played with
//                the mouse (and now and then the keys) replays to its result
//   heads        the sports head cut (src/play/heads.js) takes Scott's head and leaves his pizza
//                peel; every bundled file photo cuts to a head-sized box or to nothing
// Run: node scripts/check-tennis.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/tennis/sim.js");
const SC = await import("../src/play/tennis/score.js");
const R = await import("../src/play/tennis/roster.js");
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };

// ---- scoring ---------------------------------------------------------------------------------
{
  const sc = SC.newScore(SC.FORMATS.set, 0);
  const pts = (seq) => seq.split("").map(c => SC.addPoint(sc, Number(c)));
  pts("00"); assert.equal(SC.callOf(sc), "30-LOVE");
  pts("1"); assert.equal(SC.callOf(sc), "30-15");
  pts("11"); assert.equal(SC.callOf(sc), "30-40");
  pts("0"); assert.equal(SC.callOf(sc), "DEUCE");
  pts("0"); assert.equal(SC.callOf(sc), "AD IN");
  pts("1"); assert.equal(SC.callOf(sc), "DEUCE");
  pts("1"); assert.equal(SC.callOf(sc), "AD OUT");
  assert.deepEqual(sc.games, [0, 0]);
  const [o] = pts("1");
  assert.ok(o.game && !o.set); assert.deepEqual(sc.games, [0, 1]); assert.equal(SC.serverOf(sc), 1, "the serve changes with the game");
  assert.equal(SC.callOf(sc), "LOVE-ALL");
  pts("1"); assert.equal(SC.callOf(sc), "15-LOVE", "the call is the server's first");
  ok("deuce and advantage");
}
const game = (sc, w) => { let o; for (let k = 0; k < 4; k++) o = SC.addPoint(sc, w); return o; };
{
  const sc = SC.newScore(SC.FORMATS.set, 0);
  for (let k = 0; k < 5; k++) { game(sc, 0); game(sc, 1); }
  assert.deepEqual(sc.games, [5, 5]);
  game(sc, 0); assert.ok(!sc.done, "6-5 is not a set");
  const o = game(sc, 0); assert.ok(o.set && o.match && sc.done && sc.winner === 0); assert.deepEqual(sc.sets, [[7, 5]]);
  const s2 = SC.newScore(SC.FORMATS.set, 1);
  for (let k = 0; k < 4; k++) game(s2, 1); game(s2, 0); game(s2, 0); game(s2, 1); game(s2, 1);
  assert.deepEqual(s2.sets, [[2, 6]]); assert.equal(s2.winner, 1);
  ok("sets to six by two");
}
{
  const sc = SC.newScore(SC.FORMATS.set, 0);
  let tbo = null;
  for (let k = 0; k < 6; k++) { game(sc, 0); const o = game(sc, 1); if (o.tiebreak) tbo = o; }
  assert.ok(sc.tb && tbo, "six-all is a tiebreak");
  const first = sc.tbFirst;
  assert.equal(first, 0, "the tiebreak's first server: the player whose turn it was (games alternate from 0)");
  const order = [];
  for (let k = 0; k < 6; k++) { order.push(SC.serverOf(sc)); SC.addPoint(sc, k % 2); }
  assert.deepEqual(order, [0, 1, 1, 0, 0, 1], "one serve, then two each");
  assert.equal(SC.callOf(sc), "3-ALL");
  SC.addPoint(sc, 0); SC.addPoint(sc, 0); SC.addPoint(sc, 0);   // 6-3
  assert.ok(!sc.done);
  SC.addPoint(sc, 1); SC.addPoint(sc, 1); SC.addPoint(sc, 1);   // 6-6
  SC.addPoint(sc, 1); assert.ok(!sc.done, "7-6 in a tiebreak is not won");
  SC.addPoint(sc, 0); SC.addPoint(sc, 0); assert.ok(!sc.done);   // 8-7
  const o = SC.addPoint(sc, 0);   // 9-7
  assert.ok(o.set && o.match); assert.deepEqual(sc.sets, [[7, 6]]); assert.equal(sc.winner, 0);
  const s7 = SC.newScore(SC.FORMATS.set, 1);
  for (let k = 0; k < 6; k++) { game(s7, 0); game(s7, 1); }
  for (let k = 0; k < 7; k++) SC.addPoint(s7, 1);
  assert.deepEqual(s7.sets, [[6, 7]]); assert.equal(s7.winner, 1);
  ok("the tiebreak");
}
{
  const sc = SC.newScore(SC.FORMATS.short, 0);
  for (let k = 0; k < 3; k++) { game(sc, 0); game(sc, 1); }
  assert.ok(!sc.done && !sc.tb);
  game(sc, 1); assert.ok(sc.done); assert.deepEqual(sc.sets, [[3, 4]]);
  ok("first to four");
}

// ---- purity --------------------------------------------------------------------------------------
for (const f of ["sim.js", "score.js", "show.js", "gallery.js"]) {
  const src = readFileSync(new URL(`../src/play/tennis/${f}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.atan", "Math.pow", "Math.exp", "Math.hypot", "document", "window"]) assert.ok(!src.includes(bad), `${f} uses ${bad}`);
}
ok("purity");

// ---- determinism -------------------------------------------------------------------------------
// The bot: it plays from the screen, as a person would (no peeking at the CPU's plan); its masks
// are the record.
function bot(st) {
  const P = st.p[0], b = st.ball, B = S.BTN;
  let m = 0;
  if (st.phase === "serve" && S.serverOfMatch(st) === 0) {
    if (st.sub === "ready") return (st.frame % 50 === 0) ? B.A : 0;
    return b && b.vz < 0 && b.z < 3.05 ? B.A | (st.frame % 3 === 0 ? B.LEFT : 0) : 0;
  }
  if (b && b.live && b.last === 1) {
    const tx = b.x - 0.45 * (b.x >= P.x ? 1 : -1), ty = Math.max(P.y, S.COURT.hl - 0.5);
    if (tx > P.x + 0.2) m |= B.RIGHT; else if (tx < P.x - 0.2) m |= B.LEFT;
    if (ty > P.y + 0.3) m |= B.DOWN;
    const d = Math.sqrt((b.x - P.x) ** 2 + (b.y - P.y) ** 2);
    if (d < 3.2 && b.y > 0 && (b.bounces > 0 || P.y < 6) && P.swing < 0) m |= (st.frame % 7 === 0 ? B.B : B.A) | (st.frame % 2 ? B.UP : 0);
  } else if (Math.abs(P.x) > 0.6) m |= P.x > 0 ? B.LEFT : B.RIGHT;
  return m;
}
function playBot(seed, fmt, key, cap = 60 * 60 * 40) {
  const st = S.newMatch({ seed, fmt, cpu: R.profileOf(key) }), masks = [];
  while (st.phase !== "over" && st.frame < cap) { const m = bot(st); masks.push(m); S.step(st, m); }
  return { rec: { version: S.VERSION, seed, fmt, opp: key, inputLog: S.rleEncode(masks), result: S.resultOf(st) }, masks, st };
}
{
  const a = playBot(12345, "short", "line-judge");
  assert.ok(a.rec.result.done, "the bot's match finishes");
  assert.deepEqual(S.rleDecode(a.rec.inputLog), a.masks, "RLE round-trips");
  assert.ok(a.rec.inputLog.length < a.masks.length, "RLE is shorter than the frames");
  const r1 = S.replay(a.rec, R.profileOf("line-judge")), r2 = S.replay(JSON.parse(JSON.stringify(a.rec)), R.profileOf("line-judge"));
  assert.deepEqual(r1, a.rec.result, "replay 1 = the live result");
  assert.deepEqual(r2, a.rec.result, "replay 2 = the live result (through JSON)");
  assert.ok(a.rec.result.pts[0] > 0, "the bot wins some points (it is actually hitting)");
  const b = playBot(54321, "short", "line-judge");
  assert.notDeepEqual(b.rec.result, a.rec.result, "another seed, another match");
  const c = playBot(777, "set", "serena-williams");
  assert.deepEqual(S.replay(c.rec, R.profileOf("serena-williams")), c.rec.result, "a set against the top seed replays");
  // a tampered log does not reproduce a claimed result (the later server check's premise)
  const t = JSON.parse(JSON.stringify(a.rec)); t.inputLog[1] += 3;
  assert.notDeepEqual(S.replay(t, R.profileOf("line-judge")), a.rec.result, "a doctored log does not reproduce the claim");
  assert.throws(() => S.replay({ ...a.rec, version: S.VERSION + 1 }, R.profileOf("line-judge")), /version/);
  ok(`determinism (bot v line judge ${a.rec.result.sets[0].join("-")}, ${a.rec.result.frames} frames, log ${a.rec.inputLog.length / 2} runs)`);
}

// ---- roster ------------------------------------------------------------------------------------
{
  const { TENNIS_ON_FILE } = await import("../src/city/tennis.js");
  const figs = R.OPPONENTS.filter(o => !o.regular);
  assert.deepEqual(figs.map(o => [o.key, o.rating]).sort(), TENNIS_ON_FILE.map(([k, , r]) => [k, r]).sort(), "the figures are the club's players on file");
  for (const o of R.OPPONENTS) {
    for (const mo of ["start", "win", "lose"]) {
      const t = R.talkFor(o, mo, 0);
      if (!o.died) assert.ok(!t || t.kind === "act", `${o.key} is living and does not speak`);
    }
    assert.ok(R.profileOf(o.key).speed > 0);
  }
  assert.equal(R.talkFor(R.OPP_BY_KEY.get("arthur-ashe"), "start").kind, "say");
  ok("roster");
}

// ---- strength ----------------------------------------------------------------------------------
{
  let strong = 0;
  for (const seed of [1, 2, 3]) {
    const st = S.newMatch({ seed, fmt: "short", cpu: S.cpuProfile(40), auto: S.cpuProfile(98) });
    while (st.phase !== "over" && st.frame < 60 * 60 * 60) S.step(st, 0);
    assert.equal(st.phase, "over", "CPU v CPU finishes");
    if (st.sc.winner === 0) strong++;
  }
  assert.ok(strong >= 2, `98 beats 40 (${strong}/3)`);
  // the first-timer's opponent (PLAY NOW): weaker than the floor of the scale. A rating-30 CPU,
  // the slowest cpuProfile makes, takes more points off it than off the line judge.
  const easy = R.profileOf(R.EASIEST);
  assert.ok(easy && easy.speed < S.cpuProfile(0).speed && easy.react > S.cpuProfile(0).react, "the new member is slower than the scale's floor");
  const ptsOff = (cpu) => { let w = 0, t = 0; for (const seed of [4, 5, 6]) { const st = S.newMatch({ seed, fmt: "short", cpu, auto: S.cpuProfile(30) }); while (st.phase !== "over" && st.frame < 60 * 60 * 60) S.step(st, 0); w += st.won[0]; t += st.won[0] + st.won[1]; } return w / t; };
  const vsEasy = ptsOff(easy), vsJudge = ptsOff(R.profileOf("line-judge"));
  assert.ok(vsEasy > vsJudge, `more points off the new member (${vsEasy.toFixed(2)}) than off the line judge (${vsJudge.toFixed(2)})`);
  ok("strength");
}

// ---- broadcast ---------------------------------------------------------------------------------
{
  const SH = await import("../src/play/tennis/show.js");
  const G = await import("../src/play/tennis/gallery.js");
  const { barred } = await import("../src/chess/roster.js");
  const { FAMOUS_FIGURES, slugify } = await import("../src/figures.js");
  const names = ["SUBJECT", "A LINE JUDGE ON A DAY OFF"];
  // The page's loop, headless: one 60 Hz slot at a time; the broadcast decides whether the sim
  // steps. During a cutaway a viewer's hands (not the bot's) are on the pad: every other cutaway
  // is skipped with A, held through the release; the rest run their length.
  function playShow(seed, fmt, key, cutaways) {
    const st = S.newMatch({ seed, fmt, cpu: R.profileOf(key) });
    const show = SH.createShow({ seed, names, opp: key, cutaways, st });
    const masks = [];
    let slots = 0;
    while (st.phase !== "over" && slots < 60 * 60 * 60) {
      slots++;
      let m;
      if (show.busy()) { const age = show.cutAge(), n = show.state.cuts; m = n % 2 && age >= 40 && age < 70 ? S.BTN.A : 0; }
      else m = bot(st);
      if (show.slot(st, m)) { masks.push(m); S.step(st, m); show.observe(st); }
    }
    return { st, masks, show, slots };
  }
  for (const [seed, fmt, key] of [[12345, "short", "line-judge"], [2024, "short", "club-pro"]]) {
    const off = playShow(seed, fmt, key, false), on = playShow(seed, fmt, key, true);
    assert.equal(off.show.state.cuts, 0, "cutaways off: none shown");
    assert.ok(on.show.state.cuts >= 2, `cutaways on: some shown (${on.show.state.cuts})`);
    assert.ok(on.show.state.skips >= 1, "some cutaways skipped with a button");
    assert.ok(on.slots > on.masks.length, "the match was held during the cutaways");
    assert.deepEqual(on.masks, off.masks, "the same masks reach the sim, cutaways or not");
    assert.deepEqual(S.resultOf(on.st), S.resultOf(off.st), "the same result, cutaways or not");
    assert.equal(JSON.stringify({ ...on.st, ev: [] }), JSON.stringify({ ...off.st, ev: [] }), "the same final state, cutaways or not");
    const rec = { version: S.VERSION, seed, fmt, opp: key, inputLog: S.rleEncode(on.masks), result: S.resultOf(on.st) };
    assert.deepEqual(S.replay(rec, R.profileOf(key)), rec.result, "the cutaway match replays from its log");
    if (seed === 12345) assert.deepEqual(rec.result, playBot(12345, "short", "line-judge").rec.result, "and equals the bare bot match");
  }
  // the chair's words
  {
    const st = S.newMatch({ seed: 1, fmt: "set", cpu: R.profileOf("club-pro") });
    st.sc.gameServer = 0; st.sc.pts = [3, 3];
    assert.equal(SH.spoken(st, names, "AD IN"), "ADVANTAGE SUBJECT.");
    assert.equal(SH.spoken(st, names, "AD OUT"), "ADVANTAGE A LINE JUDGE ON A DAY OFF.");
    assert.equal(SH.spoken(st, names, "15-LOVE"), "FIFTEEN-LOVE.");
    assert.equal(SH.spoken(st, names, "30-ALL"), "THIRTY-ALL.");
    st.lastWinner = 1; assert.equal(SH.spoken(st, names, "GAME AND SET"), "GAME AND SET, A LINE JUDGE ON A DAY OFF.");
  }
  // who may be in the stand, and what may be said
  for (const opp of ["serena-williams", "arthur-ashe", "club-pro"]) {
    const pool = G.spectators(opp), slugs = new Set(pool.map(p => p.slug));
    assert.ok(!slugs.has(opp), `${opp} is on court, not in the stand`);
    for (const f of FAMOUS_FIGURES) if (barred(f)) assert.ok(!slugs.has(slugify(f.name)), `${f.name} is barred from the stand`);
    assert.ok(pool.length > 30, "a full stand");
    for (const f of FAMOUS_FIGURES) assert.equal(G.barred(f), barred(f), `the stand's bar is the park's: ${f.name}`);
    for (const p of pool) {
      for (const note of G.allNotesFor(p)) {
        assert.ok(!/["\u201c\u201d]|\bSAYS?\b|\bSAID\b/.test(note), `no quotes: ${p.slug}: ${note}`);
        assert.ok(!note.includes("{"), `filled: ${note}`);
        if (!p.died) assert.ok(G.LIVING_NOTES.map(l => l.replace("{T}", p.tier || "UNASSIGNED")).includes(note) || p.tennis, `${p.slug} is living: neutral lines only (${note})`);
      }
    }
  }
  ok("broadcast");
}

// ---- surfaces ------------------------------------------------------------------------------------
{
  const hard = S.bounceOf("hard"), clay = S.bounceOf("clay"), grass = S.bounceOf("grass");
  assert.ok(clay.peak > grass.peak && clay.peak > hard.peak, `clay bounces higher (${clay.peak.toFixed(2)} m) than hard (${hard.peak.toFixed(2)}) and grass (${grass.peak.toFixed(2)})`);
  assert.ok(clay.pace < hard.pace && hard.pace < grass.pace, `off the bounce: clay slowest (${clay.pace.toFixed(1)} m/s), hard (${hard.pace.toFixed(1)}), grass fastest (${grass.pace.toFixed(1)})`);
  assert.ok(grass.peak < hard.peak, "grass skids lower than hard");
  assert.ok(clay.base > hard.base && hard.base >= grass.base, `the receiver's time: clay ${clay.base}, hard ${hard.base}, grass ${grass.base} frames`);
  const hs = S.bounceOf("hard", "slice"), cs = S.bounceOf("clay", "slice"), cd = S.bounceOf("clay", "drive");
  assert.ok(cd.peak - cs.peak > hard.peak - hs.peak, "spin does more on clay: topspin kicks further above slice");
  assert.deepEqual(S.bounceOf("clay", "drive", 1), hard, "a version-1 match is a hard court whatever it asks for");
  // the record of version 1, made before the surfaces existed, plays to its own result
  const v1 = JSON.parse(readFileSync(new URL("./fixtures/tennis-v1-record.json", import.meta.url), "utf8"));
  assert.equal(v1.version, 1);
  assert.deepEqual(S.replay(v1, R.profileOf(v1.opp)), v1.result, "the version-1 record replays to its result");
  assert.deepEqual(S.replay(JSON.parse(JSON.stringify(v1)), R.profileOf(v1.opp)), v1.result, "twice");
  assert.deepEqual(S.replay({ ...v1, version: 2, surface: "hard" }, R.profileOf(v1.opp)), v1.result, "version 2's hard court is version 1's");
  assert.notDeepEqual(S.replay({ ...v1, version: 2, surface: "clay" }, R.profileOf(v1.opp)), v1.result, "the same hands on clay play another match");
  // clay and grass matches replay; the surface is part of the record
  for (const surface of ["clay", "grass"]) {
    const st = S.newMatch({ seed: 99, fmt: "short", cpu: R.profileOf("club-pro"), surface }), masks = [];
    assert.equal(st.surface, surface);
    while (st.phase !== "over" && st.frame < 60 * 60 * 40) { const m = bot(st); masks.push(m); S.step(st, m); }
    assert.ok(st.phase === "over", `the ${surface} match finishes`);
    const rec = { version: S.VERSION, seed: 99, fmt: "short", surface, opp: "club-pro", inputLog: S.rleEncode(masks), result: S.resultOf(st) };
    assert.deepEqual(S.replay(rec, R.profileOf("club-pro")), rec.result, `a ${surface} match replays`);
    assert.deepEqual(S.replay(JSON.parse(JSON.stringify(rec)), R.profileOf("club-pro")), rec.result, `a ${surface} match replays through JSON`);
    if (surface === "clay") assert.ok(st.p.some(P => "slide" in P), "clay players carry a slide");
  }
  // CPU v CPU finishes on every court
  for (const surface of ["clay", "grass"]) {
    const st = S.newMatch({ seed: 7, fmt: "short", cpu: S.cpuProfile(60), auto: S.cpuProfile(60), surface });
    while (st.phase !== "over" && st.frame < 60 * 60 * 60) S.step(st, 0);
    assert.equal(st.phase, "over", `CPU v CPU finishes on ${surface}`);
  }
  ok(`surfaces (peak clay ${clay.peak.toFixed(2)} / hard ${hard.peak.toFixed(2)} / grass ${grass.peak.toFixed(2)} m; pace ${clay.pace.toFixed(1)} / ${hard.pace.toFixed(1)} / ${grass.pace.toFixed(1)} m/s)`);
}

// ---- challenges (version 3) -----------------------------------------------------------------------
{
  const { BAND, CH_CLOSE, PER_SET, HOLD } = S.CALLS;
  // the version-2 record, made before the judges could be wrong, still plays to its result
  const v2 = JSON.parse(readFileSync(new URL("./fixtures/tennis-v2-record.json", import.meta.url), "utf8"));
  assert.equal(v2.version, 2); assert.equal(v2.surface, "clay");
  assert.deepEqual(S.replay(v2, R.profileOf(v2.opp)), v2.result, "the version-2 record replays to its result");
  assert.deepEqual(S.replay(JSON.parse(JSON.stringify(v2)), R.profileOf(v2.opp)), v2.result, "twice");
  assert.notDeepEqual(S.replay({ ...v2, version: 3 }, R.profileOf(v2.opp)), v2.result, "the same hands under version 3's judges play another match");
  // the judges: wrong only within the band; each call's truth is the margin's sign
  let mis = 0, calls = 0, ch = 0, over = 0, stood = 0;
  for (const [seed, surface] of [[1, "hard"], [2, "grass"], [3, "clay"], [4, "hard"]]) {
    const st = S.newMatch({ seed, fmt: "set", cpu: S.cpuProfile(70), auto: R.profileOf("john-mcenroe"), surface });
    while (st.phase !== "over" && st.frame < 60 * 60 * 90) {
      const before = st.chLeft.slice();
      S.step(st, 0);
      if ((st.ev.includes("point") || st.ev.includes("fault")) && st.chal) {
        const c = st.chal; calls++;
        assert.equal(c.truth, c.m >= 0, `the truth is the margin's sign (${c.m})`);
        assert.ok(Math.abs(c.m) < CH_CLOSE, "only close calls open a challenge");
        if (c.called !== c.truth) assert.ok(Math.abs(c.m) < BAND, `a miscall ${c.m} m off the line`);
      }
      if (st.ev.includes("challenge")) ch++;
      if (st.ev.includes("review")) {
        const c = st.chal;
        assert.equal(c.overturned, c.called !== c.truth, "a review overturns exactly the wrong calls");
        if (c.overturned) {
          over++;
          if (c.outcome === "point") assert.equal(st.lastWinner, c.truth ? c.hitter : 1 - c.hitter, "the point goes where the true call sends it");
          if (c.serve) assert.ok(c.called ? ["fault", "point"].includes(c.outcome) : c.outcome === "replay", `a serve's overturn: ${c.called ? "good, was out: a fault" : "a fault, was good: replayed"} (${c.outcome})`);
          if (c.outcome === "fault") { assert.equal(st.serveNo, 2); assert.equal(st.after, "serve2"); }
        }
        else { stood++; assert.equal(st.chLeft[c.by], before[c.by] - 1, "a call that stands costs a challenge"); }
        if (c.overturned && !st.ev.includes("game")) assert.equal(st.chLeft[c.by], before[c.by], "a right challenge costs nothing");
      }
    }
    assert.equal(st.phase, "over", "a match with challenges finishes");
    for (const mm of st.mis) assert.ok(Math.abs(mm) < BAND * 1000, `miscall at ${mm} mm`);
    mis += st.mis.length;
  }
  assert.ok(mis >= 3, `the judges miss some (${mis})`);
  assert.ok(ch >= 4 && over >= 1 && stood >= 1, `challenges made ${ch}, overturned ${over}, stood ${stood}`);
  // the human's challenges: the bot challenges every close call against it, then is replayed
  const chalBot = (st) => (S.canChallenge(st, 0) && st.frame === st.chal.frame + 30 ? S.BTN.C : bot(st));
  let hum = { over: 0, stood: 0, none: 0 };
  for (let seed = 11; seed < 60; seed++) {
    const st = S.newMatch({ seed, fmt: "set", cpu: R.profileOf("club-pro"), surface: "grass" }), masks = [];
    while (st.phase !== "over" && st.frame < 60 * 60 * 90) {
      const m = chalBot(st); masks.push(m); S.step(st, m);
      if (st.ev.includes("review") && st.chal.by === 0) st.chal.overturned ? hum.over++ : hum.stood++;
      if (st.ev.includes("violation")) hum.none++;
    }
    const rec = { version: S.VERSION, seed, fmt: "set", surface: "grass", win: st.win, opp: "club-pro", inputLog: S.rleEncode(masks), result: S.resultOf(st) };
    assert.deepEqual(S.replay(rec, R.profileOf("club-pro")), rec.result, "a version-3 match with challenges replays");
    assert.deepEqual(S.replay(JSON.parse(JSON.stringify(rec)), R.profileOf("club-pro")), rec.result, "through JSON");
    if (hum.over && hum.stood && seed >= 13) { hum.seeds = seed - 10; break; }
  }
  assert.ok(hum.over >= 1 && hum.stood >= 1, `the human's challenges: ${JSON.stringify(hum)}`);
  // the review is the broadcast's: it holds the match (nothing logged) and changes nothing
  {
    const SH = await import("../src/play/tennis/show.js");
    const bare = (() => { const st = S.newMatch({ seed: 12, fmt: "set", cpu: R.profileOf("club-pro"), surface: "grass" }), m = []; while (st.phase !== "over" && st.frame < 60 * 60 * 90) { const k = chalBot(st); m.push(k); S.step(st, k); } return { st, m }; })();
    const st = S.newMatch({ seed: 12, fmt: "set", cpu: R.profileOf("club-pro"), surface: "grass" });
    const show = SH.createShow({ seed: 12, names: ["SUBJECT", "THE CLUB PRO"], formal: ["MR./MS. SUBJECT", "THE CLUB PRO"], opp: "club-pro", cutaways: false, st });
    const masks = []; let slots = 0, said = 0;
    while (st.phase !== "over" && slots < 60 * 60 * 120) {
      slots++;
      const m = show.busy() ? 0 : chalBot(st);
      if (show.slot(st, m)) { masks.push(m); S.step(st, m); show.observe(st); if (show.state.bubble?.text.includes("IS CHALLENGING THE CALL.")) said++; }
    }
    assert.ok(show.state.reviews >= 2, `reviews shown (${show.state.reviews})`);
    assert.ok(said > 0, "the chair announces the challenge");
    assert.ok(slots >= masks.length + show.state.reviews * SH.REVIEW.LEN, "the match was held through each review");
    assert.deepEqual(masks, bare.m, "the same masks reach the sim, reviews or not");
    assert.deepEqual(S.resultOf(st), S.resultOf(bare.st), "the same result");
    assert.equal(SH.measured(-0.003).short, "OUT BY 3 MM");
    assert.equal(SH.measured(-0.003).long, "THE BALL WAS OUT BY 3 MILLIMETRES");
    assert.equal(SH.measured(-0.0004).short, "OUT BY 1 MM", "never out by nothing");
    assert.equal(SH.measured(0.02).short, "IN \u2014 TOUCHING THE LINE");
    assert.equal(SH.measured(0.13).short, "IN BY 20 MM");
  }
  // after the window closes, C does nothing
  {
    const st = S.newMatch({ seed: 11, fmt: "set", cpu: R.profileOf("club-pro"), surface: "grass" });
    let seen = false;
    while (st.phase !== "over" && st.frame < 60 * 60 * 30 && !seen) {
      S.step(st, bot(st));
      if (S.canChallenge(st, 0)) {
        while (st.frame <= st.chal.until) S.step(st, 0);
        assert.ok(!S.canChallenge(st, 0), "the window closes");
        const left = st.chLeft[0]; S.step(st, S.BTN.C);
        assert.ok(!st.ev.includes("challenge") && st.chLeft[0] === left && st.viol[0] === 0, "a late C is nothing");
        seen = true;
      }
    }
    assert.ok(seen, "a window opened for the human");
  }
  // the tone: C held at the umpire, twice a warning, the third time a point
  {
    const st = S.newMatch({ seed: 5, fmt: "short", cpu: R.profileOf("club-pro") });
    const hold = () => { for (let k = 0; k < HOLD; k++) S.step(st, S.BTN.C); S.step(st, 0); };
    hold(); assert.deepEqual(st.viol, [1, 0], "a warning");
    hold(); assert.deepEqual(st.viol, [2, 0], "a second warning");
    const w1 = st.won[1]; hold();
    assert.equal(st.viol[0], 3);
    for (let k = 0; k < 60 && !st.ev.includes("penalty"); k++) S.step(st, 0);
    assert.equal(st.won[1], w1 + 1, "the third: a point penalty");
    assert.equal(st.call, "POINT PENALTY");
  }
  // the allowance: three a set, one more in a tiebreak, three again with the next set
  {
    const st = S.newMatch({ seed: 1, fmt: "set", cpu: R.profileOf("club-pro") });
    assert.deepEqual(st.chLeft, [PER_SET, PER_SET]);
    st.sc.games = [6, 5]; st.chLeft = [0, 2];
    for (let k = 0; k < 4; k++) S.award(st, 1);
    assert.ok(st.sc.tb, "six-all"); assert.deepEqual(st.chLeft, [1, 3], "one more each in the tiebreak");
    st.sc.fmt = { ...st.sc.fmt, setsToWin: 2 };
    for (let k = 0; k < 7; k++) S.award(st, 0);
    assert.equal(st.sc.sets.length, 1); assert.deepEqual(st.chLeft, [PER_SET, PER_SET], "three again with the set");
  }
  ok(`challenges (${mis} miscalls in 4 sets; CPU challenges ${ch}: ${over} overturned, ${stood} stood; the bot's ${JSON.stringify(hum)})`);
}

// ---- pointer (version 3) ---------------------------------------------------------------------------
{
  assert.deepEqual(S.gestureShot(0, -1), { kind: "A", shot: "drive", aimX: 0, aimD: 0 }, "drag up: topspin");
  assert.equal(S.gestureShot(0, -2).shot, "drive"); assert.equal(S.gestureShot(0, -2).aimD, 1, "further up: deeper topspin");
  assert.deepEqual(S.gestureShot(0, 2), { kind: "B", shot: "slice", aimX: 0, aimD: -1 }, "drag down: slice");
  assert.equal(S.gestureShot(0, 0).shot, "flat", "still: flat");
  assert.equal(S.gestureShot(0, -3).shot, "lob", "a big flick up: lob");
  assert.equal(S.gestureShot(2, -1).aimX, 1); assert.equal(S.gestureShot(-1, 1).aimX, -1, "left / right aims");
  assert.equal(S.gestureServe(0, -2).spin, "kick"); assert.equal(S.gestureServe(0, 2).spin, "sserve"); assert.equal(S.gestureServe(1, 0).aimX, 1);
  const pb = S.ptrBits(-3.27, 11.94, 2, -3);
  assert.ok(pb > 0 && pb < 2 ** 30 && pb & S.BTN.PTR, "a positive 30-bit mask");
  assert.deepEqual(S.ptrOf(pb), { x: -3.3, y: 11.9, gx: 2, gy: -3 }, "the pointer round-trips to 10 cm");
  assert.equal(S.ptrOf(S.BTN.A), null);
  // the spins differ where they bounce: a topspin drive kicks up, a slice stays low (the court's own physics)
  const dr = S.bounceOf("hard", "drive"), fl = S.bounceOf("hard", "flat"), sl = S.bounceOf("hard", "slice");
  assert.ok(dr.peak > sl.peak && fl.pace > sl.pace, "topspin kicks higher than slice; flat keeps more pace than slice");
  // a mouse match: press on the court where the ball is going, hold, release as it arrives; the
  // drag cycles through the shots; every third point is played with the keys instead
  const G = [[0, -1], [0, 1], [0, 0], [1, -2], [-1, 0], [0, -3], [-1, 1]];
  const shots = new Set();
  function mouseBot(st) {
    const P = st.p[0], b = st.ball, B = S.BTN, g = G[(st.frame >> 7) % G.length];
    if (st.phase === "serve" && S.serverOfMatch(st) === 0) {
      if (st.sub === "ready") return st.frame % 50 < 4 ? S.ptrBits(P.x, P.y, g[0], g[1]) : 0;
      return b && b.vz < 0 && b.z < 3.05 ? 0 : S.ptrBits(P.x, P.y, g[0], g[1]);
    }
    if (b && b.live && b.last === 1) {
      if ((st.won[0] + st.won[1]) % 3 === 2) return bot(st);
      const d = Math.sqrt((b.x - P.x) ** 2 + (b.y - P.y) ** 2);
      if (d < 1.5 && b.y > 0 && (b.bounces > 0 || P.y < 6) && P.swing < 0) return 0;   // release: swing
      // where to run: where the ball will be after its bounce, at a hitting height (read from the flight, as a player would)
      const c = { ...b };
      for (let k = 0; k < 240 && !(c.bounces >= 1 && c.z < 1.2 && c.vz < 0) && c.y < S.COURT.hl + 3; k++) S.ballStep(c);
      return S.ptrBits(c.x - 0.45 * (c.x >= P.x ? 1 : -1), Math.max(1, Math.min(c.y, S.COURT.hl + 2)), g[0], g[1]);
    }
    return 0;
  }
  const play = (seed) => {
    const st = S.newMatch({ seed, fmt: "short", cpu: R.profileOf("line-judge") }), masks = [];
    while (st.phase !== "over" && st.frame < 60 * 60 * 40) {
      const m = mouseBot(st); masks.push(m); S.step(st, m);
      if (st.p[0].gest && st.p[0].swing === 1) shots.add(st.p[0].gest.shot);
    }
    return { st, rec: { version: S.VERSION, seed, fmt: "short", win: st.win, opp: "line-judge", inputLog: S.rleEncode(masks), result: S.resultOf(st) }, masks };
  };
  const a = play(31);
  assert.ok(a.rec.result.done, "the mouse match finishes");
  assert.ok(a.rec.result.pts[0] > 0, "the mouse wins points");
  assert.ok(a.masks.some(m => m & S.BTN.PTR) && a.masks.some(m => m & S.BTN.A), "the pointer and the keys in one match");
  assert.ok(["drive", "slice", "flat", "lob"].every(k => shots.has(k)), `every shot from the drag (${[...shots]})`);
  assert.deepEqual(S.rleDecode(a.rec.inputLog), a.masks, "the pointer's masks round-trip the RLE");
  assert.deepEqual(S.replay(a.rec, R.profileOf("line-judge")), a.rec.result, "a mouse match replays");
  assert.deepEqual(S.replay(JSON.parse(JSON.stringify(a.rec)), R.profileOf("line-judge")), a.rec.result, "through JSON");
  ok(`pointer (mouse match ${a.rec.result.sets[0].join("-")}, ${a.rec.inputLog.length / 2} runs)`);
}

// ---- heads ---------------------------------------------------------------------------------------
{
  const { decodePng } = await import("./sprite-atlas.mjs");
  const { cutHead } = await import("../src/play/heads.js");
  const { readdirSync } = await import("node:fs");
  const dir = new URL("../public/sprites/", import.meta.url);
  const sheet = (f) => { const p = decodePng(readFileSync(new URL(f, dir))); return p && p.w >= 32 && p.h >= 48 ? p : null; };
  // Scott carries a pizza peel to his left (columns 2-12 of the photo); his head is columns 13-24
  const sc = sheet("scott.png"), cut = cutHead(sc.rgba, sc.w * 4);
  assert.ok(cut, "Scott has a head");
  assert.ok(cut.x0 >= 12 && cut.x0 + cut.w <= 26, `Scott's head is cut from his head, not his peel (x ${cut.x0}-${cut.x0 + cut.w - 1})`);
  let peel = 0;
  for (let y = 0; y < cut.h; y++) for (let x = 0; x < cut.w; x++) if (cut.keep[y * cut.w + x] && cut.x0 + x <= 12) peel++;
  assert.equal(peel, 0, "no peel in Scott's head");
  let n2 = 0;
  for (const f of readdirSync(dir).filter(f => f.endsWith(".png"))) {
    const p = sheet(f); if (!p) continue;
    const c = cutHead(p.rgba, p.w * 4); n2++;
    if (c) assert.ok(c.w <= 17 && c.h <= 12 && c.h >= 6, `${f}: a head-sized cut (${c.w} x ${c.h})`);
  }
  assert.ok(n2 > 20, "the bundled photos were cut");
  ok(`heads (${n2} photos; Scott's peel left behind)`);
}

console.log(`check-tennis: ${n} groups OK`);
