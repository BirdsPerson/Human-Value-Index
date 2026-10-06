// THE OPEN TOURNAMENTS (docs/TOURNAMENTS.md): the calendar is deterministic and keeps its windows in
// city time; the replay check accepts a genuine card and refuses a doctored one, another event's seed,
// another division's assists; permits are bound to the file, the event, the attempt and the division;
// one official result per leg of an attempt; the boards order and break ties deterministically,
// projected while open and final after; the window is enforced; the purge strikes the name; the
// prizes are delivered once (a line on the file, a trophy into the ledger, no CYCLES).
// Run: node scripts/check-tournament.mjs
import { registerHooks } from "node:module";

// ---- in-memory @netlify/blobs --------------------------------------------------------------------------
globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log(`  FAIL ${msg}`); } };
const realNow = Date.now;
let NOW = null;
Date.now = () => NOW ?? realNow();

const C = await import("../src/tournament/calendar.js");
const R = await import("../src/tournament/rules.js");
const V = await import("../netlify/lib/tournament-verify.js");
const T = await import("../netlify/lib/tournament-store.js");
const A = await import("../netlify/lib/tournament-awards.js");
const GOLF = await import("../src/play/golf/sim.js");
const BOWL = await import("../src/play/bowling/sim.js");
const FISH = await import("../src/play/fish/sim.js");
const E = await import("../netlify/lib/economy-db.js");
const SH = await import("../src/economy/shops.js");
const { pieceOf } = await import("../src/city/furniture.js");
const handler = (await import("../netlify/functions/tournament.js")).default;
const purge = (await import("../netlify/functions/purge.js")).default;

// ---- 1. the calendar ------------------------------------------------------------------------------------
{
  const from = Date.UTC(2026, 9, 6), to = Date.UTC(2026, 11, 20);
  const a = C.eventsBetween(from, to), b = C.eventsBetween(from, to);
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length > 100, "the calendar is the same every time it is computed");
  ok(a.every(e => JSON.stringify(C.eventById(e.id)) === JSON.stringify(e)), "every event is recomputed from its id alone");
  ok(new Set(a.map(e => e.id)).size === a.length, "event ids are unique");
  ok(a.every(e => e.opens < e.closes && e.href === `${C.GAME_PAGE[e.game]}?t=${e.id}`), "every window opens before it closes, every event links to its game");
  const wall = (ms) => C.wallOf(ms);
  const dailies = a.filter(e => e.kind === "daily");
  ok(dailies.every(e => wall(e.opens).h === 0 && wall(e.closes).h === 0 && C.cityDate(e.opens) === e.id.slice(-10)), "THE DAILY: midnight to midnight, city time");
  const dst = C.eventById("golf-daily-2026-11-01");
  ok(dst.closes - dst.opens === 25 * 3600000, "the day the clocks go back is 25 hours long (the window is in city time)");
  const majors = a.filter(e => e.kind === "major");
  ok(majors.length >= 10 && majors.every(e => new Date(Date.parse(e.id.slice(-10))).getUTCDay() === 5 && C.cityDate(e.closes - 1) === new Date(Date.parse(e.id.slice(-10)) + 2 * 86400000).toISOString().slice(0, 10) && e.cond.count === 18 && e.cond.course === "open"), "THE WEEKEND MAJOR: Friday to Sunday, eighteen at THE DEPARTMENT OPEN");
  ok(majors[0].name === "THE COMPLIANCE CLASSIC" && new Set(majors.slice(0, 8).map(e => e.name)).size === 8, "the majors rotate through the Department's names, THE COMPLIANCE CLASSIC first");
  const leagues = a.filter(e => e.kind === "league");
  ok(leagues.length > 15 && leagues.every(e => [2, 4].includes(new Date(Date.parse(e.id.slice(-10))).getUTCDay()) && wall(e.opens).h === 18 && wall(e.closes).h === 0 && e.legs === 3 && !e.lower), "LEAGUE NIGHT: Tuesdays and Thursdays, 18:00 to midnight, three games, total pins");
  const champs = a.filter(e => e.kind === "championship");
  ok(champs.some(e => e.id === "golf-champ-s23") && champs.find(e => e.id === "golf-champ-s23").closes === Date.UTC(2026, 10, 5, 6, 24) && champs.every(e => e.closes - e.opens === 3 * 86400000), "THE SEASON CHAMPIONSHIPS: the last 72 hours of the month-long season");
  ok(C.eventById("golf-major-2026-10-08") === null && C.eventById("bowl-league-2026-10-07") === null && C.eventById("golf-daily-2026-02-30") === null && C.eventById("nope") === null, "an id the calendar never made is no event");
  ok(C.seedOf("golf-daily-2026-10-06") === C.seedOf("golf-daily-2026-10-06") && C.seedOf("golf-daily-2026-10-06") !== C.seedOf("golf-daily-2026-10-07") && C.seedOf("x", 0) !== C.seedOf("x", 1), "one seed per event and leg, the same for everyone");
  const t = Date.UTC(2026, 9, 9, 16);
  ok(C.liveGames(t).has("golf") && [...C.openAt(t)].some(e => e.kind === "major"), "on a Friday the major is live");
}

