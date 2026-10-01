// THE NIGHTLIFE QUARTERS' rooms (props.js's Fallout Shelter rules: a plan per room type, one person
// per anchor, furniture sized to the people). props.js merges these in and lends its plan makers,
// like storefrontProps.js. docs/CITY_SPEC.md "THE NIGHTLIFE QUARTERS".
//   club         AURUM's floor, VOLTAGE, STROBE: the DJ booth (whoever is booked tonight works the decks),
//                the floor dancing (the rig's dance and dance2), mirror ball and beams
//   vip          AURUM's mezzanine: velvet booths, ice buckets, the bottle bar, sparklers
//   rooftop      THE CEILING: the skyline behind, loungers, the bar at the rail
//   cocktail     THE BITTERS: the back bar's bottles in tiers, stools, EBTV on a small screen
//   steakhouse   THE CUT: the grill, white cloths, leather
//   omakase      HINOKI: the counter, the itamae behind it, eight stools
//   supperclub   THE MINOR KEY: the bandstand (the piano, the singer), supper tables
//   hiphop       THE CYPHER: the booth, the mic, the crowd's hands up
//   punk         BASEMENT 0x00: the stage at floor level, the band, the pit jumping
//   karaoke      KARAOKE BOX: the screen and the lyric bar, the mic passed round, the sofas
//   poolhall     EIGHT BALL: the tables under their green lamps, EBTV over the bar
//   comedy       THE HECKLE: the brick wall, the spotlight, the mic stand, the audience
//   chicken      THE COOP: the fryers, the counter, the menu board (no prices), EBTV in the corner
//   liquor       LIQUOR 24, CUT-RATE: the bottle shelves, the counter behind glass
import { ebtvTv } from "./funnelProps.js";

export const NIGHT_ROOM_TYPE = {
  aurum: "club", "aurum-vip": "vip", ceiling: "rooftop", bitters: "cocktail", "the-cut": "steakhouse", hinoki: "omakase", "minor-key": "supperclub",
  voltage: "club", strobe: "club", cypher: "hiphop", basement: "punk", "karaoke-box": "karaoke", "eight-ball": "poolhall", "the-heckle": "comedy",
  "the-coop": "chicken", "liquor-24": "liquor", "cut-rate": "liquor",
};
export const NIGHT_LOOK = {
  club: ["#0c0814", "#1c1426"], vip: ["#1a1208", "#3a2a14"], rooftop: ["#101a2a", "#3a3530"], cocktail: ["#0e1a16", "#2a2018"],
  steakhouse: ["#1e120c", "#3a2414"], omakase: ["#2a2216", "#5a4630"], supperclub: ["#1a0c10", "#3a1a1c"], hiphop: ["#141414", "#2a2a2a"],
  punk: ["#140c0c", "#262020"], karaoke: ["#1a0a20", "#3a1a40"], poolhall: ["#0e140e", "#2a2018"], comedy: ["#1a0e0c", "#2a1a14"],
  chicken: ["#2a1a10", "#4a3a2a"], liquor: ["#1a1814", "#34302a"],
};
// acts that are animations here: the floor dances, the pit jumps (rigReact.js RIG_ACTS + anim)
export const NIGHT_ACTS = ["dance", "dance2", "hooray", "applaud", "mosh"];

