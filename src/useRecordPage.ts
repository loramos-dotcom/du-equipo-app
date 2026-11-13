import {useEffect,useState}from'react';import type{Row}from'../shared/model';
export function useRecordPage(enabled:boolean,entity:string,filters:Record<string,unknown>,revision:number){
 const [page,setPage]=useState(0),[rows,setRows]=useState<Row[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const serialized=JSON.stringify(filters);useEffect(()=>{setPage(0);},[serialized,entity]);
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();setLoading(true);const timer=setTimeout(async()=>{try{const response=await fetch('/api/records?'+new URLSearchParams({entity,filters:serialized,offset:String(page*50),limit:'50'}),{signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error);setRows(data.rows);setTotal(data.total);setError('');}catch(e){if((e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}},filters.q?250:0);return()=>{controller.abort();clearTimeout(timer);};},[enabled,entity,serialized,page,revision]);
 return {page,setPage,rows,total,loading,error};
}
