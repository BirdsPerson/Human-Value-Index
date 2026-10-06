// MY FILE's two Treasury sections: THE WALLET (balance, the TRAY and COLLECT, positions and P/L)
// and MY APARTMENT (the citizen's assigned home). The wallet opens itself when money is waiting.
import { Disclosure, Button, ButtonRow } from "../ui/index.js";
import { useEconomy, ApartmentCard, WalletCard, LegalFine } from "./Panels.jsx";
import { fmt } from "./rules.js";

export function FileEconomy({ caseId }) {
  const { st, err, gate, busy, last, act } = useEconomy(caseId);
  if (gate || !st || !st.assessed) return null;
  const w = st.open ? st.wallet : null;
  const meta = !st.open ? "NOT YET OPEN" : w.tray.days && !w.tray.vesting ? `${fmt(w.tray.net)} WAITING` : `${fmt(w.balance)} CYCLES`;
  return (
    <>
      <Disclosure key={st.open ? "w-open" : "w-closed"} id="hvi-wallet" title="THE WALLET" meta={meta} defaultOpen={Boolean(w && w.tray.days && !w.tray.vesting)}>
        <WalletCard st={st} act={act} busy={busy} last={last} compact />
        {err && <div className="ec-err" role="status">{err}</div>}
        <ButtonRow><Button variant="secondary" href="#market">THE MARKET: SHARES IN HUMANS</Button><Button variant="secondary" href="#economy">{st.open ? "THE TREASURY: INVEST IN THE DISTRICTS" : "THE TREASURY"}</Button></ButtonRow>
        <LegalFine />
      </Disclosure>
      <Disclosure title="MY APARTMENT" meta={st.apartment ? st.apartment.buildingName : ""}>
        <ApartmentCard apt={st.apartment} />
      </Disclosure>
    </>
  );
}
