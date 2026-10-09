// TitleScreen's pure logic (src/play/titleLogic.js): the front menu's rows, the LIVE links, the keys
// and the pad, and that every arcade game's title draws in the pixel font. Usage: node scripts/check-titlescreen.mjs
import { readFileSync, existsSync } from "node:fs";
import { frontItems, selectKind, cycleOf, titleKey, padTitle, stepFocus, titleLines, liveItems, seenTitle, markTitle } from "../src/play/titleLogic.js";
import { routesIn } from "../src/play/games.js";
import { hasGlyph } from "../src/play/golf/font.js";

let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.error("FAIL", msg); } };
const ids = (xs) => xs.map(x => x.id).join(",");
const fn = () => {};
const el = { $$typeof: Symbol.for("react.element") };

// rows: in the order passed, defaults, empty lists dropped
let m = frontItems({ play: fn, modes: [{ label: "ONE SET", onSelect: fn }], team: [], live: [], settings: [{ label: "DIFFICULTY", value: "ROOKIE", cycle: fn }], controls: el, back: true });
ok(ids(m) === "play,modes,settings,controls,back", `front order/filter: ${ids(m)}`);
ok(m[0].label === "PLAY" && m[1].label === "MODES" && m[4].label === "BACK TO PLAY", "default labels");
ok(m[4].href === "#play", "back goes to #play");
ok(m[1].items.length === 1 && m[1].items[0].label === "ONE SET", "a list row keeps its items");
ok(m[2].items[0].value === "ROOKIE" && m[2].items[0].cycle, "a settings item keeps value and cycle");
ok(m[3].legend === el, "controls carries the legend");
ok(frontItems({ team: { label: "PLAYER SELECT", items: [{ label: "A", onSelect: fn }] } })[0].label === "PLAYER SELECT", "relabelled list row");
ok(frontItems({ modes: [{ label: "NOTHING" }] }).length === 0, "a list of dead items is no row");
ok(frontItems({ x: { label: "OFF", disabled: true } }).length === 1, "a disabled row still shows");
ok(frontItems({ live: { label: "LIVE", items: [{ label: "SOON", value: "SAT" }] } }).length === 1, "a value-only item is kept (information)");
ok(selectKind(m[0]) === "run" && selectKind(m[1]) === "open" && selectKind(m[3]) === "legend" && selectKind(m[4]) === "link", "select kinds");
ok(selectKind(m[2].items[0]) === "cycle" && selectKind({ disabled: true, onSelect: fn }) === null, "cycle and disabled");
ok(cycleOf(["a", "b", "c"], "c", 1) === "a" && cycleOf([["a"], ["b"]], "a", -1) === "b", "cycle wraps both ways");

// focus
const it = [{}, { disabled: true }, {}, {}];
ok(stepFocus(it, 0, 1) === 2 && stepFocus(it, 0, -1) === 3 && stepFocus(it, 3, 1) === 0, "focus wraps, skips disabled");
ok(stepFocus([], 0, 1) === -1 && stepFocus([{ disabled: true }, {}], 0, "first") === 1, "focus edges");

// keys
ok(titleKey("ArrowLeft") === "left" && titleKey("ArrowRight") === "right", "left/right");
ok(titleKey("Enter") === "select" && titleKey("Escape") === "back" && titleKey("q") === null, "enter/esc/other");

// pad: START on its press, A on release only if pressed while up, left/right edges
let r = padTitle(null, { start: true });
ok(r.action === null, "a held-over START does nothing");
r = padTitle(r.next, { start: false }); r = padTitle(r.next, { start: true });
ok(r.action === "start", "START press");
r = padTitle(null, { act: true }); r = padTitle(r.next, { act: false });
ok(r.action === null, "a held-over A does not select");
r = padTitle(r.next, { act: true }); r = padTitle(r.next, { act: false });
ok(r.action === "select", "A release selects");
r = padTitle(r.next, { x: 1 }); ok(r.action === "right", "stick right");
r = padTitle(r.next, { x: 1 }); ok(r.action === null, "held stick: one step");
r = padTitle(r.next, { y: -1 }); ok(r.action === "up", "stick up");

// title lines
ok(titleLines("TENNIS").join("|") === "TENNIS", "one word");
ok(titleLines("FOURTH AND LONG").join("|") === "FOURTH AND|LONG", `two lines: ${titleLines("FOURTH AND LONG").join("|")}`);

// LIVE: only to things that exist
const NOW = Date.parse("2026-10-11T16:00:00Z");   // a Sunday: the derby is open
const fish = liveItems("fish", NOW), golf = liveItems("golf", NOW), bowl = liveItems("bowling", NOW);
ok(fish.some(x => x.hint === "OPEN NOW" && /^#fish\?t=fish-derby-/.test(x.href)), "fish: the open derby");
ok(golf.some(x => /^#golf\?t=golf-daily-/.test(x.href)), "golf: the daily");
ok(bowl.length >= 1 && bowl.every(x => x.href), "bowling: league night or the hub");
ok(golf.every(x => !x.href.startsWith("#city/league/")), "golf has no league tab");
for (const s of ["tennis", "basketball", "football", "soccer"]) {
  const L = liveItems(s, NOW);
  ok(L.some(x => x.href === `#city/league/${s}`), `${s}: its league tab`);
  ok(L.some(x => x.href === "#file?at=leagues"), `${s}: join from the file`);
}
for (const s of ["ski", "skate", "hunt", "crawl", "chess"]) ok(liveItems(s, NOW).length === 0, `${s}: no LIVE row`);
ok(frontItems({ live: liveItems("ski", NOW) }).length === 0, "an empty LIVE list is no row");
// every LIVE link is a route App.jsx serves
const routes = new Set(routesIn(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")));
for (const s of ["fish", "golf", "bowling", "tennis", "basketball", "football", "soccer"]) for (const x of liveItems(s, NOW)) {
  const room = x.href.split(/[/?]/)[0];
  ok(routes.has(room) || room === "#city" || room === "#file", `${s}: ${x.href} is served`);
}

// seen: remembered per game
const mem = { v: null, getItem() { return this.v; }, setItem(_, v) { this.v = v; } };
ok(!seenTitle("golf", mem), "unseen");
markTitle("golf", mem); markTitle("golf", mem);
ok(seenTitle("golf", mem) && !seenTitle("tennis", mem) && JSON.parse(mem.v).length === 1, "seen once, per game");

// every arcade game wires TitleScreen, and its title draws in the 5x7 font
const GAMES = ["tennis/Tennis.jsx", "golf/Golf.jsx", "bowling/Bowling.jsx", "fish/Fish.jsx", "football/Football.jsx", "tecmo/Tecmo.jsx", "hoops/Hoops.jsx",
  "soccer/Soccer.jsx", "ski/Ski.jsx", "skate/Skate.jsx", "hunt/Hunt.jsx", "crawl/Crawl.jsx"];
for (const g of GAMES) {
  const p = new URL(`../src/play/${g}`, import.meta.url);
  if (!existsSync(p)) { ok(false, `${g} missing`); continue; }
  const src = readFileSync(p, "utf8");
  if (!/<TitleScreen\b/.test(src)) { ok(false, `${g}: no TitleScreen`); continue; }
  const t = /<TitleScreen[^>]*?\btitle="([^"]+)"/s.exec(src)?.[1];
  ok(t, `${g}: a literal title`);
  for (const ch of String(t || "")) ok(hasGlyph(ch), `${g}: "${ch}" in the pixel font`);
}

console.log(bad ? `${bad} FAILED` : "OK titlescreen: rows, live links, keys, pad, titles");
process.exit(bad ? 1 : 0);
