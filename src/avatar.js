// Citizen file photos: a procedural 32x48 sprite built from a small spec of enum values.
// Shared by the client (drawing) and the functions (validation). Pure, no DOM.
// Only enum values are ever stored: the subject's own description is read once to pick
// them and then discarded, so a file photo can never carry free text.

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
// are dropped. Returns null for a non-object, so "no photo" stays distinguishable.
export function sanitizeSpec(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out = {};
  for (const k of AVATAR_KEYS) {
    const v = typeof x[k] === "string" ? x[k].trim().toLowerCase() : "";
    out[k] = allowed(k).includes(v) ? v : DEFAULT_SPEC[k];
  }
  return out;
}

// { kind: "sprite", url } | { kind: "procedural", spec } | null. Sprite URLs are ours only.
export function sanitizeAvatar(a) {
  if (!a || typeof a !== "object") return null;
  if (a.kind === "sprite" && typeof a.url === "string" && /^\/(sprites\/[a-z0-9-]+\.png|api\/sprite\/[a-z0-9-]+)(\?v=\d+)?$/.test(a.url)) return { kind: "sprite", url: a.url };
  if (a.kind === "procedural") { const spec = sanitizeSpec(a.spec); return spec ? { kind: "procedural", spec } : null; }
  return null;
}

// Palette slots.
export const AX = { EMPTY: 0, OUTLINE: 1, TOP: 2, TOPS: 3, SKIN: 4, EYE: 5, HAIR: 6, ACC: 7, BOT: 8, ACC2: 9, SHOE: 10, SKINS: 11 };

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
  const top = hexToRgb(CLOTH[s.top_color]);
  const d = (c, f) => c.map(v => Math.round(v * f));
  const [a1, a2] = ACC_COLORS[s.accessory] || ACC_COLORS.none;
  return [null, [5, 8, 5], top, d(top, 0.66), skin, [10, 15, 10], hexToRgb(AVATAR_ENUMS.hair_color[s.hair_color]), hexToRgb(a1), hexToRgb(CLOTH[s.bottom_color]), hexToRgb(a2), [24, 20, 18], d(skin, 0.8)];
}

