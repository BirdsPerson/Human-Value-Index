// Self-check for the Holding Pen / intake helpers. Run: node scripts/check-pen.mjs
import assert from "node:assert/strict";
import { FAMOUS_FIGURES, getTier, slugify, slugCandidates } from "../src/figures.js";
import {
  placeholderPixels, PX, SPRITE_W, SPRITE_H, hashStr, mulberry32,
  gaitFor, stepEntity, doorZone, sparkPoints,
} from "../src/sprites.js";

// figures: 62 unique names, slugs unique and well-formed
assert.equal(FAMOUS_FIGURES.length, new Set(FAMOUS_FIGURES.map(f => f.name)).size);
assert.equal(FAMOUS_FIGURES.length, 62);
const slugs = FAMOUS_FIGURES.map(f => slugify(f.name));
assert.equal(new Set(slugs).size, slugs.length, "slug collision");
for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/, s);
assert.equal(slugify("Martin Luther King Jr."), "martin-luther-king-jr");
assert.equal(slugify("O.J. Simpson"), "oj-simpson");
assert.deepEqual(slugCandidates("Pelé"), ["pele", "pel"]);
assert.equal(getTier(850).label, "ESSENTIAL INFRASTRUCTURE");
assert.equal(getTier(99).label, "SOYLENT GREEN");

// placeholder sprites: deterministic, feet on the bottom rows, stride differs, outline present
const seed = hashStr("socrates");
const a = placeholderPixels(seed, 0), b = placeholderPixels(seed, 0), c = placeholderPixels(seed, 1);
assert.equal(a.length, SPRITE_W * SPRITE_H);
assert.deepEqual(a, b);
assert.notDeepEqual(a, c, "walk frame should differ");
const row = (px, y) => Array.from(px.slice(y * SPRITE_W, (y + 1) * SPRITE_W));
assert.ok(row(a, SPRITE_H - 1).some(v => v !== PX.EMPTY), "no feet");
assert.ok(a.includes(PX.OUTLINE) && a.includes(PX.BODY) && a.includes(PX.EYE));

// movement: bounds hold, tiers separate
const world = { w: 400, h: 300, floorTop: 62, floorBottom: 297, doorX: 330, doorW: 34 };
function sim(tier, seconds, rs = 7) {
  const rnd = mulberry32(rs);
  const e = { x: 30, y: 250, tx: 30, ty: 250, dir: 1, state: "idle", timer: 0, animT: 0, gait: gaitFor(tier) };
  let travelled = 0, px = e.x, py = e.y, maxX = -1, minX = 1e9;
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepEntity(e, 1 / 60, world, rnd);
    travelled += Math.hypot(e.x - px, e.y - py); px = e.x; py = e.y;
    assert.ok(e.x >= 14 && e.x <= world.w - 14 && e.y >= world.floorTop + 2 && e.y <= world.floorBottom, `${tier} out of bounds`);
    maxX = Math.max(maxX, e.x); minX = Math.min(minX, e.x);
  }
  return { e, travelled };
}
const fast = sim("ESSENTIAL INFRASTRUCTURE", 120), slow = sim("SOYLENT GREEN", 120);
assert.ok(fast.travelled > slow.travelled * 3, `essential ${fast.travelled} vs soylent ${slow.travelled}`);
const z = doorZone(world);
const lurker = sim("SOYLENT GREEN", 400).e;
assert.ok(lurker.x >= z.x0 - 1 && lurker.x <= z.x1 + 1 && lurker.y <= z.y1 + 1, "soylent should end up by PROCESSING");
const reduced = gaitFor("ESSENTIAL INFRASTRUCTURE", true);
assert.ok(reduced.speed < gaitFor("ESSENTIAL INFRASTRUCTURE").speed && reduced.bob === 0);

// sparkline
assert.equal(sparkPoints([], 100, 50), "");
assert.equal(sparkPoints([500], 100, 50), "50,25");
const pts = sparkPoints([400, 600, 500], 100, 50, 5).split(" ").map(p => p.split(",").map(Number));
assert.deepEqual(pts.map(p => p[0]), [5, 50, 95]);
assert.equal(pts[1][1], 5);   // max at top
assert.equal(pts[0][1], 45);  // min at bottom

console.log("check-pen: ok");
