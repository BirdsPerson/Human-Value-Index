// Candidate people for the roster engine, free and stratified.
//
// Two free sources:
//   - MIT Pantheon (api.pantheon.world): ~120k people indexed by occupation, birth year and
//     number of Wikipedia language editions (l). Fast, and l is the fame band we need.
//   - Wikidata SPARQL for the strata Pantheon doesn't carry: service lives (nurses,
//     missionaries, social workers, Nobel Peace laureates) and the convicted (P1399).
//     Broad Wikidata classes (all politicians) time out, which is why Pantheon does those.
//
// Every candidate is then resolved through Wikipedia + Wikidata the same way a referral
// is (classifySummary): a real human, not a minor, life dates from Wikidata.
//
//   node scripts/roster/candidates.mjs 16        # print a cohort (no writes)
import { EXCLUDED_QIDS, excludedAmong } from "../../netlify/lib/excluded.js";
import { classifySummary } from "../../netlify/lib/refer.js";
import { FIGURE_QIDS } from "../../netlify/lib/refer.js";

const UA = "HumanValueIndex-roster/1.0 (https://humanvalueindex.com; staglias@me.com)";

// Pantheon occupation -> domain. Occupations left out on purpose: PORNOGRAPHIC ACTOR (the
// pen is all-ages), YOUTUBER / GAMER / INSPIRATION (thin public records).
export const DOMAINS = {
  science: ["PHYSICIST", "CHEMIST", "BIOLOGIST", "MATHEMATICIAN", "ASTRONOMER", "INVENTOR", "ENGINEER", "COMPUTER SCIENTIST", "GEOLOGIST", "PSYCHOLOGIST", "ECONOMIST", "ARCHAEOLOGIST", "ANTHROPOLOGIST", "GEOGRAPHER", "LINGUIST", "SOCIOLOGIST", "HISTORIAN", "PHILOSOPHER", "EXPLORER", "ASTRONAUT", "STATISTICIAN"],
  arts: ["ACTOR", "WRITER", "SINGER", "MUSICIAN", "FILM DIRECTOR", "PAINTER", "COMPOSER", "SCULPTOR", "COMIC ARTIST", "PHOTOGRAPHER", "CONDUCTOR", "DANCER", "COMEDIAN", "DESIGNER", "FASHION DESIGNER", "ARCHITECT", "ARTIST", "PRODUCER", "PRESENTER", "CHEF", "MAGICIAN", "MODEL", "CELEBRITY"],
  politics: ["POLITICIAN", "MILITARY PERSONNEL", "NOBLEMAN", "DIPLOMAT", "JUDGE", "LAWYER", "POLITICAL SCIENTIST", "PUBLIC WORKER", "COMPANION"],
  sport: ["SOCCER PLAYER", "ATHLETE", "BASKETBALL PLAYER", "CYCLIST", "TENNIS PLAYER", "WRESTLER", "SWIMMER", "RACING DRIVER", "SKIER", "HOCKEY PLAYER", "BOXER", "HANDBALL PLAYER", "SKATER", "GYMNAST", "COACH", "CHESS PLAYER", "FENCER", "VOLLEYBALL PLAYER", "MARTIAL ARTS", "BADMINTON PLAYER", "CRICKETER", "REFEREE", "RUGBY PLAYER", "BASEBALL PLAYER", "TABLE TENNIS PLAYER", "GOLFER", "AMERICAN FOOTBALL PLAYER", "SNOOKER", "MOUNTAINEER", "PILOT", "GO PLAYER"],
  religion: ["RELIGIOUS FIGURE", "OCCULTIST"],
  business: ["BUSINESSPERSON"],
  activism: ["SOCIAL ACTIVIST", "JOURNALIST"],
  crime: ["EXTREMIST", "MAFIOSO", "PIRATE"],
};

// Birth-year eras. "living" is decided later from Wikidata (no death on record).
export const ERAS = [
  ["ancient", -3000, 500], ["medieval", 500, 1500], ["early_modern", 1500, 1800],
  ["c19", 1800, 1900], ["c20", 1900, 2010],
];
export const eraOf = (year, living) => living ? "living" : (ERAS.find(([, a, b]) => year >= a && year < b)?.[0] ?? "c20");

