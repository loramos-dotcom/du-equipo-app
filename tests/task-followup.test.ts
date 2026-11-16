import test from 'node:test';
import assert from 'node:assert/strict';
import {execute,publicState} from '../shared/domain.ts';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';
import {activeTaskIssues,taskFollowups,taskFollowupKey,requestsForTask,followupCounts} from '../shared/task-followup.ts';
import {pendingInterventions} from '../shared/followup.ts';
import {stateDelta} from '../server/relational.ts';
import {api} from '../server/api.ts';
import type {State,Command} from '../shared/model.ts';

const now=new Date('2026-11-15T16:00:00Z'),today='2026-11-15';
function fixture(){let state=institutionalState('followup-test',{persona01:'coord@example.edu',persona05:'member@example.edu',persona06:'other@example.edu'},'coord@example.edu');const made=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title:'Preparar informe de prueba',ownerId:'persona05'}},now);state=made.state;const taskId=made.result.id;state=call(state,taskId,'transition_task',{status:'En curso',note:'Iniciar trabajo'});return {state,taskId};}
function call(state:State,id:string,kind:string,data:Record<string,any>,actor='persona05'){
 return execute(state,actor,{id:crypto.randomUUID(),kind,entityId:id,expectedVersion:state.data.tasks.find(task=>task.id===id)?.version,data},now).state;
}
const values=(state:State,id:string,actor='persona05')=>({action:'save',description:'Falta confirmar el insumo',dependency:'Área de prueba',nextAction:'Confirmar la recepción',followUpDate:today,pause:true,requestCoordination:false,followupKey:taskFollowupKey(state,id,actor)});

test('El contador cuenta sólo tareas pendientes, respeta permisos y conserva los problemas de proyectos sin inflarse por el Tablero',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',values(state,taskId));const issue=state.data.issues[0];
 state.data.issues.push({...issue,id:'second-block',title:'Segundo bloqueo de la misma tarea'},{...issue,id:'own-project',taskId:null,projectId:'project-fixture'},{...issue,id:'other-project',taskId:null,ownerId:'persona06',projectId:'project-fixture'},{...issue,id:'archived-project',taskId:null,archived:true},{...issue,id:'deleted-project',taskId:null,deletedAt:now.toISOString()},{...issue,id:'closed-project',taskId:null,status:'Resuelta'});
 state.externalProjects=Array.from({length:25},(_,index)=>({id:'gestion:shared-'+index,sourceId:'shared-'+index,title:'Proyecto compartido de prueba '+index,version:1,status:'Activo',areaKeys:['tecnologia']}));
 const before=structuredClone(state);
 assert.deepEqual(followupCounts(state,'persona01'),{tasks:1,total:1});
 assert.deepEqual(followupCounts(state,'persona05'),{tasks:1,total:1});
 assert.deepEqual(followupCounts(state,'persona06'),{tasks:0,total:0});
 assert.deepEqual(state,before);
 state=call(state,taskId,'task_followup',{action:'clear',note:'Insumos recibidos',followupKey:taskFollowupKey(state,taskId,'persona05')});
 assert.deepEqual(followupCounts(state,'persona01'),{tasks:0,total:0});assert.equal(before.data.tasks[0].status,'En espera');
 assert.deepEqual(state.data.issues.filter(issue=>!issue.taskId).sort((a,b)=>a.id.localeCompare(b.id)),before.data.issues.filter(issue=>!issue.taskId).sort((a,b)=>a.id.localeCompare(b.id)));
});

test('Registrar un bloqueo desde la tarea guarda problema y estado en una operación idempotente',()=>{
 const {state,taskId}=fixture(),before=structuredClone(state),command:Command={id:'followup-idempotent',kind:'task_followup',entityId:taskId,expectedVersion:state.data.tasks[0].version,data:values(state,taskId)};
 const result=execute(state,'persona05',command,now),issue=activeTaskIssues(result.state.data.issues,taskId)[0];
 assert.equal(result.state.data.tasks[0].status,'En espera');assert.equal(issue.ownerId,'persona05');assert.equal(issue.taskIntegrated,true);assert.equal(issue.taskId,taskId);assert.equal(issue.projectId,null);assert.equal(result.state.data.interventions.length,0);assert.deepEqual(execute(result.state,'persona05',command,now),result);assert.deepEqual(state,before);
 const delta=stateDelta(state,result.state);assert.ok(delta.p_changes.tasks);assert.ok(delta.p_changes.issues);
});

test('Editar el bloqueo reutiliza el seguimiento y rechaza fechas y formularios incompletos sin guardar una mitad',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',values(state,taskId));const issue=activeTaskIssues(state.data.issues,taskId)[0];
 const next=call(state,taskId,'task_followup',{...values(state,taskId),issueId:issue.id,description:'Nueva información del área'});assert.equal(next.data.issues.length,1);assert.equal(next.data.issues[0].title,'Nueva información del área');assert.equal(next.data.tasks[0].status,'En espera');
 for(const data of [{description:''},{followUpDate:'2026-02-30'},{pause:'yes'},{requestCoordination:true,request:'',neededBy:today}]){const before=structuredClone(state);assert.throws(()=>call(state,taskId,'task_followup',{...values(state,taskId),...data}));assert.deepEqual(state,before);}
});

