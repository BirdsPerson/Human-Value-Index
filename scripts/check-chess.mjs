// PARK CHESS: the rules, the engine, the park and /api/chess.
//   rules     perft on the standard positions (start depth 3 = 8902, depth 4 = 197281; Kiwipete;
//             the en passant and promotion traps), castling, en passant, promotion, SAN, checkmate,
//             stalemate, threefold, fifty moves, dead material, FEN both ways
//   engine    deterministic, finds a mate, and a stronger file beats a weaker one more often in a
//             self-play sample; the style follows the rating monotonically
//   roster    nobody with grave harm on file sits; the dead talk only in written lines; the living act
//   park      tables on their own ground clear of the recreation ground's anchors and trees; the
//             pairings, results and ladder deterministic per machine day, however they are reached
//   api       /api/chess on in-memory Blobs: a real game filed, a doctored one refused, a replay
//             refused, too fast refused, resign filed, the file gate, the leaderboard, the purge
// Run: node scripts/check-chess.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

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

const RU = await import("../src/chess/rules.js");
const EN = await import("../src/chess/engine.js");
const RO = await import("../src/chess/roster.js");
const PK = await import("../src/chess/park.js");
const { FAMOUS_FIGURES, slugify } = await import("../src/figures.js");
const { REC, PARK_ANCHORS } = await import("../src/city/parkGeo.js");
const { BUILDING } = await import("../src/city/sim.js");
const { GARDEN_TREES } = await import("../src/city/venueGeo.js");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };

