// THE TENNIS CLUB, playable: the broadcast. Pure, no DOM. Everything around the match that is
// not the match: the crowd's mood, the officials (the chair, the line judges, the net judge, the
// ball kids), the chair's calls, and the cutaways to the stand. It READS the sim's state after each
// step and never writes it; it has its own seeded generator (never the sim's), so a match is the
// same match with the broadcast on, off or skipped (scripts/check-tennis.mjs plays it both ways).
//
// The one thing it decides for the loop: whether the sim steps this 60 Hz slot (slot()). During a
// cutaway the match is held (like pause: no step, nothing logged), and after one the match waits
// until A and B are let go, so the press that skipped it never reaches the sim as a toss or swing.
// A challenge's review (THE DEPARTMENT'S EYE) holds the match the same way: the sim has already
// decided it (sim.js resolve); the review only shows it, and nothing is logged while it plays.
import { COURT, BTN, serverOfMatch } from "./sim.js";
import { spectators, captionFor, UMPIRE, REACTIONS } from "./gallery.js";

function prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { hw, dhw, hl } = COURT;
// Where the officials are, in court metres (render.js projects them).
export const CHAIR = { x: dhw + 1.9, y: 0 };
export const NET_JUDGE = { x: -dhw - 1.25, y: 0.35 };
export const JUDGES = [
  { x: dhw + 1.3, y: hl + 1.7, face: -1 }, { x: -dhw - 1.3, y: hl + 1.7, face: 1 },        // near baseline corners
  { x: dhw + 1.0, y: -hl - 1.5, face: -1 }, { x: -dhw - 1.0, y: -hl - 1.5, face: 1 },      // far baseline corners
  { x: dhw + 1.5, y: 7.2, face: -1 }, { x: dhw + 1.5, y: -7.2, face: -1 },                 // the right sideline
  { x: -dhw - 1.5, y: 7.2, face: 1 }, { x: -dhw - 1.5, y: -7.2, face: 1 },                 // the left sideline
];
export const KIDS = [
  { x: -dhw - 0.55, y: 1.1 }, { x: dhw + 0.6, y: -1.1 },      // at the net posts
  { x: -2.6, y: hl + 2.7 }, { x: 2.6, y: -hl - 2.5 },          // behind the baselines
];

export const CUT_LEN = 270;   // 4.5 s of camera on a face, unless skipped
const AB = BTN.A | BTN.B | BTN.C | BTN.PTR;
// The review's timeline, in 60 Hz slots: the flight (FLIGHT), the camera coming down onto the mark
// (ZOOM), the mark and the measurement (MARK, the slow clap under it), the verdict, the brand line.
export const REVIEW = { FLIGHT: 12, ZOOM: 150, MARK: 250, VERDICT: 350, BRAND: 420, LEN: 490 };

// How far the mark missed or touched the line, in the Department's words. m: sim.js lineMargin (the
// overlap of the mark past the line's outer edge; below zero, the gap).
export function measured(m) {
  if (m < 0) { const mm = Math.max(1, Math.round(-m * 1000)); return { short: `OUT BY ${mm} MM`, long: `THE BALL WAS OUT BY ${mm} ${mm === 1 ? "MILLIMETRE" : "MILLIMETRES"}` }; }
  // the mark (3 cm either side of the ball's centre) reaches the 5 cm line while m < 0.11
  if (m < 0.11) return { short: "IN \u2014 TOUCHING THE LINE", long: "THE BALL WAS IN, TOUCHING THE LINE" };
  const mm = Math.max(1, Math.round((m - 0.11) * 1000));
  return { short: `IN BY ${mm} MM`, long: `THE BALL WAS IN BY ${mm} MILLIMETRES` };
}
export const BRAND = "THE DEPARTMENT'S EYE IS SPONSORED BY NOBODY. IT DOES NOT BLINK.";

const WORDS = { LOVE: "LOVE", 15: "FIFTEEN", 30: "THIRTY", 40: "FORTY" };
// The sim's call -> what the chair says. names: [near, far].
export function spoken(st, names, next = st.next) {
  const w = st.lastWinner ?? 0;
  if (next === "PLAY") return `${names[serverOfMatch(st)]} TO SERVE. PLAY.`;
  if (next === "GAME") return `GAME, ${names[w]}.`;
  if (next === "GAME AND SET") return `GAME AND SET, ${names[w]}.`;
  if (next === "GAME, SET AND MATCH") return `GAME, SET AND MATCH, ${names[w]}.`;
  if (next === "TIEBREAK") return "GAMES SIX-ALL. TIEBREAK.";
  if (next === "SECOND SERVE") return "SECOND SERVE.";
  if (next === "DEUCE") return "DEUCE.";
  if (next === "AD IN") return `ADVANTAGE ${names[serverOfMatch(st)]}.`;
  if (next === "AD OUT") return `ADVANTAGE ${names[1 - serverOfMatch(st)]}.`;
  const m = /^(LOVE|15|30|40)-(LOVE|15|30|40|ALL)$/.exec(next || "");
  if (m) return `${WORDS[m[1]]}-${m[2] === "ALL" ? "ALL" : WORDS[m[2]]}.`;
  return next ? `${next}.` : "";
}

