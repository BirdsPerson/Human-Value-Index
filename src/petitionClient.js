// /api/petition for the browser (docs/PETITION.md). The case number and the per-device id
// ride along, as with the Assembly (src/assembly/client.js).
import { deviceId } from "./assembly/client.js";
import { note } from "./firstDay.js";

export async function loadPetition(slug, caseId = null) {
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const r = await fetch(`/api/petition/${encodeURIComponent(slug)}${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The petition desk is unreachable.");
  return d;
}

export async function votePetition(slug, caseId, choice) {
  const r = await fetch(`/api/petition/${encodeURIComponent(slug)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, choice, device: deviceId() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || "The Department refused your vote. It gave no reason. It does not owe you one."); e.closed = Boolean(d.closed); throw e; }
  note(caseId, "petition");   // YOUR FIRST DAY: CAST A VOTE (no server list of a file's petition votes)
  return d;
}

// The crowd's People signal for every voted file ({slug: {reading, n}}), once per visit.
let crowd = null;
export function loadCrowd() {
  if (!crowd) crowd = fetch("/api/petition").then(r => (r.ok ? r.json() : null)).then(d => d?.figures || {}).catch(() => { crowd = null; return {}; });
  return crowd;
}
