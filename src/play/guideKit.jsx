import { useEffect, useRef, useState } from "react";
import { readPad, GLYPHS } from "../city/gamepad.js";
import { readLastResult } from "../caseFile.jsx";
import "./guideKit.css";

// The long-tail games' shared "how to play": a drawn pad using the connected pad's own glyphs, a few
// plain-words rows, shown once before the first play (skippable, remembered) and under Pause, CONTROLS.
// Plus the first-run tips (one line the first time a thing comes up, gone once used) and the profile's hand.
// Same pattern as src/play/tennis/Guide.jsx and src/play/football/Guide.jsx.

const flag = (k) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const setFlag = (k) => { try { localStorage.setItem(k, "1"); } catch { /* the tab remembers */ } };
export const guideSeen = (key) => flag(key);
export const markGuideSeen = (key) => setFlag(key);

// First-run tips: the set of tip ids already used, kept in one key.
export function tipsUsed(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); } }
export function markTipUsed(key, id) { const s = tipsUsed(key); if (s.has(id)) return s; s.add(id); try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* the tab remembers */ } return s; }

// A `hand` on the player's profile (localStorage "hvi-profile", or the last case result), if the site has one: -1 left, 1 right, null unset.
export function profileHand() {
  const norm = (h) => (h === "L" || h === "left" || h === -1 || h === "LEFT" ? -1 : h === "R" || h === "right" || h === 1 || h === "RIGHT" ? 1 : null);
  try { const p = JSON.parse(localStorage.getItem("hvi-profile") || "null"); const h = norm(p?.hand); if (h) return h; } catch { /* no profile */ }
  try { const last = readLastResult(); return norm(last?.hand) || norm(last?.profile?.hand) || norm(last?.avatar?.hand) || norm(last?.avatar?.spec?.hand) || null; } catch { return null; }
}

// The way the player is playing now: "pad" if a pad is connected, "touch" on a phone, else "keys".
export function usePlayMode() {
  const [m, setM] = useState({ mode: typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "keys", family: "generic" });
  useEffect(() => {
    let raf, last = "";
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); const k = p.connected ? `pad|${p.family}` : ""; if (k !== last) { last = k; setM(s => (p.connected ? { mode: "pad", family: p.family || "generic" } : s.mode === "pad" ? { mode: "keys", family: s.family } : s)); } };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return m;
}

// The drawn pad. lit: ids of the controls the game uses, e.g. ["ls","A","B","start"]; ids: ls rs dpad A B X Y LB RB start.
export function PadSketch({ family, lit = [], label = "" }) {
  const g = GLYPHS[family] || GLYPHS.generic;
  const on = new Set(lit), L = "var(--accent)", D = "var(--line-hi)", M = "var(--fg-dim)";
  const glyph = { A: g.act, B: g.back, X: g.find, Y: g.labels, LB: g.turnL, RB: g.turnR, start: g.start };
  const face = (id, cx, cy) => (
    <g key={id}>
      <circle cx={cx} cy={cy} r="13" fill={on.has(id) ? L : "none"} stroke={on.has(id) ? L : D} strokeWidth="2" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={on.has(id) ? "var(--accent-ink)" : M}>{glyph[id]}</text>
    </g>
  );
  const bump = (id, x) => (
    <g key={id}><rect x={x} y="10" width="58" height="14" rx="5" fill={on.has(id) ? L : "none"} stroke={on.has(id) ? L : D} strokeWidth="2" />
      <text x={x + 29} y="21" textAnchor="middle" fontSize="10" fontWeight="700" fill={on.has(id) ? "var(--accent-ink)" : M}>{glyph[id]}</text></g>
  );
  const stick = (id, cx, cy, t) => (
    <g key={id}><circle cx={cx} cy={cy} r="24" fill="none" stroke={on.has(id) ? L : D} strokeWidth="3" /><circle cx={cx} cy={cy} r="10" fill={on.has(id) ? L : D} />
      <text x={cx} y={cy + 42} textAnchor="middle" fontSize="10" fill={M}>{t}</text></g>
  );
  return (
    <svg className="gk-pad" viewBox="0 0 400 200" role="img" aria-label={label || "Controller"}>
      <path d="M70 34 H330 Q372 34 380 90 Q388 154 350 170 Q320 180 300 144 H100 Q80 180 50 170 Q12 154 20 90 Q28 34 70 34 Z" fill="none" stroke={D} strokeWidth="3" />
      {bump("LB", 52)}{bump("RB", 290)}
      {stick("ls", 100, 80, "LEFT STICK")}
      <path d="M170 120 h12 v-12 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 z" fill="none" stroke={on.has("dpad") ? L : D} strokeWidth="2" />
      {stick("rs", 250, 128, "RIGHT STICK")}
      <rect x="187" y="64" width="26" height="9" rx="4" fill={on.has("start") ? L : D} /><text x="200" y="58" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--fg)">{glyph.start}</text>
      {face("Y", 322, 54)}{face("X", 294, 80)}{face("B", 350, 80)}{face("A", 322, 106)}
    </svg>
  );
}

// The guide. rows: [[KEY, text]...]. pad: {family, lit, keys: [[glyphOrKey, text]...]} (drawn when a pad is connected, or compact).
// onDone: dismissed (a button, or the pad's A / Start). compact: inside the pause menu.
export default function HowTo({ title = "HOW TO PLAY", mode, family, rows, pad, onDone = null, compact = false }) {
  const go = useRef(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!onDone) return undefined;
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onDone(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  const showPad = pad && (mode === "pad" || compact);
  return (
    <section className={`gk-guide${compact ? " compact" : ""}`} aria-label="How to play">
      {!compact && <h2 className="gk-h">{title}</h2>}
      {showPad && <PadSketch family={family} lit={pad.lit} label={pad.label} />}
      {showPad && pad.keys && <ul className="gk-keys">{pad.keys.map(([k, t]) => <li key={k}><b>{k}</b> {t}</li>)}</ul>}
      <dl className="gk-rows">{rows.map(([k, t]) => <div key={k}><dt>{k}</dt><dd>{t}</dd></div>)}</dl>
      {onDone && <p className="gk-go"><button type="button" className="gk-btn" onClick={onDone} ref={go}>GOT IT: PLAY</button> <span className="gk-small">SHOWN ONCE. IT IS ALWAYS UNDER PAUSE, CONTROLS.</span></p>}
    </section>
  );
}

// A first-run prompt strip: fades when `gone`.
export function Tip({ text, gone }) { return text ? <p className={`gk-tip${gone ? " gone" : ""}`} role="status">{text}</p> : null; }
