import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonRow, ScreenHead } from "../../ui/index.js";
import { readCaseId } from "../../caseFile.jsx";
import { loadSprite } from "../../sprites.js";
import { headFrom } from "../heads.js";
import GameMenu from "../GameMenu.jsx";
import { highScore } from "../../city/funnels.js";
import { TEAM_IDS, teamShort, teamName, kitsFor, FALLBACK, loadLeague, sortEleven, teamRating, teamOfCase, citizenKeyOf, playNowPair, shownName, machineDay, CROPS } from "../football/roster.js";
import { newGame, step, rleEncode, replay, resultOf, lineup, VERSION, HZ, QLENS, BTN, O, D, PLAYS, bookOf, abilities } from "./sim.js";
import { draw, drawAttract, camInit, camFollow, W, H, lastName } from "./render.js";
import { createInput, padAt } from "./input.js";
import * as SFX from "./audio.js";
import ControlsGuide, { guideSeen, markGuideSeen, namesFor, tipFor, tipsSeen, markTip } from "./Guide.jsx";
import "./tecmo.css";
import "../pages.css";

// #tecmo[?home=<district>][&vs=<district>][&q=1|2|3][&p=2][&cab=1]: FOURTH AND LONG, the arcade
// football cabinet (docs/CITY_SPEC.md "House games"). Big men, four plays a team, the defence guessing
// the call, mash A to break a tackle. Exhibitions only: nothing reaches the league; the game is kept in
// this browser (its seed, the teams and the input log) and re-run at the whistle to show it reproduces.
// The living appear and play and never speak.

const parseRoute = (route) => {
  const q = new URLSearchParams(String(route || "").split("?")[1] || "");
  const id = (k) => (TEAM_IDS.includes(q.get(k)) ? q.get(k) : null);
  const ql = Number(q.get("q"));
  return { home: id("home"), vs: id("vs"), qlen: QLENS.includes(ql) ? ql : 2, two: q.get("p") === "2", cab: q.get("cab") === "1" };
};
const REDUCED = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
const SCORES = "hvi-tecmo-scores", LAST = "hvi-tecmo-last", QKEY = "hvi-tecmo-qlen", LKEY = "hvi-tecmo-level";
export function loadScores() { try { const j = JSON.parse(localStorage.getItem(SCORES) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } }
// the board: wins over the CPU, the widest margin first
export function addScore(list, rec) {
  if (!(rec.margin > 0)) return list;
  return [...list, rec].sort((a, b) => b.margin - a.margin || b.pts - a.pts || a.at - b.at).slice(0, 5);
}
function saveScore(rec) { const next = addScore(loadScores(), rec); try { localStorage.setItem(SCORES, JSON.stringify(next)); } catch { /* the tab keeps it */ } return next; }
function seedNow() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch { return (Date.now() >>> 0) || 1; } }
const leaveCabinet = () => { try { window.parent?.postMessage({ hvi: "cabinet-close" }, window.location.origin); } catch { /* not framed */ } };

// A team's card: overall, run, pass, defence, and its stars (75 and over).
export function teamCard(rows) {
  const xi = sortEleven(rows), L = lineup(xi), r = (i) => xi[i]?.[2] || 40;
  const os = (s) => r(L.os[s]), ds = (s) => r(L.ds[s]);
  const run = Math.round(0.55 * os(O.RB) + 0.15 * os(O.FB) + 0.3 * ((os(O.LT) + os(O.LG) + os(O.C) + os(O.RG) + os(O.RT)) / 5));
  const pass = Math.round(0.45 * os(O.QB) + 0.35 * ((os(O.WR1) + os(O.WR2)) / 2) + 0.2 * os(O.TE));
  const def = Math.round([D.RILB, D.LCB, D.FS, D.RE, D.RCB, D.SS, D.LE].reduce((n, s) => n + ds(s), 0) / 7);
  const stars = xi.filter(x => x[2] >= 75).map(x => ({ name: shownName(x[1]), r: x[2], spd: abilities(x[2], x[0]).spd }));
  return { all: teamRating(xi), run, pass, def, stars };
}
function useLeague() {
  const [league, setLeague] = useState(FALLBACK);
  useEffect(() => { let off = false; loadLeague().then(lg => { if (lg && !off) setLeague(lg); }).catch(() => {}); return () => { off = true; }; }, []);
  return league;
}
function elevenOf(league, id, caseId) {
  const mine = caseId ? citizenKeyOf(caseId) : null;
  return sortEleven(league.teams[id]).map(([k, n, r]) => [k, k === mine ? `SUBJECT ${caseId.slice(-4).toUpperCase()}` : shownName(n), r]);
}
// the cabinet's marquee today (the house games' high score, held by a figure on file) and yours
const marquee = () => { try { return highScore("house-football", null, machineDay()); } catch { return null; } };

