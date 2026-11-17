import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';
import {seed} from '../shared/seed.ts';
import {execute} from '../shared/domain.ts';
import {api} from '../server/api.ts';
import {addDays,dateInBA,formatDate,weekStart} from '../shared/model.ts';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4361',today=dateInBA(),week=weekStart(today),workspace='panel-compact';
const emails={persona01:'coord@example.edu',persona05:'member@example.edu',persona06:'other@example.edu'};
let state=institutionalState(workspace,emails,emails.persona01),identity={id:'verified-persona05',email:emails.persona05,provider:'google',verified:true},failCalendar=false;
state.data.members.forEach(member=>member.authUserId='verified-'+member.id);state.data.projects=seed().data.projects.filter(project=>project.id==='p1');state.data.projects[0].areaIds=['universidad','sstedu'];
function run(kind,data={},id,entity='tasks',actor='persona05'){const result=execute(state,actor,{id:crypto.randomUUID(),kind,entity,entityId:id,expectedVersion:id?state.data[entity].find(row=>row.id===id)?.version:undefined,data});state=result.state;return result.result.id;}
const priority=run('create',{title:'Validar cifras de Universidad',ownerId:'persona05',projectId:'p1',panelPriority:true,priority:'Alta',dueDate:today,executionType:'du'}),other=run('create',{title:'Preparar brief de seguimiento',ownerId:'persona05',projectId:'p1',executionType:'area',executionAreaId:'sstedu'}),completed=run('create',{title:'Informe anterior entregado',ownerId:'persona05',projectId:'p1'});run('transition_task',{status:'Terminada',note:'Entregado'},completed);
const cancelled=run('create',{title:'Revisión cancelada',ownerId:'persona05',projectId:'p1'});run('transition_task',{status:'Cancelada',note:'Sin efecto'},cancelled);
run('create',{title:'Convocar al equipo',ownerId:'persona01',priority:'Alta'},undefined,'tasks','persona01');run('create',{title:'Consolidar información del área',ownerId:'persona06'},undefined,'tasks','persona06');
const archived=run('create',{title:'Registro archivado',ownerId:'persona05',projectId:'p1'});run('transition_task',{status:'Terminada',note:'Finalizado'},archived);run('archive',{},archived);run('upsert_commitment',{taskId:priority,weekId:week,result:'Confirmar los datos de dos áreas',isPriority:true});
const event=(id,title,days,time='10:00',extra={})=>({id,title,start:addDays(today,days)+'T'+time+':00-03:00',end:addDays(today,days)+'T'+time+':00-03:00',allDay:false,memberIds:['persona05'],location:'Lugar de prueba',url:'https://calendar.google.com/calendar/event?eid='+id,meetUrl:'',updated:new Date().toISOString(),...extra});
const future=(id,title,days,time='10:00',extra={})=>{const row=event(id,title,days,time,extra);if(!extra.end)row.end=new Date(Date.parse(row.start)+3600000).toISOString();return row;};
const followup=future('followup','Tablero SSTEDU de prueba',1,'14:30');
let events=[future('team','Encuentro de equipo de prueba',1,'09:00'),followup,{...followup},future('night','Tablero nocturno de prueba',2,'01:00',{start:addDays(today,2)+'T01:00:00Z',end:addDays(today,2)+'T02:00:00Z'}),future('later','Otra reunión de prueba',3),future('day','Actividad de todo el día',4,'10:00',{allDay:true,start:addDays(today,4),end:addDays(today,5)}),future('other','Agenda de otra persona',1,'11:00',{memberIds:['persona06']}),future('past','Evento ya finalizado',-1)];
const weekly={id:'weekly-fixture',version:1,title:'Reunión DU del período de prueba',date:addDays(today,2)+'T09:00',weekId:weekStart(addDays(today,2)),planningWeekId:addDays(weekStart(addDays(today,2)),7),status:'Borrador',attendees:['persona01','persona05'],durations:[5,15,15,10],teamPriorities:[]};state.data.meetings.push(weekly,{...weekly,id:'linked-minute',title:followup.title,date:followup.start,calendarEventKey:followup.id});
const store={load:async()=>structuredClone(state),create:async()=>{},save:async(_key,revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),page=await context.newPage(),passed=[],errors=[],commands=[];
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await mkdir('test-results',{recursive:true});
await context.route(origin+'/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(path.startsWith('/api/gestion/'))return route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});
 if(path.startsWith('/api/calendar/'))return route.fulfill(path.endsWith('/events')?(failCalendar?{status:503,json:{error:'Error de prueba'}}:{json:{events,connections:[]}}):{json:{configured:false,connected:false}});
 if(path==='/api/backups/status')return route.fulfill({json:{configured:false,connected:false}});
 if(path==='/api/command')commands.push(request.postDataJSON());
 const response=await api(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),store,workspace,{mode:'team',identity});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
});
const panel=()=>page.getByRole('region',{name:'Listado de tareas',exact:true}),row=title=>panel().locator('.panel-task-row,.panel-task-card').filter({has:page.getByRole('button',{name:title,exact:true})}),form=()=>page.locator('dialog.form-dialog'),detail=()=>page.locator('dialog.detail-sheet[open]'),agenda=()=>page.getByRole('region',{name:'Mi agenda',exact:true});
async function count(n){await page.waitForFunction(n=>!document.querySelector('.panel-tasks-loading')&&document.querySelectorAll('#tasks-list .panel-task-row,#tasks-list .panel-task-card').length===n,n);await panel().locator('.panel-filter-summary p[aria-busy="false"]').waitFor();}
async function choose(name,n){await panel().getByRole('button',{name,exact:true}).click();await count(n);}
async function closeDetail(){if(await detail().count())await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();}
async function more(){const filters=panel().locator('.panel-task-more-filters');if(!await filters.evaluate(element=>element.open))await filters.locator('summary').click();}
async function save(label='Guardar cambios'){await form().getByRole('button',{name:label,exact:true}).click();await form().waitFor({state:'hidden'});}
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function go(name){await closeDetail();if(await page.getByRole('button',{name:'Abrir navegación',exact:true}).isVisible())await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();await page.waitForLoadState('networkidle');}
try{
 await page.goto(origin+'/#Inicio');await page.getByRole('heading',{name:'Mi panel.',exact:true}).waitFor();await count(2);
 await check('Los controles compactos preceden una sola lista y el contador corresponde a la selección',async()=>{
  assert.equal(await panel().locator('.panel-task-surface>.task-list').count(),1);assert.deepEqual(await panel().locator('.panel-task-row .task-name').allTextContents(),['Validar cifras de Universidad','Preparar brief de seguimiento']);assert.equal(await panel().getByRole('separator',{name:'Otros pendientes',exact:true}).count(),1);
  assert.equal((await panel().locator('.panel-filter-summary p').textContent()).trim(),'2 pendientes');assert.ok(!(await panel().innerText()).includes('Mostrando'));assert.equal(await page.locator('.desk-context').count(),0);assert.equal(await panel().locator('.panel-task-controls').evaluate(element=>getComputedStyle(element).borderTopWidth),'0px');assert.ok(await panel().locator('.panel-task-controls').evaluate(element=>element.getBoundingClientRect().height<180));
  assert.ok(!(await panel().innerText()).includes('Sin vencimiento'));assert.ok(!(await panel().innerText()).includes('Por confirmar'));assert.equal(await row('Preparar brief de seguimiento').locator('.area-chip').count(),2);const colors=await row('Preparar brief de seguimiento').locator('.area-chip').evaluateAll(chips=>chips.map(chip=>getComputedStyle(chip).backgroundColor));assert.equal(new Set(colors).size,2);
  const task=row('Preparar brief de seguimiento');assert.ok(await task.evaluate(element=>element.querySelector('.task-name').getBoundingClientRect().top<element.querySelector('.panel-task-project').getBoundingClientRect().top));assert.equal(await task.getByRole('img',{name:'Persona 05',exact:true}).count(),1);
  await page.screenshot({path:'test-results/portfolio-panel-desktop.png',fullPage:true});
 });
 await check('Las tareas ajenas se consultan con prioridad visible y conservan sus permisos',async()=>{
  await choose('Todo el equipo',4);assert.equal((await panel().locator('.panel-filter-summary p').textContent()).trim(),'4 pendientes');const task=row('Convocar al equipo');assert.equal(await task.locator('.task-status-control,.task-finish-button,.task-plan-button,.task-priority-flag').count(),0);assert.equal(await task.getByRole('img',{name:'Tarea prioritaria',exact:true}).count(),1);
  await task.getByRole('button',{name:'Más acciones de Convocar al equipo',exact:true}).click();assert.equal(await task.getByRole('button',{name:'Editar tarea',exact:true}).count(),0);assert.equal(await task.getByRole('button',{name:'Eliminar tarea',exact:true}).count(),0);await page.keyboard.press('Escape');await choose('Mis tareas',2);
 });
 await check('Los estados, la búsqueda y los vacíos no crean tarjetas de prioridades sin contenido',async()=>{
  await choose('Finalizadas',1);assert.equal((await panel().locator('.panel-filter-summary p').textContent()).trim(),'1 finalizada');await choose('Todas',4);assert.ok((await panel().innerText()).includes('Revisión cancelada'));await choose('Pendientes',2);
  await panel().getByRole('textbox',{name:'Buscar tareas',exact:true}).fill('brief');await count(1);assert.equal(await panel().getByRole('separator').count(),0);assert.ok(!(await panel().innerText()).includes('No hay pendientes prioritarios'));await panel().getByRole('button',{name:'Limpiar filtros',exact:true}).click();await count(2);
 });
 await check('Filtros, búsqueda y exportación conservan su alcance y son accesibles por teclado',async()=>{
  await panel().getByRole('textbox',{name:'Buscar tareas',exact:true}).fill('UNIVERSIDAD');await count(1);await more();await panel().getByLabel('Vencimiento de tareas',{exact:true}).selectOption('soon');await count(1);
  await page.keyboard.press('Escape');assert.equal(await panel().locator('.panel-task-more-filters').evaluate(element=>element.open),false);
  const downloading=page.waitForEvent('download');await panel().getByRole('button',{name:'Exportar tareas',exact:true}).click();const download=await downloading,csv=await readFile(await download.path(),'utf8');assert.ok(csv.includes('Validar cifras de Universidad'));assert.ok(!csv.includes('Convocar al equipo'));await panel().getByRole('button',{name:'Limpiar filtros',exact:true}).click();await count(2);assert.equal(await panel().getByRole('textbox',{name:'Buscar tareas',exact:true}).inputValue(),'');
 });
 await check('Planificar y consultar avances funcionan con íconos en lista y tablero',async()=>{
  const title='Validar cifras de Universidad',plan=row(title).getByRole('button',{name:'Ver compromiso semanal: '+title,exact:true});assert.equal(await plan.innerText(),'');assert.equal(await plan.getAttribute('title'),'Ver compromiso semanal');await plan.click();await detail().getByRole('heading',{name:'Confirmar los datos de dos áreas',exact:true}).waitFor();await closeDetail();
  await row('Preparar brief de seguimiento').getByRole('button',{name:'Planificar avance semanal: Preparar brief de seguimiento',exact:true}).click();await form().getByLabel('Semana del compromiso (lunes)',{exact:true}).waitFor();await form().getByRole('button',{name:'Cancelar',exact:true}).click();
  await panel().getByRole('button',{name:'Tablero de tareas',exact:true}).click();await count(2);assert.equal(await panel().locator('.panel-task-card').count(),2);await panel().getByRole('button',{name:'Lista de tareas',exact:true}).click();await count(2);
 });
 await check('Crear, editar y eliminar siguen disponibles sin agregar botones de texto en las filas',async()=>{
  await page.locator('.page-heading').getByRole('button',{name:'Crear tarea',exact:true}).click();await form().getByLabel('Título de la tarea',{exact:true}).fill('Revisar minuta del encuentro');const project=form().getByRole('combobox',{name:'Proyecto o línea',exact:true});await project.fill('presupuestaria');await form().getByRole('option',{name:'Presentación presupuestaria',exact:true}).click();await save('Crear tarea');await closeDetail();await count(3);
  const task=row('Revisar minuta del encuentro');await task.getByRole('button',{name:'Más acciones de Revisar minuta del encuentro',exact:true}).click();await task.getByRole('button',{name:'Editar tarea',exact:true}).click();await form().getByLabel('Título de la tarea',{exact:true}).fill('Revisar minuta y acuerdos');await save();await row('Revisar minuta y acuerdos').waitFor();
  const edited=row('Revisar minuta y acuerdos');await edited.getByRole('button',{name:'Más acciones de Revisar minuta y acuerdos',exact:true}).click();await edited.getByRole('button',{name:'Eliminar tarea',exact:true}).click();await form().getByLabel('Motivo de la eliminación',{exact:true}).fill('Registro de prueba');await form().getByRole('checkbox').check();await save('Eliminar tarea');await count(2);
 });
 await check('Pedir ayuda queda en el menú y conserva el mismo circuito de seguimiento',async()=>{
  const task=row('Validar cifras de Universidad');await task.getByRole('button',{name:'Más acciones de Validar cifras de Universidad',exact:true}).click();await task.getByRole('button',{name:'Pedir ayuda',exact:true}).click();await form().getByLabel('¿Qué decisión o gestión necesitás?',{exact:true}).fill('Necesito confirmar el criterio de revisión');await save('Enviar pedido');assert.equal(state.data.issues.at(-1).taskId,priority);assert.equal(state.data.interventions.length,1);await closeDetail();await count(2);
  await task.getByRole('button',{name:'Más acciones de Validar cifras de Universidad',exact:true}).click();await task.getByRole('button',{name:'Ver ayuda',exact:true}).click();await detail().getByRole('heading',{name:'Validar cifras de Universidad',exact:true}).waitFor();await closeDetail();
 });
 await check('Finalizar desde el ícono pide confirmación y actualiza la lista y el contador',async()=>{
  const finish=()=>row('Preparar brief de seguimiento').getByRole('button',{name:'Marcar como finalizada: Preparar brief de seguimiento',exact:true});assert.equal(await finish().innerText(),'');await finish().click();await form().getByRole('heading',{name:'¿Estás seguro que querés marcar como finalizada esta tarea?',exact:true}).waitFor();await form().getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(state.data.tasks.find(task=>task.id===other).status,'Pendiente');
  await finish().click();await save('Sí, finalizar tarea');await count(1);assert.equal(await panel().getByRole('separator').count(),0);assert.equal((await panel().locator('.panel-filter-summary p').textContent()).trim(),'1 pendiente');await choose('Finalizadas',2);assert.equal(state.data.tasks.find(task=>task.id===other).status,'Terminada');await choose('Pendientes',1);
 });
 await check('Una lista sin prioritarias conserva sus tareas y evita secciones vacías',async()=>{
  const title='Validar cifras de Universidad';await row(title).getByRole('button',{name:'Quitar prioridad de '+title,exact:true}).click();await page.waitForFunction(()=>document.querySelector('.panel-task-row')?.dataset.priority==='false');assert.equal(await panel().getByRole('separator').count(),0);assert.ok(!(await panel().innerText()).includes('No hay pendientes prioritarios'));
  await row(title).getByRole('button',{name:'Marcar como prioritaria: '+title,exact:true}).click();await page.waitForFunction(()=>document.querySelector('.panel-task-row')?.dataset.priority==='true');
 });
 await check('Filtros avanzados conservan archivadas y cambios en grupo',async()=>{
  await more();await panel().getByLabel('Estado de tareas',{exact:true}).selectOption('');await panel().getByLabel('Incluir tareas archivadas',{exact:true}).check();await count(5);assert.ok((await panel().innerText()).includes('Registro archivado'));await panel().getByRole('button',{name:'Cambios en grupo',exact:true}).click();await form().getByRole('heading',{name:'Cambios en grupo',exact:true}).waitFor();await form().getByRole('button',{name:'Cancelar',exact:true}).click();await panel().getByRole('button',{name:'Limpiar filtros',exact:true}).click();await count(1);
 });
 await check('Una sola agenda reúne eventos propios, deduplica seguimientos y respeta Buenos Aires',async()=>{
  await agenda().getByRole('button',{name:/Tablero SSTEDU de prueba/}).waitFor();assert.equal(await agenda().locator('.desk-agenda-item').count(),5);await agenda().getByRole('button',{name:'Ver toda la agenda (6)',exact:true}).click();assert.equal(await agenda().locator('.desk-agenda-item').count(),6);const ids=await agenda().locator('[data-agenda-id]').evaluateAll(elements=>elements.map(element=>element.dataset.agendaId));assert.equal(new Set(ids).size,6);assert.equal(ids.filter(id=>id==='calendar:followup').length,1);assert.equal(await page.getByRole('region',{name:'Próximos seguimientos',exact:true}).count(),0);
  assert.ok(!(await agenda().innerText()).includes('Agenda de otra persona'));assert.ok(!(await agenda().innerText()).includes('Evento ya finalizado'));const night=agenda().getByRole('button',{name:/Tablero nocturno de prueba/});assert.ok((await night.getAttribute('aria-label')).includes(formatDate(addDays(today,1))));assert.ok((await night.innerText()).includes('22:00'));await agenda().getByRole('button',{name:'Ver menos',exact:true}).click();
 });
 await check('Los accesos de la agenda abren Calendar o la reunión DU correspondiente',async()=>{
  await agenda().getByRole('button',{name:/Tablero SSTEDU de prueba/}).click();await page.getByRole('region',{name:'Calendario del equipo',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Reuniones y minutas',exact:true}).getAttribute('aria-selected'),'true');await go('Mi panel');await count(1);
  await agenda().getByRole('button',{name:/Reunión DU del período de prueba/}).click();await page.getByRole('heading',{name:'Reunión semanal.',exact:true}).waitFor();await go('Mi panel');await count(1);
 });
 await check('El panel se adapta a tableta y móvil y conserva confirmación, filtros y navegación',async()=>{
  for(const width of [768,360]){
   await page.setViewportSize({width,height:1000});await count(1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await more();const bounds=await panel().locator('.panel-task-filter-popover').boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);await page.keyboard.press('Escape');assert.equal(await panel().locator('.panel-task-more-filters').evaluate(element=>element.open),false);await page.screenshot({path:'test-results/portfolio-panel-'+width+'.png',fullPage:true});
  }
  await row('Validar cifras de Universidad').getByRole('button',{name:'Marcar como finalizada: Validar cifras de Universidad',exact:true}).click();await form().getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(state.data.tasks.find(task=>task.id===priority).status,'Pendiente');await page.setViewportSize({width:1440,height:1050});
 });
 await check('Cada persona conserva su agenda y los errores de Calendar se distinguen de una agenda vacía',async()=>{
  identity={id:'verified-persona06',email:emails.persona06,provider:'google',verified:true};await page.reload();await count(1);await agenda().getByRole('button',{name:/Agenda de otra persona/}).waitFor();assert.equal(await agenda().locator('.desk-agenda-item').count(),1);assert.ok(!(await agenda().innerText()).includes('Tablero SSTEDU de prueba'));
  identity={id:'verified-persona05',email:emails.persona05,provider:'google',verified:true};events=[];state.data.meetings=[];await page.reload();await agenda().getByText('No hay reuniones próximas compartidas.',{exact:true}).waitFor();
  failCalendar=true;await page.reload();await agenda().getByText('No pudimos actualizar la agenda. Podés reintentar desde Mi semana.',{exact:true}).waitFor();
 });
 assert.deepEqual(errors,[]);await writeFile('test-results/panel-tasks-browser.json',JSON.stringify({passed,errors},null,2));console.log('PASS '+passed.length+' recorridos de Mi panel');
}catch(error){await page.screenshot({path:'test-results/portfolio-panel-failure.png',fullPage:true});console.log((await page.locator('main').innerText()).slice(0,5000));throw error;}finally{await browser.close();}
