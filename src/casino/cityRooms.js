// HOUSE EDGE CASINO in the city: its ground floor is THE TABLES (a roulette wheel that spins,
// blackjack and baccarat with their dealers, a poker table) and its second floor the HIGH
// LIMIT ROOM behind a velvet rope; the first floor keeps the slot floor (props.js "casino").
// props.js merges these in (plans, decor, furniture), so the cutaways (CityIso, RoomStage)
// draw them like any other room; tapping a table opens its game (#casino/<game>).
//
// The builders take props.js's own helpers (h), so this file never imports props.js.

export const CASINO_FLOOR_TYPE = { G: "casinoTables", "2F": "casinoHigh" };
export const floorRoomType = (placeId, floor) => (placeId === "casino" && floor ? CASINO_FLOOR_TYPE[floor] || null : null);

// furniture -> the game it opens
export const TABLE_GAME = { rouletteTable: "roulette", bjTable: "blackjack", baccaratTable: "baccarat", pokerTable: "poker", highTable: "poker", cardTable: "cards" };
// THE CARD ROOM's tables (src/play/cards/): a card table in the casino's card room, the bars and THE
// UNION LOUNGE; a tap sits you at that room's tables (#cards?at=...).
export const CARD_ROOM_AT = { casinoTables: "casino", bar: "bar", "bar-lantern": "bar", "bar-lodge": "bar", brewpub: "bar", union: "union" };
const hashFor = (plan, prop) => (prop === "cardTable" ? `#cards?at=${CARD_ROOM_AT[plan.type] || "casino"}` : `#casino/${TABLE_GAME[prop]}${plan.type === "casinoHigh" ? "?room=high" : ""}`);

// Tap boxes for the tables of a planned room, in the room's own px (x0, y0 = its top left).
// -> [{go: hash, box: [x0, y0, x1, y1]}]
export function casinoHits(plan, x0 = 0, y0 = 0) {
  if (!plan || (plan.type !== "casinoTables" && plan.type !== "casinoHigh" && !CARD_ROOM_AT[plan.type])) return [];
  const out = [];
  for (const row of plan.rows) {
    const p = (plan.sw * row.s) / 32;
    for (const it of row.items) {
      if (!TABLE_GAME[it.prop]) continue;
      out.push({ go: hashFor(plan, it.prop), box: [x0 + it.x0, y0 + row.y - 34 * p, x0 + it.x1, y0 + Math.min(plan.h, row.y + 40 * p)] });
    }
  }
  return out;
}
// The table under a tap (room-relative px), as a hash to open, or null.
export function casinoTap(plan, lx, ly) {
  const h = casinoHits(plan).find(({ box }) => lx >= box[0] && lx <= box[2] && ly >= box[1] && ly <= box[3]);
  return h ? h.go : null;
}

// ---- plans -----------------------------------------------------------------------------------------
export function casinoPlans({ A, M, P }) {
  return {
    casinoTables: {
      back: { unit: [M(A("counter", "deal", "staff"), "rouletteTable", 1.9), M(A("counter", "deal", "staff"), "bjTable", 1.6), M(A("counter", "deal", "staff"), "baccaratTable", 1.6), M(A("counter", "deal", "staff"), "pokerTable", 1.7)] },
      front: { unit: [M(A("stand", "wager", "patron", 1), null, 1.25), M(A("seat", "gamble", "patron"), "stool", 1.15), M(A("seat", "gamble", "patron", -1), "stool", 1.15), M(A("stand", "wager", "patron", -1), null, 1.25), M(A("seat", "gamble", "patron"), "stool", 1.15)] },
      solo: { head: [M(A("counter", "deal", "staff"), "rouletteTable", 1.9)], unit: [M(A("seat", "gamble", "patron"), "stool", 1.15), M(A("counter", "deal", "staff"), "pokerTable", 1.7)] },
    },
    casinoHigh: {
      back: { unit: [M(A("counter", "deal", "staff"), "highTable", 2.0), P("champagne", 0.6)] },
      front: { head: [P("rope", 0.9), M(A("stand", "guard", "staff"), null, 1.2)], unit: [M(A("seat", "gamble", "patron", 1), "stool", 1.15), M(A("seat", "gamble", "patron", -1), "stool", 1.15), P(null, 0.35)] },
      solo: { head: [P("rope", 0.9), M(A("stand", "guard", "staff"), null, 1.2), M(A("counter", "deal", "staff"), "highTable", 2.0)], unit: [M(A("seat", "gamble", "patron", 1), "stool", 1.15)] },
    },
  };
}

