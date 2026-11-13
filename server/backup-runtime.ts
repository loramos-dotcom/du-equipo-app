import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {Store} from './api.ts';import type {VerifiedIdentity} from '../shared/team.ts';
import {encryptBackup,openCredential,sealCredential,uploadDriveBackup} from './backups.ts';
export interface BackupStore extends Store {
 readBackup(workspace:string):Promise<{sealed:string;email:string;last_backup:any}|null>;
 saveBackup(workspace:string,value:{sealed:string;email:string;last_backup?:unknown}):Promise<void>;
 claimJob?(workspace:string,id:string,token:string):Promise<boolean>;
 releaseJob?(workspace:string,id:string,token:string):Promise<void>;
}
type BackupConfig={origin:string;workspaceId:string;ownerEmail:string;clientId:string;clientSecret:string;sealKey:string;publicKey:string;keyId:string};
export function backupConfig(env:Record<string,string|undefined>):BackupConfig|null{
 const required=['GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','DU_BACKUP_SEAL_KEY','DU_BACKUP_PUBLIC_KEY','DU_BACKUP_KEY_ID','APP_ORIGIN','DU_WORKSPACE_ID','DU_BACKUP_OWNER_EMAIL'];if(required.some(k=>!env[k]))return null;
 return {origin:env.APP_ORIGIN!,workspaceId:env.DU_WORKSPACE_ID!,ownerEmail:env.DU_BACKUP_OWNER_EMAIL!.toLowerCase(),clientId:env.GOOGLE_DRIVE_CLIENT_ID!,clientSecret:env.GOOGLE_DRIVE_CLIENT_SECRET!,sealKey:env.DU_BACKUP_SEAL_KEY!,publicKey:env.DU_BACKUP_PUBLIC_KEY!,keyId:env.DU_BACKUP_KEY_ID!};
}
const scope='https://www.googleapis.com/auth/drive.file';
const cookieName='du-backup-oauth',cookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/auth/backups',maxAge:600};
const redirect=(url:string,cookie?:string)=>new Response(null,{status:303,headers:{location:url,'cache-control':'no-store',...(cookie?{'set-cookie':cookie}:{})}});
const equal=(a:string,b:string)=>{const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
export async function backupAuthRequest(request:Request,identity:VerifiedIdentity,store:BackupStore,env:Record<string,string|undefined>,transport:typeof fetch=fetch){
 const config=backupConfig(env),url=new URL(request.url);
 const headers={'cache-control':'private, no-store'};
 if(url.pathname==='/api/backups/status'){
  const canAuthorize=identity.email.toLowerCase()===(env.DU_BACKUP_OWNER_EMAIL??'').toLowerCase();
  if(!config)return Response.json({configured:false,connected:false,canAuthorize,ownerEmail:env.DU_BACKUP_OWNER_EMAIL??''},{headers});
  const saved=await store.readBackup(config.workspaceId);return Response.json({configured:true,connected:!!saved,canAuthorize,ownerEmail:config.ownerEmail,lastBackup:saved?.last_backup??null},{headers});
 }
 if(!config)return Response.json({error:'La conexión de Drive todavía debe configurarse.'},{status:503,headers});
 if(identity.email.toLowerCase()!==config.ownerEmail)return Response.json({error:'La autorización del respaldo corresponde a la cuenta institucional responsable.'},{status:403,headers});
 if(url.pathname==='/api/backups/run'&&request.method==='POST'){
  const result=await runDriveBackup(store,env,new Date(),transport);return Response.json(result,{status:result.status==='Verificada'?200:503,headers});
 }
 if(url.pathname==='/auth/backups/login'&&request.method==='GET'){
  const nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const state=sealCredential({email:identity.email,refreshToken:verifier,folderId:nonce},config.sealKey);
  const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.origin+'/auth/backups/callback',response_type:'code',scope:'openid email '+scope,access_type:'offline',prompt:'consent',login_hint:config.ownerEmail,state:nonce,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  return redirect(target.toString(),serializeCookieHeader(cookieName,state,cookieOptions));
 }
 if(url.pathname==='/auth/backups/callback'&&request.method==='GET'){
  const clear=serializeCookieHeader(cookieName,'',{...cookieOptions,maxAge:0});
  try{
   const cookie=parseCookieHeader(request.headers.get('cookie')??'').find(c=>c.name===cookieName)?.value;if(!cookie||url.searchParams.has('error')||!url.searchParams.get('code'))throw Error('oauth-callback');
   const stored=openCredential(cookie,config.sealKey);if(!equal(stored.folderId??'',url.searchParams.get('state')??'')||stored.email!==identity.email)throw Error('oauth-state');
   const response=await transport('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:config.origin+'/auth/backups/callback',client_id:config.clientId,client_secret:config.clientSecret,code_verifier:stored.refreshToken}),redirect:'error'});
   if(!response.ok)throw Error('oauth-token');const tokens=await response.json();if(!tokens.refresh_token||!String(tokens.scope??'').split(' ').includes(scope))throw Error('oauth-scope');
   const profile=await transport('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+tokens.access_token},redirect:'error'});if(!profile.ok)throw Error('oauth-identity');const user=await profile.json();if(user.email_verified!==true||String(user.email).toLowerCase()!==config.ownerEmail)throw Error('oauth-identity');
   await store.saveBackup(config.workspaceId,{email:config.ownerEmail,sealed:sealCredential({email:config.ownerEmail,refreshToken:tokens.refresh_token},config.sealKey)});
   return redirect('/?backup=connected#Ayuda',clear);
  }catch{return redirect('/?backup=failed#Ayuda',clear);}
 }
 return Response.json({error:'Ruta no encontrada.'},{status:404,headers});
}
export async function runDriveBackup(store:BackupStore,env:Record<string,string|undefined>,now=new Date(),transport:typeof fetch=fetch){
 const config=backupConfig(env);if(!config)return {status:'Pendiente de configuración'};
 const token=randomBytes(16).toString('hex'),leaseToken=crypto.randomUUID(),job='backup:drive';
 if(store.claimJob&&!await store.claimJob(config.workspaceId,job,leaseToken))return {status:'En ejecución'};
 try{
  const saved=await store.readBackup(config.workspaceId);if(!saved)return {status:'Pendiente de autorización institucional'};
  const credential=openCredential(saved.sealed,config.sealKey);if(credential.email!==config.ownerEmail)throw Error('backup-owner');
  const response=await transport('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:credential.refreshToken,client_id:config.clientId,client_secret:config.clientSecret}),redirect:'error'});if(!response.ok)throw Error('backup-refresh');const access=await response.json();if(!access.access_token)throw Error('backup-token');
  const state=await store.load(config.workspaceId);if(!state)throw Error('backup-state');
  const content=encryptBackup(state,config.publicKey,config.keyId,now),uploaded=await uploadDriveBackup(content,{workspaceId:config.workspaceId,revision:state.revision,folderId:credential.folderId,accessToken:access.access_token,transport},now);
  const last={status:'Verificada',at:uploaded.at??now.toISOString(),day:uploaded.day,fileId:uploaded.fileId,folderId:uploaded.folderId,revision:uploaded.revision??null,bytes:uploaded.bytes,keyId:uploaded.keyId,reused:uploaded.reused};
  await store.saveBackup(config.workspaceId,{email:config.ownerEmail,sealed:sealCredential({...credential,folderId:uploaded.folderId},config.sealKey),last_backup:last});return last;
 }catch{
  // Never persist provider responses, tokens or work data in diagnostics.
  return {status:'Error al completar la copia',requestId:token};
 }finally{if(store.releaseJob)await store.releaseJob(config.workspaceId,job,leaseToken);}
}
