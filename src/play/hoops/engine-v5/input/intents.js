// THE COURTS engine, input/intents.js: the input frame: the 17-bit court-axis mask (BTN) and the right stick's codes.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.

export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, X: 16, A: 32, Y: 64, B: 128, RT: 256, LT: 512, LB: 1024, RSU: 2048, RSD: 4096, RSL: 8192, RSR: 16384, SPIN: 32768, RB: 65536 };
export const RS = BTN.RSU | BTN.RSD | BTN.RSL | BTN.RSR;
export const dirCode = (m) => { const dx = (m & BTN.RSR ? 1 : 0) - (m & BTN.RSL ? 1 : 0), dy = (m & BTN.RSU ? 1 : 0) - (m & BTN.RSD ? 1 : 0); return dx || dy ? (dx + 1) * 3 + (dy + 1) : 0; };
export const codeXY = (c) => [Math.floor(c / 3) - 1, (c % 3) - 1];
