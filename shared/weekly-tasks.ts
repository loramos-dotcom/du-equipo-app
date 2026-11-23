import type {Row,State} from './model.ts';
import {addDays,dateInBA,weekStart} from './model.ts';
import {panelPriority} from './task-priority.ts';

export function completedInWeek(task:Row,weekId:string){
 if(task.status!=='Terminada'||!task.completedAt)return false;
 const completedAt=new Date(task.completedAt);if(!Number.isFinite(completedAt.getTime()))return false;
 const date=dateInBA(completedAt);return date>=weekId&&date<addDays(weekId,7);
}
export type WeekTask={task:Row;commitment?:Row;priority:boolean;recurringCollaborator?:boolean};
export function weeklyTasks(state:State,weekId:string,ownerId:string,today=dateInBA(),historical?:any){
 const week=state.data.weeks.find(w=>w.id===weekId),closed=week?.status==='Cerrada';
 const snapshot=historical??(closed?state.snapshots.find(s=>s.kind==='week'&&s.targetId===weekId&&s.version===week.closeVersion)?.payload:null);
 const data=snapshot??state.data,commitments:Row[]=(data.commitments??[]).filter((c:Row)=>c.weekId===weekId&&c.ownerId===ownerId&&!c.deletedAt&&!c.archived);
 const plan=(data.plans??[]).find((p:Row)=>p.weekId===weekId&&p.ownerId===ownerId),selections=plan?.taskSelections??{};
 const fixed=closed||!!historical?new Set<string>(snapshot?.weekTaskIds?.[ownerId]??commitments.map(c=>c.taskId)):null;
 const chosen:WeekTask[]=[],rest:WeekTask[]=[];
 const nextWeek=addDays(weekId,7);
 const currentOrFuture=weekId>=weekStart(today);
 // A closed period never borrows current task contents or current priorities.
 const rows:Row[]=closed||historical?(snapshot?.tasks??[]):state.data.tasks;
 for(const task of rows){
  if(task.deletedAt)continue;
  const commitment=commitments.find(c=>c.taskId===task.id),own=task.ownerId===ownerId;
  const recursThisWeek=!!task.recurrenceId&&typeof task.occurrenceDate==='string'&&task.occurrenceDate>=weekId&&task.occurrenceDate<nextWeek;
  const recurringCollaborator=!own&&recursThisWeek&&(task.collaborators??[]).includes(ownerId);
  if(!own&&!commitment&&!recurringCollaborator&&!fixed?.has(task.id))continue;
  const priority=panelPriority(task,{...state,data:{...state.data,commitments}},weekId)||!!commitment?.isPriority;
  if(fixed){if(fixed.has(task.id))chosen.push({task,commitment,priority});continue;}
  const open=!task.archived&&!['Terminada','Cancelada'].includes(task.status);
  const completed=completedInWeek(task,weekId);
  const selected=Object.hasOwn(selections,task.id)?selections[task.id]===true:null;
  const boardPrepThisWeek=typeof task.boardMeetingDate==='string'&&task.dueDate>=weekId&&task.dueDate<nextWeek;
  const automatic=(recursThisWeek||boardPrepThisWeek||currentOrFuture&&priority)&&(open||completed)&&!task.archived;
  if(commitment||own&&completed||!task.archived&&(selected===true||selected!==false&&automatic)){
   chosen.push({task,commitment,priority,...(recurringCollaborator?{recurringCollaborator:true}:{})});
  }
  else if(own&&open)rest.push({task,priority});
 }
 const sort=(a:WeekTask,b:WeekTask)=>Number(b.priority)-Number(a.priority)||(a.task.dueDate||'9999').localeCompare(b.task.dueDate||'9999')||a.task.title.localeCompare(b.task.title,'es');
 return {selected:chosen.sort(sort),rest:rest.sort(sort)};
}
