// THE PREFECTS, drawn (docs/CITY_SPEC.md "The Prefects"). Each is painted procedurally, pixel by
// pixel, on the house sprite sheet (32 x 48 a frame, style C proportions: head top on row 2-3,
// the neck under it, the hip 27 rows below the head top, feet on row 46; the house outline
// #181020 round every part), two frames: standing and a stride. So the shared rig (rig.js) cuts
// it like anyone and it gestures with the same animations, at the same scale rules as the
// subjects. They are machines on purpose: lenses for eyes, visors, domes, plates, a beacon; no
// skin, no face anybody could own. Every one has its own head, build, legs, prop and palette
// (prefectData.js look), checked pairwise by check-prefects.
//
// Pure down to "Browser only" (the painter runs in node for the checks).
import { PREFECT, PREFECTS } from "./prefectData.js";
import { drawRig } from "./rig.js";
import { lineFor } from "./prefects.js";

export const PW = 32, PH = 48, FRAMES = 2;
const INK = "#181020";
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (h, f) => { const [r, g, b] = hexRgb(h); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0"); return `#${c(r)}${c(g)}${c(b)}`; };

// A frame being painted: base shapes carry a group (each group gets its own outline, so the arms
// part from the torso and the head from the neck, as the rig's cut expects), then details on top.
function frameCanvas() {
  const col = new Array(PW * PH).fill(null), grp = new Uint8Array(PW * PH);
  const inb = (x, y) => x >= 0 && x < PW && y >= 0 && y < PH;
  const G = {
    col, grp,
    rect(g, x0, y0, x1, y1, c) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (inb(x, y)) { col[y * PW + x] = c; grp[y * PW + x] = g; } },
    oval(g, cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const u = (x - cx) / (rx + 0.35), v = (y - cy) / (ry + 0.35); if (u * u + v * v <= 1 && inb(x, y)) { col[y * PW + x] = c; grp[y * PW + x] = g; } } },
    // details: only where something is painted already (force: anywhere)
    px(x, y, c, force = false) { if (inb(x, y) && (force || col[y * PW + x])) col[y * PW + x] = c; },
    hl(x0, x1, y, c, force) { for (let x = x0; x <= x1; x++) G.px(x, y, c, force); },
    vl(x, y0, y1, c, force) { for (let y = y0; y <= y1; y++) G.px(x, y, c, force); },
    fill(x0, y0, x1, y1, c, force) { for (let y = y0; y <= y1; y++) G.hl(x0, x1, y, c, force); },
    outline() {
      const edge = [];
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        const i = y * PW + x;
        if (!col[i]) continue;
        const g = grp[i];
        const out = (xx, yy) => !inb(xx, yy) || !col[yy * PW + xx] || (grp[yy * PW + xx] !== g && grp[yy * PW + xx] > g);
        if (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1)) edge.push(i);
      }
      for (const i of edge) col[i] = INK;
    },
  };
  return G;
}
// groups: the higher number draws its outline against the lower where they meet
const GR = { torso: 1, legL: 2, legR: 3, head: 4, armL: 5, armR: 6, prop: 7, neck: 8 };

// ---- builds: torso box, arms, shoulder row --------------------------------------------------------
const BUILD = {
  slim:     { t: [11, 20], a: 3, sh: 15, round: 0 },
  broad:    { t: [9, 22], a: 4, sh: 15, round: 0 },
  tall:     { t: [11, 20], a: 3, sh: 15, round: 0 },
  stocky:   { t: [9, 22], a: 4, sh: 16, round: 0 },
  barrel:   { t: [9, 22], a: 3, sh: 15, round: 1 },
  puffy:    { t: [8, 23], a: 4, sh: 15, round: 1 },
  robe:     { t: [10, 21], a: 4, sh: 15, round: 0 },
  athletic: { t: [10, 21], a: 3, sh: 15, round: 0, v: 1 },
  squat:    { t: [9, 22], a: 4, sh: 16, round: 0 },
  sharp:    { t: [11, 20], a: 3, sh: 15, round: 0, pads: 1 },
};
const HIP = 30;

