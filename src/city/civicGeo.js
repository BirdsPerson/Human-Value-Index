// THE ASSEMBLY and LOT 0x6F07 as the iso view builds them (docs/ASSEMBLY.md). Pure, like
// parkGeo.js: every prop and anchor in map cells from the sim's lots, so the checks can hold
// everything on its own ground and nobody on anybody else.
//
// The lot has four faces, one per phase of the Assembly's decision (sim.lotPhase): vacant
// (and approved: the same scrub, a different sign), the site (hoarding, a crane, a crew),
// and what won: the golf course or the farm. Anchors are per face, in fill order.

import { PLACES } from "./sim.js";

export const CIVIC_LOTS = { "the-assembly": "forum", "lot-6f07": "dev-lot", "community-farm": "community-farm" };
export const CIVIC_PLACES = ["forum", "dev-lot", "community-farm"];
const rect = (id) => PLACES[id].rect;
const A = (id, x, y, kind, act, extra = {}) => ({ id, x, y, h: 0, kind, act, role: "any", look: null, ring: null, ...extra });

// ---- THE ASSEMBLY: a paved forum, a dais with the lectern, benches facing it ----------------
const F = rect("forum");
export const FORUM = (() => {
  const x0 = F.x, y0 = F.y, x1 = F.x + F.w, y1 = F.y + F.h, cx = (x0 + x1) / 2;
  const dais = { x0: x0 + 1.2, y0: y0 + 0.7, x1: x1 - 1.2, y1: y0 + 2.1, h: 0.22 };
  const lectern = [cx, y0 + 1.55];
  const benches = [];
  for (let r = 0; r < 3; r++) for (let side = 0; side < 2; side++) {
    const y = y0 + 3.2 + r * 1.1, bx0 = side ? cx + 0.45 : x0 + 0.7, bx1 = side ? x1 - 0.7 : cx - 0.45;
    benches.push({ x0: bx0, x1: bx1, y, seats: 3 });
  }
  return {
    lot: F, c: [cx, (y0 + y1) / 2], dais, lectern,
    // where the advocates are projected, either side of the lectern, facing the benches
    podium: { golf: [cx - 1.25, y0 + 1.45], farm: [cx + 1.25, y0 + 1.45] },
    chair: [cx, y0 + 0.4],                 // the Overlord's obelisk, behind the lectern: THE CHAIR
    banner: [[x0 + 0.5, y0 + 0.25], [x1 - 0.5, y0 + 0.25]],
    board: { a: [x1 - 0.35, y0 + 2.6], b: [x1 - 0.35, y0 + 4.4] },   // the debate board, on the east edge
    benches, lamps: [[x0 + 0.35, y1 - 0.35], [x1 - 0.35, y1 - 0.35]],
  };
})();
function forumAnchors() {
  const out = [], [lx, ly] = FORUM.lectern;
  for (const b of FORUM.benches) for (let k = 0; k < b.seats; k++) {
    const x = b.x0 + (k + 0.5) * ((b.x1 - b.x0) / b.seats);
    out.push(A(`bench${b.y.toFixed(1)}${b.x0.toFixed(1)}${k}`, x, b.y + 0.12, "seat", k === 1 ? "cheer" : "view", { look: [lx, ly], seat: b }));
  }
  const y = FORUM.lot.y + FORUM.lot.h - 0.45;
  for (let k = 0; k < 4; k++) out.push(A(`back${k}`, FORUM.lot.x + 0.9 + k * ((FORUM.lot.w - 1.8) / 3), y, "stand", k % 2 ? "view" : "cheer", { look: [lx, ly] }));
  return out;
}

