// Who will play you at THE TENNIS CLUB. Pure. The figures are the club's tennis players on file
// (src/city/tennis.js TENNIS_ON_FILE: the same slugs and ratings; scripts/check-tennis.mjs holds
// them equal, so the city's sim stays out of this page's bundle), then two of the club's own,
// nameless, for anyone who would like to win a game.
//
// Content rules (the chess tables'): the living appear and play and never speak; what they do is
// written in the Department's hand. The dead may say a pre-written line at the start and the end.
import { cpuProfile } from "./sim.js";

// kit: [shirt, shorts] (avatar CLOTH colours). spec: a regular's procedural file photo. hint: avatar
// fields for a figure whose likeness is not drawn yet (pendingSpec).
export const OPPONENTS = [
  { key: "serena-williams", hon: "MS.", temper: 0.6, name: "SERENA WILLIAMS", rating: 98, died: null, kit: ["#d977a8", "#262626"], hint: { skin: "brown", hair_style: "bun", hair_color: "black", top_color: "pink", bottom_color: "black" } },
  { key: "venus-williams", hon: "MS.", temper: 0.3, name: "VENUS WILLIAMS", rating: 93, died: null, kit: ["#e0c040", "#e6e6e6"], hint: { skin: "brown", hair_style: "ponytail", hair_color: "black", top_color: "yellow", bottom_color: "white" } },
  { key: "john-mcenroe", hon: "MR.", hand: "L", temper: 0.97, name: "JOHN MCENROE", rating: 92, died: null, kit: ["#e6e6e6", "#1f2f5a"] },
  { key: "arthur-ashe", hon: "MR.", temper: 0.08, name: "ARTHUR ASHE", rating: 91, died: "1993-02-06", kit: ["#e6e6e6", "#e6e6e6"] },
  { key: "club-pro", hon: "", temper: 0.3, name: "THE CLUB PRO", rating: 62, died: null, regular: true, note: "HITTING PARTNER GRADE. PAID BY THE HOUR. THE HOUR IS LOGGED.", kit: ["#3c8a46", "#e6e6e6"],
    spec: { skin: "light_tan", hair_style: "short", hair_color: "blonde", build: "average", top_color: "green", bottom_color: "white", facial_hair: "none", accessory: "cap" } },
  { key: "line-judge", hon: "", temper: 0.03, name: "A LINE JUDGE ON A DAY OFF", rating: 40, died: null, regular: true, note: "HAS CALLED TWELVE THOUSAND BALLS. HAS HIT ELEVEN.", kit: ["#1f2f5a", "#8a8a8a"],
    spec: { skin: "porcelain", hair_style: "side_part", hair_color: "white", build: "average", top_color: "navy", bottom_color: "grey", facial_hair: "none", accessory: "none" } },
  // the first-timer's opponent: slower than the scale goes (cpuProfile floors at rating 30), late to
  // the ball, loose with it. A point is there to be won.
  { key: "new-member", hon: "", temper: 0.2, name: "A NEW MEMBER", rating: 20, died: null, regular: true, easy: true, note: "JOINED THIS MORNING. HAS READ THE RULES ONCE.", kit: ["#e6e6e6", "#3c8a46"],
    profile: { rating: 20, sk: 0, speed: 3.4, react: 34, acc: 0.3, power: 0.3, judge: 0.3, reach: 0.9 },
    spec: { skin: "tan", hair_style: "curly", hair_color: "dark_brown", build: "average", top_color: "white", bottom_color: "green", facial_hair: "none", accessory: "none" } },
];
export const OPP_BY_KEY = new Map(OPPONENTS.map(o => [o.key, o]));
// temper (0..1): how readily they challenge a call they cannot be sure of (version 3). Hand-set from
// the public record: one of them is famous for it; the line judge on a day off trusts colleagues.
export const profileOf = (key) => { const o = OPP_BY_KEY.get(key); return o ? { ...(o.profile ? o.profile : cpuProfile(o.rating)), temper: o.temper ?? 0.3 } : null; };
// What the chair calls them: "MS. SERENA WILLIAMS", "THE CLUB PRO". A SUBJECT's form of address is
// not on file, so the chair reads both.
export const formalName = (o, name) => (o ? (o.hon ? `${o.hon} ${o.name}` : o.name) : `MR./MS. ${name}`);
export const EASIEST = "new-member";
export const spriteOf = (o) => (o.spec ? null : `/api/sprite/${o.key}`);
// The file photo to paint while a figure's likeness is pending (/api/sprite answers 404): their
// hint over the default, near enough to themselves; null for everyone else.
export const pendingSpec = (o, base) => (o?.hint ? { ...base, ...o.hint } : null);

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
