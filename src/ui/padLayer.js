// THE GAMEPAD LAYER: the whole site by controller, everywhere a game or the city's GAMEPAD
// BROWSE (src/city/padBrowse.js) is not already listening. Its own chunk; src/ui/padHook.js (in
// the entry) loads it the first time a pad connects.
//
//   LEFT STICK     a cursor (a pixel arrow in the theme's colours) with acceleration and a pull
//                  toward buttons and links; hover fires as with a mouse. A clicks under it.
//   RIGHT STICK /  focus moves to the nearest control that way (buttons, links, fields, rows,
//   D-PAD          tiles, windows), real DOM focus, a ring round it; the cursor jumps there too.
//   A              click / activate. On a text field: the ON-SCREEN KEYBOARD.
//   B              back: the keyboard, then a held window, then the top dialog (Escape / cancel),
//                  then whatever Escape closes, else history back.
//   START          MENU.   SELECT  cursor vs focus emphasis.
//   LB / RB        previous / next tab (role=tablist), else previous / next section heading.
//   LT / RT        scroll whatever is under the pointer (or the page).
//   Y              the page's own action: the element with data-pad-y (ARRANGE on the front desk).
//   ARRANGE        A on a window grabs it, the sticks move it, LT / RT size it, A drops, B cancels
//                  (src/front/FrontDesk.jsx listens for "hvi-pad-arrange").
// It stands down in a game's room, inside the city's views (data-pad-own="city": GAMEPAD BROWSE
// has the pad; a dialog over the city is ours except B, which BROWSE already closes), and
// whenever anything carries data-pad-own (GameMenu). The cursor hides when a real mouse or finger
// moves and comes back on the next stick push. The hint strip and keyboard are aria-hidden;
// focus is real focus, so a screen reader hears what it always hears.
//   A on a <select>  picks it up: left / right (or up / down) change the choice as it lies, A confirms, B puts it back.
//   The keyboard     types capitals by itself in a case-number field (autocapitalize=characters, or a field named
//                    for the case); CAPS holds capitals for any field, SHIFT is one letter.
//   The focused control is scrolled to the middle of the screen, and the hint strip hops to the top when it
//   would cover it. List rows (data-pad-row) are magnetic like buttons however wide they are.
// Pure parts (ownerOf, pickNeighbour, backAction, OSK, scrollBlock, hintSide, selectStep, wantsUpper) are checked
// in scripts/check-padlayer.mjs.

import { readPad, pressedSince, GLYPHS } from "../city/gamepad.js";
import { stepCursor, stickStep } from "../city/padBrowse.js";

// ---- pure --------------------------------------------------------------------------------------
// The rooms whose games read the pad themselves.
export const GAME_ROUTES = ["#tennis", "#golf", "#hoops", "#basketball", "#football", "#tecmo", "#bowling", "#soccer", "#skate", "#ski", "#fish", "#hunt"];
// route: the hash's path; owns: the data-pad-own values on screen; modal: a dialog is up.
// -> { active, noBack }  (noBack: B is someone else's)
export function ownerOf({ route = "", owns = [], modal = false } = {}) {
  const r = String(route).split("?")[0];
  if (GAME_ROUTES.includes(r) || r.startsWith("#cards/")) return { active: false, noBack: false };
  if (owns.some(o => o !== "city")) return { active: false, noBack: false };
  if (owns.includes("city")) return modal ? { active: true, noBack: true } : { active: false, noBack: false };
  return { active: true, noBack: false };
}

const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Spatial navigation: from rect `from` ({x, y, w, h}), the candidate nearest the way of dir,
// inside a cone (sideways gap up to 1.5x the distance along). Distance along runs edge to edge;
// a sideways gap counts 30x across and 2x up and down (the WICG spatnav weights), so the control in line wins over a nearer one off to the side.
// -> index into cands, or -1.
export function pickNeighbour(from, cands, dir) {
  const [dx, dy] = DV[dir] || [0, 0];
  const fcx = from.x + from.w / 2, fcy = from.y + from.h / 2;
  let best = -1, bs = Infinity;
  cands.forEach((c, i) => {
    if (c === from) return;
    const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
    const alongC = (ccx - fcx) * dx + (ccy - fcy) * dy;
    if (alongC <= 1) return;
    // edge-to-edge distance along dir, and the gap between the two on the other axis
    const along = dx > 0 ? c.x - (from.x + from.w) : dx < 0 ? from.x - (c.x + c.w) : dy > 0 ? c.y - (from.y + from.h) : from.y - (c.y + c.h);
    const far = dx ? (dx > 0 ? c.x + c.w > from.x + from.w + 1 : c.x < from.x - 1) : (dy > 0 ? c.y + c.h > from.y + from.h + 1 : c.y < from.y - 1);
    if (!far) return;
    const gap = dx ? Math.max(0, c.y - (from.y + from.h), from.y - (c.y + c.h)) : Math.max(0, c.x - (from.x + from.w), from.x - (c.x + c.w));
    if (gap > alongC * 1.5) return;
    const off = dx ? Math.abs(ccy - fcy) : Math.abs(ccx - fcx);
    const s = Math.max(0, along) + gap * (dx ? 30 : 2) + off * 0.1;   // the WICG spatnav weights: a row is a row
    if (s < bs) { bs = s; best = i; }
  });
  return best;
}

