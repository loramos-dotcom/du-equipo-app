import test from 'node:test';
import assert from 'node:assert/strict';
import {execute} from '../shared/domain.ts';
import {seed} from '../shared/seed.ts';
import {taskAreaMembers,taskAreaIds} from '../shared/task-assignment.ts';
import {panelPriority} from '../shared/task-priority.ts';
import {isTaskContentCommand} from '../server/relational.ts';
import type {State} from '../shared/model.ts';

const now=new Date('2026-10-21T15:00:00Z');
function create(state:State,data:Record<string,any>,actor='persona05'){
 const next=execute(state,actor,{id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title:'Tarea de prueba',ownerId:'persona05',...data}},now);
 return {state:next.state,row:next.state.data.tasks.find(row=>row.id===next.result.id)!};
}
function update(state:State,id:string,data:Record<string,any>,actor='persona05'){
 return execute(state,actor,{id:crypto.randomUUID(),kind:'update',entity:'tasks',entityId:id,expectedVersion:state.data.tasks.find(row=>row.id===id)!.version,data},now).state;
}
test('El enlace es opcional, persiste, se puede quitar y sólo admite HTTP/HTTPS sin credenciales',()=>{
 const noLink=create(seed(now),{});assert.equal(noLink.row.referenceUrl,undefined);
 const linked=create(noLink.state,{referenceUrl:' https://example.edu/reporte?q=datos#avance '});assert.equal(linked.row.referenceUrl,'https://example.edu/reporte?q=datos#avance');
 for(const referenceUrl of ['javascript:alert(1)','https://user:private@example.edu','sin protocolo',{}])assert.throws(()=>create(seed(now),{referenceUrl}),/enlace|URL/);
 const cleared=update(linked.state,linked.row.id,{referenceUrl:''});assert.equal(cleared.data.tasks.find(row=>row.id===linked.row.id)!.referenceUrl,'');
});
test('Las áreas son opcionales, admiten varias y conservan el vínculo anterior',()=>{
 const state=seed(now);assert.deepEqual(taskAreaMembers(state,'universidad','2026-10-21'),['persona05']);
 const assigned=create(state,{assignmentMode:'area',areaId:'universidad'});assert.equal(assigned.row.areaId,'universidad');assert.equal(assigned.row.ownerId,'persona05');
 assert.deepEqual(create(state,{}).row.areaIds,[]);
 assert.deepEqual(create(state,{areaIds:['sspie','universidad','sspie']}).row.areaIds,['sspie','universidad']);
 state.data.areas.find(area=>area.id==='universidad')!.substitutes=['persona06'];assert.deepEqual(taskAreaMembers(state,'universidad','2026-10-21'),['persona05','persona06']);
 const substitute=create(state,{assignmentMode:'area',areaId:'universidad',ownerId:'persona06'},'persona01');assert.equal(substitute.row.ownerId,'persona06');
 assert.throws(()=>create(state,{assignmentMode:'area',areaId:'universidad',ownerId:'persona06'}),/asigna inicialmente a vos/);
 const individual=update(assigned.state,assigned.row.id,{assignmentMode:'individual'});assert.equal(individual.data.tasks.find(row=>row.id===assigned.row.id)!.areaId,null);
});
test('La asignación conserva permisos de proyecto y no pierde áreas históricas al cambiar el referente',()=>{
 const state=seed(now);
 assert.throws(()=>create(state,{assignmentMode:'area',areaId:'sspie',ownerId:'persona04',projectId:'p1'},'persona01'),/participar del proyecto/);
 const assigned=create(state,{assignmentMode:'area',areaId:'universidad',projectId:'p1'});
 assigned.state.data.areas.find(area=>area.id==='universidad')!.leadId='persona06';
 const revised=update(assigned.state,assigned.row.id,{description:'Seguimiento histórico',reason:'Actualizar seguimiento'});assert.equal(revised.data.tasks.find(row=>row.id===assigned.row.id)!.areaId,'universidad');
 const moved=execute(revised,'persona01',{id:crypto.randomUUID(),kind:'reassign_task',entityId:assigned.row.id,expectedVersion:revised.data.tasks.find(row=>row.id===assigned.row.id)!.version,data:{ownerId:'persona01',reason:'Nueva responsabilidad'}},now).state;
 assert.deepEqual(moved.data.tasks.find(row=>row.id===assigned.row.id)!.areaIds,['universidad']);
});
test('Editar la ficha conserva hitos y dependencias existentes aunque ya no se ofrezcan en el alta',()=>{
 const state=seed(now);state.data.milestones.push({id:'h-existing',version:1,projectId:'p1',title:'Entregable'});
 const created=create(state,{projectId:'p1',milestoneId:'h-existing',dependsOnIds:['t2']});
 const revised=update(created.state,created.row.id,{title:'Título actualizado',referenceUrl:'https://example.edu/avance'}),row=revised.data.tasks.find(row=>row.id===created.row.id)!;
 assert.equal(row.milestoneId,'h-existing');assert.deepEqual(row.dependsOnIds,['t2']);
});
test('La banderita permite priorizar y despriorizar, persiste y respeta los permisos',()=>{
 const baseCommand={id:'priority-test',kind:'update',entity:'tasks',entityId:'t1',expectedVersion:1};assert.equal(isTaskContentCommand({...baseCommand,data:{priority:'Alta'}}),false);assert.equal(isTaskContentCommand({...baseCommand,data:{title:'Nuevo título'}}),true);
 const created=create(seed(now),{}),week='2026-10-19';assert.equal(panelPriority(created.row,created.state,week),false);
 let state=update(created.state,created.row.id,{panelPriority:true});assert.equal(panelPriority(state.data.tasks.find(row=>row.id===created.row.id)!,state,week),true);
 state.data.commitments.push({id:'priority-week',version:1,weekId:week,taskId:created.row.id,isPriority:true});
 state=update(state,created.row.id,{panelPriority:false});assert.equal(panelPriority(state.data.tasks.find(row=>row.id===created.row.id)!,state,week),false);
 assert.throws(()=>update(state,created.row.id,{panelPriority:true},'persona06'),/No podés modificar/);
 assert.throws(()=>update(state,created.row.id,{panelPriority:'si'}),/marcada o desmarcada/);
 state=update(state,created.row.id,{priority:'Alta'});assert.equal(state.data.tasks.find(row=>row.id===created.row.id)!.panelPriority,undefined);assert.equal(panelPriority(state.data.tasks.find(row=>row.id===created.row.id)!,state,week),true);
});
test('El responsable queda excluido de colaboradores al crear, editar y reasignar tareas',()=>{
 const created=create(seed(now),{projectId:'p1',collaborators:['persona05','persona01','persona01','persona02']},'persona01');assert.deepEqual(created.row.collaborators,['persona01','persona02']);
 let state=update(created.state,created.row.id,{collaborators:['persona05','persona02','persona02']});assert.deepEqual(state.data.tasks.find(row=>row.id===created.row.id)!.collaborators,['persona02']);
 state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'reassign_task',entityId:created.row.id,expectedVersion:state.data.tasks.find(row=>row.id===created.row.id)!.version,data:{ownerId:'persona02',reason:'Nueva responsabilidad'}},now).state;
 const row=state.data.tasks.find(row=>row.id===created.row.id)!;assert.equal(row.ownerId,'persona02');assert.deepEqual(row.collaborators,[]);
});
test('Las recurrencias y sus tareas generadas también excluyen a la persona responsable',()=>{
 const recurrence=execute(seed(now),'persona01',{id:crypto.randomUUID(),kind:'create',entity:'recurrences',data:{title:'Revisión recurrente',ownerId:'persona05',collaborators:['persona05','persona01','persona01'],frequency:'Semanal',weekday:3,startsOn:'2026-10-19'}},now);
 const template=recurrence.state.data.recurrences.find(row=>row.id===recurrence.result.id)!;assert.deepEqual(template.collaborators,['persona01']);
 // A legacy template must also generate tasks without repeating its owner.
 template.collaborators=['persona05','persona01'];
 const generated=execute(recurrence.state,'persona01',{id:crypto.randomUUID(),kind:'generate_occurrences'},now).state;
 const rows=generated.data.tasks.filter(row=>row.recurrenceId===template.id);assert.ok(rows.length>0);assert.ok(rows.every(row=>row.ownerId==='persona05'&&JSON.stringify(row.collaborators)===JSON.stringify(['persona01'])));
});

