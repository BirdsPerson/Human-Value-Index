import { useEffect, useState } from "react";
import { Frame } from "../ui/index.js";
import { eventsBetween, statusOf } from "./calendar.js";
import { DIV_NAME, scoreText } from "./rules.js";
import { calendarOnce, loadMine } from "./api.js";
import { STATUS_WORD, windowLine } from "./TournamentDesk.jsx";
import "./tournament.css";

const GAME_WORD = { golf: "GOLF", bowling: "BOWLING", fish: "FISHING" };
const lead = (e) => {
  const L = e.leaders, o = L?.open?.[0], a = L?.assisted?.[0];
  if (!o && !a) return e.status === "upcoming" ? "" : "NO CARDS YET.";
  return [o && `${e.final ? "WON BY" : "LEADER"}: ${o.holder} ${scoreText(e, o)}`, a && `${DIV_NAME.assisted}: ${a.holder} ${scoreText(e, a)}`].filter(Boolean).join(" // ");
};

// THE LEAGUES hub's OPEN TOURNAMENTS (src/city/LeagueHub.jsx): every event live, coming and just
// finished, its leader, one tap to the game in tournament mode (docs/TOURNAMENTS.md).
export default function TournamentList() {
  const now = Date.now();
  const [evs, setEvs] = useState(() => eventsBetween(now - 3 * 86400000, now + 7 * 86400000).map(e => ({ ...e, status: statusOf(e, now) })));
  useEffect(() => { let off = false; calendarOnce().then(j => { if (!off) setEvs(j.events); }).catch(() => {}); return () => { off = true; }; }, []);
  const order = { open: 0, closing: 1, upcoming: 2, closed: 3 };
  const list = evs.slice().sort((a, b) => order[a.status] - order[b.status] || (a.status === "closed" ? b.closes - a.closes : a.closes - b.closes)).slice(0, 12);
  return (
    <Frame title="OPEN TOURNAMENTS" meta="ANY FILE MAY ENTER // EVERY CARD RE-PLAYED" className="tq">
      <p className="tq-dim">THE SAME COURSE, LANES OR WATER FOR EVERYONE; PLAY WHEN YOU LIKE INSIDE THE WINDOW. OPEN AND ASSISTED BOARDS. TROPHIES FOR YOUR FLAT, LINES ON YOUR FILE.</p>
      <ul className="tq-cal">
        {list.map(e => (
          <li key={e.id}>
            <a href={e.href}><b>{e.name}</b></a> <span className={`tq-chip ${e.status}`}>{STATUS_WORD[e.status]}</span>{" "}
            <span className="tq-dim">{GAME_WORD[e.game]} // {windowLine(e, now)}{lead(e) ? ` // ${lead(e)}` : ""}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// MY FILE: THE HONOURS. The lines the Department wrote on this file for winning, and its places.
export function MyTournaments({ caseId }) {
  const [mine, setMine] = useState(null);
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    loadMine(caseId).then(j => { if (!off) setMine(j.mine); }).catch(() => {});
    return () => { off = true; };
  }, [caseId]);
  if (!caseId || !mine || (!mine.honours.length && !mine.places.length)) return null;
  const live = mine.places.filter(p => !p.final && p.pos);
  return (
    <Frame title="THE HONOURS" meta={mine.honours.length ? `${mine.honours.length} ON FILE` : "ENTRANT ON FILE"} className="tq">
      {mine.honours.length > 0 && <ul className="tq-honours">{mine.honours.slice(0, 12).map((h, i) => <li key={i} className="hvi-note" style={{ margin: 0 }}>{h.line}{h.sku ? " THE TROPHY IS IN YOUR INVENTORY: PLACE IT IN YOUR FLAT." : ""}</li>)}</ul>}
      {live.length > 0 && <ul className="tq-cal">{live.map(p => <li key={p.id}><a href={p.href}><b>{p.name}</b></a> <span className="tq-dim">{p.pos} OF {p.of} IN {DIV_NAME[p.div]}, PROJECTED</span></li>)}</ul>}
    </Frame>
  );
}
