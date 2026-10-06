// The pure half of src/play/GameMenu.jsx: which rows a menu shows, and what a key or a pad press
// does to it. No DOM, no React, so scripts/check-gamemenu.mjs can test it under plain node.

// The rows each kind of menu knows by name (their default labels). A game turns a row on by passing
// it (see GameMenu.jsx); any other key it passes is a custom row. Rows show in the order passed.
export const ROWS = {
  end: [
    ["again", "PLAY AGAIN"],
    ["rematch", "NEW OPPONENT"],
    ["settings", "CHANGE SETTINGS"],
    ["replay", "WATCH THE REPLAY"],
    ["play", "BACK TO PLAY"],
    ["city", "BACK TO THE CITY"],
  ],
  pause: [
    ["resume", "RESUME"],
    ["restart", "RESTART"],
    ["controls", "CONTROLS"],
    ["sound", "SOUND"],
    ["quit", "QUIT TO PLAY"],
  ],
};
const HREF = { play: "#play", quit: "#play", city: "#city" };

// options: { [id]: fn | "#href" | true | false | null | {label, onSelect, href, on, hint, disabled} }
//   fn       -> the row runs it          "#href" -> the row is a link
//   true     -> the row with its default link (play/quit -> #play, city -> #city); nothing else
//   false/null/undefined -> no row
//   sound: {on, onSelect} -> "SOUND: ON" / "SOUND: OFF"
//   controls: <Legend/> (or {legend}) -> the row opens the legend inside the menu
// -> [{id, label, onSelect?, href?, hint?, disabled?}], rows with nothing to do dropped.
export function menuItems(kind, options = {}) {
  const known = ROWS[kind] || [];
  const ids = Object.keys(options || {});
  const label0 = Object.fromEntries(known);
  const out = [];
  for (const id of ids) {
    const v = options[id];
    if (v == null || v === false) continue;
    let it = { id, label: label0[id] || id.toUpperCase() };
    if (typeof v === "function") it.onSelect = v;
    else if (typeof v === "string") it.href = v;
    else if (v === true) { if (HREF[id]) it.href = HREF[id]; }
    else if (typeof v === "object" && v.$$typeof) it.legend = v;   // a React element: the CONTROLS legend
    else if (typeof v === "object") it = { ...it, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
    if (id === "city" && it.href == null && !it.onSelect) it.href = HREF.city;
    if ((id === "play" || id === "quit") && it.href == null && !it.onSelect) it.href = HREF[id];
    if (id === "sound" && typeof v === "object" && "on" in v && !v.label) it.label = `SOUND: ${v.on ? "ON" : "OFF"}`;
    if (id === "controls" && it.legend == null && !it.onSelect && !it.href) continue;   // nothing to show
    if (!it.onSelect && !it.href && it.legend == null) continue;
    out.push(it);
  }
  return out;
}

// The next row to focus, wrapping, skipping disabled rows. delta: -1 | +1 | "first" | "last".
export function moveFocus(items, i, delta) {
  const n = items.length;
  if (!n) return -1;
  const ok = (k) => !items[k]?.disabled;
  if (delta === "first" || delta === "last") {
    const order = [...Array(n).keys()];
    if (delta === "last") order.reverse();
    const k = order.find(ok);
    return k ?? -1;
  }
  for (let step = 1; step <= n; step++) {
    const k = (((i + delta * step) % n) + n) % n;
    if (ok(k)) return k;
  }
  return -1;
}

// A keydown -> "up" | "down" | "first" | "last" | "select" | "back" | null.
export function keyAction(key) {
  switch (key) {
    case "ArrowUp": case "w": case "W": case "k": return "up";
    case "ArrowDown": case "s": case "S": case "j": return "down";
    case "Home": case "PageUp": return "first";
    case "End": case "PageDown": return "last";
    case "Enter": case " ": case "z": case "Z": return "select";
    case "Escape": case "Backspace": case "x": case "X": return "back";
    default: return null;
  }
}

// Gamepad edges for a menu. prev: the last call's `next` (or null); raw: {y, act, back} from
// readPad() (y < 0 is up; act/back from readPad().held, already Nintendo-swapped).
// A selects on RELEASE, and only if it went down while the menu was open: the press that picks
// RESUME does not carry into the game, and an A held when the round ended does not pick a row.
// Start is left to the game (it already toggles its pause); the menu does not read it.
// -> {action: "up" | "down" | "select" | "back" | null, next}
export function padStep(prev, raw) {
  const dir = (s) => (s?.y <= -0.5 ? -1 : s?.y >= 0.5 ? 1 : 0);
  const now = { y: raw?.y || 0, act: Boolean(raw?.act), back: Boolean(raw?.back), armed: Boolean(prev?.armed) };
  if (now.act && prev && !prev.act) now.armed = true;
  let action = null;
  const d = dir(now);
  if (d && d !== dir(prev)) action = d < 0 ? "up" : "down";
  else if (prev?.act && !now.act && prev.armed) { action = "select"; now.armed = false; }
  else if (now.back && prev && !prev.back) action = "back";
  return { action, next: now };
}
