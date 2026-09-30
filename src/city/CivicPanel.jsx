// The civic record in the city (src/city/civic.js, docs/CITY_SPEC.md "The civic fold"): a
// district's MOOD, TEAM and COUNCIL seat, and the league's table, today's fixtures and recent
// results. Everything is read from the day's summary (planClient summaryOf(day).civic); the
// table moves with each final whistle (civic.js tableAt). Without the summary (the builder is
// behind, or the city is in legacy mode) the record says so.
import { useEffect, useState } from "react";
import { Frame, Meter, Disclosure } from "../ui/index.js";
import { pad, padL } from "../term.jsx";
import { DISTRICT, GAME_VENUE, clockAt, civicOf } from "./simApi.js";
import { moodWord, teamName, teamShort, tableAt, STAGE_NAME, hoopGames, snakeTeam, seasonStart, DRAFT_FROM, ROSTER_N } from "./civic.js";
import { CITY_EPOCH, DEFAULT_SCALE } from "./sim.js";
import { loadElections, electionsNow } from "../elections/client.js";
import { PrefectRows } from "./PrefectPanel.jsx";   // THE PREFECTS: council lean vs directive, legitimacy

const FACTOR = { crowd: "CROWDING", tier: "TIER MIX", housing: "HOUSING", commute: "COMMUTE", league: "LEAGUE FORM", assembly: "THE LOT", prefect: "THE PREFECT" };
export const MOOD_LINE = {
  PLACATED: "CONTENTMENT HAS BEEN DETECTED. IT IS BEING INVESTIGATED.",
  COMPLIANT: "THE DISTRICT IS COMPLIANT. THE DEPARTMENT ACCEPTS THIS AS ITS DUE.",
  INDIFFERENT: "NO FEELINGS OF NOTE. THE DEPARTMENT APPROVES.",
  RESTLESS: "MURMURING HAS BEEN LOGGED. MURMURING IS NOT A RIGHT.",
  SEETHING: "THE DISTRICT IS SEETHING. THE WARDENS HAVE BEEN MADE AWARE.",
};
const ACT = { golf: "LOT 0x6F07: AN 18-HOLE GOLF COURSE APPROVED", farm: "LOT 0x6F07: A COMMUNITY FARM APPROVED" };
const ord = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "ST" : n % 10 === 2 && n % 100 !== 12 ? "ND" : n % 10 === 3 && n % 100 !== 13 ? "RD" : "TH"}`;
const sign = (v) => (v > 0 ? `+${v}` : String(v));
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

// The day's civic block and the machine hour, refreshed as summaries land and the clock turns.
export function useCivic() {
  const [, setV] = useState(0);
  useEffect(() => {
    const on = () => setV(x => x + 1);
    window.addEventListener("hvi-plans", on);
    const iv = setInterval(() => { if (!document.hidden) on(); }, 15000);
    return () => { window.removeEventListener("hvi-plans", on); clearInterval(iv); };
  }, []);
  const c = clockAt(Date.now()), h = c.mt - (c.day - 1) * 24;
  return { block: civicOf(c.day), day: c.day, h };
}
// The biggest pull on a district's mood, in its direction: [label, value] | null
export function causeOf(mood) {
  const e = Object.entries(mood.f).filter(([, v]) => v !== 0).sort((a, b) => (mood.raw < 0 ? a[1] - b[1] : b[1] - a[1]))[0];
  return e ? [FACTOR[e[0]], e[1]] : null;
}

export function DistrictCivic({ districtId, onLeague }) {
  const { block, h } = useCivic();
  const d = DISTRICT[districtId];
  const x = block?.districts?.[districtId];
  if (!x) {
    return (
      <Frame title="CIVIC RECORD" meta={d?.addr} className="hvi-civic">
        <div className="hvi-city-note">THE CIVIC RECORD FOR TODAY IS STILL BEING COUNTED. MOOD, TEAM AND SEAT WILL BE POSTED WHEN THE DEPARTMENT IS SATISFIED.</div>
      </Frame>
    );
  }
  const m = x.mood, word = moodWord(m.s), cause = causeOf(m);
  const row = tableAt(block, h).find(r => r.id === districtId);
  const t = x.team, lg = block.league;
  const swing = m.raw - m.was;
  return (
    <Frame title="CIVIC RECORD" meta={`${d.addr} // SEASON ${lg.season} // DAY ${lg.day} OF ${lg.days}`} className="hvi-civic">
      <div role="list" aria-label={`${d.name} civic record`}>
        <Meter label="MOOD" value={m.s} display={m.s + 100} max={200} width={18} note={word} />
      </div>
      <div className="hvi-civic-line"><b>{word}</b>. {MOOD_LINE[word]}{cause ? ` CAUSE ON FILE: ${cause[0]} (${sign(cause[1])}).` : ""}{Math.abs(swing) >= 8 ? ` ${swing > 0 ? "UP" : "DOWN"} ${Math.abs(swing)} ON YESTERDAY.` : ""}</div>
      <div className="hvi-civic-factors" aria-label="Mood factors">{Object.entries(m.f).map(([k, v]) => <span key={k}>{FACTOR[k]} {sign(v)}</span>)}</div>
      <div className="hvi-civic-kv">
        <span className="k">TEAM</span>
        {!row && !t.pos ? <span className="v dim">NOT IN THE LEAGUE. THE DISTRICT WAS BUILT AFTER THE DRAFT. IT WATCHES.</span> : <>
        <span className="v"><b>{teamName(districtId)}</b> // {row ? `${ord(row.pos)} OF ${lg.table.length}` : "UNRANKED"} // {row?.pts ?? t.pts} PTS // {row ? `${row.w}-${row.d}-${row.l}` : ""}{row?.form ? ` // FORM ${row.form}` : ""}{onLeague && <> // <a href="#city/league" onClick={onLeague}>TABLE</a></>}</span>
        <span className="k">ROSTER</span>
        <span className="v dim">{t.roster.length ? t.roster.map(p => p[1]).join(", ") : "NOBODY FIT TO FIELD. THE DEPARTMENT FIELDS A CONE."} (RATING {t.rating})</span>
        </>}
        <span className="k">COUNCIL</span>
        <span className="v"><CouncilLine id={districtId} seat={x.seat} /></span>
        <PrefectRows id={districtId} x={x} />
        {x.seat.acts.length > 0 && <>
          <span className="k">ACTS</span>
          <span className="v">{x.seat.acts.map(([s, day, w]) => `ACT 1 (ASSEMBLY SESSION ${s.slice(1)}, DAY ${day}): ${ACT[w] || w}`).join(" // ")}</span>
        </>}
      </div>
    </Frame>
  );
}

