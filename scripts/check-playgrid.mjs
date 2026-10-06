// #play: the game tiles (src/play/games.js, PlayGrid.jsx, gameIcons.js).
//   every entry has the shape, a unique href and a drawn 12x12 icon; App.jsx renders the grid;
//   a tile is dim "COMING SOON" exactly when App.jsx does not serve its room.
import { readFileSync } from "node:fs";
import { GAMES, routesIn, isLive, roomOf } from "../src/play/games.js";
import { ICONS, iconPaths } from "../src/play/gameIcons.js";

let checks = 0;
const ok = (c, m) => { checks++; if (!c) { console.error("FAIL " + m); process.exit(1); } };
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

for (const g of GAMES) {
  ok(/^#[a-z0-9-]+([/?].*)?$/.test(g.href) && g.title && g.name && g.note && g.icon, `${g.href}: href, title, name, icon, note`);
  ok(ICONS[g.icon], `${g.href}: icon "${g.icon}" is drawn in gameIcons.js`);
}
ok(new Set(GAMES.map(g => g.href)).size === GAMES.length, "one tile per href");
for (const [k, rows] of Object.entries(ICONS)) {
  ok(rows.length === 12 && rows.every(r => r.length === 12 && /^[.fdmawh]+$/.test(r)), `icon ${k} is 12x12 in the palette`);
  ok(iconPaths(k).length >= 1, `icon ${k} draws`);
}
ok(/lazy\(\(\) => import\("\.\/play\/PlayGrid\.jsx"\)\)/.test(app) && /<PlayGrid \/>/.test(app), "App.jsx renders the grid on #play");
const routes = new Set(routesIn(app));
ok(["#tennis", "#golf", "#hoops", "#chess", "#casino", "#fish", "#city", "#play"].every(r => routes.has(r)), "routesIn reads the route table");
ok(!isLive({ href: "#nowhere-yet" }, routes) && isLive({ href: "#city/league" }, routes), "an unserved room is COMING SOON; a served one is a link");
for (const g of GAMES) ok(isLive(g, routes) === routes.has(roomOf(g.href)), `${g.href}: live iff routed`);
ok(/define: \{ __HVI_ROUTES__/.test(readFileSync(new URL("../vite.config.js", import.meta.url), "utf8")), "the build defines the route table");

console.log(`check-playgrid: ${checks} checks passed`);
