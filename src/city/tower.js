// SimTower cutaways (docs/CITY_SPEC.md "Tower cutaways"): every residential, office and
// mixed-use tower as a stack of STOREYS, each split into UNITS (flats, offices, shops, the
// lobby), each unit into ROOMS. Pure, no DOM: the plan is a function of the building catalog,
// and who is in which room is a function of (person, machine time, seed) read off whereAt.
// Nothing here changes the sim: whereAt still decides the building and the sim floor; this
// file only chooses, deterministically, which storey, flat and room of that floor they are in.
//
// Storeys: the sim's floors are rooms of the census (a tower's floor may be several storeys of
// glass). The cutaway is as tall as the tower is drawn in the city (archGeo massing `rise`,
// mirrored in STOREYS below and held to it by scripts/check-cutaway.mjs): the ground floor is
// storey 0, a PH or RF floor the top storey, the floors between share the storeys between.
// Basements stay one storey each.
//
// IDs (the ownership slice keys on them): storey `<building>:L<level>` (level 0 = street,
// negative below it), unit `<storey>:<letter>` (A from the lift), room `<unit>:<purpose>`.
// Every unit has an `owner` slot (THE DEPARTMENT until slice 2) and every room a `purpose` and
// `furniture[]` ({item, x: 0..1 across the room}), so dressing a room later is data only.

import { PLACES, BUILDINGS, SEED, HOUSING_TIERS, homeOf, floorOf, keyOf, isOwl, toHours } from "./sim.js";
import { SAMS, IRENES, BREWHOUSE, TAPROOM } from "./shorePlaza.js";   // THE SHORE PLAZA's storefront and brewery
import { proprietorOf } from "./proprietors.js";   // a business with a subject on record as its proprietor

export const DEPT = Object.freeze({ kind: "dept", id: "dept", name: "THE DEPARTMENT" });

// How many storeys each tower style stands in the city: Math.round(archGeo massingOf(b).rise).
// check-cutaway.mjs fails if a massing changes and this does not.
export const STOREYS = {
  projects: 8, brownstone: 5, lofts: 6, glass: 14, seawall: 7, seaview: 5, condo: 8, bunkhouse: 5,
  alpine: 6, tenement: 5, terrace: 4, walkup: 5, shopflats: 5, office: 14, hotel: 7,
};
// a building whose massing stands lower than its style's usual (the chandlery: one shop and a flat over it)
export const STOREYS_BY_ID = { chandlery: 2 };
export const TOWER_STYLES = new Set(Object.keys(STOREYS));
// Who lives in a style decides the flats: the top tier gets two big flats a floor (five rooms),
// the middle three (four rooms), the bottom four (three rooms). A PH floor is one flat.
const LUX = new Set(["glass", "condo"]);
const bandOf = (style) => (LUX.has(style) ? 0 : (HOUSING_TIERS[style] || [1])[0] >= 3 ? 2 : 1);
const FLATS_PER = [2, 3, 4];
const FLAT_ROOMS = [["bedroom", "bath", "kitchen", "living", "study"], ["bedroom", "bath", "kitchen", "living"], ["bedroom", "kitchen", "living"]];

const simAbove = (b) => b.floors.filter(f => f.level >= 0).length;
export const storeysAbove = (b) => Math.max(simAbove(b), STOREYS_BY_ID[b.id] ?? STOREYS[b.arch] ?? 0);
// A tower: a tower style, not HQ (the Holding Pen runs its own simulation), three storeys or more.
export const isTower = (b) => Boolean(b && b.id !== "hq" && TOWER_STYLES.has(b.arch) && storeysAbove(b) >= 3);
export const TOWERS = () => BUILDINGS.filter(isTower);

// ---- hashing (FNV-1a, as poses.phaseOf) --------------------------------------------------------
export function h01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const pick = (list, str) => list[Math.min(list.length - 1, Math.floor(h01(str) * list.length))];
const LETTERS = "ABCDEFGH";

