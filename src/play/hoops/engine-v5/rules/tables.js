// THE COURTS engine, rules/tables.js (v5): the rules as data (docs/design/BASKETBALL.md 4.4). One state
// machine (rules/index.js) reads the table of the game's format. Pure: no imports.
//   shot / oreb        the shot clock, and its reset after an offensive rebound off the rim
//   backcourt, inbound seconds to cross half court, seconds to throw it in
//   penaltyOn          the team foul in a period that first shoots two; late: in the last `lateSecs` of a
//                      period the `lateFouls`-th foul shoots whatever the count (the NBA's last two
//                      minutes, scaled to a two-minute quarter); resetEvery: team fouls reset each time the
//                      leading score passes a multiple (a game to 21 has no periods to reset them)
//   lane3 / def3       three seconds in the lane, offensive and defensive (def3 is off in the HVI game)
// Which known violations are CALLED on a human depends on the level (levels.js `viol`, `inbound`).
const nba = {
  periods: 4, len: 720, ot: 300, shot: 24, oreb: 14, backcourt: 8, inbound: 5, endLineRun: true, lane3: true, def3: true,
  penaltyOn: 5, late: { secs: 120, fouls: 2 }, foulOut: 6, swapEnds: 2,
};
export const RULES = {
  nba,
  // the HVI game: four two-minute quarters (FORMATS.quarters), the third team foul shoots (as v4)
  hvi: { ...nba, len: 120, ot: 60, foulOut: 3, def3: false, penaltyOn: 3, late: { secs: 20, fouls: 2 }, swapEnds: 0 },
  // first to 21 (FORMATS.to21): the fifth team foul shoots (as v4), and the count resets at 7 and 14
  to21: { ...nba, periods: 0, len: 0, ot: 0, foulOut: 3, def3: false, penaltyOn: 5, late: null, resetEvery: 7, swapEnds: 0 },
  fiba: { ...nba, len: 600, def3: false },
  // the half court: check ball at the top, clear it past the arc, no free throws, no backcourt
  street: { shot: 24, oreb: 14, backcourt: 0, inbound: 0, lane3: false, def3: false, penaltyOn: 99, late: null, foulOut: 99, check: true, clear: true },
};
// the table a game plays: by its format (FORMATS id)
export const rulesOf = (st) => (st.half ? RULES.street : st.cfg.fmt === "to21" ? RULES.to21 : RULES.hvi);
