// LEADERBOARD (Scott, 2026-10-06): who leads the tournament on now (golf, bowling, the Sunday derby), or the last one
// finished. /api/tournament for the calendar and each event's top five; the L size also asks ?id= for the whole
// board, both divisions, with arrows for who moved since the last look (kept on this device, at least five minutes
// old before it counts). One prepared layout per size: S the leader and the score, M the top five, T seven in a
// column, L the full board, W a stepping board, one entrant at a time. The pure half is board.js.
import { useEffect, useRef, useState } from "react";
import { Frame, Chip, Chips } from "../ui/index.js";
import { pickEvent, leadersOf, scoreText, holder, moves, snapshot, arrowOf, whenText, DIVS } from "./board.js";
import { get, put } from "./prefs.js";

const getJSON = (u) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
export const STEP_MS = 7000, POLL_MS = 60_000, MOVE_AFTER_MS = 5 * 60_000, KEEP_AFTER_MS = 10 * 60_000;

// what changed since the last snapshot of this event (null before there is one)
function movement(evId, boards) {
  let prev = null;
  try { prev = JSON.parse(get("hvi-board-prev") || "null"); } catch { prev = null; }
  const now = Date.now(), old = prev && prev.id === evId && now - prev.at >= MOVE_AFTER_MS ? prev.pos : null;
  if (!prev || prev.id !== evId || now - prev.at >= KEEP_AFTER_MS) put("hvi-board-prev", JSON.stringify({ id: evId, at: now, pos: Object.fromEntries(DIVS.map(d => [d, snapshot(boards[d])])) }));
  return Object.fromEntries(DIVS.map(d => [d, old ? moves(old[d], boards[d]) : null]));
}

function useBoard(full) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let off = false;
    const load = async () => {
      const cal = await getJSON("/api/tournament");
      if (off) return;
      const pick = cal?.events ? pickEvent(cal.events) : null;
      if (!pick) { setD(null); return; }
      let boards = Object.fromEntries(DIVS.map(div => [div, pick.ev.leaders?.[div] || []]));
      if (full) {
        const b = await getJSON(`/api/tournament?id=${encodeURIComponent(pick.ev.id)}`);
        if (off) return;
        if (b?.board?.divisions) boards = Object.fromEntries(DIVS.map(div => [div, b.board.divisions[div] || []]));
      }
      setD({ ...pick, boards, mv: full ? movement(pick.ev.id, boards) : null });
    };
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => { off = true; clearInterval(iv); };
  }, [full]);
  return d;
}

const Arrow = ({ d }) => { const a = arrowOf(d); return <span className={`ar ${a.cls}`} role="img" aria-label={a.word} title={a.word}>{a.ch}</span>; };
const nm = (r, short) => (short ? holder(r).replace(/^SUBJECT /, "") : holder(r));   // a narrow window: 7Q2X, not SUBJECT 7Q2X
const Row = ({ ev, r, mv, i, short }) => (
  <li key={i} className={r.pos === 1 ? "lead" : ""}>
    <span className="pos">{r.pos}</span>
    <span className="n">{nm(r, short)}</span>
    {mv !== undefined && <Arrow d={mv} />}
    <span className="sc">{scoreText(ev, r)}{ev.game === "bowling" && !r.done ? <i> THRU {r.legs}</i> : null}</span>
  </li>
);
const List = ({ ev, rows, n, mv, cls = "", short }) => (
  <ol className={`fr-lb ${cls}`}>{rows.slice(0, n).map((r, i) => <Row key={r.holder + i} ev={ev} r={r} i={i} short={short} mv={mv ? mv[r.holder] : undefined} />)}</ol>
);
const Foot = ({ ev }) => <a className="fr-go" href={ev.href || "#play"}>THE FULL BOARD ›</a>;
const NoCards = () => <p className="fr-dim">NO CARDS IN YET. THE BOARD IS YOURS TO TAKE.</p>;

