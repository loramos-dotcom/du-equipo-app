import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichManagementRecords,parsePrivateReferenceData,privateReferenceError} from '../server/private-reference-data.ts';
import type {EducationSystemData} from '../src/gestion/components/educationSystemData.ts';

function education():EducationSystemData{
 const sector=()=>({total:'synthetic-total',state:'synthetic-state',private:'synthetic-private'}),levels=()=>({initial:sector(),primary:sector(),secondary:sector(),adult:sector(),special:sector(),higher:sector()});
 return {copy:{title:'Universo sintético',subtitle:'Niveles ficticios',schoolsLabel:'escuelas',studentsLabel:'estudiantes',teachersLabel:'docentes',stateLabel:'Estatal',privateLabel:'Privada',otherServicesTitle:'Otros servicios',levelLabels:{initial:'Inicial',primary:'Primaria',secondary:'Secundaria',adult:'Adultos',special:'Especial',higher:'Superior'},enrollmentNote:'Nota de ensayo',teacherNote:'Nota de ensayo',sources:'Fuente ficticia'},schools:sector(),schoolLevels:levels(),schoolSummary:sector(),students:sector(),studentLevels:levels(),studentSummary:sector(),teachers:sector(),otherServices:{services:'synthetic-services',students:'synthetic-students'}};
}
const fixture=()=>parsePrivateReferenceData(JSON.stringify({educationSystem:education(),trafficLights:{'synthetic-alpha':'R','synthetic-beta':'F'}}))!;
const project=(metrics:unknown={})=>({name:'Datos del Sistema Educativo de ensayo',visual_metrics:metrics,other:'keep-upstream'});
const view=(markers:unknown[])=>({view_key:'administrative_works_map',title:'Mapa de obras ficticias',payload:{markers,other:'keep-upstream'}});

test('El parser sólo conserva el esquema permitido y descarta metadatos y secretos extra de todos los niveles',()=>{
 const data=education() as any;data.secret='SYNTHETIC_SENTINEL_EXTRA';data.copy.secret='SYNTHETIC_SENTINEL_EXTRA';data.schools.secret='SYNTHETIC_SENTINEL_EXTRA';
 const parsed=parsePrivateReferenceData(JSON.stringify({educationSystem:data,trafficLights:{'synthetic-alpha':'R'},secret:'SYNTHETIC_SENTINEL_EXTRA',capturedAt:'synthetic-capture',sourceCommit:'synthetic-source'}))!;
 assert.deepEqual(Object.keys(parsed).sort(),['educationSystem','trafficLights']);assert.ok(parsed.trafficLights instanceof Map);
 assert.ok(!JSON.stringify(parsed).includes('SYNTHETIC_SENTINEL_EXTRA'));
 const enriched=enrichManagementRecords('projects',[project()],parsed);
 assert.ok(!JSON.stringify(enriched).includes('SYNTHETIC_SENTINEL_EXTRA'));assert.ok(!JSON.stringify(enriched).includes('synthetic-capture'));assert.ok(!JSON.stringify(enriched).includes('synthetic-source'));
});

test('Sin configuración se conserva la identidad de la respuesta y todo JSON inválido falla con mensaje genérico',()=>{
 const rows=[project()];assert.equal(parsePrivateReferenceData(undefined),null);assert.equal(parsePrivateReferenceData('  '),null);assert.equal(enrichManagementRecords('projects',rows,null),rows);
 for(const value of ['SYNTHETIC_SENTINEL_MALFORMED','null','[]','{}',JSON.stringify({educationSystem:education(),trafficLights:{'synthetic-alpha':'SYNTHETIC_SENTINEL_BAD'}}),JSON.stringify({educationSystem:{},trafficLights:{}})]){
  assert.throws(()=>parsePrivateReferenceData(value),error=>error instanceof Error&&error.message===privateReferenceError&&!String(error).includes('SYNTHETIC_SENTINEL'));
 }
});

test('Sólo se completan propiedades educativas ausentes del registro correcto sin tocar lo existente',()=>{
 const reference=fixture(),input=[project({educationSystem:{copy:{title:'Título vigente'},schools:{total:null,state:'',private:0},students:false,teachers:[],otherServices:{services:0}}}),{name:'Otro proyecto sintético',visual_metrics:{}}],before=structuredClone(input),refBefore=structuredClone(reference.educationSystem);
 const output=enrichManagementRecords('projects',input,reference) as any[];
 assert.notEqual(output,input);assert.equal(output.length,input.length);assert.equal(output[1],input[1]);assert.equal(output[0].other,'keep-upstream');
 assert.equal(output[0].visual_metrics.educationSystem.copy.title,'Título vigente');assert.equal(output[0].visual_metrics.educationSystem.copy.subtitle,reference.educationSystem.copy.subtitle);
 assert.deepEqual(output[0].visual_metrics.educationSystem.schools,{total:null,state:'',private:0});assert.equal(output[0].visual_metrics.educationSystem.students,false);assert.deepEqual(output[0].visual_metrics.educationSystem.teachers,[]);
 assert.equal(output[0].visual_metrics.educationSystem.otherServices.services,0);assert.equal(output[0].visual_metrics.educationSystem.otherServices.students,reference.educationSystem.otherServices.students);
 assert.deepEqual(input,before);assert.deepEqual(reference.educationSystem,refBefore);
});

