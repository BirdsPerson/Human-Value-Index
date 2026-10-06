// AD BOARDS in the pixel games: one slot of the inventory (src/ads/inventory.js) drawn on a flat
// board face, in the game's own 3 x 5 type. A house ad is its brand's real mark (src/ads/marks.js)
// on the brand's ground, with a short line beside it when the board has room; until the atlas
// lands it reads as its line in the board's ink, never a blank. The ground's own name is the
// game's board colours. AVAILABLE is quiet: dim letters on the game's board ("label"), or the
// bare board ("plain"). Render only.
//
//   drawAdBoard(ctx, slot, x, y, w, h, font, pal)
//     x, y, w, h  the face, whole screen pixels
//     font        {text(ctx, s, x, y, col), textW(s)}: the game's 3 x 5 type
//     pal         {board, ink, dim}: the game's board ground, its letters, the AVAILABLE letters
//     o.ground    false: the caller has laid the ground (a board seen in perspective fills its own
//                 quad in adGround's colour); the face is then only where the content goes
//   adGround(slot, pal)  the board's ground colour
import { creativeOf } from "./inventory.js";
import { drawBrand, brandReady, pickBrand } from "./marks.js";

export const adGround = (slot, pal) => { const cr = creativeOf(slot); return cr.kind === "house" ? cr.bg : pal.board; };

export function drawAdBoard(ctx, slot, x, y, w, h, font, pal, o = {}) {
  const cr = creativeOf(slot);
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 2 || h < 2) return;
  if (o.ground !== false) { ctx.fillStyle = adGround(slot, pal); ctx.fillRect(x, y, w, h); }
  const cy = y + h / 2, cx = x + w / 2, ty = Math.round(cy - 2.5);
  if (cr.kind === "available") {
    if (slot.placeholder === "plain") return;
    const s = cr.lines.find(l => font.textW(l) <= w - 6);
    if (s) font.text(ctx, s, Math.round(cx - font.textW(s) / 2), ty, pal.dim);
    return;
  }
  if (cr.kind === "venue") {
    const s = cr.lines.find(l => font.textW(l) <= w - 4);
    if (s) font.text(ctx, s, Math.round(cx - font.textW(s) / 2), ty, pal.ink);
    return;
  }
  // a house ad: the mark, and its line beside it when both fit
  const markH = Math.max(1, h - 2), mark = cr.boardMark || cr.mark;
  if (brandReady()) {
    const alone = pickBrand(mark, markH, false, w - 4), mw0 = alone ? (alone.s.w - 2 * (alone.s.pad || 0)) * alone.k : 0;
    const line = alone && cr.board && mw0 + 4 + font.textW(cr.board) <= w - 6 ? cr.board : null;
    const room = line ? w - font.textW(line) - 10 : w - 4;
    const p = line ? pickBrand(mark, markH, false, room) : alone;
    if (p) {
      const mw = (p.s.w - 2 * (p.s.pad || 0)) * p.k, total = mw + (line ? 4 + font.textW(line) : 0), lx = Math.round(cx - total / 2);
      drawBrand(ctx, mark, lx, cy, markH, { align: "left", maxW: room });
      if (line) font.text(ctx, line, lx + mw + 4, ty, cr.ink);
      return;
    }
  }
  const s = [cr.board, cr.line, cr.brand.toUpperCase()].find(l => l && font.textW(l) <= w - 4);
  if (!s) return;
  font.text(ctx, s, Math.round(cx - font.textW(s) / 2), ty, cr.ink);
}