const VIEWS_board = {
  S: ({ ev, rows }) => {
    const l = rows[0];
    return (
      <a className="fr-glance" href={ev.href || "#play"}>
        <span className="big">{l ? scoreText(ev, l) : "OPEN"}</span>
        <span className="ln1"><span className="n">{l ? nm(l, true) : "NO CARDS YET"}</span></span>
        <span className="c">{ev.name}</span>
      </a>
    );
  },
  M: ({ ev, rows }) => (rows.length ? <><List ev={ev} rows={rows} n={5} /><Foot ev={ev} /></> : <NoCards />),
  T: ({ ev, rows }) => (rows.length ? <><List ev={ev} rows={rows} n={7} cls="tall" short /><Foot ev={ev} /></> : <NoCards />),
  L: ({ ev, boards, mv }) => (
    <div className="fr-lb-cols">
      {DIVS.map(div => (
        <section key={div} aria-label={`${div} division`}>
          <h2 className="fr-h">{div === "open" ? "OPEN" : "ASSISTED"}</h2>
          {boards[div].length ? <List ev={ev} rows={boards[div]} n={100} mv={mv?.[div]} /> : <p className="fr-dim">NO CARDS.</p>}
        </section>
      ))}
    </div>
  ),
  W: function Stepping({ ev, boards, mv }) {
    const [div, setDiv] = useState("open"), [i, setI] = useState(0), [paused, setPaused] = useState(reduced), [hold, setHold] = useState(false);
    const rows = boards[div].length ? boards[div] : boards[div === "open" ? "assisted" : "open"], n = rows.length;
    const tick = useRef(null);
    useEffect(() => {
      if (paused || hold || n < 2) return undefined;
      tick.current = setTimeout(() => { if (!document.hidden) setI(v => (v + 1) % n); }, STEP_MS);
      return () => clearTimeout(tick.current);
    }, [paused, hold, n, i]);
    const r = rows[i % Math.max(1, n)], go = (k) => setI(v => (v + k + n) % n);
    return (
      <div className="fr-lb-w" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
        {r ? <ol className="fr-lb big"><Row ev={ev} r={r} i={i} mv={mv?.[div] ? mv[div][r.holder] : undefined} /></ol> : <NoCards />}
        <div className="fr-ww-ctl">
          <Chips className="fr-tabs" role="group" aria-label="Which division">
            {DIVS.map(k => <Chip key={k} pressed={div === k} onClick={() => { setDiv(k); setI(0); }}>{k === "open" ? "OPEN" : "ASSISTED"}</Chip>)}
          </Chips>
          {n > 1 && (
            <div className="fr-steps">
              <button type="button" onClick={() => go(-1)} aria-label="Previous place">◀</button>
              <button type="button" onClick={() => setPaused(p => !p)} aria-pressed={paused}>{paused ? "PLAY" : "PAUSE"}</button>
              <button type="button" onClick={() => go(1)} aria-label="Next place">▶</button>
            </div>
          )}
        </div>
      </div>
    );
  },
};

export default function Leaderboard({ size = "M" }) {
  const d = useBoard(size === "L");
  const V = VIEWS_board[size] || VIEWS_board.M;
  const rows = d ? leadersOf(d.ev) : [];
  return (
    <Frame title={size === "S" ? "BOARD" : size === "T" ? "LEADERS" : "LEADERBOARD"} meta={d && size !== "S" && size !== "T" ? `${d.ev.name} · ${whenText(d.ev, d.live)}` : ""} tone="var(--accent)" className={`fr-board v-${size}`}>
      {d ? <V ev={d.ev} rows={rows} boards={d.boards} mv={d.mv} />
        : <p className="fr-dim">{d === undefined ? "…" : "NO TOURNAMENT HAS BEEN HELD. THE DEPARTMENT IS PREPARING ONE."}</p>}
    </Frame>
  );
}
