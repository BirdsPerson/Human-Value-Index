// A game controller, through the browser's Gamepad API. Pure apart from the navigator it is
// handed (scripts/check-control.mjs passes a mock getGamepads()).
//
// The "standard" mapping (https://w3c.github.io/gamepad/#remapping) names buttons by where
// they sit, not what they are called: buttons[0] is the bottom face button, [1] the right,
// [2] the left, [3] the top; [4]/[5] the bumpers, [6]/[7] the triggers, [8] Back/Select,
// [9] Start, [12..15] the d-pad; axes[0]/[1] the left stick (x right, y down).
// Xbox and PlayStation confirm with the bottom button (A, cross) and back out with the right
// (B, circle). Nintendo is the other way round (A is on the right), so a Switch pad swaps.
// A pad without the standard mapping gets the same indices and a best effort.

export const DEADZONE = 0.2;
const BTN = { bottom: 0, right: 1, left: 2, top: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, up: 12, down: 13, left_d: 14, right_d: 15 };

// "xbox" | "playstation" | "switch" | "generic", from the id string the browser reports.
export function familyOf(id = "") {
  const s = String(id).toLowerCase();
  if (/nintendo|pro controller|joy-?con|057e/.test(s)) return "switch";
  if (/xbox|xinput|microsoft|045e/.test(s)) return "xbox";
  if (/playstation|dualshock|dualsense|sony|054c|wireless controller/.test(s)) return "playstation";   // a DualShock 4 is just "Wireless Controller"
  return "generic";
}
// What each action is called on that pad, for the legend.
export const GLYPHS = {
  xbox: { act: "A", back: "B", start: "MENU", turnL: "LB", turnR: "RB", run: "RT" },
  playstation: { act: "✕", back: "○", start: "OPTIONS", turnL: "L1", turnR: "R1", run: "R2" },
  switch: { act: "A", back: "B", start: "+", turnL: "L", turnR: "R", run: "ZR" },
  generic: { act: "A", back: "B", start: "START", turnL: "LB", turnR: "RB", run: "RT" },
};

// Radial dead zone, rescaled so movement starts from zero at its edge; clamped to the circle.
export function deadzone(x, y, dz = DEADZONE) {
  const m = Math.hypot(x || 0, y || 0);
  if (m <= dz) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, (m - dz) / (1 - dz));
  return { x: (x / m) * mag, y: (y / m) * mag, mag };
}

const down = (pad, i) => { const b = pad.buttons?.[i]; return Boolean(b && (typeof b === "object" ? b.pressed || b.value > 0.5 : b > 0.5)); };

// The first connected pad -> {connected, index, id, family, x, y, mag, run, held: {...}} or
// {connected: false}. The left stick and the d-pad both steer (the d-pad at full tilt).
export function readPad(nav = globalThis.navigator) {
  let pads = [];
  try { pads = nav?.getGamepads ? Array.from(nav.getGamepads() || []) : []; } catch { pads = []; }
  const pad = pads.find(p => p && p.connected !== false);
  if (!pad) return { connected: false };
  const family = familyOf(pad.id);
  const swap = family === "switch";
  let s = deadzone(pad.axes?.[0] || 0, pad.axes?.[1] || 0);
  const dx = (down(pad, BTN.right_d) ? 1 : 0) - (down(pad, BTN.left_d) ? 1 : 0), dy = (down(pad, BTN.down) ? 1 : 0) - (down(pad, BTN.up) ? 1 : 0);
  if (dx || dy) { const n = Math.hypot(dx, dy); s = { x: dx / n, y: dy / n, mag: 1 }; }
  const held = {
    act: down(pad, swap ? BTN.right : BTN.bottom),
    back: down(pad, swap ? BTN.bottom : BTN.right),
    start: down(pad, BTN.start),
    turnL: down(pad, BTN.lb), turnR: down(pad, BTN.rb),
    run: down(pad, BTN.rt) || down(pad, BTN.left),
  };
  return { connected: true, index: pad.index ?? 0, id: pad.id || "", family, mapping: pad.mapping || "", x: s.x, y: s.y, mag: s.mag, run: held.run || s.mag >= 0.92, held };
}

// Buttons pressed since the last poll (edges, so a held A is one press). prev: the last
// poll's held map (or null) -> {act, back, start, turnL, turnR}.
export function pressedSince(prev, now) {
  const out = {};
  for (const k of ["act", "back", "start", "turnL", "turnR"]) out[k] = Boolean(now?.[k] && !prev?.[k]);
  return out;
}
