import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { readPad } from "../../city/gamepad.js";
import GameMenu from "../GameMenu.jsx";
import { newGame, step, rleEncode, rleDecode, resultOf, replay, VERSION, BTN, LEVELS, DEFAULT_LEVEL, FORMATIONS, LENGTHS, SHOT_FULL, att, minuteOf, lineUp } from "./sim.js";
import { TEAM_IDS, teamName, teamShort, teamCode, kitsFor, keeperKits, FALLBACK, loadLeague, teamRating, teamOfCase, citizenKeyOf, playNowPair, shownName, shirtName } from "./roster.js";
import { draw, makeCam, camFollow, CAMS, W, H, shade } from "./render.js";
import { headFrom, sheetHints } from "../heads.js";
import { callFor, crowdFor } from "./calls.js";
import { createInput } from "./input.js";
import ControlsGuide, { guideSeen, markGuideSeen, glyphsFor } from "./Guide.jsx";
import * as SFX from "./audio.js";
import CSS from "./soccer.css?inline";
import "../pages.css";

// #soccer[?home=<district>][&vs=<district>][&half=3|4|6|8][&form=442|433|352][&cam=broadcast|tele|coop][&ko=1]:
// THE ESTATE PITCH, playable soccer (docs/CITY_SPEC.md "PLAYABLE SPORTS", Soccer). Phase 1: exhibitions
// only. Nothing here reaches the league, the Cup or a file: the match is kept in this browser (its seed,
// its elevens and its input log, enough to play it again) and re-run once at the whistle to show it
// reproduces.

function injectStyles() {
  let el = document.getElementById("sc-styles");
  if (!el) { el = document.createElement("style"); el.id = "sc-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const id = (k) => (TEAM_IDS.includes(q.get(k)) ? q.get(k) : null);
  const half = Number(q.get("half"));
  return { home: id("home"), vs: id("vs"), half: LENGTHS.includes(half) ? half : null, form: FORMATIONS[q.get("form")] ? q.get("form") : null, cam: CAMS[q.get("cam")] ? q.get("cam") : null, ko: q.get("ko") === "1" };
};
const KEEP = "hvi-soccer-exhibitions", KEEP_N = 5, LEVEL_KEY = "hvi-soccer-level", TIPS_KEY = "hvi-soccer-tips", LEGEND_KEY = "hvi-soccer-legend", PREF_KEY = "hvi-soccer-prefs";
export function loadRecords() { try { const j = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
function saveRecord(rec) { try { localStorage.setItem(KEEP, JSON.stringify([rec, ...loadRecords()].slice(0, KEEP_N))); } catch { /* a full or private store: the match stays in the tab */ } }
const readFlag = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch { return d; } };
const writeFlag = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* the tab remembers */ } };
// the difficulty: remembered; a new player starts on BEGINNER
const readLevel = () => { try { const v = Number(localStorage.getItem(LEVEL_KEY)); return localStorage.getItem(LEVEL_KEY) !== null && Number.isInteger(v) && LEVELS[v] ? v : DEFAULT_LEVEL; } catch { return DEFAULT_LEVEL; } };
const writeLevel = (v) => { try { localStorage.setItem(LEVEL_KEY, String(v)); } catch { /* the tab remembers */ } };
// the first-match prompts: each retires after a few uses (remembered)
const readTips = () => { try { const j = JSON.parse(localStorage.getItem(TIPS_KEY) || "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; } };
const writeTips = (t) => { try { localStorage.setItem(TIPS_KEY, JSON.stringify(t)); } catch { /* the tab remembers */ } };
const TIP_USES = 3;
// the way you are likely to play, for the guide before there is a match to ask
const guideFamily = () => { const p = readPad(); return p.connected ? p.family : null; };
const guideMode = () => (guideFamily() !== null ? "pad" : typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "keys");
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* the tab remembers */ } };
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const NOTICE = "THIS MATCH DOES NOT COUNT. THE LEAGUE TABLE IS NOT INFORMED.";
function seedNow() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch { return (Date.now() >>> 0) || 1; } }

function useMe() {
  return useMemo(() => {
    const caseId = readCaseId(), last = readLastResult(), av = last?.avatar || null;
    return { caseId, name: caseId ? `SUBJECT ${caseId.slice(-4).toUpperCase()}` : "SUBJECT", spec: av?.kind === "procedural" ? av.spec : null, url: av?.kind === "sprite" ? av.url : null };
  }, []);
}
// The eleven a match plays, names for the board, you as yourself.
function elevenOf(league, id, me) {
  const mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  return (league.teams[id] || []).slice(0, 11).map(([k, n, r]) => [k, k === mine ? me.name : shownName(n), r]);
}