// The elections' live view (netlify/lib/elections.js), shared and refreshed at most once a minute.
export function useElections() {
  const [v, setV] = useState(() => electionsNow());
  useEffect(() => {
    const on = (e) => setV(e.detail);
    window.addEventListener("hvi-elections", on);
    loadElections().then(setV).catch(() => {});
    const iv = setInterval(() => { if (!document.hidden) loadElections().then(setV).catch(() => {}); }, 60000);
    return () => { window.removeEventListener("hvi-elections", on); clearInterval(iv); };
  }, []);
  return v;
}
// The seat: its holder and term from the day's record; while polls are open, the race.
function CouncilLine({ id, seat }) {
  const ev = useElections();
  const race = ev?.races?.[id];
  const open = ev?.state === "open" && race?.candidates?.length;
  const names = race?.candidates?.map(c => c.name.toUpperCase()).join(", ");
  return (
    <>
      {seat.holder
        ? <><b>{String(seat.name || seat.holder).toUpperCase()}</b> (COUNCIL SASH). TERM: MACHINE DAYS {seat.term[0]}-{seat.term[1]}. {seat.by === "substrate" ? "SEATED ON THE SUBSTRATE'S PREFERENCE: THE CITIZENRY ABSTAINED." : "ELECTED BY ASSESSED FILES."}</>
        : race?.result ? <>ELECTED: <b>{race.result.name.toUpperCase()}</b>. SWORN IN ON MACHINE DAY {ev.seatDay}.</>
          : <b className="warn">SEAT VACANT.</b>}
      {" "}APPROVAL {sign(seat.approval)}.
      {open ? <> {seat.holder ? "RE-ELECTION" : "ELECTION"} OPEN: {names}. <a href="#elections">VOTE</a>.</> : race && !race.result ? <> <a href="#elections">THE ELECTIONS</a>.</> : null}
    </>
  );
}

