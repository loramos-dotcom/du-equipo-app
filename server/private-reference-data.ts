import type {EducationSystemData} from '../src/gestion/components/educationSystemData.ts';

type TrafficLight='R'|'A'|'V'|'F';
export type PrivateReferenceTable='projects'|'special_views';
export type PrivateReferenceData={educationSystem:EducationSystemData;trafficLights:ReadonlyMap<string,TrafficLight>};
export const privateReferenceError='La referencia privada no está disponible.';

type Shape={readonly[key:string]:true|Shape};
const sector:Shape={total:true,state:true,private:true};
const levels=['initial','primary','secondary','adult','special','higher'] as const;
const levelCounts:Shape=Object.fromEntries(levels.map(level=>[level,sector]));
const educationShape:Shape={
 copy:{title:true,subtitle:true,schoolsLabel:true,studentsLabel:true,teachersLabel:true,stateLabel:true,privateLabel:true,otherServicesTitle:true,levelLabels:Object.fromEntries(levels.map(level=>[level,true as const])),enrollmentNote:true,teacherNote:true,sources:true},
 schools:sector,schoolLevels:levelCounts,schoolSummary:sector,
 students:sector,studentLevels:levelCounts,studentSummary:sector,
 teachers:sector,otherServices:{services:true,students:true}
};

function record(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;
}

function pickStrings(value:unknown,shape:Shape):Record<string,unknown>{
 if(!record(value))throw Error(privateReferenceError);
 const result:Record<string,unknown>={};
 for(const [key,child]of Object.entries(shape)){
  if(!Object.hasOwn(value,key))throw Error(privateReferenceError);
  if(child===true){if(typeof value[key]!=='string')throw Error(privateReferenceError);result[key]=value[key];}
  else result[key]=pickStrings(value[key],child);
 }
 return result;
}

/** Server-only input: callers pass a private environment value, never a client parameter. */
export function parsePrivateReferenceData(value:string|undefined):PrivateReferenceData|null{
 if(value===undefined||typeof value==='string'&&!value.trim())return null;
 try{
  if(typeof value!=='string')throw Error(privateReferenceError);
  const parsed:unknown=JSON.parse(value);
  if(!record(parsed)||!Object.hasOwn(parsed,'educationSystem')||!Object.hasOwn(parsed,'trafficLights')||!record(parsed.trafficLights))throw Error(privateReferenceError);
  const educationSystem=pickStrings(parsed.educationSystem,educationShape) as unknown as EducationSystemData;
  const trafficLights=new Map<string,TrafficLight>();
  for(const [id,light]of Object.entries(parsed.trafficLights)){
   if(!id.trim()||!['R','A','V','F'].includes(light as string))throw Error(privateReferenceError);
   trafficLights.set(id,light as TrafficLight);
  }
  // Metadata and every non-whitelisted JSON field are deliberately discarded.
  return {educationSystem,trafficLights};
 }catch{throw Error(privateReferenceError);}
}

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');

/** Missing means no own property. An explicit null, blank, zero, false or array remains authoritative. */
function fillMissing(current:Record<string,unknown>,reference:Record<string,unknown>):Record<string,unknown>{
 let output=current;
 for(const [key,value]of Object.entries(reference)){
  if(!Object.hasOwn(current,key)){
   if(output===current)output={...current};
   output[key]=structuredClone(value);
  }else if(record(current[key])&&record(value)){
   const next=fillMissing(current[key],value);
   if(next!==current[key]){if(output===current)output={...current};output[key]=next;}
  }
 }
 return output;
}

function project(row:Record<string,unknown>,reference:PrivateReferenceData):Record<string,unknown>{
 if(typeof row.name!=='string'||!normalize(row.name).includes('datos del sistema educativo')||!Object.hasOwn(row,'visual_metrics')||!record(row.visual_metrics))return row;
 const metrics=row.visual_metrics;
 let next=metrics;
 if(!Object.hasOwn(metrics,'educationSystem'))next={...metrics,educationSystem:structuredClone(reference.educationSystem)};
 else if(record(metrics.educationSystem)){
  const filled=fillMissing(metrics.educationSystem,reference.educationSystem as unknown as Record<string,unknown>);
  if(filled!==metrics.educationSystem)next={...metrics,educationSystem:filled};
 }
 return next===metrics?row:{...row,visual_metrics:next};
}

function specialView(row:Record<string,unknown>,reference:PrivateReferenceData):Record<string,unknown>{
 const key=typeof row.view_key==='string'?normalize(row.view_key):'',title=typeof row.title==='string'?normalize(row.title):'';
 if(key!=='administrative_works_map'&&!title.includes('mapa de obras')||!Object.hasOwn(row,'payload')||!record(row.payload)||!Array.isArray(row.payload.markers))return row;
 let changed=false;
 const markers=row.payload.markers.map(marker=>{
  if(!record(marker)||['semaforo','trafficLight','traffic_light','status','state'].some(field=>Object.hasOwn(marker,field)))return marker;
  const id=typeof marker.id==='string'?marker.id:typeof marker.id==='number'&&Number.isFinite(marker.id)?String(marker.id):'';
  if(!id)return marker;
  const light=reference.trafficLights.get(id)??reference.trafficLights.get(id.split(':')[0]);
  if(!light)return marker;
  changed=true;return {...marker,semaforo:light};
 });
 return changed?{...row,payload:{...row.payload,markers}}:row;
}

/** Enrich only records already returned under the authenticated upstream account's RLS. */
export function enrichManagementRecords(table:PrivateReferenceTable,json:unknown,reference:PrivateReferenceData|null):unknown{
 if(!reference||!['projects','special_views'].includes(table))return json;
 const enrich=(row:unknown)=>{
  if(!record(row)||Object.hasOwn(row,'error')||Object.hasOwn(row,'code')&&Object.hasOwn(row,'message'))return row;
  return table==='projects'?project(row,reference):specialView(row,reference);
 };
 if(Array.isArray(json)){
  const rows=json.map(enrich);return rows.some((row,index)=>row!==json[index])?rows:json;
 }
 return enrich(json);
}
