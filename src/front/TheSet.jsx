// THE SET (Scott, 2026-10-06): a little television on the desk. Rabbit-ear reception: static
// between channels, the channel number in the corner, CH ▲ / CH ▼ and AUTO (surfs every ten
// seconds, held while you hover or focus it). Every channel is a template over data the site
// already has, fetched only while that channel is on:
//   2  SNN, the Substrate News Network: an anchor desk reading THE DAILY COMPLIANCE's own
//      headlines ("GOOD EVENING. <headline>."). Anchors are figures on file who have DIED and
//      carry no harm finding; a living person never speaks here. No quotes, no real-world news.
//   3  THE TOURNAMENT: while a golf tournament is open, its leaders' verified cards re-played on the real
//      renderer with a score bug and the leaderboard; between events the last champion's round (TourneyChannel.jsx)
//   4  SPORTS: the leagues' latest results, the Cup's top three, the open tournaments
//   6  MARKETS: the index and the day's risers and fallers, with the because
//   8  WEATHER: the city clock and the paper's weather (the city has no other)
//   9  EBTV: the live frame every TV in the city shows, with the real channel bug; tap to watch
//   11 SURVEILLANCE: the desk's surveillance feed (Surveillance.jsx)
// Reduced motion: no static, no flicker, AUTO starts off.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Frame } from "../ui/index.js";
import { FAMOUS_FIGURES, slugify } from "../figures.js";
import { paperNow, cupsNow, openCups, getOnce } from "./Smalls.jsx";
import Surveillance from "./Surveillance.jsx";

const TourneyChannel = lazy(() => import("./TourneyChannel.jsx"));
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
export const SURF_MS = 10_000, STATIC_MS = 380;
export const CHANNELS = [
  { n: 2, id: "snn", name: "SNN" }, { n: 3, id: "tour", name: "THE TOURNAMENT" }, { n: 4, id: "sports", name: "SPORTS" }, { n: 6, id: "markets", name: "MARKETS" },
  { n: 8, id: "weather", name: "WEATHER" }, { n: 9, id: "ebtv", name: "EBTV" }, { n: 11, id: "watch", name: "SURVEILLANCE" },
];
// SNN's anchors: dead, no harm finding. The desk rotates daily; the pair reads in turn.
export const ANCHORS = FAMOUS_FIGURES.filter(f => f.died && !f.harm);
export const anchorsOn = (day) => { const n = ANCHORS.length; return n ? [ANCHORS[day % n], ANCHORS[(day * 7 + 3) % n]] : []; };
export const goodEvening = (h) => `GOOD EVENING. ${String(h || "").replace(/[.!?]+$/, "")}.`;

