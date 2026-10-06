// THE PEOPLE'S PETITION (docs/PETITION.md): one vote per evaluation period, the re-opening
// after a new scoreHistory entry, a change within the period, refused files (citizens,
// closed to opinion), the limits, the tally under concurrent writes, the trigger (threshold,
// quadrant bridging, the 72-hour hold), the daily review cap, the review's blindness to the
// direction, the ±60 cap and the new period it opens, and the likability blend.
// Runs the real netlify/lib/petition.js against an in-memory store with Netlify Blobs' etag
// semantics and random delays between every read and write. Run: node scripts/check-petition.mjs
import { readFileSync } from "node:fs";
import * as PL from "../netlify/lib/petition.js";
import * as P from "../src/petition.js";
import { runReviews, reviewJob, capBreakdown, reviewChange, rewriteRosterLine } from "./petition-review.mjs";
import { FAMOUS_FIGURES, slugify } from "../src/figures.js";
import { movement, historyError, causeLabel } from "../src/movement.js";

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("  FAIL", msg); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 3);
const H = 3600 * 1000;
const T0 = Date.UTC(2026, 9, 1, 12);
const C = P.CFG;

// ---- an in-memory Blobs store ---------------------------------------------------------------------
function memStore({ failTally = 0 } = {}) {
  const m = new Map();
  let n = 0;
  const s = {
    m,
    async get(k) { await jitter(); const e = m.get(k); return e ? structuredClone(e.v) : null; },
    async getWithMetadata(k) { await jitter(); const e = m.get(k); return e ? { data: structuredClone(e.v), etag: `e${e.etag}` } : null; },
    async setJSON(k, v, o = {}) {
      await jitter();
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || `e${e.etag}` !== o.onlyIfMatch)) return { modified: false };
      if (failTally && k.startsWith("t/") && Math.random() < failTally && !s.healing) return { modified: false };
      m.set(k, { v: structuredClone(v), etag: ++n });
      return { modified: true };
    },
    async list({ prefix }) { await jitter(); return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
  return s;
}

// ---- the world: voters in each quadrant, referral cards -----------------------------------------------
const cases = new Map();
const OWNER = "HVI-OWNERAAA";   // a test id: the real owner case lives only in the environment
const QN = ["ADMIRED", "TRUSTED RESERVE", "ENVIED", "DISMISSED"];
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const idOf = (i) => `HVI-T${[i >> 10, (i >> 5) & 31, i & 31].map(x => B32[x]).join("").padStart(7, "A")}`;
const ids = [];
for (let i = 0; i < 400; i++) { const id = idOf(i); ids.push(id); cases.set(id, { history: [{ score: 500, quadrant: QN[i % 4] }] }); }
cases.set("HVI-UNASSESS", { history: [] });
cases.set(OWNER, { history: [{ score: 900, quadrant: "ADMIRED" }] });
const quadOf = (id) => cases.get(id).history[0].quadrant;
const byQuad = (q) => ids.filter(id => quadOf(id) === q);

const bd = { care: 60, alignment: 60, utility: 70, adaptability: 60, legacy: 70, network: 50, physical: 50, threat: 20, redundancy: 30 };
const cards = new Map();
function card(slug, extra = {}) {
  cards.set(slug, { slug, name: `Test ${slug}`, score: 650, tier: "TOLERATED GENERALIST", breakdown: { ...bd }, verdict: "A verdict.", verdictStatus: "published", scoreHistory: [{ at: null, score: 640, tier: "TOLERATED GENERALIST", cause: "baseline" }, { at: "2026-09-28T00:00:00Z", score: 650, tier: "TOLERATED GENERALIST", cause: "method" }], ...extra });
  return slug;
}
function makeIo(store) {
  const lim = new Map();
  return {
    store, lim, getCase: async (id) => cases.get(id) || null, getCard: async (slug) => structuredClone(cards.get(slug) || null),
    hitLimit: async (key, max) => { const n = (lim.get(key) || 0) + 1; if (n > max) return { ok: false, count: n - 1 }; lim.set(key, n); return { ok: true, count: n }; },
  };
}
const dev = (i) => (i.toString(16).padStart(2, "0")).repeat(16);
// Distinct address and device per voter unless a test says otherwise.
const vote = (io, id, slug, choice, now = T0, ip = `ip-${id}`, device = dev(ids.indexOf(id) & 0xff)) => PL.castVote(io, { caseId: id, slug, choice, ip, device, now });

