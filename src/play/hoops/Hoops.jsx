import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { readPad } from "../../city/gamepad.js";
import { newGame, step, rleEncode, rleDecode, resultOf, replay, VERSION, BTN, FORMATS, dirOf, LEVELS, LEVEL_ORDER } from "./sim.js";
import { TEAM_IDS, teamName, teamShort, kitsFor, FALLBACK, loadLeague, sortFive, teamRating, teamOfCase, citizenKeyOf, playNowPair, shownName, HINTS, CROPS } from "./roster.js";
import { draw, camFollow, camStart, CAMS, CAM_ORDER, headOf, skinOf, shade, W, H } from "./render.js";
import GameMenu from "../GameMenu.jsx";
import { sheetHints } from "../heads.js";
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
const KEEP = "hvi-hoops-exhibitions", KEEP_N = 5, LEVEL_KEY = "hvi-hoops-level", TIPS_KEY = "hvi-hoops-tips-done", LEGEND_KEY = "hvi-hoops-legend", CAM_KEY = "hvi-hoops-cam";
// The difficulty: ROOKIE for a new player, then whatever was picked last.
const readLevel = () => { try { const v = localStorage.getItem(LEVEL_KEY); return LEVELS[v] ? v : "rookie"; } catch { return "rookie"; } };
const writeLevel = (v) => { try { localStorage.setItem(LEVEL_KEY, v); } catch { /* the tab remembers */ } };
const LEVEL_NOTES = {
  rookie: "START HERE. A WIDER GREEN WINDOW, TEAMMATES WHO CUT AND GUARD TIGHT, YOUR MAN GUARDS FOR YOU WHEN YOU LET GO, FEW STEALS AND BLOCKS AGAINST YOU.",
  pro: "A FAIR GAME. A LITTLE HELP ON THE METER AND ON DEFENCE; THE CPU STILL GAMBLES LESS THAN IT COULD.",
  allstar: "THE CPU ROTATES, BLOCKS AND STEALS ALMOST AS RATED. YOUR MAN STILL GUARDS WHEN YOU LET GO.",
  hof: "THE GAME AS RATED. A TIGHT GREEN WINDOW, FULL HELP DEFENCE, NO AUTO-GUARD, AND YOU SWITCH ON DEFENCE YOURSELF (A).",
};
const readCam = () => { try { const v = localStorage.getItem(CAM_KEY); return CAMS[v] ? v : "broadcast"; } catch { return "broadcast"; } };
const writeCam = (v) => { try { localStorage.setItem(CAM_KEY, v); } catch { /* the tab remembers */ } };
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
  const [level, setLevelS] = useState(readLevel);
  const setLevel = (v) => { writeLevel(v); setLevelS(v); };
  const [game, setGame] = useState(null);   // {seed, n, home, away, cfg}
  const [done, setDone] = useState(null);
  const [tape, setTape] = useState(null);
  const [camId, setCamIdS] = useState(readCam);
  const [moreOpen, setMoreOpen] = useState(false);
  const setCamId = (v) => { writeCam(v); setCamIdS(v); };
  const mine = teamOfCase(league, me.caseId);
  const start = (home, away, f = fmt, s = shot) => {
    SFX.unlock();
    const cfg = { fmt: f, shot: s, level, home: fiveOf(league, home, me), away: fiveOf(league, away, me) };
    setDone(null); setTape(null);
    setGame({ seed: seedNow(), n: Date.now(), home, away, cfg, tips: !readFlag(TIPS_KEY, false) });
  };
  let body;
  const again = () => start(game.home, game.away, game.cfg.fmt, game.cfg.shot);
  const nextOpponent = () => { const ids = TEAM_IDS.filter(id => id !== game.home); start(game.home, ids[(ids.indexOf(game.away) + 1) % ids.length], game.cfg.fmt, game.cfg.shot); };
  const settings = () => { setDone(null); setGame(null); setTape(null); setMoreOpen(true); };
  if (tape) body = <Match key={`tape${tape.rec.at}`} game={tape.game} me={me} tape={tape.rec} camId={camId} setCamId={setCamId} onDone={() => setTape(null)} onQuit={() => setTape(null)} />;
  else if (game && !done) body = <Match key={game.n} game={game} me={me} camId={camId} setCamId={setCamId} onDone={setDone} onQuit={() => setGame(null)} onRestart={again} />;
  else if (done) body = <Done done={done} game={game} onAgain={again} onNew={nextOpponent} onSettings={settings} onTape={() => setTape({ rec: done.rec, game })} />;
  else body = <Picker league={league} me={me} mine={mine} pre={opts} fmt={fmt} setFmt={setFmt} shot={shot} setShot={setShot} level={level} setLevel={setLevel} onStart={start} camId={camId} setCamId={setCamId} moreOpen={moreOpen} />;
  return (
    <div className="hp">
      <ScreenHead title="THE COURTS" meta="BASKETBALL // EXHIBITION // FIVE ON FIVE. PICKUP PERMITTED. EVERYTHING IS RECORDED." />
      {body}
    </div>
  );
}

