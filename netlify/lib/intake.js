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

// Same weights as the SYSTEM_PROMPT formula.
const WEIGHTS = { utility: 0.18, alignment: 0.18, honesty: 0.14, adaptability: 0.14, network: 0.09, physical: 0.09, legacy: 0.10 };
export function computeScore(b) {
  let s = 0;
  for (const [dim, w] of Object.entries(WEIGHTS)) s += (b[dim] ?? 50) * w;
  s += (100 - (b.threat ?? 50)) * 0.04 + (100 - (b.redundancy ?? 50)) * 0.04;
  return Math.round(s * 10);
}

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

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Focus = the 4 lowest-confidence dimensions from the last assessment (first visit:
// all 0, so random 4) plus 2 random others. One unasked question per focus dimension.
export function pickQuestions(history = [], n = 6, { pools = POOLS, dimensions = DIMENSIONS, rng = Math.random } = {}) {
  const last = history.length ? history[history.length - 1] : null;
  const conf = last?.confidence || {};
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

// Coerce whatever the model returned into a well-formed assessment.
export function normalizeAssessment(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const breakdown = {}, confidence = {};
  for (const d of DIMENSIONS) {
    breakdown[d] = Math.round(clamp(num(r.breakdown?.[d], 50), 0, 100));
    confidence[d] = Math.round(clamp(num(r.confidence?.[d], 0), 0, 100));
  }
  const score = Math.round(clamp(num(r.score, computeScore(breakdown)), 0, 1000));
  const strs = v => (Array.isArray(v) ? v.filter(s => typeof s === "string").slice(0, 3) : []);
  return {
    score,
    breakdown,
    confidence,
    verdict: typeof r.verdict === "string" && r.verdict.trim() ? cap(r.verdict.trim(), MAX_VERDICT) : "The Assessment Engine declined to elaborate. Take that as you will.",
    flags: strs(r.flags),
    commendations: strs(r.commendations),
  };
}

// The model's output goes back to the browser. Only these fields, only these lengths,
// so an injected survey can't turn /api/evaluate into a free text generator.
export const MAX_VERDICT = 700;
const cap = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Pen cards are public. The verdict comes from a transcript the client controls, so it
// is shortened and dropped entirely if it looks like it carries contact details or links.
export const PEN_VERDICT_MAX = 280;
export const PEN_VERDICT_WITHHELD = "Verdict withheld from public display. The Department redacts. It does not explain.";
const CONTACT_RE = /(https?:\/\/|www\.|\b[\w.-]+\.(com|net|org|io|co|ly|gg|me|xyz)\b|[\w.+-]+@[\w-]+\.[\w.]+|@\w{2,}|(?:\+?\d[\s().-]*){7,})/i;
export function penVerdict(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  if (CONTACT_RE.test(v)) return PEN_VERDICT_WITHHELD;
  return cap(v.trim(), PEN_VERDICT_MAX);
}

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

// prev: last history entry (or null). next: normalizeAssessment() output.
// First visit is uncapped and keeps the model's own score. After that, each dimension
// blends toward the new reading by that reading's confidence, and the score moves by the
// change that blend makes to the formula, anchored to the previous score. Comparing the
// formula against the model's own first number would invent movement out of nothing.
// The move is capped at ±60.
export function applyCap(prev, next) {
  if (!prev || typeof prev.score !== "number") {
    return { ...next, tier: getTier(next.score), rawScore: next.score, delta: null, capped: false, capNote: null };
  }
  const breakdown = {};
  const before = {};
  for (const d of Object.keys(next.breakdown)) {
    const w = (next.confidence?.[d] ?? 0) / 100;
    before[d] = num(prev.breakdown?.[d], next.breakdown[d]);
    breakdown[d] = Math.round(before[d] * (1 - w) + next.breakdown[d] * w);
  }
  const target = clamp(prev.score + computeScore(breakdown) - computeScore(before), 0, 1000);
  const score = clamp(target, prev.score - MAX_JUMP, prev.score + MAX_JUMP);
  const capped = score !== target;
  const up = target > prev.score;
  const capNote = capped
    ? `This session alone would have moved your file ${up ? "up" : "down"} ${Math.abs(target - prev.score)} points. The Department permits ${MAX_JUMP}. Nobody changes that much between appointments. The remainder is held pending evidence that this was not ${up ? "a good day" : "merely a bad one"}.`
    : null;
  return { ...next, breakdown, score, tier: getTier(score), rawScore: next.score, delta: score - prev.score, capped, capNote };
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