// The card tables, added to the rooms once every plan exists (props.js, after the house cabinets):
// one seated table in each room that has them, last in the row's head (once per room).
export function cardTablePlans(PLANS, { A, M }) {
  const table = () => M(A("seat", "gamble", "patron"), "cardTable", 1.5);
  const add = (row, unit = false) => { if (!row) return; if (unit) row.unit = [...(row.unit || []), table()]; else row.head = [...(row.head || []), table()]; };
  if (PLANS.casinoTables) { add(PLANS.casinoTables.front, true); add(PLANS.casinoTables.solo, true); }
  for (const t of Object.keys(CARD_ROOM_AT)) {
    if (t === "casinoTables" || !PLANS[t]) continue;
    const def = PLANS[t];
    add(def.front); add(def.solo);
  }
}

export const casinoLook = { casinoTables: ["#1a1410", "#3a1e1e"], casinoHigh: ["#1c0d16", "#401626"] };

// ---- the back wall -------------------------------------------------------------------------------
export function casinoDraw({ R, across }) {
  const sign = (c, text, x, y, w, u, col) => {
    const fs = Math.max(7, Math.min(12, Math.round(4 * u + 3)));
    c.font = `bold ${fs}px ui-monospace, Menlo, monospace`;
    const tw = c.measureText(text).width + 8;
    if (tw > w * 0.8) return;
    const sx = Math.round(x + (w - tw) / 2);
    R(c, "#0b0806", sx, y, tw, fs + 6);
    R(c, col, sx, y, tw, 1); R(c, col, sx, y + fs + 5, tw, 1);
    c.fillStyle = col; c.textBaseline = "top"; c.textAlign = "left";
    c.fillText(text, sx + 4, y + 3);
  };
  return {
    casinoTables(c, x, y, w, h, u) {
      R(c, "rgba(251,191,36,0.1)", x, y, w, 4 * u);
      across(x, w, 6 * u, (bx, i) => R(c, i % 2 ? "#7f1d1d" : "#3a0f0f", bx, y + 4 * u, 3 * u, 2 * u));
      across(x + 10 * u, w - 20 * u, 40 * u, (lx) => { R(c, "#c9a227", lx - u, y + 6 * u, 2 * u, 3 * u); R(c, "rgba(255,226,160,0.25)", lx - 3 * u, y + 9 * u, 6 * u, 2 * u); });   // chandeliers
      sign(c, "THE HOUSE ALWAYS WINS", x, y + 12 * u, w, u, "#fbbf24");
    },
    casinoHigh(c, x, y, w, h, u) {
      R(c, "#2a0f1c", x, y, w, h * 0.55);
      across(x, w, 4 * u, (bx, i) => R(c, i % 2 ? "#c9a227" : "#7a5a14", bx, y + 3 * u, 2 * u, u));   // gold frieze
      across(x + 14 * u, w - 28 * u, 16 * u, (px) => R(c, "rgba(201,162,39,0.35)", px, y + 6 * u, u, h * 0.45));   // pilasters
      sign(c, "HIGH LIMIT", x, y + 10 * u, w, u, "#fbbf24");
    },
  };
}

