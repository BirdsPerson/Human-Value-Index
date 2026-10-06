// The furniture catalog and the dressing of every flat (docs/CITY_SPEC.md "Tower cutaways",
// "Dressing"). Pure, no DOM: draw functions take a 2D context but nothing here touches the page,
// so scripts/check-cutaway.mjs can dress every flat in node.
//
// CATALOG: one entry per thing that can stand in a room: {id, name, rooms (purposes it may go
// in), footprint {w, h} in room units (a room is 45 units tall, at least 22 wide), tiers (the
// housing bands that may have it: 0 top, 1 middle, 2 bottom), role (what people use it as:
// bed, sofa, table, stove, desk, tub, sink, shelf, tv), draw(c, cx, floorY, scale, o)}. A later
// shop sells exactly these entries; there are no prices or purchases here.
//
// dressUnit(unit, ctx): a flat's (or a suite's) look, a function of its stable id and its
// residents' tags only: the layout of each room from several per purpose (mirrored half the
// time), each piece from the variants its band allows, the wall colour, the paper, the floor,
// the curtains, and one personal touch from who lives there. Render-only: tower.js plans and IDs
// are untouched.

import { ebPiece } from "./ebPieces.js";
import { trophyPiece } from "./trophyPieces.js";

const h01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const pick = (list, str) => list[Math.min(list.length - 1, Math.floor(h01(str) * list.length))];

// The brand marks (JETSAM! cabinet, EBTV set, Irene's tap) come from brand.js, which only loads
// its atlas in a browser; in node it answers "not ready" and the lettered fallback is drawn.
import { drawBrand } from "./brand.js";

