// The funnels (Scott, 2026-09-30: "we should always be putting our funnels to everything
// else"): the city's doors out to the real work. Pure (node-testable), no DOM:
//   - cabinets: which game stands where (THE ARCADE holds every Iridescent game; JETSAM! and
//     ANAMNESIS cabinets stand in the Dive, the diner, the casino, the Union lounge)
//   - the tagged links: every outbound link carries utm_source=humanvalueindex&utm_medium=city
//     &utm_campaign=<building>, so the studio's analytics can tell what the city sends
//   - the high score on each cabinet's marquee, deterministic per machine day (the dead hold it)
// The overlays are FunnelOverlay.jsx; the drawing is funnelDraw.js (outside) and
// funnelProps.js (inside); the counters are netlify/functions/funnel.js.
import GAMES_JSON from "./arcade.json" with { type: "json" };
import { FAMOUS_FIGURES } from "../figures.js";
import { HOUSE, HOUSE_COLORS, verifiedFor } from "./houseGames.js";

// GAMES: the studio's own works and the neighbours (THE ARCADE's floor). The house games (our own
// playable games as bar cabinets, houseGames.js) are listed apart, and only those whose route is
// served; GAME looks any of them up.
export const GAMES = GAMES_JSON.filter(g => !g.house);
export const GAME = Object.fromEntries([...GAMES, ...HOUSE].map(g => [g.slug, g]));
export { HOUSE };
export const LIVE_GAMES = GAMES.filter(g => g.status === "live");
export const PLAYABLE = GAMES.filter(g => g.status !== "dev");
// Iridescent's own games (the works list) and the neighbours: other people's games with a
// tribute cabinet here (INTERNET CITY), each with its own campaign, never claimed as ours.
export const OWN_GAMES = GAMES.filter(g => !g.neighbour);
export const NEIGHBOURS = GAMES.filter(g => g.neighbour);
export const campaignFor = (slug, fallback) => GAME[slug]?.campaign || fallback || "city";

export const ITCH_LINE = "AN IRIDESCENT PRODUCTION. ALSO ON ITCH.IO";
export const EB_SHOP = "https://shop.electricbasement.tv";
export const EBTV_SITE = "https://electricbasement.tv";
export const EBTV_STREAM = "https://live.electricbasement.tv/live/master.m3u8";
export const EBTV_NOW = "https://live.electricbasement.tv/live/now.json";

// The funnel buildings: what tapping them (the toolbar, the building page) opens.
export const FUNNEL_OF = {
  "the-arcade": { kind: "arcade", campaign: "the-arcade", button: "PLAY" },
  "eb-shop": { kind: "shop", campaign: "eb-shop", button: "SHOP" },
  "studio-block": { kind: "ebtv", campaign: "ebtv-station", button: "WATCH" },
  // THE AIRPORT's departures hall is the city's door (PHASE 2 step 4): new arrivals, INTAKE
  "departures-hall": { kind: "arrivals", campaign: "departures-hall", button: "ARRIVALS" },
};
// FIND > finds the funnel buildings by name too (CityFind.jsx), above the people: the words
// someone would type looking for the shop, the games or the channel.
export const FUNNEL_FIND = [
  { id: "eb-shop", district: "campus", name: "EB SHOP", line: "CAMPUS // THE SHOP FLOOR: LIVE STOCK ON THE WALLS", words: "eb shop electric basement store records dvd buy merch" },
  { id: "the-arcade", district: "strip", name: "THE ARCADE", line: "THE STRIP // A CABINET FOR EVERY GAME", words: "arcade games cabinet jetsam anamnesis play iridescent" },
  { id: "studio-block", district: "arts", name: "ELECTRIC BASEMENT TV", line: "THE ARTS QUARTER // LIVE", words: "ebtv electric basement tv watch station channel" },
  // the foothills' outfitter: a capture outfitter (tranquilliser darts, nets, crates), never a hunt;
  // the future door to THE SAFARI ZONE (Scott, 2026-10-05: in the city nothing is killed)
  // THE SHORE PLAZA (shorePlaza.js; the id kept from THE SURFSIDE): Sam's at the street, Irene's over it
  { id: "the-surfside", district: "coast", name: "THE SHORE PLAZA", line: "THE COAST // SAM'S PIZZA PALACE AT THE STREET, GOODNIGHT IRENE'S UPSTAIRS", words: "shore plaza surfside sams sam's pizza palace slice goodnight irenes irene's brewery brewpub beer taproom motel boardwalk" },
  { id: "the-foothills", district: "heights", name: "THE OUTFITTER", line: "THE FOOTHILLS // WILDLIFE CAPTURE. SAFARI ZONE OPENING SOON", words: "outfitter safari capture wildlife zoo darts nets crates ranger foothills" },
];
export function findFunnel(q) {
  const t = String(q || "").trim().toLowerCase();
  if (t.length < 2) return [];
  return FUNNEL_FIND.filter(f => f.name.toLowerCase().includes(t) || f.words.split(" ").some(w => w.startsWith(t)) || (t.length >= 4 && f.words.includes(t)));
}

