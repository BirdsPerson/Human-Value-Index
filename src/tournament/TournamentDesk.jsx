import { useEffect, useMemo, useState } from "react";
import { Frame, Button, ButtonRow } from "../ui/index.js";
import { readCaseId } from "../caseFile.jsx";
import { eventById, eventsBetween, statusOf, whenText, hrefOf } from "./calendar.js";
import { DIVISIONS, DIV_NAME, DIV_LINE, scoreText } from "./rules.js";
import { calendarOnce, loadEvent, enterEvent, submitLeg } from "./api.js";
import "./tournament.css";

// THE TOURNAMENT desk on a game's start screen (golf, bowling, fishing; docs/TOURNAMENTS.md): this
// game's events (live, upcoming, just finished), the chosen one's locked setup, the division, ENTER
// (the official attempt: a file needed) or PRACTICE (the same setup, unofficial, open to all), and
// its boards. The game plays the round; fileLeg below files it.
//   onStart({ev, div, official, permit, legsFiled})
const PERMITS = "hvi-tourney-permits";
const loadPermits = () => { try { const j = JSON.parse(localStorage.getItem(PERMITS) || "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; } };
function savePermit(id, p) { try { const all = loadPermits(); all[id] = p; const keep = Object.fromEntries(Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 20)); localStorage.setItem(PERMITS, JSON.stringify(keep)); } catch { /* the tab keeps it */ } }
export const permitFor = (id) => loadPermits()[id] || null;

const ORD = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "ST" : n % 10 === 2 && n % 100 !== 12 ? "ND" : n % 10 === 3 && n % 100 !== 13 ? "RD" : "TH"}`;
export const STATUS_WORD = { upcoming: "UPCOMING", open: "LIVE", closing: "FILING", closed: "FINAL" };
export function windowLine(ev, now = Date.now()) {
  const st = statusOf(ev, now);
  return st === "upcoming" ? `OPENS ${whenText(ev.opens)}` : st === "open" ? `OPEN UNTIL ${whenText(ev.closes)}` : st === "closing" ? "CLOSED. THE LAST CARDS ARE BEING FILED." : `CLOSED ${whenText(ev.closes)}`;
}
export function prizeLine(ev) {
  const t = ev.prizes.trophies.length;
  const cups = t === 3 ? "TROPHIES FOR THE TOP THREE IN OPEN AND THE ASSISTED WINNER (A PIECE FOR YOUR FLAT), AND A LINE ON THE FILE" : t === 1 ? "A TROPHY FOR EACH DIVISION'S WINNER (A PIECE FOR YOUR FLAT), AND A LINE ON THE FILE" : "A LINE ON EACH DIVISION WINNER'S FILE. TROPHIES ARE FOR THE MAJORS";
  return `${cups}. NO CYCLES: THE DEPARTMENT DOES NOT PAY FOR LEISURE.`;
}

// File one leg of an official attempt: -> a line for the end menu ("FILED. 3RD OF 12 IN OPEN, PROJECTED.")
export async function fileLeg(ev, entry, leg, rec) {
  const caseId = readCaseId();
  if (!caseId || !entry?.permit) return "NOT FILED: NO ENTRY ON THIS BROWSER.";
  try {
    const j = await submitLeg(caseId, entry.permit, leg, rec);
    const s = j.standing;
    const where = s ? `${ORD(s.pos)} OF ${s.of} IN ${DIV_NAME[s.div]}` : "ON THE BOARD";
    const more = ev.legs > 1 ? (j.done ? ` SERIES COMPLETE: ${s?.total} PINS.` : ` GAME ${leg + 1} OF ${ev.legs} FILED.`) : "";
    return `FILED AND RE-PLAYED BY THE DEPARTMENT: ${where}, ${j.final ? "FINAL" : "PROJECTED"}.${more}`;
  } catch (e) {
    return `NOT FILED: ${e.message}`;
  }
}

export function Leaderboard({ ev, board, top = 20 }) {
  if (!board) return <p className="tq-dim">THE BOARD IS BEING FETCHED.</p>;
  const label = board.final ? "FINAL" : statusOf(ev, Date.now()) === "upcoming" ? "NOT YET OPEN" : "PROJECTED";
  return (
    <div className="tq-boards">
      {(ev.game === "fish" ? ["open"] : DIVISIONS).map(d => {
        const rows = (board.divisions?.[d] || []).slice(0, top);
        return (
          <div key={d} className="tq-board">
            <h4>{DIV_NAME[d]} <span className="tq-dim">// {label}{board.nc?.[d] ? ` // ${board.nc[d]} NO CARD` : ""}</span></h4>
            {rows.length ? (
              <table className="tq-table">
                <thead><tr><th scope="col">#</th><th scope="col">ENTRANT</th><th scope="col">{ev.game === "golf" ? "TO PAR" : ev.game === "fish" ? "WEIGHT" : "PINS"}</th></tr></thead>
                <tbody>{rows.map(r => <tr key={r.pos} className={r.done ? "" : "tq-live"}><td>{r.pos}</td><td>{r.holder}</td><td>{scoreText(ev, r)}</td></tr>)}</tbody>
              </table>
            ) : <p className="tq-dim">{board.final ? "NOBODY FINISHED. THE TROPHY STAYS IN THE CABINET." : "NO CARDS YET. THE FIRST ONE LEADS."}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function TournamentDesk({ game, id, onStart, refresh = 0, busy = false }) {
  const now = Date.now();
  const [cal, setCal] = useState(null);
  const [board, setBoard] = useState(null);
  const [div, setDiv] = useState(() => { try { return localStorage.getItem("hvi-tourney-div") === "assisted" ? "assisted" : "open"; } catch { return "open"; } });
  const [msg, setMsg] = useState("");
  const [working, setWorking] = useState(false);
  const local = useMemo(() => eventsBetween(now - 86400000, now + 7 * 86400000).filter(e => e.game === game), [game]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let off = false; calendarOnce().then(j => { if (!off) setCal(j.events.filter(e => e.game === game)); }).catch(() => {}); return () => { off = true; }; }, [game]);
  const events = cal || local;
  const picked = id ? eventById(id) : null;
  const ev = picked && picked.game === game ? picked : events.find(e => statusOf(e, now) === "open") || null;
  useEffect(() => {
    if (!ev) return;
    let off = false;
    setBoard(null);
    loadEvent(ev.id).then(j => { if (!off) setBoard(j.board); }).catch(() => { if (!off) setBoard({ divisions: {}, final: false }); });
    return () => { off = true; };
  }, [ev?.id, refresh]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pickDiv = (d) => { setDiv(d); try { localStorage.setItem("hvi-tourney-div", d); } catch { /* fine */ } };
  const caseId = readCaseId();
  const st = ev ? statusOf(ev, now) : null;
  const divs = game === "fish" ? ["open"] : DIVISIONS;   // the waters have no assists: one board
  const myDiv = divs.includes(div) ? div : "open";

  const enter = async () => {
    if (!caseId) { setMsg("A FILE IS NEEDED TO ENTER: THE BOARD NAMES FILES. PRACTICE IS OPEN TO ALL."); return; }
    setWorking(true); setMsg("");
    try {
      const j = await enterEvent(caseId, ev.id, myDiv);
      const entry = { permit: j.permit, div: j.div, at: j.at, attempt: j.attempt, expires: j.expires };
      savePermit(ev.id, entry);
      onStart({ ev, div: j.div, official: true, permit: j.permit, legsFiled: j.legsFiled || 0, entry });
    } catch (e) { setMsg(e.message); }
    setWorking(false);
  };
  const rank = (e) => { const x = statusOf(e, now); return x === "open" ? 0 : x === "upcoming" ? (e.major ? 1 : 2) : 3; };
  const others = events.filter(e => !ev || e.id !== ev.id).filter(e => statusOf(e, now) !== "closed" || now - e.closes < 3 * 86400000)
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? b.closes - a.closes : a.opens - b.opens)).slice(0, 6);

  return (
    <Frame title="TOURNAMENT" meta="OPEN TO EVERY FILE // PLAY WHEN YOU LIKE, INSIDE THE WINDOW" className="tq">
      {ev ? (
        <div className="tq-ev">
          <h3 className="tq-name">{ev.name} <span className={`tq-chip ${st}`}>{STATUS_WORD[st]}</span></h3>
          <p className="tq-line">{ev.venue} // {ev.format} // {windowLine(ev, now)}</p>
          <p className="tq-dim">THE SETUP IS LOCKED: THE SAME {ev.game === "golf" ? "COURSE, TEES, PINS AND WIND" : ev.game === "bowling" ? `OIL (${ev.cond.oil}) AND RACKS` : "WATER, LIGHT AND FISH"} FOR EVERY ENTRANT. {ev.attempts === 1 ? "ONE OFFICIAL ATTEMPT" : `${ev.attempts} OFFICIAL ATTEMPTS`}; PRACTICE AS OFTEN AS YOU LIKE. EVERY OFFICIAL CARD IS RE-PLAYED BY THE DEPARTMENT BEFORE IT IS BELIEVED.</p>
          <p className="tq-dim">{prizeLine(ev)}</p>
          {divs.length > 1 && (
            <div className="tq-divs" role="group" aria-label="Division">
              {divs.map(d => <button key={d} type="button" className="pg-toggle" aria-pressed={myDiv === d} onClick={() => pickDiv(d)}>{DIV_NAME[d]}</button>)}
              <span className="tq-dim">{DIV_LINE[myDiv]}</span>
            </div>
          )}
          <ButtonRow>
            <Button variant="primary" onClick={enter} disabled={st !== "open" || working || busy}>{st === "open" ? `ENTER: THE OFFICIAL ${ev.game === "bowling" ? "SERIES" : ev.game === "fish" ? "TRIP" : "ROUND"}` : st === "upcoming" ? "NOT OPEN YET" : "ENTRIES CLOSED"}</Button>
            <Button variant="secondary" onClick={() => onStart({ ev, div: myDiv, official: false })} disabled={busy}>PRACTICE (UNOFFICIAL)</Button>
          </ButtonRow>
          {!caseId && st === "open" && <p className="tq-dim">ENTERING NEEDS A FILE (<a href="#file">MY FILE</a>). THE BOARD NAMES FILES, NOT VISITORS.</p>}
          {msg && <p className="tq-msg" role="status">{msg}</p>}
          <Leaderboard ev={ev} board={board} />
        </div>
      ) : <p className="tq-dim">NO {game === "golf" ? "GOLF" : game === "bowling" ? "BOWLING" : "FISHING"} EVENT IS OPEN RIGHT NOW. THE CALENDAR BELOW SAYS WHEN.</p>}
      {others.length > 0 && (
        <ul className="tq-cal" aria-label="More events">
          {others.map(e => { const s = statusOf(e, now); return <li key={e.id}><a href={hrefOf(e)}><b>{e.name}</b></a> <span className={`tq-chip ${s}`}>{STATUS_WORD[s]}</span> <span className="tq-dim">{windowLine(e, now)}</span></li>; })}
        </ul>
      )}
    </Frame>
  );
}
