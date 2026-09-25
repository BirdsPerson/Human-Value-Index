// Message Batches over raw HTTP, matching netlify/lib/score.js (the repo talks to the
// API with fetch). Batches run at 50% of standard prices and can take up to 24h, so the
// caller stores the batch id and polls across runs.
const API = "https://api.anthropic.com/v1/messages/batches";

function headers() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
}

async function call(url, init = {}) {
  const r = await fetch(url, { ...init, headers: headers() });
  const text = await r.text();
  if (!r.ok) throw new Error(`batches ${r.status}: ${text.slice(0, 400)}`);
  return text;
}

// requests: [{ custom_id, params }]. Returns the batch object ({ id, processing_status, ... }).
export async function createBatch(requests) {
  return JSON.parse(await call(API, { method: "POST", body: JSON.stringify({ requests }) }));
}

export async function getBatch(id) {
  return JSON.parse(await call(`${API}/${id}`));
}

// Results arrive as JSONL in any order: key by custom_id, never by position.
export async function batchResults(batch) {
  const text = await call(batch.results_url);
  const out = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    out.set(row.custom_id, row.result);
  }
  return out;
}

// A succeeded result's text, or null (errored / expired / canceled).
export function resultText(result) {
  if (result?.type !== "succeeded") return null;
  return (result.message?.content || []).map(b => b.text || "").join("");
}

export function resultUsage(result) {
  return result?.type === "succeeded" ? result.message?.usage || null : null;
}

// Batch prices per million tokens (50% of standard): claude-api skill, cached 2026-06-24.
export const PRICES = {
  "claude-sonnet-5": { in: 1.0, out: 5.0 },
  "claude-haiku-4-5-20251001": { in: 0.5, out: 2.5 },
};
// Cache writes bill at 1.25x input and reads at 0.1x; the estimate charges everything at
// the write rate so it errs high.
export const estimateDollars = (model, inTokens, outTokens) => {
  const p = PRICES[model];
  return (inTokens * p.in * 1.25 + outTokens * p.out) / 1e6;
};

export function actualDollars(model, usages) {
  const p = PRICES[model];
  let d = 0;
  for (const u of usages) {
    if (!u) continue;
    d += ((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.in * 1.25
      + (u.cache_read_input_tokens || 0) * p.in * 0.1 + (u.output_tokens || 0) * p.out) / 1e6;
  }
  return d;
}

// ~4 characters per token for English prose: good enough for a budget guard.
export const approxTokens = s => Math.ceil(String(s || "").length / 4);