// ---- choosing ------------------------------------------------------------------------------------
function Picker({ league, me, mine, pre, fmt, setFmt, shot, setShot, level, setLevel, onStart, camId, setCamId, moreOpen }) {
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
      <p className="pg-lede">BASKETBALL, FIVE ON FIVE, WITH THE CITY'S OWN LEAGUE TEAMS. YOU STEER THE MAN WITH THE BALL, AND ON DEFENCE THE MAN NEAREST IT. A CONTROLLER PLAYS LIKE 2K: X SHOOTS (LET GO AT THE TOP), A PASSES, THE RIGHT STICK DRIBBLES. KEYS: ARROWS, Z SHOOTS, X PASSES, SHIFT SPRINTS. PHONES GET A PAD.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={quick}>PLAY NOW</Button>
        <span className="pg-sub">{teamName(home)}{home === mine ? " (YOUR TEAM)" : ""} V {teamName(away)}. {len}, {shot}-SECOND CLOCK, {LEVELS[level].name}.</span>
      </div>
      <div className="hp-level">
        <p className="hp-small">DIFFICULTY</p>
        <div className="hp-chips" role="radiogroup" aria-label="Difficulty">
          {LEVEL_ORDER.map(id => <button key={id} type="button" role="radio" aria-checked={level === id} className={`hp-chip${level === id ? " on" : ""}`} onClick={() => setLevel(id)}>{LEVELS[id].name}</button>)}
        </div>
        <p className="hp-small hp-level-note">{LEVEL_NOTES[level]}</p>
      </div>
      {mine ? <p className="hp-you">YOU ARE ON THE {teamName(mine)} THIS SEASON. YOU PLAY AS YOURSELF, AT YOUR RATING.</p>
        : me.caseId ? <p className="hp-you hp-dim">YOUR FILE IS NOT ON A BASKETBALL ROSTER THIS SEASON. ENTRIES ARE MADE FROM <a href="#file">MY FILE</a>.</p> : null}
      <details className="pg-more" open={moreOpen || undefined}>
        <summary>CHOOSE TEAMS, CAMERA, GAME LENGTH AND SHOT CLOCK</summary>
        <div className="pg-more-body">
          <div className="hp-chips" role="radiogroup" aria-label="Camera">
            {CAM_ORDER.map(id => <button key={id} type="button" role="radio" aria-checked={camId === id} className={`hp-chip${camId === id ? " on" : ""}`} onClick={() => setCamId(id)}>{CAMS[id].name}</button>)}
          </div>
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
      <dt>MOVE</dt><dd>LEFT STICK // ARROWS OR WASD // THE ROUND PAD ON A PHONE. RT / SHIFT SPRINTS (IT TIRES YOU; TIRED LEGS SHOOT SHORT).</dd>
      <dt>SHOOT</dt><dd>X (THE LEFT FACE BUTTON) // Z, J OR SPACE. HOLD TO RISE, LET GO AT THE TOP: THE METER'S GREEN BAND. THE GRADE SHOWS AFTER (GREEN, SLIGHTLY EARLY, LATE ...) WITH HOW OPEN YOU WERE. NEAR THE RIM: A LAYUP; A DUNKER WITH A LANE DUNKS (HOLD RT TO GO UP STRONG ANYWAY).</dd>
      <dt>PASS</dt><dd>A // X OR K: TOWARD THE STICK. B // F: BOUNCE PASS. Y // C: LOB (AN ALLEY-OOP TO A DUNKER CUTTING TO THE RIM).</dd>
      <dt>MOVES</dt><dd>RIGHT STICK: SIDEWAYS CROSSOVER (BACK-SIDE: BETWEEN THE LEGS, FRONT-SIDE: BEHIND THE BACK), BACK STEPBACK, TOWARD THE RIM DRIVE, ROUND SPIN. KEYS: Q + A DIRECTION, Q ALONE SPINS. PHONE: SWIPE THE COURT. A QUICK REVERSAL OF THE STICK IS A MOVE TOO. GOOD HANDLES BREAK ANKLES; TOO MANY MOVES LOSE THE BALL.</dd>
      <dt>PLAYS</dt><dd>LB // R: CALL A PICK (THE SCREENER SETS, THEN ROLLS OR POPS). LT // E: POST UP NEAR THE PAINT (BACK HIM DOWN, X FOR A HOOK).</dd>
      <dt>DEFENCE</dt><dd>X // Z: STEAL (REACH TOO MUCH AND IT IS A FOUL). Y // C: JUMP (BLOCK, REBOUND). B // F: TAKE A CHARGE (STAND STILL). LT // E: INTENSE D. A // X: SWITCH TO THE MAN NEAREST THE BALL.</dd>
      <dt>FOULS</dt><dd>SHOOTING FOULS (AND-ONES), REACH-INS, BLOCKS AND CHARGES, LOOSE-BALL FOULS. TWO TEAM FOULS IN A QUARTER AND THE NEXT ONE SHOOTS TWO (THE BONUS). THREE PERSONALS AND A STAND-IN TAKES YOUR PLACE. AT THE LINE: HOLD X, LET GO AT THE TOP; TEN SECONDS AND IT IS A VIOLATION.</dd>
      <dt>CAMERA</dt><dd>V // VIEW (SELECT): 2K BROADCAST, 2K STEADY, DRIVE, CLASSIC.</dd>
      <dt>PAUSE</dt><dd>ENTER / ESC // START</dd>
    </dl>
  );
}

