// The funnels (docs/CITY_SPEC.md "The funnels"): the Arcade, the EB Shop, EBTV, the cabinets
// round the city, the tagged links and the click counter. No network: Shopify and Blobs are
// faked. Run: node scripts/check-funnels.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log(`  FAIL ${msg}`); } };

// ---- in-memory @netlify/blobs (as check-functions.mjs) ----
globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { if (globalThis.__blobsDown) throw new Error("blobs down"); return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });

const F = await import("../src/city/funnels.js");
const SIM = await import("../src/city/sim.js");
const PROPS = await import("../src/city/props.js");
const FP = await import("../src/city/funnelProps.js");
const L = await import("../netlify/lib/funnels.js");
const { cabinetsFrom, readWorks, neighboursIn } = await import("./sync-arcade.mjs");

// 1. The Arcade holds every game the works list has: every LIVE game a playable cabinet,
//    betas playable and marked, the rest OUT OF ORDER. The committed list is current.
const got = await readWorks();
if (got) {
  const want = cabinetsFrom(got.works);
  ok(JSON.stringify(want) === JSON.stringify(F.OWN_GAMES), `arcade.json is current with ${got.from} (run node scripts/sync-arcade.mjs)`);
  for (const w of got.works.filter(w => w.division === "games" && w.status === "live")) ok(F.GAME[w.slug]?.status === "live", `live game ${w.slug} has a live cabinet`);
} else console.log("  (no works.json reachable: checking the committed arcade.json only)");
ok(F.LIVE_GAMES.length >= 2 && F.GAME.jetsam?.status === "live" && F.GAME.anamnesis?.status === "live", "JETSAM! and ANAMNESIS are live cabinets");
for (const g of F.GAMES) {
  ok(["live", "beta", "dev"].includes(g.status), `${g.slug}: a known status`);
  if (g.status === "dev") ok(!g.play, `${g.slug}: out of order has nothing to play`);
  else if (!g.self) ok(/^https:\/\//.test(g.play || ""), `${g.slug}: a playable cabinet has an https build`);
}
// the sync's own rules, on a made-up list: a beta by status, a beta by URL, a dev one, order
{
  const c = cabinetsFrom([
    { slug: "a", division: "games", status: "in-development", title: "A" },
    { slug: "b", division: "games", status: "beta", title: "B", beta: "https://b.example/beta" },
    { slug: "c", division: "games", status: "in-development", title: "C", play: "https://c.example" },
    { slug: "d", division: "games", status: "live", title: "D", embed: "https://d.example", links: [{ t: "Play on itch.io", u: "https://x.itch.io/d" }] },
    { slug: "e", division: "studio", status: "live", title: "E" },
  ]);
  ok(c.map(x => x.slug).join() === "d,b,c,a", "sync: live, then beta, then out of order; studio work left out");
  ok(c[0].status === "live" && c[0].play === "https://d.example" && c[0].itch === "https://x.itch.io/d", "sync: a live game plays its embed, links its itch page");
  ok(c[1].status === "beta" && c[1].play === "https://b.example/beta" && c[2].status === "beta" && c[2].play === "https://c.example", "sync: status beta, or a play/beta URL, is a playable BETA");
  ok(c[3].status === "dev" && c[3].play === null, "sync: in development is OUT OF ORDER");
}
// the neighbours (INTERNET CITY): kept by the sync, tagged with their own campaign, never framed
// when their site refuses frames, first in the Arcade's front row, a gateway at the Port
{
  const ic = F.GAME["internet-city"];
  ok(ic && ic.neighbour === true && ic.status === "live" && ic.frame === false && ic.play === "https://internetcitygame.com", "INTERNET CITY: a live neighbour cabinet, opened in its own tab");
  ok(F.campaignFor("internet-city", "the-arcade") === "internet-city-cabinet", "INTERNET CITY's links carry utm_campaign=internet-city-cabinet wherever it stands");
  const kept = neighboursIn(readFileSync(join(ROOT, "src/city/arcade.json"), "utf8"));
  ok(kept.some(c => c.slug === "internet-city"), "the sync keeps the neighbours it finds in arcade.json");
  const u = new URL(F.utm(ic.play, F.campaignFor("internet-city")));
  ok(u.searchParams.get("utm_source") === "humanvalueindex" && u.searchParams.get("utm_campaign") === "internet-city-cabinet", "the neighbour's link is tagged");
  for (const [w, h, sw] of [[916, 120, 32], [380, 90, 30]]) {
    const plan = PROPS.roomPlan("arcade", w, h, sw, 8);
    const front = plan.rows[plan.rows.length - 1];
    ok(front.items.find(i => FP.cabinetGame(i.prop))?.prop === "cab:internet-city", `arcade ${w}x${h}: INTERNET CITY is the front row's first cabinet`);
  }
  ok(PROPS.typeOf("customs-house") === "customs" && SIM.BUILDING["customs-house"]?.districtId === "port", "THE PORT's Customs House is the first gateway");
  const src = readFileSync(join(ROOT, "src/city/City.jsx"), "utf8");
  ok(/internetcity: \{ building: "the-arcade", line: "WELCOME, NEIGHBOUR\. YOUR CITY HAS A CABINET HERE\." \}/.test(src) && /q\.delete\("welcome"\)/.test(src), "#city?welcome=internetcity opens THE ARCADE with one line, and the parameter never travels on");
}
// every live (and beta) cabinet stands on the Arcade floor, at the cutaway's widths
for (const [w, h, sw] of [[916, 120, 32], [700, 110, 32], [520, 150, 43], [380, 90, 30]]) {
  const plan = PROPS.roomPlan("arcade", w, h, sw, 8);
  const cabs = new Set(plan.rows.flatMap(r => r.items.map(i => FP.cabinetGame(i.prop)).filter(Boolean)));
  for (const g of F.PLAYABLE) ok(cabs.has(g.slug), `arcade ${w}x${h}: ${g.slug} has a cabinet`);
  ok(plan.anchors.some(a => a.act === "arcade") && plan.anchors.some(a => a.role === "staff"), `arcade ${w}x${h}: players at cabinets, a clerk at the prize counter`);
}
for (const g of F.PLAYABLE) ok(!!PROPS.PROP[`cab:${g.slug}`], `cab:${g.slug} is drawn`);

// 2. Where the funnels stand in the city.
ok(SIM.BUILDING["the-arcade"]?.district === "strip" && SIM.BUILDING["the-arcade"].name === "THE ARCADE" && !/IRIDESCENT/i.test(SIM.BUILDING["the-arcade"].name), "THE ARCADE is on the Strip (not called Iridescent)");
ok(SIM.BUILDING["eb-shop"]?.arch === "recordshop" && SIM.BUILDING["eb-shop"].places.includes("eb-shop"), "EB SHOP is a record shop with a shop floor");
ok(SIM.BUILDING["studio-block"]?.arch === "station" && /ELECTRIC BASEMENT/.test(SIM.BUILDING["studio-block"].name), "the Arts sound stages are ELECTRIC BASEMENT TV");
ok(!SIM.JOBS.some(j => j.place === "eb-shop"), "nobody on file works the EB Shop: its staff are the EBSN hosts, drawn, never in the census");
for (const [pid, games] of Object.entries(F.CABINET_PLACES)) {
  const plan = PROPS.roomPlan(PROPS.typeOf(pid), 916, 120, 32, Math.round(SIM.PLACES[pid].cap / SIM.PLACES[pid].floors.length));
  const cabs = plan.rows.flatMap(r => r.items.map(i => FP.cabinetGame(i.prop)).filter(Boolean));
  for (const g of games) ok(cabs.includes(g), `${pid}: a ${g} cabinet stands in the room`);
  ok(!!F.CAMPAIGN_OF_PLACE[pid], `${pid}: its cabinet's links carry a campaign`);
}
{
  const hs = F.highScore("jetsam", "dive-bar", 12);
  ok(JSON.stringify(hs) === JSON.stringify(F.highScore("jetsam", "dive-bar", 12)) && hs.initials.length === 3 && hs.score, "the high score is the same for every viewer on the day");
  ok(F.highScore("jetsam", "dive-bar", 13).score !== hs.score || F.highScore("jetsam", "dive-bar", 14).score !== hs.score, "the high score moves day to day");
}
{
  const plan = PROPS.roomPlan("recordshop", 916, 120, 32, 10);
  ok(plan.rows.some(r => r.items.some(i => /^standee:/.test(i.prop || ""))), "the shop floor keeps its standee slots (the plans unchanged; the hosts work it in person)");
  const hits = FP.funnelRoomHits("dive-bar", PROPS.roomPlan("bar", 916, 120, 32, 12));
  ok(hits.some(h => h.spec.kind === "game" && h.spec.slug === "jetsam" && h.spec.campaign === "the-dive"), "a tap on the Dive's cabinet opens JETSAM! for the Dive");
}

// 3. Every link out is tagged: utm() on each, and no bare outbound URL in the overlay's links.
{
  const u = F.utm("https://play-jetsam.netlify.app/?x=1#h", "the-dive", "c");
  const q = new URL(u).searchParams;
  ok(q.get("utm_source") === "humanvalueindex" && q.get("utm_medium") === "city" && q.get("utm_campaign") === "the-dive" && q.get("x") === "1" && u.endsWith("#h"), "utm tags, the query and hash kept");
  const src = readFileSync(join(ROOT, "src/city/FunnelOverlay.jsx"), "utf8");
  const hrefs = [...src.matchAll(/href=\{([^}]+)\}/g)].map(m => m[1].trim());
  const anchors = [...src.matchAll(/<a\s[^>]*>/g)].map(m => m[0]);
  // Out, which tags every href; and the shop wall's keyboard links, each href utm()'d
  ok(anchors.length === 2 && anchors.some(a => /href=\{url\}/.test(a)) && /utm\(href, campaign, content\)/.test(src) && /<a href=\{utm\(`\$\{EB_SHOP\}\/products\/\$\{it\.handle\}`, campaign, it\.handle\)\}/.test(src), "the overlay's <a>s: Out, which tags every href, and the wall links, tagged");
  ok(hrefs.every(h => !/^["'`]https?:/.test(h)), "no untagged literal href");
  ok(/src=\{utm\(g\.play, campaign\)\}/.test(src), "the game's frame loads the tagged build");
  const buttons = F.funnelButtons("the-arcade").concat(F.funnelButtons("eb-shop"), F.funnelButtons("studio-block"), F.funnelButtons("the-dive"));
  ok(buttons.length >= 4, "the funnel buildings offer their buttons");
  for (const g of F.PLAYABLE) if (g.play) ok(F.isTagged(F.utm(g.play, "the-arcade")) && (!g.itch || F.isTagged(F.utm(g.itch, "the-arcade"))), `${g.slug}: its links tag`);
  for (const url of [F.EB_SHOP, F.EBTV_SITE, `${F.EB_SHOP}/products/x`]) ok(F.isTagged(F.utm(url, "eb-shop")), `${url} tags`);
}

// 4. No third-party stream: the only stream in the source is EBTV's own, loaded straight
//    from live.electricbasement.tv (never through this site).
{
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|jsx|mjs)$/.test(f.name)) files.push(p); } };
  walk(join(ROOT, "src")); walk(join(ROOT, "netlify"));
  const streams = new Set();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/https?:\/\/[^\s"'`)]+\.(m3u8|mpd)\b/g)) streams.add(m[0]);
  ok([...streams].every(s => s.startsWith("https://live.electricbasement.tv/")), `the only streams are EBTV's own (${[...streams].join(", ") || "none"})`);
  const fn = readFileSync(join(ROOT, "netlify/functions/funnel.js"), "utf8") + readFileSync(join(ROOT, "netlify/lib/funnels.js"), "utf8");
  ok(!/m3u8|\/live\/|master\d*\.ts/.test(fn), "the funnel function never touches a stream (no re-hosting)");
}

