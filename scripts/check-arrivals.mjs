// INTAKE, the processing hall (src/Arrivals.jsx, netlify/lib/arrivals.js): pending vs
// released against a mocked plan, release days and times, the hall's snake layout, the
// poll's reconcile, and the routes (#arrivals, #pen lands there). Run: node scripts/check-arrivals.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyArrivals, dayStartMs, assignmentOf, RELEASED_N, STALE_MS } from "../netlify/lib/arrivals.js";
import { BAYS, BAY, layoutFor, bayRect, bayAt, bayCenter, bayPath, releaseLine, assignedLine, homeBay, reconcile, minutesUntil } from "../src/arrivalsHall.js";
import { machineClock, CITY_EPOCH } from "../src/city/sim.js";

// ---- the clock: day D starts (D - 1) x 24 real minutes after the epoch ----
assert.equal(dayStartMs(1), CITY_EPOCH);
assert.equal(dayStartMs(2) - dayStartMs(1), 24 * 60000);
assert.equal(machineClock(dayStartMs(293)).day, 293);
assert.equal(machineClock(dayStartMs(293) - 1).day, 292);

// ---- classification against a mocked plan ----
const today = 290, now = dayStartMs(today) + 10 * 60000;
const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const fig = (slug, minAgo, extra = {}) => ({ slug, name: slug.replace(/-/g, " "), score: 600, tier: "TOLERATED GENERALIST", kind: "figure", referred: true, filedAt: at(minAgo), ...extra });
const subjects = [
  fig("old-hand", 600), fig("older-hand", 900),                 // in every plan: released
  fig("filed-last-hour", 50),                                   // built into 292 but not today's
  fig("just-filed", 2),                                         // in no built day yet
  { slug: "subject-ab12", name: "Subject AB12", score: 500, tier: "MONITORED CIVILIAN", kind: "citizen", filedAt: at(1) },
  fig("left-out-long-ago", 2000),                               // no plan holds them, filed long ago: not an arrival
  ...Array.from({ length: 14 }, (_, i) => fig(`vet-${String(i).padStart(2, "0")}`, 1000 + i)),
];
const base = new Set(["old-hand", "older-hand", ...subjects.filter(s => s.slug.startsWith("vet-")).map(s => s.slug)]);
const plans = [
  [289, new Set(base)],                                         // yesterday is ignored
  [today, new Set(base)],
  [291, new Set(base)],
  [292, new Set([...base, "filed-last-hour"])],
];
const out = classifyArrivals({ subjects, plans, today, latest: 292, nowMs: now });
const byKey = (arr) => Object.fromEntries(arr.map(s => [s.key, s]));
const P = byKey(out.pending), R = byKey(out.released);
assert.deepEqual(Object.keys(P).sort(), ["filed-last-hour", "just-filed", "subject-ab12"], "pending = on file, not in today's plan");
assert.equal(P["filed-last-hour"].releaseDay, 292, "released on the first built day that holds them");
assert.equal(P["just-filed"].releaseDay, 293, "in no built day: the next day the builder builds");
assert.equal(P["subject-ab12"].releaseDay, 293, "a newly assessed citizen waits too");
assert.equal(out.releaseNext, 293);
assert.equal(P["just-filed"].releaseAt, new Date(dayStartMs(293)).toISOString());
assert.ok(!P["left-out-long-ago"] && !R["left-out-long-ago"], "an old file the plans leave out is not an arrival");
assert.equal(out.released.length, RELEASED_N, "the hall keeps the newest released few");
assert.equal(out.released[0].key, "old-hand", "released newest first");
for (const s of out.released) assert.equal(s.status, "released");
for (const s of out.pending) { assert.equal(s.status, "pending"); assert.ok(s.assign?.home && s.assign?.job, `${s.key}: assignment`); }
assert.deepEqual(out.pending.map(s => s.key), ["subject-ab12", "just-filed", "filed-last-hour"], "pending newest first");
// a subject filed within STALE_MS but held by no plan is pending; one just past it is dropped
assert.ok(classifyArrivals({ subjects: [fig("x", STALE_MS / 60000 - 1)], plans: [[today, new Set()]], today, nowMs: now }).pending.length === 1);
assert.ok(classifyArrivals({ subjects: [fig("x", STALE_MS / 60000 + 1)], plans: [[today, new Set()]], today, nowMs: now }).pending.length === 0);
// no plan for today: the city runs its own sim over the census, so everyone is out there
const none = classifyArrivals({ subjects, plans: [], today, latest: null, nowMs: now });
assert.equal(none.pending.length, 0);
assert.equal(none.released.length, RELEASED_N);
assert.equal(none.releaseNext, today + 1);
// assignments: a home by tier and a job, in the city's words
const a = assignmentOf({ slug: "x-y", name: "X Y", score: 300, tier: "FLAGGED FOR DELETION", kind: "figure" });
assert.match(a.home, /HAB BLOCK [AB]|SHACKS|SEAWALL|BUNKHOUSE/, "the lower tiers live in the projects");
assert.equal(assignedLine(a), `ASSIGNED: ${a.home} // ${a.job}`);
assert.match(assignedLine(null), /ASSIGNMENT PENDING/);

