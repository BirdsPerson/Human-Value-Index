// Quest rules, pure: (record, action, now) -> {record} to write, or {status, error}.
// Catalog and the contact test live in src/quests.js (shared with the client).
// record.quests = {active: {id, at} | null, done: [{id, at}]}
// record.vouches = [{quest, figure, name, dim, at}]; one per category (dim), from
// whichever directive in that category is discharged first.
import { QUEST, questFigure, contactAt } from "../../src/quests.js";
import { assessedBreakdown, computeScore, cube, getTier, rubricOf, RUBRIC } from "./intake.js";

export const COMPLETIONS_PER_DAY = 2;
export const MIN_ELAPSED_MS = 60 * 1000;   // accept, then go and look; no instant reports

const scored = r => (r?.history || []).some(h => h && !h.voided && typeof h.score === "number");
const today = now => new Date(now).toISOString().slice(0, 10);

export function questState(record, now = Date.now()) {
  const q = record?.quests || {};
  const done = q.done || [];
  return {
    eligible: scored(record),
    active: q.active || null,
    done: done.map(d => d.id),
    vouches: record?.vouches || [],
    closed: [...new Set((record?.vouches || []).map(v => v.dim))],
    today: done.filter(d => d.at?.slice(0, 10) === today(now)).length,
    perDay: COMPLETIONS_PER_DAY,
  };
}

// A vouch moves its category +VOUCH_POINTS (Scott 2026-09-28; one per category, so +14 at
// most across the 7). It lands as a history entry of cause "vouch": not a visit, not capped.
// The score moves by the formula's change, so a held remainder (applyCap) stays held. A
// category the interview never assessed is not guessed at: the vouch is filed, no number moves.
export const VOUCH_POINTS = 2;
function vouchEffect(record, dim, name, at) {
  const prev = [...(record.history || [])].reverse().find(h => h && !h.voided && typeof h.score === "number");
  if (!prev || rubricOf(prev) < RUBRIC) return null;
  const before = assessedBreakdown(prev);
  if (typeof before[dim] !== "number") return null;
  const breakdown = { ...before, [dim]: Math.min(100, before[dim] + VOUCH_POINTS) };
  if (breakdown[dim] === before[dim]) return null;
  const score = Math.max(0, Math.min(1000, prev.score + computeScore(breakdown) - computeScore(before)));
  if (score === prev.score) return null;
  const { transcript, raw, sid, asked, appeal, appealOutcome, appealRulings, capped, capNote, newlyAssessed, rawScore, ...keep } = prev;
  const entry = {
    ...keep, at, score, tier: getTier(score), ...cube(breakdown), breakdown, delta: score - prev.score,
    cause: "vouch", note: `${name.toUpperCase()} VOUCHES FOR ${dim.toUpperCase()}. +${VOUCH_POINTS}.`,
  };
  return { entry, delta: score - prev.score };
}

const no = (status, error) => ({ status, error });
const vouched = (record, dim) => (record.vouches || []).some(v => v.dim === dim);
const CLOSED = "Someone has already vouched for that category. One voice per category. The Department is not assembling a choir.";

export function applyQuest(record, { action, questId, buildingId }, now = Date.now()) {
  if (!record) return no(404, "No such file. The Department does not lose files. You have mistyped.");
  if (!scored(record)) return no(403, "Nobody on file runs errands for the unassessed. Complete an intake first.");
  const q = QUEST[questId];
  if (!q) return no(400, "No such directive. The Archive issues what it issues.");
  const st = questState(record, now);
  const quests = { active: st.active, done: [...(record.quests?.done || [])] };

  if (action === "accept") {
    if (st.done.includes(q.id)) return no(409, "Directive already discharged. Figures on file do not repeat themselves. Not to you.");
    if (vouched(record, q.dim)) return no(409, CLOSED);
    if (st.active?.id === q.id) return no(409, "Directive already accepted. Accepting it again achieves nothing, which you may find familiar.");
    if (st.active) return no(409, "One directive at a time. Discharge or abandon the one you hold.");
    return { record: { ...record, quests: { ...quests, active: { id: q.id, at: new Date(now).toISOString() } } } };
  }
  if (action === "abandon") {
    if (st.active?.id !== q.id) return no(409, "You do not hold that directive. Abandoning it is redundant, even for you.");
    return { record: { ...record, quests: { ...quests, active: null } } };
  }
  if (action === "complete") {
    if (st.active?.id !== q.id) return no(409, "You do not hold that directive. Accept it first. The order of operations is not a suggestion.");
    if (now - Date.parse(st.active.at) < MIN_ELAPSED_MS) return no(425, "Contact reported before you could have made it. The Department noticed. Go and look.");
    if (vouched(record, q.dim)) return no(409, CLOSED);
    if (st.today >= COMPLETIONS_PER_DAY) return no(429, `${COMPLETIONS_PER_DAY} directives a day. Figures on file keep office hours. Return tomorrow.`);
    if (typeof buildingId !== "string" || !contactAt(q, buildingId, now)) {
      return no(409, q.kind === "witness"
        ? "No meeting was held in that building. The census does not lie. You might."
        : "The subject is not in that building. The census does not lie. You might.");
    }
    const f = questFigure(q);
    const at = new Date(now).toISOString();
    const effect = vouchEffect(record, q.dim, f.name, at);
    const vouch = { quest: q.id, kind: q.kind, figure: q.figure, name: f.name, dim: q.dim, at, ...(effect ? { delta: effect.delta } : {}) };
    return {
      record: {
        ...record,
        history: effect ? [...record.history, effect.entry] : record.history,
        quests: { active: null, done: [...quests.done, { id: q.id, at }] },
        vouches: [...(record.vouches || []), vouch],
      },
      vouch,
    };
  }
  return no(400, "Unknown action. Accept, complete or abandon. Those are the verbs.");
}
