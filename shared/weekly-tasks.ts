import type {Row,State} from './model.ts';
import {addDays,dateInBA,weekStart} from './model.ts';
import {panelPriority} from './task-priority.ts';

export type WeekTask={task:Row;commitment?:Row;priority:boolean};
export function weeklyTasks(state:State,weekId:string,ownerId:string,today=dateInBA(),historical?:any){
 const week=state.data.weeks.find(w=>w.id===weekId),closed=week?.status==='Cerrada';
 const snapshot=historical??(closed?state.snapshots.find(s=>s.kind==='week'&&s.targetId===weekId&&s.version===week.closeVersion)?.payload:null);
 const data=snapshot??state.data,commitments:Row[]=(data.commitments??[]).filter((c:Row)=>c.weekId===weekId&&c.ownerId===ownerId&&!c.deletedAt&&!c.archived);
 const plan=(data.plans??[]).find((p:Row)=>p.weekId===weekId&&p.ownerId===ownerId),selections=plan?.taskSelections??{};
 const fixed=closed||!!historical?new Set<string>(snapshot?.weekTaskIds?.[ownerId]??commitments.map(c=>c.taskId)):null;
 const chosen:WeekTask[]=[],rest:WeekTask[]=[];
 // A closed period never borrows current task contents or current priorities.
 const rows:Row[]=closed||historical?(snapshot?.tasks??[]):state.data.tasks;
 for(const task of rows){
  if(task.deletedAt)continue;
  const commitment=commitments.find(c=>c.taskId===task.id),own=task.ownerId===ownerId;
  if(!own&&!commitment&&!fixed?.has(task.id))continue;
  const priority=panelPriority(task,{...state,data:{...state.data,commitments}},weekId)||!!commitment?.isPriority;
  if(fixed){if(fixed.has(task.id))chosen.push({task,commitment,priority});continue;}
  const open=!task.archived&&!['Terminada','Cancelada'].includes(task.status);
  const completed=task.status==='Terminada'&&task.completedAt&&dateInBA(new Date(task.completedAt))>=weekId&&dateInBA(new Date(task.completedAt))<addDays(weekId,7);
  const selected=Object.hasOwn(selections,task.id)?selections[task.id]===true:null;
  const automatic=weekId>=weekStart(today)&&priority&&(open||completed)&&!task.archived;
  if(commitment||own&&completed||!task.archived&&(selected===true||selected!==false&&automatic))chosen.push({task,commitment,priority});
  else if(own&&open)rest.push({task,priority});
 }
 const sort=(a:WeekTask,b:WeekTask)=>Number(b.priority)-Number(a.priority)||(a.task.dueDate||'9999').localeCompare(b.task.dueDate||'9999')||a.task.title.localeCompare(b.task.title,'es');
 return {selected:chosen.sort(sort),rest:rest.sort(sort)};
}
