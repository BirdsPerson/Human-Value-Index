// Who plays at THE ESTATE PITCH: the city's soccer league (src/city/leagues.js, docs/CITY_SPEC.md "The
// leagues and the Departmental Cup"), each Loop district's drafted eleven for the current season, as the
// plan builder publishes them in the day's summary (civic.districts[id].teams.soccer.roster:
// [[key, name, rating] x 11]). Pure apart from loadLeague (fetch). The city's sim stays out of this
// page's bundle: the team names and the clock's epoch are copied here and scripts/check-soccer.mjs
// holds them equal to leagues.js and sim.js.
//
// Content rule (the chess tables', the tennis club's): the living appear and play and never speak;
// nobody here is quoted. The calls are the Department's, about the play. No real club, league,
// competition or kit is named or copied: the sides are the city's own, in the districts' colours.

export const TEAM_IDS = ["arts", "campus", "finance", "strip", "arena", "hq", "archive", "commons", "works", "sprawl"];
export const TEAMS = {
  arts: "CURATED", campus: "TENURED", finance: "LEVERAGED", strip: "HOUSE EDGE", arena: "CONDITIONED",
  hq: "DEPARTMENT", archive: "INDEXED", commons: "TOLERATED", works: "PROCESSED", sprawl: "RETURNED",
};
// leagues.js sportTeamName(id, "soccer"): "CURATED F.C." (FULLY COMPLIANT)
export const teamName = (id) => `${TEAMS[id] || String(id).toUpperCase()} F.C.`;
export const teamShort = (id) => TEAMS[id] || String(id).toUpperCase();
// Three letters for the score bug.
export const teamCode = (id) => ({ arts: "CUR", campus: "TEN", finance: "LEV", strip: "HSE", arena: "CON", hq: "DEP", archive: "IDX", commons: "TOL", works: "PRO", sprawl: "RET" })[id] || String(id).slice(0, 3).toUpperCase();
// The kits: [shirt, shorts/trim]. The district's colours (avatar CLOTH values) on one plain kit.
export const KITS = {
  arts: ["#d977a8", "#262626"], campus: ["#1f2f5a", "#e0c040"], finance: ["#3c8a46", "#e6e6e6"], strip: ["#b83232", "#e0c040"],
  arena: ["#d97a2b", "#262626"], hq: ["#e6e6e6", "#3c8a46"], archive: ["#6b3fa0", "#e6e6e6"], commons: ["#3a6fd8", "#e6e6e6"],
  works: ["#8a8a8a", "#d97a2b"], sprawl: ["#45618f", "#e0c040"],
};
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const far = (a, b) => { const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b); return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2); };
// The away side changes into its trim when the shirts would be confused (or the grass would hide one).
export function kitsFor(home, away) {
  const a = KITS[home] || KITS.hq, b = KITS[away] || KITS.works;
  return [a, far(a[0], b[0]) < 150 && far(a[0], b[1]) >= 150 ? [b[1], b[0]] : b];
}
// The keepers: a colour nobody else on the pitch is wearing.
const GK_KITS = ["#e0e040", "#202020", "#40d0c0", "#f08030", "#a0a0ff"];
export function keeperKits(kits) {
  const used = kits.flat(), out = [];
  for (const k of [0, 1]) out.push(GK_KITS.filter(c => !out.includes(c)).sort((x, y) => Math.min(...used.map(u => far(y, u))) - Math.min(...used.map(u => far(x, u))))[0]);
  return out;
}

