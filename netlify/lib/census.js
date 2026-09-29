// The census: every assessed citizen and every referred/engine figure, in the shape the
// Holding Pen serves. /api/pen returns it; the social tick simulates it (merged with the
// 62 figures on file by src/city/roster.js, exactly as the browser does).
import { listPenCards, listFigures } from "./store.js";
import { censusFigure } from "./refer.js";
import { REALITY_INDEX } from "./intake.js";
import { sanitizeAvatar } from "../../src/avatar.js";

// strict: a failed figure read throws instead of returning no figures. The social tick
// needs that, because it forgets anyone missing from the census.
export async function censusSubjects({ strict = false } = {}) {
  const [cards, figures] = await Promise.all([listPenCards(), strict ? listFigures() : listFigures().catch(() => [])]);
  return [
    ...cards.map(c => ({
      // Private citizens: score and tier only. Old cards may still carry a verdict
      // or breakdown; they are dropped here.
      slug: c.slug, name: c.name, score: c.score, tier: c.tier, sprite: c.sprite ?? null, avatar: sanitizeAvatar(c.avatar), kind: "citizen",
      quadrant: c.quadrant ?? null, warmth: c.warmth ?? null, competence: c.competence ?? null, judge: "UNRATIFIED", realityIndex: REALITY_INDEX,
    })),
    // Referred figures: breakdown once fact-checked (see publicFigure); the verdict and
    // the file's history come from /api/figure/<slug> when the file is opened.
    ...figures.map(censusFigure),
  ];
}
