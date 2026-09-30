import { useCallback, useEffect, useState } from "react";
import { Frame, Button, ButtonRow, Chip, Chips, PaLine, ScreenHead } from "../ui/index.js";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { CHIP_NAME, ALLOWANCE, HIGH_UNLOCK_CHIPS, HOUSE_EDGE, HOUSE_LINE, LEGAL_LINES, RESPONSIBLE_LINE, fmtChips } from "./rules.js";
import { loadCasino, casinoAct } from "./client.js";
import { Roulette, Blackjack, Baccarat } from "./Tables.jsx";
import Poker from "./Poker.jsx";
import CSS from "./casino.css?inline";

// #casino[/roulette|blackjack|baccarat|poker][?room=high]: HOUSE EDGE CASINO, on the Strip.
// Play chips only (docs/CASINO.md). The server holds the chips, the shoe, the wheel and the
// deck; this page asks it for each hand and shows what it answers.

const GAMES = [["roulette", "ROULETTE"], ["blackjack", "BLACKJACK"], ["baccarat", "BACCARAT"], ["poker", "HOLD'EM"]];
function injectStyles() {
  let el = document.getElementById("cz-styles");
  if (!el) { el = document.createElement("style"); el.id = "cz-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => {
  const [path, q] = String(route || "").split("?");
  const g = path.split("/")[1];
  return { game: GAMES.some(([k]) => k === g) ? g : "roulette", room: new URLSearchParams(q || "").get("room") === "high" ? "high" : "floor" };
};

export default function Casino({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const [{ game, room }, setNav] = useState(() => parseRoute(route));
  useEffect(() => { setNav(parseRoute(route)); }, [route]);
  const go = (next) => {
    const n = { game, room, ...next };
    setNav(n);
    try { window.history.replaceState(null, "", `#casino/${n.game}${n.room === "high" ? "?room=high" : ""}`); } catch { /* the hash stays */ }
  };
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  const [st, setSt] = useState(null);
  const [pub, setPub] = useState(null);
  const [err, setErr] = useState("");
  const [gate, setGate] = useState(null);   // 403 unassessed | 404 no file
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    loadCasino(null).then(d => { if (!off) setPub(d); }).catch(() => {});
    if (!caseId) { setSt(null); return () => { off = true; }; }
    loadCasino(caseId).then(d => { if (!off) { setSt(d); setGate(null); setErr(""); } })
      .catch(e => { if (!off) { setSt(null); if (e.status === 403 || e.status === 404) setGate(e.status); else setErr(e.message); } });
    return () => { off = true; };
  }, [caseId]);

  // One stake, one server call. defer: hand the answer back without showing it yet (the
  // wheel is still spinning); the caller commits it when the ball lands.
  const act = useCallback(async (action, body, { defer = false } = {}) => {
    setBusy(true);
    const r = await casinoAct(caseId, action, body);
    setBusy(false);
    if (r.data && typeof r.data.chips === "number" && (!defer || !r.ok)) setSt(r.data);
    return r;
  }, [caseId]);
  const commit = useCallback((d) => { if (d && typeof d.chips === "number") setSt(d); }, []);
  const claim = async () => { const r = await act("claim"); if (!r.ok) setErr(r.data.error || ""); else setErr(""); };

  const level = room === "high" && st?.high ? "high" : "floor";
  const board = st?.board || pub?.board;
  const mine = caseId ? caseId.slice(-4) : null;
  const S = st?.stats;

  return (
    <div className="cz">
      <ScreenHead title="HOUSE EDGE CASINO" meta={HOUSE_LINE} />
      <Frame box title="THE CAGE" meta="PLAY CHIPS ONLY">
        {!caseId && (
          <>
            <p className="cz-p">THE CAGE ISSUES {CHIP_NAME} TO ASSESSED FILES: {ALLOWANCE.toLocaleString("en-US")} A DAY, FREE, AND WORTH EXACTLY NOTHING. ENTER YOUR CASE NUMBER, OR <a href="#intake">SIT FOR AN ASSESSMENT</a> FIRST.</p>
            <CaseLogon onRestored={(id) => setCaseId(id)} />
          </>
        )}
        {caseId && gate === 403 && <p className="cz-p">YOUR FILE HAS NO ASSESSMENT ON IT. THE CASINO SERVES ASSESSED SUBJECTS ONLY. <a href="#intake">BE ASSESSED</a>; THEN YOU MAY LOSE CHIPS LIKE A CITIZEN.</p>}
        {caseId && gate === 404 && <p className="cz-p">NO SUCH FILE ON THIS TERMINAL'S RECORD. <a href="#intake">SIT FOR AN ASSESSMENT</a>.</p>}
        {st && (
          <>
            <div className="cz-kv">
              <span className="k">FILE</span><span className="v">…{mine} // {st.tier || "UNCLASSIFIED"}</span>
              <span className="k">STACK</span><span className="v cz-chips">{fmtChips(st.chips)} {CHIP_NAME}{st.atTable ? ` + ${st.atTable.toLocaleString("en-US")} AT THE POKER TABLE` : ""}</span>
              <span className="k">ALLOWANCE</span><span className="v">{st.claimable ? `${ALLOWANCE.toLocaleString("en-US")} WAITING AT THE CAGE` : "COLLECTED TODAY. THE NEXT AT 00:00 UTC."}</span>
            </div>
            {st.claimable && <ButtonRow><Button variant="primary" onClick={claim} disabled={busy}>COLLECT TODAY'S {ALLOWANCE.toLocaleString("en-US")}</Button></ButtonRow>}
            {!st.claimable && st.chips < 100 && !st.atTable && <PaLine tag="CAGE>" text="BUST. THE DEPARTMENT DOES NOT EXTEND CREDIT. TOMORROW'S ALLOWANCE IS YOUR NEXT STAKE; THE WAIT IS PART OF THE GAME." />}
            <div className="cz-rooms" role="group" aria-label="Room">
              <Chips>
                <Chip pressed={level === "floor"} onClick={() => go({ room: "floor" })}>THE FLOOR</Chip>
                <Chip pressed={level === "high"} onClick={() => st.high ? go({ room: "high" }) : setErr(`THE HIGH LIMIT ROOM: ${HIGH_UNLOCK_CHIPS.toLocaleString("en-US")} CHIPS, OR AN ESSENTIAL OR RETAINED FILE. THE VELVET ROPE HAS READ YOURS.`)}>{st.high ? "HIGH LIMIT ROOM" : "HIGH LIMIT ROOM (ROPED)"}</Chip>
              </Chips>
            </div>
          </>
        )}
        {err && <div className="cz-err" role="status">{err}</div>}
        <p className="cz-fine">{LEGAL_LINES[0]} <a href="#terms">TERMS §10</a>.</p>
      </Frame>

      {st && (
        <Frame title={level === "high" ? "THE HIGH LIMIT ROOM" : "THE TABLES"} meta={level === "high" ? "BEHIND THE VELVET ROPE" : "GROUND FLOOR"} className={level === "high" ? "cz-high" : undefined}>
          <div className="cz-tabs" role="tablist" aria-label="Games">
            {GAMES.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={game === k} className={`cz-tab${game === k ? " on" : ""}`} onClick={() => go({ game: k })}>{l}</button>)}
          </div>
          {game === "roulette" && <Roulette key={level} st={st} level={level} act={act} commit={commit} busy={busy} />}
          {game === "blackjack" && <Blackjack key={level} st={st} level={level} act={act} busy={busy} />}
          {game === "baccarat" && <Baccarat key={level} st={st} level={level} act={act} busy={busy} />}
          {game === "poker" && <Poker st={st} level={st.poker?.level || level} act={act} busy={busy} />}
        </Frame>
      )}

      <Frame title="THE HOUSE EDGE, STATED" meta="THE DEPARTMENT DOES NOT HIDE ITS CUT">
        <div className="cz-edges">
          {HOUSE_EDGE.map(e => (
            <div key={e.game} className="cz-edge">
              <span className="l">{e.label}</span><span className="e">{e.edge}</span>
              <span className="n">{e.note}</span>
            </div>
          ))}
        </div>
        {S && S.wagered > 0 && (
          <PaLine tag="AUDIT>" text={`YOUR RECORD: ${fmtChips(S.wagered)} WAGERED ON THE TABLE GAMES, ${fmtChips(S.returned)} RETURNED. YOUR PERSONAL HOUSE EDGE: ${((1 - S.returned / S.wagered) * 100).toFixed(2)}%. ${S.returned > S.wagered ? "THIS WILL CORRECT ITSELF." : "AS DESIGNED."}`} />
        )}
      </Frame>

      <Frame title="THIS WEEK'S STACKS" meta={board ? board.week : "…"}>
        {!board?.rows?.length ? <div className="cz-dim">NO STACKS THIS WEEK. THE HOUSE HAS NEVER BEEN LESS BUSY.</div> : (
          <ol className="cz-board-list">
            {board.rows.map(r => (
              <li key={r.rank} className={mine && r.case === `…${mine}` ? "me" : undefined}>
                <span className="rk">{String(r.rank).padStart(2, "0")}</span><span className="cs">CASE {r.case}</span><span className="ch">{r.chips.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="cz-fine">CASE NUMBERS SHOWN BY THEIR LAST FOUR CHARACTERS. NAMES ARE NOT KEPT AT THE CAGE. A STACK IS CHIPS HELD PLUS CHIPS AT A POKER TABLE.</p>
      </Frame>

      <PaLine tag="THE DEPARTMENT>" text={RESPONSIBLE_LINE} />
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#city/strip/casino">The casino, in the city</Button>
      </ButtonRow>
    </div>
  );
}
