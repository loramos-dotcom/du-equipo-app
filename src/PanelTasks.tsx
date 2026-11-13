import {panelPriority} from '../shared/task-priority';
import {CheckCircle2,Flag} from 'lucide-react';
import type {ReactNode} from 'react';
import type {Row,State} from '../shared/model';

type Props={state:State;week:string;rows:Row[];total:number;page:number;loading:boolean;error:string;view:string;filters:ReactNode;results:ReactNode;pagination:ReactNode;empty:ReactNode;renderRows:(rows:Row[])=>ReactNode;pending:boolean};
export default function PanelTasks({state,week,rows,total,page,loading,error,view,filters,results,pagination,empty,renderRows,pending}:Props){
 const isPriority=(task:Row)=>panelPriority(task,state,week);
 function group(title:string,items:Row[],important=false){return <section className={'desk-section '+(important?'desk-priorities':'')} aria-label={title}><div className="desk-section-heading"><div><h2>{title} <span className="desk-count" aria-hidden="true">{items.length}</span></h2></div>{important?<Flag size={18}/>:<CheckCircle2 size={18}/>}</div>{items.length?renderRows(items):<p className="desk-empty-copy">{important?'No hay pendientes prioritarios en esta vista.':'No hay otros pendientes en esta vista.'}</p>}</section>;}
 return <section id="tasks-list" className="panel-tasks" aria-label="Listado de tareas" tabIndex={-1}>{filters}{results}{error?<div className="form-error" role="alert">{error}</div>:loading?<p className="panel-tasks-loading" role="status">Cargando tareas…</p>:!total?empty:view==='board'?<section className="desk-section panel-task-board" aria-label="Tablero de tareas">{renderRows(rows)}</section>:pending?<>{group('Pendientes prioritarios',rows.filter(isPriority),true)}{group('Otros pendientes',rows.filter(t=>!isPriority(t)))}</>:<section className="desk-section" aria-label="Resultados de tareas"><div className="desk-section-heading"><h2>Tareas de esta vista <span className="desk-count" aria-hidden="true">{total}</span></h2><CheckCircle2 size={18}/></div>{renderRows(rows)}</section>}{total>50&&<p className="panel-task-page-note">Los grupos muestran las tareas de esta página.</p>}{(total>50||page>0)&&pagination}</section>;
}
