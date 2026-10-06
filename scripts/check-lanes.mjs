// THE LANES in the city (src/city/lanes.js, lanesProps.js; the game is check-bowl.mjs):
//   ground      a new top floor on THE ARCADE (2F), the arcade's floors keep their indexes; the lanes stand
//               on the arcade's ground (its rect and spot unchanged), no building moved, no id changed
//   the day     the days published before LANES_DAY are byte for byte what the code before built (plans
//               and whereAt for synthRoster(430), against scripts/fixtures/lanes-pre.json); LANES_DAY's plan
//               names the lanes, and somebody works there and somebody bowls
//   jobs        the shoe clerks and the lane mechanics come from their pools, only from LANES_DAY, and
//               job assignment (JOBS) is untouched
//   league      a league night (Tuesday, Thursday from 19:00) draws more bowlers than a Monday evening
//   the room    furnished as lanes (shoe counter and snack bar staffed, bowlers at the returns, cabinets);
//               a tap in it opens #bowling; the building page and the drive mode's E go there too
// node scripts/check-lanes.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as SIM from "../src/city/sim.js";
import * as L from "../src/city/lanes.js";
import { synthRoster } from "./synth-roster.mjs";

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } else if (process.env.VERBOSE) console.log("  ok", msg); };
const fx = JSON.parse(readFileSync(new URL("./fixtures/lanes-pre.json", import.meta.url), "utf8"));
const D = L.LANES_DAY;

// ---- the ground --------------------------------------------------------------------------------------
{
  const b = SIM.BUILDING["the-arcade"];
  ok(b.floors.map(f => `${f.index}:${f.code}:${f.places.join("+")}`).join(",") === "0:G:arcade,1:1F:arcade,2:2F:the-lanes", `the arcade's floors: G, 1F, then THE LANES at 2F (${b.floors.map(f => f.code).join(",")})`);
  ok(JSON.stringify(SIM.PLACES.arcade.rect) === JSON.stringify(fx.arcade.rect) && JSON.stringify(SIM.PLACES.arcade.pos) === JSON.stringify(fx.arcade.pos), "the arcade's ground and spot are what they were");
  ok(JSON.stringify(SIM.PLACES[L.LANES_ID].rect) === JSON.stringify(SIM.PLACES.arcade.rect), "the lanes stand on the arcade's ground");
  ok(JSON.stringify(b.rect) === JSON.stringify(fx.arcade.building), "the building's lot is unchanged");
  ok(SIM.BUILDINGS.length === fx.buildings && SIM.BUILDINGS.every((x, i) => x.id === fx.buildingIds[i]), "no building added, moved in order or renamed");
  ok(Object.keys(SIM.PLACES).slice(0, -1).join(",") === fx.placeIds.join(",") && Object.keys(SIM.PLACES).at(-1) === L.LANES_ID, "every place where it was; the lanes last");
}

// ---- the day boundary ---------------------------------------------------------------------------------------
const roster = synthRoster(fx.n); SIM.setRoster(roster);
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const whereSha = (day) => { const out = []; for (const s of roster) for (let m = 0; m < 1440; m += 30) { const w = SIM.whereAt(s, (day - 1) * 24 + m / 60); out.push(`${w.placeId}|${w.sub || ""}|${w.x.toFixed(5)}|${w.y.toFixed(5)}`); } return sha(out.join("\n")); };
{
  ok(fx.lanesDay === D, `the fixture was made for LANES_DAY ${D} (it says ${fx.lanesDay})`);
  for (const d of [D - 2, D - 1]) {
    ok(sha(JSON.stringify(SIM.buildPlan(d))) === fx.plans[d], `day ${d}'s plan is byte for byte the earlier code's`);
    ok(whereSha(d) === fx.where[d], `day ${d}: everyone where the earlier code put them, every half hour`);
  }
  const plan = SIM.buildPlan(D);
  ok(sha(JSON.stringify(plan)) !== fx.plans[D], `day ${D} is built with the lanes`);
  const li = plan.places.indexOf(L.LANES_ID);
  ok(li === plan.places.length - 1 && !SIM.buildPlan(D - 1).places.includes(L.LANES_ID), "the lanes are in the plans from their day, last, and not before");
  let work = 0, bowl = 0;
  for (const row of Object.values(plan.subjects)) for (const seg of row.slice(1)) if (seg.length > 2 && seg[1] === li) { if (seg[2] === 1) work++; else bowl++; }   // seg[2]: PLAN_ACT (1 work)
  ok(work + bowl > 0, `day ${D}: ${work + bowl} stays at the lanes`);
}

