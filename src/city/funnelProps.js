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
import { GAMES, GAME, PLAYABLE, OWN_GAMES, NEIGHBOURS, cabColors, highScore, ebtvNow, ebtvLive, CAMPAIGN_OF_PLACE, campaignFor } from "./funnels.js";
import { ebtvFrame, drawFrame, tvBox } from "./ebtvFrame.js";
import { machineClock } from "./sim.js";
import { shopState, wallOpen, loadShop, shopSlots, thumb, shopFocus } from "./shopStock.js";
import { HOSTS as CAST, shiftAt, chatterAt, pitching } from "./hostsLive.js";

export const FUNNEL_ROOM_TYPE = { "customs-house": "customs", arcade: "arcade", "eb-shop": "recordshop", "campus-lounge": "union", "studio-row": "ebtv", boardwalk: "boardwalk" };
export const FUNNEL_LOOK = { boardwalk: ["#241c10", "#5a4630"], arcade: ["#140c20", "#2a1a3a"], recordshop: ["#241a16", "#3e2c22"], union: ["#1c1a22", "#34303c"], ebtv: ["#12282a", "#2a2a30"] };
export const FUNNEL_ACTS = ["arcade", "browse"];
export const HOSTS = ["carol", "dale", "asuka", "hector", "joan", "vern"];
export const isCabinet = (prop) => typeof prop === "string" && prop.startsWith("cab:");
export const cabinetGame = (prop) => (isCabinet(prop) ? prop.slice(4) : null);

