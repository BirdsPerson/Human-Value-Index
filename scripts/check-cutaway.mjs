// Tower cutaways (src/city/tower.js, docs/CITY_SPEC.md "Tower cutaways"). Pure node, no DOM.
//   node scripts/check-cutaway.mjs
// Every tower stands as many storeys as its massing in the city, every sim floor is drawn, the
// IDs the ownership slice will key on are stable, and the people are placed one room each,
// deterministically, where whereAt says they are (residents asleep in bed at night).
import { BUILDINGS, PLACES, whereAt, homeOf, floorOf, keyOf, isOwl } from "../src/city/sim.js";
import { FAMOUS_FIGURES, slugify, TIERS } from "../src/figures.js";
import { legacyTier } from "./synth-roster.mjs";
import { massingOf } from "../src/city/archGeo.js";
import { roomIn } from "../src/city/simApi.js";
import { CATALOG, dressUnit, lookSig, TAG_PROPS } from "../src/city/furniture.js";
import { TOWERS, isTower, towerPlan, storeysAbove, placeAll, residentFlat, homeRoom, flatOf, FURNISH, DEPT, TOWER_STYLES } from "../src/city/tower.js";
import { proprietorOf } from "../src/city/proprietors.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log(`  FAIL ${m}`); } return c; };

// 1. Which buildings are towers, and how tall.
const towers = TOWERS();
ok(towers.length >= 30, `at least 30 towers (${towers.length})`);
for (const id of ["hab-a", "the-meridian", "reserve-tower", "high-street", "engine-offices", "lofts"]) ok(towers.some(b => b.id === id), `${id} is a tower`);
for (const id of ["hq", "the-dive", "chapel", "the-bowl", "maple-close", "chandlery"]) ok(!towers.some(b => b.id === id), `${id} is not a tower`);
for (const b of BUILDINGS) {
  if (!TOWER_STYLES.has(b.arch)) continue;
  const m = massingOf(b), simAbove = b.floors.filter(f => f.level >= 0).length;
  ok(storeysAbove(b) === Math.max(simAbove, Math.round(m.rise)), `${b.id}: ${storeysAbove(b)} storeys above the street = max(sim ${simAbove}, massing ${m.rise})`);
}
for (const b of towers) {
  const p = towerPlan(b), below = b.floors.filter(f => f.level < 0).length;
  ok(p.storeys.length === storeysAbove(b) + below, `${b.id}: storeys = above + basements (${p.storeys.length})`);
  const levels = p.storeys.map(s => s.level);
  ok(levels.every((l, i) => i === 0 || l === levels[i - 1] + 1) && levels.includes(0), `${b.id}: levels contiguous through the street`);
  ok(b.floors.every(f => p.storeys.some(s => s.simFloor === f.index)), `${b.id}: every sim floor is drawn`);
  ok(p.storeys.every((s, i) => i === 0 || s.simFloor >= p.storeys[i - 1].simFloor), `${b.id}: sim floors stack in order`);
  ok(p.storeys.find(s => s.level === 0).units.some(u => u.kind === "lobby"), `${b.id}: a lobby at the street`);
  for (const s of p.storeys) {
    ok(s.units.length > 0, `${s.id}: has units`);
    // held by THE DEPARTMENT, but a business with a proprietor on record (src/city/proprietors.js) holds its own
    const own = (u) => (u.placeId && proprietorOf(u.placeId)) || DEPT;
    ok(s.units.every(u => u.owner === own(u)) && s.owner === (s.units.every(u => own(u) === own(s.units[0])) ? own(s.units[0]) : DEPT), `${s.id}: held by THE DEPARTMENT, or by a business's proprietor on record`);
    for (const u of s.units) for (const r of u.rooms) {
      ok(FURNISH[r.purpose] && Array.isArray(r.furniture) && r.furniture.every(f => typeof f.item === "string" && f.x >= 0 && f.x <= 1), `${r.id}: purpose and furniture`);
    }
  }
  const homes = b.places.filter(pid => PLACES[pid].kind === "home");
  for (const pid of homes) for (const fi of PLACES[pid].floors) ok(p.bySim[fi].some(s => s.units.some(u => u.kind === "flat" && u.placeId === pid)), `${b.id}: sim floor ${fi} of ${pid} has flats`);
}

// 2. Stable IDs: derived from the building's id, unique, the same on every build.
const ids = new Set();
for (const b of towers) {
  const p = towerPlan(b);
  for (const s of p.storeys) {
    ok(s.id === `${b.id}:L${s.level}`, `${s.id}: storey id`);
    for (const u of s.units) {
      ok(u.id.startsWith(`${s.id}:`) && !ids.has(u.id), `${u.id}: unit id unique`);
      ids.add(u.id);
      for (const r of u.rooms) { ok(r.id.startsWith(`${u.id}:`) && !ids.has(r.id), `${r.id}: room id unique`); ids.add(r.id); }
    }
  }
}
const fresh = await import(`../src/city/tower.js?again=${Date.now()}`);
for (const b of towers) ok(JSON.stringify(fresh.towerPlan(b)) === JSON.stringify(towerPlan(b)), `${b.id}: the same plan on a fresh build`);
// golden: ids the ownership slice will store (change these only with a migration)
const GOLD = { "hab-a": ["hab-a:L0:A", "hab-a:L3:B", "hab-a:L7:D:living"], "the-meridian": ["the-meridian:L13:A:study", "the-meridian:L5:B:bath"], "reserve-tower": ["reserve-tower:L-1:A", "reserve-tower:L13:A"] };
for (const [bid, list] of Object.entries(GOLD)) for (const id of list) ok(ids.has(id), `golden id ${id}`);

