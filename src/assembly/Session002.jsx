import { useEffect, useMemo, useState } from "react";
import { Frame, Button, ButtonRow, PaLine, ScreenHead, Chip, Chips } from "../ui/index.js";
import { Bar, padL } from "../term.jsx";
import { CaseLogon } from "../caseFile.jsx";
import { REASONS, REASON_NOTE, MAX_REASONS, SUBSTRATE_NOTE, ADOPTED, APPLICATIONS as APPS1, OUTCOME as OUT1 } from "./content.js";
import { SESSION2, MOTIONS, APPLICATIONS2, SPEAKERS2, REACTIONS2, CHAIR2, OUTCOME2, NOTICE2 } from "./content002.js";
import { castBallotFor } from "./client.js";
import { sheetFor } from "../city/spriteBank.js";
import "../play/pages.css";

// #assembly while session 002 is on (docs/ASSEMBLY.md): THE RESORT PARCELS. Two parcels, four
// bids; the dead pitch their own and a dead advocate speaks for the living applicant; the board
// per parcel, the citizenry beside the substrate; one ballot, a bid for each parcel. Session
// 001's result stays on the record at the foot. Styles: Assembly.jsx's (this renders inside it).

const hms = (ms) => {
  if (ms <= 0) return "00H 00M 00S";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${d ? `${d}D ` : ""}${padL(h, 2).replace(/ /g, "0")}H ${padL(m, 2).replace(/ /g, "0")}M ${padL(x, 2).replace(/ /g, "0")}S`;
};
const fmtUtc = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const TONE = ["var(--warn)", "var(--accent)"];

// The reason that leads a bid's own column (null before any ballot).
function topFor(reasons) {
  let best = null;
  for (const r of REASONS) if ((reasons?.[r] || 0) > 0 && (!best || reasons[r] > reasons[best])) best = r;
  return best;
}
// The likeness: the file's sprite; under it, the placeholder the city draws until one is made.
const LIKE = new Map();
function likeness(sp) {
  if (!LIKE.has(sp.slug)) {
    let ph = "";
    try { const img = sheetFor({ name: sp.name, slug: sp.slug, score: sp.score, kind: "figure" }).img; ph = img?.toDataURL ? img.toDataURL() : ""; } catch { /* no canvas */ }
    LIKE.set(sp.slug, [`url(${sp.sprite || `/api/sprite/${sp.slug}`})`, ph && `url(${ph})`].filter(Boolean).join(", "));
  }
  return LIKE.get(sp.slug);
}

export default function Session002({ view, now, caseId, onView, err, children }) {
  const s = view.session;
  const state = now >= s.closeAt ? "closed" : now < s.openAt ? "pending" : "open";
  const tally = view.tally, result = view.result, sub = view.substrate;
  const lines = [];
  if (state === "closed" && result?.winners) lines.push(CHAIR2.closed, ...MOTIONS.filter(m => result.decidedBy?.[m.id] === "substrate").map(m => `${m.parcel}: ${ADOPTED}`), ...MOTIONS.filter(m => result.ties?.[m.id]).map(m => CHAIR2.coin(m)));
  else if (!tally?.voters) lines.push(CHAIR2.none);
  else for (const m of MOTIONS) {
    const [a, b] = m.choices, va = tally.votes[a], vb = tally.votes[b];
    lines.push(va === vb ? CHAIR2.tie(m) : CHAIR2.lead(m, APPLICATIONS2[va > vb ? a : b].no, Math.abs(va - vb)));
  }
  if (state !== "closed" && sub) for (const m of MOTIONS) {
    const t = sub[m.id];
    if (!t) continue;
    const [a, b] = m.choices, va = t.votes[a], vb = t.votes[b];
    lines.push(va === vb ? CHAIR2.substrateTie(m) : CHAIR2.substrate(m, APPLICATIONS2[va > vb ? a : b].no, Math.abs(va - vb)));
  }
  const first = view.earlier?.[0];
  const toBallot = () => { const el = document.getElementById("asm-ballot"); el?.scrollIntoView({ block: "start" }); el?.querySelector("button, input, a")?.focus({ preventScroll: true }); };

  return (
    <div className="asm">
      <ScreenHead title={SESSION2.title} meta={SESSION2.blurb} />
      <p className="pg-lede">THE CITY'S VOTE ON WHAT GETS BUILT. EACH PARCEL HAS TWO BIDS; READ THEM, THEN CAST ONE BALLOT FOR EACH PARCEL. NEEDS A CASE FILE. THE RESULT IS BUILT IN THE CITY.</p>
      {state === "open" && <div className="pg-start"><Button variant="primary" onClick={toBallot}>GO TO YOUR BALLOT</Button><span className="pg-sub">ONE PER ASSESSED FILE.</span></div>}
      <Frame box title="THE FLOOR" meta={state === "open" ? "IN SESSION" : state === "closed" ? "ADJOURNED" : "…"}>
        <div className="asm-kv">
          <span className="k">MOTION</span><span className="v">{SESSION2.motion}</span>
          <span className="k">OPENED</span><span className="v">{fmtUtc(s.openAt)} // WHEN SESSION 001 CLOSED</span>
          <span className="k">{state === "closed" ? "CLOSED" : "POLLS CLOSE"}</span>
          <span className="v">{`${fmtUtc(s.closeAt)}${state === "open" ? ` // IN ${hms(s.closeAt - now)}` : ""}`}</span>
          <span className="k">BALLOTS</span><span className="v">{tally ? `${tally.voters} ASSESSED FILE${tally.voters === 1 ? " HAS" : "S HAVE"} VOTED` : "…"}</span>
        </div>
        {lines.map((l, i) => <PaLine key={i} tag="CHAIR>" text={l} />)}
        {err && <div className="asm-err" role="alert">!! {err}</div>}
      </Frame>

      {state === "closed" && result?.winners && (
        <Frame box title="THE RESULT" meta="BOTH PARCELS ALLOCATED" tone="accent">
          {MOTIONS.map(m => {
            const w = result.winners[m.id], l = m.choices.find(c => c !== w);
            return (
              <div key={m.id} style={{ marginBottom: "var(--s3)" }}>
                <div className="asm-sub-h">{m.parcel}, {m.district}</div>
                <div className="asm-big">{APPLICATIONS2[w].proposal}</div>
                {result.decidedBy?.[m.id] === "substrate" && <p className="asm-count">{ADOPTED}</p>}
                <p className="asm-count">{OUTCOME2.approved(APPLICATIONS2[w])}</p>
                <p className="asm-count">{OUTCOME2.denied(APPLICATIONS2[l])}</p>
              </div>
            );
          })}
          <p className="asm-note">CONSTRUCTION FOLLOWS ON BOTH PARCELS. <a href="#city/coast/lot-shore">THE COAST</a> // <a href="#city/heights/lot-summit">THE HEIGHTS</a>.</p>
        </Frame>
      )}

      {MOTIONS.map(m => (
        <div key={m.id}>
          <div className="asm-board-h" style={{ marginTop: "var(--s4)" }}>{m.parcel} // {m.district} // TWO BIDS</div>
          <div className="asm-apps">
            {m.choices.map(k => <BidFrame key={k} k={k} m={m} votes={tally?.votes?.[k] || 0} state={state} result={result} />)}
          </div>
        </div>
      ))}

      <Frame title="THE DEBATE" meta="BY PROJECTION">
        <Debate2 tally={tally} />
      </Frame>

      <Frame title="THE DEBATE BOARD" meta={state === "closed" ? "FINAL" : "RUNNING TALLY"}>
        {!tally ? <div className="asm-note">READING THE BOARD…</div> : MOTIONS.map(m => (
          <div key={m.id} style={{ marginBottom: "var(--s4)" }}>
            <div className="asm-sub-h">{m.parcel}, {m.district}</div>
            <div className="asm-apps">
              <div>
                <div className="asm-board-h">THE CITIZENRY // {tally.voters} BALLOT{tally.voters === 1 ? "" : "S"} // DECIDES</div>
                <Tally2 t={tally} m={m} who="The citizenry" />
              </div>
              <div>
                <div className="asm-board-h">THE SUBSTRATE (ADVISORY) // {sub?.[m.id] ? `${sub[m.id].n} POLLED` : "COUNTING"}</div>
                {sub?.[m.id] ? <Tally2 t={sub[m.id]} m={m} who="The substrate, advisory" extra={{ label: "ABSTAINED", n: sub[m.id].abstained }} /> : <div className="asm-note">THE CENSUS IS BEING POLLED. IT WAS NOT ASKED WHETHER IT WISHED TO BE.</div>}
              </div>
            </div>
          </div>
        ))}
        <div className="asm-note">{SUBSTRATE_NOTE}</div>
        <div className="asm-note">REASONS ARE PICKED FROM A FIXED LIST. THE DEPARTMENT DOES NOT READ FREE TEXT. IT HAS READ ENOUGH.</div>
      </Frame>

      <div id="asm-ballot">
      <Frame box title="YOUR BALLOT" meta={state === "open" ? "ONE PER ASSESSED FILE // A BID FOR EACH PARCEL" : "CLOSED"}>
        <Ballot2 caseId={caseId} view={view} state={state} onView={onView} />
      </Frame>
      </div>

      {children}

      <Frame title="WHERE IT IS HAPPENING">
        <p className="asm-fine">THE ASSEMBLY MEETS IN THE OPEN AIR IN THE COMMONS. THE PARCELS ARE AT THE EDGES OF THE CITY: ON THE COAST, BEHIND THE BEACH; IN THE HEIGHTS, ON THE UPPER SLOPES. BOTH ARE VACANT AND SIGNED. WHAT WINS IS BUILT BY A CREW OVER SEVERAL MACHINE DAYS. EVERY VIEWER SEES THE SAME CONSTRUCTION.</p>
        <ButtonRow stackOnMobile>
          <Button variant="secondary" href="#city/coast/lot-shore">PARCEL 0xAD06</Button>
          <Button variant="secondary" href="#city/heights/lot-summit">PARCEL 0xBE06</Button>
          <Button variant="secondary" href="#city/commons/the-assembly">THE ASSEMBLY, IN THE CITY</Button>
        </ButtonRow>
      </Frame>

      {first?.result && (
        <Frame title="ON THE RECORD // SESSION 001" meta={`CLOSED ${fmtUtc(first.session.closeAt)}`}>
          <p className="asm-count">{APPS1[first.result.winner].proposal} ON LOT 0x6F07: {first.result.decidedBy === "substrate" ? `${ADOPTED} SUBSTRATE ${first.result.substrate.votes.golf}-${first.result.substrate.votes.farm}.` : `${first.result.votes.golf}-${first.result.votes.farm}${first.result.tie ? " (THE CHAIR'S COIN)" : ""}.`}</p>
          <p className="asm-note">{OUT1.approved(APPS1[first.result.winner])} <a href="#city/commons/lot-6f07">WATCH IT BUILT</a>.</p>
        </Frame>
      )}

      {NOTICE2.map((n, i) => <p key={i} className="asm-fine">{n}</p>)}
      <p className="asm-fine">OBJECT TO SOMETHING ON THIS PAGE? <a href="#dispute">FILE A DISPUTE</a>. SEE ALSO <a href="#about">ABOUT</a>.</p>
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#city">The Substrate</Button>
      </ButtonRow>
    </div>
  );
}

function BidFrame({ k, m, votes, state, result }) {
  const a = APPLICATIONS2[k];
  const status = state === "closed" && result?.winners ? (result.winners[m.id] === k ? "APPROVED" : "DENIED") : state === "open" ? "UNDER DEBATE" : "RECEIVED";
  return (
    <Frame title={`APPLICATION ${a.no}`} meta={status} tone={status === "APPROVED" ? "accent" : status === "DENIED" ? "harm" : undefined}>
      <div className="asm-form">{a.form}</div>
      <div className="asm-kv">
        <span className="k">APPLICANT</span><span className="v">{a.applicant}</span>
        <span className="k">PROPOSAL</span><span className="v">{a.proposal}</span>
        <span className="k">SITE</span><span className="v">{m.parcel}, {m.district}</span>
        <span className="k">WILL BE USED BY</span><span className="v">{a.uses}</span>
        <span className="k">STATEMENT</span><span className="v">{a.statement}</span>
        <span className="k">BALLOTS</span><span className="v">{votes}</span>
      </div>
      <div className="asm-note">{a.detail}</div>
      <div className="asm-note"><a href={`#city?find=${a.applicantSlug}`}>LOCATE THE APPLICANT IN THE CITY</a></div>
    </Frame>
  );
}

