// The Substrate's population, as a pure merge: the figures on file plus everyone the
// census (/api/pen) returns, deduped the same way everywhere. useRoster (the browser)
// and the social tick (netlify/functions/social-tick.js) both build it here, so every
// viewer and the server simulate the same people.
import { FAMOUS_FIGURES, slugify } from "../figures.js";

export const baseRoster = () => FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" }));

// A referral of someone already on file is the same person: skip it by name or slug.
export function mergeCensus(censusSubjects) {
  const have = new Set(FAMOUS_FIGURES.flatMap(f => [f.name, slugify(f.name)]));
  const out = [];
  for (const s of censusSubjects || []) {
    if (!s || !s.name || typeof s.score !== "number") continue;
    const slug = s.slug || slugify(s.baseName || s.name);
    if (have.has(s.name) || have.has(slug) || (s.baseName && have.has(s.baseName))) continue;
    have.add(s.name); have.add(slug);
    out.push({ ...s, slug, kind: s.kind === "citizen" ? "citizen" : "figure" });
  }
  return out;
}

export const fullRoster = (censusSubjects) => [...baseRoster(), ...mergeCensus(censusSubjects)];
