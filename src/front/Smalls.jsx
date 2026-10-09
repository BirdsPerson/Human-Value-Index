// The desk's three small windows, one chunk (they share the paper's fetch):
//   TODAY'S PAPER   THE DAILY COMPLIANCE's lead and two stories (/api/paper)
//   TOURNAMENTS     what is open now and who leads it (/api/tournament)
//   THE LEAGUES     the Departmental Cup's table and the latest score in each league (the paper's sports page)
// Also the data THE SET's channels read (TheSet.jsx). Each fetch once per page view, shared.
import { useEffect, useState } from "react";
import { Frame } from "../ui/index.js";
import { useCycle, Cyc } from "./cycle.jsx";

const once = new Map();
export const getOnce = (url) => {
  if (!once.has(url)) once.set(url, fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return once.get(url);
};
export const paperNow = () => getOnce("/api/paper").then(j => j?.edition || null);
export const cupsNow = () => getOnce("/api/tournament").then(j => j?.events || null);
function useData(load) {
  const [d, setD] = useState(undefined);
  useEffect(() => { let off = false; load().then(v => { if (!off) setD(v || null); }); return () => { off = true; }; }, [load]);
  return d;
}
const Waiting = ({ d, what }) => <p className="fr-dim">{d === undefined ? "…" : `${what} IS NOT AVAILABLE. THE DEPARTMENT REGRETS NOTHING.`}</p>;

// each widget: its data here, one prepared layout per size in VIEWS_<id> (S cycles or reads densely, M, T tall, L richer)
const VIEWS_paper = {
  // S: the front page's headlines in turn, the lead first
  S: function PaperS({ lead, rest }) {
    const all = [lead, ...rest], c = useCycle(all.length), h = all[c.i];
    return <Cyc c={c} what="headline"><a className="fr-paper-lead s" href={h.href || "#paper"}><span className="h">{h.text}</span>{h.deck && <span className="dk">{h.deck}</span>}</a></Cyc>;
  },
  T: ({ lead, rest }) => (
    <>
      <a className="fr-paper-lead" href="#paper"><span className="h">{lead.text}</span>{lead.deck && <span className="dk">{lead.deck}</span>}</a>
      <ul className="fr-list">{rest.map((s, i) => <li key={i}><a href={s.href || "#paper"}>{s.text}</a></li>)}</ul>
    </>
  ),
  // M: the lead and its deck, the next two stories under it (the lead opens the paper)
  M: ({ lead, rest }) => (
    <>
      <a className="fr-paper-lead" href="#paper"><span className="h">{lead.text}</span>{lead.deck && <span className="dk">{lead.deck}</span>}</a>
      <ul className="fr-list">{rest.map((s, i) => <li key={i}><a href={s.href || "#paper"}>{s.text}</a></li>)}</ul>
    </>
  ),
  L: ({ lead, rest }) => (
    <>
      <a className="fr-paper-lead" href="#paper"><span className="h">{lead.text}</span>{lead.deck && <span className="dk">{lead.deck}</span>}</a>
      <ul className="fr-list">{rest.map((s, i) => <li key={i}><a href={s.href || "#paper"}>{s.text}</a></li>)}</ul>
      <a className="fr-go" href="#paper">READ THE DAILY COMPLIANCE ›</a>
    </>
  ),
};
export function PaperWidget({ size = "L" }) {
  const e = useData(paperNow);
  const lead = e?.front?.lead, rest = (e?.front?.stories || []).slice(0, size === "S" || size === "T" ? 4 : 2);
  const V = VIEWS_paper[size] || VIEWS_paper.L;
  return (
    <Frame title="TODAY'S PAPER" meta={e && size !== "S" ? `NO. ${e.no}` : ""} tone="var(--eb-amber)" className={`fr-paper v-${size}`}>
      {lead ? <V lead={lead} rest={rest} /> : <Waiting d={e} what="THE PAPER" />}
    </Frame>
  );
}

export const openCups = (evs, now = Date.now()) => (evs || []).filter(e => e.status === "open" && e.closes > now);
const leader = (e) => e.leaders?.open?.[0] || e.leaders?.assisted?.[0] || null;
const score = (e, l) => (l?.total == null ? "" : e.game === "golf" && l.par != null ? ` (${l.total - l.par === 0 ? "E" : `${l.total - l.par > 0 ? "+" : "−"}${Math.abs(l.total - l.par)}`})` : e.game === "fish" ? ` (${(l.total / 100).toFixed(2)} LB)` : ` (${l.total})`);
const cupLine = (e) => {
  const l = leader(e), hrs = Math.max(0, Math.round((e.closes - Date.now()) / 3600000));
  return <li key={e.id}><a href={e.href}><span className="h">{e.name}</span><span className="dk">{[e.venue, l ? `LEADS: ${String(l.holder || "A FILE").toUpperCase()}${score(e, l)}` : e.entrants ? `${e.entrants} ENTERED` : "NO CARDS YET", `CLOSES IN ${hrs}H`].filter(Boolean).join(" · ")}</span></a></li>;
};
// the last event finished with a winner on the board: what the window shows under the open ones
export const lastWon = (evs) => (evs || []).filter(e => e.status === "closed" && leader(e)).sort((a, b) => b.closes - a.closes)[0] || null;
const wonLine = (e) => {
  const l = leader(e);
  return <li key={e.id} className="won"><a href={e.href}><span className="h">LAST: {e.name}</span><span className="dk">WON BY {String(l.holder || "A FILE").toUpperCase()}{score(e, l)}{e.entrants ? ` · ${e.entrants} ENTERED` : ""}</span></a></li>;
};
const VIEWS_cups = {
  // S: each open event in turn: its name, who leads it, when it closes
  S: function CupsS({ open, all }) {
    const c = useCycle(open.length), e = open[c.i];
    if (!e) return <a className="fr-glance" href="#play"><span className="big">0 OPEN</span><span className="ln1 two"><span className="n">PRACTICE IS PERMITTED</span></span></a>;
    const l = leader(e), hrs = Math.max(0, Math.round((e.closes - Date.now()) / 3600000));
    return (
      <Cyc c={c} what="tournament">
        <a className="fr-glance" href={e.href || "#play"}>
          <span className="ln1 two"><span className="n">{e.name}</span></span>
          <span className="big">{l ? String(l.holder || "A FILE").toUpperCase().replace(/^SUBJECT /, "") : "OPEN"}</span>
          <span className="ln2">{l ? `LEADS${l.total != null ? ` (${l.total})` : ""} · ` : "NO CARDS YET · "}CLOSES IN {hrs}H</span>
        </a>
      </Cyc>
    );
  },
  T: ({ open, won }) => <CupList open={open} won={won} n={3} />,
  M: ({ open, won }) => <CupList open={open} won={open.length < 2 ? won : null} n={2} />,
  L: ({ open, won }) => <><CupList open={open} won={won} n={4} /><a className="fr-go" href="#play">ALL THE GAMES ›</a></>,
};
// the open events, then the last one won; nothing open and nothing won: say so
function CupList({ open, won, n }) {
  if (!open.length && !won) return <p className="fr-dim">NOTHING OPEN THIS HOUR. PRACTICE IS PERMITTED.</p>;
  return <ul className="fr-list">{open.slice(0, n).map(cupLine)}{won && wonLine(won)}</ul>;
}
export function CupsWidget({ size = "L" }) {
  const evs = useData(cupsNow);
  const open = openCups(evs), won = lastWon(evs);
  const V = VIEWS_cups[size] || VIEWS_cups.L;
  return (
    <Frame title="TOURNAMENTS" meta={evs ? `${open.length} OPEN` : ""} tone="var(--accent)" className={`fr-cups v-${size}`}>
      {evs === undefined ? <Waiting d={evs} what="THE BOARD" /> : <V open={open} won={won} all={open.length} />}
    </Frame>
  );
}

// the Cup's table; the whole table opens the full one
const table = (rows, href = "#city/league/cup") => (
  <a className="fr-tbl-link" href={href} aria-label={`The Departmental Cup: ${rows.map(r => `${r.pos}, ${r.team}, ${r.pts} points`).join("; ")}. Open the full table.`}>
    <table className="fr-table" aria-hidden="true">
      <thead><tr><th scope="col">CUP</th><th scope="col">TEAM</th><th scope="col">PTS</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.pos}><td>{r.pos}</td><td>{r.team.replace(/^THE /, "")}</td><td>{r.pts}</td></tr>)}</tbody>
    </table>
  </a>
);

