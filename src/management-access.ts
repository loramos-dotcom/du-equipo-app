import {managementReturnPaths} from '../shared/management-config';
let leaving=false;
const attemptKey='du-gestion-ingreso';
export function managementAccessReady(){leaving=false;sessionStorage.removeItem(attemptKey);}
export function automaticManagementAccess(){
 if(leaving)return true;
 if(new URLSearchParams(location.search).get('gestion')==='unavailable')return false;
 // One automatic attempt per navigation cycle. Failures never create redirect loops.
 const previous=Number(sessionStorage.getItem(attemptKey)??0);
 if(Date.now()-previous<60000)return false;
 sessionStorage.setItem(attemptKey,String(Date.now()));leaving=true;
 const path='/'+location.hash;
 const next=Object.entries(managementReturnPaths).find(([,value])=>value===path)?.[0]??'home';
 location.replace('/auth/gestion/login?next='+next);
 return true;
}
