// THE ESTATE PITCH, playable: the Overlord's calls. Pure. The sim's last notable event (st.note) -> one
// caption line in the Department's voice, about the play. Nobody on the pitch speaks and nobody is
// quoted: the figures are named, what they did is described, and the Department comments on it.
// pick: a number that varies the line (the page passes the frame of the event).

const L = {
  kickoff: ["KICK-OFF. NINETY MINUTES HAVE BEEN ALLOCATED. FEWER WILL BE USED."],
  secondhalf: ["THE SECOND HALF. THE ENDS HAVE BEEN EXCHANGED FOR FAIRNESS, WHICH IS MONITORED."],
  extratime: ["EXTRA TIME. THE DEPARTMENT HAS FOUND THIRTY MORE MINUTES."],
  goal: ["GOAL. {N}. THE NET HAS BEEN DISTURBED.", "{N} SCORES FOR {T}. THE SCORE HAS BEEN AMENDED.", "GOAL FOR {T}. {N} IS CREDITED. CREDIT IS NOT CURRENCY.", "{N}. IN. THE ROAR IS WITHIN PERMITTED LIMITS."],
  owngoal: ["AN OWN GOAL. {N} HAS SCORED FOR THE WRONG DEPARTMENT.", "{N} PUTS IT PAST HIS OWN KEEPER. THE FILE WILL REMEMBER."],
  save: ["SAVED BY {N}. THE GOAL HAS BEEN DENIED A GOAL.", "{N} GETS A HAND TO IT. HANDS ARE PERMITTED HERE ONLY.", "PUSHED AWAY BY {N}. THE DANGER IS RESCHEDULED."],
  catch: ["{N} HOLDS IT. CUSTODY HAS BEEN TAKEN.", "CAUGHT BY {N}. NO FURTHER QUESTIONS."],
  post: ["OFF THE POST. THE POST HAS BEEN COMMENDED.", "THE WOODWORK. THE DEPARTMENT OWNS THE WOODWORK."],
  bar: ["OFF THE BAR. THE BAR IS HIGH. THE BAR IS ALWAYS HIGH."],
  block: ["BLOCKED BY {N}. THE BODY IS A WALL. THE WALL IS A BODY.", "{N} GETS IN THE WAY. OBSTRUCTION IS A SKILL."],
  foul: ["FREE KICK. {N} HAS BEEN NOTED.", "FOUL BY {N}. THE WHISTLE HAS BEEN USED.", "{N} BRINGS HIM DOWN. GRAVITY ASSISTED."],
  penfoul: ["PENALTY. {N} IN THE AREA. THE AREA IS NOT FOR THAT.", "THE SPOT. {N} HAS GIVEN IT AWAY. GIVING IS ENCOURAGED ELSEWHERE."],
  yellow: ["YELLOW CARD. {N} IS ON NOTICE. NOTICE IS PERMANENT."],
  second: ["A SECOND YELLOW. {N} IS DISMISSED. THE DOOR IS THAT WAY."],
  red: ["RED CARD. {N} IS REMOVED FROM THE PROCEEDINGS."],
  offside: ["OFFSIDE. {N} WAS BEYOND THE LINE. THE LINE IS NOT A SUGGESTION.", "THE FLAG IS UP. {N}, OFFSIDE. AMBITION HAS LIMITS."],
  corner: ["CORNER TO {T}. THE CORNER IS ASSIGNED."],
  wall: ["IT HITS THE WALL. THE WALL HOLDS. WALLS DO."],
  fkshot: ["{N} OVER THE BALL. THE WALL IS ASKED TO REMAIN STILL."],
  tackle: ["{N} WINS IT. POSSESSION HAS BEEN REASSIGNED."],
  slide: ["A SLIDING TACKLE FROM {N}. CLEAN. THE GRASS IS NOT."],
  stepover: ["A STEP-OVER BY {N}. THE LEGS WERE COUNTED. BOTH."],
  roulette: ["{N} SPINS AWAY. ROTATION IS PERMITTED."],
  heelflick: ["{N} WITH THE HEEL. THE HEEL HAS BEEN NOTED."],
  ballroll: ["{N} ROLLS IT ACROSS HIMSELF. LATERAL MOVEMENT IS NOT PROGRESS."],
  fakeshot: ["{N} SHAPES TO SHOOT. DOES NOT. DECEPTION IS LOGGED."],
  stumble: ["{N} ATTEMPTS A TRICK BEYOND HIS FILE. THE FILE WAS CORRECT."],
  halftime: ["HALF TIME. ORANGES ARE BEING ISSUED. ONE EACH."],
  etbreak: ["HALFWAY THROUGH EXTRA TIME. THE LEGS HAVE FILED A GRIEVANCE."],
  "fulltime-level": ["LEVEL AFTER NINETY. EXTRA TIME HAS BEEN SCHEDULED."],
  shootout: ["PENALTIES. THE DEPARTMENT WILL NOW DECIDE THIS BY LOTTERY WITH EXTRA STEPS."],
  pengoal: ["{N} SCORES FROM THE SPOT.", "{N}. CONVERTED. NERVE IS A MEASURABLE QUANTITY."],
  penmiss: ["{N} DOES NOT SCORE. THE SPOT REMEMBERS.", "MISSED. {N} WILL BE ASKED ABOUT THIS."],
  added: ["THE BOARD GOES UP. {M} ADDED. THE DEPARTMENT GIVES, RARELY."],
  final: ["FULL TIME. THE RESULT IS FINAL AND COUNTS FOR NOTHING."],
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
