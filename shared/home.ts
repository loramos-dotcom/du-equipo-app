import type {Row,State} from './model.ts';

export function homeWork(state:State,actorId:string,currentWeek:string){
 const tasks=state.data.tasks.filter(t=>t.ownerId===actorId&&!t.archived&&!['Terminada','Cancelada'].includes(t.status))
  .sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.title.localeCompare(b.title));
 const completedTasks=state.data.tasks.filter(t=>t.ownerId===actorId&&!t.archived&&t.status==='Terminada')
  .sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||'')||a.title.localeCompare(b.title));
 const week=state.data.weeks.find(w=>w.id===currentWeek);
 const snapshot=week?.status==='Cerrada'?state.snapshots.find(s=>s.kind==='week'&&s.targetId===currentWeek&&s.version===week.closeVersion)?.payload:null;
 const weeklyTasks:Row[]=snapshot?.tasks??state.data.tasks;
 const commitments:Row[]=(snapshot?.commitments??state.data.commitments).filter((c:Row)=>c.weekId===currentWeek&&c.ownerId===actorId)
  .sort((a:Row,b:Row)=>Number(!!b.isPriority)-Number(!!a.isPriority)||Number(!!a.outcome)-Number(!!b.outcome)||(a.targetDate||'9999').localeCompare(b.targetDate||'9999')||a.id.localeCompare(b.id));
 return {tasks,completedTasks,commitments:commitments.map(commitment=>({commitment,task:weeklyTasks.find(t=>t.id===commitment.taskId)})),weekClosed:week?.status==='Cerrada'};
}