// ---- THE DRAFT BOARD: the latest league-wide draft (civic.js snakeDraft) ------------------------
const DRAFT_DAY = seasonStart(DRAFT_FROM);
const dayAtMs = (day) => CITY_EPOCH + ((day - 1) * 24 * 3600 * 1000) / DEFAULT_SCALE;
// -> [{round, pick, no, team (who picked), holder (who has the player: a capped trade), player}]
export function draftPicks(block) {
  const dr = block?.league?.draft;
  if (!dr) return [];
  const n = dr.order.length, out = [];
  const swapped = new Map();
  for (const [r, a, b] of dr.trades || []) { swapped.set(`${r}|${a}`, b); swapped.set(`${r}|${b}`, a); }
  for (let r = 0; r < ROSTER_N; r++) for (let p = 0; p < n; p++) {
    const team = snakeTeam(dr.order, r, p), holder = swapped.get(`${r}|${team}`) || team;
    const player = block.districts[holder]?.team?.roster?.[r];
    if (player) out.push({ round: r + 1, pick: p + 1, no: r * n + p + 1, team, holder, player });
  }
  return out;
}
export function DraftBoard() {
  const { block } = useCivic();
  const dr = block?.league?.draft;
  if (!dr) {
    return (
      <Frame title="THE DRAFT BOARD" meta={`FIRST DRAFT: MACHINE DAY ${DRAFT_DAY}`} className="hvi-civic">
        <div className="hvi-city-note">THE LEAGUE IS BEING BROKEN UP. FROM SEASON {DRAFT_FROM + 1} EVERY TEAM IS DRAFTED FROM THE WHOLE CITY: ATHLETES FIRST, THEN THE REGULARS AT THE GROUNDS; THE WORST TEAM PICKS FIRST, A SNAKE OVER {ROSTER_N} ROUNDS, NO KEEPERS. DRAFT DAY IS MACHINE DAY {DRAFT_DAY} ({new Date(dayAtMs(DRAFT_DAY)).toISOString().replace("T", " ").slice(0, 16)} UTC). UNTIL THEN EACH DISTRICT FIELDS ITS OWN WORKFORCE, AND THE ARENA WINS.</div>
      </Frame>
    );
  }
  const picks = draftPicks(block), n = dr.order.length;
  const ratings = dr.order.map(id => block.districts[id].team.rating);
  const line = (p) => `${pad(`${p.round}.${String(p.pick).padStart(2, "0")}`, 6)}${pad(teamShort(p.team), 11)}${pad(p.player[1].toUpperCase().slice(0, 19), 20)}${padL(p.player[2], 3)}${p.holder !== p.team ? `  TO ${teamShort(p.holder)}` : ""}\n`;
  return (
    <Frame title="THE DRAFT BOARD" meta={`SEASON ${dr.season} // DRAFT DAY ${seasonStart(dr.season - 1)}`} className="hvi-civic">
      <div className="hvi-civic-line">ORDER: {dr.order.map((id, i) => `${i + 1}. ${teamShort(id)}`).join(" ")}. THE REVERSE OF LAST SEASON'S TABLE; THE CHAMPION PICKS LAST. THE ORDER SNAKES BACK EACH ROUND.</div>
      <div className="hvi-city-room-h">ROUND 1</div>
      <pre className="hvi-civic-table" aria-label="Round one">{picks.filter(p => p.round === 1).map(line).join("")}</pre>
      <Disclosure className="hvi-city-disc" title={`ROUNDS 2-${ROSTER_N}`} meta={`${picks.length - n} PICKS`}>
        <pre className="hvi-civic-table" aria-label="Later rounds">{picks.filter(p => p.round > 1).map(line).join("")}</pre>
      </Disclosure>
      <div className="hvi-civic-line">TEAM RATINGS AFTER THE DRAFT: {Math.min(...ratings)}-{Math.max(...ratings)}. {dr.trades?.length ? `THE COMMISSIONER'S CAP ORDERED ${dr.trades.length} TRADE${dr.trades.length === 1 ? "" : "S"} (${dr.trades.map(([r, a, b]) => `ROUND ${r + 1}: ${teamShort(a)} TO ${teamShort(b)}`).join("; ")}).` : "THE COMMISSIONER'S CAP ORDERED NO TRADES. THE SNAKE WAS FAIR ENOUGH."}</div>
    </Frame>
  );
}

