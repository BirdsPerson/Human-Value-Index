-- THE SHOPS, slice 1 (docs/design/ECONOMY_PROPERTY.md, "The shops"): clothes and furniture bought
-- with CYCLES from the Department's stores. A purchase BURNS its CYCLES: cash:<h> -> dept:burned, a
-- sink against the allowance. Items are kept per case (econ_items), worn and saved outfits per case
-- (econ_outfits), and furniture placed in the rooms of the case's assigned flat (econ_placements).
-- The slice-1 rules hold: server only, RLS on with no policies, no grants to anon / authenticated,
-- double entry, balances never below zero, idempotent by key, and a txn touches ONE case only:
-- there is no gift, resale or transfer of an item or a CYCLE between players anywhere here.
-- A case needs a wallet (econ_citizens) to buy; every row hangs off it, so the subject's purge
-- (econ_purge deletes the citizen) takes the wardrobe and the furniture with it.

alter table econ_txns drop constraint if exists econ_txns_kind_check;
alter table econ_txns add constraint econ_txns_kind_check check (kind in ('ubi', 'buy', 'sell', 'return', 'oplace', 'ofill', 'levy', 'shop'));
insert into econ_accounts (id, kind) values ('dept:burned', 'dept') on conflict (id) do nothing;

create table if not exists econ_items (
  id         bigserial primary key,
  case_hash  text not null references econ_citizens (case_hash) on delete cascade,
  sku        text not null check (sku ~ '^(w|f):[a-z0-9.-]{2,48}$'),
  kind       text not null check (kind in ('wear', 'furn')),
  price      bigint not null check (price > 0),
  txn_id     bigint not null references econ_txns (id) on delete cascade,
  bought_at  timestamptz not null default now()
);
create index if not exists econ_items_case on econ_items (case_hash, id);
-- one of each garment per file; furniture up to max_each copies (checked under the case's lock)
create unique index if not exists econ_items_wear_once on econ_items (case_hash, sku) where kind = 'wear';

-- slot 0 is what the case is wearing; 1..3 the saved outfits. outfit: {"top": "<wear sku>", ...}
create table if not exists econ_outfits (
  case_hash  text not null references econ_citizens (case_hash) on delete cascade,
  slot       smallint not null check (slot between 0 and 3),
  outfit     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (case_hash, slot)
);

-- A placed piece: one item, one spot (f0..f4 on the floor, w0..w2 on the wall) in one room of the
-- case's assigned flat. A spot holds one piece, whoever's (flatmates share the rooms).
create table if not exists econ_placements (
  item_id    bigint primary key references econ_items (id) on delete cascade,
  case_hash  text not null references econ_citizens (case_hash) on delete cascade,
  flat       text not null,
  room       text not null check (room like flat || ':%'),
  spot       text not null check (spot ~ '^(f[0-4]|w[0-2])$'),
  placed_at  timestamptz not null default now(),
  unique (room, spot)
);
create index if not exists econ_placements_room on econ_placements (room text_pattern_ops);

-- ---- buy -------------------------------------------------------------------------------------
-- p: {idem, case_hash, sku, name, kind, price, max_each}
-- -> {ok, item, txn} | {ok, dup} | {ok: false, error: no-wallet | owned | too-many | insufficient}
create or replace function econ_shop_buy(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  k text := p->>'kind';
  amt bigint := (p->>'price')::bigint;
  v_txn bigint;
  v_item bigint;
begin
  if h is null or h = '' then raise exception 'econ: a purchase names its case'; end if;
  if amt is null or amt <= 0 then raise exception 'econ: a purchase has a price'; end if;
  if exists (select 1 from econ_txns where idem_key = p->>'idem') then return jsonb_build_object('ok', true, 'dup', true); end if;
  if not exists (select 1 from econ_citizens where case_hash = h) then return jsonb_build_object('ok', false, 'error', 'no-wallet'); end if;
  insert into econ_accounts (id, case_hash, kind) values ('cash:' || h, h, 'cash') on conflict (id) do nothing;
  perform 1 from econ_accounts where id in ('cash:' || h, 'dept:burned') order by id for update;
  if k = 'wear' and exists (select 1 from econ_items where case_hash = h and sku = p->>'sku') then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;
  if k = 'furn' and (select count(*) from econ_items where case_hash = h and sku = p->>'sku') >= coalesce((p->>'max_each')::int, 3) then
    return jsonb_build_object('ok', false, 'error', 'too-many');
  end if;
  if (select balance from econ_accounts where id = 'cash:' || h) < amt then return jsonb_build_object('ok', false, 'error', 'insufficient'); end if;
  insert into econ_txns (idem_key, kind, case_hash, memo) values (p->>'idem', 'shop', h, jsonb_build_object('sku', p->>'sku', 'name', p->>'name', 'price', amt)) returning id into v_txn;
  insert into econ_entries (txn_id, account, amount) values (v_txn, 'cash:' || h, -amt), (v_txn, 'dept:burned', amt);
  update econ_accounts set balance = balance - amt where id = 'cash:' || h;
  update econ_accounts set balance = balance + amt where id = 'dept:burned';
  insert into econ_items (case_hash, sku, kind, price, txn_id) values (h, p->>'sku', k, amt, v_txn) returning id into v_item;
  return jsonb_build_object('ok', true, 'dup', false, 'item', v_item, 'txn', v_txn);
exception
  when check_violation then return jsonb_build_object('ok', false, 'error', 'insufficient');
  when unique_violation then return jsonb_build_object('ok', true, 'dup', true);
end $$;

-- ---- upgrade: a piece becomes the next tier ------------------------------------------------------
-- p: {idem, case_hash, item_id, from_sku, to_sku, price, max_each, place: {flat, room, spot} | null}
-- The difference and the fee are burned (cash -> dept:burned); the old piece is consumed (its row
-- goes, its purchase stays on the ledger); the new piece stands where the old one stood when the
-- server says it fits (place), else it waits in the inventory.
-- -> {ok, item, txn} | {ok, dup} | {ok: false, error: not-owned | too-many | insufficient | taken}
create or replace function econ_shop_upgrade(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  amt bigint := (p->>'price')::bigint;
  old econ_items;
  v_txn bigint;
  v_item bigint;
begin
  if h is null or h = '' then raise exception 'econ: an upgrade names its case'; end if;
  if amt is null or amt <= 0 then raise exception 'econ: an upgrade has a price'; end if;
  if exists (select 1 from econ_txns where idem_key = p->>'idem') then return jsonb_build_object('ok', true, 'dup', true); end if;
  insert into econ_accounts (id, case_hash, kind) values ('cash:' || h, h, 'cash') on conflict (id) do nothing;
  perform 1 from econ_accounts where id in ('cash:' || h, 'dept:burned') order by id for update;
  select * into old from econ_items where id = (p->>'item_id')::bigint and case_hash = h and kind = 'furn' and sku = p->>'from_sku' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not-owned'); end if;
  if (select count(*) from econ_items where case_hash = h and sku = p->>'to_sku') >= coalesce((p->>'max_each')::int, 3) then
    return jsonb_build_object('ok', false, 'error', 'too-many');
  end if;
  if (select balance from econ_accounts where id = 'cash:' || h) < amt then return jsonb_build_object('ok', false, 'error', 'insufficient'); end if;
  insert into econ_txns (idem_key, kind, case_hash, memo) values (p->>'idem', 'shop', h, jsonb_build_object('sku', p->>'to_sku', 'name', p->>'name', 'from', p->>'from_sku', 'price', amt, 'upgrade', true)) returning id into v_txn;
  insert into econ_entries (txn_id, account, amount) values (v_txn, 'cash:' || h, -amt), (v_txn, 'dept:burned', amt);
  update econ_accounts set balance = balance - amt where id = 'cash:' || h;
  update econ_accounts set balance = balance + amt where id = 'dept:burned';
  delete from econ_items where id = old.id;   -- consumed (its placement with it)
  insert into econ_items (case_hash, sku, kind, price, txn_id) values (h, p->>'to_sku', 'furn', old.price + amt, v_txn) returning id into v_item;
  if jsonb_typeof(p->'place') = 'object' then
    insert into econ_placements (item_id, case_hash, flat, room, spot) values (v_item, h, p->'place'->>'flat', p->'place'->>'room', p->'place'->>'spot');
  end if;
  return jsonb_build_object('ok', true, 'dup', false, 'item', v_item, 'txn', v_txn);
exception
  when check_violation then return jsonb_build_object('ok', false, 'error', 'insufficient');
  when unique_violation then return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- ---- the file's things -----------------------------------------------------------------------------
create or replace function econ_shop_view(p jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'wallet', exists (select 1 from econ_citizens where case_hash = p->>'case_hash'),
    'cash', coalesce((select balance from econ_accounts where id = 'cash:' || (p->>'case_hash')), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'sku', i.sku, 'kind', i.kind, 'price', i.price, 'bought_at', i.bought_at) order by i.id)
        from econ_items i where i.case_hash = p->>'case_hash'), '[]'::jsonb),
    'outfits', coalesce((select jsonb_object_agg(o.slot::text, o.outfit) from econ_outfits o where o.case_hash = p->>'case_hash'), '{}'::jsonb),
    'placements', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'flat', x.flat, 'room', x.room, 'spot', x.spot) order by x.item_id)
        from econ_placements x where x.case_hash = p->>'case_hash'), '[]'::jsonb)
  )
