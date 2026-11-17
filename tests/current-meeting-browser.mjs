import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';
import {api} from '../server/api.ts';
import {execute} from '../shared/domain.ts';
import {addDays,dateInBA,rangeLabel,weekStart} from '../shared/model.ts';

const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4361',now=new Date(),today=dateInBA(now),current=weekStart(today),next=addDays(current,7),old=addDays(current,-28),workspace='current-meeting-browser';
const emails={persona01:'coord@example.edu',persona05:'member@example.edu'};
let state=institutionalState(workspace,emails,emails.persona01,now),actor='persona01',displayToday=today;
for(const id of Object.keys(emails))state.data.members.find(member=>member.id===id).authUserId='verified-'+id;
state.data.tasks.push({id:'own-task',version:1,title:'Preparar entrega de prueba',code:'T101',ownerId:'persona01',status:'Pendiente'});
state.data.meetings=[{id:'m1',version:1,title:'Reunión histórica de prueba',date:addDays(old,1)+'T10:00',weekId:old,planningWeekId:addDays(old,7),status:'Borrador',attendees:['persona01','persona05'],durations:[5,15,15,10],teamPriorities:[]}];
state.data.tasks.push(
 {id:'done-no-plan',version:1,title:'Entrega completada sin planificación',code:'T102',ownerId:'persona01',status:'Terminada',completedAt:current+'T15:00:00Z',panelPriority:false},
 {id:'other-done',version:1,title:'Entrega de otra persona',code:'T103',ownerId:'persona05',status:'En curso',panelPriority:false},
 {id:'own-next',version:1,title:'Entrega propia de la próxima semana',code:'T104',ownerId:'persona01',status:'Pendiente'},
 {id:'other-next',version:1,title:'Entrega de otra persona para la próxima semana',code:'T105',ownerId:'persona05',status:'Pendiente'},
 {id:'sunday-task',version:1,title:'Entrega del domingo anterior',ownerId:'persona01',status:'Terminada',completedAt:current+'T02:59:59Z',panelPriority:false}
);
state.data.plans.push({id:'own-next-plan',version:1,weekId:next,ownerId:'persona01',taskSelections:{'own-next':true}},{id:'other-next-plan',version:1,weekId:next,ownerId:'persona05',taskSelections:{'other-next':true}});
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
const selector=()=>page.getByRole('group',{name:'Seleccionar semana',exact:true}),person=()=>page.getByRole('combobox',{name:'Persona del equipo',exact:true}),review=()=>page.getByRole('region',{name:'Semana revisada',exact:true}),planning=()=>page.getByRole('region',{name:'Tareas de la próxima semana',exact:true}),form=()=>page.locator('dialog.form-dialog');
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function periods(review,planning){await page.waitForFunction(([a,b])=>{const texts=[...document.querySelectorAll('.meeting-workspace .meeting-column-heading p')].map(node=>node.textContent);return texts[0]===a&&texts[1]===b;},[rangeLabel(review),rangeLabel(planning)]);}
async function refresh(){const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/state');await page.getByRole('button',{name:'Actualizar datos del equipo',exact:true}).click();await response;}
async function operations(){if(!await page.locator('.meeting-operational').evaluate(element=>element.open))await page.locator('.meeting-operational>summary').click();}
async function save(label='Guardar cambios'){await form().getByRole('button',{name:label,exact:true}).click();await form().waitFor({state:'hidden'});}
try{
 await page.goto(origin+'/#Reuni%C3%B3n%20semanal');await selector().waitFor();
 await check('Una reunión antigua no controla la vista inicial y consultar no crea otra reunión',async()=>{
  await periods(current,next);assert.equal(await selector().locator('strong').textContent(),rangeLabel(weekStart(displayToday)));assert.equal(commands.length,0);assert.equal(state.data.meetings.length,1);assert.deepEqual(state.data.meetings[0],historical);
  await page.getByRole('heading',{name:'Esta semana',exact:true}).waitFor();await page.getByRole('heading',{name:'Próxima semana',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Agregar prioridad del equipo',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Iniciar reunión',exact:true}).count(),0);
  await page.screenshot({path:'test-results/portfolio-current-meeting-preview.png',fullPage:true});
 });
 await check('La planificación personal apunta a la próxima semana aun sin una reunión creada',async()=>{
  await page.getByRole('button',{name:'Planificar mi prioridad',exact:true}).click();assert.equal(await form().getByLabel('Semana del compromiso (lunes)',{exact:true}).inputValue(),next);await form().getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(commands.length,0);
 });
 await check('Las completadas sin compromiso aparecen una sola vez y respetan el lunes de Buenos Aires',async()=>{
  await review().getByRole('button',{name:'Entrega completada sin planificación',exact:true}).waitFor();assert.equal(await review().getByRole('button',{name:'Entrega completada sin planificación',exact:true}).count(),1);
  assert.equal(await review().getByText('Terminada',{exact:true}).count(),1);assert.equal(await review().getByText('Entrega del domingo anterior',{exact:true}).count(),0);assert.equal(state.data.commitments.length,0);assert.equal(commands.length,0);
  await planning().getByRole('button',{name:'Entrega propia de la próxima semana',exact:true}).waitFor();assert.equal(await planning().getByText('Entrega de otra persona para la próxima semana',{exact:true}).count(),0);
 });
 await check('El selector global cambia ambas semanas, mantiene las prioridades del equipo y no modifica datos',async()=>{
  const before=JSON.stringify(state),count=commands.length;await person().selectOption('persona05');assert.equal(await review().getByText('Entrega completada sin planificación',{exact:true}).count(),0);
  await planning().getByRole('button',{name:'Entrega de otra persona para la próxima semana',exact:true}).waitFor();assert.equal(await planning().getByText('Entrega propia de la próxima semana',{exact:true}).count(),0);
  await page.getByRole('region',{name:'Prioridades del equipo',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'Revisar compromisos de',exact:true}).count(),0);
  const task=state.data.tasks.find(task=>task.id==='other-done');state=execute(state,'persona05',{id:crypto.randomUUID(),kind:'transition_task',entityId:task.id,expectedVersion:task.version,data:{status:'Terminada',note:'Entrega terminada por la responsable'}},now).state;
  await refresh();await review().getByRole('button',{name:'Entrega de otra persona',exact:true}).waitFor();assert.equal(await person().inputValue(),'persona05');assert.equal(state.data.commitments.length,0);
  const completed=JSON.stringify(state);await person().selectOption('all');await review().getByRole('button',{name:'Entrega completada sin planificación',exact:true}).waitFor();await review().getByRole('button',{name:'Entrega de otra persona',exact:true}).waitFor();
  await planning().getByRole('button',{name:'Entrega propia de la próxima semana',exact:true}).waitFor();await planning().getByRole('button',{name:'Entrega de otra persona para la próxima semana',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Planificar tarea',exact:true}).count(),0);assert.equal(JSON.stringify(state),completed);assert.equal(commands.length,count);assert.notEqual(before,completed);await person().selectOption('persona01');
 });
 await check('Los accesos a Mi semana conservan la persona y el período elegidos',async()=>{
  await page.getByRole('button',{name:'Ver esta semana',exact:true}).click();const done=page.locator('.weekly-selected').getByRole('article',{name:'Entrega completada sin planificación',exact:true});await done.waitFor();await done.getByText('Terminada',{exact:true}).waitFor();assert.equal(await done.getByRole('button',{name:/Detallar avance semanal|Quitar de esta semana/}).count(),0);
  await page.locator('.sidebar').getByRole('button',{name:'Reunión semanal',exact:true}).click();await person().selectOption('persona05');await page.getByRole('button',{name:'Ver próxima semana',exact:true}).click();await page.getByRole('combobox',{name:'Dueño del plan semanal',exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'Dueño del plan semanal',exact:true}).inputValue(),'persona05');assert.equal(await selector().locator('strong').textContent(),rangeLabel(next));
  await page.locator('.sidebar').getByRole('button',{name:'Reunión semanal',exact:true}).click();await periods(current,next);assert.equal(await person().inputValue(),'persona01');
 });
 await check('La selección histórica se conserva al actualizar y el acceso lateral vuelve a esta semana',async()=>{
  for(let index=0;index<4;index++)await selector().getByRole('button',{name:'Semana anterior',exact:true}).click();await periods(old,addDays(old,7));await refresh();await periods(old,addDays(old,7));assert.equal(await selector().locator('strong').textContent(),rangeLabel(old));
  await page.locator('.sidebar').getByRole('button',{name:'Reunión semanal',exact:true}).click();await periods(current,next);assert.equal(await selector().locator('strong').textContent(),rangeLabel(weekStart(displayToday)));assert.deepEqual(state.data.meetings[0],historical);
 });
 let currentId;
 await check('Crear una reunión propone los períodos vigentes y conserva la reunión antigua',async()=>{
  await page.getByRole('button',{name:'Nueva reunión',exact:true}).click();assert.equal(await form().getByLabel('Lunes del período revisado',{exact:true}).inputValue(),current);assert.equal(await form().getByLabel('Lunes de la próxima planificación',{exact:true}).inputValue(),next);
  await save('Crear reunión');currentId=state.data.meetings.find(meeting=>meeting.id!=='m1').id;await periods(current,next);assert.deepEqual(state.data.meetings.find(meeting=>meeting.id==='m1'),historical);
 });
 await page.reload();await selector().waitFor();
 await check('La vista automática usa la reunión actual para guardar prioridades, agenda y acuerdos',async()=>{
  await periods(current,next);assert.equal(await selector().locator('strong').textContent(),rangeLabel(weekStart(displayToday)));
  await page.getByRole('button',{name:'Agregar prioridad del equipo',exact:true}).click();await form().getByLabel('¿Qué necesita impulsar el equipo?',{exact:true}).fill('Validar la entrega de prueba');await save('Guardar prioridad');await page.getByText('Validar la entrega de prueba',{exact:true}).waitFor();
  assert.equal(commands.at(-1).kind,'meeting_priority');assert.equal(commands.at(-1).entityId,currentId);
  await operations();await page.getByRole('button',{name:'Proponer tema',exact:true}).click();await form().getByLabel('Asunto',{exact:true}).fill('Revisar entrega de prueba');await form().getByLabel('Motivo del cambio',{exact:true}).fill('Necesitamos acordar la entrega');await save();assert.equal(commands.at(-1).data.meetingId,currentId);assert.ok(state.data.agenda.some(item=>item.meetingId===currentId&&item.title==='Revisar entrega de prueba'));
  await operations();await page.locator('.decisions-panel .section-heading').getByRole('button',{name:'Registrar decisión',exact:true}).click();await form().getByLabel('Acuerdo concreto',{exact:true}).fill('Acordamos revisar la entrega');await save();assert.equal(commands.at(-1).data.meetingId,currentId);assert.ok(state.data.decisions.some(item=>item.meetingId===currentId&&item.text==='Acordamos revisar la entrega'));
  await page.screenshot({path:'test-results/portfolio-current-meeting-open.png',fullPage:true});
 });
 await check('Coordinación planifica para la persona elegida y la tarea conserva una sola fila',async()=>{
  await person().selectOption('persona05');await page.getByRole('button',{name:'Planificar tarea',exact:true}).click();assert.equal(await form().getByLabel('Semana del compromiso (lunes)',{exact:true}).inputValue(),next);
  assert.deepEqual(await form().getByLabel('Tarea a la que pertenece',{exact:true}).locator('option').evaluateAll(options=>options.filter(option=>option.value).map(option=>option.value)),['other-next']);
  await form().getByLabel('¿Qué vas a lograr esta semana?',{exact:true}).fill('Confirmar entrega de prueba');await form().getByLabel('Motivo del cambio',{exact:true}).fill('Planificación acordada con la responsable');await save('Crear compromiso semanal');
  assert.equal(state.data.commitments.at(-1).ownerId,'persona05');assert.equal(state.data.commitments.at(-1).weekId,next);assert.equal(await planning().getByRole('button',{name:'Entrega de otra persona para la próxima semana',exact:true}).count(),1);
  await page.getByText('Validar la entrega de prueba',{exact:true}).waitFor();await person().selectOption('persona01');
 });
 await check('El selector compartido avanza períodos sin crear reuniones y vuelve a la semana actual',async()=>{
  const before=JSON.stringify(state.data.meetings),count=commands.length;await selector().getByRole('button',{name:'Semana siguiente',exact:true}).click();await periods(next,addDays(next,7));assert.equal(await review().getByText('Entrega completada sin planificación',{exact:true}).count(),0);
  await page.locator('.meeting-week-toolbar').getByRole('button',{name:'Esta semana',exact:true}).click();await periods(current,next);assert.equal(JSON.stringify(state.data.meetings),before);assert.equal(commands.length,count);
 });
 await check('Dos reuniones del mismo período siguen accesibles sin cambiar de semana ni generar escrituras',async()=>{
  const original=state.data.meetings.find(meeting=>meeting.id===currentId),alternate={...structuredClone(original),id:'alternate-current',title:'Otra reunión del período',teamPriorities:[]};state.data.meetings.push(alternate);state.revision++;await refresh();
  const picker=page.getByRole('combobox',{name:'Reunión del período',exact:true});await picker.waitFor();const before=JSON.stringify(state),count=commands.length;
  await picker.selectOption('alternate-current');await periods(current,next);assert.equal(await page.getByText('Validar la entrega de prueba',{exact:true}).count(),0);
  await picker.selectOption(currentId);await page.getByText('Validar la entrega de prueba',{exact:true}).waitFor();assert.equal(commands.length,count);assert.equal(JSON.stringify(state),before);
  state.data.meetings=state.data.meetings.filter(meeting=>meeting.id!=='alternate-current');state.revision++;await refresh();assert.equal(await picker.count(),0);await page.locator('.meeting-week-toolbar').getByRole('button',{name:'Esta semana',exact:true}).click();
 });
 await check('El lunes la vista automática avanza sin modificar la reunión de la semana anterior',async()=>{
  const before=JSON.stringify(state.data.meetings),count=commands.length;displayToday=next;await refresh();await periods(next,addDays(next,7));assert.equal(await selector().locator('strong').textContent(),rangeLabel(weekStart(displayToday)));assert.equal(commands.length,count);assert.equal(JSON.stringify(state.data.meetings),before);
 });
 await check('Un integrante ve los períodos actuales y el diseño móvil no desborda',async()=>{
  actor='persona05';await page.reload();await selector().waitFor();await periods(next,addDays(next,7));assert.equal(await page.getByRole('button',{name:'Nueva reunión',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Agregar prioridad del equipo',exact:true}).count(),0);
  await person().selectOption('persona01');assert.equal(await page.getByRole('button',{name:'Planificar tarea',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Registrar resultado',exact:true}).count(),0);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'test-results/portfolio-current-meeting-mobile.png',fullPage:true});
 });
 assert.deepEqual(state.data.meetings.find(meeting=>meeting.id==='m1'),historical);assert.equal(JSON.stringify(state.snapshots),snapshots);assert.deepEqual(errors,[]);
 await writeFile('test-results/current-meeting-browser.json',JSON.stringify({passed,errors},null,2));console.log('PASS '+passed.length+' recorridos de reunión semanal');
}catch(error){console.error('Formulario de prueba:',await page.locator('dialog[open]').allInnerTexts());await page.screenshot({path:'test-results/portfolio-current-meeting-failure.png',fullPage:true});throw error;}finally{await browser.close();}
