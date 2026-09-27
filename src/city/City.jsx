import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TermBox, Rule, pad, padL } from "../term.jsx";
import { SubjectCard, injectPenStyles } from "../Pen.jsx";
import { DISTRICTS, DISTRICT, BUILDING, TRAIN, STATIONS, districtCap, clockAt, whereOf, atDistrict, isOnLoop, setClockOffset, offsetFor, jobLine, loopEvents, roomIn } from "./simApi.js";
import { clockLine, paLine } from "./cityKit.js";
import { useRoster } from "./useRoster.js";
import { clearBank } from "./spriteBank.js";
import { injectCityStyles, CityHeader, Breadcrumb, Occupant } from "./cityUi.jsx";
import CityMap from "./CityMap.jsx";
import City3D, { ViewToggle, useCityViewMode } from "./City3D.jsx";
import DistrictView from "./DistrictView.jsx";
import BuildingView from "./BuildingView.jsx";
import { buildingHref, parseCityRoute } from "./city3d.js";

// #city: the Substrate (2D map or 3D). #city/<district>: one district from the inside.
// #city/<district>/<building>[?floor=N]: one building in cross-section.
// The census (where everyone is, per the machine clock) is taken once a machine minute,
// which is once a real second, and shared by whichever view is open.

export default function City({ route }) {
  useEffect(() => { injectCityStyles(); injectPenStyles(); }, []);   // the pen styles carry the SubjectCard overlay
  // Leaving #city drops the painted sprite sheets; they are cheap to paint again.
  useEffect(() => () => clearBank(), []);
  const parsed = useMemo(() => parseCityRoute(route || ""), [route]);
  const districtId = parsed.districtId && DISTRICT[parsed.districtId] ? parsed.districtId : null;
  const b = districtId && parsed.buildingId && BUILDING[parsed.buildingId]?.districtId === districtId ? BUILDING[parsed.buildingId] : null;
  // HQ runs its own simulation (the Holding Pen): it has floors, but no view of them to focus.
  const floor = b && b.id !== "hq" && parsed.floor != null && b.floors[parsed.floor] ? parsed.floor : null;
  // The query minus the floor: what survives moving between views (?at=, ?stress=).
  const query = useMemo(() => {
    const q = new URLSearchParams(parsed.query.replace(/^\?/, ""));
    q.delete("floor");
    const s = q.toString();
    return s ? "?" + s : "";
  }, [parsed.query]);
  // Dev only: #city?at=10:00 jumps the machine clock to that hour, to inspect a shift.
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
  const [stats, setStats] = useState(() => ({ districts: [], transit: 0, riders: [], waiting: 0, self: null, sig: "", buildings: {}, bsig: "" }));
  const statsRef = useRef(stats);
  const [card, setCard] = useState(null);
  const [k, setK] = useState(0);
  const [pa, setPa] = useState("");
  const hereRef = useRef(districtId); hereRef.current = districtId;

  useEffect(() => {
    function take() {
      const c = clockAt(Date.now());
      const list = new Array(roster.length);
      const counts = {}, bcounts = {};
      let transit = 0, waiting = 0, self = null;
      const riders = [];
      for (let i = 0; i < roster.length; i++) {
        const s = roster[i], w = whereOf(s, c.mt);
        list[i] = { s, w };
        const at = atDistrict(w);
        if (isOnLoop(at)) { transit++; riders.push({ s, t: w.trainId, c: w.car }); }
        else counts[at] = (counts[at] || 0) + 1;
        if (w.sub === "waiting") waiting++;
        const r = roomIn(w, s);
        if (r) bcounts[r.buildingId] = (bcounts[r.buildingId] || 0) + 1;
        if (s.you) self = { s, at, w };
      }
      riders.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.c - b.c));
      const prev = censusRef.current;
      censusRef.current = { v: prev.v + 1, t: performance.now(), mt: c.mt, list, districtCounts: counts, transit };
      // Inside a district, its own station's arrivals and departures are announced the
      // machine minute they happen; the rotation picks up again after.
      const here = hereRef.current;
      if (here && prev.mt != null && c.mt > prev.mt && c.mt - prev.mt < 0.5) {
        const ev = loopEvents(prev.mt, c.mt).filter(e => e.stationId === here).pop();
        if (ev) setPa(ev.text);
      }
      // Only what the page shows goes into React state: the counts and riders, and only when
      // they actually change (the clock ticks in its own component). The views read the
      // census from the ref.
      const sig = `${DISTRICTS.map(d => counts[d.id] || 0).join(",")}|${riders.map(r => r.s.name + r.t + r.c).join("\u0001")}|${waiting}|${self ? self.s.name + "@" + self.at + (self.w.buildingId || "") : ""}`;
      const bsig = Object.keys(bcounts).sort().map(id => id + bcounts[id]).join(",");
      const old = statsRef.current;
      let next = old.sig === sig ? old : { transit, riders, waiting, self, sig, buildings: old.buildings, bsig: old.bsig, districts: DISTRICTS.map(d => ({ id: d.id, name: d.name, count: counts[d.id] || 0, cap: districtCap(d.id) })) };
      if (bsig !== old.bsig) next = { ...next, buildings: bcounts, bsig };
      if (next !== old) { statsRef.current = next; setStats(next); }
    }
    take();
    const iv = setInterval(() => { if (!document.hidden) take(); }, 1000);
    return () => clearInterval(iv);
  }, [roster, offsetV]);

  // The PA rotates every eight seconds: every other line is the Loop's own announcement
  // (the latest at this district's station inside one, anywhere on the map).
  useEffect(() => { const iv = setInterval(() => setK(x => x + 1), 8000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    const clock = clockAt(Date.now()), st = { ...statsRef.current, clock }, mt = clock.mt, here = hereRef.current;
    const evs = loopEvents(mt - 8 / 60, mt + 1e-6).filter(e => !here || e.stationId === here);
    setPa(paLine(st, k, evs.length ? evs[evs.length - 1].text : null));
    // a new district re-reads its own station's line at once
  }, [k, roster, districtId]);

  // A new district or building starts at the top of the page (a focused floor then
  // scrolls itself into view: this runs first, as a layout effect).
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [districtId, b?.id]);
  // Moving through the hierarchy unmounts whatever had focus (a list row, a breadcrumb, the
  // 3D floor list). When focus has fallen back to the page, put it on the breadcrumb's
  // "you are here", so keyboard and screen-reader users land on the new location. Not on
  // the first visit, and never away from a control that still holds focus.
  const placeKey = `${districtId}|${b?.id}|${floor}`;
  const lastPlace = useRef(placeKey);
  useEffect(() => {
    if (lastPlace.current === placeKey) return;
    lastPlace.current = placeKey;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    document.getElementById("hvi-city-here")?.focus({ preventScroll: true });
  }, [placeKey]);

  const go = useCallback((id) => { window.location.hash = (id ? `#city/${id}` : "#city") + query; }, [query]);
  const goBuilding = useCallback((d, bid, fl = null) => { window.location.hash = buildingHref(d, bid, fl, query); }, [query]);
  const onBuilding = useCallback((bid) => goBuilding(districtId, bid), [goBuilding, districtId]);
  const onFloor = useCallback((fl) => { if (b) window.location.replace(buildingHref(b.districtId, b.id, fl, query)); }, [b, query]);
  const open = useCallback((s) => setCard({ ...s }), []);
  const close = useCallback(() => setCard(null), []);
  const [mode, setMode] = useCityViewMode();
  // The open file does not re-render with the census clock.
  const cardEl = useMemo(() => card && (
    <SubjectCard subject={card} onClose={close} where="THE SUBSTRATE" back="Return subject to the Substrate" assignment={`ASSIGNMENT: ${jobLine(card)}`} />
  ), [card, close]);
  const d = districtId && DISTRICT[districtId];
  const here = d && stats.districts.find(x => x.id === d.id);
  const bn = b ? stats.buildings[b.id] || 0 : 0;
  const right = b
    ? b.id === "hq" ? `${b.addr} // 6F // CENSUS CLASSIFIED` : `${b.addr} // ${b.floors.length}F // ${bn} INSIDE`
    : d
      ? d.id === "hq" ? `${d.addr} // HOLDING PEN B // CENSUS CLASSIFIED` : `${d.addr} // ${here?.count ?? 0} ON SITE // CAPACITY ${districtCap(d.id)}`
      : `POPULATION ${roster.length} // ABOARD THE LOOP ${stats.transit} // ON PLATFORMS ${stats.waiting}${census === "down" ? " // CENSUS OFFLINE: FIGURES ONLY" : ""}`;

  const crumbs = [{ label: "CITY", go: () => go(null) }];
  if (d) crumbs.push({ label: d.name, go: () => go(d.id) });
  if (b) crumbs.push({ label: b.name, go: () => goBuilding(d.id, b.id) });
  if (b && floor != null) { const f = b.floors[floor]; crumbs.push({ label: `${f.code} ${f.name}` }); }
  const three = !d && mode === "3d";

  return (
    <div>
      <CityHeader clockText={<LiveClock />} right={right} pa={pa} />
      <div className="hvi-city-bar">
        <Breadcrumb crumbs={crumbs} />
        {!d && <ViewToggle mode={mode} onChange={setMode} />}
      </div>
      <TermBox title={b ? b.name : d ? d.name : three ? "THE SUBSTRATE // IN DEPTH" : "THE SUBSTRATE"}
        right={b ? "CROSS-SECTION" : d ? "INTERIOR" : three ? "DRAG TO TURN // TAP A BUILDING" : "DRAG // PINCH // TAP A DISTRICT"} bodyClass="flush">
        {b
          ? <BuildingView key={b.id} buildingId={b.id} floor={floor} censusRef={censusRef} onOpen={open} onFloor={onFloor} />
          : d
            ? <DistrictView key={d.id} districtId={d.id} censusRef={censusRef} onOpen={open} onBuilding={onBuilding} counts={stats.buildings} />
            : three
              ? <City3D censusRef={censusRef} onDistrict={go} onOpen={open} onFloor={goBuilding} query={query} />
              : <CityMap censusRef={censusRef} onDistrict={go} onOpen={open} />}
      </TermBox>
      <div className="hvi-city-help">
        {b
          ? b.id === "hq" ? "HEADQUARTERS RUNS ITS OWN SIMULATION. THE DEPARTMENT TRUSTS ONLY ITSELF." : "TAP A FLOOR TO FOCUS IT. HOVER A SUBJECT FOR ITS ASSIGNMENT. CLICK TO READ THE FILE. ON A PHONE: TAP TWICE."
          : d
            ? d.id === "hq" ? "HEADQUARTERS RUNS ITS OWN SIMULATION. THE DEPARTMENT TRUSTS ONLY ITSELF." : "ENTER A BUILDING ABOVE. HOVER A SUBJECT FOR ITS ASSIGNMENT. CLICK TO READ THE FILE. ON A PHONE: TAP TWICE. THE SUBJECT WILL NOT NOTICE. IT HAS NO SAY."
            : three
              ? "DRAG TO TURN THE CITY. WHEEL OR PINCH TO ZOOM. TAP A BUILDING TO OPEN IT; TAP A FLOOR TO GO IN. BY KEYBOARD: [ AND ] OPEN THE NEXT BUILDING, ENTER CHOOSES A FLOOR. CYAN ON THE RING: THE LOOP; A LIT PLATFORM HAS A TRAIN STANDING AT IT. DOTS ARE COLOURED BY OCTANT: GREEN GOOD, AMBER CHARM, RED HARM. GREY: TRUSTED RESERVE, UNSORTED. HOLLOW: THE PEOPLE HAVE NOT BEEN ASKED."
              : "EVERYONE HAS BEEN UPLOADED. EVERYONE HAS A JOB. CYAN ON THE RING: THE LOOP, ON TIME. DOTS ARE COLOURED BY OCTANT: GREEN GOOD, AMBER CHARM, RED HARM. GREY: TRUSTED RESERVE, UNSORTED. HOLLOW: THE PEOPLE HAVE NOT BEEN ASKED. ZOOM IN TO SEE FACES."}
      </div>
      {!d && <LoopPanel riders={stats.riders} waiting={stats.waiting} self={stats.self} onOpen={open} onDistrict={go} />}
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
        {b ? <button className="hvi-btn-back" onClick={() => go(d.id)}>{d.name}</button>
          : d ? <button className="hvi-btn-back" onClick={() => go(null)}>The Substrate</button>
            : <button className="hvi-btn-back" onClick={() => { window.location.hash = ""; }}>Main menu</button>}
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#pen"; }}>Holding pen</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#cube"; }}>The cube</button>
      </div>
      {cardEl}
    </div>
  );
}

