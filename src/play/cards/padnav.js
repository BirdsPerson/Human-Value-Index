// Moving around a card table with the arrow keys or a gamepad's d-pad: every control the game
// marks [data-pad] is a stop; a direction goes to the nearest stop that way (by its on-screen box),
// A (or Enter) presses the focused one. Start opens the game's pause menu; B its back.
import { useEffect, useRef } from "react";
import { readPad } from "../../city/gamepad.js";

const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
export function moveFocus(root, dir) {
  if (!root) return false;
  const stops = [...root.querySelectorAll("[data-pad]")].filter(el => !el.disabled && el.offsetParent !== null);
  if (!stops.length) return false;
  const cur = stops.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { (stops.find(el => el.dataset.pad === "first") || stops[0]).focus({ preventScroll: false }); return true; }
  const a = centre(cur);
  const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  let best = null, bestScore = Infinity;
  for (const el of stops) {
    if (el === cur) continue;
    const b = centre(el), vx = b.x - a.x, vy = b.y - a.y;
    const along = vx * dx + vy * dy;
    if (along <= 2) continue;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView?.({ block: "nearest", inline: "nearest" }); return true; }
  return false;
}
const KEYDIR = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
// The arrow keys inside the table (attach to the table's onKeyDown).
export function arrowKeys(e, root) {
  const d = KEYDIR[e.key];
  if (!d || e.altKey || e.metaKey || e.ctrlKey) return;
  if (e.target?.tagName === "INPUT" || e.target?.tagName === "SELECT") return;
  if (moveFocus(root, d)) e.preventDefault();
}
// The pad, polled while the table is up. on: {start, back} callbacks; paused: skip everything
// (GameMenu reads the pad itself while it is open).
export function usePad(rootRef, { start, back, paused = false } = {}) {
  const live = useRef({}); live.current = { start, back, paused };
  useEffect(() => {
    let raf = 0, prev = null, rep = 0;
    const tick = () => {
      const p = readPad();
      if (p.connected) {
        const h = p.held, L = live.current;
        const dir = h.left ? "left" : h.right ? "right" : h.up ? "up" : h.down ? "down" : p.x < -0.6 ? "left" : p.x > 0.6 ? "right" : p.y < -0.6 ? "up" : p.y > 0.6 ? "down" : null;
        const was = prev?.dir;
        if (!L.paused) {
          if (dir && (dir !== was || ++rep > 14)) { rep = dir !== was ? 0 : 10; moveFocus(rootRef.current, dir); }
          if (!dir) rep = 0;
          if (h.act && prev && !prev.act) { const el = document.activeElement; if (el && rootRef.current?.contains(el)) el.click(); }
          if (h.back && prev && !prev.back) L.back?.();
          if (h.start && prev && !prev.start) L.start?.();
        }
        prev = { dir, act: h.act, back: h.back, start: h.start };
      } else prev = null;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rootRef]);
}
