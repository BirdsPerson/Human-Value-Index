// Room interiors for the cutaway and the building rooms, in the Fallout Shelter manner:
// a side-on room whose furniture says what the room is for, and every occupant AT a piece
// of it, doing the job in a small loop. Each room type has a PLAN: rows of furniture
// modules, each module carrying (at most) one ANCHOR where one person goes:
//
//   anchor {i, x, y (feet), s (scale), back, kind: seat|station|stand|bed|counter,
//           act (the loop: pour, type, stir, sleep...), role: staff|patron|rest|any,
//           face (1 = turned right, -1 left, 0 as drawn), walk: [x0, x1] | null}
//
// Anchors never overlap (each person keeps inside its own module), so a room holds as
// many as it has anchors and the rest are an overflow badge. Who goes where is
// assignAnchors(): workers on shift take the staff stations, visitors the seats,
// residents the bunks. Plans, roles and assignment are pure (node-testable); the drawing
// takes a 2D context. Poses (sitting, typing, sleeping...) live in poses.js.

// place id -> interior type
export const ROOM_TYPE = {
  "exec-suite": "exec", "ops-floor": "office", "assembly-hall": "assembly", "tribunal": "tribunal", "penthouses": "suite",
  "studio-row": "studio", "playhouse": "theatre", "concert-hall": "concert", "gallery": "gallery", "the-grind": "cafe",
  "lecture-hall": "lecture", "lab-block": "lab", "stacks": "library", "clock-tower": "clock",
  "exchange-floor": "exchange", "vault-bank": "vault", "rooftop-lounge": "lounge",
  "dive-bar": "bar", "casino": "casino", "press-room": "press", "all-night-diner": "diner",
  "stadium": "stadium", "gym": "gym",
  "ward": "ward", "chapel": "chapel", "park": "park", "market": "market", "schoolhouse": "school",
  "archive-stacks": "library", "memory-vault": "vault", "archive-lofts": "lofts",
  "reclamation": "line", "reactor": "reactor", "foundry": "foundry", "cache-farm": "racks", "docks": "docks",
  "hydroponics": "vats", "barracks": "barracks", "holding-cells": "cells", "canteen": "canteen",
  "block-a": "hab", "block-b": "hab", "block-c": "hab", "block-d": "hab", "the-street": "street",
  "the-drip": "cafe", "gallery-annex": "gallery", "members-club": "lounge", "the-lantern": "bar",
  "allotment": "allotment", "night-market": "market", "the-plaza": "street",
};
export const typeOf = (placeId) => ROOM_TYPE[placeId] || "office";

// Wall and floor per type: warm lighting for the lived-in, cold for the machine.
const LOOK = {
  exec: ["#2b2418", "#4a3a22"], office: ["#16241c", "#243a2c"], assembly: ["#1c2220", "#34403a"], tribunal: ["#241a14", "#3a2a1c"],
  suite: ["#2a2016", "#4a3522"], studio: ["#221c26", "#3a3040"], theatre: ["#2a1414", "#4a2020"], concert: ["#261c12", "#443018"],
  gallery: ["#2a2824", "#46423a"], cafe: ["#2a1e14", "#4a3322"], lecture: ["#1c2218", "#35402a"], lab: ["#122428", "#1f3a40"],
  library: ["#221a12", "#3a2c1c"], clock: ["#1e1a14", "#3a3022"], exchange: ["#141e24", "#22323c"], vault: ["#1a1c1e", "#2c3034"],
  lounge: ["#1e1422", "#342440"], bar: ["#221410", "#3c2218"], casino: ["#1a1410", "#3a1e1e"], press: ["#1e1e1a", "#34342c"],
  diner: ["#241a14", "#3e2c20"], stadium: ["#12200f", "#1f3a18"], gym: ["#1e1a16", "#3a3026"], ward: ["#1a2224", "#2c3a3e"],
  chapel: ["#1c1822", "#302838"], park: ["#0f1f0f", "#1f3a1c"], allotment: ["#141a0e", "#3a2a18"], market: ["#241c10", "#3e3018"], school: ["#1e2016", "#363a26"],
  lofts: ["#1c1a18", "#302c28"], line: ["#200f0f", "#381c1c"], reactor: ["#0f2014", "#1a3a24"], foundry: ["#26140c", "#442414"],
  racks: ["#0e1618", "#1a2a2e"], docks: ["#0f1a22", "#1a2e3a"], vats: ["#0f2014", "#1c3a22"], barracks: ["#1a1c16", "#2e3226"],
  cells: ["#181818", "#2a2a2a"], canteen: ["#221a12", "#3a2c1e"], hab: ["#18181a", "#2c2c30"], street: ["#101410", "#222822"],
};

// ---- plans ----------------------------------------------------------------------------
// A module is {w (in sprite widths), ax (where the person stands in it, 0..1), prop, a}.
// A row is a head (placed once, first) then its unit repeated while it fits, centred.
// solo: the row used when the room is too shallow for two rows (defaults to the front row
// with the back row's head in front of it, so a bar keeps its bartender).
const A = (kind, act, role = "any", face = 0, walk = false) => ({ kind, act, role, face, walk });
const M = (a, prop, w = 1.15, ax = 0.5) => ({ a, prop, w, ax });
const P = (prop, w) => ({ a: null, prop, w, ax: 0.5 });
const SIDE = 0.3;   // where a person stands in a module with its furniture to the right

