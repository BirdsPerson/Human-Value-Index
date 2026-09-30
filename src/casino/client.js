// /api/casino from the browser. The server holds the chips and the cards; this only asks.
export async function loadCasino(caseId) {
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const r = await fetch(`/api/casino${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "The casino floor is unreachable."), { status: r.status, data: d });
  return d;
}

// -> {ok, status, data}. A refused bet still carries the wallet (data) so the page stays true.
export async function casinoAct(caseId, action, body = {}) {
  try {
    const r = await fetch("/api/casino", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action, ...body }) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "The casino floor did not answer. Your chips are where the server left them." } };
  }
}
