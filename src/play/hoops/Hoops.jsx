import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { readPad, GLYPHS } from "../../city/gamepad.js";
import { newGame, step, rleEncode, rleDecode, resultOf, replay, VERSION, BTN, FORMATS, dirOf } from "./sim.js";
import { TEAM_IDS, teamName, teamShort, kitsFor, FALLBACK, loadLeague, sortFive, teamRating, teamOfCase, citizenKeyOf, playNowPair, shownName, HINTS, CROPS } from "./roster.js";
import { draw, camFollow, headOf, skinOf, shade, W, H } from "./render.js";
import { callFor, crowdFor } from "./calls.js";
import { createInput } from "./input.js";
import * as SFX from "./audio.js";
import CSS from "./hoops.css?inline";
import "../pages.css";

// #hoops[?home=<district>][&vs=<district>][&fmt=to21][&shot=14]: THE COURTS, playable basketball
// (docs/CITY_SPEC.md "PLAYABLE SPORTS", Basketball). Phase 1: exhibitions only. Nothing here reaches
// the league, the Cup or a file: the game is kept in this browser (its seed, its rosters and its
// input log, enough to play it again) and re-run once at the buzzer to show it reproduces.

function injectStyles() {
  let el = document.getElementById("hp-styles");
  if (!el) { el = document.createElement("style"); el.id = "hp-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const id = (k) => (TEAM_IDS.includes(q.get(k)) ? q.get(k) : null);
  return { home: id("home"), vs: id("vs"), fmt: q.get("fmt") === "to21" ? "to21" : "quarters", shot: q.get("shot") === "14" ? 14 : 24 };
};
const KEEP = "hvi-hoops-exhibitions", KEEP_N = 5, ASSIST_KEY = "hvi-hoops-easy", LEGEND_KEY = "hvi-hoops-legend";
export function loadRecords() { try { const j = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
function saveRecord(rec) { try { localStorage.setItem(KEEP, JSON.stringify([rec, ...loadRecords()].slice(0, KEEP_N))); } catch { /* a full or private store: the game stays in the tab */ } }
const readFlag = (k, dflt) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === "1"; } catch { return dflt; } };
const writeFlag = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* the tab remembers */ } };
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const NOTICE = "THIS GAME DOES NOT COUNT. THE LEAGUE TABLE IS NOT INFORMED.";
function seedNow() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch { return (Date.now() >>> 0) || 1; } }

function useMe() {
  return useMemo(() => {
    const caseId = readCaseId(), last = readLastResult(), av = last?.avatar || null;
    return { caseId, name: caseId ? `SUBJECT ${caseId.slice(-4).toUpperCase()}` : "SUBJECT", spec: av?.kind === "procedural" ? av.spec : null, url: av?.kind === "sprite" ? av.url : null };
  }, []);
}
// The five a game plays: best first, names for the board, you as yourself.
function fiveOf(league, id, me) {
  const mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  return sortFive(league.teams[id]).map(([k, n, r]) => [k, k === mine ? me.name : shownName(n), r]);
}

