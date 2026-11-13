import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve,extname,relative,isAbsolute} from 'node:path';
import {api} from './api.ts';
import type {State} from '../shared/model.ts';
if(process.env.APP_MODE&&process.env.APP_MODE!=='demo')throw Error('Este servidor solo permite el entorno de prueba. Producción requiere la infraestructura institucional aprobada.');
const dataRoot=resolve(process.env.DU_DATA_DIR??'.data');
if(relative(resolve('.'),dataRoot).startsWith('..')||isAbsolute(relative(resolve('.'),dataRoot)))throw Error('DU_DATA_DIR debe quedar dentro de la carpeta del proyecto.');
await mkdir(dataRoot,{recursive:true});
const db=new DatabaseSync(resolve(dataRoot,'du-equipo.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS demo_workspaces (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)));');
const store={
 async load(key:string){const r=db.prepare('SELECT payload FROM demo_workspaces WHERE id=?').get(key) as {payload:string}|undefined;return r?JSON.parse(r.payload) as State:null;},
 async create(key:string,s:State){db.prepare('INSERT OR IGNORE INTO demo_workspaces (id,revision,payload) VALUES (?,?,?)').run(key,s.revision,JSON.stringify(s));},
 async save(key:string,rev:number,s:State){return db.prepare('UPDATE demo_workspaces SET revision=?,payload=? WHERE id=? AND revision=?').run(s.revision,JSON.stringify(s),key,rev).changes===1;}
};
const port=Number(process.env.PORT??4173),root=resolve('web-dist');
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain;charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
createServer(async(req,res)=>{try{
 const host=req.headers.host??`127.0.0.1:${port}`;if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){res.writeHead(403);res.end('Host no permitido');return;}const origin=`http://${host}`;let response:Response;
 if(req.url?.startsWith('/api/')){
  const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>1000000){res.writeHead(413);res.end('Solicitud demasiado grande');return;}chunks.push(c);}
  const h=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)h.set(k,Array.isArray(v)?v.join(','):v);
  response=await api(new Request(origin+req.url,{method:req.method,headers:h,...(chunks.length?{body:Buffer.concat(chunks)}:{})} as RequestInit),store,'local-test');
 }else{
  const pathname=decodeURIComponent(new URL(req.url??'/',origin).pathname),path=resolve(root,'.'+pathname),rel=relative(root,path);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);res.end();return;}
  let data:Buffer,ext:string;try{data=await readFile(path);ext=extname(path);}catch{data=await readFile(resolve(root,'index.html'));ext='.html';}
  response=new Response(new Uint8Array(data),{headers:{'content-type':mime[ext]??'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'same-origin'}});
 }
 res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500);res.end('No se pudo cargar la aplicación. Ejecutá npm run build.');}}).listen(port,'127.0.0.1',()=>console.log(`DU Equipo · entorno de prueba: http://127.0.0.1:${port}`));