test('Pedir ayuda desde una tarea en curso no la pausa, notifica y evita pedidos duplicados',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',{...values(state,taskId),pause:false,requestCoordination:true,request:'Confirmar la decisión con el área',neededBy:today});
 assert.equal(state.data.tasks[0].status,'En curso');assert.equal(requestsForTask(state,taskId).length,1);assert.equal(state.data.notifications.filter(notice=>notice.targetType==='interventions').length,state.data.members.filter(member=>member.active&&member.role==='Coordinación').length);
 const before=structuredClone(state);assert.throws(()=>call(state,taskId,'task_followup',{...values(state,taskId),requestCoordination:true,request:'Segundo pedido',neededBy:today}),/pedido pendiente/);assert.deepEqual(state,before);
});

test('Destrabar cierra varios registros anteriores y reanuda la tarea sin perder comentarios, pedidos ni versiones cerradas',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',{...values(state,taskId),requestCoordination:true,request:'Gestionar el dato',neededBy:today});
 state=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'issues',data:{taskId,ownerId:'persona05',title:'Otro problema anterior',type:'Bloqueo',impact:'Demora',nextAction:'Confirmar dato',followUpDate:today}},now).state;
 const issue=state.data.issues[0];state=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'comments',data:{targetType:'issues',targetId:issue.id,body:'Comentario anterior conservado'}},now).state;
 state.snapshots.push({id:'past-week',kind:'week',targetId:'2026-11-09',version:1,at:now.toISOString(),actorId:'persona01',reason:'Cierre anterior',payload:{tasks:structuredClone(state.data.tasks),issues:structuredClone(state.data.issues)}});
 const snapshot=structuredClone(state.snapshots),request=structuredClone(state.data.interventions[0]),next=call(state,taskId,'task_followup',{action:'clear',note:'Se recibió el insumo',followupKey:taskFollowupKey(state,taskId,'persona05')});
 assert.equal(next.data.tasks[0].status,'En curso');assert.equal(activeTaskIssues(next.data.issues,taskId).length,0);assert.ok(next.data.issues.every(issue=>issue.resolvedWithTask&&issue.resolutionNote==='Se recibió el insumo'));assert.equal(pendingInterventions(next.data.interventions,next.data.issues).length,0);assert.deepEqual(next.data.interventions[0],request);assert.equal(next.data.comments[0].body,'Comentario anterior conservado');assert.deepEqual(next.snapshots,snapshot);assert.equal(taskFollowups(next,'persona05')[0].closed,true);
});

test('El cambio de estado crea la espera y cierra el seguimiento al reanudar o terminar, con validación y evidencia vigentes',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'transition_task',{status:'En espera',note:'Falta recibir la base',followupKey:taskFollowupKey(state,taskId,'persona05')});assert.equal(activeTaskIssues(state.data.issues,taskId).length,1);
 state=call(state,taskId,'transition_task',{status:'En curso',note:'Ya llegó',followupKey:taskFollowupKey(state,taskId,'persona05')});assert.equal(activeTaskIssues(state.data.issues,taskId).length,0);
 state=call(state,taskId,'task_followup',values(state,taskId));state.data.tasks[0].requiresEvidence=true;const before=structuredClone(state);assert.throws(()=>call(state,taskId,'transition_task',{status:'Terminada',note:'Entregado'}),/evidencia/);assert.deepEqual(state,before);
 state=call(state,taskId,'transition_task',{status:'Terminada',note:'Entrega con evidencia',evidence:'https://example.edu/evidence'});assert.equal(activeTaskIssues(state.data.issues,taskId).length,0);assert.equal(state.data.tasks[0].status,'Terminada');
});

test('Un cambio paralelo del bloqueo o del pedido conserva el formulario y rechaza la versión anterior',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',{...values(state,taskId),requestCoordination:true,request:'Pedir una decisión',neededBy:today});const key=taskFollowupKey(state,taskId,'persona05'),version=state.data.tasks[0].version;
 const request=state.data.interventions[0];state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'intervention_status',entityId:request.id,expectedVersion:request.version,data:{status:'Tomada',nextAction:'Consultar al área'}},now).state;
 assert.equal(state.data.tasks[0].version,version);assert.throws(()=>call(state,taskId,'task_followup',{action:'clear',note:'Quiero destrabar',followupKey:key}),/Cambió el seguimiento/);
});

