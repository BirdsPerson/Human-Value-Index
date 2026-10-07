// THE SUB-BASEMENTS on a canvas: rectangles and glyphs in the Department palette (sprites later).
// Consumes the state and an event stream; owns nothing the sim reads. The camera window is 24 x 14
// tiles around the seat; rooms show once entered; monsters only inside the window and in revealed
// rooms (THE AUDITOR comes through walls, so he is drawn wherever he is in the window). Screen shake,
// sparks and floating numbers are render-only; hit-stop is the sim's.
import { T } from "./engine/index.js";

export const VIEW_W = 24, VIEW_H = 14;
const CAB_HP = 2;
export function palette() {
  const css = (k, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim() || d; } catch { return d; } };
  return {
    bg: "#000", floor: css("--panel", "#0d140d"), floor2: css("--panel-hi", "#132013"), wall: "#0b1d10", wallEdge: css("--line-hi", "#2f6a42"), line: css("--line-hi", "#2f6a42"),
    fg: css("--fg", "#c8f5d8"), dim: css("--fg-dim", "#86c9a0"), mute: css("--fg-mute", "#5a9170"), ghost: css("--fg-ghost", "#2d5040"),
    accent: css("--accent", "#4ade80"), ink: css("--accent-ink", "#06210f"), warn: css("--warn", "#fbbf24"), harm: css("--harm", "#f87171"),
    cyan: css("--eb-cyan", "#2bc6de"), amber: css("--eb-amber", "#ffaa2d"), red: css("--duke", "#FF5C6B"),
  };
}

const MON_LOOK = {
  "form-27b": { glyph: "≡", fill: "#d9efe0", ink: "#0a0f0a", w: 0.5, h: 0.62 },
  "feral-data": { glyph: "%", fill: "#22c55e", ink: "#06210f", w: 1, h: 0.8, blob: true },
  "file-cart": { glyph: "▤", fill: "#b8862f", ink: "#1a1205", w: 0.9, h: 0.8 },
  "toner-printer": { glyph: "▣", fill: "#5a9170", ink: "#06210f", w: 0.86, h: 0.86 },
  "copier": { glyph: "⎘", fill: "#86c9a0", ink: "#06210f", w: 0.98, h: 0.98 },
  "auditor": { glyph: "A", fill: "#FF5C6B", ink: "#2a0508", w: 0.9, h: 1.25 },
};
const PICK_LOOK = { bounty: ["¶", "warn"], coffee: ["c", "amber"], keycard: ["⌐", "cyan"], form00: ["□", "fg"], crate: ["▣", "amber"] };

function visibleTile(st, g, x, y) {
  const i = y * g.w + x, r = g.room[i];
  if (r >= 0) return st.rev[r] === 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
    const q = g.room[ny * g.w + nx]; if (q >= 0 && st.rev[q] === 1) return true;
  }
  return false;
}
export function camera(st, P) {
  const g = st.fl.g;
  let cx = P.x - VIEW_W / 2, cy = P.y - VIEW_H / 2;
  cx = Math.max(0, Math.min(g.w - VIEW_W, cx)); cy = Math.max(0, Math.min(g.h - VIEW_H, cy));
  return { cx, cy };
}
export function inView(st, P, e) {
  const { cx, cy } = camera(st, P);
  if (e.x < cx - 1 || e.y < cy - 1 || e.x > cx + VIEW_W + 1 || e.y > cy + VIEW_H + 1) return false;
  if (e.a === "stalker") return true;
  const g = st.fl.g; return visibleTile(st, g, Math.floor(e.x), Math.floor(e.y));
}

