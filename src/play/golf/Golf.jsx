import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { CLOTH } from "../../avatar.js";
import { readPad } from "../../city/gamepad.js";
import { COURSE, PAR } from "./course.js";
import { newRound, step, logPush, cardOf, toParText, botBits, BTN, VERSION, HZ } from "./sim.js";
import { draw, W, H } from "./render.js";
import { golfers, golferBySlug } from "./roster.js";
import * as sfx from "./audio.js";
import "./golf.css";

// #golf[?vs=<slug>]: THE DEPARTMENT LINKS (docs/CITY_SPEC.md "PLAYABLE SPORTS / Golf"). The course
// APPLICATION 001 proposed for LOT 0x6F07, which THE ASSEMBLY declined in favour of the farm, played
// anyway, NES-style: stroke play alone or a match against a golfer on file. Exhibitions only: no
// result reaches any standings. A round is kept in this browser as {seed, version, inputLog, result}
// (sim.js replays it tick for tick) for the day a server checks it.

const KEEP = "hvi-golf-rounds";
const MEMORY = [];   // this tab's rounds, kept even when storage is not
const loadRounds = () => { try { const r = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(r) ? r : []; } catch { return MEMORY.slice(); } };
function saveRound(rec) {
  MEMORY.unshift(rec);
  try { localStorage.setItem(KEEP, JSON.stringify([rec, ...loadRounds()].slice(0, 8))); } catch { /* private window: the tab keeps it */ }
}
const parseRoute = (route) => { const q = new URLSearchParams(String(route || "").split("?")[1] || ""); return { vs: q.get("vs") || null }; };

function me() {
  const id = readCaseId(), last = readLastResult();
  const av = last && last.caseId === id ? last.avatar : null;
  return {
    name: id ? `SUBJECT ${id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}` : "SUBJECT",
    color: { shirt: CLOTH[av?.top_color] || "#3cbcfc", pants: CLOTH[av?.bottom_color] || "#7c7c7c" },
  };
}

function Sprite({ g }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className="gf-sprite" aria-hidden="true"><span>{g.name.slice(0, 2)}</span></span>;
  return <span className="gf-sprite" aria-hidden="true" style={{ backgroundImage: `url(${g.sprite})` }}><img src={g.sprite} alt="" onError={() => setBad(true)} style={{ display: "none" }} /></span>;
}

