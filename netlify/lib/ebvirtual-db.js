// The EB SHOP claims' ledger function in memory: the twin of supabase/migrations/*_eb_virtual.sql,
// rule for rule (a wallet first, a line claimed once ever, no CYCLES moved, a copy already bought is
// marked rather than doubled, the purge keeps the claim's hashes and drops the case). economy-db.js
// memoryLedger() mixes it in; scripts/check-ebvirtual.mjs runs against it.
export function ebvirtualMemory(db, { nowMs }) {
  db.irlClaims ||= new Map();   // "order|line" -> {order_hash, line_hash, email_hash, case_hash, sku}
  return {
    econ_irl_claim(p) {
      const h = p.case_hash, oh = p.order_hash;
      if (!h || !oh) throw new Error("econ: a claim names its case and its order");
      if (!db.citizens.has(h)) return { ok: false, error: "no-wallet" };
      const granted = [], already = [];
      for (const l of p.lines || []) {
        if (!/^(w|f):v-[a-z0-9.-]{2,46}$/.test(l.sku) || !["wear", "furn"].includes(l.kind)) throw new Error("econ: a claim grants a virtual copy");
        const k = `${oh}|${l.line_hash}`;
        if (db.irlClaims.has(k)) { already.push(l.sku); continue; }
        const id = ++db.seq;
        db.txns.push({ id, idem_key: `irl:${oh}:${l.line_hash}`, kind: "claim", case_hash: h, day: null, memo: { sku: l.sku, name: l.name ?? null, irl: true }, created_at: new Date(nowMs()).toISOString() });
        let item = db.items.find(i => i.case_hash === h && i.sku === l.sku);
        if (item) item.irl = true;
        else { item = { id: ++db.iseq, case_hash: h, sku: l.sku, kind: l.kind, price: Math.max(1, Number(l.price) || 1), txn_id: id, bought_at: new Date(nowMs()).toISOString(), irl: true }; db.items.push(item); }
        db.irlClaims.set(k, { order_hash: oh, line_hash: l.line_hash, email_hash: p.email_hash, case_hash: h, sku: l.sku });
        granted.push({ sku: l.sku, item: item.id });
      }
      return { ok: true, granted, already };
    },
    wrapView(base) {
      return (p) => {
        const v = base(p);
        for (const it of v.items || []) it.irl = Boolean(db.items.find(i => i.id === it.id)?.irl);
        return v;
      };
    },
    wrapPurge(base) {
      return (p) => {
        const r = base(p);
        for (const c of db.irlClaims.values()) if (c.case_hash === p.case_hash) c.case_hash = null;
        return r;
      };
    },
  };
}
