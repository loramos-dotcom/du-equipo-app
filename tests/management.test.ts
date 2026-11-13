import {test} from 'node:test';import assert from 'node:assert/strict';
import type {User} from '@supabase/supabase-js';
import {managementRoute,managementRequest,managementAuth} from '../server/management.ts';
import {supabaseStore} from '../server/supabase-store.ts';
import {managementUrl,managementPublishableKey} from '../shared/management-config.ts';
import {teamRequest} from '../server/team.ts';import {institutionalState} from '../shared/team.ts';
import {flattenProjects,filterProjectTree,projectCatalog,projectPath} from '../src/gestion/domain/projectTree.ts';
import type {Project} from '../src/gestion/domain/types.ts';
const config={origin:'https://du.example.edu',supabaseUrl:'https://du-project.supabase.co',publishableKey:'sb_publishable_du_fixture',secretKey:'sb_secret_never_in_proxy',workspaceId:'management-test'};
const identity={id:'du-user',email:'persona05@bue.edu.ar',provider:'google' as const,verified:true as const};
const boardUser={id:'board-user',email:identity.email,email_confirmed_at:'2026-10-20',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{email:identity.email,email_verified:true}}]} as unknown as User;
function auth(user:User|null=boardUser){let cleared=false;return {user:async()=>user,session:async()=>({access_token:'private-board-jwt',refresh_token:'private-refresh'}),login:async(email:string)=>'https://accounts.google.com/login?login_hint='+encodeURIComponent(email),exchange:async(_code:string)=>{},logout:async()=>{cleared=true;},finish:(r:Response)=>r,get cleared(){return cleared;}};}
const proxy=(route:string,method='GET',body?:string)=>new Request(config.origin+'/api/gestion/proxy?route='+encodeURIComponent(route),{method,headers:{origin:config.origin,'content-type':'application/json',authorization:'Bearer forged-browser-token',apikey:'forged-browser-key'},...(body?{body}:{})});

test('nested subprojects count, filter and retain their ancestor context without changing original records',()=>{
 const grandchild={id:'grandchild',name:'Registro buscado',children:[]} as unknown as Project;
 const child={id:'child',name:'Subproyecto',children:[grandchild]} as unknown as Project;
 const parent={id:'parent',name:'Proyecto',children:[child]} as unknown as Project;
 assert.deepEqual(flattenProjects([parent]).map(p=>p.id),['parent','child','grandchild']);
 const matches=filterProjectTree([parent],p=>p.name==='Registro buscado');assert.deepEqual(flattenProjects(matches).map(p=>p.id),['parent','child','grandchild']);assert.notEqual(matches[0],parent);assert.equal(parent.children[0],child);
 assert.deepEqual(filterProjectTree([parent],p=>p.name==='No existe'),[]);
});

test('catalog groups each family once and opens the path to a matching nested subproject',()=>{
 const leaf={id:'leaf',children:[]} as unknown as Project;
 const sibling={id:'sibling',children:[]} as unknown as Project;
 const child={id:'child',children:[leaf,sibling]} as unknown as Project;
 const parent={id:'parent',children:[child]} as unknown as Project;
 const other={id:'other',children:[]} as unknown as Project;
 const tree=[parent,other],before=JSON.stringify(tree);
 const catalog=projectCatalog(tree,new Set(['leaf']));
 assert.deepEqual(catalog.groups.map(p=>p.id),['parent']);
 assert.deepEqual(flattenProjects(catalog.groups).map(p=>p.id),['parent','child','leaf']);
 assert.deepEqual([...catalog.ancestors],['parent','child']);
 assert.deepEqual(projectPath(tree,'leaf'),[parent,child,leaf]);
 assert.deepEqual(projectPath(tree,'other'),[other]);
 assert.deepEqual(projectPath(tree,'missing'),[]);
 assert.deepEqual(projectCatalog(tree,new Set()).groups,[]);
 const byParent=projectCatalog(tree,new Set(['parent']));
 assert.equal(byParent.groups[0],parent);assert.equal(byParent.ancestors.size,0);
 assert.equal(flattenProjects(byParent.groups).length,4);
 const full=projectCatalog(tree,new Set(flattenProjects(tree).map(p=>p.id)));
 assert.equal(full.groups.length,2);assert.equal(flattenProjects(full.groups).length,5);
 assert.equal(JSON.stringify(tree),before);
});

