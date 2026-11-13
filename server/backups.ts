import {createCipheriv,createDecipheriv,createHash,publicEncrypt,privateDecrypt,randomBytes,constants} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {collections,dateInBA} from '../shared/model.ts';
import type {State} from '../shared/model.ts';

export type BackupEnvelope={format:'du-equipo-backup';version:1;keyId:string;encryptedKey:string;iv:string;tag:string;ciphertext:string};
const aad=(keyId:string)=>Buffer.from('du-equipo-backup:1:'+keyId);
export function encryptBackup(state:State,publicKey:string,keyId:string,now=new Date()):Buffer{
 // Auth provider sessions, server environment and private backup credentials are deliberately outside State.
 const {externalProjects,trash,...business}=state;
 const payload=Buffer.from(JSON.stringify({format:'du-equipo-state',version:1,generatedAt:now.toISOString(),manifest:Object.fromEntries(collections.map(c=>[c,state.data[c]?.length??0])),state:business}));
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(keyId));
 const ciphertext=Buffer.concat([cipher.update(gzipSync(payload)),cipher.final()]);
 const envelope:BackupEnvelope={format:'du-equipo-backup',version:1,keyId,encryptedKey:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};key.fill(0);
 return Buffer.from(JSON.stringify(envelope));
}
export function decryptBackup(content:Buffer,privateKey:string):State{
 const envelope=JSON.parse(content.toString()) as BackupEnvelope;
 if(envelope.format!=='du-equipo-backup'||envelope.version!==1)throw Error('Formato de respaldo no compatible.');
 const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.encryptedKey,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAAD(aad(envelope.keyId));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
 const compressed=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);key.fill(0);
 const restored=JSON.parse(gunzipSync(compressed).toString());const state=restored.state as State;
 if(restored.format!=='du-equipo-state'||restored.version!==1||!state?.workspaceId||!Number.isSafeInteger(state.revision)||!Array.isArray(state.audit)||!Array.isArray(state.snapshots)||!state.receipts||!state.settings)throw Error('El contenido del respaldo no es válido.');
 for(const collection of collections){state.data[collection]??=[];if(!Array.isArray(state.data[collection])||state.data[collection].length!==(restored.manifest[collection]??0)||new Set(state.data[collection].map(r=>r.id)).size!==state.data[collection].length)throw Error('La verificación de registros del respaldo falló.');}
 return state;
}

