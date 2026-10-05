-- THE TREASURY, slice 1 (docs/design/ECONOMY_PROPERTY.md, phase 1): UBI, the citizen's
-- own spending, and the seven district industries. CYCLES are a play currency: never bought,
-- never cashed out, never moved between players (terms §11).
--
-- Server only. Netlify Functions call the econ_* functions below with the service role
-- (netlify/lib/economy-db.js). RLS is on for every table with no policies, and anon /
-- authenticated hold no grants on tables or functions: the browser cannot read or write any
-- of this, even with the project's public key.
--
-- Double entry: every txn's legs sum to zero (econ_post refuses otherwise); every account's
-- balance is the sum of its entries, maintained in the same transaction under row locks taken
-- in id order; a citizen's accounts can never go below zero (econ_balance_nonneg). The
-- Department's accounts (dept:*) are the other side of every leg and may go negative (the
-- treasury mints). A txn touches at most ONE case's accounts: there is no transfer between
-- players, and the function refuses a txn that would be one.
-- Accounts:  cash:<h>  inv:<h>:<industry>  dept:treasury  dept:shops  dept:market
-- <h> is a salted one-way hash of the case number (never the case number itself).

create table if not exists econ_citizens (
  case_hash   text primary key,
  vest_day    date not null,                 -- the first day UBI accrues (the file's third day)
  ip_hash     text,
  device_hash text,
  owner_hash  text,                          -- the email account the case is secured to, hashed
  enrolled_at timestamptz not null default now()
);
create index if not exists econ_citizens_ip on econ_citizens (ip_hash, enrolled_at);
create index if not exists econ_citizens_device on econ_citizens (device_hash);
create unique index if not exists econ_citizens_owner on econ_citizens (owner_hash) where owner_hash is not null;

create table if not exists econ_accounts (
  id         text primary key,
  case_hash  text,
  kind       text not null check (kind in ('cash', 'inv', 'dept')),
  industry   text,
  balance    bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint econ_balance_nonneg check (kind = 'dept' or balance >= 0),
  constraint econ_owner_shape check ((kind = 'dept') = (case_hash is null))
);
create index if not exists econ_accounts_case on econ_accounts (case_hash);

create table if not exists econ_txns (
  id         bigserial primary key,
  idem_key   text not null unique,
  kind       text not null check (kind in ('ubi', 'buy', 'sell', 'return')),
  case_hash  text,
  day        date,
  memo       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists econ_txns_case on econ_txns (case_hash, id desc);

create table if not exists econ_entries (
  id      bigserial primary key,
  txn_id  bigint not null references econ_txns (id) on delete cascade,
  account text not null references econ_accounts (id) on delete cascade,
  amount  bigint not null check (amount <> 0)
);
create index if not exists econ_entries_account on econ_entries (account);
create index if not exists econ_entries_txn on econ_entries (txn_id);

-- One UBI per case per real (UTC) day: the primary key is the guarantee.
create table if not exists econ_ubi_claims (
  case_hash text not null,
  day       date not null,
  txn_id    bigint not null references econ_txns (id) on delete cascade,
  primary key (case_hash, day)
);

create table if not exists econ_investments (
  case_hash    text not null,
  industry     text not null,
  basis        bigint not null default 0 check (basis >= 0),
  locked_until timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (case_hash, industry)
);

-- One row per industry per closed day: the yield applied and everything it was read from,
-- so every return is recomputable from the record (the day summary it came from is named).
create table if not exists econ_returns (
  day         date not null,
  industry    text not null,
  ppm         integer not null check (ppm between -10000 and 10000),
  idx         numeric,
  herd        numeric,
  share       numeric,
  machine_day integer,
  ver         text,
  inputs      jsonb,
  created_at  timestamptz not null default now(),
  primary key (day, industry)
);

-- Append-only: entries and txns are never edited. The only delete is a subject's purge
-- (econ_purge sets econ.purging for its own transaction).
create or replace function econ_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('econ.purging', true) = 'on' then return old; end if;
  raise exception 'econ: the ledger is append-only';
end $$;
drop trigger if exists econ_entries_append_only on econ_entries;
create trigger econ_entries_append_only before update or delete on econ_entries for each row execute function econ_append_only();
drop trigger if exists econ_txns_append_only on econ_txns;
create trigger econ_txns_append_only before update or delete on econ_txns for each row execute function econ_append_only();

insert into econ_accounts (id, kind) values ('dept:treasury', 'dept'), ('dept:shops', 'dept'), ('dept:market', 'dept')
  on conflict (id) do nothing;

-- ---- enrol: the anti-farming caps, atomic per address --------------------------------------
-- p: {case_hash, vest_day, ip_hash, device_hash, owner_hash, ip_cap, device_cap, exempt}
create or replace function econ_enrol(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  c econ_citizens;
begin
  select * into c from econ_citizens where case_hash = h;
  if found then return jsonb_build_object('ok', true, 'existing', true, 'vest_day', c.vest_day); end if;
  perform pg_advisory_xact_lock(hashtext('econ-enrol:' || coalesce(p->>'ip_hash', '')));
  if not coalesce((p->>'exempt')::boolean, false) then
    if p->>'ip_hash' is not null and (select count(*) from econ_citizens
        where ip_hash = p->>'ip_hash' and enrolled_at > now() - interval '7 days') >= coalesce((p->>'ip_cap')::int, 4) then
      return jsonb_build_object('ok', false, 'error', 'ip-cap');
    end if;
    if p->>'device_hash' is not null and (select count(*) from econ_citizens
        where device_hash = p->>'device_hash') >= coalesce((p->>'device_cap')::int, 2) then
      return jsonb_build_object('ok', false, 'error', 'device-cap');
    end if;
    if p->>'owner_hash' is not null and exists (select 1 from econ_citizens where owner_hash = p->>'owner_hash') then
      return jsonb_build_object('ok', false, 'error', 'owner-cap');
    end if;
  end if;
  insert into econ_citizens (case_hash, vest_day, ip_hash, device_hash, owner_hash)
    values (h, (p->>'vest_day')::date, p->>'ip_hash', p->>'device_hash', p->>'owner_hash')
    on conflict (case_hash) do nothing;
  select * into c from econ_citizens where case_hash = h;
  return jsonb_build_object('ok', true, 'existing', false, 'vest_day', c.vest_day);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'owner-cap');
end $$;

-- ---- post: one balanced, idempotent txn -----------------------------------------------------
-- p: {idem, kind, case_hash, day, memo, legs: [{account, kind, industry, amount}],
--     claims: [day...], position: {industry, basis_delta, lock_days}, unlocked: industry}
-- -> {ok, dup?, txn?} | {ok: false, error: 'insufficient' | 'locked'}
create or replace function econ_post(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  v_txn bigint;
  leg jsonb;
  d text;
  bad int;
begin
  if h is null or h = '' then raise exception 'econ: a txn names its case'; end if;
  if exists (select 1 from econ_txns where idem_key = p->>'idem') then
    return jsonb_build_object('ok', true, 'dup', true);
  end if;
  if (select coalesce(sum((l->>'amount')::bigint), 0) from jsonb_array_elements(p->'legs') l) <> 0 then
    raise exception 'econ: unbalanced txn %', p->>'idem';
  end if;
  -- no transfers: every non-Department leg is this case's own account
  select count(*) into bad from jsonb_array_elements(p->'legs') l
    where not (l->>'account' like 'dept:%')
      and not (l->>'account' = 'cash:' || h or l->>'account' like 'inv:' || h || ':%');
  if bad > 0 then raise exception 'econ: a txn may not touch another case''s account'; end if;

  insert into econ_accounts (id, case_hash, kind, industry)
    select distinct l->>'account', case when l->>'account' like 'dept:%' then null else h end,
           coalesce(l->>'kind', case when l->>'account' like 'dept:%' then 'dept' when l->>'account' like 'inv:%' then 'inv' else 'cash' end),
           nullif(l->>'industry', '')
      from jsonb_array_elements(p->'legs') l
    on conflict (id) do nothing;
  perform 1 from econ_accounts where id in (select l->>'account' from jsonb_array_elements(p->'legs') l) order by id for update;

  if p ? 'unlocked' and exists (select 1 from econ_investments
      where case_hash = h and industry = p->>'unlocked' and locked_until > now()) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  insert into econ_txns (idem_key, kind, case_hash, day, memo)
    values (p->>'idem', p->>'kind', h, nullif(p->>'day', '')::date, coalesce(p->'memo', '{}'::jsonb))
    returning id into v_txn;
  for leg in select * from jsonb_array_elements(p->'legs') loop
    insert into econ_entries (txn_id, account, amount) values (v_txn, leg->>'account', (leg->>'amount')::bigint);
    update econ_accounts set balance = balance + (leg->>'amount')::bigint where id = leg->>'account';
  end loop;
  for d in select jsonb_array_elements_text(coalesce(p->'claims', '[]'::jsonb)) loop
    insert into econ_ubi_claims (case_hash, day, txn_id) values (h, d::date, v_txn);
  end loop;
  if p ? 'position' then
    insert into econ_investments (case_hash, industry, basis, locked_until, updated_at)
      values (h, p->'position'->>'industry', greatest(0, (p->'position'->>'basis_delta')::bigint),
              case when (p->'position'->>'lock_days') is not null then now() + make_interval(days => (p->'position'->>'lock_days')::int) end, now())
      on conflict (case_hash, industry) do update set
        basis = greatest(0, econ_investments.basis + (p->'position'->>'basis_delta')::bigint),
        locked_until = coalesce(excluded.locked_until, econ_investments.locked_until),
        updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'dup', false, 'txn', v_txn);
exception
  when check_violation then return jsonb_build_object('ok', false, 'error', 'insufficient');
  when unique_violation then return jsonb_build_object('ok', true, 'dup', true);
end $$;

-- ---- close: one real day's returns, applied once ------------------------------------------
-- p: {day, returns: [{industry, ppm, idx, herd, share, machine_day, ver, inputs}]}
-- The returns rows are written once (a second close keeps the first); every position is then
-- credited trunc(balance x ppm / 1e6) under its own idempotency key, so a re-run applies nothing.
create or replace function econ_close(p jsonb) returns jsonb language plpgsql as $$
declare
  dd date := (p->>'day')::date;
  r record;
  g bigint;
  v_txn bigint;
  n int := 0;
  moved bigint := 0;
begin
  insert into econ_returns (day, industry, ppm, idx, herd, share, machine_day, ver, inputs)
    select dd, x->>'industry', (x->>'ppm')::int, (x->>'idx')::numeric, (x->>'herd')::numeric, (x->>'share')::numeric,
           nullif(x->>'machine_day', '')::int, x->>'ver', x->'inputs'
      from jsonb_array_elements(p->'returns') x
    on conflict (day, industry) do nothing;
  perform 1 from econ_accounts where id = 'dept:market' for update;
  for r in select a.id, a.case_hash, a.industry, a.balance, ret.ppm
             from econ_accounts a join econ_returns ret on ret.day = dd and ret.industry = a.industry
            where a.kind = 'inv' and a.balance > 0 order by a.id for update of a loop
    g := (r.balance * r.ppm) / 1000000;
    continue when g = 0;
    insert into econ_txns (idem_key, kind, case_hash, day, memo)
      values ('ret:' || dd || ':' || r.id, 'return', r.case_hash, dd, jsonb_build_object('industry', r.industry, 'ppm', r.ppm))
      on conflict (idem_key) do nothing returning id into v_txn;
    continue when v_txn is null;
    insert into econ_entries (txn_id, account, amount) values (v_txn, r.id, g), (v_txn, 'dept:market', -g);
    update econ_accounts set balance = balance + g where id = r.id;
    update econ_accounts set balance = balance - g where id = 'dept:market';
    n := n + 1; moved := moved + g;
  end loop;
  return jsonb_build_object('ok', true, 'positions', n, 'net', moved);
end $$;

-- ---- reads ------------------------------------------------------------------------------------
create or replace function econ_view(p jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'citizen', (select to_jsonb(c) - 'ip_hash' - 'device_hash' - 'owner_hash' from econ_citizens c where c.case_hash = p->>'case_hash'),
    'cash', coalesce((select balance from econ_accounts where id = 'cash:' || (p->>'case_hash')), 0),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('industry', a.industry, 'value', a.balance, 'basis', coalesce(i.basis, 0), 'locked_until', i.locked_until) order by a.industry)
        from econ_accounts a left join econ_investments i on i.case_hash = a.case_hash and i.industry = a.industry
       where a.case_hash = p->>'case_hash' and a.kind = 'inv' and a.balance > 0), '[]'::jsonb),
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

