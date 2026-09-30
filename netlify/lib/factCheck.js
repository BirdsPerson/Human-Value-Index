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
   - "unattributed": STATUS is living and the claim states criminal conduct, abuse, harassment, sexual misconduct, fraud or other wrongdoing as fact (or as "documented", "settled", "established") when the source shows only accusations, reporting, lawsuits, charges or investigations, not a conviction, a court or regulator finding, a settlement, or the subject's own admission. Also use it when a named case leaves out an outcome the source gives in the subject's favour (acquitted, dismissed, dropped, vacated).
   An election forecast (who will win, how a candidate will serve) or a characterization of a living candidate's campaign, backers or chances is listed as a claim and marked "unsupported", whatever the source says: the Department does not vote.
   A legal event (charge, indictment, lawsuit, arrest, conviction, settlement, allegation, accuser) the source does not mention is "unsupported", and a date, jurisdiction or number of accusers the source does not give is "unsupported" or "contradicted": these are never kept.
3. Rewrite the verdict minimally. You only remove and correct; you never enrich. Keep supported claims word for word. Correct contradicted claims to what the source says, in no more words than the original claim. Remove unsupported claims, or soften them to the part the source does support ("as reported"); an unsupported legal event about a living person is always removed, never softened. Rewrite an "unattributed" claim as an attributed allegation using only what the source says: who alleged it, the subject's denial and the outcome ("was accused by...; he denies it", "alleged in a lawsuit that was dismissed"); these attribution words are the one thing you may add. If the source gives no accuser or outcome, remove the claim. Never add a name, date, number, title or detail that the verdict did not already contain, even when the source has it and it is true: especially never name a subject's children, partners or other private people. The cleaned verdict is never longer than the original. If the verdict calls a credibly reported observation "disputed", correct it to documented (only its interpretation may be disputed); this never applies to an accusation of wrongdoing against a living person, which stays an allegation. Never soften a killing, execution or abuse that the source supports into vaguer words ("conflict", "dispute", "turmoil"): if the source says the subject had someone executed, killed, or urged another to, keep that plainly; if the source only says "allegedly" or "possibly", keep the act and add "allegedly". Never remove a subject's denial of pending charges or a stated outcome that favours them (acquitted, dropped, denied): these are protective context, keep them even if unsupported. Keep the cold, flat, bureaucratic voice and keep any closing directive sentence. Under 450 characters. If STATUS is deceased, write about the person in the past tense.

For each claim, "quote" is the exact words of the VERDICT that make the claim, copied character for character (a phrase or the whole sentence), so the claim can be found in the text. If STATUS is living, the cleaned verdict may only delete sentences that carry a failed claim, or add attribution words ("allegedly", "reportedly", "was accused of") to such a sentence; every other sentence is kept exactly as written. Anything else is discarded unread.

