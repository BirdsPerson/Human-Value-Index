// The theme contract: what a pack must provide, checked once. Nothing in the engine knows a
// form-monster from a leopard; it reads these fields.
import { SUBBASEMENTS } from "./subbasements.js";

export const THEMES = { subbasements: SUBBASEMENTS };
const ARCHES = ["chaser", "swarm", "charger", "turret", "splitter", "brute", "generator", "stalker"];

export function validateTheme(th) {
  const bad = [];
  for (const k of ["id", "entry", "liftEvery", "firstLift", "bands", "monsters", "loot", "words"]) if (th[k] == null) bad.push(`missing ${k}`);
  for (const b of th.bands || []) {
    for (const k of ["from", "size", "rooms", "path", "loops", "infested", "roster", "loot", "groups"]) if (b[k] == null) bad.push(`band ${b.name}: missing ${k}`);
    for (const m of b.roster || []) if (!th.monsters[m]) bad.push(`band ${b.name}: no monster ${m}`);
    if (!th.loot[b.loot]) bad.push(`band ${b.name}: no loot table ${b.loot}`);
  }
  for (const [id, m] of Object.entries(th.monsters || {})) if (!ARCHES.includes(m.arch)) bad.push(`${id}: no archetype ${m.arch}`);
  if (!Object.values(th.monsters || {}).some(m => m.arch === "stalker")) bad.push("no stalker");
  return bad;
}
export const themeOf = (id) => THEMES[id] || null;
export function bandOf(th, f) { let b = th.bands[0]; for (const x of th.bands) if (f >= x.from) b = x; return b; }
export const isLiftFloor = (th, f) => f >= th.firstLift && (f - th.firstLift) % th.liftEvery === 0;
