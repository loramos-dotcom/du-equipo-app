import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('prepared installation creates exact roster, no fictional work, and rejects overwrites',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;');
  const sql=await readFile(new URL('../deploy/du-equipo-inicial.sql',import.meta.url),'utf8');
  await db.exec(sql);
  const {rows}=await db.query<{members:number;areas:number;projects:number;tasks:number;audit:any}>('select jsonb_array_length(payload#>\'{data,members}\') as members,jsonb_array_length(payload#>\'{data,areas}\') as areas,jsonb_array_length(payload#>\'{data,projects}\') as projects,jsonb_array_length(payload#>\'{data,tasks}\') as tasks,payload->\'audit\' as audit from public.du_workspaces');
  assert.equal(rows[0].members,9);assert.equal(rows[0].areas,8);assert.equal(rows[0].projects,0);assert.equal(rows[0].tasks,0);assert.equal(rows[0].audit[0].actorEmail,'persona05@bue.edu.ar');assert.match(rows[0].audit[0].reason,/persona01@bue.edu.ar/);
  await assert.rejects(()=>db.exec(sql),/ya está instalado/);await db.exec('rollback');
  const count=await db.query<{n:number}>('select count(*)::int as n from public.du_workspaces');assert.equal(count.rows[0].n,1);
  const security=await db.query<{rls:boolean;anon:boolean;member:boolean}>("select c.relrowsecurity as rls,has_table_privilege('anon','public.du_workspaces','select') as anon,has_table_privilege('authenticated','public.du_workspaces','select') as member from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='du_workspaces'");assert.deepEqual(security.rows[0],{rls:true,anon:false,member:false});
 }finally{await db.close();}
});
