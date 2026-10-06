// FOURTH AND LONG: the picture. An 8-bit field on a 256 x 224 canvas, scaled up square-pixelled: the
// field side-on and scrolling with the ball, big blocky men in the league's kits, the play card, the
// touchdown screen. All our own art, drawn here in rects. Pure apart from the canvas it is handed.
import { FW, CY, O, D, PLAYS, ELIGIBLE, KICK_PUNT, KICK_FG, kicksOpen, carrierOf, dirOf, downName, togoText, sideOf, meterAt, offMan, HZ } from "./sim.js";

export const W = 256, H = 224;
const XS = 8;                     // pixels a yard, along the field
const FY0 = 30, FY1 = 206;        // the field's far and near sidelines on screen
const YS = (FY1 - FY0) / FW;      // pixels a yard, across
export const sx = (cam, x) => Math.round(W / 2 + (x - cam.x) * XS);
export const sy = (y) => Math.round(FY0 + y * YS);
const PAL = { ink: "#000000", white: "#fcfcfc", grassA: "#00a800", grassB: "#10b818", line: "#fcfcfc", sky: "#0000a8", night: "#000040", gold: "#f8b800", red: "#e40058", blue: "#0078f8", grey: "#bcbcbc", dark: "#383838", ball: "#a85000", crowd: ["#7c7c7c", "#bcbcbc", "#f8b800", "#e40058", "#0078f8", "#fcfcfc"] };

// ---- type: 3 x 5, scaled ------------------------------------------------------------------------------
const GL = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101",
  S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
  4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001110",
  ".": "000000000000010", "-": "000000111000000", ":": "000010000010000", "!": "010010010000010", "/": "001001010100100", "&": "010101010101011", "'": "010010000000000", ",": "000000000010100",
  "*": "000101010101000", ">": "100010001010100", "<": "001010100010001", "?": "110001010000010", "(": "010100100100010", ")": "010001001001010",
};
export const textW = (s, k = 1) => Math.max(0, String(s).length * 4 - 1) * k;
export function text(ctx, s, x, y, c, k = 1) {
  ctx.fillStyle = c;
  let cx = Math.round(x);
  for (const ch of String(s).toUpperCase()) {
    const g = GL[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(cx + (i % 3) * k, Math.round(y) + Math.floor(i / 3) * k, k, k);
    cx += 4 * k;
  }
}
function shadowText(ctx, s, x, y, c, k = 1) { text(ctx, s, x + k, y + k, PAL.ink, k); text(ctx, s, x, y, c, k); }
const centre = (ctx, s, y, c, k = 1, shadow = true) => (shadow ? shadowText : text)(ctx, s, Math.round((W - textW(s, k)) / 2), y, c, k);
function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
const ink = (bg) => (lum(bg) > 140 ? PAL.ink : PAL.white);
export const clock = (f) => { const s = Math.ceil(f / HZ); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
// the 3 x 5 type has no accents: "ANDRÉ" is drawn ANDRE
export const plain = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
export const lastName = (n) => plain(String(n || "").replace(/\s*\([^)]*\)\s*/g, " ").trim().split(/\s+/).pop());
const fullName = (n) => plain(String(n || "").replace(/\s*\([^)]*\)\s*/g, " ").trim());

// ---- the camera ----------------------------------------------------------------------------------------
export function camInit(st) { return { x: camTarget(st), shake: 0 }; }
function camTarget(st) {
  const b = st.ball;
  let x = b ? b.x : 50;
  if (b && b.state === "air" && b.kind === "pass") x = b.x0 + (b.x1 - b.x0) * Math.min(1, b.f / b.T);
  if (st.phase === "call" || st.phase === "pre") x = st.los + dirOf(st.poss) * 6;
  return Math.max(6, Math.min(94, x));
}
export function camFollow(cam, st, reduced) {
  const t = camTarget(st);
  cam.x += (t - cam.x) * (reduced ? 0.25 : 0.12);
  if (Math.abs(t - cam.x) < 0.02) cam.x = t;
}