// ---- 2. the replay check ----------------------------------------------------------------------------------
const evG = C.eventById("golf-daily-2026-10-06"), evM = C.eventById("golf-major-2026-10-09"), evB = C.eventById("bowl-league-2026-10-06"), evF = C.eventById("fish-derby-2026-10-11");
const golfRound = (ev, div) => { const cfg = { ...R.golfCfg(ev, div), v: GOLF.VERSION }; const a = GOLF.autoplay(cfg); return { log: a.log, claim: { total: a.st.result.total[0], holes: a.st.result.holes.map(h => h.s[0]) }, ticks: a.st.tick }; };
const g1 = golfRound(evG, "open");
{
  const v = V.golf.verify(evG, 0, "open", { inputLog: g1.log, claim: g1.claim, v: GOLF.VERSION });
  ok(v.ok && v.leg.total === g1.claim.total && v.leg.par === GOLF.cardOf(GOLF.newRound(R.golfCfg(evG, "open"))).rows.reduce((s, r) => s + r.par, 0) && v.leg.tb.length === 3, "golf: a genuine card verifies (total, par, the countback)");
  ok(!V.golf.verify(evG, 0, "open", { inputLog: g1.log, claim: { ...g1.claim, total: g1.claim.total - 1, holes: g1.claim.holes.map((s, i) => (i ? s : s - 1)) } }).ok, "golf: a doctored claim fails");
  const d = g1.log.slice(); for (let i = 0; i < d.length; i += 2) if (typeof d[i] === "number" && d[i] === 0 && d[i + 1] > 40) { d[i + 1] += 7; break; }
  const dv = V.golf.verify(evG, 0, "open", { inputLog: d, claim: g1.claim });
  ok(!dv.ok, "golf: a doctored log fails the claimed card");
  ok(!V.golf.verify(C.eventById("golf-daily-2026-10-08"), 0, "open", { inputLog: g1.log, claim: g1.claim }).ok, "golf: another event's seed does not verify");
  ok(!V.golf.verify(evG, 0, "assisted", { inputLog: g1.log, claim: g1.claim }).ok, "golf: an OPEN card does not verify as ASSISTED (the assists change the round)");
  ok(!V.golf.verify(evG, 0, "open", { inputLog: g1.log.slice(0, g1.log.length - 30), claim: g1.claim }).ok, "golf: a card cut short is not a finished round");
  ok(!V.golf.verify(evG, 0, "open", { inputLog: [1, 2, 3], claim: g1.claim }).ok && !V.golf.verify(evG, 0, "open", { inputLog: [[ "z", 1 ], 0], claim: g1.claim }).ok, "golf: an illegible log fails");
  ok(!V.golf.verify(evG, 0, "open", { inputLog: g1.log, claim: g1.claim, v: 2 }).ok, "golf: a card from another version of the course is refused");
  const ga = golfRound(evG, "assisted");
  ok(V.golf.verify(evG, 0, "assisted", { inputLog: ga.log, claim: ga.claim }).ok, "golf: an ASSISTED card verifies in ASSISTED");
}
function bowlGame(ev, leg, div, opts = {}) {
  const cfg = R.bowlCfg(ev, leg, div, opts, BOWL.VERSION), st = BOWL.newGame(cfg), L = new BOWL.Logger();
  for (let k = 0; !st.over && k < 400000; k++) {
    if (st.phase === "aim" && st.phaseT === 30) {
      const fresh = BOWL.standing(st).length === 10, pin = st.pins.filter(q => q.st === 0).sort((a, b) => a.y - b.y)[0];
      const e = { t: "throw", x: 9, a: Math.round(BOWL.aimFor(st, 9, 17, fresh ? 0.45 : 0.1, fresh ? 2.6 : pin.x, fresh ? BOWL.HEAD_Y : pin.y) * 1e6) / 1e6, mph: 17, r: fresh ? 0.45 : 0.1 };
      L.event(e); BOWL.act(st, e);
    }
    L.tick(0); BOWL.step(st, 0);
  }
  return { log: L.log, claim: { total: BOWL.resultOf(st).players[0].total }, ticks: st.t };
}
const b0 = bowlGame(evB, 0, "open", { weight: 15 });
{
  const v = V.bowling.verify(evB, 0, "open", { inputLog: b0.log, claim: b0.claim, opts: { weight: 15 } });
  ok(v.ok && v.leg.total === b0.claim.total && b0.claim.total > 0, `bowling: a genuine game verifies (${b0.claim.total})`);
  ok(!V.bowling.verify(evB, 0, "open", { inputLog: b0.log, claim: { total: b0.claim.total + 1 }, opts: { weight: 15 } }).ok, "bowling: a doctored claim fails");
  ok(R.bowlCfg(evB, 1, "open", {}).seed === C.seedOf(evB.id, 1) && R.bowlCfg(evB, 1, "open", {}).seed !== R.bowlCfg(evB, 0, "open", {}).seed, "bowling: each game of the series has its own seed (its own oil and rack), the same for everyone");
  const d = JSON.parse(JSON.stringify(b0.log)); const i = d.findIndex(e => e && e.t === "throw"); d[i].mph += 4; d[i].a += 0.01;
  ok(!V.bowling.verify(evB, 0, "open", { inputLog: d, claim: b0.claim, opts: { weight: 15 } }).ok, "bowling: a doctored throw fails the claimed game");
  ok(!V.bowling.verify(evB, 0, "open", { inputLog: [{ t: "throw", x: "9" }, 0, 1], claim: b0.claim }).ok && !V.bowling.verify(evB, 0, "open", { inputLog: [{ t: "eval", x: 1 }, 0, 1], claim: b0.claim }).ok, "bowling: an illegible log fails");
  ok(!V.bowling.verify(evB, 3, "open", { inputLog: b0.log, claim: b0.claim }).ok, "bowling: no fourth game in a three-game series");
  ok(R.bowlCfg(evB, 0, "open", { bumpers: true }).players[0].bumpers === false && R.bowlCfg(evB, 0, "assisted", { bumpers: true }).players[0].bumpers === true && R.bowlCfg(evB, 0, "open").easy === false, "bowling: OPEN has no bumpers and no easy lanes; ASSISTED may");
}
{
  const cfg = R.fishCfg(evF), a = FISH.autoplay(cfg, 60 * 60 * 25);
  const i = a.st.catches.findIndex(c => c.fate !== "release");
  if (i >= 0) {
    const c = a.st.catches[i];
    const v = V.fish.verify(evF, 0, "open", { inputLog: a.log, claim: { sp: c.sp, cw: c.cw, tl: c.tl }, n: i });
    ok(v.ok && v.leg.total === c.cw, `fish: a genuine derby catch verifies (${c.sp}, ${c.cw / 100} lb)`);
    ok(!V.fish.verify(evF, 0, "open", { inputLog: a.log, claim: { sp: c.sp, cw: c.cw + 50, tl: c.tl }, n: i }).ok, "fish: a heavier claim fails");
    ok(!V.fish.verify(C.eventById("fish-derby-2026-10-18"), 0, "open", { inputLog: a.log, claim: { sp: c.sp, cw: c.cw, tl: c.tl }, n: i }).ok, "fish: another derby's water does not verify");
  } else ok(false, "fish: the warden's bot landed a fish to check");
  ok(typeof V.hunt.verify === "function" && typeof V.ski.verify === "function" && V.adapterOf(evB) === V.bowling, "the adapter interface: hunt and ski are ready for a calendar entry");
}

