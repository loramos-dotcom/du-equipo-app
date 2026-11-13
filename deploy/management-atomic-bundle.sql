-- Additive bridge: reuses the caller's existing RLS permissions and canonical operations.
create or replace function public.du_save_project_bundle(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_data jsonb := coalesce(payload -> 'project', '{}'::jsonb);
  saved_id uuid;
  updated_id uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'La solicitud del proyecto no es válida.' using errcode = '22023';
  end if;
  if project_data ? 'visualMetrics' and jsonb_typeof(project_data -> 'visualMetrics') <> 'object' then
    raise exception 'Las métricas del proyecto no son válidas.' using errcode = '22023';
  end if;
  saved_id := public.save_project_bundle(payload);
  if project_data ? 'visualMetrics' then
    update public.projects set visual_metrics = project_data -> 'visualMetrics'
    where id = saved_id returning id into updated_id;
    if updated_id is null then
      raise exception 'No se pudieron guardar las métricas del proyecto.' using errcode = '42501';
    end if;
  end if;
  if project_data ? 'manualStatus' then
    perform public.set_project_manual_status(saved_id, nullif(project_data ->> 'manualStatus', '')::public.project_status);
  end if;
  return saved_id;
end;
$$;
revoke all on function public.du_save_project_bundle(jsonb) from public, anon;
grant execute on function public.du_save_project_bundle(jsonb) to authenticated;
comment on function public.du_save_project_bundle(jsonb) is 'DU Equipo: canonical project bundle, metrics and manual status in one transaction, using caller RLS.';
