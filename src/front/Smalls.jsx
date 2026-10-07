// The desk's three small windows, one chunk (they share the paper's fetch):
//   TODAY'S PAPER   THE DAILY COMPLIANCE's lead and two stories (/api/paper)
//   TOURNAMENTS     what is open now and who leads it (/api/tournament)
//   LEAGUE TABLE    the Departmental Cup's top five (the paper's sports page)
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
  M: ({ lead }) => (
    <>
      <a className="fr-paper-lead" href="#paper"><span className="h">{lead.text}</span>{lead.deck && <span className="dk">{lead.deck}</span>}</a>
      <a className="fr-go" href="#paper">READ THE DAILY COMPLIANCE ›</a>
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
const cupLine = (e) => {
  const l = leader(e), hrs = Math.max(0, Math.round((e.closes - Date.now()) / 3600000));
  return <li key={e.id}><a href={e.href}><span className="h">{e.name}</span><span className="dk">{l ? `LEADS: ${String(l.holder || "A FILE").toUpperCase()}${l.total != null ? ` (${l.total})` : ""}.` : "NO CARDS IN YET. THE BOARD IS YOURS TO TAKE."} CLOSES IN {hrs}H.</span></a></li>;
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
  T: ({ open }) => (open.length ? <ul className="fr-list">{open.slice(0, 4).map(cupLine)}</ul> : <p className="fr-dim">NOTHING OPEN THIS HOUR. PRACTICE IS PERMITTED.</p>),
  M: ({ open }) => (open.length ? <ul className="fr-list">{open.slice(0, 2).map(cupLine)}</ul> : <p className="fr-dim">NOTHING OPEN THIS HOUR. PRACTICE IS PERMITTED.</p>),
  L: ({ open }) => (
    <>
      {open.length ? <ul className="fr-list">{open.slice(0, 4).map(cupLine)}</ul> : <p className="fr-dim">NOTHING OPEN THIS HOUR. PRACTICE IS PERMITTED.</p>}
      <a className="fr-go" href="#play">ALL THE GAMES ›</a>
    </>
  ),
};
export function CupsWidget({ size = "L" }) {
  const evs = useData(cupsNow);
  const open = openCups(evs);
  const V = VIEWS_cups[size] || VIEWS_cups.L;
  return (
    <Frame title="TOURNAMENTS" meta={evs ? `${open.length} OPEN` : ""} tone="var(--accent)" className={`fr-cups v-${size}`}>
      {evs === undefined ? <Waiting d={evs} what="THE BOARD" /> : <V open={open} all={open.length} />}
    </Frame>
  );
}

const table = (rows) => (
  <table className="fr-table">
    <thead><tr><th scope="col">POS</th><th scope="col">TEAM</th><th scope="col">PTS</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.pos}><td>{r.pos}</td><td>{r.team}</td><td>{r.pts}</td></tr>)}</tbody>
  </table>
);
const VIEWS_league = {
  // S: a dense readout, the top five on five lines
  S: ({ cup }) => (
    <a className="fr-dense" href={cup.href || "#city/league/cup"} aria-label={`The Departmental Cup: ${cup.rows.slice(0, 5).map(r => `${r.pos}, ${r.team}, ${r.pts} points`).join("; ")}. Open the full table.`}>
      <ol aria-hidden="true">{cup.rows.slice(0, 5).map(r => <li key={r.pos}><span className="k">{r.pos}</span><span className="n">{r.team.replace(/^THE /, "")}</span><span className="v">{r.pts}</span></li>)}</ol>
    </a>
  ),
  T: ({ cup }) => <>{table(cup.rows.slice(0, 8))}<a className="fr-go" href={cup.href || "#city/league/cup"}>THE FULL TABLE ›</a></>,
  M: ({ cup }) => <>{table(cup.rows.slice(0, 3))}<a className="fr-go" href={cup.href || "#city/league/cup"}>THE FULL TABLE ›</a></>,
  L: ({ cup }) => <>{table(cup.rows.slice(0, 5))}<a className="fr-go" href={cup.href || "#city/league/cup"}>THE FULL TABLE ›</a></>,
};
export function LeagueWidget({ size = "L" }) {
  const e = useData(paperNow);
  const cup = e?.sports?.cup;
  const V = VIEWS_league[size] || VIEWS_league.L;
  return (
    <Frame title="LEAGUE TABLE" meta={size === "S" || size === "T" ? "" : "THE DEPARTMENTAL CUP"} tone="var(--eb-cyan)" className={`fr-league v-${size}`}>
      {cup?.rows?.length ? <V cup={cup} /> : <Waiting d={e} what="THE TABLE" />}
    </Frame>
  );
}
