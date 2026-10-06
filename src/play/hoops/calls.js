// THE COURTS, playable: the Overlord's calls. Pure. The sim's last notable event (st.note) -> one
// caption line in the Department's voice, about the play. Nobody on the floor speaks and nobody is
// quoted: the figures are named, what they did is described, and the Department comments on it.
// pick: a number that varies the line (the page passes the frame of the event).

const L = {
  tip: ["{N} WINS THE TIP. POSSESSION HAS BEEN ASSIGNED.", "THE TIP GOES TO {T}. THE DEPARTMENT ALLOWS IT."],
  two: ["{N}. TWO POINTS. LOGGED.", "{N} SCORES. TWO POINTS, PROVISIONALLY.", "TWO FOR {N}. THE BOARD AGREES."],
  three: ["{N} FROM DISTANCE. THREE POINTS. THE DISTANCE HAS BEEN MEASURED.", "THREE FOR {N}. THE ARC IS RESPECTED.", "{N}, FROM DOWNTOWN. DOWNTOWN IS A DISTRICT."],
  dunk: ["{N}, AT THE RIM. FORCE NOTED. FORCE IS TAXED.", "SLAM. {N}. THE RIM HAS FILED A COMPLAINT.", "{N} DUNKS. THE CROWD IS PERMITTED TO RISE."],
  block: ["REJECTED BY {N}. THE DEPARTMENT ALSO REJECTS.", "{N} BLOCKS IT. DENIAL IS A SERVICE.", "BLOCKED. {N} DECLINES THE SHOT ON THE SHOOTER'S BEHALF."],
  steal: ["{N} TAKES IT. PROPERTY HAS CHANGED HANDS.", "STOLEN BY {N}. NO REPORT WILL BE FILED."],
  intercept: ["PICKED OFF BY {N}. THE PASS WAS NOT AUTHORISED.", "{N} READS THE PASS. READING IS ENCOURAGED."],
  airball: ["AIRBALL. THE CROWD HAS BEEN PERMITTED TO GROAN.", "AIRBALL FROM {N}. THE RIM WAS NOT CONSULTED."],
  shotclock: ["SHOT CLOCK VIOLATION. TIME IS NOT YOURS TO SPEND.", "THE SHOT CLOCK EXPIRES. SO DOES THE POSSESSION."],
  oob: ["OUT OF BOUNDS. THE LINES ARE ENFORCED.", "OUT. {T} BALL. THE LINES WERE PAINTED FOR A REASON."],
  rimout: ["{N} HANGS ON THE RIM. NOTHING FALLS. THE RIM HOLDS.", "OFF THE BACK IRON. {N} WILL BE REMEMBERED FOR THE ATTEMPT."],
  oreb: ["{N} WITH THE OFFENSIVE BOARD. A SECOND CHANCE HAS BEEN ISSUED."],
  dreb: ["{N} CLEARS THE GLASS."],
  period: ["END OF THE QUARTER. THE CLOCK RESTS. THE DEPARTMENT DOES NOT."],
  overtime: ["LEVEL AT THE BUZZER. OVERTIME HAS BEEN SCHEDULED."],
  final: ["THE BUZZER. THE RESULT IS FINAL AND COUNTS FOR NOTHING."],
};
const KEYS = new Set(Object.keys(L));
export const CALLED = KEYS;

// note: {k, g, team}; names: [10] shown names; teams: [2] team names. -> string | null
export function callFor(note, names, teams, pick = 0) {
  if (!note || !KEYS.has(note.k)) return null;
  const pool = L[note.k], line = pool[Math.abs(pick | 0) % pool.length];
  const N = note.g >= 0 ? names[note.g] || "A PLAYER" : "A PLAYER";
  const T = note.k === "oob" || note.k === "shotclock" ? teams[1 - (note.team >= 0 ? note.team : 0)] || "THE OTHER SIDE" : teams[note.team >= 0 ? note.team : 0] || "";
  return line.replaceAll("{N}", N).replaceAll("{T}", T);
}
// The crowd's answer to an event: cheer, groan, or nothing.
export function crowdFor(k) {
  if (k === "dunk" || k === "three" || k === "block") return "cheer";
  if (k === "two" || k === "steal" || k === "intercept") return "stand";
  if (k === "airball" || k === "shotclock" || k === "rimout") return "groan";
  return null;
}
// Every line, for the check (no quotation marks, no one speaking).
export const ALL_LINES = Object.values(L).flat();
