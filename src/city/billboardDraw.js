// THE BILLBOARDS, drawn: the planner's reserved sites (billboards.js, MASTER_PLAN.md "Billboard
// sites") carrying Scott's own brands in their real marks (brand.js, public/brand/atlas.png) and
// the EBSN hosts' own faces (public/funnels/hosts.png): EBTV, the EB Shop and EBSN After Dark
// with a host each, JETSAM! as AN IRIDESCENT PRODUCTION, Goodnight Irene's on the boardwalk,
// Beacon over Finance, Brainforest over HQ's plaza. Render only: no plan, id or sim changes, no
// tap (the utm links are a later pass). A panel is floodlit at night, steady.
//
//   billboardItems(r)            the sites as draw items for one quarter turn: {kind: "bb", ...box}
//   drawBillboard(G, it, env)    G: CityIso's arch context {ctx, Q, poly, facing, z, r}
import { BILLBOARD_SITES, billboardBox } from "./billboards.js";
import { BUILDING } from "./simApi.js";
import { massingOf } from "./archGeo.js";
import { rotRect, STOREY } from "./iso.js";
import { drawBrand, brandReady } from "./brand.js";
import { SLOTS, SLOT, creativeOf } from "../ads/inventory.js";

// What each site carries: the ad inventory's city-billboard slots (src/ads/inventory.js), where
// the creatives live too, one table for every surface that sells space. A house ad (Scott's brands,
// one brand once), or THIS SPACE AVAILABLE with the site's number. host: an EBSN host's face
// (hosts.png order: carol dale asuka hector joan vern).
export const BILLBOARD_ADS = Object.fromEntries(SLOTS.filter(s => s.surface === "city-billboard").map(s => [s.id, { ad: s.creative, ...(s.host ? { host: s.host } : {}) }]));
const SITE_NO = Object.fromEntries(SLOTS.filter(s => s.surface === "city-billboard").map((s, i) => [s.id, String(i + 1).padStart(2, "0")]));
const HOST_IDX = { carol: 0, dale: 1, asuka: 2, hector: 3, joan: 4, vern: 5 };
const NORMAL = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

let FACES = null;
function faces() {
  if (FACES || typeof Image === "undefined") return FACES;
  FACES = new Image(); FACES.src = "/funnels/hosts.png";
  return FACES;
}

// The base a site's legs stand on: its host's roof, else the ground.
function baseOf(b) {
  if (b.kind !== "rooftop") return 0;
  const m = massingOf(BUILDING[b.host]), x = billboardBox(b);
  const under = m?.parts.find(p => p.x0 < x.x1 && x.x0 < p.x1 && p.y0 < x.y1 && x.y0 < p.y1);
  return under ? under.h1 : b.h0 - 0.5;
}

export function billboardItems(r) {
  return BILLBOARD_SITES.map(b => {
    const x = billboardBox(b), R = rotRect({ x: x.x0, y: x.y0, w: x.x1 - x.x0, h: x.y1 - x.y0 }, r);
    return { kind: "bb", id: b.id, site: b, box: x, base: baseOf(b), host: b.kind === "rooftop" ? b.host : null, top: b.kind === "rooftop" ? b.h0 : 0, R, x0: R.x0, y0: R.y0, x1: R.x1, y1: R.y1 };
  });
}

// One face of the panel box: the edge a -> b (map), as archDraw's facesOf lays it.
function edge(x, s) {
  return s === "s" ? [[x.x0, x.y1], [x.x1, x.y1]] : s === "e" ? [[x.x1, x.y1], [x.x1, x.y0]] : s === "n" ? [[x.x1, x.y0], [x.x0, x.y0]] : [[x.x0, x.y0], [x.x0, x.y1]];
}

