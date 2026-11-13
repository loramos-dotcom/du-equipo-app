-- PROCEDIMIENTO OPERACIONAL MANUAL. Revisar destino y autorizacion antes de ejecutar.
-- Revision 2: falla cerrado ante clientes que pueden eludir RLS o ser propietarios.
-- Destino: proyecto Supabase del Tablero vinculado, distinto de DU. No modifica registros.
-- Solo qa_entries/source_documents: elimina SELECT anon/PUBLIC y agrega guard BUE
-- restrictivo sin borrar policies existentes ni reducir SELECT de integrantes BUE.
-- private.apply_access_grant: elimina EXECUTE cliente; conserva writers definer.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- set local "du.reviewed_catalog_hardening"='APPLY_REVIEWED_QA_AND_INTERNAL_HELPER_V2';
do $reviewed_catalog_guard$
declare
 anon_oid oid:=to_regrole('anon')::oid;
 auth_oid oid:=to_regrole('authenticated')::oid;
 profile_owner oid;
 internal_helper oid:=to_regprocedure('private.apply_access_grant(uuid,text)');
 viewer_helper oid:=to_regprocedure('private.is_authorized_viewer()');
 helper_metadata_before jsonb;
 table_name text;
 table_oid oid;
 table_owner oid;
 all_columns text;
 caller text;
 before_auth_select jsonb;
 before_owner_select boolean;
