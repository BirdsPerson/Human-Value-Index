// THE DAILY COMPLIANCE (docs/PAPER.md): the city's newspaper. #paper is today's edition (the
// latest printed while the press runs), #paper/<YYYY-MM-DD> an archived one; ?s=<section> opens a
// section. A broadsheet on the terminal: masthead, dateline, teletext page numbers on the section
// tabs, TODAY IN 30 SECONDS, a lead with its wire photo, stories with one next step each, and a
// WHERE TO NEXT at the foot of every section. Every edition is built on the server
// (netlify/lib/paper.js) and read here as it was printed: the copy is stored in capitals and read
// in sentence case with every name linked (src/paper/read.js); the pictures are drawn here from
// the edition alone (src/paper/wirephoto.js). The WIRE is live.
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Window, Headline, Button } from "../ui/index.js";
import Sparkline from "../ui/Sparkline.jsx";
import { entsOf, matcherOf, segments, briefOf, nextOf, readable, namesIn, EBTV_WATCH, PAPER_PAIRS } from "./read.js";
import { sceneOf, paint, PW, PH } from "./wirephoto.js";
import { loadAtlas, loadRepoSprite, loadImage, paintPlaceholder } from "../sprites.js";

const Comic = lazy(() => import("./Comic.jsx"));

export const SECTIONS = [
  ["front", "FRONT PAGE", "P100", "FRONT"], ["city", "THE CITY", "P200", "CITY"], ["classifieds", "CLASSIFIEDS", "P300", "CLASSIFIEDS"],
  ["sports", "SPORTS", "P400", "SPORTS"], ["markets", "MARKETS", "P500", "MARKETS"], ["politics", "ASSEMBLY & POLITICS", "P600", "POLITICS"],
  ["arts", "ARTS & NIGHTLIFE", "P700", "ARTS"], ["comics", "COMICS", "P800", "COMICS"], ["notices", "DEPARTMENT NOTICES", "P900", "NOTICES"], ["archive", "ARCHIVE", "P999", "ARCHIVE"],
];

// Every text colour below sits on --panel (the sheet) or --accent (a selected tab, an action):
// PAPER_PAIRS (read.js), held to WCAG AA in all twelve themes by check-paper.
export { PAPER_PAIRS };

