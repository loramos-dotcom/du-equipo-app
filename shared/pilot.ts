import {addDays}from'./model.ts';import type{Row}from'./model.ts';
export function pilotProgress(records:Row[]){
 const conforming=records.filter(r=>r.result==='Conforme'&&r.confirmedObserved===true&&r.taskCreateSeconds<30&&r.statusActions<=2).sort((a,b)=>a.weekId.localeCompare(b.weekId));
 let current=0,longest=0,previous='';for(const row of conforming){current=previous&&addDays(previous,7)===row.weekId?current+1:1;longest=Math.max(longest,current);previous=row.weekId;}
 return {recorded:records.length,consecutive:longest,readyForAcceptance:longest>=3};
}