// ---- plans ----------------------------------------------------------------------------
export function funnelPlans(PLANS, { A, M, P, SIDE }) {
  const cab = (slug) => (GAME[slug]?.status === "dev" ? P(`cab:${slug}`, 0.9) : M(A("stand", "arcade", "patron", 1), `cab:${slug}`, 1.6, SIDE));
  const floor = OWN_GAMES.map(g => cab(g.slug));   // playable first, then the dark ones (sync-arcade.mjs order)
  const guests = NEIGHBOURS.map(g => cab(g.slug));   // the neighbours' cabinets: first thing in the front row
  PLANS.arcade = {
    back: { unit: floor },
    front: { head: [...guests, M(A("counter", "serve", "staff", 1), "prizeCounter", 2.3, SIDE)], unit: floor },
    solo: { head: [...guests, M(A("counter", "serve", "staff", 1), "prizeCounter", 2.3, SIDE)], unit: floor },
  };
  // THE PORT's Customs House: the first gateway, a neighbour's cabinet among the desks
  if (PLANS.office && GAME["internet-city"]) {
    PLANS.customs = JSON.parse(JSON.stringify(PLANS.office));
    PLANS.customs.front.head = [cab("internet-city"), ...(PLANS.customs.front.head || [])];
  }
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
      const hs = g.neighbour ? null : highScore(slug, g.slug, today());
      if (p >= 1.4) text(c, dark ? "OUT OF ORDER" : hs ? `${hs.initials} ${hs.score}` : g.title, bx0 + w / 2, top + 1.2 * p, 3.4 * p, dark ? "#9ca3af" : "#0b0b0f", "center");
      // the screen
      const sx = bx0 + 2 * p, sy = top + 9 * p, sw = w - 4 * p, sh = 12 * p;
      R(c, "#050608", sx, sy, sw, sh);
      if (dark) {
        R(c, "#e8d36a", sx + sw * 0.15, sy + sh * 0.3, sw * 0.7, sh * 0.4);   // the taped sign
        R(c, "#6b5a1a", sx + sw * 0.25, sy + sh * 0.45, sw * 0.5, p);
      } else if (g.neighbour) {
        // the attract screen, ours: a little isometric skyline, its windows coming on
        neighbourScreen(c, sx, sy, sw, sh, p, t, c1, c2);
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

// INTERNET CITY's attract mode, drawn here (none of its own art): a row of isometric blocks on
// a night sky, windows lighting one by one.
export function neighbourScreen(c, sx, sy, sw, sh, p, t, c1, c2) {
  R(c, "#0a1530", sx, sy, sw, sh);
  const n = 5, bw = sw / n;
  for (let i = 0; i < n; i++) {
    const hgt = sh * (0.35 + ((hk("ic" + i) % 50) / 100)), x = sx + i * bw, y = sy + sh - hgt;
    R(c, i % 2 ? "#1e3a5f" : "#24476e", x, y, bw * 0.62, hgt);            // the lit face
    R(c, "#14284a", x + bw * 0.62, y + p * 0.6, bw * 0.38, hgt - p * 0.6);   // the side in shadow
    R(c, i % 2 ? c1 : c2, x, y - p * 0.6, bw * 0.62, p * 0.6);               // the roofline
    for (let k = 0; k < 3; k++) if (((Math.floor(t * 1.4) + i * 3 + k) % 5) < 3) R(c, "#fde68a", x + bw * 0.15 + (k % 2) * bw * 0.25, y + p + k * 2.2 * p, p * 0.8, p * 0.8);
  }
}

// THE CUSTOMS HOUSE's sign over the gateway cabinet: the Port's door to other cities.
export function customsSign(c, x, y, w, h, u) {
  R(c, "#0a1530", x + 4 * u, y + 4 * u, Math.min(w * 0.5, 64 * u), 6 * u);
  text(c, "GATEWAY // ARRIVALS FROM OTHER CITIES", x + 6 * u, y + 5.4 * u, 2.6 * u, "#bae6fd");
}


// ---- the hosts, live (hostsLive.js has who, when and what they say) -------------------------
// Each host: their face from hosts.png on a small pixel body in their own clothes, standing,
// walking or talking. Drawn by the room's LIVE layer, so the counter and the bins stand in
// front of them. Room-relative spots (hostSpots) are shared with the taps.
const HOST_ROOM = { "eb-shop": "shop", "campus-lounge": "lounge" };
const LAST_T = new Map();   // the time each room was last drawn at (the taps use the same)
const hostDay = () => { try { return machineClock().day; } catch { return 1; } };
const hourNow = () => { try { const m = machineClock().mt; return ((m % 24) + 24) % 24; } catch { return 12; } };

// -> [{host, role, x, y (feet), p, dir, walk, off}] for the hosts in this room now.
export function hostSpots(pid, plan, t = LAST_T.get(pid) ?? 0, hour = hourNow(), day = hostDay()) {
  const kind = HOST_ROOM[pid];
  if (!kind || !plan?.rows?.length) return [];
  const sh = shiftAt("eb-shop", day, hour);
  const front = plan.rows[plan.rows.length - 1], pf = (plan.sw * front.s) / 32 * 1.1;
  if (kind === "lounge") {
    return sh.off.map((host, i) => ({ host, role: "off", off: true, x: plan.w * (0.95 - 0.1 * i) - 8 * pf, y: front.y - pf, p: pf, dir: i ? 1 : -1, walk: false }));
  }
  let counter = null, crow = front;
  for (const r of plan.rows) for (const it of r.items) if (it.prop === "shopCounter") { counter = it; crow = r; }
  const pc = (plan.sw * crow.s) / 32 * 1.1;
  const out = [];
  if (counter) {
    const W = counter.x1 - counter.x0;
    // the register at the till end, the presenter at the other end beside the turntable stand
    out.push({ host: sh.register, role: "register", x: counter.x0 + W * 0.94, y: crow.y - 3 * pc, p: pc, dir: -1, walk: false });
    out.push({ host: sh.turntable, role: "turntable", x: counter.x0 + W * 0.16, y: crow.y - pc, p: pc, dir: 1, walk: false });
  } else {
    out.push({ host: sh.register, role: "register", x: plan.w * 0.2, y: crow.y, p: pc, dir: 1, walk: false });
    out.push({ host: sh.turntable, role: "turntable", x: plan.w * 0.35, y: crow.y, p: pc, dir: 1, walk: false });
  }
  // the floor: up and down the front row's bins, restocking
  const xs = front.items.map(i => i.x0).concat(front.items.map(i => i.x1));
  const a = Math.min(...xs) + 6 * pf, b = Math.max(...xs) - 6 * pf, span = Math.max(1, b - a);
  const speed = 9 * pf * (CAST[sh.floor]?.walk || 1), period = (2 * span) / speed;
  const ph = (((t / period) % 1) + 1) % 1, pause = 0.12;   // a stop at each end to straighten the stock
  const q = ph < 0.5 ? Math.min(1, ph / (0.5 - pause)) : Math.max(0, 1 - (ph - 0.5) / (0.5 - pause));
  const moving = t > 0 && ((ph < 0.5 - pause) || (ph >= 0.5 && ph < 1 - pause));
  out.push({ host: sh.floor, role: "floor", x: a + span * q, y: front.y + pf, p: pf, dir: ph < 0.5 ? 1 : -1, walk: moving });
  return out;
}
const HOST_W = 12, HOST_H = 44;   // sprite px: the body's box, feet at the bottom
export function hostBox(sp) { const w = HOST_W * sp.p, h = HOST_H * sp.p * ((CAST[sp.host]?.h || 30) / 30); return [sp.x - w / 2, sp.y - h, sp.x + w / 2, sp.y]; }

function drawHost(c, sp, t, facing = false) {
  const H = CAST[sp.host]; if (!H) return;
  const p = sp.p, k = (H.h || 30) / 30, x = sp.x, y = sp.y;
  const step = sp.walk ? Math.floor(t * 6) % 4 : 0, sw = sp.walk ? [0, 1, 0, -1][step] : 0;
  const talk = facing ? Math.floor(t * 5) % 2 : 0;
  const legH = 16 * p * k, torH = 15 * p * k, headH = 11 * p * k, bw = (H.w || 12) * p;
  const yHip = y - legH, ySh = yHip - torH, yHead = ySh - headH;
  R(c, "rgba(0,0,0,0.3)", x - bw * 0.6, y - p, bw * 1.2, 2 * p);   // the shadow
  // legs (or a skirt), shoes
  if (H.dress) { R(c, H.bottom, x - bw * 0.48, yHip - p, bw * 0.96, legH * 0.62); R(c, H.skin, x - bw * 0.3 + sw * p, yHip + legH * 0.6, 2.4 * p, legH * 0.4 - p); R(c, H.skin, x + bw * 0.1 - sw * p, yHip + legH * 0.6, 2.4 * p, legH * 0.4 - p); }
  else { R(c, H.bottom, x - bw * 0.36 + sw * p, yHip, bw * 0.32, legH - p); R(c, H.bottom, x + bw * 0.04 - sw * p, yHip, bw * 0.32, legH - p); }
  R(c, "#141414", x - bw * 0.4 + sw * p, y - 1.6 * p, bw * 0.36, 1.6 * p); R(c, "#141414", x + bw * 0.04 - sw * p, y - 1.6 * p, bw * 0.36, 1.6 * p);
  // the torso, the accent (collar, tie, bow), the arms
  R(c, H.top, x - bw / 2, ySh, bw, torH);
  R(c, H.accent, x - 1.2 * p, ySh, 2.4 * p, sp.host === "dale" || sp.host === "hector" ? torH * 0.7 : 2.4 * p);
  const arm = sp.walk ? -sw : 0, lift = talk ? 3 * p : 0;
  R(c, H.top, x - bw / 2 - 2.2 * p, ySh + p + arm * p, 2.2 * p, torH * 0.8);
  R(c, H.top, x + bw / 2, ySh + p - lift - arm * p, 2.2 * p, torH * 0.8);
  R(c, H.skin, x - bw / 2 - 2.2 * p, ySh + p + torH * 0.8 + arm * p, 2.2 * p, 2 * p);
  R(c, H.skin, x + bw / 2, ySh + p + torH * 0.8 - lift - arm * p, 2.2 * p, 2 * p);
  // the head: their own face (hosts.png), else hair and skin
  const hw = 10 * p * k, img = sheet(), idx = Math.max(0, HOSTS.indexOf(sp.host));
  if (img && img.complete && img.naturalWidth) {
    c.imageSmoothingEnabled = false;
    const flip = !facing && sp.dir < 0;
    if (flip) { c.save(); c.translate(Math.round(x), 0); c.scale(-1, 1); c.drawImage(img, idx * 40 + 10, 1, 20, 22, Math.round(-hw / 2), Math.round(yHead), Math.round(hw), Math.round(headH + p)); c.restore(); }
    else c.drawImage(img, idx * 40 + 10, 1, 20, 22, Math.round(x - hw / 2), Math.round(yHead), Math.round(hw), Math.round(headH + p));
  } else { R(c, H.hair, x - hw / 2, yHead, hw, headH * 0.5); R(c, H.skin, x - hw * 0.35, yHead + headH * 0.3, hw * 0.7, headH * 0.7); }
}

// One bubble per room: a host who turned to you, else the chatter's line of the moment.
function bubble(c, x, yTop, line, px, alpha, room) {
  if (!line || alpha <= 0.02) return;
  c.save();
  c.globalAlpha = alpha;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  const maxW = Math.max(80, Math.min(room.w * 0.5, 34 * px));
  const words = line.split(" "), lines = [];
  let cur = "";
  for (const w of words) { const t2 = cur ? cur + " " + w : w; if (c.measureText(t2).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t2; }
  if (cur) lines.push(cur);
  const lw = Math.max(...lines.map(l => c.measureText(l).width)) + px, lh = px * 1.25, bh = lines.length * lh + px * 0.6;
  let bx = Math.round(x - lw / 2), by = Math.round(yTop - bh - px * 0.8);
  bx = Math.max(room.x + 2, Math.min(room.x + room.w - lw - 2, bx)); by = Math.max(room.y + 2, by);
  c.fillStyle = "#fef3c7"; c.fillRect(bx, by, Math.round(lw), Math.round(bh));
  c.fillStyle = "#1a1206"; c.fillRect(bx, by + Math.round(bh), Math.round(lw), 1);
  const tx = Math.max(bx + 3, Math.min(bx + lw - 5, x)); c.fillStyle = "#fef3c7"; c.fillRect(Math.round(tx), by + Math.round(bh), Math.max(2, Math.round(px * 0.4)), Math.round(px * 0.5));
  c.fillStyle = "#1a1206"; c.textAlign = "left"; c.textBaseline = "top";
  lines.forEach((l, i) => c.fillText(l, bx + px * 0.5, by + px * 0.35 + i * lh));
  c.restore();
}

export function drawHosts(pid, c, x, y, w, h, u, o) {
  const plan = o.plan; if (!plan) return;
  const t = o.t || 0;
  LAST_T.set(pid, t);
  const spots = hostSpots(pid, plan, t, o.hour ?? hourNow());
  const P = pitching(), now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
  const pitchHere = P && now - P.at < 5.5 && spots.find(s => s.host === P.host) ? P : null;
  for (const sp of spots) drawHost(c, { ...sp, x: x + sp.x, y: y + sp.y }, t || now, pitchHere?.host === sp.host);
  // the bubble: the pitch, or the room's chatter (only the hosts at work talk to each other)
  const px = Math.max(7, Math.min(13, 2.6 * u));
  let who = null, line = null, alpha = 1;
  if (pitchHere) { who = pitchHere.host; line = pitchHere.line; alpha = o.t ? Math.min(1, (5.5 - (now - P.at)) / 0.6) : 1; }
  else if (HOST_ROOM[pid] === "shop") {
    const ch = chatterAt("eb-shop", spots.map(s => s.host), o.t ? o.t : Math.floor(now / 12) * 12);
    if (ch) { who = ch.host; line = ch.line; alpha = o.t ? ch.fade : 1; }
  }
  const sp = who && spots.find(s => s.host === who);
  if (sp) { const b = hostBox(sp); bubble(c, x + sp.x, y + b[1], line, px, alpha, { x, y, w, h }); }
}

// A cardboard host on an easel: the photo keyed out of its set, a white board edge, the name.
// (No longer stood in the shop or on the EBSN set: the hosts are there in person. Kept for the
// plans' standee slots, which now draw nothing: the plans and the sim stay as they were.)
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

// The shop's featured item: the first with a turntable video (the shop's own way of showing it).
export function featured(st = shopState()) { return wallOpen(st) ? st.items.find(i => i.video) || st.items[0] : null; }
// The turntable display behind the till, in room px: [x0, y0, x1, y1].
export function turntableBox(X, Y, W, p) { const s = Math.round(13 * p), x0 = X + W * 0.42; return [x0, Y - 36 * p, x0 + s, Y - 36 * p + s]; }

export function funnelPropDrawers({ SIDE }) {
  const PROP = {};
  for (const g of GAMES) PROP[`cab:${g.slug}`] = cabinet(g.slug, SIDE);
  for (const h of HOSTS) PROP[`standee:${h}`] = {};   // the hosts work the floor in person now (drawHosts)
  void standee;
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
      // the wall behind the till: the shop's own turntable, the featured item on it, turning
      const [x0, y0, x1, y1] = turntableBox(X, Y, W, p), s = x1 - x0;
      R(c, "#111", x0 - p, y0 - p, s + 2 * p, s + 2 * p);
      R(c, "#3a1414", x0, y1 - 2 * p, s, 2 * p);   // the platter
      const it = featured(), tc = it && thumb(it, Math.max(4, Math.round(s / p)));
      const k = Math.max(0.12, Math.abs(Math.cos(t * 1.2))), fw = s * k;
      if (tc) { c.imageSmoothingEnabled = false; c.drawImage(tc, Math.round(x0 + (s - fw) / 2), Math.round(y0), Math.max(1, Math.round(fw)), Math.round(s - 2 * p)); }
      else R(c, "#dc2626", x0 + (s - fw) / 2, y0, fw, s - 2 * p);
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
      const x0 = (a ? a.x : X + W * 0.2) + 18 * p;
      drawHost(c, { host: "dale", x: x0, y: Y - 2 * p, p: p * 0.9, dir: 1, walk: false }, t, Math.floor(t / 3) % 2 === 0);
      drawHost(c, { host: "carol", x: x0 + 20 * p, y: Y - 2 * p, p: p * 0.9, dir: -1, walk: false }, t, Math.floor(t / 3) % 2 === 1);
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

// A wall TV showing EBTV: what is actually on (ebtvFrame.js, one pixelated frame, refreshed every
// 30 s), the bug, the title crawling; no fresh frame is the test card. A tap is the real channel.
const BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
export function ebtvTv(c, x, y, u, t, wide = 26) {
  const w = wide * u, h = 15 * u;
  R(c, "#0a0a0a", x - u, y - u, w + 2 * u, h + 2 * u);
  tvBox(x - u, y - u, x + w + u, y + h + u);
  const f = ebtvFrame();
  if (f) {
    drawFrame(c, f, x, y, w, h);
    R(c, "rgba(0,0,0,0.12)", x, y + ((t * 20) % h), w, u);   // the roll bar
    if (u >= 2) {
      text(c, "EBTV", x + u, y + u, 3.2 * u, "#f9a8d4");
      const title = f.title || ebtvNow()?.title, s = title ? `NOW: ${title}` : "ELECTRIC BASEMENT TV";
      R(c, "rgba(0,0,0,0.55)", x, y + h - 5.5 * u, w, 4.5 * u);
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      const tw = s.length * 2 * u, off = (t * 8 * u) % (tw + w);
      text(c, s, x + w - off, y + h - 5 * u, 3 * u, "#fef3c7");
      c.restore();
    }
    return;
  }
  // the test card: colour bars, the station's own admission
  const bw = w / BARS.length;
  BARS.forEach((col, i) => R(c, col, x + i * bw, y, bw + 0.5, h * 0.62));
  R(c, "#101010", x, y + h * 0.62, w, h * 0.38);
  if (u >= 2) {
    R(c, "#000", x + w * 0.03, y + h * 0.2, w * 0.94, 4.4 * u);
    text(c, "EBTV // OFF AIR", x + w / 2, y + h * 0.2 + 0.7 * u, 2.6 * u, "#fef3c7", "center");
    text(c, "SIGNAL NOT ON FILE", x + w / 2, y + h * 0.7, 2 * u, "#9ca3af", "center");
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
      // the racks: the live stock, framed, face-out on the back wall (shopStock.js); closed or
      // stale, a board across them. Drawing the room is what asks for the stock (one fetch).
      const st = shopState();
      if (st.state === "idle") loadShop();
      if (wallOpen(st)) {
        const f = shopFocus();
        for (const q of shopSlots(w, h, u, st.items.length)) {
          const it = st.items[q.i], sx = x + q.x, sy = y + q.y;
          R(c, f === it.handle ? "#fbbf24" : "#120c08", sx - u, sy - u, q.s + 2 * u, q.s + 2 * u);   // the frame
          const px = Math.max(4, Math.round(q.s / u));
          const tc = thumb(it, px);
          if (tc) { c.imageSmoothingEnabled = false; c.drawImage(tc, Math.round(sx), Math.round(sy), q.s, q.s); }
          else R(c, ["#dc2626", "#1d4ed8", "#eab308", "#15803d", "#9333ea", "#f97316"][hk(it.handle) % 6], sx, sy, q.s, q.s);
          R(c, "#fbbf24", sx + q.s - 3 * u, sy + q.s - u, 3 * u, 2 * u);   // the price sticker
        }
      } else {
        const sl = shopSlots(w, h, u, 12), last = sl[sl.length - 1];
        const bx = x + 6 * u, by = y + (sl[0]?.y ?? h * 0.1), bw = Math.max(40 * u, (last ? last.x + last.s : w * 0.5) - 6 * u), bh = Math.max(9 * u, (last ? last.y + last.s : h * 0.3) - (sl[0]?.y ?? 0));
        R(c, "#120c08", bx, by, bw, bh);
        if (st.state === "loading") R(c, "#2a1e14", bx + u, by + u, bw - 2 * u, bh - 2 * u);
        else {
          R(c, "#e8d36a", bx + bw * 0.08, by + bh * 0.3, bw * 0.84, bh * 0.4);   // the taped notice
          text(c, "CLOSED FOR INVENTORY", bx + bw / 2, by + bh * 0.5 - 1.6 * u, 3.2 * u, "#3a2a0a", "center");
        }
      }
      // spines on the lower shelf, where the racks leave room for it
      const cols = ["#dc2626", "#1d4ed8", "#eab308", "#15803d", "#9333ea", "#f97316", "#111827", "#e5e7eb"];
      const rb = shopSlots(w, h, u, wallOpen(st) ? st.items.length : 12).reduce((m, q) => Math.max(m, q.y + q.s + 2 * u), 0);
      if (rb + 6 * u <= h * 0.46) R(c, "#3a2414", x + 4 * u, y + h * 0.46, w - 8 * u, u);
      if (rb + 6 * u <= h * 0.46) for (let k = 0, sx = x + 6 * u; sx < x + w - 6 * u; k++, sx += 1.6 * u) R(c, cols[(k * 3 + (k >> 2)) % 8], sx, y + h * 0.46 - 4 * u - (k % 3 === 0 ? u : 0), u, 4 * u + (k % 3 === 0 ? u : 0));
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
    union(c, x, y, w, h, u, o) { ebtvTv(c, x + w * 0.72, y + 5 * u, u, o.t, 20); drawHosts("campus-lounge", c, x, y, w, h, u, o); },
    recordshop(c, x, y, w, h, u, o) { drawHosts("eb-shop", c, x, y, w, h, u, o); },
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
// u (the room's pixel, as drawRoom was given it): the shop's racks answer too, each its product.
export function funnelRoomHits(pid, plan, side = 0.3, u = null) {
  const out = [];
  if (ROOM_SPEC[pid]) out.push({ spec: ROOM_SPEC[pid], box: [0, 0, plan.w, plan.h] });
  const shop = pid === "eb-shop" && wallOpen() ? shopState().items : null;
  if (shop && u) for (const q of shopSlots(plan.w, plan.h, u, shop.length)) out.push({ spec: { kind: "shop", campaign: "eb-shop", item: shop[q.i].handle }, box: [q.x - u, q.y - u, q.x + q.s + u, q.y + q.s + 2 * u] });
  for (const row of plan.rows) {
    const p = (plan.sw * row.s) / 32;
    for (const it of row.items) {
      if (shop && it.prop === "shopCounter") { const f = featured(); if (f) { const b = turntableBox(it.x0, row.y, it.x1 - it.x0, p); out.push({ spec: { kind: "shop", campaign: "eb-shop", item: f.handle }, box: [b[0] - p, b[1] - p, b[2] + p, b[3] + p] }); } }
      const slug = cabinetGame(it.prop);
      if (!slug) continue;
      out.push({ spec: { kind: "game", slug, campaign: campaignFor(slug, CAMPAIGN_OF_PLACE[pid]), place: pid, ...(pid === "arcade" ? { back: { kind: "arcade" } } : {}) }, box: cabinetBox(it, row.y, p, side) });
    }
  }
  // the hosts, frontmost: a tap turns one to you (hostsLive.tapHost, via openFunnel)
  for (const sp of hostSpots(pid, plan)) { const b = hostBox(sp), pad = 2 * sp.p; out.push({ spec: { kind: "host", host: sp.host, role: sp.role, off: Boolean(sp.off), campaign: "eb-shop" }, box: [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad] }); }
  return out;
}
// What a tap at room-relative (x, y) opens: the frontmost hit (people are the caller's), or null.
export function funnelTapAt(pid, plan, x, y, u = null, side = 0.3) {
  const hits = funnelRoomHits(pid, plan, side, u);
  for (let i = hits.length - 1; i >= 0; i--) { const b = hits[i].box; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return hits[i].spec; }
  return null;
}
