import { memo, useCallback, useMemo, useState } from "react";
import Pen from "../Pen.jsx";
import { DISTRICT, PLACES, atDistrict, placesOf, placeName, placeCap, placeKind, jobLine, buildingsOf, stationOf } from "./simApi.js";
import { roomGrid } from "./cityKit.js";
import RoomStage, { ROOM_H } from "./RoomStage.jsx";
import { Occupant } from "./cityUi.jsx";

// One district from the inside: its buildings (tap one to go in), then its station
// platform and its rooms as terminal rooms, stacked on phones and tiled on wide screens,
// with the subjects the census puts there wandering each one. DEPT HQ is the Holding
// Pen's six-floor building, embedded as it is.

export const PLATFORM = "platform";

// Which room of this district a census entry puts the subject in, and how: {cell, mode}.
// Same rule as the header's count (atDistrict): a commuter still walking inside this
// district counts here. On the platform: waiting for the Loop, or just off it. Walking
// in from the station they arrive through the room's door; walking out, they leave by it.
function roomOf(w, districtId) {
  if (w.activity !== "commute") return PLACES[w.placeId]?.district === districtId ? { cell: w.placeId, mode: "here" } : null;
  if (atDistrict(w) !== districtId) return null;
  if (w.stationId === districtId && w.sub === "waiting") return { cell: PLATFORM, mode: "here" };
  if (w.stationId === districtId && w.sub === "alighting") return { cell: PLATFORM, mode: "alight" };
  if (PLACES[w.placeId]?.district === districtId) return { cell: w.placeId, mode: "arrive" };
  if (PLACES[w.fromPlaceId]?.district === districtId) return { cell: w.fromPlaceId, mode: "leave" };
  return null;
}
const embeddedCard = (s) => ({ where: "THE SUBSTRATE // DEPT HQ", back: "Return subject to the Substrate", assignment: `ASSIGNMENT: ${jobLine(s)}` });

// Memoized: City re-renders every census tick (the clock); the canvas needs none of it.
export default memo(DistrictView);
function DistrictView({ districtId, censusRef, onOpen, onBuilding, counts }) {
  const d = DISTRICT[districtId];
  if (districtId === "hq") {
    return (
      <div>
        <div className="hvi-case-note" style={{ marginBottom: "0.8em" }}>{d?.blurb} THE BUILDING BELOW IS THE HOLDING PEN. IT IS ALSO HEADQUARTERS. THE DEPARTMENT DOES NOT WASTE REAL ESTATE. IT HOLDS EVERY FILE, NOT EVERY BODY: THE BODIES ARE AT WORK.</div>
        <BuildingList districtId={districtId} onBuilding={onBuilding} counts={counts} />
        <HqPlatform censusRef={censusRef} onOpen={onOpen} />
        <Pen embedded cardProps={embeddedCard} />
      </div>
    );
  }
  return <Rooms key={districtId} districtId={districtId} censusRef={censusRef} onOpen={onOpen} onBuilding={onBuilding} />;
}

