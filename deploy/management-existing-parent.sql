-- Preserve the current hierarchy when editing an existing project bundle.
-- New parent assignments still pass the board's original validation.
do $patch$
declare
  definition text;
  original_acl aclitem[];
  old_guard constant text := 'if v_parent_project_id is not null then';
  new_guard constant text := 'if v_parent_project_id is not null and not exists (
    -- DU: unchanged parent relationship
    select 1 from public.projects as existing_project
    where existing_project.id = v_project_id
      and existing_project.parent_id = v_parent_project_id
      and existing_project.primary_area_id = v_area_id
  ) then';
begin
  select pg_catalog.pg_get_functiondef(p.oid), p.proacl
    into strict definition, original_acl
    from pg_catalog.pg_proc p
    where p.oid = 'public.save_project_bundle(jsonb)'::regprocedure;
  if position('DU: unchanged parent relationship' in definition) > 0 then return; end if;
  if (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard) <> 1 then
    raise exception 'El guardado canónico cambió; la corrección requiere una nueva revisión.';
  end if;
  execute replace(definition,old_guard,new_guard);
  if (select p.proacl is distinct from original_acl from pg_catalog.pg_proc p
      where p.oid = 'public.save_project_bundle(jsonb)'::regprocedure) then
    raise exception 'La corrección no debe modificar los permisos de la función.';
  end if;
end;
$patch$;