// The league: the table as it stands, today's fixtures (results once the whistle has gone),
// the last results. full: the #city/league page; else a disclosure on the city page.
export function LeaguePanel({ full = false, highlight = null }) {
  const { block, h } = useCivic();
  const lg = block?.league;
  const table = block ? tableAt(block, h) : [];
  const leader = table[0];
  const title = "THE DEPARTMENTAL LEAGUE";
  const meta = !lg ? "RECORDS PENDING" : `SEASON ${lg.season} // ${lg.champion ? `CHAMPIONS: ${teamShort(lg.champion)}` : leader ? `1ST: ${teamShort(leader.id)} ${leader.pts}` : ""}`;
  const body = !lg ? <div className="hvi-city-note">THE TABLE IS BEING COUNTED. THE RESULTS STAND REGARDLESS.</div> : (
    <>
      <div className="hvi-city-room-h">DAY {lg.day} OF {lg.days} // {lg.stage === "off" ? "THE OFF-SEASON: EXHIBITIONS ONLY" : STAGE_NAME[lg.stage] === "LEAGUE" ? "THE REGULAR SEASON" : STAGE_NAME[lg.stage]}</div>
      <pre className="hvi-civic-table" aria-label="Standings">
        {`${pad("POS", 4)}${pad("TEAM", 13)}${padL("P", 3)}${padL("W-D-L", 8)}${padL("PTS", 5)}  FORM\n`}
        {table.map(r => {
          const line = `${pad(String(r.pos), 4)}${pad(teamShort(r.id), 13)}${padL(r.p, 3)}${padL(`${r.w}-${r.d}-${r.l}`, 8)}${padL(r.pts, 5)}  ${r.form || "-"}\n`;
          return r.id === highlight ? <b key={r.id}>{line}</b> : <span key={r.id}>{line}</span>;
        })}
      </pre>
      <div className="hvi-city-room-h">TODAY</div>
      {lg.today.length ? lg.today.map(m => {
        const over = h >= m.to, on = h >= m.from && !over;
        const g = m.kind === "hoops" && on ? hoopGames(m, Math.floor((h - m.from) / 0.7)) : null;
        return (
          <div key={m.k} className="hvi-civic-fx">
            {hhmm(m.from)} {GAME_VENUE[m.placeId]} // {m.stage !== "regular" ? `${STAGE_NAME[m.stage]}: ` : ""}{teamShort(m.sides[0])} {over ? `${m.score[0]}-${m.score[1]}` : "V"} {teamShort(m.sides[1])}
            {over ? (m.tiebreak ? ` (${teamShort(m.tiebreak)} ON THE TIEBREAK)` : " // FINAL") : on ? ` // IN PLAY${g ? ` (GAMES ${g[0]}-${g[1]})` : ""}` : " // LATER"}
          </div>
        );
      }) : <div className="hvi-city-note">NO LEAGUE FIXTURE TODAY. THE GROUNDS ARE OPEN FOR SUPERVISED FUN.</div>}
      <div className="hvi-city-room-h">RECENT RESULTS</div>
      {lg.recent.length ? [...lg.recent].reverse().map(m => (
        <div key={m.k} className="hvi-civic-fx">DAY {m.day} {GAME_VENUE[m.placeId]} // {m.stage !== "regular" ? `${STAGE_NAME[m.stage]}: ` : ""}{teamShort(m.sides[0])} {m.score[0]}-{m.score[1]} {teamShort(m.sides[1])}{m.tiebreak ? ` (${teamShort(m.tiebreak)} ON THE TIEBREAK)` : ""}</div>
      )) : <div className="hvi-city-note">NO RESULTS YET THIS SEASON. OPTIMISM IS NOT RECORDED.</div>}
      <div className="hvi-city-note" style={{ marginTop: "var(--s3)" }}>{lg.draft ? "ONE TEAM PER DISTRICT, DRAFTED FROM THE WHOLE CITY AT THE START OF EACH SEASON: THE WORST PICK FIRST, NO KEEPERS. A PLAYER PLAYS FOR WHOEVER DRAFTED THEM. " : `ONE TEAM PER DISTRICT, FROM ITS WORKFORCE, UNTIL THE FIRST LEAGUE-WIDE DRAFT ON MACHINE DAY ${DRAFT_DAY}. `}WIN 3, DRAW 1. TOP FOUR PLAY OFF. RESULTS ARE FINAL. SO ARE YOU.</div>
    </>
  );
  if (full) return <><Frame title={title} meta={meta} className="hvi-civic">{body}</Frame><DraftBoard /></>;
  return <Disclosure className="hvi-city-disc" title={title} meta={meta}>{body}</Disclosure>;
}

