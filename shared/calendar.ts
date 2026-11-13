import type {Row} from './model.ts';
import {dateInBA,normalize} from './model.ts';
export type CalendarChoice={id:string;name:string;primary?:boolean};
export type TeamEvent={id:string;title:string;start:string;end:string;allDay:boolean;location:string;url:string;meetUrl:string;updated:string;memberIds:string[]};
export function calendarPresence(memberId:string,events:TeamEvent[],connections:{memberId:string;syncedAt:string|null;syncError:string|null}[],now:number,unavailable=false){
 const connection=connections.find(c=>c.memberId===memberId),updated=connection?.syncedAt??null;
 const fresh=(c:{syncedAt:string|null;syncError:string|null})=>!c.syncError&&!!c.syncedAt&&Number.isFinite(Date.parse(c.syncedAt))&&now-Date.parse(c.syncedAt)<=600000;
 const current=events.find(e=>!e.allDay&&e.memberIds.includes(memberId)&&Date.parse(e.start)<=now&&Date.parse(e.end)>now&&connections.some(c=>e.memberIds.includes(c.memberId)&&fresh(c)));
 if(!unavailable&&current)return {kind:'busy',label:'En reunión',updated:connections.find(c=>current.memberIds.includes(c.memberId)&&fresh(c))!.syncedAt};
 if(unavailable||connection?.syncError||updated&&(!Number.isFinite(Date.parse(updated))||now-Date.parse(updated)>600000))return {kind:'unknown',label:'Agenda sin actualizar',updated};
 if(!updated)return {kind:'unknown',label:'Sin agenda compartida',updated};
 return {kind:'available',label:'Sin reuniones ahora',updated};
}
export function mergeCalendarEvents(connections:{memberId:string;events:TeamEvent[]}[]):TeamEvent[]{
 const events=new Map<string,TeamEvent>();
 for(const connection of connections)for(const event of connection.events){const previous=events.get(event.id),members=[...new Set([...(previous?.memberIds??[]),connection.memberId,...event.memberIds])];events.set(event.id,{...(previous&&previous.updated>event.updated?previous:event),memberIds:members});}
 return [...events.values()].sort((a,b)=>a.start.localeCompare(b.start));
}
export const canEditCalendarMinutes=(meeting:Row,actorId:string,coordinator:boolean)=>coordinator||meeting.calendarOwnerId===actorId||(meeting.attendees??[]).includes(actorId);
export const calendarDay=(start:string,allDay=false)=>allDay||!/(?:Z|[+-]\d{2}:\d{2})$/.test(start)?start.slice(0,10):dateInBA(new Date(start));
export function calendarFollowups(events:TeamEvent[],memberId:string,now:number):TeamEvent[]{
 const today=dateInBA(new Date(now));
 const at=(event:TeamEvent)=>Date.parse(event.allDay?event.start+'T00:00:00-03:00':event.start);
 return [...new Map(events.filter(event=>{
  const title=normalize(event.title).replace(/^[^a-z0-9]+/,'');
  const followup=/^(?:(?:reunion|seguimiento)(?:\s+de)?\s*[:\-–—]?\s+)?tablero\b/.test(title)||/^(?:seg\.?|seguimiento)\s+mensual\s+(?:uni|universidad)\s+de\s+la\s+ciudad\b/.test(title);
  return event.memberIds.includes(memberId)&&followup&&Number.isFinite(at(event))&&Number.isFinite(Date.parse(event.end))&&(event.allDay?calendarDay(event.end,true)>today:Date.parse(event.end)>now);
 }).map(event=>[event.id,event])).values()].sort((left,right)=>{
  return at(left)-at(right)||left.title.localeCompare(right.title,'es');
 });
}
export function calendarMinutesTemplate(event:Pick<TeamEvent,'title'|'start'|'allDay'>,names:string[]){return `${event.title}\nFecha: ${event.start}${event.allDay?' · Todo el día':''}\nParticipantes DU: ${names.join(', ')||'Por confirmar'}\n\nTEMAS TRATADOS\n\n\nACUERDOS Y RESPONSABLES\n\n\nPRÓXIMOS PASOS\n\n`;}
