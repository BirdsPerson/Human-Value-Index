import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readPad, GLYPHS } from "../../city/gamepad.js";
import { TRIPS, TRIP, SPECIES_BY, SEASONS, RULES, conditionsAt, seasonOpen, openSeasonsLine } from "./data.js";
import { newHunt, step, logPush, botInput, aimPoints, quantize, resultOf, replay, BTN, OFF, HZ, W, H } from "./sim.js";
import { draw } from "./render.js";
import { loadScores, saveScore, loadTag, saveTag } from "./scores.js";
import { getPermit, fileHunt, loadBoard } from "./api.js";
import * as sfx from "./audio.js";
import GameMenu from "../GameMenu.jsx";
import HuntGuide, { GUIDE_KEY, TIPS_KEY, tipText } from "./Guide.jsx";
import { guideSeen, markGuideSeen, tipsUsed, markTipUsed, Tip } from "../guideKit.jsx";
import "./hunt.css";
import "../pages.css";

// #hunt[?trip=whitetail|elk|moose|caribou|department][&cab=1]: TAGGED OUT, the bar cabinet (docs/CITY_SPEC.md
// "THE HUNT"). A video game: in the city itself no animal is harmed (the foothills outfitter captures).
// The light-gun cabinet every bar has: point and shoot the males, never the females, shoot off the
// screen to reload. cab=1: the cabinet in a bar (the city's CRT overlay): straight to the trips.

const parseRoute = (route) => { const q = new URLSearchParams(String(route || "").split("?")[1] || ""); const t = q.get("trip"); return { trip: TRIP[t] ? t : null, cab: q.get("cab") === "1" }; };
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const nowLine = (c) => `DAY ${c.day} // ${SEASONS[c.season]}`;
const defaultTrip = (at) => (TRIPS.find(t => !t.decoys && seasonOpen(t.id, at)) || TRIPS[0]).id;
// Back to the bar: a cabinet in the city's overlay closes itself (FunnelOverlay listens).
export const leaveCabinet = () => { try { window.parent?.postMessage({ hvi: "cabinet-close" }, window.location.origin); } catch { /* not framed */ } };

