import {ArrowRight,CalendarDays,ClipboardList} from 'lucide-react';

export function RecordType({kind}:{kind:'task'|'commitment'}){
 const Icon=kind==='task'?ClipboardList:CalendarDays;
 return <span className={'record-type record-type-'+kind}><Icon size={15} aria-hidden="true"/>{kind==='task'?'Tarea':'Compromiso semanal'}</span>;
}

export function WorkFlow({active,onTasks,onWeek}:{active:'task'|'commitment';onTasks:()=>void;onWeek:()=>void}){
 return <nav className="work-flow" aria-label="Cómo se organiza el trabajo"><button className={'work-flow-step task-step '+(active==='task'?'current':'')} aria-current={active==='task'?'step':undefined} onClick={onTasks}><RecordType kind="task"/><strong>¿Qué hay que hacer?</strong><span>El trabajo completo, que puede llevar varias semanas.</span><small>Ejemplo: preparar el informe.</small></button><ArrowRight className="work-flow-arrow" size={21} aria-hidden="true"/><button className={'work-flow-step commitment-step '+(active==='commitment'?'current':'')} aria-current={active==='commitment'?'step':undefined} onClick={onWeek}><RecordType kind="commitment"/><strong>¿Qué vas a lograr esta semana?</strong><span>Un avance concreto de una tarea, con su propio resultado.</span><small>Ejemplo: validar los datos de dos áreas.</small></button></nav>;
}

export function TaskIdentity(){return <div className="task-identity"><RecordType kind="task"/></div>;}

