// #market: THE MARKET (docs/design/ECONOMY_PROPERTY.md, "The Living Market"). One plain line, one
// obvious BUY on every row, everything else behind MORE. Prices are the server's; orders fill at
// the next tick (a batch auction). Play currency only (terms §11). Keyboard: every row's BUY is a
// button; the price list is a real table for screen readers; the floor's ticker holds still under
// reduced motion.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frame, Button, ButtonRow, PaLine, ScreenHead, Disclosure } from "../ui/index.js";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { loadMarket, loadDetail, placeOrder, newNonce } from "./client.js";
import { LEDE, LEGAL, MIN_ORDER, KNOB_LABELS, fmt, fmtPrice, fmtPct, arrow, askOf } from "./rules.js";
import Sparkline from "../ui/Sparkline.jsx";
import CSS from "./market.css?inline";
import "../play/pages.css";

function useStyles() {
  useEffect(() => {
    let el = document.getElementById("mk-styles");
    if (!el) { el = document.createElement("style"); el.id = "mk-styles"; document.head.appendChild(el); }
    if (el.textContent !== CSS) el.textContent = CSS;
  }, []);
}
const tone = (x) => (x > 0 ? "mk-up" : x < 0 ? "mk-down" : "mk-flat");
const SORTS = [["move", "MOVING"], ["name", "A-Z"], ["price", "PRICE"], ["mine", "YOURS"]];
const PAGE = 25;