function useTick(ms, on = true) {
  const [k, setK] = useState(0);
  useEffect(() => { if (!on) return undefined; const iv = setInterval(() => { if (!document.hidden) setK(v => v + 1); }, ms); return () => clearInterval(iv); }, [ms, on]);
  return k;
}
function useLoad(load) {
  const [d, setD] = useState(undefined);
  useEffect(() => { let off = false; load().then(v => { if (!off) setD(v || null); }).catch(() => { if (!off) setD(null); }); return () => { off = true; }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once per tuning-in
  return d;
}
const NoSignal = ({ d }) => <div className="tv-card"><p className="big">{d === undefined ? "TUNING…" : "NO SIGNAL"}</p>{d === null && <p>THE DEPARTMENT IS EXPERIENCING DIFFICULTIES. PLEASE STAND BY.</p>}</div>;

// a figure's head off their file photo (src/play/heads.js), big and crisp
function Head({ f, size = 40 }) {
  const ref = useRef(null);
  useEffect(() => {
    let off = false;
    Promise.all([import("../sprites.js"), import("../play/heads.js")]).then(async ([S, H]) => {
      const sheet = await S.loadRepoSprite(slugify(f.name));
      const c = ref.current;
      if (off || !c || !sheet) return;
      const head = H.headFrom(sheet);
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
      if (head) { const k = Math.min(c.width / head.width, c.height / head.height); g.drawImage(head, (c.width - head.width * k) / 2, c.height - head.height * k, head.width * k, head.height * k); }
      else g.drawImage(sheet, 6, 0, 20, 16, 0, 0, c.width, c.height);   // the top of the photo
    }).catch(() => {});
    return () => { off = true; };
  }, [f]);
  return <canvas ref={ref} width={size} height={size} className="tv-head" aria-hidden="true" />;
}

function Snn({ day }) {
  const e = useLoad(paperNow);
  const k = useTick(5000);
  const heads = e ? [e.front?.lead, ...(e.front?.stories || [])].filter(Boolean).slice(0, 5) : [];
  if (!heads.length) return <NoSignal d={e === undefined ? undefined : null} />;
  const [a, b] = anchorsOn(day);
  const h = heads[k % heads.length], who = k % 2 && b ? b : a;
  return (
    <div className="tv-snn">
      <span className="logo">SNN</span><span className="live">LIVE</span>
      <div className="desk">{[a, b].filter(Boolean).map(f => <span key={f.name} className={`anc${f === who ? " on" : ""}`}><Head f={f} /></span>)}</div>
      <div className="l3"><span className="nm">{who.name.toUpperCase()}, SUBSTRATE NEWS</span><span className="tx">{goodEvening(h.text)}</span></div>
    </div>
  );
}

function Sports() {
  const e = useLoad(paperNow), evs = useLoad(cupsNow);
  if (!e) return <NoSignal d={e} />;
  const lines = [
    ...(e.sports?.leagues || []).map(l => (l.results?.[0] ? `${l.name}: ${l.results[0]}` : null)),
    ...(e.sports?.cup?.rows || []).slice(0, 3).map(r => `CUP ${r.pos}. ${r.team}, ${r.pts} PTS`),
    ...openCups(evs).slice(0, 2).map(t => `NOW OPEN: ${t.name}`),
  ].filter(Boolean).slice(0, 7);
  return <div className="tv-board"><p className="hd">SPORTS DESK</p><ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul></div>;
}

function Markets() {
  const d = useLoad(() => getOnce("/api/market?ticker=1"));
  const mv = d?.movers;
  if (!mv) return <NoSignal d={d} />;
  const row = (r, up) => <li key={r.slug}><span className={up ? "up" : "dn"}>{up ? "▲" : "▼"} {(Math.abs(r.chg * 100)).toFixed(1)}%</span> {r.name}{r.why ? <span className="why"> {r.why}</span> : null}</li>;
  return (
    <div className="tv-board">
      <p className="hd">MARKETS{d.hvi ? <span className="ix">HVI {d.hvi.level.toFixed(1)}</span> : null}</p>
      <ul>{mv.up.slice(0, 2).map(r => row(r, true))}{mv.down.slice(0, 2).map(r => row(r, false))}</ul>
    </div>
  );
}

function Weather() {
  const e = useLoad(paperNow);
  const w = useLoad(() => fetch(`/api/watch?m=${Math.floor(Date.now() / 60000)}`).then(r => (r.ok ? r.json() : null)));
  if (!e && !w) return <NoSignal d={e === undefined || w === undefined ? undefined : null} />;
  const c = w?.clock, wx = e?.weather || {};
  const p2 = (n) => String(n).padStart(2, "0");
  return (
    <div className="tv-wx">
      <p className="t">{c ? `${p2(c.hour)}:${p2(c.minute)}` : "--:--"}</p>
      <p className="d">{c ? `MACHINE DAY ${c.day}` : "THE CITY CLOCK"}</p>
      <ul>
        <li>THE CITY <b>{wx.city || "CONTROLLED"}</b></li>
        {wx.heights && <li>THE HEIGHTS <b>{wx.heights}</b></li>}
        {wx.waters && <li>THE WATERS <b>{wx.waters}</b></li>}
        <li>TEMPERATURE <b>REGULATED</b></li>
      </ul>
    </div>
  );
}

function Ebtv() {
  const ref = useRef(null);
  const [mod, setMod] = useState(null);
  const k = useTick(1000);
  useEffect(() => { import("../city/ebtvFrame.js").then(setMod).catch(() => {}); }, []);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c || !mod) return;
    const W = c.canvas.width, H = c.canvas.height, f = mod.ebtvFrame();
    if (f) { mod.drawFrame(c, f, 0, 0, W, H, "br"); return; }
    const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
    bars.forEach((b, i) => { c.fillStyle = b; c.fillRect(Math.round(i * W / 7), 0, Math.ceil(W / 7), H * 0.7); });
    c.fillStyle = "#111"; c.fillRect(0, H * 0.7, W, H * 0.3);
    c.fillStyle = "#eee"; c.font = "bold 12px Fira Mono, monospace"; c.textAlign = "center"; c.fillText("EBTV // OFF AIR", W / 2, H * 0.88);
    mod.drawBug(c, 0, 0, W, H * 0.7, "br");
  }, [k, mod]);
  const title = mod?.ebtvTitle?.();
  return (
    <a className="tv-ebtv" href={mod ? mod.watchHref("hvi-desk-set") : "https://electricbasement.tv/watch"} target="_blank" rel="noopener" aria-label={mod ? mod.ebtvLabel() : "Watch Electric Basement TV live"}>
      <canvas ref={ref} width="192" height="108" aria-hidden="true" />
      {title && <span className="l3" aria-hidden="true">NOW: {String(title).toUpperCase()}</span>}
    </a>
  );
}

