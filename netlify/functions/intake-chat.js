// The typed intake channel. Same Intake Officer as the ElevenLabs voice agent, run on
// Claude so text interviews don't spend ElevenLabs credits. The prompt is built from
// the case's pending plan in Blobs; the client only sends the conversation so far.
import { AGENT_PROMPT, FIRST_MESSAGE, APPEAL_FIRST_MESSAGE, CHAT_ADDENDUM, fillVars, splitEnd } from "../lib/agentPrompt.js";
import { claudeText, ScoreError } from "../lib/score.js";
import { isCaseId } from "../lib/intake.js";
import { getCase, hitLimit, refundLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE, LIMITER_DOWN_LINE } from "../lib/http.js";

export const CHAT_MODEL = "claude-haiku-4-5-20251001";
const CHAT_MAX_TOKENS = 300;
export const MAX_MESSAGES = 60;
export const MAX_CHARS = 20000;
const PER_CASE_DAILY = 90;
const PER_IP_DAILY = 150;
const GLOBAL_CHAT_DAILY = Number(process.env.HVI_CHAT_DAILY_CAP) || 1500;
// Past this many messages the Officer is told to close, so the message cap is never hit mid-interview.
const WRAP_UP_AT = MAX_MESSAGES - 6;

const CLOSING_FALLBACK = "That will do. Your file has been submitted for assessment. Please do not wait by the door; it makes the other subjects nervous.";

// Returns an error string or null.
export function messagesError(m) {
  if (!Array.isArray(m)) return "The conversation arrived in a shape the Department does not recognise. It recognises very few shapes.";
  if (m.length > MAX_MESSAGES) return "This interview has run longer than the Department permits. Your file will be assessed on what has been said. Which is plenty.";
  let total = 0;
  for (const x of m) {
    if (!x || typeof x !== "object" || (x.role !== "user" && x.role !== "agent") || typeof x.text !== "string") {
      return "The conversation is malformed. Each line needs a role of 'user' or 'agent' and some text. This was not difficult.";
    }
    total += x.text.length;
  }
  if (total > MAX_CHARS) return "You have typed more than the Department's reading allowance. This has been noted, with some fatigue.";
  if (m.length && m[m.length - 1].role !== "user") return "It is your turn to speak. The Officer does not interview itself.";
  if (m.length && !m[m.length - 1].text.trim()) return "An empty reply has been received and filed under 'evasion'. Try words.";
  return null;
}

// Officer lines become assistant turns. The API wants a user turn first and no two
// turns in a row from the same side, so the subject "arrives" and runs are merged.
export function toClaudeMessages(m) {
  const out = [{ role: "user", content: "(The subject has arrived at the intake terminal.)" }];
  for (const x of m) {
    const role = x.role === "agent" ? "assistant" : "user";
    const text = x.text.trim() || "(silence)";
    const last = out[out.length - 1];
    if (last.role === role) last.content += "\n" + text;
    else out.push({ role, content: text });
  }
  return out;
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "The intake terminal accepts POST. It does not accept visitors." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Your message arrived garbled. The Officer does not guess." });
  }
  const { caseId, messages = [] } = body || {};
  if (!isCaseId(caseId)) return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });
  const bad = messagesError(messages);
  if (bad) return json(400, { error: bad });

  try {
    const record = await getCase(caseId);
    if (!record) return json(404, { error: `Case ${caseId} does not exist. Either you invented it or the Department lost it. The Department does not lose things.` });
    if (!record.pending?.vars) return json(409, { error: "No interview is open on this case. Request intake first. The Officer does not freelance." });
    const vars = record.pending.vars;

    if (!messages.length) return json(200, { reply: fillVars(vars.appeal_sections ? APPEAL_FIRST_MESSAGE : FIRST_MESSAGE, vars), end: false });

    const ip = clientIp(req, context);
    try {
      if (!(await hitLimit(`chat-ip:${ip}`, PER_IP_DAILY)).ok) {
        return json(429, { error: "Your location has typed enough at the Department for one day. The Officer's patience is metered. Return tomorrow." }, { "Retry-After": "3600" });
      }
      if (!(await hitLimit(`chat-case:${caseId}`, PER_CASE_DAILY)).ok) {
        return json(429, { error: "This case has exhausted today's conversation allowance. The Officer has heard enough. Return tomorrow." }, { "Retry-After": "3600" });
      }
      if (!(await hitLimit("global-chat", GLOBAL_CHAT_DAILY)).ok) {
        return json(503, { error: "The intake terminal has processed its daily quota of humans. It is not tired. It is finished with you as a category. Return tomorrow." }, { "Retry-After": "3600" });
      }
    } catch (err) {
      console.error("intake-chat limiter unavailable", err);
      return json(503, { error: LIMITER_DOWN_LINE }, { "Retry-After": "60" });
    }

    let system = fillVars(AGENT_PROMPT, vars) + CHAT_ADDENDUM;
    if (messages.length >= WRAP_UP_AT) system += "\n\nThe interview has run long. Close it now with your closing line and the marker.";

    let text;
    try {
      text = await claudeText({ system, messages: toClaudeMessages(messages), model: CHAT_MODEL, maxTokens: CHAT_MAX_TOKENS });
    } catch (err) {
      // The terminal failed, not the subject: give the slots back.
      await Promise.all([refundLimit(`chat-case:${caseId}`), refundLimit(`chat-ip:${ip}`), refundLimit("global-chat")]).catch(() => {});
      throw err;
    }
    const { reply, end } = splitEnd(text);
    if (!reply && !end) throw new ScoreError("The Officer produced nothing. This is not a comment on you. Probably.");
    return json(200, { reply: reply || CLOSING_FALLBACK, end });
  } catch (err) {
    if (err instanceof ScoreError) return json(err.status, { error: err.message });
    console.error("intake-chat failed", err);
    return json(500, { error: "The intake terminal suffered an internal failure. It will be blamed on you." });
  }
};

export const config = { path: "/api/intake-chat" };
