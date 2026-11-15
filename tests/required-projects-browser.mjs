import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {institutionalState} from '../shared/team.ts';
import {execute} from '../shared/domain.ts';
import {api} from '../server/api.ts';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4361',workspace='required-projects-browser',email='persona05@bue.edu.ar';
const user={id:'00000000-0000-4000-8000-000000000005',email,app_metadata:{provider:'google'},user_metadata:{name:'Persona 05'},identities:[{provider:'google',identity_data:{email,email_verified:true}}]};
let state=institutionalState(workspace,{persona01:'persona01@bue.edu.ar',persona05:email},'persona01@bue.edu.ar'),externalWrites=0;
const created=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'projects',data:{title:'Proyecto existente de prueba',outcome:'Completar las entregas de prueba',leadId:'persona05',members:['persona05'],scope:'du'}});state=created.state;
const store={load:async()=>structuredClone(state),create:async()=>{throw Error('No implicit workspace');},save:async(_key,revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],passed=[];
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await mkdir('test-results',{recursive:true});
await context.route(origin+'/api/**',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;
 if(path==='/api/gestion/session')return route.fulfill({json:{connected:true,user}});
 if(path==='/api/gestion/overview')return route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});
 if(path==='/api/gestion/proxy'){
  if(request.method()!=='GET')externalWrites++;
  const endpoint=new URL(url.searchParams.get('route'),'https://fixture').pathname.split('/').at(-1),object=request.headers().accept?.includes('vnd.pgrst.object');
  const row=endpoint==='profiles'?{id:user.id,email,display_name:'Persona 05',role:'root'}:endpoint==='dashboard_permissions'?{can_edit:true}:null;
  return route.fulfill({json:endpoint==='du_management_revisions'?{projects_revision:'1',portfolio_revision:'1',access_revision:'1'}:row?(object?row:[row]):[]});
 }
 if(path.startsWith('/api/calendar/'))return route.fulfill({json:{configured:false,connected:false,events:[],connections:[]}});
 if(path==='/api/backups/status')return route.fulfill({json:{configured:false,connected:false}});
 const response=await api(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),store,workspace,{mode:'team',identity:{id:'verified-persona05',email,provider:'google',verified:true}});
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
});
const form=()=>page.locator('dialog.form-dialog'),detail=()=>page.locator('dialog.detail-sheet'),manager=()=>page.locator('.du-shared-projects');
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function create(title){if(await detail().count())await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await page.locator('.page-heading').getByRole('button',{name:'Crear tarea',exact:true}).click();await form().getByLabel('Título de la tarea',{exact:true}).fill(title);}
async function saveTask(){await form().getByRole('button',{name:'Crear tarea',exact:true}).click();await form().waitFor({state:'hidden'});await detail().waitFor();}
try{
 await page.goto(origin+'/#Inicio');await page.waitForLoadState('networkidle');
 await check('Una tarea sin proyecto no se guarda',async()=>{
  await create('Tarea con proyecto obligatorio');const field=form().getByRole('combobox',{name:'Proyecto o línea',exact:true}),before=JSON.stringify(state);
  assert.notEqual(await field.getAttribute('required'),null);await form().getByRole('button',{name:'Crear tarea',exact:true}).click();assert.equal(await form().isVisible(),true);assert.equal(JSON.stringify(state),before);
  await field.fill('existente');await form().getByRole('option',{name:'Proyecto existente de prueba',exact:true}).click();await saveTask();assert.equal(state.data.tasks.at(-1).projectId,created.result.id);
 });
 await check('Editar permite cambiar el proyecto y conserva la asociación obligatoria',async()=>{
  await detail().getByRole('button',{name:'Editar ficha',exact:true}).click();assert.equal(await form().getByRole('button',{name:'Quitar proyecto o línea',exact:true}).count(),0);await form().getByLabel('Descripción',{exact:true}).fill('Contenido actualizado');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});assert.equal(state.data.tasks.at(-1).projectId,created.result.id);
 });
 await check('Crear proyecto desde la tarea recupera el borrador y lo vincula',async()=>{
  await create('Borrador conservado');await form().getByLabel('Descripción',{exact:true}).fill('Información que se conserva');await form().getByRole('button',{name:'Crear proyecto',exact:true}).click();await form().getByLabel('Nombre',{exact:true}).fill('Proyecto creado desde tarea');await form().getByLabel('Resultado esperado',{exact:true}).fill('Completar la entrega de prueba');await form().getByRole('button',{name:'Crear proyecto',exact:true}).click();await form().getByLabel('Título de la tarea',{exact:true}).waitFor();assert.equal(await form().getByLabel('Título de la tarea',{exact:true}).inputValue(),'Borrador conservado');assert.equal(await form().getByLabel('Descripción',{exact:true}).inputValue(),'Información que se conserva');assert.equal(await form().getByRole('combobox',{name:'Proyecto o línea',exact:true}).inputValue(),'Proyecto creado desde tarea');await saveTask();assert.equal(state.data.tasks.at(-1).projectId,state.data.projects.find(p=>p.title==='Proyecto creado desde tarea').id);
 });
 await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await page.goto(origin+'/#Proyectos');
 await check('Los proyectos propios aparecen en Mis proyectos y abren su ficha DU',async()=>{
  await manager().getByRole('heading',{name:'Proyectos',exact:true}).waitFor();await manager().getByRole('button',{name:'Abrir Proyecto creado desde tarea',exact:true}).click();await detail().getByRole('heading',{name:'Proyecto creado desde tarea',exact:true}).waitFor();await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await manager().getByRole('button',{name:'Crear proyecto',exact:true}).click();await form().getByLabel('Nombre',{exact:true}).fill('Proyecto desde el catálogo');await form().getByLabel('Resultado esperado',{exact:true}).fill('Resultado de prueba');await form().getByRole('button',{name:'Crear proyecto',exact:true}).click();await form().waitFor({state:'hidden'});await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await manager().getByRole('button',{name:'Abrir Proyecto desde el catálogo',exact:true}).waitFor();assert.equal(externalWrites,0);
 });
 await check('El catálogo mixto y el formulario obligatorio funcionan en móvil',async()=>{
  await page.screenshot({path:'test-results/required-projects-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-results/required-projects-mobile.png',fullPage:true});await page.goto(origin+'/#Inicio');await create('Tarea móvil');await form().getByRole('combobox',{name:'Proyecto o línea',exact:true}).fill('existente');await form().getByRole('option',{name:'Proyecto existente de prueba',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-results/required-projects-form-mobile.png',fullPage:true});await saveTask();assert.equal(state.data.tasks.at(-1).projectId,created.result.id);
 });
 assert.ok(state.data.tasks.every(task=>task.projectId));assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:'test-results/required-projects-failure.png',fullPage:true});console.error(await page.locator('main').innerText());if(await form().count()){console.error(await form().innerText());console.error(await form().locator('input,select,textarea').evaluateAll(fields=>fields.map(field=>({label:field.getAttribute('aria-label'),value:field.value,required:field.required,valid:field.validity.valid,validation:field.validationMessage}))));}throw error;}
finally{await writeFile('test-results/required-projects-browser.json',JSON.stringify({passed,errors},null,2));await browser.close();}
