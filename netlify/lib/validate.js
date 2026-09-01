import { QUESTIONS } from "../../src/data/questions.js";

export const MAX_DETAIL_CHARS = 600;

const OPTION_QUESTIONS = new Map(QUESTIONS.map((q) => [q.id, q]));
const DETAIL_IDS = new Set(QUESTIONS.filter((q) => q.extra).map((q) => q.extra.id));

// Control characters other than tab and newline.
// eslint-disable-next-line no-control-regex -- stripping control chars is the point
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, "").trim().slice(0, MAX_DETAIL_CHARS);
}

// Accepts the raw `answers` object from the request body and returns
// { ok: true, answers } containing only known question ids with values drawn
// from that question's option list (or a capped free-text detail), or
// { ok: false, error } when the payload is not an object.
export function validateAnswers(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Survey data missing or malformed." };
  }
  const answers = {};
  for (const [id, value] of Object.entries(raw)) {
    const q = OPTION_QUESTIONS.get(id);
    if (q) {
      if (q.type === "multiselect") {
        if (!Array.isArray(value)) continue;
        const picked = value.filter((v) => q.options.includes(v));
        if (picked.length) answers[id] = [...new Set(picked)];
      } else if (typeof value === "string" && q.options.includes(value)) {
        answers[id] = value;
      }
    } else if (DETAIL_IDS.has(id)) {
      const text = cleanText(value);
      if (text) answers[id] = text;
    }
    // Unknown keys are dropped.
  }
  return { ok: true, answers };
}

// Renders validated answers into the survey transcript the model evaluates.
export function formatSurvey(answers) {
  return QUESTIONS.map((q) => {
    const a = answers[q.id];
    const val = Array.isArray(a) ? (a.length ? a.join(", ") : "[No response]") : (a || "[No response]");
    const extra = q.extra ? `\n  Detail: ${answers[q.extra.id] || "[none]"}` : "";
    return `[${q.section}] ${q.label}:\n  Response: ${val}${extra}`;
  }).join("\n\n");
}

export function answeredCount(answers) {
  return QUESTIONS.filter((q) => {
    const a = answers[q.id];
    return Array.isArray(a) ? a.length > 0 : Boolean(a);
  }).length;
}
