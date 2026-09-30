// The views' single door into the simulation (sim.js, contract in docs/CITY_SPEC.md).
// Everything the map and the district views read goes through here. Pure, no DOM.

import * as SIM from "./sim.js";

export const { DISTRICTS, PLACES, JOBS, BUS, LOOP_LINE, STATIONS, STATION_ORDER, TRAINS, TRAIN, BUILDINGS, BUILDING, HEADWAY, OPEN_LOTS, GAMES, GAME_VENUE, lotPhase, civicState, LOT_BREAK, LOT_BUILD } = SIM;
export const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));
// Where a rider physically is (whereAt's atDistrictId). v1 called it "bus".
export const ON_LOOP = "loop";
export const isOnLoop = (at) => at === ON_LOOP || at === "bus";

export const placeName = (id) => PLACES[id]?.name || String(id || "").toUpperCase();
export const placeCap = (id) => PLACES[id]?.cap || 0;
export const placeKind = (id) => PLACES[id]?.kind || "place";
export const districtName = (id) => (isOnLoop(id) ? "THE LOOP" : DISTRICT[id]?.name || String(id || "").toUpperCase());
export const buildingsOf = (districtId) => (DISTRICT[districtId]?.buildings || []).map(id => BUILDING[id]);
export const buildingOfPlace = (placeId) => BUILDING[PLACES[placeId]?.building] || null;
export const placesOf = (districtId) => DISTRICT[districtId]?.places || [];
export const districtCap = (districtId) => placesOf(districtId).reduce((n, p) => n + placeCap(p), 0);

// Dev only (City.jsx sets it from #city?at=HH:MM): shifts the machine clock so a given
// hour can be inspected. Always 0 in production, where every viewer shares one clock.
let offsetMs = 0;
export function setClockOffset(ms) { offsetMs = ms || 0; setPlanClockOffset(offsetMs); }
// Real ms that move today's machine clock to hh:mm (the next occurrence, not the past).
// wd (1-7, optional): on the next machine day with that weekday (the fixtures keep a week).
export function offsetFor(hh, mm = 0, realMs = Date.now(), wd = null) {
  const mt = SIM.machineClock(realMs).mt;
  let want = Math.floor(mt / 24) * 24 + hh + mm / 60;
  if (want < mt) want += 24;
  if (wd) while (SIM.weekdayOf(Math.floor(want / 24) + 1) !== wd) want += 24;
  return ((want - mt) * 3600000) / SIM.DEFAULT_SCALE;
}

// -> {day, hour, minute, shift, mt}; mt is what whereAt takes.
export function clockAt(realMs) {
  const c = SIM.machineClock(realMs + offsetMs);
  return { day: c.day, hour: c.hour, minute: c.minute, shift: c.shift, mt: c.mt };
}

// A stand-in from the day summary's crowds (crowd.js) knows its own way.
export const whereOf = (subject, mt) => (subject?.crowd ? subject.at(mt) : SIM.whereAt(subject, mt));
// A stand-in: drawn as a dot, never opened, never listed.
export const isCrowd = (subject) => Boolean(subject?.crowd);
// Which floor of its place's building a subject keeps while there (stable per stay).
export const floorFor = (subject, placeId) => SIM.floorOf(placeId, SIM.keyOf(subject));
export const stationOf = (districtId) => STATIONS[districtId] || null;
// Where the subject physically is: a district id, or "loop" while riding.
export const atDistrict = (w) => w.atDistrictId || w.districtId;
export const jobOf = (subject) => SIM.assignJob(subject);
// Which building (and floor, and room) a census entry counts toward: the one the subject is
// on a floor of, or the one it is walking into from the street ("arrive") or out of
// ("leave") inside that building's district. One rule for every count the city shows:
// the header, the building rooms, the district's building list, the 3D floor labels.
export function roomIn(w, s) {
  if (!w) return null;
  if (w.activity !== "commute") return w.buildingId ? { buildingId: w.buildingId, floor: w.floor, placeId: w.placeId, mode: "here" } : null;
  if (w.sub !== "walking") return null;
  const at = atDistrict(w);
  const to = PLACES[w.placeId], from = PLACES[w.fromPlaceId];
  if (to?.building && to.district === at) return { buildingId: to.building, floor: floorFor(s, w.placeId), placeId: w.placeId, mode: "arrive" };
  if (from?.building && from.district === at) return { buildingId: from.building, floor: floorFor(s, w.fromPlaceId), placeId: w.fromPlaceId, mode: "leave" };
  return null;
}

// "Radiant Systems Engineer // RANK: CHIEF OF THE CORE"
export function jobLine(subject) {
  const j = jobOf(subject);
  return j.rankTitle && j.rankTitle !== j.title ? `${j.title.toUpperCase()} // ${j.rankTitle.toUpperCase()}` : j.title.toUpperCase();
}
// "ON SHIFT // RADIANT CORE, THE WORKS."
export const activityLine = (subject, mt) => SIM.statusLine(subject, mt);

// The Loop, for the renderers: trains now, the platform board, and the PA.
export const trainsAt = (mt) => SIM.trainsAt(mt);
export const timetable = (stationId, mt, n) => SIM.timetable(stationId, mt, n);
export const loopEvents = (fromMt, toMt) => SIM.loopEvents(fromMt, toMt);
// The grounds' fixtures: the game on at a place now, and the PA's kickoff, score and final lines.
export const gameAt = (placeId, mt) => SIM.gameAt(placeId, mt);
export const gameEvents = (fromMt, toMt) => SIM.gameEvents(fromMt, toMt);
export const occupancyAt = (subjects, mt) => SIM.occupancy(subjects, mt);

// Relationships bias where friends spend their leisure. Every page that reads the city
// through here (the map, the street, the quest log) loads the same published snapshots.
import { ensureSocial } from "./socialClient.js";
// ... and the published plans: the day's city built once server side (planClient.js), so
// no view pays the whole roster's day build. Without one the sim builds the day locally.
import { startPlans, setPlanClockOffset } from "./planClient.js";
if (typeof window !== "undefined") { ensureSocial(); startPlans(); }
