import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute} from '../shared/domain.ts';
import {taskExecution} from '../shared/task-assignment.ts';
import {stateDelta,isTaskContentCommand} from '../server/relational.ts';
import {api} from '../server/api.ts';
import type {State,Row} from '../shared/model.ts';
const now=new Date('2026-10-21T15:00:00Z');
function command(state:State,kind:string,data:Record<string,any>,entity?:any,id?:string,actor='persona05'){
 return execute(state,actor,{id:crypto.randomUUID(),kind,data,entity,entityId:id,expectedVersion:id?state.data[entity??'tasks'].find((row:Row)=>row.id===id)?.version:undefined},now);
}
function create(state=seed(now),extra:Record<string,any>={}){
 const result=command(state,'create',{title:'Revisar entrega de prueba',ownerId:'persona05',projectId:'p1',...extra},'tasks');
 return {...result,row:result.state.data.tasks.find(row=>row.id===result.result.id)!};
}
function update(state:State,id:string,data:Record<string,any>,actor='persona05'){return command(state,'update',{reason:'Precisar quién ejecuta',...data},'tasks',id,actor).state;}
test('Las tareas anteriores mantienen su referente y no deducen ejecución a partir de las áreas',()=>{
 const task={id:'legacy',version:1,ownerId:'persona05',assignmentMode:'area',areaIds:['universidad']},before=structuredClone(task);
 assert.deepEqual(taskExecution(task),{type:'unspecified',areaId:null});assert.deepEqual(task,before);
 const made=create();assert.equal(made.row.executionType,undefined);assert.equal(made.row.ownerId,'persona05');
});
test('La ejecución del área se guarda aparte de la cartera y conserva el seguimiento DU',()=>{
 const made=create(seed(now),{executionType:'area',executionAreaId:'sstedu',areaIds:['universidad']});
 assert.deepEqual(taskExecution(made.row),{type:'area',areaId:'sstedu'});assert.equal(made.row.ownerId,'persona05');assert.deepEqual(made.row.areaIds,['universidad']);
 const du=update(made.state,made.row.id,{executionType:'du'}),row=du.data.tasks.find(row=>row.id===made.row.id)!;
 assert.deepEqual(taskExecution(row),{type:'du',areaId:null});assert.equal(row.executionAreaId,null);assert.equal(row.ownerId,'persona05');assert.deepEqual(row.areaIds,['universidad']);
 const event=du.audit.at(-1)!;assert.equal(event.before?.executionType,'area');assert.equal(event.after?.executionType,'du');
});
test('Ejecutores inválidos, áreas ausentes o inactivas y ediciones sin permiso no guardan cambios',()=>{
 const state=seed(now),before=structuredClone(state);
 for(const data of [{executionType:'invalid'},{executionType:null},{executionType:'area'},{executionType:'area',executionAreaId:'missing'},{executionType:'area',executionAreaId:['sstedu']}])assert.throws(()=>create(state,data));
 const inactive=structuredClone(state);inactive.data.areas.find(area=>area.id==='sstedu')!.active=false;
 assert.throws(()=>create(inactive,{executionType:'area',executionAreaId:'sstedu'}),/no está activa/);
 const made=create(state,{executionType:'area',executionAreaId:'sstedu'}),snapshot=structuredClone(made.state);
 assert.throws(()=>update(made.state,made.row.id,{executionType:'du'},'persona06'),/No podés modificar/);
 assert.deepEqual(made.state,snapshot);assert.deepEqual(state,before);
});
test('Reasignar transfiere el seguimiento y conserva quién ejecuta y las versiones cerradas',()=>{
 let state=update(seed(now),'t1',{executionType:'area',executionAreaId:'sstedu'});
 state=command(state,'close_week',{weekId:'2026-10-19',allowMissing:true,reason:'Cierre de prueba'},'weeks','2026-10-19','persona01').state;
 const frozen=structuredClone(state.snapshots),closed=frozen.find(snapshot=>snapshot.kind==='week')!.payload;
 assert.equal(closed.tasks.find((task:Row)=>task.id==='t1').executionAreaId,'sstedu');
 const next=command(state,'reassign_task',{ownerId:'persona02',reason:'Transferir el seguimiento'},'tasks','t1','persona01').state,row=next.data.tasks.find(task=>task.id==='t1')!;
 assert.equal(row.ownerId,'persona02');assert.equal(row.executionAreaId,'sstedu');assert.equal(row.executionType,'area');assert.deepEqual(next.snapshots,frozen);
});
test('Cambiar quién ejecuta exige versión vigente, motivo y resolver antes una validación pendiente',()=>{
 const made=create(seed(now),{executionType:'du'});
 assert.throws(()=>command(made.state,'update',{executionType:'area',executionAreaId:'sstedu'},'tasks',made.row.id),/motivo/i);
 assert.throws(()=>execute(made.state,'persona05',{id:crypto.randomUUID(),kind:'update',entity:'tasks',entityId:made.row.id,expectedVersion:999,data:{executionType:'area',executionAreaId:'sstedu',reason:'Cambio'}},now),/actualiz|cambi|versión/i);
 const validating=structuredClone(made.state);validating.data.tasks.find(row=>row.id===made.row.id)!.status='Para validar';
 assert.throws(()=>update(validating,made.row.id,{executionType:'area',executionAreaId:'sstedu'}),/En curso/);
});
test('Las tareas creadas desde una decisión y una recurrencia conservan la ejecución explícita',()=>{
 const state=seed(now),decision=command(state,'record_decision',{meetingId:'m1',text:'Revisar entrega de prueba',ownerId:'persona05',followUpDate:'2026-10-23',action:'create_task',taskTitle:'Entrega acordada',projectId:'p1',executionType:'area',executionAreaId:'sstedu'},undefined,undefined,'persona01').state;
 assert.equal(decision.data.tasks.find(task=>task.title==='Entrega acordada')!.executionAreaId,'sstedu');
 const recurrence=command(state,'create',{title:'Entrega periódica',projectId:'p1',ownerId:'persona05',frequency:'Semanal',weekday:4,startsOn:'2026-10-19',executionType:'area',executionAreaId:'sstedu'},'recurrences');
 const generated=command(recurrence.state,'generate_occurrences',{},undefined,undefined,'persona01').state,rows=generated.data.tasks.filter(task=>task.recurrenceId===recurrence.result.id);
 assert.ok(rows.length>0);assert.ok(rows.every(task=>task.executionType==='area'&&task.executionAreaId==='sstedu'&&task.ownerId==='persona05'));
});
test('La persistencia incluye la responsabilidad en el registro y no usa el atajo de edición de texto',()=>{
 const before=seed(now),after=update(before,'t1',{executionType:'area',executionAreaId:'sstedu'}),delta=stateDelta(before,after);
 const row=delta.p_changes.tasks.find(change=>change.id==='t1').record;assert.equal(row.executionType,'area');assert.equal(row.executionAreaId,'sstedu');
 assert.equal(isTaskContentCommand({id:'operation',kind:'update',entity:'tasks',entityId:'t1',expectedVersion:1,data:{executionType:'area',executionAreaId:'sstedu'}}),false);
});
test('Un fallo de persistencia no guarda sólo una parte de la responsabilidad',async()=>{
 let state=seed(now);const before=structuredClone(state),store={load:async()=>structuredClone(state),create:async()=>{},save:async()=>false};
 const response=await api(new Request('http://local/api/command',{method:'POST',headers:{'content-type':'application/json',cookie:'du_demo_actor=persona05'},body:JSON.stringify({id:'failed-role',kind:'update',entity:'tasks',entityId:'t1',expectedVersion:state.data.tasks.find(task=>task.id==='t1')!.version,data:{executionType:'area',executionAreaId:'sstedu',reason:'Actualizar ejecución'}})}),store,'demo');
 assert.equal(response.status,409);assert.deepEqual(state,before);
});