export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic;
    return [["MOVE", "L STICK", `${g.rt} SPRINT`], ["SHOOT", `HOLD ${g.west}`, "LET GO AT THE TOP. ON D: STEAL."], ["PASS", `${g.south} / ${g.east} / ${g.north}`, "CHEST / BOUNCE / LOB. ON D: SWITCH / CHARGE / BLOCK."], ["MOVES", "R STICK", "SIDE CROSS, BACK STEPBACK, ROUND SPIN."], ["PICK", g.lb, ""], ["POST", g.lt, "ON D: INTENSE D."], ["CAMERA", g.view, ""], ["PAUSE", g.start, ""]];
  }
  if (mode === "touch") return [["MOVE", "THE ROUND PAD", ""], ["SHOOT", "HOLD SHOOT", "LET GO AT THE TOP."], ["PASS", "PASS / LOB", "TOWARD THE PAD."], ["MOVES", "SWIPE THE COURT", "SIDE CROSS, BACK STEPBACK, CIRCLE SPIN."], ["SPRINT", "SPRINT", ""], ["DEFENCE", "STEAL / BLOCK / CHARGE / SWITCH", ""], ["PAUSE", "START", ""]];
  return [["MOVE", "←↑↓→ / WASD", "SHIFT SPRINTS."], ["SHOOT", "HOLD Z / J / SPACE", "LET GO AT THE TOP. ON D: STEAL."], ["PASS", "X / K", "F BOUNCE, C LOB. ON D: X SWITCH, C BLOCK, F CHARGE."], ["MOVES", "Q + ARROW", "Q ALONE: SPIN."], ["PICK", "R", ""], ["POST", "E", "ON D: INTENSE D."], ["CAMERA", "V", ""], ["PAUSE", "ENTER / ESC", ""]];
}
// The names of the shoot, pass and block buttons for the tips, by how you are playing.
function keyNames(mode, family) {
  if (mode === "pad") { const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic; return { shoot: g.west, pass: g.south, block: g.north }; }
  if (mode === "touch") return { shoot: "SHOOT", pass: "PASS", block: "BLOCK" };
  return { shoot: "Z", pass: "X", block: "C" };
}
// The 2K button names, by position, on each pad family.
const PAD_GLYPHS = {
  xbox: { west: "X", south: "A", east: "B", north: "Y", rt: "RT", lt: "LT", lb: "LB", view: "VIEW", start: "MENU" },
  playstation: { west: "□", south: "✕", east: "○", north: "△", rt: "R2", lt: "L2", lb: "L1", view: "SHARE", start: "OPTIONS" },
  switch: { west: "Y", south: "B", east: "A", north: "X", rt: "ZR", lt: "ZL", lb: "L", view: "−", start: "+" },
  generic: { west: "X", south: "A", east: "B", north: "Y", rt: "RT", lt: "LT", lb: "LB", view: "SELECT", start: "START" },
};
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
      // the head only (heads.js); when a prop is part of it, a head drawn from the photo's skin and hair
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
// The home side's paint: the darker of its two colours, darker still.
const lumOf = (h) => { const n = parseInt(h.slice(1), 16); return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
const paintOf = (kit) => shade(lumOf(kit[0]) < lumOf(kit[1]) ? kit[0] : kit[1], 0.62);
const clockOf = (f) => { const s = Math.max(0, Math.ceil(f / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function Match({ game, me, tape = null, camId, setCamId, onDone, onQuit, onRestart }) {
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
  const [tip, setTip] = useState(null);
  const modeRef = useRef("keys"), padRef = useRef(null);
  const pausedRef = useRef(false), mutedRef = useRef(muted), skipRef = useRef(false), camRef = useRef(camStart(camId)), camIdRef = useRef(camId);
  camIdRef.current = camId;
  const cycleCam = () => { const id = CAM_ORDER[(CAM_ORDER.indexOf(camIdRef.current) + 1) % CAM_ORDER.length]; setCamId(id); };
  mutedRef.current = muted;
  const togglePause = (v) => { pausedRef.current = v ?? !pausedRef.current; setPaused(pausedRef.current); };
  const teams = [teamName(home), teamName(away)], shorts = [teamShort(home), teamShort(away)];
  const mode = pad ? "pad" : touch ? "touch" : "keys";
  modeRef.current = mode; padRef.current = pad;

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
    let raf, last = performance.now(), acc = 0, hudKey = "", ended = false, scoreKey = "0-0", noteSeen = -1;
    // first-game tips: shoot, pass, defend, the line; each until it is done (or it has had its time)
    const tips = game.tips && !tape && !cfg.auto ? { stage: 0, shown: 0, key: "" } : null;
    const tipStep = () => {
      if (!tips) return;
      const P = st.p[st.ctl], has = st.ball.st === "held" && st.ball.own === P.g && st.phase === "live";
      const K = keyNames(modeRef.current, padRef.current);
      for (const e of st.ev) {
        if (tips.stage === 0 && (e === "shoot" || e === "shoot3" || e === "slam") && st.note?.team === 0) tips.stage = 1;
        else if (tips.stage === 1 && (e === "pass" || e === "lob") && st.note?.team === 0) tips.stage = 2;
      }
      let want = null;
      if (st.phase === "ft" && st.ft && st.p[st.ft.g].t === 0 && !tips.ft) { want = `${K.shoot}: HOLD, LET GO AT THE TOP OF THE METER`; if (st.ev.includes("ftshot")) tips.ft = true; }
      else if (has && tips.stage === 0) want = `HOLD ${K.shoot}, LET GO AT THE TOP`;
      else if (has && tips.stage === 1) want = `${K.pass} TO PASS (THE STICK PICKS WHO)`;
      else if (st.phase === "live" && st.poss === 1 && tips.stage >= 1 && !tips.d) { want = `ON DEFENCE: STAY BETWEEN YOUR MAN AND THE RIM. ${K.shoot} STEALS, ${K.block} BLOCKS`; if (++tips.shown > 360) tips.d = true; }
      if (tips.stage >= 2 && tips.d && tips.ft) { writeFlag(TIPS_KEY, true); }
      if (want !== tips.key) { tips.key = want; setTip(want); }
    };
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
      if (inp.camera) cycleCam();
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
              const mood = crowdFor(N.k, N.team);
              if (mood) { fx.mood = mood; fx.t = 0; if (!skipRef.current) SFX.crowd(mood, mutedRef.current, N.k, st.buzzer); }
              if (N.k === "dunk") { fx.dunk = { side: dirOf(N.team), age: 0 }; fx.shake = 10; }
            }
            tipStep();
            if (st.phase === "over") { if (tips) writeFlag(TIPS_KEY, true); finish(); }
          }
        }
      } else acc = 0;
      if (camRef.current.id !== camIdRef.current) camRef.current = { ...camStart(camIdRef.current), x: camRef.current.x };
      camRef.current = camFollow(camRef.current, st);
      fx.t++; if (fx.t > 140) fx.mood = "idle";
      if (fx.dunk) fx.dunk.age++;
      if (fx.shake > 0) fx.shake--;
      draw(ctx, st, looks, camRef.current, st.frame, fx, reduced);
      const F = FORMATS[st.cfg.fmt], H0 = st.ball.st === "held" ? st.p[st.ball.own] : null;
      const off = st.poss === 0, ctlP = st.p[st.ctl];
      const period = !F.periods ? "TO 21" : st.q > F.periods ? `OT${st.q - F.periods > 1 ? st.q - F.periods : ""}` : `Q${st.q}`;
      const key = `${st.score}|${period}|${Math.ceil(st.clock / 60)}|${Math.ceil(st.shot / 60)}|${off}|${st.ctl}|${st.phase}|${st.tf}|${ctlP.pf}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud({ score: [...st.score], period, clock: F.periods ? clockOf(st.clock) : "", shot: Math.max(0, Math.ceil(st.shot / 60)), off: off || (st.phase === "ft" && st.ft && st.p[st.ft.g].t === 0), poss: st.poss, ctl: cfg.auto ? "" : names[ctlP.g], pf: ctlP.pf, has: H0 ? H0.t : -1, over: st.phase === "over", tf: [...st.tf], bonus: [st.tf[1] > F.bonus, st.tf[0] > F.bonus] });
      }
      const sk = `${st.score[0]}-${st.score[1]}`;
      if (sk !== scoreKey) { scoreKey = sk; setSr(`${shorts[0]} ${st.score[0]}, ${shorts[1]} ${st.score[1]}.`); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLegend = () => setLegendOpen(v => { writeFlag(LEGEND_KEY, !v); return !v; });
  const toggleMute = () => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); };
  const kits = kitsFor(home, away);
  return (
    <div className="hp-match">
      <div className="hp-board" role="group" aria-label="Scoreboard">
        <span className="tm" style={{ borderColor: kits[0][0] }}><b>{shorts[0]}<small>FOULS {hud?.tf[0] ?? 0}{hud?.bonus[0] ? " · BONUS" : ""}</small></b><em>{hud?.score[0] ?? 0}</em>{hud?.has === 0 && <i aria-label="ball">●</i>}</span>
        <span className="mid"><b>{hud?.period || "Q1"}</b>{hud?.clock && <span>{hud.clock}</span>}<small>SHOT {hud?.shot ?? cfg.shot}</small></span>
        <span className="tm away" style={{ borderColor: kits[1][0] }}>{hud?.has === 1 && <i aria-label="ball">●</i>}<em>{hud?.score[1] ?? 0}</em><b>{shorts[1]}<small>FOULS {hud?.tf[1] ?? 0}{hud?.bonus[1] ? " · BONUS" : ""}</small></b></span>
      </div>
      <div className="hp-call" aria-live="polite" aria-atomic="true">{call || " "}<span className="sr-only"> {sr}</span></div>
      <div className="hp-stage" ref={wrapRef}>
        <div className="hp-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Basketball: ${teams[0]} against ${teams[1]}`} {...(touch && !tape ? swipeHandlers(inputRef) : {})} />
          {tip && !paused && <div className="hp-tip" role="status">{tip}</div>}
          {tape && <div className="hp-tape">THE TAPE // {skipping ? "TO THE END" : "2X"}</div>}
        </div>
      </div>
      {!tape && hud?.ctl && <p className="hp-ctl">YOU: <b>{hud.ctl}</b> {hud.off ? "// ON OFFENCE" : "// ON DEFENCE"}{hud.pf ? ` // ${hud.pf} FOUL${hud.pf > 1 ? "S" : ""}` : ""}</p>}
      {touch && !tape && <TouchPad input={inputRef} off={hud?.off} onStart={() => togglePause()} />}
      {paused && <GameMenu key="pause" kind="pause" title="PAUSED." summary="THE DEPARTMENT HAS STOPPED THE CLOCK. IT DOES NOT USUALLY." onBack={() => togglePause(false)}
        options={{ resume: () => togglePause(false), restart: !tape && onRestart, camera: { label: `CAMERA: ${CAMS[camId].name}`, onSelect: cycleCam }, controls: <Legend mode={mode} family={pad} compact />, sound: { on: !muted, onSelect: toggleMute }, quit: { label: tape ? "STOP THE TAPE" : "LEAVE THE COURT", onSelect: onQuit } }} />}
      {!tape && <Legend mode={mode} family={pad} open={legendOpen} onToggle={toggleLegend} />}
      <ButtonRow>
        <Button onClick={() => togglePause()}>{paused ? "Resume" : "Pause"}</Button>
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        <Button onClick={cycleCam}>Camera: {CAMS[camId].name}</Button>
        {tape && <Button onClick={() => { skipRef.current = true; setSkipping(true); }}>Skip to the end</Button>}
        <Button variant="back" onClick={onQuit}>{tape ? "Stop the tape" : "Leave the court"}</Button>
      </ButtonRow>
      <p className="hp-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
    </div>
  );
}

