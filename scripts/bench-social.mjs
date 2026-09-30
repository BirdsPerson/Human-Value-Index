// The social tick's cost and the city's friendship density at roster size N (docs/CITY_SPEC.md
// "Relations", scaling step 6). Not a check. Synthetic census (scripts/synth-roster.mjs), in-memory
// Blobs, nothing touches production.
//   node scripts/bench-social.mjs [--root DIR] [N...]     (default 430 1000 5000 20000)
// --root runs another checkout's tick (e.g. the code before step 6) on the same census.
// Per N: the first run (30 machine days fast-forwarded by the sim), a steady hourly run
// (60 machine hours) by the sim, then the same steady run over published plans: the one-file
// plan (format 1) and, where the code reads them, the sector windows (format 2). Lambda runs
// this code ~9x slower than the Mac. Density: friend pairs (affinity >= 30), friends per
// subject (2 x pairs / N), subjects with a friend, the largest number of pairs one subject holds.
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const self = fileURLToPath(import.meta.url);
const here = join(dirname(self), "..");
const argv = process.argv.slice(2);
if (argv[0] !== "--one") {
  let root = here;
  const Ns = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === "--root") root = resolve(argv[++i]); else Ns.push(Number(argv[i])); }
  const rows = [];
  for (const N of (Ns.length ? Ns : [430, 1000, 5000, 20000])) {
    const r = spawnSync(process.execPath, ["--max-old-space-size=8192", self, "--one", String(N), root], { encoding: "utf8", timeout: +(process.env.BENCH_MS || 40 * 60 * 1000) });
    const line = (r.stdout || "").trim().split("\n").pop();
    try { rows.push(JSON.parse(line)); } catch { rows.push({ N, error: r.signal ? `killed (${r.signal})` : (r.stderr || "").slice(-400) }); }
    console.error(JSON.stringify(rows[rows.length - 1]));
  }
  console.table(rows.map(({ N, coldS, steadySimS, steadyF1S, steadyF2S, x9LambdaS, pairs, friends, friendsPerSubject, perOnFile, perEngine, withFriend, maxDegree, stateKB, apiSocialKB, shardMaxKB }) =>
    ({ N, coldS, steadySimS, steadyF1S, steadyF2S, x9LambdaS, pairs, friends, friendsPerSubject, perOnFile, perEngine, withFriend, maxDegree, stateKB, apiSocialKB, shardMaxKB })));
  console.log(JSON.stringify(rows));
  process.exit(0);
}

const N = +argv[1], root = argv[2];
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const SIM = await imp("src/city/sim.js");
const { tick } = await imp("netlify/lib/social-tick.js");
const PL = await imp("netlify/lib/plans.js");
const { fullRoster } = await imp("src/city/roster.js");
const { synthRoster } = await import(pathToFileURL(join(here, "scripts/synth-roster.mjs")).href);
const roster = synthRoster(N);
const census = roster.filter(s => s.engine || s.kind === "citizen");
const n = fullRoster(census).length;
const mem = { state: null, pub: null, shards: [] };
const io = (extra = {}) => ({
  getState: async () => (mem.state ? JSON.parse(mem.state) : null),
  putState: async (s) => { mem.state = JSON.stringify(s); },
  putPublic: async (p) => { mem.pub = JSON.stringify(p); },
  putSubjects: async (by) => { const SOC = await imp("src/city/social.js"); mem.shards = SOC.shardSubjects ? SOC.shardSubjects(by).map(x => JSON.stringify({ subjects: x }).length) : []; },
  census: async () => census,
  ...extra,
});
const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);   // machine day ~ 220
const s = (ms) => +(ms / 1000).toFixed(2);
let t = performance.now();
await tick(T0, io());
const coldMs = performance.now() - t;
t = performance.now();
const r2 = await tick(T0 + 3600e3, io());
const steadySim = performance.now() - t;
const after = mem.state;

