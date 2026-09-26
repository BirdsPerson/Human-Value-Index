// Sprite looks come from the model. The prompt forbids crime props and weapons; this is the
// code-side backstop, shared by the referral function and the roster engine.
// ponytail: word list, not a classifier; extend it when a bad look slips through.
// Deliberately NOT banned (Scott, 2026-09-26): period uniforms and the insignia the person
// actually wore. Historical accuracy over caution for clothing; weapons stay banned.
const BANNED = [
  "prison", "prisoner", "inmate", "jail", "jailed", "convict", "handcuff", "handcuffs", "shackle", "shackles",
  "manacle", "manacles", "mugshot", "mug shot", "orange jumpsuit", "prison stripes", "booking photo",
  "gun", "guns", "pistol", "rifle", "revolver", "shotgun", "firearm", "musket", "knife", "knives", "dagger",
  "blade", "sword", "axe", "machete", "bomb", "grenade", "explosive", "dynamite", "noose", "gallows",
  "blood", "bloody", "bloodstained", "corpse", "victim", "victims", "weapon", "weapons",
];
const RE = new RegExp(`\\b(${BANNED.map(w => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/ /g, "[\\s-]+")).join("|")})\\b`, "i");

export const NEUTRAL_LOOK = "plain everyday civilian clothes in muted colours, neutral standing pose, hands at the sides, no props";

// The banned term found in a look, or null when it is clean.
export function unsafeLook(look) {
  const m = typeof look === "string" ? look.match(RE) : null;
  return m ? m[1].toLowerCase() : null;
}

// A look that is safe to draw: the model's own when clean, the neutral fallback otherwise.
export function safeLook(look) {
  const l = typeof look === "string" ? look.trim() : "";
  if (!l) return "";
  return unsafeLook(l) ? NEUTRAL_LOOK : l;
}
