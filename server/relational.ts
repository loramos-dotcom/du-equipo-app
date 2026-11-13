import type {Command} from '../shared/model.ts';
import {collections} from '../shared/model.ts';
import type {State,Row} from '../shared/model.ts';
export const entityTables=Object.fromEntries(collections.map(c=>[c,c.replace(/[A-Z]/g,s=>'_'+s.toLowerCase())])) as Record<string,string>;
export function metadata(state:State){
 const {data,audit,snapshots,receipts,externalProjects,trash,revision,...meta}=state;
 const purged=audit.filter(a=>a.entity==='tasks'&&a.action==='eliminar definitivamente'&&a.before).map(a=>a.before!);
 const occurrences=[...(state.ledger?.purgedOccurrences??[]),...purged.filter(t=>t.recurrenceId&&t.occurrenceDate).map(t=>({recurrenceId:t.recurrenceId,occurrenceDate:t.occurrenceDate}))];
 return {...meta,ledger:{maxTaskCode:Math.max(state.ledger?.maxTaskCode??100,...[...data.tasks,...purged].map(t=>/^T\d+$/.test(t.code??'')?Number(t.code.slice(1)):100)),purgedOccurrences:[...new Map(occurrences.map(t=>[t.recurrenceId+':'+t.occurrenceDate,t])).values()]}};
}
export function stateDelta(before:State,after:State){
 const changes:Record<string,any[]>={};
 for(const collection of collections){const left=new Map((before.data[collection]??[]).map(r=>[r.id,r])),right=new Map((after.data[collection]??[]).map(r=>[r.id,r]));const rows=[];for(const id of new Set([...left.keys(),...right.keys()])){const old=left.get(id),current=right.get(id);if(!old||!current||old.version!==current.version)rows.push({id,expectedVersion:old?.version??null,record:current??null});}if(rows.length)changes[collection]=rows;}
 const auditIds=new Set(before.audit.map(r=>r.id)),snapshotIds=new Set(before.snapshots.map(r=>r.id));
 const refs=new Map<string,{id:string;source:string;sourceId?:string}>();
 const addRef=(id:string|undefined)=>{if(id)refs.set(id,id.startsWith('gestion:')?{id,source:'gestion',sourceId:id.slice(8)}:{id,source:'du'});};
 after.data.projects.forEach(r=>addRef(r.id));after.data.projectLinks?.forEach(r=>addRef('gestion:'+r.sourceId));
 for(const entity of ['tasks','milestones','issues','recurrences']as const)after.data[entity].forEach(r=>addRef(r.projectId));
 const events=after.audit.filter(r=>!auditIds.has(r.id));
 return {p_workspace:after.workspaceId,p_revision:before.revision,p_next:after.revision,p_metadata:metadata(after),p_changes:changes,p_audit:events,p_snapshots:after.snapshots.filter(r=>!snapshotIds.has(r.id)),p_receipts:Object.fromEntries(Object.entries(after.receipts).filter(([id])=>!Object.hasOwn(before.receipts,id))),p_refs:[...refs.values()],p_actor:events.at(-1)?.actorId??''};
}
export type ReadOptions={history?:boolean;receiptIds?:string[]};

export function isTaskContentCommand(command:any):command is Command{
 return !!command&&typeof command==='object'&&typeof command.id==='string'&&command.id.length>0&&command.id.length<=100&&command.kind==='update'&&command.entity==='tasks'&&typeof command.entityId==='string'&&Number.isSafeInteger(command.expectedVersion)&&command.expectedVersion>0&&!!command.data&&typeof command.data==='object'&&!Array.isArray(command.data)&&Object.keys(command.data).length>0&&Object.keys(command.data).every(key=>['title','description','reason'].includes(key)&&typeof command.data[key]==='string');
}