// ---- a man, 12 x 22, feet at (x, y) -------------------------------------------------------------------
// pose: "run" | "down" | "dive" | "cheer"; kit: [jersey, trim]
export function drawMan(ctx, x, y, kit, face, step, pose = "run", opts = {}) {
  const [jer, trim] = kit, k = opts.k || 1;
  const helm = opts.helmet || shade(jer, lum(jer) > 150 ? 0.72 : 1.35), pants = trim;
  const jerD = shade(jer, 0.72), jerL = shade(jer, lum(jer) > 200 ? 1 : 1.22), pantsD = shade(pants, 0.7), helmD = shade(helm, 0.65);
  const mask = "#d8d8d8", sock = "#202020", OUT = "#101018";
  // two passes over one list of rects: every rect grown by a pixel in the outline colour, then the colours
  const rects = [];
  const P = (px, py, w, h, c) => rects.push([px, py, w, h, c]);
  const flush = () => {
    for (const [px, py, w, h] of rects) R(ctx, x + (face > 0 ? px - 1 : -px - w - 1) * k, y + (py - 1) * k, (w + 2) * k, (h + 2) * k, OUT);
    for (const [px, py, w, h, c] of rects) R(ctx, x + (face > 0 ? px : -px - w) * k, y + py * k, w * k, h * k, c);
  };
  if (pose === "down" || pose === "dive") {
    const lift = pose === "dive" ? -4 : 0;
    R(ctx, x - 9 * k, y - 1 * k, 18 * k, 2 * k, "rgba(0,0,0,0.35)");
    P(-9, -5 + lift, 3, 2, sock); P(-6, -6 + lift, 5, 3, pants); P(-6, -4 + lift, 5, 1, pantsD);
    P(-1, -7 + lift, 7, 5, jer); P(-1, -3 + lift, 7, 1, jerD); P(-1, -7 + lift, 7, 1, trim);
    P(6, -8 + lift, 4, 4, helm); P(6, -5 + lift, 4, 1, helmD); P(9, -7 + lift, 1, 3, mask);
    if (pose === "dive") { P(9, -4 + lift, 4, 2, jer); P(13, -4 + lift, 1, 2, mask); }
    if (opts.ball) P(4, -9 + lift, 3, 2, PAL.ball);
    return flush();
  }
  R(ctx, x - 6 * k, y - 1 * k, 12 * k, 2 * k, "rgba(0,0,0,0.35)");
  const f = pose === "cheer" ? 0 : step % 4;   // the run: four frames, the legs and the arms opposite
  const legs = [[[-3, 0], [1, 0]], [[-5, -1], [3, 1]], [[-3, 0], [1, 0]], [[-4, 1], [2, -1]]][f];
  for (const [lx, sw] of legs) { P(lx, -6, 2, 4, pants); P(lx + (sw > 0 ? 1 : sw < 0 ? -1 : 0), -2, 2, 2, sock); }
  P(-3, -10, 6, 4, pants); P(-3, -7, 6, 1, pantsD);                         // the pants
  P(-4, -16, 8, 6, jer); P(-5, -17, 10, 2, jer);                            // the jersey and the pads
  P(-4, -16, 2, 6, jerD); P(1, -17, 4, 1, jerL);                            // the shade on the back, the light on the pads
  P(-4, -11, 8, 1, trim); P(-1, -15, 2, 3, trim);                           // the hem, a number's stroke
  if (pose === "cheer") { P(-6, -23, 2, 7, jer); P(4, -23, 2, 7, jer); P(-6, -24, 2, 1, mask); P(4, -24, 2, 1, mask); }
  else {
    const sw = f === 1 ? 1 : f === 3 ? -1 : 0;
    P(-6, -16 - sw, 2, 5, jerD); P(-6, -11 - sw, 2, 1, mask);              // the far arm
    if (!opts.ball) { P(4, -16 + sw, 2, 5, jer); P(4, -11 + sw, 2, 1, mask); }
    else { P(3, -15, 3, 2, jer); P(2, -14, 3, 2, PAL.ball); P(3, -14, 1, 1, PAL.white); }   // the ball tucked
  }
  if (opts.head && pose === "cheer") {
    flush(); rects.length = 0;
    // the helmet off for the cameras: the figure's own head, cut from the file photo
    const h = opts.head, hw = h.width * k * 0.5, hh = h.height * k * 0.5;
    ctx.drawImage(h, Math.round(x - hw / 2), Math.round(y - 17 * k - hh), Math.round(hw), Math.round(hh));
    return;
  }
  P(-3, -22, 6, 5, helm); P(-3, -18, 6, 1, helmD); P(-1, -22, 2, 1, trim);  // the helmet, its shadow, its stripe
  P(3, -20, 1, 3, mask); P(2, -19, 1, 1, mask);                             // the face mask
  if (opts.star) P(-1, -23, 2, 1, PAL.gold);                                // a star: the gold pip
  flush();
}

