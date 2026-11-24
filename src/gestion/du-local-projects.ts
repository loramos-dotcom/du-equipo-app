import type {Row} from '../../shared/model';
import {managementAreaKey} from '../../shared/project-portfolios.ts';
import {defaultProjectPriority,projectPriorityLevel} from '../../shared/project-priority.ts';
import type {Project,ProjectStatus} from './domain/types';

export const localPortfolioId=(id:string)=>'du:'+id;
export function localPortfolioProjects(rows:Row[],members:Row[],areas:Row[]):Project[]{
 return rows.filter(row=>!row.external&&!row.archived&&!row.deletedAt).map(row=>{
  const areaIds=[...new Set<string>([...(row.areaIds??[]),...(row.areaId?[row.areaId]:[])])],areaKeys=areaIds.map(managementAreaKey);
  const status:ProjectStatus=['Finalizado','Cancelado'].includes(row.status)?'finished':row.delivery==='Comprometido'?'alert':['En preparación','Pausado'].includes(row.status)?'pending':'active';
  return {id:localPortfolioId(row.id),duLocalId:row.id,kind:'project',version:row.version,areaKey:areaKeys[0]??'',areaKeys,areaName:areaIds.map(id=>areas.find(area=>area.id===id)?.name??id).join(' · ')||'Trabajo propio DU',name:row.title,owner:'DU',priority:projectPriorityLevel(row.priority)??defaultProjectPriority,objective:row.outcome??'',scope:row.scope??'du',justification:'',notes:row.description??'',progress:status==='finished'?100:0,status,manualStatus:status,favorite:!!row.duPriority,favoriteSortOrder:row.priorityOrder,updatedAt:row.updatedAt??'',plannedStart:row.startDate??'',plannedEnd:row.targetDate??'',rescheduledStart:'',rescheduledEnd:'',competencyAreas:[],sortOrder:0,updates:[],nextSteps:[],children:[]};
 });
}
