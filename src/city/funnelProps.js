// The funnel rooms (props.js's Fallout Shelter rules: a plan per room type, one person per
// anchor, furniture sized to the people). props.js merges these in and lends its plan makers.
//   arcade      THE ARCADE: a cabinet for every game in arcade.json (playable ones with a
//               player at them, OUT OF ORDER ones dark and taped), the prize counter
//   recordshop  EB SHOP: record bins to browse, the counter with its turntable turning, and
//               the staff: EBSN's hosts as cardboard standees (props, never subjects)
//   union       THE UNION LOUNGE: sofas, a JETSAM! and an ANAMNESIS cabinet, EBTV on the telly
//   ebtv        ELECTRIC BASEMENT TV's Stage A: the EBSN desk (Dale and Carol in cardboard
//               beside whoever presents), cameras and crew, the vision mixer, a studio audience
// Cabinets also stand in the Dive, the Lantern, the diner and a corner of the casino; the
// bars and the diner get a TV showing what EBTV is playing (funnels.js ebtvNow).
import { GAMES, GAME, PLAYABLE, cabColors, highScore, ebtvNow, ebtvLive, CAMPAIGN_OF_PLACE } from "./funnels.js";
import { machineClock } from "./sim.js";

export const FUNNEL_ROOM_TYPE = { arcade: "arcade", "eb-shop": "recordshop", "campus-lounge": "union", "studio-row": "ebtv", boardwalk: "boardwalk" };
export const FUNNEL_LOOK = { boardwalk: ["#241c10", "#5a4630"], arcade: ["#140c20", "#2a1a3a"], recordshop: ["#241a16", "#3e2c22"], union: ["#1c1a22", "#34303c"], ebtv: ["#12282a", "#2a2a30"] };
export const FUNNEL_ACTS = ["arcade", "browse"];
export const HOSTS = ["carol", "dale", "asuka", "hector", "joan", "vern"];
export const isCabinet = (prop) => typeof prop === "string" && prop.startsWith("cab:");
export const cabinetGame = (prop) => (isCabinet(prop) ? prop.slice(4) : null);

