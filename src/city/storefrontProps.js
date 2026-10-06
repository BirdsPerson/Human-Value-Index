// THE MALL's rooms (props.js's Fallout Shelter rules: a plan per room type, one person per anchor,
// furniture sized to the people). props.js merges these in and lends its plan makers, like
// funnelProps.js. A storefront unit's room follows what trades in it today (the published
// summary, enterpriseClient.js): a shop counter and the trade's racks, or bare boards TO LET.
//   shop-<group>  boards, gear, gym, food, records, stage, art, books, clothes, tools, bottles, goods
//   shopfront     a unit TO LET: the bare floor, the bill in the window, a caretaker's broom
//   pizzeria      SAM'S PIZZA: the ovens and the counter behind, the stools along the front
//   brewpub       GOODNIGHT IRENE'S: the long bar and its taps, the brewhouse's tanks, the tables,
//                 the stage corner (the band on music nights; the crowd cheers)
import { UNIT_SET } from "./storefrontSim.js";
import { PLAZA_SHELLS } from "./shorePlaza.js";
import { unitView } from "./enterpriseClient.js";
import { drawBrand } from "./brand.js";   // Goodnight Irene's real lockup over the bar

export const STORE_ROOM_TYPE = {
  ...Object.fromEntries([...UNIT_SET].map(id => [id, "shopfront"])),
  "sams-pizza": "pizzeria", "goodnight-irenes": "brewpub",
  // THE SHORE PLAZA's old boardwalk lots, TO LET (shorePlaza.js)
  ...Object.fromEntries(PLAZA_SHELLS.map(([id]) => [id, "shopfront"])),
};
const GROUPS = ["boards", "gear", "gym", "food", "records", "stage", "art", "books", "clothes", "tools", "bottles", "goods"];
export const STORE_LOOK = {
  shopfront: ["#1c1b19", "#3a3630"], pizzeria: ["#2a1410", "#5a2a20"], brewpub: ["#241410", "#4a2a1a"],
  "shop-boards": ["#14202a", "#3a4a58"], "shop-gear": ["#16201a", "#34463a"], "shop-gym": ["#1e1a16", "#3a3026"], "shop-food": ["#2a1e14", "#4a3322"],
  "shop-records": ["#1e1624", "#382a40"], "shop-stage": ["#1a1020", "#341a3a"], "shop-art": ["#2a2824", "#46423a"], "shop-books": ["#221a12", "#3a2c1c"],
  "shop-clothes": ["#241820", "#44303c"], "shop-tools": ["#161c22", "#2c3640"], "shop-bottles": ["#221214", "#3e2024"], "shop-goods": ["#1c1e14", "#3a3c26"],
};
// A storefront unit's room type today (props.js typeOf calls this first): null for anything else.
export function storeRoomType(placeId) {
  if (!UNIT_SET.has(placeId)) return null;
  let v = null;
  try { v = unitView(placeId); } catch { v = null; }
  if (!v || v.state !== "OPEN" || !v.type) return "shopfront";
  return v.typeId === "gym" ? "shop-gym" : `shop-${v.type.group}`;
}

