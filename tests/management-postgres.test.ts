import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../deploy/management-atomic-bundle.sql',import.meta.url),'utf8');
test('existing nested parents are retained; new assignments, stale versions and permissions still validate',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table public.projects(id integer primary key,parent_id integer,primary_area_id integer,version integer default 1);
 insert into public.projects(id,parent_id,primary_area_id) values(1,null,10),(2,1,10),(3,2,10),(4,null,20);
 create function public.save_project_bundle(payload jsonb) returns integer language plpgsql security invoker as $$
 declare v_project_id integer:=(payload->>'id')::integer;v_parent_project_id integer:=(payload->>'parentId')::integer;v_area_id integer:=(payload->>'areaId')::integer;
 begin
 if v_parent_project_id is not null then
   if not exists(select 1 from public.projects where id=v_parent_project_id and parent_id is null and primary_area_id=v_area_id) then raise exception 'invalid parent';end if;
 end if;
 if (payload->>'version')::integer is distinct from (select version from public.projects where id=v_project_id) then raise exception 'stale version';end if;
 update public.projects set version=version+1,parent_id=v_parent_project_id,primary_area_id=v_area_id where id=v_project_id;
 return v_project_id;end;$$;
 revoke all on function public.save_project_bundle(jsonb) from public,anon;grant execute on function public.save_project_bundle(jsonb) to authenticated;
 grant select on public.projects to authenticated;`);
 const save=(payload:object)=>db.query('select public.save_project_bundle($1::jsonb)',[JSON.stringify(payload)]);
 await assert.rejects(save({id:3,parentId:2,areaId:10,version:1}),/invalid parent/);
 const patch=await readFile(new URL('../deploy/management-existing-parent.sql',import.meta.url),'utf8');await db.exec(patch);await db.exec(patch);
 await save({id:3,parentId:2,areaId:10,version:1});assert.equal((await db.query<{version:number}>('select version from public.projects where id=3')).rows[0].version,2);
 await assert.rejects(save({id:3,parentId:2,areaId:10,version:1}),/stale version/);
 await assert.rejects(save({id:3,parentId:2,areaId:20,version:2}),/invalid parent/);
 await assert.rejects(save({id:4,parentId:2,areaId:10,version:1}),/invalid parent/);
 await save({id:4,parentId:1,areaId:10,version:1});
 assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.save_project_bundle(jsonb)','execute') as allowed")).rows[0].allowed,false);
 await db.exec('set role authenticated');await assert.rejects(save({id:3,parentId:2,areaId:10,version:2}),/permission denied/);await db.exec('reset role');
 assert.equal((await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where oid='public.save_project_bundle(jsonb)'::regprocedure")).rows[0].prosecdef,false);
 }finally{await db.close();}
});
test('change tokens cover relationships and deletions, roll back with failed writes and cannot be changed by a reader',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid;$$;create function private.is_authorized_viewer() returns boolean language sql as $$select true;$$;grant usage on schema private,auth to authenticated;grant execute on function private.is_authorized_viewer() to authenticated;`);
 for(const table of ['projects','project_updates','next_steps','next_step_owners','project_areas','attachments','dashboard_favorites','indicators','milestones','budget_execution','special_views','profiles','area_permissions','dashboard_permissions','access_grants','areas'])await db.exec('create table public.'+table+'(id integer primary key);');
 await db.exec(await readFile(new URL('../deploy/management-revisions.sql',import.meta.url),'utf8'));
 await db.exec('insert into public.next_step_owners values(1);insert into public.attachments values(1);delete from public.attachments;insert into public.budget_execution values(1);insert into public.profiles values(1);');
 assert.deepEqual((await db.query('select projects_revision,portfolio_revision,access_revision from public.du_management_revisions')).rows,[{projects_revision:3,portfolio_revision:1,access_revision:1}]);
 await db.exec('begin;insert into public.projects values(1);rollback;');assert.equal((await db.query<{n:number}>('select projects_revision as n from public.du_management_revisions')).rows[0].n,3);
 await db.exec('set role authenticated');assert.equal((await db.query('select * from public.du_management_revisions')).rows.length,1);await assert.rejects(db.exec('update public.du_management_revisions set projects_revision=100'));await db.exec('reset role');
 }finally{await db.close();}
});
test('shared bundle commits content, metrics and status together; an invalid status rolls everything back',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create type public.project_status as enum('active','pending','alert','finished');
 create table public.projects(id uuid primary key, visual_metrics jsonb default '{}',manual_status public.project_status);
 create table public.bundle_payloads(payload jsonb);
 create function public.save_project_bundle(payload jsonb) returns uuid language plpgsql as $$begin insert into public.bundle_payloads values(payload);insert into public.projects(id)values('00000000-0000-4000-8000-000000000001');return '00000000-0000-4000-8000-000000000001'::uuid;end;$$;
 create function public.set_project_manual_status(target_project uuid,requested_status public.project_status) returns void language sql as $$update public.projects set manual_status=requested_status where id=target_project;$$;`);
 await db.exec(sql);
 await assert.rejects(db.query('select public.du_save_project_bundle($1::jsonb)',[JSON.stringify({project:{name:'No debe quedar parcial',visualMetrics:{ddjj:80},manualStatus:'invalid'}})]));
 assert.equal((await db.query<{n:number}>('select count(*)::integer as n from public.bundle_payloads')).rows[0].n,0);assert.equal((await db.query<{n:number}>('select count(*)::integer as n from public.projects')).rows[0].n,0);
 await db.query('select public.du_save_project_bundle($1::jsonb)',[JSON.stringify({project:{name:'Guardado completo',visualMetrics:{ddjj:80},manualStatus:'finished'}})]);
 assert.deepEqual((await db.query('select visual_metrics,manual_status from public.projects')).rows,[{visual_metrics:{ddjj:80},manual_status:'finished'}]);
 const f=(await db.query<{prosecdef:boolean}>('select prosecdef from pg_proc where proname=\'du_save_project_bundle\'')).rows[0];assert.equal(f.prosecdef,false);
 assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.du_save_project_bundle(jsonb)','execute') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
