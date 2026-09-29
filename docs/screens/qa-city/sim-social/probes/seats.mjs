import fs from "node:fs";
const R = "/Users/birdsperson/projects/human-value-index/src/city/";
const SIM = await import(R + "sim.js");
const { fullRoster } = await import(R + "roster.js");
const pen = JSON.parse(fs.readFileSync(new URL("./pen.json", import.meta.url))).subjects;
const roster = fullRoster(pen); SIM.setRoster(roster); SIM.setSocialSnapshots(JSON.parse(fs.readFileSync(new URL("./social.json", import.meta.url))).snapshots);
const T0 = Math.floor(SIM.machineClock(Date.now()).mt / 24) * 24;
let prev = null, jumps = 0, stays = 0; const ex = [];
for (let i = 0; i < 24 * 60; i++) {
  const T = T0 + i / 60, rooms = new Map();
  for (const s of roster) { const w = SIM.whereAt(s, T); if (w.activity === "commute" || !w.buildingId) continue; const k = `${w.buildingId}|${w.floor}|${w.placeId}`; (rooms.get(k) || rooms.set(k, []).get(k)).push(s.name); }
  if (prev) for (const [k, list] of rooms) { const p = prev.get(k) || []; list.forEach((n, idx) => { const j = p.indexOf(n); if (j < 0) return; stays++; if (j !== idx) { jumps++; if (ex.length < 5) ex.push(`${(T%24).toFixed(2)} ${k}: ${n} seat ${j} -> ${idx}`); } }); }
  prev = rooms;
}
console.log({ personMinutesStayed: stays, seatChanges: jumps, perMachineDay: jumps }); console.log(ex.join("\n"));
