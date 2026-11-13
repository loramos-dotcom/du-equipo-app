import type {Store,HistoryParams}from'./api.ts';
import type{Row,State,Collection}from'../shared/model.ts';
import{dateInBA,normalize}from'../shared/model.ts';
import{DomainError,publicState}from'../shared/domain.ts';
import{withoutPrivateIdentityFields}from'../shared/identity-privacy.ts';
export async function readQuery(request:Request,store:Store,key:string,actor:Row,state?:State){
 const url=new URL(request.url),path=url.pathname;const json=(data:unknown)=>Response.json(data,{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  if(path==='/api/records'&&request.method==='GET'){

   const entity=url.searchParams.get('entity')??'',offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);if(!['tasks','projects','issues'].includes(entity)||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new DomainError('Página no válida.',400);
   const raw=JSON.parse(url.searchParams.get('filters')??'{}');if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DomainError('Filtros no válidos.',400);const filters:Record<string,any>={};for(const key of ['q','owner','status','state','due','area','delivery','priority','kind','scope','policy','preset','sort','relationship','parent'])if(raw[key]!==undefined){if(typeof raw[key]!=='string')throw new DomainError('Filtro no válido.',400);filters[key]=raw[key];}for(const key of ['archived','independent'])if(raw[key]!==undefined){if(typeof raw[key]!=='boolean')throw new DomainError('Filtro no válido.',400);filters[key]=raw[key];}
   if(filters.relationship&&!['roots','children','blocked'].includes(filters.relationship))throw new DomainError('Elegí un vínculo de trabajo válido.',400);
   if(entity==='tasks'){delete filters.parent;if(filters.relationship!=='blocked')delete filters.relationship;}
   if(entity==='issues'&&actor.role!=='Coordinación')filters.owner=actor.id;
   // The work graph is stored in existing task records. Resolve prerequisites
   // before paginating, so filters never depend on which page happens to be visible.
   // This also works with the deployed database schema, without a separate migration.
   if(entity==='tasks'&&(filters.q||filters.relationship)){
    const source=state??await store.load(key,{history:false});if(!source)throw new DomainError('No se pudo cargar el trabajo del equipo.',503);
    const {selectTasks}=await import('../shared/views.ts');const rows=selectTasks(source,{owner:'',state:'',due:'',independent:false,...filters},dateInBA());return json({rows:rows.slice(offset,offset+limit),total:rows.length});
   }
   if(store.records)return json(await store.records(key,entity,filters,dateInBA(),offset,limit));
   const {selectTasks}=await import('../shared/views.ts');const rows=entity==='tasks'?selectTasks(publicState(state!,actor.id),{owner:'',state:'',due:'',independent:false,...filters},dateInBA()):publicState(state!,actor.id).data[entity as Collection].filter(r=>!r.external&&(filters.archived||!r.archived)&&(!filters.q||normalize(r.title+' '+r.outcome).includes(normalize(filters.q)))&&(!filters.owner||(entity==='projects'?r.leadId:r.ownerId)===filters.owner)&&(!filters.status||r.status===filters.status)&&(!filters.area||r.areaIds?.includes(filters.area))&&(!filters.delivery||r.delivery===filters.delivery)&&(!filters.priority||r.duPriority)&&(!filters.kind||r.kind===filters.kind)&&(!filters.scope||r.scope===filters.scope)&&(!filters.policy||r.policyId===filters.policy));return json({rows:rows.slice(offset,offset+limit),total:rows.length});
  }
  if(path==='/api/history'&&request.method==='GET'){

   const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new DomainError('Página no válida.',400);
   const params:HistoryParams={offset,limit,entity:url.searchParams.get('entity')??'',entityId:url.searchParams.get('entityId')??'',actor:url.searchParams.get('actor')??'',q:url.searchParams.get('q')??'',from:url.searchParams.get('from')??'',to:url.searchParams.get('to')??'',restricted:actor.role!=='Coordinación',viewerId:actor.id};
   for(const value of [params.from,params.to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value))throw new DomainError('Fecha no válida.',400);
   if(params.restricted&&['members','settings','export','filters','preferences','notifications'].includes(params.entity??''))throw new DomainError('No tenés permiso para este historial.',403);
   if(store.history){const result=await store.history(key,params);if(params.restricted)result.rows=result.rows.map(withoutPrivateIdentityFields);return json(result);}
   const rows=publicState(state!,actor.id).audit.filter(e=>(!params.entity||e.entity===params.entity)&&(!params.entityId||e.entityId===params.entityId)&&(!params.actor||e.actorId===params.actor)&&(!params.q||normalize(JSON.stringify(e)).includes(normalize(params.q)))&&(!params.from||dateInBA(new Date(e.at))>=params.from)&&(!params.to||dateInBA(new Date(e.at))<=params.to)).slice().reverse();return json({rows:rows.slice(offset,offset+limit),total:rows.length});
  }
 return null;
}
