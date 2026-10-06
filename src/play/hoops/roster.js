// Who plays at THE COURTS: the city's basketball league (src/city/leagues.js, docs/CITY_SPEC.md "The
// leagues and the Departmental Cup"), each Loop district's drafted five for the current season, as
// the plan builder publishes them in the day's summary (civic.districts[id].teams.basketball.roster:
// [[key, name, rating] x 5]). Pure apart from loadLeague (fetch). The city's sim stays out of this
// page's bundle: the team names and the clock's epoch are copied here and scripts/check-hoops.mjs
// holds them equal to leagues.js and sim.js.
//
// Content rule (the chess tables', the tennis club's): the living appear and play and never speak;
// nobody here is quoted. The calls are the Department's, about the play.

export const TEAM_IDS = ["arts", "campus", "finance", "strip", "arena", "hq", "archive", "commons", "works", "sprawl"];
export const TEAMS = {
  arts: ["THE CURATED", "CURATED"], campus: ["THE TENURED", "TENURED"], finance: ["THE LEVERAGED", "LEVERAGED"], strip: ["THE HOUSE EDGE", "HOUSE EDGE"],
  arena: ["THE CONDITIONED", "CONDITIONED"], hq: ["THE DEPARTMENT", "DEPARTMENT"], archive: ["THE INDEXED", "INDEXED"], commons: ["THE TOLERATED", "TOLERATED"],
  works: ["THE PROCESSED", "PROCESSED"], sprawl: ["THE RETURNED", "RETURNED"],
  // THE PYRAMID (docs/design/PYRAMID.md; leagues.js EXPANSION_CLUBS): the expansion districts' clubs, founded into the Championship from season 24
  coast: ["THE LIFEGUARDED", "LIFEGUARDED"], heights: ["THE DESCENDED", "DESCENDED"], port: ["THE DECLARED", "DECLARED"], oldtown: ["THE PRESERVED", "PRESERVED"], uptown: ["THE ADMITTED", "ADMITTED"],
  downtown: ["THE AMPLIFIED", "AMPLIFIED"], suburbs: ["THE MEASURED", "MEASURED"], airport: ["THE SCREENED", "SCREENED"], farmland: ["THE HARVESTED", "HARVESTED"], engine: ["THE COMPUTED", "COMPUTED"],
};
// A club id is a district, or a district's reserves (<district>-2: THE CURATED SECOND FIVE, CURATED II) or thirds (-3).
const clubDistrict = (id) => String(id || "").split("-")[0];
const clubTier = (id) => Number(String(id || "").split("-")[1]) || 1;
const TIER = { 2: ["SECOND", "II"], 3: ["THIRD", "III"] };
export const teamName = (id) => { const b = TEAMS[clubDistrict(id)]; if (!b) return `${String(id).toUpperCase()} FIVE`; const t = clubTier(id); return `${t > 1 ? `${b[0]} ${TIER[t]?.[0] || t}` : b[0]} FIVE`; };
export const teamShort = (id) => { const b = TEAMS[clubDistrict(id)]; if (!b) return String(id).toUpperCase(); const t = clubTier(id); return t > 1 ? `${b[1]} ${TIER[t]?.[1] || t}` : b[1]; };
// The kits: [jersey, trim]. One standard uniform, the district's colours (avatar CLOTH values); the
// expansion clubs' from leagues.js EXPANSION_KITS; reserves wear theirs swapped, thirds the trim alone.
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
// Light jerseys a clash would hide: the away side changes into its trim when both are light or dark alike.
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
export function kitsFor(home, away) {
  const a = kitOf(home), b = kitOf(away, "works");
  const close = (x, y) => Math.abs(lum(x) - lum(y)) < 45;
  return [a, close(a[0], b[0]) && !close(a[0], b[1]) ? [b[1], b[0]] : b];
}

