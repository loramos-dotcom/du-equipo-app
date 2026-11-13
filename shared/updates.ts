import type {Row} from './model.ts';

export function recordUpdates(comments:Row[],entity:'projects'|'tasks',id:string):Row[]{
 return comments.filter(r=>!r.deletedAt&&r.entryType==='update'&&r.targetType===entity&&r.targetId===id).reverse().sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));
}

export function updateDateTime(value:string|undefined):string{
 if(!value)return 'Fecha no disponible';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Fecha no disponible';
 return new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
