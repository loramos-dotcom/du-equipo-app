import test from 'node:test';
import assert from 'node:assert/strict';
import {mapMarkers,resolveMarkerStatus,summarizeMapMarkers} from '../src/gestion/domain/markerStatus.ts';

const marker=(extra:Record<string,unknown>={})=>({id:'synthetic-work',name:'Obra ficticia',lat:-34.6,lng:-58.4,...extra});

test('Un marcador sin estado de la API es neutral y cambiar su ID no inventa un semáforo',()=>{
  const first=resolveMarkerStatus(marker()),second=resolveMarkerStatus(marker({id:'synthetic-other:phase'}));
  assert.deepEqual(first,second);
  assert.equal(first.status,'Sin estado informado');assert.equal(first.tone,'neutral');assert.equal(first.finished,false);
  const rows=mapMarkers({markers:[marker()]},{useTrafficLight:true});
  assert.deepEqual(summarizeMapMarkers(rows).map(group=>[group.label,group.tone,group.count]),[['Sin estado informado','neutral',1]]);
  assert.ok(!summarizeMapMarkers(rows).some(group=>group.label==='En ejecución'));
});

test('Solo los semáforos suministrados por la API determinan los colores y las categorías conocidas',()=>{
  for(const [value,label,tone] of [['R','Demorado','red'],['A','Demora leve','amber'],['V','En ejecución','green'],['F','Finalizado','finished']]){
    const resolved=resolveMarkerStatus(marker({semaforo:value}));assert.equal(resolved.status,label);assert.equal(resolved.tone,tone);
    assert.deepEqual(resolveMarkerStatus(marker({id:'synthetic-unrelated',trafficLight:value})),resolved);
    assert.deepEqual(resolveMarkerStatus(marker({semaforo:'',traffic_light:value.toLowerCase()})),resolved);
  }
  assert.equal(resolveMarkerStatus(marker({semaforo:'invalid'})).tone,'neutral');
});

test('Los estados de texto explícitos se respetan y los desconocidos nunca se cuentan como En ejecución',()=>{
  assert.equal(resolveMarkerStatus(marker({status:'En ejecución'})).tone,'green');
  assert.equal(resolveMarkerStatus(marker({state:'En curso'})).tone,'green');
  assert.equal(resolveMarkerStatus(marker({status:'Demorado'})).tone,'red');
  assert.equal(resolveMarkerStatus(marker({status:'Demora leve'})).tone,'amber');
  assert.equal(resolveMarkerStatus(marker({status:'Pendiente'})).summaryStatus,'Pendiente');
  assert.equal(resolveMarkerStatus(marker({status:'En curso'})).summaryStatus,'En curso');
  const rows=mapMarkers({markers:[marker({id:'synthetic-a',status:'Por confirmar'}),marker({id:'synthetic-b',status:'No finalizado'}),marker({id:'synthetic-c',status:'En ejecución'})]},{useTrafficLight:true});
  const summary=summarizeMapMarkers(rows);assert.equal(summary.find(group=>group.label==='En ejecución')?.count,1);
  assert.equal(summary.find(group=>group.label==='Por confirmar')?.tone,'neutral');
  assert.equal(summary.find(group=>group.label==='No finalizado')?.tone,'neutral');
});

test('Finalizados por semáforo o por texto se retiran sin revivir por un color desactualizado',()=>{
  const payload={markers:[marker({id:'synthetic-a',semaforo:'F'}),marker({id:'synthetic-b',status:'Finalizada',semaforo:'R'}),marker({id:'synthetic-c',status:'Terminado'}),marker({id:'synthetic-d',status:'En ejecución'})]};
  const rows=mapMarkers(payload,{useTrafficLight:true,excludeFinished:true});assert.deepEqual(rows.map(row=>row.id),['synthetic-d']);
  const all=mapMarkers(payload,{useTrafficLight:true});assert.equal(all.filter(row=>row.finished).length,3);
  const summary=summarizeMapMarkers(all);assert.equal(summary.find(group=>group.label==='Finalizado')?.count,3);assert.equal(summary.find(group=>group.label==='En ejecución')?.count,1);
});

test('Mapa, referencias y resumen comparten color y tono incluso cuando falta información',()=>{
  const rows=mapMarkers({markers:[marker({id:'synthetic-a'}),marker({id:'synthetic-b',semaforo:'V'}),marker({id:'synthetic-c',semaforo:'R'}),marker({id:'synthetic-d',semaforo:'F'})]},{useTrafficLight:true});
  for(const row of rows){const group=summarizeMapMarkers(rows).find(group=>group.label===row.summaryStatus&&group.tone===row.tone)!;assert.equal(group.color,row.color);}
  assert.notEqual(rows[0].color,rows[1].color);assert.notEqual(rows[3].color,rows[1].color);
});

test('Las coordenadas ausentes o inválidas se omiten; no se agrega ninguna ubicación por defecto',()=>{
  assert.deepEqual(mapMarkers({}),[]);
  assert.deepEqual(mapMarkers({markers:[null,{},marker({lat:null}),marker({lat:''}),marker({lat:100}),marker({lng:200}),marker({lat:'not-a-number'})]}),[]);
  assert.equal(mapMarkers({markers:[marker({lat:'-34.6',lng:'-58.4'})]})[0].status,'Sin estado informado');
});

test('La deduplicación de obras es genérica y no depende de un prefijo institucional',()=>{
  const payload={markers:[marker({id:'synthetic-work:one',semaforo:'A'}),marker({id:'synthetic-work:two',semaforo:'R'}),marker({id:'synthetic-other:one',semaforo:'V'})]};
  const before=structuredClone(payload),rows=mapMarkers(payload,{useTrafficLight:true});
  assert.equal(rows.length,2);assert.equal(rows[0].status,'Demora leve');assert.deepEqual(payload,before);
});

test('Los identificadores numéricos se conservan y los estilos recibidos no pueden inyectar HTML en el marcador',()=>{
  const rows=mapMarkers({markers:[marker({id:7,status:'__proto__',color:'\" onclick=\"synthetic-handler'}),marker({id:9,semaforo:'R',color:'url(https://example.invalid/fixture)'})]},{useTrafficLight:true});
  assert.deepEqual(rows.map(row=>row.id),['7','9']);assert.equal(rows[0].tone,'neutral');
  assert.ok(rows.every(row=>/^#[0-9a-f]{6}$/.test(row.color)));
  assert.equal(summarizeMapMarkers(rows).find(group=>group.label==='__proto__')?.count,1);
});
