// THE EB SHOP's virtual copies in the page (docs/design/ECONOMY_PROPERTY.md, "The EB SHOP's virtual
// copies"): on a wall item's card, GET THE VIRTUAL ONE beside BUY THE REAL ONE; THE COPY ROOM, every
// copy the shop has ever listed (the sold ones too); and CLAIM A REAL PURCHASE, which grants the copy
// of something bought at the real shop, free, marked OWNED IN REAL LIFE. Lazy: the city's bundle
// carries none of this until the shop's overlay or MY FILE asks.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, ButtonRow, PaLine, TextField } from "../ui/index.js";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { useShops, Mirror, PiecePx, injectShopStyles } from "./parts.jsx";
import { newNonce, loadShops } from "./client.js";
import { loadVirtual, virtualState, onVirtual, copyOf, claimPurchase } from "./ebClient.js";
import { EBV_LINES, FORM_NAME } from "../economy/ebvirtual.js";
import { SLOT_NAME, fmtC } from "../economy/shops.js";
import { wearOf } from "../wear.js";
import { EB_SHOP, utm } from "../city/funnels.js";
import { countFunnel } from "../city/FunnelOverlay.jsx";

const CSS = `
.ebv{display:flex;flex-direction:column;gap:var(--s3,12px)}
.ebv-copy{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--s3,12px);align-items:start;border:1px solid var(--line,#1f4a2c);padding:var(--s3,12px);background:var(--panel,#0d140d)}
@media (max-width:520px){.ebv-copy{grid-template-columns:1fr;justify-items:center}.ebv-copy>div{justify-self:stretch}}
.ebv-h{font-size:var(--t-xs,12px);color:var(--fg-mute);letter-spacing:.08em;margin:0 0 6px}
.ebv-irl{display:inline-block;font-size:10px;letter-spacing:.08em;padding:1px 5px;border:1px solid var(--warn,#fbbf24);color:var(--warn,#fbbf24);margin-left:6px;vertical-align:middle;white-space:nowrap}
.ebv-sold{display:inline-block;font-size:10px;letter-spacing:.08em;padding:1px 5px;border:1px solid var(--harm,#f87171);color:var(--harm,#f87171)}
.ebv-get{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;background:var(--warn,#fbbf24);color:#140f02;font:inherit;font-weight:700;letter-spacing:.05em;border:0;cursor:pointer}
.ebv-get:disabled{opacity:.55;cursor:default}
.ebv-get:focus-visible,.ebv-cell:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ebv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.ebv-cell{font:inherit;text-align:left;background:var(--panel,#0d140d);color:var(--fg);border:1px solid var(--line,#1f4a2c);padding:0;cursor:pointer;display:flex;flex-direction:column;min-height:44px}
.ebv-cell:hover{border-color:var(--warn)}
.ebv-cell img{width:100%;aspect-ratio:1;object-fit:cover;image-rendering:pixelated;background:#111;display:block}
.ebv-cell .t{padding:4px 6px 0;font-size:11px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ebv-cell .p{padding:2px 6px 6px;font-size:12px;color:var(--warn,#fbbf24);display:flex;justify-content:space-between;gap:4px;flex-wrap:wrap}
.ebv-veil{position:fixed;inset:0;z-index:1100;background:rgba(2,6,3,.86);display:flex;align-items:center;justify-content:center;padding:12px}
.ebv-dlg{font-family:var(--mono);color:var(--fg);background:var(--bg,#0a0f0a);border:1px solid var(--warn,#fbbf24);width:min(520px,100%);max-height:calc(100dvh - 24px);overflow:auto;padding:var(--s3,12px) var(--s4,16px) var(--s4,16px)}
.ebv-dlg h2{margin:0 0 8px;font-size:var(--t-m,16px);letter-spacing:.06em;color:var(--warn,#fbbf24)}
`;
function injectEbv() {
  injectShopStyles();
  let el = document.getElementById("ebv-styles");
  if (!el) { el = document.createElement("style"); el.id = "ebv-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
export function useVirtual() {
  const [st, setSt] = useState(virtualState());
  useEffect(() => { injectEbv(); const off = onVirtual(setSt); loadVirtual(); setSt(virtualState()); return off; }, []);
  return st;
}
function useCaseId() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  return [caseId, setCaseId];
}
export const IrlBadge = () => <span className="ebv-irl" title="This file bought the real one at the EB Shop">{EBV_LINES.irl}</span>;
// a photo as the city draws it: a few dozen pixels
const small = (url, w) => { try { const u = new URL(url); u.searchParams.set("width", String(w)); return u.toString(); } catch { return url; } };
const kindWords = (c) => (c.cat === "wear" ? `TO WEAR // ${SLOT_NAME[wearOf(c.sku.slice(2))?.slot] || "CLOTHES"}` : `FOR YOUR FLAT // ${FORM_NAME[c.form]}`);
function RealLink({ copy, campaign }) {
  if (!copy.live) return <span className="ebv-sold">{EBV_LINES.sold}</span>;
  const url = utm(`${EB_SHOP}/products/${copy.handle}`, campaign, copy.handle);
  return <a className="hvi-fn-out" href={url} target="_blank" rel="noopener" onClick={() => countFunnel(campaign, "out", url)}>{EBV_LINES.real}</a>;
}

// ---- the copy: on a wall item's card, and in the copy room ------------------------------------------
export function VirtualCopy({ handle, campaign = "eb-shop", withReal = false }) {
  const st = useVirtual();
  const copy = copyOf(handle, st);
  if (st.state === "idle" || st.state === "loading") return <p className="hvi-fn-note">THE COPY ROOM IS LOOKING FOR THE VIRTUAL ONE…</p>;
  if (!copy) return <p className="hvi-fn-note">THE DEPARTMENT HAS NOT COPIED THIS ONE YET. IT COPIES EVERYTHING EVENTUALLY.</p>;
  return <CopyCard copy={copy} campaign={campaign} withReal={withReal} />;
}
function CopyCard({ copy, campaign, withReal }) {
  const [caseId, setCaseId] = useCaseId();
  const S = useShops(caseId);
  const [nonce, setNonce] = useState(newNonce);
  const [claim, setClaim] = useState(false);
  const w = copy.cat === "wear" ? wearOf(copy.sku.slice(2)) : null;
  const owned = (S.v?.items || []).find(i => i.sku === copy.sku);
  const buy = async () => { const r = await S.act("buy", { sku: copy.sku, nonce }); if (r.ok) setNonce(newNonce()); };
  const wear = () => S.act("wear", { outfit: { ...(S.v?.worn || {}), [w.slot]: copy.sku.slice(2) } });
  const wearing = w && S.v?.worn?.[w.slot] === copy.sku.slice(2);
  return (
    <div className="ebv-copy" aria-label={`The virtual ${copy.title}`}>
      <div>
        {w ? <Mirror base={S.v?.spec} outfit={{ ...(S.v?.worn || {}), [w.slot]: copy.sku.slice(2) }} scale={4} label={`Your file photo wearing the virtual ${copy.title}`} />
          : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <img src={small(copy.image, 20)} alt="" width={96} height={96} style={{ imageRendering: "pixelated", objectFit: "cover", border: "3px solid #c9a34a", background: "#111" }} />
              <PiecePx id={copy.sku.slice(2)} s={3} box={72} />
            </div>}
      </div>
      <div>
        <div className="ebv-h">THE VIRTUAL ONE // {kindWords(copy)}</div>
        {withReal && <b style={{ display: "block", marginBottom: 6 }}>{copy.title}</b>}
        {!caseId ? (
          <>
            <p className="hvi-fn-note">THE VIRTUAL ONE COSTS <span className="sh-cyc">{fmtC(copy.price)} CYCLES</span>. ENTER YOUR CASE NUMBER TO BUY IT.</p>
            <CaseLogon onRestored={(id) => setCaseId(id)} />
          </>
        ) : owned ? (
          <>
            <p className="hvi-fn-note" style={{ color: "var(--accent)" }}>YOURS.{owned.irl && <IrlBadge />}</p>
            <ButtonRow>
              {w && !S.v?.drawn && <Button variant="primary" onClick={wear} disabled={S.busy || wearing}>{wearing ? "WEARING IT" : "WEAR IT"}</Button>}
              {!w && <Button variant="secondary" href={S.v?.apartment?.href || "#file"}>PLACE IT IN YOUR FLAT</Button>}
            </ButtonRow>
          </>
        ) : (
          <>
            <button type="button" className="ebv-get" onClick={buy} disabled={S.busy || !S.v || S.v.open === false || (S.v && S.v.balance < copy.price)}>{EBV_LINES.get(copy.price)}</button>
            {S.v && <p className="sh-fine">YOU HAVE {fmtC(S.v.balance)} CYCLES.{!S.v.wallet ? <> <a href="#economy">COLLECT YOUR ALLOWANCE</a> ONCE TO OPEN A WALLET.</> : ""}</p>}
          </>
        )}
        {S.last?.line && <PaLine tag="EB SHOP>" text={S.last.line} />}
        {S.err && <div className="sh-err" role="status">{S.err}</div>}
        <ButtonRow style={{ marginTop: 8 }}>
          {withReal && <RealLink copy={copy} campaign={campaign} />}
          {!withReal && !copy.live && <span className="ebv-sold">{EBV_LINES.sold}</span>}
          {caseId && !owned?.irl && <Button variant="secondary" onClick={() => setClaim(true)}>BOUGHT THE REAL ONE? CLAIM IT</Button>}
        </ButtonRow>
        <p className="sh-fine">{EBV_LINES.terms}</p>
      </div>
      {claim && <ClaimDialog caseId={caseId} onClose={() => setClaim(false)} />}
    </div>
  );
}

// ---- THE COPY ROOM: every copy, the sold ones too ---------------------------------------------------
const SECTIONS = [["WEARABLES", c => c.cat === "wear"], ["THE SHELF: FILMS, GAMES, RECORDS, BOOKS", c => c.form === "shelf"], ["THE WALL: MEMORABILIA AND ART", c => c.form === "frame"], ["THE DESK: EVERYTHING ELSE", c => c.form === "desk"]];
export default function CopyRoom({ campaign = "eb-shop", back, start = null }) {
  const st = useVirtual();
  const [caseId] = useCaseId();
  const [pick, setPick] = useState(start);
  const [claim, setClaim] = useState(false);
  const [sec, setSec] = useState(0);
  const lists = useMemo(() => SECTIONS.map(([name, f]) => [name, st.items.filter(f)]), [st.items]);
  if (st.state === "idle" || st.state === "loading") return <p className="hvi-fn-note">THE COPY ROOM IS COUNTING. EVERYTHING THE SHOP HAS EVER LISTED IS IN HERE.</p>;
  if (st.state === "closed") return <><p className="hvi-fn-note">THE COPY ROOM IS CLOSED FOR INVENTORY.</p>{back && <button type="button" className="hvi-fn-btn" onClick={back}>◀ THE LIVE STOCK</button>}</>;
  const copy = pick && copyOf(pick, st);
  if (copy) return (
    <div className="ebv">
      <div className="hvi-fn-detail">
        <img src={copy.image} alt={copy.title} style={{ width: "100%", maxWidth: 360, imageRendering: "auto" }} />
        <VirtualCopy handle={copy.handle} campaign={campaign} withReal />
      </div>
      <button type="button" className="hvi-fn-btn" onClick={() => setPick(null)} style={{ alignSelf: "flex-start" }}>◀ THE COPY ROOM</button>
    </div>
  );
  const [name, list] = lists[sec];
  return (
    <div className="ebv">
      <p className="hvi-fn-note">EVERY LISTING THE EB SHOP HAS EVER HAD, COPIED FOR THE CITY. PRICED BY WHAT IT IS, IN CYCLES. THE REAL ONES ARE FOR SALE FOR MONEY; SOME HAVE SOLD; THE COPIES STAY.</p>
      <ButtonRow role="tablist" aria-label="The copy room's sections">
        {lists.map(([n, l], i) => <Button key={n} variant={i === sec ? "primary" : "secondary"} role="tab" aria-selected={i === sec} onClick={() => setSec(i)}>{n.split(":")[0]} ({l.length})</Button>)}
      </ButtonRow>
      <div className="ebv-h">{name}</div>
      <div className="ebv-grid">
        {list.map(c => (
          <button key={c.handle} type="button" className="ebv-cell" onClick={() => setPick(c.handle)} aria-label={`${c.title}. The virtual one, ${fmtC(c.price)} CYCLES.${c.live ? "" : " The real one has sold."}`}>
            {c.cat === "wear" ? <span style={{ display: "flex", justifyContent: "center", background: "#111" }}><Mirror base={null} outfit={{ [wearOf(c.sku.slice(2))?.slot]: c.sku.slice(2) }} scale={2} /></span> : <img src={small(c.image, 32)} alt="" loading="lazy" />}
            <span className="t">{c.title}</span>
            <span className="p"><span>{fmtC(c.price)} CYCLES</span>{!c.live && <span className="ebv-sold">SOLD</span>}</span>
          </button>
        ))}
      </div>
      <div className="hvi-fn-foot">
        {back && <button type="button" className="hvi-fn-btn" onClick={back}>◀ THE LIVE STOCK</button>}
        {caseId && <Button variant="secondary" onClick={() => setClaim(true)}>CLAIM A REAL PURCHASE</Button>}
      </div>
      {claim && <ClaimDialog caseId={caseId} onClose={() => setClaim(false)} />}
    </div>
  );
}

// ---- CLAIM A REAL PURCHASE ------------------------------------------------------------------------
export function ClaimButton({ caseId, label = "CLAIM A REAL PURCHASE" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { injectEbv(); }, []);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!caseId}>{label}</Button>
      {open && <ClaimDialog caseId={caseId} onClose={() => setOpen(false)} />}
    </>
  );
}
export function ClaimDialog({ caseId, onClose }) {
  const [order, setOrder] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  useEffect(() => {
    injectEbv();
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setRes(null);
    const r = await claimPurchase(caseId, order, email);
    setBusy(false); setRes(r);
    if (r.ok) { setEmail(""); setOrder(""); loadShops(caseId).catch(() => {}); }   // every open view of the file sees the copy
  };
  return createPortal(
    <div className="ebv-veil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="ebv-dlg" role="dialog" aria-modal="true" aria-labelledby="ebv-claim-h" onSubmit={go}>
        <h2 id="ebv-claim-h">CLAIM A REAL PURCHASE</h2>
        <p className="hvi-fn-note">BOUGHT SOMETHING AT THE REAL EB SHOP? ITS VIRTUAL COPY IS YOURS, FREE, MARKED <IrlBadge />. THE ORDER NUMBER IS IN THE CONFIRMATION EMAIL (IT LOOKS LIKE #1042). USE THE EMAIL YOU CHECKED OUT WITH.</p>
        <TextField label="ORDER NUMBER" value={order} onChange={e => setOrder(e.target.value)} placeholder="#1042" inputMode="text" maxLength={26} required autoFocus />
        <TextField label="CHECKOUT EMAIL" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required autoComplete="email" />
        <p className="sh-fine">THE DEPARTMENT ASKS THE EB SHOP, THEN FORGETS BOTH. IT KEEPS ONLY A SCRAMBLED MARK THAT THE ORDER WAS CLAIMED, SO IT CAN'T BE CLAIMED TWICE. ONE CLAIM PER ITEM, EVER.</p>
        {res?.ok && (
          <div role="status">
            <PaLine tag="EB SHOP>" text={res.data.line} />
            <ul className="hvi-fn-note" style={{ margin: "4px 0 0", paddingLeft: 18 }}>{res.data.granted.map(g => <li key={g.sku}>{g.title} <IrlBadge /></li>)}</ul>
          </div>
        )}
        {res && !res.ok && <div className="sh-err" role="alert">{res.data?.error || "NOTHING WAS CLAIMED."}</div>}
        <ButtonRow>
          <Button variant="primary" type="submit" disabled={busy || !order || !email || !caseId}>{busy ? "ASKING THE EB SHOP…" : "CLAIM IT"}</Button>
          <Button variant="secondary" onClick={onClose}>{res?.ok ? "DONE" : "NOT NOW"}</Button>
        </ButtonRow>
      </form>
    </div>, document.body);
}