// ---- LOT 0x6F07 (and THE COMMUNITY FARM: the same faces at full size) -------------------------
// Each face's geometry from its lot (L: a rect in map cells), so the Farmland's parcel is laid out
// by the same rules as the Commons' lot.
const signOf = (L) => ({ a: [L.x + 0.6, L.y + L.h - 0.5], b: [L.x + 3.6, L.y + L.h - 0.5], h0: 0.45, h1: 1.5 });
const vacantOf = (L) => ({
  lot: L,
  rubble: Array.from({ length: Math.round(14 * L.w * L.h / 101.5) }, (_, i) => [L.x + 0.6 + ((i * 7.31) % 1) * (L.w - 1.2), L.y + 0.5 + ((i * 3.77) % 1) * (L.h - 1.4)]),
  tufts: Array.from({ length: Math.round(22 * L.w * L.h / 101.5) }, (_, i) => [L.x + 0.4 + ((i * 0.618 + 0.13) % 1) * (L.w - 0.8), L.y + 0.4 + ((i * 0.382 + 0.41) % 1) * (L.h - 0.8)]),
});
const siteOf = (L) => {
  const lx0 = L.x, ly0 = L.y, lx1 = L.x + L.w, ly1 = L.y + L.h;
  return {
    lot: L,
    pit: { x0: lx0 + 3.2, y0: ly0 + 1.4, x1: lx1 - 3.6, y1: ly1 - 1.6 },
    crane: { x: lx1 - 1.4, y: ly0 + 1.2, mast: 4.2, jib: 6.5, counter: 1.8 },
    cabin: { x0: lx0 + 0.5, y0: ly0 + 0.5, x1: lx0 + 2.3, y1: ly0 + 1.4, h: 0.75 },
    piles: [[lx0 + 1.2, ly0 + 2.6, "pipes"], [lx0 + 1.4, ly0 + 4.1, "pallets"], [lx1 - 2.2, ly1 - 1.0, "pallets"]],
    digger: { x: lx1 - 3.0, y: ly1 - 2.6 },
    gate: [lx0 + 4.2, ly1 - 0.12],
  };
};
// The farm: beds of crop rows (four on the Commons' lot, as many as fit on a full-size parcel), the
// barn and silo, the stand by the gate, a scarecrow, the tractor, fruit trees; bigger buildings on a
// bigger lot.
const CROPS = ["lettuce", "wheat", "tomato", "corn"];
const farmOf = (L) => {
  const lx0 = L.x, ly0 = L.y, lx1 = L.x + L.w, ly1 = L.y + L.h, k = L.w > 20 ? 1.8 : 1;
  const bx0 = lx0 + 3.0 * k, bx1 = lx1 - 3.2 * k, n = Math.max(4, Math.floor((L.h - 1.4) / 1.5));
  const beds = Array.from({ length: n }, (_, i) => ({ crop: CROPS[i % 4], x0: bx0, x1: bx1, y0: ly0 + 0.6 + i * 1.5, y1: ly0 + 0.6 + i * 1.5 + 1.15 }));
  return {
    lot: L, beds, k,
    barn: { x0: lx1 - 2.8 * k, y0: ly0 + 0.5, x1: lx1 - 0.5, y1: ly0 + 0.5 + 1.8 * k, h: 1.0 * k, ridge: 0.55 * k },
    silo: { x: lx1 - 1.3 * k, y: ly0 + 0.5 + 1.8 * k + 1.1 * k, r: 0.5 * k, h: 2.3 * k },
    stand: { x0: lx0 + 0.6, y0: ly1 - 1.7, x1: lx0 + 2.4, y1: ly1 - 1.0 },
    scarecrow: [(bx0 + bx1) / 2, ly0 + 2.65],
    tractor: [lx1 - 2.2 * k, ly1 - 1.0],
    trees: k > 1 ? Array.from({ length: Math.floor((L.h - 4) / 1.1) }, (_, i) => [lx0 + 0.6 + (i % 2) * 1.2, ly0 + 0.7 + i * 1.1]) : [[lx0 + 0.6, ly0 + 0.7], [lx0 + 1.6, ly0 + 0.7], [lx0 + 0.6, ly0 + 1.8]],
  };
};
// THE COMMUNITY GARDEN (LOT 0x6F07 once THE COMMUNITY FARM has its full-size site in the Farmland):
// raised beds between paths, the tool shed, the water butt, the compost bays, a bench.
const gardenOf = (L) => {
  const lx0 = L.x, ly0 = L.y, lx1 = L.x + L.w, ly1 = L.y + L.h, beds = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) beds.push({ crop: CROPS[(r * 4 + c) % 4], x0: lx0 + 3.0 + c * 2.3, x1: lx0 + 3.0 + c * 2.3 + 1.7, y0: ly0 + 1.0 + r * 2.6, y1: ly0 + 1.0 + r * 2.6 + 1.6 });
  return {
    lot: L, beds,
    shed: { x0: lx1 - 2.2, y0: ly0 + 0.6, x1: lx1 - 0.6, y1: ly0 + 1.8, h: 0.8 },
    butt: [lx1 - 1.0, ly0 + 2.5, 0.28], compost: { x0: lx1 - 2.2, y0: ly1 - 1.6, x1: lx1 - 0.6, y1: ly1 - 0.8 },
    bench: [lx0 + 1.4, ly1 - 1.0], trees: [[lx0 + 0.7, ly0 + 0.8], [lx0 + 0.7, ly0 + 2.4]],
  };
};
const L = rect("dev-lot");
const lx0 = L.x, ly0 = L.y, lx1 = L.x + L.w, ly1 = L.y + L.h;
// The sign stands at the front (south-west) corner, where the street sees it.
export const SIGN = signOf(L);
export const VACANT = vacantOf(L);
export const SITE = siteOf(L);
// The golf course: eighteen holes, six by three, each a tee and a green with its flag.
export const GOLF = (() => {
  const holes = [];
  const cols = 6, rows = 3, gx0 = lx0 + 2.6, gw = (lx1 - 0.6) - gx0, gy0 = ly0 + 0.7, gh = L.h - 1.4;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const n = r * cols + (r % 2 ? cols - 1 - c : c) + 1;                   // a serpentine routing, 1 to 18
    const x = gx0 + (c + 0.5) * (gw / cols), y = gy0 + (r + 0.5) * (gh / rows);
    holes.push({ n, green: [x + 0.35, y - 0.25], tee: [x - 0.55, y + 0.35] });
  }
  holes.sort((a, b) => a.n - b.n);
  return {
    lot: L, holes,
    bunkers: [[lx0 + 4.4, ly0 + 1.7, 0.45], [lx0 + 8.9, ly0 + 3.9, 0.5], [lx1 - 2.3, ly0 + 1.5, 0.4], [lx0 + 6.5, ly1 - 1.1, 0.45]],
    pond: [lx0 + 11.2, ly0 + 3.6, 0.8],
    clubhouse: { x0: lx0 + 0.4, y0: ly0 + 0.5, x1: lx0 + 2.2, y1: ly0 + 2.1, h: 0.9 },
    carts: [[lx0 + 1.3, ly0 + 2.9], [lx0 + 1.3, ly0 + 3.6]],
  };
})();
export const FARM = farmOf(L);
export const GARDEN = gardenOf(L);
const SITE0 = SITE, FARM0 = FARM;
// THE COMMUNITY FARM's parcel in the Farmland: the same faces, full size
const BL = rect("community-farm");
export const BIG = { SIGN: signOf(BL), VACANT: vacantOf(BL), SITE: siteOf(BL), FARM: farmOf(BL) };

