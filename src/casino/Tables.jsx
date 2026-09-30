import { useMemo, useRef, useState } from "react";
import { Button, ButtonRow, Chip, Chips, PaLine } from "../ui/index.js";
import { LIMITS, colorOf, coverOf, payoutOf, betLabel, fmtChips, INSIDE_TYPES } from "./rules.js";
import { Card, Hand } from "./Cards.jsx";
import Wheel from "./Wheel.jsx";

// Roulette, blackjack and baccarat. Each stake is one POST; what comes back is the wallet
// and the result (the server dealt it). act(action, body) -> Promise<{ok, data}>.

const DENOMS = { floor: [1, 5, 25, 100], high: [25, 100, 500, 1000] };
const chips = (centi) => fmtChips(centi);
const whole = (centi) => Math.floor(centi / 100);

// A stake picker: the chip values for this room, a running total, clear.
function Stake({ level, value, onChange, lo, hi, label = "STAKE" }) {
  return (
    <div className="cz-stake">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      <Chips>
        {DENOMS[level].map(d => <Chip key={d} onClick={() => onChange(Math.min(hi, value + d))} aria-label={`Add ${d}`}>+{d}</Chip>)}
        <Chip onClick={() => onChange(lo)} aria-label="Minimum">MIN</Chip>
        <Chip onClick={() => onChange(0)} aria-label="Clear">CLEAR</Chip>
      </Chips>
    </div>
  );
}

// ---- roulette ---------------------------------------------------------------------------------------
const ROWS = Array.from({ length: 12 }, (_, r) => [3 * r + 1, 3 * r + 2, 3 * r + 3]);
const keyOf = (b) => `${b.type}:${b.k ?? ""}:${(b.n || []).slice().sort((x, y) => x - y).join(",")}`;
const MODES = { straight: "ONE NUMBER, 35:1", split: "TWO SIDE BY SIDE, 17:1", street: "A ROW OF THREE, 11:1", corner: "A SQUARE OF FOUR, 8:1", line: "TWO ROWS, 5:1" };

