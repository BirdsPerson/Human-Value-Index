// Who plays at THE BOWL: the city's football league (src/city/leagues.js, docs/CITY_SPEC.md "The
// leagues and the Departmental Cup"), each Loop district's drafted eleven for the current season, as
// the plan builder publishes them in the day's summary (civic.districts[id].teams.football.roster:
// [[key, name, rating] x 11]). Pure apart from loadLeague (fetch). The city's sim stays out of this
// page's bundle: the team names and the clock's epoch are copied here and scripts/check-football.mjs
// holds them equal to leagues.js and city/sim.js.
//
// Content rule (the chess tables', the tennis club's, the courts'): the living appear and play and
// never speak; nobody here is quoted. The calls are the Department's, about the play.

import { lineup, abilities, OS, DS, DS_NAMES } from "./sim.js";

export const TEAM_IDS = ["arts", "campus", "finance", "strip", "arena", "hq", "archive", "commons", "works", "sprawl"];
export const TEAMS = {
  arts: ["THE CURATED", "CURATED"], campus: ["THE TENURED", "TENURED"], finance: ["THE LEVERAGED", "LEVERAGED"], strip: ["THE HOUSE EDGE", "HOUSE EDGE"],
  arena: ["THE CONDITIONED", "CONDITIONED"], hq: ["THE DEPARTMENT", "DEPARTMENT"], archive: ["THE INDEXED", "INDEXED"], commons: ["THE TOLERATED", "TOLERATED"],
  works: ["THE PROCESSED", "PROCESSED"], sprawl: ["THE RETURNED", "RETURNED"],
  // THE PYRAMID (docs/design/PYRAMID.md; leagues.js EXPANSION_CLUBS): the expansion districts' clubs, founded into the Championship from season 24
  coast: ["THE LIFEGUARDED", "LIFEGUARDED"], heights: ["THE DESCENDED", "DESCENDED"], port: ["THE DECLARED", "DECLARED"], oldtown: ["THE PRESERVED", "PRESERVED"], uptown: ["THE ADMITTED", "ADMITTED"],
  downtown: ["THE AMPLIFIED", "AMPLIFIED"], suburbs: ["THE MEASURED", "MEASURED"], airport: ["THE SCREENED", "SCREENED"], farmland: ["THE HARVESTED", "HARVESTED"], engine: ["THE COMPUTED", "COMPUTED"],
};
// A club id is a district, or a district's reserves (<district>-2: THE CURATED SECOND ELEVEN, CURATED II) or thirds (-3).
const clubDistrict = (id) => String(id || "").split("-")[0];
const clubTier = (id) => Number(String(id || "").split("-")[1]) || 1;
const TIER = { 2: ["SECOND", "II"], 3: ["THIRD", "III"] };
export const teamName = (id) => { const b = TEAMS[clubDistrict(id)]; if (!b) return `${String(id).toUpperCase()} ELEVEN`; const t = clubTier(id); return `${t > 1 ? `${b[0]} ${TIER[t]?.[0] || t}` : b[0]} ELEVEN`; };
export const teamShort = (id) => { const b = TEAMS[clubDistrict(id)]; if (!b) return String(id).toUpperCase(); const t = clubTier(id); return t > 1 ? `${b[1]} ${TIER[t]?.[1] || t}` : b[1]; };
// The kits: [jersey, trim]. One standard uniform, the district's colours (avatar CLOTH values, as the
// courts); the expansion clubs' from leagues.js EXPANSION_KITS; reserves wear theirs swapped, thirds the trim alone.
const DISTRICT_KITS = {
  arts: ["#d977a8", "#262626"], campus: ["#1f2f5a", "#e0c040"], finance: ["#3c8a46", "#e6e6e6"], strip: ["#b83232", "#e0c040"],
  arena: ["#d97a2b", "#262626"], hq: ["#e6e6e6", "#3c8a46"], archive: ["#6b3fa0", "#e6e6e6"], commons: ["#3a6fd8", "#e6e6e6"],
  works: ["#8a8a8a", "#d97a2b"], sprawl: ["#45618f", "#e0c040"],
  coast: ["#e8d8a8", "#2a7f9e"], heights: ["#f0f4f8", "#4a6fa5"], port: ["#9a4a2a", "#c0c0c0"], oldtown: ["#8b3a3a", "#f0e6d0"], uptown: ["#1a1a1a", "#d4af37"],
  downtown: ["#5a2d82", "#39ff14"], suburbs: ["#4f8f3a", "#ffffff"], airport: ["#6b7280", "#ff8c00"], farmland: ["#d9b44a", "#3f6b2a"], engine: ["#1f8a8a", "#111111"],
};
export const kitOf = (id, dflt = "hq") => { const k = DISTRICT_KITS[clubDistrict(id)] || DISTRICT_KITS[dflt], t = clubTier(id); return t === 2 ? [k[1], k[0]] : t > 2 ? [k[1], k[1]] : k; };
export const KITS = DISTRICT_KITS;

