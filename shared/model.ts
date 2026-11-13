export const collections = ['members','areas','projects','milestones','tasks','weeks','plans','commitments','issues','interventions','meetings','agenda','decisions','recurrences','comments','links','catalogs','filters','notifications','projectLinks','areaContacts','areaAssignments','preferences','jobRuns','pilotRuns'] as const;
export type Collection = typeof collections[number];
export type Row = { id:string; version:number; createdAt?:string; updatedAt?:string; updatedBy?:string; archived?:boolean; [key:string]:any };
export type TrashSummary = {id:string;entity:'tasks'|'projects'|'issues';version:number;title:string;code?:string;deletedAt:string;deletedBy:string;reason:string};
export type Audit = {id:string;at:string;actorId:string;actorName:string;actorEmail:string|null;entity:Collection|'export'|'settings';entityId:string;action:string;before:Row|null;after:Row|null;fields:string[];reason:string;operationId:string;source:string};
export type Snapshot = {id:string;kind:'plan'|'week'|'meeting';targetId:string;version:number;at:string;actorId:string;reason:string;payload:any};
export type State = {ledger?:{maxTaskCode:number;purgedOccurrences:{recurrenceId:string;occurrenceDate:string}[]};revision:number;schemaVersion:number;workspaceId:string;accessMode?:'institutional';trash?:TrashSummary[];externalProjects?:Row[];data:Record<Collection,Row[]>;audit:Audit[];snapshots:Snapshot[];receipts:Record<string,{hash:string;result:any;actorId:string}>;settings:{staleDays:number;dueDays:number;priorityLimit:number;timezone:string}};
export type Command = {id:string;kind:string;entity?:Collection;entityId?:string;expectedVersion?:number;data?:Record<string,any>};
export const taskStatuses=['Pendiente','En curso','En espera','Para validar','Terminada','Cancelada'];
export const outcomes=['Cumplido','Parcial','No cumplido','Reprogramado','Desestimado','Sin actualización'];
export const capacities=['Sin informar','Tengo margen','Estoy al límite','Necesito redistribuir','No disponible'];
export const deliveryStatuses=['Sin evaluar','Según lo previsto','En riesgo','Comprometido'];
export function dateInBA(d:Date=new Date()):string{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
export function addDays(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekStart(date:string){const d=new Date(date+'T12:00:00Z');return addDays(date,-((d.getUTCDay()+6)%7));}
export function formatDate(date:string|undefined){if(!date)return 'Sin fecha';const canonical=date.length===10?date+'T12:00:00Z':/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(date)?date+'-03:00':date;const parsed=new Date(canonical);if(!Number.isFinite(parsed.getTime()))return 'Fecha no válida';return new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}).format(parsed);}
export function rangeLabel(start:string){const f=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('es-AR',{day:'numeric',month:'short',timeZone:'America/Argentina/Buenos_Aires'});return `${f(start)} — ${f(addDays(start,6))}`;}
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function csv(rows:Row[]){const keys=[...new Set(rows.flatMap(Object.keys))];const cell=(v:any)=>{let s=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\ufeff'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');}
