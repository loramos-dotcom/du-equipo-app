import {timingSafeEqual} from 'node:crypto';
import type {Store} from './api.ts';
import {execute} from '../shared/domain.ts';
import {collections,dateInBA} from '../shared/model.ts';
import type {Row} from '../shared/model.ts';

export async function runDailyJobs(store:Store&{claimJob?:(workspace:string,id:string,token:string)=>Promise<boolean>;releaseJob?:(workspace:string,id:string,token:string)=>Promise<void>},workspaceId:string,now=new Date()){
 const day=dateInBA(now),jobId='daily:'+day;
 const leaseToken=crypto.randomUUID();if(store.claimJob&&!await store.claimJob(workspaceId,jobId,leaseToken))return {reused:true,running:true};
 try{
 for(let attempt=0;attempt<3;attempt++){
  const state=await store.load(workspaceId,{history:false,receiptIds:[jobId+':occurrences',jobId+':notifications']});if(!state)throw Error('workspace-unavailable');
  for(const collection of collections)state.data[collection]??=[];
  const previous=state.data.jobRuns.find(row=>row.id===jobId);
  if(previous?.status==='Completado'||previous?.status==='Completado con observaciones')return {reused:true,job:previous};
  const started=Date.now(),auditStart=state.audit.length;
  let next=execute(state,'system:daily',{id:jobId+':occurrences',kind:'generate_occurrences',data:{}},now,{jobId}).state;
  const generated=next.receipts[jobId+':occurrences'].result;
  const noticesBefore=next.data.notifications.length;
  next=execute(next,'system:daily',{id:jobId+':notifications',kind:'generate_notifications',data:{}},now,{jobId}).state;
  const job:Row={id:jobId,version:(previous?.version??0)+1,createdAt:previous?.createdAt??now.toISOString(),updatedAt:now.toISOString(),updatedBy:'system:daily',day,startedAt:now.toISOString(),finishedAt:new Date(now.getTime()+Date.now()-started).toISOString(),durationMs:Date.now()-started,status:generated.errors?.length?'Completado con observaciones':'Completado',created:generated.created??0,notifications:next.data.notifications.length-noticesBefore,errors:generated.errors??[],executedBy:'system:daily'};
  next.data.jobRuns=next.data.jobRuns.filter(row=>row.id!==jobId);next.data.jobRuns.push(job);
  for(const event of next.audit.slice(auditStart))Object.assign(event,{jobRunId:jobId,executedBy:'system:daily'});
  next.audit.push({id:crypto.randomUUID(),at:now.toISOString(),actorId:'system:daily',actorName:'Proceso diario de DU Equipo',actorEmail:null,entity:'jobRuns',entityId:jobId,action:'ejecutar proceso diario',before:previous??null,after:structuredClone(job),fields:Object.keys(job),reason:'Generación diaria de ocurrencias y avisos internos.',operationId:jobId,source:'proceso automático'});
  if(await store.save(workspaceId,state.revision,next))return {reused:false,job};
 }
 throw Error('job-concurrent-conflict');
 }finally{if(store.releaseJob)await store.releaseJob(workspaceId,jobId,leaseToken);}
}
export async function dailyJobRequest(request:Request,store:Store,workspaceId:string,secret:string|undefined,backup?:()=>Promise<unknown>,calendar?:()=>Promise<unknown>){
 const headers={'cache-control':'private, no-store'};
 if(!secret)return Response.json({error:'El proceso diario no está configurado.'},{status:503,headers});
 const supplied=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);
 if(request.method!=='GET'||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return Response.json({error:'Acceso no autorizado.'},{status:401,headers});
 try{const result=await runDailyJobs(store,workspaceId);let calendarResult;try{calendarResult=calendar?await calendar():undefined;}catch{calendarResult={status:'No se pudo actualizar Calendar'};}const copy=backup?await backup():undefined;return Response.json({...result,...(calendarResult?{calendar:calendarResult}:{}),backup:copy},{headers,status:(copy as any)?.status==='Error al completar la copia'?503:200});}catch{return Response.json({error:'No se pudo completar el proceso diario.',requestId:crypto.randomUUID()},{status:503,headers});}
}
