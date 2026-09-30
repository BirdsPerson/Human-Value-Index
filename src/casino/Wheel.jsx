import { useEffect, useRef } from "react";
import { WHEEL, colorOf } from "./rules.js";

// The single-zero wheel, drawn in the terminal's colours: 37 pockets in wheel order, the ball
// on its track. spin = {n, id}: a new id starts a spin that settles the ball in pocket n at
// the top, under the pointer (the server has already chosen n; this only shows it).
const STEP = 360 / 37;
const R0 = 100, R_POCKET = 78, R_IN = 56, R_TRACK = 92, R_BALL_END = 70;
const FILL = { red: "#7f1d1d", black: "#0d140d", green: "#14532d" };

function sectorPath(i) {
  const a0 = ((i - 0.5) * STEP - 90) * Math.PI / 180, a1 = ((i + 0.5) * STEP - 90) * Math.PI / 180;
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(R_IN, a0)} L ${p(R_POCKET + 12, a0)} A ${R_POCKET + 12} ${R_POCKET + 12} 0 0 1 ${p(R_POCKET + 12, a1)} L ${p(R_IN, a1)} A ${R_IN} ${R_IN} 0 0 0 ${p(R_IN, a0)} Z`;
}

export default function Wheel({ spin, onDone, size = 240 }) {
  const wheelRef = useRef(null), ballRef = useRef(null);
  const st = useRef({ a: 0, b: 0, r: R_TRACK });
  const done = useRef(onDone); done.current = onDone;

  useEffect(() => {
    if (!spin) return;
    const idx = WHEEL.indexOf(spin.n);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const s = st.current;
    const a0 = s.a, b0 = s.b;
    // wheel ends with pocket idx at the top: a1 + idx*STEP = 0 (mod 360), turning clockwise
    let a1 = -idx * STEP; while (a1 < a0 + 720) a1 += 360;
    const b1 = 0 - 360 * 5;   // the ball runs the other way and drops in at the top
    const T = reduced ? 0 : 4200, t0 = performance.now();
    let raf = 0;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const paint = () => {
      wheelRef.current?.setAttribute("transform", `rotate(${s.a.toFixed(2)})`);
      if (ballRef.current) { const rad = (s.b - 90) * Math.PI / 180; ballRef.current.setAttribute("cx", (s.r * Math.cos(rad)).toFixed(2)); ballRef.current.setAttribute("cy", (s.r * Math.sin(rad)).toFixed(2)); }
    };
    const frame = (now) => {
      const t = T ? Math.min(1, (now - t0) / T) : 1;
      s.a = a0 + (a1 - a0) * ease(t);
      s.b = (b0 % 360) + (b1 - (b0 % 360)) * ease(Math.min(1, t * 1.08));
      s.r = t < 0.72 ? R_TRACK : R_TRACK + (R_BALL_END - R_TRACK) * Math.min(1, (t - 0.72) / 0.2) + (t < 0.92 ? Math.sin(t * 90) * 2 : 0);
      paint();
      if (t < 1) raf = requestAnimationFrame(frame);
      else { s.a = ((s.a % 360) + 360) % 360; s.b = 0; paint(); done.current?.(spin); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spin?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg className="cz-wheel" viewBox="-104 -112 208 216" width={size} height={size} role="img" aria-label={spin ? `The wheel. Last result ${spin.n}.` : "The wheel, at rest."}>
      <circle r={R0} fill="#2a1a0c" stroke="#c9a227" strokeWidth="1.5" />
      <circle r={R_TRACK + 5} fill="#1a1208" stroke="#5a4a2a" strokeWidth="0.6" />
      <g ref={wheelRef}>
        {WHEEL.map((n, i) => {
          const a = (i * STEP - 90) * Math.PI / 180;
          return (
            <g key={n}>
              <path d={sectorPath(i)} fill={FILL[colorOf(n)]} stroke="#c9a227" strokeWidth="0.4" />
              <text x={(R_POCKET + 4) * Math.cos(a)} y={(R_POCKET + 4) * Math.sin(a)} fill="#e5e5e5" fontSize="6.5" textAnchor="middle" dominantBaseline="central"
                transform={`rotate(${i * STEP} ${(R_POCKET + 4) * Math.cos(a)} ${(R_POCKET + 4) * Math.sin(a)})`}>{n}</text>
            </g>
          );
        })}
        <circle r={R_IN} fill="#3a2a14" stroke="#c9a227" strokeWidth="0.8" />
        <circle r={R_IN - 14} fill="#2a1a0c" />
        {[0, 1, 2, 3].map(k => <rect key={k} x="-1.5" y={-R_IN + 4} width="3" height={R_IN - 8} fill="#c9a227" transform={`rotate(${k * 45})`} />)}
        <circle r="7" fill="#c9a227" />
      </g>
      <path d="M -5 -110 L 5 -110 L 0 -101 Z" fill="#4ade80" />
      <circle ref={ballRef} cx="0" cy={-R_TRACK} r="3.6" fill="#f5f5f5" stroke="#9ca3af" strokeWidth="0.6" />
    </svg>
  );
}
