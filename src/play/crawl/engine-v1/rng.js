// The crawl's randomness: fnv over one string, mulberry32 as a pure step, and named sub-streams so a
// draw-order change in one (the AI's, the loot's) can never move a wall (docs/design/DUNGEON.md 3.2).
// A stream is a plain number kept in the state (st.rng[name]), so a JSON snapshot carries it exactly.

export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// mulberry32 as a pure step: (state) -> [value in 0..1, next state]
export function rngStep(s) {
  const n = (s + 0x6d2b79f5) >>> 0;
  let t = n;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, n];
}
// A stream object {s}: draw() advances it in place. Generation makes its own from the floor seed.
export const stream = (seed) => ({ s: seed >>> 0 });
export function draw(r) { const [v, n] = rngStep(r.s); r.s = n; return v; }
export const drawInt = (r, lo, hi) => lo + Math.floor(draw(r) * (hi - lo + 1));   // inclusive
export const chance = (r, p) => draw(r) < p;
export function pick(r, arr) { return arr[Math.floor(draw(r) * arr.length)]; }
// a state's named stream: st.rng = {loot, ai}
export function sdraw(st, name) { const [v, n] = rngStep(st.rng[name]); st.rng[name] = n; return v; }
// in-place shuffle with a fixed draw order
export function shuffle(r, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(draw(r) * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