export function casinoLive({ R, across }) {
  const bulbs = (c, x, y, w, u, t) => across(x, w, 5 * u, (bx, i) => R(c, (i + Math.floor(t * 4)) % 4 ? "#7a5a14" : "#fbbf24", bx + u, y + u, u, u));
  return {
    casinoTables(c, x, y, w, h, u, { t }) { bulbs(c, x, y, w, u, t); },
    casinoHigh(c, x, y, w, h, u, { t }) { if (Math.floor(t * 2) % 7 === 0) R(c, "rgba(251,191,36,0.05)", x, y, w, h * 0.55); },
  };
}

// ---- the furniture -------------------------------------------------------------------------------
// Tables are side-on: a felt top and an apron in front of the dealer (drawn after the row's
// people, so the dealer stands behind it), the game on the felt.
export function casinoProps({ R }) {
  const top = (c, X, Y, W, p, felt = "#14532d", rail = "#3a2a1a") => {
    R(c, rail, X + p, Y - 18 * p, W - 2 * p, p);
    R(c, felt, X + p, Y - 17 * p, W - 2 * p, 3 * p);
    R(c, "#2a1a0c", X + 2 * p, Y - 14 * p, W - 4 * p, 12 * p);
    R(c, "#1a1008", X + 3 * p, Y - 2 * p, 2 * p, 2 * p); R(c, "#1a1008", X + W - 5 * p, Y - 2 * p, 2 * p, 2 * p);
  };
  const chips = (c, x, y, p, n, col = "#fbbf24") => { for (let k = 0; k < n; k++) R(c, k % 2 ? col : "#c9a227", x, y - (k + 1) * p, 3 * p, p); };
  const card = (c, x, y, p, red) => { R(c, "#e8efe8", x, y, 2 * p, 3 * p); R(c, red ? "#b91c1c" : "#111", x + p * 0.5, y + p, p, p); };
  return {
    rouletteTable: {
      front(c, X, Y, W, p, t, a) {
        top(c, X, Y, W, p);
        // the wheel, a bowl on the felt: pockets turning one way, the ball the other
        const cx = (a ? a.x : X + W / 2) - W * 0.18, cy = Y - 19 * p, rx = Math.max(6 * p, W * 0.2), ry = 2.6 * p;
        c.fillStyle = "#3a2a14"; c.beginPath(); c.ellipse(cx, cy, rx + p, ry + p, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#c9a227"; c.beginPath(); c.ellipse(cx, cy, rx + p, ry + p, 0, Math.PI, Math.PI * 2); c.fill();
        for (let k = 0; k < 18; k++) {
          const ang = (k / 18) * Math.PI * 2 + t * 2.2;
          if (Math.sin(ang) < -0.2) continue;   // the far side is hidden by the rim
          R(c, k === 0 ? "#16a34a" : k % 2 ? "#b91c1c" : "#111", cx + Math.cos(ang) * rx * 0.85 - p / 2, cy + Math.sin(ang) * ry * 0.7 - p / 2, p, p);
        }
        const b = -t * 4.1;
        R(c, "#f5f5f5", cx + Math.cos(b) * rx * 0.95 - p / 2, cy + Math.sin(b) * ry * 0.9 - p, p, p);
        R(c, "#c9a227", cx - p / 2, cy - 2 * p, p, 2 * p);   // the turret
        // the layout on the felt, to the right
        for (let k = 0; k < 6; k++) R(c, k % 2 ? "#7f1d1d" : "#0d140d", X + W * 0.55 + k * 2 * p, Y - 17 * p, 2 * p, p);
        chips(c, X + W * 0.62, Y - 17 * p, p, 1 + (Math.floor(t * 0.7) % 3));
      },
    },
    bjTable: {
      front(c, X, Y, W, p, t, a) {
        top(c, X, Y, W, p);
        const x = a ? a.x : X + W / 2;
        R(c, "#7f1d1d", X + W - 7 * p, Y - 22 * p, 5 * p, 4 * p);   // the shoe
        const k = Math.floor(t * 0.8) % 4;
        for (let j = 0; j <= k; j++) card(c, x - 8 * p + j * 3 * p, Y - 21 * p, p, j % 2);
        card(c, x + 3 * p, Y - 21 * p, p, false);
        chips(c, X + 3 * p, Y - 17 * p, p, 2);
      },
    },
    baccaratTable: {
      front(c, X, Y, W, p, t, a) {
        top(c, X, Y, W, p, "#1e3a5f");
        const x = a ? a.x : X + W / 2;
        card(c, x - 9 * p, Y - 21 * p, p, true); card(c, x - 6 * p, Y - 21 * p, p, false);
        card(c, x + 4 * p, Y - 21 * p, p, false); if (Math.floor(t * 0.5) % 2) card(c, x + 7 * p, Y - 21 * p, p, true);
        R(c, "#fbbf24", x - p, Y - 17 * p, 2 * p, p);   // the commission box
        chips(c, X + W - 6 * p, Y - 17 * p, p, 3);
      },
    },
    pokerTable: {
      front(c, X, Y, W, p, t, a) {
        top(c, X, Y, W, p);
        const x = a ? a.x : X + W / 2;
        for (let j = 0; j < 5; j++) if (j < 3 + (Math.floor(t * 0.4) % 3)) card(c, x - 8 * p + j * 3 * p, Y - 21 * p, p, j === 1 || j === 4);
        chips(c, x + 9 * p, Y - 17 * p, p, 2 + (Math.floor(t * 0.6) % 3));
        R(c, "#e8efe8", X + 4 * p, Y - 18 * p, 2 * p, p);   // the button
      },
    },
    highTable: {
      front(c, X, Y, W, p, t, a) {
        top(c, X, Y, W, p, "#14532d", "#c9a227");
        R(c, "#c9a227", X + p, Y - 3 * p, W - 2 * p, p);
        const x = a ? a.x : X + W / 2;
        for (let j = 0; j < 5; j++) card(c, x - 8 * p + j * 3 * p, Y - 21 * p, p, j % 2 === 0);
        chips(c, x + 9 * p, Y - 17 * p, p, 5 + (Math.floor(t * 0.5) % 3));
        chips(c, X + 4 * p, Y - 17 * p, p, 4, "#e5e5e5");
      },
    },
    // a card table: green baize, a trick on it, the score pad, a seated player behind
    cardTable: {
      front(c, X, Y, W, p, t, a) {
        const x = a ? a.x : X + W / 2, tw = Math.min(W - 2 * p, 26 * p), tx = x - tw / 2;
        R(c, "#3a2a1a", tx, Y - 12 * p, tw, p);
        R(c, "#14532d", tx, Y - 11 * p, tw, 2 * p);
        R(c, "#0b3a1d", tx, Y - 9 * p, tw, p);
        R(c, "#2a1a0c", tx + 2 * p, Y - 8 * p, 2 * p, 8 * p); R(c, "#2a1a0c", tx + tw - 4 * p, Y - 8 * p, 2 * p, 8 * p);
        const k = Math.floor(t * 0.7) % 5;
        for (let j = 0; j < Math.min(4, k + 1); j++) card(c, x - 6 * p + j * 3 * p, Y - 15 * p, p, j % 2 === 1);
        R(c, "#f4f2ea", tx + tw - 6 * p, Y - 12.5 * p, 3 * p, p);   // the score pad
      },
    },
    champagne: {
      back(c, X, Y, W, p) {
        const x = X + W / 2;
        R(c, "#9ca3af", x - 3 * p, Y - 16 * p, 6 * p, 16 * p);
        R(c, "#6b7280", x - 2 * p, Y - 22 * p, 4 * p, 6 * p);
        R(c, "#14532d", x - p, Y - 27 * p, 2 * p, 6 * p); R(c, "#fbbf24", x - p, Y - 28 * p, 2 * p, p);
      },
    },
  };
}