// ---- 3. the boards (pure) -----------------------------------------------------------------------------------
{
  const rows = [
    { k: "b", total: 70, tb: [35, 24, 12, 4], done: true, doneAt: 5, legs: 1 },
    { k: "a", total: 70, tb: [34, 24, 12, 4], done: true, doneAt: 9, legs: 1 },
    { k: "c", total: 70, tb: [34, 24, 12, 4], done: true, doneAt: 3, legs: 1 },
    { k: "d", total: 68, tb: [36, 24, 12, 4], done: true, doneAt: 1, legs: 1 },
    { k: "e", total: 60, tb: [], done: false, doneAt: null, legs: 0 },
    { k: "f", total: 70, tb: [34, 24, 12, 4], done: true, doneAt: 3, legs: 1 },
  ];
  const r1 = R.rankRows(rows, true).map(r => r.k).join(""), r2 = R.rankRows(rows.slice().reverse(), true).map(r => r.k).join("");
  ok(r1 === "dcfabe" && r1 === r2, `golf boards: the score, then the countback, then who finished first, then the key; never a shared place (${r1})`);
  const pins = [{ k: "x", total: 600, tb: [-220, -15], done: true, doneAt: 2, legs: 3 }, { k: "y", total: 600, tb: [-230, -12], done: true, doneAt: 9, legs: 3 }, { k: "z", total: 640, tb: [0], done: false, legs: 2 }];
  ok(R.rankRows(pins, false).map(r => r.k).join("") === "yxz", "bowling boards: more pins, then the best single game; an unfinished series below the finished");
  ok(R.countback([4, 4, 4, 4, 4, 4, 4, 4, 3]).join() === "23,11,3" && R.countback(Array(18).fill(4)).join() === "36,24,12,4", "golf's countback: the last nine, six, three and one");
  ok(R.trophySku(evM, 1, "open") === "f:trophy.golf-major-2026-10-09.o1" && /^(w|f):[a-z0-9.-]{2,48}$/.test(R.trophySku(C.eventById("golf-champ-s123"), 3, "assisted")), "trophy SKUs fit the ledger's pattern");
}

