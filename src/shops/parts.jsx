// THE SHOPS' pieces, shared by #shop (the stores), the cutaway (your flat's closet and furnishing)
// and MY FILE (one section): the view hook, the pixel canvases, THE CLOSET (try on, wear, save) and
// FURNISH (place a piece in a room of your flat). The server decides every price and every rule.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonRow, PaLine } from "../ui/index.js";
import { loadShops, shopAct, onView, lastView, forgetRooms, newNonce } from "./client.js";
import { openFunnel } from "../city/FunnelOverlay.jsx";
import { GAME, utm } from "../city/funnels.js";
import { watchHref } from "../city/ebtvFrame.js";
import { garmentSprite, pieceSprite, wearingSpec, avatarSheet, blitScaled } from "./pixels.js";
import { itemOf, SLOT_NAME, OUTFIT_SLOTS, spotsFor, fmtC, SHOP_LINES, EFFECTS_FROM_DAY } from "../economy/shops.js";
import { WEAR_SLOTS } from "../wear.js";
import { PURPOSE_NAME } from "../city/tower.js";
import CSS from "./shops.css?inline";

export function injectShopStyles() {
  let el = document.getElementById("sh-styles");
  if (!el) { el = document.createElement("style"); el.id = "sh-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}

// The case's wardrobe, furniture and flat, loaded once and shared by every panel on the page.
export function useShops(caseId) {
  const [v, setV] = useState(() => lastView(caseId));
  const [err, setErr] = useState("");
  const [gate, setGate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  useEffect(() => { injectShopStyles(); }, []);
  useEffect(() => onView(L => { if (L.caseId === caseId) setV(L.view); }), [caseId]);
  useEffect(() => {
    let off = false;
    setGate(null); setErr("");
    if (!caseId) { setV(null); return undefined; }
    loadShops(caseId).then(d => { if (!off) setV(d); })
      .catch(e => { if (!off) { if (e.status === 403 || e.status === 404) setGate(e.status); setErr(e.message); } });
    return () => { off = true; };
  }, [caseId]);
  const act = useCallback(async (action, body = {}) => {
    setBusy(true); setErr(""); setLast(null);
    const r = await shopAct(caseId, action, body);
    setBusy(false);
    if (r.data?.balance != null) setV(r.data);
    if (!r.ok) setErr(r.data?.error || "The till refused.");
    else setLast(r.data.last || null);
    return r;
  }, [caseId]);
  return { v, err, gate, busy, last, act };
}

// ---- canvases ------------------------------------------------------------------------------------
export function Px({ draw, w, h, label, className = "" }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; if (c) draw(c); });
  return <canvas ref={ref} width={w} height={h} className={`sh-px ${className}`} style={{ width: w, height: h }} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" })} />;
}
export function GarmentPx({ sku, scale = 2, box = 0 }) {
  const g = typeof document !== "undefined" ? garmentSprite(sku) : null;
  const w = box || (g ? g.w * scale : 24), h = box || (g ? g.h * scale : 24);
  return <Px w={w} h={h} draw={(c) => g && blitScaled(c, g.canvas)} />;
}
export function PiecePx({ id, s = 2, box = 0 }) {
  const p = typeof document !== "undefined" ? pieceSprite(id, s) : null;
  const w = box || (p ? p.w : 24), h = box || (p ? p.h : 24);
  return <Px w={w} h={h} draw={(c) => { if (!p) return; const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height); g.drawImage(p.canvas, Math.round((c.width - p.w) / 2), c.height - p.h); }} />;
}
// The file photo in a mirror, wearing `outfit` over its own likeness.
export function Mirror({ base, outfit, scale = 4, label }) {
  const spec = useMemo(() => wearingSpec(base, outfit), [base, outfit]);
  const sheet = useMemo(() => (typeof document !== "undefined" ? avatarSheet(spec) : null), [spec]);
  return (
    <div className="sh-mirror" style={{ width: 32 * scale + 8, padding: 4 }}>
      <Px w={32 * scale} h={48 * scale} label={label} draw={(c) => blitScaled(c, sheet)} />
    </div>
  );
}
export const outfitWords = (o) => {
  const names = WEAR_SLOTS.map(s => o?.[s] && itemOf(`w:${o[s]}`)).filter(Boolean).map(i => `${i.name} (${i.way})`);
  return names.length ? names.join(", ") : "your own clothes";
};

