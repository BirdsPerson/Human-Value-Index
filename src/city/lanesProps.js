// THE LANES' room (the top floor of THE ARCADE on the Strip; src/city/lanes.js): props.js's rules, a
// plan per room type, one person per anchor. Merged in by props.js like the funnel rooms.
//   the back wall   the lanes themselves, running away into the wall in perspective: the boards, the
//                   gutters, ten pins at the far end under each masking unit with its lane number, the
//                   pinsetter's sweep coming down after a ball; balls rolling now and then (more on a
//                   league night); THE LANES in neon. After dark (19:00-06:30) and the late hours the
//                   house goes COSMIC: the blacklight, the boards glow.
//   the back row    a bowler at each ball return, mid-approach (the "bowl" act, poses.js)
//   the front row   the shoe rental counter and the snack bar (staff), benches to watch from, the ball
//                   racks, and the cabinets: LANES_CABINETS (slugs from src/city/arcade.json; another
//                   game's cabinet is one more slug in that list)
// A tap anywhere in the room opens #bowling (funnelProps.js ROOM_SPEC).
import { GAME } from "./funnels.js";

export const LANES_ROOM_TYPE = { "the-lanes": "lanes" };
export const LANES_LOOK = { lanes: ["#141018", "#3a2a1a"] };
export const LANES_ACTS = ["bowl"];
// Cabinet slots: the arcade's own games, a couple by the snack bar. Add a slug to add a cabinet.
export const LANES_CABINETS = ["house-hunt", "jetsam", "anamnesis"];
const LEAGUE_NIGHTS = new Set([2, 4]);   // Tuesday and Thursday (sim weekday 1 = Monday), from 19:00
export const leagueNight = (weekday, hour) => LEAGUE_NIGHTS.has(weekday) && hour >= 19 && hour < 23.5;
export const cosmicAt = (hour) => hour >= 21 || hour < 3;

function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function text(c, s, x, y, px, col, align = "left", glow = null) {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col;
  if (glow) { c.shadowColor = glow; c.shadowBlur = px * 0.8; }
  c.fillText(s, Math.round(x), Math.round(y));
  c.shadowBlur = 0;
}
const frac = (v) => v - Math.floor(v);

// ---- plans ----------------------------------------------------------------------------------
export function lanesPlans(PLANS, { A, M, P, SIDE }) {
  const cab = (slug) => (GAME[slug] ? (GAME[slug].status === "dev" ? P(`cab:${slug}`, 0.9) : M(A("stand", "arcade", "patron", 1), `cab:${slug}`, 1.6, SIDE)) : null);
  const cabs = LANES_CABINETS.map(cab).filter(Boolean);
  const shoes = M(A("counter", "serve", "staff", 1), "shoeCounter", 2.4, SIDE);
  const snacks = M(A("counter", "serve", "staff", 1), "snackBar", 2.4, SIDE);
  const bench = M(A("seat", "watch", "patron", -1), "bowlBench", 1.15);
  const rack = P("ballRack", 0.7);
  const bowler = M(A("stand", "bowl", "patron", -1), "ballReturn", 1.5, 0.45);
  PLANS.lanes = {
    back: { unit: [bowler] },
    front: { head: [shoes, snacks, ...cabs], unit: [bench, rack, bench] },
    solo: { head: [shoes, ...cabs.slice(0, 1)], unit: [bowler, bench] },
  };
}

