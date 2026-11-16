import {useState} from 'react';
import type {DragEvent,ReactNode} from 'react';
import {ArrowDown,ArrowUp,ArrowUpRight,CalendarDays,Flag,GripVertical} from 'lucide-react';
import type {Row} from '../shared/model';
import {formatDate} from '../shared/model';
import type {WeekTask} from '../shared/weekly-tasks';
import {managementAreaKey} from '../shared/project-portfolios';
import {projectAreaLabels} from './gestion/du-portfolio';
import {AreaBadge} from './AreaBadge';

type Props={selected:WeekTask[];rest:WeekTask[];projects:Row[];areas:Row[];editable:boolean;closed:boolean;onMove:(task:Row,selected:boolean)=>Promise<void>;onOpen:(task:Row)=>void;onAdvance:(row:WeekTask)=>void;status:(value:string)=>ReactNode};
const dragType='application/x-du-week-task';
export default function WeeklyTasks({selected,rest,projects,areas,editable,closed,onMove,onOpen,onAdvance,status}:Props){
 const [dragged,setDragged]=useState(''),[target,setTarget]=useState<'week'|'rest'|null>(null),[pending,setPending]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function move(row:WeekTask,toWeek:boolean){
  if(!editable||pending)return;
  setError('');setPending(row.task.id);setDragged('');setTarget(null);
  try{await onMove(row.task,toWeek);setNotice(row.task.title+(toWeek?' agregada a la semana.':' movida al resto de tareas.'));}
  catch(e){setError((e as Error).message);}
  finally{setPending('');}
 }
 function drop(event:DragEvent,toWeek:boolean){
  event.preventDefault();setTarget(null);
  const id=event.dataTransfer.getData(dragType),row=(toWeek?rest:selected).find(row=>row.task.id===id);
  if(row&&(toWeek||!row.commitment))void move(row,toWeek);
 }
 function over(event:DragEvent,toWeek:boolean){
  if(!editable||pending||!Array.from(event.dataTransfer.types).includes(dragType))return;
  event.preventDefault();event.dataTransfer.dropEffect='move';setTarget(toWeek?'week':'rest');
 }
 function row(item:WeekTask,inWeek:boolean){
  const t=item.task,open=!t.archived&&!['Terminada','Cancelada'].includes(t.status),movable=editable&&open&&(!inWeek||!item.commitment);
  const project=projects.find(p=>p.id===t.projectId),areaIds=[...(project?.areaIds??[]),...(project?.areaId?[project.areaId]:[])];
  const areaKeys=[...new Set<string>([...areaIds.map(managementAreaKey),...(project?.areaKeys??[])])];
  const projectAreas=areaKeys.map(key=>({key,name:areas.find(area=>managementAreaKey(area.id)===key)?.name??projectAreaLabels[key]})).filter(area=>!!area.name);
  return <article key={t.id} className={'weekly-task-row'+(dragged===t.id?' is-dragging':'')+(pending===t.id?' is-saving':'')} draggable={movable&&!pending} aria-label={t.title} onDragStart={event=>{event.dataTransfer.setData(dragType,t.id);event.dataTransfer.effectAllowed='move';setDragged(t.id);setError('');}} onDragEnd={()=>{setDragged('');setTarget(null);}}>
   {movable&&<span className="weekly-task-grip" aria-hidden="true"><GripVertical size={18}/></span>}
   <div className="weekly-task-main"><button type="button" className="weekly-task-title" onClick={()=>onOpen(t)}>{t.title}</button><div className="weekly-task-meta"><span className="weekly-task-project">{project?.title??(t.projectId?'Proyecto no disponible':'Sin proyecto')}</span>{projectAreas.length>0&&<span className="weekly-task-areas" role="list" aria-label="Áreas del proyecto">{projectAreas.map(area=><AreaBadge className="weekly-task-area" role="listitem" key={area.key} area={area.key} label={area.name}/>)}</span>}{item.priority&&<span className="weekly-task-priority"><Flag size={12} aria-hidden="true"/>Prioritaria</span>}{t.dueDate&&<span>{formatDate(t.dueDate)}</span>}{item.commitment?.result!==undefined&&item.commitment.result!==t.title&&<span className="weekly-task-result">{item.commitment.result}</span>}</div></div>
   <div className="weekly-task-controls">{status(t.status)}{inWeek&&(editable||item.commitment)&&<button type="button" className="icon" aria-label={(item.commitment?'Ver avance semanal de ':'Detallar avance semanal de ')+t.title} title={item.commitment?'Ver avance semanal':'Detallar avance semanal'} onClick={()=>onAdvance(item)}><CalendarDays size={16}/></button>}{movable&&<button type="button" className="icon weekly-task-move" disabled={!!pending} aria-label={(inWeek?'Quitar de esta semana: ':'Agregar a esta semana: ')+t.title} title={inWeek?'Quitar de esta semana':'Agregar a esta semana'} onClick={()=>void move(item,!inWeek)}>{inWeek?<ArrowDown size={17}/>:<ArrowUp size={17}/>}</button>}<button type="button" className="icon" aria-label={'Abrir tarea: '+t.title} title="Abrir tarea" onClick={()=>onOpen(t)}><ArrowUpRight size={16}/></button></div>
  </article>;
 }
 return <div className="weekly-task-board" aria-busy={!!pending}>
  {error&&<p className="form-error" role="alert">{error}</p>}<span className="sr-only" role="status">{notice}</span>
  <section className={'weekly-task-section weekly-selected'+(target==='week'?' is-drop-target':'')} aria-label="Tareas de la semana" onDragOver={event=>over(event,true)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setTarget(null);}} onDrop={event=>drop(event,true)}>
   <div className="section-heading"><h2>Tareas de la semana <span>{selected.length}</span></h2></div>
   {selected.length?<div className="weekly-task-list">{selected.map(item=>row(item,true))}</div>:<p className="weekly-task-empty">{closed?'Sin tareas registradas.':editable?'Arrastrá una tarea a esta semana.':'Sin tareas seleccionadas.'}</p>}
  </section>
  {!closed&&<section className={'weekly-task-section weekly-rest'+(target==='rest'?' is-drop-target':'')} aria-label="Resto de tareas" onDragOver={event=>over(event,false)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setTarget(null);}} onDrop={event=>drop(event,false)}>
   <div className="section-heading"><h2>Resto de tareas <span>{rest.length}</span></h2></div>
   {rest.length?<div className="weekly-task-list">{rest.map(item=>row(item,false))}</div>:<p className="weekly-task-empty">No hay otras tareas pendientes.</p>}
  </section>}
 </div>;
}
