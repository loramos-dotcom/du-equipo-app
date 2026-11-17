import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';
import {panelAgenda,homeWork} from '../shared/home.ts';
import {dateInBA,weekStart} from '../shared/model.ts';
import {selectTasks} from '../shared/views.ts';
import {readQuery} from '../server/read-queries.ts';
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

test('La agenda del panel une reuniones y seguimientos sin repetir un evento ni incorporar fechas operativas',()=>{
 const now=Date.parse('2026-11-17T12:00:00Z'),event=(id:string,title:string,start:string,end:string,extra:Partial<TeamEvent>={}):TeamEvent=>({id,title,start,end,allDay:false,location:'',url:'',meetUrl:'',updated:'2026-11-17T11:00:00Z',memberIds:['persona05'],...extra});
 const followup=event('follow','Tablero SSTEDU','2026-11-17T14:00:00-03:00','2026-11-17T15:00:00-03:00'),events=[followup,{...followup},event('meeting','Reunión de equipo','2026-11-17T16:00:00Z','2026-11-17T17:00:00Z'),event('other','Reunión ajena','2026-11-17T15:00:00Z','2026-11-17T16:00:00Z',{memberIds:['persona06']}),event('ended','Reunión terminada','2026-11-17T10:00:00Z','2026-11-17T11:00:00Z')];
 const meetings:Row[]=[{id:'weekly',version:1,title:'Reunión DU',date:'2026-11-17T12:00',status:'Borrador',attendees:['persona05']},{id:'minute',version:1,title:'Minuta del evento',date:followup.start,status:'Borrador',calendarEventKey:followup.id,attendees:['persona05']},{id:'closed',version:1,title:'Reunión cerrada',date:'2026-11-18T12:00',status:'Cerrada',attendees:['persona05']}];
 const before=structuredClone({events,meetings}),rows=panelAgenda(events,meetings,'persona05',now);
 assert.deepEqual(rows.map(row=>row.id),['weekly:weekly','calendar:meeting','calendar:follow']);assert.equal(rows.at(-1)?.kind,'followup');assert.deepEqual({events,meetings},before);
});
test('La agenda respeta Buenos Aires, el fin exclusivo de los eventos de todo el día y eventos distintos con el mismo título',()=>{
 const now=Date.parse('2026-11-18T01:00:00Z'),base:TeamEvent={id:'night',title:'Tablero nocturno',start:'2026-11-18T01:30:00Z',end:'2026-11-18T02:00:00Z',allDay:false,memberIds:['persona05'],updated:'2026-11-17T12:00:00Z',location:'',url:'',meetUrl:''};
 const rows=panelAgenda([base,{...base,id:'distinct'},{...base,id:'day',title:'Todo el día',start:'2026-11-17',end:'2026-11-18',allDay:true},{...base,id:'old-day',start:'2026-11-16',end:'2026-11-17',allDay:true},{...base,id:'bad',start:'fecha inválida'}],[],'persona05',now);
 assert.equal(rows.length,3);assert.ok(rows.every(row=>row.day==='2026-11-17'));assert.equal(rows[0].id,'calendar:day');assert.equal(rows.filter(row=>row.title===base.title).length,2);
 assert.equal(panelAgenda([{...base,id:'day',start:'2026-11-17',end:'2026-11-18',allDay:true}],[],'persona05',Date.parse('2026-11-18T03:00:00Z')).length,0);
});
test('Las prioritarias se ordenan globalmente antes de paginar sin modificar datos ni requerir una migración',async()=>{
 const state=fixture(),today=dateInBA(),week=weekStart(today);state.data.tasks=Array.from({length:60},(_,index)=>({id:'paged-'+index,version:1,title:'Entrega '+String(index).padStart(2,'0'),ownerId:'persona05',status:'Pendiente',panelPriority:index===0,createdAt:'2026-11-17T12:00:'+String(index).padStart(2,'0')+'Z'}));
 state.data.tasks[1].priority='Alta';state.data.commitments=[];const before=structuredClone(state),actor=state.data.members.find(member=>member.id==='persona05')!;let direct=0;
 const store={load:async()=>structuredClone(state),create:async()=>{},save:async()=>true,records:async()=>{direct++;return {rows:[],total:0};}};
 const query=(offset:number)=>new Request('https://du.example/api/records?entity=tasks&limit=50&offset='+offset+'&filters='+encodeURIComponent(JSON.stringify({owner:'persona05',state:'open',sort:'priority'})));
 const first=await(await readQuery(query(0),store,state.workspaceId,actor))!.json(),second=await(await readQuery(query(50),store,state.workspaceId,actor))!.json();
 assert.equal(first.total,60);assert.equal(first.rows[0].id,'paged-0');assert.equal(first.rows.length,50);assert.equal(second.rows.length,10);assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,60);assert.equal(direct,0);assert.deepEqual(state,before);
 const ordered=selectTasks(state,{owner:'persona05',state:'open',due:'',independent:false,sort:'priority'},today);assert.equal(ordered[0].id,'paged-0');
 state.data.tasks[2].panelPriority=undefined;state.data.commitments.push({id:'priority',version:1,taskId:'paged-2',ownerId:'persona05',weekId:week,isPriority:true});assert.ok(selectTasks(state,{owner:'persona05',state:'open',due:'',independent:false,sort:'priority'},today).slice(0,2).some(row=>row.id==='paged-2'));
});
