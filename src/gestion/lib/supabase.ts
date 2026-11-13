import {createClient} from '@supabase/supabase-js';
import {managementUrl,managementPublishableKey} from '../../../shared/management-config';
// All Data API operations go through DU's same-origin gateway. Tokens stay in HttpOnly cookies.
export async function managementFetch(input:RequestInfo|URL,init?:RequestInit){
 const source=input instanceof Request?input.url:String(input),url=new URL(source);
 if(url.origin!==managementUrl)throw new Error('Destino del tablero no permitido.');
 const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));
 headers.delete('authorization');headers.delete('apikey');
 const response=await fetch('/api/gestion/proxy?route='+encodeURIComponent(url.pathname+url.search),{...init,headers,credentials:'same-origin',cache:'no-store'});
 if([401,403].includes(response.status))window.dispatchEvent(new Event('du-management-access-changed'));
 if(response.ok&&init?.method&&!['GET','HEAD'].includes(init.method.toUpperCase()))window.dispatchEvent(new Event('du-management-changed'));
 return response;
}
export const supabase=createClient(managementUrl,managementPublishableKey,{accessToken:async()=> 'server-session',global:{fetch:managementFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export const isSupabaseConfigured=true;