function paintBody(G, look, f) {
  const { pal } = look, B = BUILD[look.build];
  const [t0, t1] = B.t, bob = f ? -1 : 0;
  // neck
  G.rect(GR.neck, 14, 13 + bob, 17, B.sh + bob, pal.dark);
  // torso
  if (B.round) {
    G.rect(GR.torso, t0 + 1, B.sh + bob, t1 - 1, HIP + bob, pal.body);
    G.rect(GR.torso, t0, B.sh + 2 + bob, t1, HIP - 2 + bob, pal.body);
  } else if (B.v) {
    G.rect(GR.torso, t0, B.sh + bob, t1, B.sh + 6 + bob, pal.body);
    G.rect(GR.torso, t0 + 1, B.sh + 7 + bob, t1 - 1, HIP + bob, pal.body);
  } else G.rect(GR.torso, t0, B.sh + bob, t1, HIP + bob, pal.body);
  if (B.pads) { G.rect(GR.torso, t0 - 1, B.sh + bob, t1 + 1, B.sh + 1 + bob, pal.body); }
  // arms: outside the torso, shoulder to hand (hip + 3); a robe's sleeves flare
  const aL0 = t0 - B.a, aR1 = t1 + B.a, hand = HIP + 3 + bob;
  const handL = look.prop === "card" ? null : true;
  G.rect(GR.armL, aL0, B.sh + 1 + bob, t0 - 1, hand - 1, look.build === "robe" ? pal.body : shade(pal.body, 0.85));
  if (look.build === "robe") G.rect(GR.armL, aL0 - 1, hand - 5, t0 - 1, hand - 1, pal.body);
  if (handL) G.rect(GR.armL, aL0, hand, t0 - 1, hand + 1, pal.metal);
  // the right arm: raised (the referee's card) or hanging
  if (look.prop === "card") {
    G.rect(GR.armR, t1 + 1, 7 + bob, t1 + B.a, B.sh + 3 + bob, shade(pal.body, 0.85));
    G.rect(GR.armR, t1 + 1, 5 + bob, t1 + B.a, 6 + bob, pal.metal);
  } else {
    G.rect(GR.armR, t1 + 1, B.sh + 1 + bob, aR1, hand - 1, look.build === "robe" ? pal.body : shade(pal.body, 0.85));
    if (look.build === "robe") G.rect(GR.armR, t1 + 1, hand - 5, aR1 + 1, hand - 1, pal.body);
    G.rect(GR.armR, t1 + 1, hand, aR1, hand + 1, pal.metal);
  }
  if (look.prop === "card") G.rect(GR.armL, aL0, hand, t0 - 1, hand + 1, pal.metal);
}

function paintLegs(G, look, f) {
  const { pal } = look, B = BUILD[look.build], [t0, t1] = B.t;
  if (look.legs === "skirt") {
    for (let y = HIP + 1; y <= 46; y++) {
      const w = Math.floor((y - HIP) / 5), sway = f && y > 40 ? 1 : 0;
      G.rect(GR.legL, t0 - w + sway, y, t1 + w + sway, y, pal.body);
    }
    return;
  }
  if (look.legs === "treads") {
    const dl = f ? -1 : 0, dr = f ? 1 : 0;
    G.rect(GR.legL, 12 + dl, HIP + 1, 14 + dl, 38, pal.metal);
    G.rect(GR.legR, 17 + dr, HIP + 1, 19 + dr, 38, pal.metal);
    G.rect(GR.legL, 9 + dl, 39, 14 + dl, 46, pal.dark);
    G.rect(GR.legR, 17 + dr, 39, 22 + dr, 46, pal.dark);
    return;
  }
  const wide = t1 - t0 >= 13 ? 1 : 0;
  const lx0 = 11 - wide, lx1 = 14, rx0 = 17, rx1 = 20 + wide;
  const dl = f ? -1 : 0, dr = f ? 1 : 0, lift = f ? 1 : 0;
  const leg = look.build === "puffy" ? pal.dark : shade(pal.body, 0.7);
  G.rect(GR.legL, lx0 + dl, HIP + 1, lx1 + dl, 46 - lift, leg);
  G.rect(GR.legR, rx0 + dr, HIP + 1, rx1 + dr, 46, leg);
  // boots
  G.rect(GR.legL, lx0 - 1 + dl, 44 - lift, lx1 + dl, 46 - lift, pal.dark);
  G.rect(GR.legR, rx0 + dr, 44, rx1 + 1 + dr, 46, pal.dark);
}

