// THE DAILY COMPLIANCE (docs/PAPER.md): the city's newspaper. #paper is today's edition (the
// latest printed while the press runs), #paper/<YYYY-MM-DD> an archived one; ?s=<section> opens a
// section. A broadsheet in a terminal: masthead, dateline, teletext page numbers on the section
// tabs, columns on a wide screen and one column on a phone. Every edition is built on the server
// (netlify/lib/paper.js) and read here as it was printed; the WIRE is live.
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Window, Headline, Button } from "../ui/index.js";

const Comic = lazy(() => import("./Comic.jsx"));

export const SECTIONS = [
  ["front", "FRONT PAGE", "P100"], ["city", "THE CITY", "P200"], ["classifieds", "CLASSIFIEDS", "P300"],
  ["sports", "SPORTS", "P400"], ["markets", "MARKETS", "P500"], ["politics", "ASSEMBLY & POLITICS", "P600"],
  ["arts", "ARTS & NIGHTLIFE", "P700"], ["comics", "COMICS", "P800"], ["notices", "DEPARTMENT NOTICES", "P900"], ["archive", "ARCHIVE", "P999"],
];

const CSS = `
.pp { font-size: var(--t-m); line-height: 1.5; color: var(--fg); }
.pp a { color: var(--accent); }
.pp-mast { text-align: center; border-top: 3px double var(--line-hi); border-bottom: 3px double var(--line-hi); padding: var(--s3) 0 var(--s2); margin: 0 0 var(--s2); }
.pp-name { font-family: var(--tall); font-size: clamp(44px, 10vw, 96px); letter-spacing: 0.03em; line-height: 0.95; margin: 0; color: var(--fg); font-weight: 400; }
.pp-motto { color: var(--fg-dim); font-size: var(--t-s); margin: var(--s1) 0 0; }
.pp-date { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s1) var(--s3); font-size: var(--t-s); color: var(--fg-dim); border-bottom: 1px solid var(--line); padding: 0 0 var(--s2); margin: 0 0 var(--s3); }
.pp-tabs { display: flex; gap: var(--s1); overflow-x: auto; padding: 0 0 var(--s2); margin: 0 0 var(--s4); border-bottom: 1px solid var(--line); scrollbar-width: thin; }
.pp-tab { flex: 0 0 auto; min-height: var(--hit-min); padding: 0 var(--s3); background: transparent; color: var(--fg-dim); border: 1px solid var(--line); font: inherit; font-size: var(--t-s); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.pp-tab b { color: var(--warn); font-weight: 400; }
.pp-tab[aria-selected="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.pp-tab[aria-selected="true"] b { color: var(--accent-ink); }
.pp-tab:focus-visible { outline: var(--focus); outline-offset: 2px; }
.pp-band { background: var(--accent); color: var(--accent-ink); padding: var(--s3) var(--s3); margin: 0 0 var(--s3); }
.pp-band .pg { font-size: var(--t-xs); letter-spacing: 0.1em; display: block; margin-bottom: var(--s1); }
.pp .ui-tt.pp-lead { font-size: clamp(40px, 7vw, 72px); line-height: 0.95; padding: var(--s2) var(--s3) var(--s1); margin: 0 0 var(--s3); }
.pp .ui-tt.pp-sec { margin: 0 0 var(--s4); }
.pp .ui-frame { margin-top: var(--s5); }
.pp-lead a { color: inherit; text-decoration: none; }
.pp-deck { font-size: var(--t-m); color: var(--fg); margin: 0 0 var(--s4); max-width: 70ch; }
.pp-cols { column-gap: var(--s5); column-rule: 1px solid var(--line); }
@media (min-width: 900px) { .pp-cols { columns: 2; } .pp-cols.three { columns: 3; } }
.pp-cols > * { break-inside: avoid; }
.pp-story { margin: 0 0 var(--s4); }
.pp-story h3 { font-size: var(--t-l); line-height: 1.2; margin: 0 0 var(--s1); }
.pp-story h3 a { color: var(--fg); text-decoration: none; } .pp-story h3 a:hover { text-decoration: underline; }
.pp-story p { margin: 0; color: var(--fg-dim); }
.pp h2:not(.ui-tt) { font-size: var(--t-l); margin: 0 0 var(--s3); letter-spacing: 0.04em; border-bottom: 1px solid var(--line); padding-bottom: var(--s1); }
.pp h2:not(.ui-tt) .pg { color: var(--warn); margin-right: 1ch; font-weight: 400; }
.pp h3.sub { font-size: var(--t-m); color: var(--accent); margin: var(--s3) 0 var(--s1); letter-spacing: 0.04em; }
.pp ul.pp-list { list-style: none; margin: 0 0 var(--s3); padding: 0; }
.pp ul.pp-list li { padding: 3px 0; border-bottom: 1px dotted var(--fg-ghost); }
.pp ul.pp-list li::before { content: "> "; color: var(--accent); }
.pp ul.pp-plain li::before { content: none; } .pp ul.pp-plain li { border: 0; }
.pp-table { width: 100%; border-collapse: collapse; font-size: var(--t-s); margin: 0 0 var(--s3); }
.pp-table th, .pp-table td { text-align: right; padding: 2px 6px; border-bottom: 1px dotted var(--fg-ghost); }
.pp-table th:nth-child(2), .pp-table td:nth-child(2) { text-align: left; }
.pp-table th { color: var(--fg-mute); font-weight: 400; }
.pp-meta { color: var(--fg-mute); font-size: var(--t-s); }
.pp-ad { border: 1px solid var(--line); padding: var(--s3); margin: 0 0 var(--s3); }
.pp-ad .cat { color: var(--warn); font-size: var(--t-xs); letter-spacing: 0.08em; }
.pp-ad h3 { font-size: var(--t-m); margin: var(--s1) 0; }
.pp-ad p { margin: 0 0 var(--s2); color: var(--fg-dim); }
.pp-act { display: inline-flex; align-items: center; min-height: var(--hit-min); padding: 0 var(--s3); background: var(--accent); color: var(--accent-ink) !important; text-decoration: none; font-size: var(--t-s); }
.pp-act:focus-visible { outline: var(--focus); outline-offset: 2px; }
.pp-wire li { font-size: var(--t-s); }
.pp-wire .t { color: var(--warn); margin-right: 1ch; }
.pp-up { color: var(--accent); } .pp-down { color: var(--harm); }
.pp-scr { font-size: 28px; letter-spacing: 0.3em; color: var(--warn); margin: var(--s2) 0; word-break: break-all; }
.pp-btn { min-height: var(--hit-min); padding: 0 var(--s3); background: transparent; color: var(--accent); border: 1px solid var(--accent); font: inherit; font-size: var(--t-s); cursor: pointer; }
.pp-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s2); margin: 0 0 var(--s3); }
.pp-panel { border: 2px solid var(--line-hi); background: var(--panel); margin: 0; }
.pp-panel canvas { display: block; width: 100%; height: auto; image-rendering: pixelated; }
.pp-panel figcaption { padding: var(--s2); font-size: var(--t-s); line-height: 1.35; }
.pp-panel figcaption b { color: var(--warn); font-weight: 400; display: block; font-size: var(--t-xs); }
.pp-panel .cap { color: var(--fg-mute); font-style: italic; margin-top: var(--s1); }
.pp-err { color: var(--harm); }
`;

