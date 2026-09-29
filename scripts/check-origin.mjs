// Birth country on every subject (src/origin.js) and the roster engine's region steering.
import assert from "node:assert/strict";
import { COUNTRIES, REGIONS, worldShare, normOrigin, regionOf, countryOf, representation, regionWeights, pickRegion, countriesIn } from "../src/origin.js";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { publicFigure } from "../netlify/lib/refer.js";
import { figureIndexEntry } from "../netlify/lib/store.js";

// table: every region has countries, shares sum to 1, dead states map to successors
for (const r of REGIONS) assert.ok(countriesIn(r).length > 0, r);
assert.ok(Math.abs(REGIONS.reduce((a, r) => a + worldShare(r), 0) - 1) < 1e-9);
assert.ok(Object.values(COUNTRIES).every(([, r]) => REGIONS.includes(r)));
assert.equal(normOrigin("sun"), "RUS");
assert.equal(normOrigin("XXX"), null);
assert.equal(regionOf({ origin: "IND" }), "SOUTH ASIA");
assert.equal(countryOf({ origin: "USA" }), "United States");
assert.equal(regionOf({}), null);

// every figure on record carries a known origin
const bare = FAMOUS_FIGURES.filter(f => !regionOf(f)).map(f => f.name);
assert.deepEqual(bare, [], `figures without origin: ${bare}`);

// representation: shares sum to 1, gap = world - file, sorted by gap; unknowns counted apart
const subjects = [{ origin: "USA" }, { origin: "USA" }, { origin: "CAN" }, { origin: "IND" }, {}];
const rep = representation(subjects);
assert.equal(rep.n, 4); assert.equal(rep.unknown, 1);
assert.ok(Math.abs(rep.rows.reduce((a, r) => a + r.file, 0) - 1) < 1e-9);
assert.equal(rep.rows.find(r => r.region === "NORTH AMERICA").count, 3);
for (let i = 1; i < rep.rows.length; i++) assert.ok(rep.rows[i - 1].gap >= rep.rows[i].gap);

// steering: over-sampled regions get no weight, the biggest shortfall gets the most
const w = regionWeights(subjects);
assert.equal(w["NORTH AMERICA"], 0);
assert.equal(Object.entries(w).sort((a, b) => b[1] - a[1])[0][0], "EAST ASIA");   // IND on file, so East Asia is thinnest
assert.equal(pickRegion({ A: 0, B: 1 }, () => 0.99), "B");
assert.equal(pickRegion({ A: 1, B: 1 }, () => 0.1), "A");
// a file that matches the planet draws by population
const planet = REGIONS.flatMap(r => Array.from({ length: Math.round(worldShare(r) * 1000) }, () => ({ origin: Object.entries(COUNTRIES).find(([, [, rr]]) => rr === r)[0] })));
const wp = regionWeights(planet);
assert.ok(wp["SOUTH ASIA"] > wp.OCEANIA && wp.OCEANIA > 0);

// the field survives the API and the index; junk is dropped
assert.equal(publicFigure({ slug: "x", name: "X", score: 500, origin: "JPN" }).origin, "JPN");
assert.equal(publicFigure({ slug: "x", name: "X", score: 500, origin: "<b>" }).origin, null);
assert.equal(figureIndexEntry({ slug: "x", origin: "JPN" }).origin, "JPN");
// stature for sprites to scale: passes through the API and the index, junk dropped
assert.equal(publicFigure({ slug: "x", name: "X", score: 500, height: 224, sex: "m" }).height, 224);
assert.equal(publicFigure({ slug: "x", name: "X", score: 500, height: "tall", sex: "x" }).sex, null);
assert.equal(figureIndexEntry({ slug: "x", height: 170, sex: "f" }).sex, "f");
assert.ok(FAMOUS_FIGURES.every(f => "sex" in f), "every figure on record carries stature fields");
console.log("check-origin: ok");
