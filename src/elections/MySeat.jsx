import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow } from "../ui/index.js";
import { SEAT } from "./content.js";
import { loadElections, resignSeat } from "./client.js";

// MY FILE: a council seat your citizen won (a write-in; docs/CITY_SPEC.md "Council elections").
// Shown only when the file's citizen was elected in the current or the last cycle and has not
// declined. DECLINE (before the swearing-in) or RESIGN (during the term) hands the seat to the
// race's runner-up for the rest of the term. Renders nothing otherwise.
export default function MySeat({ caseId }) {
  const [seats, setSeats] = useState([]);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    loadElections({ caseId }).then(d => { if (!off) setSeats(Array.isArray(d?.myseats) ? d.myseats : []); }).catch(() => {});
    return () => { off = true; };
  }, [caseId]);
  if (!caseId || (!seats.length && !msg)) return null;
  async function go(x) {
    setBusy(true);
    try {
      const r = await resignSeat(caseId, x.cycle, x.district);
      setMsg({ ok: true, text: SEAT.done(r.successor) });
      setSeats(s => s.filter(y => !(y.cycle === x.cycle && y.district === x.district)));
      loadElections({ force: true }).catch(() => {});
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); setAsk(null); }
  }
  return (
    <Frame title="THE COUNCIL" meta="YOUR SEAT">
      {seats.map(x => {
        const k = `${x.cycle}/${x.district}`;
        return (
          <div key={k} style={{ marginBottom: "var(--s2)" }}>
            <div className="hvi-note">{SEAT.elected(x.name, x.districtName || x.district)} {SEAT.term(x.seatDay, x.termEnd, x.sworn)}</div>
            {ask === k && <div className="hvi-note" role="alert">{SEAT.confirm}</div>}
            <ButtonRow stackOnMobile>
              {ask === k
                ? <><Button variant="primary" disabled={busy} onClick={() => go(x)}>{x.sworn ? "Resign the seat" : "Decline the seat"}</Button>
                    <Button variant="back" disabled={busy} onClick={() => setAsk(null)}>Keep it</Button></>
                : <><Button variant="secondary" href="#elections">The elections</Button>
                    <Button variant="secondary" onClick={() => setAsk(k)}>{x.sworn ? "Resign" : "Decline"}</Button></>}
            </ButtonRow>
          </div>
        );
      })}
      {msg && <div className="hvi-note" role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
    </Frame>
  );
}
