// The rig lab (?rig=1): six figures doing every animation of the shared rig (rig.js), so the
// cut and the moves can be looked at. Not linked from anywhere; a dev and QA page.
//   ?rig=1                 live, every animation, both facings
//   &figs=a,b,c            which repo sprites (slugs)
//   &t=1.3                 freeze the clock at t seconds (screenshots)
//   &frames=1              every frame of every animation side by side, frozen
//   &parts=1               each figure's cut, coloured by part
//   &perf=420              that many figures, every one animating; window.__rigPerf = ms per frame
//   &room=dive-bar&hour=23.5  a real room (props.drawRoom + poses.drawPose, the city's own path)
//                          full of the figures; the first two are friends and wave on meeting
import { useEffect, useRef } from "react";
import { loadRepoSprite, SPRITE_W, SPRITE_H } from "../sprites.js";
import { ANIMS, ANIM_NAMES, drawRig, rigFor, PART } from "./rig.js";
import { drawRoom, roomPlan, actAt, typeOf } from "./props.js";
import { drawPose, phaseOf } from "./poses.js";
import { greet, setTies } from "./rigReact.js";

const DEFAULT = ["albert-einstein", "marie-curie", "muhammad-ali", "taylor-swift", "mahatma-gandhi", "scott"];
const PART_COL = { [PART.head]: "#f0c83c", [PART.torso]: "#3ca0f0", [PART.uaL]: "#f05050", [PART.faL]: "#ffa0a0", [PART.uaR]: "#50dc50", [PART.faR]: "#aaffaa", [PART.legL]: "#b45af0", [PART.legR]: "#dcaaff" };

