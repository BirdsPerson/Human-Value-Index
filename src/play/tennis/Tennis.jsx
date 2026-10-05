import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { paintAvatar, loadSprite } from "../../sprites.js";
import { DEFAULT_SPEC, AVATAR_ENUMS, CLOTH } from "../../avatar.js";
import { readPad, GLYPHS } from "../../city/gamepad.js";
import { newMatch, step, rleEncode, resultOf, replay, serverOfMatch, VERSION, BTN } from "./sim.js";
import { FORMATS } from "./score.js";
import { OPPONENTS, OPP_BY_KEY, EASIEST, profileOf, spriteOf, pendingSpec, talkFor } from "./roster.js";
import { draw, drawCutaway, headFrom, faceBox, speakerAt, W, H } from "./render.js";
import { createShow } from "./show.js";
import { createInput } from "./input.js";
import * as SFX from "./audio.js";
import CSS from "./tennis.css?inline";
import "../pages.css";

// #tennis[?vs=<key>][&fmt=short]: THE TENNIS CLUB, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS",
// Tennis). Phase 1: exhibitions only. Nothing here reaches the ladder, the Cup, a league or a file:
// the match is kept in this browser (its seed and its input log, enough to play it again) and
// re-run once at the whistle to show it reproduces.

function injectStyles() {
  let el = document.getElementById("tn-styles");
  if (!el) { el = document.createElement("style"); el.id = "tn-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const parseRoute = (route) => { const q = new URLSearchParams(String(route || "").split("?")[1] || ""); return { vs: q.get("vs"), fmt: q.get("fmt") === "short" ? "short" : "set" }; };
const KEEP = "hvi-tennis-exhibitions", KEEP_N = 5;
export function loadRecords() { try { const j = JSON.parse(localStorage.getItem(KEEP) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
function saveRecord(rec) { try { localStorage.setItem(KEEP, JSON.stringify([rec, ...loadRecords()].slice(0, KEEP_N))); } catch { /* a full or private store: the match stays in the tab */ } }
const NOTICE = "THIS MATCH DOES NOT COUNT. NEITHER, STATISTICALLY, DO YOU.";

// Who you are on court: your file's photo and kit, else a SUBJECT in the Department's grey.
function useMe() {
  return useMemo(() => {
    const caseId = readCaseId(), last = readLastResult(), av = last?.avatar || null;
    const spec = av?.kind === "procedural" ? av.spec : null;
    const name = caseId ? `SUBJECT ${caseId.slice(-4).toUpperCase()}` : "SUBJECT";
    return { caseId, name, spec, url: av?.kind === "sprite" ? av.url : null };
  }, []);
}

// A file photo, frame 0, at 1x (the chess tables' size).
function Face({ spec, url, size = 1, pending = null }) {
  const ref = useRef(null);
  useEffect(() => {
    let off = false;
    const put = (sheet) => { const c = ref.current; if (off || !c) return; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 32, 48); if (sheet) x.drawImage(sheet, 0, 0, 32, 48, 0, 0, 32, 48); };
    if (url) loadSprite(url, { sector: null }).then(img => put(img || paintAvatar(pending || DEFAULT_SPEC, 1))); else put(paintAvatar(spec || DEFAULT_SPEC, 1));
    return () => { off = true; };
  }, [spec, url]);
  return <canvas ref={ref} width={32} height={48} className="tn-face" style={{ width: 32 * size, height: 48 * size }} aria-hidden="true" />;
}

export default function Tennis({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const { vs, fmt: fmt0 } = useMemo(() => parseRoute(route), [route]);
  const me = useMe();
  const [fmt, setFmt] = useState(fmt0);
  const [opp, setOpp] = useState(() => (vs && OPP_BY_KEY.get(vs)) || null);
  const [match, setMatch] = useState(null);   // {seed, key: n}
  const [done, setDone] = useState(null);
  const start = (o, f) => { SFX.unlock(); if (f) setFmt(f); setOpp(o); setDone(null); setMatch({ seed: seedNow(), n: Date.now() }); };
  return (
    <div className="tn">
      <ScreenHead title="THE TENNIS CLUB" meta="THE SHOW COURT // EXHIBITION // NOTHING IS AT STAKE. EVERYTHING IS RECORDED." />
      {match && opp && !done
        ? <Match key={match.n} seed={match.seed} fmt={fmt} opp={opp} me={me} onDone={setDone} onQuit={() => setMatch(null)} />
        : done
          ? <Done done={done} me={me} onAgain={() => start(opp)} onPick={() => { setDone(null); setMatch(null); }} />
          : <Picker fmt={fmt} setFmt={setFmt} pre={vs ? opp?.key || null : null} onPick={start} />}
    </div>
  );
}
function seedNow() {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch { return (Date.now() >>> 0) || 1; }
}

// ---- choosing ------------------------------------------------------------------------------------
// One line, one button: PLAY NOW is a short match against the easiest member. The rest is folded.
function Picker({ fmt, setFmt, pre, onPick }) {
  const [sel, setSel] = useState(() => Math.max(0, OPPONENTS.findIndex(o => o.key === pre)));
  const [more, setMore] = useState(Boolean(pre));
  const refs = useRef([]), playRef = useRef(null);
  const quick = () => onPick(OPP_BY_KEY.get(EASIEST), "short");
  useEffect(() => { if (!pre) playRef.current?.focus({ preventScroll: true }); }, [pre]);
  // a controller can choose too: A or Start plays now; with the list open, up / down picks
  const moreRef = useRef(more); moreRef.current = more;
  useEffect(() => {
    let raf, prev = null, held = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = readPad();
      if (!p.connected) { prev = null; return; }
      const dir = p.y > 0.5 ? 1 : p.y < -0.5 ? -1 : 0;
      if (moreRef.current && dir && held <= 0) { setSel(s => { const n = (s + dir + OPPONENTS.length) % OPPONENTS.length; refs.current[n]?.focus(); return n; }); held = 14; } else if (!dir) held = 0; else held--;
      if (prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) { if (moreRef.current) setSel(s => { onPick(OPPONENTS[s]); return s; }); else quick(); }
      prev = p.held;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onPick]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <p className="pg-lede">TENNIS AGAINST THE COMPUTER. ARROW KEYS MOVE, Z SWINGS, Z TWICE SERVES. A CONTROLLER WORKS, AND PHONES GET A PAD ON SCREEN. SOUND IS OPTIONAL.</p>
      <div className="pg-start">
        <Button variant="primary" ref={playRef} onClick={quick}>PLAY NOW</Button>
        <span className="pg-sub">FIRST TO 4 GAMES, AGAINST THE EASIEST MEMBER OF THE CLUB.</span>
      </div>
      <details className="pg-more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
        <summary>CHOOSE AN OPPONENT AND MATCH LENGTH ({OPPONENTS.length} ON COURT)</summary>
        <div className="pg-more-body">
          <div className="tn-fmt" role="radiogroup" aria-label="Match length">
            {Object.values(FORMATS).map(f => (
              <button key={f.id} type="button" role="radio" aria-checked={fmt === f.id} className={`tn-chip${fmt === f.id ? " on" : ""}`} onClick={() => setFmt(f.id)}>
                {f.id === "set" ? "ONE SET, TIEBREAK AT 6-ALL" : "FIRST TO 4 GAMES"}
              </button>
            ))}
          </div>
          <p className="tn-small">THEN PICK WHO TO PLAY; THE MATCH STARTS AT ONCE. SPEED, REACH AND NERVE FOLLOW THE RATING.</p>
          <ul className="tn-opps">
            {OPPONENTS.map((o, i) => (
              <li key={o.key}>
                <button type="button" ref={el => { refs.current[i] = el; }} className={`tn-opp${i === sel ? " sel" : ""}`} onClick={() => onPick(o)} onFocus={() => setSel(i)} aria-label={`Play ${o.name}, rated ${o.rating}`}>
                  <Face spec={o.spec} url={spriteOf(o)} pending={pendingSpec(o, DEFAULT_SPEC)} size={2} />
                  <span className="nm">{o.name}<span className="tag">{o.regular ? o.note : "ON FILE // A CLUB PLAYER. RATED BY THE CLUB, NOT BY THE DEPARTMENT."}</span></span>
                  <span className="rt">{o.rating}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><Controls /></div>
      </details>
      <p className="tn-notice"><b>EXHIBITION.</b> {NOTICE} NOT ON THE LADDER, NOT IN THE CUP, NOT ON YOUR FILE. THE DEPARTMENT KEEPS THE TAPE ANYWAY.</p>
    </>
  );
}

function Controls() {
  return (
    <dl className="tn-keys">
      <dt>MOVE</dt><dd>ARROWS / WASD // STICK OR D-PAD // THE ROUND PAD ON A PHONE</dd>
      <dt>A</dt><dd>Z OR J // PAD A: SWING. A HIGH BALL IS SMASHED.</dd>
      <dt>B</dt><dd>X OR K // PAD B: LOB. HOLD DOWN FOR A SLICE.</dd>
      <dt>AIM</dt><dd>HOLD A DIRECTION AS YOU HIT: LEFT / RIGHT FOR THE LINES, UP DEEP, DOWN SHORT.</dd>
      <dt>SERVE</dt><dd>A TOSSES. A AGAIN AS THE BALL DROPS INTO THE GREEN BAND BESIDE YOU. LEFT / RIGHT AIMS.</dd>
      <dt>PAUSE</dt><dd>ENTER / ESC // START</dd>
      <dt>CAMERA</dt><dd>BETWEEN POINTS THE BROADCAST MAY FIND SOMEONE IN THE STAND. A OR B (OR A TAP) RETURNS TO THE MATCH. TURN IT OFF UNDER THE COURT.</dd>
    </dl>
  );
}

// ---- the legend under the court: what each button does, in the hands you are using ---------------
const LEGEND_KEY = "hvi-tennis-legend", CUTS_KEY = "hvi-tennis-cutaways";
// a reduced-motion setting starts the crowd cameras off (the viewer can still turn them on)
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const readFlag = (k, dflt) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === "1"; } catch { return dflt; } };
const writeFlag = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* the tab remembers */ } };
export function legendRows(mode, family) {
  if (mode === "pad") {
    const g = GLYPHS[family] || GLYPHS.generic;
    return [
      ["MOVE", "STICK / D-PAD", ""],
      ["SWING", g.act, "A HIGH BALL IS SMASHED."],
      ["LOB", g.back, ""],
      ["SLICE", `DOWN + ${g.back}`, ""],
      ["AIM", "HOLD A DIRECTION", "AS YOU HIT: LEFT / RIGHT THE LINES, UP DEEP, DOWN SHORT."],
      ["SERVE", `${g.act} TOSS, ${g.act} HIT`, "HIT AS THE BALL DROPS INTO THE GREEN BAND. LEFT / RIGHT AIMS."],
      ["PAUSE", g.start, ""],
      ["CAMERA", `${g.act} / ${g.back}`, "BACK TO THE MATCH."],
    ];
  }
  if (mode === "touch") {
    return [
      ["MOVE", "THE ROUND PAD", ""],
      ["SWING", "A", "A HIGH BALL IS SMASHED."],
      ["LOB", "B", ""],
      ["SLICE", "DOWN + B", ""],
      ["AIM", "HOLD THE PAD", "AS YOU HIT: LEFT / RIGHT THE LINES, UP DEEP, DOWN SHORT."],
      ["SERVE", "A TOSS, A HIT", "HIT AS THE BALL DROPS INTO THE GREEN BAND. LEFT / RIGHT AIMS."],
      ["PAUSE", "START", ""],
      ["CAMERA", "A / B / TAP", "BACK TO THE MATCH."],
    ];
  }
  return [
    ["MOVE", "\u2190\u2191\u2193\u2192 / WASD", ""],
    ["SWING", "Z / J", "A HIGH BALL IS SMASHED."],
    ["LOB", "X / K", ""],
    ["SLICE", "\u2193 + X", ""],
    ["AIM", "HOLD AN ARROW", "AS YOU HIT: \u2190 \u2192 THE LINES, \u2191 DEEP, \u2193 SHORT."],
    ["SERVE", "Z TOSS, Z HIT", "HIT AS THE BALL DROPS INTO THE GREEN BAND. \u2190 \u2192 AIMS."],
    ["PAUSE", "ENTER / ESC", ""],
    ["CAMERA", "Z / X / CLICK", "BACK TO THE MATCH."],
  ];
}
const MODE_NAME = { keys: "KEYBOARD", touch: "TOUCH" };
function Legend({ mode, family, open, onToggle, compact = false }) {
  const rows = legendRows(mode, family), label = mode === "pad" ? `CONTROLLER (${String(family || "pad").toUpperCase()})` : MODE_NAME[mode];
  if (compact) {
    return (
      <dl className="tn-legend-mini">
        {rows.map(([k, keys]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd></dd></div>)}
      </dl>
    );
  }
  return (
    <section className={`tn-legend${open ? " open" : ""}`} aria-label="Controls">
      <button type="button" className="tn-legend-head" aria-expanded={open} onClick={onToggle}>
        <span>CONTROLS // {label}</span><span aria-hidden="true">{open ? "HIDE \u25B4" : "SHOW \u25BE"}</span>
      </button>
      {open && (
        <dl className="tn-legend-rows">
          {rows.map(([k, keys, hint]) => <div key={k}><dt>{k}</dt><dd><kbd>{keys}</kbd>{hint && <span>{hint}</span>}</dd></div>)}
        </dl>
      )}
    </section>
  );
}

// ---- the match -----------------------------------------------------------------------------------
const PT = ["0", "15", "30", "40"];
function pointsShown(sc, i) {
  const a = sc.pts[i], b = sc.pts[1 - i];
  if (sc.tb) return String(a);
  if (a >= 3 && b >= 3) return a > b ? "AD" : a === b ? "40" : "";
  return PT[Math.min(a, 3)];
}

function Match({ seed, fmt, opp, me, onDone, onQuit }) {
  const canvasRef = useRef(null), wrapRef = useRef(null), inputRef = useRef(null), showRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedS] = useState(() => SFX.isMuted());
  const [scale, setScale] = useState(1);
  const [pad, setPad] = useState(null);
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches));
  const [legendOpen, setLegendOpen] = useState(() => readFlag(LEGEND_KEY, !touch));
  const [cutsOn, setCutsOn] = useState(() => readFlag(CUTS_KEY, !REDUCED()));
  const [over, setOver] = useState(null);   // {bubble, cut}: the broadcast's words on the picture
  const [tell] = useState(() => talkFor(opp, "start", seed % 3));
  const pausedRef = useRef(false), mutedRef = useRef(muted);
  mutedRef.current = muted;
  const togglePause = (v) => { pausedRef.current = v ?? !pausedRef.current; setPaused(pausedRef.current); };
  const names = [me.name, opp.name];
  const mode = pad ? "pad" : touch ? "touch" : "keys";

  useEffect(() => { const f = () => setTouch(true); window.addEventListener("touchstart", f, { once: true, passive: true }); return () => window.removeEventListener("touchstart", f); }, []);

  // whole device pixels only
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current; if (!el) return;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = Math.max(240, window.innerHeight - 200);
      const k = Math.max(1, Math.floor(Math.min(w / W, h / H) * dpr));
      setScale(k / dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrapRef.current); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  useEffect(() => {
    const cpu = profileOf(opp.key);
    const st = newMatch({ seed, fmt, cpu });
    const log = [];
    const input = createInput(); inputRef.current = input;
    // the broadcast: its own generator, reads the match, never writes it (show.js)
    const show = createShow({ seed, names, opp: opp.key, cutaways: readFlag(CUTS_KEY, !REDUCED()), st });
    showRef.current = show;
    const looks = [lookOf({ spec: me.spec, kit: me.spec ? [CLOTH[me.spec.top_color], CLOTH[me.spec.bottom_color]] : ["#e6e6e6", "#3d3d3d"] }), lookOf({ spec: opp.spec, kit: opp.kit })];
    // heads: the file photos' faces, when they load
    const sheet = (spec, url) => (url ? loadSprite(url, { sector: null }) : Promise.resolve(paintAvatar(spec || DEFAULT_SPEC, 1)));
    sheet(me.spec, me.url).then(s => { const h = headFrom(s); if (h) { looks[0].head = h; looks[0].skin = me.spec ? looks[0].skin : skinOf(h) || looks[0].skin; } });
    sheet(opp.spec, spriteOf(opp)).catch(() => null).then(s => s || (pendingSpec(opp, DEFAULT_SPEC) ? paintAvatar(pendingSpec(opp, DEFAULT_SPEC), 1) : null)).then(s => { const h = headFrom(s); if (h) { looks[1].head = h; if (!opp.spec) looks[1].skin = skinOf(h) || looks[1].skin; } });
    // the stand's faces, fetched one ahead of the camera
    const art = new Map();
    const fetchArt = (s) => {
      if (!s?.slug || art.has(s.slug)) return;
      art.set(s.slug, null);
      loadSprite(s.sprite, { sector: null }).then(img => { if (img) art.set(s.slug, { sheet: img, box: faceBox(img) }); }).catch(() => {});
    };
    fetchArt(show.state.upcoming);
    const ctx = canvasRef.current.getContext("2d");
    let raf, last = performance.now(), acc = 0, hudKey = "", overKey = "", ended = false;
    const onVis = () => { if (document.hidden) togglePause(true); };
    document.addEventListener("visibilitychange", onVis);
    const finish = () => {
      ended = true;
      const rec = { version: VERSION, seed, fmt, opp: opp.key, inputLog: rleEncode(log), result: resultOf(st), at: Date.now() };
      let verified = false;
      try { verified = JSON.stringify(replay(rec, cpu)) === JSON.stringify(rec.result); } catch { verified = false; }
      saveRecord(rec);
      setTimeout(() => onDone({ rec, verified, opp }), 1800);
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
        while (acc >= 1 / 60 && n < 8) {
          acc -= 1 / 60; n++;
          // the broadcast holds the match during a cutaway: no step, nothing in the log
          if (!ended && show.slot(st, inp.mask)) {
            log.push(inp.mask); step(st, inp.mask); SFX.play(st.ev, mutedRef.current);
            show.observe(st);
            if (st.phase === "over") { finish(); }
          } else if (ended) show.slot(st, 0);
        }
      } else acc = 0;
      const S = show.state;
      if (S.upcoming) fetchArt(S.upcoming);
      if (S.cut) drawCutaway(ctx, S.cut, S.t, S.cut.s.slug ? art.get(S.cut.s.slug) : null);
      else draw(ctx, st, looks, st.frame, show);
      const sc = st.sc, server = sc.tb || st.phase !== "over" ? serverOfMatch(st) : -1;
      const call = st.phase === "dead" ? (st.t < 45 ? st.call : st.next) : st.phase === "serve" && st.sub === "ready" ? st.next : st.phase === "over" ? "GAME, SET AND MATCH" : "";
      const key = `${sc.pts}|${sc.games}|${sc.sets.length}|${call}|${server}|${sc.tb}`;
      if (key !== hudKey) {
        hudKey = key;
        setHud({ rows: [0, 1].map(i => ({ sets: sc.sets.map(s => s[i]), games: sc.games[i], pts: pointsShown(sc, i), serve: server === i })), call, tb: sc.tb, done: sc.done });
      }
      const b = S.cut ? null : S.bubble, ok = `${S.cut ? S.cut.n : 0}|${b ? `${b.who}${b.j}${b.text}` : ""}`;
      if (ok !== overKey) { overKey = ok; setOver({ bubble: b ? { ...b } : null, cut: S.cut ? { n: S.cut.n, ...S.cut.caption } : null }); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); input.stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLegend = () => setLegendOpen(v => { writeFlag(LEGEND_KEY, !v); return !v; });
  const toggleCuts = () => setCutsOn(v => { writeFlag(CUTS_KEY, !v); if (showRef.current) showRef.current.state.cutaways = !v; return !v; });
  const bub = over?.bubble, at = bub ? speakerAt(bub.who, bub.j) : null;
  const skipHint = mode === "pad" ? `${(GLYPHS[pad] || GLYPHS.generic).act}: BACK TO THE MATCH` : mode === "touch" ? "TAP: BACK TO THE MATCH" : "Z / CLICK: BACK TO THE MATCH";
  return (
    <div className="tn-match">
      <table className="tn-board" aria-label="Score">
        <tbody>
          {(hud?.rows || [{}, {}]).map((r, i) => (
            <tr key={i} className={hud?.done ? "" : r.serve ? "srv" : ""}>
              <th scope="row"><span className="dot" aria-label={r.serve ? "serving" : undefined}>{r.serve ? "●" : ""}</span>{names[i]}</th>
              {(r.sets || []).map((g, k) => <td key={k} className="set">{g}</td>)}
              <td className="gm">{r.games ?? 0}</td>
              <td className="pt">{hud?.done ? "" : r.pts ?? "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tn-call" aria-live="polite" aria-atomic="true">{hud?.call ? `${hud.call}${hud.tb && hud.call !== "TIEBREAK" ? " // TIEBREAK" : ""}` : " "}{hud?.call && <span className="sr-only">. Games: {names[0]} {hud.rows[0].games}, {names[1]} {hud.rows[1].games}.</span>}</div>
      <div className="tn-stage" ref={wrapRef}>
        <div className="tn-screen" style={{ width: W * scale, height: H * scale }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: W * scale, height: H * scale }} aria-label={`Tennis: ${names[0]} versus ${names[1]}`} role="img" onClick={() => showRef.current?.skip()} />
          {bub && at && !paused && (
            <div className={`tn-bubble ${bub.who}${at[0] > W / 2 ? " west" : ""}`} style={{ left: `${(at[0] / W) * 100}%`, top: `${(at[1] / H) * 100}%` }} aria-live="polite">
              {bub.who === "chair" && <i>THE CHAIR</i>}{bub.text}
            </div>
          )}
          {over?.cut && (
            <div className="tn-lower" onClick={() => showRef.current?.skip()}>
              <b>{over.cut.head}</b>
              <span>{over.cut.note}</span>
              <small>THE DEPARTMENT OF LEISURE // {skipHint}</small>
            </div>
          )}
          {paused && (
            <div className="tn-pause">
              <b>PAUSED</b>
              <span>THE DEPARTMENT HAS STOPPED THE CLOCK. IT DOES NOT USUALLY.</span>
              <Legend mode={mode} family={pad} compact />
              <span>{mode === "pad" ? (GLYPHS[pad] || GLYPHS.generic).start : mode === "touch" ? "START" : "ENTER / ESC"} TO RESUME</span>
            </div>
          )}
        </div>
      </div>
      {touch && <TouchPad input={inputRef} onStart={() => togglePause()} />}
      <Legend mode={mode} family={pad} open={legendOpen} onToggle={toggleLegend} />
      {tell && <p className={`tn-tell ${tell.kind}`}>{tell.kind === "say" ? `${opp.name}: "${tell.text}"` : tell.text}</p>}
      <ButtonRow>
        <Button onClick={() => togglePause()}>{paused ? "Resume" : "Pause"}</Button>
        <Button onClick={() => { const m = !muted; setMutedS(m); SFX.setMuted(m); if (!m) SFX.unlock(); }}>{muted ? "Sound on" : "Mute"}</Button>
        <Button onClick={toggleCuts}>{cutsOn ? "Crowd cameras: on" : "Crowd cameras: off"}</Button>
        <Button variant="back" onClick={onQuit}>Leave the court</Button>
      </ButtonRow>
      <p className="tn-small">{pad ? `CONTROLLER: ${pad.toUpperCase()}. ` : ""}{NOTICE}</p>
    </div>
  );
}

function lookOf({ spec, kit }) {
  const skin = spec ? AVATAR_ENUMS.skin[spec.skin] || "#c68c5e" : "#c68c5e";
  return { kit: [kit[0] || "#e6e6e6", kit[1] || "#3d3d3d"], skin, hair: spec ? AVATAR_ENUMS.hair_color[spec.hair_color] : null, head: null };
}
// the face's own colour: the commonest opaque pixel in the head's lower middle
function skinOf(h) {
  try {
    const d = h.getContext("2d").getImageData(0, 0, h.width, h.height).data, n = new Map();
    for (let y = Math.floor(h.height / 2); y < h.height - 1; y++) for (let x = 3; x < h.width - 3; x++) {
      const o = (y * h.width + x) * 4; if (d[o + 3] < 200) continue;
      const k = `#${[d[o], d[o + 1], d[o + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`; n.set(k, (n.get(k) || 0) + 1);
    }
    let best = null, bn = 0; for (const [k, v] of n) if (v > bn) { bn = v; best = k; }
    return best;
  } catch { return null; }
}

// The phone's pad: a d-pad (one surface, eight ways), A, B, START. Shown on touch screens.
function TouchPad({ input, onStart }) {
  const bits = useRef({ dir: 0, a: 0, b: 0 });
  const push = () => input.current?.setTouch(bits.current.dir | bits.current.a | bits.current.b);
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
    <div className="tn-touch">
      <div className="tn-dpad" onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); dpad(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") dpad(e); }} onPointerUp={dEnd} onPointerCancel={dEnd} aria-label="Direction pad" role="group">
        <span className="u" /><span className="d" /><span className="l" /><span className="r" />
      </div>
      <button type="button" className="tn-start" onClick={onStart}>START</button>
      <div className="tn-ab">
        <button type="button" className="b" {...btn("b", BTN.B)} aria-label="B: lob">B</button>
        <button type="button" className="a" {...btn("a", BTN.A)} aria-label="A: swing">A</button>
      </div>
    </div>
  );
}

// ---- the whistle ---------------------------------------------------------------------------------
function Done({ done, me, onAgain, onPick }) {
  const { rec, verified, opp } = done, r = rec.result, youWon = r.winner === 0;
  const score = r.sets.map(s => (youWon ? `${s[0]}-${s[1]}` : `${s[1]}-${s[0]}`)).join(" ");
  const tell = talkFor(opp, youWon ? "lose" : "win", rec.seed % 2);
  useEffect(() => {
    let raf, prev = null;
    const tick = () => { raf = requestAnimationFrame(tick); const p = readPad(); if (p.connected && prev && ((p.held.act && !prev.act) || (p.held.start && !prev.start))) onAgain(); prev = p.connected ? p.held : null; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onAgain]);
  return (
    <Frame box title="GAME, SET AND MATCH" meta="EXHIBITION">
      <p className={`tn-big ${youWon ? "win" : "lose"}`}>{youWon ? `${me.name} DEFEATS ${opp.name}, ${score}.` : `${opp.name} DEFEATS ${me.name}, ${score}.`}</p>
      <p className="tn-p">{youWon ? "THE DEPARTMENT HAS NOTED AN ANOMALY. IT WILL NOT BE REPEATED IN THE STANDINGS." : "AS PROJECTED. THE PROJECTION IS NOT ON YOUR FILE EITHER."}</p>
      {tell && <p className={`tn-tell ${tell.kind}`}>{tell.kind === "say" ? `${opp.name}: "${tell.text}"` : tell.text}</p>}
      <p className="tn-notice">{NOTICE}</p>
      <p className="tn-small">POINTS {r.pts[0]}-{r.pts[1]} // {Math.round(r.frames / 60)} SECONDS OF PLAY // {verified ? "RE-RUN FROM THE INPUT LOG: SAME RESULT. YOU ARE REPRODUCIBLE." : "THE RE-RUN DISAGREED. THE DEPARTMENT IS LOOKING INTO ITSELF."} KEPT IN THIS BROWSER ONLY.</p>
      <ButtonRow>
        <Button variant="primary" onClick={onAgain}>Rematch</Button>
        <Button onClick={onPick}>Another opponent</Button>
        <Button variant="back" href="#city">The city</Button>
      </ButtonRow>
    </Frame>
  );
}
