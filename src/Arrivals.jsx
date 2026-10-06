// INTAKE: the Department's processing hall (route #arrivals; #pen lands here). Scott,
// 2026-09-30: the Holding Pen outlived its purpose, so its parts became intake. The newest
// arrivals on file walk the line in the same text-drawn building: ARRIVALS DOOR ->
// PHOTOGRAPHY -> ASSESSMENT DESK -> HOLDING BENCH, and wait there until the first machine
// day whose published plan holds them, when THE CHUTE drops them onto the Loop platform to
// THE SUBSTRATE. The latest released arrivals stand on the platform, stamped, so the hall
// is never empty. The referral desk files new subjects; they come in at the door.
// Data: /api/arrivals (netlify/functions/arrivals.js). Layout: src/arrivalsHall.js.
import { useState, useEffect, useRef } from "react";
import { SubjectCard, ReferralBar, injectPenStyles } from "./Pen.jsx";
import { FAMOUS_FIGURES, getTier, slugify, slugCandidates, displayName } from "./figures.js";
import {
  SPRITE_W, SPRITE_H, gaitFor, clamp, statureOf,
  paintPlaceholder, paintAvatar, loadManifest, loadSprite, loadRepoSprite, mulberry32,
} from "./sprites.js";
import FilePhoto from "./FilePhoto.jsx";
import { readCaseId } from "./caseFile.jsx";
import { Rule } from "./term.jsx";
import { Frame, Disclosure, ListRow, PaLine, ScreenHead } from "./ui";
import Sparkline, { sparkLabelOf } from "./ui/Sparkline.jsx";
import {
  BAYS, BAY, TOP_PAD, ROW_H, FOUNDATION, layoutFor, bayRect, bayAt, bayCenter, bayPath,
  releaseLine, assignedLine, homeBay, reconcile, minutesUntil,
} from "./arrivalsHall.js";

const FONT = "'Fira Mono', ui-monospace, Menlo, monospace";
const POLL_MS = 60 * 1000;
const HALL_MAX = 60;          // subjects drawn at once
const GRAVITY = 700;

const TICKER = [
  "Arrivals are processed in the order the Department prefers.",
  "Please have your likeness ready. If you do not have one, one will be drawn.",
  "The bench is for waiting. Waiting is compulsory. Sitting is optional.",
  "The chute opens at the start of each machine day. Not before. Asking does not help.",
  "Every arrival is assessed. Every assessment is final until it is not.",
  "The Loop runs to THE SUBSTRATE. There is no return service.",
  "Released subjects are assigned a home and a job. Preferences were not collected.",
  "Photography does not flatter. Photography was not asked to.",
  "The Department thanks you for arriving. It did not ask you to.",
  "Referrals are welcome. The referred are not consulted.",
  "A subject in processing is not to be handled. You will handle it anyway. It is noted.",
];
const HOLD_LINE = "PUT THAT SUBJECT DOWN. IT IS BEING PROCESSED.";
const GRAB_LINES = ["I was in line.", "Is this part of the process?", "I had a number.", "I was told to wait here.", "Is this the photograph?", "Please. I was nearly released."];
const BENCH_MUTTERS = ["How long is a machine day?", "Is it my turn?", "They said the chute is painless.", "I can hear the train.", "What did they write about me?", "I was told there would be a form.", "Is this the line for the city?"];
const PLATFORM_MUTTERS = ["Is this the right train?", "I have a job now, apparently.", "Where is Hab Block A?", "No return ticket?", "They stamped my face."];
const DROP_CAPTIONS = [
  "Subject returned to the line. The line did not notice.",
  "Subject replaced. Processing resumes where it was interrupted. It always does.",
  "Inspection complete. The subject is exactly as filed.",
];
const ARRIVAL_LINES = ["Where is the exit?", "Is this the lobby?", "I did not agree to this.", "Who referred me?", "Is there a form?"];