// ---- the field -------------------------------------------------------------------------------------------
function drawField(ctx, st, cam, t, names, kits) {
  // the stands behind the far sideline, and the crowd in them
  R(ctx, 0, 12, W, FY0 - 12, PAL.dark);
  for (let i = 0; i < 64; i++) {
    const wx = Math.floor((i * 4 - cam.x * XS * 0.5) % W + W) % W, row = i % 3;
    const bob = ((i * 7 + Math.floor(t * 4)) % 9) === 0 ? -1 : 0;
    R(ctx, wx, 14 + row * 4 + bob, 2, 2, PAL.crowd[(i * 5 + row) % PAL.crowd.length]);
  }
  R(ctx, 0, FY0 - 3, W, 3, PAL.white);
  // grass, five-yard bands
  for (let x = -10; x < 110; x += 5) {
    const a = sx(cam, x), b = sx(cam, x + 5);
    if (b < 0 || a > W) continue;
    R(ctx, a, FY0, b - a, FY1 - FY0, ((x + 10) / 5) % 2 ? PAL.grassA : PAL.grassB);
  }
  // the end zones in the home and visiting colours, the team's name across
  for (const [t0, x0] of [[1, -10], [0, 100]]) {
    const a = sx(cam, x0), b = sx(cam, x0 + 10);
    if (b < 0 || a > W) continue;
    // team 0 defends the left end zone (its own), team 1 the right
    const owner = x0 < 0 ? 0 : 1;
    void t0;
    R(ctx, a, FY0, b - a, FY1 - FY0, shade(kits[owner][0], 0.75));
    const nm = names[owner] || "";
    const k = textW(nm, 2) <= 76 ? 2 : 1;
    for (let r = 0; r < 2; r++) shadowText(ctx, nm, a + (80 - textW(nm, k)) / 2, sy(r ? FW * 0.7 : FW * 0.22), ink(shade(kits[owner][0], 0.75)) === PAL.ink ? PAL.white : kits[owner][1], k);
  }
  // the lines: every five yards, the goal lines heavier; the hash ticks every yard
  for (let x = 0; x <= 100; x += 5) { const a = sx(cam, x); if (a < -2 || a > W + 2) continue; R(ctx, a, FY0, x % 50 === 0 && x !== 50 ? 2 : 1, FY1 - FY0, PAL.line); }
  for (let x = 1; x < 100; x++) { if (x % 5 === 0) continue; const a = sx(cam, x); if (a < 0 || a > W) continue; for (const y of [1, FW * 0.44, FW * 0.56, FW - 1]) R(ctx, a, sy(y), 1, 2, PAL.line); }
  for (let x = 10; x <= 90; x += 10) {
    const a = sx(cam, x), n = String(x <= 50 ? x : 100 - x);
    if (a < -20 || a > W + 20) continue;
    shadowText(ctx, n, a - textW(n, 2) / 2, sy(4) - 2, PAL.white, 2);
    shadowText(ctx, n, a - textW(n, 2) / 2, sy(FW - 4) - 8, PAL.white, 2);
  }
  // the posts at the back of each end zone
  for (const x of [-10, 110]) {
    const a = sx(cam, x);
    if (a < -10 || a > W + 10) continue;
    const y0 = sy(CY);
    R(ctx, a, y0 - 14, 1, 14, PAL.gold);
    R(ctx, a - 1, y0 - 14, 3, 1, PAL.gold);
    R(ctx, a, y0 - 14 - 22, 1, 22, PAL.gold); R(ctx, a + 1, y0 - 14 - 22, 1, 22, shade(PAL.gold, 0.7));
  }
  R(ctx, 0, FY1, W, 2, PAL.white);
  R(ctx, 0, FY1 + 2, W, H - FY1 - 2, PAL.dark);
}
function drawLines(ctx, st, cam) {
  if (!st.play || (!st.play.scrim && st.phase !== "call") || !["pre", "live", "call"].includes(st.phase)) return;
  const a = sx(cam, st.los), f = sx(cam, st.firstAt);
  R(ctx, a, FY0, 1, FY1 - FY0, PAL.blue);
  if (st.firstAt > 0 && st.firstAt < 100) R(ctx, f, FY0, 1, FY1 - FY0, PAL.gold);
}