// 32x48 palette-index grid for one frame (frame 1 = mid-stride). Same body plan as the
// tier placeholders so citizens walk like everyone else in the building.
export function avatarPixels(spec, frame = 0) {
  const s = sanitizeSpec(spec) || DEFAULT_SPEC;
  const W = SPRITE_W, H = SPRITE_H;
  const px = new Uint8Array(W * H);
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; };
  const rect = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c); };

  // docs/avatar-design-system.md: head ~1/4 of a 45px body, feet on row 46, 1px outline room top and bottom.
  const cx = 16, headW = 12, headH = 11, headTop = 4, hx = cx - headW / 2;
  const torsoW = { slim: 10, average: 12, broad: 16 }[s.build];
  const torsoTop = headTop + headH + 1, torsoBot = 32, tx = cx - torsoW / 2;
  const swing = frame === 1 ? 1 : 0;

  // head, face
  rect(hx, headTop, headW, headH, AX.SKIN);
  rect(hx + headW - 2, headTop + 1, 2, headH - 2, AX.SKINS);
  set(cx - 3, headTop + 5, AX.EYE); set(cx - 3, headTop + 6, AX.EYE);
  set(cx + 2, headTop + 5, AX.EYE); set(cx + 2, headTop + 6, AX.EYE);
  rect(cx - 1, headTop + 8, 3, 1, AX.SKINS);

  // facial hair before hair so long hair frames it
  if (s.facial_hair === "stubble") for (let x = hx + 2; x < hx + headW - 2; x += 2) { set(x, headTop + 9, AX.HAIR); set(x + 1, headTop + 10, AX.HAIR); }
  if (s.facial_hair === "mustache") rect(cx - 3, headTop + 7, 6, 1, AX.HAIR);
  if (s.facial_hair === "beard") { rect(hx + 1, headTop + 7, headW - 2, 4, AX.HAIR); rect(cx - 1, headTop + 8, 3, 1, AX.SKINS); }

  // hair
  switch (s.hair_style) {
    case "buzz": rect(hx, headTop, headW, 2, AX.HAIR); break;
    case "short": rect(hx, headTop - 1, headW, 3, AX.HAIR); rect(hx, headTop + 2, 1, 3, AX.HAIR); rect(hx + headW - 1, headTop + 2, 1, 3, AX.HAIR); break;
    case "side_part": rect(hx - 1, headTop - 1, headW + 2, 3, AX.HAIR); rect(hx - 1, headTop + 2, 2, 3, AX.HAIR); rect(hx, headTop + 2, 5, 1, AX.HAIR); break;
    case "spiky": rect(hx, headTop, headW, 2, AX.HAIR); for (let x = hx; x < hx + headW; x += 2) { set(x, headTop - 1, AX.HAIR); set(x, headTop - 2, AX.HAIR); } break;
    case "curly": rect(hx - 1, headTop - 2, headW + 2, 4, AX.HAIR); for (let x = hx; x < hx + headW; x += 2) set(x, headTop - 3, AX.HAIR); rect(hx - 1, headTop + 2, 2, 4, AX.HAIR); rect(hx + headW - 1, headTop + 2, 2, 4, AX.HAIR); break;
    case "afro": rect(hx - 3, headTop - 4, headW + 6, 7, AX.HAIR); rect(hx - 3, headTop + 3, 3, 5, AX.HAIR); rect(hx + headW, headTop + 3, 3, 5, AX.HAIR); break;
    case "long": rect(hx - 1, headTop - 1, headW + 2, 3, AX.HAIR); rect(hx - 1, headTop + 2, 2, 12, AX.HAIR); rect(hx + headW - 1, headTop + 2, 2, 12, AX.HAIR); break;
    case "bun": rect(hx, headTop - 1, headW, 3, AX.HAIR); rect(cx - 2, headTop - 4, 4, 3, AX.HAIR); break;
    case "ponytail": rect(hx, headTop - 1, headW, 3, AX.HAIR); rect(hx + headW, headTop + 1, 2, 9, AX.HAIR); break;
    default: break;   // bald
  }
  rect(cx - 2, headTop + headH, 4, 1, AX.SKIN);   // neck

  // torso and arms in the top colour
  rect(tx, torsoTop, torsoW, torsoBot - torsoTop, AX.TOP);
  rect(tx + torsoW - 2, torsoTop, 2, torsoBot - torsoTop, AX.TOPS);
  const armLen = 11;
  const lx = tx - 3, ly = torsoTop + 1 - swing, rx = tx + torsoW, ry = torsoTop + 1 + swing;
  rect(lx, ly, 3, armLen, AX.TOP); rect(lx, ly + armLen, 3, 2, AX.SKIN);
  rect(rx, ry, 3, armLen, AX.TOPS); rect(rx, ry + armLen, 3, 2, AX.SKIN);

  // legs, shoes
  for (let y = torsoBot; y < H - 3; y++) {
    const k = frame === 1 ? Math.floor((y - torsoBot) / 4) : 0;
    rect(cx - 5 - k, y, 4, 1, AX.BOT); rect(cx + 1 + k, y, 4, 1, AX.BOT);
  }
  const k = frame === 1 ? 3 : 0;
  rect(cx - 6 - k, H - 3, 5, 2, AX.SHOE); rect(cx + 1 + k, H - 3, 5, 2, AX.SHOE);

  // accessory: headwear sits over hair, held things sit in the left hand (moves with the swing)
  const hand = { x: lx, y: ly + armLen };
  switch (s.accessory) {
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

  // 1px outline around the figure, as on every sprite in the building
  const out = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x] !== AX.EMPTY) continue;
    const n = (xx, yy) => xx >= 0 && xx < W && yy >= 0 && yy < H && px[yy * W + xx] > AX.OUTLINE;
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) out[y * W + x] = AX.OUTLINE;
  }
  return out;
}