export function draw(ctx, st, v) {
  const { pal: c, tile: S } = v, g = st.fl.g, W = VIEW_W * S, H = VIEW_H * S;
  const P = st.ents.find(e => e.k === "player") || { x: st.fl.arrival.x, y: st.fl.arrival.y, fx: 1, fy: 0, hp: 0, hpMax: 1 };
  const { cx, cy } = camera(st, P);
  ctx.save();
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
  ctx.translate(Math.round(v.shake.x), Math.round(v.shake.y));
  const X = (x) => (x - cx) * S, Y = (y) => (y - cy) * S;
  const font = (k, w = "700") => { ctx.font = `${w} ${Math.max(8, Math.round(S * k))}px "Fira Mono", ui-monospace, Menlo, monospace`; };
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // tiles
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  for (let y = y0; y <= y0 + VIEW_H && y < g.h; y++) for (let x = x0; x <= x0 + VIEW_W && x < g.w; x++) {
    if (!visibleTile(st, g, x, y)) continue;
    const t = g.t[y * g.w + x], px = X(x), py = Y(y);
    if (t === T.WALL) {
      ctx.fillStyle = c.wall; ctx.fillRect(px, py, S, S);
      ctx.fillStyle = c.wallEdge;
      const open = (dx, dy) => { const q = g.t[(y + dy) * g.w + x + dx]; return q !== undefined && q !== T.WALL && x + dx >= 0 && x + dx < g.w; };
      if (open(0, 1)) ctx.fillRect(px, py + S - 2, S, 2);
      if (open(0, -1)) ctx.fillRect(px, py, S, 2);
      if (open(1, 0)) ctx.fillRect(px + S - 2, py, 2, S);
      if (open(-1, 0)) ctx.fillRect(px, py, 2, S);
      continue;
    }
    ctx.fillStyle = (x + y) % 2 ? c.floor : c.floor2; ctx.fillRect(px, py, S, S);
    if (t === T.DOOR) {
      // a doorway: the jambs on the wall sides, open between
      const wallX = g.t[y * g.w + x - 1] === T.WALL && g.t[y * g.w + x + 1] === T.WALL;
      ctx.fillStyle = c.line;
      if (wallX) { ctx.fillRect(px, py, S * 0.16, S); ctx.fillRect(px + S * 0.84, py, S * 0.16, S); }
      else { ctx.fillRect(px, py, S, S * 0.16); ctx.fillRect(px, py + S * 0.84, S, S * 0.16); }
    }
    else if (t === T.LOCKED) { ctx.fillStyle = c.warn; ctx.fillRect(px + 1, py + 1, S - 2, S - 2); ctx.fillStyle = c.ink; font(0.7); ctx.fillText("⌐", px + S / 2, py + S / 2 + 1); }
    else if (t === T.STAIRS) { ctx.fillStyle = st.sealed ? c.harm : c.accent; ctx.fillRect(px + 1, py + 1, S - 2, S - 2); ctx.fillStyle = c.ink; for (let k = 0; k < 3; k++) ctx.fillRect(px + S * (0.2 + k * 0.2), py + S * (0.25 + k * 0.17), S * (0.6 - k * 0.2), S * 0.12); }
    else if (t === T.LIFT) { ctx.fillStyle = c.cyan; ctx.fillRect(px - S * 0.25, py - S * 0.25, S * 1.5, S * 1.5); ctx.fillStyle = c.ink; ctx.fillRect(px + S * 0.47, py - S * 0.15, S * 0.06, S * 1.3); font(0.42); ctx.fillText("LIFT", px + S / 2, py + S * 1.45); }
    else if (t === T.HATCH) { ctx.fillStyle = c.amber; ctx.fillRect(px + 2, py + 2, S - 4, S - 4); ctx.fillStyle = "#000"; ctx.fillRect(px + S * 0.25, py + S * 0.25, S * 0.5, S * 0.5); }
  }
  // the service lift car on the entrance floor (it only goes down)
  if (st.floor === 4 && visibleTile(st, g, Math.floor(st.fl.arrival.x), Math.floor(st.fl.arrival.y))) {
    ctx.strokeStyle = c.cyan; ctx.lineWidth = 2; ctx.strokeRect(X(st.fl.arrival.x - 1), Y(st.fl.arrival.y - 1), S * 2, S * 2);
    ctx.fillStyle = c.cyan; font(0.36); ctx.fillText("SERVICE LIFT", X(st.fl.arrival.x), Y(st.fl.arrival.y - 1.3));
  }
  // entities: cabinets and pickups, shots, monsters, the player(s)
  const order = ["cab", "pick", "shot", "mon", "player"];
  for (const kind of order) for (const e of st.ents) {
    if (e.k !== kind || e.dead) continue;
    if (kind !== "player" && !inView(st, P, e)) continue;
    const px = X(e.x), py = Y(e.y);
    if (kind === "cab") {
      ctx.fillStyle = e.flash > 0 ? c.fg : e.hp < CAB_HP ? c.ghost : c.mute; ctx.fillRect(px - S * 0.42, py - S * 0.45, S * 0.84, S * 0.9);
      ctx.fillStyle = c.wall; ctx.fillRect(px - S * 0.32, py - S * 0.12, S * 0.64, S * 0.06); ctx.fillRect(px - S * 0.32, py + S * 0.16, S * 0.64, S * 0.06);
      if (e.hp < CAB_HP) { ctx.strokeStyle = c.wall; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - S * 0.3, py - S * 0.4); ctx.lineTo(px + S * 0.1, py + S * 0.4); ctx.stroke(); }
      continue;
    }
    if (kind === "pick") {
      const [gl, col] = PICK_LOOK[e.item] || ["?", "fg"], bob = v.reduced ? 0 : Math.sin(v.t / 180 + e.id) * S * 0.06;
      ctx.fillStyle = c[col]; font(e.item === "crate" ? 0.8 : 0.66); ctx.fillText(gl, px, py + bob);
      continue;
    }
    if (kind === "shot") {
      if (e.by === "seat") { ctx.strokeStyle = c.fg; ctx.lineWidth = Math.max(2, S * 0.08); ctx.beginPath(); ctx.moveTo(px - e.vx * S * 1.2, py - e.vy * S * 1.2); ctx.lineTo(px, py); ctx.stroke(); }
      else { ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(px, py, S * 0.2, 0, 7); ctx.fill(); ctx.strokeStyle = c.harm; ctx.lineWidth = 2; ctx.stroke(); }
      continue;
    }
    if (kind === "mon") { drawMon(ctx, st, e, px, py, S, c, v, font); continue; }
    drawPlayer(ctx, e, px, py, S, c, v);
  }
  // THE AUDITOR off the window: a marker at the edge
  for (const e of st.ents) {
    if (e.a !== "stalker" || e.dead) continue;
    const px = X(e.x), py = Y(e.y);
    if (px >= 0 && py >= 0 && px <= W && py <= H) continue;
    const mx = Math.max(S * 0.6, Math.min(W - S * 0.6, px)), my = Math.max(S * 1.8, Math.min(H - S * 1.6, py));
    ctx.fillStyle = c.red; ctx.beginPath(); ctx.arc(mx, my, S * 0.35 + (v.reduced ? 0 : Math.sin(v.t / 120) * S * 0.06), 0, 7); ctx.fill();
    ctx.fillStyle = "#2a0508"; font(0.5); ctx.fillText("A", mx, my + 1);
  }
  // sparks and numbers (render-only)
  for (const p of v.fx) {
    const a = Math.max(0, 1 - p.age / p.life), px = X(p.x), py = Y(p.y) - (p.rise ? p.age * S * 0.02 : 0);
    ctx.globalAlpha = a;
    if (p.text) { ctx.fillStyle = c[p.col] || p.col; font(0.55); ctx.fillText(p.text, px, py); }
    else { ctx.fillStyle = c[p.col] || p.col; const r = S * (0.15 + 0.35 * (1 - a)); ctx.fillRect(px - r, py - S * 0.05, r * 2, S * 0.1); ctx.fillRect(px - S * 0.05, py - r, S * 0.1, r * 2); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  hud(ctx, st, P, v, W, H, font);
}

function drawMon(ctx, st, e, px, py, S, c, v, font) {
  const L = MON_LOOK[e.m] || { glyph: "?", fill: c.fg, ink: c.bg, w: 0.8, h: 0.8 };
  const sc = e.a === "splitter" ? 0.55 + 0.15 * e.size : 1;
  const w = S * L.w * sc, h = S * L.h * sc;
  const winding = e.s === "wind" || e.s === "tele";
  // the telegraph: a charger's lane, a turret's sight line, a blink before any bite
  if (e.a === "charger" && e.s === "tele") {
    ctx.strokeStyle = c.harm; ctx.lineWidth = Math.max(2, S * 0.12); ctx.setLineDash([S * 0.3, S * 0.2]);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + e.dx * S * 8, py + e.dy * S * 8); ctx.stroke(); ctx.setLineDash([]);
  }
  if (e.a === "turret" && e.s === "wind") { ctx.strokeStyle = c.harm; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + e.fx * S * 9, py + e.fy * S * 9); ctx.stroke(); }
  const blink = winding && (v.reduced ? true : Math.floor(v.t / 70) % 2 === 0);
  ctx.fillStyle = e.flash > 0 ? "#fff" : blink ? c.harm : L.fill;
  if (e.a === "stalker") ctx.globalAlpha = 0.92;
  ctx.fillRect(px - w / 2, py - h / 2, w, h);
  ctx.globalAlpha = 1;
  if (e.stun > 0 && e.a !== "splitter") { ctx.strokeStyle = c.cyan; ctx.lineWidth = 2; ctx.strokeRect(px - w / 2 - 2, py - h / 2 - 2, w + 4, h + 4); }
  ctx.fillStyle = L.ink; font(Math.min(L.w, L.h) * sc * 0.75); ctx.fillText(L.glyph, px, py + 1);
  if (e.a === "turret") { ctx.fillStyle = L.ink; ctx.fillRect(px + e.fx * S * 0.3 - S * 0.08, py + e.fy * S * 0.3 - S * 0.08, S * 0.16, S * 0.16); }
  if (e.a === "generator") {
    const M = 360; ctx.fillStyle = c.wall; ctx.fillRect(px - w / 2, py + h / 2 + 2, w, S * 0.12);
    ctx.fillStyle = c.warn; ctx.fillRect(px - w / 2, py + h / 2 + 2, w * Math.min(1, e.t / (M / st.lv.gen)), S * 0.12);
  }
  if (e.a === "stalker") { ctx.fillStyle = c.red; font(0.34); ctx.fillText("AUDITOR", px, py - h / 2 - S * 0.25); }
  if (e.hpMax > 1 && e.hp < e.hpMax && e.a !== "stalker") { ctx.fillStyle = c.wall; ctx.fillRect(px - w / 2, py - h / 2 - S * 0.16, w, S * 0.08); ctx.fillStyle = c.harm; ctx.fillRect(px - w / 2, py - h / 2 - S * 0.16, (w * e.hp) / e.hpMax, S * 0.08); }
}

