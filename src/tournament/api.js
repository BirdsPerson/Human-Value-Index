// /api/tournament from the browser (netlify/functions/tournament.js). The entry permit is kept in this
// browser per event, so a reload resumes the attempt rather than spending it.
async function call(method, body, q = "") {
  const r = await fetch(`/api/tournament${q}`, method === "GET" ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw Object.assign(new Error(j?.error || `THE CLUBHOUSE DID NOT ANSWER (${r.status}).`), { status: r.status });
  return j;
}
export const loadCalendar = () => call("GET");
export const loadEvent = (id) => call("GET", null, `?id=${encodeURIComponent(id)}`);
export const loadMine = (caseId) => call("GET", null, `?caseId=${encodeURIComponent(caseId)}`);
export const enterEvent = (caseId, id, div) => call("POST", { caseId, action: "enter", id, div });
export const submitLeg = (caseId, permit, leg, rec) => call("POST", { caseId, action: "submit", permit, leg, ...rec });

// One fetch of the calendar per page view (the #play tile, the hub, the game pages share it).
let CAL = null;
export const calendarOnce = () => (CAL ||= loadCalendar().catch((e) => { CAL = null; throw e; }));