// The elevens as published for machine day 608 (season 22), for a page that cannot reach the plan
// (the dev server, the office down). The live rosters replace them when they load.
export const FALLBACK = {
  day: 608, season: 22, live: false,
  teams: {
    arts: [["landon-donovan", "Landon Donovan", 78], ["ronaldinho", "Ronaldinho", 76], ["george-washington", "George Washington", 59], ["tom-cruise", "Tom Cruise", 59], ["eli-manning", "Eli Manning", 53], ["elon-musk", "Elon Musk", 53], ["maya-angelou", "Maya Angelou", 52], ["muhammad-yunus", "Muhammad Yunus", 52], ["justin-timberlake", "Justin Timberlake", 51], ["kiichiro-toyoda", "Kiichiro Toyoda", 51], ["kevin-costner", "Kevin Costner", 50]],
    campus: [["pele", "Pelé", 89], ["rory-mcilroy", "Rory McIlroy", 81], ["theodore-roosevelt", "Theodore Roosevelt", 60], ["hugh-jackman", "Hugh Jackman", 55], ["charles-lindbergh", "Charles Lindbergh", 54], ["alexander-the-great", "Alexander the Great", 52], ["cicely-saunders", "Cicely Saunders", 52], ["bob-iger", "Bob Iger", 51], ["dave-chappelle", "Dave Chappelle", 51], ["anderson-cooper", "Anderson Cooper", 50], ["confucius", "Confucius", 50]],
    finance: [["cristiano-ronaldo", "Cristiano Ronaldo", 89], ["claude-giroux", "Claude Giroux (ice hockey player)", 80], ["neil-armstrong", "Neil Armstrong", 60], ["jeff-bezos", "Jeff Bezos", 55], ["steven-spielberg", "Steven Spielberg", 55], ["benoit-mandelbrot", "Benoit Mandelbrot", 52], ["charlie-chaplin", "Charlie Chaplin", 52], ["carl-bernstein", "Carl Bernstein", 51], ["charles-darwin", "Charles Darwin", 51], ["bill-clinton", "Bill Clinton", 50], ["bill-murray", "Bill Murray", 50]],
    strip: [["lionel-messi", "Lionel Messi", 86], ["dwayne-johnson", "Dwayne Johnson", 81], ["john-daly", "John Daly (golfer)", 64], ["bob-dylan", "Bob Dylan", 55], ["marie-curie", "Marie Curie", 54], ["stephen-hawking", "Stephen Hawking", 53], ["eleanor-roosevelt", "Eleanor Roosevelt", 52], ["billy-joel", "Billy Joel", 51], ["diane-sawyer", "Diane Sawyer", 51], ["a-p-j-abdul-kalam", "A. P. J. Abdul Kalam", 50], ["david-lynch", "David Lynch", 50]],
    arena: [["harry-kane", "Harry Kane", 85], ["tony-hawk", "Tony Hawk", 82], ["arnold-schwarzenegger", "Arnold Schwarzenegger", 67], ["vasily-zaitsev", "Vasily Zaitsev", 56], ["miles-davis", "Miles Davis", 54], ["ringo-starr", "Ringo Starr", 53], ["erick-thohir", "Erick Thohir", 52], ["werner-heisenberg", "Werner Heisenberg", 52], ["eddie-van-halen", "Eddie Van Halen", 51], ["ted-koppel", "Ted Koppel", 51], ["franklin-d-roosevelt", "Franklin D. Roosevelt", 50]],
    hq: [["zinedine-zidane", "Zinedine Zidane", 83], ["shaun-white", "Shaun White", 83], ["kelly-slater", "Kelly Slater", 64], ["steve-irwin", "Steve Irwin", 56], ["ronald-reagan", "Ronald Reagan", 54], ["richard-branson", "Richard Branson", 53], ["ibn-al-haytham", "Ibn al-Haytham", 52], ["thomas-edison", "Thomas Edison", 52], ["eric-idle", "Eric Idle", 51], ["steve-aoki", "Steve Aoki", 51], ["gregor-mendel", "Gregor Mendel", 50]],
    archive: [["thierry-henry", "Thierry Henry", 79], ["alexi-lalas", "Alexi Lalas", 72], ["rickie-fowler", "Rickie Fowler", 73], ["harriet-tubman", "Harriet Tubman", 58], ["cornelius-vanderbilt", "Cornelius Vanderbilt", 53], ["james-earl-jones", "James Earl Jones", 53], ["marco-polo", "Marco Polo", 52], ["pharrell-williams", "Pharrell Williams", 52], ["john-updike", "John Updike", 51], ["mahatma-gandhi", "Mahatma Gandhi", 51], ["justin-bieber", "Justin Bieber", 50]],
    commons: [["christian-pulisic", "Christian Pulisic", 79], ["albert-tomas", "Albert Tomàs", 68], ["jack-broughton", "Jack Broughton", 78], ["benjamin-franklin", "Benjamin Franklin", 56], ["b-r-ambedkar", "B. R. Ambedkar", 53], ["johannes-kepler", "Johannes Kepler", 53], ["ken-burns", "Ken Burns", 52], ["ray-kurzweil", "Ray Kurzweil", 52], ["john-adams", "John Adams (father)", 51], ["neil-degrasse-tyson", "Neil deGrasse Tyson", 51], ["john-cleese", "John Cleese", 50]],
    works: [["luis-suarez", "Luis Suárez (uruguayan footballer)", 82], ["gordie-howe", "Gordie Howe", 85], ["buster-keaton", "Buster Keaton", 62], ["joe-maloy", "Joe Maloy", 56], ["steve-jobs", "Steve Jobs", 54], ["michael-palin", "Michael Palin", 53], ["jake-paul", "Jake Paul", 52], ["stanley-kubrick", "Stanley Kubrick", 52], ["george-clooney", "George Clooney", 51], ["salvador-dali", "Salvador Dalí", 51], ["j-k-rowling", "J. K. Rowling", 50]],
    sprawl: [["diego-maradona", "Diego Maradona", 80], ["michael-phelps", "Michael Phelps", 86], ["saquon-barkley", "Saquon Barkley", 61], ["clint-eastwood", "Clint Eastwood", 56], ["alan-turing", "Alan Turing", 53], ["malcolm-x", "Malcolm X", 53], ["john-coltrane", "John Coltrane", 52], ["samuel-beckett", "Samuel Beckett", 52], ["isaac-newton", "Isaac Newton", 51], ["ruth-bader-ginsburg", "Ruth Bader Ginsburg", 51], ["jay-leno", "Jay Leno", 50]],
  },
  pos: { arts: 3, campus: 5, finance: 4, strip: 6, arena: 2, hq: 8, archive: 7, commons: 9, works: 1, sprawl: 10 },
};

