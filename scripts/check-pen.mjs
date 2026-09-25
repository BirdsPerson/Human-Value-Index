// Self-check for the Holding Pen / intake helpers. Run: node scripts/check-pen.mjs
import assert from "node:assert/strict";
import { FAMOUS_FIGURES, getTier, slugify, slugCandidates } from "../src/figures.js";
import { computeScore, cube, getTier as tierLabel } from "../netlify/lib/intake.js";
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
// every stored figure score is the formula (harm gate included) over its breakdown
for (const f of FAMOUS_FIGURES) {
  assert.equal(f.score, computeScore(f.breakdown, f.harm?.severity), `${f.name}: stored score is not the formula`);
  assert.equal(f.tier, tierLabel(f.score), `${f.name}: tier`);
  const q = cube(f.breakdown);
  assert.deepEqual([f.warmth, f.competence, f.quadrant], [q.warmth, q.competence, q.quadrant], `${f.name}: stored cube is not the formula`);
}
// Rubric 3 regression (docs/methodology/RECOMMENDATION.md step 6): the moral floor holds.
{
  const VILLAINS = new Set(["Jeffrey Epstein", "Ghislaine Maxwell", "Martin Shkreli", "Bernie Madoff", "Elizabeth Holmes", "Harvey Weinstein", "Joe Jackson", "Pablo Escobar", "O.J. Simpson", "Aaron Hernandez", "Genghis Khan", "Kim Jong-un", "Putin", "Mao Zedong"]);
  // Pre-modern dynastic killers are judged by scale and era (Scott, 2026-09-25): below every
  // saint, above every modern predator, not held below everyone.
  const HISTORICAL = new Set(["Cleopatra", "Henry VIII", "Caligula"]);
  const SAINTS = ["Harriet Tubman", "Nelson Mandela", "Martin Luther King Jr.", "Mahatma Gandhi", "Mother Teresa", "Princess Diana", "Keanu Reeves"];
  const PREDATORS = ["Jeffrey Epstein", "Ghislaine Maxwell", "Harvey Weinstein", "Pablo Escobar", "O.J. Simpson", "Aaron Hernandez"];
  assert.equal(FAMOUS_FIGURES.filter(f => VILLAINS.has(f.name)).length, VILLAINS.size, "villain list matches the roster");
  assert.equal(FAMOUS_FIGURES.filter(f => HISTORICAL.has(f.name)).length, HISTORICAL.size, "historical list matches the roster");
  const sc = n => FAMOUS_FIGURES.find(f => f.name === n).score;
  const hist = [...HISTORICAL].map(sc);
  assert.ok(Math.max(...hist) < Math.min(...SAINTS.map(sc)), "historically violent rulers sit below every saint");
  assert.ok(Math.min(...hist) > Math.max(...PREDATORS.map(sc)), "historically violent rulers sit above every modern predator");
  for (const n of HISTORICAL) assert.ok(sc(n) < 500 && sc(n) >= 100, `${n} lands in FLAGGED or MONITORED, not gated (${sc(n)})`);
  const worstDecent = Math.min(...FAMOUS_FIGURES.filter(f => !VILLAINS.has(f.name) && !HISTORICAL.has(f.name)).map(f => f.score));
  const bestVillain = Math.max(...FAMOUS_FIGURES.filter(f => VILLAINS.has(f.name)).map(f => f.score));
  assert.ok(bestVillain < worstDecent, `every villain sits below every non-villain (${bestVillain} vs ${worstDecent})`);
  assert.ok(FAMOUS_FIGURES.filter(f => f.score < 100).length >= 9, "files under 100 stay reserved for monsters, and there are at least 9");
  for (const f of FAMOUS_FIGURES.filter(f => f.score < 100)) assert.ok(VILLAINS.has(f.name), `${f.name} under 100 but not on the villain list`);
  // the ordinary decent persona stays at or above the 35th percentile of the roster (Scott confirmed p35, 2026-09-25). Was 40
  // until the 2026-09-25 median-of-3 rescore lifted the stale-low roster ~30 points and seven
  // famous figures (Teresa, Churchill, Newton, Elizabeth II, Picasso, M. Jackson, Mansa Musa)
  // crossed the fixed persona; flagged to Scott in docs/rescore-2026-09-25.md.
  const persona = computeScore({ care: 76, alignment: 62, utility: 60, adaptability: 55, legacy: 58, network: 53, physical: 62, threat: 12, redundancy: 50 });
  const pct = FAMOUS_FIGURES.filter(f => f.score < persona).length / FAMOUS_FIGURES.length * 100;
  assert.ok(pct >= 35, `decent persona at p${pct.toFixed(0)}`);
}
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

