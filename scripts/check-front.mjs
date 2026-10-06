// THE FRONT PAGE's small windows (src/front/FrontDesk.jsx, netlify/lib/front.js): MARKET.TKR shows
// the fallers as well as the risers, each with its because; every WIRE.TKR item (news and trending)
// links to a route the app answers; SUBSTRATE.CAM is lazy, small and right about night and day; and
// none of it rides in the entry script.
//   node scripts/check-front.mjs            (the bundle part reads dist/: run after npm run build)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { moversOf, newsOf, trendingOf, scoreMoves, nightAt, FRONT_N } from "../netlify/lib/front.js";
import { buildEdition, validHref, printable } from "../netlify/lib/paper.js";
import { encodeSeries } from "../src/ui/spark.js";
import { FAMOUS_FIGURES, slugify } from "../src/figures.js";

let bad = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { bad++; console.log("  FAIL", msg); } };
const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(root + p, "utf8");

// ---- 1. MARKET.TKR: risers and fallers, each with its because --------------------------------------
const rows = Array.from({ length: 16 }, (_, i) => ({ slug: `h-${i}`, name: `Human ${i}`, price: 40 + i, chg: (8 - i) / 100, why: i % 2 ? "UP ON THE CITY'S RECORD: SEEN BY 9 IN PUBLIC." : "DOWN ON THE CITY'S RECORD: WORKED 2 WEIGHTED HOURS.", terms: { crowd: 16 - i }, score: 500 + i, ...(i < 3 ? { hx: encodeSeries([480 + i, 500 + i + (i ? 0 : 0)]) } : {}) }));
const byChg = rows.slice().sort((a, b) => b.chg - a.chg);
const board = { rows, movers: { up: byChg.filter(r => r.chg > 0).slice(0, 6), down: byChg.filter(r => r.chg < 0).slice(-6).reverse() } };
const mv = moversOf(board);
ok(mv.up.length === FRONT_N && mv.down.length === FRONT_N, `five risers and five fallers (${mv.up.length}/${mv.down.length})`);
ok(mv.up.every(r => r.chg > 0) && mv.down.every(r => r.chg < 0), "risers rise, fallers fall");
ok(mv.down[0].chg <= mv.down[mv.down.length - 1].chg, "the biggest faller first");
ok([...mv.up, ...mv.down].every(r => r.slug && r.name === r.name.toUpperCase() && Number.isFinite(r.price) && typeof r.why === "string" && r.why.length > 0 && r.why.length <= 96), "each carries price, change and a one-line because");
ok(JSON.stringify(mv).length < 2500, `the movers stay small (${JSON.stringify(mv).length} bytes)`);
ok(moversOf(null).up.length === 0 && moversOf({ movers: { up: [{ slug: "x", price: 1, chg: -0.1 }], down: [] } }).up.length === 0, "a dark floor or a mis-sorted row prints nothing wrong");
// the endpoint carries them (check-market runs the function); the landing reads them
const desk = read("src/front/FrontDesk.jsx");
ok(/\/api\/market\?ticker=1/.test(desk) && /TOP RISERS/.test(desk) && /TOP FALLERS/.test(desk), "MARKET.TKR reads the ticker and shows TOP RISERS and TOP FALLERS");
ok(/arrow\(r\.chg\)/.test(desk) && /fmtPct\(r\.chg\)/.test(desk), "direction is an arrow and a sign, not colour alone");
const market = read("src/market/Market.jsx");
ok(/function Movers/.test(market) && /▲ UP/.test(market) && /▼ DOWN/.test(market) && /aria-pressed=\{side === id\}/.test(market), "#market has a MOVERS window with UP and DOWN tabs");