// ---- THE PYRAMID in the games (docs/design/PYRAMID.md section 7: the data hook) ------------------------
// league.divisions: [[club ids] per division, the top flight first] (one division, the Loop's ten,
// before the pyramid). The difficulty follows the division: cpu 1 at the top, 0 at the bottom.
export const DIV_NAMES = [["THE PREMIER DIVISION", "PREMIER"], ["THE CHAMPIONSHIP", "CHAMPIONSHIP"], ["LEAGUE ONE", "LEAGUE ONE"], ["LEAGUE TWO", "LEAGUE TWO"], ["THE SUNDAY LEAGUE", "SUNDAY"]];
export const divisionsOf = (league) => (Array.isArray(league?.divisions) && league.divisions.length ? league.divisions : [TEAM_IDS]);
export const divisionOf = (league, id) => Math.max(0, divisionsOf(league).findIndex(ids => ids.includes(id)));
export const allClubs = (league) => divisionsOf(league).flat().filter(id => league?.teams?.[id]?.length);
export function difficultyOf(league, level = 0) {
  const of = divisionsOf(league).length, k = Math.max(0, Math.min(of - 1, level));
  const cpu = of <= 1 ? 1 : 1 - k / (of - 1);
  return { level: k, of, name: DIV_NAMES[Math.min(k, DIV_NAMES.length - 1)][0], short: DIV_NAMES[Math.min(k, DIV_NAMES.length - 1)][1], cpu, easy: k > 0 };
}
export const defaultLevelIndex = (league, level, n) => Math.round(difficultyOf(league, level).cpu * (n - 1));
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
// The away side changes into its trim when both jerseys are light or dark alike.
export function kitsFor(home, away) {
  const a = kitOf(home), b = kitOf(away, "works");
  const close = (x, y) => Math.abs(lum(x) - lum(y)) < 45;
  return [a, close(a[0], b[0]) && !close(a[0], b[1]) ? [b[1], b[0]] : b];
}

