create function public.du_fold(value text) returns text language sql immutable strict security invoker set search_path='' as $$select translate(lower(value),'áéíóúüñ','aeiouun')$$;
revoke all on function public.du_fold(text) from public,anon,authenticated;grant execute on function public.du_fold(text) to service_role;
create function public.du_list_records(p_workspace text,p_entity text,p_filters jsonb,p_today text,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare table_name text; result jsonb;
begin
 table_name:=case p_entity when 'tasks' then 'du_tasks' when 'projects' then 'du_projects' when 'issues' then 'du_issues' else null end;
 if table_name is null or p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid page' using errcode='22023';end if;
 execute format($query$
 with matching as materialized(
 select record,id,updated_at from public.%I
 where workspace_id=$1 and not(record?'deletedAt')
 and (coalesce(($2->>'archived')::boolean,false) or not coalesce((record->>'archived')::boolean,false))
 and (coalesce($2->>'q','')='' or public.du_fold(coalesce(record->>'title','')||' '||coalesce(record->>'outcome','')||' '||coalesce(record->>'description','')||' '||coalesce(record->>'code','')) like '%%'||public.du_fold($2->>'q')||'%%')
 and (coalesce($2->>'owner','')='' or case when $3='projects' then record->>'leadId' else record->>'ownerId' end=$2->>'owner')
 and (coalesce($2->>'status',$2->>'state','')='' or case when coalesce($2->>'status',$2->>'state')='open' then record->>'status' not in ('Terminada','Cancelada','Resuelta','Descartada','Finalizado') else record->>'status'=coalesce($2->>'status',$2->>'state') end)
 and (not coalesce(($2->>'independent')::boolean,false) or nullif(record->>'projectId','') is null)
 and (coalesce($2->>'due','')='' or record->>'status' not in ('Terminada','Cancelada') and nullif(record->>'dueDate','') is not null and case when $2->>'due'='soon' then record->>'dueDate'<=($4::date+coalesce((select (metadata#>>'{settings,dueDays}')::integer from public.du_state_meta where workspace_id=$1),3))::text else record->>'dueDate'<$4 end)
 and (coalesce($2->>'area','')='' or record->'areaIds'?($2->>'area'))
 and (coalesce($2->>'delivery','')='' or record->>'delivery'=$2->>'delivery')
 and (coalesce($2->>'priority','')='' or coalesce((record->>'duPriority')::boolean,false))
 and (coalesce($2->>'kind','')='' or record->>'kind'=$2->>'kind')
 and (coalesce($2->>'scope','')='' or record->>'scope'=$2->>'scope')
 and (coalesce($2->>'policy','')='' or record->>'policyId'=$2->>'policy')
 and (coalesce($2->>'preset','')='' or case when $2->>'preset'='stale' then record->>'status' in ('Activo','En preparación','Pausado') and (nullif(record->>'reviewedAt','') is null or record->>'reviewedAt'<=($4::date-coalesce((select (metadata#>>'{settings,staleDays}')::integer from public.du_state_meta where workspace_id=$1),7))::text) else coalesce((record->>'duPriority')::boolean,false) end)
 ), page as(
 select record from matching order by case when $2->>'sort'='title' then record->>'title' when $2->>'sort'='due' then coalesce(nullif(record->>'dueDate',''),'9999') end asc,updated_at desc nulls last,id asc limit $5 offset $6)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(record),'[]')from page),'total',(select count(*)from matching))
 $query$,table_name) into result using p_workspace,p_filters,p_entity,p_today,p_limit,p_offset;
 return result;
end;$$;
revoke all on function public.du_list_records(text,text,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.du_list_records(text,text,jsonb,text,integer,integer) to service_role;
