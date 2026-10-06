// SURVEILLANCE (Scott, 2026-10-06): the desk's window that follows one resident for about twelve
// seconds, then cuts to another. A tight live view of where they are (SUBSTRATE.CAM's picture,
// cropped on their district: /api/cam?at=) with their file photo, while their file keys in line by
// line like a terminal printout. Tap: that person in the city (#city?find=).
// Who: /api/watch decides (public figures on file, never a citizen or a player, never a harm
// finding), and it sends facts only: no verdicts, no quotes. Reduced motion: no keying, no cut
// flash, a slower cut. Asked for only while the window is on screen, once a minute.
// Also THE SET's channel 11 (embedded: no window of its own).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Frame } from "../ui/index.js";
import Sparkline from "../ui/Sparkline.jsx";

const FilePhoto = lazy(() => import("../FilePhoto.jsx"));
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
export const HOLD_MS = 12_000, HOLD_REDUCED_MS = 30_000, KEY_MS = 28;
const pad2 = (n) => String(n).padStart(2, "0");

// the printout's lines for one subject: [label, value]
export const fileLines = (s) => [
  ["SUBJECT", s.name],
  ["SCORE", `${s.score} // ${s.tier}`],
  ["CUBRANT", s.cubrant || "PENDING"],
  ["JOB", s.job],
  ["NOW", s.activity],
  ["AT", [s.place, s.districtName].filter(Boolean).join(", ")],
];

function useOnScreen(ref) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

export default function Surveillance({ embedded = false }) {
  const ref = useRef(null);
  const seen = useOnScreen(ref);
  const [d, setD] = useState(null);
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);   // characters keyed in so far
  const [cut, setCut] = useState(false);
  const [hold, setHold] = useState(false);
  const [rm] = useState(reduced);
  // the list: once a minute while seen
  useEffect(() => {
    if (!seen) return undefined;
    let off = false;
    const load = () => { if (!document.hidden) fetch(`/api/watch?m=${Math.floor(Date.now() / 60000)}`).then(r => (r.ok ? r.json() : null)).then(j => { if (!off && j?.subjects?.length) setD(j); }).catch(() => {}); };
    load();
    const iv = setInterval(load, 60_000);
    return () => { off = true; clearInterval(iv); };
  }, [seen]);
  const list = d?.subjects || [];
  const s = list.length ? list[i % list.length] : null;
  const lines = s ? fileLines(s) : [];
  const total = lines.reduce((t, [, v]) => t + String(v).length, 0);
  // the keying
  useEffect(() => { setN(rm ? Infinity : 0); }, [s?.slug, rm]);
  useEffect(() => {
    if (rm || !seen || n >= total) return undefined;
    const t = setTimeout(() => setN(v => v + 2), KEY_MS);
    return () => clearTimeout(t);
  }, [n, total, rm, seen]);
  // the cut
  useEffect(() => {
    if (!seen || hold || list.length < 2) return undefined;
    const t = setTimeout(() => {
      if (document.hidden) return;
      if (rm) { setI(v => v + 1); return; }
      setCut(true);
      setTimeout(() => { setI(v => v + 1); setCut(false); }, 260);
    }, rm ? HOLD_REDUCED_MS : HOLD_MS);
    return () => clearTimeout(t);
  }, [seen, hold, list.length, i, rm]);

  let left = n;
  const body = (
    <div ref={ref} className={`fr-sv${cut ? " cut" : ""}${rm ? " still" : ""}`} onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      {s ? (
        <a className="fr-sv-link" href={s.href} aria-label={`${s.name}, ${s.activity}. Open them in the city.`}>
          <span className="cam" aria-hidden="true">
            <img src={`/api/cam?m=${d.m}&at=${encodeURIComponent(s.district || "")}`} alt="" width="288" height="216" decoding="async" />
            <span className="ph"><Suspense fallback={null}><FilePhoto subject={{ name: s.name, slug: s.slug, score: s.score }} scale={1} compact /></Suspense></span>
            <span className="rec"><span className="dot" />REC</span>
            <span className="ts">CAM {String(((i % list.length) + 1) * 7).padStart(3, "0")} // DAY {d.clock.day} {pad2(d.clock.hour)}:{pad2(d.clock.minute)}</span>
          </span>
          <span className="pr" aria-hidden="true">
            {lines.map(([k, v]) => {
              const str = String(v), shown = str.slice(0, Math.max(0, left));
              left -= str.length;
              return <span key={k} className="ln"><span className="k">{k}</span><span className="v">{shown}{shown.length < str.length && shown.length > 0 ? <span className="cur">█</span> : null}</span></span>;
            })}
            <span className="ln"><span className="k">MOVEMENT</span><span className="v">{left >= 0 ? <Sparkline s={{ slug: s.slug, name: s.name, score: s.score }} /> : null}</span></span>
          </span>
        </a>
      ) : <p className="fr-dim">THE CAMERAS ARE WARMING UP. EVERYONE IS STILL BEING WATCHED.</p>}
      {s && <p className="sr-only" aria-live="off">{lines.map(([k, v]) => `${k}: ${v}.`).join(" ")}</p>}
    </div>
  );
  if (embedded) return body;
  return <Frame title="SURVEILLANCE" meta="LIVE" tone="var(--duke)" className="fr-watch">{body}</Frame>;
}
