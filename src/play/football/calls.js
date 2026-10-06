// THE BOWL, playable: the calls. Pure. The sim's last notable event (st.note) -> one caption line,
// plain play-by-play (Scott: the sports games give the Overlord a rest; the wink, if any, is kept
// for the final board). Nobody on the field speaks and nobody is quoted: the figures are named and
// what they did is described.

const L = {
  toss: ["{T} WIN THE TOSS AND WILL RECEIVE."],
  kickoff: ["KICKOFF.", "{N} KICKS OFF."],
  touchback: ["TOUCHBACK. FIRST AND TEN AT THE 25.", "TOUCHBACK."],
  td: ["TOUCHDOWN, {N}.", "{N} INTO THE END ZONE. TOUCHDOWN.", "TOUCHDOWN. {N}."],
  tdret: ["{N} TAKES IT ALL THE WAY BACK. TOUCHDOWN."],
  patgood: ["THE EXTRA POINT IS GOOD."],
  patmiss: ["THE EXTRA POINT IS NO GOOD."],
  goingfor2: ["{T} GO FOR TWO."],
  twogood: ["THE TWO-POINT TRY IS GOOD."],
  twofail: ["THE TWO-POINT TRY FAILS."],
  fggood: ["{N}. THE KICK IS GOOD.", "FIELD GOAL, {N}. RIGHT DOWN THE MIDDLE."],
  fgmiss: ["{N} MISSES. NO GOOD.", "NO GOOD. {N} PUSHES IT WIDE."],
  sack: ["SACKED. {N} GETS HOME.", "{N} BRINGS DOWN THE PASSER. LOSS ON THE PLAY.", "SACK, {N}."],
  int: ["INTERCEPTED. {N}.", "PICKED OFF BY {N}."],
  fumble: ["FUMBLE. THE BALL IS LOOSE.", "IT IS ON THE GROUND."],
  recover: ["{N} RECOVERS. CHANGE OF POSSESSION."],
  recoverown: ["{N} FALLS ON IT. THEY KEEP IT."],
  muff: ["MUFFED BY {N}. THE BALL IS LOOSE."],
  pbu: ["BROKEN UP BY {N}.", "{N} GETS A HAND IN. INCOMPLETE."],
  drop: ["DROPPED BY {N}.", "{N} HAD IT AND LET IT GO."],
  w_inc: ["INCOMPLETE. THE CLOCK STOPS.", "INCOMPLETE."],
  away: ["{N} THROWS IT AWAY."],
  first: ["FIRST DOWN, {T}.", "FIRST DOWN. THE CHAINS MOVE."],
  downs: ["TURNOVER ON DOWNS. {T} TAKE OVER.", "STOPPED SHORT. {T} TAKE OVER ON DOWNS."],
  punt: ["{N} PUNTS.", "THE PUNT TEAM COMES ON. {N} KICKS IT AWAY."],
  safety: ["SAFETY. TWO POINTS TO {T}."],
  bighit: ["{N} LAYS THE HIT ON.", "BIG HIT BY {N}."],
  juked: ["{N} MAKES A MAN MISS."],
  spun: ["{N} SPINS OUT OF IT."],
  truck: ["{N} RUNS RIGHT THROUGH HIM."],
  timeout: ["TIMEOUT, {T}."],
  warning: ["TWO-MINUTE WARNING."],
  quarter: ["END OF THE QUARTER."],
  half: ["HALFTIME."],
  overtime: ["LEVEL AFTER FOUR. OVERTIME: NEXT SCORE WINS."],
  final: ["FINAL."],
  change: ["{T} TAKE OVER."],
  kooob: ["THE KICKOFF GOES OUT OF BOUNDS. {T} BALL AT THEIR 40."],
  audible: ["AUDIBLE AT THE LINE."],
  hot: ["{N} IS SENT DEEP."],
  declined: ["THE FLAG IS DECLINED. THE PLAY STANDS."],
  defTwo: ["THE DEFENCE RETURNS IT. TWO POINTS."],
};
const PEN = {
  hold: "HOLDING, {N}. TEN YARDS.",
  pi: "PASS INTERFERENCE, {N}. THE BALL AT THE SPOT.",
  offside: "OFFSIDE, {N}. FIVE YARDS.",
  falsestart: "FALSE START, {N}. FIVE YARDS.",
  delay: "DELAY OF GAME. FIVE YARDS.",
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
    if (y >= 20) line = `${who}, ${y} YARDS. BIG GAIN.`;
    else if (y > 0) line = `${who} FOR ${y}${k === "w_oob" ? ", OUT OF BOUNDS" : ""}.`;
    else if (y === 0) line = `${who}, NO GAIN.`;
    else line = `${who} LOSES ${-y}.`;
  } else if (k === "td" && note.ret) k = "tdret";
  if (!line) {
    const pool = L[k];
    if (!pool) return null;
    line = pool[Math.abs(pick | 0) % pool.length];
  }
  return line.replaceAll("{N}", N).replaceAll("{T}", T);
}
// The crowd is the home side's (sim team `home`: yours unless you chose to play away): -> a
// crowdAudio kind or null.
export function crowdFor(note, home = 0) {
  if (!note) return null;
  const mine = note.team === home;
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
  const B = { td: "TOUCHDOWN", int: "INTERCEPTED", fumble: "FUMBLE", sack: "SACK", safety: "SAFETY", fggood: "IT IS GOOD", fgmiss: "NO GOOD", patmiss: "NO GOOD", downs: "TURNOVER ON DOWNS", touchback: "TOUCHBACK", first: "FIRST DOWN", bighit: "BIG HIT", penalty: "FLAG", half: "HALFTIME", overtime: "OVERTIME", final: "FINAL", twogood: "TWO POINTS", w_inc: "INCOMPLETE", warning: "TWO-MINUTE WARNING" };
  const t = B[note.k];
  if (!t) return null;
  const c = note.k === "penalty" ? "#ffe14a" : note.k === "td" || note.k === "fggood" ? "#5cff8a" : note.k === "int" || note.k === "fumble" ? "#ff6a5a" : "#f2efe6";
  return { text: t, c };
}
export const ALL_LINES = [...Object.values(L).flat(), ...Object.values(PEN)];
