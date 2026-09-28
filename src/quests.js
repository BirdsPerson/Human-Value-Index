// Side quests: the Archive's dead offer one errand each. Two kinds:
//   find     locate the figure in the city, stand in the same building, report contact.
//   witness  be in the building while the figure and its partner (`with`) are both on a
//            floor there, neither at home: a meeting the sim produces on its own.
// The figure vouches for you in its lens; a category holds one vouch, so the second
// directive in a category closes when the first is discharged.
// Shared by the client (MY FILE quest log, the city card) and netlify/functions/quest.js,
// which re-checks contact against the same deterministic sim. Living figures never
// offer quests or take part in one (they never speak). Checked by scripts/check-quests.mjs.
import { FAMOUS_FIGURES, slugify } from "./figures.js";
import { BUILDING, DISTRICT, clockAt, whereOf, roomIn } from "./city/simApi.js";

// Lines are the Department's rendering of the figure, not quotations.
const Q = (id, figure, dim, line) => ({ id, kind: "find", figure, dim, line });
const W = (id, figure, withSlug, dim, line) => ({ id, kind: "witness", figure, with: withSlug, dim, line });
export const QUESTS = [
  Q("tubman-care", "harriet-tubman", "care",
    "Every city has a road out, even this one. Come find me. I'll show you who still needs carrying, and you'll carry them."),
  Q("king-alignment", "martin-luther-king-jr", "alignment",
    "I am not asking you to agree with me. I am asking you to show up. Find me, and we'll talk about who this city was built to leave out."),
  Q("curie-utility", "marie-curie", "utility",
    "I don't need company. I need someone who can hold a lamp steady for three hours without asking what it is for. Come and find me."),
  Q("hawking-adaptability", "stephen-hawking", "adaptability",
    "The Department thinks this city is a closed system. Nothing is a closed system. Find me and I'll explain why that should worry them."),
  Q("hopper-legacy", "grace-hopper", "legacy",
    "Somebody taught me. Somebody has to teach you. Find me, bring a question, and don't tell me it has always been done this way."),
  Q("elizabeth-network", "queen-elizabeth-ii", "network",
    "One does not summon. One is visited. Find me. One has kept a list of everyone who never came."),
  Q("ali-physical", "muhammad-ali", "physical",
    "You want to be counted, you get up early. Find me. If I'm done training by the time you get here, you're late, and I'll say so."),
  // Partners picked so the pair shares a building 20-45% of a machine day (check-quests).
  W("gandhi-care", "mahatma-gandhi", "nelson-mandela", "care",
    "Mr Mandela and I stand in the ration queue. Come when we are both there. Watch who is served first, then watch who notices."),
  W("mandela-alignment", "nelson-mandela", "harriet-tubman", "alignment",
    "Harriet and I compare notes on leaving places built to keep us. Be in the room when we do. Say nothing. Remember all of it."),
  W("tesla-utility", "nikola-tesla", "marie-curie", "utility",
    "Madame Curie and I share a reactor and disagree about everything inside it. Come while we are both on the floor. Touch nothing."),
  W("einstein-adaptability", "albert-einstein", "isaac-newton", "adaptability",
    "Sir Isaac and I meet in the clock tower to argue about what time it is. We are both right. Come and see how that works."),
  W("socrates-legacy", "socrates", "marcus-aurelius", "legacy",
    "The emperor comes to the faculty to be questioned. Be in the room. You will learn more from the questions than from him."),
  W("aretha-network", "aretha-franklin", "billie-holiday", "network",
    "Billie and I hold the culture centre most nights. Come when we are both in. Everyone who matters walks through that door eventually."),
  W("pele-physical", "pele","babe-ruth", "physical",
    "Babe says baseball is a sport. I let him. Come to the Bowl while we are both there and see who is still running at the end."),
];
export const QUEST = Object.fromEntries(QUESTS.map(q => [q.id, q]));