// ---- the People judge: likability from YouGov, two points, judge state, gap line ----
{
  const { likabilityFrom, judged, gapLine, quadrantOf, GAP_THRESHOLD } = await import("../src/cube.js");
  // formula: liked share of those aware x 100, shrunk toward 50 by fame (pseudo-count 20)
  assert.equal(likabilityFrom({ liked_share_of_aware: 0.724, fame_pct: 98 }), Math.round((98 * 72.4 + 20 * 50) / 118));
  assert.equal(likabilityFrom({ liked_share_of_aware: 1, fame_pct: 1 }) < 55, true, "an unknown name is pulled to 50");
  assert.equal(likabilityFrom(null), null);
  assert.equal(likabilityFrom({ fame_pct: 50 }), null);
  assert.equal(quadrantOf(60, 40), "TRUSTED RESERVE");
  // judge states
  const m = { warmth: 43, competence: 60, quadrant: "ENVIED", judge: "UNRATIFIED" };
  const jfk = judged(m, { likability: 69 });
  assert.equal(jfk.judge, "CONTESTED"); assert.equal(jfk.people.quadrant, "ADMIRED"); assert.equal(jfk.people.gap, 26);
  assert.equal(judged(m, { likability: 45 }).judge, "RATIFIED");
  assert.equal(judged(m, null).judge, "UNRATIFIED");
  assert.equal(judged({ ...m, quadrant: "UNPLACED" }, { likability: 80 }).judge, "UNRATIFIED", "no placement, no judgment");
  // gap lines at the thresholds
  assert.match(gapLine(GAP_THRESHOLD), /Public affection exceeds the record/);
  assert.match(gapLine(-GAP_THRESHOLD), /The record exceeds the affection/);
  assert.match(gapLine(19), /roughly agree/);
  // seeded figures: JFK carries YouGov likability and comes out contested (charm over conduct)
  const JFK = FAMOUS_FIGURES.find(f => f.name === "JFK");
  assert.equal(JFK.people.source, "YouGov US ratings");
  // the seeded People view produces real gaps both ways (which figures sit where moves with
  // each rescore; the 2026-09-25 rescore lifted JFK's conduct 43 -> 53, gap 26 -> 16)
  const gaps = FAMOUS_FIGURES.filter(f => f.people).map(f => judged({ warmth: f.warmth, competence: f.competence, quadrant: f.quadrant }, f.people).people.gap);
  assert.ok(gaps.some(g => g >= GAP_THRESHOLD), "someone's public affection exceeds the record");
  assert.ok(gaps.some(g => g <= -GAP_THRESHOLD), "someone's record exceeds the affection");
  assert.ok(FAMOUS_FIGURES.filter(f => f.people).length >= 30, "most figures have a People view");
  // the headline never moves with the People view
  for (const f of FAMOUS_FIGURES) assert.equal(f.score, computeScore(f.breakdown, f.harm?.severity), `${f.name}: score is the machine's alone`);
  // cube-points.json is regenerated from the same data
  const fs = await import("node:fs");
  const pts = JSON.parse(fs.readFileSync(new URL("../docs/methodology/cube-points.json", import.meta.url))).points;
  assert.equal(pts.length, FAMOUS_FIGURES.length);
  assert.equal(pts.find(p => p.name === "JFK").people.likability, JFK.people.likability);
}