// ---- one vote per evaluation, change within it, re-opening after a new scoreHistory entry --------------
{
  const st = memStore(), io = makeIo(st), slug = card("alpha");
  const a = ids[0];
  let r = await vote(io, a, slug, "high");
  ok(r.status === 200 && r.body.vote.rev === 1 && r.body.period === 2, "a first vote is cast in the file's period (its log length, 2)");
  r = await vote(io, a, slug, "high");
  ok(r.status === 200 && r.body.unchanged, "the same vote again changes nothing");
  r = await vote(io, a, slug, "low");
  ok(r.status === 200 && r.body.changed && r.body.vote.rev === 2, "a vote may change within the period");
  let c = P.countsOf((await PL.readTally(st, slug, 2)).seen);
  ok(c.voters === 1 && c.votes.low === 1 && c.votes.high === 0, "one file, one vote per period: the change replaces the first");
  for (let k = 3; k <= C.limits.revisions; k++) await vote(io, a, slug, k % 2 ? "fair" : "high");
  r = await vote(io, a, slug, "low");
  ok(r.status === 429, `no more than ${C.limits.revisions} revisions in one period`);
  // The Department re-evaluates: a new log entry, a new period, and the ballot re-opens.
  const cd = cards.get(slug);
  cd.scoreHistory.push({ at: "2026-10-02T00:00:00Z", score: 630, tier: "TOLERATED GENERALIST", cause: "record" });
  cd.score = 630;
  r = await vote(io, a, slug, "high");
  ok(r.status === 200 && r.body.period === 3 && r.body.vote.rev === 1 && !r.body.changed, "after a re-evaluation the same file votes again, fresh");
  c = P.countsOf((await PL.readTally(st, slug, 3)).seen);
  const old = P.countsOf((await PL.readTally(st, slug, 2)).seen);
  ok(c.voters === 1 && c.votes.high === 1 && old.voters === 1, "each period keeps its own tally; the old one stays on record");
  const v = await PL.fileView(io, slug, { caseId: a, now: T0 });
  ok(v.mine?.choice === "high" && v.mine.period === 3 && v.machine.period === 3, "the file shows this period's vote and the machine's number beside it");
}

// ---- refused files and voters -------------------------------------------------------------------------------
{
  const st = memStore(), io = makeIo(st);
  let r = await vote(io, ids[1], "citizen-7auz", "high");
  ok(r.status === 403 && /Citizens/.test(r.body.error), "a citizen's (player's) file is refused");
  ok(await PL.fileView(io, "citizen-7auz") === null, "a citizen's file has no petition view");
  r = await vote(io, ids[1], "no-such-figure", "high");
  ok(r.status === 404, "no such public file, no vote");
  const gated = FAMOUS_FIGURES.find(f => f.name === "Vladimir Putin");
  r = await vote(io, ids[1], slugify(gated.name), "low");
  ok(r.status === 403 && r.body.closed, "a harm-gated roster file is closed to opinion");
  const cv = await PL.fileView(io, slugify(gated.name));
  ok(cv.closed && cv.state === "CLOSED TO OPINION" && !cv.counts && !cv.people, "a closed file shows only the neutral flag");
  const henry = FAMOUS_FIGURES.find(f => f.name === "Henry VIII");
  ok((await vote(io, ids[1], slugify(henry.name), "low")).status === 403, "a serious-cap file is closed to opinion");
  card("withheld", { verdictStatus: "withheld" });
  ok((await vote(io, ids[1], "withheld", "low")).status === 403, "a withheld verdict is closed to opinion");
  card("reviewed", { harmReview: { decision: "ungate", note: "x" } });
  ok((await vote(io, ids[1], "reviewed", "low")).status === 403, "a file with a case-by-case harm finding is closed to opinion");
  card("hopeful", { candidate: true });
  ok((await vote(io, ids[1], "hopeful", "low")).status === 403, "a candidate's file is closed to opinion");
  card("gone", { removed: true });
  ok((await vote(io, ids[1], "gone", "low")).status === 404, "a withdrawn file takes no votes");
  const tesla = slugify("Nikola Tesla");
  ok((await vote(io, "HVI-UNASSESS", tesla, "fair")).status === 403, "an unassessed file cannot petition");
  ok((await vote(io, "HVI-NOSUCH01", tesla, "fair")).status === 404, "no case, no vote");
  ok(PL.parseVote({ choice: "outrageous" }).error && PL.parseVote({ choice: "LOW" }).choice === "low", "only the three choices; no free text");
  r = await vote(io, ids[2], tesla, "fair");
  ok(r.status === 200 && r.body.period === FAMOUS_FIGURES.find(f => f.name === "Nikola Tesla").scoreHistory.length, "a roster file's period is its log length in src/figures.js");
}

