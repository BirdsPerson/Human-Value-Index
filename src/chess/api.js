// /api/chess from the browser: MY FILE reads the record with this alone (no engine, no rules).
export async function loadChess(caseId) {
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const r = await fetch(`/api/chess${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "The park is unreachable."), { status: r.status, data: d });
  return d;
}
// -> {ok, status, data}
export async function chessAct(caseId, action, body = {}) {
  try {
    const r = await fetch("/api/chess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action, ...body }) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "The park did not answer. The game is still on this terminal." } };
  }
}
