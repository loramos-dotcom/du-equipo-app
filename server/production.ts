import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import handler from '../api/handler.ts';
import {teamConfig} from './auth.ts';
const config=teamConfig(process.env),root=resolve('web-dist'),port=Number(process.env.PORT??8080);
const mime:Record<string,string>={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain;charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
createServer(async(req,res)=>{try{
 const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>1000000){res.writeHead(413);res.end();return;}chunks.push(c);}
 const h=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)h.set(k,Array.isArray(v)?v.join(','):v);
 const url=new URL(req.url??'/',config.origin);let response:Response;
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))response=await handler.fetch(new Request(url,{method:req.method,headers:h,...(chunks.length?{body:Buffer.concat(chunks)}:{})}));
 else{
  const path=resolve(root,'.'+decodeURIComponent(url.pathname)),rel=relative(root,path);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);res.end();return;}
  let body:Buffer,ext:string;try{body=await readFile(path);ext=extname(path);}catch{body=await readFile(resolve(root,'index.html'));ext='.html';}
  response=new Response(new Uint8Array(body),{headers:{'content-type':mime[ext]??'application/octet-stream','cache-control':url.pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; frame-src https://www.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",'x-content-type-options':'nosniff','referrer-policy':'same-origin'}});
 }
 const headers:Record<string,string|string[]>={...Object.fromEntries(response.headers)};const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
 res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500,{'cache-control':'no-store'});res.end('No se pudo atender la solicitud.');}}).listen(port,'0.0.0.0',()=>console.log('DU Equipo institucional: servidor listo en puerto '+port));
