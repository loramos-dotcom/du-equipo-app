import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,relative,extname} from 'node:path';
if(!process.env.BOARD_TEST_DIST)throw Error('Configurá BOARD_TEST_DIST con la carpeta dist del tablero de prueba.');
const root=resolve(process.env.BOARD_TEST_DIST);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(relative(root,path).startsWith('..')){res.writeHead(403);res.end();return;}const file=path===root?resolve(root,'index.html'):path;res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}}).listen(4250,'127.0.0.1');
