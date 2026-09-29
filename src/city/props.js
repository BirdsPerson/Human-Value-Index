// Room interiors for the cutaway (Fallout Shelter / SimTower): every place type gets its
// own furniture, drawn procedurally in pixel blocks so it reads at small sizes, plus
// anchors (where people stand or sit) so a room never piles its occupants in one heap.
// Drawing takes a 2D context; the type table and anchors are pure (node-testable).

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
  "allotment": "park", "night-market": "market", "the-plaza": "street",
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
  chapel: ["#1c1822", "#302838"], park: ["#0f1f0f", "#1f3a1c"], market: ["#241c10", "#3e3018"], school: ["#1e2016", "#363a26"],
  lofts: ["#1c1a18", "#302c28"], line: ["#200f0f", "#381c1c"], reactor: ["#0f2014", "#1a3a24"], foundry: ["#26140c", "#442414"],
  racks: ["#0e1618", "#1a2a2e"], docks: ["#0f1a22", "#1a2e3a"], vats: ["#0f2014", "#1c3a22"], barracks: ["#1a1c16", "#2e3226"],
  cells: ["#181818", "#2a2a2a"], canteen: ["#221a12", "#3a2c1e"], hab: ["#18181a", "#2c2c30"], street: ["#101410", "#222822"],
};

// ---- anchors ----------------------------------------------------------------------
// Where people go in a room of w x h px with sprites spriteW wide: a front row on the
// floor, and for rooms tall enough a back row set slightly up and smaller. Returned back
// to front ({x: feet centre, y: feet, s: scale, back}), spaced so no two overlap.
const SEATED = new Set(["cafe", "bar", "diner", "lecture", "school", "theatre", "concert", "canteen", "chapel", "casino", "lounge", "assembly", "tribunal", "exchange", "office", "press"]);
export function anchorsFor(type, w, h, spriteW) {
  const gap = Math.max(2, spriteW * 0.25);
  const step = spriteW + gap;
  const margin = Math.max(spriteW * 0.6, w * 0.06);
  const inner = Math.max(0, w - margin * 2);
  const nFront = Math.max(1, Math.floor((inner + gap) / step));
  const row = (n, y, s, back) => {
    const span = n * step - gap;
    const x0 = margin + (inner - span) / 2 + spriteW / 2;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y, s, back }));
  };
  const out = [];
  // A back row only where the room is deep enough to read as depth.
  if (h > spriteW * 2.4 && type !== "street" && type !== "cells") {
    const s = 0.8, nb = Math.max(1, Math.floor((inner + gap) / (step * 0.8)) - 1);
    const r = row(nb, h - 4 - h * 0.14, s, true);
    // offset half a step so the back row shows between the front row's heads
    for (const a of r) a.x += step * 0.4;
    out.push(...r.filter(a => a.x < w - margin));
  }
  out.push(...row(nFront, h - 2, 1, false));
  return out.map(a => ({ ...a, sit: SEATED.has(type) && !a.back }));
}

// ---- drawing ----------------------------------------------------------------------
// All coordinates in px inside the room box; u = one pixel-art unit (>=1).
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }

export function drawRoom(c, placeId, x, y, w, h, u = 2, opts = {}) {
  const type = typeOf(placeId);
  const [wall, floor] = LOOK[type] || LOOK.office;
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  R(c, wall, x, y, w, h);
  R(c, floor, x, y + h - 3 * u, w, 3 * u);
  R(c, "rgba(0,0,0,0.25)", x, y + h - 3 * u, w, u);
  const fn = DRAW[type] || DRAW.office;
  fn(c, x, y, w, h, u, opts);
  // ceiling light strip: warm where people live, cold where the machine does
  R(c, opts.lit === false ? "rgba(255,255,255,0.03)" : "rgba(255,220,150,0.06)", x, y, w, 2 * u);
  c.restore();
}

// helpers shared by the types
const floorY = (y, h, u) => y + h - 3 * u;
function repeat(n, fn) { for (let i = 0; i < n; i++) fn(i); }
function across(x, w, spacing, fn) { const n = Math.max(1, Math.floor(w / spacing)); const off = (w - (n - 1) * spacing) / 2; repeat(n, i => fn(x + off + i * spacing, i)); }

