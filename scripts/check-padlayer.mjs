// THE GAMEPAD LAYER (src/ui/padLayer.js): spatial navigation picks the right neighbour, B closes
// dialogs top first, the layer stands down in games and the city, the on-screen keyboard types,
// and the entry script only carries the doorbell (src/ui/padHook.js, <= 1 KB gzip).
//   node scripts/check-padlayer.mjs
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { transformSync } from "esbuild";
import { ownerOf, pickNeighbour, backAction, oskMove, oskPress, OSK_ROWS } from "../src/ui/padLayer.js";

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL " + m); } };
const R = (x, y, w = 80, h = 30, name) => ({ x, y, w, h, name });

// 1. spatial nav: a 3x3 grid of buttons
const g = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.push(R(c * 100, r * 50, 80, 30, `${r}${c}`));
const mid = g[4];
const name = (i, list = g) => (i < 0 ? null : list[i].name);
ok(name(pickNeighbour(mid, g, "right")) === "12", "grid: right of the middle is 12");
ok(name(pickNeighbour(mid, g, "left")) === "10", "grid: left of the middle is 10");
ok(name(pickNeighbour(mid, g, "up")) === "01", "grid: up from the middle is 01");
ok(name(pickNeighbour(mid, g, "down")) === "21", "grid: down from the middle is 21");
ok(pickNeighbour(g[2], g, "right") === -1, "grid: nothing right of the top-right corner");
ok(pickNeighbour(g[0], g, "up") === -1, "grid: nothing above the top row");
// in line beats nearer but off to the side
const row = [R(0, 100, 80, 30, "from"), R(300, 100, 80, 30, "inline"), R(120, 190, 80, 30, "offside")];
ok(name(pickNeighbour(row[0], row, "right"), row) === "inline", "the control in line wins over a nearer one off to the side");
// a wide row under three buttons: down from any of them lands on it
const wide = [R(0, 0, 80, 30, "a"), R(100, 0, 80, 30, "b"), R(200, 0, 80, 30, "c"), R(0, 60, 280, 40, "bar")];
ok(name(pickNeighbour(wide[2], wide, "down"), wide) === "bar", "down onto a wide row");
ok(name(pickNeighbour(wide[3], wide, "up"), wide) === "a" || name(pickNeighbour(wide[3], wide, "up"), wide) === "b", "up from a wide row lands in the row above");
// outside the cone: far below and slightly right is not "right"
const cone = [R(0, 0, 80, 30, "from"), R(100, 400, 80, 30, "below")];
ok(pickNeighbour(cone[0], cone, "right") === -1, "a control far below is not to the right (cone)");
// a list: down steps one row at a time
const list = [0, 1, 2, 3].map(i => R(0, i * 32, 300, 28, `row${i}`));
ok(name(pickNeighbour(list[1], list, "down"), list) === "row2", "list: down is the next row");

// 2. B: keyboard, then a held window, then the top dialog, then Escape / back
ok(backAction({ osk: true, grab: true, modals: ["a"] }).act === "osk", "B closes the keyboard first");
ok(backAction({ grab: true, modals: ["a"] }).act === "grab", "B then puts a held window back");
const two = backAction({ modals: ["under", "over"] });
ok(two.act === "dialog" && two.target === "over", "B closes the top dialog first");
const one = backAction({ modals: ["under"] });
ok(one.act === "dialog" && one.target === "under", "then the one under it");
ok(backAction({ modals: [] }).act === "escape", "with no dialog, B is Escape, then history back");
ok(backAction({ noBack: true, modals: ["card"] }).act === "none", "over the city, B is GAMEPAD BROWSE's");

