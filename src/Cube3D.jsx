import { useEffect, useRef, useState } from "react";
import TouchGate from "./ui/TouchGate.jsx";
import { CORNERS, EDGES, AXES, MIDPLANES, OCTANT_ANCHORS, project, clampPitch, REST } from "./cube3d.js";
import { OCTANT_LINES } from "./cube.js";
import FilePhoto from "./FilePhoto.jsx";

// The octant cube as a WarGames vector display: green phosphor wireframe, three
// intersecting midplanes (the 50 lines on conduct, competence and likability), one point
// per subject. One rAF loop that runs only while something moves; paused offscreen.
const SWING = 0.6;             // rad either side of the idle angle
const SWING_RATE = 0.22;       // rad/s of swing phase
const IDLE_AFTER = 3000;       // ms after the last interaction before auto-rotation resumes
const HIT = 10;                // px hover radius

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => (cs.getPropertyValue(n).trim() || f);
  return {
    green: v("--accent", "#4ade80"), greenDim: v("--accent-dim", "#22c55e"), amber: v("--warn", "#fbbf24"), red: v("--harm", "#f87171"),
    text: v("--fg", "#c8f5d8"), muted: v("--fg-mute", "#4b7c5e"), ghost: v("--fg-ghost", "#2d5040"), bg: v("--bg", "#0a0f0a"),
    font: v("--mono", "ui-monospace, Menlo, monospace"),
  };
}
const familyColor = (T, fam) => (fam === "good" ? T.green : fam === "charm" ? T.amber : fam === "harm" ? T.red : T.muted);
const PLANE_TINT = { x: "green", y: "green", z: "amber" };

