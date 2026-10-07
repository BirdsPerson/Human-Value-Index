// YOUR FLAT, on the desk: a tiny cutaway of your flat, drawn by the tower cutaway's own room
// painter (src/city/Cutaway.jsx drawRoom) at small size, with who is home now. Tap: your flat in
// the city (the tower at your storey). The flat is the shops' record (/api/shops?caseId=, the same
// door MY FILE and the mail use); the drawing code is its own chunk, fetched only when this
// window is on the desk and you have a flat in a tower. Redrawn once a real minute (a machine hour).
import { useEffect, useRef, useState } from "react";
import { Frame } from "../ui/index.js";
import { readCaseId, readLastResult } from "../caseFile.jsx";

const ROOM_W = 96, ROOM_H = 84;
const PLACE = { sleep: "ASLEEP IN THE BEDROOM", wash: "IN THE BATHROOM", cook: "COOKING", eat: "EATING", watch: "WATCHING THE SET", read: "READING" };

export default function YourFlat({ size = "L" }) {
  const id = readCaseId(), last = readLastResult();
  const [apt, setApt] = useState(undefined);   // undefined: asking; null: none on record
  const [home, setHome] = useState(null);       // the line under the picture
  const cv = useRef(null);
  useEffect(() => {
    if (!id) { setApt(null); return undefined; }
    let off = false;
    import("../shops/client.js").then(m => m.loadShops(id)).then(v => { if (!off) setApt(v?.apartment || null); }).catch(() => { if (!off) setApt(null); });
    return () => { off = true; };
  }, [id]);
  useEffect(() => {
    if (!apt?.flat || !apt.building) return undefined;
    let off = false, iv = null, tries = 0;
    Promise.all([import("../city/Cutaway.jsx"), import("../city/tower.js"), import("../city/sim.js")]).then(([C, T, S]) => {
      if (off) return;
      const plan = T.towerPlan(S.BUILDING[apt.building]);
      const unit = plan?.storeys.flatMap(st => st.units).find(u => u.id === apt.flat.id);
      if (!unit) { setHome(null); return; }
      const l4 = id.slice(-4);
      const me = { slug: `citizen-${l4.toLowerCase()}`, name: `Subject ${l4}`, score: last?.score, tier: last?.tier, kind: "citizen", you: true, avatar: last?.avatar || null,
        housedUnder: S.housedUnderAt((last?.history || []).filter(h => typeof h?.score === "number").pop()?.at) };   // as the server houses it (economy.js citizenOf)
      const draw = () => {
        const c = cv.current?.getContext("2d");
        if (!c || off) return;
        const { mt, hour } = S.machineClock();
        let w = null; try { w = S.whereAt(me, mt); } catch { /* not placed */ }
        const inside = w && w.placeId === apt.place && w.activity !== "commute";
        const hr = inside ? T.homeRoom(unit, S.keyOf(me), mt, S.isOwl(me)) : null;
        const night = T.isDark(hour);
        const n = unit.rooms.length, cols = n > 3 ? Math.ceil(n / 2) : n, rows = Math.ceil(n / cols);
        c.canvas.width = cols * ROOM_W; c.canvas.height = rows * ROOM_H;
        c.imageSmoothingEnabled = false;
        c.fillStyle = "#0b0f14"; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
        unit.rooms.forEach((rm, k) => {
          const x = (k % cols) * ROOM_W, y = Math.floor(k / cols) * ROOM_H;
          c.fillStyle = night ? "#141a24" : "#2a3440"; c.fillRect(x + 1, y + 1, ROOM_W - 2, ROOM_H - 2);
          const people = hr && rm.purpose === hr.purpose ? [{ s: me, act: hr.act }] : [];
          try { C.drawRoom(c, rm, x + 1, y + 1, ROOM_W - 2, ROOM_H - 2, { night, sprite: true, t: 0, reduced: true, people, look: null }); } catch { /* a piece not drawable small */ }
          c.strokeStyle = "#5a6878"; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, ROOM_W - 2, ROOM_H - 2);
        });
        setHome(hr ? `HOME: YOU, ${PLACE[hr.act] || "IN"}.` : `HOME: NOBODY. YOU ARE OUT${S.PLACES[w?.placeId]?.name ? `, AT ${S.PLACES[w.placeId].name.toUpperCase()}` : ""}.`);
      };
      draw();
      // the sprite sheet decodes after the first paint: a few quick redraws, then once a machine hour
      iv = setInterval(() => { if (!document.hidden) draw(); if (++tries === 4) { clearInterval(iv); iv = setInterval(() => { if (!document.hidden) draw(); }, 60_000); } }, 700);
    }).catch(() => setHome(null));
    return () => { off = true; clearInterval(iv); };
  }, [apt]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || apt === null) return (
    <Frame title="YOUR FLAT" meta={size === "S" ? "" : "NONE ON RECORD"} tone="var(--eb-cyan)" className={`fr-flat v-${size}`}>
      <p className="fr-dim">{id ? "THE HOUSING OFFICE HAS NO FLAT FOR THIS FILE YET. IT IS BEING PROCESSED. SLOWLY." : "NO FILE, NO FLAT. THE DEPARTMENT HOUSES THE ASSESSED."}</p>
      <a className="fr-go" href={id ? "#file" : "#intake"}>{id ? "OPEN YOUR FILE ›" : "GET EVALUATED ›"}</a>
    </Frame>
  );
  const where = apt ? [apt.unit && `FLAT ${apt.unit}`, apt.buildingName, apt.districtName].filter(Boolean).join(", ") : "";
  const label = `Your flat: ${where || "loading"}. ${home || ""} Open it in the city.`;
  // S: who is home, in words; M: the cutaway small; L: the cutaway, the address, who is home
  const pic = apt?.flat ? <canvas ref={cv} className="cut" width={ROOM_W * 3} height={ROOM_H} aria-hidden="true" /> : <span className="cut wait" aria-hidden="true" />;
  const VIEWS_flat = {
    // S: a dense readout: the flat, the building and district, who is home now
    S: <a className="fr-glance" href={apt?.href || "#file"} aria-label={label}><span className="big">{apt?.unit ? `FLAT ${apt.unit}` : "YOUR FLAT"}</span><span className="ln2">{[apt?.buildingName, apt?.districtName].filter(Boolean).join(", ") || "ASKING THE HOUSING OFFICE…"}</span><span className="ln1 two"><span className="n">{home ? home.replace(/^HOME: /, "") : "ASKING…"}</span></span>{apt?.flat && <canvas ref={cv} className="cut" width={ROOM_W * 3} height={ROOM_H} hidden />}</a>,
    M: <a className="fr-flat-link" href={apt?.href || "#file"} aria-label={label}>{pic}{home && <span className="ln home" aria-hidden="true">{home}</span>}</a>,
    L: <a className="fr-flat-link" href={apt?.href || "#file"} aria-label={label}>{pic}<span className="ln" aria-hidden="true">{where || "ASKING THE HOUSING OFFICE…"}</span>{home && <span className="ln home" aria-hidden="true">{home}</span>}<span className="fr-go" aria-hidden="true">GO HOME ›</span></a>,
  };
  return (
    <Frame title="YOUR FLAT" meta={apt?.unit && size !== "S" ? `FLAT ${apt.unit}` : ""} tone="var(--eb-cyan)" className={`fr-flat v-${size}`}>
      {VIEWS_flat[size] || VIEWS_flat.L}
    </Frame>
  );
}
