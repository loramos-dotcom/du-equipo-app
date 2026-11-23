import {ArrowRight,CalendarDays,Check,ChevronDown,ListTodo,MoreHorizontal} from 'lucide-react';
import type {Collection,Row,State} from '../shared/model';
import {formatDate} from '../shared/model';
import type {SharedAgenda} from './useSharedAgenda';
import {calendarPresence} from '../shared/calendar';
import {weeklyBoardMeetings} from '../shared/board-followups';
import {weeklyTasks} from '../shared/weekly-tasks';
import {areaTheme} from './area-colors';
import Avatar from './Avatar';
type Props={state:State;members:Row[];week:string;today:string;agenda:SharedAgenda;coordinator:boolean;onEdit:(member:Row)=>void;onOpen:(entity:Collection,id:string)=>void;onWeek:(id:string)=>void;onArea:(id:string)=>void};
const weekday=new Intl.DateTimeFormat('es-AR',{weekday:'short',timeZone:'America/Argentina/Buenos_Aires'});
const agendaTime=new Intl.DateTimeFormat('es-AR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Argentina/Buenos_Aires'});

export default function TeamPeople({state,members,week,today,agenda,coordinator,onEdit,onOpen,onWeek,onArea}:Props){
 const {areas:teamAreas,projects}=state.data;
 const weeklyBoards=weeklyBoardMeetings(agenda.boardEvents,projects,teamAreas,state.data.members,week);
 return <><div className="people-grid">{members.map(m=>{
  const {selected}=weeklyTasks(state,week,m.id,today);
  const presence=calendarPresence(m.id,agenda.events,agenda.connections,agenda.now,!!agenda.error),areas=teamAreas.filter(a=>a.active&&(a.leadId===m.id||(a.substitutes??[]).includes(m.id)));
  const boards=state.settings.boardParticipantIds?.includes(m.id)
   ?weeklyBoards
   :weeklyBoards.filter(({responsible})=>responsible.id===m.id);
  const agendaUpdated=presence.updated&&Number.isFinite(Date.parse(presence.updated))?presence.updated:null;
  const presenceClass='people-presence '+presence.kind;
  const presenceLabel=<><span className="dot" aria-hidden="true"/><span>{presence.label}</span></>;
  return <article className="people-card" key={m.id}>
   <header className="people-card-top">
    <Avatar member={m} className="people-avatar"/>
    <div className="people-identity">
     <h2>{m.name}</h2>
     {areas.length>0&&<div className="people-areas">{areas.map(a=><button key={a.id} className="area-control" {...areaTheme(a.id)} onClick={()=>onArea(a.id)}>{a.name}</button>)}</div>}
    </div>
    {coordinator&&<button className="icon" aria-label={'Editar '+m.name} onClick={()=>onEdit(m)}><MoreHorizontal size={18} aria-hidden="true"/></button>}
   </header>
   <div className="people-card-body">
    <section aria-labelledby={'people-tasks-'+m.id}>
     <h3 className="people-section-heading people-work-heading" id={'people-tasks-'+m.id}>
      <ListTodo size={14} aria-hidden="true"/>Tareas <strong aria-hidden="true">{selected.length}</strong>
     </h3>
     <div className="people-work">
      {selected.length ? selected.map(({task,commitment})=>{
       const dueDate=commitment?.targetDate||task.dueDate;
       const projectTitle=projects.find(project=>project.id===task.projectId)?.title??(task.projectId?'Proyecto no disponible':'Sin proyecto');
       const completed=task.status==='Terminada';
       return <button key={task.id} className="people-work-row" onClick={()=>onOpen('tasks',task.id)}>
        <span className={'people-work-mark'+(completed?' is-done':'')} aria-hidden="true">{completed?<Check size={10}/>:<span/>}</span>
        <span><strong>{task.title}</strong><small>{projectTitle}{dueDate?' · '+formatDate(dueDate):''}</small></span>
       </button>;
      }) : <p className="desk-empty-copy">Sin tareas asignadas para esta semana.</p>}
     </div>
    </section>
    {boards.length>0&&<section className="people-boards" aria-labelledby={'people-boards-'+m.id}>
     <h3 className="people-section-heading" id={'people-boards-'+m.id}><CalendarDays size={14} aria-hidden="true"/>Tableros</h3>
     <ul>{boards.map(({event,area,day})=><li key={event.id}>
      <strong>{area.name}</strong>
      <time dateTime={event.start}>
       {weekday.format(new Date(day+'T12:00:00Z')).replace(/\.$/,'')} {day.slice(8,10)}/{day.slice(5,7)} · {event.allDay?'Todo el día':agendaTime.format(new Date(event.start))}
      </time>
     </li>)}</ul>
    </section>}
   </div>
   <footer className="people-card-footer">
    {agendaUpdated?<details className="people-presence-details">
     <summary className={presenceClass}>{presenceLabel}<ChevronDown size={11} aria-hidden="true"/></summary>
     <span className="people-presence-updated">
      Última actualización <time dateTime={agendaUpdated}>{formatDate(agendaUpdated)} · {agendaTime.format(new Date(agendaUpdated))}</time>
     </span>
    </details>:<span className={presenceClass}>{presenceLabel}</span>}
    <button className="text-button people-week-link" onClick={()=>onWeek(m.id)}>Ver resto de tareas <ArrowRight size={14} aria-hidden="true"/></button>
   </footer>
  </article>;
 })}</div><p className="people-agenda-note">La disponibilidad refleja solo reuniones con horario de los calendarios compartidos. Los eventos privados y los calendarios no compartidos no se muestran.</p></>;
}

