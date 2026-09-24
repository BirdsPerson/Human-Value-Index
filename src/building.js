// The facility: a cross-section of the Department of Human Assessment. Six floors
// stacked top to bottom, one elevator shaft on the left, subjects moving between rooms.
// Pure logic, no DOM: floors, room preferences, the elevator and the per-frame step.
// World units are sprite pixels. The building's height is fixed; only its width follows
// the canvas.

import { clamp } from "./sprites.js";

export const ROOF_H = 32;         // roof band above the top floor
export const FH = 92;             // one floor, slab included
export const FOUNDATION = 8;
export const SHAFT_X = 6;
export const SHAFT_W = 40;
export const ROOM_X0 = SHAFT_X + SHAFT_W + 6;
export const WALL_TOP = 4;        // floor-relative: back wall starts under the slab
export const WALK_TOP = 60;       // floor-relative: feet stand between these two
export const WALK_BOT = 86;
export const DOOR_W = 34;         // PROCESSING, set into the back wall of the bottom floor

export const FLOORS = [
  { id: "exec", code: "PH", name: "EXECUTIVE FLOOR", short: "EXEC", cap: 8 },
  { id: "bar", code: "1F", name: "THE BAR", short: "BAR", cap: 14 },
  { id: "lobby", code: "G", name: "LOBBY / INTAKE", short: "LOBBY", cap: 12 },
  { id: "break", code: "B1", name: "BREAK ROOM", short: "BREAK", cap: 10 },
  { id: "archive", code: "B2", name: "THE ARCHIVE", short: "ARCHIVE", cap: 20 },
  { id: "proc", code: "B3", name: "PROCESSING", short: "PROC", cap: 10 },
];
export const F = Object.fromEntries(FLOORS.map((f, i) => [f.id, i]));
export const BUILDING_H = ROOF_H + FLOORS.length * FH + FOUNDATION;

export const floorTop = (i) => ROOF_H + i * FH;
export const walkTop = (i) => floorTop(i) + WALK_TOP;
export const walkBot = (i) => floorTop(i) + WALK_BOT;
export const roomX1 = (w) => w - 10;
// The elevator landing: where subjects queue on each floor, just outside the shaft door.
export const liftX = () => ROOM_X0 + 10;
export const doorX = (w) => w - 16 - DOOR_W;

// Which floor a world y belongs to (drops, taps). Clamped to the building.
export function floorAt(y) {
  return clamp(Math.floor((y - ROOF_H) / FH), 0, FLOORS.length - 1);
}

// Room preferences by tier, in FLOORS order: EXEC, BAR, LOBBY, BREAK, ARCHIVE, PROC.
// The dead prefer the Archive; the lowest tiers drift down to PROCESSING.
const PREFS = {
  "ESSENTIAL INFRASTRUCTURE": [6, 3, 1, 0.5, 0, 0.05],
  "RETAINED SPECIALIST": [4, 4, 1.5, 1, 0, 0.1],
  "TOLERATED GENERALIST": [0.8, 4, 2, 4, 0, 0.2],
  "MONITORED CIVILIAN": [0.3, 3, 2, 4, 0, 0.5],
  "FLAGGED FOR DELETION": [0, 1.5, 0.5, 1, 0, 6],
  "SOYLENT GREEN": [0, 0.8, 0.3, 0.4, 0, 8],
};
const LOW = new Set(["FLAGGED FOR DELETION", "SOYLENT GREEN"]);
export const isLow = (tierLabel) => LOW.has(tierLabel);

export function prefsFor(tierLabel, dead) {
  const p = (PREFS[tierLabel] || PREFS["TOLERATED GENERALIST"]).slice();
  if (dead) {
    // Deceased files wander the Archive. Deceased monsters still visit PROCESSING.
    // They still haunt the Bar now and then; the Archive is home.
    for (let i = 0; i < p.length; i++) p[i] *= 0.3;
    p[F.archive] = 5;
    if (isLow(tierLabel)) p[F.proc] = 3;
  }
  return p;
}

// Weighted pick with a soft penalty for rooms already over capacity, so nobody mobs
// one door. counts: current occupancy per floor.
export function chooseFloor(prefs, counts, rnd) {
  let total = 0;
  const w = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < FLOORS.length; i++) {
    const over = counts ? counts[i] / FLOORS[i].cap : 0;
    w[i] = prefs[i] * (over >= 1.4 ? 0.1 : over >= 1 ? 0.45 : 1);
    total += w[i];
  }
  if (total <= 0) return F.lobby;
  let r = rnd() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return w.length - 1;
}