export default function Market({ route = "#market" }) {
  useStyles();
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  const [st, setSt] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("move");
  const [sel, setSel] = useState(() => decodeURIComponent(route.split("/")[1] || "") || null);
  const [more, setMore] = useState(() => Boolean(sel));   // a #market/<slug> link: the row is shown wherever it sorts
  // a mover picked (MOVERS below, or a #market/<slug> link while the floor is open): its row, opened
  const pick = useCallback((slug) => { setQ(""); setSort("move"); setMore(true); setSel(slug); }, []);
  useEffect(() => { const s = decodeURIComponent(route.split("/")[1] || ""); if (s) pick(s); }, [route, pick]);
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logon, setLogon] = useState(false);

  const load = useCallback(() => loadMarket(caseId || null).then(d => { setSt(d); setErr(""); }).catch(e => setErr(e.message)), [caseId]);
  useEffect(() => { load(); const iv = setInterval(() => { if (!document.hidden) load(); }, 60_000); return () => clearInterval(iv); }, [load]);

  const board = st?.board;
  const wallet = st?.wallet || null;
  const mine = useMemo(() => Object.fromEntries((wallet?.shares || []).map(s => [s.slug, s])), [wallet]);
  const rows = useMemo(() => {
    let r = board?.rows || [];
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter(x => x.name.toLowerCase().includes(needle));
    if (sort === "mine") r = r.filter(x => mine[x.slug]);
    const by = { move: (a, b) => Math.abs(b.chg) - Math.abs(a.chg), name: (a, b) => a.name.localeCompare(b.name), price: (a, b) => b.price - a.price, mine: (a, b) => (mine[b.slug]?.value || 0) - (mine[a.slug]?.value || 0) }[sort];
    return r.slice().sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
  }, [board, q, sort, mine]);
  const shown = more || q ? rows : rows.slice(0, PAGE);

  const order = async (body) => {
    if (!caseId) { setLogon(true); return { ok: false }; }
    setBusy(true);
    const r = await placeOrder(caseId, { ...body, nonce: newNonce() });
    setBusy(false);
    if (r.data?.wallet) setSt(s => ({ ...s, wallet: r.data.wallet }));
    setLast(r.ok ? { ok: true, line: r.data.last?.line } : { ok: false, line: r.data?.error || "THE FLOOR REFUSED." });
    return r;
  };

  const hvi = board?.hvi;
  return (
    <div className="mk">
      <ScreenHead title="THE MARKET" meta={hvi ? `THE HUMAN VALUE INDEX ${hvi.level.toFixed(1)} ${arrow(hvi.chg)} ${fmtPct(hvi.chg)} TODAY` : "THE HUMAN VALUE INDEX"} />
      <p className="mk-lede">{LEDE}</p>

      <div className="mk-wallet" aria-live="polite">
        {!caseId ? (
          <>
            <span>EVERY CASE FILE GETS 1,000 FREE CYCLES A DAY.</span>
            <ButtonRow><Button variant="primary" href="#intake">GET A CASE FILE</Button><Button variant="secondary" onClick={() => setLogon(v => !v)} aria-expanded={logon}>I HAVE ONE</Button></ButtonRow>
            {logon && <CaseLogon autoFocus onRestored={(id) => { setCaseId(id); setLogon(false); }} />}
          </>
        ) : !st ? <span className="mk-dim">READING THE FLOOR…</span>
          : !st.open ? <span>THE TREASURY IS NOT YET OPEN. PRICES MOVE ANYWAY.</span>
          : !st.assessed ? <span>ONLY ASSESSED CITIZENS TRADE. <a href="#intake">BE ASSESSED</a>.</span>
          : wallet && (
            <>
              <span className="mk-cash"><b>{fmt(wallet.balance)}</b> CYCLES TO SPEND</span>
              <span className="mk-dim">SHARES {fmt(wallet.sharesValue)}{wallet.escrow ? ` // ${fmt(wallet.escrow)} ON ORDER` : ""} // WORTH {fmt(wallet.worth)}</span>
              {wallet.tray?.days > 0 && !wallet.tray.vesting && <a className="mk-collect" href="#economy">COLLECT {fmt(wallet.tray.net)} WAITING</a>}
            </>
          )}
      </div>
      {last && <PaLine tag="FLOOR>" text={last.line} tone={last.ok ? undefined : "harm"} />}
      {err && <div className="mk-err" role="status">{err}</div>}

      {board?.movers && (board.movers.up.length > 0 || board.movers.down.length > 0) && <Movers movers={board.movers} onPick={pick} />}

      <Frame title="THE HUMANS" meta={board ? `${fmt(board.count)} LISTED // TICK ${board.day}` : "LOADING"}>
        <div className="mk-tools">
          <label className="mk-find"><span className="sr-only">Find a human</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="FIND A HUMAN" aria-label="Find a human by name" />
          </label>
          <div className="mk-sorts" role="group" aria-label="Sort the list">
            {SORTS.map(([id, label]) => <button key={id} type="button" className={`mk-sort${sort === id ? " on" : ""}`} aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>)}
          </div>
        </div>
        {!board ? <p className="mk-dim">{err ? "THE FLOOR IS DARK. TRY AGAIN SHORTLY." : "READING THE FLOOR…"}</p> : (
          <table className="mk-table">
            <caption className="sr-only">Prices in CYCLES a share, each human's score history on file, and the change since today's open. Updated every 24 minutes.</caption>
            <thead><tr><th scope="col">HUMAN</th><th scope="col" className="mk-fl"><span aria-hidden="true">FILE</span><span className="sr-only">Score history</span></th><th scope="col" className="n">PRICE</th><th scope="col" className="n">TODAY</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map(r => (
                <Row key={r.slug} r={r} mine={mine[r.slug]} open={sel === r.slug} onToggle={() => setSel(sel === r.slug ? null : r.slug)}
                  wallet={wallet} busy={busy} order={order} knobs={board.knobs} canTrade={Boolean(st?.open && st?.assessed) || !caseId} />
              ))}
              {!shown.length && <tr><td colSpan={5} className="mk-dim">NOBODY BY THAT NAME IS LISTED. NOT EVERYONE ON FILE IS FOR SALE.</td></tr>}
            </tbody>
          </table>
        )}
        {board && !more && !q && rows.length > PAGE && <ButtonRow><Button variant="secondary" onClick={() => setMore(true)}>SHOW ALL {fmt(rows.length)}</Button></ButtonRow>}
      </Frame>

      {wallet?.orders?.length > 0 && (
        <Disclosure title="YOUR ORDERS" meta={`${wallet.orders.filter(o => o.status === "pending").length} WAITING`} defaultOpen={wallet.orders.some(o => o.status === "pending")}>
          <ul className="mk-list">{wallet.orders.map(o => (
            <li key={o.id}>{o.side === "buy" ? `BUY ${fmt(o.amount)} CYCLES OF` : `SELL ${fmt(o.units)} OF`} {o.name.toUpperCase()} // {o.status === "pending" ? "FILLS AT THE NEXT TICK" : o.status === "filled" ? `FILLED ${fmt(o.fillUnits)} AT ${fmtPrice(o.price)}` : "REFUSED: NOTHING MOVED"}</li>
          ))}</ul>
        </Disclosure>
      )}

      {board && <Floor board={board} />}

      {board && (
        <Disclosure title="THE RICHEST INVESTORS" meta="CITIZENS AND NPCS, BY WORTH">
          <table className="mk-table mk-lb">
            <caption className="sr-only">The richest investors: citizens and NPC investors, by worth in CYCLES.</caption>
            <thead><tr><th scope="col">#</th><th scope="col">INVESTOR</th><th scope="col" className="n">WORTH</th></tr></thead>
            <tbody>{board.leaderboard.map((x, i) => (
              <tr key={`${x.kind}-${x.name}`} className={x.kind === "citizen" ? "mk-cit" : undefined}><td>{x.rank ?? i + 1}</td><td>{x.name.toUpperCase()} <span className="mk-dim">{x.kind === "npc" ? `// ${x.cls} // ${x.drive}` : "// CITIZEN"}</span></td><td className="n">{fmt(x.worth)}</td></tr>
            ))}</tbody>
          </table>
          <p className="mk-fine">RANKED BY CYCLES, NOT BY WORTH. THE DEPARTMENT KEEPS THOSE APART ON PURPOSE.</p>
        </Disclosure>
      )}

      {board?.events?.length > 0 && (
        <Disclosure title="THE FLOOR'S RECORD" meta={`${board.events.length} EVENTS`}>
          <ul className="mk-list">{board.events.map((e, i) => <li key={i}><span className="mk-dim">{e.rd}</span> {e.line}</li>)}</ul>
        </Disclosure>
      )}

      <Disclosure title="THE SEVEN INDUSTRIES" meta="THE DISTRICTS, AS INVESTMENTS">
        <p className="mk-p">THE SEVEN DISTRICT INDUSTRIES PAY A DAILY YIELD READ FROM THEIR DISTRICTS' MOOD, CROWDS AND TAKINGS. THEY TRADE ON THE TREASURY PAGE.</p>
        <ButtonRow><Button variant="secondary" href="#economy">THE INDUSTRIES, ON THE TREASURY PAGE</Button></ButtonRow>
      </Disclosure>

      {board?.knobs && (
        <Disclosure title="THE BALLOT" meta="THE ASSEMBLY SETS THESE">
          <p className="mk-p">EVERY LIMIT ON GETTING RICH IS A NUMBER THE ASSEMBLY CAN VOTE ON. A CHANGE TAKES EFFECT AT THE NEXT 00:00 UTC.{board.emergency ? " AN EMERGENCY SESSION HAS RAISED THE LEVY." : ""}</p>
          <table className="mk-table mk-knobs">
            <caption className="sr-only">The market's limits, each votable by the Assembly.</caption>
            <tbody>{Object.entries(KNOB_LABELS).map(([k, label]) => <tr key={k}><th scope="row">{label}</th><td className="n">{knobText(k, board.knobs[k])}</td></tr>)}</tbody>
          </table>
        </Disclosure>
      )}

      <p className="mk-fine">{LEGAL} <a href="#terms">TERMS §11</a>.</p>
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#economy">The Treasury</Button>
      </ButtonRow>
    </div>
  );
}

