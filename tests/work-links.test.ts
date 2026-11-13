import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {seed} from '../shared/seed.ts';import {execute,publicState} from '../shared/domain.ts';import {deletionPlan} from '../shared/deletion.ts';import {selectTasks,emptyTaskFilters} from '../shared/views.ts';import {workLabel,taskDescription,workAncestors,workDescendants,workSnapshotRows,workExportRows,validateWorkGraph} from '../shared/work.ts';import {stateDelta} from '../server/relational.ts';import {api} from '../server/api.ts';import type {State,Row} from '../shared/model.ts';
import {cleanView} from '../shared/saved-views.ts';
const now=new Date('2026-10-21T15:00:00Z'),week='2026-10-19';
function call(s:State,kind:string,data:Record<string,any>,id?:string,actor='persona05'){return execute(s,actor,{id:crypto.randomUUID(),kind,entity:'tasks',entityId:id,expectedVersion:id?s.data.tasks.find(row=>row.id===id)?.version:undefined,data},now);}
function create(s:State,title:string,data:Record<string,any>={},actor='persona05'){const result=call(s,'create',{title,ownerId:'persona05',...data},undefined,actor);return {s:result.state,id:result.result.id as string};}
const task=(s:State,id:string)=>s.data.tasks.find(row=>row.id===id)!;
const update=(s:State,id:string,data:Record<string,any>,actor='persona05')=>call(s,'update',{reason:'Organizar el trabajo',...data},id,actor).state;
const transition=(s:State,id:string,status:string,actor='persona05')=>call(s,'transition_task',{status,note:'Resultado revisado',reason:'Revisión acordada'},id,actor).state;
function linked(){let {s,id:parent}=create(seed(now),'Preparar el informe');let next=create(s,'Relevar datos',{parentTaskId:parent});s=next.s;const child=next.id;next=create(s,'Publicar informe',{dependsOnIds:[child]});return {s:next.s,parent,child,dependent:next.id};}

