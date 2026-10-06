// THE BOWL, playable: the crests. Pure (no DOM): a pixel helmet in the kit's colours facing right,
// the district's 7 x 7 mark on its side, drawn with fillRect onto any 2D context at any size (a
// multiple of 32 keeps the pixels whole). scripts/check-football.mjs draws them all through a stub.
import { KITS } from "./roster.js";
import { shade } from "./render.js";

// A pixel helmet in the kit's colours, the district's mark on its side. 7 x 7 marks.
export const MARKS = {
  arts: ["0001000", "0011100", "1111111", "0111110", "0011100", "0110110", "1100011"],
  campus: ["1111111", "1000001", "1011101", "1000001", "1011101", "1000001", "1111111"],
  finance: ["0011110", "0100000", "0011100", "0000010", "0111100", "0001000", "0001000"],
  strip: ["1111111", "1100011", "1000001", "1001001", "1000001", "1100011", "1111111"],
  arena: ["0001100", "0011000", "0110000", "1111110", "0001100", "0011000", "0110000"],
  hq: ["0011100", "0100010", "1001001", "1011101", "1001001", "0100010", "0011100"],
  archive: ["1110000", "1001111", "1000001", "1011101", "1000001", "1011101", "1111111"],
  commons: ["0001000", "0011100", "0111110", "1111111", "0011100", "0001000", "0001000"],
  works: ["0101010", "1111111", "0110110", "1101011", "0110110", "1111111", "0101010"],
  sprawl: ["0001000", "0011100", "0111110", "1111111", "0100010", "0101010", "0111110"],
};
export function drawCrest(ctx, id, size = 32) {
  const [jersey, trim] = KITS[id] || KITS.hq, s = size / 32, dark = "#0a0f0a", mask = "#3a3f46";
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
  ctx.clearRect(0, 0, size, size);
  // the shell, facing right: the dome in rows, the jaw, the face opening cut from the front
  r(11, 3, 10, 1, jersey); r(9, 4, 14, 1, jersey); r(8, 5, 16, 1, jersey); r(7, 6, 18, 2, jersey); r(6, 8, 20, 12, jersey);
  r(7, 20, 18, 2, jersey); r(8, 22, 16, 1, jersey); r(9, 23, 6, 1, jersey);
  r(11, 3, 4, 1, shade(jersey, 1.3)); r(8, 5, 3, 1, shade(jersey, 1.25));
  // the face: an opening, the skin in it, the mask bars
  r(22, 12, 5, 11, dark); r(23, 13, 3, 6, "#c68c5e"); r(23, 13, 3, 2, shade(jersey, 0.5));
  r(21, 19, 8, 2, mask); r(23, 23, 6, 2, mask); r(27, 16, 2, 9, mask); r(25, 21, 2, 3, mask);
  // the stripe over the crown, in the trim
  r(15, 3, 3, 21, trim);
  // the district's mark on the side
  const M = MARKS[id];
  if (M) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (M[y][x] === "1") r(7 + x, 11 + y, 1, 1, trim);
  // the shadow under the shell
  r(7, 26, 20, 1, "rgba(0,0,0,0.4)");
}
