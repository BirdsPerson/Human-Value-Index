// THE FUNNIES, drawn (netlify/lib/paper-comic.js deals the strip): one small pixel canvas a panel,
// the words under it as text (readable at 16px, read by screen readers). The Department's own
// characters only: the Prefects from their own painter (src/city/prefectDraw.js), the EBSN hosts
// in their wardrobe colours (src/city/hostsLive.js), and the ADJUDICATOR UNIT 40-LOVE in its chair.
import { useEffect, useRef } from "react";
import { prefectSheet, PW, PH } from "../city/prefectDraw.js";
import { HOSTS } from "../city/hostsLive.js";

const W = 96, H = 64, INK = "#181020";

function scene(x, bg) {
  const S = {
    market: ["#0f2a1c", "#16402a"], court: ["#1d4a2a", "#2a6a3a"], street: ["#20202a", "#33333f"], desk: ["#2a2016", "#3a2c1e"],
  }[bg] || ["#0f2a1c", "#16402a"];
  x.fillStyle = S[0]; x.fillRect(0, 0, W, H);
  x.fillStyle = S[1]; x.fillRect(0, 44, W, 20);
  if (bg === "market") {   // the board
    x.fillStyle = "#06120a"; x.fillRect(8, 6, 80, 18);
    x.fillStyle = "#4ade80"; for (let i = 0; i < 9; i++) x.fillRect(12 + i * 8, 10 + ((i * 7) % 9), 5, 2);
    x.fillStyle = "#f87171"; x.fillRect(56, 18, 5, 2);
  } else if (bg === "court") {
    x.fillStyle = "#e8e8d8"; x.fillRect(0, 50, W, 1); x.fillRect(47, 44, 1, 20);
    x.fillStyle = "#c8c8b8"; x.fillRect(4, 40, 88, 1);
  } else if (bg === "street") {
    const C = ["#5a3a6a", "#3a5a6a", "#6a5a3a", "#3a6a4a"];
    for (let i = 0; i < 4; i++) { x.fillStyle = C[i]; x.fillRect(2 + i * 24, 10, 22, 34); x.fillStyle = "#e8d68a"; x.fillRect(6 + i * 24, 16, 14, 8); }
  } else {
    x.fillStyle = "#5a4430"; x.fillRect(10, 40, 76, 6);
    x.fillStyle = "#7a7a84"; x.fillRect(80, 18, 12, 26); x.fillStyle = INK; x.fillRect(83, 24, 6, 1); x.fillRect(83, 34, 6, 1);
  }
}

// A host, painted plainly from their wardrobe (no face anybody could own: two dots and a grin).
function host(x, id, cx, by) {
  const h = HOSTS[id]; if (!h) return;
  const w = h.w, top = by - h.h;
  x.fillStyle = INK; x.fillRect(cx - w / 2 - 1, top - 1, w + 2, h.h + 2);
  x.fillStyle = h.hair; x.fillRect(cx - 4, top, 8, 3);
  x.fillStyle = h.skin; x.fillRect(cx - 3, top + 3, 6, 6);
  x.fillStyle = INK; x.fillRect(cx - 2, top + 5, 1, 1); x.fillRect(cx + 1, top + 5, 1, 1); x.fillRect(cx - 1, top + 7, 3, 1);
  x.fillStyle = h.top; x.fillRect(cx - w / 2, top + 9, w, 10);
  x.fillStyle = h.accent; x.fillRect(cx - 1, top + 9, 2, 4);
  x.fillStyle = h.dress ? h.top : h.bottom; x.fillRect(cx - w / 2 + 1, top + 19, w - 2, h.h - 19);
  if (!h.dress) { x.fillStyle = INK; x.fillRect(cx, top + 21, 1, h.h - 21); }
}

// ADJUDICATOR UNIT 40-LOVE: a box on a tall chair, one lens, a visor.
function umpire(x, cx, by) {
  x.fillStyle = "#6a5a3a"; x.fillRect(cx - 6, by - 14, 2, 14); x.fillRect(cx + 4, by - 14, 2, 14); x.fillRect(cx - 6, by - 15, 12, 2);
  x.fillStyle = INK; x.fillRect(cx - 7, by - 33, 14, 18);
  x.fillStyle = "#9aa3b2"; x.fillRect(cx - 6, by - 32, 12, 16);
  x.fillStyle = "#26324a"; x.fillRect(cx - 5, by - 30, 10, 4);
  x.fillStyle = "#fbbf24"; x.fillRect(cx - 1, by - 29, 2, 2);
  x.fillStyle = "#e8e8d8"; x.fillRect(cx - 7, by - 35, 14, 2);
}

function draw(c, panel) {
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  scene(x, panel.bg);
  const n = panel.cast.length, by = 58;
  panel.cast.forEach((id, i) => {
    const cx = n === 1 ? W / 2 : i === 0 ? 30 : 66;
    if (id.startsWith("prefect:")) {
      try { const e = prefectSheet(id.slice(8)); x.drawImage(e.img, 0, 0, PW, PH, Math.round(cx - PW / 2), by - PH + 2, PW, PH); } catch { /* an unknown prefect: an empty spot */ }
    } else if (id.startsWith("host:")) host(x, id.slice(5), cx, by);
    else if (id === "umpire") umpire(x, cx, by);
  });
}

function Panel({ panel, i }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) draw(ref.current, panel); }, [panel]);
  return (
    <figure className="pp-panel">
      <canvas ref={ref} width={W} height={H} aria-hidden="true" />
      <figcaption>
        <span className="pp-meta" style={{ fontSize: "var(--t-xs)" }}>PANEL {i + 1}</span>
        {panel.lines.map((l, k) => <span key={k} style={{ display: "block" }}><b>{l.name}</b>{l.text}</span>)}
        {panel.caption && <span className="cap" style={{ display: "block" }}>{panel.caption}</span>}
      </figcaption>
    </figure>
  );
}

export default function Comic({ strip }) {
  return <div className="pp-strip">{strip.panels.map((p, i) => <Panel key={i} panel={p} i={i} />)}</div>;
}
