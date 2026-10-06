// THE LANES, drawn: from behind the bowler, in one-point perspective (every board line runs to the one
// vanishing point at the horizon's centre). Reads the sim, writes nothing back. A plain look: flat wood,
// white pins with their two red necks, the arrows and the dots, the masking unit over the pit, a lane
// either side. COSMIC BOWLING (the machine clock's late hours): the lights go out, the blacklight
// comes on, the boards glow.
//
// The camera: the eye EYE inches over the lane, D inches behind the foul line, the picture's focal
// length F px. A point (x across, y down the lane, z up) lands at
//   sx = W/2 + F (x - camX) / (y + D - camZ),   sy = HZ + F (EYE - z) / (y + D - camZ).
// While the ball rolls the camera dollies down the lane after it (camZ), so the pin action is close.

import { LANE_HW, GUTTER_W, KICK_X, HEAD_Y, PIT_Y, ARROWS_Y, L_PIN, R_BALL, R_PIN, PIN_SPOTS, BOARD, meterValue, ballAt, standing } from "./sim.js";

export const W = 480, H = 640;
const HZ = 112, D = 250, EYE = 120, F = 1000;
const PITCH = 41.5 + 2 * GUTTER_W + 4;   // lane to lane, centre to centre
const NEAR = 30;

// a pin's outline, base to top: [height in, half-width in]
const PROFILE = [[0, 1.0], [1.2, 1.55], [3, 2.15], [4.5, 2.38], [6, 2.25], [8, 1.6], [9.6, 1.0], [10.6, 0.93], [12, 1.12], [13.4, 1.25], [14.4, 0.95], [15, 0.2]];

const PALETTE = {
  day: { sky: "#14110d", wall: "#2a2219", wall2: "#3a2e22", wood: ["#d9b27a", "#cfa56c"], woodFar: "#b38b58", board: "rgba(90,60,30,0.16)", board5: "rgba(90,60,30,0.32)", gutter: "#2c2c30", gutterHi: "#4a4a52", cap: "#6b6460", approach: "#e3c592", foul: "#c22", arrow: "#3a2510", dot: "#3a2510", deck: "#e2c28e", pit: "#0c0b0a", mask: "#1d2a44", maskInk: "#e8d48a", pin: "#f6f3ec", pinShade: "#d4cfc4", neck: "#c8202a", divider: "#5a4c3c", light: "rgba(255,240,200,0.05)" },
  cosmic: { sky: "#05010d", wall: "#0b0420", wall2: "#140632", wood: ["#120a2a", "#0f0824"], woodFar: "#0b061c", board: "rgba(0,255,240,0.14)", board5: "rgba(255,40,220,0.35)", gutter: "#06020f", gutterHi: "#30f0ff", cap: "#ff2fd0", approach: "#1a0d38", foul: "#ff3355", arrow: "#39ff6a", dot: "#ffe14a", deck: "#1b0f3d", pit: "#000000", mask: "#09021a", maskInk: "#ff4fe0", pin: "#f0faff", pinShade: "#9fe8ff", neck: "#ff2f8a", divider: "#ff2fd0", light: "rgba(120,60,255,0.06)" },
};

export function makeView() { return { camZ: 0, camX: 0, eye: EYE, trail: [] }; }

// the camera, eased after the ball
export function follow(view, st) {
  const b = st.ball;
  let target = 0;
  if (st.phase === "roll" && b) target = Math.min(740, Math.max(0, (b.gone ? PIT_Y : b.y) * 1.15 - 90));
  else if (st.phase === "result") target = view.camZ;
  view.camZ += (target - view.camZ) * (target < view.camZ && st.phase !== "result" ? 0.15 : 0.22);
  // the camera comes down as it closes on the pins
  view.eye = EYE - Math.max(0, view.camZ - 300) * 0.125;
  if (st.phase === "aim" || st.phase === "meter") view.trail = [];
  if (b && st.phase === "roll" && !b.gone && view.trail.length < 400) view.trail.push([b.x, b.y]);
}

const proj = (v, x, y, z = 0) => {
  const d = Math.max(NEAR, y + D - v.camZ);
  return [W / 2 + F * (x - v.camX) / d, HZ + F * ((v.eye ?? EYE) - z) / d, F / d];
};

