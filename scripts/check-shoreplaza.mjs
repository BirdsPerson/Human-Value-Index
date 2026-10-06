// THE SHORE PLAZA (src/city/shorePlaza.js; docs/CITY_SPEC.md "THE SHORE PLAZA"):
//   the name     the Coast's tower is THE SHORE PLAZA everywhere it is named (the building, the residents'
//                place, the helipad, FIND answers "shore plaza" and "surfside"); its id, its lot, its
//                residents' place and rect are what they were
//   the move     from PLAZA_DAY Sam's stands on the Plaza's street level and Irene's on its two floors
//                over it (same place ids); before it they stand on their old lots, in their old
//                buildings; the old lots keep their building ids and ground, TO LET, in no plan
//   the day      the days before PLAZA_DAY are byte for byte what the code before built (plans and
//                whereAt for synthRoster(430), against scripts/fixtures/shoreplaza-pre.json, made from
//                the earlier code); PLAZA_DAY's plan walks to the Plaza, and Irene's new staff come on
//   the brewery  the cutaway: Sam's counter, ovens and booths at the street; Irene's brewhouse (mash
//                tun, kettle, fermenters, bright tanks, malt, kegs) and taproom (bar, taps, the sign,
//                the brick oven, the stage); the proprietor on record holds Irene's units
//   the record   proprietors.json and its server half agree; no case id in the bundle's half
// node scripts/check-shoreplaza.mjs
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import * as SIM from "../src/city/sim.js";
import * as SP from "../src/city/shorePlaza.js";
import { towerPlan, isTower, FURNISH } from "../src/city/tower.js";
import { CATALOG } from "../src/city/furniture.js";
import { PADS } from "../src/city/emergence.js";
import { findFunnel } from "../src/city/funnels.js";
import { PROPRIETORS, proprietorOf, OWNABLE } from "../src/city/proprietors.js";
import { massingOf } from "../src/city/archGeo.js";
import { synthRoster } from "./synth-roster.mjs";
import * as TERMINAL from "../src/city/terminal.js";   // THE TERMINAL: the first old lot, let as the internet cafe (check-mail.mjs)

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("  FAIL", msg); } else if (process.env.VERBOSE) console.log("  ok", msg); };
const root = new URL("../", import.meta.url).pathname;
const fx = JSON.parse(readFileSync(root + "scripts/fixtures/shoreplaza-pre.json", "utf8"));
const D = SP.PLAZA_DAY, B = SIM.BUILDING[SP.PLAZA_ID];

// ---- the name, and nothing else of it moved -----------------------------------------------------------
ok(B && B.name === "THE SHORE PLAZA" && SP.PLAZA_ID === "the-surfside", `the building id is still the-surfside, named THE SHORE PLAZA (${B?.name})`);
ok(/SHORE PLAZA/.test(SIM.PLACES.surfside.name) && !/SURFSIDE/.test(SIM.PLACES.surfside.name), "the residents' place is named for the Plaza (its id kept)");
ok(JSON.stringify(SIM.PLACES.surfside.rect) === JSON.stringify(fx.surfside.rect) && JSON.stringify(SIM.PLACES.surfside.pos) === JSON.stringify(fx.surfside.pos), "the residents' ground and spot are what they were");
ok(JSON.stringify(B.rect) === JSON.stringify(fx.surfside.building), "the building's lot is unchanged");
ok(SIM.BUILDINGS.length === fx.buildingIds.length && SIM.BUILDINGS.every((b, i) => b.id === fx.buildingIds[i]), "no building added, moved in order or renamed by id");
ok(Object.keys(SIM.PLACES).filter(id => !SIM.PLACES[id].shell).join(",") === fx.placeIds.join(","), "every place where it was in the list; the old lots' shells after them all");
const pad = PADS.find(p => p.building === SP.PLAZA_ID);
ok(pad && pad.name === "THE SHORE PLAZA" && Math.abs(pad.h - massingOf(B).rise) < 1e-9, "the helipad is on the Plaza's roof, under its name");
const crown = massingOf(B).parts.find(p => p.h1 === massingOf(B).rise);
ok(crown && pad.x > crown.x0 && pad.x < crown.x1 && pad.y > crown.y0 && pad.y < crown.y1, "the pad stands on the deck house");
for (const q of ["shore plaza", "surfside", "sam's pizza", "irene"]) ok(findFunnel(q).some(f => f.id === SP.PLAZA_ID), `FIND answers "${q}" with the Shore Plaza`);
ok(isTower(B) && towerPlan(B).name === "THE SHORE PLAZA", "the cutaway is headed THE SHORE PLAZA");
for (const id of SP.PLAZA_MOVES) ok(!/SURFSIDE/.test(JSON.stringify(SIM.PLACES[id].name)), `${id}: named without the Surfside`);

