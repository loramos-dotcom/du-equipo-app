import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute,minutesText} from '../shared/domain.ts';
import {compareVersions} from '../shared/versions.ts';
import {meetingWeekWork,meetingWorkRows} from '../shared/meetings.ts';
import type {State} from '../shared/model.ts';
const now=new Date('2026-10-21T13:00:00Z');
function call(s:State,kind:string,data:any,entity?:any,entityId?:string,expectedVersion?:number,actor='persona01'){return execute(s,actor,{id:crypto.randomUUID(),kind,data,entity,entityId,expectedVersion},now);}
test('La reunión conserva asistencia efectiva y tiempos editables en la minuta cerrada',()=>{
 let s=seed(now);const meeting=s.data.meetings[0];
 const update=call(s,'create',{targetType:'tasks',targetId:'t1',entryType:'update',body:'Cifras validadas'},'comments',undefined,undefined,'persona05');s=update.state;
 s=call(s,'update',{presentIds:['persona01','persona05'],excusedIds:['persona02'],advanceMinutes:8,decisionMinutes:20,teamMinutes:10,planningMinutes:12,selectedUpdateIds:[update.result.id],selectedCommitmentIds:['c1']},'meetings',meeting.id,meeting.version).state;
 const m=s.data.meetings[0];assert.deepEqual(m.durations,[8,20,10,12]);assert.equal(m.attendance.persona05,'Presente');assert.equal(m.attendance.persona02,'Ausencia justificada');
 const text=minutesText(s,m);assert.match(text,/Cifras validadas/);assert.match(text,/Ausencia justificada/);assert.match(text,/Validar la estructura/);
 const closed=call(s,'close_meeting',{minutes:text},undefined,m.id,m.version).state;assert.equal(closed.snapshots.at(-1)?.payload.meeting.attendance.persona05,'Presente');
 assert.throws(()=>call(s,'update',{presentIds:['persona01'],excusedIds:['persona01']},'meetings',m.id,m.version),/sola condición/);
});
test('Un acuerdo puede modificar tarea y compromiso de la semana en una sola operación',()=>{
 const s=seed(now),m=s.data.meetings[0],t=s.data.tasks.find(t=>t.id==='t1')!,c=s.data.commitments.find(c=>c.id==='c1')!;
 const data={meetingId:m.id,text:'Acordamos la entrega parcial',ownerId:'persona05',followUpDate:'2026-10-23',action:'update_task',taskId:t.id,taskVersion:t.version,dueDate:'2026-10-26',reason:'Acuerdo del equipo',commitmentId:c.id,commitmentVersion:c.version,commitmentWeekId:c.weekId,commitmentResult:'Validar primera parte',commitmentOutcome:'Cumplido',commitmentNote:'Parte validada'};
 const next=call(s,'record_decision',data).state;assert.equal(next.data.tasks.find(t=>t.id==='t1')?.dueDate,'2026-10-26');assert.equal(next.data.commitments.find(c=>c.id==='c1')?.outcome,'Cumplido');assert.equal(next.data.tasks.find(t=>t.id==='t1')?.status,'En curso');assert.equal(next.data.decisions.at(-1)?.commitmentId,'c1');
 assert.throws(()=>call(s,'record_decision',{...data,commitmentVersion:999}),/compromiso fue actualizado/);assert.equal(s.data.tasks.find(t=>t.id==='t1')?.dueDate,t.dueDate);assert.equal(s.data.decisions.length,0);
});
test('La comparación identifica cambios por ID aunque las filas tengan otro orden',()=>{
 const rows=compareVersions({commitments:[{id:'a',result:'Antes'},{id:'b',result:'Igual'}]},{commitments:[{id:'b',result:'Igual'},{id:'a',result:'Después'}]});assert.deepEqual(rows,[{path:'commitments[a].result',before:'Antes',after:'Después'}]);
});

test('Las prioridades del equipo requieren Coordinación, versión vigente y no cambian las personales',()=>{
 const s=seed(now),meeting=s.data.meetings[0],command={id:crypto.randomUUID(),kind:'meeting_priority',entityId:meeting.id,expectedVersion:meeting.version,data:{text:'Acordar entregas del equipo'}};
 assert.throws(()=>execute(s,'persona05',command,now),/coordinación/i);
 const next=execute(s,'persona01',command,now),m=next.state.data.meetings[0];
 assert.equal(m.teamPriorities[0].text,'Acordar entregas del equipo');assert.deepEqual(next.state.data.commitments,s.data.commitments);
 assert.deepEqual(execute(next.state,'persona01',command,now),next);assert.equal(next.state.audit.at(-1)?.entity,'meetings');
 assert.throws(()=>call(next.state,'meeting_priority',{text:'Cambio concurrente'},undefined,m.id,meeting.version),/actualizó/);
 const edited=call(next.state,'meeting_priority',{priorityId:m.teamPriorities[0].id,text:'Validar las entregas acordadas'},undefined,m.id,m.version,'persona02').state;
 assert.equal(edited.data.meetings[0].teamPriorities[0].text,'Validar las entregas acordadas');assert.match(minutesText(edited,edited.data.meetings[0]),/PRIORIDADES DEL EQUIPO\n1\. Validar las entregas acordadas/);
 assert.throws(()=>call(edited,'meeting_priority',{priorityId:m.teamPriorities[0].id,remove:true},undefined,m.id,edited.data.meetings[0].version),/Confirmá/);
 const removed=call(edited,'meeting_priority',{priorityId:m.teamPriorities[0].id,remove:true,confirm:true},undefined,m.id,edited.data.meetings[0].version).state;
 assert.equal(removed.data.meetings[0].teamPriorities.length,0);
});