export default function Cube3D({ points, highlight = null, single = false, height = 360, label, onHover }) {
  const wrapRef = useRef(null), canvasRef = useRef(null), tipRef = useRef(null);
  const st = useRef({ yaw: REST.yaw, pitch: REST.pitch, w: 0, h: 0, dpr: 1, visible: true, dragging: null,
    lastInput: 0, hover: null, raf: 0, last: 0, dirty: true, reduced: false, tok: null, screen: [], phase: 0, base: REST.yaw });
  const [hover, setHover] = useState(null);
  const [docked, setDocked] = useState(false);   // phones: the details sit under the cube, not over it
  const ptsRef = useRef(points); ptsRef.current = points;
  const hiRef = useRef(highlight); hiRef.current = highlight;

  useEffect(() => { st.current.dirty = true; kick(); }, [points, highlight]);   // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const s = st.current, c = canvasRef.current;
    if (!c || !s.w) return;
    const ctx = c.getContext("2d"), T = s.tok || (s.tok = tokens());
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    const narrow = s.w < 480;
    const view = { yaw: s.yaw, pitch: s.pitch, scale: Math.min(s.w, s.h) * (single ? (narrow ? 0.27 : 0.28) : 0.255), cx: s.w / 2, cy: s.h / 2 };
    const P = p => project(p, view);
    const fs = narrow ? 11 : 12;
    ctx.font = `${fs}px ${T.font}`;
    ctx.lineCap = "round";
    const path = pts => { ctx.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); };

    // Labels are collected while drawing and placed last, most important first, so no
    // two ever overlap: a label tries its spots in order and is dropped if all collide
    // (unless it must show, in which case it takes its first spot).
    const labels = [];
    const label = (text, spots, color, { alpha = 1, prio = 0, must = false } = {}) => labels.push({ text, spots, color, alpha, prio, must });

    // the three midplanes: translucent fill, quarter grid, outline. They visibly cross.
    for (const m of MIDPLANES) {
      const tint = T[PLANE_TINT[m.axis]];
      path(m.outline); ctx.closePath();
      ctx.globalAlpha = 0.05; ctx.fillStyle = tint; ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = T.ghost; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      for (const [a, b] of m.grid) { path([a, b]); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = 0.75; ctx.strokeStyle = T.ghost;
      path(m.outline); ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the 12 cube edges
    ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.beginPath();
    for (const [i, j] of EDGES) { const A = P(CORNERS[i]), B = P(CORNERS[j]); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); }
    ctx.stroke();
    // the three axes through the centre, with labelled ends
    for (const ax of AXES) {
      const A = P(ax.a), B = P(ax.b);
      const col = ax.id === "z" ? T.amber : T.green;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      ctx.globalAlpha = 1;
      // an axis end's spots: beside the tip, then above/below it, then pushed further out
      const endSpots = (E, text) => {
        const right = E.x >= view.cx, up = E.y < view.cy, wid = ctx.measureText(text).width;
        const cx = Math.abs(E.x - view.cx) < 12 ? E.x - wid / 2 : right ? E.x + 6 : E.x - 6 - wid;
        const dy = up ? -6 : fs + 4;
        return [[cx, E.y + dy], [cx, E.y - dy + (up ? fs : -fs)], [E.x - wid / 2, E.y + dy + (up ? -fs : fs)], [cx, E.y + dy + (up ? -fs - 2 : fs + 2)]];
      };
      label(`HIGH ${ax.label}`, endSpots(B, `HIGH ${ax.label}`), col, { prio: 2, must: true });
      label(`LOW ${ax.label}`, endSpots(A, `LOW ${ax.label}`), col, { prio: 1, alpha: 0.6 });
    }
    const O = P([0, 0, 0]);
    ctx.fillStyle = T.text; ctx.beginPath(); ctx.arc(O.x, O.y, 2, 0, Math.PI * 2); ctx.fill();
    // octant names, faint, in the full view; phones drop them (the legend and the chips name them)
    if (!single && !narrow) {
      for (const [name, at] of Object.entries(OCTANT_ANCHORS)) {
        const q = P(at), wid = ctx.measureText(name).width;
        label(name, [[q.x - wid / 2, q.y], [q.x - wid / 2, q.y + fs + 2], [q.x - wid / 2, q.y - fs - 2]], T.ghost,
          { alpha: Math.max(0.35, Math.min(0.85, 0.95 - q.depth * 0.35)), prio: 0 });
      }
    }

    // subjects, far first so near points paint over
    const pts = ptsRef.current || [];
    const hi = hiRef.current, hov = s.hover;
    const screen = pts.map(g => ({ g, S: P(g.p), F: g.foot ? P(g.foot) : null }));
    screen.sort((a, b) => b.S.depth - a.S.depth);
    const anyFocus = hi || hov;
    for (const it of screen) {
      const { g, S, F } = it;
      const focused = (hi && g.name === hi) || (hov && hov === g);
      const col = familyColor(T, g.family);
      ctx.globalAlpha = anyFocus && !focused ? 0.25 : 1;
      // drop line to the agreement plane (likability = conduct): the gap, drawn
      if (F && (single || focused)) {
        ctx.strokeStyle = focused || single ? T.amber : T.ghost; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(F.x, F.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = T.amber; ctx.beginPath(); ctx.arc(F.x, F.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      const r = (single ? 5 : focused ? 4.2 : 3) * S.f;
      ctx.beginPath(); ctx.arc(S.x, S.y, r, 0, Math.PI * 2);
      if (g.rated) { ctx.fillStyle = focused ? T.text : col; ctx.fill(); }
      else { ctx.strokeStyle = focused ? T.text : T.muted; ctx.lineWidth = 1.3; ctx.stroke(); }
      const tag = single ? (g.rated ? g.octant : "NOT YET RATED") : focused ? g.name.toUpperCase() : null;
      if (tag) {
        const wid = ctx.measureText(tag).width;
        label(tag, [[S.x + 8, S.y - 6], [S.x - 8 - wid, S.y - 6], [S.x + 8, S.y + fs + 4], [S.x - 8 - wid, S.y + fs + 4]],
          single ? (g.rated ? col : T.muted) : T.text, { prio: 3, must: true });
      }
    }
    ctx.globalAlpha = 1;

    // place and draw the labels: highest priority first, each on a knocked-out ground
    const placed = [];
    const hit = (a) => placed.some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
    // the faint octant names also keep off the points, so they never hide a subject
    const onPoint = (a) => screen.some(({ S }) => S.x > a.x - 4 && S.x < a.x + a.w + 4 && S.y > a.y - 4 && S.y < a.y + a.h + 4);
    labels.sort((a, b) => b.prio - a.prio);
    ctx.textAlign = "left";
    for (const L of labels) {
      const wid = ctx.measureText(L.text).width;
      const box = ([x, y]) => {
        const cx = Math.max(2, Math.min(s.w - wid - 2, x)), cy = Math.max(fs + 2, Math.min(s.h - 3, y));
        return { x: cx - 2, y: cy - fs, w: wid + 4, h: fs + 4, tx: cx, ty: cy };
      };
      let at = null;
      for (const sp of L.spots) { const b = box(sp); if (!hit(b) && (L.prio > 0 || !onPoint(b))) { at = b; break; } }
      if (!at && L.must) at = box(L.spots[0]);
      if (!at) continue;
      placed.push(at);
      if (L.prio > 0) { ctx.globalAlpha = 0.72; ctx.fillStyle = T.bg; ctx.fillRect(at.x, at.y, at.w, at.h); }
      ctx.globalAlpha = L.alpha; ctx.fillStyle = L.color; ctx.fillText(L.text, at.tx, at.ty);
    }
    ctx.globalAlpha = 1;
    s.screen = screen;
    s.dirty = false;
  }

  function frame(t) {
    const s = st.current;
    s.raf = 0;
    const dt = s.last ? Math.min(0.05, (t - s.last) / 1000) : 0;
    s.last = t;
    const idle = !s.reduced && !s.dragging && performance.now() - s.lastInput > IDLE_AFTER;
    if (idle && s.visible) { s.phase += SWING_RATE * dt; s.yaw = s.base + SWING * Math.sin(s.phase); s.dirty = true; }
    if (s.dirty && s.visible) draw();
    if (s.visible && (idle || s.dragging || s.dirty)) s.raf = requestAnimationFrame(frame);
    else s.last = 0;
  }
  function kick() {
    const s = st.current;
    if (!s.raf && s.visible) s.raf = requestAnimationFrame(frame);
  }

  useEffect(() => {
    const s = st.current, wrap = wrapRef.current, c = canvasRef.current;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    s.reduced = !!mq?.matches;
    const onMq = () => { s.reduced = !!mq.matches; kick(); };
    mq?.addEventListener?.("change", onMq);
    const size = () => {
      const w = wrap.clientWidth, h = Math.min(height, Math.round(w * (single ? 0.86 : w < 480 ? 0.95 : 0.8)));
      setDocked(!single && w < 480);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      s.w = w; s.h = h; s.dpr = dpr;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.height = h + "px";
      s.dirty = true; kick();
    };
    const ro = new ResizeObserver(size); ro.observe(wrap); size();
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible) { s.dirty = true; kick(); } });
    io.observe(c);
    return () => {
      ro.disconnect(); io.disconnect(); mq?.removeEventListener?.("change", onMq);
      if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0;
    };
  }, [height, single]);   // eslint-disable-line react-hooks/exhaustive-deps

  function pick(px, py) {
    let best = null, bd = HIT;
    for (const it of st.current.screen) {
      const d = Math.hypot(px - it.S.x, py - it.S.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function setHov(it, px, py) {
    const s = st.current, g = it ? it.g : null;
    if (s.hover !== g) { s.hover = g; s.dirty = true; kick(); setHover(g); onHover?.(g); }
    const tip = tipRef.current;
    if (tip && it && !(s.w < 480 && !single)) {
      const left = Math.min(Math.max(4, px + 12), s.w - 250);
      tip.style.left = left + "px"; tip.style.top = Math.max(4, py - 86) + "px";
    }
  }
  const pos = e => { const r = canvasRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function onDown(e) {
    const s = st.current; s.lastInput = performance.now();
    s.dragging = { x: e.clientX, y: e.clientY, yaw: s.yaw, pitch: s.pitch, moved: false, id: e.pointerId };
    canvasRef.current.setPointerCapture?.(e.pointerId);
    kick();
  }
  function onMove(e) {
    const s = st.current, d = s.dragging;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      s.yaw = d.yaw + dx * 0.009; s.pitch = clampPitch(d.pitch + dy * 0.009); s.base = s.yaw; s.phase = 0;
      s.lastInput = performance.now(); s.dirty = true; kick();
      return;
    }
    if (e.pointerType === "mouse") { const [x, y] = pos(e); setHov(pick(x, y), x, y); }
  }
  function onUp(e) {
    const s = st.current, d = s.dragging;
    s.dragging = null; s.lastInput = performance.now();
    if (d && !d.moved) { const [x, y] = pos(e); setHov(pick(x, y), x, y); }   // tap selects
    kick();
  }
  function onKey(e) {
    const s = st.current, k = e.key;
    const step = 0.14;
    if (k === "ArrowLeft") s.yaw -= step; else if (k === "ArrowRight") s.yaw += step;
    else if (k === "ArrowUp") s.pitch = clampPitch(s.pitch - step); else if (k === "ArrowDown") s.pitch = clampPitch(s.pitch + step);
    else if (k === "Escape") { setHov(null); return; }
    else return;
    e.preventDefault(); s.base = s.yaw; s.phase = 0; s.lastInput = performance.now(); s.dirty = true; kick();
  }

  const q = hover?.q;
  return (
    <div ref={wrapRef} className="hvi-cube3d" style={{ position: "relative", width: "100%" }}>
      <TouchGate off={single}>
      <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={label}
        style={{ display: "block", width: "100%", touchAction: single ? "pan-y" : "none", cursor: "grab", outlineOffset: 2 }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={e => { if (e.pointerType === "mouse" && !st.current.dragging) setHov(null); }}
        onKeyDown={onKey} />
      </TouchGate>
      <div ref={tipRef} className={`hvi-cube3d-tip${docked ? " docked" : ""}`} hidden={!hover} aria-live="polite"
        style={docked ? { position: "static", maxWidth: "none", marginTop: "var(--s2)", minHeight: "var(--hit)" } : undefined}>
        {hover && q && (<>
          {hover.photo && <div style={{ float: "left", marginRight: 8 }}><FilePhoto subject={hover.photo} scale={1} compact /></div>}
          <div className="t">{hover.name}</div>
          <div>CONDUCT {q.warmth} · COMPETENCE {q.competence} · LIKABILITY {hover.rated ? q.people.likability : "UNRATED"}</div>
          {hover.rated ? (<>
            <div className="g">{hover.octant} · GAP {hover.gap > 0 ? "+" : ""}{hover.gap} · {hover.judge}</div>
            <div>{OCTANT_LINES[hover.octant]}</div>
          </>) : <div className="g">{q.quadrant} (LIKABILITY UNRATED)</div>}
        </>)}
      </div>
    </div>
  );
}
