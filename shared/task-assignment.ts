import type {Row,State} from './model.ts';
import {effectiveArea} from './structure.ts';

export function taskCollaborators(ownerId:string,collaborators:string[]=[]):string[]{
 return [...new Set(collaborators)].filter(id=>id!==ownerId);
}

export function taskAreaIds(task:Row):string[]{
 return [...new Set<string>(task.areaIds??(task.areaId?[task.areaId]:[]))];
}

export function taskAreaMembers(state:State,areaId:string,today:string):string[]{
 const source=state.data.areas.find(area=>area.id===areaId&&area.active);
 if(!source)return [];
 const area=effectiveArea(state,source,today),active=new Set(state.data.members.filter(member=>member.active).map(member=>member.id));
 return [...new Set([area.leadId,...(area.substitutes??[])])].filter(id=>active.has(id));
}

export type TaskExecution={type:'du'|'area'|'unspecified';areaId:string|null};
export function taskExecution(task:Row):TaskExecution{
 const type=task.executionType==='du'||task.executionType==='area'?task.executionType:'unspecified';
 return {type,areaId:type==='area'?task.executionAreaId??null:null};
}
