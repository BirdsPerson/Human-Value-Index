import { isCaseId, newCaseId, pickQuestions, pickAppealQuestions, appealError, rubricOf, RUBRIC } from "../lib/intake.js";
import { getCase, updateCase, hitLimit } from "../lib/store.js";
import { makeJson, preflight, foreignOrigin, clientIp, FOREIGN_ORIGIN_LINE } from "../lib/http.js";

const PER_CASE_DAILY = 5;
const PER_IP_DAILY = 20;

export default async (req, context) => {
  if (req.method === "OPTIONS") return preflight(req);
  const json = makeJson(req);
  if (req.method !== "POST") return json(405, { error: "Intake is requested by POST. Walking in and shouting is a different department." });
  if (foreignOrigin(req)) return json(403, { error: FOREIGN_ORIGIN_LINE });

  let body = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(400, { error: "Your request is not legible. The Department does not do handwriting." });
  }
  const given = body?.caseId;
  if (given != null && !isCaseId(given)) {
    return json(400, { error: "That is not a case number. Case numbers look like HVI-XXXXXXXX. You were told this." });
  }
  const appeal = body?.appeal ?? null;
  if (appeal != null) {
    const bad = appealError(appeal);
    if (bad) return json(400, { error: bad });
    if (!given) return json(400, { error: "An appeal needs a case number. The Department does not hear appeals from strangers." });
  }

  try {
    const ip = clientIp(req, context);
    if (!(await hitLimit(`session-ip:${ip}`, PER_IP_DAILY)).ok) {
      return json(429, { error: "Your location has requested twenty interviews today. The Department suspects a household of attention seekers. Return tomorrow." }, { "Retry-After": "3600" });
    }

    let record = given ? await getCase(given) : null;
    if (appeal) {
      const last = record?.history?.[record.history.length - 1];
      if (!last) return json(404, { error: "There is no file to appeal. Be assessed first. Then object." });
      if (rubricOf(last) < RUBRIC) return json(409, { error: "Your file was scored under a retired rubric. Appeals require a current file. Complete a full re-assessment first; the Department will then entertain your objections." });
    }
    const reopened = Boolean(given && !record);
    if (!record) record = { caseId: newCaseId(), created: new Date().toISOString(), history: [] };

    const caseLimit = await hitLimit(`session-case:${record.caseId}`, PER_CASE_DAILY);
    if (!caseLimit.ok) {
      return json(429, { error: "This case has been interviewed five times today. Additional interviews will not change who you are. Return tomorrow." }, { "Retry-After": "3600" });
    }

    const picked = appeal ? pickAppealQuestions(record.history, appeal) : pickQuestions(record.history);
    const { focus, plan, asked } = picked;
    const visit = record.history.length + 1;
    const last = record.history[record.history.length - 1];
    const sections = appeal ? appeal.map(d => d.toUpperCase()).join(", ") : "";
    // The voice agent only knows these five variables, so the appeal rides in the
    // returning note as well as in the plan.
    const returningNote = appeal
      ? `APPEAL FILED: ${sections}. The subject disputes these sections of the file. Ask only the questions in the plan: they target the appealed sections${picked.adjacent.length ? `, plus adjacent sections (${picked.adjacent.join(", ")})` : ""}. Previous score ${last.score} (${last.tier}).`
      : last
        ? `Previous score ${last.score} (${last.tier}). File sections with the least evidence: ${focus.slice(0, 4).join(", ")}.`
        : "First visit. No file on record.";
    const dynamicVariables = {
      case_number: record.caseId,
      visit_number: String(visit),
      focus_dimensions: focus.join(", "),
      question_plan: plan.map(q => q.text).join("\n"),
      returning_note: returningNote,
      ...(appeal ? { appeal_sections: sections } : {}),
    };
    // vars are stored so the typed channel (intake-chat) builds its prompt from the
    // server's plan, never the client's.
    const pending = { at: new Date().toISOString(), focus, asked, vars: dynamicVariables, ...(appeal ? { appeal, touch: picked.touch } : {}) };
    // Fresh read inside the write: a score landing meanwhile keeps its history entry.
    const fresh = { ...record, pending };
    record = await updateCase(record.caseId, cur => (cur ? { ...cur, pending } : fresh));

    return json(200, {
      caseId: record.caseId,
      visit,
      reopened,
      notice: reopened ? "Your previous file could not be located. A new one has been opened. This happens more than the Department admits." : null,
      focus,
      appeal: appeal || null,
      questions: plan.map(q => q.text),
      plan,
      dynamicVariables,
    });
  } catch (err) {
    console.error("intake-session failed", err);
    return json(500, { error: "The records office is unavailable. Your file is safe. Probably." });
  }
};

export const config = { path: "/api/intake-session" };
