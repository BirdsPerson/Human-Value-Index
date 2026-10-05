// THE SEASON CALENDAR: the one definition every season-keeping module reads (the leagues, the
// mixed league before them, the Departmental Cup, the mountain standings, the league entries).
// docs/CITY_SPEC.md "The leagues and the Departmental Cup".
//
//   SHORT SEASONS   seasons 1..22 (0-based 0..21): 28 machine days each (eleven real hours and
//                   twelve minutes). Every day of them is published history; they keep this length.
//   LONG SEASONS    from season 23 (0-based LONG_FROM = 22, machine day 617, 2026-10-06 06:24 UTC):
//                   1800 machine days each, ONE REAL MONTH (30 real days at 1 real minute = 1 machine
//                   hour). Scott 2026-10-05: a season should last one real month. Fixed length, not
//                   calendar months, so every client and the builder agree without a calendar.
//
// The numbering continues across the cutover: season 23 is the first long one. A long season does not
// start on a Monday (1800 is not a multiple of 7); the leagues' calendar counts slots by weekday from
// the season's first day (leagues.js), so nothing assumes it does.
export const SEASON_DAYS = 28;            // a short season (before LONG_FROM)
export const LONG_SEASON_DAYS = 1800;     // a long season: 30 real days
export const LONG_FROM = 22;              // 0-based: season 23 is the first long season
const CUT = LONG_FROM * SEASON_DAYS + 1;  // machine day 617, the first long season's first day
// The season (0-based) a machine day falls in.
export const seasonOf = (day) => (day < CUT ? Math.floor((day - 1) / SEASON_DAYS) : LONG_FROM + Math.floor((day - CUT) / LONG_SEASON_DAYS));
// A season's first machine day.
export const seasonStart = (season) => (season <= LONG_FROM ? season * SEASON_DAYS + 1 : CUT + (season - LONG_FROM) * LONG_SEASON_DAYS);
// A season's length in machine days.
export const seasonDays = (season) => (season < LONG_FROM ? SEASON_DAYS : LONG_SEASON_DAYS);
export const isLong = (season) => season >= LONG_FROM;
