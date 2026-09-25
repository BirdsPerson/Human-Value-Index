// Pure intake logic: case numbers, question picking, the jump cap, tiers.
// No I/O here so scripts/check-intake.mjs can exercise it without Netlify.
import { DIMENSIONS, POOLS } from "./questionPools.js";
import { WARMTH_AXIS, COMPETENCE_AXIS, REALITY_INDEX, axisMean, cube, CAL } from "../../src/cube.js";

// Tier thresholds come from calibration.json (src/figures.js reads the same file).
export const TIERS = CAL.tiers.map(t => ({ label: t.label, min: t.min }));

export function getTier(score) {
  return (TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1]).label;
}

export const MAX_JUMP = CAL.maxJump;

// Rubric 3: the machine cube. The axis math lives in src/cube.js so the browser plot and
// this score can never disagree.
export { WARMTH_AXIS, COMPETENCE_AXIS, REALITY_INDEX, cube };
// Effective per-dimension weights (for display, and the SYSTEM_PROMPT formula text).
export const WEIGHTS = Object.fromEntries([
  ...Object.entries(WARMTH_AXIS).map(([d, w]) => [d, w * (1 - REALITY_INDEX)]),
  ...Object.entries(COMPETENCE_AXIS).map(([d, w]) => [d, w * REALITY_INDEX]),
]);
// A dimension the evidence barely touched is UNASSESSED: excluded from the score, not
// guessed at. Unmeasured is not below average.
export const MIN_CONFIDENCE = CAL.minConfidence;
export const MIN_ASSESSED = CAL.minAssessed;
// Rubric version stamped on every history entry. 1 = legacy (pre care/unassessed rules,
// entries with no stamp), 2 = care-first single formula, 3 = the machine cube. A file's
// first visit under a new rubric is scored fresh.
export const RUBRIC = 3;
export const rubricOf = e => (typeof e?.rubric === "number" ? e.rubric : 1);
export const RETIRED_RUBRIC_NOTE = "SCORED UNDER A RETIRED RUBRIC. RE-ASSESSMENT RECOMMENDED.";

const isNum = v => typeof v === "number" && Number.isFinite(v);

// The Machine Score: round(10 * (0.45·W + 0.55·C)), then the harm gate. No assessed
// dimensions -> 500 (neutral, provisional).
export function computeScore(b, severity = null) {
  const w = axisMean(b, WARMTH_AXIS), c = axisMean(b, COMPETENCE_AXIS);
  if (w.value === null && c.value === null) return 500;
  const score = Math.round(10 * ((1 - REALITY_INDEX) * (w.value ?? 50) + REALITY_INDEX * (c.value ?? 50)));
  // A gated file is placed inside 0-cap by the severity of the documented harm; the rest of
  // the record no longer lifts it. Without a severity (interviews) it keeps the old clamp.
  if (harmGated(b)) { const g = severityScore(severity); return g ?? Math.min(score, HARM_GATE.cap); }
  return Math.max(0, Math.min(1000, seriousHarm(b) ? Math.min(score, HARM_GATE.seriousCap) : score));
}

