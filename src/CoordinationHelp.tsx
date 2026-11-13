import {ArrowUpRight,MessagesSquare} from 'lucide-react';
import type {Row} from '../shared/model';
import {formatDate} from '../shared/model';

type Props={requests:Row[];members:Row[];onOpen:(id:string)=>void;onRequest?:()=>void};
export default function CoordinationHelp({requests,members,onOpen,onRequest}:Props){
 if(!requests.length&&!onRequest)return null;
 return <section className="coordination-help" aria-label="Ayuda de Coordinación">
  <div className="coordination-help-heading"><MessagesSquare size={19} aria-hidden="true"/><h3>{requests.length?'Seguimiento de la intervención':'¿Necesitás ayuda de Coordinación?'}</h3></div>
  <p>{requests.length?'El pedido está vinculado a la tarea y se comparte con sus compromisos. Consultá quién lo gestiona y cuál es la próxima acción.':'Pedí una decisión, una gestión con otra área o ayuda para destrabar el trabajo. El pedido se vincula a la tarea y también se ve desde sus compromisos.'}</p>
  {requests.length?<><ul>{requests.map(request=><li key={request.id}><span className={'badge '+(request.status==='Tomada'?'blue':'amber')}>{request.status==='Tomada'?'En gestión':'Pendiente de Coordinación'}</span><strong>{request.request}</strong><small>{request.status==='Tomada'?'Lo está gestionando '+(members.find(member=>member.id===request.takenBy)?.name??'Coordinación')+'.':'Ya se envió. Coordinación debe tomar el pedido.'} Fecha deseada: {formatDate(request.neededBy)}.</small>{request.nextAction&&<p>Próxima acción: {request.nextAction}</p>}<button className="text-button" onClick={()=>onOpen(request.id)}>Ver pedido y seguimiento <ArrowUpRight size={13}/></button></li>)}</ul>{onRequest&&<button className="text-button" onClick={onRequest}>Pedir otra intervención</button>}</>:<><p>Contá qué está pasando, qué necesitás y para cuándo. Al guardar se avisa a Coordinación; después podés seguir la respuesta acá.</p><button className="btn" onClick={onRequest}><MessagesSquare size={15}/>Pedir intervención</button></>}
 </section>;
}