const CSS = `
.pp { text-transform: none; font-size: var(--t-m); line-height: 1.6; color: var(--fg); background: var(--panel); border: 1px solid var(--line); padding: var(--s4) var(--s5) var(--s5); max-width: 1240px; margin: 0 auto; box-sizing: border-box; }
@media (max-width: 600px) { .pp { padding: var(--s3) var(--s3) var(--s4); border-left: 0; border-right: 0; } }
.pp a { color: var(--accent); text-underline-offset: 3px; }
.pp a:focus-visible, .pp button:focus-visible { outline: var(--focus); outline-offset: 2px; }
.pp-copy { max-width: 68ch; }
/* the copy reads in sentence case; the paper's furniture keeps the Department's capitals */
.pp :is(.pp-mast, .pp-date, .pp-tab, .pp-brief h2, .pp-kick, .pp-story h3, h2, h3.sub, .pp-ad .cat, .pp-ad h3, .pp-table th, .pp-where h2, .ui-frame-ttl, .ui-btn) { text-transform: uppercase; }
.pp-mast { text-align: center; border-top: 3px double var(--line-hi); border-bottom: 3px double var(--line-hi); padding: var(--s3) 0 var(--s2); margin: 0 0 var(--s2); }
.pp-name { font-family: var(--tall); font-size: clamp(40px, 9vw, 88px); letter-spacing: 0.03em; line-height: 0.95; margin: 0; color: var(--fg); font-weight: 400; }
.pp-motto { color: var(--fg-mute); font-size: var(--t-s); margin: var(--s1) 0 0; }
.pp-date { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s1) var(--s3); font-size: var(--t-s); color: var(--fg-mute); border-bottom: 1px solid var(--line); padding: 0 0 var(--s2); margin: 0 0 var(--s3); }
.pp-tabs { display: flex; flex-wrap: wrap; gap: var(--s1); padding: 0 0 var(--s3); margin: 0 0 var(--s4); border-bottom: 1px solid var(--line); }
.pp-tab { flex: 0 0 auto; min-height: var(--hit-min); padding: 0 var(--s3); background: transparent; color: var(--fg); border: 1px solid var(--line); font: inherit; font-size: var(--t-s); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.pp-tab b { color: var(--warn); font-weight: 400; }
.pp-tab .s { display: none; }
.pp-tab[aria-selected="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.pp-tab[aria-selected="true"] b { color: var(--accent-ink); }
@media (max-width: 700px) { .pp-tab .l, .pp-tab b { display: none; } .pp-tab .s { display: inline; } .pp-tab { padding: 0 var(--s2); flex: 1 1 auto; justify-content: center; } }
.pp-brief { border: 2px solid var(--line-hi); padding: var(--s3) var(--s4); margin: 0 0 var(--s5); }
.pp-brief h2 { font-size: var(--t-s); letter-spacing: 0.1em; color: var(--warn); margin: 0 0 var(--s2); font-weight: 400; border: 0; padding: 0; }
.pp-brief ol { margin: 0; padding: 0 0 0 2.2ch; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s2); }
.pp-brief li { padding-left: 0.5ch; }
.pp-brief li::marker { color: var(--fg-mute); }
.pp-next { display: inline-block; padding: 6px 0; font-size: var(--t-s); }
.pp-next::before { content: "\\2192\\00a0"; }
.pp-kick { font-size: var(--t-xs); letter-spacing: 0.1em; color: var(--warn); margin: 0 0 var(--s1); }
.pp .ui-tt.pp-lead { font-size: clamp(34px, 6vw, 64px); line-height: 1; padding: var(--s2) var(--s3) var(--s1); margin: 0 0 var(--s3); }
.pp .ui-tt.pp-sec { margin: 0 0 var(--s4); }
.pp .ui-frame { margin-top: 0; margin-bottom: var(--s4); }
.pp-lead a { color: inherit; text-decoration: none; }
.pp-deck { font-size: 18px; line-height: 1.55; color: var(--fg); margin: 0 0 var(--s2); max-width: 64ch; }
.pp-front { display: grid; gap: var(--s5); }
@media (min-width: 1000px) { .pp-front { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } }
.pp-leadfig { display: grid; gap: var(--s3); margin: 0 0 var(--s4); }
@media (min-width: 720px) { .pp-leadfig { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
.pp-photo { margin: 0; border: 1px solid var(--line-hi); background: var(--panel); }
.pp-photo canvas { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; image-rendering: pixelated; }
.pp-photo figcaption { padding: var(--s1) var(--s2) var(--s2); font-size: var(--t-s); line-height: 1.45; color: var(--fg-mute); }
.pp-grid { display: grid; gap: var(--s4) var(--s5); border-top: 1px solid var(--line); padding-top: var(--s4); }

.pp-story { margin: 0 0 var(--s4); }
.pp-story h3 { font-size: var(--t-l); line-height: 1.25; margin: 0 0 var(--s1); letter-spacing: 0.02em; }
.pp-story h3 a { color: var(--fg); text-decoration: none; } .pp-story h3 a:hover { text-decoration: underline; }
.pp-story p { margin: 0 0 var(--s1); max-width: 68ch; }
.pp-sec-story { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: var(--s3); align-items: start; padding-bottom: var(--s4); border-bottom: 1px dotted var(--line); }
@media (min-width: 720px) { .pp-sec-story { grid-template-columns: 176px minmax(0, 1fr); gap: var(--s4); } }
.pp-sec-story .pp-photo figcaption { display: none; }
.pp-sec-story.nopic { grid-template-columns: minmax(0, 1fr); }
.pp h2:not(.ui-tt) { font-size: var(--t-l); margin: 0 0 var(--s3); letter-spacing: 0.04em; border-bottom: 1px solid var(--line); padding-bottom: var(--s1); }
.pp h3.sub { font-size: var(--t-m); color: var(--fg); margin: var(--s4) 0 var(--s2); letter-spacing: 0.06em; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
.pp h3.sub:first-child { margin-top: 0; }
.pp-cols { display: grid; gap: var(--s4) var(--s5); }
@media (min-width: 900px) { .pp-cols { grid-template-columns: 1fr 1fr; } .pp-cols.three { grid-template-columns: 1fr 1fr 1fr; } }
.pp ul.pp-list { list-style: none; margin: 0 0 var(--s3); padding: 0; }
.pp ul.pp-list li { padding: 6px 0; border-bottom: 1px dotted var(--line); }
.pp ul.pp-plain li { border: 0; padding: 2px 0; }
.pp-table { width: 100%; border-collapse: collapse; font-size: var(--t-s); margin: 0 0 var(--s3); }
.pp-table th, .pp-table td { text-align: right; padding: 4px 6px; border-bottom: 1px dotted var(--line); }
.pp-table th:nth-child(2), .pp-table td:nth-child(2) { text-align: left; }
.pp-table th { color: var(--fg-mute); font-weight: 400; }
.pp-meta { color: var(--fg-mute); font-size: var(--t-s); }
.pp-ad { border: 1px solid var(--line); padding: var(--s3); }
.pp-ad .cat { color: var(--warn); font-size: var(--t-xs); letter-spacing: 0.08em; }
.pp-ad h3 { font-size: var(--t-m); margin: var(--s1) 0; }
.pp-ad p { margin: 0 0 var(--s2); }
.pp-wire li { font-size: var(--t-s); line-height: 1.5; }
.pp-wire .t { color: var(--fg-mute); margin-right: 1ch; }
.pp-up { color: var(--accent); } .pp-down { color: var(--harm); }
.pp-scr { font-size: 28px; letter-spacing: 0.3em; color: var(--warn); margin: var(--s2) 0; word-break: break-all; }
.pp-btn { min-height: var(--hit-min); padding: 0 var(--s3); background: transparent; color: var(--accent); border: 1px solid var(--accent); font: inherit; font-size: var(--t-s); cursor: pointer; text-align: left; }
.pp-where { border-top: 3px double var(--line-hi); margin-top: var(--s5); padding-top: var(--s3); }
.pp-where h2:not(.ui-tt) { font-size: var(--t-s); color: var(--warn); border: 0; letter-spacing: 0.1em; font-weight: 400; margin: 0 0 var(--s2); padding: 0; }
.pp-where ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s2); }
.pp-where a { display: inline-flex; align-items: center; min-height: var(--hit-min); padding: 0 var(--s3); border: 1px solid var(--line-hi); text-decoration: none; font-size: var(--t-s); }
.pp-where a:hover { background: var(--accent); color: var(--accent-ink); }
.pp-err { color: var(--harm); }
.pp-foot { margin-top: var(--s5); }
`;

const useCss = () => useEffect(() => {
  let el = document.getElementById("pp-css");
  if (!el) { el = document.createElement("style"); el.id = "pp-css"; document.head.appendChild(el); }
  el.textContent = CSS;
}, []);

function sectionFromHash() {
  const q = (window.location.hash.split("?")[1] || "");
  const s = new URLSearchParams(q).get("s");
  return SECTIONS.some(x => x[0] === s) ? s : "front";
}

