import {isTaskContentCommand}from'./relational.ts';
import {readQuery}from'./read-queries.ts';
import {execute,publicState,DomainError} from '../shared/domain.ts';
import {seed} from '../shared/seed.ts';
import {csv,dateInBA,weekStart,addDays,normalize} from '../shared/model.ts';
import {workExportRows} from '../shared/work.ts';
import type {State,Command,Collection,Row} from '../shared/model.ts';
import {authorizedMember} from '../shared/team.ts';
import type {VerifiedIdentity,MembershipState} from '../shared/team.ts';
export type HistoryParams={offset:number;limit:number;actor?:string;entity?:string;entityId?:string;from?:string;to?:string;q?:string;restricted?:boolean;viewerId?:string};
export interface Store {updateTaskContent?(key:string,actorId:string,identityId:string,command:Command,externalProjects:Row[]):Promise<{revision:number;row:Row;result:any}|null>;records?(key:string,entity:string,filters:Record<string,any>,today:string,offset:number,limit:number):Promise<{rows:Row[];total:number}>;history?(key:string,params:HistoryParams):Promise<{rows:any[];total:number}>;load(key:string,options?:{history?:boolean;receiptIds?:string[]}):Promise<State|null>;loadAccess?(key:string):Promise<MembershipState|null>;create(key:string,state:State):Promise<void>;save(key:string,revision:number,state:State):Promise<boolean>}
const headers={'content-type':'application/json;charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
const json=(data:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
export type Access={mode:'team';identity:VerifiedIdentity;externalProjects?:Row[];membership?:MembershipState}|{mode:'demo'};
export async function api(request:Request,store:Store,key:string,access:Access={mode:'demo'}){
 const url=new URL(request.url),path=url.pathname;const requestId=crypto.randomUUID();
 const context=(value:State)=>({...value,externalProjects:access.mode==='team'?access.externalProjects:undefined});
 try{
  if(path==='/api/access'&&request.method==='GET')return json({mode:access.mode,provider:access.mode==='demo'?'simulation':'google',configured:true});
  if(request.method==='POST'){
   if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new DomainError('Origen no permitido.',403);
   if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('Se requiere JSON.',400);
   if(Number(request.headers.get('content-length')??0)>1000000)throw new DomainError('La solicitud supera el tamaño permitido.',413);
  }
  if(access.mode==='team'&&request.method==='GET'&&((path==='/api/records'&&store.records)||(path==='/api/history'&&store.history))){const membership=access.membership??(store.loadAccess?await store.loadAccess(key):null);if(membership){const actor=authorizedMember(membership,access.identity);return (await readQuery(request,store,key,actor))!;}}
  const parsedCommand=path==='/api/command'&&request.method==='POST'?await request.clone().json():undefined;
  if(access.mode==='team'&&store.updateTaskContent&&isTaskContentCommand(parsedCommand)){const membership=access.membership??(store.loadAccess?await store.loadAccess(key):null);if(membership){const actor=authorizedMember(membership,access.identity);if(actor.authUserId){const saved=await store.updateTaskContent(key,actor.id,access.identity.id,parsedCommand,access.externalProjects??[]);if(saved?.row)return json({result:saved.result,patch:{revision:saved.revision,entity:'tasks',row:saved.row}});}}}
  const receiptId=path==='/api/command'&&request.method==='POST'?parsedCommand?.id:path==='/api/command-status'?url.searchParams.get('id'):undefined;
  let state=await store.load(key,{history:path==='/api/export'||!store.history,receiptIds:typeof receiptId==='string'?[receiptId]:[]});if(!state){if(access.mode==='team')throw new DomainError('Coordinación todavía debe habilitar el espacio institucional.',503);await store.create(key,seed());state=await store.load(key);if(!state)throw Error('storage');}
  let actorId:string;
  if(access.mode==='team'){
   const member=authorizedMember(state,access.identity);actorId=member.id;
   if(!member.authUserId){
    const next=structuredClone(state),row=next.data.members.find(m=>m.id===member.id)!,at=new Date().toISOString(),before=structuredClone(row);
    Object.assign(row,{authUserId:access.identity.id,setupStatus:'Identidad Google vinculada',activatedAt:at,updatedAt:at,updatedBy:actorId,version:row.version+1});next.revision++;
    next.audit.push({id:crypto.randomUUID(),at,actorId,actorName:row.name,actorEmail:row.email,entity:'members',entityId:row.id,action:'vincular identidad',before,after:structuredClone(row),fields:['authUserId','setupStatus','activatedAt'],reason:'Primer acceso con correo verificado por Google y autorización vigente.',operationId:crypto.randomUUID(),source:'autenticación institucional'});
    if(!await store.save(key,state.revision,next))throw new DomainError('El espacio se actualizó. Reintentá el ingreso.',409);state=next;
   }
  }else{
   if(state.accessMode==='institutional')throw new DomainError('El espacio exige autenticación institucional.',403);
   const cookie=request.headers.get('cookie')??'';actorId=decodeURIComponent(cookie.match(/(?:^|;\s*)du_demo_actor=([^;]*)/)?.[1]??'persona01');
  }
  if(path==='/api/session'&&request.method==='POST'){
   if(access.mode!=='demo')throw new DomainError('No se permite cambiar de identidad. Cerrá sesión para usar otra cuenta.',403);
   const raw=await request.text();if(raw.length>10000)throw new DomainError('Solicitud demasiado grande.',413);const data=JSON.parse(raw);if(!data||typeof data.memberId!=='string')throw new DomainError('Elegí un perfil de prueba válido.',400);const {memberId}=data;if(!state.data.members.some(m=>m.id===memberId&&m.active))throw new DomainError('Perfil de prueba no disponible.',403);
   return json({ok:true},200,{'set-cookie':`du_demo_actor=${encodeURIComponent(memberId)}; Path=/; HttpOnly; SameSite=Strict${url.protocol==='https:'?'; Secure':''}`});
  }
  if(['/api/records','/api/history'].includes(path)){const actor=state.data.members.find(m=>m.id===actorId&&m.active);if(!actor)throw new DomainError('Acceso desactivado.',403);return (await readQuery(request,store,key,actor,context(state)))!;}
  if(path==='/api/state'&&request.method==='GET')return json({state:publicState(context(state),actorId),actorId,today:dateInBA(),weekStart:weekStart(dateInBA()),mode:access.mode,loadedAt:new Date().toISOString()});
  if(path==='/api/command-status'&&request.method==='GET'){publicState(context(state),actorId);const id=url.searchParams.get('id')??'',receipt=Object.hasOwn(state.receipts,id)?state.receipts[id]:null;return json(receipt&&receipt.actorId===actorId?{found:true,result:receipt.result,state:publicState(context(state),actorId)}:{found:false});}
  if(path==='/api/command'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>1000000)throw new DomainError('La solicitud es demasiado grande.',413);const command=JSON.parse(raw) as Command;
   const attempts=['create','update','task_status','upsert_commitment','record_outcome','save_preference'].includes(command?.kind)?4:1;
   for(let attempt=0;attempt<attempts;attempt++){
    const {state:next,result}=execute(context(state),actorId,command);if(next.revision===state.revision||await store.save(key,state.revision,next))return json({state:publicState(context(next),actorId),result});
    if(attempt+1<attempts){await new Promise(resolve=>setTimeout(resolve,5+Math.random()*25));const current=await store.load(key,{history:!store.history,receiptIds:[command.id]});if(!current)throw Error('storage');if(access.mode==='team')authorizedMember(current,access.identity);state=current;}
   }
   throw new DomainError('Hubo otra actualización al mismo tiempo. Recargá y revisá los datos antes de guardar.',409);
  }
  if(path==='/api/export'&&request.method==='GET'){
   const actor=state.data.members.find(m=>m.id===actorId&&m.active);if(!actor)throw new DomainError('Acceso desactivado.',403);
   const format=url.searchParams.get('format')??'csv',auditOnly=format==='audit';if(!['json','csv','audit'].includes(format))throw new DomainError('Formato no válido.',400);const full=format==='json';if((full||auditOnly)&&actor.role!=='Coordinación')throw new DomainError('La exportación completa o de auditoría corresponde a coordinación.',403);
   const entity=(url.searchParams.get('entity')??'tasks') as Collection;
   const authorized=publicState(context(state),actorId);if(!full&&!authorized.data[entity])throw new DomainError('Entidad inválida.',400);
   const c:Command={id:crypto.randomUUID(),kind:'export',data:{full:full||auditOnly}};const {state:next}=execute(context(state),actorId,c);if(!await store.save(key,state.revision,next))throw new DomainError('Actualización simultánea. Reintentá la exportación.',409);
   let rows=authorized.data[entity]??[];const ids=url.searchParams.get('ids');if(ids!==null){const selected=new Set(ids.split(',').filter(Boolean));rows=rows.filter(r=>selected.has(r.id));}
   const payload=auditOnly?JSON.stringify(next.audit,null,2):full?JSON.stringify({schemaVersion:state.schemaVersion,generatedAt:new Date().toISOString(),workspaceId:state.workspaceId,settings:state.settings,manifest:Object.fromEntries(Object.entries(state.data).map(([k,v])=>[k,v.length])),data:state.data,audit:next.audit,snapshots:state.snapshots},null,2):csv(entity==='tasks'?workExportRows(rows,authorized.data.tasks):rows);
   return new Response(payload,{headers:{...headers,'content-type':full||auditOnly?'application/json;charset=utf-8':'text/csv;charset=utf-8','content-disposition':`attachment; filename="du-equipo-${auditOnly?'historial':full?'respaldo':entity}-${dateInBA()}.${full||auditOnly?'json':'csv'}"`}});
  }
  return json({error:'Ruta no encontrada.'},404);
 }catch(e){if(e instanceof DomainError)return json({error:e.message,requestId},e.status);if(e instanceof SyntaxError)return json({error:'La solicitud JSON no es válida.',requestId},400);return json({error:'No se pudo confirmar la operación. Reintentá o consultá el estado de los datos.',requestId},500);}
}