// ---- furniture: the default dressing per purpose ----------------------------------------------
// x: the piece's centre across the room (0..1). seat: where people in the room stand or sit.
export const FURNISH = {
  bedroom: [{ item: "bed", x: 0.38 }, { item: "wardrobe", x: 0.86 }, { item: "lamp", x: 0.1 }],
  kitchen: [{ item: "fridge", x: 0.1 }, { item: "stove", x: 0.3 }, { item: "counter", x: 0.5 }, { item: "table", x: 0.8 }],
  living: [{ item: "tv", x: 0.12 }, { item: "rug", x: 0.5 }, { item: "sofa", x: 0.55 }, { item: "plant", x: 0.9 }],
  bath: [{ item: "tub", x: 0.4 }, { item: "sink", x: 0.85 }],
  study: [{ item: "shelf", x: 0.15 }, { item: "desk", x: 0.6 }, { item: "lamp", x: 0.85 }],
  lobby: [{ item: "mailboxes", x: 0.2 }, { item: "reception", x: 0.62 }, { item: "plant", x: 0.92 }],
  office: [{ item: "desk", x: 0.18 }, { item: "desk", x: 0.5 }, { item: "desk", x: 0.82 }, { item: "cooler", x: 0.97 }],
  shop: [{ item: "rack", x: 0.2 }, { item: "rack", x: 0.45 }, { item: "till", x: 0.8 }],
  lounge: [{ item: "bar", x: 0.3 }, { item: "stool", x: 0.18 }, { item: "stool", x: 0.4 }, { item: "table", x: 0.78 }],
  vault: [{ item: "safe", x: 0.25 }, { item: "safe", x: 0.5 }, { item: "safe", x: 0.75 }],
  // THE SHORE PLAZA: Sam's at the street (the ovens, the counter under the sign, the booths by the
  // window on the boards), Irene's brewhouse (mash tun, kettle, fermenters; the bright tanks, the malt,
  // the kegs) and its taproom (the bar and its taps under the pub's own sign; the brick oven from its
  // logo, the tables, the stage corner)
  pizzeria: [{ item: "pizza-oven", x: 0.17 }, { item: "sams-sign", x: 0.6 }, { item: "pizza-counter", x: 0.6 }],
  booths: [{ item: "diner-booth", x: 0.26 }, { item: "diner-booth", x: 0.74 }],
  brewhouse: [{ item: "mash-tun", x: 0.14 }, { item: "brew-kettle", x: 0.38 }, { item: "fermenter", x: 0.64 }, { item: "fermenter", x: 0.86 }],
  cellar: [{ item: "bright-tank", x: 0.16 }, { item: "bright-tank", x: 0.36 }, { item: "grain-sacks", x: 0.62 }, { item: "keg-stack", x: 0.86 }],
  taproom: [{ item: "irenes-sign", x: 0.5 }, { item: "tap-bar", x: 0.5 }, { item: "stool", x: 0.18 }, { item: "stool", x: 0.82 }],
  snug: [{ item: "brick-oven", x: 0.16 }, { item: "pub-table", x: 0.5 }, { item: "stage-corner", x: 0.84 }],
};
export const PURPOSE_NAME = { bedroom: "BEDROOM", kitchen: "KITCHEN", living: "LIVING ROOM", bath: "BATHROOM", study: "STUDY", lobby: "LOBBY", office: "OFFICE", shop: "SHOP FLOOR", lounge: "LOUNGE", vault: "VAULT",
  pizzeria: "THE COUNTER AND THE OVENS", booths: "THE BOOTHS (THE WINDOW ON THE BOARDS)", brewhouse: "THE BREWHOUSE", cellar: "THE CELLAR (BRIGHT TANKS, MALT, KEGS)", taproom: "THE BAR", snug: "THE ROOM AND THE STAGE" };
