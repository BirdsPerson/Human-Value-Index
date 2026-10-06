// EMERGENCE drawn (src/city/emergence.js): delivery drones, helicopters and the rooftop helipads, in
// the iso view's sky pass (CityIso, after THE AIRPORT's aircraft). Cheap: a few filled polygons per
// craft, each with its shadow on the ground. Reduced motion: still rotors, no blinking lights.
// G: {ctx, Q, z}; a pose: {x, y, alt, hx, hy} (map cells, the iso's storeys).

const shadowA = (alt) => Math.max(0.1, 0.32 - alt * 0.012);

// A quadcopter: a small dark cross, four rotor discs, a parcel slung under; its shadow below.
export function drawDrone(G, p, lod, night, t) {
  const { ctx, Q } = G, z = G.z;
  if (lod === "far" && z < 3) {   // the overview: a dot and its shadow
    const s = Q(p.x, p.y, 0.02), a = Q(p.x, p.y, p.alt);
    ctx.globalAlpha = shadowA(p.alt); ctx.fillStyle = "#000"; ctx.fillRect(Math.round(s[0]) - 1, Math.round(s[1]), 2, 1); ctx.globalAlpha = 1;
    ctx.fillStyle = night ? "#e5e7eb" : "#111827"; ctx.fillRect(Math.round(a[0]) - 1, Math.round(a[1]) - 1, 2, 2);
    return;
  }
  const r = 0.62, arm = 0.52;   // a touch over life size, so a phone can see it
  const fx = p.hx, fy = p.hy, sx = -fy, sy = fx;
  const P = (a, s, h) => Q(p.x + fx * a + sx * s, p.y + fy * a + sy * s, h);
  // the shadow
  ctx.globalAlpha = shadowA(p.alt); ctx.fillStyle = "#000";
  const c0 = Q(p.x, p.y, 0.02); ctx.beginPath(); ctx.ellipse(c0[0], c0[1], z * 0.7, z * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const h = p.alt;
  // the parcel, under the body
  const pk = Q(p.x, p.y, h - 0.25); ctx.fillStyle = "#b45309"; ctx.fillRect(Math.round(pk[0] - z * 0.2), Math.round(pk[1] - z * 0.14), Math.max(2, Math.round(z * 0.4)), Math.max(2, Math.round(z * 0.28)));
  // the arms
  ctx.strokeStyle = night ? "#9ca3af" : "#1f2937"; ctx.lineWidth = Math.max(1, z * 0.07);
  ctx.beginPath();
  for (const [a, s] of [[arm, arm], [-arm, -arm], [arm, -arm], [-arm, arm]]) { const c = P(0, 0, h), e = P(a, s, h); ctx.moveTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); }
  ctx.stroke();
  // the rotors: discs, a spinning blade where there is room
  for (const [a, s] of [[arm, arm], [-arm, -arm], [arm, -arm], [-arm, arm]]) {
    const c = P(a, s, h + 0.05);
    ctx.fillStyle = night ? "rgba(229,231,235,0.35)" : "rgba(17,24,39,0.28)";
    ctx.beginPath(); ctx.ellipse(c[0], c[1], z * r * 0.55, z * r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    if (z >= 6) { const ang = t * 40 + a * 3; ctx.strokeStyle = night ? "#e5e7eb" : "#374151"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c[0] - Math.cos(ang) * z * r * 0.5, c[1] - Math.sin(ang) * z * r * 0.25); ctx.lineTo(c[0] + Math.cos(ang) * z * r * 0.5, c[1] + Math.sin(ang) * z * r * 0.25); ctx.stroke(); }
  }
  // the body
  const b = Q(p.x, p.y, h + 0.08); ctx.fillStyle = night ? "#d1d5db" : "#0f172a"; ctx.fillRect(Math.round(b[0] - z * 0.18), Math.round(b[1] - z * 0.12), Math.max(2, Math.round(z * 0.36)), Math.max(2, Math.round(z * 0.24)));
  // the nav light (steady: the Department does not strobe)
  if (night) { ctx.fillStyle = "#22c55e"; ctx.fillRect(Math.round(b[0]) - 1, Math.round(b[1]) - 2, 2, 2); }
}

