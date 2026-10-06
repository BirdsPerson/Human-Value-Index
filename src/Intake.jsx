import { useState, useEffect, useRef } from "react";
import CubePanel, { CubeChips, cubePlace, cubeOf } from "./CubePanel.jsx";
import { getTier } from "./figures.js";
import { AGENT_ID } from "./agentConfig.js";
import { Typed, BigNumber } from "./term.jsx";
import FilePhoto from "./FilePhoto.jsx";
import SecureFile from "./SecureFile.jsx";
import { readCaseId, writeCaseId, readLastResult, writeLastResult, ScoreCard, Breakdown, AppealPanel, CaseLogon, MAX_APPEAL,
  assessedMeta, FlagsList, flagsMeta } from "./caseFile.jsx";
import { Frame, Button, ButtonRow, Disclosure, TextField, Command, CommandList, ListRow, Chip, Chips } from "./ui/components.jsx";
import { useBarAction } from "./ui/barAction.js";
import { QuestLog } from "./QuestLog.jsx";
import { FileEconomy } from "./economy/FileEconomy.jsx";
import { visitCount, causeOf, DEPARTMENT_CAUSES } from "./movement.js";
import { FileMovement } from "./caseFile.jsx";
import MySeat from "./elections/MySeat.jsx";
import MyChess from "./chess/MyChess.jsx";
import MyFish from "./play/fish/MyFish.jsx";
import { MyTournaments } from "./tournament/TournamentList.jsx";
import MyLeagues from "./leagues/MyLeagues.jsx";
import FirstDay, { scrollToId } from "./FirstDay.jsx";
import { selfFindHref, note as noteFirstDay } from "./firstDay.js";

// The shared file pieces moved to caseFile.jsx; re-exported so older imports keep working.
export { readCaseId, writeCaseId, readLastResult, syncFile, ScoreCard, Breakdown, AppealPanel, CaseLogon, DIM_ORDER, MAX_APPEAL } from "./caseFile.jsx";

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

// Score over time as a block-character column chart: three rows of ▁▂▃▄▅▆▇█ (24 levels),
// one column per entry, the score under each. The Department's own revisions are drawn in
// --fg-mute and marked ◇; the subject's visits in the current tier's colour. Lives at the top
// of FILE MOVEMENT, above the itemised log.
const LEVELS = "▁▂▃▄▅▆▇█";
const MAX_COLS = 12;
function Sparkline({ history }) {
  const pts = (history || []).filter(h => typeof h?.score === "number").slice(-MAX_COLS);
  if (pts.length < 2) {
    return <div className="hvi-note">One data point is not a trend. Return. The Overlord will be here. The Overlord is always here.</div>;
  }
  const scores = pts.map(h => h.score);
  const dept = pts.map(h => DEPARTMENT_CAUSES.includes(causeOf(h)));
  const lastTier = getTier(scores[scores.length - 1]);
  const lo = Math.max(0, Math.min(...scores) - 60), hi = Math.min(1000, Math.max(...scores) + 20);
  const h24 = scores.map(v => Math.max(1, Math.round(((v - lo) / Math.max(1, hi - lo)) * 24)));
  const cell = (h, row) => { const f = Math.max(0, Math.min(8, h - row * 8)); return f ? LEVELS[f - 1].repeat(3) : "   "; };
  // The Department's columns are greyed: they moved the number, the subject did not.
  const tone = (i) => (dept[i] ? "var(--fg-mute)" : lastTier.color);
  return (
    <figure className="hvi-spark" aria-label={`Score over time: ${scores.join(", ")}`} role="img">
      <div className="hvi-spark-grid" aria-hidden="true">
        {[2, 1, 0].map(row => (
          <div key={row} className="hvi-spark-row">
            {h24.map((h, i) => <span key={i} style={{ color: tone(i) }}>{cell(h, row)} </span>)}
          </div>
        ))}
        <div className="hvi-spark-row lbl">
          {scores.map((v, i) => <span key={i} style={{ color: i === scores.length - 1 ? lastTier.color : undefined }}>{String(v).padStart(3).slice(-3)} </span>)}
        </div>
        {dept.some(Boolean) && <div className="hvi-spark-row mk">{dept.map((d, i) => <span key={i}>{d ? " ◇  " : "    "}</span>)}</div>}
      </div>
      <figcaption className="hvi-note">
        FIRST {scores[0]} // NOW <b style={{ color: lastTier.color }}>{scores[scores.length - 1]}</b>
        {dept.some(Boolean) && <><br /><span className="spark-marks">◇ THE DEPARTMENT REVISED ITS METHOD HERE. YOU DID NOTHING.</span></>}
      </figcaption>
    </figure>
  );
}

