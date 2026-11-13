import type {User} from '@supabase/supabase-js';
export async function managementSession():Promise<{connected:boolean;user?:User;duEmail?:string}>{
 const response=await fetch('/api/gestion/session',{cache:'no-store',credentials:'same-origin'});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo verificar la conexión con el tablero.');return result;
}
export async function managementUser(){const result=await managementSession();if(!result.connected||!result.user)throw new Error('Volvé a ingresar con Google para continuar.');return result.user;}
