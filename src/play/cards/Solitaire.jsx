// SOLITAIRE (Klondike) and SPIDER SOLITAIRE: the home games, with a deck of cards on your table.
// The rules engines (klondike.js, spider.js) are the authority; this page draws the felt and
// takes the inputs: drag a card (or a run) and drop it; or tap to pick it up and tap where it goes
// (tap it again to send it to its best place: home first); arrows / d-pad move, Enter / A picks
// and drops, Esc / Start pauses. UNDO replays the log less its last input. The game is kept in this
// browser. Exhibition: Vegas scoring is in nothing; no CYCLES move.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as K from "./klondike.js";
import * as SP from "./spider.js";
import PixelCard from "./PixelCard.jsx";
import { CW, CH, drawCard } from "./art.js";
import { codeOf, nameOf, suitOf, SUIT_WORD } from "./deck.js";
import GameMenu from "../GameMenu.jsx";
import { Button, Chip, Chips } from "../../ui/index.js";
import { useFour, reducedMotion } from "./prefs.js";
import { arrowKeys, usePad } from "./padnav.js";

const UPN = (c) => nameOf(c).toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const newSeed = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] || 1; } catch { return (Date.now() >>> 0) || 1; } };
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };
const load = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };

function useWidth(ref) {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? Math.min(window.innerWidth, 1000) : 800));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
// The card size for n columns in this width: CSS px per card pixel, in quarter steps.
function layout(width, cols) {
  const gap = width < 520 ? (cols > 7 ? 2 : 4) : 8;
  const raw = (width - (width < 560 ? 14 : 30) - gap * (cols - 1)) / (cols * CW);
  const scale = Math.max(0.75, Math.min(2.5, Math.floor(raw * 4) / 4));
  return { scale, gap, big: scale < 1.75, cw: CW * scale, ch: CH * scale };
}

