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

// Wikidata ids of the figures on file, so a namesake ("Joe Jackson (musician)", "Michael
// Jackson (writer)") is never handed the on-file person's card. Looked up 2026-09-24.
export const FIGURE_QIDS = {
  "Nikola Tesla": "Q9036", "Genghis Khan": "Q720", "Mother Teresa": "Q30547", "Mahatma Gandhi": "Q1001",
  "Elon Musk": "Q317521", "Taylor Swift": "Q26876", "Kobe Bryant": "Q25369", "Dennis Rodman": "Q201608",
  "Sam Altman": "Q7407093", "Peter Thiel": "Q705525", "Princess Diana": "Q9685", "Mansa Musa": "Q309333",
  "Pablo Picasso": "Q5593", "Socrates": "Q913", "Kim Jong-un": "Q56226", "Queen Elizabeth II": "Q9682",
  "Tom Brady": "Q313381", "Shohei Ohtani": "Q4391858", "Michael Jackson": "Q2831", "Madonna": "Q1744",
  "JFK": "Q9696", "Prince": "Q7542", "Henry VIII": "Q38370", "Ronaldinho": "Q39444", "Putin": "Q7747",
  "Pel\u00e9": "Q12897", "Keanu Reeves": "Q43416", "Babe Ruth": "Q213812", "Jason Kelce": "Q6162843",
  "Caligula": "Q1409", "Alan Turing": "Q7251", "Marie Curie": "Q7186", "Albert Einstein": "Q937",
  "Muhammad Ali": "Q36107", "Nelson Mandela": "Q8023", "Ada Lovelace": "Q7259",
  "Martin Luther King Jr.": "Q8027", "Harriet Tubman": "Q102870", "Leonardo da Vinci": "Q762",
  "Cleopatra": "Q635", "Isaac Newton": "Q935", "Oprah Winfrey": "Q55800", "Bruce Lee": "Q16397",
  "Stephen Hawking": "Q17714", "Grace Hopper": "Q11641", "Mao Zedong": "Q5816", "Winston Churchill": "Q8016",
  "George Orwell": "Q3335", "Marcus Aurelius": "Q1430", "Nikola Jokic": "Q17281073",
  "Billie Holiday": "Q104358", "Jeffrey Epstein": "Q2904131", "Ghislaine Maxwell": "Q5556756",
  "Martin Shkreli": "Q6776585", "Bernie Madoff": "Q14043", "Elizabeth Holmes": "Q17503525",
  "Harvey Weinstein": "Q531599", "Joe Jackson": "Q361297", "Pablo Escobar": "Q187447",
  "O.J. Simpson": "Q44473", "Aaron Hernandez": "Q302091", "Aretha Franklin": "Q125121",
};
const FIGURE_BY_QID = new Map(FAMOUS_FIGURES.filter(f => FIGURE_QIDS[f.name]).map(f => [FIGURE_QIDS[f.name], f]));
export const onFileByQid = qid => (qid && FIGURE_BY_QID.get(qid)) || null;
export const RESERVED_SLUGS = new Set(["index"]);

// Dedupe is by person (Wikidata id), not by name. The slug is the stripped title unless a
// different person already holds it, then the full title ("chris-evans-presenter"), then
// the title plus the id. taken(slug) resolves to the referred card stored there, or null.
// Returns { onFile } for a figure on file, { existing } for a referred card that is this
// person, or { slug } to create (null if every candidate is somebody else's).
export async function placeReferral(wiki, taken) {
  const byQid = onFileByQid(wiki.wikidata);
  if (byQid) return { onFile: byQid };
  const candidates = [titleSlug(wiki.title), slugify(wiki.title), slugify(`${wiki.title} ${wiki.wikidata || ""}`)];
  for (const slug of candidates) {
    if (!slug || RESERVED_SLUGS.has(slug)) continue;
    const onFile = onFileFigure(slug);
    if (onFile) {
      // Every figure on file has a known id, and the id check above missed: a namesake.
      if (FIGURE_QIDS[onFile.name] && wiki.wikidata) continue;
      return { onFile };
    }
    const card = await taken(slug);
    if (!card) return { slug };
    if (!card.wikidata || !wiki.wikidata || card.wikidata === wiki.wikidata) return { existing: card };
  }
  return { slug: null };
}

