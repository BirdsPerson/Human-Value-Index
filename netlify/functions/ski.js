// /api/ski: THE MOUNTAIN's verified boards (src/play/ski/). After THE AQUARIUM, the city's second
// server replay check.
//   GET                          the boards (BOARDED challenges): best first, names, never keys
//   GET  ?caseId=                the same, and that file's own bests
//   POST {caseId, action: "start", ch}
//                                a permit for one run: {runId, at}. The start time is the server's, so
//                                a log can never hold more play than the clock allows since it.
//   POST {caseId, action: "file", runId, ch, board, inputLog, claim: {value}}
//                                re-plays the run in node (src/play/ski/sim.js, the same pure sim the page
//                                runs, from the challenge's one fixed start) and files it only when it
//                                finishes exactly as claimed.
// An unclaimed file files runs on its number; a file secured to an email only from that account's
// session (lib/auth.js requireCaseAuth). Anyone can ski without one; the boards need a file. No money,
// no CYCLES: a name on a board. The GET is open: the bests are what the boards show.
import { randomUUID } from "node:crypto";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { requireCaseAuth, caseAuthBody } from "../lib/auth.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { NO_SUCH_FILE } from "./case.js";
import { getRecord, updateRecord, readBoards, updateBoards, fileRun, publicBoards, holderKey, holderName, Busy, RUN_TTL_MS, KEEP_RUNS } from "../lib/ski-store.js";
import { replay, logTicks, VERSION, HZ } from "../../src/play/ski/sim.js";
import { CHALLENGE, LOWER_BETTER } from "../../src/play/ski/challenges.js";
import { BOARDED } from "../../src/play/ski/board.js";

export { BOARDED };
export const ACTIONS = ["start", "file"];
export const SKI_IP_PER_HOUR = 300, STARTS_PER_HOUR = 120, FILES_PER_HOUR = 60, SKI_MISS_PER_HOUR = 30;
export const MAX_LOG = 200_000;           // numbers in a run-length log
export const CLOCK_SLACK_TICKS = 10 * HZ; // a log may run ten seconds past the wall clock (latency)

