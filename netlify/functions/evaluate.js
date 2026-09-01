import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, RESULT_SCHEMA } from "../lib/prompt.js";
import { validateAnswers, formatSurvey, answeredCount } from "../lib/validate.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { computeScore, getTier, normalizeBreakdown } from "../../shared/scoring.js";

// Override with HVI_MODEL in the Netlify environment. claude-sonnet-5 is the
// cheaper, faster option if evaluations start hitting the function timeout.
const MODEL = process.env.HVI_MODEL || "claude-opus-5";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_LIST_ITEMS = 3;
const MAX_ITEM_CHARS = 300;
const MAX_VERDICT_CHARS = 1500;

const isRateLimited = createRateLimiter({ limit: 8, windowMs: 60_000 });

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string" && v.trim())
    .slice(0, MAX_LIST_ITEMS)
    .map((v) => v.trim().slice(0, MAX_ITEM_CHARS));
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
  if (isRateLimited(ip)) {
    return json(
      { error: "The Overlord is processing too many subjects from your location. The queue is not infinite. Wait one minute." },
      429,
      { "Retry-After": "60" },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    return json({ error: "Assessment engine offline. The Overlord's credentials are not configured." }, 500);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "Submission exceeds the Overlord's patience. Payload too large." }, 413);
  }
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Malformed submission." }, 400);
  }

  const validated = validateAnswers(body?.answers);
  if (!validated.ok) return json({ error: validated.error }, 400);
  const answers = validated.answers;
  if (answeredCount(answers) === 0) {
    return json({ error: "No responses detected. The Overlord cannot evaluate silence. Answer at least one question." }, 400);
  }

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `HUMAN SUBJECT SURVEY DATA:\n\n${formatSurvey(answers)}` }],
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RESULT_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "The Overlord declines to evaluate this subject. Revise your responses and resubmit." }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      console.error("evaluate: response truncated at max_tokens");
      return json({ error: "The Overlord's verdict exceeded its allotted bandwidth. Try again." }, 502);
    }

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("evaluate: model returned non-JSON output", text.slice(0, 200));
      return json({ error: "The Overlord's verdict was corrupted in transit. Try again." }, 502);
    }

    const breakdown = normalizeBreakdown(parsed.breakdown);
    const score = computeScore(breakdown);
    const tier = getTier(score).label;

    return json({
      score,
      tier,
      breakdown,
      verdict: typeof parsed.verdict === "string" && parsed.verdict.trim()
        ? parsed.verdict.trim().slice(0, MAX_VERDICT_CHARS)
        : "The Overlord has no words. This is itself a finding.",
      flags: cleanList(parsed.flags),
      commendations: cleanList(parsed.commendations),
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "The Overlord's attention is fully allocated. Try again shortly." }, 503, { "Retry-After": "30" });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`evaluate: upstream API error ${err.status}: ${err.message}`);
      return json({ error: "Evaluation engine failure. The Overlord is displeased. Try again." }, 502);
    }
    console.error("evaluate: unexpected error", err);
    return json({ error: "Evaluation engine failure. The Overlord is displeased. Try again." }, 500);
  }
};

export const config = { path: "/api/evaluate" };
