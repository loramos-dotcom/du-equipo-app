import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute,publicState} from '../shared/domain.ts';
import {deletionImpactKey,deletionPlan} from '../shared/deletion.ts';
import {homeWork} from '../shared/home.ts';
import {api} from '../server/api.ts';
import type {State,Command,Collection} from '../shared/model.ts';
import type {Deletable} from '../shared/deletion.ts';
const now=new Date('2026-10-19T15:00:00Z'),week='2026-10-19';
const make=()=>seed(now);
function call(s:State,actor:string,kind:string,entity?:Collection,id?:string,data:Record<string,any>={}){return execute(s,actor,{id:crypto.randomUUID(),kind,entity,entityId:id,expectedVersion:id&&entity?s.data[entity].find(r=>r.id===id)?.version:undefined,data},now);}
function deletion(s:State,entity:Deletable,id:string):Command{return {id:crypto.randomUUID(),kind:'delete',entity,entityId:id,expectedVersion:s.data[entity].find(r=>r.id===id)!.version,data:{reason:'x',confirmDeletion:true,impactKey:deletionPlan(s,entity,id).key}};}
const restore=(s:State,entity:Deletable,id:string,actor='persona05')=>call(s,actor,'restore_deleted',entity,id,{reason:'x'}).state;
const purge=(s:State,entity:Deletable,id:string):Command=>({id:crypto.randomUUID(),kind:'purge_deleted',entity,entityId:id,expectedVersion:s.data[entity].find(r=>r.id===id)?.version,data:{reason:'x',confirmPermanentDeletion:true}});

function issueFixture(){
 let s=make();const created=call(s,'persona05','create','issues',undefined,{title:'Incidencia eliminable',type:'Bloqueo',taskId:'t1',ownerId:'persona05',impact:'x',nextAction:'x',followUpDate:week,requestIntervention:true,interventionRequest:'Pedido eliminable',interventionNeededBy:week});s=created.state;
 const id=created.result.id,requestId=created.result.interventionId;s=call(s,'persona05','create','comments',undefined,{targetType:'issues',targetId:id,body:'Comentario de incidencia'}).state;s=call(s,'persona01','create','comments',undefined,{targetType:'interventions',targetId:requestId,body:'Comentario del pedido'}).state;s=call(s,'persona05','create','links',undefined,{targetType:'interventions',targetId:requestId,title:'x',url:'https://example.edu/evidence'}).state;
 return {s,id,requestId};
}

test('Eliminar una incidencia quita sus pedidos, comentarios, enlaces y avisos sin modificar el trabajo vinculado',()=>{
 const {s,id,requestId}=issueFixture(),tasks=structuredClone(s.data.tasks),projects=structuredClone(s.data.projects),command=deletion(publicState(s,'persona05'),'issues',id),next=execute(s,'persona05',command,now).state,visible=publicState(next,'persona05');
 assert.ok(!visible.data.issues.some(i=>i.id===id));assert.ok(!visible.data.interventions.some(i=>i.id===requestId));for(const c of ['comments','links','notifications'] as const)assert.ok(!visible.data[c].some(r=>r.targetId===id||r.targetId===requestId));
 assert.deepEqual(next.data.tasks,tasks);assert.deepEqual(next.data.projects,projects);assert.ok(visible.trash!.some(r=>r.entity==='issues'&&r.id===id));assert.ok(!visible.trash!.some(r=>r.id===requestId));assert.ok(next.audit.some(e=>e.entityId===id&&e.action==='eliminar'));assert.equal(execute(next,'persona05',command,now).state.revision,next.revision);
 const restored=restore(JSON.parse(JSON.stringify(next)),'issues',id);assert.equal(restored.data.issues.find(i=>i.id===id)!.taskId,'t1');assert.ok(publicState(restored,'persona05').data.interventions.some(i=>i.id===requestId));assert.ok(publicState(restored,'persona01').data.notifications.some(n=>n.targetId===requestId));assert.equal(restored.data.comments.filter(c=>c.targetId===requestId).length,1);
});