// THE LEAGUES (was LEAGUE TABLE, the Cup alone; 2026-10-09 it carries the scores too): the Departmental Cup's
// table beside the latest result in each league, and on the large window the Pit and the mountain's race. All
// of it is the paper's sports page (/api/paper), each line a link to its league.
export const latestOf = (sp) => (sp?.leagues || []).filter(l => l.results?.[0]).map(l => ({ sport: l.name, text: l.results[0], href: l.href || "#city/league" }));
const Latest = ({ rows }) => (
  <ul className="fr-sc">{rows.map(r => <li key={r.sport}><a href={r.href}><span className="k">{r.sport}</span><span className="tx">{r.text}</span></a></li>)}</ul>
);
const VIEWS_league = {
  // S: a dense readout, the top five on five lines
  S: ({ cup }) => (
    <a className="fr-dense" href={cup.href || "#city/league/cup"} aria-label={`The Departmental Cup: ${cup.rows.slice(0, 5).map(r => `${r.pos}, ${r.team}, ${r.pts} points`).join("; ")}. Open the full table.`}>
      <ol aria-hidden="true">{cup.rows.slice(0, 5).map(r => <li key={r.pos}><span className="k">{r.pos}</span><span className="n">{r.team.replace(/^THE /, "")}</span><span className="v">{r.pts}</span></li>)}</ol>
    </a>
  ),
  // T: the Cup's top five over the latest score in each league
  T: ({ cup, latest }) => <>{table(cup.rows.slice(0, 5), cup.href)}<Latest rows={latest} /></>,
  // M: the Cup's top three beside the latest scores
  M: ({ cup, latest }) => <div className="fr-lg2">{table(cup.rows.slice(0, 3), cup.href)}<Latest rows={latest} /></div>,
  // L: the table beside the scores; under them the Pit's last bout and next main event, and the last race
  L: ({ cup, latest, sp }) => {
    const pit = sp?.pit, race = sp?.race?.last, ten = sp?.tennis;
    const more = [
      pit?.results?.[0] && { sport: "THE PIT", text: `${pit.results[0]}${pit.next?.length ? ` NEXT: ${pit.next[pit.next.length - 1].replace(/^MAIN EVENT: /, "")}.` : ""}`, href: pit.href || "#city/league/pit" },
      ten?.ladder?.length && { sport: "TENNIS", text: `LADDER: ${ten.ladder.slice(0, 3).map(r => `${r.rung}. ${r.name}`).join(", ")}.${ten.results?.[0] ? ` LAST: ${ten.results[0]}` : ""}`, href: ten.href || "#city/league/tennis" },
      race?.podium?.[0] && { sport: "SLOPES", text: `${race.name}: ${race.podium.map(p => `${p.place}. ${p.name} ${p.time}`).join(", ")}.`, href: sp.race.href || "#heights" },
    ].filter(Boolean);
    return (
      <>
        <div className="fr-lg2">{table(cup.rows.slice(0, 5), cup.href)}<Latest rows={latest} /></div>
        {more.length > 0 && <Latest rows={more} />}
      </>
    );
  },
};
export function LeagueWidget({ size = "L" }) {
  const e = useData(paperNow);
  const sp = e?.sports, cup = sp?.cup, latest = latestOf(sp);
  const V = VIEWS_league[size] || VIEWS_league.L;
  return (
    <Frame title={size === "S" ? "THE CUP" : "THE LEAGUES"} meta={size === "S" ? "" : `CUP · ${sp?.season ? `SEASON ${sp.season}` : "TODAY"}`} tone="var(--eb-cyan)" className={`fr-league v-${size}`}>
      {cup?.rows?.length ? <V cup={cup} latest={latest} sp={sp} /> : <Waiting d={e} what="THE TABLE" />}
    </Frame>
  );
}
