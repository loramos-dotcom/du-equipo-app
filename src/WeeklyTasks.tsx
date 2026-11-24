import {useCallback,useEffect,useRef,useState} from 'react';
import type {PointerEvent,ReactNode} from 'react';
import {ArrowDown,ArrowUp,ArrowUpRight,CalendarDays,Flag,GripVertical} from 'lucide-react';
import type {Row} from '../shared/model';
import {formatDate} from '../shared/model';
import type {WeekTask} from '../shared/weekly-tasks';
import {managementAreaKey} from '../shared/project-portfolios';
import {projectAreaLabels} from './gestion/du-portfolio';
import {AreaBadge} from './AreaBadge';

type Props={selected:WeekTask[];rest:WeekTask[];projects:Row[];areas:Row[];editable:boolean;closed:boolean;onMove?:(task:Row,selected:boolean)=>Promise<boolean>;onOpen:(task:Row)=>void;onAdvance:(row:WeekTask)=>void;status:(value:string)=>ReactNode};
type Section='week'|'rest';
type Point={x:number;y:number};
type TaskDrag={
 id:string;from:Section;source:Element;pointerId:number;start:Point;position:Point;
 frame:number|null;lastFrame:number|null;target:Section|null;
};
const adjustable=(item:WeekTask)=>!item.collaboration&&!item.task.archived&&!['Terminada','Cancelada'].includes(item.task.status);

