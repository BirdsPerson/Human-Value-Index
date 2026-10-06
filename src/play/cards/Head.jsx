import { useEffect, useRef, useState } from "react";
import { headFrom, sheetHints } from "../heads.js";

// A figure's head at a card table, cut from their file photo by src/play/heads.js: the head only,
// none of the everyday props they carry. Drawn at a whole-pixel scale (crisp); a drawn head from
// the photo's skin and hair when the cut says no; initials when there is no photo at all.
const SHEETS = new Map();
function loadSheet(src) {
  if (!SHEETS.has(src)) SHEETS.set(src, new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }));
  return SHEETS.get(src);
}
export function spriteOf(key) { return key ? `/sprites/${key}.png` : null; }

export default function Head({ src, name, px = 3, size = 17 }) {
  const ref = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let off = false;
    if (!src) { setState("none"); return undefined; }
    loadSheet(src).then((sheet) => {
      if (off) return;
      const cv = ref.current;
      if (!cv) return;
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      const head = sheet && headFrom(sheet);
      if (head) {
        const x = Math.floor((size - head.width) / 2), y = Math.max(0, size - head.height);
        g.drawImage(head, x * px, y * px, head.width * px, head.height * px);
        setState("ok");
      } else if (sheet) {
        const { skin, hair } = sheetHints(sheet);
        g.fillStyle = hair || "#3a2a1a"; g.fillRect(4 * px, 2 * px, 9 * px, 4 * px);
        g.fillStyle = skin || "#c99a74"; g.fillRect(5 * px, 5 * px, 7 * px, 9 * px);
        g.fillStyle = "#111"; g.fillRect(6 * px, 8 * px, px, px); g.fillRect(10 * px, 8 * px, px, px);
        setState("ok");
      } else setState("none");
    });
    return () => { off = true; };
  }, [src, px, size]);
  const ini = String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("");
  return (
    <span className="ct-head" style={{ width: size * px, height: size * px }} role="img" aria-label={name}>
      <canvas ref={ref} width={size * px} height={size * px} style={{ display: state === "none" ? "none" : "block" }} />
      {state === "none" && <span className="ini" aria-hidden="true">{ini}</span>}
    </span>
  );
}
