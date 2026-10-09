import { useEffect, useMemo, useRef, useState } from "react";
import { ScreenHead } from "../../ui/index.js";
import TitleScreen from "../TitleScreen.jsx";
import { readPad } from "../../city/gamepad.js";
import { newRun, step, resultOf, rleEncode, rleDecode, VERSION, LEVELS, LEVEL_ORDER, DEFAULT_LEVEL, THEMES, T } from "./engine/index.js";
import { draw, palette, VIEW_W, VIEW_H } from "./render.js";
import { makeInput } from "./input.js";
import * as sfx from "./audio.js";
import { loadProgress, saveProgress, recordRun, loadRuns, saveRun } from "./records.js";
import { getPermit, fileRun, SERVER_FILING } from "./api.js";
import { memoFor, LEVEL_LINES, endLine } from "./calls.js";
import GameMenu from "../GameMenu.jsx";
import CrawlGuide, { GUIDE_KEY, TIPS_KEY, tipText, controlName } from "./Guide.jsx";
import { guideSeen, markGuideSeen, tipsUsed, markTipUsed, Tip, profileHand, usePlayMode } from "../guideKit.jsx";
import "./crawl.css";
import "../pages.css";

// #basements: THE SUB-BASEMENTS under Department Headquarters, B4 and below (docs/design/DUNGEON.md,
// stage D1: B4-B8, solo, engine v1). The lobby (the level, the hand, the lifts reached, the NOTICE),
// then the run: a fixed 60 Hz step over the pure engine, one input word a frame into the record's
// log, the render and the sounds consuming the state and its events. D1 is practice: the record is
// kept in this browser (records.js), the permit is the local seam in api.js.

const TH = THEMES.subbasements;
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };

// The title's four colours: the lift shaft's black, fluorescent white, the filing-cabinet blue, the warning amber.
const COLORS = ["#000000", "#fcfcfc", "#0058f8", "#f8b800"];

