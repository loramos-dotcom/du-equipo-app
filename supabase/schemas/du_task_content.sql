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
