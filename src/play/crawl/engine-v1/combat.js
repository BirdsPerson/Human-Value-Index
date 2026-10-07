// Combat: facing melee (windup / active / recovery), the aim-assist cone and the snap, the roll's
// i-frames, knockback that never goes into a wall, hit-stop as sim frames, the tool (the stapler gun).
// Every number here is a v1 contract (scripts/fixtures/crawl-v1-records.json replays it).
import { moveBox, los, T, solidAt } from "./grid.js";
import { HEAD } from "./input/word.js";
import { newShot, newPick, newMon, PIPS } from "./entities.js";
import { rollTable, bountyValue, hatchRoll } from "./loot.js";
import { packAdd } from "./items.js";

export const HZ = 60;
export const WALK = 4.5 / HZ, RUN = 6.5 / HZ;
export const ROLL_F = 18, ROLL_I0 = 3, ROLL_I1 = 15, ROLL_TILES = 3.5, ROLL_CD = 8;   // i-frames: 12 of 18
export const ATK_WIND = 6, ATK_ACTIVE = 4, ATK_REC = 8, ATK_F = ATK_WIND + ATK_ACTIVE + ATK_REC, REACH = 1.2, ARC_COS = 0.5;
export const HITSTOP = 3, KNOCK = 1, ASSIST_RANGE = 6, SNAP_COS = 0.9238795325112867, SNAP_SIN = 0.3826834323650898;
export const TOOL_CD = 20, STAPLE_V = 0.3, STAPLE_RANGE = 8, HURT_MERCY = 30, PLAYER_KNOCK = 0.5;

export const iframe = (P) => P.roll > 0 && ROLL_F - P.roll >= ROLL_I0 && ROLL_F - P.roll < ROLL_I1;
const unit = (x, y) => { const n = Math.sqrt(x * x + y * y); return n > 1e-9 ? [x / n, y / n, n] : [0, 0, 0]; };

// The assisted target: the nearest live monster within the cone of facing, 6 tiles, in sight.
export function assisted(st, P, coneCos) {
  let best = null, bd = 1e9;
  for (const e of st.ents) {
    if (e.k !== "mon" || e.dead || e.a === "stalker") continue;
    const [ux, uy, d] = unit(e.x - P.x, e.y - P.y);
    if (d > ASSIST_RANGE || d >= bd) continue;
    if (d > 0.5 && ux * P.fx + uy * P.fy < coneCos) continue;
    if (!los(st.fl.g, P.x, P.y, e.x, e.y)) continue;
    best = e; bd = d;
  }
  return best;
}
// turn facing toward (tx, ty) by at most 22.5 degrees
function snap(P, tx, ty) {
  const [ux, uy] = unit(tx, ty), c = P.fx * ux + P.fy * uy;
  if (c >= SNAP_COS) { P.fx = ux; P.fy = uy; return; }
  const s = P.fx * uy - P.fy * ux >= 0 ? SNAP_SIN : -SNAP_SIN;
  const nx = P.fx * SNAP_COS - P.fy * s, ny = P.fx * s + P.fy * SNAP_COS, [ax, ay] = unit(nx, ny);
  P.fx = ax; P.fy = ay;
}

// knock e up to `dist` tiles along (ux, uy), in tenth-tile steps, stopping before any wall
export function knock(g, e, ux, uy, dist, crowd = null) {
  const n = Math.round(dist * 10);
  for (let k = 0; k < n; k++) {
    const x = e.x, y = e.y, blocked = moveBox(g, e, ux * 0.1, uy * 0.1);
    // a swarm body is never knocked onto a tile that already holds two
    if (crowd && Math.floor(e.y) * g.w + Math.floor(e.x) !== Math.floor(y) * g.w + Math.floor(x) && crowd(Math.floor(e.y) * g.w + Math.floor(e.x)) >= 2) { e.x = x; e.y = y; break; }
    if (blocked) break;
  }
}