export function drawBillboard(G, it, env) {
  const { ctx, Q, poly, facing } = G, b = it.site, x = it.box, far = env.lod === "far";
  const nf = env.night ? 0.6 : 1, z = G.z;
  const [sx, sy] = Q(b.x, b.y, b.h1);
  if (sx < -z * 6 || sx > ctx.canvas.width + z * 6 || sy < -z * 8 || sy > ctx.canvas.height + z * 12) return;
  const n = NORMAL[b.facing], along = b.facing === "n" || b.facing === "s";
  // the legs: two steel posts under the panel, down to the roof or the ground
  const col = env.night ? "#3a3a40" : "#6b7280", lw = Math.max(1, z * 0.07);
  for (const t of [0.22, 0.78]) {
    const px = along ? x.x0 + (x.x1 - x.x0) * t : (x.x0 + x.x1) / 2, py = along ? (x.y0 + x.y1) / 2 : x.y0 + (x.y1 - x.y0) * t;
    const A = Q(px - n[0] * 0.02, py - n[1] * 0.02, it.base), B = Q(px - n[0] * 0.02, py - n[1] * 0.02, x.h0);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  }
  const slot = SLOT[b.id], ad = creativeOf(slot), spec = { ...(BILLBOARD_ADS[b.id] || {}), site: SITE_NO[b.id] };
  const c = [(x.x0 + x.x1) / 2, (x.y0 + x.y1) / 2];
  // the box: its frame on every face the camera sees; the ad on the front
  let front = null;
  for (const s of ["s", "e", "n", "w"]) {
    const [a, e] = edge(x, s), sh = facing(a, e, c);
    if (!sh) continue;
    const q = [Q(a[0], a[1], x.h1), Q(e[0], e[1], x.h1), Q(e[0], e[1], x.h0), Q(a[0], a[1], x.h0)];
    if (s === b.facing) { front = { a, e, sh }; poly(q, ad.frame || "#111318"); }
    else poly(q, shadeHex(env.night ? "#2a2c32" : "#8a8f98", sh * nf));
  }
  // the top edge (seen from above)
  poly([Q(x.x0, x.y0, x.h1), Q(x.x1, x.y0, x.h1), Q(x.x1, x.y1, x.h1), Q(x.x0, x.y1, x.h1)], env.night ? "#22242a" : "#a3a8b0");
  if (!front || far) return;
  // the face's frame of reference, inset by the frame
  const ins = 0.06, k = 0.04;
  const F = (t, h) => Q(front.a[0] + (front.e[0] - front.a[0]) * t + n[0] * 0.005, front.a[1] + (front.e[1] - front.a[1]) * t + n[1] * 0.005, h);
  const A = F(k, x.h1 - ins), B = F(1 - k, x.h1 - ins), C = F(k, x.h0 + ins);
  const W = Math.hypot(B[0] - A[0], B[1] - A[1]), H = Math.hypot(C[0] - A[0], C[1] - A[1]);
  if (W < 6 || H < 4) return;
  ctx.save();
  ctx.transform((B[0] - A[0]) / W, (B[1] - A[1]) / W, (C[0] - A[0]) / H, (C[1] - A[1]) / H, A[0], A[1]);
  ctx.fillStyle = ad.bg; ctx.fillRect(0, 0, W, H);
  if (ad.kind === "available") available(ctx, ad, spec, W, H);
  else if (brandReady()) adContent(ctx, ad, spec, W, H, env);
  // daylight sits on it; at night the floodlights keep it bright (no flicker)
  if (!env.night) { ctx.fillStyle = `rgba(255,255,255,${(0.08 * (1 - front.sh)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  if (env.night) {
    // the floodlight's pool on the face, from the lamp arm on the top edge
    const [lx, ly] = F(0.5, (x.h0 + x.h1) / 2), g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(255,240,210,0.10)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, Math.max(W, H) * 0.7, 0, Math.PI * 2); ctx.fill();
  }
}

// The ad in panel space (W x H px): a host's face on the left when the ad has one, the mark
// filling the rest, its line under it when there is room to read it.
function adContent(c, ad, spec, W, H, env) {
  const pad = Math.max(1, Math.round(H * 0.08));
  let x0 = pad;
  const img = spec.host ? faces() : null;
  if (img && img.complete && img.naturalWidth) {
    // the host's face: a third of the panel at most, so the mark keeps the rest
    const fw = Math.round(Math.min(W * 0.34, (H - 2 * pad) * 20 / 22)), fh = Math.round(fw * 22 / 20);
    c.imageSmoothingEnabled = false;
    for (const [i, h] of [spec.host, spec.host2].filter(Boolean).entries()) {
      const fy = Math.round((H - fh) / 2);
      c.fillStyle = "#000"; c.fillRect(x0 + i * (fw + 1) - 1, fy - 1, fw + 2, fh + 2);
      c.drawImage(img, HOST_IDX[h] * 40 + 10, 1, 20, 22, x0 + i * (fw + 1), fy, fw, fh);
    }
    x0 += (spec.host2 ? 2 : 1) * (fw + 1) + pad;
  }
  const textPx = Math.round(H * 0.13), hasLine = ad.line && textPx >= 5;
  const mh = H - 2 * pad - (hasLine ? textPx + pad : 0);
  const cx = (x0 + W - pad) / 2;
  let r = null;
  if (ad.title && textPx >= 5) {
    // a mark beside a set title (EBSN, BRAINFOREST): the mark left, the letters right
    r = drawBrand(c, ad.mark, x0, pad + mh / 2, mh, { align: "left", neon: ad.neon && env.night, maxW: (W - x0 - pad) * 0.4 });
    const tx = r ? r.x + r.w + pad : x0;
    c.font = `${ad.serif ? "700 " : "bold "}${Math.round(mh * 0.42)}px ${ad.serif ? "'PT Serif', Georgia, serif" : "'Fira Mono', ui-monospace, monospace"}`;
    c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = ad.ink; c.fillText(ad.title, tx, pad + mh / 2, W - tx - pad);
  } else {
    r = drawBrand(c, ad.mark, cx, pad + mh / 2, mh, { neon: ad.neon && env.night, maxW: W - x0 - pad });
  }
  if (hasLine) {
    const ly = H - pad - textPx / 2;
    let lx = cx;
    if (ad.sub) { const s = drawBrand(c, ad.sub, x0, ly, textPx, { align: "left" }); if (s) lx = (s.x + s.w + W - pad) / 2; }
    else if (spec.host) lx = (x0 + W - pad) / 2;
    c.font = `${ad.serif ? "400 " : "bold "}${textPx}px ${ad.serif ? "'PT Serif', Georgia, serif" : "'Fira Mono', ui-monospace, monospace"}`;
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = ad.ink;
    c.fillText(ad.line, lx, ly, W - x0 - pad);
  }
}

// THIS SPACE AVAILABLE: a quiet panel, a hairline inset, the words as large as fit, the site's
// number under them (the way an outdoor company numbers its boards).
function available(c, ad, spec, W, H) {
  const pad = Math.max(1, Math.round(H * 0.1));
  c.strokeStyle = ad.ink; c.globalAlpha = 0.5; c.lineWidth = 1;
  c.strokeRect(pad + 0.5, pad + 0.5, W - 2 * pad - 1, H - 2 * pad - 1);
  c.globalAlpha = 1;
  const big = Math.round(H * 0.2), small = Math.round(H * 0.11);
  if (big < 5) return;
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = ad.ink;
  c.font = `bold ${big}px 'Fira Mono', ui-monospace, monospace`;
  c.fillText("THIS SPACE", W / 2, H * 0.36, W - 4 * pad);
  c.fillText("AVAILABLE", W / 2, H * 0.58, W - 4 * pad);
  if (small >= 5) { c.font = `${small}px 'Fira Mono', ui-monospace, monospace`; c.globalAlpha = 0.7; c.fillText(`SITE ${spec.site}`, W / 2, H * 0.8, W - 4 * pad); c.globalAlpha = 1; }
}

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16), k = Math.max(0, Math.min(1.6, f));
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