test('gateway permits only named project data, read-only access metadata and known invoker RPCs',()=>{
 for(const table of ['projects','project_updates','next_steps','next_step_owners','attachments','dashboard_favorites','indicators','milestones','budget_execution','special_views'])assert.equal(managementRoute('/rest/v1/'+table+'?select=*','GET').origin,managementUrl);
 assert.ok(managementRoute('/rest/v1/rpc/resolve_next_step','POST'));assert.ok(managementRoute('/functions/v1/generate-area-report','POST'));
 for(const [route,method] of [['/auth/v1/admin/users','GET'],['/rest/v1/du_workspaces','GET'],['/rest/v1/profiles','PATCH'],['/rest/v1/du_management_revisions','PATCH'],['/rest/v1/access_grants','DELETE'],['/rest/v1/rpc/arbitrary_sql','POST'],['/storage/v1/object/x','POST'],['//evil.example/rest/v1/projects','GET'],['/rest/v1/../auth/users','GET'],['/rest/v1/projects','PUT'],['/rest/v1/projects#evil','GET'],['/rest/v1/projects\\evil','GET']])assert.throws(()=>managementRoute(route,method));
});
test('authenticated proxy uses board user token, never administrative or client-supplied credentials',async()=>{
 let called=0;const a=auth();const r=await managementRequest(proxy('/rest/v1/projects?select=id'),config,identity,()=>a as any,async(input,init)=>{called++;assert.equal(String(input),managementUrl+'/rest/v1/projects?select=id');const h=new Headers(init?.headers);assert.equal(h.get('authorization'),'Bearer private-board-jwt');assert.equal(h.get('apikey'),managementPublishableKey);assert.notEqual(h.get('apikey'),config.secretKey);assert.equal(init?.redirect,'error');return new Response('[{"id":"canonical-id"}]',{headers:{'content-type':'application/json','content-range':'0-0/1'}});});
 assert.equal(called,1);assert.equal(r.status,200);assert.equal(r.headers.get('content-range'),'0-0/1');const text=await r.text();assert.match(text,/canonical-id/);assert.doesNotMatch(text,/private-board-jwt|private-refresh|sb_secret/);
});
test('different or unverified Google identity cannot read or mutate shared data',async()=>{
 for(const user of [null,{...boardUser,email:'persona01@bue.edu.ar'},{...boardUser,identities:[]},{...boardUser,identities:[{provider:'google',identity_data:{email:identity.email,email_verified:false}}]}])for(const method of ['GET','POST','PATCH','DELETE']){
  let called=false;const r=await managementRequest(proxy('/rest/v1/projects',method,method==='POST'?'{}':undefined),config,identity,()=>auth(user as User|null) as any,async()=>{called=true;return new Response();});assert.equal(r.status,403);assert.equal(called,false);
 }
});

test('an existing email account linked to verified Google keeps the same board identity',async()=>{
 const linked={...boardUser,app_metadata:{provider:'email',providers:['email','google']}};
 const r=await managementRequest(new Request(config.origin+'/auth/gestion/callback?code=ok'),config,identity,()=>auth(linked) as any);
 assert.equal(r.headers.get('location'),'/#Proyectos');
});

