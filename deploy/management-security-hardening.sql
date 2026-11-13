-- PROCEDIMIENTO OPERACIONAL MANUAL. Revisar destino y autorizacion antes de ejecutar.
-- Destino revisado: Supabase fkboxwavttkrkfqbtrwc.
-- Admite solo estados RAW revisados original/parchado; otros cambios abortan.
-- Alcance: quitar escrituras/DDL directos de profiles al cliente y rechazar callers
-- sin identidad/rol root en las dos RPC administrativas existentes.
-- No contiene datos de personas, no modifica filas ni agrega permisos.
-- Exige hashes RAW exactos obtenidos del catálogo real y contrastados con fuente.
-- Conserva propietarios, ACL y metadatos de las funciones. Cualquier diferencia
-- inesperada aborta la transacción completa. No aplicar sin autorización.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Al ejecutar este archivo en el proyecto indicado, aplicas la correccion revisada.
set local "du.reviewed_profile_hardening"='APPLY_REVIEWED_PROFILE_COMBINED_HARDENING_V2';

do $reviewed_hardening$
declare
 table_oid oid:=to_regclass('public.profiles');
 table_owner oid;
 table_owner_name name;
 expected_columns integer;
 function_signature text;
 function_oid oid;
 helper_oid oid:=to_regprocedure('private.current_role()');
 rpc record;
 raw_body text;
 function_definition text;
 before_metadata jsonb;
 after_metadata jsonb;
 expected_new_hash text;
 all_columns text;
 before_flags jsonb;
 owner_capabilities_before jsonb;
 select_capabilities_before jsonb;
 old_guard constant text:=$old$if private.current_role() <> 'root' then$old$;
 new_guard constant text:=$new$if (select auth.uid()) is null or (select private.current_role()) is distinct from 'root' then$new$;
