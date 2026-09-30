// THE COUNCIL ELECTIONS (docs/CITY_SPEC.md "Council elections").
// GET    /api/elections[?caseId=]  the cycle, every district's race (candidates, the players'
//        running tally, the Substrate's advisory lean), the result once closed, and with a case
//        number that file's own ballots. The first GET ever anchors the calendar.
// POST   /api/elections {caseId, district, candidate (a key, or null to withdraw), device}
//        cast, change or withdraw one race's ballot. Holding the case number is the credential
//        (as with /api/assembly). Non-binding civic theatre. No paid API is called here.
// POST   {caseId, district, writein (a subject's key), device}   a write-in ballot instead
// GET    /api/elections?writein=<district>&q=<text>[&caseId=]   the write-in picker's type-ahead:
//        subjects on file who live or work there and may be written in, and with a case number
//        the file's own citizen. -> {hits: [{key, name, living, self}], self: {key, name} | null}
// POST   {caseId, resign: {cycle, district}}   a player citizen elected declines or resigns.
// POST   {caseId, declare: {district, withdraw?}, device}   a player declares (or withdraws) its
//        citizen's candidacy in a race where it lives or works; others may then write it in.
// GET    /api/elections?candidacy=1&caseId=   MY FILE's candidacy panel: where the file's citizen
//        may stand and where it has declared.
import { getStore } from "@netlify/blobs";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit, listFigures } from "../lib/store.js";
import { closedToOpinion } from "../lib/petition.js";
import { FAMOUS_FIGURES, slugify } from "../../src/figures.js";
import { censusSubjects } from "../lib/census.js";
import { fullRoster } from "../../src/city/roster.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";
import { STORE, publicView, castBallot, myBallots, mySeats, resignSeat, writeinPool, writeinSearch, selfWriteIn, isOpen, KEYS, declareCandidacy, myCandidacy, readCands } from "../lib/elections.js";
import { cycleAt } from "../../src/city/councilCalendar.js";

const store = () => getStore({ name: STORE, consistency: "strong" });
// The slate is drawn from the whole census, strictly: a failed read opens nothing.
const census = async () => fullRoster(await censusSubjects({ strict: true }));
// The write-in pool: the census, less every file closed to opinion (read from the full files:
// the census drops harm reviews). Kept 10 minutes per warm instance and per cycle.
let pool = null;
async function writeins(meta) {
  if (pool && pool.cycle === meta.cycle && Date.now() - pool.at < 10 * 60 * 1000) return pool.p;
  const p = Promise.all([census(), listFigures()]).then(([subjects, files]) => {
    const closed = new Set();
    for (const f of FAMOUS_FIGURES) if (closedToOpinion(f, "roster")) closed.add(slugify(f.name));
    for (const c of files) if (closedToOpinion(c, "referral")) closed.add(c.slug);
    return writeinPool(subjects, meta, closed);
  });
  pool = { cycle: meta.cycle, at: Date.now(), p };
  p.catch(() => { if (pool?.p === p) pool = null; });
  return p;
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  const noStore = { "Cache-Control": "no-store" };
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "GET or POST. The Council hears nothing else." });
  try {
    const io = { store: store(), census, getCase, hitLimit, writeins };
    if (req.method === "GET") {
      const u = new URL(req.url);
      const caseId = String(u.searchParams.get("caseId") || "").trim().toUpperCase();
      if (u.searchParams.has("candidacy")) return json(200, isCaseId(caseId) ? await myCandidacy(io, caseId) : { open: false, districts: [] }, noStore);
      if (u.searchParams.has("writein")) return json(200, await pickerOf(io, String(u.searchParams.get("writein")).toLowerCase(), u.searchParams.get("q") || "", isCaseId(caseId) ? caseId : null), noStore);
      const view = await publicView(io);
      if (isCaseId(caseId)) {
        Object.assign(view, await myBallots(io.store, caseId));
        view.myseats = await mySeats(io.store, caseId);
      }
      return json(200, view, noStore);
    }
    if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: "Your ballot is not legible." }); }
    const caseId = String(body?.caseId || "").trim().toUpperCase();
    if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Only files vote." });
    if (body?.resign) {
      const cycle = Number(body.resign.cycle), district = String(body.resign.district || "").toLowerCase();
      if (!Number.isInteger(cycle) || cycle < 1) return json(400, { error: "No such term." });
      const r = await resignSeat(io, { caseId, cycle, district, ip: clientIp(req, context) });
      const extra = r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore;
      return json(r.status, r.body, extra);
    }
    if (body?.declare) {
      const r = await declareCandidacy(io, { caseId, district: String(body.declare.district || "").toLowerCase(), withdraw: body.declare.withdraw === true, ip: clientIp(req, context), device: body?.device });
      const extra = r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore;
      return json(r.status, r.body, extra);
    }
    const district = String(body?.district || "").toLowerCase();
    const candidate = body?.candidate == null ? null : String(body.candidate);
    const writein = body?.writein == null ? null : String(body.writein).toLowerCase().slice(0, 120);
    const r = await castBallot(io, { caseId, district, candidate, writein, ip: clientIp(req, context), device: body?.device });
    const extra = r.retry ? { ...noStore, "Retry-After": String(r.retry) } : noStore;
    if (r.status !== 200) return json(r.status, r.body, extra);
    const view = await publicView(io);
    return json(200, { ...view, mine: r.body.mine, mineWrite: r.body.mineWrite || {}, changed: r.body.changed || false, unchanged: r.body.unchanged || false, withdrawn: r.body.withdrawn || false }, noStore);
  } catch (err) {
    console.error("elections failed", err?.name, err?.message);
    return json(500, { error: "The Council is unavailable. The Department suspects a quorum. It is investigating." });
  }
};

// The picker: only while a race is open. The case number (optional) adds the file's own citizen.
async function pickerOf(io, district, q, caseId) {
  const now = Date.now();
  const anchor = await io.store.get(KEYS.anchor, { type: "json" });
  const meta = anchor ? await io.store.get(KEYS.meta(cycleAt(anchor.openAt, now)), { type: "json" }) : null;
  if (!isOpen(meta, now) || !meta.slate?.[district]?.length) return { hits: [], self: null, open: false };
  const [p, cands] = await Promise.all([writeins(meta), readCands(io.store, meta.cycle)]);
  const declared = Object.values(cands[district] || {});
  const rec = caseId ? await getCase(caseId).catch(() => null) : null;
  const self = rec ? selfWriteIn(p, caseId, rec) : null;
  // may: the file may declare here (its citizen is on the census); declared: it has
  const mine = self && self.districts.includes(district)
    ? { key: self.key, name: self.name, declared: declared.includes(self.key), may: p.citizens.has(self.key) && !p.closed.has(self.key) } : null;
  return { hits: String(q).trim() ? writeinSearch(p, district, q, self, { declared }) : [], self: mine, open: true };
}

export const config = { path: "/api/elections" };