// The rosters as published for machine day 603 (season 22), for a page that cannot reach the plan
// (the dev server, the office down). The live rosters replace them when they load.
export const FALLBACK = {
  day: 603, season: 22, live: false,
  teams: {
    arts: [["nikola-jokic", "Nikola Jokić", 84], ["jalen-brunson", "Jalen Brunson", 80], ["william-shakespeare", "William Shakespeare", 53], ["carl-jung", "Carl Jung", 51], ["dan-aykroyd", "Dan Aykroyd", 50]],
    campus: [["kobe-bryant", "Kobe Bryant", 90], ["george-lucas", "George Lucas", 54], ["pablo-picasso", "Pablo Picasso", 54], ["helen-mirren", "Helen Mirren", 51], ["john-grisham", "John Grisham", 51]],
    finance: [["magic-johnson", "Magic Johnson", 83], ["joel-embiid", "Joel Embiid", 82], ["gene-roddenberry", "Gene Roddenberry", 52], ["david-cronenberg", "David Cronenberg", 51], ["josef-albers", "Josef Albers", 50]],
    strip: [["kareem-abdul-jabbar", "Kareem Abdul-Jabbar", 87], ["sylvester-stallone", "Sylvester Stallone", 56], ["gordon-ramsay", "Gordon Ramsay", 53], ["rupaul", "RuPaul", 52], ["snoop-dogg", "Snoop Dogg", 51]],
    arena: [["jaylen-brown", "Jaylen Brown", 83], ["julius-erving", "Julius Erving", 81], ["douglas-engelbart", "Douglas Engelbart", 52], ["mark-rober", "Mark Rober", 52], ["jake-gyllenhaal", "Jake Gyllenhaal", 50]],
    hq: [["larry-bird", "Larry Bird", 84], ["dennis-rodman", "Dennis Rodman", 78], ["paul-simon", "Paul Simon (singer-songwriter)", 53], ["taylor-swift", "Taylor Swift", 52], ["bad-bunny", "Bad Bunny", 50]],
    archive: [["lebron-james", "LeBron James", 89], ["leonardo-da-vinci", "Leonardo da Vinci", 55], ["alfred-hitchcock", "Alfred Hitchcock", 53], ["edward-r-murrow", "Edward R. Murrow", 51], ["laurence-fishburne", "Laurence Fishburne", 51]],
    commons: [["michael-jordan", "Michael Jordan", 88], ["bruce-irons", "Bruce Irons (surfer)", 55], ["david-byrne", "David Byrne", 53], ["jean-luc-godard", "Jean-Luc Godard", 52], ["peter-jackson", "Peter Jackson", 51]],
    works: [["stephen-curry", "Stephen Curry (basketball player)", 86], ["phil-jackson", "Phil Jackson (basketball player)", 71], ["keanu-reeves", "Keanu Reeves", 53], ["aldous-huxley", "Aldous Huxley", 51], ["tom-morello", "Tom Morello", 51]],
    sprawl: [["allen-iverson", "Allen Iverson", 83], ["tyrese-maxey", "Tyrese Maxey", 81], ["bob-marley", "Bob Marley", 52], ["nas", "Nas", 52], ["george-h-w-bush", "George H. W. Bush", 50]],
  },
  pos: {},
};

// The machine clock (src/city/sim.js machineClock): 1 real minute is 1 machine hour from the epoch.
export const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);
export const CLOCK_SCALE = 60;
export const machineDay = (ms = Date.now()) => Math.floor(((ms - CITY_EPOCH) * CLOCK_SCALE) / 3600000 / 24) + 1;

// A roster row's name for the board: no disambiguation in brackets, upper case.
export const shownName = (name) => String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim().toUpperCase();
// Best first: the best brings the ball up (sim.js plays the rows in the order given).
export const sortFive = (rows) => [...(rows || [])].sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
export const teamRating = (rows) => (rows?.length ? Math.round(rows.reduce((n, r) => n + r[2], 0) / rows.length) : 0);

// A player who entered the leagues from MY FILE plays under this key (netlify/lib/league-entries.js).
export const citizenKeyOf = (caseId) => `citizen-${String(caseId || "").slice(-4).toLowerCase()}`;
export function teamOfCase(league, caseId) {
  if (!caseId || !league) return null;
  const k = citizenKeyOf(caseId);
  return Object.keys(league.teams || {}).find(id => (league.teams[id] || []).some(r => r[0] === k)) || null;
}
// PLAY NOW: your own five when you are on one, else THE DEPARTMENT FIVE (one division) or the bottom
// division's leader (the pyramid: everyone starts at the bottom); against the team nearest it in
// rating in the same division (an even game), the higher table position breaking a tie.
export function playNowPair(league, mine = null) {
  const divs = divisionsOf(league), bottom = divs[divs.length - 1].filter(id => league.teams[id]?.length);
  const home = mine && league.teams[mine] ? mine : divs.length > 1 && bottom.length ? [...bottom].sort((a, b) => (league.pos[a] || 99) - (league.pos[b] || 99) || (a < b ? -1 : 1))[0] : "hq";
  const r0 = teamRating(league.teams[home]), pool = divs[divisionOf(league, home)] || TEAM_IDS;
  const away = pool.filter(id => id !== home && league.teams[id]?.length).sort((a, b) =>
    Math.abs(teamRating(league.teams[a]) - r0) - Math.abs(teamRating(league.teams[b]) - r0) || (league.pos[a] || 99) - (league.pos[b] || 99) || (a < b ? -1 : 1))[0];
  return [home, away];
}

