// The shared animation rig (src/city/rig.js, rigReact.js). Pure node, no network.
//   node scripts/check-rig.mjs
// 1. the cut: every opaque pixel of every repo sprite, a sample of referral sprites
//    (scripts/fixtures/rig-referrals, plus the local referral cache when this machine has
//    one) and procedural citizens and stand-ins is in exactly one part
// 2. bounds: every frame of every animation stays inside the sprite's own box plus a margin
// 3. no detached limbs: a frame rarely has a piece the standing sprite does not
// 4. deterministic: the same pixels cut the same way and draw the same frames; timing is a
//    function of (t, phase); t = 0 (reduced motion) holds the key pose
// 5. the wiring: acts, reactions, score cheers, the Assembly crowd, the Dive at night
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { decodePng } from "./sprite-atlas.mjs";
import { makeRig, splitParts, partPixels, renderFrame, frameOf, layout, ANIMS, ANIM_NAMES, PART, RW, RH } from "../src/city/rig.js";
import { placeholderPixels, paletteFor, hashStr } from "../src/sprites.js";
import { avatarPixels, avatarPalette, AVATAR_ENUMS } from "../src/avatar.js";

const root = new URL("..", import.meta.url).pathname;
const MARGIN = { side: 22, top: 22, bottom: 2 };   // sprite px beyond the figure's own box

// ---- the sprites ---------------------------------------------------------------------------
const sprites = [];
const addDir = (dir, tag, limit = Infinity) => {
  if (!existsSync(dir)) return 0;
  const fs = readdirSync(dir).filter(f => f.endsWith(".png") && f !== "atlas.png").sort().slice(0, limit);
  for (const f of fs) { const p = decodePng(readFileSync(dir + f)); if (p.w >= RW && p.h === RH) sprites.push({ name: `${tag}/${f}`, rgba: p.rgba, w: p.w }); }
  return fs.length;
};
const repo = addDir(root + "public/sprites/", "repo");
assert.ok(repo >= 60, `repo sprites found: ${repo}`);
const fixtures = addDir(root + "scripts/fixtures/rig-referrals/", "referral");
assert.ok(fixtures >= 10, `referral fixtures found: ${fixtures}`);
const cache = addDir(homedir() + "/.cache/hvi-sprites/atlas-src/", "cache", 400);   // this machine only
// procedural: the stand-ins (paintPlaceholder) and citizens' file photos (paintAvatar), as pixels
const paint = (pix, pal) => { const rgba = new Uint8ClampedArray(RW * RH * 4); for (let i = 0; i < RW * RH; i++) { const c = pal[pix[i]]; if (!c) continue; rgba.set([c[0], c[1], c[2], 255], i * 4); } return rgba; };
for (let k = 0; k < 12; k++) {
  const seed = hashStr(`citizen-${k}`);
  sprites.push({ name: `placeholder/${k}`, rgba: paint(placeholderPixels(seed, 0), paletteFor("#4ade80", seed)), w: RW });
}
for (let k = 0; k < 12; k++) {
  const E = AVATAR_ENUMS, pick = (l, j) => (Array.isArray(l) ? l : Object.keys(l))[(hashStr(`av${k}|${j}`)) % (Array.isArray(l) ? l : Object.keys(l)).length];
  const spec = { skin: pick(E.skin, 1), hair_style: pick(E.hair_style, 2), hair_color: pick(E.hair_color, 3), build: pick(E.build, 4), top_color: pick(E.top_color || ["grey"], 5), bottom_color: pick(E.bottom_color || ["grey"], 6), facial_hair: pick(E.facial_hair, 7), accessory: pick(E.accessory, 8) };
  try { sprites.push({ name: `avatar/${k}`, rgba: paint(avatarPixels(spec, 0), avatarPalette(spec)), w: RW }); } catch { /* spec shape changed: skip */ }
}

