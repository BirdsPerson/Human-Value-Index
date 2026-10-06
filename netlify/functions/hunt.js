// /api/hunt: TAGGED OUT's verified board (the bar cabinet) (docs/CITY_SPEC.md "THE HUNT"), the aquarium's replay check
// (netlify/functions/aquarium.js) without the case file: arcade initials are the credential.
//   GET                          today's board (the machine day): the top ten, re-played every one
//   POST {action: "permit", trip}
//                                a signed permit: {permit, seed, at}. The seed and the start come from
//                                here, so nobody shoots a thousand seeds offline for a soft one.
//   POST {action: "file", permit, inputLog, claim: {score}, tag}
//                                re-plays the trip in node (src/play/hunt/sim.js, the same pure sim the
//                                page runs) and puts it on the day's board only when it finishes with
//                                exactly the claimed score. One filing per permit.
import { randomBytes, randomInt } from "node:crypto";
import { hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { signPermit, readPermit, fileTrip, publicBoard, readBoard, updateBoard, Busy, PERMIT_TTL_MS } from "../lib/hunt-store.js";
import { verifyHunt, logTicks, tripTicks, VERSION, HZ } from "../../src/play/hunt/sim.js";
import { TRIP, conditionsAt } from "../../src/play/hunt/data.js";

export const ACTIONS = ["permit", "file"];
export const IP_PER_HOUR = 240, PERMITS_PER_HOUR = 60, FILES_PER_HOUR = 40;
export const MAX_LOG = 40_000;
export const CLOCK_SLACK_TICKS = 10 * HZ;
export const cleanTag = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
const today = (now = Date.now()) => conditionsAt(now).day;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The cabinet accepts nothing else." });
  try {
    if (req.method === "GET") { const day = today(); return json(200, { v: VERSION, ...publicBoard(await readBoard(day), day) }, { "Cache-Control": "public, max-age=15" }); }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body = {};
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The cabinet has no such slot." });
    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`hunt-ip:${ip}`, IP_PER_HOUR, "hour")).ok) return json(429, { error: "The cabinet has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (body.action === "permit" && !(await hitLimit(`hunt-permit:${ip}`, PERMITS_PER_HOUR, "hour")).ok) return json(429, { error: "Sixty permits in an hour. The deer have filed a complaint." }, { "Retry-After": "3600" });
      if (body.action === "file" && !(await hitLimit(`hunt-file:${ip}`, FILES_PER_HOUR, "hour")).ok) return json(429, { error: "The clerk has filed enough of your trips for one hour." }, { "Retry-After": "3600" });
    } catch { return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" }); }

    if (body.action === "permit") {
      const trip = String(body.trip || "");
      if (!TRIP[trip]) return json(404, { error: "No such trip on file." });
      const p = { id: randomBytes(8).toString("hex"), seed: randomInt(1, 2 ** 31 - 1), at: Date.now(), trip };
      return json(200, { permit: signPermit(p), seed: p.seed, at: p.at, trip, v: VERSION }, noStore);
    }

    // file
    const p = readPermit(body.permit);
    if (!p || !TRIP[p.trip]) return json(400, { error: "That is not a permit the cabinet issued." });
    const now = Date.now();
    if (now - p.at > PERMIT_TTL_MS) return json(410, { error: "That permit has expired. The season moved on without you." });
    const tag = cleanTag(body.tag);
    if (tag.length < 1) return json(400, { error: "Initials, please. The marquee has room for three." });
    const log = body.inputLog, claim = body.claim;
    if (!Array.isArray(log) || log.length > MAX_LOG) return json(413, { error: "The log is longer than any trip." });
    if (!claim || !Number.isInteger(claim.score) || claim.score < 0) return json(400, { error: "The claim is not legible." });
    const ticks = logTicks(log);
    if (ticks > tripTicks(p.trip)) return json(422, { error: "THAT LOG IS LONGER THAN THE TRIP." }, noStore);
    if (ticks > ((now - p.at) / 1000) * HZ + CLOCK_SLACK_TICKS) return json(422, { error: "THAT TRIP IS LONGER THAN THE TIME SINCE THE PERMIT. THE DEPARTMENT KEEPS THE CLOCK." }, noStore);
    const v = verifyHunt({ v: VERSION, seed: p.seed, trip: p.trip, at: p.at }, log, claim);
    if (!v.ok) return json(422, { error: v.error }, noStore);
    const day = today(now), r = v.result;
    const entry = { day, tag, trip: p.trip, score: r.score, sp: r.trophy?.sp || null, pts: r.trophy?.pts || 0, inches: r.trophy?.inches || 0, at: new Date(now).toISOString() };
    let out;
    try { out = await updateBoard(day, (b) => { const f = fileTrip(b, entry, p.id); return f.dup ? { out: f } : { data: f.board, out: f }; }); }
    catch (e) { if (e instanceof Busy) return json(409, { error: "The clerk is filing another trip. Try again." }); throw e; }
    if (out.out.dup) return json(409, { error: "That trip is already on file." });
    return json(200, { filed: { tag, score: r.score, rank: out.out.rank, replayTicks: v.ticks }, board: publicBoard(out.data, day) }, noStore);
  } catch (err) {
    console.error("hunt failed", err?.name, err?.message);
    return json(500, { error: "The cabinet is out of order. The trophies are being dusted." });
  }
};

export const config = { path: "/api/hunt" };
