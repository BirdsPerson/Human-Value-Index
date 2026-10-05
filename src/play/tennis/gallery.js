// THE TENNIS CLUB, playable: who is in the stand, and what the broadcast says about them. Pure.
// The pool is every figure on file (src/figures.js) who may sit (the park's rule, chess/roster.js
// barred(): no documented harm, no SOYLENT GREEN, threat under 80; kept here as a copy so the
// chess roster stays out of this chunk, and check-tennis holds the two equal), plus the
// club's tennis players who are not on court today, who come up on camera three times as often.
//
// Content rules (the club's): the camera may show anyone in the stand doing something (a cheer, a
// yawn, a hot dog, a look at the watch). Nobody in the stand speaks: no quotes, no reported speech.
// The living get a neutral line about their being there, in the Department's hand. The dead may
// get a Department gag, never about how they died; a short list gets the plain lines only.
import { FAMOUS_FIGURES, slugify } from "../../figures.js";
import { OPPONENTS } from "./roster.js";

// The chair: a Department official, not a person. It may speak; it is the only one who does.
export const UMPIRE = { key: "umpire", name: "ADJUDICATOR UNIT 40-LOVE", title: "THE CHAIR" };
const UMPIRE_NOTES = [
  "DEPARTMENT OFFICIAL. HAS NEVER OVERRULED ITSELF.",
  "NO HAWK-EYE. TWO EYES, BOTH THE DEPARTMENT'S.",
  "THE CHAIR WAS POURED AROUND IT. IT DOES NOT GET DOWN.",
  "SCORE ACCURACY 100%. THE DEPARTMENT CHECKED. THE CHAIR CHECKED THE DEPARTMENT.",
];

// The dead, by hand. Department notes only: what the file shows them doing in the stand.
const NOTES = {
  "albert-einstein": ["HAS NOT CLAPPED SINCE 1955.", "TIMING THE RALLY AGAINST HIS OWN CLOCK. THE CLOCKS DISAGREE."],
  "isaac-newton": ["CONFIRMS THE BALL COMES DOWN. HAS REQUESTED NO FURTHER DEMONSTRATIONS."],
  "nikola-tesla": ["INSPECTING THE FLOODLIGHT WIRING. THE DEPARTMENT HAS NOT AUTHORISED THIS."],
  "marie-curie": ["TWO NOBEL PRIZES. NO TENNIS TITLES. THE DEPARTMENT NOTES THE IMBALANCE."],
  "leonardo-da-vinci": ["HAS SKETCHED THE UMPIRE'S CHAIR. IN HIS VERSION IT FLIES."],
  "socrates": ["HAS NOT CLAPPED SINCE 399 BC.", "EXAMINING THE MATCH. THE DEPARTMENT DOES NOT RECOMMEND IT."],
  "marcus-aurelius": ["ACCEPTS THE SCORE. ACCEPTS ALL SCORES."],
  "mansa-musa": ["HAS BOUGHT THE ROW. CONCESSION PRICES HAVE COLLAPSED."],
  "ada-lovelace": ["COMPUTING THE NEXT POINT ON A NOTECARD. SHE IS AHEAD OF THE SCOREBOARD."],
  "alan-turing": ["CANNOT TELL WHICH PLAYER IS THE MACHINE. THE DEPARTMENT KNOWS. IT IS NOT TELLING."],
  "grace-hopper": ["HAS REMOVED A MOTH FROM THE SCOREBOARD. IT HAS BEEN LOGGED."],
  "babe-ruth": ["POINTING AT THE FAR STAND. WRONG SPORT. THE DEPARTMENT ALLOWS IT."],
  "pablo-picasso": ["SEES THE COURT FROM EVERY ANGLE AT ONCE. THE BROADCAST HAS ONE."],
  "george-orwell": ["IS AWARE OF THE CAMERA. THE CAMERA IS AWARE OF HIM."],
  "winston-churchill": ["CIGAR LIT IN A NO-SMOKING STAND. CITATION FILED. CITATION IGNORED."],
  "queen-elizabeth-ii": ["IN THE ROYAL BOX. THE DEPARTMENT DID NOT BUILD A ROYAL BOX. ONE WAS THERE ANYWAY."],
  "muhammad-ali": ["RATING THE FOOTWORK. THE DEPARTMENT RATES HIS HIGHER."],
  "stephen-hawking": ["HAS ESTIMATED THE MATCH'S DURATION. THE ESTIMATE IS CLASSIFIED."],
  "harriet-tubman": ["KNOWS EVERY EXIT IN THE STADIUM. THE DEPARTMENT KNOWS FEWER."],
  "nelson-mandela": ["ESSENTIAL INFRASTRUCTURE. SEATED IN THE GENERAL STAND BY CHOICE."],
  "pele": ["WATCHING A BALL HE MAY NOT KICK. THE DEPARTMENT IS WATCHING HIS FEET."],
  "arthur-ashe": ["PLAYER ON FILE. A STADIUM ELSEWHERE BEARS HIS NAME. THIS ONE BEARS THE DEPARTMENT'S."],
};
// The dead whose files the Department reads straight: no gags, the plain lines.
const PLAIN = new Set(["kobe-bryant", "princess-diana", "jfk", "martin-luther-king-jr", "mahatma-gandhi", "mother-teresa", "michael-jackson", "prince", "bruce-lee", "billie-holiday", "aretha-franklin"]);
const DEAD_GAGS = [
  "HAS NOT CLAPPED SINCE {Y}.",
  "TICKET ISSUED {Y}. STILL VALID. THE DEPARTMENT HONOURS ITS TICKETS.",
  "SEAT LICENCE RENEWED IN PERPETUITY. NOBODY ASKED.",
  "LAST AT A SPORTING EVENT IN {Y}. RECORD UPDATED.",
];
const DEAD_PLAIN = [
  "ON FILE. IN ATTENDANCE. THE DEPARTMENT HAS KEPT THE SEAT.",
  "SEATED IN THE MEMBERS' STAND. ATTENDANCE RECORDED.",
  "TIER: {T}. SEATED ACCORDINGLY.",
];
// The living: their being there, nothing more.
export const LIVING_NOTES = [
  "PRESENT. SEATED. ACCOUNTED FOR.",
  "TICKET SCANNED AT THE GATE. FILE UPDATED.",
  "TIER: {T}. SEATED ACCORDINGLY.",
  "ATTENDANCE NOTED. THE DEPARTMENT HAS NO FURTHER NOTES.",
  "THE DEPARTMENT DOES NOT COMMENT ON SPECTATORS. IT COUNTS THEM.",
];
const TENNIS_LIVING = [
  "PLAYER ON FILE. NOT ON COURT TODAY. IN THE PLAYERS' BOX.",
  "CLUB RATING {R}. WATCHING FROM ROW A.",
];

