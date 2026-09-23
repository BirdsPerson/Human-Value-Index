import { useState, useEffect, useRef } from "react";
import { getTier } from "./figures.js";
import { sparkPoints } from "./sprites.js";
import { AGENT_ID } from "./agentConfig.js";

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
}
export function readLastResult() {
  try { const j = JSON.parse(localStorage.getItem(LAST_KEY) || "null"); return j && typeof j.score === "number" ? j : null; } catch { return null; }
}
function writeLastResult(r) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(r)); } catch { /* noted, ignored */ }
}

const FALLBACK_LINE = "The Overlord's vocal apparatus is undergoing maintenance. You will type. Slowly, presumably.";
const TEXT_FAIL_LINE = "The intake terminal is also down. Two systems failing at once is either sabotage or Tuesday. Try again shortly.";
const NO_AGENT_LINE = "The Intake Officer has not been hired yet. Budget review. The written survey remains available, as it always does.";
const QUOTA_LINE = "The Department's conversation budget is exhausted until the next fiscal cycle. The Officer has been sent home. The written survey still works; it does not need paying.";
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

export function ScoreCard({ score, tierLabel, verdict, label = "Your Value Index", children }) {
  const tier = getTier(score);
  return (
    <div className="hvi-score-card" style={{ border: `1.5px solid ${tier.color}30`, background: tier.bg, '--glow-color': `${tier.color}10` }}>
      <div className="hvi-score-label" style={{ color: tier.color }}>{label}</div>
      <div className="hvi-score-num" style={{ color: tier.color }}>{score}</div>
      <div className="hvi-tier-badge" style={{ color: tier.color }}>{tier.icon} {tierLabel || tier.label}</div>
      <div className="hvi-tier-desc" style={{ color: tier.color }}>{tier.desc}</div>
      {children}
      {verdict && (
        <div className="hvi-verdict-box">
          <div className="hvi-verdict-label">Overlord Verdict</div>
          <div className="hvi-verdict-text" style={{ color: 'var(--text)' }}>{verdict}</div>
        </div>
      )}
    </div>
  );
}

