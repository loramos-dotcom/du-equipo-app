import {test} from 'node:test';
import assert from 'node:assert/strict';
import {institutionalState} from '../shared/team.ts';
import {homeWork} from '../shared/home.ts';
import {calendarFollowups} from '../shared/calendar.ts';
import type {TeamEvent} from '../shared/calendar.ts';
import {interventionStatus,pendingInterventions} from '../shared/followup.ts';
import type {Row} from '../shared/model.ts';

test('Seguimientos de Mi panel contiene únicamente reuniones Tablero propias, vigentes y ordenadas',()=>{
 const now=Date.parse('2026-11-13T01:00:00Z');
 const event=(id:string,title:string,start='2026-11-13T15:00:00Z',extra:Partial<TeamEvent>={}):TeamEvent=>({id,title,start,end:'2026-11-13T16:00:00Z',allDay:false,memberIds:['persona05'],location:'',url:'',meetUrl:'',updated:'2026-11-12T15:00:00Z',...extra});
 const rows=[event('later','Tablero (UEICEE)','2026-11-14T15:00:00Z',{end:'2026-11-14T16:00:00Z'}),event('soon','TABLERO (Universidad)','2026-11-13T01:30:00Z',{end:'2026-11-13T02:30:00Z'}),event('next','📊 Tablero - Privada'),event('prefix','Reunión de Tablero (SSGAD)'),event('unrelated','Reunión de equipo'),event('not-followup','Preparar el tablero'),event('other','Tablero (Agencia)',undefined,{memberIds:['persona06']}),event('ended','Tablero (Universidad)','2026-11-12T15:00:00Z',{end:'2026-11-12T16:00:00Z'}),event('invalid','Tablero (Universidad)','inválido'),event('all-day','Tablero (SSTEDU)','2026-11-12',{allDay:true,end:'2026-11-13'})];
 rows.push({...rows[1]});const before=structuredClone(rows),result=calendarFollowups(rows,'persona05',now);
 assert.deepEqual(result.map(event=>event.id),['all-day','soon','next','prefix','later']);assert.deepEqual(rows,before);
 assert.equal(calendarFollowups([event('ended-all-day','Tablero (Universidad)','2026-11-11',{allDay:true,end:'2026-11-12'})],'persona05',now).length,0);
 assert.equal(calendarFollowups([],'persona05',now).length,0);
 for(const title of ['seg. mensual uni de la ciudad','SEG MENSUAL UNI DE LA CIUDAD','Seguimiento mensual Universidad de la Ciudad'])assert.equal(calendarFollowups([event('monthly',title)],'persona05',now).length,1);
 assert.equal(calendarFollowups([event('other-monthly','Seguimiento mensual de otro proyecto')],'persona05',now).length,0);
});

function fixture(){
 const s=institutionalState('home',{persona01:'persona01@example.edu',persona02:'persona02@example.edu',persona05:'persona05@example.edu'},'persona01@example.edu');
 const task=(id:string,extra:Record<string,any>={}):Row=>({id,version:1,title:id,ownerId:'persona05',status:'Pendiente',...extra});
 s.data.tasks=[task('sin-fecha'),task('con-fecha',{dueDate:'2026-10-21'}),task('terminada',{status:'Terminada'}),task('cancelada',{status:'Cancelada'}),task('archivada',{archived:true}),task('de-otra-persona',{ownerId:'persona01'})];
 s.data.commitments=[{id:'c1',version:1,taskId:'sin-fecha',ownerId:'persona05',weekId:'2026-10-19',isPriority:true,targetDate:'2026-10-21',result:'Preparar el primer brief',outcome:'Cumplido'},{id:'c2',version:1,taskId:'con-fecha',ownerId:'persona05',weekId:'2026-10-12',result:'Otro período'},{id:'c3',version:1,taskId:'de-otra-persona',ownerId:'persona01',weekId:'2026-10-19',result:'Otro integrante'}];
 return s;
}

test('Inicio excluye pedidos de incidencias resueltas o descartadas aunque sigan Solicitada o Tomada; conserva la historia',()=>{
 const issues:Row[]=[{id:'open',version:1,status:'Abierta'},{id:'treatment',version:1,status:'En tratamiento'},{id:'resolved',version:1,status:'Resuelta'},{id:'discarded',version:1,status:'Descartada'}];
 const request=(id:string,issueId:string,status='Solicitada'):Row=>({id,version:1,issueId,status});
 const requests=[request('pending','open'),request('taken','treatment','Tomada'),request('resolved-parent','resolved'),request('discarded-parent','discarded','Tomada'),request('coord-resolved','open','Resuelta'),request('orphan','missing')],before=structuredClone({issues,requests});
 assert.deepEqual(pendingInterventions(requests,issues).map(r=>r.id),['pending','taken']);
 assert.equal(interventionStatus(requests[2],issues),'Incidencia cerrada');assert.equal(interventionStatus(requests[3],issues),'Incidencia cerrada');assert.equal(interventionStatus(requests[4],issues),'Resuelta');
 assert.deepEqual({issues,requests},before);
});

