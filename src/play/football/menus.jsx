import { useEffect, useRef, useState } from "react";
import { Frame } from "../../ui/index.js";
import { readPad, GLYPHS } from "../../city/gamepad.js";
import { TEAM_IDS, teamName, teamShort, teamUnits } from "./roster.js";
import { drawCrest } from "./crest.js";
import { QLENS } from "./sim.js";
import { CAM_NAMES } from "./render.js";

// THE BOWL, playable: the front end. Two DEPARTMENT OS windows before the whistle: THE BOWL (QUICK
// PLAY straight in with the day's pairing, EXHIBITION SETUP, HOW TO PLAY, THE TAPES) and EXHIBITION
// SETUP (both teams with their crests, unit ratings and key men; home or away; difficulty; the
// quarter; the camera). Controller first: the stick or the d-pad moves, A selects, B backs out, left
// and right turn a setting; the keyboard the same with arrows, Enter, Escape; every row is a real
// button for a mouse or a thumb. The focused row is inverse video, as every menu here.

export const DIFFS = [["rookie", "ROOKIE", "A BIGGER CATCH RADIUS, STEADIER THROWS, SLOWER CPU READS, OPEN LANES SHOWN; YOUR RUNNER RUNS ON HIS OWN WHEN YOU LET GO."], ["pro", "PRO", "EVERYONE PLAYS AS RATED."], ["allpro", "ALL-PRO", "THE CPU READS FASTER, COVERS TIGHTER, TACKLES SURER AND THROWS TRUER."]];
export const DIFF_IDS = DIFFS.map(d => d[0]);
const CAM_IDS = Object.keys(CAM_NAMES);

// The pad, for a menu: edges with a repeat on the directions, A on release (armed only once it went
// down inside the menu), B back, Start as select. on: {up, down, left, right, select, back, start}.
export function useMenuPad(on) {
  const [family, setFamily] = useState(null);
  const ref = useRef(on); ref.current = on;
  useEffect(() => {
    let raf, prev = null, armed = false, fam = null;
    const rep = { dir: null, t: 0 };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const p = readPad();
      if (!p.connected) { prev = null; rep.dir = null; if (fam) { fam = null; setFamily(null); } return; }
      if (fam !== p.family) { fam = p.family; setFamily(p.family); }
      const h = p.held;
      const dx = p.x > 0.5 ? 1 : p.x < -0.5 ? -1 : 0, dy = p.y > 0.5 ? 1 : p.y < -0.5 ? -1 : 0;
      const dir = dy ? (dy < 0 ? "up" : "down") : dx ? (dx < 0 ? "left" : "right") : null;
      if (dir !== rep.dir) { rep.dir = dir; rep.t = now + 300; if (dir) ref.current[dir]?.(); }
      else if (dir && now >= rep.t) { rep.t = now + 120; ref.current[dir]?.(); }
      if (h.act && prev && !prev.act) armed = true;
      if (!h.act && prev?.act && armed) { armed = false; ref.current.select?.(); }
      if (h.back && prev && !prev.back) ref.current.back?.();
      if (h.start && prev && !prev.start) ref.current.start?.();
      prev = h;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return family;
}
// Keys on a menu window: arrows move, Escape / Backspace back out; Enter and Space are the focused
// row's own click (so nothing fires twice).
function keyNav(on) {
  return (e) => {
    const k = e.key;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); on.up?.(); }
    else if (k === "ArrowDown" || k === "s" || k === "S") { e.preventDefault(); on.down?.(); }
    else if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); on.left?.(); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); on.right?.(); }
    else if (k === "Escape" || k === "Backspace") { e.preventDefault(); on.back?.(); }
    else if (k === "Tab") { e.preventDefault(); if (e.shiftKey) on.up?.(); else on.down?.(); }
  };
}
const hintFor = (family, { lr = false, back = true } = {}) => {
  const g = GLYPHS[family] || null;
  if (g) return `D-PAD ${lr ? "✚" : "▲▼"} // ${g.act} SELECT${back ? ` // ${g.back} BACK` : ""}`;
  return `${lr ? "ARROWS" : "↑↓"} // ENTER SELECTS${back ? " // ESC BACK" : ""}`;
};
// A row's button: focused rows carry the focus (one tab stop per window).
function Row({ focused, onFocus, onClick, className = "", children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { if (focused) { ref.current?.focus({ preventScroll: true }); try { ref.current?.scrollIntoView({ block: "nearest" }); } catch { /* fine */ } } }, [focused]);
  return <button type="button" ref={ref} className={`fb-row${focused ? " on" : ""} ${className}`} tabIndex={focused ? 0 : -1} onMouseEnter={onFocus} onFocus={onFocus} onClick={onClick} {...rest}>{children}</button>;
}

