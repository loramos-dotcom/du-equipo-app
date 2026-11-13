import type {Row,State}from'./model.ts';
import {effectiveArea}from'./structure.ts';
import {dateInBA}from'./model.ts';
export const managementAreaKey=(id:string)=>({ssgad:'gestion_administrativa',ssgda:'aprendizaje',sstedu:'tecnologia',sspie:'planeamiento'} as Record<string,string>)[id]??id;
export function followedAreaKeys(state:State,actorId:string,today=dateInBA()){
 return state.data.areas.filter(area=>area.active).map(area=>effectiveArea(state,area,today)).filter(area=>area.leadId===actorId||(area.substitutes??[]).includes(actorId)).map(area=>managementAreaKey(area.id));
}
export function mayPrioritize(state:State,actorId:string,project:Row){
 const member=state.data.members.find(m=>m.id===actorId&&m.active);if(!member)return false;
 return member.role==='Coordinación'||project.leadId===actorId||(project.areaKeys??[]).some((key:string)=>followedAreaKeys(state,actorId).includes(key));
}