// The rosters as published for machine day 608 (season 22), for a page that cannot reach the plan.
// Draft order, as the summary carries them; the live rosters replace them when they load.
export const FALLBACK = {
  day: 608, season: 22, live: false,
  teams: {
    arts: [["jason-kelce", "Jason Kelce", 80], ["ayrton-senna", "Ayrton Senna", 85], ["ray-allen", "Ray Allen", 63], ["frederick-douglass", "Frederick Douglass", 56], ["shigeru-miyamoto", "Shigeru Miyamoto", 54], ["michael-faraday", "Michael Faraday", 53], ["jack-nicholson", "Jack Nicholson", 52], ["socrates", "Socrates (philosopher)", 52], ["geoffrey-chaucer", "Geoffrey Chaucer", 51], ["ryan-reynolds", "Ryan Reynolds", 51], ["j-j-abrams", "J. J. Abrams", 50]],
    campus: [["joe-namath", "Joe Namath", 77], ["tiger-woods", "Tiger Woods", 87], ["deion-sanders", "Deion Sanders", 61], ["carroll-shelby", "Carroll Shelby", 56], ["william-shatner", "William Shatner", 54], ["kendrick-lamar", "Kendrick Lamar", 53], ["jennifer-lopez", "Jennifer Lopez", 52], ["rza", "RZA", 52], ["hillary-clinton", "Hillary Clinton", 51], ["roger-waters", "Roger Waters", 51], ["jamie-dimon", "Jamie Dimon", 50]],
    finance: [["travis-kelce", "Travis Kelce", 84], ["bob-burnquist", "Bob Burnquist", 81], ["phil-mickelson", "Phil Mickelson", 72], ["barack-obama", "Barack Obama", 55], ["jensen-huang", "Jensen Huang", 54], ["samuel-l-jackson", "Samuel L. Jackson", 53], ["dustin-hoffman", "Dustin Hoffman", 52], ["betty-white", "Betty White", 51], ["david-stern", "David Stern", 51], ["tony-blair", "Tony Blair", 51], ["dave-matthews", "Dave Matthews", 50]],
    strip: [["nick-foles", "Nick Foles", 77], ["tenzing-norgay", "Tenzing Norgay", 87], ["katherine-stinson", "Katherine Stinson", 60], ["madonna", "Madonna", 57], ["augustus", "Augustus", 53], ["jimmy-page", "Jimmy Page", 53], ["john-lennon", "John Lennon", 52], ["plato", "Plato", 52], ["jimmy-buffett", "Jimmy Buffett", 51], ["martha-stewart", "Martha Stewart (businesswoman)", 51], ["jfk", "John F. Kennedy", 50]],
    arena: [["a-j-brown", "A. J. Brown", 82], ["roy-jones-jr", "Roy Jones Jr.", 83], ["peyton-manning", "Peyton Manning", 65], ["robert-plant", "Robert Plant", 56], ["prince", "Prince (musician)", 54], ["rabindranath-tagore", "Rabindranath Tagore", 53], ["henry-ford", "Henry Ford", 52], ["thomas-aquinas", "Thomas Aquinas", 52], ["eminem", "Eminem", 51], ["sonia-sotomayor", "Sonia Sotomayor", 51], ["glenn-danzig", "Glenn Danzig", 50]],
    hq: [["jalen-hurts", "Jalen Hurts", 83], ["sachin-tendulkar", "Sachin Tendulkar", 82], ["sergio-garcia", "Sergio García (professional golfer)", 60], ["tom-curran", "Tom Curran (cricketer)", 56], ["michelangelo", "Michelangelo", 54], ["rick-rubin", "Rick Rubin", 53], ["emiliano-zapata", "Emiliano Zapata", 52], ["trey-parker", "Trey Parker", 52], ["drew-barrymore", "Drew Barrymore", 51], ["steve-o", "Steve-O", 51], ["ethan-hawke", "Ethan Hawke", 50]],
    archive: [["tom-brady", "Tom Brady (football player)", 89], ["wayne-gretzky", "Wayne Gretzky", 81], ["charles-barkley", "Charles Barkley", 59], ["jane-fonda", "Jane Fonda", 55], ["pam-grier", "Pam Grier", 55], ["archie-manning", "Archie Manning", 52], ["brad-pitt", "Brad Pitt", 52], ["brad-bird", "Brad Bird", 51], ["carol-burnett", "Carol Burnett", 51], ["big-boi", "Big Boi", 50], ["bill-hader", "Bill Hader", 50]],
    commons: [["fred-williamson", "Fred Williamson", 76], ["jack-nicklaus", "Jack Nicklaus", 81], ["pedro-garcia-aguado", "Pedro García Aguado", 60], ["david-blaine", "David Blaine", 58], ["charles-dickens", "Charles Dickens", 53], ["grace-hopper", "Grace Hopper", 53], ["logan-paul", "Logan Paul", 52], ["patrick-stewart", "Patrick Stewart", 52], ["john-oates", "John Oates (musician)", 51], ["levar-burton", "LeVar Burton", 51], ["jude-law", "Jude Law", 50]],
    works: [["walter-payton", "Walter Payton", 88], ["oj-simpson", "O.J. Simpson", 63], ["bubba-watson", "Bubba Watson", 75], ["frank-sinatra", "Frank Sinatra", 55], ["albert-einstein", "Albert Einstein", 54], ["al-pacino", "Al Pacino", 52], ["christopher-nolan", "Christopher Nolan", 52], ["bob-geldof", "Bob Geldof", 51], ["danny-boyle", "Danny Boyle", 51], ["alexey-pajitnov", "Alexey Pajitnov", 50], ["charlize-theron", "Charlize Theron", 50]],
    sprawl: [["andy-dalton", "Andy Dalton", 71], ["aaron-hernandez", "Aaron Hernandez", 65], ["andre-the-giant", "André the Giant", 78], ["paul-mccartney", "Paul McCartney", 59], ["dolly-parton", "Dolly Parton", 53], ["ellen-church", "Ellen Church", 53], ["matt-stone", "Matt Stone", 52], ["michael-jackson", "Michael Jackson", 52], ["jon-stewart", "Jon Stewart", 51], ["kenneth-branagh", "Kenneth Branagh", 51], ["kate-winslet", "Kate Winslet", 50]],
  },
  pos: { arts: 4, campus: 6, finance: 1, strip: 10, arena: 9, hq: 8, archive: 7, commons: 2, works: 5, sprawl: 3 },
};

