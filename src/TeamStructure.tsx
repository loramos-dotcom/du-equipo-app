import type {Row} from '../shared/model';
export default function TeamStructure({members,visibleIds,onPlan}:{members:Row[];visibleIds:string[];onPlan:(id:string)=>void}){
 const visible=new Set(visibleIds),byId=new Map(members.map(m=>[m.id,m]));
 for(const id of visibleIds){let person=byId.get(id);const seen=new Set<string>();while(person?.reportsTo&&!seen.has(person.id)){seen.add(person.id);visible.add(person.reportsTo);person=byId.get(person.reportsTo);}}
 const roots=members.filter(m=>visible.has(m.id)&&(!m.reportsTo||!byId.has(m.reportsTo)));
 const branch=(m:Row,ancestors:Set<string>)=>{if(ancestors.has(m.id))return null;const seen=new Set([...ancestors,m.id]),children=members.filter(child=>visible.has(child.id)&&child.reportsTo===m.id);return <li key={m.id}><article className="org-person"><span className="eyebrow">{m.role}</span><h3>{m.name}</h3><p>{m.functionTitle}</p>{m.reportsTo&&<small>Depende de {byId.get(m.reportsTo)?.name??'Referencia histórica'}</small>}<button className="text-button" onClick={()=>onPlan(m.id)}>Ver semana</button></article>{children.length>0&&<ul>{children.map(child=>branch(child,seen))}</ul>}</li>;};
 return <section className="team-organigram" aria-label="Organigrama funcional"><h2>Relaciones funcionales</h2><ul>{roots.map(person=>branch(person,new Set()))}</ul></section>;
}