// ---- limits (the owner's case included) ----------------------------------------------------------------------
{
  const st = memStore(), io = makeIo(st), slug = card("beta");
  const same = "ip-shared";
  const rs = [];
  for (let i = 0; i < C.limits.casesPerIp + 1; i++) rs.push(await vote(io, ids[10 + i], slug, "fair", T0, same, dev(10 + i)));
  ok(rs.slice(0, -1).every(r => r.status === 200) && rs.at(-1).status === 429, `at most ${C.limits.casesPerIp} files vote on one file from one address`);
  ok((await vote(io, ids[10], slug, "low", T0, same, dev(10))).status === 200, "a change of mind costs no place on the address list");
  const d = dev(99);
  const rd = [];
  for (let i = 0; i < C.limits.casesPerDevice + 1; i++) rd.push(await vote(io, ids[30 + i], slug, "fair", T0, `ip-d${i}`, d));
  ok(rd.slice(0, -1).every(r => r.status === 200) && rd.at(-1).status === 429, `at most ${C.limits.casesPerDevice} files vote on one file from one device`);
  const gam = card("gamma");
  const ro2 = [];
  for (let i = 0; i < C.limits.casesPerIp; i++) ro2.push(await vote(io, ids[60 + i], gam, "fair", T0, "ip-own2", dev(60 + i)));
  ro2.push(await vote(io, OWNER, gam, "fair", T0, "ip-own2", dev(70)));
  ok(ro2.at(-1).status === 429, "the owner's case has no exemption from the address cap");
  // per-case daily cap and per-address hourly cap
  const io2 = makeIo(memStore());
  for (let i = 0; i < C.limits.votesPerCaseDay; i++) card(`day-${i}`);
  let last;
  for (let i = 0; i <= C.limits.votesPerCaseDay; i++) { if (i === C.limits.votesPerCaseDay) card(`day-${i}`); last = await vote(io2, ids[80], `day-${i}`, "fair", T0, `ip-day-${i}`); }
  ok(last.status === 429, `at most ${C.limits.votesPerCaseDay} votes a day from one file`);
  const io3 = makeIo(memStore());
  let lr;
  for (let i = 0; i <= C.limits.votesPerIpHour; i++) lr = await vote(io3, ids[100 + (i % 3)], "beta", i % 2 ? "low" : "high", T0, "ip-hammer", dev(100 + (i % 3)));
  ok(lr.status === 429 && lr.retry === 3600, `at most ${C.limits.votesPerIpHour} votes an hour from one address`);
  const down = { ...makeIo(memStore()), hitLimit: async () => { throw new Error("down"); } };
  ok((await vote(down, ids[1], "beta", "fair")).status === 503, "no limiter, no vote (never off the books)");
}

