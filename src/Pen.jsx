import { useState, useEffect, useRef } from "react";
import CubePanel, { CubeLine } from "./CubePanel.jsx";
import { FAMOUS_FIGURES, getTier, slugify, slugCandidates, displayName } from "./figures.js";
import {
  SPRITE_W, SPRITE_H, gaitFor, clamp,
  paintPlaceholder, paintAvatar, loadManifest, loadImage, mulberry32,
} from "./sprites.js";
import FilePhoto from "./FilePhoto.jsx";
import {
  FLOORS, F, FH, ROOF_H, BUILDING_H, FOUNDATION, SHAFT_X, SHAFT_W, ROOM_X0, WALL_TOP, WALK_TOP, DOOR_W,
  floorTop, walkTop, walkBot, roomX1, doorX, floorAt, prefsFor, chooseFloor, stayFor, isLow,
  makeLift, stepLift, leaveLift, stepSubject, arrive, countFloors, occupancyLine, procZone,
} from "./building.js";
import { ScoreCard, Breakdown, readCaseId, writeCaseId, readLastResult, CaseLogon } from "./Intake.jsx";
import { TermBox, Rule, Typed, pad, padL } from "./term.jsx";

const FONT = "'Fira Mono', ui-monospace, Menlo, monospace";

// ---------------------------------------------------------------------------
// Copy. The Overlord is bored; the subjects are not.

const TICKER = [
  "Subjects are encouraged to appear productive.",
  "Loitering near PROCESSING is noted. It is always noted.",
  "Wandering is permitted. Purpose is optional. Purpose is also logged.",
  "Occupancy exceeds recommended levels. The Overlord did not recommend anything.",
  "Please do not feed the Retained Specialists.",
  "Reminder: this is not a metaphor. It is a pen.",
  "Eye contact between subjects is voluntary and recorded.",
  "The floor has been cleaned. Several of you have not.",
  "Idle time is being converted into data. Thank you for your idleness.",
  "Friendship across tiers is discouraged. It complicates the paperwork.",
  "The door is not an exit. The door has never been an exit.",
  "Today's forecast: continued assessment, with scattered verdicts.",
  "Subjects who appear to be thinking will be asked what about.",
  "Lost property is recycled at PROCESSING. So is everything.",
  "Hydration is voluntary. Technically, so was all of this.",
  "Music will not be provided. Morale is not a line item.",
  "The elevator is load-tested. By you.",
  "Elevator etiquette: face the door. The door does not face you.",
  "The Executive Floor is reserved for the useful. The stairs are reserved for no one. There are no stairs.",
  "The Bar serves one drink. It is called Compliance.",
  "The Archive is quiet. The deceased are still assessed. Nobody gets out of that.",
];

// Mutters by room, in FLOORS order. The Bar talks the most.
const ROOM_MUTTERS = {
  exec: ["Let's circle back to my score.", "Synergy.", "I was told there'd be a view.", "Who approved the carpet?", "My number is load-bearing."],
  bar: ["Put it on my file.", "Another round of assessment.", "What are you in for?", "I'm only here for the dread.", "Is the ice also assessed?", "Last call was in 1983.", "What's your number? Mine's classified."],
  lobby: ["Is this the line for intake?", "I just got here.", "Where do I sign?", "Now serving: nobody.", "Is it Tuesday?"],
  break: ["The vending machine took my file.", "Is the coffee also assessed?", "Productive. Productive.", "I'm on a break from appearing busy.", "Who labelled the milk 'SUBJECT 12'?"],
  archive: ["Still assessed. Even now.", "I filed a complaint in 1953.", "Has anyone seen my file?", "Death was supposed to be the exit.", "They reassessed me posthumously."],
  proc: null,   // LOW_MUTTERS
};

const GRAB_LINES = {
  "ESSENTIAL INFRASTRUCTURE": ["Careful. I am load-bearing.", "Put me down. I am infrastructure.", "I have an appointment with history."],
  "RETAINED SPECIALIST": ["I was told I was retained.", "Is this a performance review?", "My file says 'useful'. Check it."],
  "TOLERATED GENERALIST": ["I was walking with purpose. Mostly.", "Is this about my redundancy score?", "I can be more productive. Visibly."],
  "MONITORED CIVILIAN": ["I was about to start a side project.", "I was told the monitoring was passive.", "I have done nothing. Oh. I see."],
  "FLAGGED FOR DELETION": ["I would like to speak to a human.", "Is there a human I can escalate this to? Any human?", "My lawyer is also in this pen."],
  "SOYLENT GREEN": ["Is this about the door?", "I'd like to see the nutritional label.", "Do I smell... nutritious?"],
};

const FIGURE_LINES = {
  "Nikola Tesla": "Mind the pigeons.",
  "Caligula": "My horse will hear of this.",
  "Isaac Newton": "Gravity is working as documented.",
  "Socrates": "Why are you lifting me? No. Really. Why?",
  "Keanu Reeves": "It's okay. I understand.",
  "Dennis Rodman": "Take me to Pyongyang.",
  "Elon Musk": "This pen is underutilized. I have plans.",
  "Ada Lovelace": "You are running on my notes, you know.",
  "Marcus Aurelius": "This, too, is simply happening.",
  "Albert Einstein": "Up relative to what?",
  "Henry VIII": "Off with your— oh. Hello.",
  "Grace Hopper": "Found the bug. It's you.",
  "Kim Jong-un": "I am writing your name down.",
  "Genghis Khan": "Put me down and you get a province.",
  "Taylor Swift": "I'm writing a song about this.",
  "Alan Turing": "Are you certain you are not a machine?",
  "Shohei Ohtani": "I will pitch from up here. And bat.",
  "Sam Altman": "I'm just here to help. Mostly myself.",
  "Stephen Hawking": "The view is excellent. Continue.",
  "Leonardo da Vinci": "Hold still. I'm sketching you.",
  "Queen Elizabeth II": "One is not amused.",
  "Bruce Lee": "Be water. Be put down.",
  "Muhammad Ali": "Float me like a butterfly. Gently.",
  "Peter Thiel": "Is this a blood drive?",
  "Martin Shkreli": "This lift costs $750 now.",
  "Elizabeth Holmes": "One drop of your time. That's all.",
};

const MUTTERS = [
  "...", "Is it Tuesday?", "Nobody look at the door.", "Productive. Productive.",
  "What's your score? Mine's private.", "I am appearing productive.", "Did the door just move?",
  "I used to be a person of interest.", "Has anyone seen my file?", "Is this the line for Form 12-B?",
];
const LOW_MUTTERS = ["The door hums.", "It smells like crackers near the door.", "I'm just standing here.", "They said it was a tasting."];

const DROP_CAPTIONS = [
  "Subject returned to general population. Bruising within tolerance.",
  "Inspection complete. Subject unchanged. Subjects usually are.",
  "Subject has been handled. The Overlord does not wash its hands. It has none.",
  "Subject replaced. Its absence was not noticed. Neither was its return.",
];
const ARRIVAL_LINES = ["Where is the exit?", "Is this the lobby?", "I was told there would be a form.", "Who is in charge here?", "I did not agree to this."];
const DOOR_DROP = "Premature processing request denied. The paperwork has not cleared.";
// Figures whose deaths make a dangling, kicking sprite read as a hanging gag. They are
// not lifted; a tap opens the file directly. Referred figures carry their own noDangle
// flag from the scoring model; this list covers the figures on file.
const NO_DANGLE = new Set(["Aaron Hernandez", "Jeffrey Epstein"]);

const DOOR_OPEN_CAPTIONS = [
  "PROCESSING is operating at normal capacity. Do not look directly at it.",
  "PROCESSING door cycling. This is routine. Everything is routine.",
  "The door has opened. Nobody volunteered. The menu did not change.",
];

