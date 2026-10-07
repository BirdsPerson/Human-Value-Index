// THE COURTS engine, players.js: ratings spread over skills by archetype, positions and builds, a player record.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { clamp, C, dirOf } from "./court.js";
import { hashStr } from "./state.js";

// The icons over your teammates while RB is held: the four teammates in roster order wear A, B, X, Y.
export const ICONS = ["A", "B", "X", "Y"];
// ---- ratings ---------------------------------------------------------------------------------------
// The league gives one rating; the game spreads it over the skills by archetype (cfg row [3] when
// the page knows the player, else from the key's hash), plus a small fixed jitter per skill.
export const ARCHES = {
  guard: { three: 5, mid: 3, close: -2, dunk: -14, handle: 9, perD: 3, intD: -10, block: -14, steal: 6, ft: 7, pass: 7, spd: 0.35, h: -0.12, leap: 0 },
  wing: { three: 2, mid: 3, close: 2, dunk: 1, handle: 3, perD: 5, intD: -2, block: -3, steal: 3, ft: 3, pass: 0, spd: 0.2, h: 0.02, leap: 0.03 },
  slasher: { three: -6, mid: 0, close: 6, dunk: 6, handle: 5, perD: 0, intD: 0, block: 0, steal: 2, ft: -2, pass: 0, spd: 0.3, h: 0, leap: 0.08 },
  big: { three: -14, mid: -3, close: 7, dunk: 9, handle: -12, perD: -8, intD: 10, block: 12, steal: -6, ft: -9, pass: -4, spd: -0.3, h: 0.2, leap: 0 },
};
export const ARCH_ORDER = ["guard", "wing", "wing", "slasher", "big", "guard", "big", "wing"];
export const SKILLS = ["three", "mid", "close", "dunk", "handle", "perD", "intD", "block", "steal", "ft", "pass"];
export const sk = (v) => clamp((v - 40) / 55, 0, 1);
export function abilities(r, key = "", arch = null) {
  const h = hashStr(String(key));
  const a = ARCHES[arch] ? arch : ARCH_ORDER[h % ARCH_ORDER.length];
  const A = ARCHES[a], k = clamp((r - 35) / 60, 0, 1);
  const R = {};
  SKILLS.forEach((s, i) => { R[s] = clamp(Math.round(r + A[s] + (((h >>> (i % 24)) % 7) - 3)), 25, 99); });
  const S = {};
  for (const s of SKILLS) S[s] = sk(R[s]);
  return { arch: a, R, S, k, spd: 4.9 + 2.5 * k + A.spd, leap: 0.4 + 0.45 * k + A.leap, dunker: R.dunk >= 75, h: 1.9 + 0.2 * k + A.h, def: (S.perD + S.intD) / 2 };
}
// Positions: from the roster's own (row [4]) when it has one, else from the archetype and height. The
// build (bw, the width of the frame, 1 = a wing) follows the position; both are for telling players
// apart on the floor and for the icons, and do not touch the ratings.
export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const BUILD = { PG: 0.82, SG: 0.88, SF: 0.95, PF: 1.08, C: 1.22 };
export const POS_ARCH = { PG: "guard", SG: "guard", SF: "wing", PF: "slasher", C: "big" };
export function positionOf(arch, h) {
  if (arch === "guard") return h < 1.9 ? "PG" : "SG";
  if (arch === "wing") return h < 1.99 ? "SG" : "SF";
  if (arch === "slasher") return h < 2.02 ? "SF" : "PF";
  return h < 2.2 ? "PF" : "C";
}
export function mkPlayer(t, i, row, n = 5, half = false) {
  const [key, name, r, arch0, pos0, hand] = row;
  const arch = ARCHES[arch0] ? arch0 : POS_ARCH[pos0] || null;
  const ab = abilities(r | 0, key, arch), pos = POSITIONS.includes(pos0) ? pos0 : positionOf(ab.arch, ab.h);
  const d = half ? 1 : dirOf(t);
  return {
    t, i, g: t * n + i, d, pos, bw: BUILD[pos], lefty: hand === "L", passF: -99, key: String(key), name: String(name), r: r | 0, ...ab,
    x: 0, y: 0, z: 0, vz: 0, vx: 0, vy: 0, face: d, mv: 0, act: null, cool: 0, jx: 0, jy: 0, jt: 0, hold: 0, think: 0, plan: null, jumpAt: -1,
    sta: 1, pf: 0, still: 0, hands: 0, stumble: 0, screened: 0, burst: 0, heat: 0, moveCool: 0, caught: -999, lastMove: -999, sb: 0, cut: null, close: 0,
    streak: 0, hot: false, charge: 0, intense: false, sprint: false, post: false, ld: 0, ldEnd: -99, ldStart: -99,
  };
}