// ---- the furniture --------------------------------------------------------------------------
export function lanesPropDrawers({ SIDE }) {
  const rightOf = (X, W, a, p) => { const px = a ? a.x : X + W * SIDE; return [px + 7 * p, X + W - p]; };
  const PROP = {};
  PROP.shoeCounter = {
    back(c, X, Y, W, p, t, a) {
      const [x0, x1] = rightOf(X, W, a, p);
      // the cubbies of shoes behind the counter, sized and sprayed
      for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
        const bx = x0 + k * (x1 - x0) / 5, by = Y - 44 * p + r * 6 * p;
        R(c, "#2a1c12", bx, by, (x1 - x0) / 5 - p, 5 * p);
        if ((r * 5 + k) % 4 !== 1) { R(c, ["#b91c1c", "#1d4ed8", "#e5e5e5"][(r + k) % 3], bx + p, by + 2 * p, 3 * p, 2 * p); R(c, "#e5e5e5", bx + 4 * p, by + 2 * p, 2 * p, 2 * p); }
      }
      if (p >= 1.3) text(c, "SHOES", (x0 + x1) / 2, Y - 51 * p, 4.5 * p, "#fbbf24", "center");
    },
    front(c, X, Y, W, p, t, a) {
      const [x0, x1] = rightOf(X, W, a, p);
      R(c, "#5a2a1a", x0 - 3 * p, Y - 18 * p, x1 - x0 + 3 * p, 18 * p);
      R(c, "#c2410c", x0 - 3 * p, Y - 19 * p, x1 - x0 + 3 * p, 2 * p);
      R(c, "#b91c1c", x0 + p, Y - 22 * p, 6 * p, 3 * p); R(c, "#1d4ed8", x0 + 8 * p, Y - 22 * p, 6 * p, 3 * p);   // a pair on the counter, being sprayed
      if (p >= 1.4) text(c, "SIZE?", x0 + (x1 - x0) / 2, Y - 13 * p, 3.5 * p, "#fde68a", "center");
    },
  };
  PROP.snackBar = {
    back(c, X, Y, W, p, t, a, hour) {
      const [x0, x1] = rightOf(X, W, a, p);
      R(c, "#111", x0, Y - 46 * p, x1 - x0, 12 * p);   // the menu board
      if (p >= 1.3) { text(c, "NACHOS / PIZZA / PITCHERS", (x0 + x1) / 2, Y - 44 * p, 2.6 * p, "#fde68a", "center"); text(c, "ALL PURCHASES LOGGED", (x0 + x1) / 2, Y - 39 * p, 2.2 * p, "#f472b6", "center"); }
      R(c, "#7c2d12", x1 - 9 * p, Y - 30 * p, 7 * p, 10 * p);   // the hot box, glowing
      R(c, "#fb923c", x1 - 8 * p, Y - 29 * p, 5 * p, 4 * p);
    },
    front(c, X, Y, W, p, t, a) {
      const [x0, x1] = rightOf(X, W, a, p);
      R(c, "#1f2937", x0 - 3 * p, Y - 18 * p, x1 - x0 + 3 * p, 18 * p);
      R(c, "#f472b6", x0 - 3 * p, Y - 19 * p, x1 - x0 + 3 * p, p);
      R(c, "#fbbf24", x0 + 2 * p, Y - 22 * p, 5 * p, 3 * p); R(c, "#ef4444", x0 + 9 * p, Y - 23 * p, 3 * p, 4 * p);   // nachos, a cup
    },
  };
  PROP.bowlBench = {
    front(c, X, Y, W, p) {
      const x = X + W / 2, bw = Math.min(W - 2 * p, 24 * p);
      R(c, "#1e3a8a", x - bw / 2, Y - 12 * p, bw, 3 * p);
      R(c, "#1e40af", x - bw / 2, Y - 20 * p, bw, 8 * p);
      R(c, "#111827", x - bw / 2 + p, Y - 9 * p, 2 * p, 9 * p); R(c, "#111827", x + bw / 2 - 3 * p, Y - 9 * p, 2 * p, 9 * p);
    },
  };
  PROP.ballRack = {
    front(c, X, Y, W, p) {
      const x = X + W / 2;
      R(c, "#3f3f46", x - 6 * p, Y - 22 * p, 12 * p, 22 * p);
      const cols = ["#2b5fbf", "#b8322a", "#2f8f4e", "#6b3fa0", "#e5e5e5", "#f59e0b"];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) { c.fillStyle = cols[(r * 2 + k) % 6]; c.beginPath(); c.arc(x - 2.5 * p + k * 5 * p, Y - 18 * p + r * 6.5 * p, 2.4 * p, 0, Math.PI * 2); c.fill(); }
    },
  };
  PROP.ballReturn = {
    front(c, X, Y, W, p, t, a) {
      const x = (a ? a.x : X + W * 0.45) + 9 * p;
      R(c, "#27272a", x - 5 * p, Y - 9 * p, 10 * p, 9 * p);
      R(c, "#52525b", x - 6 * p, Y - 10 * p, 12 * p, 2 * p);
      c.fillStyle = "#b8322a"; c.beginPath(); c.arc(x - 2 * p, Y - 12 * p, 2.4 * p, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#2b5fbf"; c.beginPath(); c.arc(x + 2.5 * p, Y - 12 * p, 2.4 * p, 0, Math.PI * 2); c.fill();
    },
  };
  return PROP;
}