test('real SSR auth requires a server-verified OAuth session even when a Google identity is linked',async()=>{
 const linked={...boardUser,app_metadata:{provider:'email',providers:['email','google']}};
 for(const method of ['oauth','password','otp','recovery','missing']){
  const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iss:managementUrl+'/auth/v1',sub:linked.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),amr:method==='missing'?[]:[{method,timestamp:Math.floor(Date.now()/1000)}]})+'.'+Buffer.alloc(32).toString('base64url');
  const session={access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:linked};
  let validated=0;
  const a=managementAuth(new Request(config.origin+'/api/gestion/session',{headers:{cookie:'du-gestion=base64-'+encode(session)}}),config,async(input)=>{assert.equal(new URL(String(input)).pathname,'/auth/v1/user');validated++;return Response.json(linked);});
  const user=await a.user();assert.equal(user?.id??null,method==='oauth'?linked.id:null);assert.ok(validated>0);
 }
});
test('session check returns minimal verified identity and exposes no tokens',async()=>{
 const r=await managementRequest(new Request(config.origin+'/api/gestion/session'),config,identity,()=>auth() as any,async()=>Response.json([{projects_revision:0,portfolio_revision:0,access_revision:0}]));const payload=await r.json();assert.equal(payload.connected,true);assert.equal(payload.user.id,'board-user');assert.doesNotMatch(JSON.stringify(payload),/private-board-jwt|private-refresh|identities|secret/);
 const missing=await managementRequest(new Request(config.origin+'/api/gestion/session'),config,identity,()=>auth(null) as any);assert.deepEqual(await missing.json(),{connected:false,duEmail:identity.email});
});
test('upstream RLS denial is retained without retrying as an administrator',async()=>{
 let calls=0;const r=await managementRequest(proxy('/rest/v1/rpc/save_project_bundle','POST','{"payload":{}}'),config,identity,()=>auth() as any,async()=>{calls++;return Response.json({code:'42501',message:'No tenés permiso para editar este proyecto.'},{status:403});});assert.equal(calls,1);assert.equal(r.status,403);assert.equal((await r.json()).code,'42501');
});
test('overview reads shared priorities, alerts, steps and updates with the authenticated token; disconnected returns no records',async()=>{
 let calls=0;const response=await managementRequest(new Request(config.origin+'/api/gestion/overview'),config,identity,()=>auth() as any,async(input,init)=>{const url=new URL(String(input));if(url.pathname.endsWith('/du_management_revisions'))return Response.json([{projects_revision:0,portfolio_revision:0,access_revision:0}]);calls++;assert.equal(new Headers(init?.headers).get('authorization'),'Bearer private-board-jwt');assert.match(url.searchParams.get('select')??'',/projects!inner/);if(url.pathname.endsWith('/dashboard_favorites')){assert.equal(url.searchParams.get('order'),'sort_order.asc,project_id.asc');assert.match(url.searchParams.get('select')??'',/project_id,sort_order/);assert.doesNotMatch(url.searchParams.get('select')??'',/profiles|user_metadata|token|\*/);}return Response.json([{id:'shared-'+calls}]);});const body=await response.json();assert.equal(body.connected,true);assert.equal(calls,4);assert.equal(body.priorities.length,1);assert.equal(body.issues.length,1);assert.equal(body.steps.length,1);assert.equal(body.updates.length,1);const cached=await managementRequest(new Request(config.origin+'/api/gestion/overview',{headers:{'if-none-match':response.headers.get('etag')!}}),config,identity,()=>auth() as any,async()=>Response.json([{projects_revision:0,portfolio_revision:0,access_revision:0}]));assert.equal(cached.status,304);assert.equal(await cached.text(),'');assert.doesNotMatch(JSON.stringify(body),/private-board-jwt|private-refresh/);
 const disconnected=await managementRequest(new Request(config.origin+'/api/gestion/overview'),config,identity,()=>auth(null) as any);assert.deepEqual(await disconnected.json(),{connected:false,issues:[],steps:[],updates:[],priorities:[]});
});
test('invalid routes, oversized bodies and network failures do not trigger alternate writes',async()=>{
 let calls=0;const transport=async()=>{calls++;throw Error('offline');};
 for(const request of [proxy('/rest/v1/rpc/delete_everything','POST','{}'),proxy('/rest/v1/projects','POST','x'.repeat(1000001))])assert.ok([403,413].includes((await managementRequest(request,config,identity,()=>auth() as any,transport)).status));
 assert.equal(calls,0);assert.equal((await managementRequest(proxy('/rest/v1/projects','PATCH','{}'),config,identity,()=>auth() as any,transport)).status,503);assert.equal(calls,1);
});
test('callback rejects mismatched account, clears its session and never follows supplied return URL',async()=>{
 const a=auth({...boardUser,email:'other@bue.edu.ar'});const r=await managementRequest(new Request(config.origin+'/auth/gestion/callback?code=ok&next=https://evil.example'),config,identity,()=>a as any);assert.equal(a.cleared,true);assert.equal(r.headers.get('location'),'/?gestion=unavailable#Proyectos');
 const good=await managementRequest(new Request(config.origin+'/auth/gestion/callback?code=ok&next=https://evil.example'),config,identity,()=>auth() as any);assert.equal(good.headers.get('location'),'/#Proyectos');
});
test('management login uses separate PKCE, exact callback and secure HttpOnly cookies',async()=>{
 const a=managementAuth(new Request(config.origin+'/auth/gestion/login'),config);const url=new URL(await a.login(identity.email));assert.equal(url.searchParams.get('redirect_to'),config.origin+'/auth/gestion/callback');assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.equal(url.searchParams.get('login_hint'),identity.email);assert.equal(url.searchParams.get('scopes'),'openid email profile');const cookies=a.finish(new Response()).headers.getSetCookie().join(';');assert.match(cookies,/du-gestion/);assert.match(cookies,/HttpOnly/);assert.match(cookies,/Secure/);assert.match(cookies,/SameSite=Lax/);assert.doesNotMatch(cookies,/du-institutional/);
});