// ---- plans ----------------------------------------------------------------------------
export function funnelPlans(PLANS, { A, M, P, SIDE }) {
  const cab = (slug) => (GAME[slug]?.status === "dev" ? P(`cab:${slug}`, 0.9) : M(A("stand", "arcade", "patron", 1), `cab:${slug}`, 1.6, SIDE));
  const floor = GAMES.map(g => cab(g.slug));   // playable first, then the dark ones (sync-arcade.mjs order)
  PLANS.arcade = {
    back: { unit: floor },
    front: { head: [M(A("counter", "serve", "staff", 1), "prizeCounter", 2.3, SIDE)], unit: floor },
    solo: { head: [M(A("counter", "serve", "staff", 1), "prizeCounter", 2.3, SIDE)], unit: floor },
  };
  const bin = M(A("stand", "browse", "patron"), "recordBin", 1.25);
  PLANS.recordshop = {
    back: { head: [M(A("stand", "browse", "patron"), "shopCounter", 2.4, 0.2)], unit: [bin, P("standee:dale", 0.8), bin, P("standee:vern", 0.8), bin, P("standee:asuka", 0.8)] },
    front: { unit: [bin, P("standee:carol", 0.8), bin, bin, P("standee:joan", 0.8), bin, P("standee:hector", 0.8)] },
    solo: { head: [M(A("stand", "browse", "patron"), "shopCounter", 2.4, 0.2), P("standee:carol", 0.8), P("standee:dale", 0.8)], unit: [bin, bin, P("standee:vern", 0.8)] },
  };
  PLANS.union = {
    back: { head: [cab("jetsam"), cab("anamnesis")], unit: [M(A("seat", "talk", "patron", 1), "sofa", 1.1), P("sideTable", 0.5), M(A("seat", "drink", "patron", -1), "sofa", 1.1)] },
    front: { unit: [M(A("seat", "read", "patron", 1), "armchair", 1.08), P("cafeTable", 0.55), M(A("seat", "talk", "patron", -1), "chair", 1.05), P(null, 0.3)] },
    solo: { head: [cab("jetsam"), cab("anamnesis")], unit: [M(A("seat", "talk", "patron", 1), "sofa", 1.1), P("sideTable", 0.5)] },
  };
  PLANS.ebtv = {
    back: { head: [M(A("stand", "present", "staff", 1), "hostDesk", 2.8, 0.18)], unit: [M(A("station", "film", "staff", 1), "camera", 1.7, SIDE)] },
    front: { unit: [M(A("station", "type", "staff", 1), "switcher", 1.75, SIDE), M(A("seat", "watch", "patron"), "theatreSeat", 1.08), M(A("seat", "watch", "patron"), "theatreSeat", 1.08), M(A("station", "film", "staff", 1), "camera", 1.7, SIDE)] },
    solo: { head: [M(A("stand", "present", "staff", 1), "hostDesk", 2.8, 0.18)], unit: [M(A("station", "film", "staff", 1), "camera", 1.7, SIDE), M(A("seat", "watch", "patron"), "theatreSeat", 1.08)] },
  };
  // the Coast's boardwalk: its market stalls, and a JETSAM! cabinet among them
  if (PLANS.market) PLANS.boardwalk = JSON.parse(JSON.stringify(PLANS.market));
  // a JETSAM! cabinet in the bars, the diner and a corner of the casino: first in its row
  const withCab = (row) => { if (row) row.head = [cab("jetsam"), ...(row.head || [])]; };
  for (const t of ["bar", "diner", "boardwalk"]) { withCab(PLANS[t]?.front); withCab(PLANS[t]?.solo); }
  if (PLANS.casino) { withCab(PLANS.casino.front); if (PLANS.casino.solo) withCab(PLANS.casino.solo); }
}

// ---- drawing ----------------------------------------------------------------------------
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function hk(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const blink = (t, hz, ph = 0) => ((t * hz + ph) % 1 + 1) % 1 < 0.5;
function text(c, s, x, y, px, col, align = "left") {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y));
}
const today = () => { try { return machineClock().day; } catch { return 1; } };

// The standees' faces: public/funnels/hosts.png, one 40 x 56 cell per host (HOSTS order).
let SHEET = null;
function sheet() {
  if (SHEET || typeof Image === "undefined") return SHEET;
  SHEET = new Image(); SHEET.src = "/funnels/hosts.png";
  return SHEET;
}

// Where a SIDE module's furniture goes (props.js rightOf): right of the person, to the module's end.
const rightOf = (X, W, a, p, side) => { const px = a ? a.x : X + W * side; return [px + 7 * p, X + W - p]; };
const CAB_H = 44;
// A cabinet's box in the room (for the tap), from its plan item: [x0, y0, x1, y1].
export function cabinetBox(it, rowY, p, side) {
  const [x0, x1] = it.a ? rightOf(it.x0, it.x1 - it.x0, it.a, p, side) : [it.x0 + p, it.x1 - p];
  return [x0, rowY - CAB_H * p, Math.max(x0 + 4 * p, Math.min(x1, x0 + 16 * p)), rowY];
}