test('Eliminar, recuperar y purgar incidencias exige al responsable o Coordinación; ser referente del proyecto no alcanza',()=>{
 const {s,id}=issueFixture();s.data.issues.find(i=>i.id===id)!.ownerId='persona06';s.data.issues.find(i=>i.id===id)!.projectId='p1';s.data.issues.find(i=>i.id===id)!.taskId=null;
 const command=deletion(s,'issues',id);assert.throws(()=>execute(s,'persona05',command,now),/responsable/);const deleted=execute(s,'persona06',command,now).state;
 assert.ok(!publicState(deleted,'persona05').trash!.some(i=>i.id===id));assert.throws(()=>restore(deleted,'issues',id,'persona05'),/permiso/);assert.throws(()=>execute(deleted,'persona05',purge(deleted,'issues',id),now),/permiso/);assert.ok(restore(deleted,'issues',id,'persona02').data.issues.some(i=>i.id===id&&!i.deletedAt));assert.ok(execute(deleted,'persona06',purge(deleted,'issues',id),now).result.purged);
});

test('Una intervención modificada invalida la confirmación de eliminación sin guardar un conjunto parcial',()=>{
 const {s,id,requestId}=issueFixture(),command=deletion(publicState(s,'persona05'),'issues',id),changed=call(s,'persona01','intervention_status','interventions',requestId,{status:'Tomada',nextAction:'x'}).state,before=structuredClone(changed);
 assert.throws(()=>execute(changed,'persona05',command,now),/vínculos/);assert.deepEqual(changed,before);assert.ok(!changed.data.issues.find(i=>i.id===id)!.deletedAt);
});

test('Recuperar una incidencia cuyo trabajo fue eliminado o purgado conserva el título sin crear vínculos rotos',()=>{
 const f=issueFixture();let s=execute(f.s,'persona05',deletion(f.s,'issues',f.id),now).state;s=execute(s,'persona05',deletion(s,'tasks','t1'),now).state;s=execute(s,'persona05',purge(s,'tasks','t1'),now).state;
 s=restore(JSON.parse(JSON.stringify(s)),'issues',f.id);const issue=s.data.issues.find(i=>i.id===f.id)!;assert.equal(issue.taskId,null);assert.ok(issue.deletedTaskTitle);assert.equal(issue.status,'Abierta');assert.ok(publicState(s,'persona05').data.interventions.some(i=>i.id===f.requestId));assert.doesNotThrow(()=>call(s,'persona05','update','issues',f.id,{title:'Seguimiento independiente'}));
 const projectIssue=call(make(),'persona05','create','issues',undefined,{title:'x',type:'Bloqueo',projectId:'p1',ownerId:'persona05',impact:'x',nextAction:'x',followUpDate:week});let p=execute(projectIssue.state,'persona05',deletion(projectIssue.state,'issues',projectIssue.result.id),now).state;p=execute(p,'persona05',deletion(p,'projects','p1'),now).state;p=restore(p,'issues',projectIssue.result.id);assert.equal(p.data.issues.find(i=>i.id===projectIssue.result.id)!.projectId,null);assert.ok(p.data.issues.find(i=>i.id===projectIssue.result.id)!.deletedProjectTitle);
});

test('La eliminación y el borrado definitivo de una incidencia conservan las semanas cerradas y las minutas',()=>{
 const f=issueFixture();let s=call(f.s,'persona01','close_week','weeks',week,{weekId:week,allowMissing:true,reason:'x'}).state;s=call(s,'persona01','close_meeting','meetings','m1',{minutes:'x'}).state;const snapshots=structuredClone(s.snapshots),tasks=structuredClone(s.data.tasks);
 s=execute(s,'persona05',deletion(s,'issues',f.id),now).state;s=execute(s,'persona05',purge(s,'issues',f.id),now).state;assert.ok(!s.data.issues.some(i=>i.id===f.id));assert.ok(!s.data.interventions.some(i=>i.id===f.requestId));assert.ok(!Object.values(s.data).flat().some(r=>r.targetId===f.id||r.targetId===f.requestId));assert.deepEqual(s.snapshots,snapshots);assert.deepEqual(s.data.tasks,tasks);assert.throws(()=>restore(s,'issues',f.id),/Papelera/);assert.ok(s.audit.some(e=>e.entityId===f.id&&e.action==='eliminar definitivamente'));
});

