// THE LEAGUES (Scott 2026-09-30: per-sport leagues and an overall DEPARTMENTAL CUP, replacing the
// single mixed league; docs/CITY_SPEC.md "The leagues and the Departmental Cup"). Pure mechanics:
// the civic fold (civic.js) drafts and folds with these; the browser recomputes every season's
// matches, box scores, player stats and the Cup from the day's block with the same code, so the
// summary carries only the rosters, the drafts and the tables (bounded per district).
//
//   FOUR LEAGUES    BASEBALL at the Diamond, BASKETBALL at the Courts, FOOTBALL at the Bowl, SOCCER
//                   at the Pitch. One team per Loop district per sport. Each league has its own
//                   draft (the reverse of its own last table, a snake, the Commissioner's cap) from
//                   its own pool (the sport's specialists on file, then athletes, then the regulars
//                   at its ground, then the rest; nobody plays two sports).
//   MATCHDAYS       every scored slot on sim GAMES for the league's ground is a matchday: a full
//                   round, five matches. The Courts play them one after another (each game to 21 on
//                   the board is a match). The other grounds play one match on the board (THE
//                   FEATURED TIE); the other four are played behind closed doors at a Department
//                   facility, scored by the same scoring model from their own seed, results released
//                   at the whistle. The team better on the day takes the side that won the board.
//   INDIVIDUAL      THE TENNIS LADDER (the club's show court plus challenge matches on Ladder Night)
//                   and THE PIT RANKINGS (the Friday cards).
//   THE CUP         each district's points across the four leagues by position (10 8 6 5 4 3 2 1 0 0)
//                   plus 3/2/1 for the tennis ladder's and the Pit's top three.
//   BOX SCORES      every match's player lines, hashed from the fixture's seed and summed to the
//                   final score exactly (runs, points, goals); season stats are their sums.
import * as SIM from "./sim.js";
import { displayName } from "../figures.js";
import { tennisAt, TENNIS_ON_FILE, TENNIS_FIXTURES } from "./tennis.js";
import { cardFor, FIGHTERS, FIGHTER, SLOT_H } from "./pit.js";

