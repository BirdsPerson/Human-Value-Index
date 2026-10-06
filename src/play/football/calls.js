// THE BOWL, playable: the Overlord's calls. Pure. The sim's last notable event (st.note) -> one
// caption line in the Department's voice, about the play. Nobody on the field speaks and nobody is
// quoted: the figures are named, what they did is described, and the Department comments on it.

const L = {
  toss: ["THE COIN HAS BEEN TOSSED. {T} RECEIVE. THE COIN DID NOT CONSENT."],
  kickoff: ["KICKOFF. THE BALL HAS BEEN DISPATCHED.", "{N} KICKS OFF. THE BALL IS NOW EVERYONE'S PROBLEM."],
  touchback: ["TOUCHBACK. NOBODY RAN. EFFICIENT.", "TOUCHBACK. THE BALL IS PLACED BY THE DEPARTMENT."],
  td: ["TOUCHDOWN, {N}. SIX POINTS, FILED.", "{N} IN THE END ZONE. SIX POINTS. THE END ZONE HAS BEEN NOTIFIED.", "TOUCHDOWN. {N}. CELEBRATION IS PERMITTED WITHIN LIMITS."],
  tdret: ["{N} TAKES IT ALL THE WAY. THE COVERAGE UNIT WILL BE REVIEWED."],
  patgood: ["THE EXTRA POINT IS GOOD. A FORMALITY, COMPLETED."],
  patmiss: ["THE EXTRA POINT IS NO GOOD. A FORMALITY, FAILED. NOTED."],
  goingfor2: ["{T} GO FOR TWO. AMBITION HAS BEEN LOGGED."],
  twogood: ["THE TWO-POINT TRY IS GOOD."],
  twofail: ["THE TWO-POINT TRY FAILS. AMBITION, DENIED."],
  fggood: ["{N}. THE KICK IS GOOD. THREE POINTS ALLOCATED.", "FIELD GOAL, {N}. BETWEEN THE POSTS, AS REQUIRED."],
  fgmiss: ["{N} MISSES. THE POSTS STOOD WHERE THEY ALWAYS STAND.", "NO GOOD. {N} WILL BE ASKED ABOUT IT."],
  sack: ["SACKED. {N}. THE POCKET WAS A SUGGESTION.", "{N} BRINGS DOWN THE PASSER. LOSS ON THE PLAY.", "SACK, {N}. THE PASSER HAS BEEN DOWNGRADED."],
  int: ["INTERCEPTED. {N}. THE PASS HAS BEEN REASSIGNED.", "PICKED OFF BY {N}. THE INTENDED RECIPIENT WAS NOT."],
  fumble: ["FUMBLE. THE BALL IS LOOSE. SO IS DISCIPLINE.", "IT IS ON THE GROUND. PROPERTY IS UNCLAIMED."],
  recover: ["{N} RECOVERS. POSSESSION HAS CHANGED HANDS."],
  recoverown: ["{N} FALLS ON IT. POSSESSION RETAINED."],
  muff: ["MUFFED BY {N}. THE BALL HAS OPINIONS."],
  pbu: ["BROKEN UP BY {N}. DENIAL IS A SERVICE.", "{N} GETS A HAND IN. INCOMPLETE."],
  drop: ["DROPPED BY {N}. HANDS ARE MONITORED.", "{N} HAD IT. HAD."],
  w_inc: ["INCOMPLETE. THE CLOCK STOPS.", "INCOMPLETE. NOTHING CHANGES HANDS."],
  away: ["{N} THROWS IT AWAY. DISCRETION, ON FILE."],
  first: ["FIRST DOWN, {T}. THE CHAINS COMPLY.", "FIRST DOWN. THE CHAINS ARE MOVED BY THE DEPARTMENT."],
  downs: ["TURNOVER ON DOWNS. {T} TAKE OVER.", "STOPPED. {T} TAKE OVER. FOUR ATTEMPTS IS THE ALLOWANCE."],
  punt: ["{N} PUNTS. AMBITION DEFERRED.", "THE PUNT. THE OFFENCE HAS CHOSEN SURRENDER, TACTICALLY."],
  safety: ["SAFETY. TWO POINTS TO {T}. IT WAS THE WRONG END ZONE."],
  bighit: ["{N} DELIVERS THE HIT. IT HAS BEEN FELT AND RECORDED.", "CONTACT. {N}. THE CROWD IS PERMITTED TO WINCE."],
  juked: ["{N} MAKES A MAN MISS. THE MAN HAS BEEN NOTED."],
  spun: ["{N} SPINS FREE. ROTATION IS NOT AN OFFENCE."],
  truck: ["{N} RUNS THROUGH HIM. HE WAS IN THE WAY."],
  timeout: ["TIMEOUT, {T}. TIME HAS BEEN PURCHASED."],
  warning: ["THE WARNING. THE CLOCK STOPS TO REFLECT."],
  quarter: ["END OF THE QUARTER. THE DEPARTMENT DOES NOT REST."],
  half: ["HALFTIME. THE BAND HAS BEEN DISMISSED."],
  overtime: ["LEVEL. OVERTIME. THE NEXT SCORE WINS."],
  final: ["FINAL. THE RESULT COUNTS FOR NOTHING."],
  change: ["{T} TAKE OVER."],
  kooob: ["THE KICKOFF GOES OUT OF BOUNDS. {T} BALL AT THEIR FORTY."],
  audible: ["AUDIBLE AT THE LINE. PLANS ARE PROVISIONAL."],
  hot: ["{N} IS SENT DEEP. HE WAS NOT CONSULTED."],
  declined: ["THE FLAG IS DECLINED. THE PLAY STANDS."],
  defTwo: ["THE DEFENCE RETURNS IT. TWO POINTS. RARE. FILED TWICE."],
};
const PEN = {
  hold: "HOLDING, {N}. TEN YARDS. EMBRACES ARE RESTRICTED.",
  pi: "PASS INTERFERENCE, {N}. THE BALL AT THE SPOT. CONTACT REQUIRES A PERMIT.",
  offside: "OFFSIDE, {N}. FIVE YARDS. PATIENCE IS MANDATORY.",
  falsestart: "FALSE START, {N}. FIVE YARDS. MOVEMENT WAS NOT AUTHORISED.",
  delay: "DELAY OF GAME. FIVE YARDS. THE CLOCK DOES NOT WAIT.",
};
export const PEN_NAMES = { hold: "HOLDING", pi: "PASS INTERFERENCE", offside: "OFFSIDE", falsestart: "FALSE START", delay: "DELAY OF GAME" };