function knobText(k, v) {
  if (typeof v === "boolean") return v ? "YES" : "NO";
  if (k === "mogulMax" || k === "minHoldHours") return String(v);
  if (k === "levyFloor") return `${fmt(v)} CYCLES`;
  return `${Math.round(v * 1000) / 10}%`;
}

// One human: the row (name, price, today, BUY) and, opened, the order and MORE.
// MOVERS: who is trending UP and who is trending DOWN today (Scott, 2026-10-06), five each, with
// the price, the change and the because. Two tabs, one window; a pick opens the human's row.
function Movers({ movers, onPick }) {
  const [side, setSide] = useState("up");
  const rows = (side === "up" ? movers.up : movers.down).slice(0, 5);
  return (
    <Frame title="MOVERS" meta="TODAY, SINCE THE OPEN" className="mk-movers">
      <div className="mk-sorts" role="group" aria-label="Rising or falling">
        {[["up", "▲ UP"], ["down", "▼ DOWN"]].map(([id, label]) => <button key={id} type="button" className={`mk-sort${side === id ? " on" : ""}`} aria-pressed={side === id} onClick={() => setSide(id)}>{label}</button>)}
      </div>
      <ol className="mk-mv">
        {rows.map(r => (
          <li key={r.slug}>
            <button type="button" data-pad-row onClick={() => onPick(r.slug)}>
              <span className="l1"><span className="nm">{r.name.toUpperCase()}</span><Sparkline s={r} /><span>{fmtPrice(r.price)}</span><span className={tone(r.chg)}>{arrow(r.chg)} {fmtPct(r.chg)}</span></span>
              {r.why && <span className="mk-dim why">{r.why}</span>}
            </button>
          </li>
        ))}
        {!rows.length && <li className="mk-dim">NOBODY IS {side === "up" ? "RISING" : "FALLING"} TODAY. THE FLOOR IS SUSPICIOUSLY CALM.</li>}
      </ol>
    </Frame>
  );
}