export default function Golf({ route }) {
  const { vs } = useMemo(() => parseRoute(route), [route]);
  const [count, setCount] = useState(18);
  const [start, setStart] = useState(0);
  const [game, setGame] = useState(null);
  const [rounds, setRounds] = useState(loadRounds);
  const [muted, setMuted] = useState(sfx.isMuted());
  const field = useMemo(() => golfers(), []);
  const pre = vs ? golferBySlug(vs) : null;

  // demo: the Department's caddie plays the SUBJECT's side with perfect timing (an attract mode)
  const begin = (g, demo = false) => {
    sfx.unlock();
    const seed = (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0;
    const p = me();
    setGame({ key: seed, cfg: { seed, mode: g ? "match" : "stroke", start, count, player: demo ? { name: "THE CADDIE", color: { shirt: "#7c7c7c", pants: "#000000" } } : p, cpu: g ? { slug: g.slug, name: g.name, rating: g.rating, color: { shirt: g.shirt, pants: g.pants } } : null }, demo });
  };
  const done = (rec) => { saveRound(rec); setRounds(loadRounds()); };
  const toggleMute = () => { sfx.setMuted(!muted); setMuted(!muted); };

  return (
    <div className="gf">
      <ScreenHead title="THE DEPARTMENT LINKS" meta="EXHIBITION // COUNTS IN NO STANDINGS. THE DEPARTMENT COUNTS IT ANYWAY." />
      {game ? (
        <>
          <Play key={game.key} cfg={game.cfg} demo={game.demo} onDone={game.demo ? () => {} : done} muted={muted} />
          <ButtonRow split stackOnMobile>
            <Button variant="back" onClick={() => setGame(null)}>Leave the course</Button>
            <Button variant="secondary" onClick={toggleMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</Button>
          </ButtonRow>
        </>
      ) : (
        <>
          <Frame box title="LOT 0x6F07 // APPLICATION 001" meta="DENIED">
            <p className="gf-p">APPLICATION 001 PROPOSED AN 18-HOLE GOLF COURSE FOR LOT 0x6F07. THE ASSEMBLY VOTED FOR THE FARM. THE DEPARTMENT KEPT THE DRAWINGS: EIGHTEEN HOLES, PAR {PAR.front + PAR.back}, {COURSE.reduce((a, h) => a + h.yards, 0).toLocaleString("en-US")} YARDS. YOU MAY PLAY THEM HERE, WHERE THEY DO NOT EXIST.</p>
            <p className="gf-p dim">EXHIBITION ONLY. NO STANDINGS, NO CUP POINTS, NO PRIZES. THE CARD STAYS IN THIS BROWSER.</p>
            <div className="gf-opts" role="group" aria-label="Holes">
              {[[0, 18, "18 HOLES"], [0, 9, "FRONT NINE"], [9, 9, "BACK NINE"]].map(([s, c, l]) => (
                <button key={l} type="button" className="gf-opt" aria-pressed={start === s && count === c} onClick={() => { setStart(s); setCount(c); }}>{l}</button>
              ))}
            </div>
            <ButtonRow>
              <Button variant="primary" onClick={() => begin(null)}>STROKE PLAY, ALONE</Button>
              <Button variant="secondary" onClick={() => begin(null, true)}>WATCH THE CADDIE PLAY</Button>
              {pre && <Button variant="primary" onClick={() => begin(pre)}>{`MATCH V ${pre.name}`}</Button>}
            </ButtonRow>
          </Frame>
          <Frame box title="A MATCH AGAINST A FIGURE" meta={`${field.length} ON FILE`}>
            <p className="gf-p">MATCH PLAY: HOLE BY HOLE, LOWER SCORE TAKES THE HOLE. STRENGTH FOLLOWS THE FIGURE'S GOLF RATING. THE FIGURES PLAY IN SILENCE.</p>
            <ul className="gf-opps">
              {field.map(g => (
                <li key={g.slug}>
                  <button type="button" className="gf-opp" onClick={() => begin(g)}>
                    <Sprite g={g} />
                    <span className="nm"><b>{g.name}</b><span className="why">{g.why}</span></span>
                    <span className="rt">{g.rating}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Frame>
          <Rounds rounds={rounds} />
        </>
      )}
      <Controls />
    </div>
  );
}

function Controls() {
  return (
    <Frame title="CONTROLS" meta="KEYS // PAD // TOUCH">
      <dl className="gf-keys">
        <dt>AIM</dt><dd>LEFT / RIGHT (ARROWS, D-PAD, STICK). HOLD TO AIM FASTER.</dd>
        <dt>SWING</dt><dd>SPACE OR Z (PAD: A / CROSS). PRESS TO START, PRESS FOR POWER, PRESS ON THE RED LINE. EARLY HOOKS, LATE SLICES.</dd>
        <dt>CLUB</dt><dd>X OR DOWN: SHORTER. UP: LONGER. (PAD: B / CIRCLE, BUMPERS.)</dd>
        <dt>PAUSE</dt><dd>ENTER (PAD: START).</dd>
        <dt>THE GREEN</dt><dd>THE ARROWS ON THE GREEN POINT DOWNHILL. DARKER IS STEEPER. THE PUTTER'S METER IS SLOWER.</dd>
      </dl>
    </Frame>
  );
}

function Rounds({ rounds }) {
  if (!rounds.length) return null;
  return (
    <Frame title="YOUR ROUNDS" meta="THIS BROWSER ONLY">
      <ul className="gf-rounds">
        {rounds.map((r, i) => (
          <li key={i}>{new Date(r.at).toISOString().slice(0, 16).replace("T", " ")} // {r.result.holes.length} HOLES // {r.result.mode === "match" ? `V ${r.cfg.cpu?.name}: ` : ""}{r.result.total[0]} ({toParText(r.result.toPar[0])}){r.result.mode === "match" ? ` // ${r.result.winner === 0 ? "WON" : r.result.winner === 1 ? "LOST" : "HALVED"} ${r.result.won[0]}-${r.result.won[1]}` : ""}</li>
        ))}
      </ul>
    </Frame>
  );
}

// ---- the game: canvas, the fixed-step loop, input ------------------------------------------------------
const KEYMAP = { ArrowLeft: BTN.L, ArrowRight: BTN.R, ArrowUp: BTN.U, ArrowDown: BTN.D, " ": BTN.A, z: BTN.A, Z: BTN.A, x: BTN.B, X: BTN.B };
const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };

function Play({ cfg, demo, onDone, muted }) {
  const canvas = useRef(null), wrap = useRef(null);
  const touch = useRef(0);
  const latch = useRef(0);   // a press shorter than a tick still counts: held for at least one tick
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [card, setCard] = useState(null);
  const [scale, setScale] = useState({ css: W, k: 1 });
  const [pad, setPad] = useState(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };

  // integer scaling in device pixels: the 256x224 frame is drawn at k device pixels per pixel
  useEffect(() => {
    const fit = () => {
      const w = wrap.current?.clientWidth || W, dpr = window.devicePixelRatio || 1;
      const k = Math.max(1, Math.min(6, Math.floor((Math.min(w, 900) * dpr) / W)));
      setScale({ css: (W * k) / dpr, k });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const st = newRound(cfg), log = [];
    const keys = new Set();
    let raf = 0, last = performance.now(), acc = 0, frame = 0, prevStart = false, phase = st.phase, hi = st.hi, recorded = false;
    const ctx = canvas.current.getContext("2d");
    const kd = (e) => {
      if (typing(e)) return;
      if (e.key === "Enter" || e.key === "Escape") { if (!e.repeat) togglePause(); e.preventDefault(); return; }
      if (KEYMAP[e.key] != null) { if (!e.repeat) latch.current |= KEYMAP[e.key]; keys.add(e.key); e.preventDefault(); sfx.unlock(); }
    };
    const ku = (e) => { if (KEYMAP[e.key] != null) keys.delete(e.key); };
    const blur = () => keys.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    let padFamily = null;
    const input = () => {
      let b = touch.current | latch.current;
      latch.current = 0;
      for (const k of keys) b |= KEYMAP[k];
      const p = readPad();
      if (p.connected) {
        if (padFamily !== p.family) { padFamily = p.family; setPad(p.family); }
        if (p.x < -0.5) b |= BTN.L;
        if (p.x > 0.5) b |= BTN.R;
        if (p.y < -0.7) b |= BTN.U;
        if (p.y > 0.7) b |= BTN.D;
        if (p.held.act) b |= BTN.A;
        if (p.held.back || p.held.turnR) b |= BTN.B;
        if (p.held.turnL) b |= BTN.U;
        if (p.held.start && !prevStart) togglePause();
        prevStart = p.held.start;
      } else if (padFamily) { padFamily = null; setPad(null); }
      return b;
    };
    const loop = (now) => {
      acc = Math.min(acc + (now - last) / 1000, 5 / HZ);
      last = now;
      while (acc >= 1 / HZ) {
        acc -= 1 / HZ;
        const b = demo ? (input(), botBits(st)) : input();
        if (pausedRef.current || st.phase === "done") continue;
        logPush(log, b);
        step(st, b);
        for (const e of st.ev) sfx.play(e);
        st.ev.length = 0;
      }
      if (st.phase !== phase || st.hi !== hi) {
        phase = st.phase; hi = st.hi;
        if (phase === "holeEnd" || phase === "done" || phase === "intro") setCard(cardOf(st));
        if (phase === "done" && !recorded) {
          recorded = true;
          doneRef.current({ v: VERSION, seed: st.cfg.seed, cfg: st.cfg, inputLog: log.slice(), result: st.result, at: Date.now() });
        }
      }
      draw(ctx, st, frame++, pausedRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setCard(cardOf(st));
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); };
  }, [cfg]);

  const hold = (bit) => ({
    onPointerDown: (e) => { e.preventDefault(); sfx.unlock(); touch.current |= bit; latch.current |= bit; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browser */ } },
    onPointerUp: () => { touch.current &= ~bit; },
    onPointerCancel: () => { touch.current &= ~bit; },
    onContextMenu: (e) => e.preventDefault(),
  });

  return (
    <div className="gf-play" ref={wrap}>
      <div className="gf-stage">
        <canvas ref={canvas} width={W} height={H} style={{ width: scale.css, height: (scale.css * H) / W }}
          aria-label="The Department Links: the golfer and swing meter on the left, the hole from above on the right." role="img" />
      </div>
      <div className="gf-status" aria-live="polite">{pad ? `CONTROLLER: ${pad.toUpperCase()}` : "KEYS: ARROWS AIM // SPACE SWINGS // X CLUB // ENTER PAUSES"}{muted ? " // MUTED" : ""}</div>
      <div className="gf-touch" aria-label="Touch controls">
        <button type="button" className="gf-tb" aria-label="Aim left" {...hold(BTN.L)}>&#9664;</button>
        <button type="button" className="gf-tb" aria-label="Aim right" {...hold(BTN.R)}>&#9654;</button>
        <button type="button" className="gf-tb" aria-label="Next club" {...hold(BTN.B)}>CLUB</button>
        <button type="button" className="gf-tb" aria-label={paused ? "Resume" : "Pause"} onClick={togglePause}>{paused ? "GO" : "II"}</button>
        <button type="button" className="gf-tb swing" aria-label="Swing" {...hold(BTN.A)}>SWING</button>
      </div>
      {card && <Card card={card} cfg={cfg} />}
    </div>
  );
}

function Card({ card, cfg }) {
  const names = [cfg.player?.name || "SUBJECT", ...(cfg.cpu ? [cfg.cpu.name] : [])];
  const nines = [card.rows.slice(0, 9), card.rows.slice(9)].filter(n => n.length);
  return (
    <Frame title="THE CARD" meta={card.played ? `THRU ${card.played} // ${names.map((n, i) => `${n.split(" ").pop()} ${toParText(card.toPar[i])}`).join(" // ")}` : "NOTHING FILED YET"}>
      <div className="gf-card-wrap">
        {nines.map((rows, k) => (
          <table key={k} className="gf-card">
            <thead><tr><th scope="col">HOLE</th>{rows.map(r => <th key={r.n} scope="col">{r.n}</th>)}<th scope="col">{k ? "IN" : "OUT"}</th></tr></thead>
            <tbody>
              <tr><th scope="row">YDS</th>{rows.map(r => <td key={r.n}>{r.yards}</td>)}<td>{rows.reduce((a, r) => a + r.yards, 0)}</td></tr>
              <tr><th scope="row">PAR</th>{rows.map(r => <td key={r.n}>{r.par}</td>)}<td>{rows.reduce((a, r) => a + r.par, 0)}</td></tr>
              {names.map((n, i) => (
                <tr key={n}><th scope="row">{n.split(" ").pop()}</th>{rows.map(r => {
                  const s = r.s[i], d = s == null ? 0 : s - r.par;
                  return <td key={r.n} className={s == null ? "" : d < 0 ? "u" : d > 0 ? "o" : ""}>{s ?? "-"}</td>;
                })}<td>{rows.every(r => r.s[i] == null) ? "-" : rows.reduce((a, r) => a + (r.s[i] ?? 0), 0)}</td></tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {cfg.cpu && card.played > 0 && <p className="gf-p dim">MATCH: {card.won[0] === card.won[1] ? "ALL SQUARE" : `${names[card.won[0] > card.won[1] ? 0 : 1]} ${Math.abs(card.won[0] - card.won[1])} UP`} ({card.won[0]}-{card.won[1]}, {card.halved} HALVED)</p>}
    </Frame>
  );
}