export default function Hunt({ route }) {
  const { trip: trip0, cab } = useMemo(() => parseRoute(route), [route]);
  const [at, setAt] = useState(() => Date.now());
  const [trip, setTrip] = useState(trip0 || defaultTrip(Date.now()));
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(sfx.isMuted());
  const [scores, setScores] = useState(loadScores);
  const [board, setBoard] = useState(null);
  const [tag, setTag] = useState(loadTag);
  const playRef = useRef(null);
  useEffect(() => { if (trip0) setTrip(trip0); }, [trip0]);
  useEffect(() => { const t = setInterval(() => setAt(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!game) playRef.current?.focus({ preventScroll: true }); }, [game]);
  useEffect(() => { if (game && !game.demo) return; let off = false; loadBoard().then(j => { if (!off) setBoard(j); }).catch(() => { if (!off) setBoard(null); }); return () => { off = true; }; }, [game]);

  // A signed permit from the board when it answers (the seed and the start are the server's, so the
  // trip can be filed on the verified board); otherwise a trip of your own, kept in this browser.
  const begin = async (demo = false, which = trip, log = null, cfg0 = null) => {
    sfx.unlock();
    if (cfg0) { setGame({ key: Date.now(), cfg: cfg0, demo: false, replayLog: log, permit: null }); return; }
    let cfg = { seed: (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0, trip: which, at: Date.now(), player: { name: tag || "YOU" } }, permit = null, line = "";
    if (!demo) {
      setBusy(true);
      try { const p = await getPermit(which); cfg = { ...cfg, seed: p.seed, at: p.at }; permit = p.permit; line = "PERMIT ISSUED. THIS TRIP CAN GO ON THE CABINET'S BOARD."; }
      catch (e) { line = `NO PERMIT (${e.message}). HUNT ANYWAY: THIS TRIP STAYS IN THIS BROWSER.`; }
      setBusy(false);
    }
    setNote(demo ? "THE DEPARTMENT'S MARKSMAN, FOR DEMONSTRATION." : line);
    setGame({ key: cfg.seed ^ cfg.at, cfg, demo, permit });
  };
  const toggleMute = () => { sfx.setMuted(!muted); setMuted(!muted); };
  const t = TRIP[trip], cnow = conditionsAt(at), open = seasonOpen(trip, at);

  return (
    <div className={`hu${cab ? " hu-cab" : ""}`}>
      {!cab && <ScreenHead title="TAGGED OUT" meta="A BAR CABINET. A VIDEO GAME: NO ANIMAL IN THE CITY IS HARMED." />}
      {game ? (
        <>
          {note && !cab && <p className="hu-p dim">{note}</p>}
          <Play key={game.key} game={game} muted={muted} cab={cab} tag={tag} onMute={toggleMute}
            onScores={() => setScores(loadScores())}
            onAgain={() => begin(game.demo, game.cfg.trip)} onMenu={() => setGame(null)}
            onReplay={(cfg, log) => begin(false, cfg.trip, log, cfg)} />
          {!cab && (
            <ButtonRow split stackOnMobile>
              <Button variant="back" onClick={() => setGame(null)}>Leave the hunt</Button>
              <Button variant="secondary" onClick={toggleMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</Button>
            </ButtonRow>
          )}
        </>
      ) : (
        <>
          {!cab && <p className="pg-lede">THE LIGHT-GUN CABINET IN THE CITY'S BARS. POINT AND SHOOT THE BUCKS AND THE BULLS; NEVER THE DOES OR THE COWS (THREE STRIKES AND THE LICENCE IS REVOKED). SHOOT OFF THE SCREEN, OR RIGHT-CLICK, TO RELOAD. ONE MALE A STAGE OR THE SEASON CLOSES ON YOU.</p>}
          {cab && <p className="hu-cabhead">TAGGED OUT // PICK A TRIP. POINT, CLICK TO SHOOT, RIGHT-CLICK OR SHOOT OFF SCREEN TO RELOAD.</p>}
          <div className="pg-start">
            <Button variant="primary" ref={playRef} disabled={busy} onClick={() => begin(false)}>{busy ? "ISSUING TAGS..." : `PLAY NOW: ${t.name}`}</Button>
            <span className="pg-sub">{nowLine(cnow)} // {open ? "SEASON OPEN" : "OUT OF SEASON: EXHIBITION, THE DEPARTMENT LOOKS AWAY"}</span>
          </div>
          <div className="hu-trips" role="group" aria-label="The trips">
            {TRIPS.map(x => {
              const o = seasonOpen(x.id, at), best = scores[x.id]?.[0]?.score;
              return (
                <button key={x.id} type="button" className="hu-trip" aria-pressed={trip === x.id} onClick={() => setTrip(x.id)}>
                  <b>{x.rank}. {x.name}</b>
                  <span>{x.note}</span>
                  <span className={o ? "ok" : "off"}>{x.decoys ? "ALWAYS IN SEASON" : o ? `OPEN // ${openSeasonsLine(x.sp)}` : `CLOSED // OPENS ${openSeasonsLine(x.sp)}`}</span>
                  <span className="dim">{best != null ? `YOUR BEST ${best.toLocaleString("en-US")}` : "NO SCORE YET"}</span>
                </button>
              );
            })}
          </div>
          <div className="hu-tag">
            <label htmlFor="hu-tag">YOUR INITIALS ON THE MARQUEE</label>
            <input id="hu-tag" value={tag} maxLength={3} autoComplete="off" spellCheck={false} inputMode="text"
              onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); setTag(v); saveTag(v); }} />
            <ButtonRow>
              <Button variant="secondary" onClick={() => begin(true)}>WATCH THE DEPARTMENT'S MARKSMAN</Button>
              {cab && <Button variant="back" onClick={leaveCabinet}>BACK TO THE BAR</Button>}
            </ButtonRow>
          </div>
          <details className="pg-more" open={cab}>
            <summary>TODAY'S BOARD ({board ? `DAY ${board.day}` : "THE CABINET"})</summary>
            <div className="pg-more-body"><Board board={board} scores={scores} /></div>
          </details>
          {!cab && (
            <details className="pg-more">
              <summary>THE SEASONS</summary>
              <div className="pg-more-body">
                <p className="hu-p">THE DEPARTMENT ISSUES TAGS BY THE CITY'S OWN CALENDAR (FOUR SEASONS OF 28 MACHINE DAYS; IT IS {SEASONS[cnow.season]} ON DAY {cnow.day}). OUT OF SEASON THE CABINET STILL PLAYS: AN EXHIBITION, AND THE DEPARTMENT LOOKS AWAY.</p>
                <ul className="hu-list">{TRIPS.filter(x => !x.decoys).map(x => <li key={x.id}>{SPECIES_BY[x.sp].name}: {openSeasonsLine(x.sp)}</li>)}<li>THE DEPARTMENT SHOOT: ALWAYS. THE DEPARTMENT IS ALWAYS IN SEASON.</li></ul>
              </div>
            </details>
          )}
        </>
      )}
      {!cab && (
        <details className="pg-more">
          <summary>HOW TO PLAY</summary>
          <div className="pg-more-body"><Controls /></div>
        </details>
      )}
    </div>
  );
}

function Board({ board, scores }) {
  return (
    <>
      <p className="hu-p dim">THE CABINET'S BOARD IS TODAY'S (THE MACHINE DAY'S) VERIFIED TRIPS: EVERY ONE RE-PLAYED ON THE SERVER FROM ITS LOG BEFORE IT WENT UP.{board ? "" : " THE BOARD DID NOT ANSWER; ONLY THIS BROWSER'S BESTS ARE SHOWN."}</p>
      {board?.top?.length ? (
        <table className="hu-board">
          <thead><tr><th scope="col">#</th><th scope="col">TAG</th><th scope="col">TRIP</th><th scope="col">SCORE</th><th scope="col">TROPHY</th></tr></thead>
          <tbody>{board.top.map((r, i) => <tr key={i}><td>{i + 1}</td><th scope="row">{r.tag}</th><td>{TRIP[r.trip]?.name || r.trip}</td><td>{r.score.toLocaleString("en-US")}</td><td>{r.pts ? `${r.pts} PTS, ${(r.inches / 10).toFixed(1)} IN` : "-"}</td></tr>)}</tbody>
        </table>
      ) : board ? <p className="hu-p">NOTHING FILED TODAY. THE BOARD IS YOURS TO TAKE.</p> : null}
      <ul className="hu-list">{TRIPS.map(t => <li key={t.id}>{t.name}: {scores[t.id]?.length ? scores[t.id].map(s => s.score.toLocaleString("en-US")).join(" // ") : "-"}</li>)}</ul>
    </>
  );
}

export function legendRows(mode, family) {
  const g = GLYPHS[family] || GLYPHS.generic;
  if (mode === "pad") return [["AIM", "LEFT STICK", "THE RETICLE SPEEDS UP THE LONGER YOU PUSH, AND SLOWS OVER A TARGET (A LITTLE)."], ["SHOOT", `RT / ${g.act}`, ""], ["RELOAD", `X / ${g.back}`, "FIVE SHELLS."], ["PAUSE", g.start, ""]];
  if (mode === "touch") return [["SHOOT", "TAP", "WHERE YOU TAP."], ["RELOAD", "RELOAD BUTTON", "OR TAP THE DARK BORDER OFF THE SCREEN."], ["PAUSE", "II", ""]];
  return [["AIM", "MOUSE", "OR THE ARROW KEYS."], ["SHOOT", "CLICK / SPACE", ""], ["RELOAD", "RIGHT-CLICK / R", "OR CLICK OFF THE SCREEN, LIKE A LIGHT GUN AT THE FLOOR. FIVE SHELLS."], ["PAUSE", "ENTER / ESC", ""]];
}
function Controls({ mode = "keys", family = null }) {
  return (
    <>
      <dl className="hu-keys">{legendRows(mode, family).flatMap(([k, v, why]) => [<dt key={k}>{k}</dt>, <dd key={k + "d"}><b>{v}</b>{why ? ` ${why}` : ""}</dd>])}</dl>
      <p className="hu-p dim">SCORING: A MALE IS ITS ANTLER POINTS AND ITS SIZE; BEHIND THE SHOULDER DOUBLES IT, THE HEAD IS HALF AGAIN, A QUICK SHOT ADDS UP TO {RULES.QUICK / 2}. A FEMALE IS {RULES.FEMALE} AND A STRIKE. CRITTERS +{RULES.CRITTER}. DUCKS +{RULES.BIRD}, THE GOLDEN ONE +{RULES.GOLD}. +{RULES.TAG_BONUS} A TAG AT EACH STAGE'S TALLY, AND UP TO {RULES.ACCURACY} FOR ACCURACY AT THE END. TREES, BRUSH, ROCKS AND REEDS STOP A SHOT.</p>
    </>
  );
}

// ---- the game: canvas, the fixed-step loop, input --------------------------------------------------------
const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };

function Play({ game, muted, cab, tag, onMute, onScores, onAgain, onMenu, onReplay }) {
  const { cfg, demo, permit, replayLog } = game;
  const canvas = useRef(null), wrap = useRef(null);
  const aim = useRef([OFF, OFF]), fireLatch = useRef(0), reloadLatch = useRef(0), held = useRef(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [scale, setScale] = useState({ css: W, k: 1 });
  const [mode, setMode] = useState(() => { try { return window.matchMedia("(pointer: coarse)").matches ? "touch" : "keys"; } catch { return "keys"; } });
  const [pad, setPad] = useState(null);
  const [say, setSay] = useState("");
  const [guide, setGuide] = useState(() => !demo && !replayLog && !guideSeen(GUIDE_KEY));   // the controls guide, once, before the first trip
  const guideRef = useRef(guide); guideRef.current = guide;
  const dismissGuide = () => { markGuideSeen(GUIDE_KEY); guideRef.current = false; setGuide(false); };
  const [tip, setTip] = useState({ id: null, gone: true });
  const tipUsed = useRef(null), tipShown = useRef(null);
  const [ended, setEnded] = useState(null);
  const [filed, setFiled] = useState(null);   // {busy} | {ok, line} | {error}
  const logRef = useRef([]), stRef = useRef(null), endedRef = useRef(false);
  const reduced = useMemo(REDUCED, []);
  const togglePause = () => { if (endedRef.current || guideRef.current) return; pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); };
  const resume = () => { pausedRef.current = false; setPaused(false); };
  const watching = demo || Boolean(replayLog);

  useEffect(() => {
    const fit = () => {
      const w = wrap.current?.clientWidth || W, dpr = window.devicePixelRatio || 1;
      const k = Math.max(1, Math.min(6, Math.floor((Math.min(w, 960) * dpr) / W)));
      setScale({ css: (W * k) / dpr, k });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const st = stRef.current = newHunt(cfg), log = logRef.current = [];
    if (import.meta.env?.DEV) { window.__huntSt = st; window.__huntSim = { botInput, step }; }   // the screenshot script fast-forwards it
    const keys = new Set();
    let raf = 0, last = performance.now(), acc = 0, frame = 0, prevStart = false, said = "", kick = 0, rp = 0, rk = 0;
    const ctx = canvas.current.getContext("2d");
    const pv = { x: W / 2, y: H / 2, hold: 0 };   // the pad's reticle and how long the stick has been pushed
    const kd = (e) => {
      if (typing(e)) return;
      if (e.key === "Enter" || e.key === "Escape") { if (!e.repeat) togglePause(); e.preventDefault(); return; }
      if (e.key === " " || e.key === "z" || e.key === "Z") { if (!e.repeat) fireLatch.current = 1; e.preventDefault(); sfx.unlock(); if (aim.current[0] < 0) aim.current = [W / 2, H / 2]; return; }
      if (e.key === "r" || e.key === "R" || e.key === "x" || e.key === "X") { reloadLatch.current = 1; e.preventDefault(); return; }
      if (e.key.startsWith("Arrow")) { keys.add(e.key); e.preventDefault(); setMode("keys"); if (aim.current[0] < 0) aim.current = [W / 2, H / 2]; }
    };
    const ku = (e) => keys.delete(e.key);
    const blur = () => keys.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    let padFamily = null;
    const input = () => {
      // the arrow keys nudge the reticle
      let [x, y] = aim.current;
      if (keys.size && x >= 0) { const v = 2.2; if (keys.has("ArrowLeft")) x -= v; if (keys.has("ArrowRight")) x += v; if (keys.has("ArrowUp")) y -= v; if (keys.has("ArrowDown")) y += v; x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); aim.current = [x, y]; }
      let b = 0;
      const p = readPad();
      if (p.connected) {
        if (padFamily !== p.family) { padFamily = p.family; setPad(p.family); }
        const raw = (() => { try { return navigator.getGamepads()[p.index]; } catch { return null; } })();
        const btn = (i) => Boolean(raw?.buttons?.[i] && (raw.buttons[i].pressed || raw.buttons[i].value > 0.5));
        const mag = p.mag || 0;
        if (mag > 0.05 || btn(7) || p.held.act) {
          if (mode !== "pad") setMode("pad");
          if (aim.current[0] < 0 || padFamily !== null && pv.fresh !== true) { pv.x = aim.current[0] >= 0 ? aim.current[0] : W / 2; pv.y = aim.current[1] >= 0 ? aim.current[1] : H / 2; pv.fresh = true; }
        }
        if (pv.fresh) {
          // aim acceleration: a curve on the stick, and a ramp after a moment pushed hard
          pv.hold = mag > 0.8 ? pv.hold + 1 : 0;
          let v = 2.4 * mag * mag * (1 + Math.min(1.2, pv.hold / 30));
          // mild aim assist: over a target the reticle slows and leans toward its aim point
          const sim = stRef.current;
          let near = null, nd = 18;
          if (sim && sim.phase === "play") for (const q of aimPoints(sim)) { const d = Math.hypot(q.x - pv.x, q.y - pv.y); if (d < nd) { nd = d; near = q; } }
          if (near) { v *= 0.6; pv.x += (near.x - pv.x) * 0.06; pv.y += (near.y - pv.y) * 0.06; }
          pv.x = Math.max(0, Math.min(W - 1, pv.x + (p.x || 0) * v)); pv.y = Math.max(0, Math.min(H - 1, pv.y + (p.y || 0) * v));
          aim.current = [pv.x, pv.y];
        }
        if (btn(7) || p.held.act) b |= BTN.FIRE;
        if (btn(2) || p.held.back) b |= BTN.RELOAD;
        if (p.held.start && !prevStart) togglePause();
        prevStart = p.held.start;
      } else if (padFamily) { padFamily = null; setPad(null); pv.fresh = false; }
      if (fireLatch.current || held.current) b |= BTN.FIRE;
      if (reloadLatch.current) b |= BTN.RELOAD;
      // a click is a whole tick of trigger: the latch clears only after the sim has heard the release
      if (fireLatch.current === 2) fireLatch.current = 0; else if (fireLatch.current === 1) fireLatch.current = 2;
      reloadLatch.current = 0;
      return [...quantize(aim.current[0], aim.current[1]), b];
    };
    const loop = (now) => {
      acc = Math.min(acc + (now - last) / 1000, 5 / HZ);
      last = now;
      while (acc >= 1 / HZ) {
        acc -= 1 / HZ;
        if (pausedRef.current || guideRef.current || endedRef.current || st.phase === "done") { input(); continue; }
        let x, y, b;
        if (replayLog) {
          if (rp >= replayLog.length) { [x, y, b] = [OFF, OFF, 0]; }
          else { x = replayLog[rp]; y = replayLog[rp + 1]; b = replayLog[rp + 2]; if (++rk >= replayLog[rp + 3]) { rk = 0; rp += 4; } }
          input();
        } else if (demo) { input(); [x, y, b] = botInput(st, 0.8); }
        else [x, y, b] = input();
        logPush(log, x, y, b);
        step(st, x, y, b);
        if (watching && x >= 0) aim.current = [x, y];
        for (const e of st.ev) { sfx.play(e); if (e === "shot") kick = 4; }
        st.ev.length = 0;
      }
      // first-run prompts: a line while the thing is in front of you, gone once you have done it
      if (!watching) {
        const live = st.phase === "play" && !pausedRef.current && !guideRef.current;
        const want = !live ? null : st.shots === 0 ? "aim" : st.targets.some(a => a.kind === "female" && a.state !== "down" && a.state !== "gone" && a.x - st.cam > 0 && a.x - st.cam < W) ? "female" : st.ammo <= 1 && st.reload === 0 ? "reload" : null;
        if (tipUsed.current === null) tipUsed.current = tipsUsed(TIPS_KEY);
        const t = tipShown.current;
        if (t && t !== want) { tipUsed.current = markTipUsed(TIPS_KEY, t); tipShown.current = null; setTip(x => ({ ...x, gone: true })); }
        if (!tipShown.current && want && !tipUsed.current.has(want)) { tipShown.current = want; setTip({ id: want, gone: false }); }
      }
      if (st.msg !== said) { said = st.msg; if (said) setSay(said); }
      if (st.phase === "done" && !endedRef.current) {
        endedRef.current = true;
        const r = resultOf(st);
        let best = false;
        if (!watching) { best = saveScore(cfg.trip, r); onScores?.(); }
        setEnded({ r, best });
        setSay(`TRIP OVER. ${r.score} POINTS.`);
      }
      draw(ctx, st, frame++, { aim: st.phase === "done" ? null : aim.current, kick, paused: pausedRef.current, reduced });
      if (kick > 0) kick -= 0.5;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setSay(`${TRIP[cfg.trip].name}. ${watching ? "WATCHING." : "POINT AND SHOOT. SHOOT OFF THE SCREEN TO RELOAD."}`);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  // the pointer: the reticle follows it; a press shoots where it is (a finger: aim and shoot at once)
  const toGame = (e) => { const r = canvas.current.getBoundingClientRect(); return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height]; };
  const onMove = (e) => { if (e.pointerType === "mouse") setMode(m => (m === "pad" ? m : "keys")); aim.current = toGame(e); };
  const onDown = (e) => {
    e.preventDefault(); sfx.unlock();
    if (e.pointerType === "touch") setMode("touch");
    aim.current = toGame(e);
    if (e.button === 2) { reloadLatch.current = 1; return; }
    fireLatch.current = 1;
  };
  const onLeave = (e) => { if (e.pointerType === "mouse") aim.current = [OFF, OFF]; };
  // a press on the dark border round the screen: the light gun pointed off it, a reload
  const onBorder = (e) => { if (e.target === e.currentTarget) { e.preventDefault(); reloadLatch.current = 1; sfx.unlock(); } };
  const file = async () => {
    if (!ended || !permit || filed?.busy || filed?.ok) return;
    if (!tag) { setFiled({ error: "INITIALS FIRST: SET THEM ON THE CABINET'S PAGE (THE MARQUEE HAS ROOM FOR THREE)." }); return; }
    setFiled({ busy: true });
    try {
      const j = await fileHunt(permit, logRef.current.slice(), ended.r.score, tag);
      setFiled({ ok: true, line: j.filed.rank ? `FILED. RE-PLAYED AND VERIFIED: ${tag} IS NUMBER ${j.filed.rank} ON TODAY'S BOARD.` : `FILED AND VERIFIED. TODAY'S BOARD IS BEYOND YOU: ${j.board.top[j.board.top.length - 1]?.score.toLocaleString("en-US")} TO GET ON IT.` });
    } catch (e) { setFiled({ error: e.message }); }
  };
  const legendMode = pad ? "pad" : mode;
  const r = ended?.r;
  const summary = r ? `${r.score.toLocaleString("en-US")} POINTS. ${r.trophy ? `TROPHY: ${r.trophy.pts} POINT ${r.trophy.decoy ? "CARDBOARD" : SPECIES_BY[r.trophy.sp].name}, ${(r.trophy.inches / 10).toFixed(1)} IN.` : "NO TROPHY."}${ended.best ? " YOUR BEST ON THIS TRIP." : ""}` : "";

  return (
    <div className="hu-play" ref={wrap}>
      {guide && <div className="hu-guidewrap"><HuntGuide mode={pad ? "pad" : mode} family={pad} onDone={dismissGuide} /></div>}
      <div className="hu-stage" onPointerDown={onBorder} onContextMenu={(e) => e.preventDefault()}>
        <canvas ref={canvas} width={W} height={H} className={legendMode === "keys" ? "nocursor" : ""}
          style={{ width: scale.css, height: (scale.css * H) / W }}
          onPointerMove={onMove} onPointerDown={onDown} onPointerLeave={onLeave} onContextMenu={(e) => e.preventDefault()}
          aria-label="The hunt: a scene in the foothills, the forest or on the river, animals crossing it, the reticle where you point. The score along the top; three tags and five shells along the bottom." role="img" />
      </div>
      {filed?.error && <p className="hu-p harm" role="alert">{filed.error}</p>}
      {filed?.ok && <p className="hu-p good" role="status">{filed.line}</p>}
      {ended?.look ? (
        <ButtonRow><Button variant="primary" onClick={() => setEnded(e => ({ ...e, look: false }))}>THE MENU</Button></ButtonRow>
      ) : ended ? (
        <GameMenu key="end" kind="end" title={watching ? "THE DEMONSTRATION IS FILED." : r.end === "revoked" ? "LICENCE REVOKED." : r.end === "quota" ? "THE SEASON CLOSED ON YOU." : "TRIP FILED."}
          summary={summary}
          onBack={() => setEnded(e => ({ ...e, look: true }))}
          options={{
            again: { label: watching ? "WATCH AGAIN" : "HUNT AGAIN", onSelect: onAgain },
            rematch: { label: "ANOTHER TRIP", onSelect: onMenu },
            board: !watching && permit ? { label: filed?.ok ? "FILED ON THE BOARD" : filed?.busy ? "THE BOARD IS RE-PLAYING YOUR TRIP..." : `FILE IT ON THE BOARD${tag ? ` AS ${tag}` : ""}`, onSelect: file, disabled: Boolean(filed?.ok || filed?.busy), hint: "VERIFIED BY REPLAY" } : null,
            replay: !watching && { label: "WATCH THE REPLAY", onSelect: () => onReplay(cfg, logRef.current.slice()) },
            play: cab ? null : true,
            city: cab ? { label: "BACK TO THE BAR", onSelect: leaveCabinet } : true,
          }} />
      ) : paused && (
        <GameMenu key="pause" kind="pause" title="PAUSED." summary={`${TRIP[cfg.trip].name} // ${stRef.current?.score || 0} POINTS SO FAR.`} onBack={resume}
          options={{
            resume, restart: { label: "NEW TRIP, SAME SPECIES", onSelect: onAgain },
            controls: <HuntGuide mode={legendMode} family={pad} compact />,
            sound: { on: !muted, onSelect: onMute },
            quit: cab ? { label: "BACK TO THE BAR", onSelect: leaveCabinet } : true,
          }} />
      )}
      {!guide && <Tip text={tipText(tip.id, legendMode, pad)} gone={tip.gone} />}
      <div className="hu-status">{pad ? `CONTROLLER: ${pad.toUpperCase()} // STICK AIMS, RT SHOOTS, X RELOADS` : mode === "touch" ? "TAP TO SHOOT // RELOAD BUTTON, OR TAP THE BORDER // II PAUSES" : "MOUSE AIMS // CLICK SHOOTS // RIGHT-CLICK OR CLICK OFF SCREEN RELOADS // ENTER PAUSES"}{muted ? " // MUTED" : ""}{demo ? " // THE MARKSMAN IS SHOOTING" : replayLog ? " // REPLAY" : permit ? " // PERMITTED TRIP" : ""}</div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{say}</p>
      <div className="hu-touch" aria-label="Touch controls">
        <button type="button" className="hu-tb" onPointerDown={(e) => { e.preventDefault(); reloadLatch.current = 1; }}>RELOAD</button>
        <button type="button" className="hu-tb" aria-label={paused ? "Resume" : "Pause"} onClick={togglePause}>{paused ? "GO" : "II"}</button>
        {cab && <button type="button" className="hu-tb" onClick={leaveCabinet}>BAR</button>}
      </div>
      {cab && !ended && <ButtonRow><Button variant="back" onClick={leaveCabinet}>BACK TO THE BAR</Button><Button variant="secondary" onClick={onMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</Button></ButtonRow>}
      {!cab && (
        <details className="pg-more">
          <summary>CONTROLS: {legendMode === "pad" ? `CONTROLLER (${(pad || "").toUpperCase()})` : legendMode === "touch" ? "TOUCH" : "MOUSE AND KEYS"}</summary>
          <div className="pg-more-body"><Controls mode={legendMode} family={pad} /></div>
        </details>
      )}
    </div>
  );
}
void replay;
