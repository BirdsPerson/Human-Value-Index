-- THE MARKET, slice 1 (docs/design/ECONOMY_PROPERTY.md, "The Living Market"): shares in the
-- humans on file, bought and sold ONLY with the Department, in batches at each machine-day tick.
-- The slice-1 rules hold: server only, RLS on with no policies, no grants to anon /
-- authenticated, double entry, balances never below zero, and a txn touches ONE case only: there
-- is no player-to-player path anywhere in the market.
--
-- An order is filed (a buy's CYCLES move from the case's cash to its own escrow, esc:<h>; a
-- sell's shares are reserved) and filled at the next tick's price by econ_orders_fill, which the
-- market tick (netlify/lib/market.js) calls once per machine day with every order it read. A
-- filled or refused order never changes again; a fill is idempotent per order.
-- Accounts added:  esc:<h> (the case's own escrow)  dept:commons (the levy in, the dividend out)

alter table econ_accounts drop constraint if exists econ_accounts_kind_check;
alter table econ_accounts add constraint econ_accounts_kind_check check (kind in ('cash', 'inv', 'dept', 'esc'));
alter table econ_txns drop constraint if exists econ_txns_kind_check;
alter table econ_txns add constraint econ_txns_kind_check check (kind in ('ubi', 'buy', 'sell', 'return', 'oplace', 'ofill', 'levy'));
insert into econ_accounts (id, kind) values ('dept:commons', 'dept') on conflict (id) do nothing;

create table if not exists econ_shares (
  case_hash    text not null,
  slug         text not null,
  units        bigint not null default 0 check (units >= 0),
  reserved     bigint not null default 0 check (reserved >= 0),
  basis        bigint not null default 0 check (basis >= 0),
  locked_until timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (case_hash, slug),
  constraint econ_shares_reserved check (reserved <= units)
);
create index if not exists econ_shares_slug on econ_shares (slug) where units > 0;

create table if not exists econ_orders (
  id         bigserial primary key,
  idem_key   text not null unique,
  case_hash  text not null,
  slug       text not null,
  side       text not null check (side in ('buy', 'sell')),
  amount     bigint not null default 0 check (amount >= 0),   -- buy: CYCLES escrowed
  units      bigint not null default 0 check (units >= 0),    -- sell: shares reserved
  status     text not null default 'pending' check (status in ('pending', 'filled', 'refused')),
  tick_day   integer,                                         -- the machine day whose tick filled it
  price      numeric,
  fill_units bigint,
  fill_cash  bigint,
  note       text,
  created_at timestamptz not null default now(),
  filled_at  timestamptz
);
create index if not exists econ_orders_pending on econ_orders (id) where status = 'pending';
create index if not exists econ_orders_case on econ_orders (case_hash, id desc);
create index if not exists econ_orders_tick on econ_orders (tick_day);

-- The citizens' dividend: the day's concentration levy (players' and NPCs') over the eligible
-- citizens (enrolled a week or more, and collected in the week), paid with the next COLLECT.
create table if not exists econ_dividends (
  day         date primary key,
  pool        bigint not null,
  eligible    integer not null,
  per_citizen bigint not null check (per_citizen >= 0),
  created_at  timestamptz not null default now()
);

-- ---- file an order ----------------------------------------------------------------------------
-- p: {idem, case_hash, slug, side, amount (buy), units (sell), max_pending}
-- -> {ok, order} | {ok, dup} | {ok: false, error: insufficient | locked | no-shares | too-many}
create or replace function econ_order_place(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  s text := p->>'slug';
  amt bigint := coalesce((p->>'amount')::bigint, 0);
  u bigint := coalesce((p->>'units')::bigint, 0);
  v_txn bigint;
  v_order bigint;
  sh econ_shares;
begin
  if h is null or h = '' or s is null or s = '' then raise exception 'econ: an order names its case and its human'; end if;
  if exists (select 1 from econ_orders where idem_key = p->>'idem') then return jsonb_build_object('ok', true, 'dup', true); end if;
  perform pg_advisory_xact_lock(hashtext('econ-order:' || h));
  if (select count(*) from econ_orders where case_hash = h and status = 'pending') >= coalesce((p->>'max_pending')::int, 20) then
    return jsonb_build_object('ok', false, 'error', 'too-many');
  end if;
  if p->>'side' = 'buy' then
    if amt <= 0 then raise exception 'econ: a buy escrows CYCLES'; end if;
    insert into econ_accounts (id, case_hash, kind) values ('cash:' || h, h, 'cash'), ('esc:' || h, h, 'esc') on conflict (id) do nothing;
    perform 1 from econ_accounts where id in ('cash:' || h, 'esc:' || h) order by id for update;
    if (select balance from econ_accounts where id = 'cash:' || h) < amt then return jsonb_build_object('ok', false, 'error', 'insufficient'); end if;
    insert into econ_txns (idem_key, kind, case_hash, memo) values ('oplace:' || (p->>'idem'), 'oplace', h, jsonb_build_object('slug', s, 'side', 'buy', 'amount', amt)) returning id into v_txn;
    insert into econ_entries (txn_id, account, amount) values (v_txn, 'cash:' || h, -amt), (v_txn, 'esc:' || h, amt);
    update econ_accounts set balance = balance - amt where id = 'cash:' || h;
    update econ_accounts set balance = balance + amt where id = 'esc:' || h;
    insert into econ_orders (idem_key, case_hash, slug, side, amount) values (p->>'idem', h, s, 'buy', amt) returning id into v_order;
  elsif p->>'side' = 'sell' then
    if u <= 0 then raise exception 'econ: a sell names its shares'; end if;
    select * into sh from econ_shares where case_hash = h and slug = s for update;
    if not found or sh.units - sh.reserved < u then return jsonb_build_object('ok', false, 'error', 'no-shares'); end if;
    if sh.locked_until is not null and sh.locked_until > now() then return jsonb_build_object('ok', false, 'error', 'locked', 'until', sh.locked_until); end if;
    update econ_shares set reserved = reserved + u, updated_at = now() where case_hash = h and slug = s;
    insert into econ_orders (idem_key, case_hash, slug, side, units) values (p->>'idem', h, s, 'sell', u) returning id into v_order;
  else
    raise exception 'econ: buy or sell';
  end if;
  return jsonb_build_object('ok', true, 'dup', false, 'order', v_order);
exception
  when check_violation then return jsonb_build_object('ok', false, 'error', 'insufficient');
  when unique_violation then return jsonb_build_object('ok', true, 'dup', true);
end $$;

-- ---- what the tick reads -----------------------------------------------------------------------
-- p: {tick_day} -> every pending order, and every order this tick already settled (a re-run of
-- the same tick reads the same batch), each with the holder's shares in that human now.
create or replace function econ_orders_batch(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'case_hash', o.case_hash, 'slug', o.slug, 'side', o.side, 'amount', o.amount,
      'units', o.units, 'status', o.status, 'tick_day', o.tick_day, 'fill_units', o.fill_units, 'held', coalesce(sh.units, 0)) order by o.id), '[]'::jsonb)
    from econ_orders o left join econ_shares sh on sh.case_hash = o.case_hash and sh.slug = o.slug
   where o.status = 'pending' or o.tick_day = (p->>'tick_day')::int
$$;

-- Every player's shares per human (the board and the cap on the whole float).
create or replace function econ_share_totals(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(slug, total), '{}'::jsonb) from (select slug, sum(units) as total from econ_shares where units > 0 group by slug) s
$$;

-- ---- fill a batch --------------------------------------------------------------------------------
-- p: {tick_day, hold_hours, fills: [{id, units, cash}]}: buy -> units bought for `cash` (<= the
-- escrow; the rest refunded); sell -> units sold for `cash`. units 0 refuses the order (a buy's
-- escrow comes back whole, a sell's reservation is released). One balanced txn per order, the
-- case's own accounts and dept:market only. An order that is no longer pending is skipped.
create or replace function econ_orders_fill(p jsonb) returns jsonb language plpgsql as $$
declare
  f jsonb;
  o econ_orders;
  u bigint;
  c bigint;
  v_txn bigint;
  n int := 0;
  hold int := coalesce((p->>'hold_hours')::int, 24);
  sh econ_shares;
  basis_out bigint;
begin
  perform 1 from econ_accounts where id = 'dept:market' for update;
  for f in select * from jsonb_array_elements(coalesce(p->'fills', '[]'::jsonb)) loop
    select * into o from econ_orders where id = (f->>'id')::bigint for update;
    continue when not found or o.status <> 'pending';
    u := greatest(0, coalesce((f->>'units')::bigint, 0));
    c := greatest(0, coalesce((f->>'cash')::bigint, 0));
    if o.side = 'buy' then
      if u = 0 then c := 0; end if;
      if c > o.amount then raise exception 'econ: a fill cannot cost more than its escrow'; end if;
      perform 1 from econ_accounts where id in ('cash:' || o.case_hash, 'esc:' || o.case_hash) order by id for update;
      insert into econ_txns (idem_key, kind, case_hash, memo) values ('fill:' || o.id, 'ofill', o.case_hash,
        jsonb_build_object('slug', o.slug, 'side', 'buy', 'units', u, 'cash', c, 'order', o.id, 'tick', (p->>'tick_day')::int)) returning id into v_txn;
      insert into econ_entries (txn_id, account, amount) values (v_txn, 'esc:' || o.case_hash, -o.amount);
      if c > 0 then insert into econ_entries (txn_id, account, amount) values (v_txn, 'dept:market', c); end if;
      if o.amount - c > 0 then insert into econ_entries (txn_id, account, amount) values (v_txn, 'cash:' || o.case_hash, o.amount - c); end if;
      update econ_accounts set balance = balance - o.amount where id = 'esc:' || o.case_hash;
      update econ_accounts set balance = balance + c where id = 'dept:market';
      update econ_accounts set balance = balance + (o.amount - c) where id = 'cash:' || o.case_hash;
      if u > 0 then
        insert into econ_shares (case_hash, slug, units, basis, locked_until) values (o.case_hash, o.slug, u, c, now() + make_interval(hours => hold))
          on conflict (case_hash, slug) do update set units = econ_shares.units + u, basis = econ_shares.basis + c,
            locked_until = now() + make_interval(hours => hold), updated_at = now();
      end if;
    else
      select * into sh from econ_shares where case_hash = o.case_hash and slug = o.slug for update;
      if u > o.units then raise exception 'econ: a fill cannot sell more than the order'; end if;
      if u = 0 then c := 0; end if;
      basis_out := case when sh.units > 0 then (sh.basis * u) / sh.units else 0 end;
      update econ_shares set units = units - u, reserved = reserved - o.units, basis = greatest(0, basis - basis_out), updated_at = now()
        where case_hash = o.case_hash and slug = o.slug;
      if c > 0 then
        insert into econ_accounts (id, case_hash, kind) values ('cash:' || o.case_hash, o.case_hash, 'cash') on conflict (id) do nothing;
        perform 1 from econ_accounts where id = 'cash:' || o.case_hash for update;
        insert into econ_txns (idem_key, kind, case_hash, memo) values ('fill:' || o.id, 'ofill', o.case_hash,
          jsonb_build_object('slug', o.slug, 'side', 'sell', 'units', u, 'cash', c, 'order', o.id, 'tick', (p->>'tick_day')::int)) returning id into v_txn;
        insert into econ_entries (txn_id, account, amount) values (v_txn, 'dept:market', -c), (v_txn, 'cash:' || o.case_hash, c);
        update econ_accounts set balance = balance - c where id = 'dept:market';
        update econ_accounts set balance = balance + c where id = 'cash:' || o.case_hash;
      end if;
    end if;
    update econ_orders set status = case when u > 0 then 'filled' else 'refused' end, tick_day = (p->>'tick_day')::int,
      price = nullif(f->>'price', '')::numeric, fill_units = u, fill_cash = c, note = f->>'note', filled_at = now() where id = o.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'filled', n);
end $$;

-- ---- the daily close: the levy and the dividend ----------------------------------------------------
-- Holders whose cash + industry positions + share cost reach `min` (the levy reads their shares at
-- the close price in JS).
create or replace function econ_rich(p jsonb) returns jsonb language sql stable as $$
  with w as (
    select c.case_hash,
           coalesce((select balance from econ_accounts where id = 'cash:' || c.case_hash), 0) as cash,
           coalesce((select sum(balance) from econ_accounts where case_hash = c.case_hash and kind = 'inv'), 0) as inv,
           coalesce((select sum(basis) from econ_shares where case_hash = c.case_hash), 0) as cost
      from econ_citizens c)
  select coalesce(jsonb_agg(jsonb_build_object('case_hash', w.case_hash, 'cash', w.cash, 'inv', w.inv,
      'shares', coalesce((select jsonb_object_agg(slug, units) from econ_shares s where s.case_hash = w.case_hash and s.units > 0), '{}'::jsonb))
      order by w.case_hash), '[]'::jsonb)
    from w where w.cash + w.inv + w.cost >= coalesce((p->>'min')::bigint, 0)
$$;

-- p: {day, levies: [{case_hash, amount}], npc_pool, share} -> {ok, pool, eligible, per_citizen}.
-- Each levy is one txn (cash -> dept:commons, at most the cash there is, once per case per day);
-- then the day's dividend is declared once.
create or replace function econ_levy_close(p jsonb) returns jsonb language plpgsql as $$
declare
  dd date := (p->>'day')::date;
  l jsonb;
  h text;
  amt bigint;
  v_txn bigint;
  pool bigint;
  elig int;
  d econ_dividends;
begin
  select * into d from econ_dividends where day = dd;
  if found then return jsonb_build_object('ok', true, 'dup', true, 'pool', d.pool, 'eligible', d.eligible, 'per_citizen', d.per_citizen); end if;
  perform 1 from econ_accounts where id = 'dept:commons' for update;
  for l in select * from jsonb_array_elements(coalesce(p->'levies', '[]'::jsonb)) loop
    h := l->>'case_hash';
    perform 1 from econ_accounts where id = 'cash:' || h for update;
    amt := least(greatest(0, (l->>'amount')::bigint), coalesce((select balance from econ_accounts where id = 'cash:' || h), 0));
    continue when amt <= 0;
    insert into econ_txns (idem_key, kind, case_hash, day, memo) values ('levy:' || dd || ':' || h, 'levy', h, dd, jsonb_build_object('amount', amt))
      on conflict (idem_key) do nothing returning id into v_txn;
    continue when v_txn is null;
    insert into econ_entries (txn_id, account, amount) values (v_txn, 'cash:' || h, -amt), (v_txn, 'dept:commons', amt);
    update econ_accounts set balance = balance - amt where id = 'cash:' || h;
    update econ_accounts set balance = balance + amt where id = 'dept:commons';
  end loop;
  pool := coalesce((p->>'npc_pool')::bigint, 0) + coalesce((select sum(e.amount) from econ_entries e join econ_txns t on t.id = e.txn_id
            where t.kind = 'levy' and t.day = dd and e.account = 'dept:commons'), 0);
  pool := floor(pool * coalesce((p->>'share')::numeric, 1));
  select count(*) into elig from econ_citizens c where c.enrolled_at <= (dd - 6)::timestamptz
     and exists (select 1 from econ_ubi_claims u where u.case_hash = c.case_hash and u.day > dd - 7 and u.day <= dd);
  insert into econ_dividends (day, pool, eligible, per_citizen) values (dd, pool, elig, case when elig > 0 then pool / elig else 0 end)
    on conflict (day) do nothing;
  select * into d from econ_dividends where day = dd;
  return jsonb_build_object('ok', true, 'dup', false, 'pool', d.pool, 'eligible', d.eligible, 'per_citizen', d.per_citizen);
end $$;

-- The richest players for the board: cash + industry positions, and their shares (valued in JS).
create or replace function econ_leaders(p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.base desc, x.case_hash), '[]'::jsonb) from (
    select c.case_hash,
           coalesce((select balance from econ_accounts where id = 'cash:' || c.case_hash), 0)
             + coalesce((select balance from econ_accounts where id = 'esc:' || c.case_hash), 0)
             + coalesce((select sum(balance) from econ_accounts where case_hash = c.case_hash and kind = 'inv'), 0)
             + coalesce((select sum(basis) from econ_shares where case_hash = c.case_hash), 0) as base,
           coalesce((select balance from econ_accounts where id = 'cash:' || c.case_hash), 0)
             + coalesce((select balance from econ_accounts where id = 'esc:' || c.case_hash), 0)
             + coalesce((select sum(balance) from econ_accounts where case_hash = c.case_hash and kind = 'inv'), 0) as liquid,
           coalesce((select jsonb_object_agg(slug, units) from econ_shares s where s.case_hash = c.case_hash and s.units > 0), '{}'::jsonb) as shares
      from econ_citizens c
     order by 2 desc, 1 limit coalesce((p->>'limit')::int, 100)) x
