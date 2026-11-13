import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {User} from '@supabase/supabase-js';
import type {VerifiedIdentity} from '../shared/team.ts';
import {normalizeEmail} from '../shared/team.ts';

export type TeamConfig={origin:string;supabaseUrl:string;publishableKey:string;secretKey:string;workspaceId:string};
export function teamConfig(env:Record<string,string|undefined>):TeamConfig{
 if(env.APP_MODE!=='team')throw Error('El modo institucional no está habilitado.');
 const values=[env.APP_ORIGIN,env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,env.SUPABASE_SECRET_KEY,env.DU_WORKSPACE_ID];
 if(values.some(v=>!v?.trim()))throw Error('Falta configurar el acceso institucional.');
 const origin=new URL(env.APP_ORIGIN!),sb=new URL(env.SUPABASE_URL!);
 if(origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN||sb.protocol!=='https:'||sb.username||sb.password||sb.pathname!=='/'||sb.search||sb.hash)throw Error('La configuración exige orígenes HTTPS exactos.');
 if(!/^[a-zA-Z0-9_-]{3,80}$/.test(env.DU_WORKSPACE_ID!))throw Error('Identificador de espacio inválido.');
 return {origin:origin.origin,supabaseUrl:sb.origin,publishableKey:env.SUPABASE_PUBLISHABLE_KEY!,secretKey:env.SUPABASE_SECRET_KEY!,workspaceId:env.DU_WORKSPACE_ID!};
}
export function verifiedGoogleIdentity(user:User|null):VerifiedIdentity|null{
 if(!user?.id||!user.email||!user.email_confirmed_at||user.app_metadata?.provider!=='google')return null;
 const email=normalizeEmail(user.email);
 if(!/^[^\s@]+@bue\.edu\.ar$/.test(email))return null;
 const google=user.identities?.find(i=>i.provider==='google'&&i.identity_data?.email_verified===true&&normalizeEmail(i.identity_data.email??'')===email);
 return google?{id:user.id,email,verified:true,provider:'google'}:null;
}

export function requestAuth(request:Request,config:TeamConfig,transport:typeof fetch=fetch){
 const cookies=new Map(parseCookieHeader(request.headers.get('cookie')??'').map(c=>[c.name,c.value]));
 const pending=new Map<string,string>();
 const client=createServerClient(config.supabaseUrl,config.publishableKey,{
  cookieOptions:{name:'du-institutional',httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:28800},
  global:{fetch:transport},
  cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:(items)=>{for(const {name,value,options} of items){cookies.set(name,value);pending.set(name,serializeCookieHeader(name,value,{...options,httpOnly:true,secure:true,sameSite:'lax',path:'/'}));}}}
 });
 return {
  async identity(){
   const {data:{session},error:sessionError}=await client.auth.getSession();if(sessionError||!session)return null;
   const {data:verified,error:claimsError}=await client.auth.getClaims(session.access_token);
   if(claimsError||!verified?.claims||!verified.claims.amr?.some(method=>typeof method==='object'&&method!==null&&method.method==='oauth'))return null;
   const {data,error}=await client.auth.getUser(session.access_token);
   return error||verified.claims.sub!==data.user?.id?null:verifiedGoogleIdentity(data.user);
  },
  async login(){const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:config.origin+'/auth/callback',scopes:'openid email profile',queryParams:{prompt:'select_account'},skipBrowserRedirect:true}});if(error||!data.url)throw Error('oauth');return data.url;},
  async exchange(code:string){const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw Error('oauth');},
  async logout(){const {error}=await client.auth.signOut({scope:'local'});for(const name of cookies.keys())if(name.startsWith('du-institutional'))pending.set(name,serializeCookieHeader(name,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0}));if(error)throw Error('logout');},
  finish(response:Response){const h=new Headers(response.headers);h.set('cache-control','private, no-store, max-age=0');h.set('pragma','no-cache');h.set('expires','0');h.set('vary','Cookie');for(const value of pending.values())h.append('set-cookie',value);return new Response(response.body,{status:response.status,headers:h});}
 };
}
