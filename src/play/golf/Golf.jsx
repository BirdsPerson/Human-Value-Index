import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import GameMenu from "../GameMenu.jsx";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { CLOTH } from "../../avatar.js";
import { readPad, deadzone } from "../../city/gamepad.js";
import { COURSES, COURSE_NAME, parOf } from "./course.js";
import { newRound, step, logPush, logEvent, act, aimEvent, swingEvent, puttEvent, reachOf, cardOf, toParText, botBits, BTN, VERSION, HZ, holeOf, CLUBS } from "./sim.js";
import { draw, W, H, windWords, pipToWorld, screenToWorld, viewCam, showSpin, onSpin, spinAt, onClubChip } from "./render.js";
import { liveSwing, readSwing, stickSwing, liveStick, contactWord, lineWord } from "./gesture.js";
import { reactionFor, holeReaction } from "./gallery.js";
import { endScene, skipEnd, CAPTION, SCENE_SOUND, SCENE_LEN, endFrame } from "./scenes.js";
import { golfers, golferBySlug } from "./roster.js";
import { lookFor, paintCard } from "./looks.js";
import * as sfx from "./audio.js";
import "./golf.css";
import "../pages.css";

// #golf[?vs=<slug>]: THE DEPARTMENT LINKS (docs/CITY_SPEC.md "PLAYABLE SPORTS / Golf"). The course
// APPLICATION 001 proposed for LOT 0x6F07, which THE ASSEMBLY declined in favour of the farm, played
// anyway, NES-style: stroke play alone or a match against a golfer on file. Exhibitions only: no
// result reaches any standings. A round is kept in this browser as {v, seed, cfg, inputLog, result}
// (replay.js replays it tick for tick on the sim version it was played on) for the day a server
// checks it. The gallery (gallery.js) reacts to each shot: a sound (../crowdAudio.js, under the
// same mute), the crowd's arms (render.js) and a line for the screen reader. After the last hole,
// a short scene (scenes.js), then the card. THE MOUSE / A FINGER (gesture.js): click the map to aim,
// drag down and push up to swing, drag back and let go to putt; a plain click is still the meter's
// button. Each mouse stroke goes into the round's log as one event (sim.js act).

const KEEP = "hvi-golf-rounds";
const EASY_KEY = "hvi-golf-easy";
const MEMORY = [];   // this tab's rounds, kept even when storage is not
const loadRounds = () => { try { const r = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(r) ? r : []; } catch { return MEMORY.slice(); } };
function saveRound(rec) {
  MEMORY.unshift(rec);
  try { localStorage.setItem(KEEP, JSON.stringify([rec, ...loadRounds()].slice(0, 8))); } catch { /* private window: the tab keeps it */ }
}
const parseRoute = (route) => { const q = new URLSearchParams(String(route || "").split("?")[1] || ""); return { vs: q.get("vs") || null, course: ["open", "links"].includes(q.get("course")) ? q.get("course") : null, preset: ["cabinet", "sim"].includes(q.get("preset")) ? q.get("preset") : null }; };
// ?preset=: played at home on a piece from THE SHOPS (src/economy/shops.js PLAY_AT_HOME). The same
// game, framed: the bar-top cabinet is the mouse / trackball drag swing, the simulator the pad's right-stick swing.
const PRESET = {
  cabinet: { title: "YOUR BAR-TOP GOLF CABINET", line: "TRACKBALL RULES: DRAG DOWN, PUSH UP TO SWING. THE MARQUEE GLOWS FOR NOBODY BUT YOU.", frame: "6px solid #0e3a1e" },
  sim: { title: "YOUR HOME GOLF SIMULATOR", line: "THE ROOM, CONVERTED. THE PROJECTOR HUMS. ON A PAD: THE RIGHT STICK, PULL BACK AND PUSH THROUGH. NO PAD: DRAG THE SWING.", frame: "10px solid #2a2a2a" },
};

// You: your file's photo (a drawn sprite or the procedural one) and its kit, else a SUBJECT.
function me() {
  const id = readCaseId(), last = readLastResult();
  const av = last && (!id || last.caseId === id || !last.caseId) ? last.avatar : null;
  const spec = av?.kind === "procedural" ? av.spec : av && !av.kind && av.skin ? av : null;
  return {
    name: id ? `SUBJECT ${id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}` : "SUBJECT",
    color: { shirt: (spec && CLOTH[spec.top_color]) || "#3cbcfc", pants: (spec && CLOTH[spec.bottom_color]) || "#7c7c7c" },
    look: { url: av?.kind === "sprite" ? av.url : null, spec },
  };
}

