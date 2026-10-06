import { useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId, readLastResult } from "../../caseFile.jsx";
import { CLOTH } from "../../avatar.js";
import { readPad, GLYPHS } from "../../city/gamepad.js";
import { SPOTS, SPOT, SPECIES, SPECIES_BY, LURES, speciesAt, appetite, conditionsAt, SEASONS, LIGHTS, lbText, inText } from "./data.js";
import { newTrip, step, logPush, botBits, BTN, HZ } from "./sim.js";
import { draw, W, H } from "./render.js";
import { loadBox, loadBests, recordCatch, markDonated, saveTrip } from "./box.js";
import { startTrip, donateCatch, loadAquarium } from "./api.js";
import * as sfx from "./audio.js";
import "./fish.css";
import "../pages.css";

// #fish[?spot=pier|break|estuary|river|lake]: THE WATERS (docs/CITY_SPEC.md "PLAYABLE SPORTS / Fishing").
// Cast, wait, set the hook, fight the fish on the tension gauge, keep or release, and donate the good
// ones to THE AQUARIUM (#aquarium), which re-plays the trip on its server before the plaque moves.

const parseRoute = (route) => { const q = new URLSearchParams(String(route || "").split("?")[1] || ""); const s = q.get("spot"); return { spot: SPOT[s] ? s : null }; };
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
function me() {
  const id = readCaseId(), last = readLastResult();
  const av = last && (!id || last.caseId === id || !last.caseId) ? last.avatar : null;
  const spec = av?.kind === "procedural" ? av.spec : av && !av.kind && av.skin ? av : null;
  return { caseId: id, name: id ? `SUBJECT ${id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}` : "SUBJECT", color: { shirt: (spec && CLOTH[spec.top_color]) || "#3cbcfc", pants: (spec && CLOTH[spec.bottom_color]) || "#7c7c7c" } };
}
const condLine = (c) => `DAY ${c.day} ${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")} // ${LIGHTS[c.light]} // ${SEASONS[c.season]} // ${c.weather}`;