// ---- one frame of play ---------------------------------------------------------------------------------
// view: { names: [short, short], kits, sides, heads: {key: canvas}, reduced, t (seconds, for blinking) }
export function draw(ctx, st, cam, view) {
  const { kits, reduced } = view, t = view.t || 0;
  ctx.imageSmoothingEnabled = false;
  if (st.phase === "call") return drawCall(ctx, st, view);
  if (st.phase === "td") return drawTd(ctx, st, view);
  if (st.phase === "quarter" || st.phase === "over") return drawQuarter(ctx, st, view);
  ctx.save();
  const shaking = st.freeze > 0 && !reduced;
  if (shaking) ctx.translate((st.freeze % 4 < 2 ? -2 : 2), (st.freeze % 3) - 1);
  drawField(ctx, st, cam, t, view.names, kits);
  drawLines(ctx, st, cam);
  const c = carrierOf(st), b = st.ball;
  const order = [...st.p].sort((p, q) => p.y - q.y);
  for (const p of order) {
    const x = sx(cam, p.x), y = sy(p.y);
    if (x < -16 || x > W + 16) continue;
    const pose = p.dive > 0 ? "dive" : p.down > 0 ? "down" : "run";
    const moving = Math.abs(p.vx) + Math.abs(p.vy) > 0.6;
    const stepN = moving ? Math.floor((Math.abs(p.x) + Math.abs(p.y)) * 2.2) : 0;
    drawMan(ctx, x, y, kits[p.t], p.face, stepN, pose, { star: p.r >= 75, ball: p === c });
  }
  // the markers: whose man is whose, the receiver the passer has picked
  for (let s = 0; s < 2; s++) {
    if (view.sides[s] !== "human" || st.ctrl[s] < 0 || st.phase === "kick" && st.kick?.t !== s) continue;
    const p = st.p[st.ctrl[s]], x = sx(cam, p.x), y = sy(p.y) - 30;
    const col = s === 0 ? PAL.red : PAL.blue;
    if (!reduced && Math.floor(t * 4) % 4 === 3) continue;
    R(ctx, x - 3, y, 7, 2, col); R(ctx, x - 2, y + 2, 5, 1, col); R(ctx, x - 1, y + 3, 3, 1, col); R(ctx, x, y + 4, 1, 1, col);
    text(ctx, s === 0 ? "1" : "2", x - 1, y - 6, col);
  }
  if (st.play?.kind === "pass" && !st.play.thrown && c && c.role === "qb" && view.sides[st.poss] === "human" && (st.phase === "live" || st.phase === "pre")) {
    const r = offMan(st, st.poss, ELIGIBLE[st.sel[st.poss]]), x = sx(cam, r.x), y = sy(r.y);
    if (reduced || Math.floor(t * 6) % 2 === 0) { R(ctx, x - 7, y + 1, 14, 1, PAL.gold); R(ctx, x - 5, y + 2, 10, 1, PAL.gold); }
    shadowText(ctx, ["WR", "WR", "TE", "RB"][st.sel[st.poss]], x - 3, y + 4, PAL.gold);
  }
  // the ball, in the air or on the tee
  if (b && (b.state === "air" || b.state === "tee" || b.state === "spot" && st.phase !== "pre")) {
    const x = sx(cam, b.x), y = sy(b.y);
    R(ctx, x - 1, y, 3, 1, "rgba(0,0,0,0.4)");
    const z = Math.round((b.z || 0) * 4);
    R(ctx, x - 3, y - 3 - z, 6, 5, "#101018"); R(ctx, x - 2, y - 2 - z, 4, 3, PAL.ball); R(ctx, x - 1, y - 1 - z, 2, 1, PAL.white);
  }
  ctx.restore();
  // the flash of a big hit
  if (st.freeze > 18 && !reduced && st.freeze % 2) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(0, 0, W, H); }
  drawHud(ctx, st, view);
  if (st.phase === "kick") drawMeter(ctx, st, view);
  if (st.phase === "pre") {
    const o = st.poss, df = 1 - o, hint = view.sides[o] === "human" ? `${o === 0 ? "P1" : "P2"}: A TO SNAP` : view.sides[df] === "human" ? `${df === 0 ? "P1" : "P2"}: B CHANGES YOUR MAN` : "SET";
    centre(ctx, hint, FY0 + 6, PAL.white);
    if (view.sides[df] === "human" && view.sides[o] === "human") centre(ctx, `${df === 0 ? "P1" : "P2"}: B CHANGES YOUR MAN`, FY0 + 14, PAL.white);
  }
  if (st.msg) centre(ctx, st.msg.text, 92, st.msg.text === "PLAY READ!" || st.msg.text === "INTERCEPTED!" ? PAL.red : PAL.gold, 2);
  if (st.grab && view.sides[st.p[st.grab.g].t] === "human" && (reduced || Math.floor(t * 8) % 2 === 0)) centre(ctx, "TAP A!", 112, PAL.white, 2);
}

