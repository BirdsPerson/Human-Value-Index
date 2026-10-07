// Per-seat control state. Everything per human lives in st.seats[k]; nothing outside it.
export function newSeat(k, entId, caseHash, pack) {
  return { k, ent: entId, caseHash: caseHash ?? null, prev: 0, buf: 0, bufT: 0, slot: 0, lock: false, fx: 1, fy: 0, pack, bounty: 0, keycard: -1, down: false, loiter: 0, fullT: 0 };
}
