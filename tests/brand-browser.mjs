import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const origin=process.env.DU_TEST_ORIGIN??'http://127.0.0.1:4173',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
const passed=[],errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
await mkdir('test-results',{recursive:true});
async function check(name,run){await run();passed.push(name);console.log('PASS '+name);}
async function go(name){name=(name==='Inicio'||name==='Tareas')?'Mi panel':name==='Equipo'?'La DU':name;const menu=page.getByRole('button',{name:'Abrir navegación',exact:true});if(await menu.isVisible()&&!await page.locator('.sidebar').evaluate(el=>el.classList.contains('is-open')))await menu.click();await page.locator('nav').getByRole('button',{name,exact:true}).click();if(await menu.isVisible())await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);}
try{
 await page.goto(origin);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
 await check('Archivo y el escudo se cargan desde la app con caracteres españoles',async()=>{
  assert.ok(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Archivo'&&f.status==='loaded')));assert.ok(await page.evaluate(()=>document.fonts.check('700 16px Archivo','Educación, coordinación, ñ, ¿qué?')));
  const logo=page.locator('.app-footer img[alt="Buenos Aires Ciudad"]');assert.ok(await logo.evaluate(el=>el.complete&&el.naturalWidth>0));assert.equal(await logo.getAttribute('src'),'/brand/escudo-ciudad-azul.svg');assert.ok(!await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/fonts\.(googleapis|gstatic)/.test(r.name))));
 });
 await check('La firma conserva proporciones y espacio de seguridad y los botones se distinguen',async()=>{
  const dimensions=await page.locator('.shield-clearspace').evaluate(el=>{const img=el.querySelector('img'),r=img.getBoundingClientRect(),style=getComputedStyle(el);return {width:r.width,height:r.height,space:parseFloat(style.paddingTop)};});assert.ok(Math.abs(dimensions.width/dimensions.height-108/51)<.01);assert.ok(dimensions.space>=dimensions.height*.27);
  await page.screenshot({path:'test-results/marca-inicio-desktop.png',fullPage:true});const cta=page.locator('.page-heading .primary').first();assert.equal(await cta.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 205, 2)');
 });
 await check('Las siete vistas y el formulario se pueden usar en escritorio y móvil con la nueva tipografía',async()=>{
  for(const width of [1440,768,360]){await page.setViewportSize({width,height:1000});for(const name of ['Inicio','Proyectos','Tareas','Mi semana','Incidencias','Equipo','Reunión semanal']){await go(name);assert.ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),name+' at '+width);}
   await go('Tareas');await page.locator('.page-heading').getByRole('button',{name:'Crear tarea',exact:true}).click();await page.getByLabel('Título de la tarea',{exact:true}).fill('Validación visual de marca');await page.screenshot({path:`test-results/marca-formulario-${width}.png`,fullPage:true});await page.locator('dialog.form-dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().left>=0);await page.screenshot({path:'test-results/marca-navegacion-mobile.png',fullPage:true});assert.ok(await page.locator('nav').getByRole('button',{name:'Reunión semanal',exact:true}).isVisible());
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 });
}catch(e){console.error(e.stack??e);await page.screenshot({path:'test-results/marca-failure.png',fullPage:true});process.exitCode=1;}
finally{await writeFile('test-results/brand-browser.json',JSON.stringify({passed,errors,failed,fixture:'isolated local data; no production writes'},null,2));await browser.close();}
