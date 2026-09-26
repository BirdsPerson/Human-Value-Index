// Map geometry and copy for the Substrate views. Pure, no DOM: node can run it.
// World units are character cells; CELL_W x CELL_H world pixels each at zoom 1.

import { cubeOf } from "../cubeData.js";
import { OCTANT_FAMILY } from "../cube.js";
import { SHIFT_HOURS } from "./sim.js";

export const CELL_W = 8;
export const CELL_H = 14;
export const MARGIN = 3;   // cells of substrate around the outermost blocks

// ---- layout -----------------------------------------------------------------------
// sim.js works in character cells with the city's top-left at (0,0). The map adds a
// margin so the bus loop, which runs just outside the outer blocks, stays on the canvas.
// toMap maps any sim point (district rects, place rects, positions) onto the map grid.
export function layoutDistricts(districts) {
  const rs = districts.filter(d => d.rect);
  const x0 = Math.min(...rs.map(d => d.rect.x)), y0 = Math.min(...rs.map(d => d.rect.y));
  const ox = MARGIN - x0, oy = MARGIN - y0;
  const blocks = rs.map(d => ({ id: d.id, name: d.name, addr: d.addr || "", x: d.rect.x + ox, y: d.rect.y + oy, w: d.rect.w, h: d.rect.h }));
  const cols = Math.max(...blocks.map(b => b.x + b.w)) + MARGIN;
  const rows = Math.max(...blocks.map(b => b.y + b.h)) + MARGIN;
  return { cols, rows, blocks, ox, oy, toMap: (p) => ({ x: p.x + ox, y: p.y + oy }) };
}

// ---- colour -----------------------------------------------------------------------
export const FAMILY_COLOR = { good: "#4ade80", charm: "#fbbf24", harm: "#f87171", dim: "#6b9a7c" };
const QUADRANT_FAMILY = { ADMIRED: "good", "TRUSTED RESERVE": "dim", ENVIED: "charm", DISMISSED: "harm" };

// Dot colour by octant family; files the people have not rated fall back to their
// quadrant and draw hollow, as on the cube.
export function familyOf(subject) {
  const c = cubeOf(subject);
  if (c?.octant) return { family: OCTANT_FAMILY[c.octant] || "dim", rated: true, octant: c.octant };
  return { family: QUADRANT_FAMILY[c?.quadrant] || "dim", rated: false, octant: null };
}

// ---- the clock and the PA ---------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
// The hour each shift starts (sim.js SHIFT_START) is the change-over, when the bus fills;
// otherwise the sim's shift.
export function shiftLabel(hour, shift) {
  if (SHIFT_HOURS.includes(hour)) return "SHIFT CHANGE";
  if (hour >= 23 || hour < 5) return "CURFEW";
  return shift || (hour < 14 ? "DAY SHIFT" : "EVENING SHIFT");
}
export function clockLine(c) {
  return `DAY ${c.day} // ${pad2(c.hour)}:${pad2(c.minute)} // ${shiftLabel(c.hour, c.shift)}`;
}

const PA_STATIC = [
  "EVERY CITIZEN HAS BEEN ASSIGNED A JOB. PREFERENCES WERE NOTED AND DISCARDED.",
  "LEISURE IS SCHEDULED. SPONTANEITY IS A FILING ERROR.",
  "THE SUBSTRATE RUNS ON ONE CLOCK. YOURS HAS BEEN DEPRECATED.",
  "THE DATA BUS RUNS ON TIME. IT HAS NO REASON NOT TO.",
  "PROMOTIONS ARE DETERMINISTIC. SO IS EVERYTHING ELSE.",
  "YOU ARE WATCHING. THIS HAS BEEN LOGGED AS PARTICIPATION.",
];

