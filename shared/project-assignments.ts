import type {State}from'./model.ts';import{effectiveArea}from'./structure.ts';import{dateInBA}from'./model.ts';
export function resolveProjectAssignments(state:State,manualMemberIds:string[],manualAreaIds:string[],today=dateInBA()){
 const active=new Set(state.data.members.filter(m=>m.active).map(m=>m.id));
 const areas=state.data.areas.filter(a=>a.active).map(a=>effectiveArea(state,a,today));
 const members=[...new Set(manualMemberIds)],areaIds=[...new Set(manualAreaIds)];
 const peopleFromAreas=areas.filter(a=>areaIds.includes(a.id)).flatMap(a=>[a.leadId,...(a.substitutes??[])]).filter(id=>active.has(id));
 const areasFromPeople=areas.filter(a=>[a.leadId,...(a.substitutes??[])].some(id=>members.includes(id))).map(a=>a.id);
 return {manualMemberIds:members,manualAreaIds:areaIds,members:[...new Set([...members,...peopleFromAreas])],areaIds:[...new Set([...areaIds,...areasFromPeople])]};
}
export function changeProjectAssignments(state:State,key:'members'|'areaIds',selected:string[],previous:Record<string,any>){
 const manualKey=key==='members'?'manualMemberIds':'manualAreaIds',old=previous[key]??[],manual=new Set<string>(previous[manualKey]??old);
 for(const id of selected)if(!old.includes(id))manual.add(id);for(const id of old)if(!selected.includes(id))manual.delete(id);
 const assigned=resolveProjectAssignments(state,key==='members'?[...manual]:previous.manualMemberIds??previous.members??[],key==='areaIds'?[...manual]:previous.manualAreaIds??previous.areaIds??[]);
 return {...previous,...assigned,leadId:assigned.members.includes(previous.leadId)?previous.leadId:assigned.members[0]??null};
}