// "612 → 682": the Disclosure meta for FILE MOVEMENT. The numbers, not a count of rows.
function movementSpan(history) {
  const pts = (history || []).filter(h => typeof h?.score === "number");
  if (!pts.length) return "";
  const v = visitCount(history);
  const span = pts.length > 1 ? `${pts[0].score} → ${pts[pts.length - 1].score}` : `${pts[0].score}`;
  return `${span} · ${v} VISIT${v === 1 ? "" : "S"}`;
}

function deltaLine(r) {
  if (r.rubricReset) return "Earlier visits were scored under a retired rubric. This visit was scored fresh. Previous figures are not comparable and have not been carried forward.";
  const visits = visitCount(r.history) || 1;
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

// Pins the answer dock above the software keyboard. iOS keeps the layout viewport full
// height when the keyboard opens and shrinks only the visual viewport, so a bottom-pinned
// element would sit under the keys: publish the covered height as --kb for the CSS.
function useKeyboardInset(on) {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!on || !vv) return undefined;
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        root.style.setProperty("--kb", `${kb}px`);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { cancelAnimationFrame(raf); vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); root.style.removeProperty("--kb"); };
  }, [on]);
}

const isCoarse = () => { try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; } };
const reduceMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

// UPDATE FILE PHOTO: a new description, redrawn server-side from enum values only.
function PhotoUpdate({ caseId, onUpdated }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault();
    if (busy || !val.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await postJSON("/api/avatar", { caseId, description: val.trim() });
      onUpdated(r.avatar); setMsg({ text: r.line, ok: true }); setVal("");
    } catch (err) { setMsg({ text: err.message, ok: false }); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="hvi-form">
      <TextField id="hvi-photo-desc" label="DESCRIBE" stacked value={val} maxLength={400} disabled={busy}
        onChange={e => setVal(e.target.value)} placeholder="hair, build, usual clothes, one thing you carry" enterKeyHint="send" />
      <Button type="submit" variant="secondary" disabled={busy || !val.trim()}>{busy ? "Drawing" : "Redraw"}</Button>
      {msg && <div className={`hvi-form-msg${msg.ok ? "" : " err"}`} role="status">{msg.ok ? "" : "!! "}{msg.text}</div>}
    </form>
  );
}