export default function Tecmo({ route }) {
  const opts = useMemo(() => parseRoute(route), [route]);
  const league = useLeague();
  const caseId = useMemo(() => { try { return readCaseId(); } catch { return null; } }, []);
  const mine = teamOfCase(league, caseId);
  const [screen, setScreen] = useState("title");
  const [two, setTwo] = useState(opts.two);
  const [qlen, setQlen] = useState(() => { try { const v = Number(localStorage.getItem(QKEY)); return QLENS.includes(v) ? v : opts.qlen; } catch { return opts.qlen; } });
  const [game, setGame] = useState(null);
  const [scores, setScores] = useState(loadScores);
  const [muted, setMuted] = useState(SFX.isMuted());
  const [level, setLevel] = useState(() => { try { return localStorage.getItem(LKEY) === "pro" ? "pro" : "rookie"; } catch { return "rookie"; } });
  const [guide, setGuide] = useState(null);   // a start held back for the controls guide, the first time
  const pickLevel = (v) => { setLevel(v); try { localStorage.setItem(LKEY, v); } catch { /* fine */ } };
  const pickQ = (q) => { setQlen(q); try { localStorage.setItem(QKEY, String(q)); } catch { /* fine */ } };
  const start = (home, away, twoP = two, tape = null) => {
    SFX.unlock();
    if (!tape && !guideSeen()) { setGuide([home, away, twoP]); return; }
    const kits = kitsFor(home, away);
    const cfg = { qlen, level, sides: ["human", twoP ? "human" : "cpu"], teams: [home, away].map(id => ({ id, short: teamShort(id), rows: elevenOf(league, id, caseId) })) };
    setGame({ n: Date.now(), cfg: tape ? tape.cfg : cfg, seed: tape ? tape.seed : seedNow(), kits, ids: [home, away], two: twoP, tape });
    setScreen("game");
  };
  const quick = () => {
    const [h0, a0] = playNowPair(league, mine);
    const h = opts.home || h0, a = opts.vs && opts.vs !== h ? opts.vs : h === h0 ? a0 : playNowPair(league, h)[1];
    start(h, a, false);
  };
  const toggleMute = () => { SFX.setMuted(!muted); setMuted(!muted); };
  useEffect(() => () => SFX.close(), []);

  let body;
  if (guide) body = <ControlsGuide family={padAt(0).connected ? padAt(0).family : null} two={guide[2]} onDone={() => { markGuideSeen(); const g = guide; setGuide(null); start(g[0], g[1], g[2]); }} />;
  else if (screen === "game" && game) {
    body = <Match key={game.n} game={game} muted={muted} onMute={toggleMute} cab={opts.cab}
      onEnd={(rec, res) => {
        if (!game.tape && !game.two && rec) {
          const m = res.score[0] - res.score[1];
          setScores(saveScore({ at: Date.now(), margin: m, pts: res.score[0], line: `${res.score[0]}-${res.score[1]}`, team: game.ids[0], vs: game.ids[1] }));
        }
        if (rec) try { localStorage.setItem(LAST, JSON.stringify(rec)); } catch { /* too big or private: the tape stays in the tab */ }
      }}
      onAgain={() => start(game.ids[0], game.ids[1], game.two)}
      onTape={(rec) => setGame({ ...game, n: Date.now(), cfg: rec.cfg, seed: rec.seed, tape: rec })}
      onTeams={() => setScreen("teams")} onTitle={() => { setGame(null); setScreen("title"); }} />;
  } else if (screen === "teams") {
    body = <Teams league={league} mine={mine} two={two} onStart={(h, a) => start(h, a, two)} onBack={() => setScreen("title")} />;
  } else {
    body = <Title quickPair={opts} league={league} mine={mine} cab={opts.cab} qlen={qlen} pickQ={pickQ} level={level} pickLevel={pickLevel} scores={scores} muted={muted} onMute={toggleMute}
      onQuick={quick} onOne={() => { setTwo(false); setScreen("teams"); }} onTwo={() => { setTwo(true); setScreen("teams"); }} />;
  }
  return (
    <div className={`tb${opts.cab ? " tb-cab" : ""}`}>
      {!opts.cab && <ScreenHead title="FOURTH AND LONG" meta="ARCADE FOOTBALL // ELEVEN A SIDE, FOUR PLAYS A TEAM. EXHIBITION GAMES." />}
      {body}
    </div>
  );
}

