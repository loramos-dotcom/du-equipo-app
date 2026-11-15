export type TaskProjectAssignment={code:string;taskTitle:string;projectTitle:string;expectedVersion:number;externalId?:string};
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";

/** An audited, atomic maintenance operation; project and task payloads never leave Postgres. */
export function taskProjectAssignmentSql(workspace:string,actorId:string,operationId:string,mapping:TaskProjectAssignment[]):string{
 if(!workspace||!actorId||!operationId||operationId.length>100||!mapping.length||mapping.length>100||new Set(mapping.map(item=>item.code)).size!==mapping.length)throw Error('Invalid assignment request');
 for(const item of mapping)if(!/^T\d+$/.test(item.code)||!item.taskTitle.trim()||!item.projectTitle.trim()||!Number.isSafeInteger(item.expectedVersion)||item.expectedVersion<1||item.externalId&&!/^[a-f\d-]{36}$/i.test(item.externalId))throw Error('Invalid task assignment');
 const input=literal(JSON.stringify(mapping));
 return `-- Apply only the explicitly requested task/project links and enable the required-project policy.
-- Existing full records remain inside Postgres and are retained in the normal audit trail.
do $assign_task_projects$
declare
 request jsonb := ${input}::jsonb;
 workspace text := ${literal(workspace)};
 actor_key text := ${literal(actorId)};
 operation text := ${literal(operationId)};
 stamp text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 actor jsonb; meta jsonb; revision bigint; item jsonb; task jsonb; original jsonb; project jsonb;
 task_key text; project_key text; source_key text; project_count integer; required_members jsonb; combined_members jsonb;
 projects jsonb := '[]'; tasks jsonb := '[]'; refs jsonb := '[]'; events jsonb := '[]';
 reason text := 'Proyectos asignados y proyecto obligatorio por instrucción de Coordinación.';
begin
 select s.revision,s.metadata into strict revision,meta from public.du_state_meta s where s.workspace_id=workspace for update;
 select m.record into strict actor from public.du_members m where m.workspace_id=workspace and m.id=actor_key;
 if actor->>'role'<>'Coordinación' or not coalesce((actor->>'active')::boolean,false) then raise exception 'Active Coordination actor required';end if;
 if exists(select 1 from public.du_audit a where a.workspace_id=workspace and a.record->>'operationId'=operation) then return;end if;
 if exists(select 1 from public.du_tasks t where t.workspace_id=workspace and coalesce(t.record->>'deletedAt','')='' and not coalesce((t.record->>'archived')::boolean,false) and coalesce(t.record->>'projectId','')='' and not exists(select 1 from jsonb_array_elements(request) entry where entry->>'code'=t.record->>'code')) then raise exception 'Unmapped task without project';end if;
 if exists(select 1 from public.du_recurrences r where r.workspace_id=workspace and coalesce(r.record->>'deletedAt','')='' and coalesce((r.record->>'active')::boolean,false) and coalesce(r.record->>'projectId','')='') then raise exception 'Active recurrence without project';end if;
 for item in select value from jsonb_array_elements(request) loop
  select t.id,t.record into strict task_key,task from public.du_tasks t where t.workspace_id=workspace and t.record->>'code'=item->>'code' and coalesce(t.record->>'deletedAt','')='' and not coalesce((t.record->>'archived')::boolean,false) for update;
  if task->>'title'<>item->>'taskTitle' or (task->>'version')::bigint<>(item->>'expectedVersion')::bigint then raise exception 'Task changed: %',item->>'code';end if;
  if not exists(select 1 from public.du_members m where m.workspace_id=workspace and m.id=task->>'ownerId' and coalesce((m.record->>'active')::boolean,false)) then raise exception 'Task owner is inactive';end if;
  select coalesce(jsonb_agg(distinct value),'[]') into required_members from jsonb_array_elements(jsonb_build_array(task->>'ownerId',actor_key)||coalesce(task->'collaborators','[]'));
  if exists(select 1 from jsonb_array_elements_text(required_members) member_id where not exists(select 1 from public.du_members m where m.workspace_id=workspace and m.id=member_id and coalesce((m.record->>'active')::boolean,false))) then raise exception 'Inactive project participant';end if;
  if coalesce(item->>'externalId','')<>'' then
   source_key:=item->>'externalId';project_key:='gestion:'||source_key;
   if exists(select 1 from public.du_project_links link where link.workspace_id=workspace and link.record->>'sourceId'=source_key and coalesce(link.record->>'deletedAt','')='' and link.record ? 'members' and not (link.record->'members' ? (task->>'ownerId'))) then raise exception 'Review shared project participants before assignment';end if;
   refs:=refs||jsonb_build_array(jsonb_build_object('id',project_key,'source','gestion','sourceId',source_key));
  else
   select count(*) into project_count from public.du_projects p where p.workspace_id=workspace and lower(trim(p.record->>'title'))=lower(trim(item->>'projectTitle')) and coalesce(p.record->>'deletedAt','')='';
   if project_count>1 then raise exception 'Ambiguous project name: %',item->>'projectTitle';end if;
   project:=null;
   select p.id,p.record into project_key,project from public.du_projects p where p.workspace_id=workspace and lower(trim(p.record->>'title'))=lower(trim(item->>'projectTitle')) and coalesce(p.record->>'deletedAt','')='';
   if project is null then
    project_key:=gen_random_uuid()::text;
    project:=jsonb_build_object('id',project_key,'version',1,'title',item->>'projectTitle','outcome','Coordinar y dar seguimiento a las tareas de '||(item->>'projectTitle')||'.','leadId',task->>'ownerId','members',required_members,'manualMemberIds',required_members,'areaIds',coalesce(task->'areaIds',case when coalesce(task->>'areaId','')<>'' then jsonb_build_array(task->>'areaId') else '[]'::jsonb end),'areaId',task->'areaId','manualAreaIds',coalesce(task->'areaIds','[]'),'kind','project','scope','du','status','En preparación','delivery','Sin evaluar','duPriority',false,'areaPriorities','{}'::jsonb,'createdAt',stamp,'updatedAt',stamp,'createdBy',actor_key,'updatedBy',actor_key);
    projects:=projects||jsonb_build_array(jsonb_build_object('id',project_key,'expectedVersion',null,'record',project));
    events:=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'actorId',actor_key,'actorName',actor->>'name','actorEmail',actor->'email','entity','projects','entityId',project_key,'action','crear','before',null,'after',project,'fields',jsonb_build_array('title','outcome','leadId','members','areaIds'),'reason',reason,'operationId',operation,'source','interfaz'));
   else
    if coalesce((project->>'archived')::boolean,false) or project->>'status' in ('Finalizado','Cancelado','Pausado') then raise exception 'Project is not available for tasks: %',item->>'projectTitle';end if;
    original:=project;select jsonb_agg(distinct value) into combined_members from jsonb_array_elements(coalesce(project->'members','[]')||required_members);
    if not (coalesce(project->'members','[]') @> required_members) then
     project:=project||jsonb_build_object('members',combined_members,'manualMemberIds',combined_members,'version',(project->>'version')::bigint+1,'updatedAt',stamp,'updatedBy',actor_key);
     projects:=projects||jsonb_build_array(jsonb_build_object('id',project_key,'expectedVersion',(original->>'version')::bigint,'record',project));
     events:=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'actorId',actor_key,'actorName',actor->>'name','actorEmail',actor->'email','entity','projects','entityId',project_key,'action','modificar','before',original,'after',project,'fields',jsonb_build_array('members','manualMemberIds'),'reason',reason,'operationId',operation,'source','interfaz'));
    end if;
   end if;
   refs:=refs||jsonb_build_array(jsonb_build_object('id',project_key,'source','du'));
  end if;
  if coalesce(task->>'projectId','')<>project_key then
   original:=task;task:=task||jsonb_build_object('projectId',project_key,'version',(task->>'version')::bigint+1,'updatedAt',stamp,'updatedBy',actor_key);
   tasks:=tasks||jsonb_build_array(jsonb_build_object('id',task_key,'expectedVersion',(original->>'version')::bigint,'record',task));
   events:=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'actorId',actor_key,'actorName',actor->>'name','actorEmail',actor->'email','entity','tasks','entityId',task_key,'action','modificar','before',original,'after',task,'fields',jsonb_build_array('projectId'),'reason',reason,'operationId',operation,'source','interfaz'));
  end if;
 end loop;
 original:=coalesce(meta->'settings','{}');meta:=jsonb_set(meta,'{settings}',original||jsonb_build_object('requireTaskProject',true));
 events:=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'at',stamp,'actorId',actor_key,'actorName',actor->>'name','actorEmail',actor->'email','entity','settings','entityId',workspace,'action','modificar','before',jsonb_build_object('id',workspace,'version',revision)||original,'after',jsonb_build_object('id',workspace,'version',revision+1)||(meta->'settings'),'fields',jsonb_build_array('requireTaskProject'),'reason',reason,'operationId',operation,'source','interfaz'));
 if not public.du_commit_state(workspace,revision,revision+1,meta,jsonb_build_object('projects',projects,'tasks',tasks),events,'[]','{}',refs,actor_key) then raise exception 'Workspace changed; no assignments were saved';end if;
end $assign_task_projects$;
select t.record->>'code' as code,t.record->>'title' as task,entry->>'projectTitle' as project,t.record->>'projectId' as project_id
from public.du_tasks t join jsonb_array_elements(${input}::jsonb) entry on entry->>'code'=t.record->>'code'
where t.workspace_id=${literal(workspace)} order by t.record->>'code';`;
}
