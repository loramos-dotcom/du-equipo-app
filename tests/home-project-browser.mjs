import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {institutionalState} from '../shared/team.ts';
import {execute} from '../shared/domain.ts';
import {addDays,dateInBA,formatDate,rangeLabel,weekStart} from '../shared/model.ts';
import {api} from '../server/api.ts';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const emails={persona01:'persona01@example.edu',persona02:'persona02@example.edu',persona05:'persona05@example.edu'};
let state=institutionalState('home-project-regression',emails,emails.persona01);
const currentWeek=weekStart(dateInBA()),commitmentDate=addDays(currentWeek,2);
let identity={id:'verified-persona05',email:emails.persona05,provider:'google',verified:true};
function run(kind,data={},entityId,entity='tasks',actor='persona05'){
 const result=execute(state,actor,{id:crypto.randomUUID(),kind,entity,data,entityId,expectedVersion:entityId?state.data[entity].find(r=>r.id===entityId)?.version:undefined});state=result.state;return result.result.id;
}
const report=run('create',{title:'Reporte semanal',ownerId:'persona05'});
run('transition_task',{status:'En curso',note:'Preparar reporte del equipo'},report);
const reportCommitment=run('upsert_commitment',{taskId:report,weekId:currentWeek,result:'Enviar el reporte de esta semana',isPriority:true});
run('update_commitment',{outcome:'Cumplido',outcomeNote:'Reporte enviado'},reportCommitment,'commitments');
const brief=run('create',{title:'Preparar brief',ownerId:'persona05'});
run('upsert_commitment',{taskId:brief,weekId:currentWeek,result:'Dejar el primer brief listo',isPriority:true,targetDate:commitmentDate});
run('create',{title:'Reunión DU sin fecha ni compromiso',ownerId:'persona05'});
const closed=run('create',{title:'Tarea ya terminada',ownerId:'persona05'});run('transition_task',{status:'Terminada',note:'Trabajo finalizado'},closed);
const archived=run('create',{title:'Tarea archivada',ownerId:'persona05'});run('transition_task',{status:'Cancelada',note:'Prueba sin efecto'},archived);run('archive',{},archived);
run('create',{title:'Tarea de Persona 01',ownerId:'persona01'},undefined,'tasks','persona01');
const store={async load(){return structuredClone(state);},async create(){throw Error('No implicit workspace creation');},async save(_key,revision,next){if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[],passed=[],commands=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
await mkdir('test-results',{recursive:true});
await context.route('**/api/**',async route=>{
 const r=route.request(),request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})});
 const response=await api(request,store,'home-project-regression',{mode:'team',identity});
 let body=await response.text();if(response.ok&&['/api/access','/api/state'].includes(new URL(r.url()).pathname)){const payload=JSON.parse(body);body=JSON.stringify({...payload,mode:'demo'});}if(new URL(r.url()).pathname==='/api/command')commands.push({status:response.status,error:JSON.parse(body).error});
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
});
const nav=name=>page.locator('nav').getByRole('button',{name:(name==='Inicio'||name==='Tareas')?'Mi panel':name==='Equipo'?'La DU':name,exact:true}).click();
const tasks=()=>page.getByRole('region',{name:'Tus tareas abiertas',exact:true});
const commitments=()=>page.getByRole('region',{name:'Tus compromisos de esta semana',exact:true});
async function check(name,run){await run();passed.push(name);console.log('PASS '+name);}
async function createProject(title,areaId){
 await nav('Proyectos');await page.locator('.page-heading').getByRole('button',{name:'Crear proyecto',exact:true}).click();
 assert.deepEqual(await page.getByLabel('Referente DU',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>o.value)),['','persona05']);
 assert.equal(await page.getByLabel('Área implementadora principal',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('Áreas involucradas',{exact:true}).count(),0);
 await page.getByLabel('Nombre',{exact:true}).fill(title);await page.getByLabel('Resultado esperado',{exact:true}).fill('Contar con una entrega verificable por el equipo.');
 assert.equal(await page.getByLabel('Área implementadora principal',{exact:true}).count(),0);
 await page.locator('dialog.form-dialog').getByRole('button',{name:'Crear proyecto',exact:true}).click();await page.locator('dialog.form-dialog').waitFor({state:'hidden'});
 const created=state.data.projects.find(p=>p.title===title);assert.ok(created);assert.equal(created.leadId,'persona05');assert.deepEqual(created.areaIds,areaId?[areaId]:['universidad']);assert.equal(commands.at(-1).status,200);
 await page.getByRole('button',{name:'Editar ficha',exact:true}).click();
 assert.equal(await page.getByLabel('Área implementadora principal',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('Referente DU',{exact:true}).count(),0);
 await page.getByLabel('Resultado esperado',{exact:true}).fill('Entrega revisada por el referente, con los vínculos originales.');
 await page.locator('dialog.form-dialog').getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await page.locator('dialog.form-dialog').waitFor({state:'hidden'});
 const edited=state.data.projects.find(p=>p.id===created.id);assert.equal(edited.outcome,'Entrega revisada por el referente, con los vínculos originales.');assert.equal(edited.createdBy,'persona05');assert.deepEqual(edited.areaIds,areaId?[areaId]:['universidad']);
 await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
}
try{
 await page.goto(process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4173/');await page.waitForLoadState('networkidle');
 await check('Mi panel contiene una sola lista de pendientes propios y conserva los grupos del boceto',async()=>{await page.getByRole('heading',{name:'Mi panel.',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('#tasks-list .task-row').length===3);assert.equal(await page.getByRole('region',{name:'Tu trabajo',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Pendientes prioritarios',exact:true}).count(),1);const content=await page.locator('#tasks-list').innerText();for(const title of ['Reporte semanal','Preparar brief','Reunión DU sin fecha ni compromiso'])assert.ok(content.includes(title));for(const title of ['Tarea ya terminada','Tarea archivada','Tarea de Persona 01'])assert.ok(!content.includes(title));assert.equal(commands.length,0);});
 await check('Finalizadas permite consultar la tarea original y su fecha de cierre',async()=>{await page.locator('#tasks-list').getByRole('button',{name:'Finalizadas',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#tasks-list .task-row').length===1);assert.ok((await page.locator('#tasks-list').innerText()).includes('Tarea ya terminada'));await page.locator('#tasks-list .task-name').click();await page.getByRole('dialog').getByRole('heading',{name:'Tarea ya terminada',exact:true}).waitFor();await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();});
 await check('Volver a Mi panel restablece los pendientes propios y abre sus fichas',async()=>{await nav('Inicio');await page.waitForFunction(()=>document.querySelectorAll('#tasks-list .task-row').length===3);await page.locator('#tasks-list .task-row').filter({hasText:'Preparar brief'}).locator('.task-name').click();await page.getByRole('dialog').getByRole('heading',{name:'Preparar brief',exact:true}).waitFor();await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();});
 await check('Mi semana conserva resultados y restablece el plan propio desde la navegación',async()=>{await nav('Mi semana');await page.getByLabel('Dueño del plan semanal',{exact:true}).selectOption('persona01');await nav('Inicio');await nav('Mi semana');assert.equal(await page.getByLabel('Dueño del plan semanal',{exact:true}).inputValue(),'persona05');assert.ok((await page.locator('.weekly-promise-card').filter({hasText:'Enviar el reporte de esta semana'}).innerText()).includes('Cumplido'));});
 await check('Mi panel muestra pendientes y finalizadas a 360 px sin desbordamiento',async()=>{await nav('Inicio');await page.setViewportSize({width:360,height:800});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);await page.waitForFunction(()=>document.querySelectorAll('#tasks-list .task-row').length===3);assert.ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.locator('#tasks-list').getByRole('button',{name:'Finalizadas',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#tasks-list .task-row').length===1);assert.ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:'test-results/inicio-finalizadas-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});});
 await check('Un integrante crea proyectos con sus asignaciones automáticas y su propia cartera',async()=>{
  await createProject('Iniciativa DU sin cartera');await createProject('Proyecto Universidad de prueba','universidad');
 });
 await check('Coordinación conserva la selección de referentes y todas las áreas participantes',async()=>{
  identity={id:'verified-persona01',email:emails.persona01,provider:'google',verified:true};await page.reload();await page.waitForLoadState('networkidle');await nav('Proyectos');await page.locator('.page-heading').getByRole('button',{name:'Crear proyecto',exact:true}).click();
  assert.equal(await page.getByLabel('Área implementadora principal',{exact:true}).count(),0);assert.ok(await page.getByRole('group',{name:'Áreas asignadas',exact:true}).getByRole('checkbox').count()>1);assert.ok(await page.getByRole('group',{name:'Personas asignadas',exact:true}).getByRole('checkbox').count()>1);await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual(errors,[]);
 });
}catch(e){await page.screenshot({path:'test-results/home-project-failure.png',fullPage:true});console.error(e.stack??e);process.exitCode=1;}
finally{await writeFile('test-results/home-project-browser.json',JSON.stringify({passed,errors,commands,fixture:'isolated institutional API; no production data changed'},null,2));await browser.close();}
