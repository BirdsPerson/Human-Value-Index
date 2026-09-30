// THE PEOPLE'S PETITION (docs/PETITION.md): the pure rules, shared by the browser, the
// functions (netlify/lib/petition.js) and the checks. No I/O here.
//
// A vote is TOO HIGH / FAIR / TOO LOW on a public figure's score, one per voter per
// EVALUATION PERIOD. The period is the number of entries in the figure's scoreHistory: when
// the Department re-evaluates the file (a method change, a record re-read, a review, an
// appeal), the log grows, the period changes, and the ballot re-opens for everyone.
// Votes never move a score. Enough of them, bridged across the cube's quadrants and held
// for 72 hours, buy one machine re-examination, blind to which way the people leaned.
import { CAL } from "./cube.js";

export const CFG = CAL.petition;
export const CHOICES = ["high", "fair", "low"];
export const CHOICE_LABEL = { high: "TOO HIGH", fair: "FAIR", low: "TOO LOW" };
// The voter's own cube quadrant (from their case file) is their cohort for bridging.
export const QUADRANTS = ["ADMIRED", "TRUSTED RESERVE", "ENVIED", "DISMISSED"];
export const quadrantIndex = (q) => QUADRANTS.indexOf(q);   // UNPLACED -> -1: counted, in no cohort

// The evaluation period of a figure: how many times the Department has put a number on it.
export const periodOf = (fig) => (Array.isArray(fig?.scoreHistory) ? fig.scoreHistory.length : 0);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- the count -----------------------------------------------------------------------------
// seen: {voterKey: [rev, choiceIdx, quadrantIdx]} -> votes, voters, per-quadrant votes.
export function countsOf(seen) {
  const votes = { high: 0, fair: 0, low: 0 };
  const byQuadrant = Object.fromEntries(QUADRANTS.map(q => [q, { high: 0, fair: 0, low: 0, n: 0 }]));
  let voters = 0;
  for (const v of Object.values(seen || {})) {
    const c = CHOICES[v?.[1]];
    if (!c) continue;
    voters++; votes[c]++;
    const q = QUADRANTS[v[2]];
    if (q) { byQuadrant[q][c]++; byQuadrant[q].n++; }
  }
  return { votes, voters, byQuadrant };
}

