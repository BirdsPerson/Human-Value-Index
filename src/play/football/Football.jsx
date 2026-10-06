import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { readPad } from "../../city/gamepad.js";
import GameMenu from "../GameMenu.jsx";
import { newGame, step, rleEncode, rleDecode, resultOf, replay, VERSION, BTN, CALL_SHIFT, CODE, QLENS, PLAYS, DEFS, OFF_BOOK, DEF_BOOK, lineup, contextOf, iconsOf, coordinatorPick, legalOffence, downText, spotText, goalToGo, toGoal, OS, ICONS, DS_NAMES } from "./sim.js";
import { TEAM_IDS, teamName, teamShort, kitsFor, FALLBACK, loadLeague, sortEleven, teamRating, teamOfCase, citizenKeyOf, playNowPair, shownName, HINTS, CROPS } from "./roster.js";
import { draw, camInit, camFollow, headOf, skinOf, shade, W, H, PS_GLYPH } from "./render.js";
import { sheetHints } from "../heads.js";
import { callFor, crowdFor, bannerFor } from "./calls.js";
import { createInput, PAD_GLYPHS, KEY_GLYPHS } from "./input.js";
import * as SFX from "./audio.js";
import CSS from "./football.css?inline";
import "../pages.css";

// #football[?home=<district>][&vs=<district>][&q=2|3|5][&cam=high]: THE BOWL, playable football
// (docs/CITY_SPEC.md "PLAYABLE SPORTS", Football). Phase 1: exhibitions only. Nothing here reaches
// the league, the Cup or a file: the game is kept in this browser (its seed, its rosters and its
// input log, play calls included) and re-run once at the final whistle to show it reproduces.

function injectStyles() {
  let el = document.getElementById("fb-styles");
  if (!el) { el = document.createElement("style"); el.id = "fb-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const id = (k) => (TEAM_IDS.includes(q.get(k)) ? q.get(k) : null);
  const ql = Number(q.get("q"));
  return { home: id("home"), vs: id("vs"), qlen: QLENS.includes(ql) ? ql : 3, cam: q.get("cam") === "high" ? "high" : "broadcast" };
};
const KEEP = "hvi-football-exhibitions", KEEP_N = 3, ASSIST_KEY = "hvi-football-easy", LEGEND_KEY = "hvi-football-legend", CAM_KEY = "hvi-football-cam";
export function loadRecords() { try { const j = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
function saveRecord(rec) { try { localStorage.setItem(KEEP, JSON.stringify([rec, ...loadRecords()].slice(0, KEEP_N))); } catch { /* a full or private store: the game stays in the tab */ } }
const readFlag = (k, dflt) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === "1"; } catch { return dflt; } };
const writeFlag = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* the tab remembers */ } };
const readStr = (k, dflt) => { try { return localStorage.getItem(k) || dflt; } catch { return dflt; } };
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const NOTICE = "THIS GAME DOES NOT COUNT. THE LEAGUE TABLE IS NOT INFORMED.";
function seedNow() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch { return (Date.now() >>> 0) || 1; } }
// Each district's coach: a lean to the pass, fixed per district.
const coachOf = (id) => { let h = 7; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 0.3 + ((h % 1000) / 1000) * 0.4; };

function useMe() {
  return useMemo(() => {
    const caseId = readCaseId(), last = readLastResult(), av = last?.avatar || null;
    return { caseId, name: caseId ? `SUBJECT ${caseId.slice(-4).toUpperCase()}` : "SUBJECT", spec: av?.kind === "procedural" ? av.spec : null, url: av?.kind === "sprite" ? av.url : null };
  }, []);
}
function elevenOf(league, id, me) {
  const mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  return sortEleven(league.teams[id]).map(([k, n, r]) => [k, k === mine ? me.name : shownName(n), r]);
}

