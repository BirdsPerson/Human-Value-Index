// /api/economy from the browser. The server holds the ledger and decides every amount; this
// only asks. "hvi-economy" fires with the newest wallet so the header chip and the panels agree.
import { deviceId } from "../assembly/client.js";

const emit = (d) => { try { window.dispatchEvent(new CustomEvent("hvi-economy", { detail: d })); } catch { /* no window */ } };

export async function loadEconomy(caseId, { chip = false } = {}) {
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}${chip ? "&chip=1" : ""}` : "";
  const r = await fetch(`/api/economy${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "The Treasury is unreachable."), { status: r.status, data: d });
  if (d.wallet) emit({ caseId, balance: d.wallet.balance, tray: d.wallet.tray.days, open: d.open });
  return d;
}

// One nonce per order: a double click sends the same nonce and is charged once.
export const newNonce = () => {
  try { return crypto.randomUUID(); } catch { return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
};

// -> {ok, status, data}. A refused order still carries the wallet so the page stays true.
export async function econAct(caseId, action, body = {}) {
  try {
    const r = await fetch("/api/economy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action, device: deviceId(), ...body }) });
    const data = await r.json().catch(() => ({}));
    if (data.wallet) emit({ caseId, balance: data.wallet.balance, tray: data.wallet.tray.days, open: data.open });
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "The Treasury did not answer. Your CYCLES are where the ledger left them." } };
  }
}
