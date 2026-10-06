import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow } from "../../ui/index.js";
import { readCaseId } from "../../caseFile.jsx";
import { readPad, deadzone, GLYPHS } from "../../city/gamepad.js";
import GameMenu from "../GameMenu.jsx";
import { newGame, step, act, replay, resultOf, Logger, clone, VERSION, BTN, WEIGHTS, HEAD_Y, ARROWS_Y, LANE_HW, R_BALL } from "./sim.js";
import { frames as framesOf, maxPossible, position } from "./score.js";
import { OPPONENTS, OPP_BY_KEY, actFor } from "./roster.js";
import { draw, drawHud, makeView, follow, laneXAt, toScreen, W, H } from "./render.js";
import { liveFlick, readFlick, throwOf, createStickSwing } from "./gesture.js";
import { machineClock, cosmicHour, shapeOf, keepResult, readResults, resultLine } from "./results.js";
import * as SFX from "./audio.js";
import CSS from "./bowling.css?inline";
import "../pages.css";

// #bowling[?vs=<key>][&lane=<n>]: THE LANES (docs/CITY_SPEC.md "THE LANES"): ten-pin bowling, exhibition
// only. Nothing here reaches a league or a file: a finished game is re-run from its input log, and a
// game that reproduces is kept in this browser (results.js) for the sports page to read.

