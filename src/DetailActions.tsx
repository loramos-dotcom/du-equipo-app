import {Children,Fragment,isValidElement,useEffect,useRef} from 'react';
import type {ReactNode} from 'react';
import {MoreHorizontal,Pencil} from 'lucide-react';
import './detail-actions.css';

type Props={primary?:ReactNode;onEdit?:()=>void;editLabel?:string;priority?:ReactNode;children?:ReactNode;label?:string};
function hasActions(children:ReactNode):boolean{return Children.toArray(children).some(child=>isValidElement<{children?:ReactNode}>(child)&&child.type===Fragment?hasActions(child.props.children):typeof child==='string'?!!child.trim():true);}
export default function DetailActions({primary,onEdit,editLabel='Editar ficha',priority,children,label='Más acciones'}:Props){
 const menu=useRef<HTMLDetailsElement>(null),available=hasActions(children);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(event.target as Node))menu.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 if(!primary&&!onEdit&&!priority&&!available)return null;
 return <div className="record-actions">{primary}{onEdit&&<button type="button" className="icon record-edit" title={editLabel} aria-label={editLabel} onClick={onEdit}><Pencil size={17}/></button>}{priority}{available&&<details ref={menu} className="record-actions-menu" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.open=false;}}><summary role="button" className="icon" title={label} aria-label={label}><MoreHorizontal size={19}/></summary><div role="group" aria-label="Acciones disponibles" onClick={event=>{if((event.target as HTMLElement).closest('button,a')){menu.current?.removeAttribute('open');menu.current?.querySelector<HTMLElement>('summary')?.focus();}}}>{children}</div></details>}</div>;
}
