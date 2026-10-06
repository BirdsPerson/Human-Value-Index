// How each golfer looks on the course (browser only). The head is the figure's own: cut from
// their file sprite (frame 0, as THE TENNIS CLUB does), or, when the file has no likeness yet, a
// head painted by avatar.js from a few hints (skin, hair) so the figure is still near enough to
// themselves. Skin and hair colours are read off that head. The body is everyone's: one
// standardized golf outfit (polo, trousers, cap, one white glove), recoloured from the figure's kit.
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC, AVATAR_ENUMS, CLOTH, hasOutfit } from "../../avatar.js";
import { headFrom, sheetHints } from "../heads.js";

const hex = (r, g, b) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const shade = (h, k) => { const [r, g, b] = rgb(h); return hex(r * k, g * k, b * k); };
const near = (a, b, tol = 60) => { const p = rgb(a), q = rgb(b); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < tol; };

// The head off a 32x48 sprite sheet: the shared sports cut (../heads.js), which leaves a held prop
// behind. crop: [x, y, w, h], a hand-set box that wins (roster.js CROPS).
export { headFrom };
// The commonest opaque colour in a region of the head -> "#rrggbb" | null
function commonest(head, y0, y1, skip) {
  try {
    const d = head.getContext("2d").getImageData(0, 0, head.width, head.height).data, n = new Map();
    for (let y = Math.max(0, y0); y < Math.min(head.height, y1); y++) for (let x = 1; x < head.width - 1; x++) {
      const o = (y * head.width + x) * 4; if (d[o + 3] < 200) continue;
      const k = hex(d[o], d[o + 1], d[o + 2]);
      if (d[o] + d[o + 1] + d[o + 2] < 40 || (skip && near(k, skip))) continue;   // the outline, the skin
      n.set(k, (n.get(k) || 0) + 1);
    }
    let best = null, bn = 0; for (const [k, v] of n) if (v > bn) { bn = v; best = k; }
    return best;
  } catch { return null; }
}
export const skinOf = (head) => commonest(head, Math.floor(head.height / 2), head.height - 1, null);
export const hairOf = (head, skin) => commonest(head, 0, 3, skin);

// A golfer on the course: {head, skin, hair, shirt, pants, cap, glove, generic}
// src: {url} (a file sprite), {spec} (a procedural file photo), else {hint} (avatar fields).
export async function lookFor({ url = null, spec = null, hint = null, shirt, pants, crop = null }) {
  let sheet = null;
  if (url) { try { sheet = await loadSprite(url, { sector: null }); } catch { sheet = null; } }
  const generic = !sheet;
  const sp = spec || { ...DEFAULT_SPEC, ...(hint || {}) };
  if (!sheet) sheet = paintAvatar(sp, 1);
  const head = headFrom(sheet, generic ? null : crop);
  // a prop baked into the head (headFrom said no): the photo's own skin and hair for a drawn head
  const cues = !head && !generic && !spec ? sheetHints(sheet) : null;
  let skin = generic || spec ? AVATAR_ENUMS.skin[sp.skin] : head ? skinOf(head) : cues.skin;
  skin = skin || AVATAR_ENUMS.skin.tan;
  let hair = generic || spec ? (sp.hair_style === "bald" ? skin : AVATAR_ENUMS.hair_color[sp.hair_color]) : head ? hairOf(head, skin) : cues.hair;
  hair = hair || skin;
  shirt = shirt || (spec && CLOTH[spec.top_color]) || "#3cbcfc";
  pants = pants || (spec && CLOTH[spec.bottom_color]) || "#7c7c7c";
  const dark = rgb(pants).reduce((a, v) => a + v, 0) < 300;
  // off the course (the 19th hole) a golfer wears their own clothes: the outfit bought at THE SHOPS
  const street = spec && hasOutfit(spec) ? paintAvatar(spec, 1) : null;
  return { head, skin, hair, shirt, pants, cap: dark ? "#fcfcfc" : pants, glove: "#fcfcfc", generic, street };
}

// The same golfer from the front, 32x48 (a file photo's size): their head on the standard outfit.
export function paintCard(look) {
  const c = document.createElement("canvas"); c.width = 32; c.height = 48;
  const g = c.getContext("2d");
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const hd = look.head, hw = hd ? hd.width : 10, hh = hd ? hd.height : 10, top = 13;
  const sh = look.shirt, shD = shade(sh, 0.72), pa = look.pants, paD = shade(pa, 0.72), sk = look.skin;
  r(14, top, 4, 1, sk);                                   // neck
  r(9, top + 1, 14, 11, sh); r(20, top + 1, 3, 11, shD);   // the polo, shaded on its right
  r(14, top + 1, 4, 2, shD); r(15, top + 3, 2, 2, shD);    // collar and placket
  r(7, top + 1, 2, 4, sh); r(23, top + 1, 2, 4, shD);      // sleeves
  r(7, top + 5, 2, 4, sk); r(23, top + 5, 2, 4, sk);       // forearms
  r(7, top + 9, 2, 2, sk); r(23, top + 9, 2, 2, look.glove);   // a bare hand, a gloved one
  r(9, top + 12, 14, 1, "#202020");                        // belt
  r(10, top + 13, 6, 18, pa); r(16, top + 13, 6, 18, paD); r(15, top + 20, 2, 11, "#000000");
  r(9, top + 31, 7, 2, "#fcfcfc"); r(16, top + 31, 7, 2, "#fcfcfc"); r(9, top + 32, 2, 1, "#7c7c7c"); r(21, top + 32, 2, 1, "#7c7c7c");
  // a dark outline round the body only (the head brings its own)
  const img = g.getImageData(0, 0, 32, 48), d = img.data, solid = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 48 && d[(y * 32 + x) * 4 + 3] > 0;
  const out = [];
  for (let y = top - 1; y < 48; y++) for (let x = 0; x < 32; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push([x, y]);
  g.fillStyle = "#0a0f0a"; for (const [x, y] of out) g.fillRect(x, y, 1, 1);
  if (hd) g.drawImage(hd, 16 - (hw >> 1), top + 1 - hh);
  return c;
}
