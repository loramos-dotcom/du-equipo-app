import {workLabel,workName,workSnapshotRows} from './work.ts';
import type {Row,State} from './model.ts';
export const meetingSegments=[['advanceMinutes','Avances',5],['decisionMinutes','Decisiones y bloqueos',15],['teamMinutes','Revisión del equipo',15],['planningMinutes','Próxima semana',10]] as const;
export function meetingWeekWork(state:State,weekId:string){
 const week=state.data.weeks.find(w=>w.id===weekId),snapshot=week?.status==='Cerrada'?state.snapshots.find(s=>s.kind==='week'&&s.targetId===weekId&&s.version===week.closeVersion)?.payload:null;
 const commitments:Row[]=(snapshot?.commitments??state.data.commitments).filter((c:Row)=>c.weekId===weekId),tasks=workSnapshotRows(snapshot?.tasks??state.data.tasks,commitments.map(c=>c.taskId));
 return {commitments,tasks,closed:week?.status==='Cerrada'};
}
export function meetingMinutes(state:State,meeting:Row){
 const name=(id:string)=>state.data.members.find(m=>m.id===id)?.name??id;
 const attendance=meeting.attendance as Record<string,string>|undefined;
 const presence=attendance?'\nAsistencia: '+meeting.attendees.map((id:string)=>name(id)+': '+(attendance[id]??'Sin registrar')).join('; '):'';
 const updates=state.data.comments.filter(c=>(meeting.selectedUpdateIds??[]).includes(c.id));
 const commitments=state.data.commitments.filter(c=>(meeting.selectedCommitmentIds??[]).includes(c.id));
 return {presence,advances:updates.map(c=>'• '+c.body+' ('+(c.authorName??name(c.authorId))+')').join('\n'),commitments:commitments.map(c=>'• '+c.result+' · '+name(c.ownerId)+(state.data.tasks.find(task=>task.id===c.taskId)?' · '+workLabel(state.data.tasks.find(task=>task.id===c.taskId)!)+' '+workName(state.data.tasks.find(task=>task.id===c.taskId)!):'')+(c.targetDate?' · '+c.targetDate:'')).join('\n')};
}
