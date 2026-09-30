// Synthetic rosters for the plan checks and the plan-builder benchmark (no network).
// Production-shaped: the figures on file plus engine figures shaped like what /api/pen
// sends (qualifier, tier object, warmth/competence, died, breakdown only once published;
// no stratum or place tendencies) and bare citizens (5%, capped at 200 like PEN_MAX), the
// same generator check-city.mjs uses. `rich: true` also gives engine figures the stratum
// and place tendencies the sim can read, so every input path is exercised.
import { FAMOUS_FIGURES, slugify, TIERS } from "../src/figures.js";
import { cube } from "../src/cube.js";

function prng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const OCC = {
  science: ["PHYSICIST", "CHEMIST", "BIOLOGIST", "MATHEMATICIAN", "ENGINEER", "COMPUTER SCIENTIST", "ECONOMIST", "PSYCHOLOGIST"],
  arts: ["ACTOR", "WRITER", "SINGER", "MUSICIAN", "FILM DIRECTOR", "PAINTER", "COMPOSER", "PHOTOGRAPHER", "COMEDIAN", "ARCHITECT"],
  politics: ["POLITICIAN", "MILITARY PERSONNEL", "NOBLEMAN", "DIPLOMAT", "JUDGE", "LAWYER"],
  sport: ["SOCCER PLAYER", "ATHLETE", "BASKETBALL PLAYER", "CYCLIST", "TENNIS PLAYER", "BOXER", "RACING DRIVER", "CHESS PLAYER"],
  religion: ["RELIGIOUS FIGURE"], business: ["BUSINESSPERSON"], activism: ["SOCIAL ACTIVIST", "JOURNALIST"], crime: ["EXTREMIST", "MAFIOSO", "PIRATE"],
};
const TEND = ["dive bar", "cafe", "park", "street", "market", "library", "university", "lab", "studio", "theatre", "concert hall", "stadium", "gym", "cathedral", "temple", "hospital", "school", "courthouse", "city hall", "parliament", "barracks", "bank", "office tower", "harbour", "museum", "casino", "prison", "farm", "workshop", "archive"];
const DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
const tierW = [[0, 0.03], [1, 0.3], [2, 0.35], [3, 0.14], [4, 0.1], [5, 0.08]];

export const onFile = () => FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" }));

// -> the whole roster (figures on file included), n subjects.
export function synthRoster(n, { seed = 42, rich = false } = {}) {
  const R = prng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const randTier = () => { let r = R(); for (const [i, w] of tierW) { if ((r -= w) <= 0) return TIERS[i].label; } return TIERS[2].label; };
  const out = onFile();
  const rest = Math.max(0, n - out.length);
  const nCit = Math.min(200, Math.round(rest * 0.05));
  for (let i = 0; i < nCit; i++) out.push({ slug: `citizen-s${i}`, name: `Citizen S${i}`, tier: randTier(), score: 500, warmth: Math.round(R() * 100), competence: Math.round(R() * 100), kind: "citizen" });
  for (let i = 0; out.length < n; i++) {
    const service = R() < 0.2, crime = !service && R() < 0.1;
    const domain = service ? "service" : crime ? "crime" : pick(Object.keys(OCC).filter(k => k !== "crime"));
    const occupation = service ? pick(["nurse", "missionary", "social worker"]) : pick(OCC[domain]);
    const tier = crime ? pick([TIERS[4].label, TIERS[5].label]) : randTier();
    const breakdown = Object.fromEntries(DIMS.map(d => [d, Math.round(R() * 100)]));
    const { warmth, competence, quadrant } = cube(breakdown);
    const s = {
      slug: `engine-s${i}`, name: `Engine Subject ${i}`, baseName: `Engine Subject ${i}`,
      qualifier: R() < 0.12 ? occupation.toLowerCase() : null,
      tier: TIERS.find(t => t.label === tier), score: 500,
      warmth, competence, quadrant,
      breakdown: R() < 0.85 ? breakdown : null,
      died: R() < 0.45 ? "1900-01-01" : null,
      kind: "figure", engine: true,
    };
    if (rich) { s.stratum = { domain, occupation }; s.places = [pick(TEND), pick(TEND)]; }
    out.push(s);
  }
  return out;
}
