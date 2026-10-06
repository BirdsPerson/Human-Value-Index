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

const h01 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const pick = (list, str) => list[Math.min(list.length - 1, Math.floor(h01(str) * list.length))];

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
    rects: [[-6, 0, 12, 10, "#3a2418"], [-6, 10, 12, 1.2, "#c89a5a"], [-3, 11, 1, 5, "#c0c0c0"], [-0.5, 11, 1, 5, "#c0c0c0"], [2, 11, 1, 5, "#c0c0c0"], [-4, 15, 8, 1.5, "#8a6a3a"], [-6, 19, 12, 5, ["#3a1a2a", "#ff6fae"]]],
    after: (c, cx, fy, s, o) => word(c, "IRENE'S", cx, fy, 21.5, s, o.on ? "#2a0a1a" : "#ff8fc0", 2.4) },
  // ---- living room
  { id: "tv", name: "TELEVISION", rooms: ["living"], tiers: [0, 1, 2], role: "tv", fw: 10,
    rects: [[-3, 0, 6, 5, "#2e2e2e"], [-5, 7, 10, 7, W("#7fe0b0")], [-0.5, 5, 1, 2, "#2e2e2e"]] },
  { id: "tv-crt", name: "CRT TELEVISION", rooms: ["living", "bedroom"], tiers: [1, 2], role: "tv", fw: 10, tints: [["#6a4a30"], ["#4a4a4a"]],
    rects: [[-5, 0, 10, 7, "$a"], [-4, 7, 8, 7, "#3a3a3a"], [-3, 8, 6, 5, W("#a0d8f0")], [-2, 14, 0.6, 4, "#888"], [1.4, 14, 0.6, 4, "#888"]] },
  { id: "tv-flat", name: "WALL TELEVISION", rooms: ["living"], tiers: [0, 1], role: "tv", fw: 14,
    rects: [[-7, 0, 14, 4, "#2a2a30"], [-7, 10, 14, 8, "#111"], [-6.5, 10.5, 13, 7, W("#6ab0ff")]] },
  { id: "ebtv", name: "EBTV TELEVISION", rooms: ["living", "bedroom"], tiers: [0, 1, 2], role: "tv", fw: 12,
    rects: [[-4, 0, 8, 5, "#2a2a2a"], [-6, 6, 12, 9, "#1a1a1a"], [-5.5, 6.5, 11, 8, ["#14202a", "#1d6fe0"]], [3, 12, 2, 2, ["#5a1a1a", "#ff4040"]]],
    after: (c, cx, fy, s, o) => word(c, "EBTV", cx - 0.5 * s, fy, 10.5, s, o.on ? "#ffffff" : "#5a7a9a", 3) },
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
  { id: "pc", name: "COMPUTER DESK", rooms: ["study", "living", "bedroom"], tiers: [0, 1, 2], role: "desk", fw: 14,
    rects: [[-7, 9, 14, 1.5, "#3a3a40"], [-6, 0, 1, 9, "#2a2a30"], [5, 0, 1, 9, "#2a2a30"], [-5, 10.5, 7, 5, "#111"], [-4.5, 11, 6, 4, W("#40e0a0")], [3, 10.5, 2, 6, "#2a2a30"], [3.5, 15, 1, 0.6, ["#1a3a1a", "#40ff40"]]] },
  { id: "arcade", name: "JETSAM ARCADE CABINET", rooms: ["living", "bedroom", "study"], tiers: [0, 1, 2], fw: 9, glow: true, tints: [["#2a1a4a", "#ff40c0"], ["#1a2a4a", "#40e0ff"], ["#4a1a1a", "#ffd040"]],
    rects: [[-4.5, 0, 9, 24, "$a"], [-4.5, 22, 9, 4, "$b"], [-3.5, 12, 7, 8, ["#203040", "#3ad0ff"]], [-3.5, 9, 7, 2, "#1a1a1a"], [-2, 10.5, 1, 1.5, "#ff3030"], [1, 10.5, 1, 1, "#30ff30"], [-3, 3, 6, 4, "#1a1a1a"]],
    after: (c, cx, fy, s) => word(c, "JETSAM!", cx, fy, 24, s, "#120820", 2.3) },
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
  { id: "stool", name: "BAR STOOL", rooms: ["lounge"], tiers: [0, 1, 2], fw: 4,
    rects: [[-0.5, 0, 1, 6, "#555"], [-2, 6, 4, 1.2, "#a33"]] },
  { id: "safe", name: "SAFE", rooms: ["vault"], tiers: [0, 1, 2], fw: 10,
    rects: [[-5, 0, 10, 12, "#5a5f66"], [-1, 5, 2, 2, "#cfcfcf"]] },
];
const footprintOf = (rects) => {
  let top = 0;
  for (const r of rects) top = Math.max(top, r[1] + r[3]);
  return Math.round(top);
};
export const CATALOG = Object.freeze(Object.fromEntries(ITEMS.map(it => [it.id, Object.freeze({
  id: it.id, name: it.name, rooms: it.rooms, tiers: it.tiers, role: it.role || it.id,
  footprint: { w: it.fw, h: footprintOf(it.rects) }, wall: !!it.wall, floor: !!it.floor, glow: !!it.glow,
  tints: it.tints || null,
  draw(c, cx, fy, s, o = {}) { paint(c, it.rects, cx, fy, s, o); it.after?.(c, cx, fy, s, o); },
})])));
export const drawItem = (c, id, cx, fy, s, o) => CATALOG[id]?.draw(c, cx, fy, s, o);

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
