import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
import {seed} from '../shared/seed.ts';import {execute} from '../shared/domain.ts';import {stateDelta} from '../server/relational.ts';
export async function relationalFixture(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;grant usage on schema public to anon,authenticated,service_role,supabase_auth_admin;');
 await db.exec(await readFile(new URL('../supabase/schemas/du_equipo.sql',import.meta.url),'utf8'));
 const state=seed(new Date('2026-10-21T12:00:00Z'));state.accessMode='institutional';state.data.members.forEach(m=>m.authUserId='test-'+m.id);state.data.members[0].email='persona01@example.edu';
 await db.query('insert into public.du_workspaces(id,revision,payload)values($1,$2,$3)',[state.workspaceId,state.revision,state]);
 await db.exec('begin;'+await readFile(new URL('../deploy/du-relational-migration.sql',import.meta.url),'utf8')+'commit;');return {db,state};
}
export async function commit(db:PGlite,delta:ReturnType<typeof stateDelta>){const values=Object.values(delta),placeholders=values.map((_,i)=>'$'+(i+1));return (await db.query<{ok:boolean}>('select public.du_commit_state('+placeholders.join(',')+') ok',values)).rows[0].ok;}
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