// ---- heads ----------------------------------------------------------------------------------------
const HEAD = {
  visor(G, p, b) {            // THE AUDITOR: a grey block, a green ledger-visor with a ticker, an aerial
    G.rect(GR.head, 11, 4 + b, 20, 12 + b, p.metal);
    G.rect(GR.head, 19, 2 + b, 19, 3 + b, p.dark);
  },
  eyeshade(G, p, b) {         // THE PIT BOSS: a round dome under a dealer's green eyeshade, one red eye
    G.oval(GR.head, 15.5, 8 + b, 5, 4.5, p.metal);
    G.rect(GR.head, 8, 3 + b, 21, 4 + b, p.accent);
  },
  mortar(G, p, b) {           // THE PROCTOR: a mortarboard on a narrow face-plate, a tassel
    G.rect(GR.head, 12, 5 + b, 19, 12 + b, p.metal);
    G.rect(GR.head, 8, 3 + b, 23, 4 + b, p.dark);
  },
  hardhat(G, p, b) {          // THE FOREMAN: a yellow hard-hat dome, brim, a beacon
    G.oval(GR.head, 15.5, 7 + b, 5.5, 4, p.trim);
    G.rect(GR.head, 9, 7 + b, 22, 7 + b, p.trim);
    G.rect(GR.head, 11, 8 + b, 20, 12 + b, p.dark);
    G.rect(GR.head, 15, 2 + b, 16, 3 + b, p.accent);
  },
  periscope(G, p, b) {        // THE LIFEGUARD SENTINEL: a stalk and a periscope box looking out
    G.rect(GR.head, 13, 6 + b, 18, 12 + b, p.metal);
    G.rect(GR.head, 10, 2 + b, 19, 5 + b, p.body);
  },
  goggles(G, p, b) {          // THE SKI PATROL: a round helmet, a wide goggle band
    G.oval(GR.head, 15.5, 8 + b, 5, 5, p.trim);
    G.rect(GR.head, 9, 7 + b, 22, 9 + b, p.dark);
  },
  halo(G, p, b) {             // THE CHAPLAIN: a soft hood, one slit, a lit ring on a stem
    G.oval(GR.head, 15.5, 9 + b, 4.5, 3.8, p.body);
    G.rect(GR.head, 15, 4 + b, 16, 5 + b, p.metal);
    G.rect(GR.head, 11, 2 + b, 20, 3 + b, p.lens);
  },
  catalogue(G, p, b) {        // THE LIBRARIAN: a card catalogue for a head, four drawers
    G.rect(GR.head, 10, 3 + b, 21, 12 + b, p.body);
  },
  frame(G, p, b) {            // THE CURATOR: a picture frame, an eye hung off-centre in it
    G.rect(GR.head, 9, 3 + b, 22, 12 + b, p.trim);
  },
  siren(G, p, b) {            // THE REFEREE UNIT: a black helmet, a white slit, a red siren dome
    G.rect(GR.head, 11, 5 + b, 20, 12 + b, p.dark);
    G.oval(GR.head, 15.5, 3.5 + b, 2.5, 1.5, p.lens);
  },
  intercom(G, p, b) {         // THE HOUSING OFFICER: an intercom panel, a grille, a call button
    G.rect(GR.head, 11, 4 + b, 20, 12 + b, p.metal);
    G.rect(GR.head, 12, 3 + b, 13, 3 + b, p.dark);
  },
  monolith(G, p, b) {         // THE AIDE: a narrow black slab, a white line for an eye, an earpiece
    G.rect(GR.head, 12, 2 + b, 19, 12 + b, p.body);
  },
  // PHASE 2 (phase2Prefects.js)
  lamp(G, p, b) {             // THE HARBOURMASTER: a white-topped peaked cap over a lighthouse lantern
    G.rect(GR.head, 11, 2 + b, 20, 4 + b, p.trim);
    G.rect(GR.head, 9, 5 + b, 22, 5 + b, p.dark);
    G.rect(GR.head, 12, 6 + b, 19, 12 + b, p.metal);
  },
  tricorne(G, p, b) {         // THE BEADLE: a three-cornered hat over a brass bell with one eye
    G.rect(GR.head, 13, 1 + b, 18, 2 + b, p.dark);
    G.rect(GR.head, 10, 3 + b, 21, 4 + b, p.dark);
    G.rect(GR.head, 7, 2 + b, 9, 4 + b, p.dark);
    G.rect(GR.head, 22, 2 + b, 24, 4 + b, p.dark);
    G.rect(GR.head, 8, 5 + b, 23, 5 + b, p.dark);
    G.oval(GR.head, 15.5, 9.5 + b, 4, 3, p.metal);
    G.rect(GR.head, 11, 12 + b, 20, 12 + b, p.trim);
  },
  mailbox(G, p, b) {          // THE COVENANT OFFICER: a curbside mailbox, its red flag up
    G.oval(GR.head, 15, 5 + b, 5, 2.6, p.metal);
    G.rect(GR.head, 10, 5 + b, 20, 12 + b, p.metal);
    G.rect(GR.head, 21, 1 + b, 23, 3 + b, p.accent);
    G.rect(GR.head, 21, 4 + b, 21, 9 + b, p.accent);
  },
  scanner(G, p, b) {          // THE SCREENER: a walk-through scanner arch for a head
    G.rect(GR.head, 8, 2 + b, 23, 4 + b, p.trim);
    G.rect(GR.head, 8, 5 + b, 10, 13 + b, p.trim);
    G.rect(GR.head, 21, 5 + b, 23, 13 + b, p.trim);
  },
  boater(G, p, b) {           // THE GRANGE INSPECTOR: a straw boater over a burlap sack face
    G.rect(GR.head, 11, 2 + b, 20, 4 + b, p.trim);
    G.rect(GR.head, 6, 5 + b, 25, 5 + b, p.trim);
    G.rect(GR.head, 11, 6 + b, 20, 12 + b, shade(p.trim, 0.72));
  },
  monitor(G, p, b) {          // THE HELPDESK: a beige-grey CRT monitor on its stand
    G.rect(GR.head, 8, 2 + b, 23, 11 + b, p.metal);
    G.rect(GR.head, 13, 12 + b, 18, 12 + b, p.dark);
  },
};
const HEAD_DETAIL = {
  visor(G, p, b, f) { G.fill(12, 7 + b, 19, 8 + b, p.lens); G.hl(12 + (f ? 1 : 0), 19, 7 + b, p.accent); for (let x = 12 + (f ? 1 : 0); x <= 19; x += 3) G.px(x, 8 + b, p.dark); G.hl(12, 19, 11 + b, p.trim); },
  eyeshade(G, p, b) { G.fill(13, 8 + b, 14, 9 + b, p.lens); G.px(13, 8 + b, "#fecaca"); G.hl(9, 20, 4 + b, shade(p.accent, 0.7)); G.hl(12, 19, 11 + b, p.trim); },
  mortar(G, p, b, f) { G.px(22, 5 + b, p.accent, true); G.px(22, 6 + b, p.accent, true); G.px(22 + (f ? 1 : 0), 7 + b, p.accent, true); G.fill(13, 8 + b, 14, 9 + b, p.lens); G.px(16, 8 + b, p.dark); G.hl(17, 18, 8 + b, p.dark); G.hl(13, 18, 11 + b, p.dark); },
  hardhat(G, p, b) { G.hl(12, 14, 10 + b, p.lens); G.hl(17, 19, 10 + b, p.lens); G.hl(11, 20, 5 + b, shade(p.trim, 1.15)); G.px(15, 2 + b, "#fff7d6"); },
  periscope(G, p, b) { G.fill(11, 3 + b, 12, 4 + b, p.lens); G.px(11, 3 + b, "#e0fbff"); G.hl(14, 17, 8 + b, p.dark); G.hl(14, 17, 10 + b, p.dark); G.fill(14, 6 + b, 17, 6 + b, p.trim); },
  goggles(G, p, b) { G.fill(10, 8 + b, 21, 8 + b, p.lens); G.hl(11, 14, 8 + b, "#fed7aa"); G.px(15, 4 + b, p.body); G.hl(14, 16, 5 + b, p.body); G.px(15, 6 + b, p.body); G.hl(12, 19, 11 + b, shade(p.trim, 0.8)); },
  halo(G, p, b) { G.hl(12, 19, 2 + b, "#fff7c2"); G.fill(13, 3 + b, 18, 3 + b, INK); G.hl(13, 18, 9 + b, p.lens); G.hl(12, 19, 11 + b, shade(p.body, 1.4)); },
  catalogue(G, p, b) { G.vl(15, 4 + b, 11 + b, p.dark); G.hl(11, 20, 7 + b, p.dark); for (const [x, y] of [[13, 5], [18, 5], [13, 9], [18, 9]]) G.px(x, y + b, p.trim); G.fill(12, 10 + b, 13, 11 + b, p.lens); G.fill(17, 10 + b, 18, 11 + b, p.lens); },
  frame(G, p, b) { G.fill(11, 5 + b, 20, 10 + b, p.dark); G.fill(12, 6 + b, 13, 7 + b, p.lens); G.px(12, 6 + b, "#fae8ff"); G.hl(10, 21, 4 + b, shade(p.trim, 0.8)); G.px(21, 11 + b, p.accent); },
  siren(G, p, b, f) { G.hl(12, 19, 8 + b, "#f4f4f5"); G.px(f ? 14 : 13, 2 + b, "#fee2e2"); G.hl(11, 20, 5 + b, p.trim); },
  intercom(G, p, b) { for (let y = 8; y <= 11; y += 1) for (let x = 13; x <= 18; x += 2) G.px(x + (y % 2), y + b, p.dark); G.fill(18, 5 + b, 19, 6 + b, p.lens); G.px(13, 5 + b, p.dark); G.hl(12, 16, 6 + b, shade(p.metal, 0.7)); },
  monolith(G, p, b) { G.hl(13, 18, 7 + b, p.lens); G.vl(13, 3 + b, 11 + b, p.metal); G.px(20, 7 + b, p.accent, true); G.px(20, 8 + b, p.accent, true); G.px(20, 9 + b, p.metal, true); },
  lamp(G, p, b, f) { G.hl(12, 19, 4 + b, shade(p.trim, 0.8)); G.hl(15, 16, 3 + b, "#facc15"); G.fill(13, 8 + b, 18, 10 + b, p.lens); G.vl(f ? 16 : 15, 8 + b, 10 + b, shade(p.lens, 0.6)); G.px(13, 8 + b, "#ecfeff"); G.hl(12, 19, 12 + b, p.dark); G.hl(13, 18, 6 + b, shade(p.metal, 0.75)); },
  tricorne(G, p, b, f) { G.hl(8, 23, 5 + b, p.trim); G.px(15, 2 + b, p.accent); G.px(16, 2 + b, p.accent); G.hl(13, 18, 9 + b, p.lens); G.px(f ? 16 : 15, 9 + b, "#ffffff"); G.hl(13, 18, 11 + b, shade(p.metal, 0.7)); },
  mailbox(G, p, b) { G.hl(12, 18, 8 + b, p.lens); G.hl(12, 18, 9 + b, p.dark); G.hl(11, 19, 11 + b, shade(p.metal, 0.7)); G.px(19, 6 + b, p.dark); G.hl(11, 19, 5 + b, shade(p.metal, 1.12)); G.fill(22, 2 + b, 22, 2 + b, "#fecaca"); },
  scanner(G, p, b, f) { G.hl(11, 20, (f ? 10 : 7) + b, p.lens, true); G.vl(9, 5 + b, 12 + b, shade(p.trim, 0.8)); G.hl(14, 17, 2 + b, p.accent); G.px(9, 7 + b, p.lens); G.px(22, 7 + b, p.lens); G.px(9, 10 + b, p.accent); G.px(22, 10 + b, p.accent); },
  boater(G, p, b) { G.hl(11, 20, 4 + b, p.accent); G.hl(7, 24, 5 + b, shade(p.trim, 0.85)); G.fill(13, 8 + b, 14, 9 + b, p.lens); G.fill(17, 8 + b, 18, 9 + b, p.lens); for (let x = 12; x <= 19; x += 2) G.px(x, 11 + b, p.dark); G.px(10, 12 + b, p.trim, true); G.px(21, 11 + b, p.trim, true); G.px(21, 12 + b, p.trim, true); },
  monitor(G, p, b, f) { G.fill(10, 4 + b, 21, 9 + b, "#052e16"); G.hl(11, 16, 5 + b, p.lens); G.hl(11, 14, 7 + b, p.lens); if (!f) G.fill(16, 7 + b, 17, 8 + b, p.lens); G.px(21, 10 + b, p.accent); G.px(22, 10 + b, p.lens); G.hl(9, 22, 11 + b, shade(p.metal, 0.75)); },
};

