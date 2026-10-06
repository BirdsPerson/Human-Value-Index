// THE PARK, skateable: the three levels, as data. Pure (no DOM): the sim, the renderer and
// scripts/check-skate.mjs all read this file. Units are tiles (x right-down, y left-down on the screen,
// z up); one tile is about a metre and a half.
//
// A level: {id, name, place, W, H, start: {x, y, h}, objs, rails, items, goals, look}
//   objs   the solid ground, every one an axis-aligned rectangle [x0, x1] x [y0, y1]:
//            box    {k: "box", z}                       a flat top z high (a ledge, a planter, a terrace)
//            slope  {k: "slope", dir, z0, z1, stairs?}  a plane rising toward dir ("n" -y, "s" +y, "w" -x, "e" +x)
//            qp     {k: "qp", dir, H}                   a quarter pipe: rises toward dir to its lip, H high, curved
//                                                       (h = H t^2); riding over the lip launches straight up (vert)
//          xray: true draws a front-facing ramp see-through (it never hides the skater)
//   rails  grindable lines {id, name, a: [x, y, z], b: [x, y, z]}; every quarter pipe's lip is a rail
//          too (THE COPING), added by the sim
//   items  the five letters S-K-A-T-E and the tape: {x, y, z}; picked up within 0.6 tiles across and
//          from 0.9 below to 0.4 above (your feet), so every one needs air or a grind
//   goals  data, so more can be added: {id, name, kind, ...}
//            score {n}   finish the run with n points or more      combo {n}   bank one combo of n or more
//            letters     S, K, A, T and E in one run               tape        the secret tape
//            grind {rail, ticks}   one grind of that rail, that long (60 ticks a second)
//            trick {trick}         bank a combo with that trick in it
//            spin {halves}         land a spin of that many half turns (3 = a 540)
//
// The places are the city's: THE PARK stands on the Recreation Ground, THE VERT RAMP behind it, THE
// PLAZA is the Plaza itself (the HQ steps and their rail, the fountain, the Strip's curb, the boardwalk).

