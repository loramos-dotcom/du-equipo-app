import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {Check,ExternalLink,MessageSquare,Plus,Trash2} from 'lucide-react';
import type {Row} from '../shared/model';
import {formatDate} from '../shared/model';
import {updateDateTime} from '../shared/updates';
import {RichText} from './gestion/components/RichText';
import {externalLinkUrl} from './gestion/domain/externalLink';
import './record-activity.css';

export type ActivityFilter='all'|'updates'|'comments'|'history';
export type RecordActivityProps={
 entries:Row[];members:Row[];actorId:string;canWrite:boolean;
 canDeleteUpdate:(entry:Row)=>boolean;canEditUpdate?:(entry:Row)=>boolean;
 onCreateUpdate:()=>void;onEditUpdate:(entry:Row)=>void;onDeleteUpdate:(entry:Row)=>void;
 onCreateComment:()=>void;onEditComment:(entry:Row)=>void;
 onResolveUpdate?:(entry:Row)=>void;
 history:ReactNode;initialFilter?:ActivityFilter;
};

const filters:{key:ActivityFilter;label:string}[]=[
 {key:'all',label:'Toda la actividad'},
 {key:'updates',label:'Actualizaciones'},
 {key:'comments',label:'Comentarios'},
 {key:'history',label:'Cambios'},
];

export default function RecordActivity({entries,members,actorId,canWrite,canDeleteUpdate,canEditUpdate,onCreateUpdate,onEditUpdate,onDeleteUpdate,onCreateComment,onEditComment,onResolveUpdate,history,initialFilter='all'}:RecordActivityProps){
 const [filter,setFilter]=useState<ActivityFilter>(initialFilter),[historyOpen,setHistoryOpen]=useState(false);
 useEffect(()=>{setFilter(initialFilter);setHistoryOpen(false);},[initialFilter]);
 const people=new Map(members.map(member=>[member.id,member.name]));
 const visible=[...entries].filter(entry=>!entry.deletedAt).reverse().sort((a,b)=>String(b.createdAt??'').localeCompare(String(a.createdAt??''))).filter(entry=>filter==='all'||filter==='updates'&&entry.entryType==='update'||filter==='comments'&&entry.entryType!=='update');
 const empty=filter==='updates'?'Todavía no hay actualizaciones.':filter==='comments'?'Todavía no hay comentarios.':'Todavía no hay actividad registrada.';
 return <section className="record-activity" aria-label="Actividad">
  <div className="record-activity-heading"><h3>Actividad</h3><div className="record-activity-create">{canWrite&&<button type="button" className="text-button" onClick={onCreateUpdate}><Plus size={14}/>Agregar actualización</button>}<button type="button" className="text-button" onClick={onCreateComment}><MessageSquare size={14}/>Comentar</button></div></div>
  <div className="record-activity-filters" role="group" aria-label="Filtrar actividad">{filters.map(option=><button type="button" key={option.key} aria-pressed={filter===option.key} onClick={()=>setFilter(option.key)}>{option.label}</button>)}</div>
  {filter==='history'?<div className="record-activity-history">{history}</div>:<>
   {visible.length?<div className="record-activity-list">{visible.map(entry=>{
    const update=entry.entryType==='update',own=entry.authorId===actorId,versions=Array.isArray(entry.previousVersions)?entry.previousVersions:[],editableUpdate=canEditUpdate?canEditUpdate(entry):canWrite&&own&&!entry.sourceId,attachment=externalLinkUrl(entry.attachmentUrl),sourceType=entry.sourceType??entry.type,entryDate=typeof entry.createdAt==='string'?entry.createdAt:undefined,dateLabel=entry.sourceId&&(!entryDate||/^\d{4}-\d{2}-\d{2}$/.test(entryDate))?formatDate(entryDate):updateDateTime(entryDate),resolvable=!!(onResolveUpdate&&entry.sourceId&&!entry.resolved&&(entry.canResolve===true||entry.canResolve!==false&&['Alerta/Bloqueo','Pendiente'].includes(sourceType)));
    return <article className="record-activity-entry" data-entry-kind={update?'update':'comment'} key={entry.id} aria-label={(update?'Actualización':'Comentario')+' de '+(entry.authorName??people.get(entry.authorId)??'Integrante del equipo')}>
     <div className="record-activity-meta"><span className={'record-activity-kind '+(update?'is-update':'is-comment')}>{update?'Actualización':'Comentario'}</span>{sourceType&&<span className="record-activity-source-type">{sourceType}</span>}{entry.source&&<span className="record-activity-source">{entry.source}</span>}{entry.sourceId&&entry.resolved&&<span className="record-activity-resolved">Resuelta</span>}<strong>{entry.authorName??people.get(entry.authorId)??'Integrante del equipo'}</strong><time dateTime={entryDate}>{dateLabel}</time></div>
     <div className="record-activity-body"><RichText value={String(entry.body??'')}/></div>
     {entry.evidence&&<div className="record-activity-evidence"><RichText value={String(entry.evidence)}/></div>}
     <div className="record-activity-entry-actions">{attachment&&<a className="text-button" href={attachment} target="_blank" rel="noopener noreferrer">{entry.attachmentName||'Abrir adjunto'}<ExternalLink size={12}/></a>}{entry.edited&&<small>Editada el {updateDateTime(entry.updatedAt)}</small>}{(update?editableUpdate:own)&&<button type="button" className="text-button" onClick={()=>update?onEditUpdate(entry):onEditComment(entry)}>{update?'Editar actualización':'Editar comentario'}</button>}{resolvable&&<button type="button" className="text-button" onClick={()=>onResolveUpdate!(entry)}><Check size={12}/>Resolver</button>}{update&&canDeleteUpdate(entry)&&<button type="button" className="text-button record-activity-delete" onClick={()=>onDeleteUpdate(entry)}><Trash2 size={12}/>Eliminar actualización</button>}</div>
     {update&&versions.length>0&&<details className="record-activity-versions"><summary>Ver versiones anteriores ({versions.length})</summary>{[...versions].reverse().map((version,index)=><div key={index}><small>Antes de la edición del {updateDateTime(version.at)}</small><div className="record-activity-body"><RichText value={String(version.body??'')}/></div></div>)}</details>}
    </article>;
   })}</div>:<p className="record-activity-empty">{empty}</p>}
   {filter==='all'&&<details className="record-activity-audit" open={historyOpen} onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>Cambios de ficha</summary>{historyOpen&&<div className="record-activity-history">{history}</div>}</details>}
  </>}
 </section>;
}