// ---- torsos: the uniform ---------------------------------------------------------------------------
const TORSO = {
  finance(G, p, b) { for (let x = 12; x <= 19; x += 2) G.vl(x, 17 + b, 29 + b, shade(p.body, 1.25)); G.vl(15, 16 + b, 24 + b, p.trim); G.vl(16, 16 + b, 24 + b, p.trim); G.fill(18, 18 + b, 19, 19 + b, p.trim); },
  strip(G, p, b) { G.fill(14, 16 + b, 17, 29 + b, "#f5f5f4"); G.hl(13, 18, 16 + b, p.trim); G.px(15, 17 + b, p.trim); G.px(16, 17 + b, p.trim); for (let y = 20; y <= 28; y += 3) G.px(15, y + b, p.dark); },
  campus(G, p, b) { G.hl(12, 19, 16 + b, p.trim); G.hl(13, 18, 17 + b, p.trim); G.fill(18, 20 + b, 19, 21 + b, p.accent); G.vl(15, 18 + b, 29 + b, shade(p.body, 1.4)); },
  works(G, p, b) { for (let x = 10; x <= 21; x++) for (let y = 23; y <= 25; y++) G.px(x, y + b, (x + y) % 4 < 2 ? p.trim : "#111111"); G.fill(13, 17 + b, 18, 20 + b, shade(p.body, 1.3)); G.px(14, 18 + b, p.lens); G.px(17, 18 + b, "#22c55e"); },
  coast(G, p, b) { G.fill(14, 18 + b, 17, 26 + b, p.trim); G.fill(11, 21 + b, 20, 23 + b, p.trim); G.hl(10, 21, 28 + b, p.accent); G.px(15, 16 + b, "#f8fafc"); G.px(16, 16 + b, "#f8fafc"); },
  heights(G, p, b) { for (let y = 19; y <= 28; y += 3) G.hl(9, 22, y + b, shade(p.body, 0.75)); G.fill(14, 20 + b, 17, 20 + b, p.trim); G.fill(15, 18 + b, 16, 22 + b, p.trim); G.fill(9, 16 + b, 22, 16 + b, p.metal); },
  commons(G, p, b) { G.vl(13, 16 + b, 30 + b, p.trim); G.vl(18, 16 + b, 30 + b, p.trim); G.fill(15, 19 + b, 16, 21 + b, p.lens); G.hl(14, 17, 20 + b, p.lens); },
  archive(G, p, b) { G.vl(15, 16 + b, 29 + b, p.dark); for (let y = 18; y <= 28; y += 3) G.px(16, y + b, p.trim); G.hl(12, 19, 16 + b, p.trim); G.vl(17, 17 + b, 20 + b, p.accent); G.px(17, 21 + b, p.accent); },
  arts(G, p, b) { G.hl(12, 19, 15 + b, shade(p.body, 1.8)); G.hl(12, 19, 16 + b, shade(p.body, 1.8)); G.vl(14, 17 + b, 21 + b, p.trim); G.fill(13, 22 + b, 15, 23 + b, p.trim); G.px(18, 18 + b, p.lens); },
  arena(G, p, b) { for (let x = 11; x <= 20; x++) if (x % 3 === 0) G.vl(x, 16 + b, 29 + b, "#111111"); G.px(16, 17 + b, p.accent); G.px(16, 18 + b, p.accent); G.hl(15, 17, 19 + b, p.accent); G.hl(10, 21, 30 + b, "#111111"); },
  sprawl(G, p, b) { G.hl(9, 22, 21 + b, p.trim); G.hl(9, 22, 22 + b, p.trim); G.fill(11, 17 + b, 13, 19 + b, "#f5f5f4"); G.px(12, 18 + b, p.lens); G.fill(17, 26 + b, 20, 28 + b, shade(p.body, 0.8)); },
  port(G, p, b) { G.hl(9, 11, 15 + b, p.trim); G.hl(20, 22, 15 + b, p.trim); for (const y of [18, 21, 24, 27]) { G.px(13, y + b, "#facc15"); G.px(18, y + b, "#facc15"); } G.vl(15, 16 + b, 29 + b, shade(p.body, 1.4)); G.hl(13, 18, 16 + b, p.trim); },
  oldtown(G, p, b) { G.hl(12, 19, 17 + b, p.trim); G.px(12, 16 + b, p.trim); G.px(19, 16 + b, p.trim); G.fill(15, 18 + b, 16, 20 + b, p.trim); G.px(15, 19 + b, p.accent); G.fill(15, 15 + b, 16, 16 + b, "#f8fafc"); G.vl(15, 22 + b, 30 + b, shade(p.body, 1.3)); G.vl(16, 22 + b, 30 + b, shade(p.body, 1.3)); },
  suburbs(G, p, b) { G.hl(13, 18, 15 + b, p.trim); G.px(15, 16 + b, p.trim); G.px(16, 16 + b, p.trim); G.vl(13, 16 + b, 22 + b, p.lens); G.fill(12, 23 + b, 14, 25 + b, "#fef3c7"); G.px(13, 24 + b, p.accent); G.fill(17, 18 + b, 18, 18 + b, shade(p.body, 1.4)); },
  airport(G, p, b) { G.hl(9, 11, 15 + b, p.accent); G.hl(20, 22, 15 + b, p.accent); G.fill(12, 18 + b, 13, 19 + b, "#facc15"); G.hl(9, 22, 28 + b, p.dark); G.vl(15, 16 + b, 27 + b, shade(p.body, 1.35)); G.fill(18, 18 + b, 20, 18 + b, p.trim); },
  farmland(G, p, b) { G.fill(12, 21 + b, 19, 30 + b, p.accent); G.vl(12, 16 + b, 20 + b, p.accent); G.vl(19, 16 + b, 20 + b, p.accent); G.px(12, 21 + b, p.trim); G.px(19, 21 + b, p.trim); G.fill(14, 24 + b, 17, 26 + b, shade(p.accent, 0.75)); for (let x = 10; x <= 21; x += 3) G.vl(x, 16 + b, 19 + b, shade(p.body, 1.3)); },
  engine(G, p, b) { G.vl(15, 16 + b, 22 + b, p.trim); G.vl(16, 16 + b, 22 + b, p.trim); G.fill(15, 23 + b, 16, 24 + b, "#f8fafc"); G.fill(12, 26 + b, 19, 29 + b, shade(p.body, 0.78)); G.hl(12, 19, 15 + b, shade(p.body, 1.3)); },
  hq(G, p, b) { G.fill(14, 16 + b, 17, 19 + b, "#f8fafc"); G.vl(15, 16 + b, 24 + b, p.trim); G.vl(16, 16 + b, 24 + b, p.trim); G.px(15, 16 + b, "#f8fafc"); G.hl(11, 20, 15 + b, p.metal); },
};

