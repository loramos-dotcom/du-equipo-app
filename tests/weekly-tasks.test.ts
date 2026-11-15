import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute} from '../shared/domain.ts';
import {weeklyTasks} from '../shared/weekly-tasks.ts';
import type {State} from '../shared/model.ts';

const now=new Date('2026-11-15T15:00:00Z'),today='2026-11-15',week='2026-11-09',owner='persona05';
function fixture(){
 const s=seed(now);s.data.commitments=[];s.data.plans=[];s.snapshots=[];
 s.data.tasks=[
  {id:'priority',version:1,title:'Preparar informe',code:'T101',ownerId:owner,status:'Pendiente',panelPriority:true,priority:'Media'},
  {id:'normal',version:1,title:'Revisar documento',code:'T102',ownerId:owner,status:'En curso',priority:'Media'},
  {id:'other',version:1,title:'Trabajo de otra persona',ownerId:'persona06',status:'Pendiente',panelPriority:true},
  {id:'done',version:1,title:'Trabajo anterior',ownerId:owner,status:'Terminada',panelPriority:true,completedAt:'2026-11-02T15:00:00Z'},
  {id:'archived',version:1,title:'Trabajo archivado',ownerId:owner,status:'Pendiente',archived:true,panelPriority:true}
 ];return s;
}
function move(s:State,id:string,selected:boolean,actor=owner,weekId=week,extra:Record<string,any>={}){
 const t=s.data.tasks.find(t=>t.id===id)!,p=s.data.plans.find(p=>p.weekId===weekId&&p.ownerId===t.ownerId);
 return execute(s,actor,{id:crypto.randomUUID(),kind:'select_week_task',expectedVersion:t.version,data:{taskId:id,weekId,selected,planVersion:p?.version??null,...extra}},now).state;
}
test('Mi semana incluye prioridades propias por defecto; el resto queda abajo, sin modificar datos al consultar',()=>{
 const s=fixture(),before=structuredClone(s),board=weeklyTasks(s,week,owner,today);
 assert.deepEqual(board.selected.map(r=>r.task.id),['priority']);assert.deepEqual(board.rest.map(r=>r.task.id),['normal']);assert.deepEqual(s,before);
 s.data.tasks.find(t=>t.id==='normal')!.priority='Alta';assert.equal(weeklyTasks(s,week,owner,today).selected.length,2);
 s.data.tasks.find(t=>t.id==='normal')!.panelPriority=false;assert.equal(weeklyTasks(s,week,owner,today).rest.length,1);
});
test('Mover tareas persiste por semana, permite devolverlas y conserva la prioridad global y el estado de la tarea',()=>{
 let s=move(fixture(),'normal',true),task=structuredClone(s.data.tasks.find(t=>t.id==='normal'));
 assert.equal(weeklyTasks(s,week,owner,today).selected.length,2);assert.ok(s.audit.some(e=>e.entity==='plans'&&e.fields.includes('taskSelections')));
 assert.deepEqual(weeklyTasks(JSON.parse(JSON.stringify(s)),week,owner,today).selected.map(r=>r.task.id),['priority','normal']);
 assert.deepEqual(weeklyTasks(s,'2026-11-16',owner,today).selected.map(r=>r.task.id),['priority']);
 s=move(s,'normal',false);assert.deepEqual(s.data.tasks.find(t=>t.id==='normal'),task);assert.equal(weeklyTasks(s,week,owner,today).rest.length,1);
 s=move(s,'priority',false);assert.equal(weeklyTasks(s,week,owner,today).selected.length,0);assert.equal(s.data.tasks.find(t=>t.id==='priority')!.panelPriority,true);
 assert.equal(weeklyTasks(s,'2026-11-16',owner,today).selected.length,1);
});
test('No se puede mover trabajo ajeno, cerrado o archivado ni pisar un plan que cambió',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.throws(()=>move(s,'other',true),/propio trabajo/);
 assert.throws(()=>move(s,'normal',true,'persona01'),/Motivo/);
 assert.doesNotThrow(()=>move(s,'normal',true,'persona01',week,{reason:'Ajuste acordado con la persona responsable'}));
 assert.throws(()=>move(s,'done',true),/abiertas/);assert.throws(()=>move(s,'archived',true),/archivado/);
 assert.throws(()=>move(s,'normal',true,owner,week,{planVersion:999}),/plan cambió/);
 assert.deepEqual(s,before);
 const changed=move(s,'normal',true);assert.throws(()=>move(changed,'priority',false,owner,week,{planVersion:null}),/plan cambió/);
 changed.data.weeks.find(w=>w.id===week)!.status='Cerrada';assert.throws(()=>move(changed,'normal',false),/semana está cerrada/);
});
test('Los avances existentes se conservan una sola vez y sus resultados no se pierden por un arrastre',()=>{
 const s=fixture();s.data.commitments.push({id:'c-existing',version:1,taskId:'normal',ownerId:owner,weekId:week,result:'Validar la primera parte',isPriority:true,progress:'Primera versión revisada'});
 const board=weeklyTasks(s,week,owner,today);assert.equal(board.selected.filter(r=>r.task.id==='normal').length,1);assert.equal(board.selected.find(r=>r.task.id==='normal')!.commitment?.progress,'Primera versión revisada');
 assert.throws(()=>move(s,'normal',false),/avance acordado/);assert.equal(s.data.commitments[0].result,'Validar la primera parte');
});
test('Confirmar y cerrar conserva las tareas de la semana, aunque luego cambien sus títulos, prioridades o responsables',()=>{
 let s=move(fixture(),'normal',true);
 s=execute(s,owner,{id:'confirm',kind:'confirm_plan',data:{weekId:week,ownerId:owner}},now).state;
 assert.deepEqual(s.snapshots.find(sn=>sn.kind==='plan')!.payload.weekTaskIds[owner],['priority','normal']);
 assert.deepEqual(weeklyTasks(s,week,owner,'2026-11-23').selected.map(r=>r.task.id),['priority','normal']);
 s=execute(s,'persona01',{id:'close',kind:'close_week',expectedVersion:s.data.weeks.find(w=>w.id===week)!.version,data:{weekId:week}},now).state;
 const frozen=weeklyTasks(s,week,owner,today);assert.equal(frozen.selected.length,2);assert.equal(frozen.rest.length,0);
 s.data.tasks=[];assert.deepEqual(weeklyTasks(s,week,owner,today),frozen);
});
test('Las semanas pasadas abiertas no incorporan prioridades de hoy y las versiones antiguas solo muestran sus tareas conservadas',()=>{
 const s=fixture();assert.equal(weeklyTasks(s,'2026-11-02',owner,today).selected.length,0);
 s.data.weeks.push({id:'2026-11-02',version:1,status:'Cerrada',closeVersion:1});
 s.snapshots.push({id:'old',kind:'week',targetId:'2026-11-02',version:1,actorId:'persona01',at:now.toISOString(),reason:'Cierre anterior',payload:{commitments:[{id:'legacy',taskId:'normal',ownerId:owner,weekId:'2026-11-02'}],tasks:[{id:'normal',version:1,title:'Título histórico',ownerId:owner,status:'En curso'}]}});
 assert.equal(weeklyTasks(s,'2026-11-02',owner,today).selected[0].task.title,'Título histórico');
});
test('Las tareas prioritarias terminadas esta semana siguen visibles para su revisión',()=>{
 const s=fixture(),task=s.data.tasks.find(t=>t.id==='priority')!;task.status='Terminada';task.completedAt='2026-11-15T15:00:00Z';
 assert.equal(weeklyTasks(s,week,owner,today).selected[0].task.id,'priority');
 assert.equal(weeklyTasks(s,'2026-11-16',owner,today).selected.length,0);
});
