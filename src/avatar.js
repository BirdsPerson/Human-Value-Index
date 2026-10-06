// Citizen file photos: a procedural 32x48 sprite built from a small spec of enum values.
// Shared by the client (drawing) and the functions (validation). Pure, no DOM.
// Only enum values are ever stored: the subject's own description is read once to pick
// them and then discarded, so a file photo can never carry free text.

import { WEAR_SLOTS, WEAR_KEYS, wearOf, MARKS } from "./wear.js";

const SPRITE_W = 32, SPRITE_H = 48;   // same grid as src/sprites.js (kept local: sprites.js imports this file)
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const AVATAR_ENUMS = {
  skin: { porcelain: "#f6d5bc", fair: "#f1c9a5", light_tan: "#e0b088", tan: "#c68c5e", brown: "#8d5a36", deep: "#5c3a22" },
  hair_style: ["bald", "buzz", "short", "side_part", "spiky", "curly", "afro", "long", "bun", "ponytail"],
  hair_color: { black: "#1b1b1b", dark_brown: "#3b2417", brown: "#6b4428", auburn: "#8a3b1e", red: "#b0421f", blonde: "#d9b35c", platinum: "#e8e0c8", grey: "#9a9a9a", white: "#e8e8e8", blue: "#3a5fcf", pink: "#e06aa8", green: "#3fae5a" },
  build: ["slim", "average", "broad"],
  top_color: null,      // filled below: CLOTH
  bottom_color: null,
  facial_hair: ["none", "stubble", "mustache", "beard"],
  accessory: ["none", "glasses", "sunglasses", "bucket_hat", "cap", "beanie", "headphones", "bag", "backpack", "book", "coffee", "phone", "camera", "briefcase", "guitar", "laptop", "tool"],
};
export const CLOTH = { black: "#262626", charcoal: "#3d3d3d", grey: "#8a8a8a", white: "#e6e6e6", oatmeal: "#d9ccb0", tan: "#c2a878", brown: "#6b4a2e", navy: "#1f2f5a", blue: "#3a6fd8", denim: "#45618f", red: "#b83232", maroon: "#6e2230", green: "#3c8a46", olive: "#6b6b35", yellow: "#e0c040", orange: "#d97a2b", purple: "#6b3fa0", pink: "#d977a8" };
AVATAR_ENUMS.top_color = CLOTH;
AVATAR_ENUMS.bottom_color = CLOTH;

export const AVATAR_KEYS = ["skin", "hair_style", "hair_color", "build", "top_color", "bottom_color", "facial_hair", "accessory"];
export const DEFAULT_SPEC = { skin: "tan", hair_style: "short", hair_color: "brown", build: "average", top_color: "grey", bottom_color: "denim", facial_hair: "none", accessory: "none" };

const allowed = (k) => { const e = AVATAR_ENUMS[k]; return Array.isArray(e) ? e : Object.keys(e); };

// Anything not an exact enum value falls back to the default for that key; unknown keys
// are dropped. Returns null for a non-object, so "no photo" stays distinguishable. A worn
// piece (wear_<slot>: a SKU of src/wear.js for that slot) is kept only when it is exact.
export function sanitizeSpec(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out = {};
  for (const k of AVATAR_KEYS) {
    const v = typeof x[k] === "string" ? x[k].trim().toLowerCase() : "";
    out[k] = allowed(k).includes(v) ? v : DEFAULT_SPEC[k];
  }
  for (const s of WEAR_SLOTS) {
    const w = wearOf(x[`wear_${s}`]);
    if (w && w.slot === s) out[`wear_${s}`] = x[`wear_${s}`];
  }
  return out;
}
// The outfit on a spec: {wear_top: sku, ...} (only the worn slots).
export const outfitOf = (spec) => Object.fromEntries(WEAR_KEYS.filter(k => spec && typeof spec[k] === "string" && wearOf(spec[k])).map(k => [k, spec[k]]));
export const hasOutfit = (spec) => WEAR_KEYS.some(k => spec && wearOf(spec[k]));

