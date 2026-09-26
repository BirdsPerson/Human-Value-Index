// Second pass over a public-figure verdict: every factual claim is checked against the
// subject's Wikipedia article, and anything the source doesn't back is cut or softened
// before it is published. Replaced the human review queue (2026-09-25). Shared by
// /api/refer and scripts/factcheck-figures.mjs.
import { claudeText, parseModelJson } from "./score.js";

export const FACT_CHECK_SYSTEM = `You are the fact-checking clerk for the Department of Human Assessment. You receive a SOURCE (the subject's Wikipedia article text) and a VERDICT written about a real person.

1. List every factual claim the verdict makes about the person or their life: events, dates, numbers, relationships, convictions, actions. Ignore the bureaucratic framing, directive acknowledgments, judgments and opinions ("unremarkable", "noted"), and the scores.
2. Mark each claim:
   - "supported": the source states it or directly implies it.
   - "contradicted": the source says otherwise (a wrong date, a wrong outcome, the wrong person).
   - "unsupported": the source does not cover it.
3. Rewrite the verdict minimally. You only remove and correct; you never enrich. Keep supported claims word for word. Correct contradicted claims to what the source says, in no more words than the original claim. Remove unsupported claims, or soften them to the part the source does support ("as reported"). Never add a name, date, number, title or detail that the verdict did not already contain, even when the source has it and it is true: especially never name a subject's children, partners or other private people. The cleaned verdict is never longer than the original. If the verdict calls a credibly reported observation "disputed", correct it to documented (only its interpretation may be disputed). Never soften a killing, execution or abuse that the source supports into vaguer words ("conflict", "dispute", "turmoil"): if the source says the subject had someone executed, killed, or urged another to, keep that plainly; if the source only says "allegedly" or "possibly", keep the act and add "allegedly". Never remove a subject's denial of pending charges or a stated outcome that favours them (acquitted, dropped, denied): these are protective context, keep them even if unsupported. Keep the cold, flat, bureaucratic voice and keep any closing directive sentence. Under 450 characters. If STATUS is deceased, write about the person in the past tense.

Return ONLY JSON, no markdown fences:
{"claims": [{"claim": "short paraphrase", "status": "supported" | "contradicted" | "unsupported"}], "verdict": "the cleaned verdict"}`;

export const SOURCE_MAX = 30000;   // cost cap (~7k tokens); selectSource spends it on the intro + the sections the verdict is about
const MAX_VERDICT = 700;
const STATUSES = new Set(["supported", "contradicted", "unsupported"]);

// Pure: the model's JSON + the original verdict -> what gets stored and published.
// mostlyFailed: more than half the claims failed, so the caller regenerates once.
export function summarizeFactCheck(raw, original) {
  const claims = (Array.isArray(raw?.claims) ? raw.claims : [])
    .filter(c => c && typeof c.claim === "string" && STATUSES.has(c.status))
    .slice(0, 40);
  const failed = claims.filter(c => c.status !== "supported");
  // Nothing failed: the original stands. The rewrite step likes to "improve" a correct
  // verdict with extra names and dates from the source; none of that is wanted.
  const cleaned = claims.length > 0 && failed.length === 0 ? original
    : typeof raw?.verdict === "string" && raw.verdict.trim() ? raw.verdict.trim() : null;
  const verdict = cleaned ? (cleaned.length > MAX_VERDICT ? cleaned.slice(0, MAX_VERDICT - 1).trimEnd() + "…" : cleaned) : null;
  return {
    // No cleaned verdict back: nothing checked is published. A verdict with no factual
    // claims at all (pure framing) passes as it was.
    verdict: verdict ?? (claims.length === 0 ? original : null),
    checked: claims.length,
    removed: failed.map(c => `${c.status}: ${c.claim}`),
    mostlyFailed: claims.length > 0 && failed.length * 2 > claims.length,
  };
}

// The source budget is spent on the intro plus the sections the verdict actually talks
// about, not the first N characters: a president's drone program or a late personal-life
// section otherwise falls off the end and true claims get cut as "unsupported".
// Wikipedia plain-text extracts mark sections as "== Heading ==".
const STOP = new Set("about above after again against their there these those which while would could should being other under where years record documented subject department directive acknowledged acknowledgment requires including remains public".split(" "));
export const keywordsOf = text => [...new Set(String(text || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) || [])].filter(w => !STOP.has(w));
export function splitSections(text) {
  const re = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;
  const out = [];
  let last = 0, heading = null, m;
  while ((m = re.exec(text))) {
    out.push({ heading, body: text.slice(last, m.index) });
    heading = m[2];
    last = m.index + m[0].length;
  }
  out.push({ heading, body: text.slice(last) });
  return out.filter(x => x.heading !== null || x.body.trim());
}
export function selectSource(text, verdict, max = SOURCE_MAX) {
  const src = String(text || "");
  if (src.length <= max) return src;
  const secs = splitSections(src).map((x, i) => ({ ...x, i }));
  const keys = keywordsOf(verdict);
  const score = x => {
    const h = String(x.heading || "").toLowerCase(), b = x.body.toLowerCase();
    return keys.reduce((t, k) => t + (h.includes(k) ? 3 : 0) + (b.includes(k) ? 1 : 0), 0);
  };
  const render = x => (x.heading ? `== ${x.heading} ==\n` : "") + x.body.trim() + "\n";
  const intro = secs.find(x => x.heading === null);
  const picked = new Map();
  let used = 0;
  if (intro) { const t = render(intro).slice(0, Math.floor(max / 3)); picked.set(intro.i, t); used += t.length; }
  const ranked = secs.filter(x => x !== intro).map(x => ({ x, s: score(x) })).filter(r => r.s > 0).sort((a, b) => b.s - a.s || a.x.i - b.x.i);
  for (const { x } of ranked) {
    if (used >= max) break;
    const t = render(x).slice(0, max - used);
    if (t.length < 200 && t.length < render(x).length) continue;
    picked.set(x.i, t); used += t.length;
  }
  // Leftover budget: the article in order, so short verdicts still see the main body.
  for (const x of secs) { if (used >= max) break; if (picked.has(x.i)) continue; const t = render(x).slice(0, max - used); picked.set(x.i, t); used += t.length; }
  return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]).join("\n").slice(0, max);
}
export const factCheckUser = ({ name, deceased, source, verdict, max = SOURCE_MAX }) =>
  `SUBJECT: ${name}\nSTATUS: ${deceased ? "deceased" : "living"}\n\nSOURCE:\n${selectSource(source, verdict, max)}\n\nVERDICT:\n${verdict}`;

export async function factCheck({ name, deceased, source, verdict, max = SOURCE_MAX }) {
  const user = factCheckUser({ name, deceased, source, verdict, max });
  const raw = parseModelJson(await claudeText({ system: FACT_CHECK_SYSTEM, messages: [{ role: "user", content: user }], model: "claude-haiku-4-5-20251001", maxTokens: 1500 }));
  return summarizeFactCheck(raw, verdict);
}
