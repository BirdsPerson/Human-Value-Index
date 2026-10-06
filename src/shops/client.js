// /api/shops from the browser. The server holds the ledger and decides every price, the stock,
// ownership and the flat; this only asks. Two events keep the rest of the page true:
//   "hvi-economy"  the newest balance (the header's chip, the Treasury)
//   "hvi-outfit"   {caseId, avatar}: what the file photo now wears (the city, MY FILE, the golf)
import { deviceId } from "../assembly/client.js";
import { readLastResult, writeLastResult } from "../caseFile.jsx";

const emit = (name, d) => { try { window.dispatchEvent(new CustomEvent(name, { detail: d })); } catch { /* no window */ } };

// The newest view of the case, shared by every panel on the page (the store, the closet, the flat).
let LAST = { caseId: null, view: null };
const subs = new Set();
export const lastView = (caseId) => (LAST.caseId === caseId ? LAST.view : null);
export function onView(f) { subs.add(f); return () => subs.delete(f); }
function keep(caseId, view) {
  if (!view || view.balance == null) return;
  LAST = { caseId, view };
  for (const f of subs) { try { f(LAST); } catch { /* a dead listener */ } }
  emit("hvi-economy", { caseId, balance: view.balance, open: true });
}

export async function loadShops(caseId) {
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
  const r = await fetch(`/api/shops${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "The shops are unreachable."), { status: r.status, data: d });
  if (caseId) keep(caseId, d);
  return d;
}

export const newNonce = () => {
  try { return crypto.randomUUID(); } catch { return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
};

// -> {ok, status, data}. A refused request still carries the view, so the page stays true.
export async function shopAct(caseId, action, body = {}) {
  try {
    const r = await fetch("/api/shops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action, device: deviceId(), ...body }) });
    const data = await r.json().catch(() => ({}));
    if (data.balance != null) keep(caseId, data);
    if (r.ok && data.last?.avatar) {
      // the file photo changed: the cached result (golf, the file) and every open view
      const last = readLastResult();
      if (last && (!last.caseId || last.caseId === caseId)) writeLastResult({ ...last, avatar: data.last.avatar });
      emit("hvi-outfit", { caseId, avatar: data.last.avatar });
    }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "The till did not answer. Nothing was bought." } };
  }
}

// What a building's flats have placed (public, cached half a minute per building).
const ROOMS = new Map();
export function loadRooms(buildingId, { fresh = false } = {}) {
  const c = ROOMS.get(buildingId);
  if (c && !fresh && Date.now() - c.at < 30_000) return c.p;
  const p = fetch(`/api/shops?building=${encodeURIComponent(buildingId)}`).then(r => (r.ok ? r.json() : { rooms: [] })).then(d => d.rooms || []).catch(() => []);
  ROOMS.set(buildingId, { at: Date.now(), p });
  return p;
}
export const forgetRooms = (buildingId) => ROOMS.delete(buildingId);
