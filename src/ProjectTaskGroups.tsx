import type {ReactNode} from 'react';
import type {Row} from '../shared/model';

const isPending=(task:Row)=>!task.deletedAt&&!task.archived&&!['Terminada','Cancelada'].includes(task.status);

export function ProjectPendingTasks({rows,onOpen}:{rows:Row[];onOpen:(taskId:string)=>void}){
 const pending=rows.filter(isPending);
 return <section className="project-summary-pending" aria-label="Pendientes">
  <h3>Pendientes</h3>
  {pending.length?<ul>{pending.map(task=><li key={task.id} data-task-id={task.id}>
   <button type="button" className="text-button task-name" onClick={()=>onOpen(task.id)}>{task.title}</button>
  </li>)}</ul>:<p className="muted-text">No hay tareas pendientes.</p>}
 </section>;
}

export default function ProjectTaskGroups({rows,renderRows}:{rows:Row[];renderRows:(rows:Row[])=>ReactNode}){
 const visible=rows.filter(task=>!task.deletedAt);
 if(!visible.length)return <p className="muted-text">Todavía no hay tareas vinculadas a este proyecto.</p>;
 const groups=[
  {key:'pending',label:'Pendientes',rows:visible.filter(isPending),empty:'No hay tareas pendientes.'},
  {key:'finished',label:'Finalizadas',rows:visible.filter(task=>task.status==='Terminada'),empty:'Todavía no hay tareas finalizadas.'},
  {key:'cancelled',label:'Canceladas',rows:visible.filter(task=>task.status==='Cancelada'),empty:''},
 ];
 return <div className="project-task-groups">{groups.filter(group=>group.key!=='cancelled'||group.rows.length>0).map(group=><section key={group.key} className={'project-task-group project-task-group--'+group.key} aria-label={group.label}><div className="project-task-group-heading"><h4>{group.label} <span className="desk-count" aria-hidden="true">{group.rows.length}</span></h4></div>{group.rows.length?renderRows(group.rows):<p className="muted-text">{group.empty}</p>}</section>)}</div>;
}