function quad(c, v, x0, x1, y0, y1, fill, z = 0) {
  const ya = Math.max(y0, v.camZ - D + NEAR), yb = y1;
  if (yb <= ya) return;
  const a = proj(v, x0, ya, z), b = proj(v, x1, ya, z), cc = proj(v, x1, yb, z), d = proj(v, x0, yb, z);
  c.fillStyle = fill; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(d[0], d[1]); c.closePath(); c.fill();
}
function line(c, v, x0, y0, x1, y1, stroke, wpx = 1, z = 0) {
  const ya = Math.max(y0, v.camZ - D + NEAR); if (y1 <= ya) return;
  const a = proj(v, x0 + (x1 - x0) * ((ya - y0) / (y1 - y0 || 1)), ya, z), b = proj(v, x1, y1, z);
  c.strokeStyle = stroke; c.lineWidth = wpx; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
}

// a pin: base at (x, y), its axis along (ux, uy) tipped by `tip` (0 standing .. 1 lying)
function drawPin(c, v, P, x, y, ux, uy, tip, glow) {
  const ang = tip * Math.PI / 2, s = Math.sin(ang), co = Math.cos(ang);
  const pts = PROFILE.map(([h, wd]) => {
    const lift = tip > 0.95 ? 2 : 0;
    const p = proj(v, x + ux * h * s, y + uy * h * s, h * co + lift * (1 - h / 15) + (tip > 0.95 ? 0 : 0));
    return [p[0], p[1], wd * p[2]];
  });
  // screen-space perpendicular to the axis at each sample
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    L.push([pts[i][0] - dy * pts[i][2], pts[i][1] + dx * pts[i][2]]);
    R.push([pts[i][0] + dy * pts[i][2], pts[i][1] - dx * pts[i][2]]);
  }
  if (glow) { c.shadowColor = "#9ff"; c.shadowBlur = 8; }
  c.fillStyle = P.pin; c.beginPath(); c.moveTo(L[0][0], L[0][1]);
  for (const p of L) c.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath(); c.fill();
  c.shadowBlur = 0;
  // shade the right flank
  c.fillStyle = P.pinShade; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) c.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath(); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
  // the two red necks
  c.strokeStyle = P.neck;
  for (const k of [7, 8]) { const a = L[k], b = R[k]; c.lineWidth = Math.max(1, pts[k][2] * 0.45); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
}

function drawBall(c, v, b, color, cosmic) {
  const z = b.gutter ? R_BALL - 2.5 : R_BALL;
  const [sx, sy, k] = proj(v, b.x, b.y, z), r = R_BALL * k;
  const [, gy] = proj(v, b.x, b.y, b.gutter ? -2.5 : 0);
  c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(sx, gy, r * 1.05, r * 0.3, 0, 0, Math.PI * 2); c.fill();
  if (cosmic) { c.shadowColor = color; c.shadowBlur = 14; }
  c.fillStyle = color; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0;
  // the finger holes, turning over as it rolls
  const ph = (b.d || 0) / R_BALL;
  const hy = Math.cos(ph), vis = Math.sin(ph);
  if (vis > -0.2) {
    c.fillStyle = "rgba(0,0,0,0.6)";
    for (const [ox, oy] of [[-0.22, 0], [0.22, 0], [0, 0.32]]) { c.beginPath(); c.arc(sx + ox * r, sy + (oy - hy * 0.45) * r, Math.max(0.8, r * 0.1), 0, Math.PI * 2); c.fill(); }
  }
  c.fillStyle = "rgba(255,255,255,0.35)"; c.beginPath(); c.arc(sx - r * 0.35, sy - r * 0.4, r * 0.25, 0, Math.PI * 2); c.fill();
}

