import {taskCollaborators,taskAreaIds} from './task-assignment.ts';
import {resolveProjectAssignments}from'./project-assignments.ts';
import {canEditCalendarMinutes}from'./calendar.ts';
import type {TeamEvent}from'./calendar.ts';
import {validateWorkGraph,workClosureProblems,workBlockers,workSnapshotRows,taskDescription,retiredWorkFields} from './work.ts';
import {cleanView} from './saved-views.ts';
import {issueVisibility} from './issue-access.ts';
import {mayPrioritize} from './project-portfolios.ts';
import {effectiveArea,overlaps} from './structure.ts';
import {meetingSegments,meetingMinutes,meetingWeekWork} from './meetings.ts';
import {isManagementProject,projectContexts,referencedProjects} from './project-context.ts';
import {collections,taskStatuses,outcomes,capacities,deliveryStatuses,addDays,weekStart,dateInBA,normalize} from './model.ts';
import type {State,Row,Collection,Command} from './model.ts';
import {deletionImpactKey,deletionPlan,mayDelete,partitionDeleted,trashSummaries} from './deletion.ts';
import type {Deletable,Detachment} from './deletion.ts';
export class DomainError extends Error {status:number;constructor(message:string,status=422){super(message);this.status=status;}}
const fail=(message:string,status=422):never=>{throw new DomainError(message,status);};
const required=(v:any,label:string)=>{if(typeof v!=='string'||!v.trim())fail(`${label}: completá este campo.`);return v.trim();};
const pick=(o:Record<string,any>,keys:string[])=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const fields:Partial<Record<Collection,string[]>>={
 projects:['manualMemberIds','manualAreaIds','title','description','outcome','kind','scope','leadId','members','intervention','areaId','areaIds','policyId','startDate','targetDate','nextStep','nextDate','nextMilestoneId','tags','documents'],
 tasks:['referenceUrl','assignmentMode','areaId','areaIds','panelPriority','title','description','dependsOnIds','ownerId','collaborators','projectId','milestoneId','dueDate','priority','requiresValidation','validatorId','requiresEvidence','origin','originDetail','links','tags'],
 milestones:['title','description','criteria','projectId','ownerType','ownerId','areaId','contact','dueDate'],
 issues:['title','type','taskId','projectId','ownerId','dependency','impact','probability','mitigation','nextAction','followUpDate'],
 meetings:['title','date','weekId','planningWeekId','attendees','durations','minutes','presentIds','excusedIds','selectedUpdateIds','selectedCommitmentIds','advanceMinutes','decisionMinutes','teamMinutes','planningMinutes'],
 members:['name','functionTitle','responsibilities','reportsTo','group','email','role','active','setupStatus'],
 areas:['name','acronym','leadId','substitutes','parentId','active','contact','contactEmail','documents'],
 recurrences:['title','projectId','ownerId','collaborators','description','priority','frequency','weekday','monthday','startsOn','endsOn','active','requiresValidation','validatorId'],
 areaContacts:['areaId','name','position','email','active'],
 catalogs:['name','type','active'],filters:['name','scope','definition','view','shared'],links:['targetType','targetId','title','url'],comments:['targetType','targetId','body','entryType']
};
const terminals=['Terminada','Cancelada'];
const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validDate(value:any,label='Fecha',mandatory=false){if(!value&&!mandatory)return;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail(`${label}: ingresá una fecha válida.`);}
export function execute(input:State,actorId:string,command:Command,now=new Date(),execution?:{jobId?:string;calendarEvent?:TeamEvent}):{state:State;result:any}{
 if(!isObject(command)||typeof command.id!=='string'||typeof command.kind!=='string'||command.data!==undefined&&!isObject(command.data))fail('La solicitud debe incluir una operación, un identificador y datos válidos.',400);
 const s=structuredClone(input),d=s.data;for(const c of collections)d[c]??=[];const externalProjects=projectContexts(s);if(execution)for(const link of [...d.projectLinks,...d.recurrences.filter(r=>isManagementProject(r.projectId)&&!d.projectLinks.some(l=>'gestion:'+l.sourceId===r.projectId)).map(r=>({sourceId:r.projectId.slice(8),version:r.version,members:d.members.filter(m=>m.active).map(m=>m.id),leadId:null}))]){if(!externalProjects.some(p=>p.sourceId===link.sourceId))externalProjects.push({id:'gestion:'+link.sourceId,version:link.version,sourceId:link.sourceId,title:'Proyecto compartido vinculado',status:'Activo',members:link.members??[],leadId:link.leadId});}delete s.externalProjects;const actor=(execution&&actorId==='system:daily'&&['generate_occurrences','generate_notifications'].includes(command.kind)?{id:actorId,name:'Proceso diario de DU Equipo',email:null,active:true,role:'Coordinación'}:d.members.find(x=>x.id===actorId&&x.active))??fail('Tu acceso no está activo. Consultá con coordinación.',403);
 if(!command.id||command.id.length>100)fail('Falta el identificador de la solicitud.',400);
 const a=structuredClone(command.data??{});
 if(['actorId','actor_id','workspaceId','workspace_id','authUserId','auth_user_id','activatedAt','createdBy','updatedBy','version','deletedAt','deletedBy','deletionId','deletionRoot','deletionDetaches'].some(k=>k in a))fail('La identidad y los datos del sistema se obtienen en el servidor.',400);
 const hash=JSON.stringify({...command,id:undefined}),receipt=Object.hasOwn(s.receipts,command.id)?s.receipts[command.id]:undefined;
 if(receipt){if(receipt.hash!==hash||receipt.actorId!==actorId)fail('El identificador ya fue usado con otra solicitud.',409);return {state:s,result:receipt.result};}
 const at=now.toISOString(),today=dateInBA(now),coord=actor.role==='Coordinación';
 const deleted=partitionDeleted(s);delete s.trash;
 const purgedTasks=[...s.audit.filter(e=>e.entity==='tasks'&&e.action==='eliminar definitivamente').flatMap(e=>e.before?[e.before]:[]),...(s.ledger?.purgedOccurrences??[])];
 const nextTaskCode=()=>`T${Math.max(s.ledger?.maxTaskCode??100,...[...d.tasks,...deleted.tasks,...purgedTasks].map(t=>/^T\d+$/.test((t as Row).code??'')?Number((t as Row).code.slice(1)):100))+1}`;
 const accessToIssues=issueVisibility(s,actorId);
 const get=(c:Collection,id:string):Row=>{if(!collections.includes(c))fail('La entidad de destino no es válida.',400);const row=d[c].find(x=>x.id===id)??(c==='projects'?externalProjects.find(p=>p.id===id):undefined)??fail(isManagementProject(id)?'No se pudo verificar el proyecto compartido. Actualizá el acceso al Tablero antes de guardar.':'El registro no existe o no está disponible.',isManagementProject(id)?503:404);if(!coord&&!accessToIssues.visible(c,id,row))fail('Solo el responsable puede acceder a esta incidencia; corresponde a otra persona.',403);return row;};
 const activeMember=(id:string)=>{const m=get('members',id);if(!m.active)fail('La persona seleccionada no está activa.');return m;};
 const checkCoord=()=>{if(!coord)fail('Esta acción corresponde a coordinación.',403);};
 const reason=()=>required(a.reason,'Motivo');
 const own=(id:string)=>{if(!coord&&id!==actorId)fail('Solo podés modificar tu propio trabajo.',403);if(coord&&id!==actorId)reason();};
 const version=(r:Row)=>{if(command.expectedVersion!==r.version)fail('Otra persona actualizó este registro. Conservamos tu formulario: recargá para revisar los cambios.',409);if(r.archived)fail('Restaurá el registro archivado antes de modificarlo.');};
 const lead=(p:Row)=>coord||p.leadId===actorId;
 const taskEditor=(t:Row)=>coord||t.ownerId===actorId||!!(t.projectId&&get('projects',t.projectId).leadId===actorId);
 const areaEditor=(original:Row)=>{const ar=effectiveArea(s,original,today);return coord||ar.leadId===actorId||(ar.substitutes??[]).includes(actorId);};
 const newRow=(c:Collection,v:Record<string,any>,id:string=crypto.randomUUID()):Row=>{const r:Row={...v,id,version:1,createdAt:at,updatedAt:at,updatedBy:actorId};d[c].push(r);return r;};
 const ensureWeek=(start:string)=>{validDate(start,'Fecha de inicio de la semana',true);if(weekStart(start)!==start)fail('Elegí un período que comience el lunes.');let w=d.weeks.find(x=>x.id===start);if(!w)w=newRow('weeks',{start,status:'Abierta',closeVersion:0},start);return w;};
 const openWeek=(id:string)=>{const w=ensureWeek(id);if(w.status==='Cerrada')fail('La semana está cerrada. Coordinación debe reabrirla con motivo.');return w;};
 const ensurePlan=(weekId:string,ownerId:string)=>{let p=d.plans.find(x=>x.weekId===weekId&&x.ownerId===ownerId);if(!p)p=newRow('plans',{weekId,ownerId,status:'Borrador',capacity:'Sin informar',capacityNote:''},`${weekId}:${ownerId}`);return p;};
 const snapshot=(kind:'plan'|'week'|'meeting',targetId:string,payload:any,ver:number)=>{s.snapshots.push({id:crypto.randomUUID(),kind,targetId,version:ver,at,actorId,reason:a.reason??'',payload:structuredClone(payload?.projects?{...payload,projects:[...payload.projects,...externalProjects],...(payload.areas?{areas:payload.areas.map((ar:Row)=>effectiveArea(s,ar,today)),areaAssignments:d.areaAssignments}: {})}:payload)});};
 const notify=(ownerId:string,type:string,targetType:Collection,targetId:string,text:string)=>{if(!d.members.some(m=>m.id===ownerId&&m.active))return;const key=`${ownerId}:${type}:${targetId}:${today}`;if(!d.notifications.some(n=>n.key===key))newRow('notifications',{ownerId,type,targetType,targetId,text,key,read:false});};
 const invalidateReady=(weekId:string,ownerId:string)=>{const p=ensurePlan(weekId,ownerId);if(p.status==='Lista para revisar'){p.status=p.confirmedAt?'Confirmada':'Borrador';p.readyAt=null;}return p;};
 const closed=(c:Row)=>openWeek(c.weekId);
 const requestForIssue=(i:Row,request:string,neededBy:string)=>{
  if(['Resuelta','Descartada'].includes(i.status))fail('Reabrí la incidencia antes de solicitar una intervención.');
  if(d.interventions.some(x=>x.issueId===i.id&&x.status!=='Resuelta'))fail('Ya existe una intervención activa para esta incidencia.');
  required(request,'Pedido concreto');validDate(neededBy,'Fecha deseada',true);
  const row=newRow('interventions',{issueId:i.id,request,neededBy,status:'Solicitada',requestedBy:actorId,requestedAt:at});
  d.members.filter(m=>m.active&&m.role==='Coordinación').forEach(m=>notify(m.id,'Intervención','interventions',row.id,request));return row;
 };
 const taskRefs=(t:Row)=>{t.collaborators=taskCollaborators(t.ownerId,t.collaborators??[]);activeMember(t.ownerId);for(const id of t.collaborators??[])activeMember(id);if(t.projectId){const p=get('projects',t.projectId);if(p.status!=='Activo'&&p.status!=='En preparación'&&!(coord&&a.reason))fail('El proyecto está pausado o cerrado. Reactivalo o indicá una justificación.');for(const id of [t.ownerId,...(t.collaborators??[])])if(!(p.members??[]).includes(id))fail('Responsable y colaboradores deben participar del proyecto.');}if(t.milestoneId){const m=get('milestones',t.milestoneId);if(!t.projectId||m.projectId!==t.projectId)fail('El hito debe pertenecer al mismo proyecto de la tarea.');}if(t.requiresValidation){if(!t.validatorId)fail('Seleccioná quién debe validar la tarea.');activeMember(t.validatorId);if(t.validatorId===t.ownerId)fail('El validador debe ser una persona diferente del responsable.');}};
 const addCommitment=(taskId:string,weekId:string,result:string,priority:boolean,targetDate?:string)=>{
  openWeek(weekId);const task=get('tasks',taskId);own(task.ownerId);if(terminals.includes(task.status))fail('Una tarea cerrada no se incorpora como compromiso.');required(result,'Resultado semanal');
  if(targetDate&&(targetDate<weekId||targetDate>=addDays(weekId,7)))fail('La fecha del compromiso debe pertenecer a la semana.');
  const plan=ensurePlan(weekId,task.ownerId);if(d.commitments.some(c=>c.taskId===taskId&&c.weekId===weekId))fail('Esta tarea ya tiene un compromiso en esa semana.',409);
  if(priority&&d.commitments.filter(c=>c.weekId===weekId&&c.ownerId===task.ownerId&&c.isPriority).length>=s.settings.priorityLimit)reason();
  invalidateReady(weekId,task.ownerId);return newRow('commitments',{taskId,weekId,ownerId:task.ownerId,originalOwnerId:task.ownerId,result,targetDate:targetDate||null,isPriority:priority,category:plan.confirmedAt?'Incorporada durante la semana':'Prevista',progress:'',outcome:null,outcomeNote:'',transferPending:false});
 };
 const transition=(t:Row,status:string,note:string,evidence?:string)=>{
  if(!taskStatuses.includes(status))fail('Estado de tarea inválido.');if(!taskEditor(t)&&!(t.status==='Para validar'&&actorId===t.validatorId))fail('No podés actualizar esta tarea.',403);
  if(t.archived)fail('Restaurá la tarea archivada antes de modificarla.');
  if(!['Terminada','Para validar','Cancelada'].includes(status)){
   const frozen=d.tasks.find(row=>['Terminada','Para validar'].includes(row.status)&&(row.dependsOnIds??[]).includes(t.id));
   if(frozen)fail('Reabrí primero '+frozen.title+' antes de reabrir este trabajo.');
  }
  if(status==='En curso'&&workBlockers(d.tasks,t).length)fail('Hay dependencias pendientes. Abrí Trabajo vinculado para ver qué debe terminar primero.');
  if(['Terminada','Para validar'].includes(status)){const problems=workClosureProblems(d.tasks,t);if(problems.length)fail(problems.join(' '));}
  if(terminals.includes(t.status)&&!['Pendiente','En curso'].includes(status))fail('Para reabrir una tarea elegí Pendiente o En curso.');
  if(terminals.includes(t.status))activeMember(t.ownerId);
  const hasEvidence=!!evidence||(t.links??[]).length>0||d.links.some(l=>l.targetType==='tasks'&&l.targetId===t.id&&!l.archived);
  if(status==='Para validar'&&!['En curso','En espera'].includes(t.status))fail('La tarea debe estar En curso o En espera antes de enviarla a validar.');
  if(status==='Cancelada'&&!taskEditor(t))fail('Solo el responsable, referente o coordinación puede cancelar la tarea.',403);
  if(t.status==='Para validar'&&status!=='Cancelada'){if(actorId!==t.validatorId&&!coord)fail('Solo el validador designado puede aprobar o devolver.',403);if(coord&&actorId!==t.validatorId)reason();if(!['Terminada','En curso'].includes(status))fail('Aprobá la entrega o devolvela a En curso.');required(note,'Observación de validación');}
  else if(status==='Terminada'&&t.requiresValidation)fail('Esta tarea requiere pasar por Para validar.');
  if(status==='Para validar'){if(!t.requiresValidation)fail('Esta tarea no requiere validación.');activeMember(t.validatorId);required(note,'Nota de entrega');}
  if(status==='Terminada'){required(note||evidence,'Resolución o evidencia');if(t.requiresEvidence&&!hasEvidence)fail('Esta entrega requiere un enlace de evidencia.');if(d.issues.some(i=>i.taskId===t.id&&!['Resuelta','Descartada'].includes(i.status)))fail('Resolvé las incidencias de la tarea antes de terminarla.');t.completedAt=at;if(t.status==='Para validar'){t.validatedBy=actorId;t.validatedAt=at;}}
  if(status==='Cancelada'||terminals.includes(t.status)||status==='Pendiente'&&t.status==='En curso')required(note||a.reason,'Motivo del cambio');
  if(status==='Cancelada'&&d.commitments.some(c=>c.taskId===t.id&&!c.outcome&&get('weeks',c.weekId).status!=='Cerrada'))fail('Resolvé los compromisos activos antes de cancelar la tarea.');
  if(status==='En espera'){if(!d.issues.some(i=>i.taskId===t.id&&['Espera','Bloqueo'].includes(i.type)&&!['Resuelta','Descartada'].includes(i.status)))fail('Registrá primero una espera o un bloqueo abierto.');if(t.status!=='En espera')t.previousStatus=t.status;}
  if(status==='Para validar'&&t.requiresEvidence&&!hasEvidence)fail('La tarea requiere evidencia antes de enviarla a validar.');
  if(terminals.includes(t.status)){t.completedAt=null;t.cancelledAt=null;t.validatedBy=null;t.validatedAt=null;}if(status==='Cancelada')t.cancelledAt=at;
  t.status=status;t.resolutionNote=note||t.resolutionNote;if(evidence)t.links=[...(t.links??[]),{title:'Evidencia',url:evidence}];
  if(status==='Para validar')notify(t.validatorId,'Validación','tasks',t.id,`Hay una entrega para validar: ${t.title}`);
  if(status==='En curso'&&input.data.tasks.find(x=>x.id===t.id)?.status==='Para validar')notify(t.ownerId,'Devolución','tasks',t.id,`Se devolvió la entrega: ${t.title}`);
 };
 let result:any={ok:true};
 switch(command.kind){
 case 'record_pilot_cycle':{
  checkCoord();const w=get('weeks',a.weekId),meeting=get('meetings',a.meetingId);if(w.status!=='Cerrada'||meeting.status!=='Cerrada'||meeting.weekId!==w.id||addDays(w.id,6)>today)fail('El ciclo debe corresponder a una semana completa cerrada, con su minuta cerrada.');
  if(a.confirmedObserved!==true)fail('Confirmá que el equipo realizó y observó este ciclo.');if(!Array.isArray(a.participants)||!a.participants.length)fail('Indicá quiénes participaron del ensayo.');for(const id of a.participants)get('members',id);
  const taskCreateSeconds=Number(a.taskCreateSeconds),statusActions=Number(a.statusActions);if(!Number.isFinite(taskCreateSeconds)||taskCreateSeconds<0||!Number.isInteger(statusActions)||statusActions<0)fail('Registrá mediciones válidas, sin valores negativos.');
  if(!['Conforme','Con observaciones'].includes(a.result))fail('Indicá el resultado de la revisión.');required(a.observations,'Observaciones del ciclo');if(a.evidence){let url;try{url=new URL(a.evidence);}catch{fail('La evidencia debe ser un enlace válido.');}if(!['https:','http:'].includes(url!.protocol))fail('La evidencia debe ser un enlace web.');}
  const current=d.pilotRuns.find(r=>r.weekId===w.id);if(current){version(current);reason();}const values={weekId:w.id,meetingId:meeting.id,participants:[...new Set(a.participants)],taskCreateSeconds,statusActions,result:a.result,observations:a.observations,evidence:a.evidence??null,confirmedObserved:true,observedBy:actorId,observedAt:at};const row=current?Object.assign(current,values):newRow('pilotRuns',values);result={id:row.id};break;
 }
 case 'save_preference':{if(!['initialView'].includes(a.key))fail('Preferencia no permitida.');let definition;try{definition=cleanView(a.definition);}catch(e){fail((e as Error).message);} let row=d.preferences.find(p=>p.ownerId===actorId&&p.key===a.key);if(row)row.definition=definition;else row=newRow('preferences',{ownerId:actorId,key:a.key,definition});result={id:row.id};break;}
 case 'assign_area_referent':{
  checkCoord();reason();const area=get('areas',a.areaId);activeMember(a.memberId);validDate(a.validFrom,'Inicio de la asignación',true);validDate(a.validTo,'Fin de la asignación');if(a.validTo&&a.validTo<a.validFrom)fail('La fecha final debe ser posterior al inicio.');if(!['principal','suplente'].includes(a.assignmentRole))fail('Elegí referente principal o suplente.');
  const records=d.areaAssignments.filter(r=>r.areaId===area.id&&!r.cancelled&&(r.assignmentRole==='principal'&&a.assignmentRole==='principal'||r.memberId===a.memberId&&r.assignmentRole===a.assignmentRole));
  for(const existing of records.filter(r=>overlaps({validFrom:r.validFrom,validTo:r.validTo},{validFrom:a.validFrom,validTo:a.validTo}))){if(!a.replaceCurrent)fail('La asignación se superpone con una vigente. Confirmá su reemplazo o elegí otro período.');if(existing.validFrom>=a.validFrom)existing.cancelled=true;else existing.validTo=addDays(a.validFrom,-1);}
  const assignment=newRow('areaAssignments',{areaId:area.id,memberId:a.memberId,assignmentRole:a.assignmentRole,validFrom:a.validFrom,validTo:a.validTo||null,cancelled:false});result={id:assignment.id};break;
 }
 case 'configure_project_tracking':{
  const source=externalProjects.find(p=>p.sourceId===a.sourceId)??fail('El proyecto compartido no está disponible.',404),current=d.projectLinks.find(p=>p.sourceId===source.sourceId);
  if(!coord&&current?.leadId!==actorId&&!mayPrioritize(s,actorId,source))fail('Coordinación o el referente del área debe asignar el seguimiento DU.',403);
  if(current){version(current);reason();}
  const manualMembers=a.manualMemberIds??a.members??[],manualAreas=a.manualAreaIds??[...(a.areaIds??[]),...(a.areaId?[a.areaId]:[])];if(!Array.isArray(manualMembers)||!Array.isArray(manualAreas))fail('Elegí personas y áreas válidas.');
  manualMembers.forEach(activeMember);manualAreas.forEach((id:string)=>{if(!get('areas',id).active)fail('El área no está activa.');});
  const assigned=resolveProjectAssignments(s,manualMembers,manualAreas,today),leadId=assigned.members.includes(a.leadId)?a.leadId:assigned.members.includes(current?.leadId)?current!.leadId:assigned.members[0]??null;
  const data={sourceId:source.sourceId,leadId,...assigned,areaId:assigned.areaIds.includes(a.areaId)?a.areaId:assigned.areaIds[0]??null,intervention:a.intervention??current?.intervention??'acompaña',areaPriorities:current?.areaPriorities??{}};
  if(current)Object.assign(current,data);else newRow('projectLinks',data);result={id:source.id};break;
 }
 case 'delete_update':{
  if(command.entity!=='comments')fail('La operación corresponde a una actualización de proyecto o tarea.',400);
  const entry=get('comments',command.entityId!);version(entry);
  if(entry.entryType!=='update'||!['projects','tasks'].includes(entry.targetType))fail('El registro no es una actualización de proyecto o tarea.',400);
  const target=get(entry.targetType,entry.targetId);
  if(target.archived)fail('Restaurá el proyecto o tarea antes de eliminar sus actualizaciones.');
  if(!(entry.targetType==='projects'?lead(target):taskEditor(target))||!coord&&entry.authorId!==actorId)fail('Solo el autor con permiso vigente o Coordinación puede eliminar esta actualización.',403);
  reason();if(a.confirmDeletion!==true)fail('Confirmá la eliminación de la actualización.');
  d.comments=d.comments.filter(row=>row.id!==entry.id);
  s.audit.push({id:crypto.randomUUID(),at,actorId,actorName:actor.name,actorEmail:actor.email??null,entity:'comments',entityId:entry.id,action:'eliminar actualización',before:structuredClone(entry),after:null,fields:Object.keys(entry),reason:a.reason,operationId:command.id,source:execution?.jobId?'proceso automático':'interfaz'});
  result={id:entry.id,entity:'comments',deleted:true};break;
 }
 case 'delete':{
  if(isManagementProject(command.entityId))fail('El proyecto compartido se elimina desde su ficha del Tablero; su seguimiento DU no elimina el proyecto original.');const entity=command.entity as Deletable;if(!['tasks','projects','issues'].includes(entity))fail('Solo se pueden eliminar tareas, proyectos e incidencias.',400);
  const r=get(entity,command.entityId!);if(!mayDelete({...s,externalProjects},actorId,entity,r))fail('Solo el responsable, referente o Coordinación puede eliminar este registro.',403);
  if(command.expectedVersion!==r.version)fail('El registro cambió. Volvé a abrir la confirmación para revisar los datos.',409);
  reason();if(a.confirmDeletion!==true)fail('Confirmá la eliminación del registro.');
  const plan=deletionPlan(s,entity,r.id);if(deletionImpactKey(a.impactKey)!==plan.key)fail('Los vínculos del registro cambiaron. Cerrá el formulario y volvé a revisar la eliminación.',409);
  for(const change of plan.detached)Object.assign(get(change.entity,change.id),change.after);
  for(const ref of plan.removed){Object.assign(ref.row,{deletedAt:at,deletedBy:actorId,deletionId:command.id,deletionRoot:ref.row===r,deletionReason:a.reason,deletionArchived:!!ref.row.archived,archived:true});d[ref.entity]=d[ref.entity].filter(x=>x.id!==ref.row.id);deleted[ref.entity].push(ref.row);}
  r.deletionDetaches=plan.detached;
  for(const ref of plan.removed.filter(x=>x.entity==='commitments'))if(d.weeks.find(w=>w.id===ref.row.weekId)?.status!=='Cerrada')invalidateReady(ref.row.weekId,ref.row.ownerId);
  result={id:r.id,entity,deleted:true};break;
 }
 case 'purge_deleted':{
  const entity=command.entity as Deletable;if(!['tasks','projects','issues'].includes(entity))fail('Solo se pueden borrar definitivamente tareas, proyectos e incidencias de la Papelera.',400);
  const r=deleted[entity].find(x=>x.id===command.entityId&&x.deletionRoot)??fail('El registro ya no está en la Papelera.',404);
  if(!mayDelete(input,actorId,entity,r))fail('No tenés permiso para borrar definitivamente este registro.',403);
  if(command.expectedVersion!==r.version)fail('La Papelera cambió. Actualizá los datos y revisá la confirmación.',409);
  reason();if(a.confirmPermanentDeletion!==true)fail('Confirmá que entendés que el registro no se podrá recuperar.');
  if(!r.deletionId)fail('No se pudo identificar el conjunto eliminado.',409);
  let removed=0;
  for(const c of collections){const batch=deleted[c].filter(x=>x.deletionId===r.deletionId);deleted[c]=deleted[c].filter(x=>x.deletionId!==r.deletionId);for(const row of batch){removed++;s.audit.push({id:crypto.randomUUID(),at,actorId,actorName:actor.name,actorEmail:actor.email??null,entity:c,entityId:row.id,action:'eliminar definitivamente',before:structuredClone(row),after:null,fields:Object.keys(row),reason:a.reason,operationId:command.id,source:execution?.jobId?'proceso automático':'interfaz'});}}
  result={id:r.id,entity,purged:true,removed};break;
 }
 case 'restore_deleted':{
  const entity=command.entity as Deletable;if(!['tasks','projects','issues'].includes(entity))fail('Tipo de registro inválido.',400);
  const r=deleted[entity].find(x=>x.id===command.entityId&&x.deletionRoot)??fail('El registro ya no está en la Papelera.',404);
  if(!mayDelete(input,actorId,entity,r))fail('No tenés permiso para recuperar este registro.',403);
  if(command.expectedVersion!==r.version)fail('La Papelera cambió. Actualizá los datos.',409);reason();
  const batch=r.deletionId,detaches:Detachment[]=r.deletionDetaches??[];let skipped=0;
  for(const c of collections){const restore=deleted[c].filter(x=>x.deletionId===batch);deleted[c]=deleted[c].filter(x=>x.deletionId!==batch);for(const row of restore){if(d[c].some(x=>x.id===row.id))fail('Ya existe un registro con ese identificador.',409);row.archived=!!row.deletionArchived;for(const key of ['deletedAt','deletedBy','deletionId','deletionRoot','deletionReason','deletionArchived','deletionDetaches'])delete row[key];d[c].push(row);}}
  if(entity==='tasks'){if(r.projectId&&![...d.projects,...externalProjects].some(p=>p.id===r.projectId)){r.deletedProjectTitle=input.data.projects.find(p=>p.id===r.projectId)?.title??'Proyecto eliminado';r.projectId=null;r.milestoneId=null;}if(r.milestoneId&&!d.milestones.some(m=>m.id===r.milestoneId&&m.projectId===r.projectId))r.milestoneId=null;
   if(r.parentTaskId&&!d.tasks.some(t=>t.id===r.parentTaskId)){r.deletedParentTitle=input.data.tasks.find(t=>t.id===r.parentTaskId)?.title??'Trabajo eliminado';r.parentTaskId=null;}
   const missing=(r.dependsOnIds??[]).filter((id:string)=>!d.tasks.some(t=>t.id===id));if(missing.length){r.removedDependencyTitles=[...(r.removedDependencyTitles??[]),...missing.map((id:string)=>input.data.tasks.find(t=>t.id===id)?.title??'Trabajo eliminado')];r.dependsOnIds=r.dependsOnIds.filter((id:string)=>!missing.includes(id));}
  }
  if(entity==='issues'){
   for(const [field,collection,titleField,fallback] of [['taskId','tasks','deletedTaskTitle','Tarea eliminada'],['projectId','projects','deletedProjectTitle','Proyecto eliminado']] as const){if(r[field]&&![...d[collection],...(collection==='projects'?externalProjects:[])].some(x=>x.id===r[field])){r[titleField]=input.data[collection].find(x=>x.id===r[field])?.title??[...input.audit].reverse().find(e=>e.entity===collection&&e.entityId===r[field]&&e.before)?.before?.title??fallback;r[field]=null;}}
  }
  for(const change of detaches){const row=d[change.entity].find(x=>x.id===change.id);if(!row||row.version!==change.version||Object.entries(change.after).some(([key,value])=>JSON.stringify(row[key])!==JSON.stringify(value))){skipped++;continue;}for(const key of Object.keys(change.after)){if(change.before[key]===undefined)delete row[key];else row[key]=change.before[key];}}
  if(entity==='tasks')taskRefs(r);else activeMember(entity==='issues'?r.ownerId:r.leadId);
  if(entity==='tasks')for(const c of d.commitments.filter(x=>x.taskId===r.id))if(d.weeks.find(w=>w.id===c.weekId)?.status!=='Cerrada')invalidateReady(c.weekId,c.ownerId);
  result={id:r.id,entity,restored:true,skipped};break;
 }
 case 'create':case 'update':{
  const c=command.entity!;if(!c||!Object.hasOwn(fields,c))fail('Esta entidad se modifica con una operación específica.',400);
  if(c==='projects'&&isManagementProject(command.entityId))fail('Editá los datos compartidos desde la ficha del proyecto. Para el equipo y las carteras usá Configurar seguimiento DU.');const updating=command.kind==='update',r=updating?get(c,command.entityId!):null;if(r)version(r);
  for(const key of ['members','areaIds','collaborators','dependsOnIds','tags','substitutes','attendees','durations','links','documents','presentIds','excusedIds','selectedUpdateIds','selectedCommitmentIds'])if(key in a&&!Array.isArray(a[key]))fail(`El campo ${key} debe ser una lista.`,400);
  if(c==='areaContacts'){const area=get('areas',a.areaId??r?.areaId);if(!areaEditor(area)||r&&!areaEditor(get('areas',r.areaId)))fail('Solo Coordinación o los referentes vigentes pueden administrar estos contactos.',403);if(r)reason();}
  if(c==='members'||c==='catalogs'){checkCoord();if(r)reason();}
  if(c==='areas'){if(r){if(!areaEditor(r))fail('No sos referente de esta cartera.',403);if(!coord&&['leadId','substitutes','parentId','active','name','acronym'].some(k=>k in a&&JSON.stringify(a[k])!==JSON.stringify(r[k])))fail('La estructura de áreas corresponde a coordinación.',403);reason();}else checkCoord();}
  if(c==='projects'){
   if(a.manualMemberIds!==undefined||a.manualAreaIds!==undefined){if(!Array.isArray(a.manualMemberIds??[])||!Array.isArray(a.manualAreaIds??[]))fail('Elegí personas y áreas válidas.');const assigned=resolveProjectAssignments(s,a.manualMemberIds??a.members??r?.members??[],a.manualAreaIds??a.areaIds??r?.areaIds??[],today);Object.assign(a,assigned);if(!assigned.areaIds.includes(a.areaId))a.areaId=assigned.areaIds[0]??null;}

   if(!r&&!coord&&a.leadId&&a.leadId!==actorId)fail('Un integrante queda como referente inicial del proyecto que crea.',403);
   if(r&&!lead(r))fail('Solo el referente o coordinación puede editar el proyecto.',403);
   if(!r&&a.scope==='area'&&a.areaId&&!areaEditor(get('areas',a.areaId)))fail('No podés crear proyectos en esa cartera.',403);
   if(!r&&!coord&&(a.areaId||a.areaIds?.length)){
    if(!a.areaId)fail('Elegí tu propia cartera como área implementadora principal. Para trabajo propio DU, dejá las áreas sin asignar.');
    if(!areaEditor(get('areas',a.areaId)))fail('Solo podés vincular inicialmente tu propia cartera. Para otra área, pedí el vínculo a Coordinación.',403);
    if((a.areaIds??[]).some((id:string)=>id!==a.areaId))fail('Vincular otras áreas involucradas requiere Coordinación.',403);
   }
   if(r&&['leadId','areaId','areaIds'].some(k=>k in a&&JSON.stringify(a[k])!==JSON.stringify(r[k]))){if(!lead(r))checkCoord();reason();}
  }
  if(c==='tasks'){
   if(a.parentTaskId!==undefined&&a.parentTaskId!==null&&a.parentTaskId!=='')fail('Las subtareas ya no están disponibles. Usá una tarea y su descripción. Recargá la app para continuar.');
   if(r&&!taskEditor(r))fail('No podés modificar esta tarea.',403);
   if(r&&'ownerId'in a&&a.ownerId!==r.ownerId)fail('Usá Reasignar para revisar el impacto en compromisos.');
   if(!r&&!coord){if(a.projectId){const p=get('projects',a.projectId);if(!lead(p)&&!p.members.includes(actorId))fail('No participás de este proyecto.',403);if(a.ownerId!==actorId&&!lead(p))fail('Asigná la nueva tarea a tu nombre.',403);}else if(a.ownerId&&a.ownerId!==actorId)fail('La tarea independiente se asigna inicialmente a vos.',403);}
   if(r&&['dueDate','projectId','milestoneId','description','dependsOnIds'].some(k=>k in a&&JSON.stringify(k==='dependsOnIds'?a[k]??[]:a[k]||null)!==JSON.stringify(k==='dependsOnIds'?r[k]??[]:r[k]||null)))reason();
   if(r?.status==='Para validar'&&['requiresValidation','validatorId','requiresEvidence'].some(k=>k in a&&a[k]!==r[k]))fail('Devolvé la tarea a En curso antes de cambiar su validación.');
  }
  if(c==='milestones'){const p=get('projects',a.projectId??r?.projectId);if(!lead(p)||r&&!lead(get('projects',r.projectId)))fail('Solo el referente puede modificar hitos.',403);if(r&&a.projectId&&a.projectId!==r.projectId){reason();if(d.tasks.some(t=>t.milestoneId===r.id)||d.projects.some(p=>p.nextMilestoneId===r.id))fail('Desvinculá las tareas y el próximo paso antes de mover el hito.');}if(r&&a.dueDate!==undefined&&a.dueDate!==r.dueDate)reason();}
  if(c==='issues'&&!coord){if(r&&r.ownerId!==actorId)fail('Solo el responsable puede modificar esta incidencia.',403);if(a.ownerId&&a.ownerId!==actorId)fail('Coordinación debe asignar incidencias a otra persona.',403);}
  if(c==='meetings')checkCoord();
  if(c==='recurrences'){if(r){own(r.ownerId);if(a.ownerId&&a.ownerId!==r.ownerId){checkCoord();reason();}}else if(a.ownerId&&a.ownerId!==actorId&&!coord)fail('Creá recurrencias a tu nombre.',403);}
  if(c==='comments'||c==='links'){const targetType=a.targetType??r?.targetType;if(!['projects','tasks','milestones','areas','commitments','issues','interventions','decisions','meetings'].includes(targetType))fail('El destino no es válido.',400);get(targetType,a.targetId??r?.targetId);if(r&&r.authorId!==actorId)fail('No podés editar el comentario o enlace de otra persona.',403);}
  if(c==='comments'){
   const entryType=a.entryType??r?.entryType??'comment';if(!['comment','update'].includes(entryType))fail('El tipo de publicación no es válido.',400);
   if(r&&entryType!==(r.entryType??'comment'))fail('No se puede cambiar el tipo de una publicación existente.');
   if(entryType==='update'){
    const targetType=a.targetType??r?.targetType,targetId=a.targetId??r?.targetId;
    if(!['projects','tasks'].includes(targetType))fail('Las actualizaciones corresponden a proyectos o tareas.');
    if(r&&(targetType!==r.targetType||targetId!==r.targetId))fail('La actualización debe conservar su proyecto o tarea original.');
    const target=get(targetType,targetId);if(target.archived)fail('Restaurá el registro archivado antes de agregar o editar actualizaciones.');
    if(!(targetType==='projects'?lead(target):taskEditor(target)))fail('Solo quien administra este proyecto o tarea puede registrar actualizaciones.',403);
   }
  }
  if(c==='filters'){if(r&&r.ownerId!==actorId&&!coord)fail('Este filtro pertenece a otra persona.',403);if(a.shared)checkCoord();}
  const values=pick(a,fields[c]!);let row=r??newRow(c,{...values}),interventionId:string|undefined;if(r)Object.assign(row,values);
  if(c==='projects'){
   required(row.title,'Nombre');required(row.outcome,'Resultado esperado');row.leadId=row.leadId??actorId;activeMember(row.leadId);row.members=[...new Set([row.leadId,...(row.members??[])])];row.members.forEach(activeMember);row.kind=row.kind??'project';row.scope=row.scope??'du';row.status=row.status??'En preparación';row.delivery=row.delivery??'Sin evaluar';row.duPriority=row.duPriority??false;row.areaIds=[...new Set([...(row.areaIds??[]),...(row.areaId?[row.areaId]:[])])];row.areaIds.forEach((id:string)=>get('areas',id));row.areaPriorities=row.areaPriorities??{};
   if(!r)row.createdBy=actorId;
   if(!['project','ongoing'].includes(row.kind)||!['du','area'].includes(row.scope))fail('Tipo o ámbito de proyecto inválido.');
   if(row.intervention&&!['ejecuta','coordina','acompaña'].includes(row.intervention))fail('Intervención DU inválida.');
   if(row.nextMilestoneId){const next=get('milestones',row.nextMilestoneId);if(next.projectId!==row.id)fail('El próximo hito debe pertenecer al mismo proyecto.');}
   if(row.status==='Activo'&&(!row.intervention||!row.nextMilestoneId&&(!row.nextStep||!row.nextDate)||row.intervention==='acompaña'&&!row.areaId))fail('Un proyecto activo necesita intervención DU, área implementadora cuando corresponda y próximo paso con fecha.');
   for(const task of d.tasks.filter(t=>t.projectId===row.id&&!terminals.includes(t.status))){if([task.ownerId,...(task.collaborators??[])].some(id=>!row.members.includes(id)))fail('Reasigná las tareas antes de quitar a sus responsables o colaboradores de los participantes.');}
   for(const milestone of d.milestones.filter(m=>m.projectId===row.id&&!['Logrado','Cancelado'].includes(m.status))){if(milestone.ownerType==='du'&&!row.members.includes(milestone.ownerId))fail('Reasigná los hitos antes de quitar a sus responsables.');if(milestone.ownerType==='area'&&!row.areaIds.includes(milestone.areaId))fail('El área tiene hitos pendientes; resolvelos antes de quitar el vínculo.');}
  }
  if(c==='tasks'){
   const original=input.data.tasks.find(task=>task.id===row.id),previousAreas=original?taskAreaIds(original):[];
   if(a.areaIds!==undefined)row.areaIds=[...new Set(a.areaIds)];
   else if(a.assignmentMode==='individual')row.areaIds=[];
   else if(a.areaId!==undefined)row.areaIds=a.areaId?[a.areaId]:[];
   else row.areaIds=taskAreaIds(row);
   for(const id of row.areaIds){if(typeof id!=='string'||!id)fail('Elegí áreas válidas.');const area=get('areas',id);if(!area.active&&!previousAreas.includes(id))fail('El área seleccionada no está activa.');}
   row.areaId=row.areaIds[0]??null;row.assignmentMode=row.areaIds.length?'area':'individual';
   if(a.panelPriority!==undefined&&typeof a.panelPriority!=='boolean')fail('La prioridad del panel debe estar marcada o desmarcada.');
   if('priority'in a&&a.panelPriority===undefined)delete row.panelPriority;
   if(row.referenceUrl!==undefined){if(typeof row.referenceUrl!=='string')fail('Ingresá un enlace válido.');row.referenceUrl=row.referenceUrl.trim();}
   required(row.title,'Título');row.ownerId=row.ownerId??actorId;row.status=row.status??'Pendiente';row.priority=row.priority??'Media';row.collaborators=[...new Set(row.collaborators??[])];row.requiresValidation=!!row.requiresValidation;row.requiresEvidence=!!row.requiresEvidence;row.originalDueDate=row.originalDueDate??row.dueDate??null;row.code=row.code??nextTaskCode();taskRefs(row);if(!r)notify(row.ownerId,'Asignación','tasks',row.id,`Se te asignó: ${row.title}`);
   if(a.workType&&a.workType!=='task'||retiredWorkFields.slice(1).some(key=>a[key]!==undefined))fail('Esta opción ya no está disponible. Usá una tarea y su descripción. Recargá la app para continuar.');
   if(r&&a.description===undefined)row.description=taskDescription(r);
   for(const key of retiredWorkFields)delete row[key];
   row.parentTaskId=null;row.dependsOnIds=[...new Set(row.dependsOnIds??[])];
   delete row.deletedParentTitle;
   if(r&&'dependsOnIds'in a)delete row.removedDependencyTitles;
   if(!['Alta','Media','Baja'].includes(row.priority))fail('Prioridad de tarea inválida.');row.collaborators.forEach(activeMember);
   if(r&&r.projectId!==input.data.tasks.find(x=>x.id===r.id)?.projectId&&row.milestoneId){const m=get('milestones',row.milestoneId);if(m.projectId!==row.projectId)fail('Seleccioná un hito compatible al mover la tarea.');}
  }
  if(c==='milestones'){
   required(row.title,'Título');required(row.criteria,'Criterio de aceptación');row.status=row.status??'Pendiente';row.ownerType=row.ownerType??'du';row.originalDueDate=row.originalDueDate??row.dueDate;
   const p=get('projects',row.projectId);if(row.ownerType==='area'){if(!p.areaIds?.includes(row.areaId))fail('El área ejecutora debe estar vinculada al proyecto.');row.ownerId=null;}else{activeMember(row.ownerId);if(!p.members.includes(row.ownerId))fail('El responsable del hito debe participar del proyecto.');row.areaId=null;}
   if(!['du','area'].includes(row.ownerType))fail('El responsable de ejecución del hito debe ser DU o área.');
  }
  if(c==='issues'){
   required(row.title,'Descripción');const preserved=!!r&&!row.taskId&&!row.projectId&&(r.deletedTaskTitle||r.deletedProjectTitle);if(!preserved&&!!row.taskId===!!row.projectId)fail('Vinculá exactamente una tarea o un proyecto.');if(row.taskId)get('tasks',row.taskId);else if(row.projectId)get('projects',row.projectId);if(row.taskId||row.projectId){delete row.deletedTaskTitle;delete row.deletedProjectTitle;}activeMember(row.ownerId);required(row.impact,'Impacto');required(row.nextAction,'Próxima gestión');if(!row.followUpDate)fail('Indicá la fecha de seguimiento.');if(!['Espera','Bloqueo','Riesgo'].includes(row.type))fail('Tipo de incidencia inválido.');if(row.type==='Espera')required(row.dependency,'De quién se espera');if(row.type==='Riesgo'){required(row.mitigation,'Mitigación');if(!['Baja','Media','Alta'].includes(row.probability))fail('Elegí la probabilidad.');}row.initialType=row.initialType??row.type;row.status=row.status??'Abierta';row.detectedAt=row.detectedAt??today;
   if('requestIntervention'in a&&typeof a.requestIntervention!=='boolean')fail('Indicá si querés solicitar intervención.',400);
   if(a.requestIntervention){if(r)fail('Usá Pedir intervención para solicitar ayuda sobre esta incidencia.');interventionId=requestForIssue(row,a.interventionRequest,a.interventionNeededBy).id;}
  }
  if(c==='meetings'){
   row.durations=meetingSegments.map(([key,,fallback],index)=>Number(a[key]??row.durations?.[index]??fallback));if(row.durations.some((n:number)=>!Number.isInteger(n)||n<0)||row.durations.length!==4)fail('Los tiempos de reunión deben ser minutos enteros, sin valores negativos.');for(const [key] of meetingSegments)delete row[key];
   if('presentIds'in a||'excusedIds'in a){const present=a.presentIds??[],excused=a.excusedIds??[];if([...present,...excused].some(id=>!row.attendees.includes(id))||present.some((id:string)=>excused.includes(id)))fail('Revisá la asistencia: cada persona prevista debe tener una sola condición.');row.attendance=Object.fromEntries(row.attendees.map((id:string)=>[id,present.includes(id)?'Presente':excused.includes(id)?'Ausencia justificada':'Ausente']));delete row.presentIds;delete row.excusedIds;}
   for(const id of row.selectedUpdateIds??[]){const update=get('comments',id);if(update.entryType!=='update')fail('Seleccioná actualizaciones de trabajo.');}
   for(const id of row.selectedCommitmentIds??[])get('commitments',id);
   required(row.title,'Título');if(!row.date)fail('Indicá fecha y hora.');ensureWeek(row.weekId);ensureWeek(row.planningWeekId);row.status=row.status??'Borrador';row.closeVersion=row.closeVersion??0;row.attendees?.forEach(activeMember);if(r?.status==='Cerrada')fail('Reabrí la reunión antes de editar.');}
  if(c==='members'){
   if(s.accessMode==='institutional'){
    if(typeof row.active!=='boolean')fail('El acceso debe estar habilitado o deshabilitado.');
    if(row.active&&!row.email)fail('Para activar el acceso hace falta el correo institucional exacto.');
    if(r&&input.data.members.find(m=>m.id===r.id)?.email!==row.email){row.authUserId=null;row.setupStatus='Autorizado; pendiente de primer acceso';}
    if(!row.email)row.setupStatus='Pendiente de correo autorizado';
   }
   required(row.name,'Nombre');if(!['Coordinación','Integrante'].includes(row.role))fail('Rol inválido.');if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))fail('Correo inválido.');if(row.email){row.email=row.email.trim().toLowerCase();if(d.members.some(x=>x.id!==row.id&&x.email===row.email))fail('Ese correo ya está autorizado.');}
   if(row.active===false){if(row.role==='Coordinación'&&!d.members.some(x=>x.id!==row.id&&x.active&&x.role==='Coordinación'))fail('No se puede desactivar al último coordinador.');if(d.tasks.some(t=>t.ownerId===row.id&&!terminals.includes(t.status))||d.projects.some(p=>p.leadId===row.id&&!['Finalizado','Cancelado'].includes(p.status))||d.projectLinks.some(p=>p.leadId===row.id&&!externalProjects.some(source=>source.sourceId===p.sourceId&&['Finalizado','Cancelado'].includes(source.status)))||d.areas.some(ar=>ar.active&&ar.leadId===row.id)||d.interventions.some(i=>i.takenBy===row.id&&i.status!=='Resuelta'))fail('Reasigná primero tareas, proyectos, áreas e intervenciones pendientes.');d.recurrences.filter(rr=>rr.ownerId===row.id).forEach(rr=>{rr.active=false;rr.pendingReassignment=true;});}
   if(row.id===actorId&&row.active===false)fail('Para desactivar este perfil, primero cambiá a otro perfil de coordinación.');
   if(row.active===false&&d.tasks.some(t=>!terminals.includes(t.status)&&t.requiresValidation&&t.validatorId===row.id))fail('Reasigná las validaciones pendientes antes de desactivar a la persona.');
   if(row.active===false&&d.areaAssignments.some(assignment=>assignment.memberId===row.id&&!assignment.cancelled&&(!assignment.validTo||assignment.validTo>=today)))fail('Reasigná las responsabilidades de áreas vigentes o futuras antes de desactivar a la persona.');
   if(row.active===false&&(d.issues.some(i=>i.ownerId===row.id&&!['Resuelta','Descartada'].includes(i.status))||d.decisions.some(i=>i.ownerId===row.id&&i.status==='Abierta')||d.milestones.some(m=>m.ownerType==='du'&&m.ownerId===row.id&&!['Logrado','Cancelado'].includes(m.status))))fail('Reasigná o resolvé las incidencias, acuerdos e hitos pendientes antes de desactivar a la persona.');
   if(!d.members.some(x=>x.active&&x.role==='Coordinación'))fail('Debe existir al menos un coordinador activo.');
  }
  if(c==='areas'){required(row.name,'Nombre del área');activeMember(row.leadId);row.substitutes=row.substitutes??[];row.substitutes.forEach(activeMember);row.active=row.active??true;if(row.active===false&&d.projects.some(p=>p.areaIds?.includes(row.id)&&!['Finalizado','Cancelado'].includes(p.status)))fail('Resolvé la continuidad de los proyectos del área antes de desactivarla.');}
  if(c==='areas'&&d.areas.some(x=>x.id!==row.id&&normalize(x.name.trim())===normalize(row.name.trim())&&(x.parentId||null)===(row.parentId||null)))fail('Ya existe un área con ese nombre en la misma dependencia.');
  if(c==='comments'){required(row.body,row.entryType==='update'?'Actualización':'Comentario');if(r){row.previousVersions=[...(r.previousVersions??[]),{body:input.data.comments.find(x=>x.id===r.id)?.body,at}];row.edited=true;}row.authorId=row.authorId??actorId;if(row.entryType==='update')row.authorName=row.authorName??actor.name;}
  if(c==='areaContacts'){required(row.name||row.position,'Nombre o función del contacto');if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))fail('Ingresá un correo institucional válido.');row.active=row.active??true;}
  if(c==='links'){required(row.title,'Título');safeUrl(row.url);row.authorId=row.authorId??actorId;}
  if(c==='recurrences'){required(row.title,'Título');row.collaborators=taskCollaborators(row.ownerId,row.collaborators??[]);activeMember(row.ownerId);for(const id of row.collaborators??[])activeMember(id);if(!['Alta','Media','Baja'].includes(row.priority??'Media'))fail('Prioridad inválida.');if(!['Semanal','Mensual'].includes(row.frequency))fail('Frecuencia inválida.');if(!row.startsOn)fail('Indicá fecha inicial.');if(row.frequency==='Mensual'&&!(row.monthday>=1&&row.monthday<=31))fail('El día debe estar entre 1 y 31.');row.active=row.active??true;}
  if(c==='recurrences'){if(row.frequency==='Semanal'&&(!Number.isInteger(Number(row.weekday))||Number(row.weekday)<0||Number(row.weekday)>6))fail('Elegí un día de la semana entre domingo y sábado.');if(row.frequency==='Mensual'&&!Number.isInteger(Number(row.monthday)))fail('El día del mes debe ser un número entero.');if(row.endsOn&&row.endsOn<row.startsOn)fail('La fecha final debe ser posterior a la inicial.');if(row.projectId){const p=get('projects',row.projectId);if([row.ownerId,...(row.collaborators??[])].some(id=>!p.members.includes(id)))fail('Responsable y colaboradores deben participar del proyecto de la recurrencia.');}if(row.requiresValidation){activeMember(row.validatorId);if(row.ownerId===row.validatorId)fail('El validador debe ser diferente del responsable.');}}
  if(c==='filters'){required(row.name,'Nombre del filtro');row.ownerId=row.ownerId??actorId;if(row.scope?.startsWith('view:')){try{row.definition=cleanView(row.definition);}catch(e){fail((e as Error).message);}if(row.scope!=='view:'+row.definition.page)fail('La vista no coincide con su sección.');}}
  result={id:row.id,...(interventionId?{interventionId}:{})};break;
 }
 case 'transition_task':{const t=get('tasks',command.entityId!);version(t);transition(t,a.status,a.note??'',a.evidence);break;}
 case 'bulk_tasks':{
  if(!Array.isArray(a.taskIds)||!a.taskIds.length||a.taskIds.length>100)fail('Seleccioná entre 1 y 100 tareas.');
  const results:any[]=[];for(const id of [...new Set(a.taskIds)] as string[]){const t=d.tasks.find(t=>t.id===id);if(!t){results.push({id,ok:false,error:'No disponible'});continue;}const previous=structuredClone(t),notificationCount=d.notifications.length;try{if(t.archived)fail('Registro archivado');if(a.versions?.[id]!==t.version)fail('La versión cambió.',409);if(!taskEditor(t))fail('Sin permiso para esta tarea.',403);if(a.status)transition(t,a.status,a.note??'');if(a.tags){if(!Array.isArray(a.tags))fail('Etiquetas inválidas.');for(const tag of a.tags)if(!d.catalogs.some(c=>c.id===tag&&c.type==='Etiqueta'&&c.active))fail('Etiqueta no disponible.');t.tags=[...new Set([...(t.tags??[]),...a.tags])];}results.push({id,title:t.title,ok:true});}catch(e){d.tasks[d.tasks.findIndex(x=>x.id===id)]=previous;d.notifications.splice(notificationCount);results.push({id,title:t.title,ok:false,error:(e as Error).message});}}result={results};break;
 }
 case 'reassign_task':{
  const t=get('tasks',command.entityId!);version(t);if(!coord&&!(t.projectId&&lead(get('projects',t.projectId))))fail('La reasignación corresponde al referente o coordinación.',403);reason();activeMember(a.ownerId);if(t.projectId&&!get('projects',t.projectId).members.includes(a.ownerId))fail('Agregá primero a la persona como participante.');t.ownerId=a.ownerId;t.areaIds=taskAreaIds(t);t.areaId=t.areaIds[0]??null;t.assignmentMode=t.areaIds.length?'area':'individual';
  taskRefs(t);d.commitments.filter(c=>c.taskId===t.id&&get('weeks',c.weekId).status!=='Cerrada'&&!c.outcome).forEach(c=>{invalidateReady(c.weekId,c.ownerId);c.ownerId=a.ownerId;c.transferPending=true;invalidateReady(c.weekId,a.ownerId);});notify(a.ownerId,'Reasignación','tasks',t.id,`Reconocé el compromiso transferido de ${t.title}`);break;
 }
 case 'project_status':{if(isManagementProject(command.entityId))fail('El ciclo del proyecto compartido se modifica desde su ficha original.');
  const p=get('projects',command.entityId!);version(p);if(!lead(p))fail('Solo el referente puede cambiar el ciclo.',403);if(!['En preparación','Activo','Pausado','Finalizado','Cancelado'].includes(a.status))fail('Ciclo inválido.');
  if(a.status==='Activo'){if(!p.intervention||!p.nextStep&&!p.nextMilestoneId||!p.nextDate&&!p.nextMilestoneId)fail('Para activar, completá intervención DU, próximo paso y fecha de revisión.');if(p.intervention==='acompaña'&&!p.areaId)fail('Un proyecto de monitoreo necesita un área implementadora.');if(['Finalizado','Cancelado','Pausado'].includes(p.status))reason();}
  if(['Pausado','Cancelado'].includes(a.status))reason();
  if(['Finalizado','Cancelado'].includes(a.status)&&[...d.tasks.filter(t=>t.projectId===p.id&&!terminals.includes(t.status)),...d.milestones.filter(m=>m.projectId===p.id&&!['Logrado','Cancelado'].includes(m.status)),...d.issues.filter(i=>i.projectId===p.id&&!['Resuelta','Descartada'].includes(i.status))].length)fail('Resolvé o trasladá tareas, hitos e incidencias abiertos antes de cerrar el proyecto.');p.status=a.status;break;
 }
 case 'review_project':{if(isManagementProject(command.entityId))fail('Registrá la actualización compartida desde la ficha original.');const p=get('projects',command.entityId!);version(p);if(!lead(p))fail('Solo el referente o coordinación puede revisar.',403);required(a.summary,'Qué cambió');if(!deliveryStatuses.includes(a.delivery))fail('Valoración inválida.');required(a.rationale,'Fundamento');if(coord&&p.leadId!==actorId)reason();Object.assign(p,{delivery:a.delivery,rationale:a.rationale,nextStep:a.nextStep||p.nextStep,nextDate:a.nextDate||p.nextDate,reviewedAt:today,reviewSummary:a.summary,risk:a.risk??'',decisionNeeded:a.decisionNeeded??'',sourceType:a.sourceType??'du_assessment',sourceDate:a.sourceDate??today});break;}
 case 'set_priority':{
  const p=get('projects',command.entityId!);reason();const order=Number(a.order);if(!Number.isInteger(order)||order<0)fail('Ingresá un orden válido.');
  if(!a.areaId&&!mayPrioritize(s,actorId,p))fail('Solo Coordinación o el referente de seguimiento puede marcar esta prioridad DU.',403);
  const target=(p.external?(d.projectLinks.find(l=>l.sourceId===p.sourceId)??(!a.areaId?newRow('projectLinks',{sourceId:p.sourceId,leadId:null,areaIds:[],areaPriorities:{},duPriority:false,intervention:'acompaña'}):undefined)):p)??fail('Configurá el seguimiento DU antes de ordenar la cartera.');version(target);
  if(a.areaId){const ar=get('areas',a.areaId);if(!areaEditor(ar))fail('No sos referente de esta cartera.',403);if(!(target.areaIds??[]).includes(ar.id))fail('El proyecto no está vinculado a esa área.');
   const all=[...d.projects,...d.projectLinks];target.areaPriorities={...target.areaPriorities,[ar.id]:{selected:!!a.selected,order}};
   const list=all.filter(x=>x!==target&&x.areaPriorities?.[ar.id]?.selected).sort((x,y)=>x.areaPriorities[ar.id].order-y.areaPriorities[ar.id].order||x.id.localeCompare(y.id));if(a.selected)list.splice(Math.min(order,list.length),0,target);list.forEach((x,i)=>{x.areaPriorities[ar.id].order=i;});
  }else{target.duPriority=!!a.selected;target.priorityOrder=order;const list=[...d.projects,...d.projectLinks].filter(x=>x!==target&&x.duPriority).sort((x,y)=>x.priorityOrder-y.priorityOrder||x.id.localeCompare(y.id));if(a.selected)list.splice(Math.min(order,list.length),0,target);list.forEach((x,i)=>{x.priorityOrder=i;});}break;
 }

 case 'link_project_area':{checkCoord();reason();const p=get('projects',a.projectId);get('areas',a.areaId);const target=p.external?(d.projectLinks.find(l=>l.sourceId===p.sourceId)??newRow('projectLinks',{sourceId:p.sourceId,leadId:null,members:p.members??[],areaIds:[],areaPriorities:{},intervention:'acompaña'})):p;target.areaIds=[...new Set([...(target.areaIds??[]),a.areaId])];break;}
 case 'milestone_status':{const m=get('milestones',command.entityId!);version(m);if(!lead(get('projects',m.projectId)))fail('Solo el referente puede modificar el hito.',403);if(a.status==='Logrado')required(a.note||a.evidence,'Criterio cumplido y evidencia o justificación');if(a.status==='Cancelado'){reason();if(d.tasks.some(t=>t.milestoneId===m.id&&!terminals.includes(t.status)))fail('Desvinculá o resolvé las tareas del hito antes de cancelarlo.');}if(!['Pendiente','En curso','Logrado','Cancelado'].includes(a.status))fail('Estado de hito inválido.');Object.assign(m,{status:a.status,note:a.note??'',evidence:a.evidence??'',completedAt:a.status==='Logrado'?at:null});break;}
 case 'upsert_commitment':{const r=addCommitment(a.taskId,a.weekId,a.result,!!a.isPriority,a.targetDate);result={id:r.id};break;}
 case 'update_commitment':{
  const c=get('commitments',command.entityId!);version(c);closed(c);own(c.ownerId);const plan=ensurePlan(c.weekId,c.ownerId);if(plan.confirmedAt&&['result','isPriority'].some(k=>k in a&&a[k]!==c[k]))reason();
  if(a.result!==undefined)required(a.result,'Resultado semanal');if(a.outcome&&!outcomes.includes(a.outcome))fail('Resultado inválido.');if(a.outcome==='Reprogramado')fail('Usá Reprogramar para elegir una semana destino.');if(a.outcome==='Sin actualización')checkCoord();if(a.outcome)required(a.outcomeNote,'Nota del resultado');if(['Parcial','No cumplido'].includes(a.outcome)&&!a.nextAction)fail('Indicá la siguiente acción.');
  Object.assign(c,pick(a,['result','progress','outcome','outcomeNote','nextAction','meetingTopic','isPriority']));invalidateReady(c.weekId,c.ownerId);if(c.isPriority&&d.commitments.filter(x=>x.ownerId===c.ownerId&&x.weekId===c.weekId&&x.isPriority).length>s.settings.priorityLimit)reason();break;
 }
 case 'acknowledge_transfer':{const c=get('commitments',command.entityId!);version(c);closed(c);if(actorId!==c.ownerId)fail('El nuevo responsable debe reconocer el compromiso.',403);c.transferPending=false;c.acknowledgedAt=at;break;}
 case 'confirm_plan':{
  openWeek(a.weekId);activeMember(a.ownerId);own(a.ownerId);const p=ensurePlan(a.weekId,a.ownerId);if(p.confirmedAt)fail('El plan ya fue confirmado.');const cs=d.commitments.filter(c=>c.weekId===a.weekId&&c.ownerId===a.ownerId);if(cs.some(c=>c.transferPending))fail('Reconocé los compromisos transferidos antes de confirmar.');snapshot('plan',p.id,{plan:p,commitments:cs,tasks:workSnapshotRows(d.tasks,cs.map(c=>c.taskId)),member:get('members',p.ownerId)},1);p.status='Confirmada';p.confirmedAt=at;break;
 }
 case 'capacity':{openWeek(a.weekId);own(a.ownerId);if(!capacities.includes(a.capacity))fail('Señal de capacidad inválida.');const p=ensurePlan(a.weekId,a.ownerId);p.capacity=a.capacity;p.capacityNote=a.note??'';break;}
 case 'ready_plan':{openWeek(a.weekId);own(a.ownerId);const p=ensurePlan(a.weekId,a.ownerId);if(d.commitments.some(c=>c.weekId===a.weekId&&c.ownerId===a.ownerId&&!c.outcome))fail('Completá una propuesta de resultado para cada compromiso.');p.status='Lista para revisar';p.readyAt=at;break;}
 case 'reschedule':{
  const c=get('commitments',command.entityId!);version(c);closed(c);own(c.ownerId);reason();if(a.weekId<=c.weekId)fail('Elegí una semana futura abierta.');openWeek(a.weekId);const t=get('tasks',c.taskId);if(t.archived||terminals.includes(t.status))fail('Una tarea cerrada o archivada no se reprograma.');let dest=d.commitments.find(x=>x.taskId===c.taskId&&x.weekId===a.weekId);if(dest){if(!a.merge)fail('La tarea ya tiene un compromiso en destino. Confirmá actualizarlo.',409);required(a.result,'Resultado destino');dest.result=a.result;dest.carriedFromId=c.id;invalidateReady(dest.weekId,dest.ownerId);}else{dest=addCommitment(c.taskId,a.weekId,a.result,!!c.isPriority);dest.carriedFromId=c.id;}c.outcome='Reprogramado';c.outcomeNote=reason();c.movedToId=dest.id;c.reasonCode=a.reasonCode??'Otro';invalidateReady(c.weekId,c.ownerId);if(a.changeDueDate){validDate(a.newDueDate,'Nueva fecha de la tarea',true);t.dueDate=a.newDueDate;t.originalDueDate=t.originalDueDate||a.newDueDate;}result={sourceId:c.id,destinationId:dest.id};break;
 }
 case 'close_week':{
  checkCoord();const w=ensureWeek(a.weekId);if(w.status==='Cerrada'){result={version:w.closeVersion};break;}version(w);const cs=d.commitments.filter(c=>c.weekId===w.id);if(cs.some(c=>!c.outcome)){if(!a.allowMissing)fail('Hay compromisos sin resultado. Revisalos o cerralos como Sin actualización con motivo.');reason();cs.filter(c=>!c.outcome).forEach(c=>{c.outcome='Sin actualización';c.outcomeNote=a.reason;});}
  w.closeVersion++;w.status='Cerrada';w.closedAt=at;const payload={week:w,commitments:cs,plans:d.plans.filter(p=>p.weekId===w.id),tasks:workSnapshotRows(d.tasks,cs.map(c=>c.taskId)),members:d.members,areas:d.areas,projects:d.projects};snapshot('week',w.id,payload,w.closeVersion);result={version:w.closeVersion};break;
 }
 case 'reopen_week':{checkCoord();const w=get('weeks',a.weekId);version(w);reason();if(w.status!=='Cerrada')fail('La semana ya está abierta.');w.status='Abierta';w.reopenReason=a.reason;break;}
 case 'issue_status':{const i=get('issues',command.entityId!);version(i);if(!coord&&i.ownerId!==actorId)fail('Solo el responsable puede actualizar la incidencia.',403);if(['Resuelta','Descartada'].includes(a.status))required(a.note,'Resolución o motivo');if(['Resuelta','Descartada'].includes(i.status))reason();if(!['Abierta','En tratamiento','Resuelta','Descartada'].includes(a.status))fail('Estado inválido.');i.status=a.status;i.resolutionNote=a.note??'';break;}
 case 'request_intervention':{result={id:requestForIssue(get('issues',a.issueId),a.request,a.neededBy).id};break;}
 case 'intervention_status':{checkCoord();const i=get('interventions',command.entityId!);version(i);if(!['Solicitada','Tomada','Resuelta'].includes(a.status))fail('Estado inválido.');if(i.status==='Resuelta')reason();if(a.status==='Tomada'){required(a.nextAction,'Próxima acción');i.takenBy=actorId;i.takenAt=at;i.nextAction=a.nextAction;}if(a.status==='Resuelta')required(a.note,'Resolución');i.status=a.status;i.resolutionNote=a.note??'';notify(get('issues',i.issueId).ownerId,'Intervención','issues',i.issueId,`La intervención está ${a.status.toLowerCase()}.`);break;}
 case 'build_agenda':{
  checkCoord();const m=get('meetings',command.entityId!);version(m);if(['Cerrada','Cancelada'].includes(m.status))fail('La reunión está cerrada.');
  const sources=new Map<string,{type:Collection;id:string;title:string;reasons:string[]}>();const offer=(type:Collection,id:string,title:string,why:string)=>{const key=`${type}:${id}`,r=sources.get(key)??{type,id,title,reasons:[]};if(!r.reasons.includes(why))r.reasons.push(why);sources.set(key,r);};
  d.issues.filter(i=>!['Resuelta','Descartada'].includes(i.status)).forEach(i=>{const type:Collection=i.taskId?'tasks':i.projectId?'projects':'issues',target=get(type,i.taskId??i.projectId??i.id);offer(type,target.id,target.title,i.type);});
  d.tasks.filter(t=>!terminals.includes(t.status)&&t.dueDate&&t.dueDate<today).forEach(t=>offer('tasks',t.id,t.title,'Vencida'));
  d.projects.filter(p=>p.status==='Activo'&&(!p.reviewedAt||p.reviewedAt<addDays(today,-s.settings.staleDays))).forEach(p=>offer('projects',p.id,p.title,'Información desactualizada'));
  d.commitments.filter(c=>c.weekId===m.weekId&&(c.meetingTopic||['Reprogramado','No cumplido'].includes(c.outcome))).forEach(c=>{const t=get('tasks',c.taskId);offer('tasks',t.id,t.title,c.meetingTopic?'Solicitado por integrante':c.outcome);});
  for(const v of sources.values()){const existing=d.agenda.find(x=>x.meetingId===m.id&&x.sourceType===v.type&&x.sourceId===v.id);if(existing)existing.reasons=[...new Set([...(existing.reasons??[]),...v.reasons])];else newRow('agenda',{meetingId:m.id,title:v.title,sourceType:v.type,sourceId:v.id,reasons:v.reasons,status:'Pendiente',order:d.agenda.filter(x=>x.meetingId===m.id).length,requestedBy:actorId});}break;
 }
 case 'agenda_item':{const m=get('meetings',a.meetingId);if(['Cerrada','Cancelada'].includes(m.status))fail('La reunión está cerrada.');if(command.entityId){checkCoord();const item=get('agenda',command.entityId);version(item);if(item.meetingId!==m.id)fail('El tema no pertenece a la reunión.');Object.assign(item,pick(a,['title','status','order','nextReviewDate']));if(a.status==='Pospuesto'&&!a.nextReviewDate)fail('Indicá la próxima revisión del tema.');}else{required(a.title,'Asunto');required(a.reason,'Motivo y ayuda necesaria');newRow('agenda',{meetingId:m.id,title:a.title,reasons:[a.reason],status:'Pendiente',order:d.agenda.filter(x=>x.meetingId===m.id).length,requestedBy:actorId});}break;}
 case 'record_decision':{
  checkCoord();const m=get('meetings',a.meetingId);if(['Cerrada','Cancelada'].includes(m.status))fail('La reunión está cerrada.');required(a.text,'Acuerdo');activeMember(a.ownerId);if(!a.informational&&!a.followUpDate)fail('Un acuerdo con acción pendiente necesita fecha de seguimiento.');if(a.informational&&a.action!=='record')fail('Un acuerdo informativo solo se registra; una modificación de trabajo queda abierta para seguimiento.');let taskId=a.action==='update_task'?a.taskId:null;
  if(a.action==='update_task'){const t=get('tasks',a.taskId);if(t.archived)fail('Restaurá la tarea archivada antes de modificarla.');if(a.taskVersion!==t.version)fail('La tarea cambió: revisá su versión antes de registrar el acuerdo.',409);reason();if(a.dueDate){t.dueDate=a.dueDate;t.originalDueDate=t.originalDueDate||a.dueDate;}if(a.status)transition(t,a.status,a.reason);}
  else if(a.action==='create_task'){required(a.taskTitle,'Título de la tarea');const t=newRow('tasks',{title:a.taskTitle,code:nextTaskCode(),ownerId:a.ownerId,projectId:null,status:'Pendiente',priority:'Media',dueDate:a.followUpDate,originalDueDate:a.followUpDate,requiresValidation:false,collaborators:[],links:[],origin:'Pedido de coordinación'});taskId=t.id;}
  else if(a.action==='update_issue'){const i=get('issues',a.issueId);if(a.issueVersion!==i.version)fail('La incidencia fue actualizada.',409);required(a.nextAction,'Próxima gestión');i.nextAction=a.nextAction;if(a.followUpDate)i.followUpDate=a.followUpDate;}
  else if(a.action!=='record')fail('Acción de acuerdo inválida.');
  if(a.commitmentId){const c=get('commitments',a.commitmentId);if(c.archived)fail('El compromiso está archivado.');closed(c);if(c.version!==a.commitmentVersion)fail('El compromiso fue actualizado. Recargá antes de guardar.',409);if(c.weekId!==a.commitmentWeekId||![m.weekId,m.planningWeekId].includes(c.weekId))fail('Confirmá el período del compromiso revisado o planificado en esta reunión.');if(taskId&&c.taskId!==taskId)fail('El compromiso debe corresponder a la misma tarea del acuerdo.');required(a.commitmentResult,'Resultado semanal acordado');reason();c.result=a.commitmentResult;if(a.commitmentOutcome){if(!outcomes.includes(a.commitmentOutcome)||a.commitmentOutcome==='Reprogramado')fail('Para reprogramar usá la operación con semana de destino.');required(a.commitmentNote,'Resultado del compromiso');if(['Parcial','No cumplido'].includes(a.commitmentOutcome)&&!['Continuar','Reprogramar','Solicitar intervención','Desestimar'].includes(a.commitmentNextAction))fail('Indicá la siguiente acción del compromiso.');c.nextAction=a.commitmentNextAction??c.nextAction;c.outcome=a.commitmentOutcome;c.outcomeNote=a.commitmentNote;}invalidateReady(c.weekId,c.ownerId);}
  const dec=newRow('decisions',{meetingId:m.id,text:a.text,ownerId:a.ownerId,followUpDate:a.followUpDate||null,status:a.informational?'Cumplida':'Abierta',action:a.action,taskId,issueId:a.action==='update_issue'?a.issueId:null,reason:a.reason??'',commitmentId:a.commitmentId??null});result={id:dec.id,taskId};break;
 }
 case 'decision_status':{const de=get('decisions',command.entityId!);version(de);if(!coord&&de.ownerId!==actorId)fail('Solo el responsable puede actualizar el acuerdo.',403);if(!['Abierta','Cumplida','Dejada sin efecto'].includes(a.status))fail('Estado inválido.');if(a.status!=='Abierta')required(a.note,'Resultado o motivo');de.status=a.status;de.note=a.note??'';break;}
 case 'calendar_minutes':{
  if(!['draft','close','reopen'].includes(a.action))fail('Elegí una acción de minuta válida.');
  const event=execution?.calendarEvent;let m=command.entityId?get('meetings',command.entityId):event?d.meetings.find(row=>row.calendarEventKey===event.id):undefined;
  if(m){if(!m.calendarEventKey)fail('Esta reunión se gestiona desde Reunión semanal.');if(event&&event.id!==m.calendarEventKey)fail('La reunión y la minuta no corresponden al mismo encuentro.',403);if(!canEditCalendarMinutes(m,actorId,coord)&&!event?.memberIds.includes(actorId))fail('Solo quienes participan o Coordinación pueden editar esta minuta.',403);version(m);if(event)m.attendees=[...new Set([...m.attendees,...event.memberIds])];}
  else{
   const shared=event??fail('La reunión compartida no está disponible para editar.',403);if(!coord&&!shared.memberIds.includes(actorId))fail('Solo quienes participan o Coordinación pueden crear esta minuta.',403);
   if(d.meetings.some(row=>row.calendarEventKey===shared.id))fail('La reunión ya tiene una minuta. Actualizá la vista.',409);
   const start=shared.allDay?shared.start:dateInBA(new Date(shared.start)),weekId=weekStart(start);ensureWeek(weekId);ensureWeek(addDays(weekId,7));
   m=newRow('meetings',{title:shared.title,date:shared.allDay?shared.start+'T00:00:00-03:00':shared.start,weekId,planningWeekId:addDays(weekId,7),attendees:shared.memberIds.filter(id=>d.members.some(member=>member.id===id&&member.active)),durations:[0,0,0,0],minutes:'',status:'Borrador',closeVersion:0,calendarEventKey:shared.id,calendarOwnerId:actorId});
  }
  if(a.action==='reopen'){if(m.status!=='Cerrada')fail('La minuta no está cerrada.');reason();m.status='Borrador';m.reopenReason=a.reason;}
  else{if(m.status==='Cerrada')fail('Reabrí la minuta con motivo antes de editar.');if(typeof a.minutes!=='string')fail('Ingresá el texto de la minuta.');if(a.action==='close')required(a.minutes,'Minuta');m.minutes=a.minutes;if(a.action==='close'){m.closeVersion++;m.status='Cerrada';m.closedAt=at;snapshot('meeting',m.id,{meeting:m,members:d.members},m.closeVersion);}}
  result={id:m.id};break;
 }
 case 'meeting_priority':{
  checkCoord();const m=get('meetings',command.entityId!);version(m);if(m.calendarEventKey||['Cerrada','Cancelada'].includes(m.status))fail('Las prioridades solo se editan en una reunión semanal abierta.');
  const priorities=m.teamPriorities??=[],entry=a.priorityId?priorities.find((p:any)=>p.id===a.priorityId):undefined;
  if(a.priorityId&&!entry)fail('La prioridad ya no está disponible. Actualizá la reunión.',409);
  if(a.remove===true){if(!entry)fail('Elegí la prioridad que querés eliminar.');if(a.confirm!==true)fail('Confirmá que querés eliminar esta prioridad.');m.teamPriorities=priorities.filter((p:any)=>p.id!==a.priorityId);}
  else{required(a.text,'Prioridad del equipo');if(typeof a.text!=='string')fail('Ingresá el texto de la prioridad.',400);const next={id:entry?.id??crypto.randomUUID(),text:a.text.trim(),updatedAt:at,updatedBy:actorId};m.teamPriorities=entry?priorities.map((p:any)=>p.id===entry.id?next:p):[...priorities,next];result={id:next.id};}
  break;
 }
 case 'meeting_status':{checkCoord();const m=get('meetings',command.entityId!);version(m);if(m.status==='Cerrada')fail('Reabrí la reunión cerrada con motivo antes de cambiarla.');if(a.status==='En curso'){if(m.status==='Cancelada')reason();m.status='En curso';}else if(a.status==='Cancelada'){reason();m.status='Cancelada';}else fail('Estado inválido.');break;}
 case 'close_meeting':{
  checkCoord();const m=get('meetings',command.entityId!);if(m.status==='Cerrada'){result={version:m.closeVersion};break;}version(m);if(m.status==='Cancelada')fail('Reactivá la reunión cancelada antes de cerrarla.');required(a.minutes,'Minuta');m.closeVersion++;m.status='Cerrada';m.minutes=a.minutes;m.closedAt=at;snapshot('meeting',m.id,{meeting:m,agenda:d.agenda.filter(x=>x.meetingId===m.id),decisions:d.decisions.filter(x=>x.meetingId===m.id),members:d.members,workReview:meetingWeekWork(s,m.weekId),workPlanning:meetingWeekWork(s,m.planningWeekId)},m.closeVersion);result={version:m.closeVersion};break;
 }
 case 'reopen_meeting':{checkCoord();const m=get('meetings',command.entityId!);version(m);reason();if(m.status!=='Cerrada')fail('La reunión no está cerrada.');m.status='En curso';m.reopenReason=a.reason;break;}
 case 'archive':case 'restore':{const c=command.entity!;if(!['projects','tasks'].includes(c))fail('No se puede archivar esta entidad.');const r=get(c,command.entityId!);if(command.expectedVersion!==r.version)fail('El registro cambió.',409);if(c==='projects'&&!lead(r)||c==='tasks'&&!taskEditor(r))fail('No podés archivar este registro.',403);if(command.kind==='archive'&&!['Finalizado','Cancelado','Terminada','Cancelada'].includes(r.status))fail('Solo se archivan registros finalizados o cancelados.');r.archived=command.kind==='archive';break;}
 case 'read_notification':{const n=get('notifications',command.entityId!);if(n.ownerId!==actorId)fail('Aviso de otra persona.',403);n.read=true;break;}
 case 'settings':{checkCoord();reason();for(const key of ['staleDays','dueDays','priorityLimit'] as const){if(a[key]!==undefined){const n=Number(a[key]);if(n<1||n>90||!Number.isInteger(n))fail('Los parámetros deben ser enteros entre 1 y 90.');s.settings[key]=n;}}s.audit.push({id:crypto.randomUUID(),at,actorId,actorName:actor.name,actorEmail:actor.email??null,entity:'settings',entityId:s.workspaceId,action:'modificar',before:{id:s.workspaceId,version:input.revision,...input.settings},after:{id:s.workspaceId,version:s.revision+1,...s.settings},fields:Object.keys(a).filter(k=>k in s.settings),reason:a.reason,operationId:command.id,source:execution?.jobId?'proceso automático':'interfaz'});break;}
 case 'recover_occurrences':{
  const r=get('recurrences',a.recurrenceId);own(r.ownerId);version(r);reason();if(!Array.isArray(a.dates)||!a.dates.length||a.dates.some((date:string)=>!(r.pendingDates??[]).includes(date)))fail('Elegí fechas pendientes de esta plantilla.');if(!['generate','discard'].includes(a.action))fail('Elegí generar o descartar las ocurrencias.');
  let created=0;for(const date of [...new Set(a.dates)] as string[]){validDate(date,'Ocurrencia',true);if(a.action==='discard')r.dismissedDates=[...new Set([...(r.dismissedDates??[]),date])];else if(![...d.tasks,...deleted.tasks,...purgedTasks].some(t=>t.recurrenceId===r.id&&t.occurrenceDate===date)){const t=newRow('tasks',{title:r.title,description:r.description??'',ownerId:r.ownerId,projectId:r.projectId??null,status:'Pendiente',priority:r.priority??'Media',requiresValidation:!!r.requiresValidation,validatorId:r.validatorId??null,code:nextTaskCode(),dueDate:date,originalDueDate:date,collaborators:r.collaborators??[],links:[],recurrenceId:r.id,occurrenceDate:date,origin:'Rutina recuperada'});taskRefs(t);created++;}}
  r.pendingDates=r.pendingDates.filter((date:string)=>!a.dates.includes(date));result={created,discarded:a.action==='discard'?a.dates.length:0};break;
 }
 case 'generate_occurrences':{
  checkCoord();const end=addDays(weekStart(today),13),errors:any[]=[];let created=0;for(const r of d.recurrences.filter(x=>x.active)){const count=d.tasks.length;try{if(!d.members.some(m=>m.id===r.ownerId&&m.active)){r.pendingReassignment=true;fail('La plantilla necesita reasignación de responsable.');}const omittedStart=r.generationCursor?addDays(r.generationCursor,1):r.startsOn;if(omittedStart<weekStart(today)){r.pendingDates=occurrenceDates(r,omittedStart,addDays(weekStart(today),-1)).filter(date=>!(r.dismissedDates??[]).includes(date)&&![...d.tasks,...deleted.tasks,...purgedTasks].some(t=>t.recurrenceId===r.id&&t.occurrenceDate===date));}const dates=occurrenceDates(r,weekStart(today),end);for(const date of dates){if([...d.tasks,...deleted.tasks,...purgedTasks].some(t=>t.recurrenceId===r.id&&t.occurrenceDate===date))continue;const t=newRow('tasks',{title:r.title,description:r.description??'',ownerId:r.ownerId,projectId:r.projectId??null,status:'Pendiente',priority:r.priority??'Media',requiresValidation:!!r.requiresValidation,validatorId:r.validatorId??null,code:nextTaskCode(),dueDate:date,originalDueDate:date,collaborators:r.collaborators??[],links:[],recurrenceId:r.id,occurrenceDate:date,origin:'Rutina'});taskRefs(t);}created+=d.tasks.length-count;r.lastGeneratedAt=at;r.generationCursor=end;r.lastGenerationError=null;}catch(e){d.tasks.splice(count);r.lastGenerationError=(e as Error).message;errors.push({id:r.id,title:r.title,error:r.lastGenerationError});}}result={created,errors};break;
 }
 case 'generate_notifications':{
  checkCoord();for(const t of d.tasks.filter(x=>!x.archived&&!terminals.includes(x.status)&&x.dueDate&&x.dueDate<=addDays(today,s.settings.dueDays)))notify(t.ownerId,t.dueDate<today?'Vencimiento':'Próximo vencimiento','tasks',t.id,t.code+': '+t.title+' · '+t.dueDate);
  for(const p of d.projects.filter(p=>!p.archived&&p.status==='Activo'&&(!p.reviewedAt||p.reviewedAt<addDays(today,-s.settings.staleDays))))notify(p.leadId,'Revisión de proyecto','projects',p.id,'Revisá la información de '+p.title);
  for(const i of d.issues.filter(i=>!['Resuelta','Descartada'].includes(i.status)&&i.followUpDate&&i.followUpDate<today))notify(i.ownerId,'Seguimiento vencido','issues',i.id,'Actualizá la próxima gestión de '+i.title);
  for(const i of d.interventions.filter(i=>i.status!=='Resuelta'&&i.neededBy<today&&d.issues.some(issue=>issue.id===i.issueId&&!['Resuelta','Descartada'].includes(issue.status))))for(const member of d.members.filter(m=>m.active&&m.role==='Coordinación'))notify(member.id,'Intervención vencida','interventions',i.id,i.request);
  for(const r of d.recurrences.filter(r=>r.pendingReassignment||r.lastGenerationError||(r.pendingDates??[]).length))for(const member of d.members.filter(m=>m.active&&m.role==='Coordinación'))notify(member.id,'Revisar recurrencia','recurrences',r.id,r.title+': hay ocurrencias o asignaciones para revisar');break;
 }
 case 'export':{if(a.full)checkCoord();s.audit.push({id:crypto.randomUUID(),at,actorId,actorName:actor.name,actorEmail:actor.email,entity:'export',entityId:s.workspaceId,action:'exportar',before:null,after:null,fields:[],reason:a.reason??'',operationId:command.id,source:execution?.jobId?'proceso automático':'interfaz'});break;}
 default:fail('Operación no reconocida.',400);
 }
 try{validateWorkGraph(d.tasks);}catch(error){fail((error as Error).message);}
 for(const row of d.tasks.filter(t=>['Terminada','Para validar'].includes(t.status))){const problems=workClosureProblems(d.tasks,row);if(problems.length)fail('Reabrí primero '+row.title+' o revisá sus vínculos. '+problems.join(' '));}
 for(const c of collections)d[c].push(...deleted[c]);
 // Acyclic organizational relationships and all references are validated before committing.
 for(const [c,key] of [['members','reportsTo'],['areas','parentId']] as [Collection,string][]){for(const row of d[c]){const seen=new Set([row.id]);let next=row[key];while(next){if(seen.has(next))fail('La dependencia no puede formar un ciclo.');seen.add(next);next=get(c,next)[key];}}}
 for(const c of collections){const previousById=new Map((input.data[c]??[]).map(row=>[row.id,row]));for(const row of d[c]){
  const prev=previousById.get(row.id);if(JSON.stringify(prev)===JSON.stringify(row))continue;
  {
   for(const key of ['dueDate','originalDueDate','startDate','targetDate','nextDate','sourceDate','followUpDate','neededBy','startsOn','endsOn','nextReviewDate','targetDate'])validDate(row[key],`Fecha (${key})`);
   if(row.date){if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?$/.test(row.date)||!Number.isFinite(Date.parse(row.date)))fail('Ingresá una fecha y hora válidas.');validDate(row.date.slice(0,10));}
  }
  for(const [k,v] of Object.entries(row)){if(/url$/i.test(k)&&v)safeUrl(v as string);}
  for(const link of [...(row.links??[]),...(row.documents??[])])safeUrl(typeof link==='string'?link:link.url);
  const comparable=(r:Row)=>JSON.stringify({...r,version:undefined,updatedAt:undefined,updatedBy:undefined});
  if(!prev||comparable(prev)!==comparable(row)){row.version=prev?prev.version+1:1;row.updatedAt=at;row.updatedBy=actorId;const keys=[...new Set([...Object.keys(prev??{}),...Object.keys(row)])].filter(k=>JSON.stringify(prev?.[k])!==JSON.stringify(row[k]));s.audit.push({id:crypto.randomUUID(),at,actorId,actorName:actor.name,actorEmail:actor.email??null,entity:c,entityId:row.id,action:row.deletedAt&&!prev?.deletedAt?'eliminar':prev?.deletedAt&&!row.deletedAt?'restaurar':prev?'modificar':'crear',before:prev?structuredClone(prev):null,after:structuredClone(row),fields:keys,reason:a.reason??a.note??'',operationId:command.id,source:execution?.jobId?'proceso automático':'interfaz'});}
 }}
 s.revision=input.revision+1;s.receipts[command.id]={hash,result,actorId};return {state:s,result};
}
export function safeUrl(value:string){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('Usá un enlace HTTP o HTTPS sin credenciales.');}catch(e){if(e instanceof DomainError)throw e;fail('Ingresá una URL válida con https://.');}}
export function occurrenceDates(r:Row,start:string,end:string){const dates:string[]=[];for(let date=start;date<=end;date=addDays(date,1)){if(date<r.startsOn||r.endsOn&&date>r.endsOn)continue;const dt=new Date(date+'T12:00Z');if(r.frequency==='Semanal'){if(dt.getUTCDay()===Number(r.weekday))dates.push(date);}else{const last=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();if(dt.getUTCDate()===Math.min(Number(r.monthday),last))dates.push(date);}}return dates;}
export function publicState(s:State,actorId:string){
 const output=structuredClone(s);s=output;for(const c of collections)output.data[c]??=[];
 const actor=output.data.members.find(m=>m.id===actorId&&m.active)??fail('Acceso desactivado.',403),issues=issueVisibility(s,actorId);
 output.data.areas=output.data.areas.map(ar=>effectiveArea(s,ar,dateInBA()));output.data.projects=referencedProjects({...s,data:output.data});delete output.externalProjects;output.receipts={};delete output.ledger;
 output.trash=trashSummaries(s,actorId);for(const c of collections)output.data[c]=output.data[c].filter(r=>!r.deletedAt&&issues.visible(c,r.id,r));
 output.data.notifications=output.data.notifications.filter(n=>n.ownerId===actorId&&issues.visible(n.targetType,n.targetId));output.data.preferences=output.data.preferences.filter(p=>p.ownerId===actorId);output.data.filters=output.data.filters.filter(f=>f.ownerId===actorId||f.shared);
 if(actor.role!=='Coordinación'){
  output.audit=output.audit.filter(e=>!['members','settings','export','filters','preferences','notifications'].includes(e.entity)&&issues.visible(e.entity,e.entityId,e.after??e.before));
  output.data.members=output.data.members.map(m=>({...m,email:null}));
  output.snapshots=output.snapshots.map(sn=>({...sn,payload:issues.payload(JSON.parse(JSON.stringify(sn.payload),(k,v)=>k==='email'?null:v))}));
 }
 output.data.members=output.data.members.map(m=>{const {authUserId,activatedAt,...visible}=m;return visible;});return output;
}
export function minutesText(s:State,meeting:Row){const selected=meetingMinutes(s,meeting);const names=meeting.attendees.map((id:string)=>s.data.members.find(m=>m.id===id)?.name).filter(Boolean).join(', ');const agenda=s.data.agenda.filter(a=>a.meetingId===meeting.id),decisions=s.data.decisions.filter(a=>a.meetingId===meeting.id);return `${meeting.title}\nFecha: ${meeting.date.replace('T',' ')}\nPeríodo revisado: ${meeting.weekId} al ${addDays(meeting.weekId,6)}\nPróxima planificación: ${meeting.planningWeekId}\nParticipantes: ${names}${selected.presence}\n\nPRIORIDADES DEL EQUIPO\n${(meeting.teamPriorities??[]).map((p:any,i:number)=>(i+1)+'. '+p.text).join('\n')||'Sin prioridades registradas.'}\n\nAVANCES SELECCIONADOS\n${selected.advances||'Sin avances seleccionados.'}\n\nPRÓXIMOS COMPROMISOS\n${selected.commitments||'Sin compromisos seleccionados.'}\n\nTEMAS TRATADOS\n${agenda.filter(a=>a.status==='Tratado').map(a=>'• '+a.title).join('\n')||'Sin temas marcados como tratados.'}\n\nACUERDOS\n${decisions.map((a,i)=>`${i+1}. ${a.text}\nResponsable: ${s.data.members.find(m=>m.id===a.ownerId)?.name} · Seguimiento: ${a.followUpDate??'Informativo'} · ${a.status}`).join('\n\n')||'Sin acuerdos registrados.'}\n\nTEMAS POSPUESTOS Y PENDIENTES\n${agenda.filter(a=>a.status!=='Tratado').map(a=>`• ${a.title} · ${a.status}${a.nextReviewDate?' · Próxima revisión: '+a.nextReviewDate:''}`).join('\n')||'Sin pendientes.'}`;}