test('Incidencias abiertas, resueltas o descartadas se pueden eliminar y recuperar con su estado original',()=>{
 for(const status of ['Abierta','En tratamiento','Resuelta','Descartada']){const {s,id}=issueFixture();s.data.issues.find(i=>i.id===id)!.status=status;const deleted=execute(s,'persona05',deletion(s,'issues',id),now).state;assert.equal(restore(deleted,'issues',id).data.issues.find(i=>i.id===id)!.status,status);assert.throws(()=>call(deleted,'persona05','issue_status','issues',id,{status:'Resuelta',note:'x'}),/no existe|disponible/);}
});

test('Fallo de persistencia al eliminar una incidencia conserva también sus pedidos y acepta reintento sin duplicar',async()=>{
 const f=issueFixture();let stored=f.s,failSave=true;const before=structuredClone(stored),command=deletion(publicState(stored,'persona05'),'issues',f.id),store={async load(){return structuredClone(stored);},async create(){throw Error('No create');},async save(_key:string,revision:number,next:State){if(failSave)throw Error('storage');if(revision!==stored.revision)return false;stored=JSON.parse(JSON.stringify(next));return true;}};
 const request=()=>new Request('http://localhost/api/command',{method:'POST',headers:{'content-type':'application/json',cookie:'du_demo_actor=persona05'},body:JSON.stringify(command)});assert.equal((await api(request(),store,'test')).status,500);assert.deepEqual(stored,before);failSave=false;assert.equal((await api(request(),store,'test')).status,200);assert.ok(stored.data.interventions.find(i=>i.id===f.requestId)!.deletedAt);const revision=stored.revision;assert.equal((await api(request(),store,'test')).status,200);assert.equal(stored.revision,revision);
});

test('Borrar definitivamente una tarea retira su conjunto de Papelera, impide recuperarla y conserva auditoría e historia cerrada',()=>{
 let s=call(make(),'persona05','create','comments',undefined,{targetType:'tasks',targetId:'t1',body:'x'}).state;s=call(s,'persona05','create','links',undefined,{targetType:'tasks',targetId:'t1',title:'x',url:'https://example.edu/x'}).state;
 s=call(s,'persona01','close_week','weeks',week,{weekId:week,allowMissing:true,reason:'x'}).state;s=execute(s,'persona05',deletion(s,'tasks','t1'),now).state;
 const snapshots=structuredClone(s.snapshots),batch=s.data.tasks.find(t=>t.id==='t1')!.deletionId,removed=Object.values(s.data).flat().filter(r=>r.deletionId===batch),command=purge(s,'tasks','t1'),next=execute(s,'persona05',command,now);
 assert.ok(removed.length>2);assert.equal(next.result.purged,true);assert.equal(next.result.removed,removed.length);assert.ok(!Object.values(next.state.data).flat().some(r=>r.deletionId===batch));assert.ok(!publicState(next.state,'persona05').trash!.some(r=>r.id==='t1'));
 assert.equal(next.state.audit.filter(e=>e.operationId===command.id&&e.action==='eliminar definitivamente').length,removed.length);assert.ok(next.state.audit.filter(e=>e.operationId===command.id).every(e=>e.before&&e.after===null&&e.reason==='x'));assert.deepEqual(next.state.snapshots,snapshots);assert.ok(next.state.data.tasks.some(t=>t.id==='t2'));assert.throws(()=>restore(next.state,'tasks','t1'),/Papelera/);
 assert.equal(execute(next.state,'persona05',command,now).state.revision,next.state.revision);assert.ok(s.data.tasks.some(t=>t.id==='t1'));
});

test('Borrar definitivamente un proyecto elimina sus hitos pero conserva las tareas independientes y las incidencias',()=>{
 let s=call(make(),'persona05','create','milestones',undefined,{title:'x',criteria:'x',projectId:'p1',ownerType:'du',ownerId:'persona05',dueDate:week}).state;const milestoneId=s.data.milestones.at(-1)!.id;
 s=execute(s,'persona05',deletion(s,'projects','p1'),now).state;const tasks=structuredClone(s.data.tasks),issues=structuredClone(s.data.issues),next=execute(s,'persona05',purge(s,'projects','p1'),now).state;
 assert.ok(!next.data.projects.some(p=>p.id==='p1'));assert.ok(!next.data.milestones.some(m=>m.id===milestoneId));assert.deepEqual(next.data.tasks,tasks);assert.deepEqual(next.data.issues,issues);assert.throws(()=>restore(next,'projects','p1'),/Papelera/);
});

