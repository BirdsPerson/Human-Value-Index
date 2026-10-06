// #shop[/<store>]: THE SHOPS (docs/design/ECONOMY_PROPERTY.md, "The shops"). The directory, each
// store's interior (its sign, its wall, the rails with the real pieces on them; tap one for its card:
// on YOUR file photo in the mirror, the price in CYCLES, BUY), and the closet and your furniture.
// The server prices, stocks and rules everything; CYCLES spent here are burned. Play currency only.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Frame, Button, ButtonRow, PaLine, ScreenHead, ListRow } from "../ui/index.js";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { useShops, Closet, Furnish, Mirror, GarmentPx, PiecePx, outfitWords, injectShopStyles } from "./parts.jsx";
import { newNonce } from "./client.js";
import { STORES, storeOf, stockOf, itemOf, collectionOf, fmtC, SLOT_NAME, SHOP_LINES, EFFECTS_FROM_DAY, MAX_FURN_EACH, chainOf } from "../economy/shops.js";
import { WEAR } from "../wear.js";
import { CATALOG } from "../city/furniture.js";
import { machineClock } from "../city/sim.js";
import { CLOSED_LINE } from "../economy/rules.js";
import "../play/pages.css";

const ROOMS_WORDS = { bedroom: "BEDROOM", kitchen: "KITCHEN", living: "LIVING ROOM", bath: "BATHROOM", study: "STUDY" };