const mineOf = (rec) => ({ best: rec?.best || {} });
const validLog = (log) => Array.isArray(log) && log.length > 0 && log.length % 2 === 0 && log.length <= MAX_LOG && log.every(n => Number.isInteger(n) && n >= 0 && n < 2 ** 31);

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The mountain accepts nothing else." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The mountain has no such desk." });
  }
  const caseId = String((req.method === "GET" ? new URL(req.url).searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  try {
    if (req.method === "GET" && !caseId) return json(200, { v: VERSION, boarded: BOARDED, boards: publicBoards(await readBoards()) }, { "Cache-Control": "public, max-age=15" });
    if (!isCaseId(caseId)) return json(400, { error: "The boards accept runs from files. That is not a case number." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`ski-ip:${ip}`, SKI_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The mountain has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (body.action === "start" && !(await hitLimit(`ski-start:${caseId}`, STARTS_PER_HOUR, "hour")).ok) return json(429, { error: "120 runs in an hour. The lift operator has filed a complaint. Come back later." }, { "Retry-After": "3600" });
      if (body.action === "file" && !(await hitLimit(`ski-file:${caseId}`, FILES_PER_HOUR, "hour")).ok) return json(429, { error: "Sixty runs filed in an hour. The judges need to sit down." }, { "Retry-After": "3600" });
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`ski-miss:${ip}`, SKI_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    if (req.method === "GET") return json(200, { v: VERSION, boarded: BOARDED, boards: publicBoards(await readBoards()), mine: mineOf(await getRecord(caseId)) }, noStore);
    const auth = await requireCaseAuth(req, caseId, { write: true });
    if (!auth.ok) return json(auth.status, caseAuthBody(auth), noStore);

    const ch = String(body.ch || "");
    if (!BOARDED.includes(ch) || !CHALLENGE[ch]) return json(404, { error: "That challenge keeps no board." });

    if (body.action === "start") {
      const run = { id: randomUUID().replace(/-/g, "").slice(0, 20), ch, at: Date.now(), filed: false };
      await updateRecord(caseId, (r) => { r.runs = [run, ...(r.runs || [])].slice(0, KEEP_RUNS); return { data: r }; });
      return json(200, { runId: run.id, ch, at: run.at, v: VERSION }, noStore);
    }

    // file
    const runId = String(body.runId || ""), log = body.inputLog, claim = body.claim;
    if (!/^[a-f0-9]{20}$/.test(runId)) return json(400, { error: "That is not a permit the mountain issued." });
    if (!claim || typeof claim.value !== "number" || !Number.isFinite(claim.value)) return json(400, { error: "The claim is not legible: a value." });
    if (!validLog(log)) return json(Array.isArray(log) && log.length > MAX_LOG ? 413 : 400, { error: "The input log is not legible. The judges read numbers, in pairs." });
    const mine = await getRecord(caseId);
    const run = (mine?.runs || []).find(t => t.id === runId);
    if (!run || run.ch !== ch) return json(404, { error: "No such permit on your file for that challenge. It may have expired." });
    const now = Date.now();
    if (now - run.at > RUN_TTL_MS) return json(410, { error: "That permit has expired. The snow it was issued for has melted." });
    if (run.filed) return json(409, { error: "That run is already on the board." });
    const ticks = logTicks(log);
    if (ticks > ((now - run.at) / 1000) * HZ + CLOCK_SLACK_TICKS) return json(422, { error: "THAT RUN IS LONGER THAN THE TIME SINCE THE PERMIT. THE DEPARTMENT KEEPS THE CLOCK." }, noStore);
    let out;
    try { out = replay({ v: VERSION, ch, board: Boolean(body.board), inputLog: log }); } catch { return json(422, { error: "THE RUN COULD NOT BE RE-PLAYED. THE JUDGES SAW NOTHING." }, noStore); }
    const res = out?.res;
    if (!res || res.value == null) return json(422, { error: `THE RE-PLAY DID NOT FINISH THE CHALLENGE${res?.why ? `: ${res.why}` : ""}. NOTHING TO FILE.` }, noStore);
    if (res.value !== claim.value) return json(422, { error: "THE RE-PLAY CAME OUT DIFFERENTLY. THE BOARD IS FOR WHAT HAPPENED." }, noStore);
    // the permit is spoken for before the board moves
    let taken;
    try {
      taken = await updateRecord(caseId, (r) => {
        const t = (r.runs || []).find(x => x.id === runId);
        if (!t || t.filed) return { out: "dup" };
        t.filed = true;
        const D = CHALLENGE[ch], lower = LOWER_BETTER(D), b = r.best?.[ch];
        r.best = { ...(r.best || {}) };
        if (b == null || (lower ? res.value < b : res.value > b)) r.best[ch] = res.value;
        return { data: r, out: "ok" };
      });
    } catch (e) { if (e instanceof Busy) return json(409, { error: "The clerk is filing your other run. One at a time." }); throw e; }
    if (taken.out !== "ok") return json(409, { error: "That run is already on the board." });
    const D = CHALLENGE[ch];
    const entry = { ch, k: holderKey(caseId), holder: holderName(caseId), value: res.value, unit: D.unit, medal: res.medal, board: Boolean(body.board), at: new Date(now).toISOString(), ticks: res.ticks };
    const filed = await updateBoards((boards) => { const r = fileRun(boards, entry, LOWER_BETTER(D)); return { data: r.boards, out: { rank: r.rank, improved: r.improved } }; });
    return json(200, { filed: { value: res.value, medal: res.medal, rank: filed.out.rank, improved: filed.out.improved, replayTicks: out.ticks }, board: publicBoards(filed.data)[ch] || [], mine: mineOf(taken.data) }, noStore);
  } catch (err) {
    console.error("ski failed", err?.name, err?.message);
    return json(500, { error: "The mountain is closed. The cats are grooming the boards." });
  }
};

export const config = { path: "/api/ski" };
