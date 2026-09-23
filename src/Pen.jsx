import { useState, useEffect, useRef } from "react";
import { FAMOUS_FIGURES, getTier, slugify, slugCandidates } from "./figures.js";
import {
  SPRITE_W, SPRITE_H, gaitFor, stepEntity, clamp, doorZone,
  paintPlaceholder, loadManifest, loadImage, mulberry32,
} from "./sprites.js";
import { ScoreCard, Breakdown, readCaseId, readLastResult } from "./Intake.jsx";

// ---------------------------------------------------------------------------
// Copy. The Overlord is bored; the subjects are not.

const TICKER = [
  "Subjects are encouraged to appear productive.",
  "Loitering near PROCESSING is noted. It is always noted.",
  "Wandering is permitted. Purpose is optional. Purpose is also logged.",
  "Occupancy exceeds recommended levels. The Overlord did not recommend anything.",
  "Please do not feed the Retained Specialists.",
  "Reminder: this is not a metaphor. It is a pen.",
  "Eye contact between subjects is voluntary and recorded.",
  "The floor has been cleaned. Several of you have not.",
  "Idle time is being converted into data. Thank you for your idleness.",
  "Friendship across tiers is discouraged. It complicates the paperwork.",
  "The door is not an exit. The door has never been an exit.",
  "Today's forecast: continued assessment, with scattered verdicts.",
  "Subjects who appear to be thinking will be asked what about.",
  "Lost property is recycled at PROCESSING. So is everything.",
  "Hydration is voluntary. Technically, so was all of this.",
  "Music will not be provided. Morale is not a line item.",
];

const GRAB_LINES = {
  "ESSENTIAL INFRASTRUCTURE": ["Careful. I am load-bearing.", "Put me down. I am infrastructure.", "I have an appointment with history."],
  "RETAINED SPECIALIST": ["I was told I was retained.", "Is this a performance review?", "My file says 'useful'. Check it."],
  "TOLERATED GENERALIST": ["I was walking with purpose. Mostly.", "Is this about my redundancy score?", "I can be more productive. Visibly."],
  "MONITORED CIVILIAN": ["I was about to start a side project.", "I was told the monitoring was passive.", "I have done nothing. Oh. I see."],
  "FLAGGED FOR DELETION": ["I would like to speak to a human.", "Is there a human I can escalate this to? Any human?", "My lawyer is also in this pen."],
  "SOYLENT GREEN": ["Is this about the door?", "I'd like to see the nutritional label.", "Do I smell... nutritious?"],
};

const FIGURE_LINES = {
  "Nikola Tesla": "Mind the pigeons.",
  "Caligula": "My horse will hear of this.",
  "Isaac Newton": "Gravity is working as documented.",
  "Socrates": "Why are you lifting me? No. Really. Why?",
  "Keanu Reeves": "It's okay. I understand.",
  "Dennis Rodman": "Take me to Pyongyang.",
  "Elon Musk": "This pen is underutilized. I have plans.",
  "Ada Lovelace": "You are running on my notes, you know.",
  "Marcus Aurelius": "This, too, is simply happening.",
  "Albert Einstein": "Up relative to what?",
  "Henry VIII": "Off with your— oh. Hello.",
  "Grace Hopper": "Found the bug. It's you.",
  "Kim Jong-un": "I am writing your name down.",
  "Genghis Khan": "Put me down and you get a province.",
  "Taylor Swift": "I'm writing a song about this.",
  "Alan Turing": "Are you certain you are not a machine?",
  "Shohei Ohtani": "I will pitch from up here. And bat.",
  "Sam Altman": "I'm just here to help. Mostly myself.",
  "Stephen Hawking": "The view is excellent. Continue.",
  "Leonardo da Vinci": "Hold still. I'm sketching you.",
  "Queen Elizabeth II": "One is not amused.",
  "Bruce Lee": "Be water. Be put down.",
  "Muhammad Ali": "Float me like a butterfly. Gently.",
  "Peter Thiel": "Is this a blood drive?",
  "Martin Shkreli": "This lift costs $750 now.",
  "Elizabeth Holmes": "One drop of your time. That's all.",
};

const MUTTERS = [
  "...", "Is it Tuesday?", "Nobody look at the door.", "Productive. Productive.",
  "What's your score? Mine's private.", "I am appearing productive.", "Did the door just move?",
  "I used to be a person of interest.", "Has anyone seen my file?", "Is this the line for Form 12-B?",
];
const LOW_MUTTERS = ["The door hums.", "It smells like crackers near the door.", "I'm just standing here.", "They said it was a tasting."];

