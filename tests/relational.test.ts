import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
import {seed} from '../shared/seed.ts';import {execute} from '../shared/domain.ts';import {stateDelta} from '../server/relational.ts';
import {taskFollowupKey,activeTaskIssues} from '../shared/task-followup.ts';
import {taskProjectAssignmentSql} from '../server/task-project-assignment.ts';
export async function relationalFixture(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;grant usage on schema public to anon,authenticated,service_role,supabase_auth_admin;');
 await db.exec(await readFile(new URL('../supabase/schemas/du_equipo.sql',import.meta.url),'utf8'));
 const state=seed(new Date('2026-10-21T12:00:00Z'));state.accessMode='institutional';state.data.members.forEach(m=>m.authUserId='test-'+m.id);state.data.members[0].email='persona01@example.edu';
 await db.query('insert into public.du_workspaces(id,revision,payload)values($1,$2,$3)',[state.workspaceId,state.revision,state]);
 await db.exec('begin;'+await readFile(new URL('../deploy/du-relational-migration.sql',import.meta.url),'utf8')+'commit;');return {db,state};
}
export async function commit(db:PGlite,delta:ReturnType<typeof stateDelta>){const values=Object.values(delta),placeholders=values.map((_,i)=>'$'+(i+1));return (await db.query<{ok:boolean}>('select public.du_commit_state('+placeholders.join(',')+') ok',values)).rows[0].ok;}

test('El generador semanal de Postgres crea una tarea por lunes y conserva las entregas terminadas',async()=>{
 const {db,state}=await relationalFixture();
 try{
  await db.exec(await readFile(new URL('../deploy/du-weekly-recurrences.sql',import.meta.url),'utf8'));
  const routine={id:'weekly-test',version:1,projectId:'p1',title:'Preparar entrega semanal de prueba',
   ownerId:'persona05',collaborators:['persona02'],frequency:'Semanal',weekday:1,generateOnDate:true,
   active:true,startsOn:'2026-11-02',priority:'Alta'};
  for(const row of [routine,{...routine,id:'weekly-other-project',projectId:'p2',ownerId:'persona04'},
   {...routine,id:'weekly-paused',active:false},{...routine,id:'weekly-dismissed',dismissedDates:['2026-11-09','2026-11-16']}]){
   await db.query('insert into public.du_recurrences(workspace_id,id,record) values($1,$2,$3)',[state.workspaceId,row.id,row]);
  }
  const generate=async(day:string)=>(await db.query<{created:number}>(
   'select du_private.generate_weekly_recurrences($1,$2,$3::date) as created',[state.workspaceId,'p1',day])).rows[0].created;
  const read=async()=>(await db.query<{stored:typeof state}>('select public.du_read_state($1) as stored',[state.workspaceId])).rows[0].stored;
  assert.equal(await generate('2026-11-08'),0);
  assert.equal(await generate('2026-11-09'),1);
  const monday=await read(),first=monday.data.tasks.find(task=>task.recurrenceId===routine.id)!;
  assert.ok(first);
  assert.equal(monday.data.tasks.length,state.data.tasks.length+1);
  assert.deepEqual([first.title,first.projectId,first.ownerId,first.collaborators,first.priority,first.status,first.occurrenceDate],
   [routine.title,routine.projectId,routine.ownerId,routine.collaborators,routine.priority,'Pendiente','2026-11-09']);
  assert.ok(monday.audit.some(entry=>entry.entity==='tasks'&&entry.entityId===first.id&&entry.action==='crear'));
  assert.ok(monday.revision>state.revision);
  await db.query("update public.du_tasks set record=record||jsonb_build_object('status','Terminada','completedAt','2026-11-10T12:00:00Z','version',version+1) where workspace_id=$1 and id=$2",[state.workspaceId,first.id]);
  const finished=await read();
  assert.equal(await generate('2026-11-09'),0);
  assert.equal((await read()).revision,finished.revision);
  assert.equal(await generate('2026-11-16'),1);
  const next=await read(),occurrences=next.data.tasks.filter(task=>task.recurrenceId===routine.id);
  assert.equal(occurrences.length,2);
  assert.deepEqual(occurrences.find(task=>task.id===first.id),finished.data.tasks.find(task=>task.id===first.id));
  const second=occurrences.find(task=>task.id!==first.id)!;
  assert.equal(second.status,'Pendiente');assert.equal(second.occurrenceDate,'2026-11-16');
  assert.notEqual(second.code,first.code);
  assert.equal(next.data.tasks.length,state.data.tasks.length+2);
 }finally{await db.close();}
});

