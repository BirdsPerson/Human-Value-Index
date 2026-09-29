import fs from "node:fs";
const R = "/Users/birdsperson/projects/human-value-index/src/city/";
const SIM = await import(R + "sim.js");
const { fullRoster, baseRoster } = await import(R + "roster.js");
const pen = JSON.parse(fs.readFileSync(new URL("./pen.json", import.meta.url))).subjects;
const social = JSON.parse(fs.readFileSync(new URL("./social.json", import.meta.url)));
const roster = fullRoster(pen);
SIM.setRoster(roster);
SIM.setSocialSnapshots(social.snapshots);
const start = Math.floor(SIM.machineClock(Date.now()).mt / 24) * 24 - 24 + 20; // yesterday 20:00
const step = 1 / 60, N = 60 * 24 * 7; // 30 machine hours
const prev = new Map();
const bad = [];
const kinds = {};
for (let i = 0; i <= N; i++) {
  const T = start + i * step;
  for (const s of roster) {
    const w = SIM.whereAt(s, T);
    const k = SIM.keyOf(s), p = prev.get(k);
    if (p) {
      const d = Math.hypot(w.x - p.w.x, w.y - p.w.y);
      const riding = w.sub === "riding" || p.w.sub === "riding" || w.sub === "alighting" && p.w.sub === "riding";
      const lim = riding ? 12 : 1.6;
      if (d > lim) {
        const kind = `${p.w.activity}/${p.w.sub||""}->${w.activity}/${w.sub||""}`;
        kinds[kind] = (kinds[kind] || 0) + 1;
        if (bad.length < 4000) bad.push({ k, T: T.toFixed(3), hh: ((T % 24)).toFixed(2), d: d.toFixed(1), kind, from: p.w.placeId, to: w.placeId, fromSub: p.w.sub, toSub: w.sub });
      }
    }
    prev.set(k, { w, T });
  }
}
console.log("roster", roster.length, "jumps", bad.length);
console.log(kinds);
const byK = {}; for (const b of bad) byK[b.k] = (byK[b.k] || 0) + 1;
console.log("subjects affected", Object.keys(byK).length);
console.log(bad.slice(0, 40));
fs.writeFileSync(new URL("./jumps.json", import.meta.url), JSON.stringify(bad, null, 1));
