// Who will play you at THE TENNIS CLUB. Pure. The figures are the club's tennis players on file
// (src/city/tennis.js TENNIS_ON_FILE: the same slugs and ratings; scripts/check-tennis.mjs holds
// them equal, so the city's sim stays out of this page's bundle), then two of the club's own,
// nameless, for anyone who would like to win a game.
//
// Content rules (the chess tables'): the living appear and play and never speak; what they do is
// written in the Department's hand. The dead may say a pre-written line at the start and the end.
import { cpuProfile } from "./sim.js";

// kit: [shirt, shorts] (avatar CLOTH colours). spec: a regular's procedural file photo.
export const OPPONENTS = [
  { key: "serena-williams", name: "SERENA WILLIAMS", rating: 98, died: null, kit: ["#d977a8", "#262626"] },
  { key: "venus-williams", name: "VENUS WILLIAMS", rating: 93, died: null, kit: ["#e0c040", "#e6e6e6"] },
  { key: "john-mcenroe", name: "JOHN MCENROE", rating: 92, died: null, kit: ["#e6e6e6", "#1f2f5a"] },
  { key: "arthur-ashe", name: "ARTHUR ASHE", rating: 91, died: "1993-02-06", kit: ["#e6e6e6", "#e6e6e6"] },
  { key: "club-pro", name: "THE CLUB PRO", rating: 62, died: null, regular: true, note: "HITTING PARTNER GRADE. PAID BY THE HOUR. THE HOUR IS LOGGED.", kit: ["#3c8a46", "#e6e6e6"],
    spec: { skin: "light_tan", hair_style: "short", hair_color: "blonde", build: "average", top_color: "green", bottom_color: "white", facial_hair: "none", accessory: "cap" } },
  { key: "line-judge", name: "A LINE JUDGE ON A DAY OFF", rating: 40, died: null, regular: true, note: "HAS CALLED TWELVE THOUSAND BALLS. HAS HIT ELEVEN.", kit: ["#1f2f5a", "#8a8a8a"],
    spec: { skin: "porcelain", hair_style: "side_part", hair_color: "white", build: "average", top_color: "navy", bottom_color: "grey", facial_hair: "none", accessory: "none" } },
];
export const OPP_BY_KEY = new Map(OPPONENTS.map(o => [o.key, o]));
export const profileOf = (key) => { const o = OPP_BY_KEY.get(key); return o ? cpuProfile(o.rating) : null; };
export const spriteOf = (o) => (o.spec ? null : `/api/sprite/${o.key}`);

// The dead: written lines only, about the game, never the opponent.
const LINES = {
  "arthur-ashe": {
    start: "Start where you are. Use what you have. Do what you can. Serve.",
    win: "Success is a journey, not a destination. Shake hands at the net.",
    lose: "Well played. The handshake is the part they remember.",
  },
};
// The living, and the club's own: what they do, in the Department's hand.
const ACTS = {
  start: ["TAKES THE FAR BASELINE AND BOUNCES THE BALL FOUR TIMES.", "SETS THE STRINGS STRAIGHT, ONE BY ONE.", "STANDS AT THE FAR BASELINE AND WAITS."],
  win: ["WALKS TO THE NET AND OFFERS A HAND.", "PACKS THE RACKET WITHOUT A WORD."],
  lose: ["WALKS TO THE NET AND OFFERS A HAND.", "NODS ONCE, AND TOWELS OFF."],
};
// -> {kind: "say" | "act", text} | null. moment: start, win (the CPU won), lose.
export function talkFor(o, moment, pick = 0) {
  if (!o) return null;
  if (o.died) { const t = LINES[o.key]?.[moment]; return t ? { kind: "say", text: t } : null; }
  const pool = ACTS[moment];
  return pool ? { kind: "act", text: `${o.name} ${pool[pick % pool.length]}` } : null;
}
