// The floor's own machine: entering a floor (generation from its seed, the entities), rooms revealed
// on entry, the seal on an infested floor until every countable monster is filed (generator spawns
// and the Auditor never count), the loiter clock and THE AUDITOR's arrival through the nearest wall.
import { generateFloor } from "../gen/index.js";
import { fnv } from "../rng.js";
import { newPlayer, newMon, newCab, newPick } from "../entities.js";
import { HEAD } from "../input/word.js";
import { rebuildFlow } from "../ai/brain.js";

export const GRACE = 60;
export function enterFloor(st, th, f) {
  const fl = generateFloor(th, f, fnv(`${st.runSeed}|${f}`));
  const players = st.ents.filter(e => e.k === "player");
  st.fl = fl; st.floor = f; st.deepest = f > st.deepest ? f : st.deepest;
  st.ents = []; st.hatch = null; st.loiter = 0; st.stalker = false; st.sealed = fl.infested;
  st.rev = fl.rooms.map(() => 0); st.cabTotal = fl.cabs.length; st.cabLeft = fl.cabs.length;
  for (const s of st.seats) { s.keycard = -1; s.loiter = 0; }
  // the players at the arrival, in seat order, then everything the floor was populated with
  players.forEach((P, k) => { P.x = fl.arrival.x + (k % 2) * 0.6; P.y = fl.arrival.y + (k >> 1) * 0.6; P.roll = 0; P.atk = 0; P.stun = 0; st.ents.push(P); });
  if (!players.length) st.seats.forEach((s, k) => { s.ent = newPlayer(st, k, fl.arrival.x + (k % 2) * 0.6, fl.arrival.y + (k >> 1) * 0.6, st.lv.hearts * 4).id; });
  for (const c of fl.cabs) newCab(st, c.x, c.y, c.i, th.containers.cabinet.hp);
  for (const p of fl.picks) newPick(st, p.item, p.x, p.y, 0, p.item === "crate" ? `${f}-${st.crates++}` : null);
  for (const s of fl.spawns) newMon(st, th, s.k, s.x, s.y, { size: s.size, fx: s.fx, fy: s.fy });
  st.phase = "landing"; st.phaseT = GRACE;
  st.ev.push({ t: "floor.enter", f, infested: fl.infested, lift: fl.lift });
  reveal(st);
  rebuildFlow(st);
}

// Rooms revealed when a seat enters them (a doorway reveals both sides).
export function reveal(st) {
  const g = st.fl.g;
  for (const P of st.ents) {
    if (P.k !== "player" || P.dead) continue;
    const i = Math.floor(P.y) * g.w + Math.floor(P.x), r = g.room[i];
    if (r >= 0) open(st, r);
    else for (const D of st.fl.doors) if (D.i === i) { open(st, D.a); open(st, D.b); }
    if (st.fl.lift && r === st.fl.descentRoom && !st.lifts.includes(st.floor)) { st.lifts.push(st.floor); st.ev.push({ t: "lift.reached", f: st.floor }); }
  }
}
function open(st, r) { if (!st.rev[r]) { st.rev[r] = 1; st.ev.push({ t: "room", r }); } }

// The seal: an infested floor's descent opens when no countable monster is left.
export function sealCheck(st) {
  if (!st.sealed) return;
  for (const e of st.ents) if (e.k === "mon" && !e.dead && e.cnt) return;
  st.sealed = false; st.ev.push({ t: "infested.cleared" });
}

// The loiter clock: THE AUDITOR arrives on the tick, through the nearest wall, 9 tiles off.
export function loiterTick(st, th) {
  st.loiter++;
  for (const s of st.seats) s.loiter++;
  if (st.stalker || st.loiter !== st.lv.loiter * 60) return;
  st.stalker = true;
  let P = null; for (const p of st.ents) if (p.k === "player" && !p.dead) { P = p; break; }
  if (!P) return;
  const g = st.fl.g;
  let x = P.x + 9, y = P.y;
  for (let k = 0; k < 16; k++) {
    const h = HEAD[(k + st.frame) % 16], qx = P.x + h[0] * 9, qy = P.y + h[1] * 9;
    if (qx < 0.5 || qy < 0.5 || qx > g.w - 0.5 || qy > g.h - 0.5) continue;
    x = qx; y = qy;
    if (g.t[Math.floor(qy) * g.w + Math.floor(qx)] === 0) break;   // prefer a wall to come through
  }
  const A = newMon(st, th, Object.keys(th.monsters).find(k => th.monsters[k].arch === "stalker"), x, y);
  A.s = "chase";
  st.ev.push({ t: "stalker.arrive", x, y });
}
