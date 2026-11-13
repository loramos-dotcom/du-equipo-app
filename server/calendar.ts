import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {DomainError,execute} from '../shared/domain.ts';
import {authorizedMember} from '../shared/team.ts';
import {mergeCalendarEvents} from '../shared/calendar.ts';
import type {CalendarChoice,TeamEvent} from '../shared/calendar.ts';
import type {VerifiedIdentity} from '../shared/team.ts';
import type {Row} from '../shared/model.ts';
import type {Store} from './api.ts';

export type CalendarConnection={memberId:string;email:string;sealed:string;selected:CalendarChoice[];events:TeamEvent[];syncedAt:string|null;syncError:string|null;revision:string};
export interface CalendarStore extends Store{
 readCalendar(workspace:string,memberId:string):Promise<CalendarConnection|null>;
 listCalendars(workspace:string):Promise<CalendarConnection[]>;
 saveCalendar(workspace:string,value:CalendarConnection,expected:string|null):Promise<boolean>;
 deleteCalendar(workspace:string,memberId:string,revision:string):Promise<boolean>;
}
type Config={origin:string;workspace:string;clientId:string;secret:string;key:string};
export const calendarScopes=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
export function calendarConfig(env:Record<string,string|undefined>):Config|null{const keys=['APP_ORIGIN','DU_WORKSPACE_ID','GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','DU_CALENDAR_SEAL_KEY'];if(keys.some(k=>!env[k]))return null;return {origin:env.APP_ORIGIN!,workspace:env.DU_WORKSPACE_ID!,clientId:env.GOOGLE_CALENDAR_CLIENT_ID!,secret:env.GOOGLE_CALENDAR_CLIENT_SECRET!,key:env.DU_CALENDAR_SEAL_KEY!};}
export function sealCalendar(value:unknown,key:string){const bytes=Buffer.from(key,'base64');if(bytes.length!==32)throw Error('calendar-key');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',bytes,iv);cipher.setAAD(Buffer.from('du-calendar-v1'));const body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(v=>v.toString('base64url')).join('.');}
export function openCalendar(value:string,key:string):any{const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64url')),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);cipher.setAAD(Buffer.from('du-calendar-v1'));cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(body),cipher.final()]).toString());}
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer'};
const redirect=(location:string,cookie?:string)=>new Response(null,{status:303,headers:{...headers,location,...(cookie?{'set-cookie':cookie}:{})}});
const cookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/auth/calendar',maxAge:600};
const iso=(value:string)=>new Date(value).toISOString().replace(/\.\d{3}Z$/,'Z');
const link=(value:unknown,hosts:string[])=>{try{const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password&&hosts.includes(url.hostname)?url.toString():'';}catch{return '';}};
export function normalizeCalendarEvent(raw:any,members:Row[]):TeamEvent|null{
 if(raw.status==='cancelled'||['private','confidential'].includes(raw.visibility)||raw.eventType&&raw.eventType!=='default'||raw.attendees?.some((a:any)=>a.self&&a.responseStatus==='declined'))return null;
 const allDay=!!raw.start?.date,start=raw.start?.date??raw.start?.dateTime,end=raw.end?.date??raw.end?.dateTime;
 if(!raw.id||!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end)))return null;
 const occurrence=raw.originalStartTime?.date??(raw.originalStartTime?.dateTime?iso(raw.originalStartTime.dateTime):''),identity=String(raw.iCalUID??raw.id)+'|'+occurrence;
 const emails=new Set([raw.organizer?.email,...(raw.attendees??[]).filter((a:any)=>a.responseStatus!=='declined').map((a:any)=>a.email)].filter(Boolean).map((email:string)=>email.toLowerCase()));
 return {id:createHash('sha256').update(identity).digest('hex'),title:String(raw.summary??'Reunión sin título'),start:allDay?start:iso(start),end:allDay?end:iso(end),allDay,location:String(raw.location??''),url:link(raw.htmlLink,['calendar.google.com','www.google.com']),meetUrl:link(raw.hangoutLink,['meet.google.com']),updated:raw.updated??'',memberIds:members.filter(m=>m.active&&emails.has(String(m.email).toLowerCase())).map(m=>m.id)};
}
async function google(transport:typeof fetch,url:string|URL,init:RequestInit={}){const response=await transport(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new DomainError(response.status===401||response.status===400?'Google requiere volver a conectar tu calendario.':'No se pudo consultar Google Calendar. Reintentá actualizar.',response.status===401||response.status===400?409:503);return response.json();}
function calendarCredential(config:Config,connection:CalendarConnection){const credential=openCalendar(connection.sealed,config.key);if(credential?.email!==connection.email||typeof credential.refreshToken!=='string'||!credential.refreshToken)throw Error('calendar-identity');return credential;}
async function accessToken(config:Config,connection:CalendarConnection,transport:typeof fetch){const credential=calendarCredential(config,connection);const tokens=await google(transport,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:credential.refreshToken,client_id:config.clientId,client_secret:config.secret})});if(!tokens.access_token)throw Error('calendar-token');return String(tokens.access_token);}
async function calendarChoices(token:string,transport:typeof fetch){const calendars:CalendarChoice[]=[],seen=new Set<string>();let page='';do{const url=new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');url.search=new URLSearchParams({minAccessRole:'reader',maxResults:'250',...(page?{pageToken:page}:{})}).toString();const result=await google(transport,url,{headers:{authorization:'Bearer '+token}});for(const c of result.items??[])if(c.id&&!c.deleted)calendars.push({id:c.id,name:c.summaryOverride??c.summary??c.id,primary:!!c.primary});page=result.nextPageToken??'';if(page&&seen.has(page))throw Error('calendar-pagination');seen.add(page);}while(page);return calendars;}
export async function syncCalendar(store:CalendarStore,config:Config,connection:CalendarConnection,members:Row[],transport:typeof fetch=fetch,now=new Date()){
 if(!connection.selected.length)return null;
 const credential=calendarCredential(config,connection),attempts=[credential.syncAttemptedAt,connection.syncedAt].map(value=>typeof value==='string'?Date.parse(value):NaN).filter(Number.isFinite),latest=attempts.length?Math.max(...attempts):null;
 if(latest!==null&&now.getTime()-latest<300000)return null;
 // The encrypted credential already persists through the existing CAS RPC. Reserve
 // before contacting Google so failures and concurrent/forced refreshes share a limit.
 const claimed={...connection,sealed:sealCalendar({...credential,syncAttemptedAt:now.toISOString()},config.key),revision:crypto.randomUUID()};
 if(!await store.saveCalendar(config.workspace,claimed,connection.revision))return null;
 try{
  const token=await accessToken(config,claimed,transport),events:TeamEvent[]=[],timeMin=new Date(now.getTime()-180*86400000).toISOString(),timeMax=new Date(now.getTime()+365*86400000).toISOString();
  for(const calendar of claimed.selected){let page='';const seen=new Set<string>();do{const url=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar.id)+'/events');url.search=new URLSearchParams({timeMin,timeMax,singleEvents:'true',orderBy:'startTime',maxResults:'2500',timeZone:'America/Argentina/Buenos_Aires',...(page?{pageToken:page}:{})}).toString();const result=await google(transport,url,{headers:{authorization:'Bearer '+token}});for(const raw of result.items??[]){const event=normalizeCalendarEvent(raw,members);if(event)events.push(event);}page=result.nextPageToken??'';if(page&&seen.has(page))throw Error('calendar-pagination');seen.add(page);}while(page);}
  const next={...claimed,events:mergeCalendarEvents([{memberId:claimed.memberId,events}]),syncedAt:now.toISOString(),syncError:null,revision:crypto.randomUUID()};if(!await store.saveCalendar(config.workspace,next,claimed.revision))throw new DomainError('Tu conexión cambió durante la actualización. Volvé a cargar.',409);return next;
 }catch(error){
  await store.saveCalendar(config.workspace,{...claimed,syncError:'No se pudo actualizar. Volvé a conectar o actualizá tu calendario.',revision:crypto.randomUUID()},claimed.revision);
  throw error;
 }
}
export async function syncTeamCalendars(store:CalendarStore,env:Record<string,string|undefined>,transport:typeof fetch=fetch,_force=false){
 const config=calendarConfig(env);if(!config)return {status:'Pendiente de configuración',updated:0,errors:0};
 const access=store.loadAccess?await store.loadAccess(config.workspace):await store.load(config.workspace);if(!access)throw Error('calendar-workspace');const members=access.data.members,connections=(await store.listCalendars(config.workspace)).filter(c=>c.selected.length&&members.some(m=>m.active&&m.id===c.memberId&&m.email?.toLowerCase()===c.email.toLowerCase()));let updated=0,errors=0,skipped=0;
 for(let i=0;i<connections.length;i+=3)await Promise.all(connections.slice(i,i+3).map(async connection=>{try{if(await syncCalendar(store,config,connection,members,transport))updated++;else skipped++;}catch{errors++;}}));
 return {status:errors?'Completado con observaciones':updated?'Actualizado':skipped?'Las agendas se actualizan como máximo cada cinco minutos.':'No hay calendarios compartidos.',updated,errors,skipped};
}
export async function calendarRequest(request:Request,identity:VerifiedIdentity,member:Row,store:CalendarStore,env:Record<string,string|undefined>,transport:typeof fetch=fetch){
 const url=new URL(request.url),config=calendarConfig(env),workspace=env.DU_WORKSPACE_ID!;
 if(!['GET','POST'].includes(request.method))throw new DomainError('Método no permitido.',405);
 if(request.method==='POST'&&!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('Se requiere JSON.',400);
 if(!config){if(url.pathname==='/api/calendar/status')return Response.json({configured:false,connected:false},{headers});throw new DomainError('La conexión con Google Calendar todavía debe configurarse.',503);}
 if(url.pathname==='/auth/calendar/login'){
  const nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url'),state=sealCalendar({email:identity.email,memberId:member.id,nonce,verifier,expires:Date.now()+600000},config.key),target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.origin+'/auth/calendar/callback',response_type:'code',scope:'openid email '+calendarScopes.join(' '),include_granted_scopes:'false',access_type:'offline',prompt:'select_account consent',login_hint:identity.email,hd:'bue.edu.ar',state:nonce,code_challenge:challenge,code_challenge_method:'S256'}).toString();return redirect(target.toString(),serializeCookieHeader('du-calendar-oauth',state,cookieOptions));
 }
 if(url.pathname==='/auth/calendar/callback'){
  const clear=serializeCookieHeader('du-calendar-oauth','',{...cookieOptions,maxAge:0});
  try{const cookie=parseCookieHeader(request.headers.get('cookie')??'').find(c=>c.name==='du-calendar-oauth')?.value;if(!cookie||url.searchParams.has('error')||!url.searchParams.get('code'))throw Error('calendar-state');const stored=openCalendar(cookie,config.key),nonce=Buffer.from(stored.nonce),received=Buffer.from(url.searchParams.get('state')??'');if(stored.expires<Date.now()||stored.email!==identity.email||stored.memberId!==member.id||nonce.length!==received.length||!timingSafeEqual(nonce,received))throw Error('calendar-state');
   const tokens=await google(transport,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:config.origin+'/auth/calendar/callback',client_id:config.clientId,client_secret:config.secret,code_verifier:stored.verifier})});if(!tokens.refresh_token||calendarScopes.some(scope=>!String(tokens.scope??'').split(' ').includes(scope)))throw Error('calendar-scope');const user=await google(transport,'https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+tokens.access_token}});if(user.email_verified!==true||String(user.email).toLowerCase()!==identity.email.toLowerCase())throw Error('calendar-account');
   const previous=await store.readCalendar(workspace,member.id);let syncAttemptedAt:unknown;
   if(previous)try{syncAttemptedAt=calendarCredential(config,previous).syncAttemptedAt;}catch{/* Reauthorization can repair an obsolete encrypted credential. */}
   const next:CalendarConnection={memberId:member.id,email:identity.email,sealed:sealCalendar({email:identity.email,refreshToken:tokens.refresh_token,...(typeof syncAttemptedAt==='string'?{syncAttemptedAt}:{})},config.key),selected:previous?.selected??[],events:previous?.events??[],syncedAt:previous?.syncedAt??null,syncError:null,revision:crypto.randomUUID()};if(!await store.saveCalendar(workspace,next,previous?.revision??null))throw Error('calendar-conflict');return redirect('/?calendar=connected#Mi%20semana',clear);
  }catch{return redirect('/?calendar=failed#Mi%20semana',clear);}
 }
 const saved=await store.readCalendar(workspace,member.id),own=saved?.memberId===member.id&&saved.email.toLowerCase()===identity.email.toLowerCase()?saved:null;
 if(url.pathname==='/api/calendar/status')return Response.json({configured:true,connected:!!own,memberId:member.id,accountEmail:identity.email,email:own?.email,selected:own?.selected??[],syncedAt:own?.syncedAt,syncError:own?.syncError},{headers});
 const access=store.loadAccess?await store.loadAccess(workspace):await store.load(workspace);if(!access)throw Error('calendar-workspace');const members=access.data.members;
 if(url.pathname==='/api/calendar/events'){
  const connections=(await store.listCalendars(workspace)).filter(c=>members.some(m=>m.active&&m.id===c.memberId&&m.email?.toLowerCase()===c.email.toLowerCase()));
  return Response.json({events:mergeCalendarEvents(connections.map(c=>({memberId:c.memberId,events:c.events}))),connections:connections.map(c=>({memberId:c.memberId,syncedAt:c.syncedAt,syncError:c.syncError}))},{headers});
 }
 if(url.pathname==='/api/calendar/refresh'&&request.method==='POST'){const body=await request.json(),result=await syncTeamCalendars(store,env,transport,body.force===true);return Response.json(result,{headers});}
 if(url.pathname==='/api/calendar/minutes'&&request.method==='POST'){
  const raw=await request.text();if(raw.length>1000000)throw new DomainError('La solicitud es demasiado grande.',413);const body=JSON.parse(raw);if(!body||typeof body!=='object'||typeof body.id!=='string')throw new DomainError('La solicitud de minuta no es válida.',400);
  const command={id:body.id,kind:'calendar_minutes',entityId:body.meetingId,expectedVersion:body.expectedVersion,data:{action:body.action,minutes:body.minutes,reason:body.reason}},connections=await store.listCalendars(workspace),event=mergeCalendarEvents(connections.filter(c=>members.some(m=>m.active&&m.id===c.memberId&&m.email?.toLowerCase()===c.email.toLowerCase())).map(c=>({memberId:c.memberId,events:c.events}))).find(e=>e.id===body.eventId);
  for(let attempt=0;attempt<4;attempt++){const state=await store.load(workspace);if(!state)throw Error('calendar-state');const actor=authorizedMember(state,identity),saved=execute(state,actor.id,command,new Date(),event?{calendarEvent:event}:undefined);if(await store.save(workspace,state.revision,saved.state))return Response.json({meeting:saved.state.data.meetings.find(m=>m.id===saved.result.id)},{headers});if(body.meetingId)break;}throw new DomainError('Hubo otra actualización. Conservá el texto y recargá la minuta.',409);
 }
 if(!own)throw new DomainError('Conectá primero tu Google Calendar.',409);
 if(url.pathname==='/api/calendar/calendars')return Response.json({calendars:await calendarChoices(await accessToken(config,own,transport),transport)},{headers});
 if(url.pathname==='/api/calendar/selection'&&request.method==='POST'){
  const body=await request.json();if(!Array.isArray(body.calendarIds)||body.calendarIds.some((id:unknown)=>typeof id!=='string'))throw new DomainError('Elegí calendarios válidos.',400);const choices=await calendarChoices(await accessToken(config,own,transport),transport),selected=choices.filter(c=>body.calendarIds.includes(c.id));if(new Set(body.calendarIds).size!==selected.length)throw new DomainError('El calendario elegido no está disponible en tu cuenta.',403);
  // Remove withdrawn calendars immediately, even if Google's next refresh fails.
  const changed={...own,selected,events:[],syncedAt:null,syncError:null,revision:crypto.randomUUID()};if(!await store.saveCalendar(workspace,changed,own.revision))throw new DomainError('Tu conexión cambió. Recargá antes de guardar.',409);const synced=selected.length?await syncCalendar(store,config,changed,members,transport):null;return Response.json({ok:true,syncPending:!!selected.length&&!synced},{headers});
 }
 if(url.pathname==='/api/calendar/sync'&&request.method==='POST'){await syncCalendar(store,config,own,members,transport);return Response.json({ok:true},{headers});}
 if(url.pathname==='/api/calendar/disconnect'&&request.method==='POST'){
  if(!await store.deleteCalendar(workspace,member.id,own.revision))throw new DomainError('Tu conexión cambió. Reintentá desconectar.',409);
  // Google revocation affects all OAuth clients of the Cloud project, including login and Drive.
  // Disconnect destroys this connection's encrypted credential and cache, without revoking unrelated grants.
  // https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
  return Response.json({ok:true},{headers});
 }
 throw new DomainError('Ruta de calendario no encontrada.',404);
}
