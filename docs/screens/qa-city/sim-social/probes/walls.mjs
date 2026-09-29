import fs from "node:fs";
const R = "/Users/birdsperson/projects/human-value-index/src/city/";
const SIM = await import(R + "sim.js");
const { STREET_BUILDINGS, OUTDOOR } = await import(R + "streetKit.js");
const { fullRoster } = await import(R + "roster.js");
const pen = JSON.parse(fs.readFileSync(new URL("./pen.json", import.meta.url))).subjects;
const roster = fullRoster(pen); SIM.setRoster(roster); SIM.setSocialSnapshots(JSON.parse(fs.readFileSync(new URL("./social.json", import.meta.url))).snapshots);
const solid = STREET_BUILDINGS.filter(b => !b.outdoor);
const inside = (b, x, y) => x > b.rect.x && x < b.rect.x + b.rect.w && y > b.rect.y && y < b.rect.y + b.rect.h;
// iso footprint (shrunk)
const isoRect = (b) => { const ix = Math.min(1.6, b.rect.w * 0.14), iy = Math.min(1.6, b.rect.h * 0.14); return { x: b.rect.x + ix, y: b.rect.y + iy, w: b.rect.w - 2 * ix, h: b.rect.h - 2 * iy }; };
const T0 = Math.floor(SIM.machineClock(Date.now()).mt / 24) * 24;
let samples = 0, inOther = 0, inAny = 0, ex = [];
const perSubj = new Set();
for (let i = 0; i < 24 * 60; i++) {
  const T = T0 + i / 60;
  for (const s of roster) {
    const w = SIM.whereAt(s, T);
    if (w.activity !== "commute" || w.sub !== "walking") continue;
    samples++;
    const own = new Set([SIM.PLACES[w.placeId]?.building, SIM.PLACES[w.fromPlaceId]?.building]);
    const hit = solid.find(b => inside(b, w.x, w.y));
    if (hit) { inAny++; if (!own.has(hit.id)) { inOther++; perSubj.add(SIM.keyOf(s)); if (ex.length < 8) ex.push(`${SIM.keyOf(s)} @${(T%24).toFixed(2)} walking ${w.fromPlaceId}->${w.placeId} inside ${hit.id}`); } }
  }
}
console.log({ samples, insideAnySolidBuilding: inAny, insideAThirdBuilding: inOther, pct: (100 * inOther / samples).toFixed(1) + "%", subjects: perSubj.size });
console.log(ex.join("\n"));
