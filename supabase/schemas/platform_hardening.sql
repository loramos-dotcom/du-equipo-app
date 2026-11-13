-- Desired privileges for the Supabase dashboard's pre-existing auto-RLS event trigger.
-- Preserve its owner and the trigger; API callers must not invoke privileged DDL helpers.
-- Applied to the hosted project on 2026-10-19 through the SQL editor, then verified.
do $hardening$
begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  if not exists (
   select 1 from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.rls_auto_enable()')
     and p.prorettype = 'event_trigger'::regtype
     and p.proowner = 'postgres'::regrole
  ) then
   raise exception 'Unexpected auto-RLS helper; review its type and owner before changing privileges';
  end if;
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
 end if;
end;
$hardening$;