// ---- 1. the cut -----------------------------------------------------------------------------
let opaque = 0, frames = 0, detached = 0, worst = { over: 0 };
const perAnim = {};
for (const s of sprites) {
  const sp = splitParts(s.rgba, s.w);
  let x0 = RW, y0 = RH, x1 = -1, y1 = -1;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const a = s.rgba[(y * s.w + x) * 4 + 3] > 0, l = sp.label[y * RW + x];
    assert.equal(Boolean(l), a, `${s.name} (${x},${y}): ${a ? "opaque pixel in no part" : "empty pixel in a part"}`);
    if (a) { opaque++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  // the parts' pixel lists partition the opaque pixels: each exactly once
  const seen = new Uint8Array(RW * RH);
  for (let p = 1; p <= 8; p++) for (const q of partPixels(sp, p)) { const i = q.y * RW + q.x; assert.equal(seen[i], 0, `${s.name}: (${q.x},${q.y}) in two parts`); seen[i] = 1; }
  for (let i = 0; i < RW * RH; i++) assert.equal(seen[i], sp.label[i] ? 1 : 0, `${s.name}: pixel ${i} covered ${seen[i]} times`);
  assert.ok(partPixels(sp, PART.head).length > 20, `${s.name}: a head`);
  assert.ok(partPixels(sp, PART.torso).length > 20, `${s.name}: a torso`);

  // ---- 2 + 3. every frame of every animation -----------------------------------------------
  const rig = makeRig(s.rgba, s.w);
  const base = pieces(renderFrame(rig, {}, false));
  for (const name of ANIM_NAMES) {
    const A = ANIMS[name];
    A.frames.forEach((f, k) => {
      frames++;
      const r = renderFrame(rig, f, Boolean(A.seat), 24, Boolean(A.clip), Boolean(A.front));
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.rgba[(y * r.w + x) * 4 + 3]) { bx0 = Math.min(bx0, x + r.x0); by0 = Math.min(by0, y + r.y0); bx1 = Math.max(bx1, x + r.x0 + 1); by1 = Math.max(by1, y + r.y0 + 1); }
      const over = Math.max(x0 - bx0 - MARGIN.side, bx1 - 1 - x1 - MARGIN.side, y0 - by0 - MARGIN.top, by1 - 1 - y1 - (A.seat ? RH : MARGIN.bottom));
      if (over > worst.over) worst = { over, where: `${s.name} ${name}#${k}` };
      assert.ok(over <= 0, `${s.name} ${name}#${k}: frame leaves the sprite's box + margin by ${over}px ([${bx0},${by0},${bx1},${by1}] vs [${x0},${y0},${x1},${y1}])`);
      assert.equal(r.lost, 0, `${s.name} ${name}#${k}: pixels outside the render pad`);
      if (pieces(r) > base) { detached++; perAnim[name] = (perAnim[name] || 0) + 1; }
    });
  }
}
// pieces of 6 px or more (8-connected): the standing sprite's own count is the baseline
function pieces(r) {
  const { w, h, rgba } = r, seen = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !rgba[i * 4 + 3]) continue;
    let size = 0; const st = [i]; seen[i] = 1;
    while (st.length) {
      const k = st.pop(); size++;
      const x = k % w, y = (k / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (!seen[j] && rgba[j * 4 + 3]) { seen[j] = 1; st.push(j); }
      }
    }
    if (size >= 6) n++;
  }
  return n;
}
const rate = detached / frames;
assert.ok(rate < 0.04, `detached pieces in ${(rate * 100).toFixed(1)}% of frames (limit 4%): ${JSON.stringify(perAnim)}`);

