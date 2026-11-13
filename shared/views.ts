import {addDays,normalize} from './model.ts';
import type {Row,State} from './model.ts';
import {workSearchText,workBlockers} from './work.ts';

export type TaskFilters={owner:string;state:string;due:string;independent:boolean;q?:string;archived?:boolean;sort?:string;relationship?:string;parent?:string};
export const emptyTaskFilters=():TaskFilters=>({owner:'',state:'',due:'',independent:false,q:'',archived:false,sort:'recent',relationship:'',parent:''});
export function taskFilterLabels(filters:TaskFilters,members:Row[]){
 return [filters.q&&'Búsqueda: '+filters.q,filters.relationship==='blocked'&&'Con dependencias pendientes',filters.owner&&'Responsable: '+(members.find(m=>m.id===filters.owner)?.name??'Seleccionado'),filters.state&&'Estado: '+(filters.state==='open'?'Abiertas':filters.state),filters.due&&'Fecha: '+(filters.due==='soon'?'Vencimientos próximos':'Vencidas'),filters.independent&&'Sin proyecto',filters.archived&&'Incluye archivadas'].filter(Boolean) as string[];
}
export function selectTasks(state:State,filters:TaskFilters,today:string){
 const rows=state.data.tasks.filter(t=>!t.deletedAt&&(filters.archived||!t.archived)&&(filters.relationship!=='blocked'||workBlockers(state.data.tasks,t).length>0)&&(!filters.owner||t.ownerId===filters.owner)&&(!filters.state||(filters.state==='open'?!['Terminada','Cancelada'].includes(t.status):t.status===filters.state))&&(!filters.independent||!t.projectId)&&(!filters.q||normalize(workSearchText(state.data.tasks,t)).includes(normalize(filters.q.trim())))&&(!filters.due||!['Terminada','Cancelada'].includes(t.status)&&t.dueDate&&(filters.due==='soon'?t.dueDate<=addDays(today,state.settings.dueDays):t.dueDate<today)));
 return rows.sort((a,b)=>filters.sort==='title'?a.title.localeCompare(b.title):filters.sort==='due'?(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.title.localeCompare(b.title):(b.updatedAt??b.createdAt??'').localeCompare(a.updatedAt??a.createdAt??'')||a.title.localeCompare(b.title));
}
export function preferredMeeting(meetings:Row[],today:string){
 return meetings.filter(m=>!m.calendarEventKey).sort((a,b)=>{
  const upcoming=(m:Row)=>!['Cerrada','Cancelada'].includes(m.status)&&m.date.slice(0,10)>=today;
  return Number(upcoming(b))-Number(upcoming(a))||(upcoming(a)?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
 })[0]?.id??'';
}
