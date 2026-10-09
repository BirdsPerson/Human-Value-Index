import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC } from "../../avatar.js";
import { readPad } from "../../city/gamepad.js";
import GameMenu from "../GameMenu.jsx";
import TitleScreen from "../TitleScreen.jsx";
import { cycleOf } from "../titleLogic.js";
import { headFrom, sheetHints } from "../heads.js";
import { newGame, step, rleEncode, resultOf, verify, VERSION, DIFF_IDS, goalsFor } from "./sim.js";
import { LEVELS, LEVEL_IDS } from "./levels.js";
import { makeView, advance, draw, pop } from "./render.js";
import { createInput } from "./input.js";
import { readResults, keepResult, readProgress, fileProgress, progKey } from "./results.js";
import ControlsGuide, { guideSeen, markGuideSeen, namesFor } from "./Guide.jsx";
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
const SKATER_KEY = "hvi-skate-skater", DIFF_KEY = "hvi-skate-diff", STANCE_KEY = "hvi-skate-stance", SPEED_KEY = "hvi-skate-speed", PROMPT_KEY = "hvi-skate-prompts";
const DIFF_NOTE = {
  rookie: "WIDE BALANCE METERS, FORGIVING LANDINGS, A LONGER WINDOW TO LINK A MANUAL OR A REVERT, GOALS SIZED TO MATCH.",
  pro: "THE CLASSIC RULES: A TIGHT LANDING, A FLIP MUST FINISH, A GRAB MUST BE LET GO.",
  sick: "NARROWER METERS, A SHORT WINDOW TO LINK, AND BIGGER GOALS.",
};
const SPEEDS = [["NORMAL", 1], ["SLOW", 0.75], ["SLOWER", 0.55]];
const rd = (k, ok, d) => { try { const v = localStorage.getItem(k); return ok(v) ? v : d; } catch { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* the tab remembers */ } };
// Left-handed (a profile's `hand`) skates goofy unless they have chosen: the same lookup the tennis club makes.
function profileHand() {
  const norm = (h) => (h === "L" || h === "left" || h === -1 || h === "LEFT" ? "L" : h === "R" || h === "right" || h === 1 || h === "RIGHT" ? "R" : null);
  try { const p = JSON.parse(localStorage.getItem("hvi-profile") || "null"); const h = norm(p?.hand); if (h) return h; } catch { /* no profile */ }
  const last = readLastResult();
  return norm(last?.hand) || norm(last?.profile?.hand) || norm(last?.avatar?.hand) || norm(last?.avatar?.spec?.hand) || null;
}
const readStance = () => rd(STANCE_KEY, v => v === "goofy" || v === "regular", null) || (profileHand() === "L" ? "goofy" : "regular");
const usedPrompts = () => { try { const j = JSON.parse(localStorage.getItem(PROMPT_KEY) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } };

// The title's four colours: night, white letters, deck red, the tape's yellow.
const COLORS = ["#000000", "#fcfcfc", "#d82800", "#f8b800"];

export default function Skate({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const opts = useMemo(() => parseRoute(route), [route]);
  const [diff, setDiffS] = useState(() => rd(DIFF_KEY, v => DIFF_IDS.includes(v), "rookie"));
  const [stance, setStanceS] = useState(readStance);
  const [speed, setSpeedS] = useState(() => Number(rd(SPEED_KEY, v => SPEEDS.some(x => String(x[1]) === v), "1")));
  const [muted, setMuted] = useState(() => SFX.isMuted());
  const setDiff = (v) => { setDiffS(v); wr(DIFF_KEY, v); };
  const setStance = (v) => { setStanceS(v); wr(STANCE_KEY, v); };
  const setSpeed = (v) => { setSpeedS(v); wr(SPEED_KEY, String(v)); };
  const mk = (level, mode) => ({ n: Date.now(), level, mode, seed: seedNow(), diff, goofy: stance === "goofy", speed });
  const [play, setPlay] = useState(() => (opts.lvl || opts.cab ? { ...mk(opts.lvl || "park", opts.cab ? "run" : opts.mode), n: 1 } : null));
  const [guided, setGuided] = useState(false);   // the controls guide, once, before the first run
  const [skater, setSkaterS] = useState(() => { try { return SKATER[localStorage.getItem(SKATER_KEY)] ? localStorage.getItem(SKATER_KEY) : "you"; } catch { return "you"; } });
  const setSkater = (k) => { setSkaterS(k); try { localStorage.setItem(SKATER_KEY, k); } catch { /* */ } };
  // the title screen: where it opens next (false: the title; true: the menu; "modes", "settings")
  const [front, setFront] = useState(() => ({ at: false, n: 0 }));
  const toFront = (at = true) => { setPlay(null); setFront(f => ({ at, n: f.n + 1 })); };
  useEffect(() => { if (opts.lvl) setPlay(mk(opts.lvl, opts.mode)); }, [opts]);   // eslint-disable-line react-hooks/exhaustive-deps   // a link into a level
  const start = (level, mode) => { SFX.unlock(); setPlay(mk(level, mode)); };
  const gate = play && !guided && !guideSeen();
  const leaveGuide = () => { markGuideSeen(); setGuided(true); };
  const prog = useMemo(() => readProgress(), [front.n]);   // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => readResults(), [front.n]);   // eslint-disable-line react-hooks/exhaustive-deps
  const P0 = (id) => prog[progKey(id, diff)] || { goals: [], best: 0 };
  const levelNote = (id) => {
    const D = LEVELS[id], P = P0(id);
    return `${D.blurb} GOALS: ${goalsFor(id, diff).map(g => `${P.goals?.includes(g.id) ? "■" : "□"} ${g.name}`).join(", ")}.`;
  };
  const cyc = (list, cur, set) => (d) => set(cycleOf(list, cur, d));
  const rows = {
    play: () => start("park", "run"),
    modes: LEVEL_IDS.flatMap(id => [
      { id: `${id}-run`, label: `RUN: ${LEVELS[id].name}`, hint: P0(id).best ? `BEST ${comma(P0(id).best)}` : "2:00", note: levelNote(id), onSelect: () => start(id, "run") },
      { id: `${id}-free`, label: `FREE SKATE: ${LEVELS[id].name}`, hint: "NO CLOCK", note: `${LEVELS[id].blurb} NO CLOCK, NO GOALS.`, onSelect: () => start(id, "free") },
    ]),
    team: { label: "SKATER SELECT", items: SKATERS.map(s => ({ id: s.key, label: s.name, hint: skater === s.key ? "CHOSEN" : "", note: s.key === "you" ? "YOU SKATE WITH YOUR OWN FILE'S FACE. EVERYONE GETS THE SAME BOARD AND THE SAME LEGS." : undefined, onSelect: () => { setSkater(s.key); return "modes"; } })) },
    settings: [
      { id: "diff", label: "DIFFICULTY", value: diff.toUpperCase(), note: DIFF_NOTE[diff], cycle: cyc(DIFF_IDS, diff, setDiff) },
      { id: "stance", label: "STANCE", value: stance.toUpperCase(), cycle: () => setStance(stance === "goofy" ? "regular" : "goofy") },
      { id: "speed", label: "SPEED", value: SPEEDS.find(x => x[1] === speed)?.[0] || "NORMAL", cycle: (d) => setSpeed(SPEEDS.find(x => x[0] === cycleOf(SPEEDS, SPEEDS.find(y => y[1] === speed)?.[0] || "NORMAL", d))[1]) },
      { id: "sound", label: "SOUND", value: muted ? "OFF" : "ON", cycle: () => { const m = !muted; setMuted(m); SFX.setMuted(m); if (!m) SFX.unlock(); } },
    ],
    runs: results.length ? { label: "YOUR RUNS", items: results.map((r, i) => ({ id: `r${i}`, label: `${LEVELS[r.level]?.name || r.level} ${r.goals.length}/${r.goalsOf} ${r.letters.replace(/_/g, "·")}${r.tape ? " TAPE" : ""}`, value: comma(r.score) })) } : null,
    controls: <ControlsGuide mode={COARSE() ? "touch" : "keys"} family="generic" goofy={stance === "goofy"} compact />,
    back: true,
  };
  return (
    <div className="sb">
      <ScreenHead title="THE PARK" meta="SKATEBOARDING // EVERY RUN IS RECORDED" />
      {gate
        ? <GuideGate onDone={leaveGuide} goofy={stance === "goofy"} />
        : play
          ? <Play key={play.n} game={play} skater={skater} onRestart={() => setPlay(p => ({ ...p, n: Date.now(), seed: seedNow() }))}
              onQuit={() => { if (opts.cab) { window.location.hash = "play"; return; } toFront(true); }}
              onOther={() => { if (opts.cab) { window.location.hash = "play"; return; } toFront("modes"); }} />
          : <TitleScreen key={front.n} game="skate" title="SKATE" sub={`THE PARK, THE VERT RAMP, THE PLAZA // ${diff.toUpperCase()} // ${SKATER[skater].name}`} colors={COLORS} at={front.at} rows={rows}
              note="TWO-MINUTE RUNS: COMBOS, S-K-A-T-E, THE SECRET TAPE, THE GOALS. OR FREE SKATE." />}
    </div>
  );
}
// the guide before the first run: the way you are playing (a pad if one is connected)
function GuideGate({ onDone, goofy }) {
  const [pad, setPad] = useState(() => readPad());
  useEffect(() => { const t = setInterval(() => setPad(readPad()), 500); return () => clearInterval(t); }, []);
  const mode = pad.connected ? "pad" : COARSE() ? "touch" : "keys";
  return <ControlsGuide mode={mode} family={pad.family || "generic"} goofy={goofy} onDone={onDone} />;
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
function Play({ game, skater, onRestart, onQuit, onOther }) {
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
  const [prompt, setPrompt] = useState(null);   // {text, out}: the first-run prompt on the stage

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
    const cfg = { level: game.level, mode: game.mode, seed: game.seed, diff: game.diff, goofy: game.goofy };
    const G = { st: newGame(cfg), words: [], paused: false, ended: false, replay: null };
    const V = makeView(game.level);
    const input = createInput(COARSE() ? "touch" : "keys"); inputRef.current = input;
    const say = (s) => setSr(s);
    if (import.meta.env?.DEV) { window.__hviSkate = G; G.V = V; }
    // the first-run prompts: each shows until you have done the thing, then fades and never returns
    const used = new Set(usedPrompts());
    const useIt = (id) => { if (used.has(id)) return; used.add(id); wr(PROMPT_KEY, JSON.stringify([...used])); };
    const events = (evs, VV) => {
      for (const e of evs) {
        if (e[0] === "ollie") useIt("ollie");
        else if (e[0] === "trick") { if (/FLIP|SHOVE|HEEL/.test(e[1]) && !/MANUAL/.test(e[1])) useIt("flip"); else if (/^(INDY|NOSEGRAB|TAILGRAB|METHOD|MELON|MADONNA|BENIHANA|STALEFISH|CROSSBONE)$/.test(e[1])) useIt("grab"); else if (/MANUAL/.test(e[1])) useIt("manual"); else if (e[1] === "REVERT") useIt("revert"); }
        else if (e[0] === "grind" || e[0] === "lip") useIt("grind");
        if (e[0] === "bank" && e[1] > 0) pop(VV, `+${comma(e[1])}`, "bank");
        else if (e[0] === "multi") pop(VV, e[1] === 2 ? "DOUBLE!" : "TRIPLE!", "goal", 1.4);
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
        acc += dt * (game.speed || 1); let n = 0;
        while (acc >= 1 / 60 && n < 6) {
          acc -= 1 / 60; n++;
          const w = G.bot ? G.bot(S) : inp.word;
          G.words.push(w); step(S, w); events(S.ev, V); SFX.play(S.ev);
          if (S.done) { finish(); break; }
        }
        if (n === 6) acc = 0;
      } else acc = 0;
      if (!G.replay && !G.paused && !G.ended) {
        // which prompt, if any: the first thing in the order you have not yet done and could do now
        const N = namesFor(lastMode || "keys", lastFam || "generic"), air = S.st === "air", ground = S.st === "ground", ramp = air && S.vert >= 0;
        const want = !used.has("ollie") && ground && S.t > 30 ? ["ollie", `HOLD ${N.ollie}, RELEASE TO OLLIE`]
          : !used.has("flip") && air ? ["flip", `${N.flip} + DIRECTION: FLIP`]
          : !used.has("grab") && air && used.has("flip") ? ["grab", `${N.grab}: GRAB (HOLD IT)`]
          : !used.has("grind") && air && used.has("grab") ? ["grind", `${N.grind} ON A RAIL: GRIND`]
          : !used.has("manual") && ground && used.has("grab") && used.has("flip") && S.t > 600 ? ["manual", `${N.manual.replace(", ", "-")}: MANUAL`]
          : !used.has("revert") && ramp && used.has("flip") ? ["revert", `${N.r2} ON LANDING: REVERT`] : null;
        const cur = G.prompt;
        if (want && (!cur || cur.id !== want[0])) { G.prompt = { id: want[0], text: want[1] }; setPrompt({ text: want[1], out: false }); }
        else if (!want && cur) { G.prompt = null; setPrompt(p => (p ? { ...p, out: true } : p)); }
      }
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
  const legend = <ControlsGuide mode={mode} family={family} goofy={game.goofy} compact />;
  const end = menu && menu.end ? menu : null;
  return (
    <div className="sb-play">
      <div className="sb-stage" ref={wrapRef}>
        <canvas ref={canvasRef} width={size.W} height={size.H} style={{ width: "100%", height: size.H * size.scale }} role="img" aria-label={`${L.name}: the skate level, seen from above at an angle`} />
        {prompt && !watching && !menu && <div className={`sb-prompt${prompt.out ? " out" : ""}`} aria-hidden="true">{prompt.text}</div>}
        {watching && <button type="button" className="sb-stoptape" onClick={() => api.stopWatch?.()}>STOP THE REPLAY</button>}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{sr}</div>
      {touch && !watching && <TouchPad input={inputRef} />}
      {/* restart, sound, controls, ending a free skate and leaving: the pause menu */}
      <ButtonRow>
        <Button onClick={() => api.pause?.()}>Pause</Button>
      </ButtonRow>
      {menu === "pause" && (
        <GameMenu kind="pause" title="PAUSED." summary={`${L.name}. ${game.mode === "run" ? "THE CLOCK IS STOPPED." : "FREE SKATE."} ${game.diff.toUpperCase()}, ${game.goofy ? "GOOFY" : "REGULAR"}.`} onBack={() => api.resume?.()}
          options={{ resume: () => api.resume?.(), restart: onRestart, ...(game.mode === "free" ? { endfree: { label: "END THE SESSION", onSelect: () => api.end?.() } } : {}), controls: legend, sound: { on: !muted, onSelect: toggleMute }, quit: { label: "LEAVE THE PARK", onSelect: onQuit } }} />
      )}
      {end && !watching && (
        <GameMenu key="end" kind="end" title={`${comma(end.end.score)} POINTS.`}
          summary={`${L.name}. BEST COMBO ${comma(end.end.best)}. LETTERS ${end.end.letters.replace(/_/g, "·")}${end.end.tape ? ", THE TAPE" : ""}. GOALS ${end.end.goals.length} OF ${end.end.goalsOf}.${end.beat ? " A NEW BEST." : ""}${end.verified ? " RE-SKATED FROM THE LOG: THE SAME." : ""}`}
          onBack={() => setMenu(null)}
          options={{ again: onRestart, replay: () => api.watch?.(), settings: { label: "ANOTHER LEVEL", onSelect: onOther || onQuit }, play: true, city: true }} />
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
        <button type="button" className="sb-tb rv" {...hold("r")} aria-label="Revert">R2</button>
        <button type="button" className="sb-tb y" {...hold("y")} aria-label="Grind">△<small>GRIND</small></button>
        <button type="button" className="sb-tb x" {...hold("x")} aria-label="Flip">□<small>FLIP</small></button>
        <button type="button" className="sb-tb b" {...hold("b")} aria-label="Grab">○<small>GRAB</small></button>
        <button type="button" className="sb-tb a" {...hold("a")} aria-label="Ollie">✕<small>OLLIE</small></button>
        <button type="button" className="sb-tb sp l" {...hold("sl")} aria-label="Spin left">↶</button>
        <button type="button" className="sb-tb sp r" {...hold("sr")} aria-label="Spin right">↷</button>
      </div>
    </div>
  );
}
