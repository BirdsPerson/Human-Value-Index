// INTAKE, the processing hall (src/Arrivals.jsx): the hall's layout and the pure pieces
// of its line. No DOM. World units are sprite pixels, as in the pen.
//
// Six bays in processing order. They snake across rows as the canvas narrows (three by two
// on a desktop, two by three on a phone, one row on a very wide screen), so every bay is
// always next to the one before it and a subject walks the line without crossing any.

export const BAYS = [
  { id: "door", name: "ARRIVALS", sign: "▼ ARRIVALS DOOR ▼" },
  { id: "photo", name: "PHOTOGRAPHY", sign: "PHOTOGRAPHY" },
  { id: "desk", name: "ASSESSMENT DESK", sign: "ASSESSMENT DESK" },
  { id: "bench", name: "HOLDING BENCH", sign: "HOLDING BENCH" },
  { id: "chute", name: "THE CHUTE", sign: "THE CHUTE" },
  { id: "platform", name: "LOOP PLATFORM", sign: "LOOP ▸ THE SUBSTRATE" },
];
export const BAY = Object.fromEntries(BAYS.map((b, i) => [b.id, i]));

export const TOP_PAD = 24;      // the roof line: the building's name
export const ROW_H = 124;       // one row of bays
export const WALK_TOP = 72;     // feet band inside a row
export const WALK_BOT = 114;
export const FOUNDATION = 8;

// w: the hall's width in sprite px. -> {perRow, rows, bayW, h}
export function layoutFor(w) {
  const perRow = w >= 1100 ? 6 : w >= 380 ? 3 : 2;
  const rows = Math.ceil(BAYS.length / perRow);
  return { w, perRow, rows, bayW: w / perRow, h: TOP_PAD + rows * ROW_H + FOUNDATION };
}

// Bay i's rectangle: odd rows run right to left (the snake).
export function bayRect(i, L) {
  const row = Math.floor(i / L.perRow), c = i % L.perRow;
  const col = row % 2 ? L.perRow - 1 - c : c;
  const x0 = col * L.bayW, y0 = TOP_PAD + row * ROW_H;
  return { i, row, col, x0, x1: x0 + L.bayW, y0, y1: y0 + ROW_H, walkTop: y0 + WALK_TOP, walkBot: y0 + WALK_BOT };
}

// The bay under a point (feet), clamped to the hall.
export function bayAt(x, y, L) {
  const row = Math.max(0, Math.min(L.rows - 1, Math.floor((y - TOP_PAD - 8) / ROW_H)));
  const col = Math.max(0, Math.min(L.perRow - 1, Math.floor(x / L.bayW)));
  const c = row % 2 ? L.perRow - 1 - col : col;
  return Math.max(0, Math.min(BAYS.length - 1, row * L.perRow + c));
}

// Where a subject stands in bay i: the middle of its floor.
export function bayCenter(i, L) {
  const r = bayRect(i, L);
  return { x: (r.x0 + r.x1) / 2, y: (r.walkTop + r.walkBot) / 2 };
}

// The bays walked from one to another, in order, excluding the start. The snake keeps
// consecutive bays adjacent, so the centres make a clear walk.
export function bayPath(from, to) {
  const out = [];
  const step = to >= from ? 1 : -1;
  for (let i = from + step; step > 0 ? i <= to : i >= to; i += step) out.push(i);
  return out;
}

// Real minutes from nowMs until an ISO time, never below zero.
export function minutesUntil(iso, nowMs = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - nowMs) / 60000));
}

// "RELEASE AT MACHINE DAY 293 (IN ~41 REAL MIN)"
export function releaseLine(day, iso, nowMs = Date.now()) {
  if (!day) return "RELEASED TO THE SUBSTRATE";
  const m = minutesUntil(iso, nowMs);
  if (m == null) return `RELEASE AT MACHINE DAY ${day}`;
  return m <= 0 ? `RELEASE AT MACHINE DAY ${day} (NOW. THE CHUTE IS OPEN)` : `RELEASE AT MACHINE DAY ${day} (IN ~${m} REAL MIN)`;
}

// "ASSIGNED: THE SPRAWL, HAB BLOCK A // SLAG RAKER // RAKER, FOUNDRY"
export function assignedLine(a) {
  if (!a?.home && !a?.job) return "ASSIGNMENT PENDING. THE CITY HAS NOT DECIDED WHAT YOU ARE FOR.";
  return `ASSIGNED: ${[a.home, a.job].filter(Boolean).join(" // ")}`;
}

// Where an arrival belongs in the hall now: a pending subject waits on the bench, a
// released one on the platform.
export const homeBay = (status) => (status === "released" ? BAY.platform : BAY.bench);

// Newest data from /api/arrivals against who is already in the hall (by key):
// -> {enter: [pending not in the hall], release: [keys in the hall now released],
//     settle: [released not in the hall], likeness: [records whose sprite arrived]}
export function reconcile(data, hall) {
  const enter = [], release = [], settle = [], likeness = [];
  for (const s of data?.pending || []) {
    const h = hall.get(s.key);
    if (!h) enter.push(s);
    else if (s.sprite && !h.sprite) likeness.push(s);
  }
  for (const s of data?.released || []) {
    const h = hall.get(s.key);
    if (!h) settle.push(s);
    else {
      if (h.status === "pending") release.push(s.key);
      if (s.sprite && !h.sprite) likeness.push(s);
    }
  }
  return { enter, release, settle, likeness };
}