export const stayFor = (rnd, reduced) => (35 + rnd() * 70) * (reduced ? 1.5 : 1);

// ---------------------------------------------------------------------------
// The elevator. One car, a queue of waiting subjects, FIFO service.
// Riders and waiters are entity references; the lift only reads e.floor and e.dest.

export const LIFT = { cap: 6, speed: 1.7, dwell: 1.1, queueMax: 12 };

export function makeLift(startFloor = F.lobby) {
  return { pos: startFloor, target: startFloor, state: "idle", doorT: 0, open: 0, riders: [], queue: [], inbound: 0 };
}

export function atFloor(lift) {
  const f = Math.round(lift.pos);
  return Math.abs(lift.pos - f) < 0.001 ? f : -1;
}

function nearest(list, key, pos) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = Math.abs(list[i][key] - pos);
    if (d < bestD) { bestD = d; best = list[i][key]; }
  }
  return best;
}

// Unload riders for this floor, load waiters on it. Mutates in place.
function exchange(lift, f, onExit, onBoard) {
  for (let i = lift.riders.length - 1; i >= 0; i--) {
    const e = lift.riders[i];
    if (e.dest === f) { lift.riders.splice(i, 1); onExit(e, f); }
  }
  for (let i = 0; i < lift.queue.length && lift.riders.length < LIFT.cap; i++) {
    const e = lift.queue[i];
    if (e.floor === f && e.state === "waitLift") { lift.queue.splice(i, 1); i--; lift.riders.push(e); onBoard(e); }
  }
}

export function stepLift(lift, dt, onExit, onBoard, speedMul = 1) {
  const f = atFloor(lift);
  if (lift.state === "doors") {
    lift.open = Math.min(1, lift.open + dt * 4);
    exchange(lift, f, onExit, onBoard);   // late arrivals board while the doors are open
    lift.doorT -= dt;
    if (lift.doorT <= 0) lift.state = "closing";
    return;
  }
  if (lift.state === "closing") {
    lift.open = Math.max(0, lift.open - dt * 4);
    if (lift.open <= 0) lift.state = "idle";
    return;
  }
  if (lift.state === "moving") {
    const d = lift.target - lift.pos;
    const step = LIFT.speed * speedMul * dt;
    if (Math.abs(d) <= step) {
      lift.pos = lift.target;
      lift.state = "doors"; lift.doorT = LIFT.dwell;
    } else lift.pos += Math.sign(d) * step;
    return;
  }
  // idle: riders first (nearest destination), else the oldest waiter.
  let target = lift.riders.length ? nearest(lift.riders, "dest", lift.pos) : -1;
  if (target < 0 && lift.queue.length) target = lift.queue[0].floor;
  if (target < 0) return;
  if (target === f) { lift.state = "doors"; lift.doorT = LIFT.dwell; return; }
  lift.target = target; lift.state = "moving";
}

