import test from 'node:test';
import assert from 'node:assert/strict';
import {recordProvenance} from '../src/record-provenance.ts';
test('Una fuente PDF pasa a gestión y conserva la aclaración y la información posterior',()=>{
 const parsed=recordProvenance('Confirmar la persona destinataria. Fuente: Apuntes de prueba.pdf, página 7. No se infiere vencimiento. Consultar al equipo.');
 assert.equal(parsed.source,'Fuente: Apuntes de prueba.pdf, página 7.');
 assert.equal(parsed.description,'Confirmar la persona destinataria.  No se infiere vencimiento. Consultar al equipo.');
});
test('Sin una cita PDF explícita no oculta información de trabajo',()=>{
 const text='Fuente: consulta al equipo. Hace falta confirmar el acuerdo.';
 assert.deepEqual(recordProvenance(text),{description:text,source:''});
});
test('Una descripción con solo fuente sigue conservando la referencia completa',()=>{
 assert.deepEqual(recordProvenance('Fuente: Notas de prueba.pdf, sin fecha indicada.'),{description:'',source:'Fuente: Notas de prueba.pdf, sin fecha indicada.'});
});