export function storePlans(PLANS, { A, M, P, SIDE }) {
  const counter = M(A("counter", "sell", "staff", 1), "shopCounter", 2.4, 0.2);
  const browse = (prop, w = 1.35) => M(A("stand", "browse", "patron"), prop, w);
  for (const g of GROUPS) {
    const shelf = `shelf_${g}`;
    let plan;
    if (g === "food") plan = {
      back: { head: [counter], unit: [M(A("seat", "eat", "patron"), "barStool", 1.15)] },
      front: { unit: [M(A("seat", "eat", "patron", 1), "chair", 1.05), P("cafeTable", 0.55), M(A("seat", "talk", "patron", -1), "chair", 1.05), P(null, 0.3)] },
      solo: { head: [counter], unit: [M(A("seat", "eat", "patron", 1), "chair", 1.05), P("cafeTable", 0.55)] },
    };
    else if (g === "stage") plan = {
      back: { head: [M(A("stand", "perform", "staff"), "mic", 1.3)], unit: [M(A("stand", "cheer", "patron"), null, 1.15)] },
      front: { unit: [M(A("seat", "watch", "patron"), "chair", 1.05), M(A("seat", "drink", "patron"), "chair", 1.05)] },
      solo: { head: [M(A("stand", "perform", "staff"), "mic", 1.3)], unit: [M(A("seat", "watch", "patron"), "chair", 1.05)] },
    };
    else if (g === "gym") plan = {
      back: { unit: [M(A("station", "punch", "any", 1), "bag", 1.6, SIDE)] },
      front: { head: [M(A("stand", "coach", "staff"), null, 1.25)], unit: [M(A("station", "lift", "any"), "barbell", 1.45)] },
      solo: { head: [M(A("stand", "coach", "staff"), null, 1.25)], unit: [M(A("station", "lift", "any"), "barbell", 1.45)] },
    };
    else plan = {
      back: { unit: [browse(shelf), P(null, 0.25)] },
      front: { head: [counter], unit: [browse(g === "boards" ? "boardRack" : shelf)] },
      solo: { head: [counter], unit: [browse(g === "boards" ? "boardRack" : shelf)] },
    };
    PLANS[`shop-${g}`] = plan;
  }
  PLANS.shopfront = {
    back: { unit: [P("toLetBill", 1.4), P(null, 0.6)] },
    front: { unit: [M(A("stand", "sweep", "any"), null, 1.4)] },
  };
  PLANS.pizzeria = {
    back: { head: [M(A("station", "cook", "staff"), "pizzaOven", 1.6)], unit: [M(A("counter", "serve", "staff"), "counter", 1.2), M(A("station", "cook", "staff"), "pizzaOven", 1.6)] },
    front: { unit: [M(A("seat", "eat", "patron"), "barStool", 1.15), M(A("stand", "talk", "patron"), null, 1.1)] },
    solo: { head: [M(A("station", "cook", "staff", 1), "pizzaOven", 1.8, SIDE)], unit: [M(A("seat", "eat", "patron"), "barStool", 1.15)] },
  };
  PLANS.brewpub = {
    back: { max: 4, span: "counter", head: [M(A("station", "stir", "staff", 1), "brewTank", 1.7, SIDE)], unit: [M(A("counter", "pour", "staff"), null, 1.2), P("taps", 1.1)] },
    front: { head: [M(A("stand", "sing", "patron"), "mic", 1.3)], unit: [M(A("seat", "drink", "patron", 1), "chair", 1.05), P("cafeTable", 0.55), M(A("seat", "talk", "patron", -1), "chair", 1.05), M(A("stand", "cheer", "patron"), null, 1.1)] },
    solo: { head: [M(A("counter", "pour", "staff", 1), "barEnd", 2, 0.28), M(A("station", "stir", "staff", 1), "brewTank", 1.7, SIDE)], unit: [M(A("seat", "drink", "patron"), "barStool", 1.15), M(A("stand", "cheer", "patron"), null, 1.1)] },
  };
}

// ---- drawing ----------------------------------------------------------------------------------------
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function text(c, s, x, y, px, col, align = "center") {
  if (px < 5) return;
  c.font = `bold ${Math.round(px)}px 'Fira Mono', ui-monospace, Menlo, monospace`;
  c.textAlign = align; c.textBaseline = "top"; c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y));
}
const PAL = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#f472b6", "#a78bfa", "#f97316"];
// What each trade's shelves hold, as rows of small coloured goods.
const STOCK = {
  gear: ["#16a34a", "#f5f5f5", "#dc2626"], records: PAL, art: ["#c8a24a", "#7c3aed", "#0891b2"], books: ["#7f1d1d", "#1e3a5f", "#3f6212", "#78350f"],
  clothes: ["#be185d", "#0f766e", "#e5e7eb", "#1f2937"], tools: ["#94a3b8", "#475569", "#67e8f9"], bottles: ["#14532d", "#7f1d1d", "#78350f"],
  goods: ["#a16207", "#4d7c0f", "#b91c1c", "#1d4ed8", "#facc15"], food: ["#d97706", "#f472b6"], stage: PAL, boards: PAL, gym: PAL,
};