// THE SHORE PLAZA's rooms by place and floor: [unit kind, rooms]
const PLAZA_UNITS = { [SAMS]: { G: ["venue", ["pizzeria", "booths", "booths"]] }, [IRENES]: { [BREWHOUSE]: ["venue", ["brewhouse", "cellar"]], [TAPROOM]: ["venue", ["taproom", "snug"]] } };
const room = (unitId, purpose, n = 0) => ({ id: `${unitId}:${purpose}${n ? n + 1 : ""}`, purpose, furniture: FURNISH[purpose].map(f => ({ ...f })) });

// What a non-home place's unit is used for.
function purposeOf(placeId, ground) {
  const p = PLACES[placeId];
  if (/vault/.test(placeId)) return "vault";
  if (p.kind === "work") return "office";
  if (ground && /street|row|shop|chandlery/.test(placeId)) return "shop";
  return "lounge";
}

// ---- the plan ----------------------------------------------------------------------------------
const PLAN = new Map();
export function towerPlan(b) {
  if (!isTower(b)) return null;
  if (PLAN.has(b.id)) return PLAN.get(b.id);
  const style = b.arch, band = bandOf(style);
  const above = b.floors.filter(f => f.level >= 0).sort((x, y) => x.level - y.level);
  const below = b.floors.filter(f => f.level < 0).sort((x, y) => y.level - x.level);
  const N = storeysAbove(b), k = above.length;
  // storey -> sim floor
  const map = new Array(N);
  if (k === N) above.forEach((f, i) => { map[i] = f; });
  else {
    let lo = 1, hi = N;
    const mids = above.slice(1);
    map[0] = above[0];
    const top = above[k - 1];
    if (k > 1 && /^(PH|RF)$/.test(top.code)) { map[N - 1] = top; hi = N - 1; mids.pop(); }
    for (let s = lo; s < hi; s++) map[s] = mids.length ? mids[Math.min(mids.length - 1, Math.floor((s - lo) * mids.length / (hi - lo)))] : above[0];
  }
  const storeys = [];
  const mk = (f, level, top) => {
    const id = `${b.id}:L${level}`;
    const code = level < 0 ? `B${-level}` : level === 0 ? "G" : top && /^(PH|RF)$/.test(f.code) ? f.code : `${level}F`;
    // a sim floor spread over several storeys numbers them as storeys ("RESIDENCE LEVEL 2" over 3F-4F reads 3F, 4F)
    const spread = level > 0 && !(top && /^(PH|RF)$/.test(f.code)) && k !== N;
    const name = spread && /\d+$/.test(f.name) ? f.name.replace(/\d+$/, String(level)) : f.name;
    return { id, level, code, simFloor: f.index, simCode: f.code, name, places: f.places.slice(), owner: DEPT, units: [] };
  };
  below.slice().reverse().forEach(f => storeys.push(mk(f, f.level, false)));   // deepest first
  map.forEach((f, s) => storeys.push(mk(f, s, s === N - 1)));
  storeys.sort((x, y) => x.level - y.level);
  // units
  for (const st of storeys) {
    const homes = st.places.filter(p => PLACES[p].kind === "home"), other = st.places.filter(p => PLACES[p].kind !== "home");
    let n = 0;
    const unit = (kind, placeId, rooms, label) => {
      const id = `${st.id}:${LETTERS[n++]}`;
      const u = { id, kind, placeId, label, owner: DEPT, rooms: [] };
      u.rooms = rooms.map((p, i) => room(id, p, rooms.slice(0, i).filter(q => q === p).length));
      st.units.push(u);
      return u;
    };
    if (st.level === 0) unit("lobby", null, ["lobby"], "LOBBY");
    for (const pid of other) {
      const pu = PLAZA_UNITS[pid]?.[st.simCode];
      if (pu) { unit(pu[0], pid, pu[1], PLACES[pid].name); continue; }
      // a hotel's upper floors are its rooms: three suites a floor, a bed and a bath each
      if (style === "hotel" && st.level > 0) { for (let j = 0; j < 3; j++) unit("suite", pid, ["bedroom", "bath"], `ROOM ${st.level}${String(j + 1).padStart(2, "0")}`); continue; }
      const purpose = purposeOf(pid, st.level === 0);
      const wide = st.level === 0 && homes.length === 0 ? 2 : 1;
      for (let j = 0; j < (purpose === "shop" ? 2 : 1); j++) unit(purpose === "shop" ? "shop" : purpose === "vault" ? "vault" : purpose === "lounge" ? "venue" : "office", pid, new Array(wide + (purpose === "office" ? 1 : 0)).fill(purpose), PLACES[pid].name);
    }
    if (homes.length) {
      const top = st.level === N - 1 && /^(PH)$/.test(st.code);
      const count = top ? 1 : Math.max(1, FLATS_PER[band] - (st.level === 0 ? 1 : 0) - (other.length ? 1 : 0));
      const rooms = top ? FLAT_ROOMS[0] : FLAT_ROOMS[band];
      for (let j = 0; j < count; j++) {
        const pid = homes[j % homes.length];
        const letter = LETTERS[n];
        unit("flat", pid, rooms, `${st.code === "G" ? "G" : st.code === "PH" ? "PH" : st.level}${letter}`);
      }
    }
  }
  // a business with a proprietor on record holds its own units (and a storey that is all its own)
  for (const st of storeys) {
    for (const u of st.units) { const o = u.placeId && proprietorOf(u.placeId); if (o) u.owner = o; }
    const own = st.units.length && st.units.every(u => u.owner !== DEPT) ? st.units[0].owner : null;
    if (own && st.units.every(u => u.owner === own)) st.owner = own;
  }
  const bySim = {};
  for (const st of storeys) (bySim[st.simFloor] = bySim[st.simFloor] || []).push(st);
  const plan = { id: b.id, name: b.name, style, band, storeys, bySim, homePlaces: new Set(b.places.filter(p => PLACES[p].kind === "home")), shafts: N >= 10 ? 2 : 1 };
  PLAN.set(b.id, plan);
  return plan;
}

