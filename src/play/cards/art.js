// THE CARD ROOM's pixel cards: drawn here, pixel by pixel, at 1x (31 x 43), in the spirit of
// the cards on a Windows 3.x desktop (a white face, a hard black edge, chunky indices) and copied
// from nobody: the court cards are the Department's own double-headed portraits.
// Pure: no DOM. cardLayers(code, opts) -> [{fill, rects: [[x, y, w, h]...]}] that the page paints as
// SVG paths (PixelCard.jsx) or canvas rects (the win cascade); scripts/check-cards.mjs reads them.
//
// opts: {four: the four-colour deck (spades black, hearts red, diamonds blue, clubs green), big: the
// big-index face for small cards (Spider on a phone): a double-size rank and one large suit}.

export const CW = 31, CH = 43;
export const PAPER = "#f7f5ec";
const EDGE = "#1b1e24", GOLD = "#9a6b0e", SKIN = "#e0a47c", HAIR = "#4a2c17", WHITE = "#ffffff";
const INK2 = ["#16181d", "#b3121b", "#b3121b", "#16181d"];
const INK4 = ["#16181d", "#b3121b", "#1446b0", "#11693a"];
export const suitInk = (s, four = false) => (four ? INK4 : INK2)[s];

// ---- glyphs -------------------------------------------------------------------------------------
const RANK_GLYPH = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  2: [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
  3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  T: ["#.###", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "#.###"],
  J: ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
};
const SUIT5 = [
  ["..#..", ".###.", "#####", "#####", "..#..", ".###."],   // spades
  [".#.#.", "#####", "#####", ".###.", "..#.."],            // hearts
  ["..#..", ".###.", "#####", ".###.", "..#.."],            // diamonds
  [".###.", ".###.", "##.##", "#####", "..#..", ".###."],   // clubs
];
const SUIT7 = [
  ["...#...", "..###..", ".#####.", "#######", "#######", "##.#.##", "..###.."],
  [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
  ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  ["..###..", "..###..", "##.#.##", "#######", "##.#.##", "...#...", "..###.."],
];
const SUIT13 = [
  ["......#......", ".....###.....", "....#####....", "...#######...", "..#########..", ".###########.", "#############", "#############", "#############", ".####.#.####.", "..##..#..##..", ".....###.....", "....#####...."],
  ["..###...###..", ".#####.#####.", "#############", "#############", "#############", "#############", ".###########.", "..#########..", "...#######...", "....#####....", ".....###.....", "......#......", "............."],
  ["......#......", ".....###.....", "....#####....", "...#######...", "..#########..", ".###########.", "#############", ".###########.", "..#########..", "...#######...", "....#####....", ".....###.....", "......#......"],
  [".....###.....", "....#####....", "....#####....", "....#####....", ".##..###..##.", "#####.#.#####", "#############", "#####.#.#####", ".##...#...##.", "......#......", ".....###.....", "....#####....", "............."],
];
// The court cards' top halves (15 x 17), mirrored below. k: the suit's ink, y: gold, s: skin,
// h: hair, w: white, r: the robe's lining (the other ink).
const COURT = {
  K: [
    "...y.y.y.y.y...",
    "...yyyyyyyyy...",
    "...ykykykykyy..",
    "...yyyyyyyyy...",
    "...hhhhhhhhh...",
    "..hsssssssssh..",
    "..hsskssskssh..",
    "..hsssssssssh..",
    "..hhssshsssshh.",
    "...hhhrrrhhh...",
    "....hhhhhhh....",
    ".kkkkkhhhkkkkk.",
    "kkwwkkkkkkkwwkk",
    "kwkkwkyyykwkkwk",
    "kkwwkkyykkkwwkk",
    "kkkkkkyykkkkkkk",
    "kkyykkkkkkkyykk",
  ],
  Q: [
    "....y.y.y.y....",
    "....yyyyyyy....",
    "...hhhhhhhhh...",
    "..hhhhhhhhhhh..",
    "..hhsssssssshh.",
    ".hhsskssskssshh",
    ".hhssssssssshh.",
    ".hhssssrssssh..",
    "..hhsssssssshh.",
    "..hhhhssssshhh.",
    "...hh.sssss.hh.",
    "..kkkkwwwwwkkkk",
    ".kkwkkwyywwkkwk",
    ".kwkwkkyykkkwkw",
    ".kkwkkkyykkkkwk",
    ".kkkkkyyyykkkkk",
    ".kkykkkkkkkkykk",
  ],
  J: [
    "......kkk......",
    "....kkkkkkk.y..",
    "...kkkkkkkkkyy.",
    "..kyyyyyyyyyky.",
    "...hhhhhhhhh.y.",
    "...hsssssssh...",
    "...hskssskshh..",
    "...hsssssssh...",
    "...hhssrsshh...",
    "....hsssssh....",
    ".....sssss.....",
    "..kkkkwwwkkkk..",
    ".kkwwkkwkkwwkk.",
    "kkwkkwkykwkkwkk",
    "kkwkkwkykwkkwkk",
    "kkkwwkkykkwwkkk",
    "kkkkkkkykkkkkkk",
  ],
};
const BACK_EMBLEM = [
  "..#####..", ".#.....#.", "#..###..#", "#.#####.#", "#.##.##.#", "#.#####.#", "#..###..#", ".#.....#.", "..#####..",
];
const EB = ["#####.####.", "#.....#...#", "#.....#...#", "####..####.", "#.....#...#", "#.....#...#", "#####.####."];

// ---- the canvas of one card ----------------------------------------------------------------------
function grid() { return Array.from({ length: CH }, () => new Array(CW).fill(null)); }
function blit(g, rows, x0, y0, col, { flip = false, scale = 1 } = {}) {
  const H = rows.length;
  for (let r = 0; r < H; r++) {
    const row = rows[flip ? H - 1 - r : r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[flip ? row.length - 1 - c : c];
      if (ch === "." || ch === " ") continue;
      const fill = typeof col === "function" ? col(ch) : col;
      if (!fill) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const x = x0 + c * scale + dx, y = y0 + r * scale + dy;
        if (x >= 0 && y >= 0 && x < CW && y < CH) g[y][x] = fill;
      }
    }
  }
}
function rect(g, x, y, w, h, fill) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < CW) g[j][i] = fill; }
function frame(g, paper = PAPER, edge = EDGE) {
  rect(g, 0, 0, CW, CH, paper);
  rect(g, 1, 0, CW - 2, 1, edge); rect(g, 1, CH - 1, CW - 2, 1, edge);
  rect(g, 0, 1, 1, CH - 2, edge); rect(g, CW - 1, 1, 1, CH - 2, edge);
  for (const [x, y] of [[0, 0], [CW - 1, 0], [0, CH - 1], [CW - 1, CH - 1]]) g[y][x] = null;   // the rounded corners
}
// grid -> layers: one per colour, horizontal runs
function layers(g) {
  const by = new Map();
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW;) {
      const f = g[y][x];
      if (!f) { x++; continue; }
      let n = 1; while (x + n < CW && g[y][x + n] === f) n++;
      if (!by.has(f)) by.set(f, []);
      by.get(f).push([x, y, n, 1]);
      x += n;
    }
  }
  return [...by].map(([fill, rects]) => ({ fill, rects }));
}