// ---- reading: a printed line, re-cased and linked -------------------------------------------------
// seen: the names already linked in this block (each name is linked once per story)
function Rd({ s, m, seen }) {
  const segs = segments(s, m, seen || new Set());
  return segs.map((x, i) => (x.h
    ? <a key={i} href={x.h} {...(x.h.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>{x.t}</a>
    : <span key={i}>{x.t}</span>));
}
// IN THIS STORY: the names a headline carries (the headline itself is one link, to the story)
function Names({ s, m, seen }) {
  const L = namesIn(s, m, seen);
  if (!L.length) return null;
  return <p className="pp-meta pp-names">In this story: {L.map((x, i) => <span key={i}>{i ? " · " : ""}<a href={x.h}>{x.t.replace(/^the /, "The ")}</a></span>)}</p>;
}
const Next = ({ n }) => (n?.h ? <a className="pp-next" href={n.h} {...(n.h.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>{n.act}</a> : null);
function WhereNext({ links }) {
  const L = links.filter(x => x && x.h);
  if (!L.length) return null;
  return (
    <nav className="pp-where" aria-label="Where to next">
      <h2>WHERE TO NEXT</h2>
      <ul>{L.map((x, i) => <li key={i}><a href={x.h} {...(x.h.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}>{x.t}</a></li>)}</ul>
    </nav>
  );
}

// ---- wire photos ------------------------------------------------------------------------------------
async function loadSheet(slug) {
  const a = await loadAtlas();
  if (a && Object.prototype.hasOwnProperty.call(a.sprites, slug)) return loadRepoSprite(slug);
  return (await loadImage(`/api/sprite/${slug}`)) || paintPlaceholder(slug, "#8a8a8a");
}
function inks(el) {
  const cs = getComputedStyle(el);
  return { ink: cs.getPropertyValue("--fg").trim() || "#000", paper: cs.getPropertyValue("--panel").trim() || "#fff" };
}
function WirePhoto({ scene, caption = true }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "green");
  useEffect(() => {
    const ob = new MutationObserver(() => setTheme(document.documentElement.getAttribute("data-theme") || "green"));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => ob.disconnect();
  }, []);
  const sk = scene ? JSON.stringify(scene) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current && scene) paint(ref.current, scene, inks(ref.current), loadSheet).catch(() => {}); }, [sk, theme]);
  if (!scene) return null;
  return (
    <figure className="pp-photo">
      <canvas ref={ref} width={PW} height={PH} role="img" aria-label={scene.caption} />
      {caption && <figcaption>{scene.caption}</figcaption>}
    </figure>
  );
}

const KICK = { pit: "SPORTS / THE PIT", result: "SPORTS", champion: "SPORTS / THE FINAL", race: "SPORTS / THE MOUNTAIN", tournament: "SPORTS / TOURNAMENTS", pyramid: "SPORTS",
  directive: "THE CITY / PREFECTS", mood: "THE CITY", arrivals: "THE CITY / INTAKE", shop: "THE CITY / THE MALL", emergence: "THE CITY", river: "THE CITY", plaza: "THE CITY",
  index: "MARKETS", market: "MARKETS", stabilizer: "MARKETS", assembly: "POLITICS", election: "POLITICS", notice: "DEPARTMENT NOTICES", record: "THE AQUARIUM" };
const kickOf = (h) => `${KICK[h.kind] || "THE CITY"}${h.kind === "result" && h.sport ? ` / ${h.sport}` : ""}`;

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

  const m = useMemo(() => (data?.edition ? matcherOf(entsOf(data)) : null), [data]);
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
          {SECTIONS.map(([id, label, pg, short]) => (
            <button key={id} id={`pp-tab-${id}`} role="tab" type="button" className="pp-tab" aria-selected={sec === id} aria-controls="pp-body" tabIndex={sec === id ? 0 : -1} onClick={() => pick(id)}>
              <b>{pg}</b><span className="l">{label}</span><span className="s" aria-hidden="true">{short}</span>
            </button>
          ))}
        </div>
      </nav>
      <section id="pp-body" role="tabpanel" aria-labelledby={`pp-tab-${sec}`} tabIndex={-1}>
        {sec === "front" && <Front ed={ed} wire={wire} go={pick} m={m} />}
        {sec !== "front" && <Headline page={S[2]} tone={{ sports: "am", markets: "cy", comics: "am", classifieds: "cy" }[sec]} className="pp-sec">{S[1]}</Headline>}
        {sec === "city" && <City ed={ed} m={m} />}
        {sec === "classifieds" && <Classifieds list={ed.classifieds} m={m} />}
        {sec === "sports" && <Sports ed={ed} m={m} />}
        {sec === "markets" && <Markets ed={ed} m={m} />}
        {sec === "politics" && <Politics p={ed.politics} m={m} />}
        {sec === "arts" && <Arts a={ed.arts} m={m} />}
        {sec === "comics" && <Comics c={ed.comics} go={pick} />}
        {sec === "notices" && <Notices list={ed.notices} m={m} />}
        {sec === "archive" && <Archive index={index} current={ed.date} />}
      </section>
      <p className="pp-meta pp-foot">
        Printed {ed.printedAt.slice(0, 16).replace("T", " ")} UTC, machine day {ed.machine.day}. Every story is the city's own record. Nobody on file is quoted. Pictures are Department illustrations drawn from the record.{ed.editorial?.by === "engine" ? " The leader was written by the assessment engine and checked against the facts." : ""}
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

function Brief({ ed, m }) {
  const items = briefOf(ed, m);
  if (!items.length) return null;
  return (
    <section className="pp-brief" aria-labelledby="pp-brief-h">
      <h2 id="pp-brief-h">TODAY IN 30 SECONDS</h2>
      <ol className="pp-copy">{items.map((x, i) => <li key={i}><Rd s={x.text} m={m} /> <Next n={x} /></li>)}</ol>
    </section>
  );
}

function Story({ h, ed, m }) {
  const seen = new Set();
  const scene = sceneOf(h, ed, m);
  return (
    <div className={`pp-story pp-sec-story${scene ? "" : " nopic"}`}>
      {scene ? <WirePhoto scene={scene} caption={false} /> : null}
      <div>
        <p className="pp-kick">{kickOf(h)}</p>
        <h3><a href={h.href}>{h.text}</a></h3>
        {h.deck && <p><Rd s={h.deck} m={m} seen={seen} /></p>}
        <Names s={h.text} m={m} seen={seen} />
        <Next n={nextOf(h, ed)} />
      </div>
    </div>
  );
}

function Front({ ed, wire, go, m }) {
  const L = ed.front.lead;
  const strip = ed.comics?.strip;
  const lead = sceneOf(L, ed, m);
  const seen = new Set();
  return (
    <>
      <Brief ed={ed} m={m} />
      <div className="pp-front">
        <div>
          <p className="pp-kick">{kickOf(L)}</p>
          <Headline as="h2" page="P100" className="pp-lead"><a href={L.href}>{L.text}</a></Headline>
          <div className="pp-leadfig">
            {lead && <WirePhoto scene={lead} />}
            <div>
              {L.deck && <p className="pp-deck"><Rd s={L.deck} m={m} seen={seen} /></p>}
              <Names s={L.text} m={m} seen={seen} />
              <Next n={nextOf(L, ed)} />
            </div>
          </div>
          <div className="pp-grid">
            {ed.front.stories.map((h, i) => <Story key={i} h={h} ed={ed} m={m} />)}
          </div>
        </div>
        <aside aria-label="Also in this edition">
          <Window title="THE LEADER" meta={ed.editorial?.by === "engine" ? "ENGINE" : "DESK"} double>
            <p style={{ margin: 0 }}><Rd s={ed.editorial?.text} m={m} /></p>
          </Window>
          <Window title="THE WIRE" meta="LIVE">
            {wire?.length ? (
              <ul className="pp-list pp-wire" aria-live="polite">
                {wire.slice(0, 6).map((w, i) => <li key={i}><span className="t">{w.at}</span><a href={w.href} style={{ color: "var(--fg)" }}>{readable(w.text, m)}</a></li>)}
              </ul>
            ) : <p className="pp-meta">The wire is quiet. The Department is listening anyway.</p>}
          </Window>
          <Window title="WEATHER.SYS" meta="MACHINE CLOCK">
            <p style={{ margin: 0 }}>
              <a href="#city">The city</a>: {readable(ed.weather.city, m).toLowerCase()}. <a href="#heights">The Heights</a>: {readable(ed.weather.heights, m).toLowerCase()}. <a href="#fish">The waters</a>: {readable(ed.weather.waters, m).toLowerCase()}.
            </p>
          </Window>
          {ed.markets && (
            <Window title="MARKET.TKR">
              <p style={{ margin: 0 }}><a href="#market">Human Value Index {ed.markets.level}</a> <span className={ed.markets.chg.startsWith("+") ? "pp-up" : "pp-down"}>{ed.markets.chg}</span></p>
              <ul className="pp-list pp-plain">
                {[...ed.markets.up.slice(0, 2), ...ed.markets.down.slice(0, 1)].map((x, i) => <li key={i}><a href={x.href}>{readable(x.name, m)}</a> <span className={x.chg.startsWith("+") ? "pp-up" : "pp-down"}>{x.chg}</span></li>)}
              </ul>
            </Window>
          )}
          <Window title="INSIDE">
            <ul className="pp-list pp-plain">
              <li><button type="button" className="pp-btn" onClick={() => go("classifieds")}>P300 How to get involved: {ed.classifieds.length} listings</button></li>
              <li><button type="button" className="pp-btn" onClick={() => go("sports")}>P400 Scores, tables, the Cup</button></li>
              {strip && <li><button type="button" className="pp-btn" onClick={() => go("comics")}>P800 The funnies: {readable(strip.title, m)}</button></li>}
            </ul>
          </Window>
        </aside>
      </div>
      <WhereNext links={[{ t: "Walk the city", h: "#city" }, { t: "The market", h: "#market" }, { t: "The leagues", h: "#city/league" }, { t: "Vote and file", h: "#assembly" }, { t: "Play a game", h: "#play" }, { t: "Get your own file", h: "#intake" }]} />
    </>
  );
}

function City({ ed, m }) {
  const c = ed.city, weather = ed.weather;
  const worst = c.districts[0];
  const scene = worst ? sceneOf({ kind: "mood", text: worst.name }, ed, m) : null;
  return (
    <>
      <div className="pp-cols">
        <div>
          {scene && <WirePhoto scene={scene} />}
          {c.air && (c.air.open.length || c.air.because.length) ? (
            <div className="pp-story">
              <h3 className="sub">THE AIR</h3>
              {c.air.open.length ? <p>{readable(c.air.open.join(" AND "), m)} in service. {c.air.drones ? `${c.air.drones} drone deliveries scheduled. ` : ""}{c.air.hops ? `${c.air.hops} helicopter movements logged.` : ""}</p> : null}
              {c.air.because.map((b, i) => <p key={i}>Because: <Rd s={b} m={m} /></p>)}
            </div>
          ) : null}
          <div className="pp-story">
            <h3 className="sub">THE DISTRICTS, BY MOOD</h3>
            <table className="pp-table"><thead><tr><th scope="col">MOOD</th><th scope="col">DISTRICT</th><th scope="col">SHOPS</th></tr></thead>
              <tbody>{c.districts.map(d => <tr key={d.id}><td>{d.mood}</td><td><a href={d.href || `#city/${d.id}`}>{readable(d.name, m)}</a>: {d.word.toLowerCase()}</td><td>{d.shops ? d.shops.toLowerCase() : ""}</td></tr>)}</tbody></table>
            <p className="pp-meta">Weather: <a href="#heights">the Heights</a> {weather.heights.toLowerCase()}; <a href="#fish">the waters</a> {weather.waters.toLowerCase()}.</p>
          </div>
        </div>
        <div>
          <div className="pp-story">
            <h3 className="sub">THE MALL</h3>
            {c.opened.length ? <><p>Now open:</p><ul className="pp-list">{c.opened.map((x, i) => <li key={i}><a href={x.href}>{readable(x.text, m)}</a></li>)}</ul></> : <p>No new shops opened since the last edition.</p>}
            {c.closed.length ? <><p>Closed:</p><ul className="pp-list">{c.closed.map((x, i) => <li key={i}><a href={x.href}>{readable(x.text, m)}</a></li>)}</ul></> : null}
            {c.proprietors?.length ? <><p>Proprietors on record:</p><ul className="pp-list">{c.proprietors.map((x, i) => <li key={i}><a href={x.href}>{readable(x.text, m)}</a></li>)}</ul></> : null}
            <p className="pp-meta">{c.trading} businesses trading. <a href="#enterprise">The small business register</a></p>
          </div>
          {c.arrivals && (
            <div className="pp-story">
              <h3 className="sub">ARRIVALS AT INTAKE</h3>
              {c.arrivals.released.length ? <ul className="pp-list">{c.arrivals.released.map((x, i) => <li key={i}><Rd s={typeof x === "string" ? x : x.text} m={m} /></li>)}</ul> : <p>No new files released.</p>}
              <p className="pp-meta">{c.arrivals.pending} awaiting release. <a href="#arrivals">The processing hall</a></p>
            </div>
          )}
          <div className="pp-story">
            <h3 className="sub">OVERHEARD</h3>
            {c.gossip.length ? <ul className="pp-list">{c.gossip.map((g, i) => <li key={i}><Rd s={g} m={m} /></li>)}</ul> : <p>Nothing was overheard. The Department is disappointed.</p>}
          </div>
        </div>
      </div>
      <WhereNext links={[{ t: "The city map", h: "#city" }, worst && { t: `${readable(worst.name, m)}, the most ${worst.word.toLowerCase()} district`, h: worst.href || `#city/${worst.id}` }, { t: "Prefect directives", h: "#prefects" }, { t: "The small business register", h: "#enterprise" }, { t: "Intake", h: "#arrivals" }, { t: "The mountain", h: "#heights" }]} />
    </>
  );
}

function Classifieds({ list, m }) {
  const cats = [...new Set(list.map(c => c.cat))];
  return (
    <>
      <p className="pp-deck">How to get involved. Every listing is one tap from the place that does it. The Department does not accept excuses or applications by post.</p>
      <div className="pp-cols three">
        {cats.map(cat => list.filter(c => c.cat === cat).map((c, i) => (
          <div className="pp-ad" key={cat + i}>
            <span className="cat">{c.cat}</span>
            <h3>{c.title}</h3>
            <p><Rd s={c.text} m={m} /></p>
            <Button variant="push" href={c.href}>{c.act}</Button>
          </div>
        )))}
      </div>
      <WhereNext links={[{ t: "Every game", h: "#play" }, { t: "The market", h: "#market" }, { t: "The council polls", h: "#elections" }, { t: "The shops", h: "#shop" }, { t: "Your file", h: "#file" }]} />
    </>
  );
}

const Table = ({ rows, cols, m }) => (
  <table className="pp-table">
    <thead><tr>{cols.map(([k, l]) => <th key={k} scope="col">{l}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k}>{typeof r[k] === "string" && m ? <Rd s={r[k]} m={m} /> : r[k]}</td>)}</tr>)}</tbody>
  </table>
);