$$;

-- ---- the file's view, with shares, open orders and dividends -------------------------------------
create or replace function econ_view(p jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'citizen', (select to_jsonb(c) - 'ip_hash' - 'device_hash' - 'owner_hash' from econ_citizens c where c.case_hash = p->>'case_hash'),
    'cash', coalesce((select balance from econ_accounts where id = 'cash:' || (p->>'case_hash')), 0),
    'escrow', coalesce((select balance from econ_accounts where id = 'esc:' || (p->>'case_hash')), 0),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('industry', a.industry, 'value', a.balance, 'basis', coalesce(i.basis, 0), 'locked_until', i.locked_until) order by a.industry)
        from econ_accounts a left join econ_investments i on i.case_hash = a.case_hash and i.industry = a.industry
       where a.case_hash = p->>'case_hash' and a.kind = 'inv' and a.balance > 0), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(jsonb_build_object('slug', s.slug, 'units', s.units, 'reserved', s.reserved, 'basis', s.basis, 'locked_until', s.locked_until) order by s.slug)
        from econ_shares s where s.case_hash = p->>'case_hash' and s.units > 0), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'slug', o.slug, 'side', o.side, 'amount', o.amount, 'units', o.units, 'status', o.status,
        'fill_units', o.fill_units, 'fill_cash', o.fill_cash, 'price', o.price, 'created_at', o.created_at, 'filled_at', o.filled_at) order by o.id desc)
        from (select * from econ_orders where case_hash = p->>'case_hash' order by id desc limit 8) o), '[]'::jsonb),
    'dividends', coalesce((select jsonb_object_agg(day, per_citizen) from econ_dividends where day >= (p->>'since')::date - 1), '{}'::jsonb),
    'claims', coalesce((select jsonb_agg(day order by day) from econ_ubi_claims
       where case_hash = p->>'case_hash' and day >= (p->>'since')::date), '[]'::jsonb),
    'last_claim', (select max(day) from econ_ubi_claims where case_hash = p->>'case_hash'),
    'recent', coalesce((select jsonb_agg(x order by x.id desc) from (
        select t.id, t.kind, t.day, t.memo, t.created_at,
               (select coalesce(sum(e.amount), 0) from econ_entries e where e.txn_id = t.id and e.account = 'cash:' || (p->>'case_hash')) as cash,
               (select coalesce(sum(e.amount), 0) from econ_entries e where e.txn_id = t.id and e.account like 'inv:%') as inv
          from econ_txns t where t.case_hash = p->>'case_hash' order by t.id desc limit coalesce((p->>'limit')::int, 20)) x), '[]'::jsonb)
  )
