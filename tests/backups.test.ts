import {test}from'node:test';import assert from'node:assert/strict';import {generateKeyPairSync,createHash}from'node:crypto';
import {seed}from'../shared/seed.ts';import {execute}from'../shared/domain.ts';import {encryptBackup,decryptBackup,sealCredential,openCredential,uploadDriveBackup}from'../server/backups.ts';
const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Copia cifrada recupera datos, permisos, auditoría y versiones; alteración o clave equivocada fallan',()=>{
 const initial=seed();const state=execute(initial,'persona05',{id:'backup-test',kind:'create',entity:'tasks',data:{title:'Registro confidencial de ensayo',ownerId:'persona05'}}).state;
 const content=encryptBackup(state,keys.publicKey,'test-key');assert.ok(!content.includes('confidencial'));const restored=decryptBackup(content,keys.privateKey);assert.deepEqual(restored,state);
 assert.throws(()=>execute(restored,'persona06',{id:'denied',kind:'update',entity:'tasks',entityId:state.data.tasks.at(-1)!.id,expectedVersion:1,data:{title:'Editar ajeno'}}),/No podés modificar/);
 const altered=JSON.parse(content.toString());altered.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>decryptBackup(Buffer.from(JSON.stringify(altered)),keys.privateKey));
 assert.throws(()=>decryptBackup(content,generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey));
});
test('Credencial del respaldo se sella aparte; Drive rechaza carpetas compartidas y confirma bytes subidos',async()=>{
 const secret=Buffer.alloc(32,7).toString('base64'),credential={email:'persona05@bue.edu.ar',refreshToken:'private-test-token'},sealed=sealCredential(credential,secret);assert.ok(!sealed.includes(credential.refreshToken));assert.deepEqual(openCredential(sealed,secret),credential);assert.throws(()=>openCredential(sealed,Buffer.alloc(32,9).toString('base64')));
 const content=encryptBackup(seed(),keys.publicKey,'test-key');let uploads=0;
 const transport:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(url.searchParams.get('alt')==='media')return new Response(new Uint8Array(content));if(url.pathname==='/drive/v3/files/folder')return Response.json({id:'folder',ownedByMe:true,mimeType:'application/vnd.google-apps.folder',permissions:[{type:'user',role:'owner'}]});if(url.pathname==='/drive/v3/files')return Response.json({files:[]});uploads++;assert.ok(Buffer.isBuffer(init?.body));assert.ok(!Buffer.from(init!.body as Buffer).includes('private-test-token'));return Response.json({id:'saved',size:String(content.length),md5Checksum:createHash('md5').update(content).digest('hex'),appProperties:{duSha256:createHash('sha256').update(content).digest('hex')}});};
 const uploaded=await uploadDriveBackup(content,{accessToken:'test-access',folderId:'folder',workspaceId:'du-test',transport});assert.equal(uploaded.fileId,'saved');assert.equal(uploads,1);
 await assert.rejects(()=>uploadDriveBackup(content,{accessToken:'test',folderId:'folder',workspaceId:'du-test',transport:async()=>Response.json({ownedByMe:true,mimeType:'application/vnd.google-apps.folder',permissions:[{type:'domain',role:'reader'}]})}),/carpeta privada/);
});