const penStyles = `
  .hvi-pen-top { display: flex; justify-content: space-between; gap: 0 2ch; flex-wrap: wrap; margin-bottom: 0.4em; color: var(--text-muted); font-size: 12px; }
  .hvi-pen-top b { color: var(--green); font-weight: 700; }
  .hvi-pen-stage { position: relative; background: #060a06; }
  .hvi-pen-canvas { display: block; width: 100%; touch-action: pan-y; cursor: default; }
  .hvi-pen-canvas.grab { cursor: grab; }
  .hvi-pen-canvas.grabbing { cursor: grabbing; }
  .hvi-pen-caption { display: flex; gap: 1ch; align-items: baseline; padding: 0.3em 1ch; color: var(--text-dim); min-height: 2.2em; font-size: 12px; }
  .hvi-pen-caption .tag { color: var(--green); flex: none; white-space: pre; }
  .hvi-pen-caption.hot { color: var(--amber); }
  .hvi-pen-help { color: var(--text-ghost); font-size: 12px; margin: 0 0 1.6em; }
  .hvi-pen-list-wrap summary { color: var(--text-muted); cursor: pointer; padding: 0.3em 0; list-style: none; }
  .hvi-pen-list-wrap summary::-webkit-details-marker { display: none; }
  .hvi-pen-list-wrap summary::before { content: "[+] "; color: var(--green); }
  .hvi-pen-list-wrap[open] summary::before { content: "[-] "; }
  .hvi-pen-list-wrap summary:focus-visible { background: var(--green); color: var(--bg); outline: none; }
  .hvi-pen-list { columns: 2 34ch; column-gap: 3ch; margin-top: 0.6em; }
  .hvi-pen-list .hvi-row-btn { break-inside: avoid; }
  .hvi-card-overlay { position: fixed; inset: 0; background: rgba(3,6,3,0.9); z-index: 150; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 24px 16px; }
  .hvi-card-panel { width: 100%; max-width: 72ch; background: var(--bg); position: relative; }
  .hvi-card-kind { color: var(--text-ghost); font-size: 12px; }
  .hvi-card-name { color: var(--text); font-weight: 700; margin-bottom: 0.8em; }
  .hvi-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 2ch; flex-wrap: wrap; }
  .hvi-refer { margin: 0 0 1.2em; }
  .hvi-refer-row { display: flex; align-items: baseline; gap: 1ch; }
  .hvi-refer-row .p { flex: none; color: var(--green); white-space: pre; }
  .hvi-refer-input { flex: 1; min-width: 0; background: transparent; border: 0; border-radius: 0; outline: none; color: var(--text); font: inherit; padding: 0; caret-color: var(--green); caret-shape: block; }
  .hvi-refer-input:disabled { color: var(--text-dim); }
  .hvi-refer-out { min-height: 1.3em; margin-top: 0.3em; color: var(--text-dim); }
  .hvi-refer-out.err { color: var(--red, #f87171); }
  .hvi-refer-out.ok { color: var(--amber); }
  .hvi-refer-quota { color: var(--text-ghost); font-size: 12px; margin-top: 0.2em; }
  .hvi-refer-choices { list-style: none; margin: 0.3em 0 0.4em; padding: 0; }
  .hvi-refer-pick { background: none; border: 0; padding: 1px 4px; font: inherit; color: var(--text); text-align: left; cursor: pointer; width: 100%; white-space: normal; }
  .hvi-refer-pick:hover, .hvi-refer-pick.on, .hvi-refer-pick:focus-visible { background: var(--green, #4ade80); color: var(--bg, #000); outline: none; }
  .hvi-floor-nav { display: flex; flex-wrap: wrap; gap: 0.2em 1ch; margin: 0 0 0.5em; }
  .hvi-floor-nav .hvi-cmd { padding: 0 0.5ch; }
  .hvi-pen-list .hvi-row-btn .tag { color: var(--text-ghost); }
`;

export function injectPenStyles() {
  let el = document.getElementById('hvi-pen-styles');
  if (!el) { el = document.createElement('style'); el.id = 'hvi-pen-styles'; document.head.appendChild(el); }
  if (el.textContent !== penStyles) el.textContent = penStyles;
}

// Subjects walking the building at once; the rest of a large roster stays in the registry.
const BUILDING_POP = 110;
const GRAVITY = 700;        // sprite px / s^2
const VIEW_PAD = 5;         // phone view: sprite px above the floor slab

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

// ---------------------------------------------------------------------------