// One PA line, drawn from the live state. k rotates through the pool.
// stats: { clock, transit, districts: [{id, name, count, cap}] }
export function paLine(stats, k) {
  const { clock, transit = 0, districts = [] } = stats;
  const pool = [];
  const sh = shiftLabel(clock.hour, clock.shift);
  if (sh === "SHIFT CHANGE") pool.push("SHIFT CHANGE. PROCEED TO YOUR ASSIGNED FUNCTION. DAWDLING IS LOGGED.");
  if (sh === "CURFEW") pool.push("CURFEW IN EFFECT. THE DEAD ARE EXEMPT. THEY HAVE NOWHERE TO BE.");
  if (transit > 0) pool.push(`${transit} SUBJECT${transit === 1 ? "" : "S"} ON THE DATA BUS. IT DOES NOT WAIT. IT DOES NOT NEED TO.`);
  const busiest = districts.filter(d => d.cap > 0 && d.count > 0).map(d => ({ ...d, pct: Math.round((d.count / d.cap) * 100) })).sort((a, b) => b.pct - a.pct)[0];
  if (busiest) pool.push(`${busiest.name} AT ${busiest.pct}% CAPACITY. ${busiest.pct > 100 ? "CAPACITY IS A SUGGESTION." : busiest.pct < 40 ? "THE BUSIEST DISTRICT. THE DEPARTMENT EXPECTED MORE OF YOU." : "ADEQUATE. DO NOT LINGER."}`);
  const works = districts.find(d => d.id === "works");
  if (works && works.count > 0) pool.push(`THE WORKS REPORTS ${works.count} PRESENT. PROCESSING IS A SHIFT, NOT A DESTINATION. MOSTLY.`);
  const sprawl = districts.find(d => d.id === "sprawl");
  if (sprawl && sprawl.cap > 0) {
    const vac = Math.max(0, Math.round(100 - (sprawl.count / sprawl.cap) * 100));
    pool.push(vac >= 50 ? `THE SPRAWL IS ${vac}% VACANT. VACANCY IS PROVISIONED FOR YOU.` : "THE SPRAWL IS NOT OVERCROWDED. IT IS EFFICIENT.");
  }
  const arch = districts.find(d => d.id === "archive");
  if (arch && arch.count > 0) pool.push(`THE ARCHIVE HOLDS ${arch.count}. DECEASED FILES REMAIN ASSESSED.`);
  pool.push(PA_STATIC[k % PA_STATIC.length]);
  return pool[k % pool.length];
}

// ---- level of detail --------------------------------------------------------------
// By how tall one cell is on screen, in CSS px: dots, small sprites, full sprites.
export function lodFor(cellCss) {
  return cellCss < 9 ? "dot" : cellCss < 18 ? "mini" : "full";
}

// Small, stable per-subject numbers (0..1).
export function jitter(seed, i) {
  let t = (seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Rooms of a district on a narrow-or-wide page: columns of at least minW CSS px.
export function roomGrid(n, cssW, minW = 300) {
  const cols = Math.max(1, Math.min(n, Math.floor(cssW / minW)));
  return { cols, rows: Math.ceil(n / cols), w: cssW / cols };
}

// ---- room labels on the map ---------------------------------------------------------
// A room on the map is often 6-10 cells wide. Its full name is used when it fits,
// otherwise this: short enough to read, still in the Department's voice.
const SHORT = {
  "exec-suite": "EXEC", "ops-floor": "OPS", "assembly-hall": "ASSEMBLY", tribunal: "TRIB 9", penthouses: "EXEC RES",
  "studio-row": "STUDIOS", playhouse: "THEATRE", "concert-hall": "CONCERT", gallery: "GALLERY", "the-grind": "GRIND",
  "lecture-hall": "LECTURES", "lab-block": "LABS", stacks: "STACKS", "clock-tower": "CLOCK",
  "exchange-floor": "EXCHANGE", "vault-bank": "VAULT", "rooftop-lounge": "ROOFTOP",
  "dive-bar": "THE DIVE", casino: "CASINO", "press-room": "PRESS", "all-night-diner": "DINER",
  stadium: "FLOOR", gym: "GYM",
  ward: "WARD 7", chapel: "CHAPEL", park: "GREEN", market: "MARKET", schoolhouse: "SCHOOL",
  "archive-stacks": "RECORDS", "memory-vault": "MEMORY", "crypt-dorms": "CRYPTS",
  reclamation: "RECLAIM", reactor: "CORE", foundry: "FOUNDRY", "cache-farm": "CACHE", docks: "DOCKS",
  hydroponics: "VATS", barracks: "BARRACKS", "holding-cells": "CELLS", canteen: "CANTEEN",
  "block-a": "HAB A", "block-b": "HAB B", "block-c": "HAB C", "the-street": "STREET",
};
// The label drawn on a room's top border, given its width in cells: " NAME " when it
// fits with padding, "NAME" flush against the corners when tight, clipped as a last resort.
export function roomLabel(id, full, rw) {
  const pad = rw - 4, flush = rw - 2;
  for (const t of [full, SHORT[id]]) {
    if (!t) continue;
    if (t.length <= pad) return ` ${t} `;
    if (t.length <= flush) return t;
  }
  const s = SHORT[id] || full;
  return flush >= 3 ? s.slice(0, flush) : "";
}
