// Policy (Scott, 2026-09-26): the Department does not score or depict the founders of the
// world's major faiths, or the prophets and messengers central to them. The satire is aimed
// at social scoring, not at anyone's religion, and a public "value index" for a prophet reads
// as an insult to the faith whatever the intent. Clergy, popes, saints, reformers and
// religious scholars are NOT covered (Jan Hus, Mother Teresa, Pope John II stay on file).
//
// Two layers: a curated Wikidata QID denylist, and a Wikidata backstop for anyone the list
// misses (occupation "prophet" / "founder of religion", or recorded as founder of a major
// religion), limited to people born before 1850 so modern self-styled prophets and cult
// leaders are still assessed like anyone else.

export const EXCLUDED_QIDS = {
  Q9458: "Muhammad",
  Q302: "Jesus",
  Q9077: "Moses",
  Q9181: "Abraham",
  Q9441: "Gautama Buddha",
  Q83322: "Guru Nanak",
  Q35811: "Zoroaster",
  Q9333: "Laozi",
  Q101054: "Baháʼu'lláh",
  Q104273: "The Báb",
  Q9422: "Mahavira",
};

export const EXCLUDED_LINE = "The Department does not assess the founders of the world's faiths. Those files are sealed by policy.";

export const isExcludedQid = qid => Object.hasOwn(EXCLUDED_QIDS, String(qid || ""));

// prophet Q42857, founder of religion Q2142783; major religions whose "founded by" (P112)
// names the subject: Islam, Christianity, Judaism, Buddhism, Sikhism, Zoroastrianism,
// Taoism, Jainism, Hinduism, Baháʼí Faith.
const MAJOR_RELIGIONS = ["Q432", "Q5043", "Q9268", "Q748", "Q9316", "Q9601", "Q9598", "Q9232", "Q9089", "Q22679"];
export const BACKSTOP_BORN_BEFORE = 1850;

export function backstopQuery(qids) {
  const values = qids.filter(q => /^Q\d+$/.test(q)).map(q => `wd:${q}`).join(" ");
  const rels = MAJOR_RELIGIONS.map(q => `wd:${q}`).join(" ");
  return `SELECT DISTINCT ?item ?born WHERE { VALUES ?item { ${values} }
    { ?item wdt:P106 wd:Q42857 } UNION { ?item wdt:P106 wd:Q2142783 } UNION { VALUES ?rel { ${rels} } ?rel wdt:P112 ?item }
    OPTIONAL { ?item wdt:P569 ?born } }`;
}

// Pure: SPARQL bindings -> Set of excluded QIDs (born before the cutoff, or no birth date).
export function backstopFrom(bindings) {
  const out = new Set();
  for (const b of bindings || []) {
    const qid = String(b?.item?.value || "").split("/").pop();
    if (!/^Q\d+$/.test(qid)) continue;
    const m = /^(-?)0*(\d+)-/.exec(String(b?.born?.value || ""));
    const year = m ? Number(`${m[1]}${m[2]}`) : null;
    if (year === null || year < BACKSTOP_BORN_BEFORE) out.add(qid);
  }
  return out;
}

// qids -> Set of excluded QIDs (denylist first; one SPARQL query for the rest). A failed
// backstop lookup excludes nothing extra: the denylist still holds.
export async function excludedAmong(qids, fetchImpl = fetch) {
  const list = [...new Set((qids || []).filter(q => /^Q\d+$/.test(String(q))))];
  const out = new Set(list.filter(isExcludedQid));
  const rest = list.filter(q => !out.has(q));
  if (!rest.length) return out;
  try {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(backstopQuery(rest))}`;
    const res = await fetchImpl(url, { headers: { "User-Agent": "HumanValueIndex/1.0 (https://humanvalueindex.com; policy check)", Accept: "application/sparql-results+json" } });
    if (res.ok) for (const q of backstopFrom((await res.json())?.results?.bindings)) out.add(q);
  } catch { /* denylist only */ }
  return out;
}
