import {workLabel,workName,workSnapshotRows} from './work.ts';
import {dateInBA} from './model.ts';
import {weeklyTasks} from './weekly-tasks.ts';
import type {Row,State} from './model.ts';
export const meetingSegments=[['advanceMinutes','Avances',5],['decisionMinutes','Decisiones y bloqueos',15],['teamMinutes','Revisión del equipo',15],['planningMinutes','Próxima semana',10]] as const;
export type MeetingWork={commitments:Row[];tasks:Row[];closed:boolean;weekTaskIds?:Record<string,string[]>;projects?:Row[];areas?:Row[];members?:Row[]};
export function meetingWeekWork(state:State,weekId:string,today=dateInBA()):MeetingWork{
 const week=state.data.weeks.find(w=>w.id===weekId),closed=week?.status==='Cerrada',snapshot=closed?state.snapshots.find(s=>s.kind==='week'&&s.targetId===weekId&&s.version===week.closeVersion)?.payload:null;
 const data=closed?snapshot??{}:state.data,commitments:Row[]=(data.commitments??[]).filter((c:Row)=>c.weekId===weekId&&!c.deletedAt&&!c.archived);
 const owners=[...new Set<string>([...(data.members??[]).map((row:Row)=>row.id),...(data.tasks??[]).map((row:Row)=>row.ownerId),...commitments.map(row=>row.ownerId)].filter(Boolean))];
 const weekTaskIds=Object.fromEntries(owners.map(owner=>[owner,weeklyTasks(state,weekId,owner,today,snapshot).selected.map(row=>row.task.id)]));
 const tasks=workSnapshotRows(data.tasks??[],[...Object.values(weekTaskIds).flat(),...commitments.map(row=>row.taskId)]);
 return {commitments,tasks,weekTaskIds,closed,projects:data.projects??[],areas:data.areas??[],members:data.members??[]};
}
/** Old closed meetings use their preserved commitments; never borrow current selections. */
export function meetingWorkRows(work:MeetingWork,person=''){
 const owners=[...new Set([...Object.keys(work.weekTaskIds??{}),...work.commitments.map(row=>row.ownerId)])].filter(owner=>!person||owner===person);
 return owners.flatMap(ownerId=>{
  const commitments=work.commitments.filter(row=>row.ownerId===ownerId),ids=[...new Set([...(work.weekTaskIds?.[ownerId]??[]),...commitments.map(row=>row.taskId)])];
  return ids.map(taskId=>({ownerId,task:work.tasks.find(row=>row.id===taskId),commitment:commitments.find(row=>row.taskId===taskId)}));
 });
}
export function meetingMinutes(state:State,meeting:Row){
 const name=(id:string)=>state.data.members.find(m=>m.id===id)?.name??id;
 const attendance=meeting.attendance as Record<string,string>|undefined;
 const presence=attendance?'\nAsistencia: '+meeting.attendees.map((id:string)=>name(id)+': '+(attendance[id]??'Sin registrar')).join('; '):'';
 const updates=state.data.comments.filter(c=>(meeting.selectedUpdateIds??[]).includes(c.id));
 const commitments=state.data.commitments.filter(c=>(meeting.selectedCommitmentIds??[]).includes(c.id));
 return {presence,advances:updates.map(c=>'• '+c.body+' ('+(c.authorName??name(c.authorId))+')').join('\n'),commitments:commitments.map(c=>'• '+c.result+' · '+name(c.ownerId)+(state.data.tasks.find(task=>task.id===c.taskId)?' · '+workLabel(state.data.tasks.find(task=>task.id===c.taskId)!)+' '+workName(state.data.tasks.find(task=>task.id===c.taskId)!):'')+(c.targetDate?' · '+c.targetDate:'')).join('\n')};
}
