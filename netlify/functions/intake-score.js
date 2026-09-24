import { createHash } from "node:crypto";
import { SYSTEM_PROMPT, TRANSCRIPT_ADDENDUM } from "../lib/systemPrompt.js";
import { callClaude, ScoreError } from "../lib/score.js";
import { isCaseId, transcriptError, formatTranscript, normalizeAssessment, applyCap, MAX_JUMP } from "../lib/intake.js";
import { getCase, updateCase, putPenCard, hitLimit, refundLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE, GLOBAL_CAP_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

const PER_CASE_DAILY = 5;
// Not in the spec's list, but case numbers are free to mint; this caps Anthropic spend per IP.
const PER_IP_DAILY = 25;

// Tells the Engine where the file stood, so the verdict is written about where the
// score can actually land this session (applyCap still enforces it).
export function previousFile(last, visits) {
  if (!last || typeof last.score !== "number") return "";
  return `PREVIOUS FILE:\n- Visits on record: ${visits}\n- Last recorded score: ${last.score} (${last.tier})\n- Rule: the recorded score cannot move more than ${MAX_JUMP} points from ${last.score} this session.\n\n`;
}

function respond(json, caseId, history, entry) {
  return json(200, {
    caseId,
    visit: (history.findIndex(h => h.sid && h.sid === entry.sid) + 1) || history.length,
    score: entry.score,
    tier: entry.tier,
    breakdown: entry.breakdown,
    confidence: entry.confidence,
    verdict: entry.verdict,
    flags: entry.flags || [],
    commendations: entry.commendations || [],
    delta: entry.delta ?? null,
    capped: Boolean(entry.capped),
    rawScore: entry.rawScore ?? entry.score,
    capNote: entry.capNote || null,
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
      raw = await callClaude(SYSTEM_PROMPT + TRANSCRIPT_ADDENDUM, previousFile(lastEntry, record.history.length) + `INTAKE INTERVIEW TRANSCRIPT:\n\n${formatTranscript(transcript)}`);
    } catch (err) {
      // The Engine failed, not the subject: give the slots back so a resubmit isn't charged twice.
      await Promise.all([refundLimit(`score-case:${caseId}`), refundLimit(`score-ip:${ip}`)]).catch(() => {});
      throw err;
    }
    const assessment = normalizeAssessment(raw);
    const pendingAt = record.pending?.at;
    const asked = record.pending?.asked || [];

    let entry = null;
    const saved = await updateCase(caseId, cur => {
      if (!cur) return undefined;
      const prev = cur.history[cur.history.length - 1] || null;
      if (prev?.sid === sid) { entry = prev; return undefined; }   // a concurrent twin already wrote it
      const r = applyCap(prev, assessment);
      entry = {
        at: new Date().toISOString(), sid, score: r.score, tier: r.tier, breakdown: r.breakdown, confidence: r.confidence,
        verdict: r.verdict, flags: r.flags, commendations: r.commendations, delta: r.delta, capped: r.capped,
        rawScore: r.rawScore, capNote: r.capNote, asked, raw,
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
      score: entry.score, tier: entry.tier,
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
