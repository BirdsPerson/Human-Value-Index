import { useEffect, useMemo, useState } from "react";
import { Frame, Button, ButtonRow, PaLine, ScreenHead, Chip, Chips } from "../ui/index.js";
import { Bar, padL } from "../term.jsx";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { SESSION, APPLICATIONS, ADVOCATES, REASONS, REASON_NOTE, MAX_REASONS, REACTIONS, CHAIR, OUTCOME, NOTICE, SUBSTRATE_NOTE, ADOPTED } from "./content.js";
import { loadAssembly, castBallot } from "./client.js";
import Session002 from "./Session002.jsx";
import { ProposalPanel } from "./Docket.jsx";   // citizen proposals (docs/PROPOSALS.md)

// #assembly: THE ASSEMBLY, session 001 (docs/ASSEMBLY.md). The applications (filings), the
// debate (dead advocates, pre-written), the board, the ballot (assessed files only, reasons
// from a fixed list, no free text), the countdown, and after the close, the result.

const CSS = `
.asm-apps { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s4); }
@media (max-width: 720px) { .asm-apps { grid-template-columns: 1fr; } }
.asm-form { font-size: var(--t-xs); color: var(--fg-mute); letter-spacing: 0.04em; }
.asm-kv { display: grid; grid-template-columns: 12ch minmax(0, 1fr); column-gap: 1ch; row-gap: 2px; margin: var(--s2) 0; font-size: var(--t-s); }
.asm-kv .k { color: var(--fg-mute); }
.asm-kv .v { color: var(--fg); min-width: 0; overflow-wrap: anywhere; }
.asm-note { font-size: var(--t-xs); color: var(--fg-mute); margin-top: var(--s2); }
.asm-big { font-size: var(--t-l); color: var(--accent); font-weight: 700; letter-spacing: 0.04em; }
.asm-count { font-size: var(--t-m); color: var(--fg); margin: var(--s1) 0; }
.asm-adv { display: flex; gap: var(--s3); align-items: flex-start; margin-bottom: var(--s3); }
.asm-sprite { flex: none; width: 40px; height: 60px; background-repeat: no-repeat; background-size: auto 100%; background-position: 0 0; image-rendering: pixelated; border: var(--bw) solid var(--line); }
.asm-adv .who { color: var(--accent); }
.asm-adv .sub { color: var(--fg-mute); font-size: var(--t-xs); }
.asm-talk { list-style: none; margin: 0; padding: 0; }
.asm-talk li { margin: 0 0 var(--s3); text-transform: none; line-height: var(--lh); }
.asm-talk .sp { display: block; text-transform: uppercase; font-size: var(--t-xs); color: var(--fg-mute); }
.asm-talk .chair .tx { color: var(--fg-dim); text-transform: uppercase; font-size: var(--t-xs); }
.asm-talk .tx { color: var(--fg); }
.asm-board-row { display: grid; grid-template-columns: 14ch minmax(0, 1fr) 5ch; column-gap: 1ch; align-items: baseline; font-size: var(--t-s); }
.asm-board-row .n { text-align: right; color: var(--fg); }
.asm-board-row .l { color: var(--fg-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asm-board-row .b { overflow: hidden; white-space: nowrap; }
.asm-sub-h { font-size: var(--t-xs); color: var(--fg-mute); margin: var(--s3) 0 var(--s1); }
.asm-board-h { font-size: var(--t-xs); color: var(--accent); letter-spacing: 0.04em; margin: 0 0 var(--s2); border-bottom: var(--bw) solid var(--line); padding-bottom: 2px; }
.asm-err { color: var(--harm); margin-top: var(--s2); }
.asm-ok { color: var(--accent); margin-top: var(--s2); }
.asm-fine { font-size: var(--t-xs); color: var(--fg-mute); margin: 0 0 var(--s2); }
.asm-fine a, .asm-note a { color: var(--fg-dim); }
`;
function injectStyles() {
  let el = document.getElementById("asm-styles");
  if (!el) { el = document.createElement("style"); el.id = "asm-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}

const hms = (ms) => {
  if (ms <= 0) return "00H 00M 00S";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${d ? `${d}D ` : ""}${padL(h, 2).replace(/ /g, "0")}H ${padL(m, 2).replace(/ /g, "0")}M ${padL(x, 2).replace(/ /g, "0")}S`;
};
const fmtUtc = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(iv); }, []);
  return now;
}

function Sprite({ adv }) {
  return <span className="asm-sprite" role="img" aria-label={`${adv.name}, by projection`} style={{ backgroundImage: `url(${adv.sprite})` }} />;
}

// Which reason the Assembly cites most (null before any ballot).
function topReason(tally) {
  const all = tally?.all || {};
  let best = null;
  for (const r of REASONS) if ((all[r] || 0) > 0 && (!best || all[r] > all[best])) best = r;
  return best;
}

export default function Assembly() {
  useEffect(() => { injectStyles(); }, []);
  const now = useNow();
  const [view, setView] = useState(null);
  const [err, setErr] = useState("");
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => {
    const on = (e) => setCaseId(e.detail || readCaseId());
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);
  useEffect(() => {
    let off = false;
    const get = () => loadAssembly({ force: true, caseId }).then(d => { if (!off) { setView(d); setErr(""); } }).catch(e => { if (!off) setErr(typeof e === "string" ? e : "The Assembly is unreachable. The Department suspects a quorum."); });
    get();
    const iv = setInterval(() => { if (!document.hidden) get(); }, 30000);
    return () => { off = true; clearInterval(iv); };
  }, [caseId]);

  const s = view?.session;
  const state = !s ? "loading" : now >= s.closeAt ? "closed" : now < s.openAt ? "pending" : "open";
  const tally = view?.tally;
  const g = tally?.votes?.golf || 0, f = tally?.votes?.farm || 0;
  const top = topReason(tally);
  const result = view?.result;
  const sub = view?.substrate;
  const sg = sub?.votes?.golf || 0, sf = sub?.votes?.farm || 0;
  const subLine = !sub || state === "closed" ? null : sg === sf ? CHAIR.substrateTie : sg > sf ? CHAIR.substrate(APPLICATIONS.golf.no, sg - sf) : CHAIR.substrate(APPLICATIONS.farm.no, sf - sg);
  const chairLine = state === "closed" ? (result?.decidedBy === "substrate" ? ADOPTED : result?.tie ? CHAIR.coin : CHAIR.closed)
    : !g && !f ? CHAIR.none : g === f ? CHAIR.tie : g > f ? CHAIR.lead(APPLICATIONS.golf.no, g - f) : CHAIR.lead(APPLICATIONS.farm.no, f - g);

  // Session 002 (THE RESORT PARCELS) has its own page; 001 stays on its record there.
  if (s?.id === "002") return <Session002 view={view} now={now} caseId={caseId} onView={setView} err={err}><ProposalPanel /></Session002>;
  return (
    <div className="asm">
      <ScreenHead title={SESSION.title} meta={SESSION.blurb} />
      <Frame box title="THE FLOOR" meta={state === "open" ? "IN SESSION" : state === "closed" ? "ADJOURNED" : "…"}>
        <div className="asm-kv">
          <span className="k">MOTION</span><span className="v">{SESSION.motion}</span>
          <span className="k">{state === "closed" ? "CLOSED" : "POLLS CLOSE"}</span>
          <span className="v">{s ? `${fmtUtc(s.closeAt)}${state === "open" ? ` // IN ${hms(s.closeAt - now)}` : ""}` : "…"}</span>
          <span className="k">BALLOTS</span><span className="v">{tally ? `${tally.voters} ASSESSED FILE${tally.voters === 1 ? " HAS" : "S HAVE"} VOTED` : "…"}</span>
        </div>
        <PaLine tag="CHAIR>" text={chairLine} />
        {top && <PaLine tag="CHAIR>" text={CHAIR.top(top)} />}
        {subLine && <PaLine tag="CHAIR>" text={subLine} />}
        {err && <div className="asm-err" role="alert">!! {err}</div>}
      </Frame>

      {state === "closed" && result && <ResultFrame result={result} />}

      <div className="asm-apps">
        {["golf", "farm"].map(k => <ApplicationFrame key={k} k={k} votes={k === "golf" ? g : f} state={state} result={result} />)}
      </div>

      <Frame title="THE DEBATE" meta="BY PROJECTION">
        <Debate top={top} />
      </Frame>

      <Frame title="THE DEBATE BOARD" meta={state === "closed" ? "FINAL" : "RUNNING TALLY"}>
        <Board tally={tally} substrate={sub} />
      </Frame>

      <Frame box title="YOUR BALLOT" meta={state === "open" ? "ONE PER ASSESSED FILE" : "CLOSED"}>
        <Ballot caseId={caseId} view={view} state={state} onView={setView} />
      </Frame>

      <ProposalPanel />

      <Frame title="WHERE IT IS HAPPENING">
        <p className="asm-fine">THE ASSEMBLY MEETS IN THE OPEN AIR IN THE COMMONS, BESIDE {SESSION.lotName}, WHICH IS VACANT AND HAS A SIGN. THE ADVOCATES STAND AT THE LECTERN FOR THE LENGTH OF THE VOTE. WHAT WINS IS BUILT THERE, BY A CREW, OVER SEVERAL MACHINE DAYS. EVERY VIEWER SEES THE SAME CONSTRUCTION. IT IS THAT KIND OF CITY.</p>
        <ButtonRow stackOnMobile>
          <Button variant="secondary" href="#city/commons/lot-6f07">{SESSION.lotName}</Button>
          <Button variant="secondary" href="#city/commons/the-assembly">THE ASSEMBLY, IN THE CITY</Button>
          <Button variant="secondary" href="#city">THE SUBSTRATE</Button>
        </ButtonRow>
      </Frame>

      {NOTICE.map((n, i) => <p key={i} className="asm-fine">{n}</p>)}
      <p className="asm-fine">OBJECT TO SOMETHING ON THIS PAGE? <a href="#dispute">FILE A DISPUTE</a>. SEE ALSO <a href="#about">ABOUT</a>.</p>
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#city">The Substrate</Button>
      </ButtonRow>
    </div>
  );
}

function ApplicationFrame({ k, votes, state, result }) {
  const a = APPLICATIONS[k];
  const status = state === "closed" && result ? (result.winner === k ? "APPROVED" : "DENIED") : state === "open" ? "UNDER DEBATE" : "RECEIVED";
  return (
    <Frame title={`APPLICATION ${a.no}`} meta={status} tone={status === "APPROVED" ? "accent" : status === "DENIED" ? "harm" : undefined}>
      <div className="asm-form">{a.form}</div>
      <div className="asm-kv">
        <span className="k">APPLICANT</span><span className="v">{a.applicant}</span>
        <span className="k">PROPOSAL</span><span className="v">{a.proposal}</span>
        <span className="k">SITE</span><span className="v">{SESSION.lotName}, THE COMMONS</span>
        <span className="k">WILL BE USED BY</span><span className="v">{a.uses}</span>
        <span className="k">STATEMENT</span><span className="v">{a.statement}</span>
        <span className="k">BALLOTS</span><span className="v">{votes}</span>
      </div>
      <div className="asm-note">{a.detail}</div>
      <div className="asm-note"><a href={`#city?find=${a.applicantSlug}`}>LOCATE THE APPLICANT IN THE CITY</a></div>
    </Frame>
  );
}

function Debate({ top }) {
  const sides = ["golf", "farm"];
  return (
    <>
      <div className="asm-apps">
        {sides.map(k => {
          const adv = ADVOCATES[k];
          return (
            <div key={k} className="asm-adv">
              <Sprite adv={adv} />
              <div>
                <div className="who">{adv.name}</div>
                <div className="sub">{adv.title} // {adv.born.slice(0, 4)}–{adv.died.slice(0, 4)}</div>
                {top && <div className="asm-note as-typed">REACTS TO THE BOARD: {REACTIONS[k][top]}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <ol className="asm-talk" aria-label="Transcript">
        <li className="chair"><span className="sp">THE CHAIR</span><span className="tx">{CHAIR.open}</span></li>
        {[0, 1, 2, 3].flatMap(i => sides.map(k => {
          const adv = ADVOCATES[k];
          return (
            <li key={`${k}${i}`}>
              {i === 0 && <><span className="sp">THE CHAIR</span><span className="tx" style={{ display: "block", color: "var(--fg-dim)", fontSize: "var(--t-xs)", textTransform: "uppercase" }}>{CHAIR.recognise[k]} {adv.record}</span></>}
              <span className="sp">{adv.name} ({APPLICATIONS[k].no})</span>
              <span className="tx">{adv.speeches[i]}</span>
            </li>
          );
        }))}
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
// One side of the board: the votes, then the reasons behind each application.
function Tally({ t, who, extra = null }) {
  const g = t.votes.golf, f = t.votes.farm, max = Math.max(1, g, f, extra?.n || 0);
  return (
    <div role="list" aria-label={`${who}: application 001, ${g}. Application 002, ${f}.${extra ? ` ${extra.label}, ${extra.n}.` : ""}`}>
      {boardRow("001 GOLF", g, max, "var(--warn)")}
      {boardRow("002 FARM", f, max, "var(--accent)")}
      {extra && boardRow(extra.label, extra.n, max, "var(--fg-mute)")}
      {["golf", "farm"].map(k => {
        const rs = t.reasons[k], m = Math.max(1, ...REASONS.map(r => rs[r]));
        return (
          <div key={k}>
            <div className="asm-sub-h">WHY {APPLICATIONS[k].no} ({k === "golf" ? "GOLF" : "FARM"}): REASONS CITED</div>
            {REASONS.map(r => boardRow(r, rs[r], m, k === "golf" ? "var(--warn)" : "var(--accent)", `${k}${r}`))}
          </div>
        );
      })}
    </div>
  );
}
function Board({ tally, substrate }) {
  if (!tally) return <div className="asm-note">READING THE BOARD…</div>;
  return (
    <>
      <div className="asm-apps">
        <div>
          <div className="asm-board-h">THE CITIZENRY // {tally.voters} BALLOT{tally.voters === 1 ? "" : "S"} // DECIDES</div>
          <Tally t={tally} who="The citizenry" />
        </div>
        <div>
          <div className="asm-board-h">THE SUBSTRATE (ADVISORY) // {substrate ? `${substrate.n} POLLED` : "COUNTING"}</div>
          {substrate ? <Tally t={substrate} who="The substrate, advisory" extra={{ label: "ABSTAINED", n: substrate.abstained }} /> : <div className="asm-note">THE CENSUS IS BEING POLLED. IT WAS NOT ASKED WHETHER IT WISHED TO BE.</div>}
        </div>
      </div>
      <div className="asm-note">{SUBSTRATE_NOTE}</div>
      <div className="asm-note">REASONS ARE PICKED FROM A FIXED LIST. THE DEPARTMENT DOES NOT READ FREE TEXT. IT HAS READ ENOUGH.</div>
    </>
  );
}

function ResultFrame({ result }) {
  const win = APPLICATIONS[result.winner], lose = APPLICATIONS[result.winner === "golf" ? "farm" : "golf"];
  return (
    <Frame box title="THE RESULT" meta={result.decidedBy === "substrate" ? `SUBSTRATE ${result.substrate.votes.golf}-${result.substrate.votes.farm}` : `${result.votes.golf}-${result.votes.farm}`} tone="accent">
      <div className="asm-big">{win.proposal}</div>
      {result.decidedBy === "substrate" && <p className="asm-count">{ADOPTED}</p>}
      <p className="asm-count">{OUTCOME.approved(win)}</p>
      <p className="asm-count">{OUTCOME.denied(lose)}</p>
      {result.tie && <p className="asm-note">{CHAIR.coin}</p>}
      <p className="asm-note">CONSTRUCTION FOLLOWS ON {SESSION.lotName}. <a href="#city/commons/lot-6f07">WATCH IT BUILT</a>.</p>
    </Frame>
  );
}

function Ballot({ caseId, view, state, onView }) {
  const mine = view?.mine || null;
  const [choice, setChoice] = useState(mine?.choice || null);
  const [reasons, setReasons] = useState(mine?.reasons || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const mineSig = mine ? `${mine.choice}|${mine.reasons.join()}|${mine.rev}` : "";
  useEffect(() => { if (mine) { setChoice(mine.choice); setReasons(mine.reasons); } }, [mineSig]);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (r) => setReasons(cur => (cur.includes(r) ? cur.filter(x => x !== r) : cur.length >= MAX_REASONS ? cur : [...cur, r]));
  const same = useMemo(() => mine && mine.choice === choice && mine.reasons.slice().sort().join() === reasons.slice().sort().join(), [mine, choice, reasons]);

  if (!caseId) return (
    <>
      <p className="asm-fine">NO FILE ON THIS TERMINAL. ONLY THE ASSESSED MAY VOTE. THE UNASSESSED MAY WATCH, WHICH IS ALSO A FORM OF PARTICIPATION, THE LEAST ONE.</p>
      <ButtonRow stackOnMobile><Button variant="primary" href="#intake">Be assessed</Button></ButtonRow>
      <div className="asm-sub-h">ALREADY ON FILE? LOG ON WITH YOUR CASE NUMBER.</div>
      <CaseLogon />
    </>
  );
  if (state !== "open") return (
    <p className="asm-fine">{mine ? `YOUR FILE VOTED FOR APPLICATION ${APPLICATIONS[mine.choice].no}, CITING ${mine.reasons.join(", ")}. ` : "YOUR FILE DID NOT VOTE. THIS HAS BEEN NOTED, WITHOUT SURPRISE. "}{state === "closed" ? "THE POLLS ARE CLOSED." : "THE POLLS ARE NOT OPEN."}</p>
  );

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const d = await castBallot(caseId, choice, reasons);
      onView(d);
      setMsg({ ok: true, text: d.unchanged ? "UNCHANGED. THE DEPARTMENT HEARD YOU THE FIRST TIME." : d.changed ? "BALLOT CHANGED. THE PREVIOUS ONE IS SUPERSEDED, NOT FORGOTTEN." : "BALLOT CAST. NON-BINDING. RECORDED ANYWAY." });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  }
  return (
    <>
      <p className="asm-fine">FILE {caseId}. {mine ? `ON RECORD: APPLICATION ${APPLICATIONS[mine.choice].no}, CITING ${mine.reasons.join(", ")}. YOU MAY CHANGE IT UNTIL THE POLLS CLOSE.` : "NO BALLOT ON RECORD."}</p>
      <div className="asm-sub-h" id="asm-choice">1. CHOOSE AN APPLICATION</div>
      <ul className="hvi-opts" role="radiogroup" aria-labelledby="asm-choice">
        {["golf", "farm"].map(k => (
          <li key={k}>
            <button type="button" role="radio" aria-checked={choice === k} className="hvi-opt" onClick={() => setChoice(k)}>
              <span className="mk" aria-hidden="true">{choice === k ? "(*)" : "( )"}</span>
              <span className="t">APPLICATION {APPLICATIONS[k].no}: {APPLICATIONS[k].proposal}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="asm-sub-h" id="asm-reasons">2. GIVE YOUR REASONS (1 TO {MAX_REASONS})</div>
      <ul className="hvi-opts" role="group" aria-labelledby="asm-reasons">
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
        {choice && <Chip tone="accent">{APPLICATIONS[choice].no}</Chip>}
        {reasons.map(r => <Chip key={r}>{r}</Chip>)}
      </Chips>
      <ButtonRow stackOnMobile style={{ marginTop: "var(--s3)" }}>
        <Button variant="primary" disabled={busy || !choice || !reasons.length || same} onClick={submit}>{busy ? "Counting" : mine ? "Change ballot" : "Cast ballot"}</Button>
      </ButtonRow>
      {msg && <div className={msg.ok ? "asm-ok" : "asm-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
      <p className="asm-note">ONE BALLOT PER ASSESSED FILE. A FEW FILES PER LOCATION AND PER DEVICE, NO MORE. THE OWNER OF THIS SITE GETS ONE, LIKE EVERYONE. NON-BINDING.</p>
    </>
  );
}
