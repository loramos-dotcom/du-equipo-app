import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {legacyInstitutionalState as institutionalState} from './helpers/legacy-team.ts';import {api} from '../server/api.ts';import {execute} from '../shared/domain.ts';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4249',boardOrigin='http://127.0.0.1:4250';
const email='persona05@bue.edu.ar',user={id:'00000000-0000-4000-8000-000000000001',email,app_metadata:{provider:'google'},email_confirmed_at:'2026-10-20',user_metadata:{name:'Persona 05'},identities:[{provider:'google',identity_data:{email,email_verified:true}}]};
let state=institutionalState('management-browser',{persona01:'persona01@bue.edu.ar',persona05:email},'persona01@bue.edu.ar');
state.data.members.forEach(m=>m.active=true);
const ownPriority=execute(state,'persona01',{id:crypto.randomUUID(),kind:'create',entity:'projects',data:{title:'Prioridad propia de DU',outcome:'Resultado propio del equipo.',leadId:'persona01',scope:'du'}});state=ownPriority.state;state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'set_priority',entityId:ownPriority.result.id,expectedVersion:state.data.projects.find(p=>p.id===ownPriority.result.id).version,data:{selected:true,order:0,reason:'Prioridad de prueba'}}).state;
let identity={id:'du-persona05',email,provider:'google',verified:true},store={load:async()=>structuredClone(state),create:async()=>{},save:async(_k,revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const area={id:'area-1',area_key:'gestion_administrativa',number:1,name:'Gestión Administrativa'};
function project(id,name,favorite=false,parent_id=null){return {id,parent_id,kind:parent_id?'subproject':'project',version:1,name,source_key:null,dg_go:'DU',priority:'Alta',objective:'Resultado compartido',scope:'Ministerio',justification:'',notes:'',progress:0,status:'active',manual_status:null,status_label:null,report_date:'2026-10-20',planned_start:'2026-10-20',planned_end:'2026-11-30',planned_days:42,rescheduled_start:null,rescheduled_end:null,rescheduled_days:null,budget:'Sin presupuesto',mechi:false,competency_areas:[],sort_order:0,visual_metrics:{},primary_area:area,project_areas:[{area}],project_updates:[],next_steps:[],attachments:[],dashboard_favorites:favorite?[{sort_order:1}]:[]};}
const data={projects:[project('alpha','Proyecto sin favorito'),project('beta','Proyecto priorizado',true),project('child','Subproyecto compartido',false,'beta')],indicators:[{id:'indicator-1',project_id:'alpha',name:'Indicador compartido',value_text:'10',value_numeric:10,target_text:'20',target_numeric:20,unit:'escuelas',period:'2026',notes:'',status:'En curso',updated_at:'2026-10-20',area,project:{name:'Proyecto sin favorito'}}],milestones:[{source_sheet:'HITOS 2026',id:'milestone-1',project_id:'alpha',name:'Hito compartido',project_title:'Proyecto sin favorito',start_date:'2026-10-20',due_date:'2026-11-01',owner:'DU',scope:'',detail:'Entregar material',axis:'',jgm_eligible:'',status:'En curso',updated_at:'2026-10-20',area,project:{name:'Proyecto sin favorito'}}],budget_execution:[{id:'budget-1',concept:'Materiales compartidos',period:'2026',budgeted:100,executed:25,detail:'Detalle presupuesto',updated_at:'2026-10-20',area}],special_views:[{id:'special-1',project_id:null,view_key:'administrative_dining',title:'Comedores compartidos',payload:{kind:'metrics',cards:[{label:'Escuelas',value:'12'}]},updated_at:'2026-10-20',area}]};
data.projects.push(project('grandchild','Subproyecto de segundo nivel',false,'child'));
data.special_views.push({id:'map-1',project_id:'beta',view_key:'administrative_works_map',title:'Mapa de Obras',payload:{markers:[{id:'work-1',name:'Obra de prueba',lat:-34.61,lng:-58.43,status:'En ejecución',sourceTrafficLight:'V'}]},updated_at:'2026-10-20',area});
const formatted=data.projects.find(p=>p.id==='beta');
formatted.objective='**Resultado destacado** y __resultado subrayado__';formatted.scope='__Alcance subrayado__';formatted.notes='**Nota destacada**';
formatted.project_updates.push({id:'rich-existing',report_date:'2026-10-16',update_type:'Información',detail:'**Status al 16/10 (6:00 horas)**\n• **Inscriptos**: 34.296 (+2% vs. misma instancia en 2025)\n→ __Dato subrayado__\n<img src=x onerror="alert(1)">',resolved:false,attachments:[]});
formatted.next_steps.push({id:'rich-step',task:'__Paso subrayado__ y **paso destacado**',due_date:'2026-11-12',resolved:false,next_step_owners:[{owner_label:'DU'}]});
formatted.project_updates.push({id:'project-alert-preserved',report_date:'2026-10-20',update_type:'Alerta/Bloqueo',detail:'Bloqueo de proyecto conservado en el Tablero',resolved:false,attachments:[]});
let holdOverview=false,capturedOverview=()=>{},resumeOverview=()=>{};
let connected=true,role='root',failSave=false,failOverview=false,sequence=0,mutationCount=0;
function reply(body,status=200){return {status,contentType:'application/json',body:JSON.stringify(body)};}
function db(route,method,body,accept=''){
 const url=new URL(route,'https://fixture'),table=url.pathname.split('/').at(-1);
 if(url.pathname.startsWith('/auth/v1/'))return reply(user);
 if(method==='GET'){
  if(table==='du_management_revisions')return reply({projects_revision:JSON.stringify(data.projects),portfolio_revision:JSON.stringify(data.special_views)+JSON.stringify(data.budget_execution),access_revision:role});if(table==='profiles')return reply(accept.includes('vnd.pgrst.object')?{id:user.id,email,display_name:'Persona 05',role}:[{id:user.id,email,display_name:'Persona 05',role}]);
  if(table==='area_permissions')return reply([]);if(table==='dashboard_permissions')return reply({can_edit:role==='root'});
  if(table==='areas')return reply(accept.includes('vnd.pgrst.object')?{id:area.id}:[area]);
  if(table==='access_grants')return reply([]);return reply(data[table]??[]);
 }
 mutationCount++;if(role==='viewer')return reply({code:'42501',message:'No tenés permiso.'},403);if(failSave)return reply({message:'Error de prueba: se conserva el borrador.'},503);
 if(table==='save_project_bundle'||table==='du_save_project_bundle'){
  const p=body.payload.project;if(body.payload.updates.some(r=>r.detail==='Novedad desde formulario DU')||body.payload.nextSteps.some(r=>r.task==='Paso desde DU')){assert.equal(Object.hasOwn(p,'manualStatus'),false);assert.equal(Object.hasOwn(p,'visualMetrics'),false);}let record=data.projects.find(r=>r.id===p.id);
  if(record&&record.version!==p.version)return reply({code:'40001',message:'El proyecto fue modificado por otra persona. Recargá los datos antes de guardar.'},409);
  if(!record){record=project('new-'+(++sequence),p.name,false,p.parentId??null);data.projects.push(record);}
  Object.assign(record,{name:p.name,dg_go:p.dgGo,priority:p.priority,objective:p.objective,scope:p.scope,justification:p.justification,notes:p.notes,budget:p.budget,mechi:p.mechi,brief_url:p.briefUrl});record.version++;
  for(const entry of body.payload.updates){let row=record.project_updates.find(r=>r.id===entry.id);if(entry.deleted){record.project_updates=record.project_updates.filter(r=>r.id!==entry.id);continue;}if(!row){row={id:'update-'+(++sequence),resolved:false,attachments:[]};record.project_updates.push(row);}Object.assign(row,{report_date:entry.date,update_type:entry.type,detail:entry.detail});}
  for(const entry of body.payload.nextSteps){let row=record.next_steps.find(r=>r.id===entry.id);if(entry.deleted){record.next_steps=record.next_steps.filter(r=>r.id!==entry.id);continue;}if(!row){row={id:'step-'+(++sequence),resolved:false};record.next_steps.push(row);}Object.assign(row,{task:entry.task,due_date:entry.dueDate,next_step_owners:entry.owners.map(owner_label=>({owner_label}))});}
  return reply(record.id);
 }
 if(table==='resolve_project_update'||table==='resolve_next_step'){
  const isStep=table==='resolve_next_step',key=isStep?'next_steps':'project_updates',id=isStep?body.target_step:body.target_update;const record=data.projects.find(p=>p[key].some(r=>r.id===id));const row=record[key].find(r=>r.id===id);row.resolved=true;const next={id:'resolved-'+(++sequence),report_date:'2026-10-20',update_type:'Avance',detail:body.resolution_detail,resolved:false,attachments:[]};record.project_updates.push(next);record.version++;return reply(next.id);
 }
 if(table==='set_project_manual_status'){const p=data.projects.find(p=>p.id===body.target_project);p.manual_status=body.requested_status;p.version++;return reply(null);}
 if(table==='set_dashboard_favorite'){const p=data.projects.find(p=>p.id===body.target_project);p.dashboard_favorites=body.favorite?[{sort_order:1}]:[];return reply(null);}
 const records=data[table];if(records&&method==='PATCH'){const id=url.searchParams.get('id')?.replace(/^eq\./,'');const r=records.find(r=>r.id===id);if(r)Object.assign(r,body);return {status:204,body:''};}
 if(records&&method==='POST'){records.push({...body,id:'record-'+(++sequence),area,project:null});return {status:201,body:''};}
 return reply(null);
}
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),board=await context.newPage(),errors=[],passed=[];
page.setDefaultTimeout(10000);board.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await mkdir('test-results',{recursive:true});
const university={id:'area-university',area_key:'universidad',number:8,name:'Universidad'},technology={id:'area-tech',area_key:'tecnologia',number:3,name:'Tecnología'};
for(const p of data.projects){const assigned=p.id==='alpha'?university:technology;p.primary_area=assigned;p.project_areas=[{area:assigned}];p.dg_go=p.id==='alpha'?'Administrativa':'Agencia';}
for(const [name,owner]of [['Vista anterior de Persona 05','Persona 05'],['Vista anterior de un área','Administrativa']])state=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'filters',data:{scope:'view:Proyectos',name,definition:{page:'Proyectos',projectSource:'gestion',gestionView:{projectScope:'all',query:'',owner,activeArea:'all_projects',priority:false,view:'cards',statuses:[]}}}}).state;
state=execute(state,'persona05',{id:crypto.randomUUID(),kind:'create',entity:'issues',data:{title:'Incidencia propia de Persona 05',type:'Bloqueo',ownerId:'persona05',projectId:ownPriority.result.id,impact:'Falta un dato',nextAction:'Pedir el dato',followUpDate:'2026-10-23'}}).state;
state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'create',entity:'issues',data:{title:'Incidencia de otra persona',type:'Bloqueo',ownerId:'persona06',projectId:ownPriority.result.id,impact:'Dato ajeno',nextAction:'Seguimiento ajeno',followUpDate:'2026-10-23'}}).state;
const expires=Math.floor(Date.now()/1000)+86400,token=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:expires,role:'authenticated'})).toString('base64url'),'fixture'].join('.');
await context.addInitScript(({user,token,expires})=>{localStorage.setItem('sb-fkboxwavttkrkfqbtrwc-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:expires,expires_in:86400,token_type:'bearer',user}));},{user,token,expires});
await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64')}));
await context.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',async route=>route.fulfill({status:200,contentType:'text/javascript',body:await readFile('node_modules/leaflet/dist/leaflet.js')}));
await context.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',async route=>route.fulfill({status:200,contentType:'text/css',body:await readFile('node_modules/leaflet/dist/leaflet.css')}));
await context.route('https://fkboxwavttkrkfqbtrwc.supabase.co/**',async route=>{const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});return;}const result=db(url.pathname+url.search,req.method(),req.postDataJSON(),req.headers().accept);await route.fulfill({...result,headers:{'access-control-allow-origin':'*'}});});
await context.route(origin+'/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname==='/api/backups/status'){await route.fulfill(reply({configured:false,connected:false,ownerEmail:email,canAuthorize:true}));return;}if(url.pathname==='/api/gestion/session'){await route.fulfill(reply({connected,user:connected?user:undefined}));return;}if(url.pathname==='/api/gestion/overview'){if(failOverview){await route.fulfill(reply({error:'No se pudo actualizar el resumen del tablero.'},503));return;}const priorities=data.projects.filter(p=>p.dashboard_favorites.length).map(p=>({project_id:p.id,sort_order:p.dashboard_favorites[0].sort_order,project:{id:p.id,parent_id:p.parent_id,kind:p.kind,name:p.name,objective:p.objective,dg_go:p.dg_go,report_date:p.report_date}}));const all=data.projects.flatMap(p=>p.project_updates.map(r=>({...r,project_id:p.id,project:{id:p.id,name:p.name}})));const issues=all.filter(r=>!r.resolved&&['Alerta/Bloqueo','Pendiente'].includes(r.update_type)),steps=data.projects.flatMap(p=>p.next_steps.filter(r=>!r.resolved).map(r=>({...r,project_id:p.id,project:{id:p.id,name:p.name}})));const snapshot={connected,issues:connected?issues:[],steps:connected?steps:[],updates:connected?all.filter(r=>['Avance','Información'].includes(r.update_type)).slice(-3):[],priorities:connected?priorities:[]};if(holdOverview){holdOverview=false;await new Promise(resolve=>{resumeOverview=resolve;capturedOverview();});}await route.fulfill(reply(snapshot));return;}if(url.pathname==='/api/gestion/proxy'){const result=db(url.searchParams.get('route'),req.method(),req.postData()?req.postDataJSON():undefined,req.headers().accept);await route.fulfill(result);return;}const r=await api(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),store,'management-browser',{mode:'team',identity,externalProjects:data.projects.map(p=>({id:'gestion:'+p.id,sourceId:p.id,version:1,title:p.name,outcome:p.objective,status:'Activo',areaKeys:p.project_areas.map(row=>row.area.area_key)}))});await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});});
const manager=()=>page.locator('.du-shared-projects'),detail=()=>page.locator('.du-project-detail'),form=()=>page.locator('.form-dialog');
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function openProject(name){await manager().getByRole('button',{name:'Abrir '+name,exact:true}).click();await detail().getByRole('heading',{name,exact:true}).waitFor();assert.equal(await detail().getByRole('tab',{name:'Historial',exact:true}).count(),0);assert.equal(await detail().getByRole('tab',{name:'Actividad',exact:true}).count(),1);}
state.data.projectLinks.push({id:'priority-beta',version:1,sourceId:'beta',members:['persona06'],leadId:'persona06',areaIds:['sstedu'],duPriority:true});
const scope=()=>manager().getByRole('group',{name:'Alcance de proyectos',exact:true});
const areaButtons=()=>manager().getByRole('group',{name:'Filtrar proyectos por área',exact:true});
async function filters(){const button=manager().getByRole('button',{name:/^Filtros/});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
async function more(){await manager().locator('.projects-tools>summary').click();}
async function reset(){const clear=manager().getByRole('button',{name:'Limpiar filtros',exact:true});if(await clear.count())await clear.click();}
try{
 await page.goto(origin+'/#Proyectos');await manager().getByRole('heading',{name:'Proyectos',exact:true}).waitFor();await page.waitForLoadState('networkidle');
 await check('Una lista compacta abre en Mis proyectos y oculta los controles secundarios',async()=>{
  assert.equal(await scope().getByRole('button',{name:'Mis proyectos',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true}).count(),1);
  assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),0);
  assert.equal(await manager().getByRole('region',{name:'Lista de proyectos',exact:true}).count(),1);
  assert.equal(await manager().getByRole('region',{name:'Resto de proyectos',exact:true}).count(),0);
  assert.equal(await manager().locator('.du-area-card').count(),0);assert.equal(await manager().getByRole('button',{name:'Vistas guardadas',exact:true}).count(),0);
  assert.equal(await areaButtons().getByRole('button').count(),11);
  assert.equal(await manager().getByRole('combobox').count(),0);assert.equal(await manager().getByRole('button',{name:'Exportar',exact:true}).isVisible().catch(()=>false),false);
  assert.deepEqual(await manager().getByRole('columnheader').allTextContents(),['Proyecto','Área','Referente DU','Estado']);
 });
 await check('Los filtros, la lista y la ficha usan el mismo color para cada área sin colorear los estados',async()=>{
  const buttons=areaButtons().locator('button[data-area]');
  assert.equal(await buttons.count(),10);
  const colors=await buttons.evaluateAll(elements=>elements.map(el=>getComputedStyle(el).getPropertyValue('--area-bg').trim()));
  assert.equal(new Set(colors).size,10);
  const filter=areaButtons().getByRole('button',{name:'Universidad',exact:true});
  const theme=await filter.evaluate(el=>getComputedStyle(el).getPropertyValue('--area-ink').trim());
  const row=manager().getByRole('row').filter({has:page.getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true})});
  const chip=row.locator('.area-chip[data-area="universidad"]');
  assert.equal(await chip.count(),1);assert.equal(await chip.evaluate(el=>getComputedStyle(el).getPropertyValue('--area-ink').trim()),theme);
  assert.equal(await row.locator('.badge[data-area]').count(),0);
  await openProject('Proyecto sin favorito');
  const summary=detail().locator('.project-sheet-assignment .area-chip[data-area="universidad"]');
  assert.equal(await summary.count(),1);assert.equal(await summary.evaluate(el=>getComputedStyle(el).getPropertyValue('--area-ink').trim()),theme);
  await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  await filter.click();assert.equal(await filter.getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.project-area-filters button[aria-pressed="true"][data-area="universidad"]')).color==='rgb(255, 255, 255)');
  const selected=await filter.evaluate(el=>({ink:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
  assert.equal(selected.ink,'rgb(255, 255, 255)');assert.notEqual(selected.bg,'rgb(255, 255, 255)');
  await areaButtons().getByRole('button',{name:'Todas',exact:true}).click();
 });
 await check('Mis proyectos y área se combinan sin ampliar el alcance ni modificar los datos',async()=>{
  const before=JSON.stringify(data.projects);
  await areaButtons().getByRole('button',{name:'SSTEDU',exact:true}).click();await manager().getByText('No hay proyectos con estos filtros',{exact:true}).waitFor();
  assert.equal(await scope().getByRole('button',{name:'Mis proyectos',exact:true}).getAttribute('aria-pressed'),'true');
  await scope().getByRole('button',{name:'Todos los proyectos',exact:true}).click();await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).waitFor();
  assert.equal(await areaButtons().getByRole('button',{name:'SSTEDU',exact:true}).getAttribute('aria-pressed'),'true');
  await areaButtons().getByRole('button',{name:'Todas',exact:true}).click();assert.equal(JSON.stringify(data.projects),before);
 });
 await check('Prioritarios primero y subproyectos colapsados hasta desplegarlos',async()=>{
  const names=await manager().locator('.project-browser-table tbody tr').getByRole('button',{name:/^Abrir /}).allTextContents();
  assert.ok(names[0].includes('Proyecto priorizado'));assert.equal(await manager().getByRole('button',{name:'Abrir Subproyecto compartido',exact:true}).count(),0);
  await manager().getByRole('button',{name:'Ver subproyectos de Proyecto priorizado',exact:true}).click();await manager().getByRole('button',{name:'Abrir Subproyecto compartido',exact:true}).waitFor();
  await manager().getByRole('button',{name:'Ver subproyectos de Subproyecto compartido',exact:true}).click();await manager().getByRole('button',{name:'Abrir Subproyecto de segundo nivel',exact:true}).waitFor();
  await manager().getByRole('button',{name:'Ocultar subproyectos de Proyecto priorizado',exact:true}).click();assert.equal(await manager().getByRole('button',{name:'Abrir Subproyecto compartido',exact:true}).count(),0);
 });
 await check('Buscar un subproyecto revela su ruta, sin duplicarlo ni perder el proyecto principal',async()=>{
  await manager().getByRole('textbox',{name:'Filtrar proyectos',exact:true}).fill('segundo nivel');await manager().getByRole('button',{name:'Abrir Subproyecto de segundo nivel',exact:true}).waitFor();
  assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),1);await manager().getByRole('textbox',{name:'Filtrar proyectos',exact:true}).fill('');
 });
 await check('Filtros conserva referentes DU, estado y prioridad separados de la unidad del Tablero',async()=>{
  await filters();const filter=manager().getByRole('combobox',{name:'Filtrar por referente',exact:true}),people=state.data.members.filter(m=>m.active).map(m=>({value:m.id,label:m.name})).sort((a,b)=>a.label.localeCompare(b.label,'es'));
  assert.deepEqual(await filter.locator('option').evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent}))),[{value:'',label:'Todos los referentes'},...people]);
  await filter.selectOption('persona05');assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true}).count(),1);assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),0);
  const row=manager().getByRole('row').filter({has:page.getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true})});assert.equal(await row.locator('[data-label="Referente DU"]').getByRole('img',{name:'Persona 05',exact:true}).count(),1);
  await filter.selectOption('persona06');assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true}).count(),0);assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),1);
  await filter.selectOption('persona05');await more();const downloading=page.waitForEvent('download');await manager().getByRole('button',{name:'Exportar',exact:true}).click();const download=await downloading,csv=await readFile(await download.path(),'utf8');assert.ok(csv.includes('"Referentes DU";"Unidad responsable en el Tablero"'));assert.ok(csv.includes('"Persona 05";"Administrativa"'));assert.equal(csv.includes('"Proyecto priorizado"'),false);
  await reset();
 });
 await check('Cambiar entre tabla y tarjetas conserva los filtros sin repetir listas',async()=>{
  await filters();await manager().getByRole('button',{name:'Vista tarjetas',exact:true}).click();assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),1);
  await manager().getByRole('button',{name:'Vista tabla',exact:true}).click();await scope().getByRole('button',{name:'Mis proyectos',exact:true}).click();
 });
 await openProject('Proyecto sin favorito');
 await check('La prioridad DU sigue siendo independiente del Tablero',async()=>{
  await detail().getByRole('button',{name:'Marcar prioridad DU',exact:true}).click();await detail().getByRole('button',{name:'Quitar prioridad DU',exact:true}).waitFor();assert.equal(state.data.projectLinks.find(p=>p.sourceId==='alpha').duPriority,true);assert.equal(data.projects.find(p=>p.id==='alpha').dashboard_favorites.length,0);assert.equal(data.projects.find(p=>p.id==='beta').dashboard_favorites.length,1);
 });
 await check('Se conservan las asignaciones múltiples y los contactos del área',async()=>{
  await detail().getByRole('button',{name:'Más acciones',exact:true}).click();await detail().getByRole('button',{name:'Asignar personas y áreas',exact:true}).click();const people=form().getByRole('group',{name:'Personas asignadas',exact:true}),assignedAreas=form().getByRole('group',{name:'Áreas asignadas',exact:true});
  await people.getByRole('checkbox',{name:'Persona 06',exact:true}).check();assert.equal(await assignedAreas.getByRole('checkbox',{name:'SSTEDU',exact:true}).isChecked(),true);await assignedAreas.getByRole('checkbox',{name:'Agencia',exact:true}).check();assert.equal(await people.getByRole('checkbox',{name:'Persona 03',exact:true}).isChecked(),true);
  await form().getByLabel('Motivo',{exact:false}).fill('Seguimiento compartido');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});const link=state.data.projectLinks.find(p=>p.sourceId==='alpha');assert.ok(link.members.includes('persona05')&&link.members.includes('persona06')&&link.members.includes('persona03'));
  await detail().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await areaButtons().getByRole('button',{name:'Universidad',exact:true}).click();await more();await manager().getByRole('button',{name:'Referentes y contactos',exact:true}).click();await page.locator('dialog.detail-sheet').getByRole('button',{name:'Cerrar detalle',exact:true}).click();await reset();
 });
 await check('Transversales conserva las áreas originales y las asignaciones de seguimiento DU',async()=>{
  const transversal={id:'area-transversal',area_key:'transversales',number:10,name:'Transversales'},privateArea={id:'area-privada',area_key:'privada',number:5,name:'Privada'};
  const mixed=project('multi-area','Proyecto transversal de prueba');mixed.primary_area=privateArea;mixed.project_areas=[{area:privateArea},{area:transversal}];data.projects.push(mixed);state.data.projectLinks.push({id:'tracking-mixed',version:1,sourceId:mixed.id,members:['persona05'],leadId:'persona05',areaIds:['universidad'],duPriority:false});state.revision++;
  await page.reload();await manager().getByRole('heading',{name:'Proyectos',exact:true}).waitFor();await page.waitForLoadState('networkidle');
  for(const name of ['Transversales','Privada','Universidad']){await areaButtons().getByRole('button',{name,exact:true}).click();await manager().getByRole('button',{name:'Abrir Proyecto transversal de prueba',exact:true}).waitFor();assert.equal(await scope().getByRole('button',{name:'Mis proyectos',exact:true}).getAttribute('aria-pressed'),'true');}
  await areaButtons().getByRole('button',{name:'Todas',exact:true}).click();assert.deepEqual(mixed.project_areas.map(link=>link.area.area_key),['privada','transversales']);
 });
 await check('El menú conserva Hitos y vuelve a la lista de proyectos',async()=>{
  await more();await manager().getByRole('button',{name:'Ver hitos de gestión',exact:true}).click();await page.getByText('Hito compartido',{exact:true}).first().waitFor();await more();await manager().getByRole('button',{name:'Volver a proyectos',exact:true}).click();await manager().getByRole('region',{name:'Lista de proyectos',exact:true}).waitFor();
 });
 await check('La vista de escritorio y móvil no desborda y los botones por área son utilizables',async()=>{
  await page.mouse.move(0,0);await page.waitForTimeout(250);await page.screenshot({path:'test-results/proyectos-navegacion-escritorio.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await areaButtons().getByRole('button',{name:'Transversales',exact:true}).scrollIntoViewIfNeeded();await areaButtons().getByRole('button',{name:'Transversales',exact:true}).click();await manager().getByRole('button',{name:'Abrir Proyecto transversal de prueba',exact:true}).waitFor();await page.mouse.move(0,0);await page.waitForTimeout(250);await page.screenshot({path:'test-results/proyectos-navegacion-movil.png',fullPage:true});
 });
 await page.setViewportSize({width:1440,height:1000});await reset();
 await check('Las asignaciones compartidas siguen reflejadas en el filtro por persona',async()=>{
  await scope().getByRole('button',{name:'Todos los proyectos',exact:true}).click();await filters();const filter=manager().getByRole('combobox',{name:'Filtrar por referente',exact:true});await filter.selectOption('persona06');assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true}).count(),1);assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),1);await filter.selectOption('persona03');assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true}).count(),1);assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),0);await reset();
 });
 await page.locator('.sidebar').getByRole('button',{name:'Mi panel',exact:true}).click();assert.equal(await page.locator('.shared-management-summary').count(),0);
 await check('Mi panel abre Proyectos y conserva la prioridad independiente de DU',async()=>{
  await page.getByRole('button',{name:/Proyectos de la DU/}).click();await manager().getByRole('heading',{name:'Proyectos',exact:true}).waitFor();await filters();await manager().getByRole('button',{name:'Prioridad DU',exact:true}).click();assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto sin favorito',exact:true}).count(),1);assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto priorizado',exact:true}).count(),0);
 });
 await page.locator('.sidebar').getByRole('button',{name:'Bloqueos y ayuda',exact:true}).click();
 await check('Bloqueos y ayuda muestra sólo tareas y conserva los problemas propios dentro del proyecto',async()=>{
  const followups=page.getByRole('region',{name:'Bloqueos y ayuda',exact:true}),before=structuredClone(state.data.issues);
  await followups.getByRole('heading',{name:'Bloqueos y ayuda',exact:true}).waitFor();assert.equal(await followups.getByRole('button',{name:/^Problemas de proyectos/}).count(),0);assert.equal(await followups.getByRole('button',{name:'Incidencia propia de Persona 05',exact:true}).count(),0);assert.equal(await followups.getByRole('button',{name:'Incidencia de otra persona',exact:true}).count(),0);assert.equal(await page.locator('#nav-issue-count').count(),0);
  await page.getByRole('textbox',{name:'Buscar en DU Equipo',exact:true}).fill('Prioridad propia de DU');await page.locator('.search-result-projects').filter({hasText:'Prioridad propia de DU'}).click();const ownSheet=page.locator('dialog.project-detail[open]');await ownSheet.getByRole('heading',{name:'Prioridad propia de DU',exact:true}).waitFor();await ownSheet.getByRole('button',{name:'Más secciones del proyecto',exact:true}).click();await ownSheet.getByRole('button',{name:'Bloqueos y ayuda',exact:true}).click();await ownSheet.getByRole('heading',{name:'Incidencia propia de Persona 05',exact:true}).waitFor();assert.deepEqual(state.data.issues,before);await ownSheet.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
 });
 await check('Los problemas del equipo y del Tablero siguen accesibles en sus proyectos sin inflar el contador de tareas',async()=>{
  identity={id:'du-persona01',email:'persona01@bue.edu.ar',provider:'google',verified:true};await page.reload();const followups=page.getByRole('region',{name:'Bloqueos y ayuda',exact:true});await followups.getByRole('heading',{name:'Bloqueos y ayuda',exact:true}).waitFor();assert.equal(await followups.getByRole('button',{name:/^Problemas de proyectos/}).count(),0);assert.equal(await followups.locator('.followup-task,.followup-card,.shared-management-item').count(),0);assert.equal(await page.locator('#nav-issue-count').count(),0);
  await page.getByRole('textbox',{name:'Buscar en DU Equipo',exact:true}).fill('Prioridad propia de DU');await page.locator('.search-result-projects').filter({hasText:'Prioridad propia de DU'}).click();const ownSheet=page.locator('dialog.project-detail[open]');await ownSheet.getByRole('heading',{name:'Prioridad propia de DU',exact:true}).waitFor();await ownSheet.getByRole('button',{name:'Más secciones del proyecto',exact:true}).click();await ownSheet.getByRole('button',{name:'Bloqueos y ayuda',exact:true}).click();await ownSheet.getByRole('heading',{name:'Incidencia propia de Persona 05',exact:true}).waitFor();await ownSheet.getByRole('heading',{name:'Incidencia de otra persona',exact:true}).waitFor();await ownSheet.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  identity={id:'du-persona05',email,provider:'google',verified:true};await page.reload();
  await page.locator('.sidebar').getByRole('button',{name:'Proyectos',exact:true}).click();await manager().getByRole('heading',{name:'Proyectos',exact:true}).waitFor();await reset();await scope().getByRole('button',{name:'Todos los proyectos',exact:true}).click();await openProject('Proyecto priorizado');await detail().getByRole('tab',{name:'Actividad',exact:true}).click();const activitySheet=page.locator('dialog.project-detail[open]');await activitySheet.getByText('Bloqueo de proyecto conservado en el Tablero',{exact:true}).waitFor();assert.equal(data.projects.find(project=>project.id==='beta').project_updates.find(update=>update.id==='project-alert-preserved').resolved,false);assert.equal(await page.locator('#nav-issue-count').count(),0);await activitySheet.getByRole('button',{name:'Cerrar detalle',exact:true}).click();await detail().waitFor({state:'hidden'});
 });
 const nativeProject=execute(state,'persona01',{id:crypto.randomUUID(),kind:'create',entity:'projects',data:{title:'Proyecto propio para comparar fichas',outcome:'Resultado propio de prueba',description:'Notas propias del proyecto para comparar el formato.',leadId:'persona05',members:['persona05'],areaId:'universidad',areaIds:['universidad'],scope:'area',intervention:'acompaña'}});state=nativeProject.state;
 state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title:'Tarea del proyecto propio de prueba',ownerId:'persona05',projectId:nativeProject.result.id,reason:'Asignación de prueba'}}).state;
 state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'create',entity:'comments',data:{entryType:'update',targetType:'projects',targetId:nativeProject.result.id,body:'**Novedad propia de prueba**'}}).state;
 state=execute({...state,externalProjects:[{id:'gestion:alpha',sourceId:'alpha',title:'Proyecto sin favorito',outcome:'Resultado compartido',version:1,status:'Activo',areaKeys:['universidad']}]},'persona01',{id:crypto.randomUUID(),kind:'create',entity:'comments',data:{entryType:'update',targetType:'projects',targetId:'gestion:alpha',body:'**Nota DU del proyecto compartido**'}}).state;
 state=execute({...state,externalProjects:[{id:'gestion:alpha',sourceId:'alpha',title:'Proyecto sin favorito',outcome:'Resultado compartido',version:1,status:'Activo',areaKeys:['universidad']}]},'persona05',{id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title:'Tarea del proyecto compartido de prueba',ownerId:'persona05',projectId:'gestion:alpha'}}).state;
 function seedProjectTask(projectId,title,status,archived=false,ownerId='persona05'){
  const created=execute({...state,externalProjects:data.projects.map(p=>({id:'gestion:'+p.id,sourceId:p.id,title:p.name,outcome:p.objective,version:1,status:'Activo',areaKeys:p.project_areas.map(link=>link.area.area_key)}))},'persona01',{id:crypto.randomUUID(),kind:'create',entity:'tasks',data:{title,ownerId,projectId}});state=created.state;
  state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'transition_task',entityId:created.result.id,expectedVersion:state.data.tasks.find(t=>t.id===created.result.id).version,data:{status,note:'Resultado ficticio para comprobar las tareas del proyecto.'}}).state;
  if(archived)state=execute(state,'persona01',{id:crypto.randomUUID(),kind:'archive',entity:'tasks',entityId:created.result.id,expectedVersion:state.data.tasks.find(t=>t.id===created.result.id).version,data:{}}).state;
  return created.result.id;
 }
 const taskGroups=[
  {projectId:nativeProject.result.id,projectName:'Proyecto propio para comparar fichas',pending:'Tarea del proyecto propio de prueba',finished:'Entrega finalizada del proyecto propio',cancelled:'Tarea cancelada del proyecto propio',archived:'Entrega archivada del proyecto propio'},
  {projectId:'gestion:alpha',projectName:'Proyecto sin favorito',pending:'Tarea del proyecto compartido de prueba',finished:'Entrega finalizada del proyecto compartido',cancelled:'Tarea cancelada del proyecto compartido',archived:'Entrega archivada del proyecto compartido'},
 ];
 for(const group of taskGroups){group.finishedId=seedProjectTask(group.projectId,group.finished,'Terminada');seedProjectTask(group.projectId,group.cancelled,'Cancelada');seedProjectTask(group.projectId,group.archived,'Terminada',true);}
 const unrelatedTask='Entrega finalizada de otro proyecto';seedProjectTask(ownPriority.result.id,unrelatedTask,'Terminada',false,'persona01');
 data.projects.find(project=>project.id==='alpha').notes='Notas compartidas para comparar el formato.';
 data.projects.find(project=>project.id==='alpha').project_updates.push({id:'unified-source-update',report_date:'2026-10-20',update_type:'Información',detail:'**Novedad del Tablero en la actividad unificada**',resolved:false,attachments:[]});
 const commonSheet=()=>page.locator('dialog.project-detail[open]');
 async function closeProjectSheets(projectId){
  await commonSheet().getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  if(String(projectId).startsWith('gestion:'))await detail().waitFor({state:'hidden'});
 }

 const sheetStyle=()=>commonSheet().evaluate(dialog=>{const heading=getComputedStyle(dialog.querySelector('.project-sheet-heading')),title=getComputedStyle(dialog.querySelector('.project-sheet-heading h2')),grid=getComputedStyle(dialog.querySelector('.project-sheet-grid'));return {width:Math.round(dialog.getBoundingClientRect().width),headingPadding:heading.padding,font:title.fontFamily,fontSize:title.fontSize,columns:grid.gridTemplateColumns,gap:grid.gap};});
 let localStyle;
 identity={id:'du-persona05',email,provider:'google',verified:true};
 await page.goto(origin+'/#Proyectos');await page.reload();await manager().getByRole('heading',{name:'Proyectos',exact:true}).waitFor();await reset();await scope().getByRole('button',{name:'Todos los proyectos',exact:true}).click();
 await check('Los proyectos propios usan el encabezado, las pestañas y el resumen común y conservan edición y tareas',async()=>{
  await manager().getByRole('button',{name:'Abrir Proyecto propio para comparar fichas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Proyecto propio para comparar fichas',exact:true}).waitFor();assert.deepEqual(await commonSheet().getByRole('tab').allTextContents(),['Resumen','Tareas','Actividad']);assert.equal(await commonSheet().locator('.project-sheet-heading>.eyebrow').innerText(),'PROYECTO');assert.equal(await commonSheet().locator('.project-sheet-grid dt').first().textContent(),'Resultado esperado');assert.equal(await commonSheet().getByText('Todavía no hay actualizaciones. Registrá avances, novedades o próximos pasos.',{exact:true}).count(),0);assert.equal(await commonSheet().locator('.project-sheet-lead').getByRole('img',{name:'Persona 05',exact:true}).count(),1);assert.equal(await commonSheet().getByRole('button',{name:'Eliminar proyecto',exact:true}).isVisible().catch(()=>false),false);await commonSheet().getByRole('button',{name:'Agregar actualización',exact:true}).waitFor();const management=commonSheet().locator('details').filter({has:page.locator('summary').filter({hasText:/^Datos de gestión$/})});assert.equal(await management.count(),1);assert.equal(await management.getAttribute('open'),null);await management.locator('summary').click();assert.equal(await management.getAttribute('open'),'');await management.locator('summary').click();localStyle=await sheetStyle();await page.screenshot({path:'test-results/portfolio-common-local-desktop.png',fullPage:true});
  await commonSheet().getByRole('tab',{name:'Actividad',exact:true}).click();await commonSheet().getByText('Novedad propia de prueba',{exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();await commonSheet().locator('.task-name').filter({hasText:'Tarea del proyecto propio de prueba'}).waitFor();
  await commonSheet().getByRole('tab',{name:'Actividad',exact:true}).click();await commonSheet().getByRole('group',{name:'Filtrar actividad',exact:true}).getByRole('button',{name:'Comentarios',exact:true}).click();await commonSheet().getByRole('button',{name:'Comentar',exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Resumen',exact:true}).click();
  const writes=mutationCount;await commonSheet().getByRole('button',{name:'Editar proyecto',exact:true}).click();await form().getByLabel('Descripción',{exact:true}).fill('Notas propias actualizadas sin cambiar de proyecto.');await form().getByLabel('Motivo del cambio',{exact:true}).fill('Verificar la edición de la ficha común');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});await commonSheet().getByText('Notas propias actualizadas sin cambiar de proyecto.',{exact:true}).waitFor();assert.equal(mutationCount,writes);assert.equal(state.data.projects.find(row=>row.id===nativeProject.result.id).description,'Notas propias actualizadas sin cambiar de proyecto.');await commonSheet().getByRole('button',{name:'Cerrar detalle',exact:true}).click();
 });
 await check('La ficha compartida conserva el mismo formato y abre tareas y notas DU sin perder sus datos de resumen',async()=>{
  await openProject('Proyecto sin favorito');assert.deepEqual(await detail().getByRole('tab').allTextContents(),['Resumen','Tareas','Actividad']);assert.deepEqual(await sheetStyle(),localStyle);await detail().getByText('Notas compartidas para comparar el formato.',{exact:true}).waitFor();await page.screenshot({path:'test-results/portfolio-common-shared-desktop.png',fullPage:true});
  await detail().getByRole('button',{name:'Más secciones del proyecto',exact:true}).click();await detail().getByRole('button',{name:'Próximos pasos',exact:true}).click();await detail().getByRole('heading',{name:'Próximos pasos',exact:true}).waitFor();await detail().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();await commonSheet().locator('.task-name').filter({hasText:'Tarea del proyecto compartido de prueba'}).click();await page.locator('dialog.detail-sheet[open]').locator('.task-detail-meta').getByRole('button',{name:'Proyecto sin favorito',exact:true}).click();await commonSheet().getByText('Notas compartidas para comparar el formato.',{exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Actividad',exact:true}).click();await commonSheet().getByText('Nota DU del proyecto compartido',{exact:true}).waitFor();await commonSheet().getByText('Novedad del Tablero en la actividad unificada',{exact:true}).waitFor();assert.equal(await page.locator('dialog.detail-sheet[open]').count(),1);assert.equal(await page.locator('dialog.du-project-detail[open]').count(),0);
  const sourceEntry=commonSheet().locator('.record-activity-entry').filter({hasText:'Novedad del Tablero en la actividad unificada'});await sourceEntry.getByRole('button',{name:'Editar actualización',exact:true}).click();await form().getByRole('heading',{name:'Editar actualización',exact:true}).waitFor();await form().getByLabel('Actualización',{exact:true}).fill('Novedad del Tablero editada sin recargar la ficha');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});await commonSheet().getByText('Novedad del Tablero editada sin recargar la ficha',{exact:true}).waitFor();await commonSheet().getByText('Nota DU del proyecto compartido',{exact:true}).waitFor();assert.equal(await page.locator('dialog.detail-sheet[open]').count(),1);assert.equal(await commonSheet().getByRole('tab',{name:'Actividad',exact:true}).getAttribute('aria-selected'),'true');assert.ok(data.projects.find(project=>project.id==='alpha').project_updates.find(update=>update.id==='unified-source-update').detail.includes('Novedad del Tablero editada sin recargar la ficha'));await commonSheet().getByRole('button',{name:'Cerrar detalle',exact:true}).click();await detail().waitFor({state:'hidden'});
 });
 await check('Las fichas propias y vinculadas separan pendientes, finalizadas y canceladas, incluidas las entregas archivadas',async()=>{
  for(const group of taskGroups){
   await manager().getByRole('button',{name:'Abrir '+group.projectName,exact:true}).click();await commonSheet().getByRole('heading',{name:group.projectName,exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();
   const pending=commonSheet().getByRole('region',{name:'Pendientes',exact:true}),finished=commonSheet().getByRole('region',{name:'Finalizadas',exact:true}),cancelled=commonSheet().getByRole('region',{name:'Canceladas',exact:true});
   await finished.locator('.task-name').filter({hasText:group.finished}).waitFor();
   assert.deepEqual(await pending.locator('.task-name strong').allTextContents(),[group.pending]);
   assert.deepEqual((await finished.locator('.task-name strong').allTextContents()).sort(),[group.finished,group.archived].sort());
   assert.deepEqual(await cancelled.locator('.task-name strong').allTextContents(),[group.cancelled]);
   assert.equal(await finished.locator('.task-name').filter({hasText:group.cancelled}).count(),0);assert.equal(await commonSheet().locator('.task-name').filter({hasText:unrelatedTask}).count(),0);
   const archived=finished.locator('.task-row').filter({has:page.getByRole('button',{name:'Abrir '+group.archived,exact:true})});
   assert.equal(await archived.getByText('Archivada',{exact:true}).count(),1);assert.equal(await archived.getByText('Terminada',{exact:true}).count(),1);assert.equal(await archived.getByRole('button',{name:'Actualizar estado de '+group.archived,exact:true}).count(),0);
   await closeProjectSheets(group.projectId);
  }
 });
 await check('Abrir y reabrir una finalizada desde cada ficha la mueve a Pendientes y conserva el proyecto',async()=>{
  for(const group of taskGroups){
   await manager().getByRole('button',{name:'Abrir '+group.projectName,exact:true}).click();await commonSheet().getByRole('heading',{name:group.projectName,exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();
   await commonSheet().getByRole('region',{name:'Finalizadas',exact:true}).getByRole('button',{name:'Abrir '+group.finished,exact:true}).click();
   const taskSheet=page.locator('dialog.detail-sheet[open]');await taskSheet.getByRole('heading',{name:group.finished,exact:true}).waitFor();assert.equal(await page.locator('dialog.detail-sheet[open]').count(),1);assert.equal(await taskSheet.locator('.detail-badges').getByText('Terminada',{exact:true}).count(),1);
   await taskSheet.getByRole('button',{name:'Actualizar estado',exact:true}).click();await form().getByLabel('Nuevo estado',{exact:false}).selectOption('En curso');await form().getByLabel('Nota de avance, entrega o motivo',{exact:false}).fill('Retomar esta tarea desde la ficha de su proyecto.');await form().getByRole('button',{name:'Guardar cambios',exact:true}).click();await form().waitFor({state:'hidden'});
   const persisted=state.data.tasks.find(t=>t.id===group.finishedId);assert.equal(persisted.status,'En curso');assert.equal(persisted.completedAt,null);assert.equal(persisted.projectId,group.projectId);
   await taskSheet.locator('.task-detail-meta').getByRole('button',{name:group.projectName,exact:true}).click();await commonSheet().getByRole('heading',{name:group.projectName,exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();
   const pending=commonSheet().getByRole('region',{name:'Pendientes',exact:true}),finished=commonSheet().getByRole('region',{name:'Finalizadas',exact:true});await pending.locator('.task-name').filter({hasText:group.finished}).waitFor();
   assert.deepEqual((await pending.locator('.task-name strong').allTextContents()).sort(),[group.pending,group.finished].sort());assert.deepEqual(await finished.locator('.task-name strong').allTextContents(),[group.archived]);assert.equal(await commonSheet().getByRole('region',{name:'Canceladas',exact:true}).locator('.task-name').filter({hasText:group.cancelled}).count(),1);
   assert.equal(await pending.getByRole('button',{name:'Actualizar estado de '+group.finished,exact:true}).getByText('En curso',{exact:true}).count(),1);assert.equal(await commonSheet().locator('.task-name').filter({hasText:unrelatedTask}).count(),0);
   await closeProjectSheets(group.projectId);
  }
 });
 await check('Ambas fichas mantienen las mismas pestañas y no desbordan en móvil',async()=>{
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
  for(const [name,source]of [['Proyecto propio para comparar fichas','local'],['Proyecto sin favorito','shared']]){await manager().getByRole('button',{name:'Abrir '+name,exact:true}).click();await commonSheet().getByRole('heading',{name,exact:true}).waitFor();assert.deepEqual(await commonSheet().getByRole('tab').allTextContents(),['Resumen','Tareas','Actividad']);assert.ok(await commonSheet().evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-results/portfolio-common-'+source+'-mobile.png',fullPage:true});await commonSheet().getByRole('button',{name:'Más secciones del proyecto',exact:true}).click();await commonSheet().locator('.project-sheet-more>summary').press('Escape');assert.equal(await commonSheet().isVisible(),true);await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();const group=taskGroups.find(g=>g.projectName===name);const finalRow=commonSheet().getByRole('region',{name:'Finalizadas',exact:true}).getByRole('button',{name:'Abrir '+group.archived,exact:true});await finalRow.waitFor();assert.equal(await finalRow.count(),1);await finalRow.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/portfolio-project-tasks-'+source+'-mobile.png',fullPage:true});assert.ok(await commonSheet().locator('.project-task-groups').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(await commonSheet().evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth+1));await closeProjectSheets(group.projectId);}
 });

 await page.setViewportSize({width:1440,height:1000});
 await check('Proyectos abre en Activos, oculta también subproyectos finalizados y permite consultar Todos los estados',async()=>{
  const done=project('finished-parent','Proyecto finalizado de prueba');done.manual_status='finished';
  const child=project('open-under-finished','Seguimiento abierto bajo proyecto finalizado',false,done.id);
  const closedChild=project('finished-child','Subproyecto finalizado de prueba',false,'alpha');closedChild.manual_status='finished';
  data.projects.push(done,child,closedChild);
  const before=JSON.stringify(data.projects),writes=mutationCount;
  await reset();await scope().getByRole('button',{name:'Todos los proyectos',exact:true}).click();await more();await manager().getByRole('button',{name:'Actualizar proyectos',exact:true}).click();
  await manager().getByRole('button',{name:'Abrir Seguimiento abierto bajo proyecto finalizado',exact:true}).waitFor();await filters();
  const status=manager().getByRole('combobox',{name:'Filtrar estado de proyecto',exact:true});assert.equal(await status.inputValue(),'open');
  assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto finalizado de prueba',exact:true}).count(),0);assert.equal(await manager().getByRole('button',{name:'Abrir Subproyecto finalizado de prueba',exact:true}).count(),0);
  await status.selectOption('');await manager().getByRole('button',{name:'Abrir Proyecto finalizado de prueba',exact:true}).waitFor();
  await status.selectOption('finished');await manager().getByRole('button',{name:'Abrir Proyecto finalizado de prueba',exact:true}).waitFor();
  await reset();await manager().getByRole('button',{name:'Abrir Seguimiento abierto bajo proyecto finalizado',exact:true}).waitFor();assert.equal(await manager().getByRole('button',{name:'Abrir Proyecto finalizado de prueba',exact:true}).count(),0);
  assert.equal(JSON.stringify(data.projects),before);assert.equal(mutationCount,writes);
  await page.screenshot({path:'test-results/portfolio-active-projects.png',fullPage:true});
 });
 await check('Cada referente conserva su color en la lista, el encabezado del proyecto y sus tareas',async()=>{
  const row=manager().getByRole('row').filter({has:page.getByRole('button',{name:'Abrir Proyecto propio para comparar fichas',exact:true})}),avatar=row.locator('[data-label="Referente DU"] .person-avatar');
  const color=await avatar.evaluate(element=>getComputedStyle(element).backgroundColor);
  await row.getByRole('button',{name:'Abrir Proyecto propio para comparar fichas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Proyecto propio para comparar fichas',exact:true}).waitFor();
  const heading=commonSheet().locator('.project-sheet-lead .person-avatar');assert.equal(await heading.getAttribute('title'),'Persona 05');assert.equal(await heading.evaluate(element=>getComputedStyle(element).backgroundColor),color);
  await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();
  for(const avatar of await commonSheet().locator('.task-row .person-avatar[data-person="persona05"]').all())assert.equal(await avatar.evaluate(element=>getComputedStyle(element).backgroundColor),color);
  await commonSheet().getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  const avatars=await manager().locator('[data-label="Referente DU"] .person-avatar[data-person]').evaluateAll(elements=>elements.map(element=>({id:element.dataset.person,color:getComputedStyle(element).backgroundColor}))),colors=new Map();
  for(const avatar of avatars){if(colors.has(avatar.id))assert.equal(colors.get(avatar.id),avatar.color);else colors.set(avatar.id,avatar.color);}
  assert.ok(colors.size>1);assert.equal(new Set(colors.values()).size,colors.size);
 });
 await check('Las tareas dentro del proyecto usan solo lista y no repiten códigos ni el nombre del proyecto',async()=>{
  for(const group of taskGroups){
   await manager().getByRole('button',{name:'Abrir '+group.projectName,exact:true}).click();await commonSheet().getByRole('heading',{name:group.projectName,exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();
   assert.equal(await commonSheet().getByRole('button',{name:'Vista tablero',exact:true}).count(),0);assert.equal(await commonSheet().locator('.task-board').count(),0);assert.equal(await commonSheet().locator('.task-name small').count(),0);assert.doesNotMatch(await commonSheet().locator('.project-task-groups').innerText(),/\bT\d+\b/);
   await page.screenshot({path:'test-results/portfolio-clean-task-list-'+(group.projectId.startsWith('gestion:')?'shared':'local')+'.png',fullPage:true});
   await closeProjectSheets(group.projectId);
  }
 });
 await check('Tocar el fondo cierra toda la ficha propia o compartida, conserva filtros y evita cierres al arrastrar desde adentro',async()=>{
  for(const group of taskGroups){
   const before=JSON.stringify(state.data),query=await manager().getByRole('textbox',{name:'Filtrar proyectos',exact:true}).inputValue(),area=await areaButtons().locator('[aria-pressed="true"]').textContent();
   await manager().getByRole('button',{name:'Abrir '+group.projectName,exact:true}).click();await commonSheet().getByRole('heading',{name:group.projectName,exact:true}).waitFor();await commonSheet().getByRole('tab',{name:'Tareas',exact:true}).click();await commonSheet().getByRole('heading',{name:'Tareas de seguimiento DU',exact:true}).waitFor();
   const bounds=await commonSheet().boundingBox();await page.mouse.move(bounds.x+50,bounds.y+100);await page.mouse.down();await page.mouse.move(20,300);await page.mouse.up();assert.equal(await commonSheet().isVisible(),true);
   await page.mouse.click(20,300);await commonSheet().waitFor({state:'hidden'});assert.equal(await page.locator('dialog.project-detail[open]').count(),0);
   assert.equal(await manager().getByRole('textbox',{name:'Filtrar proyectos',exact:true}).inputValue(),query);assert.equal(await areaButtons().locator('[aria-pressed="true"]').textContent(),area);assert.equal(JSON.stringify(state.data),before);
  }
 });
 await check('Un formulario abierto mantiene el foco y tocar su fondo no cierra el proyecto',async()=>{
  await manager().getByRole('button',{name:'Abrir Proyecto propio para comparar fichas',exact:true}).click();await commonSheet().getByRole('button',{name:'Agregar actualización',exact:true}).click();await form().waitFor();await page.mouse.click(20,300);assert.equal(await form().isVisible(),true);assert.equal(await commonSheet().count(),1);await form().getByRole('button',{name:'Cancelar',exact:true}).click();await form().waitFor({state:'hidden'});await page.mouse.click(20,300);await commonSheet().waitFor({state:'hidden'});
 });
 await check('La búsqueda y Mi panel presentan los nombres de tareas sin sus códigos internos',async()=>{
  const task=state.data.tasks.find(task=>task.title==='Tarea del proyecto propio de prueba'),search=page.getByRole('textbox',{name:'Buscar en DU Equipo',exact:true});await search.fill(task.code);
  const result=page.locator('.search-result-tasks').filter({hasText:task.title});await result.waitFor();assert.equal((await result.innerText()).includes(task.code),false);await result.click();
  const taskSheet=page.locator('dialog.task-detail[open]');await taskSheet.getByRole('heading',{name:task.title,exact:true}).waitFor();assert.equal(await taskSheet.getByText('Código',{exact:true}).count(),0);assert.equal((await taskSheet.innerText()).includes(task.code),false);await taskSheet.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'Mi panel',exact:true}).click();await page.locator('.panel-task-row').first().waitFor();assert.doesNotMatch((await page.locator('.panel-task-row').allInnerTexts()).join(' '),/\bT\d+\b/);
 });

 assert.deepEqual(errors,[]);await writeFile('test-results/portfolio-browser.json',JSON.stringify({passed,errors},null,2));console.log('PASS '+passed.length+' recorridos de Proyectos');
}catch(error){await page.screenshot({path:'test-results/portfolio-failure.png',fullPage:true});console.log(await page.locator('main').innerText());throw error;}finally{await browser.close();}