// ---- dragging: pointer down on a face-up card, move past 6 px, drop on a pile ([data-pile]) ---------
function useDrag(onTap, onDrop) {
  const [drag, setDrag] = useState(null);   // {from, n, x, y, ox, oy, cards}
  const st = useRef(null);
  const live = useRef({}); live.current = { onTap, onDrop };
  useEffect(() => {
    const move = (e) => {
      const d = st.current;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moving && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moving = true;
      if (d.moving) { e.preventDefault(); setDrag({ ...d, x: e.clientX, y: e.clientY }); }
    };
    const up = (e) => {
      const d = st.current;
      if (!d || e.pointerId !== d.id) return;
      st.current = null;
      if (d.moving) {
        setDrag(null);
        const els = document.elementsFromPoint?.(e.clientX, e.clientY) || [];
        const pile = els.map(el => el.closest?.("[data-pile]")).find(Boolean);
        live.current.onDrop(d.from, d.n, pile ? pile.dataset.pile : null);
      } else if (e.type === "pointerup") live.current.onTap(d.from, d.n);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, []);
  const start = (e, from, n, cards) => {
    if (e.button != null && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    st.current = { id: e.pointerId, from, n, cards, x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moving: false };
  };
  return { drag, start };
}

// ---- the win: the cards leave the foundations one by one and bounce across the felt, leaving a trail
// (an homage to a famous one; the Department's own: the trail is filed, a stamp at the end). Tap or
// any key stops it.
function Cascade({ box, sources, scale, four, back, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const g = cv.getContext("2d");
    g.scale(dpr, dpr); g.imageSmoothingEnabled = false;
    const queue = [];
    // kings first, round the four piles, down to the aces
    const piles = sources.map(s => s.cards.slice());
    for (let k = 12; k >= 0; k--) piles.forEach((p, i) => { const c = p[k]; if (c != null) queue.push({ c, x: sources[i].x, y: sources[i].y }); });
    const flying = [];
    let raf = 0, next = 0, t = 0, ended = false;
    const cw = CW * scale, ch = CH * scale;
    const stamp = () => {
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(box.w / 2 - 110, box.h / 2 - 26, 220, 52);
      g.strokeStyle = "#fbbf24"; g.lineWidth = 3; g.strokeRect(box.w / 2 - 110, box.h / 2 - 26, 220, 52);
      g.fillStyle = "#fbbf24"; g.font = "bold 20px 'Fira Mono', ui-monospace, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("FILED: SOLVED", box.w / 2, box.h / 2);
    };
    const tick = () => {
      t++;
      if (queue.length && t >= next) {
        const q = queue.shift();
        flying.push({ ...q, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.5), vy: -Math.random() * 6 });
        next = t + 22;
      }
      for (const f of flying) {
        f.vy += 0.42; f.x += f.vx; f.y += f.vy;
        if (f.y + ch > box.h) { f.y = box.h - ch; f.vy = -f.vy * 0.78; if (Math.abs(f.vy) < 2) f.vy = -6; }
        drawCard(g, codeOf(f.c), f.x, f.y, scale, { four, back });
      }
      for (let i = flying.length - 1; i >= 0; i--) if (flying[i].x < -cw - 4 || flying[i].x > box.w + 4) flying.splice(i, 1);
      if (!queue.length && !flying.length) { if (!ended) { ended = true; stamp(); setTimeout(onDone, 900); } return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => { cancelAnimationFrame(raf); if (!ended) { ended = true; stamp(); setTimeout(onDone, 300); } };
    window.addEventListener("keydown", stop, { once: true });
    cv.addEventListener("pointerdown", stop, { once: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", stop); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="sol-cascade" style={{ width: box.w, height: box.h }} aria-label="Solved. The cards are bouncing off the table. Tap or press a key to stop." />;
}

// A tableau pile: face-down cards (not buttons), face-up cards (buttons), or an empty slot.
function Pile({ id, down, up, L, four, back, fd, fu, maxH, sel, hide, hintIds, onCard, onSlot, onDown, label, emptyLabel }) {
  const total = down.length + up.length;
  let fuE = fu;
  if (up.length > 1) fuE = Math.max(Math.round(10 * L.scale), Math.min(fu, Math.floor((maxH - L.ch - down.length * fd) / (up.length - 1))));
  const height = L.ch + down.length * fd + Math.max(0, up.length - 1) * fuE;
  return (
    <div className={`sol-pile${total ? "" : " empty-slot"}${hintIds?.includes(id) ? " sol-hint" : ""}`} data-pile={id} style={{ height }}>
      {!total && <button type="button" className="slot" data-pad="1" onClick={() => onSlot(id)} aria-label={emptyLabel}>{L.big ? "" : "EMPTY"}</button>}
      {down.map((_, i) => <PixelCard key={`d${i}`} code={null} back={back} scale={L.scale} style={{ top: i * fd }} />)}
      {up.map((c, i) => {
        const n = up.length - i, y = down.length * fd + i * fuE;
        const picked = sel && sel.from === id && i >= up.length - sel.n;
        return (
          <PixelCard key={`u${i}-${c}`} code={codeOf(c)} scale={L.scale} four={four} big={L.big} style={{ top: y }} data-pad="1"
            className={`${hide && hide.from === id && i >= up.length - hide.n ? "sol-hide" : ""}`} selected={picked}
            label={`${cap(nameOf(c))}, ${label}${n > 1 ? `, with ${n - 1} on it` : ""}`}
            onClick={(e) => { if (e.detail === 0) onCard(id, n); }} onPointerDown={(e) => onDown(e, id, n, up.slice(i))} />
        );
      })}
    </div>
  );
}

function Ghost({ drag, L, four, back }) {
  if (!drag) return null;
  const fu = (L.big ? 18 : 13) * L.scale;
  return (
    <div className="sol-ghost" style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: L.cw, height: L.ch + (drag.cards.length - 1) * fu }} aria-hidden="true">
      {drag.cards.map((c, i) => <PixelCard key={i} code={codeOf(c)} scale={L.scale} four={four} big={L.big} back={back} style={{ top: i * fu }} />)}
    </div>
  );
}

function useEscPause(paused, setPaused, disabled) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !paused && !disabled) { e.preventDefault(); setPaused(true); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [paused, setPaused, disabled]);
}
const srOnly = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" };

// ==== KLONDIKE ===================================================================================
export function Klondike({ back = "dept", backHref }) {
  const four = useFour();
  const reduced = useMemo(reducedMotion, []);
  const [g, setG] = useState(() => {
    const s = load("hvi-cards-klondike");
    if (s?.cfg && Array.isArray(s.log)) { const st = K.replay(s.cfg, s.log); if (st && !st.won) return { cfg: st.cfg, log: s.log, st }; }
    const cfg = { seed: newSeed(), draw: 1, scoring: "standard" };
    return { cfg, log: [], st: K.newKlondike(cfg) };
  });
  const { st } = g;
  const [sel, setSel] = useState(null);
  const [say, setSay] = useState("");
  const [err, setErr] = useState("");
  const [hintIds, setHintIds] = useState(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState(st.won ? "menu" : "play");   // play | cascade | menu
  const [finishing, setFinishing] = useState(false);
  const root = useRef(null), board = useRef(null);
  const width = useWidth(root);
  const L = layout(width, 7);
  useEffect(() => { save("hvi-cards-klondike", { cfg: g.cfg, log: g.log }); }, [g.cfg, g.log]);

  const describe = (nx, a) => {
    const e = nx.events.find(x => x.k === "move");
    if (a.t === "draw") return nx.events.some(x => x.k === "recycle") ? "THE WASTE GOES BACK TO THE STOCK." : `TURNED ${UPN(nx.waste[nx.waste.length - 1])}.`;
    let t = e ? `${UPN(e.cards[0])}${e.cards.length > 1 ? ` AND ${e.cards.length - 1} MORE` : ""} TO ${e.to[0] === "f" ? `THE ${SUIT_WORD[+e.to[1]].toUpperCase()} FOUNDATION` : `PILE ${+e.to[1] + 1}`}.` : "";
    const f = nx.events.find(x => x.k === "flip");
    if (f) t += ` TURNED UP ${UPN(f.c)}.`;
    if (nx.won) t += " SOLVED.";
    return t;
  };
  const act = useCallback((a) => {
    const nx = K.apply(g.st, a);
    if (!nx) return false;
    setSay(describe(nx, a)); setErr(""); setSel(null); setHintIds(null);
    setG(x => ({ ...x, log: [...x.log, a], st: nx }));
    if (nx.won) setPhase(reduced ? "menu" : "cascade");
    return true;
  }, [g.st, reduced]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tryMove = (from, n, to) => {
    if (!to || to === from) return false;
    if (to === "stock" || to === "waste") return false;
    return act({ t: "move", from, n, to });
  };
  const tap = (from, n) => {
    if (sel && sel.from !== from) {
      const to = from[0] === "w" ? null : from;
      if (to && tryMove(sel.from, sel.n, to)) return;
    }
    if (sel && sel.from === from && sel.n === n) {
      const to = K.bestTarget(st, from, n);
      if (!to || !tryMove(from, n, to)) { setErr("NOWHERE FOR IT TO GO. THE DEPARTMENT RECOMMENDS ANOTHER CARD."); setSel(null); }
      return;
    }
    const cards = K.takeFrom(st, from, n);
    if (!cards) return;
    setSel({ from, n }); setErr("");
    setSay(`${UPN(cards[0])}${n > 1 ? ` AND ${n - 1} MORE` : ""} PICKED UP. TAP WHERE IT GOES, OR TAP IT AGAIN TO SEND IT HOME.`);
  };
  const slot = (id) => { if (sel) { if (!tryMove(sel.from, sel.n, id)) setErr("IT DOES NOT GO THERE."); } };
  const drop = (from, n, to) => { if (!to || !tryMove(from, n, to)) setSay("IT DOES NOT GO THERE. IT WENT BACK."); };
  const { drag, start } = useDrag(tap, drop);
  const down = (e, from, n, cards) => start(e, from, n, cards);

  const draw = () => { setSel(null); if (!act({ t: "draw" })) setErr(g.cfg.scoring === "vegas" ? "NO MORE PASSES THROUGH THE STOCK. VEGAS RULES." : "THE STOCK IS EMPTY."); };
  const undo = () => {
    if (!g.log.length || st.won) return;
    const log = g.log.slice(0, -1);
    setG(x => ({ ...x, log, st: K.replay(x.cfg, log) })); setSel(null); setSay("UNDONE.");
  };
  const deal = (over = {}) => {
    const cfg = { seed: newSeed(), draw: over.draw ?? g.cfg.draw, scoring: over.scoring ?? g.cfg.scoring };
    setG({ cfg, log: [], st: K.newKlondike(cfg) }); setSel(null); setPhase("play"); setPaused(false); setSay("A NEW DEAL."); setFinishing(false);
  };
  const hint = () => {
    let a = K.nextHome(st);
    if (!a) for (let i = 0; i < 7 && !a; i++) { const t = st.tab[i]; if (!t.up.length || !t.down.length) continue; const to = K.bestTarget(st, `t${i}`, t.up.length); if (to) a = { from: `t${i}`, to }; }
    if (!a && st.waste.length) { const to = K.bestTarget(st, "w", 1); if (to) a = { from: "w", to }; }
    if (!a) { setHintIds(["stock"]); setSay(st.stock.length || K.canRecycle(st) ? "TURN THE STOCK." : "NO MOVES LEFT. THE DEPARTMENT SUGGESTS A NEW DEAL."); return; }
    setHintIds([a.from, a.to]); setSay(`TRY ${a.from === "w" ? "THE WASTE" : a.from[0] === "t" ? `PILE ${+a.from[1] + 1}` : "THAT"} TO ${a.to[0] === "f" ? "ITS FOUNDATION" : `PILE ${+a.to[1] + 1}`}.`);
  };
  // the rest plays itself, one card at a time
  useEffect(() => {
    if (!finishing || st.won) return undefined;
    const a = K.nextHome(st);
    if (!a) { setFinishing(false); return undefined; }
    const t = setTimeout(() => act(a), reduced ? 0 : 70);
    return () => clearTimeout(t);
  }, [finishing, st, act, reduced]);

  usePad(root, { start: () => setPaused(p => !p), back: () => setSel(null), paused: paused || phase !== "play" });
  useEscPause(paused, setPaused, phase !== "play");

  const fd = Math.round(4 * L.scale), fu = Math.round((L.big ? 18 : 13) * L.scale);
  const maxH = Math.max(L.ch * 3, (typeof window !== "undefined" ? window.innerHeight : 800) * 0.62);
  const wasteShow = st.waste.slice(g.cfg.draw === 3 ? -3 : -1);
  const [box, setBox] = useState(null);
  const sources = () => {
    const r = board.current?.getBoundingClientRect();
    return st.found.map((cards, i) => { const el = board.current?.querySelector(`[data-pile="f${i}"]`); const q = el?.getBoundingClientRect(); return { cards, x: q ? q.left - r.left : 0, y: q ? q.top - r.top : 0 }; });
  };
  useEffect(() => { if (phase === "cascade" && board.current) { const r = board.current.getBoundingClientRect(); setBox({ w: r.width, h: Math.max(r.height, Math.round(r.width * 0.6), 360), src: sources() }); } }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cr" ref={root} onKeyDown={(e) => arrowKeys(e, root.current)}>
      <div className="sol-bar">
        <div className="sol-score">SCORE <b>{g.cfg.scoring === "vegas" ? `${st.score < 0 ? "-" : ""}$${Math.abs(st.score)}` : st.score}</b> // MOVES <b>{st.moves}</b>{g.cfg.scoring === "vegas" ? " // VEGAS, IN NOTHING" : ""}</div>
        <div className="cr-row">
          <Chips aria-label="Draw">
            <Chip pressed={g.cfg.draw === 1} onClick={() => deal({ draw: 1 })}>DRAW 1</Chip>
            <Chip pressed={g.cfg.draw === 3} onClick={() => deal({ draw: 3 })}>DRAW 3</Chip>
            <Chip pressed={g.cfg.scoring === "vegas"} onClick={() => deal({ scoring: g.cfg.scoring === "vegas" ? "standard" : "vegas" })}>VEGAS</Chip>
          </Chips>
        </div>
      </div>
      <div ref={board} className="sol cr-felt felt-home" style={{ minHeight: phase === "cascade" && box ? box.h : undefined, "--cols": 7, "--cw": `${L.cw}px`, "--ch": `${L.ch}px`, "--gap": `${L.gap}px` }}>
        <div className="sol-top">
          <div className={`sol-pile${hintIds?.includes("stock") ? " sol-hint" : ""}${st.stock.length ? "" : " empty-slot"}`} data-pile="stock">
            <button type="button" className="slot" data-pad="first" onClick={draw} aria-label={st.stock.length ? `The stock, ${st.stock.length} cards. Turn ${g.cfg.draw}.` : K.canRecycle(st) ? "The stock is empty. Turn the waste back over." : "The stock is empty."}
              style={{ padding: 0 }}>
              {st.stock.length ? <PixelCard code={null} back={back} scale={L.scale} /> : <span aria-hidden="true" style={{ fontSize: 22 * Math.min(1.5, L.scale) }}>{K.canRecycle(st) ? "↻" : "×"}</span>}
            </button>
          </div>
          <div className="sol-pile" data-pile="waste" style={{ width: L.cw }}>
            {wasteShow.map((c, i) => {
              const top = i === wasteShow.length - 1, x = i * Math.round((L.big ? 6 : 9) * L.scale);
              return top
                ? <PixelCard key={c} code={codeOf(c)} scale={L.scale} four={four} big={L.big} style={{ left: x, top: 0 }} data-pad="1" selected={sel?.from === "w"} className={`${drag?.from === "w" ? "sol-hide" : ""}${hintIds?.includes("w") ? " sol-hint" : ""}`}
                    label={`${cap(nameOf(c))}, on the waste`} onClick={(e) => { if (e.detail === 0) tap("w", 1); }} onPointerDown={(e) => down(e, "w", 1, [c])} />
                : <PixelCard key={c} code={codeOf(c)} scale={L.scale} four={four} big={L.big} style={{ left: x, top: 0 }} />;
            })}
          </div>
          <div />
          {st.found.map((f, i) => (
            <div key={i} className={`sol-pile${f.length ? "" : " empty-slot"}${hintIds?.includes(`f${i}`) ? " sol-hint" : ""}`} data-pile={`f${i}`}>
              {!f.length ? <button type="button" className="slot" data-pad="1" onClick={() => slot(`f${i}`)} aria-label={`The ${SUIT_WORD[i]} foundation, empty`}>{L.big ? "" : SUIT_WORD[i].toUpperCase().slice(0, 1)}</button>
                : <PixelCard code={codeOf(f[f.length - 1])} scale={L.scale} four={four} big={L.big} data-pad="1" selected={sel?.from === `f${i}`}
                    label={`${cap(nameOf(f[f.length - 1]))}, top of the ${SUIT_WORD[i]} foundation, ${f.length} cards`} onClick={(e) => { if (e.detail === 0) { if (sel) slot(`f${i}`); else tap(`f${i}`, 1); } }}
                    onPointerDown={(e) => { if (!sel) down(e, `f${i}`, 1, [f[f.length - 1]]); else slot(`f${i}`); }} />}
            </div>
          ))}
        </div>
        <div className="sol-tab">
          {st.tab.map((t, i) => (
            <Pile key={i} id={`t${i}`} down={t.down} up={t.up} L={L} four={four} back={back} fd={fd} fu={fu} maxH={maxH} sel={sel} hide={drag} hintIds={hintIds}
              onCard={tap} onSlot={slot} onDown={down} label={`pile ${i + 1}`} emptyLabel={`Pile ${i + 1}, empty: a king goes here`} />
          ))}
        </div>
        {phase === "cascade" && box && <Cascade box={box} sources={box.src} scale={L.scale} four={four} back={back} onDone={() => setPhase("menu")} />}
      </div>
      <Ghost drag={drag} L={L} four={four} back={back} />
      <div className="ch-bar">
        <Button variant="secondary" data-pad="1" onClick={undo} disabled={!g.log.length || st.won}>UNDO</Button>
        <Button variant="secondary" data-pad="1" onClick={hint} disabled={st.won}>HINT</Button>
        {K.solved(st) && !st.won && <Button variant="primary" data-pad="1" onClick={() => setFinishing(true)}>FINISH IT</Button>}
        <Button variant="secondary" data-pad="1" onClick={() => deal()}>NEW DEAL</Button>
        <Button variant="back" data-pad="1" onClick={() => setPaused(true)}>PAUSE</Button>
      </div>
      {err && <div className="cr-err" role="status">{err}</div>}
      <p className="cr-fine">DRAG A CARD, OR TAP IT AND TAP WHERE IT GOES. TAP IT TWICE TO SEND IT HOME. {g.cfg.draw === 3 ? "DRAW THREE." : "DRAW ONE."} {g.cfg.scoring === "vegas" ? `VEGAS: $52 IN (OF NOTHING), $5 A CARD HOME, ${g.cfg.draw === 3 ? "THREE PASSES" : "ONE PASS"} THROUGH THE STOCK.` : "STANDARD SCORING."} NO CYCLES ARE WON OR LOST.</p>
      <div aria-live="polite" style={srOnly}>{say}</div>
      {phase === "menu" && st.won && (
        <GameMenu kind="end" title="SOLVED." summary={`${g.cfg.scoring === "vegas" ? `$${st.score} (IN NOTHING)` : `SCORE ${st.score}`} IN ${st.moves} MOVES. FILED UNDER LEISURE, PERMITTED.`}
          options={{ again: () => deal(), settings: { label: g.cfg.draw === 1 ? "DEAL DRAW THREE" : "DEAL DRAW ONE", onSelect: () => deal({ draw: g.cfg.draw === 1 ? 3 : 1 }) }, play: true, city: { label: "BACK TO THE CARD ROOM", href: backHref } }} />
      )}
      {paused && !st.won && (
        <GameMenu kind="pause" title="PAUSED." onBack={() => setPaused(false)}
          options={{ resume: () => setPaused(false), restart: { label: "NEW DEAL", onSelect: () => deal() }, controls: <SolLegend spider={false} />, quit: { label: "PUT THE CARDS AWAY", href: backHref } }} />
      )}
    </div>
  );
}

// ==== SPIDER =======================================================================================
export function Spider({ back = "dept", backHref }) {
  const four = useFour();
  const reduced = useMemo(reducedMotion, []);
  const [g, setG] = useState(() => {
    const s = load("hvi-cards-spider");
    if (s?.cfg && Array.isArray(s.log)) { const st = SP.replay(s.cfg, s.log); if (st && !st.won) return { cfg: st.cfg, log: s.log, st }; }
    const cfg = { seed: newSeed(), suits: 1 };
    return { cfg, log: [], st: SP.newSpider(cfg) };
  });
  const { st } = g;
  const [sel, setSel] = useState(null);
  const [say, setSay] = useState("");
  const [err, setErr] = useState("");
  const [hintIds, setHintIds] = useState(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState("play");
  const root = useRef(null), board = useRef(null);
  const width = useWidth(root);
  const L = layout(width, 10);
  useEffect(() => { save("hvi-cards-spider", { cfg: g.cfg, log: g.log }); }, [g.cfg, g.log]);
  const pid = (s) => +String(s).slice(1);

  const act = (a) => {
    const nx = SP.apply(st, a);
    if (!nx) return false;
    const e = nx.events.find(x => x.k === "move"), run = nx.events.find(x => x.k === "run");
    setSay(a.t === "deal" ? "DEALT A CARD TO EVERY PILE." : `${UPN(e.cards[0])}${e.cards.length > 1 ? ` AND ${e.cards.length - 1} MORE` : ""} TO PILE ${e.to + 1}.${run ? ` A RUN OF ${SUIT_WORD[run.suit].toUpperCase()} GOES OFF THE TABLE.` : ""}${nx.won ? " SOLVED." : ""}`);
    setErr(""); setSel(null); setHintIds(null);
    setG(x => ({ ...x, log: [...x.log, a], st: nx }));
    if (nx.won) setPhase(reduced ? "menu" : "cascade");
    return true;
  };
  const tryMove = (from, n, to) => to != null && to !== from && to[0] === "t" && act({ t: "move", from: pid(from), n, to: pid(to) });
  const tap = (from, n) => {
    if (sel && sel.from !== from && tryMove(sel.from, sel.n, from)) return;
    if (sel && sel.from === from && sel.n === n) {
      const j = SP.bestTarget(st, pid(from), n);
      if (j < 0 || !tryMove(from, n, `t${j}`)) { setErr("NOWHERE FOR IT TO GO."); setSel(null); }
      return;
    }
    if (n > SP.runLen(st, pid(from))) { setErr("ONLY A RUN IN ONE SUIT MOVES TOGETHER."); setSel(null); return; }
    setSel({ from, n }); setErr("");
    const up = st.tab[pid(from)].up;
    setSay(`${UPN(up[up.length - n])}${n > 1 ? ` AND ${n - 1} MORE` : ""} PICKED UP. TAP WHERE IT GOES, OR TAP IT AGAIN.`);
  };
  const slot = (id) => { if (sel && !tryMove(sel.from, sel.n, id)) setErr("IT DOES NOT GO THERE."); };
  const drop = (from, n, to) => { if (n > SP.runLen(st, pid(from))) { setErr("ONLY A RUN IN ONE SUIT MOVES TOGETHER."); return; } if (!tryMove(from, n, to)) setSay("IT DOES NOT GO THERE. IT WENT BACK."); };
  const { drag, start } = useDrag(tap, drop);
  const dealIt = () => { setSel(null); if (!act({ t: "deal" })) setErr(st.stock.length ? "EVERY PILE NEEDS A CARD BEFORE YOU DEAL." : "THE STOCK IS EMPTY."); };
  const undo = () => { if (!g.log.length || st.won) return; const log = g.log.slice(0, -1); setG(x => ({ ...x, log, st: SP.replay(x.cfg, log) })); setSel(null); setSay("UNDONE."); };
  const deal = (suits = g.cfg.suits) => { const cfg = { seed: newSeed(), suits }; setG({ cfg, log: [], st: SP.newSpider(cfg) }); setSel(null); setPhase("play"); setPaused(false); setSay("A NEW DEAL."); };
  const hint = () => {
    const a = SP.hint(st);
    if (!a) { setSay("NO MOVES LEFT. THE DEPARTMENT SUGGESTS A NEW DEAL."); return; }
    if (a.t === "deal") { setHintIds(["stock"]); setSay("DEAL FROM THE STOCK."); return; }
    setHintIds([`t${a.from}`, `t${a.to}`]); setSay(`TRY PILE ${a.from + 1} TO PILE ${a.to + 1}.`);
  };
  usePad(root, { start: () => setPaused(p => !p), back: () => setSel(null), paused: paused || phase !== "play" });
  useEscPause(paused, setPaused, phase !== "play");

  const fd = Math.round(3 * L.scale), fu = Math.round((L.big ? 18 : 13) * L.scale);
  const maxH = Math.max(L.ch * 3, (typeof window !== "undefined" ? window.innerHeight : 800) * 0.66);
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (phase !== "cascade" || !board.current) return;
    const r = board.current.getBoundingClientRect();
    const runs = st.done.map(s => [12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(k => (k << 2) | s));
    const el = board.current.querySelector("[data-pile=runs]"), q = el?.getBoundingClientRect();
    setBox({ w: r.width, h: Math.max(r.height, 360), src: runs.slice(0, 4).map(cards => ({ cards, x: q ? q.left - r.left : r.width - L.cw, y: q ? q.top - r.top : 0 })) });
  }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cr" ref={root} onKeyDown={(e) => arrowKeys(e, root.current)}>
      <div className="sol-bar">
        <div className="sol-score">SCORE <b>{st.score}</b> // MOVES <b>{st.moves}</b> // RUNS OFF <b>{st.done.length}/8</b></div>
        <Chips aria-label="Suits">
          {[1, 2, 4].map(n => <Chip key={n} pressed={g.cfg.suits === n} onClick={() => deal(n)}>{n} SUIT{n > 1 ? "S" : ""}</Chip>)}
        </Chips>
      </div>
      <div ref={board} className="sol cr-felt felt-home" style={{ minHeight: phase === "cascade" && box ? box.h : undefined, "--cols": 10, "--cw": `${L.cw}px`, "--ch": `${L.ch}px`, "--gap": `${L.gap}px` }}>
        <div className="sol-top">
          <div className={`sol-pile${hintIds?.includes("stock") ? " sol-hint" : ""}${st.stock.length ? "" : " empty-slot"}`} data-pile="stock" style={{ gridColumn: "1 / span 2" }}>
            <button type="button" className="slot" data-pad="first" onClick={dealIt} aria-label={st.stock.length ? `The stock: ${st.stock.length / 10} deals left. Deal a card to every pile.` : "The stock is empty."} style={{ width: L.cw * 2 }}>
              {Array.from({ length: st.stock.length / 10 }, (_, i) => <PixelCard key={i} code={null} back={back} scale={L.scale} style={{ position: "absolute", left: i * Math.round(5 * L.scale), top: 0 }} />)}
            </button>
          </div>
          <div style={{ gridColumn: "3 / span 4" }} />
          <div className="sol-pile sol-runs" data-pile="runs" style={{ gridColumn: "7 / span 4", width: "auto" }} aria-label={`${st.done.length} runs off the table`}>
            {st.done.map((s, i) => <PixelCard key={i} code={codeOf((11 << 2) | s)} scale={L.scale} four={four} big={L.big} style={{ position: "absolute", left: i * Math.round(8 * L.scale), top: 0 }} label={`A run of ${SUIT_WORD[s]}, off the table`} />)}
          </div>
        </div>
        <div className="sol-tab">
          {st.tab.map((t, i) => (
            <Pile key={i} id={`t${i}`} down={t.down} up={t.up} L={L} four={four} back={back} fd={fd} fu={fu} maxH={maxH} sel={sel} hide={drag} hintIds={hintIds}
              onCard={tap} onSlot={slot} onDown={(e, from, n, cards) => start(e, from, n, cards)} label={`pile ${i + 1}`} emptyLabel={`Pile ${i + 1}, empty`} />
          ))}
        </div>
        {phase === "cascade" && box && <Cascade box={box} sources={box.src} scale={L.scale} four={four} back={back} onDone={() => setPhase("menu")} />}
      </div>
      <Ghost drag={drag} L={L} four={four} back={back} />
      <div className="ch-bar">
        <Button variant="secondary" data-pad="1" onClick={undo} disabled={!g.log.length || st.won}>UNDO</Button>
        <Button variant="secondary" data-pad="1" onClick={hint} disabled={st.won}>HINT</Button>
        <Button variant="secondary" data-pad="1" onClick={() => deal()}>NEW DEAL</Button>
        <Button variant="back" data-pad="1" onClick={() => setPaused(true)}>PAUSE</Button>
      </div>
      {err && <div className="cr-err" role="status">{err}</div>}
      <p className="cr-fine">BUILD DOWN IN ANY SUIT; ONLY A RUN IN ONE SUIT MOVES TOGETHER. KING TO ACE IN ONE SUIT GOES OFF THE TABLE. TAP THE STOCK TO DEAL A CARD TO EVERY PILE. 500 TO START, -1 A MOVE, +100 A RUN. NO CYCLES ARE WON OR LOST.</p>
      <div aria-live="polite" style={srOnly}>{say}</div>
      {phase === "menu" && st.won && (
        <GameMenu kind="end" title="SOLVED." summary={`SCORE ${st.score} IN ${st.moves} MOVES, ${g.cfg.suits} SUIT${g.cfg.suits > 1 ? "S" : ""}. FILED UNDER LEISURE, PERMITTED.`}
          options={{ again: () => deal(), settings: { label: g.cfg.suits < 4 ? `DEAL ${g.cfg.suits * 2} SUITS` : "DEAL 1 SUIT", onSelect: () => deal(g.cfg.suits < 4 ? g.cfg.suits * 2 : 1) }, play: true, city: { label: "BACK TO THE CARD ROOM", href: backHref } }} />
      )}
      {paused && !st.won && (
        <GameMenu kind="pause" title="PAUSED." onBack={() => setPaused(false)}
          options={{ resume: () => setPaused(false), restart: { label: "NEW DEAL", onSelect: () => deal() }, controls: <SolLegend spider />, quit: { label: "PUT THE CARDS AWAY", href: backHref } }} />
      )}
    </div>
  );
}

function SolLegend({ spider }) {
  return (
    <div className="cr-fine" style={{ color: "var(--fg)" }}>
      <p>DRAG A CARD (OR A RUN) AND DROP IT. OR TAP IT, THEN TAP WHERE IT GOES. TAP IT TWICE TO SEND IT TO ITS BEST PLACE.</p>
      <p>KEYS: ARROWS MOVE, ENTER PICKS UP AND PUTS DOWN, ESC PAUSES.</p>
      <p>PAD: D-PAD MOVES, A PICKS UP AND PUTS DOWN, B PUTS IT BACK, START PAUSES.</p>
      <p>{spider ? "SPIDER: TAP THE STOCK TO DEAL. EIGHT RUNS, KING TO ACE IN ONE SUIT, WIN." : "SOLITAIRE: BUILD DOWN IN ALTERNATING COLOURS; ACES UP TO KINGS ON THE FOUNDATIONS; ONLY A KING TO AN EMPTY PILE."}</p>
    </div>
  );
}
