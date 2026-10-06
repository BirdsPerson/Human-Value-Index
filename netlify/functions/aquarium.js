// /api/aquarium: THE AQUARIUM (docs/CITY_SPEC.md "THE AQUARIUM"), the city's first server replay check.
//   GET                          every tank: the record, the previous records, the first donors
//   GET  ?caseId=                the same, and that file's donations and the records it holds
//   POST {caseId, action: "trip", spot, device?}
//                                a fishing permit: {tripId, seed, at}. The seed and the start time (the
//                                machine clock, the season, the light, the weather) come from here, so
//                                nobody fishes a thousand seeds offline for a lucky one.
//   POST {caseId, action: "donate", tripId, n, claim: {sp, cw, tl}, inputLog, device?}
//                                re-plays the trip in node (src/play/fish/sim.js, the same pure sim the
//                                page runs) and files catch n only when it comes out exactly as claimed
//                                (species, hundredths of a pound, tenths of an inch) and was not released.
// Holding the case number is the credential (as with /api/chess). Anyone can fish without one; donating
// needs a file. No money, no CYCLES: a plaque.
import { randomInt, randomUUID } from "node:crypto";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";
import { deviceHash } from "../lib/assembly.js";
import { NO_SUCH_FILE } from "./case.js";
import { getRecord, updateRecord, readTanks, updateTanks, fileDonation, publicTanks, recordsHeld, holderKey, holderName, Busy, TRIP_TTL_MS, KEEP_TRIPS, KEEP_DONATIONS } from "../lib/aquarium-store.js";
import { verifyCatch, logTicks, VERSION, HZ, TRIP_TICKS } from "../../src/play/fish/sim.js";
import { SPOT, SPECIES_BY } from "../../src/play/fish/data.js";

export const ACTIONS = ["trip", "donate"];
export const AQ_IP_PER_HOUR = 300, TRIPS_PER_HOUR = 30, DONATIONS_PER_HOUR = 30, DONATIONS_PER_DEVICE_HOUR = 40, AQ_MISS_PER_HOUR = 30;
export const MAX_LOG = 200_000;          // numbers in a run-length log (two real hours of play is a few thousand)
export const CLOCK_SLACK_TICKS = 10 * HZ; // a log may run ten seconds past the wall clock (latency)