begin
 if current_setting('du.reviewed_catalog_hardening',true) is distinct from 'APPLY_REVIEWED_QA_AND_INTERNAL_HELPER_V2' then
  raise exception 'CATALOG_HARDENING_REQUIRES_REVIEW' using errcode='42501';
 end if;
 if anon_oid is null or auth_oid is null or to_regclass('public.profiles') is null then
  raise exception 'UNEXPECTED_SOURCE_CONTRACT' using errcode='22023';
 end if;
 if exists(select 1 from pg_catalog.pg_roles where oid in (anon_oid,auth_oid) and (rolsuper or rolbypassrls)) then
  raise exception 'CLIENT_ROLE_CAN_BYPASS_RLS_REVIEW_REQUIRED' using errcode='42501';
 end if;
 select relowner into profile_owner from pg_catalog.pg_class where oid=to_regclass('public.profiles');
 if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
  where p.oid=internal_helper and p.prokind='f' and p.prosecdef and p.proowner=profile_owner
   and l.lanname='plpgsql' and p.prorettype='pg_catalog.void'::regtype
   and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    ='b680f0e6be9108abb804936bb8491b8701486304a4886257af92ebbd39978333') then
  raise exception 'INTERNAL_HELPER_CHANGED_REVIEW_REQUIRED' using errcode='22023';
 end if;
 if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
  where p.oid=viewer_helper and p.prokind='f' and p.prosecdef and p.proowner=profile_owner
   and l.lanname='sql' and p.prorettype='pg_catalog.bool'::regtype
   and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    ='aa37066b456090b44cad913ff65b1ef33f605c8a1c1352b4d9c68f1996c6ec1d')
  or not has_function_privilege(auth_oid,viewer_helper,'EXECUTE')
  or not has_schema_privilege(auth_oid,'private','USAGE') then
  raise exception 'BUE_VIEWER_HELPER_CONTRACT_CHANGED' using errcode='22023';
 end if;
 foreach caller in array array['private.handle_new_user()','public.set_access_grant(text,text,text[],boolean)'] loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(caller)
   and prosecdef and proowner=profile_owner) then
   raise exception 'TRUSTED_CALLER_OWNER_CHANGED' using errcode='22023';
  end if;
 end loop;
 if not has_function_privilege(profile_owner,internal_helper,'EXECUTE') then
  raise exception 'TRUSTED_OWNER_CANNOT_CALL_INTERNAL_HELPER' using errcode='42501';
 end if;
 select to_jsonb(p)-'proacl' into helper_metadata_before from pg_catalog.pg_proc p where p.oid=internal_helper;

 -- Preflight all targets before changing any ACL or policy.
 foreach table_name in array array['qa_entries','source_documents'] loop
  table_oid:=to_regclass(format('public.%I',table_name));
  if table_oid is null or not exists(select 1 from pg_catalog.pg_class
   where oid=table_oid and relkind='r' and relrowsecurity) then
   raise exception 'REVIEWED_PUBLIC_TABLE_CONTRACT_CHANGED' using errcode='22023';
  end if;
  select relowner into table_owner from pg_catalog.pg_class where oid=table_oid;
  if pg_has_role(anon_oid,table_owner,'USAGE') or pg_has_role(auth_oid,table_owner,'USAGE') then
   raise exception 'CLIENT_HAS_TARGET_OWNER_PRIVILEGES_REVIEW_REQUIRED' using errcode='42501';
  end if;
  if not has_table_privilege(auth_oid,table_oid,'SELECT') or not exists(
   select 1 from pg_catalog.pg_class c,
    lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
   where c.oid=table_oid and a.privilege_type='SELECT' and a.grantee not in (0,anon_oid)
    and pg_has_role(auth_oid,a.grantee,'USAGE')
  ) then
   raise exception 'AUTH_SELECT_DEPENDS_ON_REVOKED_ROLE_REVIEW_REQUIRED' using errcode='42501';
  end if;
  if exists(select 1 from pg_catalog.pg_policy where polrelid=table_oid and polname='du_bue_read_guard_v1')
   and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=table_oid and p.polname='du_bue_read_guard_v1'
    and not p.polpermissive and p.polcmd='r' and p.polwithcheck is null
    and p.polroles @> array[anon_oid,auth_oid] and p.polroles <@ array[anon_oid,auth_oid]
    and cardinality(p.polroles)=2
    and regexp_replace(lower(pg_catalog.pg_get_expr(p.polqual,p.polrelid)),'[[:space:]]','','g') in
     ('private.is_authorized_viewer()','(selectprivate.is_authorized_viewer()asis_authorized_viewer)','(selectprivate.is_authorized_viewer())')) then
   raise exception 'EXISTING_INSTITUTIONAL_GUARD_DIFFERS' using errcode='22023';
  end if;
 end loop;

 revoke execute on function private.apply_access_grant(uuid,text) from public,anon,authenticated;
 if has_function_privilege(anon_oid,internal_helper,'EXECUTE')
  or has_function_privilege(auth_oid,internal_helper,'EXECUTE')
  or exists(select 1 from pg_catalog.pg_proc p,
   lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   where p.oid=internal_helper and a.grantee=0 and a.privilege_type='EXECUTE') then
  raise exception 'INHERITED_INTERNAL_HELPER_EXECUTE_REMAINS' using errcode='42501';
 end if;
 if not has_function_privilege(profile_owner,internal_helper,'EXECUTE')
  or helper_metadata_before is distinct from (select to_jsonb(p)-'proacl' from pg_catalog.pg_proc p where p.oid=internal_helper) then
  raise exception 'TRUSTED_HELPER_METADATA_NOT_PRESERVED' using errcode='42501';
 end if;

 foreach table_name in array array['qa_entries','source_documents'] loop
  table_oid:=to_regclass(format('public.%I',table_name));
  select relowner into table_owner from pg_catalog.pg_class where oid=table_oid;
  before_owner_select:=has_table_privilege(table_owner,table_oid,'SELECT');
  before_auth_select:=jsonb_build_object('table',has_table_privilege(auth_oid,table_oid,'SELECT'),
   'any_column',has_any_column_privilege(auth_oid,table_oid,'SELECT'));
  select string_agg(format('%I',attname),',' order by attnum) into all_columns
  from pg_catalog.pg_attribute where attrelid=table_oid and attnum>0 and not attisdropped;
  if all_columns is null then raise exception 'TARGET_COLUMNS_CHANGED' using errcode='22023'; end if;
  execute format('revoke select on table public.%I from public,anon',table_name);
  execute format('revoke select (%s) on table public.%I from public,anon',all_columns,table_name);
  if not exists(select 1 from pg_catalog.pg_policy where polrelid=table_oid and polname='du_bue_read_guard_v1') then
   execute format('create policy du_bue_read_guard_v1 on public.%I as restrictive for select to anon,authenticated using ((select private.is_authorized_viewer()))',table_name);
  end if;
  if has_table_privilege(anon_oid,table_oid,'SELECT') or has_any_column_privilege(anon_oid,table_oid,'SELECT')
   or exists(select 1 from pg_catalog.pg_class c,
    lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid=table_oid and a.grantee=0 and a.privilege_type='SELECT')
   or exists(select 1 from pg_catalog.pg_attribute c,lateral pg_catalog.aclexplode(c.attacl) a
    where c.attrelid=table_oid and c.attnum>0 and not c.attisdropped and a.grantee=0 and a.privilege_type='SELECT') then
   raise exception 'INHERITED_ANONYMOUS_TARGET_READ_REMAINS' using errcode='42501';
  end if;
  if before_owner_select is distinct from has_table_privilege(table_owner,table_oid,'SELECT')
   or before_auth_select is distinct from jsonb_build_object('table',has_table_privilege(auth_oid,table_oid,'SELECT'),
    'any_column',has_any_column_privilege(auth_oid,table_oid,'SELECT')) then
   raise exception 'LEGITIMATE_TARGET_SELECT_NOT_PRESERVED' using errcode='42501';
  end if;
 end loop;