// What B does, in order. s: {osk, grab, modals: [the open dialogs, bottom first], noBack}
// -> {act: "osk" | "grab" | "dialog" | "escape" | "none", target?}. "escape": press Escape, and
// if nothing on the page closed, go back.
export function backAction(s = {}) {
  if (s.osk) return { act: "osk" };
  if (s.grab) return { act: "grab" };
  if (s.noBack) return { act: "none" };
  const m = s.modals || [];
  if (m.length) return { act: "dialog", target: m[m.length - 1] };
  return { act: "escape" };
}

// THE ON-SCREEN KEYBOARD: rows of [label, width] (11 units a row).
export const OSK_ROWS = [
  [..."1234567890"].map(k => [k, 1]).concat([["⌫", 1]]),
  [..."QWERTYUIOP'"].map(k => [k, 1]),
  [..."ASDFGHJKL-@"].map(k => [k, 1]),
  [..."ZXCVBNM,./?"].map(k => [k, 1]),
  [["SHIFT", 2], ["CAPS", 2], ["SPACE", 3], ["ENTER", 2], ["DONE", 2]],
];
const centre = (row, i) => { let u = 0; for (let k = 0; k < i; k++) u += OSK_ROWS[row][k][1]; return u + OSK_ROWS[row][i][1] / 2; };
// {r, c} one key over -> {r, c}: left / right wrap in the row, up / down land on the key nearest
// above / below (by centre) and wrap top to bottom.
export function oskMove(p, dir) {
  const rows = OSK_ROWS.length;
  if (dir === "left" || dir === "right") { const n = OSK_ROWS[p.r].length; return { r: p.r, c: (p.c + (dir === "right" ? 1 : n - 1)) % n }; }
  const r = (p.r + (dir === "down" ? 1 : rows - 1)) % rows, x = centre(p.r, p.c);
  let c = 0, bd = Infinity;
  OSK_ROWS[r].forEach((_, i) => { const d = Math.abs(centre(r, i) - x); if (d < bd - 1e-9) { bd = d; c = i; } });
  return { r, c };
}
// A key pressed on text t with the caret at `at` -> {t, at, shift, done, enter}.
export function oskPress(s, key) {
  const { t = "", at = t.length, shift = false, caps = false } = s;
  const put = (ch) => ({ t: t.slice(0, at) + ch + t.slice(at), at: at + ch.length, shift: false, caps });
  if (key === "⌫") return at > 0 ? { t: t.slice(0, at - 1) + t.slice(at), at: at - 1, shift, caps } : { t, at, shift, caps };
  if (key === "SPACE") return put(" ");
  if (key === "SHIFT") return { t, at, shift: !shift, caps };
  if (key === "CAPS") return { t, at, shift, caps: !caps };
  if (key === "DONE") return { t, at, shift, caps, done: true };
  if (key === "ENTER") return { t, at, shift, caps, done: true, enter: true };
  return put(shift || caps || !t.trim() ? key : key.toLowerCase());   // capitalised at the start, like a phone; CAPS holds capitals
}
// a case-number field types capitals by itself: autocapitalize=characters, or a field named for the case, or the HVI-XXXXXXXX hint
export const wantsUpper = (a = {}) => String(a.autocapitalize || "").toLowerCase() === "characters" || /case/i.test(`${a.label || ""} ${a.name || ""} ${a.id || ""}`) || /^[A-Z]{2,}-X{3,}/.test(String(a.placeholder || ""));
// scrolling the focused control to the middle: its block, "start" for one taller than most of the screen
export const scrollBlock = (rect, vh) => (rect.height > vh * 0.6 ? "start" : "center");
// the hint strip lives at the bottom; where a control sits behind it, it hops to the top (unless it would cover it there too)
export function hintSide(rect, vh, hintH = 34, margin = 8) {
  if (!rect) return "bottom";
  const atBottom = rect.bottom > vh - margin - hintH && rect.top < vh - margin, atTop = rect.top < margin + hintH && rect.bottom > margin;
  return atBottom && !atTop ? "top" : "bottom";
}
// a <select> held by the pad: left / up one back, right / down one on, stopping at the ends
export const selectStep = (i, n, dir) => (n <= 0 ? -1 : Math.max(0, Math.min(n - 1, i + (dir === "left" || dir === "up" ? -1 : dir === "right" || dir === "down" ? 1 : 0))));

