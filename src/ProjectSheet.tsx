import type {ReactNode} from 'react';
import {RichText} from './gestion/components/RichText';
import './project-sheet.css';
import {AreaTags} from './AreaBadge';

export type ProjectField={label:string;value?:string;wide?:boolean;areaValues?:string[]};
export type ProjectSheetContext={fields:ProjectField[];status:'active'|'pending'|'alert'|'finished';kind:'project'|'subproject';briefUrl?:string};

export function ProjectHeading({title,kind='project',status,leadName,members=[],areas=[],breadcrumb,actions}:{title:string;kind?:'project'|'subproject';status:ProjectSheetContext['status'];leadName?:string;members?:string[];areas?:string[];breadcrumb?:ReactNode;actions:ReactNode}){
 const labels={active:'En curso',pending:'Pendiente',alert:'Alerta/Bloqueo',finished:'Finalizado'},tones={active:'blue',pending:'amber',alert:'red',finished:'green'};
 return <><div className="project-sheet-heading">{breadcrumb}<span className="eyebrow">{kind==='subproject'?'SUBPROYECTO':'PROYECTO'}</span><h2>{title}</h2><span className={'badge '+tones[status]}><span className="dot"/>{labels[status]}</span><div className="project-sheet-assignment"><p><strong>Referente DU:</strong> {leadName||'Sin asignar'}</p>{members.length>0&&<p><strong>Personas asignadas:</strong> {members.join(', ')}</p>}<p><strong>Áreas de seguimiento:</strong> {areas.length?<AreaTags areas={areas}/>:<>Sin asignar</>}</p></div></div><div className="project-sheet-actions">{actions}</div></>;
}

export function ProjectTabs({selected,onSelect,extra=[],tasks=true}:{selected:string;onSelect:(tab:string)=>void;extra?:string[];tasks?:boolean}){
 const current=selected==='Actualizaciones'?'Últimas actualizaciones':selected,primary=['Resumen','Últimas actualizaciones',...(tasks?['Tareas']:[])];
 return <div className="project-sheet-tabs" role="tablist" aria-label="Detalle del proyecto">{primary.map(tab=><button type="button" key={tab} role="tab" aria-selected={current===tab} className={current===tab?'active':''} onClick={()=>onSelect(tab)}>{tab}</button>)}{extra.length>0&&<details className={'project-sheet-more '+(extra.includes(current)?'active':'')} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.open=false;}}><summary role="button" aria-label="Más secciones del proyecto">{extra.includes(current)?current:'Más'}</summary><div role="group" aria-label="Otras secciones del proyecto">{extra.map(tab=><button type="button" key={tab} aria-pressed={selected===tab} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onSelect(tab);}}>{tab}</button>)}</div></details>}</div>;
}

export function ProjectSummary({fields}:{fields:ProjectField[]}){
 return <dl className="project-sheet-grid">{fields.filter(field=>field.value).map(field=><div key={field.label} className={field.wide||field.label==='Resultado esperado'||field.label==='Notas'&&(field.value?.length??0)>220?'wide':''}><dt>{field.label}</dt><dd>{field.areaValues?.length?<AreaTags areas={field.areaValues}/>:<RichText value={field.value!}/>}</dd></div>)}</dl>;
}