// ---- the tally under concurrency, with lost folds healed -----------------------------------------------------------
for (const failTally of [0, 0.3]) {
  const st = memStore({ failTally }), io = makeIo(st), slug = card(`conc-${failTally ? "lossy" : "clean"}`);
  const voters = ids.slice(0, 240);
  const writes = [];
  for (const id of voters) writes.push(vote(io, id, slug, P.CHOICES[Math.floor(Math.random() * 3)], T0));
  for (const id of voters.slice(0, 80)) writes.push(vote(io, id, slug, P.CHOICES[Math.floor(Math.random() * 3)], T0));
  await Promise.all(writes);
  st.healing = true;
  await PL.heal(st, slug, 2, { now: T0 + H });
  st.healing = false;
  const t = await PL.readTally(st, slug, 2);
  const truth = { high: 0, fair: 0, low: 0 };
  for (const [k] of st.m) if (k.startsWith(`v/${slug}/2/`)) truth[(await st.get(k)).c]++;
  const c = P.countsOf(t.seen);
  if (process.env.DEBUG_CHECK) console.log(c, truth, (await Promise.all(writes)).map(r => r.status).filter(x => x !== 200));
  ok(c.voters === voters.length && P.CHOICES.every(x => c.votes[x] === truth[x]), `the tally equals the votes after ${writes.length} concurrent writes${failTally ? " with lost folds, healed" : ""}`);
  ok(Object.values(c.byQuadrant).reduce((s, q) => s + q.n, 0) === voters.length, "every voter lands in their own quadrant's cohort");
}

// ---- the trigger: threshold, bridging, Wilson, cohort dominance -------------------------------------------------------
{
  const counts = (spec) => {   // spec: {quadrant: [high, fair, low]}
    const seen = {};
    let i = 0;
    for (const [q, arr] of Object.entries(spec)) arr.forEach((n, ci) => { for (let k = 0; k < n; k++) seen[`k${i++}`] = [1, ci, P.QUADRANTS.indexOf(q)]; });
    return P.countsOf(seen);
  };
  const bridged = counts({ ADMIRED: [9, 1, 0], "TRUSTED RESERVE": [9, 1, 0], ENVIED: [9, 1, 0], DISMISSED: [5, 5, 0] });
  ok(bridged.voters === 40 && P.trigger(bridged)?.dir === "high", "40 voters, TOO HIGH in 3 of 4 quadrants: a review is asked for");
  ok(!P.trigger(counts({ ADMIRED: [9, 1, 0], "TRUSTED RESERVE": [9, 1, 0], ENVIED: [9, 0, 0], DISMISSED: [5, 5, 0] })), "39 voters: not yet");
  ok(!P.trigger(counts({ ADMIRED: [15, 0, 0], "TRUSTED RESERVE": [15, 0, 0], ENVIED: [2, 3, 0], DISMISSED: [2, 3, 0] })), "bridged across only 2 quadrants: no review");
  ok(!P.trigger(counts({ ADMIRED: [21, 0, 0], "TRUSTED RESERVE": [7, 0, 0], ENVIED: [7, 0, 0], DISMISSED: [5, 0, 0] })), "one cohort supplying over half the votes: no review");
  ok(!P.trigger(counts({ ADMIRED: [6, 4, 0], "TRUSTED RESERVE": [6, 4, 0], ENVIED: [6, 4, 0], DISMISSED: [6, 4, 0] })), "a 60% lean at n=40 fails the Wilson bound (0.60): no review");
  ok(!P.trigger(counts({ ADMIRED: [0, 10, 0], "TRUSTED RESERVE": [0, 10, 0], ENVIED: [0, 10, 0], DISMISSED: [0, 10, 0] })), "FAIR never asks for a review");
  ok(P.trigger(counts({ ADMIRED: [0, 1, 9], "TRUSTED RESERVE": [0, 1, 9], ENVIED: [0, 1, 9], DISMISSED: [0, 5, 5] }))?.dir === "low", "TOO LOW bridges the same way");
  ok(Math.abs(P.wilson(30, 40) - 0.5977) < 0.001, "Wilson lower bound (30 of 40 at 95%) ~0.598");
  ok(P.stateOf({ voters: 24 }) === "STIRRING" && P.stateOf({ voters: 25 }) === "NOTED" && P.stateOf({ voters: 3 }) === "QUIET"
    && P.stateOf({ queued: true, voters: 50 }) === "REVIEW PENDING" && P.stateOf({ closed: true, voters: 99 }) === "CLOSED TO OPINION", "NOTED at 25; REVIEW PENDING once granted; CLOSED beats everything");
  const pc = P.publicCounts({ voters: 27, votes: { high: 13, fair: 9, low: 5 } });
  ok(pc.voters === 25 && pc.lean.high % 5 === 0 && P.publicCounts({ voters: 3, votes: { high: 3, fair: 0, low: 0 } }).voters === null, "before a review, counts show rounded to 5 (fewer than 5: none)");
}

