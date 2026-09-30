// /api/proposals for the browser (#docket, the panel on #assembly). The case number and the
// per-device id ride along, as with the Assembly's ballot (client.js deviceId).
import { deviceId } from "./client.js";
import { applyActs } from "../city/acts.js";

async function send(body) {
  const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || "THE DOCKET REFUSED. IT GAVE NO REASON. IT DOES NOT OWE YOU ONE."); e.field = d.field; e.screened = d.screened; throw e; }
  return d;
}
export async function loadProposals({ caseId = null, review = false } = {}) {
  const q = new URLSearchParams();
  if (caseId) q.set("caseId", caseId);
  if (review) q.set("review", "1");
  const r = await fetch(`/api/proposals${q.toString() ? `?${q}` : ""}`, { cache: "no-store" });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error(d?.error || "THE DOCKET IS UNREACHABLE.");
  applyActs(d.acts);
  return d;
}
export const fileProposal = (caseId, p) => send({ action: "file", caseId, ...p });
export const cosignProposal = (caseId, pid) => send({ action: "cosign", caseId, pid, device: deviceId() });
export const castProposalBallot = (caseId, side, reasons) => send({ action: "ballot", caseId, side, reasons, device: deviceId() });
export const reviewProposal = (caseId, op, pid, extra = {}) => send({ action: "review", caseId, op, pid, ...extra });