test('shared access automatically uses the existing Google session and accepts only fixed return pages',async()=>{
 const a=managementAuth(new Request(config.origin+'/auth/gestion/login'),config);
 const url=new URL(await a.login(identity.email,{next:'home'}));assert.equal(url.searchParams.get('prompt'),'none');assert.equal(a.returnPath(),'/#Inicio');assert.equal(a.interactive(),false);
 const invalid=managementAuth(new Request(config.origin+'/auth/gestion/login',{headers:{cookie:'du-gestion-next=https%3A%2F%2Fevil.example'}}),config);
 assert.equal(invalid.returnPath(),'/#Proyectos');await invalid.login(identity.email,{next:'https://evil.example',interactive:true});assert.equal(invalid.returnPath(),'/#Proyectos');assert.equal(invalid.interactive(),true);
});

test('Google interaction is requested only when required, once, without loops or an app connection step',async()=>{
 for(const interactive of [false,true])for(const error of ['interaction_required','server_error','access_denied']){
  const a={...auth(),next:()=> 'home' as const,returnPath:()=> '/#Inicio',interactive:()=>interactive,login:async(email:string,options:{interactive?:boolean;next?:string})=>{assert.equal(email,identity.email);assert.deepEqual(options,{interactive:true,next:'home'});return 'https://accounts.google.com/required-login';}};
  const r=await managementRequest(new Request(config.origin+'/auth/gestion/callback?error='+error),config,identity,()=>a as any);
  assert.equal(r.headers.get('location'),interactive?'/?gestion=unavailable#Inicio':'https://accounts.google.com/required-login');
 }
});
test('DU anonymous or inactive users and cross-origin unsafe requests cannot enter the gateway',async()=>{
 const state=institutionalState('management-test',{persona01:identity.email},identity.email);const store={load:async()=>state,create:async()=>{},save:async()=>false};const duAuth={identity:async()=>identity,login:async()=>'',exchange:async()=>{},logout:async()=>{},finish:(r:Response)=>r};
 assert.equal((await teamRequest(proxy('/rest/v1/projects'),config,store,()=>({...duAuth,identity:async()=>null}))).status,401);
 for(const method of ['POST','PATCH','DELETE']){const r=new Request(config.origin+'/api/gestion/proxy?route=%2Frest%2Fv1%2Fprojects',{method,headers:{origin:'https://evil.example'},body:'{}'});assert.equal((await teamRequest(r,config,store,()=>duAuth)).status,403);}
 state.data.members[0].active=false;assert.equal((await teamRequest(proxy('/rest/v1/projects'),config,store,()=>duAuth)).status,403);
});

test('membership projection reads only the current allowlist instead of downloading business data and audit history',async()=>{
 const store=supabaseStore({supabaseUrl:'https://du-fixture.supabase.co',secretKey:'sb_secret_fixture'},async(input)=>{const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/du_workspaces');assert.equal(url.searchParams.get('select'),'accessMode:payload->accessMode,members:payload->data->members');assert.equal(url.searchParams.get('id'),'eq.management-test');return Response.json([{accessMode:'institutional',members:[{id:'persona05',active:true,email:identity.email}]}]);});
 const access=await store.loadAccess!('management-test');assert.equal(access?.accessMode,'institutional');assert.equal(access?.data.members.length,1);assert.equal('audit' in access!,false);assert.equal('projects' in access!.data,false);
});

 test('an unreadable favorites query fails the summary without administrative fallback or a false zero',async()=>{let favorites=0;const response=await managementRequest(new Request(config.origin+'/api/gestion/overview'),config,identity,()=>auth() as any,async(input,init)=>{const url=new URL(String(input));assert.equal(new Headers(init?.headers).get('authorization'),'Bearer private-board-jwt');if(url.pathname.endsWith('/du_management_revisions'))return Response.json([{projects_revision:0,portfolio_revision:0,access_revision:0}]);if(url.pathname.endsWith('/dashboard_favorites')){favorites++;return Response.json({message:'denied'},{status:403});}return Response.json([]);});assert.equal(response.status,403);assert.equal(favorites,1);assert.equal('priorities' in await response.json(),false);});
