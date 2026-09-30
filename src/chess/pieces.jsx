// Pixel chess pieces in the terminal's hand: a 12x12 silhouette each ('x' fill, '#' a detail in
// the outline colour), outlined one pixel all round, drawn as crisp SVG squares so they scale to
// any square without blurring. White: bone on black ink; Black: ink with a phosphor-green edge.
const ART = {
  p: ["............", "............", ".....xx.....", "....xxxx....", "....xxxx....", ".....xx.....", ".....xx.....", "....xxxx....", "...xxxxxx...", "...xxxxxx...", "............", "............"],
  r: ["............", "..xx.xx.xx..", "..xxxxxxxx..", "...xxxxxx...", "...xxxxxx...", "...xxxxxx...", "...xxxxxx...", "..xxxxxxxx..", "..xxxxxxxx..", ".xxxxxxxxxx.", "............", "............"],
  n: ["............", ".....x.x....", "....xxxxx...", "...xxxxxxx..", "..xxx#xxxx..", ".xxxxxxxxx..", ".xxx..xxxx..", ".....xxxxx..", "....xxxxxx..", "...xxxxxxxx.", "...xxxxxxxx.", "............"],
  b: ["............", ".....xx.....", "....xxxx....", "...xxx#xx...", "...xx#xxx...", "....xxxx....", ".....xx.....", "....xxxx....", "...xxxxxx...", "..xxxxxxxx..", "............", "............"],
  q: ["............", ".x...xx...x.", ".xx.xxxx.xx.", ".xxxxxxxxxx.", "..xxxxxxxx..", "...xxxxxx...", "....xxxx....", "....xxxx....", "...xxxxxx...", "..xxxxxxxx..", "............", "............"],
  k: ["............", ".....xx.....", "....xxxx....", ".....xx.....", "..xxxxxxxx..", ".xxxxxxxxxx.", "..xxxxxxxx..", "...xxxxxx...", "...xxxxxx...", "..xxxxxxxx..", "..xxxxxxxx..", "............"],
};
const COL = { w: { fill: "#ece7d6", edge: "#0a0f0a" }, b: { fill: "#10160f", edge: "#6ee7a0" } };
// cells: [x, y, kind] kind 0 fill, 1 edge (the outline and the details)
const CELLS = {};
for (const [t, rows] of Object.entries(ART)) {
  const on = (x, y) => y >= 0 && y < 12 && x >= 0 && x < 12 && rows[y][x] !== ".";
  const out = [];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    if (rows[y][x] === "x") out.push([x, y, 0]);
    else if (rows[y][x] === "#") out.push([x, y, 1]);
    else { let edge = false; for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && on(x + dx, y + dy)) { edge = true; break; } if (edge) out.push([x, y, 1]); }
  }
  CELLS[t] = out;
}
export const PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

// code: "wK"-style ("w" | "b") + one of p n b r q k
export function Piece({ code, className }) {
  if (!code) return null;
  const c = COL[code[0]], cells = CELLS[code[1]];
  return (
    <svg className={className} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {cells.map(([x, y, k]) => <rect key={`${x}.${y}`} x={x} y={y} width="1" height="1" fill={k ? c.edge : c.fill} />)}
    </svg>
  );
}