// ---- who lives where ---------------------------------------------------------------------------
// A resident's flat: the sim floor floorOf gives them, a storey of it and a flat on it, hashed
// from their key. The same for the nameplate and for where they sleep.
export function flatOf(plan, placeId, simFloor, key) {
  const sts = plan.bySim[simFloor];
  if (!sts) return null;
  const withFlats = sts.filter(st => st.units.some(u => u.kind === "flat" && u.placeId === placeId));
  if (!withFlats.length) return null;
  const st = pick(withFlats, `${key}|storey|${plan.id}`);
  return pick(st.units.filter(u => u.kind === "flat" && u.placeId === placeId), `${key}|flat|${plan.id}`);
}
export function residentFlat(plan, s, seed = SEED) {
  const home = homeOf(s, seed);
  if (!plan.homePlaces.has(home)) return null;
  const key = keyOf(s);
  return flatOf(plan, home, floorOf(home, key, seed), key);
}

// ---- which room, now --------------------------------------------------------------------------
const DARK = (h) => h < 6.75 || h >= 18.5;
export const isDark = DARK;
// -> {purpose, act}: act is sleep | wash | cook | eat | watch | read
export function homeRoom(unit, key, mt, owl = false) {
  const T = toHours(mt), day = Math.floor(T / 24), h = T - day * 24;
  const has = (p) => unit.rooms.some(r => r.purpose === p);
  const wake = 6.3 + h01(`${key}|wake|${day}`) * 0.9;
  const bed = 22.4 + h01(`${key}|bed|${day}`) * 1.3;
  const asleep = owl ? h >= 0.9 && h < wake + 1.2 : h < wake || h >= bed;
  if (asleep) return { purpose: "bedroom", act: "sleep" };
  if (has("bath") && h >= (owl ? wake + 1.2 : wake) && h < (owl ? wake + 1.6 : wake + 0.4)) return { purpose: "bath", act: "wash" };
  const meal = (h >= 7 && h < 8.5) || (h >= 12 && h < 13) || (h >= 18 && h < 19.5);
  if (meal) return { purpose: "kitchen", act: h01(`${key}|cook|${day}|${Math.floor(h)}`) < 0.4 ? "cook" : "eat" };
  const r = h01(`${key}|room|${day}|${Math.floor(h * 2)}`);
  if (has("study") && r < 0.3) return { purpose: "study", act: "read" };
  if (has("bath") && r > 0.94) return { purpose: "bath", act: "wash" };
  return { purpose: "living", act: r < 0.6 ? "watch" : "read" };
}

