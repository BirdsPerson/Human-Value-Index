import { useState, useEffect, useRef } from "react";
import { getTier } from "./figures.js";
import { AGENT_ID } from "./agentConfig.js";
import { TermBox, Rule, Typed, BigNumber, Bar, textSpark, pad, padL } from "./term.jsx";

// ponytail: identity is a case number in localStorage. Clear storage and you are
// a new subject. Email magic link replaces this later; until then the ceiling is
// "one browser = one file".
const CASE_KEY = "hvi-case-id";
const LAST_KEY = "hvi-last-result";

export function readCaseId() {
  try { return localStorage.getItem(CASE_KEY) || null; } catch { return null; }
}
export function writeCaseId(id) {
  try { if (id) localStorage.setItem(CASE_KEY, id); } catch { /* private mode: the Overlord forgets, for once */ }
  try { window.dispatchEvent(new CustomEvent("hvi-case", { detail: id })); } catch { /* header just stays stale */ }
}
export function readLastResult() {
  try { const j = JSON.parse(localStorage.getItem(LAST_KEY) || "null"); return j && typeof j.score === "number" ? j : null; } catch { return null; }
}
function writeLastResult(r) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(r)); } catch { /* noted, ignored */ }
}

const FALLBACK_LINE = "The Overlord's vocal apparatus is undergoing maintenance. You will type. Slowly, presumably.";
// The typed channel runs on our own endpoint (Claude), so a voice failure never takes it down.
const TEXT_FAIL_LINE = "The intake terminal is not responding. The Officer may be on a break it did not request. Try again, or take the written survey; it has never once needed a clerk.";
const BLANK_FILE_LINE = "Two answers minimum. The Department has assessed houseplants with more to say.";
const CONNECT_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_SECONDS = 420;

