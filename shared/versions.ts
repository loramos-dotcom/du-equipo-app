import {workFieldLabels} from './work.ts';
export type Difference={path:string;before:unknown;after:unknown};
const labels:Record<string,string>={...workFieldLabels,commitments:'Compromisos',tasks:'Tareas',projects:'Proyectos',members:'Integrantes',areas:'Áreas',plans:'Planificación',meeting:'Reunión',minutes:'Minuta',minutesText:'Texto de la minuta',result:'Resultado semanal',outcome:'Cumplimiento',outcomeNote:'Explicación del resultado',ownerId:'Responsable',dueDate:'Vencimiento',targetDate:'Fecha prevista',status:'Estado',title:'Título',name:'Nombre',text:'Texto',progress:'Avance',capacity:'Capacidad',capacityNote:'Observación de capacidad',attendance:'Asistencia',attendees:'Personas previstas',durations:'Tiempos',weekId:'Semana revisada',planningWeekId:'Semana planificada',decisions:'Acuerdos',agenda:'Temario',isPriority:'Prioritario',selectedUpdateIds:'Avances seleccionados',selectedCommitmentIds:'Compromisos seleccionados',nextAction:'Próxima acción',areaAssignments:'Asignaciones de referentes'};
export function versionPath(path:string,before:any,after:any){
 return path.split('.').map(part=>{const match=part.match(/^([^\[]+)\[([^\]]+)\]$/);if(!match)return labels[part]??part;const [,collection,id]=match;const row=[...(after?.[collection]??[]),...(before?.[collection]??[])].find((r:any)=>r.id===id);return (labels[collection]??collection)+' · '+(row?.title??row?.result??row?.name??id);}).join(' → ');
}
export function compareVersions(before:unknown,after:unknown,path=''):Difference[]{
 if(JSON.stringify(before)===JSON.stringify(after))return [];
 if(Array.isArray(before)&&Array.isArray(after)&&[...before,...after].every(r=>r&&typeof r==='object'&&'id'in r)){
  const left=new Map(before.map(r=>[r.id,r])),right=new Map(after.map(r=>[r.id,r]));
  return [...new Set([...left.keys(),...right.keys()])].flatMap(id=>compareVersions(left.get(id),right.get(id),path+'['+id+']'));
 }
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
  const a=before as Record<string,unknown>,b=after as Record<string,unknown>;
  return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>!['version','updatedAt','updatedBy'].includes(k)).flatMap(k=>compareVersions(a[k],b[k],path?path+'.'+k:k));
 }
 return [{path,before,after}];
}
