// THE MALL in the browser: the day's enterprise block from the published summary (plans.js
// publishSplit writes it; enterprise.js publicBlock shapes it), and each subject's satisfaction
// (planClient.js reads it beside the window rows). Read-only: the browser never runs the chain.
import { summaryOf, satOf } from "./planClient.js";
import { clockAt } from "./simApi.js";
import { keyOf } from "./sim.js";
import { UNITS, SHOP_TYPES, openAt, satWord } from "./enterprise.js";

// dev: window.__HVI_ENT_PREVIEW__ = a block to preview (businesses before any day has them)
export function enterpriseOf(day) {
  if (import.meta.env?.DEV && typeof window !== "undefined" && window.__HVI_ENT_PREVIEW__) return window.__HVI_ENT_PREVIEW__;
  return summaryOf(day)?.enterprise || null;
}
const today = () => clockAt(Date.now());
export const enterpriseNow = () => enterpriseOf(today().day);

const BY_ID = new WeakMap();
export function bizById(block, id) {
  if (!block) return null;
  let m = BY_ID.get(block);
  if (!m) { m = new Map([...block.closed.map(c => [c.id, { ...c, status: "CLOSED" }]), ...block.biz.map(b => [b.id, b])]); BY_ID.set(block, m); }
  return m.get(id) || null;
}
// A unit as the street sees it now: {unit, state: "OPEN" | "CLOSED" | "TO LET", biz, type, open (trading this hour)}
export function unitView(unitId, block = enterpriseNow(), hour = today().hour) {
  const u = block?.units?.[unitId] || { s: "TO LET" };
  const biz = u.id ? bizById(block, u.id) : null;
  const type = u.type ? SHOP_TYPES[u.type] : null;
  return { unit: UNITS[unitId], state: u.s, biz, typeId: u.type || null, type, open: u.s === "OPEN" && openAt(u.type, hour) };
}
// Who owns or works at a business today: key -> {biz, role}
const ROLES = new WeakMap();
export function roleOf(subject, block = enterpriseNow()) {
  if (!block || !subject) return null;
  let m = ROLES.get(block);
  if (!m) {
    m = new Map();
    for (const b of block.biz) { m.set(b.owner, { biz: b, role: "owner" }); for (const [k] of b.staff) m.set(k, { biz: b, role: "staff" }); }
    ROLES.set(block, m);
  }
  return m.get(keyOf(subject)) || null;
}
// The card's line: "SATISFACTION: 34 // MISFILED. THE DEPARTMENT IS AWARE." (null when not counted)
export function satisfactionLine(subject) {
  const row = satOf(keyOf(subject), today().day);
  if (!row) return null;
  return { score: row[0], word: satWord(row), row };
}
