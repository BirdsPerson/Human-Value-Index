// THE DAILY COMPLIANCE (docs/PAPER.md): the edition is deterministic from fixed inputs, every
// listing links somewhere the app routes, nobody is quoted (a candidate's platform never prints),
// no death labels, an edition is never rewritten, the comic casts only the Department's own
// characters, and the leader is cut or replaced when the model strays.
//   node scripts/check-paper.mjs
import { readFileSync } from "node:fs";
import { buildEdition, gather, publishEdition, editorialFor, guardEditorial, printable, validHref, ROUTES, DEATH_MARKERS,
  QUOTE_MARKS, editionNo, paperDate, wireOf, editionKey, INDEX_KEY, PAPER_NAME } from "../netlify/lib/paper.js";
import { comicFor, CAST, allowedCast, TEMPLATES } from "../netlify/lib/paper-comic.js";
import { noticeOf, noticesFromLog } from "../netlify/lib/paper-notices.js";
import { FAMOUS_FIGURES } from "../src/figures.js";

let bad = 0;
const ok = (cond, msg) => { if (!cond) { bad++; console.log("  FAIL", msg); } };
const root = new URL("../", import.meta.url).pathname;
const input = JSON.parse(readFileSync(root + "scripts/fixtures/paper-input.json", "utf8"));

// every string in an object, with its path
function* strings(o, path = "") {
  if (typeof o === "string") yield [path, o];
  else if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* strings(o[i], `${path}[${i}]`);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) yield* strings(v, `${path}.${k}`);
}
function* hrefs(o, path = "") {
  if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* hrefs(o[i], `${path}[${i}]`);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "href" || k === "arcadeHref") yield [`${path}.${k}`, v]; else yield* hrefs(v, `${path}.${k}`); }
}

// 1. determinism
const a = buildEdition(structuredClone(input)), b = buildEdition(structuredClone(input));
ok(JSON.stringify(a) === JSON.stringify(b), "the same input builds the same edition");
ok(a.name === PAPER_NAME && a.no === editionNo(input.date) && a.date === input.date, "masthead, number and date");
ok(editionNo("2026-10-05") === 1 && editionNo("2026-10-06") === 2 && editionNo("2027-10-05") === 366, "edition numbers count real days from No. 1");
ok(paperDate(Date.parse("2026-10-06T03:30:00Z")) === "2026-10-05", "the paper's date is New York's");
ok(a.front.lead?.text && a.classifieds.length >= 6 && a.sports.leagues.length === 4, "front page, classifieds and the four leagues are printed");

// 2. links: every href is a route the app answers
const app = readFileSync(root + "src/App.jsx", "utf8") + readFileSync(root + "src/city/City.jsx", "utf8") + readFileSync(root + "src/city/LeagueHub.jsx", "utf8");
for (const r of ROUTES) {
  const base = r.split("/")[0];
  const routed = app.includes(`"${r}"`) || app.includes(`"${base}"`) || app.includes(`^${base}`) || app.includes(`${base}/`);
  ok(routed, `route ${r} is answered by the app`);
}
let nHref = 0;
for (const [p, h] of hrefs(a)) { nHref++; ok(validHref(h), `${p} links to a routed page (${h})`); }
ok(nHref > 30, `listings carry links (${nHref})`);
for (const c of a.classifieds) ok(c.href && c.act && c.title && c.text, `classified ${c.title} has one tap to the place that does it`);

