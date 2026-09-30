// The plan builder's cost and payload at roster size N (docs/CITY_SPEC.md "Plans"; the
// step-3 decision of where the builder runs). Not a check: node scripts/bench-plans.mjs
// [live] [N...]. "live" = the production census (GET /api/pen) plus the figures on file.
// Per N: the cold build (a fresh process's first day: two capacity allocations plus every
// route), each further day, the plan's raw and gzip size, and the heap. Lambda runs this
// code ~9x slower than the Mac (measured on the social tick, 2026-09-29).
import { gzipSync, brotliCompressSync } from "node:zlib";
import * as SIM from "../src/city/sim.js";
import { synthRoster } from "./synth-roster.mjs";
import { fullRoster } from "../src/city/roster.js";
import { fetchPen } from "../src/penClient.js";
import { splitDay, SECTORS } from "../src/city/planSplit.js";

const args = process.argv.slice(2);
const DAYS = 4;
const D0 = SIM.machineClock().day;
async function rosterOf(a) {
  if (a === "live") return fullRoster(await fetchPen({ base: "https://humanvalueindex.com" }));
  return synthRoster(+a);
}
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const a of args.length ? args : ["live", "1000", "5000", "20000"]) {
  const roster = await rosterOf(a);
  SIM.setMemoCap(1e8);
  SIM.setRoster(roster);
  const ms = [];
  let json = "";
  for (let d = D0; d < D0 + DAYS; d++) {
    const t = performance.now();
    json = JSON.stringify(SIM.buildPlan(d));
    ms.push(performance.now() - t);
  }
  const gz = gzipSync(json).length, br = brotliCompressSync(Buffer.from(json)).length;
  const heap = process.memoryUsage().heapUsed;
  console.log(`${String(a).padEnd(6)} N=${roster.length}  cold day ${ms[0].toFixed(0)} ms, next days ${ms.slice(1).map(x => x.toFixed(0)).join("/")} ms, ${DAYS} days ${ms.reduce((x, y) => x + y, 0).toFixed(0)} ms  x9 Lambda ${(ms.reduce((x, y) => x + y, 0) * 9 / 1000).toFixed(1)} s  | plan ${kb(json.length)} raw, ${kb(gz)} gzip, ${kb(br)} br  | heap ${(heap / 1048576).toFixed(0)} MB`);
  // The sector split of the last day (step 4): its cost, and what a browser downloads.
  const plan = JSON.parse(json), ver = "0.000000000000";
  SIM.setPlan(plan, ver);
  const t = performance.now();
  const sp = splitDay(plan, ver, new Map(roster.map(s => [SIM.keyOf(s), s])));
  const splitMs = performance.now() - t;
  SIM.dropPlan(plan.day);
  const g = (o) => { const j = JSON.stringify(o); return [j.length, gzipSync(j).length]; };
  const win = SECTORS.flatMap(id => sp.windows[id].map(f => [id, f.window, ...g(f)]));
  const tot = win.reduce((n, x) => n + x[2], 0), totg = win.reduce((n, x) => n + x[3], 0);
  const big = win.slice().sort((x, y) => y[3] - x[3]).slice(0, 3).map(x => `${x[0]}/${x[1]} ${kb(x[2])}/${kb(x[3])}`).join(", ");
  const [sr, sg] = g(sp.summary), [fr, fg] = g(sp.find);
  console.log(`       split ${splitMs.toFixed(0)} ms (x9 ${(splitMs * 9 / 1000).toFixed(1)} s) | summary ${kb(sr)}/${kb(sg)} gz | find ${kb(fr)}/${kb(fg)} | 40 windows ${kb(tot)}/${kb(totg)} gz, median ${kb(win.map(x => x[3]).sort((x, y) => x - y)[20])} gz, biggest ${big}`);
  SIM.clearRoster();
}
