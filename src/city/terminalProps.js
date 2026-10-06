// THE TERMINAL's room (src/city/terminal.js): props.js's rules, a plan per room type, one person per
// anchor. Merged in by props.js like the lanes. A tap anywhere in the room opens a public PC: DEPARTMENT
// MAIL (funnelProps.js ROOM_SPEC, #mail?at=terminal).
//   the back wall   THE TERMINAL in green phosphor over the old pizza counter's tiles, a wall clock, the
//                   house rules (LOG ON. LOG OFF. EVERY KEYSTROKE IS KEPT.), the price card
//   the back row    beige PCs in a row along the wall, a citizen typing at each
//   the front row   the coffee counter (staff) where the ovens stood, and more PCs
import { CAFE_ID } from "./terminal.js";

export const TERMINAL_ROOM_TYPE = { [CAFE_ID]: "terminal" };
export const TERMINAL_LOOK = { terminal: ["#1b1f1a", "#3a3a32"] };

function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function text(c, s, x, y, px, col, align = "left") {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col;
  c.fillText(s, Math.round(x), Math.round(y));
}

// ---- plans ----------------------------------------------------------------------------------
export function terminalPlans(PLANS, { A, M, P, SIDE }) {
  const pc = (face = 0) => M(A("seat", "type", "patron", face), "beigePc", 1.25);
  const coffee = M(A("counter", "serve", "staff", 1), "coffeeCounter", 2.4, SIDE);
  PLANS.terminal = {
    back: { unit: [pc(-1), P(null, 0.15)] },
    front: { head: [coffee], unit: [pc(-1)] },
    solo: { head: [coffee], unit: [pc(-1)] },
  };
}

// ---- the furniture --------------------------------------------------------------------------
// A beige PC on a little desk: the tower under it, the CRT on top, the keyboard, a chair.
function drawPc(c, X, Y, W, p, t, a) {
  const x = a ? a.x : X + W / 2;
  R(c, "#4a3a2a", x - 10 * p, Y - 13 * p, 20 * p, 1.5 * p);                       // desk top
  R(c, "#3a2c20", x - 9 * p, Y - 11.5 * p, 1.5 * p, 11.5 * p); R(c, "#3a2c20", x + 7.5 * p, Y - 11.5 * p, 1.5 * p, 11.5 * p);
  R(c, "#d8d0b4", x + 2 * p, Y - 11 * p, 5 * p, 11 * p);                           // the tower, beige
  R(c, "#a8a088", x + 3 * p, Y - 9 * p, 3 * p, 0.8 * p); R(c, "#40ff70", x + 3 * p, Y - 3 * p, p, p);
  R(c, "#d8d0b4", x - 7 * p, Y - 25 * p, 12 * p, 11 * p);                          // the CRT, beige
  R(c, "#1a1f1a", x - 6 * p, Y - 24 * p, 10 * p, 8 * p);
  const on = t ? Math.floor(t * 1.3 + x) % 7 !== 0 : true;
  R(c, on ? "#0f5a7a" : "#103040", x - 5.5 * p, Y - 23.5 * p, 9 * p, 7 * p);      // the screen: the mail client
  R(c, "#c0c0c0", x - 5.5 * p, Y - 23.5 * p, 9 * p, 1.4 * p); R(c, "#000080", x - 5.5 * p, Y - 23.5 * p, 6 * p, 1.4 * p);
  if (on) for (let k = 0; k < 3; k++) R(c, "#e8f0e8", x - 4.5 * p, Y - 21 * p + k * 1.6 * p, (4 + ((k * 3 + Math.floor(x)) % 4)) * p, 0.6 * p);
  R(c, "#b8b09a", x - 3 * p, Y - 14 * p, 4 * p, p);                                // the neck
  R(c, "#e0d8c0", x - 6 * p, Y - 14.6 * p, 9 * p, 1.2 * p);                        // the keyboard
}
export function terminalPropDrawers() {
  const PROP = {};
  PROP.beigePc = { back(c, X, Y, W, p, t, a) { drawPc(c, X, Y, W, p, t, a); } };
  PROP.coffeeCounter = {
    back(c, X, Y, W, p, t, a) {
      const x0 = (a ? a.x : X + W * 0.3) + 6 * p, x1 = X + W - p;
      R(c, "#111", x0, Y - 46 * p, x1 - x0, 12 * p);   // the menu board
      if (p >= 1.3) { text(c, "COFFEE / TEA / ONE HOUR ONLINE", (x0 + x1) / 2, Y - 44 * p, 2.6 * p, "#86efac", "center"); text(c, "ALL SESSIONS LOGGED", (x0 + x1) / 2, Y - 39 * p, 2.2 * p, "#fbbf24", "center"); }
      R(c, "#57534e", x1 - 10 * p, Y - 30 * p, 8 * p, 12 * p); R(c, "#a8a29e", x1 - 9 * p, Y - 28 * p, 6 * p, 2 * p);   // the espresso machine
      const steam = t ? Math.sin(t * 3) > 0.2 : false;
      if (steam) R(c, "rgba(230,230,230,0.5)", x1 - 7 * p, Y - 34 * p, 2 * p, 3 * p);
    },
    front(c, X, Y, W, p, t, a) {
      const x0 = (a ? a.x : X + W * 0.3) + 6 * p, x1 = X + W - p;
      R(c, "#2a3a2a", x0 - 3 * p, Y - 18 * p, x1 - x0 + 3 * p, 18 * p);
      R(c, "#86efac", x0 - 3 * p, Y - 19 * p, x1 - x0 + 3 * p, 1.5 * p);
      for (let k = 0; k < 3; k++) { R(c, "#f5f5f4", x0 + k * 5 * p, Y - 22 * p, 3 * p, 3 * p); R(c, "#78350f", x0 + k * 5 * p + 0.5 * p, Y - 21.5 * p, 2 * p, p); }
    },
  };
  return PROP;
}

// ---- the wall -------------------------------------------------------------------------------------------
function terminalWall(c, x, y, w, h, u) {
  // the old pizza counter's tiles, painted over halfway
  for (let k = 0; k * 6 * u < w; k++) R(c, k % 2 ? "#242a22" : "#20251f", x + k * 6 * u, y + h * 0.55, 6 * u, h * 0.3);
  R(c, "#0a0f0a", x + w * 0.5 - 30 * u, y + 3 * u, 60 * u, 9 * u);
  text(c, "THE TERMINAL", x + w * 0.5, y + 4 * u, 6 * u, "#4ade80", "center");
  R(c, "#f5f5f4", x + w * 0.08, y + h * 0.18, 18 * u, 12 * u);
  text(c, "LOG ON.", x + w * 0.08 + 9 * u, y + h * 0.18 + 1.5 * u, 2.6 * u, "#1f2937", "center");
  text(c, "LOG OFF.", x + w * 0.08 + 9 * u, y + h * 0.18 + 5 * u, 2.6 * u, "#1f2937", "center");
  text(c, "IT IS KEPT.", x + w * 0.08 + 9 * u, y + h * 0.18 + 8.5 * u, 2.6 * u, "#b91c1c", "center");
  R(c, "#e5e7eb", x + w * 0.9 - 4 * u, y + h * 0.16, 8 * u, 8 * u); R(c, "#111", x + w * 0.9, y + h * 0.16 + 4 * u, 3 * u, 0.6 * u); R(c, "#111", x + w * 0.9 - 0.3 * u, y + h * 0.16 + 1.5 * u, 0.6 * u, 3 * u);   // the clock
}
export function terminalRooms() {
  return { DRAW: { terminal: terminalWall } };
}