// ---- the page ----------------------------------------------------------------------------------
const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1']),[role=button],[role=tab],[role=option],[role=menuitem],[role=link],[contenteditable=true]";
const TEXT = /^(text|search|email|url|tel|password|number|)$/;
const isText = (el) => el && ((el.tagName === "INPUT" && TEXT.test((el.getAttribute("type") || "").toLowerCase())) || el.tagName === "TEXTAREA") && !el.readOnly && !el.disabled;
const UI = "hvi-pad-ui";

function seen(el) {
  if (!el || el.closest(`[inert],.${UI}`)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: false })) return false;
  return true;
}
function modals() {
  let list = [];
  try { list = [...document.querySelectorAll("dialog:modal,[aria-modal='true']")]; } catch { list = [...document.querySelectorAll("dialog[open],[aria-modal='true']")]; }
  return list.filter(seen);
}
const scopeEl = () => modals().pop() || document.body;
// a link that wraps has a box per line: the first line is where it is
const box = (el) => { const rs = el.getClientRects(); return rs.length > 1 ? rs[0] : el.getBoundingClientRect(); };
const rectOf = (el) => { const r = box(el); return { x: r.left, y: r.top, w: r.width, h: r.height, el }; };
const ev = (el, type, init, C = MouseEvent) => el.dispatchEvent(new C(type, { bubbles: true, cancelable: true, composed: true, view: window, ...init }));
const key = (el, k) => { const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); el.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true })); return e.defaultPrevented; };
function setValue(el, v, at) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try { el.setSelectionRange(at, at); } catch { /* email / number: no caret */ }
}
function scroller(el) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

const STYLE = `
.${UI}{position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;color:inherit;z-index:2147483646}
.${UI}[hidden]{display:none!important}
.${UI}.cur{left:0;top:0;width:22px;height:34px;pointer-events:none;will-change:transform}
.${UI}.cur svg{display:block;image-rendering:pixelated;filter:drop-shadow(2px 2px 0 var(--shadow,#000))}
.${UI}.cur.dim{opacity:.45}
.${UI}.ring{left:0;top:0;pointer-events:none;box-sizing:border-box;border:3px solid var(--accent,#4ade80);outline:2px solid var(--shadow,#000);box-shadow:0 0 0 5px color-mix(in srgb,var(--accent,#4ade80) 30%,transparent)}
.${UI}.ring.thin{border-width:2px;border-style:dashed;box-shadow:none}
.${UI}.hint{left:8px;bottom:8px;top:auto;pointer-events:none;display:flex;gap:10px;align-items:center;padding:4px 8px;background:var(--panel,#0d140d);color:var(--fg-dim,#86c9a0);border:1px solid var(--line-hi,#2f6a42);box-shadow:3px 3px 0 var(--shadow,#000);font:700 11px/1.3 var(--mono,monospace);letter-spacing:.04em;text-transform:uppercase}
.${UI}.hint b{display:inline-block;min-width:14px;padding:0 3px;margin-right:4px;text-align:center;background:var(--accent,#4ade80);color:var(--accent-ink,#06210f)}
.${UI}.hint .pad{color:var(--accent,#4ade80)}
.${UI}.osk{left:50%;bottom:44px;top:auto;transform:translateX(-50%);width:min(560px,calc(100vw - 16px));background:#c0c0c0;color:#000;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:inset -1px -1px 0 #808080,inset 1px 1px 0 #dfdfdf,4px 4px 0 var(--shadow,#000);font:700 13px/1 var(--mono,monospace)}
.${UI}.osk .t{display:flex;justify-content:space-between;background:#000080;color:#fff;padding:3px 6px;font-size:11px;letter-spacing:.06em}
.${UI}.osk .k{display:grid;grid-template-columns:repeat(11,1fr);gap:3px;padding:6px}
.${UI}.osk button{all:unset;box-sizing:border-box;height:34px;display:flex;align-items:center;justify-content:center;background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:inset -1px -1px 0 #808080;cursor:pointer;font:inherit;color:#000}
.${UI}.osk button.on{background:#000080;color:#fff;outline:1px dotted #fff;outline-offset:-5px}
.${UI}.osk button.sh{border-color:#000 #fff #fff #000;box-shadow:inset 1px 1px 0 #808080}
.${UI}.osk .g{padding:0 6px 6px;font-size:10px;color:#202020;letter-spacing:.04em}
html.hvi-pad-on [data-pad-hover]{outline:2px dotted var(--accent,#4ade80);outline-offset:1px}
@media (prefers-reduced-motion:reduce){.${UI}.cur{will-change:auto}}
`;
// a pixel arrow at 2x (TV distance), drawn as runs: the theme's shadow keyline, its text colour inside
const ARROW = ["X", "XX", "XoX", "XooX", "XoooX", "XooooX", "XoooooX", "XooooooX", "XoooooooX", "XooooooooX", "XoooooXXXXX", "XooXooX", "XoX XooX", "XX  XooX", "X    XooX", "     XooX", "      XX"];
function arrowSvg() {
  let d = "", f = "";
  ARROW.forEach((row, y) => { [...row].forEach((ch, x) => { if (ch === "X") d += `M${x} ${y}h1v1h-1z`; else if (ch === "o") f += `M${x} ${y}h1v1h-1z`; }); });
  return `<svg width="22" height="34" viewBox="0 0 11 17" shape-rendering="crispEdges" aria-hidden="true"><path d="${f}" fill="var(--fg,#c8f5d8)"/><path d="${d}" fill="var(--shadow,#000)"/></svg>`;
}

