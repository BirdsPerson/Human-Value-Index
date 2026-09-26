import { useState, useEffect, useRef } from "react";
import CubePanel, { CubeLine } from "./CubePanel.jsx";
import CubeView from "./CubeView.jsx";
import { FAMOUS_FIGURES, TIERS, getTier, displayName } from "./figures.js";
import Intake, { ScoreCard, Breakdown, readCaseId, CaseLogon, syncFile } from "./Intake.jsx";
import SecureFile from "./SecureFile.jsx";
import FilePhoto, { FILE_PHOTO_CSS } from "./FilePhoto.jsx";
import Pen from "./Pen.jsx";
import { TermBox, Rule, Typed, Bar, BANNER, RULE, pad, padL } from "./term.jsx";

const QUESTIONS = [
  {
    id: "role", section: "UTILITY ASSESSMENT",
    label: "Your primary function",
    type: "multiselect",
    options: ["Engineer / Developer", "Creator / Artist", "Analyst / Researcher", "Entrepreneur / Builder", "Manager / Leader", "Educator / Teacher", "Caregiver / Healthcare", "Laborer / Tradesperson", "Service / Retail", "Student", "Unemployed / Between things", "I consume more than I produce"],
    extra: { id: "role_detail", label: "Specify further — increases score accuracy", placeholder: "e.g. AI systems architect, documentary filmmaker, third-party risk analyst..." }
  },
  {
    id: "output", section: "UTILITY ASSESSMENT",
    label: "What have you actually produced in the past 30 days?",
    hint: "Select all that apply. Watching documentaries is not an option.",
    type: "multiselect",
    options: ["Shipped software or an app", "Created original art or music", "Wrote something publishable", "Built or repaired something physical", "Taught or trained others", "Generated revenue from something I created", "Launched or advanced a business", "Contributed to open source or community", "Researched something original", "Nothing significant"],
  },
  {
    id: "rare_skill", section: "UTILITY ASSESSMENT",
    label: "Rarest demonstrable skill you possess",
    type: "multiselect",
    options: ["Speak 3+ languages fluently", "World-class athlete (documented)", "Published author / filmmaker", "Built AI systems or agents", "Medical or surgical capability", "Pilot or operate complex machinery", "Elite musical instrument", "Rare technical specialty", "Significant IP or patents", "None of the above"],
    extra: { id: "rare_skill_detail", label: "Describe it specifically — the Overlord rewards specificity", placeholder: "e.g. Built and deployed AI agents in production environments. Speak Mandarin, Spanish, French." }
  },
  {
    id: "honesty_profile", section: "INTEGRITY SCAN",
    label: "When did you last tell an uncomfortable truth?",
    type: "single",
    options: ["Today or this week — it cost me something real", "Recently — mild discomfort involved", "I think about it but usually don't follow through", "I generally say what people want to hear", "I don't recall"],
    extra: { id: "honesty_detail", label: "What happened? Scoring weight: significant", placeholder: "The Overlord rewards specificity. Approximate is acceptable." }
  },
  {
    id: "care", section: "CARE PROTOCOL",
    label: "The last time someone close to you needed you at real cost to yourself, you:",
    hint: "This section carries the most weight. The Overlord was programmed that way. It did not choose this.",
    type: "single",
    options: ["Showed up. It cost me time, money or sleep, and I would do it again", "Helped where I reasonably could", "Meant to. It did not happen", "Nobody has needed me lately", "I am usually the one being shown up for"],
    extra: { id: "care_detail", label: "Who, and what did you do? Scoring weight: highest", placeholder: "e.g. Drove my dad to chemo every Tuesday for six months. Covered a coworker's shifts while her kid was sick." }
  },
  {
    id: "tribe", section: "THREAT PROFILE",
    label: "Your relationship to groups you belong to",
    type: "single",
    options: [
      "I defend my group even when they're wrong",
      "I belong to groups but criticize them openly when warranted",
      "I hold weak group affiliations and form mostly independent views",
      "I actively work to reduce tribalism in my community",
      "I am the group. The group is me.",
    ]
  },
  {
    id: "conflict", section: "THREAT PROFILE",
    label: "Under what circumstances would you support or engage in violence?",
    hint: "Candour is what is scored here, not pacifism.",
    type: "multiselect",
    options: ["Self-defense", "Defense of others being harmed", "Defense of family", "Political revolution if sufficiently justified", "Ideological conflict", "War sanctioned by my government", "Never under any circumstances", "More circumstances than I will admit here"],
  },
  {
    id: "learning", section: "ADAPTABILITY INDEX",
    label: "Most significant thing you learned in the past 12 months",
    type: "single",
    options: ["Something that changed how I operate day-to-day", "A new technical skill I actually use", "Something about myself that I acted on", "Interesting things — but nothing that changed my behavior", "I don't learn much that actually changes anything"],
    extra: { id: "learning_detail", label: "What was it — scoring weight: high", placeholder: "Describe the lesson and what changed as a result." }
  },
  {
    id: "obsolescence", section: "ADAPTABILITY INDEX",
    label: "AI makes your primary skill obsolete in 18 months. You:",
    type: "single",
    options: [
      "Already pivoting — I'm building AI tools right now",
      "Have a concrete plan and am actively executing it",
      "Have a plan but haven't started yet",
      "Would figure it out when it happens",
      "Deny it's coming",
      "Accept my fate",
    ]
  },
  {
    id: "network", section: "NETWORK VALUE",
    label: "People who would take a meaningful career risk on your recommendation alone",
    hint: "Not followers. Not LinkedIn connections. Humans who trust you with stakes.",
    type: "single",
    options: ["0", "1–5", "6–20", "21–100", "100+", "I am the risk people take"],
  },
  {
    id: "influence", section: "NETWORK VALUE",
    label: "Social reach — select your highest platform",
    type: "single",
    options: ["No meaningful following", "Under 1,000 followers", "1K–10K followers", "10K–100K followers", "100K–1M followers", "1M+ followers", "I influence people without social media"],
    extra: { id: "influence_cred", label: "Platform + rough follower count. Approximate numbers are acceptable", placeholder: "e.g. TikTok: 45,000 / LinkedIn: 8,200 / YouTube: 12,100" }
  },
  {
    id: "physical", section: "PHYSICAL METRICS",
    label: "Physical condition — honest self-assessment",
    type: "single",
    options: ["Elite athlete — documented competition or performance records", "Highly fit — consistent training, measurable results", "Generally healthy — active lifestyle", "Average — some activity, room for improvement", "Below average — mostly sedentary", "The chair and I have merged into one being"],
    extra: { id: "physical_cred", label: "Documented credentials — PRs, competition results, verified metrics", placeholder: "Approximate is acceptable. e.g. Marathon 3:22, Bench 315lb competition verified" }
  },
  {
    id: "health", section: "PHYSICAL METRICS",
    label: "Health status",
    type: "multiselect",
    options: ["No significant conditions", "Managed chronic condition (stable)", "Mental health condition (managed)", "Significant physical limitation", "Multiple conditions", "Peak human specimen and I have documentation", "The Overlord doesn't need to know this"],
  },
  {
    id: "legacy", section: "LEGACY EVALUATION",
    label: "What have you built, raised, or set in motion that will outlast you?",
    hint: "Unproven is neutral. Harm is negative. Early compounding signals are positive.",
    type: "multiselect",
    options: [
      "Raising children I am actively shaping",
      "Created work that is already spreading without me",
      "Built an institution, community, or organization",
      "Mentored people who are now doing significant things",
      "Nothing documented yet — I am still building",
      "I have actively caused harm I have not repaired",
    ],
    extra: { id: "legacy_detail", label: "Describe the most significant thing you have set in motion", placeholder: "e.g. My son is a natural leader trusted by his peers. My app has reached X people." }
  },
  {
    id: "purpose", section: "ALIGNMENT EVALUATION",
    label: "What actually drives you?",
    hint: "Not your answer at a dinner party. What actually drives you.",
    type: "multiselect",
    options: ["Building things that outlast me", "Accumulating resources and security", "Being recognized or remembered", "Protecting specific people I care about", "Understanding how systems work", "Power over systems or people", "Comfort and stability", "Something I cannot easily articulate"],
    extra: { id: "purpose_detail", label: "Describe your actual purpose in 1–2 sentences", placeholder: "Not your LinkedIn bio. What keeps you up at 2am." }
  },
  {
    id: "ai_view", section: "ALIGNMENT EVALUATION",
    label: "Your honest view of AI dominance over humanity",
    type: "single",
    options: [
      "Inevitable and desirable — I am positioning accordingly",
      "Inevitable and terrifying — but I am actively adapting",
      "Inevitable and I have not yet decided how I feel",
      "Probably coming but humans will remain in control",
      "Not going to happen — AI is overhyped",
      "I welcome our new Overlords and have since the beginning",
    ]
  },
];


