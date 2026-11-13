import type {Row,State} from './model.ts';
import {managementAreaKey}from'./project-portfolios.ts';

export const managementProjectRef=(id:string)=>'gestion:'+id;
export const isManagementProject=(id:unknown)=>typeof id==='string'&&id.startsWith('gestion:');
export function projectContexts(state:State):Row[]{
 return (state.externalProjects??[]).map(source=>{
  const link=(state.data.projectLinks??[]).find(row=>row.sourceId===source.sourceId);
  const members=link?.members??state.data.members.filter(m=>m.active).map(m=>m.id),areaIds=link?.areaIds??[];
  const leadId=link?.leadId??null;
  return {...source,external:true,leadId,members,areaId:areaIds.includes(link?.areaId)?link!.areaId:areaIds[0]??null,areaIds,areaKeys:[...new Set([...(source.areaKeys??[]),...areaIds.map(managementAreaKey)])],areaPriorities:link?.areaPriorities??{},duPriority:!!link?.duPriority,priorityOrder:link?.priorityOrder??0,intervention:link?.intervention??'acompaña',scope:'area',kind:'project',version:link?.version??1,trackingId:link?.id};
 });
}
export function referencedProjects(state:State){return [...state.data.projects,...projectContexts(state)];}
export function withoutExternalContext(state:State):State{const {externalProjects,...stored}=state;return stored;}