// Damage to the player (scaled by the level's dial unless `raw`): none in the roll's i-frames or the mercy after a hit.
export function hurt(st, P, dmg, sx, sy, raw = false, what = null) {
  if (P.dead || P.hp <= 0) return 0;
  if (iframe(P)) { st.ev.push({ t: "evade", seat: P.seat }); return 0; }
  if (P.hurt > 0) return 0;
  const d = raw ? dmg : Math.max(1, Math.round(dmg * st.lv.dmg));
  P.hp -= d; P.hurt = HURT_MERCY; P.flash = 10;
  const [ux, uy] = unit(P.x - sx, P.y - sy);
  knock(st.fl.g, P, ux, uy, PLAYER_KNOCK);
  st.ev.push({ t: "hurt", seat: P.seat, dmg: d, x: P.x, y: P.y, what });
  return d;
}

// A hit on a monster or a container. kx, ky: the knockback's direction (0, 0 for none).
export function hitThing(st, th, e, dmg, kx, ky, by) {
  if (e.k === "cab") {
    e.hp -= dmg; e.flash = 8; st.ev.push({ t: "hit", x: e.x, y: e.y, what: "cab" });
    if (e.hp <= 0) breakCab(st, th, e, by);
    return true;
  }
  if (e.a === "stalker") { st.ev.push({ t: "clank", x: e.x, y: e.y }); return false; }
  e.hp -= dmg; e.flash = 8;
  st.ev.push({ t: "hit", x: e.x, y: e.y, what: e.m });
  const movable = e.a !== "turret" && e.a !== "generator";
  if (movable && (kx || ky)) knock(st.fl.g, e, kx, ky, KNOCK, e.a === "swarm" ? (i) => crowdOn(st, i, e) : null);
  if (e.a === "charger" && e.s === "tele") { e.s = "chase"; e.cd = 60; }
  if (e.hp <= 0) kill(st, th, e, by);
  return true;
}