export const REJECT = {
  none: "No public record located. The Department does not invent subjects. That is your department.",
  ambiguous: "That name matches several people. The Department does not guess which one you resent. Be specific.",
  notHuman: "The Department does not process private citizens on request. Or places. Or bands. It assesses individual humans with a public record.",
  lookup: "The public record is unreachable. The Department will not assess from memory alone. Try again shortly.",
  minor: "The Department does not process minors on request. The subject's file stays closed until they are of age.",
  victim: "The Department does not file people whose public record is something done to them. Refer someone who did something.",
  pending_case: "The subject's case has not reached a verdict. The Department does not file the untried. It can wait. It is very good at waiting.",
  withdrawn: "This file has been withdrawn by the Department. It is not reopened on request.",
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
    const p31 = await claimIds(fetchImpl, summary?.wikibase_item, "P31");
    // Birth and death only for a human: they decide minor and living.
    let life = {};
    if (p31.includes(HUMAN)) {
      const [born, died] = await Promise.all(["P569", "P570"].map(p => claimTimes(fetchImpl, summary.wikibase_item, p)));
      life = { born: born[0] || null, died: died.length > 0 };
    }
    return classifySummary(summary, p31, life);
  } catch (err) {
    console.error("wikipedia lookup failed", err?.message || err);
    return { ok: false, reason: "lookup" };
  }
}

async function claims(fetchImpl, qid, prop) {
  if (!qid || !/^Q\d+$/.test(qid)) return [];
  const data = await getJson(fetchImpl, `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=${prop}&format=json&origin=*`);
  return (data?.claims?.[prop] || []).map(c => c?.mainsnak);
}
const claimIds = async (f, qid, prop) => (await claims(f, qid, prop)).map(s => s?.datavalue?.value?.id).filter(Boolean);
// A death claim with an unknown value ("somevalue") still means dead, so any snak counts.
const claimTimes = async (f, qid, prop) => (await claims(f, qid, prop)).map(s => s?.datavalue?.value?.time || (s ? "unknown" : null)).filter(Boolean);

// "+1994-07-05T00:00:00Z" -> age in whole years at `now`, or null when unknown.
export function ageFrom(time, now = new Date()) {
  const m = /^([+-]\d+)-(\d\d)-(\d\d)/.exec(String(time || ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) || 1, d = Number(m[3]) || 1;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age;
}

// Pure: summary JSON + P31 ids + { born, died } -> verdict. Exported for the self-check.
// living: no death on record. A living subject's verdict is held for review, not published.
export function classifySummary(summary, p31 = [], life = {}, now = new Date()) {
  if (!summary || !summary.title) return { ok: false, reason: "none" };
  if (summary.type === "disambiguation") return { ok: false, reason: "ambiguous" };
  if (!p31.includes(HUMAN)) return { ok: false, reason: "notHuman" };
  const living = !life.died;
  const age = ageFrom(life.born, now);
  if (living && age !== null && age < 18) return { ok: false, reason: "minor" };
  return {
    ok: true,
    title: summary.title,
    description: String(summary.description || "").slice(0, 200),
    extract: String(summary.extract || "").slice(0, 1500),
    wikidata: summary.wikibase_item,
    living,
  };
}

// Calendar-month bucket for the per-case quota (UTC).
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const PER_CASE_MONTHLY = 3;
export const remainingThisMonth = used => Math.max(0, PER_CASE_MONTHLY - (used || 0));

// Referred figures: a verdict reaches the public only once published. Dead subjects are
// published on creation; a living subject's verdict waits for review
// (scripts/referral_sprites.py --approve). Until then the pen shows score and tier.
export const verdictPublished = c => c?.verdictStatus === "published";
export const publicFigure = c => ({
  slug: c.slug, name: c.name, score: c.score, tier: c.tier,
  breakdown: verdictPublished(c) ? c.breakdown : null, verdict: verdictPublished(c) ? c.verdict : null,
  underReview: !verdictPublished(c), noDangle: Boolean(c.noDangle),
  sprite: c.sprite ?? null, spriteStatus: c.spriteStatus || "pending", kind: "figure", referred: true,
});
