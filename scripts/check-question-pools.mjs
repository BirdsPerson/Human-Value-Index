// node scripts/check-question-pools.mjs — every dimension has a full, unique pool.
import assert from "node:assert/strict";
import { DIMENSIONS, POOLS } from "../netlify/lib/questionPools.js";

assert.deepEqual(Object.keys(POOLS).sort(), [...DIMENSIONS].sort(), "pool keys must match DIMENSIONS");
const all = [];
for (const d of DIMENSIONS) {
  assert.ok(POOLS[d].length >= 8 && POOLS[d].length <= 10, `${d}: 8-10 questions`);
  for (const q of POOLS[d]) {
    assert.equal(typeof q, "string");
    assert.ok(q.trim().length > 10 && !/\n/.test(q), `${d}: one-line question: ${q}`);
    all.push(q);
  }
}
assert.equal(new Set(all).size, all.length, "no duplicate questions across pools");
console.log(`check-question-pools: ok (${all.length} questions)`);
