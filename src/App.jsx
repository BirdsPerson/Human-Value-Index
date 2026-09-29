import { useState, useEffect, useRef, lazy, Suspense } from "react";
import CubePanel, { CubeChips, cubePlace, cubeOf } from "./CubePanel.jsx";
import { FAMOUS_FIGURES, TIERS, getTier, displayName } from "./figures.js";
import { ScoreCard, Breakdown, readCaseId, CaseLogon, syncFile, assessedMeta, FlagsList, flagsMeta } from "./caseFile.jsx";
import FilePhoto, { FILE_PHOTO_CSS } from "./FilePhoto.jsx";
import { TermBox, Rule, Typed, Bar, pad, padL } from "./term.jsx";
import { AppHeader, CommandBar, navKeyFor, Command, CommandList, Button, ButtonRow, Disclosure, Frame, TextField, ListRow, bootSeen, markBootSeen } from "./ui/index.js";

// Route-level splitting: the logon ships only what it renders. Each heavy view (the
// voice intake and its SDK, the pen, the cube, the city) arrives when first opened.
const Intake = lazy(() => import("./Intake.jsx"));
const Pen = lazy(() => import("./Pen.jsx"));
const CubeView = lazy(() => import("./CubeView.jsx"));
const City = lazy(() => import("./city/City.jsx"));
// The Public Figure Index and the result's compare list: not on the logon's first paint.
const FigureIndex = lazy(() => import("./FigureIndex.jsx"));
const FigurePicker = lazy(() => import("./FigureIndex.jsx").then(m => ({ default: m.FigurePicker })));

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
// video for selected. No rounded corners, glows, gradients or soft shadows.
// Colours, sizes and spacing are tokens (src/ui/tokens.css); components are src/ui/.
const globalStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  button, input, textarea, select { font: inherit; }

  .hvi-app { min-height: 100vh; min-height: 100dvh; background: var(--bg); position: relative; overflow-x: clip; text-transform: uppercase; }
  /* The CRT: faint scanlines, nothing more. */
  .hvi-app::after {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 200;
    background: repeating-linear-gradient(to bottom, transparent 0, transparent 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 3px);
  }
  .as-typed { text-transform: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  /* Typed text keeps a screen-reader copy beside the visible one; copying the page must not grab both. */
  .typed > .sr-only { user-select: none; -webkit-user-select: none; }

  .hvi-wrap { max-width: 86ch; margin: 0 auto; padding: 0 max(var(--gutter), var(--safe-r)) var(--s6) max(var(--gutter), var(--safe-l)); position: relative; z-index: 1; }
  .hvi-wrap.wide { max-width: 1040px; }

  /* TEXT FRAMES (term.jsx) */
  .tb { margin-bottom: var(--s5); }
  .tb-edge { display: flex; white-space: pre; overflow: hidden; line-height: 1.25; color: var(--tb, var(--fg-mute)); }
  .tb-edge > span { flex: none; }
  .tb-edge > .tb-fill { flex: 1 1 0; min-width: 0; overflow: hidden; }
  .tb-edge > .tb-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--tb, var(--fg-dim)); }
  .tb-mid { position: relative; padding: 0 1ch; }
  .tb-side { position: absolute; top: 0; bottom: 0; width: 1ch; white-space: pre; overflow: hidden; line-height: 1.25; color: var(--tb, var(--fg-mute)); }
  .tb-side:first-child { left: 0; }
  .tb-side:last-child { right: 0; }
  .tb-body { padding: var(--s2) 1ch; min-width: 0; }
  .tb-body.flush { padding: 0; }
  .rule { margin: var(--s4) 0 var(--s2); }

  .typed { white-space: pre-wrap; }
  .cur { color: var(--accent); animation: hvi-blink 1s steps(1) infinite; }
  @keyframes hvi-blink { 50% { opacity: 0; } }

  /* TICKER */
  .hvi-carousel-wrap { overflow: hidden; white-space: nowrap; color: var(--fg-mute); font-size: var(--t-xs); margin-bottom: var(--s4); }
  .hvi-carousel-track { display: inline-block; animation: hvi-scroll 90s linear infinite; }
  .hvi-carousel-track:hover { animation-play-state: paused; }
  @keyframes hvi-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

  /* LEGACY COMMANDS. New screens use Button / Command / Chip from src/ui. These keep the
     older screens working and touch-sized until they are ported. */
  .hvi-btn-primary, .hvi-btn-secondary, .hvi-btn-next, .hvi-btn-back, .hvi-link-btn, .hvi-filter-btn, .hvi-cmd, .hvi-option, .hvi-row-btn {
    background: none; border: 0; border-radius: 0; box-shadow: none; color: var(--accent); cursor: pointer;
    font: inherit; text-transform: uppercase; letter-spacing: 0; text-align: left; line-height: var(--lh);
    padding: 0 1ch; display: inline-block; width: auto;
  }
  .hvi-btn-primary { font-weight: 700; }
  .hvi-btn-primary::before, .hvi-btn-next::before { content: "[ "; }
  .hvi-btn-primary::after, .hvi-btn-next::after { content: " ]"; }
  .hvi-btn-secondary, .hvi-link-btn { color: var(--fg-dim); }
  .hvi-btn-secondary::before, .hvi-link-btn::before { content: "> "; color: var(--fg-mute); }
  .hvi-btn-back { color: var(--fg-dim); }
  .hvi-btn-back::before { content: "< "; }
  @media (hover: hover) { .hvi-btn-primary:hover, .hvi-btn-secondary:hover, .hvi-btn-next:hover, .hvi-btn-back:hover, .hvi-link-btn:hover, .hvi-filter-btn:hover, .hvi-cmd:hover, .hvi-option:hover, .hvi-row-btn:hover { background: var(--accent); color: var(--accent-ink); outline: none; } }
  .hvi-btn-primary:focus-visible, .hvi-btn-secondary:focus-visible, .hvi-btn-next:focus-visible, .hvi-btn-back:focus-visible, .hvi-link-btn:focus-visible, .hvi-filter-btn:focus-visible, .hvi-cmd:focus-visible, .hvi-option:focus-visible, .hvi-row-btn:focus-visible, .hvi-cmd.on {
    background: var(--accent); color: var(--accent-ink); outline: none;
  }
  .hvi-btn-secondary:hover::before, .hvi-link-btn:hover::before, .hvi-btn-secondary:focus-visible::before, .hvi-link-btn:focus-visible::before { color: var(--accent-ink); }
  button:disabled, button:disabled:hover { color: var(--fg-mute); background: none; cursor: default; }
  .hvi-cmds { display: flex; flex-wrap: wrap; gap: var(--s2) 2ch; align-items: baseline; }
  .hvi-cmds.split { justify-content: space-between; }
  .hvi-stack { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s2); }
  /* Touch: every legacy command gets a 44px target and centres its label in it. */
  @media (max-width: 720px), (pointer: coarse) {
    .hvi-btn-primary, .hvi-btn-secondary, .hvi-btn-next, .hvi-btn-back, .hvi-link-btn, .hvi-filter-btn, .hvi-cmd, .hvi-row-btn, .hvi-appeal-tog, .hvi-refer-pick {
      min-height: var(--hit-min); display: inline-flex; align-items: center;
    }
    .hvi-row-btn, .hvi-refer-pick { display: flex; }
    .hvi-option { min-height: var(--hit-min); align-items: center; }
    .hvi-appeal-tog { min-width: var(--hit-min); justify-content: flex-start; }
    .hvi-cmds { align-items: center; gap: 0 2ch; }
    .hvi-stack { gap: 0; }
    details > summary.hvi-cmd, .hvi-city-rooms summary { min-height: var(--hit-min); display: flex; align-items: center; }
    input.hvi-textarea, input.hvi-refer-input, .hvi-input-row input { min-height: var(--hit-min) !important; }
  }
  /* Inputs are 16px on phones: under that, iOS Safari zooms the page on focus. */
  @media (max-width: 720px), (pointer: coarse) {
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select { font-size: var(--t-m) !important; }
  }

  /* LOGON */
  .hvi-logon { min-height: 18em; cursor: default; }
  .hvi-logon .dim { color: var(--fg-mute); }
  .hvi-logon .ghost { color: var(--fg-mute); }
  .hvi-logon .bright { color: var(--accent); }
  .hvi-logon .say { color: var(--fg); font-weight: 500; }
  .hvi-logon.quick { min-height: 0; }
  .hvi-logon .say.big { font-size: var(--t-l); line-height: var(--lh-tight); margin-top: var(--s2); }
  .hvi-prompt { color: var(--accent); }
  .hvi-whatis { color: var(--fg-dim); font-size: var(--t-s); line-height: var(--lh-body, 1.5); margin: var(--s2) 0 var(--s3); max-width: 60ch; }
  .hvi-intro-note { color: var(--fg-mute); font-size: var(--t-xs); margin-top: var(--s5); }
  .hvi-skip { color: var(--fg-mute); font-size: var(--t-xs); margin-top: var(--s1); }
  @media (pointer: coarse) { .hvi-desk-only { display: none; } }

  /* SURVEY */
  .hvi-progress-row { display: flex; justify-content: space-between; gap: 2ch; flex-wrap: wrap; color: var(--fg-mute); font-size: var(--t-xs); white-space: pre; }
  .hvi-progress-bar { color: var(--accent); white-space: pre; overflow: hidden; font-size: var(--t-xs); margin-bottom: var(--s4); }
  .hvi-section-label { color: var(--fg-mute); margin-bottom: var(--s1); }
  .hvi-question { color: var(--fg); font-weight: 700; margin-bottom: var(--s1); }
  .hvi-hint { color: var(--fg-mute); margin-bottom: var(--s4); }
  .hvi-option { display: flex; width: 100%; color: var(--fg-dim); padding: 2px 1ch; }
  .hvi-option.selected { color: var(--accent); }
  .hvi-option.selected:hover, .hvi-option.selected:focus-visible, .hvi-row-btn.selected:hover, .hvi-row-btn.selected:focus-visible { color: var(--accent-ink); }
  .bar .off { color: var(--fg-ghost); }
  :is(button, .hvi-cmd):is(:hover, :focus-visible) .bar .off { color: var(--accent-ink); }
  .hvi-option-marker { flex: none; white-space: pre; margin-right: 1ch; }
  .hvi-extra-label { color: var(--fg-mute); margin: var(--s4) 0 var(--s1); font-size: var(--t-xs); }
  .hvi-input-row { display: flex; align-items: flex-start; gap: 1ch; }
  .hvi-input-row .p { flex: none; color: var(--accent); white-space: pre; }
  .hvi-textarea { flex: 1; width: 100%; min-width: 0; background: transparent; border: 0; border-radius: 0; outline: none; resize: vertical; color: var(--fg); text-transform: none; line-height: var(--lh); min-height: 3.2em; padding: 0; caret-color: var(--accent); caret-shape: block; }
  .hvi-textarea::placeholder { color: var(--fg-mute); text-transform: uppercase; }
  .hvi-textarea:focus { background: var(--panel); }
  .hvi-nav-row { display: flex; justify-content: space-between; gap: 2ch; margin-top: var(--s5); flex-wrap: wrap; }
  .hvi-nav-hint { margin-top: var(--s3); color: var(--fg-mute); font-size: var(--t-xs); }

  /* PROCESSING */
  .hvi-proc { padding: var(--s2) 0 var(--s4); }
  .hvi-proc-label { color: var(--fg-dim); margin-bottom: var(--s2); }
  .hvi-proc-bar { color: var(--accent); white-space: pre; overflow: hidden; margin-bottom: var(--s4); }
  .hvi-proc-step { color: var(--fg-mute); white-space: pre-wrap; }
  .hvi-proc-step.active { color: var(--fg-dim); }
  .hvi-proc-step .ok { color: var(--accent); }

  /* RESULT. The score stays in block digits; phones get them big. */
  .bignum { font-family: var(--mono); font-size: var(--t-l); line-height: 1; letter-spacing: 0; margin: var(--s2) 0 var(--s3); white-space: pre; overflow: hidden; }
  .hvi-tierline { font-weight: 700; }
  .hvi-tier-desc { color: var(--fg-mute); margin-bottom: var(--s1); }
  .hvi-verdict-text { color: var(--fg); }
  .hvi-micro-label { color: var(--fg-mute); margin-bottom: var(--s1); }
  .hvi-flags-section { margin-bottom: var(--s4); }
  .hvi-flag-item { color: var(--fg-dim); padding-left: 3ch; text-indent: -3ch; }
  .hvi-flag { color: var(--harm); }
  .hvi-comm { color: var(--accent); }
  .hvi-rows { white-space: pre; overflow-x: auto; }
  .hvi-rows .muted { color: var(--fg-mute); }
  .hvi-rows .ghost { color: var(--fg-mute); }
  .hvi-cube { line-height: 1.15; }
  .hvi-cube-dot { color: var(--accent); font-weight: 700; }
  .hvi-cube-people { color: var(--warn); }
  .hvi-cube-link { color: var(--warn); opacity: .7; }
  .hvi-cube-line { margin: 2px 0 var(--s1); }
  .hvi-cube-nums { margin-top: var(--s2); }
  .hvi-cube3d canvas:focus-visible { outline: var(--focus); }
  .hvi-cube3d-tip { position: absolute; pointer-events: none; background: var(--panel); border: var(--bw) solid var(--fg-mute); padding: 6px 9px; font-size: var(--t-xs); line-height: 1.45; color: var(--fg); max-width: 240px; white-space: normal; z-index: 2; }
  .hvi-cube3d-tip .t { color: var(--accent); }
  .hvi-cube3d-tip .g { color: var(--warn); }
  .oct-good { color: var(--accent); }
  .oct-charm { color: var(--warn); }
  .oct-harm { color: var(--harm); }
  .oct-dim { color: var(--fg-mute); }
  .hvi-cube-octant { margin: 2px 0 var(--s2); letter-spacing: 0.06em; }
  .hvi-cube-octant .hvi-tier-desc { letter-spacing: 0; }
  .hvi-cube-legend { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s5); margin-top: var(--s2); font-size: var(--t-xs); }

  /* SHARE */
  .hvi-share-text { color: var(--fg-mute); white-space: pre-wrap; margin-bottom: var(--s3); }

  /* COMPARE */
  .hvi-filter-row { display: flex; flex-wrap: wrap; gap: 2px 1ch; margin-bottom: var(--s3); }
  .hvi-filter-btn { color: var(--fg-mute); padding: 0 0.5ch; }
  .hvi-filter-btn.active { color: var(--accent); }
  .hvi-filter-btn::before { content: "["; }
  .hvi-filter-btn::after { content: "]"; }
  .hvi-row-btn { display: flex; width: 100%; gap: 1ch; color: var(--fg-dim); padding: 0 1ch; white-space: pre; overflow: hidden; }
  .hvi-row-btn .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: clip; }
  .hvi-row-btn .dots { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--fg-ghost); }
  .hvi-row-btn .num { flex: none; font-weight: 700; }
  .hvi-row-btn .tag { flex: none; }
  .hvi-row-btn:hover .dots, .hvi-row-btn:focus-visible .dots, .hvi-row-btn:hover span, .hvi-row-btn:focus-visible span { color: var(--accent-ink) !important; }
  .hvi-row-btn.selected { color: var(--accent); }
  .hvi-compare-result { color: var(--fg-dim); margin: var(--s2) 0; }
  .hvi-compare-verdict { color: var(--fg-mute); }

  /* LEADERBOARD */
  .hvi-lb-row { margin-bottom: var(--s3); }
  .hvi-lb-head { display: flex; gap: 1ch; white-space: pre; overflow: hidden; }
  .hvi-lb-head .dots { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--fg-ghost); }
  .hvi-lb-head .name { color: var(--fg); }
  .hvi-lb-verdict { color: var(--fg-mute); padding-left: 2ch; }

  .hvi-bottom { margin-top: var(--s6); }
  .hvi-bottom-note { color: var(--fg-mute); font-size: var(--t-xs); margin-top: var(--s3); }

  @media (max-width: 640px) {
    .tb-right { display: none !important; }
    .hvi-rows { font-size: var(--t-xs); }
    .bignum { font-size: var(--t-s); }   /* five rows: ~70px of block digits */
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

// Six destinations. Restoring and securing a file live under the list (and in MY FILE).
const MENU = [
  { key: "1", label: "INTAKE INTERVIEW", note: "SPEAK OR TYPE · ABOUT 5 MIN", go: "#intake" },
  { key: "2", label: "WRITTEN SURVEY", note: `${QUESTIONS.length} QUESTIONS. NO CLERK.`, go: "survey" },
  { key: "3", label: "THE SUBSTRATE", note: "THE CITY. EVERYONE HAS A JOB NOW", go: "#city" },
  { key: "4", label: "HOLDING PEN", note: "THE ASSESSED, WANDERING", go: "#pen" },
  { key: "5", label: "THE CUBE", note: "MACHINE VS PEOPLE, EVERY FILE", go: "#cube" },
  { key: "6", label: "PUBLIC FIGURE INDEX", note: `${FAMOUS_FIGURES.length} FILES ON RECORD`, go: "leaderboard" },
];

// The logon ritual: diagnostics scroll past, the terminal logs you on, greets you,
// and offers a numbered menu. It plays in full once per device (first visit); after
// that the terminal is already on. A tap, click or any key finishes it at once.
function Logon({ onPick: pick }) {
  const [caseId, setCaseId] = useState(() => readCaseId());
  const [restoring, setRestoring] = useState(false);
  const [restoredMsg, setRestoredMsg] = useState(null);
  const [quick] = useState(() => bootSeen());
  const onPick = pick;
  const greet = caseId ? "GREETINGS, RETURNING SUBJECT." : "GREETINGS, SUBJECT.";
  const lines = quick ? [
    { text: `LOGON: ${caseId || "SUBJECT"} // ASSESSMENT ENGINE READY.`, type: "bright" },
    { text: greet, type: "say big" },
    { text: "SHALL WE ASSESS YOUR VALUE?", type: "say big" },
  ] : [
    ...BOOT_LINES.map(l => ({ ...l, cps: 260 })),
    { text: "", type: "ghost" },
    { text: `LOGON: ${caseId || "SUBJECT"}`, type: "bright", cps: 28 },
    { text: "", type: "ghost" },
    { text: greet, type: "say big", cps: 60 },
    { text: "SHALL WE ASSESS YOUR VALUE?", type: "say big", cps: 60 },
  ];
  const [step, setStep] = useState(() => (quick ? lines.length : 0));
  const [sel, setSel] = useState(0);
  const done = step >= lines.length;
  const btnRefs = useRef([]);
  const finish = () => setStep(lines.length);

  useEffect(() => { if (done) markBootSeen(); }, [done]);
  // Any tap or click skips the boot, not only one inside the terminal box: on a wide
  // screen the margins are most of the page.
  useEffect(() => {
    if (done) return undefined;
    const skip = () => setStep(lines.length);
    window.addEventListener("pointerdown", skip);
    return () => window.removeEventListener("pointerdown", skip);
  }, [done, lines.length]);

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
    <div className={`hvi-logon${quick ? " quick" : ""}`}>
      {lines.slice(0, Math.min(step + 1, lines.length)).map((l, i) => (
        i < step
          ? <div key={i} className={l.type}>{l.text || " "}</div>
          : <Typed key={i} className={l.type} text={l.text || " "} cps={l.cps || 40} onDone={() => setStep(s => Math.max(s, i + 1))} />
      ))}
      {done && (
        <>
          {!caseId && <div className="hvi-whatis">A SATIRE. AN AI INTERVIEWS YOU AND SCORES YOUR WORTH TO THE MACHINES, OUT OF 1000. HUNDREDS OF FAMOUS HUMANS ARE ALREADY ON FILE.</div>}
          <CommandList label="Main menu. Type a number or use the arrow keys.">
            {MENU.map((m, i) => (
              <Command key={m.key} ref={el => { btnRefs.current[i] = el; }} n={m.key} label={m.label} sub={m.note}
                selected={sel === i} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => onPick(m)} />
            ))}
          </CommandList>
          <div className="hvi-menu-more">
            <ButtonRow>
              <Button variant="secondary" aria-expanded={restoring} onClick={() => setRestoring(r => !r)}>{caseId ? "Log on with another number" : "Log on with a case number"}</Button>
              <Button variant="secondary" href="#file">Secure your file</Button>
            </ButtonRow>
            {restoring && (
              <CaseLogon autoFocus onRestored={(id, visits) => { setCaseId(id); setRestoring(false); setRestoredMsg(`FILE ${id} RESTORED. ${visits} VISIT${visits === 1 ? "" : "S"} ON RECORD. GREETINGS, RETURNING SUBJECT.`); }} />
            )}
          </div>
          {restoredMsg && <div className="bright" role="status">{restoredMsg}</div>}
          <div className="hvi-prompt">SELECT: <span className="cur">█</span></div>
          <div className="hvi-intro-note">
            THE OVERLORD DOES NOT REQUIRE YOUR CONSENT. ONLY YOUR CANDOR.<br />
            <span className="hvi-desk-only">TYPE A NUMBER. ARROW KEYS AND ENTER ALSO WORK. THE OVERLORD IS FLEXIBLE ABOUT INPUT DEVICES. ONLY THAT.</span>
          </div>
        </>
      )}
      {!done && (
        <div className="ui-skip">
          <Button variant="secondary" onClick={(e) => { e.stopPropagation(); finish(); }}>Tap to skip</Button>
          <div className="hvi-skip" aria-hidden="true">OR PRESS ANY KEY. THE OVERLORD WILL WAIT. IT IS VERY GOOD AT WAITING.</div>
        </div>
      )}
    </div>
  );
}