export const DIST = SIM.LOOP_DISTRICTS.map(d => d.id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(`${SIM.SEED}|lg|${s}`) / 4294967296;

// ---- the teams -----------------------------------------------------------------------------------
// Named by the Overlord, one per district: [name, scoreboard name].
export const TEAMS = {
  arts: ["THE CURATED", "CURATED"],
  campus: ["THE TENURED", "TENURED"],
  finance: ["THE LEVERAGED", "LEVERAGED"],
  strip: ["THE HOUSE EDGE", "HOUSE EDGE"],
  arena: ["THE CONDITIONED", "CONDITIONED"],
  hq: ["THE DEPARTMENT", "DEPARTMENT"],
  archive: ["THE INDEXED", "INDEXED"],
  commons: ["THE TOLERATED", "TOLERATED"],
  works: ["THE PROCESSED", "PROCESSED"],
  sprawl: ["THE RETURNED", "RETURNED"],
};
// THE PYRAMID (Scott 2026-10-06, docs/design/PYRAMID.md): from season 24 (0-based PYRAMID_FROM) every
// sport is a ladder of divisions of ten clubs; the expansion districts' clubs are founded into the
// Championship, named by the Overlord from the district's own blurb; reserves (SECOND, II) and thirds
// (THIRD, III) are founded when the census asks for more divisions.
export const PYRAMID_FROM = 23;   // 0-based: season 24, machine day 2417 (2026-11-05 06:24 UTC)
export const PYRAMID_V = 1;
export const DIV_N = 10;          // clubs a division (the circle, the snake, the Cup's points table)
export const DIV_MAX = 5;         // the ceiling: at most 1,800 rostered players whatever the census
export const UP_N = 3;            // two automatic places and the promotion playoff; three go down
export const EXPANSION_CLUBS = {
  coast: ["THE LIFEGUARDED", "LIFEGUARDED"],
  heights: ["THE DESCENDED", "DESCENDED"],
  port: ["THE DECLARED", "DECLARED"],
  oldtown: ["THE PRESERVED", "PRESERVED"],
  uptown: ["THE ADMITTED", "ADMITTED"],
  downtown: ["THE AMPLIFIED", "AMPLIFIED"],
  suburbs: ["THE MEASURED", "MEASURED"],
  airport: ["THE SCREENED", "SCREENED"],
  farmland: ["THE HARVESTED", "HARVESTED"],
  engine: ["THE COMPUTED", "COMPUTED"],
};
const EXPANSION = Object.keys(EXPANSION_CLUBS);
// The founding order, append-only (a census-only recompute founds the same clubs the chain did,
// whatever districts the city adds later): the Loop, the expansion districts, the Loop's reserves,
// the expansion districts' reserves, the Loop's thirds. Fifty clubs name the whole ceiling.
export const PYRAMID_CLUBS = [...DIST, ...EXPANSION, ...DIST.map(d => `${d}-2`), ...EXPANSION.map(d => `${d}-2`), ...DIST.map(d => `${d}-3`)];
export const clubDistrict = (id) => String(id || "").split("-")[0];
export const clubTier = (id) => Number(String(id || "").split("-")[1]) || 1;
const TIER_WORD = { 2: ["SECOND", "II"], 3: ["THIRD", "III"] };
const baseName = (d) => TEAMS[d] || EXPANSION_CLUBS[d] || null;
export function teamName(id) {
  const d = clubDistrict(id), t = clubTier(id), b = baseName(d);
  if (!b) return String(id || "").toUpperCase();
  return t > 1 ? `${b[0]} ${TIER_WORD[t]?.[0] || t}` : b[0];
}
export function teamShort(id) {
  const d = clubDistrict(id), t = clubTier(id), b = baseName(d);
  if (!b) return String(id || "").toUpperCase();
  return t > 1 ? `${b[1]} ${TIER_WORD[t]?.[1] || t}` : b[1];
}
export const DIV_NAMES = [["THE PREMIER DIVISION", "PREMIER"], ["THE CHAMPIONSHIP", "CHAMPIONSHIP"], ["LEAGUE ONE", "LEAGUE ONE"], ["LEAGUE TWO", "LEAGUE TWO"], ["THE SUNDAY LEAGUE", "SUNDAY"]];
export const divName = (k) => DIV_NAMES[Math.min(k, DIV_MAX - 1)]?.[0] || `DIVISION ${k + 1}`;
export const divShort = (k) => DIV_NAMES[Math.min(k, DIV_MAX - 1)]?.[1] || `DIV ${k + 1}`;
// The Cup's points by division (division 0 pays POS_PTS, below).
export const DIV_PTS_LOWER = [[5, 4, 3, 3, 2, 2, 1, 1, 0, 0], [3, 2, 2, 1, 1, 1, 1, 0, 0, 0], [2, 1, 1, 1, 0, 0, 0, 0, 0, 0], [2, 1, 1, 1, 0, 0, 0, 0, 0, 0]];
// The kits of the expansion districts' clubs [shirt, trim] (the Loop's are the districts' CLOTH
// values, in the games' KITS); reserves wear them swapped, thirds the trim alone.
export const EXPANSION_KITS = {
  coast: ["#e8d8a8", "#2a7f9e"], heights: ["#f0f4f8", "#4a6fa5"], port: ["#9a4a2a", "#c0c0c0"], oldtown: ["#8b3a3a", "#f0e6d0"], uptown: ["#1a1a1a", "#d4af37"],
  downtown: ["#5a2d82", "#39ff14"], suburbs: ["#4f8f3a", "#ffffff"], airport: ["#6b7280", "#ff8c00"], farmland: ["#d9b44a", "#3f6b2a"], engine: ["#1f8a8a", "#111111"],
};
// Where a division plays (labels for the hub, the paper and the PA; the board stays at division 0's
// ground, and sim.GAMES is untouched so no published crowd moves).
export const DIV_GROUND = {
  baseball: ["THE DIAMOND", "THE RECREATION GROUND", "THE GREEN (A DIAMOND CHALKED OUT)", "THE PADDOCK (THE FARMLAND)", "SUNDAY FIELD (THE SPRAWL)"],
  basketball: ["THE COURTS", "THE CONDITIONING HALL", "THE BOARDWALK COURT (THE COAST)", "THE SCHOOL GYM (THE SUBURBS)", "THE LOADING BAY (THE PORT)"],
  football: ["THE BOWL", "THE RECREATION GROUND", "THE FOOTHILLS MEADOW (THE HEIGHTS)", "THE APRON (THE AIRPORT)", "THE PADDOCK (THE FARMLAND)"],
  soccer: ["THE ESTATE PITCH", "THE GREEN", "THE RECREATION GROUND", "THE BOARDWALK PITCH (THE COAST)", "THE PADDOCK (THE FARMLAND)"],
};
export const divGround = (sport, k) => DIV_GROUND[sport]?.[Math.min(k, DIV_MAX - 1)] || DIV_GROUND[sport]?.[0] || "";
// Sponsorship hooks for the ads system (docs/design/ADS.md): the slots a block offers, and the
// binding, null until the ads system fills it (the hub prints the plain name meanwhile).
export function sponsorSlots(block) {
  const out = [{ id: "cup-title", kind: "cup" }];
  const py = block?.leagues?.pyramid;
  for (const sp of SPORTS) {
    const divs = py?.clubs?.[sp] || [DIST];
    divs.forEach((ids, k) => { out.push({ id: `league-title:${sp}:${k}`, kind: "league-title", sport: sp, div: k }, { id: `ground:${sp}:${k}`, kind: "ground", sport: sp, div: k }); for (const c of ids) out.push({ id: `shirt:${sp}:${c}`, kind: "shirt", sport: sp, div: k, club: c }); });
  }
  return out;
}
export const sponsorOf = () => null;

// ---- the sports ------------------------------------------------------------------------------------
// n: the roster; rounds: a short (28-day) season's regular rounds of the circle (9 = every pair once,
// 18 = twice); longRounds: a long season's (seasons.js: one real month), today's rate of league rounds
// per real hour kept (rounds x 64, to whole home-and-away circles where it isn't one), spread evenly
// over the month with exhibitions between, the playoffs on the season's last slots;
// finalOnly: the top two meet in the final (the Bowl has four Sundays: three rounds and THE BOWL GAME).
export const SPORTS = ["baseball", "basketball", "football", "soccer"];
export const SPORT = {
  baseball: { venue: "ball-field", kind: "ball", n: 9, rounds: 9, longRounds: 576, name: "BASEBALL", suffix: "NINE", ground: "THE DIAMOND" },
  basketball: { venue: "courts", kind: "hoops", n: 5, rounds: 18, longRounds: 1152, name: "BASKETBALL", suffix: "FIVE", ground: "THE COURTS" },
  football: { venue: "stadium", kind: "gridiron", n: 11, rounds: 3, longRounds: 198, finalOnly: true, name: "FOOTBALL", suffix: "ELEVEN", ground: "THE BOWL" },
  soccer: { venue: "pitch", kind: "soccer", n: 11, rounds: 6, longRounds: 378, name: "SOCCER", suffix: "F.C.", ground: "THE ESTATE PITCH" },
};
export const SPORT_AT = Object.fromEntries(SPORTS.map(s => [SPORT[s].venue, s]));
// THE CURATED NINE, THE CURATED FIVE, THE CURATED ELEVEN, CURATED F.C. (FULLY COMPLIANT)
export const sportTeamName = (id, sport) => (sport === "soccer" ? `${teamShort(id)} F.C.` : `${teamName(id)} ${SPORT[sport]?.suffix || ""}`.trim());
export const MATCHES_PER_DAY = DIST.length / 2;   // a round: five
export const HOOP_LEN = 0.7;                      // a game to 21 at the Courts (sim.js gameAt)
export const POS_PTS = [10, 8, 6, 5, 4, 3, 2, 1, 0, 0];   // the Cup: points by final position
export const IND_PTS = [3, 2, 1];                          // the ladder's and the Pit's top three
// The season calendar (28-day seasons through season 22, one real month from season 23): seasons.js.
export { SEASON_DAYS, LONG_SEASON_DAYS, LONG_FROM, seasonOf, seasonStart, seasonDays, isLong } from "./seasons.js";
import { seasonOf, seasonStart, isLong } from "./seasons.js";

// A player's rating, 0..99: the body, the competence, and a record in sport.
const SPORT_FIELDS = ["sport", "soccer", "gridiron", "combat", "coaching"];
export function playerRating(s) {
  const b = s?.breakdown || {};
  const physical = typeof b.physical === "number" ? b.physical : 40;
  const competence = typeof s?.competence === "number" ? s.competence : typeof b.utility === "number" ? b.utility : 40;
  const f = SIM.fieldsOf(s);
  const sport = Math.max(0, ...SPORT_FIELDS.map(k => f[k] || 0));
  return clamp(Math.round(0.45 * physical + 0.35 * competence + 2 * sport), 0, 99);
}

// ---- THE ENTRANTS (Scott 2026-10-05: "I was a multi-sport varsity athlete in high school. I would
// like to be in the sports competitions.") -------------------------------------------------------------
// A player enters their citizen from MY FILE (netlify/lib/league-entries.js): one or two of the four
// leagues and the tennis ladder. Entries close ENTRY_CLOSE_DAYS machine days before a season's first
// day (the plan builder folds the draft day up to three days ahead); the builder freezes a snapshot of
// the entries per season, so a draft is always drawn from the same list. An entrant joins the sport's
// pool among the athletes (g 2), at their own rating, and is placed by the normal draft (the snake and
// the Commissioner's cap); on the ladder, they take the bottom rungs and challenge up. Shown as SUBJECT
// and the case's last four, never the case number.
export const ENTRY_SPORTS = [...SPORTS, "tennis"];
export const ENTRY_MAX_SPORTS = 2;
export const ENTRANTS_MAX = 20;          // per league per season: the best-rated, then the key
export const LADDER_ENTRANTS_MAX = 6;    // rungs below the seeded ten
export const ENTRY_CLOSE_DAYS = 3;
// Entries for season (0-based) close at the start of this machine day.
export const entryCloseDay = (season) => seasonStart(season) - ENTRY_CLOSE_DAYS;
// The season an entry made at machine hour mt is drafted in: the first whose entries are still open.
export function entrySeasonAt(mt) {
  let s = Math.max(0, seasonOf(Math.floor(mt / 24) + 1));
  while ((entryCloseDay(s) - 1) * 24 <= mt) s++;
  return s;
}
// The rating (src/leagues/record.js, which MY FILE previews with): the file's formula (0.45 physical
// + 0.25 competence + 0.10 adaptability, an unassessed body the rubric's neutral 50, + ATH_BONUS when
// the file records athletics in the subject's own words or the commendations, + SPORT_BONUS more for
// the sport they named; ceiling 87), or the floor of the case's admin-set ATHLETIC RECORD (varsity 60,
// varsity standout 66, college 72; +3 in a sport played at that level, +1 for track in football,
// soccer and basketball; never over 72), whichever is higher. Never a record in sport and never PRO:
// those are for the athletes on file, drafted in the 80s and 90s.
export { ATH_BONUS, SPORT_BONUS, LEVELS, LEVEL_NAME, LEVEL_FLOOR, PLAYED_BONUS, TRACK_BONUS, SELF_CAP, TRACK_SPORTS, cleanRecord, sameRecord, recordFloor, fileRating, entrantRating } from "../leagues/record.js";
const SPORT_WORDS = "baseball|softball|basketball|football|soccer|tennis|hockey|lacrosse|volleyball|rugby|wrestling|track|cross[- ]country|swimming|golf";
const ATH_RE = new RegExp(`\\b(varsity|athlet(e|es|ic|ics)|lettered|letterman|team captain|captained|all[- ](state|county|conference|american)|played (\\w+ ){0,3}(${SPORT_WORDS})|(${SPORT_WORDS})( and \\w+)? (team|player|season|scholarship|career|captain))\\b`, "i");
const NAMED = { baseball: /\b(baseball|softball)\b/i, basketball: /\bbasketball\b/i, football: /\bfootball\b/i, soccer: /\bsoccer\b/i, tennis: /\btennis\b/i };
// What the file says about athletics: -> {ath, named: [the entry sports it names]} (named only with ath)
export function athleticsOf(text) {
  const t = String(text || "");
  if (!ATH_RE.test(t)) return { ath: false, named: [] };
  return { ath: true, named: ENTRY_SPORTS.filter(sp => NAMED[sp].test(t)) };
}
const CITIZEN_RE = /^citizen-[a-z0-9]{4}$/;
export const entrantName = (key) => `SUBJECT ${String(key).slice(8).toUpperCase()}`;
// A season's entries as the draft takes them: well-formed, one per citizen, at most two sports, the
// name made from the key (nothing else on the entry reaches a roster). -> {sport: [{key, name, r, g}]}
export function entrantsBySport(entries) {
  const seen = new Set(), out = Object.fromEntries(ENTRY_SPORTS.map(sp => [sp, []]));
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && CITIZEN_RE.test(e.key) && Array.isArray(e.sports))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const e of list) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    const sports = [...new Set(e.sports)].filter(sp => ENTRY_SPORTS.includes(sp)).slice(0, ENTRY_MAX_SPORTS);
    for (const sp of sports) {
      const r = Number.isInteger(e.r?.[sp]) ? clamp(e.r[sp], 0, 99) : null;
      if (r != null) out[sp].push({ key: e.key, name: entrantName(e.key), r, g: 2 });
    }
  }
  for (const sp of ENTRY_SPORTS) out[sp] = out[sp].sort((a, b) => b.r - a.r || (a.key < b.key ? -1 : 1)).slice(0, sp === "tennis" ? LADDER_ENTRANTS_MAX : ENTRANTS_MAX);
  return out;
}
// THE PYRAMID's entrants (docs/design/PYRAMID.md section 5): the same well-formed list, every entrant
// given the band of their STANDING (standingOf(key, sport) -> k | null; null is a first entry, placed
// by the band rule in sportPools), at most ENTRANTS_MAX a band a sport, the oldest entries first
// (`since`, in snapshots frozen from season 24), then the key. -> {sport: [{key, name, r, g, k, since}]}
export function entrantsByBand(entries, standingOf, divs) {
  const seen = new Set(), out = Object.fromEntries(SPORTS.map(sp => [sp, []]));
  const list = (Array.isArray(entries) ? entries : []).filter(e => e && CITIZEN_RE.test(e.key) && Array.isArray(e.sports))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const e of list) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    const sports = [...new Set(e.sports)].filter(sp => SPORTS.includes(sp)).slice(0, ENTRY_MAX_SPORTS);
    for (const sp of sports) {
      const r = Number.isInteger(e.r?.[sp]) ? clamp(e.r[sp], 0, 99) : null;
      if (r == null) continue;
      const k = standingOf ? standingOf(e.key, sp) : null;
      out[sp].push({ key: e.key, name: entrantName(e.key), r, g: 2, k: Number.isInteger(k) ? clamp(k, 0, divs - 1) : null, since: typeof e.since === "string" ? e.since : "" });
    }
  }
  return out;
}
const byAge = (a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.key < b.key ? -1 : 1);