begin
 if current_setting('du.reviewed_profile_hardening',true)
  is distinct from 'APPLY_REVIEWED_PROFILE_COMBINED_HARDENING_V2' then
  raise exception 'PROFILE_HARDENING_REQUIRES_ADMIN_REVIEW' using errcode='42501';
 end if;
 if table_oid is null or to_regclass('public.projects') is null
  or to_regclass('public.special_views') is null then
  raise exception 'UNEXPECTED_DATABASE_CONTRACT' using errcode='22023';
 end if;
 if not exists(select 1 from pg_catalog.pg_class
  where oid=table_oid and relkind in ('r','p')
   and relrowsecurity and not relforcerowsecurity) then
  raise exception 'PROFILE_RLS_OWNER_BYPASS_CONTRACT_CHANGED' using errcode='22023';
 end if;
 select c.relowner,r.rolname into table_owner,table_owner_name
 from pg_catalog.pg_class c join pg_catalog.pg_roles r on r.oid=c.relowner
 where c.oid=table_oid;
 if table_owner_name in ('anon','authenticated')
  or not exists(select 1 from pg_catalog.pg_roles where rolname='anon')
  or not exists(select 1 from pg_catalog.pg_roles where rolname='authenticated') then
  raise exception 'PROFILE_ROLE_OWNERSHIP_REQUIRES_REVIEW' using errcode='22023';
 end if;
 select count(*) into expected_columns from pg_catalog.pg_attribute
 where attrelid=table_oid and attnum>0 and not attisdropped
  and attname in ('id','email','role','display_name','created_at','updated_at');
 if expected_columns<>6 then
  raise exception 'PROFILE_COLUMNS_CHANGED_REVIEW_REQUIRED' using errcode='22023';
 end if;
 if not has_table_privilege(table_owner,table_oid,'UPDATE')
  or not has_table_privilege(table_owner,table_oid,'INSERT')
  or not has_table_privilege(table_owner,table_oid,'SELECT') then
  raise exception 'PROFILE_TRUSTED_OWNER_PRIVILEGES_REQUIRE_REVIEW' using errcode='42501';
 end if;
 foreach function_signature in array array[
  'private.handle_new_user()',
  'private.apply_access_grant(uuid,text)',
  'public.set_access_grant(text,text,text[],boolean)',
  'public.delete_access_grant(text)'
 ] loop
  function_oid:=to_regprocedure(function_signature);
  if function_oid is null or not exists(
   select 1 from pg_catalog.pg_proc p
   where p.oid=function_oid and p.prosecdef and p.proowner=table_owner
  ) then
   raise exception 'TRUSTED_PROFILE_WRITER_OWNER_CONTRACT_CHANGED' using errcode='22023';
  end if;
 end loop;
 if helper_oid is null or not exists(
  select 1 from pg_catalog.pg_proc p
  join pg_catalog.pg_language l on l.oid=p.prolang
  where p.oid=helper_oid and p.prokind='f' and p.prosecdef
   and p.proowner=table_owner and l.lanname='sql' and p.pronargs=0
   and not p.proretset and p.prorettype=to_regtype('public.user_role')
   and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
    ='087f7943af47baf27eeaf1519d11c88397ec01fba2adfa14175d501f6367f630'
 ) then
  raise exception 'ROLE_HELPER_DEFINITION_CHANGED_REVIEW_REQUIRED' using errcode='22023';
 end if;

 -- All contracts are checked before any DDL. Only exact reviewed bodies qualify.
 for rpc in select * from (values
  ('public.set_access_grant(text,text,text[],boolean)',
   'ffdd93e80d1e6bd8a77006ae75711ffad6a4be38f2e125711bb3d1d2191bd1fa',
   '40034d79cb1e73a2767210e85ea93a5a1ff5174a4bc3aa47f18b9ae495e5a795',
   array['target_email','target_display_name','target_area_keys','target_dashboard_edit']::text[]),
  ('public.delete_access_grant(text)',
   '3a32ef87efbddd6ff7d7daa80032612a9e002877d91c98f189ccf58d1b430c65',
   'bc72554e62fd43914747f2943a1e9a9700e63d46e196434a57cd35a7451756b5',
   array['target_email']::text[])
 ) as expected(signature,raw_sha256,hardened_sha256,argument_names)
 loop
  function_oid:=to_regprocedure(rpc.signature);
  if function_oid is null or not exists(
   select 1 from pg_catalog.pg_proc p
   join pg_catalog.pg_language l on l.oid=p.prolang
   where p.oid=function_oid and p.prokind='f' and p.prosecdef
    and p.proowner=table_owner and l.lanname='plpgsql'
    and p.prorettype='pg_catalog.void'::regtype and not p.proretset
    and p.proallargtypes is null and p.proargmodes is null
    and p.proargnames=rpc.argument_names
    and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') in (rpc.raw_sha256,rpc.hardened_sha256)
  ) then
   raise exception 'ADMINISTRATIVE_RPC_DEFINITION_CHANGED_REVIEW_REQUIRED' using errcode='22023';
  end if;
  if has_function_privilege('anon',function_oid,'EXECUTE')
   or not has_function_privilege('authenticated',function_oid,'EXECUTE')
   or exists(
    select 1 from pg_catalog.pg_proc p,
     lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid=function_oid and a.grantee=0 and a.privilege_type='EXECUTE'
   ) then
   raise exception 'ADMINISTRATIVE_RPC_EXECUTE_CONTRACT_CHANGED' using errcode='42501';
  end if;
  select p.prosrc into raw_body from pg_catalog.pg_proc p where p.oid=function_oid;
  function_definition:=pg_catalog.pg_get_functiondef(function_oid);
  if encode(pg_catalog.sha256(pg_catalog.convert_to(raw_body,'UTF8')),'hex')=rpc.raw_sha256 then
   if (length(raw_body)-length(replace(raw_body,old_guard,'')))/length(old_guard)<>1
    or (length(function_definition)-length(replace(function_definition,old_guard,'')))/length(old_guard)<>1 then
    raise exception 'EXACT_SINGLE_REVIEWED_RPC_GUARD_NOT_FOUND' using errcode='22023';
   end if;
  else
   if position(old_guard in raw_body)>0
    or (length(raw_body)-length(replace(raw_body,new_guard,'')))/length(new_guard)<>1
    or (length(function_definition)-length(replace(function_definition,new_guard,'')))/length(new_guard)<>1 then
    raise exception 'EXACT_REVIEWED_HARDENED_GUARD_NOT_FOUND' using errcode='22023';
   end if;
  end if;
 end loop;

 select jsonb_build_object(
  'anon_table_write_or_ddl',has_table_privilege('anon',table_oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated_table_write_or_ddl',has_table_privilege('authenticated',table_oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'anon_any_column_write',has_any_column_privilege('anon',table_oid,'INSERT,UPDATE,REFERENCES'),
  'authenticated_any_column_write',has_any_column_privilege('authenticated',table_oid,'INSERT,UPDATE,REFERENCES')
 ) into before_flags;
 raise notice 'PROFILE_WRITE_ACL_BEFORE: %',before_flags;
 select jsonb_build_object(
   'select',has_table_privilege(table_owner,table_oid,'SELECT'),
   'insert',has_table_privilege(table_owner,table_oid,'INSERT'),
   'update',has_table_privilege(table_owner,table_oid,'UPDATE'),
   'delete',has_table_privilege(table_owner,table_oid,'DELETE'),
   'truncate',has_table_privilege(table_owner,table_oid,'TRUNCATE'),
   'references',has_table_privilege(table_owner,table_oid,'REFERENCES'),
   'trigger',has_table_privilege(table_owner,table_oid,'TRIGGER'),
   'maintain',case when current_setting('server_version_num')::integer>=170000
    then has_table_privilege(table_owner,table_oid,'MAINTAIN') else null end,
   'column_references',has_any_column_privilege(table_owner,table_oid,'REFERENCES')
  ) into owner_capabilities_before;
 select jsonb_build_object(
   'anon_table',has_table_privilege('anon',table_oid,'SELECT'),
   'authenticated_table',has_table_privilege('authenticated',table_oid,'SELECT'),
   'anon_any_column',has_any_column_privilege('anon',table_oid,'SELECT'),
   'authenticated_any_column',has_any_column_privilege('authenticated',table_oid,'SELECT')
  ) into select_capabilities_before;

 -- Re-read the checked bodies immediately before patching. CREATE OR REPLACE
 -- preserves identity/owner/ACL; every other pg_proc field is compared afterward.
 for rpc in select * from (values
  ('public.set_access_grant(text,text,text[],boolean)',
   'ffdd93e80d1e6bd8a77006ae75711ffad6a4be38f2e125711bb3d1d2191bd1fa',
   '40034d79cb1e73a2767210e85ea93a5a1ff5174a4bc3aa47f18b9ae495e5a795'),
  ('public.delete_access_grant(text)',
   '3a32ef87efbddd6ff7d7daa80032612a9e002877d91c98f189ccf58d1b430c65',
   'bc72554e62fd43914747f2943a1e9a9700e63d46e196434a57cd35a7451756b5')
 ) as expected(signature,raw_sha256,hardened_sha256)
 loop
  function_oid:=to_regprocedure(rpc.signature);
  select p.prosrc,to_jsonb(p)-'prosrc' into raw_body,before_metadata
  from pg_catalog.pg_proc p where p.oid=function_oid;
  if encode(pg_catalog.sha256(pg_catalog.convert_to(raw_body,'UTF8')),'hex')=rpc.hardened_sha256 then
   continue;
  end if;
  if raw_body is null
   or encode(pg_catalog.sha256(pg_catalog.convert_to(raw_body,'UTF8')),'hex')<>rpc.raw_sha256 then
   raise exception 'RPC_CHANGED_DURING_REVIEW_TRANSACTION' using errcode='22023';
  end if;
  expected_new_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(replace(raw_body,old_guard,new_guard),'UTF8')),'hex');
  if expected_new_hash<>rpc.hardened_sha256 then
   raise exception 'REVIEWED_PATCH_HASH_MISMATCH' using errcode='22023';
  end if;
  function_definition:=pg_catalog.pg_get_functiondef(function_oid);
  if (length(function_definition)-length(replace(function_definition,old_guard,'')))/length(old_guard)<>1 then
   raise exception 'EXACT_SINGLE_REVIEWED_RPC_GUARD_NOT_FOUND' using errcode='22023';
  end if;
  execute replace(function_definition,old_guard,new_guard);
  select to_jsonb(p)-'prosrc',p.prosrc into after_metadata,raw_body
  from pg_catalog.pg_proc p where p.oid=function_oid;
  if before_metadata is distinct from after_metadata
   or encode(pg_catalog.sha256(pg_catalog.convert_to(raw_body,'UTF8')),'hex') is distinct from expected_new_hash then
   raise exception 'RPC_METADATA_OR_PATCH_POSTCONDITION_FAILED' using errcode='42501';
  end if;
  if has_function_privilege('anon',function_oid,'EXECUTE')
   or not has_function_privilege('authenticated',function_oid,'EXECUTE')
   or exists(
    select 1 from pg_catalog.pg_proc p,
     lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid=function_oid and a.grantee=0 and a.privilege_type='EXECUTE'
   ) then
   raise exception 'ADMINISTRATIVE_RPC_EXECUTE_PERMISSIONS_NOT_PRESERVED' using errcode='42501';
  end if;
 end loop;

 -- Revoke client writes/DDL; leave SELECT intact. Quote every live column.
 select string_agg(format('%I',attname),',' order by attnum) into all_columns
 from pg_catalog.pg_attribute
 where attrelid=table_oid and attnum>0 and not attisdropped;
 if all_columns is null then
  raise exception 'PROFILE_COLUMNS_CHANGED_REVIEW_REQUIRED' using errcode='22023';
 end if;
 revoke insert,update,delete,truncate,references,trigger on table public.profiles from public,anon,authenticated;
 execute format('revoke insert (%s),update (%s),references (%s) on table public.profiles from public,anon,authenticated',all_columns,all_columns,all_columns);
 -- MAINTAIN exists in PG17+. Keep the keyword inside dynamic SQL for PG15/16.
 if current_setting('server_version_num')::integer>=170000 and exists(
  select 1 from pg_catalog.pg_class c,
   lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
  where c.oid=table_oid and a.privilege_type='MAINTAIN'
   and (case when a.grantee=0 then true else
     pg_has_role(to_regrole('anon')::oid,a.grantee,'USAGE')
     or pg_has_role(to_regrole('authenticated')::oid,a.grantee,'USAGE') end)
 ) then
  execute 'revoke maintain on table public.profiles from public,anon,authenticated';
 end if;
 if has_table_privilege('anon',table_oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege('authenticated',table_oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_any_column_privilege('anon',table_oid,'INSERT,UPDATE,REFERENCES')
  or has_any_column_privilege('authenticated',table_oid,'INSERT,UPDATE,REFERENCES')
  or exists(
   select 1 from pg_catalog.pg_class c,
    lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
   where c.oid=table_oid and a.privilege_type<>'SELECT'
    and (case when a.grantee=0 then true else
     pg_has_role(to_regrole('anon')::oid,a.grantee,'USAGE')
     or pg_has_role(to_regrole('authenticated')::oid,a.grantee,'USAGE') end)
  ) or exists(
   select 1 from pg_catalog.pg_attribute c,
    lateral pg_catalog.aclexplode(c.attacl) a
   where c.attrelid=table_oid and c.attnum>0 and not c.attisdropped
    and a.privilege_type<>'SELECT'
    and (case when a.grantee=0 then true else
     pg_has_role(to_regrole('anon')::oid,a.grantee,'USAGE')
     or pg_has_role(to_regrole('authenticated')::oid,a.grantee,'USAGE') end)
  ) then
  raise exception 'RESIDUAL_CLIENT_PROFILE_WRITE_OR_DDL_REQUIRES_REVIEW' using errcode='42501';
 end if;
 if not has_table_privilege(table_owner,table_oid,'UPDATE')
  or not has_table_privilege(table_owner,table_oid,'INSERT')
  or not has_table_privilege(table_owner,table_oid,'SELECT') then
  raise exception 'TRUSTED_PROFILE_WRITER_PRIVILEGES_NOT_PRESERVED' using errcode='42501';
 end if;
 if owner_capabilities_before is distinct from jsonb_build_object(
   'select',has_table_privilege(table_owner,table_oid,'SELECT'),
   'insert',has_table_privilege(table_owner,table_oid,'INSERT'),
   'update',has_table_privilege(table_owner,table_oid,'UPDATE'),
   'delete',has_table_privilege(table_owner,table_oid,'DELETE'),
   'truncate',has_table_privilege(table_owner,table_oid,'TRUNCATE'),
   'references',has_table_privilege(table_owner,table_oid,'REFERENCES'),
   'trigger',has_table_privilege(table_owner,table_oid,'TRIGGER'),
   'maintain',case when current_setting('server_version_num')::integer>=170000
    then has_table_privilege(table_owner,table_oid,'MAINTAIN') else null end,
   'column_references',has_any_column_privilege(table_owner,table_oid,'REFERENCES')
  ) then
  raise exception 'PROFILE_OWNER_CAPABILITIES_CHANGED' using errcode='42501';
 end if;
 if select_capabilities_before is distinct from jsonb_build_object(
   'anon_table',has_table_privilege('anon',table_oid,'SELECT'),
   'authenticated_table',has_table_privilege('authenticated',table_oid,'SELECT'),
   'anon_any_column',has_any_column_privilege('anon',table_oid,'SELECT'),
   'authenticated_any_column',has_any_column_privilege('authenticated',table_oid,'SELECT')
  ) then
  raise exception 'PROFILE_SELECT_CAPABILITIES_CHANGED' using errcode='42501';
 end if;
end;
$reviewed_hardening$;

commit;

-- Verificación SOLO LECTURA; no muestra personas, cuerpos ni credenciales.
with relation as (
 select oid,relowner,relrowsecurity,relforcerowsecurity
 from pg_catalog.pg_class where oid=to_regclass('public.profiles')
), expected(signature,hardened_sha256) as (values
 ('public.set_access_grant(text,text,text[],boolean)',
  '40034d79cb1e73a2767210e85ea93a5a1ff5174a4bc3aa47f18b9ae495e5a795'),
 ('public.delete_access_grant(text)',
  'bc72554e62fd43914747f2943a1e9a9700e63d46e196434a57cd35a7451756b5')
), routines as (
 select e.signature,p.oid is not null as function_exists,
  coalesce(p.prosecdef,false) as security_definer,
  coalesce(p.proowner=(select relowner from relation),false) as owner_matches_profiles,
  coalesce(encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')=e.hardened_sha256,false)
   as reviewed_hardened_body,
  case when p.oid is null then null else has_function_privilege('anon',p.oid,'EXECUTE') end as anon_effective_execute,
  case when p.oid is null then null else has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_effective_execute,
  case when p.oid is null then null else exists(
   select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   where a.grantee=0 and a.privilege_type='EXECUTE'
  ) end as public_direct_execute
 from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), flags as (
 select
  coalesce((select relrowsecurity and not relforcerowsecurity from relation),false)
   as profile_rls_owner_contract,
  coalesce((select
   not has_table_privilege('anon',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   and not has_any_column_privilege('anon',oid,'INSERT,UPDATE,REFERENCES')
   and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
   and not exists(select 1 from pg_catalog.pg_class c,
    lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid=relation.oid and a.privilege_type<>'SELECT' and (case when a.grantee=0 then true else
     pg_has_role(to_regrole('anon')::oid,a.grantee,'USAGE')
     or pg_has_role(to_regrole('authenticated')::oid,a.grantee,'USAGE') end))
   and not exists(select 1 from pg_catalog.pg_attribute c,
    lateral pg_catalog.aclexplode(c.attacl) a
    where c.attrelid=relation.oid and c.attnum>0 and not c.attisdropped
     and a.privilege_type<>'SELECT' and (case when a.grantee=0 then true else
     pg_has_role(to_regrole('anon')::oid,a.grantee,'USAGE')
     or pg_has_role(to_regrole('authenticated')::oid,a.grantee,'USAGE') end))
   from relation),false) as profile_client_write_and_ddl_blocked,
  coalesce((select has_table_privilege(relowner,oid,'SELECT')
   and has_table_privilege(relowner,oid,'INSERT')
   and has_table_privilege(relowner,oid,'UPDATE') from relation),false)
   as profile_owner_privileges_preserved,
  coalesce((select bool_and(function_exists and security_definer and owner_matches_profiles
   and reviewed_hardened_body and anon_effective_execute=false
   and authenticated_effective_execute=true and public_direct_execute=false)
   from routines),false) as administrative_rpc_contract,
  exists(select 1 from pg_catalog.pg_proc p
   where p.oid=to_regprocedure('private.current_role()') and p.prosecdef
    and p.proowner=(select relowner from relation)
    and encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
     ='087f7943af47baf27eeaf1519d11c88397ec01fba2adfa14175d501f6367f630')
   as reviewed_role_helper_preserved,
  has_schema_privilege('authenticated','public','USAGE') as authenticated_public_schema_usage
)
select jsonb_build_object(
 'verification_read_only',true,
 'checks_passed',f.profile_rls_owner_contract and f.profile_client_write_and_ddl_blocked
  and f.profile_owner_privileges_preserved and f.administrative_rpc_contract
  and f.reviewed_role_helper_preserved and f.authenticated_public_schema_usage,
 'profile_rls_owner_contract',f.profile_rls_owner_contract,
 'profile_client_write_and_ddl_blocked',f.profile_client_write_and_ddl_blocked,
 'profile_owner_privileges_preserved',f.profile_owner_privileges_preserved,
 'administrative_rpc_contract',f.administrative_rpc_contract,
 'reviewed_role_helper_preserved',f.reviewed_role_helper_preserved,
 'authenticated_public_schema_usage',f.authenticated_public_schema_usage,
 'current_profile_select',jsonb_build_object(
  'anon_table',has_table_privilege('anon','public.profiles','SELECT'),
  'authenticated_table',has_table_privilege('authenticated','public.profiles','SELECT'),
  'anon_any_column',has_any_column_privilege('anon','public.profiles','SELECT'),
  'authenticated_any_column',has_any_column_privilege('authenticated','public.profiles','SELECT')
 ),
 'administrative_routines',(select jsonb_agg(to_jsonb(r) order by signature) from routines r)
) as profile_hardening_verification
from flags f;

-- No sanea cambios previos ni certifica todos los permisos del proyecto.