// 3. People: a production-shaped roster through whereAt at six hours.
const pop = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) }))
  .concat(Array.from({ length: 1200 }, (_, i) => ({ slug: `citizen-${i}`, name: `Citizen ${i}`, ...legacyTier(i * 7), kind: "citizen" })));
let placed = 0, asleep = 0, nights = 0, homeNow = 0, inOwnFlat = 0, atWork = 0, inOffice = 0;
for (const hour of [3, 8, 12.5, 15, 19, 23.5]) {
  const mt = 24 * 5 + hour;
  const entries = pop.map(s => { const w = whereAt(s, mt); return { s, w, r: roomIn(w, s) }; });
  const everywhere = new Map();
  for (const b of towers) {
    const p = towerPlan(b);
    const A = placeAll(p, entries, mt), B = placeAll(p, entries.slice().reverse(), mt);
    ok(JSON.stringify([...A.at].sort()) === JSON.stringify([...B.at].sort()), `${b.id} @${hour}: placement independent of census order`);
    const C = placeAll(p, entries, mt);
    ok(JSON.stringify([...A.at]) === JSON.stringify([...C.at]), `${b.id} @${hour}: deterministic`);
    // one room each: in this tower, and across every tower
    let n = 0;
    for (const [, list] of A.rooms) n += list.length;
    ok(n === A.at.size, `${b.id} @${hour}: nobody in two rooms`);
    for (const [k, room] of A.at) { ok(!everywhere.has(k), `${k} @${hour}: in one tower only (${everywhere.get(k)} and ${room})`); everywhere.set(k, room); }
    placed += A.at.size;
    for (const { s, w, r } of entries) {
      const k = keyOf(s), room = A.at.get(k);
      if (r?.buildingId === b.id) ok(room != null || r.mode !== "here", `${k} @${hour}: in ${b.id} per whereAt, placed in a room`);
      else ok(room == null, `${k} @${hour}: not in ${b.id}, not placed in it`);
      if (!room) continue;
      if (w.activity === "home" && r.mode === "here") {
        homeNow++;
        const f = residentFlat(p, s);
        if (homeOf(s) === w.placeId && f && room.startsWith(`${f.id}:`)) inOwnFlat++;
        if (hour === 3 && !isOwl(s)) { nights++; if (/:bedroom$/.test(room)) asleep++; }
      }
      if (w.activity === "work" && r.mode === "here") { atWork++; if (/:(office|vault|shop|lounge|pizzeria|booths|brewhouse|cellar|taproom|snug)\d*$/.test(room) || /^airport-hotel:/.test(room)) inOffice++; else console.log(`  worker ${k} in ${room}`); }
    }
  }
}
ok(placed > 500, `people placed across the towers (${placed})`);
ok(homeNow > 100 && inOwnFlat === homeNow, `everyone home is in their own flat, the one on their nameplate (${inOwnFlat}/${homeNow})`);
ok(nights > 50 && asleep === nights, `residents asleep in bed at 03:00 (${asleep}/${nights})`);
ok(atWork === inOffice, `workers in a tower are at work in its offices, shops and venues (${inOffice}/${atWork})`);
// the clock's rooms: night -> bedroom, breakfast -> kitchen
{
  const u = towerPlan(BUILDINGS.find(b => b.id === "the-meridian")).storeys[5].units.find(x => x.kind === "flat");
  ok(homeRoom(u, "x", 24 * 3 + 2).purpose === "bedroom", "02:00 bedroom");
  ok(homeRoom(u, "x", 24 * 3 + 7.75).purpose === "kitchen", "07:45 kitchen");
  ok(homeRoom(u, "x", 24 * 3 + 12.5).purpose === "kitchen", "12:30 kitchen");
  ok(["living", "study", "bath"].includes(homeRoom(u, "x", 24 * 3 + 15).purpose), "15:00 living, study or bath");
  ok(flatOf(towerPlan(BUILDINGS.find(b => b.id === "the-meridian")), "penthouses", 99, "x") === null, "no flat on a floor that is not there");
}
ok(!isTower(null) && !isTower(BUILDINGS.find(b => b.id === "hq")), "HQ keeps the Holding Pen");
// 4. Dressing (furniture.js): each flat its own, deterministically, within its tier.
{
  for (const it of Object.values(CATALOG)) ok(it.id && it.name && it.rooms.length && it.tiers.length && it.footprint.w > 0 && it.footprint.h > 0 && typeof it.draw === "function", `catalog ${it.id}: id, name, rooms, tiers, footprint, draw`);
  for (const id of ["arcade", "ebtv", "beer-tap"]) ok(CATALOG[id], `catalog has ${id}`);
  const ROLE_FOR = { bedroom: "bed", kitchen: "stove", living: "sofa", bath: "tub", study: "desk" };
  const dress = (p, st, u, tags = []) => dressUnit(u, { band: u.kind === "suite" ? 1 : p.band, penthouse: st.code === "PH", tags });
  let flats = 0, arcades = 0, taps = 0, tapsOutside = 0, wrongTier = 0, wrongRoom = 0, noAnchor = 0;
  for (const b of towers) {
    const p = towerPlan(b);
    for (const st of p.storeys) for (const u of st.units) {
      if (u.kind !== "flat" && u.kind !== "suite") continue;
      flats++;
      const L = dress(p, st, u), band = st.code === "PH" ? 0 : u.kind === "suite" ? 1 : p.band;
      ok(lookSig(L) === lookSig(dress(p, st, u)), `${u.id}: the same dressing twice`);
      for (const r of u.rooms) {
        const fur = L.rooms[r.id].furniture;
        if (ROLE_FOR[r.purpose] && !fur.some(f => f.role === ROLE_FOR[r.purpose])) { noAnchor++; console.log(`  ${r.id}: no ${ROLE_FOR[r.purpose]}`); }
        for (const f of fur) {
          const it = CATALOG[f.item];
          if (!it.rooms.includes(r.purpose)) wrongRoom++;
          if (!it.tiers.includes(band)) wrongTier++;
          if (f.item === "arcade") arcades++;
          if (f.item === "beer-tap") { taps++; if (band !== 0) tapsOutside++; }
        }
      }
    }
  }
  ok(noAnchor === 0, `every room has the piece its people use (${noAnchor} missing)`);
  ok(wrongRoom === 0, `every piece in a room it belongs in (${wrongRoom} not)`);
  ok(wrongTier === 0, `every piece within its tier: no bunk beds in the glass towers, no grand pianos in the projects (${wrongTier} not)`);
  ok(arcades > 0 && arcades < flats / 6, `JETSAM cabinets are occasional (${arcades} in ${flats} flats)`);
  ok(taps > 0 && tapsOutside === 0, `Goodnight Irene's taps only in the top tier (${taps}, ${tapsOutside} outside)`);
  // the Meridian: no machinery showing
  const mer = towerPlan(BUILDINGS.find(b => b.id === "the-meridian"));
  const sigs = new Map(), parts = { furn: new Set(), wall: new Set() };
  for (const st of mer.storeys) {
    const us = st.units.filter(u => u.kind === "flat");
    us.forEach((u, k) => {
      const L = dress(mer, st, u), sg = lookSig(L);
      sigs.set(u.id, sg);
      parts.wall.add(L.wall + L.paper);
      for (const r of u.rooms) parts.furn.add(L.rooms[r.id].furniture.map(f => f.item + (f.flip ? "<" : "")).join(","));
      if (k > 0) ok(sg !== sigs.get(us[k - 1].id), `${u.id}: not the same as its neighbour`);
      const below = mer.storeys.find(s => s.level === st.level - 1)?.units[st.units.indexOf(u)];
      if (below && sigs.has(below.id)) ok(sg !== sigs.get(below.id), `${u.id}: not the same as the flat below`);
    });
  }
  const n = sigs.size, distinct = new Set(sigs.values()).size;
  ok(n >= 20 && distinct === n, `the Meridian's ${n} flats all dressed differently (${distinct} distinct)`);
  ok(parts.wall.size >= Math.min(n, 12), `the Meridian: at least 12 wall and paper combinations (${parts.wall.size})`);
  ok(parts.furn.size >= 30, `the Meridian: at least 30 distinct room arrangements (${parts.furn.size})`);
  // residents bring their things
  const u0 = mer.storeys[5].units.find(u => u.kind === "flat");
  for (const [tag, props] of Object.entries(TAG_PROPS)) {
    const L = dress(mer, mer.storeys[5], u0, [tag]);
    const has = Object.values(L.rooms).some(r => r.furniture.some(f => props.includes(f.item) || (tag === "music" && f.item === "grand-piano")));
    ok(has, `a ${tag} resident's flat has ${props.join(" or ")}`);
  }
  // a fresh module dresses the same
  const fresh2 = await import(`../src/city/furniture.js?again=${Date.now()}`);
  ok([...sigs].every(([id]) => { const st = mer.storeys.find(s => id.startsWith(s.id + ":")); const u = st.units.find(x => x.id === id); return fresh2.lookSig(fresh2.dressUnit(u, { band: mer.band, penthouse: st.code === "PH", tags: [] })) === sigs.get(id); }), "the Meridian dresses the same on a fresh build");
}

void floorOf;

console.log(fails ? `check-cutaway: ${fails} FAILED` : `check-cutaway: OK (${towers.length} towers, ${ids.size} ids, ${placed} placements)`);
process.exit(fails ? 1 : 0);