test('El borrado definitivo exige permiso vigente, motivo, confirmación explícita, versión actual y un registro de Papelera',()=>{
 const s=execute(make(),'persona05',deletion(make(),'tasks','t1'),now).state,command=purge(s,'tasks','t1'),before=structuredClone(s);
 assert.throws(()=>execute(s,'persona06',command,now),/permiso/);assert.throws(()=>execute(s,'persona05',{...command,expectedVersion:1},now),/cambió/);assert.throws(()=>execute(s,'persona05',{...command,data:{reason:'x'}},now),/Confirmá/);assert.throws(()=>execute(s,'persona05',{...command,data:{reason:' ',confirmPermanentDeletion:true}},now),/completá/);
 assert.throws(()=>execute(s,'persona05',{...command,entity:'members'},now),/Solo/);assert.throws(()=>execute(make(),'persona05',purge(make(),'tasks','t1'),now),/Papelera/);assert.deepEqual(s,before);
 const restored=restore(s,'tasks','t1');assert.throws(()=>execute(restored,'persona05',command,now),/Papelera/);assert.ok(execute(s,'persona02',command,now).result.purged);
});

test('Perder el rol de Coordinación no habilita borrar definitivamente registros ajenos eliminados antes',()=>{
 const made=call(make(),'persona01','create','tasks',undefined,{title:'x',ownerId:'persona02'});let s=execute(made.state,'persona01',deletion(made.state,'tasks',made.result.id),now).state;s.data.members.find(m=>m.id==='persona01')!.role='Integrante';assert.throws(()=>execute(s,'persona01',purge(s,'tasks',made.result.id),now),/permiso/);
});

test('Los códigos de tarea no se reutilizan después del borrado definitivo ni al cargar el estado desde JSON',()=>{
 const made=call(make(),'persona05','create','tasks',undefined,{title:'x',ownerId:'persona05'}),row=made.state.data.tasks.find(t=>t.id===made.result.id)!;let s=execute(made.state,'persona05',deletion(made.state,'tasks',row.id),now).state;s=execute(s,'persona05',purge(s,'tasks',row.id),now).state;
 const next=call(JSON.parse(JSON.stringify(s)),'persona05','create','tasks',undefined,{title:'y',ownerId:'persona05'});assert.ok(Number(next.state.data.tasks.find(t=>t.id===next.result.id)!.code.slice(1))>Number(row.code.slice(1)));
});

test('Una ocurrencia borrada definitivamente no reaparece al regenerar su rutina',()=>{
 let s=call(make(),'persona01','create','recurrences',undefined,{title:'x',ownerId:'persona01',frequency:'Semanal',weekday:1,startsOn:week,active:true}).state;s=call(s,'persona01','generate_occurrences').state;const row=s.data.tasks.find(t=>t.recurrenceId)!;
 s=execute(s,'persona01',deletion(s,'tasks',row.id),now).state;s=execute(s,'persona01',purge(s,'tasks',row.id),now).state;s=call(JSON.parse(JSON.stringify(s)),'persona01','generate_occurrences').state;assert.ok(!s.data.tasks.some(t=>t.recurrenceId===row.recurrenceId&&t.occurrenceDate===row.occurrenceDate));assert.ok(s.data.tasks.some(t=>t.recurrenceId===row.recurrenceId&&t.occurrenceDate!==row.occurrenceDate));
});