const useCss = () => useEffect(() => {
  if (document.getElementById("pp-css")) return;
  const el = document.createElement("style"); el.id = "pp-css"; el.textContent = CSS; document.head.appendChild(el);
}, []);

function sectionFromHash() {
  const q = (window.location.hash.split("?")[1] || "");
  const s = new URLSearchParams(q).get("s");
  return SECTIONS.some(x => x[0] === s) ? s : "front";
}

export default function Paper({ route }) {
  useCss();
  const date = (route.split("/")[1] || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || null;
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [sec, setSec] = useState(sectionFromHash);
  const [wire, setWire] = useState(null);
  const [index, setIndex] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    fetch(date ? `/api/paper?date=${date}` : "/api/paper").then(async r => {
      const d = await r.json().catch(() => null);
      if (!live) return;
      if (!r.ok || !d?.edition) { setErr(d?.error || "THE PRESSES ARE WARMING UP. TODAY'S EDITION IS BEING SET. TRY AGAIN SHORTLY."); setData(d); return; }
      setData(d);
      if (d.wire) setWire(d.wire);
      if (d.index) setIndex(d.index);
    }).catch(() => live && setErr("THE PAPER COULD NOT BE DELIVERED. THE BOY HAS BEEN REASSIGNED."));
    return () => { live = false; };
  }, [date]);
  // the WIRE refreshes every minute while the paper is open
  useEffect(() => {
    let live = true;
    const pull = () => fetch("/api/paper?wire=1").then(r => (r.ok ? r.json() : null)).then(d => { if (live && d?.wire) setWire(d.wire); }).catch(() => {});
    if (date) pull();
    const t = setInterval(pull, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [date]);
  useEffect(() => {
    if (sec !== "archive" || index) return;
    fetch("/api/paper?index=1").then(r => (r.ok ? r.json() : null)).then(d => d?.editions && setIndex(d.editions)).catch(() => {});
  }, [sec, index]);
  useEffect(() => {
    const on = () => setSec(sectionFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => { document.getElementById(`pp-tab-${sec}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [sec, data]);
  const pick = (s) => {
    setSec(s);
    const base = window.location.hash.split("?")[0] || "#paper";
    history.replaceState(null, "", s === "front" ? base : `${base}?s=${s}`);
    document.getElementById("pp-body")?.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    const i = SECTIONS.findIndex(x => x[0] === sec);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = SECTIONS[(i + (e.key === "ArrowRight" ? 1 : SECTIONS.length - 1)) % SECTIONS.length][0];
      pick(n); document.getElementById(`pp-tab-${n}`)?.focus();
    }
  };

  const ed = data?.edition;
  if (!ed) return (
    <div className="pp">
      <Mast />
      <p className={err ? "pp-err" : "pp-meta"} role="status">{err || "FETCHING THE PAPER..."}</p>
      {data?.index?.length ? <p><a href={`#paper/${data.index[0].date}`}>READ THE LAST EDITION, NO. {data.index[0].no}</a></p> : null}
    </div>
  );
  const S = SECTIONS.find(x => x[0] === sec);
  return (
    <article className="pp" aria-label={`${ed.name}, edition ${ed.no}`}>
      <Mast ed={ed} />
      <nav aria-label="Sections of the paper">
        <div className="pp-tabs" role="tablist" onKeyDown={onKey}>
          {SECTIONS.map(([id, label, pg]) => (
            <button key={id} id={`pp-tab-${id}`} role="tab" type="button" className="pp-tab" aria-selected={sec === id} aria-controls="pp-body" tabIndex={sec === id ? 0 : -1} onClick={() => pick(id)}>
              <b>{pg}</b>{label}
            </button>
          ))}
        </div>
      </nav>
      <section id="pp-body" role="tabpanel" aria-labelledby={`pp-tab-${sec}`} tabIndex={-1}>
        {sec === "front" && <Front ed={ed} wire={wire} go={pick} />}
        {sec !== "front" && <Headline page={S[2]} tone={{ sports: "am", markets: "cy", comics: "am", classifieds: "cy" }[sec]} className="pp-sec">{S[1]}</Headline>}
        {sec === "city" && <City c={ed.city} weather={ed.weather} />}
        {sec === "classifieds" && <Classifieds list={ed.classifieds} />}
        {sec === "sports" && <Sports s={ed.sports} />}
        {sec === "markets" && <Markets m={ed.markets} />}
        {sec === "politics" && <Politics p={ed.politics} />}
        {sec === "arts" && <Arts a={ed.arts} />}
        {sec === "comics" && <Comics c={ed.comics} />}
        {sec === "notices" && <Notices list={ed.notices} />}
        {sec === "archive" && <Archive index={index} current={ed.date} />}
      </section>
      <p className="pp-meta" style={{ marginTop: "var(--s5)" }}>
        PRINTED {ed.printedAt.slice(0, 16).replace("T", " ")} UTC, MACHINE DAY {ed.machine.day}. EVERY STORY IS THE CITY'S OWN RECORD. NOBODY ON FILE IS QUOTED. {ed.editorial?.by === "engine" ? "THE LEADER WAS WRITTEN BY THE ASSESSMENT ENGINE AND CHECKED AGAINST THE FACTS." : ""}
      </p>
    </article>
  );
}

function Mast({ ed }) {
  return (
    <header>
      <div className="pp-mast">
        <h1 className="pp-name">{ed?.name || "THE DAILY COMPLIANCE"}</h1>
        <p className="pp-motto">{ed?.motto || "ALL THE NEWS THAT IS PERMITTED. ESTABLISHED BY ORDER."}</p>
      </div>
      {ed && (
        <div className="pp-date">
          <span>NO. {ed.no}</span><span>{ed.dateline}</span><span>MACHINE DAY {ed.machine.day}, {ed.machine.hour}</span><span>{ed.price}</span>
        </div>
      )}
    </header>
  );
}

const Story = ({ h, big }) => (
  <div className="pp-story">
    {big ? null : <h3><a href={h.href}>{h.text}</a></h3>}
    {h.deck && <p>{h.deck}</p>}
  </div>
);

function Front({ ed, wire, go }) {
  const L = ed.front.lead;
  const strip = ed.comics?.strip;
  return (
    <>
      <Headline as="h2" page="P100" className="pp-lead"><a href={L.href}>{L.text}</a></Headline>
      {L.deck && <p className="pp-deck">{L.deck}</p>}
      <div className="pp-cols three">
        {ed.front.stories.map((h, i) => <Story key={i} h={h} />)}
        <Window title="THE LEADER" meta={ed.editorial?.by === "engine" ? "ENGINE" : "DESK"} double>
          <p style={{ margin: 0 }}>{ed.editorial?.text}</p>
        </Window>
        <Window title="THE WIRE" meta="LIVE">
          {wire?.length ? (
            <ul className="pp-list pp-wire" aria-live="polite">
              {wire.slice(0, 6).map((w, i) => <li key={i}><span className="t">{w.at}</span><a href={w.href} style={{ color: "var(--fg)" }}>{w.text}</a></li>)}
            </ul>
          ) : <p className="pp-meta">THE WIRE IS QUIET. THE DEPARTMENT IS LISTENING ANYWAY.</p>}
        </Window>
        <Window title="WEATHER.SYS" meta="MACHINE CLOCK">
          <p style={{ margin: 0 }}>THE CITY: {ed.weather.city}. THE HEIGHTS: {ed.weather.heights}. THE WATERS: {ed.weather.waters}.</p>
        </Window>
        {ed.markets && (
          <Window title="MARKET.TKR">
            <p style={{ margin: 0 }}><a href="#market">HUMAN VALUE INDEX {ed.markets.level} ({ed.markets.chg})</a></p>
          </Window>
        )}
        <Window title="INSIDE">
          <ul className="pp-list pp-plain">
            <li><button type="button" className="pp-btn" onClick={() => go("classifieds")}>P300 HOW TO GET INVOLVED: {ed.classifieds.length} LISTINGS</button></li>
            <li><button type="button" className="pp-btn" onClick={() => go("sports")}>P400 SCORES, TABLES, THE CUP</button></li>
            {strip && <li><button type="button" className="pp-btn" onClick={() => go("comics")}>P800 THE FUNNIES: {strip.title}</button></li>}
          </ul>
        </Window>
      </div>
    </>
  );
}

function City({ c, weather }) {
  return (
    <div className="pp-cols">
      {c.air && (c.air.open.length || c.air.because.length) ? (
        <div className="pp-story">
          <h3 className="sub">THE AIR</h3>
          {c.air.open.length ? <p>{c.air.open.join(" AND ")} IN SERVICE. {c.air.drones ? `${c.air.drones} DRONE DELIVERIES SCHEDULED. ` : ""}{c.air.hops ? `${c.air.hops} HELICOPTER MOVEMENTS LOGGED.` : ""}</p> : null}
          {c.air.because.map((b, i) => <p key={i}>BECAUSE: {b}</p>)}
        </div>
      ) : null}
      <div className="pp-story">
        <h3 className="sub">THE DISTRICTS, BY MOOD</h3>
        <table className="pp-table"><thead><tr><th>MOOD</th><th>DISTRICT</th><th>SHOPS</th></tr></thead>
          <tbody>{c.districts.map(d => <tr key={d.id}><td>{d.mood}</td><td>{d.name}: {d.word}</td><td>{d.shops || ""}</td></tr>)}</tbody></table>
        <p className="pp-meta">WEATHER: THE HEIGHTS {weather.heights}; THE WATERS {weather.waters}.</p>
      </div>
      <div className="pp-story">
        <h3 className="sub">THE MALL</h3>
        {c.opened.length ? <><p>NOW OPEN:</p><ul className="pp-list">{c.opened.map((x, i) => <li key={i}><a href={x.href}>{x.text}</a></li>)}</ul></> : <p>NO NEW SHOPS OPENED SINCE THE LAST EDITION.</p>}
        {c.closed.length ? <><p>CLOSED:</p><ul className="pp-list">{c.closed.map((x, i) => <li key={i}><a href={x.href}>{x.text}</a></li>)}</ul></> : null}
        {c.proprietors?.length ? <><p>PROPRIETORS ON RECORD:</p><ul className="pp-list">{c.proprietors.map((x, i) => <li key={i}><a href={x.href}>{x.text}</a></li>)}</ul></> : null}
        <p className="pp-meta">{c.trading} BUSINESSES TRADING. <a href="#enterprise">THE SMALL BUSINESS REGISTER</a></p>
      </div>
      {c.arrivals && (
        <div className="pp-story">
          <h3 className="sub">ARRIVALS AT INTAKE</h3>
          {c.arrivals.released.length ? <ul className="pp-list">{c.arrivals.released.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p>NO NEW FILES RELEASED.</p>}
          <p className="pp-meta">{c.arrivals.pending} AWAITING RELEASE. <a href="#arrivals">THE PROCESSING HALL</a></p>
        </div>
      )}
      <div className="pp-story">
        <h3 className="sub">OVERHEARD</h3>
        {c.gossip.length ? <ul className="pp-list">{c.gossip.map((g, i) => <li key={i}>{g}</li>)}</ul> : <p>NOTHING WAS OVERHEARD. THE DEPARTMENT IS DISAPPOINTED.</p>}
      </div>
    </div>
  );
}

function Classifieds({ list }) {
  const cats = [...new Set(list.map(c => c.cat))];
  return (
    <>
      <p className="pp-deck">HOW TO GET INVOLVED. EVERY LISTING IS ONE TAP FROM THE PLACE THAT DOES IT. THE DEPARTMENT DOES NOT ACCEPT EXCUSES OR APPLICATIONS BY POST.</p>
      <div className="pp-cols three">
        {cats.map(cat => list.filter(c => c.cat === cat).map((c, i) => (
          <div className="pp-ad" key={cat + i}>
            <span className="cat">{c.cat}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <Button variant="push" href={c.href}>{c.act}</Button>
          </div>
        )))}
      </div>
    </>
  );
}

const Table = ({ rows, cols }) => (
  <table className="pp-table">
    <thead><tr>{cols.map(([k, l]) => <th key={k} scope="col">{l}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k}>{r[k]}</td>)}</tr>)}</tbody>
  </table>
);

function Sports({ s }) {
  return (
    <div className="pp-cols">
      {s.leagues.map(lg => (
        <div className="pp-story" key={lg.sport}>
          <h3 className="sub"><a href={lg.href}>{lg.name}</a> <span className="pp-meta">AT {lg.ground}{lg.champion ? `, CHAMPIONS: ${lg.champion}` : ""}</span></h3>
          {lg.results.length ? <ul className="pp-list">{lg.results.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p>NO RESULTS YET THIS SEASON.</p>}
          {lg.star && <p>STAR OF THE DAY: {lg.star.name}, {lg.star.team}: {lg.star.stat}.</p>}
          <Table rows={lg.table.slice(0, 10)} cols={[["pos", "#"], ["team", "TEAM"], ["p", "P"], ["w", "W"], ["l", "L"], ["pts", "PTS"]]} />
          {lg.leaders.map(c => <p key={c.label} className="pp-meta">{c.label}: {c.rows.map(r => `${r.name} (${r.team}) ${r.value}`).join("; ")}.</p>)}
          {lg.next.length ? <p>NEXT: {lg.next.map(n => `DAY ${n.day} ${String(Math.floor(n.at)).padStart(2, "0")}:${String(Math.round((n.at % 1) * 60)).padStart(2, "0")}, ${n.text}`).join(" // ")}</p> : null}
        </div>
      ))}
      {s.cup && (
        <div className="pp-story">
          <h3 className="sub"><a href={s.cup.href}>THE DEPARTMENTAL CUP</a></h3>
          <Table rows={s.cup.rows} cols={[["pos", "#"], ["team", "DISTRICT"], ["pts", "PTS"]]} />
          {s.cup.last && <p className="pp-meta">LAST SEASON'S CUP: {s.cup.last.champion}.</p>}
        </div>
      )}
      {s.tennis && (
        <div className="pp-story">
          <h3 className="sub"><a href={s.tennis.href}>THE TENNIS LADDER</a></h3>
          {s.tennis.results.length ? <ul className="pp-list">{s.tennis.results.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
          <Table rows={s.tennis.ladder} cols={[["rung", "#"], ["name", "PLAYER"], ["w", "W"], ["l", "L"]]} />
        </div>
      )}
      {s.pit && (
        <div className="pp-story">
          <h3 className="sub"><a href={s.pit.href}>THE PIT</a></h3>
          {s.pit.results.length ? <ul className="pp-list">{s.pit.results.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
          {s.pit.rank.length ? <Table rows={s.pit.rank} cols={[["pos", "#"], ["name", "FIGHTER"], ["w", "W"], ["l", "L"], ["pts", "PTS"]]} /> : null}
          {s.pit.next.length ? <p>NEXT CARD, DAY {s.pit.nextDay}: {s.pit.next.join(" // ")}</p> : null}
        </div>
      )}
      {s.race && (
        <div className="pp-story">
          <h3 className="sub"><a href={s.race.href}>THE WEEKEND RACE</a></h3>
          {s.race.last && <p>{s.race.last.line}</p>}
          <Table rows={s.race.standings} cols={[["pos", "#"], ["name", "RACER"], ["wins", "WINS"], ["pts", "PTS"]]} />
          {s.race.next && <p className="pp-meta">NEXT: THE {s.race.next.name}, MACHINE DAY {s.race.next.day}.</p>}
        </div>
      )}
      <div className="pp-story">
        <h3 className="sub"><a href="#aquarium">THE AQUARIUM'S PLAQUES</a></h3>
        {s.aquarium?.length ? <ul className="pp-list">{s.aquarium.map((r, i) => <li key={i}>{r.species}: {r.weight}, {r.length}, {r.holder}{r.fresh ? " (NEW)" : ""}.</li>)}</ul>
          : <p>EVERY TANK IS EMPTY. NO CATCH HAS BEEN DONATED AND REPLAYED YET. <a href="#fish">BE THE FIRST.</a></p>}
      </div>
    </div>
  );
}

function Markets({ m }) {
  if (!m) return <p>THE FLOOR DID NOT REPORT. THE DEPARTMENT ASSUMES THE WORST, AS USUAL.</p>;
  const row = (x, i) => <li key={i}><a href={x.href}>{x.name}</a> {x.price} <span className={x.chg.startsWith("+") ? "pp-up" : "pp-down"}>{x.chg}</span>{x.why ? <> BECAUSE: {x.why}</> : null}</li>;
  return (
    <div className="pp-cols">
      <div className="pp-story">
        <p style={{ fontSize: "var(--t-l)" }}><a href={m.href}>HUMAN VALUE INDEX {m.level}</a> <span className={m.chg.startsWith("+") ? "pp-up" : "pp-down"}>{m.chg}</span></p>
        <p className="pp-meta">{m.listed} HUMANS LISTED. CYCLES ONLY.</p>
        {m.emergency && <p className="pp-down">{m.emergency}</p>}
      </div>
      <div className="pp-story"><h3 className="sub">TOP MOVERS, UP</h3><ul className="pp-list">{m.up.map(row)}</ul></div>
      <div className="pp-story"><h3 className="sub">TOP MOVERS, DOWN</h3><ul className="pp-list">{m.down.map(row)}</ul></div>
      {m.events.length ? <div className="pp-story"><h3 className="sub">ON THE FLOOR</h3><ul className="pp-list">{m.events.map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
      {m.floor.length ? <div className="pp-story"><h3 className="sub">THE INVESTOR CLASS</h3><ul className="pp-list">{m.floor.map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
      <div className="pp-story"><h3 className="sub">THE DIVIDEND</h3><p>{m.dividend} <a href="#economy">THE TREASURY</a></p></div>
    </div>
  );
}

const when = (ms) => (ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).toUpperCase() : "");

function Politics({ p }) {
  return (
    <div className="pp-cols">
      {p.assembly && (
        <div className="pp-story">
          <h3 className="sub"><a href={p.assembly.href}>THE ASSEMBLY, SESSION {p.assembly.id}: {p.assembly.state}</a></h3>
          <ul className="pp-list">{p.assembly.motions.map((m, i) => <li key={i}>{m.name}: {m.choices}</li>)}</ul>
          <p className="pp-meta">{p.assembly.voters} BALLOTS. {p.assembly.state === "OPEN" ? `CLOSES ${when(p.assembly.closeAt)} (NEW YORK).` : ""}</p>
          {p.assembly.earlier.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      {p.elections && (
        <div className="pp-story">
          <h3 className="sub"><a href={p.elections.href}>THE COUNCIL, CYCLE {p.elections.cycle}: POLLS {p.elections.state}</a></h3>
          {p.elections.results.length ? <ul className="pp-list">{p.elections.results.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
          {p.elections.next && p.elections.state !== "OPEN" ? <p className="pp-meta">CYCLE {p.elections.next.cycle} OPENS {when(p.elections.next.openAt)} (NEW YORK).</p> : null}
        </div>
      )}
      {p.council.length ? (
        <div className="pp-story">
          <h3 className="sub">THE SITTING COUNCIL</h3>
          <Table rows={p.council.map((c, i) => ({ ...c, n: i + 1 }))} cols={[["n", "#"], ["district", "SEAT"], ["name", "HOLDER"]]} />
        </div>
      ) : null}
      {p.prefects.length ? (
        <div className="pp-story">
          <h3 className="sub"><a href="#prefects">PREFECT DIRECTIVES</a></h3>
          <ul className="pp-list">{p.prefects.map((x, i) => <li key={i}>{x.district}: {x.directive}, BY {x.prefect} ({x.code}).{x.line ? ` ${x.line}` : ""}</li>)}</ul>
        </div>
      ) : null}
      {p.docket && (
        <div className="pp-story">
          <h3 className="sub"><a href={p.docket.href}>THE DOCKET</a></h3>
          {p.docket.session && <p>{p.docket.session}</p>}
          {p.docket.open.length ? <ul className="pp-list">{p.docket.open.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p>NO PROPOSALS ARE OPEN. <a href="#docket">FILE ONE.</a></p>}
          {p.docket.acts.length ? <><p>ACTS OF THE ASSEMBLY:</p><ul className="pp-list">{p.docket.acts.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
        </div>
      )}
    </div>
  );
}

function Arts({ a }) {
  return (
    <div className="pp-cols">
      <div className="pp-story">
        <h3 className="sub">TONIGHT</h3>
        {a.nightlife.length ? <ul className="pp-list">{a.nightlife.map((x, i) => <li key={i}>{x.venue}: {x.text}</li>)}</ul> : <p>EVERY ROOM IS DARK TONIGHT. THE HOUSE PLAYS A PLAYLIST.</p>}
      </div>
      {a.ebtv && (
        <div className="pp-story">
          <h3 className="sub">ELECTRIC BASEMENT TV</h3>
          <p>WHEN THIS EDITION WENT TO PRESS: {a.ebtv.now}.{a.ebtv.next ? ` UP NEXT: ${a.ebtv.next}.` : ""}</p>
          <p className="pp-meta">THE CITY'S TVS SHOW THE LIVE CHANNEL. <a href="#city">FIND A TV</a></p>
        </div>
      )}
      <div className="pp-story">
        <h3 className="sub"><a href={a.arcadeHref}>THE ARCADE</a></h3>
        <ul className="pp-list">{a.arcade.map((g, i) => <li key={i}>{g.title}{g.line ? `: ${g.line}` : ""}</li>)}</ul>
        <p className="pp-meta">{a.scores}</p>
      </div>
    </div>
  );
}

function Comics({ c }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      {c.strip && (
        <section aria-label={`Comic strip: ${c.strip.title}`}>
          <h3 className="sub">{c.strip.title}</h3>
          <Suspense fallback={<p className="pp-meta">INKING THE PANELS...</p>}><Comic strip={c.strip} /></Suspense>
        </section>
      )}
      {c.puzzle && (
        <Window title="THE DAILY SCRAMBLE">
          <p>{c.puzzle.clue}</p>
          <p className="pp-scr" aria-label={`Scrambled letters: ${c.puzzle.letters.split("").join(" ")}`}>{c.puzzle.letters}</p>
          {shown ? <p>ANSWER: {c.puzzle.answer}. THE DEPARTMENT KNEW.</p> : <Button variant="push" onClick={() => setShown(true)}>REVEAL THE ANSWER</Button>}
        </Window>
      )}
    </>
  );
}

const Notices = ({ list }) => (
  <>
    <p className="pp-deck">WHAT THE DEPARTMENT CHANGED. EVERYTHING INSTALLED IS INSTALLED FOR YOUR BENEFIT, OR AT LEAST IN YOUR PRESENCE.</p>
    <ul className="pp-list">{list.map((n, i) => <li key={i}>{n.href ? <a href={n.href}>{n.text}</a> : n.text}</li>)}</ul>
  </>
);

function Archive({ index, current }) {
  const list = useMemo(() => index || [], [index]);
  if (!index) return <p className="pp-meta">OPENING THE MORGUE...</p>;
  return (
    <>
      <p className="pp-deck">EVERY EDITION, AS PRINTED. NOTHING IS CORRECTED. CORRECTIONS ARE ISSUED AS NEW FACTS.</p>
      <ul className="pp-list">
        {list.map(e => <li key={e.date}><a href={`#paper/${e.date}`} aria-current={e.date === current ? "page" : undefined}>NO. {e.no}, {e.date}: {e.headline}</a></li>)}
      </ul>
    </>
  );
}