// ---- props: held in the hands ------------------------------------------------------------------------
function paintProp(G, look, f) {
  const { pal } = look, B = BUILD[look.build], [t0, t1] = B.t, b = f ? -1 : 0;
  const hl = t0 - B.a, hr = t1 + B.a, hy = HIP + 3 + b;
  switch (look.prop) {
    case "ledger": G.rect(GR.prop, hl - 4, hy - 4, hl, hy + 2, "#14532d"); break;
    case "chips": G.rect(GR.prop, hl - 3, hy - 3, hl - 1, hy + 1, pal.trim); G.rect(GR.prop, hr + 1, hy - 1, hr + 3, hy + 2, pal.lens); break;
    case "clipboard": G.rect(GR.prop, hl - 5, hy - 5, hl, hy + 2, "#92400e"); break;
    case "wrench": G.rect(GR.prop, hr, hy + 1, hr + 1, hy + 8, pal.metal); G.rect(GR.prop, hr - 1, hy + 8, hr + 2, hy + 10, pal.metal); break;
    case "buoy": G.oval(GR.prop, hl - 3, hy + 3, 3.5, 3.5, pal.accent); break;
    case "pole": G.rect(GR.prop, hr + 1, hy - 1, hr + 1, 45, pal.metal); G.rect(GR.prop, hr, 43, hr + 2, 43, pal.metal); break;
    case "lantern": G.rect(GR.prop, hl - 3, hy + 2, hl, hy + 6, pal.dark); break;
    case "stamp": G.rect(GR.prop, hl - 3, hy - 2, hl - 1, hy + 1, "#7c2d12"); G.rect(GR.prop, hl - 4, hy + 2, hl, hy + 3, "#b91c1c"); break;
    case "rope": G.rect(GR.prop, hl - 2, hy - 2, hl - 1, 45, "#c9a227"); G.rect(GR.prop, hl - 3, 44, hl, 46, "#c9a227"); break;
    case "card": G.rect(GR.prop, hr - 1, 1 + b, hr + 2, 5 + b, "#facc15"); break;
    case "keys": G.oval(GR.prop, hr + 1, hy + 3, 2.2, 2.2, "#a8a29e"); break;
    case "tablet": G.rect(GR.prop, hl - 4, hy - 5, hl, hy + 1, "#18181b"); break;
    case "foghorn": G.rect(GR.prop, hl - 2, hy - 1, hl - 1, hy + 1, pal.metal); G.rect(GR.prop, hl - 5, hy - 3, hl - 3, hy + 3, pal.accent); break;
    case "mace": G.rect(GR.prop, hr + 1, 12 + b, hr + 2, hy + 3, pal.trim); G.oval(GR.prop, hr + 1.5, 9.5 + b, 2.2, 2.2, pal.trim); break;
    case "ruler": G.rect(GR.prop, hr + 1, hy - 2, hr + 3, 45, "#facc15"); break;
    case "wand": G.rect(GR.prop, hr, hy + 1, hr + 1, hy + 3, pal.dark); G.rect(GR.prop, hr - 1, hy + 4, hr + 2, hy + 10, "#111827"); break;
    case "pitchfork": G.rect(GR.prop, hr + 1, 5 + b, hr + 1, 45, "#92400e"); G.rect(GR.prop, hr - 1, 4 + b, hr + 3, 4 + b, pal.metal); for (const dx of [-1, 1, 3]) G.rect(GR.prop, hr + dx, 2 + b, hr + dx, 3 + b, pal.metal); break;
    case "ticket": G.rect(GR.prop, hl - 3, hy - 3, hl - 1, 44, "#f8fafc"); break;
    default:
  }
}
function propDetail(G, look, f) {
  const { pal } = look, B = BUILD[look.build], [t0, t1] = B.t, b = f ? -1 : 0;
  const hl = t0 - B.a, hr = t1 + B.a, hy = HIP + 3 + b;
  switch (look.prop) {
    case "ledger": G.vl(hl - 1, hy - 3, hy + 1, "#fef9c3"); G.hl(hl - 3, hl - 2, hy - 1, pal.trim); break;
    case "chips": G.hl(hl - 2, hl - 2, hy - 1, "#dc2626"); G.px(hl - 2, hy - 2, "#f8fafc"); G.px(hr + 2, hy, "#f8fafc"); break;
    case "clipboard": G.fill(hl - 4, hy - 3, hl - 1, hy + 1, "#f8fafc"); G.hl(hl - 3, hl - 2, hy - 4, pal.metal); G.px(hl - 3, hy - 2, INK); G.px(hl - 3, hy, INK); break;
    case "buoy": G.fill(hl - 4, hy + 2, hl - 2, hy + 4, INK); G.px(hl - 6, hy + 3, "#f8fafc"); G.px(hl, hy + 3, "#f8fafc"); break;
    case "lantern": G.fill(hl - 2, hy + 3, hl - 1, hy + 5, "#fde047"); break;
    case "rope": G.hl(hl - 2, hl - 1, hy + 3, "#991b1b"); G.hl(hl - 2, hl - 1, hy + 4, "#991b1b"); break;
    case "card": G.fill(hr, 2 + b, hr + 1, 4 + b, "#fde047"); break;
    case "keys": G.px(hr + 1, hy + 3, INK); G.px(hr + 2, hy + 5, "#facc15", true); G.px(hr + 2, hy + 6, "#facc15", true); break;
    case "tablet": G.fill(hl - 3, hy - 4, hl - 1, hy, "#fca5a5"); G.hl(hl - 3, hl - 1, hy - 2, "#dc2626"); break;
    case "foghorn": G.fill(hl - 5, hy - 1, hl - 5, hy + 1, INK); G.px(hl - 4, hy - 2, "#fecaca"); break;
    case "mace": G.fill(hr + 1, 9 + b, hr + 2, 10 + b, pal.accent); G.px(hr + 1, 8 + b, "#fff7d6"); G.hl(hr + 1, hr + 2, 14 + b, pal.accent); break;
    case "ruler": for (let y = hy - 1; y <= 44; y += 2) G.hl(hr + 2, y % 4 === 1 ? hr + 3 : hr + 2, y, INK); break;
    case "wand": G.fill(hr, hy + 5, hr + 1, hy + 9, f ? shade(pal.lens, 0.6) : pal.lens); break;
    case "pitchfork": G.px(hr + 1, 4 + b, "#d6d3d1"); break;
    case "ticket": G.hl(hl - 3, hl - 1, hy - 3, pal.lens); for (let y = hy - 1; y <= 42; y += 2) G.px(hl - 2 - (y % 4 === 1 ? 0 : 1), y, "#64748b"); break;
    default:
  }
}

