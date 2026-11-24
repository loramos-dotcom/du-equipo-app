import test from 'node:test';
import assert from 'node:assert/strict';
import {institutionalState} from '../shared/team.ts';
import {execute} from '../shared/domain.ts';
import {taskProjectRequired} from '../shared/task-project-policy.ts';
import {localPortfolioProjects,localPortfolioId} from '../src/gestion/du-local-projects.ts';
import {isMyPortfolioProject} from '../src/gestion/du-portfolio.ts';
import {deletionPlan} from '../shared/deletion.ts';
import {supabaseStore} from '../server/supabase-store.ts';
import type {State,Command,Row} from '../shared/model.ts';

const now=new Date('2026-11-15T16:00:00Z'),today='2026-11-15';
function call(state:State,kind:string,data:Record<string,any>,entity?:Command['entity'],id?:string,actor='persona05'){
 return execute(state,actor,{id:crypto.randomUUID(),kind,data,entity,entityId:id,expectedVersion:id?state.data[entity??'tasks'].find(row=>row.id===id)?.version:undefined},now);
}
function fixture(){let state=institutionalState('required-projects',{persona01:'coord@example.edu',persona05:'member@example.edu',persona06:'other@example.edu'},'coord@example.edu',now);const made=call(state,'create',{title:'Proyecto de prueba',outcome:'Resultado del proyecto de prueba',leadId:'persona05',members:['persona05','persona01']},'projects');return {state:made.state,projectId:made.result.id};}

test('Los espacios institucionales nuevos exigen proyecto y la creación sin proyecto no guarda registros ni avisos',()=>{
 const {state}=fixture(),before=structuredClone(state);assert.equal(taskProjectRequired(state),true);
 for(const projectId of [undefined,null,'']){assert.throws(()=>call(state,'create',{title:'Tarea sin vínculo',ownerId:'persona05',projectId},'tasks'),/Elegí un proyecto/);assert.deepEqual(state,before);}
});

test('Crear y editar conserva un proyecto válido; no se puede quitar ni reemplazar por un destino inexistente',()=>{
 let {state,projectId}=fixture();const made=call(state,'create',{title:'Tarea con proyecto',ownerId:'persona05',projectId},'tasks');state=made.state;const task=state.data.tasks[0],before=structuredClone(state);
 for(const target of [null,'','missing']){assert.throws(()=>call(state,'update',{projectId:target,reason:'Cambio de proyecto'},'tasks',task.id));assert.deepEqual(state,before);}
 const edited=call(state,'update',{description:'Descripción ampliada',reason:'Precisar el alcance'},'tasks',task.id).state;assert.equal(edited.data.tasks[0].id,task.id);assert.equal(edited.data.tasks[0].projectId,projectId);assert.equal(edited.data.projects.length,1);
});

test('El proyecto obligatorio sigue verificando la participación del responsable y colaboradores',()=>{
 const {state,projectId}=fixture(),before=structuredClone(state);assert.throws(()=>call(state,'create',{title:'Asignación fuera del proyecto',ownerId:'persona06',projectId},'tasks',undefined,'persona01'),/participar del proyecto/);assert.throws(()=>call(state,'create',{title:'Colaborador fuera del proyecto',ownerId:'persona05',projectId,collaborators:['persona06']},'tasks'),/participar del proyecto/);assert.deepEqual(state,before);
});

test('Las tareas recurrentes requieren proyecto y una plantilla anterior incompleta no genera tareas huérfanas',()=>{
 let {state,projectId}=fixture();const data={title:'Rutina de prueba',ownerId:'persona05',frequency:'Semanal',weekday:1,startsOn:'2026-11-09',priority:'Media',active:true};assert.throws(()=>call(state,'create',data,'recurrences'),/Elegí un proyecto/);
 state=call(state,'create',{...data,projectId},'recurrences').state;state=call(state,'generate_occurrences',{},undefined,undefined,'persona01').state;assert.ok(state.data.tasks.length>0);assert.ok(state.data.tasks.every(task=>task.projectId===projectId));
 state.data.recurrences.push({id:'old-template',version:1,...data,projectId:null});const count=state.data.tasks.length,next=call(state,'generate_occurrences',{},undefined,undefined,'persona01');assert.equal(next.state.data.tasks.length,count);assert.match(next.state.data.recurrences.find(row=>row.id==='old-template')!.lastGenerationError,/Elegí un proyecto/);
});

test('Crear una tarea desde una decisión exige proyecto y guarda tarea y acuerdo de forma atómica',()=>{
 let {state,projectId}=fixture();const meeting=call(state,'create',{title:'Reunión de prueba',date:today+'T10:00',weekId:'2026-11-09',planningWeekId:'2026-11-16',attendees:['persona01','persona05']},'meetings',undefined,'persona01');state=meeting.state;
 const data={meetingId:meeting.result.id,text:'Preparar el insumo acordado',ownerId:'persona05',followUpDate:today,action:'create_task',taskTitle:'Tarea del acuerdo'},before=structuredClone(state);assert.throws(()=>call(state,'record_decision',data,undefined,undefined,'persona01'),/Elegí un proyecto/);assert.deepEqual(state,before);
 const next=call(state,'record_decision',{...data,projectId},undefined,undefined,'persona01').state;assert.equal(next.data.tasks.length,1);assert.equal(next.data.tasks[0].projectId,projectId);assert.equal(next.data.decisions[0].taskId,next.data.tasks[0].id);
});

