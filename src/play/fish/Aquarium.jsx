import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId } from "../../caseFile.jsx";
import { SPECIES, SPECIES_BY, SPOT, lbText, inText } from "./data.js";
import { drawFish } from "./art.js";
import { loadAquarium } from "./api.js";
import "./fish.css";
import "../pages.css";
import Sparkline from "../../ui/Sparkline.jsx";

// #aquarium: THE AQUARIUM, the wing of the MUSEUM OF THE CITY in the Old Town (docs/CITY_SPEC.md
// "THE AQUARIUM"). One tank per species. A donated fish swims in its tank over a plaque: the city
// record, who caught it, where, and the records it beat. An empty tank holds a silhouette: NOT YET
// DONATED. Every fish here was re-played on the server from its angler's input log before it went in.

const TW = 96, TH = 56;
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const spotName = (id) => SPOT[id]?.name || String(id || "").toUpperCase();
const waterOf = (s) => (s.legend ? `ONLY AT ${spotName(s.spot)}` : `LIVES IN: ${s.water.map(w => w.toUpperCase()).join(", ")}`);

function paintTank(c, s, filled, t) {
  const sea = s.water.includes("ocean") ? ["#0c3c8c", "#082c6c"] : s.water.includes("estuary") ? ["#145c54", "#0c443c"] : ["#14587c", "#0c3c5c"];
  for (let y = 0; y < TH; y++) { c.fillStyle = y < 3 ? "#5c9cc4" : sea[y < TH / 2 ? 0 : 1]; c.fillRect(0, y, TW, 1); }
  for (let x = 0; x < TW; x++) { c.fillStyle = (x * 7) % 5 ? "#c4a46c" : "#8c744c"; c.fillRect(x, TH - 4 + ((x * 13) % 3 === 0 ? -1 : 0), 1, 5); }
  for (const [x, h] of [[8, 14], [13, 10], [82, 16], [88, 9]]) { c.fillStyle = "#2c7c3c"; for (let k = 0; k < h; k++) c.fillRect(x + ((k >> 2) % 2), TH - 4 - k, 1, 1); }
  if (filled) for (let i = 0; i < 4; i++) { const y = TH - 6 - ((t * 0.4 + i * 13) % (TH - 8)); c.fillStyle = "#a4d8fc"; c.fillRect(70 + (i % 2) * 3, Math.round(y), 1, 1); }
  const span = TW - 40, k = t * 0.18;
  const ph = filled ? (k % (2 * span)) : span / 2;
  const x = 20 + (ph < span ? ph : 2 * span - ph), dir = !filled || ph < span ? 1 : -1;
  const len = s.art.shape === "eel" ? 46 : s.art.shape === "crab" ? 18 : s.legend ? 44 : 36;
  drawFish(c, s.id, Math.round(x), Math.round(TH / 2 + (s.band[0] > 0.8 ? 12 : 0)), len, dir, filled ? t * 0.25 : 0, { silhouette: filled ? null : "#06142c" });
  c.fillStyle = "#3c3c3c"; c.fillRect(0, 0, TW, 1); c.fillRect(0, TH - 1, TW, 1);
}