function crowdOn(st, i, self) {
  const w = st.fl.g.w; let c = 0;
  for (const o of st.ents) if (o !== self && !o.dead && o.k === "mon" && o.a === "swarm" && Math.floor(o.y) * w + Math.floor(o.x) === i) c++;
  return c;
}
function dropAt(st, th, kind, x, y) {
  const lt = th.loot[st.band.loot];
  const k = rollTable(st, kind === "cab" ? lt.container : lt.kill);
  if (k === "none") return;
  if (k === "form00") { if (st.fl.form00 >= 1) return; st.fl.form00++; }
  if (k === "bounty") { newPick(st, "bounty", x, y, bountyValue(st, th, st.floor, 0, lt)); return; }
  if (k === "crate") { newPick(st, "crate", x, y, 0, `${st.floor}-${st.crates++}`); return; }
  newPick(st, k, x, y);
}
function maybeHatch(st, kind, x, y, group = 1) {
  if (st.fl.lift || st.fl.last || st.hatch) return;
  if (!hatchRoll(st, kind, st.cabLeft, st.cabTotal, st.lv.hatch, group)) return;
  const g = st.fl.g, i = Math.floor(y) * g.w + Math.floor(x);
  if (g.t[i] !== T.FLOOR) return;
  g.t[i] = T.HATCH; st.hatch = { i, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
  st.ev.push({ t: "hatch.open", x: st.hatch.x, y: st.hatch.y });
}
export function breakCab(st, th, e, by) {
  e.dead = true; st.fl.g.t[e.i] = T.FLOOR; st.flowDirty = true; st.cabLeft--;
  st.stats.cabs++;
  st.ev.push({ t: "break", x: e.x, y: e.y, seat: by });
  dropAt(st, th, "cab", e.x, e.y);
  maybeHatch(st, "cab", e.x, e.y);
}
export function kill(st, th, e, by) {
  e.dead = true;
  st.ev.push({ t: "kill", x: e.x, y: e.y, what: e.m, seat: by, bound: e.bound >= 0 });
  if (e.a === "splitter" && e.size > 1) {
    const s = e.size - 1, px = -e.fy || 0, py = e.fx || 1;
    for (const sg of [-1, 1]) {
      const c = newMon(st, th, e.m, e.x, e.y, { size: s, bound: e.bound });
      knock(st.fl.g, c, px * sg, py * sg, 0.4);
      c.s = "chase"; c.stun = 20; c.hx = e.hx; c.hy = e.hy; c.seen = 0;
    }
    st.ev.push({ t: "split", x: e.x, y: e.y });
  }
  if (e.bound >= 0) return;   // a generator's spawn pays nothing and rolls nothing
  st.stats.kills++;
  dropAt(st, th, "kill", e.x, e.y);
  const M = th.monsters[e.m];
  maybeHatch(st, "kill", e.x, e.y, M.group || (M.arch === "splitter" ? (1 << (M.size || 1)) - 1 : 1));
}

// One seat's player for one frame. w: the unpacked word; press: the buffered presses.
export function playerFrame(st, th, seat, P, w) {
  const g = st.fl.g;
  if (P.flash > 0) P.flash--;
  if (P.hurt > 0) P.hurt--;
  if (P.toolCd > 0) P.toolCd--;
  if (P.rollCd > 0) P.rollCd--;
  seat.lock = w.lock;
  seat.slot = w.slot < 12 ? w.slot : 11;
  if (P.stun > 0) { P.stun--; return; }
  const want = (b) => (seat.buf & b) !== 0, take = (b) => { seat.buf &= ~b; };
  // the roll
  if (P.roll > 0) {
    P.roll--;
    moveBox(g, P, P.rdx * (ROLL_TILES / ROLL_F), P.rdy * (ROLL_TILES / ROLL_F));
    if (P.roll === 0) P.rollCd = ROLL_CD;
    return;
  }
  if (want(1 << 7) && P.rollCd === 0 && P.atk <= ATK_REC) {
    take(1 << 7);
    const [dx, dy] = w.mag ? HEAD[w.head] : [P.fx, P.fy];
    P.roll = ROLL_F; P.rdx = dx; P.rdy = dy; P.atk = 0; P.hits = [];
    st.ev.push({ t: "roll", seat: seat.k });
    moveBox(g, P, P.rdx * (ROLL_TILES / ROLL_F), P.rdy * (ROLL_TILES / ROLL_F)); P.roll--;
    return;
  }
  // facing follows movement unless the aim lock holds it
  if (w.mag && !w.lock && P.atk === 0) { P.fx = HEAD[w.head][0]; P.fy = HEAD[w.head][1]; }
  // the attack
  if (P.atk === 0 && (want(1 << 6) || w.attack)) {
    take(1 << 6);
    P.atk = ATK_F; P.hits = [];
    if (st.cfg.controls !== "manual") { const tg = assisted(st, P, st.lv.coneCos); if (tg) snap(P, tg.x - P.x, tg.y - P.y); }
    st.ev.push({ t: "swing", seat: seat.k, x: P.x, y: P.y, fx: P.fx, fy: P.fy });
  }
  if (P.atk > 0) {
    const e0 = ATK_F - P.atk;
    if (e0 >= ATK_WIND && e0 < ATK_WIND + ATK_ACTIVE) {
      let landed = false;
      for (const e of st.ents) {
        if (e.dead || (e.k !== "mon" && e.k !== "cab") || P.hits.includes(e.id)) continue;
        const dx = e.x - P.x, dy = e.y - P.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > REACH + e.r) continue;
        if (d > 0.45 && (dx * P.fx + dy * P.fy) / d < ARC_COS) continue;
        if (e.k === "cab" ? false : !los(g, P.x, P.y, e.x, e.y)) continue;
        P.hits.push(e.id);
        const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [P.fx, P.fy];
        if (hitThing(st, th, e, 1, ux, uy, seat.k)) landed = true;
      }
      if (landed) st.hitstop = HITSTOP;
    }
    P.atk--;
  }
  // the tool: the stapler gun, at the assisted target or along facing
  if (P.toolCd === 0 && (want(1 << 8) || w.tool)) {
    take(1 << 8);
    const tg = assisted(st, P, st.lv.coneCos);
    let [ux, uy] = tg ? unit(tg.x - P.x, tg.y - P.y) : [P.fx, P.fy];
    if (!ux && !uy) { ux = P.fx; uy = P.fy; }
    newShot(st, "seat", P.x + ux * 0.35, P.y + uy * 0.35, ux * STAPLE_V, uy * STAPLE_V, Math.ceil(STAPLE_RANGE / STAPLE_V), 1, seat.k);
    P.toolCd = TOOL_CD;
    st.ev.push({ t: "staple", seat: seat.k, x: P.x, y: P.y });
  }
  // movement
  if (w.mag) {
    const sp = (w.mag >= 2 ? RUN : WALK) * (P.atk > ATK_REC ? 0.35 : P.atk > 0 ? 0.6 : 1);
    moveBox(g, P, HEAD[w.head][0] * sp, HEAD[w.head][1] * sp);
  }
}

