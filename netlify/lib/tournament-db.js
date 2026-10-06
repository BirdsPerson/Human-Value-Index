// THE OPEN TOURNAMENTS' trophy grant in memory: the twin of supabase/migrations/*_tournament_trophies.sql
// (econ_award), rule for rule: idempotent by key, a wallet first, a trophy SKU only, no CYCLES moved
// (a 'claim' txn with no entries), the item a piece of furniture like any other. economy-db.js
// memoryLedger() mixes it in; scripts/check-tournament.mjs runs against it.
export function awardMemory(db, { nowMs }) {
  db.items ||= [];
  db.iseq ||= 0;
  return {
    econ_award(p) {
      const h = p.case_hash;
      if (!h || !/^award:f:trophy\./.test(String(p.idem || ""))) throw new Error("econ: an award names its case and its trophy");
      if (!/^f:trophy\.[a-z0-9-]{6,32}\.[oa][1-3]$/.test(String(p.sku || ""))) throw new Error("econ: an award grants a trophy");
      if (db.txns.some(t => t.idem_key === p.idem)) return { ok: true, dup: true };
      if (!db.citizens.has(h)) return { ok: false, error: "no-wallet" };
      const id = ++db.seq;
      db.txns.push({ id, idem_key: p.idem, kind: "claim", case_hash: h, day: null, memo: { sku: p.sku, name: p.name ?? null, award: true }, created_at: new Date(nowMs()).toISOString() });
      const item = { id: ++db.iseq, case_hash: h, sku: p.sku, kind: "furn", price: 1, txn_id: id, bought_at: new Date(nowMs()).toISOString() };
      db.items.push(item);
      return { ok: true, dup: false, item: item.id };
    },
  };
}