// ---- the crest (crest.js, pure) ------------------------------------------------------------------------
export function Crest({ id, size = 32, scale = 3, className = "" }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; if (!c) return; drawCrest(c.getContext("2d"), id, size); }, [id, size]);
  return <canvas ref={ref} width={size} height={size} className={`fb-crest ${className}`} style={{ width: size * scale, height: size * scale }} aria-hidden="true" />;
}

// ---- THE BOWL: the front window --------------------------------------------------------------------
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10] || "TH"}`;
export function FrontEnd({ league, pair, setup, mine, me, records, onQuick, onSetup, onHow, onTapes }) {
  const rows = [
    { id: "quick", label: "QUICK PLAY", hint: `${teamShort(pair[0])} V ${teamShort(pair[1])} // ${setup.qlen}-MINUTE QUARTERS // ${DIFFS.find(d => d[0] === setup.diff)?.[1] || "PRO"}`, go: onQuick },
    { id: "setup", label: "EXHIBITION SETUP", hint: "TEAMS, RATINGS, HOME OR AWAY, DIFFICULTY, QUARTERS, CAMERA", go: onSetup },
    { id: "how", label: "HOW TO PLAY", hint: "THE CONTROLS AND THE RULES", go: onHow },
    records.length ? { id: "tapes", label: `THE TAPES (${records.length})`, hint: "WATCH A GAME THIS BROWSER KEPT", go: onTapes } : null,
  ].filter(Boolean);
  const [f, setF] = useState(0);
  const on = { up: () => setF(i => (i + rows.length - 1) % rows.length), down: () => setF(i => (i + 1) % rows.length), select: () => rows[f]?.go(), start: onQuick };
  const family = useMenuPad(on);
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.querySelector(".fb-row.on")?.focus({ preventScroll: true }); }, []);
  const U = [teamUnits(league.teams[pair[0]]), teamUnits(league.teams[pair[1]])];
  return (
    <div className="fb-front" ref={boxRef} onKeyDown={keyNav(on)}>
      <Frame title="THE BOWL" meta={`SEASON ${league.season || "?"} // EXHIBITION`} className="fb-win">
        <div className="fb-front-grid">
          <div className="fb-matchup" aria-label={`Tonight: ${teamName(pair[0])} against ${teamName(pair[1])}`}>
            {[0, 1].map(t => (
              <div key={t} className="fb-mu-team">
                <Crest id={pair[t]} />
                <b>{teamShort(pair[t])}</b>
                <span>OVR {U[t].ovr}{league.pos[pair[t]] ? ` // ${ordinal(league.pos[pair[t]])}` : ""}</span>
              </div>
            ))}
            <span className="fb-mu-v" aria-hidden="true">V</span>
          </div>
          <div className="fb-rows" role="menu" aria-label="The Bowl">
            {rows.map((r, i) => (
              <Row key={r.id} role="menuitem" focused={i === f} onFocus={() => setF(i)} onClick={r.go}>
                <span className="caret" aria-hidden="true">{i === f ? "▸" : " "}</span>
                <span className="lab">{r.label}</span>
                <small>{r.hint}</small>
              </Row>
            ))}
          </div>
        </div>
        <p className="fb-small">{mine ? `YOU ARE ON THE ${teamName(mine)} THIS SEASON; QUICK PLAY PUTS YOU ON IT, AT YOUR RATING.` : me?.caseId ? "YOUR FILE IS NOT ON A FOOTBALL ROSTER THIS SEASON; QUICK PLAY GIVES YOU THE DEPARTMENT ELEVEN." : "QUICK PLAY: THE DEPARTMENT ELEVEN AGAINST THE TEAM NEAREST THEM IN RATING."}</p>
        <p className="fb-keys-hint" aria-hidden="true">{hintFor(family, { back: false })}{family ? ` // ${(GLYPHS[family] || GLYPHS.generic).start} QUICK PLAY` : ""}</p>
      </Frame>
    </div>
  );
}