// 3. nobody quoted, nothing labelled: every printed string
for (const [p, s] of strings(a)) {
  ok(!QUOTE_MARKS.test(s), `${p} has no quotation marks`);
  for (const re of DEATH_MARKERS) ok(!re.test(s), `${p} carries no death label (${re})`);
}
// a source that tries: a candidate's platform, quoted gossip, a death label, a quote-laden market why
const living = FAMOUS_FIGURES.find(f => !f.died && !f.harm)?.name || "Some Living Figure";
const PLATFORM = "I WILL PAINT THE COUNCIL CHAMBER IN A STYLE THE DEPARTMENT CANNOT ASSESS";
const fake = {
  "/api/plan": { sectors: {} },
  "/api/market": { board: { hvi: { level: 1000, open: 1000 }, movers: { up: [{ slug: "x", name: living, price: 10, chg: 0.1, why: `"I AM WORTH MORE," SAID ${living}` }], down: [] }, events: [{ day: 1, kind: "run", line: "THE SUBJECT DIED ON THE FLOOR" }], floor: [], count: 1 } },
  "/api/elections": { cycle: 1, state: "open", openAt: 0, closeAt: Date.parse("2026-10-07T00:00:00Z"), races: { arts: { candidates: [{ name: living, platform: PLATFORM, living: true }], voters: 0, result: null } } },
  "/api/social": { events: [{ h: 1, kind: "again", text: `${living} SAID "HELLO" TO THE DEPARTMENT.` }, { h: 1, kind: "again", text: "A GHOST WAS SEEN AT THE PIER." }] },
  "/api/arrivals": { released: [{ name: "Barred Person", tier: "SOYLENT GREEN", harm: "violent_abuse" }], pending: [] },
};
const io = { async get(p) { return fake[p] ?? null; } };
const g = await gather(io, Date.parse("2026-10-06T16:00:00Z"));
const e2 = buildEdition(g);
const all = [...strings(e2)].map(([, s]) => s).join("\n");
ok(!all.includes(PLATFORM), "a candidate's platform is never printed");
ok(!/SAID "HELLO"|I AM WORTH MORE/.test(all), "quoted lines from the sources are dropped");
ok(!/DIED|GHOST/.test(all), "lines with death labels from the sources are dropped");
ok(!all.includes("BARRED PERSON"), "an arrival under a harm finding is not announced");
ok(e2.front.lead && e2.classifieds.some(c => c.href === "#elections" && /VOTE/.test(c.act)), "an open poll is advertised with a VOTE listing");

// 4. comics: only the Department's own characters, for every template and many days
const figureNames = new Set(FAMOUS_FIGURES.map(f => String(f.name).toUpperCase()));
for (const [id, name] of Object.entries(CAST)) ok(!figureNames.has(name), `cast member ${id} is not a person on file`);
const facts = { index: "1000.3", indexPct: 2.1, champion: "THE TENURED NINE", sport: "BASEBALL", winner: "THE CURATED FIVE", loser: "THE DEPARTMENT FIVE", score: "21-12",
  trade: "RECORD STORE", district: "THE STRIP", closed: true, arrivals: 4, motion: "FARM ADOPTED", installed: "THE WATERS", directive: "CURFEW" };
const seen = new Set();
for (let d = 0; d < 400; d++) {
  const date = paperDate(Date.parse("2026-10-05T12:00:00Z") + d * 86400000);
  const sub = Object.fromEntries(Object.entries(facts).filter((_, i) => (d >> (i % 9)) & 1));
  const c = comicFor(date, sub);
  seen.add(c.id);
  ok(JSON.stringify(c) === JSON.stringify(comicFor(date, sub)), `comic ${date} is deterministic`);
  ok(c.panels.length >= 3 && c.panels.length <= 4, `comic ${date} has 3-4 panels`);
  for (const p of c.panels) {
    for (const who of p.cast) ok(allowedCast(who), `comic ${date} casts only the Department's own (${who})`);
    for (const l of p.lines) {
      ok(allowedCast(l.who) && l.name === CAST[l.who], `comic ${date}: ${l.who} speaks under their own name`);
      ok(printable(l.text) && !/\{\w+\}/.test(l.text), `comic ${date}: a clean filled line (${l.text})`);
    }
  }
}
ok(seen.size >= 8, `the template pool gets used (${seen.size} of ${TEMPLATES.length})`);
ok(a.comics.strip.panels.every(p => p.cast.every(allowedCast)), "the fixture edition's strip casts only the Department's own");

// 5. immutability: printed once, never rewritten; a second run is a no-op
const mem = new Map(); let writes = 0;
const store = {
  async get(k) { return mem.has(k) ? structuredClone(mem.get(k).v) : null; },
  async getWithEtag(k) { return mem.has(k) ? { data: structuredClone(mem.get(k).v), etag: mem.get(k).e } : null; },
  async setNew(k, v) { if (mem.has(k)) return false; writes++; mem.set(k, { v: structuredClone(v), e: String(writes) }); return true; },
  async setIf(k, v, etag) { const cur = mem.get(k); if (etag ? cur?.e !== etag : cur) return false; writes++; mem.set(k, { v: structuredClone(v), e: String(writes) }); return true; },
};
const fio = { async get(p) { return fake[p] ?? null; } };
const t1 = Date.parse("2026-10-06T05:00:00Z");
let calls = 0;
const r1 = await publishEdition(store, fio, t1, { charge: async () => true, call: async () => { calls++; return "THE INDEX STANDS AT 1000.0. THE DEPARTMENT HAS NOTED IT. CITIZENS WILL CARRY ON."; } });
const first = JSON.stringify(mem.get(editionKey("2026-10-06")).v);
const r2 = await publishEdition(store, fio, t1 + 3600_000, { charge: async () => true, call: async () => { calls++; return "X"; } });
ok(r1.date === "2026-10-06" && !r1.skipped && r2.skipped, "a day is printed once; the next run skips it");
ok(JSON.stringify(mem.get(editionKey("2026-10-06")).v) === first, "a printed edition is never rewritten");
ok(calls === 1, `one leader request a day at most (${calls})`);
ok(mem.get(INDEX_KEY).v.editions[0].date === "2026-10-06", "the archive lists it");
const keyRace = await store.setNew(editionKey("2026-10-06"), { tampered: true });
ok(!keyRace && !mem.get(editionKey("2026-10-06")).v.tampered, "write-once holds against a second writer");
await publishEdition(store, fio, Date.parse("2026-10-07T05:00:00Z"), {});
ok(mem.get(INDEX_KEY).v.editions.map(e => e.date).join() === "2026-10-07,2026-10-06", "the archive grows newest first");
ok(mem.get(editionKey("2026-10-07")).v.editorial.by === "template", "no model path: the template leader prints");