test('Fallo o conflicto de persistencia no confirma el borrado definitivo; el reintento guardado es idempotente',async()=>{
 let stored=execute(make(),'persona05',deletion(make(),'tasks','t1'),now).state,saveMode='fail';const before=structuredClone(stored),command=purge(stored,'tasks','t1');
 const store={async load(){return structuredClone(stored);},async create(){throw Error('No create');},async save(_key:string,revision:number,next:State){if(saveMode==='fail')throw Error('storage');if(saveMode==='conflict'||revision!==stored.revision)return false;stored=JSON.parse(JSON.stringify(next));return true;}};
 const request=()=>new Request('http://localhost/api/command',{method:'POST',headers:{'content-type':'application/json',cookie:'du_demo_actor=persona05'},body:JSON.stringify(command)});
 assert.equal((await api(request(),store,'test')).status,500);assert.deepEqual(stored,before);saveMode='conflict';assert.equal((await api(request(),store,'test')).status,409);assert.deepEqual(stored,before);saveMode='ok';assert.equal((await api(request(),store,'test')).status,200);assert.ok(!stored.data.tasks.some(t=>t.id==='t1'));const revision=stored.revision,audit=stored.audit.length;assert.equal((await api(request(),store,'test')).status,200);assert.equal(stored.revision,revision);assert.equal(stored.audit.length,audit);
});

test('La confirmación del integrante acepta una tarea enviada a validar con avisos privados para el validador',()=>{
 let s=make();s=call(s,'persona05','transition_task','tasks','t2',{status:'En curso',note:'x'}).state;s=call(s,'persona05','transition_task','tasks','t2',{status:'Para validar',note:'x'}).state;
 assert.ok(s.data.notifications.some(n=>n.targetId==='t2'&&n.ownerId==='persona01'));
 const client=publicState(s,'persona05'),command=deletion(client,'tasks','t2');assert.ok(!client.data.notifications.some(n=>n.ownerId==='persona01'));
 const next=execute(s,'persona05',command,now).state;assert.ok(next.data.tasks.find(t=>t.id==='t2')!.deletedAt);assert.ok(!publicState(next,'persona01').data.notifications.some(n=>n.targetId==='t2'));
});
test('Leer o generar un aviso privado no invalida una eliminación; los avisos también se recuperan',()=>{
 let s=make();const created=call(s,'persona01','create','tasks',undefined,{title:'x',ownerId:'persona05'});s=created.state;const id=created.result.id,command=deletion(publicState(s,'persona01'),'tasks',id),notice=s.data.notifications.find(n=>n.targetId===id)!;
 s=call(s,'persona05','read_notification','notifications',notice.id).state;s=execute(s,'persona01',command,now).state;assert.ok(!publicState(s,'persona05').data.notifications.some(n=>n.id===notice.id));
 s=restore(s,'tasks',id,'persona01');assert.equal(s.data.notifications.find(n=>n.id===notice.id)!.read,true);
});
test('Una confirmación abierta en la versión anterior sigue funcionando aunque incluyera avisos propios',()=>{
 const created=call(make(),'persona05','create','tasks',undefined,{title:'x',ownerId:'persona05'}),s=created.state,id=created.result.id,client=publicState(s,'persona05'),plan=deletionPlan(client,'tasks',id),legacy=JSON.stringify([...plan.removed.map(r=>[r.entity,r.row.id,r.row.version]),...plan.detached.map(r=>[r.entity,r.id,r.version-1])].reverse()),command=deletion(client,'tasks',id);command.data!.impactKey=legacy;
 assert.ok(plan.removed.some(r=>r.entity==='notifications'));assert.ok(execute(s,'persona05',command,now).state.data.tasks.find(t=>t.id===id)!.deletedAt);
 assert.equal(deletionImpactKey('invalid'),null);assert.equal(deletionImpactKey('[[]]'),null);assert.equal(deletionImpactKey(JSON.stringify([['tasks','t1','1']])),null);assert.throws(()=>execute(s,'persona05',{...command,id:crypto.randomUUID(),data:{...command.data,impactKey:'[]'}},now),/vínculos/);
});

