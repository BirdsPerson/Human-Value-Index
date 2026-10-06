// /api/chess: chess against the figures (docs/CITY_SPEC.md "Park chess"). No stakes, no prizes, no
// chips: a win, a draw or a loss on the file, a citizens' leaderboard, a line on MY FILE.
//   GET                       the citizens' leaderboard (top 10, case last-4 only)
//   GET  ?caseId=             that file's chess record and its MY FILE lines, with the leaderboard
//   POST {caseId, action: "start", vs, side: "w" | "b"}
//                             deals a game: {gameId, seed}. The seed drives the figure's engine in
//                             the browser (src/chess/engine.worker.js), so the server can re-play
//                             the figure's moves when the result comes back.
//   POST {caseId, action: "result", gameId, moves: [uci], resign?}
//                             files the result once the game replays (netlify/lib/chess-verify.js)
// An unclaimed file plays on its number; a file secured to an email plays only from that account's
// session (lib/auth.js requireCaseAuth). Only assessed files are rated. The record itself is what
// the board shows, so the GET is open.
import { randomInt, randomUUID } from "node:crypto";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { putGame, getGame, dropGame, getRecord, updateRecord, postBoard, readBoard, Busy, GAME_TTL_MS, K_PLAYER, KEEP_GAMES, KEEP_HASHES } from "../lib/chess-store.js";
import { verifyGame } from "../lib/chess-verify.js";
import { figureCard, eloOf } from "../../src/chess/roster.js";

export const ACTIONS = ["start", "result"];
export const CHESS_IP_PER_HOUR = 300, CHESS_START_PER_HOUR = 40, CHESS_RESULT_PER_HOUR = 40, CHESS_MISS_PER_HOUR = 30;

// MY FILE's lines, in the Department's hand: the strongest figures beaten first, then a draw,
// then the losses and the citizen's own rating.
export function fileLines(rec) {
  if (!rec || !(rec.w + rec.d + rec.l)) return [];
  const out = [];
  const beaten = Object.entries(rec.beat || {}).map(([slug, n]) => ({ slug, n, r: rec.bestRatings?.[slug] ?? 0, name: rec.bestNames?.[slug] || slug })).sort((a, b) => b.r - a.r).slice(0, 3);
  for (const b of beaten) out.push(`DEFEATED ${b.name}${b.n > 1 ? ` (${b.n} TIMES)` : ""}. THE DEPARTMENT DOUBTS IT.`);
  const drew = (rec.games || []).find(g => g.res === "D");
  if (drew) out.push(`DREW WITH ${drew.name}. BOTH PARTIES DENY IT.`);
  if (rec.l) out.push(`LOST ${rec.l} ${rec.l === 1 ? "GAME" : "GAMES"} TO THE FIGURES. THIS SURPRISES NOBODY.`);
  out.push(`CITIZEN CHESS RATING ${rec.rating} // ${rec.w} WON, ${rec.d} DRAWN, ${rec.l} LOST. NO PRIZES. THERE WERE NEVER GOING TO BE PRIZES.`);
  return out;
}
const view = (rec) => rec ? { w: rec.w, d: rec.d, l: rec.l, rating: rec.rating, games: (rec.games || []).slice(0, 10), lines: fileLines(rec) } : null;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The board takes no other moves." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The board has no such move." });
  }
  const caseId = String((req.method === "GET" ? new URL(req.url).searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  try {
    if (req.method === "GET" && !caseId) return json(200, { board: await readBoard() }, { "Cache-Control": "public, max-age=15" });
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`chess-ip:${ip}`, CHESS_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The park has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (body.action === "start" && !(await hitLimit(`chess-start:${caseId}`, CHESS_START_PER_HOUR, "hour")).ok) return json(429, { error: "Forty games in an hour. The figures need to stretch their legs. Come back later." }, { "Retry-After": "3600" });
      if (body.action === "result" && !(await hitLimit(`chess-result:${caseId}`, CHESS_RESULT_PER_HOUR, "hour")).ok) return json(429, { error: "Too many results in an hour. The clerk has gone for tea." }, { "Retry-After": "3600" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`chess-miss:${ip}`, CHESS_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    if (!Array.isArray(rec.history) || !rec.history.length) return json(403, { error: "Only assessed subjects are rated. Be assessed; then lose to a dead grandmaster like a citizen." });
    if (req.method === "GET") return json(200, { record: view(await getRecord(caseId)), board: await readBoard() }, noStore);
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);

    if (body.action === "start") {
      const card = figureCard(String(body.vs || ""));
      if (!card) return json(404, { error: "That figure is not seated at the tables." });
      const side = body.side === "b" ? "b" : "w";
      const gameId = randomUUID().replace(/-/g, "").slice(0, 20), seed = randomInt(1, 2 ** 31 - 1);
      await putGame(gameId, { caseId, vs: card.slug, side, seed, at: Date.now() });
      return json(200, { gameId, seed, vs: card.slug, side }, noStore);
    }

    // result
    const gameId = String(body.gameId || "");
    if (!/^[a-f0-9]{20}$/.test(gameId)) return json(400, { error: "That is not a game the Department dealt." });
    const game = await getGame(gameId);
    if (!game || game.caseId !== caseId) return json(404, { error: "No such game on file. It may already have been filed." });
    if (Date.now() - game.at > GAME_TTL_MS) { await dropGame(gameId).catch(() => {}); return json(410, { error: "That game went cold. The pieces were put away." }); }
    const v = verifyGame(game, body);
    if (!v.ok) return json(422, { error: v.error }, noStore);
    await dropGame(gameId);   // one result per game, whatever follows
    const card = figureCard(game.vs), figElo = eloOf(card.rating);
    let result;
    try {
      result = await updateRecord(caseId, (r) => {
        if (v.res === "W" && (r.hashes || []).includes(v.hash)) return { out: { error: "That exact win is already on file. The Department does not file reruns." } };
        const exp = 1 / (1 + Math.pow(10, (figElo - r.rating) / 400)), sc = v.res === "W" ? 1 : v.res === "D" ? 0.5 : 0;
        const delta = Math.round(K_PLAYER * (sc - exp));
        r.rating += delta;
        r[v.res === "W" ? "w" : v.res === "D" ? "d" : "l"]++;
        r.games = [{ vs: card.slug, name: card.name.toUpperCase(), res: v.res, reason: v.reason, plies: v.plies, delta, at: new Date().toISOString() }, ...(r.games || [])].slice(0, KEEP_GAMES);
        if (v.res === "W") {
          r.beat = r.beat || {}; r.beat[card.slug] = (r.beat[card.slug] || 0) + 1;
          r.bestRatings = { ...(r.bestRatings || {}), [card.slug]: card.rating };
          r.bestNames = { ...(r.bestNames || {}), [card.slug]: card.name.toUpperCase() };
          r.hashes = [v.hash, ...(r.hashes || [])].slice(0, KEEP_HASHES);
        }
        return { record: r, out: { res: v.res, reason: v.reason, delta } };
      });
    } catch (e) {
      if (e instanceof Busy) return json(409, { error: "The clerk is filing your other game. One at a time." });
      throw e;
    }
    if (result.out?.error) return json(409, { error: result.out.error, record: view(result.record) }, noStore);
    await postBoard(caseId, result.record).catch(err => console.warn("chess board", err?.message));
    return json(200, { filed: result.out, record: view(result.record), board: await readBoard() }, noStore);
  } catch (err) {
    console.error("chess failed", err?.name, err?.message);
    return json(500, { error: "The park is closed. The pigeons have the tables." });
  }
};

export const config = { path: "/api/chess" };