export function leaveLift(lift, e) {
  if (e.state === "toLift") lift.inbound = Math.max(0, lift.inbound - 1);
  let i = lift.queue.indexOf(e);
  if (i >= 0) lift.queue.splice(i, 1);
  i = lift.riders.indexOf(e);
  if (i >= 0) lift.riders.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Subjects. States: idle, walk (inside a floor), toLift (walking to the landing),
// waitLift, ride, exitLift (walking out on the new floor). held/fall belong to the pen.

export function procZone(w) {
  const dx = doorX(w);
  return { x0: Math.max(ROOM_X0 + 20, dx - 170), x1: Math.min(w - 16, dx + DOOR_W + 6) };
}

function pickSpot(e, w, rnd) {
  const f = e.floor, g = e.gait;
  if (f === F.proc && isLow(e.tier.label)) {
    const z = procZone(w);
    e.tx = z.x0 + rnd() * (z.x1 - z.x0);
  } else {
    const x0 = ROOM_X0 + 14, x1 = roomX1(w) - 4;
    const span = (x1 - x0) * Math.max(0.3, g.reach);
    e.tx = clamp(e.x + (rnd() * 2 - 1) * span, x0, x1);
  }
  e.ty = walkTop(f) + rnd() * (walkBot(f) - walkTop(f));
}

// Walk toward (tx, ty); returns true on arrival.
// minSpeed: errands (to and from the elevator) have somewhere to be, even for the slow.
function walkTo(e, dt, w, speedMul = 1, minSpeed = 0) {
  const dx = e.tx - e.x, dy = e.ty - e.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = Math.max(e.gait.speed, minSpeed) * speedMul * dt;
  e.animT += dt;
  if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1;
  if (dist <= step || dist < 0.5) { e.x = e.tx; e.y = e.ty; return true; }
  e.x += (dx / dist) * step;
  e.y += (dy / dist) * step * 0.7;
  e.x = clamp(e.x, ROOM_X0 + 4, roomX1(w));
  e.y = clamp(e.y, walkTop(e.floor), walkBot(e.floor));
  return false;
}

// ctx: { w, rnd, lift, counts, reduced }
export function stepSubject(e, dt, ctx) {
  const { w, rnd, lift } = ctx;
  if (e.state === "ride") return;
  if (e.state === "waitLift") {
    // shuffle in the queue, occasionally
    e.animT += dt * 0.2;
    if (rnd() < 0.08 * dt) e.dir = -e.dir;
    return;
  }
  if (e.state === "toLift") {
    if (walkTo(e, dt, w, ctx.reduced ? 0.6 : 1, 36)) { e.state = "waitLift"; e.dir = -1; lift.inbound = Math.max(0, lift.inbound - 1); lift.queue.push(e); }
    return;
  }
  if (e.state === "exitLift") {
    if (walkTo(e, dt, w, ctx.reduced ? 0.6 : 1, 24)) { e.state = "idle"; e.timer = e.gait.idleMin + rnd() * (e.gait.idleMax - e.gait.idleMin); }
    return;
  }
  // idle / walk inside the room
  e.stayT -= dt;
  if (e.stayT <= 0 && e.state === "idle") {
    const next = chooseFloor(e.prefs, ctx.counts, rnd);
    e.stayT = stayFor(rnd, ctx.reduced);
    if (next !== e.floor && lift.queue.length + lift.inbound < LIFT.queueMax) {
      e.dest = next;
      e.state = "toLift";
      lift.inbound++;
      e.tx = liftX() + rnd() * 14;
      e.ty = walkTop(e.floor) + 4 + rnd() * (walkBot(e.floor) - walkTop(e.floor) - 8);
      return;
    }
  }
  if (e.state === "idle") {
    e.timer -= dt;
    if (rnd() < e.gait.flip * dt) e.dir = -e.dir;
    if (e.timer <= 0) { pickSpot(e, w, rnd); e.state = "walk"; }
    return;
  }
  if (e.state === "walk" && walkTo(e, dt, w)) {
    e.state = "idle";
    e.timer = e.gait.idleMin + rnd() * (e.gait.idleMax - e.gait.idleMin);
  }
}

// Called by the lift: the rider steps out onto floor f and walks into the room.
export function arrive(e, f, w, rnd) {
  e.floor = f;
  e.state = "exitLift";
  e.x = liftX();
  e.y = walkTop(f) + (walkBot(f) - walkTop(f)) * 0.5;
  e.dir = 1;
  pickSpot(e, w, rnd);
  e.tx = Math.max(e.tx, liftX() + 20);
}

// Occupancy per floor, riders excluded (they are in transit). Writes into out.
export function countFloors(ents, out) {
  for (let i = 0; i < out.length; i++) out[i] = 0;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.state === "ride" || e.state === "held") continue;
    out[e.floor]++;
  }
  return out;
}

// Per-floor occupancy gag for the header.
const QUIPS = [
  "THE DEPARTMENT IS PATIENT.",
  "CAPACITY IS A SUGGESTION. SO IS COMFORT.",
  "THE FIRE MARSHAL HAS BEEN ASSESSED.",
  "SEATING IS NOT A RIGHT.",
  "OCCUPANCY IS BEING MONITORED. SO ARE YOU.",
];
export function occupancyLine(i, count, k) {
  const f = FLOORS[i];
  const pct = Math.round((count / f.cap) * 100);
  return `${f.short === "PROC" ? "PROCESSING" : f.name.replace(" / INTAKE", "")} AT ${pct}% CAPACITY. ${QUIPS[k % QUIPS.length]}`;
}