test('La minuta cerrada conserva prioridades y compromisos, aunque el trabajo cambie después',()=>{
 let s=seed(now),m=s.data.meetings[0];s=call(s,'meeting_priority',{text:'Confirmar el presupuesto'},undefined,m.id,m.version).state;m=s.data.meetings[0];
 s=call(s,'close_meeting',{minutes:minutesText(s,m)},undefined,m.id,m.version).state;m=s.data.meetings[0];
 const frozen=structuredClone(s.snapshots.at(-1)!.payload);assert.equal(frozen.meeting.teamPriorities[0].text,'Confirmar el presupuesto');assert.ok(frozen.workReview.commitments.length>0);assert.ok(frozen.workReview.tasks.length>0);
 assert.throws(()=>call(s,'meeting_priority',{text:'Cambio cerrado'},undefined,m.id,m.version),/abierta/);
 s=call(s,'reopen_meeting',{reason:'Revisión acordada'},undefined,m.id,m.version).state;m=s.data.meetings[0];s=call(s,'meeting_priority',{priorityId:m.teamPriorities[0].id,text:'Nuevo acuerdo'},undefined,m.id,m.version).state;
 assert.deepEqual(s.snapshots[0].payload,frozen);
});

test('La reunión conserva la revisión histórica de una semana cerrada aunque la tarea ya no exista',()=>{
 const s=seed(now),m=s.data.meetings[0],week=s.data.weeks.find(w=>w.id===m.weekId)!;
 s.snapshots.push({id:'closed-week',kind:'week',targetId:week.id,version:1,at:now.toISOString(),actorId:'persona01',reason:'',payload:structuredClone({week,commitments:s.data.commitments,tasks:s.data.tasks,members:s.data.members})});week.status='Cerrada';week.closeVersion=1;s.data.commitments=[];s.data.tasks=[];
 const closed=call(s,'close_meeting',{minutes:'Revisión de la semana cerrada'},undefined,m.id,m.version).state;
 const review=closed.snapshots.at(-1)!.payload.workReview;assert.ok(review.commitments.some((c:any)=>c.id==='c1'));assert.equal(review.tasks.find((t:any)=>t.id==='t1').title,'Conciliar cifras para la presentación');
});

test('La reunión reúne tareas seleccionadas y completadas sin exigir ni crear un compromiso',()=>{
 const s=seed(now),week='2026-10-19';s.data.commitments=[];s.data.plans=[];
 s.data.tasks=[
  {id:'done',version:1,title:'Entrega terminada',ownerId:'persona05',status:'Terminada',completedAt:now.toISOString(),panelPriority:false},
  {id:'planned',version:1,title:'Entrega elegida',ownerId:'persona05',status:'Pendiente'},
  {id:'priority',version:1,title:'Entrega prioritaria',ownerId:'persona06',status:'Pendiente',panelPriority:true}
 ];
 s.data.plans.push({id:'p',version:1,weekId:week,ownerId:'persona05',taskSelections:{done:false,planned:true}});
 const before=structuredClone(s),work=meetingWeekWork(s,week,'2026-10-21');
 assert.deepEqual(meetingWorkRows(work,'persona05').map(row=>row.task?.id).sort(),['done','planned']);
 assert.deepEqual(meetingWorkRows(work,'persona06').map(row=>row.task?.id),['priority']);
 assert.equal(meetingWorkRows(work).length,3);assert.deepEqual(s,before);
 s.data.commitments.push({id:'advance',version:1,taskId:'done',ownerId:'persona05',weekId:week,result:'Validar la entrega',isPriority:true});
 const rows=meetingWorkRows(meetingWeekWork(s,week,'2026-10-21'),'persona05');
 assert.equal(rows.filter(row=>row.task?.id==='done').length,1);assert.equal(rows.find(row=>row.task?.id==='done')!.commitment?.id,'advance');
});
test('Cerrar la reunión conserva también las completadas sin plan y no toma datos actuales para un período cerrado',()=>{
 let s=seed(now);s.data.commitments=[];s.data.plans=[];s.data.tasks=[{id:'done',version:1,title:'Entrega original',ownerId:'persona05',status:'Terminada',completedAt:now.toISOString(),panelPriority:false}];
 const meeting=s.data.meetings[0];s=call(s,'close_meeting',{minutes:'Revisión completa'},undefined,meeting.id,meeting.version).state;
 const frozen=structuredClone(s.snapshots.at(-1)!.payload.workReview);assert.deepEqual(frozen.weekTaskIds.persona05,['done']);
 s.data.tasks[0].title='Título nuevo';s.data.tasks[0].ownerId='persona06';
 assert.equal(meetingWorkRows(frozen,'persona05')[0].task?.title,'Entrega original');assert.equal(meetingWorkRows(frozen,'persona06').length,0);
 const week=s.data.weeks.find(row=>row.id===meeting.weekId)!;week.status='Cerrada';week.closeVersion=99;
 const missing=meetingWeekWork(s,meeting.weekId,'2026-10-21');assert.equal(missing.tasks.length,0);assert.equal(meetingWorkRows(missing).length,0);
});
test('Las reuniones cerradas anteriores conservan sólo las filas de sus compromisos',()=>{
 const legacy={closed:true,commitments:[{id:'c',version:1,taskId:'historic',ownerId:'persona05',result:'Avance original'}],tasks:[{id:'historic',version:1,title:'Título conservado',ownerId:'persona05'},{id:'dependency',version:1,title:'Dependencia conservada',ownerId:'persona05'}]};
 assert.equal(meetingWorkRows(legacy).length,1);assert.equal(meetingWorkRows(legacy)[0].task?.title,'Título conservado');
});
