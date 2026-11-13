import {useEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import type {Choice} from './SearchSelect';

type Props={id:string;label:string;value:string[];choices:Choice[];onChange:(value:string[])=>void};
export default function MultiSelectDropdown({id,label,value,choices,onChange}:Props){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const selected=choices.filter(choice=>value.includes(choice.value)),names=selected.map(choice=>choice.label).join(', ');
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);root.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();return()=>document.removeEventListener('pointerdown',outside);},[open]);
 function close(){setOpen(false);trigger.current?.focus();}
 return <div ref={root} className="multi-select-dropdown" onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();}}}>
  <button ref={trigger} id={id} type="button" className="multi-select-trigger" aria-label={label} aria-expanded={open} aria-controls={open?id+'-options':undefined} onClick={()=>setOpen(previous=>!previous)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);}}}><span>{names||'Seleccionar áreas (opcional)'}</span>{selected.length>0&&<span className="multi-select-count" aria-hidden="true">{selected.length}</span>}<ChevronDown size={16} aria-hidden="true"/></button>
  {open&&<div id={id+'-options'} className="multi-select-popup" role="group" aria-label="Áreas disponibles"><div className="multi-select-choices">{choices.length?choices.map(choice=><label key={choice.value}><input type="checkbox" checked={value.includes(choice.value)} disabled={choice.disabled} onChange={event=>onChange(event.target.checked?[...value,choice.value]:value.filter(id=>id!==choice.value))}/><span>{choice.label}</span></label>):<p>No hay áreas disponibles.</p>}</div><div className="multi-select-actions">{value.length>0&&<button type="button" className="text-button" onClick={()=>onChange([])}>Quitar todas</button>}<button type="button" className="btn small-btn" onClick={close}>Listo</button></div></div>}
 </div>;
}
