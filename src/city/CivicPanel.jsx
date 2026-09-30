// The civic record in the city (src/city/civic.js, docs/CITY_SPEC.md "The civic fold"): a
// district's MOOD, TEAM and COUNCIL seat, and the league's table, today's fixtures and recent
// results. Everything is read from the day's summary (planClient summaryOf(day).civic); the
// table moves with each final whistle (civic.js tableAt). Without the summary (the builder is
// behind, or the city is in legacy mode) the record says so.
import { useEffect, useState } from "react";
import { Frame, Meter, Disclosure } from "../ui/index.js";
import { pad, padL } from "../term.jsx";
import { DISTRICT, GAME_VENUE, clockAt, civicOf } from "./simApi.js";
import { moodWord, teamName, teamShort, tableAt, STAGE_NAME, hoopGames } from "./civic.js";

const FACTOR = { crowd: "CROWDING", tier: "TIER MIX", housing: "HOUSING", commute: "COMMUTE", league: "LEAGUE FORM", assembly: "THE LOT" };
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
        <span className="v"><b>{teamName(districtId)}</b> // {row ? `${ord(row.pos)} OF ${lg.table.length}` : "UNRANKED"} // {row?.pts ?? t.pts} PTS // {row ? `${row.w}-${row.d}-${row.l}` : ""}{row?.form ? ` // FORM ${row.form}` : ""}{onLeague && <> // <a href="#city/league" onClick={onLeague}>TABLE</a></>}</span>
        <span className="k">ROSTER</span>
        <span className="v dim">{t.roster.length ? t.roster.map(p => p[1]).join(", ") : "NOBODY FIT TO FIELD. THE DEPARTMENT FIELDS A CONE."} (RATING {t.rating})</span>
        <span className="k">COUNCIL</span>
        <span className="v">{x.seat.holder ? x.seat.holder : <b className="warn">SEAT VACANT. ELECTIONS PENDING.</b>} APPROVAL {sign(x.seat.approval)}.</span>
        {x.seat.acts.length > 0 && <>
          <span className="k">ACTS</span>
          <span className="v">{x.seat.acts.map(([s, day, w]) => `ACT 1 (ASSEMBLY SESSION ${s.slice(1)}, DAY ${day}): ${ACT[w] || w}`).join(" // ")}</span>
        </>}
      </div>
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
      <div className="hvi-city-note" style={{ marginTop: "var(--s3)" }}>ONE TEAM PER DISTRICT, DRAFTED FROM ITS WORKFORCE AT THE START OF EACH SEASON. ATHLETES FIRST. WIN 3, DRAW 1. TOP FOUR PLAY OFF. RESULTS ARE FINAL. SO ARE YOU.</div>
    </>
  );
  if (full) return <Frame title={title} meta={meta} className="hvi-civic">{body}</Frame>;
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
  if (here && block.districts[here]) {
    out.push(say(here));
    const t = block.districts[here].team;
    out.push(`${teamName(here)} STAND ${ord(t.pos)} IN THE DEPARTMENTAL LEAGUE ON ${t.pts} POINTS. THE COUNCIL SEAT IS VACANT. ELECTIONS ARE PENDING.`);
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
