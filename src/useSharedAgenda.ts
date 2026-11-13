import {useEffect,useState} from 'react';
import type {TeamEvent} from '../shared/calendar';

export type SharedAgenda={events:TeamEvent[];connections:{memberId:string;syncedAt:string|null;syncError:string|null}[];loading:boolean;error:string;now:number};
export function useSharedAgenda(enabled:boolean):SharedAgenda{
 const [data,setData]=useState<SharedAgenda>({events:[],connections:[],loading:true,error:'',now:Date.now()});
 useEffect(()=>{
  if(!enabled){setData({events:[],connections:[],loading:false,error:'',now:Date.now()});return;}
  const controller=new AbortController();let running=false;
  async function load(refresh=false){
   if(running||controller.signal.aborted||document.visibilityState==='hidden')return;running=true;
   try{
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);
    if(refresh)await fetch('/api/calendar/refresh',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal});
    const response=await fetch('/api/calendar/events',{cache:'no-store',signal});
    if(!response.ok)throw Error();const value=await response.json();
    if(!controller.signal.aborted)setData({events:value.events??[],connections:value.connections??[],loading:false,error:'',now:Date.now()});
   }catch{if(!controller.signal.aborted)setData(previous=>({...previous,loading:false,error:'No pudimos actualizar la agenda.',now:Date.now()}));}finally{running=false;}
  }
  void load().then(()=>load(true));const timer=setInterval(()=>void load(true),300000),tick=setInterval(()=>setData(previous=>({...previous,now:Date.now()})),60000),focus=()=>void load(true);
  window.addEventListener('focus',focus);return()=>{controller.abort();clearInterval(timer);clearInterval(tick);window.removeEventListener('focus',focus);};
 },[enabled]);
 return data;
}
