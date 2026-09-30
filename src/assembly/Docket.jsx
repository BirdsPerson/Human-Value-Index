import { useEffect, useMemo, useState } from "react";
import { Frame, Button, ButtonRow, PaLine, ScreenHead, TextField } from "../ui/index.js";
import { Bar } from "../term.jsx";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { TYPES, TYPE_KEYS, LIMITS, REASONS, MAX_REASONS, targets, targetError, prefilter, filerLabel, NOTICE, FAILED_LINE } from "./proposalRules.js";
import { REASON_NOTE } from "./content.js";
import { loadProposals, fileProposal, cosignProposal, castProposalBallot, reviewProposal } from "./proposalsClient.js";

// #docket: CITIZEN PROPOSALS (docs/PROPOSALS.md). FILE -> CO-SIGN -> THE OWNER APPROVES -> AN
// ASSEMBLY SESSION -> AN ACT. The session in progress (its ballot), the docket ranked by
// co-signatures, the filing form, the decisions, the acts, and for the owner, the review queue.

const CSS = `
.dk-kv { display: grid; grid-template-columns: 12ch minmax(0, 1fr); column-gap: 1ch; row-gap: 2px; margin: var(--s2) 0; font-size: var(--t-s); }
.dk-kv .k { color: var(--fg-mute); }
.dk-kv .v { color: var(--fg); min-width: 0; overflow-wrap: anywhere; }
.dk-kv .v.typed { text-transform: none; }
.dk-note { font-size: var(--t-xs); color: var(--fg-mute); margin-top: var(--s2); }
.dk-fine { font-size: var(--t-xs); color: var(--fg-mute); margin: 0 0 var(--s2); }
.dk-fine a, .dk-note a { color: var(--fg-dim); }
.dk-err { color: var(--harm); margin-top: var(--s2); }
.dk-ok { color: var(--accent); margin-top: var(--s2); }
.dk-sub { font-size: var(--t-xs); color: var(--fg-mute); margin: var(--s3) 0 var(--s1); }
.dk-list { list-style: none; margin: 0; padding: 0; border-top: var(--bw) solid var(--line); }
.dk-item { border-bottom: var(--bw) solid var(--line); padding: var(--s3) 0; }
.dk-head { display: flex; gap: 1ch; align-items: baseline; flex-wrap: wrap; }
.dk-no { color: var(--accent); flex: none; }
.dk-title { color: var(--fg); min-width: 0; overflow-wrap: anywhere; text-transform: none; font-weight: 700; }
.dk-meta { font-size: var(--t-xs); color: var(--fg-mute); margin-top: 2px; }
.dk-desc { color: var(--fg-dim); margin: var(--s1) 0; text-transform: none; line-height: var(--lh); overflow-wrap: anywhere; }
.dk-line { font-size: var(--t-xs); color: var(--fg-dim); }
.dk-count { color: var(--fg); }
.dk-row { display: grid; grid-template-columns: 10ch minmax(0, 1fr) 5ch; column-gap: 1ch; align-items: baseline; font-size: var(--t-s); }
.dk-row .n { text-align: right; }
.dk-row .b { overflow: hidden; white-space: nowrap; }
.dk-select { width: 100%; min-height: var(--hit-min); background: var(--bg); color: var(--fg); border: 0; border-bottom: var(--bw) solid var(--line); border-radius: 0; padding: 0 var(--s1); font: inherit; text-transform: uppercase; }
.dk-select:focus { outline: none; border-bottom-color: var(--accent); background: var(--panel); }
.dk-lab { display: block; font-size: var(--t-xs); color: var(--fg-mute); margin: var(--s3) 0 var(--s1); }
.dk-cnt { font-size: var(--t-xs); color: var(--fg-mute); text-align: right; }
.dk-own { display: flex; flex-direction: column; gap: 0; margin-top: var(--s2); }
.dk-own .ui-field { margin: var(--s1) 0; }
`;
function injectStyles() {
  let el = document.getElementById("dk-styles");
  if (!el) { el = document.createElement("style"); el.id = "dk-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const fmtUtc = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
function left(ms) {
  if (ms <= 0) return "NOW";
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  return d ? `${d}D ${h % 24}H` : h ? `${h}H ${Math.floor((ms % 3600000) / 60000)}M` : `${Math.max(1, Math.floor(ms / 60000))}M`;
}
function useCase() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => {
    const on = (e) => setCaseId(e.detail || readCaseId());
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);
  return caseId;
}
function useDocket(caseId, { review = false } = {}) {
  const [view, setView] = useState(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let off = false;
    const get = () => loadProposals({ caseId, review }).then(d => { if (!off) { setView(d); setErr(""); } }).catch(e => { if (!off) setErr(e.message); });
    get();
    const iv = setInterval(() => { if (!document.hidden) get(); }, 45000);
    return () => { off = true; clearInterval(iv); };
  }, [caseId, review, n]);
  return { view, err, reload: () => setN(x => x + 1) };
}
const typeLabel = (t) => TYPES[t]?.label || t;

