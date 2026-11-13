import {DomainError,publicState} from '../shared/domain.ts';
import type {Command,Row} from '../shared/model.ts';
import {selectTasks} from '../shared/views.ts';
import {dateInBA,normalize} from '../shared/model.ts';
import {createClient} from '@supabase/supabase-js';
import type {Store,HistoryParams} from './api.ts';
import type {State} from '../shared/model.ts';
import type {TeamConfig} from './auth.ts';
import {stateDelta} from './relational.ts';
import type {ReadOptions} from './relational.ts';
import type {CalendarConnection} from './calendar.ts';

// This administrative client lives only on the server. Direct browser access is denied by SQL grants/RLS.
export function supabaseStore(config:Pick<TeamConfig,'supabaseUrl'|'secretKey'>&{relational?:boolean},transport:typeof fetch=fetch){
 const db=createClient(config.supabaseUrl,config.secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
 const baselines=new Map<string,State>();let relational=config.relational??false;
 const store:Store={
  async load(key:string,options:ReadOptions={}){
   if(relational){const {data,error}=await db.rpc('du_read_state',{p_workspace:key,p_history:options.history??true,p_receipts:options.receiptIds??null});if(!error){if(data)baselines.set(key,structuredClone(data as State));return data as State|null;}if(error.code!=='PGRST202')throw Error('database-read');relational=false;}
   const {data,error}=await db.from('du_workspaces').select('payload').eq('id',key).maybeSingle();if(error)throw Error('database');return data?.payload as State??null;
  },
  async loadAccess(key:string){
   if(relational){const {data,error}=await db.from('du_members').select('record').eq('workspace_id',key);if(!error)return data.length?{accessMode:'institutional' as const,data:{members:data.map(r=>r.record) as State['data']['members']}}:null;if(error.code!=='PGRST205')throw Error('database-access');relational=false;}
   const {data,error}=await db.from('du_workspaces').select('accessMode:payload->accessMode,members:payload->data->members').eq('id',key).maybeSingle();if(error)throw Error('database');return data?{accessMode:data.accessMode as State['accessMode'],data:{members:Array.isArray(data.members)?data.members as State['data']['members']:[]}}:null;
  },
  async create(key:string,state:State){const {error}=await db.from('du_workspaces').insert({id:key,revision:state.revision,payload:state});if(error)throw Error('El espacio ya existe o la base no está preparada. No se sobrescribieron datos.');},
  async save(key:string,revision:number,state:State){
   if(relational){const base=baselines.get(key);if(!base||base.revision!==revision)throw Error('missing-baseline');const {data,error}=await db.rpc('du_commit_state',stateDelta(base,state));if(error){if(error.code==='40001')return false;throw Error('database-commit');}if(data)baselines.set(key,structuredClone(state));return data===true;}
   const {data,error}=await db.from('du_workspaces').update({revision:state.revision,payload:state}).eq('id',key).eq('revision',revision).select('id');if(error)throw Error('database');return data.length===1;
  }
 };
 return Object.assign(store,{
  async readCalendar(workspace:string,memberId:string){const {data,error}=await db.from('du_calendar_connections').select('*').eq('workspace_id',workspace).eq('member_id',memberId).maybeSingle();if(error)throw Error('calendar-store');return data?calendarRecord(data):null;},
  async listCalendars(workspace:string){const {data,error}=await db.from('du_calendar_connections').select('*').eq('workspace_id',workspace);if(error)throw Error('calendar-store');return data.map(calendarRecord);},
  async saveCalendar(workspace:string,value:CalendarConnection,expected:string|null){const {data,error}=await db.rpc('du_save_calendar_connection',{p_workspace:workspace,p_member:value.memberId,p_expected:expected,p_value:value});if(error)throw Error('calendar-store');return data===true;},
  async deleteCalendar(workspace:string,memberId:string,revision:string){const {data,error}=await db.from('du_calendar_connections').delete().eq('workspace_id',workspace).eq('member_id',memberId).eq('revision',revision).select('member_id');if(error)throw Error('calendar-store');return data.length===1;},
  async claimJob(workspace:string,id:string,token:string){const {data,error}=await db.rpc('du_claim_job',{p_workspace:workspace,p_id:id,p_token:token,p_seconds:300});if(error)throw Error('job-lease');return data===true;},
  async releaseJob(workspace:string,id:string,token:string){const {error}=await db.from('du_job_leases').delete().eq('workspace_id',workspace).eq('id',id).eq('owner_token',token);if(error)throw Error('job-release');},
  async readBackup(workspace:string){const {data,error}=await db.from('du_backup_credentials').select('sealed,email,last_backup').eq('workspace_id',workspace).maybeSingle();if(error?.code==='PGRST205')return null;if(error)throw Error('backup-store');return data as {sealed:string;email:string;last_backup:any}|null;},
  async saveBackup(workspace:string,value:{sealed:string;email:string;last_backup?:unknown}){const {error}=await db.from('du_backup_credentials').upsert({workspace_id:workspace,...value,updated_at:new Date().toISOString()});if(error)throw Error('backup-store');},
  async updateTaskContent(workspace:string,actorId:string,identityId:string,command:Command,externalProjects:Row[]){
   if(!relational)return null;const {data,error}=await db.rpc('du_update_task_content',{p_workspace:workspace,p_actor:actorId,p_identity:identityId,p_id:command.entityId,p_version:command.expectedVersion,p_patch:command.data,p_operation:command.id,p_hash:JSON.stringify({...command,id:undefined}),p_at:new Date().toISOString(),p_source:externalProjects.map(row=>({id:row.id,status:row.status}))});if(error?.code==='PGRST202'){relational=false;return null;}if(error){if(['40001','42501','22023'].includes(error.code))throw new DomainError(error.message,error.code==='40001'?409:error.code==='42501'?403:422);throw Error('database-task-content');}return data as {revision:number;row:Row;result:any};
  },
  async records(workspace:string,entity:string,filters:Record<string,any>,today:string,offset:number,limit:number){if(!relational){const state=await store.load(workspace);if(!state)throw Error('database');const rows=entity==='tasks'?selectTasks(state,{owner:'',state:'',due:'',independent:false,...filters},today):state.data[entity as keyof State['data']].filter(r=>!r.deletedAt&&(filters.archived||!r.archived)&&(!filters.owner||(entity==='projects'?r.leadId:r.ownerId)===filters.owner));return {rows:rows.slice(offset,offset+limit),total:rows.length};}const {data,error}=await db.rpc('du_list_records',{p_workspace:workspace,p_entity:entity,p_filters:filters,p_today:today,p_offset:offset,p_limit:limit});if(error)throw Error('records-query');return data as {rows:State['data']['tasks'];total:number};},
  async history(workspace:string,params:HistoryParams){
   if(!params.viewerId)throw Error('missing-history-viewer');
   if(!relational){const state=await store.load(workspace);if(!state)throw Error('database');const rows=publicState(state,params.viewerId).audit.filter(e=>(!params.entity||e.entity===params.entity)&&(!params.entityId||e.entityId===params.entityId)&&(!params.actor||e.actorId===params.actor)&&(!params.q||normalize(JSON.stringify(e)).includes(normalize(params.q)))&&(!params.from||dateInBA(new Date(e.at))>=params.from)&&(!params.to||dateInBA(new Date(e.at))<=params.to)).slice().reverse();return {rows:rows.slice(params.offset,params.offset+params.limit),total:rows.length};}
   const {data,error}=await db.rpc('du_list_history',{p_workspace:workspace,p_viewer:params.viewerId,p_filters:params,p_offset:params.offset,p_limit:params.limit});if(error)throw Error('history-query');return data as {rows:any[];total:number};
  }
 });
}
function calendarRecord(data:any):CalendarConnection{return {memberId:data.member_id,email:data.email,sealed:data.sealed,selected:data.selected,events:data.events,syncedAt:data.synced_at,syncError:data.sync_error,revision:data.revision};}