// ---- EXHIBITION SETUP ------------------------------------------------------------------------------
function Meter({ label, v }) {
  return (
    <div className="fb-meter" role="img" aria-label={`${label} ${v}`}>
      <span className="l">{label}</span>
      <span className="bar"><i style={{ width: `${Math.max(2, Math.min(100, (v - 30) * 1.6))}%`, background: v >= 70 ? "var(--accent)" : v >= 55 ? "var(--fg-dim)" : "var(--warn)" }} /></span>
      <span className="v">{v}</span>
    </div>
  );
}
function TeamCard({ id, league, side, you, focused, onPrev, onNext, onFocus }) {
  const U = teamUnits(league.teams[id]);
  return (
    <div className={`fb-card${focused ? " on" : ""}`} onMouseEnter={onFocus}>
      <div className="fb-card-head"><span>{side}</span>{you && <b>YOU</b>}</div>
      <div className="fb-card-crest">
        <button type="button" className="fb-arrow" aria-label={`Previous ${side.toLowerCase()} team`} onClick={onPrev} tabIndex={-1}>◂</button>
        <Crest id={id} />
        <button type="button" className="fb-arrow" aria-label={`Next ${side.toLowerCase()} team`} onClick={onNext} tabIndex={-1}>▸</button>
      </div>
      <h3 className="fb-card-name">{teamName(id)}</h3>
      <p className="fb-card-pos">{league.pos[id] ? `${ordinal(league.pos[id])} IN THE LEAGUE` : "UNPLACED"}</p>
      <div className="fb-meters">
        <Meter label="OVR" v={U.ovr} /><Meter label="OFF" v={U.off} /><Meter label="DEF" v={U.def} /><Meter label="ST" v={U.st} />
      </div>
      <dl className="fb-key">
        {U.key.map(k => <div key={k.pos + k.key}><dt>{k.pos}</dt><dd><span>{k.name}</span><b>{k.r}</b></dd></div>)}
      </dl>
    </div>
  );
}
const cycle = (list, v, d) => list[(list.indexOf(v) + d + list.length) % list.length];
export function Setup({ league, setup, setSetup, mine, onStart, onBack }) {
  const other = (id, d, not) => { let v = id; do v = cycle(TEAM_IDS, v, d); while (v === not); return v; };
  const rows = [
    { id: "away", label: "AWAY TEAM", value: teamName(setup.away), turn: (d) => setSetup(s => ({ ...s, away: other(s.away, d, s.home) })) },
    { id: "home", label: "HOME TEAM", value: teamName(setup.home), turn: (d) => setSetup(s => ({ ...s, home: other(s.home, d, s.away) })) },
    { id: "side", label: "YOU PLAY AS", value: setup.side === "home" ? `HOME // ${teamShort(setup.home)}` : `AWAY // ${teamShort(setup.away)}`, turn: () => setSetup(s => ({ ...s, side: s.side === "home" ? "away" : "home" })) },
    { id: "diff", label: "DIFFICULTY", value: DIFFS.find(d => d[0] === setup.diff)?.[1] || "PRO", turn: (d) => setSetup(s => ({ ...s, diff: cycle(DIFF_IDS, s.diff, d) })), note: DIFFS.find(d => d[0] === setup.diff)?.[2] },
    { id: "qlen", label: "QUARTERS", value: `${setup.qlen} MINUTES`, turn: (d) => setSetup(s => ({ ...s, qlen: cycle(QLENS, s.qlen, d) })) },
    { id: "cam", label: "CAMERA", value: CAM_NAMES[setup.cam] || "BROADCAST", turn: (d) => setSetup(s => ({ ...s, cam: cycle(CAM_IDS, s.cam, d) })) },
    { id: "start", label: "START THE GAME", go: () => onStart(setup), primary: true },
    { id: "back", label: "BACK", go: onBack },
  ];
  const [f, setF] = useState(0);
  const on = {
    up: () => setF(i => (i + rows.length - 1) % rows.length), down: () => setF(i => (i + 1) % rows.length),
    left: () => rows[f].turn?.(-1), right: () => rows[f].turn?.(1),
    select: () => { const r = rows[f]; if (r.go) r.go(); else r.turn?.(1); }, back: onBack, start: () => onStart(setup),
  };
  const family = useMenuPad(on);
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.querySelector(".fb-row.on")?.focus({ preventScroll: true }); }, []);
  const youHome = setup.side === "home";
  return (
    <div className="fb-front" ref={boxRef} onKeyDown={keyNav(on)}>
      <Frame title="EXHIBITION SETUP" meta={`SEASON ${league.season || "?"} // ROSTERS AS ${league.live ? "DRAFTED" : "FILED"}`} className="fb-win">
        <div className="fb-cards">
          <TeamCard id={setup.away} league={league} side="AWAY" you={!youHome} focused={rows[f].id === "away"} onPrev={() => rows[0].turn(-1)} onNext={() => rows[0].turn(1)} onFocus={() => setF(0)} />
          <span className="fb-cards-v" aria-hidden="true">AT</span>
          <TeamCard id={setup.home} league={league} side="HOME" you={youHome} focused={rows[f].id === "home"} onPrev={() => rows[1].turn(-1)} onNext={() => rows[1].turn(1)} onFocus={() => setF(1)} />
        </div>
        <div className="fb-rows fb-opts" role="menu" aria-label="Exhibition setup">
          {rows.map((r, i) => (
            <Row key={r.id} role="menuitem" focused={i === f} onFocus={() => setF(i)} onClick={() => { if (r.go) r.go(); else r.turn?.(1); }} className={r.primary ? "primary" : r.go ? "action" : "cycle"} aria-label={r.value ? `${r.label}: ${r.value}` : r.label}>
              <span className="caret" aria-hidden="true">{i === f ? "▸" : " "}</span>
              <span className="lab">{r.label}</span>
              {r.value && <span className="val"><i aria-hidden="true">◂</i>{r.value}<i aria-hidden="true">▸</i></span>}
            </Row>
          ))}
        </div>
        <p className="fb-small">{rows[f].note || (rows[f].id === "side" ? `THE CROWD IS THE HOME SIDE'S. ${mine && (youHome ? setup.home : setup.away) === mine ? "YOU PLAY AS YOURSELF, AT YOUR RATING." : ""}` : rows[f].id === "cam" ? "BROADCAST FOLLOWS THE PLAY FROM BEHIND AND TIGHTENS ON THE MAN WITH THE BALL. HIGH AND WIDE SHOWS THE WHOLE FIELD OF PLAY." : rows[f].id === "qlen" ? "FOUR QUARTERS ON AN ACCELERATED CLOCK. THREE MINUTES IS ABOUT THIRTY-SEVEN PLAYS A SIDE." : "SPEED, HANDS, ARM AND TACKLING FOLLOW EACH PLAYER'S LEAGUE RATING. IRON MEN: THE SAME ELEVEN PLAYS BOTH WAYS AND THE KICKS.")}</p>
        <p className="fb-keys-hint" aria-hidden="true">{hintFor(family, { lr: true })}</p>
      </Frame>
    </div>
  );
}

