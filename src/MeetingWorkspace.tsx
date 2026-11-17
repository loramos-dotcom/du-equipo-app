import './meeting-workspace.css';
import {ArrowRight,Check,Clock,Flag,Plus,Pencil,Trash2,Minus} from 'lucide-react';
import type {Collection,Row,State} from '../shared/model';
import {addDays,formatDate,rangeLabel,weekStart} from '../shared/model';
import {meetingWeekWork,meetingWorkRows} from '../shared/meetings';
import type {MeetingWork} from '../shared/meetings';
import {managementAreaKey} from '../shared/project-portfolios';
import {projectAreaLabels} from './gestion/du-portfolio';
import Avatar from './Avatar';
import {AreaBadge} from './AreaBadge';

type Props={state:State;meeting:Row;actorId:string;person:string;coordinator:boolean;today:string;onOpen:(entity:Collection,id:string)=>void;onPriority:(priority?:any,remove?:boolean)=>void;onPlan:()=>void;onWeek:(week:string)=>void;onOutcome:(commitment:Row)=>void};
export default function MeetingWorkspace({state,meeting,actorId,person,coordinator,today,onOpen,onPriority,onPlan,onWeek,onOutcome}:Props){
 const d=state.data,scheduled=!!meeting.id,closed=['Cerrada','Cancelada'].includes(meeting.status),snapshot=meeting.status==='Cerrada'?state.snapshots.find(s=>s.kind==='meeting'&&s.targetId===meeting.id&&s.version===meeting.closeVersion)?.payload:null;
 const frozen=meeting.status==='Cerrada',empty:MeetingWork={commitments:[],tasks:[],closed:true};
 const review:MeetingWork=frozen?snapshot?.workReview??empty:meetingWeekWork(state,meeting.weekId,today),planning:MeetingWork=frozen?snapshot?.workPlanning??empty:meetingWeekWork(state,meeting.planningWeekId,today);
 const previous=meetingWorkRows(review,person),upcoming=meetingWorkRows(planning,person),priorities=(snapshot?.meeting??meeting).teamPriorities??[],own=person===actorId;
 function name(id:string,work:MeetingWork){return (snapshot?.members??work.members??d.members).find((member:Row)=>member.id===id)?.name??'Integrante';}
 function row(item:ReturnType<typeof meetingWorkRows>[number],work:MeetingWork,reviewing:boolean){
  const {task,commitment:c,ownerId}=item,liveTask=task&&d.tasks.find(row=>row.id===task.id),liveCommitment=c&&d.commitments.find(row=>row.id===c.id),label=c?.outcome||task?.status||'Sin resultado registrado';
  const canResult=reviewing&&!closed&&!work.closed&&liveCommitment&&(coordinator||ownerId===actorId),done=['Cumplido','Terminada'].includes(label);
  const project=work.projects?.find(row=>row.id===task?.projectId),areaIds=[...(project?.areaIds??[]),...(project?.areaId?[project.areaId]:[])],areaKeys=[...new Set<string>([...areaIds.map(managementAreaKey),...(project?.areaKeys??[])])];
  const areas=areaKeys.map(key=>({key,name:work.areas?.find(area=>managementAreaKey(area.id)===key)?.name??projectAreaLabels[key]})).filter(area=>area.name);
  return <article className="meeting-review-row" key={ownerId+':'+(task?.id??c?.id)}>
   <div><button className="text-button meeting-task-title" disabled={!liveTask&&!liveCommitment} onClick={()=>task&&liveTask?onOpen('tasks',task.id):c&&onOpen('commitments',c.id)}>{task?.title??c?.result??'Tarea no disponible'}</button>
   <div className="meeting-task-meta">{project&&<span>{project.title}</span>}{areas.map(area=><AreaBadge key={area.key} area={area.key} label={area.name}/>)}{!person&&<span className="person"><Avatar member={(snapshot?.members??work.members??d.members).find((member:Row)=>member.id===ownerId)} small/>{name(ownerId,work)}</span>}</div>
   {c?.result&&c.result!==task?.title&&task&&<p className="meeting-task-advance">{c.result}</p>}{c?.outcomeNote&&<p>{c.outcomeNote}</p>}
   <div className="meeting-row-outcome"><span className={'meeting-outcome '+(done?'done':label==='No cumplido'?'missed':'pending')}>{done?<Check size={14}/>:label==='No cumplido'?<span>×</span>:c?.outcome?<Minus size={14}/>:<Clock size={14}/>}{label}</span>{canResult&&<button className="text-button" onClick={()=>onOutcome(liveCommitment)}>Registrar resultado</button>}</div></div>
  </article>;
 }
 return <div className="meeting-workspace"><section className="meeting-review" aria-label="Semana revisada"><div className="meeting-column-heading"><h2>{meeting.weekId===weekStart(today)?'Esta semana':meeting.weekId===addDays(weekStart(today),-7)?'Semana pasada':'Semana revisada'}</h2><p>{rangeLabel(meeting.weekId)}</p></div><div className="meeting-review-rows">{previous.length?previous.map(item=>row(item,review,true)):<p className="desk-empty-copy">Sin tareas registradas para esta semana.</p>}</div>{person&&<button className="text-button desk-section-link" onClick={()=>onWeek(meeting.weekId)}>Ver esta semana <ArrowRight size={14}/></button>}</section>
 <section className="meeting-planning" aria-label="Prioridades de la semana"><div className="meeting-column-heading"><h2>{meeting.planningWeekId===addDays(weekStart(today),7)?'Próxima semana':meeting.planningWeekId===weekStart(today)?'Esta semana':'Semana a planificar'}</h2><p>{rangeLabel(meeting.planningWeekId)}</p></div><section className="meeting-team-priorities" aria-label="Prioridades del equipo"><div className="meeting-priority-heading"><h3>Prioridades del equipo</h3><Flag size={17}/></div>{priorities.length?<ol className="meeting-priority-list">{priorities.map((priority:any)=><li key={priority.id}><p>{priority.text}</p>{coordinator&&scheduled&&!closed&&<div className="meeting-priority-actions"><button className="icon" aria-label={'Editar prioridad '+priority.text} onClick={()=>onPriority(priority)}><Pencil size={14}/></button><button className="icon" aria-label={'Eliminar prioridad '+priority.text} onClick={()=>onPriority(priority,true)}><Trash2 size={14}/></button></div>}</li>)}</ol>:<p className="desk-empty-copy">{!scheduled?'Todavía no hay una reunión abierta para esta semana.':coordinator?'Definí qué necesita impulsar el equipo.':'Coordinación todavía no cargó las prioridades de esta reunión.'}</p>}{coordinator&&scheduled&&!closed&&<button className="btn small-btn" onClick={()=>onPriority()}><Plus size={14}/>Agregar prioridad del equipo</button>}</section>
 <section className="meeting-my-priorities" aria-label="Tareas de la próxima semana"><div className="meeting-priority-heading"><h3>Tareas</h3><span className="desk-count">{upcoming.length}</span></div>{upcoming.length?<div className="meeting-planning-rows">{upcoming.map(item=>row(item,planning,false))}</div>:<p className="desk-empty-copy">Sin tareas planificadas.</p>}{person&&(own||coordinator)&&!closed&&!planning.closed&&<button className="btn small-btn" onClick={onPlan}><Plus size={14}/>{own?'Planificar mi prioridad':'Planificar tarea'}</button>}{person&&<button className="text-button desk-section-link" onClick={()=>onWeek(meeting.planningWeekId)}>Ver próxima semana <ArrowRight size={14}/></button>}</section></section></div>;
}