// ---- the title: the attract mode behind the menu ------------------------------------------------------------
function Title({ quickPair, league, mine, cab, qlen, pickQ, level, pickLevel, scores, muted, onMute, onQuick, onOne, onTwo }) {
  const canvas = useRef(null), first = useRef(null);
  const [h0, a0] = playNowPair(league, mine);
  const h = quickPair.home || h0, a = quickPair.vs && quickPair.vs !== h ? quickPair.vs : h === h0 ? a0 : playNowPair(league, h)[1];
  const hs = marquee();
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  // the attract: the CPU plays the CPU, a quarter at a time
  useEffect(() => {
    const cv = canvas.current; if (!cv) return undefined;
    const ctx = cv.getContext("2d"), reduced = REDUCED();
    const ids = [TEAM_IDS[Math.floor(Math.random() * 10)], null]; ids[1] = TEAM_IDS.filter(x => x !== ids[0])[Math.floor(Math.random() * 9)];
    const kits = kitsFor(ids[0], ids[1]), names = ids.map(i => teamShort(i));
    const mk = () => newGame({ qlen: 1, sides: ["cpu", "cpu"], teams: ids.map(id => ({ id, short: teamShort(id), rows: sortEleven(league.teams[id]).map(([k, n, r]) => [k, shownName(n), r]) })) }, seedNow());
    let st = mk(), cam = camInit(st), raf = 0, last = performance.now(), acc = 0;
    const loop = (now) => {
      acc = Math.min(acc + (now - last) / 1000, 4 / HZ); last = now;
      while (acc >= 1 / HZ) { acc -= 1 / HZ; step(st, 0); if (st.over) { st = mk(); cam = camInit(st); } }
      camFollow(cam, st, reduced);
      drawAttract(ctx, st, cam, { names, kits, sides: ["cpu", "cpu"], reduced, t: now / 1000 });
      raf = requestAnimationFrame(loop);
    };
    if (reduced) { for (let i = 0; i < 900; i++) step(st, 0); camFollow(cam, st, true); drawAttract(ctx, st, cam, { names, kits, sides: ["cpu", "cpu"], reduced, t: 0 }); }
    else raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [league]);
  usePadMenu(true);
  return (
    <>
      <div className="tb-stage tb-attract"><canvas ref={canvas} width={W} height={H} aria-hidden="true" /></div>
      {cab && <p className="tb-cabhead">FOURTH AND LONG // ARCADE FOOTBALL. FOUR PLAYS A TEAM: GUESS THEIR CALL ON DEFENCE. TAP A TO BREAK TACKLES.</p>}
      {!cab && <p className="pg-lede">ARCADE FOOTBALL ON A SCROLLING FIELD. ELEVEN A SIDE FROM THE CITY'S OWN LEAGUE, FOUR PLAYS A TEAM: TWO RUNS, TWO PASSES. ON DEFENCE YOU GUESS THEIR CALL; GUESS RIGHT AND YOUR MEN ARE THROUGH THE LINE BEFORE THE BALL IS. TAP A AS FAST AS YOU CAN TO BREAK A TACKLE. ONE PLAYER AGAINST THE CPU, OR TWO ON ONE SCREEN.</p>}
      <div className="tb-menu" role="group" aria-label="Choose a mode">
        <Button variant="primary" ref={first} onClick={onQuick}>QUICK PLAY</Button>
        <Button variant="secondary" onClick={onOne}>1 PLAYER V CPU: CHOOSE TEAMS</Button>
        <Button variant="secondary" onClick={onTwo}>2 PLAYERS: ONE SCREEN</Button>
      </div>
      <p className="tb-sub">QUICK PLAY: {teamName(h)}{h === mine ? " (YOUR TEAM)" : ""} V {teamName(a)}. FOUR {qlen}-MINUTE QUARTERS.</p>
      <div className="tb-chips" role="radiogroup" aria-label="Quarter length">
        {QLENS.map(q => <button key={q} type="button" role="radio" aria-checked={qlen === q} className={`tb-chip${qlen === q ? " on" : ""}`} onClick={() => pickQ(q)}>{q}-MINUTE QUARTERS</button>)}
      </div>
      <div className="tb-chips" role="radiogroup" aria-label="CPU level">
        {[["rookie", "ROOKIE: THE CPU GOES EASY"], ["pro", "PRO: THE CPU PLAYS IT STRAIGHT"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={level === v} className={`tb-chip${level === v ? " on" : ""}`} onClick={() => pickLevel(v)}>{l}</button>)}
        <button type="button" className="tb-chip" aria-pressed={!muted} onClick={onMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</button>
      </div>
      <div className="tb-board">
        <p><b>THE MARQUEE TODAY</b> {hs ? `${hs.initials} ${hs.score}` : "-"}</p>
        <p><b>YOUR BEST WINS</b> {scores.length ? scores.map(s => `${s.line} (${teamShort(s.team)} V ${teamShort(s.vs)})`).join(" // ") : "NONE YET. BEAT THE CPU."}</p>
      </div>
      {cab && <ButtonRow><Button variant="back" onClick={leaveCabinet}>BACK TO THE BAR</Button></ButtonRow>}
      <details className="pg-more">
        <summary>HOW TO PLAY</summary>
        <div className="pg-more-body"><ControlsGuide /></div>
      </details>
    </>
  );
}

// The pad on the menu screens: the d-pad moves the focus between the buttons, A presses, B goes back.
function usePadMenu(on, onBack = null) {
  useEffect(() => {
    if (!on) return undefined;
    let raf = 0, prev = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = padAt(0);
      if (!p.connected) { prev = null; return; }
      const now = { y: p.y <= -0.5 ? -1 : p.y >= 0.5 ? 1 : 0, x: p.x <= -0.5 ? -1 : p.x >= 0.5 ? 1 : 0, act: p.held.act, back: p.held.back };
      if (prev) {
        const dir = (now.y && now.y !== prev.y) ? now.y : (now.x && now.x !== prev.x) ? now.x : 0;
        if (dir) {
          const els = [...document.querySelectorAll(".tb button:not([disabled]), .tb summary")];
          const i = els.indexOf(document.activeElement);
          const n = els[Math.max(0, Math.min(els.length - 1, (i < 0 ? 0 : i + dir)))];
          n?.focus({ preventScroll: false });
        }
        if (prev.act && !now.act && document.activeElement?.closest?.(".tb")) document.activeElement.click();
        if (now.back && !prev.back && onBack) onBack();
      }
      prev = now;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, onBack]);
}

// ---- choosing teams ------------------------------------------------------------------------------------------
function Teams({ league, mine, two, onStart, onBack }) {
  const [p1, setP1] = useState(null);
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("button")?.focus({ preventScroll: true }); }, [p1]);
  usePadMenu(true, p1 ? () => setP1(null) : onBack);
  const cards = useMemo(() => Object.fromEntries(TEAM_IDS.map(id => [id, teamCard(league.teams[id])])), [league]);
  const pick = (id) => { if (!p1) setP1(id); else onStart(p1, id); };
  const who = !p1 ? "PLAYER 1: PICK YOUR TEAM" : two ? "PLAYER 2: PICK YOURS" : "NOW PICK THE CPU'S TEAM";
  return (
    <>
      <p className="tb-cabhead" aria-live="polite">{who}{p1 ? ` (P1 HAS ${teamName(p1)})` : ""}</p>
      <ul className="tb-teams" ref={ref}>
        {TEAM_IDS.filter(id => id !== p1).map(id => {
          const c = cards[id], kit = kitsFor(p1 || id, id)[p1 ? 1 : 0];
          return (
            <li key={id}>
              <button type="button" className="tb-team" onClick={() => pick(id)} aria-label={`${teamName(id)}${id === mine ? ", your team" : ""}. Overall ${c.all}, run ${c.run}, pass ${c.pass}, defence ${c.def}.${c.stars.length ? ` Stars: ${c.stars.map(s => `${s.name} ${s.r}`).join(", ")}.` : ""}`}>
                <i className="sw" style={{ background: kit[0], borderColor: kit[1] }} aria-hidden="true" />
                <span className="nm">{teamName(id)}{id === mine ? " (YOURS)" : ""}</span>
                <span className="rt" aria-hidden="true"><b>{c.all}</b> RUN {c.run} PASS {c.pass} DEF {c.def}</span>
                <span className="st" aria-hidden="true">{c.stars.length ? c.stars.map(s => `★ ${s.name} ${s.r}`).join("  ") : "NO STARS."}</span>
                <span className="pb" aria-hidden="true">{bookOf(id).map(k => PLAYS[k].name).join(" / ")}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <ButtonRow><Button variant="back" onClick={p1 ? () => setP1(null) : onBack}>{p1 ? "PICK AGAIN" : "BACK"}</Button></ButtonRow>
      <p className="tb-sub">RATINGS COME FROM THIS SEASON'S LEAGUE. STARS RUN FASTER, HIT HARDER AND BREAK MORE TACKLES.</p>
    </>
  );
}

// ---- the game ------------------------------------------------------------------------------------------------
function Match({ game, muted, onMute, cab, onEnd, onAgain, onTape, onTeams, onTitle }) {
  const canvas = useRef(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(null);
  const [live, setLive] = useState("");
  const [label, setLabel] = useState("FOURTH AND LONG");
  const [pads, setPads] = useState([null, null]);
  const [tip, setTip] = useState(null);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const inputRef = useRef(null);
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const tape = game.tape;
  const names = game.cfg.teams.map(t => t.short), sides = game.cfg.sides, kits = game.kits;
  const heads = useRef({});
  // the heads for the touchdown screen: each man's own, cut from his file photo
  useEffect(() => {
    let off = false;
    for (const t of game.cfg.teams) for (const [key] of t.rows) {
      if (key.startsWith("citizen-") || key.startsWith("stand-in")) continue;
      loadSprite(`/api/sprite/${key}`, { sector: null }).then(s => { if (!off && s) { const h = headFrom(s, CROPS[key] || null); if (h) heads.current[key] = h; } }).catch(() => {});
    }
    return () => { off = true; };
  }, [game]);
  useEffect(() => {
    const cv = canvas.current; if (!cv) return undefined;
    const ctx = cv.getContext("2d"), reduced = REDUCED();
    const input = createInput({ two: game.two }); inputRef.current = input;
    const st = newGame(game.cfg, game.seed), cam = camInit(st);
    const log = [], masks = tape ? rleDecodeLocal(tape.rle) : null;
    const seenTips = tipsSeen();
    let tipNow = null, tipAt = 0;
    let raf = 0, last = performance.now(), acc = 0, said = [], lastLabel = 0, lastCur = "", done = false, padsWas = "";
    const finish = () => {
      if (done) return; done = true;
      const res = resultOf(st);
      let rec = null, verified = null;
      if (!tape) {
        rec = { v: VERSION, seed: game.seed, cfg: game.cfg, rle: rleEncode(log), at: Date.now() };
        const rp = replay(rec); verified = rp.ok && rp.result.score.join() === res.score.join() && rp.result.frames === res.frames;
        onEnd(rec, res);
      }
      setOver({ res, rec, verified });
    };
    const loop = (now) => {
      acc = Math.min(acc + (now - last) / 1000, 5 / HZ); last = now;
      while (acc >= 1 / HZ) {
        acc -= 1 / HZ;
        const smp = input.sample();
        const pk = smp.pads.join(); if (pk !== padsWas) { padsWas = pk; setPads(smp.pads); }
        if (smp.start && !done) { setPaused(p => !p); continue; }
        if (pausedRef.current || done) continue;
        let word = smp.word;
        if (masks) { if (st.frame >= masks.length) { finish(); break; } word = masks[st.frame]; }
        else log.push(word);
        step(st, word);
        SFX.play(st.ev, mutedRef.current);
        for (const e of st.ev) if (e.k === "say") said.push(e.text);
        if (st.over) { finish(); break; }
      }
      // the call screen, read out: the play under the cursor
      if (st.phase === "call") {
        const s = sides.findIndex((x, i) => x === "human" && !st.call.lock[i]);
        if (s >= 0) { const i = st.call.cur[s]; const id = i < 4 ? st.books[st.poss][i] : null; const k = `${s}:${i}`; if (k !== lastCur) { lastCur = k; said.push(`${s === 0 ? "P1" : "P2"}: ${i < 4 ? `${i + 1}, ${PLAYS[id].name}, A ${PLAYS[id].kind}` : i === 4 ? "PUNT" : "FIELD GOAL"}.`); } }
      } else lastCur = "";
      if (said.length) { setLive(said.slice(-3).join(" ")); said = []; }
      // first-run tips: player 1's, once each, held three seconds
      if (!tape && !done) {
        const tp = tipFor(st, 0, namesFor(padsWas.split(",")[0] || null, game.two));
        if (tp && !seenTips.has(tp[0]) && (!tipNow || tipNow[0] !== tp[0])) { if (!tipNow || now - tipAt > 3000) { tipNow = tp; tipAt = now; setTip(tp[1]); } }
        if (tipNow && now - tipAt > 3000 && (!tp || tp[0] !== tipNow[0])) { markTip(seenTips, tipNow[0]); tipNow = null; setTip(null); }
      }
      if (now - lastLabel > 1000) { lastLabel = now; setLabel(`FOURTH AND LONG. ${names[0]} ${st.score[0]}, ${names[1]} ${st.score[1]}. QUARTER ${Math.min(4, st.q)}.`); }
      camFollow(cam, st, reduced);
      draw(ctx, st, cam, { names, kits, sides, heads: heads.current, reduced, t: now / 1000 });
      if (!done) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); input.stop(); inputRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);
  const resume = () => setPaused(false);
  const res = over?.res;
  const verdict = res ? (res.winner === -1 ? "A TIE." : `${names[res.winner]} WIN ${Math.max(...res.score)}-${Math.min(...res.score)}.`) : "";
  return (
    <div className="tb-play">
      <div className="tb-stage">
        <canvas ref={canvas} width={W} height={H} role="img" aria-label={label} tabIndex={-1} />
      </div>
      <p className={`tb-tip${tip ? " on" : ""}`} aria-live="polite">{tip || ""}</p>
      <p className="sr-only" aria-live="polite">{live}</p>
      <TouchPad input={inputRef} />
      <p className="tb-status" aria-hidden="true">{statusLine(game.two, pads)}</p>
      {!cab && !over && (
        <ButtonRow split stackOnMobile>
          <Button variant="back" onClick={() => setPaused(true)}>PAUSE</Button>
          <Button variant="secondary" onClick={onMute}>{muted ? "SOUND: OFF" : "SOUND: ON"}</Button>
        </ButtonRow>
      )}
      {paused && !over && <GameMenu key="pause" kind="pause" title="PAUSED." onBack={resume}
        options={{ resume, restart: onAgain, controls: <ControlsGuide family={pads[0]} two={game.two} compact />, sound: { on: !muted, onSelect: onMute }, quit: { label: "QUIT TO THE TITLE", onSelect: onTitle }, ...(cab ? { bar: { label: "BACK TO THE BAR", onSelect: leaveCabinet } } : {}) }} />}
      {over && <GameMenu key="end" kind="end" title={tape ? "END OF THE TAPE." : "FINAL."} summary={`${names[0]} ${res.score[0]}, ${names[1]} ${res.score[1]}. ${verdict}${over.verified === false ? " THE REPLAY CHECK FAILED." : over.verified ? " REPLAY CHECKED." : ""}`}
        options={{ again: onAgain, rematch: { label: "CHOOSE TEAMS", onSelect: onTeams }, replay: !tape && over.rec ? () => onTape(over.rec) : false, title: { label: "THE TITLE SCREEN", onSelect: onTitle }, ...(cab ? { bar: { label: "BACK TO THE BAR", onSelect: leaveCabinet } } : { play: true }) }} />}
    </div>
  );
}
function rleDecodeLocal(rle) { const out = []; for (let i = 0; i < rle.length; i += 2) for (let k = 0; k < rle[i + 1]; k++) out.push(rle[i]); return out; }
function statusLine(two, pads) {
  const pad = (n) => (pads[n] ? `PAD ${n + 1}` : null);
  if (two) return `P1: ${pad(0) || "WASD, F = A, G = B"} // P2: ${pad(1) || "ARROWS, / = A, . = B"} // ESC PAUSES`;
  return `P1: ${pad(0) || "ARROWS, SPACE = A, K = B"} // ESC PAUSES`;
}

// the phone's pad: a d-pad on the left, B and A on the right (player 1)
function TouchPad({ input }) {
  const held = useRef(new Map());
  const push = () => { let m = 0; for (const b of held.current.values()) m |= b; input.current?.setTouch(m); };
  const on = (bits) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); held.current.set(e.pointerId, bits); input.current?.tap(bits); push(); },
    onPointerUp: (e) => { held.current.delete(e.pointerId); push(); },
    onPointerCancel: (e) => { held.current.delete(e.pointerId); push(); },
    onContextMenu: (e) => e.preventDefault(),
  });
  return (
    <div className="tb-touch" aria-hidden="true">
      <div className="tb-dpad">
        <button type="button" tabIndex={-1} className="u" {...on(BTN.UP)}>▲</button>
        <button type="button" tabIndex={-1} className="l" {...on(BTN.LEFT)}>◀</button>
        <button type="button" tabIndex={-1} className="r" {...on(BTN.RIGHT)}>▶</button>
        <button type="button" tabIndex={-1} className="d" {...on(BTN.DOWN)}>▼</button>
      </div>
      <div className="tb-ab">
        <button type="button" tabIndex={-1} className="b" {...on(BTN.B)}>B</button>
        <button type="button" tabIndex={-1} className="a" {...on(BTN.A)}>A</button>
      </div>
      <button type="button" tabIndex={-1} className="tb-pause" onPointerDown={(e) => { e.preventDefault(); input.current?.pressStart(); }}>PAUSE</button>
    </div>
  );
}