// ---- 4. the endpoint: enter, submit, permits, one result per attempt, the window ----------------------------
const cases = globalThis.__blobs.get("hvi-cases") || new Map();
globalThis.__blobs.set("hvi-cases", cases);
const CASE = ["HVI-TSTAAAAA", "HVI-TSTBBBBB", "HVI-TSTCCCCC", "HVI-TSTDDDDD"];
for (const c of CASE) cases.set(c, { data: { caseId: c, scores: {} }, etag: "x" });
const call = async (method, body, q = "") => {
  const r = await handler(new Request(`https://hvi.test/api/tournament${q}`, method === "GET" ? { method } : { method, headers: { "Content-Type": "application/json", origin: "https://hvi.test" }, body: JSON.stringify(body) }), { ip: "1.2.3.4" });
  return { status: r.status, j: await r.json() };
};
{
  NOW = evG.opens - 60000;
  let r = await call("POST", { caseId: CASE[0], action: "enter", id: evG.id, div: "open" });
  ok(r.status === 409, "an event cannot be entered before it opens");
  NOW = evG.opens + 3600000;
  r = await call("POST", { caseId: CASE[0], action: "enter", id: evG.id, div: "open" });
  ok(r.status === 200 && r.j.permit && r.j.setup.golf.seed === C.seedOf(evG.id, 0), "enter: a permit and the locked setup");
  const permit = r.j.permit;
  const again = await call("POST", { caseId: CASE[0], action: "enter", id: evG.id, div: "open" });
  ok(again.status === 200 && again.j.permit === permit && again.j.resumed, "entering again while the attempt is unfinished gives the same permit back (a reload costs nothing)");
  ok((await call("POST", { caseId: CASE[0], action: "enter", id: evG.id, div: "assisted" })).status === 409, "one division an event");
  ok((await call("POST", { caseId: CASE[0], action: "enter", id: "golf-daily-2026-10-05", div: "open" })).status === 404, "an event before the calendar began is no event");
  // the clock: a card longer than the time since the entry
  NOW = evG.opens + 3600000 + 5000;
  r = await call("POST", { caseId: CASE[0], action: "submit", permit, leg: 0, inputLog: g1.log, claim: g1.claim, v: GOLF.VERSION });
  ok(r.status === 422 && /CLOCK/.test(r.j.error), "a card longer than the time since the entry is refused");
  NOW = evG.opens + 3600000 + Math.ceil(g1.ticks / 60) * 1000 + 1000;
  ok((await call("POST", { caseId: CASE[1], action: "submit", permit, leg: 0, inputLog: g1.log, claim: g1.claim })).status === 400, "a permit is bound to its file: another case cannot file it");
  const forged = permit.replace(/\.(\d{13})\./, (m, t) => `.${Number(t) - 3600000}.`);
  ok((await call("POST", { caseId: CASE[0], action: "submit", permit: forged, leg: 0, inputLog: g1.log, claim: g1.claim })).status === 400, "a permit with its clock moved is not one the clubhouse issued");
  const other = permit.replace(evG.id, "golf-daily-2026-10-07");
  ok((await call("POST", { caseId: CASE[0], action: "submit", permit: other, leg: 0, inputLog: g1.log, claim: g1.claim })).status === 400, "a permit is bound to its event");
  ok((await call("POST", { caseId: CASE[0], action: "submit", permit: permit.replace(".open.", ".assisted."), leg: 0, inputLog: g1.log, claim: g1.claim })).status === 400, "a permit is bound to its division");
  ok((await call("POST", { caseId: CASE[0], action: "submit", permit, leg: 0, inputLog: g1.log, claim: { ...g1.claim, total: g1.claim.total - 2 } })).status === 422, "a doctored claim is refused by the replay");
  r = await call("POST", { caseId: CASE[0], action: "submit", permit, leg: 0, inputLog: g1.log, claim: g1.claim, v: GOLF.VERSION });
  ok(r.status === 200 && r.j.done && r.j.standing.pos === 1 && r.j.standing.total === g1.claim.total, "a genuine card is filed: first on the board");
  ok((await call("POST", { caseId: CASE[0], action: "submit", permit, leg: 0, inputLog: g1.log, claim: g1.claim })).status === 409, "one official result per attempt: the same card cannot be filed twice");
  ok((await call("POST", { caseId: CASE[0], action: "enter", id: evG.id, div: "open" })).status === 409, "the one official attempt is spent");
  // a second file in the assisted division, a third in open with a worse card (hand-built)
  r = await call("POST", { caseId: CASE[1], action: "enter", id: evG.id, div: "assisted" });
  const ga = golfRound(evG, "assisted");
  NOW += Math.ceil(ga.ticks / 60) * 1000 + 2000;
  const r2 = await call("POST", { caseId: CASE[1], action: "submit", permit: r.j.permit, leg: 0, inputLog: ga.log, claim: ga.claim });
  ok(r2.status === 200 && r2.j.standing.div === "assisted" && r2.j.standing.pos === 1, "the ASSISTED division keeps its own board");
  const view = await call("GET", null, `?id=${evG.id}`);
  ok(view.status === 200 && view.j.board.divisions.open.length === 1 && view.j.board.divisions.assisted.length === 1 && !view.j.board.final && !JSON.stringify(view.j).includes("HVI-") && !JSON.stringify(view.j).includes(T.holderKey(CASE[0])), "the board: projected while open, names only (no case number, no key)");
  const cal = await call("GET");
  ok(cal.status === 200 && cal.j.events.some(e => e.id === evG.id && e.status === "open" && e.leaders.open[0].holder === R.holderName(CASE[0])), "the calendar view carries each open event's leaders");
  // bowling: three games in order
  NOW = evB.opens + 600000;
  r = await call("POST", { caseId: CASE[2], action: "enter", id: evB.id, div: "open" });
  const bp = r.j.permit;
  ok(r.status === 200 && r.j.setup.bowling.length === 3, "league night: a permit for a three-game series");
  const g2 = bowlGame(evB, 1, "open", { weight: 15 });
  NOW += 20 * 60000;
  ok((await call("POST", { caseId: CASE[2], action: "submit", permit: bp, leg: 1, inputLog: g2.log, claim: g2.claim, opts: { weight: 15 } })).status === 409, "the games are filed in order");
  r = await call("POST", { caseId: CASE[2], action: "submit", permit: bp, leg: 0, inputLog: b0.log, claim: b0.claim, opts: { weight: 15 } });
  ok(r.status === 200 && !r.j.done && r.j.standing.legs === 1, "game one filed: the series is projected, thru one");
  ok((await call("POST", { caseId: CASE[2], action: "submit", permit: bp, leg: 1, inputLog: g2.log, claim: g2.claim, opts: { weight: 15 } })).status === 422, "game two right after game one: longer than the time since, refused");
  NOW += 20 * 60000;
  ok((await call("POST", { caseId: CASE[2], action: "submit", permit: bp, leg: 1, inputLog: g2.log, claim: g2.claim, opts: { weight: 15 } })).status === 200, "game two filed");
  ok((await call("POST", { caseId: CASE[2], action: "submit", permit: bp, leg: 1, inputLog: g2.log, claim: g2.claim, opts: { weight: 15 } })).status === 409, "game two cannot be filed twice");
  const g3 = bowlGame(evB, 2, "open", { weight: 15 });
  NOW += 20 * 60000;
  r = await call("POST", { caseId: CASE[2], action: "submit", permit: bp, leg: 2, inputLog: g3.log, claim: g3.claim, opts: { weight: 15 } });
  ok(r.status === 200 && r.j.done && r.j.standing.total === b0.claim.total + g2.claim.total + g3.claim.total, "game three filed: the series is the sum of the three");
  // a fourth file enters league night and leaves after one game: no card at the close
  r = await call("POST", { caseId: CASE[3], action: "enter", id: evB.id, div: "open" });
  NOW += 20 * 60000;
  await call("POST", { caseId: CASE[3], action: "submit", permit: r.j.permit, leg: 0, inputLog: b0.log, claim: b0.claim, opts: { weight: 15 } });
  // the window: closed, and the grace after it
  NOW = evB.closes + 60000;
  ok((await call("POST", { caseId: CASE[1], action: "enter", id: evB.id, div: "open" })).status === 410, "entries close with the window");
  NOW = evB.closes + C.GRACE_MS + 60000;
  ok((await call("POST", { caseId: CASE[3], action: "submit", permit: r.j.permit, leg: 1, inputLog: g2.log, claim: g2.claim, opts: { weight: 15 } })).status === 410, "after the grace the board is closed");
  const fin = await call("GET", null, `?id=${evB.id}`);
  ok(fin.j.board.final && fin.j.board.divisions.open.length === 1 && fin.j.board.nc.open === 1, "after the close the board is final: the finished series only, the rest NO CARD");
  const mine = await call("GET", null, `?caseId=${CASE[2]}`);
  ok(mine.status === 200 && mine.j.mine.places.some(p => p.id === evB.id && p.pos === 1), "MY FILE: the file's own places");
}