// One frame of a prefect: -> Uint8ClampedArray (PW x PH RGBA). f: 0 standing, 1 the stride.
// (pf: the prefect itself, for one whose district has not arrived yet: check-prefects paints them all)
export function paintPrefect(id, f = 0, pf = null) {
  const P = pf || PREFECT[id], look = P.look, pal = look.pal, b = f ? -1 : 0;
  const G = frameCanvas();
  paintLegs(G, look, f);
  paintBody(G, look, f);
  HEAD[look.head](G, pal, b, f);
  paintProp(G, look, f);
  G.outline();
  TORSO[id](G, pal, b, f);
  HEAD_DETAIL[look.head](G, pal, b, f);
  propDetail(G, look, f);
  const out = new Uint8ClampedArray(PW * PH * 4);
  for (let i = 0; i < PW * PH; i++) {
    const c = G.col[i];
    if (!c) continue;
    const [r, g, bl] = hexRgb(c);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = bl; out[i * 4 + 3] = 255;
  }
  return out;
}
// The sheet, both frames side by side: -> {w, h, rgba}
export function prefectSheetRGBA(id) {
  const w = PW * FRAMES, rgba = new Uint8ClampedArray(w * PH * 4);
  for (let f = 0; f < FRAMES; f++) {
    const fr = paintPrefect(id, f);
    for (let y = 0; y < PH; y++) rgba.set(fr.subarray(y * PW * 4, (y + 1) * PW * 4), (y * w + f * PW) * 4);
  }
  return { w, h: PH, rgba };
}
// The prefect's signal colour: its lens, for dots, beacons and the page.
export const signalOf = (id) => PREFECT[id].look.pal.lens;
export const accentOf = (id) => PREFECT[id].look.pal.body;

