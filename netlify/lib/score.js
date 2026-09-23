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

export async function callClaude(system, user) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ScoreError("The Assessment Engine is not connected. The Department regrets nothing.", 500);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      // Sonnet 5 thinks by default and thinking tokens count against max_tokens: at 1200
      // it ate the budget and returned truncated or empty JSON. Scoring doesn't need it.
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
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
  if (data?.stop_reason === "max_tokens") console.warn("anthropic hit max_tokens; attempting parse anyway");
  const text = (data?.content || []).map(b => b.text || "").join("");
  return parseModelJson(text);
}
