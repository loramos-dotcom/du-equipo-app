import {backupAuthRequest} from './backup-runtime.ts';
import {calendarRequest} from './calendar.ts';
import type {CalendarStore} from './calendar.ts';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {BackupStore} from './backup-runtime.ts';
import {api} from './api.ts';
import type {Store} from './api.ts';
import {requestAuth} from './auth.ts';
import type {TeamConfig} from './auth.ts';
import {authorizedMember} from '../shared/team.ts';
import {DomainError} from '../shared/domain.ts';
import {managementRequest,managementAuth,managementProjectCatalog} from './management.ts';

const json=(error:string,status:number)=>Response.json({error},{status});
const redirect=(path:string)=>new Response(null,{status:303,headers:{location:path}});
export async function teamRequest(request:Request,config:TeamConfig,store:Store,authFactory=requestAuth){
 const url=new URL(request.url),auth=authFactory(request,config);
 let response:Response;
 try{
  if(url.origin!==config.origin)return auth.finish(json('Origen no permitido.',403));
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==config.origin)return auth.finish(json('Origen no permitido.',403));
  if(url.pathname==='/api/access'&&request.method==='GET')return auth.finish(Response.json({mode:'team',provider:'google',configured:true,loginUrl:'/auth/login'}));
  if(url.pathname==='/auth/login'&&request.method==='GET')return auth.finish(redirect(await auth.login()));
  if(url.pathname==='/auth/logout'&&request.method==='POST'){
   let response=new Response(null,{status:204});
   if((request.headers.get('cookie')??'').includes('du-gestion')){const board=managementAuth(request,config);await board.logout();response=board.finish(response);}
   await auth.logout();return auth.finish(response);
  }
  if(url.pathname.startsWith('/api/calendar/')||url.pathname.startsWith('/auth/calendar/')){
   const identity=await auth.identity();if(!identity){if(url.pathname==='/auth/calendar/login'){const response=redirect('/auth/login');response.headers.append('set-cookie',serializeCookieHeader('du-calendar-next','1',{httpOnly:true,secure:true,sameSite:'lax',path:'/auth',maxAge:600}));return auth.finish(response);}return auth.finish(json('Ingresá con tu cuenta institucional.',401));}
   const membership=store.loadAccess?await store.loadAccess(config.workspaceId):await store.load(config.workspaceId);if(!membership)throw new DomainError('El espacio no está disponible.',503);const member=authorizedMember(membership,identity);return auth.finish(await calendarRequest(request,identity,member,store as CalendarStore,process.env));
  }
  if(url.pathname.startsWith('/api/backups/')||url.pathname.startsWith('/auth/backups/')){
   const identity=await auth.identity();if(!identity){if(url.pathname==='/auth/backups/login'){const response=redirect('/auth/login');response.headers.append('set-cookie',serializeCookieHeader('du-backup-next','1',{httpOnly:true,secure:true,sameSite:'lax',path:'/auth',maxAge:600}));return auth.finish(response);}return auth.finish(json('Ingresá con tu cuenta institucional.',401));}const membership=store.loadAccess?await store.loadAccess(config.workspaceId):await store.load(config.workspaceId);if(!membership)throw new DomainError('El espacio no está disponible.',503);authorizedMember(membership,identity);return auth.finish(await backupAuthRequest(request,identity,store as BackupStore,process.env));
  }
  if(url.pathname.startsWith('/api/gestion/')||url.pathname.startsWith('/auth/gestion/')){
   const identity=await auth.identity();if(!identity)return auth.finish(json('Ingresá con tu cuenta institucional de Google.',401));
   const state=store.loadAccess?await store.loadAccess(config.workspaceId):await store.load(config.workspaceId);if(!state)throw new DomainError('El espacio todavía no está habilitado.',503);
   const member=authorizedMember(state,identity);
   return auth.finish(await managementRequest(request,config,identity,undefined,undefined,member.role==='Coordinación'));
  }
  if(url.pathname==='/auth/callback'&&request.method==='GET'){
   const code=url.searchParams.get('code');if(!code||url.searchParams.has('error'))throw new DomainError('No se pudo completar el acceso con Google.',401);
   await auth.exchange(code);
   const identity=await auth.identity();if(!identity)throw new DomainError('Google debe verificar tu correo institucional.',401);
   const state=await store.load(config.workspaceId);if(!state)throw new DomainError('El espacio todavía no está habilitado.',503);
   authorizedMember(state,identity);
   // Binding and its audit event are persisted atomically by the common API.
   response=await api(new Request(config.origin+'/api/state',{headers:request.headers}),store,config.workspaceId,{mode:'team',identity});
   if(!response.ok)throw new DomainError('No pudimos confirmar el ingreso. Reintentá.',response.status);
   const continueCalendar=parseCookieHeader(request.headers.get('cookie')??'').some(c=>c.name==='du-calendar-next'&&c.value==='1');if(continueCalendar){const next=redirect('/auth/calendar/login');next.headers.append('set-cookie',serializeCookieHeader('du-calendar-next','',{httpOnly:true,secure:true,sameSite:'lax',path:'/auth',maxAge:0}));return auth.finish(next);}
   const continueBackup=parseCookieHeader(request.headers.get('cookie')??'').some(c=>c.name==='du-backup-next'&&c.value==='1');
   const next=redirect(continueBackup?'/auth/backups/login':'/auth/gestion/login?next=home');if(continueBackup)next.headers.append('set-cookie',serializeCookieHeader('du-backup-next','',{httpOnly:true,secure:true,sameSite:'lax',path:'/auth',maxAge:0}));return auth.finish(next);
  }
  if(!url.pathname.startsWith('/api/'))return auth.finish(json('Ruta no encontrada.',404));
  const identity=await auth.identity();
  if(identity){
   const access=store.loadAccess?await store.loadAccess(config.workspaceId):await store.load(config.workspaceId);if(!access)throw new DomainError('El espacio todavía no está habilitado.',503);authorizedMember(access,identity);
   let catalog:Awaited<ReturnType<typeof managementProjectCatalog>>|undefined;
   if(['/api/state','/api/command','/api/command-status','/api/export'].includes(url.pathname)&&(request.headers.get('cookie')??'').includes('du-gestion'))try{catalog=await managementProjectCatalog(request,config,identity);}catch{/* Shared references fail closed; independent DU work remains available. */}
   response=await api(request,store,config.workspaceId,{mode:'team',identity,membership:access,externalProjects:catalog?.rows});
   if(catalog)response=catalog.finish(response);
  }else response=json('Ingresá con tu cuenta institucional de Google.',401);
 }catch(e){
  if(url.pathname==='/auth/callback'){
   await auth.logout();return auth.finish(redirect('/?access='+((e instanceof DomainError&&e.status===403)?'denied':'failed')));
  }
  response=json(e instanceof DomainError?e.message:'El acceso institucional no está disponible. Reintentá.',e instanceof DomainError?e.status:503);
 }
 return auth.finish(response);
}