// ---- the back wall: the lanes, in perspective, into the wall ------------------------------------
function lanesWall(c, x, y, w, h, u, { t = 0, hour = 12 }) {
  const cosmic = cosmicAt(hour), night = hour >= 19 || hour < 6.5;
  const n = Math.max(2, Math.min(8, Math.floor(w / (30 * u))));
  const hz = y + h * 0.3, fl = y + h * 0.66;   // the far end (the pins), the near end (the foul line)
  // the wall over the pins: the masking units' fascia
  R(c, cosmic ? "#07021a" : "#1b2440", x, y, w, hz - y);
  const lw = w / n;
  for (let i = 0; i < n; i++) {
    const nx0 = x + i * lw + lw * 0.1, nx1 = x + (i + 1) * lw - lw * 0.1;   // the near end
    const cx = (nx0 + nx1) / 2, fw = (nx1 - nx0) * 0.36;                        // the far end, narrower
    const fx0 = cx - fw / 2, fx1 = cx + fw / 2;
    // the gutters, then the boards
    c.fillStyle = cosmic ? "#0a0418" : "#26262b";
    c.beginPath(); c.moveTo(x + i * lw, fl); c.lineTo(x + (i + 1) * lw, fl); c.lineTo(fx1 + fw * 0.25, hz); c.lineTo(fx0 - fw * 0.25, hz); c.closePath(); c.fill();
    const g = c.createLinearGradient(0, hz, 0, fl);
    g.addColorStop(0, cosmic ? "#1a0b3a" : "#b8925c"); g.addColorStop(1, cosmic ? "#120828" : "#dcb57e");
    c.fillStyle = g; c.beginPath(); c.moveTo(nx0, fl); c.lineTo(nx1, fl); c.lineTo(fx1, hz); c.lineTo(fx0, hz); c.closePath(); c.fill();
    // boards (and, cosmic, the glowing ones)
    c.strokeStyle = cosmic ? "rgba(48,240,255,0.35)" : "rgba(90,60,30,0.25)"; c.lineWidth = 1;
    for (let k = 1; k < 6; k++) { const f = k / 6; c.beginPath(); c.moveTo(nx0 + (nx1 - nx0) * f, fl); c.lineTo(fx0 + fw * f, hz); c.stroke(); }
    // the arrows
    for (let k = 1; k < 6; k++) { const f = k / 6, yy = fl - (fl - hz) * 0.28, xx = nx0 + (nx1 - nx0) * f + (fx0 + fw * f - nx0 - (nx1 - nx0) * f) * 0.28; R(c, cosmic ? "#39ff6a" : "#4a2e12", xx - u * 0.5, yy, u, u); }
    // the masking unit over the pin deck, its lane number; the pins under it (struck now and then)
    const cyc = 9 + (i % 3) * 2.3, ph = frac((t + i * 3.1) / cyc);
    const down = ph > 0.42 && ph < 0.74;   // after the ball, before the sweep resets them
    const pinH = Math.max(2.4 * u, fw * 0.3), pinW = Math.max(u * 0.9, pinH * 0.32);
    R(c, cosmic ? "#140632" : "#24345e", cx - lw * 0.45, y + h * 0.04, lw * 0.9, Math.max(2 * u, hz - y - h * 0.04 - pinH * 1.6));
    text(c, String(i + 1), cx, y + h * 0.06, 4 * u, cosmic ? "#ff4fe0" : "#fde68a", "center", cosmic ? "#ff4fe0" : null);
    if (ph > 0.6 && ph < 0.74) R(c, "#3f3f46", fx0 - fw * 0.2, hz - pinH * 1.5, fw * 1.4, u);
    const pinCol = cosmic ? "#e8fbff" : "#f5f5f0";
    for (let r = 3; r >= 0; r--) for (let k = 0; k <= r; k++) {
      if (down && ((k + r + i) % 3 !== 0 || ph > 0.62)) continue;
      const px = cx + (k - r / 2) * fw * 0.26, py = hz - (3 - r) * pinH * 0.12;
      R(c, pinCol, px - pinW / 2, py - pinH, pinW, pinH);
      R(c, "#c8202a", px - pinW / 2, py - pinH * 0.72, pinW, Math.max(1, pinH * 0.1));
    }
    // a ball on its way down (the lane's own rhythm)
    if (ph < 0.42) {
      const f = ph / 0.42, bx = cx + (nx1 - nx0) * 0.12 * (1 - f) * (1 - f) - (nx1 - nx0) * 0.05 * f, by = fl - (fl - hz) * f;
      const br = (2.2 - 1.5 * f) * u;
      c.fillStyle = cosmic ? ["#39ff6a", "#ff2fd0", "#30f0ff", "#ffe14a"][i % 4] : ["#2b5fbf", "#b8322a", "#2f8f4e", "#6b3fa0"][i % 4];
      c.beginPath(); c.arc(bx, by - br, br, 0, Math.PI * 2); c.fill();
    }
  }
  // the foul line and the approach
  R(c, cosmic ? "#ff3355" : "#b91c1c", x, fl, w, Math.max(1, u * 0.5));
  R(c, cosmic ? "#0d0620" : "#d9b98a", x, fl + u * 0.5, w, h * 0.04);
  // the sign: neon at night
  const sx = x + w / 2;
  if (night || cosmic) { R(c, "rgba(255,47,208,0.08)", x, y, w, hz - y); }
  text(c, "THE LANES", x + 3 * u, y + h * 0.18, 3 * u, night ? "#ff4fe0" : "#fbbf24", "left", night ? "#ff4fe0" : null);
  if (cosmic) text(c, "COSMIC BOWLING", x + w - 3 * u, y + h * 0.18, 2.6 * u, "#30f0ff", "right", "#30f0ff");
  void sx;
}

export function lanesRooms() {
  const DRAW = { lanes: lanesWall };
  const LIVE = {
    lanes(c, x, y, w, h, u, { t = 0, hour = 12 }) {
      // cosmic: the disco spots crawling over the floor
      if (!cosmicAt(hour)) return;
      for (let k = 0; k < 6; k++) {
        const sx = x + frac(t * 0.05 + k * 0.17) * w, sy = y + h * (0.7 + 0.25 * frac(k * 0.37 + t * 0.03));
        c.fillStyle = ["rgba(255,47,208,0.25)", "rgba(48,240,255,0.22)", "rgba(255,225,74,0.2)"][k % 3];
        c.beginPath(); c.arc(sx, sy, 3 * u, 0, Math.PI * 2); c.fill();
      }
    },
  };
  return { DRAW, LIVE };
}
