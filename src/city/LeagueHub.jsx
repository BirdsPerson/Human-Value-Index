// #city/league: THE LEAGUES hub (docs/CITY_SPEC.md "The leagues and the Departmental Cup"). Tabs
// for BASEBALL / BASKETBALL / FOOTBALL / SOCCER (table, today, results with box scores, leaders,
// player and team stats, rosters, the draft board), TENNIS (the ladder), PIT (the rankings) and the
// CUP. Everything is recomputed from the day's civic block (civic.js leaguesView) by the code the
// fold ran, so the summary carries only rosters, drafts and tables. Before the leagues open the
// page is the mixed league (CivicPanel.jsx LeaguePanel) with the date the leagues take over.
import { useMemo, useState } from "react";
import { Frame, Disclosure, Chip, ChipStrip } from "../ui/index.js";
import { pad, padL } from "../term.jsx";
import { useCivic, LeaguePanel } from "./CivicPanel.jsx";
import * as L from "./leagues.js";
import { leaguesView, decidedAt, sportTableAt, cupTableAt, LEAGUES_FROM, teamShort, teamName } from "./civic.js";
import { CITY_EPOCH, DEFAULT_SCALE } from "./sim.js";
import { resultLine } from "./pit.js";
import TournamentList from "../tournament/TournamentList.jsx";
import { heldSubject } from "./planClient.js";
import Sparkline from "../ui/Sparkline.jsx";

// A league line's person, for the movement sparkline: the census record this browser holds,
// else the figures on file by slug (src/ui/Sparkline.jsx seriesOf); a stranger's citizen shows none.
const subjectOf = (x) => heldSubject(x.key) || { slug: x.key, name: x.name, kind: String(x.key).startsWith("citizen-") ? "citizen" : undefined };

export const TABS = [["baseball", "BASEBALL"], ["basketball", "BASKETBALL"], ["football", "FOOTBALL"], ["soccer", "SOCCER"], ["tennis", "TENNIS"], ["pit", "PIT"], ["cup", "CUP"]];
const ord = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "ST" : n % 10 === 2 && n % 100 !== 12 ? "ND" : n % 10 === 3 && n % 100 !== 13 ? "RD" : "TH"}`;
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;
const up = (s) => String(s || "").toUpperCase();
const FIRST_DAY = L.seasonStart(LEAGUES_FROM);
const dayAtMs = (day) => CITY_EPOCH + ((day - 1) * 24 * 3600 * 1000) / DEFAULT_SCALE;
// a stat as the page prints it: .333, 2.75, 57.1%
export function fmt(key, v) {
  if (v == null) return "-";
  if (key === "avg" || key === "fgp") return v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, "");
  if (key === "era") return v.toFixed(2);
  if (typeof v === "number" && !Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}

// Season stats per sport for a block at hour h, memoised on what has been decided.
const STATS = new Map();
export function statsFor(block, sport, h) {
  const V = leaguesView(block);
  if (!V) return null;
  const done = decidedAt(block, sport, h);
  const key = `${block.day}|${sport}|${done.length}`;
  if (!STATS.has(key)) {
    STATS.set(key, L.seasonStats(sport, done, V.rosters[sport]));
    if (STATS.size > 24) STATS.delete(STATS.keys().next().value);
  }
  return STATS.get(key);
}

export function LeagueHub({ tab }) {
  const { block, h } = useCivic();
  const lg = block?.leagues;
  const t = TABS.some(([k]) => k === tab) ? tab : "cup";
  const go = (k) => { const q = window.location.hash.split("?")[1]; window.location.hash = `#city/league/${k}${q ? "?" + q : ""}`; };
  if (!lg) {
    return (
      <>
        <Frame title="THE LEAGUES" meta={`OPEN SEASON ${LEAGUES_FROM + 1} // MACHINE DAY ${FIRST_DAY}`} className="hvi-civic">
          <div className="hvi-city-note">THE MIXED LEAGUE IS BEING BROKEN UP. FROM SEASON {LEAGUES_FROM + 1} (MACHINE DAY {FIRST_DAY}, {new Date(dayAtMs(FIRST_DAY)).toISOString().replace("T", " ").slice(0, 16)} UTC) EVERY DISTRICT FIELDS FOUR TEAMS: BASEBALL AT THE DIAMOND (THE CURATED NINE), BASKETBALL AT THE COURTS (THE CURATED FIVE), FOOTBALL AT THE BOWL (THE CURATED ELEVEN) AND SOCCER AT THE ESTATE PITCH (CURATED F.C.; F.C. STANDS FOR FULLY COMPLIANT). EACH LEAGUE DRAFTS ITS OWN. THE TENNIS LADDER AND THE PIT RANKINGS COUNT TOO. THE DEPARTMENTAL CUP ADDS IT ALL UP.</div>
          <ChipStrip label="Leagues" className="hvi-lg-tabs">{TABS.map(([k, l]) => <Chip key={k} pressed={false} disabled>{l}</Chip>)}</ChipStrip>
        </Frame>
        <LeaguePanel full />
        <TournamentList />
      </>
    );
  }
  return (
    <>
    <Frame title="THE LEAGUES" meta={`SEASON ${lg.season} // DAY ${lg.day} OF ${lg.days}`} className="hvi-civic hvi-lg">
      <ChipStrip label="Leagues" className="hvi-lg-tabs">
        {TABS.map(([k, l]) => <Chip key={k} pressed={t === k} onClick={() => go(k)}>{l}</Chip>)}
      </ChipStrip>
      {L.SPORTS.includes(t) && <SportTab block={block} h={h} sport={t} />}
      {t === "tennis" && <TennisTab block={block} h={h} />}
      {t === "pit" && <PitTab block={block} h={h} />}
      {t === "cup" && <CupTab block={block} h={h} go={go} />}
      <div className="hvi-city-note">EXHIBITIONS, PLAYED BY YOU, COUNTED NOWHERE: <a href="#golf">GOLF AT THE DEPARTMENT LINKS</a>, <a href="#hoops">BASKETBALL AT THE COURTS</a>, <a href="#football">FOOTBALL AT THE BOWL</a>, <a href="#soccer">SOCCER AT THE ESTATE PITCH</a>.</div>
    </Frame>
    {/* the open tournaments (src/tournament/): golf, bowling and the derby, played by you, ranked */}
    <TournamentList />
    </>
  );
}