// 5. The shop proxy: Shopify read at most once per 15 minutes; down with a recent copy, the
//    copy; down with nothing, CLOSED FOR INVENTORY.
{
  let calls = 0, down = false;
  const product = (i, vendor = "EBShop") => ({ handle: `p${i}`, title: `Product ${i}`, vendor, product_type: "Movies", published_at: `2026-09-${String(10 + i).padStart(2, "0")}`, variants: [{ price: "5.00", available: true }], images: [{ src: `https://cdn.shopify.com/p${i}.jpg?v=1` }] });
  const fake = async (url) => {
    calls++;
    if (down) return new Response("down", { status: 503 });
    if (/products\.json/.test(url)) return new Response(JSON.stringify({ products: /page=1/.test(url) ? [product(1), product(2), product(3, "Nike"), { ...product(4), variants: [{ price: "9.00", available: false }] }] : [] }));
    const h = url.match(/products\/(p\d)\.js/)[1];
    return new Response(JSON.stringify({ media: h === "p1" ? [{ media_type: "video", preview_image: { src: "https://cdn.shopify.com/prev.jpg" }, sources: [{ format: "mp4", height: 1080, url: "https://cdn.shopify.com/v1080.mp4" }, { format: "mp4", height: 480, url: "https://cdn.shopify.com/v480.mp4" }, { format: "m3u8", height: 1080, url: "https://cdn.shopify.com/v.m3u8" }] }] : [{ media_type: "image" }] }));
  };
  const t0 = Date.UTC(2026, 8, 30, 12);
  const r1 = await L.shopListing({ fetchFn: fake, now: t0 });
  ok(!r1.closed && r1.items.length === 3, `open: in-stock items only (${r1.items?.length})`);
  ok(r1.items[0].handle === "p1" && r1.items[0].video?.mp4 === "https://cdn.shopify.com/v480.mp4" && r1.items[0].video.poster, "the turntable video first, its 480p mp4 and poster");
  ok(r1.items.every(i => i.price === "5.00" && /width=360/.test(i.image)), "price and a sized image");
  const c1 = calls;
  const r2 = await L.shopListing({ fetchFn: fake, now: t0 + 14 * 60 * 1000 });
  ok(calls === c1 && r2.items.length === 3, "cached: no Shopify call inside 15 minutes");
  down = true;
  const r3 = await L.shopListing({ fetchFn: fake, now: t0 + 16 * 60 * 1000 });
  ok(calls > c1 && r3.stale === true && r3.items.length === 3, "Shopify down after 15 minutes: the last copy, marked stale");
  const r4 = await L.shopListing({ fetchFn: fake, now: t0 + 25 * 3600 * 1000 });
  ok(r4.closed === true && !r4.items, "Shopify down, nothing recent: CLOSED FOR INVENTORY");
  globalThis.__blobs.clear(); globalThis.__blobsDown = true;
  const r5 = await L.shopListing({ fetchFn: fake, now: t0 });
  ok(r5.closed === true, "Blobs and Shopify both down: closed, no throw");
  globalThis.__blobsDown = false;
  down = false;
  const r6 = await L.shopListing({ fetchFn: fake, now: t0 });
  ok(!r6.closed && r6.items.length === 3, "Blobs back: open again");
  const ov = readFileSync(join(ROOT, "src/city/FunnelOverlay.jsx"), "utf8");
  ok(/THE SHOP IS CLOSED FOR INVENTORY/.test(ov), "the panel says so when closed");
  const fnSrc = readFileSync(join(ROOT, "netlify/functions/funnel.js"), "utf8");
  ok(/s-maxage=900/.test(fnSrc) && /s-maxage=60/.test(fnSrc), "the CDN holds an open shop 15 minutes, a closed one 1");
}