function drawPlayer(ctx, P, px, py, S, c, v) {
  if (P.hp <= 0) { ctx.fillStyle = c.ghost; ctx.fillRect(px - S * 0.4, py - S * 0.15, S * 0.8, S * 0.3); return; }
  const rolling = P.roll > 0, inv = P.hurt > 0 && !v.reduced && Math.floor(v.t / 60) % 2 === 0;
  // the swing: an arc of rectangles in front
  if (P.atk > 0) {
    const e0 = 18 - P.atk, act = e0 >= 6 && e0 < 10;
    ctx.fillStyle = act ? c.fg : c.ghost;
    for (let k = -2; k <= 2; k++) {
      const a = k * 0.42, cs = Math.cos(a), sn = Math.sin(a), dx = P.fx * cs - P.fy * sn, dy = P.fx * sn + P.fy * cs;
      ctx.fillRect(px + dx * S * 0.95 - S * 0.09, py + dy * S * 0.95 - S * 0.09, S * 0.18, S * 0.18);
    }
  }
  ctx.globalAlpha = inv ? 0.35 : rolling ? 0.6 : 1;
  ctx.fillStyle = P.flash > 0 ? c.harm : c.fg;
  const s = rolling ? 0.5 : 0.62;
  ctx.fillRect(px - S * s / 2, py - S * s / 2, S * s, S * s);
  ctx.fillStyle = c.accent; ctx.fillRect(px + P.fx * S * 0.32 - S * 0.09, py + P.fy * S * 0.32 - S * 0.09, S * 0.18, S * 0.18);
  ctx.globalAlpha = 1;
}

