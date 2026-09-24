import { useState, useEffect, useRef } from "react";

// Text-mode primitives. Everything here is real characters on the monospace grid:
// no CSS borders pretending to be boxes. One font (Fira Mono) carries letters,
// box drawing and block elements, so every glyph has the same advance width.

export const RULE = "─".repeat(400);
const SIDE = "│\n".repeat(400);
const SIDE2 = "║\n".repeat(400);
const RULE2 = "═".repeat(400);

export function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

// A frame drawn in box-drawing characters. The horizontal runs are long strings clipped
// by flex, so the box fills any width and the clip lands mid-rule, where it is invisible.
// The sides are a column of │ one character wide, stretched to the content's height.
export function TermBox({ title, right, children, tone, double = false, className = "", bodyClass = "", ...rest }) {
  const [tl, tr, bl, br, h, side] = double ? ["╔", "╗", "╚", "╝", RULE2, SIDE2] : ["┌", "┐", "└", "┘", RULE, SIDE];
  return (
    <div className={`tb ${className}`} style={tone ? { "--tb": tone } : undefined} {...rest}>
      <div className="tb-edge" aria-hidden="true">
        <span>{tl}{h[0]}</span>
        {title && <span className="tb-title">{" "}{title}{" "}</span>}
        <span className="tb-fill">{h}</span>
        {right && <span className="tb-title tb-right">{" "}{right}{" "}</span>}
        <span>{h[0]}{tr}</span>
      </div>
      {title && <span className="sr-only">{title}</span>}
      <div className="tb-mid">
        <span className="tb-side" aria-hidden="true">{side}</span>
        <div className={`tb-body ${bodyClass}`}>{children}</div>
        <span className="tb-side" aria-hidden="true">{side}</span>
      </div>
      <div className="tb-edge" aria-hidden="true">
        <span>{bl}</span><span className="tb-fill">{h}</span><span>{br}</span>
      </div>
    </div>
  );
}

// A full-width horizontal rule, optionally with a label: ── LABEL ─────────
export function Rule({ label, tone, double = false }) {
  const h = double ? RULE2 : RULE;
  return (
    <div className="tb-edge rule" style={tone ? { "--tb": tone } : undefined} aria-hidden={label ? undefined : "true"}>
      <span>{h.slice(0, 2)}</span>
      {label && <span className="tb-title">{" "}{label}{" "}</span>}
      <span className="tb-fill">{h}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typewriter. Overlord lines arrive one character at a time with a block cursor at
// the end. Click (or any key) skips; reduced motion renders instantly. Screen
// readers get the whole line at once from a hidden copy.

export function Typed({ text, cps = 36, delay = 0, onDone, className = "", as: Tag = "div", cursorAfter = false, skipKey }) {
  const full = text || "";
  const [n, setN] = useState(() => (prefersReducedMotion() ? full.length : 0));
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    doneRef.current = false;
    if (prefersReducedMotion()) { setN(full.length); return; }
    setN(0);
    let i = 0, iv = 0;
    const start = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= full.length) clearInterval(iv);
      }, 1000 / cps);
    }, delay);
    return () => { clearTimeout(start); clearInterval(iv); };
  }, [full, cps, delay]);

  useEffect(() => {
    if (n >= full.length && !doneRef.current) { doneRef.current = true; onDoneRef.current?.(); }
  }, [n, full.length]);

  // An external skip signal (a counter the parent bumps on click / keypress).
  useEffect(() => { if (skipKey) setN(full.length); }, [skipKey, full.length]);

  const typing = n < full.length;
  return (
    <Tag className={`typed ${className}`} onClick={typing ? () => setN(full.length) : undefined}>
      <span className="sr-only">{full}</span>
      <span aria-hidden="true">{full.slice(0, n)}{(typing || cursorAfter) && <span className="cur">█</span>}</span>
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Big ASCII digits, five rows tall.
const DIGITS = {
  "0": ["███", "█ █", "█ █", "█ █", "███"],
  "1": [" █ ", "██ ", " █ ", " █ ", "███"],
  "2": ["███", "  █", "███", "█  ", "███"],
  "3": ["███", "  █", " ██", "  █", "███"],
  "4": ["█ █", "█ █", "███", "  █", "  █"],
  "5": ["███", "█  ", "███", "  █", "███"],
  "6": ["███", "█  ", "███", "█ █", "███"],
  "7": ["███", "  █", " █ ", " █ ", " █ "],
  "8": ["███", "█ █", "███", "█ █", "███"],
  "9": ["███", "█ █", "███", "  █", "███"],
  "-": ["   ", "   ", "███", "   ", "   "],
  "+": ["   ", " █ ", "███", " █ ", "   "],
};
export function bigDigits(value) {
  const chars = String(value).split("").filter(c => DIGITS[c]);
  return [0, 1, 2, 3, 4].map(r => chars.map(c => DIGITS[c][r]).join(" ")).join("\n");
}
export function BigNumber({ value, tone, label }) {
  return (
    <pre className="bignum" style={tone ? { color: tone } : undefined} role="img" aria-label={label || String(value)}>
      {bigDigits(value)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Text bars and sparklines.
export function textBar(value, width = 20, max = 100) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const filled = Math.round((v / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// The same bar as spans, so the unfilled track can sit dimmer than the fill.
export function Bar({ value, width = 20, max = 100, tone }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const f = Math.round((v / max) * width);
  return (
    <span className="bar" aria-hidden="true">
      <span style={tone ? { color: tone } : undefined}>{"█".repeat(f)}</span>
      <span className="off">{"░".repeat(width - f)}</span>
    </span>
  );
}

const SPARK = "▁▂▃▄▅▆▇█";
export function textSpark(values, lo = 0, hi = 1000) {
  return values.map(v => SPARK[Math.max(0, Math.min(7, Math.floor(((v - lo) / Math.max(1, hi - lo)) * 7.999)))]).join("");
}

export const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
export const padL = (s, n) => (" ".repeat(n) + String(s)).slice(-n);

// ---------------------------------------------------------------------------
// The banner. Hand-built two-row block letters, composed per letter so rows stay
// aligned; phones get a one-line version instead.
const GLYPHS = {
  H: ["█ █", "█▀█"], U: ["█ █", "█▄█"], M: ["█▀▄▀█", "█ ▀ █"], A: ["▄▀█", "█▀█"],
  N: ["█▄ █", "█ ▀█"], V: ["█ █", "▀▄▀"], L: ["█  ", "█▄▄"], E: ["█▀▀", "██▄"],
  I: ["█", "█"], D: ["█▀▄", "█▄▀"], X: ["▀▄▀", "█ █"], " ": [" ", " "],
};
export function blockText(str) {
  return [0, 1].map(r => str.split("").map(c => (GLYPHS[c] || GLYPHS[" "])[r]).join(" ")).join("\n");
}
export const BANNER = blockText("HUMAN  VALUE  INDEX");