// ---- the page -------------------------------------------------------------------------------------
export default function Docket() {
  useEffect(() => { injectStyles(); }, []);
  const caseId = useCase();
  const [review, setReview] = useState(false);
  const { view, err, reload } = useDocket(caseId, { review });
  useEffect(() => { if (view?.owner && !review) setReview(true); }, [view?.owner, review]);
  const now = Date.now();
  return (
    <div className="dk">
      <ScreenHead title="THE DOCKET" meta="CITIZEN PROPOSALS TO THE OVERLORD. FILED, CO-SIGNED, REVIEWED, PUT TO THE ASSEMBLY. NON-BINDING. EVERYTHING IS." />
      {err && <div className="dk-err" role="alert">!! {err}</div>}
      <SessionFrame view={view} caseId={caseId} onDone={reload} />
      {view?.next && !view.session && (
        <Frame title="NEXT ON THE FLOOR" meta={`OPENS IN ${left(view.next.openAt - now)}`}>
          <Filing p={view.next.proposal} />
          <p className="dk-note">SESSION {view.next.sid} OPENS {fmtUtc(view.next.openAt)} AND RUNS THREE DAYS. ONE SESSION AT A TIME. THE CHAIR HAS ONE CHAIR.</p>
        </Frame>
      )}
      {view?.last && <LastFrame last={view.last} />}
      <Frame box title="FILE A PROPOSAL" meta="ONE PER ASSESSED FILE PER DAY">
        <FileForm caseId={caseId} view={view} onFiled={reload} />
      </Frame>
      <Frame title="THE DOCKET" meta={view ? `${view.open.length} OPEN // BY SUPPORT` : "…"}>
        <DocketList view={view} caseId={caseId} onDone={reload} />
      </Frame>
      {view?.review && <OwnerFrame review={view.review} caseId={caseId} onDone={reload} />}
      {view?.decided?.length > 0 && (
        <Frame title="DECIDED" meta="THE OWNER'S RULINGS">
          <ul className="dk-list">
            {view.decided.map(p => (
              <li key={p.id} className="dk-item">
                <ProposalHead p={p} />
                <div className="dk-line">{p.status === "declined" ? `DECLINED: ${p.decision?.reason || ""}` : p.status === "merged" ? `MERGED INTO ${mergedNo(view, p)}.` : p.status === "approved" ? `APPROVED FOR SESSION ${p.decision?.sid}.` : p.line}</div>
              </li>
            ))}
          </ul>
        </Frame>
      )}
      <Frame title="THE ACTS OF THE ASSEMBLY" meta={view ? String(view.acts.length) : "…"}>
        {view?.acts?.length ? (
          <ul className="dk-list">
            {view.acts.slice().reverse().map(a => (
              <li key={a.sid} className="dk-item">
                <div className="dk-head"><span className="dk-no">{a.no}</span><span className="dk-title">{a.title}</span></div>
                <div className="dk-meta">{typeLabel(a.type)} // {a.targetName} // CARRIED {a.votes.for}-{a.votes.against} // SESSION {a.sid}</div>
                <div className="dk-line">{a.effect}</div>
              </li>
            ))}
          </ul>
        ) : <p className="dk-fine">NO ACTS YET. THE ASSEMBLY HAS BEEN BUSY BEING CONVENED.</p>}
      </Frame>
      {NOTICE.map((n, i) => <p key={i} className="dk-fine">{n}</p>)}
      <p className="dk-fine">OBJECT TO A PROPOSAL? <a href="#dispute">FILE A DISPUTE</a>. THE RULES: <a href="#terms">TERMS</a>, <a href="#privacy">PRIVACY</a>.</p>
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#assembly">The Assembly</Button>
      </ButtonRow>
    </div>
  );
}
const mergedNo = (view, p) => [...(view.open || []), ...(view.decided || [])].find(x => x.id === p.decision?.into)?.no || "ANOTHER FILING";