// The mix per cohort. The middle band (15-60 language editions) matters most: famous
// figures are almost never "decent but ineffective" or "overlooked", so the octants those
// describe stay empty without ordinary-middle people.
export const MIX = [["middle", 0.5], ["service", 0.2], ["notorious", 0.15], ["famous", 0.15]];

// Slot counts for n that sum to n exactly (largest remainder).
export function planSlots(n) {
  const raw = MIX.map(([k, p]) => [k, n * p]);
  const out = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
  let left = n - Object.values(out).reduce((a, b) => a + b, 0);
  for (const [k] of [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1))) { if (left-- <= 0) break; out[k]++; }
  return out;
}

async function getJson(url, init = {}, ms = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json", ...(init.headers || {}) }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 120)}`);
    return { data: await r.json(), headers: r.headers };
  } finally { clearTimeout(t); }
}

const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- Pantheon ---------------------------------------------------------------------------
const PANTHEON = "https://api.pantheon.world";
function pantheonQuery(occs, [lo, hi], [ya, yb]) {
  const occ = occs.map(o => `"${o}"`).join(",");
  return `occupation=in.(${encodeURIComponent(occ)})&l=gte.${lo}&l=lte.${hi}&birthyear=gte.${ya}&birthyear=lt.${yb}`;
}

// Up to `k` random people from one domain x era x fame band, with their Wikidata ids.
export async function pantheonSample(domain, era, band, k = 12) {
  const [, ya, yb] = ERAS.find(([e]) => e === era) || ERAS[ERAS.length - 1];
  const q = pantheonQuery(DOMAINS[domain], band, [ya, yb]);
  const head = await fetch(`${PANTHEON}/person_ranks?${q}&select=id&limit=1`, { headers: { Prefer: "count=exact", "User-Agent": UA } });
  const total = Number((head.headers.get("content-range") || "").split("/")[1] || 0);
  if (!total) return [];
  const offset = Math.max(0, Math.floor(Math.random() * Math.max(1, total - k)));
  const rows = (await getJson(`${PANTHEON}/person_ranks?${q}&select=id,name,l,occupation,birthyear&limit=${k}&offset=${offset}`))?.data || [];
  if (!rows.length) return [];
  const people = (await getJson(`${PANTHEON}/person?id=in.(${rows.map(r => r.id).join(",")})&select=id,wd_id`))?.data || [];
  const qid = new Map(people.map(p => [p.id, p.wd_id]));
  return rows.filter(r => qid.get(r.id)).map(r => ({ qid: qid.get(r.id), label: r.name, links: r.l, occupation: r.occupation, source: "pantheon" }));
}

// ---- Wikidata (service lives and the convicted) -------------------------------------------
export const WIKIDATA_POOLS = {
  service: [
    "?item wdt:P106 wd:Q186360.",   // nurse
    "?item wdt:P106 wd:Q219477.",   // missionary
    "?item wdt:P106 wd:Q7019111.",  // social worker
    "?item wdt:P166 wd:Q35637.",    // Nobel Peace Prize
    "?item wdt:P106 wd:Q37226.",    // teacher
    "?item wdt:P106 wd:Q39631.",    // physician
  ],
  notorious: [
    "?item wdt:P1399 ?conv.",       // convicted of (anything)
  ],
};

export async function wikidataSample(pattern, k = 12, maxLinks = 200) {
  const query = `SELECT DISTINCT ?item ?links WHERE { ${pattern} ?item wdt:P31 wd:Q5; wikibase:sitelinks ?links. FILTER(?links >= 15 && ?links <= ${maxLinks}) } LIMIT 400`;
  const res = await getJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, { headers: { Accept: "application/sparql-results+json" } }, 60000);
  const rows = (res?.data?.results?.bindings || []).map(b => ({ qid: b.item.value.split("/").pop(), links: Number(b.links.value), source: "wikidata" }));
  return shuffle(rows).slice(0, k);
}

// ---- resolve a Wikidata id the way a referral is resolved ------------------------------
const claimTime = (claims, p) => { const s = claims?.[p]?.[0]?.mainsnak; return s ? (s.datavalue?.value?.time || "unknown") : null; };

