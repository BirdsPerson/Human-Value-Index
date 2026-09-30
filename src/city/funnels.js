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

export const GAMES = GAMES_JSON;
export const GAME = Object.fromEntries(GAMES.map(g => [g.slug, g]));
export const LIVE_GAMES = GAMES.filter(g => g.status === "live");
export const PLAYABLE = GAMES.filter(g => g.status !== "dev");

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
};
// Cabinets standing elsewhere, by place: the game and the campaign their links carry.
export const CABINET_PLACES = {
  "dive-bar": ["jetsam"], "the-lantern": ["jetsam"], "all-night-diner": ["jetsam"], casino: ["jetsam"],
  "campus-lounge": ["jetsam", "anamnesis"], boardwalk: ["jetsam"],
};
export const CAMPAIGN_OF_PLACE = { "dive-bar": "the-dive", "the-lantern": "the-dive", "all-night-diner": "the-diner", casino: "casino", "campus-lounge": "union-lounge", arcade: "the-arcade", "eb-shop": "eb-shop", "studio-row": "ebtv-station", boardwalk: "the-boardwalk" };
// Buildings whose rooms hold a cabinet (the toolbar offers PLAY there too).
export const CABINET_BUILDINGS = { "the-dive": "the-dive", "press-building": "the-diner", casino: "casino", "eb-shop": "union-lounge", "the-boardwalk": "the-boardwalk" };

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
  if (slug === "anamnesis") { const n = 24, hits = 6 + ((k >>> 8) % 9); score = `${hits}/${n} HITS`; }
  else { const v = 12000 + ((k >>> 6) % 880000); score = String(v - (v % 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  return { name, initials, score, title: g?.title || slug.toUpperCase() };
}

// The cabinet's marquee colours, per game (the dark ones grey).
export const CAB_COLORS = { jetsam: ["#22d3ee", "#f472b6"], anamnesis: ["#4ade80", "#14532d"], "human-value-index": ["#4ade80", "#fbbf24"] };
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
  if (f?.kind === "shop") out.push({ label: "SHOP", aria: "Shop the EB Shop's live stock", spec: { kind: "shop", campaign: f.campaign } });
  if (f?.kind === "ebtv") out.push({ label: "WATCH", aria: "Watch Electric Basement TV live", spec: { kind: "ebtv", campaign: f.campaign } });
  const c = CABINET_BUILDINGS[buildingId];
  if (c) out.push({ label: "JETSAM!", aria: "Play JETSAM! on the cabinet here", spec: { kind: "game", slug: "jetsam", campaign: c } });
  return out;
}
