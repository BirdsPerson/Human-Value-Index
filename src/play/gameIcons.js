// Pixel icons for the #play tiles: 12x12 grids, one character per pixel.
// . empty   f --fg   d --fg-dim   m --fg-mute   a --accent   w --warn   h --harm
export const ICONS = {
  tennis: ["....aaaa....", "...a.d.da...", "..a.d.d.da..", "..ad.d.d.a..", "..a.d.d.da..", "...ad.d.a...", "....aaaa....", "....f.......", "...f........", "ww.f........", "wwf.........", "............"],
  golf: ["....fhhh....", "....fhhhhh..", "....fhhh....", "....f.......", "....f.......", "....f.......", "....f.......", "....f...f...", "..aaffaaaa..", ".aaa.mmaaaa.", "..aaaaaaaa..", "............"],
  hoops: [".ffffffffff.", ".f........f.", ".f..ffff..f.", ".f..f..f..f.", ".ffffffffff.", "...wwwwww...", "...d.d.d.d..", "....d.d.d...", "....d.d.d...", ".....ddd.ww.", ".........ww.", "............"],
  football: ["............", "............", "....wwww....", "..wwwwwwww..", ".wwwfwfwfww.", "wwwwffffwwww", ".wwwfwfwfww.", "..wwwwwwww..", "....wwww....", "............", "............", "............"],
  soccer: ["....ffff....", "..ffffffff..", ".fffmmmmfff.", ".ffmmmmmmff.", "fffmmmmmmfff", "fmffmmmmffmf", "fmmffffffmmf", "fmmffffffmmf", ".fffmffmfff.", ".ffmmmmmmff.", "..ffffffff..", "....ffff...."],
  fish: ["............", "............", "....aaaa....", "..aaaaaaa..a", ".aa.aaaaaaaa", ".aaaaaaaaaaa", "..aaaaaaa..a", "....aaaa....", "............", "..d.....d...", "...d...d....", "............"],
  tank: ["ffffffffffff", "f..........f", "f.d.....d..f", "f.d.aa..d..f", "f.daaaa.d..f", "f..d.aa..d.f", "f..d....d..f", "f.dd..d.dd.f", "fwwwwwwwwwwf", "ffffffffffff", ".mm......mm.", "............"],
  rook: ["............", "..ff.ff.ff..", "..ffffffff..", "..ffffffff..", "...ffffff...", "...ffffff...", "...ffffff...", "...ffffff...", "..ffffffff..", ".ffffffffff.", ".ffffffffff.", "............"],
  card: ["..ffffffff..", "..fh.....f..", "..f...h..f..", "..f..hhh.f..", "..f.hhhhhf..", "..f..hhh.f..", "..f...h..f..", "..f.....hf..", "..ffffffff..", "............", ".wwww..wwww.", "............"],
  market: ["...........a", "..........aa", ".........a.a", "....a...a...", "...a.a.a....", "..a...a.....", ".a..........", "a...........", "............", "ffffffffffff", "f.f.f.f.f.f.", "............"],
  joystick: [".....hhh....", "....hhhhh...", "....hhhhh...", ".....hhh....", "......f.....", "......f.....", "......f.....", "..ffffffff..", ".fffffffffw.", ".ffaffffffff", ".ffffffffff.", "............"],
  hunt: ["..d......d..", ".d.d....d.d.", "..ddd..ddd..", "....dddd....", "....ffff....", "...ffffff...", "..ffaffaff..", "...ffffff...", "....ffff....", ".....hh.....", ".....hh.....", "............"],
  ski: [".......ff...", ".......ff...", "......aaa...", ".....aaaa.d.", "....d.aa..d.", "...d..aa...d", "......f.f...", ".....f...f..", "w...f...ff..", ".www...ff...", "...wwwff....", "......www..."],
  bowling: ["............", "..f.....f...", ".fff...fff..", ".fhf...fhf..", "..f.....f...", ".fff...fff..", ".fff..dddd..", ".fff.dmddmd.", ".fff.dddddd.", "..f..dddddd.", "......dddd..", "aaaaaaaaaaaa"],
  trophy: [".wwwwwwwwww.", "ww.wwwwww.ww", "w..wwwwww..w", "ww.wwwwww.ww", ".wwwwwwwwww.", "...wwwwww...", "....wwww....", ".....ww.....", ".....ww.....", "...wwwwww...", "...dddddd...", "..dddddddd.."],
};
const INK = { f: "--fg", d: "--fg-dim", m: "--fg-mute", a: "--accent", w: "--warn", h: "--harm" };

// One <path> per colour, one subpath per horizontal run: a 12x12 icon is a few hundred bytes of DOM.
export function iconPaths(key) {
  const rows = ICONS[key] || ICONS.joystick, d = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x]; let n = 1;
      while (row[x + n] === c) n++;
      if (INK[c]) (d[c] = d[c] || []).push(`M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  return Object.entries(d).map(([c, p]) => ({ fill: `var(${INK[c]})`, d: p.join("") }));
}
