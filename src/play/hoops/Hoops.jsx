import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { readPad } from "../../city/gamepad.js";
import { newGame, step, rleEncode, rleDecode, resultOf, replay, VERSION, BTN, FORMATS, dirOf, LEVELS, LEVEL_ORDER, MODES, POS_ARCH, inPenalty } from "./engine/index.js";
import { TEAM_IDS, teamName, teamShort, kitsFor, FALLBACK, loadLeague, sortFive, teamRating, teamOfCase, citizenKeyOf, playNowPair, shownName, HINTS, CROPS, divisionsOf, divisionOf, difficultyOf, defaultLevelIndex, allClubs, ROLES, playerPool } from "./roster.js";
import { draw, camFollow, camStart, camOf, proj, CAMS, CAM_ORDER, DEFAULT_CAM, ADJ_DEFAULT, headOf, skinOf, shade, W, H } from "./render.js";
import HoopsGuide, { guideSeen, markGuideSeen, namesFor, PAD_GLYPHS } from "./Guide.jsx";
import { profileHand, usePlayMode } from "../guideKit.jsx";
import GameMenu from "../GameMenu.jsx";
import { sheetHints } from "../heads.js";
import { callFor, crowdFor } from "./calls.js";
import { createInput, floorJ, headingOf } from "./input.js";
import * as SFX from "./audio.js";
import CSS from "./hoops.css?inline";
import "../pages.css";

// #hoops[?home=<district>][&vs=<district>][&fmt=to21][&shot=14][&mode=5v5|3v3|1v1][&to=11][&mitt=1]
// [&quick=1]: THE COURTS, playable basketball (docs/CITY_SPEC.md "PLAYABLE SPORTS", Basketball). Five
// on five on the full court with the league's teams; three on three and one on one on a half court
// under street rules with any of the league's players (quick=1: straight onto the floor, the BUCKETS
// cabinet's one on one). Phase 1: exhibitions only. Nothing here reaches
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
  return { home: id("home"), vs: id("vs"), fmt: q.get("fmt") === "to21" ? "to21" : "quarters", shot: q.get("shot") === "14" ? 14 : 24, mode: MODES[q.get("mode")] ? q.get("mode") : null, to: q.get("to") === "11" ? 11 : 21, mitt: q.get("mitt") === "1", quick: q.get("quick") === "1" };
};
const INB_KEY = "hvi-hoops-inbounder";   // "me": you throw it in at your throw-ins (engine v5 cfg.inb)
const readInb = () => { try { return localStorage.getItem(INB_KEY) === "me" ? "me" : "guard"; } catch { return "guard"; } };
const writeInb = (v) => { try { localStorage.setItem(INB_KEY, v); } catch { /* the tab remembers */ } };
const KEEP = "hvi-hoops-exhibitions", KEEP_N = 5, LEVEL_KEY = "hvi-hoops-level", TIPS_KEY = "hvi-hoops-tips2-done", LEGEND_KEY = "hvi-hoops-legend", CAM_KEY = "hvi-hoops-cam2", ADJ_KEY = "hvi-hoops-camadj", MODE_KEY = "hvi-hoops-mode", HANDS_KEY = "hvi-hoops-controls";
// The difficulty: ROOKIE for a new player, then whatever was picked last; with the pyramid
// (docs/design/PYRAMID.md section 7) a pick is remembered per division and the division sets the
// default (the top flight HALL OF FAME, the bottom division ROOKIE).
const levelKey = (k) => (k ? `${LEVEL_KEY}:d${k}` : LEVEL_KEY);
const readLevel = (league = null, k = 0) => {
  try { const v = localStorage.getItem(levelKey(k)); if (LEVELS[v]) return v; } catch { /* no store: the default */ }
  return divisionsOf(league).length > 1 ? LEVEL_ORDER[defaultLevelIndex(league, k, LEVEL_ORDER.length)] : "rookie";
};
const writeLevel = (v, k = 0) => { try { localStorage.setItem(levelKey(k), v); } catch { /* the tab remembers */ } };
const LEVEL_NOTES = {
  rookie: "START HERE. A WIDER GREEN WINDOW, TEAMMATES WHO GUARD TIGHT, YOUR MAN GUARDS FOR YOU WHEN YOU LET GO, FEWER STEALS AND BLOCKS AGAINST YOU. ONLY THE EIGHT SECONDS ARE CALLED.",
  pro: "A FAIR GAME. A LITTLE HELP ON DEFENCE; THE CPU STILL GAMBLES LESS THAN IT COULD. OVER-AND-BACK IS CALLED.",
  allstar: "THE CPU PLAYS AS RATED: IT ROTATES, BLOCKS AND STEALS. YOUR MAN STILL GUARDS WHEN YOU LET GO. THREE SECONDS AND FIVE ON THE THROW-IN ARE CALLED.",
  hof: "HARDER THAN RATED. A TIGHT GREEN WINDOW, FULL HELP DEFENCE, NO AUTO-GUARD, YOU SWITCH ON DEFENCE YOURSELF (A), AND EVERY VIOLATION IS CALLED.",
};
// The camera (2K by default) and its adjustments, remembered per camera: {id: {zoom, height, follow}} 0..10.
const readCam = () => { try { const v = localStorage.getItem(CAM_KEY); return CAMS[v] ? v : DEFAULT_CAM; } catch { return DEFAULT_CAM; } };
const writeCam = (v) => { try { localStorage.setItem(CAM_KEY, v); } catch { /* the tab remembers */ } };
const readAdj = () => { try { const j = JSON.parse(localStorage.getItem(ADJ_KEY) || "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; } };
const writeAdj = (j) => { try { localStorage.setItem(ADJ_KEY, JSON.stringify(j)); } catch { /* the tab remembers */ } };
export const adjOf = (all, id) => ({ ...ADJ_DEFAULT, ...(all?.[id] || {}) });
// The hands: "camera" (the stick follows the camera: up is up the screen, input.js) or "court" (the
// old way: up is the far sideline whatever the camera shows).
const readHands = () => { try { return localStorage.getItem(HANDS_KEY) === "court" ? "court" : "camera"; } catch { return "camera"; } };
const writeHands = (v) => { try { localStorage.setItem(HANDS_KEY, v); } catch { /* the tab remembers */ } };
const HANDS_NAME = { camera: "FOLLOWS THE CAMERA", court: "FIXED TO THE COURT" };
const readMode = () => { try { const v = localStorage.getItem(MODE_KEY); return MODES[v] ? v : "5v5"; } catch { return "5v5"; } };
const writeMode = (v) => { try { localStorage.setItem(MODE_KEY, v); } catch { /* the tab remembers */ } };
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
    let hand = null; try { hand = profileHand(); } catch { hand = null; }
    return { caseId, name: caseId ? `SUBJECT ${caseId.slice(-4).toUpperCase()}` : "SUBJECT", spec: av?.kind === "procedural" ? av.spec : null, url: av?.kind === "sprite" ? av.url : null, hand };
  }, []);
}
// A roster row for the sim: [key, name, rating, archetype, position, hand]. A real player's position
// from ROLES; yours from nothing (the sim gives you one) and your playing hand from the file (cosmetic).
function rowOf(me, k, n, r) {
  const mine = me.caseId ? citizenKeyOf(me.caseId) : null, pos = ROLES[k] || null;
  return [k, k === mine ? me.name : shownName(n), r, pos ? POS_ARCH[pos] : null, pos, k === mine && me.hand === -1 ? "L" : null];
}
// The five a game plays: best first, names for the board, you as yourself.
function fiveOf(league, id, me) { return sortFive(league.teams[id]).map(([k, n, r]) => rowOf(me, k, n, r)); }
// The street game's pool: every rostered player, and you (rostered or not, when you have a file).
const ME_RATING = 55;   // a file not on any roster plays as a pickup player
function poolOf(league, me) {
  const pool = playerPool(league), mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  if (mine && !pool.some(p => p.key === mine)) pool.unshift({ key: mine, name: me.name, r: ME_RATING, club: null, me: true });
  return pool.map(p => (p.key === mine ? { ...p, name: me.name, me: true } : p));
}
const rowFromPool = (me, p) => rowOf(me, p.key, p.name, p.r);
// The street game's default sides: you (or the best of the home club) and the best of your club, against
// the opposition's best (one on one: the player nearest your rating, an even game).
function defaultPicks(league, me, mode, home, away) {
  const n = MODES[mode].n, pool = poolOf(league, me), meP = pool.find(p => p.me);
  const of = (id) => pool.filter(p => p.club === id && !p.me);
  const mineSide = [...(meP ? [meP] : []), ...of(home)].slice(0, n);
  if (n === 1) {
    const r0 = mineSide[0].r, them = pool.filter(p => p.key !== mineSide[0].key && p.club !== mineSide[0].club).sort((a, b) => Math.abs(a.r - r0) - Math.abs(b.r - r0) || b.r - a.r)[0];
    return { home: mineSide.map(p => p.key), away: [them.key] };
  }
  return { home: mineSide.map(p => p.key), away: of(away).slice(0, n).map(p => p.key) };
}

