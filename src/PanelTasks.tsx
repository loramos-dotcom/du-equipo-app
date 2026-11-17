import {panelPriority} from '../shared/task-priority';
import type {ReactNode} from 'react';
import type {Row,State} from '../shared/model';

type Props={state:State;week:string;rows:Row[];total:number;page:number;loading:boolean;error:string;view:string;filters:ReactNode;results:ReactNode;pagination:ReactNode;empty:ReactNode;renderRows:(rows:Row[],separatorBefore?:string)=>ReactNode;pending:boolean};
export default function PanelTasks({state,week,rows,total,page,loading,error,view,filters,results,pagination,empty,renderRows,pending}:Props){
 const priorities=pending?rows.filter(task=>panelPriority(task,state,week)):[],others=pending?rows.filter(task=>!panelPriority(task,state,week)):rows;
 const ordered=pending?[...priorities,...others]:rows,separator=priorities.length&&others.length?others[0].id:undefined;
 return <section id="tasks-list" className="panel-tasks" aria-label="Listado de tareas" tabIndex={-1}>{filters}{results}{error?<div className="form-error" role="alert">{error}</div>:loading?<p className="panel-tasks-loading" role="status">Cargando tareas…</p>:!total?empty:<section className={'desk-section panel-task-surface'+(view==='board'?' panel-task-board':'')} aria-label={view==='board'?'Tablero de tareas':'Tareas'}>{renderRows(ordered,separator)}</section>}{(total>50||page>0)&&pagination}</section>;
}
