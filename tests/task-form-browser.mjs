import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {institutionalState} from '../shared/team.ts';
import {api} from '../server/api.ts';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const emails={persona01:'persona01@example.edu',persona02:'persona02@example.edu',persona05:'persona05@example.edu'};
let state=institutionalState('task-form-regression',emails,emails.persona01);
const identity={id:'verified-persona05',email:emails.persona05,provider:'google',verified:true};
const store={async load(){return structuredClone(state);},async create(){throw Error('No implicit workspace creation');},async save(_key,revision,next){if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1360,height:960}}),page=await context.newPage();
const errors=[],commands=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
await mkdir('test-results',{recursive:true});
await context.route('**/api/**',async route=>{
 const r=route.request();if(new URL(r.url()).pathname.startsWith('/api/calendar/'))return route.fulfill({json:{configured:false,connected:false,events:[],connections:[]}});if(new URL(r.url()).pathname.startsWith('/api/gestion/'))return route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})});
 const response=await api(request,store,'task-form-regression',{mode:'team',identity});
 const body=await response.text();
 if(new URL(r.url()).pathname==='/api/command')commands.push({status:response.status,body:JSON.parse(body)});
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
});
async function check(name,run){await run();passed.push(name);console.log('PASS '+name);}
try{
 await page.goto(process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4173/');await page.waitForLoadState('networkidle');
 await check('Integrante crea una tarea con solo título y responsable en un espacio sin proyectos',async()=>{
  assert.equal(state.data.projects.length,0);
  await page.getByRole('button',{name:'Crear tarea',exact:true}).first().click();
  await page.getByLabel('Título de la tarea',{exact:true}).fill('Primera tarea sin proyecto');
  assert.equal(await page.getByLabel('Responsable',{exact:true}).inputValue(),'persona05');
  await page.locator('dialog.form-dialog').getByRole('button',{name:'Crear tarea',exact:true}).click();
  await page.locator('dialog.form-dialog').waitFor({state:'hidden'});
  assert.equal(state.data.tasks.length,1);assert.equal(state.data.tasks[0].ownerId,'persona05');
  assert.ok(!state.data.tasks[0].projectId);assert.equal(commands.at(-1).status,200);
  await page.reload();await page.waitForLoadState('networkidle');
  await page.getByRole('textbox',{name:'Buscar en DU Equipo',exact:true}).fill('Primera tarea sin proyecto');
  await page.getByRole('button',{name:/Primera tarea sin proyecto/}).last().waitFor();
  await page.getByRole('textbox',{name:'Buscar en DU Equipo',exact:true}).fill('');
 });
 await check('Validación sin persona seleccionada se detecta antes de enviar y conserva el borrador',async()=>{
  await page.getByRole('button',{name:'Crear tarea',exact:true}).first().click();
  await page.getByLabel('Título de la tarea',{exact:true}).fill('Entrega para validar sin perder borrador');
  await page.getByLabel('Requiere validación',{exact:true}).check();
  const validator=page.getByLabel('Validador',{exact:true}),before=commands.length;
  await page.locator('dialog.form-dialog').getByRole('button',{name:'Crear tarea',exact:true}).click();
  await page.waitForTimeout(200);
  if(commands.length!==before)throw Error('El formulario envió una persona no elegida y respondió '+commands.at(-1).status+': '+commands.at(-1).body.error);
  assert.equal(await validator.inputValue(),'');
  assert.equal(await validator.evaluate(el=>el.validity.valueMissing),true);
  assert.equal(await page.getByLabel('Título de la tarea',{exact:true}).inputValue(),'Entrega para validar sin perder borrador');
  assert.equal(state.data.tasks.length,1);
 });
 await check('El formulario ofrece un validador diferente del responsable y conserva un único guardado',async()=>{
  assert.ok(!(await page.getByLabel('Validador',{exact:true}).locator('option').evaluateAll(rows=>rows.map(row=>row.value))).includes('persona05'));
  assert.equal(state.data.tasks.length,1);
  await page.getByLabel('Validador',{exact:true}).selectOption('persona01');
  await page.locator('dialog.form-dialog').getByRole('button',{name:'Crear tarea',exact:true}).click();
  await page.locator('dialog.form-dialog').waitFor({state:'hidden'});
  const task=state.data.tasks.find(t=>t.title==='Entrega para validar sin perder borrador');
  assert.ok(task);assert.equal(task.validatorId,'persona01');assert.equal(task.requiresValidation,true);
  assert.equal(state.data.tasks.length,2);assert.equal(commands.at(-1).status,200);
  assert.equal(state.audit.filter(e=>e.entityId===task.id&&e.action==='crear').length,1);
  await page.reload();await page.waitForLoadState('networkidle');
  await page.getByRole('textbox',{name:'Buscar en DU Equipo',exact:true}).fill('Entrega para validar sin perder borrador');
  await page.getByRole('button',{name:/Entrega para validar sin perder borrador/}).last().waitFor();
  assert.deepEqual(errors,[]);
 });
 await page.screenshot({path:'test-results/tarea-validacion-corregida.png',fullPage:true});
}catch(e){await page.screenshot({path:'test-results/tarea-validacion-fallo.png',fullPage:true});console.error(e.stack??e);process.exitCode=1;}
finally{await writeFile('test-results/task-form-browser.json',JSON.stringify({passed,errors,commands:commands.map(c=>({status:c.status,error:c.body.error})),fixture:'isolated institutional workspace; production data unchanged'},null,2));await browser.close();}
