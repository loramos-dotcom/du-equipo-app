import {dateInBA,addDays,weekStart} from '../shared/model.ts';
import assert from'node:assert/strict';import{createRequire}from'node:module';import{mkdir,writeFile,readFile}from'node:fs/promises';import{randomBytes}from'node:crypto';import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';import{api}from'../server/api.ts';import{calendarRequest,normalizeCalendarEvent,sealCalendar}from'../server/calendar.ts';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4322',email='persona05@bue.edu.ar',env={APP_ORIGIN:origin,DU_WORKSPACE_ID:'calendar-browser',GOOGLE_CALENDAR_CLIENT_ID:'fixture-calendar',GOOGLE_CALENDAR_CLIENT_SECRET:'fixture-only',DU_CALENDAR_SEAL_KEY:randomBytes(32).toString('base64')};
const roster=JSON.parse(await(await import('node:fs/promises')).readFile('config/team-authorized.json','utf8'));let state=institutionalState('calendar-browser',roster.emails,roster.operator,new Date('2026-10-21T15:00:00Z'),roster.initialCoordinator),identity={id:'user-persona05',email,provider:'google',verified:true};const connections=new Map(),store={load:async()=>structuredClone(state),loadAccess:async()=>structuredClone(state),create:async()=>{},save:async(_k,revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;},readCalendar:async(_w,id)=>structuredClone(connections.get(id)??null),listCalendars:async()=>structuredClone([...connections.values()]),saveCalendar:async(_w,value,expected)=>{if((connections.get(value.memberId)?.revision??null)!==expected)return false;connections.set(value.memberId,structuredClone(value));return true;},deleteCalendar:async(_w,id,revision)=>connections.get(id)?.revision===revision&&connections.delete(id)};
const raw=(patch={})=>({id:'shared-event',iCalUID:'shared-fixture',summary:'Seguimiento de proyectos',start:{dateTime:addDays(dateInBA(),2)+'T10:00:00-03:00'},end:{dateTime:addDays(dateInBA(),2)+'T11:00:00-03:00'},organizer:{email},attendees:[{email},{email:'persona06@bue.edu.ar'}],updated:'2026-10-21T12:00:00Z',htmlLink:'https://calendar.google.com/calendar/event?eid=fixture',hangoutLink:'https://meet.google.com/aaa-bbbb-ccc',...patch});
let failSave=false;const transport=async(url)=>String(url).includes('/token')?Response.json({access_token:'fixture'}):String(url).includes('calendarList')?Response.json({items:[{id:'primary',summary:'Reuniones DU',primary:true},{id:'second',summary:'Seguimiento compartido'}]}):String(url).includes('/revoke')?Response.json({}):Response.json({items:[raw(),raw({id:'private',iCalUID:'private',summary:'Evento privado que nunca se comparte',visibility:'private'}),raw({id:'past',iCalUID:'past',summary:'Reunión anterior del área',start:{dateTime:addDays(dateInBA(),-2)+'T10:00:00-03:00'},end:{dateTime:addDays(dateInBA(),-2)+'T11:00:00-03:00'}})]});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],passed=[];const pending=new Set();page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await mkdir('test-results',{recursive:true});
await context.route(origin+'/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname==='/api/gestion/overview'){await route.fulfill({json:{connected:true,issues:[],steps:[],updates:[],priorities:[]}});return;}let response;try{const request=new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})});if(url.pathname.startsWith('/api/calendar/')){if(failSave&&url.pathname==='/api/calendar/minutes')throw Error('Error de prueba: conservá tu texto y reintentá.');response=await calendarRequest(request,identity,state.data.members.find(m=>m.email===identity.email),store,env,transport);}else response=await api(request,store,'calendar-browser',{mode:'team',identity});}catch(error){response=Response.json({error:error.message},{status:error.status??503});}await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
const calendar=()=>page.getByRole('region',{name:'Calendario del equipo',exact:true}),dialog=()=>page.getByRole('dialog',{name:'Minuta de reunión',exact:true});async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
try{
 await page.goto(origin+'/#Mi%20semana');await page.waitForLoadState('networkidle');await page.locator('.sidebar').getByRole('button',{name:'Mi semana',exact:true}).click();await page.getByRole('tab',{name:'Reuniones y minutas',exact:true}).click();await page.waitForLoadState('networkidle');await calendar().getByRole('combobox',{name:'Período de reuniones'}).selectOption('upcoming');
 await check('Calendar está en Mi semana y cada integrante tiene su propia conexión',async()=>{await calendar().getByRole('link',{name:'Conectar mi Google Calendar',exact:true}).waitFor();assert.equal(await calendar().getByRole('link',{name:'Conectar mi Google Calendar',exact:true}).getAttribute('href'),'/auth/calendar/login');assert.equal(await page.locator('.sidebar').getByRole('button',{name:'La DU',exact:true}).count(),1);});
 connections.set('persona05',{memberId:'persona05',email,sealed:sealCalendar({email,refreshToken:'private-fixture'},env.DU_CALENDAR_SEAL_KEY),selected:[],events:[],syncedAt:null,syncError:null,revision:crypto.randomUUID()});await page.goto(origin+'/?calendar=connected#Mi%20semana');await calendar().getByRole('button',{name:'Elegir calendarios',exact:true}).waitFor();await calendar().getByRole('combobox',{name:'Período de reuniones'}).selectOption('upcoming');
 await check('Conectar no comparte nada hasta que se eligen calendarios explícitamente',async()=>{assert.equal(await calendar().getByRole('heading',{name:'Seguimiento de proyectos',exact:true}).count(),0);await calendar().getByRole('button',{name:'Elegir calendarios',exact:true}).click();await calendar().getByRole('checkbox',{name:'Reuniones DU · Principal',exact:true}).check();await calendar().getByRole('checkbox',{name:'Seguimiento compartido',exact:true}).check();await calendar().getByRole('button',{name:'Guardar calendarios compartidos',exact:true}).click();await calendar().getByRole('heading',{name:'Seguimiento de proyectos',exact:true}).waitFor();assert.equal(await calendar().locator('.calendar-account').count(),0);const settings=calendar().getByRole('button',{name:'Configurar Google Calendar',exact:true});await settings.click();await calendar().getByRole('button',{name:'Elegir calendarios',exact:true}).waitFor();await settings.click();assert.equal(await calendar().locator('.calendar-account').count(),0);});
 await check('Reuniones repetidas se unifican y privadas nunca aparecen; se consultan las anteriores',async()=>{assert.equal(await calendar().getByRole('heading',{name:'Seguimiento de proyectos',exact:true}).count(),1);assert.equal(await calendar().getByText('Evento privado que nunca se comparte',{exact:true}).count(),0);await calendar().getByRole('combobox',{name:'Período de reuniones',exact:true}).selectOption('past');await calendar().getByRole('heading',{name:'Reunión anterior del área',exact:true}).waitFor();await calendar().getByRole('combobox',{name:'Período de reuniones',exact:true}).selectOption('upcoming');});
 await calendar().getByRole('button',{name:'Crear minuta',exact:true}).click();const text='Se acordó revisar el proyecto.\nResponsable: Persona 06.\nPróxima reunión: viernes.';await dialog().getByRole('textbox',{name:'Texto de minuta de Calendar',exact:true}).fill(text);
 await check('Un error conserva el borrador para reintentar',async()=>{failSave=true;await dialog().getByRole('button',{name:'Guardar borrador',exact:true}).click();await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByRole('textbox',{name:'Texto de minuta de Calendar',exact:true}).inputValue(),text);failSave=false;await dialog().getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.calendar-event .badge')?.textContent==='Minuta en borrador');assert.equal(state.data.meetings.length,1);assert.equal(state.data.meetings[0].minutes,text);});
 await check('Participantes cierran la minuta, conservan una versión inmutable y descargan la firma GCBA',async()=>{await dialog().getByRole('button',{name:'Cerrar y guardar minuta',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.calendar-event .badge')?.textContent==='Minuta cerrada');assert.equal(state.snapshots.at(-1).payload.meeting.minutes,text);assert.equal(await dialog().getByRole('textbox',{name:'Texto de minuta de Calendar',exact:true}).getAttribute('readonly'),'');const downloading=page.waitForEvent('download');await dialog().getByRole('button',{name:'Descargar minuta',exact:true}).click();const downloaded=await downloading,html=await readFile(await downloaded.path(),'utf8');assert.ok(html.includes('Ministerio de<br>Educación'));assert.ok(html.includes('Acuerdos')||html.includes('Se acordó revisar el proyecto.'));assert.ok(downloaded.suggestedFilename().endsWith('.html'));await dialog().getByRole('button',{name:'Cerrar minuta',exact:true}).click();});
 await check('El resto del equipo puede leer la minuta sin editarla',async()=>{identity={id:'user-persona04',email:'persona04@bue.edu.ar',provider:'google',verified:true};await page.reload();await calendar().getByRole('link',{name:'Conectar mi Google Calendar',exact:true}).waitFor();assert.equal(await calendar().getByRole('combobox',{name:'Reuniones de integrante'}).inputValue(),'persona04');assert.equal(await calendar().locator('.calendar-account').getByText(email,{exact:true}).count(),0);await calendar().getByRole('combobox',{name:'Reuniones de integrante'}).selectOption('');await calendar().getByRole('combobox',{name:'Período de reuniones'}).selectOption('upcoming');await calendar().getByRole('button',{name:'Ver minuta',exact:true}).click();assert.equal(await dialog().getByRole('textbox',{name:'Texto de minuta de Calendar',exact:true}).inputValue(),text);assert.equal(await dialog().getByRole('button',{name:'Reabrir con motivo',exact:true}).count(),0);await dialog().getByRole('button',{name:'Cerrar minuta',exact:true}).click();});
 identity={id:'user-persona05',email,provider:'google',verified:true};await page.reload();await calendar().getByRole('combobox',{name:'Período de reuniones'}).selectOption('upcoming');await calendar().getByRole('button',{name:'Ver minuta',exact:true}).waitFor();await page.screenshot({path:'test-results/calendario-mi-semana-escritorio.png',fullPage:true});
 await check('Desconectar retira los eventos compartidos y conserva las minutas',async()=>{await calendar().getByRole('button',{name:'Configurar Google Calendar',exact:true}).click();await calendar().getByRole('button',{name:'Desconectar',exact:true}).click();await page.getByRole('dialog',{name:'Desconectar Google Calendar',exact:true}).getByRole('button',{name:'Desconectar mi calendario',exact:true}).click();await calendar().getByRole('link',{name:'Conectar mi Google Calendar',exact:true}).waitFor();assert.equal(connections.size,0);assert.equal(await calendar().getByRole('button',{name:'Ver minuta',exact:true}).count(),1);assert.equal(state.data.meetings[0].minutes,text);});
 await check('Compromisos y reuniones conviven en Mi semana sin alterar la vista de Equipo',async()=>{await page.getByRole('tab',{name:'Tareas',exact:true}).click();assert.equal(await calendar().count(),0);await page.getByRole('tab',{name:'Reuniones y minutas',exact:true}).click();await calendar().getByRole('heading',{name:'Tus reuniones',exact:true}).waitFor();});
 await check('Los tableros vigentes aparecen una sola vez y el referente los ve aunque no esté invitado',async()=>{
  const owner=state.data.members.find(member=>member.id==='persona05');
  const responsible=state.data.members.find(member=>member.id==='persona06');
  state.data.areas=[{id:'sstedu',version:1,name:'Área de prueba',active:true,leadId:responsible.id}];
  state.data.projects=[{id:'fixture-recurring-project',version:1,title:'Tareas recurrentes',createdBy:owner.id,leadId:owner.id,status:'Activo',members:[owner.id]}];
  const thisWeek=weekStart(dateInBA());
  const title='🔸 Tablero SSTEDU - Seg. Quincenal';
  const event=(day,id)=>normalizeCalendarEvent(raw({id,iCalUID:id,summary:title,start:{dateTime:day+'T10:00:00-03:00'},end:{dateTime:day+'T11:00:00-03:00'},attendees:[{email}]}),state.data.members);
  connections.set(owner.id,{memberId:owner.id,email,sealed:sealCalendar({email,refreshToken:'private-fixture'},env.DU_CALENDAR_SEAL_KEY),selected:[{id:'primary',name:'Principal',primary:true}],events:[event(thisWeek,'this-week-board'),event(addDays(thisWeek,7),'next-week-board')],syncedAt:new Date().toISOString(),syncError:null,revision:crypto.randomUUID()});
  await page.reload();
  const person=calendar().getByRole('combobox',{name:'Reuniones de integrante'});
  await person.selectOption(responsible.id);
  const boards=calendar().getByRole('region',{name:'Tableros de la semana'});
  await boards.getByRole('heading',{name:title,exact:true}).waitFor();
  assert.equal(await boards.getByRole('article').count(),1);
  assert.equal(await boards.getByText(responsible.name,{exact:true}).count(),1);
  await person.selectOption('');
  assert.equal(await boards.getByRole('heading',{name:title,exact:true}).count(),1);
  assert.equal(await calendar().getByRole('heading',{name:title,exact:true}).count(),2);
 });
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-results/calendario-mi-semana-movil.png',fullPage:true});
 await check('La DU muestra el tablero del referente arriba de su agenda y refleja una reprogramación',async()=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/#Equipo');
  await page.getByRole('heading',{name:'La DU',exact:true}).waitFor();
  const owner=state.data.members.find(member=>member.id==='persona05');
  const responsible=state.data.members.find(member=>member.id==='persona06');
  const card=name=>page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});
  const responsibleCard=card(responsible.name);
  const section=responsibleCard.getByRole('region',{name:'Tableros',exact:true});
  await section.getByText('Área de prueba',{exact:true}).waitFor();
  const ownerCard=card(owner.name);
  assert.equal(await ownerCard.getByRole('region',{name:'Tableros',exact:true}).count(),0);
  assert.equal(await ownerCard.locator('.people-areas').count(),0);
  assert.equal(await responsibleCard.locator('.people-identity .people-areas').count(),1);
  assert.equal(await responsibleCard.locator('.people-card-body + .people-card-footer .people-presence').count(),1);
  await ownerCard.locator('.people-presence-details summary').click();
  assert.ok(await ownerCard.getByText(/Última actualización/).isVisible());
  await ownerCard.locator('.people-presence-details summary').click();
  assert.equal(await ownerCard.getByText(/Última actualización/).isVisible(),false);
  assert.equal(await section.getByRole('listitem').count(),1);
  assert.match(await section.locator('time').innerText(),/10:00$/);
  const connection=connections.get(owner.id);
  const [first,...rest]=connection.events;
  const newDay=addDays(weekStart(dateInBA()),1);
  connections.set(owner.id,{...connection,events:[{...first,start:newDay+'T16:00:00Z',end:newDay+'T17:00:00Z'},...rest],revision:crypto.randomUUID()});
  await page.reload();
  await section.locator('time[datetime="'+newDay+'T16:00:00Z"]').waitFor();
  assert.match(await section.locator('time').innerText(),/\d{2}\/\d{2} · 13:00$/);
  assert.equal(await section.getByRole('listitem').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 await check('La DU muestra todos los tableros a quienes participan de todos y los propios al resto',async()=>{
  const known=state.data.members.find(member=>member.id==='persona05');
  const regular=state.data.members.find(member=>member.id==='persona06');
  const other=state.data.members.find(member=>member.id==='persona07');
  const connection=connections.get(known.id);
  const day=addDays(weekStart(dateInBA()),2);
  const event=normalizeCalendarEvent(raw({
   id:'another-weekly-board',iCalUID:'another-weekly-board',summary:'Tablero Agencia - Seg. quincenal',
   start:{dateTime:day+'T11:00:00-03:00'},end:{dateTime:day+'T12:00:00-03:00'},attendees:[{email}]
  }),state.data.members);
  state.settings.boardParticipantIds=[known.id,other.id];
  state.data.areas.push({id:'agencia',version:1,name:'Otra área de prueba',active:true,leadId:other.id});
  const week=weekStart(dateInBA());
  state.data.tasks.push({id:'review-fixture',version:1,title:'Revisar el informe semanal',status:'Pendiente',priority:'Media',ownerId:regular.id,projectId:'fixture-recurring-project',dueDate:day});
  state.data.plans.push({id:week+':'+regular.id,version:1,weekId:week,ownerId:regular.id,status:'Borrador',taskSelections:{'review-fixture':true}});
  connections.set(known.id,{...connection,events:[...connection.events,event],revision:crypto.randomUUID()});
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();
  const boards=name=>page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})})
   .getByRole('region',{name:'Tableros',exact:true});
  for(const member of [known,other]){
   const section=boards(member.name);
   await section.getByText('Otra área de prueba',{exact:true}).waitFor();
   assert.deepEqual(await section.locator('li strong').allTextContents(),['Área de prueba','Otra área de prueba']);
  }
  assert.deepEqual(await boards(regular.name).locator('li strong').allTextContents(),['Área de prueba']);
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:regular.name,exact:true})});
  await card.getByRole('region',{name:'Tareas',exact:true}).getByRole('button',{name:/Revisar el informe semanal/}).waitFor();
  const bodyGeometry=await card.evaluate(element=>{
   const task=element.querySelector('.people-work-row').getBoundingClientRect();
   const boardsHeading=element.querySelector('.people-boards h3').getBoundingClientRect();
   return {gap:boardsHeading.top-task.bottom,footer:element.querySelector('.people-card-footer').getBoundingClientRect().bottom};
  });
  assert.ok(bodyGeometry.gap>=0&&bodyGeometry.gap<=20);
  const footer=page.getByRole('article').filter({has:page.getByRole('heading',{name:known.name,exact:true})}).locator('footer');
  assert.equal((await footer.boundingBox()).y+(await footer.boundingBox()).height,bodyGeometry.footer);
  await page.locator('.people-grid').screenshot({path:'test-results/la-du-tarjetas-escritorio.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await card.screenshot({path:'test-results/la-du-tarjeta-movil.png'});
 });
 assert.deepEqual(errors,[]);await writeFile('test-results/calendar-browser.json',JSON.stringify({passed,errors},null,2));
}catch(error){await page.screenshot({path:'test-results/calendar-failure.png',fullPage:true});console.log('Pending requests', [...pending]);console.log((await page.locator('main').innerText()).slice(-2500));throw error;}finally{await browser.close();}
