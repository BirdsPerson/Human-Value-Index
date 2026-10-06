// THE MOUNTAIN, skiable: the other people on it. The city's own skiers (src/city/mountainGeo.js
// skierAt: their lifts, their queues, their trails, picked by their rating, falls and all), on the
// city's calendar: the racers on file (city/race.js) and the skiers on file ride the upper mountain;
// a seeded crowd of visitors the slopes. The city's clock runs a machine hour a real minute; on the
// mountain the people move at a skier's pace (PACE machine seconds a real second), from the machine
// time the page opened at. Render only: nobody here touches the rider or the record. They do not talk.
import { skierAt, SKI_ON_FILE, h01 } from "../../city/mountainGeo.js";
import { RACERS } from "../../city/race.js";
import { CELL, STOREY } from "./world.js";

export const PACE = 2.5;
const PEOPLE = [
  ...RACERS.map(([slug, name, disc, rating]) => ({ s: { slug, name, competence: rating, breakdown: { physical: rating, adaptability: rating } }, place: "upper-mountain", board: disc === "BOARD" })),
  ...Object.keys(SKI_ON_FILE).filter(k => !RACERS.some(r => r[0] === k)).map(slug => ({ s: { slug, name: slug.toUpperCase().replace(/-/g, " ") }, place: "upper-mountain" })),
  ...Array.from({ length: 34 }, (_, i) => ({ s: { slug: `visitor-${i + 1}`, name: `VISITOR ${i + 1}`, competence: 30 + Math.floor(h01(`ski|vis|${i}`) * 50) }, place: i % 3 ? "slopes" : "upper-mountain" })),
];
// -> [{x, y, z, d, mode, board, k, fallen}] in metres
export function npcsAt(mt) {
  const out = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const P = PEOPLE[i];
    let a;
    try { a = skierAt(P.s, P.place, mt, [40 + (i % 9), -23.4]); } catch { continue; }
    if (!a) continue;
    out.push({ x: a.x * CELL, y: a.y * CELL, z: a.h * STOREY, d: a.d, mode: a.mode, board: a.board, k: i + 1, fallen: Boolean(a.fallen), name: P.s.name });
  }
  return out;
}
export const npcCount = PEOPLE.length;