// ---- the animation table ------------------------------------------------------------------
const REQUIRED = ["idle", "wave", "clap", "cheer", "point", "talk", "dance", "dance2", "run", "jump", "shrug", "sittalk", "facepalm", "stumble", "swim", "ski", "snowboard", "golf", "deal", "chips", "arcade", "type", "sweep", "carry", "phone"];
for (const n of REQUIRED) assert.ok(ANIMS[n], `animation missing: ${n}`);
for (const [n, A] of Object.entries(ANIMS)) {
  assert.ok(A.frames.length >= 4 && A.frames.length <= 8, `${n}: 4 to 8 frames (${A.frames.length})`);
  assert.ok(A.fps > 0 && Number.isInteger(A.key) && A.key < A.frames.length, `${n}: fps and a key pose`);
  for (const f of A.frames) {
    for (const k of ["b", "t", "h"]) if (f[k]) assert.ok(f[k].every(Number.isInteger), `${n}: offsets are whole pixels`);
    // torso and head only ever move down relative to what they sit on: up would open a gap
    if (f.t) assert.ok(f.t[1] >= 0, `${n}: the torso never lifts off the legs`);
    if (f.h) assert.ok(f.h[1] >= 0, `${n}: the head never lifts off the neck`);
  }
}
const docs = readFileSync(root + "docs/CITY_SPEC.md", "utf8");
assert.match(docs, /## Animation rig/, "docs/CITY_SPEC.md documents the rig");
for (const n of ANIM_NAMES) assert.ok(docs.includes("`" + n + "`"), `docs/CITY_SPEC.md "Animation rig" lists ${n}`);

// ---- 4. deterministic ---------------------------------------------------------------------
{
  const s = sprites.find(x => x.name === "repo/albert-einstein.png") || sprites[0];
  const a = makeRig(s.rgba, s.w), b = makeRig(s.rgba, s.w);
  assert.deepEqual(a.sp.label, b.sp.label, "the same pixels cut the same way");
  for (const n of ANIM_NAMES) for (const f of ANIMS[n].frames) assert.deepEqual(renderFrame(a, f).rgba, renderFrame(b, f).rgba, `${n}: the same frame twice`);
  for (const n of ANIM_NAMES) {
    assert.equal(frameOf(n, 0, 0.3), ANIMS[n].frames[ANIMS[n].key], `${n}: reduced motion holds the key pose`);
    for (const t of [0.1, 1.7, 33.3]) assert.equal(frameOf(n, t, 0.42), frameOf(n, t, 0.42), `${n}: a frame is a function of t and phase`);
  }
  // phases spread a crowd: 20 subjects at one moment are not all on one frame
  const at = new Set(Array.from({ length: 20 }, (_, i) => ANIMS.clap.frames.indexOf(frameOf("clap", 5, i / 20))));
  assert.ok(at.size > 1, "a clapping crowd is out of step");
  // layout pixels are whole-pixel positions after rounding, and the arms join the shoulders at rest
  const L = layout(a.sp, {}, false);
  for (const p of L.parts) assert.equal(p.deg, 0, "the rest pose rotates nothing");
  assert.deepEqual(renderFrame(a, {}).rgba.filter((_, i) => i % 4 === 3).reduce((n, v) => n + (v ? 1 : 0), 0), a.sp.label.reduce((n, v) => n + (v ? 1 : 0), 0), "the rest pose draws exactly the sprite");
}

// ---- 5. the wiring --------------------------------------------------------------------------
const R = await import("../src/city/rigReact.js");
const P = await import("../src/city/props.js");
// acts that are animations name real ones
for (const [act, n] of Object.entries(R.RIG_ACTS)) assert.ok(ANIMS[n], `act ${act} -> ${n}`);
// reactions: on for their window, off after; never under reduced motion
{
  const sheet = {};
  R.react(sheet, "wave", 10, 2);
  assert.equal(R.reactionOf(sheet, 11)?.anim, "wave");
  assert.equal(R.reactionOf(sheet, 12.5), null);
  assert.equal(R.reactionOf(sheet, 0), null);
  const s2 = {}; R.react(s2, "wave", 0, 2); assert.equal(R.reactionOf(s2, 1), null, "t = 0 never reacts");
}
// friends meeting wave, once per meeting; rivals shrug / turn away
{
  R.setTies([["ann|bob", "friend"], ["cat|dan", "rival"]]);
  const mk = (slug) => ({ s: { slug, name: slug }, sheet: {} });
  const A = mk("ann"), B = mk("bob"), C = mk("cat"), D = mk("dan"), E = mk("eve");
  R.greet("room", [A, B, C, D, E], 100);
  assert.equal(R.reactionOf(A.sheet, 101)?.anim, "wave"); assert.equal(R.reactionOf(B.sheet, 101.5)?.anim, "wave");
  assert.equal(R.reactionOf(E.sheet, 101), null, "strangers do nothing");
  assert.ok(R.reactionOf(C.sheet, 101)?.anim === "shrug" || R.reactionOf(D.sheet, 101)?.turn, "rivals shrug and turn away");
  R.greet("room", [A, B], 105);
  assert.equal(R.reactionOf(A.sheet, 106), null, "still together: no second wave");
}
// the stands cheer a score, not the first sight of one
{
  const g = (a, b) => ({ day: 3, from: 18, score: [a, b] });
  assert.equal(R.scoreCheer("ball-field", g(1, 0), 50), false);
  assert.equal(R.scoreCheer("ball-field", g(1, 0), 51), false);
  assert.equal(R.scoreCheer("ball-field", g(2, 0), 52), true);
  assert.equal(R.scoreCheer("ball-field", g(2, 0), 55), true);
  assert.equal(R.scoreCheer("ball-field", g(2, 0), 57), false);
  assert.equal(R.scoreCheer("ball-field", g(3, 0), 0), false, "reduced motion: no cheer");
}
// the Assembly: a result in applauds in waves; long after, nothing
{
  const now = Date.UTC(2026, 8, 30, 12);
  const v = { session: { state: "closed", closeAt: now - 3600e3 }, result: { winner: "golf" } };
  const seen = new Set(); for (let t = 1; t < 12; t += 0.25) seen.add(R.assemblyCrowd(v, "view", t, 0.2, now));
  assert.ok(seen.has("clap") && seen.has(null), "applause comes in waves");
  assert.equal(R.assemblyCrowd(v, "cheer", 1, 0, now), "cheer");
  assert.equal(R.assemblyCrowd({ ...v, session: { ...v.session, closeAt: now - 72 * 3600e3 } }, "view", 1, 0, now), null);
  assert.equal(R.assemblyCrowd(v, "view", 0, 0, now), null, "reduced motion: still benches");
}
// the Dive after 23:00: every other stool dances; staff keep working; by day everyone drinks
{
  const stool = (i) => ({ kind: "seat", act: "drink", i });
  assert.ok(["dance", "dance2"].includes(P.actAt(stool(0), 23.5, "patron", "bar")));
  assert.equal(P.actAt(stool(1), 23.5, "patron", "bar"), "drink");
  assert.equal(P.actAt(stool(0), 20, "patron", "bar"), "drink");
  assert.equal(P.actAt(stool(0), 23.5, "staff", "bar"), "serve");
  assert.equal(P.actAt(stool(0), 1, "patron", "cafe"), "drink");
}

console.log(`rig: ${sprites.length} sprites (${repo} repo, ${fixtures} referral fixtures, ${cache} cached referrals, 24 procedural), ${opaque} pixels each in one part; ${frames} frames in bounds (worst ${worst.over}px), ${(rate * 100).toFixed(1)}% with a detached piece`);
