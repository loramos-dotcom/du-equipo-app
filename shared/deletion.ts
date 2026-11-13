import {referencedProjects} from './project-context.ts';
import {collections} from './model.ts';
import type {Collection,Row,State,TrashSummary} from './model.ts';
export type Deletable='tasks'|'projects'|'issues';
export const deletionLabels={tasks:'tarea',projects:'proyecto',issues:'incidencia'} as const;
type Reference={entity:Collection;row:Row};
export type Detachment={entity:Collection;id:string;before:Record<string,any>;after:Record<string,any>;version:number};
/** Only shared business records participate in confirmation. Private notices are incidental. */
export function deletionImpactKey(value:unknown):string|null{
 let rows:unknown=value;try{if(typeof rows==='string')rows=JSON.parse(rows);}catch{return null;}
 if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==3||!collections.includes(r[0])||typeof r[1]!=='string'||!Number.isSafeInteger(r[2])||r[2]<1))return null;
 return JSON.stringify(rows.filter(r=>r[0]!=='notifications').sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;}));
}
export function mayDelete(state:State,actorId:string,entity:Deletable,row:Row){
 const actor=state.data.members.find(m=>m.id===actorId&&m.active);
 return !!actor&&(actor.role==='Coordinación'||(entity==='projects'?row.leadId===actorId:entity==='issues'?row.ownerId===actorId:row.ownerId===actorId||referencedProjects(state).some(p=>p.id===row.projectId&&!p.deletedAt&&p.leadId===actorId)));
}
export function deletionPlan(state:State,entity:Deletable,id:string){
 const d=state.data,root=d[entity].find(r=>r.id===id&&!r.deletedAt);
 if(!root)throw Error('Registro no disponible');
 const removed:Reference[]=[{entity,row:root}],detached:Detachment[]=[];
 const detach=(c:Collection,row:Row,after:Record<string,any>)=>detached.push({entity:c,id:row.id,before:Object.fromEntries(Object.keys(after).map(k=>[k,row[k]])),after,version:row.version+1});
 if(entity==='tasks'){
  for(const row of d.tasks.filter(r=>!r.deletedAt&&r.id!==id&&(r.parentTaskId===id||(r.dependsOnIds??[]).includes(id))))detach('tasks',row,{...(row.parentTaskId===id?{parentTaskId:null,deletedParentTitle:root.title}:{}),...((row.dependsOnIds??[]).includes(id)?{dependsOnIds:row.dependsOnIds.filter((key:string)=>key!==id),removedDependencyTitles:[...(row.removedDependencyTitles??[]),root.title]}:{})});
  for(const row of d.commitments.filter(r=>!r.deletedAt&&r.taskId===id))removed.push({entity:'commitments',row});
  for(const row of d.issues.filter(r=>!r.deletedAt&&r.taskId===id))detach('issues',row,{taskId:null,deletedTaskTitle:root.title});
  for(const row of d.decisions.filter(r=>!r.deletedAt&&r.taskId===id))detach('decisions',row,{taskId:null,deletedTaskTitle:root.title});
 }else if(entity==='projects'){
  for(const row of d.milestones.filter(r=>!r.deletedAt&&r.projectId===id))removed.push({entity:'milestones',row});
  for(const row of d.tasks.filter(r=>!r.deletedAt&&r.projectId===id))detach('tasks',row,{projectId:null,milestoneId:null,deletedProjectTitle:root.title});
  for(const row of d.recurrences.filter(r=>!r.deletedAt&&r.projectId===id))detach('recurrences',row,{projectId:null,deletedProjectTitle:root.title});
  for(const row of d.issues.filter(r=>!r.deletedAt&&r.projectId===id))detach('issues',row,{projectId:null,deletedProjectTitle:root.title});
 }else{
  for(const row of d.interventions.filter(r=>!r.deletedAt&&r.issueId===id))removed.push({entity:'interventions',row});
 }
 for(const row of d.agenda.filter(r=>!r.deletedAt&&removed.some(ref=>ref.entity===r.sourceType&&ref.row.id===r.sourceId)))detach('agenda',row,{sourceType:null,sourceId:null,deletedSourceTitle:root.title});
 for(const c of ['comments','links','notifications'] as const){for(const row of d[c].filter(r=>!r.deletedAt&&removed.some(ref=>ref.entity===r.targetType&&ref.row.id===r.targetId)))removed.push({entity:c,row});}
 const key=deletionImpactKey([...removed.map(r=>[r.entity,r.row.id,r.row.version]),...detached.map(r=>[r.entity,r.id,r.version-1])])!;
 return {root,removed,detached,key,tasks:detached.filter(r=>r.entity==='tasks').length,commitments:removed.filter(r=>r.entity==='commitments').length,issues:detached.filter(r=>r.entity==='issues').length,milestones:removed.filter(r=>r.entity==='milestones').length,interventions:removed.filter(r=>r.entity==='interventions').length};
}
/** Normal commands only operate on live rows; tombstones stay in the same atomic workspace. */
export function partitionDeleted(state:State){return Object.fromEntries(collections.map(c=>{const hidden=state.data[c].filter(r=>r.deletedAt);state.data[c]=state.data[c].filter(r=>!r.deletedAt);return [c,hidden];})) as Record<Collection,Row[]>;}
export function trashSummaries(state:State,actorId:string):TrashSummary[]{return (['tasks','projects','issues'] as const).flatMap(entity=>state.data[entity].filter(r=>r.deletedAt&&r.deletionRoot&&mayDelete(state,actorId,entity,r)).map(r=>({id:r.id,entity,version:r.version,title:r.title,code:r.code,deletedAt:r.deletedAt,deletedBy:r.deletedBy,reason:r.deletionReason})));}