test('Reabrir la incidencia recupera el pedido pendiente original sin duplicarlo ni reabrir una intervención resuelta por Coordinación',()=>{
 const issue:Row={id:'issue',version:2,status:'Resuelta'},requests:Row[]=[{id:'pending',version:1,issueId:'issue',status:'Tomada'},{id:'finished',version:2,issueId:'issue',status:'Resuelta'}];
 assert.equal(pendingInterventions(requests,[issue]).length,0);issue.status='Abierta';
 assert.deepEqual(pendingInterventions(requests,[issue]).map(r=>r.id),['pending']);assert.equal(interventionStatus(requests[0],[issue]),'Tomada');assert.equal(interventionStatus(requests[1],[issue]),'Resuelta');assert.equal(requests.length,2);
});

test('Los pedidos y vínculos eliminados o archivados no generan pendientes en Inicio',()=>{
 const issue:Row={id:'issue',version:1,status:'Abierta'},requests:Row[]=[{id:'request',version:1,status:'Solicitada',issueId:'issue'}];
 for(const mark of ['deletedAt','archived']){assert.equal(pendingInterventions(requests,[{...issue,[mark]:true}]).length,0);assert.equal(pendingInterventions([{...requests[0],[mark]:true}],[issue]).length,0);}
});
test('Inicio muestra tareas propias abiertas aun sin proyecto, fecha o compromiso y excluye cerradas, archivadas y ajenas',()=>{
 const s=fixture(),before=structuredClone(s),work=homeWork(s,'persona05','2026-10-19');
 assert.deepEqual(work.tasks.map(t=>t.id),['con-fecha','sin-fecha']);assert.deepEqual(s,before);
});
test('Inicio conserva la fecha y el resultado del compromiso sin inventar un vencimiento ni cerrar la tarea',()=>{
 const work=homeWork(fixture(),'persona05','2026-10-19');assert.equal(work.commitments.length,1);
 const {commitment,task}=work.commitments[0];assert.equal(commitment.targetDate,'2026-10-21');assert.equal(commitment.outcome,'Cumplido');assert.equal(task!.dueDate,undefined);assert.equal(task!.status,'Pendiente');
 assert.equal(work.tasks.length,2);
});
test('Inicio permite consultar finalizadas propias por fecha real sin incluir canceladas, archivadas ni resultados semanales cumplidos',()=>{
 const s=fixture();s.data.tasks.find(t=>t.id==='terminada')!.completedAt='2026-10-19T15:00:00Z';
 s.data.tasks.push({id:'otra-finalizada',version:1,title:'Finalizada antes',ownerId:'persona05',status:'Terminada',completedAt:'2026-10-18T15:00:00Z'},{id:'finalizada-ajena',version:1,title:'Otra persona',ownerId:'persona01',status:'Terminada'},{id:'finalizada-archivada',version:1,title:'En archivo',ownerId:'persona05',status:'Terminada',archived:true});
 const before=structuredClone(s),work=homeWork(s,'persona05','2026-10-19');
 assert.deepEqual(work.completedTasks.map(t=>t.id),['terminada','otra-finalizada']);assert.deepEqual(work.tasks.map(t=>t.id),['con-fecha','sin-fecha']);assert.deepEqual(s,before);
 s.data.tasks.find(t=>t.id==='terminada')!.status='En curso';
 assert.deepEqual(homeWork(s,'persona05','2026-10-19').completedTasks.map(t=>t.id),['otra-finalizada']);
});
test('Inicio respeta el actor y la semana consultada',()=>{
 assert.deepEqual(homeWork(fixture(),'persona01','2026-10-19').tasks.map(t=>t.id),['de-otra-persona']);
 assert.deepEqual(homeWork(fixture(),'persona05','2026-10-12').commitments.map(x=>x.commitment.id),['c2']);
});
test('El resumen de una semana cerrada usa su versión publicada, sin alterar las tareas operativas actuales',()=>{
 const s=fixture();s.data.weeks.push({id:'2026-10-19',version:1,status:'Cerrada',closeVersion:2});
 const commitments=structuredClone(s.data.commitments),tasks=structuredClone(s.data.tasks);s.snapshots.push({id:'closed',kind:'week',targetId:'2026-10-19',version:2,at:'2026-10-23T17:00:00Z',actorId:'persona01',reason:'',payload:{commitments,tasks}});
 s.data.commitments[0].result='Cambió después';s.data.tasks[0].title='Nombre actual';
 const work=homeWork(s,'persona05','2026-10-19');assert.equal(work.weekClosed,true);assert.equal(work.commitments[0].commitment.result,'Preparar el primer brief');assert.equal(work.commitments[0].task!.title,'sin-fecha');assert.equal(work.tasks.find(t=>t.id==='sin-fecha')!.title,'Nombre actual');
});