test('La clasificación retirada no puede crearse ni editarse, incluso desde clientes anteriores',()=>{
 const s=seed(now),id=s.data.tasks[0].id,before=JSON.stringify(s);
 assert.throws(()=>create(s,'Clasificación retirada',{workType:'story'}),/ya no está disponible/);
 assert.throws(()=>update(s,id,{workType:'story'}),/ya no está disponible/);
 for(const key of ['storyRole','storyGoal','storyBenefit','acceptanceCriteria'])assert.throws(()=>update(s,id,{[key]:'Dato'}),/ya no está disponible/);
 assert.equal(JSON.stringify(s),before);assert.equal(task(create(s,'Tarea compatible',{workType:'task'}).s,s.data.tasks[0].id).id,id);
});
test('Un registro anterior se ve como tarea y conserva texto, identidad, vínculos e historial al editarlo',()=>{
 const {s,parent,child}=linked(),r=task(s,parent),commitments=structuredClone(s.data.commitments);
 Object.assign(r,{workType:'story',description:'Introducción',storyRole:'Referente',storyGoal:'consultar datos',storyBenefit:'preparar el informe',acceptanceCriteria:'a'.repeat(12000)});
 const original=structuredClone(r),text=taskDescription(r);assert.equal(workLabel(r),'Tarea');assert.match(text,/Destinatario: Referente/);assert.ok(text.includes('a'.repeat(12000)));assert.equal(taskDescription({...r,description:text}),text);
 const next=update(s,parent,{title:'Informe actualizado'});assert.equal(task(next,parent).id,parent);assert.equal(task(next,child).parentTaskId,parent);assert.equal(task(next,parent).workType,undefined);assert.equal(task(next,parent).description,text);assert.equal(task(next,parent).storyRole,undefined);assert.deepEqual(next.data.commitments,commitments);assert.deepEqual(task(s,parent),original);
 const event=[...next.audit].reverse().find(e=>e.entityId===parent)!;assert.ok(event.before&&event.after);assert.equal(event.before.workType,'story');assert.equal(event.after.workType,undefined);assert.equal(event.before.acceptanceCriteria,original.acceptanceCriteria);
 const revised=update(next,parent,{description:'Descripción revisada'});assert.equal(taskDescription(task(revised,parent)),'Descripción revisada');const exported=workExportRows([original])[0];assert.equal(exported.tipo,'Tarea');assert.equal(exported.description,text);assert.equal('workType'in exported,false);assert.equal('storyRole'in exported,false);
});
test('Las vistas guardadas anteriores descartan el tipo retirado y conservan el resto de los filtros',()=>{
 const filters={...emptyTaskFilters(),workType:'story',q:'informe',relationship:'children'},view=cleanView({page:'Tareas',taskFilters:filters});assert.equal('workType'in view.taskFilters,false);assert.equal(view.taskFilters.q,'informe');assert.equal(view.taskFilters.relationship,'children');
 const {s,parent}=linked();Object.assign(task(s,parent),{workType:'story',storyRole:'Persona destinataria'});assert.equal(selectTasks(s,{...emptyTaskFilters(),...{workType:'story'}},'2026-10-21').length,selectTasks(s,emptyTaskFilters(),'2026-10-21').length);
});
test('Los vínculos padre se recorren en ambos sentidos, sin límite de profundidad, y heredan proyecto',()=>{
 let {s,id:root}=create(seed(now),'Raíz',{projectId:'p1'});const a=create(s,'Hija',{parentTaskId:root});s=a.s;const b=create(s,'Nieta',{parentTaskId:a.id});s=b.s;assert.equal(task(s,a.id).projectId,'p1');assert.deepEqual(workAncestors(s.data.tasks,task(s,b.id)).map(row=>row.id),[root,a.id]);assert.deepEqual(workDescendants(s.data.tasks,root).map(row=>row.id),[a.id,b.id]);
 assert.throws(()=>create(s,'Incompatible',{parentTaskId:root,projectId:'p2'}),/hereda/);
 const deep:Row[]=Array.from({length:2500},(_,i)=>({id:String(i),version:1,title:'T'+i,parentTaskId:i?String(i-1):null}));validateWorkGraph(deep);assert.equal(workAncestors(deep,deep.at(-1)!).length,2499);
});
test('Reintentar el alta de una subtarea con proyecto heredado es idempotente y no modifica la solicitud',()=>{
 const {s,id:parent}=create(seed(now),'Padre con proyecto',{projectId:'p1'}),command={id:crypto.randomUUID(),kind:'create',entity:'tasks' as const,data:{title:'Hija heredada',ownerId:'persona05',parentTaskId:parent}},original=JSON.stringify(command),first=execute(s,'persona05',command,now),retry=execute(first.state,'persona05',command,now);
 assert.equal(JSON.stringify(command),original);assert.equal(retry.state.revision,first.state.revision);assert.equal(retry.state.data.tasks.length,first.state.data.tasks.length);assert.equal(task(retry.state,first.result.id).projectId,'p1');
});
test('No se admiten auto referencias, padres inexistentes ni ciclos puros o combinados de jerarquía y dependencia',()=>{
 const {s,parent,child,dependent}=linked(),before=JSON.stringify(s);
 for(const [id,data,pattern]of [[parent,{parentTaskId:parent},/propio padre/],[child,{dependsOnIds:[child]},/sí mismo/],[parent,{parentTaskId:child},/ciclo/],[child,{dependsOnIds:[parent]},/ciclo/],[child,{dependsOnIds:[dependent]},/ciclo/],[parent,{dependsOnIds:['missing']},/disponible/],[child,{parentTaskId:'missing'},/existe/]] as const)assert.throws(()=>update(s,id,data),pattern);
 assert.equal(JSON.stringify(s),before);
});
test('Las dependencias habilitan el inicio y el cierre; cancelar no equivale a terminar',()=>{
 let {s,child,dependent}=linked();assert.throws(()=>transition(s,dependent,'En curso'),/dependencias pendientes/);assert.throws(()=>transition(s,dependent,'Terminada'),/Primero debe terminar/);
 s=transition(s,child,'Cancelada');assert.throws(()=>transition(s,dependent,'Terminada'),/cancelada/);s=transition(s,child,'Pendiente');s=transition(s,child,'Terminada');s=transition(s,dependent,'En curso');s=transition(s,dependent,'Terminada');assert.equal(task(s,dependent).status,'Terminada');assert.throws(()=>transition(s,child,'En curso'),/Reabrí primero/);
});
test('Cerrar, validar y reabrir respetan subtareas y las operaciones en grupo no evitan la regla',()=>{
 let {s,parent,child}=linked();assert.throws(()=>transition(s,parent,'Terminada'),/Falta resolver/);
 s=update(s,parent,{requiresValidation:true,validatorId:'persona01'});s=transition(s,parent,'En curso');assert.throws(()=>transition(s,parent,'Para validar'),/Falta resolver/);s=transition(s,child,'Terminada');s=transition(s,parent,'Para validar');s=transition(s,parent,'Terminada','persona01');assert.throws(()=>transition(s,child,'En curso'),/Reabrí primero/);s=transition(s,parent,'En curso');s=transition(s,child,'En curso');assert.equal(task(s,parent).status,'En curso');
 const bulk=call(s,'bulk_tasks',{taskIds:[parent,child],versions:Object.fromEntries(s.data.tasks.map(row=>[row.id,row.version])),status:'Terminada',note:'Revisión'});assert.equal(bulk.result.results[0].ok,false);assert.equal(bulk.result.results[1].ok,true);
});
test('Los compromisos semanales son avances de tareas y subtareas, conservan fechas y no completan el trabajo',()=>{
 let {s,parent,child}=linked();s=call(s,'upsert_commitment',{taskId:parent,weekId:week,result:'Dejar validados los datos de dos áreas',targetDate:'2026-10-23'}).state;const c=s.data.commitments.at(-1)!;
 s=execute(s,'persona05',{id:crypto.randomUUID(),kind:'update_commitment',entityId:c.id,expectedVersion:c.version,data:{outcome:'Cumplido',outcomeNote:'Dos áreas revisadas'}},now).state;assert.equal(task(s,parent).status,'Pendiente');assert.equal(task(s,child).status,'Pendiente');assert.equal(s.data.commitments.at(-1)!.outcome,'Cumplido');
 s=call(s,'confirm_plan',{weekId:week,ownerId:'persona05'}).state;const snapshot=s.snapshots.at(-1)!,content=JSON.stringify(snapshot);assert.ok(snapshot.payload.tasks.some((row:Row)=>row.id===child));s=update(s,child,{title:'Título posterior'});assert.equal(JSON.stringify(s.snapshots.at(-1)),content);assert.equal(workSnapshotRows(s.data.tasks,[parent]).some(row=>row.id===child),true);
});
test('Cambiar el proyecto de una rama traslada las subtareas atómicamente sin cambiar responsables',()=>{
 let {s,parent,child}=linked();s=update(s,parent,{projectId:'p1'});assert.equal(task(s,child).projectId,'p1');assert.equal(task(s,child).ownerId,'persona05');assert.throws(()=>update(s,child,{projectId:'p2'}),/hereda/);assert.equal(task(s,child).projectId,'p1');
 // Another owner on an independent child cannot silently be moved by the parent owner.
 s=call(s,'reassign_task',{ownerId:'persona02',reason:'Redistribuir'},child,'persona01').state;s=update(s,parent,{projectId:null},'persona01');assert.throws(()=>update(s,parent,{projectId:'p1'}),/permiso para mover/);assert.equal(task(s,child).projectId,null);
});
test('Vincular no concede permiso de edición sobre un padre ni una dependencia de otra persona',()=>{
 const {s,parent,child}=linked();const assigned=call(s,'reassign_task',{ownerId:'persona02',reason:'Distribuir'},parent,'persona01').state;
 assert.throws(()=>update(assigned,parent,{description:'Cambiar tarea ajena'}),/No podés modificar/);const next=update(assigned,child,{description:'Mi propio trabajo'});assert.equal(task(next,parent).ownerId,'persona02');
});
test('Papelera retira vínculos sin eliminar otros trabajos; restaurar y purgar conservan referencias coherentes',()=>{
 let {s,parent,child,dependent}=linked();const beforeChildren=s.data.tasks.length,impact=deletionPlan(s,'tasks',child);s=call(s,'delete',{reason:'Retirar tarea',confirmDeletion:true,impactKey:impact.key},child).state;assert.equal(s.data.tasks.length,beforeChildren);assert.deepEqual(task(s,dependent).dependsOnIds,[]);assert.equal(task(s,parent).deletedAt,undefined);assert.equal(task(s,dependent).removedDependencyTitles.length,1);
 s=call(s,'restore_deleted',{reason:'Recuperar tarea'},child).state;assert.deepEqual(task(s,dependent).dependsOnIds,[child]);assert.equal(task(s,child).parentTaskId,parent);
 s=call(s,'delete',{reason:'Retirar padre',confirmDeletion:true,impactKey:deletionPlan(s,'tasks',parent).key},parent).state;assert.equal(task(s,child).parentTaskId,null);assert.equal(task(s,child).deletedParentTitle,'Preparar el informe');s=call(s,'purge_deleted',{reason:'Borrar padre',confirmPermanentDeletion:true},parent).state;assert.equal(s.data.tasks.some(row=>row.id===parent),false);validateWorkGraph(publicState(s,'persona05').data.tasks);assert.ok(task(s,child));
});
test('Recuperar un trabajo con un padre o dependencia ya eliminado conserva el registro sin enlaces rotos',()=>{
 let {s,parent,child,dependent}=linked();for(const id of [child,parent])s=call(s,'delete',{reason:'Reorganizar',confirmDeletion:true,impactKey:deletionPlan(s,'tasks',id).key},id).state;
 s=call(s,'restore_deleted',{reason:'Recuperar hijo'},child).state;assert.equal(task(s,child).parentTaskId,null);assert.equal(task(s,child).deletedParentTitle,'Preparar el informe');validateWorkGraph(publicState(s,'persona05').data.tasks);
 s=call(s,'delete',{reason:'Reorganizar',confirmDeletion:true,impactKey:deletionPlan(s,'tasks',dependent).key},dependent).state;s=call(s,'delete',{reason:'Reorganizar',confirmDeletion:true,impactKey:deletionPlan(s,'tasks',child).key},child).state;s=call(s,'restore_deleted',{reason:'Recuperar dependiente'},dependent).state;assert.deepEqual(task(s,dependent).dependsOnIds,[]);validateWorkGraph(publicState(s,'persona05').data.tasks);
});
test('Una reapertura en grupo informa por registro si una dependencia o un padre ya está terminado',()=>{
 let {s,parent,child,dependent}=linked();s=transition(s,child,'Terminada');s=transition(s,parent,'Terminada');s=transition(s,dependent,'Terminada');const result=call(s,'bulk_tasks',{taskIds:[child,parent],versions:Object.fromEntries(s.data.tasks.map(row=>[row.id,row.version])),status:'En curso',note:'Reabrir'});assert.equal(result.result.results[0].ok,false);assert.match(result.result.results[0].error,/Reabrí primero/);assert.equal(result.result.results[1].ok,true);assert.equal(task(result.state,child).status,'Terminada');
});
test('Filtros, búsqueda por padre y exportaciones conservan los vínculos y clasifican tareas antiguas',()=>{
 const {s,parent,child,dependent}=linked(),filters=emptyTaskFilters();assert.equal(selectTasks(s,{...filters,...{workType:'story'}},'2026-10-21').length,selectTasks(s,filters,'2026-10-21').length);assert.ok(selectTasks(s,{...filters,relationship:'children'},'2026-10-21').some(row=>row.id===child));assert.deepEqual(selectTasks(s,{...filters,relationship:'blocked'},'2026-10-21').map(row=>row.id),[dependent]);assert.ok(selectTasks(s,{...filters,q:'Preparar el informe'},'2026-10-21').some(row=>row.id===child));const row=workExportRows(s.data.tasks).find(row=>row.id===dependent)!;assert.match(row.dependeDe,/Relevar datos/);assert.equal(workExportRows(s.data.tasks).find(row=>row.id===child)!.trabajoPadre.includes('Preparar el informe'),true);
});
test('La API acepta los nuevos filtros y rechaza valores desconocidos sin modificar datos',async()=>{
 const {s}=linked(),store={load:async()=>s,create:async()=>{},save:async()=>true,records:async()=>{throw Error('Los filtros vinculados deben usar el grafo completo en el servidor');}};for(const filters of [{workType:'story',relationship:'children'},{relationship:'children'},{relationship:'blocked'}]){const response=await api(new Request('https://du.test/api/records?entity=tasks&filters='+encodeURIComponent(JSON.stringify(filters)),{headers:{cookie:'du_demo_actor=persona05'}}),store,s.workspaceId);assert.equal(response.status,200);assert.ok((await response.json() as any).total>0);}const bad=await api(new Request('https://du.test/api/records?entity=tasks&filters='+encodeURIComponent(JSON.stringify({relationship:'unknown'}))),store,s.workspaceId);assert.equal(bad.status,400);
});
test('Postgres: la estructura existente conserva vínculos, CAS y permisos privados sin migrar datos',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;grant usage on schema public to anon,authenticated,service_role,supabase_auth_admin;');await db.exec(await readFile('supabase/schemas/du_equipo.sql','utf8'));
  let {s,parent,child,dependent}=linked();s.accessMode='institutional';s.data.members.forEach(row=>row.authUserId='test-'+row.id);await db.query('insert into public.du_workspaces(id,revision,payload)values($1,$2,$3)',[s.workspaceId,s.revision,s]);await db.exec('begin;'+await readFile('deploy/du-relational-migration.sql','utf8')+'commit;');
  const next=update(s,child,{description:'Descripción conservada',referenceUrl:'https://example.edu/reporte',areaIds:['universidad','ueicee'],panelPriority:true}),delta=stateDelta(s,next),values=Object.values(delta),query='select public.du_commit_state('+values.map((_,i)=>'$'+(i+1)).join(',')+') ok';assert.equal((await db.query<{ok:boolean}>(query,values)).rows[0].ok,true);assert.equal((await db.query<{ok:boolean}>(query,values)).rows[0].ok,false);
  const read=(await db.query<{v:State}>('select public.du_read_state($1)v',[s.workspaceId])).rows[0].v;assert.equal(task(read,child).parentTaskId,parent);assert.equal(task(read,child).referenceUrl,'https://example.edu/reporte');assert.equal(task(read,child).areaId,'universidad');assert.deepEqual(task(read,child).areaIds,['universidad','ueicee']);assert.equal(task(read,child).assignmentMode,'area');assert.equal(task(read,child).panelPriority,true);assert.deepEqual(task(read,dependent).dependsOnIds,[child]);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from public.du_tasks'),/permission denied/);await assert.rejects(()=>db.query('select public.du_list_records($1,$2,$3,$4)',[s.workspaceId,'tasks',{},'2026-10-21']),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
