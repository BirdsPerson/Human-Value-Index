// The census: every assessed citizen and every referred/engine figure, in the shape the
// Holding Pen serves. /api/pen returns it; the social tick simulates it (merged with the
// 62 figures on file by src/city/roster.js, exactly as the browser does).
import { listPenCards, listFigures } from "./store.js";
import { censusFigure } from "./refer.js";
import { REALITY_INDEX } from "./intake.js";
import { sanitizeAvatar } from "../../src/avatar.js";
import { getStore } from "@netlify/blobs";
import { cube, judged } from "../../src/cube.js";
import { blendPeople } from "../../src/petition.js";
import { STORE as PETITIONS, readSummary } from "./petition.js";

// THE PEOPLE'S PETITION's crowd reading enriches a figure's People signal (the cube's
// likability axis; docs/PETITION.md). Never the score. A failed read changes nothing.
async function crowdSummary() {
  try { return await readSummary(getStore({ name: PETITIONS, consistency: "strong" })); } catch { return {}; }
}
function withCrowd(c, crowd) {
  const f = censusFigure(c);
  const hit = crowd[c.slug];
  if (!hit || !c.breakdown) return f;
  const people = blendPeople(c.people ?? null, hit);
  return people && people !== c.people ? { ...f, ...judged(cube(c.breakdown), people) } : f;
}

// strict: a failed figure read throws instead of returning no figures. The social tick
// needs that, because it forgets anyone missing from the census. withTimes: each record
// also carries filedAt (a figure's filing, a citizen's latest assessment) for INTAKE.
export async function censusSubjects({ strict = false, withTimes = false } = {}) {
  const [cards, figures, crowd] = await Promise.all([listPenCards(), strict ? listFigures() : listFigures().catch(() => []), crowdSummary()]);
  return [
    ...cards.map(c => ({
      // Private citizens: score and tier only. Old cards may still carry a verdict
      // or breakdown; they are dropped here.
      slug: c.slug, name: c.name, score: c.score, tier: c.tier, sprite: c.sprite ?? null, avatar: sanitizeAvatar(c.avatar), kind: "citizen",
      quadrant: c.quadrant ?? null, warmth: c.warmth ?? null, competence: c.competence ?? null, judge: "UNRATIFIED", realityIndex: REALITY_INDEX,
      ...(withTimes ? { filedAt: c.updated ?? null } : {}),
    })),
    // Referred figures: breakdown once fact-checked (see publicFigure); the verdict and
    // the file's history come from /api/figure/<slug> when the file is opened.
    ...figures.map(c => (withTimes ? { ...withCrowd(c, crowd), filedAt: c.at ?? null } : withCrowd(c, crowd))),
  ];
}
