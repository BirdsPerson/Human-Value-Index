// HOUSE GAMES: our own playable games as arcade cabinets in the city's bars (Scott, 2026-10-05:
// "Golden Tee-type stuff — we want all these new games to be arcade games inside of the bars").
// docs/CITY_SPEC.md "The funnels / House games".
//   - the list: arcade.json's entries with "house": true (kept by scripts/sync-arcade.mjs like the
//     neighbours), each naming the route it plays (#golf, #hunt, #tennis ...). An entry whose route
//     App.jsx does not serve yet (#bowling, #football, #ski until they land) is hidden: no cabinet
//     anywhere, exactly as the #play tiles dim (games.js isLive, the build's route table).
//   - where they stand: HOUSE_PLACES, by the room's type (a bar furnished one way furnishes them all)
//     and, where one bar is not like the others, by its own type (THE LANTERN, the summit lodge).
//   - the marquee: the machine day's high score (funnels.highScore, a dead figure holds it), in the
//     game's own units; where a server re-plays scores (TAGGED OUT's board, the aquarium's plaques) a
//     player's verified score that beats it puts the player's tag up instead.
//   - the attract screens: drawn here, one per game, in the cabinet's little screen.
import GAMES_JSON from "./arcade.json" with { type: "json" };
import { routesIn } from "../play/games.js";

/* global __HVI_ROUTES__ */
const BUILT = typeof __HVI_ROUTES__ !== "undefined" ? new Set(__HVI_ROUTES__) : null;
export const HOUSE_ALL = GAMES_JSON.filter(g => g.house === true);
const roomOfRoute = (r) => String(r || "").split(/[/?]/)[0];
// -> the house games whose route is served (routes: a Set of "#room"; null = every one, as in node
// without a route table: the checks pass routesIn(App.jsx) to be exact)
export const houseLive = (routes = BUILT) => HOUSE_ALL.filter(g => !routes || routes.has(roomOfRoute(g.route)));
export const HOUSE = houseLive();
export const HOUSE_SLUGS = new Set(HOUSE.map(g => g.slug));
export { routesIn };

// Which house cabinets stand where, by room type (props.js): first in the front row, after JETSAM!.
// Room types that only exist here (bar-lantern, bar-lodge) are a bar with a different set of
// cabinets: housePlans() furnishes them as a bar and housePlaceTypes() points the places at them.
export const HOUSE_PLACES = {
  bar: ["house-hunt", "house-golf"],                     // THE DIVE, and every bar like it
  "bar-lantern": ["house-hoops", "house-tennis"],        // THE LANTERN, upstairs: the shooting machine
  "bar-lodge": ["house-hunt", "house-ski"],              // the summit lodge's bar
  brewpub: ["house-golf", "house-hunt"],                 // GOODNIGHT IRENE'S
  casino: ["house-golf"],                                // a corner of the casino's slot floor
  boardwalk: ["house-hoops", "house-fish", "house-skate"],              // among the boardwalk's stalls
  diner: ["house-fish"],                                 // the all-night diner
  union: ["house-bowling", "house-football"],            // THE UNION LOUNGE
};
export const HOUSE_PLACE_TYPES = { "the-lantern": "bar-lantern", "summit-lodge": "bar-lodge" };
// the cabinets a room type holds now (the hidden ones dropped)
export const houseFor = (type, live = HOUSE_SLUGS) => (HOUSE_PLACES[type] || []).filter(s => live.has(s));

// The game a house cabinet opens, inside the city's CRT: the same site, the cabinet's own mode.
export const houseSrc = (g) => `/${g.route}${g.route.includes("?") ? "&" : "?"}cab=1`;
export const isHouse = (slug) => HOUSE_ALL.some(g => g.slug === slug);