export default function Hoops({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const me = useMe();
  const [league, setLeague] = useState(FALLBACK);
  const [ready, setReady] = useState(false);   // the live league answered (or did not): quick may start
  useEffect(() => { let off = false; loadLeague().then(lg => { if (lg && !off) setLeague(lg); }).catch(() => {}).finally(() => { if (!off) setReady(true); }); return () => { off = true; }; }, []);
  const [fmt, setFmt] = useState(opts.fmt);
  const [shot, setShot] = useState(opts.shot);
  const [mode, setModeS] = useState(() => opts.mode || readMode());
  const setMode = (v) => { writeMode(v); setModeS(v); };
  const [to, setTo] = useState(opts.to);
  const [mitt, setMitt] = useState(opts.mitt);
  const [picks, setPicks] = useState(null);   // the street game's sides: {mode, home: [keys], away: [keys]}
  const [level, setLevelS] = useState(() => readLevel());
  const setLevel = (v, k = 0) => { writeLevel(v, k); setLevelS(v); };
  const levelFor = (k) => setLevelS(readLevel(league, k));   // the division's remembered or default level
  const [game, setGame] = useState(null);   // {seed, n, home, away, cfg, labels?}
  const [done, setDone] = useState(null);
  const [tape, setTape] = useState(null);
  const [guide, setGuide] = useState(null);   // the controls guide before the first game: the game it holds
  const [camId, setCamIdS] = useState(readCam);
  const [adj, setAdjS] = useState(readAdj);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hands, setHandsS] = useState(readHands);
  const setHands = (v) => { writeHands(v); setHandsS(v); };
  const [inb, setInbS] = useState(readInb);
  const setInb = (v) => { writeInb(v); setInbS(v); };
  const setCamId = (v) => { writeCam(v); setCamIdS(v); };
  const setAdj = (id, k, v) => setAdjS(a => { const next = { ...a, [id]: { ...adjOf(a, id), [k]: Math.max(0, Math.min(10, v)) } }; writeAdj(next); return next; });
  const mine = teamOfCase(league, me.caseId);
  const launch = (g) => { if (!guideSeen()) { setGuide(g); setDone(null); setTape(null); setGame(null); } else { setDone(null); setTape(null); setGame(g); } };
  const start = (home, away, f = fmt, s = shot) => {
    SFX.unlock();
    const cfg = { mode: "5v5", fmt: f, shot: s, level, home: fiveOf(league, home, me), away: fiveOf(league, away, me), div: divisionOf(league, home), ...(inb === "me" ? { inb: "me" } : {}) };   // div: the pyramid's division, data the sim carries
    launch({ seed: seedNow(), n: Date.now(), home, away, cfg, tips: !readFlag(TIPS_KEY, false) });
  };
  // the street game: the picked players, a half court
  const startStreet = (pk, m = mode) => {
    SFX.unlock();
    const pool = poolOf(league, me), byKey = new Map(pool.map(p => [p.key, p]));
    const side = (keys) => keys.map(k => byKey.get(k)).filter(Boolean);
    const H0 = side(pk.home), A0 = side(pk.away);
    if (!H0.length || !A0.length) return;
    const cfg = { mode: m, shot, level, to, mitt, home: H0.map(p => rowFromPool(me, p)), away: A0.map(p => rowFromPool(me, p)) };
    const club = (ps, dflt) => ps.find(p => p.club)?.club || dflt;
    let home = club(H0, mine || "hq"), away = club(A0, "works");
    if (away === home) away = TEAM_IDS.find(id => id !== home && id !== "hq") || "works";
    const label = (ps) => (ps.length === 1 ? ps[0].name.split(" ").slice(-1)[0] : `${ps[0].name.split(" ").slice(-1)[0]} THREE`);
    launch({ seed: seedNow(), n: Date.now(), home, away, cfg, labels: [label(H0), label(A0)], tips: !readFlag(TIPS_KEY, false) });
  };
  const leaveGuide = () => { markGuideSeen(); const g = guide; setGuide(null); if (g) setGame(g); };
  // quick (the BUCKETS cabinet): onto the floor as soon as the league has answered
  const quickDone = useRef(false);
  useEffect(() => {
    if (!opts.quick || quickDone.current || !ready) return;
    quickDone.current = true;
    const m = opts.mode || "1v1";
    if (MODES[m].n === 5) { const [h, a] = playNowPair(league, mine); start(opts.home || h, opts.vs || a); return; }
    const [h, a] = playNowPair(league, mine);
    const pk = defaultPicks(league, me, m, h, a);
    setPicks({ mode: m, ...pk });
    startStreet(pk, m);
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  let body;
  const street = game && game.cfg.mode !== "5v5";
  const again = () => (street ? startStreet({ home: game.cfg.home.map(r => r[0]), away: game.cfg.away.map(r => r[0]) }, game.cfg.mode) : start(game.home, game.away, game.cfg.fmt, game.cfg.shot));
  const nextOpponent = () => {
    if (street) { setDone(null); setGame(null); setTape(null); setMoreOpen(true); return; }
    const ids = TEAM_IDS.filter(id => id !== game.home); start(game.home, ids[(ids.indexOf(game.away) + 1) % ids.length], game.cfg.fmt, game.cfg.shot);
  };
  const settings = () => { setDone(null); setGame(null); setTape(null); setMoreOpen(true); };
  const camProps = { camId, setCamId, adj, setAdj, hands, setHands, inb, setInb };
  if (guide) body = <HoopsGuideGate street={guide.cfg.mode !== "5v5"} onDone={leaveGuide} />;
  else if (tape) body = <Match key={`tape${tape.rec.at}`} game={tape.game} me={me} tape={tape.rec} {...camProps} onDone={() => setTape(null)} onQuit={() => setTape(null)} />;
  else if (game && !done) body = <Match key={game.n} game={game} me={me} {...camProps} onDone={setDone} onQuit={() => setGame(null)} onRestart={again} />;
  else if (done) body = <Done done={done} game={game} onAgain={again} onNew={nextOpponent} onSettings={settings} onTape={() => setTape({ rec: done.rec, game })} />;
  else body = <Picker league={league} me={me} mine={mine} pre={opts} fmt={fmt} setFmt={setFmt} shot={shot} setShot={setShot} level={level} setLevel={setLevel} levelFor={levelFor} onStart={start} onStreet={startStreet} mode={mode} setMode={setMode} to={to} setTo={setTo} mitt={mitt} setMitt={setMitt} picks={picks} setPicks={setPicks} camId={camId} setCamId={setCamId} moreOpen={moreOpen} />;
  const meta = game && game.cfg.mode !== "5v5" ? `BASKETBALL // EXHIBITION // ${MODES[game.cfg.mode].name}, HALF COURT, STREET RULES. EVERYTHING IS RECORDED.` : "BASKETBALL // EXHIBITION // 5 ON 5, 3 ON 3, 1 ON 1. PICKUP PERMITTED. EVERYTHING IS RECORDED.";
  return (
    <div className="hp">
      <ScreenHead title="THE COURTS" meta={meta} />
      {body}
    </div>
  );
}
// The guide before the first game, in the way you are playing now.
function HoopsGuideGate({ street, onDone }) {
  const { mode, family } = usePlayMode();
  return <HoopsGuide mode={mode} family={family} street={street} onDone={onDone} />;
}
// ---- choosing ------------------------------------------------------------------------------------
function Picker(props) {
  const { mode, setMode, level, setLevel } = props;
  return (
    <>
      <div className="hp-chips hp-modes" role="radiogroup" aria-label="Mode">
        {Object.values(MODES).map(M => <button key={M.id} type="button" role="radio" aria-checked={mode === M.id} className={`hp-chip${mode === M.id ? " on" : ""}`} onClick={() => setMode(M.id)}>{M.name}{M.half ? ", HALF COURT" : ""}</button>)}
      </div>
      {mode === "5v5" ? <TeamPicker {...props} /> : <StreetPicker key={mode} {...props} />}
      {mode !== "5v5" && <LevelChips level={level} setLevel={setLevel} k={0} />}
    </>
  );
}
function LevelChips({ level, setLevel, k, extra = "" }) {
  return (
    <div className="hp-level">
      <p className="hp-small">DIFFICULTY</p>
      <div className="hp-chips" role="radiogroup" aria-label="Difficulty">
        {LEVEL_ORDER.map(id => <button key={id} type="button" role="radio" aria-checked={level === id} className={`hp-chip${level === id ? " on" : ""}`} onClick={() => setLevel(id, k)}>{LEVELS[id].name}</button>)}
      </div>
      <p className="hp-small hp-level-note">{LEVEL_NOTES[level]}{extra}</p>
    </div>
  );
}
// THE STREET: 3 ON 3 and 1 ON 1. Pick any of the league's players for either side (and yourself, when
// you have a file): a slot, then a player. To 21 or 11, make-it-take-it if you like.
function StreetPicker({ league, me, mine, mode, to, setTo, mitt, setMitt, picks, setPicks, onStreet, shot, setShot }) {
  const n = MODES[mode].n, pool = useMemo(() => poolOf(league, me), [league, me]);
  const [h0, a0] = playNowPair(league, mine);
  const pk = picks && picks.mode === mode ? picks : { mode, ...defaultPicks(league, me, mode, h0, a0) };
  const [slot, setSlot] = useState(["home", 0]);
  const [club, setClub] = useState("");
  const byKey = new Map(pool.map(p => [p.key, p]));
  const put = (key) => {
    const next = { mode, home: [...pk.home], away: [...pk.away] }, [side, i] = slot;
    for (const sd of ["home", "away"]) { const j = next[sd].indexOf(key); if (j >= 0) next[sd][j] = pk[side][i]; }   // already picked: swap
    next[side][i] = key;
    setPicks(next);
    setSlot(i + 1 < n ? [side, i + 1] : side === "home" ? ["away", 0] : ["home", 0]);
  };
  const playRef = useRef(null);
  useEffect(() => { playRef.current?.focus({ preventScroll: true }); }, []);
  const go = () => onStreet(pk, mode);
  useEffect(() => {
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) go(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const nameOf = (k) => byKey.get(k)?.name || "?";
  const shown = pool.filter(p => !club || p.club === club || (club === "me" && p.me));
  const clubs = allClubs(league);
  return (
    <>
      <p className="pg-lede">{n === 1 ? "ONE ON ONE" : "THREE ON THREE"} ON A HALF COURT, STREET RULES: ONES AND TWOS, CHECK BALL AT THE TOP, TAKE IT BACK PAST THE ARC AFTER A DEFENSIVE REBOUND OR A STEAL. ANY PLAYER IN THE LEAGUE, EITHER SIDE.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={go}>PLAY NOW</Button>
        <span className="pg-sub">{pk.home.map(nameOf).join(", ")} V {pk.away.map(nameOf).join(", ")}. TO {to}{mitt ? ", MAKE IT TAKE IT" : ""}.</span>
      </div>
      <div className="hp-sides">
        {["home", "away"].map(side => (
          <div key={side} className="hp-side">
            <p className="hp-small">{side === "home" ? "YOUR SIDE" : "THEIR SIDE"}</p>
            <div className="hp-chips" role="group" aria-label={side === "home" ? "Your side" : "Their side"}>
              {pk[side].map((k, i) => <button key={i} type="button" aria-pressed={slot[0] === side && slot[1] === i} className={`hp-chip hp-slot${slot[0] === side && slot[1] === i ? " on" : ""}`} onClick={() => setSlot([side, i])}>{nameOf(k)} <small>{byKey.get(k)?.r}</small></button>)}
            </div>
          </div>
        ))}
      </div>
      <div className="hp-chips" role="radiogroup" aria-label="Game to">
        {[21, 11].map(t => <button key={t} type="button" role="radio" aria-checked={to === t} className={`hp-chip${to === t ? " on" : ""}`} onClick={() => setTo(t)}>TO {t}</button>)}
        <button type="button" role="switch" aria-checked={mitt} className={`hp-chip${mitt ? " on" : ""}`} onClick={() => setMitt(!mitt)}>MAKE IT TAKE IT: {mitt ? "ON" : "OFF"}</button>
        {[24, 14].map(sc => <button key={sc} type="button" role="radio" aria-checked={shot === sc} className={`hp-chip${shot === sc ? " on" : ""}`} onClick={() => setShot(sc)}>{sc}-SECOND CLOCK</button>)}
      </div>
      <p className="hp-small">PICK A SLOT ABOVE, THEN A PLAYER. NOW CHOOSING: {slot[0] === "home" ? "YOUR SIDE" : "THEIR SIDE"}, PLAYER {slot[1] + 1}.</p>
      <div className="hp-chips" role="radiogroup" aria-label="Show players from">
        <button type="button" role="radio" aria-checked={!club} className={`hp-chip${!club ? " on" : ""}`} onClick={() => setClub("")}>EVERYONE</button>
        {clubs.map(id => <button key={id} type="button" role="radio" aria-checked={club === id} className={`hp-chip${club === id ? " on" : ""}`} onClick={() => setClub(id)}>{teamShort(id)}</button>)}
      </div>
      <ul className="hp-pool">
        {shown.slice(0, club ? 99 : 60).map(p => (
          <li key={p.key}><button type="button" className={`hp-player${pk.home.includes(p.key) || pk.away.includes(p.key) ? " in" : ""}`} onClick={() => put(p.key)}>
            <span className="nm">{p.name}{p.me ? " (YOU)" : ""}<span className="tag">{p.club ? teamShort(p.club) : "YOUR FILE"}{ROLES[p.key] ? ` // ${ROLES[p.key]}` : ""}</span></span><span className="rt">{p.r}</span>
          </button></li>
        ))}
      </ul>
    </>
  );
}
function TeamPicker({ league, me, mine, pre, fmt, setFmt, shot, setShot, level, setLevel, levelFor, onStart, camId, setCamId, moreOpen }) {
  const [home0, away0] = playNowPair(league, mine);
  const [home, setHome] = useState(pre.home || home0);
  useEffect(() => { if (!pre.home) setHome(mine || home0); }, [mine, home0]);   // eslint-disable-line react-hooks/exhaustive-deps
  const away = pre.vs && pre.vs !== home ? pre.vs : playNowPair(league, home)[1];
  // THE PYRAMID: the division you play in sets the difficulty's default (a pick is remembered per division)
  const divs = divisionsOf(league), k = divisionOf(league, home), diff = difficultyOf(league, k), dflt = LEVEL_ORDER[defaultLevelIndex(league, k, LEVEL_ORDER.length)];
  useEffect(() => { levelFor(k); }, [k, league.day]);   // eslint-disable-line react-hooks/exhaustive-deps
  const clubs = allClubs(league);
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
      <p className="pg-lede">BASKETBALL, FIVE ON FIVE, WITH THE CITY'S OWN LEAGUE TEAMS. YOU STEER THE MAN WITH THE BALL, AND ON DEFENCE THE MAN NEAREST IT. A CONTROLLER PLAYS LIKE 2K: X SHOOTS (LET GO AT THE TOP), A PASSES (IT LEADS A RUNNER), HOLD RB FOR ICON PASSING, DOUBLE-TAP Y FOR THE ALLEY-OOP, THE RIGHT STICK DRIBBLES. KEYS: ARROWS, Z SHOOTS, X PASSES, HOLD G + 1-4 ICON PASSES, SHIFT SPRINTS. PHONES GET A PAD.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={quick}>PLAY NOW</Button>
        <span className="pg-sub">{teamName(home)}{home === mine ? " (YOUR TEAM)" : ""} V {teamName(away)}. {len}, {shot}-SECOND CLOCK, {divs.length > 1 ? `${diff.name}, ` : ""}{LEVELS[level].name}.</span>
      </div>
      <div className="hp-level">
        <p className="hp-small">DIFFICULTY</p>
        <div className="hp-chips" role="radiogroup" aria-label="Difficulty">
          {LEVEL_ORDER.map(id => <button key={id} type="button" role="radio" aria-checked={level === id} className={`hp-chip${level === id ? " on" : ""}`} onClick={() => setLevel(id, k)}>{LEVELS[id].name}</button>)}
        </div>
        <p className="hp-small hp-level-note">{LEVEL_NOTES[level]}{divs.length > 1 ? ` ${diff.name} DEFAULTS TO ${LEVELS[dflt].name}${k === 0 ? ": THE TOP FLIGHT IS THE HARDEST" : k === divs.length - 1 ? ": THE BOTTOM DIVISION IS THE EASIEST" : ""}. A PICK IS REMEMBERED FOR THIS DIVISION.` : ""}</p>
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
          <p className="hp-small">YOUR TEAM{divs.length > 1 ? " (ANY DIVISION; THE DIVISION SETS THE DEFAULT DIFFICULTY)" : ""}:</p>
          {(divs.length > 1 ? divs : [clubs]).map((ids, i) => (
            <div key={i}>
              {divs.length > 1 && <p className="hp-small">{difficultyOf(league, i).name}:</p>}
              <div className="hp-chips" role="radiogroup" aria-label={divs.length > 1 ? `Your team, ${difficultyOf(league, i).name}` : "Your team"}>
                {ids.filter(id => league.teams[id]?.length).map(id => <button key={id} type="button" role="radio" aria-checked={home === id} className={`hp-chip${home === id ? " on" : ""}`} onClick={() => setHome(id)}>{teamShort(id)}{id === mine ? " (YOURS)" : ""}</button>)}
              </div>
            </div>
          ))}
          <p className="hp-small">THEN PICK WHO TO PLAY; THE GAME STARTS AT ONCE. SPEED, TOUCH AND DEFENCE FOLLOW EACH PLAYER'S LEAGUE RATING.</p>
          <ul className="hp-teams">
            {clubs.filter(id => id !== home).map(id => {
              const five = sortFive(league.teams[id]), kd = divisionOf(league, id);
              return (
                <li key={id}>
                  <button type="button" className="hp-team" onClick={() => onStart(home, id)} aria-label={`Play ${teamName(id)}, rated ${teamRating(five)}`}>
                    <i className="sw" style={{ background: kitsFor(home, id)[1][0], borderColor: kitsFor(home, id)[1][1] }} aria-hidden="true" />
                    <span className="nm">{teamName(id)}<span className="tag">{five.slice(0, 3).map(r => shownName(r[1])).join(", ")}{league.pos[id] ? ` // ${ordinal(league.pos[id])} IN ${divs.length > 1 ? difficultyOf(league, kd).short : "THE LEAGUE"}` : ""}</span></span>
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

function Controls() { return <HoopsGuide mode="keys" family="generic" street compact />; }

export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic;
    return [["MOVE", "L STICK", `${g.rt} SPRINT`], ["SHOOT", `HOLD ${g.west}`, "LET GO AT THE TOP. ON D: STEAL."], ["PASS", `${g.south} / ${g.east} / ${g.north}`, `CHEST / BOUNCE / LOB. ${g.north} ${g.north}: ALLEY-OOP. THROW-IN: ${g.south} CALLS FOR IT. ON D: SWITCH / CHARGE / BLOCK.`], ["ICON PASS", `HOLD ${g.rb}`, "THEN THE TEAMMATE'S BUTTON. ON D: SWITCH TO HIM."], ["MOVES", "R STICK", "SIDE CROSS, BACK STEPBACK, ROUND SPIN. ON D: HANDS UP."], ["PICK", g.lb, ""], ["POST", g.lt, "ON D: INTENSE D."], ["CAMERA", g.view, ""], ["PAUSE", g.start, ""]];
  }
  if (mode === "touch") return [["MOVE", "THE ROUND PAD", ""], ["SHOOT", "HOLD SHOOT", "LET GO AT THE TOP."], ["PASS", "PASS / LOB", "TOWARD THE PAD."], ["MOVES", "SWIPE THE COURT", "SIDE CROSS, BACK STEPBACK, CIRCLE SPIN."], ["SPRINT", "SPRINT", ""], ["DEFENCE", "STEAL / BLOCK / CHARGE / SWITCH", ""], ["PAUSE", "START", ""]];
  return [["MOVE", "←↑↓→ / WASD", "SHIFT SPRINTS."], ["SHOOT", "HOLD Z / J / SPACE", "LET GO AT THE TOP. ON D: STEAL."], ["PASS", "X / K", "F BOUNCE, C LOB, C C ALLEY-OOP. THROW-IN: X CALLS FOR IT. ON D: X SWITCH, C BLOCK, F CHARGE."], ["ICON PASS", "HOLD G + 1-4", "ON D: SWITCH TO HIM."], ["MOVES", "Q + ARROW", "Q ALONE: SPIN. ON D: HANDS UP."], ["PICK", "R", ""], ["POST", "E", "ON D: INTENSE D."], ["CAMERA", "V", ""], ["PAUSE", "ENTER / ESC", ""]];
}
// The names of the shoot, pass and block buttons for the tips, by how you are playing.
function keyNames(mode, family) {
  if (mode === "pad") { const g = PAD_GLYPHS[family] || PAD_GLYPHS.generic; return { shoot: g.west, pass: g.south, block: g.north, icon: `HOLD ${g.rb}`, oop: `DOUBLE-TAP ${g.north}` }; }
  if (mode === "touch") return { shoot: "SHOOT", pass: "PASS", block: "BLOCK", icon: null, oop: "DOUBLE-TAP LOB" };
  return { shoot: "Z", pass: "X", block: "C", icon: "HOLD G, THEN 1-4,", oop: "DOUBLE-TAP C" };
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
// Jersey numbers: the player's own, from his key (the same number every game), none twice on a side.
const NUMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 40, 41, 42, 44, 45, 50, 55];
const keyHash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function numbersFor(rows) { const used = new Set(); return rows.map(r => { let k = keyHash(String(r[0])) % NUMS.length; while (used.has(NUMS[k])) k = (k + 1) % NUMS.length; used.add(NUMS[k]); return NUMS[k]; }); }
function looksFor(cfg, home, away, me) {
  const kits = kitsFor(home, away), mine = me.caseId ? citizenKeyOf(me.caseId) : null;
  const rows = [...cfg.home, ...cfg.away], n = cfg.home.length;
  const nums = [...numbersFor(cfg.home), ...numbersFor(cfg.away)];
  return rows.map((row, g) => {
    const kit = kits[g < n ? 0 : 1], key = row[0];
    const look = { jersey: kit[0], trim: kit[1], skin: "#c68c5e", hair: null, head: null, num: nums[g] };
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
function Match({ game, me, tape = null, camId, setCamId, adj, setAdj, hands, setHands, inb, setInb, onDone, onQuit, onRestart }) {
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
  const [camPanel, setCamPanel] = useState(false);
  const pausedRef = useRef(false), mutedRef = useRef(muted), skipRef = useRef(false), camRef = useRef(camStart(camId, adjOf(adj, camId))), camIdRef = useRef(camId), adjRef = useRef(adj);
  const handsRef = useRef(hands);
  camIdRef.current = camId; adjRef.current = adj; handsRef.current = hands;
  const street = cfg.mode && cfg.mode !== "5v5";
  const cycleCam = () => { const id = CAM_ORDER[(CAM_ORDER.indexOf(camIdRef.current) + 1) % CAM_ORDER.length]; setCamId(id); };
  mutedRef.current = muted;
  const togglePause = (v) => { pausedRef.current = v ?? !pausedRef.current; setPaused(pausedRef.current); };
  const teams = game.labels ? [...game.labels] : [teamName(home), teamName(away)], shorts = game.labels ? [...game.labels] : [teamShort(home), teamShort(away)];
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
    // the camera the game was played in, for the record (metadata: it never reaches the sim): the
    // camera, its adjustments and the hands at the start, then every change [frame, camera, hands]
    const cam0 = { id: camIdRef.current, adj: adjOf(adjRef.current, camIdRef.current), controls: handsRef.current, changes: [] };
    let camSeen = `${cam0.id}|${cam0.controls}`;
    // first-game tips: shoot, pass, icon passing, the alley-oop, defend, the line; each until it is
    // done (or it has had its time)
    const tips = game.tips && !tape && !cfg.auto ? { stage: 0, shown: 0, shownIcon: 0, shownOop: 0, key: "" } : null;
    const tipStep = () => {
      if (!tips) return;
      const P = st.p[st.ctl], has = st.ball.st === "held" && st.ball.own === P.g && st.phase === "live";
      const K = keyNames(modeRef.current, padRef.current);
      const solo = st.n === 1;
      for (const e of st.ev) {
        if (tips.stage === 0 && (e === "shoot" || e === "shoot3" || e === "slam") && st.note?.team === 0) tips.stage = solo ? 4 : 1;
        else if (tips.stage === 1 && (e === "pass" || e === "lob") && st.note?.team === 0) tips.stage = K.icon ? 2 : 3;
        else if (tips.stage === 2 && e === "iconpass") tips.stage = 3;
        else if (tips.stage === 3 && (e === "lob" || e === "alleyoop")) tips.stage = 4;
      }
      let want = null;
      if (st.phase === "ft" && st.ft && st.p[st.ft.g].t === 0 && !tips.ft) { want = `${K.shoot}: HOLD, LET GO AT THE TOP OF THE METER`; if (st.ev.includes("ftshot")) tips.ft = true; }
      else if (has && st.half && st.clear === 0) want = "TAKE IT BACK PAST THE ARC BEFORE YOU SHOOT";
      else if (has && tips.stage === 0) want = `HOLD ${K.shoot}, LET GO AT THE TOP`;
      else if (has && tips.stage === 1) want = `${K.pass} TO PASS (THE STICK PICKS WHO; IT LEADS A RUNNER)`;
      else if (has && tips.stage === 2) { want = `${K.icon} FOR ICON PASSING: PRESS A TEAMMATE'S BUTTON TO HIT HIM`; if (++tips.shownIcon > 480) tips.stage = 3; }
      else if (has && tips.stage === 3) { want = `${K.oop}: ALLEY-OOP TO THE CUTTER NEAREST THE RIM`; if (++tips.shownOop > 480) tips.stage = 4; }
      else if (st.phase === "live" && st.poss === 1 && tips.stage >= 1 && !tips.d) { want = `ON DEFENCE: STAY BETWEEN YOUR MAN AND THE RIM. ${K.shoot} STEALS, ${K.block} BLOCKS`; if (++tips.shown > 360) tips.d = true; }
      if (tips.stage >= 4 && tips.d && (tips.ft || st.half)) { writeFlag(TIPS_KEY, true); }
      if (want !== tips.key) { tips.key = want; setTip(want); }
    };
    const onVis = () => { if (document.hidden && !tape) togglePause(true); };
    document.addEventListener("visibilitychange", onVis);
    const finish = () => {
      ended = true;
      if (tape) { setTimeout(() => onDone(null), 1500); return; }
      const rec = { version: VERSION, seed, cfg, home, away, cam: cam0, inputLog: rleEncode(log), result: resultOf(st), at: Date.now() };
      let verified = false;
      try { verified = JSON.stringify(replay(rec)) === JSON.stringify(rec.result); } catch { verified = false; }
      saveRecord(rec);
      setTimeout(() => onDone({ rec, verified }), 2200);
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      // the hands follow the camera: the floor-to-screen map at the man you steer, in the picture on screen now
      let view = null;
      if (handsRef.current === "camera" && !tape) { const k = camOf(camRef.current), P = st.p[st.ctl]; view = { J: floorJ(proj, k, P.x, P.y), heading: headingOf(k) }; }
      const inp = input.sample(view);
      const cs = `${camIdRef.current}|${handsRef.current}`;
      if (cs !== camSeen && !tape) { camSeen = cs; cam0.changes.push([st.frame, camIdRef.current, handsRef.current]); }
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
      const A = adjOf(adjRef.current, camIdRef.current);
      if (camRef.current.id !== camIdRef.current) camRef.current = camStart(camIdRef.current, A);
      camRef.current = camFollow(camRef.current, st, A);
      fx.t++; if (fx.t > 140) fx.mood = "idle";
      if (fx.dunk) fx.dunk.age++;
      if (fx.shake > 0) fx.shake--;
      draw(ctx, st, looks, camRef.current, st.frame, fx, reduced, { iconLabel: iconLabels(modeRef.current, padRef.current) });
      const F = FORMATS[st.cfg.fmt], H0 = st.ball.st === "held" ? st.p[st.ball.own] : null;
      const off = st.poss === 0, ctlP = st.p[st.ctl];
      const period = !F.periods ? `TO ${st.target || 21}` : st.q > F.periods ? `OT${st.q - F.periods > 1 ? st.q - F.periods : ""}` : `Q${st.q}`;
      const back = st.half && st.clear === 0 && st.phase === "live";
      // v5: your throw-in (call for it, or throw it), the LINE cue when the line is holding you in
      const ti = st.phase === "throwin" && st.ti && st.ti.t === 0 && !cfg.auto ? (st.ti.g === ctlP.g ? "throw" : st.ti.call < 0 ? "call" : "") : "";
      const line = st.phase === "live" && st.frame - st.lineAt < 20;
      const key = `${st.score}|${period}|${Math.ceil(st.clock / 60)}|${Math.ceil(st.shot / 60)}|${off}|${st.ctl}|${st.phase}|${st.tf}|${ctlP.pf}|${back}|${ti}|${line}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud({ score: [...st.score], period, clock: F.periods ? clockOf(st.clock) : "", shot: Math.max(0, Math.ceil(st.shot / 60)), off: off || (st.phase === "ft" && st.ft && st.p[st.ft.g].t === 0), poss: st.poss, ctl: cfg.auto ? "" : names[ctlP.g], pos: ctlP.pos || "", back, pf: ctlP.pf, has: H0 ? H0.t : -1, over: st.phase === "over", tf: [...st.tf], bonus: [inPenalty(st, 1), inPenalty(st, 0)], ti, line });
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
        <span className="tm" style={{ borderColor: kits[0][0] }}><b>{shorts[0]}<small>{street ? `${MODES[cfg.mode].name}${cfg.mitt ? " · MAKE IT TAKE IT" : ""}` : <>FOULS {hud?.tf[0] ?? 0}{hud?.bonus[0] ? " · BONUS" : ""}</>}</small></b><em>{hud?.score[0] ?? 0}</em>{hud?.has === 0 && <i aria-label="ball">●</i>}</span>
        <span className="mid"><b>{hud?.period || "Q1"}</b>{hud?.clock && <span>{hud.clock}</span>}<small>SHOT {hud?.shot ?? cfg.shot}</small></span>
        <span className="tm away" style={{ borderColor: kits[1][0] }}>{hud?.has === 1 && <i aria-label="ball">●</i>}<em>{hud?.score[1] ?? 0}</em><b>{shorts[1]}<small>{street ? "STREET RULES" : <>FOULS {hud?.tf[1] ?? 0}{hud?.bonus[1] ? " · BONUS" : ""}</>}</small></b></span>
      </div>
      <div className="hp-call" aria-live="polite" aria-atomic="true">{call || " "}<span className="sr-only"> {sr}</span></div>
      <div className="hp-stage" ref={wrapRef}>
        <div className="hp-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale }} role="img" aria-label={`Basketball: ${teams[0]} against ${teams[1]}`} {...(touch && !tape ? swipeHandlers(inputRef) : {})} />
          {tip && !paused && <div className="hp-tip" role="status">{tip}</div>}
          {tape && <div className="hp-tape">THE TAPE // {skipping ? "TO THE END" : "2X"}</div>}
        </div>
      </div>
      {!tape && hud?.ctl && <p className="hp-ctl">YOU: <b>{hud.ctl}</b>{hud.pos ? ` (${hud.pos})` : ""} {hud.off ? "// ON OFFENCE" : "// ON DEFENCE"}{hud.pf && !street ? ` // ${hud.pf} FOUL${hud.pf > 1 ? "S" : ""}` : ""}{hud.back ? <b className="hp-back"> // TAKE IT BACK PAST THE ARC</b> : null}{hud.ti ? <b className="hp-back"> // {hud.ti === "throw" ? `THROW IT IN: ${keyNames(mode, pad).pass} TOWARD A MAN` : `${keyNames(mode, pad).pass}: CALL FOR THE BALL`}</b> : null}{hud.line ? <b className="hp-back"> // LINE</b> : null}</p>}
      {touch && !tape && <TouchPad input={inputRef} off={hud?.off} onStart={() => togglePause()} />}
      {paused && <GameMenu key="pause" kind="pause" title="PAUSED." summary="THE DEPARTMENT HAS STOPPED THE CLOCK. IT DOES NOT USUALLY." onBack={() => togglePause(false)}
        options={{ resume: () => togglePause(false), restart: !tape && onRestart, camera: { label: `CAMERA: ${CAMS[camId].name}`, onSelect: cycleCam },
          hands: { label: `STICK: ${HANDS_NAME[hands]}`, hint: hands === "camera" ? "UP IS UP THE SCREEN" : "UP IS THE FAR SIDELINE", onSelect: () => setHands(hands === "camera" ? "court" : "camera") },
          ...(street ? {} : { inbound: { label: `THROW-INS: ${inb === "me" ? "YOU THROW IT IN" : "THE BIG THROWS, YOU CALL FOR IT"}`, hint: "FROM THE NEXT GAME", onSelect: () => setInb(inb === "me" ? "guard" : "me") } }),
          ...Object.fromEntries(["zoom", "height", "follow"].map(k => [`cam${k}`, { label: `CAMERA ${k.toUpperCase()}: ${adjOf(adj, camId)[k]}`, hint: "+1", onSelect: () => setAdj(camId, k, (adjOf(adj, camId)[k] + 1) % 11) }])),
          controls: <HoopsGuide mode={mode} family={pad} street={street} compact />, sound: { on: !muted, onSelect: toggleMute }, quit: { label: tape ? "STOP THE TAPE" : "LEAVE THE COURT", onSelect: onQuit } }} />}
      {camPanel && <CamPanel camId={camId} setCamId={setCamId} adj={adj} setAdj={setAdj} hands={hands} setHands={setHands} />}
      {!tape && <Legend mode={mode} family={pad} open={legendOpen} onToggle={toggleLegend} />}
      <ButtonRow>
        <Button onClick={() => togglePause()}>{paused ? "Resume" : "Pause"}</Button>
        <Button onClick={toggleMute}>{muted ? "Sound on" : "Mute"}</Button>
        <Button onClick={cycleCam}>Camera: {CAMS[camId].name}</Button>
        <Button onClick={() => setCamPanel(v => !v)} aria-expanded={camPanel} aria-label="Camera settings">{camPanel ? "−" : "+"}</Button>
        {tape && <Button onClick={() => { skipRef.current = true; setSkipping(true); }}>Skip to the end</Button>}
        <Button variant="back" onClick={onQuit}>{tape ? "Stop the tape" : "Leave the court"}</Button>
      </ButtonRow>
      <p className="hp-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
    </div>
  );
}

// The camera's adjustments, 2K's: ZOOM, HEIGHT, FOLLOW, 0 to 10 for each camera, remembered.
function CamPanel({ camId, setCamId, adj, setAdj, hands, setHands }) {
  const a = adjOf(adj, camId);
  return (
    <section className="hp-cam" aria-label="Camera settings">
      <div className="hp-chips" role="radiogroup" aria-label="Camera">
        {CAM_ORDER.map(id => <button key={id} type="button" role="radio" aria-checked={camId === id} className={`hp-chip${camId === id ? " on" : ""}`} onClick={() => setCamId(id)}>{CAMS[id].name}</button>)}
      </div>
      {["zoom", "height", "follow"].map(k => (
        <label key={k} className="hp-slider"><span>{k.toUpperCase()}</span>
          <input type="range" min="0" max="10" step="1" value={a[k]} onChange={(e) => setAdj(camId, k, Number(e.target.value))} />
          <b>{a[k]}</b></label>
      ))}
      <button type="button" className="hp-chip" onClick={() => { setAdj(camId, "zoom", ADJ_DEFAULT.zoom); setAdj(camId, "height", ADJ_DEFAULT.height); setAdj(camId, "follow", ADJ_DEFAULT.follow); }}>RESET {CAMS[camId].name}</button>
      <div className="hp-chips" role="radiogroup" aria-label="The stick">
        {["camera", "court"].map(v => <button key={v} type="button" role="radio" aria-checked={hands === v} className={`hp-chip${hands === v ? " on" : ""}`} onClick={() => setHands(v)}>STICK {HANDS_NAME[v]}</button>)}
      </div>
    </section>
  );
}
// The labels over your teammates while you hold the icon button, as your hands know them.
function iconLabels(mode, family) { return namesFor(mode === "touch" ? "keys" : mode, family).icons; }

// A swipe on the court: a dribble move that way on the screen (input.js turns it into a court direction
// through the camera, like the sticks), a circle = a spin.
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
      const m = Math.hypot(dx, dy);
      input.current?.swipe([dx / m, -dy / m]);   // [right, up] on the screen
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
  const teams = game.labels ? [...game.labels] : [teamName(game.home), teamName(game.away)], rows = [...game.cfg.home, ...game.cfg.away];
  const nn = game.cfg.home.length;
  const top = (t) => rows.map((row, g) => [row[1], r.pts[g], g]).filter(x => (x[2] < nn) === (t === 0)).sort((a, b) => b[1] - a[1]);
  const pct = (m, a) => `${m}/${a}${a ? ` (${Math.round((100 * m) / a)}%)` : ""}`;
  const line = won ? `${teams[0]} ${r.score[0]}, ${teams[1]} ${r.score[1]}.` : `${teams[1]} ${r.score[1]}, ${teams[0]} ${r.score[0]}.`;
  return (
    <Frame box title="FINAL" meta="EXHIBITION">
      <p className={`hp-big ${won ? "win" : "lose"}`}>{line}</p>
      <p className="hp-p">{won ? "THE DEPARTMENT HAS NOTED A WIN. IT WILL NOT BE REPEATED IN THE STANDINGS." : "AS PROJECTED. THE PROJECTION IS NOT ON YOUR FILE EITHER."}</p>
      <div className="hp-box">
        {[0, 1].map(t => (
          <table key={t} aria-label={`${teams[t]} points`}>
            <thead><tr><th scope="col">{game.labels ? game.labels[t] : teamShort(t ? game.away : game.home)}</th><th scope="col">PTS</th></tr></thead>
            <tbody>{top(t).map(([n, p, g]) => <tr key={g}><td>{n}</td><td>{p}</td></tr>)}</tbody>
          </table>
        ))}
      </div>
      <p className="hp-notice">{NOTICE}</p>
      <p className="hp-small">{LEVELS[rec.cfg.level]?.name || "ALL-STAR"} // FG {pct(r.fgm[0], r.fga[0])} AND {pct(r.fgm[1], r.fga[1])} // {game.cfg.mode && game.cfg.mode !== "5v5" ? `${MODES[game.cfg.mode].name} // PAST THE ARC ${pct(r.tpm[0], r.tpa[0])} AND ${pct(r.tpm[1], r.tpa[1])}` : `3PT ${pct(r.tpm[0], r.tpa[0])} AND ${pct(r.tpm[1], r.tpa[1])} // FT ${pct(r.ftm[0], r.fta[0])} AND ${pct(r.ftm[1], r.fta[1])}`} // FOULS {r.fouls[0]} AND {r.fouls[1]} // TURNOVERS {r.tov[0]} AND {r.tov[1]}</p>
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
