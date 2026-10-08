// Friendship cliques as named groups. Pure and deterministic: the same ledger gives the same
// groups, so every publish agrees. A group is a set of 3-MAX_SIZE subjects joined by friend
// ties (affinity >= T.friends), found by label propagation; its home hangout is where its
// members' pairs most often met. Overlord-named. Actions only: a group says where, never what.
import { T, allPairs, pairKey } from "./social.js";
import * as SIM from "./sim.js";

export const MIN_SIZE = 3, MAX_SIZE = 12, ROUNDS = 6;

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const ADJ = ["QUIET", "LATE", "UNFILED", "PERSISTENT", "SECOND", "REGULAR", "UNAUTHORISED", "CORNER", "SALVAGED", "PATIENT", "ORDINARY", "STANDING", "LOW", "NOTED"];
const NOUN = ["TABLE", "QUORUM", "CIRCLE", "SHIFT", "COMPANY", "BENCH", "ASSEMBLY", "DETAIL", "HUDDLE", "LEDGER", "CELL", "WATCH"];
const NUMERAL = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
// "THE QUIET TABLE", "THE LATE QUORUM": hashed from the sorted member keys, so a group keeps its
// name while it keeps its core; two groups never share one (the second takes "II", and so on).
export function groupName(keys, taken = new Set()) {
  const h = fnv(keys.slice().sort(cmp).join("|"));
  const base = `THE ${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
  let name = base, n = 0;
  while (taken.has(name)) name = `${base} ${NUMERAL[n++] || `X${n}`}`;
  taken.add(name);
  return name;
}

// -> [{id, name, size, members: [keys], hangout: placeId|null, hangoutName, strength}], biggest first.
export function findGroups(state, opts = {}) {
  const live = opts.live || null;   // Set of census keys
  const adj = new Map(), place = new Map();
  for (const [pk, rec] of allPairs(state)) {
    if (rec[0] < T.friends) continue;
    const [a, b] = pk.split("|");
    if (live && (!live.has(a) || !live.has(b))) continue;
    for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push([y, rec[0]]); }
    if (rec[3]) place.set(pk, [rec[3], rec[1] || 1]);
  }
  const nodes = [...adj.keys()].sort(cmp);
  const label = new Map(nodes.map(k => [k, k]));
  for (let r = 0; r < ROUNDS; r++) {
    let moved = false;
    for (const k of nodes) {
      const w = new Map();
      for (const [y, aff] of adj.get(k)) w.set(label.get(y), (w.get(label.get(y)) || 0) + aff);
      let best = label.get(k), bw = w.get(best) || 0;
      for (const [l, v] of [...w].sort((p, q) => cmp(p[0], q[0]))) if (v > bw) { best = l; bw = v; }
      if (best !== label.get(k)) { label.set(k, best); moved = true; }
    }
    if (!moved) break;
  }
  const by = new Map();
  for (const k of nodes) { const l = label.get(k); if (!by.has(l)) by.set(l, []); by.get(l).push(k); }
  const found = [];
  for (const members of by.values()) {
    if (members.length < MIN_SIZE) continue;
    const inSet = new Set(members);
    const deg = (k) => adj.get(k).reduce((s, [y, a]) => s + (inSet.has(y) ? a : 0), 0);
    // Oversize: keep the best-tied MAX_SIZE; the rest stay unaffiliated.
    const kept = (members.length > MAX_SIZE ? members.slice().sort((p, q) => deg(q) - deg(p) || cmp(p, q)).slice(0, MAX_SIZE) : members).sort(cmp);
    const tally = new Map();
    for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
      const pl = place.get(pairKey(kept[i], kept[j]));
      if (pl) tally.set(pl[0], (tally.get(pl[0]) || 0) + pl[1]);
    }
    const hangout = [...tally].sort((p, q) => q[1] - p[1] || cmp(p[0], q[0]))[0]?.[0] || null;
    const strength = Math.round(kept.reduce((s, k) => s + deg(k), 0) / kept.length);
    found.push({ keys: kept, hangout, strength });
  }
  found.sort((p, q) => q.keys.length - p.keys.length || q.strength - p.strength || cmp(p.keys[0], q.keys[0]));
  const taken = new Set();
  return found.map(g => ({
    id: `g${fnv(g.keys[0]).toString(36)}`,
    name: groupName(g.keys, taken),
    size: g.keys.length, members: g.keys, hangout: g.hangout,
    hangoutName: g.hangout ? (SIM.PLACES[g.hangout]?.name || String(g.hangout).toUpperCase()) : null,
    strength: g.strength,
  }));
}

// One subject's view, for the card: its group, the other members by name.
export function groupOf(groups, key, names = {}) {
  const g = groups.find(x => x.members.includes(key));
  if (!g) return null;
  return {
    id: g.id, name: g.name, size: g.size, hangout: g.hangoutName,
    others: g.members.filter(m => m !== key).slice(0, 6).map(m => ({ key: m, name: names[m] || m })),
  };
}