function ProposalHead({ p }) {
  return (
    <>
      <div className="dk-head"><span className="dk-no">{p.no}</span><span className="dk-title">{p.title}</span></div>
      <div className="dk-meta">{typeLabel(p.type)} // {p.targetName} // FILED BY {filerLabel(p.tag)}</div>
    </>
  );
}
function Filing({ p }) {
  if (!p) return null;
  return (
    <div className="dk-kv">
      <span className="k">FILING</span><span className="v">{p.no} // {typeLabel(p.type)}</span>
      <span className="k">TARGET</span><span className="v">{p.targetName}</span>
      <span className="k">TITLE</span><span className="v typed">{p.title}</span>
      <span className="k">DESCRIPTION</span><span className="v typed">{p.desc}</span>
      <span className="k">FILED BY</span><span className="v">{filerLabel(p.tag)}</span>
      <span className="k">CO-SIGNED</span><span className="v">{p.cosigns}</span>
    </div>
  );
}

// ---- the session in progress ------------------------------------------------------------------------
function SessionFrame({ view, caseId, onDone }) {
  const s = view?.session;
  if (!s) return null;
  const t = s.tally || { votes: { for: 0, against: 0 }, reasons: { for: {}, against: {} }, voters: 0 };
  const max = Math.max(1, t.votes.for, t.votes.against);
  const lead = t.votes.for === t.votes.against ? (t.voters ? "TIED. A TIE FAILS. THE CITY STAYS AS IT IS." : "NO BALLOTS YET. THE CHAIR COUNTS ITSELF, AND ABSTAINS.") : t.votes.for > t.votes.against ? `FOR LEADS BY ${t.votes.for - t.votes.against}.` : `AGAINST LEADS BY ${t.votes.against - t.votes.for}.`;
  return (
    <Frame box title={`BEFORE THE ASSEMBLY // SESSION ${s.sid}`} meta={`CLOSES IN ${left(s.closeAt - Date.now())}`} tone="accent">
      <Filing p={s.proposal} />
      <PaLine tag="CHAIR>" text={s.minute} />
      <PaLine tag="CHAIR>" text={lead} />
      <div className="dk-sub">THE BOARD // {t.voters} ASSESSED FILE{t.voters === 1 ? "" : "S"} VOTED // POLLS CLOSE {fmtUtc(s.closeAt)}</div>
      {[["for", "FOR", "var(--accent)"], ["against", "AGAINST", "var(--warn)"]].map(([k, l, tone]) => (
        <div className="dk-row" key={k}><span>{l}</span><span className="b"><Bar value={t.votes[k]} max={max} width={24} tone={tone} /></span><span className="n">{t.votes[k]}</span></div>
      ))}
      <div className="dk-sub">YOUR BALLOT</div>
      <SessionBallot caseId={caseId} mine={view?.mine?.ballot || null} onDone={onDone} />
    </Frame>
  );
}
function SessionBallot({ caseId, mine, onDone }) {
  const [side, setSide] = useState(mine?.side || null);
  const [reasons, setReasons] = useState(mine?.reasons || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const sig = mine ? `${mine.side}|${mine.reasons.join()}|${mine.rev}` : "";
  useEffect(() => { if (mine) { setSide(mine.side); setReasons(mine.reasons); } }, [sig]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!caseId) return <NoCase what="VOTE" />;
  const toggle = (r) => setReasons(cur => (cur.includes(r) ? cur.filter(x => x !== r) : cur.length >= MAX_REASONS ? cur : [...cur, r]));
  const same = mine && mine.side === side && mine.reasons.slice().sort().join() === reasons.slice().sort().join();
  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const d = await castProposalBallot(caseId, side, reasons);
      setMsg({ ok: true, text: d.unchanged ? "UNCHANGED. THE DEPARTMENT HEARD YOU THE FIRST TIME." : d.changed ? "BALLOT CHANGED. THE PREVIOUS ONE IS SUPERSEDED, NOT FORGOTTEN." : "BALLOT CAST. NON-BINDING. RECORDED ANYWAY." });
      onDone();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  return (
    <>
      <ul className="hvi-opts" role="radiogroup" aria-label="For or against">
        {[["for", "FOR THE MOTION"], ["against", "AGAINST THE MOTION"]].map(([k, l]) => (
          <li key={k}><button type="button" role="radio" aria-checked={side === k} className="hvi-opt" onClick={() => setSide(k)}>
            <span className="mk" aria-hidden="true">{side === k ? "(*)" : "( )"}</span><span className="t">{l}</span></button></li>
        ))}
      </ul>
      <div className="dk-sub">REASONS (1 TO {MAX_REASONS})</div>
      <ul className="hvi-opts" role="group" aria-label="Reasons">
        {REASONS.map(r => (
          <li key={r}><button type="button" role="checkbox" aria-checked={reasons.includes(r)} className="hvi-opt" onClick={() => toggle(r)}
            aria-disabled={!reasons.includes(r) && reasons.length >= MAX_REASONS ? "true" : undefined}>
            <span className="mk" aria-hidden="true">{reasons.includes(r) ? "[X]" : "[ ]"}</span>
            <span className="t">{r} <span style={{ opacity: 0.7 }}>// {REASON_NOTE[r]}</span></span></button></li>
        ))}
      </ul>
      <ButtonRow stackOnMobile style={{ marginTop: "var(--s3)" }}>
        <Button variant="primary" disabled={busy || !side || !reasons.length || same} onClick={submit}>{busy ? "Counting" : mine ? "Change ballot" : "Cast ballot"}</Button>
      </ButtonRow>
      {msg && <div className={msg.ok ? "dk-ok" : "dk-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
      <p className="dk-note">ONE BALLOT PER ASSESSED FILE, CHANGEABLE UNTIL THE CLOSE. A MAJORITY OF BALLOTS CAST CARRIES THE MOTION; A TIE FAILS. NON-BINDING.</p>
    </>
  );
}
function LastFrame({ last }) {
  const p = last.proposal;
  return (
    <Frame title={`LAST SESSION // ${last.sid}`} meta={last.carried ? "CARRIED" : "DEFEATED"} tone={last.carried ? "accent" : "harm"}>
      {p && <ProposalHead p={p} />}
      <p className="dk-line">{last.votes ? `${last.votes.for} FOR, ${last.votes.against} AGAINST. ` : ""}{last.carried ? "CARRIED. SEE THE ACTS BELOW." : FAILED_LINE}</p>
    </Frame>
  );
}

// ---- the filing form -------------------------------------------------------------------------------
function NoCase({ what }) {
  return (
    <>
      <p className="dk-fine">NO FILE ON THIS TERMINAL. ONLY THE ASSESSED MAY {what}. THE UNASSESSED MAY READ, WHICH IS ALSO A FORM OF PARTICIPATION, THE LEAST ONE.</p>
      <ButtonRow stackOnMobile><Button variant="primary" href="#intake">Be assessed</Button></ButtonRow>
      <div className="dk-sub">ALREADY ON FILE? LOG ON WITH YOUR CASE NUMBER.</div>
      <CaseLogon />
    </>
  );
}
export function FileForm({ caseId, view, onFiled }) {
  const [type, setType] = useState(null);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const all = useMemo(() => targets(), [view?.acts?.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = useMemo(() => (type ? all.filter(t => !targetError(type, t)) : all), [all, type]);
  useEffect(() => { if (target && !allowed.some(t => t.id === target)) setTarget(""); }, [allowed, target]);
  if (!caseId) return <NoCase what="PETITION" />;
  if (view?.mine?.filedToday && !msg?.ok) return <p className="dk-fine">YOUR FILE HAS PETITIONED THE OVERLORD TODAY. ONE IDEA PER DAY. RETURN TOMORROW. CO-SIGN SOMEONE ELSE'S IN THE MEANTIME.</p>;
  const max = type === "RENAME" ? LIMITS.renameMax : LIMITS.title;
  async function submit(e) {
    e.preventDefault();
    const pf = prefilter({ type, target, title, desc });
    if (!pf.ok) { setMsg({ ok: false, text: pf.error }); return; }
    setBusy(true); setMsg(null);
    try {
      const d = await fileProposal(caseId, pf.value);
      setMsg({ ok: true, text: `FILED AS ${d.proposal.no}. IT IS ON THE DOCKET. GATHER CO-SIGNATURES. THE OWNER READS THE POPULAR ONES FIRST.` });
      setTitle(""); setDesc(""); setType(null); setTarget("");
      onFiled?.();
    } catch (err) {
      setMsg({ ok: false, text: err.screened ? `REFUSED BY THE CENSOR: ${err.message}` : err.message });
    } finally { setBusy(false); }
  }
  const groups = [];
  for (const t of allowed) {
    const g = t.kind === "city" ? "THE CITY" : all.find(x => x.id === `d:${t.district}`)?.name || "";
    if (!groups.length || groups[groups.length - 1][0] !== g) groups.push([g, []]);
    groups[groups.length - 1][1].push(t);
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="dk-fine">FILE {caseId}. A PROPOSAL IS SCREENED BY A MACHINE, CO-SIGNED BY OTHER FILES, AND READ BY THE OWNER, WHO PUTS THE BEST TO THE ASSEMBLY FOR THREE DAYS. OPEN PROPOSALS EXPIRE AFTER {LIMITS.expireDays} DAYS UNSCHEDULED.</p>
      <div className="dk-sub" id="dk-type">1. TYPE</div>
      <ul className="hvi-opts" role="radiogroup" aria-labelledby="dk-type">
        {TYPE_KEYS.map(k => (
          <li key={k}><button type="button" role="radio" aria-checked={type === k} className="hvi-opt" onClick={() => setType(k)}>
            <span className="mk" aria-hidden="true">{type === k ? "(*)" : "( )"}</span>
            <span className="t">{TYPES[k].label} <span style={{ opacity: 0.7 }}>// {TYPES[k].hint}</span></span></button></li>
        ))}
      </ul>
      <label className="dk-lab" htmlFor="dk-target">2. TARGET</label>
      <select id="dk-target" className="dk-select" value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">CHOOSE A PLACE…</option>
        {groups.map(([g, ts]) => (
          <optgroup key={g} label={g}>{ts.map(t => <option key={t.id} value={t.id}>{t.kind === "district" ? `${t.name} (THE DISTRICT)` : t.kind === "lot" ? `${t.name} (OPEN GROUND)` : t.name}</option>)}</optgroup>
        ))}
      </select>
      <TextField stacked label={type === "RENAME" ? "3. THE NEW NAME" : "3. TITLE"} value={title} maxLength={max} onChange={e => setTitle(e.target.value)} placeholder={type === "RENAME" ? "THE NEW NAME" : "WHAT YOU PROPOSE, IN BRIEF"} />
      <div className="dk-cnt">{title.length}/{max}</div>
      <TextField stacked multiline label="4. DESCRIPTION" value={desc} maxLength={LIMITS.desc} onChange={e => setDesc(e.target.value)} placeholder="WHY. BRIEFLY. THE DEPARTMENT IS BUSY." />
      <div className="dk-cnt">{desc.length}/{LIMITS.desc}</div>
      <p className="dk-note">NO PRIVATE INDIVIDUALS. NO WORDS PUT IN A LIVING PERSON'S MOUTH. NO ALLEGATIONS ABOUT THE LIVING. NO LINKS, EMAILS OR PHONE NUMBERS. NOTHING THAT ASKS ANYONE TO DO ANYTHING OUTSIDE THIS CITY.</p>
      <ButtonRow stackOnMobile style={{ marginTop: "var(--s3)" }}>
        <Button variant="primary" type="submit" disabled={busy || !type || !target || !title.trim() || !desc.trim()}>{busy ? "Screening" : "File the proposal"}</Button>
      </ButtonRow>
      {msg && <div className={msg.ok ? "dk-ok" : "dk-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
    </form>
  );
}

// ---- the docket ---------------------------------------------------------------------------------------
function DocketList({ view, caseId, onDone }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState({});
  if (!view) return <p className="dk-fine">READING THE DOCKET…</p>;
  if (!view.open.length) return <p className="dk-fine">THE DOCKET IS EMPTY. THE SUBJECTS HAVE NO IDEAS. THE DEPARTMENT IS RELIEVED, AND A LITTLE HURT.</p>;
  const signed = new Set(view.mine?.signed || []), filed = new Set(view.mine?.filed || []);
  async function sign(pid) {
    setBusy(pid);
    try { await cosignProposal(caseId, pid); setMsg(m => ({ ...m, [pid]: { ok: true, text: "CO-SIGNED. YOUR SUPPORT HAS BEEN RECORDED AGAINST YOUR FILE. PERMANENTLY." } })); onDone(); }
    catch (e) { setMsg(m => ({ ...m, [pid]: { ok: false, text: e.message } })); } finally { setBusy(null); }
  }
  return (
    <ul className="dk-list">
      {view.open.map(p => (
        <li key={p.id} className="dk-item">
          <ProposalHead p={p} />
          <p className="dk-desc">{p.desc}</p>
          <div className="dk-meta"><span className="dk-count">{p.cosigns} CO-SIGNATURE{p.cosigns === 1 ? "" : "S"}</span> // EXPIRES IN {left(p.expiresAt - view.now)}{p.merged ? ` // ${p.merged} MERGED IN` : ""}</div>
          <div className="dk-line"><span className="dk-no">OVERLORD&gt;</span> {p.line}</div>
          {caseId && !filed.has(p.id) && (
            <ButtonRow stackOnMobile style={{ marginTop: "var(--s2)" }}>
              <Button variant="secondary" disabled={signed.has(p.id) || busy === p.id} onClick={() => sign(p.id)}>{signed.has(p.id) ? "Co-signed" : busy === p.id ? "Signing" : "Co-sign"}</Button>
            </ButtonRow>
          )}
          {filed.has(p.id) && <div className="dk-note">YOUR FILING. YOU MAY NOT CO-SIGN IT. YOU MAY RECRUIT.</div>}
          {msg[p.id] && <div className={msg[p.id].ok ? "dk-ok" : "dk-err"} role={msg[p.id].ok ? "status" : "alert"}>{msg[p.id].text}</div>}
        </li>
      ))}
    </ul>
  );
}

// ---- the owner's review queue ---------------------------------------------------------------------------
function OwnerFrame({ review, caseId, onDone }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function act(op, pid, extra) {
    setBusy(true); setMsg(null);
    try {
      const d = await reviewProposal(caseId, op, pid, extra);
      setMsg({ ok: true, text: op === "approve" ? `APPROVED. SESSION ${d.session.sid} OPENS ${fmtUtc(d.session.openAt)}.` : op === "decline" ? "DECLINED. THE REASON IS PUBLIC." : "MERGED." });
      onDone();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  return (
    <Frame box title="THE OWNER'S REVIEW" meta={`${review.queue.length} AWAITING`} tone="warn">
      <p className="dk-fine">VISIBLE TO THE OWNER'S FILE ONLY. APPROVE PUTS A PROPOSAL TO THE NEXT FREE SESSION (AFTER THE CURRENT ONE CLOSES). DECLINE SHOWS YOUR REASON PUBLICLY. MERGE FOLDS ITS SIGNATURES INTO ANOTHER OPEN PROPOSAL.</p>
      {msg && <div className={msg.ok ? "dk-ok" : "dk-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      {!review.queue.length && <p className="dk-fine">NOTHING AWAITS YOU. THE SUBJECTS ARE QUIET.</p>}
      <ul className="dk-list">
        {review.queue.map(p => <OwnerRow key={p.id} p={p} queue={review.queue} presets={review.presets} busy={busy} act={act} />)}
      </ul>
      {review.sessions.length > 0 && (
        <>
          <div className="dk-sub">SESSIONS</div>
          {review.sessions.map(s => <div key={s.sid} className="dk-meta">{s.sid} // {s.no} {s.title} // {s.state.toUpperCase()} // {fmtUtc(s.openAt)} TO {fmtUtc(s.closeAt)}{s.done ? ` // ${s.carried ? "CARRIED" : "DEFEATED"}` : ""}</div>)}
        </>
      )}
    </Frame>
  );
}
function OwnerRow({ p, queue, presets, busy, act }) {
  const [reason, setReason] = useState("");
  const [into, setInto] = useState("");
  const others = queue.filter(x => x.id !== p.id);
  return (
    <li className="dk-item">
      <ProposalHead p={p} />
      <p className="dk-desc">{p.desc}</p>
      <div className="dk-meta"><span className="dk-count">{p.cosigns} CO-SIGNATURES</span> // FILED {fmtUtc(p.at)} // EXPIRES IN {left(p.expiresAt - Date.now())}</div>
      <div className="dk-own">
        <ButtonRow stackOnMobile><Button variant="primary" disabled={busy} onClick={() => act("approve", p.id)}>Approve for next session</Button></ButtonRow>
        <select className="dk-select" aria-label="Decline reason" value={presets.includes(reason) ? reason : ""} onChange={e => setReason(e.target.value)}>
          <option value="">PRESET REASON…</option>
          {presets.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <TextField stacked label="DECLINE REASON (SHOWN PUBLICLY)" value={reason} maxLength={LIMITS.declineReason} onChange={e => setReason(e.target.value)} />
        <ButtonRow stackOnMobile><Button variant="secondary" disabled={busy} onClick={() => act("decline", p.id, { reason })}>Decline</Button></ButtonRow>
        {others.length > 0 && (
          <>
            <select className="dk-select" aria-label="Merge into" value={into} onChange={e => setInto(e.target.value)}>
              <option value="">MERGE INTO…</option>
              {others.map(o => <option key={o.id} value={o.id}>{o.no}: {o.title}</option>)}
            </select>
            <ButtonRow stackOnMobile><Button variant="secondary" disabled={busy || !into} onClick={() => act("merge", p.id, { into })}>Merge</Button></ButtonRow>
          </>
        )}
      </div>
    </li>
  );
}

// ---- the panel on #assembly --------------------------------------------------------------------------------
// The filing form and the docket's state, on the Assembly's own page.
export function ProposalPanel() {
  useEffect(() => { injectStyles(); }, []);
  const caseId = useCase();
  const { view, reload } = useDocket(caseId);
  const s = view?.session, nx = view?.next;
  return (
    <Frame box title="PETITION THE OVERLORD" meta={view ? `${view.open.length} ON THE DOCKET` : "…"}>
      <p className="dk-fine">ASSESSED FILES MAY PROPOSE WHAT THE ASSEMBLY VOTES ON NEXT: BUILD SOMETHING, A POLICY, RENAME A PLACE, HOLD AN EVENT. OTHER FILES CO-SIGN. THE OWNER PUTS THE BEST TO THE FLOOR.</p>
      {s && <PaLine tag="CHAIR>" text={`NOW BEFORE THE ASSEMBLY: ${s.proposal?.no} ${String(s.proposal?.title || "").toUpperCase()}. VOTE ON THE DOCKET.`} />}
      {!s && nx && <PaLine tag="CHAIR>" text={`NEXT ON THE FLOOR: ${nx.proposal?.no}, OPENING ${fmtUtc(nx.openAt)}.`} />}
      <ButtonRow stackOnMobile>
        <Button variant="secondary" href="#docket">{s ? "Vote on the docket" : "Read the docket"}</Button>
      </ButtonRow>
      <div className="dk-sub">FILE A PROPOSAL</div>
      <FileForm caseId={caseId} view={view} onFiled={reload} />
    </Frame>
  );
}
