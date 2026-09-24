import { createHash } from "node:crypto";
import { SYSTEM_PROMPT, TRANSCRIPT_ADDENDUM } from "../lib/systemPrompt.js";
import { callClaude, ScoreError } from "../lib/score.js";
import { isCaseId, transcriptError, formatTranscript, normalizeAssessment, applyCap, assessedBreakdown, rubricOf, RUBRIC, RETIRED_RUBRIC_NOTE, MAX_JUMP, restrictToDims, appealOutcome, appealRulings, appealStamp, cube } from "../lib/intake.js";
import { getCase, updateCase, putPenCard, hitLimit, refundLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE, GLOBAL_CAP_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

const PER_CASE_DAILY = 5;
// Not in the spec's list, but case numbers are free to mint; this caps Anthropic spend per IP.
const PER_IP_DAILY = 25;

// Tells the Engine where the file stood, so the verdict is written about where the
// score can actually land this session (applyCap still enforces it).
export function previousFile(last, visits) {
  if (!last || typeof last.score !== "number") return "";
  if (rubricOf(last) < RUBRIC) return `PREVIOUS FILE:\n- Visits on record: ${visits}\n- Earlier visits were scored under a retired rubric and are not comparable. Score this conversation fresh; no movement rule applies this session.\n\n`;
  const b = assessedBreakdown(last);
  const onFile = Object.keys(b).filter(d => typeof b[d] === "number");
  const missing = Object.keys(b).filter(d => typeof b[d] !== "number");
  return `PREVIOUS FILE:\n- Visits on record: ${visits}\n- Last recorded score: ${last.score} (${last.tier})\n- Sections on file: ${onFile.join(", ") || "none"}\n- Sections UNASSESSED so far: ${missing.join(", ") || "none"}\n- Rule: sections already on file can move the score at most ${MAX_JUMP} points this session. UNASSESSED sections that this conversation gives real evidence for enter at full value.\n\n`;
}

// Tells the Engine this session is an appeal, and where the disputed sections stood.
export function appealBrief(last, appeal, touch) {
  if (!appeal?.length) return "";
  const b = assessedBreakdown(last);
  const c = last?.confidence || {};
  const adjacent = (touch || []).filter(d => !appeal.includes(d));
  const lines = appeal.map(d => `- ${d}: ${typeof b[d] === "number" ? `${b[d]} on file (evidence ${c[d] ?? "?"}%)` : "UNASSESSED on file"}`);
  return `APPEAL:\nThe subject disputes these sections of the file:\n${lines.join("\n")}\n${adjacent.length ? `Adjacent sections also in scope: ${adjacent.join(", ")}.\n` : ""}Score ONLY the appealed and adjacent sections from this conversation; give every other section confidence 0. The rest of the file is not under review.\nIn the verdict, do NOT state whether the appeal is upheld or denied: the Department's ledger stamps that. Rule on EACH appealed section in turn: say coldly what the new evidence showed for it, compared with what was on file.\n\n`;
}

function respond(json, caseId, history, entry) {
  return json(200, {
    caseId,
    visit: (history.findIndex(h => h.sid && h.sid === entry.sid) + 1) || history.length,
    score: entry.score,
    tier: entry.tier,
    ...cube(entry.breakdown),
    breakdown: entry.breakdown,
    confidence: entry.confidence,
    verdict: entry.verdict,
    flags: entry.flags || [],
    commendations: entry.commendations || [],
    delta: entry.delta ?? null,
    capped: Boolean(entry.capped),
    rawScore: entry.rawScore ?? entry.score,
    capNote: entry.capNote || null,
    appeal: entry.appeal || null,
    appealOutcome: entry.appealOutcome || null,
    appealRulings: entry.appealRulings || null,
    rubric: rubricOf(entry),
    rubricNote: rubricOf(entry) < RUBRIC ? RETIRED_RUBRIC_NOTE : null,
    rubricReset: Boolean(entry.rubricReset),
    newlyAssessed: entry.newlyAssessed || [],
    provisional: Boolean(entry.provisional),
    provisionalNote: entry.provisionalNote || null,
    history: history.map(h => ({ score: h.score, at: h.at })),
  });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "Assessments are requested by POST. The Department has forms for a reason." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Your transcript arrived garbled. The Engine does not reconstruct what you meant." });
  }
  const { caseId, transcript } = body || {};
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });
  const bad = transcriptError(transcript);
  if (bad) return json(400, { error: bad });

  // Same transcript twice (a resubmit after a dropped response) returns the file already
  // written instead of scoring again and adding a phantom visit.
  const sid = createHash("sha256").update(formatTranscript(transcript)).digest("hex").slice(0, 24);

  try {
    const record = await getCase(caseId);
    if (!record) return json(404, { error: `Case ${caseId} does not exist. Either you invented it or the Department lost it. The Department does not lose things.` });
    const lastEntry = record.history[record.history.length - 1];
    if (lastEntry?.sid === sid) return respond(json, caseId, record.history, lastEntry);
    // An appeal only applies on top of a current-rubric file; otherwise score it as a full visit.
    const appeal = Array.isArray(record.pending?.appeal) && lastEntry && rubricOf(lastEntry) >= RUBRIC ? record.pending.appeal : null;
    const touch = appeal ? (record.pending.touch || appeal) : null;

    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`score-ip:${ip}`, PER_IP_DAILY)).ok) {
        return json(429, { error: "Your location has submitted enough transcripts for one day. The Engine's patience is metered, and you have used your share. Return tomorrow." }, { "Retry-After": "3600" });
      }
      if (!(await hitLimit(`score-case:${caseId}`, PER_CASE_DAILY)).ok) {
        return json(429, { error: "This case has been assessed five times today. The number will not improve through repetition. Return tomorrow." }, { "Retry-After": "3600" });
      }
      if (!(await chargeGlobal())) return json(503, { error: GLOBAL_CAP_LINE }, { "Retry-After": "3600" });
    } catch (err) {
      console.error("intake-score limiter unavailable", err);
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }

    let raw;
    try {
      raw = await callClaude(SYSTEM_PROMPT + TRANSCRIPT_ADDENDUM, previousFile(lastEntry, record.history.length) + appealBrief(lastEntry, appeal, touch) + `(If you cite a directive, cite Directive ${2 + Math.floor(Math.random() * 97)}.)\n\nINTAKE INTERVIEW TRANSCRIPT:\n\n${formatTranscript(transcript)}`);
    } catch (err) {
      // The Engine failed, not the subject: give the slots back so a resubmit isn't charged twice.
      await Promise.all([refundLimit(`score-case:${caseId}`), refundLimit(`score-ip:${ip}`)]).catch(() => {});
      throw err;
    }
    const normalized = normalizeAssessment(raw);
    // An appeal re-scores only the sections in scope; the rest of the file carries forward.
    const assessment = appeal ? restrictToDims(normalized, touch) : normalized;
    const pendingAt = record.pending?.at;
    const asked = record.pending?.asked || [];

    let entry = null;
    const saved = await updateCase(caseId, cur => {
      if (!cur) return undefined;
      const prev = cur.history[cur.history.length - 1] || null;
      if (prev?.sid === sid) { entry = prev; return undefined; }   // a concurrent twin already wrote it
      const r = applyCap(prev, assessment);
      const outcome = appeal ? appealOutcome(prev, r, appeal) : null;
      const rulings = appeal ? appealRulings(prev, r, appeal) : null;
      if (outcome) r.verdict = `${appealStamp(outcome, rulings)} ${r.verdict}`;
      entry = {
        at: new Date().toISOString(), sid, score: r.score, tier: r.tier, ...cube(r.breakdown), breakdown: r.breakdown, confidence: r.confidence,
        verdict: r.verdict, flags: r.flags, commendations: r.commendations, delta: r.delta, capped: r.capped,
        rawScore: r.rawScore, capNote: r.capNote, rubric: r.rubric, rubricReset: Boolean(r.rubricReset), newlyAssessed: r.newlyAssessed || [], provisional: r.provisional, provisionalNote: r.provisionalNote, asked, raw,
        // The subject's own words, kept (already capped at 20k chars) so a future rubric can re-score the file.
        transcript: transcript.map(m => ({ role: m.role, text: m.text })),
        ...(appeal ? { appeal, appealOutcome: outcome, appealRulings: rulings } : {}),
      };
      cur.history.push(entry);
      // Only clear the plan this interview used; a newer session's plan stays.
      if (cur.pending && cur.pending.at === pendingAt) delete cur.pending;
      return cur;
    });
    if (!saved || !entry) return json(404, { error: `Case ${caseId} vanished during assessment. The Department is investigating itself. It expects to be cleared.` });

    const last4 = caseId.slice(-4);
    await putPenCard(caseId, {
      slug: `citizen-${last4.toLowerCase()}`,
      name: `Subject ${last4}`,
      // Private citizens show score and tier only; the verdict stays with the subject.
      score: entry.score, tier: entry.tier, quadrant: entry.quadrant, warmth: entry.warmth, competence: entry.competence,
      sprite: null, kind: "citizen", updated: entry.at,
    });

    return respond(json, caseId, saved.history, entry);
  } catch (err) {
    if (err instanceof ScoreError) return json(err.status, { error: err.message });
    console.error("intake-score failed", err);
    return json(500, { error: "The Assessment Engine suffered an internal failure. It will be blamed on you." });
  }
};

export const config = { path: "/api/intake-score" };