export default function WeeklyTasks({selected,rest,projects,areas,editable,closed,onMove,onOpen,onAdvance,status}:Props){
 const [dragged,setDragged]=useState<Row|null>(null),[target,setTarget]=useState<Section|null>(null),[pending,setPending]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const board=useRef<HTMLDivElement>(null),preview=useRef<HTMLDivElement>(null),drag=useRef<TaskDrag|null>(null);
 const suppressClick=useRef(false);
 const stopDrag=useCallback(()=>{
  const current=drag.current;
  if(!current)return;
  drag.current=null;
  if(current.frame!==null){
   cancelAnimationFrame(current.frame);
   suppressClick.current=true;
   setDragged(null);setTarget(null);
  }
  if(current.source.hasPointerCapture(current.pointerId))current.source.releasePointerCapture(current.pointerId);
 },[]);
 useEffect(()=>{
  function cancelOnEscape(event:KeyboardEvent){
   if(event.key==='Escape'&&drag.current){event.preventDefault();stopDrag();}
  }
  window.addEventListener('keydown',cancelOnEscape);
  window.addEventListener('blur',stopDrag);
  return ()=>{
   window.removeEventListener('keydown',cancelOnEscape);
   window.removeEventListener('blur',stopDrag);
   stopDrag();
  };
 },[stopDrag]);

 async function move(row:WeekTask,toWeek:boolean){
  if(!onMove||pending)return;
  stopDrag();setError('');setPending(row.task.id);
  try{if(await onMove(row.task,toWeek))setNotice(row.task.title+(toWeek?' agregada a la semana.':' movida al resto de tareas.'));}
  catch(e){setError((e as Error).message);}
  finally{setPending('');}
 }
 function destinationAt(from:Section,{x,y}:Point){
  const destination=from==='week'?'rest':'week';
  const section=document.elementFromPoint(x,y)?.closest(`[data-week-drop="${destination}"]`);
  return section&&board.current?.contains(section)?destination:null;
 }
 function dragFrame(time:number){
  const current=drag.current;
  if(!current)return;
  if(!current.source.isConnected){stopDrag();return;}
  const {x,y}=current.position,height=window.innerHeight;
  const edge=Math.min(96,height/4);
  const topPressure=Math.max(0,(edge-y)/edge);
  const bottomPressure=Math.max(0,(y-height+edge)/edge);
  const pressure=Math.max(-1,Math.min(1,bottomPressure-topPressure));
  const elapsed=current.lastFrame===null?16:Math.min(32,time-current.lastFrame);
  current.lastFrame=time;
  const scroll=Math.round(pressure*elapsed);
  if(scroll)window.scrollBy({top:scroll,behavior:'instant'});
  const target=destinationAt(current.from,current.position);
  if(target!==current.target){current.target=target;setTarget(target);}
  const ghost=preview.current;
  if(ghost){
   const left=Math.max(8,Math.min(x+14,window.innerWidth-ghost.offsetWidth-8));
   const top=Math.max(8,Math.min(y+14,height-ghost.offsetHeight-8));
   ghost.style.transform=`translate3d(${left}px,${top}px,0)`;
   ghost.style.visibility='visible';
  }
  current.frame=requestAnimationFrame(dragFrame);
 }
 function beginDrag(event:PointerEvent<HTMLElement>,item:WeekTask,inWeek:boolean){
  const source=event.target;
  if(drag.current||event.button!==0||!event.isPrimary||event.pointerType==='touch'||!(source instanceof Element)||source.closest('.weekly-task-controls'))return;
  const start={x:event.clientX,y:event.clientY};
  // Pointer capture keeps the gesture active while the wheel scrolls the page.
  source.setPointerCapture(event.pointerId);
  drag.current={id:item.task.id,from:inWeek?'week':'rest',source,pointerId:event.pointerId,start,position:start,frame:null,lastFrame:null,target:null};
 }
 function trackDrag(event:PointerEvent<HTMLDivElement>){
  const current=drag.current;
  if(!current||current.pointerId!==event.pointerId)return;
  current.position={x:event.clientX,y:event.clientY};
  if(current.frame!==null||Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)<5)return;
  const item=(current.from==='week'?selected:rest).find(row=>row.task.id===current.id);
  if(!item){stopDrag();return;}
  setDragged(item.task);setError('');
  current.frame=requestAnimationFrame(dragFrame);
 }
 function drop(event:PointerEvent<HTMLDivElement>){
  const current=drag.current;
  if(!current||current.pointerId!==event.pointerId)return;
  const destination=current.frame!==null?destinationAt(current.from,{x:event.clientX,y:event.clientY}):null;
  stopDrag();
  if(!destination)return;
  const item=(current.from==='week'?selected:rest).find(row=>row.task.id===current.id);
  if(item&&adjustable(item)&&(destination==='week'||!item.commitment))void move(item,destination==='week');
 }
 function cancelDrag(event:PointerEvent<HTMLDivElement>){
  if(drag.current?.pointerId===event.pointerId)stopDrag();
 }
 function row(item:WeekTask,inWeek:boolean){
  const t=item.task,canAdjust=adjustable(item);
  const canPlanTask=editable&&canAdjust,movable=!!onMove&&canAdjust&&(!inWeek||!item.commitment);
  const project=projects.find(p=>p.id===t.projectId),areaIds=[...(project?.areaIds??[]),...(project?.areaId?[project.areaId]:[])];
  const areaKeys=[...new Set<string>([...areaIds.map(managementAreaKey),...(project?.areaKeys??[])])];
  const projectAreas=areaKeys.map(key=>({key,name:areas.find(area=>managementAreaKey(area.id)===key)?.name??projectAreaLabels[key]})).filter(area=>!!area.name);
  return <article key={t.id} className={'weekly-task-row'+(dragged?.id===t.id?' is-dragging':'')+(pending===t.id?' is-saving':'')} data-movable={movable&&!pending||undefined} aria-label={t.title}
   onPointerDown={movable&&!pending?event=>beginDrag(event,item,inWeek):undefined}>
   {movable&&<span className="weekly-task-grip" aria-hidden="true"><GripVertical size={18}/></span>}
   <div className="weekly-task-main"><button type="button" className="weekly-task-title" onClick={()=>onOpen(t)}>{t.title}</button><div className="weekly-task-meta"><span className="weekly-task-project">{project?.title??(t.projectId?'Proyecto no disponible':'Sin proyecto')}</span>{projectAreas.length>0&&<span className="weekly-task-areas" role="list" aria-label="Áreas del proyecto">{projectAreas.map(area=><AreaBadge className="weekly-task-area" role="listitem" key={area.key} area={area.key} label={area.name}/>)}</span>}{item.priority&&<span className="weekly-task-priority"><Flag size={12} aria-hidden="true"/>Prioritaria</span>}{t.dueDate&&<span>{formatDate(t.dueDate)}</span>}{item.commitment?.result!==undefined&&item.commitment.result!==t.title&&<span className="weekly-task-result">{item.commitment.result}</span>}</div></div>
   <div className="weekly-task-controls">{status(t.status)}{inWeek&&(item.commitment||canPlanTask)&&<button type="button" className="icon" aria-label={(item.commitment?'Ver avance semanal de ':'Detallar avance semanal de ')+t.title} title={item.commitment?'Ver avance semanal':'Detallar avance semanal'} onClick={()=>onAdvance(item)}><CalendarDays size={16}/></button>}{movable&&<button type="button" className="icon weekly-task-move" disabled={!!pending} aria-label={(inWeek?'Quitar de esta semana: ':'Agregar a esta semana: ')+t.title} title={inWeek?'Quitar de esta semana':'Agregar a esta semana'} onClick={()=>void move(item,!inWeek)}>{inWeek?<ArrowDown size={17}/>:<ArrowUp size={17}/>}</button>}<button type="button" className="icon" aria-label={'Abrir tarea: '+t.title} title="Abrir tarea" onClick={()=>onOpen(t)}><ArrowUpRight size={16}/></button></div>
  </article>;
 }
 return <div ref={board} className="weekly-task-board" aria-busy={!!pending}
  onPointerDownCapture={()=>{suppressClick.current=false;}} onPointerMove={trackDrag} onPointerUp={drop}
  onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onDragStart={event=>event.preventDefault()}
  onClickCapture={event=>{if(suppressClick.current&&event.detail){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}>
  {error&&<p className="form-error" role="alert">{error}</p>}<span className="sr-only" role="status">{notice}</span>
  {dragged&&<div ref={preview} className="weekly-drag-preview" aria-hidden="true"><GripVertical size={16}/><span>{dragged.title}</span></div>}
  <section className={'weekly-task-section weekly-selected'+(target==='week'?' is-drop-target':'')} aria-label="Tareas de la semana" data-week-drop="week">
   <div className="section-heading"><h2>Tareas de la semana <span>{selected.length}</span></h2></div>
   {selected.length?<div className="weekly-task-list">{selected.map(item=>row(item,true))}</div>:<p className="weekly-task-empty">{closed?'Sin tareas registradas.':onMove?'Arrastrá una tarea a esta semana.':'Sin tareas seleccionadas.'}</p>}
  </section>
  {!closed&&<section className={'weekly-task-section weekly-rest'+(target==='rest'?' is-drop-target':'')} aria-label="Resto de tareas" data-week-drop="rest">
   <div className="section-heading"><h2>Resto de tareas <span>{rest.length}</span></h2></div>
   {rest.length?<div className="weekly-task-list">{rest.map(item=>row(item,false))}</div>:<p className="weekly-task-empty">No hay otras tareas pendientes.</p>}
  </section>}
 </div>;
}