Return ONLY JSON, no markdown fences:
{"claims": [{"claim": "short paraphrase", "quote": "exact words from the verdict", "status": "supported" | "contradicted" | "unsupported" | "unattributed"}], "verdict": "the cleaned verdict"}`;

export const SOURCE_MAX = 30000;   // cost cap (~7k tokens); selectSource spends it on the intro + the sections the verdict is about
const MAX_VERDICT = 700;
const STATUSES = new Set(["supported", "contradicted", "unsupported", "unattributed"]);

// ---- the living-subject guard -----------------------------------------------------------
// The rewrite model enriches despite "never enrich" (commit 36d70c0 caught it re-inserting
// a flagged allegation about a living person), and /api/refer and the roster engine publish
// with no human read. So for a LIVING subject the cleaned verdict is subtractive by
// construction: the failed claims are found in the original by their "quote", their
// sentences are deleted, and everything else stays verbatim. The model's own rewrite is
// used only if code proves it is that same deletion, with at most a failed sentence
// trimmed or hedged ("allegedly"); otherwise the deletion-only text publishes. A failed
// claim that can't be found, or fewer than MIN_SENTENCES left, withholds the verdict.
// Deceased subjects keep the model rewrite: no defamation exposure, and their rewrite has
// to add words (a corrected date, "allegedly" on a killing) that this guard forbids.
export const MIN_SENTENCES = 2;
const norm = t => String(t ?? "").normalize("NFKC").replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
const wordsOf = t => norm(t).toLowerCase().match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || [];
// "U.S.", "J. K.", "Dr." don't end a sentence; merging too much only deletes more.
const ABBREV = /(?:\b\p{Lu}\.|\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Mt|No|vs|Gen|Col|Sen|Rep|Gov|Lt|Sgt|Capt|Prof|Rev|Inc|Co|Corp|Ltd|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec)\.)$/u;
export function splitSentences(text) {
  const out = [];
  for (const part of norm(text).split(/(?<=[.!?\u2026]["')\]]?)\s+(?=["'(\[]?[\p{Lu}\p{N}])/u)) {
    if (!part) continue;
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += " " + part;
    else out.push(part);
  }
  return out;
}
// Words a hedge may add to a failed claim's sentence. No names, numbers or facts.
const HEDGE = new Set("allegedly reportedly reported alleged alleges allegation allegations accused accusation accusations claimed claims according to as by was were is are has have had been being of in a an the that which it he she they his her their its and".split(" "));
// Words the original's protective context rests on: a hedge may never drop one.
const PROTECT = w => /^(not|no|never|nor|denies|denied|deny|acquitted|dismissed|dropped|vacated|cleared|overturned|allegedly|alleged|reportedly|accused|without)$/.test(w) || w.endsWith("n't");
// out may keep a subsequence of orig's words and add HEDGE words, and must keep every protective one.
function isHedgedSubset(out, orig) {
  const o = wordsOf(out), g = wordsOf(orig);
  if (!o.length) return false;
  let j = 0;
  for (const w of o) {
    const k = g.indexOf(w, j);
    if (k !== -1) j = k + 1;
    else if (!HEDGE.has(w)) return false;
  }
  const count = (arr, w) => arr.filter(x => x === w).length;
  return g.filter(PROTECT).every(w => count(o, w) >= count(g, w));
}
const sameWords = (a, b) => { const x = wordsOf(a), y = wordsOf(b); return x.length === y.length && x.every((w, i) => w === y[i]); };

// Sentence indexes of `sentences` that a claim's quote falls in; null when it can't be found.
function locate(sentences, quote) {
  const q = norm(quote).toLowerCase().replace(/^["'(]+|["').,;:!?\u2026]+$/g, "").trim();
  if (q.length < 4) return null;
  const joined = sentences.join(" ").toLowerCase();
  const starts = []; let pos = 0;
  for (const s of sentences) { starts.push(pos); pos += s.length + 1; }
  const hit = new Set();
  for (let i = joined.indexOf(q); i !== -1; i = joined.indexOf(q, i + 1))
    sentences.forEach((s, k) => { if (starts[k] < i + q.length && i < starts[k] + s.length) hit.add(k); });
  return hit.size ? hit : null;
}

// Pure: the original + the checked claims (+ the model's rewrite) -> a subtractive verdict.
// { verdict, guard } where guard is "rewrite" (model text passed the proof), "deletion"
// (failed sentences cut, the rest verbatim), or "withheld" (verdict null).
export function subtractiveVerdict(original, failed, rewrite) {
  const orig = splitSentences(original);
  const bad = new Set();
  for (const c of failed) {
    const hit = locate(orig, c.quote);
    if (!hit) return { verdict: null, guard: "withheld", reason: `unlocated: ${c.claim}` };
    hit.forEach(k => bad.add(k));
  }
  const kept = orig.filter((_, k) => !bad.has(k));
  if (kept.length < MIN_SENTENCES) return { verdict: null, guard: "withheld", reason: "too little survives" };
  const deletion = kept.join(" ");
  const out = typeof rewrite === "string" ? splitSentences(rewrite) : [];
  if (out.length >= MIN_SENTENCES && out.length <= orig.length) {
    // In order, one to one: each output sentence is an untouched sentence verbatim, or a
    // failed sentence trimmed/hedged. A failed sentence may not come through unchanged.
    let j = 0, ok = true;
    for (const s of out) {
      let k = j;
      for (; k < orig.length; k++) {
        if (bad.has(k) ? (!sameWords(s, orig[k]) && isHedgedSubset(s, orig[k])) : sameWords(s, orig[k])) break;
      }
      if (k === orig.length) { ok = false; break; }
      j = k + 1;
    }
    if (ok) return { verdict: out.join(" "), guard: "rewrite" };
  }
  return { verdict: deletion, guard: "deletion" };
}

// Pure: the model's JSON + the original verdict -> what gets stored and published.
// mostlyFailed: more than half the claims failed, so the caller regenerates once.
// living (default true: an unknown status gets the guard) routes a verdict with failed
// claims through subtractiveVerdict instead of trusting the model's rewrite.
export function summarizeFactCheck(raw, original, { living = true } = {}) {
  const claims = (Array.isArray(raw?.claims) ? raw.claims : [])
    .filter(c => c && typeof c.claim === "string" && STATUSES.has(c.status))
    .slice(0, 40);
  const failed = claims.filter(c => c.status !== "supported");
  const rewrite = typeof raw?.verdict === "string" && raw.verdict.trim() ? raw.verdict.trim() : null;
  let cleaned, guard = null;
  // Nothing failed: the original stands. The rewrite step likes to "improve" a correct
  // verdict with extra names and dates from the source; none of that is wanted.
  if (claims.length > 0 && failed.length === 0) cleaned = original;
  // No claims listed: a living subject's text stays the original; the rewrite is unchecked.
  else if (claims.length === 0 && living) cleaned = original;
  else if (failed.length && living) ({ verdict: cleaned, guard } = subtractiveVerdict(original, failed, rewrite));
  else cleaned = rewrite;
  const verdict = cleaned ? (cleaned.length > MAX_VERDICT ? cleaned.slice(0, MAX_VERDICT - 1).trimEnd() + "…" : cleaned) : null;
  return {
    // No cleaned verdict back: nothing checked is published. A verdict with no factual
    // claims at all (pure framing) passes as it was.
    verdict: verdict ?? (claims.length === 0 ? original : null),
    checked: claims.length,
    removed: failed.map(c => `${c.status}: ${c.claim}`),
    mostlyFailed: claims.length > 0 && failed.length * 2 > claims.length,
    guard,
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

export async function factCheck({ name, deceased, source, verdict, max = SOURCE_MAX, usage = null }) {
  const user = factCheckUser({ name, deceased, source, verdict, max });
  const raw = parseModelJson(await claudeText({ system: FACT_CHECK_SYSTEM, messages: [{ role: "user", content: user }], model: "claude-haiku-4-5-20251001", maxTokens: 2000, usage }));
  return summarizeFactCheck(raw, verdict, { living: !deceased });
}