// ---- the marquee's colours, and each game's attract screen -----------------------------------------
export const HOUSE_COLORS = {
  "house-golf": ["#4ade80", "#166534"], "house-hunt": ["#f97316", "#3f2a14"], "house-bowling": ["#e879f9", "#1e1b4b"],
  "house-tennis": ["#d9f99d", "#1e3a8a"], "house-hoops": ["#fb923c", "#7c2d12"], "house-football": ["#fde047", "#14532d"],
  "house-soccer": ["#f8fafc", "#065f46"], "house-fish": ["#38bdf8", "#0c4a6e"], "house-ski": ["#e0f2fe", "#1d4ed8"], "house-skate": ["#fb923c", "#312e81"],
};
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
// The little screen, sx..sx+sw by sy..sy+sh, at one cabinet pixel p, at time t (s).
export function houseScreen(c, slug, sx, sy, sw, sh, p, t, i = 0) {
  const f = Math.floor(t * 4 + i);
  switch (slug) {
    case "house-golf": {   // a fairway running away, the flag, the ball's arc
      R(c, "#7dd3fc", sx, sy, sw, sh * 0.45); R(c, "#15803d", sx, sy + sh * 0.45, sw, sh * 0.55); R(c, "#22c55e", sx + sw * 0.3, sy + sh * 0.45, sw * 0.4, sh * 0.55);
      R(c, "#f8fafc", sx + sw * 0.62, sy + sh * 0.25, p * 0.6, sh * 0.25); R(c, "#ef4444", sx + sw * 0.62, sy + sh * 0.25, p * 1.6, p);
      const k = (t * 0.5 + i * 0.3) % 1; R(c, "#fff", sx + sw * (0.2 + 0.4 * k), sy + sh * (0.85 - 0.7 * k * (1 - k) * 2.4), p, p);
      break;
    }
    case "house-hunt": {   // a tree line, a buck crossing, the reticle on it
      R(c, "#fdba74", sx, sy, sw, sh * 0.4); R(c, "#14532d", sx, sy + sh * 0.3, sw, sh * 0.15); R(c, "#65a30d", sx, sy + sh * 0.45, sw, sh * 0.55);
      const x = sx + ((t * 0.18 + i * 0.37) % 1) * sw * 0.9;
      R(c, "#92400e", x, sy + sh * 0.55, sw * 0.18, sh * 0.15); R(c, "#92400e", x + sw * 0.15, sy + sh * 0.45, sw * 0.06, sh * 0.12); R(c, "#fef3c7", x + sw * 0.14, sy + sh * 0.36, p * 0.6, sh * 0.1);
      R(c, "#78350f", x + sw * 0.02, sy + sh * 0.7, p * 0.5, sh * 0.12); R(c, "#78350f", x + sw * 0.14, sy + sh * 0.7, p * 0.5, sh * 0.12);
      if (f % 4 < 3) { R(c, "#fff", x + sw * 0.08, sy + sh * 0.4, p * 0.5, sh * 0.35); R(c, "#fff", x - sw * 0.02, sy + sh * 0.6, sw * 0.24, p * 0.5); }
      break;
    }
    case "house-bowling": {   // the lane, the pins, the ball rolling up it
      R(c, "#1e1b4b", sx, sy, sw, sh); R(c, "#d6a35c", sx + sw * 0.3, sy, sw * 0.4, sh);
      for (let k = 0; k < 4; k++) R(c, "#fff", sx + sw * (0.36 + k * 0.08), sy + p, p * 0.8, p * 1.6);
      R(c, "#e879f9", sx + sw * 0.46, sy + sh * (0.85 - ((t * 0.6 + i * 0.2) % 1) * 0.6), p * 1.4, p * 1.4);
      break;
    }
    case "house-tennis": {
      R(c, "#2563eb", sx, sy, sw, sh); R(c, "#f8fafc", sx + p, sy + sh / 2, sw - 2 * p, p * 0.5); R(c, "#f8fafc", sx + p, sy + p, p * 0.5, sh - 2 * p); R(c, "#f8fafc", sx + sw - 1.5 * p, sy + p, p * 0.5, sh - 2 * p);
      const k = (t * 0.8 + i * 0.3) % 2, y = k < 1 ? k : 2 - k; R(c, "#d9f99d", sx + sw * (0.3 + 0.4 * y), sy + sh * (0.15 + 0.7 * y), p, p);
      break;
    }
    case "house-hoops": {   // the shooting machine: the backboard, the hoop, balls going up
      R(c, "#7c2d12", sx, sy, sw, sh); R(c, "#f8fafc", sx + sw * 0.25, sy + p, sw * 0.5, sh * 0.35); R(c, "#ef4444", sx + sw * 0.4, sy + sh * 0.12, sw * 0.2, sh * 0.15);
      R(c, "#f97316", sx + sw * 0.35, sy + sh * 0.38, sw * 0.3, p * 0.6);
      for (let k = 0; k < 2; k++) { const q = (t * 0.9 + k * 0.5 + i * 0.2) % 1; R(c, "#fb923c", sx + sw * (0.3 + 0.2 * k + 0.1 * q), sy + sh * (0.9 - 0.65 * q * (2 - q)), p * 1.2, p * 1.2); }
      break;
    }
    case "house-football": case "house-soccer": {
      R(c, "#15803d", sx, sy, sw, sh); for (let k = 1; k < 4; k++) R(c, "#f8fafc", sx + (sw * k) / 4, sy, p * 0.4, sh);
      R(c, slug === "house-football" ? "#92400e" : "#fff", sx + sw * (0.2 + ((t * 0.3 + i * 0.2) % 0.6)), sy + sh * 0.45, p * 1.2, p);
      break;
    }
    case "house-fish": {   // the water, the line, a fish on it
      R(c, "#bae6fd", sx, sy, sw, sh * 0.3); R(c, "#0369a1", sx, sy + sh * 0.3, sw, sh * 0.7);
      R(c, "#e5e7eb", sx + sw * 0.7, sy, p * 0.4, sh * 0.6);
      const y = sy + sh * (0.55 + 0.1 * ((f % 4) / 4)); R(c, "#facc15", sx + sw * 0.62, y, sw * 0.2, sh * 0.12); R(c, "#facc15", sx + sw * 0.8, y - p * 0.5, p, sh * 0.2);
      break;
    }
    case "house-ski": {
      R(c, "#bfdbfe", sx, sy, sw, sh); R(c, "#f8fafc", sx, sy + sh * 0.4, sw, sh * 0.6);
      for (let k = 0; k < 3; k++) R(c, "#166534", sx + sw * (0.15 + k * 0.32), sy + sh * (0.45 + (k % 2) * 0.2), p * 1.2, p * 2);
      const q = (t * 0.5 + i * 0.3) % 1; R(c, "#ef4444", sx + sw * (0.5 + 0.3 * ((f % 8) < 4 ? q : 1 - q) - 0.15), sy + sh * (0.4 + 0.5 * q), p, p * 1.6);
      break;
    }
    case "house-skate": {   // a quarter pipe, a skater going up it and into the air
      R(c, "#312e81", sx, sy, sw, sh); R(c, "#9ca3af", sx, sy + sh * 0.8, sw, sh * 0.2);
      for (let k = 0; k < 5; k++) R(c, "#d9a066", sx + sw * (0.62 + k * 0.07), sy + sh * (0.8 - k * k * 0.035), sw * 0.08, sh * (0.2 + k * k * 0.035));
      const q = (t * 0.7 + i * 0.3) % 1, y = q < 0.5 ? q * 2 : 2 - q * 2;
      R(c, "#fb923c", sx + sw * (0.25 + 0.5 * Math.min(1, q * 1.6)), sy + sh * (0.7 - 0.55 * y), p, p * 1.6);
      R(c, "#fde047", sx + sw * (0.22 + 0.5 * Math.min(1, q * 1.6)), sy + sh * (0.7 - 0.55 * y) + p * 1.6, p * 2, p * 0.5);
      break;
    }
    default: R(c, "#111", sx, sy, sw, sh);
  }
}

