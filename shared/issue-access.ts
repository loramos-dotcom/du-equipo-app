import type {Collection,Row,State} from './model.ts';

// "Propias" means the member responsible for follow-up, including resolved records.
export function issueVisibility(state:State,actorId:string){
 const coordinator=state.data.members.some(m=>m.id===actorId&&m.active&&m.role==='Coordinación');
 const maps=new Map<string,Map<string,Row>>(['issues','interventions','comments','links','agenda'].map(entity=>[entity,new Map((state.data[entity as Collection]??[]).map(row=>[row.id,row]))]));
 function visible(entity:string,id:string,fallback?:Row|null):boolean{
  if(coordinator)return true;
  if(!maps.has(entity))return true;
  const row=maps.get(entity)!.get(id)??fallback;if(!row)return false;
  if(entity==='issues')return row.ownerId===actorId;
  if(entity==='interventions')return visible('issues',row.issueId);
  const targetType=entity==='agenda'?row.sourceType:row.targetType,targetId=entity==='agenda'?row.sourceId:row.targetId;
  return !targetType||!['issues','interventions'].includes(targetType)||visible(targetType,targetId);
 }
 function payload(value:any):any{
  if(Array.isArray(value))return value.map(payload);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,Array.isArray(entry)&&maps.has(key)?entry.filter(row=>visible(key,row.id,row)).map(payload):payload(entry)]));
 }
 return {coordinator,visible,payload};
}
