// The run state machine (docs/design/DUNGEON.md 3.3): LANDING (60 frames of grace) -> FLOOR ->
// DESCENT (the stairwell or a hatch) -> LANDING on the next floor; LIFT on a lift floor (the pack is
// kept, the run files with exit "lift"); LOST on hearts 0 or the shift clock (the pack is lost either
// way: the only way to keep a pack is a lift). Lifts reached stay reached, whichever way the run ends.
import { packItems, emptyPack } from "../items.js";

export const SHIFT = 72000, SHIFT_WARN = [64800, 68400];   // 20:00, warnings at 18:00 and 19:00
export const DESCENT_F = 40, LIFT_F = 60, LOST_F = 90;

export function lose(st, why) {
  if (st.phase === "lost" || st.phase === "filed" || st.phase === "lift") return;
  st.phase = "lost"; st.phaseT = LOST_F; st.exit = "lost"; st.why = why;
  for (const s of st.seats) {
    const P = st.ents.find(e => e.id === s.ent);
    // hearts: the pack is left where you fell, for its owner's seat only; the shift: the cleaners take it
    if (why === "hearts" && P) st.drops.push({ seat: s.k, owner: s.caseHash, f: st.floor, x: P.x, y: P.y, items: packItems(s.pack) });
    s.pack = emptyPack(); s.bounty = 0;
  }
  st.ev.push({ t: "lost", why });
}
export function callLift(st) {
  if (st.phase !== "floor" && st.phase !== "landing") return;
  st.phase = "lift"; st.phaseT = LIFT_F; st.exit = "lift"; st.why = null;
  st.ev.push({ t: "lift.called", f: st.floor });
}
export function claimOf(st) {
  const s = st.seats[0], lift = st.exit === "lift";
  return { depth: st.deepest, exit: st.exit, why: st.why, lifts: [...st.lifts], pack: lift ? packItems(s.pack) : [], bounty: lift ? s.bounty : 0, filedAt: st.filedAt };
}