create or replace function econ_board(p jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'invested', coalesce((select jsonb_object_agg(industry, total) from (
        select industry, sum(balance) as total from econ_accounts where kind = 'inv' and balance > 0 group by industry) s), '{}'::jsonb),
    'holders', coalesce((select jsonb_object_agg(industry, n) from (
        select industry, count(*) as n from econ_accounts where kind = 'inv' and balance > 0 group by industry) s), '{}'::jsonb),
    'returns', coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' order by r.day desc, r.industry) from econ_returns r
        where r.day >= (select max(day) from econ_returns) - coalesce((p->>'days')::int, 7) + 1), '[]'::jsonb),
    'closed_through', (select max(day) from econ_returns),
    'citizens', (select count(*) from econ_citizens)
  )
$$;

-- ---- purge: the subject's file goes, and its ledger with it ----------------------------------
-- Every txn naming the case is removed with all its legs; the Department's accounts are
-- adjusted by the legs removed, so every remaining txn still sums to zero and every balance
-- is still the sum of its entries.
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
  delete from econ_citizens where case_hash = h;
  perform set_config('econ.purging', 'off', true);
  return jsonb_build_object('ok', true, 'txns', nt, 'accounts', na);
end $$;

-- ---- lock it down ---------------------------------------------------------------------------
alter table econ_citizens enable row level security;
alter table econ_accounts enable row level security;
alter table econ_txns enable row level security;
alter table econ_entries enable row level security;
alter table econ_ubi_claims enable row level security;
alter table econ_investments enable row level security;
alter table econ_returns enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on econ_citizens, econ_accounts, econ_txns, econ_entries, econ_ubi_claims, econ_investments, econ_returns from %I', r);
      execute format('revoke all on sequence econ_txns_id_seq, econ_entries_id_seq from %I', r);
    end if;
  end loop;
end $$;

revoke execute on function econ_enrol(jsonb), econ_post(jsonb), econ_close(jsonb), econ_view(jsonb), econ_board(jsonb), econ_purge(jsonb), econ_append_only() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function econ_enrol(jsonb), econ_post(jsonb), econ_close(jsonb), econ_view(jsonb), econ_board(jsonb), econ_purge(jsonb) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function econ_enrol(jsonb), econ_post(jsonb), econ_close(jsonb), econ_view(jsonb), econ_board(jsonb), econ_purge(jsonb) to service_role;
    grant all on econ_citizens, econ_accounts, econ_txns, econ_entries, econ_ubi_claims, econ_investments, econ_returns to service_role;
    grant usage on sequence econ_txns_id_seq, econ_entries_id_seq to service_role;
  end if;
end $$;
