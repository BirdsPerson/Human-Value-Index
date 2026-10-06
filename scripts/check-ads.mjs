// THE AD INVENTORY (src/ads/inventory.js, docs/design/ADS.md): one list of every ad slot, read by
// every surface that draws one. Headless.
//   slots      every id unique; every surface and creative known; a drawn slot has a size in its
//              surface's unit and an audience basis; AVAILABLE draws as "label" or "plain"
//   density    house ads at most HOUSE_CAP per venue; in the city one brand once; AVAILABLE outnumbers
//              the house in every game venue (the space is for sale, not for us)
//   play area  no drawn slot stands on the field of play: the soccer ring beyond the far touchline,
//              the Courts' apron beyond the sideline, the tennis walls behind the baseline and outside
//              the doubles alleys; slots along one side never overlap; the ring spans the widest
//              camera's view at either end of the pitch
//   wiring     the billboard slots are exactly the planner's sites (src/city/billboards.js), each the
//              same width; the games draw from the inventory (no hard-coded board text left)
//   copy       no board says anything but a brand's own words, the ground's name or AVAILABLE
import { readFileSync } from "node:fs";

const { SLOTS, SURFACES, CREATIVES, HOUSE_CAP, creativeOf } = await import("../src/ads/inventory.js");
let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.error("FAIL " + msg); } };