export function storePropDrawers() {
  const PROP = {};
  for (const g of GROUPS) {
    const cols = STOCK[g] || PAL;
    PROP[`shelf_${g}`] = {
      back(c, X, Y, W, p) {
        const w = Math.min(W - 2 * p, 22 * p), x = X + (W - w) / 2;
        R(c, "#4a3a2a", x, Y - 34 * p, w, 34 * p);
        for (let r = 0; r < 3; r++) {
          R(c, "#2a1e14", x + p, Y - 32 * p + r * 11 * p, w - 2 * p, 9 * p);
          for (let k = 0, bx = x + 2 * p; bx < x + w - 4 * p; bx += (g === "clothes" ? 5 : 3.5) * p, k++) {
            const col = cols[(r * 3 + k) % cols.length];
            if (g === "bottles") { R(c, col, bx, Y - 30 * p + r * 11 * p, 2 * p, 7 * p); R(c, "#1c1917", bx + 0.5 * p, Y - 32 * p + r * 11 * p, p, 2 * p); }
            else if (g === "clothes") R(c, col, bx, Y - 31 * p + r * 11 * p, 4 * p, 8 * p);
            else if (g === "art") R(c, col, bx, Y - 31 * p + r * 11 * p, 3 * p, 6 * p);
            else R(c, col, bx, Y - 29 * p + r * 11 * p + (k % 2 ? p : 0), 2.5 * p, 6 * p - (k % 2 ? p : 0));
          }
        }
      },
    };
  }
  PROP.boardRack = {
    back(c, X, Y, W, p) {
      const n = Math.max(3, Math.floor(W / (4 * p)) - 1), x0 = X + (W - n * 4 * p) / 2;
      R(c, "#57534e", x0 - p, Y - 6 * p, n * 4 * p + 2 * p, 2 * p);
      for (let k = 0; k < n; k++) { R(c, PAL[k % PAL.length], x0 + k * 4 * p, Y - 40 * p + (k % 2) * 4 * p, 3 * p, 36 * p - (k % 2) * 4 * p); R(c, "#e5e7eb", x0 + k * 4 * p, Y - 34 * p + (k % 2) * 4 * p, 3 * p, 2 * p); }
    },
  };
  PROP.toLetBill = {
    back(c, X, Y, W, p) {
      const w = Math.min(W - 4 * p, 26 * p), x = X + (W - w) / 2;
      R(c, "#f8fafc", x, Y - 40 * p, w, 18 * p); R(c, "#b91c1c", x + 2 * p, Y - 38 * p, w - 4 * p, 7 * p);
      text(c, "TO LET", x + w / 2, Y - 38 * p, 5 * p, "#f8fafc");
      text(c, "APPLY: DISSATISFACTION", x + w / 2, Y - 29 * p, 2.4 * p, "#1f2937");
    },
  };
  PROP.pizzaOven = {
    back(c, X, Y, W, p, t) {
      const w = Math.min(W - 2 * p, 24 * p), x = X + W - w - p;
      R(c, "#57534e", x, Y - 30 * p, w, 30 * p); R(c, "#3f3f46", x + 2 * p, Y - 28 * p, w - 4 * p, 4 * p);
      for (let k = 0; k < 2; k++) {
        const y = Y - 22 * p + k * 10 * p, flick = t ? (Math.sin(t * 9 + k * 2) > 0 ? 1 : 0) : 0;
        R(c, "#1c1917", x + 3 * p, y, w - 6 * p, 7 * p); R(c, flick ? "#fb923c" : "#ea580c", x + 4 * p, y + 4 * p, w - 8 * p, 2 * p);
      }
      text(c, "SAM'S", x + w / 2, Y - 36 * p, 4 * p, "#b91c1c");
    },
  };
  PROP.brewTank = {
    back(c, X, Y, W, p) {
      const w = 14 * p, x = X + W - w - 2 * p;
      R(c, "#b45309", x, Y - 46 * p, w, 40 * p); R(c, "#d97706", x + 2 * p, Y - 44 * p, 3 * p, 36 * p);
      R(c, "#78350f", x - p, Y - 48 * p, w + 2 * p, 3 * p); R(c, "#57534e", x + 2 * p, Y - 6 * p, 2 * p, 6 * p); R(c, "#57534e", x + w - 4 * p, Y - 6 * p, 2 * p, 6 * p);
      R(c, "#a1a1aa", x + w / 2 - p, Y - 26 * p, 2 * p, 2 * p);
    },
  };
  return PROP;
}

