// THE SUB-BASEMENTS under Department Headquarters: a theme pack (docs/design/DUNGEON.md 3.6, 4).
// Data only: the bands, the room templates' names, the roster with each monster's numbers bound to
// an engine archetype, the loot tables, the words. D1 ships band 1 (STORAGE, B4-B8); deeper bands
// are D2. Damage is in pips: a heart is 4 pips.

export const SUBBASEMENTS = {
  id: "subbasements",
  entry: 4, liftEvery: 4, firstLift: 8, vaultEvery: 10,
  last: 8,   // D1: the deepest floor that exists (B8, the first lift); D2 opens the stairs below it
  depthLabel: (f) => `B${f}`,
  bands: [
    {
      from: 4, name: "STORAGE", size: [40, 28], rooms: [8, 11], path: [5, 7], loops: 0.1, water: 0, infested: 0.08,
      roster: ["feral-data", "form-27b", "file-cart", "toner-printer"], joins: { 6: "file-cart" }, generators: ["copier"],
      loot: "band1", strange: 0,
      // monster groups per floor (B4 is the quiet floor under the lift: the fewest)
      groups: { 4: 3, 5: 5, 6: 6, 7: 7, 8: 8 },
      machines: { store: 0.75, copier: 0.6, copierFrom: 5 },
      templates: ["storeroom", "storeroom", "offices", "shelving", "ring", "hall"],
    },
  ],
  // archetype + numbers. hp in hits (melee and the stapler gun each do 1); speed in tiles a second;
  // dmg in pips (x the level's damage dial); bounty is BOUNTY PAPER dropped on a kill (x depth)
  monsters: {
    "feral-data":    { name: "FERAL DATA", arch: "splitter", hp: 3, size: 3, speed: 1.7, wander: 1.1, dmg: 5, r: 0.36, sight: 7, bounty: 2, weight: 3 },
    "form-27b":      { name: "FORM 27-B", arch: "swarm", hp: 1, speed: 5.5, dmg: 4, r: 0.22, sight: 8, group: 6, bounty: 1, weight: 3 },
    "file-cart":     { name: "FILE CART", arch: "charger", hp: 4, speed: 3.2, charge: 11, chargeTiles: 8, dmg: 7, r: 0.4, sight: 8, bounty: 4, weight: 2 },
    "toner-printer": { name: "TONER PRINTER", arch: "turret", hp: 3, period: 90, shot: 7, range: 9, dmg: 4, r: 0.42, sight: 9, bounty: 3, weight: 2 },
    "copier":        { name: "THE COPIER", arch: "generator", hp: 6, every: 360, spawn: "form-27b", max: 6, r: 0.48, sight: 10, bounty: 6 },
    "auditor":       { name: "THE AUDITOR", arch: "stalker", dmg: 8, r: 0.45, pause: 120 },
  },
  containers: { cabinet: { name: "FILING CABINET", hp: 2 } },
  // what a broken container gives (weights; the daily condition multiplies these from D2)
  loot: {
    band1: {
      container: [["bounty", 52], ["coffee", 13], ["none", 27], ["form00", 3], ["crate", 5]],
      kill: [["bounty", 45], ["coffee", 4], ["none", 51]],
      bountyPaper: [1, 3],
    },
  },
  // salvage the crates will open to (resolved by the server from D2; listed so the lobby can say so)
  salvage: ["DECOMMISSIONED TERMINAL", "FILING CABINET, DENTED", "SURPLUS COT", "DEPARTMENT COVERALLS", "VISITOR LANYARD", "B-12 HARD HAT"],
  words: {
    descend: "GO DOWN", lift: "CALL THE LIFT", pack: "PACK", stairs: "STAIRWELL", hatch: "HATCH",
    sealed: "SEALED: CLEAR THE FLOOR", locked: "LOCKED: NEEDS THE KEYCARD", packFull: "PACK FULL",
    lostHearts: "YOU WERE FOUND BY THE NIGHT CLEANERS. YOUR PACK WAS NOT.",
    lostShift: "SHIFT OVER. THE CLEANERS TOOK WHAT YOU CARRIED. THE LIFT WOULD HAVE TAKEN YOU.",
  },
  capture: null,
};
