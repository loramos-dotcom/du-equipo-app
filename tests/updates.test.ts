import {test} from 'node:test';
import assert from 'node:assert/strict';
import {institutionalState} from '../shared/team.ts';
import {execute,publicState} from '../shared/domain.ts';
import {deletionPlan} from '../shared/deletion.ts';
import {recordUpdates,updateDateTime} from '../shared/updates.ts';
import {api} from '../server/api.ts';
import type {State,Collection,Command} from '../shared/model.ts';
const now=new Date('2026-10-20T12:00:00Z');
function call(s:State,actor:string,kind:string,entity:Collection,data:Record<string,any>,entityId?:string,time=now){return execute(s,actor,{id:crypto.randomUUID(),kind,entity,entityId,expectedVersion:entityId?s.data[entity].find(r=>r.id===entityId)?.version:undefined,data},time);}
function fixture(){let state=institutionalState('updates',{persona01:'persona01@example.edu',persona02:'persona02@example.edu',persona05:'persona05@example.edu'},'persona01@example.edu');const p=call(state,'persona05','create','projects',{title:'Proyecto de prueba',outcome:'x',scope:'du',leadId:'persona05',members:['persona05','persona01']});state=p.state;const t=call(state,'persona05','create','tasks',{title:'Tarea de prueba',ownerId:'persona05',projectId:p.result.id});return {state:t.state,projectId:p.result.id,taskId:t.result.id};}
const post=(s:State,entity:'projects'|'tasks',id:string,body='x',actor='persona05')=>call(s,actor,'create','comments',{entryType:'update',targetType:entity,targetId:id,body});
const trash=(s:State,entity:'projects'|'tasks',id:string)=>call(s,'persona05','delete',entity,{reason:'x',confirmDeletion:true,impactKey:deletionPlan(s,entity,id).key},id).state;

test('Eliminar una actualización propia conserva contenido y autoría en auditoría sin cambiar la tarea o el proyecto',()=>{
 for(const entity of ['projects','tasks'] as const){const f=fixture(),made=post(f.state,entity,entity==='projects'?f.projectId:f.taskId,'**Texto original**'),entry=made.state.data.comments.at(-1)!,edited=call(made.state,'persona05','update','comments',{body:'__Texto corregido__'},entry.id).state,before=structuredClone(edited.data),removed=call(edited,'persona05','delete_update','comments',{reason:'x',confirmDeletion:true},entry.id).state;
 assert.equal(removed.data.comments.some(row=>row.id===entry.id),false);assert.equal(recordUpdates(publicState(removed,'persona05').data.comments,entity,entity==='projects'?f.projectId:f.taskId).length,0);
 const audit=removed.audit.find(row=>row.entityId===entry.id&&row.action==='eliminar actualización')!;assert.equal(audit.before?.body,'__Texto corregido__');assert.equal(audit.before?.previousVersions[0].body,'**Texto original**');assert.equal(audit.before?.authorName,'Persona 05');assert.equal(audit.actorId,'persona05');assert.equal(audit.after,null);
 for(const c of ['projects','tasks','weeks','plans','commitments'] as const)assert.deepEqual(removed.data[c],before[c]);}
});

test('Eliminar novedades exige autor con permiso vigente o Coordinación, versión, motivo y confirmación',()=>{
 const f=fixture(),made=post(f.state,'tasks',f.taskId),id=made.result.id;
 assert.throws(()=>call(made.state,'persona02','delete_update','comments',{reason:'x'},id),/Confirmá/);
 assert.throws(()=>call(made.state,'persona05','delete_update','comments',{reason:' ',confirmDeletion:true},id),/Motivo/);
 assert.ok(call(made.state,'persona01','delete_update','comments',{reason:'x',confirmDeletion:true},id).result.deleted);
 const other=post(made.state,'tasks',f.taskId,'Novedad de Coordinación','persona01');assert.throws(()=>call(other.state,'persona05','delete_update','comments',{reason:'x',confirmDeletion:true},other.result.id),/autor/);
 const ordinary=call(made.state,'persona05','create','comments',{targetType:'tasks',targetId:f.taskId,body:'Comentario'});assert.throws(()=>call(ordinary.state,'persona05','delete_update','comments',{reason:'x',confirmDeletion:true},ordinary.result.id),/no es una actualización/);
 assert.throws(()=>execute(made.state,'persona05',{id:crypto.randomUUID(),kind:'delete_update',entity:'comments',entityId:id,expectedVersion:0,data:{reason:'x',confirmDeletion:true}},now),/actualizó/);
 const independent=call(f.state,'persona05','create','tasks',{title:'Independiente',ownerId:'persona05'}),own=post(independent.state,'tasks',independent.result.id),moved=call(own.state,'persona01','reassign_task','tasks',{ownerId:'persona01',reason:'x'},independent.result.id).state;assert.throws(()=>call(moved,'persona05','delete_update','comments',{reason:'x',confirmDeletion:true},own.result.id),/permiso vigente/);
});