// ---- a sport ------------------------------------------------------------------------------------
const TEAM_COLS = {
  baseball: [["f", "R"], ["a", "RA"], ["h", "H"], ["hr", "HR"], ["k", "K"], ["avg", "AVG"], ["era", "ERA"]],
  basketball: [["f", "PTS"], ["a", "PA"], ["reb", "REB"], ["ast", "AST"], ["tpm", "3PM"], ["fgp", "FG%"]],
  football: [["f", "PF"], ["a", "PA"], ["passYds", "PASS"], ["rushYds", "RUSH"], ["td", "TD"], ["sacks", "SACK"], ["int", "INT"]],
  soccer: [["f", "GF"], ["a", "GA"], ["goals", "G"], ["assists", "A"], ["saves", "SV"], ["cs", "CS"]],
};
function matchText(m, h, block) {
  const over = m.day < block.day || h >= m.to, on = m.day === block.day && h >= m.from && !over;
  const st = m.stage !== "regular" ? `${L.STAGE_NAME[m.stage]}: ` : "";
  const where = m.kind === "hoops" ? `GAME ${m.j + 1}` : m.featured ? "ON THE BOARD" : "CLOSED DOORS";
  const score = over ? `${m.score[0]}-${m.score[1]}` : "V";
  const tail = over ? (m.tiebreak ? ` (${teamShort(m.tiebreak)} ON THE TIEBREAK)` : "") : on ? " // IN PLAY" : " // LATER";
  return { over, text: `${hhmm(m.from)} ${pad(where, 13)}${st}${teamShort(m.sides[0])} ${score} ${teamShort(m.sides[1])}${tail}` };
}
function BoxScore({ m, rosters }) {
  const box = L.boxScore(m, rosters);
  const cols = L.STAT_COLS[m.sport].filter(([k]) => !["g", "avg", "era", "ppg", "rpg", "apg", "fgp"].includes(k));
  const has = (L0, k) => L0.some(x => x[k]);
  return (
    <div className="hvi-lg-box">
      {box.sides.map((lines, s) => {
        const use = cols.filter(([k]) => has(lines, k));
        return (
          <pre key={s} className="hvi-civic-table" aria-label={`${L.sportTeamName(m.sides[s], m.sport)} box score`}>
            {`${pad(L.sportTeamName(m.sides[s], m.sport), 24)} ${m.score[s]}\n`}
            {`${pad("", 22)}${use.map(([, l]) => padL(l.split(" ")[0].slice(0, 5), 6)).join("")}\n`}
            {lines.map(x => `${pad(`${x.pos ? pad(x.pos, 3) : ""}${up(x.name).slice(0, 18)}`, 22)}${use.map(([k]) => padL(x[k] ?? 0, 6)).join("")}\n`).join("")}
          </pre>
        );
      })}
    </div>
  );
}
function SportTab({ block, h, sport }) {
  const V = leaguesView(block), S = L.SPORT[sport], lg = block.leagues.sports[sport];
  const all = V.all[sport];
  const done = decidedAt(block, sport, h);
  const table = sportTableAt(block, sport, h);
  const stats = statsFor(block, sport, h);
  const [sort, setSort] = useState(null);
  const [open, setOpen] = useState(null);
  const today = all.filter(m => m.day === block.day);
  const fin = done.find(m => m.stage === "final");
  const mvp = stats && L.mvpOf(sport, stats.players);
  const leaders = stats ? L.leadersOf(sport, stats.players) : [];
  const cols = L.STAT_COLS[sport];
  const key = sort || L.LEADERS[sport][0][0];
  const asc = L.LEADERS[sport].find(c => c[0] === key)?.[4];
  const players = stats ? Object.values(stats.players).sort((a, b) => ((asc ? a[key] - b[key] : (b[key] ?? -1) - (a[key] ?? -1))) || b.r - a.r) : [];
  const pts = L.positionPoints(sport, done);
  const md = L.slotsOn(sport, block.day)[0], season = block.leagues.season - 1, R = L.roundsOf(sport, season), long = L.isLong(season);
  const board = L.draftBoard(lg.draft, V.rosters[sport], S.n);
  const draftLine = (p) => `${pad(`${p.round}.${String(p.pick).padStart(2, "0")}`, 6)}${pad(teamShort(p.team), 11)}${pad(up(p.player[1]).slice(0, 22), 23)}${padL(p.player[2], 3)}${p.holder !== p.team ? `  TO ${teamShort(p.holder)}` : ""}\n`;
  const results = done.filter(m => m.day < block.day || m.to <= h).slice(-10).reverse();
  return (
    <>
      <div className="hvi-city-room-h">{S.name} AT {S.ground} // {fin ? `CHAMPIONS: ${L.sportTeamName(L.winnerOf(fin), sport)}` : lg.stage === "off" ? "THE SEASON IS DECIDED" : `${L.STAGE_NAME[lg.stage] === "LEAGUE" ? "THE REGULAR SEASON" : L.STAGE_NAME[lg.stage]}`}</div>
      <pre className="hvi-civic-table" aria-label={`${S.name} standings`}>
        {`${pad("POS", 4)}${pad("TEAM", 13)}${padL("P", 3)}${padL("W-D-L", 8)}${padL("PTS", 5)}${padL("CUP", 5)}  FORM\n`}
        {table.map(r => `${pad(String(r.pos), 4)}${pad(teamShort(r.id), 13)}${padL(r.p, 3)}${padL(`${r.w}-${r.d}-${r.l}`, 8)}${padL(r.pts, 5)}${padL(pts[r.id], 5)}  ${r.form || "-"}\n`).join("")}
      </pre>
      <div className="hvi-civic-line">{mvp ? <>{fin ? "MVP" : "MVP RACE"}: <b>{up(mvp.name)}</b> ({teamShort(mvp.team)}). </> : null}{S.finalOnly ? `${R} ROUNDS, THEN THE TOP TWO MEET IN THE BOWL GAME.` : `${R} ROUNDS${R % 9 ? " OF THE CIRCLE" : R === 9 ? " (EVERY PAIR ONCE)" : R === 18 ? " (EVERY PAIR TWICE)" : ` (EVERY PAIR ${R / 9} TIMES)`}, THEN 1ST V 4TH AND 2ND V 3RD, THEN THE FINAL.`} WIN 3, DRAW 1.{long ? ` THE SEASON RUNS ONE REAL MONTH (${L.LONG_SEASON_DAYS} MACHINE DAYS); EXHIBITIONS FILL THE SLOTS BETWEEN MATCHDAYS. THE PLAYOFFS TAKE THE LAST ${S.finalOnly ? "SLOT" : "TWO SLOTS"} OF THE SEASON.` : ""}</div>

      <div className="hvi-city-room-h">TODAY{md ? ` // MATCHDAY ${md.md + 1} OF ${L.matchdays(sport, season)}` : ""}</div>
      {today.length ? today.map(m => { const x = matchText(m, h, block); return <MatchRow key={`${m.k}.${m.j}`} m={m} x={x} rosters={V.rosters[sport]} open={open} setOpen={setOpen} />; })
        : <div className="hvi-city-note">NO {S.name} TODAY. {S.ground} IS OPEN FOR SUPERVISED FUN.</div>}
      {S.kind !== "hoops" && today.length > 1 && <div className="hvi-city-note">ONE TIE IS PLAYED ON THE BOARD AT {S.ground}. THE REST ARE PLAYED BEHIND CLOSED DOORS AT A DEPARTMENT FACILITY; RESULTS ARE RELEASED AT THE WHISTLE.</div>}

      <div className="hvi-city-room-h">RESULTS</div>
      {results.length ? results.map(m => { const x = matchText(m, h, block); return <MatchRow key={`${m.k}.${m.j}`} m={m} x={{ ...x, text: `DAY ${m.day} ${x.text}` }} rosters={V.rosters[sport]} open={open} setOpen={setOpen} />; })
        : <div className="hvi-city-note">NO RESULTS YET THIS SEASON. OPTIMISM IS NOT RECORDED.</div>}

      <div className="hvi-city-room-h">LEAGUE LEADERS</div>
      <div className="hvi-lg-leaders">
        {leaders.map(c => (
          <div key={c.key} className="hvi-lg-lead">
            <div className="t">{c.label}</div>
            {c.rows.length ? c.rows.map((x, i) => <div key={x.key} className="r"><span>{i + 1}. {up(x.name)} <i>{teamShort(x.team)}</i></span><Sparkline s={subjectOf(x)} /><b>{fmt(c.key, x[c.key])}</b></div>)
              : <div className="r dim">NOBODY QUALIFIES. YET.</div>}
          </div>
        ))}
      </div>

      <Disclosure className="hvi-city-disc" title="PLAYER STATS" meta={`${players.length} PLAYERS // SORTED BY ${cols.find(c => c[0] === key)?.[1] || up(key)}`}>
        <div className="hvi-lg-scroll">
          <table className="hvi-lg-stats">
            <thead><tr><th className="n">PLAYER</th><th><span aria-hidden="true">FILE</span><span className="sr-only">Score history</span></th><th>TEAM</th>{cols.map(([k, l]) => <th key={k}><button type="button" aria-pressed={key === k} onClick={() => setSort(k)}>{l}</button></th>)}</tr></thead>
            <tbody>{players.map(x => <tr key={x.key}><td className="n">{up(x.name)}</td><td><Sparkline s={subjectOf(x)} /></td><td>{teamShort(x.team)}</td>{cols.map(([k]) => <td key={k} className={key === k ? "on" : undefined}>{fmt(k, x[k])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Disclosure>
      <Disclosure className="hvi-city-disc" title="TEAM STATS" meta={`${S.name} // SEASON TO DATE`}>
        <div className="hvi-lg-scroll">
          <table className="hvi-lg-stats">
            <thead><tr><th className="n">TEAM</th><th>G</th>{TEAM_COLS[sport].map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
            <tbody>{L.DIST.map(id => { const x = stats?.teams[id] || {}; return <tr key={id}><td className="n">{teamShort(id)}</td><td>{x.g || 0}</td>{TEAM_COLS[sport].map(([k]) => <td key={k}>{fmt(k, x[k] ?? 0)}</td>)}</tr>; })}</tbody>
          </table>
        </div>
      </Disclosure>
      <Disclosure className="hvi-city-disc" title="ROSTERS" meta={`${S.n} A SIDE // RATING`}>
        {L.DIST.map(id => <div key={id} className="hvi-civic-line"><b>{L.sportTeamName(id, sport)}</b> ({block.districts[id].teams[sport].rating}): {V.rosters[sport][id].map(p => `${p[1]} ${p[2]}`).join(", ") || "NOBODY. THE DEPARTMENT FIELDS A CONE."}</div>)}
      </Disclosure>
      <Disclosure className="hvi-city-disc" title="THE DRAFT BOARD" meta={`SEASON ${lg.draft.season} // ${board.length} PICKS`}>
        <div className="hvi-civic-line">ORDER: {lg.draft.order.map((id, i) => `${i + 1}. ${teamShort(id)}`).join(" ")}. THE REVERSE OF LAST SEASON'S {lg.draft.season === LEAGUES_FROM + 1 ? "MIXED LEAGUE" : `${S.name} TABLE`}; THE CHAMPION PICKS LAST; THE ORDER SNAKES BACK EACH ROUND. THE POOL: {S.name} PLAYERS ON FILE FIRST, THEN ATHLETES, THEN THE REGULARS AT {S.ground}, THEN EVERYONE ELSE. CITIZENS ENTERED FROM MY FILE JOIN AMONG THE ATHLETES, AT THEIR OWN RATING. NOBODY ON FILE PLAYS TWO SPORTS.</div>
        <pre className="hvi-civic-table" aria-label="Draft board">{board.map(draftLine).join("")}</pre>
        <div className="hvi-civic-line">{lg.draft.trades?.length ? `THE COMMISSIONER'S CAP ORDERED ${lg.draft.trades.length} TRADE${lg.draft.trades.length === 1 ? "" : "S"}: ${lg.draft.trades.map(([r, a, b]) => `ROUND ${r + 1}, ${teamShort(a)} TO ${teamShort(b)}`).join("; ")}.` : "THE COMMISSIONER'S CAP ORDERED NO TRADES. THE SNAKE WAS FAIR ENOUGH."}</div>
      </Disclosure>
    </>
  );
}
function MatchRow({ m, x, rosters, open, setOpen }) {
  const id = `${m.day}.${m.k}.${m.j}`, on = open === id;
  if (!x.over) return <div className="hvi-civic-fx">{x.text}</div>;
  return (
    <>
      <button type="button" className="hvi-civic-fx hvi-lg-fx" aria-expanded={on} onClick={() => setOpen(on ? null : id)}>{x.text} // {on ? "CLOSE" : "BOX"}</button>
      {on && <BoxScore m={m} rosters={rosters} />}
    </>
  );
}

// ---- tennis, the Pit, the Cup -------------------------------------------------------------------------
function TennisTab({ block, h }) {
  const lg = block.leagues, T = (block.day - 1) * 24 + h;
  const run = useMemo(() => L.ladderRun(lg.tennis.seed, lg.season - 1, T), [lg.tennis.seed, lg.season, Math.floor(T * 4)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const recent = run.matches.slice(-10).reverse();
  const nm = (k) => up(run.info.get(k)?.name || k);
  const byAces = [...lg.tennis.seed].sort((a, b) => run.stats[b[0]].aces - run.stats[a[0]].aces).slice(0, 5);
  const byW = [...lg.tennis.seed].sort((a, b) => run.stats[b[0]].w - run.stats[a[0]].w || run.stats[a[0]].l - run.stats[b[0]].l).slice(0, 5);
  return (
    <>
      <div className="hvi-city-room-h">THE TENNIS LADDER // THE TENNIS CLUB</div>
      <pre className="hvi-civic-table" aria-label="The ladder">
        {`${pad("#", 3)}${pad("PLAYER", 19)}${pad("DISTRICT", 12)}${padL("W-L", 5)}${padL("ACES", 5)}\n`}
        {run.ladder.map((k, i) => { const x = run.info.get(k), s = run.stats[k]; return `${pad(String(i + 1), 3)}${pad(up(x.name).slice(0, 18), 19)}${pad(x.d ? teamShort(x.d) : "-", 12)}${padL(`${s.w}-${s.l}`, 5)}${padL(s.aces, 5)}\n`; }).join("")}
      </pre>
      <div className="hvi-civic-line">SEEDED EACH SEASON: THE TENNIS PLAYERS ON FILE, THEN THE CLUB'S REGULARS, THEN ATHLETES; CITIZENS ENTERED FROM MY FILE TAKE THE RUNGS BELOW. THE SHOW COURT'S MATCH COUNTS (LADDER NIGHT, WEDNESDAYS; THE CLUB CHAMPIONSHIP, SATURDAYS); ON LADDER NIGHT THREE CHALLENGES ARE PLAYED ON THE OUTSIDE COURTS, ONE OR TWO RUNGS UP. A WINNING CHALLENGER TAKES THE RUNG. THE TOP THREE EARN THEIR DISTRICTS 3, 2 AND 1 CUP POINTS.</div>
      <div className="hvi-city-room-h">LEADERS</div>
      <div className="hvi-lg-leaders">
        <div className="hvi-lg-lead"><div className="t">WINS</div>{byW.map((x, i) => <div key={x[0]} className="r"><span>{i + 1}. {up(x[1])}</span><b>{run.stats[x[0]].w}-{run.stats[x[0]].l}</b></div>)}</div>
        <div className="hvi-lg-lead"><div className="t">ACES</div>{byAces.map((x, i) => <div key={x[0]} className="r"><span>{i + 1}. {up(x[1])}</span><b>{run.stats[x[0]].aces}</b></div>)}</div>
      </div>
      <div className="hvi-city-room-h">RESULTS</div>
      {recent.length ? recent.map((m, i) => <div key={i} className="hvi-civic-fx">DAY {m.day} {m.show ? "SHOW COURT" : "CHALLENGE"} // {nm(m.win === 0 ? m.a : m.b)} OVER {nm(m.win === 0 ? m.b : m.a)}, {m.sets.map(s => (m.win === 0 ? `${s[0]}-${s[1]}` : `${s[1]}-${s[0]}`)).join(" ")}{m.moved ? " // TAKES THE RUNG" : ""}</div>)
        : <div className="hvi-city-note">NO LADDER MATCHES YET THIS SEASON. THE NETS ARE UP.</div>}
    </>
  );
}
function PitTab({ block, h }) {
  const lg = block.leagues, T = (block.day - 1) * 24 + h;
  const run = useMemo(() => L.pitRun(lg.season - 1, T), [lg.season, Math.floor(T * 4)]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="hvi-city-room-h">THE PIT RANKINGS // FRIDAY CARDS</div>
      <pre className="hvi-civic-table" aria-label="Pit rankings">
        {`${pad("#", 3)}${pad("FIGHTER", 15)}${pad("DISTRICT", 12)}${padL("W-L-D", 6)}${padL("STOP", 5)}${padL("PTS", 4)}\n`}
        {run.rank.map((x, i) => `${pad(String(i + 1), 3)}${pad(x.name.slice(0, 14), 15)}${pad(lg.pit.dist[x.key] ? teamShort(lg.pit.dist[x.key]) : "-", 12)}${padL(`${x.w}-${x.l}-${x.d}`, 6)}${padL(x.stops, 5)}${padL(x.pts, 4)}\n`).join("")}
      </pre>
      <div className="hvi-civic-line">RANKED BY THE SEASON'S FRIDAY CARDS: WIN 3, DRAW 1; FEWER LOSSES, THEN STOPPAGES (THE CORNER RETIRED THE OTHER FIGHTER, OR A SUBMISSION) BREAK A TIE. NOBODY IS HURT. GRIEVANCE BOUTS SETTLE GRIEVANCES, NOT RANKINGS. THE TOP THREE EARN THEIR DISTRICTS 3, 2 AND 1 CUP POINTS.</div>
      <div className="hvi-city-room-h">RESULTS</div>
      {run.bouts.length ? [...run.bouts].reverse().slice(0, 9).map(b => <div key={b.id} className="hvi-civic-fx">DAY {b.day} {b.ring === "ring" ? "THE RING" : "THE OCTAGON"} // {resultLine(b)}</div>)
        : <div className="hvi-city-note">NO CARD HAS BEEN FOUGHT THIS SEASON. FRIDAY IS COMING. IT ALWAYS IS.</div>}
    </>
  );
}
const BY = [["baseball", "BSB"], ["basketball", "BSK"], ["football", "FTB"], ["soccer", "SOC"], ["tennis", "TEN"], ["pit", "PIT"]];
function CupTab({ block, h, go }) {
  const lg = block.leagues, cup = cupTableAt(block, h), V = leaguesView(block);
  const today = L.SPORTS.flatMap(sp => V.all[sp].filter(m => m.day === block.day)).sort((a, b) => a.from - b.from || a.j - b.j);
  const decided = lg.day === lg.days && L.SPORTS.every(sp => decidedAt(block, sp, h).some(m => m.stage === "final"));
  return (
    <>
      <div className="hvi-city-room-h">THE DEPARTMENTAL CUP // {decided ? `WON BY ${teamName(cup[0].id)}` : `LEADER: ${teamShort(cup[0].id)}`}</div>
      <pre className="hvi-civic-table" aria-label="The Cup">
        {`${pad("POS", 4)}${pad("DISTRICT", 12)}${BY.map(([, l]) => padL(l, 4)).join("")}${padL("PTS", 5)}\n`}
        {cup.map((r, i) => `${pad(String(i + 1), 4)}${pad(teamShort(r.id), 12)}${BY.map(([k]) => padL(r.by[k], 4)).join("")}${padL(r.pts, 5)}\n`).join("")}
      </pre>
      <div className="hvi-civic-line">EACH LEAGUE PAYS BY POSITION: 10, 8, 6, 5, 4, 3, 2, 1, 0, 0 (THE PLAYOFFS DECIDE THE TOP; TEAMS LEVEL ON EVERYTHING SHARE). THE TENNIS LADDER AND THE PIT PAY 3, 2, 1 TO THEIR TOP THREE'S DISTRICTS. THE CUP IS DECIDED WHEN THE LAST FINAL WHISTLE GOES. THE CUP'S FORM MOVES EVERY DISTRICT'S MOOD.{lg.cup.last ? ` LAST SEASON'S CUP: ${teamName(lg.cup.last.champion)} (SEASON ${lg.cup.last.season}).` : ""}</div>
      <div className="hvi-city-room-h">TODAY ACROSS THE LEAGUES</div>
      {today.length ? today.map(m => { const x = matchText(m, h, block); return <div key={`${m.sport}.${m.k}.${m.j}`} className="hvi-civic-fx">{pad(L.SPORT[m.sport].name, 11)}{x.text}</div>; })
        : <div className="hvi-city-note">NO FIXTURES TODAY. THE GROUNDS ARE OPEN FOR SUPERVISED FUN.</div>}
      <div className="hvi-civic-line">{L.SPORTS.map(sp => <a key={sp} href={`#city/league/${sp}`} onClick={(e) => { e.preventDefault(); go(sp); }} className="hvi-lg-link">{L.SPORT[sp].name}</a>)}</div>
    </>
  );
}

// ---- a player's season line (the SubjectCard's extra) ------------------------------------------------
// -> the sport and team they play for this season, or the ladder / the Pit, with their line.
export function SeasonLine({ subject }) {
  const { block, h } = useCivic();
  const lg = block?.leagues;
  if (!lg || !subject) return null;
  const key = subject.slug || null;
  if (!key) return null;
  const out = [];
  for (const sp of L.SPORTS) for (const id of L.DIST) {
    const r = block.districts[id]?.teams?.[sp]?.roster;
    if (!r?.some(p => p[0] === key)) continue;
    const x = statsFor(block, sp, h)?.players[key];
    const cols = L.STAT_COLS[sp].filter(([k]) => x && x[k] != null && (x[k] !== 0 || k === "g"));
    out.push(`${L.sportTeamName(id, sp)} (${L.SPORT[sp].name}): ${x ? cols.map(([k, l]) => `${l} ${fmt(k, x[k])}`).join(", ") : "NO GAMES YET"}`);
  }
  const rung = lg.tennis.ladder.indexOf(key);
  if (rung >= 0) out.push(`THE TENNIS LADDER: RUNG ${rung + 1}`);
  const pr = lg.pit.rank.indexOf(key);
  if (pr >= 0) out.push(`THE PIT RANKINGS: ${ord(pr + 1)}`);
  if (!out.length) return null;
  return (
    <div className="hvi-civic-line hvi-lg-season" aria-label="Season line">
      <b>SEASON {lg.season} LINE.</b> {out.join(" // ")}. <a href="#city/league">THE LEAGUES</a>
    </div>
  );
}
