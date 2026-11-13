-- Procedimiento manual revisado para el origen del Tablero de Gestión.
-- No se ejecuta al instalar, compilar o desplegar DU Equipo.
-- Revisar autorización, destino y precondiciones antes de activar el flag.
-- Conserva SELECT, DML autenticado, RLS, propietarios, funciones y registros.
-- Ante un contrato distinto aborta; no retirar los controles para forzarlo.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- set local "du.reviewed_write_hardening"='APPLY_REVIEWED_PUBLIC_WRITE_PRIVILEGES_V1';
do $reviewed_write_guard$
declare
 expected_names constant text[]:=array['access_grants','area_permissions','areas','attachments','audit_log','budget_execution','dashboard_favorites','dashboard_permissions','du_management_revisions','indicators','migration_runs','migration_source_rows','milestones','next_step_owners','next_steps','profiles','project_areas','project_updates','projects','qa_entries','source_documents','special_views'];
 anon_oid oid:=to_regrole('anon')::oid;
 auth_oid oid:=to_regrole('authenticated')::oid;
 actual_names text[];
 target record;
 privilege_name text;
 auth_dml_expected boolean;
 all_columns text;
 select_before jsonb;select_after jsonb;
 dml_before jsonb;dml_after jsonb;
 structure_before jsonb;structure_after jsonb;
 select_snapshot constant text:=$select_snapshot$
  with rel as(select c.* from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in('r','p','f','v','m')),
  entries as(
   select r.oid,0::integer as column_number,a.grantor,a.grantee,a.is_grantable
    from rel r,lateral pg_catalog.aclexplode(coalesce(r.relacl,pg_catalog.acldefault('r',r.relowner)))a where a.privilege_type='SELECT'
   union all
   select r.oid,c.attnum,a.grantor,a.grantee,a.is_grantable from rel r
    join pg_catalog.pg_attribute c on c.attrelid=r.oid and c.attnum>0 and not c.attisdropped
    cross join lateral pg_catalog.aclexplode(c.attacl)a where a.privilege_type='SELECT')
  select coalesce(jsonb_agg(jsonb_build_array(oid,column_number,grantor,grantee,is_grantable)
   order by oid,column_number,grantor,grantee,is_grantable),'[]'::jsonb)from entries
 $select_snapshot$;
 dml_snapshot constant text:=$dml_snapshot$
  select coalesce(jsonb_agg(jsonb_build_object('oid',c.oid,
   'insert',has_table_privilege('authenticated',c.oid,'INSERT'),'update',has_table_privilege('authenticated',c.oid,'UPDATE'),
   'delete',has_table_privilege('authenticated',c.oid,'DELETE'),
   'insert_grant',has_table_privilege('authenticated',c.oid,'INSERT WITH GRANT OPTION'),
   'update_grant',has_table_privilege('authenticated',c.oid,'UPDATE WITH GRANT OPTION'),
   'delete_grant',has_table_privilege('authenticated',c.oid,'DELETE WITH GRANT OPTION'),
   'columns',(select coalesce(jsonb_agg(jsonb_build_array(a.attnum,
    has_column_privilege('authenticated',c.oid,a.attnum,'INSERT'),has_column_privilege('authenticated',c.oid,a.attnum,'UPDATE'),
    has_column_privilege('authenticated',c.oid,a.attnum,'INSERT WITH GRANT OPTION'),has_column_privilege('authenticated',c.oid,a.attnum,'UPDATE WITH GRANT OPTION'))
    order by a.attnum),'[]'::jsonb)from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))order by c.oid),'[]'::jsonb)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind in('r','p','f','v','m')
 $dml_snapshot$;
 structure_snapshot constant text:=$structure_snapshot$
  with rel as(select c.*from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind in('r','p','f','v','m')),
  trusted_writers as(
   select relowner as role_id from rel
   union select p.proowner from pg_catalog.pg_proc p where p.prosecdef
   union select oid from pg_catalog.pg_roles where rolname='service_role')
  select jsonb_build_object(
   'relations',(select jsonb_agg(jsonb_build_array(oid,relname,relkind,relowner,relrowsecurity,relforcerowsecurity)order by oid)from rel),
   'trusted_writer_capabilities',(select jsonb_agg(jsonb_build_array(w.role_id,r.oid,p,
     has_table_privilege(w.role_id,r.oid,p),has_table_privilege(w.role_id,r.oid,p||' WITH GRANT OPTION'))order by w.role_id,r.oid,p)
    from rel r cross join trusted_writers w cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[]
     ||case when current_setting('server_version_num')::integer>=170000 then array['MAINTAIN']::text[]else array[]::text[]end)p),
   'trusted_writer_columns',(select jsonb_agg(jsonb_build_array(w.role_id,r.oid,a.attnum,p,
     has_column_privilege(w.role_id,r.oid,a.attnum,p),has_column_privilege(w.role_id,r.oid,a.attnum,p||' WITH GRANT OPTION'))order by w.role_id,r.oid,a.attnum,p)
    from rel r cross join trusted_writers w join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
     cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES'])p),
   'policies',(select coalesce(jsonb_agg(to_jsonb(p)order by p.oid),'[]'::jsonb)from pg_catalog.pg_policy p join rel r on r.oid=p.polrelid),
   'triggers',(select coalesce(jsonb_agg(to_jsonb(t)order by t.oid),'[]'::jsonb)from pg_catalog.pg_trigger t join rel r on r.oid=t.tgrelid),
   'constraints',(select coalesce(jsonb_agg(to_jsonb(c)order by c.oid),'[]'::jsonb)from pg_catalog.pg_constraint c where c.conrelid in(select oid from rel)or c.confrelid in(select oid from rel)),
   'routines',(select coalesce(jsonb_agg(jsonb_build_array(p.oid,encode(pg_catalog.sha256(pg_catalog.convert_to(to_jsonb(p)::text,'UTF8')),'hex'))order by p.oid),'[]'::jsonb)
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')or p.prosecdef))
 $structure_snapshot$;
begin
 if current_setting('du.reviewed_write_hardening',true)is distinct from'APPLY_REVIEWED_PUBLIC_WRITE_PRIVILEGES_V1'then
  raise exception 'PUBLIC_WRITE_HARDENING_REQUIRES_REVIEW'using errcode='42501';
 end if;
 if anon_oid is null or auth_oid is null or exists(select 1 from pg_catalog.pg_roles where oid in(anon_oid,auth_oid)and(rolsuper or rolbypassrls))then
  raise exception 'CLIENT_ROLE_CONTRACT_REQUIRES_REVIEW'using errcode='42501';
 end if;
 select array_agg(c.relname::text order by c.relname)into actual_names from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind in('r','p','f','v','m');
 if actual_names is null or cardinality(actual_names)<>cardinality(expected_names)
  or not(actual_names @> expected_names and actual_names <@ expected_names)then
  raise exception 'PUBLIC_RELATION_SET_CHANGED_REVIEW_REQUIRED'using errcode='22023';
 end if;
 for target in select c.*from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'and c.relname=any(expected_names)
 loop
  if target.relkind not in('r','p')or not target.relrowsecurity
   or pg_has_role(anon_oid,target.relowner,'USAGE')or pg_has_role(auth_oid,target.relowner,'USAGE')then
   raise exception 'TARGET_RLS_OR_OWNER_CONTRACT_CHANGED'using errcode='42501';
  end if;
  auth_dml_expected:=target.relname not in('profiles','du_management_revisions');
  foreach privilege_name in array array['INSERT','UPDATE','DELETE']loop
   if has_table_privilege(auth_oid,target.oid,privilege_name)is distinct from auth_dml_expected then
    raise exception 'AUTHENTICATED_DML_BASELINE_CHANGED'using errcode='22023';
   end if;
   if auth_dml_expected and not exists(select 1 from pg_catalog.aclexplode(coalesce(target.relacl,pg_catalog.acldefault('r',target.relowner)))a
    where a.privilege_type=privilege_name and a.grantee not in(0,anon_oid)and pg_has_role(auth_oid,a.grantee,'USAGE'))then
    raise exception 'AUTHENTICATED_DML_DEPENDS_ON_REVOKED_ROLE'using errcode='42501';
   end if;
  end loop;
  if not auth_dml_expected and has_any_column_privilege(auth_oid,target.oid,'INSERT,UPDATE')then
   raise exception 'AUTHENTICATED_COLUMN_DML_BASELINE_CHANGED'using errcode='22023';
  end if;
  -- A parent-role grant cannot be removed safely by changing these three grantees.
  if exists(select 1 from pg_catalog.aclexplode(coalesce(target.relacl,pg_catalog.acldefault('r',target.relowner)))a
   where a.privilege_type<>'SELECT'and(
    ((case when a.grantee=0 then true else pg_has_role(anon_oid,a.grantee,'USAGE')end)
     and not(a.grantee in(0,anon_oid)or(a.grantee=auth_oid and a.privilege_type in('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'))))
    or((case when a.grantee=0 then true else pg_has_role(auth_oid,a.grantee,'USAGE')end)
     and a.privilege_type not in('INSERT','UPDATE','DELETE')and a.grantee not in(0,anon_oid,auth_oid))))then
   raise exception 'INHERITED_TABLE_PRIVILEGE_REQUIRES_REVIEW'using errcode='42501';
  end if;
  if exists(select 1 from pg_catalog.pg_attribute c cross join lateral pg_catalog.aclexplode(c.attacl)a
   where c.attrelid=target.oid and c.attnum>0 and not c.attisdropped and a.privilege_type<>'SELECT'and(
    ((case when a.grantee=0 then true else pg_has_role(anon_oid,a.grantee,'USAGE')end)
     and not(a.grantee in(0,anon_oid)or(a.grantee=auth_oid and a.privilege_type='REFERENCES')))
    or((case when a.grantee=0 then true else pg_has_role(auth_oid,a.grantee,'USAGE')end)
     and a.privilege_type not in('INSERT','UPDATE')and a.grantee not in(0,anon_oid,auth_oid))))then
   raise exception 'INHERITED_COLUMN_PRIVILEGE_REQUIRES_REVIEW'using errcode='42501';
  end if;
 end loop;
 execute select_snapshot into select_before;
 execute dml_snapshot into dml_before;
 execute structure_snapshot into structure_before;
 for target in select c.*from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'and c.relname=any(expected_names)
 loop
  select string_agg(format('%I',attname),','order by attnum)into all_columns from pg_catalog.pg_attribute
   where attrelid=target.oid and attnum>0 and not attisdropped;
  if all_columns is null then raise exception 'TARGET_COLUMNS_CHANGED'using errcode='22023';end if;
  execute format('revoke insert,update,delete,truncate,references,trigger on table public.%I from public,anon',target.relname);
  execute format('revoke truncate,references,trigger on table public.%I from authenticated',target.relname);
  execute format('revoke insert(%s),update(%s),references(%s)on table public.%I from public,anon',all_columns,all_columns,all_columns,target.relname);
  execute format('revoke references(%s)on table public.%I from authenticated',all_columns,target.relname);
  if current_setting('server_version_num')::integer>=170000 then
   execute format('revoke maintain on table public.%I from public,anon,authenticated',target.relname);
  end if;
  foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']loop
   if has_table_privilege(anon_oid,target.oid,privilege_name)
    or(privilege_name in('TRUNCATE','REFERENCES','TRIGGER')and has_table_privilege(auth_oid,target.oid,privilege_name))then
    raise exception 'CLIENT_TABLE_PRIVILEGE_REMAINS'using errcode='42501';
   end if;
  end loop;
  if has_any_column_privilege(anon_oid,target.oid,'INSERT,UPDATE,REFERENCES')or has_any_column_privilege(auth_oid,target.oid,'REFERENCES')then
   raise exception 'CLIENT_COLUMN_PRIVILEGE_REMAINS'using errcode='42501';
  end if;
  if current_setting('server_version_num')::integer>=170000 then
   if has_table_privilege(anon_oid,target.oid,'MAINTAIN')or has_table_privilege(auth_oid,target.oid,'MAINTAIN')then
    raise exception 'CLIENT_MAINTAIN_PRIVILEGE_REMAINS'using errcode='42501';
   end if;
  end if;
 end loop;
 execute select_snapshot into select_after;
 execute dml_snapshot into dml_after;
 execute structure_snapshot into structure_after;
 if select_before is distinct from select_after or dml_before is distinct from dml_after or structure_before is distinct from structure_after then
  raise exception 'PRESERVED_READ_DML_OR_DEFINITIONS_CHANGED'using errcode='42501';
 end if;
end;
$reviewed_write_guard$;
commit;

-- Real post-COMMIT metadata verification; does not read application rows.
with expected(name)as(select unnest(array['access_grants','area_permissions','areas','attachments','audit_log','budget_execution','dashboard_favorites','dashboard_permissions','du_management_revisions','indicators','migration_runs','migration_source_rows','milestones','next_step_owners','next_steps','profiles','project_areas','project_updates','projects','qa_entries','source_documents','special_views']::text[])),
privileges(name)as(select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[]||case when current_setting('server_version_num')::integer>=170000 then array['MAINTAIN']::text[]else array[]::text[]end)),
qa_review_targets(signature_label,routine_name,type_shape) as (
 values
 ('public.search_qa_entries(text,integer)','search_qa_entries','simple'),
 ('public.search_qa_entries_hybrid(text,vector,integer,real)','search_qa_entries_hybrid','hybrid')
),
qa_review_source as (
 select t.signature_label,p.oid,l.lanname,p.prosecdef,p.prosrc,p.prosqlbody is not null as parsed_sql_body,
  count(p.oid) over(partition by t.signature_label) as matching_variants
 from qa_review_targets t
 left join lateral (
  select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=t.routine_name and p.prokind='f'
   and p.proargtypes[0]='pg_catalog.text'::pg_catalog.regtype
   and (
    t.type_shape='simple' and p.pronargs=2 and p.proargtypes[1]='pg_catalog.int4'::pg_catalog.regtype
    or t.type_shape='hybrid' and p.pronargs=4
     and p.proargtypes[1] in (select v.oid from pg_catalog.pg_type v join pg_catalog.pg_namespace ns on ns.oid=v.typnamespace
      where v.typname='vector' and ns.nspname in ('public','extensions'))
     and p.proargtypes[2]='pg_catalog.int4'::pg_catalog.regtype
     and p.proargtypes[3]='pg_catalog.float4'::pg_catalog.regtype
   )
 )p on true
 left join pg_catalog.pg_language l on l.oid=p.prolang
),
qa_review_quoted as (
 select q.*,
  case when q.lanname='sql' and pg_catalog.length(q.prosrc)<=32768 then
   pg_catalog.regexp_replace(q.prosrc,$qa_quotes$'([^']|'')*'|"([^"]|"")*"$qa_quotes$,'[LITERAL]','g')
  else null end as quoted_redacted
 from qa_review_source q
),
qa_review_parameters as (
 select q.*,pg_catalog.regexp_replace(q.quoted_redacted,$qa_params$\$[0-9]+$qa_params$,'[PARAMETER]','g') as code_redacted
 from qa_review_quoted q
),
qa_review_safety as (
 select q.*,
  q.oid is not null and q.matching_variants=1 and q.lanname='sql' and not q.parsed_sql_body
   and pg_catalog.length(q.prosrc)<=32768 and pg_catalog.btrim(q.prosrc)<>''
   and pg_catalog.strpos(q.prosrc,chr(92))=0
   and pg_catalog.strpos(q.prosrc,'--')=0
   and pg_catalog.strpos(q.prosrc,'/*')=0 and pg_catalog.strpos(q.prosrc,'*/')=0
   and pg_catalog.strpos(q.code_redacted,'$')=0
   and pg_catalog.strpos(q.code_redacted,chr(39))=0 and pg_catalog.strpos(q.code_redacted,chr(34))=0
   and q.code_redacted !~* $qa_prefix$\m(e|n|b|x|u&)[[:space:]]*\[LITERAL\]$qa_prefix$
   and q.code_redacted !~* $qa_numeric$\m0[xbo][0-9a-f_]+$qa_numeric$
   and pg_catalog.translate(q.code_redacted,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_ .,;():=<>!+*/%|&~?@#^[]{}-'||chr(9)||chr(10)||chr(13),'')=''
   as supported_redaction
 from qa_review_parameters q
),
qa_review_body as (
 select q.*,
  case when q.supported_redaction then
   pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(q.code_redacted,$qa_numbers$[0-9]+([.][0-9]*)?([eE][+-]?[0-9]+)?|[.][0-9]+([eE][+-]?[0-9]+)?$qa_numbers$,'[NUMBER]','g'),
    $qa_constants$\m(true|false|null)\M$qa_constants$,'[CONSTANT]','gi')
  else null end as safe_body
 from qa_review_safety q
),
qa_search_review as (
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'signature',q.signature_label,
  'found',q.oid is not null,
  'matchingVariants',q.matching_variants,
  'language',case when q.lanname ~ '^[a-z_]+$' then q.lanname else null end,
  'securityDefiner',q.prosecdef,
  'bodySha256',case when q.oid is not null then pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(q.prosrc,'UTF8')),'hex') else null end,
  'usesParsedSqlBody',coalesce(q.parsed_sql_body,false),
  'hasQuotedIdentifiers',coalesce(pg_catalog.strpos(q.prosrc,chr(34))>0,false),
  'needsPrivateReview',not coalesce(q.supported_redaction,false),
  'redactedSql',q.safe_body
 ) order by q.signature_label,q.oid),'[]'::jsonb) as items
 from qa_review_body q
),
report as(
 select e.name,c.oid is not null and c.relrowsecurity as rls_enabled,
  c.oid is not null and not pg_has_role(to_regrole('anon')::oid,c.relowner,'USAGE')and not pg_has_role(to_regrole('authenticated')::oid,c.relowner,'USAGE')as no_client_owner,
  c.oid is not null and not exists(select 1 from privileges p where has_table_privilege('anon',c.oid,p.name))
   and not has_any_column_privilege('anon',c.oid,'INSERT,UPDATE,REFERENCES')as anonymous_write_blocked,
  c.oid is not null and not exists(select 1 from privileges p where p.name not in('INSERT','UPDATE','DELETE')and has_table_privilege('authenticated',c.oid,p.name))
   and not has_any_column_privilege('authenticated',c.oid,'REFERENCES')as authenticated_technical_privileges_blocked,
  c.oid is not null and not exists(select 1 from unnest(array['INSERT','UPDATE','DELETE'])p
   where has_table_privilege('authenticated',c.oid,p)is distinct from(e.name not in('profiles','du_management_revisions')))
   and(e.name not in('profiles','du_management_revisions')or not has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE'))as authenticated_dml_matches_reviewed_baseline,
  case when c.oid is null then null else has_table_privilege('anon',c.oid,'SELECT')end as current_anon_select_acl,
  case when c.oid is null then null else has_table_privilege('authenticated',c.oid,'SELECT')end as current_authenticated_select_acl
 from expected e left join pg_catalog.pg_class c on c.oid=to_regclass(format('public.%I',e.name))
),context as(
 select(select count(*)from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind in('r','p','f','v','m'))=22
  and(select count(*)from report where rls_enabled)=22 as exact_reviewed_relation_set,
  (select count(*)=2 and bool_and(not rolsuper and not rolbypassrls)from pg_catalog.pg_roles where rolname in('anon','authenticated'))as no_client_bypass
)
select jsonb_build_object('checks_passed',coalesce((select bool_and(rls_enabled and no_client_owner and anonymous_write_blocked and authenticated_technical_privileges_blocked and authenticated_dml_matches_reviewed_baseline)from report),false)
  and x.exact_reviewed_relation_set and x.no_client_bypass,
 'exact_reviewed_relation_set',x.exact_reviewed_relation_set,'clients_cannot_bypass_rls',x.no_client_bypass,
 'targets',(select jsonb_agg(to_jsonb(r)order by name)from report r),
 'qa_search_routines',(select items from qa_search_review),
 'application_rows_read_or_modified_by_script',false)
 as public_write_privilege_verification from context x;