// 6. the leader: the cap and the guard
const ed = buildEdition(structuredClone(input));
let asked = 0;
const capped = await editorialFor(ed, { charge: async () => false, call: async () => { asked++; return "x"; } });
ok(capped.by === "template" && asked === 0, "over the daily cap: the template, and no request");
const lies = await editorialFor(ed, { charge: async () => true, call: async () => `THE DEPARTMENT REPORTS. "WE WON," SAID A COACH. ${living.toUpperCase()} WAS ARRESTED BY THE PREFECT AND LATER DIED. THE INDEX FELL 4,000 POINTS TO 12. NOTHING ELSE.` });
ok(lies.by === "template", `a leader that quotes, accuses, labels and invents numbers is replaced (${lies.by}: ${lies.text.slice(0, 60)})`);
const fine = guardEditorial(`THE DEPARTMENT HAS READ THE RESULTS. ${ed.front.lead.text}. THE INDEX STANDS AT ${ed.markets.level}. CARRY ON.`, { lead: ed.front.lead.text, index: ed.markets.level });
ok(fine && fine.includes(ed.markets.level), "a leader built from the facts survives the guard");
const cut = guardEditorial(`THE INDEX STANDS AT ${ed.markets.level}. THE TEAM SCORED 999 RUNS. THE DEPARTMENT IS CONTENT. CARRY ON.`, { index: ed.markets.level });
ok(cut && !cut.includes("999"), "an invented number's sentence is cut");

// 7. the wire is printable and linked
const w = wireOf({ mt: input.mt, board: { movers: { up: [{ slug: "a", name: "A", chg: 0.1, why: "UP ON THE CITY'S RECORD." }, { slug: "b", name: "B", chg: 0.1, why: '"QUOTED"' }] }, events: [] }, social: { events: [{ kind: "again", text: "X AND Y MET." }] } });
ok(w.length >= 2 && w.every(x => printable(x.text) && validHref(x.href)), "the wire prints only clean, linked lines");

// 8. notices from git: the city's changes, never the workshop
ok(noticeOf("THE WATERS: playable fishing (#fish) and THE AQUARIUM (#aquarium)")?.href === "#fish", "a notice links to the room it installed");
ok(/^THE DEPARTMENT HAS INSTALLED THE WATERS: playable fishing and THE AQUARIUM\.$/.test(noticeOf("THE WATERS: playable fishing (#fish) and THE AQUARIUM (#aquarium)").text), "a notice reads in-world");
for (const s of ["Docs: tower cutaways", "check-civic: the leagues block", "DRIVES: record Scott's approval", "Sprites: Gemini API backend", "Tennis: the Williamses' faces while their likenesses are pending", "Fix typo in README.md"]) ok(noticeOf(s) === null, `workshop subject dropped: ${s}`);
const log = ["2026-10-05T23:30:00-04:00\x1fTHE WATERS: playable fishing (#fish)", "2026-10-06T00:30:00-04:00\x1fGolf v2: a caddie that reads putts", "2026-10-06T01:00:00-04:00\x1fDocs: nothing"].join("\n");
const days = noticesFromLog(log);
ok(days["2026-10-05"]?.length === 1 && days["2026-10-06"]?.length === 1, "notices fall on New York's day");

if (bad) { console.error(`check-paper: ${bad} failure(s)`); process.exit(1); }
console.log(`check-paper: ok (edition No. ${a.no}, ${nHref} links, lead: ${a.front.lead.text}; ${seen.size} strip templates over 400 days)`);
