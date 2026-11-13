import type {ReactNode} from 'react';
import {ArrowUpRight,CalendarDays,CalendarClock,FileText,Flag} from 'lucide-react';
import type {Row} from '../shared/model';
import {formatDate,rangeLabel} from '../shared/model';
import {RecordType} from './WorkMeaning';

type Props={commitment:Row;task?:Row;projectTitle?:string;closed?:boolean;editable?:boolean;help?:ReactNode;onTask?:()=>void;onDetail:()=>void;onEdit:()=>void;onOutcome:()=>void;onReschedule:()=>void;onAcknowledge:()=>void;status:(value:string)=>ReactNode};
export default function WeeklyCommitmentCard({commitment:c,task,projectTitle,closed,editable,help,onTask,onDetail,onEdit,onOutcome,onReschedule,onAcknowledge,status}:Props){
 return <article className="weekly-promise-card" aria-label={'Compromiso semanal: '+c.result}>
  <header className="weekly-promise-head"><RecordType kind="commitment"/><span className="weekly-promise-week"><CalendarDays size={14} aria-hidden="true"/>{rangeLabel(c.weekId)}</span>{c.isPriority&&<span className="weekly-priority"><Flag size={13} aria-hidden="true"/>Prioritario</span>}{closed&&<span className="badge">Semana cerrada</span>}</header>
  <div className="weekly-promise-body"><span className="weekly-promise-question">LO ACORDADO PARA ESTA SEMANA</span><h3 className="weekly-promise-title">{c.result}</h3><div className="weekly-promise-date"><CalendarClock size={15} aria-hidden="true"/>{c.targetDate?'Para el '+formatDate(c.targetDate):'Durante esta semana'}<span>· {c.category==='Incorporada durante la semana'?'Agregado durante la semana':'Parte del plan inicial'}</span></div>
   <div className="promise-task-reference"><div><span className="reference-label">AVANCE DE LA TAREA</span><button className="text-button" disabled={!onTask} onClick={onTask}>{task?.title??'Trabajo de la versión cerrada'}<ArrowUpRight size={14} aria-hidden="true"/></button><small>{task?.code}{projectTitle?' · '+projectTitle:''}</small></div><div className="reference-task-state"><span>Estado del trabajo completo</span>{status(task?.status??'Sin información')}</div></div>
   {c.transferPending&&<div className="transfer-banner">Compromiso transferido pendiente de confirmar {editable&&<button className="text-button" onClick={onAcknowledge}>Reconocer transferencia</button>}</div>}
   {c.progress&&<div className="weekly-progress"><span className="reference-label">AVANCE REGISTRADO</span><p>{c.progress}</p></div>}
   {help}
  </div>
  <footer className="weekly-promise-footer"><div className="weekly-outcome"><span>Resultado de este compromiso</span>{c.outcome?status(c.outcome):<strong className="weekly-result-pending">Sin registrar</strong>}</div>{editable&&<button className="btn primary" onClick={onOutcome}>{c.outcome?'Revisar resultado':'Registrar resultado'}</button>}</footer>
  {c.outcomeNote&&<div className="weekly-outcome-note"><span className="reference-label">QUÉ SE LOGRÓ</span><p>{c.outcomeNote}</p></div>}
  <div className="weekly-promise-actions"><button className="text-button" onClick={onDetail}>Ver compromiso <ArrowUpRight size={13}/></button>{editable&&<><button className="text-button" onClick={onEdit}><FileText size={14}/>Editar compromiso</button><button className="text-button" onClick={onReschedule}><CalendarClock size={14}/>Mover a otra semana</button></>}</div>
 </article>;
}
