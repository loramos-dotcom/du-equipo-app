import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {User} from '@supabase/supabase-js';
import {summarizeStoredPrivateData,readStoredPrivateDataCheck,privateDataRevision} from '../server/private-data-check.ts';
import {managementRequest} from '../server/management.ts';
import {managementUrl,managementPublishableKey} from '../shared/management-config.ts';
import {teamRequest} from '../server/team.ts';
import {institutionalState} from '../shared/team.ts';

// This worker uses synthetic private references only; it never reads a real secret value.
delete process.env.DU_PRIVATE_REFERENCE_DATA;

const config={origin:'https://du.example.edu',supabaseUrl:'https://du-fixture.supabase.co',publishableKey:'public-fixture',secretKey:'fixture-admin-credential',workspaceId:'du-check-fixture'};
const identity={id:'fixture-du-user',email:'member@example.edu',provider:'google' as const,verified:true as const};
const boardUser={id:'fixture-board-user',email:identity.email,email_confirmed_at:'2026-11-13',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{email:identity.email,email_verified:true}}]} as unknown as User;
const token='fixture-private-board-session';
function auth(user:User|null=boardUser){return {user:async()=>user,session:async()=>({access_token:token}),finish:(response:Response)=>{const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('vary','Cookie');return new Response(response.body,{status:response.status,headers});}};}
const checkRequest=(method='GET')=>new Request(config.origin+'/api/gestion/security-check?route=https://example.invalid&select=*',{method,headers:{origin:config.origin,authorization:'Bearer fixture-forged-browser-token',apikey:'fixture-forged-browser-key'}});
function education(){
 const sector=()=>({total:'8.765.432*',state:0,private:'1 234'});
 const levels=()=>Object.fromEntries(['initial','primary','secondary','adult','special','higher'].map(level=>[level,sector()]));
 return {schools:sector(),schoolLevels:levels(),schoolSummary:sector(),students:sector(),studentLevels:levels(),studentSummary:sector(),teachers:sector(),otherServices:{services:'0',students:0},copy:{enrollmentNote:'Nota ficticia de prueba',teacherNote:'Otra nota ficticia',sources:'Origen ficticio'}};
}
const project=(id='fixture-project')=>({id,name:'Datos del Sistema Educativo - synthetic-private-name',visual_metrics:{educationSystem:education()}});
const map=(id='fixture-view')=>({id,view_key:'administrative_works_map',title:'Mapa de obras ficticias',payload:{markers:[{id:'fixture-marker',name:'synthetic-private-marker',address:'synthetic-private-address',lat:0,lng:0,semaforo:'R'}]}});
const revisions=()=>({projects_revision:0,portfolio_revision:0,access_revision:0});
function valuesAreCountsOnly(value:unknown):boolean{return typeof value==='boolean'||typeof value==='number'||!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(valuesAreCountsOnly);}