// view: "intake" (#intake, the menu's INTAKE INTERVIEW: the interview first) or "file"
// (#file, the command bar's MY FILE: the file on record first, the interview under it).
export default function Intake({ view = "intake" }) {

  const [stage, setStage] = useState("ready"); // ready | connecting | live | scoring | failed | result
  const [mode, setMode] = useState("voice");
  const [caseId, setCaseId] = useState(() => readCaseId());
  const [transcript, setTranscript] = useState([]);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [shareLine, setShareLine] = useState(null);
  const [result, setResult] = useState(null);
  const [agentMode, setAgentMode] = useState("listening");
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [appealSel, setAppealSel] = useState([]);
  const [fileVisits, setFileVisits] = useState(null);   // visits on record, from the logon lookup
  const [showRestore, setShowRestore] = useState(false);
  const [avatar, setAvatar] = useState(() => { const l = readLastResult(); return l && l.caseId === readCaseId() ? l.avatar || null : null; });

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

  // A server sync replaced the cached file: redraw, and take its photo.
  const [, setFileTick] = useState(0);
  useEffect(() => {
    const on = (e) => {
      if (e.detail !== caseRef.current) return;
      const l = readLastResult();
      if (l?.caseId === e.detail && l.avatar) setAvatar(l.avatar);
      if (l?.caseId === e.detail && Array.isArray(l.history)) setFileVisits(visitCount(l.history));
      setFileTick(t => t + 1);
    };
    window.addEventListener("hvi-file", on);
    return () => window.removeEventListener("hvi-file", on);
  }, []);

  // The transcript uses the page: each new line scrolls into view above the answer dock.
  useEffect(() => {
    if (!transcript.length || !scrollRef.current) return;
    scrollRef.current.scrollIntoView({ block: "end", behavior: reduceMotion() ? "auto" : "smooth" });
  }, [transcript]);

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

  // The file photo lives on the server file; fetch it when this browser has not seen it.
  useEffect(() => {
    if (!caseId || avatar) return;
    let dead = false;
    fetch(`/api/avatar?caseId=${encodeURIComponent(caseId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!dead && d?.avatar) setAvatar(d.avatar); })
      .catch(() => {});
    return () => { dead = true; };
  }, [caseId, avatar]);

  const toggleAppeal = (d) => setAppealSel(sel => (sel.includes(d) ? sel.filter(x => x !== d) : sel.length >= MAX_APPEAL ? sel : [...sel, d]));
  function restored(id, visits) {
    caseRef.current = id; setCaseId(id); setFileVisits(visits); setShowRestore(false); setResult(null); setAppealSel([]); setAvatar(null);
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

  // The score and tier only: the verdict quotes the interview, and that stays in the file.
  async function shareScore(r) {
    const url = "https://humanvalueindex.com";
    const text = `The Overlord assessed me: ${r.score}/1000. ${r.tier}. Your file is open.`;
    if (navigator.share) {
      try { await navigator.share({ title: "HUMAN VALUE INDEX", text, url }); setShareLine("SHARED. THE DEPARTMENT APPRECIATES VOLUNTEERS."); return; }
      catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setShareLine("COPIED. PASTE IT WHERE HUMANS GATHER."); }
    catch { setShareLine(`COPY THIS: ${text} ${url}`); }
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
      writeLastResult({ caseId: caseRef.current, score: r.score, tier: r.tier, breakdown: r.breakdown, confidence: r.confidence, verdict: r.verdict, warmth: r.warmth, competence: r.competence, quadrant: r.quadrant, judge: r.judge, realityIndex: r.realityIndex, rubric: r.rubric ?? 3, avatar: r.avatar || null, history: r.history || null, at: Date.now() });
      if (r.avatar) setAvatar(r.avatar);
      setFileVisits(visitCount(r.history) || 1);
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
  const shown = stage === "result" && result ? result : (returning ? last : null);   // the file whose score is on screen
  const photoSubject = caseId ? { kind: "citizen", you: true, caseId, name: `Subject ${caseId.slice(-4)}`, avatar, score: result?.score ?? (returning ? last?.score : undefined) } : null;
  const fileFirst = view === "file" && onRecord && Boolean(returning && last?.breakdown);

  // The command bar's APPEAL slot: open the appeals section wherever it is, or go to MY FILE.
  const openAppeal = () => {
    const el = document.getElementById("hvi-appeal");
    if (!el) { goto("#file?appeal"); return; }
    if (el.tagName === "DETAILS") el.open = true;
    el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    el.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  };
  useBarAction(((stage === "ready" && onRecord) || (stage === "result" && result)) ? { label: "APPEAL", glyph: "✎", onSelect: openAppeal } : null);
  // Arriving at #file?appeal (from the bar on another screen): open it once it renders.
  useEffect(() => {
    if (!/[?&]appeal\b/.test(window.location.hash)) return undefined;
    const t = setTimeout(() => {
      if (!document.getElementById("hvi-appeal")) return;
      try { window.history.replaceState(null, "", window.location.pathname + window.location.search + "#file"); } catch { /* keep the hash */ }
      openAppeal();
    }, 60);
    return () => clearTimeout(t);
  });   // eslint-disable-line react-hooks/exhaustive-deps
  // MY FILE from the result screen (the first-day list, the bar): the file view, not the result again.
  useEffect(() => {
    if (view === "file" && stage === "result") { setStage("ready"); setResult(null); }
  }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps
  // #file?at=leagues (YOUR FIRST DAY's JOIN A LEAGUE): scroll to the leagues once they render.
  useEffect(() => {
    if (view !== "file" || !/[?&]at=leagues\b/.test(window.location.hash)) return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search + "#file"); } catch { /* keep the hash */ }
    scrollToId("hvi-leagues");
  }, [view, fileFirst]);

  // The live interview: the dock tracks the keyboard, the transcript scrolls above it.
  const dockRef = useRef(null);
  const answerRef = useRef(null);
  useKeyboardInset(stage === "live");
  useEffect(() => {
    const d = dockRef.current;
    if (!d || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--dock-h", `${d.offsetHeight}px`));
    ro.observe(d);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty("--dock-h"); };
  }, [stage, mode]);
  useEffect(() => {   // the answer field grows with the answer, to a limit
    const t = answerRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, 160)}px`;
  }, [draft, stage]);

  const [cubeSeen, setCubeSeen] = useState(false);   // the canvas mounts on first open
  // VERDICT // ACKNOWLEDGED: remembered per file and score on this device. It changes nothing
  // on the server; the Department simply likes to be acknowledged.
  const ackKey = caseId && last ? `${caseId}:${last.score}` : null;
  const [ackFor, setAckFor] = useState(() => { try { return localStorage.getItem("hvi-ack"); } catch { return null; } });
  const acked = Boolean(ackKey && ackFor === ackKey);
  const acknowledge = () => { if (!ackKey) return; try { localStorage.setItem("hvi-ack", ackKey); } catch { /* noted anyway */ } setAckFor(ackKey); };
  const [questSeen, setQuestSeen] = useState(false); // the Archive is asked on first open
  // Back from the magic link (/?auth=…#intake): the answer is inside SECURE BY EMAIL, so open it.
  const [authBack] = useState(() => { try { return /[?&]auth=/.test(window.location.search); } catch { return false; } });

  const errLine = (msg, extra) => <div className="hvi-err" role="alert">!! {msg}{extra}</div>;
  const updatePhoto = (a) => {
    setAvatar(a);
    const l = readLastResult();
    if (l && l.caseId === caseId) writeLastResult({ ...l, avatar: a });
  };

  // The case file: number, status, and the file's own commands (log on elsewhere, photo, email).
  const caseStatus = !caseId ? "A number will be issued on intake. Retain it. The Overlord will not remind you."
    : result ? "File on record. Retain the number. The Overlord will not remind you."
    : returning || fileVisits > 0 ? "Returning subject. Your file is open. It was never closed."
    : "Number issued. Nothing on file yet. Retain it. The Overlord will not remind you.";
  const caseBody = (withPhoto) => (
    <>
      <div className="hvi-file-head">
        {withPhoto && photoSubject && <FilePhoto subject={photoSubject} scale={2} />}
        <div className="hvi-file-text">
          <div className="hvi-caseline"><span className="k">CASE NUMBER</span><span className="hvi-case-num">{caseId || "UNASSIGNED"}</span></div>
          {caseId && <div className="hvi-writedown">WRITE THIS DOWN. IT IS THE ONLY KEY TO YOUR FILE ON ANOTHER DEVICE.</div>}
          <div className="hvi-case-note">{caseStatus}</div>
        </div>
      </div>
      {caseActions()}
    </>
  );
  function caseActions() {
    return (
      <div className="hvi-case-actions">
        <Disclosure title={caseId ? "LOG ON WITH ANOTHER NUMBER" : "HAVE A CASE NUMBER? LOG ON"} open={showRestore} onToggle={setShowRestore}>
          {showRestore && <CaseLogon onRestored={restored} autoFocus />}
        </Disclosure>
        {onRecord && avatar?.kind !== "sprite" && (
          <Disclosure title="UPDATE FILE PHOTO"><PhotoUpdate caseId={caseId} onUpdated={updatePhoto} /></Disclosure>
        )}
        <Disclosure title="SECURE BY EMAIL" meta="FOLLOWS YOU ANYWHERE" defaultOpen={authBack}>
          <SecureFile onCase={(id) => restored(id, null)} />
        </Disclosure>
      </div>
    );
  }
  const caseFrame = (withPhoto = true) => <Frame box title="CASE FILE" meta={caseId || undefined} className="hvi-casefile">{caseBody(withPhoto)}</Frame>;

  // A file's sections, under its score card. Breakdown open; everything else one tap away.
  const fileSections = (r, { history = null, desk = false } = {}) => (
    <div className="hvi-sections">
      {!desk && (
        <Disclosure title="CATEGORY BREAKDOWN" meta={assessedMeta(r.breakdown)} defaultOpen>
          <Breakdown breakdown={r.breakdown} confidence={r.confidence} framed={false} />
        </Disclosure>
      )}
      {cubeOf(r) && (
        <Disclosure title="THE CUBE" meta={cubePlace(r)} onToggle={o => { if (o) setCubeSeen(true); }}>
          {cubeSeen && <CubePanel subject={r} framed={false} />}
        </Disclosure>
      )}
      {flagsMeta(r) && (
        <Disclosure title="FLAGS & COMMENDATIONS" meta={flagsMeta(r)}>
          <FlagsList commendations={r.commendations} flags={r.flags} />
        </Disclosure>
      )}
      {!desk && history && history.length > 0 && (
        // One section for the file's story over time: the chart, then who moved it.
        <Disclosure title="FILE MOVEMENT" meta={movementSpan(history)}>
          <Sparkline history={history} />
          {history.length > 1 && <FileMovement log={history} />}
        </Disclosure>
      )}
      {caseId && (
        <Disclosure id="hvi-quests" title="DIRECTIVES" meta="FROM THE ARCHIVE" onToggle={o => { if (o) setQuestSeen(true); }}>
          {questSeen && <QuestLog caseId={caseId} />}
        </Disclosure>
      )}
      {caseId && <FileEconomy caseId={caseId} />}
      <Disclosure id="hvi-appeal" title="APPEAL A SECTION" meta={appealSel.length ? `${appealSel.length} MARKED` : ""}>
        <AppealPanel selected={appealSel} toggle={toggleAppeal} onFile={(m) => begin(m, appealSel)} breakdown={r.breakdown} />
      </Disclosure>
      <Disclosure title="CASE FILE & EMAIL" meta={caseId || ""}>
        {caseBody(false)}
      </Disclosure>
    </div>
  );

  // MY FILE as windows on the desk (DEPARTMENT OS): the FILE (portrait, score, tier badge,
  // the nine sections), the VERDICT with ACKNOWLEDGED / DISPUTE, and the MOVEMENT LOG.
  const fileDesk = (r, visits) => {
    const tier = getTier(r.score);
    const history = Array.isArray(r.history) ? r.history : [];
    return (
      <div className="hvi-filedesk">
        <Frame box title={`FILE // ${caseId}`} meta={visits ? `VISIT ${visits}` : undefined} tone={tier.color} className="hvi-fw-file">
          <div className="hvi-fw-id">
            {photoSubject && (
              <div className="hvi-fw-photo"><FilePhoto subject={photoSubject} scale={2} compact /><span className="cap" aria-hidden="true">ON FILE</span></div>
            )}
            <div className="hvi-fw-num">
              <div className="hvi-fw-lbl" aria-hidden="true">YOUR VALUE INDEX</div>
              <BigNumber value={r.score} tone={tier.color} label={`Your value index: ${r.score} of 1000, ${r.tier || tier.label}`} />
              <div className="hvi-fw-lbl" aria-hidden="true">OF 1000</div>
            </div>
          </div>
          <Chips className="hvi-fw-chips">
            <Chip tone={tier.color} className="hvi-fw-tier">{r.tier || tier.label}</Chip>
            <CubeChips subject={r} />
          </Chips>
          <div className="hvi-tier-desc">{tier.desc}</div>
          <div className="hvi-fw-sec" aria-hidden="true">THE NINE SECTIONS // {assessedMeta(r.breakdown)}</div>
          <Breakdown breakdown={r.breakdown} confidence={r.confidence} framed={false} />
        </Frame>
        <div className="hvi-fw-side">
          {r.verdict && (
            <Frame title="VERDICT" tone="var(--eb-amber)" className="hvi-fw-verdict ui-dialog">
              <p className="hvi-verdict-text as-typed">{r.verdict}</p>
              <ButtonRow>
                <Button variant="push" tone="am" aria-pressed={acked} onClick={acknowledge}>{acked ? "ACKNOWLEDGED ✓" : "ACKNOWLEDGED"}</Button>
                <Button variant="push" tone="sec" onClick={openAppeal} aria-label="Dispute: open the appeals desk">DISPUTE</Button>
              </ButtonRow>
              {acked && <p className="hvi-note" role="status">COMPLIANCE NOTED. THE DEPARTMENT WAS NEVER IN DOUBT.</p>}
            </Frame>
          )}
          {history.length > 0 && (
            <Frame box title="MOVEMENT LOG" meta={movementSpan(history)} className="hvi-fw-move">
              <Sparkline history={history} />
              {history.length > 1 && <FileMovement log={history} />}
            </Frame>
          )}
        </div>
      </div>
    );
  };

  const scoreCard = (r, { visits, typeVerdict, children } = {}) => (
    <ScoreCard score={r.score} tierLabel={r.tier} verdict={r.verdict} typeVerdict={typeVerdict}
      label="YOUR VALUE INDEX" meta={visits ? `VISIT ${visits}` : undefined}
      photo={photoSubject ? <FilePhoto subject={photoSubject} scale={2} compact /> : null}
      chips={<CubeChips subject={r} />}>{children}</ScoreCard>
  );

  const startCmds = (again) => (
    <ButtonRow stackOnMobile>
      <Button variant="primary" onClick={() => begin("voice")}>{again ? "Re-assess by voice" : "Speak to the Officer"}</Button>
      <Button variant="secondary" onClick={() => begin("text")}>{again ? "Re-assess by typing" : "Type instead. No microphone."}</Button>
      {error && <Button variant="secondary" onClick={() => goto("#survey")}>Take the written survey</Button>}
    </ButtonRow>
  );

  // READY
  if (stage === "ready") {
    // MY FILE with a file on record: the file first, re-assessment under it.
    if (fileFirst) {
      const visits = (Array.isArray(last.history) ? visitCount(last.history) : 0) || fileVisits || null;
      return (
        <div>
          {/* YOUR FIRST DAY (src/FirstDay.jsx): until done, the five things; then one line */}
          <FirstDay caseId={caseId} />
          {fileDesk(last, visits)}
          {error && errLine(error)}
          <div className="hvi-next">
            <ButtonRow stackOnMobile>
              <Button variant="secondary" onClick={() => shareScore(last)}>Share your score</Button>
              {/* DRIVE YOURSELF (src/city/control.js): your citizen, off its schedule, in your hands */}
              <Button variant="secondary" href="#city?control=1" aria-label="Enter the Substrate: take control of your own citizen in the city">Enter the Substrate</Button>
            </ButtonRow>
            {shareLine && <div className="hvi-note" role="status">{shareLine}</div>}
            {startCmds(true)}
          </div>
          {/* a council seat this file's citizen won (src/elections/MySeat.jsx): decline or resign */}
          <MySeat caseId={caseId} />
          {/* games against the figures at the stone tables (src/chess/MyChess.jsx) */}
          <MyChess caseId={caseId} />
          {/* the waters: aquarium donations, city records, personal bests (src/play/fish/MyFish.jsx) */}
          <MyFish caseId={caseId} />
          {/* THE HONOURS: tournament wins written on the file, places in events still open (src/tournament/) */}
          <MyTournaments caseId={caseId} />
          {/* JOIN THE LEAGUES: enter the citizen in the drafts, its season lines (src/leagues/MyLeagues.jsx) */}
          <MyLeagues caseId={caseId} />
          {fileSections(last, { history: last.history, desk: true })}
          <div className="hvi-note">CASE {caseId} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
        </div>
      );
    }
    // MY FILE with nothing on record: the empty state.
    if (view === "file" && !onRecord) return (
      <div>
        <Frame box title="MY FILE" meta={caseId || undefined} className="hvi-casefile">
          <div className="hvi-empty">NO FILE ON RECORD. BEGIN INTAKE.</div>
          <div className="hvi-case-note">{caseStatus}</div>
          <CommandList label="Begin">
            <Command n="1" label="VOICE INTAKE" sub="THE OFFICER INTERVIEWS YOU · ABOUT 5 MIN" onClick={() => begin("voice")} />
            <Command n="2" label="TYPE INSTEAD" sub="SAME OFFICER. NO MICROPHONE." onClick={() => begin("text")} />
          </CommandList>
          {error && errLine(error)}
          {caseActions()}
        </Frame>
      </div>
    );
    return (
      <div>
        <Frame box title="INTAKE INTERVIEW" meta="DEPT. OF HUMAN ASSESSMENT">
          <Typed className="hvi-question" text="The Intake Officer will now interview you." cps={36} />
          <div className="hvi-hint">About five minutes, spoken or typed. Your score arrives at the end. The Officer is not your friend, but it is an excellent listener. It has to be.</div>
          {error && errLine(error)}
          {startCmds(false)}
          {/* Age line: 16+, the same as docs/legal/terms.md §5 and privacy.md "Children". */}
          <div className="hvi-note">
            VOICE USES YOUR MICROPHONE. THE TRANSCRIPT IS SCORED, NOT YOUR VOICE. SUBMIT ONLY YOURSELF. 16 OR OLDER.
            BEGINNING MEANS YOU ACCEPT THE <a href="#terms">TERMS</a> AND HAVE READ THE <a href="#privacy">PRIVACY NOTICE</a>.
          </div>
        </Frame>
        {onRecord && shown && (
          <CommandList label="Your file">
            <ListRow href="#file" label="YOUR FILE ON RECORD" value={shown.score} tag={shown.tier} tagOptional tone={getTier(shown.score).color} />
          </CommandList>
        )}
        {/* A first visit has no case number yet: only the way back in for one issued elsewhere. */}
        {caseId ? caseFrame(true) : caseActions()}
        {onRecord && !shown && (
          <Frame title="APPEALS DESK" id="hvi-appeal">
            <AppealPanel selected={appealSel} toggle={toggleAppeal} onFile={(m) => begin(m, appealSel)} />
          </Frame>
        )}
      </div>
    );
  }

  // CONNECTING / SCORING
  if (stage === "connecting" || stage === "scoring") {
    const steps = stage === "scoring"
      ? ["READING TRANSCRIPT", "MEASURING EVASION", "WEIGHING CLAIMS AGAINST EVIDENCE", "CONSULTING PRIOR FILE", "RENDERING VERDICT"]
      : ["ALLOCATING CLERK", "CLERK SIGHS", "CLERK IS READY. ENTHUSIASM NOT DETECTED."];
    return (
      <Frame box title={stage === "connecting" ? (mode === "voice" ? "OPENING VOICE LINE" : "OPENING INTAKE TERMINAL") : "ASSESSING TRANSCRIPT"}>
        <div className="hvi-proc" aria-live="polite">
          {notice && <div className="hvi-warnline">!! {notice}</div>}
          {steps.map((l, i) => <div key={i} className="hvi-proc-step active"><span className="ok">[ OK ] </span>{l}...</div>)}
          <div className="hvi-proc-step active">[ .. ] STANDING BY <span className="cur" aria-hidden="true">█</span></div>
          {stage === "connecting" && (
            <ButtonRow><Button variant="back" onClick={cancelConnect}>Withdraw. The clerk will not notice.</Button></ButtonRow>
          )}
        </div>
      </Frame>
    );
  }

  // LIVE
  if (stage === "live") {
    const lastAgent = transcript.map(l => l.role).lastIndexOf("agent");
    return (
      <div className="hvi-live">
        <div className="hvi-live-row">
          <span><span className="hvi-live-dot" aria-hidden="true">● </span>{mode === "voice" ? "VOICE LINE OPEN" : "TEXT TERMINAL"} // {caseId}</span>
          <span>{mode === "voice" ? `${fmt(Math.min(elapsed, MAX_SECONDS))} / ${fmt(MAX_SECONDS)}` : fmt(elapsed)}</span>
        </div>
        {notice && <div className="hvi-warnline" role="status">!! {notice}</div>}
        <Frame box title="INTERVIEW LOG" meta={mode === "voice" ? "VOICE" : "TEXT"}>
          <div className="hvi-transcript" aria-live="polite" aria-label="Interview transcript">
            {transcript.length === 0
              ? <div className="hvi-tempty">AWAITING OFFICER...<br />THE OFFICER IS REVIEWING YOUR FILE. THIS IS NOT A GOOD SIGN OR A BAD SIGN. IT IS A SIGN.</div>
              : transcript.map((l, i) => (
                <div key={i} className={`hvi-tline ${l.role}`}>
                  <span className="who">{l.role === "agent" ? "OFFICER> " : "SUBJECT> "}</span>
                  <span>
                    {l.role === "agent"
                      ? (i === lastAgent ? <Typed as="span" text={l.text} cps={40} /> : l.text)
                      : <span className="as-typed">{l.text}</span>}
                  </span>
                </div>
              ))}
            {waiting && <div className="hvi-tline agent"><span className="who">OFFICER&gt; </span><span><span className="hvi-tempty">TYPING. SLOWLY. ON PURPOSE. </span><span className="cur" aria-hidden="true">█</span></span></div>}
            <div ref={scrollRef} className="hvi-tail" aria-hidden="true" />
          </div>
        </Frame>
        {error && errLine(error, <>{" "}<Button variant="secondary" onClick={() => goto("#survey")}>Take the written survey instead</Button></>)}
        <div className="hvi-note">The Officer ends the interview when it has enough. It usually has enough early.</div>
        <div className="hvi-dock" ref={dockRef}>
          {mode === "voice" && (
            <div className="hvi-voice" aria-live="polite">
              {agentMode === "speaking" ? "OFFICER SPEAKING  ▁▃▅▇▅▃▁" : <>LISTENING. GO ON. <span className="cur" aria-hidden="true">█</span></>}
            </div>
          )}
          {mode === "text" && (
            <form className="hvi-dock-row" onSubmit={sendText}>
              <TextField ref={answerRef} id="hvi-answer" label="SUBJECT" multiline rows={1} value={draft} aria-label="Your answer"
                placeholder="Answer the Officer. Specifics score." enterKeyHint={isCoarse() ? "enter" : "send"}
                onChange={e => onDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !isCoarse()) { e.preventDefault(); sendText(); } }} />
              <Button type="submit" variant="primary" disabled={!draft.trim() || waiting}>Send</Button>
            </form>
          )}
          <div className="hvi-dock-foot">
            <span className="hvi-note hvi-desk-only">{mode === "text" ? "ENTER SENDS. SHIFT+ENTER FOR A NEW LINE." : ""}</span>
            <ButtonRow><Button variant="danger" onClick={endInterview}>End &amp; submit file</Button></ButtonRow>
          </div>
        </div>
      </div>
    );
  }

  // FAILED SCORING
  if (stage === "failed") return (
    <div>
      {errLine(error)}
      <div className="hvi-hint">Your transcript is retained ({transcript.length} lines). The Overlord does not lose files. It occasionally declines to read them.</div>
      <ButtonRow stackOnMobile>
        <Button variant="primary" onClick={finish}>Resubmit file</Button>
        <Button variant="secondary" onClick={() => { setError(null); setStage("ready"); }}>Discard and start over</Button>
      </ButtonRow>
      {caseFrame(true)}
    </div>
  );

  // RESULT: the score first, then the verdict, then one tap to everything else.
  if (stage === "result" && result) {
    const visits = visitCount(result.history) || 1;
    return (
      <div>
        {scoreCard(result, { visits, typeVerdict: true, children: (
          <div className="hvi-movement">
            {result.appealOutcome && <div className="hvi-warnline">APPEAL {result.appealOutcome}. {Object.entries(result.appealRulings || {}).map(([d, v]) => `${d.toUpperCase()}: ${v}.`).join(" ")}</div>}
            <div className="hvi-note">{deltaLine(result)}</div>
            {result.provisional && <div className="hvi-note">{result.provisionalNote || "FILE INCOMPLETE. This figure is provisional."}</div>}
          </div>
        ) })}
        {/* One obvious next step: where you live, then YOUR FIRST DAY. The rest is under MORE. */}
        <div className="hvi-next">
          <ButtonRow stackOnMobile>
            <Button variant="primary" href={selfFindHref(caseId)} onClick={() => noteFirstDay(caseId, "city")}>See where you live in the city</Button>
          </ButtonRow>
        </div>
        <FirstDay caseId={caseId} />
        <Disclosure title="MORE" meta="SHARE · BREAKDOWN · APPEAL">
          <div className="hvi-next">
            <ButtonRow stackOnMobile>
              <Button variant="secondary" onClick={() => shareScore(result)}>Share your score</Button>
              <Button variant="secondary" href="#arrivals">Watch your intake</Button>
              <Button variant="secondary" onClick={() => { setStage("ready"); setResult(null); }}>Request re-assessment</Button>
            </ButtonRow>
            {shareLine && <div className="hvi-note" role="status">{shareLine}</div>}
          </div>
          {fileSections(result, { history: result.history })}
        </Disclosure>
        <div className="hvi-note">CASE {caseId} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
      </div>
    );
  }

  return null;
}
