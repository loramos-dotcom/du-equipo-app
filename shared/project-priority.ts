export const projectPriorities=['Baja','Media','Alta'] as const;
export const defaultProjectPriority='Media';

export function projectPriorityLevel(value:unknown){
 if(typeof value!=='string')return undefined;
 const normalized=value.trim().toLowerCase();
 return projectPriorities.find(level=>level.toLowerCase()===normalized);
}