// { kind: "sprite", url } | { kind: "procedural", spec } | null. Sprite URLs are ours only.
export function sanitizeAvatar(a) {
  if (!a || typeof a !== "object") return null;
  if (a.kind === "sprite" && typeof a.url === "string" && /^\/(sprites\/[a-z0-9-]+\.png|api\/sprite\/[a-z0-9-]+)(\?v=\d+)?$/.test(a.url)) return { kind: "sprite", url: a.url };
  if (a.kind === "procedural") { const spec = sanitizeSpec(a.spec); return spec ? { kind: "procedural", spec } : null; }
  return null;
}

// Palette slots.
// 12.. are the worn pieces' own colours (src/wear.js): a top's detail, a shoe's sole, the
// outerwear and its shade and detail, the headwear, a worn accessory, a bottom's detail.
export const AX = { EMPTY: 0, OUTLINE: 1, TOP: 2, TOPS: 3, SKIN: 4, EYE: 5, HAIR: 6, ACC: 7, BOT: 8, ACC2: 9, SHOE: 10, SKINS: 11,
  TRIM: 12, SOLE: 13, OUT: 14, OUTS: 15, HAT: 16, HAT2: 17, WACC: 18, WACC2: 19, OTRIM: 20, BTRIM: 21 };

const ACC_COLORS = {
  none: ["#000000", "#000000"], glasses: ["#1a1a1a", "#9fd8ff"], sunglasses: ["#0d0d0d", "#0d0d0d"],
  bucket_hat: ["#c9b48a", "#a8936b"], cap: ["#b83232", "#e6e6e6"], beanie: ["#3a6fd8", "#e6e6e6"],
  headphones: ["#6b3fa0", "#2a2a2a"], bag: ["#7a4f2a", "#4a2f19"], backpack: ["#3c8a46", "#2a5f31"],
  book: ["#8a2f2f", "#f0e6c8"], coffee: ["#6b4428", "#f2f2f2"], phone: ["#1a1a1a", "#7fb3ff"],
  camera: ["#2a2a2a", "#9fb0c8"], briefcase: ["#4a2f19", "#c9a14a"], guitar: ["#b8742a", "#3a2a1a"],
  laptop: ["#9aa0a8", "#3a3f46"], tool: ["#9aa0a8", "#5a6068"],
};

export function avatarPalette(spec) {
  const s = sanitizeSpec(spec) || DEFAULT_SPEC;
  const skin = hexToRgb(AVATAR_ENUMS.skin[s.skin]);
  const W = Object.fromEntries(WEAR_SLOTS.map(k => [k, wearOf(s[`wear_${k}`])]));
  const top = hexToRgb(W.top ? W.top.main : CLOTH[s.top_color]);
  const d = (c, f) => c.map(v => Math.round(v * f));
  const [a1, a2] = ACC_COLORS[s.accessory] || ACC_COLORS.none;
  const pal = [null, [5, 8, 5], top, d(top, 0.66), skin, [10, 15, 10], hexToRgb(AVATAR_ENUMS.hair_color[s.hair_color]), hexToRgb(a1), hexToRgb(W.bottom ? W.bottom.main : CLOTH[s.bottom_color]), hexToRgb(a2), W.shoes ? hexToRgb(W.shoes.main) : [24, 20, 18], d(skin, 0.8)];
  const out = W.outer ? hexToRgb(W.outer.main) : top;
  pal.push(hexToRgb(W.top ? W.top.detail : "#000000"), W.shoes ? hexToRgb(W.shoes.detail) : [24, 20, 18], out, d(out, 0.7),
    hexToRgb(W.head ? W.head.main : "#000000"), hexToRgb(W.head ? W.head.detail : "#000000"), hexToRgb(W.acc ? W.acc.main : "#000000"), hexToRgb(W.acc ? W.acc.detail : "#000000"),
    hexToRgb(W.outer ? W.outer.detail : "#000000"), hexToRgb(W.bottom ? W.bottom.detail : "#000000"));
  return pal;
}