// Cabinets standing elsewhere, by place: the game and the campaign their links carry.
export const CABINET_PLACES = {
  "dive-bar": ["jetsam"], "the-lantern": ["jetsam"], "all-night-diner": ["jetsam"], casino: ["jetsam"],
  "campus-lounge": ["jetsam", "anamnesis"], boardwalk: ["jetsam"],
  // THE PORT's first gateway to another world (Scott, 2026-10-05: one megacity, gateways at the Port)
  "customs-house": ["internet-city"],
};
export const CAMPAIGN_OF_PLACE = { "dive-bar": "the-dive", "the-lantern": "the-dive", "all-night-diner": "the-diner", casino: "casino", "campus-lounge": "union-lounge", arcade: "the-arcade", "eb-shop": "eb-shop", "studio-row": "ebtv-station", boardwalk: "the-boardwalk", "customs-house": "internet-city-cabinet" };
// Buildings whose rooms hold a cabinet (the toolbar offers PLAY there too).
export const CABINET_BUILDINGS = { "the-dive": "the-dive", "press-building": "the-diner", casino: "casino", "eb-shop": "union-lounge", "the-boardwalk": "the-boardwalk" };
// The house cabinets a building's rooms hold (the toolbar offers each), from houseGames.HOUSE_PLACES.
export const HOUSE_BUILDINGS = { "the-dive": ["house-hunt", "house-golf", "house-hoops"], "the-surfside": ["house-golf", "house-hunt"], casino: ["house-golf"], "the-boardwalk": ["house-hoops", "house-fish"], "press-building": ["house-fish"] };
// The foothills outfitter's line (FunnelOverlay "outfitter"; the building's button)
export const OUTFITTER = { title: "THE OUTFITTER", line: "CAPTURE PERMITS ISSUED. THE ANIMALS WILL BE HOUSED, AT GREAT EXPENSE.", soon: "SAFARI ZONE: OPENING SOON." };

// -> the url with the city's tags (an existing query and hash kept; a tag already there replaced)
export function utm(url, campaign, content = null) {
  if (!url) return url;
  const u = new URL(url);
  u.searchParams.set("utm_source", "humanvalueindex");
  u.searchParams.set("utm_medium", "city");
  u.searchParams.set("utm_campaign", campaign || "city");
  if (content) u.searchParams.set("utm_content", String(content).slice(0, 60));
  return u.toString();
}
export const isTagged = (url) => { try { const q = new URL(url).searchParams; return q.get("utm_source") === "humanvalueindex" && q.get("utm_medium") === "city" && Boolean(q.get("utm_campaign")); } catch { return false; } };