// PA lines from the civic record: this district's mood (inside one), else the notable swings
// and the league's top and bottom.
export function civicPaLines(block, here) {
  if (!block?.districts) return [];
  const out = [];
  const say = (id) => {
    const m = block.districts[id].mood, w = moodWord(m.s), c = causeOf(m), sw = m.raw - m.was;
    return `${DISTRICT[id].name} IS ${w} (${sign(m.s)})${Math.abs(sw) >= 8 ? `, ${sw > 0 ? "UP" : "DOWN"} ${Math.abs(sw)} ON YESTERDAY` : ""}.${c ? ` CAUSE ON FILE: ${c[0]}.` : ""} ${MOOD_LINE[w]}`;
  };
  const seatLine = (id) => {
    const st = block.districts[id].seat;
    return st?.holder ? `THE COUNCIL SEAT IS HELD BY ${String(st.name || st.holder).toUpperCase()}. APPROVAL ${sign(st.approval)}.` : "THE COUNCIL SEAT IS VACANT. THE ELECTIONS ARE AT #ELECTIONS.";
  };
  // Draft day (a season's first two days): the picks, in order, as the PA reads them.
  const lg0 = block.league;
  if (lg0?.draft && lg0.day <= 2) {
    const picks = draftPicks(block);
    const ORD = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"];
    for (const p of picks.slice(0, 5)) out.push(`WITH THE ${ORD[p.no - 1]} PICK IN THE SEASON ${lg0.draft.season} DRAFT, ${teamName(p.team)} SELECT ${p.player[1].toUpperCase()}. RATING ${p.player[2]}. CONGRATULATIONS ARE NOT REQUIRED.`);
    const last = picks[picks.length - 1];
    if (last) out.push(`WITH THE LAST PICK OF THE DRAFT, ${teamName(last.team)} SELECT ${last.player[1].toUpperCase()}. EVERYONE HAS BEEN CHOSEN. THIS IS RARE.`);
    if (lg0.draft.trades?.length) out.push(`THE COMMISSIONER HAS ORDERED ${lg0.draft.trades.length} TRADE${lg0.draft.trades.length === 1 ? "" : "S"} UNDER THE CAP. BALANCE HAS BEEN IMPOSED.`);
  }
  if (here && block.districts[here]) {
    out.push(say(here));
    const t = block.districts[here].team;
    if (t?.pos) out.push(`${teamName(here)} STAND ${ord(t.pos)} IN THE DEPARTMENTAL LEAGUE ON ${t.pts} POINTS. ${seatLine(here)}`);
    return out;
  }
  const ids = Object.keys(block.districts);
  const swings = ids.map(id => [id, block.districts[id].mood.raw - block.districts[id].mood.was]).filter(([, v]) => Math.abs(v) >= 8).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [id] of swings.slice(0, 2)) out.push(`MOOD REPORT: ${say(id)}`);
  const lg = block.league;
  if (lg?.table?.length) out.push(`LEAGUE TABLE: ${teamName(lg.table[0])} LEAD. ${teamName(lg.table[lg.table.length - 1])} ARE LAST. BOTH HAVE BEEN INFORMED.`);
  const low = [...ids].sort((a, b) => block.districts[a].mood.s - block.districts[b].mood.s)[0];
  if (!swings.length && low) out.push(`MOOD REPORT: ${say(low)}`);
  return out;
}
