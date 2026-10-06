// /api/tournament: THE OPEN TOURNAMENTS (docs/TOURNAMENTS.md). Async: everyone plays the identical setup
// (calendar.js, rules.js) whenever they like inside the window; each card is re-played here
// (netlify/lib/tournament-verify.js) before it goes on the board.
//   GET                          the calendar around now: every event open, upcoming (a week) and just
//                                closed (three days), each with its leaders by division
//   GET  ?id=<event>             one event and its boards (projected while open, final after)
//   GET  ?caseId=                the file's own: its events, places and honours
//   POST {caseId, action: "enter", id, div}
//                                an entry permit for the file's official attempt (the same permit again
//                                while that attempt is unfinished, so a reload does not cost the entry)
//   POST {caseId, action: "submit", permit, leg, inputLog, claim, opts?, n?, v?}
//                                re-plays the leg from the event's locked setup; files it only when it
//                                comes out exactly as claimed; one official result per leg of an attempt
// An unclaimed file enters on its number; a file secured to an email enters and submits only from that
// account's session (lib/auth.js requireCaseAuth). Practice needs nothing. The GET is open: a file's
// places and honours are what the boards show.
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { eventsBetween, eventById, statusOf, ID_RE, GRACE_MS } from "../../src/tournament/calendar.js";
import { holderName, isDiv, golfCfg, bowlCfg, fishCfg } from "../../src/tournament/rules.js";
import { adapterOf } from "../lib/tournament-verify.js";
import {
  signPermit, readPermit, enter, fileLeg, legStart, standings, publicStandings, placeOf, readBoard, updateBoard,
  getRecord, noteEntered, holderKey, Busy, PERMIT_TTL_MS,
} from "../lib/tournament-store.js";

export const ACTIONS = ["enter", "submit"];
export const IP_PER_HOUR = 300, ENTERS_PER_HOUR = 30, SUBMITS_PER_HOUR = 60, MISS_PER_HOUR = 30;
export const CLOCK_SLACK_S = 10;
const DAY = 86400000;
const pubEvent = (ev, nowMs) => ({ id: ev.id, game: ev.game, kind: ev.kind, name: ev.name, venue: ev.venue, opens: ev.opens, closes: ev.closes, legs: ev.legs, cond: ev.cond, attempts: ev.attempts, format: ev.format, lower: ev.lower, major: ev.major, prizes: ev.prizes, href: ev.href, status: statusOf(ev, nowMs) });
const setupOf = (ev, div) => (ev.game === "golf" ? { golf: golfCfg(ev, div) } : ev.game === "bowling" ? { bowling: Array.from({ length: ev.legs }, (_, i) => bowlCfg(ev, i, div, {}).seed) } : ev.game === "fish" ? { fish: fishCfg(ev) } : {});

