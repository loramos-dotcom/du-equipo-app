-- Read-only institutional allowlist. Ordinary authenticated/anon callers have no access.
grant select on public.du_members to supabase_auth_admin;
create policy du_member_signup_allowlist on public.du_members for select to supabase_auth_admin using (true);
create or replace function du_private.before_user_created(event jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.du_members m where lower(m.email)=lower(btrim(event#>>'{user,email}')) and m.record->>'active'='true') then
  return jsonb_build_object('error',jsonb_build_object('message','Cuenta no autorizada. Consultá con Coordinación.','http_code',403));
 end if;return '{}'::jsonb;
end;$$;
revoke all on function du_private.before_user_created(jsonb) from public,anon,authenticated;
grant execute on function du_private.before_user_created(jsonb) to supabase_auth_admin;

create function du_private.protect_legacy_workspace() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.du_state_meta where workspace_id=old.id) then raise exception 'El almacenamiento fue actualizado. Recargá antes de guardar.' using errcode='40001';end if;
 return new;
end;$$;
revoke all on function du_private.protect_legacy_workspace() from public,anon,authenticated;
create trigger du_legacy_workspace_readonly before update or delete on public.du_workspaces for each row execute function du_private.protect_legacy_workspace();
