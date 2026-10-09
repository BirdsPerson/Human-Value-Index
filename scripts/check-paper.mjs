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
for (const s of ["Community slice 2: friendship cliques become named groups", "Side quests (b): a vouch adds +2", "Hoops S1b: throw-ins"]) ok(!/SLICE|\(B\)|S1B/.test(noticeOf(s)?.text || ""), `workshop labels stripped: ${s}`);
for (const s of ["Docs: tower cutaways", "check-civic: the leagues block", "DRIVES: record Scott's approval", "Sprites: Gemini API backend", "Tennis: the Williamses' faces while their likenesses are pending", "Fix typo in README.md"]) ok(noticeOf(s) === null, `workshop subject dropped: ${s}`);
const log = ["2026-10-05T23:30:00-04:00\x1fTHE WATERS: playable fishing (#fish)", "2026-10-06T00:30:00-04:00\x1fGolf v2: a caddie that reads putts", "2026-10-06T01:00:00-04:00\x1fDocs: nothing"].join("\n");
const days = noticesFromLog(log);
ok(days["2026-10-05"]?.length === 1 && days["2026-10-06"]?.length === 1, "notices fall on New York's day");

// 9. reading (v2, docs/PAPER.md "Reading"): every name printed is linked, every link is routed, the
// copy reads in sentence case, a v1 edition still renders, and the pictures stay inside the rules
const R = await import("../src/paper/read.js");
const WP = await import("../src/paper/wirephoto.js");
const { PERFORMERS } = await import("../src/city/nightlifeSim.js");
const { FIGHTERS } = await import("../src/city/pit.js");
const { RACERS } = await import("../src/city/race.js");
const { TENNIS_ON_FILE } = await import("../src/city/tennis.js");
const { slugify, displayName } = await import("../src/figures.js");
const names = [...new Map([...FAMOUS_FIGURES.map(f => [displayName(f), slugify(f.name)]), ...(input.market?.movers?.up || []).concat(input.market?.movers?.down || []).map(x => [x.name, x.slug]),
  ...(input.arrivals?.released || []).filter(x => !x.harm).map(x => [x.name, x.slug])]).entries()];
const v2 = buildEdition({ ...structuredClone(input), names });
ok(v2.v === 2 && v2.ents && Object.keys(v2.ents).length > 10, `a v2 edition carries its names (${Object.keys(v2.ents || {}).length})`);
for (const [k, e] of Object.entries(v2.ents)) ok(validHref(e.h), `ents ${k} links to a routed page (${e.h})`);
for (const [p, h] of (function* walk(o, path = "") { if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* walk(o[i], `${path}[${i}]`); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "dhref") yield [`${path}.${k}`, v]; else yield* walk(v, `${path}.${k}`); } })(v2)) ok(validHref(h), `${p} links to a routed page (${h})`);
for (const [k, e] of Object.entries(R.GLOSSARY)) if (e.h && !e.h.startsWith("http")) ok(validHref(e.h), `the reader's glossary links ${k} to a routed page (${e.h})`);
for (const h of ["#city/league/pit", "#city/sprawl", "#city/uptown/aurum", "#city?find=madonna", "#shop/closet"]) ok(validHref(h), `validHref answers ${h}`);
for (const h of ["#city/nowhere", "#city/sprawl/aurum", "#city/league/chess", "#market/../x"]) ok(!validHref(h), `validHref refuses ${h}`);
const onFile = new Set([...names.map(([n]) => n.toUpperCase()), ...PERFORMERS.map(x => x[1]), ...FIGHTERS.map(x => x[1]), ...RACERS.map(x => x[1]), ...TENNIS_ON_FILE.map(x => x[1])]);
const SKIP = new Set(["ents", "sources", "comics", "name", "motto", "dateline", "price", "printedAt", "kind", "href", "dhref", "arcadeHref", "key", "cast", "code"]);
function* printed(o, path = "") {
  if (typeof o === "string") yield [path, o];
  else if (Array.isArray(o)) for (let i = 0; i < o.length; i++) yield* printed(o[i], `${path}[${i}]`);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (!SKIP.has(k)) yield* printed(v, `${path}.${k}`);
}
const wordIn = (U, n) => { for (let i = U.indexOf(n); i >= 0; i = U.indexOf(n, i + 1)) if (!/[\p{L}\d]/u.test(U[i - 1] || " ") && !/[\p{L}\d]/u.test(U[i + n.length] || " ")) return true; return false; };
const rm = R.matcherOf(R.entsOf({ edition: v2 }));
let named = 0, caseBad = 0;
for (const [p, s] of printed(v2)) {
  const segs = R.segments(s, rm, new Set());
  const linked = segs.filter(x => x.h).map(x => x.t.toUpperCase());
  for (const n of onFile) {
    if (!wordIn(s.toUpperCase(), n)) continue;
    named++;
    ok(linked.some(t => t === n || t.includes(n) || n.includes(t.replace(/^THE /, ""))), `${p} names ${n} with a link`);
  }
  const t = R.textOf(segs);
  if (R.shouty(s) && s.length > 40 && R.shouty(t)) { caseBad++; ok(false, `${p} still reads in capitals: ${t.slice(0, 60)}`); }
}
ok(named > 5, `figures named across the edition are checked (${named})`);
// the brief: three to five lines, each with one next step to a routed page
const brief = R.briefOf(v2, rm);
ok(brief.length >= 3 && brief.length <= 5 && brief.every(x => x.text && x.act && validHref(x.h)), `TODAY IN 30 SECONDS: ${brief.length} lines, each one tap`);
for (const h of [v2.front.lead, ...v2.front.stories]) ok(validHref(R.nextOf(h, v2).h), `${h.kind}: one next step, routed`);
// a v1 edition (printed before ents) still reads: names from its own listings, sentence case
const v1 = { ...structuredClone(a), v: 1 }; delete v1.ents;
const m1 = R.matcherOf(R.entsOf({ edition: v1 }));
ok(R.briefOf(v1, m1).length >= 3 && R.textOf(R.segments(v1.front.lead.deck || "THE CITY IS CONTROLLED.", m1)) !== (v1.front.lead.deck || "THE CITY IS CONTROLLED."), "a v1 edition still renders, re-cased");
ok(R.textOf(R.segments("THE PIT: MUHAMMAD ALI OVER JACK JOHNSON. THE DEPARTMENT WAS THERE ON FRIDAY.", R.matcherOf({ "MUHAMMAD ALI": { h: "#market/muhammad-ali", n: "Muhammad Ali" }, "THE PIT": { h: "#city/league/pit" } })))
  === "The Pit: Muhammad Ali over jack johnson. The department was there on Friday.", "sentence case: names restored, sentences capitalised, days kept");
