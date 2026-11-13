import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute} from '../shared/domain.ts';
import {effectiveArea} from '../shared/structure.ts';
const now=new Date('2026-10-21T13:00:00Z');
test('Una asignación futura no cambia permisos antes de su vigencia y los solapamientos requieren confirmación',()=>{
 const state=seed(now);const command={id:'assign',kind:'assign_area_referent',data:{areaId:'universidad',memberId:'persona06',assignmentRole:'principal',validFrom:'2026-11-01',reason:'Nueva cartera'}};
 const assigned=execute(state,'persona01',command,now).state,area=assigned.data.areas.find(a=>a.id==='universidad')!;
 assert.equal(effectiveArea(assigned,area,'2026-10-21').leadId,'persona05');assert.equal(effectiveArea(assigned,area,'2026-11-01').leadId,'persona06');
 assert.throws(()=>execute(assigned,'persona01',{...command,id:'overlap',data:{...command.data,memberId:'persona07',validFrom:'2026-11-05'}},now),/superpone/);
 const replaced=execute(assigned,'persona01',{...command,id:'replace',data:{...command.data,memberId:'persona07',validFrom:'2026-11-05',replaceCurrent:true}},now).state;assert.equal(replaced.data.areaAssignments[0].validTo,'2026-11-04');assert.equal(effectiveArea(replaced,area,'2026-11-06').leadId,'persona07');
});
test('Los contactos profesionales no crean usuarios y solo se administran desde la cartera permitida',()=>{
 const s=seed(now),command={id:'contact',kind:'create',entity:'areaContacts' as const,data:{areaId:'universidad',name:'Contacto institucional',email:'contacto@example.edu'}};
 const next=execute(s,'persona05',command,now).state;assert.equal(next.data.areaContacts.length,1);assert.equal(next.data.members.length,9);assert.throws(()=>execute(s,'persona06',command,now),/referentes vigentes/);
});
