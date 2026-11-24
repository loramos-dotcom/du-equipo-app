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
 const s=fixture();assert.deepEqual(weeklyTasks(s,'2026-11-02',owner,today).selected.map(row=>row.task.id),['done']);
 s.data.weeks.push({id:'2026-11-02',version:1,status:'Cerrada',closeVersion:1});
 s.snapshots.push({id:'old',kind:'week',targetId:'2026-11-02',version:1,actorId:'persona01',at:now.toISOString(),reason:'Cierre anterior',payload:{commitments:[{id:'legacy',taskId:'normal',ownerId:owner,weekId:'2026-11-02'}],tasks:[{id:'normal',version:1,title:'Título histórico',ownerId:owner,status:'En curso'}]}});
 assert.equal(weeklyTasks(s,'2026-11-02',owner,today).selected[0].task.title,'Título histórico');
});
test('Las tareas prioritarias terminadas esta semana siguen visibles para su revisión',()=>{
 const s=fixture(),task=s.data.tasks.find(t=>t.id==='priority')!;task.status='Terminada';task.completedAt='2026-11-15T15:00:00Z';
 assert.equal(weeklyTasks(s,week,owner,today).selected[0].task.id,'priority');
 assert.equal(weeklyTasks(s,'2026-11-16',owner,today).selected.length,0);
});

test('Toda tarea completada dentro de la semana se incluye aunque no fuera prioritaria o se hubiera retirado',()=>{
 const s=fixture(),normal=s.data.tasks.find(task=>task.id==='normal')!;
 normal.status='Terminada';normal.completedAt='2026-11-15T15:00:00Z';normal.panelPriority=false;
 s.data.plans.push({id:'plan',version:1,weekId:week,ownerId:owner,taskSelections:{normal:false}});
 const before=structuredClone(s);assert.equal(weeklyTasks(s,week,owner,today).selected.filter(row=>row.task.id==='normal').length,1);
 normal.archived=true;assert.equal(weeklyTasks(s,week,owner,today).selected.filter(row=>row.task.id==='normal').length,1);
 assert.deepEqual(s.data.plans,before.data.plans);assert.deepEqual(s.data.commitments,before.data.commitments);
 assert.equal(weeklyTasks(s,'2026-11-16',owner,today).selected.some(row=>row.task.id==='normal'),false);
});
test('Las completadas usan el límite de lunes en Buenos Aires y conservan cada responsable',()=>{
 const s=fixture();s.data.tasks=[
  {id:'sunday',version:1,title:'Domingo',ownerId:owner,status:'Terminada',completedAt:'2026-11-09T02:59:59Z'},
  {id:'monday',version:1,title:'Lunes',ownerId:owner,status:'Terminada',completedAt:'2026-11-09T03:00:00Z'},
  {id:'last',version:1,title:'Último minuto',ownerId:owner,status:'Terminada',completedAt:'2026-11-16T02:59:59Z'},
  {id:'next',version:1,title:'Semana siguiente',ownerId:owner,status:'Terminada',completedAt:'2026-11-16T03:00:00Z'},
  {id:'other',version:1,title:'Otra persona',ownerId:'persona06',status:'Terminada',completedAt:'2026-11-10T15:00:00Z'}
 ];
 assert.deepEqual(weeklyTasks(s,week,owner,today).selected.map(row=>row.task.id).sort(),['last','monday']);
 assert.deepEqual(weeklyTasks(s,week,'persona06',today).selected.map(row=>row.task.id),['other']);
});

test('Las recurrencias abiertas de la semana aparecen para el responsable y sus colaboradores',()=>{
 const s=fixture(),collaborator='persona06';
 s.data.tasks=[
  {id:'this-week',version:1,title:'Ocurrencia actual',ownerId:owner,collaborators:[collaborator],status:'Pendiente',priority:'Media',recurrenceId:'template',occurrenceDate:week},
  {id:'last-week',version:1,title:'Ocurrencia anterior',ownerId:owner,collaborators:[collaborator],status:'Pendiente',recurrenceId:'template',occurrenceDate:'2026-11-02'},
  {id:'next-week',version:1,title:'Ocurrencia siguiente',ownerId:owner,collaborators:[collaborator],status:'Pendiente',recurrenceId:'template',occurrenceDate:'2026-11-16'},
  {id:'cancelled',version:1,title:'Ocurrencia cancelada',ownerId:owner,collaborators:[collaborator],status:'Cancelada',recurrenceId:'template',occurrenceDate:week},
  {id:'regular',version:1,title:'Pendiente común',ownerId:owner,collaborators:[collaborator],status:'Pendiente'}
 ];
 const before=structuredClone(s);
 const primary=weeklyTasks(s,week,owner,today);
 assert.deepEqual(primary.selected.map(row=>row.task.id),['this-week']);
 assert.equal(primary.selected[0].priority,false);
 assert.deepEqual(primary.rest.map(row=>row.task.id).sort(),['last-week','next-week','regular']);
 const shared=weeklyTasks(s,week,collaborator,today);
 assert.deepEqual(shared.selected.map(row=>[row.task.id,row.collaboration]),[['this-week',true]]);
 assert.equal(shared.rest.length,0);
 assert.equal(weeklyTasks(s,week,'persona02',today).selected.length,0);
 assert.deepEqual(s,before);

 const moved=move(s,'this-week',false);
 assert.equal(weeklyTasks(moved,week,owner,today).selected.length,0);
 assert.deepEqual(weeklyTasks(moved,week,collaborator,today).selected.map(row=>row.task.id),['this-week']);
});

test('Las tareas abiertas que vencen en la semana se incluyen para responsable y colaboradores',()=>{
 const s=fixture(),collaborator='persona04',current=s.data.tasks.find(task=>task.id==='normal')!;
 Object.assign(current,{dueDate:week,collaborators:[collaborator]});
 const withDate=(id:string,dueDate:string)=>({...current,id,code:undefined,dueDate});
 s.data.tasks.push(withDate('last-day','2026-11-15'),withDate('past','2026-11-08'),withDate('next-week','2026-11-16'),
  {...withDate('cancelled',week),status:'Cancelada'},{...withDate('deleted',week),deletedAt:now.toISOString()});
 assert.deepEqual(weeklyTasks(s,week,owner,today).selected.map(row=>row.task.id),['priority','normal','last-day']);
 assert.deepEqual(weeklyTasks(s,week,collaborator,today).selected.map(row=>[row.task.id,row.collaboration,row.priority]),
  [['normal',true,false],['last-day',true,false]]);
 assert.deepEqual(weeklyTasks(s,'2026-11-16',collaborator,today).selected.map(row=>row.task.id),['next-week']);
 assert.deepEqual(weeklyTasks(s,week,'persona02',today).selected,[]);
 const adjusted=move(s,'normal',false);
 assert.equal(weeklyTasks(adjusted,week,owner,today).selected.some(row=>row.task.id==='normal'),false);
 assert.equal(weeklyTasks(adjusted,week,collaborator,today).selected.some(row=>row.task.id==='normal'),true);
});
