import test from 'node:test';
import assert from 'node:assert/strict';
import {personThemes,personColors} from '../src/person-colors.ts';
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