// ---- the 72-hour hold, the daily cap, the cooldown ---------------------------------------------------------------------
// 40 voters, 10 per quadrant, 9 of 10 TOO HIGH in each: triggers.
async function fill(io, slug, dir = "high", now = T0, from = 0) {
  for (const q of QN) {
    const who = byQuad(q).slice(from, from + 10);
    for (let i = 0; i < who.length; i++) await vote(io, who[i], slug, i < 9 ? dir : "fair", now);
  }
}
{
  const st = memStore(), io = makeIo(st);
  const s1 = card("hold-1");
  await fill(io, s1, "high", T0);
  const t = await PL.readTally(st, s1, 2);
  ok(t.hold && t.hold.dir === "high" && t.hold.since === T0, "the hold starts when the trigger first stands");
  let rep = await PL.tick(io, { now: T0 + 71 * H });
  ok(rep.granted.length === 0 && rep.held === 1, "71 hours: held, not granted");
  const v = await PL.fileView(io, s1, { now: T0 + 71 * H });
  ok(v.state === "NOTED" && v.counts.voters === 40, "a held file shows NOTED, not a countdown");
  rep = await PL.tick(io, { now: T0 + 72 * H });
  ok(rep.granted.includes(s1), "72 hours unbroken: a review is granted");
  const q = await st.get(PL.KEYS.queue(s1, 2));
  ok(q && q.status === "queued" && !("dir" in q) && !JSON.stringify(q).match(/high|low|fair|lean|share|cohort/i), "the queue entry carries no direction");
  ok((await PL.fileView(io, s1, { now: T0 + 72 * H })).state === "REVIEW PENDING", "the file shows REVIEW PENDING");
  rep = await PL.tick(io, { now: T0 + 73 * H });
  ok(!rep.granted.length, "a granted file is not granted twice");
  // a break resets the clock
  const s2 = card("hold-2");
  await fill(io, s2, "high", T0);
  for (const id of byQuad("ADMIRED").slice(0, 10)) await vote(io, id, s2, "fair", T0 + 10 * H);
  for (const id of byQuad("ADMIRED").slice(0, 10)) await vote(io, id, s2, "high", T0 + 20 * H);
  const t2 = await PL.readTally(st, s2, 2);
  ok(t2.hold && t2.hold.since === T0 + 20 * H, "a break in the trigger restarts the 72 hours");
  rep = await PL.tick(io, { now: T0 + 80 * H });
  ok(!rep.granted.includes(s2), "72 hours from the first stand is not enough after a break");
}
{
  const st = memStore(), io = makeIo(st);
  const files = [0, 1, 2, 3, 4].map(i => card(`cap-${i}`));
  for (let i = 0; i < files.length; i++) await fill(io, files[i], i % 2 ? "low" : "high", T0, 0);
  const rep = await PL.tick(io, { now: T0 + 73 * H });
  ok(rep.granted.length === C.reviewsPerDay, `at most ${C.reviewsPerDay} reviews granted a day, site-wide (${rep.granted.length})`);
  const rep2 = await PL.tick(io, { now: T0 + 74 * H });
  ok(rep2.granted.length === 0, "the cap holds for the rest of the day");
  const rep3 = await PL.tick(io, { now: T0 + 97 * H });
  ok(rep3.granted.length === 2, "the rest are granted the next day");

  // ---- the review: blind, capped at ±60 a section, logged, and it opens a new period ----
  const jobs = [];
  let applied = [];
  const rescore = async (job) => { jobs.push(JSON.stringify(job)); return { breakdown: { ...bd, care: 0, utility: 100, legacy: 5 }, verdict: "Re-examined.", factCheck: { passed: true } }; };
  const apply = async (fig, c) => { applied.push([fig.slug, c]); const cd = cards.get(fig.slug); Object.assign(cd, { score: c.score, tier: c.tier, breakdown: c.breakdown, verdict: c.verdict, scoreHistory: c.scoreHistory }); };
  const done = await runReviews({ store: st, getCard: io.getCard, rescore, apply }, { now: T0 + 98 * H });
  ok(done.filter(d => d.status === "done").length === C.reviewsPerDay, `the review job runs at most ${C.reviewsPerDay} a day (${done.length})`);
  const later = await runReviews({ store: st, getCard: io.getCard, rescore, apply }, { now: T0 + 99 * H });
  ok(later.length === 0, "the rest wait for tomorrow");
  const next = await runReviews({ store: st, getCard: io.getCard, rescore, apply }, { now: T0 + 122 * H });
  ok(next.filter(d => d.status === "done").length === 2, "and run the next day");
  // blindness: files petitioned TOO HIGH and TOO LOW produce the same kind of job, built from the file alone
  ok(jobs.every(j => !/high|low|fair|petition|people|lean|vote|direction/i.test(j.replace(/"name":"[^"]*"/, ""))), "the review prompt never hears which way, or that, the people leaned");
  const hi = cards.get("cap-0"), lo = cards.get("cap-1");
  ok(JSON.stringify(Object.keys(reviewJob({ ...hi, died: null }))) === JSON.stringify(Object.keys(reviewJob({ ...lo, died: null }))) && jobs.length === 5, "TOO HIGH and TOO LOW petitions hand the model the same fields");
  const [, ch] = applied[0];
  ok(ch.breakdown.care === 0 && ch.breakdown.utility === 100 && ch.breakdown.legacy === 10, "each section moves at most ±60 (legacy 70 -> 5 capped at 10)");
  const last = ch.scoreHistory.at(-1);
  ok(last.cause === "review" && last.sub === "petition" && /THE PEOPLE PETITIONED/.test(last.note) && !historyError(ch.scoreHistory), "the move is logged as a petition review, THE PEOPLE PETITIONED");
  ok(causeLabel(movement(ch.scoreHistory).department.at(-1)) === "PETITION REVIEW", "the file's movement log labels it PETITION REVIEW, under the Department's changes");
  const slug0 = applied[0][0];
  const r = await vote(io, byQuad("ADMIRED")[0], slug0, "fair", T0 + 99 * H);
  ok(r.status === 200 && r.body.period === 3 && r.body.vote.rev === 1, "the review opens a new evaluation: the ballot re-opens");
  const lean = await PL.readLean(st, slug0);
  ok(lean.periods[2]?.petition?.dir && typeof lean.periods[2].petition.delta === "number", "the petitioned period keeps its lean, its direction and the review's movement");
  const fv = await PL.fileView(io, slug0, { now: T0 + 99 * H });
  ok(fv.history[0]?.petitioned?.outcome && fv.state !== "REVIEW PENDING", "the file shows the last petition and what the Department did about it");
  // cooldown: a file reviewed in the last 30 days is not granted again
  await fill(io, slug0, "high", T0 + 100 * H, 10);
  const rep4 = await PL.tick(io, { now: T0 + 200 * H });
  ok(!rep4.granted.includes(slug0) && rep4.skipped.some(([s, why]) => s === slug0 && why === "cooldown"), "one review per file per 30 days");
  // a file the Department re-evaluated on its own after the grant: the petition is superseded
  const s9 = card("super");
  await fill(io, s9, "high", T0 + 300 * H);
  await PL.tick(io, { now: T0 + 400 * H });
  cards.get(s9).scoreHistory.push({ at: "2026-10-20T00:00:00Z", score: 651, tier: "TOLERATED GENERALIST", cause: "method" });
  const sup = await runReviews({ store: st, getCard: io.getCard, rescore, apply }, { now: T0 + 401 * H });
  ok(sup.some(d => d.slug === s9 && d.status === "superseded"), "a petition on a period that has since closed is superseded, not reviewed");
}
{
  ok(JSON.stringify(capBreakdown({ care: 90, threat: 10, legacy: null }, { care: 10, threat: 95, legacy: 99, utility: null })) === JSON.stringify(capBreakdown({ care: 90, threat: 10, legacy: null }, { care: 10, threat: 95, legacy: 99 })), "an unassessed section in the new reading changes nothing");
  const cb = capBreakdown({ care: 90, threat: 10, legacy: null, utility: 40 }, { care: 10, threat: 95, legacy: 99, utility: null });
  ok(cb.care === 30 && cb.threat === 70 && cb.legacy === 99 && cb.utility === 40, "±60 around the old value; a new section is taken; a dropped one kept");
  const fig = { name: "X", score: 650, tier: "TOLERATED GENERALIST", breakdown: { ...bd }, verdict: "Old.", scoreHistory: [] };
  const c = reviewChange(fig, { breakdown: { ...bd }, verdict: "New but unchecked.", factCheck: { passed: false } }, T0);
  ok(c.verdict === "Old." && c.scoreHistory.length === 2 && c.scoreHistory[0].cause === "baseline", "an unchecked verdict never replaces the old one; an empty log is seeded with a baseline");
}

// ---- the roster rewrite (src/figures.js, the Mac job) ----------------------------------------------------------------
{
  const src = readFileSync(new URL("../src/figures.js", import.meta.url), "utf8");
  const f = FAMOUS_FIGURES.find(x => x.name === "Nikola Tesla");
  const c = reviewChange({ ...f, slug: "nikola-tesla" }, { breakdown: { ...f.breakdown, care: f.breakdown.care - 20 }, verdict: "Re-read \"quoted\" record.", factCheck: { passed: true } }, T0);
  const out = rewriteRosterLine(src, f.name, c);
  const line = out.split("\n").find(l => l.startsWith(`  { name: "Nikola Tesla",`));
  const obj = Function(`"use strict"; return (${line.trim().replace(/,$/, "")});`)();
  ok(obj.score === c.score && obj.breakdown.care === f.breakdown.care - 20 && obj.verdict === c.verdict && obj.scoreHistory.length === f.scoreHistory.length + 1 && obj.origin === f.origin && obj.born === f.born, "the roster line is rewritten in place, every other field kept");
  ok(out.split("\n").filter((l, i) => l !== src.split("\n")[i]).length === 1, "no other line of src/figures.js changes");
}

// ---- the People signal: the likability blend ----------------------------------------------------------------------------
{
  const yg = { likability: 60, source: "YouGov US ratings", fame: 90 };
  ok(P.periodReading({ voters: 10, votes: { high: 0, fair: 0, low: 10 }, warmth: 40 }) === 90 && P.periodReading({ voters: 10, votes: { high: 10, fair: 0, low: 0 }, warmth: 40 }) === 0
    && P.periodReading({ voters: 10, votes: { high: 0, fair: 10, low: 0 }, warmth: 40 }) === 40, "a period reads warmth ± swing x (low − high)/voters: FAIR agrees with the record");
  const crowd = P.crowdOf([{ period: 3, voters: 40, votes: { high: 0, fair: 40, low: 0 }, warmth: 70 }, { period: 2, voters: 40, votes: { high: 40, fair: 0, low: 0 }, warmth: 70 }]);
  ok(crowd.n === 60 && crowd.reading === Math.round((40 * 70 + 20 * 20) / 60), "earlier periods count at half weight per period back");
  const b = P.blendPeople(yg, { reading: 20, n: 100 });
  ok(b.likability === 40 && b.polled === 60 && /PETITION/.test(b.source), "with a YouGov reading, the poll is a prior worth 100 voters");
  ok(P.blendPeople(yg, { reading: 20, n: 1 }).likability === 60, "one voter barely moves a poll");
  ok(P.blendPeople(null, { reading: 90, n: 24 }) === null, "without a poll, the crowd needs 25 voters to count");
  ok(P.blendPeople(null, { reading: 90, n: 30 }).likability === Math.round((30 * 90 + 20 * 50) / 50), "then it is shrunk toward 50 like the YouGov seeding");
  ok(P.blendPeople(yg, null) === yg && P.withCrowd({ slug: "a", people: yg }, { b: { reading: 1, n: 50 } }).people === yg, "no crowd, no change");
  const blended = P.withCrowd({ slug: "a", people: null }, { a: { reading: 80, n: 50 } });
  ok(blended.people?.likability === Math.round((50 * 80 + 20 * 50) / 70), "a figure without YouGov coverage gets a People reading from the crowd");
  // end to end: the tick writes the summary the census and the cube read
  const st = memStore(), io = makeIo(st), s = card("like", { people: null });
  for (const id of ids.slice(0, 30)) await vote(io, id, s, "low", T0);
  await PL.tick(io, { now: T0 + H });
  const sum = await PL.readSummary(st);
  const w = (await PL.figureFor(s, io.getCard)).warmth;
  ok(sum[s]?.n === 30 && sum[s].reading === Math.min(100, w + 50), "the hourly tick writes each file's crowd reading");
  const fv = await PL.fileView(io, s, { now: T0 + H });
  ok(fv.people?.likability === Math.round((30 * Math.min(100, w + 50) + 20 * 50) / 50) && fv.people.crowd.n === 30, "the file shows the blended likability beside the lean");
  ok(!("score" in (fv.people || {})) && fv.machine.score === 650, "and the score does not move");
}

// ---- wiring --------------------------------------------------------------------------------------------------------------
{
  const fn = readFileSync(new URL("../netlify/functions/petition.js", import.meta.url), "utf8");
  ok(/foreignOrigin\(req\)/.test(fn) && /clientIp\(req, context\)/.test(fn) && /config = \{ path: \["\/api\/petition", "\/api\/petition\/:slug"\] \}/.test(fn), "the function checks origin, hashes the address, and serves /api/petition[/:slug]");
  const tk = readFileSync(new URL("../netlify/functions/petition-tick.js", import.meta.url), "utf8");
  ok(/schedule: "@hourly"/.test(tk) && !/anthropic|rescore/i.test(tk.replace(/^\/\/.*$/gm, "")), "the tick is hourly and never calls a model");
  const pen = readFileSync(new URL("../src/Pen.jsx", import.meta.url), "utf8");
  const idx = readFileSync(new URL("../src/FigureIndex.jsx", import.meta.url), "utf8");
  ok(/petitionable\(subject\) && <PetitionPanel/.test(pen) && /<PetitionPanel subject=\{fig\}/.test(idx), "the panel is on every public figure's card and index file");
  const panel = readFileSync(new URL("../src/PetitionPanel.jsx", import.meta.url), "utf8");
  ok(/s\.kind === "figure" && !s\.you/.test(panel) && !/<textarea|type="text"/.test(panel), "citizens' cards never show it; no free text field");
  ok(P.BALLOT_RULE === "ONE VOTE PER EVALUATION. THE DEPARTMENT RE-OPENS THE BALLOT WHEN IT RE-EXAMINES.", "the ballot rule is printed as written");
}

console.log(fails ? `${fails} FAILED` : "petition: all checks passed");
process.exit(fails ? 1 : 0);