export default function RigLab() {
  const q = new URLSearchParams(window.location.search);
  const figs = (q.get("figs") || DEFAULT.join(",")).split(",").filter(Boolean).slice(0, 12);
  const freeze = q.has("t") ? Number(q.get("t")) : null;
  const frames = q.get("frames") === "1", parts = q.get("parts") === "1";
  const ref = useRef(null);
  useEffect(() => {
    let off = false, raf = 0;
    const cv = ref.current, ctx = cv.getContext("2d");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    Promise.all(figs.map(s => loadRepoSprite(s))).then(imgs => {
      if (off) return;
      const sheets = imgs.map(img => img && { img, frames: 2 }).filter(Boolean);
      const room = q.get("room");
      if (room) {
        const hour = Number(q.get("hour") ?? 23.5);
        const people = sheets.map((sh, i) => ({ s: { slug: figs[i], name: figs[i] }, sheet: sh }));
        if (people.length > 1) setTies([[[people[0].s.slug, people[1].s.slug].sort().join("|"), "friend"]]);
        const t0 = performance.now() / 1000;
        const run = () => {
          const W = cv.parentElement.clientWidth, dpr = window.devicePixelRatio || 1;
          const rw = Math.min(W - 16, 900), rh = Math.round(rw * 0.3), H = rh + 16;
          if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = "#0a0f0a"; ctx.fillRect(0, 0, W, H);
          const hh = Math.min(64, Math.round(rh * 0.42)), sw = hh * (SPRITE_W / SPRITE_H);
          const plan = roomPlan(typeOf(room), rw, rh, sw);
          const t = freeze != null ? freeze : reduced ? 0 : performance.now() / 1000;
          // everyone arrives two seconds in: friends meeting wave
          const here = t - t0 > 2 || freeze != null ? people : people.slice(0, 1);
          greet(room, here, t);
          drawRoom(ctx, room, 8, 8, rw, rh, Math.max(1, Math.round(rh / 40)), {
            t, hour, plan, people: (row) => {
              for (const it of row.items) {
                const a = it.a, p = a && here[a.i];
                if (!p) continue;
                drawPose(ctx, p.sheet, a, actAt(a, hour, a.role === "staff" ? "staff" : "patron", plan.type), 8 + a.x, 8 + a.y, hh * a.s, t, phaseOf(p.s.name), 1);
              }
            },
          });
          if (freeze == null && !off) raf = requestAnimationFrame(run);
        };
        run();
        window.__rigReady = true;
        return;
      }
      const perf = Number(q.get("perf")) || 0;
      if (perf) {
        const stats = { n: 0, sum: 0, max: 0 };
        window.__rigPerf = stats;
        const run = () => {
          const W = cv.parentElement.clientWidth, H = window.innerHeight - 40, dpr = window.devicePixelRatio || 1;
          if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
          const t0 = performance.now();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = "#0a0f0a"; ctx.fillRect(0, 0, W, H);
          const cols = Math.ceil(Math.sqrt(perf * W / H)), rows = Math.ceil(perf / cols), cw = W / cols, ch = H / rows, S = Math.max(0.5, Math.min(cw / 34, ch / 50));
          const t = performance.now() / 1000;
          for (let i = 0; i < perf; i++) drawRig(ctx, sheets[i % sheets.length], ANIM_NAMES[i % ANIM_NAMES.length], t, (i % cols + 0.5) * cw, (Math.floor(i / cols) + 1) * ch - 2, S, i % 2 ? 1 : -1, { ph: (i * 0.618) % 1 });
          const ms = performance.now() - t0;
          stats.n++; stats.sum += ms; stats.max = Math.max(stats.max, stats.n > 10 ? ms : 0); stats.avg = stats.sum / stats.n;
          if (!off) raf = requestAnimationFrame(run);
        };
        run();
        window.__rigReady = true;
        return;
      }
      const draw = () => {
        const W = cv.parentElement.clientWidth, narrow = W < 700;
        const S = narrow ? 2 : 3, cw = (SPRITE_W + 14) * S, ch = (SPRITE_H + 20) * S, head = 18;
        const fit = Math.max(1, Math.floor((W - 8) / cw));
        const perRow = narrow ? 3 : fit >= sheets.length * 2 ? sheets.length * 2 : fit >= sheets.length ? sheets.length : fit;
        const list = frames ? ANIM_NAMES.flatMap(a => ANIMS[a].frames.map((_, k) => [a, k])) : ANIM_NAMES.map(a => [a, null]);
        const blocks = parts ? 1 + list.length : list.length;
        const cellsPer = frames ? sheets.length : sheets.length * 2;   // live: both facings
        const rowsPer = Math.ceil(cellsPer / perRow);
        const H = blocks * (head + rowsPer * ch) + 8;
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#0a0f0a"; ctx.fillRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = false;
        const t = freeze != null ? freeze : reduced ? 0 : performance.now() / 1000;
        let y = 4;
        const label = (txt) => { ctx.fillStyle = "#86c9a0"; ctx.font = "12px 'Fira Mono', monospace"; ctx.textBaseline = "top"; ctx.fillText(txt, 6, y + 2); y += head; };
        if (parts) {
          label("THE CUT // HEAD TORSO ARMS (UPPER, FORE) LEGS");
          sheets.forEach((sh, i) => {
            const r = rigFor(sh), cx = (i % perRow) * cw, cy = y + Math.floor(i / perRow) * ch;
            if (!r) return;
            const ox = cx + 7 * S, oy = cy + 10 * S;
            for (let yy = 0; yy < SPRITE_H; yy++) for (let xx = 0; xx < SPRITE_W; xx++) { const l = r.sp.label[yy * SPRITE_W + xx]; if (!l) continue; ctx.fillStyle = PART_COL[l]; ctx.fillRect(ox + xx * S, oy + yy * S, S, S); }
          });
          y += Math.ceil(sheets.length / perRow) * ch;
        }
        for (const [a, k] of list) {
          label(k == null ? `${a.toUpperCase()}${ANIMS[a].seat ? " (SEATED)" : ""}` : `${a.toUpperCase()} ${k + 1}/${ANIMS[a].frames.length}`);
          for (let i = 0; i < cellsPer; i++) {
            const sh = sheets[i % sheets.length], face = !frames && i >= sheets.length ? 1 : -1;
            const cx = (i % perRow) * cw, cy = y + Math.floor(i / perRow) * ch;
            ctx.fillStyle = (i + Math.floor(i / perRow)) % 2 ? "#0d140d" : "#101a10"; ctx.fillRect(cx, cy, cw - 2, ch - 2);
            const fx = cx + cw / 2, fy = cy + ch - 6 * S;
            ctx.fillStyle = "#1f4a2c"; ctx.fillRect(cx + 4, fy, cw - 10, 1);
            const A = ANIMS[a], tt = k == null ? t : (k + 0.5) / A.fps;   // a frame's own moment
            const seat = Boolean(A.seat);
            if (seat) { ctx.fillStyle = "#3a2c1c"; ctx.fillRect(fx - 9 * S, fy - 10 * S, 18 * S, 2 * S); }
            drawRig(ctx, sh, a, k == null ? tt : tt, fx, fy, S, face, { ph: k == null ? (i * 0.137) % 1 : 0, seat, seatY: seat ? fy - 10 * S : null });
          }
          y += rowsPer * ch;
        }
        if (freeze == null && !reduced && !off) raf = requestAnimationFrame(draw);
      };
      draw();
      window.__rigReady = true;
    });
    return () => { off = true; cancelAnimationFrame(raf); };
  }, []);
  return (
    <div style={{ background: "#0a0f0a", minHeight: "100vh", padding: "8px 0", color: "#c8f5d8", fontFamily: "var(--mono)" }}>
      <div style={{ padding: "0 8px 8px", fontSize: 14 }}>THE RIG // {ANIM_NAMES.length} ANIMATIONS, ONE CUT PER FIGURE, NO NEW ART</div>
      <div style={{ width: "100%", overflow: "hidden" }}><canvas ref={ref} /></div>
    </div>
  );
}