// The cabinet's own furniture, drawn over the body (x0..x1 the box, top its top, p a cabinet pixel):
// the plastic rifles on the light-gun cabinet, the trackball on the golf one, the rod on the fishing
// one, the net and the ramp on the shooting machine.
export function houseExtras(c, slug, x0, top, w, p, t) {
  if (slug === "house-hunt") {
    // two plastic rifles, holstered on chains either side of the panel: orange and green
    for (const [x, col] of [[x0 - 2.2 * p, "#f97316"], [x0 + w + 0.4 * p, "#22c55e"]]) {
      R(c, "#6b7280", x + 0.6 * p, top + 18 * p, p * 0.4, 5 * p);   // the chain
      R(c, col, x, top + 22 * p, 1.8 * p, 9 * p);                    // the stock and the barrel
      R(c, col, x - 0.6 * p, top + 26 * p, 2.4 * p, 2.4 * p);        // the grip
      R(c, "#111", x + 0.3 * p, top + 22 * p, 0.6 * p, 1.2 * p);     // the muzzle
    }
  } else if (slug === "house-golf") {
    R(c, "#0b0b0f", x0 + w / 2 - 3 * p, top + 21 * p, 6 * p, 3 * p);
    R(c, "#e5e7eb", x0 + w / 2 - 2 * p, top + 20 * p, 4 * p, 2.2 * p);    // the trackball
    R(c, "#9ca3af", x0 + w / 2 - 2 * p, top + 21.4 * p, 4 * p, 0.8 * p);
    R(c, "#fff", x0 + w / 2 - 1 * p + ((t * 2) % 2 < 1 ? 0 : p), top + 20.2 * p, p, 0.8 * p);
  } else if (slug === "house-fish") {
    R(c, "#a16207", x0 + w - 2 * p, top + 14 * p, p * 0.6, 14 * p);  // the rod, along the side
    R(c, "#6b7280", x0 + w - 3 * p, top + 24 * p, 2 * p, 2 * p);     // the reel
  } else if (slug === "house-hoops") {
    R(c, "#f8fafc", x0 + 2 * p, top - 12 * p, w - 4 * p, 8 * p);     // the backboard up top
    R(c, "#ef4444", x0 + w / 2 - 2 * p, top - 9 * p, 4 * p, 3 * p);
    R(c, "#f97316", x0 + w / 2 - 3 * p, top - 4 * p, 6 * p, p * 0.8);  // the rim
    for (let k = 0; k < 3; k++) R(c, "#e5e7eb", x0 + w / 2 - 2.5 * p + k * 2 * p, top - 3.2 * p, p * 0.4, 2.4 * p);   // the net
  } else if (slug === "house-bowling") {
    R(c, "#d6a35c", x0 - p, top + 26 * p, w + 2 * p, 2 * p);         // a stub of lane
  }
}

