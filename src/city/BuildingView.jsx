import { lazy, memo, Suspense, useCallback, useMemo, useRef, useState } from "react";
import Pen from "../Pen.jsx";
import { DISTRICT, PLACES, BUILDING, placeName, placeKind, jobLine, roomIn } from "./simApi.js";
import RoomStage, { ROOM_H } from "./RoomStage.jsx";
import { Occupant } from "./cityUi.jsx";
import { ListRow } from "../ui/index.js";
import { funnelButtons } from "./funnels.js";
import { openFunnel } from "./FunnelOverlay.jsx";
import CasinoDoor from "../casino/CasinoDoor.jsx";
import { isTower } from "./tower.js";
// Towers (residential, office, mixed-use) open as a SimTower cutaway, its own chunk (Cutaway.jsx).
const Cutaway = lazy(() => import("./Cutaway.jsx"));

// #city/<district>/<building>[?floor=N]: one building in cross-section, SimTower-style.
// Floors stacked top to bottom with the lift shaft down the left; each floor's rooms
// (its places) side by side, the people the census puts on that floor walking about in
// them. Tap a floor (or pick it in the directory) to focus it: its frame lights, it
// scrolls into view and its occupants are listed with their assignments.
// DEPT HQ is the Holding Pen's building, which runs its own simulation.

const SHAFT = 46;   // CSS px: the lift shaft and the floor codes, left of the rooms

const cellId = (floor, placeId) => `${floor}:${placeId}`;

// Which room of this building a census entry puts the subject in: on its floor (the
// sim keeps one per stay), or walking in from the street / out to it (simApi.roomIn,
// the same rule every count in the city uses).
function roomOf(w, s, b) {
  const r = roomIn(w, s);
  return r && r.buildingId === b.id ? { cell: cellId(r.floor, r.placeId), mode: r.mode } : null;
}

const embeddedCard = (s) => ({ where: "THE SUBSTRATE // DEPT HQ", back: "Return subject to the Substrate", assignment: `ASSIGNMENT: ${jobLine(s)}` });

export default memo(BuildingView);
function BuildingView({ buildingId, floor, censusRef, onOpen, onFloor }) {
  const b = BUILDING[buildingId];
  if (!b) return null;
  if (b.id === "hq") {
    return (
      <div>
        <div className="hvi-city-note hvi-city-in">DEPARTMENT HEADQUARTERS. SIX FLOORS, THREE OF THEM BELOW THE STREET, WHICH IS WHERE THE DEPARTMENT KEEPS WHAT IT DOES NOT DISCUSS. THIS BUILDING RUNS ITS OWN SIMULATION: THE HOLDING PEN. THE CITY'S CENSUS DOES NOT APPLY INSIDE. NOTHING DOES.</div>
        <Pen embedded cardProps={embeddedCard} />
      </div>
    );
  }
  if (isTower(b)) {
    return (
      <Suspense fallback={<div className="hvi-city-note hvi-city-in">RAISING THE CROSS-SECTION. THE BUILDING DOES NOT CONSENT.</div>}>
        {funnelButtons(b.id).length > 0 && <FunnelBar id={b.id} />}
        <Cutaway key={b.id} b={b} floor={floor} censusRef={censusRef} onOpen={onOpen} onFloor={onFloor} />
      </Suspense>
    );
  }
  return <Floors key={b.id} b={b} floor={floor} censusRef={censusRef} onOpen={onOpen} onFloor={onFloor} />;
}

function FunnelBar({ id }) {
  return (
    <div className="hvi-city-zoom" style={{ position: "static", justifyContent: "flex-start", flexWrap: "wrap", margin: "0 0 var(--s3)" }} role="toolbar" aria-label="What this building offers">
      {funnelButtons(id).map(f => <button key={f.label} type="button" className="hvi-city-zb txt" aria-label={f.aria} onClick={() => openFunnel(f.spec)}>{f.label}</button>)}
    </div>
  );
}

