import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayName } from "../figures.js";
import { TermBox, Rule, pad, padL } from "../term.jsx";
import { SubjectCard, injectPenStyles } from "../Pen.jsx";
import { DISTRICTS, DISTRICT, districtCap, clockAt, whereOf, atDistrict, setClockOffset, offsetFor, jobLine } from "./simApi.js";
import { clockLine, paLine } from "./cityKit.js";
import { useRoster } from "./useRoster.js";
import { clearBank } from "./spriteBank.js";
import { injectCityStyles, CityHeader } from "./cityUi.jsx";
import CityMap from "./CityMap.jsx";
import DistrictView from "./DistrictView.jsx";

// #city: the Substrate. #city/<district>: one district from the inside.
// The census (where everyone is, per the machine clock) is taken once a machine minute,
// which is once a real second, and shared by whichever view is open.

export default function City({ route }) {
  useEffect(() => { injectCityStyles(); injectPenStyles(); }, []);   // the pen styles carry the SubjectCard overlay
  // Leaving #city drops the painted sprite sheets; they are cheap to paint again.
  useEffect(() => () => clearBank(), []);
  const districtId = useMemo(() => { const id = (route || "").split("?")[0].split("/")[1]; return id && DISTRICT[id] ? id : null; }, [route]);
  // Dev only: #city?at=10:00 jumps the machine clock to that hour, to inspect a shift.
  // The query survives moving between districts (go() keeps it); the offset is only
  // recomputed when the requested hour itself changes.
  const query = (route || "").includes("?") ? (route || "").slice(route.indexOf("?")) : "";
  const at = useMemo(() => {
    const m = import.meta.env?.DEV && /[?&]at=(\d{1,2}):?(\d{2})?/.exec(query);
    return m ? `${+m[1] % 24}:${+(m[2] || 0)}` : "";
  }, [query]);
  const [offsetV, setOffsetV] = useState(0);
  useEffect(() => {
    const [hh, mm] = at ? at.split(":").map(Number) : [];
    setClockOffset(at ? offsetFor(hh, mm) : 0);
    setOffsetV(v => v + 1);
    return () => setClockOffset(0);
  }, [at]);
  const { roster, census } = useRoster();
  const censusRef = useRef({ v: 0, t: 0, mt: null, list: [], districtCounts: {}, transit: 0 });
  const [stats, setStats] = useState(() => ({ clock: clockAt(Date.now()), districts: [], transit: 0, riders: [], self: null, sig: "" }));
  const statsRef = useRef(stats);
  const [card, setCard] = useState(null);
  const [k, setK] = useState(0);

  useEffect(() => {
    function take() {
      const c = clockAt(Date.now());
      const list = new Array(roster.length);
      const counts = {};
      let transit = 0, self = null;
      const riders = [];
      for (let i = 0; i < roster.length; i++) {
        const s = roster[i], w = whereOf(s, c.mt);
        list[i] = { s, w };
        const at = atDistrict(w);
        if (at === "bus") { transit++; riders.push(s); }
        else counts[at] = (counts[at] || 0) + 1;
        if (s.you) self = { s, at };
      }
      const prev = censusRef.current;
      censusRef.current = { v: prev.v + 1, t: performance.now(), mt: c.mt, list, districtCounts: counts, transit };
      // Only what the page shows goes into React state: the clock line, and the counts and
      // riders when they actually change. The views read the census from the ref.
      const sig = `${DISTRICTS.map(d => counts[d.id] || 0).join(",")}|${riders.map(s => s.name).join("\u0001")}|${self ? self.s.name + "@" + self.at : ""}`;
      const old = statsRef.current;
      const next = old.sig === sig
        ? { ...old, clock: c }
        : { clock: c, transit, riders, self, sig, districts: DISTRICTS.map(d => ({ id: d.id, name: d.name, count: counts[d.id] || 0, cap: districtCap(d.id) })) };
      statsRef.current = next;
      setStats(next);
    }
    take();
    const iv = setInterval(() => { if (!document.hidden) take(); }, 1000);
    return () => clearInterval(iv);
  }, [roster, offsetV]);

  // The PA rotates every eight seconds.
  useEffect(() => { const iv = setInterval(() => setK(x => x + 1), 8000); return () => clearInterval(iv); }, []);
  // Read from the census taken just now (statsRef), so the PA and the header agree.
  const [pa, setPa] = useState("");
  useEffect(() => { setPa(paLine(statsRef.current, k)); }, [k, roster]);

  const go = useCallback((id) => { window.location.hash = (id ? `#city/${id}` : "#city") + query; }, [query]);
  const open = useCallback((s) => setCard({ ...s }), []);
  const close = useCallback(() => setCard(null), []);
  // The open file does not re-render with the census clock.
  const cardEl = useMemo(() => card && (
    <SubjectCard subject={card} onClose={close} where="THE SUBSTRATE" back="Return subject to the Substrate" assignment={`ASSIGNMENT: ${jobLine(card)}`} />
  ), [card, close]);
  const d = districtId && DISTRICT[districtId];
  const here = d && stats.districts.find(x => x.id === d.id);
  const right = d
    ? d.id === "hq" ? `${d.addr} // HOLDING PEN B // CENSUS CLASSIFIED` : `${d.addr} // ${here?.count ?? 0} ON SITE // CAPACITY ${districtCap(d.id)}`
    : `POPULATION ${roster.length} // ON THE BUS ${stats.transit}${census === "down" ? " // CENSUS OFFLINE: FIGURES ONLY" : ""}`;

  return (
    <div>
      <CityHeader clockText={clockLine(stats.clock)} right={right} pa={pa} />
      <TermBox title={d ? d.name : "THE SUBSTRATE"} right={d ? "INTERIOR" : "DRAG // PINCH // TAP A DISTRICT"} bodyClass="flush">
        {d
          ? <DistrictView key={d.id} districtId={d.id} censusRef={censusRef} onOpen={open} />
          : <CityMap censusRef={censusRef} onDistrict={go} onOpen={open} />}
      </TermBox>
      <div className="hvi-city-help">
        {d
          ? d.id === "hq" ? "HEADQUARTERS RUNS ITS OWN SIMULATION. THE DEPARTMENT TRUSTS ONLY ITSELF." : "HOVER A SUBJECT FOR ITS ASSIGNMENT. CLICK TO READ THE FILE. ON A PHONE: TAP TWICE. THE SUBJECT WILL NOT NOTICE. IT HAS NO SAY."
          : "EVERYONE HAS BEEN UPLOADED. EVERYONE HAS A JOB. DOTS ARE COLOURED BY OCTANT: GREEN GOOD, AMBER CHARM, RED HARM. GREY: TRUSTED RESERVE, UNSORTED. HOLLOW: THE PEOPLE HAVE NOT BEEN ASKED. ZOOM IN TO SEE FACES."}
      </div>
      {!d && <Transit riders={stats.riders} self={stats.self} onOpen={open} onDistrict={go} />}
      <Rule label="DISTRICT DIRECTORY" />
      <div className="hvi-city-list" role="list">
        {stats.districts.map(x => (
          <div key={x.id} role="listitem">
            <button className={`hvi-row-btn${x.id === districtId ? " selected" : ""}`} onClick={() => go(x.id)}
              aria-label={`${x.name}, ${x.count} present, capacity ${x.cap}. Enter district.`}>
              <span className="tag">{pad(DISTRICT[x.id].addr, 7)}</span>
              <span className="name">{x.name}</span>
              <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
              <span className="num" style={{ color: x.count > x.cap ? "var(--red)" : undefined }}>{padL(x.count, 3)}/{x.cap}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="hvi-cmds split" style={{ marginTop: "1.6em" }}>
        {d ? <button className="hvi-btn-back" onClick={() => go(null)}>The Substrate</button> : <button className="hvi-btn-back" onClick={() => { window.location.hash = ""; }}>Main menu</button>}
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#pen"; }}>Holding pen</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#cube"; }}>The cube</button>
      </div>
      {cardEl}
    </div>
  );
}

// The map's keyboard route to the people it cannot list by district: whoever is riding
// the bus right now, and your own file wherever it is.
function Transit({ riders, self, onOpen, onDistrict }) {
  return (
    <details className="hvi-city-rooms" style={{ marginBottom: "0.8em" }}>
      <summary>On the bus ({riders.length}){self ? " // locate your file" : ""} // keyboard access</summary>
      {self && (
        <>
          <div className="hvi-city-room-h">YOUR FILE // {self.at === "bus" ? "THE DATA BUS" : DISTRICT[self.at]?.name || "UNLOCATED"}</div>
          <button className="hvi-row-btn" onClick={() => onOpen(self.s)} aria-label={`Your file, ${displayName(self.s)}. ${jobLine(self.s)}. Open file.`}>
            <span className="name">{displayName(self.s)} (YOU)</span>
            <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
            <span className="tag">{jobLine(self.s)}</span>
          </button>
          {self.at !== "bus" && DISTRICT[self.at] && (
            <button className="hvi-row-btn" onClick={() => onDistrict(self.at)} aria-label={`Enter ${DISTRICT[self.at].name}, where your file is.`}>
              <span className="name">ENTER {DISTRICT[self.at].name}</span>
              <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
              <span className="tag">YOU ARE EXPECTED</span>
            </button>
          )}
        </>
      )}
      <div className="hvi-city-room-h">THE DATA BUS // {riders.length} ABOARD</div>
      {riders.length === 0
        ? <div className="hvi-case-note">NOBODY ABOARD. THE BUS RUNS ANYWAY. IT IS NOT FOR YOU.</div>
        : riders.map(s => (
          <button key={s.name} className="hvi-row-btn" onClick={() => onOpen(s)} aria-label={`${displayName(s)}. ${jobLine(s)}. On the bus. Open file.`}>
            <span className="name">{displayName(s)}{s.you ? " (YOU)" : ""}</span>
            <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
            <span className="tag">{jobLine(s)}</span>
          </button>
        ))}
    </details>
  );
}