// ---- the high score -------------------------------------------------------------------
function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const HOLDERS = FAMOUS_FIGURES.filter(f => f.died).map(f => f.name);
// The day's high score on a cabinet: who (a figure on file, dead: the dead have the time),
// the initials the marquee has room for, the score. Same for every viewer on the same day.
export function highScore(slug, placeId, day) {
  const k = h32(`hs|${slug}|${day}`);   // one high score per game per day, on every cabinet (placeId kept for callers)
  void placeId;
  const name = HOLDERS.length ? HOLDERS[k % HOLDERS.length] : "UNFILED";
  const last = name.replace(/\(.*\)/, "").trim().split(/\s+/).pop().toUpperCase().replace(/[^A-Z]/g, "");
  const initials = (last + "XXX").slice(0, 3);
  const g = GAME[slug];
  let score;
  if (g?.house && g.hs) return { name, initials, ...houseScore(g, k), title: g.title };
  if (slug === "anamnesis") { const n = 24, hits = 6 + ((k >>> 8) % 9); score = `${hits}/${n} HITS`; }
  else { const v = 12000 + ((k >>> 6) % 880000); score = String(v - (v % 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  return { name, initials, score, title: g?.title || slug.toUpperCase() };
}

// A house game's high score in its own units: n (the number compared; golf's strokes, lower is better).
const comma = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export function houseScore(g, k) {
  const { fmt, lo = 0, hi = 0 } = g.hs, v = lo + ((k >>> 6) % (hi - lo + 1));
  switch (fmt) {
    case "par": return { n: v, score: `${v} (${72 + v})`, low: true };
    case "pts": { const r = v - (v % 10); return { n: r, score: comma(r) }; }
    case "pins": return { n: v, score: `${v} PINS` };
    case "hoops": return { n: v, score: `${v} PTS` };
    case "lb": return { n: v, score: `${(v / 100).toFixed(2)} LB` };
    case "time": { const m = Math.floor(v / 600), s = ((v % 600) / 10).toFixed(1).padStart(4, "0"); return { n: v, score: `${m}:${s}`, low: true }; }
    case "sets": { const a = k % 3, b = (k >>> 3) % 5; return { n: 0, score: `6-${a} 6-${b}` }; }
    default: return g.slug === "house-soccer" ? { n: 0, score: `${2 + (k % 3)}-${k % 2}` } : { n: 0, score: `${14 + (k % 4) * 7}-${(k >>> 4) % 3 * 7}` };
  }
}
// The marquee: the day's high score, or a player's verified score that beats it (houseGames.verifiedFor:
// TAGGED OUT's day board, the aquarium's heaviest plaque). -> highScore() plus {player: true} when theirs.
export function marqueeScore(slug, placeId, day) {
  const hs = highScore(slug, placeId, day), g = GAME[slug], v = g?.house ? verifiedFor(slug) : null;
  if (!v || typeof hs.n !== "number") return hs;
  if (v.day != null && v.day !== day) return hs;
  const beats = hs.low ? v.n < hs.n : v.n > hs.n;
  if (!beats) return hs;
  const score = g.hs.fmt === "lb" ? `${(v.n / 100).toFixed(2)} LB` : comma(v.n);
  return { name: v.tag, initials: v.tag, score, title: g.title, player: true, n: v.n };
}

// The cabinet's marquee colours, per game (the dark ones grey).
export const CAB_COLORS = {
  ...HOUSE_COLORS, "internet-city": ["#38bdf8", "#a3e635"], jetsam: ["#22d3ee", "#f472b6"], anamnesis: ["#4ade80", "#14532d"], "human-value-index": ["#4ade80", "#fbbf24"] };
export function cabColors(slug) {
  if (CAB_COLORS[slug]) return CAB_COLORS[slug];
  const k = h32(slug);
  const pal = [["#a78bfa", "#f472b6"], ["#fbbf24", "#f97316"], ["#60a5fa", "#22d3ee"], ["#f87171", "#fbbf24"]];
  return pal[k % pal.length];
}

// ---- the click counter -------------------------------------------------------------------
// Anonymous: the building, what was done (open | out), where to (a host, never a path).
export const COUNT_KINDS = new Set(["open", "out", "play"]);
export function clickBody(campaign, kind, url = null) {
  let to = null;
  try { to = url ? new URL(url).host : null; } catch { /* no host */ }
  return { c: String(campaign || "city").slice(0, 40), k: COUNT_KINDS.has(kind) ? kind : "open", to };
}

// ---- EBTV's now playing (live.electricbasement.tv/live/now.json, read by FunnelHost) ------
// The station's ON AIR light and the TVs in the bars and the diner read it. null until asked.
let EBTV = null;
export const ebtvNow = () => EBTV;
export function setEbtvNow(j, now = Date.now()) {
  EBTV = j && j.title ? { title: String(j.title).slice(0, 80), upNext: j.upNext ? String(j.upNext).slice(0, 80) : null, at: now } : { title: null, at: now };
}
// true: on air (answered with a title in the last 5 minutes); false: off; null: not asked yet
export function ebtvLive(now = Date.now()) {
  if (!EBTV) return null;
  return Boolean(EBTV.title) && now - EBTV.at < 5 * 60 * 1000;
}

// The buttons a funnel building offers (the city's toolbar, the building page): [{label, aria, spec}]
export function funnelButtons(buildingId) {
  const out = [];
  const f = FUNNEL_OF[buildingId];
  if (f?.kind === "arcade") out.push({ label: "PLAY", aria: "Play: the Arcade's cabinets", spec: { kind: "arcade" } });
  if (buildingId === "the-arcade") out.push({ label: "BOWL", aria: "Bowl: THE LANES, upstairs", spec: { kind: "lanes", go: "#bowling?from=lanes" } });   // THE LANES (lanes.js)
  if (f?.kind === "shop") out.push({ label: "SHOP", aria: "Shop the EB Shop's live stock", spec: { kind: "shop", campaign: f.campaign } });
  if (f?.kind === "arrivals") out.push({ label: "ARRIVALS", aria: "INTAKE: the new arrivals, awaiting release", spec: { kind: "arrivals", go: "#arrivals" } });
  if (f?.kind === "ebtv") out.push({ label: "WATCH", aria: "Watch Electric Basement TV live", spec: { kind: "ebtv", campaign: f.campaign } });
  if (buildingId === "the-plaza") out.push({ label: "PAPER", aria: "The newsstand: read today's Daily Compliance", spec: { kind: "paper", go: "#paper" } });
  const c = CABINET_BUILDINGS[buildingId];
  if (c) out.push({ label: "JETSAM!", aria: "Play JETSAM! on the cabinet here", spec: { kind: "game", slug: "jetsam", campaign: c } });
  for (const slug of HOUSE_BUILDINGS[buildingId] || []) if (GAME[slug]) out.push({ label: GAME[slug].title, aria: `Play ${GAME[slug].title} on the cabinet here`, spec: { kind: "game", slug, campaign: campaignFor(slug) } });
  if (buildingId === "the-foothills") out.push({ label: "OUTFITTER", aria: "The capture outfitter: the Safari Zone, opening soon", spec: { kind: "outfitter", campaign: "the-outfitter" } });
  if (buildingId === "customs-house" && GAME["internet-city"]) out.push({ label: "INTERNET CITY", aria: "The gateway to Internet City, a neighbouring city", spec: { kind: "game", slug: "internet-city", campaign: campaignFor("internet-city") } });
  return out;
}