export function nightPlans(PLANS, { A, M, P, SIDE }) {
  const dj = M(A("station", "arcade", "staff"), "djBooth", 2.4, 0.5);   // hands on the decks (the rig's arcade)
  const dancer = (act) => M(A("stand", act, "patron"), null, 1.05);
  PLANS.club = {
    back: { head: [dj], unit: [dancer("dance"), dancer("dance2")] },
    front: { unit: [dancer("dance2"), dancer("dance"), M(A("stand", "drink", "patron"), null, 1.1)] },
    solo: { head: [dj], unit: [dancer("dance"), dancer("dance2")] },
  };
  PLANS.vip = {
    back: { max: 3, head: [M(A("counter", "pour", "staff"), "bottleBar", 1.8)], unit: [M(A("seat", "drink", "patron", 1), "velvetBooth", 1.2), P("iceBucket", 0.55)] },
    front: { unit: [M(A("seat", "talk", "patron", 1), "velvetBooth", 1.2), P("iceBucket", 0.55), dancer("dance")] },
  };
  PLANS.rooftop = {
    back: { unit: [M(A("stand", "drink", "patron"), null, 1.2), P("plant", 0.55)] },
    front: { head: [M(A("counter", "pour", "staff", 1), "barEnd", 2, 0.28)], unit: [M(A("seat", "talk", "patron", 1), "sofa", 1.1), P("sideTable", 0.5), M(A("seat", "drink", "patron", -1), "sofa", 1.1)] },
  };
  PLANS.cocktail = {
    back: { max: 3, span: "counter", unit: [M(A("counter", "pour", "staff"), null, 1.2), P("taps", 1.0)] },
    front: { unit: [M(A("seat", "drink", "patron"), "barStool", 1.15)] },
    solo: { head: [M(A("counter", "pour", "staff", 1), "barEnd", 2, 0.28)], unit: [M(A("seat", "drink", "patron"), "barStool", 1.15)] },
  };
  PLANS.steakhouse = {
    back: { head: [M(A("station", "cook", "staff"), "grill", 1.5)], unit: [M(A("seat", "eat", "patron", 1), "armchair", 1.15), P("clothTable", 0.6), M(A("seat", "eat", "patron", -1), "armchair", 1.15)] },
    front: { unit: [M(A("seat", "eat", "patron", 1), "armchair", 1.15), P("clothTable", 0.6), M(A("seat", "talk", "patron", -1), "armchair", 1.15), P(null, 0.25)] },
    solo: { head: [M(A("station", "cook", "staff", 1), "grillEnd", 2, 0.28)], unit: [M(A("seat", "eat", "patron", 1), "armchair", 1.15), P("clothTable", 0.6), M(A("seat", "eat", "patron", -1), "armchair", 1.15)] },
  };
  PLANS.omakase = {
    back: { max: 2, span: "sushiCounter", unit: [M(A("counter", "serve", "staff"), null, 1.6)] },
    front: { unit: [M(A("seat", "eat", "patron"), "barStool", 1.15)] },
    solo: { head: [M(A("counter", "serve", "staff", 1), "barEnd", 2, 0.28)], unit: [M(A("seat", "eat", "patron"), "barStool", 1.15)] },
  };
  PLANS.supperclub = {
    back: { span: "stage", head: [M(A("station", "piano", "staff", 1), "piano", 1.9, 0.25)], unit: [M(A("stand", "sing", "staff"), "mic", 1.5)] },
    front: { unit: [M(A("seat", "eat", "patron", 1), "chair", 1.05), P("clothTable", 0.6), M(A("seat", "listen", "patron", -1), "chair", 1.05), P(null, 0.25)] },
    solo: { head: [M(A("station", "piano", "staff", 1), "piano", 1.9, 0.25)], unit: [M(A("seat", "listen", "patron", 1), "chair", 1.05), P("clothTable", 0.6)] },
  };
  PLANS.hiphop = {
    back: { span: "stage", head: [M(A("stand", "perform", "staff"), "mic", 1.5)], unit: [M(A("station", "arcade", "staff"), "djBooth", 2.4)] },
    front: { unit: [M({ ...A("stand", "hooray", "patron"), anim: "cheer" }, null, 1.05), dancer("dance2")] },
    solo: { head: [M(A("stand", "perform", "staff"), "mic", 1.5)], unit: [M({ ...A("stand", "hooray", "patron"), anim: "cheer" }, null, 1.05), dancer("dance2")] },
  };
  PLANS.punk = {
    back: { span: "stage", head: [M(A("stand", "perform", "staff"), "mic", 1.5)], unit: [M(A("stand", "perform", "staff"), "ampStack", 1.6)] },
    front: { unit: [M({ ...A("stand", "mosh", "patron"), anim: "jump" }, null, 1.0), M({ ...A("stand", "mosh", "patron"), anim: "dance2" }, null, 1.0)] },
    solo: { head: [M(A("stand", "perform", "staff"), "mic", 1.5)], unit: [M({ ...A("stand", "mosh", "patron"), anim: "jump" }, null, 1.0)] },
  };
  const host = M(A("station", "arcade", "staff"), "djBooth", 2.2);   // the host at the songbook console
  PLANS.karaoke = {
    back: { head: [M(A("stand", "sing", "patron"), "karaokeScreen", 2.6), host], unit: [M({ ...A("stand", "hooray", "patron"), anim: "cheer" }, null, 1.1)] },
    front: { unit: [M(A("seat", "drink", "patron", 1), "sofa", 1.1), M({ ...A("seat", "applaud", "patron", -1), anim: "clap" }, "sofa", 1.1), P("sideTable", 0.5)] },
    solo: { head: [M(A("stand", "sing", "patron"), "karaokeScreen", 2.6), host], unit: [M(A("seat", "drink", "patron", 1), "sofa", 1.1)] },
  };
  PLANS.poolhall = {
    back: { max: 3, span: "counter", unit: [M(A("counter", "pour", "staff"), null, 1.2), P("taps", 1.0)] },
    front: { unit: [M({ ...A("stand", "cue", "patron", 1), anim: "point" }, "poolTable", 2.6, SIDE), M(A("stand", "watch", "patron", -1), null, 1.05)] },
    solo: { unit: [M({ ...A("stand", "cue", "patron", 1), anim: "point" }, "poolTable", 2.6, SIDE), M(A("stand", "watch", "patron", -1), null, 1.05)] },
  };
  PLANS.comedy = {
    back: { span: "stage", head: [M({ ...A("stand", "routine", "staff"), anim: "point" }, "micStand", 1.6)], unit: [P(null, 0.6)] },
    front: { unit: [M({ ...A("seat", "laugh", "patron"), anim: "clap" }, "chair", 1.05), M(A("seat", "watch", "patron"), "chair", 1.05), P("cafeTable", 0.55)] },
    solo: { head: [M({ ...A("stand", "routine", "staff"), anim: "point" }, "micStand", 1.6)], unit: [M(A("seat", "watch", "patron"), "chair", 1.05)] },
  };
  PLANS.chicken = {
    back: { head: [M(A("station", "cook", "staff"), "fryer", 1.5)], unit: [M(A("counter", "serve", "staff"), "counter", 1.2), M(A("seat", "eat", "patron"), "barStool", 1.15)] },
    front: { unit: [M(A("stand", "eat", "patron"), null, 1.05), M(A("seat", "eat", "patron"), "barStool", 1.15)] },
    solo: { head: [M(A("station", "cook", "staff", 1), "grillEnd", 2, 0.28)], unit: [M(A("stand", "eat", "patron"), null, 1.05)] },
  };
  PLANS.liquor = {
    back: { unit: [M(A("stand", "browse", "patron"), "shelf_bottles", 1.35), P(null, 0.25)] },
    front: { head: [M(A("counter", "sell", "staff", 1), "shopCounter", 2.4, 0.2)], unit: [M(A("stand", "browse", "patron"), "shelf_bottles", 1.35)] },
    solo: { head: [M(A("counter", "sell", "staff", 1), "shopCounter", 2.4, 0.2)], unit: [M(A("stand", "browse", "patron"), "shelf_bottles", 1.35)] },
  };
}

