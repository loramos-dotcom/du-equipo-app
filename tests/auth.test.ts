import {test} from 'node:test';import assert from 'node:assert/strict';
import type {User} from '@supabase/supabase-js';
import {teamConfig,verifiedGoogleIdentity,requestAuth} from '../server/auth.ts';import {teamRequest} from '../server/team.ts';
import {institutionalState} from '../shared/team.ts';import type {State} from '../shared/model.ts';
function fixture(){let state=institutionalState('du-team-test',{persona01:'persona01@bue.edu.ar'},'persona01@bue.edu.ar');return {get state(){return state;},store:{async load(){return structuredClone(state);},async create(){throw Error('unexpected');},async save(_key:string,revision:number,next:State){if(state.revision!==revision)return false;state=next;return true;}}};}
const config={origin:'https://du.example.edu',supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_fixture',secretKey:'sb_secret_fixture',workspaceId:'du-team-test'};
const user={id:'user-persona01',email:'persona01@bue.edu.ar',email_confirmed_at:'2026-10-19',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{email:'persona01@bue.edu.ar',email_verified:true}}]} as unknown as User;
function fakeAuth(identity=verifiedGoogleIdentity(user)){let loggedOut=false;return {get loggedOut(){return loggedOut;},identity:async()=>identity,login:async()=>'https://accounts.google.com/o/oauth2/v2/auth',exchange:async(_code:string)=>{},logout:async()=>{loggedOut=true;},finish:(r:Response)=>r};}
test('only server-confirmed Google identity with matching verified email is accepted',()=>{assert.ok(verifiedGoogleIdentity(user));for(const modified of [{email_confirmed_at:undefined},{app_metadata:{provider:'email'}},{identities:[{provider:'google',identity_data:{email:'attacker@example.edu',email_verified:true}}]},{identities:[{provider:'google',identity_data:{email:user.email,email_verified:false}}]}])assert.equal(verifiedGoogleIdentity({...user,...modified} as User),null);assert.equal(verifiedGoogleIdentity(null),null);});

test('Google verification does not admit an external account even if an administrator listed it',()=>{
 for(const email of ['persona01@example.edu','persona01@bue.edu.ar.example.com','persona01@otro-bue.edu.ar','persona01@@bue.edu.ar']){
  assert.equal(verifiedGoogleIdentity({...user,email,identities:[{provider:'google',identity_data:{email,email_verified:true}}]} as unknown as User),null);
 }
});

test('institutional SSR access requires a verified OAuth session, not just a linked Google account',async()=>{
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 for(const method of ['oauth','password','otp','recovery','missing']){
  const timestamp=Math.floor(Date.now()/1000),token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iss:config.supabaseUrl+'/auth/v1',sub:user.id,aud:'authenticated',exp:timestamp+3600,iat:timestamp,amr:method==='missing'?[]:[{method,timestamp}]})+'.'+Buffer.alloc(32).toString('base64url');
  const session={access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:timestamp+3600,user};let validations=0;
  const auth=requestAuth(new Request(config.origin+'/api/state',{headers:{cookie:'du-institutional=base64-'+encode(session)}}),config,async(input,init)=>{
   assert.equal(new URL(String(input)).pathname,'/auth/v1/user');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);validations++;return Response.json(user);
  });
  assert.equal((await auth.identity())?.id??null,method==='oauth'?user.id:null);assert.ok(validations>0);
 }
});

