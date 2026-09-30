// What a visit to #city downloads, before and after the sector split (scaling step 4,
// docs/CITY_SPEC.md "Sectors") and the sector sheets (step 5, "Sector sheets"). Not a
// check: a measurement, run by hand.
//
//   node scripts/bench-sectors.mjs --dist <built dist> [--label after] [--profile desktop|mobile|both] [--atlas none] [live|N ...]
//
// A local server serves the build and a stub API: /api/pen (the census: the live one for
// "live", else N clones of live records with new slugs), /api/plan and /api/find answered
// by the real functions over plans the real builder publishes into in-memory Blobs, the
// production atlas as prod-atlas.mjs packs this census (sector sheets and maps; every sheet
// is 64 live faces under its own hash, so image bytes are real), /api/sprite/<slug> (one
// live face), /api/social not ready. --atlas none serves an empty atlas: every face drawn
// asks for its own URL, so each step's `sprites` (in the result file) is who it drew. The browser is agent-browser's Chrome over DevTools, cache
// off, the page clock pinned to machine hour 18:15 (the evening commute).
// Desktop (1440x900): load #city, the fit view; zoom (ctrl+wheel) into the Arts district,
// back out, into the Sprawl. Bytes and requests are the transfer (compressed) after each
// step. Mobile (390x844 @3x, touch, 4x CPU throttle): time to first render only.
import http from "node:http";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = (k, o) => (s.has(k) ? (o?.type === "text" ? s.get(k).text : JSON.parse(s.get(k).text)) : null);
  return {
    async get(k, o) { return read(k, o); },
    async getWithMetadata(k, o) { return s.has(k) ? { data: read(k, o), etag: s.get(k).etag, metadata: {} } : null; },
    async getMetadata(k) { return s.has(k) ? { etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { text: JSON.stringify(v), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIM = await import("../src/city/sim.js");
const PL = await import("../netlify/lib/plans.js");
const planFn = (await import("../netlify/functions/plan.js")).default;
const findFn = (await import("../netlify/functions/find.js")).default;
const { fetchPen } = await import("../src/penClient.js");
const { readySprites, sectorsOf, assignSheets, packAtlas, SHEET_W } = await import("./prod-atlas.mjs");
const { decodePng, encodePng } = await import("./sprite-atlas.mjs");
const ISO = await import("../src/city/iso.js");
const { FAMOUS_FIGURES } = await import("../src/figures.js");

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIST = flag("--dist", join(ROOT, "dist"));
const LABEL = flag("--label", "build");
const PROFILE = flag("--profile", "both");
const Ns = args.filter((a, i) => (/^\d+$/.test(a) || a === "live") && !args[i - 1]?.startsWith("--"));
const CACHE = join(process.env.TMPDIR || "/tmp", "hvi-bench-sectors");
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- the census --------------------------------------------------------------------------
async function liveCensus() {
  const f = join(CACHE, "pen-live.json");
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const list = await fetchPen({ base: "https://humanvalueindex.com" });
  writeFileSync(f, JSON.stringify(list));
  return list;
}
function prng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// N - 62 census subjects cloned from live records (citizens 5%, capped at 200 like PEN_MAX).
async function censusOf(N) {
  const sample = await liveCensus();
  if (N === "live") return sample;
  const figs = sample.filter(s => s.kind === "figure"), cit = sample.filter(s => s.kind === "citizen");
  const R = prng(7), n = Math.max(0, N - FAMOUS_FIGURES.length), nCit = Math.min(200, Math.round(n * 0.05)), out = [];
  for (let i = 0; i < n; i++) {
    const citizen = i < nCit, t = citizen ? cit[i % cit.length] : figs[i % figs.length], s = structuredClone(t), tag = i.toString(36);
    if (citizen) { s.slug = `citizen-x${tag}`; s.name = `Subject X${tag.toUpperCase()}`; s.warmth = Math.round(R() * 100); s.competence = Math.round(R() * 100); }
    else {
      s.slug = `${t.slug}-x${tag}`; s.name = `${t.baseName || t.name} ${tag}`; s.baseName = s.name;
      if (s.breakdown) for (const k of Object.keys(s.breakdown)) s.breakdown[k] = Math.max(0, Math.min(100, s.breakdown[k] + Math.round((R() - 0.5) * 16)));
      if (typeof s.sprite === "string") s.sprite = s.sprite.replace(/\/api\/sprite\/[a-z0-9-]+/, `/api/sprite/${s.slug}`);
    }
    out.push(s);
  }
  return out;
}

// ---- the stub server ---------------------------------------------------------------------------
let current = null;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".ttf": "font/ttf" };
const SHEET = join(CACHE, "sheet.png");
if (!existsSync(SHEET)) {
  const a = await (await fetch("https://humanvalueindex.com/api/atlas.json")).json();
  writeFileSync(SHEET, Buffer.from(await (await fetch(`https://humanvalueindex.com/api/atlas/${a.sheets[0]}.png`)).arrayBuffer()));
}
// A production sheet is 8 x 8 faces (prod-atlas.mjs SHEET_CAP): the live sheet's first 64,
// so a stub sheet weighs what a real one does.
const sheetBuf = (() => {
  const big = decodePng(readFileSync(SHEET)), w = Math.min(SHEET_W, big.w), h = Math.min(384, big.h), px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) big.rgba.copy(px, y * w * 4, y * big.w * 4, (y * big.w + w) * 4);
  return encodePng(w, h, px);
})();
// --atlas none: an empty production atlas, so every drawn likeness asks for its own
// /api/sprite/<slug> and the request log names exactly who each step drew.
const ATLAS = flag("--atlas", "packed");
const ONE = join(CACHE, "sprite.png");
if (!existsSync(ONE)) writeFileSync(ONE, Buffer.from(await (await fetch("https://humanvalueindex.com/api/sprite/a-j-brown?v=1790589328")).arrayBuffer()));
const oneBuf = readFileSync(ONE);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname;
  const gz = /gzip/.test(req.headers["accept-encoding"] || "");
  const send = (status, body, type = "application/json") => {
    const buf = Buffer.from(body);
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...(gz ? { "Content-Encoding": "gzip" } : {}) });
    res.end(gz ? gzipSync(buf) : buf);
  };
  const viaFn = async (fn) => { const r = await fn(new Request("http://x" + req.url)); send(r.status, await r.text()); };
  try {
    if (p === "/api/pen") {
      // the old server sent everyone; the paged one (netlify/functions/pen.js) pages on request
      const q = url.searchParams, all = current.census;
      if (![...q.keys()].length) return send(200, JSON.stringify({ subjects: all }));
      let list = q.get("kind") ? all.filter(s => s.kind === q.get("kind")) : all;
      list = list.slice().sort((a, b) => (a.slug < b.slug ? -1 : 1));
      const cur = q.get("cursor"), i = cur ? list.findIndex(s => s.slug > cur) : 0, lim = Math.min(2000, Number(q.get("limit")) || 2000);
      const page = i < 0 ? [] : list.slice(i, i + lim);
      return send(200, JSON.stringify({ subjects: page, next: i >= 0 && i + lim < list.length ? page.at(-1).slug : null, total: list.length }));
    }
    if (p === "/api/plan" || p.startsWith("/api/plan/")) return viaFn(planFn);
    if (p === "/api/find") return viaFn(findFn);
    if (p === "/api/atlas.json") return send(200, current.atlas);
    if (p.startsWith("/api/atlas/") && p.endsWith(".json")) { const m = current.maps.get(p.slice(11, 27)); return m ? send(200, JSON.stringify(m)) : send(404, "{}"); }
    if (p.startsWith("/api/atlas/")) { res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }); return res.end(sheetBuf); }
    if (p.startsWith("/api/sprite/")) { res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }); return res.end(oneBuf); }
    if (p === "/api/social") return send(200, '{"ready":false}');
    if (p.startsWith("/api/")) return send(404, '{"error":"stub"}');
    let f = join(DIST, p);
    if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
    const type = TYPES[extname(f)] || "application/octet-stream";
    if (/^(text|application\/json)/.test(type)) return send(200, readFileSync(f), type);   // compressed, as Netlify serves it
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(readFileSync(f));
  } catch (err) { console.error(err); send(500, '{"error":"bench"}'); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// Pin every run to machine hour 18:15 of the day the plans are built for.
const PIN_HOUR = 18.25;
function pinDelta() {
  const mt = SIM.machineClock().mt;
  let want = Math.floor(mt / 24) * 24 + PIN_HOUR; if (want < mt) want += 24;
  return Math.round(((want - mt) * 3600000) / 60);
}
async function setup(N) {
  const census = await censusOf(N);
  globalThis.__blobs = new Map();
  PL.forgetManifest();
  const delta = pinDelta(), nowMs = Date.now() + delta;
  const io = PL.planIo(undefined, { census: async () => census, snapshots: async () => ({}) });
  delete io.lease;
  const t = performance.now();
  const r = await PL.buildPlans(nowMs, io, { lookahead: 1 });
  SIM.clearRoster(); SIM.clearPlans();
  // the production atlas as prod-atlas.mjs packs it (sector sheets, maps), every sheet the stub
  const figs = census.filter(s => s.kind === "figure"), want = readySprites(figs);
  const groups = assignSheets(want, null, sectorsOf(figs, want));
  const reuse = new Map(groups.map((g, gi) => [g.members.map(m => `${m}@${want.get(m)}`).join(","), {
    hash: createHash("sha1").update(`sheet${gi}`).digest("hex").slice(0, 16), sector: g.sector, bytes: sheetBuf.length,
    rects: Object.fromEntries(g.members.map((m, i) => [m, [want.get(m), gi, (i % 8) * 64, Math.floor(i / 8) * 48, 64, 48, 2]])) }]));
  const packed = await packAtlas(want, groups, async () => null, { reuse });
  const index = ATLAS === "none" ? { v: "none", count: 0, maps: {} } : { v: packed.json.v, count: packed.json.count, maps: packed.json.maps };
  current = { census, atlas: JSON.stringify(index), maps: packed.maps, sheets: packed.json.sheets.length, delta };
  // functions read Date.now: the stub serves the pinned day
  const real = Date.now.bind(Date);
  Date.now = () => real() + delta;
  return { n: census.length + FAMOUS_FIGURES.length, sheets: current.sheets, buildS: ((performance.now() - t) / 1000).toFixed(1), days: r.split.map(x => x.day), restore: () => { Date.now = real; } };
}

// ---- CDP ----------------------------------------------------------------------------------------
async function launch() {
  spawnSync("agent-browser", ["open", "about:blank"], { encoding: "utf8" });
  const wsUrl = spawnSync("agent-browser", ["get", "cdp-url"], { encoding: "utf8" }).stdout.trim();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map(), listeners = [];
  ws.addEventListener("message", ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } else for (const l of listeners) l(m); });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  return { send, on: (f) => listeners.push(f), close: () => { try { ws.close(); } catch { /* */ } spawnSync("agent-browser", ["close"]); } };
}
const PROBE = (N, delta) => `(() => {
  const __now = Date.now.bind(Date); Date.now = () => __now() + ${delta};
  try { localStorage.setItem("hvi-city-view-v3", "city"); } catch {}
  const A = window.__b = { popAt: null, takenAt: null };
  const mo = new MutationObserver(() => {
    const m = /POP (\\d+) \\/\\/ ABOARD (\\d+) \\/\\/ ON PLATFORMS (\\d+)/.exec(document.body?.innerText || "");
    if (!m) return;
    if (!A.popAt && m[1] === "${N}") { A.popAt = performance.now(); A.sig = m[2] + "/" + m[3]; }
    else if (A.popAt && !A.takenAt && m[2] + "/" + m[3] !== A.sig) A.takenAt = performance.now();
  });
  document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { childList: true, subtree: true, characterData: true }));
})();`;

