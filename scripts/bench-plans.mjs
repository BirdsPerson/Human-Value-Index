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

const args = process.argv.slice(2);
const DAYS = 4;
const D0 = SIM.machineClock().day;
async function rosterOf(a) {
  if (a === "live") return fullRoster((await (await fetch("https://humanvalueindex.com/api/pen")).json()).subjects);
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
  SIM.clearRoster();
}