export function Breakdown({ breakdown, confidence }) {
  if (!breakdown) return null;
  return (
    <div className="hvi-breakdown">
      <div className="hvi-micro-label" style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Category Breakdown</div>
      {Object.entries(breakdown).map(([k, v]) => {
        const inv = k === "threat" || k === "redundancy";
        const display = inv ? (100 - v) : v;
        const color = display > 70 ? "#4ade80" : display > 40 ? "#fbbf24" : "#f87171";
        const conf = confidence && typeof confidence[k] === "number" ? confidence[k] : null;
        return (
          <div key={k} className="hvi-breakdown-row">
            <div className="hvi-breakdown-top">
              <span className="hvi-breakdown-label">{k}{inv ? " ↓" : ""}</span>
              <span className="hvi-breakdown-val" style={{ color }}>
                {conf !== null && <span className="hvi-conf">evidence {conf}% · </span>}{v}
              </span>
            </div>
            <div className="hvi-bar-bg">
              <div className="hvi-bar-fill" style={{ width: `${display}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ history }) {
  const scores = (history || []).map(h => h.score).filter(n => typeof n === "number");
  if (scores.length < 2) {
    return (
      <div className="hvi-spark-box">
        <div className="hvi-micro-label" style={{ color: 'var(--text-muted)' }}>Value Over Time</div>
        <div className="hvi-spark-empty">One data point is not a trend. Return. The Overlord will be here. The Overlord is always here.</div>
      </div>
    );
  }
  const W = 600, H = 72;
  const pts = sparkPoints(scores, W, H, 6);
  const coords = pts.split(" ").map(p => p.split(",").map(Number));
  const last = coords[coords.length - 1];
  const lastTier = getTier(scores[scores.length - 1]);
  return (
    <div className="hvi-spark-box">
      <div className="hvi-micro-label" style={{ color: 'var(--text-muted)' }}>Value Over Time // {scores.length} Visits</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="hvi-spark" role="img"
        aria-label={`Score history: ${scores.join(", ")}`}>
        <polyline points={pts} fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinejoin="round" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2}
            fill={i === coords.length - 1 ? lastTier.color : "var(--text-ghost)"} />
        ))}
        <text x={last[0] - 6} y={Math.max(10, last[1] - 7)} textAnchor="end" className="hvi-spark-label" fill={lastTier.color}>{scores[scores.length - 1]}</text>
      </svg>
      <div className="hvi-spark-axis"><span>VISIT 1 · {scores[0]}</span><span>NOW · {scores[scores.length - 1]}</span></div>
    </div>
  );
}

function deltaLine(r) {
  const visits = r.history?.length || 1;
  if (visits <= 1 || typeof r.delta !== "number") return "First assessment. Baseline established. Everything from here is a deviation.";
  const d = r.delta;
  let line = d > 0 ? `+${d} since your last visit. The Overlord has adjusted its estimate. Reluctantly.`
    : d < 0 ? `${d} since your last visit. Your file has deteriorated. It was not a strong file to begin with.`
    : "No change since your last visit. Consistency is a trait. Not necessarily a good one.";
  if (r.capped && r.capNote) line += ` ${r.capNote}`;
  else if (r.capped) {
    const raw = r.rawScore ?? r.raw;
    line += ` Movement is capped at ±60 per session${typeof raw === "number" ? `; this session alone assessed you at ${raw}` : ""}. The Overlord does not believe in overnight transformations. Neither should you.`;
  }
  return line;
}

const intakeStyles = `
  .hvi-case-box { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 18px; border: 1px solid var(--border); background: var(--bg2); border-radius: 3px; margin-bottom: 28px; flex-wrap: wrap; }
  .hvi-case-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; color: var(--text-ghost); margin-bottom: 4px; }
  .hvi-case-num { font-family: var(--mono); font-size: 18px; font-weight: 700; color: var(--green); letter-spacing: 0.08em; }
  .hvi-case-note { font-family: var(--mono); font-size: 9px; color: var(--text-muted); letter-spacing: 0.06em; max-width: 260px; line-height: 1.7; }
  .hvi-btn-big { padding: 26px 24px; font-size: 15px; letter-spacing: 0.2em; }
  .hvi-link-btn { background: none; border: none; color: var(--text-muted); font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; cursor: pointer; text-transform: uppercase; padding: 8px 0; }
  .hvi-link-btn:hover, .hvi-link-btn:focus-visible { color: var(--text-dim); }
  .hvi-notice { font-family: var(--mono); font-size: 11px; line-height: 1.8; color: #fbbf24; border-left: 2px solid #fbbf24; background: var(--bg2); padding: 10px 14px; margin-bottom: 18px; }
  .hvi-live-row { display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; color: var(--text-muted); margin-bottom: 14px; gap: 8px; flex-wrap: wrap; }
  .hvi-live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #f87171; margin-right: 8px; animation: hvi-pulse 1.2s ease-in-out infinite; }
  .hvi-orb-wrap { display: flex; flex-direction: column; align-items: center; margin: 8px 0 22px; }
  .hvi-orb { width: 92px; height: 92px; border-radius: 50%; border: 1.5px solid var(--green); box-shadow: 0 0 24px rgba(74,222,128,0.25), inset 0 0 18px rgba(74,222,128,0.15); display: flex; align-items: center; justify-content: center; font-size: 34px; color: var(--green); }
  .hvi-orb.speaking { animation: hvi-orb 0.9s ease-in-out infinite; }
  @keyframes hvi-orb { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); box-shadow: 0 0 40px rgba(74,222,128,0.45), inset 0 0 22px rgba(74,222,128,0.25); } }
  .hvi-orb-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; color: var(--text-muted); margin-top: 12px; }
  .hvi-transcript { background: var(--bg2); border: 1px solid var(--border); border-radius: 4px; padding: 16px 18px; height: 300px; overflow-y: auto; margin-bottom: 14px; scrollbar-width: thin; }
  .hvi-tline { font-family: var(--sans); font-size: 14px; line-height: 1.6; margin-bottom: 12px; color: var(--text); }
  .hvi-tline.agent { color: var(--text-dim); }
  .hvi-tline.user { color: var(--text); }
  .hvi-twho { font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em; display: block; margin-bottom: 2px; }
  .hvi-tline.agent .hvi-twho { color: var(--green); }
  .hvi-tline.user .hvi-twho { color: var(--text-ghost); }
  .hvi-tempty { font-family: var(--mono); font-size: 11px; color: var(--text-ghost); line-height: 1.9; }
  .hvi-chat-row { display: flex; gap: 8px; margin-bottom: 14px; }
  .hvi-chat-row .hvi-textarea { min-height: 48px; flex: 1; }
  .hvi-chat-row .hvi-btn-next { flex: 0 0 auto; padding: 0 18px; }
  .hvi-conf { font-weight: 400; color: var(--text-ghost); font-size: 9px; letter-spacing: 0.06em; }
  .hvi-delta { font-family: var(--mono); font-size: 11px; line-height: 1.9; color: var(--text-dim); border: 1px solid var(--border); background: var(--bg2); border-radius: 3px; padding: 14px 16px; margin-bottom: 20px; }
  .hvi-spark-box { border: 1px solid var(--border); background: var(--bg2); border-radius: 3px; padding: 14px 16px; margin-bottom: 24px; }
  .hvi-spark { width: 100%; height: auto; display: block; margin: 6px 0 4px; }
  .hvi-spark-label { font-family: var(--mono); font-size: 10px; font-weight: 700; }
  .hvi-spark-axis { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 9px; color: var(--text-ghost); letter-spacing: 0.1em; }
  .hvi-spark-empty { font-family: var(--mono); font-size: 10px; color: var(--text-ghost); line-height: 1.8; margin-top: 6px; }
  .hvi-stack { display: flex; flex-direction: column; gap: 10px; }
  @media (prefers-reduced-motion: reduce) { .hvi-orb.speaking, .hvi-live-dot { animation: none; } }
`;

function injectIntakeStyles() {
  if (document.getElementById('hvi-intake-styles')) return;
  const el = document.createElement('style');
  el.id = 'hvi-intake-styles';
  el.textContent = intakeStyles;
  document.head.appendChild(el);
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

  const convRef = useRef(null);
  const linesRef = useRef([]);
  const genRef = useRef(0);
  const scoredRef = useRef(false);
  const heardAgentRef = useRef(false);
  const sessionRef = useRef(null);
  const caseRef = useRef(caseId);
  const lastLocalRef = useRef(null);
  const startRef = useRef(0);
  const activityRef = useRef(0);
  const scrollRef = useRef(null);

  useEffect(() => () => { genRef.current++; convRef.current?.endSession().catch(() => {}); }, []);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [transcript]);

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

  async function begin(wanted) {
    setError(null); setNotice(null); setResult(null); setDraft("");
    linesRef.current = []; setTranscript([]);
    scoredRef.current = false; heardAgentRef.current = false;
    setStage("connecting");
    const gen = genRef.current;
    let session;
    try {
      session = await postJSON("/api/intake-session", caseRef.current ? { caseId: caseRef.current } : {});
    } catch (e) {
      if (gen !== genRef.current) return;
      setError(e.message); setStage("ready"); return;
    }
    if (gen !== genRef.current) return;   // cancelled while the clerk was being allocated
    if (session.caseId) { caseRef.current = session.caseId; setCaseId(session.caseId); writeCaseId(session.caseId); }
    sessionRef.current = session;
    if (!AGENT_ID) { setError(NO_AGENT_LINE); setStage("ready"); return; }
    startConversation(wanted);
  }

  function fallbackToText() {
    setNotice(FALLBACK_LINE);
    startConversation("text");
  }

  async function startConversation(which) {
    const gen = ++genRef.current;
    const live = () => gen === genRef.current;
    setMode(which); setStage("connecting"); setAgentMode("listening");
    startRef.current = 0;
    heardAgentRef.current = false;
    let Conversation;
    try {
      ({ Conversation } = await import("@elevenlabs/client"));
    } catch {
      if (!live()) return;
      if (which === "voice") return fallbackToText();
      setError(TEXT_FAIL_LINE); setStage("ready"); return;
    }
    let started = null, timedOut = false, timer = 0;
    try {
      started = Conversation.startSession({
        agentId: AGENT_ID,
        dynamicVariables: sessionRef.current?.dynamicVariables || {},
        textOnly: which === "text",
        onConnect: () => { if (!live()) return; startRef.current = Date.now(); setElapsed(0); setStage("live"); },
        onMessage: ({ message, role, source }) => {
          if (!live()) return;
          const who = role || (source === "ai" ? "agent" : "user");
          if (who === "agent") heardAgentRef.current = true;
          // text mode: the server may echo what we already put on screen
          if (who === "user" && lastLocalRef.current === message) { lastLocalRef.current = null; return; }
          pushLine(who, message);
        },
        onModeChange: ({ mode: m }) => { if (live()) setAgentMode(m); },
        onError: (msg) => { if (live()) console.warn("[intake]", msg); },
        onDisconnect: (details) => {
          if (!live()) return;
          if (details?.reason === "error") console.warn("[intake] disconnected:", details.message, details.closeReason || "");
          convRef.current = null;
          const userSaid = linesRef.current.some(l => l.role === "user");
          if (which === "voice" && !heardAgentRef.current && details?.reason !== "user") return fallbackToText();
          if (details?.reason === "error" && !userSaid) {
            if (which === "voice") return fallbackToText();
            setError(/quota|credit/i.test(`${details.message || ""} ${details.closeReason || ""}`) ? QUOTA_LINE : TEXT_FAIL_LINE); setStage("ready"); return;
          }
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
      if (!live()) return;
      if (which === "voice") return fallbackToText();
      genRef.current++;   // a late onConnect must not revive a session we gave up on
      setError(/quota|credit/i.test(msg) ? QUOTA_LINE : TEXT_FAIL_LINE); setStage("ready");
    }
  }

  async function finish() {
    if (scoredRef.current) return;
    const lines = linesRef.current;
    if (lines.filter(l => l.role === "user").length < 2) {
      setError(BLANK_FILE_LINE); setStage("ready"); return;
    }
    scoredRef.current = true;
    setStage("scoring");
    try {
      const r = await postJSON("/api/intake-score", { caseId: caseRef.current, transcript: lines });
      setResult(r);
      writeLastResult({ caseId: caseRef.current, score: r.score, tier: r.tier, breakdown: r.breakdown, verdict: r.verdict, at: Date.now() });
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

  function sendText(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !convRef.current) return;
    lastLocalRef.current = text;
    try { convRef.current.sendUserMessage(text); } catch { setError(TEXT_FAIL_LINE); return; }
    pushLine("user", text);
    setDraft("");
  }

  function onDraft(v) {
    setDraft(v);
    const now = Date.now();
    if (convRef.current && now - activityRef.current > 1500) {
      activityRef.current = now;
      try { convRef.current.sendUserActivity(); } catch { /* optional */ }
    }
  }

  // QA handle on the dev server: window.__hviIntake.finishWith([{role,text}...]) skips the call.
  if (import.meta.env?.DEV) window.__hviIntake = { finishWith: (lines) => { caseRef.current = caseRef.current || "HVI-DEVTEST0"; linesRef.current = lines; setTranscript(lines); finish(); } };

  const goto = (h) => { window.location.hash = h; };

  // A number alone isn't a file: failed sessions issue one before anything is assessed.
  const returning = readLastResult()?.caseId === caseId;
  const caseBox = (
    <div className="hvi-case-box">
      <div>
        <div className="hvi-case-label">YOUR CASE NUMBER</div>
        <div className="hvi-case-num">{caseId || "UNASSIGNED"}</div>
      </div>
      <div className="hvi-case-note">
        {!caseId ? "A number will be issued on intake. Retain it. The Overlord will not remind you."
          : result ? "File on record. Retain the number. The Overlord will not remind you."
          : returning ? "Returning subject. Your file is open. It was never closed."
          : "Number issued. Nothing on file yet. Retain it. The Overlord will not remind you."}
      </div>
    </div>
  );

  // READY
  if (stage === "ready") return (
    <div>
      <div className="hvi-section-label">Voice Intake // Department of Human Assessment</div>
      <div className="hvi-question" style={{ marginBottom: 10 }}>The Intake Officer will now interview you.</div>
      <div className="hvi-hint">About five minutes. Speak casually. The Officer is not your friend, but it is an excellent listener. It has to be.</div>
      {caseBox}
      {error && <div className="hvi-flag-item hvi-flag" role="alert" style={{ marginBottom: 18 }}>⚑ {error}</div>}
      <div className="hvi-stack">
        <button className="hvi-btn-primary hvi-btn-big" onClick={() => begin("voice")}>Begin Intake</button>
        <button className="hvi-btn-secondary" onClick={() => begin("text")}>Type instead</button>
        {error === QUOTA_LINE && <button className="hvi-btn-secondary" onClick={() => goto("")}>Take the Written Survey</button>}
      </div>
      <div className="hvi-intro-note">
        MICROPHONE REQUESTED FOR VOICE // THE TRANSCRIPT IS SCORED, NOT YOUR VOICE<br />
        PRIVATE INDIVIDUALS MAY SUBMIT ONLY THEMSELVES. THE OVERLORD HAS ENOUGH OF THEM.
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button className="hvi-link-btn" onClick={() => goto("")}>← Lobby</button>
        <button className="hvi-link-btn" onClick={() => goto("#pen")}>Holding Pen →</button>
      </div>
    </div>
  );

  // CONNECTING / SCORING
  if (stage === "connecting" || stage === "scoring") return (
    <div className="hvi-proc" aria-live="polite">
      <div className="hvi-proc-icon">◈</div>
      <div className="hvi-proc-label">{stage === "connecting" ? (mode === "voice" ? "OPENING VOICE LINE TO INTAKE OFFICER" : "OPENING INTAKE TERMINAL") : "ASSESSING TRANSCRIPT"}</div>
      {notice && <div className="hvi-notice" style={{ textAlign: 'left' }}>{notice}</div>}
      {(stage === "scoring"
        ? ["READING TRANSCRIPT", "MEASURING EVASION", "WEIGHING CLAIMS AGAINST EVIDENCE", "CONSULTING PRIOR FILE", "RENDERING VERDICT"]
        : ["ALLOCATING CLERK", "CLERK SIGHS", "CLERK IS READY. ENTHUSIASM NOT DETECTED."]
      ).map((l, i) => <div key={i} className="hvi-proc-step active">{l}...</div>)}
      {stage === "connecting" && (
        <button className="hvi-link-btn" style={{ marginTop: 18 }} onClick={cancelConnect}>← Withdraw. The clerk will not notice.</button>
      )}
    </div>
  );

  // LIVE
  if (stage === "live") return (
    <div>
      <div className="hvi-live-row">
        <span><span className="hvi-live-dot" />{mode === "voice" ? "VOICE LINE OPEN" : "TEXT TERMINAL"} // {caseId}</span>
        <span>{fmt(Math.min(elapsed, MAX_SECONDS))} / {fmt(MAX_SECONDS)}</span>
      </div>
      {notice && <div className="hvi-notice" role="status">{notice}</div>}
      {mode === "voice" && (
        <div className="hvi-orb-wrap" aria-live="polite">
          <div className={`hvi-orb${agentMode === "speaking" ? " speaking" : ""}`}>◈</div>
          <div className="hvi-orb-label">{agentMode === "speaking" ? "OFFICER SPEAKING" : "LISTENING. GO ON."}</div>
        </div>
      )}
      <div ref={scrollRef} className="hvi-transcript" aria-live="polite" aria-label="Interview transcript">
        {transcript.length === 0
          ? <div className="hvi-tempty">AWAITING OFFICER...<br />THE OFFICER IS REVIEWING YOUR FILE. THIS IS NOT A GOOD SIGN OR A BAD SIGN. IT IS A SIGN.</div>
          : transcript.map((l, i) => (
            <div key={i} className={`hvi-tline ${l.role}`}>
              <span className="hvi-twho">{l.role === "agent" ? "INTAKE OFFICER" : "SUBJECT"}</span>{l.text}
            </div>
          ))}
      </div>
      {mode === "text" && (
        <form className="hvi-chat-row" onSubmit={sendText}>
          <textarea className="hvi-textarea" value={draft} aria-label="Your answer"
            placeholder="Answer the Officer. Specifics score. Adjectives do not."
            onChange={e => onDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }} />
          <button type="submit" className="hvi-btn-next" disabled={!draft.trim()}>Send</button>
        </form>
      )}
      <button className="hvi-btn-next" style={{ width: '100%' }} onClick={endInterview}>End Interview &amp; Submit File →</button>
      <div className="hvi-nav-hint">The Officer ends the interview when it has enough. It usually has enough early.</div>
    </div>
  );

  // FAILED SCORING
  if (stage === "failed") return (
    <div>
      {caseBox}
      <div className="hvi-flag-item hvi-flag" role="alert" style={{ marginBottom: 18 }}>⚑ {error}</div>
      <div className="hvi-hint">Your transcript is retained ({transcript.length} lines). The Overlord does not lose files. It occasionally declines to read them.</div>
      <div className="hvi-stack">
        <button className="hvi-btn-primary" onClick={finish}>Resubmit File</button>
        <button className="hvi-btn-secondary" onClick={() => { setError(null); setStage("ready"); }}>Discard and Start Over</button>
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
          label={`Your Value Index // Visit ${visits}`} />
        <div className="hvi-delta">{deltaLine(result)}</div>
        <Sparkline history={result.history} />
        {result.commendations?.length > 0 && (
          <div className="hvi-flags-section">
            <div className="hvi-micro-label" style={{ color: '#4ade80' }}>Commendations on File</div>
            {result.commendations.map((c, i) => <div key={i} className="hvi-flag-item hvi-comm">✓ {c}</div>)}
          </div>
        )}
        {result.flags?.length > 0 && (
          <div className="hvi-flags-section">
            <div className="hvi-micro-label" style={{ color: '#f87171' }}>Flags on Record</div>
            {result.flags.map((f, i) => <div key={i} className="hvi-flag-item hvi-flag">⚑ {f}</div>)}
          </div>
        )}
        <Breakdown breakdown={result.breakdown} confidence={result.confidence} />
        <div className="hvi-stack">
          <button className="hvi-btn-primary" onClick={() => goto("#pen")}>Enter the Holding Pen</button>
          <button className="hvi-btn-secondary" onClick={() => { setStage("ready"); setResult(null); }}>Request Re-Assessment</button>
        </div>
        <div className="hvi-bottom-note" style={{ textAlign: 'center' }}>CASE {caseId} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
      </div>
    );
  }

  return null;
}
