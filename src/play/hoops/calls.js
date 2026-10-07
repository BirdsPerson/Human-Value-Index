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
  shootfoul: ["FOUL ON {N}. THE SHOOTER WAS TOUCHED. TOUCHING IS REGULATED.", "SHOOTING FOUL, {N}. THE LINE HAS BEEN BOOKED."],
  reachfoul: ["REACH-IN BY {N}. THE HAND WENT WHERE IT WAS NOT INVITED.", "FOUL, {N}. REACHING IS A FORM OF WANTING."],
  blockfoul: ["BLOCKING FOUL ON {N}. THE FEET WERE STILL MOVING. THE FEET ARE ON FILE."],
  charge: ["CHARGE. {N} RAN THROUGH A SET MAN. THE MAN WAS SET BY THE DEPARTMENT.", "OFFENSIVE FOUL, {N}. POSSESSION IS REVOKED."],
  loosefoul: ["LOOSE-BALL FOUL ON {N}. THE FLOOR WAS CONTESTED IMPROPERLY."],
  standin: ["{N} IS ON THE FLOOR. A STAND-IN HAS BEEN ISSUED FOR THE FOULED-OUT."],
  ftviolation: ["TEN SECONDS AT THE LINE. NO SHOT. HESITATION HAS BEEN LOGGED."],
  ankles: ["{N} IS ON THE FLOOR. THE ANKLES HAVE BEEN REASSIGNED.", "{N} WENT THE WRONG WAY. THE CROWD NOTICED. SO DID WE."],
  lostball: ["{N} LOSES THE HANDLE. THE BALL HAS LEFT THE ARRANGEMENT."],
  strip: ["STRIPPED BY {N} AT THE RIM. THE DUNK IS DENIED A HEARING."],
  alleyoop: ["ALLEY-OOP TO {N}. THE AIR SPACE WAS CLEARED IN ADVANCE.", "{N} CATCHES IT AT THE RIM AND PUTS IT THROUGH. THE LOB WAS PRE-APPROVED."],
  deflect: ["DEFLECTED BY {N}. THE PASS HAS BEEN INTERRUPTED.", "{N} GETS A HAND ON IT. THE BALL IS NOW EVERYONE'S."],
  // the street game (3v3, 1v1, the half court)
  one: ["{N}. ONE. THE STREET COUNTS IN ONES.", "A BUCKET FOR {N}. ONE POINT, FILED."],
  streettwo: ["{N} FROM BEYOND THE ARC. TWO, ON THE STREET.", "TWO FOR {N}. DISTANCE IS DOUBLED HERE."],
  noclear: ["{N} DID NOT TAKE IT BACK. THE BASKET IS DISALLOWED. THE ARC IS A BORDER.", "NOT CLEARED. {N} SHOT FROM THE WRONG SIDE OF THE RULES."],
  check: ["CHECK BALL. {T} AT THE TOP.", "THE BALL IS CHECKED. {T} HAS IT."],
  // v5: the possession's violations
  eightsec: ["EIGHT SECONDS. {N} DID NOT CROSS IN TIME. {T} BALL. THE HALF LINE HAS A DEADLINE.", "BACKCOURT VIOLATION: EIGHT SECONDS. THE DEPARTMENT COUNTED EVERY ONE."],
  backcourt: ["OVER AND BACK. {N} RETURNED TO A HALF ALREADY LEFT. {T} BALL.", "BACKCOURT. ONCE ACROSS, ALWAYS ACROSS. THE DEPARTMENT ADMIRES COMMITMENT."],
  threesec: ["THREE SECONDS IN THE LANE. {N} OVERSTAYED. {T} BALL.", "{N} LINGERED IN THE PAINT. LOITERING IS LOGGED. {T} BALL."],
  fivesec: ["FIVE SECONDS. THE THROW-IN NEVER CAME. {T} BALL.", "FIVE-SECOND VIOLATION. NOBODY ASKED FOR THE BALL. THE BALL HAS BEEN REASSIGNED."],
};
const KEYS = new Set(Object.keys(L));
const VIOL = new Set(["eightsec", "backcourt", "threesec", "fivesec"]);
export const CALLED = KEYS;

// note: {k, g, team}; names: [10] shown names; teams: [2] team names. -> string | null
export function callFor(note, names, teams, pick = 0) {
  if (!note || !KEYS.has(note.k)) return null;
  const pool = L[note.k], line = pool[Math.abs(pick | 0) % pool.length];
  const N = note.g >= 0 ? names[note.g] || "A PLAYER" : "A PLAYER";
  const T = note.k === "oob" || note.k === "shotclock" || VIOL.has(note.k) ? teams[1 - (note.team >= 0 ? note.team : 0)] || "THE OTHER SIDE" : teams[note.team >= 0 ? note.team : 0] || "";
  return line.replaceAll("{N}", N).replaceAll("{T}", T);
}
const FOULS = new Set(["shootfoul", "reachfoul", "blockfoul", "charge", "loosefoul"]);
// The crowd's answer to an event: cheer, groan, boo (a call against the home side: team is the
// fouler's), hush (a free throw), or nothing.
export function crowdFor(k, team = -1) {
  if (FOULS.has(k)) return team === 0 ? "boo" : "stand";
  if (k === "ftset") return "hush";
  if (k === "dunk" || k === "three" || k === "block" || k === "ankles" || k === "alleyoop") return "cheer";
  if (k === "two" || k === "one" || k === "streettwo" || k === "steal" || k === "intercept" || k === "deflect") return "stand";
  if (k === "airball" || k === "shotclock" || k === "rimout" || VIOL.has(k)) return "groan";
  return null;
}
// Every line, for the check (no quotation marks, no one speaking).
export const ALL_LINES = Object.values(L).flat();