// ---- jobs ------------------------------------------------------------------------------------------------------
{
  let staff = 0, before = 0, wrong = 0;
  for (const s of roster) {
    const job = SIM.JOB[SIM.assignJob(s).jobId];
    const on = (day) => SIM.schedule(s, day).some(g => g.activity === "work" && g.placeId === L.LANES_ID);
    if (on(D) || on(D + 1) || on(D + 2)) { staff++; if (!L.LANES_STAFF.some(p => p.from.includes(job.id))) wrong++; }
    if (on(D - 1) || on(D - 2)) before++;
  }
  ok(staff > 0 && wrong === 0 && before === 0, `the staff: ${staff} work at the lanes from day ${D}, all from the pools (${wrong} not), none before (${before})`);
  ok(!SIM.JOBS.some(j => j.place === L.LANES_ID) && SIM.JOB["shoe-clerk"] && SIM.JOB["lane-mechanic"], "assignment's job list is untouched; the lanes' jobs are on file");
}

// ---- league nights --------------------------------------------------------------------------------------------
{
  const countAt = (day, hour) => roster.filter(s => SIM.whereAt(s, (day - 1) * 24 + hour).placeId === L.LANES_ID).length;
  let league = 0, other = 0, nl = 0, no = 0;
  for (let d = D; d < D + 14; d++) {
    const wd = SIM.weekdayOf(d), n = countAt(d, 20.5) + countAt(d, 21.5);
    if (L.LEAGUE_DAYS.includes(wd)) { league += n; nl++; } else if (wd !== 5 && wd !== 6) { other += n; no++; }
  }
  ok(league / nl > other / no, `league nights draw more (${(league / nl).toFixed(1)} a night at 20:30 and 21:30 against ${(other / no).toFixed(1)} on other weeknights)`);
  ok(countAt(D + 1, 9) === roster.filter(s => SIM.whereAt(s, D * 24 + 9).placeId === L.LANES_ID && SIM.whereAt(s, D * 24 + 9).activity === "work").length, "nobody bowls at nine in the morning (closed until noon)");
}

// ---- the room, the taps, the prompts -------------------------------------------------------------------------------
{
  globalThis.window = globalThis.window || {}; // props.js reads nothing from it at import
  const P = await import("../src/city/props.js");
  ok(P.typeOf(L.LANES_ID) === "lanes", "furnished as lanes");
  const plan = P.roomPlan("lanes", 400, 120, 32, 24);
  const kinds = plan.anchors.map(a => `${a.role}:${a.act}`);
  ok(kinds.filter(k => k === "staff:serve").length >= 2 && kinds.includes("patron:bowl") && kinds.includes("patron:watch"), `the room: ${[...new Set(kinds)].join(", ")}`);
  const props = plan.rows.flatMap(r => r.items.map(i => i.prop));
  ok(props.includes("shoeCounter") && props.includes("snackBar") && props.some(p => p?.startsWith?.("cab:")), "the shoe counter, the snack bar and the cabinets");
  const F = await import("../src/city/funnelProps.js");
  ok(F.funnelTapAt(L.LANES_ID, plan, 10, 10)?.go === "#bowling", "a tap in the room opens #bowling");
  const FN = await import("../src/city/funnels.js");
  ok(FN.funnelButtons("the-arcade").some(b => b.spec.go?.startsWith("#bowling")), "the arcade's toolbar offers BOWL");
  const ci = readFileSync(new URL("../src/city/controlIso.js", import.meta.url), "utf8");
  ok(ci.includes('kind: "bowl", go: `#bowling') && ci.includes('n.kind === "bowl") { window.location.hash = n.go'), "drive mode: E upstairs at the arcade takes a lane");
  const bv = readFileSync(new URL("../src/city/BuildingView.jsx", import.meta.url), "utf8");
  ok(/"the-arcade": \[[^\]]*"#bowling/.test(bv), "the building page links the lanes");
}

console.log(`check-lanes: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