test('El diagnóstico devuelve únicamente agregados y nunca los datos, nombres o identificadores recibidos',()=>{
 const report=summarizeStoredPrivateData([project()],[map()]);
 assert.equal(report.complete,true);assert.equal(report.education.candidates,1);assert.equal(report.education.requiredNumericFields,53);assert.equal(report.education.presentNumericFields,53);assert.equal(report.education.missingNumericFields,0);assert.equal(report.education.notesComplete,true);
 assert.equal(report.worksMaps.markersTotal,1);assert.equal(report.worksMaps.withExplicitValidTrafficLight,1);assert.ok(valuesAreCountsOnly(report));
 assert.doesNotMatch(JSON.stringify(report),/synthetic-private|fixture-project|fixture-marker|8\.765\.432|example\.edu/);
});
test('Cero candidatos, datos parciales, nulos y valores no numéricos nunca dan un completo falso',()=>{
 const absent=summarizeStoredPrivateData([],[]);assert.equal(absent.complete,false);assert.equal(absent.education.complete,false);assert.equal(absent.worksMaps.complete,false);
 const partial=summarizeStoredPrivateData([{id:'fixture',name:'Datos del Sistema Educativo',visual_metrics:{educationSystem:{schools:{total:'0',state:null,private:'Sin informar'}}}}],[map()]);
 assert.equal(partial.education.presentNumericFields,1);assert.equal(partial.education.missingNumericFields,52);assert.equal(partial.complete,false);
 const renamed=summarizeStoredPrivateData([{id:'fixture',name:'Nombre ficticio distinto',visual_metrics:{educationSystem:null}}],[]);assert.equal(renamed.education.candidates,1);assert.equal(renamed.education.presentObjects,0);assert.equal(renamed.education.complete,false);
});
test('El conteo de estados comparte la clasificación del mapa y no inventa verdes para estados desconocidos',()=>{
 const row=map();row.payload.markers=[
  {id:'a',name:'Ficticio',address:'',lat:0,lng:0,semaforo:'V'},
  {id:'b',name:'Ficticio',address:'',lat:0,lng:0,status:'En ejecución'},
  {id:'c',name:'Ficticio',address:'',lat:0,lng:0,status:'Por confirmar'},
  {id:'d',name:'Ficticio',address:'',lat:0,lng:0,status:'Finalizado'},
 ] as any;
 const report=summarizeStoredPrivateData([project()],[row]);assert.equal(report.worksMaps.markersTotal,4);assert.equal(report.worksMaps.withExplicitValidTrafficLight,1);assert.equal(report.worksMaps.withRecognizedTextualStatus,2);assert.equal(report.worksMaps.unknownStatuses,1);assert.equal(report.worksMaps.complete,false);
});
test('Mapas vacíos o marcadores inválidos no certifican preservación',()=>{
 const row=map();row.payload.markers=[];assert.equal(summarizeStoredPrivateData([project()],[row]).worksMaps.complete,false);
 row.payload.markers=[null,{status:'En ejecución'},{lat:100,lng:0,semaforo:'V'}] as any;
 const report=summarizeStoredPrivateData([project()],[row]);assert.equal(report.worksMaps.invalidCoordinates,3);assert.equal(report.worksMaps.unknownStatuses,1);assert.equal(report.complete,false);
});

