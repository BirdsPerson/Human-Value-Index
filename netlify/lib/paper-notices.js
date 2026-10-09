// DEPARTMENT NOTICES: commit subjects -> in-world notices, per real day (America/New_York).
// Pure; scripts/paper-notices.mjs feeds it `git log --format=%ad%x1f%s --date=iso-strict`,
// scripts/check-paper.mjs feeds it fixtures. Curated by rule, not by hand: only what a
// visitor could notice in the city ships as a notice; the workshop (docs, checks, scripts,
// sprite backends, people's names from the desk) stays out.

export const PAPER_TZ = "America/New_York";
export const MAX_PER_DAY = 10;

// "2026-10-05" for a moment, on the paper's clock.
export function paperDate(ms, tz = PAPER_TZ) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const g = t => p.find(x => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// Whole subject dropped when it is about the workshop rather than the city.
const DROP = /^(docs?|check|checks|tests?|ci|chore|build|deps|refactor|revert|merge|wip|scripts?|bench|sprites?:? (gemini|higgsfield|backend|audit|qa))\b|\b(scott|claude|desk|nightly|agent|commit|codex|gemini|higgsfield|anthropic|api key|secret|bundle|lint|typo|calibrat|rescore|backfill|morning_report|desk_answers|readme|screens?:|playtest|suno prompt)\b|likeness|\bcheck-\w+|\.(m?js|jsx|py|json|md|css)\b|\b(DECEASED|DIED|ALIVE|OBITUARY|POSTHUMOUS|GHOSTS?)\b/i;
const ROUTE = /#([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)?)/;

function clean(s) {
  return s
    .replace(/\s*\((?:[^()]*[/.][^()]*|#[^()]*)\)/g, "")       // "(src/play/x.js)", "(#fish)"
    .replace(/\s*\(([^()]*)\)/g, ", $1")                        // other asides fold in
    .replace(/[`"“”]/g, "")                             // no quotation marks in a notice
    .replace(/\s+/g, " ").replace(/\s+([,;:.])/g, "$1").replace(/[;,.\s]+$/, "").trim();
}

// One subject -> {text, href} | null.
export function noticeOf(subject) {
  const s = String(subject || "").trim();
  if (!s || s.length < 8 || DROP.test(s)) return null;
  const href = (s.match(ROUTE) || [])[1] || null;
  const m = s.match(/^([^:]{2,48}):\s*(.+)$/);
  let text;
  // workshop labels in a head ("Community slice 2", "Side quests (b)", "Hoops S1b", "D1") never print
  const label = (h) => h.replace(/\b(slice|stage|phase|part|step)\s*[\w.]+/gi, "").replace(/\s*\([a-z0-9]\)/gi, "")
    .replace(/\b[A-Z]\d+[a-z]?\b/g, "").replace(/\bv\d+(\.\d+)*\b/gi, "").replace(/\s+/g, " ").trim();
  if (m && !label(m[1])) { const body = clean(m[2]); return body ? { text: `NOTICE: ${body}.`, big: false } : null; }
  if (m) {
    const head = clean(label(m[1])).toUpperCase(), body = clean(m[2]);
    if (!body) return null;
    text = /^THE\s|^[A-Z0-9 '!&-]+$/.test(m[1].trim()) && m[1].trim() === m[1].trim().toUpperCase()
      ? `THE DEPARTMENT HAS INSTALLED ${head}: ${body}.`
      : `AMENDED, ${head}: ${body}.`;
  } else {
    text = `NOTICE: ${clean(s)}.`;
  }
  if (text.length > 220) text = text.slice(0, 217).replace(/\s+\S*$/, "") + "...";
  return { text, ...(href ? { href: `#${href}` } : {}), big: /^THE DEPARTMENT HAS INSTALLED/.test(text) };
}

// git log lines "<iso date>\x1f<subject>" -> {date: [{text, href?}]} newest day first,
// installations before amendments, at most MAX_PER_DAY a day, no duplicate text.
export function noticesFromLog(log, tz = PAPER_TZ) {
  const days = {};
  for (const line of String(log || "").split("\n")) {
    const [iso, subject] = line.split("\x1f");
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || !subject) continue;
    const n = noticeOf(subject);
    if (!n) continue;
    (days[paperDate(t, tz)] ||= []).push(n);
  }
  const out = {};
  for (const d of Object.keys(days).sort().reverse()) {
    const seen = new Set();
    out[d] = days[d].filter(n => !seen.has(n.text) && seen.add(n.text))
      .sort((a, b) => (b.big - a.big)).slice(0, MAX_PER_DAY)
      .map(({ text, href }) => (href ? { text, href } : { text }));
  }
  return out;
}
