// Real-life ties among the subjects on file, from Wikidata: spouses (divorce runs cold),
// partners (former ones barely warm), siblings, parents, relatives, teachers, business/sport partners, documented
// friends and rivals, bandmates, and teammates whose spells at a club overlapped.
// Writes src/city/ties.js; the social tick seeds each tie once (src/city/social.js seedTies)
// and the sim takes over from there.
//   node scripts/fetch-ties.mjs            # dry run: prints the ties
//   node scripts/fetch-ties.mjs --write    # writes src/city/ties.js
// ponytail: a snapshot, re-run by hand after a referral wave; a referral's ties wait for the
// next run. Move it into the referral job if ties for new files should appear on their own.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FAMOUS_FIGURES } from "../src/figures.js";
import { keyOf } from "../src/city/sim.js";

// [record kind, starting affinity, the record in the Overlord's words]
export const KINDS = {
  divorced: [-25, "MARRIED, THEN DIVORCED"],
  spouse: [55, "MARRIED"],
  partner: [45, "PARTNERS"],
  parent: [45, "PARENT AND CHILD"],
  sibling: [40, "SIBLINGS"],
  friend: [45, "FRIENDS ON THE RECORD"],
  rival: [-35, "RIVALS ON THE RECORD"],
  band: [35, "BANDMATES"],
  teacher: [30, "TEACHER AND STUDENT"],
  team: [25, "TEAMMATES"],
  relative: [20, "RELATED"],
  former: [10, "FORMERLY PARTNERS"],
};
const ORDER = Object.keys(KINDS);   // one tie per pair: the first kind in this order wins

const PROPS = { P26: "spouse", P451: "partner", P40: "parent", P22: "parent", P25: "parent", P3373: "sibling",
  P1038: "relative", P1066: "teacher", P802: "teacher", P3342: "significant" };
// P1327 (partner in business or sport) is left out: on file it pairs Hitler with Stalin.
const DIVORCE = "Q93190";

// Pure. rows: {a, prop, b, endCause, ended, role, group, groupKind, start, end} (QIDs / labels / years);
// keyOfQid: QID -> subject key. Returns sorted [keyA, keyB, affinity, why].
export function tiesFrom(rows, keyOfQid) {
  const best = new Map();
  const put = (qa, qb, kind, suffix = "") => {
    const a = keyOfQid.get(qa), b = keyOfQid.get(qb);
    if (!a || !b || a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const k = `${x}|${y}`, cur = best.get(k);
    if (cur && ORDER.indexOf(cur.kind) <= ORDER.indexOf(kind)) return;
    best.set(k, { x, y, kind, suffix });
  };
  const groups = new Map();
  for (const r of rows) {
    if (r.group) {
      const g = groups.get(r.group) || { label: r.groupLabel, kind: r.groupKind, members: [] };
      g.members.push(r);
      groups.set(r.group, g);
      continue;
    }
    let kind = PROPS[r.prop];
    if (!kind) continue;
    if (kind === "spouse" && r.endCause === DIVORCE) kind = "divorced";
    if (kind === "partner" && (r.ended || r.endCause)) kind = "former";
    if (kind === "significant") {
      const role = String(r.role || "").toLowerCase();
      kind = /rival|enemy|adversary|opponent/.test(role) ? "rival" : /friend/.test(role) ? "friend" : null;
      if (!kind) continue;
    }
    put(r.a, r.b, kind);
  }
  for (const g of groups.values()) {
    const m = g.members;
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
      if (g.kind === "team" && !overlap(m[i], m[j])) continue;
      put(m[i].a, m[j].a, g.kind, g.label ? ` AT ${g.label.toUpperCase()}` : "");
    }
  }
  return [...best.values()]
    .map(({ x, y, kind, suffix }) => [x, y, KINDS[kind][0], KINDS[kind][1] + (kind === "band" || kind === "team" ? suffix : "")])
    .sort((p, q) => (p[0] + p[1] < q[0] + q[1] ? -1 : 1));
}

// Teammates only if both spells are dated and overlap: a club's roster spans a century.
function overlap(p, q) {
  const n = v => (v == null || v === "" ? null : Number(v));
  const [s1, e1, s2, e2] = [n(p.start), n(p.end) ?? n(p.start), n(q.start), n(q.end) ?? n(q.start)];
  if (s1 == null || s2 == null) return false;
  return s1 <= e2 && s2 <= e1;
}

// ---- network ----------------------------------------------------------------------------
const UA = "HumanValueIndex/1.0 (https://humanvalueindex.com; ties among subjects)";
async function sparql(q) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) return (await r.json()).results.bindings;
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error("wikidata sparql failed");
}
const id = v => String(v?.value || "").split("/").pop() || null;
const year = v => { const m = /^(-?)0*(\d+)-/.exec(String(v?.value || "")); return m ? Number(`${m[1]}${m[2]}`) : null; };

