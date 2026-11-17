export type Person={id?:string;name?:string};
export type PersonColors={background:string;color:string;borderColor:string};
const key=(person:Person)=>person.id||person.name?.trim().toLocaleLowerCase('es')||'';
function hash(value:string){let result=2166136261;for(const character of value)result=Math.imul(result^character.charCodeAt(0),16777619);return result>>>0;}
// A deliberately separated palette: neighboring generated hues can look identical
// on small circles even when their RGB values differ.
export const personPalette:PersonColors[]=[
 {background:'#92bdf5',color:'#173c79',borderColor:'#70a6e9'},
 {background:'#fac18b',color:'#7d360d',borderColor:'#e89b55'},
 {background:'#c5df98',color:'#315515',borderColor:'#8fb75c'},
 {background:'#cfb0ee',color:'#552b82',borderColor:'#af8bd9'},
 {background:'#f9df74',color:'#705300',borderColor:'#d7b42d'},
 {background:'#f5bacd',color:'#842238',borderColor:'#d77b91'},
 {background:'#98d4b3',color:'#16594e',borderColor:'#5bb5a4'},
 {background:'#cad0d8',color:'#334155',borderColor:'#8695aa'},
 {background:'#93def3',color:'#124f70',borderColor:'#5aafcf'},
 {background:'#b99c80',color:'#3f2c19',borderColor:'#8a6242'},
 {background:'#ec947e',color:'#5d2116',borderColor:'#bc5c43'},
 {background:'#7881c5',color:'#11173b',borderColor:'#505c9d'},
];
function colors(slot:number):PersonColors{if(personPalette[slot])return personPalette[slot];const hue=Math.round(slot*137.508%360);return {background:`hsl(${hue} 65% 82%)`,color:`hsl(${hue} 65% 20%)`,borderColor:`hsl(${hue} 45% 60%)`};}
// Allocate in stable ID order so every member of the roster uses a separate swatch.
export function personThemes(people:Person[]){
 const themes=new Map<string,PersonColors>();
 for(const person of [...people].sort((a,b)=>key(a).localeCompare(key(b)))){
  const id=key(person);if(id&&!themes.has(id))themes.set(id,colors(themes.size));
 }
 return themes;
}
export function personColors(person:Person,themes=new Map<string,PersonColors>()):PersonColors{
 const id=key(person);return id?themes.get(id)??colors(hash(id)%personPalette.length):{background:'#f1f4f6',color:'#526578',borderColor:'#d9e1e8'};
}
