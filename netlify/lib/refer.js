import { cube } from "./intake.js";
import { judged } from "../../src/cube.js";
// Referral logic: name validation, the Wikipedia gate, slugs and dedupe against the
// figures already on file. The Wikipedia calls take an injectable fetch so
// scripts/check-refer.mjs can run them offline.
import { FAMOUS_FIGURES, slugify, displayName as displayNameOf } from "../../src/figures.js";

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
// Takes Wikipedia's top hit: callers that care about namesakes ask resolveCandidates first.
export async function resolveWikipedia(name, fetchImpl = fetch) {
  try {
    const q = encodeURIComponent(name);
    const search = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`);
    const hit = search?.query?.search?.[0];
    if (!hit?.title) return { ok: false, reason: "none" };
    return await resolveTitleOnce(hit.title, fetchImpl);
  } catch (err) {
    console.error("wikipedia lookup failed", err?.message || err);
    return { ok: false, reason: "lookup" };
  }
}

// An exact Wikipedia title (picked from a candidate list) -> the same verdict shape.
export async function resolveTitle(title, fetchImpl = fetch) {
  try {
    return await resolveTitleOnce(title, fetchImpl);
  } catch (err) {
    console.error("wikipedia title lookup failed", err?.message || err);
    return { ok: false, reason: "lookup" };
  }
}

async function resolveTitleOnce(title, fetchImpl) {
  const summary = await getJson(fetchImpl, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, "_"))}`);
  const p31 = await claimIds(fetchImpl, summary?.wikibase_item, "P31");
  // Birth and death only for a human: they decide minor and living.
  let life = {};
  if (p31.includes(HUMAN)) {
    const [born, died] = await Promise.all(["P569", "P570"].map(p => claimTimes(fetchImpl, summary.wikibase_item, p)));
    life = { born: born[0] || null, died: died[0] || null };
  }
  return classifySummary(summary, p31, life);
}

// ---- namesakes ------------------------------------------------------------
// "Jack Johnson" is a boxer, a musician and several others. Wikipedia's primary topic
// is not an answer to which one the subject meant. Candidates are humans whose title is
// the typed name, bare or with a qualifier ("Jack Johnson (musician)"), gathered from
// the search results and the name's disambiguation page, ordered by notability
// (Wikidata sitelinks). ~4 requests: search, links, page props, one SPARQL query.
export const MAX_CANDIDATES = 8;
// A candidate this many times more notable than the next is what nearly everyone means
// ("Michael Jackson" is not the writer): proceed without asking.
export const DOMINANCE = 10;
export const baseSlug = title => titleSlug(title);
export const matchesName = (title, name) => baseSlug(title) === slugify(name);

export async function resolveCandidates(name, fetchImpl = fetch) {
  try {
    const q = encodeURIComponent(name);
    const search = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=10&format=json&origin=*`);
    const titles = new Set((search?.query?.search || []).map(h => h.title).filter(t => matchesName(t, name)));
    // The bare name and "<name> (disambiguation)": when either is a disambiguation page,
    // its links carry the namesakes the search missed.
    const pages = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(`${name}|${name} (disambiguation)`)}&prop=pageprops|links&pllimit=500&plnamespace=0&redirects=1&format=json&origin=*`);
    for (const pg of Object.values(pages?.query?.pages || {})) {
      if (pg.missing !== undefined || !pg.title) continue;
      if (pg.pageprops && "disambiguation" in pg.pageprops) {
        for (const l of pg.links || []) if (matchesName(l.title, name)) titles.add(l.title);
      } else if (matchesName(pg.title, name)) titles.add(pg.title);
    }
    const list = [...titles].slice(0, 30);
    if (!list.length) return { ok: true, candidates: [] };
    const meta = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(list.join("|"))}&prop=pageprops|description&redirects=1&format=json&origin=*`);
    const byQid = new Map();
    for (const pg of Object.values(meta?.query?.pages || {})) {
      const qid = pg?.pageprops?.wikibase_item;
      if (!qid || !/^Q\d+$/.test(qid) || pg.pageprops.disambiguation !== undefined) continue;
      if (!matchesName(pg.title, name) || byQid.has(qid)) continue;
      byQid.set(qid, { title: pg.title, description: String(pg.description || "").slice(0, 160), qid });
    }
    if (!byQid.size) return { ok: true, candidates: [] };
    const facts = await humanFacts([...byQid.keys()], fetchImpl);
    const candidates = [...byQid.values()].filter(c => facts.has(c.qid))
      .map(c => ({ ...c, ...facts.get(c.qid) }))
      .sort((a, b) => b.sitelinks - a.sitelinks || a.title.localeCompare(b.title))
      .slice(0, MAX_CANDIDATES);
    return { ok: true, candidates };
  } catch (err) {
    console.error("namesake lookup failed", err?.message || err);
    return { ok: false, reason: "lookup" };
  }
}

// One SPARQL query: which of these items are humans, their notability and life years.
async function humanFacts(qids, fetchImpl) {
  const values = qids.filter(q => /^Q\d+$/.test(q)).map(q => `wd:${q}`).join(" ");
  const sparql = `SELECT ?item ?sl ?born ?died WHERE { VALUES ?item { ${values} } ?item wdt:P31 wd:Q5 . OPTIONAL { ?item wikibase:sitelinks ?sl } OPTIONAL { ?item wdt:P569 ?born } OPTIONAL { ?item wdt:P570 ?died } }`;
  const data = await getJson(fetchImpl, `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, 10000);
  const out = new Map();
  for (const b of data?.results?.bindings || []) {
    const qid = String(b.item?.value || "").split("/").pop();
    if (!qid || out.has(qid)) continue;
    out.set(qid, { sitelinks: Number(b.sl?.value) || 0, born: yearOf(b.born?.value), died: yearOf(b.died?.value) });
  }
  return out;
}
// SPARQL dateTime ("1878-03-31T00:00:00Z", "-0470-01-01T...") -> "1878" / "-470". Blank nodes -> null.
export const yearOf = v => { const m = /^(-?)0*(\d+)-/.exec(String(v || "")); return m ? `${m[1]}${m[2]}` : null; };

