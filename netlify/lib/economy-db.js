// THE TREASURY's ledger: the econ_* functions of supabase/migrations/*_economy_slice1.sql,
// called by name. Two backends behind one rpc(name, payload):
//   supabase  production: PostgREST /rest/v1/rpc/<name> with the service role key
//             (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, Netlify secrets). Server only.
//   memory    the same functions in JS over Maps, for scripts/check-economy.mjs and local
//             runs (HVI_ECONOMY_BACKEND=memory). Never used in production: with no Supabase
//             secrets the economy is CLOSED, not running off the books.
// The memory functions mirror the SQL rule for rule (double entry, one case per txn,
// idempotency keys, the non-negative balance, the purge); check-economy can also run its
// whole suite against a real Postgres with the migration applied (HVI_ECON_PG=1, psql).
import { createHash } from "node:crypto";
import { marketMemory } from "./market-db.js";
import { shopsMemory } from "./shops-db.js";

const salt = () => process.env.HVI_IP_SALT || "hvi-limits-v1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
// The ledger never holds a case number: a salted one-way hash (the proposals' pattern).
export const caseHash = (caseId) => sha(`${salt()}:econ:${caseId}`).slice(0, 32);
export const ownerHash = (key) => (key ? sha(`${salt()}:econ-owner:${key}`).slice(0, 32) : null);

export class LedgerDown extends Error { constructor(msg) { super(msg); this.name = "LedgerDown"; } }

// ---- supabase ------------------------------------------------------------------------------
function supabase(url, key) {
  const base = url.replace(/\/+$/, "");
  const headers = { apikey: key, "Content-Type": "application/json", Accept: "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;   // legacy JWT service role
  return {
    kind: "supabase",
    async rpc(name, p) {
      let r;
      try {
        r = await fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify({ p }), signal: AbortSignal.timeout(8000) });
      } catch (e) { throw new LedgerDown(`ledger unreachable: ${e?.name}`); }
      const text = await r.text();
      if (!r.ok) throw new LedgerDown(`ledger ${name} ${r.status}: ${text.slice(0, 200)}`);
      return text ? JSON.parse(text) : null;
    },
  };
}