test('SSR rejects claims for another identity and credentials rejected by the identity server',async()=>{
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),timestamp=Math.floor(Date.now()/1000);
 for(const rejectToken of [false,true]){
  const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iss:config.supabaseUrl+'/auth/v1',sub:'another-user',aud:'authenticated',exp:timestamp+3600,iat:timestamp,amr:[{method:'oauth',timestamp}]})+'.'+Buffer.alloc(32).toString('base64url');
  const session={access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:timestamp+3600,user};
  const auth=requestAuth(new Request(config.origin+'/api/state',{headers:{cookie:'du-institutional=base64-'+encode(session)}}),config,async()=>rejectToken?Response.json({msg:'Invalid JWT',code:'bad_jwt'},{status:401}):Response.json(user));
  assert.equal(await auth.identity(),null);
 }
});
test('production configuration fails closed without HTTPS, correct mode and secrets',()=>{const env={APP_MODE:'team',APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,DU_WORKSPACE_ID:config.workspaceId};assert.deepEqual(teamConfig(env),config);for(const partial of [{APP_MODE:'demo'},{APP_ORIGIN:'http://localhost:4173'},{APP_ORIGIN:'https://du.example.edu/path'},{SUPABASE_SECRET_KEY:''}])assert.throws(()=>teamConfig({...env,...partial}));});
test('Google login uses PKCE, exact callback, identity-only scopes and secure HttpOnly cookie',async()=>{const auth=requestAuth(new Request(config.origin+'/auth/login'),config);const url=new URL(await auth.login());assert.equal(url.searchParams.get('provider'),'google');assert.equal(url.searchParams.get('redirect_to'),config.origin+'/auth/callback');assert.ok(url.searchParams.get('code_challenge'));assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.equal(url.searchParams.get('scopes'),'openid email profile');const response=auth.finish(new Response());const cookies=response.headers.getSetCookie().join(';');assert.match(cookies,/HttpOnly/);assert.match(cookies,/Secure/);assert.match(cookies,/SameSite=Lax/);assert.match(response.headers.get('cache-control')!,/no-store/);});
test('anonymous requests cannot read API data through forged demo cookies or identity headers',async()=>{const f=fixture(),auth=fakeAuth(null);const req=new Request(config.origin+'/api/state',{headers:{cookie:'du_demo_actor=persona01','oai-authenticated-user-id':'persona01','oai-authenticated-user-email':user.email!}});assert.equal((await teamRequest(req,config,f.store,()=>auth)).status,401);});
test('cross-origin commands and logout are rejected before auth operations',async()=>{const f=fixture(),auth=fakeAuth();for(const path of ['/api/command','/auth/logout']){assert.equal((await teamRequest(new Request(config.origin+path,{method:'POST',headers:{origin:'https://evil.example'}}),config,f.store,()=>auth)).status,403);}assert.equal(auth.loggedOut,false);});
test('callback checks membership before allowing access; no open return URL',async()=>{const f=fixture(),auth=fakeAuth({id:'outsider',email:'unknown@example.edu',provider:'google',verified:true});const r=await teamRequest(new Request(config.origin+'/auth/callback?code=x&next=https://evil.example'),config,f.store,()=>auth);assert.equal(r.headers.get('location'),'/?access=denied');assert.equal(auth.loggedOut,true);assert.equal(f.state.revision,0);});
test('authorized callback binds identity and completes shared access through a fixed same-origin route',async()=>{const f=fixture(),auth=fakeAuth();const r=await teamRequest(new Request(config.origin+'/auth/callback?code=x&next=https://evil.example'),config,f.store,()=>auth);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/auth/gestion/login?next=home');assert.equal(f.state.data.members[0].authUserId,user.id);});

test('backup link resumes the fixed route after institutional sign-in, without exposing data',async()=>{
 const f=fixture();const start=await teamRequest(new Request(config.origin+'/auth/backups/login'),config,f.store,()=>fakeAuth(null));assert.equal(start.status,303);assert.equal(start.headers.get('location'),'/auth/login');assert.match(start.headers.get('set-cookie')!,/du-backup-next=1.*HttpOnly.*Secure/);
 const callback=await teamRequest(new Request(config.origin+'/auth/callback?code=x&next=https://evil.example',{headers:{cookie:'du-backup-next=1'}}),config,f.store,()=>fakeAuth());assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/auth/backups/login');assert.match(callback.headers.get('set-cookie')!,/Max-Age=0/);
});
test('logout uses POST and clears the session without exposing data',async()=>{const f=fixture(),auth=fakeAuth();assert.equal((await teamRequest(new Request(config.origin+'/auth/logout'),config,f.store,()=>auth)).status,404);const r=await teamRequest(new Request(config.origin+'/auth/logout',{method:'POST',headers:{origin:config.origin}}),config,f.store,()=>auth);assert.equal(r.status,204);assert.equal(auth.loggedOut,true);});