export const LEVELS = {
  park: {
    id: "park", name: "THE PARK", place: "THE RECREATION GROUND", W: 26, H: 22,
    blurb: "CONCRETE, PERMITTED. A FUNBOX, A FLAT RAIL, A KICKER, TWO QUARTER PIPES.",
    start: { x: 17.6, y: 19.5, h: 48 },
    objs: [
      { k: "qp", id: "qp-w", x0: 0, y0: 2.5, x1: 2.5, y1: 22, dir: "w", H: 1.6 },
      { k: "qp", id: "qp-n", x0: 2.5, y0: 0, x1: 26, y1: 2.5, dir: "n", H: 1.6 },
      { k: "box", id: "deck", x0: 0, y0: 0, x1: 2.5, y1: 2.5, z: 1.6 },
      { k: "box", id: "funbox", x0: 10, y0: 9, x1: 15, y1: 12, z: 0.5 },
      { k: "slope", id: "fun-up", x0: 8, y0: 9, x1: 10, y1: 12, dir: "e", z0: 0, z1: 0.5 },
      { k: "slope", id: "fun-down", x0: 15, y0: 9, x1: 17, y1: 12, dir: "w", z0: 0, z1: 0.5 },
      { k: "slope", id: "kicker", x0: 20, y0: 15, x1: 22.5, y1: 17.5, dir: "n", z0: 0, z1: 0.7 },
      { k: "box", id: "ledge", x0: 18, y0: 5, x1: 24, y1: 6, z: 0.4 },
      { k: "box", id: "pad", x0: 4, y0: 6, x1: 7, y1: 9, z: 0.25 },
    ],
    rails: [
      { id: "fun-rail", name: "THE FUNBOX RAIL", a: [10.3, 10.5, 0.95], b: [14.7, 10.5, 0.95], rail: true },
      { id: "fun-n", name: "THE FUNBOX LEDGE", a: [10, 9, 0.5], b: [15, 9, 0.5] },
      { id: "fun-s", name: "THE FUNBOX LEDGE", a: [10, 12, 0.5], b: [15, 12, 0.5] },
      { id: "flat-rail", name: "THE FLAT RAIL", a: [5, 16.5, 0.45], b: [13, 16.5, 0.45], rail: true },
      { id: "ledge-n", name: "THE LONG LEDGE", a: [18, 5, 0.4], b: [24, 5, 0.4] },
      { id: "ledge-s", name: "THE LONG LEDGE", a: [18, 6, 0.4], b: [24, 6, 0.4] },
      { id: "pad-n", name: "THE MANUAL PAD", a: [4, 6, 0.25], b: [7, 6, 0.25] },
      { id: "pad-s", name: "THE MANUAL PAD", a: [4, 9, 0.25], b: [7, 9, 0.25] },
    ],
    items: {
      S: { x: 9, y: 16.5, z: 1.2 }, K: { x: 12.5, y: 10.5, z: 1.9 }, A: { x: 21.2, y: 11.5, z: 1.8 },
      T: { x: 0.2, y: 12, z: 2.6 }, E: { x: 16, y: 0.2, z: 2.7 },
      tape: { x: 0.2, y: 19.5, z: 3.3 },
    },
    goals: [
      { id: "score", name: "HIGH SCORE: 15,000", kind: "score", n: 15000 },
      { id: "pro", name: "PRO SCORE: 40,000", kind: "score", n: 40000 },
      { id: "skate", name: "COLLECT S-K-A-T-E", kind: "letters" },
      { id: "tape", name: "FIND THE SECRET TAPE", kind: "tape" },
      { id: "rail", name: "GRIND THE FUNBOX RAIL", kind: "grind", rail: "fun-rail", ticks: 20 },
      { id: "combo", name: "LAND A 5,000 POINT COMBO", kind: "combo", n: 5000 },
    ],
    look: { sky: ["#1e3a5f", "#3b6ea5"], floor: "#9aa3ad", joint: "#87909a", grass: "#3f7a3a", ramp: "#d9a066", rampHi: "#ecc08f", rampLo: "#a8743f", side: "#6b7280", coping: "#e5e7eb", box: "#b7bec7", boxSide: "#7c8590", boxFront: "#68707b", rail: "#f59e0b", sign: "THE PARK" },
  },

  vert: {
    id: "vert", name: "THE VERT RAMP", place: "BEHIND THE RECREATION GROUND", W: 30, H: 12,
    blurb: "ONE HALFPIPE, ELEVEN FEET OF VERT. LIP TRICKS, REVERTS, AIR.",
    start: { x: 5, y: 0.02, h: 16, dropIn: true },
    objs: [
      { k: "qp", id: "wall-n", x0: 0, y0: 0, x1: 30, y1: 3.5, dir: "n", H: 3.2 },
      { k: "qp", id: "wall-s", x0: 0, y0: 8.5, x1: 30, y1: 12, dir: "s", H: 3.2, xray: true },
    ],
    rails: [],
    items: {
      S: { x: 6, y: 0.2, z: 4.6 }, K: { x: 12, y: 11.8, z: 4.9 }, A: { x: 17.5, y: 0.2, z: 5.4 },
      T: { x: 23, y: 11.8, z: 5.2 }, E: { x: 27.5, y: 0.2, z: 4.9 },
      tape: { x: 15, y: 0.2, z: 7.6 },
    },
    goals: [
      { id: "score", name: "HIGH SCORE: 20,000", kind: "score", n: 20000 },
      { id: "pro", name: "PRO SCORE: 50,000", kind: "score", n: 50000 },
      { id: "skate", name: "COLLECT S-K-A-T-E", kind: "letters" },
      { id: "tape", name: "FIND THE SECRET TAPE", kind: "tape" },
      { id: "invert", name: "LIP TRICK: AN INVERT", kind: "trick", trick: "INVERT" },
      { id: "540", name: "LAND A 540", kind: "spin", halves: 3 },
    ],
    look: { sky: ["#0b1026", "#28305e"], floor: "#b9874f", joint: "#a2733f", grass: "#1f2937", ramp: "#c98f52", rampHi: "#e3ad72", rampLo: "#9b6a35", side: "#4b5563", coping: "#e5e7eb", box: "#9ca3af", boxSide: "#6b7280", boxFront: "#4b5563", rail: "#e5e7eb", sign: "THE VERT RAMP" },
  },

  street: {
    id: "street", name: "THE PLAZA", place: "THE PLAZA, BY HQ", W: 30, H: 24,
    blurb: "THE CITY'S OWN STREET: THE HQ STEPS AND THEIR RAIL, THE FOUNTAIN, THE STRIP'S CURB, THE BOARDWALK.",
    start: { x: 15, y: 15.5, h: 48 },
    objs: [
      { k: "qp", id: "bank", x0: 0, y0: 6, x1: 2, y1: 17, dir: "w", H: 1.2 },
      { k: "box", id: "terrace", x0: 8, y0: 0, x1: 22, y1: 4, z: 1.0 },
      { k: "slope", id: "steps", x0: 11, y0: 4, x1: 19, y1: 6.5, dir: "n", z0: 0, z1: 1.0, stairs: true },
      { k: "box", id: "fountain", x0: 13, y0: 10, x1: 17, y1: 13, z: 0.55 },
      { k: "box", id: "planter-w", x0: 4, y0: 9, x1: 7, y1: 11, z: 0.6 },
      { k: "box", id: "planter-e", x0: 23, y0: 9, x1: 26, y1: 11, z: 0.6 },
      { k: "box", id: "bench", x0: 8.5, y0: 14.6, x1: 11.5, y1: 15.4, z: 0.4 },
      { k: "box", id: "curb-w", x0: 2, y0: 17.5, x1: 13, y1: 18, z: 0.22 },
      { k: "box", id: "curb-e", x0: 17, y0: 17.5, x1: 28, y1: 18, z: 0.22 },
      { k: "slope", id: "kicker", x0: 24, y0: 13, x1: 26.5, y1: 15.5, dir: "n", z0: 0, z1: 0.6 },
      { k: "box", id: "newsstand", x0: 25, y0: 3, x1: 28, y1: 5.5, z: 1.5, solid: true },
    ],
    rails: [
      { id: "hq-rail", name: "THE HQ RAIL", a: [15, 3.8, 1.45], b: [15, 6.6, 0.42], rail: true },
      { id: "terrace-w", name: "THE HQ TERRACE", a: [8, 4, 1.0], b: [11, 4, 1.0] },
      { id: "terrace-e", name: "THE HQ TERRACE", a: [19, 4, 1.0], b: [22, 4, 1.0] },
      { id: "terrace-x0", name: "THE HQ TERRACE", a: [8, 0.2, 1.0], b: [8, 4, 1.0] },
      { id: "terrace-x1", name: "THE HQ TERRACE", a: [22, 0.2, 1.0], b: [22, 4, 1.0] },
      { id: "fountain-n", name: "THE FOUNTAIN", a: [13, 10, 0.55], b: [17, 10, 0.55] },
      { id: "fountain-s", name: "THE FOUNTAIN", a: [13, 13, 0.55], b: [17, 13, 0.55] },
      { id: "fountain-w", name: "THE FOUNTAIN", a: [13, 10, 0.55], b: [13, 13, 0.55] },
      { id: "fountain-e", name: "THE FOUNTAIN", a: [17, 10, 0.55], b: [17, 13, 0.55] },
      { id: "planter-wn", name: "A PLANTER", a: [4, 9, 0.6], b: [7, 9, 0.6] },
      { id: "planter-ws", name: "A PLANTER", a: [4, 11, 0.6], b: [7, 11, 0.6] },
      { id: "planter-en", name: "A PLANTER", a: [23, 9, 0.6], b: [26, 9, 0.6] },
      { id: "planter-es", name: "A PLANTER", a: [23, 11, 0.6], b: [26, 11, 0.6] },
      { id: "bench", name: "THE BENCH", a: [8.5, 14.6, 0.4], b: [11.5, 14.6, 0.4] },
      { id: "curb-w", name: "THE STRIP CURB", a: [2, 17.5, 0.22], b: [13, 17.5, 0.22] },
      { id: "curb-e", name: "THE STRIP CURB", a: [17, 17.5, 0.22], b: [28, 17.5, 0.22] },
      { id: "boardwalk", name: "THE BOARDWALK RAIL", a: [2, 23.2, 0.5], b: [28, 23.2, 0.5], rail: true },
    ],
    items: {
      S: { x: 5.5, y: 10, z: 1.6 }, K: { x: 15, y: 5.0, z: 1.9 }, A: { x: 15, y: 11.5, z: 2.0 },
      T: { x: 0.2, y: 11.5, z: 2.2 }, E: { x: 21, y: 23.2, z: 1.3 },
      tape: { x: 21.2, y: 0.8, z: 2.6 },
    },
    goals: [
      { id: "score", name: "HIGH SCORE: 10,000", kind: "score", n: 10000 },
      { id: "pro", name: "PRO SCORE: 30,000", kind: "score", n: 30000 },
      { id: "skate", name: "COLLECT S-K-A-T-E", kind: "letters" },
      { id: "tape", name: "FIND THE SECRET TAPE", kind: "tape" },
      { id: "hq", name: "GRIND THE HQ RAIL", kind: "grind", rail: "hq-rail", ticks: 15 },
      { id: "boardwalk", name: "GRIND THE BOARDWALK RAIL FOR 2 SECONDS", kind: "grind", rail: "boardwalk", ticks: 120 },
    ],
    look: { sky: ["#3b1d4a", "#c2410c"], floor: "#a8a29e", joint: "#928b86", grass: "#365314", ramp: "#94a3b8", rampHi: "#cbd5e1", rampLo: "#64748b", side: "#57534e", coping: "#f1f5f9", box: "#d6d3d1", boxSide: "#a8a29e", boxFront: "#78716c", rail: "#facc15", plank: "#a16207", plankLo: "#854d0e", sign: "THE PLAZA" },
  },
};
export const LEVEL_IDS = ["park", "vert", "street"];
export const LETTERS = ["S", "K", "A", "T", "E"];
