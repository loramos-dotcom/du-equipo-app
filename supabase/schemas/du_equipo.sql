-- Declarative schema. Generate/review a migration against an isolated approved project before applying.
-- The browser talks only to the application API; no business data is exposed through the Data API.
create table public.du_workspaces (
 id text primary key,
 revision bigint not null check (revision >= 0),
 payload jsonb not null,
 constraint du_state_shape check (
  jsonb_typeof(payload) = 'object'
  and coalesce(payload->>'workspaceId' = id, false)
  and coalesce(payload->>'accessMode' = 'institutional', false)
  and coalesce((payload->>'revision')::bigint = revision, false)
  and coalesce(jsonb_typeof(payload#>'{data,members}') = 'array', false)
 )
);
alter table public.du_workspaces enable row level security;
alter table public.du_workspaces force row level security;
revoke all on public.du_workspaces from public, anon, authenticated;
grant select, insert, update on public.du_workspaces to service_role;
-- Only the Auth hook can inspect the allowlist. It cannot write application data.
grant select on public.du_workspaces to supabase_auth_admin;
create policy du_auth_allowlist_read on public.du_workspaces for select to supabase_auth_admin using (true);

create schema du_private;
revoke all on schema du_private from public, anon, authenticated;
grant usage on schema du_private to supabase_auth_admin;
create function du_private.before_user_created(event jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
 if not exists (
  select 1 from public.du_workspaces w,
  lateral jsonb_array_elements(w.payload#>'{data,members}') m
  where m->>'email' = lower(btrim(event#>>'{user,email}')) and m->>'active' = 'true'
 ) then
  return jsonb_build_object('error',jsonb_build_object('message','Cuenta no autorizada. Consultá con Coordinación.','http_code',403));
 end if;
 return '{}'::jsonb;
end;
$$;
revoke all on function du_private.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function du_private.before_user_created(jsonb) to supabase_auth_admin;
