import type {Row,State} from './model.ts';
import {closedIssue,pendingInterventions} from './followup.ts';

export const activeTaskIssues=(issues:Row[],taskId:string)=>issues.filter(issue=>issue.taskId===taskId&&!issue.deletedAt&&!issue.archived&&!closedIssue(issue));
export const requestsForTask=(state:State,taskId:string)=>pendingInterventions(state.data.interventions,state.data.issues).filter(request=>state.data.issues.some(issue=>issue.id===request.issueId&&issue.taskId===taskId));

// Keep existing issue permissions and history while presenting one work item per task.
export function visibleTaskIssues(state:State,taskId:string,actorId:string){
 const coord=state.data.members.some(member=>member.id===actorId&&member.active&&member.role==='Coordinación');
 return activeTaskIssues(state.data.issues,taskId).filter(issue=>coord||issue.ownerId===actorId);
}
export function taskFollowupKey(state:State,taskId:string,actorId:string){
 const issues=visibleTaskIssues(state,taskId,actorId),ids=new Set(issues.map(issue=>issue.id));
 return JSON.stringify([...issues.map(issue=>['issues',issue.id,issue.version]),...state.data.interventions.filter(request=>ids.has(request.issueId)&&!request.deletedAt&&!request.archived).map(request=>['interventions',request.id,request.version])].sort((a,b)=>String(a[1]).localeCompare(String(b[1]))));
}
export type TaskFollowupRow={task:Row;issues:Row[];requests:Row[];date:string;closed:boolean};
export function taskFollowups(state:State,actorId:string):TaskFollowupRow[]{
 const coord=state.data.members.some(member=>member.id===actorId&&member.active&&member.role==='Coordinación');
 return state.data.tasks.filter(task=>!task.deletedAt&&!task.archived).flatMap(task=>{
  const history=state.data.issues.filter(issue=>issue.taskId===task.id&&!issue.deletedAt&&!issue.archived&&(coord||issue.ownerId===actorId));
  if(!coord&&task.ownerId!==actorId&&!history.length)return [];
  const issues=history.filter(issue=>!closedIssue(issue)),ids=new Set(issues.map(issue=>issue.id)),requests=requestsForTask(state,task.id).filter(request=>ids.has(request.issueId));
  if(!history.length&&task.status!=='En espera')return [];
  const closed=['Terminada','Cancelada'].includes(task.status)||(!issues.length&&task.status!=='En espera');
  const dates=[...issues.map(issue=>issue.followUpDate),...requests.map(request=>request.neededBy)].filter(Boolean).sort();
  return [{task,issues,requests,date:dates[0]??'',closed}];
 }).sort((a,b)=>Number(a.closed)-Number(b.closed)||(a.date||'9999').localeCompare(b.date||'9999')||a.task.title.localeCompare(b.task.title,'es'));
}
