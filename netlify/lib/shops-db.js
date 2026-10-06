// THE SHOPS' ledger functions in memory: the twin of supabase/migrations/*_shops_slice1.sql, rule
// for rule (a wallet first, idempotent by key, one of each garment, MAX copies of a furniture piece,
// the burn to dept:burned in one balanced txn touching one case, a spot holds one piece, the purge
// takes everything). economy-db.js memoryLedger() mixes these in; scripts/check-shops.mjs runs
// against them (and against a real Postgres with HVI_ECON_PG=1).
export function shopsMemory(db, { nowMs, clone }) {
  db.items ||= [];
  db.outfits ||= new Map();      // "h|slot" -> {case_hash, slot, outfit}
  db.placements ||= new Map();   // item_id -> {item_id, case_hash, flat, room, spot}
  db.iseq ||= 0;
  if (!db.accounts.has("dept:burned")) db.accounts.set("dept:burned", { id: "dept:burned", case_hash: null, kind: "dept", industry: null, balance: 0 });
  return {
    econ_shop_buy(p) {
      const h = p.case_hash, amt = Number(p.price);
      if (!h) throw new Error("econ: a purchase names its case");
      if (!(amt > 0)) throw new Error("econ: a purchase has a price");
      if (db.txns.some(t => t.idem_key === p.idem)) return { ok: true, dup: true };
      if (!db.citizens.has(h)) return { ok: false, error: "no-wallet" };
      if (!/^(w|f):[a-z0-9.-]{2,48}$/.test(p.sku)) throw new Error("econ: bad sku");
      const cashId = `cash:${h}`;
      if (!db.accounts.has(cashId)) db.accounts.set(cashId, { id: cashId, case_hash: h, kind: "cash", industry: null, balance: 0 });
      const mine = db.items.filter(i => i.case_hash === h && i.sku === p.sku);
      if (p.kind === "wear" && mine.length) return { ok: false, error: "owned" };
      if (p.kind === "furn" && mine.length >= (p.max_each ?? 3)) return { ok: false, error: "too-many" };
      if (db.accounts.get(cashId).balance < amt) return { ok: false, error: "insufficient" };
      const id = ++db.seq;
      db.txns.push({ id, idem_key: p.idem, kind: "shop", case_hash: h, day: null, memo: { sku: p.sku, name: p.name ?? null, price: amt }, created_at: new Date(nowMs()).toISOString() });
      db.entries.push({ id: ++db.eseq, txn_id: id, account: cashId, amount: -amt }, { id: ++db.eseq, txn_id: id, account: "dept:burned", amount: amt });
      db.accounts.get(cashId).balance -= amt; db.accounts.get("dept:burned").balance += amt;
      const item = { id: ++db.iseq, case_hash: h, sku: p.sku, kind: p.kind, price: amt, txn_id: id, bought_at: new Date(nowMs()).toISOString() };
      db.items.push(item);
      return { ok: true, dup: false, item: item.id, txn: id };
    },
    econ_shop_upgrade(p) {
      const h = p.case_hash, amt = Number(p.price);
      if (!h) throw new Error("econ: an upgrade names its case");
      if (!(amt > 0)) throw new Error("econ: an upgrade has a price");
      if (db.txns.some(t => t.idem_key === p.idem)) return { ok: true, dup: true };
      const cashId = `cash:${h}`;
      if (!db.accounts.has(cashId)) db.accounts.set(cashId, { id: cashId, case_hash: h, kind: "cash", industry: null, balance: 0 });
      const old = db.items.find(i => i.id === Number(p.item_id) && i.case_hash === h && i.kind === "furn" && i.sku === p.from_sku);
      if (!old) return { ok: false, error: "not-owned" };
      if (db.items.filter(i => i.case_hash === h && i.sku === p.to_sku).length >= (p.max_each ?? 3)) return { ok: false, error: "too-many" };
      if (db.accounts.get(cashId).balance < amt) return { ok: false, error: "insufficient" };
      if (p.place && [...db.placements.values()].some(x => x.room === p.place.room && x.spot === p.place.spot && x.item_id !== old.id)) return { ok: false, error: "taken" };
      const id = ++db.seq;
      db.txns.push({ id, idem_key: p.idem, kind: "shop", case_hash: h, day: null, memo: { sku: p.to_sku, name: p.name ?? null, from: p.from_sku, price: amt, upgrade: true }, created_at: new Date(nowMs()).toISOString() });
      db.entries.push({ id: ++db.eseq, txn_id: id, account: cashId, amount: -amt }, { id: ++db.eseq, txn_id: id, account: "dept:burned", amount: amt });
      db.accounts.get(cashId).balance -= amt; db.accounts.get("dept:burned").balance += amt;
      db.items = db.items.filter(i => i.id !== old.id);
      db.placements.delete(old.id);
      const item = { id: ++db.iseq, case_hash: h, sku: p.to_sku, kind: "furn", price: old.price + amt, txn_id: id, bought_at: new Date(nowMs()).toISOString() };
      db.items.push(item);
      if (p.place) db.placements.set(item.id, { item_id: item.id, case_hash: h, flat: p.place.flat, room: p.place.room, spot: p.place.spot });
      return { ok: true, dup: false, item: item.id, txn: id };
    },
    econ_shop_view(p) {
      const h = p.case_hash;
      return clone({
        wallet: db.citizens.has(h),
        cash: db.accounts.get(`cash:${h}`)?.balance ?? 0,
        items: db.items.filter(i => i.case_hash === h).map(i => ({ id: i.id, sku: i.sku, kind: i.kind, price: i.price, bought_at: i.bought_at })),
        outfits: Object.fromEntries([...db.outfits.values()].filter(o => o.case_hash === h).map(o => [String(o.slot), o.outfit])),
        placements: [...db.placements.values()].filter(x => x.case_hash === h).sort((a, b) => a.item_id - b.item_id).map(x => ({ item_id: x.item_id, flat: x.flat, room: x.room, spot: x.spot })),
      });
    },
    econ_shop_outfit(p) {
      const h = p.case_hash;
      if (!db.citizens.has(h)) return { ok: false, error: "no-wallet" };
      if (!(Number.isInteger(p.slot) && p.slot >= 0 && p.slot <= 3)) throw new Error("econ: outfit slot 0..3");
      for (const v of Object.values(p.outfit || {})) if (!db.items.some(i => i.case_hash === h && i.kind === "wear" && i.sku === `w:${v}`)) return { ok: false, error: "not-owned" };
      db.outfits.set(`${h}|${p.slot}`, { case_hash: h, slot: p.slot, outfit: p.outfit || {} });
      return { ok: true };
    },
    econ_shop_place(p) {
      const h = p.case_hash, iid = Number(p.item_id);
      if (!db.items.some(i => i.id === iid && i.case_hash === h && i.kind === "furn")) return { ok: false, error: "not-owned" };
      if (p.remove) { db.placements.delete(iid); return { ok: true, removed: true }; }
      if (!String(p.room).startsWith(`${p.flat}:`)) throw new Error("econ: the room is the flat's");
      if (!/^(f[0-4]|w[0-2])$/.test(p.spot)) throw new Error("econ: bad spot");
      if ([...db.placements.values()].some(x => x.room === p.room && x.spot === p.spot && x.item_id !== iid)) return { ok: false, error: "taken" };
      db.placements.set(iid, { item_id: iid, case_hash: h, flat: p.flat, room: p.room, spot: p.spot });
      return { ok: true };
    },
    econ_shop_rooms(p) {
      const pre = `${p.building}:`;
      return clone([...db.placements.values()].filter(x => x.room.startsWith(pre)).sort((a, b) => (a.room === b.room ? (a.spot < b.spot ? -1 : 1) : a.room < b.room ? -1 : 1))
        .map(x => ({ room: x.room, spot: x.spot, sku: db.items.find(i => i.id === x.item_id).sku })));
    },
    wrapPurge(base) {
      return (p) => {
        const r = base(p), h = p.case_hash;
        const gone = new Set(db.items.filter(i => i.case_hash === h).map(i => i.id));
        db.items = db.items.filter(i => i.case_hash !== h);
        for (const k of [...db.outfits.keys()]) if (k.startsWith(`${h}|`)) db.outfits.delete(k);
        for (const id of gone) db.placements.delete(id);
        return r;
      };
    },
  };
}