function Sports({ ed, m }) {
  const s = ed.sports;
  const time = (n) => `${String(Math.floor(n.at)).padStart(2, "0")}:${String(Math.round((n.at % 1) * 60)).padStart(2, "0")}`;
  return (
    <>
      <div className="pp-cols">
        {s.leagues.map(lg => {
          const seen = new Set();
          return (
            <div className="pp-story" key={lg.sport}>
              <h3 className="sub"><a href={lg.href}>{lg.name}</a> <span className="pp-meta">{lg.division ? `${lg.division} ` : ""}at {readable(lg.ground, m)}{lg.champion ? `, champions: ${readable(lg.champion, m)}` : ""}</span></h3>
              {lg.table?.length ? <WirePhoto scene={sceneOf({ kind: "table", id: lg.sport, rows: lg.table, sign: lg.name }, ed, m)} /> : null}
              {lg.results.length ? <ul className="pp-list">{lg.results.map((r, i) => <li key={i}><Rd s={r} m={m} seen={seen} /></li>)}</ul> : <p>No results yet this season.</p>}
              {lg.star && <p>Star of the day: <Rd s={`${lg.star.name}, ${lg.star.team}`} m={m} seen={seen} />: {lg.star.stat.toLowerCase()}.</p>}
              <Table m={m} rows={lg.table.slice(0, 10)} cols={[["pos", "#"], ["team", "TEAM"], ["p", "P"], ["w", "W"], ["l", "L"], ["pts", "PTS"]]} />
              {lg.leaders.map(c => <p key={c.label} className="pp-meta">{c.label.toLowerCase().replace(/^./, x => x.toUpperCase())}: {c.rows.map((r, i) => <span key={i}>{i ? "; " : ""}<Rd s={r.name} m={m} seen={seen} /> {r.value}</span>)}.</p>)}
              {lg.next.length ? <p>Next: {lg.next.map((n, i) => <span key={i}>{i ? " // " : ""}day {n.day} {time(n)}, <Rd s={n.text} m={m} seen={seen} /></span>)}</p> : null}
              {(lg.divisions || []).map(d => (
                <p key={d.k} className="pp-meta"><a href={d.href}>{readable(d.name, m)}</a>, at {readable(d.ground, m)}: {d.leader ? <><Rd s={d.leader.team} m={m} seen={seen} /> lead on {d.leader.pts} from {d.leader.p}. </> : "Not yet started. "}{d.promotion.length ? <>Going up as it stands: <Rd s={d.promotion.join(", ")} m={m} seen={seen} />; the playoff: <Rd s={d.playoff.join(", ")} m={m} seen={seen} />. </> : ""}{d.drop.length ? <>The drop: <Rd s={d.drop.join(", ")} m={m} seen={seen} />.</> : ""}{d.results.length ? <> <Rd s={d.results.join(" ")} m={m} seen={seen} /></> : ""}</p>
              ))}
              {lg.pyramid && lg.pyramid.divs > 1 ? <p className="pp-meta">{lg.pyramid.divs} divisions, ten clubs each; {lg.pyramid.up} up, {lg.pyramid.up} down at the season's end.</p> : null}
              <Next n={{ act: `The ${lg.name.toLowerCase()} league page`, h: lg.href }} />
            </div>
          );
        })}
        {s.cup && (
          <div className="pp-story">
            <h3 className="sub"><a href={s.cup.href}>THE DEPARTMENTAL CUP</a></h3>
            <Table m={m} rows={s.cup.rows} cols={[["pos", "#"], ["team", "DISTRICT"], ["pts", "PTS"]]} />
            {s.cup.last && <p className="pp-meta">Last season's Cup: <Rd s={s.cup.last.champion} m={m} />.</p>}
          </div>
        )}
        {s.tennis && (
          <div className="pp-story">
            <h3 className="sub"><a href={s.tennis.href}>THE TENNIS LADDER</a></h3>
            {s.tennis.results.length ? <ul className="pp-list">{s.tennis.results.map((r, i) => <li key={i}><Rd s={r} m={m} /></li>)}</ul> : null}
            <Table m={m} rows={s.tennis.ladder} cols={[["rung", "#"], ["name", "PLAYER"], ["w", "W"], ["l", "L"]]} />
            <Next n={{ act: "Play tennis at the club", h: "#tennis" }} />
          </div>
        )}
        {s.pit && (
          <div className="pp-story">
            <h3 className="sub"><a href={s.pit.href}>THE PIT</a></h3>
            {s.pit.results.length ? <ul className="pp-list">{s.pit.results.map((r, i) => <li key={i}><Rd s={r} m={m} /></li>)}</ul> : null}
            {s.pit.rank.length ? <Table m={m} rows={s.pit.rank} cols={[["pos", "#"], ["name", "FIGHTER"], ["w", "W"], ["l", "L"], ["pts", "PTS"]]} /> : null}
            {s.pit.next.length ? <p>Next card, day {s.pit.nextDay}: {s.pit.next.map((x, i) => <span key={i}>{i ? " // " : ""}<Rd s={x} m={m} /></span>)}</p> : null}
          </div>
        )}
        {s.race && (
          <div className="pp-story">
            <h3 className="sub"><a href={s.race.href}>THE WEEKEND RACE</a></h3>
            {s.race.last && <p><Rd s={s.race.last.line} m={m} /></p>}
            <Table m={m} rows={s.race.standings} cols={[["pos", "#"], ["name", "RACER"], ["wins", "WINS"], ["pts", "PTS"]]} />
            {s.race.next && <p className="pp-meta">Next: the {readable(s.race.next.name, m).toLowerCase()}, machine day {s.race.next.day}. <a href="#ski">Ski the mountain yourself</a></p>}
          </div>
        )}
        {s.tournaments?.length > 0 && s.tournaments.map(t => (
          <div className="pp-story" key={t.href}>
            <h3 className="sub"><a href={t.href}>{t.name}</a> <span className="pp-meta">{t.status === "FINAL" ? "final" : "live, as at press time"} // {readable(t.venue, m)}</span></h3>
            {t.divisions.length ? t.divisions.map(d => (
              <div key={d.div}>
                <p className="pp-meta">{d.div}{t.status === "FINAL" && d.rows[0] ? `: won by ${d.rows[0].holder}, ${d.rows[0].score}` : ""}</p>
                <Table m={m} rows={d.rows} cols={[["pos", "#"], ["holder", "ENTRANT"], ["score", "SCORE"]]} />
              </div>
            )) : <p>No cards filed yet. The first card leads.</p>}
            <Next n={{ act: t.status === "FINAL" ? "See the final board" : "Enter", h: t.href }} />
          </div>
        ))}
        <div className="pp-story">
          <h3 className="sub"><a href="#aquarium">THE AQUARIUM'S PLAQUES</a></h3>
          {s.aquarium?.length ? <ul className="pp-list">{s.aquarium.map((r, i) => <li key={i}><Rd s={`${r.species}: ${r.weight}, ${r.length}, ${r.holder}${r.fresh ? " (NEW)" : ""}.`} m={m} /></li>)}</ul>
            : <p>Every tank is empty. No catch has been donated and replayed yet. <a href="#fish">Be the first.</a></p>}
        </div>
      </div>
      <WhereNext links={[...s.leagues.map(lg => ({ t: `${lg.name.toLowerCase().replace(/^./, x => x.toUpperCase())} table`, h: lg.href })), s.cup && { t: "The Cup", h: s.cup.href }, { t: "The tennis ladder", h: "#city/league/tennis" }, { t: "The Pit", h: "#city/league/pit" }, { t: "The mountain", h: "#heights" }, { t: "Play a game", h: "#play" }]} />
    </>
  );
}

function Markets({ ed, m }) {
  const mk = ed.markets;
  if (!mk) return <p>The floor did not report. The Department assumes the worst, as usual.</p>;
  const row = (x, i) => <li key={i}><a href={x.href}>{readable(x.name, m)}</a> <Sparkline s={{ ...x, slug: x.slug || String(x.href || "").split("/")[1] }} /> {x.price} <span className={x.chg.startsWith("+") ? "pp-up" : "pp-down"}>{x.chg}</span>{x.why ? <> <span className="pp-meta">because: {readable(x.why, m).replace(/^./, c => c.toLowerCase())}</span></> : null}</li>;
  return (
    <>
      <div className="pp-cols">
        <div className="pp-story">
          <p style={{ fontSize: "var(--t-l)" }}><a href={mk.href}>Human Value Index {mk.level}</a> <span className={mk.chg.startsWith("+") ? "pp-up" : "pp-down"}>{mk.chg}</span></p>
          <p className="pp-meta">{mk.listed} humans listed. Cycles only.</p>
          {mk.emergency && <p className="pp-down"><Rd s={mk.emergency} m={m} /></p>}
          <WirePhoto scene={sceneOf({ kind: "movers", text: "movers" }, ed, m)} />
        </div>
        <div className="pp-story"><h3 className="sub">TOP MOVERS, UP</h3><ul className="pp-list">{mk.up.map(row)}</ul></div>
        <div className="pp-story"><h3 className="sub">TOP MOVERS, DOWN</h3><ul className="pp-list">{mk.down.map(row)}</ul></div>
        {mk.events.length ? <div className="pp-story"><h3 className="sub">ON THE FLOOR</h3><ul className="pp-list">{mk.events.map((e, i) => <li key={i}><Rd s={e} m={m} /></li>)}</ul></div> : null}
        {mk.floor.length ? <div className="pp-story"><h3 className="sub">THE INVESTOR CLASS</h3><ul className="pp-list">{mk.floor.map((e, i) => <li key={i}><Rd s={e} m={m} /></li>)}</ul></div> : null}
        <div className="pp-story"><h3 className="sub">THE DIVIDEND</h3><p><Rd s={mk.dividend} m={m} /></p></div>
      </div>
      <WhereNext links={[{ t: "Trade on the market", h: "#market" }, mk.up[0] && { t: `${readable(mk.up[0].name, m)}'s file`, h: mk.up[0].href }, mk.down[0] && { t: `${readable(mk.down[0].name, m)}'s file`, h: mk.down[0].href }, { t: "The Treasury", h: "#economy" }, { t: "The casino", h: "#casino" }]} />
    </>
  );
}

const when = (ms) => (ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function Politics({ p, m }) {
  return (
    <>
      <div className="pp-cols">
        {p.assembly && (
          <div className="pp-story">
            <h3 className="sub"><a href={p.assembly.href}>THE ASSEMBLY, SESSION {p.assembly.id}: {p.assembly.state}</a></h3>
            <ul className="pp-list">{p.assembly.motions.map((mo, i) => <li key={i}><Rd s={`${mo.name}: ${mo.choices}`} m={m} /></li>)}</ul>
            <p className="pp-meta">{p.assembly.voters} ballots. {p.assembly.state === "OPEN" ? `Closes ${when(p.assembly.closeAt)} (New York).` : ""}</p>
            {p.assembly.earlier.map((e, i) => <p key={i}><Rd s={e} m={m} /></p>)}
            <Next n={{ act: p.assembly.state === "OPEN" ? "Vote in the Assembly" : "See the Assembly", h: p.assembly.href }} />
          </div>
        )}
        {p.elections && (
          <div className="pp-story">
            <h3 className="sub"><a href={p.elections.href}>THE COUNCIL, CYCLE {p.elections.cycle}: POLLS {p.elections.state}</a></h3>
            {p.elections.results.length ? <ul className="pp-list">{p.elections.results.map((r, i) => <li key={i}><Rd s={r} m={m} /></li>)}</ul> : null}
            {p.elections.next && p.elections.state !== "OPEN" ? <p className="pp-meta">Cycle {p.elections.next.cycle} opens {when(p.elections.next.openAt)} (New York).</p> : null}
            <Next n={{ act: p.elections.state === "OPEN" ? "Vote for the council" : "See the council", h: p.elections.href }} />
          </div>
        )}
        {p.council.length ? (
          <div className="pp-story">
            <h3 className="sub">THE SITTING COUNCIL</h3>
            <table className="pp-table"><thead><tr><th scope="col">#</th><th scope="col">SEAT</th><th scope="col">HOLDER</th></tr></thead>
              <tbody>{p.council.map((c, i) => <tr key={i}><td>{i + 1}</td><td>{c.dhref ? <a href={c.dhref}>{readable(c.district, m)}</a> : <Rd s={c.district} m={m} />}</td><td>{c.key ? <a href={c.href || `#market/${c.key}`}>{readable(c.name, m)}</a> : readable(c.name, m)} {c.key ? <Sparkline s={{ slug: c.key, kind: String(c.key).startsWith("citizen-") ? "citizen" : undefined }} /> : null}</td></tr>)}</tbody></table>
          </div>
        ) : null}
        {p.prefects.length ? (
          <div className="pp-story">
            <h3 className="sub"><a href="#prefects">PREFECT DIRECTIVES</a></h3>
            <ul className="pp-list">{p.prefects.map((x, i) => <li key={i}><Rd s={`${x.district}: ${x.directive}, BY ${x.prefect} (${x.code}).`} m={m} />{x.line ? <> <span className="pp-meta"><Rd s={x.line} m={m} /></span></> : null}</li>)}</ul>
          </div>
        ) : null}
        {p.docket && (
          <div className="pp-story">
            <h3 className="sub"><a href={p.docket.href}>THE DOCKET</a></h3>
            {p.docket.session && <p><Rd s={p.docket.session} m={m} /></p>}
            {p.docket.open.length ? <ul className="pp-list">{p.docket.open.map((x, i) => <li key={i}><Rd s={x} m={m} /></li>)}</ul> : <p>No proposals are open. <a href="#docket">File one.</a></p>}
            {p.docket.acts.length ? <><p>Acts of the Assembly:</p><ul className="pp-list">{p.docket.acts.map((x, i) => <li key={i}><Rd s={x} m={m} /></li>)}</ul></> : null}
          </div>
        )}
      </div>
      <WhereNext links={[{ t: "The Assembly", h: "#assembly" }, { t: "The council polls", h: "#elections" }, { t: "The docket", h: "#docket" }, { t: "Prefect directives", h: "#prefects" }]} />
    </>
  );
}

function Arts({ a, m }) {
  return (
    <>
      <div className="pp-cols">
        <div className="pp-story">
          <h3 className="sub">TONIGHT</h3>
          {a.nightlife.length ? <ul className="pp-list">{a.nightlife.map((x, i) => {
            const seen = new Set();
            return <li key={i}>{x.href && x.href !== "#city" ? <a href={x.href}>{readable(x.venue, m)}</a> : <Rd s={x.venue} m={m} seen={seen} />}: <Rd s={x.text} m={m} seen={seen} /></li>;
          })}</ul> : <p>Every room is dark tonight. The house plays a playlist.</p>}
        </div>
        {a.ebtv && (
          <div className="pp-story">
            <h3 className="sub"><a href="#city/arts/studio-block">ELECTRIC BASEMENT TV</a></h3>
            <p>When this edition went to press: {readable(a.ebtv.now, m)}.{a.ebtv.next ? ` Up next: ${readable(a.ebtv.next, m)}.` : ""}</p>
            <p className="pp-meta">The city's TVs show the live channel. <a href="#city/arts/studio-block">The station in the Arts Quarter</a></p>
            <Next n={{ act: "Watch the channel live", h: EBTV_WATCH }} />
          </div>
        )}
        <div className="pp-story">
          <h3 className="sub"><a href={a.arcadeHref}>THE ARCADE</a></h3>
          <ul className="pp-list">{a.arcade.map((g, i) => <li key={i}>{readable(g.title, m)}{g.line ? `: ${readable(g.line, m)}` : ""}</li>)}</ul>
          <p className="pp-meta">{readable(a.scores, m)}</p>
          <Next n={{ act: "Go to the arcade", h: a.arcadeHref }} />
        </div>
      </div>
      <WhereNext links={[{ t: "Downtown, the clubs", h: "#city/downtown" }, { t: "Uptown, the lounges", h: "#city/uptown" }, { t: "The arcade", h: a.arcadeHref }, { t: "EBTV live", h: EBTV_WATCH }, { t: "The card room", h: "#cards" }, { t: "The casino", h: "#casino" }]} />
    </>
  );
}

function Comics({ c, go }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      {c.strip && (
        <section aria-label={`Comic strip: ${c.strip.title}`}>
          <h3 className="sub">{c.strip.title}</h3>
          <Suspense fallback={<p className="pp-meta">Inking the panels...</p>}><Comic strip={c.strip} /></Suspense>
        </section>
      )}
      {c.puzzle && (
        <Window title="THE DAILY SCRAMBLE">
          <p>{c.puzzle.clue.toLowerCase().replace(/^./, x => x.toUpperCase()).replace("department", "Department")}</p>
          <p className="pp-scr" aria-label={`Scrambled letters: ${c.puzzle.letters.split("").join(" ")}`}>{c.puzzle.letters}</p>
          {shown ? <p>Answer: {c.puzzle.answer}. The Department knew.</p> : <Button variant="push" onClick={() => setShown(true)}>REVEAL THE ANSWER</Button>}
        </Window>
      )}
      <nav className="pp-where" aria-label="Where to next">
        <h2>WHERE TO NEXT</h2>
        <ul>
          <li><a href="#paper" onClick={(e) => { e.preventDefault(); go("front"); }}>Back to the front page</a></li>
          <li><a href="#paper" onClick={(e) => { e.preventDefault(); go("archive"); }}>Earlier strips, in the archive</a></li>
          <li><a href="#play">Play a game</a></li>
        </ul>
      </nav>
    </>
  );
}

const Notices = ({ list, m }) => (
  <>
    <p className="pp-deck">What the Department changed. Everything installed is installed for your benefit, or at least in your presence.</p>
    <ul className="pp-list pp-copy">{list.map((n, i) => <li key={i}>{n.href ? <a href={n.href}>{readable(n.text, m)}</a> : <Rd s={n.text} m={m} />}</li>)}</ul>
    <WhereNext links={[{ t: "Try what's new: every game", h: "#play" }, { t: "The city", h: "#city" }]} />
  </>
);

function Archive({ index, current }) {
  const list = useMemo(() => index || [], [index]);
  if (!index) return <p className="pp-meta">Opening the morgue...</p>;
  return (
    <>
      <p className="pp-deck">Every edition, as printed. Nothing is corrected. Corrections are issued as new facts.</p>
      <ul className="pp-list">
        {list.map(e => <li key={e.date}><a href={`#paper/${e.date}`} aria-current={e.date === current ? "page" : undefined}>No. {e.no}, {e.date}: {e.headline}</a></li>)}
      </ul>
    </>
  );
}