// ---- everyone in the building, now -------------------------------------------------------------
// entries: [{s, w, r}] where r is simApi.roomIn(w, s) (null if not in a building). Crowd
// stand-ins are skipped, as RoomStage does. -> {rooms: Map(roomId -> [{s, key, act}]),
// at: Map(key -> roomId), residents: Map(unitId -> [s]), units: Map(unitId -> n present)}.
export function placeAll(plan, entries, mt, seed = SEED) {
  const rooms = new Map(), at = new Map(), residents = new Map(), units = new Map();
  const unitById = new Map(), lobby = plan.storeys.find(s => s.level === 0)?.units.find(u => u.kind === "lobby");
  for (const st of plan.storeys) for (const u of st.units) unitById.set(u.id, u);
  const put = (u, roomObj, s, key, act) => {
    if (at.has(key)) return;   // one room per person, whatever the census holds twice
    at.set(key, roomObj.id);
    (rooms.get(roomObj.id) || rooms.set(roomObj.id, []).get(roomObj.id)).push({ s, key, act });
    units.set(u.id, (units.get(u.id) || 0) + 1);
  };
  for (const { s, w, r } of entries) {
    if (!s || s.crowd) continue;
    const key = keyOf(s);
    // the nameplates: everyone whose assigned home is a flat here
    if (plan.homePlaces.has(homeOf(s, seed))) {
      const f = residentFlat(plan, s, seed);
      if (f) (residents.get(f.id) || residents.set(f.id, []).get(f.id)).push(s);
    }
    if (!r || r.buildingId !== plan.id) continue;
    if (r.mode !== "here") { if (lobby) put(lobby, lobby.rooms[0], s, key, "walk"); continue; }
    const pl = PLACES[r.placeId];
    if (pl?.kind === "home") {
      const f = flatOf(plan, r.placeId, r.floor, key);
      if (!f) continue;
      const hr = homeRoom(f, key, mt, isOwl(s, seed));
      put(f, f.rooms.find(x => x.purpose === hr.purpose) || f.rooms[0], s, key, hr.act);
      continue;
    }
    const sts = (plan.bySim[r.floor] || []).filter(st => st.units.some(u => u.placeId === r.placeId));
    if (!sts.length) continue;
    const st = pick(sts, `${key}|storey|${plan.id}|${r.placeId}`);
    const us = st.units.filter(u => u.placeId === r.placeId);
    const u = pick(us, `${key}|unit|${plan.id}`);
    if (u.kind === "suite" && w?.activity !== "work") { const hr = homeRoom(u, key, mt, false); put(u, u.rooms.find(x => x.purpose === hr.purpose) || u.rooms[0], s, key, hr.act); continue; }
    put(u, pick(u.rooms, `${key}|room|${u.id}`), s, key, w?.activity === "work" ? "work" : "visit");
  }
  return { rooms, at, residents, units };
}

// The nameplate on a unit: the residents' surnames (flats), the business (everything else).
export const surname = (s) => String(s?.name || "").replace(/\(.*?\)/g, "").trim().split(/\s+/).pop().replace(/[^\p{L}\p{N}'-]/gu, "").toUpperCase() || "UNNAMED";
export function nameplate(unit, residents) {
  if (unit.kind === "lobby") return "LOBBY";
  if (unit.kind !== "flat") return PLACES[unit.placeId]?.name.replace(/\s*\(.*\)$/, "") || "VACANT";
  const list = residents.get(unit.id) || [];
  if (!list.length) return "VACANT";
  const names = [...new Set(list.map(surname))];
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}
