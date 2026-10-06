// Applies a Department method change (a new calibration) to everything scored under the old
// one, and logs it as the Department's change, not the subject's (Scott, 2026-09-28).
//
//   figures.js   formula rescore + scoreHistory entry (cause "method"), via calibration-lib
//   hvi-figures  every production card (etag), then its index entry re-derived (syncIndex)
//   hvi-cases    each citizen gets a history entry {kind:"recalibration", cause:"method"}:
//                not a visit, not capped, not an appeal. The score moves by exactly the change
//                the new formula makes to their breakdown, so a held cap remainder is kept.
//   hvi-pen      citizen cards + index mirror the new score/tier
//
// Used by scripts/recalibrate.mjs (a one-off method change) and calibrate.mjs (an approved
// weekly proposal).
import { store, syncIndex } from "./roster/prod.mjs";
import * as L from "./calibration-lib.mjs";
import { appendFigureHistory, publicHistory } from "../src/movement.js";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const HIST_KEEP = 40;

async function retry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries || !/fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(String(e?.message || e) + String(e?.cause?.code || ""))) throw e;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}
// read-modify-write under an etag
async function update(s, key, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await retry(() => s.getWithMetadata(key, { type: "json" }));
    if (!cur?.data) return null;
    const next = fn(structuredClone(cur.data));
    if (next === undefined) return cur.data;
    const res = await retry(() => s.setJSON(key, next, { onlyIfMatch: cur.etag }));
    if (res.modified) return next;
  }
  throw new Error(`${key}: lost the write race six times`);
}

// Production figure cards and the index.
export async function applyToCards(prev, next, log, { dry = false } = {}) {
  const figs = store("hvi-figures");
  const { blobs } = await retry(() => figs.list());
  const changed = new Map();
  for (const { key } of blobs) {
    if (key === "index") continue;
    const card = await retry(() => figs.get(key, { type: "json" }));
    if (!card || card.removed || !card.breakdown) continue;
    const score = L.scoreWith(next, card.breakdown, card.harm?.severity, card.harmReview), q = L.cubeWith(next, card.breakdown);
    const tier = L.tierWith(next, score);
    if (!log.always && score === card.score && tier === card.tier) continue;
    const upd = {
      score, tier, warmth: q.warmth, competence: q.competence, scarcity: q.scarcity, quadrant: q.quadrant,
      scoreHistory: appendFigureHistory(card.scoreHistory, { at: log.at, score, tier, cause: log.cause, note: log.note, method: log.method },
        { at: card.at || null, score: card.score, tier: card.tier, note: "On file before the Department's revision.", method: log.fromMethod || null }).slice(-HIST_KEEP),
    };
    changed.set(card.slug || key, { from: card.score, to: score, fromTier: card.tier, tier, name: card.name, upd });
    if (!dry) await update(figs, key, c => ({ ...c, ...upd }));
  }
  if (!dry && changed.size) {
    await syncIndex([...changed.keys()]);
  }
  return [...changed.values()].map(({ upd, ...r }) => r);
}

// Citizens: one recalibration entry per file whose score or tier moves.
export async function applyToCitizens(prev, next, log, { dry = false } = {}) {
  const casesS = store("hvi-cases"), pen = store("hvi-pen");
  const { blobs } = await retry(() => casesS.list());
  const out = [];
  for (const { key } of blobs) {
    let row = null;
    const write = rec => {
      const hs = (rec.history || []).filter(h => h && !h.voided && typeof h.score === "number");
      const last = hs[hs.length - 1];
      if (!last || !last.breakdown) return undefined;
      const b = last.breakdown;
      const d = L.scoreWith(next, b) - L.scoreWith(prev, b);
      const score = clamp(last.score + d, 0, 1000);
      const tier = L.tierWith(next, score);
      if (score === last.score && tier === last.tier) return undefined;
      const q = L.cubeWith(next, b);
      const entry = {
        at: log.at, kind: "recalibration", cause: log.cause, note: log.note, method: log.method,
        score, tier, delta: score - last.score, warmth: q.warmth, competence: q.competence, scarcity: q.scarcity, quadrant: q.quadrant,
        breakdown: b, confidence: last.confidence ?? null, verdict: last.verdict, flags: last.flags || [], commendations: last.commendations || [],
        rubric: last.rubric, provisional: Boolean(last.provisional), provisionalNote: last.provisionalNote || null,
        ...(last.simulated ? { simulated: true } : {}), asked: [],
      };
      row = { caseId: key, from: last.score, to: score, fromTier: last.tier, tier, q };
      return { ...rec, history: [...rec.history, entry] };
    };
    if (dry) {
      const rec = await retry(() => casesS.get(key, { type: "json" }));
      if (rec) write(rec);
    } else {
      await update(casesS, key, write);
    }
    if (!row) continue;
    out.push({ caseId: row.caseId, from: row.from, to: row.to, fromTier: row.fromTier, tier: row.tier });
    if (dry) continue;
    const penKey = `citizen:${key}`;
    const upd = { score: row.to, tier: row.tier, warmth: row.q.warmth, competence: row.q.competence, scarcity: row.q.scarcity, quadrant: row.q.quadrant };
    await update(pen, penKey, c => ({ ...c, ...upd })).catch(() => null);
    await update(pen, "index", idx => ({ ...idx, cards: (idx.cards || []).map(c => (c.key === penKey ? { ...c, ...upd } : c)) })).catch(() => null);
  }
  return out;
}

export { publicHistory };