// pips: column x, row y (top-left of a 5 x 6 suit), flipped below the middle
const L = 9, C = 13, R = 17;
const PIPS = {
  2: [[C, 3], [C, 34]],
  3: [[C, 3], [C, 18], [C, 34]],
  4: [[L, 3], [R, 3], [L, 34], [R, 34]],
  5: [[L, 3], [R, 3], [C, 18], [L, 34], [R, 34]],
  6: [[L, 3], [R, 3], [L, 18], [R, 18], [L, 34], [R, 34]],
  7: [[L, 3], [R, 3], [C, 10], [L, 18], [R, 18], [L, 34], [R, 34]],
  8: [[L, 3], [R, 3], [C, 10], [L, 18], [R, 18], [C, 27], [L, 34], [R, 34]],
  9: [[L, 3], [R, 3], [L, 13], [R, 13], [C, 18], [L, 24], [R, 24], [L, 34], [R, 34]],
  10: [[L, 3], [R, 3], [C, 8], [L, 13], [R, 13], [L, 24], [R, 24], [C, 29], [L, 34], [R, 34]],
};
const RANK_NUM = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10 };

const CACHE = new Map();
export function cardLayers(code, { four = false, big = false } = {}) {
  const key = `${code}|${four ? 4 : 2}|${big ? "b" : ""}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const r = code[0], s = "shdc".indexOf(code[1]);
  const ink = suitInk(s, four), other = s === 1 || s === 2 ? suitInk(0, four) : suitInk(1, four);
  const g = grid();
  frame(g);
  if (big) {
    blit(g, RANK_GLYPH[r], 2, 2, ink, { scale: 2 });
    blit(g, SUIT7[s], 15, 4, ink);
    blit(g, SUIT13[s], 9, 24, ink);
  } else {
    blit(g, RANK_GLYPH[r], 2, 3, ink);
    blit(g, SUIT7[s], 1, 11, ink);
    blit(g, RANK_GLYPH[r], CW - 7, CH - 10, ink, { flip: true });
    blit(g, SUIT7[s], CW - 8, CH - 18, ink, { flip: true });
    if (r === "A") blit(g, SUIT13[s], 9, 15, ink);
    else if (RANK_NUM[r]) for (const [x, y] of PIPS[RANK_NUM[r]]) blit(g, SUIT5[s], x, y, ink, { flip: y > 21 });
    else {
      // the court: a frame, the portrait, mirrored
      const fx = 7, fy = 3, fw = 17, fh = 37;
      rect(g, fx, fy, fw, 1, ink); rect(g, fx, fy + fh - 1, fw, 1, ink); rect(g, fx, fy, 1, fh, ink); rect(g, fx + fw - 1, fy, 1, fh, ink);
      const pal = (ch) => ({ k: ink, y: GOLD, s: SKIN, h: HAIR, w: WHITE, r: other }[ch]);
      blit(g, COURT[r], fx + 1, fy + 1, pal);
      blit(g, COURT[r], fx + 1, fy + fh - 1 - 17, pal, { flip: true });
      rect(g, fx + 1, fy + 18, fw - 2, 1, ink);
    }
  }
  const out = layers(g);
  CACHE.set(key, out);
  return out;
}

// The backs: "dept" (the Department's green lattice, its seal) and "eb" (the EB house deck: purple
// and gold, the letters).
export function backLayers(kind = "dept") {
  const key = `back|${kind}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const eb = kind === "eb";
  const [bg, fg, hi] = eb ? ["#2a1446", "#c9a227", "#f2d572"] : ["#0f3d22", "#2f8a50", "#c8f5d8"];
  const g = grid();
  frame(g, PAPER);
  rect(g, 2, 2, CW - 4, CH - 4, bg);
  for (let y = 3; y < CH - 3; y++) for (let x = 3; x < CW - 3; x++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) g[y][x] = fg;
  rect(g, 2, 2, CW - 4, 1, hi); rect(g, 2, CH - 3, CW - 4, 1, hi); rect(g, 2, 2, 1, CH - 4, hi); rect(g, CW - 3, 2, 1, CH - 4, hi);
  if (eb) { rect(g, 8, 16, 15, 11, bg); blit(g, EB, 10, 18, hi); }
  else { rect(g, 10, 16, 11, 11, bg); blit(g, BACK_EMBLEM, 11, 17, hi); }
  const out = layers(g);
  CACHE.set(key, out);
  return out;
}

// Paint a card on a 2D canvas context at (x, y), s canvas px per card pixel.
export function drawCard(ctx, code, x, y, s, opts = {}) {
  const L = code && code !== "??" ? cardLayers(code, opts) : backLayers(opts.back);
  for (const { fill, rects } of L) {
    ctx.fillStyle = fill;
    for (const [rx, ry, w, h] of rects) ctx.fillRect(Math.round(x + rx * s), Math.round(y + ry * s), Math.ceil(w * s), Math.ceil(h * s));
  }
}
// SVG path data per colour.
export function svgPaths(L) {
  return L.map(({ fill, rects }) => ({ fill, d: rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join("") }));
}