function drawHud(ctx, st, view) {
  const { names, kits } = view;
  R(ctx, 0, 0, W, 12, PAL.ink);
  for (let s = 0; s < 2; s++) {
    const x = s === 0 ? 2 : W - 2 - 70;
    R(ctx, x, 2, 70, 8, kits[s][0]);
    text(ctx, (names[s] || "").slice(0, 11), x + 2, 4, ink(kits[s][0]));
    const sc = String(st.score[s]);
    R(ctx, s === 0 ? x + 72 : x - 14, 2, 12, 8, PAL.white);
    text(ctx, sc, (s === 0 ? x + 72 : x - 14) + (12 - textW(sc)) / 2, 4, PAL.ink);
    if (st.poss === s && st.phase !== "kick") R(ctx, s === 0 ? x + 85 : x - 18, 5, 2, 2, PAL.gold);
  }
  const mid = `Q${Math.min(4, st.q)} ${clock(st.clock)}`;
  text(ctx, mid, (W - textW(mid)) / 2, 4, PAL.white);
  // the bottom line: the down, and who has the ball
  let line = "";
  if (st.play?.scrim || st.phase === "pre") line = `${downName(st.down)} & ${togoText(st)} // ${sideOf(st)}`;
  else if (st.phase === "kick") line = st.kick?.kind === "fg" ? `FIELD GOAL // ${Math.round(st.kick.dist)} YDS` : st.kick?.kind === "pat" ? "EXTRA POINT" : st.kick?.kind === "punt" ? "PUNT" : "KICKOFF";
  text(ctx, line, 4, FY1 + 6, PAL.white);
  const c = carrierOf(st);
  if (c) { const nm = `${c.r >= 75 ? "* " : ""}${lastName(c.name)} ${c.r}`; text(ctx, nm, W - 4 - textW(nm), FY1 + 6, c.r >= 75 ? PAL.gold : PAL.white); }
}
function drawMeter(ctx, st, view) {
  const K = st.kick, human = view.sides[K.t] === "human";
  const v = K.power >= 0 ? K.power : meterAt(st.pf);
  const x = 64, y = 176, w = 128;
  R(ctx, x - 2, y - 2, w + 4, 12, PAL.ink); R(ctx, x, y, w, 8, PAL.dark);
  for (let i = 0; i < 16; i++) R(ctx, x + i * 8 + 1, y + 1, 6, 6, i / 16 < v ? (i > 12 ? PAL.red : i > 8 ? PAL.gold : "#58d854") : PAL.ink);
  const label = K.power >= 0 ? (K.kind === "fg" || K.kind === "pat" ? "" : "KICK!") : human ? `${K.t === 0 ? "P1" : "P2"}: A AT THE TOP` : "CPU KICKING";
  if (label) centre(ctx, label, y - 10, PAL.white);
}