// ---- the pools -----------------------------------------------------------------------------------
// Which sport a figure plays on the record: the figures on file by name, everyone else by the text.
// (the census of 2026-09-30: most figures carry no occupation on the record, so they are named here)
const hint = (sport, keys) => keys.split(" ").map(k => [k, sport]);
const SPORT_HINT = Object.fromEntries([
  ...hint("baseball", "shohei-ohtani babe-ruth ty-cobb randy-johnson jimmy-rollins aaron-nola adam-jones bryce-harper derek-jeter ichiro-suzuki j-t-realmuto john-kruk ken-griffey-jr mickey-mantle pete-rose steve-carlton trea-turner tug-mcgraw"),
  ...hint("basketball", "kobe-bryant dennis-rodman nikola-jokic allen-iverson jalen-brunson jaylen-brown joel-embiid julius-erving kareem-abdul-jabbar larry-bird lebron-james magic-johnson michael-jordan tyrese-maxey"),
  ...hint("football", "tom-brady jason-kelce oj-simpson aaron-hernandez a-j-brown andy-dalton jalen-hurts joe-namath nick-foles travis-kelce walter-payton fred-williamson"),
  ...hint("soccer", "pele ronaldinho luis-suarez albert-tomas alexi-lalas christian-pulisic cristiano-ronaldo diego-maradona harry-kane landon-donovan lionel-messi thierry-henry zinedine-zidane"),
]);
// Athletes of other sports on the record: drafted wherever they are needed most.
const ATHLETE_HINT = new Set("tiger-woods jack-nicklaus rory-mcilroy bubba-watson phil-mickelson rickie-fowler sergio-garcia john-daly gordie-howe wayne-gretzky claude-giroux michael-phelps shaun-white tony-hawk bob-burnquist ayrton-senna sachin-tendulkar dwayne-johnson andre-the-giant roy-jones-jr jack-broughton tenzing-norgay".split(" "));
// The leagues' rating: playerRating with a record in sport for the athletes named above (the mixed
// league's playerRating is left as its seasons drew it).
export function sportRating(s) {
  const k = SIM.keyOf(s);
  if (!SPORT_HINT[k] && !ATHLETE_HINT.has(k)) return playerRating(s);
  const b = s?.breakdown || {};
  const physical = typeof b.physical === "number" ? b.physical : 40;
  const competence = typeof s?.competence === "number" ? s.competence : typeof b.utility === "number" ? b.utility : 40;
  const f = SIM.fieldsOf(s);
  const sport = Math.max(10, ...SPORT_FIELDS.map(x => f[x] || 0));
  return clamp(Math.round(0.45 * physical + 0.35 * competence + 2 * sport), 0, 99);
}
const SPORT_RULES = [
  ["baseball", /baseball|pitcher|\bmlb\b|shortstop|outfielder/],
  ["basketball", /basketball|\bnba\b|\bwnba\b/],
  ["football", /american football|gridiron|quarterback|running back|wide receiver|linebacker|\bnfl\b|placekicker/],
  ["soccer", /soccer|footballer|association football|goalkeeper|midfielder|striker/],
];
export function specialtyOf(s) {
  const k = SIM.keyOf(s);
  if (SPORT_HINT[k]) return SPORT_HINT[k];
  const t = [s?.qualifier, s?.stratum?.occupation, s?.description].filter(Boolean).join(" ").toLowerCase();
  if (!t) return null;
  for (const [sp, re] of SPORT_RULES) if (re.test(t)) return sp;
  return null;
}
// The individual sports keep their own: the fighters on file box at the Pit, the tennis players
// play the ladder; neither is drafted.
const TENNIS_KEYS = new Set(TENNIS_ON_FILE.map(t => t[0]));
export const isTennis = (s) => TENNIS_KEYS.has(SIM.keyOf(s)) || (SIM.fieldsOf(s).tennis || 0) >= 5;
const individual = (s) => Boolean(FIGHTER[SIM.keyOf(s)]) || isTennis(s);
const byPool = (a, b) => b.g - a.g || b.r - a.r || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
// -> {sport: [{key, name, r, g}] in draft order}: g 3 a specialist, 2 an athlete, 1 a regular at the
// sport's ground (>= 12% of their leisure there), 0 the rest. Exclusive: a player is in one pool.
// Each pool holds exactly ten teams' worth (fewer only if the census runs out).
// entrants: the season's entries (entrantsBySport's input); each entrant takes a place in their
// sports' pools among the athletes, and leaves the census's rows for everyone else.
export function sportPools(subjects, entrants = [], divs = 1) {
  const ent = entrantsBySport(entrants), entKeys = new Set(Object.values(ent).flat().map(x => x.key));
  const need = Object.fromEntries(SPORTS.map(s => [s, divs * DIST.length * SPORT[s].n - ent[s].length]));
  const pools = Object.fromEntries(SPORTS.map(s => [s, []]));
  const room = (s) => pools[s].length < need[s];
  const fill = (s) => pools[s].length / need[s];
  const rows = [];
  for (const s of subjects) {
    if (individual(s)) continue;
    const key = SIM.keyOf(s), r = sportRating(s), f = SIM.fieldsOf(s);
    if (entKeys.has(key)) continue;
    const spec = specialtyOf(s);
    const athlete = ATHLETE_HINT.has(key) || SPORT_FIELDS.some(k => k !== "combat" && (f[k] || 0) >= 5);
    let ground = null;
    if (!spec && !athlete) {
      const { list, total } = SIM.baseLeisure(s);
      let best = 0;
      for (const [id, v] of list) if (SPORT_AT[id] && total > 0 && v / total >= 0.12 && v > best) { best = v; ground = SPORT_AT[id]; }
    }
    rows.push({ key, name: displayName(s), r, spec, athlete, ground });
  }
  rows.sort((a, b) => b.r - a.r || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const taken = new Set();
  const put = (row, sport, g) => { pools[sport].push({ key: row.key, name: row.name, r: row.r, g }); taken.add(row.key); };
  // the least-filled sport with room (the SPORTS order breaks a tie)
  const neediest = () => SPORTS.filter(room).sort((a, b) => fill(a) - fill(b) || SPORTS.indexOf(a) - SPORTS.indexOf(b))[0];
  for (const row of rows) if (row.spec && room(row.spec)) put(row, row.spec, 3);
  for (const row of rows) if (!taken.has(row.key) && (row.athlete || row.spec)) { const sp = neediest(); if (sp) put(row, sp, 2); }
  for (const row of rows) if (!taken.has(row.key) && row.ground && room(row.ground)) put(row, row.ground, 1);
  for (const row of rows) if (!taken.has(row.key)) { const sp = neediest(); if (!sp) break; put(row, sp, 0); }
  for (const s of SPORTS) pools[s].push(...ent[s]);
  for (const s of SPORTS) pools[s].sort(byPool);
  return pools;
}
// Who counts for the pyramid's size: the figures on file less the individual sports' own (fighters,
// tennis players); never the citizens, so no number of entries (or fake files) changes the shape.
export const eligibleCount = (subjects) => subjects.reduce((n, s) => n + (individual(s) || s?.kind === "citizen" || /^citizen-/.test(SIM.keyOf(s)) ? 0 : 1), 0);
// Divisions a season has: one band of DIV_N clubs' worth per 360 eligible figures, at least one, at
// most DIV_MAX (docs/design/PYRAMID.md section 1).
const BAND_SIZE = SPORTS.reduce((n, sp) => n + DIV_N * SPORT[sp].n, 0);   // 360
export const divisionsFor = (eligible) => clamp(Math.floor(eligible / BAND_SIZE), 1, DIV_MAX);
// THE PYRAMID's pools (docs/design/PYRAMID.md section 3): the same exclusive, g-first, rating-ordered
// pools, filled to divs x DIV_N x n a sport, cut into bands of DIV_N x n (band 0 the top flight's).
// Entrants join the band of their standing (standingOf -> {k, stuck} | null); a first entry takes the
// band one below where its rating sits among the figures by rating alone (the cut-points; never band
// 0, the bottom band if the rating is in it), among the athletes (g 2). A band takes at most
// ENTRANTS_MAX entrants: the incumbents who kept or earned the band first, then first entries by age,
// then incumbents relegated with nowhere lower to go (`stuck`); first entries over the cap go one
// band down, or wait a season at the bottom. The band keeps its size, so the lowest figure in it
// slips to the band below, and the bottom band's lowest leaves the pyramid.
// -> {sport: {bands: [[rows]], entry: {key: k} (the first entries placed), waiting: [keys]}}
export function pyramidPools(subjects, entries, divs, standingOf) {
  const ent = entrantsByBand(entries, (key, sp) => standingOf?.(key, sp)?.k ?? null, divs), entKeys = new Set(Object.values(ent).flat().map(x => x.key));
  const figures = sportPools(subjects.filter(s => !entKeys.has(SIM.keyOf(s))), [], divs);
  const out = {};
  for (const sp of SPORTS) {
    const size = DIV_N * SPORT[sp].n, F = figures[sp];
    const byR = F.map(x => x.r).sort((a, b) => b - a);
    const cut = Array.from({ length: divs }, (_, k) => byR[Math.min(byR.length - 1, (k + 1) * size - 1)] ?? 0);   // band k's lowest rating, by rating alone
    const bandOf = (r) => { for (let k = 0; k < divs; k++) if (r >= cut[k]) return k; return divs - 1; };
    const entry = {}, waiting = [];
    const rows = ent[sp].map(x => { const st = x.k == null ? null : standingOf?.(x.key, sp); const first = x.k == null; const k = first ? Math.min(divs - 1, Math.max(1, bandOf(x.r) + 1)) : x.k; return { ...x, k, first, stuck: Boolean(st?.stuck) }; });
    const bands = [];
    let i = 0, carry = [];
    for (let k = 0; k < divs; k++) {
      const here = [...rows.filter(x => x.k === k), ...carry.map(x => ({ ...x, k }))];
      const pick = [...here.filter(x => !x.first && !x.stuck).sort(byAge), ...here.filter(x => x.first).sort(byAge), ...here.filter(x => !x.first && x.stuck).sort(byAge)];
      const taken = pick.slice(0, ENTRANTS_MAX), over = pick.slice(ENTRANTS_MAX);
      carry = over.filter(x => x.first);
      for (const x of taken) if (x.first) entry[x.key] = k;
      if (k === divs - 1) waiting.push(...carry.map(x => x.key));
      const band = taken.map(({ key, name, r, g }) => ({ key, name, r, g }));
      while (band.length < size && i < F.length) band.push(F[i++]);
      bands.push(band.sort(byPool));
    }
    out[sp] = { bands, entry, waiting: waiting.sort() };
  }
  return out;
}

// ---- THE PYRAMID's boundary (docs/design/PYRAMID.md section 4) -----------------------------------------
// prev: last season's {clubs: {sport: [[ids] per division]}} or null (the founding: the Loop's ten are
// division 0). ends: {sport: [sportEnd per division]} of last season. D: divisions next season.
// Between two divisions that existed last season and exist next, three go down (the table's last
// three) and three come up (the two automatic places, then the playoff winner); a reserve side is
// never promoted into a division holding a club of its own district of a lower tier (the next club in
// the table goes instead). A founded division takes the first DIV_N clubs of PYRAMID_CLUBS without a
// team in the sport; a dissolved one's clubs fall dormant. Each division is listed in its composite
// order (relegated-in, stayers, promoted-in, each by finish): its draft order is the reverse.
// -> {clubs: {sport: [[ids]]}, moves: {sport: {up: [ids], down: [ids]}}}
export function nextDivisions(prev, ends, D) {
  const clubs = {}, moves = {};
  for (const sp of SPORTS) {
    const old = prev?.clubs?.[sp] || [DIST], Dold = old.length, E = ends[sp] || [];
    const K = Math.min(Dold, D);
    const exch = (k) => k >= 0 && k + 1 < K;   // divisions k and k+1 both last season and next
    const table = (k) => E[k]?.table || old[k];
    // pass 1, top-down: who leaves each division downward (its last three) and who comes up into it
    // (the two automatic places and the playoff winner of the division below, a blocked reserve
    // replaced by the next club in that table that is not itself going down)
    const downFrom = [], upFrom = [];
    for (let k = 0; k < K; k++) {
      downFrom[k] = exch(k) ? table(k).slice(-UP_N) : [];
      upFrom[k] ||= [];
      if (!exch(k)) continue;
      const below = table(k + 1), belowDown = exch(k + 1) ? below.slice(-UP_N) : [];
      const want = E[k + 1]?.up || below.slice(0, UP_N);
      const home = [...(downFrom[k - 1] || []), ...table(k).filter(c => !downFrom[k].includes(c) && !upFrom[k].includes(c))];
      const blocked = (c) => belowDown.includes(c) || (clubTier(c) > 1 && home.some(h => clubDistrict(h) === clubDistrict(c) && clubTier(h) < clubTier(c)));
      const list = want.filter(c => !blocked(c));
      for (const c of below) { if (list.length >= UP_N) break; if (!list.includes(c) && !blocked(c)) list.push(c); }
      upFrom[k + 1] = list;
    }
    // pass 2: each division's composite listing (relegated-in, stayers, promoted-in)
    const next = [];
    for (let k = 0; k < K; k++) {
      const stay = table(k).filter(c => !downFrom[k].includes(c) && !upFrom[k].includes(c));
      next.push([...(downFrom[k - 1] || []), ...stay, ...(upFrom[k + 1] || [])]);
    }
    for (let k = K; k < D; k++) {
      const active = new Set(next.flat()), band = [];
      for (const c of PYRAMID_CLUBS) { if (band.length >= DIV_N) break; if (!active.has(c)) { band.push(c); active.add(c); } }
      next.push(band);
    }
    clubs[sp] = next; moves[sp] = { up: upFrom.flat(), down: downFrom.flat() };
  }
  return { clubs, moves };
}
// A division's draft order from its composite listing: the promoted pick first, the relegated last;
// a founded division in reverse founding order. (The top flight's first pyramid draft keeps today's
// rule: the reverse of its own table, the champion last.)
export const divDraftOrder = (ids) => [...ids].reverse();

// ---- the draft -----------------------------------------------------------------------------------
export const CAP_GAP = 2, MAX_TRADES = 4;
export const snakeTeam = (order, round, pick) => order[round % 2 ? order.length - 1 - pick : pick];
const mean = (l) => (l.length ? l.reduce((n, p) => n + p[2], 0) / l.length : 20);
// A snake over n rounds, every team taking the best player left, then THE COMMISSIONER'S CAP:
// while the strongest team's mean is more than CAP_GAP over the weakest's, the two swap their picks
// of the round that narrows the gap most (at most MAX_TRADES; only a trade that narrows it).
// -> {rosters: {team: [[key, name, r] x n, in round order]}, trades: [[round, stronger, weaker]]}
// fine: the leagues' guard judges a trade by the whole league, not the two ends (the sum of squared
// distances from the mean must fall), so a cluster tied at the top is broken up too.
export function snakeDraftN(pool, order, n, { fine = false, maxTrades = MAX_TRADES } = {}) {
  const rosters = Object.fromEntries(order.map(id => [id, []]));
  let i = 0;
  for (let round = 0; round < n; round++) for (let p = 0; p < order.length; p++) {
    const x = pool[i++];
    if (x) rosters[snakeTeam(order, round, p)].push([x.key, x.name, x.r]);
  }
  const trades = [];
  const spreadOnly = () => { const m = order.map(id => mean(rosters[id])); return Math.max(...m) - Math.min(...m); };
  const spread = fine ? () => { const m = order.map(id => mean(rosters[id])), mu = m.reduce((a, b) => a + b, 0) / m.length; return m.reduce((a, b) => a + (b - mu) ** 2, 0); } : spreadOnly;
  for (let t = 0; t < maxTrades; t++) {
    const now = spread();
    if (spreadOnly() <= CAP_GAP) break;
    const ranked = [...order].sort((a, b) => mean(rosters[b]) - mean(rosters[a]) || order.indexOf(a) - order.indexOf(b));
    const a = ranked[0], b = ranked[ranked.length - 1];
    let best = null;
    for (let r = 0; r < Math.min(rosters[a].length, rosters[b].length); r++) {
      if (rosters[a][r][2] <= rosters[b][r][2]) continue;
      [rosters[a][r], rosters[b][r]] = [rosters[b][r], rosters[a][r]];
      const s = spread();
      [rosters[a][r], rosters[b][r]] = [rosters[b][r], rosters[a][r]];
      if (s < now - 1e-9 && (!best || s < best.s - 1e-9)) best = { r, s };
    }
    if (!best) break;
    [rosters[a][best.r], rosters[b][best.r]] = [rosters[b][best.r], rosters[a][best.r]];
    trades.push([best.r, a, b]);
  }
  return { rosters, trades };
}
export function draftOrder(table, champion, ids = DIST) {
  const rev = [...table].reverse().filter(id => ids.includes(id));
  for (const id of ids) if (!rev.includes(id)) rev.unshift(id);
  return champion && rev.includes(champion) ? [...rev.filter(id => id !== champion), champion] : rev;
}
export const L_TRADES = 8;   // the leagues' cap: up to eight trades a draft
export const teamRating = (roster) => (roster?.length ? Math.round(roster.reduce((n, p) => n + p[2], 0) / roster.length) : 20);
// The board of a draft: -> [{round, pick, no, team (who picked), holder (who has the player), player}]
export function draftBoard(draft, rosters, n) {
  if (!draft) return [];
  const m = draft.order.length, out = [], swapped = new Map();
  for (const [r, a, b] of draft.trades || []) { swapped.set(`${r}|${a}`, b); swapped.set(`${r}|${b}`, a); }
  for (let r = 0; r < n; r++) for (let p = 0; p < m; p++) {
    const team = snakeTeam(draft.order, r, p), holder = swapped.get(`${r}|${team}`) || team;
    const player = rosters[holder]?.[r];
    if (player) out.push({ round: r + 1, pick: p + 1, no: r * m + p + 1, team, holder, player });
  }
  return out;
}

// ---- the calendar ---------------------------------------------------------------------------------
// Each sport's scored slots per weekday (sim GAMES at its ground; practice keeps no score).
const SLOTS = Object.fromEntries(SPORTS.map(sp => {
  const list = (SIM.GAMES[SPORT[sp].venue] || []).filter(g => !g.practice);
  const byWd = Array.from({ length: 8 }, (_, wd) => list.filter(g => g.days.includes(wd)).map(g => ({ from: g.from, to: g.to, name: g.name })).sort((a, b) => a.from - b.from));
  return [sp, { byWd, perWeek: byWd.reduce((n, l) => n + l.length, 0) }];
}));
// The sport's scored slots on days [d0, d1), counted by weekday (a season need not start on a Monday).
function slotsBetween(sport, d0, d1) {
  const S = SLOTS[sport], n = Math.max(0, d1 - d0), w = Math.floor(n / 7);
  let k = w * S.perWeek;
  for (let d = d0 + w * 7; d < d1; d++) k += S.byWd[SIM.weekdayOf(d)].length;
  return k;
}
// The regular season's rounds, and the playoff matchdays after them (the semis, then the final).
// A lower division (div >= 1, the pyramid, long seasons only) plays fewer: max(18, 9 x round(R / 2^div
// / 9)) (football: at least 9), spread over the same scored slots, behind closed doors.
const divRounds = (sport, R0, div) => Math.max(SPORT[sport].finalOnly ? 9 : 18, 9 * Math.round(R0 / 2 ** div / 9));
export const roundsOf = (sport, season, div = 0) => { const R0 = isLong(season) ? SPORT[sport].longRounds : SPORT[sport].rounds; return div > 0 ? divRounds(sport, R0, div) : R0; };
const playoffMds = (sport) => (SPORT[sport].finalOnly ? 1 : 2);
// A season's matchdays: a short season numbers every scored slot (the ones after the final are
// exhibitions); a long season numbers only its league matchdays, the regular rounds and the playoffs.
export const matchdays = (sport, season, div = 0) => (isLong(season) ? roundsOf(sport, season, div) + playoffMds(sport) : slotsBetween(sport, seasonStart(season), seasonStart(season + 1)));
// A long season's calendar: its scored slots M; the regular round i sits on slot floor(i * (M - P) / R),
// the playoffs on the last P slots, so the final is the season's last scored slot.
const LONG_CAL = new Map();
function longCal(sport, season, div = 0) {
  const key = `${sport}|${season}|${div}`;
  if (!LONG_CAL.has(key)) {
    LONG_CAL.set(key, { M: slotsBetween(sport, seasonStart(season), seasonStart(season + 1)), R: roundsOf(sport, season, div), P: playoffMds(sport) });
    if (LONG_CAL.size > 64) LONG_CAL.delete(LONG_CAL.keys().next().value);
  }
  return LONG_CAL.get(key);
}
// slot n (0-based in a long season) -> its matchday, or null for an exhibition
function longMd(sport, season, n, div = 0) {
  const { M, R, P } = longCal(sport, season, div), span = M - P;
  if (n >= span) return n < M ? R + (n - span) : null;
  const i = Math.ceil((n * R) / span);
  return i < R && Math.floor((i * span) / R) === n ? i : null;
}
// The sport's league matchdays on a day: -> [{md (0-based in the season), day, from, to, name}]. A
// short season lists every scored slot (md past the final: an exhibition); a long season lists only
// the slots that are league matchdays (the rest are exhibitions: the board's generic sides).
export function slotsOn(sport, day, div = 0) {
  const S = SLOTS[sport], season = seasonOf(day), wd = SIM.weekdayOf(day);
  const n0 = slotsBetween(sport, seasonStart(season), day);
  const list = S.byWd[wd].map((g, j) => ({ md: n0 + j, day, ...g }));
  if (!isLong(season)) return list;
  return list.map(x => ({ ...x, md: longMd(sport, season, x.md, div) })).filter(x => x.md != null);
}
export function stageOf(sport, md, season = 0, div = 0) {
  const R = roundsOf(sport, season, div);
  if (md < R) return "regular";
  if (SPORT[sport].finalOnly) return md === R ? "final" : "off";
  return md === R ? "semi" : md === R + 1 ? "final" : "off";
}
export const STAGE_NAME = { regular: "LEAGUE", semi: "SEMI-FINAL", final: "THE FINAL", off: "EXHIBITION" };
// A lower division's playoffs decide the third promotion place, not a title.
export const stageLabel = (stage, div = 0) => (div > 0 && stage === "semi" ? "PROMOTION SEMI-FINAL" : div > 0 && stage === "final" ? "PROMOTION FINAL" : STAGE_NAME[stage]);
// The circle method over a division's clubs, reshuffled each season and sport; the second half of a
// double round robin swaps the sides. Division 0's hash is the old one, so nothing published moves.
function circle(season, sport, ids = DIST, div = 0) {
  const tag = div > 0 ? `|d${div}` : "";
  const t = [...ids].sort((a, b) => h01(`order|${sport}|${season}${tag}|${a}`) - h01(`order|${sport}|${season}${tag}|${b}`));
  const n = t.length, rounds = [];
  let arr = t.slice();
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) round.push(r % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]);
    rounds.push(round);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
}
const CIRCLES = new Map();
export function roundOf(season, sport, md, ids = DIST, div = 0) {
  const key = `${season}|${sport}|${div}|${ids.join(",")}`;
  if (!CIRCLES.has(key)) { CIRCLES.set(key, circle(season, sport, ids, div)); if (CIRCLES.size > 64) CIRCLES.delete(CIRCLES.keys().next().value); }
  const c = CIRCLES.get(key), r = c[md % c.length];
  return Math.floor(md / c.length) % 2 ? r.map(([a, b]) => [b, a]) : r;
}
// The match on the board at a matchday's ground: the Courts play all of theirs on the board, one
// game after another; elsewhere one tie a matchday (rotating through the round), the final and the
// first semi-final. A lower division has no board: every tie is behind closed doors.
export const featuredOf = (sport, md, stage, div = 0) => (div > 0 ? -1 : SPORT[sport].kind === "hoops" ? -1 : stage === "regular" ? md % MATCHES_PER_DAY : 0);