const DRAW = {
  bar(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    // back shelf of bottles
    R(c, "#3a2414", x + 4 * u, y + h * 0.28, w - 8 * u, 2 * u);
    across(x + 6 * u, w - 12 * u, 5 * u, (bx, i) => R(c, ["#4ade80", "#fbbf24", "#f87171", "#60a5fa"][i % 4], bx, y + h * 0.28 - 5 * u, 2 * u, 5 * u));
    // neon sign
    R(c, "#f472b6", x + w * 0.62, y + 4 * u, w * 0.22, 3 * u);
    R(c, "rgba(244,114,182,0.18)", x + w * 0.58, y + 2 * u, w * 0.3, 7 * u);
    // counter
    R(c, "#5a3418", x + 2 * u, fy - 9 * u, w * 0.72, 3 * u);
    R(c, "#3a2010", x + 3 * u, fy - 6 * u, w * 0.7, 6 * u);
    // stools
    across(x + 4 * u, w * 0.7, 9 * u, sx => { R(c, "#9a7a4a", sx, fy - 5 * u, 4 * u, u); R(c, "#6a5030", sx + 1.5 * u, fy - 4 * u, u, 4 * u); });
  },
  lounge(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#10222e", x, y + 2 * u, w, h * 0.45);   // night skyline through glass
    across(x, w, 7 * u, (sx, i) => R(c, "#0a141c", sx, y + h * 0.2 - (i % 3) * 3 * u, 5 * u, h * 0.3));
    across(x, w, 11 * u, sx => R(c, "#fbbf24", sx + 2 * u, y + h * 0.3, u, u));
    across(x + 6 * u, w - 12 * u, 16 * u, sx => { R(c, "#5a2a6a", sx, fy - 5 * u, 12 * u, 5 * u); R(c, "#7a3a8a", sx, fy - 7 * u, 12 * u, 2 * u); });
  },
  cafe(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    // espresso machine on the counter
    R(c, "#5a3a22", x + 2 * u, fy - 9 * u, w * 0.35, 9 * u);
    R(c, "#b8b8b8", x + 4 * u, fy - 16 * u, 8 * u, 7 * u);
    R(c, "#e5e5e5", x + 5 * u, fy - 15 * u, 6 * u, 2 * u);
    R(c, "#f87171", x + 6 * u, fy - 11 * u, 2 * u, u);
    // menu board
    R(c, "#101010", x + w * 0.45, y + 5 * u, w * 0.3, h * 0.25);
    repeat(3, i => R(c, "#e5e5e5", x + w * 0.47, y + 8 * u + i * 3 * u, w * 0.2, u));
    // small round tables
    across(x + w * 0.42, w * 0.56, 12 * u, tx => { R(c, "#8a6a42", tx, fy - 6 * u, 7 * u, 2 * u); R(c, "#5a4428", tx + 3 * u, fy - 4 * u, u, 4 * u); });
  },
  diner(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#e5e5e5", x, fy - 4 * u, w, u);   // chrome trim
    across(x + 3 * u, w - 6 * u, 14 * u, bx => { R(c, "#b91c1c", bx, fy - 8 * u, 10 * u, 5 * u); R(c, "#e5e5e5", bx + 2 * u, fy - 10 * u, 6 * u, 2 * u); });
    R(c, "#fbbf24", x + w * 0.35, y + 3 * u, w * 0.3, 3 * u);   // OPEN sign
    across(x, w, 9 * u, wx => R(c, "#1f3040", wx + u, y + 8 * u, 6 * u, h * 0.25));   // windows
  },
  canteen(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#6a6a62", x + 2 * u, fy - 10 * u, w * 0.3, 3 * u);   // serving line
    repeat(3, i => R(c, "#8a8a80", x + 4 * u + i * 6 * u, fy - 12 * u, 4 * u, 2 * u));
    across(x + w * 0.36, w * 0.62, 16 * u, tx => R(c, "#4a4038", tx, fy - 6 * u, 13 * u, 2 * u));
  },
  lab(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 18 * u, (bx, i) => {
      R(c, "#cfd8dc", bx, fy - 8 * u, 14 * u, 2 * u);
      R(c, "#546e7a", bx + u, fy - 6 * u, 12 * u, 6 * u);
      R(c, "#22d3ee", bx + 2 * u, fy - 12 * u, 2 * u, 4 * u);   // flasks
      R(c, "#4ade80", bx + 6 * u, fy - 11 * u, 2 * u, 3 * u);
      R(c, i % 2 ? "#f472b6" : "#a78bfa", bx + 10 * u, fy - 12 * u, 2 * u, 4 * u);
    });
    // glowing console on the back wall
    R(c, "#0b2a2a", x + w * 0.35, y + 4 * u, w * 0.3, h * 0.25);
    repeat(4, i => R(c, "#22d3ee", x + w * 0.37, y + 6 * u + i * 2.5 * u, w * (0.08 + (i % 3) * 0.06), u));
  },
  lecture(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#1f3a2a", x + w * 0.25, y + 4 * u, w * 0.5, h * 0.3);   // board
    R(c, "#e5e5e5", x + w * 0.3, y + 7 * u, w * 0.2, u);
    R(c, "#e5e5e5", x + w * 0.3, y + 10 * u, w * 0.32, u);
    repeat(2, r => R(c, "#4a3a28", x + 2 * u, fy - (3 + r * 5) * u, w - 4 * u, 2 * u));   // tiered benches
  },
  school(c, x, y, w, h, u) {
    DRAW.lecture(c, x, y, w, h, u);
    R(c, "#fbbf24", x + 3 * u, y + 5 * u, 4 * u, 4 * u);   // apple on the desk, as regulation demands
  },
  assembly(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#3a4a42", x + w * 0.4, fy - 12 * u, w * 0.2, 12 * u);   // podium
    R(c, "#4ade80", x + w * 0.47, fy - 15 * u, w * 0.06, 3 * u);
    across(x, w, 10 * u, bx => R(c, "#2a3a32", bx, y + 3 * u, 2 * u, h * 0.5));   // banners
  },
  tribunal(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#5a3a22", x + w * 0.3, fy - 14 * u, w * 0.4, 14 * u);   // the bench
    R(c, "#7a5232", x + w * 0.3, fy - 15 * u, w * 0.4, 2 * u);
    R(c, "#fbbf24", x + w * 0.48, y + 3 * u, w * 0.04, 6 * u);   // the scales
    R(c, "#fbbf24", x + w * 0.42, y + 5 * u, w * 0.16, u);
  },
  office(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 14 * u, bx => { R(c, "#3a4a42", bx, fy - 7 * u, 10 * u, 2 * u); R(c, "#0b2a1a", bx + 2 * u, fy - 12 * u, 6 * u, 5 * u); R(c, "#4ade80", bx + 3 * u, fy - 11 * u, 4 * u, u); });
  },
  exec(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#6a4a22", x + w * 0.3, fy - 7 * u, w * 0.4, 3 * u);   // one enormous desk
    R(c, "#3a2a14", x + w * 0.32, fy - 4 * u, w * 0.36, 4 * u);
    R(c, "#10222e", x + 3 * u, y + 3 * u, w - 6 * u, h * 0.35);   // the view
    across(x + 3 * u, w - 6 * u, 8 * u, sx => R(c, "#fbbf24", sx, y + h * 0.3, u, u));
  },
  suite(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#7a3a3a", x + 3 * u, fy - 6 * u, 16 * u, 6 * u);   // chaise
    R(c, "#e5d5b5", x + 3 * u, fy - 8 * u, 16 * u, 2 * u);
    R(c, "#fbbf24", x + w * 0.6, y + 4 * u, 3 * u, 3 * u);   // chandelier
    R(c, "rgba(251,191,36,0.15)", x + w * 0.55, y + 3 * u, 13 * u, 9 * u);
    R(c, "#2a3a2a", x + w - 12 * u, fy - 14 * u, 3 * u, 14 * u);   // plant
    R(c, "#4ade80", x + w - 14 * u, fy - 18 * u, 7 * u, 5 * u);
  },
  studio(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 16 * u, (ex, i) => {
      R(c, "#8a6a42", ex + 4 * u, fy - 16 * u, u, 16 * u); R(c, "#8a6a42", ex, fy - 2 * u, 9 * u, u);   // easel
      R(c, "#f5f0e0", ex + u, fy - 16 * u, 7 * u, 8 * u);
      R(c, ["#f87171", "#60a5fa", "#fbbf24"][i % 3], ex + 2 * u, fy - 14 * u, 3 * u, 3 * u);
    });
  },
  gallery(c, x, y, w, h, u) {
    across(x + 4 * u, w - 8 * u, 14 * u, (fx, i) => {
      R(c, "#c9a227", fx, y + h * 0.25, 10 * u, 8 * u);
      R(c, ["#1e3a5f", "#5f1e1e", "#1e5f3a", "#3a1e5f"][i % 4], fx + u, y + h * 0.25 + u, 8 * u, 6 * u);
      R(c, "rgba(255,240,200,0.12)", fx - u, y + h * 0.25 - 4 * u, 12 * u, 3 * u);   // spotlights
    });
    R(c, "#5a5048", x + w * 0.45, y + h - 9 * u, w * 0.1, 6 * u);   // plinth
  },
  theatre(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#8a1c1c", x, y, w * 0.12, h);   // curtains
    R(c, "#8a1c1c", x + w * 0.88, y, w * 0.12, h);
    R(c, "#5a3a22", x + w * 0.12, fy - 5 * u, w * 0.76, 5 * u);   // stage
    R(c, "rgba(251,191,36,0.12)", x + w * 0.3, y, w * 0.4, h - 5 * u);   // spot
  },
  concert(c, x, y, w, h, u) {
    DRAW.theatre(c, x, y, w, h, u);
    const fy = floorY(y, h, u);
    R(c, "#101010", x + w * 0.2, fy - 12 * u, 12 * u, 7 * u);   // grand piano
    R(c, "#101010", x + w * 0.2 + 2 * u, fy - 5 * u, u, 3 * u);
  },
  library(c, x, y, w, h, u) {
    across(x + 2 * u, w - 4 * u, 12 * u, bx => {
      R(c, "#4a3018", bx, y + 4 * u, 10 * u, h - 8 * u);
      repeat(Math.max(1, Math.floor((h - 10 * u) / (5 * u))), r => repeat(4, k => R(c, ["#7f1d1d", "#1e3a5f", "#3f6212", "#78350f"][(r + k) % 4], bx + u + k * 2.2 * u, y + 5 * u + r * 5 * u, 2 * u, 4 * u)));
    });
  },
  clock(c, x, y, w, h, u) {
    const cx = x + w / 2, cy = y + h * 0.45, r = Math.min(w, h) * 0.3;
    c.fillStyle = "#e5dcc5"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#1a1a1a"; c.lineWidth = Math.max(1, u); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - r * 0.8); c.moveTo(cx, cy); c.lineTo(cx + r * 0.55, cy); c.stroke();
    across(x + 3 * u, w - 6 * u, 10 * u, gx => R(c, "#8a7a4a", gx, y + h - 10 * u, 5 * u, 5 * u));   // gears
  },
  exchange(c, x, y, w, h, u, o) {
    const fy = floorY(y, h, u);
    R(c, "#050a05", x + 2 * u, y + 3 * u, w - 4 * u, 6 * u);   // ticker
    const t = (o.t || 0) * 12;
    across(x + 2 * u, w - 4 * u, 5 * u, (tx, i) => R(c, (i + Math.floor(t)) % 3 ? "#4ade80" : "#f87171", tx, y + 5 * u, 3 * u, 2 * u));
    across(x + 3 * u, w - 6 * u, 12 * u, bx => { R(c, "#2a3a44", bx, fy - 7 * u, 9 * u, 2 * u); R(c, "#0b1a24", bx + u, fy - 12 * u, 7 * u, 5 * u); R(c, "#60a5fa", bx + 2 * u, fy - 11 * u, 5 * u, u); });
  },
  vault(c, x, y, w, h, u) {
    const cx = x + w * 0.7, cy = y + h * 0.5, r = Math.min(w * 0.18, h * 0.35);
    c.fillStyle = "#6b7280"; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#374151"; c.beginPath(); c.arc(cx, cy, r * 0.55, 0, Math.PI * 2); c.fill();
    R(c, "#9ca3af", cx - r * 0.1, cy - r * 0.7, r * 0.2, r * 1.4);
    const fy = floorY(y, h, u);
    repeat(3, i => R(c, "#c9a227", x + 4 * u + i * 6 * u, fy - 4 * u, 5 * u, 4 * u));   // bullion
  },
  casino(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 18 * u, (tx, i) => {
      if (i % 2) { R(c, "#7a1a1a", tx, fy - 16 * u, 8 * u, 16 * u); R(c, "#fbbf24", tx + u, fy - 14 * u, 6 * u, 3 * u); }   // slot machine
      else { R(c, "#14532d", tx, fy - 7 * u, 14 * u, 3 * u); R(c, "#3a2a1a", tx + 6 * u, fy - 4 * u, 2 * u, 4 * u); }   // green felt
    });
    R(c, "rgba(251,191,36,0.1)", x, y, w, 4 * u);
  },
  press(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 13 * u, bx => { R(c, "#4a4038", bx, fy - 7 * u, 10 * u, 2 * u); R(c, "#1a1a1a", bx + 2 * u, fy - 11 * u, 6 * u, 4 * u); R(c, "#e5e5e5", bx + 3 * u, fy - 13 * u, 4 * u, 2 * u); });
    R(c, "#e5e5e5", x + w * 0.5, y + 4 * u, w * 0.22, h * 0.2);   // front page on the wall
    R(c, "#1a1a1a", x + w * 0.52, y + 6 * u, w * 0.18, u);
  },
  stadium(c, x, y, w, h, u) {
    R(c, "#1f5f2a", x, y + h * 0.5, w, h * 0.5);   // pitch
    R(c, "#e5e5e5", x + w / 2, y + h * 0.5, u, h * 0.5);
    repeat(3, r => R(c, "#2a3a2a", x, y + 3 * u + r * 4 * u, w, 2 * u));   // stands
    across(x, w, 4 * u, (sx, i) => R(c, ["#f87171", "#60a5fa", "#fbbf24", "#e5e5e5"][i % 4], sx, y + 4 * u + (i % 3) * 4 * u, u, u));   // crowd
  },
  gym(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 16 * u, (gx, i) => {
      if (i % 2) { R(c, "#374151", gx, fy - 4 * u, 12 * u, 4 * u); R(c, "#111", gx + u, fy - 5 * u, 10 * u, u); }   // treadmill
      else { R(c, "#9ca3af", gx, fy - 10 * u, 12 * u, u); R(c, "#111", gx, fy - 12 * u, 2 * u, 5 * u); R(c, "#111", gx + 10 * u, fy - 12 * u, 2 * u, 5 * u); }   // barbell rack
    });
    R(c, "#e5e5e5", x + 3 * u, y + 4 * u, w * 0.4, u);   // mirror line
  },
  ward(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 16 * u, bx => {
      R(c, "#e5e7eb", bx, fy - 6 * u, 12 * u, 3 * u); R(c, "#93c5fd", bx, fy - 7 * u, 4 * u, u);   // bed + pillow
      R(c, "#6b7280", bx, fy - 3 * u, u, 3 * u); R(c, "#6b7280", bx + 11 * u, fy - 3 * u, u, 3 * u);
      R(c, "rgba(147,197,253,0.25)", bx + 13 * u, y + 3 * u, 2 * u, h - 6 * u);   // curtain
    });
    R(c, "#f87171", x + 3 * u, y + 4 * u, 2 * u, 6 * u); R(c, "#f87171", x + u, y + 6 * u, 6 * u, 2 * u);   // the cross
  },
  chapel(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#60a5fa", x + w * 0.44, y + 3 * u, w * 0.12, h * 0.4);   // stained glass
    R(c, "#fbbf24", x + w * 0.47, y + 5 * u, w * 0.06, h * 0.12);
    across(x + 3 * u, w - 6 * u, 13 * u, px => R(c, "#4a3222", px, fy - 5 * u, 10 * u, 2 * u));   // pews
    R(c, "#4ade80", x + w * 0.49, y + h * 0.5, w * 0.02, 3 * u);   // the uptime lamp
  },
  park(c, x, y, w, h, u) {
    R(c, "#10240f", x, y, w, h);
    across(x + 2 * u, w - 4 * u, 14 * u, (tx, i) => { R(c, "#4a3018", tx + 3 * u, y + h - 10 * u, 2 * u, 7 * u); R(c, i % 2 ? "#22c55e" : "#15803d", tx, y + h - 17 * u, 8 * u, 8 * u); });
    R(c, "#6b4a2a", x + w * 0.4, y + h - 6 * u, 10 * u, 2 * u);   // bench
  },
  market(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 16 * u, (sx, i) => {
      repeat(4, k => R(c, k % 2 ? "#e5e5e5" : ["#f87171", "#60a5fa", "#fbbf24"][i % 3], sx + k * 3 * u, fy - 16 * u, 3 * u, 3 * u));   // awning
      R(c, "#6b4a2a", sx, fy - 7 * u, 12 * u, 3 * u);
      R(c, "#f97316", sx + 2 * u, fy - 9 * u, 2 * u, 2 * u); R(c, "#4ade80", sx + 6 * u, fy - 9 * u, 2 * u, 2 * u);
    });
  },
  lofts(c, x, y, w, h, u) { DRAW.hab(c, x, y, w, h, u, { warm: true }); },
  hab(c, x, y, w, h, u, o = {}) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 14 * u, (bx, i) => {
      R(c, "#3a3a44", bx, fy - 5 * u, 11 * u, 3 * u);   // bunk
      R(c, "#3a3a44", bx, fy - 12 * u, 11 * u, 2 * u);
      R(c, o.warm ? "#c2a878" : "#6b7280", bx, fy - 6 * u, 3 * u, u);
      R(c, i % 3 ? "#fbbf24" : "#4b5563", bx + 12 * u, y + 4 * u, u, 2 * u);   // lamp, on or off
    });
  },
  line(c, x, y, w, h, u, o) {
    const fy = floorY(y, h, u);
    R(c, "#3a3a3a", x, fy - 6 * u, w, 3 * u);   // conveyor
    const t = ((o.t || 0) * 20) % (8 * u);
    across(x + t, w, 8 * u, bx => R(c, "#7f1d1d", bx, fy - 9 * u, 4 * u, 3 * u));
    R(c, "#f87171", x + w - 8 * u, y + 3 * u, 5 * u, 2 * u);   // PROCESSING lamp
  },
  reactor(c, x, y, w, h, u) {
    const cx = x + w * 0.5;
    R(c, "#14532d", cx - 8 * u, y + 4 * u, 16 * u, h - 8 * u);
    R(c, "#4ade80", cx - 5 * u, y + 7 * u, 10 * u, h - 14 * u);
    R(c, "rgba(74,222,128,0.2)", cx - 14 * u, y, 28 * u, h);
    across(x + 2 * u, w * 0.3, 6 * u, px => R(c, "#374151", px, y + 3 * u, 2 * u, h - 6 * u));   // pipes
  },
  foundry(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    R(c, "#f97316", x + w * 0.3, fy - 6 * u, w * 0.4, 3 * u);   // pour
    R(c, "rgba(249,115,22,0.25)", x + w * 0.25, y, w * 0.5, h);
    R(c, "#374151", x + w * 0.35, y + 3 * u, w * 0.3, 8 * u);   // crucible
  },
  racks(c, x, y, w, h, u, o) {
    across(x + 2 * u, w - 4 * u, 9 * u, (rx, i) => {
      R(c, "#111827", rx, y + 3 * u, 7 * u, h - 6 * u);
      repeat(Math.max(2, Math.floor((h - 8 * u) / (3 * u))), k => R(c, ((k + i + Math.floor((o.t || 0) * 4)) % 5) ? "#4ade80" : "#fbbf24", rx + u, y + 5 * u + k * 3 * u, u, u));
    });
  },
  docks(c, x, y, w, h, u) {
    R(c, "#0c2a3a", x, y + h * 0.6, w, h * 0.4);   // data water
    across(x, w, 6 * u, wx => R(c, "#22d3ee", wx, y + h * 0.7, 3 * u, u));
    repeat(3, i => R(c, ["#b45309", "#1d4ed8", "#15803d"][i], x + 4 * u + i * 9 * u, y + h * 0.6 - 7 * u, 8 * u, 7 * u));   // containers
  },
  vats(c, x, y, w, h, u) {
    across(x + 3 * u, w - 6 * u, 12 * u, vx => { R(c, "#94a3b8", vx, y + 4 * u, 9 * u, h - 8 * u); R(c, "#4ade80", vx + u, y + h * 0.45, 7 * u, h * 0.5 - 5 * u); });
  },
  barracks(c, x, y, w, h, u) {
    const fy = floorY(y, h, u);
    across(x + 3 * u, w - 6 * u, 12 * u, bx => { R(c, "#3f4a2a", bx, fy - 4 * u, 10 * u, 2 * u); R(c, "#4b5563", bx + 11 * u, fy - 14 * u, 2 * u, 14 * u); });
  },
  cells(c, x, y, w, h, u) {
    across(x + u, w - 2 * u, 3 * u, bx => R(c, "#6b7280", bx, y + 2 * u, u, h - 5 * u));   // bars
    R(c, "#6b7280", x, y + 2 * u, w, u);
  },
  street(c, x, y, w, h, u) {
    R(c, "#1a1f1a", x, y + h - 6 * u, w, 3 * u);   // kerb
    across(x + 4 * u, w - 8 * u, 18 * u, lx => { R(c, "#374151", lx, y + 4 * u, u, h - 9 * u); R(c, "#fbbf24", lx - u, y + 3 * u, 3 * u, 2 * u); });   // lamps
  },
};
export const DRAWN_TYPES = Object.keys(DRAW);
