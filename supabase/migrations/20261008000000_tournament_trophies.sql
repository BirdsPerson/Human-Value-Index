-- THE OPEN TOURNAMENTS' trophies (docs/TOURNAMENTS.md): a final placing grants a unique piece of
-- furniture, SKU f:trophy.<event>.<o|a><place>, into the winner's inventory, to be placed in the flat
-- like anything bought. It is a grant, not a sale: no CYCLES move (a txn of kind 'claim' with no
-- entries, as econ_irl_claim does), and CYCLES are never a prize (ECONOMY_PROPERTY.md section 11).
-- Idempotent per award (the idem key); one case only; a case with no wallet waits (no-wallet) and the
-- server retries. The purge takes the trophy with the citizen (econ_items cascades).
-- The slice-1 rules hold: server only, RLS on with no policies, no grants to anon / authenticated.

-- p: {idem, case_hash, sku, kind, name} -> {ok, dup, item} | {ok: false, error: no-wallet}
create or replace function econ_award(p jsonb) returns jsonb language plpgsql as $$
declare
  h text := p->>'case_hash';
  v_txn bigint;
  v_item bigint;
begin
  if h is null or h = '' or coalesce(p->>'idem', '') !~ '^award:f:trophy\.' then raise exception 'econ: an award names its case and its trophy'; end if;
  if p->>'sku' !~ '^f:trophy\.[a-z0-9-]{6,32}\.[oa][1-3]$' then raise exception 'econ: an award grants a trophy'; end if;
  if exists (select 1 from econ_txns where idem_key = p->>'idem') then return jsonb_build_object('ok', true, 'dup', true); end if;
  if not exists (select 1 from econ_citizens where case_hash = h) then return jsonb_build_object('ok', false, 'error', 'no-wallet'); end if;
  insert into econ_txns (idem_key, kind, case_hash, memo) values (p->>'idem', 'claim', h,
    jsonb_build_object('sku', p->>'sku', 'name', p->>'name', 'award', true)) returning id into v_txn;
  insert into econ_items (case_hash, sku, kind, price, txn_id) values (h, p->>'sku', 'furn', 1, v_txn) returning id into v_item;
  return jsonb_build_object('ok', true, 'dup', false, 'item', v_item);
end $$;

revoke execute on function econ_award(jsonb) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function econ_award(jsonb) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function econ_award(jsonb) to service_role;
  end if;
end $$;