export async function resolveQid(qid) {
  const ent = (await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks|claims&sitefilter=enwiki&format=json`))?.data?.entities?.[qid];
  const title = ent?.sitelinks?.enwiki?.title;
  if (!title) return { ok: false, reason: "no-enwiki" };
  const p31 = (ent.claims?.P31 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const summary = (await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`))?.data;
  const life = { born: claimTime(ent.claims, "P569"), died: claimTime(ent.claims, "P570") };
  const r = classifySummary(summary, p31, life);
  return r.ok ? { ...r, wikidata: qid } : r;
}

// Founders and prophets of the world's faiths: never drafted (netlify/lib/excluded.js).
export const skipByPolicy = async (qid, fetchImpl = fetch) => (await excludedAmong([qid], fetchImpl)).has(qid);

// Rows not already on file, deduped by Wikidata id (not by name: namesakes are different people).
export function freshRows(rows, taken) {
  const seen = new Set();
  return rows.filter(r => r?.qid && !taken.has(r.qid) && !seen.has(r.qid) && seen.add(r.qid));
}

const bornYear = born => { const m = /^(-?\d+)/.exec(String(born || "")); return m ? Number(m[1]) : null; };

// ---- the cohort -----------------------------------------------------------------------
// taken: Set of Wikidata ids already on file (the 62 + production cards) plus this run's.
export async function buildCohort(n, taken = new Set(), { log = () => {} } = {}) {
  for (const q of Object.values(FIGURE_QIDS)) taken.add(q);
  // Founders and prophets of the world's faiths are never assessed (netlify/lib/excluded.js).
  for (const q of Object.keys(EXCLUDED_QIDS)) taken.add(q);
  const slots = planSlots(n);
  const out = [];
  const domains = Object.keys(DOMAINS).filter(d => d !== "crime");
  const eras = ERAS.map(([e]) => e);

  async function take(pool, source, fetchRows, meta) {
    for (const row of freshRows(await fetchRows(), taken)) {
      taken.add(row.qid);
      if (await skipByPolicy(row.qid)) { log(`skip ${row.qid} (${row.label || ""}): excluded by policy`); continue; }
      const wiki = await resolveQid(row.qid).catch(e => ({ ok: false, reason: e.message }));
      if (!wiki.ok) { log(`skip ${row.qid} (${row.label || ""}): ${wiki.reason}`); continue; }
      const era = eraOf(bornYear(wiki.born), wiki.living);
      out.push({ ...wiki, stratum: { pool, source, era, links: row.links, ...meta(row) } });
      return true;
    }
    return false;
  }

  for (const pool of ["middle", "famous"]) {
    const band = pool === "middle" ? [15, 60] : [61, 400];
    let tries = 0;
    while (out.filter(c => c.stratum.pool === pool).length < slots[pool] && tries++ < slots[pool] * 6) {
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const era = eras[Math.floor(Math.random() * eras.length)];
      await take(pool, "pantheon", () => pantheonSample(domain, era, band), row => ({ domain, occupation: row.occupation }));
    }
  }
  for (const pool of ["service", "notorious"]) {
    let tries = 0;
    const pats = WIKIDATA_POOLS[pool];
    while (out.filter(c => c.stratum.pool === pool).length < slots[pool] && tries++ < slots[pool] * 6) {
      // Notorious alternates between the convicted (Wikidata) and extremists, mafiosi and
      // pirates (Pantheon), so it isn't only modern criminal cases.
      if (pool === "notorious" && tries % 2 === 0) {
        const era = eras[Math.floor(Math.random() * eras.length)];
        await take(pool, "pantheon", () => pantheonSample("crime", era, [15, 400]), row => ({ domain: "crime", occupation: row.occupation }));
      } else {
        const pat = pats[Math.floor(Math.random() * pats.length)];
        await take(pool, "wikidata", () => wikidataSample(pat), () => ({ domain: pool === "service" ? "service" : "crime", query: pat }));
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] || 16);
  const cohort = await buildCohort(n, new Set(), { log: m => console.error(m) });
  for (const c of cohort) console.log(`${c.stratum.pool.padEnd(9)} ${c.stratum.era.padEnd(12)} ${String(c.stratum.domain).padEnd(9)} ${c.title}  (${c.wikidata}, ${c.born || "?"}–${c.died || ""}) ${c.description}`);
}