// ---- 2. the tickers: every item links somewhere the app answers ---------------------------------
const input = JSON.parse(read("scripts/fixtures/paper-input.json"));
const ed = buildEdition(structuredClone(input));
const wire = [
  { at: "09:00", text: "LADDER NIGHT AT THE TENNIS CLUB.", href: "#city/league/tennis" },
  { at: "09:00", text: "HUMAN 1 +8.0%: UP.", href: "#market/h-1" },
  { at: "08:00", text: "SOMETHING HAPPENED SOMEWHERE ODD.", href: "#nowhere" },
];
const news = newsOf(ed, wire);
const figs = FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name) }));
const arrivals = { pending: [{ name: "New Arrival", score: 701, filedAt: "2026-10-06T01:00:00Z" }], released: [{ name: "Older Arrival", score: 650, filedAt: "2026-10-05T01:00:00Z" }] };
const trending = trendingOf({ board, edition: ed, arrivals, figures: figs });
const app = read("src/App.jsx") + read("src/city/City.jsx") + read("src/city/LeagueHub.jsx");
const frontHref = (h) => validHref(h) || /^#city\?find=[a-z0-9-]{1,80}$/.test(h) || h === "#scores" || h === "#arrivals";
const routed = (h) => { const base = h.split(/[/?]/)[0]; return app.includes(`"${base}"`) || app.includes(`"${base}/`) || app.includes(`${base}?`); };
ok(news.length >= 4 && news[0].tag === "FRONT PAGE" && news[0].href === `#paper/${ed.date}`, "the news leads with the edition's front page, which opens that edition");
ok(news.some(x => x.tag === "WIRE") && !news.some(x => x.href.startsWith("#market/")), "the WIRE follows; its market lines stay in MARKET.TKR");
ok(news.find(x => x.text.includes("ODD"))?.href === "#paper", "a WIRE line with an unknown route falls back to the paper");
const tags = new Set(trending.map(x => x.tag));
ok(["MOST SEEN", "SCORE MOVE", "STAR", "INTAKE"].every(t => tags.has(t)), `trending walks across its four sources (${[...tags].join(", ")})`);
ok(trending[0].tag === "MOST SEEN" && trending[1].tag === "SCORE MOVE", "interleaved, one line per source in turn");
ok(trending.find(x => x.tag === "INTAKE").text.includes("NEW ARRIVAL"), "the newest arrival first");
for (const x of [...news, ...trending]) {
  ok(frontHref(x.href) && routed(x.href), `${x.tag} links to a routed page (${x.href})`);
  ok(x.text && x.text.length <= 110 && printable(x.text), `${x.tag} prints one plain line (${x.text.slice(0, 40)})`);
}
ok(scoreMoves({ rows: [] }, figs).length > 0 || figs.every(f => (f.scoreHistory || []).length < 2), "score moves fall back to the figures' movement logs");
ok(scoreMoves(board, []).every(m => m.href.startsWith("#city?find=")), "a score move opens the subject in the city");
ok(/fr-steps/.test(desk) && /aria-label="Previous item"/.test(desk) && /aria-label="Next item"/.test(desk) && /PAUSE/.test(desk), "the ticker steps with buttons and can be paused");
ok(/prefers-reduced-motion: reduce/.test(desk) && /useState\(\(\) => reduced\(\)\)/.test(desk), "reduced motion: it never advances on its own");
ok(!/@keyframes|animation:/.test(read("src/front/front.css")), "no crawl: nothing animates");
ok(/className="sr-only"/.test(desk) && /<ul className="sr-only"/.test(desk), "screen readers get the whole list");
ok(/TABS = \[\["news", "NEWS"\], \["trending", "TRENDING"\]\]/.test(desk) && (desk.match(/title="WIRE.TKR"/g) || []).length === 1, "one window, two tabs: not three crawls");

// ---- 3. SUBSTRATE.CAM: small, lazy, right about night and day -----------------------------------
const { camNow } = await import("../netlify/functions/cam.js");
const MIN = 60_000;
let tDay = null, tNight = null;
const { machineClock } = await import("../src/city/sim.js");
for (let t = Date.parse("2026-10-06T00:00:00Z"); (tDay == null || tNight == null) && t < Date.parse("2026-10-06T01:00:00Z"); t += MIN) {
  const c = machineClock(t), h = c.hour + c.minute / 60;
  if (tDay == null && h >= 10 && h < 15) tDay = t;
  if (tNight == null && (h >= 22 || h < 4)) tNight = t;
}
const day = camNow(tDay), night = camNow(tNight);
ok(day.startsWith("<svg") && /\/\/ DAY</.test(day) && !/NIGHT/.test(day.replace(/NIGHT SHIFT/g, "")), "a day hour draws the day");
ok(/\/\/ NIGHT</.test(night) && /#ffaa2d/.test(night), "a night hour draws the night, windows lit");
ok(nightAt(19) && nightAt(3) && !nightAt(12) && !nightAt(6.6), "night is 19:00 to 06:30, as in the city");
ok(/<line /.test(day) && /<polyline /.test(day), "the trains and the lines are on it");
const gz = gzipSync(night).length;
ok(gz < 12 * 1024, `the picture is small (${(gz / 1024).toFixed(1)} KB gzip)`);
ok(/role="img"/.test(day) && /<title>/.test(day), "the picture names itself");
const camFn = read("netlify/functions/cam.js");
ok(/image\/svg\+xml/.test(camFn) && /max-age=60/.test(camFn) && /nosniff/.test(camFn), "/api/cam is an SVG, cached a minute, nosniff");
ok(/IntersectionObserver/.test(desk) && /m != null\s*\?\s*<img/.test(desk) && /\/api\/cam\?m=/.test(desk), "the cam asks for a picture only once its window is on screen");
ok(/href="#city"/.test(desk) && /alt="The city right now/.test(desk), "a tap opens the city; the picture has words");

// ---- 4. the entry script carries none of it ------------------------------------------------------
const appSrc = read("src/App.jsx");
ok(/const FrontDesk = lazy\(\(\) => import\("\.\/front\/FrontDesk\.jsx"\)\)/.test(appSrc) && !/import FrontDesk|from "\.\/front\//.test(appSrc), "FrontDesk is a lazy chunk");
ok(!/function Carousel/.test(appSrc), "the old ticker left the entry script");
const dist = root + "dist/";
if (existsSync(dist + "index.html")) {
  const html = readFileSync(dist + "index.html", "utf8");
  const entry = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/)?.[1];
  const src = entry ? readFileSync(dist + entry, "utf8") : "";
  const kb = gzipSync(src, { level: 9 }).length / 1024;
  ok(entry && kb <= 90, `entry ${kb.toFixed(1)} KB gzip, inside the 90 KB budget`);
  ok(!/SUBSTRATE\.CAM|TOP FALLERS|WIRE\.TKR/.test(src), "the front windows are not in the entry script");
  ok(readdirSync(dist + "assets").some(f => /^FrontDesk-.*\.js$/.test(f)), "FrontDesk ships as its own chunk");
} else console.log("check-front: no dist/; the bundle part SKIPPED (run npm run build first)");

console.log(bad ? `check-front: ${bad} of ${n} FAILED` : `check-front: ${n} checks passed`);
process.exit(bad ? 1 : 0);