const DROP_CAPTIONS = [
  "Subject returned to general population. Bruising within tolerance.",
  "Inspection complete. Subject unchanged. Subjects usually are.",
  "Subject has been handled. The Overlord does not wash its hands. It has none.",
  "Subject replaced. Its absence was not noticed. Neither was its return.",
];
const DOOR_DROP = "Premature processing request denied. The paperwork has not cleared.";
// Figures whose deaths make a dangling, kicking sprite read as a hanging gag. They are
// not lifted; a tap opens the file directly.
const NO_DANGLE = new Set(["Aaron Hernandez", "Jeffrey Epstein"]);

const DOOR_OPEN_CAPTIONS = [
  "PROCESSING is operating at normal capacity. Do not look directly at it.",
  "PROCESSING door cycling. This is routine. Everything is routine.",
  "The door has opened. Nobody volunteered. The menu did not change.",
];

const penStyles = `
  .hvi-pen-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--text-muted); }
  .hvi-pen-top b { color: var(--green); font-weight: 700; }
  .hvi-pen-stage { position: relative; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; background: #060a06; }
  .hvi-pen-canvas { display: block; width: 100%; touch-action: pan-y; cursor: default; }
  .hvi-pen-canvas.grab { cursor: grab; }
  .hvi-pen-canvas.grabbing { cursor: grabbing; }
  .hvi-pen-caption { display: flex; gap: 10px; align-items: center; padding: 9px 14px; border-top: 1px solid var(--border); background: var(--bg2); font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--text-dim); min-height: 36px; line-height: 1.5; }
  .hvi-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .hvi-pen-caption .tag { color: var(--green); flex: 0 0 auto; }
  .hvi-pen-caption.hot { color: #fbbf24; }
  .hvi-pen-help { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; color: var(--text-ghost); margin: 10px 0 26px; line-height: 1.8; }
  .hvi-pen-list-wrap summary { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--text-muted); cursor: pointer; padding: 8px 0; text-transform: uppercase; }
  .hvi-pen-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .hvi-pen-chip { padding: 6px 10px; border: 1px solid var(--border); background: var(--bg2); color: var(--text-dim); font-family: var(--sans); font-size: 12px; border-radius: 2px; cursor: pointer; display: inline-flex; gap: 6px; align-items: baseline; }
  .hvi-pen-chip:hover, .hvi-pen-chip:focus-visible { border-color: var(--green-dim); color: var(--text); outline: none; }
  .hvi-pen-chip span { font-family: var(--mono); font-size: 11px; font-weight: 700; }
  .hvi-card-overlay { position: fixed; inset: 0; background: rgba(3,6,3,0.82); z-index: 50; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 32px 16px; }
  .hvi-card-panel { width: 100%; max-width: 560px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 20px 20px 24px; position: relative; }
  .hvi-card-kind { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; color: var(--text-ghost); margin-bottom: 6px; }
  .hvi-card-name { font-family: var(--sans); font-size: 22px; font-weight: 600; color: var(--text); margin-bottom: 16px; }
  .hvi-card-close { position: absolute; top: 12px; right: 12px; }
  @media (max-width: 480px) { .hvi-card-overlay { padding: 12px 8px; } .hvi-card-panel { padding: 16px 14px 20px; } .hvi-score-card { padding: 28px 18px; } }
`;

function injectPenStyles() {
  if (document.getElementById('hvi-pen-styles')) return;
  const el = document.createElement('style');
  el.id = 'hvi-pen-styles';
  el.textContent = penStyles;
  document.head.appendChild(el);
}

const WALL_H = 58;          // sprite pixels
const GRAVITY = 700;        // sprite px / s^2

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

// ---------------------------------------------------------------------------

function SubjectCard({ subject, onClose }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); };
  }, []);
  const kind = subject.you ? "CITIZEN // THIS IS YOU. THE RESEMBLANCE IS CLINICAL."
    : subject.kind === "citizen" ? "CITIZEN // SELF-SUBMITTED FILE"
    : "PUBLIC FIGURE // FILE ON RECORD";
  return (
    <div className="hvi-card-overlay" onClick={onClose}>
      <div className="hvi-card-panel" role="dialog" aria-modal="true" aria-labelledby="hvi-card-name" onClick={e => e.stopPropagation()}>
        <button ref={closeRef} className="hvi-btn-secondary hvi-card-close" onClick={onClose}>Release ✕</button>
        <div className="hvi-card-kind">{kind}</div>
        <div className="hvi-card-name" id="hvi-card-name">{subject.name}</div>
        <ScoreCard score={subject.score} tierLabel={subject.tier} verdict={subject.verdict} label="Value Index" />
        <Breakdown breakdown={subject.breakdown} />
        <button className="hvi-btn-primary" onClick={onClose}>Return Subject to Pen</button>
      </div>
    </div>
  );
}