function siteAnchors(SITE = SITE0) {
  const P = SITE.pit, out = [], L = SITE.lot, lx0 = L.x, ly0 = L.y, ly1 = L.y + L.h;
  // the foreman first, then the diggers in the pit, the carriers, the hammer gang, the crane
  out.push(A("foreman", P.x0 - 0.5, P.y1 + 0.4, "stand", "inspect", { look: [P.x0 + 2, P.y0 + 1] }));
  for (let k = 0; k < 5; k++) out.push(A(`dig${k}`, P.x0 + 0.6 + k * ((P.x1 - P.x0 - 1.2) / 4), P.y0 + 0.6 + (k % 2) * 1.4, "stand", "dig"));
  out.push(A("craneop", SITE.crane.x - 0.6, SITE.crane.y + 0.5, "stand", "crane"));
  for (let k = 0; k < 4; k++) out.push(A(`haul${k}`, lx0 + 2.8 + k * 0.9, ly1 - 0.9 - (k % 2) * 0.5, "stand", "haul"));
  for (let k = 0; k < 5; k++) out.push(A(`ham${k}`, P.x0 + 0.5 + k * ((P.x1 - P.x0 - 1) / 4), P.y1 - 0.45, "stand", "hammer"));
  out.push(A("gate", SITE.gate[0] + 0.6, SITE.gate[1] - 0.45, "stand", "guard"));
  for (let k = 0; k < 4; k++) out.push(A(`dig${k + 5}`, P.x0 + 1.1 + k * ((P.x1 - P.x0 - 2.2) / 3), P.y0 + 1.3 + ((k + 1) % 2) * 1.2, "stand", "dig"));
  for (let k = 0; k < 4; k++) out.push(A(`hauls${k}`, lx0 + 0.8 + (k % 2) * 0.9, ly0 + 1.9 + Math.floor(k / 2) * 0.9, "stand", "haul"));
  // a full-size site (THE COMMUNITY FARM's parcel): a bigger crew across the pit
  if (L.w > 20) for (let k = 0; k < 14; k++) out.push(A(`crew${k}`, P.x0 + 1.5 + (k % 7) * ((P.x1 - P.x0 - 3) / 6), P.y0 + 3 + Math.floor(k / 7) * ((P.y1 - P.y0 - 6) / 1), "stand", k % 3 ? "dig" : "hammer"));
  return out;
}
function golfAnchors() {
  const out = [], H = GOLF.holes;
  // a golfer on a tee with their caddie, down the card; then putters on the greens
  const order = [1, 7, 13, 4, 10, 16, 2, 8, 14, 5, 11, 17];
  order.forEach((n, i) => {
    const h = H[n - 1];
    out.push(A(`tee${n}`, h.tee[0], h.tee[1], "stand", "golf", { look: h.green }));
    if (i < 8) out.push(A(`cad${n}`, h.tee[0] - 0.42, h.tee[1] + 0.12, "stand", "caddie", { look: h.green }));
  });
  [3, 9, 15, 6, 12, 18].forEach(n => { const h = H[n - 1]; out.push(A(`putt${n}`, h.green[0] - 0.3, h.green[1] + 0.12, "stand", "putt", { look: h.green })); });
  out.push(A("keeper", GOLF.bunkers[1][0] + 0.7, GOLF.bunkers[1][1] + 0.2, "stand", "rake"));
  out.push(A("club0", GOLF.clubhouse.x1 + 0.35, GOLF.clubhouse.y1 - 0.3, "stand", "drink", { look: [GOLF.clubhouse.x0, GOLF.clubhouse.y1] }));
  out.push(A("club1", GOLF.clubhouse.x1 + 0.35, GOLF.clubhouse.y1 + 0.35, "stand", "talk", { look: [GOLF.clubhouse.x0, GOLF.clubhouse.y1] }));
  return out;
}
function farmAnchors(FARM = FARM0) {
  const out = [];
  FARM.beds.forEach((b, i) => {
    const n = 5, act = b.crop === "wheat" ? "dig" : "pick";
    for (let k = 0; k < n; k++) out.push(A(i < 4 ? `${b.crop}${k}` : `${b.crop}${i}-${k}`, b.x0 + 0.5 + k * ((b.x1 - b.x0 - 1) / (n - 1)) + (i % 2) * 0.3, (b.y0 + b.y1) / 2, "stand", act));
  });
  const S = FARM.stand;
  out.splice(3, 0, A("seller", (S.x0 + S.x1) / 2, S.y0 - 0.35, "stand", "sell", { look: [(S.x0 + S.x1) / 2, S.y1 + 1] }));
  out.push(A("barn", FARM.barn.x0 + 0.5, FARM.barn.y1 + 0.35, "stand", "haul"));
  out.push(A("buyer0", S.x0 + 0.4, S.y1 + 0.35, "stand", "shop", { look: [S.x0 + 0.4, S.y0] }));
  out.push(A("buyer1", S.x1 - 0.3, S.y1 + 0.35, "stand", "shop", { look: [S.x1 - 0.3, S.y0] }));
  out.push(A("water", FARM.silo.x - 0.9, FARM.silo.y + 0.9, "stand", "water"));
  return out;
}

