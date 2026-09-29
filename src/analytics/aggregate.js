// Analytics for the Public Figure Index: pure aggregation, no DOM.
// Everything is computed from the roster at hand (figures.js + /api/pen figures), so the
// charts grow with it. Tier cutoffs come from TIERS (calibration.json), never hardcoded.
// Check: scripts/check-analytics.mjs.

import { TIERS, getTier, slugify } from "../figures.js";
import { fieldsOf } from "../city/sim.js";

export const DIMS = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
export const LOWER_IS_BETTER = new Set(["threat", "redundancy"]);
export const QUADRANTS = ["ADMIRED", "ENVIED", "TRUSTED RESERVE", "DISMISSED"];

const keyOf = (s) => s.slug || slugify(s.baseName || s.name || "");

// Static roster first; a referral with the same name or slug is the same subject.
export function mergeRoster(staticFigures = [], penSubjects = []) {
  const seen = new Set(), out = [];
  const add = (s, source) => {
    if (!s || !s.name || typeof s.score !== "number") return;
    const k1 = s.name, k2 = keyOf(s);
    if (seen.has(k1) || seen.has(k2)) return;
    seen.add(k1); seen.add(k2);
    out.push({ ...s, source });
  };
  for (const s of staticFigures) add(s, "record");
  for (const s of penSubjects) if (s && s.kind === "figure" && !s.removed) add(s, s.engine ? "engine" : "referral");
  return out;
}

export function tierCounts(subjects) {
  const n = subjects.length;
  return TIERS.map(t => {
    const count = subjects.filter(s => getTier(s.score).label === t.label).length;
    return { label: t.label, icon: t.icon, color: t.color, min: t.min, count, pct: n ? count / n : 0 };
  });
}

// Buckets of `size` over 0-1000; the last bucket is closed (1000 lands in 950-1000).
export function histogram(subjects, size = 50) {
  const buckets = [];
  for (let lo = 0; lo < 1000; lo += size) buckets.push({ lo, hi: Math.min(lo + size, 1000), count: 0 });
  for (const s of subjects) {
    const i = Math.min(buckets.length - 1, Math.max(0, Math.floor(s.score / size)));
    buckets[i].count++;
  }
  return buckets;
}

export function tierMarkers() {
  return TIERS.filter(t => t.min > 0).map(t => ({ label: t.label, min: t.min, icon: t.icon }));
}

export function quadrantShare(subjects) {
  const n = subjects.length;
  const rows = QUADRANTS.map(q => ({ label: q, count: subjects.filter(s => s.quadrant === q).length }));
  const placed = rows.reduce((a, r) => a + r.count, 0);
  rows.push({ label: "UNPLACED", count: n - placed });
  return rows.map(r => ({ ...r, pct: n ? r.count / n : 0 })).filter(r => r.count > 0 || r.label !== "UNPLACED");
}

// Mean per dimension over subjects whose breakdown assesses it; n per dimension.
export function categoryProfile(subjects) {
  return DIMS.map(d => {
    const vals = subjects.map(s => s.breakdown?.[d]).filter(v => typeof v === "number");
    return { dim: d, n: vals.length, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, lowerIsBetter: LOWER_IS_BETTER.has(d) };
  });
}

// Year from an ISO-ish date ("1946-01-19", "-0069-01-01").
export function yearOf(date) {
  const m = /^(-?\d{1,4})/.exec(String(date || ""));
  return m ? Number(m[1]) : null;
}

export const ERAS = [
  { id: "ancient", label: "ANCIENT", test: y => y < 500 },
  { id: "medieval", label: "MEDIEVAL", test: y => y >= 500 && y < 1500 },
  { id: "early-modern", label: "EARLY MODERN", test: y => y >= 1500 && y < 1800 },
  { id: "c19", label: "BORN 1800–1899", test: y => y >= 1800 && y < 1900 },
  { id: "c20", label: "BORN 1900-1959", test: y => y >= 1900 && y < 1960 },
  { id: "contemporary", label: "BORN 1960+", test: y => y >= 1960 },
];
export function eraOf(s) {
  const y = yearOf(s.born);
  if (y === null) return null;
  return ERAS.find(e => e.test(y))?.label ?? null;
}

// The city's field reader (the same evidence that assigns jobs), folded into broad domains.
const DOMAIN_OF_FIELD = {
  "physics-theory": "SCIENCE", radiation: "SCIENCE", chemistry: "SCIENCE", math: "SCIENCE", science: "SCIENCE", medicine: "SCIENCE",
  computing: "TECHNOLOGY", engineering: "TECHNOLOGY", electrical: "TECHNOLOGY",
  music: "ARTS", visual: "ARTS", writing: "ARTS", screen: "ARTS", broadcast: "ARTS",
  sport: "SPORT", combat: "SPORT", coaching: "SPORT",
  politics: "POWER", royalty: "POWER", military: "POWER", law: "POWER",
  religion: "FAITH & PHILOSOPHY", philosophy: "FAITH & PHILOSOPHY",
  business: "MONEY", finance: "MONEY", management: "MONEY", advertising: "MONEY",
  activism: "ACTIVISM & CARE", care: "ACTIVISM & CARE", education: "ACTIVISM & CARE",
  crime: "CRIME",
};
export function domainOf(s) {
  const f = fieldsOf(s);
  let best = null, w = 0;
  for (const [k, v] of Object.entries(f)) if (DOMAIN_OF_FIELD[k] && v > w) { best = DOMAIN_OF_FIELD[k]; w = v; }
  return best;
}

// Average score per group; groups with n < minN are held back (and counted).
export function groupAverages(subjects, keyFn, minN = 3) {
  const g = new Map();
  let unknown = 0;
  for (const s of subjects) {
    const k = keyFn(s);
    if (!k) { unknown++; continue; }
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(s.score);
  }
  const rows = [...g.entries()].map(([label, xs]) => ({ label, n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length }));
  const shown = rows.filter(r => r.n >= minN).sort((a, b) => b.mean - a.mean);
  const held = rows.filter(r => r.n < minN).reduce((a, r) => a + r.n, 0);
  return { rows: shown, held, unknown };
}

export function coverage(subjects) {
  const n = subjects.length;
  const by = (src) => subjects.filter(s => s.source === src).length;
  const record = by("record"), referral = by("referral"), engine = by("engine");
  const rated = subjects.filter(s => s.people && typeof s.people.likability === "number").length;
  return { n, record, referral, engine, otherSource: n - record - referral - engine, rated, unrated: n - rated };
}

export function topBottom(subjects, k = 10) {
  const sorted = [...subjects].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { top: sorted.slice(0, k), bottom: sorted.slice(-k).reverse(), n: sorted.length };
}

// Points for the warmth x competence scatter (subjects that have both).
export function scatterPoints(subjects) {
  return subjects.filter(s => typeof s.warmth === "number" && typeof s.competence === "number")
    .map(s => ({ name: s.name, qualifier: s.qualifier, x: s.warmth, y: s.competence, quadrant: s.quadrant || "UNPLACED", score: s.score }));
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
