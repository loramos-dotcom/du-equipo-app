select
 (du_private.before_user_created('{"user":{"email":"persona01@bue.edu.ar"}}'::jsonb) = '{}'::jsonb) as autorizado,
 (du_private.before_user_created('{"user":{"email":"no-autorizado@bue.edu.ar"}}'::jsonb)#>>'{error,http_code}') as rechazo_mismo_dominio,
 not has_table_privilege('anon','public.du_workspaces','select') as anon_sin_datos,
 not has_table_privilege('authenticated','public.du_workspaces','select') as cliente_sin_datos,
 has_function_privilege('supabase_auth_admin','du_private.before_user_created(jsonb)','execute') as hook_habilitado,
 w.revision,
 jsonb_array_length(w.payload#>'{data,members}') as integrantes,
 (select count(*) from jsonb_array_elements(w.payload#>'{data,members}') m where nullif(m->>'authUserId','') is not null) as identidades_vinculadas
from public.du_workspaces w where id='du-equipo';
