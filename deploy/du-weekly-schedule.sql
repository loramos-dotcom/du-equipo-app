-- Install du-weekly-recurrences.sql first. Set du.weekly_workspace and
-- du.weekly_project to the target IDs in the same transaction as this script.
-- Reapplying as the same scheduler role updates the existing job by name.
create extension if not exists pg_cron with schema pg_catalog;

do $schedule$
declare
  workspace_key text := current_setting('du.weekly_workspace');
  project_key text := current_setting('du.weekly_project');
begin
  if current_setting('cron.timezone') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'This schedule requires a UTC pg_cron scheduler';
  end if;

  if to_regprocedure('du_private.generate_weekly_recurrences(text,text,date)') is null then
    raise exception 'The weekly recurrence generator must be installed first';
  end if;
  if not exists (
    select 1 from public.du_projects
    where workspace_id = workspace_key and id = project_key
      and record->>'deletedAt' is null and not coalesce((record->>'archived')::boolean, false)
  ) then
    raise exception 'The weekly project is unavailable';
  end if;

  -- Monday at midnight in Buenos Aires is Monday at 03:00 UTC.
  perform cron.schedule(
    'du-weekly-' || md5(jsonb_build_array(workspace_key, project_key)::text),
    '0 3 * * 1',
    format('select du_private.generate_weekly_recurrences(%L, %L);', workspace_key, project_key)
  );
end;
$schedule$;