const mmss = (f) => { const s = Math.max(0, Math.ceil(f / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function hud(ctx, st, P, v, W, H, font) {
  const c = v.pal, S = v.tile;
  ctx.save(); ctx.textBaseline = "middle";
  // top bar: hearts, the floor, the shift
  ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.fillRect(0, 0, W, S * 1.15);
  const hearts = Math.ceil(P.hpMax / 4), hs = S * 0.62;
  for (let k = 0; k < hearts; k++) {
    const left = Math.max(0, Math.min(4, P.hp - k * 4)), x = S * 0.35 + k * (hs + S * 0.12), y = S * 0.26;
    ctx.fillStyle = c.ghost; ctx.fillRect(x, y, hs, hs);
    ctx.fillStyle = P.hp <= 8 ? c.harm : c.accent; ctx.fillRect(x, y + hs * (1 - left / 4), hs, (hs * left) / 4);
  }
  font(0.56); ctx.textAlign = "center"; ctx.fillStyle = c.fg;
  ctx.fillText(`B${st.floor}${st.fl.lift ? " · LIFT FLOOR" : ""}${st.sealed ? " · SEALED" : ""}`, W / 2, S * 0.58);
  ctx.textAlign = "right"; ctx.fillStyle = 72000 - st.shift < 7200 ? c.harm : c.dim;
  ctx.fillText(`SHIFT ${mmss(72000 - st.shift)}`, W - S * 0.3 - (v.mini ? v.mini.w + S * 0.3 : 0), S * 0.58);
  // the minimap
  if (v.mini) minimap(ctx, st, P, v, W);
  // bottom tray: the pack, the bounty, the keycard
  const ty = H - S * 1.15, seat = st.seats[0], sw = Math.min(S * 0.95, (W - S * 6) / 12);
  ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.fillRect(0, ty, W, S * 1.15);
  for (let k = 0; k < 12; k++) {
    const x = S * 0.3 + k * (sw + 2), it = seat.pack[k];
    ctx.strokeStyle = k === seat.slot ? c.accent : c.ghost; ctx.lineWidth = k === seat.slot ? 2 : 1; ctx.strokeRect(x + 0.5, ty + S * 0.15 + 0.5, sw - 1, sw - 1);
    if (it) { const [gl, col] = PICK_LOOK[it.k] || ["?", "fg"]; ctx.fillStyle = c[col]; font(0.55); ctx.textAlign = "center"; ctx.fillText(gl, x + sw / 2, ty + S * 0.15 + sw / 2 + 1); }
  }
  ctx.textAlign = "right"; font(0.5); ctx.fillStyle = c.warn;
  ctx.fillText(`¶ ${seat.bounty}${seat.keycard === st.floor ? "  ⌐ KEYCARD" : ""}`, W - S * 0.3, ty + S * 0.6);
  // the prompt and the message
  ctx.textAlign = "center";
  if (v.prompt) { font(0.56); const tw = ctx.measureText(v.prompt).width + S; ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(W / 2 - tw / 2, ty - S * 1.1, tw, S * 0.85); ctx.fillStyle = c.fg; ctx.fillText(v.prompt, W / 2, ty - S * 0.68); }
  if (v.msg) { font(0.6); const tw = ctx.measureText(v.msg.text).width + S; ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(W / 2 - tw / 2, S * 1.35, tw, S * 0.9); ctx.fillStyle = c[v.msg.col] || c.fg; ctx.fillText(v.msg.text, W / 2, S * 1.8); }
  // the phases
  if (st.phase === "descent") { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, 1 - st.phaseT / 40)})`; ctx.fillRect(0, 0, W, H); ctx.fillStyle = c.fg; font(1.4); ctx.fillText(`B${st.floor + 1}`, W / 2, H / 2); }
  if (st.phase === "landing" && st.floor !== v.firstFloor) { const a = Math.max(0, st.phaseT / 60); ctx.fillStyle = `rgba(0,0,0,${a * 0.85})`; ctx.fillRect(0, 0, W, H); ctx.fillStyle = c.fg; font(1.4); ctx.globalAlpha = a; ctx.fillText(`B${st.floor}`, W / 2, H / 2); ctx.globalAlpha = 1; }
  if (st.phase === "lift" || (st.phase === "filed" && st.exit === "lift")) { ctx.fillStyle = "rgba(4,30,40,0.75)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = c.cyan; font(0.9); ctx.fillText("THE LIFT IS HERE.", W / 2, H / 2); }
  if (st.phase === "lost" || (st.phase === "filed" && st.exit === "lost")) { ctx.fillStyle = "rgba(40,4,6,0.78)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = c.harm; font(0.8); ctx.fillText(st.why === "shift" ? "SHIFT OVER." : "DOWN.", W / 2, H / 2); }
  if (v.replay) { ctx.textAlign = "left"; font(0.5); ctx.fillStyle = c.warn; ctx.fillText("REPLAY", S * 0.3, S * 1.6); }
  ctx.restore();
}

function minimap(ctx, st, P, v, W) {
  const g = st.fl.g, m = v.mini.px, x0 = W - v.mini.w - v.tile * 0.2, y0 = v.tile * 0.08, c = v.pal;
  ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(x0 - 2, y0 - 2, g.w * m + 4, g.h * m + 4);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const i = y * g.w + x, r = g.room[i], t = g.t[i];
    if (r >= 0 ? !st.rev[r] : t !== T.DOOR && t !== T.LOCKED) continue;
    if (r < 0 && !visibleTile(st, g, x, y)) continue;
    ctx.fillStyle = t === T.STAIRS ? (st.sealed ? c.harm : c.accent) : t === T.LIFT ? c.cyan : t === T.HATCH ? c.amber : t === T.LOCKED ? c.warn : c.ghost;
    ctx.fillRect(x0 + x * m, y0 + y * m, m, m);
  }
  ctx.fillStyle = c.fg; ctx.fillRect(x0 + Math.floor(P.x) * m - 1, y0 + Math.floor(P.y) * m - 1, m + 2, m + 2);
  for (const e of st.ents) if (e.a === "stalker" && !e.dead) { ctx.fillStyle = c.red; ctx.fillRect(x0 + Math.floor(e.x) * m - 1, y0 + Math.floor(e.y) * m - 1, m + 2, m + 2); }
}