// ---- slots ----
const ids = new Set();
for (const s of SLOTS) {
  ok(!ids.has(s.id), `${s.id}: unique id`); ids.add(s.id);
  ok(Boolean(SURFACES[s.surface]), `${s.id}: surface ${s.surface} is known`);
  ok(Boolean(CREATIVES[s.creative]), `${s.id}: creative ${s.creative} is known`);
  ok(typeof s.audience?.basis === "string" && s.audience.basis.length > 3 && s.audience.measured === null, `${s.id}: audience has a basis, and nothing claims a measured number yet`);
  ok(typeof s.drawn === "boolean", `${s.id}: drawn is stated`);
  if (s.drawn) {
    ok(s.size && s.size.w > 0 && s.size.h > 0 && s.size.unit === SURFACES[s.surface].unit, `${s.id}: a drawn slot has a size in ${SURFACES[s.surface].unit}`);
    if (CREATIVES[s.creative]?.kind === "available") ok(["label", "plain"].includes(s.placeholder || "label"), `${s.id}: AVAILABLE draws as label or plain`);
  }
  if (s.host) ok(s.surface === "city-billboard" && CREATIVES[s.creative]?.kind === "house", `${s.id}: a host's face only on a house billboard`);
}
for (const [k, c] of Object.entries(CREATIVES)) {
  ok(["house", "venue", "available"].includes(c.kind), `creative ${k}: kind is house, venue or available`);
  if (c.kind === "house") ok(typeof c.mark === "string" && /^#[0-9a-f]{6}$/i.test(c.bg) && /^#[0-9a-f]{6}$/i.test(c.ink) && c.brand, `creative ${k}: a house ad has a mark, a ground, an ink and a brand name`);
  if (c.kind !== "house") ok(Array.isArray(c.lines) && c.lines.length > 0, `creative ${k}: lines to fit, longest first`);
}
ok(creativeOf({ creative: "nope" }).kind === "available" && creativeOf(null).kind === "available", "an unknown creative reads as AVAILABLE, never a blank");

// ---- density ----
const venues = [...new Set(SLOTS.filter(s => s.drawn).map(s => s.venue))];
for (const v of venues) {
  const drawn = SLOTS.filter(s => s.drawn && s.venue === v), house = drawn.filter(s => creativeOf(s).kind === "house"), avail = drawn.filter(s => creativeOf(s).kind === "available");
  ok(HOUSE_CAP[v] != null, `${v}: has a house-ad cap`);
  ok(house.length <= (HOUSE_CAP[v] ?? 0), `${v}: ${house.length} house ads, cap ${HOUSE_CAP[v]}`);
  if (v === "city") ok(new Set(house.map(s => creativeOf(s).brand)).size === house.length, "city: no brand on two billboards");
  else ok(avail.length > house.length, `${v}: more space for sale (${avail.length}) than house ads (${house.length})`);
}

// ---- play area ----
const { PITCH } = await import("../src/play/soccer/sim.js");
const { makeCam } = await import("../src/play/soccer/render.js");
const { COURT: HC } = await import("../src/play/hoops/sim.js");
const { COURT: TC } = await import("../src/play/tennis/sim.js");
const { ARENA } = await import("../src/play/tennis/render.js");
const along = (v, minY) => {
  const xs = SLOTS.filter(s => s.drawn && s.venue === v).sort((a, b) => a.at.x0 - b.at.x0);
  for (const s of xs) {
    ok(s.at && s.at.y > minY, `${s.id}: stands beyond the field of play (y ${s.at?.y} > ${minY})`);
    ok(Math.abs(s.at.x1 - s.at.x0 - s.size.w) < 1e-6, `${s.id}: its span equals its width`);
  }
  for (let i = 1; i < xs.length; i++) ok(xs[i].at.x0 >= xs[i - 1].at.x1, `${xs[i - 1].id} / ${xs[i].id}: do not overlap`);
  return xs;
};
const ring = along("soccer", PITCH.w);
// the widest view of the far touchline: the camera at its furthest along (camFollow's clamp)
for (const id of ["broadcast", "tele", "coop"]) {
  const c = makeCam(id), s0 = c.F / c.D, halfW0 = 160 / s0, camX = PITCH.hx + 4 - halfW0 * 0.7, far = 160 / (c.F / (PITCH.w + 3 + c.D));
  ok(ring[0].at.x0 <= -(camX + far) && ring.at(-1).at.x1 >= camX + far, `soccer ring covers the ${id} camera's view at either end (±${(camX + far).toFixed(1)} m)`);
}
const mid = ring.find(s => s.at.x0 <= 0 && s.at.x1 >= 0);
ok(mid && creativeOf(mid).kind === "venue", "the board on the halfway line carries the ground's name");
along("hoops", HC.w);
for (const s of SLOTS.filter(s => s.drawn && s.venue === "tennis")) {
  ok(s.at?.wall === "back" ? ARENA.backY < -TC.hl - 1 : s.at?.wall === "side" ? ARENA.sideX > TC.dhw + 1 : false, `${s.id}: on a wall clear of the court (behind the baseline / outside the alleys)`);
}
const back = SLOTS.filter(s => s.venue === "tennis" && s.at?.wall === "back");
ok(back.reduce((a, s) => a + s.size.w, 0) + 0.6 * (back.length - 1) <= 2 * ARENA.sideX, "tennis: the back boards fit the back wall");

// ---- wiring ----
const { BILLBOARD_SITES } = await import("../src/city/billboards.js");
const bbs = SLOTS.filter(s => s.surface === "city-billboard");
ok(bbs.length === BILLBOARD_SITES.length && BILLBOARD_SITES.every(b => bbs.some(s => s.id === b.id)), `the billboard slots are the planner's ${BILLBOARD_SITES.length} sites`);
for (const b of BILLBOARD_SITES) { const s = bbs.find(x => x.id === b.id); if (s) ok(Math.abs(s.size.w - b.w) < 1e-6 && Math.abs(s.size.h - (b.h1 - b.h0)) < 0.05, `${b.id}: the slot's size is the site's panel`); }
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
for (const p of ["src/city/billboardDraw.js", "src/play/soccer/render.js", "src/play/tennis/render.js", "src/play/hoops/render.js"]) {
  const src = read(p);
  ok(/ads\/inventory\.js/.test(src), `${p} reads the ad inventory`);
  ok(!/const BOARDS = \[/.test(src) && !/APPLAUSE IS MONITORED|YOUR SEAT IS ASSIGNED|OFFSIDE IS A STATE OF MIND|NO DUNKING ON STAFF/.test(src), `${p}: no hard-coded board slogans left`);
}
for (const p of ["src/play/soccer/render.js", "src/play/tennis/render.js", "src/play/hoops/render.js", "src/ads/boards.js", "src/ads/marks.js", "src/ads/inventory.js"]) {
  ok(!/from "\.\.\/(\.\.\/)?city\//.test(read(p)), `${p}: does not pull the city into a game's bundle`);
}

// ---- copy ----
for (const [k, c] of Object.entries(CREATIVES)) {
  const words = [c.line, c.board, c.title, ...(c.lines || [])].filter(Boolean).join(" ");
  ok(!/\b(BEST|#1|GUARANTEE|FREE|WIN|CASINO|BET)\b/i.test(words), `creative ${k}: no claims or gambling words`);
}

console.log(`check-ads: ${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
