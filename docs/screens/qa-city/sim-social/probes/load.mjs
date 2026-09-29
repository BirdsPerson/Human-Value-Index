import fs from "node:fs";
const R = "/Users/birdsperson/projects/human-value-index/src/city/";
const SIM = await import(R + "sim.js");
const { fullRoster, baseRoster } = await import(R + "roster.js");
const pen = JSON.parse(fs.readFileSync(new URL("./pen.json", import.meta.url))).subjects;
const social = JSON.parse(fs.readFileSync(new URL("./social.json", import.meta.url)));
const full = fullRoster(pen), base = baseRoster();
const snap = (roster) => { const T = +process.argv[2] || SIM.machineClock(Date.now()).mt; const m = new Map(); for (const s of roster) m.set(SIM.keyOf(s), SIM.whereAt(s, T)); return m; };
const diff = (a, b, label) => { let n = 0, place = 0, ex = []; for (const [k, w] of a) { const v = b.get(k); if (!v) continue; const d = Math.hypot(w.x - v.x, w.y - v.y); if (d > 0.01) { n++; if (w.placeId !== v.placeId || w.activity !== v.activity) { place++; if (ex.length < 6) ex.push(`${k}: ${w.activity}@${w.placeId} -> ${v.activity}@${v.placeId} (${d.toFixed(1)} cells)`); } } } console.log(label, "moved", n, "changed place/activity", place); ex.forEach(e => console.log("   ", e)); };
for (const T of [ -1 ]) {}
// 1. first paint: base roster, no snapshots (the fetches have not returned)
SIM.setRoster(base);
const s1 = snap(base);
// 2. /api/pen arrives first
SIM.setRoster(full);
const s2 = snap(full);
diff(s1, s2, "pen arrives (62 on-file figures):");
// 3. /api/social arrives
SIM.setSocialSnapshots(social.snapshots);
const s3 = snap(full);
diff(s2, s3, "social arrives (whole roster):");
// alt order: social first then pen
SIM.clearSocialSnapshots(); SIM.setRoster(base); const a1 = snap(base); SIM.setSocialSnapshots(social.snapshots); const a2 = snap(base); diff(a1, a2, "social arrives before pen (62 figures):");