// A figure's sprite URL, from the file: null while the likeness is pending (no 404 asked for).
const SPRITE_URL = new Map();
function spriteUrl(g) {
  if (!g.sprite.startsWith("/api/sprite/")) return Promise.resolve(g.sprite);
  if (!SPRITE_URL.has(g.slug)) SPRITE_URL.set(g.slug, fetch(`/api/figure/${g.slug}`).then(r => (r.ok ? r.json() : null)).then(j => j?.subject?.sprite || null).catch(() => null));
  return SPRITE_URL.get(g.slug);
}
const lookOfGolfer = (g) => spriteUrl(g).then(url => lookFor({ url, hint: g.hint, crop: g.crop, shirt: g.shirt, pants: g.pants }));
const lookOfMe = (p) => lookFor({ url: p.look?.url || null, spec: p.look?.spec || null, hint: { skin: "tan", hair_style: "short", hair_color: "brown" }, shirt: p.color?.shirt, pants: p.color?.pants });

// The figure as they will play: their face on the standard outfit, 32x48 at 1x.
function GolfCard({ g }) {
  const ref = useRef(null);
  const [generic, setGeneric] = useState(false);
  useEffect(() => {
    let off = false;
    lookOfGolfer(g).then(l => {
      const c = ref.current; if (off || !c) return;
      const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 32, 48); x.drawImage(paintCard(l), 0, 0);
      setGeneric(l.generic);
    });
    return () => { off = true; };
  }, [g]);
  return <canvas ref={ref} width={32} height={48} className="gf-sprite" aria-hidden="true" title={generic ? "LIKENESS PENDING" : undefined} />;
}