function Tank({ s, tank, mineHeld, reduced, registry }) {
  const ref = useRef(null);
  const filled = Boolean(tank?.record);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    const paint = (t) => paintTank(c, s, filled, t);
    paint(0);
    if (reduced || !filled) return;
    registry.add(paint);
    return () => registry.delete(paint);
  }, [s, filled, reduced, registry]);
  const r = tank?.record;
  return (
    <li className={`aq-tank${filled ? "" : " empty"}${s.legend ? " legend" : ""}`}>
      <canvas ref={ref} width={TW} height={TH} role="img" aria-label={filled ? `${s.name} swimming in its tank` : `An empty tank with the silhouette of a ${s.name}`} />
      <div className="aq-plaque">
        <b>{s.name}{s.protected ? " (PROTECTED)" : ""}</b>
        {r ? (
          <>
            <span className="rec">CITY RECORD {(r.cw / 100).toFixed(2)} LB ({lbText(r.cw)}) // {inText(r.tl)}</span>
            <span>CAUGHT BY {r.holder}{mineHeld ? <> (YOU) <Sparkline s={{ you: true }} /></> : ""} AT {spotName(r.spot)}, DAY {r.day}.</span>
            {tank.previous?.length > 0 && (
              <details><summary>PREVIOUS RECORDS ({tank.previous.length})</summary>
                <ol>{tank.previous.map((p, i) => <li key={i}>{(p.cw / 100).toFixed(2)} LB // {p.holder} // {spotName(p.spot)}, DAY {p.day}</li>)}</ol>
              </details>
            )}
            {tank.donors?.length > 0 && (
              <details><summary>FIRST DONORS ({tank.donors.length})</summary>
                <ol>{tank.donors.map((p, i) => <li key={i}>{p.holder} // {(p.cw / 100).toFixed(2)} LB // DAY {p.day}</li>)}</ol>
              </details>
            )}
          </>
        ) : (
          <>
            <span>NOT YET DONATED. THE COLLECTING DRIVE IS OPEN.</span>
            <span>{waterOf(s)}.</span>
          </>
        )}
      </div>
    </li>
  );
}

export default function Aquarium() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const caseId = useMemo(() => readCaseId(), []);
  const reduced = useMemo(REDUCED, []);
  const registry = useMemo(() => new Set(), []);
  useEffect(() => {
    let off = false;
    loadAquarium(caseId).catch(() => loadAquarium()).then(j => { if (!off) setData(j); }).catch(e => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [caseId]);
  // one loop paints every swimming tank, about fifteen times a second
  useEffect(() => {
    if (reduced) return;
    let raf = 0, t = 0, last = 0;
    const loop = (now) => { if (now - last > 66) { last = now; t++; for (const p of registry) p(t); } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, registry]);
  const tanks = data?.tanks || {};
  const held = new Set(data?.mine?.records || []);
  const donated = SPECIES.filter(s => tanks[s.id]?.record).length;
  return (
    <div className="aq">
      <ScreenHead title="THE AQUARIUM" meta="THE MUSEUM OF THE CITY, OLD TOWN // EVERY FISH HERE WAS REPLAYED BEFORE IT WAS ACCEPTED." />
      <p className="pg-lede">ONE TANK FOR EVERY FISH IN THE CITY'S WATERS. CATCH ONE, DONATE IT FROM THE CATCH CARD, AND IF IT OUTWEIGHS THE ONE IN THE TANK, THE PLAQUE CARRIES YOUR NAME. THE AQUARIUM RE-PLAYS YOUR WHOLE TRIP FIRST.</p>
      <div className="pg-start">
        <Button variant="primary" href="#fish">GO FISHING</Button>
        <span className="pg-sub">{data ? `${donated} OF ${SPECIES.length} TANKS FILLED.` : err ? `THE AQUARIUM DID NOT ANSWER: ${err}` : "OPENING THE TANKS..."}</span>
      </div>
      {data?.mine && (data.mine.n > 0 || held.size > 0) && (
        <Frame title="YOUR DONATIONS" meta={`${data.mine.n} DONATED // ${held.size} CITY RECORD${held.size === 1 ? "" : "S"} HELD`}>
          <ul className="fi-list">{data.mine.donations.slice(0, 10).map((d, i) => <li key={i}>{SPECIES_BY[d.sp]?.name} // {(d.cw / 100).toFixed(2)} LB // {spotName(d.spot)}, DAY {d.day}{d.record ? " // SET THE RECORD" : ""}</li>)}</ul>
        </Frame>
      )}
      <ul className="aq-wall" aria-label="The tanks">
        {SPECIES.map(s => <Tank key={s.id} s={s} tank={tanks[s.id]} mineHeld={held.has(s.id)} reduced={reduced} registry={registry} />)}
      </ul>
      <ButtonRow><Button variant="secondary" href="#city/oldtown/city-museum">THE MUSEUM IN THE CITY</Button><Button variant="secondary" href="#play">THE GAMES</Button></ButtonRow>
    </div>
  );
}