// The 62 figures on record carry no QID: resolve through English Wikipedia titles.
async function qidsOfNames(names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 40) {
    const titles = names.slice(i, i + 40).join("|");
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item|disambiguation&titles=${encodeURIComponent(titles)}`, { headers: { "User-Agent": UA } });
    const d = await r.json();
    const back = new Map();
    for (const x of d.query?.normalized || []) back.set(x.to, x.from);
    for (const x of d.query?.redirects || []) back.set(x.to, back.get(x.from) || x.from);
    for (const p of Object.values(d.query?.pages || {})) {
      if (!p.pageprops?.wikibase_item || "disambiguation" in p.pageprops) continue;
      out.set(back.get(p.title) || p.title, p.pageprops.wikibase_item);
    }
  }
  return out;
}

async function rowsFor(qids) {
  const rows = [];
  for (let i = 0; i < qids.length; i += 80) {
    const values = qids.slice(i, i + 80).map(q => `wd:${q}`).join(" ");
    const props = Object.keys(PROPS).map(p => `(p:${p} ps:${p})`).join(" ");
    for (const b of await sparql(`SELECT ?a ?p ?b ?end ?ended ?role WHERE { VALUES ?a { ${values} } VALUES (?p ?ps) { ${props} }
      ?a ?p ?st . ?st ?ps ?b . OPTIONAL { ?st pq:P1534 ?end } OPTIONAL { ?st pq:P582 ?ended } OPTIONAL { ?st pq:P3831|pq:P2868 ?r . ?r rdfs:label ?role FILTER(lang(?role) = "en") } }`)) {
      rows.push({ a: id(b.a), prop: id(b.p), b: id(b.b), endCause: id(b.end), ended: Boolean(b.ended), role: b.role?.value });
    }
    // Bands (member of a musical ensemble) and clubs (member of sports team, dated spells).
    for (const b of await sparql(`SELECT ?a ?g ?gl ?s ?e WHERE { VALUES ?a { ${values} } ?a p:P463 ?st . ?st ps:P463 ?g .
      ?g wdt:P31/wdt:P279* wd:Q2088357 . OPTIONAL { ?g rdfs:label ?gl FILTER(lang(?gl) = "en") } }`)) {
      rows.push({ a: id(b.a), group: id(b.g), groupLabel: b.gl?.value, groupKind: "band" });
    }
    for (const b of await sparql(`SELECT ?a ?g ?gl ?s ?e WHERE { VALUES ?a { ${values} } ?a p:P54 ?st . ?st ps:P54 ?g .
      OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } OPTIONAL { ?g rdfs:label ?gl FILTER(lang(?gl) = "en") } }`)) {
      rows.push({ a: id(b.a), group: id(b.g), groupLabel: b.gl?.value, groupKind: "team", start: year(b.s), end: year(b.e) });
    }
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { figureIndex } = await import("./roster/prod.mjs");
  const cards = (await figureIndex()).filter(c => c.wikidata && !c.withdrawn && !c.removed);
  const keyOfQid = new Map(cards.map(c => [c.wikidata, c.slug]));
  const onRecord = await qidsOfNames(FAMOUS_FIGURES.map(f => f.name));
  const unresolved = [];
  for (const f of FAMOUS_FIGURES) {
    const q = onRecord.get(f.name);
    if (!q) { unresolved.push(f.name); continue; }
    if (!keyOfQid.has(q)) keyOfQid.set(q, keyOf(f));
  }
  const rows = await rowsFor([...keyOfQid.keys()]);
  const ties = tiesFrom(rows, keyOfQid);
  console.log(`${keyOfQid.size} subjects with a QID (${cards.length} cards, ${FAMOUS_FIGURES.length - unresolved.length} on record); unresolved: ${unresolved.join(", ") || "none"}`);
  for (const t of ties) console.log(`  ${t[2] > 0 ? "+" : ""}${t[2]}  ${t[0]} / ${t[1]}  ${t[3]}`);
  console.log(`${ties.length} ties`);
  if (process.argv.includes("--write")) {
    writeFileSync(new URL("../src/city/ties.js", import.meta.url),
      `// Generated by scripts/fetch-ties.mjs from Wikidata (${new Date().toISOString().slice(0, 10)}). Do not edit by hand:\n` +
      `// hand-curated ties go in KNOWN_TIES (src/city/social.js).\n// [slugA, slugB, starting affinity, the record]\n` +
      `export const RECORD_TIES = ${JSON.stringify(ties, null, 0).replace(/\],\[/g, "],\n  [").replace(/^\[\[/, "[\n  [").replace(/\]\]$/, "],\n]")};\n`);
    console.log("wrote src/city/ties.js");
  }
}