// ---- a result ---------------------------------------------------------------------------------------
// The board's final for match j of a matchday: the ground's own scoreboard (sim gameAt at the
// whistle) for the tie on the board (every game at the Courts); behind closed doors, the same scoring
// model from the match's own seed. -> [side 0, side 1]
function closedDoor(kind, seed) {
  const sc = [0, 0];
  if (kind === "ball") for (let k = 0; k < 18; k++) { const r = h01(`${seed}|runs|${k}`); sc[k % 2] += r < 0.58 ? 0 : r < 0.84 ? 1 : r < 0.95 ? 2 : 3; }
  else if (kind === "gridiron") for (let k = 0; k < 20; k++) { const r = h01(`${seed}|drive|${k}`); sc[k % 2] += r < 0.5 ? 0 : r < 0.72 ? 3 : r < 0.96 ? 7 : 6; }
  else if (kind === "soccer") for (let k = 0; k < 18; k++) { if (h01(`${seed}|goal|${k}`) < 0.15) sc[h01(`${seed}|goalby|${k}`) < 0.52 ? 0 : 1]++; }
  else if (kind === "hoops") { const w = h01(`${seed}|hoopwin`) < 0.5 ? 0 : 1; sc[w] = 21; sc[1 - w] = 8 + Math.floor(h01(`${seed}|hooplose`) * 12); }   // a lower division's game to 21, no board
  return sc;
}
// A match's seed tag: division 0 keeps the old seeds (every published result stands); a lower
// division's results come from its own.
const divTag = (m) => (m.div > 0 ? `|d${m.div}` : "");
export function matchFinal(m) {
  if (m.featured) {
    const g = SIM.gameAt(m.placeId, (m.day - 1) * 24 + m.to - (m.kind === "hoops" ? 1e-4 : 1e-6));
    if (g?.score) return [g.score[0], g.score[1]];
  }
  return closedDoor(m.kind, `cd|${m.sport}${divTag(m)}|${m.day}|${m.from}|${m.j}`);
}
const LUCK = 50;
function play(m, pair, rating) {
  const [x, y] = pair, dt = divTag(m);
  const qx = rating[x] + LUCK * h01(`luck|${m.sport}${dt}|${m.day}|${m.from}|${m.j}|${x}`), qy = rating[y] + LUCK * h01(`luck|${m.sport}${dt}|${m.day}|${m.from}|${m.j}|${y}`);
  const better = qx >= qy ? x : y, worse = better === x ? y : x;
  const sc = matchFinal(m);
  const won = sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : -1;
  const out = { ...m, sides: won === 1 ? [worse, better] : won === 0 ? [better, worse] : pair, score: sc };
  if (won < 0 && m.stage !== "regular") out.tiebreak = better;
  return out;
}
export const winnerOf = (m) => (m.score[0] > m.score[1] ? m.sides[0] : m.score[1] > m.score[0] ? m.sides[1] : m.tiebreak || null);
export const loserOf = (m) => { const w = winnerOf(m); return w ? m.sides.find(x => x !== w) : null; };