// ---- the move -------------------------------------------------------------------------------------------
const floorCode = (id) => SIM.PLACES[id].floors.map(i => B.floors[i].code).join(",");
ok(SIM.PLACES[SP.SAMS].building === SP.PLAZA_ID && floorCode(SP.SAMS) === "G", `Sam's: the Plaza's street level (${SIM.PLACES[SP.SAMS].building} ${floorCode(SP.SAMS)})`);
ok(SIM.PLACES[SP.IRENES].building === SP.PLAZA_ID && floorCode(SP.IRENES) === `${SP.BREWHOUSE},${SP.TAPROOM}`, `Irene's: the brewhouse and the taproom over Sam's (${floorCode(SP.IRENES)})`);
ok(B.floors.find(f => f.code === "G").places.includes("surfside"), "the residents' lobby shares the street level");
ok(JSON.stringify(SIM.PLACES[SP.SAMS].rect) === JSON.stringify(SIM.PLACES.surfside.rect), "Sam's stands on the Plaza's ground (the lot is not split for it)");
for (const [id, sh] of Object.entries(SP.SHELL_OF)) {
  const b = SIM.BUILDING[id];
  ok(b && b.places.length === 1 && b.places[0] === sh && SIM.PLACES[sh].shell && (SIM.PLACES[sh].from === Infinity || (sh === TERMINAL.CAFE_ID && SIM.PLACES[sh].from === TERMINAL.CAFE_DAY)), `${id}: the old lot keeps its building id, TO LET or let as THE TERMINAL from its day (${b?.name})`);
}
ok(SIM.BUILDING["goodnight-irenes"].floors.length === 2, "Irene's old corner keeps its two floors (a day published before the move names its upstairs)");
for (const id of SP.PLAZA_MOVES) {
  ok(SIM.placedAt(id, D).building === SP.PLAZA_ID && SIM.placedAt(id, D - 1).building === id, `${id}: the Plaza's from day ${D}, its old lot's before`);
  for (const d of [1, D - 1, D, D + 30]) ok(SIM.BUILDING[SIM.placedAt(id, d).building].floors.length > Math.max(...SIM.placedAt(id, d).floors), `${id} on day ${d}: every floor it names exists`);
}

// ---- the day boundary -------------------------------------------------------------------------------------
const roster = synthRoster(fx.n); SIM.setRoster(roster);
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const whereSha = (day) => { const out = []; for (const s of roster) for (let m = 0; m < 1440; m += 30) { const w = SIM.whereAt(s, (day - 1) * 24 + m / 60); out.push(`${w.placeId}|${w.sub || ""}|${w.x.toFixed(5)}|${w.y.toFixed(5)}`); } return sha(out.join("\n")); };
ok(fx.plazaDay === D, `the fixture was made for PLAZA_DAY ${D} (it says ${fx.plazaDay})`);
for (const d of [D - 2, D - 1]) {
  ok(sha(JSON.stringify(SIM.buildPlan(d))) === fx.plans[d], `day ${d}'s plan is byte for byte the earlier code's`);
  ok(whereSha(d) === fx.where[d], `day ${d}: everyone where the earlier code put them, every half hour`);
}
const plan = SIM.buildPlan(D);
ok(sha(JSON.stringify(plan)) !== fx.plans[D], `day ${D} is built with the Plaza`);
ok(SP.PLAZA_SHELLS.every(([id]) => !plan.places.includes(id)), "the old lots are in no plan");
// on PLAZA_DAY a stay at Sam's or Irene's is inside the Plaza; the day before, on the old lots
const inRect = (w, r) => w.x >= r.x - 1e-6 && w.x <= r.x + r.w + 1e-6 && w.y >= r.y - 1e-6 && w.y <= r.y + r.h + 1e-6;
const seen = { [D]: 0, [D - 1]: 0 }; let wrong = 0, staffed = 0;
for (const s of roster) for (const d of [D - 1, D]) for (let m = 0; m < 1440; m += 20) {
  const w = SIM.whereAt(s, (d - 1) * 24 + m / 60);
  if (!SP.PLAZA_MOVES.includes(w.placeId) || w.activity === "commute") continue;
  seen[d]++;
  const want = d >= D ? B.rect : SIM.BUILDING[w.placeId].rect;
  if (!inRect(w, want)) wrong++;
  if (w.buildingId !== SP.PLAZA_ID || !B.floors[w.floor]?.places.includes(w.placeId)) wrong++;
  if (d === D && w.activity === "work") staffed++;
}
ok(seen[D] > 0 && seen[D - 1] > 0 && wrong === 0, `stays at Sam's and Irene's: on the old lots on day ${D - 1} (${seen[D - 1]}), in the Plaza on day ${D} (${seen[D]}); the floor always the Plaza's (${wrong} wrong)`);
ok(staffed > 0, `day ${D}: Sam's and Irene's are staffed (${staffed} half-hours on shift)`);