end;
$reviewed_catalog_guard$;
commit;

-- Verification is the final statement for SQL Editor. Catalogs only; no app rows.
with target_names(name) as (values('qa_entries'),('source_documents')),
target_report as (
 select t.name,
  c.oid is not null and c.relrowsecurity as rls_enabled,
  case when c.oid is null then false else not has_table_privilege('anon',c.oid,'SELECT')
   and not has_any_column_privilege('anon',c.oid,'SELECT') end as anon_select_blocked,
  case when c.oid is null then false else has_table_privilege('authenticated',c.oid,'SELECT') end as authenticated_select_preserved,
  case when c.oid is null then false else
   not pg_has_role(to_regrole('anon')::oid,c.relowner,'USAGE')
   and not pg_has_role(to_regrole('authenticated')::oid,c.relowner,'USAGE') end as clients_have_no_owner_privileges,
  exists(select 1 from pg_catalog.pg_policy p
   where p.polrelid=c.oid and p.polname='du_bue_read_guard_v1' and not p.polpermissive and p.polcmd='r'
    and p.polwithcheck is null and cardinality(p.polroles)=2
    and p.polroles @> array[to_regrole('anon')::oid,to_regrole('authenticated')::oid]
    and p.polroles <@ array[to_regrole('anon')::oid,to_regrole('authenticated')::oid]
    and regexp_replace(lower(pg_catalog.pg_get_expr(p.polqual,p.polrelid)),'[[:space:]]','','g') in
     ('private.is_authorized_viewer()','(selectprivate.is_authorized_viewer()asis_authorized_viewer)','(selectprivate.is_authorized_viewer())')) as reviewed_bue_restrictive_guard
 from target_names t left join pg_catalog.pg_class c on c.oid=to_regclass(format('public.%I',t.name))
),helper_report as (
 select
  not has_function_privilege('anon',p.oid,'EXECUTE')
   and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and not exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE') as internal_helper_client_execute_blocked,
  p.prosecdef and has_function_privilege(p.proowner,p.oid,'EXECUTE')
   and p.proowner=(select relowner from pg_catalog.pg_class where oid=to_regclass('public.profiles'))
   and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    ='b680f0e6be9108abb804936bb8491b8701486304a4886257af92ebbd39978333' as trusted_helper_contract_preserved
 from pg_catalog.pg_proc p where p.oid=to_regprocedure('private.apply_access_grant(uuid,text)')
),viewer_report as (
 select exists(select 1 from pg_catalog.pg_proc p
  where p.oid=to_regprocedure('private.is_authorized_viewer()') and p.prosecdef
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    ='aa37066b456090b44cad913ff65b1ef33f605c8a1c1352b4d9c68f1996c6ec1d')
  and has_schema_privilege('authenticated','private','USAGE') as reviewed_bue_viewer_available
),client_role_report as (
 select count(*)=2 and bool_and(not rolsuper and not rolbypassrls) as clients_cannot_bypass_rls
 from pg_catalog.pg_roles where rolname in ('anon','authenticated')
)
select jsonb_build_object(
 'checks_passed',coalesce((select bool_and(rls_enabled and anon_select_blocked and authenticated_select_preserved and clients_have_no_owner_privileges and reviewed_bue_restrictive_guard) from target_report),false)
  and coalesce((select internal_helper_client_execute_blocked and trusted_helper_contract_preserved from helper_report),false)
  and (select reviewed_bue_viewer_available from viewer_report)
  and coalesce((select clients_cannot_bypass_rls from client_role_report),false),
 'targets',(select jsonb_agg(to_jsonb(t) order by name) from target_report t),
 'internal_helper',(select to_jsonb(h) from helper_report h),
 'reviewed_bue_viewer_available',(select reviewed_bue_viewer_available from viewer_report),
 'clients_cannot_bypass_rls',(select clients_cannot_bypass_rls from client_role_report),
 'application_rows_read_or_modified_by_script',false
) as reviewed_catalog_hardening_verification;