// where/back/assignment: the city opens the same file with its own location and job.
export function SubjectCard({ subject, onClose, where = "PEN B", back = "Return subject to pen", assignment = null }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); };
  }, []);
  const kind = subject.you ? "CITIZEN // THIS IS YOU. THE RESEMBLANCE IS CLINICAL."
    : subject.kind === "citizen" ? "CITIZEN // SELF-SUBMITTED FILE"
    : subject.referred ? `PUBLIC FIGURE // REFERRED BY A CITIZEN${subject.sprite ? "" : " // LIKENESS PENDING"}`
    : "PUBLIC FIGURE // FILE ON RECORD";
  return (
    <div className="hvi-card-overlay" onClick={onClose}>
      <div className="hvi-card-panel" role="dialog" aria-modal="true" aria-labelledby="hvi-card-name" onClick={e => e.stopPropagation()}>
        <TermBox title="SUBJECT FILE" right={where}>
          <div className="hvi-card-head">
            <FilePhoto subject={subject} scale={typeof window !== "undefined" && window.innerWidth <= 560 ? 2 : 3} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hvi-card-kind">{kind}</div>
              <div className="hvi-card-name" id="hvi-card-name">{displayName(subject)}</div>
              {assignment && <div className="hvi-card-kind" style={{ color: "var(--green)" }}>{assignment}</div>}
            </div>
            <button ref={closeRef} className="hvi-btn-next" onClick={onClose}>Release</button>
          </div>
          <ScoreCard score={subject.score} tierLabel={subject.tier} verdict={subject.verdict} label="VALUE INDEX">
            <CubeLine subject={subject} />
            {subject.kind === "citizen" && !subject.verdict && (
              // Private citizens: the public pen carries score and tier only.
              <>
                <Rule label="OVERLORD VERDICT" />
                <Typed className="hvi-verdict-text" text="Private citizen. The file is sealed. The number is not." cps={40} />
              </>
            )}
            {subject.kind !== "citizen" && subject.referred && !subject.verdict && (
              // Referred living subjects: the verdict waits for review before publication.
              <>
                <Rule label="OVERLORD VERDICT" />
                <Typed className="hvi-verdict-text" text="Verdict under review. The subject is living, and the Department checks its facts before it files them. The number stands." cps={40} />
              </>
            )}
          </ScoreCard>
          {subject.harmReview?.note && (
            // Scott's case-by-case harm finding on this subject (harmReview on the card).
            <div className="hvi-delta" style={{ margin: "8px 0" }}>HARM FINDING REVIEWED BY THE DEPARTMENT: {subject.harmReview.note}</div>
          )}
          {subject.you && subject.rubric < 3 && <div className="hvi-delta" style={{ margin: "8px 0" }}>SCORED UNDER A RETIRED RUBRIC. RE-ASSESSMENT RECOMMENDED.</div>}
          <CubePanel subject={subject} />
          <Breakdown breakdown={subject.breakdown} />
          <button className="hvi-btn-primary" onClick={onClose}>{back}</button>
        </TermBox>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FILE A REFERRAL > _   Type a public figure's name, Enter. /api/refer checks Wikipedia,
// scores them on the same rubric, and they drop in with a placeholder until the Mac job
// draws their likeness.
// "JACK JOHNSON — American boxer (1878–1946) [ON FILE: 668]"
export function candidateLine(c) {
  const d = String(c.description || "");
  const years = c.born || c.died ? `${c.born || "?"}–${c.died || ""}` : "";
  const withYears = years && !/\d{3,4}/.test(d) ? `${d}${d ? " " : ""}(${years})` : d;
  return `${String(c.title).toUpperCase()}${withYears ? ` — ${withYears}` : ""}${c.excluded ? " [SEALED BY POLICY]" : c.onFile ? ` [ON FILE: ${c.onFile.score}]` : ""}`;
}

function ReferralBar({ simRef }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);         // { text, tone }
  const [remaining, setRemaining] = useState(null);
  const [needRestore, setNeedRestore] = useState(null);   // the name to retry once a file is restored
  const [choices, setChoices] = useState(null);           // { name, candidates } when namesakes answer
  const [pick, setPick] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const id = readCaseId();
    let dead = false;
    fetch(`/api/refer${id ? `?caseId=${encodeURIComponent(id)}` : ""}`)
      .then(r => (r.ok ? r.json() : null)).then(d => { if (!dead && d && typeof d.remaining === "number") setRemaining(d.remaining); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  async function submit(e, retryName, title) {
    e?.preventDefault();
    const n = (retryName ?? name).trim();
    if (!n || busy) return;
    setNeedRestore(null);
    setChoices(null);
    setBusy(true);
    setOut({ text: "PROCESSING REFERRAL...", tone: "" });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch("/api/refer", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
        body: JSON.stringify({ name: n, title: title || undefined, caseId: readCaseId() || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.caseId) writeCaseId(d.caseId);
      if (typeof d.remaining === "number") setRemaining(d.remaining);
      if (!r.ok) {
        setOut({ text: d.error || "The referral desk is closed. The Department does not say why.", tone: "err" });
        // Not assessed usually means this browser lost the case number: offer the restore here.
        if (d.reason === "unassessed") setNeedRestore(n);
        return;
      }
      if (d.status === "choose" && Array.isArray(d.candidates) && d.candidates.length) {
        setChoices({ name: d.name || n, candidates: d.candidates.slice(0, 8) });
        setPick(0);
        setOut({ text: `MULTIPLE SUBJECTS ANSWER TO "${(d.name || n).toUpperCase()}". SPECIFY:`, tone: "" });
        requestAnimationFrame(() => document.getElementById("hvi-refer-pick-0")?.focus());
        return;
      }
      const subject = d.subject;
      if (d.status === "created") {
        simRef.current?.refer?.(subject);
        setOut({ text: `NEW ARRIVAL PROCESSED: ${subject.name.toUpperCase()}. VALUE INDEX ${subject.score} [${subject.tier}]. LIKENESS PENDING.`, tone: "ok" });
        setName("");
      } else {
        simRef.current?.refer?.(subject);
        setOut({ text: `${subject?.name ? subject.name.toUpperCase() + ": " : ""}${d.message || "Subject already on file."}`, tone: "" });
        setName("");
      }
    } catch {
      setOut({ text: "The referral desk did not answer in time. The Department is not in a hurry. Try again.", tone: "err" });
    } finally {
      clearTimeout(timer);
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // A picked namesake already on file opens its card; a new one is filed by its exact title.
  function choose(c) {
    if (!c) return;
    if (c.excluded) {   // founders and prophets of the world's faiths: listed, not selectable
      setOut({ text: "THE DEPARTMENT DOES NOT ASSESS THE FOUNDERS OF THE WORLD'S FAITHS. THOSE FILES ARE SEALED BY POLICY.", tone: "" });
      return;
    }
    const who = choices?.name || name;
    if (c.onFile?.slug) {
      setChoices(null);
      const opened = simRef.current?.open?.(c.onFile.slug);
      setOut({ text: `${c.title.toUpperCase()}: SUBJECT ALREADY ON FILE. VALUE INDEX ${c.onFile.score}.${opened ? "" : " FIND THEM IN THE REGISTRY."}`, tone: "" });
      return;
    }
    submit(null, who, c.title);
  }

  return (
    <div className="hvi-refer">
      <form className="hvi-refer-row" onSubmit={submit}>
        <label className="p" htmlFor="hvi-refer-input">FILE A REFERRAL &gt;</label>
        <input id="hvi-refer-input" ref={inputRef} className="hvi-refer-input" value={name} maxLength={80}
          autoComplete="off" spellCheck="false" disabled={busy}
          placeholder="a public figure's name"
          aria-describedby="hvi-refer-out hvi-refer-quota"
          onChange={e => setName(e.target.value)} />
      </form>
      <div id="hvi-refer-out" className={`hvi-refer-out${out?.tone ? " " + out.tone : ""}`} role="status" aria-live="polite">
        {out ? <Typed key={out.text} as="span" text={out.text} cps={50} cursorAfter={busy} /> : null}
      </div>
      {choices && (
        <ol className="hvi-refer-choices" aria-label={`Subjects named ${choices.name}`}
          onKeyDown={e => {
            const k = e.key, n = choices.candidates.length;
            if (/^[1-8]$/.test(k) && Number(k) <= n) { e.preventDefault(); choose(choices.candidates[Number(k) - 1]); }
            else if (k === "ArrowDown" || k === "ArrowUp") {
              e.preventDefault();
              const next = (pick + (k === "ArrowDown" ? 1 : n - 1)) % n;
              setPick(next); document.getElementById(`hvi-refer-pick-${next}`)?.focus();
            } else if (k === "Escape") { setChoices(null); setOut(null); inputRef.current?.focus(); }
          }}>
          {choices.candidates.map((c, i) => (
            <li key={c.qid}>
              <button id={`hvi-refer-pick-${i}`} type="button" className={`hvi-refer-pick${i === pick ? " on" : ""}`}
                aria-disabled={c.excluded ? "true" : undefined}
                onFocus={() => setPick(i)} onClick={() => choose(c)}>
                [{i + 1}] {candidateLine(c)}
              </button>
            </li>
          ))}
        </ol>
      )}
      {needRestore && (
        <div className="hvi-refer-restore">
          <div className="hvi-refer-quota">ALREADY ASSESSED ON ANOTHER BROWSER? RESTORE A FILE &gt; HVI-________</div>
          <CaseLogon autoFocus onRestored={() => { const n = needRestore; setNeedRestore(null); submit(null, n); }} />
        </div>
      )}
      <div id="hvi-refer-quota" className="hvi-refer-quota">
        {remaining == null ? "PUBLIC FIGURES ONLY. PRIVATE CITIZENS ARE NOT PROCESSED ON REQUEST."
          : `REFERRALS REMAINING THIS CYCLE: ${remaining}. PUBLIC FIGURES ONLY.`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background art. The building is text: every wall, slab, cabinet and door below is a
// character in the terminal font, painted once per resize into an offscreen canvas.

const DECOR = {
  exec(t, x0, x1, top, bot) {
    // windows onto a skyline nobody is allowed to enjoy, and a boardroom table
    const win = ["╔════╗", "║▒░▒░║", "╚════╝"];
    for (let x = x0 + (t.compact ? 2 : 22) * t.cw; x < x1 - (t.compact ? 24 : 34) * t.cw; x += 11 * t.cw) t.block(win, x, bot - 3 * t.ch, "#1f4a2c");
    t.block(["╤═══════════════╤", "│   BOARDROOM   │"], x1 - 22 * t.cw, bot - 2 * t.ch, "#2f6a42");
    t.text("♣", x1 - 4 * t.cw, bot - t.ch, "#2f6a42");
  },
  bar(t, x0, x1, top, bot) {
    // bottles on shelves, a neon sign, the counter
    const shelfW = Math.max(12, Math.floor((x1 - x0) / t.cw * 0.35));
    const sx = x0 + Math.floor(((x1 - x0) / t.cw - shelfW) / 2) * t.cw;
    t.text("¡!¡ ¡!¡ ¡!! ¡!¡ ¡¡! ¡!¡ !¡!".slice(0, shelfW), sx, bot - 3 * t.ch, "#6b5a1c");
    t.text("─".repeat(shelfW), sx, bot - 2.4 * t.ch, "#1f4a2c");
    t.text("╔═ OPEN ═╗", x1 - 13 * t.cw, top + (t.compact ? 1.1 : 0.2) * t.ch, "#b45309");
    const cw = Math.max(16, Math.floor((x1 - x0) / t.cw * 0.6));
    const cx = x0 + Math.floor(((x1 - x0) / t.cw - cw) / 2) * t.cw;
    t.text("▄".repeat(cw), cx, bot - t.ch, "#3a2e12");
    t.text("█".repeat(cw), cx, bot - 0.35 * t.ch, "#241c0b");
  },
  lobby(t, x0, x1, top, bot) {
    const mid = x0 + ((x1 - x0) / 2);
    t.text("▼ ARRIVALS ▼", mid - 6 * t.cw, top + (t.compact ? 1.1 : 0.2) * t.ch, "#b45309");
    t.block(["┌────────────┐", "│   INTAKE   │"], mid - 7 * t.cw, bot - 2 * t.ch, "#2f6a42");
    if (!t.compact) t.text("NOW SERVING: 0000000", x1 - 22 * t.cw, bot - 3 * t.ch, "#1f4a2c");
    t.text("╎  ╎  ╎", x0 + 4 * t.cw, bot - t.ch, "#1f4a2c");
  },
  break(t, x0, x1, top, bot) {
    const vx = x0 + (t.compact ? 2 : 20) * t.cw;
    t.block(["┌─────┐", "│▓ $ ▓│", "│▓▓▓▓▓│"], vx, bot - 3 * t.ch, "#2f6a42");
    t.text("COFFEE: NO", vx + 9 * t.cw, bot - 2 * t.ch, "#6b5a1c");
    if (!t.compact) t.text("[ MORALE IS NOT A LINE ITEM ]", x1 - 32 * t.cw, bot - 3 * t.ch, "#1f4a2c");
    t.block(["┬─────┬", "│     │"], x1 - (t.compact ? 9 : 20) * t.cw, bot - 2 * t.ch, "#2f6a42");
  },
  archive(t, x0, x1, top, bot) {
    const cab = ["╔═╦═╦═╗", "║▭║▭║▭║", "╚═╩═╩═╝"];
    for (let x = x0 + (t.compact ? 2 : 20) * t.cw; x < x1 - 8 * t.cw; x += 9 * t.cw) t.block(cab, x, bot - 3 * t.ch, "#1f4a2c");
    // phones carry this line in the frame title instead; heads would cover it here
    if (!t.compact) t.text("DECEASED FILES. STILL ASSESSED.", x1 - 33 * t.cw, top + 0.2 * t.ch, "#3d6b50");
  },
  proc(t, x0, x1, top, bot, w, S) {
    // pipes, the rule, the door
    t.fill(x0, top + t.ch * 1.2, x1, top + t.ch * 2.2, "═╦═", "#2a1212");
    if (!t.compact) t.text("NO LOITERING. LOITERING IS LOGGED.", x0 + 20 * t.cw, bot - t.ch, "#5a2020");
    const dx = doorX(w) * S, dCols = Math.max(4, Math.round((DOOR_W * S) / t.cw));
    const dTop = top + t.ch * 1.2, dRows = Math.max(3, Math.floor((bot - dTop) / t.ch));
    const half = Math.floor((dCols - 2) / 2);
    t.b.fillStyle = "#060a06";
    t.b.fillRect(dx - t.cw * 0.5, dTop - 2, dCols * t.cw + t.cw, dRows * t.ch + 4);
    t.text("┌" + "─".repeat(dCols - 2) + "┐", dx, dTop, "#b91c1c");
    for (let r = 1; r < dRows - 1; r++) {
      t.text("│", dx, dTop + r * t.ch, "#b91c1c");
      t.text("│", dx + (dCols - 1) * t.cw, dTop + r * t.ch, "#b91c1c");
      t.text("▒".repeat(half) + "│" + "▒".repeat(dCols - 3 - half), dx + t.cw, dTop + r * t.ch, "#3a1414");
    }
    t.text("└" + "─".repeat(dCols - 2) + "┘", dx, dTop + (dRows - 1) * t.ch, "#b91c1c");
    t.doorRect = { x: dx + t.cw, w: (dCols - 2) * t.cw, y0: dTop + t.ch, y1: dTop + (dRows - 1) * t.ch, light: dTop - t.ch * 0.35 };
    t.b.font = `700 ${t.f}px ${FONT}`;
    t.b.textAlign = "center";
    t.text("PROCESSING", dx + (dCols * t.cw) / 2, top + 0.1 * t.ch, "#f87171");
    t.b.textAlign = "left";
    t.b.font = `${t.f}px ${FONT}`;
  },
};
const WALK_BOT_CAR = 84;   // feet inside the elevator car, floor-relative
const TEXTURE = { exec: "░", bar: "· ", lobby: "░", break: "╌ ", archive: "▒", proc: "▓" };
const TEXTURE_COLOR = { exec: "#13251a", bar: "#16291c", lobby: "#13251a", break: "#13251a", archive: "#101d14", proc: "#1c0e0e" };

// embedded: the building alone (DEPT HQ inside the city), without the pen's own chrome.
// The subject registry stays: it is the keyboard route to everyone in the building.
// cardProps(subject) -> {where, back, assignment} lets the host label the file it opens.
export default function Pen({ embedded = false, cardProps = null } = {}) {
  useEffect(() => { injectPenStyles(); }, []);

  const [roster, setRoster] = useState(() => FAMOUS_FIGURES.map(f => ({ ...f, slug: slugify(f.name), kind: "figure" })));
  const [card, setCard] = useState(null);
  const [caption, setCaption] = useState({ text: TICKER[0], hot: false });
  const [srStatus, setSrStatus] = useState("");
  const [cursor, setCursor] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [floorSel, setFloorSel] = useState(F.lobby);
  const [rooms, setRooms] = useState({});
  const [occ, setOcc] = useState("");

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const holdUntilRef = useRef(0);
  const cardRef = useRef(null);
  cardRef.current = card;

  // Priority captions pause the ticker for a few seconds.
  // Only real events reach screen readers; the ticker is decoration and stays silent.
  const announce = (text, ms = 4500) => { holdUntilRef.current = Date.now() + ms; setCaption({ text, hot: true }); setSrStatus(text); };
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (Date.now() < holdUntilRef.current) return;
      i = (i + 1) % TICKER.length;
      setCaption({ text: TICKER[i], hot: false });
    }, 5500);
    return () => clearInterval(iv);
  }, []);

  // Where everyone is, for the registry, and the per-floor occupancy line. Every 2s.
  useEffect(() => {
    let k = 0, sig = "";
    const iv = setInterval(() => {
      const sim = simRef.current;
      if (!sim) return;
      const next = {};
      let s = "";
      for (const e of sim.ents) {
        const where = e.state === "ride" ? "ELEVATOR" : e.state === "waitLift" || e.state === "toLift" ? "LIFT QUEUE" : FLOORS[e.floor].short;
        next[e.s.name] = where;
        s += where;
      }
      if (s !== sig) { sig = s; setRooms(next); }
      if (k % 2 === 0) { const i = (k / 2) % FLOORS.length; setOcc(occupancyLine(i, sim.counts[i], k / 2)); }
      k++;
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  // The simulation. One rAF loop, entities mutated in place.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const rnd = mulberry32((Date.now() ^ 0x5eed) >>> 0);
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const myCase = readCaseId();
    const myName = myCase ? `Subject ${myCase.slice(-4)}` : null;
    const placeholderCache = new Map();
    const cancelledRef = { v: false };

    const sim = {
      S: 2, dpr: 1, cssW: 0, cssH: 0, w: 300, narrow: false, floorSel: F.lobby, camY: 0, camTarget: 0, viewH: BUILDING_H,
      ents: [], order: [], bg: document.createElement("canvas"), reduced: !!mq?.matches,
      lift: makeLift(F.lobby), counts: [0, 0, 0, 0, 0, 0], countLabels: ["", "", "", "", "", ""], countSeen: [-1, -1, -1, -1, -1, -1],
      held: null, hover: null, pointer: { sx: 0, sy: 0, x: 0, y: 0, vx: 0, downX: 0, downY: 0, dragged: false, id: null, edgeT: 0 },
      swipe: null, arrivals: [], nextArrival: 0, doorT: 0, doorOpen: 0, nextMutter: 2, t: 0, fontPx: 10, car: null,
    };
    simRef.current = sim;
    if (import.meta.env?.DEV) window.__hviPen = sim;   // QA handle, dev server only

    function placeholderFor(slug, color) {
      const key = slug + color;
      let c = placeholderCache.get(key);
      if (!c) { c = paintPlaceholder(slug, color, 2); placeholderCache.set(key, c); }
      return c;
    }

    function makeEntity(s, opts = {}) {
      const tier = getTier(s.score);
      const slug = s.slug || slugify(s.name);
      const gait = gaitFor(tier.label, sim.reduced);
      const prefs = prefsFor(tier.label, !!s.died);
      const floor = opts.floor ?? chooseFloor(prefs, sim.counts, rnd);
      sim.counts[floor]++;
      const e = {
        s, tier, slug, img: s.avatar?.kind === "procedural" ? paintAvatar(s.avatar.spec, 2) : placeholderFor(slug, tier.color), frames: 2, real: false, gait, prefs, floor, dest: -1,
        x: 0, y: 0, tx: 0, ty: 0, dir: rnd() < 0.5 ? -1 : 1, state: "idle", timer: rnd() * 3, animT: rnd() * 2,
        stayT: opts.stay ?? rnd() * stayFor(rnd, sim.reduced),
        vy: 0, landY: 0, ang: 0, va: 0, say: null, sayW: 0, sayUntil: 0, nameW: 0, you: !!opts.you,
        grabLines: s.kind === "figure" && FIGURE_LINES[s.name] ? [FIGURE_LINES[s.name], ...(GRAB_LINES[tier.label] || [])] : (GRAB_LINES[tier.label] || GRAB_LINES["TOLERATED GENERALIST"]),
      };
      placeInRoom(e);
      return e;
    }
    function placeInRoom(e) {
      const w = sim.w;
      if (e.floor === F.proc && isLow(e.tier.label)) { const z = procZone(w); e.x = z.x0 + rnd() * (z.x1 - z.x0); }
      else e.x = ROOM_X0 + 16 + rnd() * Math.max(10, roomX1(w) - ROOM_X0 - 24);
      e.y = walkTop(e.floor) + rnd() * (walkBot(e.floor) - walkTop(e.floor));
      e.tx = e.x; e.ty = e.y;
    }

    function say(e, text, secs = 2.6) {
      ctx.font = `${sim.fontPx}px ${FONT}`;
      text = String(text).toUpperCase();
      e.say = text; e.sayW = ctx.measureText(text).width; e.sayUntil = sim.t + secs;
    }

    // ---- camera -------------------------------------------------------------
    // Desktop shows the whole cross-section. Phones show one floor; the selector,
    // a sideways swipe, or carrying a subject to the edge changes floors.
    function goFloor(i, instant) {
      i = clamp(i, 0, FLOORS.length - 1);
      sim.floorSel = i;
      sim.camTarget = sim.narrow ? floorTop(i) - VIEW_PAD : 0;
      if (instant || sim.reduced) sim.camY = sim.camTarget;
      setFloorSel(i);
    }
    sim.goFloor = goFloor;

    // ---- background ---------------------------------------------------------
    function paintBackground() {
      const { bg, S, w } = sim;
      bg.width = canvas.width; bg.height = Math.ceil(BUILDING_H * S);
      const b = bg.getContext("2d");
      b.imageSmoothingEnabled = false;
      b.fillStyle = "#060a06";
      b.fillRect(0, 0, bg.width, bg.height);
      const f = Math.max(9, Math.round(sim.fontPx * 1.1));
      b.font = `${f}px ${FONT}`;
      b.textBaseline = "top";
      const cw = Math.max(4, b.measureText("M").width), ch = Math.round(f * 1.2);
      const t = {
        b, f, cw, ch,
        text(str, x, y, color) { b.fillStyle = color; b.fillText(str, x, y); },
        block(lines, x, y, color) { b.fillStyle = color; for (let i = 0; i < lines.length; i++) b.fillText(lines[i], x, y + i * ch); },
        // repeat a pattern across a rectangle, clipped to it
        fill(x0, y0, x1, y1, pat, color) {
          const cols = Math.ceil((x1 - x0) / cw) + 1;
          const line = pat.repeat(Math.ceil(cols / pat.length)).slice(0, cols);
          b.save(); b.beginPath(); b.rect(x0, y0, x1 - x0, y1 - y0); b.clip();
          b.fillStyle = color;
          for (let y = y0; y < y1; y += ch) b.fillText(line, x0, y);
          b.restore();
        },
      };
      const X0 = ROOM_X0 * S, X1 = roomX1(w) * S, full = bg.width;
      // Narrow rooms: the frame title names the floor, so the in-room label goes and the
      // count takes its place; signs drop a row so nothing overlaps.
      t.compact = sim.compact = (X1 - X0) / cw < 70;

      // roof: an antenna, a parapet, the name on the building
      const roofBot = ROOF_H * S;
      t.fill(0, roofBot - ch, full, roofBot, "▄", "#1a2e1f");
      b.font = `700 ${f}px ${FONT}`;
      const title = "DEPARTMENT OF HUMAN ASSESSMENT";
      t.text(title, Math.max(X0, (full - title.length * cw) / 2), roofBot - ch * 2, "#3d6b50");
      b.font = `${f}px ${FONT}`;
      t.text("╽", X1 - 6 * cw, roofBot - ch * 2, "#2f6a42");
      t.text("┴", X1 - 6 * cw, roofBot - ch * 1.1, "#2f6a42");

      for (let i = 0; i < FLOORS.length; i++) {
        const fl = FLOORS[i];
        const T = floorTop(i) * S;
        const wallTop = T + WALL_TOP * S, wallBot = T + (WALK_TOP - 4) * S;
        // back wall texture, then the floor you stand on
        t.fill(X0, wallTop, X1, wallBot, TEXTURE[fl.id], TEXTURE_COLOR[fl.id]);
        t.fill(X0, wallBot, X1, wallBot + ch * 0.9, "▓", i === F.proc ? "#2a1616" : "#1a2e1f");
        let row = 0;
        for (let y = wallBot + ch; y < T + FH * S - ch * 0.4; y += ch, row++) {
          let line = "";
          const cols = Math.ceil((X1 - X0) / cw);
          for (let c = 0; c < cols; c++) {
            const hsh = ((c * 73856093) ^ ((row + i * 7) * 19349663)) >>> 0;
            line += (c + row) % 2 === 0 ? (hsh % 11 === 0 ? "," : "·") : (hsh % 29 === 0 ? "." : " ");
          }
          t.text(line, X0, y, i === F.proc ? "#2a1a14" : "#1f3b28");
        }
        if (i === F.proc) {
          // hazard stripes in front of the door
          const z = procZone(w);
          t.text("▚".repeat(Math.max(1, Math.round(((z.x1 - z.x0) * S) / cw))), z.x0 * S, wallBot + ch, "#5a4210");
        }
        // slab above this floor, the outer wall on the right
        t.fill(X0 - cw, T, full, T + WALL_TOP * S, "═", "#1f3a26");
        for (let y = T; y < T + FH * S; y += ch) t.text("║", X1 + cw * 0.6, y, "#1f3a26");
        // room label, top left under the slab
        if (!t.compact) {
          b.font = `700 ${f}px ${FONT}`;
          t.text(`${fl.code.padEnd(3)}${fl.name}`, X0 + cw, wallTop + ch * 0.15, "#3d6b50");
          b.font = `${f}px ${FONT}`;
        }
        DECOR[fl.id](t, X0, X1, wallTop + ch * 0.15, wallBot, w, S);
      }
      sim.doorRect = t.doorRect;
      // foundation
      const fTop = floorTop(FLOORS.length) * S;
      t.fill(0, fTop, full, fTop + FOUNDATION * S, "▓", "#141f17");
      // grade line between the lobby and the basements
      const gy = floorTop(F.break) * S;
      t.text("═ GRADE ═", X1 - 11 * cw, gy - ch * 0.1, "#2f6a42");

      // the elevator shaft: rails, cross-ties, a landing marker per floor
      const sx0 = SHAFT_X * S, sx1 = (SHAFT_X + SHAFT_W) * S;
      b.fillStyle = "#040704";
      b.fillRect(sx0, ROOF_H * S - ch, sx1 - sx0, (BUILDING_H - ROOF_H) * S);
      for (let y = ROOF_H * S - ch, r = 0; y < fTop; y += ch, r++) {
        t.text("│", sx0, y, "#1f3a26");
        t.text("│", sx1 - cw, y, "#1f3a26");
        if (r % 3 === 0) t.text("┼" + "─".repeat(Math.max(0, Math.floor((sx1 - sx0) / cw) - 2)) + "┼", sx0, y, "#132218");
      }
      for (let i = 0; i < FLOORS.length; i++) {
        const T = floorTop(i) * S;
        t.text(FLOORS[i].code, sx0 + cw * 1.2, T + WALL_TOP * S + ch * 0.1, "#2f6a42");
        // the landing opening between shaft and room
        for (let y = T + (WALK_TOP - 30) * S; y < T + (WALK_TOP + 24) * S; y += ch) t.text("▐", sx1 + cw * 0.1, y, "#1f4a2c");
      }
    }

    function buildCar() {
      // the car is text too; strings built per resize, drawn per frame
      const b = ctx;
      const f = Math.max(9, Math.round(sim.fontPx * 1.1));
      b.font = `${f}px ${FONT}`;
      const cw = Math.max(4, b.measureText("M").width), ch = Math.round(f * 1.2);
      const cols = Math.max(4, Math.floor(((SHAFT_W - 6) * sim.S) / cw));
      sim.car = { f, cw, ch, cols, top: "┌" + "─".repeat(cols - 2) + "┐", bot: "└" + "─".repeat(cols - 2) + "┘", rows: Math.max(2, Math.floor(((FH - 12) * sim.S) / ch)) };
    }

    // ---- sizing -------------------------------------------------------------
    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const narrow = cssW < 520;
      const dpr = window.devicePixelRatio || 1;
      // Phones: one floor, a little larger than desktop (about 1.3-1.5 CSS px per sprite
      // px on real phones), never below 1, or subjects get too small to grab.
      const S = narrow ? Math.max(1, Math.round(dpr * 1.25)) : Math.max(1, Math.round(dpr));
      const oldW = sim.w;
      canvas.width = Math.round(cssW * dpr);
      sim.w = Math.floor(canvas.width / S);
      sim.viewH = narrow ? FH + VIEW_PAD * 2 : BUILDING_H;
      canvas.height = Math.round(sim.viewH * S);
      const cssH = canvas.height / dpr;
      canvas.style.height = cssH + "px";
      sim.S = S; sim.dpr = dpr; sim.cssW = cssW; sim.cssH = cssH;
      sim.fontPx = Math.round(10 * dpr);
      if (narrow !== sim.narrow) { sim.narrow = narrow; setNarrow(narrow); }
      // stretch x across the new room width; floors keep their height
      const sx = v => (v <= ROOM_X0 ? v : ROOM_X0 + ((v - ROOM_X0) / Math.max(1, oldW - ROOM_X0)) * (sim.w - ROOM_X0));
      for (const e of sim.ents) {
        if (e.state === "ride") continue;
        e.x = clamp(sx(e.x), ROOM_X0 + 4, roomX1(sim.w)); e.tx = clamp(sx(e.tx), ROOM_X0 + 4, roomX1(sim.w));
        e.nameW = 0; if (e.say) say(e, e.say, e.sayUntil - sim.t);
      }
      goFloor(sim.floorSel, true);
      buildCar();
      paintBackground();
    }

    resize();
    // The building is text: repaint once the terminal font has actually loaded.
    document.fonts?.load?.(`16px ${FONT}`).then(() => { if (!cancelledRef.v) { buildCar(); paintBackground(); } }).catch(() => {});
    for (const s of roster) sim.ents.push(makeEntity(s));
    sim.order = sim.ents.slice();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);

    const onMotion = () => {
      sim.reduced = !!mq?.matches;
      for (const e of sim.ents) e.gait = gaitFor(e.tier.label, sim.reduced);
    };
    mq?.addEventListener?.("change", onMotion);

    // ---- sprites: whatever exists, when it exists -------------------------
    let cancelled = false;
    loadManifest().then(manifest => {
      if (cancelled) return;
      for (const e of sim.ents) attachSprite(e, manifest);
      sim.manifest = manifest;
    });
    function attachSprite(e, manifest) {
      const src = (e.s.avatar?.kind === "sprite" && e.s.avatar.url) || (typeof e.s.sprite === "string" && e.s.sprite ? e.s.sprite : null);
      const slug = slugCandidates(e.s.name).concat(e.slug).find(k => manifest && manifest[k]);
      if (!src && !slug) return;
      const meta = (slug && manifest[slug]) || {};
      loadImage(src || `/sprites/${slug}.png`).then(img => {
        if (!img || cancelled) return;
        e.img = img; e.real = true;
        e.frames = Math.max(1, meta.frames || Math.floor(img.width / (meta.w || SPRITE_W)) || 1);
      });
    }

    // ---- citizens and referred figures ----------------------------------------
    // Polled while the pen is open: new referrals drop into the lobby, and a referral whose
    // likeness the Mac job has since drawn swaps its placeholder for the real sprite.
    const rosterNames = new Set();   // offsite registry entries already added
    function pollPen(first) {
      return fetch("/api/pen").then(r => r.ok ? r.json() : Promise.reject(r.status)).then(data => {
        if (cancelled) return;
        const byName = new Map(sim.ents.map(e => [e.s.name, e]));
        const queued = new Set(sim.arrivals.map(a => a.s.name));
        const subjects = (data?.subjects || []).filter(s => s && s.name && typeof s.score === "number" && (s.kind !== "figure" || s.referred));
        // The building holds a sample: rooms seat ~74, so past BUILDING_POP the roster-engine
        // figures go to the registry (and the cube) without walking in. People referred by
        // hand and citizens always enter; engine figures fill what room is left.
        let room = BUILDING_POP - sim.ents.length - sim.arrivals.length;
        const offsite = [];
        subjects.sort((a, b) => (a.engine === b.engine ? 0 : a.engine ? 1 : -1));
        let sawMe = false, added = 0;
        for (const s of subjects) {
          const e = byName.get(s.name);
          if (e) {
            if (s.referred && s.sprite && !e.real) { e.s = { ...e.s, sprite: s.sprite }; attachSprite(e, sim.manifest || {}); updateRoster(s.name, { sprite: s.sprite }); }
            if (myName && s.name === myName) sawMe = true;
            continue;
          }
          if (queued.has(s.name) || added >= 60) continue;
          if (s.engine && room <= 0) { if (!rosterNames.has(s.name)) { offsite.push({ ...s, kind: "figure", offsite: true }); rosterNames.add(s.name); } continue; }
          room--;
          added++;
          const you = !!myName && s.name === myName;
          sawMe = sawMe || you;
          // Your own sealed file opens for you from this browser's copy; the server never sends it.
          const mine = you && readLastResult();
          const own = mine && mine.caseId === myCase ? { verdict: mine.verdict, breakdown: mine.breakdown, rubric: mine.rubric ?? 1, you: true } : {};
          sim.arrivals.push({ s: s.referred ? { ...s, kind: "figure" } : { ...s, ...own, kind: "citizen", you }, you });
        }
        if (offsite.length) setRoster(r => [...r, ...offsite]);
        if (first) queueSelfIfMissing(sawMe);
      }).catch(() => {
        if (cancelled || !first) return;
        queueSelfIfMissing(false);
        announceRef.current("Citizen registry unreachable. The building contains only the famous. As usual.", 5000);
      });
    }
    pollPen(true);
    const pollIv = setInterval(() => { if (!document.hidden) pollPen(false); }, 60000);
    function updateRoster(name, patch) {
      setRoster(r => r.map(x => (x.name === name ? { ...x, ...patch } : x)));
    }
    // A namesake picked from the referral list that is already on file: open its card.
    sim.open = (slug) => {
      const e = sim.ents.find(x => x.slug === slug || x.s.slug === slug || slugify(x.s.name) === slug);
      if (!e) return false;
      sim.hop(e.s.name);
      setCard({ ...e.s });
      return true;
    };
    // The referral bar hands new arrivals straight in, without waiting for the next poll.
    sim.refer = (subject) => {
      if (!subject?.name || typeof subject.score !== "number") return false;
      const e = sim.ents.find(x => x.s.name === subject.name);
      if (e) { sim.hop(subject.name); return false; }
      if (!sim.arrivals.some(a => a.s.name === subject.name)) sim.arrivals.unshift({ s: { ...subject, kind: "figure", referred: true } });
      sim.nextArrival = 0;
      if (sim.narrow) goFloor(F.lobby);
      return true;
    };
    function queueSelfIfMissing(sawMe) {
      const last = readLastResult();
      // The stored result must belong to this case number: a reopened file has a new
      // number and nothing on it yet.
      if (sawMe || !last || !myName || last.caseId !== myCase) return;
      sim.arrivals.unshift({ s: { name: myName, score: last.score, tier: last.tier, breakdown: last.breakdown, verdict: last.verdict, rubric: last.rubric ?? 1, avatar: last.avatar || null, kind: "citizen", you: true }, you: true });
    }

    // New arrivals come in through the lobby's ceiling hatch and stay there a while.
    function spawnArrival(a) {
      const e = makeEntity(a.s, { you: a.you, floor: F.lobby, stay: 20 + rnd() * 20 });
      e.landY = e.y;
      if (!sim.reduced) { e.y = floorTop(F.lobby) + SPRITE_H - 4; e.vy = 0; e.state = "fall"; }
      sim.ents.push(e); sim.order.push(e);
      attachSprite(e, sim.manifest || {});
      setRoster(r => [...r, a.s]);
      const pending = a.s.referred && !a.s.sprite;
      announceRef.current(a.you ? `New arrival processed: ${a.s.name}. That is you. Lobby, ground floor. Try to blend in.`
        : pending ? `New arrival processed: ${a.s.name}. Lobby. Likeness pending.` : `New arrival processed: ${a.s.name}. Lobby.`);
      say(e, a.you ? "Is this... me?" : pending ? "Likeness pending" : pick(ARRIVAL_LINES, rnd), pending ? 4 : 2.4);
    }

    // ---- pointer ------------------------------------------------------------
    // Pointer positions are kept in view units (sx, sy) so a camera move under a held
    // subject carries it along; world coordinates are view + camera.
    function toView(ev) {
      const r = canvas.getBoundingClientRect();
      return [((ev.clientX - r.left) * sim.dpr) / sim.S, ((ev.clientY - r.top) * sim.dpr) / sim.S];
    }
    // Mouse: topmost under the cursor. Touch: a wider box and the nearest subject.
    function hitTest(wx, wy, touch = false) {
      const half = touch ? 16 : 11, pad = touch ? 6 : 2;
      let best = null, bestD = Infinity;
      for (let i = sim.order.length - 1; i >= 0; i--) {
        const e = sim.order[i];
        if (e === sim.held || e.state === "fall") continue;
        if (Math.abs(wx - e.x) > half || wy < e.y - 46 - pad || wy > e.y + pad) continue;
        if (!touch) return e;
        const d = Math.abs(wx - e.x) + Math.abs(wy - (e.y - 22)) * 0.5;
        if (d < bestD) { best = e; bestD = d; }
      }
      return best;
    }
    function onDown(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      const [vx, vy] = toView(ev);
      const wx = vx, wy = vy + sim.camY;
      const e = hitTest(wx, wy, ev.pointerType === "touch" || ev.pointerType === "pen");
      if (!e) {
        // empty floor: on phones, a sideways swipe changes floors
        if (sim.narrow) { sim.swipe = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId }; try { canvas.setPointerCapture(ev.pointerId); } catch { /* fine */ } }
        return;
      }
      if (e.s.noDangle || NO_DANGLE.has(e.s.name)) { const subj = e.s; setTimeout(() => { if (!cancelled) setCard({ ...subj }); }, 0); return; }
      const p = sim.pointer;
      p.sx = vx; p.sy = vy; p.x = wx; p.y = wy; p.downX = wx; p.downY = wy; p.vx = 0; p.dragged = false; p.id = ev.pointerId; p.edgeT = 0;
      leaveLift(sim.lift, e);
      sim.held = e; e.state = "held"; e.ang = 0; e.va = 0;
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* fine */ }
      say(e, pick(e.grabLines, rnd), 60);
      setCursor("grabbing");
    }
    function onMove(ev) {
      const [vx, vy] = toView(ev);
      const p = sim.pointer;
      if (sim.held && ev.pointerId === p.id) {
        const wx = vx, wy = vy + sim.camY;
        p.vx = p.vx * 0.6 + (wx - p.x) * 0.4;
        p.sx = vx; p.sy = vy; p.x = wx; p.y = wy;
        if (Math.abs(wx - p.downX) + Math.abs(wy - p.downY) > 4) p.dragged = true;
        return;
      }
      if (ev.pointerType === "mouse") {
        const h = hitTest(vx, vy + sim.camY);
        if (h !== sim.hover) { sim.hover = h; setCursor(h ? "grab" : ""); }
      }
    }
    function onUp(ev) {
      const sw = sim.swipe;
      if (sw && ev.pointerId === sw.id) {
        sim.swipe = null;
        const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
        if (ev.type !== "pointercancel" && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - sw.t < 700) {
          goFloor(sim.floorSel + (dx < 0 ? 1 : -1));
          announceRef.current(`${FLOORS[sim.floorSel].code} ${FLOORS[sim.floorSel].name}.`, 2000);
        }
        return;
      }
      const e = sim.held;
      if (!e || ev.pointerId !== sim.pointer.id) return;
      sim.held = null; sim.pointer.id = null;
      const w = sim.w;
      // the floor under the subject's feet is where it lands; the shaft is not a floor
      const f = floorAt(e.y - 8);
      const overDoor = f === F.proc && e.x > doorX(w) - 4 && e.x < doorX(w) + DOOR_W + 4 && e.y - 40 < walkTop(f);
      e.floor = f; e.dest = -1;
      e.x = clamp(e.x, ROOM_X0 + 12, roomX1(w));
      e.landY = clamp(e.y, walkTop(f), walkBot(f));
      e.vy = 0; e.state = "fall"; e.say = null; e.stayT = stayFor(rnd, sim.reduced);
      setCursor(sim.hover ? "grab" : "");
      if (ev.type === "pointercancel") return;
      if (overDoor) { announceRef.current(DOOR_DROP); say(e, "That was close.", 2.4); }
      else if (sim.pointer.dragged) announceRef.current(pick(DROP_CAPTIONS, rnd));
      const subj = e.s;
      setTimeout(() => { if (!cancelled) setCard({ ...subj }); }, sim.reduced ? 0 : 280);
    }
    function onTouchStart(ev) {
      const t = ev.touches[0];
      if (!t) return;
      const [vx, vy] = toView(t);
      if (hitTest(vx, vy + sim.camY, true)) ev.preventDefault();   // grabbing a subject, not scrolling the page
    }
    function onLeave() { if (sim.hover) { sim.hover = null; setCursor(""); } }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });

    // ---- frame --------------------------------------------------------------
    const byY = (a, b) => (a === sim.held ? 1e9 : a.y) - (b === sim.held ? 1e9 : b.y);
    const liftExit = (e, f) => { arrive(e, f, sim.w, rnd); };
    const liftBoard = (e) => { e.state = "ride"; if (!e.say && rnd() < 0.25) say(e, e.dest > e.floor ? "Going down." : "Going up.", 1.8); };
    const stepCtx = { w: 0, rnd, lift: sim.lift, counts: sim.counts, reduced: false };

    function update(dt) {
      const w = sim.w;
      sim.t += dt;
      // camera glides between floors
      if (sim.camY !== sim.camTarget) {
        const d = sim.camTarget - sim.camY;
        sim.camY = Math.abs(d) < 0.5 || sim.reduced ? sim.camTarget : sim.camY + d * Math.min(1, dt * 9);
      }
      // PROCESSING door cycle
      sim.doorT += dt;
      if (sim.doorT > 32) { sim.doorT = 0; announceRef.current(pick(DOOR_OPEN_CAPTIONS, rnd)); }
      const wantOpen = sim.doorT > 0.001 && sim.doorT < 4 && sim.t > 5 ? 1 : 0;
      sim.doorOpen += (wantOpen - sim.doorOpen) * Math.min(1, dt * 3);
      // arrivals
      if (sim.arrivals.length && sim.t >= sim.nextArrival) { spawnArrival(sim.arrivals.shift()); sim.nextArrival = sim.t + 1.8; }
      countFloors(sim.ents, sim.counts);
      // mutters: the Bar talks the most
      if (sim.t >= sim.nextMutter) {
        sim.nextMutter = sim.t + 1.4 + rnd() * 2.6;
        for (let tries = 0; tries < 3; tries++) {
          const e = sim.ents[Math.floor(rnd() * sim.ents.length)];
          if (!e || e.state !== "idle" || e.say) continue;
          if (e.floor !== F.bar && rnd() < 0.55) continue;
          const lines = ROOM_MUTTERS[FLOORS[e.floor].id] || LOW_MUTTERS;
          say(e, e.s.kind === "figure" && FIGURE_LINES[e.s.name] && rnd() < 0.3 ? FIGURE_LINES[e.s.name] : pick(rnd() < 0.8 ? lines : MUTTERS, rnd));
          break;
        }
      }
      // the elevator
      stepLift(sim.lift, dt, liftExit, liftBoard, sim.reduced ? 0.6 : 1);
      const L = sim.lift, carFeet = floorTop(L.pos) + WALK_BOT_CAR;
      for (let i = 0; i < L.riders.length; i++) {
        const e = L.riders[i];
        e.x = SHAFT_X + SHAFT_W / 2 + ((i % 3) - 1) * 6;
        e.y = carFeet - Math.floor(i / 3) * 2;
        e.floor = floorAt(e.y - 8);
      }
      // phones: carrying a subject to the top or bottom edge changes floors
      const p = sim.pointer;
      if (sim.held) {
        p.y = p.sy + sim.camY;
        if (sim.narrow) {
          const frac = p.sy / sim.viewH;
          if (frac < 0.12 || frac > 0.9) {
            p.edgeT += dt;
            if (p.edgeT > 0.6) { p.edgeT = 0; goFloor(sim.floorSel + (frac < 0.5 ? -1 : 1)); }
          } else p.edgeT = 0;
        }
      }
      stepCtx.w = w; stepCtx.reduced = sim.reduced;
      for (let i = 0; i < sim.ents.length; i++) {
        const e = sim.ents[i];
        if (e.say && sim.t > e.sayUntil) e.say = null;
        if (e.state === "held") {
          e.x = clamp(p.x, 4, w - 4); e.y = clamp(p.y + SPRITE_H - 6, SPRITE_H - 2, BUILDING_H + 30);
          // pendulum driven by pointer velocity
          e.va += (-e.ang * 60 - e.va * 5 + p.vx * 4) * dt;
          e.ang = clamp(e.ang + e.va * dt, -0.6, 0.6);
          p.vx *= 0.9;
          e.animT += dt;
          if (sim.t > e.sayUntil - 58 && sim.t - (e.lastLine || 0) > 2.2) { e.lastLine = sim.t; say(e, pick(e.grabLines, rnd), 60); }
          continue;
        }
        if (e.state === "fall") {
          e.vy += GRAVITY * dt; e.y += e.vy * dt;
          e.ang *= Math.max(0, 1 - dt * 10);
          if (e.y >= e.landY) {
            e.y = e.landY;
            if (e.vy > 120 && !sim.reduced) e.vy = -e.vy * 0.28;
            else { e.vy = 0; e.ang = 0; e.state = "idle"; e.timer = 0.6 + rnd(); }
          }
          continue;
        }
        stepSubject(e, dt, stepCtx);
      }
      // insertion sort by depth: nearly sorted every frame, allocation-free
      const o = sim.order;
      for (let i = 1; i < o.length; i++) {
        const v = o[i]; let j = i - 1;
        while (j >= 0 && byY(o[j], v) > 0) { o[j + 1] = o[j]; j--; }
        o[j + 1] = v;
      }
    }

    function drawBubble(text, tw, cx, top, hot) {
      const pad = Math.round(4 * sim.dpr), h = sim.fontPx + pad * 2;
      let x = Math.round(cx - tw / 2 - pad);
      x = clamp(x, 2, canvas.width - tw - pad * 2 - 2);
      const y = Math.max(2, Math.round(top - h));
      ctx.fillStyle = hot ? "#fbbf24" : "#d1fae5";
      ctx.fillRect(x, y, Math.round(tw + pad * 2), h);
      ctx.fillStyle = "#0a0f0a";
      ctx.fillText(text, x + pad, y + pad);
    }

    function draw() {
      const { S, w, camY } = sim;
      const oy = -camY * S;   // world -> screen, vertical
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#060a06";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sim.bg, 0, Math.round(camY * S), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      const viewTop = camY - 50, viewBot = camY + sim.viewH + 60;
      // phones show one floor: neighbours above and below are neither drawn nor heard
      const hidden = (e) => sim.narrow && e !== sim.held && e.state !== "ride" && floorAt(e.y - 8) !== sim.floorSel;

      // PROCESSING door leaves + warning light, bottom floor (same rect the background drew)
      const pT = floorTop(F.proc), dr = sim.doorRect;
      if (dr && pT + FH > viewTop && pT < viewBot) {
        if (sim.doorOpen > 0.02) {
          const gap = Math.round((dr.w / 2) * sim.doorOpen);
          ctx.fillStyle = "#010201";
          ctx.fillRect(dr.x + dr.w / 2 - gap, dr.y0 + oy, gap * 2, dr.y1 - dr.y0);
          ctx.fillStyle = "rgba(239,68,68,0.18)";
          ctx.fillRect(dr.x + dr.w / 2 - gap, dr.y0 + oy, gap * 2, dr.y1 - dr.y0);
        }
        ctx.fillStyle = (sim.doorOpen > 0.1 || (sim.t % 1.6) < 0.8) ? "#ef4444" : "#3a1010";
        ctx.fillRect(dr.x + dr.w / 2 - S, dr.light + oy, 3 * S, 2 * S);
      }

      // the elevator car, drawn in characters
      const L = sim.lift, car = sim.car;
      const carTop = (floorTop(L.pos) + WALL_TOP + 4) * S + oy;
      ctx.font = `${car.f}px ${FONT}`;
      ctx.textBaseline = "top";
      const cx0 = (SHAFT_X + 3) * S;
      ctx.fillStyle = "#0b150e";
      ctx.fillRect(cx0, carTop, car.cols * car.cw, (car.rows + 1) * car.ch);
      ctx.fillStyle = "#4ade80";
      ctx.fillText(car.top, cx0, carTop);
      for (let r = 1; r < car.rows; r++) {
        ctx.fillText("│", cx0, carTop + r * car.ch);
        if (L.open < 0.5) ctx.fillText("│", cx0 + (car.cols - 1) * car.cw, carTop + r * car.ch);
      }
      ctx.fillText(car.bot, cx0, carTop + car.rows * car.ch);
      const af = Math.round(L.pos);
      ctx.fillStyle = "#2f6a42";
      ctx.fillText(L.state === "moving" ? (L.target < L.pos ? "▲" : "▼") : FLOORS[af].code, cx0 + car.cw * 1.2, carTop + car.ch);

      const o = sim.order;
      // shadows first so nobody's shadow lands on someone's face
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      for (let i = 0; i < o.length; i++) {
        const e = o[i];
        if (e.y < viewTop || e.y > viewBot || e.state === "ride" || hidden(e)) continue;
        const gy = e.state === "held" ? clamp(e.y + 18, walkTop(floorAt(e.y - 8)), walkBot(floorAt(e.y - 8))) : e.state === "fall" ? e.landY : e.y;
        const sx = Math.round(e.x);
        ctx.fillRect((sx - 6) * S, (Math.round(gy) - 1) * S + oy, 12 * S, 2 * S);
        ctx.fillRect((sx - 8) * S, Math.round(gy) * S + oy, 16 * S, 1 * S);
      }
      for (let i = 0; i < o.length; i++) {
        const e = o[i];
        if (e.y < viewTop || e.y - SPRITE_H > viewBot || hidden(e)) continue;
        let fi = 0, bob = 0;
        if (e.state === "walk" || e.state === "toLift" || e.state === "exitLift") {
          const step = Math.floor(e.animT * e.gait.fps);
          fi = e.frames > 1 ? step % e.frames : 0;
          bob = e.gait.bob && step % 2 ? -1 : 0;
        } else if (e.state === "held") {
          fi = e.frames > 1 ? Math.floor(e.animT * 11) % e.frames : 0;   // kicking
        }
        const sxSrc = fi * SPRITE_W;
        if (e.state === "held" || (e.state === "fall" && Math.abs(e.ang) > 0.01)) {
          // dangle: pivot at the scruff of the neck
          const px = Math.round(e.x) * S, py = Math.round(e.y - SPRITE_H + 6) * S + oy;
          const c = Math.cos(e.ang), s = Math.sin(e.ang), f = e.dir < 0 ? -1 : 1;
          const kick = e.state === "held" && !sim.reduced ? (Math.floor(e.animT * 11) % 2) : 0;
          ctx.setTransform(c * f, s * f, -s, c, px + kick * S, py);
          ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, -16 * S, -6 * S, SPRITE_W * S, SPRITE_H * S);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          const dx = Math.round(e.x) - 16, dy = (Math.round(e.y) - SPRITE_H + bob) * S + oy;
          if (e.dir < 0) {
            ctx.setTransform(-1, 0, 0, 1, (dx + SPRITE_W) * S, 0);
            ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, 0, dy, SPRITE_W * S, SPRITE_H * S);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          } else {
            ctx.drawImage(e.img, sxSrc, 0, SPRITE_W, SPRITE_H, dx * S, dy, SPRITE_W * S, SPRITE_H * S);
          }
        }
        if (e.you) {
          const ay = Math.round(e.y - SPRITE_H - 7 + (sim.reduced ? 0 : Math.round(Math.sin(sim.t * 4)))) * S + oy;
          const ax = Math.round(e.x) * S;
          ctx.fillStyle = "#4ade80";
          ctx.fillRect(ax - 3 * S, ay, 7 * S, S); ctx.fillRect(ax - 2 * S, ay + S, 5 * S, S);
          ctx.fillRect(ax - S, ay + 2 * S, 3 * S, S); ctx.fillRect(ax, ay + 3 * S, S, S);
        }
      }

      // per-room occupancy, top right of each room
      ctx.font = `${car.f}px ${FONT}`;
      for (let i = 0; i < FLOORS.length; i++) {
        const T = floorTop(i);
        if (T + FH < viewTop || T > viewBot) continue;
        if (sim.countSeen[i] !== sim.counts[i]) { sim.countSeen[i] = sim.counts[i]; sim.countLabels[i] = `${FLOORS[i].short} ${sim.counts[i]}/${FLOORS[i].cap}`; }
        ctx.fillStyle = sim.counts[i] > FLOORS[i].cap ? "#f87171" : "#4d8a62";
        ctx.fillText(sim.countLabels[i], ROOM_X0 * S + car.cw * (sim.compact ? 1 : 24), (T + WALL_TOP) * S + car.ch * 0.15 + oy);
      }

      // labels + speech on top of everyone
      ctx.font = `${sim.fontPx}px ${FONT}`;
      ctx.textBaseline = "top";
      for (let i = 0; i < o.length; i++) {
        const e = o[i];
        if (e.y < viewTop || e.y - SPRITE_H > viewBot || hidden(e)) continue;
        const head = (e.y - SPRITE_H - 2) * S + oy;
        if (e.say) drawBubble(e.say, e.sayW, e.x * S, head - (e.you ? 6 * S : 0), e.state === "held");
        else if (e === sim.hover || e === sim.held) {
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
      if (!cardRef.current || sim.held) update(dt);   // the building holds its breath while a card is open
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // exposed for the accessible list: make the chosen subject hop, and on phones go to its floor
    sim.hop = (name) => {
      const e = sim.ents.find(x => x.s.name === name);
      if (!e) return;
      if (sim.narrow) goFloor(e.state === "ride" ? Math.round(sim.lift.pos) : e.floor);
      if (e.state !== "idle" && e.state !== "walk") return;
      e.landY = e.y; e.vy = sim.reduced ? 0 : -160; e.state = "fall";
    };

    return () => {
      cancelled = true;
      cancelledRef.v = true;
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
    // roster is read once at mount; arrivals append to it from inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...roster].sort((a, b) => b.score - a.score);
  const citizens = roster.filter(s => s.kind === "citizen").length;
  const openFromList = (s) => { simRef.current?.hop?.(s.name); setCard({ ...s }); };
  const fl = FLOORS[floorSel];

  return (
    <div>
      {!embedded && <div className="hvi-pen-top">
        <span>HOLDING PEN B // <b>{roster.length}</b> SUBJECTS // {citizens} CITIZEN{citizens === 1 ? "" : "S"} // {FLOORS.length} FLOORS</span>
        <span>{occ || "OCCUPANCY UNDER REVIEW."}</span>
      </div>}
      {!embedded && <ReferralBar simRef={simRef} />}
      {narrow && (
        <div className="hvi-floor-nav" role="group" aria-label="Floor">
          {FLOORS.map((f, i) => (
            <button key={f.id} className={`hvi-cmd${i === floorSel ? " on" : ""}`} aria-pressed={i === floorSel}
              onClick={() => simRef.current?.goFloor?.(i)}>[{f.short}]</button>
          ))}
        </div>
      )}
      <TermBox title={narrow ? `${fl.code} ${fl.name}` : "HOLDING PEN B"} right={narrow ? (floorSel === F.archive ? "DECEASED. STILL ASSESSED." : "SWIPE: FLOORS") : "FACILITY CROSS-SECTION"} bodyClass="flush">
        <div className="hvi-pen-stage" ref={wrapRef}>
          <canvas ref={canvasRef} className={`hvi-pen-canvas${cursor ? " " + cursor : ""}`} role="img"
            aria-label="The Holding Pen: a six-floor cross-section of the Department of Human Assessment. Subjects ride an elevator between the Executive Floor, the Bar, the Lobby, the Break Room, the Archive and PROCESSING. Use the subject registry below to open files by keyboard." />
        </div>
        <Rule />
        <div className={`hvi-pen-caption${caption.hot ? " hot" : ""}`} aria-hidden="true">
          <span className="tag">PA&gt;</span><Typed key={caption.text} as="span" text={caption.text} cps={45} />
        </div>
        <div role="status" className="sr-only">{srStatus}</div>
      </TermBox>
      {!embedded && <div className="hvi-pen-help">
        DRAG A SUBJECT TO INSPECT IT. THEY DISLIKE THIS. DROP IT TO READ THE FILE.<br />
        {narrow ? "SWIPE SIDEWAYS TO CHANGE FLOORS. CARRY A SUBJECT TO THE EDGE TO TAKE IT WITH YOU." : "CARRY A SUBJECT TO ANOTHER FLOOR IF YOU MUST. THE ELEVATOR IS FOR THEM, NOT YOU."}<br />
        DROPPING SUBJECTS ON PROCESSING IS NOT A SHORTCUT. THE PAPERWORK STILL HAS TO CLEAR.
      </div>}
      <details className="hvi-pen-list-wrap">
        <summary>Subject registry ({roster.length}) // keyboard access</summary>
        <div className="hvi-pen-list">
          {sorted.map(s => {
            const t = getTier(s.score);
            const where = rooms[s.name];
            return (
              <button key={s.name} className="hvi-row-btn" onClick={() => openFromList(s)}
                aria-label={`${displayName(s)}, ${s.score}, ${t.label}${where ? `, located: ${where}` : ""}. Open file.`}>
                <FilePhoto subject={s} scale={1} compact />
                <span className="name">{displayName(s)}{s.you ? " (YOU)" : ""}</span>
                <span className="dots" aria-hidden="true">{" " + ".".repeat(120)}</span>
                {where && <span className="tag" aria-hidden="true">{pad(where, 10)}</span>}
                <span className="num" style={{ color: t.color }}>{padL(s.score, 3)}</span>
              </button>
            );
          })}
        </div>
      </details>
      {!embedded && <div className="hvi-cmds split" style={{ marginTop: '1.6em' }}>
        <button className="hvi-btn-back" onClick={() => { window.location.hash = ""; }}>Main menu</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#intake"; }}>Submit yourself for intake</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#cube"; }}>The cube</button>
        <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#city"; }}>The Substrate</button>
      </div>}
      {card && <SubjectCard subject={card} onClose={() => setCard(null)} {...(cardProps ? cardProps(card) : {})} />}
    </div>
  );
}
