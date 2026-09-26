// The views' single door into the simulation (sim.js, contract in docs/CITY_SPEC.md).
// Everything the map and the district views read goes through here. Pure, no DOM.

import * as SIM from "./sim.js";

export const { DISTRICTS, PLACES, JOBS, BUS } = SIM;
export const DISTRICT = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));

export const placeName = (id) => PLACES[id]?.name || String(id || "").toUpperCase();
export const placeCap = (id) => PLACES[id]?.cap || 0;
export const placeKind = (id) => PLACES[id]?.kind || "place";
export const districtName = (id) => (id === "bus" ? "THE DATA BUS" : DISTRICT[id]?.name || String(id || "").toUpperCase());
export const placesOf = (districtId) => DISTRICT[districtId]?.places || [];
export const districtCap = (districtId) => placesOf(districtId).reduce((n, p) => n + placeCap(p), 0);

// Dev only (City.jsx sets it from #city?at=HH:MM): shifts the machine clock so a given
// hour can be inspected. Always 0 in production, where every viewer shares one clock.
let offsetMs = 0;
export function setClockOffset(ms) { offsetMs = ms || 0; }
// Real ms that move today's machine clock to hh:mm (the next occurrence, not the past).
export function offsetFor(hh, mm = 0, realMs = Date.now()) {
  const mt = SIM.machineClock(realMs).mt;
  let want = Math.floor(mt / 24) * 24 + hh + mm / 60;
  if (want < mt) want += 24;
  return ((want - mt) * 3600000) / SIM.DEFAULT_SCALE;
}

// -> {day, hour, minute, shift, mt}; mt is what whereAt takes.
export function clockAt(realMs) {
  const c = SIM.machineClock(realMs + offsetMs);
  return { day: c.day, hour: c.hour, minute: c.minute, shift: c.shift, mt: c.mt };
}

export const whereOf = (subject, mt) => SIM.whereAt(subject, mt);
// Where the subject physically is: a district id, or "bus" while riding.
export const atDistrict = (w) => w.atDistrictId || w.districtId;
export const jobOf = (subject) => SIM.assignJob(subject);

// "Radiant Systems Engineer // RANK: CHIEF OF THE CORE"
export function jobLine(subject) {
  const j = jobOf(subject);
  return j.rankTitle && j.rankTitle !== j.title ? `${j.title.toUpperCase()} // ${j.rankTitle.toUpperCase()}` : j.title.toUpperCase();
}
// "ON SHIFT // RADIANT CORE, THE WORKS."
export const activityLine = (subject, mt) => SIM.statusLine(subject, mt);