function injectStyles() {
  let el = document.getElementById("bw-styles");
  if (!el) { el = document.createElement("style"); el.id = "bw-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const lane = Math.max(1, Math.min(24, Number(q.get("lane")) || 7));
  return { vs: OPP_BY_KEY.has(q.get("vs")) ? q.get("vs") : null, lane, from: q.get("from") };
};
const KEEP_SETUP = "hvi-bowling-setup";
const loadSetup = () => { try { const j = JSON.parse(localStorage.getItem(KEEP_SETUP) || "null"); return j && Array.isArray(j.players) ? j : null; } catch { return null; } };
const saveSetup = (s) => { try { localStorage.setItem(KEEP_SETUP, JSON.stringify(s)); } catch { /* the tab remembers */ } };
const BALL_COLORS = ["#2b5fbf", "#b8322a", "#2f8f4e", "#8a4fc0"];
const COSMIC_BALLS = ["#39ff6a", "#ff2fd0", "#30f0ff", "#ffe14a"];
const NOTICE = "EXHIBITION. THIS GAME DOES NOT COUNT TOWARDS ANY LEAGUE. YOUR AVERAGE IS NOT ON FILE. YET.";

function meName() { const id = readCaseId(); return id ? `SUBJECT ${id.slice(-4).toUpperCase()}` : "YOU"; }
function defaultSetup(vs) {
  return {
    players: [{ kind: "human", name: meName(), weight: 14, hand: 1, bumpers: false }, { kind: "cpu", key: vs || "john-goodman" }],
    fouls: true, easy: false, lights: "auto",
  };
}
function cfgOf(setup, seed) {
  const humans = setup.players.filter(p => p.kind === "human").length;
  let k = 0;
  return {
    v: VERSION, seed, fouls: setup.fouls, easy: setup.easy,
    players: setup.players.map((p) => {
      if (p.kind === "cpu") { const o = OPP_BY_KEY.get(p.key) || OPPONENTS[0]; return { kind: "cpu", key: o.key, name: o.name, rating: o.rating, weight: o.easy ? 8 : 15, hand: 1, bumpers: !!o.bumpers }; }
      k++;
      return { kind: "human", name: humans > 1 && !p.name ? `PLAYER ${k}` : (p.name || meName()), weight: p.weight, hand: p.hand, bumpers: p.bumpers };
    }),
  };
}

export default function Bowling({ route }) {
  useEffect(injectStyles, []);
  const r = useMemo(() => parseRoute(route), [route]);
  const [setup, setSetup] = useState(() => { const s = loadSetup() || defaultSetup(r.vs); if (r.vs) { const i = s.players.findIndex(p => p.kind === "cpu"); if (i >= 0) s.players[i] = { kind: "cpu", key: r.vs }; else if (s.players.length < 4) s.players.push({ kind: "cpu", key: r.vs }); } return s; });
  const [game, setGame] = useState(null);
  useEffect(() => saveSetup(setup), [setup]);
  const start = (s = setup) => { SFX.unlock(); setGame({ cfg: cfgOf(s, (Date.now() % 2147483647) >>> 0), id: Date.now() }); };
  if (!game) return <Setup setup={setup} setSetup={setSetup} onBowl={start} lane={r.lane} />;
  return <Lane key={game.id} cfg={game.cfg} setup={setup} lane={r.lane} onAgain={() => start()} onSettings={() => setGame(null)} />;
}

// ---- the desk: who bowls, which ball, the house rules ---------------------------------------------------
function Setup({ setup, setSetup, onBowl, lane }) {
  const [picking, setPicking] = useState(false);
  const ck = machineClock();
  const P = setup.players;
  const upd = (i, patch) => setSetup(s => ({ ...s, players: s.players.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const remove = (i) => setSetup(s => ({ ...s, players: s.players.filter((_, k) => k !== i) }));
  const add = (p) => setSetup(s => (s.players.length >= 4 ? s : { ...s, players: [...s.players, p] }));
  const last = readResults()[0];
  return (
    <div className="bw">
      <Frame box title="THE LANES" meta={`LANE ${lane} // EXHIBITION`}>
        <p className="bw-p">TEN PINS, TEN FRAMES, ONE TO FOUR BOWLERS IN TURN. THE HOUSE SUPPLIES THE SHOES. THE SHOES ARE LOGGED.</p>
        <h2 className="bw-h">BOWLERS</h2>
        <ol className="bw-players">
          {P.map((p, i) => {
            const o = p.kind === "cpu" ? OPP_BY_KEY.get(p.key) : null;
            return (
              <li key={i} className="bw-player">
                <div className="bw-who">
                  <b style={{ color: BALL_COLORS[i] }}>{i + 1}.</b>
                  {o ? <span><b>{o.name}</b> <span className="bw-rt">RATING {o.rating}</span><span className="bw-why">{o.why}</span></span>
                    : <input className="bw-name" aria-label={`Bowler ${i + 1}'s name`} maxLength={18} value={p.name || ""} placeholder={i === 0 ? meName() : `PLAYER ${i + 1}`} onChange={(e) => upd(i, { name: e.target.value.toUpperCase() })} />}
                </div>
                {!o && (
                  <div className="bw-opts">
                    <span className="bw-lab">BALL</span>
                    {WEIGHTS.map(w => <button type="button" key={w} className={`bw-chip${p.weight === w ? " on" : ""}`} aria-pressed={p.weight === w} onClick={() => upd(i, { weight: w })}>{w} LB</button>)}
                    <span className="bw-lab">HAND</span>
                    <button type="button" className={`bw-chip${p.hand !== -1 ? " on" : ""}`} aria-pressed={p.hand !== -1} onClick={() => upd(i, { hand: 1 })}>RIGHT</button>
                    <button type="button" className={`bw-chip${p.hand === -1 ? " on" : ""}`} aria-pressed={p.hand === -1} onClick={() => upd(i, { hand: -1 })}>LEFT</button>
                    <button type="button" className={`bw-chip${p.bumpers ? " on" : ""}`} aria-pressed={!!p.bumpers} onClick={() => upd(i, { bumpers: !p.bumpers })}>BUMPERS {p.bumpers ? "UP" : "DOWN"}</button>
                  </div>
                )}
                {P.length > 1 && <button type="button" className="bw-x" onClick={() => remove(i)} aria-label={`Remove bowler ${i + 1}`}>REMOVE</button>}
              </li>
            );
          })}
        </ol>
        {P.length < 4 && (
          <ButtonRow>
            <Button onClick={() => add({ kind: "human", name: "", weight: 12, hand: 1, bumpers: false })}>Add a bowler (hot seat)</Button>
            <Button onClick={() => setPicking(v => !v)}>{picking ? "Close the list" : "Add a figure"}</Button>
          </ButtonRow>
        )}
        {picking && (
          <ul className="bw-opps">
            {OPPONENTS.map(o => (
              <li key={o.key}><button type="button" className="bw-opp" onClick={() => { add({ kind: "cpu", key: o.key }); setPicking(false); }}>
                <span className="nm">{o.name}<span className="tag">{o.why}</span></span><span className="rt">{o.rating}</span>
              </button></li>
            ))}
          </ul>
        )}
        <h2 className="bw-h">THE HOUSE</h2>
        <div className="bw-opts">
          <button type="button" className={`bw-chip${setup.fouls ? " on" : ""}`} aria-pressed={setup.fouls} onClick={() => setSetup(s => ({ ...s, fouls: !s.fouls }))}>FOUL LINE {setup.fouls ? "ON" : "OFF"}</button>
          <button type="button" className={`bw-chip${setup.easy ? " on" : ""}`} aria-pressed={setup.easy} onClick={() => setSetup(s => ({ ...s, easy: !s.easy }))}>EASY {setup.easy ? "ON" : "OFF"}</button>
          <span className="bw-lab">LIGHTS</span>
          {[["auto", "BY THE CLOCK"], ["cosmic", "COSMIC"], ["house", "HOUSE"]].map(([k, l]) => <button type="button" key={k} className={`bw-chip${setup.lights === k ? " on" : ""}`} aria-pressed={setup.lights === k} onClick={() => setSetup(s => ({ ...s, lights: k }))}>{l}</button>)}
        </div>
        <p className="bw-small">MACHINE TIME {String(Math.floor(ck.hour)).padStart(2, "0")}:{String(Math.floor((ck.hour % 1) * 60)).padStart(2, "0")}, DAY {ck.day}. COSMIC BOWLING RUNS 21:00 TO 03:00. EASY: SLOWER METERS, A STRAIGHTER BALL, THE LINE DRAWN FOR YOU.</p>
        <ButtonRow>
          <Button variant="primary" onClick={() => onBowl()}>Bowl</Button>
          <Button variant="back" href="#play">Back to play</Button>
        </ButtonRow>
        {last && <p className="bw-small">LAST GAME ON THIS BROWSER: {resultLine(last)}. {last.verified ? "RE-RUN AND CONFIRMED." : ""}</p>}
        <Legend />
        <p className="bw-notice">{NOTICE}</p>
      </Frame>
    </div>
  );
}

function Legend({ pad }) {
  const g = GLYPHS[pad] || GLYPHS.generic;
  return (
    <details className="bw-legend">
      <summary>HOW TO BOWL</summary>
      <dl className="bw-keys">
        <dt>MOUSE / TOUCH</dt><dd>DRAG ON THE APPROACH (THE FLOOR AT THE BOTTOM) TO STAND LEFT OR RIGHT. DRAG THE ARROW'S HEAD TO AIM. THEN, ANYWHERE ON THE LANE: PULL BACK, AND FLICK FORWARD. FASTER IS FASTER. CURL THE END OF THE FLICK LEFT TO HOOK IT (RIGHT FOR A LEFT HAND). FAR TOO HARD AND YOU CROSS THE LINE.</dd>
        <dt>KEYBOARD</dt><dd>&larr; &rarr; STAND. A / D AIM. SPACE THREE TIMES: POWER (NOT INTO THE RED), ACCURACY (ON THE GREEN), HOOK. BACKSPACE CANCELS. ESC PAUSES.</dd>
        <dt>CONTROLLER</dt><dd>LEFT STICK STANDS. {g.turnL} / {g.turnR} AIM. RIGHT STICK: PULL BACK, PUSH FORWARD (FASTER PUSH, FASTER BALL; LEAN IT LEFT AS IT GOES THROUGH TO HOOK). {g.act}: THE THREE-PRESS METER INSTEAD. {g.start}: PAUSE.</dd>
        <dt>THE LANE</dt><dd>FRESH OIL IN THE HEADS, DRY ON THE BACKEND: A HOOK SKIDS, THEN BITES. THE POCKET IS THE 1-3 (THE 1-2 LEFT-HANDED). HEAD-ON LEAVES SPLITS.</dd>
      </dl>
    </details>
  );
}

// ---- the overhead monitor --------------------------------------------------------------------------------
function Monitor({ st, cosmic }) {
  return (
    <div className={`bw-monitor${cosmic ? " cosmic" : ""}`} role="table" aria-label="Scoresheet">
      <div className="bw-mrow head" role="row">
        <span className="nm" role="columnheader">BOWLER</span>
        {Array.from({ length: 10 }, (_, f) => <span key={f} className={`fr${f === 9 ? " ten" : ""}`} role="columnheader">{f + 1}</span>)}
        <span className="tot" role="columnheader">TOTAL</span><span className="mx" role="columnheader">MAX</span>
      </div>
      {st.players.map((p, i) => {
        const F = framesOf(p.balls);
        const up = i === st.cur && !st.over;
        return (
          <div key={i} className={`bw-mrow${up ? " up" : ""}`} role="row">
            <span className="nm" role="rowheader"><i style={{ background: (cosmic ? COSMIC_BALLS : BALL_COLORS)[i] }} />{p.name}</span>
            {F.frames.map((fr, f) => (
              <span key={f} className={`fr${f === 9 ? " ten" : ""}${up && f === st.frame ? " now" : ""}`} role="cell" aria-label={`Frame ${f + 1}: ${fr.marks.join(" ") || "not bowled"}${fr.score != null ? `, ${fr.score}` : ""}`}>
                <span className="mk">{Array.from({ length: f === 9 ? 3 : 2 }, (_, k) => {
                  const m = f < 9 && fr.marks[0] === "X" ? (k === 1 ? "X" : "") : fr.marks[k] || "";
                  return <b key={k} className={fr.split && k === 0 && m && m !== "X" ? "split" : ""}>{m}</b>;
                })}</span>
                <span className="sc">{fr.score ?? ""}</span>
              </span>
            ))}
            <span className="tot" role="cell">{F.total}</span>
            <span className="mx" role="cell">{maxPossible(p.balls)}</span>
          </div>
        );
      })}
    </div>
  );
}

const CALLS = {
  strike: ["STRIKE", "ALL TEN. THE PINSETTER HAS BEEN NOTIFIED."],
  double: ["DOUBLE", "TWO IN A ROW. THE DEPARTMENT IS WATCHING THE TREND."],
  turkey: ["TURKEY", "THREE IN A ROW. A BIRD HAS BEEN ENTERED ON YOUR FILE."],
  spare: ["SPARE", "TIDIED UP. COMPLIANCE NOTED."],
  split: ["SPLIT", "A GAP HAS OPENED. THE DEPARTMENT DOES NOT CLOSE GAPS FOR YOU."],
  sevenTen: ["7-10", "THE 7-10. FILED UNDER IMPROBABLE OUTCOMES."],
  gutter: ["GUTTER", "THE BALL HAS LEFT THE PROGRAMME."],
  foul: ["FOUL", "OVER THE LINE. THE PINS HAVE BEEN PUT BACK. YOUR SCORE HAS NOT."],
  miss: ["MISS", "NOTHING. THE PINS ARE UNMOVED. SO IS THE DEPARTMENT."],
};

// ---- a game on the lane ------------------------------------------------------------------------------------
function Lane({ cfg, setup, lane, onAgain, onSettings }) {
  const canvasRef = useRef(null), wrapRef = useRef(null);
  const stRef = useRef(null), logRef = useRef(null), viewRef = useRef(makeView());
  const queue = useRef([]), keys = useRef(0), taps = useRef(0), pend = useRef(null);
  const flickRef = useRef({ mode: null, S: [], live: null });
  const replayRef = useRef(null), snapRef = useRef(null);
  const [hud, setHud] = useState({ n: 0 });
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(null);
  const [muted, setMutedS] = useState(SFX.isMuted());
  const [scale, setScale] = useState(1);
  const [pad, setPad] = useState(null);
  const [call, setCall] = useState(null);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const callRef = useRef(null); callRef.current = call;
  const ck = machineClock();
  const cosmic = setup.lights === "cosmic" || (setup.lights === "auto" && cosmicHour(ck.hour));
  const cosmicRef = useRef(cosmic);

  if (!stRef.current) { stRef.current = newGame(cfg); logRef.current = new Logger(); }

  // the sheet and the lane in view as the game starts
  useEffect(() => { try { const el = wrapRef.current?.closest(".bw"); if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 64) }); } catch { /* old browser */ } }, []);
  // fit the picture to the page (whole width on a phone, at most 78% of the window's height)
  useEffect(() => {
    const fit = () => { const w = wrapRef.current?.clientWidth || W; const s = Math.min(w / W, (window.innerHeight * 0.74) / H, 1.5); setScale(Math.max(0.5, s)); };
    fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, []);

  const finish = useCallback((st) => {
    const rec = { cfg, inputLog: logRef.current.log, result: resultOf(st) };
    let verified = false;
    try { verified = JSON.stringify(replay(JSON.parse(JSON.stringify(rec)))) === JSON.stringify(rec.result); } catch { verified = false; }
    const shape = shapeOf(rec, verified, { lane, cosmic: cosmicRef.current });
    if (verified && cfg.players.some(p => p.kind === "human")) keepResult(shape);
    SFX.verdict("over");
    setDone({ shape, verified });
  }, [cfg, lane]);

  const togglePause = useCallback(() => { if (!stRef.current.over) setPaused(p => !p); }, []);

  // the loop: a fixed 60Hz step, drawn every frame
  useEffect(() => {
    const c = canvasRef.current, ctx = c.getContext("2d");
    let raf, acc = 0, last = performance.now(), prevPad = null, streak = new Map();
    const swing = createStickSwing();
    let lastSet = "";
    const tick = () => {
      const st = stRef.current, L = logRef.current, p = st.players[st.cur];
      // the pad
      const pd = readPad();
      let mask = keys.current | taps.current;   // a tap shorter than a tick still counts once
      taps.current = 0;
      if (pd.connected) {
        if (pad !== pd.family) setPad(pd.family);
        if (pd.held.start && !prevPad?.start) togglePause();
        if (!pausedRef.current) {
          if (pd.x < -0.45) mask |= BTN.L; else if (pd.x > 0.45) mask |= BTN.R;
          if (pd.held.turnL) mask |= BTN.AL; if (pd.held.turnR) mask |= BTN.AR;
          if (pd.held.act) mask |= BTN.A; if (pd.held.back) mask |= BTN.B;
          // the right stick's swing
          let rx = 0, ry = 0;
          try { const gp = Array.from(navigator.getGamepads?.() || []).find(g => g && g.connected !== false); if (gp) { const d = deadzone(gp.axes[2] || 0, gp.axes[3] || 0); rx = d.x; ry = d.y; } } catch { /* no pad */ }
          if (p.kind === "human" && st.phase === "aim") {
            const f = swing.feed({ x: rx, y: ry });
            flickRef.current.live = swing.stage() ? { stage: swing.stage(), pull: 60, power: 0.5 } : flickRef.current.mode ? flickRef.current.live : null;
            if (f) queue.current.push(throwOf(f, { x: p.posX, aim: p.aim, weight: p.weight, hand: p.hand, easy: st.easy }));
          } else swing.reset();
        }
      }
      prevPad = pd.connected ? pd.held : null;
      if (pausedRef.current) return;
      // the events since the last tick, then the tick: logged in the order they are applied
      if (pend.current && st.phase === "aim") { const e = pend.current; const k = `${e.x}|${e.a}`; if (k !== lastSet) { L.event(e); act(st, e); lastSet = k; } }
      pend.current = null;
      while (queue.current.length) { const e = queue.current.shift(); L.event(e); act(st, e); }
      L.tick(mask); step(st, mask);
      if (st.events.includes("release")) snapRef.current = { st: clone(st), view: { ...viewRef.current, trail: [] } };
      SFX.play(st.events);
      if (st.phase === "roll" && st.ball && !st.ball.gone) SFX.rollLevel(Math.min(1, Math.hypot(st.ball.vx, st.ball.vy) / 380), Math.min(1, st.ball.y / HEAD_Y));
      const ev = st.events.find(e => ["strike", "spare", "split", "foul", "miss", "count"].includes(e));
      if (ev) {
        const R = st.lastRoll, who = st.cur;
        let k = ev;
        if (ev === "strike") { const n = (streak.get(who) || 0) + 1; streak.set(who, n); k = n >= 3 ? "turkey" : n === 2 ? "double" : "strike"; } else streak.set(who, 0);
        if (ev === "split" && R.left.join("-") === "7-10") k = "sevenTen";
        if (ev === "miss" && st.ball?.gutter) k = "gutter";
        if (ev === "count" && R.ball > 0 && R.before.length === R.left.length) k = "miss";
        if (ev === "count" && st.ball?.gutter && R.n === 0) k = "gutter";
        const cpu = st.players[who].kind === "cpu" ? OPP_BY_KEY.get(st.players[who].key) : null;
        const tell = cpu ? actFor(cpu, k === "turkey" || k === "double" ? "strike" : k === "sevenTen" ? "split" : k, st.t) : null;
        const c0 = CALLS[k] || (ev === "count" ? [String(R.n), R.left.length ? `${R.left.length} STANDING: ${R.left.join("-")}` : ""] : null);
        if (c0) setCall({ head: c0[0], sub: c0[1], tell, t: st.t });
        SFX.stopRoll();
        SFX.verdict(k === "turkey" || k === "double" ? "strike" : k === "sevenTen" ? "split" : k, { turkey: k === "turkey", sevenTen: k === "sevenTen", split: R.before?.length < 10 && R.frame != null && ev === "spare" && st.players[who].balls.at(-2)?.split });
      }
      if (st.events.includes("over")) finish(st);
      if (st.phase === "aim" && st.phaseT === 1) { setCall(null); SFX.verdict("sweep"); }
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      acc += Math.min(100, now - last) * ((import.meta.env.DEV && window.__bowlFast) || 1); last = now;
      if (import.meta.env.DEV) window.__bowl = stRef.current;
      while (acc >= 1000 / 60) { acc -= 1000 / 60; tick(); if (replayRef.current) stepReplay(); }
      const show = replayRef.current ? replayRef.current : { st: stRef.current, view: viewRef.current };
      follow(show.view, show.st);
      const p = show.st.players[show.st.cur];
      draw(ctx, show.st, show.view, { cosmic: cosmicRef.current, time: now / 1000, easy: show.st.easy, ballColor: (i) => (cosmicRef.current ? COSMIC_BALLS : BALL_COLORS)[i], kitOf: (i) => { const pl = show.st.players[i]; return pl.kind === "cpu" ? OPP_BY_KEY.get(pl.key)?.kit : null; } });
      drawHud(ctx, show.st, { cosmic: cosmicRef.current, flick: !replayRef.current && p?.kind === "human" ? flickRef.current.live : null, call: replayRef.current ? "REPLAY" : callRef.current && show.st.phase === "result" ? callRef.current.head : null, sub: replayRef.current ? null : callRef.current?.sub });
      setHud(h => (h.n === show.st.t && h.ph === show.st.phase ? h : { n: show.st.t, ph: show.st.phase }));
    };
    const stepReplay = () => {
      const R = replayRef.current;
      step(R.st, 0);
      if (R.st.phase !== "roll") { R.hold = (R.hold || 0) + 1; if (R.hold > 50) replayRef.current = null; }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); SFX.stopRoll(); };
  }, [finish, togglePause]);

  // the keyboard
  useEffect(() => {
    const MAP = { ArrowLeft: BTN.L, ArrowRight: BTN.R, a: BTN.AL, A: BTN.AL, d: BTN.AR, D: BTN.AR, " ": BTN.A, Enter: BTN.A, Backspace: BTN.B, x: BTN.B, X: BTN.B };
    const down = (e) => {
      if (e.target?.closest?.("input, textarea, [role=dialog]")) return;
      if (e.key === "Escape" || e.key === "p" || e.key === "P") { e.preventDefault(); togglePause(); return; }
      const b = MAP[e.key]; if (!b) return;
      e.preventDefault(); SFX.unlock(); keys.current |= b; if (!e.repeat) taps.current |= b;
    };
    const up = (e) => { const b = MAP[e.key]; if (b) keys.current &= ~b; };
    const blur = () => { keys.current = 0; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [togglePause]);

  // the mouse and the finger
  const at = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, t: e.timeStamp }; };
  const arrowHead = () => {
    const st = stRef.current, p = st.players[st.cur], y1 = ARROWS_Y + 60;
    const [x, y] = toScreen(viewRef.current, p.posX + p.aim * y1, y1, 0);
    return { x, y, y1 };
  };
  const onDown = (e) => {
    const st = stRef.current, p = st.players[st.cur];
    SFX.unlock();
    if (paused || replayRef.current || st.over || p.kind !== "human" || st.phase !== "aim") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const q = at(e), ah = arrowHead();
    const F = flickRef.current;
    if (q.y > H - 120) F.mode = "slide";
    else if (Math.hypot(q.x - ah.x, q.y - ah.y) < 34) F.mode = "aim";
    else F.mode = "flick";
    F.S = [q]; F.live = null;
    move(q);
  };
  const move = (q) => {
    const st = stRef.current, p = st.players[st.cur], F = flickRef.current;
    if (!F.mode || st.phase !== "aim") return;
    if (F.mode === "slide") {
      const x = Math.max(-LANE_HW + R_BALL, Math.min(LANE_HW - R_BALL, laneXAt(viewRef.current, q.x) + p.hand * 5));
      pend.current = { t: "set", x: Math.round(x * 100) / 100, a: p.aim };
    } else if (F.mode === "aim") {
      const ah = arrowHead();
      const lx = laneXAt(viewRef.current, q.x, ah.y1);
      pend.current = { t: "set", x: p.posX, a: Math.round(Math.max(-0.06, Math.min(0.06, (lx - p.posX) / ah.y1)) * 1e5) / 1e5 };
    } else {
      F.S.push(q);
      F.live = liveFlick(F.S);
      const f = readFlick(F.S, false);
      if (f.kind === "throw") { queue.current.push(throwOf(f, { x: p.posX, aim: p.aim, weight: p.weight, hand: p.hand, easy: st.easy })); F.mode = null; F.live = null; }
    }
  };
  const onMove = (e) => { if (flickRef.current.mode) move(at(e)); };
  const onUp = (e) => {
    const st = stRef.current, p = st.players[st.cur], F = flickRef.current;
    if (F.mode === "flick") {
      F.S.push(at(e));
      const f = readFlick(F.S, true);
      if (f.kind === "throw" && st.phase === "aim") queue.current.push(throwOf(f, { x: p.posX, aim: p.aim, weight: p.weight, hand: p.hand, easy: st.easy }));
    }
    F.mode = null; F.live = null; F.S = [];
  };

  const st = stRef.current, cur = st.players[st.cur];
  const instant = () => { const s = snapRef.current; if (s && !replayRef.current) replayRef.current = { st: clone(s.st), view: { ...s.view, camZ: 0 } }; };
  const toggleMute = () => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); };
  const pos = position(cur.balls);
  const status = st.over ? "GAME OVER" : `FRAME ${Math.min(10, pos.frame + 1)} // ${cur.name}${cur.kind === "cpu" ? " (THE HOUSE'S GUEST)" : ""} // BALL ${pos.ball + 1}`;

  return (
    <div className={`bw${cosmic ? " cosmic" : ""}`}>
      <Monitor st={st} cosmic={cosmic} />
      <div className="bw-call" aria-live="polite" aria-atomic="true">{call ? <><b>{call.head}</b> {call.sub}{call.tell ? <span className="bw-tell"> {call.tell}</span> : null}</> : status}</div>
      <div className="bw-stage" ref={wrapRef}>
        <div className="bw-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale, touchAction: "none" }} role="img"
            aria-label={`Bowling, lane ${lane}${cosmic ? ", cosmic" : ""}: ${status}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        </div>
      </div>
      <ButtonRow>
        <Button onClick={togglePause}>Pause</Button>
        <Button onClick={instant} disabled={!snapRef.current}>Instant replay</Button>
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        <Button onClick={() => { cosmicRef.current = !cosmicRef.current; setHud(h => ({ ...h, n: -1 })); }}>{cosmicRef.current ? "House lights" : "Cosmic"}</Button>
        {done?.closed && <Button variant="primary" onClick={() => setDone(d => ({ ...d, closed: false }))}>The final sheet</Button>}
        <Button variant="back" onClick={onSettings}>Change bowlers</Button>
      </ButtonRow>
      <Legend pad={pad} />
      <p className="bw-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
      {paused && !done && (
        <GameMenu key="pause" kind="pause" title="PAUSED." summary="THE PINSETTER WAITS. IT IS PAID TO." onBack={() => setPaused(false)}
          options={{ resume: () => setPaused(false), restart: onAgain, controls: <Legend pad={pad} />, sound: { on: !muted, onSelect: toggleMute }, quit: true }} />
      )}
      {done && !done.closed && (
        <GameMenu key="end" kind="end" title="GAME FILED." summary={`${resultLine(done.shape)}. ${done.verified ? "RE-RUN FROM THE LOG: SAME SHEET." : "THE RE-RUN DISAGREED. NOT KEPT."}`}
          onBack={() => setDone(d => ({ ...d, closed: true }))}
          options={{ again: onAgain, settings: onSettings, replay: snapRef.current ? () => { setDone(null); instant(); } : false, play: true, city: { label: "BACK TO THE LANES", href: "#city/strip/the-arcade" } }} />
      )}
    </div>
  );
}
