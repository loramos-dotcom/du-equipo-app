import {useState} from 'react';
import {AlertTriangle,ArrowRight,Plus,Search} from 'lucide-react';
import type {Collection,Row,State} from '../shared/model';
import {formatDate,normalize} from '../shared/model';
import {FilterSummary} from './TaskFilters';
import {closedIssue,interventionStatus,pendingInterventions} from '../shared/followup';

type Props={state:State;actorId:string;view:'issues'|'requests';onView:(view:'issues'|'requests')=>void;onCreate:()=>void;onOpen:(entity:Collection,id:string)=>void;onRequest:(issue:Row)=>void};
export default function FollowupPage({state,actorId,view,onView,onCreate,onOpen,onRequest}:Props){
 const [query,setQuery]=useState(''),[status,setStatus]=useState('open'),[own,setOwn]=useState(false),[limit,setLimit]=useState(20);
 const d=state.data,coordinator=d.members.some(m=>m.id===actorId&&m.role==='Coordinación'),requests=view==='requests',visibleIssues=d.issues.filter(i=>coordinator||i.ownerId===actorId),source=requests?d.interventions.filter(r=>visibleIssues.some(i=>i.id===r.issueId)):visibleIssues;
 const displayStatus=(r:Row)=>requests?interventionStatus(r,d.issues):r.status;
 const resolved=(r:Row)=>requests?['Resuelta','Incidencia cerrada'].includes(displayStatus(r)):closedIssue(r);
 const pendingRequests=pendingInterventions(d.interventions,d.issues);
 const scope=!status?'all':status==='closed'||['Resuelta','Descartada','Incidencia cerrada'].includes(status)?'closed':'open';
 const pendingCount=source.filter(r=>!resolved(r)).length,closedCount=source.length-pendingCount;
 const total=scope==='all'?source.length:scope==='closed'?closedCount:pendingCount;
 const exactStatus=!!status&&!['open','closed'].includes(status),narrowed=!!query||own||exactStatus;
 const closedLabel=requests?'Cerrados':'Resueltas',allLabel=requests?'Todos':'Todas';
 const scopeLabel=requests?'pedidos'+(scope==='open'?' pendientes':scope==='closed'?' cerrados':''):'incidencias'+(scope==='open'?' pendientes':scope==='closed'?' resueltas':'');
 const member=(id:string)=>d.members.find(m=>m.id===id)?.name??'Sin asignar';
 const linked=(i:Row)=>i.taskId?d.tasks.find(t=>t.id===i.taskId)?.title:i.projectId?d.projects.find(p=>p.id===i.projectId)?.title:i.deletedTaskTitle?'Tarea eliminada: '+i.deletedTaskTitle:i.deletedProjectTitle?'Proyecto eliminado: '+i.deletedProjectTitle:'Sin vínculo actual';
 const rows=source.filter(r=>{
  const issue=requests?d.issues.find(i=>i.id===r.issueId):r;
  return (!query||normalize([r.title,r.request,issue?.title,issue&&linked(issue)].join(' ')).includes(normalize(query.trim())))&&(!own||(requests?r.requestedBy:r.ownerId)===actorId)&&(!status||(status==='open'?!resolved(r):status==='closed'?resolved(r):displayStatus(r)===status));
 }).sort((a,b)=>(b.createdAt??b.requestedAt??'').localeCompare(a.createdAt??a.requestedAt??''));
 const clear=()=>{setQuery('');setStatus(scope==='all'?'':scope==='closed'?'closed':'open');setOwn(false);setLimit(20);};
 return <><div className="page-heading"><div><h1>Incidencias y ayuda<span>.</span></h1></div><button className="btn primary" onClick={onCreate}><Plus size={17}/>Registrar incidencia</button></div>
 <p className="muted-text">{coordinator?'Ves las incidencias de todo el equipo.':'Ves únicamente las incidencias asignadas a vos.'}</p>
 <div className="view-tabs"><button className={!requests?'selected':''} aria-pressed={!requests} onClick={()=>{onView('issues');setStatus('open');setLimit(20);}}>Incidencias <span>{d.issues.length}</span></button><button className={requests?'selected':''} aria-pressed={requests} onClick={()=>{onView('requests');setStatus('open');setLimit(20);}}>Pedidos a Coordinación <span>{d.interventions.length}</span></button></div>
 {!requests&&<p className="followup-scope-note">Registrar una incidencia no envía un pedido a Coordinación.</p>}
 <div className="followup-scopes" role="group" aria-label="Vista de seguimiento"><button aria-label="Pendientes" aria-pressed={scope==='open'} onClick={()=>{setStatus('open');setLimit(20);}}>Pendientes <span aria-hidden="true">{pendingCount}</span></button><button aria-label={closedLabel} aria-pressed={scope==='closed'} onClick={()=>{setStatus('closed');setLimit(20);}}>{closedLabel} <span aria-hidden="true">{closedCount}</span></button><button aria-label={allLabel} aria-pressed={scope==='all'} onClick={()=>{setStatus('');setLimit(20);}}>{allLabel} <span aria-hidden="true">{source.length}</span></button></div>
 
 <div className="filter-bar"><div className="filter-search"><Search size={16}/><input aria-label="Buscar incidencias y pedidos" placeholder="Buscar por descripción o tarea…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}}/></div><label className="filter-control">Estado<select aria-label="Estado de seguimiento" value={status} onChange={e=>{setStatus(e.target.value);setLimit(20);}}><option value="">Todos los estados</option><option value="open">{requests?'Pedidos pendientes':'Incidencias abiertas'}</option><option value="closed">{requests?'Pedidos cerrados':'Resueltas y descartadas'}</option>{(requests?['Solicitada','Tomada','Resuelta','Incidencia cerrada']:['Abierta','En tratamiento','Resuelta','Descartada']).map(s=><option key={s}>{s}</option>)}</select></label>{coordinator&&<label><input type="checkbox" checked={own} onChange={e=>{setOwn(e.target.checked);setLimit(20);}}/>{requests?'Mis pedidos':'Mis seguimientos'}</label>}</div>
 <FilterSummary count={rows.length} total={total} label={scopeLabel} filters={[query&&'Búsqueda: '+query,exactStatus&&'Estado: '+status,own&&(requests?'Mis pedidos':'Mis seguimientos')].filter(Boolean) as string[]} onClear={clear}/>
 {rows.length?<div className="followup-list">{rows.slice(0,limit).map(r=>{
  const issue=requests?d.issues.find(i=>i.id===r.issueId):r,pending=pendingRequests.find(i=>i.issueId===r.id),shownStatus=displayStatus(r);
  return <article className="followup-card" key={r.id}><div className="followup-card-main"><div className="inline-info"><span className={'badge '+(shownStatus==='Resuelta'?'green':shownStatus==='Incidencia cerrada'?'muted':'amber')}>{shownStatus}</span>{!requests&&<span>{r.type}</span>}</div><button className="text-button followup-title" onClick={()=>onOpen(requests?'interventions':'issues',r.id)}>{requests?r.request:r.title}</button><p>{requests?issue?.title:linked(r)}</p><small>{requests?'Solicitó '+member(r.requestedBy)+' · Para el '+formatDate(r.neededBy):'Seguimiento: '+member(r.ownerId)+' · '+formatDate(r.followUpDate)}</small></div><div className="followup-actions"><button className="btn small-btn" onClick={()=>onOpen(requests?'interventions':'issues',r.id)}>Ver detalle <ArrowRight size={14}/></button>{!requests&&!['Resuelta','Descartada'].includes(r.status)&&(pending?<button className="text-button" onClick={()=>onOpen('interventions',pending.id)}>Ver pedido · {pending.status}</button>:<button className="text-button" onClick={()=>onRequest(r)}>Pedir intervención</button>)}</div></article>;
 })}{limit<rows.length&&<button className="btn" onClick={()=>setLimit(limit+20)}>Mostrar más ({rows.length-limit})</button>}</div>:<div className="empty"><AlertTriangle size={28}/><h3>{narrowed?'No hay resultados con estos filtros':scope==='open'?(requests?'No hay pedidos pendientes':'No hay incidencias pendientes'):scope==='closed'?(requests?'No hay pedidos cerrados':'No hay incidencias resueltas'):requests?'Todavía no hay pedidos a Coordinación':'Todavía no hay incidencias'}</h3><p>{narrowed?'Probá quitando los filtros de esta vista.':scope==='open'&&closedCount?'Los registros cerrados siguen disponibles en '+closedLabel+'.':scope==='closed'?'Los registros que se cierren aparecerán en esta vista.':requests?'Abrí una incidencia y pulsá Pedir intervención, o solicitá ayuda al registrarla.':'Podés registrar una espera, bloqueo o riesgo de una tarea o proyecto.'}</p>{narrowed?<button className="btn" onClick={clear}>Limpiar filtros de esta vista</button>:scope==='open'&&closedCount?<button className="btn" onClick={()=>{setStatus('closed');setLimit(20);}}>Ver {closedLabel.toLowerCase()}</button>:scope==='closed'?<button className="btn" onClick={()=>{setStatus('open');setLimit(20);}}>Ver pendientes</button>:<button className="btn" onClick={onCreate}>Registrar incidencia</button>}</div>}
 </>;
}

