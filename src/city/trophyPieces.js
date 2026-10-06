// THE OPEN TOURNAMENTS' trophies as furniture (src/tournament/rules.js trophyOf, docs/TOURNAMENTS.md):
// a cup (or a plate, for second and third) on a dark plinth with the event's emblem on its plaque.
// The piece id is the trophy's SKU body, "trophy.<event id>.<o|a><place>", so it draws with no lookup
// and every trophy is its own piece. Pure: draw takes a 2D context, nothing here touches the page.
import { trophyOf } from "../tournament/rules.js";

const METAL = { 1: ["#d4af37", "#f3dc7a"], 2: ["#a8acb4", "#e2e4ea"], 3: ["#9a5a2a", "#d39a62"] };
const R = (c, cx, fy, s, dx, up, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(cx + dx * s), Math.round(fy - (up + h) * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
function emblem(c, cx, fy, s, game, ink) {
  if (game === "golf") { R(c, cx, fy, s, -0.2, 3, 0.4, 3.2, ink); R(c, cx, fy, s, 0.2, 5.2, 1.6, 1, "#c0392b"); }
  else if (game === "bowling") { R(c, cx, fy, s, -0.5, 3, 1, 2.4, "#f4efe0"); R(c, cx, fy, s, -0.35, 5.4, 0.7, 0.9, "#f4efe0"); R(c, cx, fy, s, -0.5, 4.6, 1, 0.3, "#c0392b"); }
  else if (game === "fish") { R(c, cx, fy, s, -1.4, 4, 2.2, 1, ink); R(c, cx, fy, s, 0.8, 3.7, 0.6, 1.6, ink); }
  else R(c, cx, fy, s, -0.6, 3.6, 1.2, 1.2, ink);
}
const CACHE = new Map();
export function trophyPiece(id) {
  if (typeof id !== "string" || !id.startsWith("trophy.")) return null;
  if (CACHE.has(id)) return CACHE.get(id);
  const t = trophyOf(id);
  const out = t ? Object.freeze({
    id, name: t.name, rooms: ["living", "study", "bedroom"], tiers: [0, 1, 2], role: "trophy", footprint: { w: 8, h: 22 }, wall: false, floor: false, glow: false, whole: false, tints: null, trophy: true,
    draw(c, cx, fy, s) {
      const [m, hi] = METAL[t.place] || METAL[1];
      R(c, cx, fy, s, -4, 0, 8, 9, "#2a2018"); R(c, cx, fy, s, -4.5, 9, 9, 1, "#4a3a2a");            // the plinth
      R(c, cx, fy, s, -2.6, 2.2, 5.2, 4.8, m); R(c, cx, fy, s, -2.2, 2.6, 4.4, 4, "#1a1410");        // the plaque
      emblem(c, cx, fy, s, t.game, hi);
      if (t.place === 1) {
        R(c, cx, fy, s, -2, 10, 4, 1.4, m); R(c, cx, fy, s, -0.6, 11.4, 1.2, 2.6, m);                // foot and stem
        R(c, cx, fy, s, -3, 14, 6, 5, m); R(c, cx, fy, s, -3.6, 18.6, 7.2, 0.8, hi);                 // the bowl, its rim
        R(c, cx, fy, s, -4.6, 15, 1.2, 3, m); R(c, cx, fy, s, 3.4, 15, 1.2, 3, m);                    // handles
        R(c, cx, fy, s, -2, 15, 1, 3, hi);                                                            // the shine
      } else {
        R(c, cx, fy, s, -1, 10, 2, 1.6, "#4a3a2a");                                                  // a stand
        R(c, cx, fy, s, -3.4, 11.6, 6.8, 6.8, m); R(c, cx, fy, s, -2.4, 12.6, 4.8, 4.8, hi); R(c, cx, fy, s, -1.4, 13.6, 2.8, 2.8, m);
      }
      if (t.div === "assisted") R(c, cx, fy, s, -4, 8.2, 8, 0.8, "#3a6b8f");                          // the ASSISTED ribbon
    },
  }) : null;
  if (CACHE.size > 300) CACHE.clear();
  CACHE.set(id, out);
  return out;
}
