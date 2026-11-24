-- Install in the relational DU database. The project and workspace are supplied by the scheduler.
create schema if not exists du_private;

create or replace function du_private.generate_weekly_recurrences(
  p_workspace text,
  p_project text,
  p_day date default (now() at time zone 'America/Argentina/Buenos_Aires')::date
) returns integer
language plpgsql security invoker set search_path = ''
as $weekly$
declare
  meta jsonb;
  current_revision bigint;
  project jsonb;
  routine jsonb;
  collaborators jsonb;
  task jsonb;
  task_id text;
  task_code bigint;
  day_key text := to_char(p_day, 'YYYY-MM-DD');
  stamp text := to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  operation text := gen_random_uuid()::text;
  tasks jsonb := '[]';
  events jsonb := '[]';
begin
  if p_day is null or extract(isodow from p_day) <> 1 then
    return 0;
  end if;

  -- Application writes use the same lock and check the workspace revision on commit.
  select s.revision, s.metadata into strict current_revision, meta
  from public.du_state_meta s where s.workspace_id = p_workspace for update;

  select p.record into strict project from public.du_projects p
  where p.workspace_id = p_workspace and p.id = p_project;
  if coalesce(project->>'deletedAt', '') <> '' or project @> '{"archived":true}'
     or coalesce(project->>'status', '') not in ('Activo', 'En preparación') then
    return 0;
  end if;

  select greatest(100, (meta#>>'{ledger,maxTaskCode}')::bigint,
                  max(substring(t.record->>'code' from 2)::bigint))
  into task_code from public.du_tasks t
  where t.workspace_id = p_workspace and t.record->>'code' ~ '^T[0-9]+$';

  for routine in
    select r.record from public.du_recurrences r
    where r.workspace_id = p_workspace and r.project_id = p_project
      and r.record @> '{"active":true,"generateOnDate":true,"frequency":"Semanal"}'
      and r.record->>'weekday' = '1'
      and coalesce(r.record->>'deletedAt', '') = '' and not r.record @> '{"archived":true}'
      and r.record->>'startsOn' <= day_key and coalesce(nullif(r.record->>'endsOn', ''), day_key) >= day_key
      and not coalesce(r.record->'dismissedDates' ? day_key, false)
      and not exists (
        -- All statuses, including archived and soft-deleted occurrences, reserve the date.
        select 1 from public.du_tasks t where t.workspace_id = p_workspace
          and t.recurrence_id = r.id and t.record->>'occurrenceDate' = day_key
      )
      and not coalesce((meta#>'{ledger,purgedOccurrences}') @>
        jsonb_build_array(jsonb_build_object('recurrenceId', r.id, 'occurrenceDate', day_key)), false)
    order by r.id
  loop
    -- Keep the original collaborator order while normalizing duplicate and owner entries.
    select coalesce(jsonb_agg(person.member_id order by person.position), '[]'::jsonb)
    into collaborators from (
      select c.member_id, min(c.position) as position
      from jsonb_array_elements_text(coalesce(nullif(routine->'collaborators', 'null'), '[]'))
        with ordinality as c(member_id, position)
      where c.member_id is distinct from (routine->>'ownerId')
      group by c.member_id
    ) person;

    if exists (
      select 1 from jsonb_array_elements_text(jsonb_build_array(routine->'ownerId') || collaborators) a(member_id)
      where not coalesce((project->'members') ? a.member_id, false)
        or not exists (
          select 1 from public.du_members m where m.workspace_id = p_workspace and m.id = a.member_id
            and m.record @> '{"active":true}' and coalesce(m.record->>'deletedAt', '') = ''
        )
    ) then
      raise warning 'Weekly recurrence % has an unavailable project participant', routine->>'id';
      continue;
    end if;

    if routine @> '{"requiresValidation":true}' and (
      (routine->>'validatorId') is not distinct from (routine->>'ownerId')
      or not exists (
        select 1 from public.du_members m where m.workspace_id = p_workspace and m.id = routine->>'validatorId'
          and m.record @> '{"active":true}' and coalesce(m.record->>'deletedAt', '') = ''
      )
    ) then
      raise warning 'Weekly recurrence % has an unavailable validator', routine->>'id';
      continue;
    end if;

    if (routine ? 'executionType' or routine ? 'executionAreaId') and (
      coalesce(routine->>'executionType', '') not in ('du', 'area', 'unspecified')
      or (routine->>'executionType' = 'area' and not exists (
        select 1 from public.du_areas a where a.workspace_id = p_workspace and a.id = routine->>'executionAreaId'
          and a.record @> '{"active":true}' and coalesce(a.record->>'deletedAt', '') = ''
      ))
    ) then
      raise warning 'Weekly recurrence % has an unavailable execution area', routine->>'id';
      continue;
    end if;

    task_id := gen_random_uuid()::text;
    task_code := task_code + 1;
    task := jsonb_build_object(
      'id', task_id, 'code', 'T' || task_code, 'title', routine->>'title',
      'description', coalesce(routine->>'description', ''), 'projectId', p_project,
      'ownerId', routine->>'ownerId', 'collaborators', collaborators,
      'status', 'Pendiente', 'priority', coalesce(routine->>'priority', 'Media'),
      'requiresValidation', routine @> '{"requiresValidation":true}', 'validatorId', routine->'validatorId',
      'dueDate', null, 'originalDueDate', null, 'links', '[]'::jsonb,
      'recurrenceId', routine->>'id', 'occurrenceDate', day_key, 'origin', 'Rutina',
      'version', 1, 'createdAt', stamp, 'updatedAt', stamp, 'updatedBy', 'system:daily'
    );
    if routine ? 'executionType' then
      task := task || jsonb_build_object('executionType', routine->'executionType', 'executionAreaId',
        case when routine->>'executionType' = 'area' then routine->'executionAreaId' end);
    end if;

    tasks := tasks || jsonb_build_array(jsonb_build_object('id', task_id, 'expectedVersion', null, 'record', task));
    events := events || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text, 'at', stamp, 'actorId', 'system:daily',
      'actorName', 'Proceso diario de DU Equipo', 'actorEmail', null,
      'entity', 'tasks', 'entityId', task_id, 'action', 'crear', 'before', null, 'after', task,
      'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(task) as fields(k)),
      'reason', '', 'operationId', operation, 'source', 'proceso automático'
    ));
  end loop;

  if jsonb_array_length(tasks) > 0 then
    meta := jsonb_set(meta, '{ledger}', coalesce(meta->'ledger', '{}'::jsonb) || jsonb_build_object('maxTaskCode', task_code));
    if not public.du_commit_state(p_workspace, current_revision, current_revision + 1, meta,
      jsonb_build_object('tasks', tasks), events, '[]', '{}', '[]', 'system:daily') then
      raise exception 'Workspace revision changed' using errcode = '40001';
    end if;
  end if;
  return jsonb_array_length(tasks);
end;
$weekly$;

revoke all on function du_private.generate_weekly_recurrences(text, text, date) from public, anon, authenticated;
