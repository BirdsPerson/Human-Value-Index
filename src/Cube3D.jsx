import { useEffect, useRef, useState } from "react";
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
    green: v("--green", "#4ade80"), greenDim: v("--green-dim", "#22c55e"), amber: v("--amber", "#fbbf24"), red: v("--red", "#f87171"),
    text: v("--text", "#c8f5d8"), muted: v("--text-muted", "#4b7c5e"), ghost: v("--text-ghost", "#2d5040"), bg: v("--bg", "#0a0f0a"),
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
  const ptsRef = useRef(points); ptsRef.current = points;
  const hiRef = useRef(highlight); hiRef.current = highlight;

  useEffect(() => { st.current.dirty = true; kick(); }, [points, highlight]);   // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const s = st.current, c = canvasRef.current;
    if (!c || !s.w) return;
    const ctx = c.getContext("2d"), T = s.tok || (s.tok = tokens());
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    const narrow = s.w < 440;
    const view = { yaw: s.yaw, pitch: s.pitch, scale: Math.min(s.w, s.h) * (single ? (narrow ? 0.27 : 0.28) : 0.255), cx: s.w / 2, cy: s.h / 2 };
    const P = p => project(p, view);
    const fs = narrow ? 9.5 : 11;
    ctx.font = `${fs}px ${T.font}`;
    ctx.lineCap = "round";
    const path = pts => { ctx.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); };

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
    // the three axes through the centre, with labelled positive ends
    for (const ax of AXES) {
      const A = P(ax.a), B = P(ax.b);
      ctx.strokeStyle = ax.id === "z" ? T.amber : T.green; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = ax.id === "z" ? T.amber : T.green;
      // label an axis end, kept inside the canvas so narrow screens don't clip it
      const end = (E, text) => {
        const right = E.x >= view.cx, up = E.y < view.cy, wid = ctx.measureText(text).width;
        let x = Math.abs(E.x - view.cx) < 12 ? E.x - wid / 2 : right ? E.x + 6 : E.x - 6 - wid;
        x = Math.max(2, Math.min(s.w - wid - 2, x));
        ctx.textAlign = "left";
        ctx.fillText(text, x, E.y + (up ? -6 : fs + 4));
      };
      end(B, `HIGH ${ax.label}`);
      ctx.globalAlpha = 0.55; end(A, `LOW ${ax.label}`); ctx.globalAlpha = 1;
    }
    const O = P([0, 0, 0]);
    ctx.fillStyle = T.text; ctx.beginPath(); ctx.arc(O.x, O.y, 2, 0, Math.PI * 2); ctx.fill();
    // octant names, faint, in the full view
    if (!single) {
      ctx.textAlign = "center";
      for (const [name, at] of Object.entries(OCTANT_ANCHORS)) {
        const q = P(at); ctx.globalAlpha = Math.max(0.25, Math.min(0.8, 0.9 - q.depth * 0.35));
        ctx.fillStyle = T.ghost; ctx.fillText(name, q.x, q.y);
      }
      ctx.globalAlpha = 1;
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
      if (single) {
        ctx.fillStyle = g.rated ? col : T.muted; ctx.textAlign = "left";
        ctx.fillText(g.rated ? g.octant : "NOT YET RATED", S.x + 8, S.y - 6);
      } else if (focused) {
        ctx.fillStyle = T.text; ctx.textAlign = "left"; ctx.fillText(g.name.toUpperCase(), S.x + 7, S.y - 6);
      }
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
      const w = wrap.clientWidth, h = Math.min(height, Math.round(w * (single ? 0.86 : 0.8)));
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
    if (tip && it) {
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
      <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={label}
        style={{ display: "block", width: "100%", touchAction: single ? "pan-y" : "none", cursor: "grab", outlineOffset: 2 }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={e => { if (e.pointerType === "mouse" && !st.current.dragging) setHov(null); }}
        onKeyDown={onKey} />
      <div ref={tipRef} className="hvi-cube3d-tip" hidden={!hover} aria-live="polite">
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
