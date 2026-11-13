-- Only the private application server can call these ownership-aware reads.
create or replace function public.du_issue_target_visible(p_workspace text,p_actor text,p_entity text,p_id text,p_fallback jsonb default null) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare r jsonb; target_type text; target_id text;
begin
 case p_entity
 when 'issues' then select record into r from public.du_issues where workspace_id=p_workspace and id=p_id;
 when 'interventions' then select record into r from public.du_interventions where workspace_id=p_workspace and id=p_id;
 when 'comments' then select record into r from public.du_comments where workspace_id=p_workspace and id=p_id;
 when 'links' then select record into r from public.du_links where workspace_id=p_workspace and id=p_id;
 when 'agenda' then select record into r from public.du_agenda where workspace_id=p_workspace and id=p_id;
 else return true;end case;
 r:=coalesce(r,p_fallback);if r is null then return false;end if;
 if p_entity='issues' then return coalesce(r->>'ownerId'=p_actor,false);end if;
 if p_entity='interventions' then return public.du_issue_target_visible(p_workspace,p_actor,'issues',r->>'issueId');end if;
 target_type:=case when p_entity='agenda' then r->>'sourceType' else r->>'targetType' end;
 target_id:=case when p_entity='agenda' then r->>'sourceId' else r->>'targetId' end;
 if target_type in ('issues','interventions') then return public.du_issue_target_visible(p_workspace,p_actor,target_type,target_id);end if;
 return true;
end;$$;
revoke all on function public.du_issue_target_visible(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.du_issue_target_visible(text,text,text,text,jsonb) to service_role;

create or replace function public.du_list_history(p_workspace text,p_viewer text,p_filters jsonb,p_offset integer default 0,p_limit integer default 50) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare coordinator boolean; result jsonb;
begin
 select record->>'role'='Coordinación' into coordinator from public.du_members where workspace_id=p_workspace and id=p_viewer and record->>'active'='true';
 if coordinator is null then raise exception 'Inactive viewer' using errcode='42501';end if;
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid page' using errcode='22023';end if;
 with matching as materialized (
 select record,at,id from public.du_audit a where workspace_id=p_workspace
 and (coalesce(p_filters->>'entity','')='' or entity=p_filters->>'entity')
 and (coalesce(p_filters->>'entityId','')='' or entity_id=p_filters->>'entityId')
 and (coalesce(p_filters->>'actor','')='' or actor_id=p_filters->>'actor')
 and (coalesce(p_filters->>'from','')='' or at>=to_char(((p_filters->>'from')::date::timestamp+interval '3 hours'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 and (coalesce(p_filters->>'to','')='' or at<to_char((((p_filters->>'to')::date+1)::timestamp+interval '3 hours'),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 and (coalesce(p_filters->>'q','')='' or search_document@@websearch_to_tsquery('simple',p_filters->>'q'))
 and (coordinator or (entity not in ('members','settings','export','filters','preferences','notifications') and public.du_issue_target_visible(p_workspace,p_viewer,entity,entity_id,coalesce(nullif(record->'after','null'::jsonb),nullif(record->'before','null'::jsonb)))))
 ), page as (select record from matching order by at desc,id desc limit p_limit offset p_offset)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(record),'[]')from page),'total',(select count(*)from matching)) into result;
 return result;
end;$$;
revoke all on function public.du_list_history(text,text,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.du_list_history(text,text,jsonb,integer,integer) to service_role;
