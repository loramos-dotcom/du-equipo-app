import {api} from '../server/api.ts';
// The build embeds the Vite assets so the Worker archive has a single entrypoint.
// @ts-ignore Generated during build.
import assets from '../.generated/assets.js';
export default {async fetch(request:Request,env:any){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/')){
  const identity=request.headers.get('oai-authenticated-user-id');if(!identity)return new Response(JSON.stringify({error:'Ingresá a este sitio privado para abrir el entorno de prueba.'}),{status:401,headers:{'content-type':'application/json'}});
  if(!env.DB)return new Response(JSON.stringify({error:'La base de prueba todavía no está disponible.'}),{status:503,headers:{'content-type':'application/json'}});
  const store={async load(key:string){const r=await env.DB.prepare('SELECT payload FROM demo_workspaces WHERE id=?').bind(key).first();return r?JSON.parse(r.payload):null;},async create(key:string,s:any){await env.DB.prepare('INSERT OR IGNORE INTO demo_workspaces (id,revision,payload) VALUES (?,?,?)').bind(key,s.revision,JSON.stringify(s)).run();},async save(key:string,rev:number,s:any){const result=await env.DB.prepare('UPDATE demo_workspaces SET revision=?,payload=? WHERE id=? AND revision=?').bind(s.revision,JSON.stringify(s),key,rev).run();return result.meta.changes===1;}};
  return api(request,store,'private-demo:'+identity);
 }
 const asset=assets[path]??assets['/index.html'];if(!asset)return new Response('No encontrado',{status:404});const body=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),(c:string)=>c.charCodeAt(0)):asset.body;return new Response(body,{headers:{'content-type':asset.type,'cache-control':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://*.chatgpt.com https://chatgpt.com"}});
}};