test('Crear, editar, quitar y reasignar conserva todas las áreas y los permisos de responsable',()=>{
 const created=create(seed(now),{areaIds:['universidad','ueicee'],projectId:'p1',ownerId:'persona05'},'persona01');assert.deepEqual(created.row.areaIds,['universidad','ueicee']);assert.equal(created.row.areaId,'universidad');assert.equal(created.row.ownerId,'persona05');
 let state=update(created.state,created.row.id,{areaIds:['sstedu','ueicee']});assert.deepEqual(state.data.tasks.find(row=>row.id===created.row.id)!.areaIds,['sstedu','ueicee']);assert.equal(state.data.tasks.find(row=>row.id===created.row.id)!.ownerId,'persona05');
 state=update(state,created.row.id,{areaIds:[]});assert.deepEqual(state.data.tasks.find(row=>row.id===created.row.id)!.areaIds,[]);assert.equal(state.data.tasks.find(row=>row.id===created.row.id)!.areaId,null);
 assert.throws(()=>create(seed(now),{areaIds:['no-existe']}),/registro no existe/);assert.throws(()=>create(seed(now),{areaIds:'universidad'}),/debe ser una lista/);
 assert.throws(()=>create(seed(now),{areaIds:['ueicee'],ownerId:'persona06'}),/asigna inicialmente a vos/);
 const original=seed(now);original.data.areas.find(area=>area.id==='ueicee')!.active=false;assert.throws(()=>create(original,{areaIds:['ueicee']}),/no está activa/);
 assert.deepEqual(taskAreaIds({id:'old',version:1,areaId:'universidad'}),['universidad']);
});