// ==== RULES =============================================================================================
{
  const PERFT = [
    ["start", RU.START_FEN, [20, 400, 8902, 197281]],
    ["kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862]],
    ["position 3 (en passant, pins)", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238, 674624]],
    ["position 4 (promotions, castling)", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467, 422333]],
    ["position 4 mirrored", "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1", [6, 264, 9467]],
    ["position 5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379]],
    ["position 6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", [46, 2079, 89890]],
  ];
  for (const [name, fen, want] of PERFT) want.forEach((n, i) => ok(RU.perft(RU.fromFen(fen), i + 1) === n, `perft ${name} depth ${i + 1} = ${n}`));

  const pos = (fen) => RU.fromFen(fen);
  const has = (p, u) => RU.fromUci(p, u) !== null;
  // castling
  ok(has(pos("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1g1") && has(pos("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1c1"), "castle both ways when clear");
  ok(!has(pos("r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1"), "e1g1"), "no castling without the right");
  ok(!has(pos("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1"), "e1g1") && has(pos("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1"), "e1c1"), "no castling through an attacked square (f1), the other side still allowed");
  ok(!has(pos("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1"), "e1g1") && !has(pos("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1"), "e1c1"), "no castling out of check");
  ok(!has(pos("4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1"), "e1g1"), "no castling through a piece");
  ok(!has(pos("4k1r1/8/8/8/8/8/8/R3K2R w KQ - 0 1"), "e1g1"), "no castling into check");
  ok(has(pos("1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"), "e1c1"), "queenside castling allowed with b1 attacked (only the king's path counts)");
  {
    const p = pos("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    RU.make(p, RU.fromUci(p, "h1h8"));   // rook takes rook: both kingside rights gone
    ok(!(p.castle & 1) && !(p.castle & 4) && (p.castle & 2) && (p.castle & 8), "a rook moving or taken loses that side's right");
    RU.unmake(p);
    ok(p.castle === 15 && RU.toFen(p) === "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "unmake restores the position exactly");
  }
  // en passant
  {
    const p = pos("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    ok(has(p, "e5d6"), "en passant available right after the double push");
    const m = RU.fromUci(p, "e5d6"); RU.make(p, m);
    ok(RU.toFen(p).startsWith("4k3/8/3P4/8/8/8/8/4K3 b"), "en passant removes the passed pawn");
    ok(!has(pos("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1"), "e5d6"), "no en passant a move later");
    ok(!has(pos("8/8/8/K2pP2r/8/8/8/7k w - d6 0 1"), "e5d6"), "no en passant that exposes the king along the rank");
  }
  // promotion
  {
    const p = pos("8/4P3/8/8/8/8/8/k6K w - - 0 1");
    ok(["e7e8q", "e7e8r", "e7e8b", "e7e8n"].every(u => has(p, u)) && !has(p, "e7e8"), "a pawn promotes to any of four pieces, and must");
    const m = RU.fromUci(p, "e7e8n");
    ok(RU.san(p, m) === "e8=N", "SAN of an underpromotion");
    ok(RU.san(pos("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"), RU.fromUci(pos("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"), "e1g1")) === "O-O", "SAN castling");
    const q = pos("3k4/8/8/8/8/8/4K3/R6R w - - 0 1");
    ok(RU.san(q, RU.fromUci(q, "a1a8")) === "Ra8+" && RU.san(q, RU.fromUci(q, "h1e1")) === "Rhe1" && RU.san(q, RU.fromUci(q, "a1e1")) === "Rae1", "SAN: check, and disambiguation by file");
    const q2 = pos("3k4/8/8/8/R7/8/4K3/R7 w - - 0 1");
    ok(RU.san(q2, RU.fromUci(q2, "a1a2")) === "R1a2", "SAN: disambiguation by rank");
  }
  // the end of the game
  {
    const r = RU.replay(["f2f3", "e7e5", "g2g4", "d8h4"]);
    const st = RU.status(r.pos);
    ok(!r.error && st.over && st.reason === "checkmate" && st.result === "0-1" && r.sans[3] === "Qh4#", "fool's mate: checkmate, 0-1, Qh4#");
    const bad = RU.replay(["e2e4", "e7e5", "e1e3"]);
    ok(bad.error === "illegal move" && bad.at === 2, "an illegal move is caught where it is");
    ok(RU.replay(["f2f3", "e7e5", "g2g4", "d8h4", "a2a3"]).error === "moves after the end", "nothing after the end");
    const sm = RU.status(pos("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"));
    ok(sm.over && sm.reason === "stalemate" && sm.result === "1/2-1/2", "stalemate is a draw");
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
    const t = RU.replay(shuffle);
    ok(RU.status(t.pos).reason === "threefold" && !RU.status(RU.replay(shuffle.slice(0, 7)).pos).over, "threefold repetition, on the third occurrence only");
    ok(RU.status(pos("4k3/8/8/8/8/8/4P3/4K3 w - - 100 80")).reason === "fifty", "fifty-move rule at 100 half-moves");
    ok(!RU.status(pos("4k3/8/8/8/8/8/4P3/4K3 w - - 99 80")).over, "not at 99");
    for (const f of ["4k3/8/8/8/8/8/8/4K3 w - - 0 1", "4k3/8/8/8/8/8/8/4KN2 w - - 0 1", "4k3/8/8/8/8/8/8/4KB2 w - - 0 1", "2b1k3/8/8/8/8/8/8/4KB2 w - - 0 1"])
      ok(RU.status(pos(f)).reason === "insufficient", `dead position: ${f.split(" ")[0]}`);
    for (const f of ["4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1", "4k3/8/8/8/8/8/8/3NKN2 w - - 0 1", "1b2k3/8/8/8/8/8/8/4KB2 w - - 0 1", "4k3/8/8/8/8/8/8/4KR2 w - - 0 1"])
      ok(!RU.status(pos(f)).over, `not dead: ${f.split(" ")[0]}`);
  }
  for (const f of [RU.START_FEN, "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"]) ok(RU.toFen(RU.fromFen(f)) === f, `FEN round trip: ${f}`);
}

// ==== ENGINE ============================================================================================
{
  const S = (r, threat = 20) => EN.styleOf({ rating: r, breakdown: { threat } });
  let prev = null;
  for (let r = 0; r <= 99; r++) {
    const s = S(r);
    if (prev) ok(s.depth >= prev.depth && s.noise <= prev.noise && s.blunder <= prev.blunder && (s.quiesce || !prev.quiesce), `style is monotone in the rating at ${r}`);
    prev = s;
  }
  ok(S(99).depth === 5 && S(30).depth === 1 && S(99).blunder === 0 && S(30).blunder > 0, "the strongest look 5 plies and never blunder; the weakest look one and sometimes do");
  ok(S(50, 90).aggression > S(50, 10).aggression, "threat on file makes an aggressive player");
  // mate in one: everyone above the blunder line finds it
  const m1 = RU.fromFen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1");
  for (const r of [55, 70, 99]) ok(RU.uci(EN.chooseMove(m1, S(r), 5).move) === "d1d8", `rating ${r} finds the back-rank mate`);
  // deterministic
  const p0 = RU.replay(["e2e4", "e7e5", "g1f3"]).pos;
  const a = EN.chooseMove(p0, S(80), 12345), b = EN.chooseMove(RU.replay(["e2e4", "e7e5", "g1f3"]).pos, S(80), 12345);
  ok(RU.uci(a.move) === RU.uci(b.move) && a.nodes === b.nodes, "the same position, style and seed: the same move and the same search");
  // strength ordering, by self-play (colours alternate; a long game is adjudicated on material)
  function game(ra, rb, seed) {
    const pos = RU.newGame(), sty = [S(ra), S(rb)];
    for (let ply = 0; ply < 160; ply++) {
      const st = RU.status(pos);
      if (st.over) return st.result === "1-0" ? 1 : st.result === "0-1" ? 0 : 0.5;
      RU.make(pos, EN.chooseMove(pos, sty[ply % 2], seed).move);
    }
    const m = EN.material(pos);
    return m > 150 ? 1 : m < -150 ? 0 : 0.5;
  }
  const match = (strong, weak, n) => { let sc = 0; for (let i = 0; i < n; i++) sc += i % 2 ? 1 - game(weak, strong, 1000 + i) : game(strong, weak, 1000 + i); return sc / n; };
  const t0 = Date.now();
  const s1 = match(90, 30, 4), s2 = match(70, 45, 6), s3 = match(85, 55, 4);
  ok(s1 >= 0.8, `a 90 beats a 30 (scored ${s1})`);
  ok(s2 >= 0.6, `a 70 beats a 45 more often than not (scored ${s2})`);
  ok(s3 >= 0.6, `an 85 beats a 55 more often than not (scored ${s3})`);
  console.log(`engine self-play: 90 v 30 ${s1}, 70 v 45 ${s2}, 85 v 55 ${s3} (${Date.now() - t0} ms)`);
}

// ==== ROSTER ============================================================================================
{
  for (const f of FAMOUS_FIGURES) {
    const slug = slugify(f.name), c = RO.figureCard(slug);
    if (f.harm || f.tier === "SOYLENT GREEN" || (f.breakdown?.threat ?? 0) >= 80) ok(c === null, `${slug} never sits (grave harm, Soylent, or threat 80+)`);
  }
  const opp = RO.opponents();
  ok(opp.length > 30 && opp.every(c => !RO.barred(c)), `${opp.length} opponents, none barred`);
  ok(opp[0].slug === "bobby-fischer" && opp.slice(0, RO.CHESS_ON_FILE.length).every(c => c.chess), "the chess players on file come first, Fischer at the top");
  ok(RO.LADDER.every(p => p.kind === "regular" || RO.figureCard(p.key)), "every figure on the ladder may sit");
  ok(RO.LADDER.filter(p => p.chess).length === RO.CHESS_ON_FILE.length && RO.LADDER.some(p => p.kind === "regular"), "the ladder: every chess player on file, the file's strongest, the regulars");
  // the dead talk (only written lines); the living act, never speak
  for (const slug of Object.keys(RO.LINES)) { const c = RO.figureCard(slug); ok(c && c.dead, `${slug} has lines and is dead`); }
  for (const slug of Object.keys(RO.OWN_ACTS)) { const c = RO.figureCard(slug); ok(c && !c.dead, `${slug} has acts and is living`); }
  for (const c of opp) for (const moment of ["sit", "move", "check", "win", "lose", "draw", "think"]) for (const u of [0, 0.3, 0.7, 0.99]) {
    const t = RO.talkFor(c, moment, u);
    if (!c.dead) ok(t && t.kind === "act" && !/[a-z"\u201c\u201d]/.test(t.text), `${c.slug} (living) only acts: ${t?.text}`);
    else if (t) ok(t.kind === "say", `${c.slug} (dead) talks`);
  }
  // the lines rib the game, not the person: no cruelty words
  const all = JSON.stringify([RO.LINES, RO.HOUSE_LINES, RO.OWN_ACTS, RO.HOUSE_ACTS]);
  ok(!/\b(stupid|idiot|ugly|fat|retard|kill yourself|die)\b/i.test(all), "no cruelty in the lines");
}

// ==== THE PARK ==========================================================================================
{
  const inRect = (r, x, y, m = 0.2) => x >= r.x + m && x <= r.x + r.w - m && y >= r.y + m && y <= r.y + r.h - m;
  ok(PK.TABLES.filter(t => t.lot === "rec-ground").length === 1 && PK.TABLES.some(t => t.lot !== "rec-ground"), "tables at the recreation ground and at least one other green");
  for (const t of PK.TABLES) {
    const r = BUILDING[t.lot].rect;
    for (const [x, y] of [[t.x, t.y], ...t.seats, ...t.kib]) ok(inRect(r, x, y), `${t.id}: everything on its own ground`);
    for (const o of PK.TABLES) if (o !== t) ok(Math.hypot(o.x - t.x, o.y - t.y) > 1.2, `${t.id} and ${o.id} apart`);
  }
  const recPts = [...PARK_ANCHORS["rec-park"].filter(a => !a.ring).map(a => [a.x, a.y]), ...REC.trees, ...REC.lamps, ...REC.tables, ...REC.benches];
  for (const t of PK.TABLES.filter(t => t.lot === "rec-ground")) for (const [x, y] of [[t.x, t.y], ...t.seats, ...t.kib])
    ok(recPts.every(([ax, ay]) => Math.hypot(ax - x, ay - y) > 0.4), `${t.id}: clear of the recreation ground's anchors, trees and tables`);
  for (const t of PK.TABLES.filter(t => t.lot === "estate-gardens")) ok(GARDEN_TREES.every(([ax, ay]) => Math.hypot(ax - t.x, ay - t.y) > 1.0), `${t.id}: clear of the gardens' trees`);
  // deterministic per machine day, however it is reached
  const day = 300;
  const s1 = JSON.stringify(PK.standings(day));
  PK.standings(day - 1); PK.standings(day + 3);
  ok(JSON.stringify(PK.standings(day)) === s1, "the ladder for a day is the same whenever it is asked");
  const fresh = await import("../src/chess/park.js?fresh=1");
  ok(JSON.stringify(fresh.standings(day)) === s1, "and the same from a cold start (no memo)");
  ok(JSON.stringify(fresh.pairingsAt(day, 5)) === JSON.stringify(PK.pairingsAt(day, 5)), "pairings per slot deterministic");
  const top = PK.standings(day);
  ok(top.length === RO.LADDER.length && top.every((r, i) => !i || top[i - 1].elo >= r.elo), "the ladder is sorted, everyone on it");
  ok(top.slice(0, 5).some(r => r.key === "bobby-fischer"), "Fischer is near the top of the ladder");
  // a day at the tables: open hours, everyone at one board at a time, sane results
  let games = 0, pig = 0, fischerWins = 0;
  for (let s = 0; s < PK.SLOTS; s++) {
    const g = PK.pairingsAt(day, s), keys = g.flatMap(x => [x.white, x.black]);
    ok(new Set(keys).size === keys.length && g.length === PK.TABLES.length, `slot ${s}: a game at every table, nobody at two`);
    for (const x of g) { games++; ok(["1-0", "0-1", "1/2-1/2"].includes(x.result) && x.moves >= 11 && x.moves <= 80, "a result and a sane length"); }
  }
  for (let d = 280; d < 300; d++) for (let s = 0; s < PK.SLOTS; s++) for (const t of PK.TABLES) {
    const g = PK.gameAt(t.id, (d - 1) * 24 + PK.OPEN_FROM + s * PK.SLOT_H + 0.7);
    const line = PK.resultLine(g);
    if (/PIGEON FEEDER IN \d+ MOVES\. THE PIGEONS ARE APPEALING\./.test(line)) pig++;
    if (/^FISCHER BEAT/.test(line)) fischerWins++;
    ok(!/[a-z]/.test(line), `a PA line in capitals: ${line}`);
  }
  ok(pig > 0 && fischerWins > 0, `the PA has the pigeon feeder's losses (${pig}) and Fischer's wins (${fischerWins})`);
  ok(PK.gameAt(PK.TABLES[0].id, (day - 1) * 24 + 3) === null && PK.gameAt(PK.TABLES[0].id, (day - 1) * 24 + 12) !== null, "the tables are closed at night, open by day");
  const g0 = PK.gameAt(PK.TABLES[0].id, (day - 1) * 24 + PK.OPEN_FROM + 0.1), g1 = PK.gameAt(PK.TABLES[0].id, (day - 1) * 24 + PK.OPEN_FROM + 0.7);
  ok(g0.phase === "play" && g1.phase === "over" && g0.move < g1.move, "a game plays, then stands over");
  ok(PK.paLines((day - 1) * 24 + 15).length >= 2 && PK.paLines((day - 1) * 24 + 15, "works").length === 0, "PA lines on the map; none in a district without tables");
  ok(PK.tableNear(PK.TABLES[0].x + 0.3, PK.TABLES[0].y) === PK.TABLES[0] && PK.tableNear(0, 0) === null, "a table within reach (DRIVE YOURSELF)");
  ok(/^#chess\?(vs=[a-z0-9-]+&)?table=/.test(PK.tableGo(PK.TABLES[0], (day - 1) * 24 + 12).go), "a table sends you to the board page");
}

// ==== /api/chess =========================================================================================
{
  const S = await import("../netlify/lib/store.js");
  const V = await import("../netlify/lib/chess-verify.js");
  const fn = (await import("../netlify/functions/chess.js")).default;
  const purge = (await import("../netlify/functions/purge.js")).default;
  const HOST = "https://humanvalueindex.com";
  let ipN = 1;
  const call = async (method, body, { q = "", path = "/api/chess", f = fn } = {}) => {
    const r = await f(new Request(HOST + path + q, method === "GET" ? { method, headers: { origin: HOST } } : { method, headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify(body) }), { ip: `198.51.100.${ipN++ % 250}` });
    return { status: r.status, body: await r.json() };
  };
  const seed = async (id, history) => { await S.updateCase(id, () => ({ caseId: id, created: "2026-09-30", history })); };
  const A = "HVI-CHESSAAA", U = "HVI-CHESSUUU";
  await seed(A, [{ score: 500, tier: "MONITORED CIVILIAN" }]);
  await seed(U, []);
  const store = () => globalThis.__blobs.get("hvi-chess");
  const backdate = (id, secs) => { const e = store().get(`g:${id}`); e.data.at -= secs * 1000; };

  ok((await call("GET", null, { q: `?caseId=${U}` })).status === 403, "unassessed file: 403");
  ok((await call("GET", null, { q: "?caseId=HVI-NOSUCHAA" })).status === 404, "no such file: 404");
  ok((await call("POST", { caseId: A, action: "start", vs: "genghis-khan", side: "w" })).status === 404, "a grave-harm file is never dealt a game");
  ok((await call("POST", { caseId: A, action: "buy", vs: "bill-gates" })).status === 400, "no such action");

  // a real game: the citizen is played by a strong engine, the figure by its own
  const play = (card, side, gseed, mySeed, cap = 400) => {
    const pos = RU.newGame(), moves = [], mine = side === "w" ? 1 : -1;
    const me = EN.styleOf({ rating: 99, breakdown: { threat: 30 } }), fig = EN.styleOf(card);
    for (let i = 0; i < cap; i++) {
      if (RU.status(pos).over) break;
      const c = EN.chooseMove(pos, pos.turn === mine ? me : fig, pos.turn === mine ? mySeed : gseed);
      moves.push(RU.uci(c.move)); RU.make(pos, c.move);
    }
    return { moves, st: RU.status(pos) };
  };
  const card = RO.figureCard("bill-gates");
  let st = await call("POST", { caseId: A, action: "start", vs: "bill-gates", side: "w" });
  ok(st.status === 200 && /^[a-f0-9]{20}$/.test(st.body.gameId) && st.body.seed > 0, "a game dealt: id and seed");
  let game = play(card, "w", st.body.seed, 777);
  ok(game.st.over, `the sample game ends (${game.st.reason}, ${game.moves.length} plies)`);
  // too fast
  let r = await call("POST", { caseId: A, action: "result", gameId: st.body.gameId, moves: game.moves });
  ok(r.status === 422 && /fast/.test(r.body.error), "a result filed faster than anyone plays: refused");
  backdate(st.body.gameId, 3600);
  // doctored: one of the figure's moves swapped for another legal one
  const doctored = (() => {
    for (let i = game.moves.length - 1 - ((game.moves.length - 1) % 2 === 0 ? 1 : 0); i >= 1; i -= 2) {   // the figure is Black: odd plies
      const pre = RU.replay(game.moves.slice(0, i)).pos, alt = RU.legalMoves(pre).map(RU.uci).find(u => u !== game.moves[i]);
      if (alt) return [...game.moves.slice(0, i), alt];
    }
    return null;
  })();
  const dv = V.verifyGame({ vs: "bill-gates", side: "w", seed: st.body.seed, at: Date.now() - 3600e3 }, { moves: doctored, resign: true });
  ok(!dv.ok && /DOES NOT RECALL/.test(dv.error), "a figure's move swapped: refused (the engine re-played)");
  const typed = V.verifyGame({ vs: "bill-gates", side: "w", seed: st.body.seed + 1, at: Date.now() - 3600e3 }, { moves: game.moves });
  ok(!typed.ok, "the same moves under another game's seed: refused");
  ok(!V.verifyGame({ vs: "bill-gates", side: "w", seed: 1, at: 0 }, { moves: ["e2e4", "e7e5"] }).ok, "an unfinished game without resignation: refused");
  ok(!V.verifyGame({ vs: "bill-gates", side: "w", seed: 1, at: 0 }, { moves: ["e2e4", "e2e4"], resign: true }).ok, "an illegal move list: refused");
  r = await call("POST", { caseId: A, action: "result", gameId: st.body.gameId, moves: game.moves });
  const res = game.st.result === "1-0" ? "W" : game.st.result === "0-1" ? "L" : "D";
  ok(r.status === 200 && r.body.filed.res === res && r.body.record.w + r.body.record.d + r.body.record.l === 1, `a real game filed (${res})`);
  if (res === "W") ok(r.body.record.lines[0] === "DEFEATED BILL GATES. THE DEPARTMENT DOUBTS IT." && r.body.board[0].best === "BILL GATES", "MY FILE: DEFEATED BILL GATES. THE DEPARTMENT DOUBTS IT.; the board names the scalp");
  ok(r.body.board.length === 1 && r.body.board[0].case === `…${A.slice(-4)}` && !JSON.stringify(r.body.board).includes(A), "the leaderboard serves the last four only");
  r = await call("POST", { caseId: A, action: "result", gameId: st.body.gameId, moves: game.moves });
  ok(r.status === 404, "one result per game: the second is refused");
  // resign
  st = await call("POST", { caseId: A, action: "start", vs: "bobby-fischer", side: "b" });
  const fm = EN.chooseMove(RU.newGame(), EN.styleOf(RO.figureCard("bobby-fischer")), st.body.seed);
  backdate(st.body.gameId, 60);
  r = await call("POST", { caseId: A, action: "result", gameId: st.body.gameId, moves: [RU.uci(fm.move)], resign: true });
  ok(r.status === 200 && r.body.filed.res === "L" && r.body.record.l >= 1, "resigning to Fischer after his first move: filed as a loss");
  const g = await call("GET", null, { q: `?caseId=${A}` });
  ok(g.status === 200 && g.body.record.lines.some(l => /^LOST \d+ GAMES? TO THE FIGURES/.test(l)) && g.body.record.games.length === 2, "the record and its MY FILE lines");
  // a stranger's game id is not yours
  st = await call("POST", { caseId: A, action: "start", vs: "alan-turing", side: "w" });
  await seed("HVI-CHESSBBB", [{ score: 500, tier: "MONITORED CIVILIAN" }]);
  ok((await call("POST", { caseId: "HVI-CHESSBBB", action: "result", gameId: st.body.gameId, moves: [], resign: true })).status === 404, "another file's game cannot be filed on yours");
  // void games (past the TTL, never filed) are swept; a live one stays
  const CS = await import("../netlify/lib/chess-store.js");
  await CS.putGame("voidone", { caseId: A, vs: "alan-turing", side: "w", seed: 1, at: Date.now() - CS.GAME_TTL_MS - 1000 });
  await CS.putGame("liveone", { caseId: A, vs: "alan-turing", side: "w", seed: 1, at: Date.now() });
  ok((await CS.pruneGames()) >= 1 && !store().has("g:voidone") && store().has("g:liveone"), "void games are pruned, live ones stay");
  // the purge takes the record and the board row with it
  const p = await call("POST", { caseId: A, confirm: A }, { path: "/api/purge", f: purge });
  ok(p.status === 200 && !store().has(`c:${A}`) && !(store().get("board")?.data.rows || []).length, "a purge deletes the chess record and the board row");
  const src = readFileSync(new URL("../netlify/functions/chess.js", import.meta.url), "utf8") + readFileSync(new URL("../netlify/lib/chess-store.js", import.meta.url), "utf8");
  ok(!/hvi-casino|casino-store|stripe|payment|checkout|wallet/i.test(src), "no stakes: the chess ledger never touches chips or money");
}

// ==== docs ==============================================================================================
{
  const spec = readFileSync(new URL("../docs/CITY_SPEC.md", import.meta.url), "utf8");
  ok(/## Park chess/.test(spec), "docs/CITY_SPEC.md documents park chess");
}
console.log(`check-chess: ${checks} checks, ALL PASS`);