// Pure: ask the referrer to pick when two or more humans share the name and none of them
// dwarfs the rest.
export function needsChoice(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) return false;
  const [a, b] = candidates;
  return !(a.sitelinks >= DOMINANCE * Math.max(1, b.sitelinks));
}

// "Prince (musician)" -> "musician"; "Jack Johnson" + "American boxer (1878–1946)" -> "boxer".
export function qualifierFrom(title, description) {
  const paren = /\(([^)]+)\)\s*$/.exec(String(title || ""));
  if (paren) return paren[1].trim().toLowerCase().slice(0, 40);
  let d = String(description || "").replace(/\([^)]*\)/g, " ").replace(/\b\d{3,4}s?\b/g, " ").replace(/[–—-]\s*$/, "").trim();
  d = d.split(/,|;| and | who | from /)[0].trim();
  const words = d.split(/\s+/).filter(Boolean);
  while (words.length > 1 && /^[A-Z]/.test(words[0])) words.shift();   // drop "American", "English"...
  const q = words.slice(0, 3).join(" ").toLowerCase().replace(/[^a-z0-9 '\-]/g, "").trim();
  return q || null;
}

// The name as shown everywhere: namesakes carry their qualifier ("Jack Johnson (boxer)").
export { displayName } from "../../src/figures.js";

async function claims(fetchImpl, qid, prop) {
  if (!qid || !/^Q\d+$/.test(qid)) return [];
  const data = await getJson(fetchImpl, `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=${prop}&format=json&origin=*`);
  return (data?.claims?.[prop] || []).map(c => c?.mainsnak);
}
const claimIds = async (f, qid, prop) => (await claims(f, qid, prop)).map(s => s?.datavalue?.value?.id).filter(Boolean);
// A death claim with an unknown value ("somevalue") still means dead, so any snak counts.
const claimTimes = async (f, qid, prop) => (await claims(f, qid, prop)).map(s => s?.datavalue?.value?.time || (s ? "unknown" : null)).filter(Boolean);

// Wikidata time -> ISO-ish date: "+1946-01-19T00:00:00Z" -> "1946-01-19", a year-precision
// "+1946-00-00T..." -> "1946", BCE "-0470-00-00T..." -> "-0470". "unknown" (a death with no
// recorded date) stays "unknown": still dead. Anything else -> null.
export function wikiDate(time) {
  if (time === "unknown") return "unknown";
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(String(time || ""));
  if (!m) return null;
  const y = (m[1] === "-" ? "-" : "") + m[2].padStart(4, "0");
  if (m[3] === "00") return y;
  return m[4] === "00" ? `${y}-${m[3]}` : `${y}-${m[3]}-${m[4]}`;
}

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
// living: no death on record in Wikidata.
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
    // Life dates come from Wikidata, never the model: people die after its knowledge cutoff.
    born: wikiDate(life.born),
    died: wikiDate(life.died),
  };
}

// The article's plain text, for the fact-check. The summary alone (a few hundred
// characters) would leave most true claims "unsupported".
export async function fetchArticleText(title, fetchImpl = fetch, max = 120000) {
  const t = encodeURIComponent(String(title));
  const data = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${t}&format=json&origin=*`, 10000);
  const page = Object.values(data?.query?.pages || {})[0];
  return String(page?.extract || "").slice(0, max);
}

// Calendar-month bucket for the per-case quota (UTC).
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const PER_CASE_MONTHLY = 3;
export const remainingThisMonth = used => Math.max(0, PER_CASE_MONTHLY - (used || 0));

// Referred figures: a verdict reaches the public once it has passed the automatic
// fact-check (lib/factCheck.js). One that couldn't be checked is "withheld": the pen
// shows score and tier only.
export const verdictPublished = c => c?.verdictStatus === "published";
export const publicFigure = c => ({
  slug: c.slug, name: displayNameOf(c), baseName: c.name, qualifier: c.qualifier ?? null, score: c.score, tier: c.tier, ...judged(cube(c.breakdown), c.people ?? null),
  breakdown: verdictPublished(c) ? c.breakdown : null, verdict: verdictPublished(c) ? c.verdict : null,
  underReview: !verdictPublished(c), noDangle: Boolean(c.noDangle),
  born: c.born ?? null, died: c.died ?? null,
  sprite: c.sprite ?? null, spriteStatus: c.spriteStatus || "pending", kind: "figure", referred: true,
  // Roster-engine figures fill the registry and the cube; the building samples them.
  engine: c.source === "roster-engine",
});
