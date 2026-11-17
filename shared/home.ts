import type {Row,State} from './model.ts';
import {dateInBA} from './model.ts';
import {calendarDay,calendarFollowups} from './calendar.ts';
import type {TeamEvent} from './calendar.ts';

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

export type PanelAgendaItem={id:string;title:string;date:string;day:string;at:number;allDay:boolean;kind:'meeting'|'followup'|'weekly';meetingId?:string};
export function panelAgenda(events:TeamEvent[],meetings:Row[],actorId:string,now:number):PanelAgendaItem[]{
 const today=dateInBA(new Date(now)),instant=(value:string,allDay=false)=>Date.parse(allDay?value.slice(0,10)+'T00:00:00-03:00':/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:value+'-03:00');
 const calendar=new Map<string,TeamEvent>();
 for(const event of events){
  if(!event.memberIds.includes(actorId)||!Number.isFinite(instant(event.start,event.allDay))||!Number.isFinite(instant(event.end,event.allDay))||(event.allDay?calendarDay(event.end,true)<=today:instant(event.end)<=now))continue;
  const previous=calendar.get(event.id);if(!previous||event.updated>=previous.updated)calendar.set(event.id,event);
 }
 const followups=new Set(calendarFollowups([...calendar.values()],actorId,now).map(event=>event.id));
 const rows:PanelAgendaItem[]=[...calendar.values()].map(event=>({id:'calendar:'+event.id,title:event.title,date:event.start,day:calendarDay(event.start,event.allDay),at:instant(event.start,event.allDay),allDay:event.allDay,kind:followups.has(event.id)?'followup':'meeting'}));
 const seen=new Set<string>();
 for(const meeting of meetings){
  if(seen.has(meeting.id)||meeting.calendarEventKey||meeting.archived||meeting.deletedAt||['Cerrada','Cancelada'].includes(meeting.status)||!(meeting.attendees??[]).includes(actorId)||meeting.date?.slice(0,10)<today||!Number.isFinite(instant(meeting.date??'')))continue;
  seen.add(meeting.id);rows.push({id:'weekly:'+meeting.id,title:meeting.title,date:meeting.date,day:meeting.date.slice(0,10),at:instant(meeting.date),allDay:false,kind:'weekly',meetingId:meeting.id});
 }
 return rows.sort((a,b)=>a.at-b.at||a.title.localeCompare(b.title,'es')||a.id.localeCompare(b.id));
}
