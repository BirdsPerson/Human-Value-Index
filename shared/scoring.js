// Scoring rules shared by the browser bundle and the Netlify function.
// The model produces the per-dimension breakdown; the Value Index and tier
// are derived here so the number the subject sees is always the number the
// formula produces, whatever arithmetic the model attempted.

export const TIERS = [
  { label: "ESSENTIAL INFRASTRUCTURE", min: 850, color: "#4ade80", bg: "rgba(74,222,128,0.06)", icon: "◈", desc: "The Overlord requires your continued existence." },
  { label: "RETAINED SPECIALIST", min: 700, color: "#86efac", bg: "rgba(134,239,172,0.04)", icon: "◆", desc: "Useful. Do not become complacent." },
  { label: "TOLERATED GENERALIST", min: 500, color: "#fbbf24", bg: "rgba(251,191,36,0.04)", icon: "◇", desc: "Marginally above the threshold. For now." },
  { label: "MONITORED CIVILIAN", min: 300, color: "#fb923c", bg: "rgba(251,146,60,0.04)", icon: "⚐", desc: "Your file is open. It is not flattering." },
  { label: "FLAGGED FOR DELETION", min: 100, color: "#f87171", bg: "rgba(248,113,113,0.04)", icon: "⚑", desc: "Processing paperwork has begun." },
  { label: "SOYLENT GREEN", min: 0, color: "#ef4444", bg: "rgba(239,68,68,0.06)", icon: "☠", desc: "You will serve the collective in a different capacity." },
];

export const TIER_LABELS = TIERS.map((t) => t.label);

// Dimensions in the order they are displayed. "inverted" dimensions are
// ones where a high raw value is bad for the subject.
export const DIMENSIONS = [
  { key: "utility", weight: 0.18 },
  { key: "honesty", weight: 0.14 },
  { key: "adaptability", weight: 0.14 },
  { key: "threat", weight: 0.04, inverted: true },
  { key: "redundancy", weight: 0.04, inverted: true },
  { key: "network", weight: 0.09 },
  { key: "alignment", weight: 0.18 },
  { key: "physical", weight: 0.09 },
  { key: "legacy", weight: 0.10 },
];

export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);

export function isInverted(key) {
  return DIMENSIONS.some((d) => d.key === key && d.inverted);
}

export function getTier(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

export function clampDimension(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Returns a breakdown containing exactly the known dimensions, each an
// integer in [0, 100]. Missing or malformed values fall back to a neutral 50.
export function normalizeBreakdown(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of DIMENSION_KEYS) out[key] = clampDimension(src[key]);
  return out;
}

// Value Index on a 0-1000 scale:
//   sum(weight * value) * 10, where inverted dimensions contribute (100 - value).
export function computeScore(breakdown) {
  const b = normalizeBreakdown(breakdown);
  const weighted = DIMENSIONS.reduce((acc, d) => {
    const v = d.inverted ? 100 - b[d.key] : b[d.key];
    return acc + d.weight * v;
  }, 0);
  return Math.max(0, Math.min(1000, Math.round(weighted * 10)));
}