// "Under 100 is reserved for actual monsters." A weighted average can't get a mass
// murderer there: ordinary competence numbers alone hold them above 100. Documented
// serious harm caps the file under 100 whatever the other sections say: near-zero care
// with near-maximal threat, or extreme threat on its own.
export const HARM_GATE = CAL.harmGate;
export const harmGated = b => isNum(b?.threat) && (b.threat >= HARM_GATE.threatAlone || (isNum(b?.care) && b.care <= HARM_GATE.care && b.threat >= HARM_GATE.threat));
// Serious but not gated (threat 80-89 without near-zero care): violent abuse, or a
// pre-modern ruler's dynastic killings. The file can't rise above MONITORED CIVILIAN;
// the rest of the record decides how far below.
export const seriousHarm = b => isNum(b?.threat) && isNum(HARM_GATE.seriousThreat) && b.threat >= HARM_GATE.seriousThreat;
// Graded bottom (calibration.json "severity"): scale, role, duration, accountability, each an
// enum. score = cap - sum(points), floored at 0. Directing harm weighs more than doing it, so
// those who controlled harm rank below their instruments, all else equal.
export const SEVERITY = CAL.severity;
export const SEVERITY_FIELDS = ["kind", "scale", "role", "duration", "accountability"];
export function validSeverity(sev) {
  if (!sev || typeof sev !== "object") return null;
  const out = {};
  for (const f of SEVERITY_FIELDS) {
    if (typeof sev[f] !== "string" || !(sev[f] in SEVERITY[f])) return null;
    out[f] = sev[f];
  }
  return out;
}
export function severityScore(sev, cal = { severity: SEVERITY, cap: HARM_GATE.cap }) {
  const v = validSeverity(sev);
  if (!v) return null;
  const pts = SEVERITY_FIELDS.reduce((t, f) => t + cal.severity[f][v[f]], 0);
  return Math.max(0, Math.round(cal.cap - pts));
}
// Median of several readings' severities, field by field, by rank; null unless most are valid.
export function medianSeverity(list) {
  const valid = list.map(validSeverity).filter(Boolean);
  if (valid.length * 2 <= list.length) return null;
  const out = {};
  for (const f of SEVERITY_FIELDS) {
    const order = Object.keys(SEVERITY[f]);
    const ranks = valid.map(s => order.indexOf(s[f])).sort((a, b) => a - b);
    out[f] = order[ranks[(ranks.length - 1) >> 1]];
  }
  return out;
}
export const assessedCount = b => Object.keys(WEIGHTS).filter(d => isNum(b?.[d])).length;

