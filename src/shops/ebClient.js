// THE EB SHOP's virtual copies from the browser (/api/eb-virtual, /api/eb-claim). One fetch of the
// copies per page, shared; the copies' photos for the flats' shelves and frames (ebPieces.js draws
// them once the page has them). Buying a copy is /api/shops (shops/client.js), like any purchase.
import { setEbThumbs } from "../city/ebPieces.js";
import { thumb } from "../city/shopStock.js";

let ST = { state: "idle", items: [], claims: false };
let LOADING = null;
const subs = new Set();
const tell = () => { for (const f of subs) { try { f(ST); } catch { /* a dead listener */ } } };
export const virtualState = () => ST;
export function onVirtual(f) { subs.add(f); return () => subs.delete(f); }

export function loadVirtual(fetchFn = typeof fetch !== "undefined" ? fetch : null) {
  if (LOADING) return LOADING;
  if (!fetchFn) return Promise.resolve(ST);
  ST = { ...ST, state: "loading" }; tell();
  LOADING = fetchFn("/api/eb-virtual").then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => {
    const items = Array.isArray(j?.items) ? j.items.filter(i => i && i.sku && i.handle) : [];
    ST = { state: items.length ? "open" : "closed", items, claims: Boolean(j?.claims) };
    tell();
    return ST;
  });
  return LOADING;
}
export const copyOf = (handle, st = ST) => st.items.find(i => i.handle === handle) || null;
export const copyByH = (h, st = ST) => st.items.find(i => i.h === h) || null;

// the flats' shelves and frames: a copy's photo, pixelated, once loaded
setEbThumbs((h, px) => {
  if (ST.state === "idle") loadVirtual();
  const it = copyByH(h);
  return it ? thumb({ handle: `eb-v-${it.handle}`, image: it.image }, px) : null;
});

// -> {ok, status, data}
export async function claimPurchase(caseId, order, email) {
  try {
    const r = await fetch("/api/eb-claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, order, email }) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "THE EB SHOP'S RECORDS DID NOT ANSWER. NOTHING WAS CLAIMED." } };
  }
}