function source(options:{cap?:number;headers?:boolean;changed?:boolean;denied?:number;duplicate?:boolean;privateError?:boolean}={}){
 const calls:{table:string;offset:number;method:string;headers:Headers}[]=[],projects=[{id:'unrelated-a',name:'Otro proyecto sintético',visual_metrics:{}},{id:'unrelated-b',name:'Otro proyecto sintético',visual_metrics:{}},project('last-private-fixture')],views=[{id:'unrelated-view',view_key:'other',title:'Otra vista ficticia',payload:{}},map('last-view-fixture')];let revisionReads=0;
 const transport:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,managementUrl);assert.equal(init?.method??'GET','GET');assert.equal(init?.redirect,'error');const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),'Bearer '+token);assert.equal(headers.get('apikey'),managementPublishableKey);assert.notEqual(headers.get('apikey'),config.secretKey);
  const table=url.pathname.split('/').at(-1)!;
  if(table==='du_management_revisions'){revisionReads++;return Response.json([{...revisions(),projects_revision:options.changed&&revisionReads>1?1:0}]);}
  assert.ok(['projects','special_views'].includes(table));assert.equal(url.searchParams.get('order'),'id.asc');assert.equal(url.searchParams.get('select'),table==='projects'?'id,name,visual_metrics':'id,view_key,title,payload');assert.equal(headers.get('prefer'),'count=exact');
  const offset=Number(url.searchParams.get('offset'));calls.push({table,offset,method:init?.method??'GET',headers});
  if(options.denied)return Response.json({error:options.privateError?'synthetic-private-error-detail': 'Denied'},{status:options.denied});
  const all=table==='projects'?projects:views,rows=all.slice(options.duplicate?0:offset,(options.duplicate?0:offset)+(options.cap??1));
  return Response.json(rows,{headers:options.headers?{'content-range':rows.length?`${offset}-${offset+rows.length-1}/${all.length}`:`*/${all.length}`}:{}});
 };
 return {transport,calls};
}
test('Paginación continúa con límites del servidor menores a 200 y verifica todos los candidatos',async()=>{
 const s=source({cap:1,headers:true}),report=await readStoredPrivateDataCheck(token,s.transport);
 assert.equal(report.complete,true);assert.deepEqual(s.calls.filter(call=>call.table==='projects').map(call=>call.offset),[0,1,2]);assert.deepEqual(s.calls.filter(call=>call.table==='special_views').map(call=>call.offset),[0,1]);assert.ok(valuesAreCountsOnly(report));
});
test('Sin total Content-Range exige una página vacía en lugar de dar por finalizada una página corta',async()=>{
 const s=source({cap:1}),report=await readStoredPrivateDataCheck(token,s.transport);assert.equal(report.complete,true);assert.deepEqual(s.calls.filter(call=>call.table==='projects').map(call=>call.offset),[0,1,2,3]);assert.deepEqual(s.calls.filter(call=>call.table==='special_views').map(call=>call.offset),[0,1,2]);
});
test('Páginas repetidas, respuestas malformadas o denegadas no terminan en falso completo',async()=>{
 await assert.rejects(()=>readStoredPrivateDataCheck(token,source({duplicate:true}).transport),/paginación/);
 await assert.rejects(()=>readStoredPrivateDataCheck(token,async()=>Response.json({not:'a page'})),/respuesta del origen/);
 for(const status of [401,403,500])await assert.rejects(()=>readStoredPrivateDataCheck(token,source({denied:status}).transport),error=>!!error&&typeof error==='object'&&'status'in error&&error.status===(status===500?503:status));
});
test('El endpoint permite al integrante autorizado comprobar sin exportar identidad ni referencia privada',async()=>{
 const s=source({headers:true}),response=await managementRequest(checkRequest(),config,identity,()=>auth() as any,s.transport,false);
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/private.*no-store/);assert.equal(response.headers.get('vary'),'Cookie');const report=await response.json();assert.equal(report.complete,true);assert.ok(valuesAreCountsOnly(report));assert.doesNotMatch(JSON.stringify(report),/fixture|example\.edu|Bearer|token|apikey|visual_metrics|payload/);
});
test('Sin sesión Google del origen o con otra identidad no consulta ninguna fila',async()=>{
 for(const [user,status]of [[null,401],[{...boardUser,email:'other@example.edu'},403],[{...boardUser,identities:[]},403]] as const){let called=false;const response=await managementRequest(checkRequest(),config,identity,()=>auth(user as User|null) as any,async()=>{called=true;return new Response();});assert.equal(response.status,status);assert.equal(called,false);assert.match(response.headers.get('cache-control')??'',/no-store/);}
});
test('Métodos de escritura y HEAD quedan rechazados, sin invocar autenticación ni transporte del origen',async()=>{
 for(const method of ['POST','PATCH','DELETE','HEAD']){let called=false;const response=await managementRequest(checkRequest(method),config,identity,()=>({finish:(r:Response)=>r,user:async()=>{called=true;return boardUser;}}) as any,async()=>{called=true;return new Response();});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET');assert.equal(called,false);}
});
test('Revisión concurrente o revisión ilegible cancela el resultado y oculta detalles del origen',async()=>{
 const changed=await managementRequest(checkRequest(),config,identity,()=>auth() as any,source({changed:true}).transport);assert.equal(changed.status,409);assert.doesNotMatch(await changed.text(),/fixture|example\.edu|private-board/);
 assert.throws(()=>privateDataRevision({}),/revisión coherente/);assert.equal(privateDataRevision({projects_revision:'00',portfolio_revision:1,access_revision:'2'}),'0:1:2');
 const denied=await managementRequest(checkRequest(),config,identity,()=>auth() as any,source({denied:403,privateError:true}).transport);assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/synthetic-private-error-detail/);
});
test('El control DU previo mantiene 401 sin sesión, 403 al desactivar y 403 para escritura de otro origen',async()=>{
 const state=institutionalState(config.workspaceId,{persona01:'coord@example.edu',persona05:identity.email},'coord@example.edu');state.data.members.find(row=>row.id==='persona05')!.active=false;
 const store={load:async()=>state,loadAccess:async()=>state,create:async()=>{throw Error('No writes');},save:async()=>{throw Error('No writes');}};
 const duAuth=(who:typeof identity|null)=>({identity:async()=>who,finish:(r:Response)=>r}) as any;
 assert.equal((await teamRequest(checkRequest(),config,store,()=>duAuth(null))).status,401);
 assert.equal((await teamRequest(checkRequest(),config,store,()=>duAuth(identity))).status,403);
 const foreign=new Request(config.origin+'/api/gestion/security-check',{method:'POST',headers:{origin:'https://example.invalid'}});
 assert.equal((await teamRequest(foreign,config,store,()=>duAuth(identity))).status,403);
});

