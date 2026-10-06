import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId } from "../../caseFile.jsx";
import { GLYPHS, readPad } from "../../city/gamepad.js";
import { machineClock } from "../../city/sim.js";
import GameMenu from "../GameMenu.jsx";
import { newGame, step, warp, challengeNear, rleEncode, rleDecode, replay, resultOf, speedKmh, VERSION } from "./sim.js";
import { RUNS, POI, SHOP, warmTiles, weatherOn, lightsOn, FILES, LIFT_W, liftRideTicks } from "./world.js";
import { CHALLENGES, CHALLENGE, RUNNABLE, MEDAL_NAME, fieldTimes, PIPE_LIMIT } from "./challenges.js";
import { makeView, advance, draw } from "./render.js";
import { drawMap, fitMap, mapBase, toMap } from "./map.js";
import { createInput } from "./input.js";
import { npcsAt, PACE } from "./npc.js";
import { loadProgress, saveProgress, fileResult, loadRuns, saveRun, deleteRun, fmtValue } from "./records.js";
import { BOARDED, fetchBoards, startRun, fileRun } from "./board.js";
import * as SFX from "./audio.js";
import CSS from "./ski.css?inline";
import "../pages.css";

// #ski[?at=<place>][&ch=<challenge>][&board=1]: THE MOUNTAIN, skiable (docs/CITY_SPEC.md, the mountain).
// The city's mountain as an open slope: ride the lifts, ski anywhere, find the places (fast travel
// goes only to places found), the challenges' flags and the Department's lost files. Exhibition only:
// nothing here reaches a file, the league or the Cup, except a challenge filed to the verified
// boards (the server re-runs the run from its input log before it believes it).

