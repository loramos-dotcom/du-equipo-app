-- Generated from scripts/prepare-relational-schema.mjs. Review before deployment.
-- No public/browser write grants. Application server validates commands using verified Google identity.
create table public.du_state_meta (workspace_id text primary key, revision bigint not null check(revision>=0), metadata jsonb not null, migrated_at timestamptz not null default now());
create table public.du_project_refs (workspace_id text not null references public.du_state_meta(workspace_id), id text not null, source text not null check(source in ('du','gestion')), source_id text, primary key(workspace_id,id), check ((source='du' and source_id is null) or (source='gestion' and id='gestion:'||source_id)));
create table public.du_members (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 email text generated always as (nullif(record->>'email','')) stored,
 auth_user_id text generated always as (nullif(record->>'authUserId','')) stored,
 reports_to text generated always as (nullif(record->>'reportsTo','')) stored,
 primary key(workspace_id,id)
);
create index du_members_updated on public.du_members(workspace_id,updated_at desc,id);
create index du_members_reports_to_idx on public.du_members(workspace_id,reports_to);
create table public.du_areas (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 lead_id text generated always as (nullif(record->>'leadId','')) stored,
 parent_id text generated always as (nullif(record->>'parentId','')) stored,
 primary key(workspace_id,id)
);
create index du_areas_updated on public.du_areas(workspace_id,updated_at desc,id);
create index du_areas_lead_id_idx on public.du_areas(workspace_id,lead_id);
create index du_areas_parent_id_idx on public.du_areas(workspace_id,parent_id);
create table public.du_projects (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 lead_id text generated always as (nullif(record->>'leadId','')) stored,
 area_id text generated always as (nullif(record->>'areaId','')) stored,
 primary key(workspace_id,id)
);
create index du_projects_updated on public.du_projects(workspace_id,updated_at desc,id);
create index du_projects_lead_id_idx on public.du_projects(workspace_id,lead_id);
create index du_projects_area_id_idx on public.du_projects(workspace_id,area_id);
create table public.du_milestones (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 project_id text generated always as (nullif(record->>'projectId','')) stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 area_id text generated always as (nullif(record->>'areaId','')) stored,
 primary key(workspace_id,id)
);
create index du_milestones_updated on public.du_milestones(workspace_id,updated_at desc,id);
create index du_milestones_project_id_idx on public.du_milestones(workspace_id,project_id);
create index du_milestones_owner_id_idx on public.du_milestones(workspace_id,owner_id);
create index du_milestones_area_id_idx on public.du_milestones(workspace_id,area_id);
create table public.du_tasks (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 project_id text generated always as (nullif(record->>'projectId','')) stored,
 milestone_id text generated always as (nullif(record->>'milestoneId','')) stored,
 recurrence_id text generated always as (nullif(record->>'recurrenceId','')) stored,
 due_date text generated always as (nullif(record->>'dueDate','')) stored,
 status text generated always as (nullif(record->>'status','')) stored,
 primary key(workspace_id,id)
);
create index du_tasks_updated on public.du_tasks(workspace_id,updated_at desc,id);
create index du_tasks_owner_id_idx on public.du_tasks(workspace_id,owner_id);
create index du_tasks_project_id_idx on public.du_tasks(workspace_id,project_id);
create index du_tasks_milestone_id_idx on public.du_tasks(workspace_id,milestone_id);
create index du_tasks_recurrence_id_idx on public.du_tasks(workspace_id,recurrence_id);
create table public.du_weeks (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 primary key(workspace_id,id)
);
create index du_weeks_updated on public.du_weeks(workspace_id,updated_at desc,id);
create table public.du_plans (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 week_id text generated always as (nullif(record->>'weekId','')) stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 primary key(workspace_id,id)
);
create index du_plans_updated on public.du_plans(workspace_id,updated_at desc,id);
create index du_plans_week_id_idx on public.du_plans(workspace_id,week_id);
create index du_plans_owner_id_idx on public.du_plans(workspace_id,owner_id);
create table public.du_commitments (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 task_id text generated always as (nullif(record->>'taskId','')) stored,
 week_id text generated always as (nullif(record->>'weekId','')) stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 primary key(workspace_id,id)
);
create index du_commitments_updated on public.du_commitments(workspace_id,updated_at desc,id);
create index du_commitments_task_id_idx on public.du_commitments(workspace_id,task_id);
create index du_commitments_week_id_idx on public.du_commitments(workspace_id,week_id);
create index du_commitments_owner_id_idx on public.du_commitments(workspace_id,owner_id);
create table public.du_issues (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 task_id text generated always as (nullif(record->>'taskId','')) stored,
 project_id text generated always as (nullif(record->>'projectId','')) stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 status text generated always as (nullif(record->>'status','')) stored,
 primary key(workspace_id,id)
);
create index du_issues_updated on public.du_issues(workspace_id,updated_at desc,id);
create index du_issues_task_id_idx on public.du_issues(workspace_id,task_id);
create index du_issues_project_id_idx on public.du_issues(workspace_id,project_id);
create index du_issues_owner_id_idx on public.du_issues(workspace_id,owner_id);
create table public.du_interventions (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 issue_id text generated always as (nullif(record->>'issueId','')) stored,
 taken_by text generated always as (nullif(record->>'takenBy','')) stored,
 status text generated always as (nullif(record->>'status','')) stored,
 primary key(workspace_id,id)
);
create index du_interventions_updated on public.du_interventions(workspace_id,updated_at desc,id);
create index du_interventions_issue_id_idx on public.du_interventions(workspace_id,issue_id);
create index du_interventions_taken_by_idx on public.du_interventions(workspace_id,taken_by);
create table public.du_meetings (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 week_id text generated always as (nullif(record->>'weekId','')) stored,
 planning_week_id text generated always as (nullif(record->>'planningWeekId','')) stored,
 status text generated always as (nullif(record->>'status','')) stored,
 primary key(workspace_id,id)
);
create index du_meetings_updated on public.du_meetings(workspace_id,updated_at desc,id);
create index du_meetings_week_id_idx on public.du_meetings(workspace_id,week_id);
create index du_meetings_planning_week_id_idx on public.du_meetings(workspace_id,planning_week_id);
create table public.du_agenda (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 meeting_id text generated always as (nullif(record->>'meetingId','')) stored,
 primary key(workspace_id,id)
);
create index du_agenda_updated on public.du_agenda(workspace_id,updated_at desc,id);
create index du_agenda_meeting_id_idx on public.du_agenda(workspace_id,meeting_id);
create table public.du_decisions (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 meeting_id text generated always as (nullif(record->>'meetingId','')) stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 task_id text generated always as (nullif(record->>'taskId','')) stored,
 commitment_id text generated always as (nullif(record->>'commitmentId','')) stored,
 primary key(workspace_id,id)
);
create index du_decisions_updated on public.du_decisions(workspace_id,updated_at desc,id);
create index du_decisions_meeting_id_idx on public.du_decisions(workspace_id,meeting_id);
create index du_decisions_owner_id_idx on public.du_decisions(workspace_id,owner_id);
create index du_decisions_task_id_idx on public.du_decisions(workspace_id,task_id);
create index du_decisions_commitment_id_idx on public.du_decisions(workspace_id,commitment_id);
create table public.du_recurrences (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 project_id text generated always as (nullif(record->>'projectId','')) stored,
 primary key(workspace_id,id)
);
create index du_recurrences_updated on public.du_recurrences(workspace_id,updated_at desc,id);
create index du_recurrences_owner_id_idx on public.du_recurrences(workspace_id,owner_id);
create index du_recurrences_project_id_idx on public.du_recurrences(workspace_id,project_id);
create table public.du_comments (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 author_id text generated always as (nullif(record->>'authorId','')) stored,
 target_type text generated always as (nullif(record->>'targetType','')) stored,
 target_id text generated always as (nullif(record->>'targetId','')) stored,
 primary key(workspace_id,id)
);
create index du_comments_updated on public.du_comments(workspace_id,updated_at desc,id);
create index du_comments_author_id_idx on public.du_comments(workspace_id,author_id);
create table public.du_links (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 target_type text generated always as (nullif(record->>'targetType','')) stored,
 target_id text generated always as (nullif(record->>'targetId','')) stored,
 primary key(workspace_id,id)
);
create index du_links_updated on public.du_links(workspace_id,updated_at desc,id);
create table public.du_catalogs (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 primary key(workspace_id,id)
);
create index du_catalogs_updated on public.du_catalogs(workspace_id,updated_at desc,id);
create table public.du_filters (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 scope text generated always as (nullif(record->>'scope','')) stored,
 primary key(workspace_id,id)
);
create index du_filters_updated on public.du_filters(workspace_id,updated_at desc,id);
create index du_filters_owner_id_idx on public.du_filters(workspace_id,owner_id);
create table public.du_notifications (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 notice_key text generated always as (nullif(record->>'key','')) stored,
 primary key(workspace_id,id)
);
create index du_notifications_updated on public.du_notifications(workspace_id,updated_at desc,id);
create index du_notifications_owner_id_idx on public.du_notifications(workspace_id,owner_id);
create table public.du_project_links (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 source_id text generated always as (nullif(record->>'sourceId','')) stored,
 lead_id text generated always as (nullif(record->>'leadId','')) stored,
 area_id text generated always as (nullif(record->>'areaId','')) stored,
 primary key(workspace_id,id)
);
create index du_project_links_updated on public.du_project_links(workspace_id,updated_at desc,id);
create index du_project_links_lead_id_idx on public.du_project_links(workspace_id,lead_id);
create index du_project_links_area_id_idx on public.du_project_links(workspace_id,area_id);
create table public.du_area_contacts (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 area_id text generated always as (nullif(record->>'areaId','')) stored,
 primary key(workspace_id,id)
);
create index du_area_contacts_updated on public.du_area_contacts(workspace_id,updated_at desc,id);
create index du_area_contacts_area_id_idx on public.du_area_contacts(workspace_id,area_id);
create table public.du_area_assignments (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 area_id text generated always as (nullif(record->>'areaId','')) stored,
 member_id text generated always as (nullif(record->>'memberId','')) stored,
 assignment_role text generated always as (nullif(record->>'assignmentRole','')) stored,
 valid_from text generated always as (nullif(record->>'validFrom','')) stored,
 valid_to text generated always as (nullif(record->>'validTo','')) stored,
 primary key(workspace_id,id)
);
create index du_area_assignments_updated on public.du_area_assignments(workspace_id,updated_at desc,id);
create index du_area_assignments_area_id_idx on public.du_area_assignments(workspace_id,area_id);
create index du_area_assignments_member_id_idx on public.du_area_assignments(workspace_id,member_id);
create table public.du_preferences (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 owner_id text generated always as (nullif(record->>'ownerId','')) stored,
 preference_key text generated always as (nullif(record->>'key','')) stored,
 primary key(workspace_id,id)
);
create index du_preferences_updated on public.du_preferences(workspace_id,updated_at desc,id);
create index du_preferences_owner_id_idx on public.du_preferences(workspace_id,owner_id);
create table public.du_job_runs (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 primary key(workspace_id,id)
);
create index du_job_runs_updated on public.du_job_runs(workspace_id,updated_at desc,id);
create table public.du_pilot_runs (
 workspace_id text not null references public.du_state_meta(workspace_id),
 id text not null,
 record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),
 version bigint generated always as ((record->>'version')::bigint) stored,
 updated_at text generated always as (record->>'updatedAt') stored,
 primary key(workspace_id,id)
);
create index du_pilot_runs_updated on public.du_pilot_runs(workspace_id,updated_at desc,id);
alter table public.du_members add constraint du_members_reports_to_fk foreign key(workspace_id,reports_to) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_areas add constraint du_areas_lead_id_fk foreign key(workspace_id,lead_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_areas add constraint du_areas_parent_id_fk foreign key(workspace_id,parent_id) references public.du_areas(workspace_id,id) deferrable initially deferred;
alter table public.du_projects add constraint du_projects_lead_id_fk foreign key(workspace_id,lead_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_projects add constraint du_projects_area_id_fk foreign key(workspace_id,area_id) references public.du_areas(workspace_id,id) deferrable initially deferred;
alter table public.du_milestones add constraint du_milestones_project_id_fk foreign key(workspace_id,project_id) references public.du_project_refs(workspace_id,id) deferrable initially deferred;
alter table public.du_milestones add constraint du_milestones_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_milestones add constraint du_milestones_area_id_fk foreign key(workspace_id,area_id) references public.du_areas(workspace_id,id) deferrable initially deferred;
alter table public.du_tasks add constraint du_tasks_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_tasks add constraint du_tasks_project_id_fk foreign key(workspace_id,project_id) references public.du_project_refs(workspace_id,id) deferrable initially deferred;
alter table public.du_tasks add constraint du_tasks_milestone_id_fk foreign key(workspace_id,milestone_id) references public.du_milestones(workspace_id,id) deferrable initially deferred;
alter table public.du_tasks add constraint du_tasks_recurrence_id_fk foreign key(workspace_id,recurrence_id) references public.du_recurrences(workspace_id,id) deferrable initially deferred;
alter table public.du_plans add constraint du_plans_week_id_fk foreign key(workspace_id,week_id) references public.du_weeks(workspace_id,id) deferrable initially deferred;
alter table public.du_plans add constraint du_plans_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_commitments add constraint du_commitments_task_id_fk foreign key(workspace_id,task_id) references public.du_tasks(workspace_id,id) deferrable initially deferred;
alter table public.du_commitments add constraint du_commitments_week_id_fk foreign key(workspace_id,week_id) references public.du_weeks(workspace_id,id) deferrable initially deferred;
alter table public.du_commitments add constraint du_commitments_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_issues add constraint du_issues_task_id_fk foreign key(workspace_id,task_id) references public.du_tasks(workspace_id,id) deferrable initially deferred;
alter table public.du_issues add constraint du_issues_project_id_fk foreign key(workspace_id,project_id) references public.du_project_refs(workspace_id,id) deferrable initially deferred;
alter table public.du_issues add constraint du_issues_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_interventions add constraint du_interventions_issue_id_fk foreign key(workspace_id,issue_id) references public.du_issues(workspace_id,id) deferrable initially deferred;
alter table public.du_interventions add constraint du_interventions_taken_by_fk foreign key(workspace_id,taken_by) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_meetings add constraint du_meetings_week_id_fk foreign key(workspace_id,week_id) references public.du_weeks(workspace_id,id) deferrable initially deferred;
alter table public.du_meetings add constraint du_meetings_planning_week_id_fk foreign key(workspace_id,planning_week_id) references public.du_weeks(workspace_id,id) deferrable initially deferred;
alter table public.du_agenda add constraint du_agenda_meeting_id_fk foreign key(workspace_id,meeting_id) references public.du_meetings(workspace_id,id) deferrable initially deferred;
alter table public.du_decisions add constraint du_decisions_meeting_id_fk foreign key(workspace_id,meeting_id) references public.du_meetings(workspace_id,id) deferrable initially deferred;
alter table public.du_decisions add constraint du_decisions_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_decisions add constraint du_decisions_task_id_fk foreign key(workspace_id,task_id) references public.du_tasks(workspace_id,id) deferrable initially deferred;
alter table public.du_decisions add constraint du_decisions_commitment_id_fk foreign key(workspace_id,commitment_id) references public.du_commitments(workspace_id,id) deferrable initially deferred;
alter table public.du_recurrences add constraint du_recurrences_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_recurrences add constraint du_recurrences_project_id_fk foreign key(workspace_id,project_id) references public.du_project_refs(workspace_id,id) deferrable initially deferred;
alter table public.du_comments add constraint du_comments_author_id_fk foreign key(workspace_id,author_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_filters add constraint du_filters_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_notifications add constraint du_notifications_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_project_links add constraint du_project_links_lead_id_fk foreign key(workspace_id,lead_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_project_links add constraint du_project_links_area_id_fk foreign key(workspace_id,area_id) references public.du_areas(workspace_id,id) deferrable initially deferred;
alter table public.du_area_contacts add constraint du_area_contacts_area_id_fk foreign key(workspace_id,area_id) references public.du_areas(workspace_id,id) deferrable initially deferred;
alter table public.du_area_assignments add constraint du_area_assignments_area_id_fk foreign key(workspace_id,area_id) references public.du_areas(workspace_id,id) deferrable initially deferred;
alter table public.du_area_assignments add constraint du_area_assignments_member_id_fk foreign key(workspace_id,member_id) references public.du_members(workspace_id,id) deferrable initially deferred;
alter table public.du_preferences add constraint du_preferences_owner_id_fk foreign key(workspace_id,owner_id) references public.du_members(workspace_id,id) deferrable initially deferred;
create unique index du_members_email_unique on public.du_members(workspace_id,lower(email));
create unique index du_members_auth_unique on public.du_members(workspace_id,auth_user_id) where auth_user_id is not null;
create unique index du_plans_owner_week on public.du_plans(workspace_id,week_id,owner_id);
create unique index du_commitments_task_week on public.du_commitments(workspace_id,task_id,week_id);
create unique index du_project_links_source on public.du_project_links(workspace_id,source_id);
create unique index du_preferences_owner_key on public.du_preferences(workspace_id,owner_id,preference_key);
create index du_tasks_owner_status_due on public.du_tasks(workspace_id,owner_id,status,due_date,id);
create index du_tasks_project_status on public.du_tasks(workspace_id,project_id,status,id);
create index du_comments_target on public.du_comments(workspace_id,target_type,target_id,id);
create table public.du_audit (workspace_id text not null references public.du_state_meta(workspace_id),id text not null,event_sequence bigint generated always as identity,record jsonb not null,search_document tsvector generated always as (to_tsvector('simple',record::text)) stored,at text generated always as (record->>'at') stored,actor_id text generated always as(record->>'actorId') stored,entity text generated always as(record->>'entity') stored,entity_id text generated always as(record->>'entityId') stored,action text generated always as(record->>'action') stored,primary key(workspace_id,id));
create index du_audit_search on public.du_audit using gin(search_document);
create index du_audit_sequence on public.du_audit(workspace_id,event_sequence);
create index du_audit_time on public.du_audit(workspace_id,at desc,id);
create index du_audit_actor on public.du_audit(workspace_id,actor_id,at desc,id);
create index du_audit_entity on public.du_audit(workspace_id,entity,entity_id,at desc,id);
create table public.du_snapshots (workspace_id text not null references public.du_state_meta(workspace_id),id text not null,record jsonb not null,kind text generated always as(record->>'kind') stored,target_id text generated always as(record->>'targetId') stored,version bigint generated always as((record->>'version')::bigint) stored,primary key(workspace_id,id),unique(workspace_id,kind,target_id,version));
create table public.du_receipts (workspace_id text not null references public.du_state_meta(workspace_id),id text not null,record jsonb not null,primary key(workspace_id,id));
create table public.du_job_leases (workspace_id text not null references public.du_state_meta(workspace_id),id text not null,owner_token uuid not null,expires_at timestamptz not null,primary key(workspace_id,id));
create table public.du_backup_credentials (workspace_id text primary key references public.du_state_meta(workspace_id),sealed text not null,email text not null,updated_at timestamptz not null default now(),last_backup jsonb);
alter table public.du_state_meta enable row level security;
alter table public.du_state_meta force row level security;
revoke all on public.du_state_meta from public,anon,authenticated;
grant select,insert,update,delete on public.du_state_meta to service_role;
alter table public.du_project_refs enable row level security;
alter table public.du_project_refs force row level security;
revoke all on public.du_project_refs from public,anon,authenticated;
grant select,insert,update,delete on public.du_project_refs to service_role;
alter table public.du_members enable row level security;
alter table public.du_members force row level security;
revoke all on public.du_members from public,anon,authenticated;
grant select,insert,update,delete on public.du_members to service_role;
alter table public.du_areas enable row level security;
alter table public.du_areas force row level security;
revoke all on public.du_areas from public,anon,authenticated;
grant select,insert,update,delete on public.du_areas to service_role;
alter table public.du_projects enable row level security;
alter table public.du_projects force row level security;
revoke all on public.du_projects from public,anon,authenticated;
grant select,insert,update,delete on public.du_projects to service_role;
alter table public.du_milestones enable row level security;
alter table public.du_milestones force row level security;
revoke all on public.du_milestones from public,anon,authenticated;
grant select,insert,update,delete on public.du_milestones to service_role;
alter table public.du_tasks enable row level security;
alter table public.du_tasks force row level security;
revoke all on public.du_tasks from public,anon,authenticated;
grant select,insert,update,delete on public.du_tasks to service_role;
alter table public.du_weeks enable row level security;
alter table public.du_weeks force row level security;
revoke all on public.du_weeks from public,anon,authenticated;
grant select,insert,update,delete on public.du_weeks to service_role;
alter table public.du_plans enable row level security;
alter table public.du_plans force row level security;
revoke all on public.du_plans from public,anon,authenticated;
grant select,insert,update,delete on public.du_plans to service_role;
alter table public.du_commitments enable row level security;
alter table public.du_commitments force row level security;
revoke all on public.du_commitments from public,anon,authenticated;
grant select,insert,update,delete on public.du_commitments to service_role;
alter table public.du_issues enable row level security;
alter table public.du_issues force row level security;
revoke all on public.du_issues from public,anon,authenticated;
grant select,insert,update,delete on public.du_issues to service_role;
alter table public.du_interventions enable row level security;
alter table public.du_interventions force row level security;
revoke all on public.du_interventions from public,anon,authenticated;
grant select,insert,update,delete on public.du_interventions to service_role;
alter table public.du_meetings enable row level security;
alter table public.du_meetings force row level security;
revoke all on public.du_meetings from public,anon,authenticated;
grant select,insert,update,delete on public.du_meetings to service_role;
alter table public.du_agenda enable row level security;
alter table public.du_agenda force row level security;
revoke all on public.du_agenda from public,anon,authenticated;
grant select,insert,update,delete on public.du_agenda to service_role;
alter table public.du_decisions enable row level security;
alter table public.du_decisions force row level security;
revoke all on public.du_decisions from public,anon,authenticated;
grant select,insert,update,delete on public.du_decisions to service_role;
alter table public.du_recurrences enable row level security;
alter table public.du_recurrences force row level security;
revoke all on public.du_recurrences from public,anon,authenticated;
grant select,insert,update,delete on public.du_recurrences to service_role;
alter table public.du_comments enable row level security;
alter table public.du_comments force row level security;
revoke all on public.du_comments from public,anon,authenticated;
grant select,insert,update,delete on public.du_comments to service_role;
alter table public.du_links enable row level security;
alter table public.du_links force row level security;
revoke all on public.du_links from public,anon,authenticated;
grant select,insert,update,delete on public.du_links to service_role;
alter table public.du_catalogs enable row level security;
alter table public.du_catalogs force row level security;
revoke all on public.du_catalogs from public,anon,authenticated;
grant select,insert,update,delete on public.du_catalogs to service_role;
alter table public.du_filters enable row level security;
alter table public.du_filters force row level security;
revoke all on public.du_filters from public,anon,authenticated;
grant select,insert,update,delete on public.du_filters to service_role;
alter table public.du_notifications enable row level security;
alter table public.du_notifications force row level security;
revoke all on public.du_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.du_notifications to service_role;
alter table public.du_project_links enable row level security;
alter table public.du_project_links force row level security;
revoke all on public.du_project_links from public,anon,authenticated;
grant select,insert,update,delete on public.du_project_links to service_role;
alter table public.du_area_contacts enable row level security;
alter table public.du_area_contacts force row level security;
revoke all on public.du_area_contacts from public,anon,authenticated;
grant select,insert,update,delete on public.du_area_contacts to service_role;
alter table public.du_area_assignments enable row level security;
alter table public.du_area_assignments force row level security;
revoke all on public.du_area_assignments from public,anon,authenticated;
grant select,insert,update,delete on public.du_area_assignments to service_role;
alter table public.du_preferences enable row level security;
alter table public.du_preferences force row level security;
revoke all on public.du_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.du_preferences to service_role;
alter table public.du_job_runs enable row level security;
alter table public.du_job_runs force row level security;
revoke all on public.du_job_runs from public,anon,authenticated;
grant select,insert,update,delete on public.du_job_runs to service_role;
alter table public.du_pilot_runs enable row level security;
alter table public.du_pilot_runs force row level security;
revoke all on public.du_pilot_runs from public,anon,authenticated;
grant select,insert,update,delete on public.du_pilot_runs to service_role;
alter table public.du_audit enable row level security;
alter table public.du_audit force row level security;
revoke all on public.du_audit from public,anon,authenticated;
grant select,insert on public.du_audit to service_role;
alter table public.du_snapshots enable row level security;
alter table public.du_snapshots force row level security;
revoke all on public.du_snapshots from public,anon,authenticated;
grant select,insert on public.du_snapshots to service_role;
alter table public.du_receipts enable row level security;
alter table public.du_receipts force row level security;
revoke all on public.du_receipts from public,anon,authenticated;
grant select,insert on public.du_receipts to service_role;
alter table public.du_job_leases enable row level security;
alter table public.du_job_leases force row level security;
revoke all on public.du_job_leases from public,anon,authenticated;
grant select,insert,update,delete on public.du_job_leases to service_role;
alter table public.du_backup_credentials enable row level security;
alter table public.du_backup_credentials force row level security;
revoke all on public.du_backup_credentials from public,anon,authenticated;
grant select,insert,update,delete on public.du_backup_credentials to service_role;
grant usage,select on sequence public.du_audit_event_sequence_seq to service_role;

create function public.du_read_state(p_workspace text,p_history boolean default true,p_receipts text[] default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m public.du_state_meta; pair record; data jsonb:='{}'; rows jsonb; audits jsonb; snapshots jsonb; receipts jsonb;
begin
 select * into m from public.du_state_meta where workspace_id=p_workspace;if not found then return null;end if;
 for pair in select * from jsonb_each_text('{"members":"members","areas":"areas","projects":"projects","milestones":"milestones","tasks":"tasks","weeks":"weeks","plans":"plans","commitments":"commitments","issues":"issues","interventions":"interventions","meetings":"meetings","agenda":"agenda","decisions":"decisions","recurrences":"recurrences","comments":"comments","links":"links","catalogs":"catalogs","filters":"filters","notifications":"notifications","projectLinks":"project_links","areaContacts":"area_contacts","areaAssignments":"area_assignments","preferences":"preferences","jobRuns":"job_runs","pilotRuns":"pilot_runs"}'::jsonb) loop
  execute format('select coalesce(jsonb_agg(record order by id),''[]''::jsonb) from public.%I where workspace_id=$1','du_'||pair.value) into rows using p_workspace;data:=jsonb_set(data,array[pair.key],rows);
 end loop;
 select coalesce(jsonb_agg(record order by event_sequence),'[]'::jsonb) into audits from public.du_audit where workspace_id=p_workspace and p_history;
 select coalesce(jsonb_agg(record order by kind,target_id,version),'[]'::jsonb) into snapshots from public.du_snapshots where workspace_id=p_workspace;
 select coalesce(jsonb_object_agg(id,record),'{}'::jsonb) into receipts from public.du_receipts where workspace_id=p_workspace and (p_receipts is null or id=any(p_receipts));
 return m.metadata||jsonb_build_object('workspaceId',p_workspace,'revision',m.revision,'data',data,'audit',audits,'snapshots',snapshots,'receipts',receipts);
end;$$;
revoke all on function public.du_read_state(text,boolean,text[]) from public,anon,authenticated;grant execute on function public.du_read_state(text,boolean,text[]) to service_role;

create function public.du_commit_state(p_workspace text,p_revision bigint,p_next bigint,p_metadata jsonb,p_changes jsonb,p_audit jsonb,p_snapshots jsonb,p_receipts jsonb,p_refs jsonb,p_actor text) returns boolean language plpgsql security invoker set search_path='' as $$
declare pair record; item jsonb; table_name text; existing jsonb; actor jsonb;
begin
 perform 1 from public.du_state_meta where workspace_id=p_workspace and revision=p_revision for update;if not found then return false;end if;
 if p_next<=p_revision then raise exception 'Invalid revision';end if;
 if p_actor<>'system:daily' then select record into actor from public.du_members where workspace_id=p_workspace and id=p_actor;if actor is null or actor->>'active'<>'true' then raise exception 'Inactive actor' using errcode='42501';end if;end if;
 for item in select value from jsonb_array_elements(p_refs) loop insert into public.du_project_refs(workspace_id,id,source,source_id) values(p_workspace,item->>'id',item->>'source',item->>'sourceId') on conflict(workspace_id,id) do nothing;end loop;
 for pair in select * from jsonb_each(p_changes) loop
  table_name:='{"members":"members","areas":"areas","projects":"projects","milestones":"milestones","tasks":"tasks","weeks":"weeks","plans":"plans","commitments":"commitments","issues":"issues","interventions":"interventions","meetings":"meetings","agenda":"agenda","decisions":"decisions","recurrences":"recurrences","comments":"comments","links":"links","catalogs":"catalogs","filters":"filters","notifications":"notifications","projectLinks":"project_links","areaContacts":"area_contacts","areaAssignments":"area_assignments","preferences":"preferences","jobRuns":"job_runs","pilotRuns":"pilot_runs"}'::jsonb->>pair.key;if table_name is null then raise exception 'Invalid entity';end if;
  for item in select value from jsonb_array_elements(pair.value) loop
   execute format('select record from public.%I where workspace_id=$1 and id=$2','du_'||table_name) into existing using p_workspace,item->>'id';
   if (existing is null and item->>'expectedVersion' is not null) or (existing is not null and (existing->>'version')::bigint is distinct from (item->>'expectedVersion')::bigint) then raise exception 'Stale record' using errcode='40001';end if;
   if item->'record'='null'::jsonb then execute format('delete from public.%I where workspace_id=$1 and id=$2','du_'||table_name) using p_workspace,item->>'id';
   else execute format('insert into public.%I(workspace_id,id,record) values($1,$2,$3) on conflict(workspace_id,id) do update set record=excluded.record','du_'||table_name) using p_workspace,item->>'id',item->'record';end if;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(p_audit) loop insert into public.du_audit(workspace_id,id,record) values(p_workspace,item->>'id',item);end loop;
 for item in select value from jsonb_array_elements(p_snapshots) loop insert into public.du_snapshots(workspace_id,id,record) values(p_workspace,item->>'id',item);end loop;
 for pair in select * from jsonb_each(p_receipts) loop insert into public.du_receipts(workspace_id,id,record) values(p_workspace,pair.key,pair.value) on conflict(workspace_id,id) do nothing;end loop;
 update public.du_state_meta set revision=p_next,metadata=p_metadata where workspace_id=p_workspace;return true;
end;$$;
revoke all on function public.du_commit_state(text,bigint,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public,anon,authenticated;grant execute on function public.du_commit_state(text,bigint,bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) to service_role;

create function public.du_claim_job(p_workspace text,p_id text,p_token uuid,p_seconds integer default 120) returns boolean language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 insert into public.du_job_leases(workspace_id,id,owner_token,expires_at) values(p_workspace,p_id,p_token,now()+make_interval(secs=>least(greatest(p_seconds,30),300))) on conflict(workspace_id,id) do update set owner_token=excluded.owner_token,expires_at=excluded.expires_at where public.du_job_leases.expires_at<now() returning id into claimed;return claimed is not null;
end;$$;
revoke all on function public.du_claim_job(text,text,uuid,integer) from public,anon,authenticated;grant execute on function public.du_claim_job(text,text,uuid,integer) to service_role;

do $$
declare w record; pair record; item jsonb; state jsonb; metadata jsonb; codes integer; occurrences jsonb;
begin
 for w in select * from public.du_workspaces for update loop
  state:=w.payload;metadata:=state-'data'-'audit'-'snapshots'-'receipts'-'externalProjects'-'trash'-'revision';
  select greatest(100,coalesce(max(substring(t->>'code' from 2)::integer),100)) into codes from (select value t from jsonb_array_elements(state#>'{data,tasks}') union all select value->'before' from jsonb_array_elements(state->'audit') where value->>'entity'='tasks' and value->>'action'='eliminar definitivamente') q where t->>'code'~'^T[0-9]+$';
  select coalesce(jsonb_agg(distinct jsonb_build_object('recurrenceId',value#>>'{before,recurrenceId}','occurrenceDate',value#>>'{before,occurrenceDate}')),'[]'::jsonb) into occurrences from jsonb_array_elements(state->'audit') where value->>'entity'='tasks' and value->>'action'='eliminar definitivamente' and value#>>'{before,recurrenceId}' is not null;
  metadata:=metadata||jsonb_build_object('ledger',jsonb_build_object('maxTaskCode',codes,'purgedOccurrences',occurrences));
  insert into public.du_state_meta(workspace_id,revision,metadata) values(w.id,w.revision,metadata);
  for item in select value from jsonb_array_elements(state#>'{data,projects}') loop insert into public.du_project_refs(workspace_id,id,source) values(w.id,item->>'id','du') on conflict do nothing;end loop;
  for item in select value from jsonb_array_elements(coalesce(state#>'{data,projectLinks}','[]')) loop insert into public.du_project_refs(workspace_id,id,source,source_id) values(w.id,'gestion:'||(item->>'sourceId'),'gestion',item->>'sourceId') on conflict do nothing;end loop;
  for pair in select * from jsonb_each_text('{"members":"members","areas":"areas","projects":"projects","milestones":"milestones","tasks":"tasks","weeks":"weeks","plans":"plans","commitments":"commitments","issues":"issues","interventions":"interventions","meetings":"meetings","agenda":"agenda","decisions":"decisions","recurrences":"recurrences","comments":"comments","links":"links","catalogs":"catalogs","filters":"filters","notifications":"notifications","projectLinks":"project_links","areaContacts":"area_contacts","areaAssignments":"area_assignments","preferences":"preferences","jobRuns":"job_runs","pilotRuns":"pilot_runs"}'::jsonb) loop
   for item in select value from jsonb_array_elements(coalesce(state#>array['data',pair.key],'[]')) loop
    if item->>'projectId' like 'gestion:%' then insert into public.du_project_refs(workspace_id,id,source,source_id) values(w.id,item->>'projectId','gestion',substring(item->>'projectId' from 9)) on conflict do nothing;end if;
    execute format('insert into public.%I(workspace_id,id,record) values($1,$2,$3)','du_'||pair.value) using w.id,item->>'id',item;
   end loop;
  end loop;
  for item in select value from jsonb_array_elements(state->'audit') loop insert into public.du_audit(workspace_id,id,record) values(w.id,item->>'id',item);end loop;
  for item in select value from jsonb_array_elements(state->'snapshots') loop insert into public.du_snapshots(workspace_id,id,record) values(w.id,item->>'id',item);end loop;
  for pair in select * from jsonb_each(state->'receipts') loop insert into public.du_receipts(workspace_id,id,record) values(w.id,pair.key,pair.value);end loop;
 end loop;
end;$$;
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
create function public.du_fold(value text) returns text language sql immutable strict security invoker set search_path='' as $$select translate(lower(value),'áéíóúüñ','aeiouun')$$;
revoke all on function public.du_fold(text) from public,anon,authenticated;grant execute on function public.du_fold(text) to service_role;
create function public.du_list_records(p_workspace text,p_entity text,p_filters jsonb,p_today text,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare table_name text; result jsonb;
begin
 table_name:=case p_entity when 'tasks' then 'du_tasks' when 'projects' then 'du_projects' when 'issues' then 'du_issues' else null end;
 if table_name is null or p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid page' using errcode='22023';end if;
 execute format($query$
 with matching as materialized(
 select record,id,updated_at from public.%I
 where workspace_id=$1 and not(record?'deletedAt')
 and (coalesce(($2->>'archived')::boolean,false) or not coalesce((record->>'archived')::boolean,false))
 and (coalesce($2->>'q','')='' or public.du_fold(coalesce(record->>'title','')||' '||coalesce(record->>'outcome','')||' '||coalesce(record->>'description','')||' '||coalesce(record->>'code','')) like '%%'||public.du_fold($2->>'q')||'%%')
 and (coalesce($2->>'owner','')='' or case when $3='projects' then record->>'leadId' else record->>'ownerId' end=$2->>'owner')
 and (coalesce($2->>'status',$2->>'state','')='' or case when coalesce($2->>'status',$2->>'state')='open' then record->>'status' not in ('Terminada','Cancelada','Resuelta','Descartada','Finalizado') else record->>'status'=coalesce($2->>'status',$2->>'state') end)
 and (not coalesce(($2->>'independent')::boolean,false) or nullif(record->>'projectId','') is null)
 and (coalesce($2->>'due','')='' or record->>'status' not in ('Terminada','Cancelada') and nullif(record->>'dueDate','') is not null and case when $2->>'due'='soon' then record->>'dueDate'<=($4::date+coalesce((select (metadata#>>'{settings,dueDays}')::integer from public.du_state_meta where workspace_id=$1),3))::text else record->>'dueDate'<$4 end)
 and (coalesce($2->>'area','')='' or record->'areaIds'?($2->>'area'))
 and (coalesce($2->>'delivery','')='' or record->>'delivery'=$2->>'delivery')
 and (coalesce($2->>'priority','')='' or coalesce((record->>'duPriority')::boolean,false))
 and (coalesce($2->>'kind','')='' or record->>'kind'=$2->>'kind')
 and (coalesce($2->>'scope','')='' or record->>'scope'=$2->>'scope')
 and (coalesce($2->>'policy','')='' or record->>'policyId'=$2->>'policy')
 and (coalesce($2->>'preset','')='' or case when $2->>'preset'='stale' then record->>'status' in ('Activo','En preparación','Pausado') and (nullif(record->>'reviewedAt','') is null or record->>'reviewedAt'<=($4::date-coalesce((select (metadata#>>'{settings,staleDays}')::integer from public.du_state_meta where workspace_id=$1),7))::text) else coalesce((record->>'duPriority')::boolean,false) end)
 ), page as(
 select record from matching order by case when $2->>'sort'='title' then record->>'title' when $2->>'sort'='due' then coalesce(nullif(record->>'dueDate',''),'9999') end asc,updated_at desc nulls last,id asc limit $5 offset $6)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(record),'[]')from page),'total',(select count(*)from matching))
 $query$,table_name) into result using p_workspace,p_filters,p_entity,p_today,p_limit,p_offset;
 return result;
end;$$;
revoke all on function public.du_list_records(text,text,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.du_list_records(text,text,jsonb,text,integer,integer) to service_role;
-- Small edits use current row versions and recheck permissions in the same short transaction.
-- Workflow changes still use the full domain transaction and workspace compare-and-swap.
create function public.du_update_task_content(p_workspace text,p_actor text,p_identity text,p_id text,p_version bigint,p_patch jsonb,p_operation text,p_hash text,p_at text,p_source jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare m public.du_state_meta; actor jsonb; previous jsonb; updated jsonb; project jsonb; saved jsonb; member_id text; changed text[]; result jsonb; source jsonb; event_id text;
begin
 select * into m from public.du_state_meta where workspace_id=p_workspace for update;if not found then raise exception 'El espacio no está disponible.' using errcode='22023';end if;
 select record into actor from public.du_members where workspace_id=p_workspace and id=p_actor;
 if actor is null or actor->>'active'<>'true' or actor->>'authUserId' is distinct from p_identity then raise exception 'Tu acceso ya no está activo.' using errcode='42501';end if;
 select record into saved from public.du_receipts where workspace_id=p_workspace and id=p_operation;
 if saved is not null then
  if saved->>'hash'<>p_hash or saved->>'actorId'<>p_actor then raise exception 'El identificador ya fue usado con otra solicitud.' using errcode='40001';end if;
  select record into updated from public.du_tasks where workspace_id=p_workspace and id=p_id and coalesce(record->>'deletedAt','')='';
  return jsonb_build_object('revision',m.revision,'row',updated,'result',saved->'result');
 end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('title','description','priority','reason')) then raise exception 'Campos no permitidos.' using errcode='22023';end if;
 select record into previous from public.du_tasks where workspace_id=p_workspace and id=p_id for update;
 if previous is null or coalesce(previous->>'deletedAt','')<>'' then raise exception 'La tarea ya no está disponible.' using errcode='22023';end if;
 if (previous->>'version')::bigint<>p_version then raise exception 'Otra persona actualizó esta tarea. Recargá para revisar los cambios.' using errcode='40001';end if;
 if coalesce((previous->>'archived')::boolean,false) then raise exception 'Restaurá la tarea archivada antes de modificarla.' using errcode='22023';end if;
 if nullif(previous->>'projectId','') is not null then
  if previous->>'projectId' like 'gestion:%' then
   select value into source from jsonb_array_elements(coalesce(p_source,'[]')) where value->>'id'=previous->>'projectId';
   if source is null then raise exception 'No se pudo verificar el proyecto compartido.' using errcode='42501';end if;
   select record into project from public.du_project_links where workspace_id=p_workspace and source_id=substring(previous->>'projectId' from 9);
   project:=coalesce(project,'{}')||jsonb_build_object('status',source->>'status');
  else select record into project from public.du_projects where workspace_id=p_workspace and id=previous->>'projectId';end if;
  if project is null or coalesce(project->>'deletedAt','')<>'' then raise exception 'El proyecto no está disponible.' using errcode='22023';end if;
 end if;
 if actor->>'role'<>'Coordinación' and previous->>'ownerId'<>p_actor and coalesce(project->>'leadId','')<>p_actor then raise exception 'No podés modificar esta tarea.' using errcode='42501';end if;
 if project is not null and coalesce(project->>'status','Activo') not in ('Activo','En preparación') and not(actor->>'role'='Coordinación' and length(btrim(coalesce(p_patch->>'reason','')))>0) then raise exception 'El proyecto está pausado o cerrado. Revisá el seguimiento antes de editar.' using errcode='22023';end if;
 for member_id in select previous->>'ownerId' union select jsonb_array_elements_text(coalesce(previous->'collaborators','[]')) union select previous->>'validatorId' where coalesce((previous->>'requiresValidation')::boolean,false) loop
  if member_id is null or not exists(select 1 from public.du_members where workspace_id=p_workspace and id=member_id and record->>'active'='true') then raise exception 'Una persona asignada ya no está activa.' using errcode='22023';end if;
  if project?'members' and member_id<>coalesce(previous->>'validatorId','') and not(project->'members'?member_id) then raise exception 'Responsable y colaboradores deben participar del proyecto.' using errcode='22023';end if;
 end loop;
 if nullif(previous->>'milestoneId','') is not null and not exists(select 1 from public.du_milestones where workspace_id=p_workspace and id=previous->>'milestoneId' and project_id=previous->>'projectId') then raise exception 'El hito debe pertenecer al proyecto de la tarea.' using errcode='22023';end if;
 if p_patch?'title' and (jsonb_typeof(p_patch->'title')<>'string' or length(btrim(p_patch->>'title'))=0) then raise exception 'Título: completá este campo.' using errcode='22023';end if;
 if p_patch?'description' and jsonb_typeof(p_patch->'description')<>'string' then raise exception 'La descripción debe ser texto.' using errcode='22023';end if;
 if p_patch?'priority' and coalesce(p_patch->>'priority','') not in ('Alta','Media','Baja') then raise exception 'Prioridad inválida.' using errcode='22023';end if;
 updated:=previous||(p_patch-'reason');
 if updated<>previous then
  updated:=updated||jsonb_build_object('version',p_version+1,'updatedAt',p_at,'updatedBy',p_actor);
  select array_agg(key) into changed from jsonb_object_keys(updated) key where updated->key is distinct from previous->key;
  update public.du_tasks set record=updated where workspace_id=p_workspace and id=p_id;
  event_id:=gen_random_uuid()::text;
  insert into public.du_audit(workspace_id,id,record) values(p_workspace,event_id,jsonb_build_object('id',event_id,'at',p_at,'actorId',p_actor,'actorName',actor->>'name','actorEmail',actor->'email','entity','tasks','entityId',p_id,'action','modificar','before',previous,'after',updated,'fields',to_jsonb(changed),'reason',coalesce(p_patch->>'reason',''),'operationId',p_operation,'source','interfaz'));
 end if;
 result:=jsonb_build_object('id',p_id,'entity','tasks');
 insert into public.du_receipts(workspace_id,id,record) values(p_workspace,p_operation,jsonb_build_object('hash',p_hash,'actorId',p_actor,'result',result));
 update public.du_state_meta set revision=revision+1 where workspace_id=p_workspace;
 return jsonb_build_object('revision',m.revision+1,'row',updated,'result',result);
end;$$;
revoke all on function public.du_update_task_content(text,text,text,text,bigint,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.du_update_task_content(text,text,text,text,bigint,jsonb,text,text,text,jsonb) to service_role;