export default function Crawl() {
  const [progress, setProgress] = useState(loadProgress);
  const [level, setLevel] = useState(() => (LEVELS[loadProgress().level] ? loadProgress().level : DEFAULT_LEVEL));
  const [hand, setHand] = useState(() => loadProgress().hand || profileHand() || 1);
  const [controls, setControls] = useState(() => loadProgress().controls || "assist");
  const [run, setRun] = useState(null);   // {key, cfg, replay?: rec}
  const [runs, setRuns] = useState(loadRuns);
  const [howto, setHowto] = useState(null);   // the first-run guide, then this level's descent
  const [front, setFront] = useState(() => ({ at: false, n: 0 }));   // the title screen: where it opens (false: the title)
  const [muted, setMuted] = useState(sfx.isMuted());
  const { mode, family } = usePlayMode();
  const day = Math.floor(Date.now() / 86400000);
  const remember = (patch) => { const p = { ...loadProgress(), ...patch }; saveProgress(p); setProgress(p); };

  const descend = async (lv = level) => {
    sfx.unlock();
    const { cfg } = await getPermit({ level: lv, entry: TH.entry, hand, controls });
    setRun({ key: cfg.runId, cfg });
  };
  // the first descent shows the guide first (skippable, remembered)
  const go = (lv = level) => { if (guideSeen(GUIDE_KEY)) descend(lv); else { sfx.unlock(); setHowto({ lv }); } };
  const watch = (rec) => { sfx.unlock(); setRun({ key: `replay-${rec.cfg.runId}-${Date.now()}`, cfg: rec.cfg, replay: rec }); };
  const onFiled = (res, rec) => {
    const p = recordRun(loadProgress(), res); saveProgress(p); setProgress(p);
    saveRun({ at: Date.now(), rec, res }); setRuns(loadRuns());
    fileRun(rec, res);
  };
  const toFront = (at = true) => { setRun(null); setFront(f => ({ at, n: f.n + 1 })); };

  if (run) {
    return (
      <div className="cr">
        <Play key={run.key} cfg={run.cfg} replay={run.replay} hand={hand} onFiled={onFiled}
          onAgain={() => descend(run.cfg.level)} onLobby={() => toFront(true)} onWatch={watch} />
      </div>
    );
  }
  if (howto) {
    return (
      <div className="cr">
        <ScreenHead title="THE SUB-BASEMENTS" meta="B4 AND BELOW" />
        <div className="cr-howto">
          <CrawlGuide mode={mode} family={family} hand={hand} onDone={() => { markGuideSeen(GUIDE_KEY); const lv = howto.lv; setHowto(null); descend(lv); }} />
        </div>
      </div>
    );
  }
  const lifts = progress.lifts.length ? progress.lifts.map(f => `B${f}`).join(", ") : "NONE YET";
  const setLv = (id) => { setLevel(id); remember({ level: id }); };
  const rows = {
    play: { label: `DESCEND: ${LEVELS[level].name}`, onSelect: () => go() },
    // the levels are the shifts on offer: each its own floors, threat and bounty
    modes: { label: "SHIFTS", items: LEVEL_ORDER.map(id => ({ id, label: `${LEVELS[id].name}${id === DEFAULT_LEVEL ? " (DEFAULT)" : ""}`, value: `BOUNTY x${LEVELS[id].bounty}`, note: LEVEL_LINES[id], onSelect: () => { setLv(id); go(id); } })) },
    record: { label: "YOUR RECORD", items: [
      { id: "deepest", label: "DEEPEST", value: progress.deepest ? `B${progress.deepest}` : "-" },
      { id: "shifts", label: "SHIFTS", value: `${progress.runs} (${progress.lifted} BY LIFT, ${progress.lost} LOST)` },
      { id: "lifts", label: "LIFTS REACHED", value: lifts, note: progress.lifts.includes(8) ? "THE B8 LIFT TAKES YOU DOWN WHEN THE STACKS OPEN, NEXT RELEASE." : undefined },
      { id: "carried", label: "CARRIED UP", value: `${progress.crates.length} CRATE${progress.crates.length === 1 ? "" : "S"}`, note: `SALVAGE CRATES ARE SEALED: THEY OPEN NEXT RELEASE. BOUNTY ${progress.bounty} RECORDED, NOT YET PAID.` },
    ] },
    replays: runs.length ? { label: "WATCH A SHIFT AGAIN", items: runs.map(r => ({
      id: String(r.at),
      label: `${new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} ${LEVELS[r.res.level]?.name || r.res.level} B${r.res.depth}`,
      value: r.res.exit === "lift" ? "BY LIFT" : r.res.why === "shift" ? "SHIFT OVER" : "LOST",
      ...(r.rec.v === VERSION ? { onSelect: () => watch(r.rec) } : { disabled: true, note: "PLAYED ON AN OLDER BUILD: IT NO LONGER REPLAYS." }),
    })) } : null,
    settings: [
      { id: "hand", label: "HAND", value: hand === -1 ? "LEFT" : "RIGHT", note: "LEFT: THE PAD SWINGS ON THE SHOULDER BUTTONS AND THE TOUCH CONTROLS MIRROR. REMEMBERED.", cycle: () => { const h = hand === -1 ? 1 : -1; setHand(h); remember({ hand: h }); } },
      { id: "aim", label: "AIM HELP", value: controls === "assist" ? "ON" : "OFF", note: "ON: A SWING TURNS TO THE NEAREST THING IN FRONT OF YOU WITHIN SIX TILES. REMEMBERED.", cycle: () => { const c = controls === "assist" ? "manual" : "assist"; setControls(c); remember({ controls: c }); } },
      { id: "sound", label: "SOUND", value: muted ? "OFF" : "ON", cycle: () => { sfx.setMuted(!muted); setMuted(!muted); if (muted) sfx.unlock(); } },
    ],
    controls: <CrawlGuide mode={mode} family={family} hand={hand} compact />,
    back: true,
  };
  return (
    <div className="cr">
      <ScreenHead title="THE SUB-BASEMENTS" meta="B4 AND BELOW. DEPARTMENT HEADQUARTERS. AUTHORISED STAFF ONLY. EVERYONE IS AUTHORISED." />
      <TitleScreen key={front.n} game="crawl" title="THE SUB-BASEMENTS" sub={`B4 AND BELOW // ${LEVELS[level].name}`} colors={COLORS} at={front.at} rows={rows}
        note={`NOTICE: ${memoFor(day)} ${SERVER_FILING ? "" : "PRACTICE SHIFTS: RUNS STAY IN THIS BROWSER."}`} />
    </div>
  );
}