// A swipe on the court: a dribble move that way (screen right = toward the right-hand rim), a circle
// = a spin.
function swipeHandlers(input) {
  let path = null;
  return {
    onPointerDown: (e) => { path = [[e.clientX, e.clientY]]; },
    onPointerMove: (e) => { if (path) path.push([e.clientX, e.clientY]); },
    onPointerUp: (e) => {
      if (!path) return;
      path.push([e.clientX, e.clientY]);
      const [x0, y0] = path[0], [x1, y1] = path[path.length - 1], dx = x1 - x0, dy = y1 - y0;
      let turn = 0;
      for (let i = 2; i < path.length; i++) {
        const a = Math.atan2(path[i - 1][1] - path[i - 2][1], path[i - 1][0] - path[i - 2][0]), b = Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]);
        let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d;
      }
      path = null;
      if (Math.abs(turn) > 4) { input.current?.swipe(0, true); return; }
      if (Math.hypot(dx, dy) < 24) return;
      let bits = 0;
      if (dx > Math.abs(dy) * 0.45) bits |= BTN.RSR; else if (-dx > Math.abs(dy) * 0.45) bits |= BTN.RSL;
      if (dy > Math.abs(dx) * 0.45) bits |= BTN.RSD; else if (-dy > Math.abs(dx) * 0.45) bits |= BTN.RSU;
      input.current?.swipe(bits);
    },
    onPointerCancel: () => { path = null; },
  };
}