// ---- the verified scores (where a server re-plays them) -----------------------------------------------
// TAGGED OUT: /api/hunt, the day's board; REEL TIME: /api/aquarium, the heaviest donated fish. One fetch
// each per page, asked for the first time a cabinet that shows it is drawn; never throws.
const VERIFIED = {};
let asked = false;
export function loadVerified(fetcher = typeof fetch !== "undefined" ? fetch : null) {
  if (asked || !fetcher) return;
  asked = true;
  const day = (j) => j?.day;
  fetcher("/api/hunt").then(r => (r.ok ? r.json() : null)).then(j => { const top = j?.top?.[0]; if (top) VERIFIED["house-hunt"] = { tag: top.tag, n: top.score, day: day(j) }; }).catch(() => {});
  fetcher("/api/aquarium").then(r => (r.ok ? r.json() : null)).then(j => {
    let best = null;
    for (const t of Object.values(j?.tanks || {})) if (t.record && (!best || t.record.cw > best.cw)) best = t.record;
    if (best) VERIFIED["house-fish"] = { tag: String(best.holder || "").replace(/^SUBJECT\s+/, "").slice(-4), n: best.cw, allTime: true };
  }).catch(() => {});
}
export const verifiedFor = (slug) => VERIFIED[slug] || null;
export const setVerified = (slug, v) => { if (v) VERIFIED[slug] = v; else delete VERIFIED[slug]; };   // the checks
