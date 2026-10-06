// THE SUBSTRATE VOTES (Scott 2026-09-30: "NPCs vote in the Assembly, and may abstain"). Rule
// chosen: PLAYERS DECIDE, NPCs ADVISORY. Every subject in the census casts one advisory ballot
// per motion (or abstains), from their record alone: their fields, their tier, their values,
// their district's mood, and whom they are tied to on file. Pure and deterministic: the same
// subject, motion and moods give the same ballot on every machine. No model, no free text:
// the reasons come from the same fixed list the players pick from.
//
// A motion (content.js SUBSTRATE for session 001, content002.js for the resort lots):
//   {session, id, choices: [a, b], applicants: {choice: slug}, leans: {choice: {fields: {field: w},
//    band: [top, middle, low], dims: {dim: w}, reasons: {REASON: prior}, reasonFields: {REASON: [fields]}}}}
// The board shows the sum only. No subject's advisory ballot is published by name: the living
// are not quoted here, and they are not polled by name either.
import * as SIM from "../city/sim.js";
import { TIES } from "../city/social.js";
import { moodWord } from "../city/civic.js";

export const REASONS = ["JOBS", "LEISURE", "FOOD", "LAND", "BEAUTY", "SPITE"];
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(`substrate|${s}`) / 4294967296;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// slug -> [[other, affinity]] from the ties on file (Wikidata's and the hand-curated ones).
let TIE_MAP = null;
export function tiesOf(key) {
  if (!TIE_MAP) {
    TIE_MAP = new Map();
    const seen = new Set();
    for (const [a, b, aff] of TIES) {
      const pk = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(pk)) continue;   // the first listing of a pair wins (social.js TIES)
      seen.add(pk);
      (TIE_MAP.get(a) || TIE_MAP.set(a, []).get(a)).push([b, aff]);
      (TIE_MAP.get(b) || TIE_MAP.set(b, []).get(b)).push([a, aff]);
    }
  }
  return TIE_MAP.get(key) || [];
}

// The values the record shows: the breakdown for a figure; a citizen's two public axes only.
function valuesOf(s) {
  const b = s?.kind === "citizen" ? null : s?.breakdown;
  if (b && typeof b.care === "number") return b;
  const w = typeof s?.warmth === "number" ? s.warmth : 50, c = typeof s?.competence === "number" ? s.competence : 50;
  return { care: w, network: w * 0.92, alignment: w * 0.88, utility: c, adaptability: c * 0.95, legacy: (w + c) * 0.4, physical: 40, threat: 30 };
}
const bandOf = (s) => { const t = SIM.classOf(s); return t <= 1 ? 0 : t <= 3 ? 1 : 2; };   // housing class (0..5), under the ladder in force