// The machine clock (src/city/sim.js machineClock): 1 real minute is 1 machine hour from the epoch.
export const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);
export const CLOCK_SCALE = 60;
export const machineDay = (ms = Date.now()) => Math.floor(((ms - CITY_EPOCH) * CLOCK_SCALE) / 3600000 / 24) + 1;

export const shownName = (name) => String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim().toUpperCase();
export const sortEleven = (rows) => [...(rows || [])].sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1)).slice(0, 11);
export const teamRating = (rows) => (rows?.length ? Math.round(rows.reduce((n, r) => n + r[2], 0) / rows.length) : 0);

export const citizenKeyOf = (caseId) => `citizen-${String(caseId || "").slice(-4).toLowerCase()}`;
export function teamOfCase(league, caseId) {
  if (!caseId || !league) return null;
  const k = citizenKeyOf(caseId);
  return Object.keys(league.teams || {}).find(id => (league.teams[id] || []).some(r => r[0] === k)) || null;
}
// PLAY NOW: your own eleven when you are on one, else THE DEPARTMENT ELEVEN (one division) or the
// bottom division's leader (the pyramid: everyone starts at the bottom); against the team nearest it
// in rating in the same division (an even game), the higher table position breaking a tie.
export function playNowPair(league, mine = null) {
  const divs = divisionsOf(league), bottom = divs[divs.length - 1].filter(id => league.teams[id]?.length);
  const home = mine && league.teams[mine] ? mine : divs.length > 1 && bottom.length ? [...bottom].sort((a, b) => (league.pos[a] || 99) - (league.pos[b] || 99) || (a < b ? -1 : 1))[0] : "hq";
  const r0 = teamRating(league.teams[home]), pool = divs[divisionOf(league, home)] || TEAM_IDS;
  const away = pool.filter(id => id !== home && league.teams[id]?.length).sort((a, b) =>
    Math.abs(teamRating(league.teams[a]) - r0) - Math.abs(teamRating(league.teams[b]) - r0) || (league.pos[a] || 99) - (league.pos[b] || 99) || (a < b ? -1 : 1))[0];
  return [home, away];
}

export async function loadLeague(fetchFn = globalThis.fetch, now = Date.now()) {
  if (typeof fetchFn !== "function") return null;
  const get = async (u) => { const r = await fetchFn(u); if (!r.ok) return null; return r.json(); };
  const m = await get("/api/plan");
  if (!m) return null;
  const today = machineDay(now);
  for (const day of [today, today - 1, m.latest]) {
    const ver = m.sectors?.[day];
    if (!ver) continue;
    const lg = leagueFrom(await get(`/api/plan/${day}/${ver}/summary`));
    if (lg) return lg;
  }
  return null;
}
export function leagueFrom(sum) {
  const D = sum?.civic?.districts;
  if (!D) return null;
  const teams = {}, pos = {};
  const rows = (t) => t.roster.filter(r => Array.isArray(r) && r.length >= 3).map(([k, n, r]) => [String(k), String(n), Number(r) || 40]);
  for (const id of TEAM_IDS) {
    const t = D[id]?.teams?.football;
    if (!Array.isArray(t?.roster) || !t.roster.length) return null;
    teams[id] = rows(t); pos[id] = t.pos || 0;
  }
  // the pyramid's other clubs (the expansion districts', the reserves), when the block carries them
  const py = sum.civic.leagues?.pyramid, divisions = Array.isArray(py?.clubs?.football) ? py.clubs.football : null;
  for (const id of divisions ? divisions.flat() : []) {
    if (teams[id]) continue;
    const t = clubTier(id) === 1 ? D[id]?.teams?.football : sum.civic.leagues?.reserves?.[id]?.teams?.football;
    if (Array.isArray(t?.roster) && t.roster.length) { teams[id] = rows(t); pos[id] = t.pos || 0; }
  }
  return { day: sum.day, season: sum.civic.leagues?.season || null, live: true, teams, pos, ...(divisions ? { divisions: divisions.map(ids => ids.filter(id => teams[id])) } : {}) };
}