$$;

-- ---- purge: the market rows go with the file -------------------------------------------------------
create or replace function econ_purge(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  nt int; na int;
begin
  perform set_config('econ.purging', 'on', true);
  perform 1 from econ_accounts where id like 'dept:%' order by id for update;
  update econ_accounts a set balance = a.balance - s.total
    from (select e.account, sum(e.amount) as total from econ_entries e join econ_txns t on t.id = e.txn_id
           where t.case_hash = h and e.account like 'dept:%' group by e.account) s
   where a.id = s.account;
  delete from econ_txns where case_hash = h;
  get diagnostics nt = row_count;
  delete from econ_accounts where case_hash = h;
  get diagnostics na = row_count;
  delete from econ_investments where case_hash = h;
  delete from econ_ubi_claims where case_hash = h;
  delete from econ_shares where case_hash = h;
  delete from econ_orders where case_hash = h;
  delete from econ_citizens where case_hash = h;
  perform set_config('econ.purging', 'off', true);
  return jsonb_build_object('ok', true, 'txns', nt, 'accounts', na);
end $$;

-- ---- lock it down (as slice 1) ---------------------------------------------------------------------
alter table econ_shares enable row level security;
alter table econ_orders enable row level security;
alter table econ_dividends enable row level security;
revoke execute on function econ_order_place(jsonb), econ_orders_batch(jsonb), econ_share_totals(jsonb), econ_orders_fill(jsonb), econ_rich(jsonb),
  econ_levy_close(jsonb), econ_leaders(jsonb), econ_view(jsonb), econ_purge(jsonb) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on econ_shares, econ_orders, econ_dividends from %I', r);
      execute format('revoke all on sequence econ_orders_id_seq from %I', r);
      execute format('revoke execute on function econ_order_place(jsonb), econ_orders_batch(jsonb), econ_share_totals(jsonb), econ_orders_fill(jsonb), econ_rich(jsonb), econ_levy_close(jsonb), econ_leaders(jsonb), econ_view(jsonb), econ_purge(jsonb) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function econ_order_place(jsonb), econ_orders_batch(jsonb), econ_share_totals(jsonb), econ_orders_fill(jsonb), econ_rich(jsonb),
      econ_levy_close(jsonb), econ_leaders(jsonb), econ_view(jsonb), econ_purge(jsonb) to service_role;
    grant all on econ_shares, econ_orders, econ_dividends to service_role;
    grant usage on sequence econ_orders_id_seq to service_role;
  end if;
end $$;
