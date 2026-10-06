-- THE EB SHOP's VIRTUAL COPIES (docs/design/ECONOMY_PROPERTY.md, "The EB SHOP's virtual copies"):
-- a copy bought for CYCLES goes through econ_shop_buy unchanged (its SKU, "w:v-..." or "f:v-...", fits
-- the items' pattern; the CYCLES are burned). This adds the other way in: a REAL purchase at the EB
-- Shop, verified by the server against Shopify, grants the copy free, marked OWNED IN REAL LIFE.
--   econ_items.irl          the copy came with a real purchase (a badge; nothing else changes)
--   econ_irl_claims         one row per claimed order line, so a line is claimed once, ever. Keys are
--                           salted one-way hashes made by the server (the order, the line, the email);
--                           no order number, no email, nothing readable is stored. A purged file's
--                           claims keep their hashes (so the order is still spent) and lose the case.
--   econ_irl_claim(p)       the grant: no CYCLES move (a txn of kind 'claim' with no entries), one
--                           case only, idempotent per line.
-- The slice-1 rules hold: server only, RLS on with no policies, no grants to anon / authenticated.

alter table econ_txns drop constraint if exists econ_txns_kind_check;
alter table econ_txns add constraint econ_txns_kind_check check (kind in ('ubi', 'buy', 'sell', 'return', 'oplace', 'ofill', 'levy', 'shop', 'claim'));

alter table econ_items add column if not exists irl boolean not null default false;

create table if not exists econ_irl_claims (
  order_hash  text not null check (order_hash ~ '^[0-9a-f]{32}$'),
  line_hash   text not null check (line_hash ~ '^[0-9a-f]{32}$'),
  email_hash  text not null check (email_hash ~ '^[0-9a-f]{32}$'),
  case_hash   text references econ_citizens (case_hash) on delete set null,
  sku         text not null,
  claimed_at  timestamptz not null default now(),
  primary key (order_hash, line_hash)
);

-- p: {case_hash, order_hash, email_hash, lines: [{line_hash, sku, kind, name, price}]}
-- -> {ok, granted: [{sku, item}], already: [sku...]} | {ok: false, error: no-wallet}
create or replace function econ_irl_claim(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  oh text := p->>'order_hash';
  l jsonb;
  v_txn bigint;
  v_item bigint;
  granted jsonb := '[]'::jsonb;
  already jsonb := '[]'::jsonb;
begin
  if h is null or h = '' or oh is null then raise exception 'econ: a claim names its case and its order'; end if;
  if not exists (select 1 from econ_citizens where case_hash = h) then return jsonb_build_object('ok', false, 'error', 'no-wallet'); end if;
  perform pg_advisory_xact_lock(hashtext('econ-irl:' || oh));
  for l in select value from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    if l->>'sku' !~ '^(w|f):v-[a-z0-9.-]{2,46}$' or l->>'kind' not in ('wear', 'furn') then raise exception 'econ: a claim grants a virtual copy'; end if;
    if exists (select 1 from econ_irl_claims where order_hash = oh and line_hash = l->>'line_hash') then
      already := already || to_jsonb(l->>'sku');
      continue;
    end if;
    insert into econ_txns (idem_key, kind, case_hash, memo) values ('irl:' || oh || ':' || (l->>'line_hash'), 'claim', h,
      jsonb_build_object('sku', l->>'sku', 'name', l->>'name', 'irl', true)) returning id into v_txn;
    select id into v_item from econ_items where case_hash = h and sku = l->>'sku' order by id limit 1 for update;
    if found then
      update econ_items set irl = true where id = v_item;   -- bought the copy first: now it is the real one's too
    else
      insert into econ_items (case_hash, sku, kind, price, txn_id, irl) values (h, l->>'sku', l->>'kind', greatest(1, coalesce((l->>'price')::bigint, 1)), v_txn, true) returning id into v_item;
    end if;
    insert into econ_irl_claims (order_hash, line_hash, email_hash, case_hash, sku) values (oh, l->>'line_hash', p->>'email_hash', h, l->>'sku');
    granted := granted || jsonb_build_object('sku', l->>'sku', 'item', v_item);
  end loop;
  return jsonb_build_object('ok', true, 'granted', granted, 'already', already);
end $$;

-- the file's things now say which came with a real purchase
create or replace function econ_shop_view(p jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'wallet', exists (select 1 from econ_citizens where case_hash = p->>'case_hash'),
    'cash', coalesce((select balance from econ_accounts where id = 'cash:' || (p->>'case_hash')), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'sku', i.sku, 'kind', i.kind, 'price', i.price, 'bought_at', i.bought_at, 'irl', i.irl) order by i.id)
        from econ_items i where i.case_hash = p->>'case_hash'), '[]'::jsonb),
    'outfits', coalesce((select jsonb_object_agg(o.slot::text, o.outfit) from econ_outfits o where o.case_hash = p->>'case_hash'), '{}'::jsonb),
    'placements', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'flat', x.flat, 'room', x.room, 'spot', x.spot) order by x.item_id)
        from econ_placements x where x.case_hash = p->>'case_hash'), '[]'::jsonb)
  )
$$;

alter table econ_irl_claims enable row level security;
revoke execute on function econ_irl_claim(jsonb) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on econ_irl_claims from %I', r);
      execute format('revoke execute on function econ_irl_claim(jsonb), econ_shop_view(jsonb) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function econ_irl_claim(jsonb), econ_shop_view(jsonb) to service_role;
    grant all on econ_irl_claims to service_role;
  end if;
end $$;