// Projectiles for one frame.
export function shotFrame(st, th, s) {
  s.x += s.vx; s.y += s.vy; s.life--;
  if (s.life <= 0 || solidAt(st.fl.g, s.x, s.y)) {
    if (s.by === "seat") { const g = st.fl.g, i = Math.floor(s.y) * g.w + Math.floor(s.x); const c = g.t[i] === T.CAB ? st.ents.find(e => e.k === "cab" && !e.dead && e.i === i) : null; if (c) hitThing(st, th, c, s.dmg, 0, 0, s.seat); }
    s.dead = true; return;
  }
  if (s.by === "seat") {
    for (const e of st.ents) {
      if (e.dead || e.k !== "mon" || e.a === "stalker") continue;
      const dx = e.x - s.x, dy = e.y - s.y;
      if (dx * dx + dy * dy <= (e.r + s.r) * (e.r + s.r)) { hitThing(st, th, e, s.dmg, s.vx / STAPLE_V * 0.5, s.vy / STAPLE_V * 0.5, s.seat); s.dead = true; return; }
    }
  } else {
    for (const P of st.ents) {
      if (P.k !== "player" || P.dead) continue;
      const dx = P.x - s.x, dy = P.y - s.y;
      if (dx * dx + dy * dy <= (P.r + s.r) * (P.r + s.r)) { if (iframe(P)) continue; hurt(st, P, s.dmg, s.x - s.vx, s.y - s.vy, false, s.what || null); s.dead = true; return; }
    }
  }
}

// Pickups touched: BOUNTY PAPER tallies, keycards are slotless, the rest go in the pack (or PACK FULL).
export function pickupFrame(st, seat, P) {
  for (const e of st.ents) {
    if (e.k !== "pick" || e.dead) continue;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (dx * dx + dy * dy > 0.42) continue;
    if (e.item === "bounty") { seat.bounty += e.val; e.dead = true; st.ev.push({ t: "pickup", item: "bounty", val: e.val, seat: seat.k, x: e.x, y: e.y }); continue; }
    if (e.item === "keycard") { seat.keycard = st.floor; e.dead = true; st.ev.push({ t: "pickup", item: "keycard", seat: seat.k, x: e.x, y: e.y }); continue; }
    const slot = packAdd(seat.pack, e.item === "crate" ? { k: "crate", id: e.crate } : { k: e.item });
    if (slot < 0) { if (seat.fullT === 0) st.ev.push({ t: "pack.full", seat: seat.k }); seat.fullT = 90; continue; }
    e.dead = true; st.ev.push({ t: "pickup", item: e.item, seat: seat.k, slot, x: e.x, y: e.y });
  }
  if (seat.fullT > 0) seat.fullT--;
}
export { PIPS };