// ---- HOW TO PLAY, THE TAPES: one window each, a BACK row --------------------------------------------
export function Sheet({ title, meta, onBack, children, backLabel = "BACK" }) {
  const on = { select: onBack, back: onBack };
  const family = useMenuPad(on);
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.querySelector(".fb-row")?.focus({ preventScroll: true }); }, []);
  return (
    <div className="fb-front" ref={boxRef} onKeyDown={keyNav(on)}>
      <Frame title={title} meta={meta} className="fb-win">
        {children}
        <div className="fb-rows"><Row focused onClick={onBack}><span className="caret" aria-hidden="true">▸</span><span className="lab">{backLabel}</span></Row></div>
        <p className="fb-keys-hint" aria-hidden="true">{hintFor(family, { back: true })}</p>
      </Frame>
    </div>
  );
}
export function Tapes({ records, onWatch, onBack }) {
  const rows = records.map((rec, i) => ({ rec, i }));
  const [f, setF] = useState(0);
  const n = rows.length + 1;
  const on = { up: () => setF(i => (i + n - 1) % n), down: () => setF(i => (i + 1) % n), select: () => (f < rows.length ? onWatch(rows[f].rec) : onBack()), back: onBack };
  const family = useMenuPad(on);
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.querySelector(".fb-row.on")?.focus({ preventScroll: true }); }, []);
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m} MIN AGO` : m < 1440 ? `${Math.round(m / 60)} H AGO` : `${Math.round(m / 1440)} D AGO`; };
  return (
    <div className="fb-front" ref={boxRef} onKeyDown={keyNav(on)}>
      <Frame title="THE TAPES" meta="KEPT IN THIS BROWSER ONLY" className="fb-win">
        <div className="fb-rows" role="menu" aria-label="The tapes">
          {rows.map(({ rec, i }) => {
            const r = rec.result, hi = rec.side === "away" ? 1 : 0, L = 1 - hi;
            return (
              <Row key={rec.at} role="menuitem" focused={f === i} onFocus={() => setF(i)} onClick={() => onWatch(rec)}>
                <span className="caret" aria-hidden="true">{f === i ? "▸" : " "}</span>
                <span className="lab">{teamShort(L ? rec.away : rec.home)} {r.score[L]}, {teamShort(hi ? rec.away : rec.home)} {r.score[hi]}</span>
                <small>{rec.cfg?.qlen}-MINUTE QUARTERS // {ago(rec.at)}</small>
              </Row>
            );
          })}
          <Row focused={f === rows.length} onFocus={() => setF(rows.length)} onClick={onBack}><span className="caret" aria-hidden="true">{f === rows.length ? "▸" : " "}</span><span className="lab">BACK</span></Row>
        </div>
        <p className="fb-keys-hint" aria-hidden="true">{hintFor(family)}</p>
      </Frame>
    </div>
  );
}