function cabinet(slug, side) {
  const g = GAME[slug] || { slug, title: slug.toUpperCase(), status: "dev" };
  const [c1, c2] = cabColors(slug);
  const dark = g.status === "dev";
  return {
    back(c, X, Y, W, p, t, a) {
      const [bx0, by0, bx1] = cabinetBox({ x0: X, x1: X + W, a }, Y, p, side);
      const w = bx1 - bx0, top = by0;
      // the glow on the wall behind a lit screen
      if (!dark) { c.fillStyle = `${c1}22`; c.fillRect(Math.round(bx0 - 4 * p), Math.round(top - 2 * p), Math.round(w + 8 * p), Math.round(26 * p)); }
      R(c, "#16121e", bx0, top, w, CAB_H * p);                       // the body
      R(c, dark ? "#2a2a2e" : c2, bx0, top + 8 * p, 2 * p, 30 * p);   // side art
      R(c, dark ? "#3a3a3a" : c1, bx0, top, w, 6 * p);                // the marquee
      const hs = highScore(slug, g.slug, today());
      if (p >= 1.4) text(c, dark ? "OUT OF ORDER" : `${hs.initials} ${hs.score}`, bx0 + w / 2, top + 1.2 * p, 3.4 * p, dark ? "#9ca3af" : "#0b0b0f", "center");
      // the screen
      const sx = bx0 + 2 * p, sy = top + 9 * p, sw = w - 4 * p, sh = 12 * p;
      R(c, "#050608", sx, sy, sw, sh);
      if (dark) {
        R(c, "#e8d36a", sx + sw * 0.15, sy + sh * 0.3, sw * 0.7, sh * 0.4);   // the taped sign
        R(c, "#6b5a1a", sx + sw * 0.25, sy + sh * 0.45, sw * 0.5, p);
      } else if (slug === "jetsam") {
        // stars, the ring, the ship slinging round it
        for (let k = 0; k < 6; k++) R(c, "#e0f2fe", sx + ((hk("st" + k) % 97) / 97) * sw, sy + ((hk("sy" + k) % 89) / 89) * sh, p * 0.8, p * 0.8);
        const cx = sx + sw / 2, cy = sy + sh / 2, an = t * 2.2 + (a?.i || 0);
        c.strokeStyle = c2; c.lineWidth = Math.max(1, p * 0.6); c.beginPath(); c.ellipse(cx, cy, sw * 0.3, sh * 0.3, 0, 0, Math.PI * 2); c.stroke();
        R(c, "#fbbf24", cx + Math.cos(an) * sw * 0.3 - p, cy + Math.sin(an) * sh * 0.3 - p, 2 * p, 2 * p);
      } else if (slug === "anamnesis") {
        // one phosphor: lines of the terminal typing out, a cursor
        const n = 1 + (Math.floor(t * 1.5 + (a?.i || 0)) % 4);
        for (let k = 0; k < n; k++) R(c, "#4ade80", sx + p, sy + p + k * 2.6 * p, sw * (0.4 + ((k * 37) % 50) / 100), p);
        if (blink(t, 1.5)) R(c, "#86efac", sx + p, sy + p + n * 2.6 * p, 2 * p, p * 1.4);
      } else {
        const k = Math.floor(t * 3 + hk(slug)) % 4;
        for (let i = 0; i < 4; i++) R(c, i === k ? c1 : c2, sx + p + i * (sw - 2 * p) / 4, sy + sh - 4 * p, (sw - 2 * p) / 5, 3 * p);
        R(c, "#e5e7eb", sx + sw * 0.4, sy + 2 * p, sw * 0.2, sw * 0.2);
      }
      if (g.status === "beta") { R(c, "#f97316", sx + sw - 7 * p, sy - p, 8 * p, 3.2 * p); if (p >= 1.4) text(c, "BETA", sx + sw - 3 * p, sy - 0.6 * p, 2.6 * p, "#0b0b0f", "center"); }
      // the control panel, the stick and two buttons, the coin door
      R(c, "#2a2436", bx0 - p, top + 22 * p, w + 2 * p, 4 * p);
      R(c, "#dc2626", bx0 + 3 * p, top + 20 * p - (a && blink(t, 3, (a.i || 0) * 0.3) ? p : 0), 2 * p, 2 * p);
      R(c, c1, bx0 + w - 7 * p, top + 23 * p, 2 * p, p); R(c, c2, bx0 + w - 4 * p, top + 23 * p, 2 * p, p);
      R(c, "#0d0b12", bx0 + w / 2 - 3 * p, top + 32 * p, 6 * p, 6 * p);
      R(c, dark ? "#444" : "#fbbf24", bx0 + w / 2 - p, top + 34 * p, 2 * p, 2 * p);
    },
  };
}