// The machine clock, ticking on its own so the rest of the page does not re-render with it.
function LiveClock() {
  const [c, setC] = useState(() => clockAt(Date.now()));
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) setC(clockAt(Date.now())); }, 1000);
    return () => clearInterval(iv);
  }, []);
  return clockLine(c);
}

// The map's keyboard route to the people it cannot list by district: whoever is aboard
// the Loop right now, train by train, and your own file wherever it is.
// Memoized: its props only change identity when the census signature does.
const LoopPanel = memo(function LoopPanel({ riders, waiting, self, onOpen, onDistrict }) {
  const byTrain = [];
  for (const r of riders) { const last = byTrain[byTrain.length - 1]; if (last && last.t === r.t) last.list.push(r); else byTrain.push({ t: r.t, list: [r] }); }
  return (
    <details className="hvi-city-rooms" style={{ marginBottom: "0.8em" }}>
      <summary>Aboard the Loop ({riders.length}){self ? " // locate your file" : ""} // keyboard access</summary>
      {self && (
        <>
          <div className="hvi-city-room-h">YOUR FILE // {isOnLoop(self.at) ? `ABOARD ${TRAIN[self.w.trainId]?.name || "THE LOOP"}` : DISTRICT[self.at]?.name || "UNLOCATED"}</div>
          <Occupant s={self.s} onOpen={onOpen} />
          {!isOnLoop(self.at) && DISTRICT[self.at] && (
            <button className="hvi-row-btn" onClick={() => onDistrict(self.at)} aria-label={`Enter ${DISTRICT[self.at].name}, where your file is.`}>
              <span className="name">ENTER {DISTRICT[self.at].name}</span>
              <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
              <span className="tag">YOU ARE EXPECTED</span>
            </button>
          )}
        </>
      )}
      <div className="hvi-city-room-h">THE LOOP // {riders.length} ABOARD // {waiting} ON PLATFORMS</div>
      {riders.length === 0
        ? <div className="hvi-case-note">NOBODY ABOARD. THE LOOP RUNS ANYWAY. IT IS NOT FOR YOU.</div>
        : byTrain.map(g => (
          <div key={g.t}>
            <div className="hvi-city-room-h">{TRAIN[g.t]?.name || g.t} // {g.list.length} ABOARD // {TRAIN[g.t]?.cars} CARS</div>
            {g.list.map(r => <Occupant key={r.s.name} s={r.s} onOpen={onOpen} note={`CAR ${r.c + 1}`} />)}
          </div>
        ))}
      <div className="hvi-case-note" style={{ marginTop: "0.6em" }}>{Object.keys(STATIONS).length} STATIONS. ONE PER DISTRICT. ENTER A DISTRICT TO STAND ON ITS PLATFORM.</div>
    </details>
  );
});
