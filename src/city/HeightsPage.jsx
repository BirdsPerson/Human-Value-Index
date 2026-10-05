// #heights: THE MOUNTAIN's own page. The trail map (trailMap.js), every trail and lift with its
// status by the weather and the hour, the lodges, and THE WEEKEND RACE (race.js): the race on now
// or the last one, the next, the season's standings. Everything from the machine clock, the same
// for every viewer.
import { useEffect, useRef, useState } from "react";
import { Frame } from "../ui/index.js";
import { clockAt } from "./simApi.js";
import { PLACES, BUILDING } from "./sim.js";
import { TRAILS, LIFTS, LODGES, RATING, RATINGS, PEAKS, feetAt, terrainH, weatherOn, trailStatus, liftStatus, SUMMIT_H } from "./mountainGeo.js";
import { drawTrailMap, symbol } from "./trailMap.js";
import { raceAt, lastRace, nextRace, standings, racerName, fmt, RACER, CUP_HOOK } from "./race.js";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const WX_LINE = { CLEAR: "CLEAR. VISIBILITY APPROVED.", "FRESH SNOW": "FRESH SNOW. THE POWDER HAS BEEN COUNTED.", WIND: "WIND. THE GONDOLA AND THE SUMMIT CHAIRS ARE ON HOLD.", WHITEOUT: "WHITEOUT. THE UPPER MOUNTAIN IS CLOSED. THE MOUNTAIN IS STILL THERE.", COLD: "COLD. THE GUNS RUN ALL NIGHT." };

function Mark({ rating }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current?.getContext("2d"); if (!c) return; c.clearRect(0, 0, 22, 14); symbol(c, rating, rating === "double" ? 11 : 7, 7, 4.5); }, [rating]);
  return <canvas ref={ref} width={22} height={14} aria-hidden="true" style={{ verticalAlign: "middle", marginRight: "0.5ch" }} />;
}