// Publish the days the next steady run covers, both formats, as the builder would.
const T2 = T0 + 2 * 3600e3;
const h0 = r2.hour, h1 = Math.floor(SIM.machineClock(T2).mt);
const days = [];
for (let d = Math.floor(h0 / 24) + 1; d <= Math.floor((h1 - 1) / 24) + 1; d++) days.push(d);
const box = new Map(), f1 = {}, f2 = {};
SIM.clearPlans(); SIM.setSocialSnapshots(JSON.parse(mem.pub).snapshots || {}); SIM.setMemoCap(1e8); SIM.setRoster(fullRoster(census));
for (const d of days) {
  const plan = JSON.parse(JSON.stringify(SIM.buildPlan(d))), ver = PL.versionOf(plan);
  f1[d] = { plan, ver };
  f2[d] = await PL.publishSplit({ putPart: async (k, v) => { box.set(k, JSON.parse(JSON.stringify(v))); } }, plan, ver, fullRoster(census), "bench");
}
box.set(PL.MANIFEST2, { format: 2, days: f2 });
const fake = () => ({ get: async (k) => (box.has(k) ? JSON.parse(JSON.stringify(box.get(k))) : null) });
const plansIo = { plans: async (ds) => { const out = {}; for (const d of ds) if (f1[d]) { SIM.setPlan(f1[d].plan, f1[d].ver); out[d] = f1[d].ver; } return out; } };
SIM.clearPlans(); SIM.clearSocialSnapshots();
mem.state = after;
t = performance.now();
await tick(T2, io(plansIo));
const steadyF1 = performance.now() - t;
const viaF1 = mem.state;
let steadyF2 = null;
if (PL.loadWindows) {
  PL.forgetManifest(); SIM.clearPlans(); SIM.clearSocialSnapshots();
  mem.state = after;
  t = performance.now();
  const r = await tick(T2, io({ ...plansIo, windows: (d, w) => PL.loadWindows(d, w, fake) }));
  steadyF2 = performance.now() - t;
  if (r.sources?.sectors !== r.chunks) console.error("not every chunk read sector windows", JSON.stringify(r.sources));
  const strip = (x) => { const { tick: _t, plans: _p, ...rest } = JSON.parse(x); return JSON.stringify(rest); };
  if (strip(mem.state) !== strip(viaF1)) console.error("sector windows and the one-file plan disagree");
}

const st = JSON.parse(mem.state);
const pairs = st.buckets ? st.buckets.flatMap(b => Object.entries(b.pairs)) : Object.entries(st.pairs);
const deg = new Map(), fdeg = new Map();
for (const [pk, rec] of pairs) for (const k of pk.split("|")) { deg.set(k, (deg.get(k) || 0) + 1); if (rec[0] >= 30) fdeg.set(k, (fdeg.get(k) || 0) + 1); }
const friends = pairs.filter(([, r]) => r[0] >= 30).length;
// by class: the figures on file carry full breakdowns and befriend far more readily than
// engine figures and citizens, so the roster's mix moves the average; compare within a class.
const cls = new Map(fullRoster(census).map(x => [SIM.keyOf(x), x.kind === "citizen" ? "citizen" : x.engine ? "engine" : "onFile"]));
const perClass = {}, sizes = {};
for (const c of cls.values()) sizes[c] = (sizes[c] || 0) + 1;
for (const [pk, rec] of pairs) if (rec[0] >= 30) for (const k of pk.split("|")) perClass[cls.get(k)] = (perClass[cls.get(k)] || 0) + 1;
const pub = JSON.parse(mem.pub);
const { bySubject, ...city } = pub;
const api = JSON.stringify({ ready: true, ...city });
console.log(JSON.stringify({
  N: n, coldS: s(coldMs), steadySimS: s(steadySim), steadyF1S: s(steadyF1), steadyF2S: steadyF2 == null ? null : s(steadyF2),
  x9LambdaS: s((steadyF2 ?? steadyF1) * 9), steadyHours: h1 - h0,
  pairs: pairs.length, friends, friendsPerSubject: +(2 * friends / n).toFixed(3),
  perOnFile: +((perClass.onFile || 0) / sizes.onFile).toFixed(3), perEngine: +((perClass.engine || 0) / (sizes.engine || 1)).toFixed(3), withFriend: fdeg.size, maxDegree: Math.max(0, ...deg.values()),
  stateKB: +(mem.state.length / 1024).toFixed(0), apiSocialKB: +(api.length / 1024).toFixed(0), apiSocialGzKB: +(gzipSync(api).length / 1024).toFixed(1),
  shardMaxKB: mem.shards.length ? +(Math.max(...mem.shards) / 1024).toFixed(1) : null,
}));