// ---- Browser only ------------------------------------------------------------------------------------
const SHEETS = new Map();
// -> {img (canvas), frames: 2, real: true, v: 1}: the rig and poses.js take it like any sheet.
export function prefectSheet(id) {
  let e = SHEETS.get(id);
  if (e) return e;
  const { w, h, rgba } = prefectSheetRGBA(id);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
  e = { img: c, frames: FRAMES, real: true, mini: null, v: 1 };
  SHEETS.set(id, e);
  return e;
}
export { PREFECTS };
// Tap a prefect: its card opens (PrefectPanel.jsx PrefectHost listens).
export function openPrefect(id) { window.dispatchEvent(new CustomEvent("hvi-prefect", { detail: id })); }

const STATURE = 1.08;   // a head taller than most: it is meant to be seen
// One prefect in the iso view. K: {ctx, z (camera zoom), storey, lod, t (seconds, 0 = reduced
// motion), night, hits}; m: {pf: patrolAt(...), x, y (screen feet), face (1 = turned right)};
// x: the district's civic record (for its words). Returns the box drawn.
export function drawPrefectIso(K, m, x) {
  const { ctx, lod, t, night } = K, pf = m.pf, id = pf.id;
  const sig = signalOf(id);
  if (lod === "far") {
    ctx.fillStyle = INK; ctx.fillRect(Math.round(m.x) - 2, Math.round(m.y) - 4, 5, 5);
    ctx.fillStyle = sig; ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 3, 3, 3);
    const box = [m.x - 4, m.y - 6, m.x + 4, m.y + 2];
    K.hits.push({ kind: "prefect", id, box });
    return box;
  }
  const hpx = K.z * K.storey * 0.95 * STATURE, s = hpx / PH;
  const e = prefectSheet(id);
  if (night) {   // its lens lights the street round it
    const gx = m.x, gy = m.y - hpx * 0.82, r = Math.max(4, hpx * 0.32);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, sig + "cc"); g.addColorStop(1, sig + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
    const pool = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, hpx * 0.5);
    pool.addColorStop(0, sig + "40"); pool.addColorStop(1, sig + "00");
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(m.x, m.y, hpx * 0.5, hpx * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }
  let box = null;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (!pf.moving && hpx >= 18 && pf.anim) box = drawRig(ctx, e, pf.anim, t, m.x, m.y, s, m.face, { ph: (PREFECTS.findIndex(p => p.id === id) + 1) / 13 });
  if (!box) {
    const fr = pf.moving && t > 0 ? Math.floor(t * 4) % 2 : 0;
    const w = PW * s, x0 = Math.round(m.x - w / 2), y0 = Math.round(m.y - hpx);
    ctx.save();
    if (m.face === 1) { ctx.translate(Math.round(m.x) * 2, 0); ctx.scale(-1, 1); }
    try { ctx.drawImage(e.img, fr * PW, 0, PW, PH, x0, y0, Math.round(w), Math.round(hpx)); } catch { /* not ready */ }
    ctx.restore();
    box = [m.x - w / 2, m.y - hpx, m.x + w / 2, m.y];
  }
  ctx.imageSmoothingEnabled = smooth;
  const hit = [m.x - hpx * 0.32, m.y - hpx, m.x + hpx * 0.32, m.y];
  K.hits.push({ kind: "prefect", id, box: hit });
  // the designation and the voice go on top of everything (drawPrefectTops), so a prefect behind a
  // building is still found
  if (K.tops && hpx >= 12) K.tops.push({ id, x: m.x, y: m.y, hpx, pf, civic: x, lod });
  return box;
}
// After everything else: each prefect's designation over its head and, standing at street zoom,
// now and then what it is saying. tops: what drawPrefectIso queued this frame.
export function drawPrefectTops(ctx, tops, font = "monospace") {
  for (const T of tops || []) {
    const { id, pf, hpx } = T, sig = signalOf(id), P = PREFECT[id];
    const m = { x: T.x, y: T.y }, x = T.civic;
    ctx.font = `bold 10px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    const tag = P.code, tw = ctx.measureText(tag).width + 6, ty = Math.round(m.y - hpx - 4);
    ctx.fillStyle = "rgba(6,10,6,0.85)"; ctx.fillRect(Math.round(m.x - tw / 2), ty - 12, Math.round(tw), 12);
    ctx.fillStyle = sig; ctx.fillText(tag, Math.round(m.x), ty);
    ctx.fillRect(Math.round(m.x) - 1, ty, 2, 3);
    if (T.lod === "near" && hpx >= 26 && !pf.moving && pf.beat % 2 === 0) {
      const text = lineFor(id, x, pf.bark);
      ctx.font = `10px ${font}`; ctx.textBaseline = "top";
      const words = text.split(" "), lines = [];
      let cur = "";
      for (const w of words) { const nx = cur ? cur + " " + w : w; if (ctx.measureText(nx).width > 170 && cur) { lines.push(cur); cur = w; } else cur = nx; }
      if (cur) lines.push(cur);
      const L = lines.slice(0, 4);
      if (lines.length > 4) L[3] = L[3].replace(/\s*\S*$/, "") + "...";
      const bw = Math.max(...L.map(l => ctx.measureText(l).width)) + 10, bh = L.length * 12 + 6;
      const bx = Math.round(m.x - bw / 2), by = ty - 16 - bh;
      ctx.fillStyle = "rgba(6,10,6,0.92)"; ctx.fillRect(bx, by, Math.round(bw), bh);
      ctx.strokeStyle = sig; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, Math.round(bw) - 1, bh - 1);
      ctx.fillStyle = "#d9f2e0";
      L.forEach((l, i) => ctx.fillText(l, Math.round(m.x), by + 4 + i * 12));
    }
  }
}
// A prefect's portrait on a small canvas (the card, the page): scale px per sprite px.
export function portraitCanvas(id, scale = 3) {
  const e = prefectSheet(id), c = document.createElement("canvas");
  c.width = PW * scale; c.height = PH * scale;
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  x.drawImage(e.img, 0, 0, PW, PH, 0, 0, c.width, c.height);
  return c;
}
