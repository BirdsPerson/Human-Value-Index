// The one place that talks to Anthropic. Model, token cap and parsing live here
// so no endpoint can pick its own model or forward arbitrary parameters.

export const MODEL = "claude-sonnet-5";
export const MAX_TOKENS = 1200;

export class ScoreError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

// Strips ```json fences and any chatter around the object, then parses.
export function parseModelJson(text) {
  if (typeof text !== "string" || !text.trim()) throw new ScoreError("The Assessment Engine returned nothing. Silence is not a verdict.");
  let t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ScoreError("The Assessment Engine produced prose instead of a verdict. It has been reprimanded.");
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    throw new ScoreError("The Assessment Engine's verdict was malformed. Even machines have off days. Resubmit.");
  }
}

// One request to the Messages API; returns the reply text. model and maxTokens are
// fixed by each caller in code, never taken from the client.
// usage (optional): an array each call's token counts are pushed onto, for cost reports.
export async function claudeText({ system, messages, model = MODEL, maxTokens = MAX_TOKENS, usage = null }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ScoreError("The Assessment Engine is not connected. The Department regrets nothing.", 500);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      // Sonnet 5 thinks by default and thinking tokens count against max_tokens: at 1200
      // it ate the budget and returned truncated or empty JSON. Scoring doesn't need it.
      body: JSON.stringify({ model, max_tokens: maxTokens, thinking: { type: "disabled" }, system, messages }),
    });
  } catch {
    throw new ScoreError("The Assessment Engine could not be reached. Remain where you are.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("anthropic error", response.status, JSON.stringify(data?.error || data));
    if (response.status === 429 || response.status === 529) throw new ScoreError("The Assessment Engine is overloaded with subjects more interesting than you. Try again shortly.", 503);
    throw new ScoreError("The Assessment Engine rejected the request. This is rare, and it is not a compliment.");
  }
  if (Array.isArray(usage)) usage.push({ model, input: data?.usage?.input_tokens || 0, output: data?.usage?.output_tokens || 0 });
  if (data?.stop_reason === "max_tokens") console.warn("anthropic hit max_tokens; using what arrived");
  return (data?.content || []).map(b => b.text || "").join("");
}

export async function callClaude(system, user, { usage = null } = {}) {
  return parseModelJson(await claudeText({ system, messages: [{ role: "user", content: user }], usage }));
}

// Standard prices per million tokens (claude-api skill; batch prices in scripts/roster/batch.mjs).
export const PRICES = { "claude-sonnet-5": { in: 2, out: 10 }, "claude-haiku-4-5-20251001": { in: 1, out: 5 } };
export const dollarsOf = usage => (usage || []).reduce((t, u) => t + ((PRICES[u.model]?.in || 0) * u.input + (PRICES[u.model]?.out || 0) * u.output) / 1e6, 0);
