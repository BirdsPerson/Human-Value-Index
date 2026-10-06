// The desk's three small windows, one chunk (they share the paper's fetch):
//   TODAY'S PAPER   THE DAILY COMPLIANCE's lead and two stories (/api/paper)
//   TOURNAMENTS     what is open now and who leads it (/api/tournament)
//   LEAGUE TABLE    the Departmental Cup's top five (the paper's sports page)
// Also the data THE SET's channels read (TheSet.jsx). Each fetch once per page view, shared.
import { useEffect, useState } from "react";
import { Frame } from "../ui/index.js";

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

export function PaperWidget() {
  const e = useData(paperNow);
  const lead = e?.front?.lead, rest = (e?.front?.stories || []).slice(0, 2);
  return (
    <Frame title="TODAY'S PAPER" meta={e ? `NO. ${e.no}` : ""} tone="var(--eb-amber)" className="fr-paper">
      {lead ? (
        <>
          <a className="fr-paper-lead" href="#paper"><span className="h">{lead.text}</span>{lead.deck && <span className="dk">{lead.deck}</span>}</a>
          <ul className="fr-list">{rest.map((s, i) => <li key={i}><a href={s.href || "#paper"}>{s.text}</a></li>)}</ul>
          <a className="fr-go" href="#paper">READ THE DAILY COMPLIANCE ›</a>
        </>
      ) : <Waiting d={e} what="THE PAPER" />}
    </Frame>
  );
}

export const openCups = (evs, now = Date.now()) => (evs || []).filter(e => e.status === "open" && e.closes > now);
const leader = (e) => e.leaders?.open?.[0] || e.leaders?.assisted?.[0] || null;
export function CupsWidget() {
  const evs = useData(cupsNow);
  const open = openCups(evs).slice(0, 4);
  return (
    <Frame title="TOURNAMENTS" meta={evs ? `${openCups(evs).length} OPEN` : ""} tone="var(--accent)" className="fr-cups">
      {open.length ? (
        <ul className="fr-list">
          {open.map(e => {
            const l = leader(e), hrs = Math.max(0, Math.round((e.closes - Date.now()) / 3600000));
            return <li key={e.id}><a href={e.href}><span className="h">{e.name}</span><span className="dk">{l ? `LEADS: ${String(l.holder || "A FILE").toUpperCase()}${l.total != null ? ` (${l.total})` : ""}.` : "NO CARDS IN YET. THE BOARD IS YOURS TO TAKE."} CLOSES IN {hrs}H.</span></a></li>;
          })}
        </ul>
      ) : evs === undefined ? <Waiting d={evs} what="THE BOARD" /> : <p className="fr-dim">NOTHING OPEN THIS HOUR. PRACTICE IS PERMITTED.</p>}
      <a className="fr-go" href="#play">ALL THE GAMES ›</a>
    </Frame>
  );
}

export function LeagueWidget() {
  const e = useData(paperNow);
  const cup = e?.sports?.cup;
  return (
    <Frame title="LEAGUE TABLE" meta="THE DEPARTMENTAL CUP" tone="var(--eb-cyan)" className="fr-league">
      {cup?.rows?.length ? (
        <>
          <table className="fr-table">
            <thead><tr><th scope="col">POS</th><th scope="col">TEAM</th><th scope="col">PTS</th></tr></thead>
            <tbody>{cup.rows.slice(0, 5).map(r => <tr key={r.pos}><td>{r.pos}</td><td>{r.team}</td><td>{r.pts}</td></tr>)}</tbody>
          </table>
          <a className="fr-go" href={cup.href || "#city/league/cup"}>THE FULL TABLE ›</a>
        </>
      ) : <Waiting d={e} what="THE TABLE" />}
    </Frame>
  );
}
