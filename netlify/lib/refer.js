// Referral logic: name validation, the Wikipedia gate, slugs and dedupe against the
// figures already on file. The Wikipedia calls take an injectable fetch so
// scripts/check-refer.mjs can run them offline.
import { FAMOUS_FIGURES, slugify } from "../../src/figures.js";

export const MAX_NAME = 80;
// Letters (any script), spaces and the punctuation real names use.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .,'’\-]*$/u;

export function nameError(name) {
  if (typeof name !== "string") return "Submit a name. The Department does not process blanks.";
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return "Submit a name. The Department does not process blanks.";
  if (n.length > MAX_NAME) return "That name is longer than any human has earned. Shorten it.";
  if (!NAME_RE.test(n)) return "Names contain letters. Occasionally a hyphen. Nothing you just typed qualifies.";
  return null;
}
export const cleanName = name => name.trim().replace(/\s+/g, " ");

// Wikipedia titles carry qualifiers ("Prince (musician)"); the subject is the part before.
export const titleSlug = title => slugify(String(title).replace(/\s*\([^)]*\)\s*$/, ""));

// The 62 figures on file, keyed by slug. Where their on-file name differs from their
// Wikipedia title, the title's slug maps to the figure.
const WIKI_ALIASES = {
  "john-f-kennedy": "jfk",
  "vladimir-putin": "putin",
  "elizabeth-ii": "queen-elizabeth-ii",
  "diana-princess-of-wales": "princess-diana",
  "o-j-simpson": "oj-simpson",
};
const FIGURE_BY_SLUG = new Map(FAMOUS_FIGURES.map(f => [slugify(f.name), f]));
export function onFileFigure(slug) {
  return FIGURE_BY_SLUG.get(WIKI_ALIASES[slug] || slug) || null;
}

export const REJECT = {
  none: "No public record located. The Department does not invent subjects. That is your department.",
  ambiguous: "That name matches several people. The Department does not guess which one you resent. Be specific.",
  notHuman: "The Department does not process private citizens on request. Or places. Or bands. It assesses individual humans with a public record.",
  lookup: "The public record is unreachable. The Department will not assess from memory alone. Try again shortly.",
};

const UA = "HumanValueIndex/1.0 (https://humanvalueindex.com; referral lookups)";
const HUMAN = "Q5";

// One retry on a network failure (a dropped socket is common and cheap to retry); HTTP
// errors and timeouts are not retried.
async function getJson(fetchImpl, url, ms = 8000) {
  try {
    return await getJsonOnce(fetchImpl, url, ms);
  } catch (err) {
    if (err?.name === "AbortError" || /^HTTP /.test(err?.message || "")) throw err;
    return getJsonOnce(fetchImpl, url, ms);
  }
}

async function getJsonOnce(fetchImpl, url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetchImpl(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// name -> { ok: true, title, extract, description, wikidata } or { ok: false, reason }.
// reason is a REJECT key. Gate: a real search hit, not a disambiguation page, and a
// Wikidata item that is an instance of human (Q5). Fictional people, places and bands fail.
export async function resolveWikipedia(name, fetchImpl = fetch) {
  try {
    const q = encodeURIComponent(name);
    const search = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`);
    const hit = search?.query?.search?.[0];
    if (!hit?.title) return { ok: false, reason: "none" };
    const summary = await getJson(fetchImpl, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`);
    return classifySummary(summary, await instanceOf(fetchImpl, summary?.wikibase_item));
  } catch (err) {
    console.error("wikipedia lookup failed", err?.message || err);
    return { ok: false, reason: "lookup" };
  }
}

async function instanceOf(fetchImpl, qid) {
  if (!qid || !/^Q\d+$/.test(qid)) return [];
  const data = await getJson(fetchImpl, `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P31&format=json&origin=*`);
  return (data?.claims?.P31 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
}

// Pure: summary JSON + P31 ids -> verdict. Exported for the self-check.
export function classifySummary(summary, p31 = []) {
  if (!summary || !summary.title) return { ok: false, reason: "none" };
  if (summary.type === "disambiguation") return { ok: false, reason: "ambiguous" };
  if (!p31.includes(HUMAN)) return { ok: false, reason: "notHuman" };
  return {
    ok: true,
    title: summary.title,
    description: String(summary.description || "").slice(0, 200),
    extract: String(summary.extract || "").slice(0, 1500),
    wikidata: summary.wikibase_item,
  };
}

// Calendar-month bucket for the per-case quota (UTC).
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const PER_CASE_MONTHLY = 3;
export const remainingThisMonth = used => Math.max(0, PER_CASE_MONTHLY - (used || 0));