const PLANS = {
  bar: {
    back: { max: 3, span: "counter", unit: [M(A("counter", "pour", "staff"), null, 1.2), P("taps", 1.1)] },
    front: { unit: [M(A("seat", "drink", "patron"), "stool", 1.15)] },
    solo: { head: [M(A("counter", "pour", "staff", 1), "barEnd", 2, 0.28)], unit: [M(A("seat", "drink", "patron"), "stool", 1.15)] },
  },
  lounge: {
    back: { unit: [M(A("stand", "drink", "patron"), null, 1.25), P("plant", 0.55)] },
    front: { unit: [M(A("seat", "talk", "patron", 1), "sofa", 1.1), P("sideTable", 0.5), M(A("seat", "drink", "patron", -1), "sofa", 1.1), P(null, 0.3)] },
  },
  suite: {
    back: { unit: [M(A("stand", "talk", "rest"), null, 1.25), P("plant", 0.55)] },
    front: { unit: [M(A("bed", "sleep", "rest"), "bedFancy", 1.7), M(A("seat", "read", "rest", -1), "armchair", 1.15), P("lampTable", 0.5)] },
  },
  cafe: {
    back: { head: [M(A("counter", "pour", "staff"), "espresso", 1.4)], unit: [M(A("counter", "serve", "staff"), "counter", 1.2), M(A("seat", "drink", "patron"), "barStool", 1.15), M(A("seat", "drink", "patron"), "barStool", 1.15)] },
    front: { unit: [M(A("seat", "drink", "patron", 1), "chair", 1.05), P("cafeTable", 0.55), M(A("seat", "talk", "patron", -1), "chair", 1.05), P(null, 0.3)] },
    solo: { head: [M(A("counter", "pour", "staff", 1), "espressoEnd", 2, 0.28)], unit: [M(A("seat", "drink", "patron", 1), "chair", 1.05), P("cafeTable", 0.55), M(A("seat", "talk", "patron", -1), "chair", 1.05), P(null, 0.3)] },
  },
  diner: {
    back: { head: [M(A("station", "cook", "staff"), "grill", 1.5)], unit: [M(A("seat", "eat", "patron"), "barStool", 1.15), M(A("seat", "eat", "patron"), "barStool", 1.15), M(A("station", "cook", "staff"), "grill", 1.5)] },
    front: { unit: [M(A("seat", "eat", "patron", 1), "booth", 1.05), P("dinerTable", 0.55), M(A("seat", "talk", "patron", -1), "booth", 1.05), P(null, 0.25)] },
    solo: { head: [M(A("station", "cook", "staff", 1), "grillEnd", 2, 0.28)], unit: [M(A("seat", "eat", "patron", 1), "booth", 1.05), P("dinerTable", 0.55), M(A("seat", "talk", "patron", -1), "booth", 1.05), P(null, 0.25)] },
  },
  canteen: {
    back: { head: [M(A("counter", "serve", "staff"), "servingLine", 1.6)], unit: [M(A("stand", "wait", "patron"), "trayRail", 1.1)] },
    front: { unit: [M(A("seat", "eat", "patron", 1), "bench", 1.05), P("longTable", 0.6), M(A("seat", "eat", "patron", -1), "bench", 1.05), P(null, 0.2)] },
    solo: { head: [M(A("counter", "serve", "staff", 1), "servingEnd", 2, 0.28)], unit: [M(A("seat", "eat", "patron", 1), "bench", 1.05), P("longTable", 0.6), M(A("seat", "eat", "patron", -1), "bench", 1.05), P(null, 0.2)] },
  },
  lab: {
    back: { unit: [M(A("station", "pipette", "staff", 1), "labBench", 1.8, SIDE)] },
    front: { unit: [M(A("station", "pipette", "staff", 1), "labBench", 1.8, SIDE), M(A("station", "scope", "staff", 1), "scopeDesk", 1.7, SIDE)] },
  },
  office: {
    back: { unit: [M(A("station", "type", "staff", 1), "desk", 1.75, SIDE)] },
    front: { unit: [M(A("station", "type", "staff", 1), "desk", 1.75, SIDE), M(A("stand", "file", "staff"), "cabinet", 1.3, SIDE)] },
  },
  press: {
    back: { unit: [M(A("stand", "read", "any"), "pressRack", 1.4, SIDE)] },
    front: { unit: [M(A("station", "type", "any", 1), "typewriterDesk", 1.75, SIDE)] },
  },
  exchange: {
    back: { unit: [M(A("stand", "shout", "staff"), null, 1.25)] },
    front: { unit: [M(A("station", "trade", "staff", 1), "tickerDesk", 1.75, SIDE)] },
  },
  exec: {
    back: { unit: [M(A("stand", "confer", "any"), null, 1.3), P("plant", 0.6)] },
    front: { head: [M(A("station", "type", "staff"), "execDesk", 2.4)], unit: [M(A("stand", "confer", "staff"), null, 1.3)] },
  },
  assembly: {
    back: { unit: [M(A("seat", "listen", "any"), "benchRow", 1.1)] },
    front: { head: [M(A("station", "speak", "staff"), "podium", 1.5)], unit: [M(A("seat", "listen", "any"), "chair", 1.1)] },
  },
  tribunal: {
    back: { unit: [M(A("station", "judge", "staff"), "judgeBench", 1.3)] },
    front: { unit: [M(A("seat", "listen", "any"), "pew", 1.1)] },
    solo: { head: [M(A("station", "judge", "staff"), "judgeBench", 1.5)], unit: [M(A("seat", "listen", "any"), "pew", 1.1)] },
  },
  studio: {
    back: { head: [M(A("station", "film", "any", 1), "camera", 1.7, SIDE)], unit: [M(A("station", "paint", "any", 1), "easel", 1.7, SIDE)] },
    front: { unit: [M(A("station", "paint", "any", 1), "easel", 1.7, SIDE)] },
  },
  theatre: {
    back: { span: "stage", unit: [M(A("stand", "perform", "staff"), null, 1.5)] },
    front: { unit: [M(A("seat", "watch", "patron"), "theatreSeat", 1.08)] },
    solo: { head: [M(A("stand", "perform", "staff"), "stage", 1.6)], unit: [M(A("seat", "watch", "patron"), "theatreSeat", 1.08)] },
  },
  concert: {
    back: { span: "stage", head: [M(A("station", "piano", "staff", 1), "piano", 1.9, 0.25)], unit: [M(A("stand", "perform", "staff"), null, 1.5)] },
    front: { unit: [M(A("seat", "watch", "patron"), "theatreSeat", 1.08)] },
    solo: { head: [M(A("station", "piano", "staff", 1), "piano", 1.9, 0.25)], unit: [M(A("seat", "watch", "patron"), "theatreSeat", 1.08)] },
  },
  gallery: {
    back: { unit: [M(A("stand", "view", "any"), null, 1.4), P("plinth", 0.6)] },
    front: { head: [M(A("stand", "guide", "staff"), "rope", 1.5)], unit: [M(A("stand", "view", "patron"), null, 1.45)] },
  },
  lecture: {
    back: { unit: [M(A("seat", "write", "any"), "benchRow", 1.1)] },
    front: { head: [M(A("stand", "lecture", "staff"), "lectern", 1.5)], unit: [M(A("seat", "write", "any"), "schoolDesk", 1.15)] },
  },
  school: {
    back: { unit: [M(A("seat", "write", "any"), "schoolDesk", 1.15)] },
    front: { head: [M(A("stand", "lecture", "staff"), "lectern", 1.5)], unit: [M(A("seat", "write", "any"), "schoolDesk", 1.15)] },
  },
  library: {
    back: { unit: [M(A("stand", "shelve", "staff", 0, true), "bookcase", 2.1)] },
    front: { unit: [M(A("seat", "read", "any", 1), "chair", 1.05), P("readingTable", 0.65), M(A("seat", "read", "any", -1), "chair", 1.05), P(null, 0.25)] },
  },
  clock: {
    back: { unit: [M(A("station", "wind", "staff", 1), "crank", 1.6, SIDE)] },
    front: { unit: [M(A("station", "wind", "staff", 1), "crank", 1.6, SIDE), M(A("station", "count", "staff", 1), "desk", 1.75, SIDE)] },
  },
  vault: {
    back: { unit: [M(A("stand", "guard", "any"), null, 1.3), P("bullion", 0.7)] },
    front: { unit: [M(A("station", "count", "staff", 1), "countingDesk", 1.75, SIDE)] },
  },
  casino: {
    back: { unit: [M(A("counter", "deal", "staff"), "felt", 1.5)] },
    front: { head: [M(A("stand", "sing", "staff"), "mic", 1.3)], unit: [M(A("seat", "gamble", "patron", 1), "slotMachine", 1.7, SIDE)] },
  },
  stadium: {
    back: { span: "bleacher", unit: [M(A("stand", "cheer", "patron"), null, 1.05)] },
    front: { unit: [M(A("stand", "sprint", "staff", 0, true), "pitch", 2.2), M(A("stand", "stretch", "staff"), "pitch", 1.3)] },
  },
  gym: {
    back: { unit: [M(A("station", "punch", "any", 1), "bag", 1.6, SIDE)] },
    front: { head: [M(A("stand", "coach", "staff"), null, 1.25)], unit: [M(A("station", "lift", "any"), "barbell", 1.45), M(A("station", "run", "any"), "treadmill", 1.55)] },
  },
  ward: {
    back: { unit: [M(A("station", "tend", "staff", -1), "hospitalBed", 2.1, 0.84)] },
    front: { unit: [M(A("stand", "tend", "staff", 0, true), "trolley", 2.3)] },
    solo: { unit: [M(A("station", "tend", "staff", -1), "hospitalBed", 2.1, 0.84)] },
  },
  chapel: {
    back: { unit: [M(A("seat", "pray", "any"), "pew", 1.1)] },
    front: { head: [M(A("stand", "preach", "staff"), "altar", 1.6)], unit: [M(A("seat", "pray", "any"), "pew", 1.1)] },
  },
  park: {
    back: { unit: [M(A("stand", "stroll", "any", 0, true), "tree", 2.2), M(A("stand", "rake", "staff", 1), "leafPile", 1.5, SIDE)] },
    front: { unit: [M(A("seat", "rest", "patron"), "parkBench", 1.25), M(A("stand", "rake", "staff", 1), "leafPile", 1.5, SIDE), M(A("stand", "stroll", "patron", 0, true), null, 2)] },
  },
  allotment: {
    back: { unit: [M(A("station", "dig", "any", 1), "planter", 1.7, SIDE)] },
    front: { unit: [M(A("station", "dig", "any", 1), "planter", 1.7, SIDE), M(A("stand", "water", "any", 1), "waterButt", 1.5, SIDE)] },
  },
  market: {
    back: { unit: [M(A("counter", "sell", "staff"), "stall", 1.55)] },
    front: { unit: [M(A("stand", "shop", "patron"), null, 1.2), M(A("stand", "shop", "patron", -1), "crates", 1.4, 0.7)] },
    solo: { head: [M(A("counter", "sell", "staff", 1), "stallEnd", 2, 0.28)], unit: [M(A("stand", "shop", "patron"), null, 1.2)] },
  },
  hab: {
    back: { unit: [M(A("bed", "sleep", "rest"), "bunk", 1.65), M(A("station", "cook", "rest", 1), "stove", 1.5, SIDE)] },
    front: { unit: [M(A("bed", "sleep", "rest"), "bunk", 1.65), M(A("seat", "read", "rest", -1), "chair", 1.1)] },
  },
  lofts: {
    back: { unit: [M(A("bed", "sleep", "rest"), "bunk", 1.55), M(A("bed", "sleep", "rest"), "bunk", 1.55), M(A("station", "read", "rest", 1), "desk", 1.65, SIDE)] },
    front: { unit: [M(A("bed", "sleep", "rest"), "bunk", 1.55), M(A("seat", "read", "rest", -1), "armchair", 1.08)] },
  },
  barracks: {
    back: { unit: [M(A("station", "polish", "staff", 1), "locker", 1.45, SIDE), M(A("bed", "sleep", "rest"), "bunk", 1.65)] },
    front: { unit: [M(A("station", "drill", "staff", 1), "dummy", 1.6, SIDE)] },
  },
  cells: {
    back: { unit: [M(A("stand", "patrol", "staff", 0, true), null, 2.4)] },
    front: { unit: [M(A("bed", "sit", "any"), "cot", 1.6)] },
  },
  line: {
    back: { span: "belt", unit: [M(A("station", "sort", "staff"), null, 1.2)] },
    front: { span: "belt", unit: [M(A("station", "sort", "staff"), null, 1.2)] },
  },
  reactor: {
    back: { unit: [M(A("station", "valve", "staff", 1), "valvePipe", 1.6, SIDE)] },
    front: { unit: [M(A("station", "valve", "staff", 1), "valvePipe", 1.6, SIDE), M(A("station", "bail", "staff", 1), "drum", 1.45, SIDE)] },
  },
  foundry: {
    back: { unit: [M(A("station", "rake", "staff", 1), "slagTrough", 1.7, SIDE)] },
    front: { unit: [M(A("station", "hammer", "staff", 1), "anvil", 1.6, SIDE)] },
  },
  racks: {
    back: { unit: [M(A("stand", "patch", "staff", 0, true), "serverRack", 2.2)] },
    front: { unit: [M(A("station", "type", "staff", 1), "terminal", 1.6, SIDE)] },
  },
  docks: {
    back: { unit: [M(A("station", "crane", "staff", 1), "craneLever", 1.6, SIDE)] },
    front: { unit: [M(A("station", "haul", "staff", 1), "crate", 1.55, SIDE)] },
  },
  vats: {
    back: { unit: [M(A("station", "stir", "staff", 1), "vat", 1.75, SIDE)] },
    front: { unit: [M(A("station", "stir", "staff", 1), "vat", 1.75, SIDE), M(A("station", "valve", "staff", 1), "valvePipe", 1.6, SIDE)] },
  },
  street: {
    back: { unit: [M(A("stand", "stroll", "any", 0, true), "lamppost", 2.2)] },
    front: { unit: [M(A("stand", "sweep", "staff", 0, true), null, 2.2), M(A("seat", "rest", "patron"), "streetBench", 1.25), M(A("stand", "loiter", "patron"), null, 1.2)] },
  },
};
export const PLANNED_TYPES = Object.keys(PLANS);

// Rooms deep enough for two rows get a back row, smaller and set up the wall.
export const BACK_S = 0.8;
const hasBack = (type, w, h, sw) => h > sw * 2.4;

// Modules go in as groups (the head, then one unit at a time) until the width or the
// anchor limit runs out; the groups are then spread evenly across the room (a table stays
// with its chairs), so a room sized for twelve holds twelve places, not thirty.
function layRow(def, w, y, s, sw, back, limit = Infinity) {
  const margin = Math.max(sw * 0.35, w * 0.03);
  const inner = Math.max(0, w - margin * 2);
  const unitW = (m) => m.w * sw * s;
  const groups = [];
  let used = 0, count = 0;
  const tryGroup = (mods) => {
    let gw = 0, ga = 0, complete = true;
    const take = [];
    for (const m of mods) {
      if (used + gw + unitW(m) > inner + 1e-6 || (m.a && count + ga >= limit)) { complete = false; break; }
      take.push(m); gw += unitW(m); if (m.a) ga++;
    }
    // a cut-off group loses its trailing furniture rather than showing half of it
    if (!complete) while (take.length && !take[take.length - 1].a) { gw -= unitW(take[take.length - 1]); take.pop(); }
    if (!ga) return false;
    groups.push(take); used += gw; count += ga;
    return complete;
  };
  if (def.head?.length) tryGroup(def.head);
  const unit = def.unit || [];
  let guard = 0;
  while (unit.length && count < limit && guard++ < 200 && tryGroup(unit));
  // a room so narrow nothing fits still gets one anchor
  if (!count) {
    const m = (def.head && def.head[0]) || unit.find(u => u.a);
    if (m) { groups.length = 0; groups.push([{ ...m, w: Math.min(m.w, inner / (sw * s)) }]); used = unitW(groups[0][0]); }
  }
  // spread across the room (a furnished room, its empty places showing), within reason
  const gap = groups.length > 1 ? Math.min((inner - used) / (groups.length - 1), sw * s * 2.5) : 0;
  let x = margin + (inner - used - gap * Math.max(0, groups.length - 1)) / 2;
  const items = [];
  for (const g of groups) {
    for (const m of g) {
      const W = unitW(m);
      const it = { x0: x, x1: x + W, prop: m.prop, a: null };
      if (m.a) {
        const half = sw * s / 2;
        const cx = Math.max(x + half, Math.min(x + W - half, x + W * m.ax));
        it.a = { x: cx, y, s, back, kind: m.a.kind, act: m.a.act, role: m.a.role, face: m.a.face, walk: m.a.walk ? [x + half, x + W - half] : null, prop: m.prop };
      }
      items.push(it);
      x += W;
    }
    x += gap;
  }
  // a row-long piece (the bar's counter, the conveyor, the stage) spans the whole room
  return { y, s, back, items, span: def.span ? { prop: def.span, x0: margin * 0.5, x1: w - margin * 0.5 } : null };
}

// -> {type, w, h, sw, rows: [{y, s, back, items: [{x0, x1, prop, a}]}], anchors: [...]}
// Rows back to front; anchors in the same order, each with its index i. cap (optional): the
// room's capacity; the plan then holds that many places (as many as fit), about half at
// the back (the counter, the stage, the bunks along the wall) and the rest in front.
export function roomPlan(type, w, h, sw, cap = null) {
  const def = PLANS[type] || PLANS.office;
  const rows = [];
  const solo = def.solo || { head: [...(def.back.head || []), ...(def.front.head || [])], unit: def.front.unit };
  const deep = hasBack(type, w, h, sw);
  if (!deep) rows.push(layRow(solo, w, h - 2, 1, sw, false, cap || Infinity));
  else {
    const bmax = def.back.max ?? Infinity;
    const back = layRow(def.back, w, h - 4 - h * 0.14, BACK_S, sw, true, Math.min(bmax, cap ? Math.ceil(cap * 0.45) : Infinity));
    const nb = back.items.filter(i => i.a).length;
    rows.push(back);
    rows.push(layRow(def.front, w, h - 2, 1, sw, false, cap ? Math.max(1, cap - nb) : Infinity));
    if (cap) {
      // the front row came up short: give the back row what it could not take
      const nf = rows[1].items.filter(i => i.a).length;
      if (nb + nf < cap && nb < bmax) rows[0] = layRow(def.back, w, h - 4 - h * 0.14, BACK_S, sw, true, Math.min(bmax, cap - nf));
    }
  }
  const anchors = [];
  for (const r of rows) for (const it of r.items) if (it.a) { it.a.i = anchors.length; anchors.push(it.a); }
  return { type, w, h, sw, rows, anchors };
}

