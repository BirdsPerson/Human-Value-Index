import { useEffect, useState } from "react";
import { Disclosure } from "../ui/index.js";
import { clockAt } from "./simApi.js";
import { boutsOn, boutAt, billLine, resultLine, cardFor, SLOT_H, CARD_DAY, CARD_FROM, GRIEVANCE_FROM } from "./pit.js";
import { tennisAt, TENNIS_FIXTURES } from "./tennis.js";
import { weekdayOf } from "./sim.js";

// THE FIGHT BOARD and the club's fixture, as a list (the master plan, 2026-09-30): the same card
// the Pit's board shows on the forecourt (venueDraw.js), readable without the canvas. The next
// card (Fridays), tonight's grievances (booked by the social ledger, social.js), the results.
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
export default function PitPanel({ districtId = null }) {
  const [c, setC] = useState(() => clockAt(Date.now()));
  useEffect(() => { const iv = setInterval(() => { if (!document.hidden) setC(clockAt(Date.now())); }, 5000); return () => clearInterval(iv); }, []);
  if (districtId && !["works", "sprawl"].includes(districtId)) return null;
  const mt = c.mt, day = c.day;
  // tonight's bouts, else the next card
  let list = boutsOn(day), when = "TONIGHT";
  if (!list.length) { for (let d = day + 1; d <= day + 7; d++) if (weekdayOf(d) === CARD_DAY) { list = cardFor(d) || []; when = d === day + 1 ? "TOMORROW" : `MACHINE DAY ${d}`; break; } }
  const on = boutAt(mt), m = tennisAt(mt);
  const meta = on ? `NOW: ${billLine(on.bout)}` : `${when}: ${list.length} BOUT${list.length === 1 ? "" : "S"}`;
  const nextTennis = (() => { for (let d = day; d <= day + 7; d++) for (const f of TENNIS_FIXTURES) if (f.days.includes(weekdayOf(d)) && (d > day || c.hour < f.to)) return `${d === day ? "TODAY" : `MACHINE DAY ${d}`} ${hhmm(f.from)} // ${f.name}`; return null; })();
  return (
    <Disclosure className="hvi-city-disc" title="THE PIT // THE FIGHT BOARD" meta={meta}>
      <div className="hvi-civic-fx">FRIDAYS {hhmm(CARD_FROM)} THE CARD // NIGHTLY {hhmm(GRIEVANCE_FROM)} GRIEVANCES, WHEN THE LEDGER BOOKS ONE. NOBODY IS HARMED. EVERYBODY IS ASSESSED.</div>
      {list.map(b => {
        const t0 = (b.day - 1) * 24 + b.from, done = mt >= t0 + SLOT_H - 0.06, now = on && on.bout.id === b.id;
        return <div key={b.id} className="hvi-civic-fx">{hhmm(b.from)} {billLine(b)}{done ? ` // ${resultLine(b)}` : now ? " // IN PROGRESS" : ""}</div>;
      })}
      <div className="hvi-civic-fx">THE TENNIS CLUB // {m ? m.status : nextTennis || "NO FIXTURE"}</div>
    </Disclosure>
  );
}