// ---- drawing ---------------------------------------------------------------------------------
// rects: [dx, up, w, h, colour]; colour "$a".."$c" is the piece's tint, [off, on] lights up.
function paint(c, rects, cx, fy, s, o) {
  for (const [dx, up, w, h, col] of rects) {
    let k = col;
    if (Array.isArray(k)) k = o.on ? k[1] : k[0];
    else if (k[0] === "$") k = o.tint?.[k.charCodeAt(1) - 97] || "#777";
    c.fillStyle = k;
    const x0 = o.flip ? -(dx + w) : dx;
    c.fillRect(Math.round(cx + x0 * s), Math.round(fy - (up + h) * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  }
}
// small words on a piece, only when it is drawn large enough to read (the open flat)
function word(c, text, cx, fy, up, s, col, size = 3.2) {
  if (s < 1.8) return;
  c.save();
  c.font = `700 ${Math.max(6, Math.round(size * s))}px ui-monospace, monospace`;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = col;
  c.fillText(text, Math.round(cx), Math.round(fy - up * s));
  c.restore();
}

const W = (on) => ["#2a2f36", on];   // a screen: dark off, coloured on
const ITEMS = [
  // ---- bedroom
  { id: "bed-double", name: "DOUBLE BED", rooms: ["bedroom"], tiers: [0, 1], role: "bed", fw: 22, tints: [["#3d6b8f", "#cfcab8"], ["#8f3d4a", "#e0d6c0"], ["#4a7a4a", "#d8d2bc"], ["#6a5a8f", "#ddd6c6"]],
    rects: [[-11, 0, 2, 11, "#5a4632"], [-10, 0, 20, 5, "#5a4632"], [-10, 5, 20, 3, "$b"], [-4, 5, 14, 4, "$a"], [-9, 8, 5, 2, "#e8e4d4"]] },
  { id: "bed-single", name: "SINGLE BED", rooms: ["bedroom"], tiers: [1, 2], role: "bed", fw: 16, tints: [["#3d6b8f"], ["#7a6a3a"], ["#5a3d6b"], ["#3a6b5a"]],
    rects: [[-8, 0, 2, 10, "#4a3a2a"], [-7, 0, 15, 4, "#4a3a2a"], [-7, 4, 15, 3, "#c8c2b0"], [-2, 4, 10, 4, "$a"], [-6, 7, 4, 2, "#e8e4d4"]] },
  { id: "bed-bunk", name: "BUNK BED", rooms: ["bedroom"], tiers: [2], role: "bed", fw: 18, tints: [["#6b4a3a", "#3a5a6b"], ["#4a5a3a", "#6b3a3a"]],
    rects: [[-9, 0, 1.5, 22, "#555"], [7.5, 0, 1.5, 22, "#555"], [-9, 2, 18, 3, "#bdb7a6"], [-4, 4, 12, 2, "$a"], [-9, 13, 18, 3, "#bdb7a6"], [-4, 15, 12, 2, "$b"], [6, 6, 1, 7, "#777"]] },
  { id: "bed-futon", name: "FUTON", rooms: ["bedroom"], tiers: [1, 2], role: "bed", fw: 18, tints: [["#8a6a3a"], ["#3a4a6a"], ["#6a3a4a"]],
    rects: [[-9, 0, 18, 3, "#3a3026"], [-9, 3, 18, 2, "#d8d0bc"], [-3, 4, 12, 2.5, "$a"], [-8, 5, 4, 1.5, "#ece6d6"]] },
  { id: "bed-canopy", name: "FOUR-POSTER BED", rooms: ["bedroom"], tiers: [0], role: "bed", fw: 24, tints: [["#8f2d3a", "#e6dcc4"], ["#2d4a8f", "#e6e0cc"], ["#2d6b5a", "#ece4cc"]],
    rects: [[-12, 0, 1.5, 24, "#4a2e1a"], [10.5, 0, 1.5, 24, "#4a2e1a"], [-12, 22, 24, 2, "$a"], [-11, 18, 2, 4, "$a"], [9, 18, 2, 4, "$a"], [-10.5, 0, 21, 5, "#5a3a22"], [-10.5, 5, 21, 3, "$b"], [-4, 5, 14, 4, "$a"], [-9, 8, 5, 2, "#f4efe0"]] },
  { id: "wardrobe", name: "WARDROBE", rooms: ["bedroom"], tiers: [0, 1, 2], fw: 10, tints: [["#4a3a2a"], ["#5a5048"], ["#3a3a44"], ["#6a4a30"]],
    rects: [[-5, 0, 10, 24, "$a"], [-0.3, 2, 0.6, 20, "#2a2018"], [-2, 11, 1, 2, "#b8a070"], [1, 11, 1, 2, "#b8a070"]] },
  { id: "dresser", name: "CHEST OF DRAWERS", rooms: ["bedroom"], tiers: [0, 1, 2], fw: 12, tints: [["#6a4a30"], ["#8a7a6a"], ["#4a4038"]],
    rects: [[-6, 0, 12, 12, "$a"], [-5, 2.5, 10, 0.6, "#2a2018"], [-5, 6, 10, 0.6, "#2a2018"], [-5, 9.5, 10, 0.6, "#2a2018"], [-3, 12, 6, 7, "#9ab0b8"], [-2.5, 12.5, 5, 6, "#c4d8de"]] },
  { id: "nightstand", name: "NIGHTSTAND AND LAMP", rooms: ["bedroom"], tiers: [0, 1, 2], role: "lamp", fw: 6,
    rects: [[-3, 0, 6, 7, "#5a4632"], [-0.5, 7, 1, 4, "#6a6a5a"], [-2.5, 11, 5, 3, ["#8a7a50", "#f5d27a"]]] },
  { id: "lamp", name: "FLOOR LAMP", rooms: ["bedroom", "living", "study"], tiers: [0, 1, 2], role: "lamp", fw: 6,
    rects: [[-0.5, 0, 1, 16, "#6a6a5a"], [-3, 16, 6, 4, ["#8a7a50", "#f5d27a"]]] },
  { id: "poster", name: "BAND POSTER", rooms: ["bedroom", "living"], tiers: [1, 2], wall: true, fw: 8, tints: [["#c0392b", "#f1c40f"], ["#2c3e50", "#e67e22"], ["#8e44ad", "#1abc9c"]],
    rects: [[-4, 16, 8, 11, "$a"], [-3, 19, 6, 3, "$b"], [-3, 23, 6, 1, "#eee"]] },
  { id: "painting", name: "FRAMED PAINTING", rooms: ["bedroom", "living", "study"], tiers: [0, 1], wall: true, fw: 10, tints: [["#3a6a8a", "#c9a34a"], ["#8a5a3a", "#c9a34a"], ["#5a8a5a", "#8a8a8a"], ["#8a3a5a", "#c9a34a"]],
    rects: [[-5, 16, 10, 9, "$b"], [-4, 17, 8, 7, "$a"], [-3, 18, 3, 2, "#e8d8a0"], [0, 20, 3, 3, "#2a3a2a"]] },
  // ---- kitchen
  { id: "fridge", name: "FRIDGE", rooms: ["kitchen"], tiers: [0, 1, 2], role: "fridge", fw: 8, tints: [["#c9d2cd"], ["#d8d0b0"], ["#9fb8b0"]],
    rects: [[-4, 0, 8, 22, "$a"], [-4, 13, 8, 0.7, "#7d8984"], [2, 15, 1, 4, "#7d8984"]] },
  { id: "fridge-retro", name: "RETRO FRIDGE", rooms: ["kitchen"], tiers: [1, 2], role: "fridge", fw: 8, tints: [["#7fb8a8"], ["#e0a0a0"], ["#e8d890"]],
    rects: [[-4, 0, 8, 19, "$a"], [-3.5, 19, 7, 1.5, "$a"], [-4, 11, 8, 0.7, "#4a5a54"], [2, 13, 1, 4, "#d0d0d0"]] },
  { id: "fridge-steel", name: "STEEL FRIDGE", rooms: ["kitchen"], tiers: [0], role: "fridge", fw: 12,
    rects: [[-6, 0, 12, 26, "#a8b0b4"], [-0.3, 1, 0.6, 24, "#6a7074"], [-2, 12, 1, 6, "#d8dcde"], [1, 12, 1, 6, "#d8dcde"]] },
  { id: "stove", name: "STOVE", rooms: ["kitchen"], tiers: [1, 2], role: "stove", fw: 8,
    rects: [[-4, 0, 8, 10, "#3a3a3a"], [-4, 10, 8, 1, "#1e1e1e"], [-2, 11, 4, 3, "#8a8a8a"], [-3, 3, 6, 4, "#151515"]] },
  { id: "range", name: "RANGE COOKER", rooms: ["kitchen"], tiers: [0], role: "stove", fw: 14, tints: [["#8a2a2a"], ["#2a3a5a"], ["#e0dcd0"]],
    rects: [[-7, 0, 14, 11, "$a"], [-7, 11, 14, 1, "#1e1e1e"], [-6, 3, 5, 5, "#151515"], [1, 3, 5, 5, "#151515"], [-6, 22, 12, 6, "#9a9a9a"], [-4, 18, 8, 4, "#7a7a7a"]] },
  { id: "counter", name: "COUNTER AND CUPBOARDS", rooms: ["kitchen"], tiers: [0, 1, 2], fw: 14, tints: [["#6b5a44", "#5a4a38"], ["#4a5a6a", "#3a4a5a"], ["#7a6a5a", "#e0d8c8"], ["#4a6a4a", "#3a5a3a"]],
    rects: [[-7, 0, 14, 10, "$a"], [-7, 10, 14, 1.2, "#bfb8a2"], [-7, 22, 14, 6, "$b"], [-5, 11.2, 3, 3, "#d8d8d8"]] },
  { id: "island", name: "KITCHEN ISLAND", rooms: ["kitchen"], tiers: [0], fw: 18,
    rects: [[-9, 0, 18, 10, "#3a4048"], [-10, 10, 20, 1.5, "#e8e4dc"], [-7, 0, 1, 8, "#6a6a6a"], [6, 0, 1, 8, "#6a6a6a"], [-2, 11.5, 4, 2, "#8a5a3a"]] },
  { id: "table", name: "KITCHEN TABLE", rooms: ["kitchen", "living", "lounge"], tiers: [0, 1, 2], role: "table", fw: 12, tints: [["#7a5a3a"], ["#c8c0b0"], ["#5a4a3a"]],
    rects: [[-6, 8, 12, 1.5, "$a"], [-5, 0, 1, 8, "#5a4028"], [4, 0, 1, 8, "#5a4028"]] },
  { id: "table-round", name: "ROUND TABLE", rooms: ["kitchen"], tiers: [0, 1], role: "table", fw: 12, tints: [["#e0dcd0"], ["#7a5a3a"], ["#8a3a3a"]],
    rects: [[-5, 8, 10, 1.5, "$a"], [-0.5, 0, 1, 8, "#3a3a3a"], [-2.5, 0, 5, 1, "#3a3a3a"], [-9, 0, 1, 10, "#5a4a3a"], [-9, 5, 3, 1, "#5a4a3a"], [8, 0, 1, 10, "#5a4a3a"], [6, 5, 3, 1, "#5a4a3a"]] },
  { id: "dinette", name: "DINETTE", rooms: ["kitchen"], tiers: [1, 2], role: "table", fw: 14, tints: [["#c84a4a"], ["#4a8ac8"], ["#e0c040"]],
    rects: [[-5, 8, 10, 1.5, "#d8d8d0"], [-0.5, 0, 1, 8, "#aaa"], [-8, 0, 1, 6, "#aaa"], [-8, 5, 3, 1.5, "$a"], [-8, 6, 1, 6, "$a"], [7, 0, 1, 6, "#aaa"], [5, 5, 3, 1.5, "$a"], [7, 6, 1, 6, "$a"]] },
  { id: "pots", name: "HANGING POTS", rooms: ["kitchen"], tiers: [0, 1, 2], wall: true, fw: 10,
    rects: [[-5, 27, 10, 0.8, "#6a6a6a"], [-4, 22, 3, 3, "#b87333"], [-0.5, 23, 2.5, 2.5, "#8a8a8a"], [2.5, 21.5, 2, 4, "#b87333"]] },
  { id: "beer-tap", name: "GOODNIGHT IRENE'S BEER TAP", rooms: ["kitchen", "living"], tiers: [0], fw: 12,
    rects: [[-6, 0, 12, 10, "#3a2418"], [-6, 10, 12, 1.2, "#c89a5a"], [-3, 11, 1, 5, "#c0c0c0"], [-0.5, 11, 1, 5, "#c0c0c0"], [2, 11, 1, 5, "#c0c0c0"], [-4, 15, 8, 1.5, "#8a6a3a"], [-6, 19, 12, 5, ["#d8d2c0", "#f7f5ec"]]],
    // the lightbox over the taps: Irene's oven arch and flame (brand.js), on the pub's cream
    after: (c, cx, fy, s, o) => { if (!drawBrand(c, "irenes-arch", cx, fy - 21.5 * s, 4.2 * s, { alpha: o.on ? 1 : 0.7 })) word(c, "IRENE'S", cx, fy, 21.5, s, "#8c1622", 2.4); } },
  // ---- living room
  { id: "tv", name: "TELEVISION", rooms: ["living"], tiers: [0, 1, 2], role: "tv", fw: 10,
    rects: [[-3, 0, 6, 5, "#2e2e2e"], [-5, 7, 10, 7, W("#7fe0b0")], [-0.5, 5, 1, 2, "#2e2e2e"]] },
  { id: "tv-crt", name: "CRT TELEVISION", rooms: ["living", "bedroom"], tiers: [1, 2], role: "tv", fw: 10, tints: [["#6a4a30"], ["#4a4a4a"]],
    rects: [[-5, 0, 10, 7, "$a"], [-4, 7, 8, 7, "#3a3a3a"], [-3, 8, 6, 5, W("#a0d8f0")], [-2, 14, 0.6, 4, "#888"], [1.4, 14, 0.6, 4, "#888"]] },
  { id: "tv-flat", name: "WALL TELEVISION", rooms: ["living"], tiers: [0, 1], role: "tv", fw: 14,
    rects: [[-7, 0, 14, 4, "#2a2a30"], [-7, 10, 14, 8, "#111"], [-6.5, 10.5, 13, 7, W("#6ab0ff")]] },
  { id: "ebtv", name: "EBTV TELEVISION", rooms: ["living", "bedroom"], tiers: [0, 1, 2], role: "tv", fw: 12,
    rects: [[-4, 0, 8, 5, "#2a2a2a"], [-6, 6, 12, 9, "#1a1a1a"], [-5.5, 6.5, 11, 8, ["#14202a", "#1d6fe0"]], [3, 12, 2, 2, ["#5a1a1a", "#ff4040"]]],
    // o.screen(c, x, y, w, h): the view puts what is really airing there (ebtvFrame.js) and takes the tap
    after: (c, cx, fy, s, o) => {
      const x = Math.round(cx - 5.5 * s), y = Math.round(fy - 14.5 * s), w = Math.round(11 * s), h = Math.round(8 * s);
      if (o.on && o.screen && o.screen(c, x, y, w, h)) return;
      if (!drawBrand(c, "eb-bolt", cx - 0.5 * s, fy - 10.5 * s, 5 * s, { alpha: o.on ? 1 : 0.45 })) word(c, "EBTV", cx - 0.5 * s, fy, 10.5, s, o.on ? "#ffffff" : "#5a7a9a", 3);
    } },
  { id: "sofa", name: "SOFA", rooms: ["living"], tiers: [0, 1, 2], role: "sofa", fw: 18, tints: [["#7a3b3b", "#6a3030"], ["#3b5a7a", "#30506a"], ["#5a6a3b", "#4a5a30"], ["#8a7a5a", "#7a6a4a"], ["#5a3b6a", "#4a305a"]],
    rects: [[-8, 0, 16, 5, "$a"], [-8, 5, 16, 4, "$b"], [-9, 0, 2, 7, "$b"], [7, 0, 2, 7, "$b"]] },
  { id: "sectional", name: "SECTIONAL SOFA", rooms: ["living"], tiers: [0], role: "sofa", fw: 24, tints: [["#d8d0c0", "#c0b8a8"], ["#3a3a44", "#2a2a34"], ["#6a7a8a", "#5a6a7a"]],
    rects: [[-12, 0, 24, 5, "$a"], [-12, 5, 24, 5, "$b"], [-12, 0, 3, 8, "$b"], [9, 0, 3, 8, "$b"], [-6, 5, 3, 3, "#c9a34a"]] },
  { id: "loveseat", name: "LOVESEAT", rooms: ["living"], tiers: [1], role: "sofa", fw: 13, tints: [["#8a5a3a", "#7a4a2a"], ["#3a6a6a", "#2a5a5a"], ["#a05a6a", "#904a5a"]],
    rects: [[-6, 0, 12, 5, "$a"], [-6, 5, 12, 4, "$b"], [-7, 0, 2, 7, "$b"], [5, 0, 2, 7, "$b"]] },
  { id: "beanbag", name: "BEANBAG", rooms: ["living", "bedroom"], tiers: [2], role: "sofa", fw: 9, tints: [["#c84a4a"], ["#4a8a4a"], ["#e0a030"], ["#4a6ac8"]],
    rects: [[-4.5, 0, 9, 4, "$a"], [-3.5, 4, 7, 2, "$a"], [-2, 6, 4, 1, "$a"]] },
  { id: "armchair", name: "ARMCHAIR", rooms: ["living", "study", "bedroom"], tiers: [0, 1, 2], role: "sofa", fw: 9, tints: [["#6a3a2a"], ["#2a4a3a"], ["#5a5a6a"], ["#8a6a3a"]],
    rects: [[-4, 0, 8, 5, "$a"], [-4, 5, 2, 7, "$a"], [-4.5, 0, 1.5, 7, "#3a2a1a"], [3, 0, 1.5, 7, "#3a2a1a"]] },
  { id: "rug", name: "RUG", rooms: ["living", "bedroom", "study"], tiers: [0, 1, 2], floor: true, fw: 20, tints: [["#6a2f3a", "#c9a34a"], ["#2f4a6a", "#c0c0c0"], ["#4a5a2f", "#d0b070"], ["#6a4a2f", "#2a2a2a"], ["#3a2f5a", "#b0a0d0"]],
    rects: [[-10, 0, 20, 0.8, "$a"], [-9, 0, 1, 0.8, "$b"], [8, 0, 1, 0.8, "$b"]] },
  { id: "plant", name: "POT PLANT", rooms: ["living", "bedroom", "study", "bath", "lobby"], tiers: [0, 1, 2], fw: 6,
    rects: [[-2, 0, 4, 4, "#7a4a2a"], [-3, 4, 6, 6, "#3f7a3a"], [-1.5, 10, 3, 3, "#4f9a4a"]] },
  { id: "plant-tall", name: "FIDDLE-LEAF FIG", rooms: ["living", "study"], tiers: [0, 1], fw: 8,
    rects: [[-2.5, 0, 5, 5, "#d8d0c0"], [-0.5, 5, 1, 10, "#4a3a2a"], [-4, 12, 4, 4, "#3a7a3a"], [0, 15, 4, 4, "#4a8a3a"], [-3, 18, 5, 4, "#3f7a3a"]] },
  { id: "cactus", name: "CACTUS", rooms: ["living", "bedroom", "study", "kitchen"], tiers: [1, 2], fw: 4,
    rects: [[-1.5, 0, 3, 3, "#b86a3a"], [-0.8, 3, 1.6, 7, "#4a8a4a"], [-2.5, 6, 1.5, 1, "#4a8a4a"], [-2.5, 6, 1, 3, "#4a8a4a"]] },
  { id: "bookshelf", name: "BOOKSHELF", rooms: ["living", "study", "bedroom"], tiers: [0, 1, 2], role: "shelf", fw: 10, tints: [["#5a4632"], ["#3a3a3a"], ["#7a6a5a"]],
    rects: [[-5, 0, 10, 26, "$a"], [-4, 3, 2, 4, "#7a3b3b"], [-2, 3, 2, 4, "#3d6b8f"], [0, 3, 3, 4, "#c9a34a"], [-4, 10, 3, 4, "#3a6a3a"], [-1, 10, 4, 4, "#8a4a2a"], [-4, 17, 8, 4, "#a08a3a"]] },
  { id: "record-player", name: "RECORD PLAYER", rooms: ["living", "bedroom"], tiers: [0, 1, 2], fw: 9,
    rects: [[-4, 0, 8, 8, "#5a3a22"], [-3, 2, 6, 1, "#2a2a2a"], [-3, 4, 6, 1, "#2a2a2a"], [-4, 8, 8, 2, "#2a2a2a"], [-2, 10, 4, 0.6, "#111"], [1, 10, 2, 1, "#c0c0c0"]] },
  { id: "aquarium", name: "AQUARIUM", rooms: ["living", "study"], tiers: [0, 1], fw: 10, glow: true,
    rects: [[-5, 0, 10, 8, "#3a3a3a"], [-5, 8, 10, 7, ["#1a4a5a", "#3ac0d8"]], [-3, 10, 2, 1, "#f08030"], [1, 12, 2, 1, "#f0d030"], [-5, 15, 10, 1, "#2a2a2a"]] },
  { id: "chandelier", name: "CHANDELIER", rooms: ["living", "bedroom"], tiers: [0], wall: true, fw: 10,
    rects: [[-0.3, 38, 0.6, 7, "#c9a34a"], [-5, 36, 10, 1, "#c9a34a"], [-5, 33, 1, 3, ["#c9a34a", "#fff2c0"]], [-0.5, 33, 1, 3, ["#c9a34a", "#fff2c0"]], [4, 33, 1, 3, ["#c9a34a", "#fff2c0"]]] },
  // the personal touches
  { id: "easel", name: "EASEL", rooms: ["living", "study", "bedroom"], tiers: [0, 1, 2], fw: 10, tints: [["#c84a4a", "#4a8ac8"], ["#e0c040", "#4a8a4a"], ["#8a4ac8", "#e08a30"]],
    rects: [[-4, 0, 1, 20, "#8a6a3a"], [3, 0, 1, 20, "#8a6a3a"], [-0.5, 0, 1, 18, "#6a4a2a"], [-5, 8, 10, 1, "#8a6a3a"], [-4.5, 9, 9, 10, "#ece6d6"], [-3, 11, 4, 4, "$a"], [0, 14, 3, 3, "$b"], [6, 0, 2, 2, "#c84a4a"]] },
  { id: "piano", name: "UPRIGHT PIANO", rooms: ["living", "study"], tiers: [1, 2], fw: 14, tints: [["#2a1a12"], ["#4a2e1a"]],
    rects: [[-7, 0, 14, 17, "$a"], [-7, 9, 14, 1.5, "#f4f0e4"], [-6, 9.4, 1, 1.1, "#111"], [-3, 9.4, 1, 1.1, "#111"], [0, 9.4, 1, 1.1, "#111"], [3, 9.4, 1, 1.1, "#111"], [-5, 0, 1, 3, "#c9a34a"]] },
  { id: "grand-piano", name: "GRAND PIANO", rooms: ["living"], tiers: [0], fw: 22,
    rects: [[-11, 9, 22, 3, "#0e0e10"], [-11, 12, 14, 6, "#0e0e10"], [3, 12, 0.6, 6, "#555"], [-10, 0, 1.2, 9, "#0e0e10"], [8, 0, 1.2, 9, "#0e0e10"], [-11, 8, 8, 1, "#f4f0e4"], [-3, 0, 6, 4, "#2a2a2a"]] },
  { id: "books", name: "BOOK STACKS", rooms: ["living", "study", "bedroom"], tiers: [0, 1, 2], fw: 8,
    rects: [[-4, 0, 3, 1.2, "#7a3b3b"], [-4, 1.2, 3, 1.2, "#3d6b8f"], [-3.6, 2.4, 2.6, 1.2, "#c9a34a"], [-4, 3.6, 3, 1.2, "#3a6a3a"], [0, 0, 3.5, 1.2, "#8a4a2a"], [0, 1.2, 3.5, 1.2, "#5a3a6a"], [0.3, 2.4, 3, 1.2, "#3d6b8f"]] },
  { id: "weights", name: "WEIGHT BENCH", rooms: ["living", "bedroom", "study"], tiers: [0, 1, 2], fw: 14,
    rects: [[-6, 4, 11, 2, "#2a2a2a"], [-5, 0, 1, 4, "#555"], [3, 0, 1, 4, "#555"], [4, 0, 1, 13, "#888"], [-1, 12, 10, 0.8, "#c0c0c0"], [-2, 10.5, 1.5, 4, "#2a2a2a"], [8, 10.5, 1.5, 4, "#2a2a2a"]] },
  { id: "trophies", name: "TROPHY SHELF", rooms: ["living", "bedroom", "study"], tiers: [0, 1, 2], wall: true, fw: 12,
    rects: [[-6, 18, 12, 1, "#5a4632"], [-5, 19, 2, 3, "#c9a34a"], [-4.5, 22, 1, 1, "#c9a34a"], [-1, 19, 2.5, 4.5, "#d8d8d8"], [3, 19, 2, 3, "#b87333"]] },
  // THE WATERS (src/play/fish/): a trophy fish on a plaque. Data only: the furniture shop sells the
  // mount; the fish on it is the owner's own catch (species and weight from the tackle box, drawn by
  // src/play/fish/art.js drawFish when the cutaway passes o.fish). Not placed by dressUnit.
  { id: "mounted-fish", name: "MOUNTED FISH", rooms: ["living", "study", "bedroom"], tiers: [0, 1, 2], wall: true, fw: 14, trophy: true, tints: [["#5a4632"], ["#3a2a1a"], ["#7a6a5a"]],
    rects: [[-7, 20, 14, 7, "$a"], [-6, 22, 9, 3, "#7c8c94"], [-6, 21.5, 7, 1, "#5c6c74"], [-6, 24.5, 8, 0.8, "#e4e4e4"], [3, 21.5, 2.5, 4, "#7c8c94"], [-5, 23.3, 0.8, 0.8, "#111"], [-1, 18.5, 2, 1.5, "#c9a34a"]] },
  { id: "pc", name: "COMPUTER DESK", rooms: ["study", "living", "bedroom"], tiers: [0, 1, 2], role: "desk", fw: 14,
    rects: [[-7, 9, 14, 1.5, "#3a3a40"], [-6, 0, 1, 9, "#2a2a30"], [5, 0, 1, 9, "#2a2a30"], [-5, 10.5, 7, 5, "#111"], [-4.5, 11, 6, 4, W("#40e0a0")], [3, 10.5, 2, 6, "#2a2a30"], [3.5, 15, 1, 0.6, ["#1a3a1a", "#40ff40"]]] },
  { id: "arcade", name: "JETSAM ARCADE CABINET", rooms: ["living", "bedroom", "study"], tiers: [0, 1, 2], fw: 9, glow: true, tints: [["#2a1a4a", "#ff40c0"], ["#1a2a4a", "#40e0ff"], ["#4a1a1a", "#ffd040"]],
    rects: [[-4.5, 0, 9, 24, "$a"], [-4.5, 22, 9, 4, "#0f1c22"], [-4.5, 21.6, 9, 0.5, "$b"], [-3.5, 12, 7, 8, ["#203040", "#3ad0ff"]], [-3.5, 9, 7, 2, "#1a1a1a"], [-2, 10.5, 1, 1.5, "#ff3030"], [1, 10.5, 1, 1, "#30ff30"], [-3, 3, 6, 4, "#1a1a1a"]],
    // the marquee: the game's own logotype (brand.js), backlit on the cabinet's dark glass
    after: (c, cx, fy, s) => { if (!drawBrand(c, "jetsam", cx, fy - 24 * s, 3.2 * s)) word(c, "JETSAM!", cx, fy, 24, s, "#e5f6f6", 2.3); } },
  // DEPARTMENT MAIL (src/mail/): the BEIGE PC the Department issues to every assigned flat (tap it at
  // home: a little desktop with the mail, the market, the paper, solitaire), and what it upgrades into.
  { id: "beige-pc", name: "BEIGE PC", rooms: ["study", "living", "bedroom"], tiers: [0, 1, 2], role: "desk", fw: 14,
    rects: [[-7, 9, 14, 1.5, "#5a4632"], [-6, 0, 1, 9, "#4a3a2a"], [5, 0, 1, 9, "#4a3a2a"], [1.5, 0, 3.5, 9, "#d8d0b4"], [2, 6, 2.5, 0.6, "#a8a088"], [2.2, 1.5, 0.8, 0.8, ["#1a3a1a", "#40ff70"]],
      [-6, 10.5, 9, 8, "#d8d0b4"], [-5.4, 11.6, 7.8, 6, "#1a1f1a"], [-5, 12, 7, 5.2, W("#008080")], [-5, 16.3, 7, 0.9, ["#7a7a7a", "#c0c0c0"]], [-2.5, 10.5, 3, 0.8, "#b8b09a"], [-6, 10.5, 9, 0.5, "#e8e0c4"]],
    after: (c, cx, fy, s, o) => { if (o.on) word(c, "MAIL", cx - 1.5 * s, fy, 14.5, s, "#ffffff", 1.8); } },
  // THE CARD ROOM (src/play/cards/): a deck of cards on a little table (tap it at home: Solitaire,
  // Spider), the EB house deck, and what a deck upgrades into (the card table, the poker table).
  { id: "deck", name: "DECK OF CARDS", rooms: ["living", "kitchen", "bedroom", "study"], tiers: [0, 1, 2], fw: 10, tints: [["#0f3d22", "#2f8a50"]],
    rects: [[-4, 0, 1, 8, "#4b3828"], [3, 0, 1, 8, "#4b3828"], [-5, 8, 10, 1.2, "#6b4a30"], [-3.5, 9.2, 3, 1.2, "#f4f2ea"], [-3.5, 10.4, 3, 0.8, "$a"], [-3.2, 10.6, 0.6, 0.4, "$b"], [0.8, 9.2, 2, 2.8, "#f4f2ea"], [1.2, 10.2, 0.9, 0.9, "#b3121b"], [2.6, 9.2, 0.4, 2.8, "#1b1e24"]],
    after: (c, cx, fy, s) => word(c, "CARDS", cx, fy, 14.5, s, "#e8e4d4", 2.2) },
  { id: "deck-eb", name: "EB HOUSE DECK", rooms: ["living", "kitchen", "bedroom", "study"], tiers: [0, 1, 2], fw: 10, tints: [["#2a1446", "#c9a227"]],
    rects: [[-4, 0, 1, 8, "#2a1a10"], [3, 0, 1, 8, "#2a1a10"], [-5, 8, 10, 1.2, "#3a2418"], [-3.5, 9.2, 3, 1.2, "#f4f2ea"], [-3.5, 10.4, 3, 0.8, "$a"], [-3.2, 10.6, 2.4, 0.4, "$b"], [0.8, 9.2, 2, 2.8, "$a"], [1.1, 9.6, 1.4, 2, "$b"], [1.4, 10.1, 0.8, 1, "$a"]],
    after: (c, cx, fy, s) => word(c, "EB", cx, fy, 14.5, s, "#c9a227", 2.6) },
  { id: "card-table", name: "CARD TABLE", rooms: ["living", "kitchen", "study"], tiers: [0, 1, 2], fw: 16,
    rects: [[-7, 0, 1, 9, "#3a2a1a"], [6, 0, 1, 9, "#3a2a1a"], [-8, 9, 16, 1, "#3a2a1a"], [-8, 10, 16, 1.2, "#14532d"], [-5, 11.2, 1.6, 0.6, "#f4f2ea"], [-2, 11.2, 1.6, 0.6, "#f4f2ea"], [1, 11.2, 1.6, 0.6, "#b3121b"], [4, 11.2, 1.6, 0.6, "#f4f2ea"],
      [-11, 0, 1, 7, "#5a4632"], [-11, 6, 3, 1, "#5a4632"], [10, 0, 1, 7, "#5a4632"], [8, 6, 3, 1, "#5a4632"]] },
  { id: "poker-table", name: "POKER TABLE", rooms: ["living", "study"], tiers: [0, 1, 2], fw: 22,
    rects: [[-8, 0, 2, 9, "#2a1a0c"], [6, 0, 2, 9, "#2a1a0c"], [-11, 9, 22, 1.4, "#3a2a1a"], [-10.5, 10.4, 21, 1.4, "#14532d"], [-11, 11.8, 22, 0.8, "#c9a227"],
      [-6, 12.6, 1.6, 0.6, "#f4f2ea"], [-3.5, 12.6, 1.6, 0.6, "#f4f2ea"], [-1, 12.6, 1.6, 0.6, "#b3121b"], [3, 12.6, 1.6, 1.8, "#c9a227"], [3, 13.2, 1.6, 0.6, "#7f1d1d"], [6, 12.6, 1.6, 1.2, "#e5e5e5"]],
    after: (c, cx, fy, s) => word(c, "HOME GAME", cx, fy, 17, s, "#c9a227", 2.2) },
  // ---- the upgrade tiers (src/economy/shops.js UPGRADES): never placed by dressUnit, only by a
  // resident who bought the tier below and upgraded it. whole: the piece takes the whole room.
  { id: "gaming-rig", name: "GAMING RIG", rooms: ["study", "living", "bedroom"], tiers: [0, 1, 2], role: "desk", fw: 18, glow: true, tints: [["#ff2fd0", "#30f0ff"]],
    rects: [[-9, 9, 18, 1.5, "#1a1a20"], [-8, 0, 1.2, 9, "#101014"], [6.8, 0, 1.2, 9, "#101014"], [3, 0, 4.5, 11, "#14141a"], [3.4, 0.5, 0.5, 10, "$a"], [6.6, 0.5, 0.5, 10, "$b"], [4, 4, 2.6, 2.6, ["#203040", "#30f0ff"]],
      [-9, 11, 7, 6, "#0c0c10"], [-8.6, 11.4, 6.2, 5, W("#7a2fff")], [-2, 11, 7, 6, "#0c0c10"], [-1.6, 11.4, 6.2, 5, W("#2fd07a")], [-6, 10.5, 9, 0.6, "$a"]],
    after: (c, cx, fy, s) => word(c, "RGB", cx - 2 * s, fy, 18.5, s, "#30f0ff", 1.8) },
  { id: "server-rack", name: "SERVER RACK", rooms: ["study", "living", "bedroom"], tiers: [0, 1, 2], role: "desk", fw: 12, glow: true,
    rects: [[-6, 0, 12, 30, "#16181c"], [-5.4, 0.6, 10.8, 28.8, "#0c0d10"], ...Array.from({ length: 8 }, (_, k) => [-5, 2 + k * 3.4, 10, 2.6, "#23262c"]),
      ...Array.from({ length: 8 }, (_, k) => [3, 2.8 + k * 3.4, 0.8, 0.8, k % 3 ? ["#1a3a1a", "#40ff70"] : ["#3a2a0a", "#ffb030"]]), ...Array.from({ length: 8 }, (_, k) => [-4, 3 + k * 3.4, 5, 0.4, "#3a3e46"])],
    after: (c, cx, fy, s) => word(c, "UPTIME", cx, fy, 31.5, s, "#40ff70", 1.8) },
  { id: "golf-cabinet", name: "BAR-TOP GOLF CABINET", rooms: ["living", "bedroom", "study"], tiers: [0, 1, 2], fw: 10, glow: true, tints: [["#0e3a1e", "#e8c040"]],
    rects: [[-5, 0, 10, 24, "$a"], [-5, 24, 10, 4, "$b"], [-4, 13, 8, 8, ["#103018", "#5ad870"]], [-3.5, 15, 7, 2, ["#16401e", "#8af0a0"]], [-5, 10, 10, 2.4, "#1a1a1a"], [-1, 11.4, 2, 1.6, "#e8e8e8"], [-3.5, 11, 1, 1, "#e03030"], [2.5, 11, 1, 1, "#3070e0"], [-3, 3, 6, 4, "#151515"]],
    after: (c, cx, fy, s) => word(c, "GOLF", cx, fy, 26, s, "#0e3a1e", 2.4) },
  { id: "golf-sim", name: "HOME GOLF SIMULATOR", rooms: ["study", "living"], tiers: [0, 1, 2], fw: 26, glow: true, whole: true,
    rects: [[-13, 0, 1, 30, "#7a7f7a"], [12, 0, 1, 30, "#7a7f7a"], [-13, 30, 26, 1, "#7a7f7a"], [-12, 5, 24, 24, "rgba(200,210,200,0.10)"],
      [-11, 9, 22, 17, ["#203040", "#7fc8ff"]], [-11, 9, 22, 6, ["#1e3a20", "#4aa84a"]], [-11, 9, 22, 2, ["#1a3020", "#3a8a3a"]], [4, 14, 0.6, 6, "#eeeeee"], [4.6, 18.4, 2.4, 1.6, "#e03030"],
      [-8, 0, 16, 0.9, "#2e7a2e"], [-0.4, 0.9, 0.8, 0.8, "#ffffff"], [-2, 38, 4, 2, "#2a2a2a"], [-0.5, 37, 1, 1, ["#3a3a3a", "#c8f0ff"]]],
    after: (c, cx, fy, s) => word(c, "PAR 4 // 412 YDS", cx, fy, 24, s, "#e8f8ff", 2) },
  { id: "ebtv-big", name: "EBTV BIG SCREEN", rooms: ["living", "bedroom"], tiers: [0, 1, 2], role: "tv", fw: 18,
    rects: [[-6, 0, 12, 4, "#2a2a2a"], [-1, 4, 2, 2, "#2a2a2a"], [-9, 6, 18, 12, "#101010"], [-8.5, 6.5, 17, 11, ["#14202a", "#1d6fe0"]], [6.5, 15.5, 1.5, 1.5, ["#5a1a1a", "#ff4040"]]],
    after: (c, cx, fy, s, o) => {
      const x = Math.round(cx - 8.5 * s), y = Math.round(fy - 17.5 * s), w = Math.round(17 * s), h = Math.round(11 * s);
      if (o.on && o.screen && o.screen(c, x, y, w, h)) return;
      if (!drawBrand(c, "eb-logo", cx, fy - 12 * s, 7 * s, { neon: o.on, alpha: o.on ? 1 : 0.45 })) word(c, "EBTV", cx, fy, 12, s, o.on ? "#ffffff" : "#5a7a9a", 3.4);
    } },
  { id: "home-theater", name: "HOME THEATER", rooms: ["living", "study"], tiers: [0, 1, 2], role: "tv", fw: 26, whole: true, tints: [["#6a1a22", "#4a1018"]],
    rects: [[-12.5, 13.5, 25, 15, "#0a0a0a"], [-12, 14, 24, 14, ["#14202a", "#1d6fe0"]], [-1.5, 39, 3, 2, "#2a2a2a"], [-0.5, 38, 1, 1, ["#333", "#fff7c0"]],
      [-11, 0, 6, 4, "$a"], [-11, 4, 6, 4, "$b"], [-3, 0, 6, 4, "$a"], [-3, 4, 6, 4, "$b"], [5, 0, 6, 4, "$a"], [5, 4, 6, 4, "$b"], [-12, 0, 1, 6, "#2a1a10"], [11, 0, 1, 6, "#2a1a10"]],
    after: (c, cx, fy, s, o) => {
      const x = Math.round(cx - 12 * s), y = Math.round(fy - 28 * s), w = Math.round(24 * s), h = Math.round(14 * s);
      if (o.on && o.screen && o.screen(c, x, y, w, h)) return;
      if (!drawBrand(c, "eb-logo", cx, fy - 21 * s, 10 * s, { neon: o.on, alpha: o.on ? 1 : 0.45 })) word(c, "EBTV", cx, fy, 21, s, o.on ? "#ffffff" : "#5a7a9a", 4);
    } },
  { id: "kegerator", name: "IRENE'S KEGERATOR", rooms: ["kitchen", "living"], tiers: [0, 1, 2], fw: 10,
    rects: [[-5, 0, 10, 14, "#8c1622"], [-5, 14, 10, 1.2, "#c0c0c0"], [-0.5, 15.2, 1, 4, "#c0c0c0"], [-2.5, 18.4, 5, 1, "#c0c0c0"], [-2.5, 17.4, 1, 1, "#a3a028"], [1.5, 17.4, 1, 1, "#a3a028"], [-4, 2, 8, 0.6, "#5a0a12"], [3, 5, 1, 4, "#c0c0c0"]],
    // the door wears the pub's arch and flame, cream on the brick red
    after: (c, cx, fy, s) => { if (!drawBrand(c, "irenes-arch", cx, fy - 9 * s, 3.4 * s, { alpha: 0.95 })) word(c, "IRENE'S", cx, fy, 9, s, "#f7f5ec", 2); } },
  { id: "brewery", name: "HOME BREWERY", rooms: ["kitchen"], tiers: [0, 1, 2], fw: 18, glow: true,
    rects: [[-8, 0, 7, 12, "#b87333"], [-7.5, 12, 6, 2, "#d08a48"], [-5, 14, 1, 4, "#b87333"], [1, 0, 7, 17, "#c8ccd0"], [2, 17, 5, 2, "#a8acb0"], [-1, 7, 2, 1, "#b87333"], [-1, 9, 2, 1, "#8a8a8a"], [3, 6, 3, 2, ["#3a3a3a", "#4ade80"]], [-9, 0, 18, 0.6, "#3a2a1a"]],
    after: (c, cx, fy, s) => word(c, "HOME BREW", cx, fy, 22, s, "#f8d890", 2.2) },
  { id: "globe", name: "GLOBE", rooms: ["study"], tiers: [0, 1], fw: 6,
    rects: [[-2, 0, 4, 1, "#5a4632"], [-0.5, 1, 1, 6, "#5a4632"], [-3, 7, 6, 6, "#3d6b8f"], [-1.5, 9, 2, 2, "#4a8a4a"], [0.5, 8, 1.5, 3, "#4a8a4a"]] },
  { id: "filing", name: "FILING CABINET", rooms: ["study"], tiers: [0, 1, 2], fw: 7,
    rects: [[-3.5, 0, 7, 18, "#5a6a6a"], [-3, 6, 6, 0.6, "#3a4a4a"], [-3, 12, 6, 0.6, "#3a4a4a"], [-1, 3, 2, 0.8, "#c0c0c0"], [-1, 9, 2, 0.8, "#c0c0c0"], [-1, 15, 2, 0.8, "#c0c0c0"]] },
  { id: "drafting", name: "DRAFTING TABLE", rooms: ["study"], tiers: [0, 1], role: "desk", fw: 14,
    rects: [[-6, 0, 1, 12, "#5a5a5a"], [5, 0, 1, 12, "#5a5a5a"], [-7, 12, 14, 1.5, "#e8e4d8"], [-7, 13.5, 14, 1.5, "#d8d4c8"], [-3, 15, 1, 3, "#3a3a3a"], [-3, 18, 4, 0.6, "#3a3a3a"]] },
  { id: "desk", name: "DESK", rooms: ["study", "office"], tiers: [0, 1, 2], role: "desk", fw: 14,
    rects: [[-7, 9, 14, 1.5, "#6b5038"], [-6, 0, 1, 9, "#4b3828"], [5, 0, 1, 9, "#4b3828"], [-3, 10.5, 6, 5, W("#4ade80")], [-2, 0, 4, 6, "#333"]] },
  // ---- bathroom
  { id: "tub", name: "BATHTUB", rooms: ["bath"], tiers: [0, 1, 2], role: "tub", fw: 16, tints: [["#dfe6e3"], ["#e6dcc8"], ["#c8e0dc"]],
    rects: [[-8, 0, 16, 6, "$a"], [-8, 6, 16, 1, "#f4f7f5"], [6, 7, 1, 4, "#9a9a9a"]] },
  { id: "clawfoot", name: "CLAWFOOT TUB", rooms: ["bath"], tiers: [0], role: "tub", fw: 16,
    rects: [[-8, 1.5, 16, 6, "#f4f2ec"], [-8.5, 7.5, 17, 1, "#c9a34a"], [-7, 0, 1.5, 1.5, "#c9a34a"], [5.5, 0, 1.5, 1.5, "#c9a34a"], [6, 8.5, 1, 4, "#c9a34a"]] },
  { id: "shower", name: "SHOWER STALL", rooms: ["bath"], tiers: [1, 2], role: "tub", fw: 10,
    rects: [[-5, 0, 10, 1.5, "#d8dcda"], [-5, 1.5, 0.6, 24, "#9ab"], [4.4, 1.5, 0.6, 24, "#9ab"], [-4.4, 1.5, 8.8, 24, "rgba(170,210,230,0.18)"], [-1, 22, 3, 1, "#c0c0c0"], [0, 23, 0.6, 3, "#c0c0c0"]] },
  { id: "sink", name: "SINK AND MIRROR", rooms: ["bath"], tiers: [0, 1, 2], role: "sink", fw: 6, tints: [["#6f9797"], ["#8a8a7a"], ["#9a8a6a"]],
    rects: [[-1, 0, 2, 8, "#d5d5d0"], [-3, 8, 6, 2, "#ececea"], [-3, 15, 6, 7, "$a"]] },
  { id: "toilet", name: "TOILET", rooms: ["bath"], tiers: [0, 1, 2], fw: 6,
    rects: [[-2, 0, 4, 5, "#e4e4e0"], [-3, 5, 6, 1, "#f0f0ec"], [1, 6, 2, 6, "#e4e4e0"]] },
  { id: "towels", name: "TOWEL RAIL", rooms: ["bath"], tiers: [0, 1, 2], wall: true, fw: 6, tints: [["#c84a4a"], ["#4a8ac8"], ["#e0c040"], ["#4a8a6a"]],
    rects: [[-3, 20, 6, 0.6, "#c0c0c0"], [-2.5, 14, 2.5, 6, "$a"], [0.5, 15, 2.5, 5, "#e8e4d8"]] },
  // ---- the rest of the building (kept as they were: a later pass dresses these)
  { id: "mailboxes", name: "MAILBOXES", rooms: ["lobby"], tiers: [0, 1, 2], fw: 12,
    rects: [[-6, 8, 12, 12, "#7d8270"], [-5, 10, 4, 3, "#4a4f40"], [1, 10, 4, 3, "#4a4f40"], [-5, 15, 4, 3, "#4a4f40"], [1, 15, 4, 3, "#4a4f40"]] },
  { id: "reception", name: "RECEPTION DESK", rooms: ["lobby"], tiers: [0, 1, 2], fw: 14,
    rects: [[-7, 0, 14, 10, "#4b5a52"], [-7, 10, 14, 1.5, "#9fb3a8"]] },
  { id: "cooler", name: "WATER COOLER", rooms: ["office"], tiers: [0, 1, 2], fw: 4,
    rects: [[-2, 0, 4, 12, "#cfe3dd"], [-1.5, 12, 3, 4, "#6fb3ff"]] },
  { id: "rack", name: "CLOTHES RACK", rooms: ["shop"], tiers: [0, 1, 2], fw: 10,
    rects: [[-5, 0, 10, 18, "#4a4a4a"], [-4, 2, 8, 3, "#a33"], [-4, 7, 8, 3, "#3a7"], [-4, 12, 8, 3, "#c93"]] },
  { id: "till", name: "TILL", rooms: ["shop"], tiers: [0, 1, 2], fw: 12,
    rects: [[-6, 0, 12, 9, "#4a5a4a"], [-2, 9, 4, 3, "#1e1e1e"]] },
  { id: "bar", name: "BAR", rooms: ["lounge"], tiers: [0, 1, 2], fw: 18,
    rects: [[-9, 0, 18, 10, "#5a3020"], [-9, 10, 18, 1.5, "#b07a4a"], [-8, 18, 16, 1, "#3a2a1a"], [-7, 19, 2, 4, "#5a8a5a"], [-3, 19, 2, 5, "#8a5a3a"], [2, 19, 2, 4, "#5a5a8a"]] },
  { id: "stool", name: "BAR STOOL", rooms: ["lounge", "taproom"], tiers: [0, 1, 2], fw: 4,
    rects: [[-0.5, 0, 1, 6, "#555"], [-2, 6, 4, 1.2, "#a33"]] },
  { id: "safe", name: "SAFE", rooms: ["vault"], tiers: [0, 1, 2], fw: 10,
    rects: [[-5, 0, 10, 12, "#5a5f66"], [-1, 5, 2, 2, "#cfcfcf"]] },
  // ---- THE SHORE PLAZA (shorePlaza.js): SAM'S PIZZA PALACE at the street, GOODNIGHT IRENE'S over it.
  // Trade fittings, never sold (THE SHOPS price only what they list). The signs take the real marks
  // from the atlas (brand.js: "irenes" now; "sams" when Sam's sends its logo) over lettering.
  { id: "pizza-oven", name: "DECK OVENS", rooms: ["pizzeria"], tiers: [0, 1, 2], role: "desk", fw: 14, glow: true,
    rects: [[-7, 0, 14, 11, "#57534e"], [-7, 11, 14, 8, "#a8a29e"], [-6, 12, 12, 5, "#1c1917"], [-5, 13, 10, 2, ["#ea580c", "#fb923c"]], [-7, 19, 14, 1.5, "#b91c1c"],
      [-7, 20.5, 14, 8, "#a8a29e"], [-6, 21.5, 12, 5, "#1c1917"], [-5, 22.5, 10, 2, ["#ea580c", "#fb923c"]], [-7, 28.5, 14, 1.2, "#78716c"], [3, 29.7, 2, 6, "#57534e"]] },
  { id: "pizza-counter", name: "THE SLICE COUNTER", rooms: ["pizzeria"], tiers: [0, 1, 2], role: "bar", fw: 20,
    rects: [[-10, 0, 20, 10, "#b91c1c"], [-10, 2, 3, 3, "#f5f5f4"], [-4, 2, 3, 3, "#f5f5f4"], [2, 2, 3, 3, "#f5f5f4"], [8, 2, 2, 3, "#f5f5f4"], [-7, 5, 3, 3, "#f5f5f4"], [-1, 5, 3, 3, "#f5f5f4"], [5, 5, 3, 3, "#f5f5f4"],
      [-10, 10, 20, 1.5, "#d4d4d8"], [-8, 11.5, 5, 1, "#fbbf24"], [-2, 11.5, 5, 1, "#fbbf24"], [4, 11.5, 4, 1, "#fbbf24"], [-7, 11.5, 1, 0.6, "#b91c1c"], [0, 11.5, 1, 0.6, "#b91c1c"], [5, 11.5, 1, 0.6, "#b91c1c"],
      [-9, 12.5, 18, 4, "rgba(200,230,240,0.22)"]] },
  { id: "sams-sign", name: "SAM'S PIZZA PALACE SIGN", rooms: ["pizzeria"], tiers: [0, 1, 2], wall: true, fw: 22,
    rects: [[-11, 21, 22, 7, "#b91c1c"], [-10.5, 21.5, 21, 6, "#fef2f2"]],
    after: (c, cx, fy, s) => { if (!drawBrand(c, "sams", cx, fy - 24.5 * s, 5.4 * s)) { word(c, "SAM'S PIZZA PALACE", cx, fy, 25.4, s, "#b91c1c", 1.8); word(c, "BY THE SLICE", cx, fy, 22.8, s, "#57534e", 1.3); } } },
  { id: "diner-booth", name: "BOOTH", rooms: ["booths"], tiers: [0, 1, 2], role: "table", fw: 16,
    rects: [[-8, 0, 2, 14, "#b91c1c"], [6, 0, 2, 14, "#b91c1c"], [-8, 0, 4, 6, "#7f1d1d"], [4, 0, 4, 6, "#7f1d1d"], [-0.5, 0, 1, 8, "#9ca3af"], [-3.5, 8, 7, 1.2, "#e5e5e5"],
      [-2.5, 9.2, 2.5, 0.8, "#fbbf24"], [1, 9.2, 1, 2, "#b91c1c"], [-8, 14, 16, 0.6, "#7f1d1d"]] },
  { id: "mash-tun", name: "MASH TUN", rooms: ["brewhouse"], tiers: [0, 1, 2], role: "desk", fw: 12,
    rects: [[-6, 0, 12, 2, "#57534e"], [-5, 2, 10, 16, "#b45309"], [-4, 3, 2, 14, "#d97706"], [-5.5, 18, 11, 2, "#78350f"], [-0.5, 20, 1, 6, "#a8a29e"], [-6, 9, 1.2, 1.2, "#a8a29e"]],
    after: (c, cx, fy, s) => word(c, "MASH", cx, fy, 10, s, "#fde68a", 2) },
  { id: "brew-kettle", name: "BREW KETTLE", rooms: ["brewhouse"], tiers: [0, 1, 2], role: "desk", fw: 12, glow: true,
    rects: [[-5, 0, 10, 1, ["#7c2d12", "#f97316"]], [-5, 1, 10, 2, "#57534e"], [-5, 3, 10, 13, "#c2410c"], [-4, 4, 2, 11, "#ea580c"], [-4, 16, 8, 3, "#b45309"], [-2, 19, 4, 2, "#b45309"], [-0.5, 21, 1, 9, "#a8a29e"]],
    after: (c, cx, fy, s) => word(c, "KETTLE", cx, fy, 9, s, "#fde68a", 1.8) },
  { id: "fermenter", name: "FERMENTER", rooms: ["brewhouse"], tiers: [0, 1, 2], role: "desk", fw: 10, glow: true,
    rects: [[-3.5, 0, 1, 7, "#78716c"], [2.5, 0, 1, 7, "#78716c"], [-1, 4, 2, 3, "#a8a29e"], [-4, 7, 8, 3, "#cbd5e1"], [-4.5, 10, 9, 19, "#d4d4d8"], [-3.5, 11, 2, 17, "#f1f5f9"], [-4.5, 29, 9, 2, "#a1a1aa"],
      [-1, 16, 2, 2, ["#3a3a3a", "#4ade80"]]] },
  { id: "bright-tank", name: "BRIGHT TANK", rooms: ["cellar"], tiers: [0, 1, 2], role: "desk", fw: 10,
    rects: [[-5, 0, 10, 2, "#57534e"], [-4.5, 2, 9, 22, "#e2e8f0"], [-3.5, 3, 2, 20, "#f8fafc"], [-4.5, 24, 9, 2, "#94a3b8"], [3.5, 8, 1, 9, "#94a3b8"]],
    after: (c, cx, fy, s) => word(c, "BRIGHT", cx, fy, 13, s, "#475569", 1.6) },
  { id: "grain-sacks", name: "THE MALT (GRAIN ROOM)", rooms: ["cellar"], tiers: [0, 1, 2], fw: 13,
    rects: [[-6.5, 0, 5, 6, "#d6c7a1"], [-1.5, 0, 5, 6, "#c8b88f"], [3.5, 0, 3, 5, "#d6c7a1"], [-4.5, 6, 5, 5, "#cdbd94"], [0.5, 6, 5, 5, "#d6c7a1"], [-2, 11, 5, 4.5, "#c8b88f"], [-6.5, 3, 5, 0.6, "#8a7a50"], [0.5, 8.5, 5, 0.6, "#8a7a50"]],
    after: (c, cx, fy, s) => word(c, "MALT", cx, fy, 3, s, "#5a4a2a", 1.6) },
  { id: "keg-stack", name: "KEGS", rooms: ["cellar"], tiers: [0, 1, 2], fw: 10,
    rects: [[-5, 0, 4.5, 6, "#a1a1aa"], [0.5, 0, 4.5, 6, "#a1a1aa"], [-2.75, 6, 4.5, 6, "#d4d4d8"], [-5, 2.6, 4.5, 0.7, "#8c1622"], [0.5, 2.6, 4.5, 0.7, "#8c1622"], [-2.75, 8.6, 4.5, 0.7, "#a3a028"]] },
  { id: "tap-bar", name: "THE BAR AND THE TAPS", rooms: ["taproom"], tiers: [0, 1, 2], role: "bar", fw: 22,
    rects: [[-11, 0, 22, 11, "#4a2a14"], [-11, 11, 22, 1.5, "#7c4a24"], [-7, 12.5, 11, 1.2, "#c0c0c0"], [-6.5, 13.7, 1, 3, "#d4d4d8"], [-4.5, 13.7, 1, 3, "#d4d4d8"], [-2.5, 13.7, 1, 3, "#d4d4d8"],
      [-0.5, 13.7, 1, 3, "#d4d4d8"], [1.5, 13.7, 1, 3, "#d4d4d8"], [-6.5, 16.7, 1, 1, "#a3a028"], [-2.5, 16.7, 1, 1, "#8c1622"], [1.5, 16.7, 1, 1, "#a3a028"], [6, 12.5, 2, 3, "#f59e0b"], [-11, 5, 22, 0.6, "#2a160a"]] },
  { id: "irenes-sign", name: "GOODNIGHT IRENE'S SIGN", rooms: ["taproom"], tiers: [0, 1, 2], wall: true, fw: 22,
    rects: [[-11, 20, 22, 8.5, "#231f20"], [-10.5, 20.5, 21, 7.5, "#f7f5ec"]],
    after: (c, cx, fy, s) => { if (!drawBrand(c, "irenes", cx, fy - 24.25 * s, 6.6 * s)) word(c, "GOODNIGHT IRENE'S", cx, fy, 24.25, s, "#8c1622", 2.6); } },
  { id: "brick-oven", name: "THE BRICK OVEN (FROM THE SIGN)", rooms: ["snug"], tiers: [0, 1, 2], fw: 14, glow: true,
    rects: [[-7, 0, 14, 14, "#8c3a2a"], [-7, 4.5, 14, 0.5, "#6a2a20"], [-7, 9, 14, 0.5, "#6a2a20"], [-4, 2, 8, 6, "#1c1917"], [-3, 8, 6, 1.5, "#1c1917"], [-2, 9.5, 4, 1, "#1c1917"],
      [-2.5, 2, 5, 2, ["#c2410c", "#f97316"]], [-1, 4, 2, 2, ["#ea580c", "#fde047"]], [-1.5, 14, 3, 9, "#7a2e22"]],
    after: (c, cx, fy, s) => { if (!drawBrand(c, "irenes-arch", cx, fy - 18 * s, 3.4 * s, { alpha: 0.9 })) word(c, "IRENE'S", cx, fy, 18, s, "#f7f5ec", 1.6); } },
  { id: "pub-table", name: "PUB TABLE", rooms: ["snug"], tiers: [0, 1, 2], role: "table", fw: 12,
    rects: [[-6, 8, 12, 1.5, "#7c4a24"], [-1, 0, 2, 8, "#4a2a14"], [-3, 0, 6, 1, "#4a2a14"], [-4, 9.5, 1.5, 3, "#f59e0b"], [2, 9.5, 1.5, 3, "#a3a028"]] },
  { id: "stage-corner", name: "THE STAGE CORNER", rooms: ["snug"], tiers: [0, 1, 2], fw: 12,
    rects: [[-6, 0, 12, 1, "#8c1622"], [-0.3, 1, 0.6, 14, "#9ca3af"], [-1, 15, 2, 1.5, "#111111"], [2.5, 1, 4, 6, "#1f2937"], [3, 2, 3, 4, "#374151"]],
    after: (c, cx, fy, s) => word(c, "LIVE", cx, fy, 20, s, "#fde047", 2) },
];
const footprintOf = (rects) => {
  let top = 0;
  for (const r of rects) top = Math.max(top, r[1] + r[3]);
  return Math.round(top);
};
export const CATALOG = Object.freeze(Object.fromEntries(ITEMS.map(it => [it.id, Object.freeze({
  id: it.id, name: it.name, rooms: it.rooms, tiers: it.tiers, role: it.role || it.id,
  footprint: { w: it.fw, h: footprintOf(it.rects) }, wall: !!it.wall, floor: !!it.floor, glow: !!it.glow, whole: !!it.whole,
  tints: it.tints || null,
  draw(c, cx, fy, s, o = {}) { paint(c, it.rects, cx, fy, s, o); it.after?.(c, cx, fy, s, o); },
})])));
// A piece by id: the catalog's, an EB SHOP virtual copy's (ebPieces.js, "v-..." ids), or a tournament
// trophy (trophyPieces.js, "trophy...." ids).
export const pieceOf = (id) => CATALOG[id] || ebPiece(id) || trophyPiece(id);
export const drawItem = (c, id, cx, fy, s, o) => pieceOf(id)?.draw(c, cx, fy, s, o);

// ---- layouts ------------------------------------------------------------------------------------
// [x, choices]: choices are catalog ids, filtered by the band; the first allowed is the fallback.
const BEDS = ["bed-double", "bed-single", "bed-bunk", "bed-futon", "bed-canopy"];
const SOFAS = ["sofa", "sectional", "loveseat", "beanbag", "armchair"];
const TVS = ["tv", "tv-crt", "tv-flat", "ebtv"];
const PLANTS = ["plant", "plant-tall", "cactus"];
const LAYOUTS = {
  bedroom: [
    [[0.38, BEDS], [0.86, ["wardrobe", "dresser"]], [0.1, ["nightstand", "lamp"]], [0.62, ["painting", "poster"]]],
    [[0.55, BEDS], [0.14, ["dresser", "wardrobe"]], [0.9, ["lamp", ...PLANTS]], [0.25, ["poster", "painting"]]],
    [[0.32, BEDS], [0.32, ["rug"]], [0.78, ["wardrobe", "bookshelf"]], [0.95, PLANTS]],
    [[0.12, ["wardrobe", "dresser"]], [0.56, BEDS], [0.9, ["nightstand", "lamp"]], [0.56, ["painting", "poster"]]],
  ],
  kitchen: [
    [[0.1, ["fridge", "fridge-retro", "fridge-steel"]], [0.3, ["stove", "range"]], [0.5, ["counter"]], [0.8, ["table", "table-round", "dinette"]]],
    [[0.2, ["table-round", "table", "dinette"]], [0.52, ["counter"]], [0.7, ["stove", "range"]], [0.9, ["fridge-retro", "fridge", "fridge-steel"]]],
    [[0.12, ["fridge-steel", "fridge", "fridge-retro"]], [0.33, ["counter"]], [0.52, ["range", "stove"]], [0.82, ["dinette", "table", "table-round"]], [0.33, ["pots"]]],
    [[0.18, ["range", "stove"]], [0.5, ["island", "table"]], [0.88, ["fridge-steel", "fridge-retro", "fridge"]], [0.18, ["pots"]]],
  ],
  living: [
    [[0.12, TVS], [0.5, ["rug"]], [0.55, SOFAS], [0.9, PLANTS]],
    [[0.3, SOFAS], [0.78, TVS], [0.06, ["lamp"]], [0.3, ["painting", "poster"]]],
    [[0.1, ["bookshelf"]], [0.36, ["armchair", "sofa"]], [0.68, TVS], [0.93, PLANTS]],
    [[0.45, SOFAS], [0.45, ["rug"]], [0.12, TVS], [0.92, ["lamp", "plant-tall", "plant"]], [0.7, ["painting", "poster"]]],
  ],
  bath: [
    [[0.4, ["tub", "clawfoot", "shower"]], [0.85, ["sink"]], [0.12, ["towels"]]],
    [[0.2, ["shower", "tub", "clawfoot"]], [0.55, ["toilet"]], [0.85, ["sink"]]],
    [[0.15, ["sink"]], [0.55, ["clawfoot", "tub", "shower"]], [0.9, ["plant", "toilet"]]],
    [[0.42, ["tub", "shower", "clawfoot"]], [0.12, ["toilet"]], [0.85, ["sink"]], [0.85, ["towels"]]],
  ],
  study: [
    [[0.15, ["bookshelf"]], [0.6, ["desk", "pc"]], [0.88, ["lamp"]]],
    [[0.3, ["desk", "drafting"]], [0.7, ["globe", "armchair"]], [0.9, ["bookshelf"]]],
    [[0.5, ["pc", "desk"]], [0.13, ["filing"]], [0.9, ["plant-tall", "plant", "cactus"]]],
    [[0.4, ["drafting", "desk"]], [0.86, ["bookshelf", "filing"]], [0.12, ["armchair", "lamp"]]],
  ],
};

// ---- what the residents bring -----------------------------------------------------------------
// tags come from the residents' files (Cutaway.jsx tagsOf): art, music, scholar, athlete,
// broadcast, tech, cook, hedonist. The prop each brings, best first.
export const TAG_PROPS = {
  art: ["easel"], music: ["piano", "grand-piano", "record-player"], scholar: ["bookshelf", "books"],
  athlete: ["weights", "trophies"], broadcast: ["ebtv"], tech: ["pc"], cook: ["pots"], hedonist: ["arcade"],
};
const GENERIC_EXTRAS = ["record-player", "aquarium", "armchair", "books", "plant-tall", "cactus", null, null];

// ---- palettes ---------------------------------------------------------------------------------
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
const BAND_WALL = [
  { hues: [200, 215, 160, 30, 260, 340, 45], s: [14, 26], l: [17, 23] },   // the top tier: cool, deep, considered
  { hues: [25, 40, 55, 90, 140, 190, 330, 12], s: [16, 30], l: [15, 21] },  // the middle: plaster and paper
  { hues: [60, 80, 100, 30, 180], s: [8, 16], l: [12, 17] },                // the bottom: whatever was cheapest
];
const PAPERS = [["plain", "stripes", "panel", "damask", "pinstripe"], ["plain", "stripes", "dots", "diamonds", "pinstripe", "panel"], ["plain", "plain", "brick", "stain", "dots"]];
const FLOORS = [["wood", "carpet", "marble", "wood"], ["wood", "carpet", "carpet", "lino"], ["lino", "carpet", "boards"]];
const CARPETS = ["#5a2f2f", "#2f4a5a", "#4a5a2f", "#5a4a2f", "#3a2f5a", "#2f5a45", "#6a5a4a", "#7a3a20", "#3a3a3a"];
const WOODS = ["#6a4a2a", "#8a6a40", "#4a3220", "#9a7a50", "#5a3a28"];
const CURTAINS = ["#8f2d3a", "#2d4a8f", "#3a7a4a", "#c9a34a", "#6a3a7a", "#c86a3a", "#d8d0c0", "#2a2a2a", "#4a8a9a"];
const CORRIDORS = ["#3a2a2a", "#2a3440", "#2e3a28", "#40342a", "#33283e", "#263a36", "#3e3a24", "#402a36"];

export function floorStyle(storeyId, penthouse = false) {
  if (penthouse) return { corridor: "#4a3a1a", trim: "#c9a34a", plaque: "#e8c860" };
  const i = Math.floor(h01(`${storeyId}|corridor`) * CORRIDORS.length);
  return { corridor: CORRIDORS[i], trim: null, plaque: CORRIDORS[(i + 3) % CORRIDORS.length] };
}

// ---- dressing ---------------------------------------------------------------------------------
const allowed = (id, purpose, band) => { const it = CATALOG[id]; return it && it.rooms.includes(purpose) && it.tiers.includes(band); };
function choose(choices, purpose, band, key) {
  const ok = choices.filter(id => allowed(id, purpose, band));
  return ok.length ? pick(ok, key) : null;
}
function place(list, id, x, key) {
  const it = CATALOG[id];
  const tint = it.tints ? pick(it.tints, `${key}|tint`) : null;
  list.push({ item: id, x: Math.max(0.06, Math.min(0.94, x)), role: it.role, tint, flip: h01(`${key}|flip`) < 0.5 && !it.wall });
}
// a free spot for one more piece: the widest gap between floor pieces
function freeX(list) {
  const xs = list.filter(f => !CATALOG[f.item].wall && !CATALOG[f.item].floor).map(f => f.x).concat([0, 1]).sort((a, b) => a - b);
  let best = 0.5, gap = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; best = (xs[i] + xs[i - 1]) / 2; }
  return best;
}

// ctx: {band 0..2, penthouse, tags: string[] (sorted), purposeOrder?}
// -> {wall, paper, curtain, rooms: {roomId: {furniture, floor: {kind, colour}, wall}}}
export function dressUnit(unit, ctx = {}) {
  const band = ctx.penthouse ? 0 : (ctx.band ?? 1), id = unit.id, tags = ctx.tags || [];
  const P = BAND_WALL[band];
  const wh = pick(P.hues, `${id}|hue`), ws = P.s[0] + h01(`${id}|sat`) * (P.s[1] - P.s[0]), wl = P.l[0] + h01(`${id}|lit`) * (P.l[1] - P.l[0]);
  const look = {
    wall: hsl(wh, ws, wl), paper: pick(PAPERS[band], `${id}|paper`), paperInk: hsl(wh + 20, ws + 8, wl + 7),
    curtain: pick(CURTAINS, `${id}|curtain`), penthouse: !!ctx.penthouse, rooms: {},
  };
  const floorKind = ctx.penthouse ? "marble" : pick(FLOORS[band], `${id}|floor`);
  const floorCol = floorKind === "carpet" ? pick(CARPETS, `${id}|carpet`) : floorKind === "wood" || floorKind === "boards" ? pick(WOODS, `${id}|wood`) : floorKind === "marble" ? "#d8d4cc" : pick(["#8a8a7a", "#6a7a8a", "#8a6a5a", "#5a6a5a"], `${id}|lino`);
  // the personal touch: one prop per tag the residents carry, in the living room (or the study, or the bedroom)
  const wants = [];
  for (const t of tags) for (const p of TAG_PROPS[t] || []) if (!wants.includes(p)) { wants.push(p); break; }
  if (!wants.includes("arcade") && h01(`${id}|arcade`) < 1 / 15) wants.push("arcade");
  if (band === 0 && h01(`${id}|tap`) < 0.2) wants.push("beer-tap");
  const generic = pick(GENERIC_EXTRAS, `${id}|extra`);
  const purposes = unit.rooms.map(r => r.purpose);
  for (const r of unit.rooms) {
    const key = r.id, layouts = LAYOUTS[r.purpose];
    const list = [];
    if (layouts) {
      const L = pick(layouts, `${key}|layout`), mirror = h01(`${key}|mirror`) < 0.5;
      for (const [x, choices] of L) {
        // a broadcaster's set is EBTV; a penthouse living room has the sectional
        let c = choices;
        if (choices === TVS && tags.includes("broadcast")) c = ["ebtv"];
        const pid = choose(c, r.purpose, band, `${key}|${x}`);
        if (pid) place(list, pid, mirror ? 1 - x : x, `${key}|${x}`);
      }
      if (ctx.penthouse && r.purpose === "living") {
        place(list, "chandelier", 0.24, `${key}|chand`);
        if (!list.some(f => f.item === "grand-piano")) place(list, "grand-piano", freeX(list), `${key}|grand`);
      }
    } else {
      for (const f of r.furniture) place(list, f.item, f.x, `${key}|${f.x}`);
    }
    look.rooms[r.id] = { furniture: list, floor: { kind: r.purpose === "bath" || (r.purpose === "kitchen" && band > 0) ? "tile" : floorKind, colour: floorCol } };
  }
  // the extras, each in the first room that takes it
  const order = ["living", "study", "bedroom", "kitchen"];
  const extras = [...wants];
  if (generic && !extras.length) extras.push(generic);
  const added = new Map();   // one extra a room, so nothing piles up
  for (const pid of extras) {
    const pref = pid === "beer-tap" ? ["kitchen", "living"] : order;
    const inRoom = pref.filter(p => purposes.includes(p) && CATALOG[pid]?.rooms.includes(p));
    for (const p of inRoom) {
      const r = unit.rooms.find(q => q.purpose === p), list = look.rooms[r.id].furniture;
      if (list.some(f => f.item === pid) || list.length >= 6 || (added.get(r.id) && !CATALOG[pid].wall)) continue;
      if (!CATALOG[pid].wall) added.set(r.id, 1);
      if (!CATALOG[pid].tiers.includes(band)) {
        // a grand piano for the top tier, an upright for the rest
        const alt = pid === "piano" ? "grand-piano" : pid === "grand-piano" ? "piano" : null;
        if (!alt || !allowed(alt, p, band)) continue;
        place(list, alt, freeX(list), `${r.id}|extra|${alt}`);
      } else place(list, pid, CATALOG[pid].wall ? 0.5 + (h01(`${r.id}|w`) - 0.5) * 0.4 : freeX(list), `${r.id}|extra|${pid}`);
      break;
    }
  }
  return look;
}

// A unit's signature (for the check): what a player would see repeat.
export const lookSig = (look) => [look.wall, look.paper, look.curtain, ...Object.values(look.rooms).map(r => `${r.floor.kind}/${r.floor.colour}:` + r.furniture.map(f => `${f.item}@${f.x.toFixed(2)}${f.flip ? "<" : ""}${f.tint ? f.tint[0] : ""}`).join(","))].join("|");