// Wilson score interval, lower bound: how sure we are a share is at least this, at this n.
export function wilson(k, n, z = CFG.wilsonZ) {
  if (!n) return 0;
  const p = k / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

// ---- the trigger -------------------------------------------------------------------------------
// A review is asked for when, in one period: at least reviewVoters voted; one direction
// (TOO HIGH or TOO LOW; FAIR never asks for anything) holds a Wilson lower bound of at least
// reviewWilson of ALL votes; it wins at least cohortShare in at least cohortsNeeded of the
// four quadrant cohorts that have cohortMin voters each; and no cohort supplies more than
// cohortMaxShare of the votes. One faction, however large, cannot trigger a review alone.
// -> {dir, share, strength, cohorts} or null.
export function trigger(counts, cfg = CFG) {
  const n = counts?.voters || 0;
  if (n < cfg.reviewVoters) return null;
  const dir = counts.votes.high >= counts.votes.low ? "high" : "low";
  const k = counts.votes[dir];
  const strength = wilson(k, n, cfg.wilsonZ);
  if (strength < cfg.reviewWilson) return null;
  const cohorts = [];
  for (const q of QUADRANTS) {
    const c = counts.byQuadrant[q];
    if (c.n > cfg.cohortMaxShare * n) return null;
    if (c.n >= cfg.cohortMin && c[dir] / c.n >= cfg.cohortShare) cohorts.push(q);
  }
  if (cohorts.length < cfg.cohortsNeeded) return null;
  return { dir, share: k / n, strength, cohorts };
}

// The hold: the trigger must stand, unbroken, for holdHours. Given the previous hold and the
// counts after a change, the next hold (the clock restarts on a break or a change of side).
export function nextHold(prev, counts, now, cfg = CFG) {
  const t = trigger(counts, cfg);
  if (!t) return null;
  if (prev && prev.dir === t.dir) return { ...prev, strength: t.strength };
  return { dir: t.dir, since: now, strength: t.strength };
}
export const holdRipe = (hold, now, cfg = CFG) => Boolean(hold) && now - hold.since >= cfg.holdHours * 3600 * 1000;

// ---- what the file shows ---------------------------------------------------------------------
// Words, not a countdown, before a review (so nobody organises against a live number).
export function stateOf({ closed = false, queued = false, voters = 0 } = {}, cfg = CFG) {
  if (closed) return "CLOSED TO OPINION";
  if (queued) return "REVIEW PENDING";
  if (voters >= cfg.notedVoters) return "NOTED";
  if (voters >= cfg.stirringVoters) return "STIRRING";
  return "QUIET";
}
export const STATE_LINE = {
  "CLOSED TO OPINION": "THIS FILE IS CLOSED TO OPINION. THE DEPARTMENT DOES NOT SAY WHY. IT RARELY DOES.",
  "REVIEW PENDING": "THE PEOPLE HAVE PETITIONED. THE DEPARTMENT WILL RE-EXAMINE THE RECORD. IT HAS NOT BEEN TOLD WHICH WAY YOU LEANED. IT DID NOT ASK.",
  NOTED: "YOUR OBJECTIONS ARE NOTED. NOTED IS NOT GRANTED.",
  STIRRING: "SOME SUBJECTS HAVE OPINIONS. THE DEPARTMENT HAS FILED THEM.",
  QUIET: "FEW HAVE SPOKEN. THE DEPARTMENT TAKES SILENCE AS AGREEMENT.",
};
export const BALLOT_RULE = "ONE VOTE PER EVALUATION. THE DEPARTMENT RE-OPENS THE BALLOT WHEN IT RE-EXAMINES.";

// Counts shown rounded to 5 (and shares to 5%) until the Department acts on them.
export const round5 = (n) => Math.round(n / 5) * 5;
export function publicCounts(counts, exact = false) {
  const n = counts.voters;
  const share = (k) => (n ? (exact ? Math.round((100 * k) / n) : round5((100 * k) / n)) : 0);
  return {
    voters: exact ? n : n < 5 ? null : round5(n),       // null: fewer than five
    lean: n >= 5 || exact ? { high: share(counts.votes.high), fair: share(counts.votes.fair), low: share(counts.votes.low) } : null,
  };
}

// ---- the People signal ----------------------------------------------------------------------
// TOO LOW says the public regards the subject above the record; TOO HIGH, below it. One
// period's crowd reading sits on the likability scale (0-100) around the machine's own
// conduct reading for that period: warmth + swing x (low - high) / voters. Earlier periods
// count less (periodDecay per period back), because they judged an older number.
export function periodReading(p, cfg = CFG) {
  if (!p || !p.voters || !isNum(p.warmth)) return null;
  return clamp(p.warmth + (cfg.people.swing * ((p.votes.low || 0) - (p.votes.high || 0))) / p.voters, 0, 100);
}
// periods: [{period, voters, votes, warmth}] -> {reading, n} (n = decay-weighted voters) or null.
export function crowdOf(periods, cfg = CFG) {
  const list = (periods || []).filter(p => periodReading(p, cfg) != null).sort((a, b) => b.period - a.period);
  if (!list.length) return null;
  const top = list[0].period;
  let w = 0, s = 0;
  for (const p of list) {
    const k = p.voters * Math.pow(cfg.people.periodDecay, top - p.period);
    w += k; s += k * periodReading(p, cfg);
  }
  return w ? { reading: Math.round(s / w), n: Math.round(w * 10) / 10 } : null;
}
// Blend the crowd into a figure's People data (the cube's likability axis).
// - With a YouGov reading: the poll is a prior worth yougovWeight voters; the crowd moves it
//   in proportion to its (decay-weighted) size.
// - Without one: the crowd alone, once it has minVoters, shrunk toward the neutral 50 by the
//   same pseudo-count the YouGov seeding uses (likabilityShrink).
// Never touches the score. Returns the people object unchanged when the crowd adds nothing.
export function blendPeople(people, crowd, cfg = CFG, shrink = CAL.likabilityShrink) {
  if (!crowd || !isNum(crowd.reading) || !(crowd.n > 0)) return people || null;
  const base = people && isNum(people.likability) ? people : null;
  if (base) {
    const K = cfg.people.yougovWeight;
    const likability = Math.round((K * base.likability + crowd.n * crowd.reading) / (K + crowd.n));
    return { ...base, likability, polled: base.likability, crowd: { reading: crowd.reading, n: crowd.n }, source: `${base.source || "Public ratings"} + THE PEOPLE'S PETITION` };
  }
  if (crowd.n < cfg.people.minVoters) return people || null;
  const likability = Math.round((crowd.n * crowd.reading + shrink * 50) / (crowd.n + shrink));
  return { likability, source: "THE PEOPLE'S PETITION (subjects of this city)", crowd: { reading: crowd.reading, n: crowd.n } };
}
// Apply a crowd summary ({slug: {reading, n}}) to a subject; the cube re-judges from people.
export function withCrowd(subject, crowd) {
  const c = crowd?.[subject?.slug];
  if (!c) return subject;
  const people = blendPeople(subject.people, c);
  return people === subject.people ? subject : { ...subject, people };
}