function injectStyles() {
  let el = document.getElementById("sk-styles");
  if (!el) { el = document.createElement("style"); el.id = "sk-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const COARSE = () => { try { return Boolean(window.matchMedia?.("(pointer: coarse)").matches); } catch { return false; } };
const ROUTE_AT = (p) => p && (p === "base" || /@a$/.test(p) || p.startsWith("lodge:"));
function parseRoute(route) {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const at = q.get("at"), ch = q.get("ch");
  return { at: POI[at] && ROUTE_AT(at) ? at : null, ch: CHALLENGE[ch]?.start ? ch : null, board: q.get("board") === "1" };
}
const RATE_MARK = { green: "●", blue: "■", black: "◆", double: "◆◆" };
const RATE_WORD = { green: "GREEN CIRCLE", blue: "BLUE SQUARE", black: "BLACK DIAMOND", double: "DOUBLE BLACK" };
const NOTICE = "EXHIBITION. NOTHING HERE REACHES YOUR FILE, THE LEAGUE OR THE CUP.";
const TIMES = { city: "THE CITY'S HOUR", day: "MIDDAY", dusk: "DUSK", night: "NIGHT SKIING" };

export default function Ski({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const [prog, setProg] = useState(() => loadProgress());
  const [board, setBoard] = useState(() => opts.board || prog.board);
  const [time, setTime] = useState("city");
  const [play, setPlay] = useState(null);   // {n, at | ch, tape?}
  const caseId = useMemo(() => readCaseId(), []);
  useEffect(() => {
    if (opts.at || opts.ch) {
      setProg(p => { const q = { ...p, found: [...new Set([...p.found, ...(opts.at ? [opts.at] : [])])] }; saveProgress(q); return q; });
      setPlay({ n: Date.now(), at: opts.at || "base", ch: opts.ch && prog.found.includes(`ch:${opts.ch}`) ? opts.ch : null });
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleBoard = () => setBoard(b => { const v = !b; setProg(p => { const q = { ...p, board: v }; saveProgress(q); return q; }); return v; });
  let body;
  if (play) body = <Play key={play.n} start={play} board={play.tape ? Boolean(play.tape.board) : board} time={time} caseId={caseId} prog={prog} setProg={setProg} onQuit={() => { setPlay(null); setProg(loadProgress()); }} />;
  else body = <Home prog={prog} board={board} toggleBoard={toggleBoard} time={time} setTime={setTime} caseId={caseId} onPlay={(s) => { SFX.unlock(); setPlay({ n: Date.now(), ...s }); }} />;
  return (
    <div className="sk">
      <ScreenHead title="THE MOUNTAIN" meta="SKIING // EXHIBITION // OPEN SLOPE. THE LIFTS RUN FOR YOU. EVERYTHING IS RECORDED." />
      {body}
    </div>
  );
}

// ---- the start ------------------------------------------------------------------------------------------
function Home({ prog, board, toggleBoard, time, setTime, caseId, onPlay }) {
  const found = new Set(prog.found), playRef = useRef(null);
  const [runs, setRuns] = useState(() => loadRuns());
  const [boards, setBoards] = useState(null);
  useEffect(() => { playRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onPlay({ at: "base" }); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  let files = 0; for (const F of FILES) if (prog.files & (1 << F.i)) files++;
  const medals = CHALLENGES.filter(c => c.start).reduce((n, c) => n + ((prog.medals[c.id]?.medal || 0) === 3 ? 1 : 0), 0);
  return (
    <>
      <p className="pg-lede">THE CITY'S MOUNTAIN, ALL OF IT: 21 TRAILS, SEVEN LIFTS, THE PARK, THE PIPE, THE RACE COURSE AND THE RETENTION POOL. SKI ANYWHERE. RIDE THE LIFTS. FIND THE CHALLENGES' FLAGS AND THE FILES THE DEPARTMENT MISLAID. ARROWS STEER, SPACE JUMPS (HOLD, LET GO), SHIFT TUCKS, M IS THE MAP. A CONTROLLER IS BETTER; PHONES GET A STICK.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={() => onPlay({ at: "base" })}>PLAY NOW</Button>
        <span className="pg-sub">FREE RIDE FROM THE BASE ON {board ? "A SNOWBOARD" : "SKIS"}. {found.size} PLACES FOUND, {files} OF {FILES.length} FILES, {medals} GOLD.</span>
      </div>
      <details className="pg-more">
        <summary>CHALLENGES ({CHALLENGES.filter(c => c.start && found.has(`ch:${c.id}`)).length} OF {RUNNABLE.length} FOUND)</summary>
        <div className="pg-more-body">
          <p className="sk-small">A CHALLENGE STARTS AT ITS FLAG ON THE MOUNTAIN (STAND BY IT, PRESS R OR Y). ONCE FOUND, START IT FROM HERE OR THE MAP. MEDALS: BRONZE, SILVER, GOLD.</p>
          <ul className="sk-chs">
            {CHALLENGES.map(c => {
              const m = prog.medals[c.id], ok = c.start ? found.has(`ch:${c.id}`) : true;
              return (
                <li key={c.id}>
                  <button type="button" className="sk-ch" disabled={!ok || !c.start} onClick={() => onPlay({ at: "base", ch: c.id })} aria-label={`${c.name}. ${ok ? (m ? `Best ${fmtValue(c, m.best)}, ${MEDAL_NAME[m.medal]}` : "Not yet run") : "Not found yet"}.${c.start && ok ? " Start it." : ""}`}>
                    <span className={`sk-medal m${m?.medal || 0}`} aria-hidden="true">{["·", "B", "S", "G"][m?.medal || 0]}</span>
                    <span className="nm"><b>{ok ? c.name : "?? NOT FOUND YET"}</b><span className="why">{ok ? c.note : "SOMEWHERE ON THE MOUNTAIN. LOOK FOR A TALL ORANGE FLAG."}</span></span>
                    <span className="rt">{c.id === "files" ? `${files}/${FILES.length}` : m ? fmtValue(c, m.best) : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </details>
      <details className="pg-more">
        <summary>SKIS OR BOARD, TIME OF DAY</summary>
        <div className="pg-more-body">
          <p className="sk-row"><button type="button" className="pg-toggle" aria-pressed={board} onClick={toggleBoard}>SNOWBOARD</button><span className="sk-small">{board ? "ONE BOARD, SIDEWAYS. GRABS ARE INDY, MELON, STALEFISH; RAILS CAN BE BOARDSLID." : "TWO SKIS. GRABS ARE MUTE, SAFETY, JAPAN."}</span></p>
          <div className="sk-chips" role="radiogroup" aria-label="Time of day">
            {Object.entries(TIMES).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={time === k} className={`sk-chip${time === k ? " on" : ""}`} onClick={() => setTime(k)}>{v}</button>)}
          </div>
          <p className="sk-small">THE CITY'S HOUR AND WEATHER BY DEFAULT (THE MOUNTAIN'S DAY RUNS AT A SIXTH OF THE CITY'S CLOCK WHILE YOU SKI). THE LIGHTS ON THE LOWER TRAILS COME ON AT DUSK.</p>
          <p className="sk-small">START FROM A PLACE FOUND:</p>
          <div className="sk-chips">
            {[...found].filter(id => POI[id]).slice(0, 40).map(id => <button key={id} type="button" className="sk-chip" onClick={() => onPlay({ at: id })}>{POI[id].name}</button>)}
          </div>
        </div>
      </details>
      <details className="pg-more" onToggle={(e) => { if (e.currentTarget.open && !boards) fetchBoards(caseId).then(setBoards).catch(err => setBoards({ error: err.message })); }}>
        <summary>THE VERIFIED BOARDS</summary>
        <div className="pg-more-body">
          <p className="sk-small">THREE CHALLENGES KEEP A BOARD: {BOARDED.map(id => CHALLENGE[id].name).join(", ")}. A RUN IS FILED FROM ITS INPUT LOG; THE SERVER SKIS IT AGAIN BEFORE IT BELIEVES YOU. FILING NEEDS A CASE NUMBER{caseId ? "" : " (YOU HAVE NONE IN THIS BROWSER: GET ONE FROM THE INTAKE)"}.</p>
          {!boards ? <p className="sk-small">FETCHING THE BOARDS...</p> : boards.error ? <p className="sk-small">{boards.error}</p> : (
            <div className="sk-boards">
              {BOARDED.map(id => (
                <table key={id} aria-label={`${CHALLENGE[id].name} board`}>
                  <caption>{CHALLENGE[id].name}</caption>
                  <tbody>{(boards.boards?.[id] || []).slice(0, 10).map((e, i) => <tr key={i}><td>{i + 1}</td><td>{e.holder}</td><td>{fmtValue(CHALLENGE[id], e.value)}</td></tr>)}{!(boards.boards?.[id] || []).length && <tr><td colSpan={3}>NOBODY YET.</td></tr>}</tbody>
                </table>
              ))}
            </div>
          )}
        </div>
      </details>
      <details className="pg-more">
        <summary>SAVED RUNS ({runs.length})</summary>
        <div className="pg-more-body">
          {!runs.length ? <p className="sk-small">NONE YET. A CHALLENGE'S BEST IS KEPT BY ITSELF; ANY RUN CAN BE KEPT FROM THE PAUSE MENU (SAVE THIS RUN).</p> : (
            <ul className="sk-runs">
              {runs.map(r => (
                <li key={r.at}>
                  <span>{r.name}{r.res?.value != null ? ` // ${fmtValue(CHALLENGE[r.ch] || { unit: "" }, r.res.value)}` : ""} // {new Date(r.at).toLocaleDateString()}</span>
                  <button type="button" className="sk-chip" onClick={() => onPlay({ at: "base", tape: r })}>WATCH</button>
                  {r.ch && found.has(`ch:${r.ch}`) && <button type="button" className="sk-chip" onClick={() => onPlay({ at: "base", ch: r.ch })}>RUN IT AGAIN</button>}
                  <button type="button" className="sk-chip" onClick={() => { deleteRun(r.at); setRuns(loadRuns()); }}>DELETE</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><Controls /></div>
      </details>
      <p className="sk-notice"><b>EXHIBITION.</b> {NOTICE} THE SHAUN WHITE SHOP AT THE FOOT SELLS NOTHING YET. THE CITY'S SKIERS ON THE SLOPES ARE ON THEIR OWN ROUNDS; THEY DO NOT TALK.</p>
    </>
  );
}

function Controls() {
  return (
    <dl className="sk-keys">
      <dt>STEER</dt><dd>ARROWS / WASD // LEFT STICK // THE STICK ON A PHONE. BY THE SCREEN: DOWN IS DOWN THE HILL. A LITTLE STICK CARVES (FAST); A LOT THROWS THE SKIS ROUND (A SKID: SLOW). KEYS CARVE; HOLD BRAKE WITH THEM TO SKID.</dd>
      <dt>TUCK</dt><dd>SHIFT // RT (R2, ZR) // TUCK. LESS DRAG, MORE SPEED. HOLDING JUMP CROUCHES TOO.</dd>
      <dt>BRAKE</dt><dd>X OR Z // B OR LT // BRAKE. A SNOWPLOUGH; WITH THE STICK, A HOCKEY STOP.</dd>
      <dt>JUMP</dt><dd>HOLD SPACE // HOLD A: CROUCH AND CHARGE; LET GO TO POP. LET GO AT A KICKER'S LIP TO GO FURTHER.</dd>
      <dt>TRICKS</dt><dd>IN THE AIR: THE RIGHT STICK (OR THE ARROWS / THE PHONE'S STICK) SPINS LEFT AND RIGHT, FLIPS FORWARD AND BACK. LET GO NEAR A WHOLE TURN AND IT COMES ROUND. Q / E // LB / RB HOLD A GRAB. LAND WITH THE ROTATION FINISHED, THE GRAB LET GO, POINTING THE WAY YOU ARE GOING.</dd>
      <dt>RAILS</dt><dd>RIDE ONTO ONE FROM ITS RAMP, OR LAND ON IT, LINED UP. JUMP TO LEAVE.</dd>
      <dt>LIFTS</dt><dd>STOP IN THE LINE AT A LIFT'S FOOT (A SIGN SAYS WHICH). THE NEXT CHAIR TAKES YOU. HOLD JUMP TO RIDE FASTER.</dd>
      <dt>FLATS</dt><dd>PUSH THE STICK TO SKATE; UPHILL YOU WALK.</dd>
      <dt>MAP</dt><dd>M OR TAB // SELECT // MAP. TAP A PLACE YOU HAVE FOUND TO GO THERE; A FLAG STARTS ITS CHALLENGE.</dd>
      <dt>CHALLENGE</dt><dd>R // Y // RETRY: START THE CHALLENGE AT THE FLAG YOU STAND BY; IN ONE, START IT AGAIN.</dd>
      <dt>REPLAY</dt><dd>V // X: THE LAST HALF-MINUTE AGAIN. A FINISHED CHALLENGE REPLAYS WHOLE.</dd>
      <dt>PAUSE</dt><dd>ENTER / ESC // START</dd>
    </dl>
  );
}
export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = GLYPHS[family] || GLYPHS.generic;
    return [["STEER", "LEFT STICK"], ["TRICKS", "RIGHT STICK (IN THE AIR)"], ["JUMP", `HOLD ${g.act}, LET GO`], ["TUCK", g.run], ["BRAKE", `${g.back} / LT`], ["GRAB", `${g.turnL} / ${g.turnR}`], ["MAP", "SELECT"], ["RETRY", "Y (TOP)"], ["REPLAY", "X (LEFT)"], ["PAUSE", g.start]];
  }
  if (mode === "touch") return [["STEER", "THE STICK"], ["TRICKS", "THE STICK, IN THE AIR"], ["JUMP", "HOLD JUMP, LET GO"], ["TUCK", "TUCK"], ["BRAKE", "BRAKE"], ["GRAB", "GRAB"], ["MAP", "MAP"], ["RETRY", "RETRY"], ["PAUSE", "II"]];
  return [["STEER", "←↑↓→ / WASD"], ["TRICKS", "ARROWS, IN THE AIR"], ["JUMP", "HOLD SPACE, LET GO"], ["TUCK", "SHIFT"], ["BRAKE", "X / Z"], ["GRAB", "Q / E"], ["MAP", "M / TAB"], ["RETRY", "R"], ["REPLAY", "V"], ["PAUSE", "ENTER / ESC"]];
}
function Legend({ mode, family }) {
  return <dl className="sk-legend">{legendRows(mode, family).map(([k, v]) => <div key={k}><dt>{k}</dt><dd><kbd>{v}</kbd></dd></div>)}</dl>;
}

// ---- the game ---------------------------------------------------------------------------------------------
const SNAP_EVERY = 600, REPLAY_BACK = 1800;
const clone = (o) => JSON.parse(JSON.stringify(o));
function hourOf(time, h0, secs) {
  if (time === "day") return 12.5;
  if (time === "dusk") return 17.6;
  if (time === "night") return 19.5;
  return (h0 + secs / 360) % 24;
}
function Play({ start, board, time, caseId, prog, setProg, onQuit }) {
  const canvasRef = useRef(null), wrapRef = useRef(null), mapRef = useRef(null), inputRef = useRef(null), apiRef = useRef({});
  const [ready, setReady] = useState(0);
  const [hud, setHud] = useState(null);
  const [pop, setPop] = useState(null);
  const [sr, setSr] = useState("");
  const [menu, setMenu] = useState(null);   // null | "pause" | {end: res}
  const [mapOpen, setMapOpen] = useState(false);
  const [tapeOn, setTapeOn] = useState(Boolean(start.tape));
  const [muted, setMutedS] = useState(() => SFX.isMuted());
  const [mode, setMode] = useState(() => (COARSE() ? "touch" : "keys"));
  const [family, setFamily] = useState(null);
  const [size, setSize] = useState({ W: 320, H: 200, scale: 2 });
  const [filed, setFiled] = useState(null);
  const touch = mode === "touch";

  // the canvas: 320 logical pixels across, as tall as the space allows (portrait phones get a tall view)
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const w = el.clientWidth, h = Math.max(260, Math.min(window.innerHeight - (COARSE() ? 250 : 190), w * 1.5));
      const W = 320, H = Math.max(180, Math.min(440, Math.round((W * h) / w)));
      setSize({ W, H, scale: w / W });
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrapRef.current); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  useEffect(() => { let off = false; warmTiles((p) => !off && setReady(Math.max(0.01, p))).then(() => { if (!off) { mapBase(); setReady(1); } }); return () => { off = true; }; }, []);

  useEffect(() => {
    if (ready < 1) return;
    const reduced = REDUCED();
    const cfg = { board };
    const t0 = performance.now(), clk = machineClock(Date.now()), h0 = clk.hour + clk.minute / 60, mt0 = clk.mt, day = clk.day;
    const weather = weatherOn(day);
    const found = new Set(prog.found);
    let files = prog.files;
    const G = { st: null, words: [], snaps: [], tape: null, tapeI: 0, replay: null, permit: null, paused: false, ended: false, lastTrail: -2, hudKey: "", npcs: [], npcAt: 0, medals: Object.fromEntries(Object.entries(prog.medals).map(([k, v]) => [k, v.medal])) };
    const V = makeView();
    const input = createInput(); inputRef.current = input;
    const say = (s) => setSr(s);
    const persist = () => { const p = { ...loadProgress(), found: [...found], files, board }; saveProgress(p); setProg(p); };
    const begin = (st) => {
      G.st = st; G.words = []; G.snaps = [{ i: 0, snap: JSON.stringify(st) }]; G.ended = false; G.permit = null; setFiled(null);
      V.tracks.length = 0; V.px = null;
      if (st.ch && BOARDED.includes(st.ch.id) && caseId && !G.tape) startRun(caseId, st.ch.id).then(p => { if (G.st === st) G.permit = p; }).catch(() => {});
      if (st.ch) say(`${CHALLENGE[st.ch.id].name}. THREE, TWO, ONE.`);
    };
    // the tape: a saved run (a challenge's from its start; a free run from its snapshot)
    if (start.tape) { const r = start.tape; G.tape = rleDecode(r.inputLog); begin(r.snap ? JSON.parse(r.snap) : newGame({ board: r.board, ch: r.ch })); }
    else begin(start.ch ? newGame({ ...cfg, ch: start.ch }) : newGame({ ...cfg, at: start.at }));
    if (import.meta.env?.DEV && typeof window !== "undefined") window.__hviSki = G;   // for the browser checks
    const restartCh = () => { const id = G.st.ch?.id || G.lastCh; if (!id) return false; G.lastCh = id; begin(newGame({ ...cfg, ch: id })); setMenu(null); return true; };
    const startNear = () => { const C = challengeNear(G.st); if (!C || G.st.mode === "air") return false; found.add(`ch:${C.id}`); G.lastCh = C.id; begin(newGame({ ...cfg, ch: C.id })); return true; };
    const goTo = (id) => { const s = warp(cfg, id, found); if (!s) return false; if (s.ch) G.lastCh = s.ch.id; begin(s); setMapOpen(false); G.paused = false; setMenu(null); say(`TO ${id.startsWith("ch:") ? CHALLENGE[id.slice(3)].name : POI[id].name}.`); return true; };
    const instant = (whole = false) => {
      const now = G.words.length;
      let s0 = G.snaps[0];
      if (!whole) for (const s of G.snaps) if (now - s.i >= REPLAY_BACK * 0.5) s0 = s;
      G.replay = { st: JSON.parse(s0.snap), words: G.words.slice(s0.i), i: 0, V: makeView() };
      G.paused = true; setTapeOn(true); setMenu(null); say("THE REPLAY.");
    };
    const saveThis = () => {
      const s0 = G.st.ch ? G.snaps[0] : G.snaps.find(s => G.words.length - s.i <= REPLAY_BACK * 2) || G.snaps[0];
      const res = resultOf(G.st);
      const rec = G.st.ch && s0 === G.snaps[0] ? { v: VERSION, ch: G.st.ch.id, board, inputLog: rleEncode(G.words), res, at: Date.now(), name: CHALLENGE[G.st.ch.id].name } : { v: VERSION, snap: s0.snap, board, inputLog: rleEncode(G.words.slice(s0.i)), at: Date.now(), name: "A FREE RUN" };
      say(saveRun(rec) ? "RUN SAVED." : "THE BROWSER'S STORE IS FULL.");
    };
    apiRef.current = { restartCh, goTo, instant, saveThis, resume: () => { G.paused = false; setMenu(null); }, freeOn: () => { G.st.ch = null; G.ended = false; G.words = []; G.snaps = [{ i: 0, snap: JSON.stringify(G.st) }]; setMenu(null); G.paused = false; }, leaveCh: () => { G.st.ch = null; setMenu(null); G.paused = false; G.words = []; G.snaps = [{ i: 0, snap: JSON.stringify(G.st) }]; }, pause: () => { G.paused = true; setMenu("pause"); }, map: () => { G.paused = true; setMapOpen(true); }, closeMap: () => { setMapOpen(false); G.paused = false; }, found, files: () => files, st: () => G.st, medals: () => G.medals,
      stopReplay: () => { if (G.tape) { onQuit(); return; } G.replay = null; setTapeOn(false); if (!G.ended) G.paused = false; else setMenu({ end: resultOf(G.st) }); },
      file: async () => {
        const res = resultOf(G.st);
        if (!G.permit || !res || res.value == null) return;
        setFiled({ busy: true });
        try { const r = await fileRun(caseId, { runId: G.permit.runId, ch: res.id, board, inputLog: rleEncode(G.words), claim: { value: res.value } }); setFiled({ ok: r.filed }); say(`FILED. RANK ${r.filed?.rank ?? "?"}.`); }
        catch (e) { setFiled({ error: e.message }); }
      } };
    G.api = apiRef.current; G.V = V;
    const finish = (res) => {
      G.ended = true;
      if (G.tape) return;
      const rec = { v: VERSION, ch: res.id, board, inputLog: rleEncode(G.words) };
      let verified = false;
      try { const r = replay(rec); verified = r.res && r.res.value === res.value && r.res.medal === res.medal; } catch { verified = false; }
      const p = loadProgress(), f = fileResult(p, res);
      p.found = [...found]; p.files = files; saveProgress(p); setProg(p);
      G.medals = Object.fromEntries(Object.entries(p.medals).map(([k, v]) => [k, v.medal]));
      if (f.best && res.value != null) saveRun({ ...rec, res, at: Date.now(), name: `${CHALLENGE[res.id].name} (BEST)` });
      setTimeout(() => { G.paused = true; setMenu({ end: res, best: f.best, prev: f.prev, verified }); }, 1400);
    };
    const ctx = canvasRef.current.getContext("2d");
    let raf, last = performance.now(), acc = 0, lastMode = null, lastFam = null;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      const inp = input.sample();
      if (inp.mode !== lastMode) { lastMode = inp.mode; setMode(inp.mode); }
      if (inp.family !== lastFam) { lastFam = inp.family; setFamily(inp.family); }
      for (const m of inp.meta) {
        if (G.replay || G.tape) { if (m === "pause" || m === "replay") apiRef.current.stopReplay(); continue; }
        if (m === "pause") { if (G.paused) { if (!G.ended) { G.paused = false; setMenu(null); setMapOpen(false); } } else apiRef.current.pause(); }
        else if (m === "map" && !G.paused) apiRef.current.map();
        else if (m === "map" && G.paused) { setMapOpen(false); if (!G.ended) { G.paused = false; setMenu(null); } }
        else if (m === "retry") { if (G.st.ch) restartCh(); else if (!startNear()) { if (G.lastCh && G.ended) restartCh(); } G.paused = false; setMenu(null); }
        else if (m === "replay" && !G.paused) instant(false);
      }
      const secs = (now - t0) / 1000;
      let S = G.st, VV = V;
      if (G.replay) {
        S = G.replay.st; VV = G.replay.V;
        acc += dt;
        while (acc >= 1 / 60) { acc -= 1 / 60; if (G.replay.i < G.replay.words.length) { step(S, G.replay.words[G.replay.i++]); SFX.play(S.ev); } else { apiRef.current.stopReplay(); break; } }
      } else if (!G.paused) {
        acc += dt;
        let n = 0;
        while (acc >= 1 / 60 && n < 8) {
          acc -= 1 / 60; n++;
          let w;
          if (G.tape) { if (G.tapeI >= G.tape.length) { G.paused = true; setTimeout(onQuit, 1600); break; } w = G.tape[G.tapeI++]; }
          else { w = inp.word; G.words.push(w); }
          step(S, w);
          if (G.words.length % SNAP_EVERY === 0 && !G.tape) { G.snaps.push({ i: G.words.length, snap: JSON.stringify(S) }); if (G.snaps.length > 8) G.snaps.splice(1, 1); }
          SFX.play(S.ev);
          for (const e of S.ev) {
            if (e[0] === "found") { if (!found.has(e[1])) { found.add(e[1]); persist(); say(`FOUND: ${e[2]}.`); setPop({ t: now, text: `FOUND: ${e[2]}`, kind: "find" }); } }
            else if (e[0] === "file") { if (!(files & (1 << e[1]))) { files |= 1 << e[1]; persist(); let k = 0; for (const F of FILES) if (files & (1 << F.i)) k++; say(`LOST PROPERTY: ${e[2]}. ${k} OF ${FILES.length}.`); setPop({ t: now, text: `LOST PROPERTY ${k}/${FILES.length}: ${e[2]}`, kind: "find" }); } }
            else if (e[0] === "trick") { setPop({ t: now, text: `${e[1]} +${e[2]}`, kind: "trick" }); say(`${e[1]}. ${e[2]} POINTS.`); }
            else if (e[0] === "crash") { setPop({ t: now, text: e[1], kind: "crash" }); say(`${e[1]}.`); }
            else if (e[0] === "board") say(`ON ${e[1]}. HOLD JUMP TO RIDE FASTER.`);
            else if (e[0] === "unload") say(`AT THE TOP OF ${e[1]}.`);
            else if (e[0] === "queue") say(`IN THE LINE FOR ${e[1]}.`);
            else if (e[0] === "gate") { if (e[1] === e[2] || e[1] % 3 === 0) say(`GATE ${e[1]} OF ${e[2]}.`); }
            else if (e[0] === "miss") { setPop({ t: now, text: `MISSED GATE ${e[1]} +3 S`, kind: "crash" }); say(`MISSED GATE ${e[1]}. THREE SECONDS.`); }
            else if (e[0] === "checkpoint") say(`CHECKPOINT ${e[1]} OF ${e[2]}.`);
            else if (e[0] === "go") say("GO.");
            else if (e[0] === "finish") { const r = e[1]; say(r.why ? `${r.why}.` : `FINISHED. ${fmtValue(CHALLENGE[r.id], r.value)}. ${MEDAL_NAME[r.medal]}.`); if (!G.ended) finish(r); }
          }
        }
        if (n === 8) acc = 0;
      } else acc = 0;
      // the people on the mountain (every tenth frame)
      if (now - G.npcAt > 160) { G.npcAt = now; try { G.npcs = npcsAt(mt0 + (secs * PACE) / 3600); } catch { G.npcs = []; } }
      advance(VV, S, reduced);
      const hour = hourOf(time, h0, secs);
      draw(ctx, canvasRef.current.width, canvasRef.current.height, S, VV, { hour, weather: time === "city" ? weather : "CLEAR", reduced, npcs: G.npcs, files, medals: G.medals, time: secs, lightsOn: time === "city" ? lightsOn(mt0 + secs / 360) || hour >= 16.5 || hour < 7 : time !== "day" });
      // the sound bed
      const sp = Math.hypot(S.vx, S.vy, S.vz);
      SFX.bed(G.paused && !G.replay ? 0 : sp, S.slip || 0, S.mode === "ski");
      // the HUD (when it changes)
      const R = S.run >= 0 ? RUNS[S.run] : null, C = S.ch ? CHALLENGE[S.ch.id] : null, near = !S.ch && S.mode === "ski" ? challengeNear(S) : null;
      const shop = Math.abs((SHOP.x0 + SHOP.x1) / 2 - S.x) < 60 && Math.abs((SHOP.y0 + SHOP.y1) / 2 - S.y) < 50;
      const chs = C ? chalLine(S, C) : null;
      const liftL = S.mode === "lift" ? LIFT_W[S.lift.id] : null;
      const h = { kmh: speedKmh(S), trail: R ? `${RATE_MARK[R.rating]} ${R.name}` : S.mode === "lift" ? "" : "OFF-PISTE", rating: R?.rating || null, ch: chs, count: S.ch?.ph === "count" ? Math.ceil(S.ch.n / 60) : 0, near: near ? near.name : null, shop, lift: liftL ? (S.lift.ph === "wait" ? `IN THE LINE: ${liftL.name} // ${Math.ceil(S.lift.n / 60)} S` : `${liftL.name} // ${Math.max(0, Math.ceil((liftRideTicks(liftL) - S.lift.k) / 60 / (S.ff ? 6 : 1)))} S TO THE TOP${S.ff ? " (FASTER)" : " // HOLD JUMP: FASTER"}`) : null, score: S.score, replay: Boolean(G.replay || G.tape), mode: S.mode };
      const key = JSON.stringify(h);
      if (key !== G.hudKey) { G.hudKey = key; setHud(h); }
      if (S.run !== G.lastTrail && S.mode === "ski" && R) { G.lastTrail = S.run; say(`${R.name}. ${RATE_WORD[R.rating]}.`); }
      if (mapRef.current && G.paused && mapRef.current.isConnected) mapRef.current.dataset.t = String(secs);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => { if (document.hidden && !G.paused && !G.tape) apiRef.current.pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); SFX.bed(0, 0, false); };
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  const api = apiRef.current;
  const toggleMute = () => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); };
  const legend = <Legend mode={mode} family={family} />;
  const inCh = Boolean(hud?.ch);
  const popOn = pop && performance.now() - pop.t < 2200;
  return (
    <div className="sk-play">
      <div className="sk-stage" ref={wrapRef}>
        <canvas ref={canvasRef} width={size.W} height={size.H} style={{ width: "100%", height: size.H * size.scale }} role="img" aria-label={`The mountain: ${hud?.trail || "the slopes"}, ${hud?.kmh ?? 0} kilometres an hour`} />
        {ready < 1 && <div className="sk-load">SURVEYING THE MOUNTAIN... {Math.round(ready * 100)}%</div>}
        {hud && (
          <div className="sk-hud" aria-hidden="true">
            <div className="sk-tl"><b>{hud.kmh}</b> KM/H{hud.trail && <span className={`sk-trail r-${hud.rating || "off"}`}>{hud.trail}</span>}</div>
            {hud.ch && <div className="sk-tr"><span>{hud.ch.name}</span><b>{hud.ch.big}</b>{hud.ch.sub && <small>{hud.ch.sub}</small>}</div>}
            {hud.count > 0 && <div className="sk-count">{hud.count}</div>}
            {popOn && <div className={`sk-pop ${pop.kind}`} key={pop.t}>{pop.text}</div>}
            {hud.lift && <div className="sk-bottom">{hud.lift}</div>}
            {!hud.lift && hud.near && <div className="sk-bottom">{mode === "pad" ? "Y" : mode === "touch" ? "RETRY" : "R"}: START {hud.near}</div>}
            {!hud.lift && !hud.near && hud.shop && <div className="sk-bottom">SHAUN WHITE // BOARDS AND SKIS. NOTHING ON SALE YET. THE SHELVES ARE BEING APPROVED.</div>}
            {hud.replay && <div className="sk-tape">REPLAY</div>}
          </div>
        )}
        {tapeOn && <button type="button" className="sk-stoptape" onClick={() => api.stopReplay?.()}>STOP THE REPLAY</button>}
        {mapOpen && <MapOverlay ref={mapRef} api={api} onClose={() => api.closeMap?.()} />}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{sr}</div>
      {touch && !tapeOn && <TouchPad input={inputRef} />}
      <ButtonRow>
        <Button onClick={() => api.pause?.()}>Pause</Button>
        <Button onClick={() => api.map?.()}>Map</Button>
        {inCh ? <Button onClick={() => api.restartCh?.()}>Retry</Button> : <Button onClick={() => inputRef.current?.push("retry")}>Start challenge</Button>}
        <Button onClick={() => api.instant?.()}>Replay</Button>
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        <Button variant="back" onClick={onQuit}>Leave the mountain</Button>
      </ButtonRow>
      {!touch && <details className="pg-more sk-legend-wrap"><summary>CONTROLS // {mode === "pad" ? `CONTROLLER (${String(family || "pad").toUpperCase()})` : "KEYBOARD"}</summary><div className="pg-more-body">{legend}</div></details>}
      <p className="sk-small">{NOTICE}</p>
      {menu === "pause" && (
        <GameMenu kind="pause" title="PAUSED." summary="THE MOUNTAIN WAITS. THE LIFTS DO NOT, BUT THEY WILL FOR YOU." onBack={() => api.resume?.()}
          options={{ resume: () => api.resume?.(), restart: inCh ? { label: "RETRY CHALLENGE", onSelect: () => api.restartCh?.() } : null, map: { label: "FAST TRAVEL (THE MAP)", onSelect: () => { setMenu(null); api.map?.(); } }, replay: { label: "INSTANT REPLAY", onSelect: () => api.instant?.() }, save: { label: "SAVE THIS RUN", onSelect: () => { api.saveThis?.(); } }, leave: inCh ? { label: "LEAVE THE CHALLENGE", onSelect: () => api.leaveCh?.() } : null, controls: legend, sound: { on: !muted, onSelect: toggleMute }, quit: { label: "LEAVE THE MOUNTAIN", onSelect: onQuit } }} />
      )}
      {menu && menu.end !== undefined && !tapeOn && (
        <EndMenu key={`end${menu.end?.ticks}`} m={menu} api={api} caseId={caseId} filed={filed} onQuit={onQuit} />
      )}
    </div>
  );
}
function chalLine(S, C) {
  const ch = S.ch, secs = ch.tc / 60;
  const t = `${secs.toFixed(1)} S`;
  if (ch.ph === "done" && ch.res) return { name: C.name, big: ch.res.why || fmtValue(C, ch.res.value), sub: ch.res.why ? "" : MEDAL_NAME[ch.res.medal] };
  switch (C.kind) {
    case "gates": case "race": return { name: C.name, big: t, sub: `GATE ${ch.gi} // MISSED ${ch.miss}` };
    case "trial": return { name: C.name, big: t, sub: `CHECKPOINTS ${[0, 1, 2].filter(i => ch.cp & (1 << i)).length}/3` };
    case "descent": return { name: C.name, big: t, sub: "TO THE BASE, ANY WAY DOWN" };
    case "score": return { name: C.name, big: `${ch.score} PTS`, sub: t };
    case "pipe": return { name: C.name, big: `${ch.score} PTS`, sub: `${Math.max(0, (PIPE_LIMIT - ch.tc) / 60).toFixed(0)} S LEFT` };
    case "jump": return { name: C.name, big: "HOLD JUMP, LET GO AT THE LIP", sub: "" };
    case "follow": return { name: C.name, big: `${ch.tc ? Math.round((ch.inT / ch.tc) * 100) : 100}%`, sub: "WITHIN 26 M OF THE INSTRUCTOR" };
    case "skim": return { name: C.name, big: `${(S.skim || ch.dist || 0).toFixed(0)} M`, sub: "FASTER THAN 27 KM/H OR THE POOL TAKES YOU" };
    default: return { name: C.name, big: t, sub: "" };
  }
}
function EndMenu({ m, api, caseId, filed, onQuit }) {
  const res = m.end, C = CHALLENGE[res.id];
  const title = res.why ? `${res.why}.` : `${MEDAL_NAME[res.medal]}. ${fmtValue(C, res.value)}.`;
  const race = res.id === "race" && res.value != null ? ` YOUR TIME ${res.time?.toFixed(2)} S; THE FIELD'S WINNER ${fieldTimes().sort((a, b) => a.t - b.t)[0].name} IN ${fieldTimes().sort((a, b) => a.t - b.t)[0].t.toFixed(2)} S.` : "";
  const next = res.why ? "" : res.medal < 3 ? ` ${MEDAL_NAME[res.medal + 1]} AT ${fmtValue(C, C.medals[res.medal])}.` : " THE DEPARTMENT HAS NO HIGHER MEDAL.";
  const summary = `${C.name}.${race}${next} ${m.best ? "A PERSONAL BEST, KEPT." : m.prev != null ? `YOUR BEST: ${fmtValue(C, m.prev)}.` : ""} ${m.verified ? "RE-RUN FROM THE INPUT LOG: THE SAME." : res.why ? "" : "THE RE-RUN DISAGREED."}`;
  const canFile = BOARDED.includes(res.id) && caseId && res.value != null && !filed?.ok;
  return (
    <GameMenu kind="end" title={title} summary={`${summary}${filed?.ok ? ` FILED TO THE BOARD: RANK ${filed.ok.rank}.` : filed?.error ? ` ${filed.error}` : ""}`}
      onBack={() => api.freeOn?.()}
      options={{ again: { label: "RETRY (ONE PRESS: R / Y)", onSelect: () => api.restartCh?.() }, replay: { label: "WATCH THE REPLAY", onSelect: () => api.instant?.(true) }, file: canFile ? { label: filed?.busy ? "FILING..." : "FILE TO THE VERIFIED BOARD", onSelect: () => api.file?.() } : null, free: { label: "SKI ON FROM HERE", onSelect: () => api.freeOn?.() }, map: { label: "FAST TRAVEL (THE MAP)", onSelect: () => { api.freeOn?.(); api.map?.(); } }, play: { label: "LEAVE THE MOUNTAIN", onSelect: onQuit } }} />
  );
}

// ---- the map ----------------------------------------------------------------------------------------------
const MapOverlay = forwardRef(function MapOverlay({ api, onClose }, ref) {
  const cv = useRef(null), [focus, setFocus] = useState(null), [list, setList] = useState([]);
  const found = api.found || new Set();
  useEffect(() => {
    let raf;
    const paint = () => {
      raf = requestAnimationFrame(paint);
      const c = cv.current; if (!c) return;
      const W = c.width, H = c.height, f = fitMap(W, H), st = api.st?.();
      const ms = drawMap(c.getContext("2d"), W, H, { found, files: api.files?.() || 0, you: st ? { x: st.x, y: st.y } : null, medals: Object.fromEntries(Object.entries(api.medals?.() || {}).map(([k, v]) => [k, { medal: v }])), focus, ...f, time: performance.now() / 1000 });
      if (ms.length !== list.length) setList(ms);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  });
  const pick = (e) => {
    const c = cv.current, r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * c.width, y = ((e.clientY - r.top) / r.height) * c.height;
    const f = fitMap(c.width, c.height);
    let best = null, bd = 18;
    for (const m of list) {
      const [px, py] = mapXY(m, f);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return;
    if (focus === best.id) api.goTo?.(best.id); else setFocus(best.id);
  };
  const groups = [["challenge", "CHALLENGES"], ["top", "LIFT TOPS"], ["lift", "LIFT LINES"], ["lodge", "LODGES"], ["base", "THE BASE"], ["trail", "TRAIL HEADS"], ["peak", "PEAKS"], ["water", "WATER"]];
  return (
    <div className="sk-map" role="dialog" aria-modal="true" aria-label="The trail map: fast travel" ref={ref} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "m" || e.key === "M") { e.stopPropagation(); onClose(); } }}>
      <div className="sk-map-head"><b>THE TRAIL MAP</b><span>TAP A PLACE YOU HAVE FOUND, TAP AGAIN TO GO. FLAGS START THEIR CHALLENGE.</span><button type="button" className="sk-chip" onClick={onClose} autoFocus>CLOSE (M)</button></div>
      <canvas ref={cv} width={460} height={420} onClick={pick} className="sk-map-cv" aria-hidden="true" />
      <div className="sk-map-list">
        {groups.map(([k, name]) => { const ms = list.filter(m => m.kind === k); if (!ms.length) return null; return (
          <div key={k}><p className="sk-small">{name}</p><div className="sk-chips">{ms.map(m => <button key={m.id} type="button" className={`sk-chip${focus === m.id ? " on" : ""}`} onClick={() => api.goTo?.(m.id)} onFocus={() => setFocus(m.id)}>{m.name}</button>)}</div></div>
        ); })}
        <p className="sk-small">{list.length} PLACES FOUND. THE REST ARE OUT THERE: SKI PAST THEM TO ADD THEM.</p>
      </div>
    </div>
  );
});
function mapXY(m, f) { const [mx, my] = toMap(m.x, m.y); return [f.ox + mx * f.scale, f.oy + my * f.scale]; }

// ---- the phone's controls: a stick (steer; in the air, tricks) and four buttons ----------------------------------
function TouchPad({ input }) {
  const st = useRef({ id: null, x0: 0, y0: 0 }), [knob, setKnob] = useState([0, 0]);
  const set = (t) => input.current?.setTouch(t);
  const move = (e) => {
    if (st.current.id !== e.pointerId) return;
    const dx = e.clientX - st.current.x0, dy = e.clientY - st.current.y0, m = Math.hypot(dx, dy), R = 46, k = Math.min(1, m / R);
    const lx = m ? (dx / m) * k : 0, ly = m ? (dy / m) * k : 0;
    setKnob([lx * R, ly * R]); set({ lx, ly });
  };
  const end = () => { st.current.id = null; setKnob([0, 0]); set({ lx: 0, ly: 0 }); };
  const hold = (k) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); SFX.unlock(); set({ [k]: true }); },
    onPointerUp: () => set({ [k]: false }), onPointerCancel: () => set({ [k]: false }), onPointerLeave: () => set({ [k]: false }),
  });
  return (
    <div className="sk-touch">
      <div className="sk-stick" role="group" aria-label="Steering stick"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); st.current = { id: e.pointerId, x0: r.left + r.width / 2, y0: r.top + r.height / 2 }; SFX.unlock(); move(e); }}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <span className="sk-knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
      </div>
      <div className="sk-tbtns">
        <button type="button" className="sk-tb grab" {...hold("gl")}>GRAB</button>
        <button type="button" className="sk-tb brake" {...hold("brake")}>BRAKE</button>
        <button type="button" className="sk-tb tuck" {...hold("tuck")}>TUCK</button>
        <button type="button" className="sk-tb jump" {...hold("a")}>JUMP</button>
      </div>
    </div>
  );
}