// opts: {seed, names: [near, far], opp: the opponent's key, cutaways: bool, st: the new match}
export function createShow({ seed, names, formal = names, opp, cutaways = true, st }) {
  const r = prng((seed ^ 0x5eed7e11) >>> 0);
  const pool = spectators(opp);
  const S = {
    t: 0, cutaways, cut: null, cuts: 0, skips: 0, hold: false, prevMask: 0,
    since: 0, gap: 3 + Math.floor(r() * 3),
    crowd: { mood: "idle", from: 0, until: 0 },
    bubble: null,          // {who: "chair" | "judge" | "net", j, text, from, until}
    queued: null,          // {text, at}: the chair speaks after the line judge
    judge: null,           // {j, dir, from, until}: a line judge's arm out
    netHand: 0,            // until when the net judge's hand is up
    kids: KIDS.map(k => ({ hx: k.x, hy: k.y, x: k.x, y: k.y, go: false, back: false, mv: 0 })),
    taken: null,           // the ball object a kid is carrying (render hides it)
    look: 0,               // the chair's eye: -1 far end .. +1 near end
    ballX: 0, ballY: 0,
    upcoming: null, shown: new Set(), prevPhase: st?.phase || "serve",
    review: null,          // {from, len, d}: THE DEPARTMENT'S EYE on screen (d: the sim's challenge, copied)
    reviews: 0,
    sr: null,              // {n, text}: what the screen reader hears of challenges and verdicts
  };
  let srN = 0;
  const tell = (text) => { S.sr = { n: ++srN, text }; };
  const pick = () => {
    if (r() < 1 / 6) return { key: UMPIRE.key };
    let left = pool.filter(p => !S.shown.has(p.slug));
    if (!left.length) { S.shown.clear(); left = pool; }
    let tot = 0; for (const p of left) tot += p.weight;
    let x = r() * tot;
    for (const p of left) { x -= p.weight; if (x <= 0) return p; }
    return left[left.length - 1];
  };
  S.upcoming = pick();
  if (st) say(S, "chair", spoken(st, names, "PLAY"), 0, 240);

  function startCut() {
    const s = S.upcoming;
    if (s.slug) S.shown.add(s.slug);
    S.cut = { n: ++S.cuts, s, caption: captionFor(s, r()), react: s.key === UMPIRE.key ? "announce" : REACTIONS[Math.floor(r() * REACTIONS.length)], from: S.t, len: CUT_LEN };
    S.upcoming = pick();
    S.since = 0; S.gap = 3 + Math.floor(r() * 3);
  }
  function endCut(skipped) { if (skipped) S.skips++; S.cut = null; }
  function endReview(st) {
    const d = S.review.d;
    S.review = null;
    const v = d.overturned ? "CALL OVERTURNED." : "THE CALL STANDS.";
    say(S, "chair", `${v} ${spoken(st, names)}`, 0, 300);
    S.crowd = d.overturned ? { mood: "stand", from: S.t, until: S.t + 150 } : { mood: "idle", from: S.t, until: 0 };
  }

  return {
    state: S,
    busy: () => Boolean(S.cut) || Boolean(S.review) || S.hold,
    reviewAge: () => (S.review ? S.t - S.review.from : -1),
    cutAge: () => (S.cut ? S.t - S.cut.from : -1),
    skip() { if (S.cut && S.t - S.cut.from > 10) { endCut(true); S.hold = true; } },
    // One 60 Hz slot. -> true: step the sim with this mask (and log it); false: the match is held.
    slot(st, mask) {
      S.t++;
      tickKids(S, st); tickLook(S, st);
      if (S.queued && S.t >= S.queued.at) { say(S, "chair", S.queued.text, 0, 330); S.queued = null; }
      if (S.review) {
        const press = mask & ~S.prevMask & AB, age = S.t - S.review.from;
        S.prevMask = mask;
        if (press && age > 40) { endReview(st); S.hold = true; }
        else if (age >= S.review.len) { endReview(st); S.hold = (mask & AB) !== 0; }
        return false;
      }
      if (S.cut) {
        const press = mask & ~S.prevMask & AB;
        S.prevMask = mask;
        if (press && S.t - S.cut.from > 10) { endCut(true); S.hold = true; }
        else if (S.t - S.cut.from >= S.cut.len) { endCut(false); S.hold = (mask & AB) !== 0; }
        return false;
      }
      S.prevMask = mask;
      if (S.hold) { if (!(mask & AB)) S.hold = false; return false; }   // the release slot steps nothing either
      return true;
    },
    // After each sim step: what just happened.
    observe(st) {
      const ev = st.ev, b = st.ball;
      if (ev.includes("challenge") && st.chal) {
        const who = formal[st.chal.by] || names[st.chal.by];
        S.queued = null;
        say(S, "chair", `${who} IS CHALLENGING THE CALL.`, 0, 200);
        tell(`${who} IS CHALLENGING THE CALL.`);
        S.crowd = { mood: "idle", from: S.t, until: 0 };
      }
      if (ev.includes("review") && st.chal) {
        const c = st.chal, mz = measured(c.m);
        S.reviews++; S.bubble = null; S.queued = null;
        S.review = { from: S.t, len: REVIEW.LEN, d: { x: c.x, y: c.y, vx: c.vx, vy: c.vy, vz: c.vz, grav: c.grav, t: c.t, m: c.m, line: c.line, called: c.called, truth: c.truth, overturned: c.overturned, outcome: c.outcome, serve: c.serve, by: c.by, surface: st.surface, words: mz } };
        tell(`${mz.long}. ${c.overturned ? "CALL OVERTURNED" : "CALL STANDS"}.`);
      }
      if (ev.includes("violation") && st.tone) {
        const T = st.tone, who = names[T.i];
        const text = `THE UMPIRE HAS NOTED YOUR TONE. CODE VIOLATION, ${T.pen ? "POINT PENALTY" : "WARNING"}, ${who}.`;
        say(S, "chair", text, 0, 300); tell(text);
      }
      if (ev.includes("penalty")) { say(S, "chair", `POINT PENALTY. ${spoken(st, names)}`, 0, 300); S.queued = null; }
      if (ev.includes("toss") || (ev.includes("hit") && S.bubble?.who === "chair")) { S.bubble = null; S.queued = null; }
      if (ev.includes("hit") || ev.includes("smash")) { if (S.crowd.mood !== "idle" && S.t - S.crowd.from > 30) S.crowd = { mood: "idle", from: S.t, until: 0 }; }
      if (ev.includes("point") || ev.includes("fault")) {
        const isPoint = ev.includes("point");
        const words = isPoint ? spoken(st, names) : "SECOND SERVE.";
        if ((st.call === "OUT" || st.call === "FAULT") && b) {
          let j = 0, best = 1e9;
          JUDGES.forEach((J, k) => { const d = (J.x - b.x) * (J.x - b.x) + (J.y - b.y) * (J.y - b.y); if (d < best) { best = d; j = k; } });
          S.judge = { j, dir: b.x >= 0 ? 1 : -1, from: S.t, until: S.t + 70 };
          say(S, "judge", st.call === "OUT" ? "OUT!" : "FAULT!", j, 50);
          S.queued = { text: words, at: S.t + 42 };
        } else if (st.call === "NET" || st.call === "NET. FAULT") {
          S.netHand = S.t + 60;
          say(S, "net", "NET!", 0, 45);
          S.queued = { text: st.call === "NET. FAULT" ? "FAULT. SECOND SERVE." : words, at: S.t + 38 };
        } else if (st.call === "DOUBLE FAULT") {
          say(S, "chair", "DOUBLE FAULT.", 0, 40);
          S.queued = { text: words, at: S.t + 40 };
        } else say(S, "chair", words, 0, 330);
        if (isPoint) {
          const big = ev.includes("game") || st.call === "ACE" || st.rally >= 6;
          S.crowd = { mood: big ? "stand" : "clap", from: S.t, until: S.t + (big ? 170 : 90) };
        }
        // the nearest ball kid goes for it
        if (b) {
          let k = 0, best = 1e9;
          S.kids.forEach((K, i) => { const d = (K.x - b.x) * (K.x - b.x) + (K.y - b.y) * (K.y - b.y); if (d < best && !K.go) { best = d; k = i; } });
          S.kids[k].go = true; S.kids[k].back = false; S.kids[k].ball = b;
        }
      }
      // a point over and the next set up: maybe the camera finds someone in the stand
      if (S.prevPhase === "dead" && st.phase === "serve" && st.after === "point") {
        S.since++;
        if (S.cutaways && S.since >= S.gap) startCut();
      }
      S.prevPhase = st.phase;
      if (S.crowd.until && S.t > S.crowd.until) S.crowd = { mood: "idle", from: S.t, until: 0 };
    },
  };
}

function say(S, who, text, j, len) { if (text) S.bubble = { who, j, text, from: S.t, until: S.t + len }; }

function tickLook(S, st) {
  const b = st.ball;
  if (b) { S.ballX = b.x; S.ballY = b.y; }
  const want = b ? Math.max(-1, Math.min(1, b.y / 9)) : 0;
  S.look += (want - S.look) * 0.12;
  if (S.bubble && S.t > S.bubble.until) S.bubble = null;
}

// The ball kids: run to the dead ball, pick it up, run home. Fast, as on the television.
function tickKids(S, st) {
  for (const K of S.kids) {
    let tx = K.hx, ty = K.hy;
    if (K.go) {
      const b = K.ball;
      if (!b || st.ball !== b) { K.go = false; K.back = true; }
      else { tx = b.x; ty = b.y; }
    }
    const dx = tx - K.x, dy = ty - K.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.25) {
      if (K.go) { S.taken = K.ball; K.go = false; K.back = true; }
      else if (K.back) K.back = false;
      K.mv = 0;
      continue;
    }
    const v = Math.min(d, 0.24);
    K.x += dx / d * v; K.y += dy / d * v; K.mv++;
  }
  if (S.taken && st.ball !== S.taken) S.taken = null;
}
