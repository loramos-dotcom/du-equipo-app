import {DomainError} from '../shared/domain.ts';
import {managementUrl,managementPublishableKey} from '../shared/management-config.ts';
import {resolveMarkerStatus} from '../src/gestion/domain/markerStatus.ts';

const levels=['initial','primary','secondary','adult','special','higher'];
const sectors=['total','state','private'];
const numericPaths=[
 ...['schools','schoolSummary','students','studentSummary','teachers'].flatMap(key=>sectors.map(sector=>[key,sector])),
 ...['schoolLevels','studentLevels'].flatMap(key=>levels.flatMap(level=>sectors.map(sector=>[key,level,sector]))),
 ['otherServices','services'],['otherServices','students'],
];
const notePaths=[['copy','enrollmentNote'],['copy','teacherNote'],['copy','sources']];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const normalized=(value:unknown)=>typeof value==='string'?value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim().replace(/\s+/g,' '):'';
const at=(value:unknown,path:string[]):unknown=>path.reduce<unknown>((row,key)=>object(row)?row[key]:undefined,value);
function numericValue(value:unknown){
 if(typeof value==='number')return Number.isFinite(value)&&value>=0;
 if(typeof value!=='string')return false;
 return /^(?:\d+(?:[.,]\d+)*)(?:[*†‡]|\[\d+\])?$/.test(value.trim().replace(/[\s\u00a0\u202f]/g,''));
}
function validCoordinate(value:unknown,max:number){
 if(!(typeof value==='number'||typeof value==='string'&&value.trim()))return false;
 const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=max;
}
function explicitLight(row:Record<string,unknown>){return ['semaforo','trafficLight','traffic_light'].some(key=>typeof row[key]==='string'&&['R','A','V','F'].includes((row[key] as string).trim().toUpperCase()));}

function accumulator(){
 const education={candidates:0,presentObjects:0,requiredNumericFieldsPerCandidate:numericPaths.length,requiredNumericFields:0,presentNumericFields:0,missingNumericFields:0,requiredNoteFields:0,presentNoteFields:0,missingNoteFields:0,complete:false,notesComplete:false};
 const worksMaps={candidates:0,presentMarkerArrays:0,emptyMarkerArrays:0,markersTotal:0,withExplicitValidTrafficLight:0,withRecognizedTextualStatus:0,unknownStatuses:0,invalidCoordinates:0,complete:false};
 return {
  projects(rows:unknown[]){for(const raw of rows){
   if(!object(raw))throw new DomainError('La respuesta del origen no permite comprobar los datos privados.',503);
   const metrics=object(raw.visual_metrics)?raw.visual_metrics:{};
   if(!normalized(raw.name).includes('datos del sistema educativo')&&!Object.hasOwn(metrics,'educationSystem'))continue;
   education.candidates++;const data=metrics.educationSystem;if(object(data))education.presentObjects++;
   education.requiredNumericFields+=numericPaths.length;
   education.presentNumericFields+=numericPaths.filter(path=>numericValue(at(data,path))).length;
   education.requiredNoteFields+=notePaths.length;
   education.presentNoteFields+=notePaths.filter(path=>typeof at(data,path)==='string'&&(at(data,path) as string).trim()).length;
  }},
  views(rows:unknown[]){for(const raw of rows){
   if(!object(raw))throw new DomainError('La respuesta del origen no permite comprobar los datos privados.',503);
   if(!normalized(raw.view_key).includes('administrative_works_map')&&!normalized(raw.title).includes('mapa de obras'))continue;
   worksMaps.candidates++;const payload=object(raw.payload)?raw.payload:{};
   if(!Array.isArray(payload.markers))continue;
   worksMaps.presentMarkerArrays++;if(payload.markers.length===0)worksMaps.emptyMarkerArrays++;
   for(const marker of payload.markers){
    worksMaps.markersTotal++;
    if(!object(marker)){worksMaps.unknownStatuses++;worksMaps.invalidCoordinates++;continue;}
    if(explicitLight(marker))worksMaps.withExplicitValidTrafficLight++;
    else if(resolveMarkerStatus(marker,true).tone!=='neutral')worksMaps.withRecognizedTextualStatus++;
    else worksMaps.unknownStatuses++;
    if(!validCoordinate(marker.lat??marker.latitude,90)||!validCoordinate(marker.lng??marker.longitude,180))worksMaps.invalidCoordinates++;
   }
  }},
  report(){
   education.missingNumericFields=education.requiredNumericFields-education.presentNumericFields;
   education.missingNoteFields=education.requiredNoteFields-education.presentNoteFields;
   education.complete=education.candidates>0&&education.presentObjects===education.candidates&&education.missingNumericFields===0;
   education.notesComplete=education.candidates>0&&education.missingNoteFields===0;
   worksMaps.complete=worksMaps.candidates>0&&worksMaps.presentMarkerArrays===worksMaps.candidates&&worksMaps.emptyMarkerArrays===0&&worksMaps.markersTotal>0&&worksMaps.unknownStatuses===0&&worksMaps.invalidCoordinates===0;
   return {consistent:true,complete:education.complete&&worksMaps.complete,education:{...education},worksMaps:{...worksMaps}};
  },
 };
}