// 3. standing down
for (const r of ["#golf", "#tennis", "#hoops", "#football", "#tecmo", "#bowling", "#soccer", "#skate", "#ski", "#fish", "#hunt", "#cards/hearts"]) ok(!ownerOf({ route: r }).active, `stands down in ${r}`);
for (const r of ["", "#market", "#paper", "#mail", "#shop", "#scores", "#play", "#cards", "#assembly", "#elections", "#intake", "#chess", "#casino"]) ok(ownerOf({ route: r }).active, `active on ${r || "the front desk"}`);
ok(!ownerOf({ route: "#city", owns: ["city"] }).active, "stands down in the city (GAMEPAD BROWSE)");
const card = ownerOf({ route: "#city", owns: ["city"], modal: true });
ok(card.active && card.noBack, "a dialog over the city is the layer's, except B");
ok(!ownerOf({ route: "#chess", owns: ["gamemenu"] }).active, "stands down while a GameMenu is up");
ok(!ownerOf({ route: "", owns: ["own"] }).active, "stands down for any data-pad-own");

// 4. the on-screen keyboard
let s = { t: "", at: 0 };
for (const k of ["S", "C", "O", "T", "T"]) s = oskPress(s, k);
ok(s.t === "Scott", `types, capitalised at the start: ${s.t}`);
s = oskPress(s, "SPACE"); s = oskPress(s, "SHIFT"); s = oskPress(s, "B"); s = oskPress(s, "I");
ok(s.t === "Scott Bi", `space and a one-shot shift: ${s.t}`);
s = oskPress(s, "⌫");
ok(s.t === "Scott B" && s.at === 7, "backspace");
s = oskPress({ t: "ac", at: 1 }, "B");
ok(s.t === "abc" && s.at === 2, "types at the caret");
ok(oskPress(s, "DONE").done && !oskPress(s, "DONE").enter, "DONE closes");
ok(oskPress(s, "ENTER").enter, "ENTER submits");
ok(OSK_ROWS.every(r => r.reduce((a, [, w]) => a + w, 0) === 11), "every row is 11 wide");
ok(JSON.stringify(oskMove({ r: 1, c: 10 }, "right")) === JSON.stringify({ r: 1, c: 0 }), "right wraps in a row");
const sp = oskMove({ r: 3, c: 5 }, "down");
ok(OSK_ROWS[sp.r][sp.c][0] === "SPACE", `down from N lands on SPACE (${OSK_ROWS[sp.r][sp.c][0]})`);
ok(oskMove({ r: 0, c: 0 }, "up").r === OSK_ROWS.length - 1, "up wraps to the bottom row");

// 5. the entry script carries only the doorbell
const hook = readFileSync(new URL("../src/ui/padHook.js", import.meta.url), "utf8");
ok(!/import\s+[^(]*from/.test(hook) && /import\("\.\/padLayer\.js"\)/.test(hook), "padHook loads padLayer lazily and imports nothing else");
const min = transformSync(hook, { minify: true, format: "esm" }).code;
const gz = gzipSync(min, { level: 9 }).length;
ok(gz <= 1024, `padHook is ${gz} B gzip (budget 1024)`);
ok(/import ['"]\.\/ui\/padHook\.js['"]/.test(readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8")), "main.jsx rings the doorbell");
const dist = new URL("../dist/", import.meta.url).pathname;
if (existsSync(dist + "index.html")) {
  const m = readFileSync(dist + "index.html", "utf8").match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/);
  const entry = m ? readFileSync(dist + m[1], "utf8") : "";
  ok(entry.includes("gamepadconnected"), "the built entry has the doorbell");
  ok(!entry.includes("hvi-pad-ui") && !entry.includes("KEYBOARD"), "the built entry does not carry the layer itself");
}
// the stand-down markers are in place
ok(/data-pad-own="city"/.test(readFileSync(new URL("../src/city/CityIso.jsx", import.meta.url), "utf8")) && /data-pad-own="city"/.test(readFileSync(new URL("../src/city/CityMap.jsx", import.meta.url), "utf8")), "the city's views carry data-pad-own");
ok(/data-pad-own="gamemenu"/.test(readFileSync(new URL("../src/play/GameMenu.jsx", import.meta.url), "utf8")), "GameMenu carries data-pad-own");

if (fails) { console.error(`check-padlayer: ${fails} failed`); process.exit(1); }
console.log(`OK check-padlayer: spatial nav, B order, stand-down, keyboard, doorbell ${gz} B gzip`);
