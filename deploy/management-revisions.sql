-- Lightweight change tokens: poll one protected row instead of downloading the full portfolio repeatedly.
create table public.du_management_revisions (
  id boolean primary key default true check (id),
  projects_revision bigint not null default 0,
  portfolio_revision bigint not null default 0,
  access_revision bigint not null default 0
);
insert into public.du_management_revisions(id) values (true);
alter table public.du_management_revisions enable row level security;
alter table public.du_management_revisions force row level security;
revoke all on public.du_management_revisions from public, anon, authenticated;
grant select on public.du_management_revisions to authenticated;
create policy du_revision_read on public.du_management_revisions for select to authenticated
using ((select private.is_authorized_viewer()));

-- Only trusted triggers call this private function. Source-table RLS authorizes the business mutation.
-- Definer rights are limited to updating this counter row; no business records are read or modified.
create function private.du_bump_management_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare bucket text := TG_ARGV[0];
begin
  if (select auth.uid()) is null
    and session_user not in ('postgres','supabase_admin','supabase_auth_admin')
    and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'role' is distinct from 'service_role'
  then raise exception 'Se requiere un contexto autenticado.' using errcode = '42501'; end if;
  if bucket not in ('projects','portfolio','access','all') then raise exception 'Contador inválido.'; end if;
  update public.du_management_revisions set
    projects_revision = projects_revision + case when bucket in ('projects','all') then 1 else 0 end,
    portfolio_revision = portfolio_revision + case when bucket in ('portfolio','all') then 1 else 0 end,
    access_revision = access_revision + case when bucket in ('access','all') then 1 else 0 end
  where id = true;
  return null;
end;
$$;
revoke all on function private.du_bump_management_revision() from public, anon, authenticated;

create trigger du_revision_projects after insert or update or delete on public.projects for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_project_updates after insert or update or delete on public.project_updates for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_next_steps after insert or update or delete on public.next_steps for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_next_step_owners after insert or update or delete on public.next_step_owners for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_project_areas after insert or update or delete on public.project_areas for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_attachments after insert or update or delete on public.attachments for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_dashboard_favorites after insert or update or delete on public.dashboard_favorites for each statement execute function private.du_bump_management_revision('projects');
create trigger du_revision_indicators after insert or update or delete on public.indicators for each statement execute function private.du_bump_management_revision('portfolio');
create trigger du_revision_milestones after insert or update or delete on public.milestones for each statement execute function private.du_bump_management_revision('portfolio');
create trigger du_revision_budget_execution after insert or update or delete on public.budget_execution for each statement execute function private.du_bump_management_revision('portfolio');
create trigger du_revision_special_views after insert or update or delete on public.special_views for each statement execute function private.du_bump_management_revision('portfolio');
create trigger du_revision_profiles after insert or update or delete on public.profiles for each statement execute function private.du_bump_management_revision('access');
create trigger du_revision_area_permissions after insert or update or delete on public.area_permissions for each statement execute function private.du_bump_management_revision('access');
create trigger du_revision_dashboard_permissions after insert or update or delete on public.dashboard_permissions for each statement execute function private.du_bump_management_revision('access');
create trigger du_revision_access_grants after insert or update or delete on public.access_grants for each statement execute function private.du_bump_management_revision('access');
create trigger du_revision_areas after insert or update or delete on public.areas for each statement execute function private.du_bump_management_revision('all');