let started = false;
export function start() {
  if (started || typeof document === "undefined") return;
  started = true;
  const st = document.createElement("style"); st.textContent = STYLE; document.head.appendChild(st);
  const mk = (cls, html = "") => { const d = document.createElement("div"); d.className = `${UI} ${cls}`; d.setAttribute("aria-hidden", "true"); d.innerHTML = html; d.hidden = true; if ("popover" in d) d.popover = "manual"; document.body.appendChild(d); return d; };
  const ring = mk("ring"), cur = mk("cur", arrowSvg()), hint = mk("hint"), osk = mk("osk");
  const els = [ring, cur, hint, osk];
  const show = (d, on) => { if (d.hidden === !on) return; d.hidden = !on; if (d.popover) { try { on ? d.showPopover() : d.hidePopover(); } catch { /* not connected */ } } };
  // a modal dialog opened since: lift ours back above it in the top layer
  const restack = () => { for (const d of els) if (!d.hidden && d.popover) { try { d.hidePopover(); d.showPopover(); } catch { /* fine */ } } };

  const P = { on: false, prev: null, last: 0, x: innerWidth / 2, y: innerHeight / 2, t: 0, emph: "cursor", src: "cursor", rep: { dir: null, t: 0 }, rep2: { dir: null, t: 0 }, rep3: { dir: null, t: 0 },
    hover: null, hot: null, osk: null, grab: null, sel: null, lt: 0, rt: 0, family: "generic", hops: 0, topM: null, targets: [], tAt: 0, hintKey: "", active: false };
  addEventListener("hashchange", () => { P.hops++; });
  const off = (e) => { if (!e.isTrusted || !P.on) return; if (e.type === "pointermove" && !(Math.abs(e.movementX) + Math.abs(e.movementY))) return; P.on = false; paint(); };
  addEventListener("pointermove", off, true); addEventListener("pointerdown", off, true); addEventListener("touchstart", off, { capture: true, passive: true });

  // ---- hover, as with a mouse
  function hoverAt() {
    const el = document.elementFromPoint(P.x, P.y);
    const at = { clientX: P.x, clientY: P.y };
    if (el !== P.hover) {
      const was = P.hover;
      if (was) { ev(was, "pointerout", { ...at, relatedTarget: el, pointerType: "mouse" }, PointerEvent); ev(was, "mouseout", { ...at, relatedTarget: el }); was.dispatchEvent(new MouseEvent("mouseleave", { ...at, relatedTarget: el })); }
      if (el) { ev(el, "pointerover", { ...at, relatedTarget: was, pointerType: "mouse" }, PointerEvent); ev(el, "mouseover", { ...at, relatedTarget: was }); el.dispatchEvent(new MouseEvent("mouseenter", { ...at, relatedTarget: was })); }
      P.hover = el;
    }
    if (el) { ev(el, "pointermove", { ...at, pointerType: "mouse" }, PointerEvent); ev(el, "mousemove", at); }
    const hot = el?.closest?.(FOCUSABLE) || null;
    if (hot !== P.hot) { P.hot?.removeAttribute("data-pad-hover"); hot?.setAttribute("data-pad-hover", ""); P.hot = hot; }
    return hot;
  }
  function clearHover() { P.hot?.removeAttribute("data-pad-hover"); P.hot = null; }

  // ---- magnetism: settle on a small control within reach when the stick lets go
  function snap() {
    const now = performance.now();
    if (now - P.tAt > 300) {
      P.tAt = now;
      P.targets = [...scopeEl().querySelectorAll(FOCUSABLE)].map(e => [e.getBoundingClientRect(), e.matches("[data-pad-row]")]).filter(([r, row]) => r.width > 0 && (row || r.width < 320) && r.height < 160 && r.bottom > 0 && r.top < innerHeight).map(([r]) => r);
    }
    let best = null, bd = 28;
    for (const r of P.targets) {
      const dx = Math.max(r.left - P.x, 0, P.x - r.right), dy = Math.max(r.top - P.y, 0, P.y - r.bottom), d = Math.hypot(dx, dy);
      if (d < bd || (d === 0 && best && Math.hypot(r.left + r.width / 2 - P.x, r.top + r.height / 2 - P.y) < Math.hypot(best[0] - P.x, best[1] - P.y))) { bd = d; best = [r.left + r.width / 2, r.top + r.height / 2]; }
    }
    return best;
  }

  // ---- focus
  function candidates() { return [...scopeEl().querySelectorAll(FOCUSABLE)].filter(seen); }
  function focusEl(el) {
    try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
    el.scrollIntoView?.({ block: scrollBlock(el.getBoundingClientRect(), innerHeight), inline: "nearest" });
    const r = box(el);
    P.x = r.left + Math.min(r.width / 2, 24); P.y = r.top + r.height / 2;
    P.src = "focus"; P.t = 0;
    hoverAt();
  }
  const focused = () => { const a = document.activeElement; return a && a !== document.body && !a.closest(`.${UI}`) && scopeEl().contains(a) && seen(a) ? a : null; };
  function nav(dir) {
    const a = focused();
    if (a && a.tagName === "INPUT" && a.type === "range" && (dir === "left" || dir === "right")) {
      dir === "right" ? a.stepUp() : a.stepDown();
      a.dispatchEvent(new Event("input", { bubbles: true })); a.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const list = candidates();
    const from = a && P.src === "focus" ? rectOf(a) : { x: P.x - 1, y: P.y - 1, w: 2, h: 2 };
    const rs = list.map(rectOf);
    const i = pickNeighbour(a && P.src === "focus" ? rs[list.indexOf(a)] || from : from, rs, dir);
    if (i >= 0) focusEl(list[i]);
    else if (dir === "up" || dir === "down") { const s = scroller(a || document.body); s.scrollBy({ top: (dir === "down" ? 1 : -1) * innerHeight * 0.4 }); }
  }

  // ---- A
  function activate(el, viaCursor) {
    if (!el) return;
    const cell = el.closest?.(".fr-cell.edit");
    if (cell && (el === cell || !el.closest("button"))) { grab(cell); return; }
    const f = el.closest?.(FOCUSABLE) || el;
    if (isText(f)) { focusEl(f); openOsk(f); return; }
    if (f.tagName === "SELECT") {
      if (P.sel?.el === f) { P.sel = null; return; }   // A again: that is the choice
      focusEl(f);
      P.sel = { el: f, orig: f.selectedIndex };
      return;
    }
    if (viaCursor) {
      const at = { clientX: P.x, clientY: P.y, button: 0, buttons: 1, pointerType: "mouse", isPrimary: true };
      ev(el, "pointerdown", at, PointerEvent); ev(el, "mousedown", at);
      if (f !== el || f.matches?.(FOCUSABLE)) { try { f.focus({ preventScroll: true }); } catch { /* fine */ } }
      ev(el, "pointerup", { ...at, buttons: 0 }, PointerEvent); ev(el, "mouseup", { ...at, buttons: 0 });
      ev(el, "click", { ...at, buttons: 0, detail: 1 });
    } else f.click();
  }

  // ---- ARRANGE by pad
  const cellOf = () => (P.grab ? document.querySelector(`[data-wid="${CSS.escape(P.grab)}"]`) : null);
  function grab(cell) { P.grab = cell.dataset.wid; cell.dispatchEvent(new CustomEvent("hvi-pad-arrange", { detail: "grab", bubbles: true })); try { cell.focus({ preventScroll: true }); } catch { /* fine */ } }
  function grabDo(what) { const c = cellOf(); if (c) c.dispatchEvent(new CustomEvent("hvi-pad-arrange", { detail: what, bubbles: true })); if (what !== "grab") P.grab = null; }
  function selectTo(i) {
    const el = P.sel?.el; if (!el || i < 0 || i === el.selectedIndex) return;
    el.selectedIndex = i; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const ARROWS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

  // ---- the keyboard
  let keyEls = [];
  function openOsk(input) {
    P.osk = { input, r: 1, c: 0, shift: false, caps: wantsUpper({ autocapitalize: input.getAttribute("autocapitalize"), label: input.getAttribute("aria-label"), name: input.name, id: input.id, placeholder: input.placeholder }) };
    osk.innerHTML = `<div class="t"><span>KEYBOARD</span><span>${(input.getAttribute("aria-label") || input.placeholder || input.name || "").toUpperCase().slice(0, 40)}</span></div><div class="k"></div><div class="g"></div>`;
    const k = osk.querySelector(".k");
    keyEls = OSK_ROWS.map((row, r) => row.map(([label, w], c) => {
      const b = document.createElement("button"); b.type = "button"; b.tabIndex = -1; b.textContent = label; b.style.gridColumn = `span ${w}`;
      b.addEventListener("mousedown", e => e.preventDefault());
      b.addEventListener("click", () => { P.osk.r = r; P.osk.c = c; press(label); });
      k.appendChild(b); return b;
    }));
    // out of the field's way: under it, or over it when the field sits low
    const r = input.getBoundingClientRect();
    osk.style.top = r.bottom > innerHeight * 0.55 ? "48px" : "auto";
    osk.style.bottom = r.bottom > innerHeight * 0.55 ? "auto" : "44px";
    paintOsk();
  }
  function press(label) {
    const o = P.osk; if (!o) return;
    const el = o.input;
    let at = el.value.length; try { if (el.selectionStart != null) at = el.selectionStart; } catch { /* no caret */ }
    const r = oskPress({ t: el.value, at, shift: o.shift, caps: o.caps }, label);
    o.shift = r.shift; o.caps = r.caps;
    if (r.t !== el.value) {
      if (el.maxLength > 0 && r.t.length > el.maxLength) return;
      setValue(el, r.t, r.at);
    }
    if (r.enter) { const used = key(el, "Enter"); if (!used && el.form) { try { el.form.requestSubmit(); } catch { /* no submit */ } } }
    if (r.done) closeOsk(); else paintOsk();
  }
  function closeOsk() { P.osk = null; show(osk, false); }
  function paintOsk() {
    const o = P.osk; if (!o) return;
    keyEls.forEach((row, r) => row.forEach((b, c) => { b.classList.toggle("on", r === o.r && c === o.c); if (OSK_ROWS[r][c][0] === "SHIFT") b.classList.toggle("sh", o.shift); if (OSK_ROWS[r][c][0] === "CAPS") b.classList.toggle("sh", o.caps); }));
    const g = GLYPHS[P.family] || GLYPHS.generic;
    osk.querySelector(".g").textContent = `${g.act} TYPE · ${g.find} DELETE · ${g.labels} SPACE · ${g.turnL} SHIFT/CAPS · ${g.start} DONE · ${g.back} CLOSE`;
  }

  // ---- B
  function back() {
    const ms = modals();
    const b = backAction({ osk: Boolean(P.osk), grab: Boolean(P.grab), modals: ms, noBack: P.noBack });
    if (b.act === "osk") return closeOsk();
    if (b.act === "grab") return grabDo("cancel");
    if (b.act === "dialog") {
      const d = b.target;
      if (d.tagName === "DIALOG") { const c = new Event("cancel", { cancelable: true }); d.dispatchEvent(c); if (!c.defaultPrevented) d.close(); }
      else key(document.activeElement && d.contains(document.activeElement) ? document.activeElement : d, "Escape");
      return;
    }
    if (b.act !== "escape") return;
    // Escape, as a keyboard would; if nothing on the page went away, it was a step back
    let gone = false;
    const mo = new MutationObserver(rs => { if (rs.some(r => [...r.removedNodes].some(n => n.nodeType === 1 && !n.classList?.contains(UI)))) gone = true; });
    mo.observe(document.body, { childList: true, subtree: true });
    const used = key(document.activeElement || document.body, "Escape");
    setTimeout(() => {
      mo.disconnect();
      if (used || gone) return;
      const a = focused();
      if (a && isText(a)) { a.blur(); return; }
      if (P.hops > 0) history.back();
      else if (location.hash && location.hash !== "#") location.hash = "";
    }, 80);
  }

  // ---- LB / RB: tabs, else sections
  function tabStep(k) {
    const sc = scopeEl(), a = document.activeElement;
    const tl = a?.closest?.("[role=tablist]") || [...sc.querySelectorAll("[role=tablist]")].find(seen);
    if (tl) {
      const tabs = [...tl.querySelectorAll("[role=tab]")].filter(t => seen(t) && !t.disabled && t.getAttribute("aria-disabled") !== "true");
      if (tabs.length) {
        let i = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
        if (i < 0) i = tabs.indexOf(a);
        const n = tabs[(i + k + tabs.length) % tabs.length];
        focusEl(n); n.click(); return;
      }
    }
    const hs = [...sc.querySelectorAll("h1,h2,h3,section[aria-label],[role=region]")].filter(seen);
    if (!hs.length) return;
    const tops = hs.map(h => h.getBoundingClientRect().top);
    let i = k > 0 ? tops.findIndex(t => t > 12) : tops.map((t, j) => [t, j]).filter(([t]) => t < -12).pop()?.[1] ?? -1;
    if (i < 0) return;
    const h = hs[i];
    h.scrollIntoView?.({ block: "start" });
    const f = h.matches(FOCUSABLE) ? h : h.querySelector(FOCUSABLE) || candidates().find(c => h.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (f) focusEl(f);
  }

  // ---- paint
  function paint(owner = P.active) {
    const on = P.on && owner;
    document.documentElement.classList.toggle("hvi-pad-on", on);
    if (!on) clearHover();
    show(cur, on && !P.grab);
    cur.classList.toggle("dim", P.emph === "focus");
    if (on) cur.style.transform = `translate(${Math.round(P.x) - 1}px,${Math.round(P.y) - 1}px)`;
    const a = on ? (P.grab ? cellOf() : focused()) : null;
    show(ring, Boolean(a));
    if (a) {
      const r = box(a);
      Object.assign(ring.style, { transform: `translate(${Math.round(r.left - 4)}px,${Math.round(r.top - 4)}px)`, width: `${Math.round(r.width + 8)}px`, height: `${Math.round(r.height + 8)}px` });
      ring.classList.toggle("thin", P.emph === "cursor" && P.src !== "focus" && !P.grab);
    }
    show(osk, on && Boolean(P.osk));
    // the hint strip
    let hk = "";
    if (on && !P.osk) {
      const g = GLYPHS[P.family] || GLYPHS.generic;
      const y = [...scopeEl().querySelectorAll("[data-pad-y]")].find(seen);
      const yl = y ? (y.getAttribute("data-pad-y") || y.textContent || "").trim().toUpperCase().slice(0, 18) : "";
      const parts = P.sel ? [[g.lstick, "CHOOSE"], [g.act, "OK"], [g.back, "CANCEL"]] : P.grab ? [[g.lstick, "MOVE"], [`${g.zoomOut}/${g.zoomIn}`, "SIZE"], [g.act, "DROP"], [g.back, "CANCEL"]]
        : [[g.act, "SELECT"], ...(P.noBack ? [] : [[g.back, "BACK"]]), ...(yl ? [[g.labels, yl]] : []), [g.start, "MENU"], [g.select, P.emph === "cursor" ? "FOCUS" : "CURSOR"]];
      hk = `<span class="pad">PAD</span>` + parts.map(([b, t]) => `<span><b>${b}</b>${t}</span>`).join("");
    }
    if (hk !== P.hintKey) { P.hintKey = hk; hint.innerHTML = hk; }
    show(hint, Boolean(hk));
    if (hk) {   // the strip hops to the top when the focused control sits behind it
      const f = P.grab ? cellOf() : focused(), top = hintSide(f ? box(f) : null, innerHeight) === "top";
      hint.style.top = top ? "8px" : "auto"; hint.style.bottom = top ? "auto" : "8px";
    }
  }

  // ---- the loop
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const pad = readPad();
    const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0;
    P.last = now;
    if (!pad.connected) {
      if (P.on) { P.on = false; P.osk = null; P.grab = null; P.sel = null; paint(); }
      cancelAnimationFrame(raf); raf = 0; P.prev = null; P.last = 0;
      return;
    }
    P.family = pad.family;
    const pp = pressedSince(P.prev || pad.held, pad.held);
    P.prev = pad.held;
    const ltE = pad.lt > 0.5 && P.lt <= 0.5, rtE = pad.rt > 0.5 && P.rt <= 0.5; P.lt = pad.lt; P.rt = pad.rt;
    const ms = modals(), top = ms[ms.length - 1] || null;
    const own = ownerOf({ route: location.hash, owns: [...document.querySelectorAll("[data-pad-own]")].filter(seen).map(e => e.getAttribute("data-pad-own") || "own"), modal: Boolean(top) });
    P.noBack = own.noBack;
    if (!own.active) { if (P.active) { P.active = false; P.osk = null; P.sel = null; if (P.grab) grabDo("cancel"); paint(false); } return; }
    P.active = true;
    if (top !== P.topM) { P.topM = top; restack(); }
    const busy = Object.values(pp).some(Boolean) || pad.lmag > 0 || pad.rmag > 0 || pad.lt > 0.05 || pad.rt > 0.05;
    if (!P.on) {
      if (!busy) return;
      P.on = true;   // the press that brings the pointer back only shows it
      const a = focused(); if (a && P.src === "focus") { const r = a.getBoundingClientRect(); P.x = r.left + r.width / 2; P.y = r.top + r.height / 2; }
      paint(); return;
    }
    // directions: the d-pad, the right stick, and (in the keyboard and a held window) the left stick
    const d1 = stickStep(P.rep, pad.dx, pad.dy, dt); P.rep = d1.rep;
    const d2 = stickStep(P.rep2, pad.rx, pad.ry, dt); P.rep2 = d2.rep;
    const modal = P.osk || P.grab || P.sel;
    const d3 = modal ? stickStep(P.rep3, pad.lx, pad.ly, dt) : { rep: { dir: null, t: 0 }, dir: null }; P.rep3 = d3.rep;
    const dir = d1.dir || d2.dir || d3.dir;

    if (P.osk) {
      const o = P.osk;
      if (!document.contains(o.input)) { closeOsk(); paint(); return; }
      if (dir) { const n = oskMove(o, dir); o.r = n.r; o.c = n.c; paintOsk(); }
      if (pp.act) press(OSK_ROWS[o.r][o.c][0]);
      else if (pp.find) press("⌫");
      else if (pp.labels) press("SPACE");
      else if (pp.turnL) press("SHIFT");
      else if (pp.turnR) press("CAPS");
      else if (pp.start) press("DONE");
      else if (pp.back) back();
      paint(); return;
    }
    if (P.sel) {
      const el = P.sel.el;
      if (!document.contains(el) || el.disabled) { P.sel = null; paint(); return; }
      if (dir) selectTo(selectStep(el.selectedIndex, el.options.length, dir));
      if (pp.act) P.sel = null;
      else if (pp.back) { selectTo(P.sel.orig); P.sel = null; }
      paint(); return;
    }
    if (P.grab) {
      const c = cellOf();
      if (!c || !c.classList.contains("edit")) { P.grab = null; paint(); return; }
      if (dir) key(c, ARROWS[dir]);
      if (ltE) key(c, "-");
      if (rtE) key(c, "+");
      if (pp.act) grabDo("drop");
      else if (pp.back) back();
      const r = c.getBoundingClientRect(); P.x = r.left + r.width / 2; P.y = r.top + r.height / 2;
      paint(); return;
    }

    // the cursor
    let moved = false;
    if (pad.lmag > 0) P.src = "cursor";
    const hot0 = P.hot;
    const sn = pad.lmag > 0 || P.src === "focus" ? null : snap();
    const c = stepCursor(P, pad.lx, pad.ly, dt, { w: innerWidth, h: innerHeight, over: Boolean(hot0), snap: sn, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches });
    if (Math.abs(c.x - P.x) > 0.05 || Math.abs(c.y - P.y) > 0.05) moved = true;
    P.x = c.x; P.y = c.y; P.t = c.t;
    if (c.ey) scroller(document.elementFromPoint(P.x, P.y) || document.body).scrollBy(0, c.ey * 900 * dt);
    if (moved) hoverAt();
    if (dir) nav(dir);
    // the triggers scroll
    const sv = (pad.rt - pad.lt) * 1400 * dt;
    if (Math.abs(sv) > 0.1) { const base = P.src === "focus" ? focused() : document.elementFromPoint(P.x, P.y); scroller(base || document.body).scrollBy(0, sv); }
    if (pp.act) { if (P.src === "focus" && focused()) activate(focused(), false); else activate(document.elementFromPoint(P.x, P.y), true); }
    if (pp.back) back();
    if (pp.start) { const m = document.querySelector(".ui-head-mark"); if (m) m.click(); else location.hash = ""; }
    if (pp.select) P.emph = P.emph === "cursor" ? "focus" : "cursor";
    if (pp.turnL || pp.turnR) tabStep(pp.turnR ? 1 : -1);
    if (pp.labels) { const y = [...scopeEl().querySelectorAll("[data-pad-y]")].find(seen); if (y) activate(y, false); }
    paint();
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener("gamepadconnected", wake);
  wake();
}
