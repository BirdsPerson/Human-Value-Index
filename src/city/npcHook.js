// The NPC shops' stock hook (docs/CITY_SPEC.md "The NPC shops"). The shelves' code (npcShops.jsx)
// loads the first time a storefront room is drawn, so none of it is in the entry bundle; until it
// is here, NPC.draw / NPC.hits are null and a shop room is drawn as it always was.
export const NPC = { draw: null, hits: null, ready: false };
let P = null;
export function ensureNpc() {
  if (P || typeof window === "undefined") return;
  P = import("./npcShops.jsx").then(m => { Object.assign(NPC, m.api); NPC.ready = true; }).catch(() => { P = null; });
}