export function HeightsPage() {
  const [mt, setMt] = useState(() => clockAt(Date.now()).mt);
  useEffect(() => { const iv = setInterval(() => setMt(clockAt(Date.now()).mt), 5000); return () => clearInterval(iv); }, []);
  const wrap = useRef(null), canvas = useRef(null);
  const day = Math.floor(mt / 24) + 1, hour = ((mt % 24) + 24) % 24, wx = weatherOn(day);
  const open = TRAILS.filter(T => trailStatus(T, mt).open).length;
  // the map redraws when the status of a trail or lift changes (and on resize)
  const key = TRAILS.map(T => (trailStatus(T, mt).open ? 1 : 0)).join("") + LIFTS.map(L => (liftStatus(L, mt).open ? 1 : 0)).join("");
  useEffect(() => {
    const draw = () => {
      const el = canvas.current, box = wrap.current;
      if (!el || !box) return;
      const W = Math.max(300, box.clientWidth), H = Math.round(Math.max(320, Math.min(760, W * 0.72))), dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = W * dpr; el.height = H * dpr; el.style.width = `${W}px`; el.style.height = `${H}px`;
      const ctx = el.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTrailMap(ctx, W, H, mt);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  const race = raceAt(mt), last = lastRace(mt), next = nextRace(mt), table = standings(mt);
  const shown = race && race.phase !== "before" ? { r: race.race, rows: race.phase === "done" ? race.race.results : race.board, live: race.phase === "on" } : last ? { r: last, rows: last.results, live: false } : null;
  const S = PEAKS[0];
  return (
    <>
      <Frame title="THE HEIGHTS // TRAIL MAP" meta={`MACHINE DAY ${day} ${DAYS[(day - 1) % 7]} ${hhmm(hour)} // ${wx} // ${open} OF ${TRAILS.length} TRAILS OPEN`}>
        <div className="hvi-city-note" style={{ marginBottom: "var(--s2)" }}>
          {S.name}, {feetAt(S.h).toLocaleString("en-US")} FT. {(feetAt(SUMMIT_H) - feetAt(0)).toLocaleString("en-US")} FT OF VERTICAL, {TRAILS.length} TRAILS, {LIFTS.length} LIFTS, THREE LODGES. ALTITUDE IS A PRIVILEGE. DESCENT IS MANDATORY. TODAY: {WX_LINE[wx]}
        </div>
        <div ref={wrap} style={{ width: "100%" }}><canvas ref={canvas} role="img" aria-label={`Trail map of the Heights: ${TRAILS.length} trails and ${LIFTS.length} lifts on ${S.name}.`} style={{ display: "block", width: "100%" }} /></div>
        <div className="hvi-lg-box" style={{ paddingLeft: 0, marginTop: "var(--s2)", fontSize: "var(--t-xs)", color: "var(--fg-dim)" }}>
          {RATINGS.map(r => <span key={r}><Mark rating={r} />{RATING[r].name} ({RATING[r].short})</span>)}
          <span style={{ color: "#fde047" }}>— CHAIRLIFT</span><span style={{ color: "#fca5a5" }}>— GONDOLA</span>
        </div>
      </Frame>
      <Frame title="TRAIL STATUS" meta={`${open} OPEN // GROOMED NIGHTLY 21:30-06:30`}>
        <div className="hvi-lg-scroll"><table className="hvi-lg-stats">
          <thead><tr><th className="n">TRAIL</th><th>RATING</th><th>TERRAIN</th><th>VERTICAL</th><th>STATUS</th></tr></thead>
          <tbody>{RATINGS.flatMap(r => TRAILS.filter(T => T.rating === r)).map(T => {
            const st = trailStatus(T, mt), drop = feetAt(terrainH(...T.pts[0])) - feetAt(terrainH(...T.pts[T.pts.length - 1]));
            return <tr key={T.id}><td className="n"><Mark rating={T.rating} />{T.name}</td><td>{RATING[T.rating].short}</td><td>{T.kind === "groomed" ? "GROOMED" : T.kind === "cat" ? "CAT TRACK" : T.kind === "race" ? "GATES" : T.kind.toUpperCase()}</td><td>{drop.toLocaleString("en-US")} FT</td><td className={st.open ? "on" : undefined}>{st.open ? "OPEN" : `CLOSED: ${st.why}`}</td></tr>;
          })}</tbody>
        </table></div>
      </Frame>
      <Frame title="LIFTS" meta={`${LIFTS.filter(L => liftStatus(L, mt).open).length} OF ${LIFTS.length} RUNNING`}>
        <div className="hvi-lg-scroll"><table className="hvi-lg-stats">
          <thead><tr><th className="n">LIFT</th><th>KIND</th><th>RIDE</th><th>HOURS</th><th>STATUS</th></tr></thead>
          <tbody>{LIFTS.map(L => { const st = liftStatus(L, mt); return <tr key={L.id}><td className="n">{L.name} <span style={{ color: "var(--fg-mute)" }}>// {L.sub}</span></td><td>{L.kind === "gondola" ? `GONDOLA (${L.seats})` : `CHAIR (${L.seats})`}</td><td>{Math.round((L.len / L.speed) * 60)} MIN</td><td>{hhmm(L.open[0])}-{hhmm(L.open[1])}</td><td className={st.open ? "on" : undefined}>{st.open ? "RUNNING" : st.why}</td></tr>; })}</tbody>
        </table></div>
      </Frame>
      <Frame title="THE LODGES" meta="WARMTH, RATIONED">
        <div className="hvi-lg-scroll"><table className="hvi-lg-stats">
          <thead><tr><th className="n">LODGE</th><th>ELEVATION</th><th>ROOMS</th><th>SEATS</th></tr></thead>
          <tbody>{[["the-lodge", 0], ["the-mid-lodge", LODGES.mid.base], ["the-summit-lodge", LODGES.summit.base]].map(([id, h]) => { const b = BUILDING[id]; return <tr key={id}><td className="n"><a href={`#city/heights/${id}`} style={{ color: "inherit" }}>{b.name}</a></td><td>{feetAt(h).toLocaleString("en-US")} FT</td><td>{b.floors.map(f => f.name.split(" (")[0]).join(", ")}</td><td>{b.places.reduce((n, p) => n + PLACES[p].cap, 0)}</td></tr>; })}</tbody>
        </table></div>
      </Frame>
      <Frame title="THE WEEKEND RACE // THE GAUNTLET" meta={race?.phase === "on" ? `LIVE: ${race.race.name}${race.cur ? ` // RUN ${race.cur.run} // BIB ${race.cur.bib} ${racerName(race.cur.slug)} ON COURSE` : ""}` : next ? `NEXT: ${next.name}, MACHINE DAY ${next.day} SAT 13:00` : "SATURDAYS 13:00"}>
        <div className="hvi-city-note" style={{ marginBottom: "var(--s2)" }}>
          SATURDAYS, 13:00 TO 15:00: SLALOM ONE WEEK, GIANT SLALOM THE NEXT. TWO RUNS, THE CLOCK DECIDES. THE SKIERS AND BOARDERS ON FILE START FIRST; THE DEPARTMENT ENTERS ITS ATHLETES. A STRADDLED GATE IS A DNF. THE GATE IS FINE.
        </div>
        {shown && <>
          <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-mute)", margin: "0 0 var(--s1)" }}>{shown.live ? "LIVE" : "RESULTS"}: {shown.r.name}, MACHINE DAY {shown.r.day}</div>
          <div className="hvi-lg-scroll"><table className="hvi-lg-stats">
            <thead><tr><th>#</th><th>BIB</th><th className="n">RACER</th><th>ON</th><th>RUN 1</th><th>RUN 2</th><th>TOTAL</th><th>PTS</th></tr></thead>
            <tbody>{shown.rows.map(x => <tr key={x.slug}><td>{x.place || "-"}</td><td>{x.bib}</td><td className="n">{racerName(x.slug)}</td><td>{RACER[x.slug][2]}</td><td>{fmt(x.t1)}</td><td>{x.t2 === undefined ? "" : fmt(x.t2)}</td><td className={x.place === 1 ? "on" : undefined}>{x.total == null ? (x.t2 === undefined ? "" : "DNF") : fmt(x.total)}</td><td>{shown.live ? "" : x.pts}</td></tr>)}</tbody>
          </table></div>
        </>}
        <div style={{ fontSize: "var(--t-xs)", color: "var(--fg-mute)", margin: "var(--s3) 0 var(--s1)" }}>THE MOUNTAIN STANDINGS: THIS SEASON (WORLD CUP POINTS, 100 TO THE WINNER)</div>
        <div className="hvi-lg-scroll"><table className="hvi-lg-stats">
          <thead><tr><th>#</th><th className="n">RACER</th><th>RATING</th><th>RACES</th><th>WINS</th><th>PODIUMS</th><th>PTS</th></tr></thead>
          <tbody>{table.map((r, i) => <tr key={r.slug}><td>{i + 1}</td><td className="n">{racerName(r.slug)}</td><td>{RACER[r.slug][3]}</td><td>{r.races}</td><td>{r.wins}</td><td>{r.podiums}</td><td className={i === 0 && r.pts ? "on" : undefined}>{r.pts}</td></tr>)}</tbody>
        </table></div>
        <div className="hvi-city-note" style={{ marginTop: "var(--s2)" }}>
          THE DEPARTMENTAL CUP: {CUP_HOOK.from == null ? "THE CUP DOES NOT YET COUNT THE MOUNTAIN. THE TOP THREE OF THESE STANDINGS ARE HELD FOR IT (3, 2, 1, BY DISTRICT OF EMPLOYMENT), PENDING A DIRECTIVE." : `FROM SEASON ${CUP_HOOK.from + 1} THE TOP THREE SCORE 3, 2, 1 FOR THEIR DISTRICTS.`}
        </div>
      </Frame>
    </>
  );
}