$$;

-- ---- outfits: every piece named must be the case's own -----------------------------------------------
-- p: {case_hash, slot, outfit} -> {ok} | {ok: false, error: no-wallet | not-owned}
create or replace function econ_shop_outfit(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  v text;
begin
  if not exists (select 1 from econ_citizens where case_hash = h) then return jsonb_build_object('ok', false, 'error', 'no-wallet'); end if;
  for v in select value from jsonb_each_text(coalesce(p->'outfit', '{}'::jsonb)) loop
    if not exists (select 1 from econ_items where case_hash = h and kind = 'wear' and sku = 'w:' || v) then
      return jsonb_build_object('ok', false, 'error', 'not-owned');
    end if;
  end loop;
  insert into econ_outfits (case_hash, slot, outfit, updated_at) values (h, (p->>'slot')::smallint, coalesce(p->'outfit', '{}'::jsonb), now())
    on conflict (case_hash, slot) do update set outfit = excluded.outfit, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---- placing furniture ---------------------------------------------------------------------------------
-- p: {case_hash, item_id, flat, room, spot} places (or moves) the piece; {case_hash, item_id, remove: true}
-- takes it back to the inventory. -> {ok} | {ok: false, error: not-owned | taken}
create or replace function econ_shop_place(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  iid bigint := (p->>'item_id')::bigint;
begin
  if not exists (select 1 from econ_items where id = iid and case_hash = h and kind = 'furn') then
    return jsonb_build_object('ok', false, 'error', 'not-owned');
  end if;
  if coalesce((p->>'remove')::boolean, false) then
    delete from econ_placements where item_id = iid and case_hash = h;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  if exists (select 1 from econ_placements where room = p->>'room' and spot = p->>'spot' and item_id <> iid) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;
  insert into econ_placements (item_id, case_hash, flat, room, spot) values (iid, h, p->>'flat', p->>'room', p->>'spot')
    on conflict (item_id) do update set flat = excluded.flat, room = excluded.room, spot = excluded.spot, placed_at = now();
  return jsonb_build_object('ok', true);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- ---- what a building's flats hold: public (no case, no hash), for the cutaway --------------------------
-- p: {building} -> [{room, spot, sku}]
create or replace function econ_shop_rooms(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('room', x.room, 'spot', x.spot, 'sku', i.sku) order by x.room, x.spot), '[]'::jsonb)
    from econ_placements x join econ_items i on i.id = x.item_id
   where x.room like (p->>'building') || ':%'
$$;

-- ---- lock it down (as slice 1) ------------------------------------------------------------------------
alter table econ_items enable row level security;
alter table econ_outfits enable row level security;
alter table econ_placements enable row level security;
revoke execute on function econ_shop_buy(jsonb), econ_shop_upgrade(jsonb), econ_shop_view(jsonb), econ_shop_outfit(jsonb), econ_shop_place(jsonb), econ_shop_rooms(jsonb) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on econ_items, econ_outfits, econ_placements from %I', r);
      execute format('revoke all on sequence econ_items_id_seq from %I', r);
      execute format('revoke execute on function econ_shop_buy(jsonb), econ_shop_upgrade(jsonb), econ_shop_view(jsonb), econ_shop_outfit(jsonb), econ_shop_place(jsonb), econ_shop_rooms(jsonb) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function econ_shop_buy(jsonb), econ_shop_upgrade(jsonb), econ_shop_view(jsonb), econ_shop_outfit(jsonb), econ_shop_place(jsonb), econ_shop_rooms(jsonb) to service_role;
    grant all on econ_items, econ_outfits, econ_placements to service_role;
    grant usage on sequence econ_items_id_seq to service_role;
  end if;
end $$;