// the pictures: deterministic, only drawable people, never anyone the ents do not mark drawable
for (const h of [v2.front.lead, ...v2.front.stories, { kind: "movers", text: "m" }, { kind: "table", rows: v2.sports.leagues[0].table, sign: "BASEBALL" }]) {
  const s1 = WP.sceneOf(h, v2, rm), s2 = WP.sceneOf(h, v2, rm);
  ok(JSON.stringify(s1) === JSON.stringify(s2), `${h.kind}: the same picture every time`);
  for (const w of (s1?.who || []).filter(Boolean)) ok(Object.values(v2.ents).some(e => e.p && e.h === `#market/${w.slug}`), `${h.kind}: ${w.slug} is drawable (listed, no harm finding)`);
  if (s1) ok(/^Department illustration\./.test(s1.caption), `${h.kind}: captioned as a Department illustration`);
}
const harmed = FAMOUS_FIGURES.find(f => f.harm);
if (harmed) {
  const e3 = buildEdition({ ...structuredClone(input), names: [...names, [harmed.name, slugify(harmed.name)]], gossip: [{ h: 1, kind: "again", text: `${harmed.name.toUpperCase()} AND BILL HADER SHARED A TABLE.` }] });
  const k3 = Object.entries(e3.ents).find(([, e]) => e.h === `#market/${slugify(harmed.name)}`);
  ok(k3 && !k3[1].p, `a figure with a harm finding is linked but never drawable (${harmed.name})`);
}
// contrast: every text colour the paper's stylesheet uses is listed, and every listed pair holds AA in every theme
const paperSrc = readFileSync(root + "src/paper/Paper.jsx", "utf8");
const used = new Set([...paperSrc.matchAll(/(?<![-\w])color:\s*"?var\((--[\w-]+)\)/g)].map(x => x[1]));
for (const t of used) ok(R.PAPER_PAIRS.some(([x]) => x === t), `the paper's text colour ${t} is in PAPER_PAIRS (held to AA)`);
const bareCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const tokensCss = bareCss(readFileSync(root + "src/ui/tokens.css", "utf8")), themesCss = bareCss(readFileSync(root + "src/ui/themes.css", "utf8"));
const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(x => [x[1], x[2].trim()]));
const baseT = decls(tokensCss.match(/:root\s*{([\s\S]*?)\n}/)[1]);
const themeSets = { green: {} };
for (const x of themesCss.matchAll(/:root\[data-theme="([\w-]+)"\]\s*{([\s\S]*?)\n}/g)) themeSets[x[1]] = decls(x[2]);
const resolveT = (set, n, d = 0) => { const v = set[n]; if (v == null || d > 8) return null; const r = v.match(/^var\((--[\w-]+)\)$/); return r ? resolveT(set, r[1], d + 1) : v; };
const rgbT = (hx) => { const h = String(hx || "").replace("#", ""); if (!/^[0-9a-f]{6}$/i.test(h)) return null; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lumT = ([r, g, b]) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
let lowest = 99;
for (const [nm, over] of Object.entries(themeSets)) {
  const set = { ...baseT, ...over };
  for (const [t, sfc] of R.PAPER_PAIRS) {
    const A = rgbT(resolveT(set, t)), B = rgbT(resolveT(set, sfc));
    if (!A || !B) { ok(false, `${nm}: ${t} on ${sfc} is not a plain colour`); continue; }
    const [x, y] = [lumT(A), lumT(B)].sort((p, q) => q - p), r = (x + 0.05) / (y + 0.05);
    lowest = Math.min(lowest, r);
    ok(r >= 4.5, `${nm}: the paper's ${t} on ${sfc} is ${r.toFixed(2)}:1 (AA needs 4.5)`);
  }
}
ok(Object.keys(themeSets).length >= 12, `every theme is checked (${Object.keys(themeSets).length})`);

if (bad) { console.error(`check-paper: ${bad} failure(s)`); process.exit(1); }
console.log(`check-paper: ok (edition No. ${a.no}, ${nHref} links, ${Object.keys(v2.ents).length} names linked, ${named} figure mentions checked, lowest paper contrast ${lowest.toFixed(2)}:1; lead: ${a.front.lead.text}; ${seen.size} strip templates over 400 days)`);
