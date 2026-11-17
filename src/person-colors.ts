export type Person={id?:string;name?:string};
export type PersonColors={background:string;color:string;borderColor:string};
const key=(person:Person)=>person.id||person.name?.trim().toLocaleLowerCase('es')||'';
function hash(value:string){let result=2166136261;for(const character of value)result=Math.imul(result^character.charCodeAt(0),16777619);return result>>>0;}
function colors(slot:number):PersonColors{const hue=Math.round(slot*137.508%360);return {background:`hsl(${hue} 55% 92%)`,color:`hsl(${hue} 65% 25%)`,borderColor:`hsl(${hue} 38% 76%)`};}
// Resolve collisions once for the full roster so every person has a distinct color.
export function personThemes(people:Person[]){
 const used=new Set<number>(),themes=new Map<string,PersonColors>();
 for(const person of [...people].sort((a,b)=>key(a).localeCompare(key(b)))){
  const id=key(person);if(!id||themes.has(id))continue;
  let slot=hash(id)%24;while(used.has(slot))slot++;
  used.add(slot);themes.set(id,colors(slot));
 }
 return themes;
}
export function personColors(person:Person,themes=new Map<string,PersonColors>()):PersonColors{
 const id=key(person);return id?themes.get(id)??colors(hash(id)%24):{background:'#f1f4f6',color:'#526578',borderColor:'#d9e1e8'};
}
