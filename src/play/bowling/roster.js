// Who bowls against you at THE LANES. Pure. Nobody on file bowls for a living (the census of 2026-10-05
// has no professional bowler: /api/figure/<slug> answers 404 for every one asked), so these are the
// figures on file whose record holds a lane, and two of the house's own. The rating (0..99) is a
// bowling rating set here, like the Pit's fighters and the park's chess players: a bowling fact, not a
// reading of competence. It sets how close to the pocket a figure's ball arrives (sim.js cpuProfile).
//
// Content rule: the living appear and bowl; they never speak and are never quoted. The dead are given
// no words either. Everything here is the Department's, about the game.
// kit: [shirt, trousers]. why: the line under the name.
export const OPPONENTS = [
  { key: "bill-murray", name: "BILL MURRAY", rating: 78, died: null, kit: ["#7c3fbf", "#3a3a3a"], why: "PLAYED ERNIE MCCRACKEN, THE TOUR'S VILLAIN, IN KINGPIN (1996). THE DEPARTMENT RATES THE HAIR SEPARATELY." },
  { key: "woody-harrelson", name: "WOODY HARRELSON", rating: 74, died: null, kit: ["#2f6fbf", "#d8c8a0"], why: "PLAYED ROY MUNSON, A PRODIGY WHO LOST A HAND TO THE GAME, IN KINGPIN (1996). BOTH HANDS ARE ON FILE." },
  { key: "richard-nixon", name: "RICHARD NIXON", rating: 68, died: "1994-04-22", kit: ["#1f2f5a", "#2a2a2a"], why: "HAD A ONE-LANE ALLEY BUILT UNDER THE WHITE HOUSE IN 1969. BOWLED ALONE, LATE. THE SHEETS WERE KEPT." },
  { key: "john-goodman", name: "JOHN GOODMAN", rating: 64, died: null, kit: ["#c8b070", "#4a4a4a"], why: "PLAYED WALTER SOBCHAK IN THE BIG LEBOWSKI (1998). THE FOUL LINE IS ENFORCED HERE BY MACHINE." },
  { key: "steve-buscemi", name: "STEVE BUSCEMI", rating: 58, died: null, kit: ["#3a7a5a", "#2a2a2a"], why: "PLAYED DONNY IN THE BIG LEBOWSKI (1998), WHO STRIKES A GREAT DEAL. THE DEPARTMENT RATES THE ACTOR." },
  { key: "barack-obama", name: "BARACK OBAMA", rating: 16, died: null, kit: ["#e6e6e6", "#2a2a3a"], why: "BOWLED A 37 IN SEVEN FRAMES IN ALTOONA, PENNSYLVANIA, IN 2008. THE DEPARTMENT KEPT THE SHEET." },
  { key: "league-secretary", name: "THE LEAGUE SECRETARY", rating: 90, died: null, regular: true, kit: ["#a02828", "#1a1a1a"], why: "AVERAGES 212 ON TUESDAYS. KEEPS THE BOOK. THE BOOK IS LOGGED." },
  { key: "party-guest", name: "A BIRTHDAY PARTY GUEST", rating: 8, died: null, regular: true, easy: true, bumpers: true, kit: ["#f0a020", "#3050a0"], why: "AGED NINE. BUMPERS UP. HAS HAD THREE SLICES AND A BLUE DRINK." },
];
export const OPP_BY_KEY = new Map(OPPONENTS.map(o => [o.key, o]));
export const EASIEST = "party-guest";

// What they do, in the Department's hand (for everyone: the living never speak, the dead are not
// given words). moment: start, strike, spare, split, gutter, win, lose.
const ACTS = {
  start: ["WIPES THE BALL ON A TOWEL, TWICE.", "CHECKS THE ARROWS. CHECKS THEM AGAIN.", "TAKES THE APPROACH AND WAITS FOR THE LANE TO CLEAR."],
  strike: ["TURNS AWAY BEFORE THE PINS LAND.", "WALKS BACK WITHOUT LOOKING."],
  spare: ["NODS AT THE PINSETTER.", "MARKS IT."],
  split: ["STARES AT THE GAP.", "ASKS THE MACHINE FOR NOTHING."],
  gutter: ["LOOKS AT THE BALL RETURN AS IF IT WERE RESPONSIBLE."],
  win: ["SHAKES YOUR HAND AND RETURNS THE SHOES.", "SIGNS THE SHEET."],
  lose: ["SHAKES YOUR HAND AND RETURNS THE SHOES.", "SIGNS THE SHEET, SLOWLY."],
};
export function actFor(o, moment, pick = 0) {
  if (!o) return null;
  const pool = ACTS[moment];
  return pool ? `${o.name} ${pool[pick % pool.length]}` : null;
}