// chess/roster.js barred(), the same rule
export const barred = (f) => !f || Boolean(f.harm) || f.tier === "SOYLENT GREEN" || (f.breakdown?.threat ?? 0) >= 80;

const yearOf = (d) => { const y = parseInt(String(d), 10); return y < 0 ? `${-y} BC` : String(y); };

// -> [{slug, name, died, tier, sprite, tennis, rating, weight}]. oppKey: today's opponent (not in the stand).
export function spectators(oppKey) {
  const out = [], seen = new Set();
  for (const o of OPPONENTS) {
    if (o.regular || o.key === oppKey) continue;
    seen.add(o.key);
    out.push({ slug: o.key, name: o.name, died: o.died, tier: null, sprite: `/api/sprite/${o.key}`, tennis: true, rating: o.rating, weight: 3 });
  }
  for (const f of FAMOUS_FIGURES) {
    const slug = slugify(f.name);
    if (seen.has(slug) || barred(f)) continue;
    seen.add(slug);
    out.push({ slug, name: String(f.name).toUpperCase(), died: f.died || null, tier: f.tier || null, sprite: `/sprites/${slug}.png`, tennis: false, rating: null, weight: 1 });
  }
  return out;
}

// The lower third: {head, note}. pick: 0..1 (the presentation's own generator).
export function captionFor(s, pick = 0) {
  if (s.key === UMPIRE.key) return { head: `${UMPIRE.title}: ${UMPIRE.name}`, note: UMPIRE_NOTES[Math.floor(pick * UMPIRE_NOTES.length)] };
  const head = `IN ATTENDANCE: ${s.name}`;
  let pool;
  if (!s.died) pool = s.tennis ? TENNIS_LIVING : LIVING_NOTES;
  else if (PLAIN.has(s.slug)) pool = DEAD_PLAIN;
  else pool = NOTES[s.slug] ? [...NOTES[s.slug], ...NOTES[s.slug], DEAD_GAGS[0]] : DEAD_GAGS;   // their own notes, mostly
  const note = pool[Math.floor(pick * pool.length)]
    .replace("{Y}", s.died ? yearOf(s.died) : "").replace("{T}", s.tier || "UNASSIGNED").replace("{R}", String(s.rating ?? ""));
  return { head, note };
}
// Every line a figure could get (the check reads them all).
export function allNotesFor(s) {
  const out = new Set();
  for (let k = 0; k < 64; k++) out.add(captionFor(s, k / 64).note);
  return [...out];
}

export const REACTIONS = ["cheer", "yawn", "hotdog", "watch", "clap"];
