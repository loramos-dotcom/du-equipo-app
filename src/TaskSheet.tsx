import {useEffect,useRef} from 'react';
import type {ReactNode} from 'react';
import './task-sheet.css';

export function TaskTabs({selected,onSelect}:{selected:string;onSelect:(value:string)=>void}){
 const menu=useRef<HTMLDetailsElement>(null),activity=['Actividad','Actualizaciones','Comentarios','Historial'].includes(selected),more=['Trabajo vinculado','Documentos'].includes(selected);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(event.target as Node))menu.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 return <div className="task-sheet-tabs" role="tablist" aria-label="Detalle de la tarea">
  <button type="button" role="tab" aria-selected={!activity&&!more} onClick={()=>onSelect('Detalle')}>Detalle</button>
  <button type="button" role="tab" aria-selected={activity} onClick={()=>onSelect('Actividad')}>Actividad</button>
  <details ref={menu} className={'task-sheet-more '+(more?'is-selected':'')} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.open=false;}}>
   <summary role="button" aria-label="Más secciones de la tarea">{more?selected:'Más'}</summary>
   <div role="group" aria-label="Otras secciones de la tarea">{['Trabajo vinculado','Documentos','Historial'].map(label=><button key={label} type="button" aria-pressed={selected===label} onClick={()=>{menu.current?.removeAttribute('open');onSelect(label);}}>{label}</button>)}</div>
  </details>
 </div>;
}
export function RecordManagement({children}:{children:ReactNode}){
 return <details className="record-management-details"><summary>Datos de gestión</summary><div>{children}</div></details>;
}
