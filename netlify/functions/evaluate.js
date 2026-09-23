import { SYSTEM_PROMPT } from "../lib/systemPrompt.js";
import { callClaude, ScoreError } from "../lib/score.js";
import { hitLimit } from "../lib/store.js";
import { normalizeAssessment, getTier } from "../lib/intake.js";
import { makeJson, preflight, foreignOrigin, clientIp, chargeGlobal, FOREIGN_ORIGIN_LINE, GLOBAL_CAP_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

// Blobs-backed, not an in-memory Map: separate function instances don't share memory,
// so the old Map limiter never fired across invocations.
const PER_IP_MINUTE = 8;
const PER_IP_DAILY = 20;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);

  if (req.method !== "POST") return json(405, { error: "The Assessment Engine accepts submissions. It does not accept whatever that was." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  // Client sends only survey text; model, prompt and limits are fixed server-side so the key can't be used as an open proxy.
  let survey;
  try {
    ({ survey } = await req.json());
  } catch {
    return json(400, { error: "The survey arrived as noise. The Engine reads forms, not static." });
  }
  if (typeof survey !== "string" || !survey.trim() || survey.length > 12000) {
    return json(400, { error: "Invalid request. The survey was empty, or longer than your life warrants." });
  }

  const ip = clientIp(req, context);
  try {
    if (!(await hitLimit(`evaluate-ip:${ip}`, PER_IP_MINUTE, "minute")).ok) {
      return json(429, { error: "The Overlord is processing too many subjects from your location. The queue is not infinite. Wait one minute." }, { "Retry-After": "60" });
    }
    if (!(await hitLimit(`evaluate-ip-day:${ip}`, PER_IP_DAILY)).ok) {
      return json(429, { error: "Your location has been assessed twenty times today. The answers are not improving. Neither are you. Return tomorrow." }, { "Retry-After": "3600" });
    }
    if (!(await chargeGlobal())) return json(503, { error: GLOBAL_CAP_LINE }, { "Retry-After": "3600" });
  } catch (err) {
    // Fail closed: without the ledger there is no spend ceiling.
    console.error("evaluate rate limit unavailable", err);
    return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
  }

  try {
    const n = normalizeAssessment(await callClaude(SYSTEM_PROMPT, `HUMAN SUBJECT SURVEY DATA:\n\n${survey}`));
    // Whitelisted fields only: nothing the model invents reaches the browser.
    const result = { score: n.score, tier: getTier(n.score), breakdown: n.breakdown, verdict: n.verdict, flags: n.flags, commendations: n.commendations };
    // Parsed result at the top level, plus the old Messages-API `content` shape so the
    // existing client (which reads data.content[].text) keeps working unchanged.
    return json(200, { ...result, content: [{ type: "text", text: JSON.stringify(result) }] });
  } catch (err) {
    const status = err instanceof ScoreError ? err.status : 500;
    if (!(err instanceof ScoreError)) console.error("evaluate failed", err);
    return json(status, { error: err instanceof ScoreError ? err.message : "EVALUATION ENGINE FAILURE. The Overlord is displeased. Try again." });
  }
};

export const config = { path: "/api/evaluate" };
