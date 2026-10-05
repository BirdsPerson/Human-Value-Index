// A 5x7 bitmap font (the classic LCD character set: five column bytes per glyph, low bit at the
// top), drawn with fillRect so the canvas never antialiases a letter. Upper case only.
const G = {
  " ": "0000000000", "!": "00005f0000", '"': "0007000700", "#": "147f147f14", "%": "2313086462", "'": "0000070000",
  "(": "001c224100", ")": "0041221c00", "*": "2a1c7f1c2a", "+": "08083e0808", ",": "0050300000", "-": "0808080808",
  ".": "0060600000", "/": "2010080402", ":": "0036360000", ";": "0056360000", "<": "0008142241", "=": "1414141414",
  ">": "0041221408", "?": "0201510906", "&": "3649562050",
  0: "3e5149453e", 1: "00427f4000", 2: "7249494946", 3: "2141494d33", 4: "1814127f10", 5: "2745454539",
  6: "3c4a494931", 7: "4121110907", 8: "3649494936", 9: "464949291e",
  A: "7c1211127c", B: "7f49494936", C: "3e41414122", D: "7f4141413e", E: "7f49494941", F: "7f09090901", G: "3e41415173",
  H: "7f0808087f", I: "00417f4100", J: "2040413f01", K: "7f08142241", L: "7f40404040", M: "7f021c027f", N: "7f0408107f",
  O: "3e4141413e", P: "7f09090906", Q: "3e4151215e", R: "7f09192946", S: "2649494932", T: "03017f0103", U: "3f4040403f",
  V: "1f2040201f", W: "3f4038403f", X: "6314081463", Y: "0304780403", Z: "6159494d43",
};
const COLS = {};
for (const [k, hex] of Object.entries(G)) COLS[k] = [0, 2, 4, 6, 8].map(i => parseInt(hex.slice(i, i + 2), 16));
export const CW = 6, CH = 8;   // advance and line height, in font pixels

export function textWidth(s, scale = 1) { return String(s).length * CW * scale - scale; }
export function drawText(ctx, s, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  const str = String(s).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const cols = COLS[str[i]] || COLS["?"];
    for (let c = 0; c < 5; c++) {
      const b = cols[c];
      if (!b) continue;
      for (let r = 0; r < 7; r++) if (b & (1 << r)) ctx.fillRect(x + (i * CW + c) * scale, y + r * scale, scale, scale);
    }
  }
}
// Wrap to a width in characters -> lines
export function wrap(s, chars) {
  const out = [];
  let line = "";
  for (const w of String(s).split(/\s+/)) {
    if ((line + " " + w).trim().length > chars) { if (line) out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}
