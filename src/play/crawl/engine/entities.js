// The entity table: one plain object per thing on the floor, in one array (st.ents), ids from st.nextId.
//   player     one per seat                       {seat, hp (pips), roll, atk, toolCd, hurt, stun, fx, fy}
//   mon        a monster bound to an archetype    {k, a, hp, s (state), t (timer), cd, tgt, hx, hy, cnt, bound}
//   cab        a container (solid until broken)   {i (its tile), hp}
//   pick       a pickup                           {item, val, crate}
//   shot       a projectile                       {by: "seat" | "mon", vx, vy, life, dmg}
export const PIPS = 4;   // a heart
export function addEnt(st, e) { e.id = st.nextId++; e.dead = false; e.flash = 0; st.ents.push(e); return e; }
export function newPlayer(st, seat, x, y, hpMax) { return addEnt(st, { k: "player", seat, x, y, r: 0.3, hp: hpMax, hpMax, roll: 0, rdx: 0, rdy: 0, rollCd: 0, atk: 0, hits: [], toolCd: 0, hurt: 0, stun: 0, fx: 1, fy: 0 }); }
export function newMon(st, th, k, x, y, o = {}) {
  const M = th.monsters[k];
  const size = o.size || M.size || 1;
  const hp = M.arch === "splitter" ? size : M.hp ?? 1;
  return addEnt(st, {
    k: "mon", m: k, a: M.arch, x, y, r: M.arch === "splitter" ? M.r * (0.55 + 0.15 * size) : M.r, hp, hpMax: hp, size,
    s: "idle", t: 0, cd: 0, tgt: 0, hx: x, hy: y, seen: 999, stun: 0, fx: o.fx ?? 1, fy: o.fy ?? 0, dx: 0, dy: 0, dist: 0,
    bound: o.bound ?? -1, cnt: M.arch !== "stalker" && (o.bound ?? -1) < 0, age: 0, wx: x, wy: y,
  });
}
export const newCab = (st, x, y, i, hp) => addEnt(st, { k: "cab", x, y, r: 0.45, i, hp });
export const newPick = (st, item, x, y, val = 0, crate = null) => addEnt(st, { k: "pick", item, x, y, r: 0.3, val, crate });
export const newShot = (st, by, x, y, vx, vy, life, dmg, seat = -1) => addEnt(st, { k: "shot", by, x, y, vx, vy, r: 0.15, life, dmg, seat });
export const playerOf = (st, k) => st.ents.find(e => e.k === "player" && e.seat === k) || null;