// v1 contract, kept: the anchors, back row first, with sit for the seated ones.
const SIT_ACTS = new Set(["type", "trade", "count", "piano", "gamble", "write", "judge"]);
export function anchorsFor(type, w, h, sw) {
  return roomPlan(type, w, h, sw).anchors.map(a => ({ ...a, sit: a.kind === "seat" || (a.kind === "station" && SIT_ACTS.has(a.act)) }));
}

// ---- who takes which anchor ----------------------------------------------------------
// staff: on shift here (the sim's job/place); rest: at home; patron: everyone else.
export function roleOf(w) {
  if (!w) return "patron";
  if (w.activity === "work") return "staff";
  if (w.activity === "home") return "rest";
  return "patron";
}
const PREFS = { staff: ["staff", "any"], patron: ["patron", "any"], rest: ["rest", "any", "patron"] };
export const isNight = (hour) => hour >= 22 || hour < 7;

function hkey(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// people: [{key, role}]. prev: Map key -> anchor index (who already sat where; kept while
// they stay and the anchor still suits them). Newcomers take the first free anchor of
// their role, starting from a place of their own (hash) so a quiet bar is not all at one
// end; then any free one (visitors never behind the counter); then overflow.
// -> {at: Map key -> index, overflow: [keys]}
// At night (hour given and in the night) residents want a bunk before anything else.
export function assignAnchors(anchors, people, prev = null, hour = null) {
  const n = anchors.length, taken = new Array(n).fill(null), at = new Map(), overflow = [];
  const night = hour != null && isNight(hour);
  const beds = night && anchors.some(a => a.kind === "bed");
  const fits = (a, role) => (PREFS[role] || PREFS.patron).includes(a.role) && !(beds && role === "rest" && a.kind !== "bed");
  const sorted = people.slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const waiting = [];
  for (const p of sorted) {
    const i = prev?.get(p.key);
    if (i != null && i < n && !taken[i] && fits(anchors[i], p.role)) { taken[i] = p.key; at.set(p.key, i); } else waiting.push(p);
  }
  for (const p of waiting) {
    const tiers = PREFS[p.role] || PREFS.patron;
    const start = n ? hkey(p.key) % n : 0;
    let got = -1;
    if (beds && p.role === "rest") for (let k = 0; k < n && got < 0; k++) { const i = (start + k) % n; if (!taken[i] && anchors[i].kind === "bed") got = i; }
    for (const t of tiers) {
      if (got >= 0) break;
      for (let k = 0; k < n && got < 0; k++) { const i = (start + k) % n; if (!taken[i] && anchors[i].role === t) got = i; }
    }
    // anyone may take a spare seat; only staff go behind the counter
    for (let k = 0; k < n && got < 0; k++) { const i = (start + k) % n; if (!taken[i] && (p.role === "staff" || anchors[i].role !== "staff")) got = i; }
    if (got >= 0) { taken[got] = p.key; at.set(p.key, got); } else overflow.push(p.key);
  }
  return { at, overflow };
}

// The loop an anchor runs at this hour, for this person: bunks sleep at night and are sat
// on by day; a worker on shift never sits about. More staff than stations (the sim drafts
// general labour where it likes) puts the rest to work at the tables: a waiter at a café
// table, a vendor among the crates, a warden by the cots.
export const LEISURE_ACTS = new Set(["drink", "eat", "talk", "read", "write", "listen", "pray", "watch", "gamble", "rest", "sleep", "sit", "wait", "shop", "stroll", "loiter", "cheer", "view"]);
const STAFF_ACT = {
  bar: "serve", cafe: "serve", diner: "serve", canteen: "serve", lounge: "serve", suite: "serve", market: "sell", casino: "deal",
  theatre: "perform", concert: "perform", lecture: "lecture", school: "lecture", library: "shelve", park: "rake", allotment: "dig",
  stadium: "sprint", cells: "guard", chapel: "preach", gallery: "guide", assembly: "confer", tribunal: "confer", street: "sweep",
  hab: "tend", lofts: "tend", barracks: "drill", press: "type", vault: "count",
};
export function actAt(a, hour, role = null, type = null) {
  let act = a.kind === "bed" && a.act === "sleep" ? (isNight(hour) ? "sleep" : "rest") : a.act;
  if (role === "staff" && LEISURE_ACTS.has(act)) act = STAFF_ACT[type] || "inspect";
  return act;
}

// ---- drawing ----------------------------------------------------------------------------
// All coordinates in px; u = one pixel-art unit of the room's decor (>=1); furniture is
// sized to the people (p = one sprite pixel at the row's scale), so a stool fits a sitter.
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
const floorY = (y, h, u) => y + h - 3 * u;
function repeat(n, fn) { for (let i = 0; i < n; i++) fn(i); }
function across(x, w, spacing, fn) { const n = Math.max(1, Math.floor(w / spacing)); const off = (w - (n - 1) * spacing) / 2; repeat(n, i => fn(x + off + i * spacing, i)); }
const osc = (t, hz, ph = 0) => Math.sin((t * hz + ph) * Math.PI * 2);
const blink = (t, hz, ph = 0) => ((t * hz + ph) % 1 + 1) % 1 < 0.5;

// The whole room: wall, decor, ambient life, then each row's furniture with its people
// between the back and front layers, then the light. people(row, rowIndex) draws that
// row's occupants (the caller knows who sits where).
//   o: {t: seconds (0 when motion is reduced), hour: machine hour, plan, people}
export function drawRoom(c, placeId, x, y, w, h, u = 2, o = {}) {
  const type = typeOf(placeId);
  const [wall, floor] = LOOK[type] || LOOK.office;
  const t = o.t || 0, hour = o.hour ?? 12;
  const home = type === "hab" || type === "lofts" || type === "suite" || type === "barracks";
  const dark = home && isNight(hour);
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  R(c, wall, x, y, w, h);
  // a wainscot band and a skirting line: walls read as walls, not voids
  R(c, "rgba(0,0,0,0.18)", x, y + h * 0.62, w, h * 0.38);
  R(c, floor, x, y + h - 3 * u, w, 3 * u);
  R(c, "rgba(0,0,0,0.25)", x, y + h - 3 * u, w, u);
  (DRAW[type] || DRAW.office)(c, x, y, w, h, u, { t, hour });
  (LIVE[type] || NOOP)(c, x, y, w, h, u, { t, hour });
  const plan = o.plan;
  if (plan) plan.rows.forEach((row, ri) => {
    const p = (plan.sw * row.s) / 32;   // one sprite pixel at this row's scale
    // furniture is placed in canvas px: the anchor's x shifted into the room
    const abs = row.items.map(it => (it.a ? { ...it.a, x: x + it.a.x } : null));
    const sp = row.span && PROP[row.span.prop];
    sp?.back?.(c, x + row.span.x0, y + row.y, row.span.x1 - row.span.x0, p, t, null, hour);
    row.items.forEach((it, k) => PROP[it.prop]?.back?.(c, x + it.x0, y + row.y, it.x1 - it.x0, p, t, abs[k], hour));
    o.people?.(row, ri);
    sp?.front?.(c, x + row.span.x0, y + row.y, row.span.x1 - row.span.x0, p, t, null, hour);
    row.items.forEach((it, k) => PROP[it.prop]?.front?.(c, x + it.x0, y + row.y, it.x1 - it.x0, p, t, abs[k], hour));
  });
  // light: ceiling lamps throwing a soft cone, off in the homes at night (a reading lamp
  // or two stays on); the machine rooms get a cold wash.
  const cold = COLD.has(type);
  if (dark) R(c, "rgba(2,4,12,0.3)", x, y, w, h);
  else {
    const n = Math.max(1, Math.round(w / (h * 1.6)));
    for (let i = 0; i < n; i++) {
      const lx = x + (w * (i + 0.5)) / n;
      R(c, cold ? "#9ad7e8" : "#ffe2a0", lx - 3 * u, y + 2 * u, 6 * u, u);
      c.fillStyle = cold ? "rgba(140,220,255,0.035)" : "rgba(255,220,150,0.045)";
      c.beginPath(); c.moveTo(lx - 3 * u, y + 3 * u); c.lineTo(lx + 3 * u, y + 3 * u); c.lineTo(lx + h * 0.3, y + h - 3 * u); c.lineTo(lx - h * 0.3, y + h - 3 * u); c.closePath(); c.fill();
    }
  }
  R(c, o.lit === false ? "rgba(255,255,255,0.03)" : "rgba(255,220,150,0.05)", x, y, w, 2 * u);
  c.restore();
}
const COLD = new Set(["lab", "office", "exchange", "vault", "reactor", "racks", "vats", "ward", "cells", "line", "docks", "clock"]);
const NOOP = () => {};

// ---- back walls (decor only; the furniture comes from the plan) -------------------------
const DRAW = {
  bar(c, x, y, w, h, u) {
    R(c, "#3a2414", x + 4 * u, y + h * 0.3, w - 8 * u, 2 * u);   // bottle shelf
    // bottles of the house's few brands, stocked unevenly: glass tints, not a rainbow test card
    across(x + 6 * u, w - 12 * u, 4 * u, (bx, i) => {
      let k = Math.imul(i ^ 0x9e37, 0x85ebca6b); k ^= k >>> 13; k = Math.imul(k, 0xc2b2ae35); k = (k ^ (k >>> 16)) >>> 0;
      if (k % 7 === 0) return;   // a gap where something ran out
      const bh = [4, 5, 6, 3][k % 4] * u, col = ["#3f6b3a", "#8a5a1c", "#6b2a1c", "#c9a86a", "#2f4a3a"][(k >>> 3) % 5];
      R(c, col, bx, y + h * 0.3 - bh, 2 * u, bh);
      R(c, "rgba(255,240,200,0.35)", bx, y + h * 0.3 - bh, u, u);   // the glint
    });
    R(c, "#3a2414", x + 4 * u, y + h * 0.3 - 9 * u, w - 8 * u, u);
  },
  lounge(c, x, y, w, h, u) {
    R(c, "#10222e", x, y + 2 * u, w, h * 0.45);   // night skyline through glass
    across(x, w, 7 * u, (sx, i) => R(c, "#0a141c", sx, y + h * 0.2 - (i % 3) * 3 * u, 5 * u, h * 0.3));
  },
  suite(c, x, y, w, h, u) {
    R(c, "#fbbf24", x + w * 0.6, y + 4 * u, 3 * u, 3 * u);   // chandelier
    R(c, "rgba(251,191,36,0.15)", x + w * 0.55, y + 3 * u, 13 * u, 9 * u);
    R(c, "#10222e", x + 4 * u, y + 5 * u, w * 0.25, h * 0.3);   // the view
  },
  cafe(c, x, y, w, h, u) {
    R(c, "#101010", x + w * 0.45, y + 5 * u, w * 0.3, h * 0.22);   // menu board
    repeat(3, i => R(c, "#e5e5e5", x + w * 0.47, y + 8 * u + i * 3 * u, w * (0.12 + (i % 2) * 0.08), u));
  },
  diner(c, x, y, w, h, u) {
    R(c, "#9ca3af", x, y + 8 * u + h * 0.22 + u, w, u);   // chrome trim under the windows
    across(x, w, 9 * u, wx => R(c, "#1f3040", wx + u, y + 8 * u, 6 * u, h * 0.22));   // windows
  },
  canteen(c, x, y, w, h, u) {
    R(c, "#101010", x + w * 0.4, y + 5 * u, w * 0.25, h * 0.16);   // today's slop
    R(c, "#fbbf24", x + w * 0.42, y + 8 * u, w * 0.15, u);
  },
  lab(c, x, y, w, h, u) {
    R(c, "#0b2a2a", x + w * 0.35, y + 4 * u, w * 0.3, h * 0.22);   // glowing console
  },
  lecture(c, x, y, w, h, u) {
    R(c, "#1f3a2a", x + w * 0.25, y + 4 * u, w * 0.5, h * 0.26);   // board
    R(c, "#e5e5e5", x + w * 0.3, y + 7 * u, w * 0.2, u);
    R(c, "#e5e5e5", x + w * 0.3, y + 10 * u, w * 0.32, u);
  },
  school(c, x, y, w, h, u) {
    DRAW.lecture(c, x, y, w, h, u);
    R(c, "#f87171", x + w * 0.8, y + 6 * u, 3 * u, 3 * u);   // the apple, as regulation demands
  },
  assembly(c, x, y, w, h, u) {
    across(x, w, 12 * u, bx => { R(c, "#2a3a32", bx, y + 3 * u, 3 * u, h * 0.4); R(c, "#4ade80", bx + u, y + 4 * u, u, 2 * u); });   // banners
  },
  tribunal(c, x, y, w, h, u) {
    R(c, "#fbbf24", x + w * 0.49, y + 3 * u, 2 * u, 6 * u);   // the scales
    R(c, "#fbbf24", x + w * 0.44, y + 5 * u, w * 0.12, u);
  },
  office(c, x, y, w, h, u) {
    R(c, "#0b2a1a", x + w * 0.4, y + 4 * u, w * 0.2, h * 0.14);   // the quota board
    R(c, "#4ade80", x + w * 0.42, y + 6 * u, w * 0.12, u);
  },
  exec(c, x, y, w, h, u) {
    R(c, "#10222e", x + 3 * u, y + 3 * u, w - 6 * u, h * 0.35);   // the view
    across(x + 3 * u, w - 6 * u, 8 * u, sx => R(c, "#fbbf24", sx, y + h * 0.3, u, u));
  },
  studio(c, x, y, w, h, u) {
    R(c, "#e5e5e5", x + w * 0.1, y + 4 * u, w * 0.1, u);   // ON AIR lamp housing
  },
  gallery(c, x, y, w, h, u) {
    across(x + 4 * u, w - 8 * u, 16 * u, (fx, i) => {
      R(c, "#c9a227", fx, y + h * 0.22, 10 * u, 8 * u);
      R(c, ["#1e3a5f", "#5f1e1e", "#1e5f3a", "#3a1e5f"][i % 4], fx + u, y + h * 0.22 + u, 8 * u, 6 * u);
      R(c, "rgba(255,240,200,0.12)", fx - u, y + h * 0.22 - 4 * u, 12 * u, 3 * u);   // picture lights
    });
  },
  theatre(c, x, y, w, h, u) {
    R(c, "#8a1c1c", x, y, w * 0.08, h);   // curtains
    R(c, "#8a1c1c", x + w * 0.92, y, w * 0.08, h);
    R(c, "#5a1414", x, y, w, 3 * u);
  },
  concert(c, x, y, w, h, u) { DRAW.theatre(c, x, y, w, h, u); },
  library(c, x, y, w, h, u) {
    R(c, "#3a2a18", x, y + 3 * u, w, u);
  },
  clock(c, x, y, w, h, u, o) {
    const cx = x + w * 0.82, cy = y + h * 0.3, r = Math.min(w * 0.08, h * 0.2);
    c.fillStyle = "#e5dcc5"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    const hr = ((o.hour ?? 0) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
    c.strokeStyle = "#1a1a1a"; c.lineWidth = Math.max(1, u); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(hr) * r * 0.55, cy + Math.sin(hr) * r * 0.55); c.stroke();
    across(x + 3 * u, w * 0.6, 12 * u, gx => { c.strokeStyle = "#5a4a2a"; c.beginPath(); c.arc(gx, y + h * 0.3, 4 * u, 0, Math.PI * 2); c.stroke(); });
  },
  exchange(c, x, y, w, h, u) {
    R(c, "#050a05", x + 2 * u, y + 3 * u, w - 4 * u, 7 * u);   // ticker housing
  },
  vault(c, x, y, w, h, u) {
    const cx = x + w * 0.82, cy = y + h * 0.36, r = Math.min(w * 0.1, h * 0.24);
    c.fillStyle = "#6b7280"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#374151"; c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.fill();
    R(c, "#9ca3af", cx - r * 0.1, cy - r * 0.7, r * 0.2, r * 1.4);
  },
  casino(c, x, y, w, h, u) {
    R(c, "rgba(251,191,36,0.1)", x, y, w, 4 * u);
    across(x, w, 6 * u, (bx, i) => R(c, i % 2 ? "#7f1d1d" : "#3a0f0f", bx, y + 4 * u, 3 * u, 2 * u));   // carpet-pattern frieze
  },
  press(c, x, y, w, h, u) {
    R(c, "#e5e5e5", x + w * 0.5, y + 4 * u, w * 0.22, h * 0.2);   // front page on the wall
    R(c, "#1a1a1a", x + w * 0.52, y + 6 * u, w * 0.18, 2 * u);
    repeat(3, i => R(c, "#6b6b6b", x + w * 0.52, y + 10 * u + i * 2 * u, w * 0.16, u));
  },
  stadium(c, x, y, w, h, u) {
    R(c, "#1f5f2a", x, y + h * 0.62, w, h * 0.38);   // the pitch
    R(c, "#e5e5e5", x + w / 2, y + h * 0.62, u, h * 0.38);
    R(c, "#2a3a2a", x, y + 3 * u, w, h * 0.3);   // the far stands, full
    across(x, w, 3 * u, (sx, i) => R(c, ["#f87171", "#60a5fa", "#fbbf24", "#e5e5e5", "#4ade80"][i % 5], sx, y + 5 * u + (i % 4) * 3 * u, u, u));
  },
  gym(c, x, y, w, h, u) {
    R(c, "#9ab0b8", x + 3 * u, y + 4 * u, w * 0.4, 2 * u);   // mirror
    R(c, "#f87171", x + w * 0.6, y + 4 * u, w * 0.2, 3 * u);   // QUOTA banner
  },
  ward(c, x, y, w, h, u) {
    R(c, "#f87171", x + 3 * u, y + 4 * u, 2 * u, 6 * u); R(c, "#f87171", x + u, y + 6 * u, 6 * u, 2 * u);   // the cross
  },
  chapel(c, x, y, w, h, u) {
    R(c, "#60a5fa", x + w * 0.44, y + 3 * u, w * 0.12, h * 0.36);   // stained glass
    R(c, "#fbbf24", x + w * 0.47, y + 5 * u, w * 0.06, h * 0.12);
  },
  park(c, x, y, w, h, u) {
    R(c, "#0c1c0c", x, y, w, h * 0.5);
    R(c, "#10240f", x, y + h * 0.5, w, h * 0.5);
  },
  allotment(c, x, y, w, h, u) {
    R(c, "#0c1a10", x, y, w, h * 0.4);   // the sky, supervised
    R(c, "#374151", x, y + h * 0.4, w, u);   // the fence
    across(x, w, 6 * u, fx => R(c, "#374151", fx, y + h * 0.4, u, 6 * u));
  },
  market(c, x, y, w, h, u) {
    across(x, w, 10 * u, (bx, i) => R(c, i % 2 ? "#fbbf24" : "#f87171", bx + 4 * u, y + 5 * u, u, u));   // bunting
    R(c, "#6b4a2a", x, y + 5 * u, w, u / 2);
  },
  lofts(c, x, y, w, h, u, o) { DRAW.hab(c, x, y, w, h, u, o); },
  hab(c, x, y, w, h, u) {
    across(x + 6 * u, w - 12 * u, 24 * u, wx => { R(c, "#10161e", wx, y + 6 * u, 8 * u, 7 * u); R(c, "#2c2c30", wx + 3.5 * u, y + 6 * u, u, 7 * u); });   // windows
  },
  line(c, x, y, w, h, u) {
    R(c, "#f87171", x + w - 8 * u, y + 3 * u, 5 * u, 2 * u);   // PROCESSING lamp
    R(c, "#2a1414", x, y + 3 * u, w, 2 * u);   // the chute
  },
  reactor(c, x, y, w, h, u) {
    const cx = x + w * 0.5;
    R(c, "#14532d", cx - 8 * u, y + 3 * u, 16 * u, h * 0.55);
    across(x + 2 * u, w, 10 * u, px => R(c, "#374151", px, y + 3 * u, 2 * u, h * 0.55));   // pipes
  },
  foundry(c, x, y, w, h, u) {
    R(c, "#374151", x + w * 0.4, y + 3 * u, w * 0.2, 7 * u);   // crucible on its chain
    R(c, "#1a1a1a", x + w * 0.5, y, u, 3 * u);
  },
  racks(c, x, y, w, h, u) {
    R(c, "#0a1214", x, y + 2 * u, w, h * 0.6);
  },
  docks(c, x, y, w, h, u) {
    R(c, "#0c2a3a", x, y + h * 0.18, w, h * 0.3);   // data water, beyond the quay
    R(c, "#374151", x + w * 0.7, y + 2 * u, 2 * u, h * 0.5); R(c, "#374151", x + w * 0.45, y + 2 * u, w * 0.27, 2 * u);   // crane
    R(c, "#6b7280", x + w * 0.48, y + 4 * u, u, h * 0.15);
  },
  vats(c, x, y, w, h, u) {
    R(c, "#16301c", x, y + 3 * u, w, 2 * u);   // grow lights
    across(x, w, 8 * u, lx => R(c, "#a78bfa", lx, y + 4 * u, 4 * u, u));
  },
  barracks(c, x, y, w, h, u) {
    R(c, "#3f4a2a", x + w * 0.4, y + 4 * u, w * 0.2, 4 * u);   // the rota
  },
  cells(c, x, y, w, h, u) {
    across(x + u, w - 2 * u, 4 * u, bx => R(c, "#4b5563", bx, y + 2 * u, u, h * 0.55));   // bars, far wall
    R(c, "#6b7280", x, y + 2 * u, w, u);
  },
  street(c, x, y, w, h, u) {
    R(c, "#0c100c", x, y, w, h * 0.45);   // shopfronts, shuttered
    across(x, w, 16 * u, sx => { R(c, "#1c221c", sx + u, y + h * 0.1, 13 * u, h * 0.33); repeat(4, k => R(c, "#141814", sx + u, y + h * 0.12 + k * 3 * u, 13 * u, u)); });
    R(c, "#1a1f1a", x, y + h - 6 * u, w, 3 * u);   // kerb
  },
};
export const DRAWN_TYPES = Object.keys(DRAW);

// ---- ambient life: subtle, in the terminal palette; still when motion is reduced --------
function puff(c, x, y, u, t, ph, col = "rgba(220,230,230,") {
  for (let k = 0; k < 3; k++) {
    const f = ((t * 0.5 + ph + k / 3) % 1 + 1) % 1;
    R(c, `${col}${(0.35 * (1 - f)).toFixed(3)})`, x + osc(t, 0.7, ph + k) * u, y - f * 12 * u, 2 * u, 2 * u);
  }
}
const LIVE = {
  bar(c, x, y, w, h, u, { t }) {
    // the neon, which buzzes and now and then nearly gives up
    const f = (Math.floor(t * 7) % 23 === 0) ? 0.35 : 1;
    const sx = x + w * 0.62, sw = w * 0.22;
    R(c, `rgba(244,114,182,${(0.16 * f).toFixed(3)})`, sx - 4 * u, y + 2 * u, sw + 8 * u, 7 * u);
    R(c, f < 1 ? "#7a3a5c" : "#f472b6", sx, y + 4 * u, sw, 2 * u);
    R(c, f < 1 ? "#7a3a5c" : "#f472b6", sx + sw * 0.2, y + 7 * u, sw * 0.6, u);
  },
  lounge(c, x, y, w, h, u, { t }) {
    across(x, w, 11 * u, (sx, i) => { if (!blink(t, 0.13, i * 0.37) || i % 3) R(c, "#fbbf24", sx + 2 * u, y + h * 0.3 - (i % 4) * 3 * u, u, u); });
  },
  cafe(c, x, y, w, h, u, { t }) { R(c, blink(t, 0.5) ? "#4ade80" : "#1f4a2c", x + w * 0.73, y + 6 * u, u, u); },
  diner(c, x, y, w, h, u, { t }) {
    const on = !(Math.floor(t * 5) % 31 === 0);
    R(c, on ? "#fbbf24" : "#5c4a0c", x + w * 0.38, y + 3 * u, w * 0.24, 3 * u);   // OPEN, mostly
  },
  exchange(c, x, y, w, h, u, { t }) {
    // the ticker, scrolling: green up, red down
    const step = 5 * u, off = (t * 14 * u) % step;
    c.save(); c.beginPath(); c.rect(x + 2 * u, y + 3 * u, w - 4 * u, 7 * u); c.clip();
    let i = Math.floor(t * 14 * u / step);
    for (let bx = x + w - off; bx > x - step; bx -= step, i++) {
      const up = (hkey("tk" + i) % 3) !== 0;
      R(c, up ? "#4ade80" : "#f87171", bx, y + 5 * u + (up ? 0 : u), 3 * u, u);
      R(c, up ? "#4ade80" : "#f87171", bx + u, y + (up ? 4 : 7) * u, u, u);
    }
    c.restore();
  },
  lab(c, x, y, w, h, u, { t }) {
    repeat(4, i => R(c, "#22d3ee", x + w * 0.37, y + 6 * u + i * 2.5 * u, w * (0.06 + ((i + Math.floor(t * 1.5)) % 3) * 0.06), u));
  },
  racks(c, x, y, w, h, u, { t }) {
    across(x + 2 * u, w - 4 * u, 6 * u, (rx, i) => repeat(Math.max(2, Math.floor(h * 0.5 / (4 * u))), k => R(c, ((k + i + Math.floor(t * 3)) % 7) ? "#1f4a2c" : "#4ade80", rx, y + 4 * u + k * 4 * u, u, u)));
  },
  reactor(c, x, y, w, h, u, { t }) {
    const g = 0.5 + 0.5 * osc(t, 0.25);
    const cx = x + w * 0.5;
    R(c, "#4ade80", cx - 5 * u, y + 6 * u, 10 * u, h * 0.5 - 6 * u);
    R(c, `rgba(74,222,128,${(0.08 + 0.1 * g).toFixed(3)})`, cx - 16 * u, y, 32 * u, h);
  },
  foundry(c, x, y, w, h, u, { t }) {
    const g = 0.18 + 0.08 * osc(t, 1.7) + 0.04 * osc(t, 4.3);
    R(c, `rgba(249,115,22,${g.toFixed(3)})`, x + w * 0.3, y, w * 0.4, h);
    const f = ((t * 0.8) % 1 + 1) % 1;
    R(c, "#f97316", x + w * 0.5 - u / 2, y + 10 * u + f * h * 0.3, u, 2 * u);   // the pour, dripping
  },
  vats(c, x, y, w, h, u, { t }) { across(x, w, 8 * u, (lx, i) => { if (blink(t, 0.2, i * 0.3)) R(c, "rgba(167,139,250,0.08)", lx - 2 * u, y + 5 * u, 8 * u, h * 0.4); }); },
  line(c, x, y, w, h, u, { t }) { R(c, blink(t, 0.8) ? "#f87171" : "#7f1d1d", x + w - 8 * u, y + 3 * u, 5 * u, 2 * u); },
  ward(c, x, y, w, h, u, { t }) { R(c, blink(t, 0.4) ? "#f87171" : "#7f1d1d", x + 3 * u, y + 4 * u, 2 * u, 6 * u); },
  casino(c, x, y, w, h, u, { t }) { across(x, w, 6 * u, (bx, i) => R(c, (i + Math.floor(t * 4)) % 4 ? "#7a5a14" : "#fbbf24", bx + u, y + u, u, u)); },
  chapel(c, x, y, w, h, u, { t }) { R(c, "#4ade80", x + w * 0.49, y + h * 0.44, w * 0.02, 2 * u + (blink(t, 0.3) ? u : 0)); },   // the uptime lamp
  docks(c, x, y, w, h, u, { t }) { across(x, w, 7 * u, (wx, i) => R(c, "#22d3ee", wx + ((t * 3 * u + i * 2 * u) % (4 * u)), y + h * 0.3 + (i % 2) * 4 * u, 3 * u, u)); },
  stadium(c, x, y, w, h, u, { t }) { across(x, w, 5 * u, (sx, i) => { if (blink(t, 0.9, i * 0.29)) R(c, "#e5e5e5", sx, y + 4 * u + (i % 4) * 3 * u, u, u); }); },
  studio(c, x, y, w, h, u, { t }) { R(c, blink(t, 0.25) ? "#f87171" : "#5a1414", x + w * 0.1, y + 5 * u, w * 0.1, 2 * u); },
  street(c, x, y, w, h, u, { t }) { if (Math.floor(t * 6) % 41 !== 0) across(x + 8 * u, w - 16 * u, 30 * u, lx => R(c, "rgba(251,191,36,0.07)", lx - 6 * u, y + h * 0.5, 12 * u, h * 0.45)); },
  clock(c, x, y, w, h, u, { t }) {
    across(x + 3 * u, w * 0.6, 12 * u, (gx, i) => { const a = t * (i % 2 ? 0.6 : -0.6); R(c, "#8a7a4a", gx + Math.cos(a) * 3 * u, y + h * 0.3 + Math.sin(a) * 3 * u, u, u); });
  },
};

// ---- furniture ---------------------------------------------------------------------------
// PROP[name] = {back, front}: back is drawn before the row's people, front after them.
// (c, X item left, Y the row's floor, W item width, p one sprite pixel, t, a anchor, hour)
// The person stands at a.x; SIDE furniture sits to their right, where they face.
const WOOD = "#6a4a2a", WOOD_D = "#4a3018", STEEL = "#6b7280", STEEL_D = "#374151", CLOTH = "#e5e7eb";
const personX = (X, W, a) => (a ? a.x : X + W / 2);
const rightOf = (X, W, a, p) => { const px = a ? a.x : X + W * SIDE; return [px + 7 * p, X + W - p]; };   // where SIDE furniture goes
function screen(c, x, y, w, h, t, ph, col = "#4ade80") {
  R(c, "#0b1a12", x, y, w, h);
  R(c, col, x + 1, y + 1, Math.max(1, (w - 2) * (0.4 + 0.5 * (((hkey("s" + ph) + Math.floor(t * 2)) % 5) / 5))), 1);
  R(c, col, x + 1, y + 3, Math.max(1, (w - 2) * 0.6), 1);
}
export const PROP = {
  // seen from the front, the seat is in front of the sitter: the rim over the hips, legs splayed
  stool: { front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#b08a52", x - 7 * p, Y - 11 * p, 14 * p, 2 * p); R(c, "#7a5a32", x - 6 * p, Y - 9 * p, 12 * p, p); R(c, "#6a5030", x - 6 * p, Y - 8 * p, p, 8 * p); R(c, "#6a5030", x + 5 * p, Y - 8 * p, p, 8 * p); R(c, "#6a5030", x - 5 * p, Y - 4 * p, 11 * p, p); } },
  chair: {
    back(c, X, Y, W, p, t, a) { const x = personX(X, W, a), f = a?.face || 1; R(c, WOOD, x - f * 6 * p - (f > 0 ? 0 : 2 * p), Y - 24 * p, 2 * p, 16 * p); },
    front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, WOOD, x - 6 * p, Y - 11 * p, 12 * p, 2 * p); R(c, WOOD_D, x - 5 * p, Y - 9 * p, p, 9 * p); R(c, WOOD_D, x + 4 * p, Y - 9 * p, p, 9 * p); },
  },
  armchair: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#5a2a3a", x - 8 * p, Y - 20 * p, 16 * p, 12 * p); R(c, "#7a3a4a", x - 8 * p, Y - 10 * p, 16 * p, 8 * p); }, front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#7a3a4a", x - 9 * p, Y - 12 * p, 3 * p, 10 * p); R(c, "#7a3a4a", x + 6 * p, Y - 12 * p, 3 * p, 10 * p); } },
  sofa: { back(c, X, Y, W, p) { R(c, "#5a2a6a", X + p, Y - 20 * p, W - 2 * p, 11 * p); R(c, "#7a3a8a", X + p, Y - 10 * p, W - 2 * p, 8 * p); }, front(c, X, Y, W, p) { R(c, "#7a3a8a", X, Y - 12 * p, 3 * p, 10 * p); R(c, "#7a3a8a", X + W - 3 * p, Y - 12 * p, 3 * p, 10 * p); } },
  sideTable: { back(c, X, Y, W, p, t) { const x = X + W / 2; R(c, WOOD, x - 5 * p, Y - 12 * p, 10 * p, 2 * p); R(c, WOOD_D, x - p, Y - 10 * p, 2 * p, 10 * p); R(c, "#fbbf24", x - 2 * p, Y - 15 * p, 2 * p, 3 * p); } },
  lampTable: { back(c, X, Y, W, p, t, a, hour) { const x = X + W / 2; R(c, WOOD, x - 5 * p, Y - 12 * p, 10 * p, 2 * p); R(c, WOOD_D, x - p, Y - 10 * p, 2 * p, 10 * p); R(c, "#c2a878", x - 4 * p, Y - 20 * p, 8 * p, 5 * p); R(c, "#6b5a3a", x, Y - 15 * p, p, 3 * p); if (isNight(hour ?? 12)) R(c, "rgba(251,191,36,0.16)", x - 14 * p, Y - 24 * p, 28 * p, 24 * p); } },
  plant: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#5a3a22", x - 4 * p, Y - 7 * p, 8 * p, 7 * p); R(c, "#15803d", x - 6 * p, Y - 20 * p, 12 * p, 13 * p); R(c, "#22c55e", x - 3 * p, Y - 23 * p, 6 * p, 6 * p); } },
  // the bar: the counter covers the back row from the hips down
  counter: { front(c, X, Y, W, p) { R(c, "#5a3418", X, Y - 16 * p, W + 1, 3 * p); R(c, "#3a2010", X, Y - 13 * p, W + 1, 13 * p); R(c, "#2a160a", X, Y - 5 * p, W + 1, p); } },
  // a counter seat: the counter behind the sitter (they lean back on it), the stool in front
  barStool: { back(c, X, Y, W, p) { R(c, "#5a3418", X, Y - 20 * p, W + 1, 3 * p); R(c, "#3a2010", X, Y - 17 * p, W + 1, 17 * p); }, front(c, X, Y, W, p, t, a) { PROP.stool.front(c, X, Y, W, p, t, a); } },
  taps: { front(c, X, Y, W, p) { const x = X + W / 2; R(c, "#b8b8b8", x - 4 * p, Y - 22 * p, 8 * p, 2 * p); repeat(3, k => R(c, "#d4d4d4", x - 4 * p + k * 3 * p, Y - 20 * p, p, 4 * p)); } },
  barEnd: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#3a2414", X, Y - 30 * p, W, 2 * p); repeat(3, k => R(c, ["#4ade80", "#fbbf24", "#f87171"][k], X + 2 * p + k * 4 * p, Y - 36 * p, 2 * p, 6 * p)); void x0; void x1; },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#5a3418", x0 - 2 * p, Y - 16 * p, x1 - x0 + 2 * p, 3 * p); R(c, "#3a2010", x0 - p, Y - 13 * p, x1 - x0, 13 * p); R(c, "#e5e5e5", x0 + 2 * p, Y - 19 * p, 2 * p, 3 * p); },
  },
  espresso: {
    back(c, X, Y, W, p, t) { const x = X + W * 0.75; R(c, "#b8b8b8", x - 5 * p, Y - 26 * p, 10 * p, 10 * p); R(c, "#e5e5e5", x - 4 * p, Y - 25 * p, 8 * p, 2 * p); R(c, "#f87171", x - p, Y - 21 * p, 2 * p, p); puff(c, x + 3 * p, Y - 27 * p, p, t, 0.2); },
    front(c, X, Y, W, p) { PROP.counter.front(c, X, Y, W, p); },
  },
  espressoEnd: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const x = (x0 + x1) / 2; R(c, "#b8b8b8", x - 5 * p, Y - 26 * p, 10 * p, 10 * p); R(c, "#e5e5e5", x - 4 * p, Y - 25 * p, 8 * p, 2 * p); puff(c, x + 3 * p, Y - 27 * p, p, t, 0.5); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#5a3a22", x0 - 2 * p, Y - 16 * p, x1 - x0 + 2 * p, 16 * p); R(c, "#7a4a2a", x0 - 2 * p, Y - 16 * p, x1 - x0 + 2 * p, 2 * p); },
  },
  cafeTable: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#8a6a42", x - 7 * p, Y - 14 * p, 14 * p, 2 * p); R(c, "#5a4428", x - p, Y - 12 * p, 2 * p, 12 * p); R(c, "#5a4428", x - 4 * p, Y - p, 8 * p, p); R(c, "#e5e5e5", x - 4 * p, Y - 16 * p, 3 * p, 2 * p); R(c, "#e5e5e5", x + 2 * p, Y - 16 * p, 3 * p, 2 * p); } },
  booth: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a), f = a?.face || 1; R(c, "#b91c1c", x - f * 8 * p - 2 * p, Y - 26 * p, 4 * p, 26 * p); R(c, "#b91c1c", x - 7 * p, Y - 10 * p, 14 * p, 4 * p); R(c, "#7f1d1d", x - 7 * p, Y - 6 * p, 14 * p, 6 * p); } },
  dinerTable: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#e5e5e5", x - 8 * p, Y - 15 * p, 16 * p, 2 * p); R(c, "#9ca3af", x - p, Y - 13 * p, 2 * p, 13 * p); R(c, "#fbbf24", x - 5 * p, Y - 17 * p, 4 * p, 2 * p); R(c, "#f87171", x + 2 * p, Y - 18 * p, 2 * p, 3 * p); } },
  grill: {
    back(c, X, Y, W, p, t) { const x = X + W * 0.5; R(c, STEEL_D, X + p, Y - 34 * p, W - 2 * p, 4 * p); puff(c, x - 4 * p, Y - 20 * p, p, t, 0.1); puff(c, x + 5 * p, Y - 20 * p, p, t, 0.6); },
    front(c, X, Y, W, p) { R(c, STEEL, X, Y - 16 * p, W + 1, 3 * p); R(c, "#4b5563", X, Y - 13 * p, W + 1, 13 * p); R(c, "#f97316", X + 2 * p, Y - 17 * p, W - 4 * p, p); },
  },
  grillEnd: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); puff(c, (x0 + x1) / 2, Y - 20 * p, p, t, 0.3); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, STEEL, x0 - 2 * p, Y - 16 * p, x1 - x0 + 2 * p, 3 * p); R(c, "#4b5563", x0 - 2 * p, Y - 13 * p, x1 - x0 + 2 * p, 13 * p); R(c, "#f97316", x0, Y - 17 * p, x1 - x0 - 2 * p, p); },
  },
  servingLine: {
    back(c, X, Y, W, p, t) { puff(c, X + W * 0.7, Y - 20 * p, p, t, 0.4); },
    front(c, X, Y, W, p) { R(c, "#8a8a80", X, Y - 16 * p, W + 1, 3 * p); R(c, "#6a6a62", X, Y - 13 * p, W + 1, 13 * p); repeat(3, k => R(c, "#b0b0a8", X + 2 * p + k * (W / 3), Y - 18 * p, W / 4, 2 * p)); },
  },
  servingEnd: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); puff(c, (x0 + x1) / 2, Y - 20 * p, p, t, 0.8); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#8a8a80", x0 - 2 * p, Y - 16 * p, x1 - x0 + 2 * p, 3 * p); R(c, "#6a6a62", x0 - 2 * p, Y - 13 * p, x1 - x0 + 2 * p, 13 * p); },
  },
  trayRail: { back(c, X, Y, W, p) { R(c, "#6a6a62", X, Y - 12 * p, W, p); } },
  bench: { front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#5a4a3a", x - 7 * p, Y - 11 * p, 14 * p, 2 * p); R(c, "#2a2420", x - 6 * p, Y - 9 * p, p, 9 * p); R(c, "#2a2420", x + 5 * p, Y - 9 * p, p, 9 * p); } },
  longTable: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#5a4a3a", x - 9 * p, Y - 14 * p, 18 * p, 2 * p); R(c, "#3a3028", x - 7 * p, Y - 12 * p, 2 * p, 12 * p); R(c, "#3a3028", x + 5 * p, Y - 12 * p, 2 * p, 12 * p); R(c, "#8a8a80", x - 6 * p, Y - 15 * p, 4 * p, p); R(c, "#8a8a80", x + 2 * p, Y - 15 * p, 4 * p, p); } },
  // workbenches with their kit, to the worker's right
  labBench: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const bw = x1 - x0; R(c, "#22d3ee", x0 + bw * 0.15, Y - 22 * p, 2 * p, 5 * p); R(c, "#4ade80", x0 + bw * 0.45, Y - 21 * p, 3 * p, 4 * p); R(c, ((hkey("f" + x0) + Math.floor(t)) % 2) ? "#f472b6" : "#a78bfa", x0 + bw * 0.75, Y - 23 * p, 2 * p, 6 * p); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#cfd8dc", x0, Y - 17 * p, x1 - x0, 2 * p); R(c, "#546e7a", x0 + p, Y - 15 * p, x1 - x0 - 2 * p, 15 * p); R(c, "#37474f", x0 + p, Y - 9 * p, x1 - x0 - 2 * p, p); },
  },
  scopeDesk: {
    back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); R(c, "#9ca3af", x0 + 2 * p, Y - 26 * p, 3 * p, 9 * p); R(c, "#374151", x0 + p, Y - 27 * p, 5 * p, 2 * p); R(c, "#22d3ee", x0 + 3 * p, Y - 18 * p, p, p); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#cfd8dc", x0, Y - 17 * p, x1 - x0, 2 * p); R(c, "#546e7a", x0 + p, Y - 15 * p, 2 * p, 15 * p); R(c, "#546e7a", x1 - 3 * p, Y - 15 * p, 2 * p, 15 * p); },
  },
  desk: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const x = personX(X, W, a); R(c, "#2a3a32", x - 5 * p, Y - 22 * p, 2 * p, 12 * p); R(c, "#1a1a1a", x - 4 * p, Y - 10 * p, 9 * p, 2 * p); R(c, STEEL_D, x, Y - 8 * p, p, 8 * p); screen(c, x0 + (x1 - x0) * 0.35, Y - 27 * p, 9 * p, 8 * p, t, x0); R(c, "#2a3a32", x0 + (x1 - x0) * 0.35 + 4 * p, Y - 19 * p, p, 2 * p); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#3a4a42", x0 - 3 * p, Y - 17 * p, x1 - x0 + 3 * p, 2 * p); R(c, "#26302a", x1 - 3 * p, Y - 15 * p, 2 * p, 15 * p); R(c, "#26302a", x0, Y - 15 * p, 2 * p, 15 * p); },
  },
  cabinet: { back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#4b5563", x0, Y - 26 * p, x1 - x0, 26 * p); repeat(3, k => { R(c, "#374151", x0 + p, Y - 25 * p + k * 8 * p, x1 - x0 - 2 * p, 7 * p); R(c, "#9ca3af", x0 + (x1 - x0) / 2 - p, Y - 22 * p + k * 8 * p, 2 * p, p); }); } },
  typewriterDesk: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const x = personX(X, W, a); R(c, "#1a1a1a", x - 4 * p, Y - 10 * p, 9 * p, 2 * p); R(c, STEEL_D, x, Y - 8 * p, p, 8 * p); const tx = x0 + (x1 - x0) * 0.3; R(c, "#1a1a1a", tx, Y - 21 * p, 9 * p, 4 * p); R(c, "#e5e5e5", tx + 2 * p, Y - 25 * p + (Math.floor(t * 2) % 3) * 0, 5 * p, 4 * p); R(c, "#c9c9c9", x0 + (x1 - x0) * 0.75, Y - 19 * p, 5 * p, 2 * p); },
    front(c, X, Y, W, p, t, a) { PROP.desk.front(c, X, Y, W, p, t, a); },
  },
  pressRack: { back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const x = (x0 + x1) / 2; R(c, WOOD_D, x - 7 * p, Y - 32 * p, 14 * p, 2 * p); R(c, WOOD_D, x - p, Y - 30 * p, 2 * p, 30 * p); R(c, WOOD_D, x - 6 * p, Y - p, 12 * p, p); repeat(2, k => { R(c, "#d6d3c4", x - 7 * p + k * 8 * p, Y - 30 * p, 6 * p, 9 * p); R(c, "#6b6b6b", x - 6 * p + k * 8 * p, Y - 28 * p, 4 * p, p); R(c, "#6b6b6b", x - 6 * p + k * 8 * p, Y - 25 * p, 3 * p, p); }); } },
  tickerDesk: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const x = personX(X, W, a); R(c, "#1a1a1a", x - 4 * p, Y - 10 * p, 9 * p, 2 * p); R(c, STEEL_D, x, Y - 8 * p, p, 8 * p); const mx = x0 + (x1 - x0) * 0.2; screen(c, mx, Y - 27 * p, 8 * p, 8 * p, t, x0, "#60a5fa"); screen(c, mx + 9 * p, Y - 27 * p, 8 * p, 8 * p, t, x0 + 7, (Math.floor(t + x0) % 3) ? "#4ade80" : "#f87171"); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#2a3a44", x0 - 3 * p, Y - 17 * p, x1 - x0 + 3 * p, 2 * p); R(c, "#1a2630", x0, Y - 15 * p, x1 - x0, 15 * p); },
  },
  execDesk: {
    back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#3a1a1a", x - 7 * p, Y - 30 * p, 14 * p, 20 * p); R(c, "#5a2a2a", x - 7 * p, Y - 12 * p, 14 * p, 3 * p); },
    front(c, X, Y, W, p) { R(c, "#6a4a22", X + p, Y - 16 * p, W - 2 * p, 3 * p); R(c, "#3a2a14", X + 2 * p, Y - 13 * p, W - 4 * p, 13 * p); R(c, "#fbbf24", X + W * 0.7, Y - 18 * p, 3 * p, 2 * p); },
  },
  podium: { front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#3a4a42", x - 7 * p, Y - 17 * p, 14 * p, 17 * p); R(c, "#4ade80", x - 3 * p, Y - 13 * p, 6 * p, 2 * p); R(c, "#1a1a1a", x + 3 * p, Y - 22 * p, p, 5 * p); } },
  lectern: { front(c, X, Y, W, p, t, a) { const x = personX(X, W, a) + 5 * p; R(c, WOOD, x - 3 * p, Y - 17 * p, 8 * p, 2 * p); R(c, WOOD_D, x, Y - 15 * p, 2 * p, 15 * p); R(c, WOOD_D, x - 3 * p, Y - p, 8 * p, p); } },
  benchRow: { back(c, X, Y, W, p) { R(c, "#4a3a28", X, Y - 10 * p, W + 1, 2 * p); R(c, "#4a3a28", X, Y - 20 * p, W + 1, 2 * p); R(c, "#2a2014", X + W / 2, Y - 8 * p, p, 8 * p); } },
  schoolDesk: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, WOOD_D, x - 5 * p, Y - 9 * p, 10 * p, 2 * p); R(c, WOOD_D, x - 5 * p, Y - 7 * p, p, 7 * p); }, front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#7a5a32", x - 7 * p, Y - 14 * p, 14 * p, 2 * p); R(c, "#5a4428", x - 6 * p, Y - 12 * p, 12 * p, 5 * p); R(c, "#e5e5e5", x - 3 * p, Y - 15 * p, 5 * p, p); } },
  judgeBench: { front(c, X, Y, W, p) { R(c, "#7a5232", X, Y - 18 * p, W + 1, 3 * p); R(c, "#5a3a22", X, Y - 15 * p, W + 1, 15 * p); R(c, "#3a2414", X + W / 2 - p, Y - 12 * p, 2 * p, 8 * p); } },
  pew: { back(c, X, Y, W, p) { R(c, "#4a3222", X, Y - 22 * p, W + 1, 2 * p); R(c, "#4a3222", X, Y - 10 * p, W + 1, 2 * p); R(c, "#2a1a12", X + p, Y - 8 * p, p, 8 * p); } },
  altar: { front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#e5e5e5", x - 9 * p, Y - 14 * p, 18 * p, 2 * p); R(c, "#4a3a5a", x - 8 * p, Y - 12 * p, 16 * p, 12 * p); R(c, "#4ade80", x - p, Y - 9 * p, 2 * p, 4 * p); R(c, "#fbbf24", x + 6 * p, Y - 18 * p + (blink(t, 1.5) ? 0 : p), p, 3 * p); } },
  easel: {
    back(c, X, Y, W, p, t, a) {
      const [x0, x1] = rightOf(X, W, a, p); const x = (x0 + x1) / 2;
      R(c, "#8a6a42", x - p, Y - 34 * p, p, 34 * p); R(c, "#8a6a42", x - 6 * p, Y - p, 12 * p, p); R(c, "#8a6a42", x - 5 * p, Y - 14 * p, 10 * p, p);
      R(c, "#f5f0e0", x - 6 * p, Y - 32 * p, 12 * p, 16 * p);
      const n = 1 + (Math.floor(t * 0.5 + (a?.i || 0)) % 5);
      repeat(n, k => R(c, ["#f87171", "#60a5fa", "#fbbf24", "#4ade80", "#a78bfa"][(k + (a?.i || 0)) % 5], x - 5 * p + (k * 3 % 9) * p, Y - 30 * p + (k * 5 % 12) * p, 3 * p, 3 * p));
    },
  },
  camera: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); R(c, "#1a1a1a", x0 + 2 * p, Y - 28 * p, 10 * p, 7 * p); R(c, "#374151", x0 + 12 * p, Y - 27 * p, 3 * p, 5 * p); R(c, blink(t, 1) ? "#f87171" : "#5a1414", x0 + 3 * p, Y - 27 * p, p, p); R(c, STEEL_D, x0 + 6 * p, Y - 21 * p, p, 21 * p); R(c, STEEL_D, x0 + 2 * p, Y - p, 10 * p, p); } },
  stage: { back(c, X, Y, W, p) { R(c, "#5a3a22", X, Y - 2 * p, W + 1, 2 * p); R(c, "rgba(251,191,36,0.10)", X + p, Y - 44 * p, W - 2 * p, 42 * p); } },
  theatreSeat: { front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#7f1d1d", x - 6 * p, Y - 8 * p, 12 * p, 8 * p); R(c, "#5a1414", x - 6 * p, Y - 2 * p, 12 * p, 2 * p); } },
  piano: { front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#101010", x0 - 2 * p, Y - 20 * p, x1 - x0 + 2 * p, 8 * p); R(c, "#e5e5e5", x0 - 2 * p, Y - 13 * p, 6 * p, p); R(c, "#101010", x0, Y - 12 * p, p, 12 * p); R(c, "#101010", x1 - 2 * p, Y - 12 * p, p, 12 * p); } },
  plinth: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#5a5048", x - 4 * p, Y - 14 * p, 8 * p, 14 * p); R(c, "#c9a227", x - 2 * p, Y - 20 * p, 4 * p, 6 * p); } },
  rope: { front(c, X, Y, W, p) { R(c, "#c9a227", X + p, Y - 14 * p, p, 14 * p); R(c, "#c9a227", X + W - 2 * p, Y - 14 * p, p, 14 * p); R(c, "#9b1c1c", X + p, Y - 12 * p, W - 2 * p, p); } },
  bookcase: { back(c, X, Y, W, p) { R(c, "#4a3018", X + p, Y - 40 * p, W - 2 * p, 40 * p); repeat(4, r => { R(c, "#2a1a0c", X + 2 * p, Y - 38 * p + r * 9 * p, W - 4 * p, 8 * p); for (let bx = X + 2 * p, k = 0; bx < X + W - 4 * p; bx += 3 * p, k++) R(c, ["#7f1d1d", "#1e3a5f", "#3f6212", "#78350f"][(r + k) % 4], bx, Y - 37 * p + r * 9 * p + (k % 3 === 0 ? p : 0), 2 * p, 7 * p - (k % 3 === 0 ? p : 0)); }); } },
  readingTable: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, WOOD, x - 9 * p, Y - 14 * p, 18 * p, 2 * p); R(c, WOOD_D, x - 7 * p, Y - 12 * p, 2 * p, 12 * p); R(c, WOOD_D, x + 5 * p, Y - 12 * p, 2 * p, 12 * p); R(c, "#4ade80", x - 2 * p, Y - 19 * p, p, 5 * p); R(c, "rgba(74,222,128,0.18)", x - 6 * p, Y - 17 * p, 12 * p, 3 * p); } },
  crank: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const cx = x0 + (x1 - x0) * 0.4, cy = Y - 18 * p, r = 6 * p; c.strokeStyle = "#8a7a4a"; c.lineWidth = Math.max(1, p); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); const an = t * 0.8; R(c, "#c9a227", cx + Math.cos(an) * r - p, cy + Math.sin(an) * r - p, 2 * p, 2 * p); R(c, "#5a4a2a", cx - p, cy, 2 * p, Y - cy); },
  },
  countingDesk: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const x = personX(X, W, a); R(c, "#1a1a1a", x - 4 * p, Y - 10 * p, 9 * p, 2 * p); R(c, STEEL_D, x, Y - 8 * p, p, 8 * p); const k = 1 + (Math.floor(t * 1.5 + (a?.i || 0)) % 4); repeat(k, i => R(c, "#c9a227", x0 + 2 * p + i * 4 * p, Y - 19 * p - (i % 2) * p, 3 * p, 2 * p)); void x1; },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#4a4a4a", x0 - 3 * p, Y - 17 * p, x1 - x0 + 3 * p, 2 * p); R(c, "#2c3034", x0, Y - 15 * p, x1 - x0, 15 * p); },
  },
  bullion: { back(c, X, Y, W, p) { const x = X + W / 2; repeat(3, i => R(c, "#c9a227", x - 7 * p + i * 5 * p, Y - 4 * p, 4 * p, 4 * p)); repeat(2, i => R(c, "#b08a1f", x - 4 * p + i * 5 * p, Y - 8 * p, 4 * p, 4 * p)); } },
  felt: { front(c, X, Y, W, p, t) { R(c, "#14532d", X + p, Y - 17 * p, W - 2 * p, 3 * p); R(c, "#3a2a1a", X + p, Y - 14 * p, W - 2 * p, 14 * p); const k = Math.floor(t * 1.2) % 3; repeat(k + 1, i => R(c, "#e5e5e5", X + W * 0.3 + i * 3 * p, Y - 18 * p, 2 * p, p)); R(c, "#f87171", X + W * 0.7, Y - 18 * p, 2 * p, p); } },
  mic: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a) - 6 * p; R(c, "#9ca3af", x, Y - 28 * p, p, 28 * p); R(c, "#1a1a1a", x - p, Y - 31 * p, 3 * p, 3 * p); R(c, "rgba(244,114,182,0.12)", x - 8 * p, Y - 48 * p, 22 * p, 48 * p); } },
  slotMachine: {
    back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#9a7a4a", x - 4 * p, Y - 10 * p, 8 * p, 2 * p); R(c, "#6a5030", x - p, Y - 8 * p, 2 * p, 8 * p); },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const mw = Math.min(12 * p, x1 - x0); R(c, "#7a1a1a", x0, Y - 30 * p, mw, 30 * p); R(c, "#0b0b0b", x0 + p, Y - 26 * p, mw - 2 * p, 6 * p); const sp = Math.floor(t * 8 + (a?.i || 0) * 3); repeat(3, k => R(c, ["#fbbf24", "#4ade80", "#f87171", "#60a5fa"][(sp + k * 2) % 4], x0 + 2 * p + k * 3 * p, Y - 25 * p, 2 * p, 4 * p)); R(c, "#fbbf24", x0 + mw - 2 * p, Y - 34 * p, p, 6 * p); },
  },
  bleacher: { back(c, X, Y, W, p) { R(c, "#3a4a3a", X, Y - 2 * p, W + 1, 2 * p); R(c, "#2a3a2a", X, Y - 12 * p, W + 1, 2 * p); } },
  pitch: { back(c, X, Y, W, p) { R(c, "#e5e5e5", X, Y - p, W, p / 2); } },
  barbell: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#111", x - 10 * p, Y - 2 * p, 20 * p, 2 * p); R(c, STEEL_D, x - 11 * p, Y - 22 * p, 2 * p, 20 * p); R(c, STEEL_D, x + 9 * p, Y - 22 * p, 2 * p, 20 * p); } },
  treadmill: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, STEEL_D, x + 6 * p, Y - 22 * p, 2 * p, 18 * p); R(c, "#111", x + 4 * p, Y - 22 * p, 6 * p, 2 * p); }, front(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#374151", x - 9 * p, Y - 4 * p, 18 * p, 4 * p); const o = (t * 12) % 4; for (let k = 0; k < 4; k++) R(c, "#111", x - 8 * p + ((k * 4 + o) % 16) * p, Y - 4 * p, p, p); } },
  bag: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); const sw = osc(t, 0.9, (a?.i || 0) * 0.3) * p; R(c, "#1a1a1a", x0 + 4 * p, Y - 44 * p, p, 8 * p); R(c, "#7f1d1d", x0 + sw, Y - 36 * p, 8 * p, 18 * p); R(c, "#5a1414", x0 + sw, Y - 20 * p, 8 * p, 2 * p); } },
  hospitalBed: {
    back(c, X, Y, W, p, t, a) { R(c, "rgba(147,197,253,0.18)", X, Y - 44 * p, 2 * p, 42 * p); const bx = X + 3 * p; R(c, "#1a2a2a", bx + 2 * p, Y - 34 * p, 7 * p, 6 * p); R(c, "#0b1a1a", bx + 3 * p, Y - 33 * p, 5 * p, 4 * p); const f = ((t * 1.3 + (a?.i || 0) * 0.37) % 1); R(c, "#4ade80", bx + 3 * p + f * 4 * p, Y - 31 * p - (f > 0.4 && f < 0.6 ? p : 0), p, p); },
    front(c, X, Y, W, p, t, a) { const bx = X + 3 * p, bw = Math.min(26 * p, (a ? a.x - 6 * p : X + W) - bx); R(c, CLOTH, bx, Y - 12 * p, bw, 3 * p); R(c, "#93c5fd", bx, Y - 14 * p, 5 * p, 2 * p); R(c, "#7aa4c8", bx + 6 * p, Y - 13 * p, bw - 6 * p, 3 * p); R(c, STEEL, bx, Y - 9 * p, p, 9 * p); R(c, STEEL, bx + bw - p, Y - 9 * p, p, 9 * p); },
  },
  trolley: { back(c, X, Y, W, p) { const x = X + W - 8 * p; R(c, CLOTH, x - 5 * p, Y - 14 * p, 10 * p, 2 * p); R(c, STEEL, x - 5 * p, Y - 12 * p, p, 10 * p); R(c, STEEL, x + 4 * p, Y - 12 * p, p, 10 * p); R(c, "#f87171", x - 2 * p, Y - 17 * p, 3 * p, 3 * p); R(c, "#60a5fa", x + p, Y - 16 * p, 2 * p, 2 * p); } },
  tree: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#4a3018", x - 2 * p, Y - 20 * p, 4 * p, 20 * p); R(c, "#15803d", x - 10 * p, Y - 42 * p, 20 * p, 22 * p); R(c, "#22c55e", x - 6 * p, Y - 46 * p, 12 * p, 8 * p); } },
  parkBench: { back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#6b4a2a", x - 9 * p, Y - 20 * p, 18 * p, 2 * p); R(c, "#6b4a2a", x - 9 * p, Y - 10 * p, 18 * p, 2 * p); R(c, "#2a2a2a", x - 8 * p, Y - 8 * p, p, 8 * p); R(c, "#2a2a2a", x + 7 * p, Y - 8 * p, p, 8 * p); } },
  leafPile: { back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const n = 3 + Math.floor(t * 0.3 + (a?.i || 0)) % 3; repeat(n, k => R(c, ["#b45309", "#a16207", "#65a30d"][k % 3], x0 + (k * 3 % (Math.max(1, (x1 - x0) / p - 3))) * p, Y - 3 * p - (k % 2) * 2 * p, 3 * p, 2 * p)); } },
  planter: { front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#5a3a22", x0 - 2 * p, Y - 8 * p, x1 - x0 + 2 * p, 8 * p); R(c, "#3a2414", x0 - p, Y - 9 * p, x1 - x0, 2 * p); for (let k = 0, bx = x0; bx < x1 - 3 * p; bx += 5 * p, k++) { R(c, "#15803d", bx, Y - 14 * p - (k % 2) * 2 * p, 3 * p, 5 * p + (k % 2) * 2 * p); if (k % 3 === 1) R(c, "#f97316", bx + p, Y - 15 * p, p, p); } } },
  waterButt: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); R(c, "#1e3a5f", x0 + 2 * p, Y - 16 * p, 10 * p, 16 * p); R(c, "#2a4a6f", x0 + 2 * p, Y - 16 * p, 10 * p, 2 * p); } },
  stall: {
    back(c, X, Y, W, p) { repeat(Math.max(2, Math.floor(W / (4 * p))), k => R(c, k % 2 ? "#e5e5e5" : "#f87171", X + k * 4 * p, Y - 40 * p, 4 * p, 4 * p)); R(c, WOOD_D, X + p, Y - 36 * p, p, 20 * p); R(c, WOOD_D, X + W - 2 * p, Y - 36 * p, p, 20 * p); },
    front(c, X, Y, W, p) { R(c, "#6b4a2a", X, Y - 16 * p, W + 1, 3 * p); R(c, "#4a3018", X, Y - 13 * p, W + 1, 13 * p); repeat(Math.floor(W / (5 * p)), k => R(c, ["#f97316", "#4ade80", "#fbbf24", "#f87171"][k % 4], X + 2 * p + k * 5 * p, Y - 19 * p, 3 * p, 3 * p)); },
  },
  stallEnd: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); repeat(Math.max(2, Math.floor((x1 - X) / (4 * p))), k => R(c, k % 2 ? "#e5e5e5" : "#fbbf24", X + k * 4 * p, Y - 40 * p, 4 * p, 4 * p)); void x0; },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#6b4a2a", x0 - 2 * p, Y - 16 * p, x1 - x0 + 2 * p, 3 * p); R(c, "#4a3018", x0 - 2 * p, Y - 13 * p, x1 - x0 + 2 * p, 13 * p); repeat(Math.floor((x1 - x0) / (5 * p)), k => R(c, ["#f97316", "#4ade80", "#fbbf24"][k % 3], x0 + k * 5 * p, Y - 19 * p, 3 * p, 3 * p)); },
  },
  crates: { back(c, X, Y, W, p) { R(c, "#8a6a42", X + 2 * p, Y - 8 * p, 8 * p, 8 * p); R(c, "#6a4a2a", X + 3 * p, Y - 16 * p, 7 * p, 8 * p); R(c, "#4ade80", X + 4 * p, Y - 18 * p, 2 * p, 2 * p); } },
  bunk: {
    back(c, X, Y, W, p, t, a, hour) { R(c, "#3a3a44", X + 2 * p, Y - 36 * p, W - 4 * p, 3 * p); R(c, "#5a5a66", X + 2 * p, Y - 38 * p, W - 4 * p, 2 * p); R(c, "#2a2a30", X + 2 * p, Y - 36 * p, p, 36 * p); R(c, "#2a2a30", X + W - 3 * p, Y - 36 * p, p, 36 * p); const on = !isNight(hour ?? 12) || ((a?.i || 0) % 5 === 2); R(c, on ? "#fbbf24" : "#4b5563", X + W - 5 * p, Y - 30 * p, 2 * p, 2 * p); if (on && isNight(hour ?? 12)) R(c, "rgba(251,191,36,0.14)", X + W - 14 * p, Y - 34 * p, 18 * p, 34 * p); },
    front(c, X, Y, W, p) { R(c, "#3a3a44", X + 2 * p, Y - 9 * p, W - 4 * p, 3 * p); R(c, "#2a2a30", X + 2 * p, Y - 6 * p, p, 6 * p); R(c, "#2a2a30", X + W - 3 * p, Y - 6 * p, p, 6 * p); },
  },
  bedFancy: { back(c, X, Y, W, p) { R(c, "#5a3a22", X + p, Y - 22 * p, 3 * p, 22 * p); }, front(c, X, Y, W, p) { R(c, "#7a3a3a", X + p, Y - 9 * p, W - 2 * p, 4 * p); R(c, "#e5d5b5", X + 3 * p, Y - 11 * p, 5 * p, 2 * p); R(c, "#4a2a1a", X + p, Y - 5 * p, W - 2 * p, 5 * p); } },
  stove: { back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#4b5563", x0, Y - 16 * p, x1 - x0, 16 * p); R(c, "#1f2937", x0 + p, Y - 12 * p, x1 - x0 - 2 * p, 8 * p); R(c, "#f97316", x0 + 2 * p, Y - 17 * p, 4 * p, p); R(c, STEEL_D, x0 + 2 * p, Y - 20 * p, 5 * p, 3 * p); puff(c, x0 + 4 * p, Y - 21 * p, p, t, (a?.i || 0) * 0.13); } },
  locker: { back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#3f4a2a", x0, Y - 34 * p, x1 - x0, 34 * p); R(c, "#2a3218", x0 + (x1 - x0) / 2, Y - 34 * p, p, 34 * p); R(c, "#9ca3af", x0 + 2 * p, Y - 22 * p, p, 3 * p); } },
  dummy: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); const k = osc(t, 1.1, (a?.i || 0) * 0.21) > 0.7 ? p : 0; R(c, "#a16207", x0 + 3 * p + k, Y - 34 * p, 6 * p, 6 * p); R(c, "#854d0e", x0 + 2 * p + k, Y - 28 * p, 8 * p, 14 * p); R(c, "#4a3018", x0 + 5 * p, Y - 14 * p, 2 * p, 14 * p); } },
  cot: { front(c, X, Y, W, p) { R(c, "#6b7280", X + p, Y - 9 * p, W - 2 * p, 2 * p); R(c, "#4b5563", X + p, Y - 7 * p, p, 7 * p); R(c, "#4b5563", X + W - 2 * p, Y - 7 * p, p, 7 * p); } },
  belt: { front(c, X, Y, W, p, t) { R(c, "#3a3a3a", X, Y - 17 * p, W + 1, 4 * p); R(c, "#1a1a1a", X, Y - 13 * p, W + 1, 13 * p); const o = (t * 14 * p) % (9 * p); for (let bx = X - 9 * p + o; bx < X + W; bx += 9 * p) if (bx > X - 4 * p) R(c, "#7f1d1d", Math.max(X, bx), Y - 20 * p, 4 * p, 3 * p); R(c, "#2a2a2a", X, Y - 5 * p, W + 1, p); } },
  valvePipe: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, STEEL_D, x0 + 4 * p, Y - 44 * p, 4 * p, 44 * p); R(c, STEEL_D, x0 + 4 * p, Y - 26 * p, x1 - x0 - 4 * p, 3 * p); const cx = x0 + 6 * p, cy = Y - 22 * p, an = t * 1.4 + (a?.i || 0); c.strokeStyle = "#f87171"; c.lineWidth = Math.max(1, p); c.beginPath(); c.arc(cx, cy, 4 * p, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(cx + Math.cos(an) * 4 * p, cy + Math.sin(an) * 4 * p); c.lineTo(cx - Math.cos(an) * 4 * p, cy - Math.sin(an) * 4 * p); c.moveTo(cx + Math.cos(an + 1.57) * 4 * p, cy + Math.sin(an + 1.57) * 4 * p); c.lineTo(cx - Math.cos(an + 1.57) * 4 * p, cy - Math.sin(an + 1.57) * 4 * p); c.stroke(); R(c, blink(t, 0.7, (a?.i || 0) * 0.2) ? "#4ade80" : "#14532d", x1 - 4 * p, Y - 32 * p, 2 * p, 2 * p); },
  },
  drum: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); R(c, "#a16207", x0 + 2 * p, Y - 18 * p, 10 * p, 18 * p); R(c, "#1a1a1a", x0 + 2 * p, Y - 12 * p, 10 * p, 2 * p); R(c, "#4ade80", x0 + 4 * p, Y - 19 * p, 6 * p, p); } },
  anvil: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); R(c, "#1f2937", x0 + 2 * p, Y - 16 * p, 12 * p, 4 * p); R(c, "#111827", x0 + 5 * p, Y - 12 * p, 6 * p, 12 * p); const hot = blink(t, 1.2, (a?.i || 0) * 0.3); R(c, hot ? "#f97316" : "#b45309", x0 + 5 * p, Y - 17 * p, 6 * p, p); if (hot) R(c, "#fbbf24", x0 + 8 * p, Y - 20 * p, p, p); } },
  slagTrough: { front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); R(c, "#1f2937", x0 - 2 * p, Y - 10 * p, x1 - x0 + 2 * p, 10 * p); R(c, `rgba(249,115,22,${(0.6 + 0.3 * osc(t, 0.8, (a?.i || 0) * 0.2)).toFixed(3)})`, x0, Y - 11 * p, x1 - x0 - 2 * p, 2 * p); } },
  serverRack: { back(c, X, Y, W, p, t) { repeat(2, k => { const rx = X + p + k * (W / 2); R(c, "#111827", rx, Y - 42 * p, W / 2 - 2 * p, 42 * p); for (let r = 0; r < 9; r++) R(c, ((r + k + Math.floor(t * 3)) % 5) ? "#1f4a2c" : "#4ade80", rx + 2 * p, Y - 40 * p + r * 4 * p, 2 * p, p); }); } },
  terminal: {
    back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); const x = personX(X, W, a); R(c, "#1a1a1a", x - 4 * p, Y - 10 * p, 9 * p, 2 * p); R(c, STEEL_D, x, Y - 8 * p, p, 8 * p); screen(c, x0 + 2 * p, Y - 28 * p, 10 * p, 9 * p, t, x0); },
    front(c, X, Y, W, p, t, a) { PROP.desk.front(c, X, Y, W, p, t, a); },
  },
  crate: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); const cols = ["#b45309", "#1d4ed8", "#15803d"]; R(c, cols[(a?.i || 0) % 3], x0 + p, Y - 12 * p, 12 * p, 12 * p); R(c, "rgba(0,0,0,0.3)", x0 + p, Y - 7 * p, 12 * p, p); R(c, cols[((a?.i || 0) + 1) % 3], x0 + 3 * p, Y - 20 * p, 9 * p, 8 * p); } },
  craneLever: { back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p); R(c, "#374151", x0 + 2 * p, Y - 16 * p, 10 * p, 16 * p); const an = -1.2 + 0.5 * osc(t, 0.3, (a?.i || 0) * 0.3); c.strokeStyle = "#fbbf24"; c.lineWidth = Math.max(1, p); c.beginPath(); c.moveTo(x0 + 5 * p, Y - 16 * p); c.lineTo(x0 + 5 * p + Math.cos(an) * 8 * p, Y - 16 * p + Math.sin(an) * 8 * p); c.stroke(); R(c, blink(t, 0.6) ? "#4ade80" : "#14532d", x0 + 9 * p, Y - 12 * p, 2 * p, 2 * p); } },
  vat: {
    back(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p); const vw = x1 - x0; R(c, "#94a3b8", x0, Y - 30 * p, vw, 30 * p); R(c, "#1f7a44", x0 + p, Y - 26 * p, vw - 2 * p, 24 * p); R(c, "#3fbf6f", x0 + p, Y - 26 * p, vw - 2 * p, 2 * p); for (let k = 0; k < 3; k++) { const f = ((t * 0.6 + k / 3 + (a?.i || 0) * 0.17) % 1); R(c, "#bbf7d0", x0 + 2 * p + ((k * 5) % Math.max(1, vw / p - 4)) * p, Y - 4 * p - f * 20 * p, p, p); } R(c, "#64748b", x0, Y - 31 * p, vw, 2 * p); puff(c, x0 + vw / 2, Y - 32 * p, p, t, (a?.i || 0) * 0.23, "rgba(187,247,208,"); },
  },
  mop: { back() {} },
  lamppost: { back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#374151", x - p, Y - 50 * p, 2 * p, 50 * p); R(c, "#fbbf24", x - 3 * p, Y - 52 * p, 6 * p, 3 * p); } },
  streetBench: { back(c, X, Y, W, p, t, a) { PROP.parkBench.back(c, X, Y, W, p, t, a); } },
};