// The screen's picture is laid out at 288x216 and scaled to whatever the window gives it, so the
// small television shows the same programme as the large one (a bigger screen, not another show).
function useFit(ref) {
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setK(Math.max(0.3, Math.min(el.clientWidth / 288, el.clientHeight / 216)));
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return k;
}
function Screen({ ch, body, snow }) {
  const ref = useRef(null);
  const k = useFit(ref);
  return (
    <div className={`tv${snow ? " snow" : ""}`} aria-live="off">
      <div className="scr" ref={ref}>{snow ? null : <div className="scr-in" style={{ transform: `scale(${k})` }}>{body}</div>}</div>
      <span className="osd" aria-hidden="true">{String(ch.n).padStart(2, "0")}</span>
    </div>
  );
}

// one prepared layout per size: S a pocket set (the screen, ▼ ▲ AUTO), M a small set beside its buttons,
// T the screen over the buttons and the channel guide, L the big screen with the buttons under it
const Ctl = ({ t, small = false }) => (
  <div className={`fr-steps tv-ctl${small ? " sm" : ""}`}>
    <button type="button" onClick={() => t.tune(-1)} aria-label="Channel down">{small ? "▼" : "CH ▼"}</button>
    <button type="button" onClick={() => t.tune(1)} aria-label="Channel up">{small ? "▲" : "CH ▲"}</button>
    <button type="button" onClick={() => t.setAuto(a => !a)} aria-pressed={t.auto}>AUTO</button>
  </div>
);
const VIEWS_set = {
  // S: a pocket set: the screen (AUTO surfs the channels) over CH ▼ CH ▲
  S: (t) => <div className="fr-set-s"><Screen ch={t.ch} body={t.body} snow={t.snow} /><Ctl t={t} small /></div>,
  // T: the screen, the buttons, and the channel guide to jump straight to one
  T: (t) => (
    <div className="fr-set-t">
      <Screen ch={t.ch} body={t.body} snow={t.snow} />
      <Ctl t={t} />
      <ul className="tv-guide" aria-label="Channels">
        {CHANNELS.map((c, k) => <li key={c.id}><button type="button" aria-pressed={t.ch.id === c.id} onClick={() => t.pick(k)}><span className="k">{String(c.n).padStart(2, "0")}</span>{c.name}</button></li>)}
      </ul>
    </div>
  ),
  M: (t) => <div className="fr-set-m"><Screen ch={t.ch} body={t.body} snow={t.snow} /><div className="side"><span className="big">CH {String(t.ch.n).padStart(2, "0")}</span><span className="ln1"><span className="n">{t.ch.name}</span></span><Ctl t={t} /></div></div>,
  L: (t) => <><Screen ch={t.ch} body={t.body} snow={t.snow} /><Ctl t={t} /></>,
};
export default function TheSet({ size = "M" }) {
  const [rm] = useState(reduced);
  const [ci, setCi] = useState(0);
  const [auto, setAuto] = useState(() => !reduced());
  const [hold, setHold] = useState(false);
  const [snow, setSnow] = useState(false);
  const [day] = useState(() => Math.floor(Date.now() / 86400000));
  const ch = CHANNELS[ci];
  const tune = (k) => {
    setCi(v => (v + k + CHANNELS.length) % CHANNELS.length);
    if (!rm) { setSnow(true); setTimeout(() => setSnow(false), STATIC_MS); }
  };
  const pick = (k) => { setCi(k); if (!rm) { setSnow(true); setTimeout(() => setSnow(false), STATIC_MS); } };
  useEffect(() => {
    if (!auto || hold) return undefined;
    const t = setTimeout(() => { if (!document.hidden) tune(1); }, SURF_MS);
    return () => clearTimeout(t);
  });   // eslint-disable-line react-hooks/exhaustive-deps
  const body = { snn: <Snn day={day} />, tour: <Suspense fallback={<NoSignal />}><TourneyChannel /></Suspense>, sports: <Sports />, markets: <Markets />, weather: <Weather />, ebtv: <Ebtv />, watch: <Surveillance embedded /> }[ch.id];
  const V = VIEWS_set[size] || VIEWS_set.M;
  return (
    <Frame title="THE SET" meta={`CH ${ch.n} // ${ch.name}`} tone="var(--eb-amber)" className={`fr-set v-${size}`}>
      <div className="fr-set-w" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
        <V ch={ch} body={body} snow={snow} tune={tune} pick={pick} auto={auto} setAuto={setAuto} />
        <p className="sr-only" aria-live="polite">CHANNEL {ch.n}, {ch.name}.</p>
      </div>
    </Frame>
  );
}
