// THE COUNCIL CHAMBER at THE ASSEMBLY (docs/CITY_SPEC.md "Council elections"), drawn by
// civicDraw.js on the forum's dais: a long bench of ten seats, one per district, behind the
// lectern. When the Council sits (councilCalendar.js: machine Tuesdays and Fridays, 10:00-13:00)
// each seat holder attends by projection, seated and wearing the sash (the sim keeps them where
// they are, so they are drawn as projections and are not tappable); a vacant seat stays empty.
// Everything comes from the day's civic record (summary.civic, seat.holder): every viewer sees
// the same chamber.
import { STOREY } from "./iso.js";
import { SPRITE_W, SPRITE_H } from "../sprites.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { drawPose } from "./poses.js";
import { summaryOf } from "./planClient.js";
import { DISTRICTS } from "./sim.js";
import { councilSitting } from "./councilCalendar.js";

const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const likeness = new Map();   // key -> the subject the chamber draws (a figure's file likeness)
const subjectOf = (key, name) => {
  let s = likeness.get(key);
  if (!s) { s = { name, slug: key, kind: "figure", score: 600 }; likeness.set(key, s); }
  return s;
};
// -> [{id, holder: {key, name} | null}] in district order
export function chamberSeats(mt) {
  const civ = summaryOf(Math.floor(mt / 24) + 1)?.civic;
  return DISTRICTS.map(d => {
    const st = civ?.districts?.[d.id]?.seat;
    return { id: d.id, holder: st?.holder ? { key: st.holder, name: st.name || st.holder } : null };
  });
}

// K: civicDraw's frame kit ({G, lod, put, t}); D: the dais.
export function drawChamber(K, D, mt) {
  const { G, lod } = K;
  const seats = chamberSeats(mt), sitting = councilSitting(mt);
  const y = D.y0 + 0.28, x0 = D.x0 + 0.35, x1 = D.x1 - 0.35, n = seats.length;
  const xs = seats.map((_, i) => x0 + ((i + 0.5) * (x1 - x0)) / n);
  // the bench: one long desk along the back of the dais, a nameplate lamp per seat
  K.put((x0 + x1) / 2, y - 0.1, () => {
    G.prism(rectPts(x0, y - 0.22, x1, y - 0.12), D.h, D.h + 0.5, "#3a2a1c", 1.25);
    if (lod === "far") return;
    for (let i = 0; i < n; i++) {
      const [sx, sy] = G.Q(xs[i], y - 0.12, D.h + 0.42), r = Math.max(1, Math.round(G.z * 0.05));
      G.ctx.fillStyle = seats[i].holder ? (sitting ? "#4ade80" : "#facc15") : "#4b5563";
      G.ctx.fillRect(Math.round(sx - r), Math.round(sy - r), r * 2, r * 2);
    }
    if (lod === "near") {
      const [lx, ly] = G.Q(x0, y - 0.22, D.h + 0.62), fs = Math.max(6, Math.round(G.z * 0.2));
      G.ctx.save(); G.ctx.font = `${fs}px "Fira Mono", monospace`; G.ctx.textBaseline = "bottom";
      G.ctx.fillStyle = sitting ? "#4ade80" : "#86c9a0";
      G.ctx.fillText(sitting ? "COUNCIL CHAMBER // IN SESSION" : "COUNCIL CHAMBER // IN RECESS", Math.round(lx), Math.round(ly));
      G.ctx.restore();
    }
  }, -0.6);
  // the seats, and the members by projection while the Council sits
  seats.forEach((st, i) => {
    const x = xs[i];
    K.put(x, y, () => {
      G.prism(rectPts(x - 0.13, y - 0.05, x + 0.13, y + 0.2), D.h, D.h + 0.22, "#5a1c1c", 1.2);
      G.prism(rectPts(x - 0.13, y - 0.12, x + 0.13, y - 0.05), D.h, D.h + 0.62, "#6b2020", 1.2);
      if (!sitting || !st.holder) return;
      const s = subjectOf(st.holder.key, st.holder.name);
      const [sx, sy] = G.Q(x, y + 0.05, D.h + 0.1), c = G.ctx;
      const r = Math.max(2, G.z * 0.2);
      c.fillStyle = "rgba(34,211,238,0.3)"; c.beginPath(); c.ellipse(sx, sy, r, r * 0.5, 0, 0, Math.PI * 2); c.fill();
      if (lod === "far") { c.fillStyle = "#facc15"; c.fillRect(Math.round(sx) - 1, Math.round(sy) - 3, 2, 3); return; }
      const hh0 = G.z * STOREY * 0.95;
      c.globalAlpha = 0.82;
      if (lod === "mid" || hh0 < 18) {
        const m = miniFor(s), sc = hh0 / (SPRITE_H / 2);
        try { c.drawImage(m, Math.round(sx - (SPRITE_W / 4) * sc), Math.round(sy - hh0), Math.round((SPRITE_W / 2) * sc), Math.round(hh0)); } catch { /* not decoded yet */ }
      } else {
        drawPose(c, sheetFor(s), { kind: "seat", act: "listen", face: 0, walk: null }, "listen", sx, sy, hh0, K.t, (i * 0.13) % 1, 1);
      }
      c.globalAlpha = 1;
    }, 0.01);
  });
}