// Heads for figures whose likeness is not drawn yet (avatar.js fields near enough), as the courts.
export const HINTS = {
  "tom-brady": { skin: "fair", hair_style: "short", hair_color: "brown" },
  "jalen-hurts": { skin: "brown", hair_style: "short", hair_color: "black", facial_hair: "beard" },
  "joe-namath": { skin: "fair", hair_style: "side_part", hair_color: "dark_brown" },
  "nick-foles": { skin: "fair", hair_style: "short", hair_color: "brown", facial_hair: "beard" },
  "andy-dalton": { skin: "fair", hair_style: "short", hair_color: "red" },
  "peyton-manning": { skin: "fair", hair_style: "short", hair_color: "brown" },
  "archie-manning": { skin: "fair", hair_style: "side_part", hair_color: "grey" },
  "walter-payton": { skin: "brown", hair_style: "short", hair_color: "black", facial_hair: "mustache" },
  "jason-kelce": { skin: "fair", hair_style: "short", hair_color: "brown", facial_hair: "beard" },
  "travis-kelce": { skin: "fair", hair_style: "short", hair_color: "brown", facial_hair: "beard" },
  "a-j-brown": { skin: "brown", hair_style: "short", hair_color: "black" },
  "fred-williamson": { skin: "brown", hair_style: "short", hair_color: "black", facial_hair: "mustache" },
  "deion-sanders": { skin: "brown", hair_style: "short", hair_color: "black", facial_hair: "beard" },
  "andre-the-giant": { skin: "fair", hair_style: "curly", hair_color: "black" },
};
export const CROPS = {};

// ---- the ratings on the setup screen -----------------------------------------------------------------
// One number per unit, from the eleven as the sim lines them up (sim.js lineup): the offence weighted
// to the men who touch the ball, the defence to the men in coverage and the middle linebacker, special
// teams the kicker and the returner. OVERALL stays the league's own figure (the mean of the eleven,
// teamRating) so the setup screen and the league table agree. Key players: who plays where.
const wmean = (pairs) => { let n = 0, d = 0; for (const [v, w] of pairs) { n += v * w; d += w; } return d ? Math.round(n / d) : 0; };
export function teamUnits(rows) {
  const xi = sortEleven(rows);
  if (xi.length < 11) return { ovr: teamRating(xi), off: 0, def: 0, st: 0, key: [] };
  const L = lineup(xi), r = (i) => xi[i][2], at = (slots) => slots.map(([s, w]) => [r(L.os[s]), w]), dt = (slots) => slots.map(([s, w]) => [r(L.ds[s]), w]);
  const off = wmean(at([[OS.QB, 3], [OS.RB, 2], [OS.WR1, 1.6], [OS.WR2, 1.6], [OS.TE, 1.1], [OS.WR3, 1.1], [OS.LT, 0.7], [OS.LG, 0.7], [OS.C, 0.7], [OS.RG, 0.7], [OS.RT, 0.7]]));
  const def = wmean(dt([[DS.CB1, 1.6], [DS.CB2, 1.6], [DS.FS, 1.2], [DS.SS, 1.2], [DS.MLB, 1.6], [DS.WLB, 1], [DS.SLB, 1], [DS.LE, 1], [DS.RE, 1], [DS.DT1, 0.8], [DS.DT2, 0.8]]));
  const ret = xi.map((row, i) => [i, abilities(row[2], row[0]).spd]).filter(([i]) => i !== L.os[OS.QB] && i !== L.k).sort((a, b) => b[1] - a[1])[0]?.[0];
  const st = wmean([[r(L.k), 1], [ret != null ? r(ret) : r(L.k), 1]]);
  const DSL = [DS.CB1, DS.CB2, DS.FS, DS.SS, DS.MLB, DS.WLB, DS.SLB, DS.LE, DS.RE, DS.DT1, DS.DT2];
  const dslot = DSL.filter(s => L.ds[s] !== L.os[OS.QB] && L.ds[s] !== L.os[OS.RB]).sort((a, b) => r(L.ds[b]) - r(L.ds[a]))[0];
  const key = [["QB", L.os[OS.QB]], ["HB", L.os[OS.RB]], ["WR", L.os[OS.WR1]], ["TE", L.os[OS.TE]], [DS_NAMES[dslot], L.ds[dslot]], ["K", L.k]]
    .map(([pos, i]) => ({ pos, key: xi[i][0], name: shownName(xi[i][1]), r: r(i) }));
  return { ovr: teamRating(xi), off, def, st, key };
}
