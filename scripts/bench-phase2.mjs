// PHASE 2 measurements (docs/CITY_SPEC.md "PHASE 2"): for each census size, one machine day built from
// the sim: homes capacity, the crowding factor (the civic fold), the busiest car on every line (exact,
// from the plan's rides), machine minutes in transit for the lowest tier band, the plan's size and
// build time. Not a check: node scripts/bench-phase2.mjs [N...] (default 725 2000 5000).
import * as SIM from "../src/city/sim.js";
import { synthRoster } from "./synth-roster.mjs";
import { civicFold } from "../src/city/civic.js";

const DAY = +(process.env.DAY || 300);
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const homesCap = Object.values(SIM.PLACES).filter(p => p.kind === "home").reduce((n, p) => n + p.cap, 0);
console.log(`homes capacity ${homesCap}; districts ${SIM.DISTRICTS.length}; lines in service ${SIM.linesOn().map(l => l.id).join(", ")}; NET ${SIM.NET}`);
const bandOf = (s) => { const t = SIM.classOf(s); return t <= 0 ? 0 : t <= 2 ? 1 : 2; };
for (const N of sizes.length ? sizes : [725, 2000, 5000]) {
  const roster = synthRoster(N);
  SIM.clearPlans(); SIM.setMemoCap(1e8); SIM.setRoster(roster);
  const t0 = performance.now();
  const plan = SIM.buildPlan(DAY);
  const ms = performance.now() - t0, bytes = JSON.stringify(plan).length;
  const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
  const block = civicFold(plan, people, null);
  const core = SIM.LOOP_DISTRICTS.reduce((n, d) => n + block.districts[d.id].mood.f.crowd, 0), all = SIM.DISTRICTS.reduce((n, d) => n + block.districts[d.id].mood.f.crowd, 0);
  // rides -> (train, car) intervals, absolute hours of the day
  const ev = new Map(), lineOfTrain = {};
  const add = (id, car, a, b) => { const k = `${id}|${car}`; (ev.get(k) || ev.set(k, []).get(k)).push([a, 1], [b, -1]); };
  const transit = [0, 0, 0], count = [0, 0, 0];
  for (const s of roster) {
    const row = plan.subjects[SIM.keyOf(s)]; if (!row) continue;
    const segs = SIM.rowSegs(plan.places, row);
    let tr = 0;
    for (const g of segs) {
      if (g.activity !== "commute") continue;
      tr += g.to - g.from;
      const t = g.trip, dep = g.span[0];
      if (!t || t.local) continue;
      if (t.rail) for (const r of t.rides) { const line = SIM.LINES[r.line], id = line.trains[r.k].id; lineOfTrain[id] = line.id; add(id, r.car, dep + r.board, dep + r.off); }
      else { const id = SIM.TRAINS[t.k].id; lineOfTrain[id] = "loop"; add(id, t.car, dep + t.board, dep + t.off); }
    }
    const b = bandOf(s); transit[b] += tr * 60; count[b]++;
  }
  const busiest = {};
  for (const [k, list] of ev) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let n = 0, m = 0; for (const [, d] of list) { n += d; if (n > m) m = n; }
    const line = lineOfTrain[k.split("|")[0]];
    if (!busiest[line] || m > busiest[line][0]) busiest[line] = [m, k];
  }
  console.log(`N=${N} build ${(ms / 1000).toFixed(2)} s, plan ${(bytes / 1024).toFixed(0)} KB; crowding core ${core} (all ${all})`);
  console.log(`  busiest car: ${Object.entries(busiest).map(([l, [m, k]]) => `${l} ${m} (${k})`).join(", ")}`);
  console.log(`  machine minutes in transit a day by tier band (top, middle, lowest): ${transit.map((x, i) => (x / Math.max(1, count[i])).toFixed(0)).join(", ")}`);
  SIM.clearRoster();
}
