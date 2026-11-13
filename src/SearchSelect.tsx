import {useEffect,useRef,useState} from 'react';
import {Search,X} from 'lucide-react';
import {normalize} from '../shared/model';

export type Choice={value:string;label:string;disabled?:boolean};
type Props={id:string;label:string;value:string;choices:Choice[];required?:boolean;placeholder?:string;descriptionId?:string;onChange:(value:string)=>void};

export default function SearchSelect({id,label,value,choices,required,placeholder,descriptionId,onChange}:Props){
 const [query,setQuery]=useState<string|null>(null),[active,setActive]=useState(-1),input=useRef<HTMLInputElement>(null);
 const editing=query!==null,term=normalize(query??'').trim(),open=editing&&!!term,selected=choices.find(choice=>choice.value===value);
 const matches=term?choices.filter(choice=>normalize(choice.label).includes(term)):[];
 const choose=(choice:Choice)=>{if(choice.disabled)return;onChange(choice.value);setQuery(null);setActive(-1);};
 useEffect(()=>{input.current?.setCustomValidity(open&&query?.trim()?'Elegí un resultado de la búsqueda o borrá el texto.':'');},[open,query,value]);
 useEffect(()=>{if(active>=0)document.getElementById(id+'-option-'+active)?.scrollIntoView({block:'nearest'});},[active,id]);
 return <div className="search-select"><div className="search-select-input"><Search size={15} aria-hidden="true"/><input ref={input} id={id} role="combobox" aria-label={label} aria-describedby={descriptionId} aria-autocomplete="list" aria-expanded={open} aria-controls={open?id+'-list':undefined} aria-activedescendant={open&&active>=0?id+'-option-'+active:undefined} required={required} autoComplete="off" placeholder={placeholder??'Buscar por nombre…'} value={editing?query:selected?.label??''} onFocus={()=>{setQuery('');setActive(-1);}} onBlur={()=>{setQuery(null);setActive(-1);}} onChange={event=>{setQuery(event.target.value);setActive(-1);}} onKeyDown={event=>{
  if(event.key==='Escape'&&editing){event.preventDefault();event.stopPropagation();setQuery(null);setActive(-1);}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open)return;const direction=event.key==='ArrowDown'?1:-1;let next=active<0&&direction<0?0:active;for(let n=0;n<matches.length;n++){next=(next+direction+matches.length)%matches.length;if(!matches[next].disabled){setActive(next);break;}}}
  if(event.key==='Enter'&&open){event.preventDefault();const choice=active>=0?matches[active]:matches.find(option=>!option.disabled);if(choice)choose(choice);}
 }}/>{value&&!required&&<button type="button" className="icon" aria-label={'Quitar '+label.toLowerCase()} onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange('');setQuery('');setActive(-1);input.current?.focus();}}><X size={15}/></button>}</div>
 {open&&<div className="search-select-results" id={id+'-list'} role="listbox" aria-label={'Resultados de '+label.toLowerCase()}>{matches.length?matches.map((choice,index)=><button type="button" role="option" tabIndex={-1} id={id+'-option-'+index} key={choice.value} aria-selected={choice.value===value} aria-disabled={choice.disabled||undefined} className={index===active?'active':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(choice)}>{choice.label}</button>):<p role="status">No se encontraron resultados.</p>}</div>}</div>;
}
