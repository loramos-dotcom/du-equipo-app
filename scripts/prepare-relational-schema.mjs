import {writeFile,mkdir} from 'node:fs/promises';
// This generator owns only the new additive relational schema. Legacy du_workspaces is retained.
export const entities={members:'members',areas:'areas',projects:'projects',milestones:'milestones',tasks:'tasks',weeks:'weeks',plans:'plans',commitments:'commitments',issues:'issues',interventions:'interventions',meetings:'meetings',agenda:'agenda',decisions:'decisions',recurrences:'recurrences',comments:'comments',links:'links',catalogs:'catalogs',filters:'filters',notifications:'notifications',projectLinks:'project_links',areaContacts:'area_contacts',areaAssignments:'area_assignments',preferences:'preferences',jobRuns:'job_runs',pilotRuns:'pilot_runs'};
const fields={members:{email:'email',auth_user_id:'authUserId',reports_to:'reportsTo'},areas:{lead_id:'leadId',parent_id:'parentId'},projects:{lead_id:'leadId',area_id:'areaId'},milestones:{project_id:'projectId',owner_id:'ownerId',area_id:'areaId'},tasks:{owner_id:'ownerId',project_id:'projectId',milestone_id:'milestoneId',recurrence_id:'recurrenceId',due_date:'dueDate',status:'status'},plans:{week_id:'weekId',owner_id:'ownerId'},commitments:{task_id:'taskId',week_id:'weekId',owner_id:'ownerId'},issues:{task_id:'taskId',project_id:'projectId',owner_id:'ownerId',status:'status'},interventions:{issue_id:'issueId',taken_by:'takenBy',status:'status'},meetings:{week_id:'weekId',planning_week_id:'planningWeekId',status:'status'},agenda:{meeting_id:'meetingId'},decisions:{meeting_id:'meetingId',owner_id:'ownerId',task_id:'taskId',commitment_id:'commitmentId'},recurrences:{owner_id:'ownerId',project_id:'projectId'},comments:{author_id:'authorId',target_type:'targetType',target_id:'targetId'},links:{target_type:'targetType',target_id:'targetId'},filters:{owner_id:'ownerId',scope:'scope'},notifications:{owner_id:'ownerId',notice_key:'key'},project_links:{source_id:'sourceId',lead_id:'leadId',area_id:'areaId'},area_contacts:{area_id:'areaId'},area_assignments:{area_id:'areaId',member_id:'memberId',assignment_role:'assignmentRole',valid_from:'validFrom',valid_to:'validTo'},preferences:{owner_id:'ownerId',preference_key:'key'}};
const targets={owner_id:'members',lead_id:'members',reports_to:'members',taken_by:'members',author_id:'members',member_id:'members',area_id:'areas',parent_id:'areas',project_id:'project_refs',task_id:'tasks',milestone_id:'milestones',recurrence_id:'recurrences',week_id:'weeks',planning_week_id:'weeks',issue_id:'issues',meeting_id:'meetings',commitment_id:'commitments'};
let sql=`-- Generated from scripts/prepare-relational-schema.mjs. Review before deployment.\n-- No public/browser write grants. Application server validates commands using verified Google identity.\ncreate table public.du_state_meta (workspace_id text primary key, revision bigint not null check(revision>=0), metadata jsonb not null, migrated_at timestamptz not null default now());\ncreate table public.du_project_refs (workspace_id text not null references public.du_state_meta(workspace_id), id text not null, source text not null check(source in ('du','gestion')), source_id text, primary key(workspace_id,id), check ((source='du' and source_id is null) or (source='gestion' and id='gestion:'||source_id)));\n`;
for(const [entity,table]of Object.entries(entities)){
 sql+=`create table public.du_${table} (\n workspace_id text not null references public.du_state_meta(workspace_id),\n id text not null,\n record jsonb not null check(jsonb_typeof(record)='object' and record->>'id'=id and (record->>'version')::bigint>0),\n version bigint generated always as ((record->>'version')::bigint) stored,\n updated_at text generated always as (record->>'updatedAt') stored`;
 for(const [column,property]of Object.entries(fields[table]??{}))sql+=`,\n ${column} text generated always as (nullif(record->>'${property}','')) stored`;
 sql+=`,\n primary key(workspace_id,id)\n);\n`;
 sql+=`create index du_${table}_updated on public.du_${table}(workspace_id,updated_at desc,id);\n`;
 for(const column of Object.keys(fields[table]??{}))if(targets[column])sql+=`create index du_${table}_${column}_idx on public.du_${table}(workspace_id,${column});\n`;
}
for(const [table,columns]of Object.entries(fields))for(const column of Object.keys(columns))if(targets[column])sql+=`alter table public.du_${table} add constraint du_${table}_${column}_fk foreign key(workspace_id,${column}) references public.du_${targets[column]}(workspace_id,id) deferrable initially deferred;\n`;
sql+=`create unique index du_members_email_unique on public.du_members(workspace_id,lower(email));
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
`;
const tables=['state_meta','project_refs',...Object.values(entities),'audit','snapshots','receipts','job_leases','backup_credentials'];
for(const table of tables){sql+=`alter table public.du_${table} enable row level security;\nalter table public.du_${table} force row level security;\nrevoke all on public.du_${table} from public,anon,authenticated;\ngrant select,insert${['audit','snapshots','receipts'].includes(table)?'':',update,delete'} on public.du_${table} to service_role;\n`;}
sql+='grant usage,select on sequence public.du_audit_event_sequence_seq to service_role;\n';
const mapJson=JSON.stringify(entities).replaceAll("'","''");
sql+=`
create function public.du_read_state(p_workspace text,p_history boolean default true,p_receipts text[] default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare m public.du_state_meta; pair record; data jsonb:='{}'; rows jsonb; audits jsonb; snapshots jsonb; receipts jsonb;
begin
 select * into m from public.du_state_meta where workspace_id=p_workspace;if not found then return null;end if;
 for pair in select * from jsonb_each_text('${mapJson}'::jsonb) loop
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
  table_name:='${mapJson}'::jsonb->>pair.key;if table_name is null then raise exception 'Invalid entity';end if;
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
`;
await mkdir('supabase/schemas',{recursive:true});await writeFile('supabase/schemas/du_relational.sql',sql);
console.log('Declarative relational schema generated: '+tables.length+' protected tables.');