// ---- THE CLOSET ---------------------------------------------------------------------------------------
// The owned garments by slot; tap to try one on (the mirror changes, nothing is saved); WEAR THIS
// puts it on the file photo; three hooks keep outfits.
export function Closet({ caseId, S }) {
  const { v, busy, act, err, last } = S;
  const [trial, setTrial] = useState(null);
  const worn = v?.worn || {};
  const cur = trial || worn;
  useEffect(() => { setTrial(null); }, [caseId]);
  if (!v) return <p className="sh-p sh-dim">OPENING THE CLOSET…</p>;
  const clothes = (v.items || []).filter(i => i.kind === "wear");
  const bySlot = WEAR_SLOTS.map(s => [s, clothes.filter(i => i.slot === s)]).filter(([, l]) => l.length);
  const toggle = (it) => setTrial(t => { const base = { ...(t || worn) }; if (base[it.slot] === it.wear) delete base[it.slot]; else base[it.slot] = it.wear; return base; });
  const same = (a, b) => WEAR_SLOTS.every(s => (a?.[s] || null) === (b?.[s] || null));
  return (
    <div className="sh-closet">
      <div>
        <Mirror base={v.spec} outfit={cur} scale={3} label={`Your file photo wearing ${outfitWords(cur)}`} />
        <p className="sh-fine" style={{ maxWidth: 136 }}>{trial && !same(trial, worn) ? "TRYING ON. NOT YET WORN." : "AS THE CITY SEES YOU."}</p>
      </div>
      <div>
        {v.drawn && <PaLine tag="WARDROBE>" text={SHOP_LINES.drawn} />}
        {!clothes.length ? (
          <p className="sh-p">THE CLOSET IS EMPTY. THE DEPARTMENT ISSUED YOU A BODY AND ONE SET OF CLOTHES. <a href="#shop">THE SHOPS</a> SELL THE REST.</p>
        ) : bySlot.map(([slot, list]) => (
          <div key={slot}>
            <div className="sh-h">{SLOT_NAME[slot]}</div>
            <div className="sh-grid" role="group" aria-label={SLOT_NAME[slot]}>
              {list.map(it => (
                <button key={it.id} type="button" className="sh-cell" aria-pressed={cur[it.slot] === it.wear} onClick={() => toggle(it)}
                  aria-label={`${it.name}, ${it.way}. ${cur[it.slot] === it.wear ? "On. Tap to take off." : "Tap to try on."}`}>
                  <GarmentPx sku={it.wear} box={44} />
                  <span className="n">{it.virtual && it.name.length > 34 ? `${it.name.slice(0, 32)}…` : it.name}</span>
                  {it.irl && <span className="sh-irl">OWNED IN REAL LIFE</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <ButtonRow>
          <Button variant="primary" onClick={() => act("wear", { outfit: cur })} disabled={busy || same(cur, worn) || v.drawn}>WEAR THIS</Button>
          {trial && <Button variant="secondary" onClick={() => setTrial(null)} disabled={busy}>PUT IT BACK</Button>}
          <Button variant="secondary" onClick={() => setTrial({})} disabled={busy || !Object.keys(cur).length}>YOUR OWN CLOTHES</Button>
        </ButtonRow>
        <div className="sh-h">THE HOOKS: SAVED OUTFITS</div>
        <div className="sh-hooks">
          {Array.from({ length: OUTFIT_SLOTS }, (_, k) => k + 1).map(k => {
            const o = v.outfits?.[k];
            return (
              <div key={k} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button type="button" className="sh-hookbtn" disabled={!o} onClick={() => setTrial({ ...o })} aria-label={o ? `Hook ${k}: ${outfitWords(o)}. Try it on.` : `Hook ${k}: empty`}>
                  {o ? <Px w={32} h={48} draw={(c) => blitScaled(c, avatarSheet(wearingSpec(v.spec, o)))} /> : <span style={{ width: 32, height: 48, display: "inline-block" }} />}
                  HOOK {k}
                </button>
                <Button variant="secondary" onClick={() => act("save", { slot: k, outfit: cur })} disabled={busy || !Object.keys(cur).length} aria-label={`Save what the mirror shows to hook ${k}`}>SAVE {k}</Button>
              </div>
            );
          })}
        </div>
        {last?.line && <PaLine tag="WARDROBE>" text={last.line} />}
        {err && <div className="sh-err" role="status">{err}</div>}
        <p className="sh-fine">{SHOP_LINES.score}</p>
      </div>
    </div>
  );
}

// ---- PLAYABLE AT HOME (shops.js PLAY_AT_HOME): the cabinet's game, the golf presets, the channel -------
export function playAtHome(play) {
  if (!play) return;
  if (play.game && GAME[play.game]?.play) openFunnel({ href: utm(GAME[play.game].play, "home-cabinet"), campaign: "home-cabinet" });
  else if (play.go) window.location.hash = play.go;
  else if (play.ebtv) openFunnel({ href: watchHref("home-tv"), campaign: "home-tv" });
}

// ---- FURNISH: your furniture into the rooms of your flat -----------------------------------------------
export function Furnish({ S, onPlaced }) {
  const { v, busy, act, err, last } = S;
  const [pick, setPick] = useState({});   // itemId -> {room, spot}
  const [ask, setAsk] = useState(null);   // {id, nonce}: the upgrade awaiting its second tap
  if (!v) return null;
  const furn = (v.items || []).filter(i => i.kind === "furn");
  const flat = v.apartment?.flat;
  if (!furn.length) return <p className="sh-p">NO FURNITURE IN YOUR INVENTORY. <a href="#shop/eastgate-home">EASTGATE HOME</a> SELLS IT, UPSTAIRS AT EASTGATE MALL.</p>;
  if (!flat) return <p className="sh-p sh-dim">{SHOP_LINES.noFlat}</p>;
  const taken = new Map((v.items || []).filter(i => i.placed).map(i => [`${i.placed.room}|${i.placed.spot}`, i]));
  const go = async (it, remove = false) => {
    const p = pick[it.id] || {};
    const r = remove ? await act("unplace", { itemId: it.id }) : await act("place", { itemId: it.id, room: p.room, spot: p.spot });
    if (r.ok) { forgetRooms(v.apartment.building); onPlaced?.(); setPick(s => ({ ...s, [it.id]: {} })); }
  };
  return (
    <div>
      {furn.map(it => {
        const rooms = flat.rooms.filter(r => it.rooms.includes(r.purpose));
        const p = pick[it.id] || {};
        const room = p.room || it.placed?.room || rooms[0]?.id || "";
        const where = it.placed ? `${PURPOSE_NAME[flat.rooms.find(r => r.id === it.placed.room)?.purpose] || "A ROOM"}, SPOT ${Number(it.placed.spot.slice(1)) + 1}${it.placed.spot[0] === "w" ? " ON THE WALL" : ""}` : "IN YOUR INVENTORY";
        return (
          <div key={it.id} className="sh-furn">
            <PiecePx id={it.ref} s={2} box={64} />
            <div>
              <div><b>{it.name}</b>{it.irl && <span className="sh-irl">OWNED IN REAL LIFE</span>} <span className="sh-dim">// {where}</span></div>
              {!rooms.length ? <div className="sh-dim">NO ROOM IN YOUR FLAT TAKES IT. A BIGGER FLAT WOULD.</div> : (
                <>
                  <label className="sh-dim" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>ROOM
                    <select value={room} onChange={e => setPick(s => ({ ...s, [it.id]: { room: e.target.value } }))} aria-label={`Room for the ${it.name}`}>
                      {rooms.map(r => <option key={r.id} value={r.id}>{PURPOSE_NAME[r.purpose]}</option>)}
                    </select>
                  </label>
                  <div className="sh-spots" role="group" aria-label={`Spot in the room, left to right${it.wall ? ", on the wall" : ""}`}>
                    {spotsFor(it).map(s => {
                      const by = taken.get(`${room}|${s.id}`);
                      const mine = by && by.id === it.id;
                      return <button key={s.id} type="button" className="sh-spot" aria-pressed={(p.room ? p.spot === s.id : false) || (!p.spot && mine)} disabled={busy || (by && !mine)}
                        onClick={() => setPick(q => ({ ...q, [it.id]: { room, spot: s.id } }))} aria-label={`Spot ${s.id.slice(1) * 1 + 1}${by && !mine ? `, taken by your ${by.name}` : ""}`}>{s.id[0] === "w" ? "WALL " : ""}{Number(s.id.slice(1)) + 1}</button>;
                    })}
                  </div>
                  <ButtonRow>
                    <Button variant="primary" onClick={() => go(it)} disabled={busy || !p.spot}>{it.placed ? "MOVE IT HERE" : "PLACE IT"}</Button>
                    {it.placed && <Button variant="secondary" onClick={() => go(it, true)} disabled={busy}>TAKE IT BACK</Button>}
                  </ButtonRow>
                </>
              )}
              <ButtonRow>
                {it.play && it.placed && <Button variant="primary" onClick={() => playAtHome(it.play)}>{it.play.label}</Button>}
                {it.upgrade && (ask?.id === it.id
                  ? <><Button variant="primary" onClick={async () => { const r = await act("upgrade", { itemId: it.id, nonce: ask.nonce }); if (r.ok) { setAsk(null); forgetRooms(v.apartment?.building); onPlaced?.(); } }} disabled={busy || v.balance < it.upgrade.price}>CONFIRM: {fmtC(it.upgrade.price)} CYCLES</Button>
                      <Button variant="secondary" onClick={() => setAsk(null)} disabled={busy}>NOT NOW</Button></>
                  : <Button variant="secondary" onClick={() => setAsk({ id: it.id, nonce: newNonce() })} disabled={busy} aria-label={`Upgrade the ${it.name} to the ${it.upgrade.name} for ${fmtC(it.upgrade.price)} CYCLES`}>UPGRADE: {it.upgrade.name} // {fmtC(it.upgrade.price)}</Button>)}
              </ButtonRow>
              {ask?.id === it.id && <div className="sh-fine">THE {it.name} IS TAKEN AWAY. YOU PAY THE DIFFERENCE AND A 5% FEE. {itemOf(`f:${it.upgrade.to}`)?.whole ? "IT NEEDS A WHOLE ROOM: THE STUDY, OR A LIVING ROOM GIVEN OVER TO IT." : ""}</div>}
              {it.effect && <div className="sh-fine">{it.effect.line} {EFFECTS_FROM_DAY == null ? "(IN THE CITY'S RECORD FROM A LATER DAY. FOR NOW, IT LOOKS THE PART.)" : ""}</div>}
            </div>
          </div>
        );
      })}
      {last?.line && <PaLine tag="HOUSING>" text={last.line} />}
      {err && <div className="sh-err" role="status">{err}</div>}
    </div>
  );
}

export const balanceLine = (v) => (v ? `${fmtC(v.balance)} CYCLES` : "");
