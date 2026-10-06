// /api/market from the browser. The server decides every price and fill; this only asks.
import { deviceId } from "../assembly/client.js";

const emit = (d) => { try { window.dispatchEvent(new CustomEvent("hvi-economy", { detail: d })); } catch { /* no window */ } };

export async function loadMarket(caseId) {
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const r = await fetch(`/api/market${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "The floor is unreachable."), { status: r.status, data: d });
  if (d.wallet) emit({ caseId, balance: d.wallet.balance, tray: d.wallet.tray.days, open: d.open });
  return d;
}
export async function loadDetail(slug) {
  const r = await fetch(`/api/market?slug=${encodeURIComponent(slug)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Not listed.");
  return d.detail;
}
export async function loadTicker() {
  const r = await fetch("/api/market?ticker=1");
  if (!r.ok) throw new Error("no ticker");
  return r.json();
}
export const newNonce = () => {
  try { return crypto.randomUUID(); } catch { return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
};
// -> {ok, status, data}
export async function placeOrder(caseId, body) {
  try {
    const r = await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action: "order", device: deviceId(), ...body }) });
    const data = await r.json().catch(() => ({}));
    if (data.wallet) emit({ caseId, balance: data.wallet.balance, tray: data.wallet.tray.days, open: data.open });
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "The floor did not answer. Your CYCLES are where the ledger left them." } };
  }
}