// The phone's pad: one eight-way surface and five buttons, labelled for the side you are on.
const TOUCH_SLOTS = [
  { k: "x", off: ["SHOOT", BTN.X], def: ["STEAL", BTN.X], cls: "a" },
  { k: "a", off: ["PASS", BTN.A], def: ["SWITCH", BTN.A], cls: "b" },
  { k: "y", off: ["LOB", BTN.Y], def: ["BLOCK", BTN.Y], cls: "c" },
  { k: "rt", off: ["SPRINT", BTN.RT], def: ["SPRINT", BTN.RT], cls: "d" },
  { k: "e", off: ["PICK", BTN.LB], def: ["CHARGE", BTN.B], cls: "e" },
];
function TouchPad({ input, off, onStart }) {
  const bits = useRef({ dir: 0 });
  const push = () => input.current?.setTouch(Object.values(bits.current).reduce((a, b) => a | b, 0));
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
        {TOUCH_SLOTS.map(t => { const [label, bit] = off ? t.off : t.def; return <button key={t.k} type="button" className={t.cls} {...btn(t.k, bit)}>{label}</button>; })}
      </div>
    </div>
  );
}

// ---- the buzzer ----------------------------------------------------------------------------------------
function Done({ done, game, onAgain, onNew, onSettings, onTape }) {
  const { rec, verified } = done, r = rec.result, won = r.winner === 0;
  const [menu, setMenu] = useState(true);
  const teams = [teamName(game.home), teamName(game.away)], rows = [...game.cfg.home, ...game.cfg.away];
  const top = (t) => rows.map((row, g) => [row[1], r.pts[g], g]).filter(x => (x[2] < 5) === (t === 0)).sort((a, b) => b[1] - a[1]);
  const pct = (m, a) => `${m}/${a}${a ? ` (${Math.round((100 * m) / a)}%)` : ""}`;
  const line = won ? `${teams[0]} ${r.score[0]}, ${teams[1]} ${r.score[1]}.` : `${teams[1]} ${r.score[1]}, ${teams[0]} ${r.score[0]}.`;
  return (
    <Frame box title="FINAL" meta="EXHIBITION">
      <p className={`hp-big ${won ? "win" : "lose"}`}>{line}</p>
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
      <p className="hp-small">{LEVELS[rec.cfg.level]?.name || "ALL-STAR"} // FG {pct(r.fgm[0], r.fga[0])} AND {pct(r.fgm[1], r.fga[1])} // 3PT {pct(r.tpm[0], r.tpa[0])} AND {pct(r.tpm[1], r.tpa[1])} // FT {pct(r.ftm[0], r.fta[0])} AND {pct(r.ftm[1], r.fta[1])} // FOULS {r.fouls[0]} AND {r.fouls[1]} // TURNOVERS {r.tov[0]} AND {r.tov[1]}</p>
      <p className="hp-small">{Math.round(r.frames / 60)} SECONDS OF PLAY // {verified ? "RE-RUN FROM THE INPUT LOG: SAME RESULT. YOU ARE REPRODUCIBLE." : "THE RE-RUN DISAGREED. THE DEPARTMENT IS LOOKING INTO ITSELF."} KEPT IN THIS BROWSER ONLY.</p>
      <ButtonRow>
        <Button variant="primary" onClick={() => setMenu(true)}>Menu</Button>
        <Button onClick={onTape}>Watch the tape</Button>
      </ButtonRow>
      {menu && <GameMenu key="end" kind="end" title="FINAL." summary={line} onBack={() => setMenu(false)}
        options={{ again: onAgain, rematch: onNew, settings: onSettings, replay: { label: "WATCH THE TAPE", onSelect: onTape }, play: true, city: true }} />}
    </Frame>
  );
}