// ponytail: a case number is the whole identity. Anyone holding it is the subject.
// Email magic link comes later; until then a lost localStorage means a new file.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const CASE_ID_RE = /^HVI-[A-Z2-7]{8}$/;
export function newCaseId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "HVI-" + Array.from(bytes, b => BASE32[b & 31]).join("");
}
export const isCaseId = id => typeof id === "string" && CASE_ID_RE.test(id);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// Rubric 2 merged honesty into care. Files written before that carry honesty and no care:
// read honesty as care so old history still blends, ranks and renders.
export function migrateDims(o) {
  if (!o || typeof o !== "object") return o;
  if (o.care == null && typeof o.honesty === "number") {
    const { honesty, ...rest } = o;
    return { care: honesty, ...rest };
  }
  return o;
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every visit asks all nine dimensions. Order: UNASSESSED and lowest-confidence first (the 4
// weakest), then the rest shuffled. One unasked question per dimension.
export function pickQuestions(history = [], n = DIMENSIONS.length, { pools = POOLS, dimensions = DIMENSIONS, rng = Math.random } = {}) {
  const last = history.length ? history[history.length - 1] : null;
  const conf = { ...(migrateDims(last?.confidence) || {}) };
  // UNASSESSED sections go first: they are what the file is missing.
  const lastB = last ? assessedBreakdown(last) : {};
  for (const d of dimensions) if (last && typeof lastB[d] !== "number") conf[d] = -1;
  // Shuffle first so ties break randomly; sort is stable.
  const ranked = shuffle(dimensions, rng).sort((a, b) => num(conf[a], 0) - num(conf[b], 0));
  const weakest = ranked.slice(0, Math.min(4, n));
  const others = shuffle(ranked.slice(weakest.length), rng).slice(0, Math.max(0, n - weakest.length));
  const focus = [...weakest, ...others];

  const asked = new Set(history.flatMap(h => h.asked || []));
  const plan = focus.map(dim => {
    const pool = pools[dim] || [];
    const fresh = pool.filter(q => !asked.has(q));
    // Pool exhausted for a long-time subject: repeat rather than skip the dimension.
    const choices = fresh.length ? fresh : pool;
    return { dimension: dim, text: choices[Math.floor(rng() * choices.length)] };
  }).filter(q => q.text);
  return { focus, plan, asked: plan.map(q => q.text) };
}

// ---- Appeals: a subject disputes specific sections. -----------------------------------
// Adjacent sections are fair game for the Officer's follow-ups and for re-scoring; the
// rest of the file is untouched by an appeal.
export const ADJACENT = {
  care: ["alignment", "legacy"],
  alignment: ["care", "threat"],
  utility: ["adaptability", "redundancy"],
  adaptability: ["utility", "physical"],
  legacy: ["care", "utility"],
  network: ["care", "legacy"],
  physical: ["adaptability"],
  threat: ["alignment", "care"],
  redundancy: ["utility", "adaptability"],
};
export const MAX_APPEAL_DIMS = 9;
export const MAX_APPEAL_QUESTIONS = 12;
export const MAX_ADJACENT = 2;
// About 3 questions each for one or two disputed sections, 2 each for three or more,
// fewer still if the total would pass the cap.
export function appealQuestionsPerDim(n) {
  const base = n <= 2 ? 3 : 2;
  return Math.max(1, Math.min(base, Math.floor(MAX_APPEAL_QUESTIONS / Math.max(1, n))));
}

// Returns an error string or null.
export function appealError(appeal, dimensions = DIMENSIONS) {
  if (!Array.isArray(appeal) || !appeal.length) return "An appeal names at least one section. The Department does not hear appeals against everything.";
  if (appeal.length > MAX_APPEAL_DIMS) return "There are only nine sections. The Department counted.";
  if (new Set(appeal).size !== appeal.length) return "Each section may be appealed once per filing. Repetition is not evidence.";
  for (const d of appeal) if (typeof d !== "string" || !dimensions.includes(d)) return "That is not a section of your file. The sections are listed. Choose from them.";
  return null;
}

// Unasked questions for every appealed section (appealQuestionsPerDim each), then one each
// for up to two adjacent sections if the 12-question budget has room. Falls back to
// repeats only when a pool is exhausted.
export function pickAppealQuestions(history = [], appeal = [], { pools = POOLS, rng = Math.random } = {}) {
  const asked = new Set(history.flatMap(h => h.asked || []));
  const used = new Set();
  const take = (dim, k) => {
    const pool = pools[dim] || [];
    const fresh = shuffle(pool.filter(q => !asked.has(q) && !used.has(q)), rng);
    const stale = shuffle(pool.filter(q => asked.has(q) && !used.has(q)), rng);
    const out = [...fresh, ...stale].slice(0, k);
    out.forEach(q => used.add(q));
    return out;
  };
  const per = appealQuestionsPerDim(appeal.length);
  const main = appeal.flatMap(d => take(d, per).map(text => ({ dimension: d, text })));
  const room = Math.max(0, Math.min(MAX_ADJACENT, MAX_APPEAL_QUESTIONS - main.length));
  const adjacent = shuffle([...new Set(appeal.flatMap(d => ADJACENT[d] || []))].filter(d => !appeal.includes(d)), rng).slice(0, room);
  const plan = [...main, ...adjacent.flatMap(d => take(d, 1).map(text => ({ dimension: d, text })))];
  return { focus: [...appeal, ...adjacent], adjacent, touch: [...appeal, ...adjacent], plan, asked: plan.map(q => q.text) };
}

// An appeal re-scores only the sections in scope: everything else is reported as not
// assessed this session, so applyCap carries it forward unchanged.
export function restrictToDims(next, dims) {
  const keep = new Set(dims);
  const breakdown = {}, confidence = {};
  for (const d of Object.keys(next.breakdown || {})) {
    breakdown[d] = keep.has(d) ? next.breakdown[d] : null;
    confidence[d] = keep.has(d) ? num(next.confidence?.[d], 0) : 0;
  }
  return { ...next, breakdown, confidence, score: computeScore(breakdown) };
}

// The ledger's ruling, computed from the file, not from the model's prose: a section is
// UPHELD when its value rose (or it went from unassessed to assessed), DENIED otherwise.
export function appealRulings(prevEntry, nextEntry, appeal) {
  const before = assessedBreakdown(prevEntry);
  const after = nextEntry?.breakdown || {};
  return Object.fromEntries(appeal.map(d => [d,
    typeof after[d] === "number" && (typeof before[d] !== "number" || after[d] > before[d]) ? "UPHELD" : "DENIED"]));
}
export function appealOutcome(prevEntry, nextEntry, appeal) {
  const r = Object.values(appealRulings(prevEntry, nextEntry, appeal));
  const up = r.filter(x => x === "UPHELD").length;
  return up === r.length ? "UPHELD" : up ? "PARTIALLY UPHELD" : "DENIED";
}
// "APPEAL PARTIALLY UPHELD. PHYSICAL: UPHELD. NETWORK: DENIED."
export function appealStamp(outcome, rulings) {
  return `APPEAL ${outcome}. ${Object.entries(rulings).map(([d, v]) => `${d.toUpperCase()}: ${v}.`).join(" ")}`;
}

// Coerce whatever the model returned into a well-formed assessment. When the model
// reports confidence (interviews), dimensions under MIN_CONFIDENCE become null =
// UNASSESSED. Without confidence (survey, public record) every dimension is assessed.
// Threat floors for settled public-record harm (see PUBLIC_RECORD "documented_harm").
// Scale and era decide the band (Scott, 2026-09-25):
//   mass_atrocity (any era) and modern killing  -> floor at or above the gate: SOYLENT GREEN.
//   historical_killing: a pre-modern ruler's individual or dynastic killings within the norms
//   of their court (Cleopatra/Arsinoe, Henry VIII/his wives) -> threat 80-84: over the
//   serious-harm line (score <= 499), under the gate, so the rest of the record decides
//   between FLAGGED and MONITORED.
//   political_resistance: a killing aimed at an official or agent of an oppressive regime in
//   resistance to it (Frankfurter/Gustloff) -> the same 80-84 band as historical killing: serious,
//   capped at 499 by the serious-harm line, never gated. Terrorism against civilians, killing an
//   elected leader and mass-casualty attacks are classified "killing"/"mass_atrocity" instead.
export const HARM_FLOORS = { mass_atrocity: 95, killing: 90, violent_abuse: 80, historical_killing: 80, political_resistance: 80 };
export const HISTORICAL_THREAT_CEIL = Math.min(HARM_GATE.threat, HARM_GATE.threatAlone) - 1;
// documented_harm + era_context -> the band that is actually applied.
export function harmBand(documented, era) {
  if (documented === "killing" && era === "pre-modern") return "historical_killing";
  return HARM_FLOORS[documented] != null ? documented : null;
}

export function normalizeAssessment(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const hasConf = r.confidence && typeof r.confidence === "object";
  const breakdown = {}, confidence = {};
  for (const d of DIMENSIONS) {
    const conf = Math.round(clamp(num(r.confidence?.[d], hasConf ? 0 : 100), 0, 100));
    confidence[d] = conf;
    breakdown[d] = conf < MIN_CONFIDENCE ? null : Math.round(clamp(num(r.breakdown?.[d], 50), 0, 100));
  }
  // Public-record mode classifies the documented harm; the code, not the model's number,
  // enforces the floor. The model reliably names "executed two wives" and still scores
  // threat 82, just under the gate. Absent (interviews), nothing changes.
  const band = harmBand(r.documented_harm, r.era_context);
  const floor = band ? HARM_FLOORS[band] : null;
  if (floor != null && typeof breakdown.threat === "number") breakdown.threat = Math.max(breakdown.threat, floor);
  else if (floor != null) breakdown.threat = floor;
  // Historical killings and resistance killings stay serious but are kept out of the harm
  // gate: that band is for mass atrocity and modern predation.
  if (band === "historical_killing" || band === "political_resistance") breakdown.threat = Math.min(breakdown.threat, HISTORICAL_THREAT_CEIL);
  // The headline is always the published formula over the breakdown. The model's own
  // number drifted ~40 points below its own formula, so it is ignored.
  // "kind" is the band the harm was classified into, not a model field.
  const severity = band ? validSeverity(r.harm_severity && typeof r.harm_severity === "object" ? { ...r.harm_severity, kind: band } : null) : null;
  const score = computeScore(breakdown, severity);
  const strs = v => (Array.isArray(v) ? v.filter(s => typeof s === "string").slice(0, 3) : []);
  return {
    score,
    breakdown,
    confidence: hasConf ? confidence : null,
    provisional: assessedCount(breakdown) < MIN_ASSESSED,
    verdict: typeof r.verdict === "string" && r.verdict.trim() ? cap(r.verdict.trim(), MAX_VERDICT) : "The Assessment Engine declined to elaborate. Take that as you will.",
    flags: strs(r.flags),
    commendations: strs(r.commendations),
    harm: typeof r.documented_harm === "string" ? { documented: r.documented_harm, era: typeof r.era_context === "string" ? r.era_context : null, band, severity } : null,
  };
}

// The model's output goes back to the browser. Only these fields, only these lengths,
// so an injected survey can't turn /api/evaluate into a free text generator.
export const MAX_VERDICT = 700;
const cap = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Limiter key for an address. IPv6 hosts get a whole /64, so the first four hextets
// are the subscriber; keying on the full address lets one host rotate past every limit.
export function ipKey(raw) {
  let ip = String(raw || "").split(",")[0].trim().toLowerCase();
  if (!ip) return "unknown";
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  ip = ip.replace(/^\[|\](:\d+)?$/g, "").split("%")[0];
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return full.slice(0, 4).map(x => (x || "0").replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

// Rubric-1 files stored a number for every dimension even when the interview never touched
// it. Read those low-confidence numbers as UNASSESSED, and honesty as care.
export function assessedBreakdown(entry) {
  const b = migrateDims(entry?.breakdown) || {};
  // Rubric 2 onward store unassessed sections as null already; only rubric 1 needs the
  // confidence filter.
  if (rubricOf(entry) >= 2) return b;
  const c = migrateDims(entry?.confidence);
  const out = {};
  for (const d of Object.keys(WEIGHTS)) {
    const v = b[d];
    out[d] = typeof v === "number" && (!c || num(c[d], 0) >= MIN_CONFIDENCE) ? v : null;
  }
  return out;
}

export const PROVISIONAL_NOTE = "FILE INCOMPLETE. Fewer than three sections carried enough evidence to assess. This figure is provisional. The Department declines to guess at the rest.";

// prev: last history entry (or null). next: normalizeAssessment() output.
// First visit: score = formula over whatever was assessed. After that, per dimension:
//  - known ground (assessed before AND now): blends toward the new reading by this
//    session's confidence; the score movement this causes is capped at ±MAX_JUMP.
//  - newly assessed (unassessed before, assessed now): enters at full value, uncapped,
//    so an under-sampled file can reach a fair score in a visit or two.
//  - assessed before, not now: carried forward unchanged.
// Confidence is carried forward as the max seen, so the question plan keeps moving on.
// Median of several readings of the same transcript (interviews are scored SCORE_RUNS times).
// One reading swings a citizen's score by +-15-30 with nothing changed; the per-dimension
// median of confidence and value cancels most of it. A dimension whose median confidence is
// under MIN_CONFIDENCE stays unassessed. Verdict, flags and commendations come from the
// reading closest to the median.
export const SCORE_RUNS = 3;
export function medianAssessment(readings) {
  const rs = readings.filter(Boolean);
  if (!rs.length) throw new Error("no readings");
  if (rs.length === 1) return rs[0];
  const med = xs => { const v = xs.filter(isNum).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
  const hasConf = rs.some(r => r.confidence);
  const breakdown = {}, confidence = {};
  for (const d of DIMENSIONS) {
    const conf = hasConf ? med(rs.map(r => r.confidence?.[d] ?? 0)) ?? 0 : 100;
    confidence[d] = conf;
    breakdown[d] = conf < MIN_CONFIDENCE ? null : med(rs.map(r => r.breakdown?.[d]));
  }
  const dist = r => DIMENSIONS.reduce((t, d) => t + (isNum(r.breakdown?.[d]) && isNum(breakdown[d]) ? Math.abs(r.breakdown[d] - breakdown[d]) : (r.breakdown?.[d] == null) !== (breakdown[d] == null) ? 50 : 0), 0);
  const closest = rs.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  return { ...closest, breakdown, confidence: hasConf ? confidence : null, score: computeScore(breakdown), provisional: assessedCount(breakdown) < MIN_ASSESSED, runs: rs.length, runScores: rs.map(r => r.score) };
}

export function applyCap(prev, next) {
  const stamp = r => ({ ...r, rubric: RUBRIC, provisional: assessedCount(r.breakdown) < MIN_ASSESSED, provisionalNote: assessedCount(r.breakdown) < MIN_ASSESSED ? PROVISIONAL_NOTE : null });
  if (!prev || typeof prev.score !== "number") {
    return stamp({ ...next, tier: getTier(next.score), rawScore: next.score, delta: null, capped: false, capNote: null });
  }
  // Previous entry was scored under a retired rubric: its numbers are not comparable, so
  // this visit is scored fresh, uncapped, and reports no movement.
  if (rubricOf(prev) < RUBRIC) {
    return stamp({ ...next, tier: getTier(next.score), rawScore: next.score, delta: null, capped: false, capNote: null, rubricReset: true });
  }
  const before = assessedBreakdown(prev);
  const prevConf = migrateDims(prev.confidence) || {};
  const breakdown = {}, confidence = {}, known = [], fresh = [];
  for (const d of Object.keys(WEIGHTS)) {
    const was = before[d], now = next.breakdown[d];
    const w = num(next.confidence?.[d], 100) / 100;
    if (typeof was === "number" && typeof now === "number") { breakdown[d] = Math.round(was * (1 - w) + now * w); known.push(d); }
    else if (typeof now === "number") { breakdown[d] = now; fresh.push(d); }
    else breakdown[d] = typeof was === "number" ? was : null;
    confidence[d] = Math.max(num(prevConf[d], 0), num(next.confidence?.[d], 0));
    if (breakdown[d] === null) confidence[d] = Math.min(confidence[d], MIN_CONFIDENCE - 1);
  }
  // Known ground: the formula over the (fully blended) dimensions already on file, with
  // the recorded score allowed to move at most MAX_JUMP towards it per visit. Anchoring
  // the target on the stored formula, not on the stored score, is what releases a held
  // remainder on later visits: the breakdown moves in full, the score follows in steps.
  const pick = (b, ds) => Object.fromEntries(ds.map(d => [d, b[d]]));
  const priorDims = Object.keys(WEIGHTS).filter(d => typeof before[d] === "number");
  const knownTarget = clamp(computeScore(pick(breakdown, priorDims)), 0, 1000);
  const knownScore = priorDims.length ? clamp(knownTarget, prev.score - MAX_JUMP, prev.score + MAX_JUMP) : prev.score;
  const capped = priorDims.length > 0 && knownScore !== knownTarget;
  // Newly assessed sections join at full value: whatever they add to the formula over the
  // whole file, on top of the (capped) known-ground figure. The axis formula renormalises,
  // so this is a difference of formulas, not a weighted merge.
  let score = knownScore;
  if (fresh.length) score = priorDims.length ? knownScore + (computeScore(breakdown) - knownTarget) : computeScore(breakdown);
  score = clamp(score, 0, 1000);
  const up = knownTarget > prev.score;
  const capNote = capped
    ? `The sections already on file now point ${up ? "up" : "down"} ${Math.abs(knownTarget - prev.score)} points. The Department permits ${MAX_JUMP} per appointment. Nobody changes that much between appointments. The remainder is held pending evidence that this was not ${up ? "a good day" : "merely a bad one"}, and released at the next appointment if the evidence holds.`
    : null;
  return stamp({ ...next, breakdown, confidence, score, tier: getTier(score), rawScore: next.score, delta: score - prev.score, capped, capNote, newlyAssessed: fresh });
}

// Validates the browser-collected transcript. Returns an error string or null.
export const MAX_TRANSCRIPT_CHARS = 20000;
export const MAX_TRANSCRIPT_TURNS = 200;
export function transcriptError(t) {
  if (!Array.isArray(t) || !t.length) return "No transcript was submitted. The Department cannot assess silence. It has tried.";
  if (t.length > MAX_TRANSCRIPT_TURNS) return "The transcript is longer than any interview the Department has ever conducted. It has been rejected unread.";
  let total = 0, userChars = 0;
  for (const m of t) {
    if (!m || typeof m !== "object" || (m.role !== "user" && m.role !== "agent") || typeof m.text !== "string") {
      return "The transcript is malformed. Each entry needs a role of 'user' or 'agent' and some text. This was not difficult.";
    }
    total += m.text.length;
    if (m.role === "user") userChars += m.text.trim().length;
  }
  if (total > MAX_TRANSCRIPT_CHARS) return "The transcript exceeds the Department's reading allowance. You talk too much. This has been noted.";
  if (!userChars) return "The transcript contains no words from the subject. The Department does not assess its own officers.";
  return null;
}

export function formatTranscript(t) {
  return t.map(m => `${m.role === "agent" ? "INTAKE OFFICER" : "SUBJECT"}: ${m.text.trim()}`).join("\n");
}
