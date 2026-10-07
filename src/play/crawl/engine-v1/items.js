// The pack: 12 slots. COFFEE heals two hearts (Gauntlet's food); FORM 00 clears every projectile and
// staggers everything in view (one per floor at most); a SALVAGE CRATE is a crate until the server
// opens it (D2); KEYCARDs are slotless and floor-scoped; BOUNTY PAPER is tallied, never an object.
// A loss costs the pack and nothing else: it is left where you fell, for its owner's seat only.
export const PACK_SLOTS = 12;
export const ITEM = {
  coffee: { name: "COFFEE", slot: true },
  form00: { name: "FORM 00", slot: true },
  crate: { name: "SALVAGE CRATE", slot: true },
  keycard: { name: "KEYCARD", slot: false },
  bounty: { name: "BOUNTY PAPER", slot: false },
};
export const emptyPack = () => { const p = new Array(PACK_SLOTS); for (let i = 0; i < PACK_SLOTS; i++) p[i] = null; return p; };
export function packAdd(pack, item) { for (let i = 0; i < pack.length; i++) if (!pack[i]) { pack[i] = item; return i; } return -1; }
export const packItems = (pack) => pack.filter(Boolean).map(it => (it.k === "crate" ? `crate:${it.id}` : it.k));
