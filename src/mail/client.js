// DEPARTMENT MAIL, the browser's side of /api/mail (netlify/functions/mail.js). The unread count is
// the only notification there is (Scott's rule: no pop-ups): MY FILE's line and the desktops' icons
// read it, and every change here tells them (window event "hvi-mail").
const tell = (caseId, unread) => { try { window.dispatchEvent(new CustomEvent("hvi-mail", { detail: { caseId, unread } })); } catch { /* no window */ } };

async function call(url, init) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `The mail room answered ${r.status}.`), { status: r.status });
  return j;
}
export async function loadMail(caseId) {
  const v = await call(`/api/mail?caseId=${encodeURIComponent(caseId)}`, { headers: { Accept: "application/json" } });
  tell(caseId, v.unread);
  return v;
}
export async function unreadCount(caseId) {
  const v = await call(`/api/mail?caseId=${encodeURIComponent(caseId)}&count=1`, { headers: { Accept: "application/json" } });
  tell(caseId, v.unread);
  return v.unread;
}
export async function mailOp(caseId, op, id = "") {
  const v = await call("/api/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, op, id }) });
  tell(caseId, v.unread);
  return v;
}
export function onMail(fn) {
  const h = (e) => fn(e.detail || {});
  window.addEventListener("hvi-mail", h);
  return () => window.removeEventListener("hvi-mail", h);
}