export default function Football({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const me = useMe();
  const [league, setLeague] = useState(FALLBACK);
  useEffect(() => { let off = false; loadLeague().then(lg => { if (lg && !off) setLeague(lg); }).catch(() => {}); return () => { off = true; }; }, []);
  const [qlen, setQlen] = useState(opts.qlen);
  const [cam, setCam] = useState(() => (opts.cam === "high" ? "high" : readStr(CAM_KEY, "broadcast")));
  const [assist, setAssist] = useState(() => readFlag(ASSIST_KEY, loadRecords().length === 0));
  const [game, setGame] = useState(null);
  const [done, setDone] = useState(null);
  const [tape, setTape] = useState(null);
  const mine = teamOfCase(league, me.caseId);
  const start = (home, away, q = qlen) => {
    SFX.unlock();
    const cfg = { qlen: q, assist, home: elevenOf(league, home, me), away: elevenOf(league, away, me), coach: [coachOf(home), coachOf(away)] };
    setDone(null); setTape(null);
    setGame({ seed: seedNow(), n: Date.now(), home, away, cfg });
  };
  const toggleAssist = () => setAssist(v => { writeFlag(ASSIST_KEY, !v); return !v; });
  const pickCam = (c) => { setCam(c); try { localStorage.setItem(CAM_KEY, c); } catch { /* fine */ } };
  let body;
  if (tape) body = <Match key={`tape${tape.rec.at}`} game={tape.game} me={me} cam={cam} tape={tape.rec} onDone={() => setTape(null)} onQuit={() => setTape(null)} />;
  else if (game && !done) body = <Match key={game.n} game={game} me={me} cam={cam} onDone={setDone} onQuit={() => setGame(null)} onRestart={() => start(game.home, game.away, game.cfg.qlen)} />;
  else if (done) body = <Done done={done} game={game} onAgain={() => start(game.home, game.away, game.cfg.qlen)} onTape={() => setTape({ rec: done.rec, game })} onPick={() => { setDone(null); setGame(null); }} />;
  else body = <Picker league={league} me={me} mine={mine} pre={opts} qlen={qlen} setQlen={setQlen} cam={cam} pickCam={pickCam} assist={assist} toggleAssist={toggleAssist} onStart={start} />;
  return (
    <div className="fb">
      <ScreenHead title="THE BOWL" meta="FOOTBALL // EXHIBITION // ELEVEN ON ELEVEN. CONTACT IS PERMITTED. EVERYTHING IS RECORDED." />
      {body}
    </div>
  );
}

// ---- choosing ------------------------------------------------------------------------------------
function Picker({ league, me, mine, pre, qlen, setQlen, cam, pickCam, assist, toggleAssist, onStart }) {
  const [home0] = playNowPair(league, mine);
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
  return (
    <>
      <p className="pg-lede">FOOTBALL, ELEVEN ON ELEVEN, WITH THE CITY'S OWN LEAGUE TEAMS. CALL A PLAY, SNAP IT, THROW TO A RECEIVER'S BUTTON OR RUN IT; ON DEFENCE TAKE THE MAN NEAREST THE BALL AND TACKLE. A CONTROLLER WORKS; PHONES GET A PAD.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={quick}>PLAY NOW</Button>
        <span className="pg-sub">{teamName(home)}{home === mine ? " (YOUR TEAM)" : ""} V {teamName(away)}. FOUR {qlen}-MINUTE QUARTERS.</span>
      </div>
      <p className="fb-you">
        <button type="button" className="pg-toggle" aria-pressed={assist} onClick={toggleAssist}>EASY MODE</button>
        <span>{assist ? "A BIGGER CATCH RADIUS, STEADIER THROWS, SLOWER CPU READS; YOUR RUNNER RUNS ON HIS OWN WHEN YOU LET GO." : "THE CPU PLAYS AS RATED."}</span>
      </p>
      {mine ? <p className="fb-you">YOU ARE ON THE {teamName(mine)} THIS SEASON. YOU PLAY AS YOURSELF, AT YOUR RATING.</p>
        : me.caseId ? <p className="fb-you fb-dim">YOUR FILE IS NOT ON A FOOTBALL ROSTER THIS SEASON. ENTRIES ARE MADE FROM <a href="#file">MY FILE</a>.</p> : null}
      <details className="pg-more">
        <summary>CHOOSE TEAMS, QUARTER LENGTH AND CAMERA</summary>
        <div className="pg-more-body">
          <div className="fb-chips" role="radiogroup" aria-label="Quarter length">
            {QLENS.map(q => <button key={q} type="button" role="radio" aria-checked={qlen === q} className={`fb-chip${qlen === q ? " on" : ""}`} onClick={() => setQlen(q)}>{q}-MINUTE QUARTERS</button>)}
          </div>
          <div className="fb-chips" role="radiogroup" aria-label="Camera">
            {[["broadcast", "BEHIND THE PLAY"], ["high", "HIGH AND WIDE"]].map(([c, n]) => <button key={c} type="button" role="radio" aria-checked={cam === c} className={`fb-chip${cam === c ? " on" : ""}`} onClick={() => pickCam(c)}>{n}</button>)}
          </div>
          <p className="fb-small">YOUR TEAM:</p>
          <div className="fb-chips" role="radiogroup" aria-label="Your team">
            {TEAM_IDS.map(id => <button key={id} type="button" role="radio" aria-checked={home === id} className={`fb-chip${home === id ? " on" : ""}`} onClick={() => setHome(id)}>{teamShort(id)}{id === mine ? " (YOURS)" : ""}</button>)}
          </div>
          <p className="fb-small">THEN PICK WHO TO PLAY; THE GAME STARTS AT ONCE. SPEED, HANDS, ARM AND TACKLING FOLLOW EACH PLAYER'S LEAGUE RATING.</p>
          <ul className="fb-teams">
            {TEAM_IDS.filter(id => id !== home).map(id => {
              const xi = sortEleven(league.teams[id]);
              return (
                <li key={id}>
                  <button type="button" className="fb-team" onClick={() => onStart(home, id)} aria-label={`Play ${teamName(id)}, rated ${teamRating(xi)}`}>
                    <i className="sw" style={{ background: kitsFor(home, id)[1][0], borderColor: kitsFor(home, id)[1][1] }} aria-hidden="true" />
                    <span className="nm">{teamName(id)}<span className="tag">{xi.slice(0, 3).map(r => shownName(r[1])).join(", ")}{league.pos[id] ? ` // ${ordinal(league.pos[id])} IN THE LEAGUE` : ""}</span></span>
                    <span className="rt">{teamRating(xi)}</span>
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
      <p className="fb-notice"><b>EXHIBITION.</b> {NOTICE} NOT IN THE STANDINGS, NOT IN THE CUP, NOT ON YOUR FILE. THE DEPARTMENT KEEPS THE TAPE ANYWAY.</p>
      <p className="fb-small">ROSTERS: SEASON {league.season || "?"}, MACHINE DAY {league.day}{league.live ? ", AS DRAFTED" : ". THE LIVE LEAGUE DID NOT ANSWER; THESE ARE THE ROSTERS ON FILE"}.</p>
    </>
  );
}
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;

function Controls() {
  return (
    <dl className="fb-keys">
      <dt>CALL</dt><dd>BETWEEN DOWNS PICK A FORMATION, THEN A PLAY (ARROWS AND SPACE, OR TAP). ASK THE COORDINATOR (I / PAD Y) IF UNSURE. FLIP MIRRORS IT. DEFENCE PICKS A COVERAGE.</dd>
      <dt>SNAP</dt><dd>SPACE OR J // PAD A. BEFORE IT: U (PAD X) FOR AN AUDIBLE, I (PAD Y) THEN A RECEIVER FOR A HOT ROUTE (HE GOES DEEP).</dd>
      <dt>PASS</dt><dd>EACH RECEIVER WEARS A BUTTON: 1-5 ON KEYS, A B X Y RB ON A PAD, OR TAP HIM. TAP IT FOR A BULLET, HOLD IT FOR A LOB. THE QUARTERBACK DROPS BACK ON HIS OWN; THE ARROWS MOVE HIM.</dd>
      <dt>RUN</dt><dd>ARROWS. SHIFT (PAD RT) SPRINTS WHILE STAMINA LASTS. Q / E (RIGHT STICK) JUKE, K (PAD B) SPINS, L (RIGHT STICK UP) TRUCKS, I (PAD Y) STIFF-ARMS.</dd>
      <dt>DEFENCE</dt><dd>K (PAD B) SWITCHES TO THE MAN NEAREST THE BALL. RUN INTO THE CARRIER TO TACKLE; J (PAD A) WRAPS UP SURER, U (PAD X) DIVES, L (RIGHT STICK UP) IS THE HIT STICK (A FUMBLE CHANCE, A MISS CHANCE). I (PAD Y) SWATS AT A PASS: TOO EARLY IS INTERFERENCE.</dd>
      <dt>KICKS</dt><dd>A STARTS THE METER, A SETS THE POWER, A AGAIN AS THE NEEDLE CROSSES THE LINE. ARROWS AIM A PUNT OR A KICKOFF. AFTER A TOUCHDOWN: KICK THE POINT OR GO FOR TWO.</dd>
      <dt>RULES</dt><dd>FOUR DOWNS TO GAIN TEN YARDS. TOUCHDOWN 6, EXTRA POINT 1, TWO-POINT TRY 2, FIELD GOAL 3, SAFETY 2. TOUCHBACKS AT THE 25 (KICKOFF) AND 20 (PUNT). FLAGS: HOLDING, PASS INTERFERENCE, OFFSIDE, FALSE START, DELAY OF GAME. THE CLOCK RUNS AFTER A PLAY IN BOUNDS AND STOPS ON AN INCOMPLETION, A SCORE, A TURNOVER, A TIMEOUT (THREE A HALF) AND, LATE IN A HALF, OUT OF BOUNDS.</dd>
      <dt>PAUSE</dt><dd>ENTER / ESC // START</dd>
    </dl>
  );
}

export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic;
    return [["CALL", `D-PAD, ${g.A}; ${g.Y} THE COORDINATOR`, ""], ["SNAP", g.A, `${g.X} AUDIBLE, ${g.Y} HOT ROUTE`], ["PASS", `${g.A} ${g.B} ${g.X} ${g.Y} ${g.RB}`, "TAP: BULLET. HOLD: LOB."], ["RUN", `STICK, ${g.sprint} SPRINT`, `${g.rs} FLICK: JUKE / TRUCK. ${g.B} SPIN, ${g.Y} STIFF ARM`], ["DEFENCE", `${g.B} SWITCH`, `${g.A} TACKLE, ${g.X} DIVE, ${g.rs} UP HIT STICK, ${g.Y} SWAT`], ["KICK", `${g.A} x3`, "START, POWER, ACCURACY"], ["PAUSE", g.start, ""]];
  }
  if (mode === "touch") return [["CALL", "TAP A PLAY", "OR ASK THE COORDINATOR"], ["SNAP", "SNAP", ""], ["PASS", "TAP A RECEIVER", "OR HIS BUTTON. HOLD: LOB."], ["RUN", "THE ROUND PAD", "SPRINT, JUKE, SPIN, TRUCK, STIFF"], ["DEFENCE", "SWITCH, TACKLE", "DIVE, HIT, SWAT"], ["KICK", "KICK x3", "START, POWER, ACCURACY"], ["PAUSE", "START", ""]];
  return [["CALL", "ARROWS, SPACE", "I: THE COORDINATOR"], ["SNAP", "SPACE / J", "U AUDIBLE, I HOT ROUTE"], ["PASS", "1 2 3 4 5", "TAP: BULLET. HOLD: LOB."], ["RUN", "ARROWS, SHIFT", "Q / E JUKE, K SPIN, L TRUCK, I STIFF ARM"], ["DEFENCE", "K SWITCH", "J TACKLE, U DIVE, L HIT STICK, I SWAT"], ["KICK", "SPACE x3", "START, POWER, ACCURACY"], ["PAUSE", "ENTER / ESC", ""]];
}
function Legend({ mode, family, open, onToggle, inMenu = false }) {
  const rows = legendRows(mode, family), label = mode === "pad" ? `CONTROLLER (${String(family || "pad").toUpperCase()})` : mode === "touch" ? "TOUCH" : "KEYBOARD";
  if (inMenu) return <dl className="fb-legend-rows">{rows.map(([k, keys, hint]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd>{hint && <span> {hint}</span>}</dd></div>)}</dl>;
  return (
    <section className="fb-legend" aria-label="Controls">
      <button type="button" className="fb-legend-head" aria-expanded={open} onClick={onToggle}><span>CONTROLS // {label}</span><span aria-hidden="true">{open ? "HIDE ▴" : "SHOW ▾"}</span></button>
      {open && <dl className="fb-legend-rows">{rows.map(([k, keys, hint]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd>{hint && <span> {hint}</span>}</dd></div>)}</dl>}
    </section>
  );
}
// The receivers' disc labels on the picture, per input.
function iconLabels(mode, family) {
  if (mode === "keys") return { A: "1", B: "2", X: "3", Y: "4", RB: "5", menuAud: "AUDIBLE: 1 SLANTS  2 HB DIVE  4 VERTICALS  U CANCEL" };
  if (mode === "pad" && family === "playstation") return { ...PS_GLYPH, menuAud: "AUDIBLE: X SLANTS  O HB DIVE  ^ VERTICALS  [ CANCEL" };
  if (mode === "pad" && family === "switch") return { A: "B", B: "A", X: "Y", Y: "X", RB: "R", menuAud: "AUDIBLE: B SLANTS  A HB DIVE  X VERTICALS  Y CANCEL" };
  if (mode === "touch") return { menuAud: "AUDIBLE: SNAP=SLANTS  RUN=HB DIVE  DEEP=VERTICALS" };
  return null;
}

// ---- how everyone looks -------------------------------------------------------------------------------
const NUMS = [12, 26, 81, 84, 87, 88, 71, 64, 52, 65, 76];
function looksFor(cfg, home, away, me) {
  const kits = kitsFor(home, away), mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  const L = [lineup(cfg.home), lineup(cfg.away)];
  const rows = [...cfg.home, ...cfg.away];
  return rows.map((row, g) => {
    const t = g < 11 ? 0 : 1, kit = kits[t], key = row[0], slot = L[t].os.indexOf(g % 11);
    const look = { jersey: kit[0], trim: kit[1], pants: shade(kit[1], 0.92), helmet: shade(kit[0], 0.82), skin: "#c68c5e", hair: null, head: null, num: NUMS[slot] ?? 90 + (g % 11) };
    const isMe = key === mine;
    const sheetP = isMe ? (me.url ? loadSprite(me.url, { sector: null }).catch(() => null) : Promise.resolve(null))
      : key.startsWith("citizen-") || key.startsWith("stand-in") ? Promise.resolve(null)
        : loadSprite(`/api/sprite/${key}`, { sector: null }).catch(() => null);
    sheetP.then(sheet => {
      const spec = isMe && me.spec ? me.spec : { ...DEFAULT_SPEC, ...(HINTS[key] || {}) };
      const s = sheet || paintAvatar(spec, 1);
      const hd = headOf(s, sheet ? CROPS[key] || null : null);
      if (hd) { look.head = hd; look.skin = skinOf(hd) || look.skin; return; }
      const cue = sheetHints(s);
      if (cue.skin) look.skin = cue.skin;
      if (cue.hair) look.hair = cue.hair;
    });
    return look;
  });
}

// ---- the game ------------------------------------------------------------------------------------
const clockOf = (f) => { const s = Math.max(0, Math.ceil(f / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function Match({ game, me, cam: camMode, tape = null, onDone, onQuit, onRestart }) {
  const { cfg, home, away, seed } = game;
  const canvasRef = useRef(null), wrapRef = useRef(null), inputRef = useRef(null), stRef = useRef(null), codeRef = useRef(0), navRef = useRef(null);
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
  const pausedRef = useRef(false), mutedRef = useRef(muted), skipRef = useRef(false), scaleRef = useRef(1);
  mutedRef.current = muted; scaleRef.current = scale;
  const togglePause = (v) => { pausedRef.current = v ?? !pausedRef.current; setPaused(pausedRef.current); };
  const teams = [teamName(home), teamName(away)], shorts = [teamShort(home), teamShort(away)];
  const mode = pad ? "pad" : touch ? "touch" : "keys";
  const modeRef = useRef(mode); modeRef.current = mode;
  const padRef = useRef(pad); padRef.current = pad;
  const sendCall = useCallback((code) => { SFX.unlock(); codeRef.current = code; }, []);

  useEffect(() => { const f = () => setTouch(true); window.addEventListener("touchstart", f, { once: true, passive: true }); return () => window.removeEventListener("touchstart", f); }, []);
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = Math.max(240, window.innerHeight - 250);
      setScale(Math.max(1, Math.floor(Math.min(w / W, h / H) * dpr)) / dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrapRef.current); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  useEffect(() => {
    const st = newGame(seed, cfg), log = [], masks = tape ? rleDecode(tape.inputLog) : null;
    stRef.current = st;
    if (import.meta.env?.DEV && typeof window !== "undefined") window.__hviFootball = st;   // for the browser checks
    let ti = 0;
    const input = createInput(); inputRef.current = input;
    const looks = looksFor(cfg, home, away, me);
    const names = [...cfg.home, ...cfg.away].map(r => r[1]);
    const kits = kitsFor(home, away);
    const reduced = REDUCED();
    const fx = { mood: "idle", t: 0, banner: null, shake: 0 };
    const ctx = canvasRef.current.getContext("2d");
    const cam = camInit(st, camMode);
    let raf, last = performance.now(), acc = 0, hudKey = "", ended = false, scoreKey = "0-0", noteSeen = -1, prevMask = 0;
    const onVis = () => { if (document.hidden && !tape) togglePause(true); };
    document.addEventListener("visibilitychange", onVis);
    const finish = () => {
      ended = true;
      if (tape) { setTimeout(() => onDone(null), 1500); return; }
      const rec = { version: VERSION, seed, cfg, home, away, inputLog: rleEncode(log), result: resultOf(st), at: Date.now() };
      let verified = false;
      try { verified = JSON.stringify(replay(rec)) === JSON.stringify(rec.result); } catch { verified = false; }
      saveRecord(rec);
      setTimeout(() => onDone({ rec, verified }), 2500);
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      const inp = input.sample();
      if (inp.pad !== undefined) setPad(p => (p === inp.pad ? p : inp.pad));
      if (inp.start && !ended) togglePause();
      const press = inp.mask & ~prevMask; prevMask = inp.mask;
      if (!tape && !pausedRef.current && contextOf(st) === "call") navRef.current?.(press);
      if (!pausedRef.current) {
        acc += dt;
        let n = 0;
        const quick = st.phase === "call" || st.phase === "dead" || (st.phase === "pre" && st.poss !== 0);
        const per = tape ? (skipRef.current ? 400 : quick ? 6 : 2) : 1;
        while (acc >= 1 / 60 && n < 8) {
          acc -= 1 / 60; n++;
          for (let k = 0; k < per && !ended; k++) {
            let m;
            if (tape) m = masks[ti++] ?? 0;
            else { m = inp.mask | (codeRef.current << CALL_SHIFT); codeRef.current = 0; log.push(m); }
            step(st, m);
            if (!tape || !skipRef.current) SFX.play(st.ev, mutedRef.current);
            const N = st.note;
            if (N && N.frame === st.frame && N.frame !== noteSeen) {
              noteSeen = N.frame;
              const line = callFor(N, names, teams, N.frame);
              if (line) setCall(line);
              const kind = crowdFor(N);
              if (kind) { fx.mood = kind === "groan" || kind === "aww" ? "groan" : kind === "polite" || kind === "thin" ? "stand" : "cheer"; fx.t = 0; if (!skipRef.current) SFX.crowd(kind, mutedRef.current); }
              const b = bannerFor(N);
              if (b) fx.banner = { ...b, t: 0 };
              if (N.k === "bighit" || N.k === "truck") fx.shake = 10;
            }
            if (st.phase === "over" && !ended) finish();
          }
        }
      } else acc = 0;
      camFollow(cam, st);
      fx.t++; if (fx.t > 160) fx.mood = "idle";
      if (fx.banner) fx.banner.t++;
      if (fx.shake > 0) fx.shake--;
      draw(ctx, st, looks, cam, st.frame, fx, reduced, iconLabels(modeRef.current, padRef.current), kits);
      const cx = contextOf(st);
      const period = st.q > 4 ? "OT" : `Q${st.q}`;
      const pc = st.phase === "pre" && st.poss === 0 && !st.kick && !cfg.auto ? Math.max(0, 25 - Math.floor(st.pt / 60)) : null;
      const key = `${st.score}|${period}|${Math.ceil(st.clock / 60)}|${st.down}|${Math.round(st.togo)}|${Math.round(st.los)}|${st.poss}|${st.ctl}|${st.phase}|${cx}|${pc}|${st.to}|${st.tryChoice}|${st.runoff > 0}|${st.playNo}`;
      if (key !== hudKey) {
        hudKey = key;
        const P = st.p[st.ctl];
        setHud({
          score: [...st.score], period, clock: clockOf(st.clock), poss: st.poss, down: st.kick?.kind === "ko" ? "KICKOFF" : st.tryFor >= 0 ? "TRY" : downText(st), spot: spotText(st.poss, st.los), pc, to: [...st.to], cx,
          ctl: P && !cfg.auto ? `${names[P.g]} // ${st.kick && P.g === st.kicker[0] ? "K" : st.poss === 0 || st.kick ? ["QB", "HB", "WR", "WR", "TE", "WR", "LT", "LG", "C", "RG", "RT"][P.os] || "" : DS_NAMES[P.ds] || ""}` : "", off: st.poss === 0,
          call: cx === "call" ? { side: st.poss === 0 ? "off" : "def", tryChoice: st.tryChoice, legal: legalOffence(st), coach: coordinatorPick(st), canTO: st.to[0] > 0 && st.runoff > 0, sit: `${st.tryFor >= 0 ? "THE TRY" : downText(st)}, ${spotText(st.poss, st.los)}`, need: toGoal(st.poss, st.los) } : null,
        });
      }
      const sk = `${st.score[0]}-${st.score[1]}`;
      if (sk !== scoreKey) { scoreKey = sk; setSr(`${shorts[0]} ${st.score[0]}, ${shorts[1]} ${st.score[1]}.`); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // a tap on a receiver throws to him (hold for a lob)
  const tapBit = useRef(0);
  const onCanvasDown = (e) => {
    const st = stRef.current; if (!st || tape) return;
    SFX.unlock();
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / scaleRef.current, y = (e.clientY - r.top) / scaleRef.current;
    let best = null, bd = 26;
    for (const [lab, g] of iconsOf(st)) { const P = st.p[g]; if (P._sx == null) continue; const d = Math.hypot(P._sx - x, P._sy - 4 - y); if (d < bd) { bd = d; best = lab; } }
    if (!best) return;
    const bit = ICONS.find(i => i[0] === best)[2];
    tapBit.current = bit; inputRef.current?.setTouch(bit);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onCanvasUp = () => { if (tapBit.current) { tapBit.current = 0; inputRef.current?.setTouch(0); } };

  const toggleLegend = () => setLegendOpen(v => { writeFlag(LEGEND_KEY, !v); return !v; });
  const toggleMute = () => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); };
  const kits = kitsFor(home, away);
  return (
    <div className="fb-match">
      <div className="fb-bug" role="group" aria-label="Scoreboard">
        <span className="tm" style={{ borderColor: kits[0][0] }}><b className="nm">{shorts[0]}</b><span className="ab" aria-hidden="true">{shorts[0].slice(0, 4)}</span><em>{hud?.score[0] ?? 0}</em>{hud?.poss === 0 && <i aria-label="ball">●</i>}<span className="tos" aria-label={`${hud?.to[0] ?? 3} timeouts`}>{"▮".repeat(hud?.to[0] ?? 3)}</span></span>
        <span className="mid"><b>{hud?.period || "Q1"} {hud?.clock}</b><span>{hud?.down || ""}</span><small>{hud?.spot}{hud?.pc != null && <span className="pc"> // {hud.pc}</span>}</small></span>
        <span className="tm away" style={{ borderColor: kits[1][0] }}><span className="tos" aria-label={`${hud?.to[1] ?? 3} timeouts`}>{"▮".repeat(hud?.to[1] ?? 3)}</span>{hud?.poss === 1 && <i aria-label="ball">●</i>}<em>{hud?.score[1] ?? 0}</em><b className="nm">{shorts[1]}</b><span className="ab" aria-hidden="true">{shorts[1].slice(0, 4)}</span></span>
      </div>
      <div className="fb-call" aria-live="polite" aria-atomic="true">{call || " "}<span className="sr-only"> {sr}</span></div>
      <div className="fb-stage" ref={wrapRef}>
        <div className="fb-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Football: ${teams[0]} against ${teams[1]}`} onPointerDown={onCanvasDown} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} />
          {tape && <div className="fb-tape">THE TAPE // {skipping ? "TO THE END" : "2X"}</div>}
          {!tape && hud?.call && !paused && <PlayCall info={hud.call} onCall={sendCall} navRef={navRef} mode={mode} family={pad} />}
        </div>
      </div>
      {!tape && hud?.ctl && hud.cx !== "call" && <p className="fb-ctl">YOU: <b>{hud.ctl}</b> {hud.off ? "// ON OFFENCE" : "// ON DEFENCE"}</p>}
      {touch && !tape && <TouchPad input={inputRef} cx={hud?.cx} onStart={() => togglePause()} />}
      {!tape && <Legend mode={mode} family={pad} open={legendOpen} onToggle={toggleLegend} />}
      <ButtonRow>
        <Button onClick={() => togglePause()}>{paused ? "Resume" : "Pause"}</Button>
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        {tape && <Button onClick={() => { skipRef.current = true; setSkipping(true); }}>Skip to the end</Button>}
        <Button variant="back" onClick={onQuit}>{tape ? "Stop the tape" : "Leave the stadium"}</Button>
      </ButtonRow>
      <p className="fb-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
      {paused && !tape && (
        <GameMenu key="pause" kind="pause" title="PAUSED. THE DEPARTMENT HAS STOPPED THE CLOCK." summary={hud ? `${shorts[0]} ${hud.score[0]}, ${shorts[1]} ${hud.score[1]} // ${hud.period} ${hud.clock}` : ""} onBack={() => togglePause(false)}
          options={{ resume: () => togglePause(false), restart: onRestart ? { label: "RESTART THE GAME", onSelect: onRestart } : null, controls: <Legend mode={mode} family={pad} inMenu />, sound: { on: !muted, onSelect: toggleMute }, quit: { label: "LEAVE THE STADIUM", onSelect: onQuit } }} />
      )}
    </div>
  );
}

// The play call: formation, then play; or the coverage; or the try. Arrows / pad / taps.
function PlayCall({ info, onCall, navRef, mode, family }) {
  const off = info.side === "off";
  const forms = OFF_BOOK.map(f => ({ ...f, plays: f.plays.filter(id => info.legal.includes(id)) })).filter(f => f.plays.length);
  const [fi, setFi] = useState(() => { const i = forms.findIndex(f => f.plays.includes(info.coach)); return Math.max(0, i); });
  const [pi, setPi] = useState(0);
  const [flip, setFlip] = useState(false);
  const g = mode === "pad" ? PAD_GLYPHS[family] || PAD_GLYPHS.generic : null;
  const ylab = g ? g.Y : mode === "keys" ? "I" : "", xlab = g ? g.X : mode === "keys" ? "U" : "";
  const list = info.tryChoice ? [CODE.PAT, CODE.TWO] : off ? forms[Math.min(fi, forms.length - 1)]?.plays || [] : DEF_BOOK;
  const choose = (id) => onCall(id === CODE.PAT || id === CODE.TWO || id === CODE.COACH ? id : id | (flip && off ? CODE.FLIP : 0));
  navRef.current = (press) => {
    if (press & BTN.Y) return onCall(CODE.COACH);
    if (press & BTN.X) return setFlip(f => !f);
    if (off && !info.tryChoice && press & BTN.LEFT) { setFi(i => (i + forms.length - 1) % forms.length); setPi(0); }
    if (off && !info.tryChoice && press & BTN.RIGHT) { setFi(i => (i + 1) % forms.length); setPi(0); }
    if (press & BTN.UP) setPi(i => (i + list.length - 1) % list.length);
    if (press & BTN.DOWN) setPi(i => (i + 1) % list.length);
    if (press & BTN.A) choose(list[Math.min(pi, list.length - 1)]);
    if (press & BTN.R && info.canTO) onCall(CODE.TIMEOUT);
  };
  useEffect(() => () => { navRef.current = null; }, [navRef]);
  const name = (id) => (id === CODE.PAT ? "KICK THE EXTRA POINT" : id === CODE.TWO ? "GO FOR TWO" : off ? PLAYS[id].name : DEFS[id].name);
  const tip = (id) => (id === CODE.PAT ? "ONE POINT. NEARLY CERTAIN." : id === CODE.TWO ? "TWO POINTS FROM THE 2. ONE PLAY." : off ? PLAYS[id].tip : DEFS[id].tip);
  const coachName = info.tryChoice ? "" : off ? PLAYS[info.coach]?.name : DEFS[info.coach]?.name;
  return (
    <div className="fb-pc" role="dialog" aria-label={off ? "Call a play" : "Call a defence"}>
      <div className="fb-pc-head"><span>{info.tryChoice ? "AFTER THE TOUCHDOWN" : off ? "YOUR BALL" : "YOUR DEFENCE"} // <b>{info.sit}</b></span>{info.canTO && <span><button type="button" className="fb-chip" onClick={() => onCall(CODE.TIMEOUT)}>TIMEOUT{mode === "pad" ? ` (${g.RB})` : mode === "keys" ? " (O)" : ""}</button></span>}</div>
      {!info.tryChoice && <button type="button" className="coach" onClick={() => onCall(CODE.COACH)}>ASK THE COORDINATOR{ylab ? ` (${ylab})` : ""} <small>// TODAY HE LIKES {coachName}</small></button>}
      {off && !info.tryChoice && (
        <div className="forms" role="tablist" aria-label="Formation">
          {forms.map((f, i) => <button key={f.form} type="button" role="tab" aria-selected={i === fi} className={i === fi ? "on" : ""} onClick={() => { setFi(i); setPi(0); }}>{f.form}</button>)}
        </div>
      )}
      <div className="plays">
        {list.map((id, i) => <button key={id} type="button" className={i === pi ? "on" : ""} onClick={() => choose(id)} onFocus={() => setPi(i)}>{name(id)}<small>{tip(id)}</small></button>)}
      </div>
      {off && !info.tryChoice && <div className="row"><button type="button" aria-pressed={flip} onClick={() => setFlip(f => !f)}>FLIP{xlab ? ` (${xlab})` : ""}</button><span>{mode === "keys" ? "ARROWS AND SPACE" : mode === "pad" ? "D-PAD AND " + g.A : "TAP A PLAY"}</span></div>}
    </div>
  );
}

// The phone's pad: the eight-way surface and the buttons the moment calls for.
const TOUCH = {
  "pre-off": [["SNAP", BTN.A, "go"], ["AUDIBLE", BTN.X], ["HOT", BTN.Y]],
  qb: [["A", BTN.A, "ic", "#3c8a46"], ["B", BTN.B, "ic", "#b83232"], ["X", BTN.X, "ic", "#3a6fd8"], ["Y", BTN.Y, "ic", "#a08820"], ["RB", BTN.R, "ic", "#6a7078"], ["SPRINT", BTN.SPRINT]],
  run: [["SPRINT", BTN.SPRINT, "go"], ["JUKE", BTN.X], ["SPIN", BTN.B], ["TRUCK", BTN.RSU], ["STIFF", BTN.Y]],
  def: [["SPRINT", BTN.SPRINT], ["SWITCH", BTN.B], ["TACKLE", BTN.A, "go"], ["DIVE", BTN.X], ["HIT", BTN.RSU], ["SWAT", BTN.Y]],
  "pre-def": [["SWITCH", BTN.B]],
  kick: [["KICK", BTN.A, "go"]],
};
function TouchPad({ input, cx, onStart }) {
  const bits = useRef({ dir: 0, b: 0 });
  const push = () => input.current?.setTouch(bits.current.dir | bits.current.b);
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
  const btn = (bit) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); SFX.unlock(); bits.current.b |= bit; push(); },
    onPointerUp: () => { bits.current.b &= ~bit; push(); }, onPointerCancel: () => { bits.current.b &= ~bit; push(); },
  });
  const list = TOUCH[cx] || [];
  return (
    <div className="fb-touch">
      <div className="fb-dpad" onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); dpad(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") dpad(e); }} onPointerUp={dEnd} onPointerCancel={dEnd} aria-label="Direction pad" role="group">
        <span className="u" /><span className="d" /><span className="l" /><span className="r" />
      </div>
      <div className="fb-btns">
        {list.map(([lab, bit, cls, bg]) => <button key={lab} type="button" className={cls || ""} style={bg ? { background: bg, borderColor: bg } : null} {...btn(bit)}>{lab}</button>)}
        <button type="button" onClick={onStart}>START</button>
      </div>
    </div>
  );
}

// ---- the final whistle ------------------------------------------------------------------------------
function Done({ done, game, onAgain, onTape, onPick }) {
  const { rec, verified } = done, r = rec.result, won = r.winner === 0, tie = r.winner === -1;
  const [menu, setMenu] = useState(true);
  const teams = [teamName(game.home), teamName(game.away)], rows = [...game.cfg.home, ...game.cfg.away];
  const nm = (g) => shownName(rows[g][1]);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const S = r.stat;
  const lead = (t, f, min = 1) => r.ps.map((x, g) => [g, x]).filter(([g, x]) => (g < 11) === (t === 0) && f(x) >= min).sort((a, b) => f(b[1]) - f(a[1]));
  const summary = tie ? `${teams[0]} ${r.score[0]}, ${teams[1]} ${r.score[1]}. A TIE. NOBODY IS SATISFIED.` : won ? `${teams[0]} ${r.score[0]}, ${teams[1]} ${r.score[1]}.` : `${teams[1]} ${r.score[1]}, ${teams[0]} ${r.score[0]}.`;
  return (
    <Frame box title="FINAL" meta="EXHIBITION">
      <p className={`fb-big ${won ? "win" : tie ? "" : "lose"}`}>{summary}</p>
      <p className="fb-p">{won ? "THE DEPARTMENT HAS NOTED A WIN. IT WILL NOT BE REPEATED IN THE STANDINGS." : tie ? "LEVEL. THE DEPARTMENT DISLIKES AMBIGUITY BUT WILL FILE IT." : "AS PROJECTED. THE PROJECTION IS NOT ON YOUR FILE EITHER."}</p>
      <div className="fb-box">
        <table aria-label="Team statistics">
          <thead><tr><th scope="col">TEAM</th><th scope="col">{teamShort(game.home)}</th><th scope="col">{teamShort(game.away)}</th></tr></thead>
          <tbody>
            {[["TOTAL YARDS", x => x.yds], ["YARDS A PLAY", x => (x.plays ? (x.yds / x.plays).toFixed(1) : "0")], ["PASSING", x => `${x.pc}/${x.pa}, ${x.py}`], ["RUSHING", x => `${x.ra}-${x.ry}`], ["FIRST DOWNS", x => x.fd], ["THIRD DOWNS", x => `${x.thirdOk}/${x.third}`], ["SACKED", x => x.sacks], ["TURNOVERS", x => x.ints + x.fum], ["PENALTIES", x => `${x.pen}-${x.penYds}`], ["POSSESSION", x => `${Math.floor(x.top / 3600)}:${String(Math.floor(x.top / 60) % 60).padStart(2, "0")}`]].map(([k, f]) => <tr key={k}><td>{k}</td><td>{f(S[0])}</td><td>{f(S[1])}</td></tr>)}
          </tbody>
        </table>
        {[0, 1].map(t => (
          <table key={t} aria-label={`${teams[t]} leaders`}>
            <thead><tr><th scope="col">{teamShort(t ? game.away : game.home)}</th><th scope="col">LINE</th></tr></thead>
            <tbody>
              {lead(t, x => x.pa).slice(0, 1).map(([g, x]) => <tr key={`p${g}`}><td>{nm(g)}</td><td>{x.pc}/{x.pa}, {x.py} YDS, {x.ptd} TD, {x.int} INT</td></tr>)}
              {lead(t, x => x.ra).slice(0, 2).map(([g, x]) => <tr key={`r${g}`}><td>{nm(g)}</td><td>{x.ra} RUSH, {x.ry} YDS{x.rtd ? `, ${x.rtd} TD` : ""}</td></tr>)}
              {lead(t, x => x.rec).slice(0, 2).map(([g, x]) => <tr key={`c${g}`}><td>{nm(g)}</td><td>{x.rec} REC, {x.recy} YDS{x.rectd ? `, ${x.rectd} TD` : ""}</td></tr>)}
              {lead(t, x => x.tk + 3 * x.sk + 5 * x.pick).slice(0, 2).map(([g, x]) => <tr key={`d${g}`}><td>{nm(g)}</td><td>{x.tk} TKL{x.sk ? `, ${x.sk} SACK` : ""}{x.pick ? `, ${x.pick} INT` : ""}</td></tr>)}
            </tbody>
          </table>
        ))}
      </div>
      <p className="fb-notice">{NOTICE}</p>
      <p className="fb-small">{Math.round(r.frames / 3600)} MINUTES ON THE CLOCK AND OFF IT // {verified ? "RE-RUN FROM THE INPUT LOG, PLAY CALLS AND ALL: SAME RESULT. YOU ARE REPRODUCIBLE." : "THE RE-RUN DISAGREED. THE DEPARTMENT IS LOOKING INTO ITSELF."} KEPT IN THIS BROWSER ONLY.</p>
      <ButtonRow>
        <Button variant="primary" onClick={onAgain}>Rematch</Button>
        <Button onClick={onTape}>Watch the tape</Button>
        <Button onClick={onPick}>Other teams</Button>
        <Button variant="back" href="#play">The games</Button>
      </ButtonRow>
      {menu && <GameMenu key="end" kind="end" title="FINAL. THE GAME IS FILED." summary={summary} onBack={() => setMenu(false)}
        options={{ again: { label: "REMATCH", onSelect: onAgain }, rematch: { label: "OTHER TEAMS", onSelect: onPick }, replay: { label: "WATCH THE TAPE", onSelect: onTape }, box: { label: "THE BOX SCORE", onSelect: () => setMenu(false) }, play: true, city: true }} />}
    </Frame>
  );
}
export { goalToGo, OS };