test('Tomar un pedido desde la tarea exige Coordinación, verifica el contexto y registra la gestión en ambos historiales',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',{...values(state,taskId),requestCoordination:true,request:'Acordar la definición',neededBy:today});const request=state.data.interventions[0],data={action:'take',requestId:request.id,nextAction:'Consultar al área',followupKey:taskFollowupKey(state,taskId,'persona01')};
 assert.throws(()=>call(state,taskId,'task_followup',{...data,followupKey:taskFollowupKey(state,taskId,'persona05')}),/coordinación/i);const next=call(state,taskId,'task_followup',data,'persona01');assert.equal(next.data.interventions[0].status,'Tomada');assert.equal(next.data.interventions[0].takenBy,'persona01');assert.equal(next.data.tasks[0].status,'En espera');assert.ok(next.data.tasks[0].version>state.data.tasks[0].version);assert.ok(next.data.notifications.some(notice=>notice.type==='Ayuda en gestión'&&notice.ownerId==='persona05'));
});

test('Pedir ayuda durante la validación conserva el estado y la autoridad de quien valida',()=>{
 let {state,taskId}=fixture();state.data.tasks[0].requiresValidation=true;state.data.tasks[0].validatorId='persona01';state=call(state,taskId,'transition_task',{status:'Para validar',note:'Entrega para revisar'});
 const requested=call(state,taskId,'task_followup',{...values(state,taskId),pause:false,requestCoordination:true,request:'Acordar una revisión de la entrega',neededBy:today});assert.equal(requested.data.tasks[0].status,'Para validar');
 assert.throws(()=>call(requested,taskId,'task_followup',values(requested,taskId)),/conserva su estado/);
 const cleared=call(requested,taskId,'task_followup',{action:'clear',note:'Se confirmó la revisión',followupKey:taskFollowupKey(requested,taskId,'persona05')});assert.equal(cleared.data.tasks[0].status,'Para validar');assert.equal(cleared.data.tasks[0].validatedBy,undefined);assert.equal(activeTaskIssues(cleared.data.issues,taskId).length,0);assert.throws(()=>call(cleared,taskId,'transition_task',{status:'Terminada',note:'Intento de aprobar'}),/validador/);
});

test('Una fila por tarea conserva permisos y separa los problemas generales de proyectos',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',values(state,taskId));const first=state.data.issues[0];state.data.issues.push({...first,id:'second',title:'Otro bloqueo'});
 state.data.issues.push({...first,id:'project-issue',taskId:null,projectId:'project-fixture',title:'Problema general'});const rows=taskFollowups(state,'persona05');assert.equal(rows.length,1);assert.equal(rows[0].issues.length,2);
 assert.equal(taskFollowups(state,'persona06').length,0);assert.equal(publicState(state,'persona06').data.issues.length,0);assert.throws(()=>call(state,taskId,'task_followup',{...values(state,taskId,'persona06')},'persona06'),/responsable/);
 const next=call(state,taskId,'task_followup',{action:'clear',note:'Todo confirmado',followupKey:taskFollowupKey(state,taskId,'persona05')});assert.equal(next.data.issues.find(issue=>issue.id==='project-issue')!.status,'Abierta');
});

test('Coordinación puede responder y destrabar en un envío; responder sin destrabar conserva el trabajo pendiente',()=>{
 let {state,taskId}=fixture();state=call(state,taskId,'task_followup',{...values(state,taskId),requestCoordination:true,request:'Acordar una decisión',neededBy:today});const request=state.data.interventions[0];
 assert.throws(()=>call(state,taskId,'task_followup',{action:'answer',requestId:request.id,note:'Intento ajeno',unblock:true,followupKey:taskFollowupKey(state,taskId,'persona05')}),/coordinación/i);
 const answered=call(state,taskId,'task_followup',{action:'answer',requestId:request.id,note:'Se acordó la decisión',unblock:false,followupKey:taskFollowupKey(state,taskId,'persona01')},'persona01');assert.equal(answered.data.tasks[0].status,'En espera');assert.equal(answered.data.interventions[0].status,'Resuelta');assert.equal(activeTaskIssues(answered.data.issues,taskId).length,1);
 const resumed=call(state,taskId,'task_followup',{action:'answer',requestId:request.id,note:'El área confirmó la entrega',unblock:true,followupKey:taskFollowupKey(state,taskId,'persona01')},'persona01');assert.equal(resumed.data.tasks[0].status,'En curso');assert.equal(activeTaskIssues(resumed.data.issues,taskId).length,0);assert.equal(resumed.data.interventions[0].resolutionNote,'El área confirmó la entrega');
});

test('Un fallo de persistencia no guarda el estado de tarea, el bloqueo ni un aviso parcial',async()=>{
 const {state,taskId}=fixture();let stored=structuredClone(state);stored.data.members.find(member=>member.id==='persona05')!.authUserId='verified-followup';const before=structuredClone(stored);
 const store={load:async()=>structuredClone(stored),create:async()=>{},save:async()=>false},command={id:'followup-conflict',kind:'task_followup',entityId:taskId,expectedVersion:stored.data.tasks[0].version,data:{...values(stored,taskId),requestCoordination:true,request:'Pedido de prueba',neededBy:today}};
 const response=await api(new Request('https://du.example/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}),store,'followup-test',{mode:'team',identity:{id:'verified-followup',email:'member@example.edu',verified:true,provider:'google'}});assert.equal(response.status,409);assert.deepEqual(stored,before);
});