export async function calendarView(nowMs) {
  const evs = eventsBetween(nowMs - 3 * DAY, nowMs + 7 * DAY);
  const read = evs.filter(e => statusOf(e, nowMs) !== "upcoming").slice(-16);
  const boards = new Map(await Promise.all(read.map(async e => [e.id, await readBoard(e.id).catch(() => null)])));
  return evs.map(e => {
    const p = pubEvent(e, nowMs);
    if (!boards.has(e.id)) return { ...p, entrants: 0, leaders: null };
    const s = publicStandings(standings(boards.get(e.id), e, nowMs), 5);
    return { ...p, entrants: s.entrants, final: s.final, leaders: s.divisions };
  });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The clubhouse accepts nothing else." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  const url = new URL(req.url);
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The clubhouse has no such desk." });
  }
  const now = Date.now();
  try {
    if (req.method === "GET") {
      const id = url.searchParams.get("id"), cq = url.searchParams.get("caseId");
      if (id) {
        const ev = ID_RE.test(id) ? eventById(id) : null;
        if (!ev) return json(404, { error: "NO SUCH EVENT ON THE CALENDAR." });
        const s = standings(await readBoard(ev.id), ev, now);
        return json(200, { now, event: pubEvent(ev, now), board: publicStandings(s, 100) }, { "Cache-Control": "public, max-age=15" });
      }
      if (!cq) return json(200, { now, events: await calendarView(now) }, { "Cache-Control": "public, max-age=30" });
    }
    const caseId = String((req.method === "GET" ? url.searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "Tournaments accept cards from files. That is not a case number." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`tourney-ip:${ip}`, IP_PER_HOUR, "hour")).ok) return json(429, { error: "The clubhouse has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (body.action === "enter" && !(await hitLimit(`tourney-enter:${caseId}`, ENTERS_PER_HOUR, "hour")).ok) return json(429, { error: "Thirty entries in an hour. The starter has gone home." }, { "Retry-After": "3600" });
      if (body.action === "submit" && !(await hitLimit(`tourney-submit:${caseId}`, SUBMITS_PER_HOUR, "hour")).ok) return json(429, { error: "Sixty cards in an hour. The scorers need to sit down." }, { "Retry-After": "3600" });
    } catch { return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" }); }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`tourney-miss:${ip}`, MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    const k = holderKey(caseId);

    if (req.method === "GET") {
      const mine = await getRecord(caseId);
      const places = [];
      for (const id of (mine?.ids || []).slice(0, 12)) {
        const ev = eventById(id);
        if (!ev) continue;
        const s = standings(await readBoard(id), ev, now), p = placeOf(s, k);
        places.push({ id, name: ev.name, game: ev.game, href: ev.href, status: s.status, final: s.final, ...(p ? { pos: p.pos, of: p.of, div: p.div, total: p.row.total, par: p.row.par, done: p.row.done, legs: p.row.legs } : {}) });
      }
      return json(200, { now, mine: { honours: mine?.honours || [], places } }, noStore);
    }
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);

    const ev = body.action === "enter" ? (ID_RE.test(String(body.id || "")) ? eventById(body.id) : null) : null;
    if (body.action === "enter") {
      if (!ev) return json(404, { error: "NO SUCH EVENT ON THE CALENDAR." });
      const div = String(body.div || "");
      if (!isDiv(div)) return json(400, { error: "NO SUCH DIVISION. OPEN OR ASSISTED." });
      let out;
      try {
        out = await updateBoard(ev.id, (b) => {
          const r = enter(b, ev, { k, holder: holderName(caseId), cid: caseId, div, nowMs: now });
          return r.error ? { out: r } : r.resumed ? { out: r } : { data: r.board, out: r };
        });
      } catch (e) { if (e instanceof Busy) return json(409, { error: "The starter is busy. Try again." }); throw e; }
      if (out.out.error) return json(out.out.status, { error: out.out.error }, noStore);
      await noteEntered(caseId, ev.id).catch(() => {});
      const a = out.out.attempt;
      return json(200, { permit: signPermit({ id: ev.id, k, n: a.n, div: a.div, at: a.at }), event: pubEvent(ev, now), div: a.div, attempt: a.n, at: a.at, resumed: out.out.resumed, legsFiled: out.out.legs, setup: setupOf(ev, a.div), expires: a.at + PERMIT_TTL_MS }, noStore);
    }

    // submit
    const p = readPermit(body.permit);
    if (!p || p.k !== k) return json(400, { error: "That is not an entry the clubhouse issued to this file." });
    const sev = eventById(p.id);
    if (!sev) return json(404, { error: "NO SUCH EVENT ON THE CALENDAR." });
    if (now - p.at > PERMIT_TTL_MS) return json(410, { error: "THAT ENTRY HAS EXPIRED. THE DEPARTMENT WAITED. IT DOES NOT WAIT LONG." }, noStore);
    if (statusOf(sev, now) === "closed") return json(410, { error: `THE BOARD CLOSED ${Math.round(GRACE_MS / 60000)} MINUTES AFTER THE WINDOW. THE CARD ARRIVED AFTER THE RESULT.` }, noStore);
    const ad = adapterOf(sev);
    if (!ad) return json(404, { error: "THAT GAME KEEPS NO TOURNAMENT BOARD." });
    const leg = Number.isInteger(body.leg) ? body.leg : 0;
    const board0 = await readBoard(sev.id);
    const from = legStart(board0, k, p.n);
    if (from == null) return json(404, { error: "NO SUCH ENTRY ON THE BOARD. ENTER FIRST." }, noStore);
    const att = board0.entries[k].att.find(x => x.n === p.n);
    if (att.done || leg < att.legs.length) return json(409, { error: att.done ? "THAT ATTEMPT IS ALREADY ON THE BOARD. ONE OFFICIAL RESULT AN ATTEMPT." : "THAT GAME IS ALREADY ON THE BOARD." }, noStore);
    if (!Array.isArray(body.inputLog)) return json(400, { error: "THE CARD'S LOG IS NOT LEGIBLE." }, noStore);
    let ticks;
    try { ticks = ad.logTicks(body.inputLog); } catch { return json(400, { error: "THE CARD'S LOG IS NOT LEGIBLE." }, noStore); }
    if (!(ticks <= ((now - from) / 1000 + CLOCK_SLACK_S) * ad.hz)) return json(422, { error: "THAT CARD IS LONGER THAN THE TIME SINCE THE ENTRY. THE DEPARTMENT KEEPS THE CLOCK." }, noStore);
    const v = ad.verify(sev, leg, p.div, { inputLog: body.inputLog, claim: body.claim, opts: body.opts, n: body.n, v: body.v });
    if (!v.ok) return json(422, { error: v.error }, noStore);
    let out;
    try {
      out = await updateBoard(sev.id, (b) => { const r = fileLeg(b, sev, { k, n: p.n, leg, result: v.leg, nowMs: now }); return r.error ? { out: r } : { data: r.board, out: r }; });
    } catch (e) { if (e instanceof Busy) return json(409, { error: "The scorers are filing another card. Try again." }); throw e; }
    if (out.out.error) return json(out.out.status, { error: out.out.error }, noStore);
    const s = standings(out.data, sev, now), place = placeOf(s, k);
    return json(200, { filed: { leg, total: v.leg.total, par: v.leg.par ?? null, ticks: v.leg.ticks }, done: Boolean(out.out.entry.att.find(a => a.n === p.n)?.done), standing: place ? { pos: place.pos, of: place.of, div: place.div, total: place.row.total, par: place.row.par, legs: place.row.legs, done: place.row.done } : null, final: s.final }, noStore);
  } catch (err) {
    console.error("tournament failed", err?.name, err?.message);
    return json(500, { error: "The clubhouse is closed. The trophies are being polished." });
  }
};

export const config = { path: "/api/tournament" };