// ---- memory ----------------------------------------------------------------------------------
export function memoryLedger() {
  const db = {
    citizens: new Map(), accounts: new Map(), txns: [], entries: [], claims: new Map(), investments: new Map(), returns: new Map(), seq: 0, eseq: 0,
  };
  const DEPT = ["dept:treasury", "dept:shops", "dept:market"];
  for (const id of DEPT) db.accounts.set(id, { id, case_hash: null, kind: "dept", industry: null, balance: 0 });
  const nowMs = () => (globalThis.__econNow ?? Date.now());
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const kindOf = (id) => (id.startsWith("dept:") ? "dept" : id.startsWith("inv:") ? "inv" : id.startsWith("esc:") ? "esc" : "cash");

  const fns = {
    econ_enrol(p) {
      const h = p.case_hash, c = db.citizens.get(h);
      if (c) return { ok: true, existing: true, vest_day: c.vest_day };
      if (!p.exempt) {
        const week = nowMs() - 7 * 86_400_000;
        if (p.ip_hash && [...db.citizens.values()].filter(x => x.ip_hash === p.ip_hash && x.at > week).length >= (p.ip_cap ?? 4)) return { ok: false, error: "ip-cap" };
        if (p.device_hash && [...db.citizens.values()].filter(x => x.device_hash === p.device_hash).length >= (p.device_cap ?? 2)) return { ok: false, error: "device-cap" };
        if (p.owner_hash && [...db.citizens.values()].some(x => x.owner_hash === p.owner_hash)) return { ok: false, error: "owner-cap" };
      }
      db.citizens.set(h, { case_hash: h, vest_day: p.vest_day, ip_hash: p.ip_hash ?? null, device_hash: p.device_hash ?? null, owner_hash: p.owner_hash ?? null, at: nowMs() });
      return { ok: true, existing: false, vest_day: p.vest_day };
    },
    econ_post(p) {
      const h = p.case_hash;
      if (!h) throw new Error("econ: a txn names its case");
      if (db.txns.some(t => t.idem_key === p.idem)) return { ok: true, dup: true };
      if (p.legs.reduce((s, l) => s + Number(l.amount), 0) !== 0) throw new Error(`econ: unbalanced txn ${p.idem}`);
      if (p.legs.some(l => !l.account.startsWith("dept:") && !(l.account === `cash:${h}` || l.account.startsWith(`inv:${h}:`)))) throw new Error("econ: a txn may not touch another case's account");
      for (const l of p.legs) if (!db.accounts.has(l.account)) db.accounts.set(l.account, { id: l.account, case_hash: l.account.startsWith("dept:") ? null : h, kind: l.kind || kindOf(l.account), industry: l.industry || null, balance: 0 });
      if (p.unlocked) { const i = db.investments.get(`${h}|${p.unlocked}`); if (i?.locked_until && i.locked_until > nowMs()) return { ok: false, error: "locked" }; }
      // the transaction: check everything, then apply (all or nothing, as the SQL block)
      const next = new Map();
      for (const l of p.legs) next.set(l.account, (next.get(l.account) ?? db.accounts.get(l.account).balance) + Number(l.amount));
      for (const [id, b] of next) if (db.accounts.get(id).kind !== "dept" && b < 0) return { ok: false, error: "insufficient" };
      for (const d of p.claims || []) if (db.claims.has(`${h}|${d}`)) return { ok: true, dup: true };
      const id = ++db.seq;
      db.txns.push({ id, idem_key: p.idem, kind: p.kind, case_hash: h, day: p.day || null, memo: p.memo || {}, created_at: new Date(nowMs()).toISOString() });
      for (const l of p.legs) db.entries.push({ id: ++db.eseq, txn_id: id, account: l.account, amount: Number(l.amount) });
      for (const [aid, b] of next) db.accounts.get(aid).balance = b;
      for (const d of p.claims || []) db.claims.set(`${h}|${d}`, { case_hash: h, day: d, txn_id: id });
      if (p.position) {
        const k = `${h}|${p.position.industry}`, cur = db.investments.get(k) || { case_hash: h, industry: p.position.industry, basis: 0, locked_until: null };
        cur.basis = Math.max(0, cur.basis + Number(p.position.basis_delta));
        if (p.position.lock_days != null) cur.locked_until = nowMs() + p.position.lock_days * 86_400_000;
        db.investments.set(k, cur);
      }
      return { ok: true, dup: false, txn: id };
    },
    econ_close(p) {
      for (const r of p.returns) {
        const k = `${p.day}|${r.industry}`;
        if (!db.returns.has(k)) db.returns.set(k, { day: p.day, industry: r.industry, ppm: r.ppm, idx: r.idx, herd: r.herd, share: r.share, machine_day: r.machine_day ?? null, ver: r.ver ?? null, inputs: r.inputs ?? null });
      }
      let n = 0, moved = 0;
      const accts = [...db.accounts.values()].filter(a => a.kind === "inv" && a.balance > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const a of accts) {
        const ret = db.returns.get(`${p.day}|${a.industry}`);
        if (!ret) continue;
        const g = Math.trunc((a.balance * ret.ppm) / 1e6);
        if (g === 0) continue;
        const idem = `ret:${p.day}:${a.id}`;
        if (db.txns.some(t => t.idem_key === idem)) continue;
        const id = ++db.seq;
        db.txns.push({ id, idem_key: idem, kind: "return", case_hash: a.case_hash, day: p.day, memo: { industry: a.industry, ppm: ret.ppm }, created_at: new Date(nowMs()).toISOString() });
        db.entries.push({ id: ++db.eseq, txn_id: id, account: a.id, amount: g }, { id: ++db.eseq, txn_id: id, account: "dept:market", amount: -g });
        a.balance += g; db.accounts.get("dept:market").balance -= g;
        n++; moved += g;
      }
      return { ok: true, positions: n, net: moved };
    },
    econ_view(p) {
      const h = p.case_hash, c = db.citizens.get(h);
      const cashId = `cash:${h}`;
      const sumOn = (tid, pred) => db.entries.filter(e => e.txn_id === tid && pred(e.account)).reduce((s, e) => s + e.amount, 0);
      const mine = db.txns.filter(t => t.case_hash === h);
      const claims = [...db.claims.values()].filter(x => x.case_hash === h);
      return clone({
        citizen: c ? { case_hash: h, vest_day: c.vest_day, enrolled_at: new Date(c.at).toISOString() } : null,
        cash: db.accounts.get(cashId)?.balance ?? 0,
        positions: [...db.accounts.values()].filter(a => a.case_hash === h && a.kind === "inv" && a.balance > 0).sort((a, b) => (a.industry < b.industry ? -1 : 1))
          .map(a => { const i = db.investments.get(`${h}|${a.industry}`); return { industry: a.industry, value: a.balance, basis: i?.basis ?? 0, locked_until: i?.locked_until ? new Date(i.locked_until).toISOString() : null }; }),
        claims: claims.filter(x => x.day >= p.since).map(x => x.day).sort(),
        last_claim: claims.map(x => x.day).sort().pop() || null,
        recent: mine.slice().sort((a, b) => b.id - a.id).slice(0, p.limit ?? 20)
          .map(t => ({ id: t.id, kind: t.kind, day: t.day, memo: t.memo, created_at: t.created_at, cash: sumOn(t.id, a => a === cashId), inv: sumOn(t.id, a => a.startsWith("inv:")) })),
      });
    },
    econ_board(p) {
      const invested = {}, holders = {};
      for (const a of db.accounts.values()) if (a.kind === "inv" && a.balance > 0) { invested[a.industry] = (invested[a.industry] || 0) + a.balance; holders[a.industry] = (holders[a.industry] || 0) + 1; }
      const days = [...new Set([...db.returns.values()].map(r => r.day))].sort();
      const through = days[days.length - 1] || null;
      const keep = new Set(days.slice(-(p.days ?? 7)));
      return clone({ invested, holders, returns: [...db.returns.values()].filter(r => keep.has(r.day)).sort((a, b) => (a.day === b.day ? (a.industry < b.industry ? -1 : 1) : a.day < b.day ? 1 : -1)), closed_through: through, citizens: db.citizens.size });
    },
    econ_purge(p) {
      const h = p.case_hash;
      const tids = new Set(db.txns.filter(t => t.case_hash === h).map(t => t.id));
      for (const e of db.entries) if (tids.has(e.txn_id) && e.account.startsWith("dept:")) db.accounts.get(e.account).balance -= e.amount;
      db.entries = db.entries.filter(e => !tids.has(e.txn_id));
      db.txns = db.txns.filter(t => !tids.has(t.id));
      let na = 0;
      for (const [id, a] of db.accounts) if (a.case_hash === h) { db.accounts.delete(id); na++; }
      for (const [k, v] of db.investments) if (v.case_hash === h) db.investments.delete(k);
      for (const [k, v] of db.claims) if (v.case_hash === h) db.claims.delete(k);
      db.citizens.delete(h);
      return { ok: true, txns: tids.size, accounts: na };
    },
  };
  // THE MARKET's functions (market-db.js), and the view / purge with its rows
  const M = marketMemory(db, { nowMs, clone });
  const { wrapView, wrapPurge, ...mfns } = M;
  Object.assign(fns, mfns, { econ_view: wrapView(fns.econ_view), econ_purge: wrapPurge(fns.econ_purge) });
  // THE SHOPS' functions (shops-db.js), and the purge with their rows
  const S = shopsMemory(db, { nowMs, clone });
  const { wrapPurge: shopPurge, ...sfns } = S;
  Object.assign(fns, sfns, { econ_purge: shopPurge(fns.econ_purge) });
  return {
    kind: "memory",
    db,
    async rpc(name, p) {
      await new Promise(r => setImmediate(r));   // interleave like a network call
      const f = fns[name];
      if (!f) throw new Error(`no function ${name}`);
      return f(clone(p));
    },
  };
}

// ---- the backend in force ------------------------------------------------------------------------
let mem = null;
export function ledger() {
  if (globalThis.__econLedger) return globalThis.__econLedger;   // checks inject one
  if (process.env.HVI_ECONOMY === "off") return null;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return supabase(url, key);
  if (process.env.HVI_ECONOMY_BACKEND === "memory") return (mem ||= memoryLedger());
  return null;
}
export const economyOpen = () => Boolean(ledger());

// Purge / prune: the case's whole ledger goes with its file. No ledger configured: nothing to do.
export async function purgeLedger(caseId) {
  const L = ledger();
  if (!L) return { ok: true, skipped: true };
  return L.rpc("econ_purge", { case_hash: caseHash(caseId) });
}