async function visit(B, N, prof, delta) {
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => B.send(m, p, sessionId);
  const reqs = new Map();
  B.on(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Network.requestWillBeSent") reqs.set(m.params.requestId, { url: m.params.request.url.replace(ORIGIN, ""), bytes: 0, done: false });
    if (m.method === "Network.loadingFinished" && reqs.has(m.params.requestId)) Object.assign(reqs.get(m.params.requestId), { bytes: m.params.encodedDataLength, done: true });
  });
  await S("Network.enable"); await S("Page.enable"); await S("Runtime.enable");
  await S("Network.setCacheDisabled", { cacheDisabled: true });
  if (prof === "mobile") {
    await S("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await S("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await S("Emulation.setCPUThrottlingRate", { rate: 4 });
  } else await S("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await S("Page.addScriptToEvaluateOnNewDocument", { source: PROBE(N, delta) });
  const ev = async (e) => (await S("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  S("Page.navigate", { url: `${ORIGIN}/#city` }).catch(() => {});
  const t0 = Date.now();
  let fr = null;
  // First render: before the split the header shows POP N when the census lands and its
  // counts once the first census is taken (they change); after it, both come with the first
  // census (the summary), so POP N is the moment.
  const done = LABEL === "before" ? "window.__b.takenAt" : "window.__b.popAt";
  while (Date.now() - t0 < 120000) { await sleep(250); fr = await ev(`window.__b && ${done} ? JSON.stringify(window.__b) : null`).catch(() => null); if (fr) break; }
  fr = fr ? JSON.parse(fr) : {};
  const snap = (label) => {
    const list = [...reqs.values()];
    const cls = (u) => (/\/api\/(pen|plan|find|social)/.test(u) ? "data" : /\/api\/atlas|\/api\/sprite|\/sprites\/|\.png/.test(u) ? "img" : "app");
    const by = {};
    for (const r of list) { const c = cls(r.url); by[c] = by[c] || { n: 0, kb: 0 }; by[c].n++; by[c].kb += r.bytes / 1024; }
    return { label, requests: list.length, kb: Math.round(list.reduce((n, r) => n + r.bytes, 0) / 1024), by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, `${v.n} req ${Math.round(v.kb)} KB`])), sprites: list.filter(r => r.url.startsWith("/api/sprite/")).map(r => r.url.slice(12).replace(/\?.*$/, "")), sheets: list.filter(r => /^\/api\/atlas\/[0-9a-f]+\.png/.test(r.url)).map(r => r.url.slice(11, 27)), data: list.filter(r => cls(r.url) === "data").map(r => `${r.url.replace(/\?.*$/, "").replace(/\/api\/plan\/\d+\/[\d.a-f]+/, "/api/plan/D/V")} ${(r.bytes / 1024).toFixed(1)}`) };
  };
  const out = { firstRenderMs: Math.round((LABEL === "before" ? fr.takenAt : fr.popAt) ?? NaN), steps: [] };
  if (prof === "mobile") { await B.send("Target.closeTarget", { targetId }); return out; }
  await sleep(4000);
  out.steps.push(snap("fit"));
  // the ISO canvas, in view; district centres on screen from the camera the view fits
  await ev("document.querySelector('canvas.hvi-city-canvas')?.scrollIntoView({block: 'center'})");
  await sleep(500);
  const rect = JSON.parse(await ev("JSON.stringify((() => { const c = document.querySelector('canvas.hvi-city-canvas'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })())"));
  const e = ISO.cityExtent(0), z = Math.min(rect.w / (e.x1 - e.x0), rect.h / (e.y1 - e.y0)) * 0.96;
  const cam = { z, ox: rect.w / 2 - z * (e.x0 + e.x1) / 2, oy: rect.h / 2 - z * (e.y0 + e.y1) / 2, r: 0 };
  const at = (id) => { const d = SIM.DISTRICT[id].rect, [u, v] = ISO.rot(d.x + d.w / 2, d.y + d.h / 2, 0), [x, y] = ISO.project(u, v, 0, cam); return [rect.x + x, rect.y + y]; };
  const wheel = async ([x, y], dy, n) => { for (let i = 0; i < n; i++) { await S("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy, modifiers: 2 }); await sleep(120); } };
  const steps = 4;   // e^(0.45 * 4) = 6x the fit zoom: one district fills the view
  for (const id of ["arts", "sprawl"]) {
    const p = at(id);
    await wheel(p, -300, steps);
    await sleep(4000);
    out.steps.push(snap(`zoomed into ${id}`));
    await wheel(p, 300, steps);
    await sleep(1000);
  }
  await B.send("Target.closeTarget", { targetId });
  return out;
}

// --serve: build the first N's plans and keep serving (screenshots, poking by hand).
if (args.includes("--serve")) {
  const env = await setup(Ns[0] === "live" || !Ns[0] ? "live" : Number(Ns[0]));
  console.log(`serving ${LABEL} N=${env.n} at ${ORIGIN} (clock pinned to 18:15: ${current.delta} ms ahead)`);
  writeFileSync(join(CACHE, "serve.json"), JSON.stringify({ origin: ORIGIN, delta: current.delta }));
  await new Promise(() => {});
}
const B = await launch();
const rows = [];
try {
  for (const N of Ns.length ? Ns : ["live"]) {
    const env = await setup(N === "live" ? "live" : Number(N));
    console.log(`\n== ${LABEL} N=${env.n} (plans built and split in ${env.buildS} s, days ${env.days}; atlas ${env.sheets} sheets)`);
    for (const prof of PROFILE === "both" ? ["desktop", "mobile"] : [PROFILE]) {
      const r = await visit(B, env.n, prof, current.delta);
      console.log(`  ${prof}: first render ${r.firstRenderMs} ms`);
      for (const s of r.steps) console.log(`    ${s.label.padEnd(18)} ${String(s.requests).padStart(3)} requests ${String(s.kb).padStart(6)} KB  | ${Object.entries(s.by).map(([k, v]) => `${k} ${v}`).join(" | ")}\n      data: ${s.data.join(", ")}`);
      rows.push({ label: LABEL, n: env.n, prof, ...r });
    }
    env.restore();
  }
} finally { B.close(); server.close(); }
writeFileSync(join(CACHE, `result-${LABEL}.json`), JSON.stringify(rows, null, 1));