// The district's buildings, as a lobby directory: tap to enter.
export function BuildingList({ districtId, onBuilding, counts = {} }) {
  const list = buildingsOf(districtId);
  return (
    <div className="hvi-city-blist" role="list" aria-label="Buildings in this district">
      <div className="hvi-city-room-h">BUILDINGS // {list.length} ON RECORD // SELECT ONE TO ENTER</div>
      {list.map(b => {
        const n = counts[b.id] || 0;
        const fl = b.floors.length;
        const secret = b.id === "hq";   // HQ keeps its own books
        return (
          <div key={b.id} role="listitem">
            <button className="hvi-row-btn" onClick={() => onBuilding(b.id)} aria-label={`${b.name}, ${fl} floor${fl === 1 ? "" : "s"}, ${secret ? "census classified" : `${n} present`}. Enter building.`}>
              <span className="tag">{b.addr}</span>
              <span className="name">{b.name}</span>
              <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
              <span className="num">{fl}F // {secret ? "CLASSIFIED" : `${n} PRESENT`}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// DEPT HQ's station: the Loop stops here like anywhere else, so its platform is shown above
// the Pen (the building itself runs its own simulation).
function HqPlatform({ censusRef, onOpen }) {
  const st = stationOf("hq");
  const cells = useMemo(() => (st ? [{ id: PLATFORM, title: `${st.name} // PLATFORM`, tag: `THE LOOP ${st.addr}`, kind: "platform" }] : []), [st]);
  const layout = useCallback((cssW) => ({ rects: [{ x: 0, y: 0, w: cssW, h: ROOM_H }], height: ROOM_H }), []);
  const assign = useCallback((w) => { const m = roomOf(w, "hq"); return m && m.cell === PLATFORM ? m : null; }, []);
  const [present, setPresent] = useState({});
  if (!st) return null;
  const n = (present[PLATFORM] || []).length;
  return (
    <div style={{ marginBottom: "0.9em" }}>
      <RoomStage cells={cells} layout={layout} assign={assign} censusRef={censusRef} onOpen={onOpen} onPresent={setPresent} stationId="hq"
        ariaLabel={`${st.name}: the platform, ${n} on it. The list below names them.`} />
      <details className="hvi-city-rooms">
        <summary>Platform ({n} present) // keyboard access</summary>
        {n === 0
          ? <div className="hvi-case-note">NOBODY WAITING. THE LOOP COMES ANYWAY.</div>
          : present[PLATFORM].map(s => <Occupant key={s.name} s={s} onOpen={onOpen} />)}
      </details>
    </div>
  );
}

function Rooms({ districtId, censusRef, onOpen, onBuilding }) {
  const d = DISTRICT[districtId];
  const st = stationOf(districtId);
  const places = useMemo(() => placesOf(districtId), [districtId]);
  const cells = useMemo(() => [
    ...(st ? [{ id: PLATFORM, title: `${st.name} // PLATFORM`, tag: `THE LOOP ${st.addr}`, kind: "platform" }] : []),
    ...places.map(id => ({ id, title: placeName(id), kind: placeKind(id), cap: placeCap(id), tint: placeKind(id) === "work" && districtId === "works" ? "#7f1d1d" : undefined })),
  ], [places, st, districtId]);
  const layout = useCallback((cssW) => {
    const g = roomGrid(cells.length, cssW);
    return { rects: cells.map((_, i) => ({ x: (i % g.cols) * g.w, y: Math.floor(i / g.cols) * ROOM_H, w: g.w, h: ROOM_H })), height: g.rows * ROOM_H };
  }, [cells]);
  const assign = useCallback((w) => roomOf(w, districtId), [districtId]);
  const [present, setPresent] = useState({});
  const total = Object.values(present).reduce((n, l) => n + l.length, 0);
  const waiting = (present[PLATFORM] || []).length;
  // Building counts by the rooms' own rule (arrivals included), so the list and the rooms agree.
  const bcounts = useMemo(() => {
    const out = {};
    for (const bl of buildingsOf(districtId)) out[bl.id] = bl.places.reduce((n, pid) => n + (present[pid] || []).length, 0);
    return out;
  }, [present, districtId]);

  return (
    <div>
      <div className="hvi-case-note" style={{ marginBottom: "0.8em" }}>{d?.blurb}</div>
      <BuildingList districtId={districtId} onBuilding={onBuilding} counts={bcounts} />
      <RoomStage cells={cells} layout={layout} assign={assign} censusRef={censusRef} onOpen={onOpen} onPresent={setPresent} stationId={st ? districtId : null}
        ariaLabel={`${d?.name || "District"}: the station platform and ${places.length} rooms, ${total} subjects present, ${waiting} on the platform. The room directory below lists them by keyboard.`} />
      <details className="hvi-city-rooms">
        <summary>Room directory ({total} present) // keyboard access</summary>
        {cells.map(c => (
          <div key={c.id}>
            <div className="hvi-city-room-h">{c.title} // {(present[c.id] || []).length}{c.cap ? `/${c.cap}` : " ON THE PLATFORM"}</div>
            {(present[c.id] || []).length === 0
              ? <div className="hvi-case-note">{c.id === PLATFORM ? "NOBODY WAITING. THE LOOP COMES ANYWAY." : "EMPTY. THE ROOM IS ALSO BEING ASSESSED."}</div>
              : (present[c.id] || []).map(s => <Occupant key={s.name} s={s} onOpen={onOpen} />)}
          </div>
        ))}
      </details>
    </div>
  );
}
