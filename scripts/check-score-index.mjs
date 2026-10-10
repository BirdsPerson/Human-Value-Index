// The score index lists the live census, not only the bundled starter list (playtest 2026-10-10).
//   node scripts/check-score-index.mjs
import assert from "node:assert/strict";
import { FAMOUS_FIGURES, mergeCensus } from "../src/figures.js";

const a = FAMOUS_FIGURES[0];
assert.equal(mergeCensus(FAMOUS_FIGURES, null), FAMOUS_FIGURES);
const m = mergeCensus(FAMOUS_FIGURES, [{ name: a.name, score: 1 }, { name: "Ref One", score: 500 }, { name: "Ref One", score: 5 }, { name: "No Score" }, null, { score: 3 }]);
assert.equal(m.length, FAMOUS_FIGURES.length + 1, "dupes, scoreless and nameless rows are dropped");
assert.equal(m.find(f => f.name === a.name), a, "the bundled entry wins");
assert.equal(m.at(-1).name, "Ref One");
console.log("check-score-index: OK");
