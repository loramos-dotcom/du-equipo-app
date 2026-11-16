import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';
import {execute} from '../shared/domain.ts';
import {dateInBA,weekStart} from '../shared/model.ts';
import {api} from '../server/api.ts';

const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4361',now=new Date(),week=weekStart(dateInBA(now));
let state=institutionalState('weekly-board',{'persona01':'persona01@example.edu','persona05':'persona05@example.edu'},'persona01@example.edu',now);
const localProjectTitle='Proyecto propio de planificación del equipo',sharedProjectTitle='Proyecto compartido de planificación y seguimiento para coordinar entregas entre varias áreas del equipo';
state.data.projects.push({id:'weekly-project',version:1,title:localProjectTitle,outcome:'Completar las entregas de prueba',status:'Activo',leadId:'persona05',members:['persona05','persona01'],areaId:'ssgad',areaIds:['ssgad','ssgda','ssgad'],areaKeys:['gestion_administrativa']});
state.data.projectLinks.push({id:'weekly-project-link',sourceId:'weekly-shared',version:1,leadId:'persona05',members:['persona05'],areaIds:['sspie'],areaId:'sspie',intervention:'acompaña',areaPriorities:{}});
let externalProjects=[{id:'gestion:weekly-shared',sourceId:'weekly-shared',version:1,title:sharedProjectTitle,outcome:'Coordinar entregas de prueba',status:'Activo',areaKeys:['tecnologia','aprendizaje','tecnologia','transversales']}];
state.data.tasks=[
 {id:'priority',version:1,title:'Preparar informe de prueba',code:'T101',ownerId:'persona05',projectId:'weekly-project',status:'Pendiente',panelPriority:true,priority:'Media'},
 {id:'normal',version:1,title:'Revisar documento de prueba',code:'T102',ownerId:'persona05',projectId:'gestion:weekly-shared',areaIds:['ueicee'],status:'En curso',panelPriority:false,priority:'Media'},
 {id:'other',version:1,title:'Tarea de otra persona',code:'T103',ownerId:'persona01',status:'Pendiente',panelPriority:true}
];
let rejectNext=false;
const store={load:async()=>structuredClone(state),create:async()=>{throw Error('No implicit workspace');},save:async(_key,revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const browser=await chromium.launch({headless:true,...(process.env.DU_TEST_CHROMIUM?{executablePath:process.env.DU_TEST_CHROMIUM}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],passed=[];
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await mkdir('test-results',{recursive:true});
await context.route(origin+'/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(path.startsWith('/api/gestion/'))return route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});
 if(path.startsWith('/api/calendar/'))return route.fulfill({json:{configured:false,connected:false,events:[],connections:[]}});
 if(path==='/api/command'&&rejectNext&&request.postDataJSON()?.kind==='select_week_task'){rejectNext=false;return route.fulfill({status:409,json:{error:'El plan cambió. Actualizá la semana antes de mover la tarea.'}});}
 const response=await api(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),store,'weekly-board',{mode:'team',identity:{id:'verified-persona05',email:'persona05@example.edu',provider:'google',verified:true},externalProjects});
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
});
const upper=()=>page.getByRole('region',{name:'Tareas de la semana',exact:true}),lower=()=>page.getByRole('region',{name:'Resto de tareas',exact:true});
const task=(section,title)=>section.getByRole('article',{name:title,exact:true});
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function settle(){await page.locator('.weekly-task-board[aria-busy="false"]').waitFor();}
try{
 await page.goto(origin+'/#Mi%20semana');await upper().waitFor();
 await check('Prioritarias arriba; tareas propias restantes abajo con información compacta',async()=>{
  assert.equal(await upper().getByRole('article').count(),1);assert.equal(await lower().getByRole('article').count(),1);
  assert.equal(await page.getByRole('article',{name:'Tarea de otra persona',exact:true}).count(),0);
  assert.equal(await page.getByText('Planificar un avance',{exact:true}).count(),0);
  await page.screenshot({path:'test-results/weekly-desktop.png',fullPage:true});
 });
 await check('Cada tarea muestra el proyecto y todas sus áreas sin repetirlas ni usar las áreas de la tarea',async()=>{
  const own=task(upper(),'Preparar informe de prueba'),shared=task(lower(),'Revisar documento de prueba');
  assert.equal(await own.locator('.weekly-task-project').innerText(),localProjectTitle);assert.deepEqual(await own.getByRole('list',{name:'Áreas del proyecto',exact:true}).getByRole('listitem').allTextContents(),['SSGAD','SSGDA']);
  assert.equal(await shared.locator('.weekly-task-project').innerText(),sharedProjectTitle);assert.deepEqual((await shared.getByRole('list',{name:'Áreas del proyecto',exact:true}).getByRole('listitem').allTextContents()).sort(),['SSGDA','SSPIE','SSTEDU','Transversales'].sort());
  assert.equal(await own.locator('.weekly-task-meta').getByText('T101',{exact:true}).count(),0);assert.equal(await shared.locator('.weekly-task-meta').getByText('T102',{exact:true}).count(),0);assert.equal(await shared.locator('.weekly-task-area').getByText('UEICEE',{exact:true}).count(),0);
 });
 await check('Las áreas tienen colores distintos y el mismo color se conserva en todos los chips',async()=>{
  const chips=await page.locator('.weekly-task-area').evaluateAll(elements=>elements.map(el=>({area:el.dataset.area,ink:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderColor})));
  const unique=new Map();
  for(const chip of chips){
   assert.ok(chip.area);assert.notEqual(chip.ink,chip.bg);assert.notEqual(chip.bg,'rgba(0, 0, 0, 0)');
   if(unique.has(chip.area))assert.deepEqual(chip,unique.get(chip.area));else unique.set(chip.area,chip);
  }
  assert.equal(unique.size,5);assert.equal(new Set([...unique.values()].map(chip=>chip.bg)).size,5);
 });
 await check('Arrastrar desde el resto guarda la selección y la recupera al recargar',async()=>{
  await task(lower(),'Revisar documento de prueba').dragTo(upper());await task(upper(),'Revisar documento de prueba').waitFor();await settle();
  assert.equal(state.data.plans.find(p=>p.ownerId==='persona05'&&p.weekId===week).taskSelections.normal,true);
  assert.equal(state.data.tasks.find(t=>t.id==='normal').panelPriority,false);
  await page.reload();await task(upper(),'Revisar documento de prueba').waitFor();assert.equal(await task(upper(),'Revisar documento de prueba').locator('.weekly-task-project').innerText(),sharedProjectTitle);
 });
 await check('Devolver una prioridad al resto afecta solo a esta semana',async()=>{
  await task(upper(),'Preparar informe de prueba').dragTo(lower());await task(lower(),'Preparar informe de prueba').waitFor();await settle();
  assert.equal(state.data.tasks.find(t=>t.id==='priority').panelPriority,true);
  await page.reload();await task(lower(),'Preparar informe de prueba').waitFor();
 });
 await check('Un error de guardado mantiene la tarea en su ubicación y muestra el conflicto',async()=>{
  rejectNext=true;await task(upper(),'Revisar documento de prueba').dragTo(lower());await page.getByRole('alert').filter({hasText:'El plan cambió'}).waitFor();
  assert.equal(await task(upper(),'Revisar documento de prueba').count(),1);assert.equal(await task(lower(),'Revisar documento de prueba').count(),0);
 });
 await check('Se puede agregar con teclado sin arrastrar',async()=>{
  const add=lower().getByRole('button',{name:'Agregar a esta semana: Preparar informe de prueba',exact:true});await add.focus();await add.press('Enter');await task(upper(),'Preparar informe de prueba').waitFor();await settle();
 });
 await check('Las selecciones quedan separadas por semana',async()=>{
  await page.getByRole('button',{name:'Semana siguiente',exact:true}).click();await task(lower(),'Revisar documento de prueba').waitFor();assert.equal(await task(upper(),'Preparar informe de prueba').count(),1);
  await page.getByRole('button',{name:'Esta semana',exact:true}).click();await task(upper(),'Revisar documento de prueba').waitFor();
 });
 await check('En móvil se puede mover con un toque y no hay desborde horizontal',async()=>{
  await page.setViewportSize({width:390,height:844});await upper().getByRole('button',{name:'Quitar de esta semana: Revisar documento de prueba',exact:true}).click();await task(lower(),'Revisar documento de prueba').waitFor();await settle();
  await lower().getByRole('button',{name:'Agregar a esta semana: Revisar documento de prueba',exact:true}).click();await task(upper(),'Revisar documento de prueba').waitFor();await settle();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.ok(await task(upper(),'Revisar documento de prueba').evaluate(row=>row.scrollWidth<=row.clientWidth));await page.screenshot({path:'test-results/weekly-mobile.png',fullPage:true});
 });
 await check('Los planes de otras personas quedan de solo lectura en el tablero',async()=>{
  await page.getByRole('combobox',{name:'Dueño del plan semanal',exact:true}).selectOption('persona01');await task(upper(),'Tarea de otra persona').waitFor();
  assert.equal(await upper().getByRole('button',{name:/Quitar de esta semana/}).count(),0);assert.equal(await upper().locator('[draggable="true"]').count(),0);
  await page.getByRole('combobox',{name:'Dueño del plan semanal',exact:true}).selectOption('persona05');
 });
 await check('Una semana cerrada conserva sus tareas, títulos y bloquea el arrastre',async()=>{
  state=execute({...state,externalProjects},'persona01',{id:'close-browser',kind:'close_week',expectedVersion:state.data.weeks.find(w=>w.id===week).version,data:{weekId:week}},now).state;
  state.data.tasks.find(t=>t.id==='normal').title='Título nuevo fuera del cierre';
  state.data.projects.find(p=>p.id==='weekly-project').title='Nombre actual del proyecto';state.data.areas.find(a=>a.id==='ssgad').name='Área renombrada después del cierre';externalProjects=externalProjects.map(p=>({...p,title:'Nombre actual del proyecto compartido',areaKeys:['ueicee']}));
  await page.reload();await task(upper(),'Revisar documento de prueba').waitFor();assert.equal(await lower().count(),0);assert.equal(await upper().locator('[draggable="true"]').count(),0);assert.equal(await upper().getByRole('button',{name:/Detallar avance semanal/}).count(),0);
  assert.equal(await task(upper(),'Preparar informe de prueba').locator('.weekly-task-project').innerText(),localProjectTitle);assert.equal(await task(upper(),'Revisar documento de prueba').locator('.weekly-task-project').innerText(),sharedProjectTitle);assert.deepEqual(await task(upper(),'Preparar informe de prueba').getByRole('list',{name:'Áreas del proyecto',exact:true}).getByRole('listitem').allTextContents(),['SSGAD','SSGDA']);
 });
 await check('El acceso pendiente de Crear proyecto abre su formulario desde Inicio',async()=>{
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Mi panel',exact:true}).click();await page.locator('.workspace-create-actions').getByRole('button',{name:'Crear proyecto',exact:true}).click();
  await page.getByRole('dialog').getByRole('heading',{name:'Crear proyecto',exact:true}).waitFor();await page.getByRole('dialog').getByLabel('Nombre',{exact:true}).waitFor();
 });
 assert.deepEqual(errors,[]);await writeFile('test-results/weekly-tasks.json',JSON.stringify({passed,errors},null,2));console.log('PASS '+passed.length+' recorridos de Mi semana');
}finally{await browser.close();}