const styles = `
  .hvi-arr-stage { position: relative; background: #060a06; }
  .hvi-arr-canvas { display: block; width: 100%; touch-action: pan-y; cursor: default; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .hvi-arr-canvas.grab { cursor: grab; }
  .hvi-arr-canvas.grabbing { cursor: grabbing; }
  .hvi-arr-caption { padding: var(--s1) 1ch; min-height: calc(2 * var(--lh) * var(--t-xs)); }
  .hvi-arr-help { color: var(--fg-mute); font-size: var(--t-xs); margin: var(--s2) 0 var(--s5); }
  .hvi-arr-help p { margin: 0 0 var(--s1); }
  .hvi-arr-desk { margin: 0 0 var(--s4); }
  .hvi-arr-desk-head { color: var(--fg-mute); font-size: var(--t-xs); margin: 0 0 var(--s1); letter-spacing: 0.06em; }
  .hvi-arr-list { columns: 2 40ch; column-gap: var(--s5); }
  .hvi-arr-list > * { break-inside: avoid; }
  .hvi-arr-list .ui-row .lead .hvi-photo-thumb { margin: -2px 0; }
  .hvi-arr-list .ui-row .tag { min-width: 10ch; text-align: right; }
  .hvi-arr-none { color: var(--fg-mute); font-size: var(--t-xs); padding: var(--s2) var(--s1); }
  .hvi-arr-find { display: inline-flex; align-items: center; min-height: 44px; color: var(--accent); font-size: var(--t-xs); letter-spacing: 0.06em; margin: var(--s1) 0; }
  .hvi-arr-find:focus-visible, .hvi-arr-find:hover { color: var(--accent-ink); }
  .hvi-arr-release { color: var(--warn); font-size: var(--t-xs); margin: var(--s1) 0; }
`;
function injectStyles() {
  injectPenStyles();   // the subject file's overlay and the referral desk
  let el = document.getElementById("hvi-arr-styles");
  if (!el) { el = document.createElement("style"); el.id = "hvi-arr-styles"; document.head.appendChild(el); }
  if (el.textContent !== styles) el.textContent = styles;
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const keyOf = (s) => s?.key || s?.slug || slugify(s?.baseName || s?.name || "unfiled");

// What the file says about where this subject is in the process.
function cardFor(s, meta) {
  const released = s.status === "released";
  return {
    where: released ? "INTAKE // RELEASED" : "INTAKE // HOLDING BENCH",
    back: "Return subject to intake",
    assignment: s.assign || !released ? assignedLine(s.assign) : null,
    extra: released
      ? <a className="hvi-arr-find" href={`#city?find=${encodeURIComponent(keyOf(s))}`}>[ FIND IN THE CITY ▸ ]</a>
      : <div className="hvi-arr-release">{releaseLine(s.releaseDay || meta?.releaseNext, s.releaseAt || meta?.releaseNextAt)}. FIND IN THE CITY OPENS THEN.</div>,
  };
}

export default function Arrivals() {
  useEffect(() => { injectStyles(); }, []);
  const [list, setList] = useState({ pending: [], released: [] });
  const [meta, setMeta] = useState(null);         // {today, releaseNext, releaseNextAt}
  const [state, setState] = useState("loading");   // loading | ok | down
  const [card, setCard] = useState(null);
  const [caption, setCaption] = useState({ text: TICKER[0], hot: false });
  const [srStatus, setSrStatus] = useState("");
  const [cursor, setCursor] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [, setTick] = useState(0);                 // the countdowns in the list

  const wrapRef = useRef(null), canvasRef = useRef(null), simRef = useRef(null);
  const holdUntilRef = useRef(0), cardRef = useRef(null), metaRef = useRef(null);
  cardRef.current = card;
  metaRef.current = meta;
  const announce = (text, ms = 4500) => { holdUntilRef.current = Date.now() + ms; setCaption({ text, hot: true }); setSrStatus(text); };
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      setTick(t => t + 1);
      if (Date.now() < holdUntilRef.current) return;
      i = (i + 1) % TICKER.length;
      setCaption({ text: TICKER[i], hot: false });
    }, 5500);
    return () => clearInterval(iv);
  }, []);

  // ---- the hall -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const rnd = mulberry32((Date.now() ^ 0x1a7e) >>> 0);
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const myCase = readCaseId();
    const myName = myCase ? `Subject ${myCase.slice(-4)}` : null;
    const placeholders = new Map();
    let cancelled = false;

    const sim = {
      S: 2, dpr: 1, w: 300, L: layoutFor(300), bg: document.createElement("canvas"), reduced: !!mq?.matches,
      ents: [], byKey: new Map(), queue: [], nextArrival: 0.6, t: 0, fontPx: 10, glyph: null,
      held: null, hover: null, pointer: { x: 0, y: 0, vx: 0, downX: 0, downY: 0, dragged: false, id: null },
      flash: { bay: -1, t: 0 }, doorT: -9, trainT: 8, nextMutter: 3, manifest: null, bubbles: [],
    };
    simRef.current = sim;
    if (import.meta.env?.DEV) window.__hviArrivals = sim;   // QA handle, dev server only

    const placeholderFor = (slug, color) => {
      const k = slug + color;
      if (!placeholders.has(k)) placeholders.set(k, paintPlaceholder(slug, color, 2));
      return placeholders.get(k);
    };

    function say(e, text, secs = 2.6) {
      ctx.font = `${sim.fontPx}px ${FONT}`;
      text = String(text).toUpperCase();
      e.say = text; e.sayW = ctx.measureText(text).width; e.sayUntil = sim.t + secs;
    }

    // ---- likeness: the placeholder until PHOTOGRAPHY, then whatever exists ------------
    function hasLikeness(s) { return s.avatar?.kind === "procedural" || s.avatar?.kind === "sprite" || (typeof s.sprite === "string" && !!s.sprite) || !!findRepo(s); }
    function findRepo(s) { return sim.manifest ? slugCandidates(s.name).concat(s.slug || []).find(k => sim.manifest[k]) : null; }
    function develop(e) {
      const s = e.s;
      if (s.avatar?.kind === "procedural") { e.img = paintAvatar(s.avatar.spec, 2); e.frames = 2; e.real = true; return; }
      const src = (s.avatar?.kind === "sprite" && s.avatar.url) || (typeof s.sprite === "string" && s.sprite ? s.sprite : null);
      const slug = findRepo(s);
      if (!src && !slug) return;
      const meta = (slug && sim.manifest[slug]) || {};
      (src ? loadSprite(src) : loadRepoSprite(slug)).then(img => {
        if (!img || cancelled) return;
        e.img = img; e.real = true;
        e.frames = Math.max(1, meta.frames || Math.floor(img.width / (meta.w || SPRITE_W)) || 1);
      });
    }

    // ---- subjects -----------------------------------------------------------------------
    function makeEntity(s, at) {
      const tier = getTier(s.score);
      const key = keyOf(s);
      const you = !!myName && s.kind === "citizen" && s.name === myName;
      const e = {
        s: you ? { ...s, you: true } : s, key, tier, gait: gaitFor(tier.label, sim.reduced), k: statureOf(s), you,
        img: placeholderFor(key, tier.color), frames: 2, real: false, photographed: at !== BAY.door,
        status: s.status, x: 0, y: 0, tx: 0, ty: 0, dir: rnd() < 0.5 ? -1 : 1, state: "idle", timer: rnd() * 3, animT: rnd() * 2,
        route: [], goal: at, vy: 0, landY: 0, ang: 0, va: 0, say: null, sayW: 0, sayUntil: 0, nameW: 0, alpha: 1,
      };
      const r = bayRect(at, sim.L);
      e.x = at === BAY.door && sim.door ? (sim.door.x + sim.door.w / 2) / sim.S : r.x0 + 14 + rnd() * Math.max(4, r.x1 - r.x0 - 28);
      e.y = at === BAY.door ? r.walkTop + 2 : r.walkTop + rnd() * (r.walkBot - r.walkTop);
      e.tx = e.x; e.ty = e.y;
      if (e.photographed) develop(e);
      return e;
    }
    function add(e) {
      sim.ents.push(e); sim.byKey.set(e.key, e);
      while (sim.ents.length > HALL_MAX) {
        // the oldest released subject on the platform boards the train
        const i = sim.ents.findIndex(x => x.status === "released" && x !== sim.held);
        if (i < 0) break;
        sim.byKey.delete(sim.ents[i].key); sim.ents.splice(i, 1);
      }
    }
    // Walk to bay `to`, through every bay between, then stand somewhere in it.
    function goTo(e, to) {
      const from = bayAt(e.x, e.y, sim.L);
      e.goal = to; e.arrived = -1;
      e.path = bayPath(from, to).map(i => { const c = bayCenter(i, sim.L); return { x: c.x + (rnd() - 0.5) * 12, y: c.y + (rnd() - 0.5) * 10 }; });
      const r = bayRect(to, sim.L);
      const spread = to === BAY.photo || to === BAY.desk || to === BAY.chute ? 0.2 : 0.75;
      const cx = (r.x0 + r.x1) / 2, half = ((r.x1 - r.x0) / 2 - 16) * spread;
      e.path.push({ x: cx + (rnd() * 2 - 1) * half, y: to === BAY.chute ? (r.walkTop + r.walkBot) / 2 : r.walkTop + rnd() * (r.walkBot - r.walkTop) });
      nextWaypoint(e);
    }
    function nextWaypoint(e) {
      const p = e.path.shift();
      if (!p) { if (e.arrived !== e.goal) { e.arrived = e.goal; arriveBay(e); } else { e.state = "idle"; e.timer = 1 + rnd() * 2; } return; }
      e.tx = p.x; e.ty = p.y; e.state = "walk";
    }
    function continueRoute(e) {
      if (e.route.length) goTo(e, e.route.shift());
      else { e.state = "idle"; e.timer = 1 + rnd() * 3; }
    }
    // Each station does its one thing.
    function arriveBay(e) {
      const b = e.goal;
      if (b === BAY.photo) {
        sim.flash = { bay: b, t: 0.25 };
        e.photographed = true;
        if (hasLikeness(e.s)) { develop(e); say(e, "Likeness on file", 2.2); }
        else say(e, "Likeness pending", 3);
        e.state = "dwell"; e.timer = sim.reduced ? 1.2 : 2.2; return;
      }
      if (b === BAY.desk) {
        say(e, `${e.s.score} // ${e.tier.label}`, 2.6);
        e.stamp = true;
        e.state = "dwell"; e.timer = sim.reduced ? 1.2 : 2.4; return;
      }
      if (b === BAY.chute && e.releasing) {
        e.state = "sink"; e.vy = 0; return;
      }
      if (b === BAY.bench && e.status === "pending" && !e.route.length && rnd() < 0.5) say(e, pick(BENCH_MUTTERS, rnd));
      continueRoute(e);
    }
    // A pending subject whose day has come: bench, chute, platform.
    function release(e) {
      if (e.releasing || e.status === "released") return;
      e.releasing = true; e.route = [];
      if (e.state !== "held" && e.state !== "fall") goTo(e, BAY.chute);
      else e.goal = BAY.chute;
    }
    function landOnPlatform(e) {
      const r = bayRect(BAY.platform, sim.L);
      e.status = "released"; e.s = { ...e.s, status: "released", releaseDay: null, releaseAt: null }; e.releasing = false;
      e.x = r.x0 + 16 + rnd() * Math.max(4, r.x1 - r.x0 - 32);
      e.y = r.y0 + 30; e.landY = r.walkTop + rnd() * (r.walkBot - r.walkTop);
      e.vy = 0; e.alpha = 1; e.goal = BAY.platform; e.route = []; e.path = [];
      e.state = sim.reduced ? "idle" : "fall";
      if (sim.reduced) e.y = e.landY;
      announceRef.current(`Released to THE SUBSTRATE: ${displayName(e.s)}. ${assignedLine(e.s.assign)}.`, 6000);
      setList(l => ({ pending: l.pending.filter(x => keyOf(x) !== e.key), released: [e.s, ...l.released.filter(x => keyOf(x) !== e.key)] }));
    }

    // New arrivals come in through the door, one at a time, and walk the line.
    function spawnArrival(s) {
      if (sim.byKey.has(keyOf(s))) return;
      const e = makeEntity(s, BAY.door);
      e.route = [BAY.photo, BAY.desk, BAY.bench];
      e.goal = BAY.door;
      sim.doorT = 0;
      add(e);
      continueRoute(e);
      say(e, e.you ? "Is this... me?" : pick(ARRIVAL_LINES, rnd), 2.2);
      announceRef.current(e.you ? `New arrival: ${displayName(s)}. That is you. Please proceed to PHOTOGRAPHY.` : `New arrival: ${displayName(s)}. Proceed to PHOTOGRAPHY.`);
    }
    function settle(s) {
      if (sim.byKey.has(keyOf(s))) return;
      const e = makeEntity(s, homeBay(s.status));
      e.stamp = true;
      add(e);
    }

    // ---- data -----------------------------------------------------------------------------
    function load(first) {
      return fetch("/api/arrivals").then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then(d => {
        if (cancelled) return;
        const pending = (d.pending || []).map(s => ({ ...s, key: keyOf(s) }));
        const released = (d.released || []).map(s => ({ ...s, key: keyOf(s) }));
        const data = { pending, released };
        setMeta({ today: d.today, releaseNext: d.releaseNext, releaseNextAt: d.releaseNextAt });
        setState("ok");
        const hall = new Map(sim.ents.map(e => [e.key, { status: e.status, sprite: e.s.sprite }]));
        for (const q of sim.queue) hall.set(keyOf(q), { status: "pending", sprite: q.sprite });
        const r = reconcile(data, hall);
        if (first) {
          // Released subjects are already on the platform; this browser watches the pending
          // ones come in, yours first.
          for (const s of released.slice().reverse()) settle(s);
          const mine = r.enter.filter(s => myName && s.name === myName);
          sim.queue.push(...mine, ...r.enter.filter(s => !mine.includes(s)));
        } else {
          sim.queue.push(...r.enter);
          for (const s of r.settle) settle(s);
          for (const k of r.release) { const e = sim.byKey.get(k); if (e) { e.s = { ...e.s, ...released.find(x => x.key === k) }; release(e); } }
          for (const s of r.likeness) {
            const e = sim.byKey.get(s.key);
            if (!e) continue;
            e.s = { ...e.s, sprite: s.sprite, avatar: s.avatar };
            if (e.photographed) { develop(e); announceRef.current(`Likeness filed: ${displayName(s)}. The resemblance is noted.`); }
          }
        }
        // Keep what the hall holds that the server no longer lists (it keeps only the newest).
        setList(l => {
          const keep = (arr, next) => [...next, ...arr.filter(x => !next.some(n => n.key === keyOf(x)) && sim.byKey.has(keyOf(x)))];
          return { pending: keep(l.pending, pending).filter(x => !released.some(n => n.key === keyOf(x))), released: keep(l.released, released) };
        });
      }).catch(() => {
        if (cancelled || !first) return;
        setState("down");
        announceRef.current("Intake records unreachable. The door stays shut. The Department is not embarrassed.", 6000);
      });
    }
    loadManifest().then(m => { if (!cancelled) { sim.manifest = m || {}; for (const e of sim.ents) if (e.photographed && !e.real) develop(e); } });
    load(true);
    const pollIv = setInterval(() => { if (!document.hidden) load(false); }, POLL_MS);

    // The referral desk hands its results in: a new file walks in at the door; one already
    // in the hall hops; one on file elsewhere opens its file.
    sim.refer = (subject, status) => {
      if (!subject?.name || typeof subject.score !== "number") return false;
      const key = keyOf(subject);
      const e = sim.byKey.get(key);
      if (e) { sim.hop(key); return false; }
      if (sim.queue.some(q => keyOf(q) === key)) return false;
      const m = metaRef.current;
      const fresh = status === "created";
      if (fresh) {
        const s = { ...subject, kind: "figure", referred: true, key, status: "pending", releaseDay: m?.releaseNext ?? null, releaseAt: m?.releaseNextAt ?? null, assign: null };
        sim.queue.unshift(s);
        sim.nextArrival = 0;
        setList(l => ({ ...l, pending: [s, ...l.pending] }));
        // the server's assignment and release day, once it has them
        setTimeout(() => { if (!cancelled) load(false); }, 8000);
        return true;
      }
      setCard({ ...subject, key, status: "released" });
      return true;
    };
    // A namesake on file picked from the desk's list.
    sim.open = (slug) => {
      const e = sim.byKey.get(slug);
      if (e) { sim.hop(slug); setCard({ ...e.s }); return true; }
      const f = FAMOUS_FIGURES.find(x => slugify(x.name) === slug);
      if (f) { setCard({ ...f, slug, kind: "figure", key: slug, status: "released" }); return true; }
      return false;
    };
    sim.openKey = (key) => { const e = sim.byKey.get(key); if (e) { sim.hop(key); setCard({ ...e.s }); } };
    sim.hop = (key) => {
      const e = sim.byKey.get(key);
      if (!e || (e.state !== "idle" && e.state !== "walk" && e.state !== "dwell")) return;
      e.resume = e.state === "walk" ? "walk" : e.state === "dwell" ? "dwell" : null;
      e.landY = e.y; e.vy = sim.reduced ? 0 : -160; e.state = "fall";
    };

    // ---- background: the hall in text -----------------------------------------------------
    function glyphs(b, scale = 1.1) {
      const f = Math.max(9, Math.round(sim.fontPx * scale));
      b.font = `${f}px ${FONT}`;
      b.textBaseline = "top";
      return { f, cw: Math.max(4, b.measureText("M").width), ch: Math.round(f * 1.2) };
    }
    function paintBackground() {
      const { bg, S, L } = sim;
      bg.width = canvas.width; bg.height = canvas.height;
      const b = bg.getContext("2d");
      b.imageSmoothingEnabled = false;
      b.fillStyle = "#060a06"; b.fillRect(0, 0, bg.width, bg.height);
      const { f, cw, ch } = glyphs(b);
      sim.glyph = { f, cw, ch };
      const text = (str, x, y, color) => { b.fillStyle = color; b.fillText(str, x, y); };
      const fill = (x0, y0, x1, y1, pat, color) => {
        const cols = Math.ceil((x1 - x0) / cw) + 1;
        const line = pat.repeat(Math.ceil(cols / pat.length)).slice(0, cols);
        b.save(); b.beginPath(); b.rect(x0, y0, x1 - x0, y1 - y0); b.clip();
        b.fillStyle = color;
        for (let y = y0; y < y1; y += ch) b.fillText(line, x0, y);
        b.restore();
      };
      const W = bg.width;
      // roof: the building's name and what this floor is for
      fill(0, TOP_PAD * S - ch, W, TOP_PAD * S, "▄", "#1a2e1f");
      b.font = `700 ${f}px ${FONT}`;
      const title = W / cw > 60 ? "DEPARTMENT OF HUMAN ASSESSMENT // INTAKE" : "DEPT. OF HUMAN ASSESSMENT // INTAKE";
      text(title, Math.max(cw, (W - title.length * cw) / 2), TOP_PAD * S - ch * 2, "#3d6b50");
      b.font = `${f}px ${FONT}`;
      sim.signs = [];
      for (let i = 0; i < BAYS.length; i++) {
        const r = bayRect(i, L), id = BAYS[i].id;
        const X0 = r.x0 * S, X1 = r.x1 * S, T = r.y0 * S;
        const wallTop = T + 8 * S, wallBot = (r.walkTop - 6) * S, floorBot = (r.y1 - 2) * S;
        const hot = id === "chute";
        fill(X0, wallTop, X1, wallBot, id === "chute" ? "▓" : id === "platform" ? "▒" : "░", hot ? "#1c0e0e" : "#13251a");
        fill(X0, wallBot, X1, wallBot + ch * 0.9, "▓", hot ? "#2a1616" : "#1a2e1f");
        // the floor, dotted like the pen's
        let row = 0;
        for (let y = wallBot + ch; y < floorBot; y += ch, row++) {
          let line = "";
          const cols = Math.ceil((X1 - X0) / cw);
          for (let c = 0; c < cols; c++) {
            const h = ((c * 73856093) ^ ((row + i * 7) * 19349663)) >>> 0;
            line += (c + row) % 2 === 0 ? (h % 11 === 0 ? "," : "·") : (h % 29 === 0 ? "." : " ");
          }
          text(line, X0, y, hot ? "#2a1a14" : "#1f3b28");
        }
        // the slab above, the partition on the right (a doorway at floor level)
        fill(X0, T, X1, T + 8 * S, "═", "#1f3a26");
        if (r.col < L.perRow - 1) for (let y = T + 8 * S; y < wallBot; y += ch) text("║", X1 - cw * 0.5, y, "#1f3a26");
        // the sign
        b.font = `700 ${f}px ${FONT}`;
        const sign = X1 - X0 > (BAYS[i].sign.length + 2) * cw ? BAYS[i].sign : BAYS[i].name.split(" ").slice(-1)[0];
        text(sign, X0 + cw, wallTop + ch * 0.1, hot ? "#f87171" : id === "door" ? "#b45309" : "#3d6b50");
        b.font = `${f}px ${FONT}`;
        sim.signs[i] = { x: X0 + cw, y: wallTop + ch * 1.15, w: X1 - X0 - 2 * cw };
        const mid = (X0 + X1) / 2, cols = Math.floor((X1 - X0) / cw);
        const deco = DECO[id];
        // each bay's furniture stays inside its own walls
        b.save(); b.beginPath(); b.rect(X0, T, X1 - X0 - cw * 0.6, floorBot - T); b.clip();
        if (deco) deco({ b, text, fill, f, cw, ch, X0, X1, mid, cols, wallTop, wallBot, floorBot, S, r });
        b.restore();
      }
      // openings between rows where the line turns (the snake's bend)
      for (let i = 0; i < BAYS.length - 1; i++) {
        const a = bayRect(i, L), c = bayRect(i + 1, L);
        if (a.row === c.row) continue;
        const x = ((a.x0 + a.x1) / 2) * S;
        fill(x - 5 * cw, c.y0 * S, x + 5 * cw, c.y0 * S + 8 * S, "▼", "#2f6a42");
      }
      fill(0, (TOP_PAD + L.rows * ROW_H) * S, W, (TOP_PAD + L.rows * ROW_H + FOUNDATION) * S, "▓", "#141f17");
    }
    const DECO = {
      door({ text, cols, X0, cw, ch, wallTop, wallBot, S }) {
        // the arrivals door: amber frame, opens when someone comes through
        const dCols = Math.max(5, Math.min(9, Math.floor(cols * 0.3)));
        const dx = X0 + 2 * cw, dTop = wallTop + ch * 2.4, rows = Math.max(3, Math.floor((wallBot + 4 * S - dTop) / ch));
        text("┌" + "─".repeat(dCols - 2) + "┐", dx, dTop, "#b45309");
        for (let k = 1; k < rows; k++) { text("│", dx, dTop + k * ch, "#b45309"); text("│", dx + (dCols - 1) * cw, dTop + k * ch, "#b45309"); text("▒".repeat(dCols - 2), dx + cw, dTop + k * ch, "#3a2e12"); }
        sim.door = { x: dx + cw, w: (dCols - 2) * cw, y0: dTop + ch, y1: dTop + rows * ch };
        if (cols > 32) text("NOW ADMITTING: ANYONE", dx + (dCols + 2) * cw, dTop + ch, "#1f4a2c");
      },
      photo({ text, X1, cw, ch, wallTop, cols, X0 }) {
        // a height chart and a camera on its tripod
        const hx = X0 + 2 * cw, top = wallTop + ch * 2.4;
        ["─190─", "─180─", "─170─", "─160─"].forEach((s, k) => text(s, hx, top + ch * k, "#1f4a2c"));
        const cx = Math.max(hx + 7 * cw, X1 - 9 * cw);
        text("┌─┐", cx, top, "#2f6a42");
        text("[◙]", cx, top + ch, "#4ade80");
        text(" ╱│╲", cx - cw, top + ch * 2, "#2f6a42");
        if (cols > 34) text("SMILE: NOT REQUIRED", X0 + 9 * cw, top, "#1f4a2c");
      },
      desk({ text, mid, cw, ch, wallBot, wallTop, cols, X0 }) {
        const w = Math.max(9, Math.min(17, cols - 4));
        const x = mid - (w / 2) * cw;
        text("╤" + "═".repeat(w - 2) + "╤", x, wallBot - ch * 1.2, "#2f6a42");
        text("│" + (w > 12 ? " ▣ STAMP ▣ " : " ▣ ").padEnd(w - 2).slice(0, w - 2) + "│", x, wallBot - ch * 0.2, "#2f6a42");
        if (cols > 22) text("NOW SERVING: YOU", X0 + 2 * cw, wallTop + ch * 2.6, "#1f4a2c");
      },
      bench({ text, X0, X1, cw, wallBot, ch }) {
        const w = Math.max(6, Math.floor((X1 - X0) / cw) - 6);
        text("╥" + "─".repeat(w - 2) + "╥", X0 + 3 * cw, wallBot - ch * 0.6, "#2f6a42");
      },
      chute({ fill, text, mid, cw, ch, wallBot, floorBot, X0, X1, S, r }) {
        // the pit, hazard stripes, and the drop
        const half = Math.max(3, Math.floor((X1 - X0) / cw * 0.22));
        fill(mid - half * cw, wallBot + ch, mid + half * cw, floorBot, "▼", "#5a2020");
        text("▚".repeat(half * 2 + 4), mid - (half + 2) * cw, wallBot + 2, "#5a4210");
        sim.chute = { x0: (mid - half * cw) / S, x1: (mid + half * cw) / S };
        void r;
        if ((X1 - X0) / cw > 36) text("DO NOT JUMP. YOU WILL BE PUSHED.", X0 + cw, wallBot - ch * 1.1, "#5a2020");
      },
      platform({ fill, text, X0, X1, cw, ch, floorBot, wallBot }) {
        // the Loop's rails at the back of the platform, and the platform edge
        fill(X0, wallBot - ch * 1.6, X1, wallBot - ch * 0.6, "═╪═", "#2f6a42");
        fill(X0, wallBot + ch * 0.1, X1, wallBot + ch * 0.9, "▔", "#b45309");
        sim.rail = { x0: X0, x1: X1, y: wallBot - ch * 2.3 };
        void floorBot;
      },
    };

    // ---- sizing -----------------------------------------------------------------------------
    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const isNarrow = cssW < 520;
      const dpr = window.devicePixelRatio || 1;
      // Phones as in the pen (about 1.3 CSS px a sprite px); desktops a size up, the hall is one floor.
      const S = isNarrow ? Math.max(1, Math.round(dpr * 1.25)) : Math.max(1, Math.round(dpr * 1.5));
      const oldL = sim.L;
      canvas.width = Math.round(cssW * dpr);
      sim.w = Math.floor(canvas.width / S);
      sim.L = layoutFor(sim.w);
      canvas.height = Math.round(sim.L.h * S);
      canvas.style.height = canvas.height / dpr + "px";
      sim.S = S; sim.dpr = dpr; sim.fontPx = Math.round(10 * dpr);
      setNarrow(isNarrow);
      // everyone keeps their bay and their place in it
      for (const e of sim.ents) {
        if (e === sim.held) continue;
        const i = bayAt(e.x, e.y, oldL), a = bayRect(i, oldL), n = bayRect(i, sim.L);
        const fx = (e.x - a.x0) / (a.x1 - a.x0), fy = e.y - a.y0;
        e.x = n.x0 + clamp(fx, 0.05, 0.95) * (n.x1 - n.x0); e.y = n.y0 + fy; e.landY = e.y;
        if (e.state === "walk" || e.state === "fall") goTo(e, e.goal ?? homeBay(e.status));
        else { e.tx = e.x; e.ty = e.y; }
        e.nameW = 0; if (e.say) say(e, e.say, e.sayUntil - sim.t);
      }
      paintBackground();
    }
    resize();
    document.fonts?.load?.(`16px ${FONT}`).then(() => { if (!cancelled) paintBackground(); }).catch(() => {});
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);
    const onMotion = () => { sim.reduced = !!mq?.matches; for (const e of sim.ents) e.gait = gaitFor(e.tier.label, sim.reduced); };
    mq?.addEventListener?.("change", onMotion);

    // ---- pointer: pick up, carry, drop (the pen's hands) -------------------------------------
    const toWorld = (ev) => { const r = canvas.getBoundingClientRect(); return [((ev.clientX - r.left) * sim.dpr) / sim.S, ((ev.clientY - r.top) * sim.dpr) / sim.S]; };
    function hitTest(wx, wy, touch = false) {
      const half = touch ? 16 : 11, pad = touch ? 6 : 2;
      let best = null, bestD = Infinity;
      const o = sim.ents;
      for (let i = o.length - 1; i >= 0; i--) {
        const e = o[i];
        if (e === sim.held || e.state === "fall" || e.state === "sink") continue;
        if (Math.abs(wx - e.x) > half * e.k || wy < e.y - 46 * e.k - pad || wy > e.y + pad) continue;
        if (!touch) return e;
        const d = Math.abs(wx - e.x) + Math.abs(wy - (e.y - 22 * e.k)) * 0.5;
        if (d < bestD) { best = e; bestD = d; }
      }
      return best;
    }
    function onDown(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      const [wx, wy] = toWorld(ev);
      const e = hitTest(wx, wy, ev.pointerType === "touch" || ev.pointerType === "pen");
      if (!e) return;
      if (e.s.noDangle) { const s = e.s; setTimeout(() => { if (!cancelled) setCard({ ...s }); }, 0); return; }
      const p = sim.pointer;
      p.x = wx; p.y = wy; p.downX = wx; p.downY = wy; p.vx = 0; p.dragged = false; p.id = ev.pointerId;
      e.was = e.state === "dwell" ? { state: "dwell", timer: e.timer } : null;
      sim.held = e; e.state = "held"; e.ang = 0; e.va = 0;
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* fine */ }
      say(e, pick(GRAB_LINES, rnd), 60);
      announceRef.current(HOLD_LINE, 3500);
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
      const L = sim.L;
      const bay = bayAt(e.x, e.y - 8, L), r = bayRect(bay, L);
      e.x = clamp(e.x, r.x0 + 10, r.x1 - 10);
      e.landY = clamp(e.y, r.walkTop, r.walkBot);
      e.vy = 0; e.state = "fall"; e.say = null;
      e.resume = "goal";
      setCursor(sim.hover ? "grab" : "");
      if (ev.type === "pointercancel") return;
      const s = e.s;
      if (bay === BAY.chute) {
        // THE CHUTE: a reading of where the city will put them, then back in line
        const line = assignedLine(s.assign);
        announceRef.current(s.status === "released"
          ? `${line}. ALREADY RELEASED. FIND THEM IN THE CITY.`
          : `${line}. ${releaseLine(s.releaseDay, s.releaseAt)}. NOT BEFORE.`, 9000);
        say(e, s.assign?.home ? `▼ ${s.assign.home}` : "Is that the city down there?", 4);
        e.x = r.x0 + (sim.chute ? (sim.chute.x0 + sim.chute.x1) / 2 - r.x0 : (r.x1 - r.x0) / 2);
        return;
      }
      if (sim.pointer.dragged) announceRef.current(pick(DROP_CAPTIONS, rnd));
      setTimeout(() => { if (!cancelled) setCard({ ...s }); }, sim.reduced ? 0 : 280);
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

    // ---- frame ------------------------------------------------------------------------------
    function step(e, dt) {
      const g = e.gait;
      if (e.state === "dwell") { e.timer -= dt; if (e.timer <= 0) continueRoute(e); return; }
      if (e.state === "idle") {
        e.timer -= dt;
        if (rnd() < g.flip * dt) e.dir = -e.dir;
        if (e.timer > 0) return;
        const r = bayRect(e.goal ?? homeBay(e.status), sim.L);
        e.path = [];
        e.tx = clamp(e.x + (rnd() * 2 - 1) * (r.x1 - r.x0) * 0.4, r.x0 + 14, r.x1 - 14);
        e.ty = r.walkTop + rnd() * (r.walkBot - r.walkTop);
        e.state = "walk";
        return;
      }
      if (e.state === "sink") {
        e.y += (sim.reduced ? 120 : 40) * dt; e.alpha = Math.max(0, e.alpha - dt * 1.6);
        if (e.alpha <= 0) landOnPlatform(e);
        return;
      }
      if (e.state !== "walk") return;
      const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy);
      // on the line they move with purpose; wandering is the gait's own pace
      const sp = (e.path?.length || e.goal !== bayAt(e.x, e.y, sim.L) ? Math.max(18, g.speed * 1.5) : g.speed) * (sim.reduced ? 0.6 : 1);
      const d = sp * dt;
      if (dist <= d || dist < 0.5) {
        e.x = e.tx; e.y = e.ty;
        if (e.path?.length) nextWaypoint(e);
        else if (e.goal != null && e.arrived !== e.goal) { e.arrived = e.goal; arriveBay(e); }
        else { e.state = "idle"; e.timer = g.idleMin + rnd() * (g.idleMax - g.idleMin); }
        return;
      }
      e.x += (dx / dist) * d; e.y += (dy / dist) * d;
      if (Math.abs(dx) > 0.5) e.dir = dx < 0 ? -1 : 1;
      e.animT += dt;
    }

    function update(dt) {
      sim.t += dt;
      if (sim.flash.t > 0) sim.flash.t -= dt;
      sim.doorT += dt;
      sim.trainT -= dt;
      if (sim.trainT < -7) sim.trainT = 22 + rnd() * 10;
      if (sim.queue.length && sim.t >= sim.nextArrival) { spawnArrival(sim.queue.shift()); sim.nextArrival = sim.t + (sim.reduced ? 1.5 : 2.6); }
      // a pending subject whose machine day has begun goes down the chute
      if (Math.floor(sim.t * 2) !== Math.floor((sim.t - dt) * 2)) {
        const now = Date.now();
        for (const e of sim.ents) if (e.status === "pending" && !e.releasing && e.s.releaseAt && Date.parse(e.s.releaseAt) <= now && e.arrived === BAY.bench) release(e);
      }
      if (sim.t >= sim.nextMutter) {
        sim.nextMutter = sim.t + 2 + rnd() * 3;
        const e = sim.ents[Math.floor(rnd() * sim.ents.length)];
        if (e && e.state === "idle" && !e.say) say(e, pick(e.status === "released" ? PLATFORM_MUTTERS : BENCH_MUTTERS, rnd));
      }
      const p = sim.pointer;
      for (const e of sim.ents) {
        if (e.say && sim.t > e.sayUntil) e.say = null;
        if (e.state === "held") {
          e.x = clamp(p.x, 4, sim.w - 4); e.y = clamp(p.y + Math.round(SPRITE_H * e.k) - Math.round(6 * e.k), SPRITE_H - 2, sim.L.h);
          e.va += (-e.ang * 60 - e.va * 5 + p.vx * 4) * dt;
          e.ang = clamp(e.ang + e.va * dt, -0.6, 0.6);
          p.vx *= 0.9; e.animT += dt;
          if (sim.t > e.sayUntil - 58 && sim.t - (e.lastLine || 0) > 2.4) { e.lastLine = sim.t; say(e, pick(GRAB_LINES, rnd), 60); }
          continue;
        }
        if (e.state === "fall") {
          e.vy += GRAVITY * dt; e.y += e.vy * dt;
          e.ang *= Math.max(0, 1 - dt * 10);
          if (e.y >= e.landY) {
            e.y = e.landY;
            if (e.vy > 120 && !sim.reduced) { e.vy = -e.vy * 0.28; continue; }
            e.vy = 0; e.ang = 0;
            const resume = e.resume; e.resume = null;
            if (resume === "goal") {
              // back in line where they were taken from (a dwell restarts: the paperwork does)
              const to = e.releasing ? BAY.chute : e.goal ?? homeBay(e.status);
              if (e.arrived === to && !e.releasing && bayAt(e.x, e.y, sim.L) === to) continueRoute(e);
              else goTo(e, to);
            } else if (resume === "walk") e.state = "walk";
            else if (resume === "dwell") { e.state = "dwell"; e.timer = 0.6; }
            else { e.state = "idle"; e.timer = 0.6 + rnd(); }
          }
          continue;
        }
        step(e, dt);
      }
      sim.ents.sort((a, b) => (a === sim.held ? 1e9 : a.y) - (b === sim.held ? 1e9 : b.y));
    }

    function drawBubble(text, tw, cx, top, hot, color) {
      const pad = Math.round(4 * sim.dpr), h = sim.fontPx + pad * 2;
      let x = clamp(Math.round(cx - tw / 2 - pad), 2, canvas.width - tw - pad * 2 - 2);
      const bw = Math.round(tw + pad * 2);
      let y = Math.max(2, Math.round(top - h));
      const placed = sim.bubbles;
      for (let tries = 0; tries < 4; tries++) {
        let hit = null;
        for (let i = 0; i < placed.length; i += 4) if (x < placed[i] + placed[i + 2] && x + bw > placed[i] && y < placed[i + 1] + placed[i + 3] && y + h > placed[i + 1]) { hit = placed[i + 1]; break; }
        if (hit === null) break;
        y = hit - h - 2;
        if (tries === 3) y = -1;
      }
      if (y < 2 && !hot) return;
      y = Math.max(2, y);
      placed.push(x, y, bw, h);
      ctx.fillStyle = color || (hot ? "#fbbf24" : "#d1fae5");
      ctx.fillRect(x, y, bw, h);
      ctx.fillStyle = "#0a0f0a";
      ctx.fillText(text, x + pad, y + pad);
    }

    function draw() {
      const { S, L } = sim;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sim.bg, 0, 0);
      ctx.textBaseline = "top";
      const g = sim.glyph;
      ctx.font = `${g.f}px ${FONT}`;
      // live signs: the bench's countdown, the chute's next drop, the platform's day
      const m = metaRef.current, now = Date.now();
      const soonest = sim.ents.filter(e => e.status === "pending" && e.s.releaseAt).map(e => e.s).sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt))[0];
      const benchN = sim.ents.filter(e => e.status === "pending").length;
      const signs = {
        [BAY.door]: sim.queue.length ? `IN THE CORRIDOR: ${sim.queue.length}` : "DOOR IDLE. REFER SOMEONE.",
        [BAY.photo]: "LIKENESS: ON FILE OR PENDING",
        [BAY.desk]: "SCORE + TIER STAMPED",
        [BAY.bench]: `WAITING: ${benchN}`,
        [BAY.chute]: soonest || m?.releaseNext ? `NEXT DROP: DAY ${soonest?.releaseDay || m.releaseNext} ~${minutesUntil(soonest?.releaseAt || m.releaseNextAt, now) ?? "?"} MIN` : "NEXT DROP: PENDING",
        [BAY.platform]: m?.today ? `MACHINE DAY ${m.today} IN SESSION` : "SERVICE: CONTINUOUS",
      };
      for (let i = 0; i < BAYS.length; i++) {
        const sg = sim.signs?.[i];
        if (!sg) continue;
        const t = signs[i], max = Math.floor(sg.w / g.cw);
        ctx.fillStyle = i === BAY.chute ? "#b91c1c" : "#2f6a42";
        ctx.fillText(t.length > max ? t.slice(0, Math.max(0, max - 1)) + "…" : t, sg.x, sg.y);
      }
      // the door opens for an arrival
      if (sim.door) {
        const open = clamp(sim.doorT < 1.2 ? 1 : 1 - (sim.doorT - 1.2) * 2, 0, 1);
        if (open > 0.02) {
          const d = sim.door, gap = Math.round((d.w / 2) * open);
          ctx.fillStyle = "#010201"; ctx.fillRect(d.x + d.w / 2 - gap, d.y0, gap * 2, d.y1 - d.y0);
          ctx.fillStyle = "rgba(251,191,36,0.16)"; ctx.fillRect(d.x + d.w / 2 - gap, d.y0, gap * 2, d.y1 - d.y0);
        }
      }
      // the Loop: a train crosses the platform now and then
      if (sim.rail && sim.trainT < 0) {
        const k = -sim.trainT / 7, train = "▐[■■]═[■■]═[■■]▌";
        const tw = train.length * g.cw, x = sim.rail.x1 - k * (sim.rail.x1 - sim.rail.x0 + tw);
        ctx.save(); ctx.beginPath(); ctx.rect(sim.rail.x0, sim.rail.y - g.ch, sim.rail.x1 - sim.rail.x0, g.ch * 3); ctx.clip();
        ctx.fillStyle = "#4ade80"; ctx.fillText(train, x, sim.rail.y + g.ch * 0.3);
        ctx.restore();
      }

      // shadows, then subjects
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      for (const e of sim.ents) {
        if (e.state === "sink") continue;
        const gy = e.state === "held" ? null : e.state === "fall" ? e.landY : e.y;
        if (gy == null) continue;
        const sx = Math.round(e.x);
        ctx.fillRect((sx - 6) * S, (Math.round(gy) - 1) * S, 12 * S, 2 * S);
      }
      for (const e of sim.ents) {
        let fi = 0, bob = 0;
        if (e.state === "walk") { const st = Math.floor(e.animT * e.gait.fps); fi = e.frames > 1 ? st % e.frames : 0; bob = e.gait.bob && st % 2 ? -1 : 0; }
        else if (e.state === "held") fi = e.frames > 1 ? Math.floor(e.animT * 11) % e.frames : 0;
        const sxSrc = fi * SPRITE_W;
        const kh = Math.round(SPRITE_H * e.k), kw = Math.round(SPRITE_W * e.k), kx = Math.round(kw / 2);
        ctx.globalAlpha = e.alpha;
        if (e.state === "sink") {
          // going down the chute: clipped at the floor
          const r = bayRect(BAY.chute, L);
          ctx.save(); ctx.beginPath(); ctx.rect(r.x0 * S, r.y0 * S, (r.x1 - r.x0) * S, (r.walkBot - r.y0) * S); ctx.clip();
          ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, (Math.round(e.x) - kx) * S, (Math.round(e.y) - kh) * S, kw * S, kh * S);
          ctx.restore();
        } else if (e.state === "held" || (e.state === "fall" && Math.abs(e.ang) > 0.01)) {
          const px = Math.round(e.x) * S, py = Math.round(e.y - kh + Math.round(6 * e.k)) * S;
          const c = Math.cos(e.ang), s = Math.sin(e.ang), f = e.dir < 0 ? -1 : 1;
          const kick = e.state === "held" && !sim.reduced ? Math.floor(e.animT * 11) % 2 : 0;
          ctx.setTransform(c * f, s * f, -s, c, px + kick * S, py);
          ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, -kx * S, -Math.round(6 * e.k) * S, kw * S, kh * S);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          const dx = Math.round(e.x) - kx, dy = (Math.round(e.y) - kh + bob) * S;
          if (e.dir < 0) { ctx.setTransform(-1, 0, 0, 1, (dx + kw) * S, 0); ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, 0, dy, kw * S, kh * S); ctx.setTransform(1, 0, 0, 1, 0, 0); }
          else ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, dx * S, dy, kw * S, kh * S);
        }
        ctx.globalAlpha = 1;
        if (e.you) {
          const ay = Math.round(e.y - kh - 7 + (sim.reduced ? 0 : Math.round(Math.sin(sim.t * 4)))) * S, ax = Math.round(e.x) * S;
          ctx.fillStyle = "#4ade80";
          ctx.fillRect(ax - 3 * S, ay, 7 * S, S); ctx.fillRect(ax - 2 * S, ay + S, 5 * S, S); ctx.fillRect(ax - S, ay + 2 * S, 3 * S, S); ctx.fillRect(ax, ay + 3 * S, S, S);
        }
      }
      // the camera flash
      if (sim.flash.t > 0 && sim.flash.bay >= 0) {
        const r = bayRect(sim.flash.bay, L);
        ctx.fillStyle = `rgba(236,253,245,${Math.min(0.55, sim.flash.t * 2.2)})`;
        ctx.fillRect(r.x0 * S, (r.y0 + 8) * S, (r.x1 - r.x0) * S, (r.y1 - r.y0 - 10) * S);
      }
      // stamps under the feet: RELEASED on the platform, the release day on the bench
      const sf = Math.max(8, Math.round(sim.fontPx * 0.8));
      ctx.font = `700 ${sf}px ${FONT}`;
      ctx.textAlign = "center";
      const stamped = [];   // one stamp never prints over another: crowded platforms show some
      for (const e of sim.ents) {
        if (e.state !== "idle" && e.state !== "walk" && e.state !== "dwell") continue;
        const b = bayAt(e.x, e.y, L);
        const st = e.status === "released" && b === BAY.platform ? ["RELEASED", "#b45309"]
          : e.status === "pending" && b === BAY.bench && e.s.releaseDay ? [`DAY ${e.s.releaseDay}`, "#4d8a62"]
          : !e.photographed && !e.real ? ["UNPHOTOGRAPHED", "#6b5a1c"] : null;
        if (!st) continue;
        const tw = ctx.measureText(st[0]).width, x = e.x * S - tw / 2, y = (e.y + 1) * S;
        if (stamped.some(([sx, sy, sw]) => x < sx + sw + 4 && x + tw + 4 > sx && Math.abs(y - sy) < sf * 1.1)) continue;
        stamped.push([x, y, tw]);
        ctx.fillStyle = st[1]; ctx.fillText(st[0], e.x * S, y);
      }
      ctx.textAlign = "left";
      // labels and speech on top
      ctx.font = `${sim.fontPx}px ${FONT}`;
      sim.bubbles.length = 0;
      for (const e of sim.ents) {
        if (e.state === "sink") continue;
        const head = (e.y - Math.round(SPRITE_H * e.k) - 2) * S;
        if (e.say) {
          const stamp = e.say.startsWith(`${e.s.score} //`);
          drawBubble(e.say, e.sayW, e.x * S, head - (e.you ? 6 * S : 0), e.state === "held", stamp ? e.tier.color : null);
        } else if (e === sim.hover || e === sim.held) {
          const label = displayName(e.s).toUpperCase();
          if (!e.nameW) e.nameW = ctx.measureText(label).width;
          drawBubble(label, e.nameW, e.x * S, head, false);
        }
      }
    }

    let raf = 0, last = 0;
    function frame(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      if (!cardRef.current || sim.held) update(dt);   // the hall holds its breath while a file is open
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      clearInterval(pollIv);
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
  }, []);

  const now = Date.now();
  const rows = [...list.pending.map(s => ({ s, pending: true })), ...list.released.map(s => ({ s, pending: false }))];
  const openRow = (s) => { const k = keyOf(s); simRef.current?.hop?.(k); setCard({ ...s }); };
  const nP = list.pending.length;
  const headMeta = state === "down" ? "INTAKE RECORDS OFFLINE"
    : `${nP} AWAITING RELEASE // ${list.released.length} RELEASED${meta?.today ? ` // MACHINE DAY ${meta.today}` : ""}`;

  return (
    <div className="hvi-arrivals">
      <ScreenHead title="INTAKE" meta={headMeta} />
      <div className="hvi-arr-desk">
        <div className="hvi-arr-desk-head">THE REFERRAL DESK // NEW SUBJECTS ARE FILED HERE AND ENTER AT THE ARRIVALS DOOR</div>
        <ReferralBar simRef={simRef} />
      </div>
      <Frame box title="PROCESSING HALL" meta={narrow ? "HOLD A SUBJECT TO LIFT IT" : "DOOR ▸ PHOTO ▸ DESK ▸ BENCH ▸ CHUTE ▸ LOOP"} bodyClass="flush">
        <div className="hvi-arr-stage" ref={wrapRef}>
          <canvas ref={canvasRef} className={`hvi-arr-canvas${cursor ? " " + cursor : ""}`} role="img"
            aria-label="Intake, the processing hall: new arrivals come in at the arrivals door, are photographed, assessed and stamped, then wait on the holding bench until the next machine day, when the chute drops them onto the Loop platform to the city. Use the arrivals list below to open files by keyboard." />
        </div>
        <Rule />
        <div className="hvi-arr-caption" aria-hidden="true">
          <PaLine key={caption.text} text={caption.text} tone={caption.hot ? "warn" : undefined} />
        </div>
        <div role="status" className="sr-only">{srStatus}</div>
      </Frame>
      <div className="hvi-arr-help">
        <p>{narrow ? "HOLD A SUBJECT TO LIFT IT. LET GO TO READ THE FILE." : "DRAG A SUBJECT TO LIFT IT. DROP IT TO READ THE FILE."} THE DEPARTMENT OBJECTS.</p>
        <p>DROP A SUBJECT ON THE CHUTE TO READ WHERE THE CITY WILL PUT THEM. THE CHUTE ONLY OPENS ON THEIR DAY.</p>
        <p>A FILE INDEXED AFTER A MACHINE DAY'S CITY WAS BUILT WAITS FOR THE NEXT ONE. A MACHINE DAY IS 24 REAL MINUTES.</p>
      </div>
      <Disclosure className="hvi-arr-registry" title="ARRIVALS" meta={`${nP} WAITING // ${list.released.length} RELEASED`} defaultOpen>
        <div className="hvi-arr-list" role="list" aria-label="Arrivals, newest first">
          {rows.map(({ s, pending }) => {
            const t = getTier(s.score);
            const m = pending ? minutesUntil(s.releaseAt, now) : null;
            const tag = pending ? (s.releaseDay ? `DAY ${s.releaseDay}${m != null ? ` ~${m}M` : ""}` : "PENDING") : "RELEASED";
            return (
              <div role="listitem" key={`${pending ? "p" : "r"}-${keyOf(s)}`}>
                <ListRow lead={<FilePhoto subject={s} scale={1} compact />} onClick={() => openRow(s)}
                  label={`${displayName(s)}${s.name && simRef.current?.byKey?.get(keyOf(s))?.you ? " (YOU)" : ""}`} spark={<Sparkline s={s} />} value={s.score} tone={t.color} tag={tag}
                  aria-label={`${displayName(s)}, ${s.score}, ${t.label}, ${pending ? releaseLine(s.releaseDay, s.releaseAt, now) : "released"}.${sparkLabelOf(s) ? ` ${sparkLabelOf(s)}.` : ""} Open file.`} />
              </div>
            );
          })}
          {!rows.length && <div className="hvi-arr-none">{state === "loading" ? "[ .. ] READING THE INTAKE LOG █" : "NO ARRIVALS ON RECORD. THE DEPARTMENT DOES NOT INVENT SUBJECTS."}</div>}
        </div>
      </Disclosure>
      {card && (() => { const cp = cardFor(card, meta); return <SubjectCard subject={card} onClose={() => setCard(null)} where={cp.where} back={cp.back} assignment={cp.assignment} extra={cp.extra} />; })()}
    </div>
  );
}