export default function Soccer({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const me = useMe();
  const [league, setLeague] = useState(FALLBACK);
  useEffect(() => { let off = false; loadLeague().then(lg => { if (lg && !off) setLeague(lg); }).catch(() => {}); return () => { off = true; }; }, []);
  const prefs0 = useMemo(readPrefs, []);
  const [half, setHalf] = useState(opts.half || (LENGTHS.includes(prefs0.half) ? prefs0.half : 4));
  const [form, setForm] = useState(opts.form || prefs0.form || "442");
  const [cam, setCam] = useState(opts.cam || prefs0.cam || "broadcast");
  const [ko, setKo] = useState(opts.ko || Boolean(prefs0.ko));
  const [lock, setLock] = useState(Boolean(prefs0.lock));
  const [level, setLevelS] = useState(readLevel);
  const setLevel = (v) => { setLevelS(v); writeLevel(v); };
  const [guide, setGuide] = useState(null);   // [home, away]: the controls guide, before the first match
  useEffect(() => { writePrefs({ half, form, cam, ko, lock }); }, [half, form, cam, ko, lock]);
  const [game, setGame] = useState(null);
  const [done, setDone] = useState(null);
  const [tape, setTape] = useState(null);
  const mine = teamOfCase(league, me.caseId);
  const start = (home, away) => {
    SFX.unlock();
    const H11 = elevenOf(league, home, me), A11 = elevenOf(league, away, me);
    // the lock: your own player, by his place in the line-up the sim will build
    let lk = -1;
    if (lock && home === mine && me.caseId) { const k = citizenKeyOf(me.caseId); lk = lineUp(H11, form).findIndex(r => r[0] === k); }
    const cfg = { half, form, formB: "442", ko, level, lock: lk, home: H11, away: A11 };
    setDone(null); setTape(null);
    setGame({ seed: seedNow(), n: Date.now(), home, away, cfg, cam });
  };
  // the first match shows the controls guide first (skippable, remembered)
  const play = (home, away) => { if (!guideSeen()) { SFX.unlock(); setGuide([home, away]); } else start(home, away); };
  const leaveGuide = () => { markGuideSeen(); const g = guide; setGuide(null); if (g) start(g[0], g[1]); };
  let body;
  if (guide) body = <ControlsGuide mode={guideMode()} family={guideFamily()} onDone={leaveGuide} />;
  else if (tape) body = <Match key={`tape${tape.rec.at}`} game={tape.game} me={me} tape={tape.rec} onDone={() => setTape(null)} onQuit={() => setTape(null)} onRestart={() => {}} />;
  else if (game && !done) body = <Match key={game.n} game={game} me={me} onDone={setDone} onQuit={() => setGame(null)} onRestart={() => start(game.home, game.away)} />;
  else if (done) body = <Done done={done} game={game} onAgain={() => start(game.home, game.away)} onNew={() => start(game.home, playNowPair({ ...league, teams: Object.fromEntries(Object.entries(league.teams).filter(([k]) => k !== game.away)) }, game.home)[1])} onTape={() => setTape({ rec: done.rec, game })} onPick={() => { setDone(null); setGame(null); }} />;
  else body = <Picker league={league} me={me} mine={mine} pre={opts} {...{ half, setHalf, form, setForm, cam, setCam, ko, setKo, lock, setLock, level, setLevel }} onStart={play} />;
  return (
    <div className="sc">
      <ScreenHead title="THE ESTATE PITCH" meta="SOCCER // EXHIBITION // ELEVEN A SIDE. THE BALL IS ROUND. THE RECORD IS NOT." />
      {body}
    </div>
  );
}

// ---- choosing ----------------------------------------------------------------------------------------
function Chips({ label, value, set, items }) {
  return (
    <div className="sc-chips" role="radiogroup" aria-label={label}>
      {items.map(([v, name]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`sc-chip${value === v ? " on" : ""}`} onClick={() => set(v)}>{name}</button>)}
    </div>
  );
}
function Picker({ league, me, mine, pre, half, setHalf, form, setForm, cam, setCam, ko, setKo, lock, setLock, level, setLevel, onStart }) {
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
      <p className="pg-lede">ELEVEN A SIDE, WITH THE CITY'S OWN LEAGUE TEAMS. YOU STEER THE PLAYER ON THE BALL; ON DEFENCE, THE ONE YOU PICK. THE BUTTONS ARE EA SPORTS FC'S DEFAULTS: ON A CONTROLLER A PASSES, B SHOOTS (HOLD FOR POWER), Y PLAYS IT THROUGH, X CROSSES, RT SPRINTS. ON A KEYBOARD, FC 27'S LAYOUT: WASD MOVES, L PASSES, ; SHOOTS, O THROUGH, K CROSSES, P SPRINTS. PHONES GET A PAD.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={quick}>PLAY NOW</Button>
        <span className="pg-sub">{teamName(home)}{home === mine ? " (YOUR TEAM)" : ""} V {teamName(away)}. TWO HALVES OF {half} MINUTES{ko ? ", EXTRA TIME AND PENALTIES IF LEVEL" : ""}. DIFFICULTY: {LEVELS[level].name}.</span>
      </div>
      <div className="sc-level">
        <Chips label="Difficulty" value={level} set={setLevel} items={LEVELS.map((L, i) => [i, L.name])} />
        <span className="sc-small">{LEVEL_LINES[level]}</span>
      </div>
      {mine ? (
        <p className="sc-you">
          <button type="button" className="pg-toggle" aria-pressed={lock} onClick={() => setLock(!lock)}>PLAYER LOCK</button>
          <span>YOU ARE ON {teamName(mine)} THIS SEASON. {lock ? "YOU PLAY AS YOURSELF ONLY: A CALLS FOR THE BALL, Y CALLS FOR IT IN BEHIND." : "YOU CONTROL THE WHOLE SIDE; YOU ARE IN IT, AT YOUR RATING."}</span>
        </p>
      ) : me.caseId ? <p className="sc-you sc-dim">YOUR FILE IS NOT ON A SOCCER ROSTER THIS SEASON. ENTRIES ARE MADE FROM <a href="#file">MY FILE</a>.</p> : null}
      <details className="pg-more">
        <summary>+ TEAMS, FORMATION, LENGTH, CAMERA</summary>
        <div className="pg-more-body">
          <p className="sc-small">LENGTH:</p>
          <Chips label="Half length" value={half} set={setHalf} items={LENGTHS.map(n => [n, `${n}-MINUTE HALVES`])} />
          <Chips label="Knockout" value={ko} set={setKo} items={[[false, "A DRAW STANDS"], [true, "EXTRA TIME + PENALTIES"]]} />
          <p className="sc-small">YOUR FORMATION:</p>
          <Chips label="Formation" value={form} set={setForm} items={Object.entries(FORMATIONS).map(([k, f]) => [k, f.name])} />
          <p className="sc-small">CAMERA:</p>
          <Chips label="Camera" value={cam} set={setCam} items={Object.values(CAMS).map(c => [c.id, c.name])} />
          <p className="sc-small">YOUR TEAM:</p>
          <Chips label="Your team" value={home} set={setHome} items={TEAM_IDS.map(id => [id, `${teamShort(id)}${id === mine ? " (YOURS)" : ""}`])} />
          <p className="sc-small">THEN PICK WHO TO PLAY; THE MATCH STARTS AT ONCE. PACE, PASSING, FINISHING AND DEFENDING FOLLOW EACH PLAYER'S LEAGUE RATING; SKILL MOVES NEED THE STARS (ONE PER TEN POINTS OVER 50).</p>
          <ul className="sc-teams">
            {TEAM_IDS.filter(id => id !== home).map(id => {
              const xi = league.teams[id] || [];
              return (
                <li key={id}>
                  <button type="button" className="sc-team" onClick={() => onStart(home, id)} aria-label={`Play ${teamName(id)}, rated ${teamRating(xi)}`}>
                    <i className="sw" style={{ background: kitsFor(home, id)[1][0], borderColor: kitsFor(home, id)[1][1] }} aria-hidden="true" />
                    <span className="nm">{teamName(id)}<span className="tag">{[...xi].sort((a, b) => b[2] - a[2]).slice(0, 3).map(r => shownName(r[1])).join(", ")}{league.pos[id] ? ` // ${ordinal(league.pos[id])} IN THE LEAGUE` : ""}</span></span>
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
      <p className="sc-notice"><b>EXHIBITION.</b> {NOTICE} NOT IN THE STANDINGS, NOT IN THE CUP, NOT ON YOUR FILE. THE DEPARTMENT KEEPS THE TAPE ANYWAY.</p>
      <p className="sc-small">ROSTERS: SEASON {league.season || "?"}, MACHINE DAY {league.day}{league.live ? ", AS DRAFTED" : ". THE LIVE LEAGUE DID NOT ANSWER; THESE ARE THE ROSTERS ON FILE"}. THE LOWEST RATED KEEPS GOAL, AS IN THE LEAGUE.</p>
    </>
  );
}
const LEVEL_LINES = [
  "THE EASIEST. A SLOWER GAME, HELP WITH PASSING, SHOOTING AND DEFENDING, A TEAMMATE PRESSES WITH YOU. START HERE.",
  "A LITTLE SLOWER, STILL HELPED. THE CPU IS FORGIVING.",
  "FULL SPEED, SOME HELP. AN EVEN GAME FOR MOST PLAYERS.",
  "LESS HELP. THE CPU TAKES ITS CHANCES.",
  "LITTLE HELP. THE CPU PRESSES AND PUNISHES MISTAKES.",
  "THE HARDEST. ALMOST NO HELP.",
];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;

function Controls() {
  const k = glyphsFor("keys"), x = glyphsFor("pad", "xbox"), p = glyphsFor("pad", "playstation"), both = (c) => `${x[c]} / ${p[c]} / KEY ${k[c]}`;
  return (
    <dl className="sc-keys">
      <dt>BUTTONS</dt><dd>EA SPORTS FC'S DEFAULTS, BY POSITION (XBOX / PLAYSTATION / KEYBOARD, FC 27'S WASD LAYOUT). A SWITCH PAD USES THE SAME POSITIONS.</dd>
      <dt>MOVE</dt><dd>LEFT STICK / WASD / THE ROUND PAD ON A PHONE. {both("RT")} SPRINTS. {both("LT")}: SHIELD THE BALL (ATTACKING), JOCKEY (DEFENDING).</dd>
      <dt>PASS</dt><dd>{both("A")}: ALONG THE GROUND TO THE TEAMMATE YOU POINT AT. CONTROL GOES WITH THE BALL.</dd>
      <dt>THROUGH</dt><dd>{both("Y")}: INTO THE SPACE AHEAD OF A RUNNER. HOLD LONGER TO PLAY IT FURTHER. WITH {x.LB} / {p.LB} / {k.LB}, LOBBED.</dd>
      <dt>LOB / CROSS</dt><dd>{both("X")}: IN THE AIR. FROM WIDE IN THE LAST THIRD IT IS A CROSS; UP OR DOWN PICKS THE FAR OR NEAR POST.</dd>
      <dt>SHOOT</dt><dd>{both("B")}: HOLD FOR POWER (THE BAR UNDER YOU; THE RED END GOES OVER), LET GO. UP OR DOWN AIMS FOR THAT POST. {x.RB} + {x.B} CURLS IT (FINESSE), {x.LB} + {x.B} CHIPS IT. {x.B} THEN {x.A} QUICKLY: A FAKE SHOT.</dd>
      <dt>SKILLS</dt><dd>RIGHT STICK / ARROW KEYS / A SWIPE ON THE PICTURE. TOWARD GOAL: STEP-OVER (2 STARS), TWICE: HEEL FLICK (3). AWAY: ROULETTE (3). ACROSS: BALL ROLL (2). A TRICK ABOVE YOUR STARS IS A STUMBLE. TAP {x.LB} ALONE: A TEAMMATE MAKES A RUN.</dd>
      <dt>DEFENCE</dt><dd>{both("A")} HOLD: CONTAIN. {both("B")}: STANDING TACKLE (CLOSE BEHIND HIM: A PUSH). {both("X")}: SLIDE (FROM BEHIND IS A FOUL, MAYBE A CARD). {both("RB")} HOLD: A TEAMMATE CONTAINS TOO. {both("Y")} HOLD: YOUR KEEPER RUSHES OUT.</dd>
      <dt>SWITCH</dt><dd>{both("LB")}: THE MAN NEAREST THE BALL. RIGHT STICK / ARROWS: THE MAN THAT WAY.</dd>
      <dt>SET PIECES</dt><dd>FREE KICKS IN RANGE: AIM WITH THE LEFT STICK, RIGHT STICK LEFT / RIGHT FOR CURL AND UP / DOWN FOR HEIGHT, HOLD B FOR POWER. PENALTIES: UP OR DOWN FOR A SIDE, HOLD B. FACING ONE: HOLD UP OR DOWN AS IT IS STRUCK. CORNERS AND THROW-INS: A SHORT, X LONG. YOUR KEEPER WITH THE BALL: A THROWS, X OR B KICKS.</dd>
      <dt>LAWS</dt><dd>OFFSIDE, FOULS, YELLOW AND RED CARDS (TWO YELLOWS ARE A RED), PENALTIES, CORNERS, GOAL KICKS, THROW-INS. THE ENDS CHANGE AT HALF TIME. ADDED TIME FOR STOPPAGES.</dd>
      <dt>PAUSE</dt><dd>ESC / ENTER // MENU / OPTIONS / +</dd>
    </dl>
  );
}
export function legendRows(mode, family, off = true) {
  if (mode === "touch") return off
    ? [["MOVE", "THE ROUND PAD", ""], ["PASS", "PASS", ""], ["THROUGH", "THRU", ""], ["SHOOT", "HOLD SHOOT", "LET GO."], ["CROSS", "CROSS", ""], ["SPRINT", "SPRINT", ""], ["SKILLS", "SWIPE THE PITCH", ""]]
    : [["MOVE", "THE ROUND PAD", ""], ["CONTAIN", "CONTAIN", "HOLD."], ["TACKLE", "TACKLE", ""], ["SLIDE", "SLIDE", ""], ["KEEPER", "KEEPER", "HOLD: RUSH OUT."], ["SWITCH", "SWITCH", ""], ["SPRINT", "SPRINT", ""]];
  const g = glyphsFor(mode, family), move = mode === "keys" ? "WASD" : "LEFT STICK";
  return off
    ? [["MOVE", move, ""], ["SPRINT", g.RT, ""], ["PASS", g.A, "TOWARD THE STICK."], ["THROUGH", g.Y, "HOLD: FURTHER."], ["CROSS", g.X, "LOB / CROSS."], ["SHOOT", `HOLD ${g.B}`, "LET GO. RED IS OVER."], ["FINESSE", `${g.RB} + ${g.B}`, ""], ["CHIP", `${g.LB} + ${g.B}`, ""], ["SHIELD", g.LT, ""], ["SKILLS", g.RS, ""], ["RUN", `TAP ${g.LB}`, "A TEAMMATE RUNS."], ["PAUSE", g.start, ""]]
    : [["MOVE", move, ""], ["SPRINT", g.RT, ""], ["CONTAIN", `HOLD ${g.A}`, ""], ["TACKLE", g.B, ""], ["SLIDE", g.X, "NOT FROM BEHIND."], ["MATE", `HOLD ${g.RB}`, "TEAMMATE CONTAIN."], ["JOCKEY", g.LT, ""], ["SWITCH", `${g.LB} / ${g.RS}`, ""], ["KEEPER", `HOLD ${g.Y}`, "RUSH OUT."], ["PAUSE", g.start, ""]];
}
function Legend({ mode, family, off, open, onToggle }) {
  const rows = legendRows(mode, family, off), label = mode === "pad" ? `CONTROLLER (${String(family || "pad").toUpperCase()})` : mode === "touch" ? "TOUCH" : "KEYBOARD";
  return (
    <section className="sc-legend" aria-label="Controls">
      <button type="button" className="sc-legend-head" aria-expanded={open} onClick={onToggle}><span>CONTROLS // {label} // {off ? "ATTACKING" : "DEFENDING"}</span><span aria-hidden="true">{open ? "HIDE ▴" : "SHOW ▾"}</span></button>
      {open && <dl className="sc-legend-rows">{rows.map(([k, keys, hint]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd>{hint && <span>{hint}</span>}</dd></div>)}</dl>}
    </section>
  );
}

// ---- how everyone looks ---------------------------------------------------------------------------------
function looksFor(st, home, away, me) {
  const kits = kitsFor(home, away), gks = keeperKits(kits), mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  return st.p.map(P => {
    const kit = kits[P.t], gk = P.role === "GK", key = P.key;
    const look = { shirt: gk ? gks[P.t] : kit[0], shorts: gk ? shade(gks[P.t], 0.6) : kit[1], socks: gk ? gks[P.t] : kit[0], trim: gk ? "#0a0f0a" : kit[1], gloves: "#f0f0f0", num: gk ? 1 : P.i + 1, skin: "#c68c5e", hair: null, head: null };
    const isMe = key === mine;
    const sheetP = isMe ? (me.url ? loadSprite(me.url, { sector: null }).catch(() => null) : Promise.resolve(null))
      : key.startsWith("citizen-") || key.startsWith("stand-in") ? Promise.resolve(null)
        : loadSprite(`/api/sprite/${key}`, { sector: null }).catch(() => null);
    sheetP.then(sheet => {
      const s = sheet || paintAvatar(isMe && me.spec ? me.spec : DEFAULT_SPEC, 1);
      const hd = headFrom(s, null);
      if (hd) { look.head = hd; return; }
      const cue = sheetHints(s);
      if (cue.skin) look.skin = cue.skin;
      if (cue.hair) look.hair = cue.hair;
    });
    return look;
  });
}

// ---- the match ----------------------------------------------------------------------------------------------
const snapOf = (st) => ({
  frame: st.frame, attOf: (t) => att(st, t),
  p: st.p.map(P => ({ x: P.x, y: P.y, z: P.z, vx: P.vx, vy: P.vy, fx: P.fx, fy: P.fy, act: P.act ? { kind: P.act.kind, f: P.act.f, dir: P.act.dir, hi: P.act.hi } : null, off: P.off, t: P.t, i: P.i, g: P.g, role: P.role, yc: P.yc })),
  ball: { x: st.ball.x, y: st.ball.y, z: st.ball.z, vx: st.ball.vx, vy: st.ball.vy },
});
const REPLAY_BACK = 240;
function Match({ game, me, tape = null, onDone, onQuit, onRestart }) {
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
  const [camId, setCamId] = useState(game.cam || "broadcast");
  const [skipping, setSkipping] = useState(false);
  const [tip, setTip] = useState("");
  const pausedRef = useRef(false), mutedRef = useRef(muted), skipRef = useRef(false), camRef = useRef(null), stRef = useRef(null);
  mutedRef.current = muted;
  const togglePause = (v) => { pausedRef.current = v ?? !pausedRef.current; setPaused(pausedRef.current); };
  const teams = [teamName(home), teamName(away)], codes = [teamCode(home), teamCode(away)];
  const mode = pad ? "pad" : touch ? "touch" : "keys";
  const kits = kitsFor(home, away);

  useEffect(() => { const f = () => setTouch(true); window.addEventListener("touchstart", f, { once: true, passive: true }); return () => window.removeEventListener("touchstart", f); }, []);
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = Math.max(200, window.innerHeight - (touch ? 330 : 220));
      setScale(Math.max(1, Math.floor(Math.min(w / W, h / H) * dpr)) / dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrapRef.current); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, [touch]);
  useEffect(() => { if (camRef.current) { const c = makeCam(camId); c.x = camRef.current.x; camRef.current = c; } }, [camId]);

  useEffect(() => {
    const st = newGame(seed, cfg, tape?.version || VERSION), log = [], masks = tape ? rleDecode(tape.inputLog) : null;
    stRef.current = st;
    if (import.meta.env?.DEV && typeof window !== "undefined") { window.__hviSoccer = st; import("./sim.js").then(m => { window.__hviSoccerSim = m; }); }   // for the browser checks (dev only)
    let ti = 0;
    const input = createInput(); inputRef.current = input;
    const looks = looksFor(st, home, away, me);
    const names = st.p.map(P => shirtName(P.name));
    const reduced = REDUCED();
    const cam = makeCam(game.cam || "broadcast"); camRef.current = cam;
    const ctx = canvasRef.current.getContext("2d");
    const buf = [];   // the last seconds, for the goal replay
    let raf, last = performance.now(), acc = 0, hudKey = "", ended = false, noteSeen = -1, mood = "idle", moodT = 0, rep = null, chantAt = 0, banner = "", bannerT = 0;
    const onVis = () => { if (document.hidden && !tape) togglePause(true); };
    document.addEventListener("visibilitychange", onVis);
    const finish = () => {
      ended = true;
      if (tape) { setTimeout(() => onDone(null), 1500); return; }
      const rec = { version: VERSION, seed, cfg, home, away, inputLog: rleEncode(log), result: resultOf(st), at: Date.now() };
      let verified = false;
      try { verified = JSON.stringify(replay(rec)) === JSON.stringify(rec.result); } catch { verified = false; }
      saveRecord(rec);
      setTimeout(() => onDone({ rec, verified }), 2400);
    };
    const hz = Number.isInteger(cfg.level) ? LEVELS[cfg.level]?.hz || 60 : cfg.easy ? 48 : 60;   // the lower levels: the same match, played slower
    // the first-match prompts: the button for what you are doing now, until it has been used a few times
    const tips = readTips();
    let tipId = "", tipAt = 0;
    const TIPS = { shoot: BTN.B, pass: BTN.A, through: BTN.Y, cross: BTN.X, tackle: BTN.B, contain: BTN.A, switch: BTN.LB };
    const tipText = (id, gl) => ({ shoot: `${gl.B}: SHOOT (HOLD FOR POWER)`, pass: `${gl.A}: PASS`, through: `${gl.Y}: THROUGH BALL`, cross: `${gl.X}: CROSS`, tackle: `${gl.B}: TACKLE`, contain: `HOLD ${gl.A}: CONTAIN`, switch: `${gl.LB}: CHANGE PLAYER` }[id]);
    const pickTip = () => {
      if (tape || cfg.auto || st.phase !== "live") return "";
      const P = st.p[st.ctl], b = st.ball, a = att(st, 0);
      if (!P) return "";
      const fresh = (id) => (tips[id] || 0) < TIP_USES;
      if (b.own === P.g) {
        const u = a * P.x, wide = Math.abs(P.y - 34) > 13;
        if (u > 18 && !wide && fresh("shoot")) return "shoot";
        if (u > 22 && wide && fresh("cross")) return "cross";
        if (fresh("pass")) return "pass";
        if (u > -5 && fresh("through")) return "through";
        return "";
      }
      if (b.own >= 0 && st.p[b.own].t === 1) {
        const V = st.p[b.own], d = Math.hypot(V.x - P.x, V.y - P.y);
        if (d < 2.5 && fresh("tackle")) return "tackle";
        if (d < 6 && fresh("contain")) return "contain";
        if (d > 12 && fresh("switch")) return "switch";
      }
      return "";
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      const inp = input.sample();
      if (inp.pad !== undefined) setPad(p => (p === inp.pad ? p : inp.pad));
      if (inp.start && !ended) { if (rep) rep.i = rep.frames.length; else togglePause(); }
      // the goal replay: the sim waits (nothing stepped, nothing logged), the tape runs at half speed
      if (rep) {
        rep.k += reduced ? 1 : 0.5;
        if (inp.mask & (BTN.A | BTN.B) && rep.k > 20) rep.i = rep.frames.length;
        rep.i = Math.max(rep.i, Math.floor(rep.k));
        const v = rep.frames[Math.min(rep.i, rep.frames.length - 1)];
        if (rep.i >= rep.frames.length) { rep = null; acc = 0; }
        else { camFollow(cam, v); draw(ctx, v, looks, { cam, frame: v.frame, mood: "roar", moodT: (moodT += 1), reduced, ctl: -1, banner: "REPLAY", radar: false }); return; }
      }
      const held = import.meta.env?.DEV && window.__hviSoccerHold;   // dev only: freeze the match for a staged screenshot
      if (!pausedRef.current && !held) {
        acc += dt;
        let n = 0;
        const per = tape ? (skipRef.current ? 400 : 2) : 1;
        while (acc >= 1 / hz && n < 8 && !rep) {
          acc -= 1 / hz; n++;
          for (let k = 0; k < per && !ended && !rep; k++) {
            const m = tape ? (masks[ti++] ?? 0) : inp.mask;
            if (!tape) log.push(m);
            if (tipId && m & TIPS[tipId] && !(st.mask & TIPS[tipId])) { tips[tipId] = (tips[tipId] || 0) + 1; writeTips(tips); tipAt = -999; }
            step(st, m);
            if (!tape || !skipRef.current) { buf.push(snapOf(st)); if (buf.length > REPLAY_BACK + 60) buf.shift(); }
            if (!tape || !skipRef.current) SFX.play(st.ev, mutedRef.current);
            const N = st.note;
            if (N && N.frame === st.frame && N.frame !== noteSeen) {
              noteSeen = N.frame;
              const line = callFor(N, names, teams, N.frame);
              if (line) { setCall(line); setSr(line); }
              const kind = crowdFor(N.k, N.team === 0);
              if (kind && !skipRef.current) SFX.crowd(kind, mutedRef.current);
              if (N.k === "goal" || N.k === "owngoal") { mood = "roar"; moodT = 0; banner = "GOAL"; bannerT = 150; }
              else if (kind === "ooh" || kind === "cheer") { mood = "cheer"; moodT = 0; }
              if (N.k === "offside") { banner = "OFFSIDE"; bannerT = 90; }
              if (N.k === "foul" || N.k === "penfoul") { banner = N.card ? (N.card === "yellow" ? "YELLOW CARD" : "RED CARD") : N.k === "penfoul" ? "PENALTY" : "FOUL"; bannerT = 100; }
              if (N.k === "halftime") { banner = "HALF TIME"; bannerT = 150; }
            }
            // the replay starts once the scorer has turned away
            if (st.phase === "goal" && st.t === 100 && !tape && !st.so && buf.length > 60) {
              const end = buf.length - 100;
              rep = { frames: buf.slice(Math.max(0, end - REPLAY_BACK + 40), end + 30), i: 0, k: 0 };
            }
            if (st.phase === "over") finish();
          }
        }
        if (!tape && st.phase === "live" && st.frame - chantAt > 1500 && (st.frame * 13) % 997 < 2) { chantAt = st.frame; SFX.chant(mutedRef.current); }
      } else acc = 0;
      if (st.frame - tipAt > 20) {
        tipAt = st.frame;
        const id = pickTip();
        if (id !== tipId) { tipId = id; const p = readPad(); setTip(id ? tipText(id, glyphsFor(p.connected ? "pad" : "keys", p.connected ? p.family : null)) : ""); }
      }
      camFollow(cam, st);
      moodT++; if (moodT > 160) mood = "idle";
      if (bannerT > 0) bannerT--;
      const ctlP = st.p[st.ctl], rs = st.rs;
      let power = null, aim = null, b2 = bannerT > 0 ? banner : "";
      const human = !cfg.auto && !tape;
      if (human && st.shotArm && st.ball.own === ctlP.g) power = { g: ctlP.g, f: st.shotArm.f, full: SHOT_FULL };
      else if (human && st.held.Y && st.ball.own === ctlP.g) power = { g: ctlP.g, f: st.held.Y, full: 40, color: "#5cff8a" };
      else if (human && st.held.X && st.ball.own === ctlP.g) power = { g: ctlP.g, f: st.held.X, full: 40, color: "#7ab8ff" };
      if (st.phase === "dead" && rs && rs.team === 0 && human) {
        if (st.aim) aim = { ...st.aim, team: 0 };
        if (st.held.B) power = { g: rs.taker, f: st.held.B, full: SHOT_FULL };
        if (!b2 && st.t > rs.wait) b2 = rs.type === "pen" ? "PENALTY: UP/DOWN TO AIM, HOLD B" : rs.type === "fk" && st.aim ? "FREE KICK: AIM, HOLD B TO SHOOT" : rs.type === "corner" ? "CORNER: X TO CROSS, A SHORT" : rs.type === "throw" ? "THROW-IN: A SHORT, X LONG" : rs.type === "goal" ? "GOAL KICK: A SHORT, X LONG" : "FREE KICK: A PASS, X LONG";
      }
      if (st.phase === "dead" && rs && rs.type === "pen" && rs.team === 1 && human && !b2) b2 = "PENALTY AGAINST: HOLD UP OR DOWN TO DIVE";
      if (st.phase === "kickoff" && st.kickTeam === 0 && human && st.t > 40 && !b2) b2 = "PRESS A TO KICK OFF";
      if (st.phase === "break" && !b2) b2 = st.half === 1 ? "HALF TIME" : "BREAK";
      const view = { p: st.p, ball: st.ball, frame: st.frame, attOf: (t) => att(st, t) };
      draw(ctx, view, looks, { cam: camRef.current || cam, frame: st.frame, mood, moodT, reduced, ctl: human && st.phase !== "over" ? ctlP.g : -1, power, aim, radar: true, kits: [kits[0][0], kits[1][0]], banner: b2 });
      const min = minuteOf(st), L = st.half <= 2 ? st.halfLen : st.halfLen / 3;
      const clock = st.half === 5 ? "PENS" : st.phase === "over" ? "FT" : st.phase === "break" ? (st.half === 1 ? "HT" : "ET") : `${min}'`;
      const key = `${st.score}|${clock}|${st.added}|${st.ctl}|${st.phase}|${st.ball.own >= 0 ? st.p[st.ball.own].t : -1}|${st.pens}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud({ score: [...st.score], pens: st.pens ? [...st.pens] : null, clock, added: st.added > 0 && st.clock >= L ? st.added : 0, ctl: human ? names[ctlP.g] : "", off: st.ball.own >= 0 ? st.p[st.ball.own].t === 0 : st.ball.lastT === 0, over: st.phase === "over" });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // a swipe on the picture is a right-stick flick (skill moves; on defence, switch that way)
  const sw = useRef(null);
  const onPD = (e) => { sw.current = [e.clientX, e.clientY]; };
  const onPU = (e) => { const s = sw.current; sw.current = null; if (!s) return; const dx = e.clientX - s[0], dy = e.clientY - s[1]; if (Math.abs(dx) + Math.abs(dy) > 24) inputRef.current?.flick(dx, dy); };
  const toggleLegend = () => setLegendOpen(v => { writeFlag(LEGEND_KEY, !v); return !v; });
  const toggleMute = () => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); };
  const nextCam = () => { const ids = Object.keys(CAMS); setCamId(ids[(ids.indexOf(camId) + 1) % ids.length]); };
  return (
    <div className="sc-match">
      <div className="sc-board" role="group" aria-label="Score">
        <span className="tm" style={{ borderColor: kits[0][0] }}><b>{codes[0]}</b><em>{hud?.score[0] ?? 0}</em></span>
        <span className="mid"><b>{hud?.clock || "0'"}</b>{hud?.added ? <small>+{hud.added}</small> : null}{hud?.pens && <small>PENS {hud.pens[0]}-{hud.pens[1]}</small>}</span>
        <span className="tm away" style={{ borderColor: kits[1][0] }}><em>{hud?.score[1] ?? 0}</em><b>{codes[1]}</b></span>
      </div>
      <div className="sc-call" aria-live="polite" aria-atomic="true">{call || " "}<span className="sr-only"> {sr ? "" : ""}{teams[0]} {hud?.score[0] ?? 0}, {teams[1]} {hud?.score[1] ?? 0}.</span></div>
      <div className="sc-stage" ref={wrapRef}>
        <div className="sc-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Soccer: ${teams[0]} against ${teams[1]}`} onPointerDown={onPD} onPointerUp={onPU} />
          {tip && !paused && <div className="sc-tip" aria-live="polite">{tip}</div>}
          {tape && <div className="sc-tape">THE TAPE // {skipping ? "TO THE END" : "2X"}</div>}
        </div>
      </div>
      {!tape && hud?.ctl && <p className="sc-ctl">YOU: <b>{hud.ctl}</b> {hud.off ? "// ATTACKING" : "// DEFENDING"}</p>}
      {touch && !tape && <TouchPad input={inputRef} off={hud?.off} onStart={() => togglePause()} />}
      {!tape && <Legend mode={mode} family={pad} off={hud?.off ?? true} open={legendOpen} onToggle={toggleLegend} />}
      <ButtonRow>
        <Button onClick={() => togglePause()}>{paused ? "Resume" : "Pause"}</Button>
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        <Button onClick={nextCam}>Camera: {CAMS[camId].name}</Button>
        {tape && <Button onClick={() => { skipRef.current = true; setSkipping(true); }}>Skip to the end</Button>}
        <Button variant="back" onClick={onQuit}>{tape ? "Stop the tape" : "Leave the pitch"}</Button>
      </ButtonRow>
      <p className="sc-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
      {paused && !tape && (
        <GameMenu key="pause" kind="pause" title="PAUSED." summary="THE CLOCK IS STOPPED." onBack={() => togglePause(false)}
          options={{ resume: () => togglePause(false), restart: onRestart, controls: <ControlsGuide mode={mode} family={pad} compact tab0={hud?.off === false ? "defend" : "attack"} />, sound: { on: !muted, onSelect: toggleMute }, quit: true }} />
      )}
    </div>
  );
}

// The phone's pad: one eight-way surface; PASS / THROUGH / SHOOT / CROSS, SPRINT and SWITCH. Labels follow the ball.
function TouchPad({ input, off, onStart }) {
  const bits = useRef({ dir: 0, a: 0, b: 0, x: 0, y: 0, rt: 0, lb: 0 });
  const push = () => { const B = bits.current; input.current?.setTouch(B.dir | B.a | B.b | B.x | B.y | B.rt | B.lb); };
  const dpad = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    let d = 0;
    if (x * x + y * y > 100) {
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
    <div className="sc-touch">
      <div className="sc-dpad" onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); dpad(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") dpad(e); }} onPointerUp={dEnd} onPointerCancel={dEnd} aria-label="Direction pad" role="group">
        <span className="u" /><span className="d" /><span className="l" /><span className="r" />
      </div>
      <div className="sc-mid">
        <button type="button" className="sc-start" onClick={onStart}>START</button>
        <button type="button" className="sc-sprint" {...btn("rt", BTN.RT)}>SPRINT</button>
        <button type="button" className="sc-sprint" {...btn("lb", BTN.LB)}>{off ? "RUN" : "SWITCH"}</button>
      </div>
      <div className="sc-abxy">
        <button type="button" className="y" {...btn("y", BTN.Y)}>{off ? "THRU" : "KEEPER"}</button>
        <button type="button" className="x" {...btn("x", BTN.X)}>{off ? "CROSS" : "SLIDE"}</button>
        <button type="button" className="b" {...btn("b", BTN.B)}>{off ? "SHOOT" : "TACKLE"}</button>
        <button type="button" className="a" {...btn("a", BTN.A)}>{off ? "PASS" : "CONTAIN"}</button>
      </div>
    </div>
  );
}

// ---- the final whistle -------------------------------------------------------------------------------------
function Done({ done, game, onAgain, onNew, onTape, onPick }) {
  const { rec, verified } = done, r = rec.result, won = r.winner === 0, drew = r.winner < 0;
  const teams = [teamName(game.home), teamName(game.away)];
  const [menu, setMenu] = useState(true);
  const st0 = useMemo(() => newGame(rec.seed, rec.cfg), [rec]);
  const nm = (g) => (g >= 0 ? shownName(st0.p[g].name) : "AN UNKNOWN BOOT");
  const S = r.stats, poss = S.poss[0] + S.poss[1] ? Math.round((100 * S.poss[0]) / (S.poss[0] + S.poss[1])) : 50;
  const line = `${teams[0]} ${r.score[0]}, ${teams[1]} ${r.score[1]}${r.pens ? ` (${r.pens[0]}-${r.pens[1]} ON PENALTIES)` : ""}.`;
  const summary = won ? "THE DEPARTMENT HAS NOTED A WIN. IT WILL NOT BE REPEATED IN THE STANDINGS." : drew ? "A DRAW. EVERYONE IS EQUALLY UNREMARKABLE." : "AS PROJECTED. THE PROJECTION IS NOT ON YOUR FILE EITHER.";
  const rows = [["SHOTS", S.shots], ["ON TARGET", S.on], ["POSSESSION %", [poss, 100 - poss]], ["PASSES COMPLETED", S.passOk], ["CORNERS", S.corners], ["FOULS", S.fouls], ["YELLOW CARDS", S.yel], ["RED CARDS", S.red], ["OFFSIDES", S.off], ["SAVES", S.saves]];
  return (
    <>
      <Frame box title="FULL TIME" meta="EXHIBITION">
        <p className={`sc-big ${won ? "win" : drew ? "" : "lose"}`}>{line}</p>
        <p className="sc-p">{summary}</p>
        {r.goals.length > 0 && <ul className="sc-goals">{r.goals.map((g, i) => <li key={i}><b>{g.min}'</b> {nm(g.g)}{g.og ? " (OWN GOAL)" : g.pen ? " (PENALTY)" : ""} <span>{teamShort(g.t ? game.away : game.home)}</span></li>)}</ul>}
        <table className="sc-stats" aria-label="Match statistics">
          <thead><tr><th scope="col">{teamCode(game.home)}</th><th scope="col" /><th scope="col">{teamCode(game.away)}</th></tr></thead>
          <tbody>{rows.map(([k, v]) => <tr key={k}><td>{v[0]}</td><th scope="row">{k}</th><td>{v[1]}</td></tr>)}</tbody>
        </table>
        <p className="sc-notice">{NOTICE}</p>
        <p className="sc-small">{Math.round(r.frames / 60)} SECONDS OF PLAY // {verified ? "RE-RUN FROM THE INPUT LOG: SAME RESULT. YOU ARE REPRODUCIBLE." : "THE RE-RUN DISAGREED. THE DEPARTMENT IS LOOKING INTO ITSELF."} KEPT IN THIS BROWSER ONLY.</p>
        <ButtonRow>
          <Button variant="primary" onClick={onAgain}>Rematch</Button>
          <Button onClick={() => setMenu(true)}>Menu</Button>
          <Button variant="back" href="#play">The games</Button>
        </ButtonRow>
      </Frame>
      {menu && (
        <GameMenu key="end" kind="end" title="FULL TIME." summary={line} onBack={() => setMenu(false)}
          options={{ again: onAgain, rematch: onNew, settings: onPick, replay: onTape, play: true, city: { label: "BACK TO THE PITCH", href: "#city" } }} />
      )}
    </>
  );
}
