// The record: {v, cfg, logs: [rle per seat]}. cfg is the permit exactly as it was issued (a local
// practice cfg in D1; the server signs it from D2): {runId, theme, level, entry, day, cleared,
// seats: [caseHash], seed, at, v, hand, controls}. hand is metadata the sim never reads.
export function rleEncode(words) { const out = []; for (const m of words) { const n = out.length; if (n && out[n - 2] === m) out[n - 1]++; else out.push(m, 1); } return out; }
export function rleDecode(rle) { const out = []; for (let i = 0; i < rle.length; i += 2) for (let k = 0; k < rle[i + 1]; k++) out.push(rle[i]); return out; }
export function logTicks(rle) { let n = 0; for (let i = 1; i < rle.length; i += 2) n += rle[i]; return n; }
export const MAX_LOG_PER_SEAT = 150000;
// A well-formed log: pairs of non-negative integers, words inside 22 bits, runs >= 1, not too long.
export function validLog(rle) {
  if (!Array.isArray(rle) || rle.length % 2 || rle.length > MAX_LOG_PER_SEAT) return false;
  for (let i = 0; i < rle.length; i += 2) { const w = rle[i], n = rle[i + 1]; if (!Number.isInteger(w) || w < 0 || w >= 1 << 22 || !Number.isInteger(n) || n < 1) return false; }
  return true;
}
export const CFG_KEYS = ["runId", "theme", "level", "entry", "day", "cleared", "seats", "seed", "at", "v", "hand", "controls"];
