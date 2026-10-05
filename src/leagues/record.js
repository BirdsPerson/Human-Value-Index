// THE ENTRANT'S RATING (src/city/leagues.js re-exports it; it imports nothing, so MY FILE can name
// the levels without the city in the logon bundle). docs/CITY_SPEC.md "The leagues and the
// Departmental Cup", players' entries.
//
// THE FILE: 0.45 physical + 0.25 competence + 0.10 adaptability from the latest assessment (an
// unassessed body counts as the rubric's neutral 50), + ATH_BONUS when the subject's own words record
// athletics, + SPORT_BONUS more in a sport they named. Ceiling 80 + 7 = 87.
//
// THE ATHLETIC RECORD (Scott 2026-10-05: three years varsity basketball, a division winner every year
// and the South Jersey finals; varsity soccer; varsity baseball; the school's #1 in the 400 and the
// long jump. The file's formula put him in the low 50s, under the city's non-athletes). ADMIN-SET on
// the case by the operator (scripts/set-athletic-record.mjs; netlify/lib/league-entries.js reads it),
// never through a public API; structured: the HIGHEST LEVEL played, the league sports played at that
// level, and a track & field flag. It sets a FLOOR: the level's (varsity 60, varsity standout 66,
// college 72), + PLAYED_BONUS in a sport played at that level, + TRACK_BONUS in the running sports for
// track. The rating is the higher of the file and the floor; the floor never passes SELF_CAP (72), so
// no record puts an entrant past the pros on file, who are drafted in the 80s and 90s. PRO is not a
// level: the professionals are the named athletes on file. A record never lowers what the file
// already earns, and the interview's bonus and the floor are never added together (the higher counts).
export const ATH_BONUS = 4, SPORT_BONUS = 3;
export const LEAGUE_SPORTS = ["baseball", "basketball", "football", "soccer"];
export const LEVELS = ["none", "varsity", "standout", "college"];
export const LEVEL_NAME = { none: "NONE", varsity: "HIGH SCHOOL VARSITY", standout: "VARSITY STANDOUT", college: "COLLEGE" };
export const LEVEL_FLOOR = { none: 0, varsity: 60, standout: 66, college: 72 };
export const PLAYED_BONUS = 3, TRACK_BONUS = 1, SELF_CAP = 72;
export const TRACK_SPORTS = ["football", "soccer", "basketball"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 100) : d);

// A record as filed -> {level, played, track} (canonical: played in LEAGUE_SPORTS order, nothing
// played and no track without a level), or null if it is not one (an unknown level, PRO included,
// an unknown sport, a field that is not ours).
export function cleanRecord(x) {
  if (x == null) return { level: "none", played: [], track: false };
  if (typeof x !== "object" || Array.isArray(x)) return null;
  if (Object.keys(x).some(k => !["level", "played", "track"].includes(k))) return null;
  const level = x.level == null ? "none" : String(x.level).toLowerCase();
  if (!LEVELS.includes(level)) return null;
  const played = x.played == null ? [] : x.played;
  if (!Array.isArray(played) || played.some(s => !LEAGUE_SPORTS.includes(String(s).toLowerCase()))) return null;
  if (x.track != null && typeof x.track !== "boolean") return null;
  if (level === "none") return { level, played: [], track: false };
  const p = new Set(played.map(s => String(s).toLowerCase()));
  return { level, played: LEAGUE_SPORTS.filter(s => p.has(s)), track: Boolean(x.track) };
}
export const sameRecord = (a, b) => JSON.stringify(cleanRecord(a)) === JSON.stringify(cleanRecord(b));

// The floor a record sets in a sport (0 for none; never over SELF_CAP).
export function recordFloor(record, sport) {
  const r = cleanRecord(record);
  if (!r || r.level === "none") return 0;
  const f = LEVEL_FLOOR[r.level] + (r.played.includes(sport) ? PLAYED_BONUS : 0) + (r.track && TRACK_SPORTS.includes(sport) ? TRACK_BONUS : 0);
  return Math.min(f, SELF_CAP);
}
// The file's rating alone.
export function fileRating(x, sport) {
  const base = 0.45 * num(x?.physical, 50) + 0.25 * num(x?.competence, 50) + 0.10 * num(x?.adaptability, 50);
  const bonus = x?.ath ? ATH_BONUS + (Array.isArray(x.named) && x.named.includes(sport) ? SPORT_BONUS : 0) : 0;
  return clamp(Math.round(base) + bonus, 0, 99);
}
// The entrant's rating, 0..99: the file, or the record's floor, whichever is higher.
export function entrantRating(x, sport, record = null) {
  return Math.max(fileRating(x, sport), recordFloor(record, sport));
}