function syntheticReference(){
 const data=education();data.copy={...data.copy,title:'Referencia ficticia',subtitle:'Solo prueba',schoolsLabel:'Ficticio',studentsLabel:'Ficticio',teachersLabel:'Ficticio',stateLabel:'Ficticio',privateLabel:'Ficticio',otherServicesTitle:'Ficticio',levelLabels:Object.fromEntries(['initial','primary','secondary','adult','special','higher'].map(key=>[key,'Nivel ficticio']))} as any;
 return JSON.stringify({educationSystem:data,trafficLights:{'fixture-reference-marker':'R'}},(_key,value)=>typeof value==='number'?String(value):value);
}
const proxyRequest=(route:string,method='GET')=>new Request(config.origin+'/api/gestion/proxy?route='+encodeURIComponent(route),{method,headers:{origin:config.origin,'content-type':'application/json'},...(['GET','HEAD'].includes(method)?{}:{body:'{}'})});

test('La referencia privada solo completa datos ausentes de filas autorizadas y conserva valores actuales',async()=>{
 process.env.DU_PRIVATE_REFERENCE_DATA=syntheticReference();
 try{
  const upstream=[{id:'fixture-row',name:'Datos del Sistema Educativo',visual_metrics:{educationSystem:{schools:{total:'Valor actual privado'}},unrelated:{keep:true}}}];
  const before=structuredClone(upstream);
  const response=await managementRequest(proxyRequest('/rest/v1/projects?select=id,name,visual_metrics'),config,identity,()=>auth() as any,async(input,init)=>{
   assert.equal(new URL(String(input)).pathname,'/rest/v1/projects');assert.equal(init?.method,'GET');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
   return Response.json(upstream,{headers:{'content-range':'0-0/1'}});
  });
  assert.equal(response.status,200);assert.equal(response.headers.get('content-range'),'0-0/1');assert.match(response.headers.get('cache-control')??'',/no-store/);
  const rows=await response.json();assert.equal(rows.length,1);assert.equal(rows[0].id,'fixture-row');assert.equal(rows[0].visual_metrics.educationSystem.schools.total,'Valor actual privado');assert.equal(rows[0].visual_metrics.educationSystem.schools.state,'0');assert.deepEqual(rows[0].visual_metrics.unrelated,{keep:true});assert.deepEqual(upstream,before);
 }finally{delete process.env.DU_PRIVATE_REFERENCE_DATA;}
});
test('La referencia no amplía filas/columnas ni altera JSON sin cambios, nulos o errores del origen',async()=>{
 process.env.DU_PRIVATE_REFERENCE_DATA=syntheticReference();
 try{
  for(const raw of ['[]','[ { "id":"fixture-row", "name":"Datos del Sistema Educativo" } ]','[ { "id":"fixture-row", "name":"Datos del Sistema Educativo", "visual_metrics":null } ]','{"error":"fixture error"}']){
   const response=await managementRequest(proxyRequest('/rest/v1/projects?select=id,name'),config,identity,()=>auth() as any,async()=>new Response(raw,{headers:{'content-type':'application/json'}}));assert.equal(response.status,200);assert.equal(await response.text(),raw);
  }
 }finally{delete process.env.DU_PRIVATE_REFERENCE_DATA;}
});
test('Los semáforos privados solo completan marcadores sin ningún estado propio y no agregan ubicaciones',async()=>{
 process.env.DU_PRIVATE_REFERENCE_DATA=syntheticReference();
 try{
  const rows=[{id:'fixture-view',view_key:'administrative_works_map',title:'Mapa de obras ficticio',payload:{markers:[
   {id:'fixture-reference-marker:one',lat:0,lng:0},
   {id:'fixture-reference-marker:two',lat:0,lng:0,status:''},
   {id:'fixture-reference-marker:three',lat:0,lng:0,state:null},
   {id:'fixture-reference-marker:four',lat:0,lng:0,semaforo:'V'},
  ]}}];const before=structuredClone(rows);
  const response=await managementRequest(proxyRequest('/rest/v1/special_views'),config,identity,()=>auth() as any,async()=>Response.json(rows));const received=await response.json();const markers=received[0].payload.markers;
  assert.equal(markers.length,4);assert.equal(markers[0].semaforo,'R');assert.equal(Object.hasOwn(markers[1],'semaforo'),false);assert.equal(Object.hasOwn(markers[2],'semaforo'),false);assert.equal(markers[3].semaforo,'V');assert.deepEqual(rows,before);
 }finally{delete process.env.DU_PRIVATE_REFERENCE_DATA;}
});
test('HEAD, RPC, otras tablas y respuestas denegadas nunca leen ni aplican referencias',async()=>{
 process.env.DU_PRIVATE_REFERENCE_DATA='{invalid synthetic config';
 try{
  for(const [route,method,status]of [['/rest/v1/projects','HEAD',200],['/rest/v1/projects','GET',403],['/rest/v1/profiles','GET',200],['/rest/v1/rpc/save_project_bundle','POST',200]] as const){
   const response=await managementRequest(proxyRequest(route,method),config,identity,()=>auth() as any,async()=>new Response(method==='HEAD'?null:'{"fixture":"unchanged"}',{status,headers:{'content-type':'application/json'}}));assert.equal(response.status,status);if(method!=='HEAD')assert.equal(await response.text(),'{"fixture":"unchanged"}');
  }
 }finally{delete process.env.DU_PRIVATE_REFERENCE_DATA;}
});
test('El checker informa la configuración privada por separado y sigue midiendo solo la base',async()=>{
 process.env.DU_PRIVATE_REFERENCE_DATA=syntheticReference();
 try{
  let reads=0;const response=await managementRequest(checkRequest(),config,identity,()=>auth() as any,async(input)=>{
   const path=new URL(String(input)).pathname;if(path.endsWith('/du_management_revisions'))return Response.json([revisions()]);reads++;
   return Response.json(path.endsWith('/projects')?[{id:'fixture-empty-project',name:'Datos del Sistema Educativo',visual_metrics:{}}]:[{id:'fixture-empty-map',view_key:'administrative_works_map',title:'Mapa de obras',payload:{markers:[]}}],{headers:{'content-range':'0-0/1'}});
  });
  assert.equal(response.status,200);const report=await response.json();assert.equal(reads,2);assert.equal(report.privateReferenceConfigured,true);assert.equal(report.education.presentNumericFields,0);assert.equal(report.education.complete,false);assert.equal(report.worksMaps.complete,false);assert.ok(valuesAreCountsOnly(report));assert.doesNotMatch(JSON.stringify(report),/Referencia ficticia|fixture-reference-marker|8\.765\.432/);
 }finally{delete process.env.DU_PRIVATE_REFERENCE_DATA;}
});