// note: {k, g, team, yds, ...}; names: [22] shown names; teams: [2] team names. -> string | null
export function callFor(note, names, teams, pick = 0) {
  if (!note) return null;
  let k = note.k, line = null;
  const N = note.g >= 0 ? names[note.g] || "A PLAYER" : "A PLAYER";
  const T = teams[note.team >= 0 ? note.team : 0] || "";
  if (k === "penalty") line = (PEN[note.fk] || "FLAG.") + (note.first ? " AUTOMATIC FIRST DOWN." : "");
  else if (k === "w_down" || k === "w_oob") {
    if (note.turnover || note.sack) return null;
    const y = note.yds;
    if (y == null) return null;
    const who = N;
    if (y >= 20) line = `${who}, ${y} YARDS. A GAIN OF NOTE. IT HAS BEEN NOTED.`;
    else if (y > 0) line = `${who} FOR ${y}${k === "w_oob" ? ", OUT OF BOUNDS" : ""}.`;
    else if (y === 0) line = `${who}, NO GAIN. STASIS, ACHIEVED.`;
    else line = `${who} LOSES ${-y}. REGRESSION IS ON FILE.`;
  } else if (k === "td" && note.ret) k = "tdret";
  if (!line) {
    const pool = L[k];
    if (!pool) return null;
    line = pool[Math.abs(pick | 0) % pool.length];
  }
  return line.replaceAll("{N}", N).replaceAll("{T}", T);
}
// The crowd is the home side's (team 0, yours): -> a crowdAudio kind or null.
export function crowdFor(note) {
  if (!note) return null;
  const mine = note.team === 0;
  switch (note.k) {
    case "td": return mine ? "roar" : "groan";
    case "safety": return mine ? "roar" : "groan";
    case "int": return mine ? "roar" : "groan";
    case "recover": return mine ? "cheer" : "groan";
    case "sack": return mine ? "cheer" : "aww";
    case "bighit": return "ooh";
    case "fggood": return mine ? "cheer" : "thin";
    case "fgmiss": return mine ? "groan" : "cheer";
    case "first": return mine ? "polite" : null;
    case "downs": return mine ? "cheer" : "groan";
    case "juked": case "spun": case "truck": return "ooh";
    case "patgood": case "twogood": return mine ? "warm" : null;
    case "w_down": return note.yds >= 20 ? "cheer" : null;
    case "final": return "warm";
    default: return null;
  }
}
// A word across the picture for the big moments.
export function bannerFor(note) {
  if (!note) return null;
  const B = { td: "TOUCHDOWN", int: "INTERCEPTED", fumble: "FUMBLE", sack: "SACK", safety: "SAFETY", fggood: "IT IS GOOD", fgmiss: "NO GOOD", patmiss: "NO GOOD", downs: "TURNOVER ON DOWNS", touchback: "TOUCHBACK", first: "FIRST DOWN", bighit: "BIG HIT", penalty: "FLAG", half: "HALFTIME", overtime: "OVERTIME", final: "FINAL", twogood: "TWO POINTS", w_inc: "INCOMPLETE", warning: "THE WARNING" };
  const t = B[note.k];
  if (!t) return null;
  const c = note.k === "penalty" ? "#ffe14a" : note.k === "td" || note.k === "fggood" ? "#5cff8a" : note.k === "int" || note.k === "fumble" ? "#ff6a5a" : "#f2efe6";
  return { text: t, c };
}
export const ALL_LINES = [...Object.values(L).flat(), ...Object.values(PEN)];
