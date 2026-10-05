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

console.log(`check-tennis: ${n} groups OK`);