export default function Golf({ route }) {
  const { vs, course: course0, preset } = useMemo(() => parseRoute(route), [route]);
  const home = preset ? PRESET[preset] : null;
  const [course, setCourse] = useState(course0 || "open");
  const [count, setCount] = useState(9);
  const [start, setStart] = useState(0);
  const [easy, setEasyState] = useState(() => { try { return localStorage.getItem(EASY_KEY) !== "0"; } catch { return true; } });   // on for a first-timer, then remembered
  const setEasy = (v) => { setEasyState(v); try { localStorage.setItem(EASY_KEY, v ? "1" : "0"); } catch { /* the tab remembers */ } };
  const [game, setGame] = useState(null);
  const [rounds, setRounds] = useState(loadRounds);
  const [muted, setMuted] = useState(sfx.isMuted());
  const field = useMemo(() => golfers(), []);
  const holes = COURSES[course], par = parOf(holes), yards = holes.reduce((a, h) => a + h.yards, 0);
  const pre = vs ? golferBySlug(vs) : null;
  const playRef = useRef(null);
  useEffect(() => { if (!game && !pre) playRef.current?.focus({ preventScroll: true }); }, [game, pre]);

  // demo: the Department's caddie plays the SUBJECT's side with perfect timing (an attract mode).
  // o: overrides for PLAY NOW (the open's front nine, easy swing).
  const begin = (g, demo = false, o = {}) => {
    sfx.unlock();
    const seed = (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0;
    const p = me();
    const c = { course, start, count, easy, ...o };
    setGame({ key: seed, args: [g, demo, o], cfg: { seed, course: c.course, mode: g ? "match" : "stroke", start: c.start, count: c.count, ...(c.easy && !demo ? { easy: true, assist: 2 } : {}), player: demo ? { name: "THE CADDIE", color: { shirt: "#7c7c7c", pants: "#000000" } } : { name: p.name, color: p.color }, cpu: g ? { slug: g.slug, name: g.name, rating: g.rating, color: { shirt: g.shirt, pants: g.pants } } : null }, demo, looks: [demo ? lookFor({ hint: { skin: "light_tan", hair_style: "short", hair_color: "grey" }, shirt: "#7c7c7c", pants: "#000000" }) : lookOfMe(p), ...(g ? [lookOfGolfer(g)] : [])] });
  };
  const done = (rec) => { saveRound(rec); setRounds(loadRounds()); };
  const toggleMute = () => { sfx.setMuted(!muted); setMuted(!muted); };

  return (
    <div className="gf" style={home ? { border: home.frame, padding: 6 } : undefined}>
      <ScreenHead title={home ? home.title : COURSE_NAME[game?.cfg.course || course]} meta={home ? `${COURSE_NAME[game?.cfg.course || course]} // AT HOME` : "EXHIBITION // COUNTS IN NO STANDINGS. THE DEPARTMENT COUNTS IT ANYWAY."} />
      {home && <p className="pg-lede">{home.line}</p>}
      {game ? (
        <>
          <Play key={game.key} cfg={game.cfg} demo={game.demo} lookP={game.looks} onDone={game.demo ? () => {} : done} muted={muted} onMute={toggleMute}
            onAgain={() => begin(...game.args)}
            onNewCourse={() => { const [g, d, o] = game.args, next = (game.cfg.course === "open" ? "links" : "open"); setCourse(next); begin(g, d, { ...o, course: next }); }}
            onSettings={() => setGame(null)} />
          <ButtonRow split stackOnMobile>
            <Button variant="back" onClick={() => setGame(null)}>Leave the course</Button>
            <Button variant="secondary" onClick={toggleMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</Button>
          </ButtonRow>
        </>
      ) : (
        <>
          <p className="pg-lede">GOLF ON FAMOUS HOLES, AGAINST THE COURSE OR A FIGURE ON FILE. WITH A MOUSE OR A FINGER: CLICK THE MAP TO AIM, DRAG DOWN TO TAKE THE CLUB BACK, PUSH UP TO SWING. WITH KEYS: LEFT AND RIGHT AIM, A FULL SWING IS THREE PRESSES OF SPACE (START, POWER, THEN ON THE LINE), A PUTT TWO. MIND THE WIND. SOUND IS OPTIONAL.</p>
          <div className="pg-start">
            <Button variant="primary" ref={playRef} onClick={() => begin(pre, false, pre ? {} : { course: "open", start: 0, count: 9 })}>{pre ? `PLAY ${pre.name}` : "PLAY NOW"}</Button>
            <span className="pg-sub">{pre ? `MATCH PLAY, ${count} HOLES${easy ? ", EASY SWING" : ""}.` : `THE FRONT NINE OF THE DEPARTMENT OPEN${easy ? ", EASY SWING ON" : ""}.`}</span>
          </div>
          <details className="pg-more" open={Boolean(pre)}>
            <summary>COURSE, HOLES AND EASY SWING</summary>
            <div className="pg-more-body">
              <div className="gf-opts" role="group" aria-label="Course">
                {["open", "links"].map(k => (
                  <button key={k} type="button" className="gf-opt" aria-pressed={course === k} onClick={() => setCourse(k)}>{COURSE_NAME[k]}</button>
                ))}
              </div>
              {course === "open"
                ? <p className="gf-p">EIGHTEEN OF THE WORLD'S MOST FAMOUS HOLES, RE-SURVEYED BY THE DEPARTMENT FROM THE PUBLIC RECORD: PAR {par.front + par.back}, {yards.toLocaleString("en-US")} YARDS. THE CLIFFS, THE CREEKS AND THE ISLAND ARE WHERE THEY ARE.</p>
                : <p className="gf-p">APPLICATION 001 PROPOSED A GOLF COURSE FOR LOT 0x6F07. THE ASSEMBLY VOTED FOR THE FARM. THE DEPARTMENT KEPT THE DRAWINGS: PAR {par.front + par.back}, {yards.toLocaleString("en-US")} YARDS. PLAY THEM HERE, WHERE THEY DO NOT EXIST.</p>}
              <div className="gf-opts" role="group" aria-label="Holes">
                {[[0, 9, "FRONT NINE"], [9, 9, "BACK NINE"], [0, 18, "18 HOLES"]].map(([s, c, l]) => (
                  <button key={l} type="button" className="gf-opt" aria-pressed={start === s && count === c} onClick={() => { setStart(s); setCount(c); }}>{l}</button>
                ))}
              </div>
              <div className="gf-opts">
                <button type="button" className="pg-toggle" aria-pressed={easy} onClick={() => setEasy(!easy)}>EASY SWING</button>
                <span className="gf-p dim">A METER AT NEARLY HALF SPEED, A MISSED LINE CURVES A QUARTER AS MUCH AND NEVER SHANKS, A FAT OR THIN STRIKE COSTS LESS, AND THE CUP IS KINDER. ON UNTIL YOU TURN IT OFF. YOUR SIDE ONLY.</span>
              </div>
              <ButtonRow>
                <Button variant="primary" onClick={() => begin(null)}>STROKE PLAY, ALONE</Button>
                <Button variant="secondary" onClick={() => begin(null, true)}>WATCH THE CADDIE PLAY</Button>
              </ButtonRow>
            </div>
          </details>
          <details className="pg-more" open={Boolean(pre)}>
            <summary>PLAY A MATCH AGAINST A FIGURE ({field.length} ON FILE)</summary>
            <div className="pg-more-body">
              <p className="gf-p">HOLE BY HOLE; THE LOWER SCORE TAKES THE HOLE. STRENGTH FOLLOWS THE FIGURE'S GOLF RATING. THE FIGURES PLAY IN SILENCE. THE HOLES AND EASY SWING ABOVE APPLY.</p>
              <ul className="gf-opps">
                {field.map(g => (
                  <li key={g.slug}>
                    <button type="button" className="gf-opp" onClick={() => begin(g)} aria-label={`Play ${g.name}, golf rating ${g.rating}`}>
                      <GolfCard g={g} />
                      <span className="nm"><b>{g.name}</b><span className="why">{g.why}</span></span>
                      <span className="rt">{g.rating}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <Rounds rounds={rounds} />
          <p className="gf-p dim">EXHIBITION ONLY. NO STANDINGS, NO CUP POINTS, NO PRIZES. THE CARD STAYS IN THIS BROWSER.</p>
        </>
      )}
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><Controls /></div>
      </details>
      <p className="gf-p dim">THE OPEN'S GREENS, FAIRWAYS, BUNKERS AND WATER: MAP DATA &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OPENSTREETMAP CONTRIBUTORS</a> (ODBL), TURNED AND SCALED BY THE DEPARTMENT.</p>
    </div>
  );
}

function Controls() {
  return (
    <dl className="gf-keys">
      <dt>MOUSE / TOUCH</dt><dd>CLICK (OR TAP) A SPOT ON THE MAP IN THE CORNER, OR ON THE GROUND AHEAD, TO AIM THERE: THE AIM SWINGS TO IT AND THE CLUB FOR THE DISTANCE COMES OUT. THE WHEEL, OR A CLICK ON THE CLUB BOX, CHANGES CLUB.</dd>
      <dt>DRAG SWING</dt><dd>PRESS ANYWHERE IN THE LOWER HALF, DRAG DOWN TO TAKE IT BACK (FURTHER IS MORE POWER, SHOWN ON THE METER), THEN PUSH UP PAST WHERE YOU STARTED TO SWING THROUGH. STRAIGHT UP FLIES STRAIGHT; DRIFTING RIGHT SLICES, LEFT HOOKS. A SMOOTH PUSH IS PURE; TOO SLOW IS FAT, A FLICK IS THIN. LET GO BEFORE PUSHING THROUGH AND THE SWING IS CALLED OFF. A CLICK WITHOUT A DRAG IS STILL THE METER (CLICK, CLICK, CLICK).</dd>
      <dt>SPIN</dt><dd>THE SMALL BALL UNDER THE MAP: CLICK WHERE ON IT TO STRIKE. LOW: BACKSPIN, IT CHECKS. HIGH: TOPSPIN, IT RUNS. LEFT SIDE: A DRAW. RIGHT: A FADE. THE MIDDLE: NONE.</dd>
      <dt>DRAG PUTT</dt><dd>DRAG DOWN FOR PACE (THE GREEN MARK ON THE METER IS WHERE A FLAT PUTT REACHES THE CUP) AND LET GO. DRIFTING SIDEWAYS PUSHES THE LINE A TOUCH.</dd>
      <dt>RIGHT STICK</dt><dd>ON A PAD: PULL THE RIGHT STICK DOWN TO TAKE IT BACK (FURTHER IS MORE POWER; HOLD IT AT THE BOTTOM FOR A FULL SWING), THEN PUSH IT UP TO SWING THROUGH. STRAIGHT UP FLIES STRAIGHT; DRIFTING RIGHT SLICES, LEFT HOOKS; A SMOOTH PUSH IS PURE. LET IT SETTLE BACK TO THE MIDDLE AND THE SWING IS CALLED OFF. PUTTS: PULL BACK FOR PACE, PUSH FORWARD TO STROKE. A STILL RUNS THE METER.</dd>
      <dt>AIM</dt><dd>LEFT / RIGHT (ARROWS, D-PAD, STICK, OR THE ARROW BUTTONS ON A PHONE). HOLD TO AIM FASTER.</dd>
      <dt>SWING</dt><dd>SPACE OR Z (PAD: A / CROSS; PHONE: SWING). PRESS TO START, PRESS FOR POWER, PRESS ON THE RED LINE. EARLY HOOKS, LATE SLICES.</dd>
      <dt>PUTT</dt><dd>TWO PRESSES: START, THEN PACE (NO RED LINE ON THE GREEN). THE GREEN MARK ON THE METER IS WHERE A FLAT PUTT REACHES THE CUP. LET THE MARKER FALL BACK AND THE PUTT IS CALLED OFF.</dd>
      <dt>WIND</dt><dd>THE ARROW IS THE WIND AS YOU FACE THE SHOT. HELP / INTO: WITH YOU OR AGAINST (INTO COSTS MORE). L&gt;R / R&gt;L: IT DRIFTS THE BALL. A HIGH SHOT FEELS IT MORE THAN A LOW ONE. PUTTS IGNORE IT.</dd>
      <dt>THE GROUND</dt><dd>THE BALL BOUNCES AND RUNS: FURTHEST ON FAIRWAY, LITTLE IN ROUGH, HARDLY AT ALL IN SAND. WEDGES SPIN AND STOP ON THE GREEN; THE DRIVER RUNS. SLOPES MOVE IT EVERYWHERE.</dd>
      <dt>CLUB</dt><dd>X OR DOWN: SHORTER. UP: LONGER. (PAD: B / CIRCLE, BUMPERS. PHONE: CLUB.)</dd>
      <dt>PAUSE</dt><dd>ENTER (PAD: START; PHONE: II).</dd>
      <dt>THE GREEN</dt><dd>THE ARROWS ON THE GREEN POINT DOWNHILL. DARKER IS STEEPER. THE PUTTER'S METER IS SLOWER.</dd>
      <dt>THE WINDOW</dt><dd>TOP RIGHT: THE HOLE FROM ABOVE, YOUR AIM, THE PIN AND THE WIND. CLOSE TO THE GREEN IT SHOWS THE GREEN.</dd>
    </dl>
  );
}

function Rounds({ rounds }) {
  if (!rounds.length) return null;
  return (
    <Frame title="YOUR ROUNDS" meta="THIS BROWSER ONLY">
      <ul className="gf-rounds">
        {rounds.map((r, i) => (
          <li key={i}>{new Date(r.at).toISOString().slice(0, 16).replace("T", " ")} // {r.cfg?.course === "open" ? "OPEN" : "LINKS"} {r.result.holes.length} HOLES // {r.result.mode === "match" ? `V ${r.cfg.cpu?.name}: ` : ""}{r.result.total[0]} ({toParText(r.result.toPar[0])}){r.result.mode === "match" ? ` // ${r.result.winner === 0 ? "WON" : r.result.winner === 1 ? "LOST" : "HALVED"} ${r.result.won[0]}-${r.result.won[1]}` : ""}</li>
        ))}
      </ul>
    </Frame>
  );
}

// ---- the game: canvas, the fixed-step loop, input ------------------------------------------------------
const KEYMAP = { ArrowLeft: BTN.L, ArrowRight: BTN.R, ArrowUp: BTN.U, ArrowDown: BTN.D, " ": BTN.A, z: BTN.A, Z: BTN.A, x: BTN.B, X: BTN.B };
const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };

function Play({ cfg, demo, lookP, onDone, muted, onMute, onAgain, onNewCourse, onSettings }) {
  const [endMenu, setEndMenu] = useState(false);   // the shared end menu (../GameMenu.jsx), once the card is up
  const canvas = useRef(null), wrap = useRef(null);
  const touch = useRef(0);
  const latch = useRef(0);   // a press shorter than a tick still counts: held for at least one tick
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [card, setCard] = useState(null);
  const [scale, setScale] = useState({ css: W, k: 1 });
  const [pad, setPad] = useState(null);
  const [say, setSay] = useState("");   // the screen reader's line: the hole, then each shot's verdict
  const coarse = useMemo(() => { try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; } }, []);
  const [mode, setMode] = useState(coarse ? "pointer" : "keys");   // the legend follows the last input used
  const [classic, setClassic] = useState(false);                     // a phone: the old buttons, on request
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };

  // integer scaling in device pixels: the 320x224 frame is drawn at k device pixels per pixel
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
    const still = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    let endBits = 0, endPlayed = 0, endSaid = false, cardAt = null, menuShown = false;
    // the golfers' looks arrive when their faces load; the picture uses whatever is here
    const looks = [];
    (lookP || []).forEach((p, i) => Promise.resolve(p).then(l => { if (l) { l.card = paintCard(l); looks[i] = l; } }).catch(() => {}));
    const keys = new Set();
    let raf = 0, last = performance.now(), acc = 0, frame = 0, prevStart = false, phase = st.phase, hi = st.hi, recorded = false, said = "";
    const ctx = canvas.current.getContext("2d");
    // ---- the mouse / a finger: aim on the map, drag to swing (gesture.js), logged as events (sim.js act)
    const cv = canvas.current;
    const ui = { mouse: coarse, drag: null, spin: { x: 0, y: 0 }, hint: null };
    const ptr = { id: null, mode: null, S: [], putt: false, aim: null, aimTick: -99, ev: [], sayAim: false };
    const HINT = "hvi-golf-drag-hint";
    let hints = 0;
    try { hints = Number(localStorage.getItem(HINT)) || 0; } catch { /* storage off: hint every round */ }
    const pointerOn = () => { if (!ui.mouse) { ui.mouse = true; setMode("pointer"); } };
    const toGame = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, t: e.timeStamp }; };
    const myAim = () => !demo && st.phase === "aim" && st.players[st.cur].kind === "human";
    const reset = () => { ptr.id = null; ptr.mode = null; ptr.S = []; ptr.cam = null; ui.drag = null; ui.pipHold = false; };
    const aimAt = (g, view) => {
      if (!view) return pipToWorld(st, g.x, g.y);
      const w = screenToWorld(st, g.x, g.y, ptr.cam || undefined), P = st.players[st.cur];
      if (!w.sky) return w;
      // the sky: the direction only, at the club in hand's reach
      const dx = w.x - P.x, dy = w.y - P.y, n = Math.hypot(dx, dy) || 1, L = reachOf(st.club, P.lie);
      return { x: P.x + (dx / n) * L, y: P.y + (dy / n) * L };
    };
    const stroked = (g) => {
      setSay(g.kind === "putt" ? `PUTT: PACE ${Math.round(g.m * 100)} PERCENT.` : `SWING: POWER ${Math.round(g.power * 100)} PERCENT, ${lineWord(g.a)}, ${contactWord(g.contact)}.`);
      hints++; try { localStorage.setItem(HINT, String(hints)); } catch { /* fine */ }
      ui.spin = { x: 0, y: 0 };   // spin is per shot: back to the middle
    };
    const pd = (e) => {
      if (e.button > 0) return;
      pointerOn(); sfx.unlock();
      if (pausedRef.current || demo) return;
      e.preventDefault();
      if (!myAim()) { latch.current |= BTN.A; return; }   // the meter, the hole card, the end: a click is A
      const g = toGame(e);
      if (showSpin(st, ui) && onSpin(g.x, g.y)) {
        ui.spin = spinAt(g.x, g.y);
        const { x, y } = ui.spin;
        setSay(!x && !y ? "SPIN: NONE." : `SPIN: ${y > 0.2 ? "TOPSPIN" : y < -0.2 ? "BACKSPIN" : ""}${x && Math.abs(y) > 0.2 ? " AND " : ""}${x < -0.2 ? "A DRAW" : x > 0.2 ? "A FADE" : ""}.`);
        return;
      }
      if (onClubChip(g.x, g.y)) { latch.current |= BTN.B; return; }
      try { cv.setPointerCapture(e.pointerId); } catch { /* old browser */ }
      ptr.id = e.pointerId;
      const pw = pipToWorld(st, g.x, g.y);
      if (pw) { ptr.mode = "pip"; ptr.aim = pw; ui.pipHold = true; return; }
      if (g.y < H / 2) { ptr.mode = "view"; ptr.cam = viewCam(st); ptr.aim = aimAt(g, true); return; }
      ptr.mode = "swing"; ptr.S = [g]; ptr.putt = Boolean(CLUBS[st.club].putt);
    };
    const pm = (e) => {
      if (e.pointerId !== ptr.id || !ptr.mode) return;
      const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const ce of list.length ? list : [e]) {
        const g = toGame(ce);
        if (ptr.mode === "pip") { const w = aimAt(g, false); if (w) ptr.aim = w; continue; }
        if (ptr.mode === "view") { ptr.aim = aimAt(g, true); continue; }
        ptr.S.push(g);
        const live = liveSwing(ptr.S, ptr.putt);
        ui.drag = live.pull >= 3 ? live : null;
        if (!ptr.putt) {
          const r = readSwing(ptr.S, { easy: Boolean(cfg.easy), done: false });
          if (r.kind === "swing") { ptr.ev.push(swingEvent(r, ui.spin)); stroked(r); reset(); return; }
        }
      }
    };
    const pu = (e) => {
      if (e.pointerId !== ptr.id) return;
      if (ptr.mode === "swing") {
        if (e.type === "pointerup") ptr.S.push(toGame(e));
        const r = readSwing(ptr.S, { putt: ptr.putt, easy: Boolean(cfg.easy), done: true });
        if (e.type !== "pointerup") { /* cancelled by the browser: nothing */ }
        else if (r.kind === "click") latch.current |= BTN.A;
        else if (r.kind === "putt") { ptr.ev.push(puttEvent(r)); stroked(r); }
        else if (r.kind === "swing") { ptr.ev.push(swingEvent(r, ui.spin)); stroked(r); }
        else if (liveSwing(ptr.S).pull >= 6) setSay("SWING CALLED OFF. NO STROKE.");
      } else if (ptr.mode) ptr.sayAim = true;
      reset();
    };
    let wheelAcc = 0, wheelAt = 0;
    const wh = (e) => {
      if (!myAim() || pausedRef.current) return;
      e.preventDefault(); pointerOn();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) >= 40 && e.timeStamp - wheelAt > 120) { latch.current |= wheelAcc > 0 ? BTN.B : BTN.U; wheelAcc = 0; wheelAt = e.timeStamp; }
    };
    cv.addEventListener("pointerdown", pd);
    cv.addEventListener("pointermove", pm);
    cv.addEventListener("pointerup", pu);
    cv.addEventListener("pointercancel", pu);
    cv.addEventListener("wheel", wh, { passive: false });
    // the mouse's events go into the round between the ticks (an aim at most every few ticks)
    const pointerTick = () => {
      if (st.phase !== "aim") { ptr.ev.length = 0; ptr.aim = null; return; }
      if (ptr.aim && st.tick - ptr.aimTick >= 4) {
        const e = aimEvent(ptr.aim.x, ptr.aim.y);
        ptr.aim = null; ptr.aimTick = st.tick;
        logEvent(log, e); act(st, e);
      }
      if (ptr.sayAim && !ptr.aim) {
        ptr.sayAim = false;
        const P = st.players[st.cur], T = st.target;
        if (T) setSay(`AIM: ${Math.round(Math.hypot(T.x - P.x, T.y - P.y))} YARDS. ${CLUBS[st.club].id}.`);
      }
      if (ptr.ev.length) { const e = ptr.ev.shift(); logEvent(log, e); act(st, e); }
    };

    const kd = (e) => {
      if (typing(e)) return;
      if (ui.mouse && KEYMAP[e.key] != null) { ui.mouse = false; setMode("keys"); }
      if (e.key === "Enter" || e.key === "Escape") { if (!e.repeat) togglePause(); e.preventDefault(); return; }
      if (KEYMAP[e.key] != null) { if (!e.repeat) latch.current |= KEYMAP[e.key]; keys.add(e.key); e.preventDefault(); sfx.unlock(); }
    };
    const ku = (e) => { if (KEYMAP[e.key] != null) keys.delete(e.key); };
    const blur = () => keys.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    let padFamily = null;
    // THE RIGHT STICK: the drag swing on a pad (gesture.js stickSwing), the same events as the mouse
    const stk = { on: false, S: [], x: 0, y: 0, rx: 0, ry: 0 };
    const stickTick = () => {
      if (!stk.live || !myAim()) { if (stk.on) ui.drag = null; stk.on = false; stk.S = []; stk.x = stk.y = 0; return; }
      stk.x = stk.x * 0.4 + stk.rx * 0.6; stk.y = stk.y * 0.4 + stk.ry * 0.6;   // light smoothing
      const putt = Boolean(CLUBS[st.club].putt);
      if (!stk.on) { if (stk.y > 0.15) { stk.on = true; stk.S = [{ x: stk.x, y: stk.y, t: (st.tick * 1000) / HZ }]; } return; }
      stk.S.push({ x: stk.x, y: stk.y, t: (st.tick * 1000) / HZ });
      ui.drag = liveStick(stk.S, putt);
      const r = stickSwing(stk.S, { putt, easy: Boolean(cfg.easy) });
      if (r.kind === "pending") return;
      if (r.kind === "swing") { ptr.ev.push(swingEvent(r, ui.spin)); stroked(r); }
      else if (r.kind === "putt") { ptr.ev.push(puttEvent(r)); stroked(r); }
      else setSay("SWING CALLED OFF. NO STROKE.");
      stk.on = false; stk.S = []; ui.drag = null;
    };
    const input = () => {
      let b = touch.current | latch.current;
      latch.current = 0;
      for (const k of keys) b |= KEYMAP[k];
      const p = readPad();
      stk.live = false;
      if (p.connected) {
        if (padFamily !== p.family) { padFamily = p.family; setPad(p.family); }
        let ax = null;
        try { ax = navigator.getGamepads?.()?.[p.index]?.axes || null; } catch { ax = null; }
        if (ax && ax.length >= 4) { const r = deadzone(ax[2], ax[3], 0.18); stk.rx = r.x; stk.ry = r.y; stk.live = true; }
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
        const raw = input(), b = demo ? botBits(st) : raw;
        if (st.phase === "done") {
          // the end scene: any button goes to the card
          if (raw & ~endBits & 63) { if (skipEnd(st)) { setSay(`THE FINAL CARD. ${st.result?.line || ""}`); cardAt = cardAt ?? frame; } else if (cardAt != null) setEndMenu(true); }
          endBits = raw;
          continue;
        }
        if (pausedRef.current) continue;
        if (!demo) { stickTick(); pointerTick(); }
        logPush(log, b);
        step(st, b);
        for (const e of st.ev) sfx.play(e);
        st.ev.length = 0;
      }
      if (st.msg !== said) { said = st.msg; if (said && st.phase !== "rest") setSay(said); }
      if (st.phase !== phase || st.hi !== hi) {
        phase = st.phase; hi = st.hi;
        if (phase === "rest") {
          // the gallery takes the shot: a sound and a line (the crowd's arms are render.js's)
          const r = reactionFor(st, holeOf(st));
          if (r) sfx.crowd(r.kind);
          setSay([st.msg, r?.say].filter(Boolean).join(" "));
        }
        if (phase === "holeEnd") { const r = holeReaction(st, holeOf(st), st.players[0]); if (r) sfx.crowd(r.kind); }
        if (phase === "aim" && st.players[st.cur].kind === "human" && CLUBS[st.club].putt) setSay(ui.mouse ? "PUTTER. DRAG DOWN FOR PACE, LET GO TO PUTT. A TAP STARTS THE TWO-PRESS METER." : "PUTTER. TWO PRESSES: START, THEN PACE.");
        if (phase === "intro") { const r = cardOf(st).rows[hi]; if (r) setSay(`HOLE ${r.n}. PAR ${r.par}. ${r.yards} YARDS. WIND ${st.wind?.mph ?? 0} MPH${st.wind?.mph ? `, ${windWords(st.wind, 0).replace(/HELP/g, "HELPING").replace(/L>R/g, "LEFT TO RIGHT").replace(/R>L/g, "RIGHT TO LEFT")}` : ""}.`); }
        if (phase === "holeEnd") { const c = cardOf(st); setSay(`HOLE DONE. THRU ${c.played}: ${toParText(c.toPar[0])}.`); }
        if (phase === "holeEnd" || phase === "done" || phase === "intro") setCard(cardOf(st));
        if (phase === "done" && !recorded) {
          recorded = true;
          doneRef.current({ v: VERSION, seed: st.cfg.seed, cfg: st.cfg, inputLog: log.slice(), result: st.result, at: Date.now() });
        }
      }
      if (st.phase === "done") {
        // the end scene's sounds, once each, on its own clock
        const kind = endScene(st), f = endFrame(st, frame);
        if (!endSaid) { endSaid = true; setSay(CAPTION[kind]); }
        for (const [k, at] of SCENE_SOUND[kind] || []) if (f >= at && endPlayed < at + 1) sfx.crowd(k);
        endPlayed = f + 1;
        // the card comes up (a press, the scene's end, or at once with reduced motion); the menu a moment later
        if (cardAt == null && (still || f >= SCENE_LEN)) cardAt = frame;
        if (cardAt != null && frame - cardAt >= 90 && !menuShown) { menuShown = true; setEndMenu(true); }
      }
      const P = st.players[st.cur];
      ui.hint = ui.mouse && hints < 3 && st.phase === "aim" && P.kind === "human" ? (CLUBS[st.club].putt ? "DRAG DOWN FOR PACE. LET GO TO PUTT." : "DRAG DOWN TO TAKE IT BACK. PUSH UP TO SWING.") : null;
      draw(ctx, st, frame++, pausedRef.current, looks, { still, ui });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setCard(cardOf(st));
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur);
      cv.removeEventListener("pointerdown", pd); cv.removeEventListener("pointermove", pm); cv.removeEventListener("pointerup", pu); cv.removeEventListener("pointercancel", pu); cv.removeEventListener("wheel", wh);
    };
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
          aria-label="Golf: the golfer from behind with the hole running away to the horizon, the hole from above in the corner window, the swing meter and the wind along the bottom. With a mouse or a finger: click the corner map to aim, drag down then push up in the lower half to swing; drag down and let go to putt." role="img" />
      </div>
      <div className="gf-status">{pad ? `CONTROLLER: ${pad.toUpperCase()} // RIGHT STICK: PULL BACK, PUSH THROUGH // A: THE METER` : mode === "pointer" ? "MOUSE / TOUCH: TAP THE MAP TO AIM // DRAG DOWN, PUSH UP: SWING // DRAG BACK, LET GO: PUTT // TAPS: THE METER // WHEEL OR CLUB BOX: CLUB" : classic && coarse ? "\u25C0 \u25B6 AIM // SWING: THREE TAPS, PUTT: TWO // CLUB // II PAUSES" : "KEYS: ARROWS AIM // SPACE SWINGS (3 PRESSES, PUTTS 2) // X CLUB // ENTER PAUSES"}{muted ? " // MUTED" : ""}{cfg.easy ? " // EASY SWING" : ""}</div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{say}</p>
      <div className="gf-mini">
        {!classic && <button type="button" className="gf-tb" aria-label={paused ? "Resume" : "Pause"} onClick={togglePause}>{paused ? "GO" : "II"}</button>}
        <button type="button" className="gf-tb" aria-pressed={classic} aria-label={classic ? "Hide the classic buttons" : "Show the classic buttons"} onClick={() => setClassic(!classic)}>{classic ? "\u2212" : "+"}</button>
      </div>
      <div className={classic ? "gf-touch" : "gf-touch off"} aria-label="Touch controls">
        <button type="button" className="gf-tb" aria-label="Aim left" {...hold(BTN.L)}>&#9664;</button>
        <button type="button" className="gf-tb" aria-label="Aim right" {...hold(BTN.R)}>&#9654;</button>
        <button type="button" className="gf-tb" aria-label="Next club" {...hold(BTN.B)}>CLUB</button>
        <button type="button" className="gf-tb" aria-label={paused ? "Resume" : "Pause"} onClick={togglePause}>{paused ? "GO" : "II"}</button>
        <button type="button" className="gf-tb swing" aria-label="Swing" {...hold(BTN.A)}>SWING</button>
      </div>
      {card && <Card card={card} cfg={cfg} />}
      {paused && !endMenu && <GameMenu key="pause" kind="pause" title="PAUSED." summary="THE DEPARTMENT WAITS." onBack={togglePause}
        options={{ resume: togglePause, restart: onAgain, controls: <Controls />, sound: { on: !muted, onSelect: onMute }, quit: true }} />}
      {endMenu && <GameMenu key="end" kind="end" title="ROUND FILED." summary={card?.played ? `${toParText(card.toPar[0])} TO PAR OVER ${card.played} HOLES.${cfg.cpu && card.won ? ` MATCH ${card.won[0]}-${card.won[1]}.` : ""}` : undefined} onBack={() => setEndMenu(false)}
        options={{ again: demo ? false : onAgain, rematch: { label: "NEW COURSE", onSelect: onNewCourse }, settings: onSettings, play: true, city: true }} />}
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