test('Activar la política exige completar vínculos; solo Coordinación puede activarla y no hay opción para desactivarla',()=>{
 let {state,projectId}=fixture();state.settings.requireTaskProject=false;const made=call(state,'create',{title:'Tarea anterior sin proyecto',ownerId:'persona05'},'tasks');state=made.state;
 assert.throws(()=>call(state,'require_task_projects',{reason:'Activar política'},undefined,undefined,'persona01'),/Vinculá primero/);
 state=call(state,'update',{projectId,reason:'Completar el vínculo pendiente'},'tasks',made.result.id).state;assert.throws(()=>call(state,'require_task_projects',{reason:'Activar política'}),/coordinación/i);
 state=call(state,'require_task_projects',{reason:'Todas las tareas deben tener proyecto'},undefined,undefined,'persona01').state;assert.equal(taskProjectRequired(state),true);assert.ok(state.audit.some(event=>event.entity==='settings'&&event.fields.includes('requireTaskProject')));
 state=call(state,'settings',{requireTaskProject:false,reason:'Intento de desactivar la regla'},undefined,undefined,'persona01').state;assert.equal(taskProjectRequired(state),true);
});

test('Eliminar un proyecto requiere reasignar sus tareas; restaurar una tarea anterior permite elegir proyecto',()=>{
 let {state,projectId}=fixture();const made=call(state,'create',{title:'Tarea vinculada',ownerId:'persona05',projectId},'tasks');state=made.state;const project=state.data.projects[0];assert.throws(()=>call(state,'delete',{reason:'Eliminar proyecto',confirmDeletion:true,impactKey:deletionPlan(state,'projects',projectId).key},'projects',project.id),/Reasigná las tareas/);
 state.data.tasks[0].status='Cancelada';state.data.tasks[0].archived=true;state.data.tasks[0].projectId=null;const before=structuredClone(state);assert.throws(()=>call(state,'restore',{},'tasks',made.result.id),/Elegí un proyecto/);assert.deepEqual(state,before);const restored=call(state,'restore',{projectId},'tasks',made.result.id).state;assert.equal(restored.data.tasks[0].projectId,projectId);assert.equal(restored.data.tasks[0].archived,false);
});

test('Los proyectos propios aparecen en el catálogo con identidad y ficha separadas de los proyectos compartidos',()=>{
 const {state,projectId}=fixture();state.data.projects[0].areaIds=['universidad'];const rows=localPortfolioProjects([...state.data.projects,{id:'external',version:1,external:true,title:'Compartido'}],state.data.members,state.data.areas);assert.equal(rows.length,1);assert.equal(rows[0].id,localPortfolioId(projectId));assert.equal(rows[0].duLocalId,projectId);assert.deepEqual(rows[0].areaKeys,['universidad']);assert.equal(rows[0].name,'Proyecto de prueba');
 assert.equal(isMyPortfolioProject(rows[0],{directProjectIds:[rows[0].id],followedAreaKeys:[],assignments:{}} as any),true);assert.equal(rows[0].manualStatus,'pending');
});

test('La prioridad del proyecto se guarda y se valida independientemente de la marca DU',()=>{
 let {state,projectId}=fixture();
 const priority=()=>localPortfolioProjects(state.data.projects,state.data.members,state.data.areas)[0].priority;
 assert.equal(state.data.projects[0].priority,'Media');
 delete state.data.projects[0].priority;
 assert.equal(priority(),'Media');
 state=call(state,'update',{priority:'Baja'},'projects',projectId).state;
 state=call(state,'set_priority',{selected:true,order:0,reason:'Seguimiento del equipo'},'projects',projectId,'persona01').state;
 assert.equal(priority(),'Baja');
 assert.equal(state.data.projects[0].duPriority,true);
 state=call(state,'update',{priority:'Alta'},'projects',projectId).state;
 assert.equal(priority(),'Alta');
 assert.throws(()=>call(state,'update',{priority:'Urgente'},'projects',projectId),/Elegí Baja, Media o Alta/);
 assert.equal(priority(),'Alta');
});

test('La edición rápida de texto deriva las tareas sin proyecto al dominio para aplicar la regla y no escribe por el atajo SQL',async()=>{
 const requests:string[]=[],transport:typeof fetch=async(input,init)=>{const url=String(input);requests.push(url);assert.ok(!url.includes('du_update_task_content'));return new Response(JSON.stringify({project_id:null}),{status:200,headers:{'content-type':'application/json'}});};
 const store=supabaseStore({supabaseUrl:'https://fixture.supabase.co',secretKey:'fixture-key',relational:true},transport);assert.equal(await store.updateTaskContent('fixture','persona05','verified',{id:'edit-fixture',kind:'update',entity:'tasks',entityId:'task-fixture',expectedVersion:1,data:{title:'Nuevo texto'}},[]),null);assert.equal(requests.length,1);assert.match(requests[0],/select=project_id/);
});
