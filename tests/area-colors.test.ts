import test from 'node:test';
import assert from 'node:assert/strict';
import {areaPalette,areaColors,canonicalAreaKey} from '../src/area-colors.ts';

test('Cada área mantiene el mismo color con sigla, nombre completo y clave del Tablero',()=>{
 const aliases=[
  ['gestion_administrativa','SSGAD','1. Gestión Administrativa'],
  ['aprendizaje','SSGDA','2. Gestión del Aprendizaje'],
  ['tecnologia','SSTEDU','3. Tecnología'],
  ['planeamiento','SSPIE','4. Planeamiento'],
  ['privada','Privada','5. Privada'],
  ['agencia','Agencia','6. Agencia'],
  ['ueicee','UEICEE','7. UEICEE'],
  ['universidad','Universidad','8. Universidad'],
  ['comu_prensa','Comu y prensa','9. Comu y prensa'],
  ['transversales','Transversales','10. Transversales'],
 ];
 for(const [key,...names] of aliases)for(const name of names){
  assert.equal(canonicalAreaKey(name),key);
  assert.deepEqual(areaColors(name),areaColors(key));
 }
 assert.equal(new Set(Object.values(areaPalette).map(c=>c.background)).size,aliases.length);
});

test('Los chips tienen contraste legible y el filtro seleccionado conserva texto blanco legible',()=>{
 const luminance=(hex:string)=>{
  const rgb=hex.slice(1).match(/../g)!.map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const [area,c]of Object.entries(areaPalette)){
  assert.ok(contrast(c.ink,c.background)>=4.5,area+' chip');
  assert.ok(contrast(c.ink,'#ffffff')>=4.5,area+' filtro seleccionado');
 }
});

test('Un área adicional recibe un color estable sin depender del orden de la lista',()=>{
 const first=areaColors('Área adicional de prueba');
 areaColors('Otra área');
 assert.deepEqual(areaColors('Área adicional de prueba'),first);
 assert.deepEqual(areaColors('área-adicional-de-prueba'),first);
});