// 32x48 palette-index grid for one frame (frame 1 = mid-stride). Same body plan as the
// tier placeholders so citizens walk like everyone else in the building. Drawn as separable
// layers (Scott's modular rendering): BODY (head, face, facial hair, neck), HAIR, CLOTHES
// (top, bottom, shoes, then outerwear: the spec's colours, or the worn pieces of src/wear.js),
// then ACCESSORIES (worn headwear and accessories, and the spec's own). avatarLayers returns
// them in that order; avatarPixels composes them and outlines the figure.
export function avatarLayers(spec, frame = 0) {
  const s = sanitizeSpec(spec) || DEFAULT_SPEC;
  const g = geometry(s, frame);
  return LAYERS.map(([name, draw]) => {
    const px = new Uint8Array(SPRITE_W * SPRITE_H);
    draw(painter(px), s, g);
    return { name, px };
  });
}
export function avatarPixels(spec, frame = 0) {
  const W = SPRITE_W, H = SPRITE_H;
  const px = new Uint8Array(W * H);
  for (const L of avatarLayers(spec, frame)) for (let i = 0; i < px.length; i++) if (L.px[i]) px[i] = L.px[i];
  // 1px outline around the figure, as on every sprite in the building
  const out = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x] !== AX.EMPTY) continue;
    const n = (xx, yy) => xx >= 0 && xx < W && yy >= 0 && yy < H && px[yy * W + xx] > AX.OUTLINE;
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) out[y * W + x] = AX.OUTLINE;
  }
  return out;
}

function painter(px) {
  const set = (x, y, c) => { if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H) px[y * SPRITE_W + x] = c; };
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };
  return { set, rect };
}
// docs/avatar-design-system.md: head ~1/4 of a 45px body, feet on row 46, 1px outline room top and bottom.
function geometry(s, frame) {
  const cx = 16, headW = 12, headH = 11, headTop = 4, hx = cx - headW / 2;
  const torsoW = { slim: 10, average: 12, broad: 16 }[s.build];
  const torsoTop = headTop + headH + 1, torsoBot = 32, tx = cx - torsoW / 2;
  const swing = frame === 1 ? 1 : 0, armLen = 11;
  const lx = tx - 3, ly = torsoTop + 1 - swing, rx = tx + torsoW, ry = torsoTop + 1 + swing;
  return { frame, cx, headW, headH, headTop, hx, torsoW, torsoTop, torsoBot, tx, swing, armLen, lx, ly, rx, ry, H: SPRITE_H, hand: { x: lx, y: ly + armLen } };
}
const worn = (s, slot) => wearOf(s[`wear_${slot}`]);
// 3x5 digits for a jersey's number (each row 3 bits, the left pixel the high bit)
const DIGITS = { 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1], 5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7] };

function bodyLayer({ set, rect }, s, g) {
  const { cx, headW, headH, headTop, hx } = g;
  rect(hx, headTop, headW, headH, AX.SKIN);
  rect(hx + headW - 2, headTop + 1, 2, headH - 2, AX.SKINS);
  set(cx - 3, headTop + 5, AX.EYE); set(cx - 3, headTop + 6, AX.EYE);
  set(cx + 2, headTop + 5, AX.EYE); set(cx + 2, headTop + 6, AX.EYE);
  rect(cx - 1, headTop + 8, 3, 1, AX.SKINS);
  if (s.facial_hair === "stubble") for (let x = hx + 2; x < hx + headW - 2; x += 2) { set(x, headTop + 9, AX.HAIR); set(x + 1, headTop + 10, AX.HAIR); }
  if (s.facial_hair === "mustache") rect(cx - 3, headTop + 7, 6, 1, AX.HAIR);
  if (s.facial_hair === "beard") { rect(hx + 1, headTop + 7, headW - 2, 4, AX.HAIR); rect(cx - 1, headTop + 8, 3, 1, AX.SKINS); }
  rect(cx - 2, headTop + headH, 4, 1, AX.SKIN);   // neck
}

