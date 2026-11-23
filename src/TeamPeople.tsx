import {ArrowRight,CalendarDays,MoreHorizontal} from 'lucide-react';
import type {Collection,Row,State} from '../shared/model';
import {formatDate} from '../shared/model';
import type {SharedAgenda} from './useSharedAgenda';
import {calendarPresence} from '../shared/calendar';
import {weeklyTasks} from '../shared/weekly-tasks';
import {areaTheme} from './area-colors';
import Avatar from './Avatar';
type Props={state:State;members:Row[];week:string;today:string;agenda:SharedAgenda;coordinator:boolean;onEdit:(member:Row)=>void;onOpen:(entity:Collection,id:string)=>void;onWeek:(id:string)=>void;onArea:(id:string)=>void};
export default function TeamPeople({state,members,week,today,agenda,coordinator,onEdit,onOpen,onWeek,onArea}:Props){
 const {areas:teamAreas}=state.data;
 return <><div className="people-grid">{members.map(m=>{
  const {selected}=weeklyTasks(state,week,m.id,today);
  const presence=calendarPresence(m.id,agenda.events,agenda.connections,agenda.now,!!agenda.error),areas=teamAreas.filter(a=>a.active&&(a.leadId===m.id||(a.substitutes??[]).includes(m.id)));
  return <article className="people-card" key={m.id}>
   <div className="people-card-top">
    <Avatar member={m} className="people-avatar"/>
    <h2>{m.name}</h2>
    {coordinator&&<button className="icon" aria-label={'Editar '+m.name} onClick={()=>onEdit(m)}><MoreHorizontal size={18}/></button>}
   </div>
   <div className="people-areas">{areas.map(a=><button key={a.id} className="area-control" {...areaTheme(a.id)} onClick={()=>onArea(a.id)}>{a.name}</button>)}{!areas.length&&<span>Equipo DU</span>}</div>
   <div className="people-work-heading">
    <span><CalendarDays size={14}/> Tareas de la semana</span><strong>{selected.length}</strong>
   </div>
   <div className="people-work">
    {selected.length ? selected.map(({task,commitment})=>{
     const dueDate=commitment?.targetDate||task.dueDate;
     const completed=task.status==='Terminada';
     return <button key={task.id} className="people-work-row" onClick={()=>onOpen('tasks',task.id)}>
      <span className={'people-work-mark'+(completed?' is-done':'')} aria-hidden="true">{completed?'✓':'·'}</span>
      <span><strong>{task.title}</strong><small>{task.status}{dueDate?' · '+formatDate(dueDate):''}</small></span>
     </button>;
    }) : <p className="desk-empty-copy">Sin tareas asignadas para esta semana.</p>}
   </div><div className={'people-presence '+presence.kind}><span className="dot"/><span><strong>{presence.label}</strong><small>Agenda compartida{presence.updated?' · '+new Intl.DateTimeFormat('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(presence.updated)):''}</small></span></div><button className="text-button people-week-link" onClick={()=>onWeek(m.id)}>Ver resto de tareas <ArrowRight size={15}/></button></article>;
 })}</div><p className="people-agenda-note">La disponibilidad refleja solo reuniones con horario de los calendarios compartidos. Los eventos privados y los calendarios no compartidos no se muestran.</p></>;
}