export function tableOf(played, ids = DIST) {
  const table = Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, pts: 0 }]));
  for (const m of played) {
    if (m.stage !== "regular") continue;
    const [x, y] = m.sides, [sx, sy] = m.score, X = table[x], Y = table[y];
    if (!X || !Y) continue;
    X.p++; Y.p++; X.f += sx; X.a += sy; Y.f += sy; Y.a += sx;
    if (sx > sy) { X.w++; Y.l++; X.pts += 3; } else if (sy > sx) { Y.w++; X.l++; Y.pts += 3; } else { X.d++; Y.d++; X.pts++; Y.pts++; }
  }
  return table;
}
export function order(table, ids = DIST) {
  return [...ids].sort((a, b) => table[b].pts - table[a].pts || (table[b].f - table[b].a) - (table[a].f - table[a].a) || table[b].f - table[a].f || ids.indexOf(a) - ids.indexOf(b));
}
// Every match of a sport's season on days [start, until), in order (day, time, match).
// rating: {club: r}; ids: the division's clubs (the Loop's ten before the pyramid); div: the division
// (0 the top flight, on the board; below it every tie is closed-door, fewer rounds, its own seeds,
// and the playoffs are the promotion playoff: 3rd v 6th, 4th v 5th, then the final; football's
// Bowl-Game slot is 3rd v 4th). The playoffs follow the regular table once it is complete.
const SEASON_MEMO = new Map();
export function sportSeason(sport, season, until, rating, ids = DIST, div = 0) {
  const key = `${sport}|${season}|${until}|${div}|${ids.map(id => `${id}=${rating[id]}`).join(",")}`;
  if (SEASON_MEMO.has(key)) return SEASON_MEMO.get(key);
  const sp = SPORT[sport], played = [];
  let semis = [];
  const end = Math.min(until, seasonStart(season + 1));
  const o = () => order(tableOf(played, ids), ids);
  for (let day = seasonStart(season); day < end; day++) for (const slot of slotsOn(sport, day, div)) {
    const stage = stageOf(sport, slot.md, season, div), feat = featuredOf(sport, slot.md, stage, div);
    let pairs;
    if (stage === "regular") pairs = roundOf(season, sport, slot.md, ids, div);
    else if (stage === "semi") { const t = o(); pairs = div > 0 ? [[t[2], t[5]], [t[3], t[4]]] : [[t[0], t[3]], [t[1], t[2]]]; }
    else if (stage === "final") pairs = sp.finalOnly ? (() => { const t = o(); return div > 0 ? [[t[2], t[3]]] : [[t[0], t[1]]]; })() : semis.length === 2 ? [[winnerOf(semis[0]), winnerOf(semis[1])]] : [];
    else continue;
    pairs.forEach((pair, j) => {
      const hoops = sp.kind === "hoops";
      const base = { sport, k: slot.md, j, day, placeId: sp.venue, kind: sp.kind, stage, slotFrom: slot.from,
        from: hoops ? slot.from + j * HOOP_LEN : slot.from, to: hoops ? slot.from + (j + 1) * HOOP_LEN : slot.to, featured: div > 0 ? false : hoops || j === feat, ...(div > 0 ? { div } : {}) };
      const m = play(base, pair, rating);
      played.push(m);
      if (m.stage === "semi") semis = [...semis, m];
    });
  }
  SEASON_MEMO.set(key, played);
  if (SEASON_MEMO.size > 96) SEASON_MEMO.delete(SEASON_MEMO.keys().next().value);
  return played;
}
// Final positions (the Cup's): the champion, the runner-up, the semi-finalists (by the table), then
// the table; before the playoffs are over, the table as it stands. A lower division: the top two,
// then the promotion final's winner and loser, the semi-final losers, then the table.
export function positions(sport, played, ids = DIST, div = 0) {
  const reg = order(tableOf(played, ids), ids);
  const fin = played.find(m => m.stage === "final");
  if (!fin) return reg;
  const w = winnerOf(fin), l = loserOf(fin);
  const semiLosers = played.filter(m => m.stage === "semi").map(loserOf).sort((a, b) => reg.indexOf(a) - reg.indexOf(b));
  const top = div > 0 ? [reg[0], reg[1], w, l, ...semiLosers] : [w, l, ...semiLosers];
  return [...top, ...reg.filter(id => !top.includes(id))];
}
// The Cup's points for a league as it stands: by position (POS_PTS; a lower division its own table,
// DIV_PTS_LOWER), the playoffs deciding the top once played; teams level on points, difference and
// scored share the better position's points; nothing before a ball is kicked. -> {club: pts}
export function positionPoints(sport, played, ids = DIST, div = 0) {
  const out = Object.fromEntries(ids.map(id => [id, 0]));
  if (!played.length) return out;
  const PTS = div > 0 ? DIV_PTS_LOWER[Math.min(div - 1, DIV_PTS_LOWER.length - 1)] : POS_PTS;
  const t = tableOf(played, ids), pos = positions(sport, played, ids, div), fin = played.find(m => m.stage === "final");
  const fixed = fin ? new Set(pos.slice(0, SPORT[sport].finalOnly && div === 0 ? 2 : 4)) : new Set();
  const sameAs = (a, b) => t[a].pts === t[b].pts && t[a].f - t[a].a === t[b].f - t[b].a && t[a].f === t[b].f;
  pos.forEach((id, i) => {
    let k = i;
    if (!fixed.has(id)) while (k > 0 && !fixed.has(pos[k - 1]) && sameAs(pos[k - 1], id)) k--;
    out[id] = PTS[k] || 0;
  });
  return out;
}
// The end of a sport's season from its rosters: {table (the regular table's order), champion,
// positions}; a lower division adds up (the two automatic places and the playoff winner, in that
// order) and down (the table's last three) for the pyramid's exchange (docs/design/PYRAMID.md 4).
export function sportEnd(sport, season, rosters, ids = DIST, div = 0) {
  const rating = Object.fromEntries(ids.map(id => [id, teamRating(rosters[id])]));
  const all = sportSeason(sport, season, seasonStart(season + 1), rating, ids, div);
  const fin = all.find(m => m.stage === "final");
  const table = order(tableOf(all, ids), ids);
  const out = { table, champion: div > 0 ? table[0] : fin ? winnerOf(fin) : null, positions: positions(sport, all, ids, div) };
  if (div > 0) out.up = [table[0], table[1], fin ? winnerOf(fin) : table[2]];
  out.down = table.slice(-UP_N);
  return out;
}
// A team's last five (regular and playoff), W / D / L.
export function formOf(played, id) {
  return played.filter(m => m.sides.includes(id)).slice(-5).map(m => { const w = winnerOf(m); return w === id ? "W" : w ? "L" : "D"; }).join("");
}

