// Populate: containers (filing cabinets; solid until broken, never cutting a room in two), spawns by
// band from the roster (never in the arrival room, never within 6 tiles of or in sight of its door,
// weighted toward the route), the machines' contents, pickups. Containers weighted to side rooms.
import { T, N8, bfs, los, passable } from "../grid.js";
import { draw, drawInt, chance, pick, shuffle } from "../rng.js";

const cx = (g, i) => (i % g.w) + 0.5, cy = (g, i) => Math.floor(i / g.w) + 0.5;
function nearDoor(g, i) { const x = i % g.w, y = (i - x) / g.w; for (const [dx, dy] of N8) { const t = g.t[(y + dy) * g.w + x + dx]; if (t === T.DOOR || t === T.LOCKED) return true; } return false; }
const wallSide = (g, i) => g.t[i - 1] === T.WALL || g.t[i + 1] === T.WALL || g.t[i - g.w] === T.WALL || g.t[i + g.w] === T.WALL;

export function populate(B, r, plan, fl, th, mach) {
  const g = B.g, taken = new Set([fl.arrival.i, fl.descent.i]);
  const arrivalDoors = B.doors.filter(D => D.a === fl.arrivalRoom || D.b === fl.arrivalRoom).map(D => D.i);
  const safe = (i) => {
    if (g.room[i] === fl.arrivalRoom) return false;
    for (const d of arrivalDoors) {
      const dx = cx(g, i) - cx(g, d), dy = cy(g, i) - cy(g, d);
      if (dx * dx + dy * dy < 36.0001) return false;
      if (los(g, cx(g, i), cy(g, i), cx(g, d), cy(g, d))) return false;
    }
    return true;
  };
  const free = (R) => R.cells.filter(i => !taken.has(i) && g.t[i] === T.FLOOR);
  const roomCells = B.rooms.reduce((n, R) => n + R.cells.length, 0);
  const connectedWith = (i) => {   // would a cabinet at i keep every room cell reachable (locked doors counted open)?
    g.t[i] = T.WALL;
    const d = bfs(g, fl.arrival.i, (t) => t !== T.WALL && t !== T.CAB);
    let n = 0; for (const R of B.rooms) for (const c of R.cells) if (d[c] >= 0) n++;
    g.t[i] = T.FLOOR;
    return n === roomCells - fl.cabs.length - 1;
  };
  fl.cabs = []; fl.spawns = []; fl.picks = [];
  const addCab = (R) => {
    const c = shuffle(r, free(R).filter(i => !nearDoor(g, i) && wallSide(g, i)));
    for (const i of c.slice(0, 6)) if (connectedWith(i)) { taken.add(i); g.t[i] = T.CAB; fl.cabs.push({ x: cx(g, i), y: cy(g, i), i }); return true; }
    return false;
  };
  // the machines' contents first
  if (mach.store >= 0) {
    const S = B.rooms[mach.store], c = shuffle(r, free(S).filter(i => !nearDoor(g, i)));
    if (c[0] != null) { taken.add(c[0]); fl.picks.push({ item: "crate", x: cx(g, c[0]), y: cy(g, c[0]) }); }
    if (c[1] != null) { taken.add(c[1]); fl.picks.push({ item: "coffee", x: cx(g, c[1]), y: cy(g, c[1]) }); }
    addCab(S);
    const K = B.rooms[mach.keyRoom], k = shuffle(r, free(K).filter(i => !nearDoor(g, i)))[0] ?? free(K)[0];
    taken.add(k); fl.picks.push({ item: "keycard", x: cx(g, k), y: cy(g, k) }); fl.keycard = { x: cx(g, k), y: cy(g, k) };
  }
  if (mach.copier >= 0) {
    const R = B.rooms[mach.copier], c = free(R).filter(i => !nearDoor(g, i) && !wallSide(g, i) && safe(i));
    const i = c.length ? c[Math.floor(c.length / 2)] : null;
    if (i != null) { taken.add(i); fl.spawns.push({ k: "copier", x: cx(g, i), y: cy(g, i) }); }
  }
  // containers: side rooms 1-3, route rooms 0-1, never the arrival room on the entrance floor
  for (const R of B.rooms) {
    if (R.id === fl.arrivalRoom || R.id === mach.store) continue;
    const n = fl.off[R.id] >= 1 ? drawInt(r, 1, 3) : drawInt(r, 0, 1);
    for (let k = 0; k < n; k++) addCab(R);
  }
  // pickups in side rooms: a coffee sometimes, a FORM 00 rarely (one per floor at most, counting drops)
  const sides = B.rooms.filter(R => fl.off[R.id] >= 1 && R.id !== mach.store);
  const drop = (item) => { if (!sides.length) return; const R = pick(r, sides), c = free(R).filter(i => !nearDoor(g, i)); if (c.length) { const i = pick(r, c); taken.add(i); fl.picks.push({ item, x: cx(g, i), y: cy(g, i) }); } };
  if (chance(r, 0.4)) drop("coffee");
  if (chance(r, 0.2)) { drop("form00"); fl.form00 = 1; }
  // spawns: groups from the roster by weight, rooms weighted toward the route
  const mons = th.monsters, roster = plan.roster, wsum = roster.reduce((s, m) => s + (mons[m].weight || 1), 0);
  const rooms = B.rooms.filter(R => R.id !== fl.arrivalRoom && R.id !== mach.store);
  const bag = []; for (const R of rooms) for (let k = 0; k < (fl.off[R.id] === 0 ? 2 : 1); k++) bag.push(R.id);
  for (let gi = 0, tries = 0; gi < plan.groups && tries < plan.groups * 8; tries++) {
    let x = draw(r) * wsum, m = roster[0]; for (const id of roster) { x -= mons[id].weight || 1; if (x < 0) { m = id; break; } }
    const R = B.rooms[pick(r, bag)], M = mons[m];
    let cells = free(R).filter(safe);
    if (!cells.length) continue;
    if (M.arch === "turret") {
      // facing the room's middle with three clear tiles in front of it
      const mx = R.cells.reduce((s, i) => s + cx(g, i), 0) / R.cells.length, my = R.cells.reduce((s, i) => s + cy(g, i), 0) / R.cells.length;
      cells = cells.filter(i => {
        const dx = mx - cx(g, i), dy = my - cy(g, i), n = Math.sqrt(dx * dx + dy * dy); if (n < 1.5) return false;
        for (let s = 1; s <= 3; s++) if (!passable(g.t[Math.floor(cy(g, i) + dy / n * s) * g.w + Math.floor(cx(g, i) + dx / n * s)])) return false;
        return true;
      });
      if (!cells.length) continue;
      const i = pick(r, cells), dx = mx - cx(g, i), dy = my - cy(g, i), n = Math.sqrt(dx * dx + dy * dy);
      taken.add(i); fl.spawns.push({ k: m, x: cx(g, i), y: cy(g, i), fx: dx / n, fy: dy / n }); gi++;
      continue;
    }
    if (M.group) {
      const c0 = pick(r, cells), near = cells.map(i => { const dx = cx(g, i) - cx(g, c0), dy = cy(g, i) - cy(g, c0); return [i, dx * dx + dy * dy]; });
      const order = []; for (let k = 0; k < M.group && near.length; k++) { let b = 0; for (let j = 1; j < near.length; j++) if (near[j][1] < near[b][1] || (near[j][1] === near[b][1] && near[j][0] < near[b][0])) b = j; order.push(near[b][0]); near.splice(b, 1); }
      for (const i of order) { taken.add(i); fl.spawns.push({ k: m, x: cx(g, i), y: cy(g, i) }); }
      gi++; continue;
    }
    const i = pick(r, cells); taken.add(i);
    fl.spawns.push({ k: m, x: cx(g, i), y: cy(g, i), size: M.size || 1 }); gi++;
  }
}