// ---- drawing ----------------------------------------------------------------------------------------
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function text(c, s, x, y, px, col, align = "center") {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y));
}
const PAL = ["#f43f5e", "#facc15", "#22d3ee", "#a3e635", "#a855f7", "#fb923c"];
const personX = (X, W, a) => (a ? a.x : X + W / 2);

export function nightPropDrawers() {
  return {
    djBooth: {
      front(c, X, Y, W, p, t) {
        const x = X + W * 0.15, w = W * 0.7;
        R(c, "#3f3f46", x, Y - 16 * p, w, 16 * p); R(c, "#71717a", x, Y - 17 * p, w, 2 * p);
        R(c, PAL[Math.floor((t || 0) * 2) % PAL.length], x, Y - 4 * p, w, p);   // the neon strip along the booth's foot
        text(c, "DJ", x + w / 2, Y - 14 * p, 4 * p, "#e4e4e7");
        for (let k = 0; k < 2; k++) { const cx = x + w * (0.25 + k * 0.5); R(c, "#3f3f46", cx - 4 * p, Y - 19 * p, 8 * p, 2 * p); R(c, t && Math.floor(t * 4 + k) % 2 ? "#a3e635" : "#22d3ee", cx - p, Y - 19 * p, 2 * p, p); }
        for (let k = 0; k < 6; k++) R(c, PAL[(k + Math.floor((t || 0) * 3)) % PAL.length], x + 3 * p + k * (w - 6 * p) / 6, Y - 10 * p, 2 * p, 2 * p);
      },
    },
    velvetBooth: {
      back(c, X, Y, W, p, t, a) { const x = personX(X, W, a); R(c, "#6b1220", x - 9 * p, Y - 24 * p, 18 * p, 16 * p); R(c, "#d4af37", x - 9 * p, Y - 25 * p, 18 * p, p); R(c, "#8b1a2a", x - 9 * p, Y - 10 * p, 18 * p, 8 * p); },
    },
    iceBucket: {
      back(c, X, Y, W, p, t) { const x = X + W / 2; R(c, "#2a2a2a", x - p, Y - 10 * p, 2 * p, 10 * p); R(c, "#d4d4d8", x - 4 * p, Y - 16 * p, 8 * p, 6 * p); R(c, "#14532d", x - 2 * p, Y - 22 * p, 2 * p, 7 * p); R(c, "#d4af37", x - 2 * p, Y - 23 * p, 2 * p, p); if (t && Math.sin(t * 5 + X) > 0.5) { R(c, "#fff7cc", x - p, Y - 27 * p, 2 * p, 3 * p); R(c, "rgba(255,240,180,0.4)", x - 3 * p, Y - 29 * p, 6 * p, 6 * p); } },
    },
    bottleBar: {
      back(c, X, Y, W, p) { R(c, "#2a1a0a", X, Y - 16 * p, W, 16 * p); R(c, "#d4af37", X, Y - 17 * p, W, p); for (let k = 0; k < Math.floor(W / (4 * p)); k++) R(c, ["#14532d", "#7f1d1d", "#d4af37"][k % 3], X + 2 * p + k * 4 * p, Y - 24 * p, 2 * p, 7 * p); },
    },
    clothTable: {
      back(c, X, Y, W, p) { const x = X + W / 2; R(c, "#f5f5f4", x - 8 * p, Y - 15 * p, 16 * p, 2 * p); R(c, "#e7e5e4", x - 8 * p, Y - 13 * p, 16 * p, 7 * p); R(c, "#fbbf24", x - p, Y - 19 * p, 2 * p, 4 * p); R(c, "rgba(251,191,36,0.25)", x - 4 * p, Y - 22 * p, 8 * p, 6 * p); },
    },
    sushiCounter: {
      front(c, X, Y, W, p) { R(c, "#d3b27c", X, Y - 16 * p, W + 1, 3 * p); R(c, "#8a6a42", X, Y - 13 * p, W + 1, 13 * p); for (let x = X + 6 * p; x < X + W - 6 * p; x += 14 * p) { R(c, "#1f2937", x, Y - 18 * p, 8 * p, 2 * p); R(c, "#f97316", x + p, Y - 20 * p, 3 * p, 2 * p); R(c, "#f5f5f4", x + 4 * p, Y - 20 * p, 3 * p, 2 * p); } },
    },
    ampStack: {
      back(c, X, Y, W, p, t, a) { const x = personX(X, W, a) + 6 * p; R(c, "#111", x, Y - 26 * p, 10 * p, 26 * p); R(c, "#333", x + p, Y - 24 * p, 8 * p, 10 * p); R(c, "#333", x + p, Y - 12 * p, 8 * p, 10 * p); const b = t ? Math.abs(Math.sin(t * 9)) : 0; R(c, "#555", x + 3 * p - b * p, Y - 21 * p - b * p, 4 * p + 2 * b * p, 4 * p + 2 * b * p); },
    },
    karaokeScreen: {
      back(c, X, Y, W, p, t) {
        const w = Math.min(W - 2 * p, 34 * p), x = X + (W - w) / 2;
        R(c, "#111", x, Y - 44 * p, w, 22 * p); R(c, "#1e1b4b", x + p, Y - 43 * p, w - 2 * p, 20 * p);
        const k = t ? (t * 0.4) % 1 : 0.5;
        R(c, "#f8fafc", x + 4 * p, Y - 30 * p, w - 8 * p, 2 * p); R(c, "#f472b6", x + 4 * p, Y - 30 * p, (w - 8 * p) * k, 2 * p);   // the lyric bar, filling as it is sung
        text(c, "SING. IT IS LOGGED.", x + w / 2, Y - 41 * p, 3 * p, "#fde68a");
      },
    },
    poolTable: {
      front(c, X, Y, W, p, t, a) {
        const x0 = (a ? a.x : X) + 6 * p, x1 = X + W - p;
        R(c, "#3a2010", x0, Y - 13 * p, x1 - x0, 3 * p); R(c, "#166534", x0 + p, Y - 14 * p, x1 - x0 - 2 * p, p);
        R(c, "#2a160a", x0 + 2 * p, Y - 10 * p, 2 * p, 10 * p); R(c, "#2a160a", x1 - 4 * p, Y - 10 * p, 2 * p, 10 * p);
        R(c, "#f8fafc", x0 + (x1 - x0) * 0.3, Y - 16 * p, 2 * p, 2 * p); R(c, "#111", x0 + (x1 - x0) * 0.6, Y - 16 * p, 2 * p, 2 * p); R(c, "#facc15", x0 + (x1 - x0) * 0.7, Y - 16 * p, 2 * p, 2 * p);
        // the cue, from the shooter's hands
        if (a) { c.strokeStyle = "#c8a24a"; c.lineWidth = Math.max(1, p); c.beginPath(); c.moveTo(a.x + 2 * p, Y - 22 * p); c.lineTo(x0 + (x1 - x0) * 0.28, Y - 16 * p); c.stroke(); }
        R(c, "rgba(74,222,128,0.12)", x0, Y - 40 * p, x1 - x0, 26 * p); R(c, "#14532d", x0 + (x1 - x0) / 2 - 5 * p, Y - 42 * p, 10 * p, 3 * p);   // the lamp
      },
    },
    micStand: {
      back(c, X, Y, W, p, t, a) { const x = personX(X, W, a) - 6 * p; R(c, "#9ca3af", x, Y - 28 * p, p, 28 * p); R(c, "#1a1a1a", x - p, Y - 31 * p, 3 * p, 3 * p); R(c, "#4b5563", x - 3 * p, Y - p, 7 * p, p); },
    },
    fryer: {
      back(c, X, Y, W, p, t) { const w = Math.min(W - 2 * p, 22 * p), x = X + W - w - p; R(c, "#9ca3af", x, Y - 18 * p, w, 18 * p); R(c, "#4b5563", x + 2 * p, Y - 18 * p, w - 4 * p, 3 * p); R(c, t && Math.sin(t * 7) > 0 ? "#f59e0b" : "#d97706", x + 3 * p, Y - 17 * p, w - 6 * p, p); text(c, "24H", x + w / 2, Y - 24 * p, 4 * p, "#dc2626"); },
    },
  };
}