function hairLayer({ set, rect }, s, g) {
  const { headW, headTop, hx, cx } = g;
  // a hat sits on the hair: under a worn hat only what shows below its band is drawn
  const hat = worn(s, "head");
  const y0 = hat ? headTop + 1 : -99;
  const R = (x, y, w, h) => { const top = Math.max(y, y0); if (y + h > top) rect(x, top, w, y + h - top, AX.HAIR); };
  switch (s.hair_style) {
    case "buzz": R(hx, headTop, headW, 2); break;
    case "short": R(hx, headTop - 1, headW, 3); R(hx, headTop + 2, 1, 3); R(hx + headW - 1, headTop + 2, 1, 3); break;
    case "side_part": R(hx - 1, headTop - 1, headW + 2, 3); R(hx - 1, headTop + 2, 2, 3); R(hx, headTop + 2, 5, 1); break;
    case "spiky": R(hx, headTop, headW, 2); if (!hat) for (let x = hx; x < hx + headW; x += 2) { set(x, headTop - 1, AX.HAIR); set(x, headTop - 2, AX.HAIR); } break;
    case "curly": R(hx - 1, headTop - 2, headW + 2, 4); if (!hat) for (let x = hx; x < hx + headW; x += 2) set(x, headTop - 3, AX.HAIR); R(hx - 1, headTop + 2, 2, 4); R(hx + headW - 1, headTop + 2, 2, 4); break;
    case "afro": R(hx - 3, headTop - 4, headW + 6, 7); R(hx - 3, headTop + 3, 3, 5); R(hx + headW, headTop + 3, 3, 5); break;
    case "long": R(hx - 1, headTop - 1, headW + 2, 3); R(hx - 1, headTop + 2, 2, 12); R(hx + headW - 1, headTop + 2, 2, 12); break;
    case "bun": R(hx, headTop - 1, headW, 3); if (!hat) rect(cx - 2, headTop - 4, 4, 3, AX.HAIR); break;
    case "ponytail": R(hx, headTop - 1, headW, 3); R(hx + headW, headTop + 1, 2, 9); break;
    default: break;   // bald
  }
}

