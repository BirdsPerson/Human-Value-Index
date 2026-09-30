import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GAME, GAMES, ITCH_LINE, EB_SHOP, EBTV_SITE, EBTV_STREAM, EBTV_NOW, utm, highScore, clickBody, setEbtvNow, ebtvNow } from "./funnels.js";
import { machineClock } from "./sim.js";

// The funnels' overlays (funnels.js has the data): a CRT that plays an Iridescent game, the
// Arcade's cabinet floor, the EB SHOP's live stock with its turntable videos, and EBTV's
// live stream. Anything in the city opens one with openFunnel(spec); FunnelHost (mounted
// once by City.jsx) shows it and keeps EBTV's now-playing fresh for the ON AIR light and the
// bar TVs. Every link out is tagged (funnels.utm) and counted (/api/funnel, anonymous).
//   spec: {kind: "game", slug, campaign} | {kind: "arcade"} | {kind: "shop", campaign} | {kind: "ebtv", campaign}

export function openFunnel(spec) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hvi-funnel", { detail: spec }));
}
export function countFunnel(campaign, kind, url = null) {
  try {
    const body = JSON.stringify(clickBody(campaign, kind, url));
    if (navigator.sendBeacon && navigator.sendBeacon("/api/funnel", new Blob([body], { type: "text/plain" }))) return;
    fetch("/api/funnel", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* a lost click never breaks a link */ }
}

// A link out: tagged for the building, counted when followed, a new tab.
function Out({ href, campaign, content, className = "hvi-fn-out", children }) {
  const url = utm(href, campaign, content);
  return <a className={className} href={url} target="_blank" rel="noopener" onClick={() => countFunnel(campaign, "out", url)}>{children}</a>;
}

const CSS = `
.hvi-fn-veil{position:fixed;inset:0;z-index:1000;background:rgba(2,6,3,.82);display:flex;align-items:center;justify-content:center;padding:var(--s3,12px)}
.hvi-fn{font-family:var(--mono);color:var(--fg);background:var(--bg,#0a0f0a);border:1px solid var(--line-hi,#2f6a42);width:min(1080px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;box-shadow:0 0 0 1px #000,0 20px 60px rgba(0,0,0,.6)}
.hvi-fn-head{display:flex;align-items:center;gap:var(--s3,12px);padding:var(--s2,8px) var(--s3,12px);border-bottom:1px solid var(--line,#1f4a2c)}
.hvi-fn-head h2{margin:0;font-size:var(--t-m,16px);letter-spacing:.06em;color:var(--accent,#4ade80);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hvi-fn-head .meta{font-size:var(--t-xs,12px);color:var(--fg-mute)}
.hvi-fn-x,.hvi-fn-btn{font:inherit;font-size:var(--t-s,14px);min-height:44px;min-width:44px;background:transparent;color:var(--fg);border:1px solid var(--line-hi,#2f6a42);cursor:pointer;padding:0 var(--s3,12px)}
.hvi-fn-x:hover,.hvi-fn-btn:hover{background:var(--panel-hi,#132013)}
.hvi-fn-x:focus-visible,.hvi-fn-btn:focus-visible,.hvi-fn-out:focus-visible,.hvi-fn-item:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.hvi-fn-body{overflow:auto;padding:var(--s3,12px);display:flex;flex-direction:column;gap:var(--s3,12px)}
.hvi-fn-foot{display:flex;flex-wrap:wrap;gap:var(--s2,8px) var(--s4,16px);align-items:center;font-size:var(--t-xs,12px);color:var(--fg-dim)}
.hvi-fn-out{color:var(--accent,#4ade80);display:inline-flex;align-items:center;min-height:44px;text-decoration:underline;text-underline-offset:3px}
.hvi-fn-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 var(--s4,16px);background:var(--accent);color:var(--accent-ink);font-weight:700;text-decoration:none;letter-spacing:.05em}
.hvi-fn-note{font-size:var(--t-s,14px);color:var(--fg-dim);margin:0;line-height:1.5}
.hvi-fn-crt{position:relative;background:#16121e;padding:18px 18px 26px;border-radius:18px;box-shadow:inset 0 0 0 3px #2a2436,inset 0 0 30px #000}
.hvi-fn-crt .glass{position:relative;border-radius:14px/18px;overflow:hidden;background:#000;box-shadow:0 0 24px rgba(167,139,250,.25)}
.hvi-fn-crt iframe,.hvi-fn-crt video{display:block;width:100%;height:min(66dvh,620px);border:0;background:#000}
.hvi-fn-crt .scan{pointer-events:none;position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}
.hvi-fn-crt .led{position:absolute;right:26px;bottom:8px;width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 6px #ef4444}
.hvi-fn-crt .brand{position:absolute;left:24px;bottom:5px;font-size:10px;letter-spacing:.2em;color:#6b5a8a}
.hvi-fn-dark{height:min(46dvh,420px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:16px;color:#e8d36a}
.hvi-fn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--s3,12px)}
.hvi-fn-item{font:inherit;text-align:left;background:var(--panel,#0d140d);color:var(--fg);border:1px solid var(--line,#1f4a2c);padding:0;cursor:pointer;display:flex;flex-direction:column;min-height:44px}
.hvi-fn-item:hover{border-color:var(--accent)}
.hvi-fn-item img{width:100%;aspect-ratio:1;object-fit:cover;background:#111;display:block}
.hvi-fn-item .t{padding:6px 8px 2px;font-size:var(--t-xs,12px);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hvi-fn-item .p{padding:0 8px 8px;font-size:var(--t-s,14px);color:var(--warn,#fbbf24);display:flex;justify-content:space-between;gap:6px}
.hvi-fn-tag{font-size:10px;letter-spacing:.08em;padding:1px 5px;border:1px solid currentColor}
.hvi-fn-tag.live{color:var(--accent)}.hvi-fn-tag.beta{color:#f97316}.hvi-fn-tag.dev{color:var(--fg-mute)}.hvi-fn-tag.tt{color:#f472b6}
.hvi-fn-cab{font:inherit;text-align:left;cursor:pointer;background:#16121e;color:#e5e7eb;border:1px solid #2a2436;padding:12px;display:flex;flex-direction:column;gap:6px;min-height:120px}
.hvi-fn-cab:hover{border-color:#a78bfa}
.hvi-fn-cab .mq{font-weight:700;letter-spacing:.06em;padding:4px 6px;color:#0b0b0f}
.hvi-fn-cab .hs{font-size:var(--t-xs,12px);color:#67e8f9}
.hvi-fn-cab.dev{opacity:.7}.hvi-fn-cab.dev .mq{background:#3a3a3a;color:#9ca3af}
.hvi-fn-detail{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:var(--s4,16px);align-items:start}
.hvi-fn-detail video,.hvi-fn-detail img{width:100%;max-height:60dvh;object-fit:contain;background:#000;display:block}
.hvi-fn-now{font-size:var(--t-s,14px)}.hvi-fn-now b{color:var(--warn,#fbbf24);font-weight:400}
@media (max-width:640px){.hvi-fn-head .meta{display:none}.hvi-fn-veil{padding:0}.hvi-fn{max-height:100dvh;height:100dvh;border:0}.hvi-fn-detail{grid-template-columns:1fr}.hvi-fn-crt{padding:10px 10px 22px;border-radius:12px}.hvi-fn-crt iframe,.hvi-fn-crt video{height:62dvh}.hvi-fn-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
function injectStyles() {
  let el = document.getElementById("hvi-funnel-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-funnel-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}

// ---- EBTV's now playing: read every minute while the city is open --------------------------
function useEbtvNow() {
  const [now, setNow] = useState(ebtvNow());
  useEffect(() => {
    let dead = false;
    const read = () => fetch(EBTV_NOW, { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then(j => { if (dead) return; setEbtvNow(j); setNow(ebtvNow()); });
    read();
    const iv = setInterval(read, 60 * 1000);
    return () => { dead = true; clearInterval(iv); };
  }, []);
  return now;
}

export default function FunnelHost() {
  const [spec, setSpec] = useState(null);
  const now = useEbtvNow();
  useEffect(() => {
    const on = (e) => { const s = e.detail; if (!s) return; injectStyles(); setSpec(s); countFunnel(s.campaign || (s.kind === "arcade" ? "the-arcade" : "city"), "open"); };
    window.addEventListener("hvi-funnel", on);
    if (import.meta.env?.DEV) window.__hviFunnel = openFunnel;
    return () => window.removeEventListener("hvi-funnel", on);
  }, []);
  const close = useCallback(() => setSpec(null), []);
  if (!spec) return null;
  // on the body: the page's own layers (the bottom bar, the animated frames) stay underneath
  return createPortal(<Overlay spec={spec} setSpec={setSpec} close={close} now={now} />, document.body);
}

function Overlay({ spec, setSpec, close, now }) {
  const ref = useRef(null), opener = useRef(typeof document !== "undefined" ? document.activeElement : null);
  useEffect(() => {
    ref.current?.querySelector(".hvi-fn-x")?.focus();
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    window.addEventListener("keydown", key);
    const back = opener.current;
    return () => { window.removeEventListener("keydown", key); back?.focus?.(); };
  }, [close]);
  let title, meta, body;
  if (spec.kind === "game") ({ title, meta, body } = gameView(spec, setSpec));
  else if (spec.kind === "arcade") ({ title, meta, body } = { title: "THE ARCADE // CABINET FLOOR", meta: `${GAMES.length} CABINETS`, body: <ArcadeFloor setSpec={setSpec} /> });
  else if (spec.kind === "shop") ({ title, meta, body } = { title: "EB SHOP // LIVE STOCK", meta: "SHOP.ELECTRICBASEMENT.TV", body: <Shop campaign={spec.campaign || "eb-shop"} /> });
  else ({ title, meta, body } = { title: "ELECTRIC BASEMENT TV", meta: "LIVE", body: <Ebtv campaign={spec.campaign || "ebtv-station"} now={now} /> });
  return (
    <div className="hvi-fn-veil" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="hvi-fn" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="hvi-fn-head">
          {spec.back && <button type="button" className="hvi-fn-btn" onClick={() => setSpec(spec.back)} aria-label="Back to the cabinet floor">◀</button>}
          <h2>{title}</h2>
          <span className="meta">{meta}</span>
          <button type="button" className="hvi-fn-x" onClick={close} aria-label="Close">[ X ]</button>
        </div>
        <div className="hvi-fn-body">{body}</div>
      </div>
    </div>
  );
}

// ---- a game in its cabinet -------------------------------------------------------------------
function gameView(spec, setSpec) {
  const g = GAME[spec.slug];
  const campaign = spec.campaign || "the-arcade";
  if (!g) return { title: "CABINET UNPLUGGED", meta: "", body: <p className="hvi-fn-note">THIS CABINET HAS BEEN REMOVED FROM THE FLOOR. THE DEPARTMENT KEEPS THE COINS.</p> };
  const hs = highScore(g.slug, spec.place || "arcade", machineClock().day);
  const tag = <span className={`hvi-fn-tag ${g.status}`}>{g.status === "live" ? "NOW PLAYING" : g.status === "beta" ? "BETA" : "OUT OF ORDER"}</span>;
  let screen;
  if (g.self) {
    screen = <div className="hvi-fn-dark"><b>YOU ARE ALREADY INSIDE IT.</b><span>THE DEPARTMENT DOES NOT PERMIT RECURSION. PLEASE CONTINUE PLAYING THE GAME YOU ARE IN.</span></div>;
  } else if (g.status === "dev" || !g.play) {
    screen = <div className="hvi-fn-dark"><b>OUT OF ORDER</b><span>{g.title} IS IN DEVELOPMENT AT IRIDESCENT. THE CABINET WILL BE LIT WHEN IT SHIPS.</span><span style={{ color: "#9ca3af" }}>{g.line}</span></div>;
  } else {
    screen = <iframe title={`${g.title}, playing`} src={utm(g.play, campaign)} allow="autoplay; fullscreen; gamepad; clipboard-write" allowFullScreen onLoad={() => countFunnel(campaign, "play", g.play)} />;
  }
  const body = (
    <>
      <div className="hvi-fn-crt"><div className="glass">{screen}<div className="scan" /></div><span className="brand">{g.title}</span><span className="led" /></div>
      <div className="hvi-fn-foot">
        {tag}
        {!g.self && g.status !== "dev" && <span>TODAY'S HIGH SCORE ON THIS CABINET: {hs.name.toUpperCase()}, {hs.score}.</span>}
      </div>
      <div className="hvi-fn-foot">
        {g.itch ? <Out href={g.itch} campaign={campaign}>{ITCH_LINE}</Out> : <span>AN IRIDESCENT PRODUCTION.</span>}
        {g.play && !g.self && g.status !== "dev" && <Out href={g.play} campaign={campaign}>OPEN IN A NEW TAB</Out>}
        {g.status === "dev" && <Out href="https://iridescent-studio.netlify.app" campaign={campaign}>WHAT IRIDESCENT IS MAKING</Out>}
      </div>
    </>
  );
  void setSpec;
  return { title: g.title, meta: g.role ? g.role.toUpperCase() : "", body };
}

function ArcadeFloor({ setSpec }) {
  const day = machineClock().day;
  return (
    <>
      <p className="hvi-fn-note">EVERY IRIDESCENT GAME HAS A CABINET. LIT ONES PLAY. DARK ONES ARE STILL BEING BUILT. SCORES ARE LOGGED AGAINST YOUR FILE.</p>
      <div className="hvi-fn-grid">
        {GAMES.map(g => {
          const hs = highScore(g.slug, "arcade", day);
          return (
            <button key={g.slug} type="button" className={`hvi-fn-cab ${g.status}`} onClick={() => setSpec({ kind: "game", slug: g.slug, campaign: "the-arcade", back: { kind: "arcade" } })}
              aria-label={`${g.title}, ${g.status === "dev" ? "out of order" : g.status === "beta" ? "beta" : "playable"}`}>
              <span className="mq" style={{ background: g.status === "dev" ? undefined : cabColor(g.slug) }}>{g.title}</span>
              <span className={`hvi-fn-tag ${g.status}`} style={{ alignSelf: "flex-start" }}>{g.status === "live" ? (g.self ? "YOU ARE HERE" : "PLAY") : g.status === "beta" ? "BETA" : "OUT OF ORDER"}</span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{g.role}</span>
              {g.status !== "dev" && !g.self && <span className="hs">HI {hs.initials} {hs.score}</span>}
            </button>
          );
        })}
      </div>
      <div className="hvi-fn-foot"><span>THE PRIZE COUNTER ACCEPTS TICKETS. THE DEPARTMENT ISSUES NO TICKETS.</span></div>
    </>
  );
}
const cabColor = (slug) => ({ jetsam: "#22d3ee", anamnesis: "#4ade80", "human-value-index": "#fbbf24" }[slug] || "#a78bfa");

// ---- the EB SHOP ------------------------------------------------------------------------------
function Shop({ campaign }) {
  const [st, setSt] = useState({ state: "loading" });
  const [pick, setPick] = useState(null);
  useEffect(() => {
    let dead = false;
    fetch("/api/funnel?shop=1").then(r => (r.ok ? r.json() : { closed: true })).catch(() => ({ closed: true }))
      .then(j => { if (!dead) setSt(j.closed || !j.items?.length ? { state: "closed" } : { state: "open", items: j.items, stale: j.stale }); });
    return () => { dead = true; };
  }, []);
  if (st.state === "loading") return <p className="hvi-fn-note">THE CLERK IS COUNTING THE STOCK. THE CLERK IS CARDBOARD. THIS MAY TAKE A MOMENT.</p>;
  if (st.state === "closed") return (
    <>
      <p className="hvi-fn-note">THE SHOP IS CLOSED FOR INVENTORY. THE STOCK HAS NOT LEFT. IT IS BEING LOOKED AT.</p>
      <div className="hvi-fn-foot"><Out href={EB_SHOP} campaign={campaign} className="hvi-fn-cta">VISIT THE EB SHOP</Out></div>
    </>
  );
  if (pick) {
    const url = `${EB_SHOP}/products/${pick.handle}`;
    return (
      <>
        <div className="hvi-fn-detail">
          {pick.video
            ? <video key={pick.handle} src={pick.video.mp4} poster={pick.video.poster || pick.image} autoPlay muted loop playsInline controls aria-label={`${pick.title}, on the turntable`} />
            : <img src={pick.image} alt={pick.title} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <b style={{ fontSize: 16 }}>{pick.title}</b>
            <span style={{ color: "var(--warn)", fontSize: 20 }}>${pick.price}</span>
            {pick.video && <span className="hvi-fn-tag tt" style={{ alignSelf: "flex-start" }}>ON THE TURNTABLE</span>}
            <Out href={url} campaign={campaign} content={pick.handle} className="hvi-fn-cta">BUY AT THE EB SHOP</Out>
            <button type="button" className="hvi-fn-btn" onClick={() => setPick(null)}>◀ BACK TO THE BINS</button>
            <p className="hvi-fn-note">THE ITEM IS REAL. THE SHOP IS REAL. THE MONEY IS, REGRETTABLY, ALSO REAL.</p>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="hvi-fn-note">LIVE FROM THE ELECTRIC BASEMENT'S SHELVES.{st.stale ? " (STOCK AS LAST COUNTED.)" : ""} TAP AN ITEM TO SEE IT TURN.</p>
      <div className="hvi-fn-grid">
        {st.items.map(it => (
          <button key={it.handle} type="button" className="hvi-fn-item" onClick={() => setPick(it)} aria-label={`${it.title}, $${it.price}${it.video ? ", turntable video" : ""}`}>
            <img src={it.image} alt="" loading="lazy" />
            <span className="t">{it.title}</span>
            <span className="p"><span>${it.price}</span>{it.video && <span className="hvi-fn-tag tt">TURNTABLE</span>}</span>
          </button>
        ))}
      </div>
      <div className="hvi-fn-foot"><Out href={EB_SHOP} campaign={campaign} className="hvi-fn-cta">THE WHOLE SHOP</Out></div>
    </>
  );
}

// ---- EBTV ---------------------------------------------------------------------------------------
const HLS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.6.15/hls.min.js";
const HLS_SRI = "sha512-CSVqc4a7tn+tizDNt+eDoVn2fXYAwMDpCLrwGlWrOktNfZQ9gp4dKKScElMeRlrIifhliXs0a06BLaUgmMlCUw==";
let hlsLoad = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsLoad) hlsLoad = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = HLS_SRC; s.integrity = HLS_SRI; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer";
    s.onload = () => res(window.Hls); s.onerror = () => { hlsLoad = null; rej(new Error("hls.js")); };
    document.head.appendChild(s);
  });
  return hlsLoad;
}
function Ebtv({ campaign, now }) {
  const vid = useRef(null);
  const [state, setState] = useState("tuning");
  useEffect(() => {
    const v = vid.current;
    if (!v) return undefined;
    let hls = null, dead = false;
    const go = () => { v.play().then(() => !dead && setState("on")).catch(() => { if (dead) return; v.muted = true; v.play().then(() => !dead && setState("on")).catch(() => !dead && setState("tap")); }); };
    const onErr = () => { if (!dead && v.getAttribute("src") !== null) setState("off"); };
    v.addEventListener("error", onErr);
    // hls.js wherever Media Source Extensions exist (Chrome's own HLS is new and unreliable);
    // the browser's native HLS only without them (iPhone Safari)
    const native = () => { if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = EBTV_STREAM; go(); } else setState("off"); };
    if (!(window.MediaSource || window.ManagedMediaSource)) native();
    else loadHls().then(Hls => {
      if (dead) return;
      if (!Hls?.isSupported()) { native(); return; }
      hls = new Hls({ lowLatencyMode: false });
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setState("off"); });
      hls.loadSource(EBTV_STREAM); hls.attachMedia(v); go();
    }).catch(() => { if (!dead) native(); });
    countFunnel(campaign, "play", EBTV_STREAM);
    return () => { dead = true; v.removeEventListener("error", onErr); hls?.destroy(); v.removeAttribute("src"); v.load(); };
  }, [campaign]);
  return (
    <>
      <div className="hvi-fn-crt"><div className="glass">
        <video ref={vid} playsInline controls aria-label="Electric Basement TV, live" />
        {state === "off" && <div className="hvi-fn-dark" style={{ position: "absolute", inset: 0, background: "#000" }}><b>EBTV IS OFF AIR.</b><span>THE DEPARTMENT DID NOT ARRANGE THIS. IT WOULD HAVE.</span></div>}
        <div className="scan" /></div><span className="brand">EBTV</span><span className="led" /></div>
      <div className="hvi-fn-now">{now?.title ? <>NOW PLAYING: <b>{now.title}</b>{now.upNext ? <> // UP NEXT: {now.upNext}</> : null}</> : "NOW PLAYING: WHATEVER THE BASEMENT IS PLAYING."}</div>
      <div className="hvi-fn-foot">
        <Out href={EBTV_SITE} campaign={campaign} className="hvi-fn-cta">WATCH ELECTRIC BASEMENT TV</Out>
        <Out href={EB_SHOP} campaign={campaign}>SHOP WHAT YOU SEE: SHOP.ELECTRICBASEMENT.TV</Out>
        {state === "tap" && <span>TAP PLAY. THE BROWSER REQUIRES CONSENT. THE DEPARTMENT DOES NOT.</span>}
      </div>
    </>
  );
}
