import type {ReactNode} from 'react';
import {AvatarGroup} from './Avatar';
import type {Row} from '../shared/model';
import {projectPriorityLevel} from '../shared/project-priority';
import {RichText} from './gestion/components/RichText';
import './project-sheet.css';
import {AreaTags} from './AreaBadge';
import {canonicalAreaKey} from './area-colors';

export type ProjectField={label:string;value?:string;wide?:boolean;areaValues?:string[];management?:boolean};
export type ProjectSheetContext={fields:ProjectField[];status:'active'|'pending'|'alert'|'finished';kind:'project'|'subproject';briefUrl?:string;sourceUpdates?:Row[];onEditSourceUpdate?:(id:string)=>void;onDeleteSourceUpdate?:(id:string)=>void;onResolveSourceUpdate?:(id:string)=>void;onCreateSourceUpdate?:()=>void};

export function ProjectPriorityBadge({value,labeled=false}:{value:unknown;labeled?:boolean}){
 const level=projectPriorityLevel(value),tones={Baja:'muted',Media:'blue',Alta:'red'};
 if(!level)return <span className="badge muted project-priority-badge">Sin definir</span>;
 return <span className={'badge project-priority-badge '+tones[level]}>{labeled?'Prioridad '+level.toLowerCase():level}</span>;
}

export function ProjectHeading({title,kind='project',status,priority,leadName,members=[],areas=[],breadcrumb,actions}:{title:string;kind?:'project'|'subproject';status:ProjectSheetContext['status'];priority?:string;leadName?:string;members?:string[];areas?:string[];breadcrumb?:ReactNode;actions:ReactNode}){
 const labels={active:'En curso',pending:'Pendiente',alert:'Alerta/Bloqueo',finished:'Finalizado'},tones={active:'blue',pending:'amber',alert:'red',finished:'green'};
 const people=[...new Set([leadName,...members].filter((name):name is string=>!!name))];
 return <><div className="project-sheet-heading">{breadcrumb}<span className="eyebrow">{kind==='subproject'?'SUBPROYECTO':'PROYECTO'}</span><h2>{title}</h2><div className="project-sheet-meta"><span className={'badge '+tones[status]}><span className="dot"/>{labels[status]}</span>{projectPriorityLevel(priority)&&<ProjectPriorityBadge value={priority} labeled/>}<span className="project-sheet-lead"><span>{people.length>1?'Referentes DU:':'Referente DU:'}</span><AvatarGroup names={people}/></span></div>{areas.length>0&&<div className="project-sheet-assignment"><AreaTags aria-label="Áreas de seguimiento" areas={areas}/></div>}</div><div className="project-sheet-actions">{actions}</div></>;
}

export function ProjectTabs({selected,onSelect,extra=[],tasks=true}:{selected:string;onSelect:(tab:string)=>void;extra?:string[];tasks?:boolean}){
 const current=['Actualizaciones','Últimas actualizaciones'].includes(selected)?'Actividad':selected,primary=['Resumen',...(tasks?['Tareas']:[]),'Actividad'];
 return <div className="project-sheet-tabs" role="tablist" aria-label="Detalle del proyecto">{primary.map(tab=><button type="button" key={tab} role="tab" aria-selected={current===tab} className={current===tab?'active':''} onClick={()=>onSelect(tab)}>{tab}</button>)}{extra.length>0&&<details className={'project-sheet-more '+(extra.includes(current)?'active':'')} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.open=false;}}><summary role="button" aria-label="Más secciones del proyecto" title={extra.includes(current)?current:undefined}>Más</summary><div role="group" aria-label="Otras secciones del proyecto">{extra.map(tab=><button type="button" key={tab} aria-pressed={selected===tab} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onSelect(tab);}}>{tab}</button>)}</div></details>}</div>;
}

const managementLabels=new Set(['Unidad responsable en el Tablero','Prioridad','Prioridad del área','Inicio original','Fin original','Inicio reprogramado','Fin reprogramado','Presupuesto','Mechi','MECHI','Última actualización','Ámbito de gestión','Intervención DU']);
function sameAreas(values:string[],areas:string[]){const first=new Set(values.map(canonicalAreaKey)),second=new Set(areas.map(canonicalAreaKey));return first.size===second.size&&[...first].every(key=>second.has(key));}
export function ProjectSummary({fields,areas=[]}:{fields:ProjectField[];areas?:string[]}){
 const visible=fields.filter(field=>field.value&&!(field.areaValues?.length&&areas.length&&sameAreas(field.areaValues,areas)));
 const main=visible.filter(field=>!(field.management??managementLabels.has(field.label))),management=visible.filter(field=>field.management??managementLabels.has(field.label));
 const grid=(items:ProjectField[])=><dl className="project-sheet-grid">{items.map(field=><div key={field.label} className={field.wide||['Resultado esperado','Descripción','Notas','Justificación','Alcance'].includes(field.label)?'wide':''}><dt>{field.label}</dt><dd>{field.areaValues?.length?<AreaTags areas={field.areaValues}/>:<RichText value={field.value!}/>}</dd></div>)}</dl>;
 return <>{main.length>0&&grid(main)}{management.length>0&&<details className="project-management-data"><summary>Datos de gestión</summary>{grid(management)}</details>}</>;
}