function clothesLayer(p, s, g) {
  const { set, rect } = p;
  const { cx, torsoTop, torsoBot, tx, torsoW, armLen, lx, ly, rx, ry, H, frame } = g;
  // ---- the top: torso and arms
  const top = worn(s, "top"), shape = top ? top.shape : "longsleeve";
  rect(tx, torsoTop, torsoW, torsoBot - torsoTop, AX.TOP);
  rect(tx + torsoW - 2, torsoTop, 2, torsoBot - torsoTop, AX.TOPS);
  const sleeve = shape === "tank" || shape === "jersey" ? 0 : shape === "tee" || shape === "polo" ? 4 : armLen;
  rect(lx, ly, 3, sleeve, AX.TOP); rect(lx, ly + sleeve, 3, armLen - sleeve, AX.SKIN); rect(lx, ly + armLen, 3, 2, AX.SKIN);
  rect(rx, ry, 3, sleeve, AX.TOPS); rect(rx, ry + sleeve, 3, armLen - sleeve, AX.SKINS); rect(rx, ry + armLen, 3, 2, AX.SKIN);
  if (shape === "tank" || shape === "jersey") { rect(tx, torsoTop, 2, 2, AX.SKIN); rect(tx + torsoW - 2, torsoTop, 2, 2, AX.SKINS); }
  if (shape === "jersey") {
    // the trim round the neck and the arm holes, the number on the chest (an EB SHOP copy's own)
    set(cx - 2, torsoTop, AX.TRIM); set(cx + 1, torsoTop, AX.TRIM); set(cx - 1, torsoTop + 1, AX.TRIM); set(cx, torsoTop + 1, AX.TRIM);
    rect(tx, torsoTop + 2, 1, 4, AX.TRIM); rect(tx + torsoW - 1, torsoTop + 2, 1, 4, AX.TRIM); rect(tx, torsoBot - 1, torsoW, 1, AX.TRIM);
    const n = String(top.number || ""), w = n.length * 4 - 1;
    for (let k = 0; k < n.length; k++) {
      const rows = DIGITS[n[k]] || [];
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if ((rows[yy] >> (2 - xx)) & 1) set(cx - Math.ceil(w / 2) + k * 4 + xx, torsoTop + 4 + yy, AX.TRIM);
    }
  }
  if (shape === "shirt" || shape === "polo") { set(cx - 2, torsoTop, AX.TRIM); set(cx + 1, torsoTop, AX.TRIM); set(cx - 1, torsoTop + 1, AX.TRIM); set(cx, torsoTop + 1, AX.TRIM); }
  if (shape === "shirt") for (let y = torsoTop + 3; y < torsoBot; y += 3) set(cx, y, AX.TRIM);
  if (shape === "polo") { set(cx, torsoTop + 2, AX.TRIM); set(cx, torsoTop + 4, AX.TRIM); }
  if (shape === "hoodie") {
    rect(cx - 4, torsoTop, 8, 1, AX.TOPS); set(cx - 2, torsoTop + 1, AX.TRIM); set(cx - 2, torsoTop + 2, AX.TRIM); set(cx + 1, torsoTop + 1, AX.TRIM); set(cx + 1, torsoTop + 2, AX.TRIM);
    rect(tx + 2, torsoBot - 6, torsoW - 4, 3, AX.TOPS);   // the pouch
  }
  if (shape === "sweater") { rect(tx, torsoBot - 1, torsoW, 1, AX.TRIM); rect(lx, ly + armLen - 1, 3, 1, AX.TRIM); rect(rx, ry + armLen - 1, 3, 1, AX.TRIM); rect(cx - 2, torsoTop, 4, 1, AX.TRIM); }
  if (top?.mark && MARKS[top.mark]) for (const [dx, dy] of MARKS[top.mark]) set(cx + dx - (shape === "hoodie" ? 0 : 1), torsoTop + 4 + dy, AX.TRIM);
  // ---- the bottom: legs
  const bot = worn(s, "bottom"), bs = bot ? bot.shape : "trousers";
  const legEnd = bs === "shorts" ? torsoBot + 6 : H - 3;
  for (let y = torsoBot; y < H - 3; y++) {
    const k = frame === 1 ? Math.floor((y - torsoBot) / 4) : 0;
    const c = y < legEnd ? AX.BOT : AX.SKIN;
    rect(cx - 5 - k, y, 4, 1, c); rect(cx + 1 + k, y, 4, 1, c);
  }
  if (bs === "skirt") { rect(cx - 6, torsoBot, 12, 6, AX.BOT); rect(cx - 7, torsoBot + 6, 14, 2, AX.BOT); for (let y = torsoBot + 8; y < H - 3; y++) { const k = frame === 1 ? Math.floor((y - torsoBot) / 4) : 0; rect(cx - 4 - k, y, 3, 1, AX.SKIN); rect(cx + 1 + k, y, 3, 1, AX.SKINS); } }
  if (bs === "jeans") { set(cx - 4, torsoBot + 1, AX.BTRIM); set(cx + 3, torsoBot + 1, AX.BTRIM); }
  if (bs === "joggers") { const k = frame === 1 ? 3 : 0; rect(cx - 5 - k, H - 5, 4, 1, AX.BTRIM); rect(cx + 1 + k, H - 5, 4, 1, AX.BTRIM); }
  if (bs === "shorts") { const k = frame === 1 ? 1 : 0; rect(cx - 5 - k, torsoBot + 5, 4, 1, AX.BTRIM); rect(cx + 1 + k, torsoBot + 5, 4, 1, AX.BTRIM); }
  // ---- the shoes
  const sh = worn(s, "shoes"), k = frame === 1 ? 3 : 0;
  rect(cx - 6 - k, H - 3, 5, 2, AX.SHOE); rect(cx + 1 + k, H - 3, 5, 2, AX.SHOE);
  if (sh) {
    if (sh.shape === "boots" || sh.shape === "hightops") { rect(cx - 5 - k, H - 5, 4, 2, AX.SHOE); rect(cx + 1 + k, H - 5, 4, 2, AX.SHOE); }
    if (sh.shape === "sneakers" || sh.shape === "hightops") { rect(cx - 6 - k, H - 2, 5, 1, AX.SOLE); rect(cx + 1 + k, H - 2, 5, 1, AX.SOLE); }
    if (sh.shape === "loafers") { set(cx - 4 - k, H - 3, AX.SOLE); set(cx + 3 + k, H - 3, AX.SOLE); }
    if (sh.shape === "hightops") { set(cx - 3 - k, H - 4, AX.SOLE); set(cx + 2 + k, H - 4, AX.SOLE); }
  }
  // ---- the outerwear: open at the front, over the top
  const o = worn(s, "outer");
  if (o) {
    const side = Math.max(3, Math.floor(torsoW / 2) - 1);
    const bottom = o.shape === "coat" ? torsoBot + 7 : torsoBot;
    for (let y = torsoTop; y < bottom; y++) {
      const k2 = y >= torsoBot && frame === 1 ? Math.floor((y - torsoBot) / 4) : 0;
      rect(tx - k2, y, side, 1, AX.OUT); rect(tx + torsoW - side + k2, y, side, 1, AX.OUTS);
    }
    if (o.shape !== "vest") { rect(lx, ly, 3, armLen, AX.OUT); rect(rx, ry, 3, armLen, AX.OUTS); }
    if (o.shape === "bomber") { rect(tx, torsoBot - 1, torsoW, 1, AX.OTRIM); rect(lx, ly + armLen - 1, 3, 1, AX.OTRIM); rect(rx, ry + armLen - 1, 3, 1, AX.OTRIM); rect(cx - 3, torsoTop, 6, 1, AX.OTRIM); }
    if (o.shape === "blazer") { for (let i = 0; i < 5; i++) { set(tx + side - 1 - Math.floor(i / 2), torsoTop + i, AX.OTRIM); set(tx + torsoW - side + Math.floor(i / 2), torsoTop + i, AX.OTRIM); } }
    if (o.shape === "coat") { set(tx + side - 1, torsoTop + 6, AX.OTRIM); set(tx + side - 1, torsoTop + 11, AX.OTRIM); }
    if (o.shape === "jacket") { set(tx + 1, torsoTop + 5, AX.OTRIM); set(tx + torsoW - 2, torsoTop + 5, AX.OTRIM); }
    if (o.mark && MARKS[o.mark]) for (const [dx, dy] of MARKS[o.mark]) set(tx + Math.floor(side / 2) + Math.round(dx / 2), torsoTop + 4 + dy, AX.OTRIM);
  }
}

