import {readFile,mkdir,writeFile}from'node:fs/promises';import{resolve,relative,isAbsolute}from'node:path';import{PGlite}from'@electric-sql/pglite';
import{decryptBackup}from'../server/backups.ts';import{collections}from'../shared/model.ts';
// This command has no production connection parameter. Recovery is always rehearsed locally first.
const args=process.argv.slice(2),option=(key:string)=>args[args.indexOf(key)+1];
if(!args.includes('--backup')||!args.includes('--key'))throw Error('Uso: node --experimental-strip-types scripts/restore-backup.ts --backup ARCHIVO --key CLAVE --output .data/restauracion/ENSAYO');
const root=resolve('.data/restauracion'),target=resolve(option('--output')||'.data/restauracion/'+Date.now()),rel=relative(root,target);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('La restauración debe usar una carpeta nueva dentro de .data/restauracion.');
const started=performance.now(),state=decryptBackup(await readFile(resolve(option('--backup'))),await readFile(resolve(option('--key')),'utf8'));
await mkdir(root,{recursive:true});await mkdir(target,{recursive:false});const db=new PGlite(resolve(target,'postgres'));
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;grant usage on schema public to anon,authenticated,service_role,supabase_auth_admin;');await db.exec(await readFile('supabase/schemas/du_equipo.sql','utf8'));
 await db.query('insert into public.du_workspaces(id,revision,payload)values($1,$2,$3)',[state.workspaceId,state.revision,{...state,accessMode:'institutional'}]);await db.exec('begin;'+await readFile('deploy/du-relational-migration.sql','utf8')+'commit;');
 await db.exec(await readFile('deploy/du-issue-visibility.sql','utf8'));
 await db.exec(await readFile('deploy/du-calendar.sql','utf8'));
 const restored=(await db.query<{v:any}>('select public.du_read_state($1)v',[state.workspaceId])).rows[0].v;
 const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 const canonical=(rows:any[])=>JSON.stringify(stable([...rows].sort((a,b)=>a.id.localeCompare(b.id))));for(const collection of collections)if(canonical(restored.data[collection])!==canonical(state.data[collection]??[]))throw Error('Los registros recuperados no coinciden: '+collection);
 if(canonical(restored.audit)!==canonical(state.audit)||canonical(restored.snapshots)!==canonical(state.snapshots))throw Error('El historial o las versiones recuperadas no coinciden.');
 await db.exec('set role authenticated');let denied=false;try{await db.query('select * from public.du_tasks');}catch{denied=true;}if(!denied)throw Error('El acceso directo a datos no quedó protegido.');await db.exec('reset role');
 const report={status:'Ensayo de restauración aislada verificado',at:new Date().toISOString(),workspaceId:state.workspaceId,revision:state.revision,seconds:(performance.now()-started)/1000,counts:Object.fromEntries(collections.map(c=>[c,restored.data[c].length])),audit:restored.audit.length,snapshots:restored.snapshots.length,productionModified:false,authProviderRestored:false};await writeFile(resolve(target,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.close();}
