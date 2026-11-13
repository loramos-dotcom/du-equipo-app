import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute,publicState} from '../shared/domain.ts';
import {api} from '../server/api.ts';
import type {State} from '../shared/model.ts';

const external={id:'gestion:canonical',sourceId:'canonical',version:1,sourceVersion:4,title:'Proyecto canónico',outcome:'Resultado original',status:'Activo',external:true};
function setup(){const state=seed();state.externalProjects=[external];return state;}
function run(state:State,actor:string,kind:string,data:Record<string,unknown>,entity?:any,entityId?:string,expectedVersion?:number){return execute(state,actor,{id:crypto.randomUUID(),kind,data,entity,entityId,expectedVersion});}

test('Una tarea DU referencia el proyecto compartido sin persistir una copia de su ficha',()=>{
 const result=run(setup(),'persona05','create',{title:'Trabajo propio DU',ownerId:'persona05',projectId:external.id},'tasks');
 assert.equal(result.state.data.tasks.find(t=>t.id===result.result.id)?.projectId,external.id);
 assert.ok(!result.state.data.projects.some(p=>p.id===external.id));assert.equal(result.state.externalProjects,undefined);
 const view=publicState({...result.state,externalProjects:[external]},'persona05');assert.equal(view.data.projects.find(p=>p.id===external.id)?.title,external.title);
 assert.equal(view.data.projects.filter(p=>p.id===external.id).length,1);
 const planned=run({...result.state,externalProjects:[external]},'persona05','upsert_commitment',{taskId:result.result.id,weekId:result.state.data.weeks[0].id,result:'Preparar el análisis DU'});
 assert.equal(planned.state.data.commitments.find(c=>c.id===planned.result.id)?.taskId,result.result.id);
});
test('La configuración DU asigna referente y cartera sin cambiar permisos o datos del Tablero',()=>{
 const initial=setup();assert.throws(()=>run(initial,'persona05','configure_project_tracking',{sourceId:'canonical',leadId:'persona05'}),/Coordinación/);
 const linked=run(initial,'persona01','configure_project_tracking',{sourceId:'canonical',leadId:'persona05',members:['persona05','persona01'],areaId:'universidad'}).state;
 assert.equal(linked.data.projectLinks.length,1);assert.equal(linked.data.projectLinks[0].title,undefined);
 const view=publicState({...linked,externalProjects:[external]},'persona05'),project=view.data.projects.find(p=>p.id===external.id)!;
 assert.equal(project.leadId,'persona05');assert.deepEqual(project.areaIds,['universidad']);assert.equal(project.duPriority,false);
 assert.throws(()=>run({...linked,externalProjects:[external]},'persona06','create',{title:'Tarea',ownerId:'persona06',projectId:external.id},'tasks'),/No participás/);
 assert.throws(()=>run({...linked,externalProjects:[external]},'persona01','update',{title:'Reescribir fuente'},'projects',external.id,1),/datos compartidos/);
});
test('Un identificador compartido arbitrario o un acceso perdido no se convierten en proyecto autorizado',()=>{
 assert.throws(()=>run(seed(),'persona05','create',{title:'Tarea',ownerId:'persona05',projectId:'gestion:forged'},'tasks'),/No se pudo verificar/);
 assert.throws(()=>run(setup(),'persona01','configure_project_tracking',{sourceId:'forged',leadId:'persona05'}),/no está disponible/);
});
test('La API muestra el catálogo autorizado y nunca lo incluye en el almacenamiento',async()=>{
 let state=seed();const store={load:async()=>structuredClone(state),create:async()=>{},save:async(_key:string,_revision:number,next:State)=>{state=structuredClone(next);return true;}};
 const request=new Request('http://localhost/api/command',{method:'POST',headers:{'content-type':'application/json',cookie:'du_demo_actor=persona05'},body:JSON.stringify({id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title:'Tarea propia',ownerId:'persona05'}})});
 const response=await api(request,store,'test');assert.equal(response.status,200);assert.equal(state.externalProjects,undefined);
 const view=publicState({...state,externalProjects:[external]},'persona05');assert.ok(view.data.projects.some(p=>p.id===external.id));
});