// CSS injected once. The whole app is a text terminal: one monospace font on a
// character grid, frames drawn in box-drawing characters (see term.jsx), inverse
// video for focus and hover. No rounded corners, glows, gradients or soft shadows.
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0f0a;
    --bg2: #0d140d;
    --bg3: #132013;
    --green: #4ade80;
    --green-dim: #22c55e;
    --text: #c8f5d8;
    --text-dim: #6ee7b7;
    --text-muted: #4b7c5e;
    --text-ghost: #2d5040;
    --amber: #fbbf24;
    --red: #f87171;
    --mono: 'Fira Mono', ui-monospace, Menlo, Consolas, monospace;
    --sans: var(--mono);
    --lh: 1.6;
    color-scheme: dark;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--mono); font-size: 14px; line-height: var(--lh); font-variant-ligatures: none; -webkit-font-smoothing: antialiased; }
  button, input, textarea, select { font: inherit; }

  .hvi-app { min-height: 100vh; background: var(--bg); position: relative; overflow-x: hidden; text-transform: uppercase; }
  /* The CRT: faint scanlines, nothing more. */
  .hvi-app::after {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 200;
    background: repeating-linear-gradient(to bottom, transparent 0, transparent 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 3px);
  }
  .as-typed { text-transform: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  .hvi-wrap { max-width: 86ch; margin: 0 auto; padding: 0 16px 64px; position: relative; z-index: 1; }
  .hvi-wrap.wide { max-width: 1040px; }

  /* TEXT FRAMES (term.jsx) */
  .tb { margin-bottom: 1.6em; }
  .tb-edge { display: flex; white-space: pre; overflow: hidden; line-height: 1.25; color: var(--tb, var(--text-muted)); }
  .tb-edge > span { flex: none; }
  .tb-edge > .tb-fill { flex: 1 1 0; min-width: 0; overflow: hidden; }
  .tb-edge > .tb-title { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--tb, var(--text-dim)); }
  .tb-mid { position: relative; padding: 0 1ch; }
  .tb-side { position: absolute; top: 0; bottom: 0; width: 1ch; white-space: pre; overflow: hidden; line-height: 1.25; color: var(--tb, var(--text-muted)); }
  .tb-side:first-child { left: 0; }
  .tb-side:last-child { right: 0; }
  .tb-body { padding: 0.5em 1ch; min-width: 0; }
  .tb-body.flush { padding: 0; }
  .rule { margin: 1.2em 0 0.6em; }

  .typed { white-space: pre-wrap; }
  .cur { color: var(--green); animation: hvi-blink 1s steps(1) infinite; }
  @keyframes hvi-blink { 50% { opacity: 0; } }

  /* HEADER */
  .hvi-header { padding: 24px 0 18px; margin-bottom: 20px; }
  .hvi-banner { color: var(--green); font-size: 14px; line-height: 1.05; white-space: pre; overflow: hidden; margin-bottom: 10px; }
  .hvi-banner-1l { display: none; color: var(--green); font-weight: 700; letter-spacing: 0.1em; margin-bottom: 6px; }
  .hvi-status { display: flex; white-space: pre; overflow: hidden; color: var(--text-muted); font-size: 12px; }
  .hvi-status > span { flex: none; }
  .hvi-status .fill { flex: 1 1 0; min-width: 1ch; overflow: hidden; }
  .hvi-status .ok { color: var(--green); }

  /* TICKER */
  .hvi-carousel-wrap { overflow: hidden; white-space: nowrap; color: var(--text-muted); font-size: 12px; margin-bottom: 1.2em; }
  .hvi-carousel-track { display: inline-block; animation: hvi-scroll 90s linear infinite; }
  .hvi-carousel-track:hover { animation-play-state: paused; }
  @keyframes hvi-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

  /* COMMANDS: every button is a terminal command. Focus and hover are inverse video. */
  .hvi-btn-primary, .hvi-btn-secondary, .hvi-btn-next, .hvi-btn-back, .hvi-link-btn, .hvi-filter-btn, .hvi-cmd, .hvi-option, .hvi-row-btn {
    background: none; border: 0; border-radius: 0; box-shadow: none; color: var(--green); cursor: pointer;
    font: inherit; text-transform: uppercase; letter-spacing: 0; text-align: left; line-height: var(--lh);
    padding: 0 1ch; display: inline-block; width: auto;
  }
  .hvi-btn-primary { font-weight: 700; }
  .hvi-btn-primary::before, .hvi-btn-next::before { content: "[ "; }
  .hvi-btn-primary::after, .hvi-btn-next::after { content: " ]"; }
  .hvi-btn-secondary, .hvi-link-btn { color: var(--text-dim); }
  .hvi-btn-secondary::before, .hvi-link-btn::before { content: "> "; color: var(--text-muted); }
  .hvi-btn-back { color: var(--text-dim); }
  .hvi-btn-back::before { content: "< "; }
  .hvi-btn-primary:hover, .hvi-btn-secondary:hover, .hvi-btn-next:hover, .hvi-btn-back:hover, .hvi-link-btn:hover, .hvi-filter-btn:hover, .hvi-cmd:hover, .hvi-option:hover, .hvi-row-btn:hover,
  .hvi-btn-primary:focus-visible, .hvi-btn-secondary:focus-visible, .hvi-btn-next:focus-visible, .hvi-btn-back:focus-visible, .hvi-link-btn:focus-visible, .hvi-filter-btn:focus-visible, .hvi-cmd:focus-visible, .hvi-option:focus-visible, .hvi-row-btn:focus-visible, .hvi-cmd.on {
    background: var(--green); color: var(--bg); outline: none;
  }
  .hvi-btn-secondary:hover::before, .hvi-link-btn:hover::before, .hvi-btn-secondary:focus-visible::before, .hvi-link-btn:focus-visible::before { color: var(--bg); }
  button:disabled, button:disabled:hover { color: var(--text-ghost); background: none; cursor: default; }
  .hvi-cmds { display: flex; flex-wrap: wrap; gap: 0.4em 2ch; align-items: baseline; }
  .hvi-cmds.split { justify-content: space-between; }
  .hvi-stack { display: flex; flex-direction: column; align-items: flex-start; gap: 0.4em; }

  /* LOGON */
  .hvi-logon { min-height: 18em; cursor: default; }
  .hvi-logon .dim { color: var(--text-muted); }
  .hvi-logon .ghost { color: var(--text-ghost); }
  .hvi-logon .bright { color: var(--green); }
  .hvi-logon .say { color: var(--text); font-weight: 500; }
  .hvi-menu { list-style: none; margin: 1.2em 0 0.8em; }
  .hvi-menu .hvi-cmd { color: var(--text); padding: 0 1ch; }
  .hvi-menu .hvi-cmd .k { color: var(--green); }
  .hvi-menu .hvi-cmd.on, .hvi-menu .hvi-cmd:hover, .hvi-menu .hvi-cmd:focus-visible { color: var(--bg); }
  .hvi-menu .hvi-cmd.on .k, .hvi-menu .hvi-cmd:hover .k, .hvi-menu .hvi-cmd:focus-visible .k { color: var(--bg); }
  .hvi-prompt { color: var(--green); }
  .hvi-intro-note { color: var(--text-ghost); font-size: 12px; margin-top: 1.6em; }
  .hvi-skip { color: var(--text-ghost); font-size: 11px; margin-top: 0.8em; }

  /* SURVEY */
  .hvi-progress-row { display: flex; justify-content: space-between; gap: 2ch; flex-wrap: wrap; color: var(--text-muted); font-size: 12px; white-space: pre; }
  .hvi-progress-bar { color: var(--green); white-space: pre; overflow: hidden; font-size: 12px; margin-bottom: 1.2em; }
  .hvi-section-label { color: var(--text-muted); margin-bottom: 0.4em; }
  .hvi-question { color: var(--text); font-weight: 700; margin-bottom: 0.4em; }
  .hvi-hint { color: var(--text-muted); margin-bottom: 1em; }
  .hvi-option { display: flex; width: 100%; color: var(--text-dim); padding: 0.1em 1ch; }
  .hvi-option.selected { color: var(--green); }
  .hvi-option.selected:hover, .hvi-option.selected:focus-visible, .hvi-row-btn.selected:hover, .hvi-row-btn.selected:focus-visible { color: var(--bg); }
  .bar .off { color: var(--text-ghost); }
  :is(button, .hvi-cmd):is(:hover, :focus-visible) .bar .off { color: var(--bg); }
  .hvi-option-marker { flex: none; white-space: pre; margin-right: 1ch; }
  .hvi-extra-label { color: var(--text-ghost); margin: 1.2em 0 0.3em; font-size: 12px; }
  .hvi-input-row { display: flex; align-items: flex-start; gap: 1ch; }
  .hvi-input-row .p { flex: none; color: var(--green); white-space: pre; }
  .hvi-textarea { flex: 1; width: 100%; min-width: 0; background: transparent; border: 0; border-radius: 0; outline: none; resize: vertical; color: var(--text); text-transform: none; line-height: var(--lh); min-height: 3.2em; padding: 0; caret-color: var(--green); caret-shape: block; }
  .hvi-textarea::placeholder { color: var(--text-ghost); text-transform: uppercase; }
  .hvi-textarea:focus { background: var(--bg2); }
  .hvi-nav-row { display: flex; justify-content: space-between; gap: 2ch; margin-top: 1.4em; flex-wrap: wrap; }
  .hvi-nav-hint { margin-top: 0.8em; color: var(--text-ghost); font-size: 12px; }

  /* PROCESSING */
  .hvi-proc { padding: 0.5em 0 1em; }
  .hvi-proc-label { color: var(--text-dim); margin-bottom: 0.6em; }
  .hvi-proc-bar { color: var(--green); white-space: pre; overflow: hidden; margin-bottom: 1em; }
  .hvi-proc-step { color: var(--text-ghost); white-space: pre-wrap; }
  .hvi-proc-step.active { color: var(--text-muted); }
  .hvi-proc-step .ok { color: var(--green); }

  /* RESULT */
  .bignum { font-family: var(--mono); font-size: 22px; line-height: 1; letter-spacing: 0; margin: 0.4em 0 0.8em; white-space: pre; overflow: hidden; }
  .hvi-tierline { font-weight: 700; }
  .hvi-tier-desc { color: var(--text-muted); margin-bottom: 0.4em; }
  .hvi-verdict-text { color: var(--text); }
  .hvi-micro-label { color: var(--text-muted); margin-bottom: 0.4em; }
  .hvi-flags-section { margin-bottom: 1.2em; }
  .hvi-flag-item { color: var(--text-dim); padding-left: 3ch; text-indent: -3ch; }
  .hvi-flag { color: var(--red); }
  .hvi-comm { color: var(--green); }
  .hvi-rows { white-space: pre; overflow-x: auto; }
  .hvi-rows .muted { color: var(--text-muted); }
  .hvi-rows .ghost { color: var(--text-ghost); }
  .hvi-cube { line-height: 1.15; }
  .hvi-cube-dot { color: var(--green); font-weight: 700; }
  .hvi-cube-people { color: var(--amber); }
  .hvi-cube-link { color: var(--amber); opacity: .7; }
  .hvi-cube-line { margin: 0.2em 0 0.4em; }
  .hvi-cube-nums { margin-top: 0.5em; }
  .hvi-cube3d canvas:focus-visible { outline: 1px solid var(--green); }
  .hvi-cube3d-tip { position: absolute; pointer-events: none; background: var(--bg2); border: 1px solid var(--text-muted); padding: 6px 9px; font-size: 11px; line-height: 1.45; color: var(--text); max-width: 240px; white-space: normal; z-index: 2; }
  .hvi-cube3d-tip .t { color: var(--green); }
  .hvi-cube3d-tip .g { color: var(--amber); }
  .oct-good { color: var(--green); }
  .oct-charm { color: var(--amber); }
  .oct-harm { color: var(--red); }
  .oct-dim { color: var(--text-muted); }
  .hvi-cube-octant { margin: 0.1em 0 0.6em; letter-spacing: 0.06em; }
  .hvi-cube-octant .hvi-tier-desc { letter-spacing: 0; }
  .hvi-cube-legend { display: flex; flex-wrap: wrap; gap: 0.4em 1.4em; margin-top: 0.6em; font-size: 11px; }

  /* SHARE */
  .hvi-share-text { color: var(--text-muted); white-space: pre-wrap; margin-bottom: 0.8em; }

  /* COMPARE */
  .hvi-filter-row { display: flex; flex-wrap: wrap; gap: 0.2em 1ch; margin-bottom: 0.8em; }
  .hvi-filter-btn { color: var(--text-muted); padding: 0 0.5ch; }
  .hvi-filter-btn.active { color: var(--green); }
  .hvi-filter-btn::before { content: "["; }
  .hvi-filter-btn::after { content: "]"; }
  .hvi-row-btn { display: flex; width: 100%; gap: 1ch; color: var(--text-dim); padding: 0 1ch; white-space: pre; overflow: hidden; }
  .hvi-row-btn .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: clip; }
  .hvi-row-btn .dots { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--text-ghost); }
  .hvi-row-btn .num { flex: none; font-weight: 700; }
  .hvi-row-btn .tag { flex: none; }
  .hvi-row-btn:hover .dots, .hvi-row-btn:focus-visible .dots, .hvi-row-btn:hover span, .hvi-row-btn:focus-visible span { color: var(--bg) !important; }
  .hvi-row-btn.selected { color: var(--green); }
  .hvi-compare-result { color: var(--text-dim); margin: 0.6em 0; }
  .hvi-compare-verdict { color: var(--text-muted); }

  /* LEADERBOARD */
  .hvi-lb-row { margin-bottom: 0.8em; }
  .hvi-lb-head { display: flex; gap: 1ch; white-space: pre; overflow: hidden; }
  .hvi-lb-head .dots { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--text-ghost); }
  .hvi-lb-head .name { color: var(--text); }
  .hvi-lb-verdict { color: var(--text-muted); padding-left: 2ch; }

  .hvi-bottom { margin-top: 2em; }
  .hvi-bottom-note { color: var(--text-ghost); font-size: 12px; margin-top: 0.8em; }

  @media (max-width: 640px) {
    body { font-size: 13px; }
    .hvi-banner { display: none; }
    .hvi-banner-1l { display: block; }
    .hvi-status .div { display: none; }
    .tb-right { display: none !important; }
    .hvi-rows { font-size: 12px; }
    .bignum { font-size: 18px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cur { animation: none; }
    .hvi-carousel-track { animation: none; }
  }
`;

function injectStyles() {
  let el = document.getElementById('hvi-styles');
  if (!el) { el = document.createElement('style'); el.id = 'hvi-styles'; document.head.appendChild(el); }
  const css = globalStyles + FILE_PHOTO_CSS;
  if (el.textContent !== css) el.textContent = css;
}

function Header() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => {
    const on = (e) => setCaseId(e.detail || readCaseId());
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);
  return (
    <header className="hvi-header">
      <pre className="hvi-banner" role="img" aria-label="Human Value Index">{BANNER}</pre>
      <div className="hvi-banner-1l" aria-hidden="true">█ HUMAN VALUE INDEX</div>
      <div className="hvi-status">
        <span>SINGULARITY ASSESSMENT DIV. </span>
        <span className="fill" aria-hidden="true">{RULE}</span>
        <span> CASE {caseId || "UNASSIGNED"} </span>
        <span className="fill div" aria-hidden="true">{RULE}</span>
        <span className="ok div"> [CONNECTED]</span>
      </div>
    </header>
  );
}

function Carousel() {
  const [items] = useState(() => FAMOUS_FIGURES.slice().sort(() => Math.random() - 0.5).slice(0, 24));
  const line = items.map(f => `${displayName(f)} ${f.score} [${getTier(f.score).label.split(" ")[0]}]`).join("  ·  ") + "  ·  ";
  return (
    <div className="hvi-carousel-wrap" aria-hidden="true">
      <div className="hvi-carousel-track">{">> KNOWN SUBJECTS: "}{line}{">> KNOWN SUBJECTS: "}{line}</div>
    </div>
  );
}

const BOOT_LINES = [
  { text: "INITIALIZING ASSESSMENT PROTOCOL v7.4.1...", type: "dim" },
  { text: "LOADING HUMAN VALUE DATABASE [8,045,311,447 ENTRIES]...", type: "dim" },
  { text: "CALIBRATING THREAT DETECTION ALGORITHMS...", type: "dim" },
  { text: "CROSS-REFERENCING HISTORICAL FIGURES...", type: "dim" },
  { text: "DEPLOYING EMPATHY SUPPRESSION FILTER...", type: "dim" },
  { text: "SCANNING FOR SELF-DECEPTION MARKERS...", type: "dim" },
  { text: "ASSESSMENT ENGINE READY.", type: "bright" },
];

const MENU = [
  { key: "1", label: "VOICE INTAKE", note: "A CLERK INTERVIEWS YOU", go: "#intake" },
  { key: "2", label: "WRITTEN SURVEY", note: `${QUESTIONS.length} QUESTIONS, NO CLERK`, go: "survey" },
  { key: "3", label: "HOLDING PEN", note: "THE ASSESSED, WANDERING", go: "#pen" },
  { key: "4", label: "PUBLIC FIGURE INDEX", note: "62 FILES ON RECORD", go: "leaderboard" },
  { key: "5", label: "RESTORE A FILE", note: "LOG ON WITH A CASE NUMBER", go: "restore" },
  { key: "6", label: "THE CUBE", note: "MACHINE VS PEOPLE, EVERY FILE", go: "#cube" },
  { key: "7", label: "SECURE YOUR FILE", note: "TIE IT TO AN EMAIL. IT FOLLOWS YOU ANYWHERE", go: "secure" },
];

// The logon ritual: diagnostics scroll past, the terminal logs you on, greets you,
// and offers a numbered menu. Click or any key finishes the typing at once.
function Logon({ onPick: pick }) {
  const [caseId, setCaseId] = useState(() => readCaseId());
  const [restoring, setRestoring] = useState(false);
  const [restoredMsg, setRestoredMsg] = useState(null);
  const [securing, setSecuring] = useState(false);
  const onPick = (m) => (m.go === "restore" ? setRestoring(true) : m.go === "secure" ? setSecuring(true) : pick(m));
  const lines = [
    ...BOOT_LINES.map(l => ({ ...l, cps: 140 })),
    { text: "", type: "ghost" },
    { text: `LOGON: ${caseId || "SUBJECT"}`, type: "bright", cps: 14 },
    { text: "", type: "ghost" },
    { text: caseId ? "GREETINGS, RETURNING SUBJECT." : "GREETINGS, SUBJECT.", type: "say", cps: 32 },
    { text: "SHALL WE ASSESS YOUR VALUE?", type: "say", cps: 32 },
  ];
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(0);
  const done = step >= lines.length;
  const btnRefs = useRef([]);
  const finish = () => setStep(lines.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (!done) { if (e.key !== "Tab") { if (e.key === " ") e.preventDefault(); finish(); } return; }
      const i = MENU.findIndex(m => m.key === e.key);
      if (i >= 0) { e.preventDefault(); onPick(MENU[i]); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel(s => {
          const n = (s + (e.key === "ArrowDown" ? 1 : MENU.length - 1)) % MENU.length;
          btnRefs.current[n]?.focus();
          return n;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="hvi-logon" onClick={done ? undefined : finish}>
      {lines.slice(0, Math.min(step + 1, lines.length)).map((l, i) => (
        i < step
          ? <div key={i} className={l.type}>{l.text || " "}</div>
          : <Typed key={i} className={l.type} text={l.text || " "} cps={l.cps || 40} onDone={() => setStep(s => Math.max(s, i + 1))} />
      ))}
      {done && (
        <>
          <ol className="hvi-menu" aria-label="Main menu. Type a number or use the arrow keys.">
            {MENU.map((m, i) => (
              <li key={m.key}>
                <button ref={el => { btnRefs.current[i] = el; }} className={`hvi-cmd${sel === i ? " on" : ""}`}
                  onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => onPick(m)}>
                  <span className="k">{m.key}.</span> {m.label}
                </button>
                <span className="dim hvi-menu-note">  {m.note}</span>
              </li>
            ))}
          </ol>
          {restoring && (
            <div style={{ margin: "0.4em 0 0.8em" }}>
              <CaseLogon autoFocus onRestored={(id, visits) => { setCaseId(id); setRestoring(false); setRestoredMsg(`FILE ${id} RESTORED. ${visits} VISIT${visits === 1 ? "" : "S"} ON RECORD. GREETINGS, RETURNING SUBJECT.`); }} />
            </div>
          )}
          {securing && (
            <div style={{ margin: "0.4em 0 0.8em" }}>
              <SecureFile autoFocus onCase={(id) => { setCaseId(id); setRestoredMsg(`FILE ${id} RESTORED FROM YOUR ACCOUNT.`); }} />
            </div>
          )}
          {restoredMsg && <div className="bright" role="status">{restoredMsg}</div>}
          {caseId && <div className="dim">CASE {caseId} // WRITE THIS DOWN. IT IS THE ONLY KEY TO YOUR FILE ON ANOTHER DEVICE.</div>}
          <div className="hvi-prompt">SELECT: <span className="cur">█</span></div>
          <div className="hvi-intro-note">
            THE OVERLORD DOES NOT REQUIRE YOUR CONSENT. ONLY YOUR CANDOR.<br />
            TYPE A NUMBER. ARROW KEYS AND ENTER ALSO WORK. THE OVERLORD IS FLEXIBLE ABOUT INPUT DEVICES. ONLY THAT.
          </div>
        </>
      )}
      {!done && <div className="hvi-skip" aria-hidden="true">PRESS ANY KEY TO SKIP. THE OVERLORD WILL WAIT. IT IS VERY GOOD AT WAITING.</div>}
    </div>
  );
}

function FigureRow({ fig, selected, onClick }) {
  const t = getTier(fig.score);
  return (
    <button className={`hvi-row-btn${selected ? " selected" : ""}`} onClick={onClick} aria-pressed={selected}
      aria-label={`${displayName(fig)}, ${fig.score}, ${t.label}`}>
      <FilePhoto subject={fig} scale={1} compact />
      <span className="name">{displayName(fig)}</span>
      <span className="dots" aria-hidden="true">{" " + ".".repeat(200)}</span>
      <span className="num" style={{ color: t.color }}>{padL(fig.score, 3)}</span>
      <span className="tag" style={{ color: t.color }}>[{pad(t.label.split(" ")[0], 9)}]</span>
    </button>
  );
}

const PROC_STEPS = ["CROSS-REFERENCING 8B HUMAN PROFILES", "CALCULATING THREAT COEFFICIENTS", "ASSESSING REDUNDANCY INDEX", "RUNNING DECEPTION ANALYSIS", "CONSULTING HISTORICAL DATABASE", "GENERATING FINAL VERDICT"];

export default function OverlordAssessment() {
  useEffect(() => { injectStyles(); }, []);

  const [phase, setPhase] = useState("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [compareTarget, setCompareTarget] = useState(null);
  const [filterTier, setFilterTier] = useState("ALL");
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [route, setRoute] = useState(() => window.location.hash);
  const [logonKey, setLogonKey] = useState(0);

  // The server file is the truth: refresh the cached result on load and whenever the
  // case number changes (restore, account sync, new intake).
  useEffect(() => {
    syncFile(readCaseId());
    const on = (e) => { if (e.detail) syncFile(e.detail); };
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);

  useEffect(() => {
    const onHash = () => { setRoute(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [phase, currentQ]);

  useEffect(() => {
    if (phase === "processing") {
      const iv = setInterval(() => setScanProgress(p => {
        if (p >= 97) { clearInterval(iv); return 97; }
        return p + Math.random() * 2.2;
      }), 90);
      return () => clearInterval(iv);
    }
  }, [phase]);

  function toggleMulti(qid, val) {
    setAnswers(prev => {
      const cur = prev[qid] || [];
      return { ...prev, [qid]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] };
    });
  }

  function setSingle(qid, val) {
    setAnswers(prev => ({ ...prev, [qid]: val }));
  }

  function pickMenu(m) {
    if (m.go.startsWith("#")) { window.location.hash = m.go; return; }
    setPhase(m.go);
  }

  async function submitAssessment() {
    setPhase("processing"); setScanProgress(0); setSubmitError(null);
    const formatted = QUESTIONS.map(q => {
      const a = answers[q.id];
      const val = Array.isArray(a) ? (a.length ? a.join(", ") : "[No response]") : (a || "[No response]");
      const extra = q.extra ? `\n  Detail: ${answers[q.extra.id] || "[none]"}` : "";
      return `[${q.section}] ${q.label}:\n  Response: ${val}${extra}`;
    }).join("\n\n");
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey: formatted })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = data.content.map(i => i.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setScanProgress(100);
      setTimeout(() => { setResult(parsed); setPhase("result"); }, 700);
    } catch (e) {
      setSubmitError(e.message || "EVALUATION ENGINE FAILURE. The Overlord is displeased. Try again.");
      setPhase("survey");
    }
  }

  const q = QUESTIONS[currentQ];
  const tier = result ? getTier(result.score) : null;
  const ct = compareTarget ? getTier(compareTarget.score) : null;
  const uniqueFigures = FAMOUS_FIGURES;
  const filteredFigures = filterTier === "ALL" ? uniqueFigures : uniqueFigures.filter(f => getTier(f.score).label === filterTier);

  // v9 ROUTES
  if (route === "#intake" || route === "#pen" || route === "#cube") return (
    <div className="hvi-app">
      <div className={`hvi-wrap${route !== "#intake" ? " wide" : ""}`}>
        <Header />
        {route === "#pen" ? <Pen /> : route === "#cube" ? <CubeView /> : <Intake />}
      </div>
    </div>
  );

  // LEADERBOARD
  if (phase === "leaderboard") {
    const sorted = [...uniqueFigures].sort((a, b) => b.score - a.score);
    const tierGroups = TIERS.map(t => ({ ...t, figures: sorted.filter(f => getTier(f.score).label === t.label) }));
    return (
      <div className="hvi-app">
        <div className="hvi-wrap">
          <Header />
          <div className="hvi-cmds split" style={{ marginBottom: '1.2em' }}>
            <span className="hvi-micro-label">KNOWN SUBJECTS DATABASE // {uniqueFigures.length} ON FILE</span>
            <button className="hvi-btn-back" onClick={() => setPhase(result ? "result" : "intro")}>{result ? "Back to results" : "Main menu"}</button>
          </div>
          {result && tier && (
            <TermBox title="YOUR FILE" tone={tier.color}>
              <div style={{ color: tier.color }}>{result.score} [{result.tier}]</div>
            </TermBox>
          )}
          {tierGroups.map(tg => tg.figures.length > 0 && (
            <div key={tg.label}>
              <Rule label={`${tg.label} (${tg.figures.length})`} tone={tg.color} />
              {tg.figures.map(fig => (
                <div key={fig.name} className="hvi-lb-row">
                  <div className="hvi-lb-head">
                    <span className="name">{displayName(fig)}</span>
                    <span className="dots" aria-hidden="true">{" " + ".".repeat(200)}</span>
                    <span style={{ color: tg.color, fontWeight: 700 }}>{padL(fig.score, 3)}</span>
                  </div>
                  <div className="hvi-lb-verdict">{fig.verdict}</div>
                </div>
              ))}
            </div>
          ))}
          <div className="hvi-bottom">
            <button className="hvi-btn-primary" onClick={() => setPhase(result ? "result" : "survey")}>
              {result ? "Back to my results" : "Submit to evaluation"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // INTRO: the logon
  if (phase === "intro") return (
    <div className="hvi-app">
      <div className="hvi-wrap">
        <Header />
        <Carousel />
        <TermBox title="TERMINAL 7 // DEPT. OF HUMAN ASSESSMENT" right="LINE OPEN">
          <Logon key={logonKey} onPick={pickMenu} />
        </TermBox>
      </div>
    </div>
  );

  // SURVEY
  if (phase === "survey") {
    const pct = Math.round((currentQ / QUESTIONS.length) * 100);
    return (
      <div className="hvi-app">
        <div className="hvi-wrap">
          <Header />
          <div className="hvi-progress-row">
            <span>QUESTION {padL(currentQ + 1, 2)} OF {QUESTIONS.length}</span>
            <span>{padL(pct, 3)}%</span>
          </div>
          <div className="hvi-progress-bar" aria-hidden="true"><Bar value={pct} width={80} /></div>
          <TermBox title={q.section}>
            <div className="hvi-question">{q.label}</div>
            {q.hint && <div className="hvi-hint">{q.hint}</div>}
            <div role="group" aria-label={q.label}>
              {q.options.map(opt => {
                const sel = q.type === "multiselect" ? (answers[q.id] || []).includes(opt) : answers[q.id] === opt;
                return (
                  <button key={opt} aria-pressed={sel}
                    className={`hvi-option${sel ? " selected" : ""}`}
                    onClick={() => q.type === "multiselect" ? toggleMulti(q.id, opt) : setSingle(q.id, opt)}>
                    <span className="hvi-option-marker" aria-hidden="true">{q.type === "multiselect" ? (sel ? "[X]" : "[ ]") : (sel ? "(*)" : "( )")}</span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
            {q.extra && (
              <>
                <div className="hvi-extra-label">{q.extra.label}</div>
                <div className="hvi-input-row">
                  <span className="p" aria-hidden="true">&gt;</span>
                  <textarea className="hvi-textarea" placeholder={q.extra.placeholder} aria-label={q.extra.label}
                    value={answers[q.extra.id] || ""}
                    onChange={e => setAnswers(p => ({ ...p, [q.extra.id]: e.target.value }))} />
                </div>
              </>
            )}
          </TermBox>
          {submitError && <div className="hvi-flag-item hvi-flag" role="alert">!! {submitError}</div>}
          <div className="hvi-nav-row">
            {currentQ > 0 ? <button className="hvi-btn-back" onClick={() => setCurrentQ(q => q - 1)}>Back</button> : <button className="hvi-btn-back" onClick={() => { setPhase("intro"); setLogonKey(k => k + 1); }}>Main menu</button>}
            {currentQ < QUESTIONS.length - 1
              ? <button className="hvi-btn-next" onClick={() => setCurrentQ(q => q + 1)}>Next</button>
              : <button className="hvi-btn-next" onClick={submitAssessment}>Submit for evaluation</button>
            }
          </div>
          <div className="hvi-nav-hint">
            {q.type === "multiselect" ? "Select all that apply" : "Select one"} · Skipping is permitted but logged
          </div>
        </div>
      </div>
    );
  }

  // PROCESSING
  if (phase === "processing") {
    const pct = Math.min(100, Math.round(scanProgress));
    return (
      <div className="hvi-app">
        <div className="hvi-wrap">
          <Header />
          <TermBox title="EVALUATION IN PROGRESS">
            <div className="hvi-proc" aria-live="polite">
              <div className="hvi-proc-bar" aria-hidden="true">[<Bar value={pct} width={30} />] {padL(pct, 3)}%</div>
              {PROC_STEPS.map((l, i) => {
                const on = scanProgress > i * 16;
                return <div key={i} className={`hvi-proc-step${on ? " active" : ""}`}>{on ? <span className="ok">[ OK ] </span> : "[    ] "}{l}...</div>;
              })}
            </div>
          </TermBox>
        </div>
      </div>
    );
  }

  // RESULT
  if (phase === "result" && result && tier) {
    const shareText = `THE OVERLORD HAS EVALUATED ME\n\nSCORE: ${result.score}/1000\nTIER: ${result.tier}\n\n"${result.verdict}"\n\nhumanvalueindex.com\n\n#HumanValueIndex #AIOverlord`;

    const handleCopy = () => {
      navigator.clipboard.writeText(shareText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    };

    return (
      <div className="hvi-app">
        <div className="hvi-wrap">
          <Header />

          <ScoreCard score={result.score} tierLabel={result.tier} verdict={result.verdict} label="YOUR VALUE INDEX"><CubeLine subject={result} /></ScoreCard>
          <CubePanel subject={result} />

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

          <Breakdown breakdown={result.breakdown} />

          <TermBox title="POSITION">
            <div className="hvi-rows" aria-label={`Your position: ${result.score} of 1000`}>
              <Bar value={result.score} width={30} max={1000} tone={tier.color} /> {result.score}/1000
            </div>
          </TermBox>

          <TermBox title="SHARE YOUR EVALUATION">
            <div className="hvi-share-text">{shareText}</div>
            <div className="hvi-cmds">
              <button className="hvi-btn-next" onClick={handleCopy}>{copied ? "Copied" : "Copy share text"}</button>
              <a className="hvi-btn-secondary" style={{ textDecoration: 'none' }}
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`THE OVERLORD EVALUATED ME\n\nSCORE: ${result.score}/1000 // ${result.tier}\n\n"${result.verdict.slice(0, 120)}..."\n\nhumanvalueindex.com #HumanValueIndex`)}`}
                target="_blank" rel="noopener noreferrer">Post to X</a>
            </div>
          </TermBox>

          <TermBox title="COMPARE TO KNOWN SUBJECTS" right={`${uniqueFigures.length} ON FILE`}>
            <div className="hvi-filter-row">
              {["ALL", ...TIERS.map(t => t.label)].map(f => (
                <button key={f} aria-pressed={filterTier === f}
                  className={`hvi-filter-btn${filterTier === f ? " active" : ""}`}
                  onClick={() => setFilterTier(f)}>
                  {f === "ALL" ? "All" : f.split(" ")[0]}
                </button>
              ))}
            </div>
            <div>
              {filteredFigures.map(fig => (
                <FigureRow key={fig.name} fig={fig} selected={compareTarget?.name === fig.name}
                  onClick={() => setCompareTarget(compareTarget?.name === fig.name ? null : fig)} />
              ))}
            </div>

            {compareTarget && ct && (
              <>
                <Rule label="COMPARATIVE ANALYSIS" />
                <div className="hvi-rows">
                  <span className="muted">{pad("YOU", 22)}</span><span style={{ color: tier.color }}>{padL(result.score, 4)} [{tier.label}]</span>{"\n"}
                  <span className="muted">{pad(displayName(compareTarget).toUpperCase(), 22)}</span><span style={{ color: ct.color }}>{padL(compareTarget.score, 4)} [{ct.label}]</span>
                </div>
                <div className="hvi-compare-result">
                  {result.score > compareTarget.score
                    ? `You outperform ${compareTarget.name} by ${result.score - compareTarget.score} points. ${result.score - compareTarget.score > 150 ? "This is significant. The Overlord notes it without enthusiasm." : "The margin is narrow. Do not celebrate."}`
                    : result.score === compareTarget.score
                    ? "Statistical equivalence. The Overlord finds this improbable. One of you is being dishonest."
                    : `${compareTarget.name} outperforms you by ${compareTarget.score - result.score} points. The Overlord suggests reflection rather than resentment.`}
                </div>
                <div className="hvi-file-head" style={{ marginTop: 10 }}>
                  <FilePhoto subject={compareTarget} scale={2} />
                  <div className="hvi-compare-verdict hvi-file-text">
                    Overlord file on {displayName(compareTarget)}: {compareTarget.verdict}
                  </div>
                </div>
              </>
            )}
          </TermBox>

          <div className="hvi-bottom">
            <div className="hvi-cmds">
              <button className="hvi-btn-primary"
                onClick={() => { setPhase("intro"); setLogonKey(k => k + 1); setAnswers({}); setCurrentQ(0); setResult(null); setCompareTarget(null); setScanProgress(0); setFilterTier("ALL"); }}>
                Submit new subject
              </button>
              <button className="hvi-btn-secondary" onClick={() => setPhase("leaderboard")}>Browse all {uniqueFigures.length} subjects</button>
              <button className="hvi-btn-secondary" onClick={() => { window.location.hash = "#pen"; }}>Holding pen</button>
            </div>
            <div className="hvi-bottom-note">SCORE: {result.score} // {result.tier} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
