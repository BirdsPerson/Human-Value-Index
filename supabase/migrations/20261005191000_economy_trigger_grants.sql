-- The trigger function needs no caller: Supabase's default privileges granted anon and
-- authenticated EXECUTE on it at creation. Take that back (it is harmless, a trigger
-- function cannot be called directly, but the rule is: the browser holds nothing here).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function econ_append_only() from %I', r);
    end if;
  end loop;
end $$;
