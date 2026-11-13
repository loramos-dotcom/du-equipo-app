import {projectFilterAreaKeys} from '../src/gestion/du-portfolio.ts';
import {readQuery} from '../server/read-queries.ts';
import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{PGlite}from'@electric-sql/pglite';
import{seed}from'../shared/seed.ts';import{execute,publicState}from'../shared/domain.ts';import{api}from'../server/api.ts';import{resolveProjectAssignments}from'../shared/project-assignments.ts';import{followedAreaKeys}from'../shared/project-portfolios.ts';import type{State}from'../shared/model.ts';
const now=new Date('2026-10-21T15:00:00Z');
test('El estado y ambos historiales ocultan identidad técnica y correo también en copias anidadas',async()=>{
 const state=seed(now),privateIdentity={email:'identity-fixture@example.edu',actorEmail:'audit-fixture@example.edu',authUserId:'private-auth-fixture',activatedAt:'private-activation-fixture'},task=state.data.tasks[0];
 state.audit.push({id:'privacy-audit',at:now.toISOString(),actorId:'persona01',actorName:'Integrante de prueba',actorEmail:privateIdentity.actorEmail,entity:'tasks',entityId:task.id,action:'modificar',before:{...task,member:privateIdentity},after:{...task,member:privateIdentity},fields:['member'],reason:'Ensayo',operationId:'privacy-operation',source:'interfaz'});
 state.snapshots.push({id:'privacy-nested',kind:'meeting',targetId:'m1',version:1,at:now.toISOString(),actorId:'persona01',reason:'Ensayo',payload:{members:[privateIdentity],nested:{member:privateIdentity},tasks:[task]}});
 const actor=state.data.members.find(m=>m.id==='persona05')!,memberState=publicState(state,actor.id),coordinatorState=publicState(state,'persona01');
 const assertSanitized=(value:unknown)=>{const serialized=JSON.stringify(value);for(const privateValue of Object.values(privateIdentity))assert.equal(serialized.includes(privateValue),false);assert.ok(serialized.includes(task.title));};
 assertSanitized(memberState);assert.ok(JSON.stringify(coordinatorState).includes(privateIdentity.email));assert.ok(JSON.stringify(state).includes(privateIdentity.authUserId));
 const store={load:async()=>state,create:async()=>{},save:async()=>true};
 const legacy=await readQuery(new Request('https://du.example/api/history?limit=100'),store,state.workspaceId,actor,state);assertSanitized(await legacy!.json());
 const storedRow=state.audit.at(-1)!;
 const paged={...store,history:async()=>({rows:[structuredClone(storedRow)],total:1})};
 const response=await readQuery(new Request('https://du.example/api/history'),paged,state.workspaceId,actor,state);assertSanitized(await response!.json());assert.equal(storedRow.actorEmail,privateIdentity.actorEmail);
});
function call(s:State,actor:string,kind:string,data:any,entity?:any,id?:string,version?:number){return execute(s,actor,{id:crypto.randomUUID(),kind,data,entity,entityId:id,expectedVersion:version},now);}
test('Coordinación ve todas las incidencias; cada integrante sólo las asignadas, con pedidos, comentarios e historial coherentes',()=>{
 let state=seed(now);state=call(state,'persona01','create',{targetType:'issues',targetId:'i2',body:'Comentario reservado de otra incidencia'},'comments').state;
 const own=state.data.issues.find(i=>i.ownerId==='persona05')!,other=state.data.issues.find(i=>i.ownerId!=='persona05')!;
 state.snapshots.push({id:'privacy-snapshot',kind:'meeting',targetId:'m1',version:1,at:now.toISOString(),actorId:'persona01',reason:'Ensayo',payload:{issues:state.data.issues}});
 const mine=publicState(state,'persona05'),all=publicState(state,'persona01');assert.deepEqual(mine.data.issues.map(i=>i.id),[own.id]);assert.equal(all.data.issues.length,2);assert.ok(!mine.data.comments.some(c=>c.targetId===other.id));assert.ok(!mine.audit.some(e=>e.entityId===other.id||e.after?.targetId===other.id));assert.equal(mine.snapshots.at(-1)!.payload.issues.length,1);
 assert.throws(()=>call(state,'persona05','create',{targetType:'issues',targetId:other.id,body:'Acceso por ID ajeno'},'comments'),/otra persona/);
 assert.throws(()=>call(state,'persona05','request_intervention',{issueId:other.id,request:'Pedido ajeno',neededBy:'2026-10-23'}),/otra persona/);
});
test('La API impone el propietario de incidencias aunque se alteren los filtros',async()=>{
 const state=seed(now),identity={id:'verified-persona05',email:'persona05@example.edu',provider:'google' as const,verified:true as const};state.accessMode='institutional';Object.assign(state.data.members.find(m=>m.id==='persona05')!,{email:identity.email,authUserId:identity.id});let captured:any;
 const store={load:async()=>state,loadAccess:async()=>state,create:async()=>{},save:async()=>true,records:async(_k:string,_e:string,filters:any)=>{captured=filters;return{rows:[],total:0};}};
 const response=await api(new Request('https://du.example/api/records?entity=issues&filters='+encodeURIComponent(JSON.stringify({owner:'persona03'}))),store,state.workspaceId,{mode:'team',identity});assert.equal(response.status,200);assert.equal(captured.owner,'persona05');
 const plainStore={load:async()=>state,create:async()=>{},save:async()=>true};const read=await api(new Request('https://du.example/api/records?entity=issues'),plainStore,state.workspaceId,{mode:'team',identity});const rows=(await read.json()as any).rows;assert.ok(rows.length);assert.ok(rows.every((i:any)=>i.ownerId==='persona05'));
});
test('Áreas y personas se asignan en ambos sentidos, sin expansión transitiva ni responsables inventados',()=>{
 const state=seed(now);state.data.areas.find(a=>a.id==='universidad')!.substitutes=['persona07'];
 const area=resolveProjectAssignments(state,[],['universidad']);assert.deepEqual(area.members,['persona05','persona07']);assert.deepEqual(area.areaIds,['universidad']);
 const person=resolveProjectAssignments(state,['persona06'],[]);assert.deepEqual(person.areaIds,['sstedu','ueicee']);assert.deepEqual(person.members,['persona06']);
 const many=resolveProjectAssignments(state,['persona06'],['universidad']);assert.deepEqual(new Set(many.members),new Set(['persona06','persona05','persona07']));assert.equal(new Set(many.areaIds).size,3);assert.ok(!many.areaIds.includes('privada'));
 assert.deepEqual(followedAreaKeys(state,'persona05'),['universidad']);
});
test('La prioridad DU de un proyecto compartido es independiente del destacado del Tablero',()=>{
 const source={id:'gestion:source',sourceId:'source',version:1,title:'Proyecto compartido',status:'Activo',areaKeys:['universidad'],favorite:false};const original=seed(now);original.externalProjects=[source];
 const marked=call(original,'persona05','set_priority',{selected:true,order:0,reason:'Foco DU'},undefined,source.id,1).state;assert.equal(marked.data.projects.some(p=>p.id===source.id),false);assert.equal(marked.data.projectLinks[0].duPriority,true);assert.equal(source.favorite,false);assert.equal(publicState({...marked,externalProjects:[source]},'persona05').data.projects.find(p=>p.id===source.id)!.duPriority,true);
 assert.throws(()=>call(original,'persona06','set_priority',{selected:true,order:0,reason:'Área ajena'},undefined,source.id,1),/referente/);
 const cleared=call({...marked,externalProjects:[source]},'persona05','set_priority',{selected:false,order:0,reason:'Ya no es foco'},undefined,source.id,marked.data.projectLinks[0].version).state;assert.equal(cleared.data.projectLinks[0].duPriority,false);assert.equal(source.favorite,false);
});
test('El seguimiento admite varias personas y áreas y conserva la ficha original del proyecto',()=>{
 const state=seed(now),source={id:'gestion:source',sourceId:'source',version:1,title:'Título original',status:'Activo',areaKeys:['universidad']};state.externalProjects=[source];
 const result=call(state,'persona05','configure_project_tracking',{sourceId:'source',manualMemberIds:['persona06'],manualAreaIds:['universidad']}).state,link=result.data.projectLinks[0];assert.deepEqual(new Set(link.members),new Set(['persona06','persona05']));assert.equal(link.areaIds.length,3);assert.equal(link.title,undefined);assert.equal(result.data.projects.some(p=>p.id===source.id),false);assert.equal(source.title,'Título original');
});
test('Un proyecto propio DU también guarda las asignaciones automáticas y rechaza datos inválidos',()=>{
 const state=seed(now),created=call(state,'persona01','create',{title:'Proyecto DU con seguimiento',outcome:'Resultado verificable',leadId:'persona06',manualMemberIds:[],manualAreaIds:['sstedu']},'projects'),project=created.state.data.projects.find(p=>p.id===created.result.id)!;
 assert.deepEqual(project.members,['persona06']);assert.deepEqual(project.areaIds,['sstedu']);assert.equal(project.areaId,'sstedu');
 assert.throws(()=>call(state,'persona01','create',{title:'Solicitud inválida',outcome:'No debe guardarse',manualMemberIds:'persona06',manualAreaIds:[]},'projects'),/personas y áreas válidas/);
});
test('El historial paginado comprueba propiedad en Postgres antes de contar o devolver registros',async()=>{
 const db=new PGlite();try{await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;');await db.exec(await readFile('supabase/schemas/du_equipo.sql','utf8'));let state=seed(now);state=call(state,'persona01','create',{targetType:'issues',targetId:'i2',body:'Comentario de otro responsable'},'comments').state;state=call(state,'persona05','issue_status',{status:'En tratamiento'},undefined,'i1',1).state;
 state.accessMode='institutional';await db.query('insert into public.du_workspaces(id,revision,payload)values($1,$2,$3)',[state.workspaceId,state.revision,state]);await db.exec('begin;'+await readFile('deploy/du-relational-migration.sql','utf8')+'commit;');await db.exec(await readFile('deploy/du-issue-visibility.sql','utf8'));
 const history=async(actor:string,filters:any={})=>(await db.query<{v:any}>('select public.du_list_history($1,$2,$3)v',[state.workspaceId,actor,filters])).rows[0].v;
 assert.equal((await history('persona01')).total,state.audit.length);const mine=await history('persona05');assert.ok(mine.rows.some((e:any)=>e.entityId==='i1'));assert.ok(!mine.rows.some((e:any)=>e.after?.targetId==='i2'));assert.equal((await history('persona05',{entity:'issues',entityId:'i2'})).total,0);await assert.rejects(()=>history('missing'),/Inactive/);
 await db.exec('set role authenticated');await assert.rejects(()=>history('persona01'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});

test('El filtro de áreas conserva Transversales de SINIGEP junto con las áreas de seguimiento DU',()=>{const project={areaKey:'privada',areaKeys:['privada','transversales']},before=structuredClone(project);assert.deepEqual(projectFilterAreaKeys(project,['universidad','privada']),['privada','transversales','universidad']);assert.deepEqual(project,before);assert.deepEqual(projectFilterAreaKeys({areaKey:'transversales',areaKeys:[]},[]),['transversales']);});
