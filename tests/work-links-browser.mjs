import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {institutionalState} from '../shared/team.ts';
import {execute} from '../shared/domain.ts';
import {api} from '../server/api.ts';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4361',workspace='flat-tasks',emails={persona01:'persona01@example.edu',persona05:'persona05@example.edu'};
let state=institutionalState(workspace,emails,emails.persona01);
const identity={id:'verified-persona05',email:emails.persona05,provider:'google',verified:true};
function add(title,description){const next=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title,description,ownerId:'persona05'}});state=next.state;return next.result.id;}
const parent=add('Preparar informe de prueba','Contenido principal'),child=add('Relevar datos de prueba','Detalle histórico que debe conservarse');
state.data.tasks.find(row=>row.id===child).parentTaskId=parent;
const originalChild=structuredClone(state.data.tasks.find(row=>row.id===child));
const store={load:async()=>structuredClone(state),create:async()=>{throw Error('No implicit workspace');},save:async(_key,revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[],passed=[];
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await mkdir('test-results',{recursive:true});
await context.route(origin+'/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
 if(path.startsWith('/api/gestion/'))return route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});
 if(path.startsWith('/api/calendar/'))return route.fulfill({json:{configured:false,connected:false,events:[],connections:[]}});
 const response=await api(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),store,workspace,{mode:'team',identity});
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
});
const form=()=>page.locator('dialog.form-dialog'),detail=()=>page.locator('dialog.detail-sheet');
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function open(title){await page.locator('.task-name').filter({hasText:title}).click();await detail().waitFor();}
try{
 await page.goto(origin+'/#Inicio');await page.waitForLoadState('networkidle');
 await check('Las tareas anteriores se muestran al mismo nivel sin acciones ni filtros de subtareas',async()=>{
  await page.locator('.task-name').filter({hasText:originalChild.title}).waitFor();assert.equal(await page.getByRole('button',{name:/subtarea/i}).count(),0);
  await page.getByText('Más filtros',{exact:true}).click();assert.equal(await page.getByRole('option',{name:'Subtareas',exact:true}).count(),0);assert.equal(await page.getByRole('option',{name:'Trabajos raíz',exact:true}).count(),0);await page.getByText('Más filtros',{exact:true}).click();
  await open(originalChild.title);await detail().getByText(originalChild.description,{exact:true}).waitFor();assert.equal(await detail().getByRole('button',{name:/subtarea/i}).count(),0);
  await detail().getByRole('button',{name:'Editar ficha',exact:true}).click();assert.equal(await form().getByRole('combobox',{name:'Tarea de la que depende',exact:true}).count(),0);assert.equal(await form().getByRole('combobox',{name:'Proyecto o línea',exact:true}).count(),1);assert.equal(await form().getByLabel('Descripción',{exact:true}).inputValue(),originalChild.description);
  await form().getByRole('button',{name:'Cancelar',exact:true}).click();await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();
 });
 await check('Cerrar la tarea anterior principal conserva la otra tarea abierta y sin cambios',async()=>{
  await open('Preparar informe de prueba');await detail().getByRole('button',{name:'Actualizar estado',exact:true}).click();await form().getByLabel('Nuevo estado',{exact:true}).selectOption('Terminada');await form().getByLabel('Nota de avance, entrega o motivo',{exact:true}).fill('Trabajo completo');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});
  assert.equal(state.data.tasks.find(row=>row.id===parent).status,'Terminada');assert.deepEqual(state.data.tasks.find(row=>row.id===child),originalChild);
  await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await open(originalChild.title);await detail().getByRole('button',{name:'Trabajo vinculado',exact:true}).first().click();assert.equal(await detail().getByRole('heading',{name:/Subtareas/}).count(),0);await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();
 });
 await check('Ampliar la descripción conserva identidad y autoría del registro anterior',async()=>{
  await open(originalChild.title);await detail().getByRole('button',{name:'Editar ficha',exact:true}).click();await form().getByLabel('Descripción',{exact:true}).fill(originalChild.description+' — Información ampliada');await form().getByLabel('Motivo del cambio',{exact:true}).fill('Precisar el detalle');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});
  const row=state.data.tasks.find(row=>row.id===child);assert.equal(row.id,child);assert.equal(row.ownerId,originalChild.ownerId);assert.equal(row.code,originalChild.code);assert.equal(row.parentTaskId,null);assert.match(row.description,/Información ampliada/);assert.equal(state.audit.findLast(event=>event.entityId===child).before.parentTaskId,parent);
 });
 assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:'test-results/flat-tasks-failure.png',fullPage:true});console.error(error.stack);process.exitCode=1;}
finally{await writeFile('test-results/work-links-browser.json',JSON.stringify({passed,errors,isolated:true},null,2));await browser.close();}