// ---- THE TENNIS LADDER --------------------------------------------------------------------------
// Seeded each season: the tennis players on file (their own ratings), then the rest of the census's
// tennis players, then the club's regulars (>= 12% of their leisure at the club), then athletes on
// the record (a team player may also hold a rung), by rating. The
// show court's match (tennis.js tennisAt: THE CLUB CHAMPIONSHIP on Saturdays, LADDER NIGHT on
// Wednesdays) counts when both players are on the ladder; on Ladder Night three challenges are
// played on the outside courts: a player challenges one or two rungs up. A challenger who wins takes
// the rung; everyone between steps down one. -> [[key, name, r, district | null]]
export const LADDER_N = 10;
// entrants: the season's entries; those who entered the ladder take the rungs below the ten.
export function ladderSeed(subjects, entrants = []) {
  const onFile = new Map(TENNIS_ON_FILE.map(([k, , r]) => [k, r]));
  const ent = entrantsBySport(entrants), entKeys = new Set(Object.values(ent).flat().map(x => x.key));
  const rows = [];
  for (const s of subjects) {
    const key = SIM.keyOf(s);
    if (entKeys.has(key)) continue;
    let g = 0;
    if (onFile.has(key)) g = 3;
    else if (isTennis(s)) g = 2;
    else if (!FIGHTER[key]) {
      const { list, total } = SIM.baseLeisure(s);
      const at = list.reduce((n, [id, v]) => n + (id === "tennis" ? v : 0), 0);
      if (total > 0 && at / total >= 0.12) g = 1;
    }
    if (!g && !FIGHTER[key] && (ATHLETE_HINT.has(key) || SPORT_HINT[key] || SPORT_FIELDS.some(x => x !== "combat" && (SIM.fieldsOf(s)[x] || 0) >= 5))) g = 0.5;   // then athletes, to fill the rungs
    if (!g) continue;
    const d = SIM.assignJob(s).district;
    rows.push({ key, name: displayName(s), r: onFile.get(key) ?? sportRating(s), g, d: DIST.includes(d) ? d : null });
  }
  rows.sort((a, b) => (b.g >= 2 ? 2 : b.g >= 1 ? 1 : 0) - (a.g >= 2 ? 2 : a.g >= 1 ? 1 : 0) || b.r - a.r || (a.key < b.key ? -1 : 1));
  const seeded = rows.slice(0, LADDER_N).map(x => [x.key, x.name, x.r, x.d]);
  if (!ent.tennis.length) return seeded;
  const by = new Map(subjects.map(s => [SIM.keyOf(s), s]));
  // the district they work in (the Cup's), when the census has their citizen
  return [...seeded, ...ent.tennis.map(x => { const s = by.get(x.key), d = s ? SIM.assignJob(s).district : null; return [x.key, x.name, x.r, DIST.includes(d) ? d : null]; })];
}
function tennisSets(seed, ra, rb) {
  const edge = (ra - rb) / 100, sets = [], won = [0, 0];
  for (let k = 0; k < 3 && won[0] < 2 && won[1] < 2; k++) {
    let a = 0, b = 0;
    for (let g = 0; g < 30; g++) {
      if (h01(`${seed}|g|${k}|${g}`) < 0.5 + edge) a++; else b++;
      if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2) break;
      if (a === 7 || b === 7) break;
    }
    sets.push([a, b]); won[a > b ? 0 : 1]++;
  }
  return { sets, win: won[0] > won[1] ? 0 : 1 };
}
const acesOf = (seed, r) => Math.floor(h01(`${seed}|aces`) * (2 + r / 12));
// The ladder's season up to machine hour T (exclusive of results after it). -> {ladder: [keys, top
// first], matches: [{day, from, to, a, b, win, sets, show, aces: [x, y], moved}], stats: {key: {w, l, aces}}}
export function ladderRun(seed, season, T) {
  const info = new Map(seed.map(([k, n, r, d]) => [k, { key: k, name: n, r, d }]));
  const ladder = seed.map(x => x[0]), matches = [], stats = Object.fromEntries(seed.map(x => [x[0], { w: 0, l: 0, aces: 0 }]));
  const apply = (m) => {
    const wk = m.win === 0 ? m.a : m.b, lk = m.win === 0 ? m.b : m.a, wi = ladder.indexOf(wk), li = ladder.indexOf(lk);
    m.moved = wi > li;
    if (m.moved) { ladder.splice(wi, 1); ladder.splice(li, 0, wk); }
    stats[wk].w++; stats[lk].l++; stats[m.a].aces += m.aces[0]; stats[m.b].aces += m.aces[1];
    matches.push(m);
  };
  const lastDay = Math.min(seasonStart(season + 1) - 1, Math.floor(T / 24) + 1);
  for (let day = seasonStart(season); day <= lastDay; day++) {
    const d0 = day - 1, wd = SIM.weekdayOf(day);
    for (const f of TENNIS_FIXTURES) {
      if (!f.days.includes(wd)) continue;
      // the show court's result, at the moment the board shows it won
      const tShow = d0 * 24 + f.from + 0.9 * (f.to - f.from) + 0.01;
      const busy = new Set();
      if (tShow <= T) {
        const g = tennisAt(tShow);
        const [pa, pb] = g ? g.players.map(p => p.key) : [];
        if (g?.done && info.has(pa) && info.has(pb)) {
          const sd = `show|${day}|${f.from}`;
          apply({ day, from: f.from, to: f.from + 0.9 * (f.to - f.from), a: pa, b: pb, win: g.winner, sets: g.sets, show: true, name: f.name,
            aces: [acesOf(`${sd}|a`, info.get(pa).r), acesOf(`${sd}|b`, info.get(pb).r)] });
          busy.add(pa); busy.add(pb);
        }
      }
      if (f.name !== "LADDER NIGHT" || d0 * 24 + f.to > T) continue;
      for (let c = 0; c < 3; c++) {
        const free = ladder.filter(k => !busy.has(k));
        if (free.length < 2) break;
        const ci = 1 + Math.floor(h01(`ladder|${day}|${c}|who`) * (free.length - 1)), reach = h01(`ladder|${day}|${c}|reach`) < 0.4 ? 2 : 1;
        const a = free[ci], b = free[Math.max(0, ci - reach)];
        busy.add(a); busy.add(b);
        const sd = `ch|${day}|${c}`, A = info.get(a), B = info.get(b), res = tennisSets(sd, A.r, B.r);
        apply({ day, from: f.from, to: f.to, a, b, win: res.win, sets: res.sets, show: false, name: "A CHALLENGE", aces: [acesOf(`${sd}|a`, A.r), acesOf(`${sd}|b`, B.r)] });
      }
    }
  }
  return { ladder, matches, stats, info };
}