// ---- citizen file photos: every enum renders, frames differ, junk never draws ----
{
  const { avatarPixels, avatarPalette, AVATAR_ENUMS, DEFAULT_SPEC, sanitizeSpec } = await import("../src/avatar.js");
  const { splitPhotoExchange } = await import("../netlify/lib/avatar.js");
  const vals = (k) => (Array.isArray(AVATAR_ENUMS[k]) ? AVATAR_ENUMS[k] : Object.keys(AVATAR_ENUMS[k]));
  for (const k of ["hair_style", "accessory", "facial_hair", "build", "skin", "hair_color", "top_color"]) {
    for (const v of vals(k)) {
      const spec = { ...DEFAULT_SPEC, [k]: v };
      const px = avatarPixels(spec, 0), pal = avatarPalette(spec);
      assert.equal(px.length, 32 * 48, `${k}=${v} is a full sprite`);
      const used = new Set(px);
      for (const i of used) assert.ok(i === 0 || pal[i], `${k}=${v} uses only palette slots that exist (slot ${i})`);
      assert.ok([...px].filter(x => x).length > 300, `${k}=${v} draws a body`);
    }
  }
  const a0 = avatarPixels(DEFAULT_SPEC, 0), a1 = avatarPixels(DEFAULT_SPEC, 1);
  assert.ok(a0.some((v, i) => v !== a1[i]), "the stride frame differs from the standing frame");
  assert.deepEqual([...avatarPixels({ skin: "<svg>", accessory: "gun" }, 0)], [...avatarPixels(DEFAULT_SPEC, 0)], "junk values draw the default");
  assert.equal(sanitizeSpec(null), null);
  // the photo exchange is found by the Officer's wording, answer and all
  const t = [{ role: "agent", text: "Q1" }, { role: "user", text: "A1" }, { role: "agent", text: "For the file photo, then. What do you look like?" }, { role: "user", text: "tall, red coat" }, { role: "agent", text: "Filed." }];
  const sp = splitPhotoExchange(t);
  assert.equal(sp.description, "tall, red coat");
  assert.deepEqual(sp.rest.map(m => m.text), ["Q1", "A1", "Filed."]);
  assert.equal(splitPhotoExchange(t.slice(0, 2)).description, null, "no photo question, no description");
}

console.log("check-pen: ok");

// Graded bottom on the real roster (Scott 2026-09-25).
{
  const { harmGated } = await import("../netlify/lib/intake.js");
  const by = n => FAMOUS_FIGURES.find(f => f.name === n);
  const gated = FAMOUS_FIGURES.filter(f => harmGated(f.breakdown));
  const free = FAMOUS_FIGURES.filter(f => !harmGated(f.breakdown));
  const maxGated = Math.max(...gated.map(f => f.score)), minFree = Math.min(...free.map(f => f.score));
  assert.ok(maxGated < minFree, `every gated file sits below every ungated one (${maxGated} vs ${minFree})`);
  assert.ok(new Set(gated.map(f => f.score)).size > 3, "the bottom is graded, not one flat number");
  for (const n of ["Genghis Khan", "Mao Zedong"]) assert.ok(by(n).score <= 10, `${n} near the bottom (${by(n).score})`);
  const ep = by("Jeffrey Epstein"), gm = by("Ghislaine Maxwell");
  const rank = ["instrument", "enabled", "direct", "directed"];
  const moreCulpable = rank.indexOf(ep.harm.severity.role) > rank.indexOf(gm.harm.severity.role) ? ep : gm;
  const other = moreCulpable === ep ? gm : ep;
  assert.ok(moreCulpable.score < other.score, "Epstein and Maxwell ordered by role: the more culpable sits lower");
}
console.log("check-pen: graded bottom ok");
