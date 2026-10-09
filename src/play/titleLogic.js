// The pure half of src/play/TitleScreen.jsx: the front menu's rows, the LIVE links for each sport,
// and what a key or a pad press does. No DOM, no React, so scripts/check-titlescreen.mjs can test
// it under plain node.
import { eventsBetween, statusOf, whenText } from "../tournament/calendar.js";

// The rows the front menu knows by name (their default labels), in the order a game usually passes
// them. A game turns a row on by passing it; any other key is a custom row. Rows show in the order passed.
export const FRONT = [
  ["play", "PLAY"],
  ["modes", "MODES"],
  ["team", "TEAM SELECT"],
  ["live", "LIVE"],
  ["settings", "SETTINGS"],
  ["controls", "CONTROLS"],
  ["back", "BACK TO PLAY"],
];
const LABEL = Object.fromEntries(FRONT);
const HREF = { back: "#play" };

// rows: { [id]: fn | "#href" | true | false | null | <Legend/> | [items] | {label, onSelect, href, hint,
//         items, legend, value, cycle, art, disabled} }
//   fn          the row runs it                 "#href"   the row is a link
//   true        the row with its default link (back -> #play); nothing else
//   [items]     a sub-list (MODES, TEAM SELECT, LIVE, SETTINGS): each item is the same shape
//   <Legend/>   (CONTROLS) the row opens the legend inside the menu
//   value       shown at the right ("ROOKIE"); cycle(dir) changes it (LEFT / RIGHT, or SELECT = +1)
//   false/null  no row. A sub-list with nothing in it is no row either (a sport with no LIVE).
// -> [{id, label, onSelect?, href?, items?, legend?, value?, cycle?, hint?, art?, disabled?}]
export function frontItems(rows = {}, top = true) {
  const out = [];
  const list = Array.isArray(rows) ? rows.map((v, i) => [v?.id ?? `i${i}`, v]) : Object.entries(rows || {});
  for (const [id, v] of list) {
    if (v == null || v === false) continue;
    let it = { id: String(id), label: (top && LABEL[id]) || String(id).toUpperCase() };
    if (typeof v === "function") it.onSelect = v;
    else if (typeof v === "string") it.href = v;
    else if (v === true) { if (top && HREF[id]) it.href = HREF[id]; }
    else if (Array.isArray(v)) it.items = v;
    else if (typeof v === "object" && v.$$typeof) it.legend = v;   // a React element
    else if (typeof v === "object") it = { ...it, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
    if (top && id === "back" && it.href == null && !it.onSelect) it.href = HREF.back;
    if (it.items) { it.items = frontItems(it.items, false); if (!it.items.length) continue; }
    if (!it.onSelect && !it.href && it.legend == null && !it.items && !it.cycle && !it.disabled && it.value == null) continue;
    out.push(it);
  }
  return out;
}

// What SELECT on a row does -> "run" | "link" | "open" (a sub-list) | "legend" | "cycle" | null.
export function selectKind(it) {
  if (!it || it.disabled) return null;
  if (it.onSelect) return "run";
  if (it.href) return "link";
  if (it.items) return "open";
  if (it.legend != null) return "legend";
  if (it.cycle) return "cycle";
  return null;
}

// Cycle through a list of [value, label] pairs: next(list, current, dir) -> the value dir steps away.
export function cycleOf(list, cur, dir = 1) {
  const keys = list.map(x => (Array.isArray(x) ? x[0] : x));
  const i = Math.max(0, keys.indexOf(cur));
  return keys[(((i + dir) % keys.length) + keys.length) % keys.length];
}

// A keydown -> "up" | "down" | "left" | "right" | "first" | "last" | "select" | "back" | null.
export function titleKey(key) {
  switch (key) {
    case "ArrowUp": case "w": case "W": case "k": return "up";
    case "ArrowDown": case "s": case "S": case "j": return "down";
    case "ArrowLeft": case "a": case "A": case "h": return "left";
    case "ArrowRight": case "d": case "D": case "l": return "right";
    case "Home": case "PageUp": return "first";
    case "End": case "PageDown": return "last";
    case "Enter": case " ": case "z": case "Z": return "select";
    case "Escape": case "Backspace": case "x": case "X": return "back";
    default: return null;
  }
}

// Gamepad edges for the title and its menu. prev: the last call's `next` (or null); raw: {x, y, act,
// back, start} from readPad() (act/back already Nintendo-swapped). A selects on RELEASE, and only if
// it went down while the screen was up (the A that picked the game on #play does not carry in);
// START fires on its press (any START held over from before is ignored the same way).
// -> {action: "up" | "down" | "left" | "right" | "select" | "back" | "start" | null, next}
export function padTitle(prev, raw) {
  const ax = (v) => (v <= -0.5 ? -1 : v >= 0.5 ? 1 : 0);
  const now = { x: raw?.x || 0, y: raw?.y || 0, act: Boolean(raw?.act), back: Boolean(raw?.back), start: Boolean(raw?.start), armed: Boolean(prev?.armed) };
  if (now.act && prev && !prev.act) now.armed = true;
  let action = null;
  const dy = ax(now.y), dx = ax(now.x);
  if (dy && dy !== ax(prev?.y || 0)) action = dy < 0 ? "up" : "down";
  else if (dx && dx !== ax(prev?.x || 0)) action = dx < 0 ? "left" : "right";
  else if (prev?.act && !now.act && prev.armed) { action = "select"; now.armed = false; }
  else if (now.start && prev && !prev.start) action = "start";
  else if (now.back && prev && !prev.back) action = "back";
  return { action, next: now };
}

// The next row to focus, wrapping, skipping disabled rows. delta: -1 | +1 | "first" | "last".
export function stepFocus(items, i, delta) {
  const n = items.length;
  if (!n) return -1;
  const ok = (k) => !items[k]?.disabled;
  if (delta === "first" || delta === "last") {
    const order = [...Array(n).keys()];
    if (delta === "last") order.reverse();
    return order.find(ok) ?? -1;
  }
  for (let s = 1; s <= n; s++) { const k = (((i + delta * s) % n) + n) % n; if (ok(k)) return k; }
  return -1;
}

// The title, broken for the big pixel letters: at most `max` characters a line, on spaces.
export function titleLines(title, max = 10) {
  const words = String(title || "").toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const w of words) {
    const l = lines[lines.length - 1];
    if (l && (l + " " + w).length <= max) lines[lines.length - 1] = l + " " + w;
    else lines.push(w);
  }
  return lines.length ? lines : [""];
}