// The rooms' walls (props.js DRAW: (c, x, y, w, h, u) behind the furniture).
export function nightRoomDrawers() {
  const spk = (c, x, y, h, u) => { R(c, "#0a0a0a", x, y + h * 0.3, 8 * u, h * 0.6); R(c, "#2a2a2a", x + 2 * u, y + h * 0.38, 4 * u, 4 * u); R(c, "#2a2a2a", x + 2 * u, y + h * 0.58, 4 * u, 4 * u); };
  return {
    club(c, x, y, w, h, u) { spk(c, x + 2 * u, y, h, u); spk(c, x + w - 10 * u, y, h, u); R(c, "#d4d4d8", x + w / 2 - 3 * u, y + 2 * u, 6 * u, 6 * u); },
    vip(c, x, y, w, h, u) { R(c, "#d4af37", x, y + h * 0.18, w, u); R(c, "#2a1a08", x, y + h * 0.2, w, h * 0.3); for (let k = 0; k < Math.floor(w / (14 * u)); k++) R(c, "#3a2a14", x + 4 * u + k * 14 * u, y + h * 0.24, 8 * u, h * 0.22); },
    rooftop(c, x, y, w, h, u) {
      R(c, "#16213a", x, y, w, h * 0.62);
      for (let k = 0, sx = x; sx < x + w; sx += 7 * u, k++) { const bh = h * (0.12 + ((k * 37) % 9) / 30); R(c, "#0b1220", sx, y + h * 0.62 - bh, 6 * u, bh); if (k % 2) R(c, "#fcd34d", sx + 2 * u, y + h * 0.62 - bh + 3 * u, u, u); }
      R(c, "#9ca3af", x, y + h * 0.62, w, u);   // the glass rail
    },
    cocktail(c, x, y, w, h, u) { for (let r = 0; r < 3; r++) { R(c, "#3a2a14", x + 4 * u, y + h * (0.12 + r * 0.14), w - 8 * u, u); for (let sx = x + 6 * u, k = 0; sx < x + w - 6 * u; sx += 4 * u, k++) R(c, ["#14532d", "#7f1d1d", "#b45309", "#1e3a8a", "#d4af37"][(k + r) % 5], sx, y + h * (0.12 + r * 0.14) - 5 * u, 2 * u, 5 * u); } },
    steakhouse(c, x, y, w, h, u) { R(c, "#3a2414", x, y + h * 0.3, w, h * 0.32); for (let sx = x + 6 * u; sx < x + w; sx += 16 * u) R(c, "#4a3018", sx, y + h * 0.33, 10 * u, h * 0.26); R(c, "#111", x + w * 0.4, y + h * 0.08, w * 0.2, h * 0.14); text(c, "THE CUT", x + w / 2, y + h * 0.1, 4 * u, "#d4af37"); },
    omakase(c, x, y, w, h, u) { for (let sx = x; sx < x + w; sx += 5 * u) R(c, "#b48a52", sx, y, 2 * u, h * 0.6); R(c, "#1e3a8a", x + w * 0.42, y + 2 * u, w * 0.16, h * 0.18); R(c, "#f8fafc", x + w * 0.49, y + 4 * u, w * 0.02, h * 0.1); },
    supperclub(c, x, y, w, h, u) { R(c, "#5a0e18", x, y, w * 0.12, h * 0.65); R(c, "#5a0e18", x + w * 0.88, y, w * 0.12, h * 0.65); for (let sx = x + w * 0.12; sx < x + w * 0.88; sx += 6 * u) R(c, "#3a0a10", sx, y, 3 * u, h * 0.6); },
    hiphop(c, x, y, w, h, u) { for (let k = 0; k < Math.floor(w / (20 * u)); k++) text(c, ["CYPHER", "BARS", "0xE2", "MIC"][k % 4], x + 10 * u + k * 20 * u, y + h * 0.2, 5 * u, PAL[k % PAL.length]); },
    punk(c, x, y, w, h, u) { for (let k = 0; k < Math.floor(w / (9 * u)); k++) { R(c, ["#f5f5f4", "#fde047", "#f87171"][k % 3], x + 2 * u + k * 9 * u, y + h * (0.15 + (k % 3) * 0.08), 7 * u, 9 * u); R(c, "#111", x + 3 * u + k * 9 * u, y + h * (0.15 + (k % 3) * 0.08) + 3 * u, 5 * u, u); } },
    karaoke(c, x, y, w, h, u) { R(c, "#3a1a40", x, y + h * 0.5, w, h * 0.1); for (let k = 0; k < 20; k++) R(c, "#f0abfc", x + ((k * 53) % 97) / 97 * w, y + ((k * 31) % 41) / 41 * h * 0.45, u, u); },
    poolhall(c, x, y, w, h, u) { R(c, "#14532d", x, y + h * 0.5, w, 2 * u); text(c, "CALL YOUR POCKET", x + w / 2, y + h * 0.1, 4 * u, "#4ade80"); },
    comedy(c, x, y, w, h, u) { for (let r = 0; r < 10; r++) for (let k = 0; k < Math.ceil(w / (8 * u)); k++) R(c, (r + k) % 3 ? "#7a2e22" : "#6a2618", x + k * 8 * u + (r % 2 ? 4 * u : 0), y + r * 4 * u, 7 * u, 3 * u); text(c, "THE HECKLE", x + w / 2, y + 2 * u, 5 * u, "#fde68a"); },
    chicken(c, x, y, w, h, u) { R(c, "#111", x + w * 0.2, y + h * 0.06, w * 0.6, h * 0.2); for (let k = 0; k < 4; k++) R(c, ["#f59e0b", "#dc2626", "#fbbf24", "#b45309"][k], x + w * (0.24 + k * 0.14), y + h * 0.09, w * 0.1, h * 0.08); text(c, "THE COOP // 24H // PRICES SET BY THE DEPARTMENT", x + w / 2, y + h * 0.19, 3 * u, "#fde68a"); },
    liquor(c, x, y, w, h, u) { text(c, "ID CHECKED. TIER NOTED.", x + w / 2, y + h * 0.06, 3.5 * u, "#ef4444"); },
  };
}
// Live layers (props.js LIVE: (c, x, y, w, h, u, {t, hour}) over the walls): the beams, the ball,
// the strobe, the stage light; EBTV on the telly in the bars that have one.
export function nightLive() {
  const beams = (c, x, y, w, h, u, t, strobe) => {
    const n = 4;
    for (let k = 0; k < n; k++) {
      const a = Math.sin(t * 0.8 + k * 1.7) * 0.6, x0 = x + w * (k + 0.5) / n, len = h * 0.9;
      c.fillStyle = `${PAL[(k + Math.floor(t)) % PAL.length]}33`;
      c.beginPath(); c.moveTo(x0, y + 2 * u); c.lineTo(x0 + Math.sin(a - 0.08) * len, y + Math.cos(a - 0.08) * len); c.lineTo(x0 + Math.sin(a + 0.08) * len, y + Math.cos(a + 0.08) * len); c.closePath(); c.fill();
    }
    // the mirror ball's flecks
    for (let k = 0; k < 18; k++) { const fx = x + ((k * 41 + Math.floor(t * 6) * 7) % 97) / 97 * w, fy = y + ((k * 23 + Math.floor(t * 6) * 3) % 53) / 53 * h * 0.8; R(c, "rgba(255,255,255,0.55)", fx, fy, u, u); }
    if (strobe && t && Math.floor(t * 8) % 5 === 0) R(c, "rgba(255,255,255,0.18)", x, y, w, h);
  };
  return {
    club(c, x, y, w, h, u, { t }) { beams(c, x, y, w, h, u, t || 0, false); },
    hiphop(c, x, y, w, h, u, { t }) { R(c, `rgba(250,204,21,${(0.05 + 0.05 * Math.abs(Math.sin((t || 0) * 4))).toFixed(3)})`, x, y, w, h); },
    punk(c, x, y, w, h, u, { t }) { R(c, `rgba(239,68,68,${(0.06 + 0.08 * Math.abs(Math.sin((t || 0) * 9))).toFixed(3)})`, x, y, w, h); },
    comedy(c, x, y, w, h, u) { c.fillStyle = "rgba(255,247,204,0.10)"; c.beginPath(); c.moveTo(x + w * 0.3, y); c.lineTo(x + w * 0.42, y); c.lineTo(x + w * 0.3, y + h); c.lineTo(x + w * 0.05, y + h); c.closePath(); c.fill(); },
    karaoke(c, x, y, w, h, u, { t }) { R(c, `rgba(240,171,252,${(0.04 + 0.04 * Math.abs(Math.sin((t || 0) * 2))).toFixed(3)})`, x, y, w, h); },
    cocktail(c, x, y, w, h, u, o) { if (w > 60 * u) ebtvTv(c, x + w * 0.78, y + 4 * u, u, o.t || 0, 20); },
    poolhall(c, x, y, w, h, u, o) { if (w > 60 * u) ebtvTv(c, x + w * 0.06, y + 4 * u, u, o.t || 0, 20); },
    chicken(c, x, y, w, h, u, o) { if (w > 60 * u) ebtvTv(c, x + w * 0.04, y + 4 * u, u, o.t || 0, 18); },
  };
}
// STROBE's own flash over the club's beams: props.js calls LIVE by type, so the strobe is read by place
export const STROBE_PLACES = new Set(["strobe"]);