/** Returns only booleans/counts. Never includes source values, names or identifiers. */
export function summarizeStoredPrivateData(projects:unknown[],views:unknown[]){const a=accumulator();a.projects(projects);a.views(views);return a.report();}

export function privateDataRevision(value:unknown){
 if(!object(value))throw new DomainError('No se pudo verificar una revisión coherente del origen.',503);
 return ['projects_revision','portfolio_revision','access_revision'].map(key=>{
  const raw=value[key];if(!(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0||typeof raw==='string'&&/^\d+$/.test(raw)))throw new DomainError('No se pudo verificar una revisión coherente del origen.',503);
  return BigInt(raw as number|string).toString();
 }).join(':');
}

/** Read the authenticated user's source rows without enriching them from server references. */
export async function readStoredPrivateDataCheck(token:string,transport:typeof fetch=fetch){
 const a=accumulator(),pageSize=200,maxPages=500;
 async function pages(table:'projects'|'special_views',select:string,add:(rows:unknown[])=>void){
  let offset=0,expectedTotal:number|undefined;const seen=new Set<string>();
  for(let pageNumber=0;pageNumber<maxPages;pageNumber++){
   const target=new URL('/rest/v1/'+table,managementUrl);
   target.search=new URLSearchParams({select,order:'id.asc',limit:String(pageSize),offset:String(offset)}).toString();
   const response=await transport(target,{method:'GET',headers:{apikey:managementPublishableKey,authorization:'Bearer '+token,prefer:'count=exact'},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new DomainError('No se pudo comprobar el almacenamiento privado con tus permisos actuales.',response.status===401||response.status===403?response.status:503);
   let rows:unknown;try{rows=await response.json();}catch{throw new DomainError('La respuesta del origen no permite comprobar los datos privados.',503);}
   if(!Array.isArray(rows)||rows.length>pageSize)throw new DomainError('La respuesta del origen no permite comprobar los datos privados.',503);
   const range=response.headers.get('content-range');
   if(range){
    const match=range.match(/^(?:items )?(?:(\d+)-(\d+)|\*)\/(\d+|\*)$/);
    if(!match||rows.length>0&&(Number(match[1])!==offset||Number(match[2])!==offset+rows.length-1))throw new DomainError('La paginación del origen no pudo comprobarse.',503);
    if(match[3]!=='*'){
     const total=Number(match[3]);if(!Number.isSafeInteger(total)||total<offset+rows.length||expectedTotal!==undefined&&total!==expectedTotal)throw new DomainError('Los datos cambiaron durante la comprobación. Reintentá.',409);
     expectedTotal=total;
    }
   }
   for(const row of rows){
    if(!object(row)||typeof row.id!=='string'||!row.id||seen.has(row.id))throw new DomainError('La paginación del origen no pudo comprobarse.',503);
    seen.add(row.id);
   }
   add(rows);offset+=rows.length;
   if(expectedTotal!==undefined&&offset===expectedTotal)return;
   // A server row cap may be smaller than our page size: a short page is not EOF.
   if(rows.length===0){if(expectedTotal!==undefined)throw new DomainError('No se pudo comprobar la totalidad de los datos del origen.',503);return;}
  }
  throw new DomainError('No se pudo comprobar la totalidad de los datos del origen.',503);
 }
 await pages('projects','id,name,visual_metrics',rows=>a.projects(rows));
 await pages('special_views','id,view_key,title,payload',rows=>a.views(rows));
 return a.report();
}
