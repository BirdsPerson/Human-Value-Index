import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow } from "../ui/index.js";
import { unreadCount, onMail } from "./client.js";

// MY FILE: DEPARTMENT MAIL's line (src/mail/Mail.jsx is the client). The unread count is the only
// notice the post ever gives (no pop-ups); the client opens at #mail.
export default function MyMail({ caseId }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    if (!caseId) return undefined;
    let off = false;
    unreadCount(caseId).then(u => { if (!off) setN(u); }).catch(e => { if (!off) setN(e.status === 401 || e.status === 403 ? -2 : -1); });
    const un = onMail(d => { if (d.caseId === caseId && Number.isFinite(d.unread)) setN(d.unread); });
    return () => { off = true; un(); };
  }, [caseId]);
  if (!caseId) return null;
  const meta = n == null ? "CHECKING" : n === -2 ? "SIGN IN TO READ" : n < 0 ? "MAIL ROOM CLOSED" : n ? `${n} UNREAD` : "NOTHING NEW";
  return (
    <Frame title="DEPARTMENT MAIL" meta={meta} id="hvi-mail">
      <p className="hvi-note" style={{ margin: "0 0 var(--s2)" }}>
        {n > 0 ? `${n} LETTER${n === 1 ? "" : "S"} UNREAD. JOB OFFERS, NOTICES, THE PAPER, A NEIGHBOUR OR TWO. NOBODY ELSE CAN WRITE TO YOU. YET.` : "THE DEPARTMENT WRITES A FEW TIMES A DAY, NEVER MORE. ALSO ON THE BEIGE PC IN YOUR FLAT, AND AT THE TERMINAL ON THE BOARDWALK."}
      </p>
      <ButtonRow><Button variant="secondary" href="#mail" aria-label={`Open Department Mail${n > 0 ? `, ${n} unread` : ""}`}>{n > 0 ? `OPEN MAIL (${n})` : "OPEN MAIL"}</Button></ButtonRow>
    </Frame>
  );
}
