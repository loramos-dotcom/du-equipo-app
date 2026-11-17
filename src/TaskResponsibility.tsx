import type {Row} from '../shared/model';
import {taskExecution} from '../shared/task-assignment';
import Avatar from './Avatar';
import {AreaBadge} from './AreaBadge';
import './task-responsibility.css';

export default function TaskResponsibility({task,members,areas,detail=false}:{task:Row;members:Row[];areas:Row[];detail?:boolean}){
 const execution=taskExecution(task),person=members.find(member=>member.id===task.ownerId),area=areas.find(area=>area.id===execution.areaId);
 const avatar=<Avatar member={person} small/>,personName=person?.name??'Sin asignar';
 const responsible=execution.type==='du'?<span className="person">{avatar}{detail&&personName}</span>:execution.type==='area'?<AreaBadge area={execution.areaId??''} label={area?.name??'Área no disponible'}/>:<span className="muted-text">Por confirmar</span>;
 if(detail)return <><div><dt>{execution.type==='du'?'Responsable':'Responsable de ejecución'}</dt><dd>{responsible}</dd></div>{execution.type!=='du'&&<div><dt>Seguimiento DU</dt><dd className="person">{avatar}{personName}</dd></div>}</>;
 return <span className="task-responsibility" role="group" aria-label={'Responsabilidad de '+task.title}><span className="task-responsibility-role"><span className="task-responsibility-label">{execution.type==='unspecified'?'Ejecución':'Responsable'}</span>{responsible}</span>{execution.type!=='du'&&<span className="task-responsibility-role"><span className="task-responsibility-label">DU</span>{avatar}</span>}</span>;
}