// The rooms' walls (props.js DRAW: (c, x, y, w, h, u) behind the furniture).
export function storeRoomDrawers() {
  const DRAW = {};
  const wainscot = (c, x, y, w, h, u, col) => R(c, col, x, y + h * 0.62, w, 2 * u);
  for (const g of GROUPS) {
    DRAW[`shop-${g}`] = (c, x, y, w, h, u) => {
      wainscot(c, x, y, w, h, u, "#00000055");
      // the trade on the back wall: boards hung, sleeves pinned, frames, a mirror, a price list (no prices)
      const n = Math.max(2, Math.floor(w / (18 * u)));
      for (let k = 0; k < n; k++) {
        const sx = x + (k + 0.5) * w / n, col = PAL[(k * 3) % PAL.length];
        if (g === "boards") R(c, col, sx - 2 * u, y + h * 0.12, 4 * u, h * 0.32);
        else if (g === "records") { R(c, col, sx - 5 * u, y + h * 0.16, 10 * u, 10 * u); R(c, "#111", sx - 2 * u, y + h * 0.16 + 3 * u, 4 * u, 4 * u); }
        else if (g === "art") { R(c, "#c8a24a", sx - 7 * u, y + h * 0.12, 14 * u, 11 * u); R(c, col, sx - 6 * u, y + h * 0.12 + u, 12 * u, 9 * u); }
        else if (g === "clothes") { R(c, "#d6d3d1", sx - 6 * u, y + h * 0.12, 12 * u, u); R(c, col, sx - 4 * u, y + h * 0.12 + u, 8 * u, 12 * u); }
        else if (g === "stage") { R(c, "#fde047", sx - u, y + h * 0.08, 2 * u, 3 * u); R(c, "#fde04733", sx - 6 * u, y + h * 0.08 + 3 * u, 12 * u, h * 0.4); }
        else R(c, "#00000033", sx - 6 * u, y + h * 0.14, 12 * u, 8 * u);
      }
    };
  }
  DRAW.shopfront = (c, x, y, w, h, u) => {
    R(c, "#cfcac022", x, y, w, h * 0.6);   // whitewashed light through the glass
    for (let k = 0; k < 6; k++) R(c, "#00000033", x + ((k * 37) % 97) / 97 * w, y + h * 0.82 + (k % 3) * u, 3 * u, u);   // dust
  };
  DRAW.pizzeria = (c, x, y, w, h, u) => {
    for (let k = 0, sx = x; sx < x + w; sx += 6 * u, k++) R(c, k % 2 ? "#f5f5f4" : "#b91c1c", sx, y + h * 0.36, 6 * u, 6 * u);   // the tile band
    R(c, "#111", x + w * 0.35, y + h * 0.08, w * 0.3, h * 0.2);   // the board over the counter
    text(c, "BY THE SLICE", x + w / 2, y + h * 0.12, 4 * u, "#fde68a");
  };
  DRAW.brewpub = (c, x, y, w, h, u) => {
    R(c, "#3a2414", x, y + h * 0.5, w, h * 0.12);   // panelling
    R(c, "#1f2a24", x + w * 0.06, y + h * 0.08, w * 0.16, h * 0.24);   // the chalkboard
    for (let k = 0; k < 3; k++) R(c, "#f7f5ec88", x + w * 0.08, y + h * 0.12 + k * 4 * u, w * 0.1 * (1 - k * 0.2), u);
    for (let k = 0, sx = x; sx < x + w; sx += 8 * u, k++) R(c, "#fde68a", sx, y + h * 0.04 + (k % 2) * u, u, u);   // the string lights
    R(c, "#8c1622", x + w * 0.78, y + h * 0.86, w * 0.2, 2 * u);   // the stage's rug
    // over the bar: the pub's own sign (the specials sheets' lockup), on a cream board in a dark frame
    const sh = Math.min(h * 0.22, 26 * u), sx = x + w * 0.5, sy = y + h * 0.1 + sh / 2;
    R(c, "#3a2414", sx - sh * 1.2 - u, sy - sh / 2 - u, sh * 2.4 + 2 * u, sh + 2 * u);
    R(c, "#f7f5ec", sx - sh * 1.2, sy - sh / 2, sh * 2.4, sh);
    if (!drawBrand(c, "irenes", sx, sy, sh * 0.9)) text(c, "GOODNIGHT IRENE'S", sx, sy - 2 * u, 4 * u, "#8c1622");
  };
  return DRAW;
}
