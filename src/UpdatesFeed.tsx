import {ArrowRight,Plus,Trash2} from 'lucide-react';
import type {Row} from '../shared/model';
import {RichText} from './gestion/components/RichText';
import {updateDateTime} from '../shared/updates';

type Props={rows:Row[];members:Row[];actorId:string;canWrite:boolean;canDelete:(row:Row)=>boolean;preview?:boolean;onCreate:()=>void;onEdit:(row:Row)=>void;onDelete:(row:Row)=>void;onViewAll:()=>void};
export default function UpdatesFeed({rows,members,actorId,canWrite,canDelete,preview=false,onCreate,onEdit,onDelete,onViewAll}:Props){
 const visible=preview?rows.slice(0,1):rows;
 return <section className="updates-panel" aria-label="Últimas actualizaciones"><div className="section-heading"><h3>Últimas actualizaciones <span className="badge muted">{rows.length}</span></h3>{canWrite&&<button className="btn small-btn" onClick={onCreate}><Plus size={15}/>Agregar actualización</button>}</div>
  {visible.length?<div className="updates-list">{visible.map(row=><article className="update-entry" key={row.id}><div className="update-meta"><strong>{row.authorName??members.find(m=>m.id===row.authorId)?.name??'Integrante del equipo'}</strong><time dateTime={row.createdAt}>{updateDateTime(row.createdAt)}</time></div><p className="update-text"><RichText value={row.body}/></p><div className="update-actions">{row.edited&&<small>Editada el {updateDateTime(row.updatedAt)}</small>}{canWrite&&row.authorId===actorId&&<button className="text-button" onClick={()=>onEdit(row)}>Editar actualización</button>}{canDelete(row)&&<button className="text-button danger-outline" onClick={()=>onDelete(row)}><Trash2 size={13}/>Eliminar actualización</button>}</div>{row.previousVersions?.length>0&&<details className="update-versions"><summary>Ver versiones anteriores ({row.previousVersions.length})</summary>{[...row.previousVersions].reverse().map((version,index)=><div key={index}><small>Antes de la edición del {updateDateTime(version.at)}</small><p className="update-text"><RichText value={version.body}/></p></div>)}</details>}</article>)}</div>:<p className="empty-inline">{canWrite?'Todavía no hay actualizaciones. Registrá avances, novedades o próximos pasos.':'Todavía no hay actualizaciones registradas.'}</p>}
  {preview&&rows.length>0&&<button className="text-button updates-view-all" onClick={onViewAll}>Ver todas las actualizaciones ({rows.length}) <ArrowRight size={14}/></button>}
 </section>;
}