export default function Shops({ route }) {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  useEffect(() => { injectShopStyles(); }, []);
  const S = useShops(caseId);
  const storeId = String(route || "").replace(/^#shop\/?/, "").split("?")[0];
  const store = storeOf(storeId);
  const md = S.v?.machineDay ?? machineClock(Date.now()).day;
  return store ? <Store store={store} S={S} caseId={caseId} md={md} setCaseId={setCaseId} /> : <Directory S={S} caseId={caseId} md={md} setCaseId={setCaseId} />;
}

function Wallet({ S, caseId, setCaseId }) {
  const { v, gate, err } = S;
  if (!caseId) return (
    <Frame title="YOUR FILE" meta="TO BUY">
      <p className="sh-p">THE SHOPS TAKE CYCLES, THE DEPARTMENT'S DAILY ALLOWANCE. ENTER YOUR CASE NUMBER, OR <a href="#intake">SIT FOR AN ASSESSMENT</a> FIRST.</p>
      <CaseLogon onRestored={(id) => setCaseId(id)} />
    </Frame>
  );
  if (gate === 403) return <p className="sh-p">ONLY ASSESSED CITIZENS SHOP. <a href="#intake">BE ASSESSED</a>.</p>;
  if (v && v.open === false) return <PaLine tag="TILL>" text={CLOSED_LINE} />;
  if (err && !v) return <div className="sh-err" role="status">{err}</div>;
  if (!v) return <p className="sh-p sh-dim">CHECKING YOUR WALLET…</p>;
  return (
    <p className="sh-p">
      YOU HAVE <span className="sh-cyc">{fmtC(v.balance)} CYCLES</span>.{" "}
      {!v.wallet ? <><a href="#economy">COLLECT YOUR ALLOWANCE</a> ONCE TO OPEN A WALLET.</> : <a href="#economy">THE TREASURY</a>}
    </p>
  );
}

// ---- the directory ---------------------------------------------------------------------------------
function Directory({ S, caseId, md, setCaseId }) {
  const col = collectionOf(md);
  return (
    <div className="ec">
      <ScreenHead title="THE SHOPS" meta={`${col} STOCK // CYCLES ONLY`} />
      <p className="pg-lede">CLOTHES FOR YOUR FILE PHOTO, FURNITURE FOR THE FLAT YOU WERE ASSIGNED. PAID IN CYCLES, WHICH THE SHOPS DESTROY. NO REAL MONEY GOES IN OR COMES OUT.</p>
      <Wallet S={S} caseId={caseId} setCaseId={setCaseId} />
      <Frame title="THE STORES" meta={`${STORES.length} ON RECORD`}>
        {STORES.map(st => <ListRow key={st.id} lead={st.kind === "furniture" ? "HOME" : st.tier === "boutique" ? "$$$" : st.tier === "dept" ? "$$" : "$"} label={`${st.name} // ${st.where}`} tag="GO IN" href={`#shop/${st.id}`} aria-label={`${st.name}, ${st.where}. ${st.line} Go in.`} />)}
        <p className="sh-fine">THE STOCK TURNS WITH THE CITY'S SEASON (A REAL MONTH). THIS IS THE {col} COLLECTION.</p>
      </Frame>
      {caseId && S.v && (
        <>
          <Frame title="YOUR CLOSET" meta={`${(S.v.items || []).filter(i => i.kind === "wear").length} PIECES`}><Closet caseId={caseId} S={S} /></Frame>
          <Frame title="YOUR FURNITURE" meta={S.v.apartment?.flat ? `FLAT ${S.v.apartment.flat.label}, ${S.v.apartment.buildingName}` : "NO CUTAWAY FLAT"}>
            <Furnish S={S} />
            {S.v.apartment?.href && <ButtonRow><Button variant="secondary" href={S.v.apartment.href}>SEE YOUR FLAT IN THE CITY</Button></ButtonRow>}
          </Frame>
        </>
      )}
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#file">My file</Button>
      </ButtonRow>
    </div>
  );
}

// ---- a store ----------------------------------------------------------------------------------------
function Store({ store, S, caseId, md, setCaseId }) {
  const rails = useMemo(() => stockOf(store.id, md), [store.id, md]);
  const [open, setOpen] = useState(null);   // sku
  const lastFocus = useRef(null);
  const v = S.v;
  const owned = useMemo(() => {
    const m = new Map();
    for (const i of v?.items || []) m.set(i.sku, (m.get(i.sku) || 0) + 1);
    return m;
  }, [v]);
  const show = (sku) => { lastFocus.current = document.activeElement; setOpen(sku); };
  const close = () => { setOpen(null); setTimeout(() => lastFocus.current?.focus?.(), 0); };
  const furn = store.kind === "furniture";
  return (
    <div className="ec">
      <ScreenHead title={store.name} meta={store.where} />
      <Wallet S={S} caseId={caseId} setCaseId={setCaseId} />
      <div className="sh-in" style={{ "--wall": store.wall, "--acc": store.accent }}>
        <div className="sh-sign"><b>{store.name}</b><span>{store.line}</span></div>
        {rails.map(r => (
          <section key={r.rail} className="sh-rail" aria-label={r.rail}>
            <div className="sh-rail-h">{r.rail}{furn ? "" : ` // ${collectionOf(md)}`}</div>
            {!furn && <div className="sh-bar" aria-hidden="true" />}
            <div className={`sh-hang${furn ? " shelf" : ""}`}>
              {r.items.map(it => {
                const n = owned.get(it.sku) || 0;
                return (
                  <button key={it.sku} type="button" className="sh-tag" onClick={() => show(it.sku)} aria-pressed={open === it.sku}
                    aria-label={`${it.name}${it.way ? `, ${it.way}` : ""}. ${fmtC(it.price)} CYCLES.${n ? furn ? ` You own ${n}.` : " You own it." : ""}`}>
                    {!furn && <span className="sh-hook" aria-hidden="true" />}
                    {furn ? <PiecePx id={it.id} s={2} box={64} /> : <GarmentPx sku={it.wear} box={48} />}
                    <span className="n">{it.name}</span>
                    <span className="p">{fmtC(it.price)}</span>
                    {n > 0 && <span className="o">{furn ? `OWN ${n}` : "OWNED"}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div className="sh-floor" aria-hidden="true" />
      </div>
      <p className="sh-fine">{furn ? "SOME PIECES UPGRADE: BUY THE CABINET, THE TV OR THE TAP, THEN UPGRADE IT FROM YOUR FLAT." : SHOP_LINES.score} CYCLES SPENT HERE ARE DESTROYED. NOTHING IS RESOLD, GIVEN OR TRANSFERRED.</p>
      <ButtonRow split stackOnMobile>
        <Button variant="back" href="#shop">The shops</Button>
        <Button variant="secondary" href="#file">My file</Button>
      </ButtonRow>
      {open && createPortal(<ItemSheet sku={open} setSku={setOpen} store={store} S={S} caseId={caseId} owned={owned} onClose={close} />, document.body)}
    </div>
  );
}

// ---- the item card ------------------------------------------------------------------------------------
function ItemSheet({ sku, setSku, store, S, caseId, owned, onClose }) {
  const it = itemOf(sku);
  const closeRef = useRef(null);
  const [nonce, setNonce] = useState(newNonce);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => { setNonce(newNonce()); }, [sku]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  if (!it) return null;
  const { v, busy, act, err, last } = S;
  const n = owned.get(sku) || 0;
  const furn = it.kind === "furn";
  const preview = furn ? null : { ...(v?.worn || {}), [it.slot]: it.wear };
  const ways = furn ? [] : Object.keys(WEAR[it.id][2]).map(w => itemOf(`w:${it.id}.${w}`));
  const poor = v && v.balance < it.price;
  const can = caseId && v && v.open !== false && v.wallet && !poor && (furn ? n < MAX_FURN_EACH : !n);
  const buy = async () => { const r = await act("buy", { sku, nonce }); if (r.ok) setNonce(newNonce()); };
  const justBought = last && !last.dup && owned.get(sku);
  return (
    <div className="sh-sheet" role="dialog" aria-modal="false" aria-label={`${it.name}, ${store.name}`}>
      <div className="sh-sheet-in">
        <div className="sh-sheet-h">
          <div><b>{it.name}</b>{it.way ? ` // ${it.way.toUpperCase()}` : ""}<br /><span className="sh-dim">{store.name} // {furn ? `GOES IN: ${it.rooms.map(r => ROOMS_WORDS[r] || r.toUpperCase()).join(", ")}` : SLOT_NAME[it.slot]}</span></div>
          <button ref={closeRef} type="button" className="sh-x" onClick={onClose} aria-label="Close and return to the rails">[ X ]</button>
        </div>
        <div className="sh-card">
          {furn ? <div className="sh-mirror" style={{ padding: 8 }}><PiecePx id={it.id} s={4} box={140} /></div>
            : <Mirror base={v?.spec} outfit={preview} scale={4} label={`Your file photo wearing ${outfitWords(preview)}`} />}
          <div>
            <p className="sh-p"><span className="sh-cyc">{fmtC(it.price)} CYCLES</span>{v ? <span className="sh-dim"> // YOU HAVE {fmtC(v.balance)}</span> : null}</p>
            {!furn && <p className="sh-p sh-dim">IN THE MIRROR: YOU, WEARING IT{Object.keys(v?.worn || {}).length ? " WITH WHAT YOU HAVE ON" : ""}. {it.house ? "A HOUSE BRAND." : ""}</p>}
            {ways.length > 1 && (
              <div className="sh-ways" role="group" aria-label="Colourways">
                {ways.map(w => <button key={w.sku} type="button" className="sh-way" aria-pressed={w.sku === sku} onClick={() => setSku(w.sku)} aria-label={`${w.way}${owned.get(w.sku) ? ", owned" : ""}`}><i style={{ background: w.colour }} />{w.way.toUpperCase()}</button>)}
              </div>
            )}
            {furn && it.effect && <p className="sh-p sh-dim">{it.effect.line} {EFFECTS_FROM_DAY == null ? "IN THE CITY'S RECORD FROM A LATER DAY; FOR NOW IT LOOKS THE PART." : ""}</p>}
            {furn && it.upgrade && <p className="sh-p sh-dim">UPGRADES: {chainOf(it.id).slice(1).map(id => CATALOG[id].name).join(" -> ")}. FROM YOUR FLAT, FOR THE DIFFERENCE AND A FEE.</p>}
            {furn && it.play && <p className="sh-p sh-dim">PLAYABLE AT HOME: {it.play.label}.</p>}
            {!caseId ? <p className="sh-p"><a href="#file">OPEN YOUR FILE</a> TO BUY.</p> : v && !v.wallet ? <p className="sh-p">{SHOP_LINES.noWallet} <a href="#economy">THE TREASURY</a>.</p> : (
              <ButtonRow>
                <Button variant="primary" onClick={buy} disabled={busy || !can}>{!furn && n ? "OWNED" : poor ? "NOT ENOUGH CYCLES" : furn && n >= MAX_FURN_EACH ? `${MAX_FURN_EACH} OWNED` : `BUY // ${fmtC(it.price)}`}</Button>
                {!furn && n > 0 && <Button variant="secondary" onClick={() => act("wear", { outfit: { ...(v?.worn || {}), [it.slot]: it.wear } })} disabled={busy || v?.drawn || v?.worn?.[it.slot] === it.wear}>{v?.worn?.[it.slot] === it.wear ? "WEARING IT" : "WEAR IT NOW"}</Button>}
                {furn && n > 0 && <Button variant="secondary" href="#shop">PLACE IT IN YOUR FLAT</Button>}
              </ButtonRow>
            )}
            {last?.line && <PaLine tag="TILL>" text={last.line} />}
            {justBought && furn && <p className="sh-fine">YOUR FURNITURE IS UNDER THE SHOPS' FRONT PAGE, AND IN YOUR FLAT'S SHEET IN THE CITY.</p>}
            {err && <div className="sh-err" role="status">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
