// HEARTS and SPADES at a felt table: you in the south seat, three figures on file round the rest
// (their heads cut from their file photos). The rules engines (hearts.js, spades.js) are the
// authority; this page plays the figures' turns one at a time (step) with a pause between, shows
// each finished trick for a moment, and keeps the game in this browser (cfg + log, replayed).
// Tap a card to play it; arrows / d-pad move between cards, Enter / A plays; Esc / Start pauses.
// Exhibition: no CYCLES, no chips, nothing won but the game.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as HT from "./hearts.js";
import * as SPD from "./spades.js";
import PixelCard, { CW } from "./PixelCard.jsx";
import Head, { spriteOf } from "./Head.jsx";
import GameMenu from "../GameMenu.jsx";
import { Button } from "../../ui/index.js";
import { codeOf, nameOf } from "./deck.js";
import { useFour, reducedMotion } from "./prefs.js";
import { arrowKeys, usePad } from "./padnav.js";
import { emoteFor } from "./roster.js";

const POS = ["s", "w", "n", "e"];
const ENG = { hearts: HT, spades: SPD };
const UP = (c) => nameOf(c).toUpperCase();
const ord = (n) => ["1ST", "2ND", "3RD", "4TH"][n] || `${n + 1}TH`;

function useWidth(ref) {
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const save = (key, v) => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* private mode */ } };
const load = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };

export default function TrickGame({ kind, table, at, target, onLeave, onNewTable, backHref }) {
  const E = ENG[kind];
  const four = useFour();
  const reduced = useMemo(reducedMotion, []);
  const names = useMemo(() => ["YOU", ...table.seats.map(s => s.name)], [table]);
  const KEY = `hvi-cards-${kind}`;
  const tableKey = table.seats.map(s => s.key).join(",");
  const cfgFor = useCallback((round) => ({ seed: ((table.seed + round * 7919) >>> 0) || 1, seats: [null, ...table.seats], target }), [table, target]);

  // the game: {round, log, st}; resumed from this browser when it is the same table
  const [game, setGame] = useState(() => {
    const s = load(KEY);
    if (s && s.table === tableKey && s.target === target && Array.isArray(s.log)) {
      const st = E.replay(cfgFor(s.round || 0), s.log);
      if (st && st.phase !== "over") return { round: s.round || 0, log: s.log, st: { ...st, events: [] } };
    }
    return { round: 0, log: [], st: E === HT ? HT.newHearts(cfgFor(0), { step: true }) : SPD.newSpades(cfgFor(0), { step: true }) };
  });
  const { st } = game;
  const [hold, setHold] = useState(null);        // a finished trick, on the table a moment longer
  const [lines, setLines] = useState([]);        // the table log
  const [say, setSay] = useState("");            // the screen reader's line
  const [emotes, setEmotes] = useState({});      // seat -> a silent gesture
  const [sel, setSel] = useState([]);            // the pass
  const [hint, setHint] = useState(null);
  const [paused, setPaused] = useState(false);
  const [menuClosed, setMenuClosed] = useState(false);
  const [err, setErr] = useState("");
  const root = useRef(null), handRef = useRef(null), heldFor = useRef(null);
  const width = useWidth(root);

  useEffect(() => { save(KEY, { table: tableKey, target, round: game.round, log: game.log }); }, [KEY, tableKey, target, game.round, game.log]);

  const emote = useCallback((p, moment, pick = 0) => {
    if (p === 0) return;
    const e = emoteFor(table.seats[p - 1], moment, pick);
    if (!e) return;
    setEmotes(m => ({ ...m, [p]: e.text }));
    setLines(l => [...l.slice(-60), { t: e.text, k: "em" }]);
    setTimeout(() => setEmotes(m => { const n = { ...m }; if (n[p] === e.text) delete n[p]; return n; }), 4200);
  }, [table]);

  // what each step's events say
  const tell = useCallback((s) => {
    const out = [];
    for (const e of s.events || []) {
      if (e.k === "deal") out.push({ t: kind === "hearts" ? `HAND ${e.hand + 1}. ${e.dir === "hold" ? "NO PASS THIS HAND." : `PASS THREE CARDS ${e.dir.toUpperCase()}.`}` : `HAND ${e.hand + 1}. ${names[e.dealer]} ${e.dealer === 0 ? "DEAL" : "DEALS"}. BID THE TRICKS YOU WILL TAKE.`, k: "h" });
      else if (e.k === "pass") out.push({ t: `YOU PASSED ${e.gave.map(UP).join(", ")}. YOU GOT ${e.got.map(UP).join(", ")}.` });
      else if (e.k === "bid") out.push({ t: `${names[e.p]} ${e.p === 0 ? "BID" : "BIDS"} ${e.n === 0 ? "NIL" : e.n}.` });
      else if (e.k === "play") out.push({ t: `${names[e.p]}: ${UP(e.c)}.` });
      else if (e.k === "broken") out.push({ t: kind === "hearts" ? "HEARTS ARE BROKEN." : "SPADES ARE BROKEN.", k: "h" });
      else if (e.k === "trick") out.push({ t: `${names[e.p]} ${e.p === 0 ? "TAKE" : "TAKES"} THE TRICK${e.pts ? `: ${e.pts} POINT${e.pts === 1 ? "" : "S"}` : ""}.`, k: "t" });
      else if (e.k === "hand" && kind === "hearts") {
        if (e.moon >= 0) out.push({ t: `${names[e.moon]} SHOT THE MOON. EVERYONE ELSE TAKES 26.`, k: "h" });
        out.push({ t: `HAND OVER: ${e.pts.map((p, i) => `${names[i]} ${p}`).join(", ")}.`, k: "h" });
      } else if (e.k === "hand") {
        for (const r of e.rows) out.push({ t: `${r.team === 0 ? `YOU AND ${names[2]}` : `${names[1]} AND ${names[3]}`}: BID ${r.bid}, TOOK ${r.took}${r.made ? "" : " (SET)"}${r.nil.map(n => `, ${names[n.p]}'S NIL ${n.ok ? "MADE" : "BROKEN"}`).join("")}: ${r.pts >= 0 ? "+" : ""}${r.pts}${r.penalty ? `, ${r.penalty} FOR BAGS` : ""}.`, k: "h" });
      } else if (e.k === "game") out.push({ t: "GAME OVER.", k: "h" });
    }
    if (out.length) { setLines(l => [...l.slice(-60), ...out]); setSay(out.map(o => o.t).join(" ")); }
    for (const e of s.events || []) {
      if (e.k === "hand" && kind === "hearts" && e.moon > 0) emote(e.moon, "moon");
      if (e.k === "hand" && kind === "spades") for (const r of e.rows) if (!r.made) [r.team, r.team + 2].forEach(p => emote(p, "set", p));
      if (e.k === "game") {
        const winners = kind === "hearts" ? e.winners : [e.team, e.team + 2];
        for (let p = 1; p < 4; p++) emote(p, winners.includes(p) ? "win" : "lose", p);
      }
    }
  }, [kind, names, emote]);

  // the first deal's lines, and the figures settling in
  useEffect(() => { tell(st); [1, 2, 3].forEach(p => emote(p, "start", p)); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // the figures' turns, one at a time; a finished trick stays up a moment
  useEffect(() => {
    if (paused) return undefined;
    if (hold) { const t = setTimeout(() => setHold(null), reduced ? 650 : 1000); return () => clearTimeout(t); }
    if (st.events?.some(e => e.k === "trick") && heldFor.current !== st && st.last) { heldFor.current = st; setHold({ trick: st.last.trick, w: st.last.w }); return undefined; }
    if (!E.waiting(st)) return undefined;
    const t = setTimeout(() => {
      const nx = E.step(st);
      if (nx) { tell(nx); setGame(g => ({ ...g, st: nx })); }
    }, reduced ? 260 : 520);
    return () => clearTimeout(t);
  }, [st, hold, paused, E, tell, reduced]);

  const act = (a) => {
    if (hold || paused) return;
    const nx = E.apply(st, a, { step: true });
    if (!nx) { setErr("THAT CARD CANNOT BE PLAYED NOW. THE RULES ARE THE RULES."); return; }
    setErr(""); setHint(null); setSel([]);
    tell(nx);
    setGame(g => ({ ...g, log: [...g.log, a], st: nx }));
  };
  const newGame = (round) => {
    const st0 = E === HT ? HT.newHearts(cfgFor(round), { step: true }) : SPD.newSpades(cfgFor(round), { step: true });
    setLines([]); setHold(null); setSel([]); setHint(null); setMenuClosed(false); setPaused(false);
    tell(st0);
    setGame({ round, log: [], st: st0 });
  };

  // ---- what is on the table ----------------------------------------------------------------------
  const myTurn = !hold && !paused && st.turn === 0;
  const legal = myTurn && st.phase === "play" ? E.legal(st, 0) : [];
  const passing = kind === "hearts" && st.phase === "pass" && !hold;
  const bidding = kind === "spades" && st.phase === "bid" && myTurn;
  const trick = hold ? hold.trick : st.trick || [];
  const handCount = (p) => st.hands[p].length;
  const cardScale = width < 420 ? 1.5 : width < 720 ? 2 : 2;
  const handScale = width < 380 ? 1.75 : 2;
  const n = st.hands[0].length;
  const cw = CW * handScale;
  const ov = n > 1 ? Math.min(4, Math.floor(((Math.min(width, 900) - 16 - cw) / (n - 1)) - cw)) : 0;

  const tapCard = (c) => {
    if (passing) { setSel(s => (s.includes(c) ? s.filter(x => x !== c) : s.length < 3 ? [...s, c] : s)); return; }
    if (legal.includes(c)) act({ t: "play", c });
    else if (myTurn && st.phase === "play") setErr(kind === "hearts" && !st.trick.length && !st.broken ? "HEARTS ARE NOT BROKEN YET. LEAD SOMETHING ELSE." : kind === "spades" && !st.trick.length && !st.broken ? "SPADES ARE NOT BROKEN YET. LEAD ANOTHER SUIT." : "FOLLOW SUIT. THE DEPARTMENT IS WATCHING.");
  };
  const showHint = () => {
    const h = E.hintFor(st);
    if (!h) return;
    if (kind === "hearts" && st.phase === "pass") { setSel(h); setSay(`SUGGESTED: ${h.map(UP).join(", ")}.`); return; }
    const c = kind === "hearts" ? h : h.c;
    if (h.bid != null) { setHint({ bid: h.bid }); setSay(`SUGGESTED BID: ${h.bid === 0 ? "NIL" : h.bid}.`); return; }
    setHint({ c }); setSay(`SUGGESTED: ${UP(c)}.`);
  };

  usePad(root, { start: () => setPaused(p => !p), back: () => setSel([]), paused });
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !paused) { e.preventDefault(); setPaused(true); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [paused]);

  // scores
  const scoreLine = (p) => {
    if (kind === "hearts") {
      const now = st.taken[p].reduce((a, c) => a + HT.pointsOf(c), 0);
      return `${st.scores[p]}${st.phase === "play" && now ? ` (+${now})` : ""}`;
    }
    const b = st.bids[p];
    return b == null ? (st.phase === "bid" ? "BIDDING" : "") : `BID ${b === 0 ? "NIL" : b} // TOOK ${st.won[p]}`;
  };
  const over = st.phase === "over";
  const place = kind === "hearts" ? [...st.scores].sort((a, b) => a - b).indexOf(st.scores[0]) : null;
  const summary = !over ? "" : kind === "hearts"
    ? `YOU FINISHED ${ord(place)} WITH ${st.scores[0]}. ${st.winners.map(p => names[p]).join(" AND ")} ${st.winners.length > 1 || st.winners[0] === 0 ? "WIN" : "WINS"} WITH ${Math.min(...st.scores)}. AN EXHIBITION: NOTHING CHANGES HANDS.`
    : `${st.winner === 0 ? `YOU AND ${names[2]} WIN` : `${names[1]} AND ${names[3]} WIN`}, ${Math.max(...st.scores)} TO ${Math.min(...st.scores)}. AN EXHIBITION: NOTHING CHANGES HANDS.`;

  const seat = (p) => {
    const pos = POS[p];
    const turn = !over && st.turn === p && (st.phase === "play" || st.phase === "bid") && !hold;
    if (p === 0) return (
      <div key="s" className={`ct-seat s${turn ? " turn" : ""}`}>
        <span className="ct-nm">YOU</span><span className="ct-sc">{kind === "hearts" ? `${scoreLine(0)} POINTS` : scoreLine(0)}</span>
      </div>
    );
    const f = table.seats[p - 1];
    return (
      <div key={pos} className={`ct-seat ${pos}${turn ? " turn" : ""}${kind === "spades" && p === 2 ? " mate" : ""}`}>
        <Head src={spriteOf(f.key)} name={f.name} px={width < 420 ? 2 : 3} />
        <span className="ct-nm">{f.name}</span>
        <span className="ct-sc">{scoreLine(p)}</span>
        <span className="ct-backs" aria-label={`${handCount(p)} cards`}>{Array.from({ length: Math.min(handCount(p), 6) }, (_, i) => <PixelCard key={i} code={null} scale={0.75} back="dept" />)}</span>
        {emotes[p] && <span className="ct-emote" role="note">{emotes[p]}</span>}
      </div>
    );
  };

  const midMsg = hold ? `${names[hold.w]} ${hold.w === 0 ? "TAKE" : "TAKES"} IT` : passing ? `CHOOSE THREE TO PASS ${st.dir.toUpperCase()}` : st.phase === "bid" && !myTurn ? "BIDDING…" : null;

  return (
    <div className="cr" ref={root} onKeyDown={(e) => arrowKeys(e, root.current)}>
      {kind === "spades" && (
        <div className="ch-bar" aria-label="Score">
          <span className="k">YOU + {names[2]}:</span> <b>{st.scores[0]}</b> <span className="k">({st.bags[0]} BAGS)</span>
          <span className="k">//</span>
          <span className="k">{names[1]} + {names[3]}:</span> <b>{st.scores[1]}</b> <span className="k">({st.bags[1]} BAGS)</span>
          <span className="k">// TO {st.cfg.target}</span>
        </div>
      )}
      {kind === "hearts" && <div className="ch-bar"><span className="k">HAND {st.hand + 1} // GAME TO {st.cfg.target} // FEWEST POINTS WINS{st.broken ? " // HEARTS BROKEN" : ""}</span></div>}
      <div className={`ct cr-felt felt-${at}`}>
        {seat(2)}{seat(1)}
        <div className="ct-trick" aria-label="The trick">
          {trick.map(({ p, c }) => (
            <div key={`${p}-${c}`} className={`ct-slot ${POS[p]}${hold && hold.w === p ? " win" : ""}`}>
              <PixelCard code={codeOf(c)} scale={cardScale} four={four} />
            </div>
          ))}
          {midMsg && <div className="ct-mid"><span className="msg">{midMsg}</span></div>}
        </div>
        {seat(3)}{seat(0)}
      </div>

      {/* your hand */}
      <div className="ch" ref={handRef} role="group" aria-label={passing ? "Your hand: choose three cards to pass" : "Your hand"} style={{ "--ov": `${ov}px` }}>
        {st.hands[0].map((c, i) => {
          const can = passing || legal.includes(c);
          return (
            <PixelCard key={c} code={codeOf(c)} scale={handScale} four={four} onClick={() => tapCard(c)} data-pad={i === 0 ? "first" : "1"}
              selected={sel.includes(c) || hint?.c === c} dim={!passing && myTurn && st.phase === "play" && !can} aria-disabled={!can || undefined}
              label={`${UP(c).toLowerCase().replace(/^./, m => m.toUpperCase())}${!passing && myTurn && st.phase === "play" && !can ? ", cannot be played now" : ""}`} />
          );
        })}
      </div>
      <div className="ch-bar">
        {passing && <Button variant="primary" data-pad="1" onClick={() => act({ t: "pass", cards: sel })} disabled={sel.length !== 3}>PASS {sel.length}/3 {st.dir.toUpperCase()}</Button>}
        {myTurn && st.phase === "play" && <span className="k">YOUR TURN: TAP A CARD{st.trick.length ? "" : " TO LEAD"}.</span>}
        {!myTurn && (st.phase === "play" || st.phase === "bid") && !hold && <span className="k">{names[st.turn]} IS THINKING.</span>}
        {(passing || (myTurn && (st.phase === "play" || bidding))) && <Button variant="secondary" data-pad="1" onClick={showHint}>HINT</Button>}
        <Button variant="back" data-pad="1" onClick={() => setPaused(true)}>PAUSE</Button>
      </div>
      {bidding && (
        <div>
          <div className="ch-bar"><span className="k">YOUR BID. THE TRICKS YOU WILL TAKE{st.bids[2] != null ? `. ${names[2]} BID ${st.bids[2] === 0 ? "NIL" : st.bids[2]}` : ""}.</span></div>
          <div className="cb" role="group" aria-label="Your bid">
            {SPD.legalBids(st, 0).map(b => (
              <button key={b} type="button" data-pad="1" className={`${b === 0 ? "nil" : ""}${hint?.bid === b ? " sug" : ""}`} onClick={() => act({ t: "bid", n: b })} aria-label={b === 0 ? "Bid nil: take no tricks" : `Bid ${b}`}>{b === 0 ? "NIL" : b}</button>
            ))}
          </div>
        </div>
      )}
      {st.phase === "scored" && !hold && (
        <div className="ch-bar">
          <Button variant="primary" data-pad="first" onClick={() => act({ t: "next" })}>DEAL THE NEXT HAND</Button>
        </div>
      )}
      {(st.phase === "scored" || over) && <Scores kind={kind} st={st} names={names} />}
      {err && <div className="cr-err" role="status">{err}</div>}
      <div className="sr-only" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{say}</div>
      <ol className="cl" aria-label="The table, as it happened">{lines.slice(-14).map((l, i) => <li key={i} className={l.k || ""}>{l.t}</li>)}</ol>

      {over && !menuClosed && (
        <GameMenu kind="end" title={kind === "hearts" ? (st.winners.includes(0) ? "YOU WIN THE GAME." : "GAME FILED.") : (st.winner === 0 ? "YOUR PARTNERSHIP WINS." : "GAME FILED.")} summary={summary}
          onBack={() => setMenuClosed(true)}
          options={{ again: () => newGame(game.round + 1), rematch: { label: "A DIFFERENT TABLE", onSelect: onNewTable }, play: true, city: { label: "BACK TO THE ROOM", href: backHref } }} />
      )}
      {paused && !over && (
        <GameMenu kind="pause" title="PAUSED." onBack={() => setPaused(false)}
          options={{ resume: () => setPaused(false), restart: { label: "NEW GAME, SAME TABLE", onSelect: () => newGame(game.round + 1) }, controls: <Legend kind={kind} />, quit: { label: "LEAVE THE TABLE", onSelect: onLeave } }} />
      )}
    </div>
  );
}

function Scores({ kind, st, names }) {
  if (kind === "hearts") return (
    <table className="cs"><thead><tr><th>SEAT</th><th>THIS HAND</th><th>TOTAL</th></tr></thead>
      <tbody>{[0, 1, 2, 3].map(p => <tr key={p} className={p === 0 ? "me" : undefined}><td>{names[p]}</td><td>{st.handPts?.[p] ?? 0}</td><td>{st.scores[p]}</td></tr>)}</tbody></table>
  );
  return (
    <table className="cs"><thead><tr><th>PARTNERSHIP</th><th>BID</th><th>TOOK</th><th>HAND</th><th>TOTAL</th><th>BAGS</th></tr></thead>
      <tbody>{(st.rows || []).map(r => <tr key={r.team} className={r.team === 0 ? "me" : undefined}><td>{r.team === 0 ? `YOU + ${names[2]}` : `${names[1]} + ${names[3]}`}</td><td>{r.bid}{r.nil.length ? " +NIL" : ""}</td><td>{r.took}</td><td>{r.pts + (r.penalty || 0)}</td><td>{st.scores[r.team]}</td><td>{st.bags[r.team]}</td></tr>)}</tbody></table>
  );
}

export function Legend({ kind }) {
  return (
    <div className="cr-fine" style={{ color: "var(--fg)" }}>
      <p>TAP A CARD TO PLAY IT. {kind === "hearts" ? "TO PASS, TAP THREE, THEN PASS." : "BID WITH THE NUMBERS: NIL MEANS YOU TAKE NO TRICKS."}</p>
      <p>KEYS: ARROWS MOVE BETWEEN CARDS AND BUTTONS, ENTER PLAYS, ESC PAUSES.</p>
      <p>PAD: D-PAD MOVES, A PLAYS, B CLEARS, START PAUSES.</p>
      {kind === "hearts"
        ? <p>HEARTS: AVOID HEARTS (1 EACH) AND THE QUEEN OF SPADES (13). TAKE ALL 26 AND EVERYONE ELSE GETS THEM. FEWEST POINTS AT 100 WINS.</p>
        : <p>SPADES: SPADES ARE TRUMPS. MAKE YOUR PARTNERSHIP'S BID: 10 A TRICK, 1 PER BAG OVER; TEN BAGS COST 100; FALL SHORT AND LOSE 10 A TRICK.</p>}
    </div>
  );
}