test('La asignación completa crea y reutiliza proyectos, conserva tareas e historial y activa la regla en un solo commit',async()=>{
 const {db,state}=await relationalFixture();try{
  const mapping=[{code:'T106',taskTitle:state.data.tasks[5].title,projectTitle:"Línea d'ensayo",expectedVersion:1},{code:'T101',taskTitle:state.data.tasks[0].title,projectTitle:'Proyecto compartido de prueba',externalId:'00000000-0000-4000-8000-000000000099',expectedVersion:1},{code:'T103',taskTitle:state.data.tasks[2].title,projectTitle:state.data.projects[1].title,expectedVersion:1}],sql=taskProjectAssignmentSql(state.workspaceId,'persona01','project-link-fixture',mapping);
  await db.exec(sql);const stored=(await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v;
  assert.equal(stored.settings.requireTaskProject,true);assert.equal(stored.data.projects.length,state.data.projects.length+1);assert.equal(stored.data.tasks.length,state.data.tasks.length);assert.ok(stored.data.tasks.every((task:any)=>task.projectId));assert.equal(stored.data.tasks.find((task:any)=>task.code==='T101').projectId,'gestion:00000000-0000-4000-8000-000000000099');
  for(const original of state.data.tasks){const row=stored.data.tasks.find((task:any)=>task.id===original.id);for(const [key,value] of Object.entries(original))if(!['projectId','version','updatedAt','updatedBy'].includes(key))assert.deepEqual(row[key],value);}
  assert.deepEqual(stored.snapshots,state.snapshots);assert.deepEqual(stored.data.issues,state.data.issues);assert.ok(stored.audit.some((event:any)=>event.entity==='settings'&&event.fields.includes('requireTaskProject')));
  await db.exec(sql);const repeated=(await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v;assert.equal(repeated.revision,stored.revision);assert.equal(repeated.audit.length,stored.audit.length);
 }finally{await db.close();}
});

test('Una asignación obsoleta, incompleta o sin permisos no crea proyectos ni aplica vínculos parciales',async()=>{
 const {db,state}=await relationalFixture();try{
  const mapping=[{code:'T106',taskTitle:state.data.tasks[5].title,projectTitle:'Destino de prueba',expectedVersion:1},{code:'T101',taskTitle:state.data.tasks[0].title,projectTitle:'Otro destino',expectedVersion:99}];
  await assert.rejects(()=>db.exec(taskProjectAssignmentSql(state.workspaceId,'persona01','stale-assignment',mapping)),/Task changed/);
  await assert.rejects(()=>db.exec(taskProjectAssignmentSql(state.workspaceId,'persona05','member-assignment',mapping)),/Coordination/);
  await assert.rejects(()=>db.exec(taskProjectAssignmentSql(state.workspaceId,'persona01','missing-assignment',[mapping[1]])),/Unmapped task/);
  const stored=(await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v;assert.equal(stored.revision,state.revision);assert.equal(stored.data.projects.length,state.data.projects.length);assert.deepEqual(stored.audit,state.audit);assert.deepEqual([...stored.data.tasks].sort((a,b)=>a.id.localeCompare(b.id)),[...state.data.tasks].sort((a,b)=>a.id.localeCompare(b.id)));
 }finally{await db.close();}
});

test('Bloqueos y ayuda guarda y destraba tarea, seguimiento y pedido en la estructura existente sin migraciones nuevas',async()=>{
 const {db,state}=await relationalFixture();try{
  const task=state.data.tasks.find(task=>task.id==='t1')!;
  const next=execute(state,'persona05',{id:'followup-persist',kind:'task_followup',entityId:task.id,expectedVersion:task.version,data:{action:'save',description:'Falta un dato de prueba',followUpDate:'2026-10-22',pause:true,requestCoordination:true,request:'Acordar la definición del dato',neededBy:'2026-10-22',followupKey:taskFollowupKey(state,task.id,'persona05')}},new Date('2026-10-21T15:00:00Z')).state;
  assert.equal(await commit(db,stateDelta(state,next)),true);
  const stored=(await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v;
  assert.equal(stored.data.tasks.find((row:any)=>row.id===task.id).status,'En espera');assert.equal(activeTaskIssues(stored.data.issues,task.id).length,1);assert.ok(stored.data.interventions.some((request:any)=>request.request==='Acordar la definición del dato'));
  const resumed=execute(stored,'persona05',{id:'followup-resume',kind:'task_followup',entityId:task.id,expectedVersion:stored.data.tasks.find((row:any)=>row.id===task.id).version,data:{action:'clear',note:'El dato fue confirmado',followupKey:taskFollowupKey(stored,task.id,'persona05')}},new Date('2026-10-21T16:00:00Z')).state;
  assert.equal(await commit(db,stateDelta(stored,resumed)),true);assert.equal(await commit(db,stateDelta(stored,resumed)),false);
  const final=(await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v;assert.equal(final.data.tasks.find((row:any)=>row.id===task.id).status,'En curso');assert.equal(activeTaskIssues(final.data.issues,task.id).length,0);assert.equal(final.audit.filter((event:any)=>event.operationId==='followup-resume').length,2);
 }finally{await db.close();}
});
test('Migración relacional conserva cada registro, vínculos y allowlist; navegador sin acceso directo',async()=>{
 const {db,state}=await relationalFixture();try{
  const result=(await db.query<{state:any}>('select public.du_read_state($1) state',[state.workspaceId])).rows[0].state;
  for(const entity of Object.keys(state.data))assert.deepEqual([...result.data[entity]].sort((a,b)=>a.id.localeCompare(b.id)),[...state.data[entity as keyof typeof state.data]].sort((a,b)=>a.id.localeCompare(b.id)),entity);
  assert.deepEqual(result.audit,state.audit);assert.equal(result.revision,state.revision);
  const names=(await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public'and tablename like 'du_%'and tablename<>'du_workspaces'")).rows;
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const {tablename}of names)await assert.rejects(()=>db.query('select * from public.'+tablename),/permission denied/);await assert.rejects(()=>db.query("select public.du_read_state('du-test')"),/permission denied/);await db.exec('reset role');}
  await db.exec('set role supabase_auth_admin');assert.deepEqual((await db.query<{v:any}>("select du_private.before_user_created('{\"user\":{\"email\":\"persona01@example.edu\"}}')v")).rows[0].v,{});await db.exec('reset role');
  await assert.rejects(()=>db.query("update public.du_workspaces set revision=1 where id='du-test'"),/almacenamiento fue actualizado/);
 }finally{await db.close();}
});
test('Commit por registros es atómico: versión obsoleta, FK inválida o actor inactivo no dejan cambios ni auditoría parcial',async()=>{
 const {db,state}=await relationalFixture();try{
  const next=execute(state,'persona05',{id:'relational-edit',kind:'create',entity:'tasks',data:{title:'Nueva tarea relacional',ownerId:'persona05',projectId:'p1'}},new Date('2026-10-21T13:00:00Z')).state;
  assert.equal(await commit(db,stateDelta(state,next)),true);assert.equal(await commit(db,stateDelta(state,next)),false);
  const base=(await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v;
  const invalid=structuredClone(base);invalid.revision++;invalid.data.tasks[0].ownerId='missing-member';invalid.data.tasks[0].version++;
  const delta=stateDelta(base,invalid);delta.p_actor='persona05';await assert.rejects(()=>commit(db,delta),/foreign key/);
  const inactive=stateDelta(base,{...base,revision:base.revision+1});inactive.p_actor='untrusted';await assert.rejects(()=>commit(db,inactive),/Inactive actor/);
  assert.equal((await db.query<{v:any}>('select public.du_read_state($1) v',[state.workspaceId])).rows[0].v.revision,next.revision);
  await db.exec('set role service_role');await assert.rejects(()=>db.query('delete from public.du_audit'),/permission denied/);await assert.rejects(()=>db.query('update public.du_snapshots set record=record'),/permission denied/);
 }finally{await db.close();}
});
test('Lease de procesos admite un solo ejecutor y la lectura operativa separa auditoría y recibos solicitados',async()=>{
 const {db,state}=await relationalFixture();try{
  const token=crypto.randomUUID(),other=crypto.randomUUID();const claim=async(t:string)=>(await db.query<{v:boolean}>('select public.du_claim_job($1,$2,$3,120)v',[state.workspaceId,'daily',t])).rows[0].v;
  assert.equal(await claim(token),true);assert.equal(await claim(other),false);await db.query("update public.du_job_leases set expires_at=now()-interval '1 second'");assert.equal(await claim(other),true);
  const next=execute(state,'persona05',{id:'wanted-receipt',kind:'create',entity:'tasks',data:{title:'Otra tarea',ownerId:'persona05'}},new Date('2026-10-21T14:00:00Z')).state;await commit(db,stateDelta(state,next));
  const loaded=(await db.query<{v:any}>('select public.du_read_state($1,false,$2)v',[state.workspaceId,['wanted-receipt']])).rows[0].v;assert.equal(loaded.audit.length,0);assert.ok(loaded.receipts['wanted-receipt']);
  assert.equal((await db.query<{v:any}>('select public.du_read_state($1,false,$2)v',[state.workspaceId,[]])).rows[0].v.receipts['wanted-receipt'],undefined);
 }finally{await db.close();}
});

test('Ediciones simples de tareas distintas se guardan a la vez, con permisos actuales, auditoría e idempotencia',async()=>{
 const {db,state}=await relationalFixture();try{
  const update=async(id:string,actor:string,version:number,operation:string,patch:any,identity='test-'+actor)=>(await db.query<{v:any}>('select public.du_update_task_content($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)v',[state.workspaceId,actor,identity,id,version,patch,operation,JSON.stringify({id,version,patch}),'2026-10-21T15:00:00.000Z',[]])).rows[0].v;
  const results=await Promise.all(state.data.tasks.map(task=>update(task.id,task.ownerId,1,'edit-'+task.id,{title:'Cambio '+task.id})));assert.equal(results.length,9);assert.equal(new Set(results.map(r=>r.revision)).size,9);assert.ok(results.every(r=>r.row.version===2));
  assert.equal((await update('t1','persona05',1,'edit-t1',{title:'Cambio t1'})).row.version,2);
  await assert.rejects(()=>update('t1','persona05',1,'stale',{title:'Obsoleto'}),/Otra persona/);
  await assert.rejects(()=>update('t1','persona06',2,'forbidden',{title:'Ajeno'}),/No podés/);
  await assert.rejects(()=>update('t1','persona05',2,'identity',{title:'Falsa identidad'},'wrong-google-user'),/acceso/);
  await assert.rejects(()=>update('t1','persona05',2,'scope',{status:'Terminada'}),/Campos no permitidos/);
  const count=(await db.query<{n:number}>('select count(*)::int n from public.du_audit')).rows[0].n;assert.equal(count,9);assert.equal((await db.query<{n:number}>("select count(*)::int n from public.du_audit where id<>record->>'id'")).rows[0].n,0);
 }finally{await db.close();}
});
