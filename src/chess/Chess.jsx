import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../ui/index.js";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { machineClock } from "../city/sim.js";
import { replay, status, fromUci, uci, grid, sqName, sqOf } from "./rules.js";
import { styleOf, describe } from "./engine.js";
import { figureCard, opponents, talkFor } from "./roster.js";
import { standings, resultsToday, resultLine, gameAt, TABLE, shortName, LADDER_DAYS } from "./park.js";
import { loadChess, chessAct, figureMove } from "./client.js";
import { Piece, PIECE_NAME } from "./pieces.jsx";
import CSS from "./chess.css?inline";
import "../play/pages.css";

// #chess[?vs=<slug>][&table=<id>]: PARK CHESS (docs/CITY_SPEC.md "Park chess"). Sit across a figure
// at a stone table and play a real game: every rule (src/chess/rules.js), the figure's engine in a
// Web Worker with its strength from its file (engine.js). The server deals the game and files the
// result on your file once it replays (/api/chess). No stakes, no prizes. Without a file the game
// is played and not filed.

function injectStyles() {
  let el = document.getElementById("ch-styles");
  if (!el) { el = document.createElement("style"); el.id = "ch-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => { const q = new URLSearchParams(String(route || "").split("?")[1] || ""); return { vs: q.get("vs") || null, table: q.get("table") || null }; };
const KEEP = "hvi-chess-game";
const load = () => { try { return JSON.parse(localStorage.getItem(KEEP) || "null"); } catch { return null; } };
const save = (g) => { try { if (g) localStorage.setItem(KEEP, JSON.stringify(g)); else localStorage.removeItem(KEEP); } catch { /* private window: the game lives in the tab */ } };
const REASON = { checkmate: "CHECKMATE", stalemate: "STALEMATE", threefold: "THREEFOLD REPETITION", fifty: "THE FIFTY-MOVE RULE", insufficient: "NOT ENOUGH MATERIAL TO MATE", resigned: "RESIGNATION" };

function Sprite({ card, size = "m" }) {
  const [bad, setBad] = useState(false);
  if (!card?.sprite || bad) return <span className={`ch-sprite ${size}`} aria-hidden="true"><span className="ini">{(card?.name || "?").slice(0, 2).toUpperCase()}</span></span>;
  return <span className={`ch-sprite ${size}`} aria-hidden="true" style={{ backgroundImage: `url(${card.sprite})` }}><img src={card.sprite} alt="" onError={() => setBad(true)} style={{ display: "none" }} /></span>;
}

export default function Chess({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const { vs, table } = useMemo(() => parseRoute(route), [route]);
  const card = vs ? figureCard(vs) : null;
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  const [pub, setPub] = useState(null);
  const [mine, setMine] = useState(null);
  const [gate, setGate] = useState(null);
  useEffect(() => {
    let off = false;
    loadChess(null).then(d => { if (!off) setPub(d); }).catch(() => {});
    if (caseId) loadChess(caseId).then(d => { if (!off) { setMine(d.record); setGate(null); } }).catch(e => { if (!off) setGate(e.status || 0); });
    return () => { off = true; };
  }, [caseId]);
  const board = mine?.board || pub?.board || [];

  return (
    <div className="ch">
      <ScreenHead title="PARK CHESS" meta="THE STONE TABLES // NO STAKES. NO PRIZES. A RECORD." />
      {card ? <Game key={card.slug} card={card} table={table} caseId={caseId} gate={gate} setCaseId={setCaseId} onFiled={(d) => { if (d?.record) setMine(d.record); if (d?.board) setPub(p => ({ ...(p || {}), board: d.board })); }} />
        : <Picker vsMissing={vs && !card ? vs : null} table={table} />}
      <Boards board={board} mine={mine} caseId={caseId} />
    </div>
  );
}

// ---- choosing an opponent ------------------------------------------------------------------------
function Picker({ vsMissing, table }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => opponents(), []);
  const shown = all ? list : list.slice(0, 14);
  const easiest = useMemo(() => list.reduce((a, c) => (c.rating < a.rating ? c : a), list[0]), [list]);
  const mt = machineClock().mt;
  const at = table && TABLE[table] ? gameAt(table, mt) : null;
  return (
    <>
      {vsMissing && <p className="ch-err" role="alert">NO FIGURE ON FILE BY THAT NAME SITS AT THE TABLES. THE DEPARTMENT DOES NOT SEAT EVERYONE.</p>}
      {table && TABLE[table] && <p className="ch-p">{TABLE[table].name}. {at ? `${shortName(at.white)} V ${shortName(at.black)} ARE MID-GAME; PICK SOMEONE ELSE TO SIT ACROSS.` : "THE TABLE IS FREE. THE PARK IS CLOSED; THE DEPARTMENT LETS YOU PLAY ANYWAY."}</p>}
      <p className="pg-lede">CHESS AGAINST A FIGURE ON FILE, AT A STONE TABLE IN THE PARK. CLICK OR TAP A PIECE, THEN ITS SQUARE; TAB AND ENTER WORK TOO. NO TIMER.</p>
      <div className="pg-start">
        <Button variant="primary" href={`#chess?vs=${easiest.slug}${table ? `&table=${table}` : ""}`}>PLAY NOW</Button>
        <span className="pg-sub">AGAINST {easiest.name.toUpperCase()}, THE GENTLEST GAME ON FILE ({easiest.rating}).</span>
      </div>
      <details className="pg-more">
      <summary>CHOOSE WHO TO PLAY ({list.length} ON FILE)</summary>
      <div className="pg-more-body">
        <p className="ch-p">THE CHESS PLAYERS ON FILE FIRST, THEN EVERYONE ELSE THE DEPARTMENT WILL SEAT. STRENGTH FOLLOWS THE FILE. SOME TALK AT THE TABLE; SOME PLAY IN SILENCE.</p>
        <ul className="ch-opps">
          {shown.map(c => (
            <li key={c.slug}>
              <a className="ch-opp" href={`#chess?vs=${c.slug}${table ? `&table=${table}` : ""}`}>
                <Sprite card={c} size="s" />
                <span className="nm">{c.name.toUpperCase()}{c.chess && <span className="tag">CHESS ON FILE</span>}</span>
                <span className="rt">{c.rating}</span>
              </a>
            </li>
          ))}
        </ul>
        {!all && list.length > shown.length && <ButtonRow><Button onClick={() => setAll(true)}>Show all {list.length}</Button></ButtonRow>}
      </div>
      </details>
    </>
  );
}

// ---- the game ------------------------------------------------------------------------------------
function Game({ card, table, caseId, gate, setCaseId, onFiled }) {
  const style = useMemo(() => styleOf(card), [card]);
  const [g, setG] = useState(() => { const s = load(); return s && s.vs === card.slug ? s : null; });
  const [sel, setSel] = useState(null);
  const [promo, setPromo] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [talk, setTalk] = useState([]);
  const [filed, setFiled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmResign, setConfirmResign] = useState(false);
  useEffect(() => { save(g); }, [g]);

  const { pos, sans } = useMemo(() => replay(g?.moves || []), [g?.moves]);
  const st = useMemo(() => status(pos), [pos]);
  const mySide = g?.side === "b" ? -1 : 1;
  const over = g && (st.over || g.resigned);
  const myTurn = g && !over && pos.turn === mySide;
  const say = (t) => { if (t) setTalk(l => [t, ...l].slice(0, 6)); };

  async function start(side) {
    setErr(""); setFiled(null); setTalk([]); setSel(null);
    let gameId = null, seed = (Math.random() * 2 ** 31) >>> 0 || 1;
    if (caseId && !gate) {
      setBusy(true);
      const r = await chessAct(caseId, "start", { vs: card.slug, side });
      setBusy(false);
      if (r.ok) { gameId = r.data.gameId; seed = r.data.seed; } else setErr(`${r.data.error || "The park did not answer."} THIS GAME WILL NOT BE FILED.`);
    }
    setG({ vs: card.slug, side, gameId, seed, moves: [], started: Date.now(), resigned: false });
    say(talkFor(card, "sit", Math.random()));
  }

  // the figure's move
  const gRef = useRef(g); gRef.current = g;
  useEffect(() => {
    if (!g || over || pos.turn === mySide) return;
    let off = false;
    setThinking(true);
    const t0 = performance.now();
    figureMove(g.moves, style, g.seed).then(async (u) => {
      const wait = 500 - (performance.now() - t0);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      if (off || !u || gRef.current !== g) return;
      const m = fromUci(pos, u);
      const cap = m?.cap ? Math.abs(m.cap) : 0;
      setG({ ...g, moves: [...g.moves, u] });
      setThinking(false);
      // after the move: a check, a capture, now and then a word
      const after = replay([...g.moves, u]).pos, s2 = status(after);
      if (!s2.over) {
        if (s2.check) say(talkFor(card, "check", Math.random()));
        else if (cap >= 2 && Math.random() < 0.6) say(talkFor(card, "move", Math.random()));
        else if (Math.random() < 0.12) say(talkFor(card, card.dead ? "move" : "think", Math.random()));
      }
    });
    return () => { off = true; setThinking(false); };
  }, [g, over, pos, mySide, style, card]);

  // the end: a last word, and the result filed
  const endedRef = useRef(null);
  useEffect(() => {
    if (!g || !over || endedRef.current === g.started) return;
    endedRef.current = g.started;
    const res = g.resigned ? "L" : st.result === "1/2-1/2" ? "D" : (st.result === "1-0") === (mySide === 1) ? "W" : "L";
    say(talkFor(card, res === "W" ? "lose" : res === "L" ? "win" : "draw", Math.random()));
    if (!g.gameId || !caseId) { setFiled({ local: true, res }); return; }
    setBusy(true);
    chessAct(caseId, "result", { gameId: g.gameId, moves: g.moves, resign: Boolean(g.resigned) }).then(r => {
      setBusy(false);
      if (r.ok) { setFiled({ res, ...r.data.filed }); onFiled(r.data); }
      else setFiled({ res, error: r.data.error || "The clerk could not file it." });
    });
  }, [g, over, st, mySide, card, caseId, onFiled]);

  function play(m) {
    setSel(null); setPromo(null);
    setG({ ...g, moves: [...g.moves, uci(m)] });
  }
  function tap(s) {
    if (!myTurn || thinking) return;
    const v = pos.b[s];
    if (sel != null) {
      const ms = st.moves.filter(m => m.from === sel && m.to === s);
      if (ms.length > 1) { setPromo(ms); return; }
      if (ms.length === 1) { play(ms[0]); return; }
    }
    if (v && (v > 0) === (mySide > 0)) setSel(s === sel ? null : s);
    else setSel(null);
  }

  const targets = new Set(sel != null && st ? st.moves.filter(m => m.from === sel).map(m => m.to) : []);
  const lastU = g?.moves?.[g.moves.length - 1];
  const last = lastU ? [sqOf(lastU.slice(0, 2)), sqOf(lastU.slice(2, 4))] : [];
  const kingSq = st.check ? pos.kings[pos.turn > 0 ? 0 : 1] : -1;
  const rows = grid(pos);
  const flip = mySide < 0;
  const ranks = flip ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const at = table && TABLE[table] ? TABLE[table] : null;
  const figName = card.name.toUpperCase();
  const result = over ? (g.resigned ? { res: "L", reason: "resigned" } : { res: st.result === "1/2-1/2" ? "D" : (st.result === "1-0") === (mySide === 1) ? "W" : "L", reason: st.reason }) : null;
  const pairs = [];
  for (let i = 0; i < sans.length; i += 2) pairs.push([i / 2 + 1, sans[i], sans[i + 1] || ""]);

  return (
    <>
      <Frame box title={figName} meta={at ? at.name : "A STONE TABLE"}>
        <div className="ch-dossier">
          <Sprite card={card} size="l" />
          <div>
            <div className="ch-big">{figName} <span className="ch-dim">// {card.dead ? "TALKS AT THE TABLE." : "PLAYS IN SILENCE."}</span></div>
            {card.why && <p className="ch-p ch-small">{card.why}</p>}
            <ul className="ch-lines">{describe(card).map(l => <li key={l}>{l}</li>)}</ul>
          </div>
        </div>
        {!g && (
          <>
            {!caseId && <><p className="ch-p">PLAY WITHOUT A FILE AND NOTHING IS FILED. ENTER YOUR CASE NUMBER TO PUT THE RESULT ON RECORD.</p><CaseLogon onRestored={(id) => setCaseId(id)} /></>}
            {caseId && gate === 403 && <p className="ch-p">YOUR FILE HAS NO ASSESSMENT ON IT. YOU MAY PLAY; NOTHING WILL BE FILED. <a href="#intake">BE ASSESSED</a>.</p>}
            <ButtonRow stackOnMobile>
              <Button variant="primary" disabled={busy} onClick={() => start("w")}>Play White</Button>
              <Button disabled={busy} onClick={() => start("b")}>Play Black</Button>
              <Button variant="back" href="#chess">Someone else</Button>
            </ButtonRow>
          </>
        )}
        {err && <p className="ch-err" role="alert">{err}</p>}
      </Frame>

      {g && (
          <div className="ch-play">
            <div className="ch-board-wrap">
              <div className={`ch-board${myTurn ? " live" : ""}`} role="grid" aria-label={`Chess board, you play ${mySide > 0 ? "White" : "Black"}`}>
                {ranks.map(r => files.map(f => {
                  const s = r * 16 + f, code = rows[7 - r][f], dark = (r + f) % 2 === 0;
                  const cls = ["ch-sq", dark ? "d" : "l", sel === s && "sel", targets.has(s) && (code ? "cap" : "tgt"), last.includes(s) && "last", kingSq === s && "chk"].filter(Boolean).join(" ");
                  return (
                    <button key={s} type="button" className={cls} onClick={() => tap(s)} aria-label={`${sqName(s)}${code ? `, ${code[0] === "w" ? "white" : "black"} ${PIECE_NAME[code[1]]}` : ""}${targets.has(s) ? ", move here" : ""}`}>
                      {code && <Piece code={code} className="pc" />}
                      {f === files[0] && <span className="rk" aria-hidden="true">{r + 1}</span>}
                      {r === ranks[7] && <span className="fl" aria-hidden="true">{"abcdefgh"[f]}</span>}
                    </button>
                  );
                }))}
              </div>
              {promo && (
                <div className="ch-promo" role="dialog" aria-label="Promote the pawn">
                  <span>PROMOTE TO</span>
                  {promo.map(m => { const t = "pnbrqk"[Math.abs(m.promo) - 1]; return <button key={t} type="button" onClick={() => play(m)} aria-label={PIECE_NAME[t]}><Piece code={(mySide > 0 ? "w" : "b") + t} className="pc" /></button>; })}
                  <button type="button" className="x" onClick={() => setPromo(null)}>CANCEL</button>
                </div>
              )}
            </div>
            <Frame box title="THE GAME" meta={g.gameId ? `GAME ${g.gameId.slice(-6).toUpperCase()} // ON RECORD` : "UNFILED"} className="ch-side">
              <div className="ch-status" aria-live="polite">
                {over ? <span className={result.res === "W" ? "ch-win" : result.res === "L" ? "ch-lose" : ""}>{result.res === "W" ? `YOU BEAT ${figName}` : result.res === "L" ? `${figName} WINS` : "DRAWN"} // {REASON[result.reason] || result.reason}</span>
                  : thinking ? <span>{figName} IS THINKING{style.depth >= 4 ? ". AT LENGTH." : "."}</span>
                  : <span>{myTurn ? "YOUR MOVE" : "…"}{st.check ? " // CHECK" : ""}{myTurn && sans.length > 0 ? ` // ${figName} PLAYED ${sans[sans.length - 1]}` : ""}</span>}
              </div>
              {talk.length > 0 && <ul className="ch-talk">{talk.map((t, i) => <li key={i} className={t.kind}>{t.kind === "say" ? `${figName}: “${t.text}”` : t.text}</li>)}</ul>}
              <ol className="ch-moves" aria-label="Moves">{pairs.map(([n, a, b]) => <li key={n}><span className="n">{n}.</span> <span>{a}</span> <span>{b}</span></li>)}</ol>
              {over && filed && (
                <p className={filed.error ? "ch-err" : "ch-p"} role="status">
                  {filed.local ? "NOT FILED: NO FILE, OR THE DEPARTMENT WAS NOT TOLD. THE GAME HAPPENED ANYWAY." : filed.error ? filed.error : `FILED. ${filed.res === "W" ? `DEFEATED ${figName}. THE DEPARTMENT DOUBTS IT.` : filed.res === "D" ? `DREW WITH ${figName}.` : `LOST TO ${figName}.`} CITIZEN RATING ${filed.delta >= 0 ? "+" : ""}${filed.delta}.`}
                  {!filed.local && !filed.error && <> <a href="#file">MY FILE</a></>}
                </p>
              )}
              <ButtonRow stackOnMobile>
                {!over && (confirmResign
                  ? <><Button variant="danger" onClick={() => { setConfirmResign(false); setSel(null); setG({ ...g, resigned: true }); }}>Resign, on the record</Button><Button variant="back" onClick={() => setConfirmResign(false)}>Play on</Button></>
                  : <Button variant="secondary" disabled={!g.moves.length} onClick={() => setConfirmResign(true)}>Resign</Button>)}
                {over && <Button variant="primary" disabled={busy} onClick={() => { setG(null); setFiled(null); setTalk([]); }}>Again</Button>}
                {over && <Button variant="back" href="#chess">Someone else</Button>}
              </ButtonRow>
            </Frame>
          </div>
      )}
    </>
  );
}

// ---- the ladders ---------------------------------------------------------------------------------
function Boards({ board, mine, caseId }) {
  const clock = machineClock();
  const rows = useMemo(() => standings(clock.day).slice(0, 10), [clock.day]);
  const today = resultsToday(clock.mt, 6);
  return (
    <>
      <Frame box title="THE PARK CHESS LADDER" meta={`MACHINE DAY ${clock.day}`}>
        <p className="ch-p ch-small">EVERY GAME AT THE STONE TABLES OVER THE LAST {LADDER_DAYS} MACHINE DAYS, RATED. THE STANDINGS ARE FIXED AT THE START OF EACH DAY; TODAY'S GAMES MOVE TOMORROW'S.</p>
        <table className="ch-table">
          <thead><tr><th>#</th><th>PLAYER</th><th>RATING</th><th>W-D-L</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.key}><td>{r.rank}</td><td>{r.kind === "figure" ? <a href={`#chess?vs=${r.key}`}>{r.name}</a> : r.name}</td><td>{r.elo}</td><td>{r.w}-{r.d}-{r.l}</td></tr>)}</tbody>
        </table>
        {today.length > 0 && <><div className="ch-sub-h">TODAY AT THE TABLES</div><ul className="ch-results">{today.map(x => <li key={`${x.slot}|${x.table}`}>{resultLine(x)}</li>)}</ul></>}
      </Frame>
      <Frame box title="CITIZENS V THE FIGURES" meta="NO PRIZES">
        {mine && <ul className="ch-lines ch-mine">{mine.lines.map(l => <li key={l}>{l}</li>)}</ul>}
        {board.length ? (
          <table className="ch-table">
            <thead><tr><th>#</th><th>CASE</th><th>RATING</th><th>W-D-L</th><th>BEST SCALP</th></tr></thead>
            <tbody>{board.map(r => <tr key={r.rank} className={caseId && r.case.endsWith(caseId.slice(-4)) ? "me" : ""}><td>{r.rank}</td><td>{r.case}</td><td>{r.rating}</td><td>{r.w}-{r.d}-{r.l}</td><td>{r.best || "—"}</td></tr>)}</tbody>
          </table>
        ) : <p className="ch-p">NO CITIZEN HAS FILED A GAME YET. THE FIGURES ARE WAITING. SOME OF THEM HAVE BEEN WAITING FOR CENTURIES.</p>}
      </Frame>
    </>
  );
}
