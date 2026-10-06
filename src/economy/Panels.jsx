// THE TREASURY's pieces, shared by MY FILE (two sections) and #economy (the whole page):
// MY APARTMENT, THE WALLET (balance, the TRAY and COLLECT, positions, the ledger's last lines)
// and THE DISTRICT INDUSTRIES (the board, with buy / sell). The server decides every number.
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonRow, PaLine } from "../ui/index.js";
import { loadEconomy, econAct, newNonce } from "./client.js";
import { CLOSED_LINE, UBI_LINE, LEGAL_LINES, MIN_INVEST, LOCK_DAYS, fmt, fmtSigned, fmtPpm } from "./rules.js";
import CSS from "./economy.css?inline";

export function injectEconomyStyles() {
  let el = document.getElementById("ec-styles");
  if (!el) { el = document.createElement("style"); el.id = "ec-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}

// The file's economy, loaded once per case; act() posts and keeps the page true to the answer.
export function useEconomy(caseId) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  const [gate, setGate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  useEffect(() => { injectEconomyStyles(); }, []);
  useEffect(() => {
    let off = false;
    setSt(null); setGate(null); setErr("");
    loadEconomy(caseId || null).then(d => { if (!off) setSt(d); })
      .catch(e => { if (!off) { if (e.status === 403 || e.status === 404) setGate(e.status); else setErr(e.message); } });
    return () => { off = true; };
  }, [caseId]);
  const act = useCallback(async (action, body = {}) => {
    setBusy(true); setErr("");
    const r = await econAct(caseId, action, body);
    setBusy(false);
    if (r.data?.wallet) setSt(s => ({ ...s, wallet: r.data.wallet, ...(r.data.board ? { board: r.data.board } : {}) }));
    if (!r.ok) setErr(r.data?.error || "The Treasury refused.");
    else setLast(r.data.last || null);
    return r;
  }, [caseId]);
  return { st, err, gate, busy, last, act };
}

const nameOf = (board, id) => board?.industries?.find(i => i.id === id)?.name || String(id).toUpperCase();
const ppmTone = (p) => (p > 0 ? "ec-up" : p < 0 ? "ec-down" : "ec-flat");
const dateOf = (iso) => (iso ? String(iso).slice(5, 10).replace("-", "/") : "");

// ---- MY APARTMENT ------------------------------------------------------------------------------
export function ApartmentCard({ apt }) {
  if (!apt) return <p className="ec-p ec-dim">THE HOUSING OFFICE CANNOT LOCATE YOUR FILE'S ASSIGNMENT. THIS IS NOT YOUR PROBLEM. IT WILL BECOME YOUR PROBLEM.</p>;
  return (
    <div className="ec-apt">
      <div className="ec-kv">
        <span className="k">BUILDING</span><span className="v ec-strong">{apt.buildingName}</span>
        <span className="k">DISTRICT</span><span className="v">{apt.districtName}</span>
        <span className="k">FLOOR</span><span className="v">{apt.floorCode || "G"}{apt.floorName ? ` // ${apt.floorName}` : ""}</span>
        <span className="k">UNIT</span><span className="v">{apt.unit}</span>
        <span className="k">ASSIGNED BY</span><span className="v">TIER{apt.tier ? `: ${apt.tier}` : ""}</span>
        <span className="k">RENT</span><span className="v">NONE. TENURE: {apt.tenure}.</span>
      </div>
      <p className="ec-p">YOUR CITIZEN SLEEPS HERE. THE DEPARTMENT CHOSE IT FROM YOUR TIER, AS IT CHOOSES EVERYTHING. IT CANNOT BE LOST, SOLD OR IMPROVED. A BETTER TIER IS A BETTER BUILDING. CYCLES ARE NOT A TIER.</p>
      <ButtonRow><Button variant="secondary" href={apt.href}>SEE IT IN THE CITY</Button></ButtonRow>
    </div>
  );
}

// ---- THE WALLET ----------------------------------------------------------------------------------
export function WalletCard({ st, act, busy, last, compact = false }) {
  if (!st) return null;
  if (!st.open) return <PaLine tag="TREASURY>" text={CLOSED_LINE} />;
  const w = st.wallet;
  const T = w.tray;
  return (
    <div className="ec-wallet">
      <div className="ec-bal" aria-label={`Balance ${fmt(w.balance)} CYCLES`}>
        <span className="ec-bal-n">{fmt(w.balance)}</span><span className="ec-bal-u">CYCLES</span>
        {w.invested > 0 && <span className="ec-bal-x">+ {fmt(w.invested)} INVESTED // WORTH {fmt(w.worth)}</span>}
      </div>
      <div className="ec-tray">
        <div className="ec-tray-h">THE TRAY</div>
        {T.vesting ? (
          <p className="ec-p">YOUR ALLOWANCE VESTS ON {w.vestDay}, YOUR FILE'S THIRD DAY. THE DEPARTMENT LIKES TO SEE WHETHER YOU STAY.</p>
        ) : T.days ? (
          <>
            <div className="ec-kv">
              <span className="k">WAITING</span><span className="v">{T.days} {T.days === 1 ? "DAY" : "DAYS"} x {fmt(st.ubi || 1000)} = {fmt(T.gross)}</span>
              <span className="k">YOUR CITIZEN SPENT</span><span className="v">−{fmt(T.spend)} AT THE SHOPS ITS SCHEDULE VISITS</span>
              <span className="k">NET</span><span className="v ec-strong">{fmt(T.net)} CYCLES</span>
              {T.lost > 0 && (<><span className="k">RETURNED</span><span className="v ec-dim">{T.lost} OLDER {T.lost === 1 ? "DAY" : "DAYS"} TO THE COMMONS. THE TRAY HOLDS {st.trayDays || 7}.</span></>)}
            </div>
            <p className="ec-p ec-ubi">{UBI_LINE}</p>
            <ButtonRow><Button variant="primary" onClick={() => act("collect")} disabled={busy}>COLLECT {fmt(T.net)}</Button></ButtonRow>
          </>
        ) : (
          <p className="ec-p ec-dim">NOTHING WAITING. THE NEXT DISBURSEMENT LANDS AT 00:00 UTC. THE TRAY KEEPS {st.trayDays || 7} DAYS; COLLECT AT LEAST WEEKLY.</p>
        )}
      </div>
      {last?.line && <PaLine tag="TREASURY>" text={last.line} />}
      {w.positions.length > 0 && (
        <div className="ec-pos">
          <div className="ec-tray-h">POSITIONS</div>
          {w.positions.map(p => (
            <div key={p.industry} className="ec-pos-row">
              <span className="n">{p.name}</span>
              <span className="v">{fmt(p.value)}</span>
              <span className={`pl ${p.pl > 0 ? "ec-up" : p.pl < 0 ? "ec-down" : "ec-flat"}`}>{fmtSigned(p.pl)}</span>
              <span className="lk">{p.lockedUntil && Date.parse(p.lockedUntil) > Date.now() ? `HELD TO ${dateOf(p.lockedUntil)}` : "FREE TO SELL"}</span>
            </div>
          ))}
        </div>
      )}
      {w.shares?.length > 0 && (
        <div className="ec-pos">
          <div className="ec-tray-h">SHARES IN HUMANS <a href="#market">// THE MARKET</a></div>
          {w.shares.map(p => (
            <div key={p.slug} className="ec-pos-row">
              <span className="n"><a href={`#market/${p.slug}`}>{p.name.toUpperCase()}</a> <span className="ec-dim">x{fmt(p.units)}</span></span>
              <span className="v">{fmt(p.value)}</span>
              <span className={`pl ${p.pl > 0 ? "ec-up" : p.pl < 0 ? "ec-down" : "ec-flat"}`}>{fmtSigned(p.pl)}</span>
              <span className="lk">{p.halted ? "HALTED TODAY" : p.lockedUntil && Date.parse(p.lockedUntil) > Date.now() ? `HELD TO ${dateOf(p.lockedUntil)} ${String(p.lockedUntil).slice(11, 16)} UTC` : "FREE TO SELL"}</span>
            </div>
          ))}
        </div>
      )}
      {w.escrow > 0 && <p className="ec-p ec-dim">{fmt(w.escrow)} CYCLES ON ORDER. THEY FILL AT THE NEXT TICK.</p>}
      {!compact && w.recent.length > 0 && (
        <div className="ec-led">
          <div className="ec-tray-h">THE LEDGER, LATEST FIRST</div>
          {w.recent.slice(0, 8).map((t, i) => <LedgerLine key={i} t={t} />)}
        </div>
      )}
    </div>
  );
}

function LedgerLine({ t }) {
  const m = t.memo || {};
  let what;
  if (t.kind === "ubi") what = `ALLOWANCE x${(m.days || []).length}, LESS YOUR CITIZEN'S SPENDING`;
  else if (t.kind === "buy") what = `BOUGHT ${String(m.industry || "").toUpperCase()}`;
  else if (t.kind === "sell") what = `SOLD ${String(m.industry || "").toUpperCase()}`;
  else if (t.kind === "return") what = `${String(m.industry || "").toUpperCase()} RETURNED ${fmtPpm(m.ppm || 0)}`;
  else if (t.kind === "oplace") what = `ORDER: ${String(m.slug || "").toUpperCase()}`;
  else if (t.kind === "ofill") what = `${m.side === "sell" ? "SOLD" : "BOUGHT"} ${m.units || 0} ${String(m.slug || "").toUpperCase()}${m.side === "buy" && m.units ? "" : m.side === "buy" ? " (REFUNDED)" : ""}`;
  else if (t.kind === "levy") what = "CONCENTRATION LEVY";
  else what = t.kind.toUpperCase();
  const amt = t.kind === "return" ? t.inv : t.cash;
  return (
    <div className="ec-led-row">
      <span className="d">{dateOf(t.day || t.at)}</span>
      <span className="w">{what}</span>
      <span className={`a ${amt > 0 ? "ec-up" : amt < 0 ? "ec-down" : ""}`}>{fmtSigned(amt)}</span>
    </div>
  );
}

// ---- THE DISTRICT INDUSTRIES -----------------------------------------------------------------------
function Spark({ history }) {
  const pts = (history || []).slice(0, 7).reverse();
  if (!pts.length) return <span className="ec-spark ec-dim" aria-hidden="true">·······</span>;
  return (
    <span className="ec-spark" aria-hidden="true">
      {pts.map((h, i) => <i key={i} className={ppmTone(h.ppm)} style={{ height: `${Math.max(2, Math.round((Math.abs(h.ppm) / 10000) * 14) + 2)}px` }} />)}
    </span>
  );
}

export function IndustryBoard({ board, wallet, open, act, busy, assessed }) {
  const [sel, setSel] = useState(null);
  const [amt, setAmt] = useState("");
  const [nonce, setNonce] = useState(newNonce);
  if (!board) return null;
  const total = board.industries.reduce((n, i) => n + i.invested, 0);
  const pos = Object.fromEntries((wallet?.positions || []).map(p => [p.industry, p]));
  const order = async (action) => {
    const n = Math.floor(Number(amt));
    const r = await act(action, { industry: sel, amount: n, nonce });
    if (r.ok) { setAmt(""); setNonce(newNonce()); }
  };
  return (
    <div className="ec-board">
      <div className="ec-board-head" aria-hidden="true">
        <span>INDUSTRY</span><span>SHARE OF CYCLES</span><span>YESTERDAY</span><span>7 DAYS</span><span>INDICATED</span>
      </div>
      {board.industries.map(i => {
        const mine = pos[i.id];
        const fair = total > 0 && i.share > 2 / board.industries.length;
        return (
          <div key={i.id} className={`ec-ind${sel === i.id ? " on" : ""}`}>
            <button type="button" className="ec-ind-row" onClick={() => setSel(sel === i.id ? null : i.id)} aria-expanded={sel === i.id}
              aria-label={`${i.name}: share ${(i.share * 100).toFixed(0)} percent, yesterday ${i.last ? fmtPpm(i.last.ppm) : "not closed"}`}>
              <span className="n">{i.name}{mine ? <b className="ec-mine"> // YOURS {fmt(mine.value)}</b> : null}<small>{i.line}</small></span>
              <span className="sh">
                <span className="ec-bar"><span style={{ width: `${Math.round(i.share * 100)}%` }} className={fair ? "crowd" : undefined} /></span>
                <span className="pct">{total ? `${(i.share * 100).toFixed(0)}%` : "—"}{i.holders ? ` // ${i.holders}` : ""}</span>
              </span>
              <span className={`y ${i.last ? ppmTone(i.last.ppm) : "ec-dim"}`}>{i.last ? fmtPpm(i.last.ppm) : "—"}</span>
              <Spark history={i.history} />
              <span className={`ind ${i.indicated ? ppmTone(i.indicated.ppm) : "ec-dim"}`}>{i.indicated ? fmtPpm(i.indicated.ppm) : "—"}</span>
            </button>
            {sel === i.id && (
              <div className="ec-order">
                <p className="ec-p ec-dim">READ FROM {i.districts.map(d => d.toUpperCase()).join(" + ")}: MOOD, FOOT TRAFFIC AND SHOP TAKINGS IN YESTERDAY'S PUBLISHED SUMMARY.{i.indicated && i.indicated.herd < 1 ? ` CROWDED: GAINS THINNED TO ${(i.indicated.herd * 100).toFixed(0)}%.` : ""}</p>
                {!open ? <PaLine tag="TREASURY>" text={CLOSED_LINE} /> : !assessed ? (
                  <p className="ec-p">ASSESSED CITIZENS INVEST. <a href="#intake">BE ASSESSED</a>, THEN COLLECT AN ALLOWANCE.</p>
                ) : (
                  <>
                    <label className="ec-amt">
                      <span>AMOUNT &gt;</span>
                      <input inputMode="numeric" pattern="[0-9]*" value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))} placeholder={String(MIN_INVEST)} aria-label="Amount in CYCLES" />
                      <span className="ec-dim">CYCLES // HAVE {fmt(wallet?.balance || 0)}</span>
                    </label>
                    <ButtonRow>
                      <Button variant="primary" onClick={() => order("buy")} disabled={busy || !(Number(amt) >= MIN_INVEST)}>BUY</Button>
                      {mine && <Button variant="secondary" onClick={() => order("sell")} disabled={busy || !(Number(amt) > 0)}>SELL</Button>}
                      {mine && <Button variant="secondary" onClick={() => setAmt(String(mine.value))} disabled={busy}>ALL {fmt(mine.value)}</Button>}
                    </ButtonRow>
                    <p className="ec-p ec-dim">MIN {MIN_INVEST}. HELD {LOCK_DAYS} DAYS AFTER A PURCHASE. RETURNS POST AT THE DAILY CLOSE, 00:00 UTC.</p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="ec-fine">DAILY YIELD = 0.3% x (DISTRICT INDEX − 1) + 0.2%, HELD TO −1%..+1%. A CROWDED INDUSTRY'S GAINS ARE THINNED: DOUBLE A FAIR SHARE EARNS A THIRD. LOSSES ARE NEVER THINNED. INDICATED: TODAY'S READING AT TODAY'S SHARES; THE CLOSE MAY DIFFER.</p>
    </div>
  );
}

export function LegalFine() {
  return <p className="ec-fine">{LEGAL_LINES.join(" ")} <a href="#terms">TERMS §11</a>.</p>;
}
