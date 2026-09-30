import { useEffect, useRef, useState } from "react";
import { Button, ButtonRow, Chip, Chips, PaLine, Disclosure } from "../ui/index.js";
import { LIMITS } from "./rules.js";
import { Hand, Sprite } from "./Cards.jsx";

// Texas Hold'em against figures on file. The server deals, runs every figure's decision and
// sends back only what the subject may see: its own two cards, the board, the chips, and at
// a showdown the hands that went to it. Living figures act; dead figures may talk (lines
// written in advance, netlify/lib/casino-figures.js). Tells are actions, and not always true.

function Seat({ s, i, P, me }) {
  const H = P.hand;
  const cur = H && !H.done && H.cur === i;
  const status = !s.inHand ? "SITTING OUT" : s.folded ? "FOLDED" : s.allIn ? "ALL IN" : cur ? "TO ACT" : "";
  const won = H?.done && H.result?.won?.[i] > 0;
  return (
    <div className={`cz-pseat${cur ? " cur" : ""}${s.folded ? " out" : ""}${won ? " won" : ""}${me ? " me" : ""}`}>
      {!me && <Sprite src={s.sprite} name={s.name} size="s" />}
      <div className="cz-pinfo">
        <div className="nm">{s.name}{P.button === i ? <span className="cz-btn" title="Dealer button">D</span> : null}</div>
        <div className="st"><span>{s.stack}</span>{s.bet > 0 && <span className="cz-dim"> // IN {s.bet}</span>}{status && <span className={s.allIn || cur ? "cz-warn" : "cz-dim"}> // {status}</span>}{won && <span className="cz-win"> // +{H.result.won[i]}</span>}</div>
        {s.cards && <Hand cards={s.cards} small={!me} label={me ? "Your cards" : `${s.name}'s cards`} />}
        {H?.done && H.result?.hands?.[i] && !s.folded && <div className="cz-dim cz-small">{H.result.hands[i]}</div>}
      </div>
    </div>
  );
}

function LogLine({ e, seats }) {
  const who = e.seat >= 0 ? seats[e.seat] : null;
  if (e.act === "say") return <li className="say"><span className="sp">{who?.name}</span><span className="tx as-typed">“{e.text}”</span></li>;
  if (e.act === "tell") return <li className="tell">{e.text}</li>;
  if (e.act === "street") return <li className="street">{e.text}</li>;
  if (e.act === "win") return <li className="winl">{e.text}</li>;
  return <li>{e.text}</li>;
}

export default function Poker({ st, level, act, busy }) {
  const P = st.poker;
  const L = LIMITS[P?.level || level].poker;
  const [opp, setOpp] = useState(3);
  const [buyIn, setBuyIn] = useState(L.buyIn[0]);
  const [to, setTo] = useState(0);
  const [msg, setMsg] = useState("");
  const logRef = useRef(null);
  const H = P?.hand;
  const lg = H?.legal;
  useEffect(() => { if (lg) setTo(lg.minTo); }, [lg?.minTo, H?.log?.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [H?.log?.length]);
  useEffect(() => { setBuyIn(b => Math.max(L.buyIn[0], Math.min(L.buyIn[1], b))); }, [L.buyIn[0], L.buyIn[1]]);   // eslint-disable-line react-hooks/exhaustive-deps
  const doIt = async (action, body) => { setMsg(""); const r = await act(action, body); if (!r.ok) setMsg(r.data.error || "REFUSED."); };
  const wallet = Math.floor(st.chips / 100);

  if (!P) {
    return (
      <div className="cz-poker">
        <PaLine tag="PIT>" text={level === "high" ? "THE HIGH LIMIT TABLE: FAMOUS GAMBLERS AND STRATEGISTS ON FILE. THEY READ THEIR HANDS BETTER, AND THEIR TELLS LIE MORE." : "NO-LIMIT HOLD'EM AGAINST FIGURES ON FILE. EACH PLAYS THE WAY ITS FILE SAYS IT WOULD. THE DEPARTMENT TAKES NO RAKE."} />
        <div className="cz-kv">
          <span className="k">BLINDS</span><span className="v">{L.sb} / {L.bb}</span>
          <span className="k">OPPONENTS</span><span className="v"><Chips>{[2, 3, 4, 5].map(n => <Chip key={n} pressed={opp === n} onClick={() => setOpp(n)}>{n}</Chip>)}</Chips></span>
          <span className="k">BUY-IN</span><span className="v"><Chips>{[L.buyIn[0], Math.round((L.buyIn[0] + L.buyIn[1]) / 2), L.buyIn[1]].map(v => <Chip key={v} pressed={buyIn === v} onClick={() => setBuyIn(v)}>{v}</Chip>)}</Chips></span>
        </div>
        <ButtonRow stackOnMobile>
          <Button variant="primary" onClick={() => doIt("poker-sit", { level, seats: opp, buyIn })} disabled={busy || wallet < buyIn}>SIT DOWN WITH {buyIn}</Button>
        </ButtonRow>
        {wallet < buyIn && <div className="cz-dim">YOU HOLD {wallet}. THE BUY-IN IS {buyIn}.</div>}
        {msg && <div className="cz-err" role="status">{msg}</div>}
      </div>
    );
  }

  const me = P.seats[0];
  const quick = lg ? [["MIN", lg.minTo], ["½ POT", Math.min(lg.maxTo, Math.max(lg.minTo, me.bet + lg.toCall + Math.round((lg.pot + lg.toCall) / 2)))], ["POT", Math.min(lg.maxTo, Math.max(lg.minTo, me.bet + lg.toCall + lg.pot + lg.toCall))], ["ALL IN", lg.maxTo]] : [];
  const toOk = lg && (to === lg.maxTo || (to >= lg.minTo && to <= lg.maxTo));
  return (
    <div className="cz-poker">
      <div className="cz-ptable">
        <div className="cz-pseats">{P.seats.slice(1).map((s, k) => <Seat key={s.id} s={s} i={k + 1} P={P} />)}</div>
        <div className="cz-board">
          <div className="cz-sub-h">{H ? `HAND ${P.handNo} // ${H.street}` : "NO HAND"} // POT {H?.pot ?? 0}</div>
          <Hand cards={H?.board?.length ? H.board : []} label="The board" />
          {!H?.board?.length && <span className="cz-dim">THE FLOP COMES LATER. SO DOES REGRET.</span>}
        </div>
        <Seat s={me} i={0} P={P} me />
      </div>
      {H && !H.done && lg && (
        <div className="cz-pacts">
          <ButtonRow stackOnMobile>
            {lg.canCheck ? <Button variant="primary" onClick={() => doIt("poker-act", { type: "check" })} disabled={busy}>CHECK</Button>
              : <Button variant="primary" onClick={() => doIt("poker-act", { type: "call" })} disabled={busy}>CALL {lg.toCall}</Button>}
            {!lg.canCheck && <Button variant="danger" onClick={() => doIt("poker-act", { type: "fold" })} disabled={busy}>FOLD</Button>}
          </ButtonRow>
          {lg.canRaise && (
            <div className="cz-raise">
              <Chips>{quick.map(([l, v]) => <Chip key={l} pressed={to === v} onClick={() => setTo(v)}>{l}</Chip>)}</Chips>
              <label className="cz-to"><span className="k">{P.seats.some(s => s.bet > 0) ? "RAISE TO" : "BET"}</span>
                <input type="number" inputMode="numeric" min={lg.minTo} max={lg.maxTo} value={to} onChange={(e) => setTo(Math.floor(Number(e.target.value) || 0))} aria-label="Raise to" /></label>
              <Button onClick={() => doIt("poker-act", { type: "raise", to })} disabled={busy || !toOk}>{to === lg.maxTo ? "ALL IN" : "RAISE"} TO {to}</Button>
            </div>
          )}
        </div>
      )}
      {H && !H.done && !lg && <div className="cz-dim">THE FIGURES ARE THINKING. THEY DO NOT NEED LONG.</div>}
      {H?.done && (
        <ButtonRow stackOnMobile>
          {me.stack >= P.bb ? <Button variant="primary" onClick={() => doIt("poker-deal")} disabled={busy}>NEXT HAND</Button>
            : <Button variant="primary" onClick={() => doIt("poker-reload", { buyIn: L.buyIn[0] })} disabled={busy || wallet < L.buyIn[0]}>RELOAD {L.buyIn[0]} FROM YOUR CHIPS</Button>}
          <Button variant="back" onClick={() => doIt("poker-leave")} disabled={busy}>LEAVE WITH {me.stack}</Button>
        </ButtonRow>
      )}
      {H && !H.done && <ButtonRow><Button variant="back" onClick={() => doIt("poker-leave")} disabled={busy}>LEAVE (FORFEITS THIS POT)</Button></ButtonRow>}
      {msg && <div className="cz-err" role="status">{msg}</div>}
      <div className="cz-sub-h">THE TABLE, AS IT HAPPENED</div>
      <ol className="cz-log" ref={logRef} aria-live="polite">{(H?.log || []).map((e, k) => <LogLine key={k} e={e} seats={P.seats} />)}</ol>
      <Disclosure title="THE FIGURES' FILES, AS THEY PLAY" meta="HOW THE DEPARTMENT DERIVES A STYLE">
        {P.seats.slice(1).map(s => (
          <div key={s.id} className="cz-dossier">
            <div className="nm">{s.name} <span className="cz-dim">// {s.tier}</span></div>
            {(st.poker.dossiers.find(d => d.id === s.id)?.lines || []).map((l, k) => <div key={k} className="cz-dim cz-small">{l}</div>)}
          </div>
        ))}
      </Disclosure>
    </div>
  );
}