export type DriveCredential={email:string;refreshToken:string;folderId?:string};
export function sealCredential(value:DriveCredential,secret:string):string{
 const key=Buffer.from(secret,'base64');if(key.length!==32)throw Error('backup-sealing-key');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('du-drive-credentials-v1'));const body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');
}
export function openCredential(value:string,secret:string):DriveCredential{
 const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64')),decipher=createDecipheriv('aes-256-gcm',Buffer.from(secret,'base64'),iv);decipher.setAAD(Buffer.from('du-drive-credentials-v1'));decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString());
}
type DriveOptions={accessToken:string;folderId?:string;workspaceId:string;revision?:number;transport?:typeof fetch};
const quote=(value:string)=>value.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
export async function uploadDriveBackup(content:Buffer,options:DriveOptions,now=new Date()){
 const transport=options.transport??fetch,headers={authorization:'Bearer '+options.accessToken};
 const call=async(url:URL|string,init:RequestInit={})=>{const response=await transport(url,{...init,headers:{...headers,...init.headers},redirect:'error'});if(!response.ok)throw Error('drive-backup-'+response.status);return response.json();};
 const list=async(q:string)=>{const url=new URL('https://www.googleapis.com/drive/v3/files');url.search=new URLSearchParams({q,spaces:'drive',fields:'files(id,name,appProperties)',pageSize:'100'}).toString();return (await call(url)).files as any[];};
 let folderId=options.folderId;
 if(!folderId){const folders=await list("trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='duWorkspace' and value='"+quote(options.workspaceId)+"' } and appProperties has { key='duPurpose' and value='encryptedBackups' }");folderId=folders[0]?.id;if(!folderId){const folder=await call('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'DU Equipo · Respaldos privados',mimeType:'application/vnd.google-apps.folder',appProperties:{duWorkspace:options.workspaceId,duPurpose:'encryptedBackups'}})});folderId=folder.id;}}
 if(!folderId||!/^[a-zA-Z0-9_-]+$/.test(folderId))throw Error('drive-backup-folder');
 const metadata=await call('https://www.googleapis.com/drive/v3/files/'+folderId+'?fields=id,trashed,mimeType,ownedByMe,permissions(type,role)');
 if(metadata.trashed||metadata.mimeType!=='application/vnd.google-apps.folder'||!metadata.ownedByMe||!Array.isArray(metadata.permissions)||!metadata.permissions.length||metadata.permissions.some((p:any)=>p.type!=='user'||p.role!=='owner'))throw Error('El respaldo requiere una carpeta privada, propiedad de la cuenta institucional.');
 const day=dateInBA(now),digest=createHash('sha256').update(content).digest('hex');
 const existing=await list("trashed = false and '"+quote(folderId)+"' in parents and appProperties has { key='duDay' and value='"+day+"' } and appProperties has { key='duWorkspace' and value='"+quote(options.workspaceId)+"' }");
 const verify=async(id:string,expectedDigest:string)=>{const response=await transport('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers,redirect:'error'});if(!response.ok)throw Error('drive-backup-readback');const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==expectedDigest)throw Error('drive-backup-readback');const envelope=JSON.parse(bytes.toString());if(envelope.format!=='du-equipo-backup'||envelope.version!==1)throw Error('drive-backup-format');return {bytes:bytes.length,keyId:envelope.keyId as string};};
 // Concurrent attempts may create the same day's file; application properties make retries reusable.
 if(existing.length){const file=await call('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(existing[0].id)+'?fields=id,appProperties');const checked=await verify(file.id,file.appProperties?.duSha256);return {fileId:file.id,folderId,reused:true,day,revision:file.appProperties?.duRevision?Number(file.appProperties.duRevision):undefined,at:file.appProperties?.duBackupAt,...checked};}
 const envelope=JSON.parse(content.toString()),boundary='du-backup-'+randomBytes(18).toString('hex'),meta={name:'DU-Equipo-'+day+'.du-backup',parents:[folderId],mimeType:'application/octet-stream',appProperties:{duWorkspace:options.workspaceId,duDay:day,duSha256:digest,duFormat:'v1',duRevision:String(options.revision??''),duBackupAt:now.toISOString(),duKeyId:envelope.keyId}};
 const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n'),content,Buffer.from('\r\n--'+boundary+'--')]);
 let file:any;
 if(content.length<=5*1024*1024)file=await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,md5Checksum,appProperties',{method:'POST',headers:{'content-type':'multipart/related; boundary='+boundary},body});
 else{
  const session=await transport('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum,appProperties',{method:'POST',headers:{...headers,'content-type':'application/json','x-upload-content-type':'application/octet-stream','x-upload-content-length':String(content.length)},body:JSON.stringify(meta),redirect:'error'});
  if(!session.ok||!session.headers.get('location'))throw Error('drive-backup-upload');const location=new URL(session.headers.get('location')!);if(location.protocol!=='https:'||location.hostname!=='www.googleapis.com'||location.username||location.password||!location.pathname.startsWith('/upload/drive/'))throw Error('drive-backup-location');
  file=await call(location,{method:'PUT',headers:{'content-type':'application/octet-stream','content-length':String(content.length)},body:new Uint8Array(content)});
 }
 if(Number(file.size)!==content.length||file.md5Checksum!==createHash('md5').update(content).digest('hex')||file.appProperties?.duSha256!==digest)throw Error('drive-backup-verification');
 const checked=await verify(file.id,digest);return {fileId:file.id,folderId,reused:false,day,revision:options.revision,at:now.toISOString(),...checked};
}