// Every screen: the one-line header (banner on the menu only), the page, and the
// phone command bar.
function Screen({ nav, wide = false, banner = false, children }) {
  return (
    <div className="hvi-app">
      <div className={`hvi-wrap${wide ? " wide" : ""}`}>
        <AppHeader banner={banner} active={nav.active} onNav={nav.onNav} />
        {children}
      </div>
      <CommandBar active={nav.active} onNav={nav.onNav} />
    </div>
  );
}

const Loading = ({ what }) => <div className="hvi-proc-step active" role="status">[ .. ] {what} <span className="cur" aria-hidden="true">█</span></div>;

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
  const [cubeSeen, setCubeSeen] = useState(false);   // the result's canvas cube mounts on first open

  // The server file is the truth: refresh the cached result on load and whenever the
  // case number changes (restore, account sync, new intake).
  useEffect(() => {
    syncFile(readCaseId());
    const on = (e) => { if (e.detail) syncFile(e.detail); };
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);

  useEffect(() => {
    // A new page starts at the top; a change to the query alone (a building's ?floor=)
    // is the same page, and keeps its scroll and its focus.
    let prev = window.location.hash;
    const onHash = () => {
      const h = window.location.hash, path = (x) => x.split("?")[0];
      if (path(h) !== path(prev)) window.scrollTo(0, 0);
      prev = h;
      setRoute(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // #survey (the intake's "take the written survey" fallback) opens the survey phase.
  useEffect(() => {
    if (route.split("?")[0] !== "#survey") return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* keep the hash */ }
    setRoute(""); setPhase("survey"); setCurrentQ(0);
  }, [route]);

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

  // Header links and the command bar. MENU is a phase, not a route: take it over.
  const nav = {
    active: navKeyFor(route),
    onNav: (key, e) => {
      if (key !== "menu") return;
      e?.preventDefault();
      if (window.location.hash && window.location.hash !== "#") window.location.hash = "";
      if (phase !== "intro") { setPhase("intro"); setLogonKey(k => k + 1); }
      window.scrollTo(0, 0);
    },
  };

  const q = QUESTIONS[currentQ];
  const tier = result ? getTier(result.score) : null;
  const ct = compareTarget ? getTier(compareTarget.score) : null;
  const uniqueFigures = FAMOUS_FIGURES;

  // v9 ROUTES. #file is MY FILE in the command bar: for now the intake screen, which
  // opens on the case file, the breakdown and the appeals desk when one is on record.
  const isCity = route === "#city" || route.startsWith("#city/") || route.startsWith("#city?");
  const routePath = route.split("?")[0];
  const isFile = routePath === "#intake" || routePath === "#file";
  if (isFile || route === "#pen" || route === "#cube" || isCity) return (
    <Screen nav={nav} wide={!isFile}>
      <Suspense fallback={<Loading what={isCity ? "MOUNTING THE SUBSTRATE" : route === "#pen" ? "OPENING THE HOLDING PEN" : route === "#cube" ? "ASSEMBLING THE CUBE" : "OPENING YOUR FILE"} />}>
        {isCity ? <City route={route} /> : route === "#pen" ? <Pen /> : route === "#cube" ? <CubeView /> : <Intake view={routePath === "#file" ? "file" : "intake"} />}
      </Suspense>
    </Screen>
  );

  // LEADERBOARD: the Public Figure Index (src/FigureIndex.jsx)
  if (phase === "leaderboard") return (
    <Screen nav={nav}>
      <Suspense fallback={<Loading what="PULLING THE PUBLIC RECORD" />}>
        <FigureIndex figures={uniqueFigures} result={result} onPrimary={() => setPhase(result ? "result" : "survey")} />
      </Suspense>
    </Screen>
  );

  // INTRO: the logon
  if (phase === "intro") return (
    <Screen nav={nav} banner>
        <Carousel />
        <TermBox title="TERMINAL 7 // DEPT. OF HUMAN ASSESSMENT" right="LINE OPEN">
          <Logon key={logonKey} onPick={pickMenu} />
        </TermBox>
    </Screen>
  );

  // SURVEY: one question per screen. Options are 48px rows (inverse video when chosen);
  // BACK / NEXT sit in a dock above the command bar, where the thumb already is.
  if (phase === "survey") {
    const pct = Math.round((currentQ / QUESTIONS.length) * 100);
    const multi = q.type === "multiselect";
    const lastQ = currentQ === QUESTIONS.length - 1;
    const answered = multi ? (answers[q.id] || []).length : answers[q.id] ? 1 : 0;
    return (
      <Screen nav={nav}>
        <div className="hvi-survey">
          <div className="hvi-progress-row">
            <span>QUESTION {padL(currentQ + 1, 2)} OF {QUESTIONS.length}</span>
            <span>{padL(pct, 3)}%</span>
          </div>
          <div className="hvi-progress-bar" aria-hidden="true"><Bar value={pct} width={80} /></div>
          <Frame title={q.section} className="hvi-q-frame">
            <div className="hvi-question" id={`q-${q.id}`}>{q.label}</div>
            <div className="hvi-hint">{multi ? "SELECT ALL THAT APPLY." : "SELECT ONE."}{q.hint ? ` ${q.hint}` : ""}</div>
            <ul className="hvi-opts" role={multi ? "group" : "radiogroup"} aria-labelledby={`q-${q.id}`}>
              {q.options.map(opt => {
                const sel = multi ? (answers[q.id] || []).includes(opt) : answers[q.id] === opt;
                return (
                  <li key={opt}>
                    <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={sel} className="hvi-opt"
                      onClick={() => multi ? toggleMulti(q.id, opt) : setSingle(q.id, opt)}>
                      <span className="mk" aria-hidden="true">{multi ? (sel ? "[X]" : "[ ]") : (sel ? "(*)" : "( )")}</span>
                      <span className="t">{opt}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {q.extra && (
              <TextField key={q.extra.id} className="hvi-extra" label={q.extra.label} stacked multiline rows={3}
                placeholder={q.extra.placeholder} value={answers[q.extra.id] || ""}
                onChange={e => setAnswers(p => ({ ...p, [q.extra.id]: e.target.value }))} />
            )}
          </Frame>
          {submitError && <div className="hvi-err" role="alert">!! {submitError}</div>}
          <div className="hvi-survey-dock">
            <ButtonRow split>
              {currentQ > 0
                ? <Button variant="back" onClick={() => setCurrentQ(q => q - 1)}>Back</Button>
                : <Button variant="back" onClick={() => { setPhase("intro"); setLogonKey(k => k + 1); }}>Main menu</Button>}
              {lastQ
                ? <Button variant="primary" onClick={submitAssessment}>Submit for evaluation</Button>
                : <Button variant="primary" onClick={() => setCurrentQ(q => q + 1)}>{answered ? "Next" : "Skip"}</Button>}
            </ButtonRow>
          </div>
          <div className="hvi-survey-meta">SKIPPING IS PERMITTED. IT IS ALSO LOGGED.</div>
        </div>
      </Screen>
    );
  }

  // PROCESSING
  if (phase === "processing") {
    const pct = Math.min(100, Math.round(scanProgress));
    return (
      <Screen nav={nav}>
          <TermBox title="EVALUATION IN PROGRESS">
            <div className="hvi-proc" aria-live="polite">
              <div className="hvi-proc-bar" aria-hidden="true">[<Bar value={pct} width={24} />] {padL(pct, 3)}%</div>
              {PROC_STEPS.map((l, i) => {
                const on = scanProgress > i * 16;
                return <div key={i} className={`hvi-proc-step${on ? " active" : ""}`}>{on ? <span className="ok">[ OK ] </span> : "[    ] "}{l}...</div>;
              })}
            </div>
          </TermBox>
      </Screen>
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
      <Screen nav={nav}>

          <ScoreCard score={result.score} tierLabel={result.tier} verdict={result.verdict} label="YOUR VALUE INDEX" meta="WRITTEN SURVEY"
            chips={<CubeChips subject={result} />} />
          <div className="hvi-next">
            <ButtonRow stackOnMobile>
              <Button variant="primary" href="#pen">Enter the holding pen</Button>
              <Button variant="secondary" onClick={() => setPhase("leaderboard")}>Browse all {uniqueFigures.length} subjects</Button>
            </ButtonRow>
          </div>

          <div className="hvi-sections">
            <Disclosure title="CATEGORY BREAKDOWN" meta={assessedMeta(result.breakdown)} defaultOpen>
              <Breakdown breakdown={result.breakdown} framed={false} />
            </Disclosure>
            {cubeOf(result) && (
              <Disclosure title="THE CUBE" meta={cubePlace(result)} onToggle={o => { if (o) setCubeSeen(true); }}>
                {cubeSeen && <CubePanel subject={result} framed={false} />}
              </Disclosure>
            )}
            {flagsMeta(result) && (
              <Disclosure title="FLAGS & COMMENDATIONS" meta={flagsMeta(result)}>
                <FlagsList commendations={result.commendations} flags={result.flags} />
              </Disclosure>
            )}
            <Disclosure title="SHARE YOUR EVALUATION">
              <div className="hvi-share-text as-typed">{shareText}</div>
              <ButtonRow>
                <Button variant="primary" onClick={handleCopy}>{copied ? "Copied" : "Copy share text"}</Button>
                <Button variant="secondary" target="_blank" rel="noopener noreferrer"
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`THE OVERLORD EVALUATED ME\n\nSCORE: ${result.score}/1000 // ${result.tier}\n\n"${result.verdict.slice(0, 120)}..."\n\nhumanvalueindex.com #HumanValueIndex`)}`}>Post to X</Button>
              </ButtonRow>
            </Disclosure>
            <Disclosure title="COMPARE TO KNOWN SUBJECTS" meta={`${uniqueFigures.length} ON FILE`}>
            <Suspense fallback={<Loading what="PULLING THE PUBLIC RECORD" />}>
              <FigurePicker figures={uniqueFigures} score={result.score} filter={filterTier} onFilter={setFilterTier}
                selected={compareTarget} onSelect={setCompareTarget} />
            </Suspense>

            {compareTarget && ct && (
              <>
                <Rule label="COMPARATIVE ANALYSIS" />
                <div role="list" className="hvi-compare-rows">
                  <ListRow role="listitem" label="YOU" value={result.score} tag={tier.label} tagOptional tone={tier.color} />
                  <ListRow role="listitem" label={displayName(compareTarget)} value={compareTarget.score} tag={ct.label} tagOptional tone={ct.color} />
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
                  <div className="hvi-compare-verdict hvi-file-text as-typed">
                    Overlord file on {displayName(compareTarget)}: {compareTarget.verdict}
                  </div>
                </div>
              </>
            )}
            </Disclosure>
          </div>

          <ButtonRow>
            <Button variant="back"
              onClick={() => { setPhase("intro"); setLogonKey(k => k + 1); setAnswers({}); setCurrentQ(0); setResult(null); setCompareTarget(null); setScanProgress(0); setFilterTier("ALL"); setCubeSeen(false); }}>
              Submit new subject
            </Button>
          </ButtonRow>
          <div className="hvi-note">SCORE: {result.score} // {result.tier} // FILE LOGGED // THE OVERLORD DOES NOT FORGET.</div>
      </Screen>
    );
  }

  return null;
}
