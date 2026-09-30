// The civic fold's CROWDING factor per district (src/city/civic.js mood.f.crowd) at roster size N,
// for the expansion's before/after (docs/CITY_SPEC.md "The Coast and the Heights"). Not a check:
// node scripts/bench-crowding.mjs [live] [N...]. Builds one machine day from the sim and folds it.
import { readFileSync, existsSync } from "node:fs";
import * as SIM from "../src/city/sim.js";
import { synthRoster } from "./synth-roster.mjs";
import { fullRoster } from "../src/city/roster.js";
import { fetchPen } from "../src/penClient.js";
import { civicFold, dayStats } from "../src/city/civic.js";

const args = process.argv.slice(2);
const D0 = SIM.machineClock().day + 1;
async function rosterOf(a) {
  if (a === "live") return fullRoster(process.env.PEN && existsSync(process.env.PEN) ? JSON.parse(readFileSync(process.env.PEN)).subjects : await fetchPen({ base: "https://humanvalueindex.com" }));
  return synthRoster(+a);
}
for (const a of args.length ? args : ["live", "5000"]) {
  const roster = await rosterOf(a);
  SIM.setMemoCap(1e8);
  SIM.setRoster(roster);
  const plan = SIM.buildPlan(D0);
  const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
  const block = civicFold(plan, people, null), st = dayStats(plan, people);
  const rows = SIM.DISTRICTS.map(d => {
    const x = block.districts[d.id], s = st[d.id];
    return `${d.id.padEnd(8)} crowd ${String(x.mood.f.crowd).padStart(4)}  mood ${String(x.mood.s).padStart(4)}  excess ${s.excess.toFixed(2)}  homeOver ${s.homeOver.toFixed(2)}  workers ${s.workers} residents ${s.residents}`;
  });
  const sum = SIM.DISTRICTS.reduce((n, d) => n + block.districts[d.id].mood.f.crowd, 0);
  console.log(`${a} N=${roster.length} day ${D0}: crowd factor sum ${sum}, mean ${(sum / SIM.DISTRICTS.length).toFixed(1)}`);
  console.log(rows.join("\n"));
  SIM.clearRoster();
}