export default function Fish({ route }) {
  const { spot: spot0 } = useMemo(() => parseRoute(route), [route]);
  const [spot, setSpot] = useState(spot0 || "pier");
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(sfx.isMuted());
  const [box, setBox] = useState(loadBox);
  const [bests, setBests] = useState(loadBests);
  const [tanks, setTanks] = useState(null);
  const [now, setNow] = useState(() => conditionsAt(Date.now()));
  const playRef = useRef(null);
  useEffect(() => { if (spot0) setSpot(spot0); }, [spot0]);
  useEffect(() => { const t = setInterval(() => setNow(conditionsAt(Date.now())), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!game) playRef.current?.focus({ preventScroll: true }); }, [game]);
  useEffect(() => { if (game) return; let off = false; loadAquarium().then(j => { if (!off) setTanks(j.tanks || {}); }).catch(() => { if (!off) setTanks(null); }); return () => { off = true; }; }, [game]);

  // A permit from the aquarium when this browser holds a case (the seed and the clock are the
  // server's, so the catches can be donated); otherwise a trip of your own, kept here only.
  const begin = async (demo = false, where = spot) => {
    sfx.unlock();
    const p = me();
    const player = demo ? { name: "THE WARDEN", color: { shirt: "#7c7c7c", pants: "#000000" } } : { name: p.name, color: p.color };
    let cfg = { seed: (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0, spot: where, at: Date.now(), player }, tripId = null, line = "";
    if (!demo && p.caseId) {
      setBusy(true);
      try { const t = await startTrip(p.caseId, where); cfg = { seed: t.seed, spot: where, at: t.at, player }; tripId = t.tripId; line = "PERMIT ISSUED. YOUR CATCHES CAN GO TO THE AQUARIUM."; }
      catch (e) { line = `NO PERMIT (${e.message}). FISH ANYWAY: THIS TRIP STAYS IN THIS BROWSER.`; }
      setBusy(false);
    } else if (!demo) line = "NO CASE FILE IN THIS BROWSER: FISH FREELY. DONATING TO THE AQUARIUM NEEDS A FILE.";
    setNote(line);
    setGame({ key: cfg.seed ^ cfg.at, cfg, demo, tripId, caseId: p.caseId });
  };
  const refresh = () => { setBox(loadBox()); setBests(loadBests()); };
  const toggleMute = () => { sfx.setMuted(!muted); setMuted(!muted); };
  const here = SPOT[spot], biting = speciesAt(spot).map(s => [s, appetite(s, now)]).filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="fi">
      <ScreenHead title="THE WATERS" meta="FISHING BY PERMIT. THE FISH HAVE NOT BEEN ASKED." />
      {game ? (
        <>
          {note && <p className="fi-p dim">{note}</p>}
          <Play key={game.key} game={game} muted={muted} onChange={refresh} />
          <ButtonRow split stackOnMobile>
            <Button variant="back" onClick={() => { setGame(null); refresh(); }}>Leave the water</Button>
            <Button variant="secondary" onClick={toggleMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</Button>
          </ButtonRow>
        </>
      ) : (
        <>
          <p className="pg-lede">FISH THE CITY'S WATERS. CAST, WAIT FOR THE TAKE, SET THE HOOK, THEN KEEP THE LINE TIGHT WITHOUT SNAPPING IT. THE BEST CATCHES GO TO THE AQUARIUM, WHICH CHECKS YOUR TRIP BEFORE IT HANGS A PLAQUE.</p>
          <div className="pg-start">
            <Button variant="primary" ref={playRef} disabled={busy} onClick={() => begin(false)}>{busy ? "ISSUING A PERMIT..." : `PLAY NOW: ${here.name}`}</Button>
            <span className="pg-sub">{condLine(now)}</span>
          </div>
          <details className="pg-more" open={Boolean(spot0)}>
            <summary>THE SPOT, AND WHAT IS BITING NOW</summary>
            <div className="pg-more-body">
              <div className="fi-opts" role="group" aria-label="Where to fish">
                {SPOTS.map(s => <button key={s.id} type="button" className="fi-opt" aria-pressed={spot === s.id} onClick={() => setSpot(s.id)}>{s.name}</button>)}
              </div>
              <p className="fi-p">{here.name} // {here.water.toUpperCase()} // {here.depth} FT // {here.note}{here.place ? "" : " (ON THE RIVER, MOUNTAIN TO SEA: OPENING IN THE CITY SOON.)"}</p>
              <p className="fi-p dim">BITING AT THIS HOUR: {biting.length ? biting.map(([s, a]) => `${s.name}${a > 1.2 ? " (HUNGRY)" : a < 0.4 ? " (SLOW)" : ""}`).join(", ") : "NOTHING. THE WATER IS RESTING."}. THE LIGHT, THE SEASON AND THE WEATHER FOLLOW THE CITY'S CLOCK: ONE REAL SECOND IS ONE MACHINE MINUTE.</p>
              <ButtonRow>
                <Button variant="primary" disabled={busy} onClick={() => begin(false)}>FISH {here.name}</Button>
                <Button variant="secondary" onClick={() => begin(true)}>WATCH THE WARDEN FISH</Button>
              </ButtonRow>
            </div>
          </details>
          <details className="pg-more">
            <summary>THE RECORD BOARD ({tanks ? Object.values(tanks).filter(t => t.record).length : "-"} OF {SPECIES.length} SPECIES DONATED)</summary>
            <div className="pg-more-body"><Board tanks={tanks} bests={bests} /></div>
          </details>
          <details className="pg-more">
            <summary>YOUR TACKLE BOX ({box.length} KEPT)</summary>
            <div className="pg-more-body"><Box box={box} bests={bests} /></div>
          </details>
        </>
      )}
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><Controls /></div>
      </details>
    </div>
  );
}

function Board({ tanks, bests }) {
  return (
    <>
      <p className="fi-p dim">THE CITY RECORD FOR EACH SPECIES IS THE HEAVIEST FISH DONATED TO <a href="#aquarium">THE AQUARIUM</a>, CHECKED BY REPLAY. YOUR BEST IS THIS BROWSER'S.{tanks ? "" : " THE AQUARIUM DID NOT ANSWER; ONLY YOUR BESTS ARE SHOWN."}</p>
      <table className="fi-board">
        <thead><tr><th scope="col">SPECIES</th><th scope="col">CITY RECORD</th><th scope="col">YOUR BEST</th></tr></thead>
        <tbody>
          {SPECIES.map(s => {
            const r = tanks?.[s.id]?.record, b = bests[s.id];
            return (
              <tr key={s.id}>
                <th scope="row">{s.name}</th>
                <td>{r ? `${(r.cw / 100).toFixed(2)} LB // ${r.holder}` : "NOT YET DONATED"}</td>
                <td>{b ? `${(b.cw / 100).toFixed(2)} LB` : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Box({ box, bests }) {
  if (!box.length && !Object.keys(bests).length) return <p className="fi-p dim">EMPTY. FISH ARE KEPT WITH A (OR KEEP ON THE CATCH CARD). RELEASED FISH STILL COUNT TOWARD YOUR BESTS.</p>;
  return (
    <ul className="fi-list">
      {box.slice(0, 30).map((k, i) => (
        <li key={i}>{SPECIES_BY[k.sp]?.name || k.sp} // {lbText(k.cw)} // {inText(k.tl)} // {SPOT[k.spot]?.name || k.spot}, DAY {k.day}{k.donated ? " // IN THE AQUARIUM" : ""}</li>
      ))}
    </ul>
  );
}

const MODE_NAME = { keys: "KEYBOARD", touch: "TOUCH" };
export function legendRows(mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic;
  const A = mode === "pad" ? g.act : mode === "touch" ? "REEL" : "Z / SPACE", B = mode === "pad" ? g.back : mode === "touch" ? "JERK" : "X";
  const LR = mode === "pad" ? "D-PAD ← →" : mode === "touch" ? "◀ ▶" : "← →";
  return [
    ["LURE", LR, "BEFORE THE CAST: WORM, MINNOW, SPOON, POPPER."],
    ["CAST", `${A}, ${A}`, "START THE METER, THEN CAST AT THE POWER YOU WANT."],
    ["REEL", `HOLD ${A}`, "THE LURE SWIMS TOWARD YOU AND RISES. LET GO AND IT SINKS. A SPOON WANTS SWIMMING; BAIT WANTS STILLNESS."],
    ["JERK", B, "A TWITCH (A POPPER POPS). WHEN THE FLOAT GOES UNDER AND IT SAYS SO: SET THE HOOK. TOO EARLY AND IT IS GONE."],
    ["FIGHT", `HOLD ${A} / LET GO`, "KEEP THE LINE IN THE BLUE. RED TOO LONG SNAPS IT; SLACK TOO LONG AND IT THROWS THE HOOK. WHEN IT RUNS, LET GO."],
    ["KEEP", `${A} / ${B}`, "KEEP OR RELEASE. A PERMITTED CATCH CAN BE DONATED TO THE AQUARIUM FIRST."],
    ["PAUSE", mode === "pad" ? g.start : mode === "touch" ? "II" : "ENTER / ESC", ""],
  ];
}
function Controls({ mode = "keys", family = null }) {
  return (
    <dl className="fi-keys" aria-label={`Controls, ${mode === "pad" ? "controller" : MODE_NAME[mode] || "keyboard"}`}>
      {legendRows(mode, family).flatMap(([k, v, why]) => [<dt key={k}>{k}</dt>, <dd key={k + "d"}><b>{v}</b>{why ? ` ${why}` : ""}</dd>])}
    </dl>
  );
}

// ---- the game: canvas, the fixed-step loop, input --------------------------------------------------------
const KEYMAP = { ArrowLeft: BTN.L, ArrowRight: BTN.R, ArrowUp: BTN.U, ArrowDown: BTN.D, " ": BTN.A, z: BTN.A, Z: BTN.A, x: BTN.B, X: BTN.B };
const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };

function Play({ game, muted, onChange }) {
  const { cfg, demo, tripId, caseId } = game;
  const canvas = useRef(null), wrap = useRef(null);
  const touch = useRef(0), latch = useRef(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [scale, setScale] = useState({ css: W, k: 1 });
  const [mode, setMode] = useState(() => { try { return window.matchMedia("(pointer: coarse)").matches ? "touch" : "keys"; } catch { return "keys"; } });
  const [pad, setPad] = useState(null);
  const [say, setSay] = useState("");
  const [landed, setLanded] = useState(null);   // {k, n} while the catch card is up
  const [gift, setGift] = useState(null);       // the donation's state for the card: {busy} | {ok, line} | {error}
  const logRef = useRef([]);
  const donated = useRef(new Set());
  const reduced = useMemo(REDUCED, []);
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

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
    const st = newTrip(cfg), log = logRef.current = [];
    const keys = new Set();
    let raf = 0, last = performance.now(), acc = 0, frame = 0, prevStart = false, said = "", seen = 0, saveAt = 0, carded = -1;
    const ctx = canvas.current.getContext("2d");
    const kd = (e) => {
      if (typing(e)) return;
      if (e.key === "Enter" || e.key === "Escape") { if (!e.repeat) togglePause(); e.preventDefault(); return; }
      if (KEYMAP[e.key] != null) { if (!e.repeat) latch.current |= KEYMAP[e.key]; keys.add(e.key); e.preventDefault(); sfx.unlock(); setMode("keys"); }
    };
    const ku = (e) => { if (KEYMAP[e.key] != null) keys.delete(e.key); };
    const blur = () => keys.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    let padFamily = null;
    const input = () => {
      let b = touch.current | latch.current;
      latch.current = 0;
      for (const k of keys) b |= KEYMAP[k];
      const p = readPad();
      if (p.connected) {
        if (padFamily !== p.family) { padFamily = p.family; setPad(p.family); }
        if (p.x < -0.5 || p.held.turnL) b |= BTN.L;
        if (p.x > 0.5 || p.held.turnR) b |= BTN.R;
        if (p.held.act) b |= BTN.A;
        if (p.held.back) b |= BTN.B;
        if ((p.held.act || p.held.back || p.mag > 0.5)) setMode("pad");
        if (p.held.start && !prevStart) togglePause();
        prevStart = p.held.start;
      } else if (padFamily) { padFamily = null; setPad(null); }
      return b;
    };
    const keep = () => { if (tripId && !demo) saveTrip(tripId, { seed: cfg.seed, spot: cfg.spot, at: cfg.at }, log.slice()); };
    const loop = (now) => {
      acc = Math.min(acc + (now - last) / 1000, 5 / HZ);
      last = now;
      while (acc >= 1 / HZ) {
        acc -= 1 / HZ;
        const b = demo ? (input(), botBits(st)) : input();
        if (pausedRef.current || st.phase === "done") continue;
        logPush(log, b);
        step(st, b);
        for (const e of st.ev) sfx.play(e);
        st.ev.length = 0;
      }
      if (st.msg !== said) { said = st.msg; if (said) setSay(said); }
      // a new catch: the card; its fate decided: the tackle box
      if (st.phase === "landed" && st.catches.length - 1 > carded) { const k = st.catches[st.catches.length - 1]; carded = k.n; setLanded({ k: { ...k }, n: k.n }); setGift(null); }
      const lastK = st.catches[st.catches.length - 1];
      if (lastK && lastK.fate && st.catches.length > seen) {
        seen = st.catches.length;
        if (!demo) {
          recordCatch(lastK, { tripId, kept: lastK.fate === "keep" || donated.current.has(lastK.n) });
          if (donated.current.has(lastK.n)) markDonated(tripId, lastK.n);
          keep();
          onChangeRef.current?.();
        }
        setLanded(null);
      }
      if (now - saveAt > 10000) { saveAt = now; keep(); }
      draw(ctx, st, frame++, pausedRef.current, { reduced });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setSay(`${SPOT[cfg.spot].name}. ${condLine(st.cond)}. CHOOSE A LURE WITH LEFT AND RIGHT, CAST WITH A.`);
    return () => { cancelAnimationFrame(raf); keep(); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const hold = (bit) => ({
    onPointerDown: (e) => { e.preventDefault(); sfx.unlock(); setMode("touch"); touch.current |= bit; latch.current |= bit; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* old browser */ } },
    onPointerUp: () => { touch.current &= ~bit; },
    onPointerCancel: () => { touch.current &= ~bit; },
    onContextMenu: (e) => e.preventDefault(),
  });
  const press = (bit) => { latch.current |= bit; };
  const donate = async () => {
    if (!landed || !tripId || !caseId) return;
    setGift({ busy: true });
    try {
      const k = landed.k, j = await donateCatch(caseId, tripId, landed.n, { sp: k.sp, cw: k.cw, tl: k.tl }, logRef.current.slice());
      donated.current.add(landed.n);
      const f = j.filed;
      setGift({ ok: true, line: f.record ? `DONATED. A CITY RECORD: ${f.name}, ${(f.cw / 100).toFixed(2)} LB, CAUGHT BY ${f.holder}.${f.beat ? ` ${f.beat.holder}'S ${(f.beat.cw / 100).toFixed(2)} LB MOVES TO PREVIOUS RECORDS.` : ""}` : `DONATED. ${f.name} IS IN THE TANK. THE RECORD STANDS AT ${(j.tank.record.cw / 100).toFixed(2)} LB.` });
      setSay("DONATED TO THE AQUARIUM.");
      press(BTN.A);   // the aquarium keeps it
    } catch (e) { setGift({ error: e.message }); }
  };
  const legendMode = pad ? "pad" : mode;

  return (
    <div className="fi-play" ref={wrap}>
      <div className="fi-stage">
        <canvas ref={canvas} width={W} height={H} style={{ width: scale.css, height: (scale.css * H) / W }}
          aria-label="Fishing: the angler on the left, the water in cross-section with the fish under the surface, the line and the lure, the tension gauge along the bottom." role="img" />
      </div>
      {landed && !demo && (
        <div className="fi-catch" role="group" aria-label="The catch">
          <span>{SPECIES_BY[landed.k.sp].name} // {lbText(landed.k.cw)} // {inText(landed.k.tl)}</span>
          <ButtonRow>
            <Button variant="primary" onClick={() => press(BTN.A)} disabled={gift?.busy}>{SPECIES_BY[landed.k.sp].protected ? "RELEASE (PROTECTED)" : "KEEP"}</Button>
            <Button variant="secondary" onClick={() => press(BTN.B)} disabled={gift?.busy}>RELEASE</Button>
            {tripId && caseId
              ? <Button variant="secondary" onClick={donate} disabled={Boolean(gift?.busy || gift?.ok)}>{gift?.busy ? "THE AQUARIUM IS REPLAYING YOUR TRIP..." : "DONATE TO THE AQUARIUM"}</Button>
              : <span className="fi-p dim">{caseId ? "THIS TRIP HAS NO PERMIT: IT CANNOT BE DONATED." : "DONATING NEEDS A CASE FILE."}</span>}
          </ButtonRow>
          {gift?.error && <p className="fi-p harm" role="alert">{gift.error}</p>}
        </div>
      )}
      {gift?.ok && <p className="fi-p good fi-gift" role="status">{gift.line} <a href="#aquarium">SEE THE TANK</a></p>}
      <div className="fi-status">{pad ? `CONTROLLER: ${pad.toUpperCase()}` : mode === "touch" ? "◀ ▶ LURE // REEL (HOLD) // JERK // II PAUSES" : "KEYS: ← → LURE // Z REELS AND CASTS // X JERKS // ENTER PAUSES"}{muted ? " // MUTED" : ""}{demo ? " // THE WARDEN IS FISHING" : tripId ? " // PERMITTED TRIP" : ""}</div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{say}</p>
      <div className="fi-touch" aria-label="Touch controls">
        <button type="button" className="fi-tb" aria-label="Previous lure" {...hold(BTN.L)}>&#9664;</button>
        <button type="button" className="fi-tb" aria-label="Next lure" {...hold(BTN.R)}>&#9654;</button>
        <button type="button" className="fi-tb" aria-label="Jerk the rod: twitch, or set the hook" {...hold(BTN.B)}>JERK</button>
        <button type="button" className="fi-tb" aria-label={paused ? "Resume" : "Pause"} onClick={togglePause}>{paused ? "GO" : "II"}</button>
        <button type="button" className="fi-tb reel" aria-label="Cast, and hold to reel" {...hold(BTN.A)}>REEL</button>
      </div>
      <details className="pg-more">
        <summary>CONTROLS: {legendMode === "pad" ? `CONTROLLER (${(pad || "").toUpperCase()})` : MODE_NAME[legendMode]}</summary>
        <div className="pg-more-body"><Controls mode={legendMode} family={pad} /></div>
      </details>
    </div>
  );
}