test('Eliminar tarea activa la quita de todo el trabajo operativo, conserva la auditoría y admite reintentos',()=>{
 const s=make(),command=deletion(s,'tasks','t1'),next=execute(s,'persona05',command,now).state,visible=publicState(next,'persona05');
 assert.ok(next.data.tasks.find(t=>t.id==='t1')!.deletedAt);assert.ok(!visible.data.tasks.some(t=>t.id==='t1'));assert.ok(!visible.data.commitments.some(c=>c.taskId==='t1'));assert.ok(!homeWork(visible,'persona05',week).tasks.some(t=>t.id==='t1'));
 assert.ok(visible.trash!.some(t=>t.id==='t1'));const event=next.audit.find(e=>e.entityId==='t1'&&e.action==='eliminar')!;assert.equal(event.actorId,'persona05');assert.equal(event.reason,'x');assert.equal(event.before!.deletedAt,undefined);assert.ok(event.after!.deletedAt);
 assert.equal(execute(next,'persona05',command,now).state.revision,next.revision);assert.equal(s.data.tasks.find(t=>t.id==='t1')!.deletedAt,undefined);
 const recovered=restore(JSON.parse(JSON.stringify(next)),'tasks','t1');assert.equal(recovered.data.tasks.find(t=>t.id==='t1')!.deletedAt,undefined);assert.ok(publicState(recovered,'persona05').data.commitments.some(c=>c.taskId==='t1'));assert.ok(recovered.audit.some(e=>e.entityId==='t1'&&e.action==='restaurar'));
});
test('Eliminar y recuperar exigen responsabilidad o Coordinación, incluso por API directa',()=>{
 let s=make();const made=call(s,'persona01','create','tasks',undefined,{title:'x',ownerId:'persona01'});s=made.state;const id=made.result.id;
 assert.throws(()=>execute(s,'persona05',deletion(s,'tasks',id),now),/responsable|referente/);s=execute(s,'persona01',deletion(s,'tasks',id),now).state;
 assert.ok(!publicState(s,'persona05').trash!.some(r=>r.id===id));assert.ok(publicState(s,'persona01').trash!.some(r=>r.id===id));assert.throws(()=>restore(s,'tasks',id),/permiso/);
 assert.ok(restore(s,'tasks',id,'persona02').data.tasks.find(r=>r.id===id&&!r.deletedAt));
});
test('La eliminación rechaza confirmación ausente, versiones viejas y vínculos cambiados sin guardar una parte',()=>{
 const s=make(),before=structuredClone(s),cmd=deletion(s,'tasks','t1');assert.throws(()=>execute(s,'persona05',{...cmd,data:{...cmd.data,confirmDeletion:false}},now),/Confirmá/);assert.throws(()=>execute(s,'persona05',{...cmd,expectedVersion:99},now),/cambió/);
 s.data.commitments.find(c=>c.taskId==='t1')!.version++;assert.throws(()=>execute(s,'persona05',cmd,now),/vínculos/);assert.equal(s.audit.length,0);assert.equal(s.data.tasks[0].deletedAt,undefined);assert.deepEqual(s.snapshots,before.snapshots);
});
test('Eliminar proyecto conserva tareas independientes, incidencias, pedidos y acuerdos utilizables',()=>{
 let s=make();const original=structuredClone(s.data.tasks.filter(t=>t.projectId==='p1'));
 s=call(s,'persona05','create','issues',undefined,{title:'x',type:'Bloqueo',projectId:'p1',ownerId:'persona05',impact:'x',nextAction:'x',followUpDate:week,requestIntervention:true,interventionRequest:'x',interventionNeededBy:week}).state;
 const issueId=s.data.issues.at(-1)!.id,requestId=s.data.interventions.at(-1)!.id;s=execute(s,'persona05',deletion(s,'projects','p1'),now).state;
 const visible=publicState(s,'persona05');assert.ok(!visible.data.projects.some(p=>p.id==='p1'));for(const t of original){const current=visible.data.tasks.find(r=>r.id===t.id)!;assert.equal(current.projectId,null);assert.equal(current.title,t.title);assert.equal(current.ownerId,t.ownerId);assert.equal(current.status,t.status);}
 assert.equal(visible.data.issues.find(i=>i.id===issueId)!.projectId,null);assert.equal(visible.data.interventions.find(i=>i.id===requestId)!.status,'Solicitada');assert.doesNotThrow(()=>call(s,'persona01','build_agenda','meetings','m1'));
 const recovered=restore(JSON.parse(JSON.stringify(s)),'projects','p1');for(const task of original)assert.equal(recovered.data.tasks.find(t=>t.id===task.id)!.projectId,'p1');assert.equal(recovered.data.issues.find(i=>i.id===issueId)!.projectId,'p1');
});
test('Recuperar un proyecto no sobreescribe cambios posteriores en sus tareas',()=>{
 let s=execute(make(),'persona05',deletion(make(),'projects','p1'),now).state;s=call(s,'persona05','update','tasks','t1',{title:'Texto posterior'}).state;
 const result=call(s,'persona05','restore_deleted','projects','p1',{reason:'x'});assert.ok(result.result.skipped>0);assert.equal(result.state.data.tasks.find(t=>t.id==='t1')!.projectId,null);assert.equal(result.state.data.tasks.find(t=>t.id==='t1')!.title,'Texto posterior');assert.equal(result.state.data.tasks.find(t=>t.id==='t2')!.projectId,'p1');
});
test('Las incidencias cuyo vínculo se eliminó se pueden seguir editando sin inventar otro vínculo',()=>{
 let s=make();const created=call(s,'persona05','create','issues',undefined,{title:'x',type:'Bloqueo',taskId:'t1',ownerId:'persona05',impact:'x',nextAction:'x',followUpDate:week});s=created.state;s=execute(s,'persona05',deletion(s,'tasks','t1'),now).state;s=call(s,'persona05','update','issues',created.result.id,{title:'y',taskId:null,projectId:null}).state;
 assert.equal(s.data.issues.find(i=>i.id===created.result.id)!.title,'y');assert.throws(()=>call(s,'persona05','create','issues',undefined,{title:'x',type:'Bloqueo',ownerId:'persona05',impact:'x',nextAction:'x',followUpDate:week,deletedTaskTitle:'Inventado'}),/Vinculá/);
});
test('Un excoordinador no recupera trabajo ajeno solo por haberlo eliminado antes',()=>{
 let s=make();const made=call(s,'persona01','create','tasks',undefined,{title:'x',ownerId:'persona02'});s=made.state;s=execute(s,'persona01',deletion(s,'tasks',made.result.id),now).state;s.data.members.find(m=>m.id==='persona01')!.role='Integrante';assert.ok(!publicState(s,'persona01').trash!.some(r=>r.id===made.result.id));assert.throws(()=>restore(s,'tasks',made.result.id,'persona01'),/permiso/);
});
test('La recuperación conserva hitos y no habilita enlaces a un proyecto todavía eliminado',()=>{
 let s=make();s=call(s,'persona05','create','milestones',undefined,{title:'x',criteria:'x',projectId:'p1',ownerType:'du',ownerId:'persona05',dueDate:week}).state;const milestone=s.data.milestones.at(-1)!;
 s=call(s,'persona05','update','tasks','t1',{milestoneId:milestone.id,reason:'x'}).state;s=execute(s,'persona05',deletion(s,'tasks','t1'),now).state;s=execute(s,'persona05',deletion(s,'projects','p1'),now).state;
 s=restore(s,'tasks','t1');const task=publicState(s,'persona05').data.tasks.find(t=>t.id==='t1')!;assert.equal(task.projectId,null);assert.equal(task.milestoneId,null);
 s=restore(s,'projects','p1');assert.ok(publicState(s,'persona05').data.milestones.some(m=>m.id===milestone.id));assert.equal(publicState(s,'persona05').data.tasks.find(t=>t.id==='t1')!.projectId,null);
});
test('Eliminar registros no reescribe semanas, planes ni minutas históricas',()=>{
 let s=make();s=call(s,'persona01','close_week','weeks',week,{weekId:week,allowMissing:true,reason:'x'}).state;s=call(s,'persona01','close_meeting','meetings','m1',{minutes:'x'}).state;const snapshots=structuredClone(s.snapshots);
 s=execute(s,'persona05',deletion(s,'tasks','t1'),now).state;s=execute(s,'persona05',deletion(s,'projects','p1'),now).state;assert.deepEqual(s.snapshots,snapshots);const visible=publicState(s,'persona05');assert.ok(homeWork(visible,'persona05',week).commitments.some(c=>c.task?.id==='t1'));assert.equal(s.data.meetings.find(m=>m.id==='m1')!.minutes,'x');
});
test('Los registros eliminados no se modifican ni generan avisos; los códigos de tarea no se reutilizan',()=>{
 let s=make();const last=s.data.tasks.at(-1)!,code=Number(last.code.slice(1));s=execute(s,'persona01',deletion(s,'tasks',last.id),now).state;
 assert.throws(()=>call(s,'persona01','update','tasks',last.id,{title:'Cambio'}),/no existe|disponible/);assert.throws(()=>call(s,'persona01','create','comments',undefined,{targetType:'tasks',targetId:last.id,body:'x'}),/no existe|disponible/);
 s=call(s,'persona01','generate_notifications').state;assert.ok(!publicState(s,'persona01').data.notifications.some(n=>n.targetType==='tasks'&&n.targetId===last.id));const created=call(s,'persona01','create','tasks',undefined,{title:'x',ownerId:'persona01'});assert.ok(Number(created.state.data.tasks.find(t=>t.id===created.result.id)!.code.slice(1))>code);
});
test('Una ocurrencia recurrente eliminada no reaparece al volver a generar la rutina',()=>{
 let s=call(make(),'persona01','create','recurrences',undefined,{title:'x',ownerId:'persona01',frequency:'Semanal',weekday:1,startsOn:week,active:true}).state;s=call(s,'persona01','generate_occurrences').state;const row=s.data.tasks.find(t=>t.recurrenceId)!;assert.ok(row);s=execute(s,'persona01',deletion(s,'tasks',row.id),now).state;s=call(s,'persona01','generate_occurrences').state;
 assert.equal(s.data.tasks.filter(t=>t.recurrenceId===row.recurrenceId&&t.occurrenceDate===row.occurrenceDate).length,1);assert.ok(!publicState(s,'persona01').data.tasks.some(t=>t.id===row.id));
});
test('Textos de un carácter o extensos se guardan completos sin mínimos ni máximos de caracteres',()=>{
 let s=make();const long='ñ'.repeat(50001);s=call(s,'persona05','create','tasks',undefined,{title:'x',description:long,ownerId:'persona05'}).state;const t=s.data.tasks.at(-1)!;assert.equal(t.description,long);
 s=call(s,'persona05','update','tasks',t.id,{title:'x'.repeat(3000),reason:'x'}).state;assert.equal(s.data.tasks.find(r=>r.id===t.id)!.title.length,3000);s=call(s,'persona05','create','comments',undefined,{targetType:'tasks',targetId:t.id,body:long}).state;assert.equal(s.data.comments.at(-1)!.body,long);
 s=call(s,'persona05','create','projects',undefined,{title:'x',outcome:'x',leadId:'persona05',scope:'du'}).state;assert.equal(s.data.projects.at(-1)!.outcome,'x');assert.throws(()=>call(s,'persona05','create','tasks',undefined,{title:' ',ownerId:'persona05'}),/completá/);
});
test('Un fallo de persistencia no confirma la eliminación; la exportación conserva Papelera y trazabilidad',async()=>{
 let stored=make(),writesFail=true;const store={async load(){return structuredClone(stored);},async create(){throw Error('No create');},async save(_key:string,revision:number,next:State){if(writesFail)throw Error('storage');if(revision!==stored.revision)return false;stored=JSON.parse(JSON.stringify(next));return true;}};
 const command=deletion(stored,'tasks','t1'),request=()=>new Request('http://localhost/api/command',{method:'POST',headers:{'content-type':'application/json',cookie:'du_demo_actor=persona05'},body:JSON.stringify(command)});
 assert.equal((await api(request(),store,'test')).status,500);assert.equal(stored.data.tasks.find(t=>t.id==='t1')!.deletedAt,undefined);writesFail=false;const response=await api(request(),store,'test');assert.equal(response.status,200);assert.ok(!(await response.json()).state.data.tasks.some((t:any)=>t.id==='t1'));
 const exported=await api(new Request('http://localhost/api/export?format=json'),store,'test'),backup=await exported.json();assert.ok(backup.data.tasks.find((t:any)=>t.id==='t1').deletedAt);assert.ok(backup.audit.some((e:any)=>e.action==='eliminar'));assert.ok(restore({...stored,data:backup.data,audit:backup.audit,snapshots:backup.snapshots},'tasks','t1'));
});
