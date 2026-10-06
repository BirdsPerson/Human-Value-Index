import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { GLYPHS, readPad } from "../../city/gamepad.js";
import GameMenu from "../GameMenu.jsx";
import { headFrom, sheetHints } from "../heads.js";
import { newGame, step, rleEncode, resultOf, verify, VERSION } from "./sim.js";
import { LEVELS, LEVEL_IDS } from "./levels.js";
import { makeView, advance, draw, pop } from "./render.js";
import { createInput } from "./input.js";
import { readResults, keepResult, readProgress, fileProgress } from "./results.js";
import { SKATERS, SKATER } from "./roster.js";
import * as SFX from "./audio.js";
import CSS from "./skate.css?inline";
import "../pages.css";

// #skate[?lvl=park|vert|street][&mode=run|free][&cab=1]: THE PARK, skateable (src/play/skate/).
// A fixed-camera isometric skate game: the park on the Recreation Ground, the vert ramp behind it,
// and the Plaza by HQ. Two-minute RUNs with goals and S-K-A-T-E, or free skate. Every run is its input
// log; a finished run is re-skated from the log before it is kept (results.js).

function injectStyles() {
  let el = document.getElementById("sb-styles");
  if (!el) { el = document.createElement("style"); el.id = "sb-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const COARSE = () => { try { return Boolean(window.matchMedia?.("(pointer: coarse)").matches); } catch { return false; } };
function parseRoute(route) {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const lvl = LEVELS[q.get("lvl")] ? q.get("lvl") : null;
  return { lvl, mode: q.get("mode") === "free" ? "free" : "run", cab: q.get("cab") === "1" };
}
const comma = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const seedNow = () => ((Date.now() * 2654435761) >>> 0) || 1;
const SKATER_KEY = "hvi-skate-skater";

export default function Skate({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const [play, setPlay] = useState(() => (opts.lvl || opts.cab ? { n: 1, level: opts.lvl || "park", mode: opts.cab ? "run" : opts.mode, seed: seedNow() } : null));
  const [skater, setSkaterS] = useState(() => { try { return SKATER[localStorage.getItem(SKATER_KEY)] ? localStorage.getItem(SKATER_KEY) : "you"; } catch { return "you"; } });
  const setSkater = (k) => { setSkaterS(k); try { localStorage.setItem(SKATER_KEY, k); } catch { /* */ } };
  useEffect(() => { if (opts.lvl) setPlay({ n: Date.now(), level: opts.lvl, mode: opts.mode, seed: seedNow() }); }, [opts]);   // a link into a level
  const start = (level, mode) => { SFX.unlock(); setPlay({ n: Date.now(), level, mode, seed: seedNow() }); };
  return (
    <div className="sb">
      <ScreenHead title="THE PARK" meta="SKATEBOARDING // THE PARK, THE VERT RAMP, THE PLAZA // EVERY RUN IS RECORDED" />
      {play
        ? <Play key={play.n} game={play} skater={skater} onRestart={() => setPlay(p => ({ ...p, n: Date.now(), seed: seedNow() }))} onQuit={() => { if (opts.cab) { window.location.hash = "play"; return; } setPlay(null); }} />
        : <Home skater={skater} setSkater={setSkater} onStart={start} />}
    </div>
  );
}

// ---- the start ---------------------------------------------------------------------------------------------------
function Home({ skater, setSkater, onStart }) {
  const prog = useMemo(() => readProgress(), []);
  const results = useMemo(() => readResults(), []);
  const first = useRef(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {   // A or START on a pad: a run at the park
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onStart("park", "run"); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  return (
    <>
      <p className="pg-lede">Skate the city. A two-minute run: score big combos, grab the letters S-K-A-T-E, find the secret tape, tick off the goals. Or free skate with no clock. Arrows push and turn; Z ollies (hold, let go), X flips, C grabs, V grinds. A controller works; phones get a d-pad.</p>
      <div className="pg-start">
        <Button variant="primary" ref={first} onClick={() => onStart("park", "run")}>RUN THE PARK</Button>
        <span className="pg-sub">TWO MINUTES ON THE RECREATION GROUND. {prog.park?.best ? `YOUR BEST: ${comma(prog.park.best)}.` : "NO RUN YET."}</span>
      </div>
      <div className="sb-levels">
        {LEVEL_IDS.map(id => {
          const D = LEVELS[id], P = prog[id] || { goals: [], best: 0 };
          return (
            <section key={id} className="sb-level" aria-label={D.name}>
              <h3>{D.name} <small>{D.place}</small></h3>
              <p className="sb-small">{D.blurb}</p>
              <div className="sb-row">
                <button type="button" className="sb-chip on" onClick={() => onStart(id, "run")}>RUN (2:00)</button>
                <button type="button" className="sb-chip" onClick={() => onStart(id, "free")}>FREE SKATE</button>
                <span className="sb-best">{P.best ? `BEST ${comma(P.best)}` : ""}</span>
              </div>
              <ul className="sb-goals">
                {D.goals.map(g => <li key={g.id} className={P.goals?.includes(g.id) ? "done" : ""}><span aria-hidden="true">{P.goals?.includes(g.id) ? "■" : "□"}</span> {g.name}{P.goals?.includes(g.id) ? <span className="sr-only"> (done)</span> : null}</li>)}
              </ul>
            </section>
          );
        })}
      </div>
      <details className="pg-more">
        <summary>SKATER: {SKATER[skater].name}</summary>
        <div className="pg-more-body">
          <div className="sb-row" role="radiogroup" aria-label="Skater">
            {SKATERS.map(s => <button key={s.key} type="button" role="radio" aria-checked={skater === s.key} className={`sb-chip${skater === s.key ? " on" : ""}`} onClick={() => setSkater(s.key)}>{s.name}</button>)}
          </div>
          <p className="sb-small">YOU SKATE WITH YOUR OWN FILE'S FACE. EVERYONE GETS THE SAME BOARD AND THE SAME LEGS.</p>
        </div>
      </details>
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><Controls /></div>
      </details>
      <details className="pg-more">
        <summary>YOUR RUNS ({results.length})</summary>
        <div className="pg-more-body">
          {!results.length ? <p className="sb-small">NONE YET. A FINISHED RUN IS RE-SKATED FROM ITS INPUT LOG BEFORE IT IS KEPT HERE.</p> : (
            <ul className="sb-runs">{results.map((r, i) => <li key={i}><b>{comma(r.score)}</b> {LEVELS[r.level]?.name} // {r.goals.length}/{r.goalsOf} GOALS // {r.letters.replace(/_/g, "·")}{r.tape ? " // TAPE" : ""} // {new Date(r.at).toLocaleDateString()}</li>)}</ul>
          )}
        </div>
      </details>
    </>
  );
}

function Controls() {
  return (
    <dl className="sb-keys">
      <dt>PUSH / TURN</dt><dd>UP PUSHES, LEFT AND RIGHT TURN, DOWN SLOWS. ARROWS OR WASD // D-PAD OR LEFT STICK. YOU CAN'T PUSH UP A RAMP: HOLD UP GOING DOWN IT TO PUMP.</dd>
      <dt>OLLIE</dt><dd>HOLD Z / SPACE / J // A TO CROUCH, LET GO TO POP. LONGER HOLD, HIGHER POP. LET GO AT A KICKER'S LIP FOR MORE.</dd>
      <dt>FLIP TRICKS</dt><dd>IN THE AIR: X / K // X (LEFT FACE BUTTON), WITH A DIRECTION. ← KICKFLIP, → HEELFLIP, ↓ POP SHOVE-IT, ↑ IMPOSSIBLE, DIAGONALS: HARDFLIP, VARIAL KICKFLIP, VARIAL HEELFLIP, 360 FLIP.</dd>
      <dt>GRABS</dt><dd>IN THE AIR: C / L // B, WITH A DIRECTION. HOLD IT FOR MORE POINTS, BUT LET GO BEFORE YOU LAND.</dd>
      <dt>SPINS</dt><dd>HOLD LEFT OR RIGHT IN THE AIR. LAND STRAIGHT (A WHOLE 180, 360...) OR YOU BAIL.</dd>
      <dt>GRINDS</dt><dd>V / I // Y NEAR A RAIL, A LEDGE OR THE COPING, IN THE AIR. A DIRECTION PICKS THE GRIND. KEEP THE NEEDLE IN THE GREEN WITH LEFT / RIGHT. OLLIE OFF.</dd>
      <dt>LIP TRICKS</dt><dd>ON VERT: GRIND AT THE TOP OF A SLOW AIR, STRAIGHT UP. ↑ INVERT, ↓ ROCK TO FAKIE... BALANCE, THEN OLLIE TO DROP BACK IN.</dd>
      <dt>MANUALS</dt><dd>UP THEN DOWN, QUICKLY (DOWN THEN UP: A NOSE MANUAL). ON THE GROUND OR JUST BEFORE YOU LAND. BALANCE WITH UP / DOWN.</dd>
      <dt>REVERT</dt><dd>SHIFT / U // ANY SHOULDER, AS YOU LAND ON A RAMP. THEN MANUAL TO KEEP GOING.</dd>
      <dt>COMBOS</dt><dd>EVERY TRICK ADDS POINTS AND +1 TO THE MULTIPLIER. LAND TO BANK POINTS X MULTIPLIER. A MANUAL OR A REVERT ON LANDING KEEPS IT GOING. THE SAME TRICK TWICE IS WORTH LESS. BAIL AND YOU LOSE THE LOT.</dd>
      <dt>PAUSE</dt><dd>ENTER / ESC / P // START. R // SELECT RESTARTS.</dd>
    </dl>
  );
}
export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = GLYPHS[family] || GLYPHS.generic;
    return [["PUSH/TURN", "D-PAD / STICK"], ["OLLIE", `HOLD ${g.act}, LET GO`], ["FLIP", "X + DIR"], ["GRAB", `${g.back} + DIR`], ["GRIND", "Y + DIR"], ["MANUAL", "↑ ↓"], ["REVERT", `${g.turnL} / ${g.turnR}`], ["PAUSE", g.start]];
  }
  if (mode === "touch") return [["PUSH/TURN", "D-PAD"], ["OLLIE", "HOLD A, LET GO"], ["FLIP", "X + DIR"], ["GRAB", "B + DIR"], ["GRIND", "Y + DIR"], ["MANUAL", "↑ ↓"], ["REVERT", "R"], ["PAUSE", "II"]];
  return [["PUSH/TURN", "←↑↓→ / WASD"], ["OLLIE", "HOLD Z / SPACE"], ["FLIP", "X + DIR"], ["GRAB", "C + DIR"], ["GRIND", "V + DIR"], ["MANUAL", "↑ ↓"], ["REVERT", "SHIFT"], ["PAUSE", "ENTER / ESC"]];
}
function Legend({ mode, family }) {
  return <dl className="sb-legend">{legendRows(mode, family).map(([k, v]) => <div key={k}><dt>{k}</dt><dd><kbd>{v}</kbd></dd></div>)}</dl>;
}

// ---- how the skater looks -----------------------------------------------------------------------------------------
function useLook(key) {
  const [look, setLook] = useState(() => ({ ...SKATER[key] }));
  useEffect(() => {
    let off = false;
    const S = SKATER[key];
    let p;
    if (key === "you") {
      const av = readLastResult()?.avatar || null;
      p = av?.kind === "sprite" ? loadSprite(av.url, { sector: null }).catch(() => null) : Promise.resolve(av?.kind === "procedural" ? paintAvatar(av.spec, 1) : null);
    } else p = loadSprite(S.sprite, { sector: null }).catch(() => null);
    p.then(sheet => {
      if (off) return;
      const s = sheet || paintAvatar(DEFAULT_SPEC, 1);
      const head = headFrom(s, null);
      const cue = head ? {} : sheetHints(s);
      setLook({ ...S, head, skin: cue.skin || undefined, hair: cue.hair || undefined });
    });
    return () => { off = true; };
  }, [key]);
  return look;
}

// ---- the game -----------------------------------------------------------------------------------------------------
function Play({ game, skater, onRestart, onQuit }) {
  const canvasRef = useRef(null), wrapRef = useRef(null), inputRef = useRef(null), apiRef = useRef({}), lookRef = useRef(null);
  const look = useLook(skater); lookRef.current = look;
  const [menu, setMenu] = useState(null);   // null | "pause" | {end}
  const [mode, setMode] = useState(() => (COARSE() ? "touch" : "keys"));
  const [family, setFamily] = useState(null);
  const [size, setSize] = useState({ W: 320, H: 200, scale: 2 });
  const [muted, setMutedS] = useState(() => SFX.isMuted());
  const [watching, setWatching] = useState(false);
  const [sr, setSr] = useState("");
  const touch = mode === "touch";
  const L = LEVELS[game.level];

  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const w = el.clientWidth, h = Math.max(200, Math.min(window.innerHeight - (COARSE() ? 420 : 200), w * 0.75));
      const W = w < 520 ? 240 : 320, H = Math.max(150, Math.min(260, Math.round((W * h) / w)));
      setSize({ W, H, scale: w / W });
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrapRef.current); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  useEffect(() => {
    const cfg = { level: game.level, mode: game.mode, seed: game.seed };
    const G = { st: newGame(cfg), words: [], paused: false, ended: false, replay: null };
    const V = makeView(game.level);
    const input = createInput(COARSE() ? "touch" : "keys"); inputRef.current = input;
    const say = (s) => setSr(s);
    if (import.meta.env?.DEV) { window.__hviSkate = G; G.V = V; }
    const events = (evs, VV) => {
      for (const e of evs) {
        if (e[0] === "bank" && e[1] > 0) pop(VV, `+${comma(e[1])}`, "bank");
        else if (e[0] === "bail") { pop(VV, "BAIL!", "bail"); if (e[2]) say(`BAIL. ${e[2]} POINTS LOST.`); }
        else if (e[0] === "goal") { pop(VV, `GOAL: ${e[2]}`, "goal", 2.6); say(`GOAL: ${e[2]}.`); }
        else if (e[0] === "letter") { pop(VV, `${e[1]}!`, "letter"); say(`LETTER ${e[1]}.`); }
        else if (e[0] === "tape") { pop(VV, "SECRET TAPE!", "letter", 2.4); say("THE SECRET TAPE."); }
      }
    };
    const finish = () => {
      G.ended = true;
      const res = resultOf(G.st);
      const rec = { v: VERSION, cfg, inputLog: rleEncode(G.words) };
      const verified = verify(rec, res);
      const kept = { ...res, verified, at: new Date().toISOString(), skater: SKATER[skater]?.name || "YOU", rec };
      if (game.mode === "run") keepResult(kept);
      const { beat } = fileProgress(res);
      setTimeout(() => setMenu({ end: res, verified, beat }), 1200);
      say(`TIME. ${res.score} POINTS. ${res.goals.length} OF ${res.goalsOf} GOALS.`);
    };
    apiRef.current = {
      pause: () => { if (G.ended) return; G.paused = true; setMenu("pause"); },
      resume: () => { G.paused = false; setMenu(null); },
      watch: () => {
        G.replay = { st: newGame(cfg), words: G.words.slice(), i: 0, V: { ...V, cam: null, pops: [], parts: [] } };
        setMenu(null); setWatching(true);
      },
      stopWatch: () => { G.replay = null; setWatching(false); if (G.ended) setMenu({ end: resultOf(G.st), verified: true }); },
      end: () => { if (G.ended) return; if (game.mode === "free") { G.st.done = true; finish(); } },
    };
    const ctx = canvasRef.current.getContext("2d");
    let raf, last = performance.now(), acc = 0, lastMode = null, lastFam = null;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now; if (dt > 0.25) dt = 0.25;
      const inp = input.sample();
      if (inp.mode !== lastMode) { lastMode = inp.mode; setMode(inp.mode); }
      if (inp.family !== lastFam) { lastFam = inp.family; setFamily(inp.family); }
      for (const m of inp.meta) {
        if (G.replay) { apiRef.current.stopWatch(); continue; }
        if (m === "pause") { if (G.paused && !G.ended) apiRef.current.resume(); else apiRef.current.pause(); }
        else if (m === "restart" && !G.ended) onRestart();
      }
      let S = G.st, VV = V;
      if (G.replay) {
        S = G.replay.st; VV = G.replay.V; acc += dt;
        while (acc >= 1 / 60) { acc -= 1 / 60; if (G.replay.i < G.replay.words.length) { step(S, G.replay.words[G.replay.i++]); events(S.ev, VV); SFX.play(S.ev); } else { apiRef.current.stopWatch(); break; } }
      } else if (!G.paused && !G.ended) {
        acc += dt; let n = 0;
        while (acc >= 1 / 60 && n < 6) {
          acc -= 1 / 60; n++;
          const w = G.bot ? G.bot(S) : inp.word;
          G.words.push(w); step(S, w); events(S.ev, V); SFX.play(S.ev);
          if (S.done) { finish(); break; }
        }
        if (n === 6) acc = 0;
      } else acc = 0;
      advance(VV, S, dt);
      const c = canvasRef.current;
      draw(ctx, c.width, c.height, S, VV, { look: lookRef.current, replay: Boolean(G.replay), banner: !G.replay && G.st.t < 90 ? (game.mode === "run" ? `${L.name}: GO!` : L.name) : G.ended && !G.replay ? "TIME!" : null });
      SFX.bed(G.paused ? 0 : Math.sqrt(S.vx * S.vx + S.vy * S.vy), S.st === "ground" || S.st === "manual", S.st === "grind");
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => { if (document.hidden && !G.ended && !G.replay) apiRef.current.pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); SFX.bed(0, false); if (window.__hviSkate === G) delete window.__hviSkate; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const api = apiRef.current;
  const toggleMute = () => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); };
  const legend = <Legend mode={mode} family={family} />;
  const end = menu && menu.end ? menu : null;
  return (
    <div className="sb-play">
      <div className="sb-stage" ref={wrapRef}>
        <canvas ref={canvasRef} width={size.W} height={size.H} style={{ width: "100%", height: size.H * size.scale }} role="img" aria-label={`${L.name}: the skate level, seen from above at an angle`} />
        {watching && <button type="button" className="sb-stoptape" onClick={() => api.stopWatch?.()}>STOP THE REPLAY</button>}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{sr}</div>
      {touch && !watching && <TouchPad input={inputRef} />}
      <ButtonRow>
        <Button onClick={() => api.pause?.()}>Pause</Button>
        <Button onClick={onRestart}>Restart</Button>
        {game.mode === "free" && <Button onClick={() => api.end?.()}>End session</Button>}
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        <Button variant="back" onClick={onQuit}>Leave the park</Button>
      </ButtonRow>
      {!touch && <details className="pg-more sb-legend-wrap"><summary>CONTROLS // {mode === "pad" ? `CONTROLLER (${String(family || "pad").toUpperCase()})` : "KEYBOARD"}</summary><div className="pg-more-body">{legend}<Controls /></div></details>}
      {menu === "pause" && (
        <GameMenu kind="pause" title="PAUSED." summary={`${L.name}. ${game.mode === "run" ? "THE CLOCK IS STOPPED." : "FREE SKATE."}`} onBack={() => api.resume?.()}
          options={{ resume: () => api.resume?.(), restart: onRestart, controls: legend, sound: { on: !muted, onSelect: toggleMute }, quit: { label: "LEAVE THE PARK", onSelect: onQuit } }} />
      )}
      {end && !watching && (
        <GameMenu key="end" kind="end" title={`${comma(end.end.score)} POINTS.`}
          summary={`${L.name}. BEST COMBO ${comma(end.end.best)}. LETTERS ${end.end.letters.replace(/_/g, "·")}${end.end.tape ? ", THE TAPE" : ""}. GOALS ${end.end.goals.length} OF ${end.end.goalsOf}.${end.beat ? " A NEW BEST." : ""}${end.verified ? " RE-SKATED FROM THE LOG: THE SAME." : ""}`}
          onBack={() => setMenu(null)}
          options={{ again: onRestart, replay: () => api.watch?.(), settings: { label: "ANOTHER LEVEL", onSelect: onQuit }, play: true, city: true }} />
      )}
    </div>
  );
}

// ---- the phone's controls: a d-pad, and A B X Y with a revert ----------------------------------------------------------
function TouchPad({ input }) {
  const st = useRef({ id: null }), [dir, setDir] = useState("");
  const set = (t) => input.current?.setTouch(t);
  const pad = (e) => {
    if (st.current.id !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), k = 0.38 * m;
    const o = { up: m > 10 && dy < -k, down: m > 10 && dy > k, left: m > 10 && dx < -k, right: m > 10 && dx > k };
    set(o); setDir(Object.keys(o).filter(x => o[x]).join(" "));
  };
  const off = () => { st.current.id = null; set({ up: false, down: false, left: false, right: false }); setDir(""); };
  const hold = (k) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); SFX.unlock(); set({ [k]: true }); },
    onPointerUp: () => set({ [k]: false }), onPointerCancel: () => set({ [k]: false }),
  });
  return (
    <div className="sb-touch">
      <div className={`sb-dpad ${dir}`} role="group" aria-label="D-pad"
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); st.current.id = e.pointerId; SFX.unlock(); pad(e); }}
        onPointerMove={pad} onPointerUp={off} onPointerCancel={off}>
        <span className="u" /><span className="d" /><span className="l" /><span className="r" />
      </div>
      <div className="sb-face">
        <button type="button" className="sb-tb rv" {...hold("r")} aria-label="Revert">R</button>
        <button type="button" className="sb-tb y" {...hold("y")} aria-label="Grind">Y<small>GRIND</small></button>
        <button type="button" className="sb-tb x" {...hold("x")} aria-label="Flip">X<small>FLIP</small></button>
        <button type="button" className="sb-tb b" {...hold("b")} aria-label="Grab">B<small>GRAB</small></button>
        <button type="button" className="sb-tb a" {...hold("a")} aria-label="Ollie">A<small>OLLIE</small></button>
      </div>
    </div>
  );
}
