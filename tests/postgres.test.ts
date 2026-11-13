import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
import {institutionalState} from '../shared/team.ts';
test('Postgres schema denies raw client access, restricts signup, and detects stale writes',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;');
  await db.exec(await readFile(new URL('../supabase/schemas/du_equipo.sql',import.meta.url),'utf8'));
  const state=institutionalState('du-test',{persona01:'persona01@example.edu'},'persona01@example.edu');
  await db.query('insert into public.du_workspaces (id,revision,payload) values ($1,$2,$3)',[state.workspaceId,0,state]);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const sql of ['select * from public.du_workspaces',"update public.du_workspaces set revision=1","select du_private.before_user_created('{}'::jsonb)"]){await assert.rejects(()=>db.query(sql),/permission denied/);}
   await db.exec('reset role');
  }
  await db.exec('set role supabase_auth_admin');
  const call=async(email:string)=>(await db.query<{result:any}>('select du_private.before_user_created($1::jsonb) as result',[{user:{email}}])).rows[0].result;
  assert.deepEqual(await call('PERSONA01@example.edu'),{});assert.equal((await call('outsider@example.edu')).error.http_code,403);assert.equal((await call('')).error.http_code,403);
  await assert.rejects(()=>db.query('delete from public.du_workspaces'),/permission denied/);await db.exec('reset role');
  await db.exec('set role service_role');
  const changed={...state,revision:1};const a=await db.query('update public.du_workspaces set revision=1,payload=$1 where id=$2 and revision=0 returning id',[changed,state.workspaceId]);const b=await db.query('update public.du_workspaces set revision=1,payload=$1 where id=$2 and revision=0 returning id',[changed,state.workspaceId]);assert.equal(a.rows.length,1);assert.equal(b.rows.length,0);
  await assert.rejects(()=>db.query('delete from public.du_workspaces'),/permission denied/);
 }finally{await db.close();}
});