// ---- 5. the prizes: final once, a line on the file, a trophy in the ledger (and no CYCLES) -----------------------
{
  const L = E.memoryLedger();
  globalThis.__econLedger = L;
  L.db.citizens.set(E.caseHash(CASE[2]), { case_hash: E.caseHash(CASE[2]) });
  NOW = evB.closes + C.GRACE_MS + 120000;
  const before = L.db.entries.length;
  await A.finalizeDue(NOW, { L });
  const b = await T.readBoard(evB.id);
  ok(b.final && b.final.awards.some(a => a.place === 1 && a.sku === R.trophySku(evB, 1, "open") && a.granted === "granted" && a.filed), "LEAGUE NIGHT is final: the winner's trophy granted, the line filed");
  const item = L.db.items.find(i => i.sku === R.trophySku(evB, 1, "open"));
  ok(item && item.case_hash === E.caseHash(CASE[2]) && L.db.entries.length === before, "the trophy is in the winner's inventory, and no CYCLES moved");
  const rec = await T.getRecord(CASE[2]);
  ok(rec.honours.length === 1 && /^WON LEAGUE NIGHT AT THE MANDATORY FUN LEAGUE, \d+ PINS\. THE PINSETTER HAS FILED A COMPLAINT\.$/.test(rec.honours[0].line), `the line on the winner's file: ${rec.honours[0]?.line}`);
  await A.finalizeDue(NOW + 900000, { L });
  ok(L.db.items.filter(i => i.sku === R.trophySku(evB, 1, "open")).length === 1 && (await T.getRecord(CASE[2])).honours.length === 1, "delivered once: a second tick grants nothing more");
  const it = SH.itemOf(item.sku);
  ok(it && it.kind === "furn" && it.award && !SH.onSale(item.sku, 700) && SH.placeable(it, "flat-1:living", "flat-1") && pieceOf(it.id)?.trophy, "the trophy is a piece of furniture for the flat (never for sale)");
  // the daily golf: a line for the winner only, no trophy; the file without a wallet waits for nothing
  NOW = evG.closes + C.GRACE_MS + 60000;
  await A.finalizeDue(NOW, { L });
  const g = await T.readBoard(evG.id);
  ok(g.final.awards.length === 2 && g.final.awards.every(a => !a.sku && a.line && a.filed), "THE DAILY: a line on the winner's file in each division, no trophy");
  ok(/^WON THE DAILY AUDIT, \d+ UNDER\. THE DEPARTMENT IS INVESTIGATING\.$/.test((await T.getRecord(CASE[0])).honours[0].line), `the daily winner's line: ${(await T.getRecord(CASE[0])).honours[0].line}`);
  // a major with a winner who has no wallet: the trophy waits, then arrives
  NOW = evM.opens + 3600000;
  let r = await call("POST", { caseId: CASE[3], action: "enter", id: evM.id, div: "open" });
  const gm = golfRound(evM, "open");
  NOW += Math.ceil(gm.ticks / 60) * 1000 + 2000;
  ok((await call("POST", { caseId: CASE[3], action: "submit", permit: r.j.permit, leg: 0, inputLog: gm.log, claim: gm.claim })).status === 200, "a major's eighteen filed");
  NOW = evM.closes + C.GRACE_MS + 60000;
  await A.finalizeDue(NOW, { L });
  ok((await T.readBoard(evM.id)).final.awards.find(a => a.place === 1).granted === "no-wallet", "no wallet yet: the trophy waits on the board");
  L.db.citizens.set(E.caseHash(CASE[3]), { case_hash: E.caseHash(CASE[3]) });
  await A.finalizeDue(NOW + 900000, { L });
  ok((await T.readBoard(evM.id)).final.awards.find(a => a.place === 1).granted === "granted" && L.db.items.some(i => i.sku === R.trophySku(evM, 1, "open")), "the trophy arrives on the next tick after the wallet opens");
  delete globalThis.__econLedger;
}

// ---- 6. the purge: the name struck on every board, the record gone ------------------------------------------------
{
  process.env.HVI_ECONOMY = "off";
  const r = await purge(new Request("https://hvi.test/api/purge", { method: "POST", headers: { "Content-Type": "application/json", origin: "https://hvi.test" }, body: JSON.stringify({ caseId: CASE[2], confirm: CASE[2] }) }), { ip: "9.9.9.9" });
  ok(r.status === 200, "the purge runs");
  const b = await T.readBoard(evB.id), e = b.entries[T.holderKey(CASE[2])];
  ok(e.holder === T.PURGED && e.cid === null && b.final.awards.every(a => a.k !== T.holderKey(CASE[2]) || (a.cid === null && a.holder === T.PURGED)), "on the board the name becomes A PURGED FILE and the case number is struck");
  ok((await T.getRecord(CASE[2])) === null, "the file's tournament record is gone");
  ok(!JSON.stringify(globalThis.__blobs.get("hvi-tournaments")).includes(CASE[2]), "the case number is nowhere in the tournaments' store");
}

console.log(failed ? `check-tournament: ${failed} of ${n} FAILED` : `check-tournament: all ${n} pass`);
process.exit(failed ? 1 : 0);