const view = (rec, tanks, caseId) => rec ? { donations: (rec.donations || []).slice(0, 30), records: recordsHeld(tanks, caseId), n: rec.n || 0 } : { donations: [], records: recordsHeld(tanks, caseId), n: 0 };

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The aquarium accepts nothing else." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
  let body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return json(400, { error: "Your request is not legible." }); }
    if (!ACTIONS.includes(body?.action)) return json(400, { error: "The aquarium has no such desk." });
  }
  const caseId = String((req.method === "GET" ? new URL(req.url).searchParams.get("caseId") : body?.caseId) || "").trim().toUpperCase();
  try {
    if (req.method === "GET" && !caseId) return json(200, { v: VERSION, tanks: publicTanks(await readTanks()) }, { "Cache-Control": "public, max-age=15" });
    if (!isCaseId(caseId)) return json(400, { error: "Donations are accepted from files. That is not a case number." });
    const ip = clientIp(req, context), dev = deviceHash(body?.device);
    try {
      if (!(await hitLimit(`aq-ip:${ip}`, AQ_IP_PER_HOUR, "hour")).ok) return json(429, { error: "The aquarium has seen enough of your location for one hour." }, { "Retry-After": "3600" });
      if (body.action === "trip" && !(await hitLimit(`aq-trip:${caseId}`, TRIPS_PER_HOUR, "hour")).ok) return json(429, { error: "Thirty permits in an hour. The fish have filed a complaint. Come back later." }, { "Retry-After": "3600" });
      if (body.action === "donate") {
        if (!(await hitLimit(`aq-donate:${caseId}`, DONATIONS_PER_HOUR, "hour")).ok) return json(429, { error: "Thirty donations in an hour. The tanks are full of your fish. Come back later." }, { "Retry-After": "3600" });
        if (dev && !(await hitLimit(`aq-donate-dev:${dev}`, DONATIONS_PER_DEVICE_HOUR, "hour")).ok) return json(429, { error: "This terminal has donated enough for one hour." }, { "Retry-After": "3600" });
      }
    } catch {
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }
    const rec = await getCase(caseId);
    if (!rec) {
      const miss = await hitLimit(`aq-miss:${ip}`, AQ_MISS_PER_HOUR, "hour").catch(() => ({ ok: false }));
      return json(miss.ok ? 404 : 429, { error: miss.ok ? NO_SUCH_FILE : "Too many wrong case numbers. The Department suspects you are guessing." });
    }
    if (req.method === "GET") { const tanks = await readTanks(); return json(200, { v: VERSION, tanks: publicTanks(tanks), mine: view(await getRecord(caseId), tanks, caseId) }, noStore); }

    if (body.action === "trip") {
      const spot = String(body.spot || "");
      if (!SPOT[spot]) return json(404, { error: "No such water on file." });
      const trip = { id: randomUUID().replace(/-/g, "").slice(0, 20), seed: randomInt(1, 2 ** 31 - 1), spot, at: Date.now(), donated: [] };
      await updateRecord(caseId, (r) => { r.trips = [trip, ...(r.trips || [])].slice(0, KEEP_TRIPS); return { data: r }; });
      return json(200, { tripId: trip.id, seed: trip.seed, spot, at: trip.at, v: VERSION }, noStore);
    }

    // donate
    const tripId = String(body.tripId || ""), n = body.n, claim = body.claim, log = body.inputLog;
    if (!/^[a-f0-9]{20}$/.test(tripId)) return json(400, { error: "That is not a permit the aquarium issued." });
    if (!Number.isInteger(n) || n < 0 || n > 500) return json(400, { error: "Which fish? The catch number is not legible." });
    if (!claim || typeof claim.sp !== "string" || !SPECIES_BY[claim.sp] || !Number.isInteger(claim.cw) || !Number.isInteger(claim.tl)) return json(400, { error: "The claim is not legible: species, weight, length." });
    if (!Array.isArray(log) || log.length > MAX_LOG) return json(413, { error: "The log is longer than any trip." });
    const mine = await getRecord(caseId);
    const trip = (mine?.trips || []).find(t => t.id === tripId);
    if (!trip) return json(404, { error: "No such permit on your file. It may have expired." });
    const now = Date.now();
    if (now - trip.at > TRIP_TTL_MS) return json(410, { error: "That permit has expired. The fish has been returned to the sea in spirit." });
    if ((trip.donated || []).includes(n)) return json(409, { error: "That fish is already in the aquarium." });
    // the log cannot hold more play than the clock allows since the permit was issued
    const ticks = logTicks(log);
    if (ticks > ((now - trip.at) / 1000) * HZ + CLOCK_SLACK_TICKS) return json(422, { error: "THAT TRIP IS LONGER THAN THE TIME SINCE THE PERMIT. THE DEPARTMENT KEEPS THE CLOCK." }, noStore);
    const v = verifyCatch({ seed: trip.seed, spot: trip.spot, at: trip.at }, log, n, claim, { maxTicks: TRIP_TICKS });
    if (!v.ok) return json(422, { error: v.error }, noStore);
    const c = v.catch;
    // the permit's catch is spoken for before the plaque moves (one donation per fish, whatever follows)
    let taken;
    try {
      taken = await updateRecord(caseId, (r) => {
        const t = (r.trips || []).find(x => x.id === tripId);
        if (!t || (t.donated || []).includes(n)) return { out: "dup" };
        t.donated = [...(t.donated || []), n];
        return { data: r, out: "ok" };
      });
    } catch (e) { if (e instanceof Busy) return json(409, { error: "The clerk is filing your other fish. One at a time." }); throw e; }
    if (taken.out !== "ok") return json(409, { error: "That fish is already in the aquarium." });
    const entry = { k: holderKey(caseId), holder: holderName(caseId), sp: c.sp, cw: c.cw, tl: c.tl, spot: trip.spot, day: c.day, at: new Date(now).toISOString() };
    const filed = await updateTanks((tanks) => { const r = fileDonation(tanks, entry); return { data: r.tanks, out: { record: r.record, beat: r.beat ? { holder: r.beat.holder, cw: r.beat.cw } : null } }; });
    const after = await updateRecord(caseId, (r) => {
      r.donations = [{ sp: c.sp, cw: c.cw, tl: c.tl, spot: trip.spot, day: c.day, at: entry.at, record: filed.out.record }, ...(r.donations || [])].slice(0, KEEP_DONATIONS);
      r.n = (r.n || 0) + 1;
      return { data: r };
    });
    return json(200, { filed: { sp: c.sp, name: SPECIES_BY[c.sp].name, cw: c.cw, tl: c.tl, holder: entry.holder, record: filed.out.record, beat: filed.out.beat, replayTicks: v.ticks }, tank: publicTanks(filed.data)[c.sp], mine: view(after.data, filed.data, caseId) }, noStore);
  } catch (err) {
    console.error("aquarium failed", err?.name, err?.message);
    return json(500, { error: "The aquarium is closed. The tanks are being cleaned." });
  }
};

export const config = { path: "/api/aquarium" };
