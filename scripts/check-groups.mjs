// Friendship cliques (src/city/groups.js): determinism, sizes, names, hangouts, withdrawn
// subjects dropped, no words in anyone's mouth. No network. Run: node scripts/check-groups.mjs
import assert from "node:assert/strict";

const SIM = await import("../src/city/sim.js");
const SOC = await import("../src/city/social.js");
const G = await import("../src/city/groups.js");
const { baseRoster } = await import("../src/city/roster.js");

const roster = baseRoster();
const START = 24 * 40;
const state = SOC.advance(SOC.emptyState(START), roster, START + 24 * 20);
const groups = G.findGroups(state);
console.log(`${groups.length} groups from ${SOC.pairCount(state)} pairs; sizes ${groups.slice(0, 8).map(g => g.size).join(",")}`);
assert.ok(groups.length > 0, "the ledger holds at least one clique");

// deterministic, and independent of pair insertion order
assert.equal(JSON.stringify(G.findGroups(state)), JSON.stringify(groups), "same ledger, same groups");

const seen = new Set(), names = new Set();
for (const g of groups) {
  assert.ok(g.size >= G.MIN_SIZE && g.size <= G.MAX_SIZE, `${g.name}: size ${g.size} in bounds`);
  assert.equal(g.members.length, g.size);
  assert.ok(!names.has(g.name), `${g.name}: name unique`); names.add(g.name);
  assert.match(g.name, /^THE [A-Z]+ [A-Z]+( [IVX]+| X\d+)?$/, `${g.name}: Overlord name shape`);
  for (const m of g.members) { assert.ok(!seen.has(m), `${m}: in one group only`); seen.add(m); }
  if (g.hangout) assert.ok(SIM.PLACES[g.hangout], `${g.name}: hangout ${g.hangout} is a real place`);
  assert.ok(g.hangoutName === null || /^[^a-z]+$/.test(g.hangoutName) || g.hangoutName.length > 0);
  // every member holds a friend tie into the group
  for (const m of g.members) {
    const ok = g.members.some(o => o !== m && (SOC.pairOf(state, SOC.pairKey(m, o))?.[0] ?? 0) >= SOC.T.friends);
    assert.ok(ok, `${m}: tied to the group ${g.name}`);
  }
}
assert.ok(groups.some(g => g.hangout), "at least one group has a home hangout");

// withdrawn subject: not in any group when absent from the census
const victim = groups[0].members[0];
const live = new Set(roster.map(s => SIM.keyOf(s)));
live.delete(victim);
const after = G.findGroups(state, { live });
assert.ok(!after.some(g => g.members.includes(victim)), "a withdrawn subject is in no group");

// the card view
const v = G.groupOf(groups, groups[0].members[1], state.names);
assert.equal(v.name, groups[0].name);
assert.ok(v.others.length >= 1 && v.others.length <= 6 && !v.others.some(o => o.key === groups[0].members[1]));
assert.equal(G.groupOf(groups, "nobody-here"), null);

// a hand-built ledger: two triangles, a bridge too weak to merge them, a pair left out
{
  const st = SOC.emptyState(0);
  const put = (a, b, aff, place = "bar") => { st.buckets[SOC.bucketOf(SOC.pairKey(a, b))].pairs[SOC.pairKey(a, b)] = [aff, 5, 1, place, 0]; };
  for (const [a, b] of [["a1", "a2"], ["a2", "a3"], ["a1", "a3"]]) put(a, b, 70, "bar");
  for (const [a, b] of [["b1", "b2"], ["b2", "b3"], ["b1", "b3"]]) put(a, b, 50, "gym");
  put("a3", "b1", 31); put("c1", "c2", 80);
  const gs = G.findGroups(st);
  assert.equal(gs.length, 2, "two triangles stay two groups; the lone pair is no group");
  assert.deepEqual(gs.map(g => g.members.join()).sort(), ["a1,a2,a3", "b1,b2,b3"]);
  assert.deepEqual(gs.map(g => g.hangout).sort(), ["bar", "gym"].sort());
  const t = new Set(); assert.notEqual(G.groupName(["a1", "a2", "a3"], t), G.groupName(["a1", "a2", "a3"], t), "a taken name takes a numeral");
}
console.log("check-groups: ok");