// ---- the run ----------------------------------------------------------------------------------------
const MSG = {
  "hatch.open": ["A HATCH OPENED", "amber"], sealed: ["SEALED: CLEAR THE FLOOR", "harm"], "infested.cleared": ["FLOOR CLEARED: THE STAIRS ARE OPEN", "accent"],
  locked: ["LOCKED: NEEDS THE KEYCARD", "warn"], "door.open": ["THE STORE IS OPEN", "accent"], "pack.full": ["PACK FULL", "warn"],
  "stalker.arrive": ["THE AUDITOR IS ON THIS FLOOR", "red"], "crate.note": ["CRATE: OPENED ON THE NEXT RELEASE", "amber"], "full.hearts": ["HEARTS FULL", "dim"],
};

function Play({ cfg, replay, hand, onFiled, onAgain, onLobby, onWatch }) {
  const canvasRef = useRef(null), wrapRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(null);   // {res, rec}
  const [muted, setMutedS] = useState(sfx.isMuted());
  const [tile, setTile] = useState(24);
  const [tip, setTip] = useState({ id: null, gone: true });
  const [say, setSay] = useState("");
  const [packView, setPackView] = useState([]);
  const { mode, family } = usePlayMode();
  const reduced = useMemo(REDUCED, []);
  const live = useRef(null);
  const input = useMemo(() => makeInput({ hand }), [hand]);
  if (!live.current) {
    const st = newRun(cfg);
    live.current = { st, words: [], replayWords: replay ? rleDecode(replay.logs[0]) : null, paused: false, ended: false, fx: [], shake: { a: 0, x: 0, y: 0 }, msg: null, t: 0, startPrev: false, firstFloor: st.floor, tipsUsed: tipsUsed(TIPS_KEY), tipNow: null, speed: 1 };
  }
  const L = live.current;
  // a test hook for the screenshot runs (localStorage "hvi-crawl-debug" = "1"): the live run, nothing else
  useEffect(() => { try { if (localStorage.getItem("hvi-crawl-debug") === "1") window.__crawl = L; } catch { /* private */ } return () => { try { delete window.__crawl; } catch { /* */ } }; }, [L]);
  const tileRef = useRef(tile); tileRef.current = tile;
  const setP = (v) => { L.paused = v; setPaused(v); if (v) input.clear(); };

  // the canvas: 24 x 14 tiles, whole device pixels
  useEffect(() => {
    const fit = () => {
      const w = Math.min(wrapRef.current?.clientWidth || 720, 1104);
      setTile(Math.max(10, Math.floor(w / VIEW_W)));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current); else window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  // keys
  useEffect(() => {
    const kd = (e) => {
      if (typing(e)) return;
      if (e.key === "Escape" || e.key === "Enter" || e.key === "p" || e.key === "P") { if (!L.ended) { e.preventDefault(); setP(!L.paused); } return; }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (!L.paused) input.keydown(e);
    };
    const ku = (e) => input.keyup(e);
    const blur = () => { input.clear(); if (!L.ended && !replay) setP(true); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the loop: fixed 60 Hz steps, a render every animation frame
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const pal = palette();
    const ctx = canvasRef.current.getContext("2d");
    const showTip = (id) => { if (replay || L.tipsUsed.has(id) || L.tipNow === id) return; L.tipNow = id; setTip({ id, gone: false }); };
    const useTip = (id) => { if (L.tipNow === id) { setTip(t => ({ ...t, gone: true })); L.tipNow = null; } L.tipsUsed = markTipUsed(TIPS_KEY, id); };
    const onEvents = (st) => {
      for (const e of st.ev) {
        sfx.play(e);
        const m = MSG[e.t];
        if (m) { L.msg = { text: m[0], col: m[1], until: L.t + 2200 }; setSay(m[0]); }
        switch (e.t) {
          case "hit": L.fx.push({ x: e.x, y: e.y, age: 0, life: 10, col: "fg" }); bump(e.what === "cab" ? 0.08 : 0.14); break;
          case "kill": L.fx.push({ x: e.x, y: e.y, age: 0, life: 16, col: "accent" }); break;
          case "break": L.fx.push({ x: e.x, y: e.y, age: 0, life: 16, col: "mute" }); break;
          case "hurt": L.fx.push({ x: e.x, y: e.y, age: 0, life: 14, col: "harm" }); bump(0.32); break;
          case "thud": bump(0.2); break;
          case "audit": bump(0.5); break;
          case "stalker.arrive": bump(0.4); showTip("auditor"); break;
          case "pickup":
            if (e.item === "bounty") L.fx.push({ x: e.x, y: e.y, age: 0, life: 40, text: `+${e.val}`, col: "warn", rise: true });
            else { const t = e.item === "keycard" ? `KEYCARD: B${st.floor}` : e.item === "crate" ? "SALVAGE CRATE" : e.item === "coffee" ? "COFFEE" : "FORM 00"; L.msg = { text: t, col: "amber", until: L.t + 1800 }; setSay(t); }
            break;
          case "alert": showTip("fight"); break;
          case "swing": useTip("fight"); break;
          case "hatch.open": showTip("hatch"); break;
          case "descend": useTip("hatch"); useTip("stairs"); useTip("move"); break;
          case "use": if (e.item === "coffee") useTip("coffee"); break;
          case "floor.enter": { const t = e.lift ? `B${e.f}: THE LIFT IS ON THIS FLOOR` : e.infested ? `B${e.f}: SEALED. CLEAR THE FLOOR.` : `B${e.f}`; L.msg = { text: t, col: e.infested ? "harm" : "fg", until: L.t + 2400 }; setSay(t); break; }
          case "lift.reached": L.msg = { text: `LIFT UNLOCKED: B${e.f}`, col: "cyan", until: L.t + 2600 }; setSay(`Lift unlocked: B${e.f}`); break;
          case "shift.warn": { const t = `SHIFT ENDS IN ${Math.round(e.left / 3600)}:00`; L.msg = { text: t, col: "harm", until: L.t + 3000 }; setSay(t); break; }
          default:
        }
      }
      // the loiter warning: twenty seconds before the Auditor
      if (!st.stalker && st.loiter === st.lv.loiter * 60 - 1200) { L.msg = { text: "FOOTSTEPS. SOMEONE IS CHECKING THIS FLOOR.", col: "warn", until: L.t + 3000 }; setSay("Footsteps. Someone is checking this floor."); }
      const P = st.ents.find(x => x.k === "player");
      if (P && P.hp <= 8 && st.seats[0].pack.some(it => it && it.k === "coffee")) showTip("coffee");
      if (st.frame === 30) showTip("move");
    };
    const bump = (a) => { if (!reduced) L.shake.a = Math.max(L.shake.a, a); };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now; L.t = now;
      const st = L.st;
      // Start on the pad pauses
      const p = readPad();
      if (p.connected) { const s = Boolean(p.held.start); if (s && !L.startPrev && !L.ended) setP(!L.paused); L.startPrev = s; }
      if (!L.paused && !L.ended) {
        acc += dt * (replay ? L.speed : 1);
        while (acc >= 1 / 60) {
          acc -= 1 / 60;
          const w = L.replayWords ? (L.replayWords[st.frame] ?? 0) : input.read();
          if (!L.replayWords) L.words.push(w);
          step(st, [w]);
          onEvents(st);
          if (st.phase === "filed") {
            L.ended = true;
            const res = resultOf(st), rec = { v: VERSION, cfg, logs: [rleEncode(L.words)] };
            if (!replay) onFiled(res, rec);
            setEnded({ res, rec: replay || rec });
            setSay(endLine(res, TH.words));
            break;
          }
          if (L.replayWords && st.frame >= L.replayWords.length + 600) { L.ended = true; setEnded({ res: resultOf(st), rec: replay }); break; }
        }
      }
      // render-only: shake, sparks, the prompt, the message
      const sh = L.shake; sh.a *= 0.86; if (sh.a < 0.01) sh.a = 0;
      sh.x = (Math.random() * 2 - 1) * sh.a * tileRef.current; sh.y = (Math.random() * 2 - 1) * sh.a * tileRef.current;
      L.fx = L.fx.filter(f => ++f.age < f.life);
      const P = st.ents.find(x => x.k === "player");
      let prompt = null;
      if (P && (st.phase === "floor" || st.phase === "landing")) {
        const n = (id) => controlName(id, L.inputMode || "keys", L.family, hand);
        const near = (x, y, r) => (P.x - x) * (P.x - x) + (P.y - y) * (P.y - y) <= r * r;
        const fl = st.fl;
        if (fl.lift && near(fl.descent.x, fl.descent.y, 1.0)) prompt = `${n("interact")}: CALL THE LIFT`;
        else if (!fl.lift && near(fl.descent.x, fl.descent.y, 1.0)) prompt = st.sealed ? "SEALED: CLEAR THE FLOOR" : `${n("interact")}: GO DOWN`;
        else if (st.hatch && near(st.hatch.x, st.hatch.y, 0.9)) prompt = `${n("interact")}: GO DOWN THE HATCH`;
        else if (fl.storeDoor >= 0 && fl.g.t[fl.storeDoor] === T.LOCKED && near((fl.storeDoor % fl.g.w) + 0.5, Math.floor(fl.storeDoor / fl.g.w) + 0.5, 1.4)) prompt = st.seats[0].keycard === st.floor ? `${n("interact")}: OPEN THE STORE` : "LOCKED: NEEDS THE KEYCARD";
        if (prompt && (prompt.includes("GO DOWN") || prompt.includes("LIFT"))) showTip("stairs");
      }
      const S = tileRef.current, mini = { px: Math.max(2, Math.floor(S / 9)), w: st.fl.g.w * Math.max(2, Math.floor(S / 9)) };
      if (L.msg && now > L.msg.until) L.msg = null;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, st, { pal, tile: S, shake: sh, fx: L.fx, t: now, reduced, prompt, msg: L.msg, mini, firstFloor: L.firstFloor, replay: Boolean(replay) });
      if (st.frame % 6 === 0) setPackView(st.seats[0].pack.map(x => x && x.k));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  L.inputMode = input.state.mode === "pad" ? "pad" : mode === "touch" || input.state.mode === "touch" ? "touch" : input.state.mode;
  L.family = input.state.lastFamily || family;

  // canvas backing size
  useEffect(() => {
    const c = canvasRef.current, dpr = window.devicePixelRatio || 1;
    c.width = Math.round(tile * VIEW_W * dpr); c.height = Math.round(tile * VIEW_H * dpr);
    c.style.width = `${tile * VIEW_W}px`; c.style.height = `${tile * VIEW_H}px`;
  }, [tile]);

  const restart = () => { setP(false); onAgain(); };
  const toggleMute = () => { sfx.setMuted(!muted); setMutedS(!muted); };
  const res = ended?.res;
  const levelName = LEVELS[cfg.level]?.name || cfg.level;
  const summary = res ? (res.exit === "lift"
    ? `${endLine(res, TH.words)} ${res.pack.length} IN THE PACK. BOUNTY ${res.bounty} x${LEVELS[cfg.level]?.bounty} = ${res.bountyPaid}, RECORDED HERE (PAID FROM THE NEXT RELEASE).`
    : `${endLine(res, TH.words)} DEEPEST: B${res.depth}.${res.lifts.length ? ` LIFT B${res.lifts.join(", B")} STAYS UNLOCKED.` : ""}`) : "";

  return (
    <div className="cr-play">
      <div className="cr-bar">
        <span>{replay ? "REPLAY // " : ""}{levelName}</span>
        <span className="cr-bar-btns">
          {replay && <button type="button" className="cr-chip" onClick={() => { L.speed = L.speed === 1 ? 3 : 1; }}>SPEED</button>}
          <button type="button" className="cr-chip" aria-label="Pause" onClick={() => !L.ended && setP(true)}>II PAUSE</button>
        </span>
      </div>
      <div className="cr-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="cr-canvas" role="img" aria-label="The Sub-Basements: a top-down floor plan. You are the light square; the stairwell is green, the lift blue, hatches amber." />
      </div>
      <Tip text={tip.id ? tipText(tip.id, L.inputMode || mode, L.family, hand) : ""} gone={tip.gone} />
      <div className="sr-only" role="status" aria-live="polite">{say}</div>
      {!replay && <TouchPad input={input} hand={hand} pack={packView} />}
      {paused && !ended && (
        <GameMenu kind="pause" title="PAUSED." onBack={() => setP(false)}
          options={{ resume: () => setP(false), restart: replay ? null : restart, controls: <CrawlGuide mode={L.inputMode || mode} family={L.family} hand={hand} compact />, sound: { on: !muted, onSelect: toggleMute }, quit: { label: "LEAVE THE SHIFT", onSelect: onLobby } }} />
      )}
      {ended && (
        <GameMenu key="end" kind="end" title={replay ? "REPLAY OVER." : res.exit === "lift" ? "SHIFT FILED: BY LIFT." : "SHIFT FILED: LOST."} summary={summary}
          options={{ again: { label: "DESCEND AGAIN", onSelect: onAgain }, replay: !replay && ended.rec ? () => onWatch(ended.rec) : null, settings: { label: "THE SUB-BASEMENTS MENU", onSelect: onLobby }, play: true, city: { label: "BACK TO HQ", href: "#city" } }}
          onBack={onLobby} />
      )}
    </div>
  );
}

// Touch: a stick on one half, the buttons on the other (mirrored for the left hand), the tray above.
function TouchPad({ input, hand, pack }) {
  const stick = useRef(null), origin = useRef(null);
  const [knob, setKnob] = useState(null);
  const [walk, setWalk] = useState(false);
  const holdT = useRef(0);
  const T0 = input.touch;
  const onDown = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; setKnob({ x: 0, y: 0 }); };
  const onMove = (e) => {
    const o = origin.current; if (!o || o.id !== e.pointerId) return;
    const R = 46, dx = e.clientX - o.x, dy = e.clientY - o.y, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
    T0.x = dx / (m || 1); T0.y = dy / (m || 1); T0.mag = Math.min(1, m / R);
    setKnob({ x: dx * k, y: dy * k });
  };
  const onUp = () => { origin.current = null; T0.mag = 0; T0.x = 0; T0.y = 0; setKnob(null); };
  const hold = (k) => ({
    onPointerDown: (e) => { e.preventDefault(); T0[k] = true; if (k === "attack") holdT.current = setTimeout(() => { T0.lock = true; }, 250); },
    onPointerUp: () => { T0[k] = false; if (k === "attack") { clearTimeout(holdT.current); T0.lock = false; } },
    onPointerCancel: () => { T0[k] = false; T0.lock = false; },
    onPointerLeave: () => { T0[k] = false; if (k === "attack") T0.lock = false; },
  });
  const useSlot = (i) => { input.setSlot(i); T0.use = true; setTimeout(() => { T0.use = false; }, 80); };
  const GL = { coffee: "C", form00: "□", crate: "▣" };
  return (
    <div className={`cr-touch${hand === -1 ? " lefty" : ""}`}>
      <div className="cr-tray" role="group" aria-label="Pack">
        {pack.map((it, i) => <button key={i} type="button" className="cr-slot" aria-label={it ? `Use slot ${i + 1}: ${it}` : `Slot ${i + 1}, empty`} onClick={() => it && useSlot(i)}>{it ? GL[it] || "?" : ""}</button>)}
      </div>
      <div className="cr-touch-row">
        <div className="cr-stick" ref={stick} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Move: drag here" role="application">
          {knob && <span className="cr-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />}
          <span className="cr-stick-hint">DRAG TO MOVE</span>
        </div>
        <div className="cr-btns">
          <button type="button" className="cr-tb big" {...hold("attack")}>HIT</button>
          <button type="button" className="cr-tb" {...hold("roll")}>ROLL</button>
          <button type="button" className="cr-tb" {...hold("tool")}>STAPLE</button>
          <button type="button" className="cr-tb" {...hold("interact")}>ACT</button>
          <button type="button" className="cr-tb small" aria-pressed={walk} onClick={() => { T0.walk = !walk; setWalk(!walk); }}>{walk ? "WALKING" : "WALK"}</button>
        </div>
      </div>
    </div>
  );
}
