import {calendarDay} from './calendar.ts';
import type {TeamEvent} from './calendar.ts';
import {addDays,normalize} from './model.ts';
import type {Row} from './model.ts';

export type SharedBoardEvent={event:TeamEvent;calendarOwnerId:string};

export function boardAreaId(title:string):string|undefined{
 const text=normalize(title).trim().replace(/^[^a-z0-9]+/,'');
 if(/^(?:seg\.?|seguimiento)\s+mensual\s+(?:uni|universidad)\s+de\s+la\s+ciudad$/.test(text))return 'universidad';
 const board=text.match(/^tablero\s+(.+?)\s*[-–—]\s*(?:seg\.?|seguimiento)\s+quincenal$/);
 if(!board)return;
 const label=board[1].trim();
 if(/^(?:ssgda|gestion del aprendizaje(?:\s*[-–—/]\s*ssgda)?)$/.test(label))return 'ssgda';
 if(/^(?:ssgad|ssgefyar)(?:\s*\/\s*(?:ssgad|ssgefyar))?$/.test(label))return 'ssgad';
 if(['agencia','privada','sspie','sstedu','ueicee'].includes(label))return label;
}

export function boardPreparationProject(projects:Row[]):Row|undefined{
 const matches=projects.filter(project=>!project.external&&!project.deletedAt&&!project.archived&&
  ['Activo','En preparación'].includes(project.status)&&normalize(project.title??'').trim()==='tareas recurrentes');
 return matches.length===1?matches[0]:undefined;
}

export function boardMeetings(events:TeamEvent[],areas:Row[],members:Row[]){
 return events.flatMap(event=>{
  if(!Number.isFinite(Date.parse(event.start)))return [];
  const areaId=boardAreaId(event.title);
  const area=areas.find(row=>row.id===areaId&&row.active&&!row.deletedAt);
  const responsible=area&&members.find(row=>row.id===area.leadId&&row.active&&!row.deletedAt);
  return area&&responsible?[{event,area,responsible,day:calendarDay(event.start,event.allDay)}]:[];
 }).sort((a,b)=>a.event.start.localeCompare(b.event.start));
}

export function weeklyBoardMeetings(events:SharedBoardEvent[],projects:Row[],areas:Row[],members:Row[],week:string){
 const project=boardPreparationProject(projects);
 const calendarOwnerId=project?.createdBy??project?.leadId;
 if(!calendarOwnerId)return [];
 const nextWeek=addDays(week,7);
 const shared=events.filter(row=>row.calendarOwnerId===calendarOwnerId).map(row=>row.event);
 return boardMeetings(shared,areas,members).filter(({day})=>day>=week&&day<nextWeek);
}
