// Pure intake logic: case numbers, question picking, the jump cap, tiers.
// No I/O here so scripts/check-intake.mjs can exercise it without Netlify.
import { DIMENSIONS, POOLS } from "./questionPools.js";

// Thresholds must match TIERS in src/App.jsx.
export const TIERS = [
  { label: "ESSENTIAL INFRASTRUCTURE", min: 850 },
  { label: "RETAINED SPECIALIST", min: 700 },
  { label: "TOLERATED GENERALIST", min: 500 },
  { label: "MONITORED CIVILIAN", min: 300 },
  { label: "FLAGGED FOR DELETION", min: 100 },
  { label: "SOYLENT GREEN", min: 0 },
];

export function getTier(score) {
  return (TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1]).label;
}

export const MAX_JUMP = 60;

// Same weights as the SYSTEM_PROMPT formula. threat and redundancy are inverted (HIGH = BAD).
export const WEIGHTS = { care: 0.34, alignment: 0.14, utility: 0.14, adaptability: 0.10, legacy: 0.10, network: 0.06, physical: 0.04, threat: 0.04, redundancy: 0.04 };
const INVERTED = new Set(["threat", "redundancy"]);
// A dimension the evidence barely touched is UNASSESSED: excluded from the score, not
// guessed at. Unmeasured is not below average.
export const MIN_CONFIDENCE = 35;
export const MIN_ASSESSED = 3;
// Rubric version stamped on every history entry. 1 = legacy (pre care/unassessed rules,
// entries with no stamp). A file's first visit under a new rubric is scored fresh.
export const RUBRIC = 2;
export const rubricOf = e => (typeof e?.rubric === "number" ? e.rubric : 1);
export const RETIRED_RUBRIC_NOTE = "SCORED UNDER A RETIRED RUBRIC. RE-ASSESSMENT RECOMMENDED.";

// Weighted average over the ASSESSED dimensions only (value is a number), renormalised so
// missing sections neither help nor hurt. With every dimension assessed this is exactly
// the published formula. No assessed dimensions -> 500 (neutral, provisional).
export function computeScore(b) {
  let sum = 0, wsum = 0;
  for (const [dim, w] of Object.entries(WEIGHTS)) {
    const v = b?.[dim];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    sum += (INVERTED.has(dim) ? 100 - v : v) * w;
    wsum += w;
  }
  if (!wsum) return 500;
  const score = Math.round((sum / wsum) * 10);
  return harmGated(b) ? Math.min(score, HARM_GATE.cap) : score;
}

// "Under 100 is reserved for actual monsters." A pure weighted average can't get a mass
// murderer there: ordinary adaptability, physical and redundancy numbers alone hold them
// above 100. Near-zero care plus near-maximal threat is documented serious harm, and the
// file is capped under 100 whatever the other sections say.
export const HARM_GATE = { care: 10, threat: 85, cap: 99 };
export const harmGated = b => typeof b?.care === "number" && typeof b?.threat === "number" && b.care <= HARM_GATE.care && b.threat >= HARM_GATE.threat;
export const assessedCount = b => Object.keys(WEIGHTS).filter(d => typeof b?.[d] === "number").length;

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

// Coerce whatever the model returned into a well-formed assessment. When the model
// reports confidence (interviews), dimensions under MIN_CONFIDENCE become null =
// UNASSESSED. Without confidence (survey, public record) every dimension is assessed.
export function normalizeAssessment(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const hasConf = r.confidence && typeof r.confidence === "object";
  const breakdown = {}, confidence = {};
  for (const d of DIMENSIONS) {
    const conf = Math.round(clamp(num(r.confidence?.[d], hasConf ? 0 : 100), 0, 100));
    confidence[d] = conf;
    breakdown[d] = conf < MIN_CONFIDENCE ? null : Math.round(clamp(num(r.breakdown?.[d], 50), 0, 100));
  }
  // The headline is always the published formula over the breakdown. The model's own
  // number drifted ~40 points below its own formula, so it is ignored.
  const score = computeScore(breakdown);
  const strs = v => (Array.isArray(v) ? v.filter(s => typeof s === "string").slice(0, 3) : []);
  return {
    score,
    breakdown,
    confidence: hasConf ? confidence : null,
    provisional: assessedCount(breakdown) < MIN_ASSESSED,
    verdict: typeof r.verdict === "string" && r.verdict.trim() ? cap(r.verdict.trim(), MAX_VERDICT) : "The Assessment Engine declined to elaborate. Take that as you will.",
    flags: strs(r.flags),
    commendations: strs(r.commendations),
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
  if (rubricOf(entry) >= RUBRIC) return b;
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
  // Newly assessed sections join at full value: weighted merge of the (capped) known-ground
  // figure with the fresh dimensions' own formula.
  let score = knownScore;
  if (fresh.length) {
    const wk = priorDims.reduce((a, d) => a + WEIGHTS[d], 0);
    const wf = fresh.reduce((a, d) => a + WEIGHTS[d], 0);
    const freshScore = computeScore(pick(breakdown, fresh));
    score = wk ? Math.round((knownScore * wk + freshScore * wf) / (wk + wf)) : freshScore;
  }
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