// a bowler seen from behind on the approach: kit, a ball in hand, an arm that swings
function drawBowler(c, v, x, y, kit, swing, hand, ballColor) {
  const [sx, sy, k] = proj(v, x, y, 0);
  if (sy > H + 400) return;
  const u = k;   // px per inch
  const shirt = kit?.[0] || "#8a8a8a", legs = kit?.[1] || "#333";
  const legH = 34 * u, body = 26 * u, sh = 17 * u;
  c.fillStyle = legs; c.fillRect(sx - 7 * u, sy - legH, 5.5 * u, legH); c.fillRect(sx + 1.5 * u, sy - legH, 5.5 * u, legH);
  c.fillStyle = "#222"; c.fillRect(sx - 8 * u, sy - 2 * u, 7 * u, 2.5 * u); c.fillRect(sx + 1 * u, sy - 2 * u, 7 * u, 2.5 * u);
  c.fillStyle = shirt; c.fillRect(sx - sh / 2, sy - legH - body, sh, body);
  c.fillStyle = "#c9a184"; c.beginPath(); c.arc(sx, sy - legH - body - 5 * u, 5 * u, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#3a2a1e"; c.beginPath(); c.arc(sx, sy - legH - body - 6 * u, 5.2 * u, Math.PI, 0); c.fill();
  // the bowling arm: swing -1 (back) .. 1 (forward, released)
  const ax = sx + hand * (sh / 2 + 1.5 * u), ay = sy - legH - body + 3 * u;
  const ex = ax + hand * 2 * u, ey = ay + 22 * u * (1 - Math.abs(swing) * 0.35) - swing * 12 * u;
  c.strokeStyle = shirt; c.lineWidth = 4 * u; c.lineCap = "round"; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke();
  if (ballColor) { c.fillStyle = ballColor; c.beginPath(); c.arc(ex, ey + 3 * u, R_BALL * u, 0, Math.PI * 2); c.fill(); }
  c.lineCap = "butt";
}

// predicted path for EASY (cached by its inputs)
let pathKey = "", pathPts = [];
function easyPath(st, p) {
  const key = `${p.posX.toFixed(2)}|${p.aim.toFixed(5)}|${st.oilK}|${p.hand}`;
  if (key === pathKey) return pathPts;
  pathKey = key; pathPts = [];
  for (let y = 30; y <= HEAD_Y; y += 45) { const x = ballAt(st, { x: p.posX, a: p.aim, mph: 15, r: 0 }, y, p.hand); if (x == null) break; pathPts.push([x, y]); }
  return pathPts;
}

export function draw(c, st, view, o = {}) {
  const cosmic = !!o.cosmic, P = PALETTE[cosmic ? "cosmic" : "day"], t = o.time || 0;
  const v = view;
  c.save();
  c.fillStyle = P.sky; c.fillRect(0, 0, W, H);
  // the back wall over the pits
  c.fillStyle = P.wall; c.fillRect(0, 0, W, HZ + 30);
  if (cosmic) {
    // the ceiling's lights: slow neon sweeps
    for (let i = 0; i < 5; i++) { const x = (i * 113 + t * 40 * (i % 2 ? 1 : -1)) % (W + 120) - 60; const g = c.createRadialGradient(x, 40, 2, x, 40, 70); g.addColorStop(0, ["rgba(255,40,220,0.35)", "rgba(40,255,240,0.3)", "rgba(255,230,60,0.25)"][i % 3]); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x - 70, 0, 140, 110); }
  }
  // the lanes either side, then ours
  for (const k of [-2, -1, 1, 2, 0]) drawLane(c, v, P, k * PITCH, k === 0, st, cosmic, t);
  // our pins and ball, far to near
  const items = [];
  for (const p of st.pins) if (p.st !== 2) items.push({ y: p.y, f: () => drawPin(c, v, P, p.x, p.y, p.ux, p.uy, p.st === 0 ? 0 : Math.min(1, p.top), cosmic) });
  const b = st.ball;
  const pl = st.players[st.cur];
  const color = o.ballColor?.(st.cur) || "#2b5fbf";
  if (b && !b.gone && (b.y < PIT_Y + 10)) items.push({ y: b.y, f: () => drawBall(c, v, b, color, cosmic) });
  items.sort((a, z) => z.y - a.y);
  for (const it of items) it.f();
  // the masking unit's lip over the pins (drawn in drawLane) is behind; the pit's curtain shadow
  // the aim: the arrow from the ball's spot through the target arrows
  if ((st.phase === "aim" || st.phase === "meter") && pl) {
    const x0 = pl.posX, a = pl.aim;
    const y1 = ARROWS_Y + 60;
    c.setLineDash([6, 6]);
    line(c, v, x0, 6, x0 + a * y1, y1, cosmic ? "#39ff6a" : "rgba(30,90,200,0.85)", 2.5, 0.2);
    c.setLineDash([]);
    const [hx, hy] = proj(v, x0 + a * y1, y1, 0.2);
    c.fillStyle = cosmic ? "#39ff6a" : "#1e5ac8"; c.beginPath(); c.moveTo(hx, hy - 7); c.lineTo(hx - 6, hy + 3); c.lineTo(hx + 6, hy + 3); c.closePath(); c.fill();
    if (o.easy || pl.bumpers) {
      const pts = easyPath(st, pl);
      c.strokeStyle = cosmic ? "rgba(255,230,60,0.55)" : "rgba(200,60,40,0.45)"; c.lineWidth = 2; c.beginPath();
      pts.forEach(([x, y], i) => { const [sx, sy] = proj(v, x, y, 0.2); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); }); c.stroke();
    }
  }
  // the bowler
  if (pl) {
    let by = -26, swing = -0.2;
    if (st.phase === "approach") { const f = Math.min(1, st.phaseT / 30); by = -26 + f * 20; swing = -0.2 - Math.sin(f * Math.PI) * 0.8 + f * f * 1.2; }
    else if (st.phase === "roll" || st.phase === "result") { by = -6; swing = 1; }
    const hasBall = st.phase === "aim" || st.phase === "meter" || st.phase === "approach";
    const fade = Math.max(0, Math.min(1, 1 - v.camZ / 60));
    c.globalAlpha = (st.phase === "aim" || st.phase === "meter" ? 0.55 : 0.8) * fade;
    if (fade > 0) drawBowler(c, v, pl.posX + pl.hand * -5, by, o.kitOf?.(st.cur), swing, pl.hand, hasBall ? color : null);
    c.globalAlpha = 1;
  }
  c.restore();
}

