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
import { worldOf, fitCam, clampCam, zoomRange, levelAt, focusAt, hitWorld, screenToWorld, worldToScreen, unitAt, roomAt, moveFocus, crumbs, parseLink, linkParams, itemBoxes, topBox, itemAction, stepCam, LEVELS, deeper, shallower, nextLevel, GEO } from "../src/city/zoomCam.js";

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
  const mt = 24 * 5 + hour, day = Math.floor(mt / 24);
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
        const f = residentFlat(p, s, undefined, day);
        if (homeOf(s, undefined, day) === w.placeId && f && room.startsWith(`${f.id}:`)) inOwnFlat++;
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

// 7. DEEP ZOOM (zoomCam.js): BUILDING > FLOOR > FLAT > ROOM resolve for every room of every tower,
// at a phone and a desktop viewport; deep links round-trip; every level hit-tests to what it shows.
{
  const VPS = [[360, 640], [1280, 720]];
  let rooms = 0, flats = 0;
  for (const b of towers) {
    const plan = towerPlan(b), W = worldOf(plan);
    ok(W.N === plan.storeys.length && W.rows.filter(r => r.kind === "storey").length === W.N, `${b.id}: zoom world has every storey`);
    for (const [vw, vh] of VPS) {
      const rng = zoomRange(W, vw, vh), zb = fitCam(W, vw, vh, "building").z;
      ok(rng.min < zb && rng.max > zb, `${b.id} ${vw}: zoom range holds the building (${rng.min.toFixed(2)}..${rng.max.toFixed(2)})`);
      for (const row of W.rows) if (row.kind === "storey") {
        let prevEnd = null;
        for (const un of row.units) {
          flats++;
          ok(prevEnd == null || un.x >= prevEnd - 0.01, `${un.u.id}: units side by side, none overlapping`);
          prevEnd = un.x + un.w;
          ok(Math.abs(un.rooms.reduce((a, q) => a + q.w, 0) - un.w) < 0.01, `${un.u.id}: its rooms fill it`);
          for (const q of un.rooms) {
            rooms++;
            const f = { i: row.i, k: un.k, j: q.j };
            const zs = LEVELS.map(l => fitCam(W, vw, vh, l, f));
            ok(zs.every(c => Number.isFinite(c.z) && c.z > 0), `${q.rm.id}: finite cameras at ${vw}`);
            ok(zs[0].z < zs[1].z * 1.0001 && zs[1].z <= zs[2].z * 1.0001 && zs[2].z <= zs[3].z * 1.0001, `${q.rm.id}: zoom grows with depth at ${vw} (${zs.map(c => c.z.toFixed(2))})`);
            ok(zs.every(c => { const k = clampCam(W, c, vw, vh); return Math.abs(k.z / c.z - 1) < 1e-6; }), `${q.rm.id}: every level sits inside the zoom range at ${vw}`);
            // the room level fills the view: the room on screen is at most the viewport and at least 60% of it in one axis
            const rs = worldToScreen(zs[3], vw, vh, q.x + q.w, q.y + q.h), r0 = worldToScreen(zs[3], vw, vh, q.x, q.y);
            ok(rs.x - r0.x <= vw + 0.5 && rs.y - r0.y <= vh + 0.5 && (rs.x - r0.x >= vw * 0.6 || rs.y - r0.y >= vh * 0.6), `${q.rm.id}: ROOM fills the view at ${vw}`);
            // the camera's middle is in the thing it flew to, and the level reads back
            const c3 = screenToWorld(zs[3], vw, vh, vw / 2, vh / 2), h3 = hitWorld(W, c3.x, c3.y);
            ok(h3 && h3.i === f.i && h3.k === f.k && h3.j === f.j, `${q.rm.id}: the middle of ROOM zoom hits the room`);
            const c2 = screenToWorld(zs[2], vw, vh, vw / 2, vh / 2), h2 = hitWorld(W, c2.x, c2.y);
            ok(h2 && h2.i === f.i && h2.k === f.k, `${q.rm.id}: the middle of FLAT zoom hits the flat`);
            const c1 = screenToWorld(zs[1], vw, vh, vw / 2, vh / 2), h1 = hitWorld(W, c1.x, c1.y);
            ok(h1 && h1.i === f.i, `${q.rm.id}: the middle of FLOOR zoom hits the floor`);
            if (q.j === 0 && vw === 360) {
              ok(levelAt(W, zs[3], vw, vh) === "room", `${q.rm.id}: the ROOM camera reads as ROOM`);
              // where two stops are the same view (one flat on the floor, one room in the flat) the deeper name wins
              for (const [n, name] of [[1, "floor"], [2, "flat"]]) {
                const got = levelAt(W, zs[n], vw, vh), same = zs[n + 1].z / zs[n].z < 1.1;
                ok(same ? LEVELS.indexOf(got) >= n : got === name, `${un.u.id}: the ${name.toUpperCase()} camera reads as ${name.toUpperCase()}${same ? " or deeper" : ""}: ${got}`);
              }
              const inn = nextLevel(W, vw, vh, "floor", f, 1), out = nextLevel(W, vw, vh, "room", f, -1);
              ok(LEVELS.indexOf(inn) > 1 || inn === "room" && zs[3].z <= zs[1].z * 1.08, `${un.u.id}: zooming in from FLOOR changes the view (${inn})`);
              ok(out !== "room" || zs[3].z <= zs[0].z * 1.08, `${un.u.id}: zooming out from ROOM changes the view (${out})`);
              ok(levelAt(W, zs[0], vw, vh) === "building", `${b.id}: the BUILDING camera reads as BUILDING`);
            }
            if (vw === 360) {
              const fa = focusAt(W, q.x + q.w / 2, q.y + q.h / 2);
              ok(fa.i === f.i && fa.k === f.k && fa.j === f.j, `${q.rm.id}: focusAt the room's middle is the room`);
              ok(roomAt(W, f).rm.id === q.rm.id && unitAt(W, f).u.id === un.u.id, `${q.rm.id}: roomAt/unitAt resolve`);
              // deep links: flat, room, and back
              if (un.u.kind === "flat" || un.u.kind === "suite") {
                const L = parseLink(plan, `?flat=${un.u.id}&zoom=flat`);
                ok(L && L.level === "flat" && L.f.i === f.i && L.f.k === f.k, `${un.u.id}: ?flat=&zoom=flat resolves`);
                const R = parseLink(plan, `?flat=${un.u.id}&zoom=room&room=${q.rm.purpose}`);
                ok(R && R.level === "room" && plan.storeys[R.f.i].units[R.f.k].rooms[R.f.j].purpose === q.rm.purpose, `${q.rm.id}: ?room=${q.rm.purpose} resolves`);
                const P = linkParams(plan, f, "room"), qs = new URLSearchParams(Object.fromEntries(Object.entries(P).filter(([, v]) => v != null))).toString();
                const B = parseLink(plan, qs);
                ok(B && B.level === "room" && B.f.i === f.i && B.f.k === f.k && plan.storeys[B.f.i].units[B.f.k].rooms[B.f.j].purpose === q.rm.purpose, `${q.rm.id}: linkParams round-trips`);
              }
            }
          }
        }
      }
    }
    // the floor deep link, a bad one, and the empty one
    const st = plan.storeys[plan.storeys.length - 1], FL = parseLink(plan, `?floor=${st.simFloor}&storey=${st.level}&zoom=floor`);
    ok(FL && FL.level === "floor" && plan.storeys[FL.f.i].level === st.level, `${b.id}: ?floor=&storey=&zoom=floor resolves`);
    ok(parseLink(plan, "?flat=nowhere:L9:Z&zoom=flat") === null && parseLink(plan, "?floor=2") === null && parseLink(plan, "") === null, `${b.id}: a bad or absent zoom link is no zoom`);
    // arrows and the d-pad stay on the building and reach the ends
    let f = { i: 0, k: 0, j: 0 };
    for (let n = 0; n < W.N + 2; n++) f = moveFocus(W, f, "flat", "up");
    ok(f.i === W.N - 1, `${b.id}: up reaches the top floor`);
    for (let n = 0; n < 40; n++) f = moveFocus(W, f, "room", "right");
    ok(W.at[f.i].units[f.k] && roomAt(W, f), `${b.id}: right along the floor stays in the building`);
    ok(moveFocus(W, { i: 0, k: 0, j: 0 }, "room", "left").i === 0, `${b.id}: left of the first room stays put`);
  }
  ok(rooms > 2000 && flats > 400, `zoom levels resolved for ${rooms} rooms, ${flats} units`);
  // hit-testing at each level: the screen point of a room's middle names that room, at every camera
  {
    const plan = towerPlan(BUILDINGS.find(b => b.id === "the-meridian")), W = worldOf(plan), vw = 390, vh = 780;
    const st = plan.storeys[7], un = st.units.find(u => u.kind === "flat"), k = st.units.indexOf(un), j = un.rooms.length - 1;
    const f = { i: 7, k, j };
    for (const lvl of LEVELS) {
      const cam = fitCam(W, vw, vh, lvl, f), q = W.at[7].units[k].rooms[j];
      const s = worldToScreen(cam, vw, vh, q.x + q.w / 2, q.y + q.h / 2);
      if (s.x < 0 || s.x > vw || s.y < 0 || s.y > vh) { ok(lvl === "building" || lvl === "floor" || lvl === "flat", `${lvl}: the room's middle is on screen`); continue; }
      const p = screenToWorld(cam, vw, vh, s.x, s.y), h = hitWorld(W, p.x, p.y);
      ok(h && h.i === 7 && h.k === k && h.j === j, `${lvl}: tapping the room's middle hits it (${JSON.stringify(h)})`);
    }
    ok(hitWorld(W, 5, W.at[7].y + 20) && hitWorld(W, 5, W.at[7].y + 20).k === -1, "a tap on the lift shaft names no flat");
    ok(hitWorld(W, 100, 5) === null, "a tap on the roof names no storey");
    ok(deeper("room") === "room" && deeper("building") === "floor" && shallower("building") === "building" && shallower("room") === "flat", "deeper/shallower stop at the ends");
    ok(crumbs(W, "THE MERIDIAN", f, "room").map(c => c.label).join(">").startsWith("THE MERIDIAN>FLOOR 7F>FLAT 7") && crumbs(W, "X", f, "building").length === 1 && crumbs(W, "X", f, "room").length === 4, "the breadcrumb: BUILDING > FLOOR > FLAT > ROOM");
    // the camera glides, and arrives; instantly under reduced motion
    let cam = fitCam(W, vw, vh, "building"), tgt = fitCam(W, vw, vh, "room", f), n = 0;
    while ((cam.z !== tgt.z || cam.cx !== tgt.cx || cam.cy !== tgt.cy) && n++ < 600) cam = stepCam(cam, tgt, 1 / 60, false);
    ok(n > 10 && n < 600 && cam.z === tgt.z, `the camera glides in ${n} frames and lands exactly`);
    ok(stepCam(fitCam(W, vw, vh, "building"), tgt, 1 / 60, true).z === tgt.z, "reduced motion: the camera cuts");
    // furniture taps: every piece in a dressed room has a box a tap on its middle finds
    const L = dressUnit(un, { band: plan.band, penthouse: false, tags: [] }), rm = un.rooms[j], boxes = itemBoxes(L.rooms[rm.id].furniture, true, 0, 0, 300, 400, true);
    ok(boxes.length === L.rooms[rm.id].furniture.length && boxes.every(b => b.x1 > b.x0 && b.y1 > b.y0 && b.y1 <= 400), "every piece in the room has a box on the floor");
    ok(boxes.every(b => { const hit = topBox(boxes, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); return hit != null; }), "a tap on a piece's middle finds a piece");
    ok(topBox(boxes, -50, -50) === null, "a tap on bare wall finds none");
    // what a tap does
    const A = (item, placed, mine) => itemAction({ item, name: item, placed }, mine).kind;
    ok(A("arcade", true, true) === "play" && A("arcade", true, false) === "none" && A("arcade", false, true) === "none", "the JETSAM cabinet plays in your own flat only");
    ok(A("ebtv", false, false) === "ebtv" && A("tv", false, true) === "ebtv", "an EBTV set opens the channel for anyone");
    ok(A("wardrobe", false, true) === "closet" && A("wardrobe", false, false) === "none", "the wardrobe opens the closet in your own flat");
    ok(itemAction({ item: "beige-pc", name: "x", placed: true }, true).play.go.startsWith("#mail"), "the PC opens Department Mail");
  }
}

void floorOf;

console.log(fails ? `check-cutaway: ${fails} FAILED` : `check-cutaway: OK (${towers.length} towers, ${ids.size} ids, ${placed} placements)`);
process.exit(fails ? 1 : 0);
