// THE ASSEMBLY (docs/ASSEMBLY.md): the ballot's rules, the tally under concurrent writes,
// the close, the city built from the outcome, and the content rule (living applicants are
// never quoted). Runs the real netlify/lib/assembly.js against an in-memory store with
// Netlify Blobs' etag semantics and random delays between every read and write.
import { readFileSync, readdirSync } from "node:fs";
import * as ASM from "../netlify/lib/assembly.js";
import * as SIM from "../src/city/sim.js";
import { LOOKAHEAD, buildPlans } from "../netlify/lib/plans.js";
import * as C from "../src/assembly/content.js";
import { CIVIC_ANCHORS, CIVIC_LOTS, FORUM, GOLF, FARM, SITE, SIGN } from "../src/city/civicGeo.js";

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("  FAIL", msg); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 3);

// ---- an in-memory Blobs store ----------------------------------------------------------------
function memStore({ failTally = 0 } = {}) {
  const m = new Map();
  let n = 0;
  const s = {
    m,
    async get(k) { await jitter(); const e = m.get(k); return e ? structuredClone(e.v) : null; },
    async getWithMetadata(k) { await jitter(); const e = m.get(k); return e ? { data: structuredClone(e.v), etag: e.etag } : null; },
    async setJSON(k, v, o = {}) {
      await jitter();
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      if (failTally && k.endsWith("/tally") && !s.healing && Math.random() < failTally) return { modified: false };
      m.set(k, { v: structuredClone(v), etag: `e${++n}` });
      return { modified: true };
    },
    async list({ prefix }) { await jitter(); return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
  return s;
}
const cases = new Map();
const OWNER = "HVI-KKN67AUZ";
for (let i = 0; i < 120; i++) cases.set(`HVI-T${String(i).padStart(7, "0")}`, { history: [{ score: 500 }] });
cases.set("HVI-UNASSESS", { history: [] });
cases.set(OWNER, { history: [{ score: 900 }] });
const ids = [...cases.keys()].filter(k => k.startsWith("HVI-T"));
function makeIo(store) {
  const lim = new Map();
  return {
    store, getCase: async (id) => cases.get(id) || null,
    hitLimit: async (key, max) => { const n = (lim.get(key) || 0) + 1; if (n > max) return { ok: false, count: n - 1 }; lim.set(key, n); return { ok: true, count: n }; },
  };
}
const dev = (i) => (i.toString(16).padStart(2, "0")).repeat(16);
const T0 = Date.UTC(2026, 9, 1, 12);

// ---- the session -------------------------------------------------------------------------------
{
  const st = memStore();
  const metas = await Promise.all([0, 1, 2, 3, 4].map(k => ASM.ensureSession(st, T0 + k)));
  ok(metas.every(m => m.openAt === metas[0].openAt && m.closeAt === metas[0].closeAt), "concurrent first runs agree on one session");
  ok(metas[0].closeAt - metas[0].openAt === 3 * 24 * 3600 * 1000, "the polls stay open 3 days from the first run");
  const again = await ASM.ensureSession(st, T0 + 999999);
  ok(again.openAt === metas[0].openAt, "a later run keeps the recorded times");
}

// ---- one vote per case, change, validation -----------------------------------------------------
{
  const st = memStore(), io = makeIo(st), now = T0 + 1000;
  await ASM.ensureSession(st, T0);
  const a = ids[0];
  let r = await ASM.castBallot(io, { caseId: a, choice: "golf", reasons: ["JOBS"], ip: "ip1", device: dev(1), now });
  ok(r.status === 200 && r.body.ballot.rev === 1, "a first ballot is cast");
  r = await ASM.castBallot(io, { caseId: a, choice: "farm", reasons: ["FOOD", "SPITE"], ip: "ip1", device: dev(1), now });
  ok(r.status === 200 && r.body.changed && r.body.ballot.rev === 2, "the same file changes its ballot");
  r = await ASM.castBallot(io, { caseId: a, choice: "farm", reasons: ["FOOD", "SPITE"], ip: "ip1", device: dev(1), now });
  ok(r.status === 200 && r.body.unchanged && r.body.ballot.rev === 2, "an identical ballot changes nothing");
  let c = ASM.countsOf((await ASM.readTally(st)).seen);
  ok(c.voters === 1 && c.votes.golf === 0 && c.votes.farm === 1 && c.reasons.farm.FOOD === 1 && c.reasons.farm.SPITE === 1 && c.reasons.golf.JOBS === 0, "one file, one vote: the change replaces the first");
  r = await ASM.castBallot(io, { caseId: "HVI-UNASSESS", choice: "golf", reasons: ["JOBS"], ip: "ip2", now });
  ok(r.status === 403, "an unassessed file cannot vote");
  r = await ASM.castBallot(io, { caseId: "HVI-NOSUCH01", choice: "golf", reasons: ["JOBS"], ip: "ip2", now });
  ok(r.status === 404, "no file, no vote");
  ok(ASM.parseBallot({ choice: "mall", reasons: ["JOBS"] }).error, "only 001 or 002");
  ok(ASM.parseBallot({ choice: "golf", reasons: [] }).error, "at least one reason");
  ok(ASM.parseBallot({ choice: "golf", reasons: ["JOBS", "LAND", "FOOD", "SPITE"] }).error, "at most three reasons");
  ok(ASM.parseBallot({ choice: "golf", reasons: ["because I said so"] }).error, "no free text");
  ok(ASM.parseBallot({ choice: "golf", reasons: ["JOBS", "JOBS"] }).error, "no reason twice");
  ok(ASM.parseBallot({ choice: "FARM", reasons: ["land", "food"] }).choice === "farm", "case-insensitive fixed list");
  ok(!JSON.stringify([...st.m.entries()]).includes(a), "the store never holds a case number");
  const mine = await ASM.myBallot(st, a);
  ok(mine && mine.choice === "farm" && mine.rev === 2, "a file reads its own ballot");
  ok((await ASM.myBallot(st, ids[99])) === null, "a file that has not voted reads nothing");
}

// ---- rate limits (the owner's case included) --------------------------------------------------------
{
  const st = memStore(), io = makeIo(st), now = T0 + 1000;
  await ASM.ensureSession(st, T0);
  const L = ASM.LIMITS;
  for (let i = 0; i < L.casesPerIp; i++) ok((await ASM.castBallot(io, { caseId: ids[10 + i], choice: "golf", reasons: ["JOBS"], ip: "shared", device: dev(10 + i), now })).status === 200, `case ${i + 1} from one address`);
  let r = await ASM.castBallot(io, { caseId: OWNER, choice: "golf", reasons: ["JOBS"], ip: "shared", device: dev(99), now });
  ok(r.status === 429, "past the cap from one address, even the owner's file is refused");
  r = await ASM.castBallot(io, { caseId: ids[20], choice: "farm", reasons: ["FOOD"], ip: "shared", device: dev(98), now });
  ok(r.status === 429, "a fresh file from a full address is refused");
  r = await ASM.castBallot(io, { caseId: ids[10], choice: "farm", reasons: ["FOOD"], ip: "shared", device: dev(10), now });
  ok(r.status === 200, "a file already counted there may still change its ballot");
  for (let i = 0; i < L.casesPerDevice; i++) ok((await ASM.castBallot(io, { caseId: ids[30 + i], choice: "golf", reasons: ["LEISURE"], ip: `d${i}`, device: dev(7), now })).status === 200, `case ${i + 1} from one device`);
  r = await ASM.castBallot(io, { caseId: OWNER, choice: "golf", reasons: ["LEISURE"], ip: "elsewhere", device: dev(7), now });
  ok(r.status === 429, "past the cap from one device (whatever the address), the owner's file too");
  const one = ids[40];
  let last = null;
  for (let k = 0; k < L.revisions + 1; k++) last = await ASM.castBallot(io, { caseId: one, choice: k % 2 ? "golf" : "farm", reasons: [k % 2 ? "JOBS" : "LAND"], ip: `rev${k % 3}`, device: dev(40), now });
  ok(last.status === 429, `a file cannot change its mind more than ${L.revisions} times`);
  const io2 = makeIo(st);
  let got = [];
  for (let k = 0; k < L.ballotsPerIpHour + 1; k++) got.push((await ASM.castBallot(io2, { caseId: ids[50], choice: k % 2 ? "golf" : "farm", reasons: ["BEAUTY"], ip: "busy", device: dev(50), now })).status);
  ok(got.at(-1) === 429, `${L.ballotsPerIpHour} ballots an hour from one address`);
  const c = ASM.countsOf((await ASM.readTally(st)).seen);
  const voters = (await st.list({ prefix: ASM.KEYS.voters })).blobs.length;
  ok(c.voters === voters, "the tally holds one entry per voter");
}

// ---- concurrency: the tally equals the ballots ---------------------------------------------------------
for (const failTally of [0, 0.35]) {
  const st = memStore({ failTally }), io = makeIo(st), now = T0 + 1000;
  await ASM.ensureSession(st, T0);
  // without injected failures, 16 at a time (a busy minute); with them, all 320 at once
  const res = [];
  const batch = failTally ? 320 : 16;
  for (let k0 = 0; k0 < 320; k0 += batch) {
    const jobs = [];
    for (let k = k0; k < Math.min(320, k0 + batch); k++) {
      const i = Math.floor(Math.random() * 90), choice = Math.random() < 0.5 ? "golf" : "farm";
      const reasons = C.REASONS.filter(() => Math.random() < 0.35).slice(0, 3);
      jobs.push(ASM.castBallot(io, { caseId: ids[i], choice, reasons: reasons.length ? reasons : ["SPITE"], ip: `ip${i}`, device: dev(i), now }));
    }
    res.push(...await Promise.all(jobs));
  }
  ok(res.every(r => r.status === 200 || r.status === 409 || r.status === 429), `concurrent ballots answer sanely (fail ${failTally})`);
  const truth = async () => {
    const keys = (await st.list({ prefix: ASM.KEYS.voters })).blobs.map(b => b.key);
    const seen = {};
    for (const k of keys) { const b = await st.get(k); seen[k.slice(ASM.KEYS.voters.length)] = [b.rev, ASM.CHOICES.indexOf(b.c), ASM.reasonMask(b.r)]; }
    return ASM.countsOf(seen);
  };
  const want = await truth();
  if (!failTally) ok(JSON.stringify(ASM.countsOf((await ASM.readTally(st)).seen)) === JSON.stringify(want), "with every fold landing, the tally equals the ballots exactly");
  st.healing = true;
  await ASM.heal(st, { now });
  const got = ASM.countsOf((await ASM.readTally(st)).seen);
  ok(JSON.stringify(got) === JSON.stringify(want), `after a recount, the tally equals the ballots (fold failure ${failTally})`);
  // folds arriving late and out of order never undo a newer ballot
  const t = await ASM.readTally(st), vk = Object.keys(t.seen)[0];
  await ASM.fold(st, { [vk]: { rev: 1, c: "golf", r: ["JOBS"] } }, { now });
  ok(JSON.stringify((await ASM.readTally(st)).seen[vk]) === JSON.stringify(t.seen[vk]), "a stale fold is ignored");
  // the close: decided once, from a recount, and ballots after it are refused
  const meta = await ASM.readSession(st);
  const r0 = await ASM.finalize(st, meta.closeAt - 1);
  ok(r0 === null, "no result before the close");
  const [r1, r2] = await Promise.all([ASM.finalize(st, meta.closeAt + 5), ASM.finalize(st, meta.closeAt + 9)]);
  ok(r1 && r2 && r1.winner === r2.winner && r1.decidedAt === r2.decidedAt, "concurrent closes agree on one result");
  ok(r1.votes.golf === want.votes.golf && r1.votes.farm === want.votes.farm, "the result is the recount");
  ok(r1.winner === (want.votes.golf === want.votes.farm ? ASM.chairCoin() : want.votes.golf > want.votes.farm ? "golf" : "farm"), "the winner is the majority (the chair's coin on a tie)");
  const late = await ASM.castBallot(io, { caseId: ids[100], choice: "golf", reasons: ["SPITE"], ip: "late", device: dev(100), now: meta.closeAt + 10 });
  ok(late.status === 403 && late.body.closed, "closed after the deadline");
  const civic = await ASM.civicOf(st, meta.closeAt + 20);
  ok(civic.closeAt === meta.closeAt && civic.winner === r1.winner, "the city reads the recorded outcome");
  const pv = await ASM.publicView(st, meta.closeAt + 30);
  ok(pv.session.state === "closed" && pv.result.winner === r1.winner && pv.tally.votes.golf === r1.votes.golf, "the public view shows the result once closed");
}
ok(ASM.decide({ votes: { golf: 3, farm: 3 } }).tie && ASM.decide({ votes: { golf: 3, farm: 3 } }).winner === ASM.chairCoin(), "a tie goes to the chair's coin, the same every time");

// ---- the winner, built in the city ---------------------------------------------------------------------
{
  ok(ASM.KEYS && SIM.LOT_BREAK > LOOKAHEAD, `the ground breaks after the plan builder's look-ahead (${SIM.LOT_BREAK} > ${LOOKAHEAD}): every site day is built after the result`);
  for (const winner of ["golf", "farm"]) {
    const closeAt = T0 + 3 * 86400000;
    SIM.setCivic({ closeAt, winner });
    const cd = SIM.machineClock(closeAt).day;
    const phases = [];
    for (let d = cd - 2; d <= cd + SIM.LOT_BREAK + SIM.LOT_BUILD + 2; d++) for (const h of [0.5, 12, 23.5]) phases.push([d, SIM.lotPhase((d - 1) * 24 + h)]);
    const seq = phases.map(([, p]) => p.phase);
    const order = ["approved", "site", "built"];
    ok(seq.every((p, i) => i === 0 || order.indexOf(p) >= order.indexOf(seq[i - 1])), `${winner}: approved, then the site, then built, never backwards`);
    ok(phases.filter(([, p]) => p.phase === "site").every(([, p], i, a) => i === 0 || p.progress >= a[i - 1][1].progress), `${winner}: the works only progress`);
    ok(phases.filter(([, p]) => p.phase === "built").every(([, p]) => p.winner === winner), `${winner}: what is built is what won`);
    ok(phases.filter(([d]) => d <= cd + LOOKAHEAD).every(([, p]) => p.phase === "approved"), `${winner}: nothing on the ground on a day that could have been planned before the close`);
    const again = phases.map(([d, p]) => JSON.stringify(p)).join();
    SIM.setCivic(null); SIM.setCivic({ closeAt, winner });
    ok(again === phases.map(([d]) => d).map((d, i) => JSON.stringify(SIM.lotPhase((d - 1) * 24 + [0.5, 12, 23.5][i % 3]))).join(), `${winner}: deterministic from the recorded outcome`);
  }
}

// the plan builder builds from the outcome, and a failed read builds nothing
{
  const synth = [];
  for (let i = 0; i < 600; i++) synth.push({ name: `Subject ${i}`, slug: `subject-${i}`, score: 100 + (i * 37) % 850, tier: null, kind: "citizen" });
  const { TIERS } = await import("../src/figures.js");
  for (const s of synth) s.tier = (TIERS.find(t => s.score >= t.min) || TIERS[TIERS.length - 1]).label;
  const closeAt = T0, cd = SIM.machineClock(closeAt).day;
  const DAY_MS = 24 * 60000;   // a machine day is 24 real minutes
  const atDay = (d) => SIM.CITY_EPOCH + ((d - 1) * 24 + 12) * 60000;   // real ms at noon of machine day d
  const mkIo = (civic) => {
    const blobs = new Map();
    let man = null, etag = 0;
    return {
      census: async () => synth, snapshots: async () => ({}), civic,
      manifest: async () => ({ manifest: man, etag: String(etag) }),
      putManifest: async (m) => { man = m; return String(++etag); },
      putDay: async (k, j) => blobs.set(k, j), getDay: async (k) => blobs.get(k),
      blobs,
    };
  };
  const visitsOn = (json) => Object.values(json.subjects).reduce((n, row) => n + row.slice(1).filter(e => e.length > 1 && json.places[e[1]] === "dev-lot" && e[2] === 2).length, 0);
  for (const winner of ["golf", "farm"]) {
    const io = mkIo(async () => ({ closeAt, winner }));
    // runs on the day of the close, at the ground breaking, and once it is built
    for (const d of [cd, cd + SIM.LOT_BREAK, cd + SIM.LOT_BREAK + SIM.LOT_BUILD + 1]) {
      const r = await buildPlans(atDay(d), io, { lookahead: 3 });
      ok(r.built.length > 0, `${winner}: the builder built days around ${d}`);
    }
    ok(JSON.stringify(SIM.civicState()) === JSON.stringify({ closeAt, winner }), `${winner}: the builder set the recorded outcome`);
    for (const [k, json] of io.blobs) {
      const p = SIM.lotPhase((json.day - 1) * 24 + 12);
      const v = visitsOn(json);
      if (p.phase === "approved" || p.phase === "vacant") ok(v === 0, `${winner} day ${json.day} (${p.phase}): nobody visits the lot`);
      else ok(v > 0, `${winner} day ${json.day} (${p.phase}): the lot has visitors (${v})`);
      void k;
    }
    ok(Math.max(...[...io.blobs.values()].map(j => j.day)) >= cd + SIM.LOT_BREAK, `${winner}: a site day was built`);
  }
  const bad = mkIo(async () => { throw new Error("blobs down"); });
  let threw = false;
  try { await buildPlans(atDay(cd), bad, { lookahead: 3 }); } catch { threw = true; }
  void DAY_MS;
  ok(threw && bad.blobs.size === 0, "a failed read of the outcome builds nothing");
  SIM.setCivic(null);
}

// ---- the ground: anchors on their own lot, apart, enough of them -----------------------------------------
{
  const lotOf = { forum: SIM.PLACES.forum.rect, site: SIM.PLACES["dev-lot"].rect, golf: SIM.PLACES["dev-lot"].rect, farm: SIM.PLACES["dev-lot"].rect };
  for (const [face, as] of Object.entries(CIVIC_ANCHORS)) {
    if (face === "vacant") { ok(as.length === 0, "the vacant lot has no places to stand"); continue; }
    const R = lotOf[face], cap = face === "forum" ? SIM.PLACES.forum.cap : SIM.PLACES["dev-lot"].cap;
    ok(as.every(a => a.x > R.x + 0.1 && a.x < R.x + R.w - 0.1 && a.y > R.y + 0.1 && a.y < R.y + R.h - 0.1), `${face}: every anchor on its own ground`);
    let close = 0;
    for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++) if (Math.hypot(as[i].x - as[j].x, as[i].y - as[j].y) < 0.3) close++;
    ok(close === 0, `${face}: nobody stands on anybody (${close} too close)`);
    ok(new Set(as.map(a => a.id)).size === as.length, `${face}: anchor ids unique`);
    ok(as.length >= cap, `${face}: ${as.length} anchors for a capacity of ${cap}`);
    ok(as.every(a => typeof a.act === "string" && a.kind), `${face}: every anchor typed and posed`);
  }
  const L = SIM.PLACES["dev-lot"].rect, inL = ([x, y]) => x > L.x && x < L.x + L.w && y > L.y && y < L.y + L.h;
  ok(GOLF.holes.length === 18 && new Set(GOLF.holes.map(h => h.n)).size === 18 && GOLF.holes.every(h => inL(h.green) && inL(h.tee)), "eighteen holes, numbered, on the lot");
  ok(FARM.beds.every(b => inL([b.x0, b.y0]) && inL([b.x1, b.y1])) && inL([SITE.crane.x, SITE.crane.y]) && inL(SIGN.a) && inL(SIGN.b), "the farm, the crane and the sign stand on the lot");
  const F = SIM.PLACES.forum.rect;
  ok([FORUM.lectern, FORUM.chair, FORUM.podium.golf, FORUM.podium.farm].every(([x, y]) => x > F.x && x < F.x + F.w && y > F.y && y < F.y + F.h), "the lectern, the chair and the podium stand in the Assembly");
  ok(CIVIC_LOTS["lot-6f07"] === "dev-lot" && SIM.BUILDING["lot-6f07"].district === "commons" && SIM.OPEN_LOTS.has("lot-6f07") && SIM.OPEN_LOTS.has("the-assembly"), "the lot and the Assembly are open ground in the Commons");
}

// ---- content: the living never speak ----------------------------------------------------------------------
{
  const living = Object.values(C.APPLICATIONS).flatMap(a => [a.applicant, a.applicant.split(" ").slice(-1)[0], a.applicant.replace(/^\S+\s/, "")]);
  const QUOTE = /["“”«»]|\bQUOTE/i;
  const SPEECH = /\b(said|says|say|saying|told|tells|stated|states|claim(s|ed)?|argue(s|d)?|insist(s|ed)?|promise(s|d)?|vow(s|ed)?|declare(s|d)?|tweet(s|ed)?|posted|wrote|writes|announce(s|d)?|added|replied|responded|spoke|speaks|remarked|called it)\b/i;
  const strings = [];
  const walk = (v) => { if (typeof v === "string") strings.push(v); else if (typeof v === "function") { for (const arg of [C.APPLICATIONS.golf, C.APPLICATIONS.farm, "001", 3, "SPITE", 50]) { try { const r = v(arg, 2); if (typeof r === "string") strings.push(r); } catch { /* not that shape */ } } } else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(C);
  const view = (state, g, f, result = null) => ({ session: { state, closeAt: T0 + 7200000, openAt: T0 }, tally: { votes: { golf: g, farm: f } }, result });
  for (const v of [view("open", 3, 5), view("open", 0, 0), view("closed", 4, 4, { winner: "golf", tie: true, votes: { golf: 4, farm: 4 } })]) strings.push(...C.paLines(v, T0));
  const sentences = strings.flatMap(s => s.split(/(?<=[.!?])\s+/));
  const bad = sentences.filter(s => living.some(n => s.toUpperCase().includes(n.toUpperCase())) && (QUOTE.test(s) || SPEECH.test(s)));
  ok(bad.length === 0, `no living applicant is quoted or reported speaking (${bad.slice(0, 2).join(" | ")})`);
  ok(Object.values(C.APPLICATIONS).every(a => a.living && /NONE ON FILE/.test(a.statement)), "the applicants' statements: none on file");
  const speakers = Object.keys(C.ADVOCATES);
  ok(speakers.every(k => C.APPLICATIONS[k]) && Object.values(C.ADVOCATES).every(a => /^\d{4}-\d{2}-\d{2}$/.test(a.died) && a.died < "2026" && !living.includes(a.name)), "every advocate is dead, on the record, and not an applicant");
  ok(Object.values(C.ADVOCATES).every(a => a.speeches.length >= 3 && a.speeches.length <= 4), "three or four speeches each");
  ok(Object.keys(C.REACTIONS).every(k => speakers.includes(k)) && Object.values(C.REACTIONS).every(r => C.REASONS.every(x => typeof r[x] === "string")), "reactions: advocates only, one per reason");
  ok(JSON.stringify(C.REASONS) === JSON.stringify(ASM.REASONS) && C.MAX_REASONS === ASM.MAX_REASONS, "the page and the server read the same reasons");
  ok(Object.values(C.ADVOCATES).flatMap(a => [...a.speeches, a.record]).every(s => !QUOTE.test(s)), "advocates' speeches carry no quotation marks (reconstructions, not quotes)");
  // and in the code that draws and pages it: no applicant name on a line with a quote mark
  const files = ["src/assembly/Assembly.jsx", "src/city/civicDraw.js", "src/city/civicGeo.js", "src/city/City.jsx", "netlify/lib/assembly.js", "netlify/functions/assembly.js"];
  const lines = files.flatMap(f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").split("\n").map(l => [f, l]));
  const hit = lines.filter(([, l]) => /TRUMP|DE LA ROCHA/i.test(l) && /[“”]|\\"|said|says/i.test(l));
  ok(hit.length === 0, `no applicant name beside a quote in the code (${hit.map(h => h[0]).join(", ")})`);
  void readdirSync;
}

console.log(fails ? `check-assembly: ${fails} FAILED` : "check-assembly: ballots, limits, the tally under concurrency, the close, the city build, and the no-quotes rule all hold");
process.exit(fails ? 1 : 0);