// 6. The click counter: counted per day/building/kind/host; anonymous; junk refused.
{
  const t = Date.UTC(2026, 8, 30, 9);
  ok(await L.countClick({ c: "the-dive", k: "out", to: "birdsperson.itch.io" }, { now: t }), "a click counts");
  await L.countClick({ c: "the-dive", k: "out", to: "birdsperson.itch.io" }, { now: t });
  await L.countClick({ c: "eb-shop", k: "open", to: null }, { now: t });
  ok(!(await L.countClick({ c: "evil", k: "out", to: "birdsperson.itch.io" }, { now: t })), "an unknown campaign is refused");
  ok(!(await L.countClick({ c: "the-dive", k: "out", to: "evil.example" }, { now: t })), "an unknown host is refused");
  const st = await L.clickStats(7, { now: t });
  ok(st.totals["the-dive"]?.out === 2 && st.totals["eb-shop"]?.open === 1, "the totals add up");
  const raw = JSON.stringify([...globalThis.__blobs.get("funnels").entries()]);
  ok(!/\d+\.\d+\.\d+\.\d+|ip|user|session/i.test(raw.replace(/"clicks\/[^"]+"/g, "")), "no address, no id stored");
  ok(JSON.stringify(F.clickBody("the-dive", "out", "https://birdsperson.itch.io/jetsam?utm_source=x")) === JSON.stringify({ c: "the-dive", k: "out", to: "birdsperson.itch.io" }), "the browser sends the host, never the path");
  for (const c of new Set(Object.values(F.CAMPAIGN_OF_PLACE).concat(Object.values(F.FUNNEL_OF).map(f => f.campaign), Object.values(F.CABINET_BUILDINGS)))) ok(L.CAMPAIGNS.has(c), `the counter accepts campaign ${c}`);
  for (const g of F.GAMES) for (const u of [g.play, g.itch]) if (u) ok(L.HOSTS.has(new URL(u).host), `the counter accepts ${new URL(u).host}`);
}

// 7. The house games (src/city/houseGames.js): our own games as cabinets in the bars and THE ARCADE's
//    back row. Every one placed resolves to a route App.jsx serves; one whose route is missing is
//    hidden everywhere (no cabinet, no button), like the #play tiles.
{
  const HG = await import("../src/city/houseGames.js");
  const { routesIn } = await import("../src/play/games.js");
  const routes = new Set(routesIn(readFileSync(join(ROOT, "src/App.jsx"), "utf8")));
  const kept = HG.HOUSE_ALL;
  ok(kept.length >= 8 && kept.every(g => g.house === true && g.route && /^#[a-z]/.test(g.route) && g.status === "live" && !g.play), "the house list: our own games, each naming its route, nothing off-site");
  const sync = await import("./sync-arcade.mjs");
  ok(sync.houseIn(readFileSync(join(ROOT, "src/city/arcade.json"), "utf8")).length === kept.length, "the sync keeps the house games it finds in arcade.json");
  ok(!F.GAMES.some(g => g.house) && F.OWN_GAMES.every(g => !g.house), "the house games stay off the studio's list (the works.json check is unchanged)");
  for (const want of ["#golf", "#hunt", "#tennis", "#hoops", "#fish", "#bowling", "#tecmo", "#soccer", "#ski"]) ok(kept.some(g => g.route === want), `a house cabinet for ${want}`);
  const live = HG.houseLive(routes), liveSet = new Set(live.map(g => g.slug));
  for (const g of live) ok(routes.has(g.route.split(/[/?]/)[0]), `${g.slug}: its route ${g.route} is served`);
  for (const g of kept.filter(g => !routes.has(g.route.split(/[/?]/)[0]))) ok(!liveSet.has(g.slug) && !HG.houseFor("union", liveSet).includes(g.slug), `${g.slug}: ${g.route} is not served yet, so the cabinet is hidden`);
  ok(HG.houseLive(new Set(["#golf"])).map(g => g.slug).join() === "house-golf", "a route missing hides its cabinet (#golf alone: TEE'D OFF alone)");
  ok(["house-golf", "house-hunt", "house-tennis", "house-hoops", "house-fish"].every(s => liveSet.has(s)), "golf, the hunt, tennis, basketball and fishing are live cabinets today");
  // the rooms (node has no route table: every house game is placed; the build hides the missing ones)
  const placed = (pid) => { const pl = PROPS.roomPlan(PROPS.typeOf(pid), 916, 120, 32, Math.round(SIM.PLACES[pid].cap / SIM.PLACES[pid].floors.length)); return { pl, cabs: pl.rows.flatMap(r => r.items.map(i => FP.cabinetGame(i.prop)).filter(Boolean)) }; };
  const dive = placed("dive-bar").cabs;
  ok(dive.includes("jetsam") && dive.includes("house-hunt") && dive.includes("house-golf"), "THE DIVE: JETSAM!, TAGGED OUT and TEE'D OFF");
  ok(["house-golf", "house-hunt"].every(s => placed("goodnight-irenes").cabs.includes(s)), "GOODNIGHT IRENE'S: golf and the hunt");
  ok(PROPS.typeOf("the-lantern") === "bar-lantern" && placed("the-lantern").cabs.includes("house-hoops") && placed("the-lantern").cabs.includes("jetsam"), "THE LANTERN: the shooting machine and JETSAM!");
  ok(placed("casino").cabs.includes("house-golf") && placed("casino").cabs.includes("jetsam"), "the casino's corner: golf beside JETSAM!");
  ok(PROPS.roomPlan("bar-lantern", 460, 150, 32).anchors.some(a => a.role === "staff" && a.act === "pour"), "THE LANTERN keeps its bartender");
  ok(PROPS.PLANNED_TYPES.includes("bar-lantern") && PROPS.DRAWN_TYPES.includes("bar-lantern"), "THE LANTERN's own type is planned and drawn (a bar's walls)");
  for (const [w, h, sw] of [[916, 120, 32], [700, 110, 32]]) {
    const pl = PROPS.roomPlan("arcade", w, h, sw, 8);
    const back = pl.rows.length > 1 ? pl.rows[0].items.map(i => FP.cabinetGame(i.prop)).filter(Boolean) : [];
    ok(F.HOUSE.every(g => back.includes(g.slug)), `arcade ${w}x${h}: the back row is HOUSE GAMES, every one`);
  }
  for (const g of F.HOUSE) ok(!!PROPS.PROP[`cab:${g.slug}`], `cab:${g.slug} is drawn`);
  // a tap on a house cabinet opens it, and it resolves to its own route in the CRT
  const { pl } = placed("dive-bar");
  const hits = FP.funnelRoomHits("dive-bar", pl);
  for (const s of ["house-hunt", "house-golf"]) {
    const h = hits.find(x => x.spec.slug === s);
    ok(h && h.spec.kind === "game" && h.spec.campaign === s && L.CAMPAIGNS.has(s), `a tap on THE DIVE's ${s} cabinet opens it, counted as itself`);
    ok(FP.funnelTapAt("dive-bar", pl, (h.box[0] + h.box[2]) / 2, (h.box[1] + h.box[3]) / 2)?.slug === s, `${s}: the tap lands on its own box`);
    ok(HG.houseSrc(F.GAME[s]) === `/${F.GAME[s].route}?cab=1`, `${s} plays its own route in the CRT, in cabinet mode`);
  }
  ok(F.funnelButtons("the-dive").some(b => b.label === "TAGGED OUT") && F.funnelButtons("the-surfside").some(b => b.label === "TEE'D OFF"), "the toolbar offers the house cabinets in their buildings");
  // the marquee: the dead hold the day's high score in the game's own units; a verified player's beats it
  const hs = F.highScore("house-golf", "dive-bar", 600);
  ok(/^-\d+ \(\d+\)$/.test(hs.score) && hs.low && hs.initials.length === 3, "TEE'D OFF's high score is strokes under par, held by a figure on file");
  ok(/^\d{1,3}(,\d{3})+$/.test(F.highScore("house-hunt", "x", 600).score), "TAGGED OUT's is points");
  const day = 600, dead = F.highScore("house-hunt", "x", day);
  HG.setVerified("house-hunt", { tag: "SBX", n: dead.n + 10, day });
  const m = F.marqueeScore("house-hunt", "x", day);
  ok(m.player && m.initials === "SBX", "a verified score that beats the dead puts the player's tag on the marquee");
  HG.setVerified("house-hunt", { tag: "SBX", n: dead.n - 10, day });
  ok(!F.marqueeScore("house-hunt", "x", day).player, "a lower one does not");
  HG.setVerified("house-hunt", { tag: "SBX", n: dead.n + 10, day: day - 1 });
  ok(!F.marqueeScore("house-hunt", "x", day).player, "yesterday's board does not hold today's marquee");
  HG.setVerified("house-hunt", null);
  ok(!F.marqueeScore("house-golf", "x", day).player, "no verification, no player's tag (TEE'D OFF is not re-played)");
  const ov = readFileSync(join(ROOT, "src/city/FunnelOverlay.jsx"), "utf8"), app = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  ok(/src=\{houseSrc\(g\)\}/.test(ov) && /cabinet-close/.test(ov) && /cabinet-close/.test(app) && /CABINET/.test(app), "the CRT plays our own route, and leaving the game returns to the bar");
  // in the city nothing is killed: the foothills' outfitter captures (Scott, 2026-10-05)
  ok(/CAPTURE PERMITS ISSUED\. THE ANIMALS WILL BE HOUSED, AT GREAT EXPENSE\./.test(F.OUTFITTER.line) && /SAFARI ZONE: OPENING SOON/.test(F.OUTFITTER.soon), "the outfitter captures; the Safari Zone opens soon");
  ok(F.funnelButtons("the-foothills").some(b => b.spec.kind === "outfitter") && F.findFunnel("safari").some(f => f.id === "the-foothills"), "the foothills offer the outfitter; FIND finds it");
  const city = ["src/city/funnels.js", "src/city/coastDraw.js", "src/city/houseGames.js"].map(f => readFileSync(join(ROOT, f), "utf8")).join("\n").replace(/house-hunt|TAGGED OUT|hunt\b|the hunt|a hunt|Light-gun hunting/gi, "");
  ok(!/\b(kill|hunting lodge|tags issued)\b/i.test(city), "the city's outfitter copy has no killing in it");
}

// 8. The standees' faces ship with the site.
ok(existsSync(join(ROOT, "public/funnels/hosts.png")), "public/funnels/hosts.png is there");

console.log(failed ? `check-funnels: ${failed} of ${n} FAILED` : `check-funnels: ${n} checks passed`);
process.exit(failed ? 1 : 0);
