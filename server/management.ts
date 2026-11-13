import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {User} from '@supabase/supabase-js';
import type {TeamConfig} from './auth.ts';
import type {VerifiedIdentity} from '../shared/team.ts';
import {normalizeEmail} from '../shared/team.ts';
import {DomainError} from '../shared/domain.ts';
import {managementUrl,managementPublishableKey,managementReturnPaths} from '../shared/management-config.ts';
import type {ManagementPage} from '../shared/management-config.ts';
import {managementProjectRef} from '../shared/project-context.ts';
import type {Row} from '../shared/model.ts';
import {privateDataRevision,readStoredPrivateDataCheck} from './private-data-check.ts';

const readOnly=new Set(['areas','profiles','area_permissions','dashboard_permissions','access_grants','du_management_revisions','audit_log']);
const editable=new Set(['projects','project_areas','project_updates','next_steps','next_step_owners','attachments','dashboard_favorites','indicators','milestones','budget_execution','special_views']);
const procedures=new Set(['du_save_project_bundle','save_project_bundle','set_project_manual_status','resolve_project_update','resolve_next_step','set_dashboard_favorite','reorder_dashboard_favorites','set_access_grant','delete_access_grant']);
const methods=new Set(['GET','HEAD','POST','PATCH','DELETE']);
export function managementRoute(raw:string,method:string){
 if(!methods.has(method)||raw.length>24000||!raw.startsWith('/')||raw.startsWith('//')||raw.includes('\\')||/[\r\n#]/.test(raw))throw new DomainError('Operación de gestión no permitida.',403);
 const url=new URL(raw,managementUrl);
 if(url.origin!==managementUrl)throw new DomainError('Destino no permitido.',403);
 const path=url.pathname;
 const table=path.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
 const rpc=path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
 if(table&&(editable.has(table)||(readOnly.has(table)&&['GET','HEAD'].includes(method))))return url;
 if(rpc&&procedures.has(rpc)&&method==='POST')return url;
 if(path==='/functions/v1/generate-area-report'&&method==='POST')return url;
 throw new DomainError('Operación de gestión no permitida.',403);
}

export function managementAuth(request:Request,config:TeamConfig,transport:typeof fetch=fetch){
 const cookies=new Map(parseCookieHeader(request.headers.get('cookie')??'').map(c=>[c.name,c.value]));
 const pending=new Map<string,string>();
 const context=(name:string,value:string)=>{cookies.set(name,value);pending.set(name,serializeCookieHeader(name,value,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:300}));};
 const next=():ManagementPage=>Object.hasOwn(managementReturnPaths,cookies.get('du-gestion-next')??'')?cookies.get('du-gestion-next') as ManagementPage:'projects';
 const client=createServerClient(managementUrl,managementPublishableKey,{
  cookieOptions:{name:'du-gestion',httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:28800},global:{fetch:transport},
  cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:(items)=>{for(const {name,value,options} of items){cookies.set(name,value);pending.set(name,serializeCookieHeader(name,value,{...options,httpOnly:true,secure:true,sameSite:'lax',path:'/'}));}}}
 });
 return {
  async user(){
   const {data:{session},error:sessionError}=await client.auth.getSession();if(sessionError||!session)return null;
   // A linked Google identity does not prove this session used Google. Verify the signed
   // authentication method as well; accounts originally created with email remain eligible.
   const {data:verified,error:claimsError}=await client.auth.getClaims(session.access_token);
   if(claimsError||!verified?.claims||!verified.claims.amr?.some(method=>typeof method==='object'&&method!==null&&method.method==='oauth'))return null;
   const {data,error}=await client.auth.getUser(session.access_token);
   return error||verified.claims.sub!==data.user?.id?null:data.user;
  },
  async session(){const {data,error}=await client.auth.getSession();if(error||!data.session)throw new DomainError('Volvé a ingresar con Google para continuar.',401);return data.session;},
  async login(email:string,options:{interactive?:boolean;next?:string}={}){context('du-gestion-next',Object.hasOwn(managementReturnPaths,options.next??'')?options.next!:'projects');context('du-gestion-interactive',options.interactive?'1':'0');const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:config.origin+'/auth/gestion/callback',scopes:'openid email profile',queryParams:{hd:'bue.edu.ar',login_hint:email,prompt:options.interactive?'select_account':'none'},skipBrowserRedirect:true}});if(error||!data.url)throw new DomainError('No se pudo completar el ingreso al tablero.',503);return data.url;},
  next,returnPath:()=>managementReturnPaths[next()],interactive:()=>cookies.get('du-gestion-interactive')==='1',
  async exchange(code:string){const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw new DomainError('No se pudo completar la conexión con el tablero.',401);},
  async logout(){await client.auth.signOut({scope:'local'});for(const name of cookies.keys())if(name.startsWith('du-gestion'))pending.set(name,serializeCookieHeader(name,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0}));},
  finish(response:Response){const headers=new Headers(response.headers);headers.set('cache-control','private, no-store, max-age=0');headers.set('vary','Cookie');headers.set('x-content-type-options','nosniff');for(const value of pending.values())headers.append('set-cookie',value);return new Response(response.body,{status:response.status,headers});}
 };
}
type ManagementAuth=ReturnType<typeof managementAuth>;
function confirmedUser(user:User|null,identity:VerifiedIdentity){
 const email=normalizeEmail(user?.email??'');
 const google=user?.identities?.find(item=>item.provider==='google'&&item.identity_data?.email_verified===true&&normalizeEmail(item.identity_data.email??'')===email);
 if(!user?.id||!user.email_confirmed_at||!google||email!==identity.email)throw new DomainError('Conectá el tablero con la misma cuenta institucional que usás en DU Equipo.',403);
 return user!;
}
const redirect=(path:string)=>new Response(null,{status:303,headers:{location:path}});
async function managementRevision(token:string,transport:typeof fetch){
 const target=new URL('/rest/v1/du_management_revisions',managementUrl);target.search=new URLSearchParams({select:'projects_revision,portfolio_revision,access_revision',id:'eq.true'}).toString();
 const response=await transport(target,{headers:{apikey:managementPublishableKey,authorization:'Bearer '+token},redirect:'error'});
 if(!response.ok)throw new DomainError('No se pudo verificar el acceso al tablero.',response.status===401||response.status===403?response.status:503);
 const rows=await response.json();if(!Array.isArray(rows)||rows.length!==1)throw new DomainError('Tu cuenta no tiene acceso activo al tablero.',403);return rows[0];
}
export async function managementProjectCatalog(request:Request,config:TeamConfig,identity:VerifiedIdentity,transport:typeof fetch=fetch){
 const auth=managementAuth(request,config,transport);confirmedUser(await auth.user(),identity);const session=await auth.session();
 await managementRevision(session.access_token,transport);
 const rows:Row[]=[];
 for(let offset=0;;offset+=200){
  const target=new URL('/rest/v1/projects',managementUrl);target.search=new URLSearchParams({select:'id,name,objective,report_date,status,manual_status,version,primary_area:areas!projects_primary_area_id_fkey(area_key),project_areas(area:areas!project_areas_area_id_fkey(area_key))',order:'id.asc',limit:'200',offset:String(offset)}).toString();
  const response=await transport(target,{headers:{apikey:managementPublishableKey,authorization:'Bearer '+session.access_token},redirect:'error'});
  if(!response.ok)throw new DomainError('No se pudo consultar el catálogo compartido.',503);
  const page=await response.json();if(!Array.isArray(page))throw new DomainError('Respuesta de proyectos inválida.',503);
  for(const p of page){const relation=(value:any)=>Array.isArray(value)?value:value?[value]:[],areaKeys=[...new Set([...relation(p.primary_area),...relation(p.project_areas).flatMap((r:any)=>relation(r.area))].map((area:any)=>area.area_key).filter(Boolean))];rows.push({id:managementProjectRef(p.id),sourceId:p.id,external:true,version:1,sourceVersion:p.version,areaKeys,title:p.name,outcome:p.objective??'',description:'Proyecto compartido con el Tablero de Gestión.',status:p.manual_status==='finished'||p.status==='finished'?'Finalizado':'Activo',delivery:'Sin evaluar',reviewedAt:p.report_date,nextStep:'Consultar próximos pasos en el proyecto compartido',nextDate:null,documents:[],tags:[]});}
  if(page.length<200)break;
 }
 return {rows,finish:auth.finish};
}
export async function managementRequest(request:Request,config:TeamConfig,identity:VerifiedIdentity,makeAuth:(r:Request,c:TeamConfig)=>ManagementAuth=managementAuth,transport:typeof fetch=fetch,canViewTeamIssues=true){
 const url=new URL(request.url),auth=makeAuth(request,config);
 try{
  if(url.pathname==='/auth/gestion/login'&&request.method==='GET')return auth.finish(redirect(await auth.login(identity.email,{interactive:url.searchParams.get('interactive')==='1',next:url.searchParams.get('next')??undefined})));
  if(url.pathname==='/auth/gestion/logout'&&request.method==='POST'){await auth.logout();return auth.finish(new Response(null,{status:204}));}
  if(url.pathname==='/auth/gestion/callback'&&request.method==='GET'){
   const code=url.searchParams.get('code');if(!code||url.searchParams.has('error'))throw new DomainError('No se pudo completar la conexión.',401);
   await auth.exchange(code);confirmedUser(await auth.user(),identity);return auth.finish(redirect(auth.returnPath?.()??managementReturnPaths.projects));
  }
  if(url.pathname==='/api/gestion/session'&&request.method==='GET'){
   const user=await auth.user();if(!user)return auth.finish(Response.json({connected:false,duEmail:identity.email}));confirmedUser(user,identity);
   await managementRevision((await auth.session()).access_token,transport);
   return auth.finish(Response.json({connected:true,duEmail:identity.email,user:{id:user.id,email:user.email,app_metadata:{provider:'google'}}}));
  }
  if(url.pathname==='/api/gestion/security-check'){
   if(request.method!=='GET')return auth.finish(Response.json({error:'Usá GET para consultar esta comprobación.'},{status:405,headers:{allow:'GET','cache-control':'private, no-store'}}));
   const user=await auth.user();if(!user)throw new DomainError('Ingresá con tu cuenta institucional para comprobar los datos privados.',401);
   confirmedUser(user,identity);const session=await auth.session();
   const before=privateDataRevision(await managementRevision(session.access_token,transport));
   const report=await readStoredPrivateDataCheck(session.access_token,transport);
   const after=privateDataRevision(await managementRevision(session.access_token,transport));
   if(before!==after)throw new DomainError('Los datos cambiaron durante la comprobación. Reintentá.',409);
   return auth.finish(Response.json({...report,dataSource:'supabase',privateReferenceConfigured:false},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}}));
  }
  if(url.pathname==='/api/gestion/overview'&&request.method==='GET'){
   const user=await auth.user();if(!user)return auth.finish(Response.json({connected:false,issues:[],steps:[],updates:[],priorities:[]}));confirmedUser(user,identity);const session=await auth.session();
   const version=await managementRevision(session.access_token,transport),etag='"du-overview-v3-'+version.projects_revision+'-'+version.portfolio_revision+'-'+version.access_revision+'-'+canViewTeamIssues+'"';
   if(request.headers.get('if-none-match')===etag)return auth.finish(new Response(null,{status:304,headers:{etag}}));
   const query=async(table:string,params:Record<string,string>)=>{const target=new URL('/rest/v1/'+table,managementUrl);target.search=new URLSearchParams(params).toString();const response=await transport(target,{headers:{apikey:managementPublishableKey,authorization:'Bearer '+session.access_token},redirect:'error'});if(!response.ok)throw new DomainError('No se pudo actualizar el resumen del tablero.',response.status===401||response.status===403?response.status:503);return response.json();};
   const [issues,steps,updates,priorities]=await Promise.all([
    query('project_updates',{select:'id,project_id,report_date,update_type,detail,resolved,project:projects!inner(id,name)',resolved:'eq.false',update_type:'in.(Alerta/Bloqueo,Pendiente)',order:'report_date.desc'}),
    query('next_steps',{select:'id,project_id,task,due_date,resolved,project:projects!inner(id,name),next_step_owners(owner_label)',resolved:'eq.false',order:'due_date.asc.nullslast'}),
    query('project_updates',{select:'id,project_id,report_date,update_type,detail,resolved,project:projects!inner(id,name)',update_type:'in.(Avance,Información)',order:'report_date.desc,created_at.desc',limit:'3'}),
    query('dashboard_favorites',{select:'project_id,sort_order,project:projects!inner(id,parent_id,kind,name,objective,dg_go,report_date)',order:'sort_order.asc,project_id.asc'})
   ]);return auth.finish(Response.json({connected:true,issues:canViewTeamIssues?issues:[],steps,updates,priorities},{headers:{etag}}));
  }
  if(url.pathname!=='/api/gestion/proxy')return auth.finish(Response.json({error:'Ruta no encontrada.'},{status:404}));
  const target=managementRoute(url.searchParams.get('route')??'',request.method);
  confirmedUser(await auth.user(),identity);
  const session=await auth.session();
  const headers=new Headers({apikey:managementPublishableKey,authorization:'Bearer '+session.access_token});
  for(const key of ['content-type','accept','prefer','range','range-unit']){const value=request.headers.get(key);if(value)headers.set(key,value);}
  // The authenticated user's JWT is forwarded; RLS and invoker RPCs enforce their own current permissions.
  const body=['GET','HEAD'].includes(request.method)?undefined:await request.text();
  if(body&&new TextEncoder().encode(body).length>1000000)throw new DomainError('La solicitud supera el tamaño permitido.',413);
  const upstream=await transport(target,{method:request.method,headers,body,redirect:'error'});
  const outputHeaders=new Headers();for(const key of ['content-type','content-range','preference-applied','range-unit']){const value=upstream.headers.get(key);if(value)outputHeaders.set(key,value);}
  return auth.finish(new Response(upstream.body,{status:upstream.status,headers:outputHeaders}));
 }catch(error){
  if(url.pathname==='/auth/gestion/callback'){
   const next=auth.next?.()??'projects',path=auth.returnPath?.()??managementReturnPaths.projects;
   const interactive=auth.interactive?.()??true;
   await auth.logout();
   // Supabase can wrap a provider's interaction_required as a generic server_error.
   // Retry provider errors interactively once; missing codes and identity mismatches never retry.
   if(!interactive&&url.searchParams.has('error'))return auth.finish(redirect(await auth.login(identity.email,{interactive:true,next})));
   return auth.finish(redirect('/?gestion=unavailable'+path.slice(1)));
  }
  return auth.finish(Response.json({error:error instanceof DomainError?error.message:'No se pudo confirmar la operación del tablero. Revisá el registro antes de reintentar.',message:error instanceof DomainError?error.message:'El tablero no está disponible.',code:'DU_MANAGEMENT_ACCESS'},{status:error instanceof DomainError?error.status:503}));
 }
}
