-- Credentials and selected-calendar cache are server-only, outside exported business state.
create table if not exists public.du_calendar_connections (
 workspace_id text not null,
 member_id text not null,
 email text not null,
 sealed text not null,
 selected jsonb not null default '[]'::jsonb check(jsonb_typeof(selected)='array'),
 events jsonb not null default '[]'::jsonb check(jsonb_typeof(events)='array'),
 synced_at timestamptz,
 sync_error text,
 revision uuid not null,
 primary key(workspace_id,member_id),
 foreign key(workspace_id,member_id) references public.du_members(workspace_id,id)
);
alter table public.du_calendar_connections enable row level security;
alter table public.du_calendar_connections force row level security;
revoke all on public.du_calendar_connections from public,anon,authenticated;
grant select,insert,update,delete on public.du_calendar_connections to service_role;

create or replace function public.du_save_calendar_connection(p_workspace text,p_member text,p_expected uuid,p_value jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare changed text;
begin
 if not exists(select 1 from public.du_members where workspace_id=p_workspace and id=p_member and record->>'active'='true' and lower(email)=lower(p_value->>'email')) then raise exception 'Integrante no autorizado.' using errcode='42501';end if;
 if p_expected is null then
  insert into public.du_calendar_connections(workspace_id,member_id,email,sealed,selected,events,synced_at,sync_error,revision)
  values(p_workspace,p_member,p_value->>'email',p_value->>'sealed',p_value->'selected',p_value->'events',(p_value->>'syncedAt')::timestamptz,p_value->>'syncError',(p_value->>'revision')::uuid)
  on conflict(workspace_id,member_id) do nothing returning member_id into changed;
 else
  update public.du_calendar_connections set email=p_value->>'email',sealed=p_value->>'sealed',selected=p_value->'selected',events=p_value->'events',synced_at=(p_value->>'syncedAt')::timestamptz,sync_error=p_value->>'syncError',revision=(p_value->>'revision')::uuid
  where workspace_id=p_workspace and member_id=p_member and revision=p_expected returning member_id into changed;
 end if;
 return changed is not null;
end;$$;
revoke all on function public.du_save_calendar_connection(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.du_save_calendar_connection(text,text,uuid,jsonb) to service_role;