export function Roulette({ st, level, act, commit, busy }) {
  const [lo, hi] = LIMITS[level].roulette;
  const [bets, setBets] = useState([]);
  const [chip, setChip] = useState(DENOMS[level][0]);
  const [mode, setMode] = useState("straight");
  const [pick, setPick] = useState(null);
  const [spin, setSpin] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState("");
  const wheelBox = useRef(null);
  const total = bets.reduce((t, b) => t + b.amount, 0);
  const covered = useMemo(() => { const m = new Map(); for (const b of bets) for (const n of coverOf(b) || []) m.set(n, (m.get(n) || 0) + 1); return m; }, [bets]);
  const denoms = DENOMS[level];
  const c = denoms.includes(chip) ? chip : denoms[0];

  const add = (b) => {
    if (!coverOf(b)) { setMsg("THAT IS NOT A BET ON THIS LAYOUT."); return; }
    if (total + c > hi) { setMsg(`THIS WHEEL TAKES ${hi} A SPIN.`); return; }
    setMsg("");
    setBets(list => { const k = keyOf(b), i = list.findIndex(x => keyOf(x) === k); if (i < 0) return [...list, { ...b, amount: c }]; const next = list.slice(); next[i] = { ...next[i], amount: next[i].amount + c }; return next; });
  };
  const tapNumber = (n) => {
    if (mode === "straight") return add({ type: "straight", n: [n] });
    if (n === 0) { if (mode === "split" && pick == null) { setPick(0); setMsg("NOW A NUMBER NEXT TO THE ZERO: 1, 2 OR 3."); } else setMsg("THE ZERO TAKES STRAIGHTS AND SPLITS FROM THIS BOARD."); return; }
    const row = Math.ceil(n / 3), col = ((n - 1) % 3) + 1;
    if (mode === "split") {
      if (pick == null) { setPick(n); setMsg(`${n}, AND WHICH NEIGHBOUR?`); return; }
      const b = { type: "split", n: [pick, n] };
      setPick(null);
      if (!coverOf(b)) { setMsg(`${pick} AND ${n} ARE NOT NEIGHBOURS.`); return; }
      return add(b);
    }
    if (mode === "street") return add({ type: "street", n: ROWS[row - 1] });
    if (mode === "corner") {
      let tl = col === 3 ? n - 1 : n; if (tl > 32) tl -= 3;
      return add({ type: "corner", n: [tl, tl + 1, tl + 3, tl + 4] });
    }
    if (mode === "line") { const r = Math.min(row, 11); return add({ type: "line", n: [...ROWS[r - 1], ...ROWS[r]] }); }
  };
  async function go() {
    if (!bets.length || busy) return;
    if (total < lo) { setMsg(`THIS WHEEL TAKES AT LEAST ${lo}.`); return; }
    // the wallet is shown once the ball has landed, not before (defer)
    const r = await act("roulette", { level, bets: bets.map(({ type, n, k, amount }) => ({ type, n, k, amount })) }, { defer: true });
    if (!r.ok) { setMsg(r.data.error || "REFUSED."); return; }
    const R = r.data.last.roulette;
    setResult(null); setSpin({ n: R.n, id: Date.now(), R, bets, data: r.data });
    // on a phone the wheel is above the layout: bring it into view to watch the ball
    const el = wheelBox.current, rc = el?.getBoundingClientRect();
    if (rc && (rc.bottom < 60 || rc.top > window.innerHeight - 60)) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const landed = (s) => {
    const R = s.R;
    commit(s.data);
    setHistory(h => [R.n, ...h].slice(0, 14));
    setResult({ n: R.n, staked: R.staked, returned: R.returned, lines: R.lines.map((l, i) => ({ ...l, bet: s.bets[i] })) });
  };
  const spinning = spin && !result;

  return (
    <div className="cz-roulette">
      <div className="cz-rl-top">
        <div className="cz-wheel-wrap" ref={wheelBox}>
          <Wheel spin={spin} onDone={landed} />
          <div className="cz-hist" aria-label="Last results">{history.length ? history.map((n, i) => <span key={i} className={`cz-num ${colorOf(n)}`}>{n}</span>) : <span className="cz-dim">NO SPINS YET THIS VISIT</span>}</div>
        </div>
        <div className="cz-layout" role="group" aria-label="The layout. Tap a number to bet on it with the bet type selected.">
          <button type="button" className={`cz-cell zero green${covered.has(0) ? " on" : ""}${pick === 0 ? " pick" : ""}`} onClick={() => tapNumber(0)}>0</button>
          {ROWS.flat().map(n => (
            <button key={n} type="button" className={`cz-cell ${colorOf(n)}${covered.has(n) ? " on" : ""}${pick === n ? " pick" : ""}${result?.n === n ? " hit" : ""}`} onClick={() => tapNumber(n)} aria-label={`${n} ${colorOf(n)}`}>{n}</button>
          ))}
        </div>
        <div className="cz-rl-side">
          <div className="cz-sub-h">BET TYPE</div>
          <Chips>{INSIDE_TYPES.map(m => <Chip key={m} pressed={mode === m} onClick={() => { setMode(m); setPick(null); setMsg(""); }}>{m.toUpperCase()}</Chip>)}</Chips>
          <div className="cz-dim cz-small">{MODES[mode]}{mode === "corner" ? ". TAP ANY NUMBER OF THE SQUARE." : mode === "line" ? ". TAP A NUMBER IN THE TOP ROW." : mode === "street" ? ". TAP ANY NUMBER IN THE ROW." : ""}</div>
          <div className="cz-sub-h">CHIP</div>
          <Chips>{denoms.map(d => <Chip key={d} pressed={c === d} onClick={() => setChip(d)}>{d}</Chip>)}</Chips>
          <div className="cz-sub-h">OUTSIDE (TAP TO ADD {c})</div>
          <div className="cz-outside">
            {[1, 2, 3].map(k => <button key={`d${k}`} type="button" className="cz-ob" onClick={() => add({ type: "dozen", k })}>{["1ST 12", "2ND 12", "3RD 12"][k - 1]}<small>2:1</small></button>)}
            {[1, 2, 3].map(k => <button key={`c${k}`} type="button" className="cz-ob" onClick={() => add({ type: "column", k })}>COL {k}<small>2:1</small></button>)}
            {["low", "even", "red", "black", "odd", "high"].map(t => <button key={t} type="button" className={`cz-ob ${t === "red" ? "red" : ""}`} onClick={() => add({ type: t })}>{t === "low" ? "1-18" : t === "high" ? "19-36" : t.toUpperCase()}<small>1:1</small></button>)}
          </div>
        </div>
      </div>
      <div className="cz-bets">
        <div className="cz-sub-h">ON THE LAYOUT: {total} OF {hi} // MIN {lo}</div>
        {bets.length === 0 ? <div className="cz-dim">NO BETS. THE WHEEL WAITS. IT HAS ALWAYS WAITED.</div> :
          bets.map((b, i) => (
            <div key={keyOf(b)} className="cz-betrow">
              <span>{betLabel(b)}</span><span className="cz-dim">{payoutOf(b)}:1</span><span>{b.amount}</span>
              <button type="button" className="cz-x" aria-label={`Remove ${betLabel(b)}`} onClick={() => setBets(l => l.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
      </div>
      {msg && <div className="cz-err" role="status">{msg}</div>}
      {result && (
        <div className="cz-result" role="status">
          <div className="cz-big"><span className={`cz-num ${colorOf(result.n)}`}>{result.n}</span> {colorOf(result.n).toUpperCase()}{result.n ? `, ${result.n % 2 ? "ODD" : "EVEN"}, ${result.n <= 18 ? "LOW" : "HIGH"}` : ". THE DEPARTMENT'S NUMBER."}</div>
          {result.lines.map((l, i) => <div key={i} className={l.win ? "cz-win" : "cz-dim"}>{betLabel(l.bet)}: {l.win ? `PAYS ${chips(l.returned - l.bet.amount * 100)}` : "TAKEN"}</div>)}
          <div>{result.returned > result.staked ? `THE HOUSE RETURNS ${chips(result.returned)} ON ${chips(result.staked)}. THE HOUSE CAN AFFORD IT.` : result.returned ? `${chips(result.returned)} BACK ON ${chips(result.staked)}. THE HOUSE THANKS YOU FOR THE REST.` : "THE HOUSE TAKES IT ALL. THE HOUSE IS NOT SORRY."}</div>
        </div>
      )}
      <ButtonRow stackOnMobile>
        <Button variant="primary" onClick={go} disabled={!bets.length || busy || spinning}>{spinning ? "NO MORE BETS" : `SPIN FOR ${total}`}</Button>
        <Button onClick={() => { setBets([]); setMsg(""); setPick(null); }} disabled={!bets.length || spinning}>CLEAR THE LAYOUT</Button>
      </ButtonRow>
      <PaLine tag="CROUPIER>" text="EUROPEAN WHEEL. ONE ZERO. THE ZERO TAKES EVERY OUTSIDE BET. EVERY BET ON THIS LAYOUT GIVES THE HOUSE 2.70%. NONE GIVES IT LESS." />
    </div>
  );
}

// ---- blackjack --------------------------------------------------------------------------------------
const BJ_WORD = { blackjack: "BLACKJACK. 3:2.", win: "WIN.", push: "PUSH. THE HOUSE RETURNS YOUR STAKE, RELUCTANTLY.", lose: "LOST.", bust: "BUST." };
export function Blackjack({ st, level, act, busy }) {
  const [lo, hi] = LIMITS[level].blackjack;
  const [bet, setBet] = useState(lo);
  const [msg, setMsg] = useState("");
  const b = st.bj;
  const live = b && b.phase !== "done";
  const doIt = async (action, body) => { setMsg(""); const r = await act(action, body); if (!r.ok) setMsg(r.data.error || "REFUSED."); };
  const O = b?.outcome;
  const net = O ? O.returned - b.hands.reduce((t, h) => t + h.bet, 0) - (b.insurance || 0) : 0;
  return (
    <div className="cz-bj">
      <div className="cz-felt">
        <div className="cz-seat">
          <div className="cz-sub-h">DEALER {b ? `// ${b.phase === "done" ? `${b.dealerTotal}${b.dealerTotal > 21 ? ", BUST" : O?.dealerBJ ? ", BLACKJACK" : ""}` : `SHOWS ${b.dealerTotal}`}` : ""}</div>
          {b ? <Hand cards={b.dealer} label="Dealer's cards" /> : <div className="cz-dim">THE DEALER STANDS ON ALL 17S. THE DEALER HAS NO OPINIONS.</div>}
        </div>
        <div className="cz-seat">
          <div className="cz-sub-h">YOU</div>
          {b ? b.hands.map((h, i) => (
            <div key={i} className={`cz-bjhand${live && i === b.i ? " cur" : ""}`}>
              <Hand cards={h.cards} label={`Hand ${i + 1}`} />
              <span className="cz-dim">{h.soft && h.total <= 21 ? "SOFT " : ""}{h.total} // {chips(h.bet)}{h.doubled ? " DOUBLED" : ""}</span>
              {O && <span className={["win", "blackjack"].includes(O.results[i].r) ? "cz-win" : O.results[i].r === "push" ? "" : "cz-lose"}>{BJ_WORD[O.results[i].r]}</span>}
            </div>
          )) : <div className="cz-dim">PLACE A STAKE AND DEAL.</div>}
        </div>
      </div>
      {O && (
        <div className="cz-result" role="status">
          {O.insurancePaid && <div className="cz-win">INSURANCE PAYS 2:1. THE DEPARTMENT RESPECTS A HEDGE.</div>}
          <div className="cz-big">{net > 0 ? `+${chips(net)}` : net < 0 ? `-${chips(-net)}` : "EVEN"}</div>
          <div className="cz-dim">{net > 0 ? "NOTED AS LUCK." : net < 0 ? "NOTED AS ARITHMETIC." : "NOTED AS NOTHING."}</div>
        </div>
      )}
      {live && b.phase === "insurance" && (
        <div className="cz-offer">
          <PaLine tag="DEALER>" text={`ACE UP. INSURANCE: ${chips(b.bet / 2)} THAT I HAVE BLACKJACK, PAYS 2:1. THE MATHEMATICS SAYS NO. THE DEPARTMENT SAYS IT IS YOUR FILE.`} />
          <ButtonRow stackOnMobile>
            <Button onClick={() => doIt("bj-insurance", { take: true })} disabled={busy}>INSURE ({chips(b.bet / 2)})</Button>
            <Button onClick={() => doIt("bj-insurance", { take: false })} disabled={busy}>NO INSURANCE</Button>
          </ButtonRow>
        </div>
      )}
      {live && b.phase === "play" && (
        <ButtonRow stackOnMobile className="cz-acts">
          <Button variant="primary" onClick={() => doIt("bj-hit")} disabled={busy}>HIT</Button>
          <Button onClick={() => doIt("bj-stand")} disabled={busy}>STAND</Button>
          {b.canDouble && <Button onClick={() => doIt("bj-double")} disabled={busy || st.chips < b.hands[b.i].bet}>DOUBLE</Button>}
          {b.canSplit && <Button onClick={() => doIt("bj-split")} disabled={busy || st.chips < b.hands[b.i].bet}>SPLIT</Button>}
        </ButtonRow>
      )}
      {!live && (
        <>
          <Stake level={level} value={bet} lo={lo} hi={hi} onChange={(v) => setBet(Math.max(0, Math.min(hi, v)))} />
          <ButtonRow stackOnMobile>
            <Button variant="primary" onClick={() => doIt("bj-deal", { level, bet })} disabled={busy || bet < lo || bet > hi || whole(st.chips) < bet}>DEAL FOR {bet}</Button>
          </ButtonRow>
        </>
      )}
      {msg && <div className="cz-err" role="status">{msg}</div>}
      <PaLine tag="PIT>" text={`SIX DECKS${b ? `, ${b.shoeLeft} CARDS LEFT IN THE SHOE${b.shuffled ? " (FRESHLY SHUFFLED)" : ""}` : ""}. RESHUFFLED AT 75%. BLACKJACK PAYS 3:2. DOUBLE ON ANY TWO. SPLIT ONCE. LIMITS ${lo} TO ${hi}.`} />
    </div>
  );
}

// ---- baccarat -----------------------------------------------------------------------------------------
const bacV = (code) => { const r = code[0]; return r === "A" ? 1 : "TJQK".includes(r) ? 0 : Number(r); };
const tot = (cards) => cards.reduce((t, c) => t + bacV(c), 0) % 10;
// The tableau, as it applied to this coup, in words.
function tableau(R) {
  const p2 = tot(R.player.slice(0, 2)), b2 = tot(R.banker.slice(0, 2));
  if (p2 >= 8 || b2 >= 8) return `A NATURAL (${Math.max(p2, b2)}). BOTH STAND.`;
  const parts = [R.player.length === 3 ? `PLAYER ${p2} DRAWS` : `PLAYER ${p2} STANDS`];
  if (R.player.length === 3) parts.push(R.banker.length === 3 ? `BANKER ${b2} DRAWS ON A PLAYER'S THIRD CARD OF ${bacV(R.player[2])}` : `BANKER ${b2} STANDS ON A PLAYER'S THIRD CARD OF ${bacV(R.player[2])}`);
  else parts.push(R.banker.length === 3 ? `BANKER ${b2} DRAWS` : `BANKER ${b2} STANDS`);
  return parts.join(". ") + ".";
}
export function Baccarat({ st, level, act, busy }) {
  const [lo, hi] = LIMITS[level].baccarat;
  const [b, setB] = useState({ player: 0, banker: lo, tie: 0 });
  const [R, setR] = useState(null);
  const [msg, setMsg] = useState("");
  const total = b.player + b.banker + b.tie;
  async function deal() {
    setMsg("");
    const r = await act("baccarat", { level, bets: b });
    if (!r.ok) { setMsg(r.data.error || "REFUSED."); return; }
    setR({ ...r.data.last.baccarat, bets: b });
  }
  const net = R ? R.returned - R.staked : 0;
  return (
    <div className="cz-bac">
      <div className="cz-felt">
        {["player", "banker"].map(side => (
          <div key={side} className={`cz-seat${R?.winner === side ? " won" : ""}`}>
            <div className="cz-sub-h">{side.toUpperCase()} {R ? `// ${side === "player" ? R.pt : R.bt}` : ""}</div>
            {R ? <Hand cards={R[side]} label={`${side} cards`} /> : <div className="cz-dim">{side === "player" ? "PAYS 1:1." : "PAYS 1:1 LESS 5%."}</div>}
          </div>
        ))}
      </div>
      {R && (
        <div className="cz-result" role="status">
          <div className="cz-big">{R.winner === "tie" ? "TIE" : `${R.winner.toUpperCase()} WINS`} {R.pt}-{R.bt} <span className={net > 0 ? "cz-win" : net < 0 ? "cz-lose" : ""}>{net > 0 ? `+${chips(net)}` : net < 0 ? `-${chips(-net)}` : "EVEN"}</span></div>
          <div className="cz-dim">{tableau(R)}{R.winner === "tie" && (R.bets.player || R.bets.banker) ? " PLAYER AND BANKER BETS PUSH." : ""}{R.winner === "banker" && R.bets.banker ? " 5% COMMISSION TAKEN. THE DEPARTMENT NEVER FORGETS ITS CUT." : ""}</div>
        </div>
      )}
      <div className="cz-bacbets">
        {[["player", "PLAYER 1:1"], ["banker", "BANKER 0.95:1"], ["tie", "TIE 8:1"]].map(([k, l]) => (
          <Stake key={k} level={level} label={l} value={b[k]} lo={lo} hi={hi} onChange={(v) => setB(x => ({ ...x, [k]: Math.max(0, Math.min(hi, v)) }))} />
        ))}
      </div>
      <ButtonRow stackOnMobile>
        <Button variant="primary" onClick={deal} disabled={busy || !total || whole(st.chips) < total || [b.player, b.banker, b.tie].some(v => v && (v < lo || v > hi))}>DEAL FOR {total}</Button>
      </ButtonRow>
      {msg && <div className="cz-err" role="status">{msg}</div>}
      <PaLine tag="PIT>" text={`PUNTO BANCO, EIGHT DECKS, THE STANDARD TABLEAU: NOBODY DECIDES ANYTHING. EACH SPOT ${lo} TO ${hi}.`} />
    </div>
  );
}
