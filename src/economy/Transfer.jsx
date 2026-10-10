// REQUEST A TRANSFER (in MY APARTMENT): the Housing Office's list of empty doors in the file's band
// (and one band up, when the score is on the line), one request at a time, processed on the next
// unpublished machine day; the furniture moves with the file. /api/housing decides everything;
// this only asks and shows the answer.
import { useEffect, useState } from "react";
import { Button, ButtonRow, PaLine } from "../ui/index.js";
import CSS from "./economy.css?inline";

// the Treasury's styles (Panels.jsx injects the same sheet): the tower's unit sheet opens this alone
function injectStyles() {
  if (typeof document === "undefined") return;
  let el = document.getElementById("ec-styles");
  if (!el) { el = document.createElement("style"); el.id = "ec-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}

async function call(method, caseId, body) {
  try {
    const r = method === "GET"
      ? await fetch(`/api/housing?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" })
      : await fetch("/api/housing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, ...body }) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "The Housing Office did not answer. You live where you lived." } };
  }
}
const soon = (m) => (m <= 1 ? "ANY MINUTE" : m < 120 ? `ABOUT ${m} MINUTES` : `ABOUT ${Math.round(m / 60)} HOURS`);

export function TransferDesk({ caseId, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => { injectStyles(); }, []);
  const [v, setV] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!open || !caseId) return undefined;
    let off = false;
    call("GET", caseId).then(r => { if (off) return; if (r.ok) setV(r.data); else setMsg({ err: true, text: r.data.error || "The Housing Office refused." }); });
    return () => { off = true; };
  }, [open, caseId]);
  if (!caseId) return null;
  if (!open) return <ButtonRow><Button variant="secondary" onClick={() => setOpen(true)}>REQUEST A TRANSFER</Button></ButtonRow>;
  const file = async () => {
    setBusy(true);
    const r = await call("POST", caseId, { action: "transfer", unit: pick });
    setBusy(false);
    if (r.data?.options || r.data?.pending) setV(r.data);
    setMsg(r.ok ? { text: r.data.last?.line } : { err: true, text: r.data.error || "The Housing Office refused." });
    if (r.ok) setPick(null);
  };
  return (
    <div className="ec-xfer">
      <div className="ec-tray-h">REQUEST A TRANSFER</div>
      {!v && !msg && <p className="ec-p ec-dim">THE CLERK IS FINDING THE FORM…</p>}
      {v && <p className="ec-p">{v.lines.intro}</p>}
      {v?.lines.assigned && <PaLine tag="HOUSING>" text={v.lines.assigned} />}
      {v?.pending && (
        <>
          <PaLine tag="HOUSING>" text={v.lines.pending} />
          <p className="ec-p ec-dim">THE MOVE LANDS IN {soon(v.pending.minutes)}.</p>
        </>
      )}
      {v && !v.pending && (v.options.length ? (
        <>
          {v.lines.up && <p className="ec-p ec-dim">{v.lines.up}</p>}
          <div className="ec-xfer-list" role="radiogroup" aria-label="Units the Housing Office will offer">
            {v.options.map(o => (
              <label key={o.unit} className={`ec-xfer-row${pick === o.unit ? " on" : ""}`}>
                <input type="radio" name="hvi-xfer" value={o.unit} checked={pick === o.unit} onChange={() => setPick(o.unit)} />
                <span className="n">UNIT {o.label} // {o.building}</span>
                <span className="lk">FLOOR {o.floor} // {o.rooms} ROOMS{o.up ? " // ONE BAND UP" : ""}</span>
              </label>
            ))}
          </div>
          <p className="ec-p ec-dim">PROCESSED ON MACHINE DAY {v.day}, IN {soon(v.minutes)}. YOUR FURNITURE MOVES WITH YOU. ONE REQUEST AT A TIME.</p>
          <ButtonRow><Button variant="primary" onClick={file} disabled={!pick || busy}>FILE THE REQUEST</Button></ButtonRow>
        </>
      ) : <p className="ec-p ec-dim">{v.lines.none}</p>)}
      {msg?.text && (msg.err ? <div className="ec-err" role="status">{msg.text}</div> : <PaLine tag="HOUSING>" text={msg.text} />)}
      {v?.log?.length > 0 && (
        <div className="ec-pos">
          <div className="ec-tray-h">THE HOUSING OFFICE'S RECORD</div>
          {v.log.map((e, i) => (
            <div key={i} className="ec-pos-row"><span className="lk">DAY {e.day}: {e.kind === "transfer" ? `TRANSFER REQUESTED TO ${e.to}, FOR DAY ${e.d}` : e.kind === "assign" ? `ASSIGNED ${e.to}, FROM DAY ${e.d}` : `MOVED INTO ${e.to}${e.moved ? `; ${e.moved} ${e.moved === 1 ? "PIECE" : "PIECES"} CARRIED` : ""}${e.stored ? `; ${e.stored} STORED` : ""}`}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
