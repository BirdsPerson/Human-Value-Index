// The input word, per seat, 22 bits (docs/design/DUNGEON.md 3.9):
//   bits 0-3   heading (16-way; 0 = east, counting clockwise on screen, y down)
//   bits 4-5   magnitude: 0 still, 1 walk, 2 run
//   bits 6-11  buttons: ATTACK, ROLL, TOOL, INTERACT, USE, AIM-LOCK
//   bits 12-15 slot: the pack slot USE acts on (0-11)
//   bits 16-19 aim heading, bit 20 aim valid (an optional right stick; zero in D1)
//   bit 21     spare
// Menus and pause never enter the word.
export const BTN = { ATTACK: 1 << 6, ROLL: 1 << 7, TOOL: 1 << 8, INTERACT: 1 << 9, USE: 1 << 10, LOCK: 1 << 11 };
export const BTN_MASK = 0xfc0;
export function pack({ head = 0, mag = 0, attack = false, roll = false, tool = false, interact = false, use = false, lock = false, slot = 0, aim = 0, aimOn = false } = {}) {
  return ((head & 15) | ((mag & 3) << 4) | (attack ? BTN.ATTACK : 0) | (roll ? BTN.ROLL : 0) | (tool ? BTN.TOOL : 0) | (interact ? BTN.INTERACT : 0)
    | (use ? BTN.USE : 0) | (lock ? BTN.LOCK : 0) | ((slot & 15) << 12) | ((aim & 15) << 16) | (aimOn ? 1 << 20 : 0)) >>> 0;
}
export function unpack(w) {
  return { head: w & 15, mag: (w >> 4) & 3, attack: (w & BTN.ATTACK) !== 0, roll: (w & BTN.ROLL) !== 0, tool: (w & BTN.TOOL) !== 0, interact: (w & BTN.INTERACT) !== 0,
    use: (w & BTN.USE) !== 0, lock: (w & BTN.LOCK) !== 0, slot: (w >> 12) & 15, aim: (w >> 16) & 15, aimOn: (w & (1 << 20)) !== 0 };
}
export const IDLE = 0;
// The 16 headings as unit vectors (written out: no trig in the engine). k * 22.5 degrees, y down.
const C1 = 0.9238795325112867, S1 = 0.3826834323650898, R2 = 0.7071067811865476;
export const HEAD = [
  [1, 0], [C1, S1], [R2, R2], [S1, C1], [0, 1], [-S1, C1], [-R2, R2], [-C1, S1],
  [-1, 0], [-C1, -S1], [-R2, -R2], [-S1, -C1], [0, -1], [S1, -C1], [R2, -R2], [C1, -S1],
];
// The heading nearest a vector (by the largest dot product; ties to the lower index).
export function headingOf(x, y) { let best = 0, bd = -2; for (let k = 0; k < 16; k++) { const d = HEAD[k][0] * x + HEAD[k][1] * y; if (d > bd) { bd = d; best = k; } } return best; }
