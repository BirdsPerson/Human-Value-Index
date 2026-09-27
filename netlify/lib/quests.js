// Quest rules, pure: (record, action, now) -> {record} to write, or {status, error}.
// Catalog and the contact test live in src/quests.js (shared with the client).
// record.quests = {active: {id, at} | null, done: [{id, at}]}
// record.vouches = [{quest, figure, name, dim, at}]
import { QUEST, questFigure, contactAt } from "../../src/quests.js";

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
    today: done.filter(d => d.at?.slice(0, 10) === today(now)).length,
    perDay: COMPLETIONS_PER_DAY,
  };
}

const no = (status, error) => ({ status, error });

export function applyQuest(record, { action, questId, buildingId }, now = Date.now()) {
  if (!record) return no(404, "No such file. The Department does not lose files. You have mistyped.");
  if (!scored(record)) return no(403, "The dead do not run errands for the unassessed. Complete an intake first.");
  const q = QUEST[questId];
  if (!q) return no(400, "No such directive. The Archive issues what it issues.");
  const st = questState(record, now);
  const quests = { active: st.active, done: [...(record.quests?.done || [])] };

  if (action === "accept") {
    if (st.done.includes(q.id)) return no(409, "Directive already discharged. The dead do not repeat themselves. Not to you.");
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
    if (st.today >= COMPLETIONS_PER_DAY) return no(429, `${COMPLETIONS_PER_DAY} directives a day. The dead keep office hours. Return tomorrow.`);
    if (typeof buildingId !== "string" || !contactAt(q, buildingId, now)) return no(409, "The subject is not in that building. The census does not lie. You might.");
    const f = questFigure(q);
    const at = new Date(now).toISOString();
    const vouch = { quest: q.id, figure: q.figure, name: f.name, dim: q.dim, at };
    return {
      record: { ...record, quests: { active: null, done: [...quests.done, { id: q.id, at }] }, vouches: [...(record.vouches || []), vouch] },
      vouch,
    };
  }
  return no(400, "Unknown action. Accept, complete or abandon. Those are the verbs.");
}
