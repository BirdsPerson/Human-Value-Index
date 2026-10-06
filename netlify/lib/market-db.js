// THE MARKET's ledger functions in memory: the twin of supabase/migrations/*_market_slice1.sql,
// rule for rule (escrowed buys, reserved sells, one balanced txn per fill touching one case,
// idempotent per order, the levy once per case per day, the dividend declared once a day).
// economy-db.js memoryLedger() mixes these in; scripts/check-market.mjs runs against them (and
// against a real Postgres with HVI_ECON_PG=1).
export function marketMemory(db, { nowMs, clone }) {
  db.shares ||= new Map();     // "h|slug" -> {case_hash, slug, units, reserved, basis, locked_until}
  db.orders ||= [];
  db.dividends ||= new Map();
  db.oseq ||= 0;
  if (!db.accounts.has("dept:commons")) db.accounts.set("dept:commons", { id: "dept:commons", case_hash: null, kind: "dept", industry: null, balance: 0 });
  const acct = (id, h, kind) => { if (!db.accounts.has(id)) db.accounts.set(id, { id, case_hash: h, kind, industry: null, balance: 0 }); return db.accounts.get(id); };
  const txn = (idem, kind, h, memo, legs, day = null) => {
    if (db.txns.some(t => t.idem_key === idem)) return null;
    if (legs.reduce((s, l) => s + l[1], 0) !== 0) throw new Error(`econ: unbalanced txn ${idem}`);
    for (const [a] of legs) if (!a.startsWith("dept:") && !a.endsWith(`:${h}`)) throw new Error("econ: a txn may not touch another case's account");
    const id = ++db.seq;
    db.txns.push({ id, idem_key: idem, kind, case_hash: h, day, memo, created_at: new Date(nowMs()).toISOString() });
    for (const [a, amt] of legs) if (amt) { db.entries.push({ id: ++db.eseq, txn_id: id, account: a, amount: amt }); db.accounts.get(a).balance += amt; }
    return id;
  };
  return {
    econ_order_place(p) {
      const h = p.case_hash, s = p.slug;
      if (!h || !s) throw new Error("econ: an order names its case and its human");
      if (db.orders.some(o => o.idem_key === p.idem)) return { ok: true, dup: true };
      if (db.orders.filter(o => o.case_hash === h && o.status === "pending").length >= (p.max_pending ?? 20)) return { ok: false, error: "too-many" };
      if (p.side === "buy") {
        const amt = Number(p.amount);
        if (!(amt > 0)) throw new Error("econ: a buy escrows CYCLES");
        const cash = acct(`cash:${h}`, h, "cash"); acct(`esc:${h}`, h, "esc");
        if (cash.balance < amt) return { ok: false, error: "insufficient" };
        txn(`oplace:${p.idem}`, "oplace", h, { slug: s, side: "buy", amount: amt }, [[`cash:${h}`, -amt], [`esc:${h}`, amt]]);
        const o = { id: ++db.oseq, idem_key: p.idem, case_hash: h, slug: s, side: "buy", amount: amt, units: 0, status: "pending", tick_day: null, created_at: new Date(nowMs()).toISOString() };
        db.orders.push(o);
        return { ok: true, dup: false, order: o.id };
      }
      if (p.side === "sell") {
        const u = Number(p.units);
        if (!(u > 0)) throw new Error("econ: a sell names its shares");
        const sh = db.shares.get(`${h}|${s}`);
        if (!sh || sh.units - sh.reserved < u) return { ok: false, error: "no-shares" };
        if (sh.locked_until && sh.locked_until > nowMs()) return { ok: false, error: "locked", until: new Date(sh.locked_until).toISOString() };
        sh.reserved += u;
        const o = { id: ++db.oseq, idem_key: p.idem, case_hash: h, slug: s, side: "sell", amount: 0, units: u, status: "pending", tick_day: null, created_at: new Date(nowMs()).toISOString() };
        db.orders.push(o);
        return { ok: true, dup: false, order: o.id };
      }
      throw new Error("econ: buy or sell");
    },
    econ_orders_batch(p) {
      return clone(db.orders.filter(o => o.status === "pending" || o.tick_day === p.tick_day).sort((a, b) => a.id - b.id)
        .map(o => ({ id: o.id, case_hash: o.case_hash, slug: o.slug, side: o.side, amount: o.amount, units: o.units, status: o.status, tick_day: o.tick_day, fill_units: o.fill_units ?? null, held: db.shares.get(`${o.case_hash}|${o.slug}`)?.units ?? 0 })));
    },
    econ_share_totals() {
      const out = {};
      for (const sh of db.shares.values()) if (sh.units > 0) out[sh.slug] = (out[sh.slug] || 0) + sh.units;
      return out;
    },
    econ_orders_fill(p) {
      let n = 0;
      const hold = p.hold_hours ?? 24;
      for (const f of p.fills || []) {
        const o = db.orders.find(x => x.id === f.id);
        if (!o || o.status !== "pending") continue;
        const u = Math.max(0, Number(f.units) || 0);
        let c = Math.max(0, Number(f.cash) || 0);
        if (!u) c = 0;
        const h = o.case_hash, k = `${h}|${o.slug}`;
        if (o.side === "buy") {
          if (c > o.amount) throw new Error("econ: a fill cannot cost more than its escrow");
          txn(`fill:${o.id}`, "ofill", h, { slug: o.slug, side: "buy", units: u, cash: c, order: o.id, tick: p.tick_day }, [[`esc:${h}`, -o.amount], ["dept:market", c], [`cash:${h}`, o.amount - c]]);
          if (u > 0) {
            const sh = db.shares.get(k) || { case_hash: h, slug: o.slug, units: 0, reserved: 0, basis: 0, locked_until: null };
            sh.units += u; sh.basis += c; sh.locked_until = nowMs() + hold * 3_600_000;
            db.shares.set(k, sh);
          }
        } else {
          const sh = db.shares.get(k);
          if (u > o.units) throw new Error("econ: a fill cannot sell more than the order");
          const out = sh.units > 0 ? Math.trunc((sh.basis * u) / sh.units) : 0;
          sh.units -= u; sh.reserved -= o.units; sh.basis = Math.max(0, sh.basis - out);
          if (c > 0) { acct(`cash:${h}`, h, "cash"); txn(`fill:${o.id}`, "ofill", h, { slug: o.slug, side: "sell", units: u, cash: c, order: o.id, tick: p.tick_day }, [["dept:market", -c], [`cash:${h}`, c]]); }
        }
        Object.assign(o, { status: u > 0 ? "filled" : "refused", tick_day: p.tick_day, price: f.price ?? null, fill_units: u, fill_cash: c, note: f.note ?? null, filled_at: new Date(nowMs()).toISOString() });
        n++;
      }
      return { ok: true, filled: n };
    },
    econ_rich(p) {
      const out = [];
      for (const c of [...db.citizens.values()].sort((a, b) => (a.case_hash < b.case_hash ? -1 : 1))) {
        const h = c.case_hash;
        const cash = db.accounts.get(`cash:${h}`)?.balance ?? 0;
        const inv = [...db.accounts.values()].filter(a => a.case_hash === h && a.kind === "inv").reduce((s, a) => s + a.balance, 0);
        const mine = [...db.shares.values()].filter(s => s.case_hash === h);
        const cost = mine.reduce((s, x) => s + x.basis, 0);
        if (cash + inv + cost >= (p.min ?? 0)) out.push({ case_hash: h, cash, inv, shares: Object.fromEntries(mine.filter(s => s.units > 0).map(s => [s.slug, s.units])) });
      }
      return clone(out);
    },
    econ_levy_close(p) {
      const d = db.dividends.get(p.day);
      if (d) return { ok: true, dup: true, ...d };
      for (const l of p.levies || []) {
        const h = l.case_hash, cash = db.accounts.get(`cash:${h}`)?.balance ?? 0;
        const amt = Math.min(Math.max(0, Number(l.amount) || 0), cash);
        if (amt > 0) txn(`levy:${p.day}:${h}`, "levy", h, { amount: amt }, [[`cash:${h}`, -amt], ["dept:commons", amt]], p.day);
      }
      const levied = db.txns.filter(t => t.kind === "levy" && t.day === p.day).reduce((s, t) => s + db.entries.filter(e => e.txn_id === t.id && e.account === "dept:commons").reduce((x, e) => x + e.amount, 0), 0);
      const pool = Math.floor(((Number(p.npc_pool) || 0) + levied) * (p.share ?? 1));
      const dayMs = Date.parse(`${p.day}T00:00:00Z`);
      const weekAgo = new Date(dayMs - 7 * 86_400_000).toISOString().slice(0, 10);
      const elig = [...db.citizens.values()].filter(c => c.at <= dayMs - 6 * 86_400_000 && [...db.claims.values()].some(x => x.case_hash === c.case_hash && x.day > weekAgo && x.day <= p.day)).length;
      const row = { pool, eligible: elig, per_citizen: elig > 0 ? Math.floor(pool / elig) : 0 };
      db.dividends.set(p.day, row);
      return { ok: true, dup: false, ...row };
    },
    econ_leaders(p) {
      const rows = [...db.citizens.values()].map(c => {
        const h = c.case_hash;
        const liquid = (db.accounts.get(`cash:${h}`)?.balance ?? 0) + (db.accounts.get(`esc:${h}`)?.balance ?? 0)
          + [...db.accounts.values()].filter(a => a.case_hash === h && a.kind === "inv").reduce((s, a) => s + a.balance, 0);
        const mine = [...db.shares.values()].filter(s => s.case_hash === h);
        return { case_hash: h, liquid, base: liquid + mine.reduce((s, x) => s + x.basis, 0), shares: Object.fromEntries(mine.filter(s => s.units > 0).map(s => [s.slug, s.units])) };
      });
      return clone(rows.sort((a, b) => b.liquid - a.liquid || (a.case_hash < b.case_hash ? -1 : 1)).slice(0, p.limit ?? 100).sort((a, b) => b.base - a.base || (a.case_hash < b.case_hash ? -1 : 1)));
    },
    // econ_view and econ_purge: the slice-1 functions, plus the market's rows
    wrapView(base) {
      return (p) => {
        const v = base(p), h = p.case_hash;
        v.escrow = db.accounts.get(`esc:${h}`)?.balance ?? 0;
        v.shares = [...db.shares.values()].filter(s => s.case_hash === h && s.units > 0).sort((a, b) => (a.slug < b.slug ? -1 : 1))
          .map(s => ({ slug: s.slug, units: s.units, reserved: s.reserved, basis: s.basis, locked_until: s.locked_until ? new Date(s.locked_until).toISOString() : null }));
        v.orders = db.orders.filter(o => o.case_hash === h).sort((a, b) => b.id - a.id).slice(0, 8)
          .map(o => ({ id: o.id, slug: o.slug, side: o.side, amount: o.amount, units: o.units, status: o.status, fill_units: o.fill_units ?? null, fill_cash: o.fill_cash ?? null, price: o.price ?? null, created_at: o.created_at, filled_at: o.filled_at ?? null }));
        const since = new Date(Date.parse(`${p.since}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
        v.dividends = Object.fromEntries([...db.dividends].filter(([d]) => d >= since).map(([d, r]) => [d, r.per_citizen]));
        return clone(v);
      };
    },
    wrapPurge(base) {
      return (p) => {
        const r = base(p), h = p.case_hash;
        for (const [k, s] of db.shares) if (s.case_hash === h) db.shares.delete(k);
        db.orders = db.orders.filter(o => o.case_hash !== h);
        return r;
      };
    },
  };
}