// ---- the hall: bays snake, so consecutive bays always touch ----
for (const w of [255, 300, 380, 495, 720, 1100, 1400]) {
  const L = layoutFor(w);
  assert.ok(L.perRow * L.rows >= BAYS.length);
  for (let i = 0; i < BAYS.length; i++) {
    const r = bayRect(i, L), c = bayCenter(i, L);
    assert.equal(bayAt(c.x, c.y, L), i, `w ${w}: bay ${i} round-trips`);
    assert.ok(r.x0 >= 0 && r.x1 <= w + 1e-9, `w ${w}: bay ${i} inside the hall`);
    if (i) {
      const p = bayRect(i - 1, L);
      const touch = (p.row === r.row && Math.abs(p.col - r.col) === 1) || (p.col === r.col && r.row - p.row === 1);
      assert.ok(touch, `w ${w}: bay ${i - 1} -> ${i} adjacent`);
    }
  }
}
assert.equal(layoutFor(255).perRow, 2, "phones: two by three");
assert.equal(layoutFor(495).perRow, 3, "desktop: three by two");
assert.deepEqual(bayPath(BAY.door, BAY.bench), [1, 2, 3]);
assert.deepEqual(bayPath(BAY.platform, BAY.bench), [4, 3]);
assert.deepEqual(bayPath(2, 2), []);
assert.equal(homeBay("pending"), BAY.bench);
assert.equal(homeBay("released"), BAY.platform);
assert.equal(minutesUntil(new Date(now + 41 * 60000 - 1).toISOString(), now), 41);
assert.equal(minutesUntil(new Date(now - 5000).toISOString(), now), 0);
assert.equal(releaseLine(293, new Date(now + 41 * 60000).toISOString(), now), "RELEASE AT MACHINE DAY 293 (IN ~41 REAL MIN)");
assert.match(releaseLine(293, new Date(now - 1).toISOString(), now), /NOW/);

// ---- the poll: new pending walk in, released ones leave the bench, likenesses arrive ----
{
  const hall = new Map([["a", { status: "pending", sprite: null }], ["b", { status: "pending", sprite: null }], ["c", { status: "released", sprite: "/x" }]]);
  const r = reconcile({ pending: [{ key: "a", sprite: "/a" }, { key: "n" }], released: [{ key: "b" }, { key: "c", sprite: "/x" }, { key: "d" }] }, hall);
  assert.deepEqual(r.enter.map(s => s.key), ["n"]);
  assert.deepEqual(r.release, ["b"]);
  assert.deepEqual(r.settle.map(s => s.key), ["d"]);
  assert.deepEqual(r.likeness.map(s => s.key), ["a"]);
}

// ---- routes: INTAKE at #arrivals is under MORE ROOMS; #pen lands there; #intake stays the interview ----
{
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /\{ label: "INTAKE", note: "NEW ARRIVALS, AWAITING RELEASE", go: "#arrivals" \}/);
  assert.match(app, /key: "1", label: "GET EVALUATED"[^}]*go: "#intake"/, "the interview keeps #intake");
  assert.match(app, /routePath === "#arrivals" \|\| routePath === "#pen"/, "#pen still opens the hall");
  assert.match(app, /if \(p !== "#pen"\) return;[\s\S]{0,200}#arrivals/, "#pen is rewritten to #arrivals");
  assert.ok(!/href="#pen"/.test(app), "the app links to #arrivals");
  assert.ok(/import\("\.\/Arrivals\.jsx"\)/.test(app));
  assert.match(readFileSync(new URL("../src/ui/Shell.jsx", import.meta.url), "utf8"), /path === "#pen" \|\| path === "#arrivals"\) return null/, "the hall has no tab of its own");
  const hall = readFileSync(new URL("../src/Arrivals.jsx", import.meta.url), "utf8");
  assert.match(hall, /#city\?find=/, "released subjects link to FIND IN THE CITY");
  assert.match(hall, /PUT THAT SUBJECT DOWN\. IT IS BEING PROCESSED\./);
  assert.match(hall, /<ReferralBar simRef=\{simRef\} \/>/, "the referral desk lives in the hall");
  const fn = readFileSync(new URL("../netlify/functions/arrivals.js", import.meta.url), "utf8");
  assert.match(fn, /path: "\/api\/arrivals"/);
}
console.log("check-arrivals: ok");