// ---- LIVE: where each sport's real thing is ----------------------------------------------------------
// The open tournaments (src/tournament/calendar.js) for golf, bowling and fishing; the leagues'
// tabs (src/city/LeagueHub.jsx, #city/league/<tab>) for the sports the city plays. A sport with
// neither gets no LIVE row (frontItems drops an empty list).
export const LEAGUE_TAB = { tennis: "tennis", basketball: "basketball", football: "football", soccer: "soccer" };
const LEAGUE_WORD = { tennis: "THE TENNIS LADDER", basketball: "THE BASKETBALL LEAGUE", football: "THE FOOTBALL LEAGUE", soccer: "THE SOCCER LEAGUE" };
const TOURNEY = new Set(["golf", "bowling", "fish"]);

// sport -> [{id, label, hint, href}], soonest first. nowMs: the clock (the check passes one).
export function liveItems(sport, nowMs = Date.now()) {
  const out = [];
  if (TOURNEY.has(sport)) {
    let evs = [];
    try { evs = eventsBetween(nowMs, nowMs + 7 * 86400000).filter(e => e.game === sport); } catch { evs = []; }
    const open = evs.filter(e => statusOf(e, nowMs) === "open"), soon = evs.filter(e => statusOf(e, nowMs) === "upcoming");
    for (const e of open.slice(0, 3)) out.push({ id: e.id, label: e.name, hint: "OPEN NOW", href: e.href });
    for (const e of soon.slice(0, Math.max(0, 3 - out.length))) {
      let when = "";
      try { when = whenText(e.opens); } catch { when = ""; }
      out.push({ id: e.id, label: e.name, hint: when ? `OPENS ${when}` : "COMING UP", href: e.href });
    }
    out.push({ id: "all-tournaments", label: "EVERY OPEN TOURNAMENT", href: "#city/league" });
  }
  if (LEAGUE_TAB[sport]) {
    out.push({ id: "league", label: `WATCH ${LEAGUE_WORD[sport]}`, hint: sport === "tennis" ? "THE TABLE" : "TODAY'S GAMES", href: `#city/league/${LEAGUE_TAB[sport]}` });
    out.push({ id: "join", label: sport === "tennis" ? "JOIN THE LADDER" : "JOIN THE LEAGUE", hint: "FROM YOUR FILE", href: "#file?at=leagues" });
  }
  return out;
}

// Returning players skip the title's drop-in: the games whose title has been seen in this browser.
const SEEN_KEY = "hvi-title-seen";
export function seenTitle(game, store = globalThis.localStorage) {
  try { return JSON.parse(store?.getItem(SEEN_KEY) || "[]").includes(game); } catch { return false; }
}
export function markTitle(game, store = globalThis.localStorage) {
  try { const a = JSON.parse(store?.getItem(SEEN_KEY) || "[]"); if (!a.includes(game)) store?.setItem(SEEN_KEY, JSON.stringify([...a, game].slice(-40))); } catch { /* the tab remembers */ }
}