// The summary for today (or the day before, while today's is being built) -> the league, or null.
export async function loadLeague(fetchFn = globalThis.fetch, now = Date.now()) {
  if (typeof fetchFn !== "function") return null;
  const get = async (u) => { const r = await fetchFn(u); if (!r.ok) return null; return r.json(); };
  const m = await get("/api/plan");
  if (!m) return null;
  const today = machineDay(now);
  for (const day of [today, today - 1, m.latest]) {
    const ver = m.sectors?.[day];
    if (!ver) continue;
    const sum = await get(`/api/plan/${day}/${ver}/summary`);
    const lg = leagueFrom(sum);
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
    const t = D[id]?.teams?.basketball;
    if (!Array.isArray(t?.roster) || !t.roster.length) return null;
    teams[id] = rows(t); pos[id] = t.pos || 0;
  }
  // the pyramid's other clubs (the expansion districts', the reserves), when the block carries them
  const py = sum.civic.leagues?.pyramid, divisions = Array.isArray(py?.clubs?.basketball) ? py.clubs.basketball : null;
  for (const id of divisions ? divisions.flat() : []) {
    if (teams[id]) continue;
    const t = clubTier(id) === 1 ? D[id]?.teams?.basketball : sum.civic.leagues?.reserves?.[id]?.teams?.basketball;
    if (Array.isArray(t?.roster) && t.roster.length) { teams[id] = rows(t); pos[id] = t.pos || 0; }
  }
  return { day: sum.day, season: sum.civic.leagues?.season || null, live: true, teams, pos, ...(divisions ? { divisions: divisions.map(ids => ids.filter(id => teams[id])) } : {}) };
}

// A head for a figure whose likeness is not drawn yet (/api/sprite answers 204): avatar.js fields
// near enough to them, painted until the file's own sprite exists (as golf's roster.js HINTS).
export const HINTS = {
  "nikola-jokic": { skin: "fair", hair_style: "short", hair_color: "dark_brown", facial_hair: "stubble" },
  "kobe-bryant": { skin: "brown", hair_style: "buzz", hair_color: "black" },
  "dennis-rodman": { skin: "deep", hair_style: "buzz", hair_color: "platinum" },
  "stephen-curry": { skin: "light_tan", hair_style: "buzz", hair_color: "black", facial_hair: "stubble" },
  "allen-iverson": { skin: "brown", hair_style: "buzz", hair_color: "black" },
  "phil-jackson": { skin: "fair", hair_style: "short", hair_color: "grey", facial_hair: "mustache" },
  "dan-aykroyd": { skin: "fair", hair_style: "side_part", hair_color: "dark_brown" },
  "pablo-picasso": { skin: "light_tan", hair_style: "bald", hair_color: "white" },
  "helen-mirren": { skin: "porcelain", hair_style: "short", hair_color: "platinum" },
  "john-grisham": { skin: "fair", hair_style: "side_part", hair_color: "grey" },
  "josef-albers": { skin: "fair", hair_style: "side_part", hair_color: "white" },
  "douglas-engelbart": { skin: "fair", hair_style: "side_part", hair_color: "grey" },
  "mark-rober": { skin: "fair", hair_style: "short", hair_color: "brown" },
  "jake-gyllenhaal": { skin: "fair", hair_style: "short", hair_color: "dark_brown", facial_hair: "stubble" },
  "paul-simon": { skin: "fair", hair_style: "short", hair_color: "dark_brown" },
  "taylor-swift": { skin: "porcelain", hair_style: "long", hair_color: "blonde" },
  "leonardo-da-vinci": { skin: "fair", hair_style: "long", hair_color: "grey", facial_hair: "beard" },
  "alfred-hitchcock": { skin: "porcelain", hair_style: "side_part", hair_color: "dark_brown" },
  "bruce-irons": { skin: "light_tan", hair_style: "short", hair_color: "blonde" },
  "jean-luc-godard": { skin: "fair", hair_style: "side_part", hair_color: "dark_brown", accessory: "sunglasses" },
  "peter-jackson": { skin: "fair", hair_style: "curly", hair_color: "brown", facial_hair: "beard", accessory: "glasses" },
  "keanu-reeves": { skin: "light_tan", hair_style: "long", hair_color: "black", facial_hair: "beard" },
  "aldous-huxley": { skin: "fair", hair_style: "side_part", hair_color: "dark_brown", accessory: "glasses" },
  "bob-marley": { skin: "brown", hair_style: "long", hair_color: "black", facial_hair: "beard" },
  "george-h-w-bush": { skin: "fair", hair_style: "side_part", hair_color: "grey" },
  "lebron-james": { skin: "brown", hair_style: "buzz", hair_color: "black", facial_hair: "beard" },
  "michael-jordan": { skin: "deep", hair_style: "bald", hair_color: "black" },
  "jalen-brunson": { skin: "brown", hair_style: "buzz", hair_color: "black" },
  "joel-embiid": { skin: "deep", hair_style: "buzz", hair_color: "black" },
  "tyrese-maxey": { skin: "brown", hair_style: "short", hair_color: "black" },
};
// A file sprite whose prop crosses the head: the head's own box, [x, y, w, h] (render.js headOf).
export const CROPS = {};