// ---- the play card ---------------------------------------------------------------------------------------
const CARD = [[8, 40], [132, 40], [8, 112], [132, 112]], CW = 116, CH = 66;
function drawDiagram(ctx, id, x0, y0, w, h, col) {
  const pl = PLAYS[id];
  const u = w / 34, v = h / 46, ox = x0 + 9 * u, oy = y0 + h / 2;
  const at = (down, lat) => [ox + down * u, oy + lat * v];
  R(ctx, Math.round(ox), y0 + 2, 1, h - 4, PAL.grey);   // the line
  const OFF = [[0, -1.3], [0, -6.4], [0, -3.9], [-19, -0.8], [19, -0.8], [4.8, -0.8], [-3.2, -0.7], [-1.6, -0.7], [0, -0.5], [1.6, -0.7], [3.2, -0.7]];
  const pt = (s) => at(OFF[s][1], OFF[s][0]);
  const seg = (a, b) => {
    const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
    for (let i = 0; i <= n; i += 1) R(ctx, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, 1, 1, col);
  };
  const route = (s, pts) => { const [x, y] = pt(s); let prev = [x, y]; for (const [dn, lat] of pts) { const nx = x + Math.min(dn, 22) * u, ny = y + lat * v * 0.85; const cl = [Math.min(x0 + w - 2, nx), Math.max(y0 + 2, Math.min(y0 + h - 2, ny))]; seg(prev, cl); prev = cl; } R(ctx, prev[0] - 1, prev[1] - 1, 3, 3, col); };
  if (pl.kind === "run") route(O.RB, pl.path);
  else for (const [s, r] of Object.entries(pl.routes)) route(Number(s), r.pts);
  for (let s = 0; s < 11; s++) { const [x, y] = pt(s); R(ctx, x - 1, y - 1, 3, 3, PAL.white); }
}
function drawCall(ctx, st, view) {
  const { names, kits, sides } = view, t = view.t || 0, o = st.poss, df = 1 - o, c = st.call;
  R(ctx, 0, 0, W, H, PAL.sky);
  R(ctx, 0, 0, W, 12, PAL.ink);
  const head = `${downName(st.down)} & ${togoText(st)} // ${sideOf(st)} // Q${st.q} ${clock(st.clock)}`;
  text(ctx, head, (W - textW(head)) / 2, 4, PAL.white);
  // who is where
  const who = (s) => (sides[s] === "human" ? (s === 0 ? "P1" : "P2") : "CPU");
  R(ctx, 8, 16, 116, 18, kits[o][0]); text(ctx, `OFFENCE ${who(o)}`, 12, 19, ink(kits[o][0])); text(ctx, names[o], 12, 26, ink(kits[o][0]));
  R(ctx, 132, 16, 116, 18, kits[df][0]); text(ctx, `DEFENCE ${who(df)}`, 136, 19, ink(kits[df][0])); text(ctx, names[df], 136, 26, ink(kits[df][0]));
  text(ctx, `${st.score[o]}`, 120 - textW(`${st.score[o]}`), 26, ink(kits[o][0]));
  text(ctx, `${st.score[df]}`, 244 - textW(`${st.score[df]}`), 26, ink(kits[df][0]));
  const book = st.books[o];
  for (let i = 0; i < 4; i++) {
    const [x, y] = CARD[i], pl = PLAYS[book[i]];
    R(ctx, x, y, CW, CH, PAL.ink);
    R(ctx, x + 1, y + 1, CW - 2, 9, pl.kind === "run" ? "#503000" : "#004058");
    text(ctx, `${i + 1} ${pl.name}`, x + 4, y + 3, PAL.white);
    text(ctx, pl.kind === "run" ? "RUN" : "PASS", x + CW - 4 - textW(pl.kind === "run" ? "RUN" : "PASS"), y + 3, pl.kind === "run" ? PAL.gold : "#3cbcfc");
    drawDiagram(ctx, book[i], x + 3, y + 12, CW - 6, CH - 15, pl.kind === "run" ? PAL.gold : "#3cbcfc");
  }
  const k = kicksOpen(st);
  if (k.punt || k.fg) {
    for (const [i, label, ok] of [[KICK_PUNT, "PUNT", k.punt], [KICK_FG, `FIELD GOAL ${Math.round((o === 0 ? 100 - st.los : st.los) + 17)} YDS`, k.fg]]) {
      if (!ok) continue;
      const x = i === KICK_PUNT ? 8 : 132, y = 184;
      R(ctx, x, y, CW, 14, PAL.ink); text(ctx, label, x + (CW - textW(label)) / 2, y + 5, PAL.white);
    }
  }
  // the cursors: a frame each, gone once the side has chosen (keep your eyes on your own side)
  const frame = (i, col, inset) => {
    const [x, y, w, h] = i < 4 ? [...CARD[i], CW, CH] : [i === KICK_PUNT ? 8 : 132, 184, CW, 14];
    for (const [a, b2, ww, hh] of [[x + inset, y + inset, w - 2 * inset, 2], [x + inset, y + h - inset - 2, w - 2 * inset, 2], [x + inset, y + inset, 2, h - 2 * inset], [x + w - inset - 2, y + inset, 2, h - 2 * inset]]) R(ctx, a, b2, ww, hh, col);
  };
  for (let s = 0; s < 2; s++) {
    if (sides[s] !== "human") continue;
    const col = s === 0 ? PAL.red : PAL.blue;
    if (!c.lock[s]) { if (view.reduced || Math.floor(t * 3) % 3 !== 2) frame(c.cur[s], col, s === 0 ? 0 : 3); }
  }
  const status = [0, 1].map(s => `${who(s)} ${c.lock[s] ? "READY" : s === o ? "CALLING" : "GUESSING"}`).join("   ");
  text(ctx, status, (W - textW(status)) / 2, 203, PAL.white);
  const hint = st.down === 4 && sides[o] === "human" ? "D-PAD PICKS, A CALLS IT. DOWN FOR THE KICKS" : "D-PAD PICKS, A CALLS IT. DEFENCE: GUESS THE PLAY";
  text(ctx, hint, (W - textW(hint)) / 2, 212, PAL.grey);
}