function Floors({ b, floor, censusRef, onOpen, onFloor }) {
  const d = DISTRICT[b.districtId];
  // top floor first, as a lobby directory reads; floors with no rooms on record are skipped
  const floorsDesc = useMemo(() => b.floors.slice().reverse(), [b]);
  const cells = useMemo(() => floorsDesc.flatMap(f => f.places.map(pid => ({
    id: cellId(f.index, pid), floor: f.index, placeId: pid, floorCode: f.code,
    title: `${f.code} // ${f.name}`,
    // the room's own name, when the building holds more than one kind of room
    tag: b.places.length > 1 && f.name !== placeName(pid) ? placeName(pid) : undefined,
    kind: placeKind(pid),
    cap: Math.round(PLACES[pid].cap / PLACES[pid].floors.length),
    tint: placeKind(pid) === "work" && b.districtId === "works" ? "#7f1d1d" : undefined,
  }))), [floorsDesc, b]);
  const layout = useCallback((cssW) => {
    const rects = [], gutter = [];
    let row = 0;
    for (const f of floorsDesc) {
      const mine = cells.filter(c => c.floor === f.index);
      if (!mine.length) continue;
      const y = row * ROOM_H, w = (cssW - SHAFT) / mine.length;
      mine.forEach((c, j) => { rects[cells.indexOf(c)] = { x: SHAFT + j * w, y, w, h: ROOM_H }; });
      // the shaft: rails down the left, the floor code at the landing
      for (let r = 0; r < ROOM_H; r += 13) gutter.push({ x: 4, y: y + r, text: "║   ║", color: "#16291c" });
      gutter.push({ x: 4, y: y + 2, text: "╠═══╣", color: "#1f4a2c" });
      gutter.push({ x: 4 + 1.2 * 7, y: y + ROOM_H / 2 - 12, text: f.code.padStart(2, " "), color: f.index === floor ? "#4ade80" : "#4d8a62", bold: true });
      gutter.push({ x: 4 + 1.2 * 7, y: y + ROOM_H / 2 + 2, text: f.level < 0 ? "▼" : f.level === 0 ? "■" : "▲", color: "#1f4a2c" });
      row++;
    }
    return { rects, height: row * ROOM_H, gutter };
  }, [floorsDesc, cells, floor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const assign = useCallback((w, s) => roomOf(w, s, b), [b]);
  const [present, setPresent] = useState({});
  const byFloor = useMemo(() => {
    const out = {};
    for (const c of cells) (out[c.floor] = out[c.floor] || []).push(...(present[c.id] || []).map(s => ({ s, c })));
    return out;
  }, [present, cells]);
  const total = Object.values(present).reduce((n, l) => n + l.length, 0);
  const focusCell = floor != null ? cells.find(c => c.floor === floor)?.id || null : null;
  // A floor picked on the canvas scrolls its room into view; one picked in the directory
  // leaves the page where it is, so the row (and its occupants) stay under the reader.
  const fromList = useRef(false);
  const focusScroll = useCallback(() => !fromList.current, []);
  const onCell = useCallback((id) => { const c = cells.find(x => x.id === id); if (c) { fromList.current = false; onFloor(c.floor); } }, [cells, onFloor]);
  const pickFloor = (fl) => { fromList.current = true; onFloor(fl); };
  const below = b.floors.filter(f => f.level < 0).length;

  return (
    <div>
      <div className="hvi-city-note hvi-city-in">
        {b.floors.length} FLOOR{b.floors.length === 1 ? "" : "S"}{below ? ` (${below} BELOW THE STREET)` : ""} // {total} PRESENT // {d?.name}. EVERY FLOOR IS OBSERVED. THE LIFT IS OBSERVED MOST OF ALL.
      </div>
      {funnelButtons(b.id).length > 0 && <FunnelBar id={b.id} />}
      {b.id === "casino" && <CasinoDoor />}
      <RoomStage key={b.id} cells={cells} layout={layout} assign={assign} censusRef={censusRef} onOpen={onOpen} onPresent={setPresent} onCell={onCell} focusId={focusCell} focusScroll={focusScroll}
        ariaLabel={`${b.name}, in cross-section: ${b.floors.length} floors, ${total} subjects present. The floor directory below lists everyone by floor.`} />
      <div className="hvi-city-floors hvi-city-in" role="list" aria-label="Floor directory">
        <div className="hvi-city-room-h">FLOOR DIRECTORY // {floor != null ? "FOCUSED FLOOR OPEN" : "SELECT A FLOOR"}</div>
        {floorsDesc.map(f => {
          const people = byFloor[f.index] || [];
          const on = f.index === floor;
          return (
            <div key={f.index} role="listitem">
              <ListRow lead={f.code.padStart(2, " ")} label={f.name}
                value={<span className={people.length > f.cap && !on ? "over" : undefined}>{people.length}/{f.cap}</span>}
                expanded={on} onExpand={(n) => pickFloor(n ? f.index : null)}
                aria-label={`Floor ${f.code}, ${f.name}. ${people.length} present, capacity ${f.cap}. ${on ? "Collapse" : "Focus this floor"}.`}>
                {people.length === 0
                  ? <div className="hvi-city-note">VACANT. THE LIGHTS STAY ON. THE DEPARTMENT IS WATCHING THE EMPTINESS.</div>
                  : people.map(({ s, c }) => <Occupant key={s.name} s={s} onOpen={onOpen} note={c.tag ? placeName(c.placeId) : undefined} />)}
              </ListRow>
            </div>
          );
        })}
      </div>
    </div>
  );
}