// One subject's advisory ballot on one motion.
// ctx: {moods: {districtId: mood score} | null}
// -> {choice: id | null, reasons: [..], abstain: null | "RECUSED" | "ABSTAINED"}
export function substrateBallot(s, motion, ctx = {}) {
  const key = SIM.keyOf(s), tag = `${motion.session}|${motion.id}|${key}`;
  const [A, B] = motion.choices;
  // an applicant does not vote on their own application (recused), nor do their rivals' files
  // get to be the tiebreak: a recusal is not an abstention, and is counted apart
  if (Object.values(motion.applicants || {}).includes(key)) return { choice: null, reasons: [], abstain: "RECUSED" };
  const f = SIM.fieldsOf(s), band = bandOf(s), v = valuesOf(s);
  const district = SIM.assignJob(s).district;
  const mood = ctx.moods && Number.isFinite(ctx.moods[district]) ? moodWord(ctx.moods[district]) : null;
  const angry = mood === "SEETHING" || mood === "RESTLESS";
  // SPITE: a grudge against an applicant above all; then a seething district, the bottom of the ladder
  let grudge = false;
  const sc = {};
  for (const c of motion.choices) {
    const L = motion.leans[c];
    let x = L.band[band] || 0;
    for (const [field, w] of Object.entries(L.fields)) if (f[field]) x += (f[field] / 10) * w;
    for (const [dim, w] of Object.entries(L.dims || {})) if (typeof v[dim] === "number") x += ((v[dim] - 50) / 50) * w;
    sc[c] = x;
  }
  // ties on file: friends of an applicant lean with them; a grudge leans the other way, spitefully
  for (const [other, aff] of tiesOf(key)) for (const c of motion.choices) {
    if (motion.applicants?.[c] !== other) continue;
    if (aff > 0) sc[c] += aff / 20;
    else { sc[c === A ? B : A] += -aff / 20; grudge = true; }
  }
  // a restless or seething district leans against whatever the top of the ladder would have
  if (angry) { const lowPick = (motion.leans[A].band[0] || 0) >= (motion.leans[B].band[0] || 0) ? B : A; sc[lowPick] += mood === "SEETHING" ? 0.5 : 0.25; }
  for (const c of motion.choices) sc[c] += (h01(`${tag}|${c}`) - 0.5) * 1.1;
  // abstention: the unconnected, the threatening, the bottom of the ladder, the indifferent
  const p = clamp(0.08 + (v.network < 45 ? 0.14 : 0) + ((v.threat ?? 0) >= 60 ? 0.12 : 0) + (band === 2 ? 0.08 : 0) + (mood === "INDIFFERENT" ? 0.08 : 0)
    + (Math.abs(sc[A] - sc[B]) < 0.12 ? 0.25 : 0), 0, 0.7);
  if (h01(`${tag}|abstain`) < p) return { choice: null, reasons: [], abstain: "ABSTAINED" };
  const choice = sc[A] >= sc[B] ? A : B;
  // reasons: the lean's priors, the fields behind each, a hash to break the rest
  const L = motion.leans[choice];
  const rs = REASONS.map(r => {
    let x = L.reasons?.[r] ?? 0;
    for (const field of L.reasonFields?.[r] || []) if (f[field]) x += f[field] / 10;
    if (r === "SPITE") x = (grudge ? 2.5 : 0) + (mood === "SEETHING" ? 1.0 : mood === "RESTLESS" ? 0.4 : 0) + (band === 2 ? 0.6 : 0) - 0.5;
    return [r, x + h01(`${tag}|r|${r}`) * 0.8];
  }).filter(([, x]) => x > 0.2).sort((a, b) => b[1] - a[1]);
  const k = h01(`${tag}|nr`), n = k < 0.45 ? 1 : k < 0.85 ? 2 : 3;
  const reasons = (rs.length ? rs : [[L.fallback || "JOBS", 0]]).slice(0, n).map(([r]) => r);
  return { choice, reasons: REASONS.filter(r => reasons.includes(r)), abstain: null };
}

// The whole census on one motion: the board's shape (as the players' tally), plus who sat out.
// -> {votes: {choice: n}, reasons: {choice: {REASON: n}}, all: {REASON: n}, voters, abstained,
//     recused, n, winner (null on a level count), lead}
export function substrateTally(subjects, motion, ctx = {}) {
  const votes = Object.fromEntries(motion.choices.map(c => [c, 0]));
  const reasons = Object.fromEntries(motion.choices.map(c => [c, Object.fromEntries(REASONS.map(r => [r, 0]))]));
  const all = Object.fromEntries(REASONS.map(r => [r, 0]));
  let voters = 0, abstained = 0, recused = 0, n = 0;
  const seen = new Set();
  for (const s of subjects || []) {
    const key = SIM.keyOf(s);
    if (!s || seen.has(key)) continue;
    seen.add(key); n++;
    const b = substrateBallot(s, motion, ctx);
    if (b.abstain === "RECUSED") { recused++; continue; }
    if (!b.choice) { abstained++; continue; }
    voters++; votes[b.choice]++;
    for (const r of b.reasons) { reasons[b.choice][r]++; all[r]++; }
  }
  const [A, B] = motion.choices;
  return { votes, reasons, all, voters, abstained, recused, n, winner: votes[A] === votes[B] ? null : votes[A] > votes[B] ? A : B };
}