// A light helicopter: a rounded cabin, a tail boom with its rotor, skids, the main rotor disc.
export function drawHeli(G, p, lod, night, t, still) {
  const { ctx, Q } = G, z = G.z;
  const fx = p.hx, fy = p.hy, sx = -fy, sy = fx;
  const P = (a, s, h) => Q(p.x + fx * a + sx * s, p.y + fy * a + sy * s, h);
  const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
  const h = p.alt + 0.3;
  // the shadow: the cabin and the boom on the ground
  ctx.globalAlpha = shadowA(p.alt);
  poly([P(1.0, 0, 0.02), P(0.2, 0.5, 0.02), P(-2.6, 0.08, 0.02), P(-2.6, -0.08, 0.02), P(0.2, -0.5, 0.02)], "#000");
  ctx.globalAlpha = 1;
  const body = night ? "#4b5563" : "#111827", trim = "#ca8a04", glass = night ? "#fde68a" : "#60a5fa";
  // the skids
  if (lod !== "far") { ctx.strokeStyle = night ? "#6b7280" : "#374151"; ctx.lineWidth = Math.max(1, z * 0.06); ctx.beginPath(); for (const s of [0.45, -0.45]) { const a = P(0.9, s, h - 0.35), b = P(-0.7, s, h - 0.35); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke(); }
  // the tail boom and its fin
  poly([P(-0.5, 0.1, h + 0.35), P(-2.6, 0.05, h + 0.45), P(-2.6, -0.05, h + 0.45), P(-0.5, -0.1, h + 0.35)], body);
  poly([P(-2.3, 0, h + 0.45), P(-2.7, 0, h + 1.05), P(-2.85, 0, h + 1.05), P(-2.65, 0, h + 0.45)], trim);
  // the cabin: sides, then the top, then the glass to the front
  poly([P(1.0, 0, h + 0.2), P(0.5, 0.48, h + 0.75), P(-0.7, 0.42, h + 0.75), P(-0.7, 0.42, h), P(0.5, 0.48, h)], body);
  poly([P(1.0, 0, h + 0.2), P(0.5, -0.48, h + 0.75), P(-0.7, -0.42, h + 0.75), P(-0.7, -0.42, h), P(0.5, -0.48, h)], body);
  poly([P(0.5, 0.48, h + 0.8), P(-0.7, 0.42, h + 0.8), P(-0.8, 0, h + 0.85), P(-0.7, -0.42, h + 0.8), P(0.5, -0.48, h + 0.8), P(0.95, 0, h + 0.5)], night ? "#6b7280" : "#1f2937");
  poly([P(1.02, 0, h + 0.25), P(0.6, 0.42, h + 0.7), P(0.6, -0.42, h + 0.7)], glass);
  // the main rotor: a translucent disc; two blades turning (still under reduced motion)
  const m = P(0, 0, h + 1.0);
  ctx.fillStyle = night ? "rgba(229,231,235,0.12)" : "rgba(15,23,42,0.12)";
  ctx.beginPath(); ctx.ellipse(m[0], m[1], z * 1.9, z * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  const ang = still ? 0.6 : t * 22;
  ctx.strokeStyle = night ? "#d1d5db" : "#0f172a"; ctx.lineWidth = Math.max(1, z * 0.08);
  ctx.beginPath();
  for (const k of [0, Math.PI / 2]) { const c = Math.cos(ang + k), s = Math.sin(ang + k); ctx.moveTo(m[0] - c * z * 1.9, m[1] - s * z * 0.95); ctx.lineTo(m[0] + c * z * 1.9, m[1] + s * z * 0.95); }
  ctx.stroke();
  // the beacon: red, steady under reduced motion, a slow blink otherwise (never a strobe)
  const on = still || Math.floor(t * 1.2) % 2 === 0;
  const bc = P(0, 0, h + 0.9); ctx.fillStyle = on ? "#ef4444" : "#7f1d1d"; ctx.fillRect(Math.round(bc[0]) - 1, Math.round(bc[1]) - 1, 2, 2);
}

// A helipad on a roof: a pale circle, a yellow ring, the H; corner lights at night.
export function drawPad(G, pad, lod, night) {
  const { ctx, Q } = G, z = G.z, R = 1.05, h = pad.h + 0.03;
  const ring = (rad, fill, stroke) => {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, q = Q(pad.x + Math.cos(a) * rad, pad.y + Math.sin(a) * rad, h); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, z * 0.1); ctx.stroke(); }
  };
  ring(R, night ? "#1f2937" : "#374151", "#eab308");
  if (lod === "far" && z < 3) return;
  // the H, laid on the roof
  ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = Math.max(1, z * 0.11);
  const L = (a, b) => { const p = Q(pad.x + a[0], pad.y + a[1], h), q = Q(pad.x + b[0], pad.y + b[1], h); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
  ctx.beginPath(); L([-0.35, -0.45], [-0.35, 0.45]); L([0.35, -0.45], [0.35, 0.45]); L([-0.35, 0], [0.35, 0]); ctx.stroke();
  if (night) for (const [a, b] of [[R, 0], [-R, 0], [0, R], [0, -R]]) { const p = Q(pad.x + a, pad.y + b, h); ctx.fillStyle = "#facc15"; ctx.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 1, 2, 2); }
}

// The drone depot's roof: three drones parked on the Parts Depot while the industry is open.
export function drawDepot(G, depot, lod, night) {
  if (lod === "far") return;
  for (const [dx, dy] of [[-1.2, -0.4], [0, 0.3], [1.2, -0.4]]) drawDrone(G, { x: depot.x + dx, y: depot.y + dy, alt: depot.h + 0.1, hx: 1, hy: 0 }, lod, night, 0);
}

// The whole pass: pads (open heli), the parked drones (open drones), then what is flying.
export function drawAir(G, lod, night, t, still, { air, today, pads, depot }) {
  for (const pad of pads) drawPad(G, pad, lod, night);
  if (today?.ind?.drones?.s === "open" && depot) drawDepot(G, depot, lod, night);
  if (!air) return;
  for (const p of air.drones) drawDrone(G, p, lod, night, still ? 0 : t);
  for (const p of air.helis) drawHeli(G, p, lod, night, t, still);
}