// ---- THE PIT RANKINGS ------------------------------------------------------------------------------
// The season's Friday cards (pit.js cardFor): W 3, D 1; stoppages (the corner retired the other
// fighter, or a submission) break ties, then the rating. Grievance bouts are settled by the ledger and
// do not rank. -> {rank: [{key, name, w, l, d, stops, pts, r}], bouts: [...decided]}
export function pitRun(season, T) {
  const rec = Object.fromEntries(FIGHTERS.map(([k, n, , r]) => [k, { key: k, name: n, r, w: 0, l: 0, d: 0, stops: 0, pts: 0 }]));
  const bouts = [];
  const lastDay = Math.min(seasonStart(season + 1) - 1, Math.floor(T / 24) + 1);
  for (let day = seasonStart(season); day <= lastDay; day++) {
    for (const b of cardFor(day) || []) {
      if ((day - 1) * 24 + b.from + SLOT_H > T) continue;
      const [a, c] = b.sides.map(s => s.key);
      bouts.push(b);
      if (b.win == null) { rec[a].d++; rec[c].d++; rec[a].pts++; rec[c].pts++; continue; }
      const W = rec[b.win === 0 ? a : c], L = rec[b.win === 0 ? c : a];
      W.w++; W.pts += 3; L.l++;
      if (!/DECISION/.test(b.method)) W.stops++;
    }
  }
  const rank = Object.values(rec).sort((x, y) => y.pts - x.pts || x.l - y.l || y.w - x.w || y.stops - x.stops || y.r - x.r || (x.key < y.key ? -1 : 1));
  return { rank, bouts };
}
export const pitDistricts = (people) => Object.fromEntries(FIGHTERS.map(([k]) => { const s = people.get(k); const d = s ? SIM.assignJob(s).district : null; return [k, DIST.includes(d) ? d : null]; }));

// ---- THE DEPARTMENTAL CUP --------------------------------------------------------------------------
// pos: {sport: [district in position order]}; ladder: [keys top first]; pit: [keys top first];
// dist: key -> district. -> [{id, pts, by: {baseball, basketball, football, soccer, tennis, pit}}]
// ids: the districts in the Cup (the Loop's ten before the pyramid; every district with a club from
// it). pos may name clubs (reserves): a club's points go to its district.
export function cupTable(pos, ladder, pit, dist, ids = DIST) {
  const rows = Object.fromEntries(ids.map(id => [id, { id, pts: 0, by: { baseball: 0, basketball: 0, football: 0, soccer: 0, tennis: 0, pit: 0 } }]));
  for (const sp of SPORTS) for (const [c, p] of Object.entries(pos[sp] || {})) { const id = rows[c] ? c : clubDistrict(c); if (rows[id]) { rows[id].by[sp] += p; rows[id].pts += p; } }
  for (const [kind, list] of [["tennis", ladder], ["pit", pit]]) (list || []).slice(0, IND_PTS.length).forEach((k, i) => { const d = dist[k]; if (d && rows[d]) { rows[d].by[kind] += IND_PTS[i]; rows[d].pts += IND_PTS[i]; } });
  const bySport = (id) => SPORTS.reduce((n, sp) => n + rows[id].by[sp], 0);
  return Object.values(rows).sort((a, b) => b.pts - a.pts || bySport(b.id) - bySport(a.id) || ids.indexOf(a.id) - ids.indexOf(b.id));
}