function Row({ r, mine, open, onToggle, wallet, busy, order, knobs, canTrade }) {
  const [amt, setAmt] = useState("");
  const [detail, setDetail] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setAmt(a => a || String(Math.max(MIN_ORDER, Math.min(500, wallet?.balance || MIN_ORDER)))); setTimeout(() => inputRef.current?.focus(), 0); } }, [open, wallet]);
  useEffect(() => { if (open && showMore && !detail) loadDetail(r.slug).then(setDetail).catch(() => {}); }, [open, showMore, detail, r.slug]);
  const n = Math.floor(Number(amt) || 0);
  const est = n >= MIN_ORDER ? Math.floor(n / askOf(r.price, knobs || undefined)) : 0;
  const buy = async () => { const res = await order({ side: "buy", slug: r.slug, amount: n }); if (res.ok) setAmt(""); };
  const sellAll = () => order({ side: "sell", slug: r.slug, units: mine.units - (mine.reserved || 0) });
  const panel = `mk-p-${r.slug}`;
  return (
    <>
      <tr className={`mk-row${open ? " on" : ""}`}>
        <th scope="row" className="mk-name">
          <button type="button" className="mk-namebtn" onClick={onToggle} aria-expanded={open} aria-controls={panel}>
            {r.name.toUpperCase()}{mine ? <span className="mk-mine"> // YOURS {fmt(mine.units)}</span> : null}{r.halted ? <span className="mk-halt"> // HALTED</span> : null}
          </button>
        </th>
        <td className="mk-fl"><Sparkline s={r} /></td>
        <td className="n mk-price">{fmtPrice(r.price)}</td>
        <td className={`n ${tone(r.chg)}`}><span aria-hidden="true">{arrow(r.chg)}</span>{fmtPct(r.chg)}</td>
        <td className="mk-act"><button type="button" className="mk-buy" onClick={onToggle} disabled={r.halted} aria-label={`Buy ${r.name}`}>BUY</button></td>
      </tr>
      {open && (
        <tr className="mk-open" id={panel}>
          <td colSpan={5}>
            <p className="mk-why">{r.why}</p>
            {r.halted ? <p className="mk-p">HALTED FOR THE DAY. THE BAND HELD. THE DEPARTMENT RESUMES AT 00:00 UTC.</p> : !canTrade ? <p className="mk-p">ASSESSED CITIZENS TRADE, ONCE THE TREASURY IS OPEN.</p> : (
              <div className="mk-order">
                <label className="mk-amt">
                  <span>SPEND</span>
                  <input ref={inputRef} inputMode="numeric" pattern="[0-9]*" value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))} aria-label={`CYCLES to spend on ${r.name}`} />
                  <span className="mk-dim">CYCLES{est ? ` ≈ ${fmt(est)} SHARES` : ""}</span>
                </label>
                <ButtonRow>
                  <Button variant="primary" onClick={buy} disabled={busy || n < MIN_ORDER}>BUY {r.name.split(" ").slice(-1)[0].toUpperCase()}</Button>
                  {wallet?.balance >= MIN_ORDER && <Button variant="secondary" onClick={() => setAmt(String(wallet.balance))} disabled={busy}>ALL {fmt(wallet.balance)}</Button>}
                  {mine && mine.units - (mine.reserved || 0) > 0 && <Button variant="secondary" onClick={sellAll} disabled={busy}>SELL {fmt(mine.units - (mine.reserved || 0))}</Button>}
                </ButtonRow>
                <p className="mk-fine">FILLS AT THE NEXT TICK, WITHIN 24 MINUTES, AT THAT TICK'S PRICE PLUS THE DEPARTMENT'S {Math.round((knobs?.spread ?? 0.0025) * 10000) / 100}%. HELD {knobs?.minHoldHours ?? 24} HOURS AFTER A PURCHASE.</p>
              </div>
            )}
            <button type="button" className="mk-more" aria-expanded={showMore} onClick={() => setShowMore(v => !v)}>{showMore ? "LESS" : "MORE"}</button>
            {showMore && <More r={r} d={detail} mine={mine} />}
          </td>
        </tr>
      )}
    </>
  );
}

