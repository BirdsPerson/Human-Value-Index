// Side quests: the Archive's dead offer one errand each. Find the figure in the city,
// stand in the same building, report contact; the figure vouches for you in its lens.
// Shared by the client (MY FILE quest log, the city card) and netlify/functions/quest.js,
// which re-checks contact against the same deterministic sim. Living figures never
// offer quests (they never speak). Checked by scripts/check-quests.mjs.
import { FAMOUS_FIGURES, slugify } from "./figures.js";
import { BUILDING, DISTRICT, clockAt, whereOf, roomIn } from "./city/simApi.js";

// Lines are the Department's rendering of the figure, not quotations.
const Q = (id, figure, dim, line) => ({ id, figure, dim, line });
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
];
export const QUEST = Object.fromEntries(QUESTS.map(q => [q.id, q]));

export const DIM_LABEL = { care: "CARE", alignment: "ALIGNMENT", utility: "UTILITY", adaptability: "ADAPTABILITY", legacy: "LEGACY", network: "NETWORK", physical: "PHYSICAL" };
export const BRIEF = "LOCATE THE SUBJECT IN THE SUBSTRATE. ENTER THE SAME BUILDING. OPEN ITS FILE. REPORT CONTACT.";

// The figure as the city simulates it: the same object useRoster builds, so the server
// and every viewer put it in the same place at the same moment.
const FIG = Object.fromEntries(FAMOUS_FIGURES.map(f => [slugify(f.name), { ...f, slug: slugify(f.name), kind: "figure" }]));
export const questFigure = (q) => FIG[q?.figure] || null;
export const questFor = (slug) => QUESTS.find(q => q.figure === slug) || null;

// Where the quest's figure is at realMs: {buildingId, districtId} when it can be found
// (inside a building, HQ excluded: the Pen runs its own simulation), else {transit} or
// {classified}.
export function locate(q, realMs = Date.now()) {
  const f = questFigure(q);
  if (!f) return null;
  const w = whereOf(f, clockAt(realMs).mt);
  const r = roomIn(w, f);
  if (!r) return { transit: true };
  if (r.buildingId === "hq" || BUILDING[r.buildingId]?.districtId === "hq") return { classified: true };
  const b = BUILDING[r.buildingId];
  return { buildingId: b.id, districtId: b.districtId, building: b.name, district: DISTRICT[b.districtId]?.name };
}

// Server rule: the figure was in buildingId at some second of the last `slackS` seconds
// (the census ticks once a second; the report takes a moment to arrive).
export function contactAt(q, buildingId, realMs = Date.now(), slackS = 90) {
  for (let s = 0; s <= slackS; s++) {
    if (locate(q, realMs - s * 1000)?.buildingId === buildingId) return true;
  }
  return false;
}
