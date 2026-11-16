import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';
import {api} from '../server/api.ts';
import {addDays,dateInBA,rangeLabel,weekStart} from '../shared/model.ts';

const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4361',now=new Date(),today=dateInBA(now),current=weekStart(today),next=addDays(current,7),old=addDays(current,-28),workspace='current-meeting-browser';
const emails={persona01:'coord@example.edu',persona05:'member@example.edu'};
let state=institutionalState(workspace,emails,emails.persona01,now),actor='persona01',displayToday=today;
for(const id of Object.keys(emails))state.data.members.find(member=>member.id===id).authUserId='verified-'+id;
state.data.tasks.push({id:'own-task',version:1,title:'Preparar entrega de prueba',code:'T101',ownerId:'persona01',status:'Pendiente'});
state.data.meetings=[{id:'m1',version:1,title:'Reunión histórica de prueba',date:addDays(old,1)+'T10:00',weekId:old,planningWeekId:addDays(old,7),status:'Borrador',attendees:['persona01','persona05'],durations:[5,15,15,10],teamPriorities:[]}];
const historical=structuredClone(state.data.meetings[0]),snapshots=JSON.stringify(state.snapshots),commands=[];
const store={load:async()=>structuredClone(state),create:async()=>{throw Error('No implicit workspace');},save:async(_key,revision,nextState)=>{if(state.revision!==revision)return false;state=structuredClone(nextState);return true;}};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],passed=[];
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await mkdir('test-results',{recursive:true});
await context.route(origin+'/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(path.startsWith('/api/gestion/'))return route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});
 if(path.startsWith('/api/calendar/'))return route.fulfill({json:{configured:false,connected:false,events:[],connections:[]}});
 if(path==='/api/backups/status')return route.fulfill({json:{configured:false,connected:false}});
 if(path==='/api/command')commands.push(request.postDataJSON());
 const response=await api(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),store,workspace,{mode:'team',identity:{id:'verified-'+actor,email:emails[actor],provider:'google',verified:true}});
 if(path==='/api/state'){const data=await response.json();return route.fulfill({status:response.status,json:{...data,today:displayToday,weekStart:weekStart(displayToday)}});}
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
});
const select=()=>page.getByRole('combobox',{name:'Reunión seleccionada',exact:true}),form=()=>page.locator('dialog.form-dialog');
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function periods(review,planning){await page.waitForFunction(([a,b])=>{const texts=[...document.querySelectorAll('.meeting-context strong')].map(node=>node.textContent);return texts[0]===a&&texts[1]===b;},[rangeLabel(review),rangeLabel(planning)]);}
async function refresh(){const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/state');await page.getByRole('button',{name:'Actualizar datos del equipo',exact:true}).click();await response;}
async function save(label='Guardar cambios'){await form().getByRole('button',{name:label,exact:true}).click();await form().waitFor({state:'hidden'});}
try{
 await page.goto(origin+'/#Reuni%C3%B3n%20semanal');await select().waitFor();
 await check('Una reunión antigua no controla la vista inicial y consultar no crea otra reunión',async()=>{
  await periods(current,next);assert.equal(await select().inputValue(),'');assert.equal(commands.length,0);assert.equal(state.data.meetings.length,1);assert.deepEqual(state.data.meetings[0],historical);
  await page.getByRole('heading',{name:'Esta semana',exact:true}).waitFor();await page.getByRole('heading',{name:'Próxima semana',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Agregar prioridad del equipo',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Iniciar reunión',exact:true}).count(),0);
  await page.screenshot({path:'test-results/portfolio-current-meeting-preview.png',fullPage:true});
 });
 await check('La planificación personal apunta a la próxima semana aun sin una reunión creada',async()=>{
  await page.getByRole('button',{name:'Planificar mi prioridad',exact:true}).click();assert.equal(await form().getByLabel('Semana del compromiso (lunes)',{exact:true}).inputValue(),next);await form().getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(commands.length,0);
 });
 await check('La selección histórica se conserva al actualizar y el acceso lateral vuelve a esta semana',async()=>{
  await select().selectOption('m1');await periods(old,addDays(old,7));await refresh();await periods(old,addDays(old,7));assert.equal(await select().inputValue(),'m1');
  await page.locator('.sidebar').getByRole('button',{name:'Reunión semanal',exact:true}).click();await periods(current,next);assert.equal(await select().inputValue(),'');assert.deepEqual(state.data.meetings[0],historical);
 });
 let currentId;
 await check('Crear una reunión propone los períodos vigentes y conserva la reunión antigua',async()=>{
  await page.getByRole('button',{name:'Nueva reunión',exact:true}).click();assert.equal(await form().getByLabel('Lunes del período revisado',{exact:true}).inputValue(),current);assert.equal(await form().getByLabel('Lunes de la próxima planificación',{exact:true}).inputValue(),next);
  await save('Crear reunión');currentId=state.data.meetings.find(meeting=>meeting.id!=='m1').id;await periods(current,next);assert.deepEqual(state.data.meetings.find(meeting=>meeting.id==='m1'),historical);
 });
 await page.reload();await select().waitFor();
 await check('La vista automática usa la reunión actual para guardar prioridades, agenda y acuerdos',async()=>{
  await periods(current,next);assert.equal(await select().inputValue(),'');
  await page.getByRole('button',{name:'Agregar prioridad del equipo',exact:true}).click();await form().getByLabel('¿Qué necesita impulsar el equipo?',{exact:true}).fill('Validar la entrega de prueba');await save('Guardar prioridad');await page.getByText('Validar la entrega de prueba',{exact:true}).waitFor();
  assert.equal(commands.at(-1).kind,'meeting_priority');assert.equal(commands.at(-1).entityId,currentId);
  await page.locator('.meeting-operational>summary').click();await page.getByRole('button',{name:'Proponer tema',exact:true}).click();await form().getByLabel('Asunto',{exact:true}).fill('Revisar entrega de prueba');await form().getByLabel('Motivo del cambio',{exact:true}).fill('Necesitamos acordar la entrega');await save();assert.equal(commands.at(-1).data.meetingId,currentId);assert.ok(state.data.agenda.some(item=>item.meetingId===currentId&&item.title==='Revisar entrega de prueba'));
  await page.locator('.meeting-operational>summary').click();await page.getByRole('button',{name:'Registrar decisión',exact:true}).click();await form().getByLabel('Acuerdo concreto',{exact:true}).fill('Acordamos revisar la entrega');await save();assert.equal(commands.at(-1).data.meetingId,currentId);assert.ok(state.data.decisions.some(item=>item.meetingId===currentId&&item.text==='Acordamos revisar la entrega'));
  await page.screenshot({path:'test-results/portfolio-current-meeting-open.png',fullPage:true});
 });
 await check('El lunes la vista automática avanza sin modificar la reunión de la semana anterior',async()=>{
  const before=JSON.stringify(state.data.meetings),count=commands.length;displayToday=next;await refresh();await periods(next,addDays(next,7));assert.equal(await select().inputValue(),'');assert.equal(commands.length,count);assert.equal(JSON.stringify(state.data.meetings),before);
 });
 await check('Un integrante ve los períodos actuales y el diseño móvil no desborda',async()=>{
  actor='persona05';await page.reload();await select().waitFor();await periods(next,addDays(next,7));assert.equal(await page.getByRole('button',{name:'Nueva reunión',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Agregar prioridad del equipo',exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'test-results/portfolio-current-meeting-mobile.png',fullPage:true});
 });
 assert.deepEqual(state.data.meetings.find(meeting=>meeting.id==='m1'),historical);assert.equal(JSON.stringify(state.snapshots),snapshots);assert.deepEqual(errors,[]);
 await writeFile('test-results/current-meeting-browser.json',JSON.stringify({passed,errors},null,2));console.log('PASS '+passed.length+' recorridos de reunión semanal');
}finally{await browser.close();}
