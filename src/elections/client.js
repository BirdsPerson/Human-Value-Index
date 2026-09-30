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

// candidate: a candidate key, or null to withdraw that race's ballot.
export async function castVote(caseId, district, candidate) {
  const r = await fetch("/api/elections", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, district, candidate, device: deviceId() }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Council refused your ballot. It gave no reason. It does not owe you one.");
  publish(d);
  return d;
}