// The machine clock (src/city/sim.js machineClock): 1 real minute is 1 machine hour from the epoch.
export const CITY_EPOCH = Date.UTC(2026, 8, 26, 0, 0, 0);
export const CLOCK_SCALE = 60;
export const machineDay = (ms = Date.now()) => Math.floor(((ms - CITY_EPOCH) * CLOCK_SCALE) / 3600000 / 24) + 1;

// A roster row's name for the board: no disambiguation in brackets, upper case.
export const shownName = (name) => String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim().toUpperCase();
// The surname for the shirt and the captions (the last word, or the whole name if short).
export const shirtName = (name) => { const w = shownName(name).split(" ").filter(Boolean); return w.length > 1 && w[w.length - 1].length > 2 ? w[w.length - 1] : w.join(" "); };
export const teamRating = (rows) => (rows?.length ? Math.round(rows.reduce((n, r) => n + r[2], 0) / rows.length) : 0);

// A player who entered the leagues from MY FILE plays under this key (netlify/lib/league-entries.js).
export const citizenKeyOf = (caseId) => `citizen-${String(caseId || "").slice(-4).toLowerCase()}`;
export function teamOfCase(league, caseId) {
  if (!caseId || !league) return null;
  const k = citizenKeyOf(caseId);
  return TEAM_IDS.find(id => (league.teams[id] || []).some(r => r[0] === k)) || null;
}
// PLAY NOW: your own eleven when you are on one, else DEPARTMENT F.C.; against the side nearest it in
// rating (an even game), the higher table position breaking a tie.
export function playNowPair(league, mine = null) {
  const home = mine && league.teams[mine] ? mine : "hq";
  const r0 = teamRating(league.teams[home]);
  const away = TEAM_IDS.filter(id => id !== home && league.teams[id]?.length).sort((a, b) =>
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
    const lg = leagueFrom(await get(`/api/plan/${day}/${ver}/summary`));
    if (lg) return lg;
  }
  return null;
}
export function leagueFrom(sum) {
  const D = sum?.civic?.districts;
  if (!D) return null;
  const teams = {}, pos = {};
  for (const id of TEAM_IDS) {
    const t = D[id]?.teams?.soccer;
    if (!Array.isArray(t?.roster) || t.roster.length < 7) return null;
    teams[id] = t.roster.filter(r => Array.isArray(r) && r.length >= 3).map(([k, n, r]) => [String(k), String(n), Number(r) || 40]);
    pos[id] = t.pos || 0;
  }
  return { day: sum.day, season: sum.civic.leagues?.season || null, live: true, teams, pos };
}