test('La respuesta singular y las proyecciones no adquieren columnas, nombres o filas que no solicitó la cuenta',()=>{
 const reference=fixture();
 for(const row of [{name:'Datos del Sistema Educativo'},{visual_metrics:{}},{name:'Otro proyecto',visual_metrics:{}},project(null),project(''),project(0),project(false),project([]),project({educationSystem:null}),project({educationSystem:[]}),project({educationSystem:''})])assert.equal(enrichManagementRecords('projects',row,reference),row);
 const single=project();assert.notEqual(enrichManagementRecords('projects',single,reference),single);
 for(const empty of [[],null,{error:'synthetic-denied'},{code:'synthetic-denied',message:'synthetic-denied'},false])assert.equal(enrichManagementRecords('projects',empty,reference),empty);
 const unrelated=[project()];assert.equal(enrichManagementRecords('other_table' as any,unrelated,reference),unrelated);
});

test('El respaldo de semáforos se aplica por ID genérico sólo a obras autorizadas sin estado propio',()=>{
 const reference=fixture(),input=[view([{id:'synthetic-alpha:phase'},{id:'synthetic-beta'},{id:'synthetic-missing'}])],before=structuredClone(input);
 const output=enrichManagementRecords('special_views',input,reference) as any[];
 assert.equal(output[0].payload.markers[0].semaforo,'R');assert.equal(output[0].payload.markers[1].semaforo,'F');assert.equal(output[0].payload.markers[2],input[0].payload.markers[2]);
 assert.equal(output[0].payload.other,'keep-upstream');assert.deepEqual(input,before);assert.equal(output.length,input.length);
 assert.deepEqual(Object.keys(output[0]),Object.keys(input[0]));
 const titleOnly={title:'Mapa de obras de ensayo',payload:{markers:[{id:'synthetic-alpha'}]}};assert.notEqual(enrichManagementRecords('special_views',titleOnly,reference),titleOnly);
});

test('Un estado vigente o cualquier estado explícitamente presente, incluso borrado, impide reinyectar un valor anterior',()=>{
 const reference=fixture();
 for(const field of ['semaforo','trafficLight','traffic_light','status','state'])for(const value of ['R','A','V','F','Finalizado','En curso','',null,0,false,[],{},undefined]){
  const input=view([{id:'synthetic-alpha',[field]:value}]);assert.equal(enrichManagementRecords('special_views',input,reference),input);
 }
});

test('No se expanden otras vistas, columnas omitidas, listas vacías ni payloads explícitos',()=>{
 const reference=fixture();
 for(const input of [{view_key:'administrative_works_map'}, {view_key:'other_view',payload:{markers:[{id:'synthetic-alpha'}]}}, {view_key:'administrative_works_map_extra',payload:{markers:[{id:'synthetic-alpha'}]}},...([null,'',0,false,[]].map(payload=>({view_key:'administrative_works_map',payload}))),view([]),view([null,0,false,[],{name:'Sin id'}])])assert.equal(enrichManagementRecords('special_views',input,reference),input);
});

test('Las claves especiales no alteran prototipos ni se convierten en datos por herencia',()=>{
 const data=education(),raw=JSON.stringify({educationSystem:data,trafficLights:{}}).replace('"trafficLights":{}','"trafficLights":{"__proto__":"R","constructor":"A","toString":"V"}');
 const reference=parsePrivateReferenceData(raw)!;assert.equal(reference.trafficLights.get('__proto__'),'R');
 const output=enrichManagementRecords('special_views',view([{id:'__proto__'},{id:'constructor'},{id:'toString'}]),reference) as any;
 assert.deepEqual(output.payload.markers.map((marker:any)=>marker.semaforo),['R','A','V']);assert.equal(Object.getPrototypeOf(output),Object.prototype);
 const safe=fixture(),unmapped=view([{id:'__proto__'},{id:'constructor'}]);assert.equal(enrichManagementRecords('special_views',unmapped,safe),unmapped);
 assert.equal(({} as any).semaforo,undefined);
 const inherited=Object.create({name:'Datos del Sistema Educativo',visual_metrics:{}});assert.equal(enrichManagementRecords('projects',inherited,safe),inherited);
});
