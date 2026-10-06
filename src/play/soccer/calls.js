// THE ESTATE PITCH, playable: the captions. Pure. The sim's last notable event (st.note) -> one plain
// caption line, like a match broadcast's (2026-10-06: in-play copy is plain and game-like; the
// Department's voice stays off the pitch). Nobody speaks and nobody is quoted: the players are named and
// what they did is described. pick: a number that varies the line (the page passes the event's frame).

const L = {
  kickoff: ["KICK-OFF."],
  secondhalf: ["THE SECOND HALF IS UNDER WAY. THE TEAMS HAVE CHANGED ENDS."],
  extratime: ["EXTRA TIME. TWO HALVES OF FIFTEEN."],
  goal: ["GOAL! {N}.", "{N} SCORES FOR {T}.", "GOAL FOR {T}. {N} FINISHES IT.", "{N}. IN THE NET."],
  owngoal: ["AN OWN GOAL. {N} TURNS IT INTO HIS OWN NET.", "{N} PUTS IT PAST HIS OWN KEEPER."],
  save: ["SAVED BY {N}.", "{N} GETS A HAND TO IT.", "PUSHED AWAY BY {N}."],
  catch: ["{N} HOLDS IT.", "CAUGHT BY {N}."],
  post: ["OFF THE POST!", "IT HITS THE WOODWORK."],
  bar: ["OFF THE BAR!"],
  block: ["BLOCKED BY {N}.", "{N} GETS IN THE WAY."],
  foul: ["FREE KICK. A FOUL BY {N}.", "FOUL BY {N}.", "{N} BRINGS HIM DOWN."],
  penfoul: ["PENALTY! {N} FOULS HIM IN THE AREA.", "A PENALTY, GIVEN AWAY BY {N}."],
  yellow: ["YELLOW CARD FOR {N}."],
  second: ["A SECOND YELLOW. {N} IS SENT OFF."],
  red: ["RED CARD. {N} IS SENT OFF."],
  offside: ["OFFSIDE. {N} WAS BEYOND THE LAST DEFENDER.", "THE FLAG IS UP. {N} IS OFFSIDE."],
  corner: ["CORNER TO {T}."],
  wall: ["IT HITS THE WALL."],
  fkshot: ["{N} STANDS OVER THE FREE KICK."],
  tackle: ["{N} WINS THE BALL."],
  slide: ["A SLIDING TACKLE FROM {N}. CLEAN."],
  stepover: ["A STEP-OVER BY {N}."],
  roulette: ["{N} SPINS AWAY."],
  heelflick: ["{N} FLICKS IT ON WITH THE HEEL."],
  ballroll: ["{N} ROLLS IT ACROSS HIMSELF."],
  fakeshot: ["{N} SHAPES TO SHOOT, AND DOES NOT."],
  stumble: ["{N} TRIES A TRICK AND LOSES HIS FOOTING."],
  halftime: ["HALF TIME."],
  etbreak: ["HALFWAY THROUGH EXTRA TIME."],
  "fulltime-level": ["LEVEL AT FULL TIME. EXTRA TIME."],
  shootout: ["PENALTIES. FIVE EACH, THEN SUDDEN DEATH."],
  pengoal: ["{N} SCORES FROM THE SPOT.", "{N} CONVERTS THE PENALTY."],
  penmiss: ["{N} MISSES THE PENALTY.", "MISSED. {N} DOES NOT SCORE."],
  added: ["THE BOARD GOES UP: {M} ADDED."],
  final: ["FULL TIME."],
};
const KEYS = new Set(Object.keys(L));
export const CALLED = KEYS;

// note: {k, g, team, card, mins}; names: [22] shown names; teams: [2] team names. -> string | null
export function callFor(note, names, teams, pick = 0) {
  if (!note) return null;
  let k = note.k;
  if ((k === "foul" || k === "penfoul") && note.card) k = note.card === "second" ? "second" : note.card;
  if (!KEYS.has(k)) return null;
  const pool = L[k], line = pool[Math.abs(pick | 0) % pool.length];
  const N = note.g >= 0 ? names[note.g] || "A PLAYER" : "A PLAYER";
  const T = teams[note.team >= 0 ? note.team : 0] || "";
  return line.replaceAll("{N}", N).replaceAll("{T}", T).replaceAll("{M}", `${note.mins || 1} MINUTE${note.mins === 1 ? "" : "S"}`);
}
// The crowd's answer to an event: a crowdAudio kind, or nothing. us: the event's side is the home crowd's.
export function crowdFor(k, us = true) {
  if (k === "goal") return us ? "roar" : "groan";
  if (k === "owngoal") return "groan";
  if (k === "post" || k === "bar" || k === "save") return "ooh";
  if (k === "pengoal") return us ? "cheer" : "aww";
  if (k === "penmiss") return us ? "groan" : "cheer";
  if (k === "foul" || k === "penfoul" || k === "offside") return "thin";
  if (k === "final" || k === "halftime") return "polite";
  if (k === "stepover" || k === "heelflick" || k === "roulette") return "warm";
  return null;
}
// Every line, for the check (no quotation marks, no one speaking).
export const ALL_LINES = Object.values(L).flat();