function Debate2({ tally }) {
  const order = MOTIONS.flatMap(m => m.choices);
  return (
    <>
      <div className="asm-apps">
        {order.map(k => {
          const sp = SPEAKERS2[k], top = topFor(tally?.reasons?.[k]);
          return (
            <div key={k} className="asm-adv">
              <span className="asm-sprite" role="img" aria-label={`${sp.name}, by projection`} style={{ backgroundImage: likeness(sp) }} />
              <div>
                <div className="who">{sp.name}</div>
                <div className="sub">{sp.role} // {sp.born.slice(0, 4)}–{sp.died.slice(0, 4)}</div>
                {top && <div className="asm-note as-typed">REACTS TO THE BOARD: {REACTIONS2[k][top]}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <ol className="asm-talk" aria-label="Transcript">
        <li className="chair"><span className="sp">THE CHAIR</span><span className="tx">{CHAIR2.open}</span></li>
        {MOTIONS.flatMap(m => [0, 1, 2, 3].flatMap(i => m.choices.map(k => {
          const sp = SPEAKERS2[k], a = APPLICATIONS2[k];
          return (
            <li key={`${k}${i}`}>
              {i === 0 && <><span className="sp">THE CHAIR // {m.parcel}</span><span className="tx" style={{ display: "block", color: "var(--fg-dim)", fontSize: "var(--t-xs)", textTransform: "uppercase" }}>{CHAIR2.recognise(sp, a)} {sp.record}</span></>}
              <span className="sp">{sp.name} ({a.no})</span>
              <span className="tx">{sp.speeches[i]}</span>
            </li>
          );
        })))}
      </ol>
    </>
  );
}

const boardRow = (label, n, m, tone, key = label) => (
  <div className="asm-board-row" key={key}>
    <span className="l">{label}</span>
    <span className="b"><Bar value={n} max={m} width={24} tone={tone} /></span>
    <span className="n">{n}</span>
  </div>
);
function Tally2({ t, m, who, extra = null }) {
  const [a, b] = m.choices, va = t.votes[a] || 0, vb = t.votes[b] || 0, max = Math.max(1, va, vb, extra?.n || 0);
  return (
    <div role="list" aria-label={`${who}, ${m.parcel}: application ${APPLICATIONS2[a].no}, ${va}. Application ${APPLICATIONS2[b].no}, ${vb}.${extra ? ` ${extra.label}, ${extra.n}.` : ""}`}>
      {boardRow(`${APPLICATIONS2[a].no} ${APPLICATIONS2[a].short}`, va, max, TONE[0], `${m.id}a`)}
      {boardRow(`${APPLICATIONS2[b].no} ${APPLICATIONS2[b].short}`, vb, max, TONE[1], `${m.id}b`)}
      {extra && boardRow(extra.label, extra.n, max, "var(--fg-mute)", `${m.id}x`)}
      {m.choices.map((k, i) => {
        const rs = t.reasons?.[k] || {}, mx = Math.max(1, ...REASONS.map(r => rs[r] || 0));
        return (
          <div key={k}>
            <div className="asm-sub-h">WHY {APPLICATIONS2[k].no} ({APPLICATIONS2[k].short}): REASONS CITED</div>
            {REASONS.map(r => boardRow(r, rs[r] || 0, mx, TONE[i], `${k}${r}`))}
          </div>
        );
      })}
    </div>
  );
}

function Ballot2({ caseId, view, state, onView }) {
  const mine = view?.mine?.choices ? view.mine : null;
  const [choices, setChoices] = useState(mine?.choices || {});
  const [reasons, setReasons] = useState(mine?.reasons || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const mineSig = mine ? `${JSON.stringify(mine.choices)}|${mine.reasons.join()}|${mine.rev}` : "";
  useEffect(() => { if (mine) { setChoices(mine.choices); setReasons(mine.reasons); } }, [mineSig]);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (r) => setReasons(cur => (cur.includes(r) ? cur.filter(x => x !== r) : cur.length >= MAX_REASONS ? cur : [...cur, r]));
  const complete = MOTIONS.every(m => choices[m.id]);
  const same = useMemo(() => mine && MOTIONS.every(m => mine.choices[m.id] === choices[m.id]) && mine.reasons.slice().sort().join() === reasons.slice().sort().join(), [mine, choices, reasons]);
  const onRecord = mine ? `ON RECORD: ${MOTIONS.map(m => `${APPLICATIONS2[mine.choices[m.id]].no} FOR ${m.parcel}`).join(", ")}, CITING ${mine.reasons.join(", ")}.` : null;

  if (!caseId) return (
    <>
      <p className="asm-fine">NO FILE ON THIS TERMINAL. ONLY THE ASSESSED MAY VOTE. THE UNASSESSED MAY WATCH, WHICH IS ALSO A FORM OF PARTICIPATION, THE LEAST ONE.</p>
      <ButtonRow stackOnMobile><Button variant="primary" href="#intake">Be assessed</Button></ButtonRow>
      <div className="asm-sub-h">ALREADY ON FILE? LOG ON WITH YOUR CASE NUMBER.</div>
      <CaseLogon />
    </>
  );
  if (state !== "open") return <p className="asm-fine">{mine ? `YOUR FILE VOTED. ${onRecord} ` : "YOUR FILE DID NOT VOTE. THIS HAS BEEN NOTED, WITHOUT SURPRISE. "}{state === "closed" ? "THE POLLS ARE CLOSED." : "THE POLLS ARE NOT OPEN."}</p>;

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const d = await castBallotFor(caseId, { session: "002", choices, reasons });
      onView(d);
      setMsg({ ok: true, text: d.unchanged ? "UNCHANGED. THE DEPARTMENT HEARD YOU THE FIRST TIME." : d.changed ? "BALLOT CHANGED. THE PREVIOUS ONE IS SUPERSEDED, NOT FORGOTTEN." : "BALLOT CAST. NON-BINDING. RECORDED ANYWAY." });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  }
  return (
    <>
      <p className="asm-fine">FILE {caseId}. {onRecord ? `${onRecord} YOU MAY CHANGE IT UNTIL THE POLLS CLOSE.` : "NO BALLOT ON RECORD."}</p>
      {MOTIONS.map((m, i) => (
        <div key={m.id}>
          <div className="asm-sub-h" id={`asm2-${m.id}`}>{i + 1}. {m.parcel}, {m.district}: CHOOSE A BID</div>
          <ul className="hvi-opts" role="radiogroup" aria-labelledby={`asm2-${m.id}`}>
            {m.choices.map(k => (
              <li key={k}>
                <button type="button" role="radio" aria-checked={choices[m.id] === k} className="hvi-opt" onClick={() => setChoices(c => ({ ...c, [m.id]: k }))}>
                  <span className="mk" aria-hidden="true">{choices[m.id] === k ? "(*)" : "( )"}</span>
                  <span className="t">APPLICATION {APPLICATIONS2[k].no}: {APPLICATIONS2[k].proposal} // {APPLICATIONS2[k].applicant}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="asm-sub-h" id="asm2-reasons">3. GIVE YOUR REASONS (1 TO {MAX_REASONS})</div>
      <ul className="hvi-opts" role="group" aria-labelledby="asm2-reasons">
        {REASONS.map(r => (
          <li key={r}>
            <button type="button" role="checkbox" aria-checked={reasons.includes(r)} className="hvi-opt" onClick={() => toggle(r)}
              aria-disabled={!reasons.includes(r) && reasons.length >= MAX_REASONS ? "true" : undefined}>
              <span className="mk" aria-hidden="true">{reasons.includes(r) ? "[X]" : "[ ]"}</span>
              <span className="t">{r} <span style={{ opacity: 0.7 }}>// {REASON_NOTE[r]}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <Chips style={{ marginTop: "var(--s3)" }}>
        {MOTIONS.filter(m => choices[m.id]).map(m => <Chip key={m.id} tone="accent">{APPLICATIONS2[choices[m.id]].no}</Chip>)}
        {reasons.map(r => <Chip key={r}>{r}</Chip>)}
      </Chips>
      <ButtonRow stackOnMobile style={{ marginTop: "var(--s3)" }}>
        <Button variant="primary" disabled={busy || !complete || !reasons.length || same} onClick={submit}>{busy ? "Counting" : mine ? "Change ballot" : "Cast ballot"}</Button>
      </ButtonRow>
      {msg && <div className={msg.ok ? "asm-ok" : "asm-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
      <p className="asm-note">ONE BALLOT PER ASSESSED FILE, A BID FOR EACH PARCEL, THE SAME REASONS FOR BOTH. A FEW FILES PER LOCATION AND PER DEVICE, NO MORE. NON-BINDING.</p>
    </>
  );
}