function drawLane(c, v, P, ox, mine, st, cosmic, t) {
  const far = PIT_Y + 26;
  // the approach and the lane
  quad(c, v, ox - LANE_HW - GUTTER_W - 2, ox + LANE_HW + GUTTER_W + 2, -260, 0, P.approach);
  quad(c, v, ox - LANE_HW, ox + LANE_HW, 0, HEAD_Y - 30, P.wood[0]);
  quad(c, v, ox - LANE_HW, ox + LANE_HW, HEAD_Y - 30, PIT_Y, P.deck);
  // the oil's sheen (fresh in the heads) on our lane
  if (mine && !cosmic) { quad(c, v, ox - LANE_HW * 0.7, ox + LANE_HW * 0.7, 0, 480, "rgba(255,255,255,0.06)"); }
  // the boards: every board faint, every fifth darker
  for (let k = 1; k < 39; k++) {
    const x = ox - LANE_HW + k * BOARD;
    line(c, v, x, 0, x, HEAD_Y - 30, k % 5 === 0 ? P.board5 : P.board, k % 5 === 0 ? 1.2 : 0.8);
  }
  // the gutters and the capping between lanes
  quad(c, v, ox - LANE_HW - GUTTER_W, ox - LANE_HW, 0, PIT_Y, P.gutter, -0.5);
  quad(c, v, ox + LANE_HW, ox + LANE_HW + GUTTER_W, 0, PIT_Y, P.gutter, -0.5);
  if (cosmic) { line(c, v, ox - LANE_HW, 0, ox - LANE_HW, PIT_Y, P.gutterHi, 1.5); line(c, v, ox + LANE_HW, 0, ox + LANE_HW, PIT_Y, P.gutterHi, 1.5); }
  quad(c, v, ox + LANE_HW + GUTTER_W, ox + LANE_HW + GUTTER_W + 2, -260, PIT_Y, P.cap, 1);
  quad(c, v, ox - LANE_HW - GUTTER_W - 2, ox - LANE_HW - GUTTER_W, -260, PIT_Y, P.cap, 1);
  if (mine && st.players[st.cur]?.bumpers) {
    for (const s of [-1, 1]) { quad(c, v, ox + s * (LANE_HW + 1), ox + s * (LANE_HW + 3), 0, PIT_Y - 10, cosmic ? "#ffe14a" : "#e8e8e8", 4); }
  }
  // the foul line, the dots, the arrows
  quad(c, v, ox - LANE_HW, ox + LANE_HW, -0.5, 0.5, P.foul, 0.05);
  for (const bd of [3, 5, 8, 11, 14]) for (const s of [-1, 1]) {
    const x = ox + s * (LANE_HW - (bd - 0.5) * BOARD), [sx, sy, k] = proj(v, x, 84, 0);
    c.fillStyle = P.dot; c.beginPath(); c.ellipse(sx, sy, Math.max(0.8, 0.5 * k), Math.max(0.4, 0.2 * k), 0, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 7; i++) {
    const bd = 5 + i * 5, x = ox + LANE_HW - (bd - 0.5) * BOARD;
    const y = ARROWS_Y - 36 + (3 - Math.abs(3 - i)) * 12;
    const a = proj(v, x, y + 6, 0.05), l = proj(v, x - 0.5, y - 2, 0.05), r = proj(v, x + 0.5, y - 2, 0.05);
    c.fillStyle = P.arrow; if (cosmic) { c.shadowColor = P.arrow; c.shadowBlur = 6; }
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(l[0], l[1]); c.lineTo(r[0], r[1]); c.closePath(); c.fill(); c.shadowBlur = 0;
  }
  // the pin spots (the deck's markings)
  for (const [, x, y] of PIN_SPOTS) { const [sx, sy, k] = proj(v, ox + x, y, 0); c.fillStyle = cosmic ? "rgba(255,80,220,0.35)" : "rgba(120,80,40,0.35)"; c.beginPath(); c.ellipse(sx, sy, Math.max(0.6, 1 * k), Math.max(0.3, 0.35 * k), 0, 0, Math.PI * 2); c.fill(); }
  // the pit, the kickbacks, the masking unit
  quad(c, v, ox - KICK_X, ox + KICK_X, PIT_Y, far, P.pit);
  const k0 = proj(v, ox - KICK_X, HEAD_Y - 28, 0), k1 = proj(v, ox - KICK_X, far, 0), k2 = proj(v, ox - KICK_X, far, 22), k3 = proj(v, ox - KICK_X, HEAD_Y - 28, 22);
  c.fillStyle = P.divider; c.beginPath(); c.moveTo(k0[0], k0[1]); c.lineTo(k1[0], k1[1]); c.lineTo(k2[0], k2[1]); c.lineTo(k3[0], k3[1]); c.closePath(); c.fill();
  const m0 = proj(v, ox - KICK_X - 3, far, 20), m1 = proj(v, ox + KICK_X + 3, far, 50);
  c.fillStyle = P.mask; c.fillRect(m0[0], m1[1], m1[0] - m0[0], m0[1] - m1[1] + 2);
  if (mine) {
    const fs = Math.max(6, (m0[1] - m1[1]) * 0.42);
    c.fillStyle = P.maskInk; c.font = `700 ${fs}px "Fira Mono", ui-monospace, monospace`; c.textAlign = "center"; c.textBaseline = "middle";
    if (cosmic) { c.shadowColor = P.maskInk; c.shadowBlur = 10; }
    c.fillText("THE LANES", (m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2 + 1); c.shadowBlur = 0;
  } else {
    // the neighbours' racks: ten pins, standing, forever
    for (const [, x, y] of [...PIN_SPOTS].reverse()) drawPin(c, v, P, ox + x, y, 0, 1, 0, cosmic);
  }
}

// ---- the HUD over the picture -------------------------------------------------------------------------------
export function drawHud(c, st, o = {}) {
  const cosmic = !!o.cosmic;
  const ink = cosmic ? "#f0f" : "#fff";
  c.save();
  c.font = '700 13px "Fira Mono", ui-monospace, monospace'; c.textBaseline = "top";
  // the pin indicator (top right): what stands
  const up = new Set(standing(st));
  const ox = W - 70, oy = HZ + 10;
  c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(ox - 8, oy - 6, 70, 56);
  for (const [n, x, y] of PIN_SPOTS) {
    const sx = ox + 27 + x * 1.35, sy = oy + 40 - (y - HEAD_Y) * 1.25;
    c.fillStyle = up.has(n) ? (cosmic ? "#9ff" : "#fff") : "rgba(255,255,255,0.18)";
    c.beginPath(); c.arc(sx, sy, 4.2, 0, Math.PI * 2); c.fill();
  }
  // the meter (the keyboard's three presses)
  if (st.phase === "meter" && st.meter) {
    const m = st.meter, val = meterValue(st);
    const x = 18, y = H - 200, h = 150;
    c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(x - 6, y - 24, 132, h + 36);
    c.fillStyle = "#ddd"; c.fillText(["", "POWER", "ACCURACY", "HOOK"][m.stage], x, y - 18);
    // power: a column with the red over the line
    const pv = m.stage === 1 ? val : m.power;
    c.fillStyle = "#333"; c.fillRect(x, y, 22, h);
    c.fillStyle = "#c22"; c.fillRect(x, y, 22, h * (0.12 / 1.12));
    c.fillStyle = "#3c8"; const ph = h * Math.min(1, pv / 1.12); c.fillRect(x + 4, y + h - ph, 14, ph);
    // accuracy: a needle across
    const av = m.stage === 2 ? val : m.stage > 2 ? m.acc : 0;
    c.fillStyle = "#333"; c.fillRect(x + 32, y + 50, 84, 12); c.fillStyle = "#3c8"; c.fillRect(x + 32 + 42 - 4, y + 50, 8, 12);
    if (m.stage >= 2) { c.fillStyle = "#fff"; c.fillRect(x + 32 + 42 + av * 42 - 1, y + 46, 3, 20); }
    // hook
    const hv = m.stage === 3 ? val : 0;
    c.fillStyle = "#333"; c.fillRect(x + 32, y + 100, 84, 12);
    if (m.stage === 3) { c.fillStyle = "#fd4"; c.fillRect(x + 32 + (hv + 0.5) / 1.5 * 84 - 1, y + 96, 3, 20); }
    c.fillStyle = "#aaa"; c.font = '400 10px "Fira Mono", ui-monospace, monospace'; c.fillText("BACK UP   STRAIGHT   HOOK", x + 26, y + 118);
  }
  // the flick (mouse / touch / stick) as it is drawn
  if (o.flick && o.flick.stage) {
    const f = o.flick, x = W - 34, y = H - 190, h = 150;
    c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(x - 6, y - 22, 30, h + 30);
    c.fillStyle = "#333"; c.fillRect(x, y, 18, h); c.fillStyle = "#c22"; c.fillRect(x, y, 18, h * 0.06);
    const pv = f.stage === 2 ? f.power : Math.min(1, f.pull / 120) * 0.3;
    c.fillStyle = f.stage === 2 ? "#3c8" : "#888"; c.fillRect(x + 3, y + h - h * Math.min(1, pv / 1.06), 12, h * Math.min(1, pv / 1.06));
  }
  // the call
  if (o.call) {
    c.textAlign = "center"; c.font = '700 30px "Fira Mono", ui-monospace, monospace';
    c.fillStyle = "rgba(0,0,0,0.78)"; c.fillRect(0, H * 0.4 - 30, W, o.sub ? 78 : 56);
    if (cosmic) { c.shadowColor = ink; c.shadowBlur = 16; }
    c.fillStyle = o.callColor || (cosmic ? "#ff4fe0" : "#ffe14a"); c.fillText(o.call, W / 2, H * 0.4 - 18);
    c.shadowBlur = 0;
    if (o.sub) { c.font = '400 12px "Fira Mono", ui-monospace, monospace'; c.fillStyle = "#eee"; c.fillText(o.sub, W / 2, H * 0.4 + 22); }
  }
  c.restore();
}

export const pinPx = () => ({ F, D, EYE, HZ, R_PIN, L_PIN });
// the lane x under a screen point on the approach row (the finger sliding the bowler)
export function laneXAt(view, sx, y = -26) { return (sx - W / 2) * Math.max(NEAR, y + D - view.camZ) / F + view.camX; }
export const toScreen = (view, x, y, z = 0) => proj(view, x, y, z);