function accessoryLayer({ set, rect }, s, g) {
  const { cx, headW, headTop, hx, torsoW, torsoTop, tx, armLen, lx, ly, rx, ry, hand } = g;
  const hat = worn(s, "head"), acc = worn(s, "acc");
  // worn headwear first: it replaces the spec's own hat
  if (hat) {
    if (hat.shape === "cap") { rect(hx, headTop - 2, headW, 3, AX.HAT); rect(hx - 4, headTop + 1, 5, 1, AX.HAT); if (hat.id === "h-sams-cap") rect(cx - 2, headTop - 1, 4, 2, AX.HAT2); else set(cx, headTop - 2, AX.HAT2); }
    if (hat.shape === "beanie") { rect(hx - 1, headTop - 3, headW + 2, 4, AX.HAT); rect(hx - 1, headTop + 1, headW + 2, 1, AX.HAT2); set(cx, headTop - 4, AX.HAT2); }
    if (hat.shape === "bucket") { rect(hx, headTop - 3, headW, 4, AX.HAT); rect(hx - 2, headTop + 1, headW + 4, 2, AX.HAT2); }
    if (hat.shape === "fedora") { rect(hx + 1, headTop - 3, headW - 2, 3, AX.HAT); rect(hx - 3, headTop, headW + 6, 1, AX.HAT); rect(hx + 1, headTop - 1, headW - 2, 1, AX.HAT2); }
  }
  // the spec's own accessory: headwear sits over hair, held things sit in the left hand (moves with the swing)
  const a = hat && /hat|cap|beanie|headphones/.test(s.accessory) ? "none" : s.accessory;
  switch (a) {
    case "glasses": rect(cx - 4, headTop + 4, 3, 3, AX.ACC); rect(cx + 1, headTop + 4, 3, 3, AX.ACC); set(cx - 3, headTop + 5, AX.ACC2); set(cx + 2, headTop + 5, AX.ACC2); set(cx - 1, headTop + 5, AX.ACC); set(cx, headTop + 5, AX.ACC); break;
    case "sunglasses": rect(cx - 4, headTop + 5, 3, 2, AX.ACC); rect(cx + 1, headTop + 5, 3, 2, AX.ACC); rect(cx - 1, headTop + 5, 2, 1, AX.ACC); break;
    case "bucket_hat": rect(hx, headTop - 3, headW, 4, AX.ACC); rect(hx - 2, headTop + 1, headW + 4, 2, AX.ACC2); break;
    case "cap": rect(hx, headTop - 2, headW, 3, AX.ACC); rect(hx - 4, headTop + 1, 5, 1, AX.ACC); set(cx, headTop - 2, AX.ACC2); break;
    case "beanie": rect(hx - 1, headTop - 3, headW + 2, 4, AX.ACC); rect(hx - 1, headTop + 1, headW + 2, 1, AX.ACC2); set(cx, headTop - 4, AX.ACC2); break;
    case "headphones": rect(hx - 1, headTop - 2, headW + 2, 1, AX.ACC); rect(hx - 2, headTop + 3, 2, 4, AX.ACC); rect(hx + headW, headTop + 3, 2, 4, AX.ACC); break;
    case "bag": for (let i = 0; i < torsoW; i++) set(tx + i, torsoTop + 1 + Math.floor(i * 10 / torsoW), AX.ACC2); rect(rx + 1, torsoTop + 10, 4, 5, AX.ACC); break;
    case "backpack": rect(tx + 2, torsoTop, 1, 7, AX.ACC2); rect(tx + torsoW - 3, torsoTop, 1, 7, AX.ACC2); rect(rx, torsoTop + 1, 2, 10, AX.ACC); break;
    case "book": rect(hand.x - 3, hand.y - 3, 4, 5, AX.ACC); rect(hand.x - 3, hand.y - 3, 1, 5, AX.ACC2); break;
    case "coffee": rect(hand.x - 2, hand.y - 2, 3, 4, AX.ACC2); rect(hand.x - 2, hand.y - 3, 3, 1, AX.ACC); break;
    case "phone": rect(hand.x - 1, hand.y - 3, 2, 4, AX.ACC); set(hand.x - 1, hand.y - 2, AX.ACC2); break;
    case "camera": rect(hand.x - 4, hand.y - 3, 5, 4, AX.ACC); set(hand.x - 2, hand.y - 2, AX.ACC2); set(hand.x - 3, hand.y - 2, AX.ACC2); break;
    case "briefcase": rect(rx - 1, ry + armLen + 1, 6, 4, AX.ACC); rect(rx + 1, ry + armLen, 2, 1, AX.ACC2); break;
    case "guitar": rect(tx - 1, torsoTop + 9, 6, 6, AX.ACC); set(tx + 2, torsoTop + 11, AX.ACC2); for (let i = 0; i < 9; i++) set(tx + 5 + i, torsoTop + 8 - i, AX.ACC2); break;
    case "laptop": rect(hand.x - 4, hand.y - 1, 6, 3, AX.ACC); rect(hand.x - 4, hand.y - 1, 6, 1, AX.ACC2); break;
    case "tool": rect(hand.x - 1, hand.y - 5, 1, 6, AX.ACC); rect(hand.x - 2, hand.y - 6, 3, 2, AX.ACC); set(hand.x - 1, hand.y - 6, AX.ACC2); break;
    default: break;
  }
  // a worn accessory, over everything
  if (acc) {
    if (acc.shape === "chain") { for (let i = 0; i < 4; i++) { set(cx - 3 + i, torsoTop + 1 + i, AX.WACC); set(cx + 2 - i, torsoTop + 1 + i, AX.WACC); } set(cx - 1, torsoTop + 5, AX.WACC2); set(cx, torsoTop + 5, AX.WACC2); }
    if (acc.shape === "scarf") { rect(cx - 4, torsoTop - 1, 8, 2, AX.WACC); rect(cx + 1, torsoTop + 1, 2, 6, AX.WACC); rect(cx + 1, torsoTop + 7, 2, 1, AX.WACC2); }
    if (acc.shape === "tote") { for (let i = 0; i < torsoW; i++) set(tx + i, torsoTop + 1 + Math.floor(i * 10 / torsoW), AX.WACC2); rect(rx + 1, torsoTop + 9, 5, 6, AX.WACC); set(rx + 3, torsoTop + 11, AX.WACC2); }
    if (acc.shape === "watch") { rect(lx, ly + armLen - 1, 3, 1, AX.WACC); set(lx + 1, ly + armLen - 1, AX.WACC2); }
    if (acc.shape === "shades") { rect(cx - 4, headTop + 5, 3, 2, AX.WACC); rect(cx + 1, headTop + 5, 3, 2, AX.WACC); rect(cx - 1, headTop + 5, 2, 1, AX.WACC2); }
  }
}

const LAYERS = [["body", bodyLayer], ["hair", hairLayer], ["clothes", clothesLayer], ["accessories", accessoryLayer]];