// A cardboard host on an easel: the photo keyed out of its set, a white board edge, the name.
function standee(host) {
  const idx = Math.max(0, HOSTS.indexOf(host));
  return {
    back(c, X, Y, W, p) {
      const w = Math.min(W - 2 * p, 22 * p), h = w * 1.45, x = X + (W - w) / 2, y = Y - h - 4 * p;
      R(c, "#8a6a42", x + w * 0.45, y + h, w * 0.1, 4 * p);          // the easel foot
      R(c, "#f1ede4", x - p, y - p, w + 2 * p, h + 2 * p);             // the board
      const img = sheet();
      if (img && img.complete && img.naturalWidth) { c.imageSmoothingEnabled = false; c.drawImage(img, idx * 40, 0, 40, 56, Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
      else R(c, "#7a6a8a", x, y, w, h);
      R(c, "#111", x, y + h - 5 * p, w, 5 * p);
      if (p >= 1.2) text(c, host.toUpperCase(), x + w / 2, y + h - 4.6 * p, 3.6 * p, "#fef3c7", "center");
    },
  };
}

export function funnelPropDrawers({ SIDE }) {
  const PROP = {};
  for (const g of GAMES) PROP[`cab:${g.slug}`] = cabinet(g.slug, SIDE);
  for (const h of HOSTS) PROP[`standee:${h}`] = standee(h);
  PROP.prizeCounter = {
    back(c, X, Y, W, p, t, a) {
      const [x0, x1] = rightOf(X, W, a, p, SIDE);
      // the prizes on the wall: plush, a lava lamp, a rubber chicken
      const cols = ["#f472b6", "#60a5fa", "#fbbf24", "#4ade80", "#a78bfa"];
      for (let k = 0; k < 5; k++) R(c, cols[k], x0 + p + k * (x1 - x0 - 2 * p) / 5, Y - 36 * p - (k % 2) * 3 * p, 4 * p, 5 * p);
      if (p >= 1.4) text(c, "PRIZES", (x0 + x1) / 2, Y - 44 * p, 4 * p, "#fbbf24", "center");
    },
    front(c, X, Y, W, p, t, a) {
      const [x0, x1] = rightOf(X, W, a, p, SIDE);
      R(c, "#3b2a55", x0 - 3 * p, Y - 18 * p, x1 - x0 + 3 * p, 18 * p);
      R(c, "rgba(186,230,253,0.35)", x0 - 2 * p, Y - 17 * p, x1 - x0 + p, 8 * p);   // the glass
      for (let k = 0; k < 4; k++) R(c, ["#f87171", "#fbbf24", "#22d3ee", "#f472b6"][k], x0 + p + k * 5 * p, Y - 14 * p, 3 * p, 3 * p);
      R(c, "#fbbf24", x0 - 3 * p, Y - 19 * p, x1 - x0 + 3 * p, p);
    },
  };
  PROP.recordBin = {
    front(c, X, Y, W, p) {
      const x = X + W / 2, bw = Math.min(W - 2 * p, 26 * p);
      const cols = ["#dc2626", "#1d4ed8", "#eab308", "#111827", "#15803d", "#9333ea", "#f97316", "#e5e7eb"];
      for (let k = 0; k < 8; k++) R(c, cols[(k + hk("b" + Math.round(X))) % 8], x - bw / 2 + p + k * (bw - 2 * p) / 8, Y - 24 * p + (k % 3) * p, (bw - 2 * p) / 8 - 0.5 * p, 10 * p);
      R(c, "#8a6a42", x - bw / 2, Y - 16 * p, bw, 16 * p);
      R(c, "#5a4428", x - bw / 2, Y - 8 * p, bw, p);
      if (p >= 1.3) text(c, "$5", x, Y - 13 * p, 4 * p, "#fef3c7", "center");
    },
  };
  PROP.shopCounter = {
    back(c, X, Y, W, p, t) {
      // the wall behind the till: THE EB SHOP's own turntable video, a sleeve on a stand
      const x0 = X + W * 0.42;
      R(c, "#111", x0, Y - 34 * p, 16 * p, 11 * p);
      R(c, "#dc2626", x0 + 2 * p, Y - 32 * p, 12 * p, 7 * p);
      R(c, "#fef3c7", x0 + 6 * p + Math.sin(t * 1.5) * 3 * p, Y - 30 * p, 3 * p, 3 * p);   // the product, turning
    },
    front(c, X, Y, W, p, t) {
      const x0 = X + W * 0.35, x1 = X + W - p;
      R(c, "#5a3a22", x0, Y - 16 * p, x1 - x0, 16 * p);
      R(c, "#7a4a2a", x0, Y - 17 * p, x1 - x0, 2 * p);
      // the till and the turntable, its record turning
      R(c, "#374151", x1 - 9 * p, Y - 22 * p, 7 * p, 5 * p);
      const cx = x0 + 7 * p, cy = Y - 18 * p;
      R(c, "#1f1f1f", cx - 6 * p, cy - p, 12 * p, 2 * p);
      c.fillStyle = "#0a0a0a"; c.beginPath(); c.ellipse(cx, cy - p, 5 * p, 1.6 * p, 0, 0, Math.PI * 2); c.fill();
      R(c, "#dc2626", cx - p, cy - 1.5 * p, 2 * p, p);
      R(c, "rgba(255,255,255,0.6)", cx + Math.cos(t * 4) * 4 * p, cy - p + Math.sin(t * 4) * p, p, p);
    },
  };
  PROP.hostDesk = {
    back(c, X, Y, W, p, t, a) {
      // Dale and Carol, in cardboard, seated to the presenter's right
      const x0 = (a ? a.x : X + W * 0.2) + 8 * p;
      PROP["standee:dale"].back(c, x0, Y - 6 * p, 20 * p, p * 0.9);
      PROP["standee:carol"].back(c, x0 + 20 * p, Y - 6 * p, 20 * p, p * 0.9);
    },
    front(c, X, Y, W, p) {
      const x0 = X + W * 0.1, x1 = X + W - p;
      R(c, "#8a5a32", x0, Y - 17 * p, x1 - x0, 3 * p);
      R(c, "#5a3a22", x0, Y - 14 * p, x1 - x0, 14 * p);
      R(c, "#0e7490", x0 + (x1 - x0) * 0.35, Y - 12 * p, (x1 - x0) * 0.3, 7 * p);
      if (p >= 1.2) text(c, "EBSN", x0 + (x1 - x0) * 0.5, Y - 11.5 * p, 5 * p, "#f472b6", "center");
      R(c, "#1a1a1a", x0 + 6 * p, Y - 24 * p, p, 7 * p); R(c, "#6b7280", x0 + 5 * p, Y - 25 * p, 3 * p, 2 * p);   // a mic
    },
  };
  PROP.switcher = {
    back(c, X, Y, W, p, t, a) { const [x0] = rightOf(X, W, a, p, SIDE); for (let k = 0; k < 3; k++) { R(c, "#0b1220", x0 + k * 7 * p, Y - 28 * p, 6 * p, 5 * p); R(c, k === (Math.floor(t) % 3) ? "#ef4444" : "#60a5fa", x0 + k * 7 * p + p, Y - 27 * p, 4 * p, 3 * p); } },
    front(c, X, Y, W, p, t, a) { const [x0, x1] = rightOf(X, W, a, p, SIDE); R(c, "#2a2f3a", x0 - 3 * p, Y - 17 * p, x1 - x0 + 3 * p, 2 * p); R(c, "#1a1e26", x0, Y - 15 * p, x1 - x0, 15 * p); for (let k = 0; k < 5; k++) R(c, blink(t, 2, k * 0.2) ? "#fbbf24" : "#4b5563", x0 + p + k * 3 * p, Y - 18 * p, 2 * p, p); },
  };
  return PROP;
}

// A wall TV showing EBTV: the picture, the bug, what is playing (when the room is big enough to read).
export function ebtvTv(c, x, y, u, t, wide = 26) {
  const w = wide * u, h = 15 * u;
  R(c, "#0a0a0a", x - u, y - u, w + 2 * u, h + 2 * u);
  const live = ebtvLive() !== false;
  const k = Math.floor(t * 0.7);
  R(c, live ? ["#1e3a5f", "#3f2a4a", "#2a3f2a", "#4a3a1a"][k % 4] : "#111", x, y, w, h);
  if (live) { R(c, "rgba(255,255,255,0.08)", x, y + ((t * 20) % h), w, u); R(c, "#f472b6", x + w - 5 * u, y + u, 4 * u, 2 * u); }
  const now = ebtvNow();
  if (u >= 2) {
    text(c, "EBTV", x + u, y + u, 3.2 * u, "#f9a8d4");
    const s = live ? (now?.title ? `NOW: ${now.title}` : "ELECTRIC BASEMENT TV") : "OFF AIR";
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const tw = s.length * 2 * u, off = (t * 8 * u) % (tw + w);
    text(c, s, x + w - off, y + h - 5 * u, 3 * u, "#fef3c7");
    c.restore();
  }
}

export function funnelRooms() {
  const DRAW = {
    arcade(c, x, y, w, h, u, { t }) {
      // carpet stars on the wall's lower band, neon strips, the high-score board
      for (let k = 0; k < Math.floor(w / (9 * u)); k++) R(c, ["#f472b6", "#22d3ee", "#fbbf24"][k % 3], x + 4 * u + k * 9 * u, y + h * 0.66 + (k % 2) * 2 * u, u, u);
      R(c, "#f472b6", x + 3 * u, y + 4 * u, w - 6 * u, u);
      const bw = Math.min(w * 0.26, 38 * u), bx = x + w - bw - 6 * u;
      R(c, "#050308", bx, y + 6 * u, bw, 12.5 * u);
      text(c, "HIGH SCORES", bx + 1.5 * u, y + 6.6 * u, 2.2 * u, "#fbbf24");
      const d = today();
      PLAYABLE.slice(0, 3).forEach((g, i) => { const hs = highScore(g.slug, "arcade", d); text(c, `${hs.initials} ${hs.score}`, bx + 1.5 * u, y + 9.4 * u + i * 2.8 * u, 2 * u, blink(t, 0.8, i * 0.3) ? "#67e8f9" : "#22d3ee"); });
      text(c, "THE ARCADE", x + 4 * u, y + 6 * u, 2.6 * u, "#a78bfa");
    },
    recordshop(c, x, y, w, h, u) {
      // sleeves face-out along the top shelf, spines below
      R(c, "#3a2414", x + 4 * u, y + h * 0.28, w - 8 * u, 2 * u);
      const cols = ["#dc2626", "#1d4ed8", "#eab308", "#15803d", "#9333ea", "#f97316", "#111827", "#e5e7eb"];
      for (let k = 0, sx = x + 6 * u; sx < x + w * 0.72; k++, sx += 6 * u) R(c, cols[(k * 5) % 8], sx, y + h * 0.28 - 5 * u, 5 * u, 5 * u);
      // spines on the lower shelf
      R(c, "#3a2414", x + 4 * u, y + h * 0.44, w - 8 * u, u);
      for (let k = 0, sx = x + 6 * u; sx < x + w - 6 * u; k++, sx += 1.6 * u) R(c, cols[(k * 3 + (k >> 2)) % 8], sx, y + h * 0.44 - 4 * u - (k % 3 === 0 ? u : 0), u, 4 * u + (k % 3 === 0 ? u : 0));
      text(c, "EB SHOP", x + w - 4 * u, y + 3 * u, 2.8 * u, "#f472b6", "right");
      text(c, "SHOP.ELECTRICBASEMENT.TV", x + w - 4 * u, y + 6.6 * u, 1.8 * u, "#67e8f9", "right");
    },
    union(c, x, y, w, h, u) {
      R(c, "#2a2432", x + w * 0.4, y + 6 * u, 18 * u, 12 * u);   // the notice board
      for (let k = 0; k < 4; k++) R(c, ["#fef3c7", "#bae6fd", "#fecaca", "#d9f99d"][k], x + w * 0.4 + 2 * u + (k % 2) * 8 * u, y + 7 * u + Math.floor(k / 2) * 5 * u, 6 * u, 4 * u);
      text(c, "THE UNION", x + 4 * u, y + 3 * u, 2.4 * u, "#fbbf24");
    },
    ebtv(c, x, y, w, h, u, { t }) {
      // the teal set wall, the EBSN logo, the monitor wall with the channel on it
      R(c, "#1f6f73", x + w * 0.05, y + 3 * u, w * 0.5, h * 0.6);
      text(c, "EBSN", x + w * 0.07, y + 5 * u, 5 * u, "#fef3c7");
      text(c, "AFTER DARK", x + w * 0.07, y + 11 * u, 2.6 * u, "#f9a8d4");
      ebtvTv(c, x + w * 0.66, y + 5 * u, u, t, 22);
      const live = ebtvLive();
      const on = live == null ? true : live;
      R(c, on ? "#b91c1c" : "#3a1414", x + w * 0.66, y + 22 * u, 14 * u, 5 * u);
      text(c, "ON AIR", x + w * 0.66 + 7 * u, y + 22.6 * u, 3.4 * u, on ? "#fee2e2" : "#6a3a3a", "center");
    },
  };
  const LIVE = {
    arcade(c, x, y, w, h, u, { t }) { R(c, `rgba(167,139,250,${(0.05 + 0.04 * Math.sin(t * 2)).toFixed(3)})`, x, y, w, h); },
    union(c, x, y, w, h, u, { t }) { ebtvTv(c, x + w * 0.72, y + 5 * u, u, t, 20); },
  };
  return { DRAW, LIVE };
}
// The TV in the bars and the diner: wrapped round their own ambient life.
export function withTv(LIVE) {
  for (const [type, at] of [["bar", 0.06], ["diner", 0.7]]) {
    const own = LIVE[type];
    LIVE[type] = (c, x, y, w, h, u, o) => { own?.(c, x, y, w, h, u, o); if (w > 60 * u) ebtvTv(c, x + w * at, y + 4 * u, u, o.t || 0, 20); };
  }
}

// What a tap in a funnel room opens: each cabinet its game; the rest of the shop floor the
// shop, the stage EBTV, the arcade floor the cabinet list. -> [{spec, box: [x0, y0, x1, y1]}]
// in room px, the room itself first (so a cabinet, then a person, drawn later, win the tap).
const ROOM_SPEC = { "eb-shop": { kind: "shop", campaign: "eb-shop" }, "studio-row": { kind: "ebtv", campaign: "ebtv-station" }, arcade: { kind: "arcade" } };
export function funnelRoomHits(pid, plan, side = 0.3) {
  const out = [];
  if (ROOM_SPEC[pid]) out.push({ spec: ROOM_SPEC[pid], box: [0, 0, plan.w, plan.h] });
  for (const row of plan.rows) {
    const p = (plan.sw * row.s) / 32;
    for (const it of row.items) {
      const slug = cabinetGame(it.prop);
      if (!slug) continue;
      out.push({ spec: { kind: "game", slug, campaign: CAMPAIGN_OF_PLACE[pid] || "city", place: pid, ...(pid === "arcade" ? { back: { kind: "arcade" } } : {}) }, box: cabinetBox(it, row.y, p, side) });
    }
  }
  return out;
}