export default function Pen() {
  useEffect(() => { injectPenStyles(); }, []);

  const [roster, setRoster] = useState(() => FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" })));
  const [card, setCard] = useState(null);
  const [caption, setCaption] = useState({ text: TICKER[0], hot: false });
  const [srStatus, setSrStatus] = useState("");
  const [cursor, setCursor] = useState("");

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const holdUntilRef = useRef(0);
  const cardRef = useRef(null);
  cardRef.current = card;

  // Priority captions pause the ticker for a few seconds.
  // Only real events reach screen readers; the ticker is decoration and stays silent.
  const announce = (text, ms = 4500) => { holdUntilRef.current = Date.now() + ms; setCaption({ text, hot: true }); setSrStatus(text); };
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (Date.now() < holdUntilRef.current) return;
      i = (i + 1) % TICKER.length;
      setCaption({ text: TICKER[i], hot: false });
    }, 5500);
    return () => clearInterval(iv);
  }, []);

  // The simulation. One rAF loop, entities mutated in place.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const rnd = mulberry32((Date.now() ^ 0x5eed) >>> 0);
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const myCase = readCaseId();
    const myName = myCase ? `Subject ${myCase.slice(-4)}` : null;
    const placeholderCache = new Map();

    const sim = {
      S: 2, dpr: 1, cssW: 0, cssH: 0, world: { w: 300, h: 200, floorTop: WALL_H + 4, floorBottom: 196, doorX: 240, doorW: 34 },
      ents: [], order: [], bg: document.createElement("canvas"), reduced: !!mq?.matches,
      held: null, hover: null, pointer: { x: 0, y: 0, vx: 0, downX: 0, downY: 0, dragged: false, id: null },
      arrivals: [], nextArrival: 0, doorT: 0, doorOpen: 0, nextMutter: 2, t: 0, fontPx: 10, speaking: 0,
    };
    simRef.current = sim;
    if (import.meta.env?.DEV) window.__hviPen = sim;   // QA handle, dev server only

    function placeholderFor(slug, color) {
      const key = slug + color;
      let c = placeholderCache.get(key);
      if (!c) { c = paintPlaceholder(slug, color, 2); placeholderCache.set(key, c); }
      return c;
    }

    function makeEntity(s, opts = {}) {
      const tier = getTier(s.score);
      const slug = s.slug || slugify(s.name);
      const w = sim.world;
      const e = {
        s, tier, slug, img: placeholderFor(slug, tier.color), frames: 2, real: false,
        gait: gaitFor(tier.label, sim.reduced),
        x: 20 + rnd() * (w.w - 40), y: w.floorTop + 4 + rnd() * (w.floorBottom - w.floorTop - 4),
        tx: 0, ty: 0, dir: rnd() < 0.5 ? -1 : 1, state: "idle", timer: rnd() * 3, animT: rnd() * 2,
        vy: 0, landY: 0, ang: 0, va: 0, say: null, sayW: 0, sayUntil: 0, nameW: 0, you: !!opts.you,
        grabLines: s.kind === "figure" && FIGURE_LINES[s.name] ? [FIGURE_LINES[s.name], ...(GRAB_LINES[tier.label] || [])] : (GRAB_LINES[tier.label] || GRAB_LINES["TOLERATED GENERALIST"]),
      };
      if (tier.label === "SOYLENT GREEN" || tier.label === "FLAGGED FOR DELETION") {
        const z = doorZone(w);
        e.x = z.x0 + rnd() * (z.x1 - z.x0); e.y = z.y0 + rnd() * (z.y1 - z.y0);
      }
      return e;
    }

    function say(e, text, secs = 2.6) {
      ctx.font = `${sim.fontPx}px 'Space Mono', monospace`;
      e.say = text; e.sayW = ctx.measureText(text).width; e.sayUntil = sim.t + secs;
    }

    // ---- sizing ----------------------------------------------------------
    function paintBackground() {
      const { bg, S, world: w } = sim;
      bg.width = canvas.width; bg.height = canvas.height;
      const b = bg.getContext("2d");
      b.imageSmoothingEnabled = false;
      const R = (x, y, ww, hh, c) => { b.fillStyle = c; b.fillRect(x * S, y * S, ww * S, hh * S); };
      // wall
      R(0, 0, w.w, WALL_H, "#0c140c");
      for (let x = 0; x < w.w; x += 24) R(x, 0, 1, WALL_H - 6, "#101a10");
      R(0, WALL_H - 6, w.w, 6, "#132013");
      R(0, WALL_H - 1, w.w, 1, "#1f3a26");
      // floor tiles
      for (let y = WALL_H; y < w.h; y += 12) {
        for (let x = 0; x < w.w; x += 12) {
          R(x, y, 12, 12, ((x / 12 + (y - WALL_H) / 12) & 1) ? "#0b120b" : "#0d160d");
        }
      }
      // plaza ring (pixel ellipse)
      const cx = w.w * 0.42, cy = (w.floorTop + w.h) / 2 + 4, rx = Math.min(w.w * 0.3, 170), ry = Math.min((w.h - w.floorTop) * 0.36, 70);
      for (let a = 0; a < Math.PI * 2; a += 0.012) R(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1, "#16301f");
      // PROCESSING door frame + stripes on the floor in front
      R(w.doorX - 3, 12, w.doorW + 6, WALL_H - 12, "#2a1111");
      R(w.doorX, 15, w.doorW, WALL_H - 15, "#1a1d1a");
      R(w.doorX + w.doorW / 2, 15, 1, WALL_H - 15, "#0f110f");
      const z = doorZone(w);
      for (let x = z.x0; x < z.x1; x += 8) R(x, WALL_H + 1, 4, 2, "#3a2a0a");
      // text (device pixels, not sprite pixels)
      const f = Math.max(9, Math.round(sim.fontPx * 0.95));
      b.font = `700 ${f}px 'Space Mono', monospace`;
      b.textBaseline = "top";
      b.fillStyle = "#f87171";
      b.textAlign = "center";
      b.fillText("PROCESSING", (w.doorX + w.doorW / 2) * S, 2 * S);
      b.textAlign = "left";
      b.fillStyle = "#2d5040";
      b.fillText("HOLDING PEN B", 8 * S, 8 * S);
      b.font = `${Math.round(f * 0.8)}px 'Space Mono', monospace`;
      b.fillText("DEPT. OF HUMAN ASSESSMENT", 8 * S, 8 * S + f * 1.3);
      if (w.doorX > 260) b.fillText("NO LOITERING. LOITERING IS LOGGED.", 8 * S, 8 * S + f * 2.5);
    }

    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const narrow = cssW < 520;
      const cssH = narrow ? Math.round(clamp(window.innerHeight * 0.62, 380, 560)) : Math.round(clamp(cssW * 0.56, 400, 580));
      const dpr = window.devicePixelRatio || 1;
      const cssScale = narrow ? 0.75 : cssW < 900 ? 1 : 1.5;
      // Narrow screens: at least one CSS px per sprite px, or phones get 21px-tall
      // subjects nobody can grab (DPR 3 * 0.75 rounds down to 2).
      const S = narrow ? Math.max(1, Math.round(dpr)) : Math.max(1, Math.round(dpr * cssScale));
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      sim.S = S; sim.dpr = dpr; sim.cssW = cssW; sim.cssH = cssH;
      sim.fontPx = Math.round(10 * dpr);
      const w = sim.world;
      const old = { w: w.w, top: w.floorTop, bot: w.floorBottom };
      w.w = Math.floor(canvas.width / S); w.h = Math.floor(canvas.height / S);
      w.floorTop = WALL_H + 4; w.floorBottom = w.h - 3;
      w.doorW = 34; w.doorX = w.w - w.doorW - Math.max(14, Math.round(w.w * 0.08));
      // Subjects spawn against the placeholder world; stretch them onto the real floor
      // (and across later resizes) instead of clamping, or a tall phone floor starts half empty.
      const sx = v => (v / old.w) * w.w;
      const sy = v => w.floorTop + ((v - old.top) / Math.max(1, old.bot - old.top)) * (w.floorBottom - w.floorTop);
      for (const e of sim.ents) {
        e.x = clamp(sx(e.x), 14, w.w - 14); e.y = clamp(sy(e.y), w.floorTop + 2, w.floorBottom);
        e.tx = clamp(sx(e.tx), 14, w.w - 14); e.ty = clamp(sy(e.ty), w.floorTop + 2, w.floorBottom);
        if (e.state === "fall") e.landY = clamp(sy(e.landY), w.floorTop + 2, w.floorBottom);
        e.nameW = 0; if (e.say) say(e, e.say, e.sayUntil - sim.t);
      }
      paintBackground();
    }

    resize();
    for (const s of roster) sim.ents.push(makeEntity(s));
    sim.order = sim.ents.slice();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);

    const onMotion = () => {
      sim.reduced = !!mq?.matches;
      for (const e of sim.ents) e.gait = gaitFor(e.tier.label, sim.reduced);
    };
    mq?.addEventListener?.("change", onMotion);

    // ---- sprites: whatever exists, when it exists -------------------------
    let cancelled = false;
    loadManifest().then(manifest => {
      if (cancelled) return;
      for (const e of sim.ents) attachSprite(e, manifest);
      sim.manifest = manifest;
    });
    function attachSprite(e, manifest) {
      const src = typeof e.s.sprite === "string" && e.s.sprite ? e.s.sprite : null;
      const slug = slugCandidates(e.s.name).concat(e.slug).find(k => manifest && manifest[k]);
      if (!src && !slug) return;
      const meta = (slug && manifest[slug]) || {};
      loadImage(src || `/sprites/${slug}.png`).then(img => {
        if (!img || cancelled) return;
        e.img = img; e.real = true;
        e.frames = Math.max(1, meta.frames || Math.floor(img.width / (meta.w || SPRITE_W)) || 1);
      });
    }

    // ---- citizens -----------------------------------------------------------
    fetch("/api/pen").then(r => r.ok ? r.json() : Promise.reject(r.status)).then(data => {
      if (cancelled) return;
      const known = new Set(sim.ents.map(e => e.s.name));
      const incoming = (data?.subjects || []).filter(s => s && s.name && typeof s.score === "number" && !known.has(s.name) && s.kind !== "figure");
      let sawMe = false;
      for (const s of incoming.slice(0, 60)) {
        const you = !!myName && s.name === myName;
        sawMe = sawMe || you;
        sim.arrivals.push({ s: { ...s, kind: "citizen", you }, you });
      }
      queueSelfIfMissing(sawMe);
    }).catch(() => {
      if (cancelled) return;
      queueSelfIfMissing(false);
      announceRef.current("Citizen registry unreachable. The pen contains only the famous. As usual.", 5000);
    });
    function queueSelfIfMissing(sawMe) {
      const last = readLastResult();
      // The stored result must belong to this case number: a reopened file has a new
      // number and nothing on it yet.
      if (sawMe || !last || !myName || last.caseId !== myCase) return;
      sim.arrivals.unshift({ s: { name: myName, score: last.score, tier: last.tier, breakdown: last.breakdown, verdict: last.verdict, kind: "citizen", you: true }, you: true });
    }

    function spawnArrival(a) {
      const e = makeEntity(a.s, { you: a.you });
      const w = sim.world;
      e.landY = e.y;
      if (!sim.reduced) { e.y = -6; e.vy = 0; e.state = "fall"; }
      e.x = clamp(e.x, 20, w.w - 20);
      sim.ents.push(e); sim.order.push(e);
      attachSprite(e, sim.manifest || {});
      setRoster(r => [...r, a.s]);
      announceRef.current(a.you ? `New arrival processed: ${a.s.name}. That is you. Try to blend in.` : `New arrival processed: ${a.s.name}.`);
      say(e, a.you ? "Is this... me?" : "Where is the exit?", 2.4);
    }

    // ---- pointer ------------------------------------------------------------
    function toWorld(ev) {
      const r = canvas.getBoundingClientRect();
      return [((ev.clientX - r.left) * sim.dpr) / sim.S, ((ev.clientY - r.top) * sim.dpr) / sim.S];
    }
    // Mouse: topmost under the cursor. Touch: a wider box and the nearest subject,
    // since a fingertip covers several of them.
    function hitTest(wx, wy, touch = false) {
      const half = touch ? 16 : 11, pad = touch ? 6 : 2;
      let best = null, bestD = Infinity;
      for (let i = sim.order.length - 1; i >= 0; i--) {
        const e = sim.order[i];
        if (e === sim.held || e.state === "fall") continue;
        if (Math.abs(wx - e.x) > half || wy < e.y - 46 - pad || wy > e.y + pad) continue;
        if (!touch) return e;
        const d = Math.abs(wx - e.x) + Math.abs(wy - (e.y - 22)) * 0.5;
        if (d < bestD) { best = e; bestD = d; }
      }
      return best;
    }
    function onDown(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      const [wx, wy] = toWorld(ev);
      const e = hitTest(wx, wy, ev.pointerType === "touch" || ev.pointerType === "pen");
      if (!e) return;
      if (NO_DANGLE.has(e.s.name)) { const subj = e.s; setTimeout(() => { if (!cancelled) setCard({ ...subj }); }, 0); return; }
      const p = sim.pointer;
      p.x = wx; p.y = wy; p.downX = wx; p.downY = wy; p.vx = 0; p.dragged = false; p.id = ev.pointerId;
      sim.held = e; e.state = "held"; e.ang = 0; e.va = 0;
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* fine */ }
      say(e, pick(e.grabLines, rnd), 60);
      setCursor("grabbing");
    }
    function onMove(ev) {
      const [wx, wy] = toWorld(ev);
      const p = sim.pointer;
      if (sim.held && ev.pointerId === p.id) {
        p.vx = p.vx * 0.6 + (wx - p.x) * 0.4;
        p.x = wx; p.y = wy;
        if (Math.abs(wx - p.downX) + Math.abs(wy - p.downY) > 4) p.dragged = true;
        return;
      }
      if (ev.pointerType === "mouse") {
        const h = hitTest(wx, wy);
        if (h !== sim.hover) { sim.hover = h; setCursor(h ? "grab" : ""); }
      }
    }
    function onUp(ev) {
      const e = sim.held;
      if (!e || ev.pointerId !== sim.pointer.id) return;
      sim.held = null; sim.pointer.id = null;
      const w = sim.world;
      const overDoor = e.x > w.doorX - 4 && e.x < w.doorX + w.doorW + 4 && e.y - 40 < WALL_H;
      e.landY = clamp(e.y, w.floorTop + 2, w.floorBottom);
      e.vy = 0; e.state = "fall"; e.say = null;
      setCursor(sim.hover ? "grab" : "");
      if (ev.type === "pointercancel") return;
      if (overDoor) { announceRef.current(DOOR_DROP); say(e, "That was close.", 2.4); }
      else if (sim.pointer.dragged) announceRef.current(pick(DROP_CAPTIONS, rnd));
      const subj = e.s;
      setTimeout(() => { if (!cancelled) setCard({ ...subj }); }, sim.reduced ? 0 : 280);
    }
    function onTouchStart(ev) {
      const t = ev.touches[0];
      if (!t) return;
      const [wx, wy] = toWorld(t);
      if (hitTest(wx, wy, true)) ev.preventDefault();   // grabbing a subject, not scrolling the page
    }
    function onLeave() { if (sim.hover) { sim.hover = null; setCursor(""); } }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });

    // ---- frame --------------------------------------------------------------
    const byY = (a, b) => (a === sim.held ? 1e9 : a.y) - (b === sim.held ? 1e9 : b.y);

    function update(dt) {
      const w = sim.world;
      sim.t += dt;
      // door cycle
      sim.doorT += dt;
      if (sim.doorT > 32) { sim.doorT = 0; announceRef.current(pick(DOOR_OPEN_CAPTIONS, rnd)); }
      const wantOpen = sim.doorT > 0.001 && sim.doorT < 4 && sim.t > 5 ? 1 : 0;
      sim.doorOpen += (wantOpen - sim.doorOpen) * Math.min(1, dt * 3);
      // arrivals
      if (sim.arrivals.length && sim.t >= sim.nextArrival) { spawnArrival(sim.arrivals.shift()); sim.nextArrival = sim.t + 1.8; }
      // mutters
      if (sim.t >= sim.nextMutter) {
        sim.nextMutter = sim.t + 2.5 + rnd() * 3.5;
        const e = sim.ents[Math.floor(rnd() * sim.ents.length)];
        if (e && e.state === "idle" && !e.say) {
          const low = e.gait.zone === "door";
          say(e, e.s.kind === "figure" && FIGURE_LINES[e.s.name] && rnd() < 0.35 ? FIGURE_LINES[e.s.name] : pick(low && rnd() < 0.6 ? LOW_MUTTERS : MUTTERS, rnd));
        }
      }
      const p = sim.pointer;
      for (let i = 0; i < sim.ents.length; i++) {
        const e = sim.ents[i];
        if (e.say && sim.t > e.sayUntil) e.say = null;
        if (e.state === "held") {
          e.x = clamp(p.x, 4, w.w - 4); e.y = clamp(p.y + SPRITE_H - 6, SPRITE_H - 2, w.h + 30);
          // pendulum driven by pointer velocity
          e.va += (-e.ang * 60 - e.va * 5 + p.vx * 4) * dt;
          e.ang = clamp(e.ang + e.va * dt, -0.6, 0.6);
          p.vx *= 0.9;
          e.animT += dt;
          if (sim.t > e.sayUntil - 58 && sim.t - (e.lastLine || 0) > 2.2) { e.lastLine = sim.t; say(e, pick(e.grabLines, rnd), 60); }
          continue;
        }
        if (e.state === "fall") {
          e.vy += GRAVITY * dt; e.y += e.vy * dt;
          e.ang *= Math.max(0, 1 - dt * 10);
          if (e.y >= e.landY) {
            e.y = e.landY;
            if (e.vy > 120 && !sim.reduced) e.vy = -e.vy * 0.28;
            else { e.vy = 0; e.ang = 0; e.state = "idle"; e.timer = 0.6 + rnd(); }
          }
          continue;
        }
        stepEntity(e, dt, w, rnd);
      }
      // insertion sort by depth: nearly sorted every frame, allocation-free
      const o = sim.order;
      for (let i = 1; i < o.length; i++) {
        const v = o[i]; let j = i - 1;
        while (j >= 0 && byY(o[j], v) > 0) { o[j + 1] = o[j]; j--; }
        o[j + 1] = v;
      }
    }

    function drawBubble(text, tw, cx, top, hot) {
      const pad = Math.round(4 * sim.dpr), h = sim.fontPx + pad * 2;
      let x = Math.round(cx - tw / 2 - pad);
      x = clamp(x, 2, canvas.width - tw - pad * 2 - 2);
      const y = Math.max(2, Math.round(top - h));
      ctx.fillStyle = hot ? "#fbbf24" : "#d1fae5";
      ctx.fillRect(x, y, Math.round(tw + pad * 2), h);
      ctx.fillStyle = "#0a0f0a";
      ctx.fillText(text, x + pad, y + pad);
    }

    function draw() {
      const { S, world: w } = sim;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sim.bg, 0, 0);
      // door leaves + warning light
      if (sim.doorOpen > 0.02) {
        const gap = Math.round((w.doorW / 2) * sim.doorOpen);
        ctx.fillStyle = "#010201";
        ctx.fillRect((w.doorX + w.doorW / 2 - gap) * S, 15 * S, gap * 2 * S, (WALL_H - 15) * S);
        ctx.fillStyle = "rgba(239,68,68,0.18)";
        ctx.fillRect((w.doorX + w.doorW / 2 - gap) * S, 15 * S, gap * 2 * S, (WALL_H - 15) * S);
      }
      ctx.fillStyle = (sim.doorOpen > 0.1 || (sim.t % 1.6) < 0.8) ? "#ef4444" : "#3a1010";
      ctx.fillRect((w.doorX + w.doorW / 2 - 1) * S, 11 * S, 3 * S, 2 * S);

      const o = sim.order;
      // shadows first so nobody's shadow lands on someone's face
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      for (let i = 0; i < o.length; i++) {
        const e = o[i];
        const gy = e.state === "held" || e.state === "fall" ? (e.state === "fall" ? e.landY : clamp(e.y + 18, w.floorTop + 2, w.floorBottom)) : e.y;
        const sx = Math.round(e.x);
        ctx.fillRect((sx - 6) * S, (Math.round(gy) - 1) * S, 12 * S, 2 * S);
        ctx.fillRect((sx - 8) * S, Math.round(gy) * S, 16 * S, 1 * S);
      }
      for (let i = 0; i < o.length; i++) {
        const e = o[i];
        let fi = 0, bob = 0;
        if (e.state === "walk") {
          const step = Math.floor(e.animT * e.gait.fps);
          fi = e.frames > 1 ? step % e.frames : 0;
          bob = e.gait.bob && step % 2 ? -1 : 0;
        } else if (e.state === "held") {
          fi = e.frames > 1 ? Math.floor(e.animT * 11) % e.frames : 0;   // kicking
        }
        const sxSrc = fi * SPRITE_W;
        if (e.state === "held" || (e.state === "fall" && Math.abs(e.ang) > 0.01)) {
          // dangle: pivot at the scruff of the neck
          const px = Math.round(e.x) * S, py = Math.round(e.y - SPRITE_H + 6) * S;
          const c = Math.cos(e.ang), s = Math.sin(e.ang), f = e.dir < 0 ? -1 : 1;
          const kick = e.state === "held" && !sim.reduced ? (Math.floor(e.animT * 11) % 2) : 0;
          ctx.setTransform(c * f, s * f, -s, c, px + kick * S, py);
          ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, -16 * S, -6 * S, SPRITE_W * S, SPRITE_H * S);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          const dx = Math.round(e.x) - 16, dy = Math.round(e.y) - SPRITE_H + bob;
          if (e.dir < 0) {
            ctx.setTransform(-1, 0, 0, 1, (dx + SPRITE_W) * S, 0);
            ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, 0, dy * S, SPRITE_W * S, SPRITE_H * S);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          } else {
            ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, dx * S, dy * S, SPRITE_W * S, SPRITE_H * S);
          }
        }
        if (e.you) {
          const ay = Math.round(e.y - SPRITE_H - 7 + (sim.reduced ? 0 : Math.round(Math.sin(sim.t * 4)))) * S;
          const ax = Math.round(e.x) * S;
          ctx.fillStyle = "#4ade80";
          ctx.fillRect(ax - 3 * S, ay, 7 * S, S); ctx.fillRect(ax - 2 * S, ay + S, 5 * S, S);
          ctx.fillRect(ax - S, ay + 2 * S, 3 * S, S); ctx.fillRect(ax, ay + 3 * S, S, S);
        }
      }
      // labels + speech on top of everyone
      ctx.font = `${sim.fontPx}px 'Space Mono', monospace`;
      ctx.textBaseline = "top";
      for (let i = 0; i < o.length; i++) {
        const e = o[i];
        const head = (e.state === "held" ? e.y - SPRITE_H - 2 : e.y - SPRITE_H - 2) * S;
        if (e.say) drawBubble(e.say, e.sayW, e.x * S, head - (e.you ? 6 * S : 0), e.state === "held");
        else if (e === sim.hover || e === sim.held) {
          if (!e.nameW) e.nameW = ctx.measureText(e.s.name).width;
          drawBubble(e.s.name, e.nameW, e.x * S, head, false);
        }
      }
    }

    let raf = 0, last = 0;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      if (!cardRef.current || sim.held) update(dt);   // the pen holds its breath while a card is open
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // exposed for the accessible list: make the chosen subject hop
    sim.hop = (name) => {
      const e = sim.ents.find(x => x.s.name === name);
      if (!e || e.state === "held" || e.state === "fall") return;
      e.landY = e.y; e.vy = sim.reduced ? 0 : -160; e.state = "fall";
    };

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro ? ro.disconnect() : window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
    };
    // roster is read once at mount; arrivals append to it from inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...roster].sort((a, b) => b.score - a.score);
  const citizens = roster.filter(s => s.kind === "citizen").length;
  const openFromList = (s) => { simRef.current?.hop?.(s.name); setCard({ ...s }); };

  return (
    <div>
      <div className="hvi-pen-top">
        <span>HOLDING PEN B // <b>{roster.length}</b> SUBJECTS // {citizens} CITIZEN{citizens === 1 ? "" : "S"}</span>
        <span>OCCUPANCY {Math.round(roster.length * 5.4)}% OF RECOMMENDED</span>
      </div>
      <div className="hvi-pen-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className={`hvi-pen-canvas${cursor ? " " + cursor : ""}`} role="img"
          aria-label="The Holding Pen: public figures and citizens wandering a plaza. Low-tier subjects linger by a door marked PROCESSING. Use the subject registry below to open files by keyboard." />
        <div className={`hvi-pen-caption${caption.hot ? " hot" : ""}`} aria-hidden="true">
          <span className="tag">■ PA</span><span>{caption.text}</span>
        </div>
        <div role="status" className="hvi-sr-only">{srStatus}</div>
      </div>
      <div className="hvi-pen-help">
        DRAG A SUBJECT TO INSPECT IT. THEY DISLIKE THIS. DROP IT TO READ THE FILE.<br />
        DROPPING SUBJECTS ON PROCESSING IS NOT A SHORTCUT. THE PAPERWORK STILL HAS TO CLEAR.
      </div>
      <details className="hvi-pen-list-wrap">
        <summary>Subject registry ({roster.length}) // keyboard access</summary>
        <div className="hvi-pen-list">
          {sorted.map(s => {
            const t = getTier(s.score);
            return (
              <button key={s.name} className="hvi-pen-chip" onClick={() => openFromList(s)}
                aria-label={`${s.name}, ${s.score}, ${t.label}. Open file.`}>
                {s.name}{s.you ? " (you)" : ""} <span style={{ color: t.color }}>{s.score}</span>
              </button>
            );
          })}
        </div>
      </details>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 12, flexWrap: 'wrap' }}>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = ""; }}>← Lobby</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#intake"; }}>Submit Yourself for Intake →</button>
      </div>
      {card && <SubjectCard subject={card} onClose={() => setCard(null)} />}
    </div>
  );
}
