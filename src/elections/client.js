// /api/elections for the browser: the #elections page, the civic panel and the city (the
// council chamber at THE ASSEMBLY). One shared copy, refreshed at most every 60 s;
// "hvi-elections" fires when it changes. The device id is the Assembly's (one terminal, one
// or two citizens: netlify/lib/elections.js LIMITS).
import { deviceId } from "../assembly/client.js";

let cache = null, at = 0, inflight = null;
const publish = (d) => { cache = d; at = Date.now(); try { window.dispatchEvent(new CustomEvent("hvi-elections", { detail: d })); } catch { /* no window */ } return d; };
export const electionsNow = () => cache;

export function loadElections({ force = false, caseId = null } = {}) {
  if (!force && !caseId && cache && Date.now() - at < 60000) return Promise.resolve(cache);
  if (inflight && !caseId) return inflight;
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const p = fetch(`/api/elections${q}`, { cache: "no-store" })
    .then(r => r.json().then(d => (r.ok ? d : Promise.reject(d?.error || "The Council is unreachable."))))
    .then(publish);
  if (!caseId) { inflight = p; p.finally(() => { inflight = null; }).catch(() => {}); }
  return p;
}

// candidate: a candidate key, or null to withdraw that race's ballot; writein: a write-in's
// key (a subject from the picker) instead of a candidate.
export async function castVote(caseId, district, candidate, writein = null) {
  const r = await fetch("/api/elections", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(writein ? { caseId, district, writein, device: deviceId() } : { caseId, district, candidate, device: deviceId() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Council refused your ballot. It gave no reason. It does not owe you one.");
  publish(d);
  return d;
}

// The write-in picker's type-ahead. -> {hits: [{key, name, living, self}], self: {key, name} | null}
export async function searchWriteIns(district, q, caseId = null) {
  const p = new URLSearchParams({ writein: district, q });
  if (caseId) p.set("caseId", caseId);
  const r = await fetch(`/api/elections?${p}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The census is unreachable.");
  return d;
}

// A player citizen elected declines or resigns its seat (MY FILE).
export async function resignSeat(caseId, cycle, district) {
  const r = await fetch("/api/elections", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, resign: { cycle, district } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Council did not accept the resignation. It gave no reason.");
  return d;
}

// A player declares its citizen a candidate in a race (or withdraws). -> {declared: [district], key, name}
export async function declareCandidacy(caseId, district, withdraw = false) {
  const r = await fetch("/api/elections", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, declare: { district, withdraw }, device: deviceId() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Council did not accept the filing. It gave no reason.");
  loadElections({ force: true }).catch(() => {});
  return d;
}

// MY FILE's candidacy panel. -> {open, key, name, districts: [{id, name, declared, may}]}
export async function loadCandidacy(caseId) {
  const r = await fetch(`/api/elections?candidacy=1&caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Council is unreachable.");
  return d;
}