function gardenAnchors() {
  const out = [];
  GARDEN.beds.forEach((b, i) => { for (let k = 0; k < 3; k++) out.push(A(`bed${i}${k}`, b.x0 + 0.3 + k * (b.x1 - b.x0 - 0.6) / 2, b.y1 + 0.3, "stand", i % 3 === 1 ? "dig" : "pick", { look: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] })); });
  out.push(A("shed", GARDEN.shed.x0 + 0.5, GARDEN.shed.y1 + 0.35, "stand", "haul"));
  out.push(A("water", GARDEN.butt[0] - 0.5, GARDEN.butt[1] + 0.3, "stand", "water"));
  out.push(A("bench", GARDEN.bench[0], GARDEN.bench[1] - 0.1, "stand", "talk"));
  return out;
}
export const CIVIC_ANCHORS = { forum: forumAnchors(), site: siteAnchors(), golf: golfAnchors(), farm: farmAnchors(), garden: gardenAnchors(), vacant: [], bigsite: siteAnchors(BIG.SITE), bigfarm: farmAnchors(BIG.FARM), bigvacant: [] };
// Which face the lot shows for a lotPhase(): "vacant" | "site" | "golf" | "farm"; LOT 0x6F07's farm is
// the community garden once THE COMMUNITY FARM has its full-size parcel (sim.FARM_PARCEL), and that
// parcel's faces are the big ones.
export const faceOf = (p, pid = "dev-lot") => {
  const f = p.phase === "site" ? "site" : p.phase === "built" ? p.winner : "vacant";
  if (pid === "community-farm") return f === "site" ? "bigsite" : f === "farm" ? "bigfarm" : "bigvacant";
  return f === "farm" && p.garden ? "garden" : f;
};