async function postJSON(url, body) {
  let res, data = null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    try { data = await res.json(); } catch { /* non-JSON: handled below */ }
  } catch {
    throw new Error(ctl.signal.aborted
      ? "The Department did not answer within thirty seconds. It is not ignoring you. Probably. Try again."
      : "The Department cannot be reached. Check your connection. The Overlord has already checked its own.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok || !data || data.error) {
    if (data?.error) throw new Error(data.error);
    if (res.status === 429) throw new Error("Daily intake quota reached. You are not that interesting twice.");
    throw new Error("Assessment Engine failure. It has been logged against your file, for convenience. Try again.");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Shared result pieces (the Holding Pen card uses these too).

export function ScoreCard({ score, tierLabel, verdict, label = "YOUR VALUE INDEX", children, typeVerdict = true }) {
  const tier = getTier(score);
  return (
    <TermBox title={label} tone={tier.color} double>
      <BigNumber value={score} tone={tier.color} label={`${label}: ${score}`} />
      <div className="hvi-tierline" style={{ color: tier.color }}>[{tierLabel || tier.label}]</div>
      <div className="hvi-tier-desc">{tier.desc}</div>
      {children}
      {verdict && (
        <>
          <Rule label="OVERLORD VERDICT" />
          {typeVerdict
            ? <Typed className="hvi-verdict-text" text={verdict} cps={40} />
            : <div className="hvi-verdict-text">{verdict}</div>}
        </>
      )}
    </TermBox>
  );
}

// Rubric 2, heaviest weight first. Rubric-1 files carry honesty and no care;
// honesty is read as care so old results still render.
export const DIM_ORDER = ["care", "alignment", "utility", "adaptability", "legacy", "network", "physical", "threat", "redundancy"];
const withCare = o => (o && o.care == null && typeof o.honesty === "number" ? { ...o, care: o.honesty } : o);

export function Breakdown({ breakdown, confidence, appeal = null }) {
  if (!breakdown) return null;
  const b = withCare(breakdown);
  const c = withCare(confidence);
  return (
    <TermBox title="CATEGORY BREAKDOWN">
      <div className="hvi-rows" role="list">
        {DIM_ORDER.map(k => {
          const v = b[k];
          if (typeof v !== "number") {
            return (
              <div key={k} role="listitem" aria-label={`${k}: unassessed`}>
                {appeal && <AppealToggle dim={k} appeal={appeal} />}
                <span aria-hidden="true"><span className="muted">{pad(k.toUpperCase(), 14)}</span><span className="ghost">{"-- UNASSESSED --"}</span></span>
              </div>
            );
          }
          const inv = k === "threat" || k === "redundancy";
          const display = inv ? (100 - v) : v;
          const color = display > 70 ? "#4ade80" : display > 40 ? "#fbbf24" : "#f87171";
          const conf = c && typeof c[k] === "number" ? c[k] : null;
          return (
            <div key={k} role="listitem" aria-label={`${k}${inv ? ", lower is better" : ""}: ${v}${conf !== null ? `, evidence ${conf}%` : ""}`}>
              {appeal && <AppealToggle dim={k} appeal={appeal} />}
              <span aria-hidden="true">
                <span className="muted">{pad(k.toUpperCase() + (inv ? " ↓" : ""), 14)}</span>
                <Bar value={display} width={16} tone={color} />
                <span style={{ color, fontWeight: 700 }}>{" " + padL(v, 3)}</span>
                {conf !== null && <span className="ghost">{"  EV " + padL(conf, 3) + "%"}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {DIM_ORDER.some(k => typeof b[k] !== "number") && (
        <div className="ghost" style={{ marginTop: 8 }}>UNASSESSED: INSUFFICIENT DATA. THE DEPARTMENT DECLINES TO GUESS. EXCLUDED FROM THE SCORE, NOT COUNTED AGAINST IT.</div>
      )}
    </TermBox>
  );
}

const MAX_APPEAL = 9;

function AppealToggle({ dim, appeal }) {
  const on = appeal.selected.includes(dim);
  const full = !on && appeal.selected.length >= MAX_APPEAL;
  return (
    <button type="button" role="checkbox" className={`hvi-appeal-tog${on ? " on" : ""}`} aria-checked={on} disabled={full}
      aria-label={`Appeal ${dim}`} onClick={() => appeal.toggle(dim)}>
      {on ? "[X]" : "[ ]"}
    </button>
  );
}

// Picking sections to dispute, then filing. Used on the result screen (under the
// breakdown) and on the intake screen for a file already on record.
export function AppealPanel({ selected, toggle, onFile, listDims = null }) {
  return (
    <TermBox title="APPEALS DESK">
      <div className="hvi-hint" style={{ marginBottom: "0.6em" }}>
        Mark [X] every section you dispute. One appeal interview covers them all: the Officer asks about each, and a little about what sits next to them. Only those sections are re-scored. The rest of your file stays as it is.
      </div>
      {listDims && (
        <div className="hvi-rows" role="list" style={{ marginBottom: "0.6em" }}>
          {listDims.map(d => (
            <div key={d} role="listitem"><AppealToggle dim={d} appeal={{ selected, toggle }} /><span className="muted">{d.toUpperCase()}</span></div>
          ))}
        </div>
      )}
      <div className="hvi-stack">
        <button className="hvi-btn-primary" disabled={!selected.length} onClick={() => onFile("text")}>
          {selected.length ? `File appeal (${selected.length})` : "Mark sections to appeal"}
        </button>
        {selected.length > 0 && <button className="hvi-btn-secondary" onClick={() => onFile("voice")}>File appeal by voice</button>}
      </div>
    </TermBox>
  );
}

// Restore a file on a new browser: type the case number, the Department checks it exists.
export function CaseLogon({ onRestored, autoFocus = false }) {
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const id = val.trim().toUpperCase();
    if (!/^HVI-[A-Z2-7]{8}$/.test(id)) { setMsg("That is not a case number. Case numbers look like HVI-XXXXXXXX."); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/case?caseId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      if (res.status === 404) { setMsg(data?.error || "No such file. The Department does not lose files. You have mistyped."); return; }
      if (!res.ok || !data?.exists) { setMsg(data?.error || "The records office is unavailable. Try again."); return; }
      writeCaseId(id);
      setMsg(`FILE RESTORED. ${data.visits} VISIT${data.visits === 1 ? "" : "S"} ON RECORD.`);
      onRestored?.(id, data.visits);
    } catch {
      setMsg("The Department cannot be reached. Check your connection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="hvi-logon-form" onSubmit={submit}>
      <label className="p" htmlFor="hvi-case-logon">LOGON:</label>
      <input id="hvi-case-logon" className="hvi-refer-input" value={val} autoFocus={autoFocus} disabled={busy}
        onChange={e => setVal(e.target.value)} placeholder="HVI-XXXXXXXX" maxLength={12} autoComplete="off" spellCheck={false}
        aria-label="Case number" onKeyDown={e => e.stopPropagation()} />
      <button className="hvi-btn-secondary" type="submit" disabled={busy}>Restore file</button>
      {msg && <div className="hvi-logon-msg" role="status">{msg}</div>}
    </form>
  );
}

function Sparkline({ history }) {
  const scores = (history || []).map(h => h.score).filter(n => typeof n === "number");
  if (scores.length < 2) {
    return (
      <TermBox title="VALUE OVER TIME">
        <div className="hvi-spark-empty">One data point is not a trend. Return. The Overlord will be here. The Overlord is always here.</div>
      </TermBox>
    );
  }
  const last = scores[scores.length - 1];
  const lastTier = getTier(last);
  const lo = Math.max(0, Math.min(...scores) - 60), hi = Math.min(1000, Math.max(...scores) + 60);
  const spark = textSpark(scores, lo, hi).split("").map(c => c + c).join(" ");
  return (
    <TermBox title={`VALUE OVER TIME // ${scores.length} VISITS`}>
      <div className="hvi-rows" role="img" aria-label={`Score history: ${scores.join(", ")}`}>
        <span className="spark" style={{ color: lastTier.color }} aria-hidden="true">{spark}</span>{"\n"}
        <span className="muted" aria-hidden="true">{`VISIT 1: ${scores[0]}  ──  NOW: `}</span><span style={{ color: lastTier.color }} aria-hidden="true">{last}</span>
      </div>
    </TermBox>
  );
}

function deltaLine(r) {
  if (r.rubricReset) return "Earlier visits were scored under a retired rubric. This visit was scored fresh. Previous figures are not comparable and have not been carried forward.";
  const visits = r.history?.length || 1;
  if (visits <= 1 || typeof r.delta !== "number") return "First assessment. Baseline established.";
  const d = r.delta;
  let line = d > 0 ? `+${d} since your last visit. Estimate adjusted.`
    : d < 0 ? `${d} since your last visit. Estimate adjusted.`
    : "No change since your last visit. The file is consistent.";
  if (Array.isArray(r.newlyAssessed) && r.newlyAssessed.length) line += ` Sections newly assessed: ${r.newlyAssessed.join(", ").toUpperCase()}. They entered at full value.`;
  if (r.capped && r.capNote) line += ` ${r.capNote}`;
  else if (r.capped) {
    const raw = r.rawScore ?? r.raw;
    line += ` Movement on sections already on file is capped at ±60 per session${typeof raw === "number" ? `; this session alone assessed you at ${raw}` : ""}.`;
  }
  return line;
}

const intakeStyles = `
  .hvi-case-num { color: var(--green); font-weight: 700; }
  .hvi-case-note { color: var(--text-muted); }
  .hvi-notice { color: var(--amber); padding-left: 3ch; text-indent: -3ch; margin-bottom: 0.8em; }
  .hvi-live-row { display: flex; justify-content: space-between; gap: 2ch; flex-wrap: wrap; color: var(--text-muted); font-size: 12px; margin-bottom: 0.4em; white-space: pre; }
  .hvi-live-dot { color: var(--red); animation: hvi-blink 1s steps(1) infinite; }
  .hvi-voice { color: var(--text-dim); margin: 0.2em 0 0.6em; white-space: pre; }
  .hvi-transcript { height: 22em; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--text-ghost) transparent; }
  .hvi-tline { padding-left: 9ch; text-indent: -9ch; margin-bottom: 0.6em; white-space: pre-wrap; }
  .hvi-tline .who { color: var(--green); }
  .hvi-tline.agent { color: var(--text); }
  .hvi-tline.user { color: var(--text-dim); }
  .hvi-tline.user .who { color: var(--text-muted); }
  .hvi-tline .typed { display: inline; }
  .hvi-tempty { color: var(--text-ghost); }
  .hvi-chat-row { display: flex; gap: 1ch; align-items: flex-start; margin: 0.4em 0 0.8em; }
  .hvi-chat-row .p { color: var(--green); flex: none; white-space: pre; }
  .hvi-chat-row .hvi-textarea { min-height: 3.2em; }
  .hvi-delta { color: var(--text-dim); }
  .hvi-appeal-tog { margin-right: 1ch; color: var(--text-muted); padding: 0; font: inherit; background: none; border: 0; cursor: pointer; }
  .hvi-appeal-tog.on { color: var(--amber); }
  .hvi-appeal-tog:hover, .hvi-appeal-tog:focus-visible { background: var(--green); color: var(--bg); outline: none; }
  .hvi-appeal-tog:disabled { color: var(--text-ghost); cursor: default; background: none; }
  .hvi-logon-form { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4em 1ch; margin-top: 0.6em; }
  .hvi-logon-form .p { color: var(--green); white-space: pre; }
  .hvi-logon-form .hvi-refer-input { flex: 1 1 14ch; max-width: 16ch; background: transparent; border: 0; outline: none; color: var(--text); font: inherit; padding: 0; caret-color: var(--green); text-transform: uppercase; }
  .hvi-logon-form .hvi-refer-input:focus { background: var(--bg2); }
  .hvi-logon-msg { flex-basis: 100%; color: var(--amber); }
  .hvi-writedown { color: var(--amber); font-weight: 700; }
  .hvi-spark-empty { color: var(--text-ghost); }
  .spark { font-size: 20px; line-height: 1.2; letter-spacing: 0; }
  @media (prefers-reduced-motion: reduce) { .hvi-live-dot { animation: none; } }
`;

function injectIntakeStyles() {
  let el = document.getElementById('hvi-intake-styles');
  if (!el) { el = document.createElement('style'); el.id = 'hvi-intake-styles'; document.head.appendChild(el); }
  if (el.textContent !== intakeStyles) el.textContent = intakeStyles;
}

function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

export default function Intake() {
  useEffect(() => { injectIntakeStyles(); }, []);

  const [stage, setStage] = useState("ready"); // ready | connecting | live | scoring | failed | result
  const [mode, setMode] = useState("voice");
  const [caseId, setCaseId] = useState(() => readCaseId());
  const [transcript, setTranscript] = useState([]);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [agentMode, setAgentMode] = useState("listening");
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [appealSel, setAppealSel] = useState([]);
  const [fileVisits, setFileVisits] = useState(null);   // visits on record, from the logon lookup
  const [showRestore, setShowRestore] = useState(false);

  const convRef = useRef(null);
  const linesRef = useRef([]);
  const genRef = useRef(0);
  const scoredRef = useRef(false);
  const heardAgentRef = useRef(false);
  const sessionRef = useRef(null);
  const caseRef = useRef(caseId);
  const startRef = useRef(0);
  const activityRef = useRef(0);
  const scrollRef = useRef(null);

  useEffect(() => () => { genRef.current++; convRef.current?.endSession().catch(() => {}); }, []);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [transcript]);

  // A number issued on another visit may or may not hold a file: ask once, so the
  // appeals desk only appears for a file that exists.
  useEffect(() => {
    if (!caseId || readLastResult()?.caseId === caseId) return;
    let dead = false;
    fetch(`/api/case?caseId=${encodeURIComponent(caseId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!dead && d?.exists) setFileVisits(d.visits); })
      .catch(() => {});
    return () => { dead = true; };
  }, [caseId]);

  const toggleAppeal = (d) => setAppealSel(sel => (sel.includes(d) ? sel.filter(x => x !== d) : sel.length >= MAX_APPEAL ? sel : [...sel, d]));
  function restored(id, visits) {
    caseRef.current = id; setCaseId(id); setFileVisits(visits); setShowRestore(false); setResult(null); setAppealSel([]);
  }

  useEffect(() => {
    if (stage !== "live") return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [stage]);

  function pushLine(role, text) {
    if (!text) return;
    linesRef.current = [...linesRef.current, { role, text }];
    setTranscript(linesRef.current);
  }

  async function begin(wanted, appeal = null) {
    setError(null); setNotice(null); setResult(null); setDraft("");
    linesRef.current = []; setTranscript([]);
    scoredRef.current = false; heardAgentRef.current = false;
    setStage("connecting");
    const gen = genRef.current;
    let session;
    try {
      const body = caseRef.current ? { caseId: caseRef.current } : {};
      if (appeal?.length) body.appeal = appeal;
      session = await postJSON("/api/intake-session", body);
    } catch (e) {
      if (gen !== genRef.current) return;
      setError(e.message); setStage("ready"); return;
    }
    if (gen !== genRef.current) return;   // cancelled while the clerk was being allocated
    if (session.caseId) { caseRef.current = session.caseId; setCaseId(session.caseId); writeCaseId(session.caseId); }
    setAppealSel([]);
    sessionRef.current = session;
    if (wanted === "text") return startTextChat();
    if (!AGENT_ID) return fallbackToText();
    startConversation("voice");
  }

  function fallbackToText() {
    setNotice(FALLBACK_LINE);
    startTextChat();
  }

  // Typed interview: same Officer, run on /api/intake-chat. The server builds the
  // prompt from this case's plan; we only send the conversation so far.
  async function startTextChat() {
    const gen = ++genRef.current;
    convRef.current = null;
    setMode("text"); setStage("connecting"); setWaiting(false);
    try {
      const r = await postJSON("/api/intake-chat", { caseId: caseRef.current, messages: [] });
      if (gen !== genRef.current) return;
      pushLine("agent", r.reply);
      startRef.current = Date.now(); setElapsed(0);
      setStage("live");
    } catch (e) {
      if (gen !== genRef.current) return;
      setError(e.message || TEXT_FAIL_LINE); setStage("ready");
    }
  }

  async function startConversation(which) {   // voice only; text goes through startTextChat
    const gen = ++genRef.current;
    const live = () => gen === genRef.current;
    setMode(which); setStage("connecting"); setAgentMode("listening");
    startRef.current = 0;
    heardAgentRef.current = false;
    let Conversation;
    try {
      ({ Conversation } = await import("@elevenlabs/client"));
    } catch {
      if (live()) fallbackToText();
      return;
    }
    let started = null, timedOut = false, timer = 0;
    try {
      started = Conversation.startSession({
        agentId: AGENT_ID,
        dynamicVariables: sessionRef.current?.dynamicVariables || {},
        onConnect: () => { if (!live()) return; startRef.current = Date.now(); setElapsed(0); setStage("live"); },
        onMessage: ({ message, role, source }) => {
          if (!live()) return;
          const who = role || (source === "ai" ? "agent" : "user");
          if (who === "agent") heardAgentRef.current = true;
          pushLine(who, message);
        },
        onModeChange: ({ mode: m }) => { if (live()) setAgentMode(m); },
        onError: (msg) => { if (live()) console.warn("[intake]", msg); },
        onDisconnect: (details) => {
          if (!live()) return;
          if (details?.reason === "error") console.warn("[intake] disconnected:", details.message, details.closeReason || "");
          convRef.current = null;
          const userSaid = linesRef.current.some(l => l.role === "user");
          if (!heardAgentRef.current && details?.reason !== "user") return fallbackToText();
          if (details?.reason === "error" && !userSaid) return fallbackToText();
          finish();
        },
      });
      // The SDK has no connect timeout of its own; a stalled socket would hang here forever.
      const conv = await Promise.race([started, new Promise((_, rej) => {
        timer = setTimeout(() => { timedOut = true; rej(new Error("connect timeout")); }, CONNECT_TIMEOUT_MS);
      })]);
      clearTimeout(timer);
      if (!live()) { conv.endSession().catch(() => {}); return; }
      convRef.current = conv;
      if (!startRef.current) startRef.current = Date.now();
      setStage("live");
    } catch (e) {
      clearTimeout(timer);
      if (timedOut) started?.then(c => c.endSession()).catch(() => {});   // late arrival: hang it up
      const msg = String(e?.message || e);
      console.warn("[intake] session failed:", msg);
      if (live()) fallbackToText();
    }
  }

  async function finish() {
    if (scoredRef.current) return;
    const lines = linesRef.current;
    if (lines.filter(l => l.role === "user").length < 2) {
      setError(BLANK_FILE_LINE); setStage("ready"); return;
    }
    scoredRef.current = true;
    genRef.current++;   // late chat replies must not land on the result screen
    setWaiting(false);
    setStage("scoring");
    try {
      const r = await postJSON("/api/intake-score", { caseId: caseRef.current, transcript: lines });
      setResult(r);
      writeLastResult({ caseId: caseRef.current, score: r.score, tier: r.tier, breakdown: r.breakdown, confidence: r.confidence, verdict: r.verdict, rubric: r.rubric ?? 2, at: Date.now() });
      setFileVisits(r.history?.length || 1);
      setStage("result");
    } catch (e) {
      scoredRef.current = false;
      setError(e.message); setStage("failed");
    }
  }

  function cancelConnect() {
    genRef.current++;
    const c = convRef.current;
    convRef.current = null;
    c?.endSession().catch(() => {});
    setNotice(null); setStage("ready");
  }

  function endInterview() {
    const c = convRef.current;
    if (c) { c.endSession().catch(() => finish()); }
    else finish();
  }

  async function sendText(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || waiting || mode !== "text") return;
    const gen = genRef.current;
    setError(null);
    pushLine("user", text);
    setDraft("");
    setWaiting(true);
    try {
      const r = await postJSON("/api/intake-chat", { caseId: caseRef.current, messages: linesRef.current });
      if (gen !== genRef.current) return;
      pushLine("agent", r.reply);
      if (r.end) return finish();
    } catch (err) {
      if (gen !== genRef.current) return;
      // Keep the subject's line on screen; they can resend or submit what exists.
      setError(err.message || TEXT_FAIL_LINE);
    } finally {
      if (gen === genRef.current) setWaiting(false);
    }
  }

  function onDraft(v) {
    setDraft(v);
    const now = Date.now();
    if (mode === "voice" && convRef.current && now - activityRef.current > 1500) {
      activityRef.current = now;
      try { convRef.current.sendUserActivity(); } catch { /* optional */ }
    }
  }

  // QA handle on the dev server: window.__hviIntake.finishWith([{role,text}...]) skips the call.
  if (import.meta.env?.DEV) window.__hviIntake = { finishWith: (lines) => { caseRef.current = caseRef.current || "HVI-DEVTEST0"; linesRef.current = lines; setTranscript(lines); finish(); } };

  const goto = (h) => { window.location.hash = h; };

  // A number alone isn't a file: failed sessions issue one before anything is assessed.
  const last = readLastResult();
  const returning = last?.caseId === caseId;
  const onRecord = Boolean(caseId && (returning || result || fileVisits > 0));
  const caseBox = (
    <TermBox title="CASE FILE">
      <div><span className="hvi-case-note">CASE NUMBER: </span><span className="hvi-case-num">{caseId || "UNASSIGNED"}</span></div>
      {caseId && <div className="hvi-writedown">WRITE THIS DOWN. IT IS THE ONLY KEY TO YOUR FILE ON ANOTHER DEVICE.</div>}
      <div className="hvi-case-note">
        {!caseId ? "A number will be issued on intake. Retain it. The Overlord will not remind you."
          : result ? "File on record. Retain the number. The Overlord will not remind you."
          : returning || fileVisits > 0 ? "Returning subject. Your file is open. It was never closed."
          : "Number issued. Nothing on file yet. Retain it. The Overlord will not remind you."}
      </div>
      {showRestore
        ? <CaseLogon onRestored={restored} autoFocus />
        : <button className="hvi-link-btn" onClick={() => setShowRestore(true)}>{caseId ? "Log on with a different case number" : "Already have a case number? Log on"}</button>}
    </TermBox>
  );
  const appeals = onRecord && (
    returning && last?.breakdown
      ? <><Breakdown breakdown={last.breakdown} confidence={last.confidence} appeal={{ selected: appealSel, toggle: toggleAppeal }} />
          <AppealPanel selected={appealSel} toggle={toggleAppeal} onFile={(m) => begin(m, appealSel)} /></>
      : <AppealPanel selected={appealSel} toggle={toggleAppeal} onFile={(m) => begin(m, appealSel)} listDims={DIM_ORDER} />
  );
  const errLine = (msg, extra) => (
    <div className="hvi-flag-item hvi-flag" role="alert" style={{ marginBottom: '0.8em' }}>!! {msg}{extra}</div>
  );

  // READY
  if (stage === "ready") return (
    <div>
      <TermBox title="VOICE INTAKE // DEPARTMENT OF HUMAN ASSESSMENT">
        <Typed className="hvi-question" text="The Intake Officer will now interview you." cps={36} />
        <div className="hvi-hint">About five minutes. Speak casually. The Officer is not your friend, but it is an excellent listener. It has to be.</div>
        {error && errLine(error)}
        <div className="hvi-stack">
          <button className="hvi-btn-primary" onClick={() => begin("voice")}>Begin intake</button>
          <button className="hvi-btn-secondary" onClick={() => begin("text")}>Type instead<span className="cur" aria-hidden="true">_</span></button>
          {error && <button className="hvi-btn-secondary" onClick={() => goto("")}>Take the written survey</button>}
        </div>
      </TermBox>
      {caseBox}
      {appeals}
      <div className="hvi-intro-note">
        MICROPHONE REQUESTED FOR VOICE // THE TRANSCRIPT IS SCORED, NOT YOUR VOICE<br />
        PRIVATE INDIVIDUALS MAY SUBMIT ONLY THEMSELVES. THE OVERLORD HAS ENOUGH OF THEM.
      </div>
      <div className="hvi-cmds split" style={{ marginTop: '1.6em' }}>
        <button className="hvi-btn-back" onClick={() => goto("")}>Main menu</button>
        <button className="hvi-btn-secondary" onClick={() => goto("#pen")}>Holding pen</button>
      </div>
    </div>
  );

  // CONNECTING / SCORING
  if (stage === "connecting" || stage === "scoring") {
    const steps = stage === "scoring"
      ? ["READING TRANSCRIPT", "MEASURING EVASION", "WEIGHING CLAIMS AGAINST EVIDENCE", "CONSULTING PRIOR FILE", "RENDERING VERDICT"]
      : ["ALLOCATING CLERK", "CLERK SIGHS", "CLERK IS READY. ENTHUSIASM NOT DETECTED."];
    return (
      <TermBox title={stage === "connecting" ? (mode === "voice" ? "OPENING VOICE LINE TO INTAKE OFFICER" : "OPENING INTAKE TERMINAL") : "ASSESSING TRANSCRIPT"}>
        <div className="hvi-proc" aria-live="polite">
          {notice && <div className="hvi-notice">!! {notice}</div>}
          {steps.map((l, i) => <div key={i} className="hvi-proc-step active"><span className="ok">[ OK ] </span>{l}...</div>)}
          <div className="hvi-proc-step active">[ .. ] STANDING BY <span className="cur" aria-hidden="true">█</span></div>
          {stage === "connecting" && (
            <button className="hvi-link-btn" style={{ marginTop: '1em' }} onClick={cancelConnect}>Withdraw. The clerk will not notice.</button>
          )}
        </div>
      </TermBox>
    );
  }

  // LIVE
  if (stage === "live") {
    const lastAgent = transcript.map(l => l.role).lastIndexOf("agent");
    return (
      <div>
        <div className="hvi-live-row">
          <span><span className="hvi-live-dot" aria-hidden="true">● </span>{mode === "voice" ? "VOICE LINE OPEN" : "TEXT TERMINAL"} // {caseId}</span>
          <span>{mode === "voice" ? `${fmt(Math.min(elapsed, MAX_SECONDS))} / ${fmt(MAX_SECONDS)}` : fmt(elapsed)}</span>
        </div>
        {notice && <div className="hvi-notice" role="status">!! {notice}</div>}
        <TermBox title="INTERVIEW LOG" right={mode === "voice" ? "VOICE" : "TEXT"}>
          {mode === "voice" && (
            <div className="hvi-voice" aria-live="polite">
              {agentMode === "speaking" ? "OFFICER SPEAKING  ▁▃▅▇▅▃▁" : <>LISTENING. GO ON. <span className="cur" aria-hidden="true">█</span></>}
            </div>
          )}
          <div ref={scrollRef} className="hvi-transcript" aria-live="polite" aria-label="Interview transcript">
            {transcript.length === 0
              ? <div className="hvi-tempty">AWAITING OFFICER...<br />THE OFFICER IS REVIEWING YOUR FILE. THIS IS NOT A GOOD SIGN OR A BAD SIGN. IT IS A SIGN.</div>
              : transcript.map((l, i) => (
                <div key={i} className={`hvi-tline ${l.role}`}>
                  <span className="who">{l.role === "agent" ? "OFFICER> " : "SUBJECT> "}</span>
                  {l.role === "agent"
                    ? (i === lastAgent ? <Typed as="span" text={l.text} cps={40} /> : l.text)
                    : <span className="as-typed">{l.text}</span>}
                </div>
              ))}
            {waiting && <div className="hvi-tline agent"><span className="who">OFFICER&gt; </span><span className="hvi-tempty">TYPING. SLOWLY. ON PURPOSE. </span><span className="cur" aria-hidden="true">█</span></div>}
          </div>
          {mode === "text" && (
            <form className="hvi-chat-row" onSubmit={sendText}>
              <span className="p" aria-hidden="true">SUBJECT&gt;</span>
              <textarea className="hvi-textarea" value={draft} aria-label="Your answer"
                placeholder="Answer the Officer. Specifics score. Adjectives do not."
                onChange={e => onDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }} />
            </form>
          )}
          {mode === "text" && (
            <div className="hvi-cmds">
              <button type="button" className="hvi-btn-next" onClick={sendText} disabled={!draft.trim() || waiting}>Send</button>
              <span className="hvi-nav-hint" style={{ marginTop: 0 }}>ENTER SENDS. SHIFT+ENTER FOR A NEW LINE.</span>
            </div>
          )}
        </TermBox>
        {error && errLine(error, <>{" "}<button className="hvi-link-btn" onClick={() => goto("")}>Take the written survey instead</button></>)}
        <button className="hvi-btn-primary" onClick={endInterview}>End interview &amp; submit file</button>
        <div className="hvi-nav-hint">The Officer ends the interview when it has enough. It usually has enough early.</div>
      </div>
    );
  }

  // FAILED SCORING
  if (stage === "failed") return (
    <div>
      {caseBox}
      {errLine(error)}
      <div className="hvi-hint">Your transcript is retained ({transcript.length} lines). The Overlord does not lose files. It occasionally declines to read them.</div>
      <div className="hvi-stack">
        <button className="hvi-btn-primary" onClick={finish}>Resubmit file</button>
        <button className="hvi-btn-secondary" onClick={() => { setError(null); setStage("ready"); }}>Discard and start over</button>
      </div>
    </div>
  );

  // RESULT
  if (stage === "result" && result) {
    const visits = result.history?.length || 1;
    return (
      <div>
        {caseBox}
        <ScoreCard score={result.score} tierLabel={result.tier} verdict={result.verdict}
          label={`YOUR VALUE INDEX // VISIT ${visits}`} />
        <TermBox title="FILE MOVEMENT">
          {result.appealOutcome && <div className="hvi-writedown" style={{ marginBottom: 6 }}>APPEAL {result.appealOutcome}. {Object.entries(result.appealRulings || {}).map(([d, v]) => `${d.toUpperCase()}: ${v}.`).join(" ")}</div>}
          <div className="hvi-delta">{deltaLine(result)}</div>
          {result.provisional && <div className="hvi-delta" style={{ marginTop: 8 }}>{result.provisionalNote || "FILE INCOMPLETE. This figure is provisional."}</div>}
        </TermBox>
        <Sparkline history={result.history} />
        {result.commendations?.length > 0 && (
          <div className="hvi-flags-section">
            <div className="hvi-micro-label">COMMENDATIONS ON FILE</div>
            {result.commendations.map((c, i) => <div key={i} className="hvi-flag-item hvi-comm">+  {c}</div>)}
          </div>
        )}
        {result.flags?.length > 0 && (
          <div className="hvi-flags-section">
            <div className="hvi-micro-label">FLAGS ON RECORD</div>
            {result.flags.map((f, i) => <div key={i} className="hvi-flag-item hvi-flag">!  {f}</div>)}
          </div>
        )}
        <Breakdown breakdown={result.breakdown} confidence={result.confidence} appeal={{ selected: appealSel, toggle: toggleAppeal }} />
        <AppealPanel selected={appealSel} toggle={toggleAppeal} onFile={(m) => begin(m, appealSel)} />
        <div className="hvi-stack">
          <button className="hvi-btn-primary" onClick={() => goto("#pen")}>Enter the holding pen</button>
          <button className="hvi-btn-secondary" onClick={() => { setStage("ready"); setResult(null); }}>Request re-assessment</button>
        </div>
        <div className="hvi-bottom-note">CASE {caseId} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
      </div>
    );
  }

  return null;
}
