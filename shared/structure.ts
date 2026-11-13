import type {Row,State} from './model.ts';
export function effectiveArea(state:State,area:Row,today:string):Row{
 const records=(state.data.areaAssignments??[]).filter(a=>a.areaId===area.id&&!a.cancelled);
 if(!records.length||records.every(a=>a.validFrom>today))return area;
 const active=records.filter(a=>a.validFrom<=today&&(!a.validTo||a.validTo>=today));
 return {...area,leadId:active.find(a=>a.assignmentRole==='principal')?.memberId??null,substitutes:active.filter(a=>a.assignmentRole==='suplente').map(a=>a.memberId)};
}
export function overlaps(a:{validFrom:string;validTo?:string|null},b:{validFrom:string;validTo?:string|null}){return a.validFrom<=(b.validTo||'9999-12-31')&&b.validFrom<=(a.validTo||'9999-12-31');}