// ---- Irene's new staff, from PLAZA_DAY only -----------------------------------------------------------------
{
  const jobs = new Set(SP.PLAZA_JOBS.map(j => j[0]));
  let before = 0, after = 0, wrongPool = 0;
  const byJob = {};
  for (const s of roster) {
    const base = SIM.JOB[SIM.assignJob(s).jobId];
    const pulled = SP.PLAZA_STAFF.find(p => p.from.includes(base?.id));
    const onPlaza = (d) => SIM.schedule(s, d).some(g => g.activity === "work" && g.placeId === SP.IRENES);
    if (pulled && onPlaza(D - 1) && base.place !== SP.IRENES) before++;
    if (pulled && base.place !== SP.IRENES && (onPlaza(D) || onPlaza(D + 1) || onPlaza(D + 2))) { after++; byJob[pulled.job] = (byJob[pulled.job] || 0) + 1; }
    if (!pulled && base?.place !== SP.IRENES && (onPlaza(D) || onPlaza(D + 1))) {
      // only the storefront owners' and the Plaza's pools reach Irene's on shift
      const any = SIM.schedule(s, D).find(g => g.activity === "work");
      if (any && any.placeId === SP.IRENES) wrongPool++;
    }
  }
  ok(before === 0, `nobody is moved to Irene's before day ${D} (${before})`);
  ok(after > 0, `from day ${D} Irene's takes cellar hands and servers from their pools (${JSON.stringify(byJob)})`);
  ok(wrongPool === 0, `nobody else is put on Irene's floor (${wrongPool})`);
  ok([...jobs].every(id => SIM.JOB[id] && !SIM.JOBS.some(j => j.id === id)), "the new jobs are in JOB, not in JOBS (assignment unchanged)");
  ok(["Head Brewer", "Cellar Hand", "Server"].every(t => SP.PLAZA_JOBS.some(j => j[1] === t)) && SIM.JOB["brewpub-bartender"].place === SP.IRENES, "HEAD BREWER, CELLAR HAND, SERVER, and the bartender behind the taps");
}

// ---- the brewery and the pizzeria, in the cutaway -----------------------------------------------------------
{
  const P = towerPlan(B), unitsOf = (id) => P.storeys.flatMap(st => st.units.filter(u => u.placeId === id).map(u => ({ st, u })));
  const items = (id) => new Set(unitsOf(id).flatMap(({ u }) => u.rooms.flatMap(r => r.furniture.map(f => f.item))));
  const sams = items(SP.SAMS), irenes = items(SP.IRENES);
  ok(unitsOf(SP.SAMS).every(({ st }) => st.level === 0) && unitsOf(SP.SAMS).length === 1, "Sam's is one storefront at the street, beside the lobby");
  ok(P.storeys.find(s => s.level === 0).units.some(u => u.kind === "lobby"), "the residents' lobby is at the street");
  for (const it of ["pizza-oven", "pizza-counter", "sams-sign", "diner-booth"]) ok(sams.has(it), `Sam's: ${CATALOG[it]?.name}`);
  for (const it of ["mash-tun", "brew-kettle", "fermenter", "bright-tank", "grain-sacks", "keg-stack", "tap-bar", "irenes-sign", "brick-oven", "stage-corner"]) ok(irenes.has(it), `Irene's: ${CATALOG[it]?.name}`);
  ok(["pizzeria", "booths", "brewhouse", "cellar", "taproom", "snug"].every(k => FURNISH[k].every(f => CATALOG[f.item]?.rooms.includes(k))), "every fitting is in the catalog, for its room");
  const own = proprietorOf(SP.IRENES);
  ok(!own || unitsOf(SP.IRENES).every(({ u, st }) => u.owner === own && st.owner === own), "Irene's units and floors are held by its proprietor on record");
  ok(unitsOf(SP.SAMS).every(({ u }) => u.owner.kind === "dept"), "Sam's is nobody's (a real business that lent its name)");
}

// ---- the proprietor record ------------------------------------------------------------------------------------
{
  // The case id half lives in Blobs (hvi-proprietors, scripts/set-proprietor.mjs), never in the
  // repository: no case number anywhere in either source file (docs/SECURITY.md).
  const pubText = readFileSync(root + "src/city/proprietors.json", "utf8");
  ok(!/HVI-[A-Z0-9]+/i.test(pubText), "the bundle's half carries no case id");
  ok(!existsSync(root + "netlify/lib/proprietors.json"), "no committed server half (the case id is in Blobs)");
  ok(Object.keys(PROPRIETORS).every(id => OWNABLE.includes(id)) && !(SP.SAMS in PROPRIETORS), "only the city's own businesses are on record (never Sam's)");
  for (const [id, r] of Object.entries(PROPRIETORS)) {
    ok(/^citizen-[a-z0-9]{4}$/.test(r.owner) && /^SUBJECT [A-Z0-9]{4}$|^[A-Z]/.test(r.name) && r.by === "operator" && Number.isInteger(r.since), `${id}: a public key, a name, by the operator, since a machine day`);
    ok(proprietorOf(id)?.label === `PROPRIETOR: ${r.name}`, `${id}: the plaque reads PROPRIETOR: ${r.name}`);
  }
}

console.log(fails ? `check-shoreplaza: ${fails} of ${checks} FAILED` : `check-shoreplaza: ${checks} checks passed (PLAZA_DAY ${D})`);
process.exit(fails ? 1 : 0);