export default function Hoops({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const me = useMe();
  const [league, setLeague] = useState(FALLBACK);
  useEffect(() => { let off = false; loadLeague().then(lg => { if (lg && !off) setLeague(lg); }).catch(() => {}); return () => { off = true; }; }, []);
  const [fmt, setFmt] = useState(opts.fmt);
  const [shot, setShot] = useState(opts.shot);
  const [assist, setAssist] = useState(() => readFlag(ASSIST_KEY, loadRecords().length === 0));
  const [game, setGame] = useState(null);   // {seed, n, home, away, cfg}
  const [done, setDone] = useState(null);
  const [tape, setTape] = useState(null);
  const mine = teamOfCase(league, me.caseId);
  const start = (home, away, f = fmt, s = shot) => {
    SFX.unlock();
    const cfg = { fmt: f, shot: s, assist, home: fiveOf(league, home, me), away: fiveOf(league, away, me) };
    setDone(null); setTape(null);
    setGame({ seed: seedNow(), n: Date.now(), home, away, cfg });
  };
  const toggleAssist = () => setAssist(v => { writeFlag(ASSIST_KEY, !v); return !v; });
  let body;
  if (tape) body = <Match key={`tape${tape.rec.at}`} game={tape.game} me={me} tape={tape.rec} onDone={() => setTape(null)} onQuit={() => setTape(null)} />;
  else if (game && !done) body = <Match key={game.n} game={game} me={me} onDone={setDone} onQuit={() => setGame(null)} />;
  else if (done) body = <Done done={done} game={game} onAgain={() => start(game.home, game.away, game.cfg.fmt, game.cfg.shot)} onTape={() => setTape({ rec: done.rec, game })} onPick={() => { setDone(null); setGame(null); }} />;
  else body = <Picker league={league} me={me} mine={mine} pre={opts} fmt={fmt} setFmt={setFmt} shot={shot} setShot={setShot} assist={assist} toggleAssist={toggleAssist} onStart={start} />;
  return (
    <div className="hp">
      <ScreenHead title="THE COURTS" meta="BASKETBALL // EXHIBITION // FIVE ON FIVE. PICKUP PERMITTED. EVERYTHING IS RECORDED." />
      {body}
    </div>
  );
}

// ---- choosing ------------------------------------------------------------------------------------
function Picker({ league, me, mine, pre, fmt, setFmt, shot, setShot, assist, toggleAssist, onStart }) {
  const [home0, away0] = playNowPair(league, mine);
  const [home, setHome] = useState(pre.home || home0);
  useEffect(() => { if (!pre.home) setHome(mine || home0); }, [mine, home0]);   // eslint-disable-line react-hooks/exhaustive-deps
  const away = pre.vs && pre.vs !== home ? pre.vs : playNowPair(league, home)[1];
  const playRef = useRef(null);
  const quick = () => onStart(home, away);
  useEffect(() => { playRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) quick(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const len = fmt === "to21" ? "FIRST TO 21" : "FOUR 2-MINUTE QUARTERS";
  return (
    <>
      <p className="pg-lede">BASKETBALL, FIVE ON FIVE, WITH THE CITY'S OWN LEAGUE TEAMS. YOU STEER THE MAN WITH THE BALL, AND ON DEFENCE THE MAN NEAREST IT. ARROWS MOVE, Z SHOOTS (HOLD IT, LET GO AT THE TOP OF THE JUMP), X PASSES, C SWITCHES. A CONTROLLER WORKS; PHONES GET A PAD.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={quick}>PLAY NOW</Button>
        <span className="pg-sub">{teamName(home)}{home === mine ? " (YOUR TEAM)" : ""} V {teamName(away)}. {len}, {shot}-SECOND CLOCK.</span>
      </div>
      <p className="hp-you">
        <button type="button" className="pg-toggle" aria-pressed={assist} onClick={toggleAssist}>EASY MODE</button>
        <span>{assist ? "A WIDER SHOT WINDOW, SOFTER CPU HANDS, YOUR MAN GUARDS FOR YOU WHEN YOU LET GO." : "THE CPU PLAYS AS RATED."}</span>
      </p>
      {mine ? <p className="hp-you">YOU ARE ON THE {teamName(mine)} THIS SEASON. YOU PLAY AS YOURSELF, AT YOUR RATING.</p>
        : me.caseId ? <p className="hp-you hp-dim">YOUR FILE IS NOT ON A BASKETBALL ROSTER THIS SEASON. ENTRIES ARE MADE FROM <a href="#file">MY FILE</a>.</p> : null}
      <details className="pg-more">
        <summary>CHOOSE TEAMS, GAME LENGTH AND SHOT CLOCK</summary>
        <div className="pg-more-body">
          <div className="hp-chips" role="radiogroup" aria-label="Game length">
            {Object.values(FORMATS).map(f => <button key={f.id} type="button" role="radio" aria-checked={fmt === f.id} className={`hp-chip${fmt === f.id ? " on" : ""}`} onClick={() => setFmt(f.id)}>{f.name}</button>)}
          </div>
          <div className="hp-chips" role="radiogroup" aria-label="Shot clock">
            {[24, 14].map(s => <button key={s} type="button" role="radio" aria-checked={shot === s} className={`hp-chip${shot === s ? " on" : ""}`} onClick={() => setShot(s)}>{s}-SECOND SHOT CLOCK</button>)}
          </div>
          <p className="hp-small">YOUR TEAM:</p>
          <div className="hp-chips" role="radiogroup" aria-label="Your team">
            {TEAM_IDS.map(id => <button key={id} type="button" role="radio" aria-checked={home === id} className={`hp-chip${home === id ? " on" : ""}`} onClick={() => setHome(id)}>{teamShort(id)}{id === mine ? " (YOURS)" : ""}</button>)}
          </div>
          <p className="hp-small">THEN PICK WHO TO PLAY; THE GAME STARTS AT ONCE. SPEED, TOUCH AND DEFENCE FOLLOW EACH PLAYER'S LEAGUE RATING.</p>
          <ul className="hp-teams">
            {TEAM_IDS.filter(id => id !== home).map(id => {
              const five = sortFive(league.teams[id]);
              return (
                <li key={id}>
                  <button type="button" className="hp-team" onClick={() => onStart(home, id)} aria-label={`Play ${teamName(id)}, rated ${teamRating(five)}`}>
                    <i className="sw" style={{ background: kitsFor(home, id)[1][0], borderColor: kitsFor(home, id)[1][1] }} aria-hidden="true" />
                    <span className="nm">{teamName(id)}<span className="tag">{five.slice(0, 3).map(r => shownName(r[1])).join(", ")}{league.pos[id] ? ` // ${ordinal(league.pos[id])} IN THE LEAGUE` : ""}</span></span>
                    <span className="rt">{teamRating(five)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </details>
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><Controls /></div>
      </details>
      <p className="hp-notice"><b>EXHIBITION.</b> {NOTICE} NOT IN THE STANDINGS, NOT IN THE CUP, NOT ON YOUR FILE. THE DEPARTMENT KEEPS THE TAPE ANYWAY.</p>
      <p className="hp-small">ROSTERS: SEASON {league.season || "?"}, MACHINE DAY {league.day}{league.live ? ", AS DRAFTED" : ". THE LIVE LEAGUE DID NOT ANSWER; THESE ARE THE ROSTERS ON FILE"}.</p>
    </>
  );
}
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;

function Controls() {
  return (
    <dl className="hp-keys">
      <dt>MOVE</dt><dd>ARROWS / WASD // STICK OR D-PAD // THE ROUND PAD ON A PHONE</dd>
      <dt>SHOOT</dt><dd>Z, J OR SPACE // PAD A. HOLD TO GO UP, LET GO AT THE TOP OF THE JUMP: THE METER BESIDE YOU LIGHTS GREEN THERE. NEAR THE RIM IT IS A LAYUP; A PLAYER RATED 75 OR MORE DUNKS.</dd>
      <dt>PASS</dt><dd>X OR K // PAD B. TO THE TEAMMATE YOUR ARROWS POINT AT; THE NEAREST WHEN YOU HOLD NONE.</dd>
      <dt>DEFENCE</dt><dd>Z JUMPS (A BLOCK, A REBOUND). X REACHES FOR A STEAL. YOU TAKE THE DEFENDER NEAREST THE BALL WHEN IT CHANGES HANDS.</dd>
      <dt>SWITCH</dt><dd>C OR L // A BUMPER: TAKE THE TEAMMATE NEAREST THE BALL.</dd>
      <dt>RULES</dt><dd>TWO POINTS INSIDE THE ARC, THREE OUTSIDE IT. THE SHOT CLOCK SITS ON THE BACKBOARD; LET IT RUN OUT AND THE BALL GOES OVER. STEP OVER A LINE WITH THE BALL AND IT GOES OVER. NO FOULS, NO FREE THROWS (YET).</dd>
      <dt>PAUSE</dt><dd>ENTER / ESC // START</dd>
    </dl>
  );
}

export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = GLYPHS[family] || GLYPHS.generic;
    return [["MOVE", "STICK / D-PAD", ""], ["SHOOT", `HOLD ${g.act}`, "LET GO AT THE TOP OF THE JUMP."], ["PASS", g.back, "TOWARD THE STICK."], ["JUMP", `${g.act} ON DEFENCE`, ""], ["STEAL", `${g.back} ON DEFENCE`, ""], ["SWITCH", `${g.turnL} / ${g.turnR}`, ""], ["PAUSE", g.start, ""]];
  }
  if (mode === "touch") return [["MOVE", "THE ROUND PAD", ""], ["SHOOT", "HOLD SHOOT", "LET GO AT THE TOP OF THE JUMP."], ["PASS", "PASS", "TOWARD THE PAD."], ["JUMP", "JUMP ON DEFENCE", ""], ["STEAL", "STEAL ON DEFENCE", ""], ["SWITCH", "SWITCH", ""], ["PAUSE", "START", ""]];
  return [["MOVE", "←↑↓→ / WASD", ""], ["SHOOT", "HOLD Z / J / SPACE", "LET GO AT THE TOP OF THE JUMP."], ["PASS", "X / K", "TOWARD THE ARROW YOU HOLD."], ["JUMP", "Z ON DEFENCE", ""], ["STEAL", "X ON DEFENCE", ""], ["SWITCH", "C / L", ""], ["PAUSE", "ENTER / ESC", ""]];
}
function Legend({ mode, family, open, onToggle, compact = false }) {
  const rows = legendRows(mode, family), label = mode === "pad" ? `CONTROLLER (${String(family || "pad").toUpperCase()})` : mode === "touch" ? "TOUCH" : "KEYBOARD";
  if (compact) return <dl className="hp-legend-mini">{rows.map(([k, keys]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl>;
  return (
    <section className="hp-legend" aria-label="Controls">
      <button type="button" className="hp-legend-head" aria-expanded={open} onClick={onToggle}><span>CONTROLS // {label}</span><span aria-hidden="true">{open ? "HIDE ▴" : "SHOW ▾"}</span></button>
      {open && <dl className="hp-legend-rows">{rows.map(([k, keys, hint]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd>{hint && <span>{hint}</span>}</dd></div>)}</dl>}
    </section>
  );
}

// ---- how everyone looks -------------------------------------------------------------------------------
const NUMS = [1, 3, 5, 7, 9];
function looksFor(cfg, home, away, me) {
  const kits = kitsFor(home, away), mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  const rows = [...cfg.home, ...cfg.away];
  return rows.map((row, g) => {
    const kit = kits[g < 5 ? 0 : 1], key = row[0];
    const look = { jersey: kit[0], trim: kit[1], skin: "#c68c5e", hair: null, head: null, num: NUMS[g % 5] };
    const isMe = key === mine;
    const sheetP = isMe ? (me.url ? loadSprite(me.url, { sector: null }).catch(() => null) : Promise.resolve(null))
      : key.startsWith("citizen-") || key.startsWith("stand-in") ? Promise.resolve(null)
        : loadSprite(`/api/sprite/${key}`, { sector: null }).catch(() => null);
    sheetP.then(sheet => {
      const spec = isMe && me.spec ? me.spec : { ...DEFAULT_SPEC, ...(HINTS[key] || {}) };
      const s = sheet || paintAvatar(spec, 1);
      const hd = headOf(s, sheet ? CROPS[key] || null : null);
      if (hd) { look.head = hd; look.skin = skinOf(hd) || look.skin; }
    });
    return look;
  });
}

// ---- the game ------------------------------------------------------------------------------------
// The home side's paint: the darker of its two colours, darker still.
const lumOf = (h) => { const n = parseInt(h.slice(1), 16); return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
const paintOf = (kit) => shade(lumOf(kit[0]) < lumOf(kit[1]) ? kit[0] : kit[1], 0.62);
const clockOf = (f) => { const s = Math.max(0, Math.ceil(f / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function Match({ game, me, tape = null, onDone, onQuit }) {
  const { cfg, home, away, seed } = game;
  const canvasRef = useRef(null), wrapRef = useRef(null), inputRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [call, setCall] = useState("");
  const [sr, setSr] = useState("");
  const [paused, setPaused] = useState(false);
  const [muted, setMutedS] = useState(() => SFX.isMuted());
  const [scale, setScale] = useState(1);
  const [pad, setPad] = useState(null);
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches));
  const [legendOpen, setLegendOpen] = useState(() => readFlag(LEGEND_KEY, !touch));
  const [skipping, setSkipping] = useState(false);
  const pausedRef = useRef(false), mutedRef = useRef(muted), skipRef = useRef(false);
  mutedRef.current = muted;
  const togglePause = (v) => { pausedRef.current = v ?? !pausedRef.current; setPaused(pausedRef.current); };
  const teams = [teamName(home), teamName(away)], shorts = [teamShort(home), teamShort(away)];
  const mode = pad ? "pad" : touch ? "touch" : "keys";

  useEffect(() => { const f = () => setTouch(true); window.addEventListener("touchstart", f, { once: true, passive: true }); return () => window.removeEventListener("touchstart", f); }, []);
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = Math.max(240, window.innerHeight - 230);
      setScale(Math.max(1, Math.floor(Math.min(w / W, h / H) * dpr)) / dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrapRef.current); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  useEffect(() => {
    const st = newGame(seed, cfg), log = [], masks = tape ? rleDecode(tape.inputLog) : null;
    if (import.meta.env?.DEV && typeof window !== "undefined") window.__hviHoops = st;   // for the browser checks
    let ti = 0;
    const input = createInput(); inputRef.current = input;
    const looks = looksFor(cfg, home, away, me);
    const names = [...cfg.home, ...cfg.away].map(r => r[1]);
    const reduced = REDUCED();
    const fx = { mood: "idle", t: 0, dunk: null, shake: 0, paint: paintOf(kitsFor(home, away)[0]) };
    const ctx = canvasRef.current.getContext("2d");
    let raf, last = performance.now(), acc = 0, hudKey = "", ended = false, cam = 0, scoreKey = "0-0", noteSeen = -1;
    const onVis = () => { if (document.hidden && !tape) togglePause(true); };
    document.addEventListener("visibilitychange", onVis);
    const finish = () => {
      ended = true;
      if (tape) { setTimeout(() => onDone(null), 1500); return; }
      const rec = { version: VERSION, seed, cfg, home, away, inputLog: rleEncode(log), result: resultOf(st), at: Date.now() };
      let verified = false;
      try { verified = JSON.stringify(replay(rec)) === JSON.stringify(rec.result); } catch { verified = false; }
      saveRecord(rec);
      setTimeout(() => onDone({ rec, verified }), 2200);
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      const inp = input.sample();
      if (inp.pad !== undefined) setPad(p => (p === inp.pad ? p : inp.pad));
      if (inp.start && !ended) togglePause();
      if (!pausedRef.current) {
        acc += dt;
        let n = 0;
        const per = tape ? (skipRef.current ? 240 : 2) : 1;
        while (acc >= 1 / 60 && n < 8) {
          acc -= 1 / 60; n++;
          for (let k = 0; k < per && !ended; k++) {
            const m = tape ? (masks[ti++] ?? 0) : inp.mask;
            if (!tape) log.push(m);
            step(st, m);
            if (!tape || !skipRef.current) SFX.play(st.ev, mutedRef.current);
            const N = st.note;
            if (N && N.frame === st.frame && N.frame !== noteSeen) {
              noteSeen = N.frame;
              const line = callFor(N, names, teams, N.frame);
              if (line) setCall(line);
              const mood = crowdFor(N.k);
              if (mood) { fx.mood = mood; fx.t = 0; if (!skipRef.current) SFX.crowd(mood, mutedRef.current); }
              if (N.k === "dunk") { fx.dunk = { side: dirOf(N.team), age: 0 }; fx.shake = 10; }
            }
            if (st.phase === "over") finish();
          }
        }
      } else acc = 0;
      cam = camFollow(cam, st);
      fx.t++; if (fx.t > 140) fx.mood = "idle";
      if (fx.dunk) fx.dunk.age++;
      if (fx.shake > 0) fx.shake--;
      draw(ctx, st, looks, cam, st.frame, fx, reduced);
      const F = FORMATS[st.cfg.fmt], H0 = st.ball.st === "held" ? st.p[st.ball.own] : null;
      const off = st.poss === 0, ctlP = st.p[st.ctl];
      const period = !F.periods ? "TO 21" : st.q > F.periods ? `OT${st.q - F.periods > 1 ? st.q - F.periods : ""}` : `Q${st.q}`;
      const key = `${st.score}|${period}|${Math.ceil(st.clock / 60)}|${Math.ceil(st.shot / 60)}|${off}|${st.ctl}|${st.phase}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud({ score: [...st.score], period, clock: F.periods ? clockOf(st.clock) : "", shot: Math.max(0, Math.ceil(st.shot / 60)), off, poss: st.poss, ctl: cfg.auto ? "" : names[ctlP.g], has: H0 ? H0.t : -1, over: st.phase === "over" });
      }
      const sk = `${st.score[0]}-${st.score[1]}`;
      if (sk !== scoreKey) { scoreKey = sk; setSr(`${shorts[0]} ${st.score[0]}, ${shorts[1]} ${st.score[1]}.`); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLegend = () => setLegendOpen(v => { writeFlag(LEGEND_KEY, !v); return !v; });
  const kits = kitsFor(home, away);
  return (
    <div className="hp-match">
      <div className="hp-board" role="group" aria-label="Scoreboard">
        <span className="tm" style={{ borderColor: kits[0][0] }}><b>{shorts[0]}</b><em>{hud?.score[0] ?? 0}</em>{hud?.has === 0 && <i aria-label="ball">●</i>}</span>
        <span className="mid"><b>{hud?.period || "Q1"}</b>{hud?.clock && <span>{hud.clock}</span>}<small>SHOT {hud?.shot ?? cfg.shot}</small></span>
        <span className="tm away" style={{ borderColor: kits[1][0] }}>{hud?.has === 1 && <i aria-label="ball">●</i>}<em>{hud?.score[1] ?? 0}</em><b>{shorts[1]}</b></span>
      </div>
      <div className="hp-call" aria-live="polite" aria-atomic="true">{call || " "}<span className="sr-only"> {sr}</span></div>
      <div className="hp-stage" ref={wrapRef}>
        <div className="hp-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Basketball: ${teams[0]} against ${teams[1]}`} />
          {tape && <div className="hp-tape">THE TAPE // {skipping ? "TO THE END" : "2X"}</div>}
          {paused && (
            <div className="hp-pause">
              <b>PAUSED</b>
              <span>THE DEPARTMENT HAS STOPPED THE CLOCK. IT DOES NOT USUALLY.</span>
              <Legend mode={mode} family={pad} compact />
              <span>{mode === "pad" ? (GLYPHS[pad] || GLYPHS.generic).start : mode === "touch" ? "START" : "ENTER / ESC"} TO RESUME</span>
            </div>
          )}
        </div>
      </div>
      {!tape && hud?.ctl && <p className="hp-ctl">YOU: <b>{hud.ctl}</b> {hud.off ? "// ON OFFENCE" : "// ON DEFENCE"}</p>}
      {touch && !tape && <TouchPad input={inputRef} off={hud?.off} onStart={() => togglePause()} />}
      {!tape && <Legend mode={mode} family={pad} open={legendOpen} onToggle={toggleLegend} />}
      <ButtonRow>
        <Button onClick={() => togglePause()}>{paused ? "Resume" : "Pause"}</Button>
        <Button onClick={() => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); }}>{muted ? "Sound on" : "Mute"}</Button>
        {tape && <Button onClick={() => { skipRef.current = true; setSkipping(true); }}>Skip to the end</Button>}
        <Button variant="back" onClick={onQuit}>{tape ? "Stop the tape" : "Leave the court"}</Button>
      </ButtonRow>
      <p className="hp-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
    </div>
  );
}

// The phone's pad: one eight-way surface, SHOOT / PASS / SWITCH, START. Labels follow the ball.
function TouchPad({ input, off, onStart }) {
  const bits = useRef({ dir: 0, a: 0, b: 0, c: 0 });
  const push = () => input.current?.setTouch(bits.current.dir | bits.current.a | bits.current.b | bits.current.c);
  const dpad = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    let d = 0;
    if (Math.hypot(x, y) > 10) {
      if (x > Math.abs(y) * 0.45) d |= BTN.RIGHT; else if (-x > Math.abs(y) * 0.45) d |= BTN.LEFT;
      if (y > Math.abs(x) * 0.45) d |= BTN.DOWN; else if (-y > Math.abs(x) * 0.45) d |= BTN.UP;
    }
    bits.current.dir = d; push();
  };
  const dEnd = () => { bits.current.dir = 0; push(); };
  const btn = (k, bit) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); SFX.unlock(); bits.current[k] = bit; push(); },
    onPointerUp: () => { bits.current[k] = 0; push(); }, onPointerCancel: () => { bits.current[k] = 0; push(); },
  });
  return (
    <div className="hp-touch">
      <div className="hp-dpad" onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); dpad(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") dpad(e); }} onPointerUp={dEnd} onPointerCancel={dEnd} aria-label="Direction pad" role="group">
        <span className="u" /><span className="d" /><span className="l" /><span className="r" />
      </div>
      <button type="button" className="hp-start" onClick={onStart}>START</button>
      <div className="hp-abc">
        <button type="button" className="c" {...btn("c", BTN.C)}>SWITCH</button>
        <button type="button" className="b" {...btn("b", BTN.B)}>{off ? "PASS" : "STEAL"}</button>
        <button type="button" className="a" {...btn("a", BTN.A)}>{off ? "SHOOT" : "JUMP"}</button>
      </div>
    </div>
  );
}

// ---- the buzzer ----------------------------------------------------------------------------------------
function Done({ done, game, onAgain, onTape, onPick }) {
  const { rec, verified } = done, r = rec.result, won = r.winner === 0;
  const teams = [teamName(game.home), teamName(game.away)], rows = [...game.cfg.home, ...game.cfg.away];
  useEffect(() => {
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onAgain(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onAgain]);
  const top = (t) => rows.map((row, g) => [row[1], r.pts[g], g]).filter(x => (x[2] < 5) === (t === 0)).sort((a, b) => b[1] - a[1]);
  return (
    <Frame box title="FINAL" meta="EXHIBITION">
      <p className={`hp-big ${won ? "win" : "lose"}`}>{won ? `${teams[0]} ${r.score[0]}, ${teams[1]} ${r.score[1]}.` : `${teams[1]} ${r.score[1]}, ${teams[0]} ${r.score[0]}.`}</p>
      <p className="hp-p">{won ? "THE DEPARTMENT HAS NOTED A WIN. IT WILL NOT BE REPEATED IN THE STANDINGS." : "AS PROJECTED. THE PROJECTION IS NOT ON YOUR FILE EITHER."}</p>
      <div className="hp-box">
        {[0, 1].map(t => (
          <table key={t} aria-label={`${teams[t]} points`}>
            <thead><tr><th scope="col">{teamShort(t ? game.away : game.home)}</th><th scope="col">PTS</th></tr></thead>
            <tbody>{top(t).map(([n, p, g]) => <tr key={g}><td>{n}</td><td>{p}</td></tr>)}</tbody>
          </table>
        ))}
      </div>
      <p className="hp-notice">{NOTICE}</p>
      <p className="hp-small">FIELD GOALS {r.fgm[0]}/{r.fga[0]} AND {r.fgm[1]}/{r.fga[1]} // {Math.round(r.frames / 60)} SECONDS OF PLAY // {verified ? "RE-RUN FROM THE INPUT LOG: SAME RESULT. YOU ARE REPRODUCIBLE." : "THE RE-RUN DISAGREED. THE DEPARTMENT IS LOOKING INTO ITSELF."} KEPT IN THIS BROWSER ONLY.</p>
      <ButtonRow>
        <Button variant="primary" onClick={onAgain}>Rematch</Button>
        <Button onClick={onTape}>Watch the tape</Button>
        <Button onClick={onPick}>Other teams</Button>
        <Button variant="back" href="#play">The games</Button>
      </ButtonRow>
    </Frame>
  );
}
