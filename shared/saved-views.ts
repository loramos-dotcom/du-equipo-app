const pages=['Inicio','Proyectos','Tareas','Áreas','Mi semana','Equipo','Incidencias','Reunión semanal'];
const maps:Record<string,Record<string,'string'|'boolean'>>={
 filters:{q:'string',owner:'string',area:'string',status:'string',delivery:'string',priority:'string',kind:'string',scope:'string',policy:'string',archived:'boolean',preset:'string'},
 taskFilters:{q:'string',owner:'string',state:'string',due:'string',independent:'boolean',archived:'boolean',sort:'string',relationship:'string',parent:'string'},
 areaFilters:{q:'string',owner:'string',area:'string'},teamFilters:{q:'string',owner:'string',area:'string'}
};
export function cleanView(value:unknown):Record<string,any>{
 if(!value||typeof value!=='object'||Array.isArray(value)||!pages.includes((value as any).page))throw Error('Elegí una vista válida.');
 const source=value as Record<string,any>,result:Record<string,any>={page:source.page};
 const enums:Record<string,string[]>={projectSource:['du','gestion'],tasksView:['list','board'],teamView:['people','structure'],followupView:['issues','requests'],weekSection:['work','calendar']};
 for(const [key,allowed]of Object.entries(enums))if(source[key]!==undefined){if(!allowed.includes(source[key]))throw Error('La vista contiene una opción inválida.');result[key]=source[key];}
 for(const key of ['week','owner'])if(source[key]!==undefined){if(typeof source[key]!=='string'||key==='week'&&source[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(source[key]))throw Error('La vista contiene un período o una persona inválidos.');result[key]=source[key];}
 for(const[key,fields]of Object.entries(maps))if(source[key]!==undefined){
  if(!source[key]||typeof source[key]!=='object'||Array.isArray(source[key]))throw Error('Los filtros de la vista no son válidos.');
  result[key]={};for(const[field,type]of Object.entries(fields)){if(source[key][field]!==undefined&&typeof source[key][field]!==type)throw Error('Los filtros de la vista no son válidos.');result[key][field]=source[key][field]??(type==='boolean'?false:'');}
 }
 if(result.taskFilters){delete result.taskFilters.parent;if(result.taskFilters.relationship!=='blocked')result.taskFilters.relationship='';}
 if(source.gestionView!==undefined){const v=source.gestionView;if(!v||typeof v!=='object'||Array.isArray(v)||['query','owner','activeArea'].some(key=>typeof v[key]!=='string')||typeof v.priority!=='boolean'||!['cards','table'].includes(v.view)||!Array.isArray(v.statuses)||v.statuses.some((status:unknown)=>!['active','pending','alert','finished'].includes(String(status))))throw Error('Los filtros del Tablero no son válidos.');if(v.projectScope!==undefined&&!['mine','all'].includes(v.projectScope))throw Error('Elegí un alcance de proyectos válido.');result.gestionView={...(v.projectScope?{projectScope:v.projectScope}:{}),query:v.query,owner:v.owner,activeArea:v.activeArea,priority:v.priority,view:v.view,statuses:[...v.statuses]};}
 return result;
}
