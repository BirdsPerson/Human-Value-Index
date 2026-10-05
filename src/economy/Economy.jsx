// #economy: THE TREASURY (docs/design/ECONOMY_PROPERTY.md, slice 1). The wallet and the TRAY,
// the citizen's assigned apartment, the seven district industries with the file's holdings, and
// the Overlord's market commentary. Play currency only (terms §11). The server holds the ledger.
import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow, PaLine, ScreenHead } from "../ui/index.js";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { useEconomy, ApartmentCard, WalletCard, IndustryBoard, LegalFine } from "./Panels.jsx";
import { CLOSED_LINE, fmt } from "./rules.js";
import "../play/pages.css";

export default function Economy() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  const { st, err, gate, busy, last, act } = useEconomy(caseId);
  const board = st?.board;
  const assessed = Boolean(st?.assessed);

  return (
    <div className="ec">
      <ScreenHead title="THE TREASURY" meta="CYCLES: ISSUED DAILY, WORTH NOTHING, COUNTED CAREFULLY." />
      <p className="pg-lede">A PLAY ECONOMY. EVERY CASE FILE GETS 1,000 FREE CYCLES A DAY TO PUT INTO THE CITY'S INDUSTRIES, WHICH RISE AND FALL WITH THE CITY. NO REAL MONEY GOES IN OR COMES OUT.</p>
      {!caseId && <div className="pg-start"><Button variant="primary" href="#intake">GET A CASE FILE</Button><span className="pg-sub">ALREADY HAVE ONE? ENTER IT BELOW.</span></div>}
      {st && !st.open && <PaLine tag="TREASURY>" text={CLOSED_LINE} />}

      <Frame box title="THE WALLET" meta={st?.open && st?.wallet ? `${fmt(st.wallet.balance)} CYCLES` : st && !st.open ? "CLOSED" : undefined}>
        {!caseId && (
          <>
            <p className="ec-p">THE DEPARTMENT DISBURSES 1,000 CYCLES A DAY TO EVERY ASSESSED CITIZEN. ENTER YOUR CASE NUMBER, OR <a href="#intake">SIT FOR AN ASSESSMENT</a> FIRST.</p>
            <CaseLogon onRestored={(id) => setCaseId(id)} />
          </>
        )}
        {caseId && gate === 403 && <p className="ec-p">YOUR FILE HAS NO ASSESSMENT ON IT. THE TREASURY PAYS ASSESSED CITIZENS ONLY. <a href="#intake">BE ASSESSED</a>.</p>}
        {caseId && gate === 404 && <p className="ec-p">NO SUCH FILE ON THIS TERMINAL'S RECORD. <a href="#intake">SIT FOR AN ASSESSMENT</a>.</p>}
        {caseId && st?.assessed && <WalletCard st={st} act={act} busy={busy} last={last} />}
        {caseId && st?.assessed && !st.open && <p className="ec-p ec-dim">WHEN IT OPENS: 1,000 CYCLES A DAY, NET OF WHAT YOUR CITIZEN SPENDS, KEPT 7 DAYS IN THE TRAY.</p>}
        {err && <div className="ec-err" role="status">{err}</div>}
        <LegalFine />
      </Frame>

      {caseId && st?.apartment && (
        <Frame title="MY APARTMENT" meta="ASSIGNED. FREE. PERMANENT.">
          <ApartmentCard apt={st.apartment} />
        </Frame>
      )}

      <Frame title="THE DISTRICT INDUSTRIES" meta={board?.closedThrough ? `CLOSED THROUGH ${board.closedThrough}` : "NO CLOSE YET"}>
        {!board ? <div className="ec-dim">READING THE CITY'S RECORD…</div> : (
          <IndustryBoard board={board} wallet={st?.wallet} open={Boolean(st?.open)} act={act} busy={busy} assessed={assessed} />
        )}
      </Frame>

      {board?.commentary?.length > 0 && (
        <Frame title="MARKET COMMENTARY" meta="THE OVERLORD, UNSOLICITED">
          <ul className="ec-comm">{board.commentary.map((l, i) => <li key={i}>{l}</li>)}</ul>
          {board.citizens > 0 && <p className="ec-fine">{fmt(board.citizens)} {board.citizens === 1 ? "CITIZEN DRAWS" : "CITIZENS DRAW"} AN ALLOWANCE. THE LEDGER IS RANKED BY NOBODY. THE DEPARTMENT KEEPS CYCLES AND WORTH APART ON PURPOSE.</p>}
        </Frame>
      )}

      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#file">My file</Button>
      </ButtonRow>
    </div>
  );
}