// ---- the touchdown screen -------------------------------------------------------------------------------
function drawTd(ctx, st, view) {
  const { kits, names, reduced } = view, t = view.t || 0, td = st.td, f = st.pf;
  R(ctx, 0, 0, W, H, PAL.night);
  // the stadium: a ring of lights, the stands, the grass
  for (let i = 0; i < 8; i++) { R(ctx, 12 + i * 32, 18, 10, 4, PAL.white); R(ctx, 16 + i * 32, 22, 2, 20, PAL.grey); }
  R(ctx, 0, 120, W, 40, PAL.dark);
  for (let i = 0; i < 120; i++) R(ctx, (i * 37) % W, 124 + ((i * 13) % 32), 2, 2, PAL.crowd[(i * 3 + (reduced ? 0 : Math.floor(f / 8))) % PAL.crowd.length]);
  R(ctx, 0, 160, W, 64, PAL.grassA);
  for (let x = 0; x < W; x += 32) R(ctx, x, 160, 1, 64, PAL.white);
  // the fireworks (not with reduced motion)
  if (!reduced) for (let k = 0; k < 4; k++) {
    const ph = (f + k * 23) % 60, cx = 30 + k * 64 + ((k * 17) % 20), cy = 40 + ((k * 29) % 30), r = ph * 0.6;
    if (ph > 40) continue;
    for (let a = 0; a < 12; a++) { const dx = [1, 0.87, 0.5, 0, -0.5, -0.87, -1, -0.87, -0.5, 0, 0.5, 0.87][a], dy = [0, 0.5, 0.87, 1, 0.87, 0.5, 0, -0.5, -0.87, -1, -0.87, -0.5][a]; R(ctx, cx + dx * r, cy + dy * r, 2, 2, [PAL.gold, PAL.red, PAL.white, PAL.blue][(k + a) % 4]); }
  }
  // the scorer, big, helmet off, arms up
  const head = view.heads?.[td.key] || null;
  const bounce = reduced ? 0 : (Math.floor(f / 10) % 2) * -3;
  drawMan(ctx, 128, 196 + bounce, kits[td.t], 1, 0, "cheer", { k: 4, head, star: false });
  if (!head) { /* the helmet stays on: drawn by drawMan */ }
  const big = "TOUCHDOWN!";
  if (reduced || f % 20 < 16) centre(ctx, big, 54, PAL.gold, 3);
  centre(ctx, names[td.t] || "", 76, lum(kits[td.t][0]) > 70 ? kits[td.t][0] : kits[td.t][1], 2);
  const nm = fullName(td.name);
  centre(ctx, textW(nm, 2) <= 240 ? nm : lastName(td.name), 92, PAL.white, 2);
  const sc = `${names[0]} ${st.score[0]}  ${names[1]} ${st.score[1]}`;
  centre(ctx, sc, 212, PAL.white, 1);
  void t;
}
function drawQuarter(ctx, st, view) {
  const { kits, names } = view;
  R(ctx, 0, 0, W, H, PAL.sky);
  const q = st.qEnd?.q || st.q;
  const head = st.phase === "over" || q >= 4 ? "FINAL" : q === 2 ? "HALFTIME" : `END OF Q${q}`;
  centre(ctx, head, 40, PAL.gold, 3);
  for (let s = 0; s < 2; s++) {
    const y = 90 + s * 34;
    R(ctx, 40, y, 176, 26, kits[s][0]);
    text(ctx, names[s], 48, y + 9, ink(kits[s][0]), 2);
    const sc = String(st.score[s]);
    text(ctx, sc, 208 - textW(sc, 2), y + 9, ink(kits[s][0]), 2);
  }
  const s0 = st.stat;
  const line = (s) => `${names[s]}: RUSH ${s0[s].rush} PASS ${s0[s].pass} BROKEN ${s0[s].breaks} READS ${s0[s].reads}`;
  centre(ctx, line(0), 166, PAL.white); centre(ctx, line(1), 176, PAL.white);
  centre(ctx, "A TO GO ON", 204, PAL.grey);
}

// ---- the attract screen (the title, CPU v CPU behind the menu) -----------------------------------------------
export function drawAttract(ctx, st, cam, view) {
  draw(ctx, st, cam, view);
  if (st.phase === "call" || st.phase === "td" || st.phase === "quarter") return;
  ctx.fillStyle = "rgba(0,0,40,0.35)"; ctx.fillRect(0, 60, W, 56);
  centre(ctx, "FOURTH AND LONG", 68, PAL.gold, 3);
  if (view.reduced || Math.floor((view.t || 0) * 2) % 2 === 0) centre(ctx, "FREE PLAY // PRESS QUICK PLAY", 96, PAL.white, 1);
}