// ---- BOX SCORES -------------------------------------------------------------------------------------
// A match's player lines for one side, from the fixture's seed, summed to its final score exactly.
// roster: [[key, name, r]]. Positions come from the ratings (the best first).
const pickW = (seed, items, w) => {
  const tot = items.reduce((n, x) => n + w(x), 0);
  let u = h01(seed) * tot;
  for (const x of items) { u -= w(x); if (u < 0) return x; }
  return items[items.length - 1];
};
const byRating = (roster) => [...roster].sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1));
// football points: 7 a converted touchdown, 6 a missed kick, 3 a field goal -> [td7, td6, fg]
export function footballParts(P) {
  for (let a = Math.floor(P / 7); a >= 0; a--) for (let b = 0; 7 * a + 6 * b <= P; b++) { const rest = P - 7 * a - 6 * b; if (rest % 3 === 0) return [a, b, rest / 3]; }
  return [0, 0, 0];
}
// The whole box: -> {sides: [lines, lines]} (a line per player, stats as the sport keeps them)
export function boxScore(m, rosters) {
  const sides = [0, 1].map(s => lines(m, s, rosters[m.sides[s]] || []));
  if (m.sport === "baseball") {
    // each pitcher's line: the other side's runs and hits
    for (const s of [0, 1]) { const p = sides[s].find(x => x.pos === "P"); if (p) { p.er = m.score[1 - s]; p.ha = sides[1 - s].reduce((n, x) => n + x.h, 0); } }
  }
  if (m.sport === "soccer") for (const s of [0, 1]) { const gk = sides[s].find(x => x.pos === "GK"); if (gk) { gk.ga = m.score[1 - s]; gk.cs = m.score[1 - s] === 0 ? 1 : 0; } }
  return { sides };
}
function lines(m, side, roster) {
  const P = m.score[side], seed = `box|${m.sport}${divTag(m)}|${m.day}|${m.from}|${m.j}|${side}`;
  const L = byRating(roster).map(([key, name, r]) => ({ key, name, r }));
  if (!L.length) return [];
  const H = (s) => h01(`${seed}|${s}`);
  if (m.sport === "baseball") {
    const rot = L.slice(0, 3), pitcher = rot[m.k % rot.length];
    L.forEach((x, i) => {
      x.pos = x === pitcher ? "P" : `${i + 1}`;
      x.ab = 3 + (H(`ab|${i}`) < 0.55 ? 1 : 0) + (H(`ab2|${i}`) < 0.15 ? 1 : 0);
      x.h = 0; x.hr = 0; x.runs = 0; x.rbi = 0;
      for (let k = 0; k < x.ab; k++) if (H(`hit|${i}|${k}`) < 0.18 + x.r / 600) x.h++;
      for (let k = 0; k < x.h; k++) if (H(`hr|${i}|${k}`) < 0.06 + x.r / 1500) x.hr++;
    });
    // no more home runs than runs: the last ones off the board are singles
    let hr = L.reduce((n, x) => n + x.hr, 0);
    for (let i = L.length - 1; i >= 0 && hr > P; i--) while (L[i].hr > 0 && hr > P) { L[i].hr--; hr--; }
    // a side that scored had a hit
    if (P > 0 && !L.some(x => x.h > 0)) L[0].h = 1;
    for (const x of L) { x.runs += x.hr; x.rbi += x.hr; }
    for (let k = hr; k < P; k++) {
      const hitters = L.filter(x => x.h > 0);
      pickW(`${seed}|scored|${k}`, L, x => 0.4 + x.h).runs++;
      pickW(`${seed}|drove|${k}`, hitters, x => x.h + x.hr).rbi++;
    }
    pitcher.ip = 9; pitcher.k = 2 + Math.floor(H("k") * (4 + pitcher.r / 12));
    return L;
  }
  if (m.sport === "basketball") {
    for (const x of L) { x.pts = 0; x.fgm = 0; x.fga = 0; x.tpm = 0; x.ftm = 0; x.reb = 0; x.ast = 0; }
    let left = P, n = 0;
    while (left > 0) {
      const v = left >= 3 && H(`v|${n}`) < 0.22 ? 3 : left >= 2 ? 2 : 1;
      const x = pickW(`${seed}|who|${n}`, L, y => y.r * y.r);
      x.pts += v; left -= v;
      if (v === 1) x.ftm++; else { x.fgm++; if (v === 3) x.tpm++; if (H(`astd|${n}`) < 0.55) { const o = L.filter(y => y !== x); if (o.length) pickW(`${seed}|ast|${n}`, o, y => y.r).ast++; } }
      n++;
    }
    L.forEach((x, i) => { x.fga = x.fgm + Math.floor(H(`miss|${i}`) * (x.fgm + 3)); x.reb = Math.floor(H(`reb|${i}`) * (2 + x.r / 15)); });
    return L;
  }
  if (m.sport === "football") {
    const [a, b, c] = footballParts(P);
    const pos = ["QB", "RB", "WR", "WR", "TE", "LB", "LB", "DL", "DL", "CB", "K"];
    L.forEach((x, i) => { x.pos = i === L.length - 1 ? "K" : pos[i] || "DB"; Object.assign(x, { pts: 0, passYds: 0, passTd: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, sacks: 0, int: 0, xp: 0, fg: 0 }); });
    const qb = L[0], rb = L[1] || qb, k = L[L.length - 1];
    const catchers = [L[2], L[3], L[4], L[1]].filter(Boolean), cw = [0.4, 0.3, 0.2, 0.1];
    for (let t = 0; t < a + b; t++) {
      if (H(`tdkind|${t}`) < 0.6 && catchers.length) {
        const x = pickW(`${seed}|tdto|${t}`, catchers, y => cw[catchers.indexOf(y)]);
        x.recTd++; x.pts += 6; qb.passTd++;
        x.rec++; x.recYds += 5 + Math.floor(H(`tdyds|${t}`) * 40);
      } else { const x = H(`rusher|${t}`) < 0.8 ? rb : qb; x.rushTd++; x.pts += 6; x.rushYds += 1 + Math.floor(H(`rtd|${t}`) * 20); }
    }
    k.xp = a; k.fg = c; k.pts += a + 3 * c;
    catchers.forEach((x, i) => { const n = Math.floor(H(`catches|${i}`) * [7, 5, 4, 3][i]); x.rec += n; for (let q = 0; q < n; q++) x.recYds += 3 + Math.floor(H(`cy|${i}|${q}`) * 16); });
    qb.passYds = catchers.reduce((s, x) => s + x.recYds, 0);
    rb.rushYds += (10 + Math.floor(H("carries") * 12)) * (2 + Math.floor(H("ypc") * 4));
    qb.rushYds += Math.floor(H("qbrun") * 25);
    L.slice(5, L.length - 1).forEach((x, i) => { x.sacks = H(`sack|${i}`) < 0.25 ? 1 + (H(`sack2|${i}`) < 0.2 ? 1 : 0) : 0; x.int = H(`int|${i}`) < 0.1 ? 1 : 0; });
    return L;
  }
  if (m.sport === "soccer") {
    const role = (i) => (i === L.length - 1 ? "GK" : i < 2 ? "FW" : i < 6 ? "MF" : "DF");
    L.forEach((x, i) => { x.pos = role(i); x.goals = 0; x.assists = 0; x.saves = 0; x.cs = 0; x.ga = 0; });
    const out = L.filter(x => x.pos !== "GK");
    const gw = { FW: 5, MF: 2, DF: 0.7 }, aw = { FW: 2, MF: 3, DF: 1 };
    for (let g = 0; g < P; g++) {
      const x = pickW(`${seed}|scorer|${g}`, out, y => gw[y.pos] * (0.5 + y.r / 100));
      x.goals++;
      if (H(`assisted|${g}`) < 0.75) { const o = out.filter(y => y !== x); if (o.length) pickW(`${seed}|assist|${g}`, o, y => aw[y.pos]).assists++; }
    }
    const gk = L[L.length - 1];
    gk.saves = 1 + Math.floor(H("saves") * 6);
    return L;
  }
  return L;
}
// The categories each sport keeps, for the stat tables and the leaders.
// sum: the season line's counting stats; rate: derived (value, qualifying minimum).
export const STAT_COLS = {
  baseball: [["g", "G"], ["ab", "AB"], ["h", "H"], ["hr", "HR"], ["runs", "R"], ["rbi", "RBI"], ["avg", "AVG"], ["ip", "IP"], ["er", "ER"], ["k", "K"], ["era", "ERA"]],
  basketball: [["g", "G"], ["pts", "PTS"], ["ppg", "PPG"], ["reb", "REB"], ["rpg", "RPG"], ["ast", "AST"], ["apg", "APG"], ["fgm", "FGM"], ["fga", "FGA"], ["fgp", "FG%"], ["tpm", "3PM"]],
  football: [["g", "G"], ["passYds", "PASS YDS"], ["passTd", "PASS TD"], ["rushYds", "RUSH YDS"], ["rushTd", "RUSH TD"], ["rec", "REC"], ["recYds", "REC YDS"], ["recTd", "REC TD"], ["sacks", "SACKS"], ["int", "INT"], ["pts", "PTS"]],
  soccer: [["g", "G"], ["goals", "GOALS"], ["assists", "ASSISTS"], ["saves", "SAVES"], ["cs", "CLEAN SHEETS"], ["ga", "CONCEDED"]],
};
export const LEADERS = {
  baseball: [["avg", "BATTING AVERAGE", "ab", 6], ["hr", "HOME RUNS"], ["rbi", "RUNS BATTED IN"], ["era", "EARNED RUN AVERAGE", "ip", 9, true], ["k", "STRIKEOUTS"]],
  basketball: [["ppg", "POINTS PER GAME"], ["rpg", "REBOUNDS PER GAME"], ["apg", "ASSISTS PER GAME"], ["fgp", "FIELD GOAL %", "fga", 8]],
  football: [["passYds", "PASSING YARDS"], ["rushYds", "RUSHING YARDS"], ["recYds", "RECEIVING YARDS"], ["td", "TOUCHDOWNS"], ["sacks", "SACKS"], ["int", "INTERCEPTIONS"]],
  soccer: [["goals", "GOALS"], ["assists", "ASSISTS"], ["cs", "CLEAN SHEETS"], ["saves", "SAVES"]],
};
const SUMS = { baseball: ["ab", "h", "hr", "runs", "rbi", "ip", "er", "k"], basketball: ["pts", "reb", "ast", "fgm", "fga", "tpm", "ftm"], football: ["passYds", "passTd", "rushYds", "rushTd", "rec", "recYds", "recTd", "sacks", "int", "pts", "xp", "fg"], soccer: ["goals", "assists", "saves", "cs", "ga"] };
function derive(sport, x) {
  const r3 = (v) => Math.round(v * 1000) / 1000, r1 = (v) => Math.round(v * 10) / 10;
  if (sport === "baseball") { x.avg = x.ab ? r3(x.h / x.ab) : 0; x.era = x.ip ? Math.round((9 * x.er / x.ip) * 100) / 100 : null; }
  if (sport === "basketball") { x.ppg = x.g ? r1(x.pts / x.g) : 0; x.rpg = x.g ? r1(x.reb / x.g) : 0; x.apg = x.g ? r1(x.ast / x.g) : 0; x.fgp = x.fga ? r3(x.fgm / x.fga) : 0; }
  if (sport === "football") x.td = x.passTd + x.rushTd + x.recTd;
  return x;
}
// Season stats from the decided matches: {players: {key: line}, teams: {district: line}}
export function seasonStats(sport, decided, rostersByTeam) {
  const players = {}, teams = {};
  const add = (into, line) => { for (const k of SUMS[sport]) into[k] = (into[k] || 0) + (line[k] || 0); };
  for (const m of decided) {
    const box = boxScore(m, rostersByTeam);
    box.sides.forEach((L, s) => {
      const team = m.sides[s], T = (teams[team] ||= { id: team, g: 0, f: 0, a: 0 });
      T.g++; T.f += m.score[s]; T.a += m.score[1 - s];
      for (const line of L) {
        const x = (players[line.key] ||= { key: line.key, name: line.name, r: line.r, team, pos: line.pos, g: 0 });
        x.g++; add(x, line); add(T, line);
        if (line.pos === "P" || line.pos === "GK" || line.pos === "K") x.pos = line.pos;
      }
    });
  }
  for (const x of Object.values(players)) derive(sport, x);
  for (const x of Object.values(teams)) derive(sport, x);
  return { players, teams };
}
// Top n per leader category: -> [{key: cat, label, rows: [line]}]
export function leadersOf(sport, players, n = 5) {
  const list = Object.values(players);
  return LEADERS[sport].map(([cat, label, minKey, min, asc]) => {
    const rows = list.filter(x => x[cat] != null && (!minKey || (x[minKey] || 0) >= min) && (asc || x[cat] > 0))
      .sort((a, b) => (asc ? a[cat] - b[cat] : b[cat] - a[cat]) || b.r - a.r || (a.key < b.key ? -1 : 1)).slice(0, n);
    return { key: cat, label, rows };
  });
}
// The season's most valuable player: a sport's own measure of a season line.
export const MVP_VALUE = {
  baseball: (x) => 4 * x.hr + x.rbi + x.runs + x.h + (x.ip ? Math.max(0, 2 * x.k - 3 * x.er) / 3 : 0),
  basketball: (x) => x.pts + 1.2 * x.reb + 1.5 * x.ast,
  football: (x) => 6 * (x.passTd + x.rushTd + x.recTd) + (x.passYds + x.rushYds + x.recYds) / 10 + 4 * x.sacks + 5 * x.int,
  soccer: (x) => 3 * x.goals + 2 * x.assists + 2 * x.cs + x.saves / 3,
};
export function mvpOf(sport, players) {
  return Object.values(players).map(x => [MVP_VALUE[sport](x), x]).sort((a, b) => b[0] - a[0] || b[1].r - a[1].r || (a[1].key < b[1].key ? -1 : 1))[0]?.[1] || null;
}
