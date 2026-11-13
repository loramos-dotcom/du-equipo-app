import type {Row} from './model.ts';

/** Tasks are the complete work; commitments describe a weekly advance. */
export const workLabel=(_row:Row)=>'Tarea';
// Read legacy records without exposing the retired classification or losing their text.
export const retiredWorkFields=['workType','storyRole','storyGoal','storyBenefit','acceptanceCriteria'] as const;
export function taskDescription(row:Row){
 const description=typeof row.description==='string'?row.description:'';
 const details=[['storyRole','Destinatario'],['storyGoal','Resultado esperado'],['storyBenefit','Propósito'],['acceptanceCriteria','Criterios de aceptación']].flatMap(([key,label])=>typeof row[key]==='string'&&row[key].trim()?[label+': '+row[key]]:[]).filter(text=>!description.includes(text));
 return [description,...details].filter(Boolean).join('\n\n');
}
export const workName=(row:Row)=>`${row.code??''} · ${row.title}`.replace(/^ · /,'');
export const workFieldLabels:Record<string,string>={workType:'Clasificación anterior',storyRole:'Destinatario anterior',storyGoal:'Resultado esperado anterior',storyBenefit:'Propósito anterior',acceptanceCriteria:'Criterios de aceptación',parentTaskId:'Trabajo padre',dependsOnIds:'Depende de',deletedParentTitle:'Padre eliminado',removedDependencyTitles:'Dependencias eliminadas'};
const live=(rows:Row[])=>rows.filter(row=>!row.deletedAt);
export function workChildren(rows:Row[],id:string){return live(rows).filter(row=>row.parentTaskId===id);}
export function workAncestors(rows:Row[],row:Row){
 const map=new Map(live(rows).map(row=>[row.id,row])),result:Row[]=[],seen=new Set([row.id]);
 let parent=map.get(row.parentTaskId);while(parent&&!seen.has(parent.id)){result.unshift(parent);seen.add(parent.id);parent=map.get(parent.parentTaskId);}return result;
}
export function workDescendants(rows:Row[],id:string){
 const result:Row[]=[],seen=new Set([id]),queue=[id],children=new Map<string,Row[]>();
 for(const row of live(rows))if(row.parentTaskId)children.set(row.parentTaskId,[...(children.get(row.parentTaskId)??[]),row]);
 for(let i=0;i<queue.length;i++)for(const row of children.get(queue[i])??[])if(!seen.has(row.id)){seen.add(row.id);result.push(row);queue.push(row.id);}return result;
}
export function workBlockers(rows:Row[],row:Row){const map=new Map(live(rows).map(row=>[row.id,row]));return (row.dependsOnIds??[]).map((id:string)=>map.get(id)).filter((other:Row|undefined)=>!other||other.status!=='Terminada') as (Row|undefined)[];}
export function workClosureProblems(rows:Row[],row:Row){
 const messages:string[]=[],children=workChildren(rows,row.id).filter(child=>!['Terminada','Cancelada'].includes(child.status)),blocked=workBlockers(rows,row);
 if(children.length)messages.push('Falta resolver '+children.map(workName).join(', ')+'.');
 if(blocked.length)messages.push('Primero debe terminar '+blocked.map(other=>other?workName(other):'una dependencia no disponible').join(', ')+'. Una dependencia cancelada requiere revisar el vínculo.');
 return messages;
}
/** Completion edges include children and prerequisites. This also rejects child -> parent deadlocks. */
export function validateWorkGraph(rows:Row[]){
 const active=live(rows),map=new Map(active.map(row=>[row.id,row])),edges=new Map<string,string[]>();
 for(const row of active){
  if(row.parentTaskId!==undefined&&row.parentTaskId!==null&&typeof row.parentTaskId!=='string')throw Error('El trabajo padre no es válido.');
  if(row.dependsOnIds!==undefined&&(!Array.isArray(row.dependsOnIds)||row.dependsOnIds.some((id:unknown)=>typeof id!=='string'||!id)))throw Error('Las dependencias deben ser una lista de trabajos.');
  if(row.parentTaskId){const parent=map.get(row.parentTaskId);if(!parent)throw Error('El trabajo padre no está disponible.');if(parent.id===row.id)throw Error('Un trabajo no puede ser su propio padre.');if((parent.projectId||null)!==(row.projectId||null))throw Error('El trabajo y sus subtareas deben pertenecer al mismo proyecto.');edges.set(parent.id,[...(edges.get(parent.id)??[]),row.id]);}
  for(const id of row.dependsOnIds??[]){if(!map.has(id))throw Error('Una dependencia no está disponible.');if(id===row.id)throw Error('Un trabajo no puede depender de sí mismo.');edges.set(row.id,[...(edges.get(row.id)??[]),id]);}
 }
 // Iterative DFS has no depth cap and does not exhaust the JS call stack on deep trees.
 const done=new Set<string>(),visiting=new Set<string>();
 for(const row of active){if(done.has(row.id))continue;const stack:{id:string;exit?:boolean}[]=[{id:row.id}];while(stack.length){const current=stack.pop()!;if(current.exit){visiting.delete(current.id);done.add(current.id);continue;}if(done.has(current.id))continue;if(visiting.has(current.id))throw Error('Ese vínculo forma un ciclo entre padres, subtareas o dependencias.');visiting.add(current.id);stack.push({id:current.id,exit:true});for(const id of edges.get(current.id)??[])stack.push({id});}}
}
export function workSearchText(rows:Row[],row:Row){return [row.title,row.description,row.code,workLabel(row),row.storyRole,row.storyGoal,row.storyBenefit,row.acceptanceCriteria,...workAncestors(rows,row).map(workName)].filter(Boolean).join(' ');}
export function workSnapshotRows(rows:Row[],ids:string[]){
 const map=new Map(live(rows).map(row=>[row.id,row])),selected=new Set(ids),queue=[...ids];
 for(let index=0;index<queue.length;index++){const row=map.get(queue[index]);if(!row)continue;for(const id of [row.parentTaskId,...(row.dependsOnIds??[]),...workChildren(rows,row.id).map(child=>child.id)])if(id&&map.has(id)&&!selected.has(id)){selected.add(id);queue.push(id);}}
 return rows.filter(row=>selected.has(row.id)&&!row.deletedAt);
}
export function workExportRows(rows:Row[],context=rows):(Row&{tipo:string;trabajoPadre:string;dependeDe:string})[]{const map=new Map(context.map(row=>[row.id,row]));return rows.map(row=>{const task:Row={...row,description:taskDescription(row)};for(const key of retiredWorkFields)delete task[key];return {...task,tipo:workLabel(row),trabajoPadre:map.has(row.parentTaskId)?workName(map.get(row.parentTaskId)!):'',dependeDe:(row.dependsOnIds??[]).map((id:string)=>map.has(id)?workName(map.get(id)!):id).join(' | ')};});}