export const DIM_LABEL = { care: "CARE", alignment: "ALIGNMENT", utility: "UTILITY", adaptability: "ADAPTABILITY", legacy: "LEGACY", network: "NETWORK", physical: "PHYSICAL" };
const BRIEFS = {
  find: "LOCATE THE SUBJECT IN THE SUBSTRATE. ENTER THE SAME BUILDING. OPEN ITS FILE. REPORT CONTACT.",
  witness: "WAIT FOR BOTH SUBJECTS TO CONVENE IN ONE BUILDING. ENTER IT. OPEN EITHER FILE. REPORT WHAT YOU WITNESSED.",
};
export const briefOf = (q) => BRIEFS[q.kind];

// The figure as the city simulates it: the same object useRoster builds, so the server
// and every viewer put it in the same place at the same moment.
const FIG = Object.fromEntries(FAMOUS_FIGURES.map(f => [slugify(f.name), { ...f, slug: slugify(f.name), kind: "figure" }]));
export const questFigure = (q) => FIG[q?.figure] || null;
export const questPartner = (q) => FIG[q?.with] || null;
// Directives a figure's file carries: the ones it gives, and the meetings it attends.
export const questsFor = (slug) => QUESTS.filter(q => q.figure === slug || q.with === slug);

const isHq = (buildingId) => buildingId === "hq" || BUILDING[buildingId]?.districtId === "hq";
function place(buildingId) {
  const b = BUILDING[buildingId];
  return { buildingId: b.id, districtId: b.districtId, building: b.name, district: DISTRICT[b.districtId]?.name };
}

// Where a figure is at realMs: {buildingId, districtId} when it can be found (inside a
// building, HQ excluded: the Pen runs its own simulation), else {transit} or {classified}.
// home: true when the building is where it sleeps.
function locateFig(f, realMs) {
  if (!f) return null;
  const w = whereOf(f, clockAt(realMs).mt);
  const r = roomIn(w, f);
  if (!r) return { transit: true };
  if (isHq(r.buildingId)) return { classified: true };
  return { ...place(r.buildingId), onFloor: r.mode === "here", home: w.activity === "home" };
}
export const locate = (q, realMs = Date.now()) => locateFig(questFigure(q), realMs);
export const locatePartner = (q, realMs = Date.now()) => locateFig(questPartner(q), realMs);

// A witness directive's meeting: both on a floor of the same public building, neither at
// home (the Crypt, where the dead all sleep, is not an occasion). Null when apart.
export function meetingAt(q, realMs = Date.now()) {
  const a = locate(q, realMs), b = locatePartner(q, realMs);
  if (!a?.onFloor || !b?.onFloor || a.home || b.home || a.buildingId !== b.buildingId) return null;
  return place(a.buildingId);
}

// Seconds until the next meeting (0 if convened now), scanning `horizonS` ahead; null if none.
// Pairs skip a day or two of the week (a machine day is 24 real minutes), so the horizon
// covers the longest gap check-quests measures.
// ponytail: linear scan in 15 s steps (<=360 lookups of both figures); fine at one call per
// few seconds. Upgrade path: walk the two schedules' segments instead.
export function nextMeeting(q, realMs = Date.now(), horizonS = 5400, stepS = 15) {
  for (let s = 0; s <= horizonS; s += stepS) if (meetingAt(q, realMs + s * 1000)) return s;
  return null;
}

// Server rule: the figure was in buildingId (witness: the meeting was held there) at some
// second of the last `slackS` seconds (the census ticks once a second; the report takes a
// moment to arrive).
export function contactAt(q, buildingId, realMs = Date.now(), slackS = 90) {
  const test = q.kind === "witness" ? (t) => meetingAt(q, t) : (t) => locate(q, t);
  for (let s = 0; s <= slackS; s++) {
    if (test(realMs - s * 1000)?.buildingId === buildingId) return true;
  }
  return false;
}