test('La eliminación de una novedad es idempotente y no se confirma ante fallos de persistencia',async()=>{
 const f=fixture(),made=post(f.state,'tasks',f.taskId),entry=made.state.data.comments.at(-1)!;let stored=made.state,failSave=true;stored.data.members.find(m=>m.id==='persona05')!.authUserId='verified-persona05';const before=structuredClone(stored),command:Command={id:crypto.randomUUID(),kind:'delete_update',entity:'comments',entityId:entry.id,expectedVersion:entry.version,data:{reason:'x',confirmDeletion:true}};
 const store={load:async()=>structuredClone(stored),create:async()=>{},save:async(_key:string,version:number,next:State)=>{if(failSave)throw Error('storage');if(version!==stored.revision)return false;stored=next;return true;}};
 const request=()=>api(new Request('https://du.example/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),store,'updates',{mode:'team',identity:{id:'verified-persona05',email:'persona05@example.edu',provider:'google',verified:true}});
 assert.equal((await request()).status,500);assert.deepEqual(stored,before);failSave=false;assert.equal((await request()).status,200);const revision=stored.revision;assert.equal((await request()).status,200);assert.equal(stored.revision,revision);assert.equal(stored.audit.filter(a=>a.action==='eliminar actualización').length,1);
});

test('Las actualizaciones de proyecto y tarea guardan autor y fecha reales sin modificar estado, revisión ni planificación',()=>{
 const f=fixture(),before=structuredClone(f.state.data);let s=f.state;
 for(const [entity,id] of [['projects',f.projectId],['tasks',f.taskId]] as const){const made=call(s,'persona05','create','comments',{entryType:'update',targetType:entity,targetId:id,body:'Se recibió el material.\nPróximo paso: revisarlo.',authorId:'persona01',authorName:'Inventado',createdAt:'2000-01-01T00:00:00Z'});s=made.state;const row=s.data.comments.find(c=>c.id===made.result.id)!;assert.equal(row.authorId,'persona05');assert.equal(row.authorName,'Persona 05');assert.equal(row.createdAt,now.toISOString());assert.ok(s.audit.some(a=>a.entityId===row.id&&a.actorId==='persona05'&&a.action==='crear'));}
 for(const entity of ['tasks','projects','commitments','plans','weeks'] as const)assert.deepEqual(s.data[entity],before[entity]);
});

test('Publicar novedades respeta los permisos vigentes de responsable, referente y Coordinación',()=>{
 const f=fixture(),p=call(f.state,'persona01','create','projects',{title:'Ajeno',outcome:'x',scope:'du',leadId:'persona01'}),t=call(p.state,'persona01','create','tasks',{title:'Ajena',ownerId:'persona01'});
 assert.throws(()=>post(t.state,'projects',p.result.id,'x','persona05'),/administra/);assert.throws(()=>post(t.state,'tasks',t.result.id,'x','persona05'),/administra/);assert.ok(post(t.state,'tasks',t.result.id,'x','persona01').result.id);assert.ok(post(t.state,'projects',p.result.id,'x','persona02').result.id);
 const led=call(t.state,'persona01','create','tasks',{title:'Delegada en mi proyecto',ownerId:'persona01',projectId:f.projectId});assert.ok(post(led.state,'tasks',led.result.id).result.id);
});

test('Solo el autor edita su novedad con versión vigente; conserva texto anterior, fecha original y nombre al publicarse',()=>{
 const f=fixture(),made=post(f.state,'tasks',f.taskId,'Primera versión'),row=made.state.data.comments.at(-1)!;assert.throws(()=>call(made.state,'persona01','update','comments',{body:'Otra persona'},row.id),/otra persona/);
 made.state.data.members.find(m=>m.id==='persona05')!.name='Nuevo nombre';const edited=call(made.state,'persona05','update','comments',{body:'Versión corregida'},row.id,new Date('2026-10-20T12:30:00Z')).state,current=edited.data.comments.find(c=>c.id===row.id)!;
 assert.equal(current.authorName,'Persona 05');assert.equal(current.createdAt,now.toISOString());assert.equal(current.updatedAt,'2026-10-20T12:30:00.000Z');assert.equal(current.previousVersions[0].body,'Primera versión');assert.equal(current.body,'Versión corregida');assert.equal(current.edited,true);
 assert.throws(()=>execute(edited,'persona05',{id:crypto.randomUUID(),kind:'update',entity:'comments',entityId:row.id,expectedVersion:row.version,data:{body:'Edición obsoleta'}},now),/actualizó/);
});

test('Una novedad no se traslada a otro registro ni cambia de tipo para eludir permisos; los comentarios siguen independientes',()=>{
 const f=fixture(),made=post(f.state,'tasks',f.taskId),id=made.result.id;
 assert.throws(()=>call(made.state,'persona05','update','comments',{targetType:'projects',targetId:f.projectId},id),/original/);assert.throws(()=>call(made.state,'persona05','update','comments',{entryType:'comment'},id),/tipo/);
 const ordinary=call(made.state,'persona05','create','comments',{targetType:'tasks',targetId:f.taskId,body:'Comentario habitual'});assert.throws(()=>call(ordinary.state,'persona05','update','comments',{entryType:'update'},ordinary.result.id),/tipo/);assert.equal(recordUpdates(ordinary.state.data.comments,'tasks',f.taskId).length,1);
 assert.throws(()=>call(f.state,'persona05','create','comments',{entryType:'update',targetType:'areas',targetId:'universidad',body:'x'}),/proyectos o tareas/);assert.throws(()=>call(f.state,'persona05','create','comments',{entryType:'inventado',targetType:'tasks',targetId:f.taskId,body:'x'}),/tipo/);
});

test('No se agregan novedades a registros archivados, eliminados o a trabajo que ya no administra el autor',()=>{
 const f=fixture(),made=post(f.state,'tasks',f.taskId),id=made.result.id,closed=call(made.state,'persona05','transition_task','tasks',{status:'Cancelada',note:'x'},f.taskId).state,archived=call(closed,'persona05','archive','tasks',{},f.taskId).state;assert.throws(()=>post(archived,'tasks',f.taskId),/archivado/);assert.throws(()=>call(archived,'persona05','update','comments',{body:'x'},id),/archivado/);
 const deleted=trash(made.state,'tasks',f.taskId);assert.throws(()=>post(deleted,'tasks',f.taskId),/no existe|disponible/);
 const independent=call(f.state,'persona05','create','tasks',{title:'Independiente',ownerId:'persona05'}),own=post(independent.state,'tasks',independent.result.id),reassigned=call(own.state,'persona01','reassign_task','tasks',{ownerId:'persona01',reason:'x'},independent.result.id).state;assert.throws(()=>call(reassigned,'persona05','update','comments',{body:'x'},own.result.id),/administra/);
});

test('Textos extensos y de un carácter se conservan completos; el listado ordena novedades y usa la hora de Buenos Aires',()=>{
 const f=fixture(),first=post(f.state,'tasks',f.taskId,'x'),long='ñ'.repeat(50001),second=post(first.state,'tasks',f.taskId,long),before=structuredClone(second.state.data.comments),rows=recordUpdates(second.state.data.comments,'tasks',f.taskId);
 assert.deepEqual(rows.map(r=>r.id),[second.result.id,first.result.id]);assert.equal(rows[0].body,long);assert.deepEqual(second.state.data.comments,before);assert.equal(recordUpdates(second.state.data.comments,'projects',f.projectId).length,0);assert.throws(()=>post(f.state,'tasks',f.taskId,' '),/completá/);assert.ok(updateDateTime(now.toISOString()).includes('09:00'));assert.equal(updateDateTime('inválida'),'Fecha no disponible');
});

test('Las novedades acompañan a sus tareas y proyectos en Papelera, recuperación y borrado definitivo',()=>{
 for(const entity of ['tasks','projects'] as const){const f=fixture(),id=entity==='tasks'?f.taskId:f.projectId,made=post(f.state,entity,id,'Texto que se conserva'),original=made.state.data.comments.at(-1)!,deleted=trash(made.state,entity,id);
  assert.equal(recordUpdates(publicState(deleted,'persona05').data.comments,entity,id).length,0);const restored=call(JSON.parse(JSON.stringify(deleted)),'persona05','restore_deleted',entity,{reason:'x'},id).state,row=recordUpdates(restored.data.comments,entity,id)[0];assert.equal(row.id,original.id);assert.equal(row.body,original.body);assert.equal(row.authorName,original.authorName);assert.equal(row.createdAt,original.createdAt);
  const purged=call(deleted,'persona05','purge_deleted',entity,{reason:'x',confirmPermanentDeletion:true},id).state;assert.ok(!purged.data.comments.some(c=>c.id===original.id));assert.ok(purged.audit.some(e=>e.entityId===original.id&&e.action==='eliminar definitivamente'));
 }
});

test('La API no confirma novedades ante fallo o conflicto de guardado, y el reintento no duplica ni cambia al autor',async()=>{
 const f=fixture();let stored=f.state,saveMode='fail';stored.data.members.find(m=>m.id==='persona05')!.authUserId='verified-persona05';const before=structuredClone(stored),command:Command={id:crypto.randomUUID(),kind:'create',entity:'comments',data:{entryType:'update',targetType:'tasks',targetId:f.taskId,body:'x'}};
 const store={async load(){return structuredClone(stored);},async create(){throw Error('No create');},async save(_key:string,revision:number,next:State){if(saveMode==='fail')throw Error('storage');if(saveMode==='conflict'||revision!==stored.revision)return false;stored=JSON.parse(JSON.stringify(next));return true;}};
 const request=()=>api(new Request('https://du.example/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),store,'updates',{mode:'team',identity:{id:'verified-persona05',email:'persona05@example.edu',provider:'google',verified:true}});
 assert.equal((await request()).status,500);assert.deepEqual(stored,before);saveMode='conflict';assert.equal((await request()).status,409);assert.deepEqual(stored,before);saveMode='ok';assert.equal((await request()).status,200);const revision=stored.revision;assert.equal((await request()).status,200);assert.equal(stored.revision,revision);assert.equal(recordUpdates(stored.data.comments,'tasks',f.taskId).length,1);assert.equal(stored.data.comments[0].authorId,'persona05');
});