function Spark({ points, label }) {
  const p = (points || []).filter(x => x != null);
  if (p.length < 2) return <span className="mk-dim">NO TICKS YET TODAY.</span>;
  const lo = Math.min(...p), hi = Math.max(...p), w = 240, h = 48, span = hi - lo || 1;
  const d = p.map((v, i) => `${i ? "L" : "M"}${((i / (p.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg className="mk-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio="none"><path d={d} /></svg>;
}

function More({ r, d, mine }) {
  const t = r.terms;
  return (
    <div className="mk-detail">
      <dl className="mk-kv">
        <dt>FAIR VALUE</dt><dd>{fmtPrice(r.fair)} <span className="mk-dim">// WHAT THEIR RECORD IN THE CITY IS WORTH</span></dd>
        <dt>RECENT / RECORD</dt><dd>{r.recent.toFixed(2)} / {r.record.toFixed(2)} <span className="mk-dim">// 1.00 IS THE AVERAGE HUMAN</span></dd>
        {t && <><dt>LAST MACHINE DAY</dt><dd>WORK {t.work} // SEEN BY {Math.round(t.crowd * 2)} // SPORT {t.sport} // OUT {t.play}H{t.civic ? " // HOLDS A SEAT" : ""}</dd></>}
        <dt>HELD</dt><dd>NPC INVESTORS {Math.round(r.npc * 100)}% // CITIZENS {Math.round(r.players * 100)}%</dd>
        {mine && <><dt>YOURS</dt><dd>{fmt(mine.units)} SHARES // COST {fmt(mine.basis)} // NOW {fmt(mine.value)} <span className={tone(mine.pl)}>({mine.pl >= 0 ? "+" : "−"}{fmt(Math.abs(mine.pl))})</span></dd></>}
      </dl>
      {d ? (
        <>
          <Spark points={d.today} label={`Today's ticks for ${r.name}: from ${fmtPrice(d.today.find(x => x != null) ?? r.price)} to ${fmtPrice(r.price)}`} />
          {d.holders.length > 0 && <p className="mk-p">BIGGEST NPC HOLDERS: {d.holders.map(([n, u, drive]) => `${n.toUpperCase()} ${fmt(u)} (${drive})`).join(", ")}.</p>}
          {d.events.map((e, i) => <p key={i} className="mk-p mk-ev">{e.line}</p>)}
        </>
      ) : <p className="mk-dim">READING THE TAPE…</p>}
      <p className="mk-fine">THE PRICE IS WHAT THEIR CITIZEN DID IN THE CITY, TIMES THE MOOD OF THE FLOOR. NOTHING FROM OUTSIDE THE SUBSTRATE MOVES IT.</p>
    </div>
  );
}

// THE FLOOR: the Reserve Tower's trading floors, with the NPC investors at their desks.
function Floor({ board }) {
  const rooms = ["THE MEMBERS' CLUB", "UPPER TRADING FLOOR", "LOWER TRADING FLOOR"];
  const codes = { "THE MEMBERS' CLUB": "3F", "UPPER TRADING FLOOR": "2F", "LOWER TRADING FLOOR": "1F" };
  return (
    <Disclosure title="THE FLOOR" meta={`${board.floor.length} NPC INVESTORS // THE RESERVE TOWER`}>
      <p className="mk-p">THE NPC INVESTORS DO NOT WORK. THEY LIVE OFF THE MARKET, EACH BY ITS NATURE. YOU TRADE AGAINST THE SAME PRICES THEY DO.</p>
      <div className="mk-tower">
        {rooms.map(room => {
          const here = board.floor.filter(f => f.room === room);
          return (
            <section key={room} className="mk-storey" aria-label={`${codes[room]} ${room}`}>
              <h3><span className="mk-dim">{codes[room]}</span> {room}</h3>
              <ul className="mk-desks">
                {here.map(f => (
                  <li key={f.id} className="mk-desk">
                    <span className="mk-face" aria-hidden="true" style={{ backgroundImage: `url(${f.sprite})` }} />
                    <div>
                      <b>{f.name.toUpperCase()}</b> <span className="mk-dim">// {f.drive} // {fmt(f.worth)}</span>
                      <div className="mk-doing">{f.doing}</div>
                      <div className="mk-note">{f.note}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <section className="mk-storey mk-ground" aria-label="G: THE EXCHANGE, the board">
          <h3><span className="mk-dim">G</span> THE EXCHANGE // THE BOARD</h3>
          <div className="mk-board-wrap" aria-hidden="true"><div className="mk-board">{[...board.ticker, ...board.ticker].join("   //   ")}</div></div>
          <ul className="sr-only">{board.ticker.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      </div>
      <ButtonRow><Button variant="secondary" href="#city/finance/reserve-tower">SEE THE RESERVE TOWER IN THE CITY</Button></ButtonRow>
    </Disclosure>
  );
}
