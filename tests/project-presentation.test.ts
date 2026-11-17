import test from 'node:test';
import assert from 'node:assert/strict';
import {personThemes,personColors,personPalette} from '../src/person-colors.ts';
import {openProjectStatuses,allProjectStatuses,isOpenProjectScope,unfinishedProjectTree} from '../src/gestion/du-portfolio.ts';
import {workName,workSearchText} from '../shared/work.ts';
import type {Project} from '../src/gestion/domain/types.ts';
test('Los colores distinguen a cada persona y se conservan al ordenar la lista o cambiar su nombre',()=>{
 const people=Array.from({length:16},(_,index)=>({id:'person-'+index,name:'Persona '+index})),themes=personThemes(people),reordered=personThemes([...people].reverse());
 assert.equal(new Set(people.map(person=>personColors(person,themes).background)).size,people.length);
 for(const person of people){assert.deepEqual(personColors(person,themes),personColors(person,reordered));assert.deepEqual(personColors({...person,name:'Nombre actualizado'},themes),personColors(person,themes));}
 assert.deepEqual(personColors({}),personColors({}));
});
test('Activos incluye pendientes y alertas; todos los estados permite consultar los finalizados',()=>{
 assert.deepEqual([...openProjectStatuses].sort(),['active','alert','pending']);
 assert.equal(openProjectStatuses.includes('finished'),false);assert.equal(allProjectStatuses.includes('finished'),true);
 assert.equal(isOpenProjectScope(['pending','alert','active']),true);assert.equal(isOpenProjectScope(allProjectStatuses),false);
});
test('El árbol oculta finalizados también entre subproyectos y conserva descendientes abiertos sin modificar la fuente',()=>{
 const node=(id:string,status:string,children:Project[]=[]):Project=>({id,status,children} as unknown as Project);
 const projects=[node('open','active',[node('done-child','finished'),node('open-child','pending')]),node('done-parent','finished',[node('open-grandchild','alert')])],before=structuredClone(projects);
 const visible=unfinishedProjectTree(projects,project=>(project as any).status);
 assert.deepEqual(visible.map(project=>project.id),['open','open-grandchild']);assert.deepEqual(visible[0].children.map(project=>project.id),['open-child']);assert.deepEqual(projects,before);
});
test('Los nombres visibles no incluyen códigos y la referencia interna sigue disponible para buscar',()=>{
 const task={id:'test-task',version:1,code:'T999',title:'Preparar una entrega'},before=structuredClone(task);
 assert.equal(workName(task),'Preparar una entrega');assert.ok(workSearchText([task],task).includes('T999'));assert.deepEqual(task,before);
});

function rgb(hex:string){return [1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);}
function lab(hex:string){const[r,g,b]=rgb(hex),f=(value:number)=>value>.008856?value**(1/3):7.787*value+16/116,x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return[116*y-16,500*(x-y),200*(y-z)];}
test('La paleta de personas separa visualmente los tonos y mantiene iniciales legibles',()=>{
 const luminance=(hex:string)=>{const[r,g,b]=rgb(hex);return .2126*r+.7152*g+.0722*b;};
 for(let index=0;index<personPalette.length;index++){
  const color=personPalette[index];assert.ok((luminance(color.background)+.05)/(luminance(color.color)+.05)>=4.5,'Contraste de las iniciales');
  for(const other of personPalette.slice(index+1)){const a=lab(color.background),b=lab(other.background);assert.ok(Math.hypot(...a.map((value,i)=>value-b[i]))>=20,'Separación perceptual entre personas');}
 }
});
