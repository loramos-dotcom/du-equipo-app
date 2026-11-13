-- DU Equipo: instalación inicial para el proyecto project-ref.
-- Cuenta de infraestructura: persona05@bue.edu.ar.
-- Crea una base vacía con padrón autorizado y carteras. No incluye credenciales ni proyectos ficticios.
-- Ejecutar únicamente en el proyecto indicado. Rechaza una instalación existente y no sobrescribe datos.
begin;
do $guard$ begin
 if to_regclass('public.du_workspaces') is not null or exists(select 1 from pg_namespace where nspname='du_private') then
  raise exception 'DU Equipo ya está instalado o tiene una instalación parcial. No se modificaron datos.';
 end if;
end $guard$;

-- Declarative schema. Generate/review a migration against an isolated approved project before applying.
-- The browser talks only to the application API; no business data is exposed through the Data API.
create table public.du_workspaces (
 id text primary key,
 revision bigint not null check (revision >= 0),
 payload jsonb not null,
 constraint du_state_shape check (
  jsonb_typeof(payload) = 'object'
  and coalesce(payload->>'workspaceId' = id, false)
  and coalesce(payload->>'accessMode' = 'institutional', false)
  and coalesce((payload->>'revision')::bigint = revision, false)
  and coalesce(jsonb_typeof(payload#>'{data,members}') = 'array', false)
 )
);
alter table public.du_workspaces enable row level security;
alter table public.du_workspaces force row level security;
revoke all on public.du_workspaces from public, anon, authenticated;
grant select, insert, update on public.du_workspaces to service_role;
-- Only the Auth hook can inspect the allowlist. It cannot write application data.
grant select on public.du_workspaces to supabase_auth_admin;
create policy du_auth_allowlist_read on public.du_workspaces for select to supabase_auth_admin using (true);

create schema du_private;
revoke all on schema du_private from public, anon, authenticated;
grant usage on schema du_private to supabase_auth_admin;
create function du_private.before_user_created(event jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
 if not exists (
  select 1 from public.du_workspaces w,
  lateral jsonb_array_elements(w.payload#>'{data,members}') m
  where m->>'email' = lower(btrim(event#>>'{user,email}')) and m->>'active' = 'true'
 ) then
  return jsonb_build_object('error',jsonb_build_object('message','Cuenta no autorizada. Consultá con Coordinación.','http_code',403));
 end if;
 return '{}'::jsonb;
end;
$$;
revoke all on function du_private.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function du_private.before_user_created(jsonb) to supabase_auth_admin;


insert into public.du_workspaces(id,revision,payload)
values ('du-equipo',0,$du_initial_fe6dd965a11a4088991ab649f3193480${"revision":0,"schemaVersion":1,"workspaceId":"du-equipo","data":{"members":[{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona01","name":"Persona 01","functionTitle":"Coordinador","responsibilities":"Coordinación general de la DU.","role":"Coordinación","active":true,"email":"persona01@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona02","name":"Persona 02","functionTitle":"Co-coordinadora","responsibilities":"Co-coordinación del equipo.","role":"Coordinación","active":true,"email":"persona02@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona03","name":"Persona 03","functionTitle":"Seguimiento de áreas","responsibilities":"SSGAD y Agencia.","role":"Integrante","active":true,"email":"persona03@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona04","name":"Persona 04","functionTitle":"Seguimiento y Plan BAA","responsibilities":"SSPIE y Plan BAA.","role":"Integrante","active":true,"email":"persona04@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona05","name":"Persona 05","functionTitle":"Seguimiento y reportes","responsibilities":"Universidad y preparación de reportes semanales.","role":"Integrante","active":true,"email":"persona05@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona06","name":"Persona 06","functionTitle":"Seguimiento de áreas","responsibilities":"SSTEDU y UEICEE.","role":"Integrante","active":true,"email":"persona06@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona07","name":"Persona 07","functionTitle":"Seguimiento de áreas","responsibilities":"SSGDA y Privada.","role":"Integrante","active":true,"email":"persona07@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":null,"authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona08","name":"Persona 08","functionTitle":"Reclamos","responsibilities":"Seguimiento de Reclamos.","role":"Integrante","active":true,"email":"persona08@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":"Reclamos","authUserId":null},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"persona09","name":"Persona 09","functionTitle":"Reclamos","responsibilities":"Seguimiento de Reclamos.","role":"Integrante","active":true,"email":"persona09@bue.edu.ar","setupStatus":"Autorizado; pendiente de primer acceso","reportsTo":null,"group":"Reclamos","authUserId":null}],"areas":[{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"ssgad","name":"SSGAD","acronym":"SSGAD","leadId":"persona03","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"agencia","name":"Agencia","acronym":"Agencia","leadId":"persona03","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"sspie","name":"SSPIE","acronym":"SSPIE","leadId":"persona04","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"universidad","name":"Universidad","acronym":"Universidad","leadId":"persona05","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"sstedu","name":"SSTEDU","acronym":"SSTEDU","leadId":"persona06","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"ueicee","name":"UEICEE","acronym":"UEICEE","leadId":"persona06","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"ssgda","name":"SSGDA","acronym":"SSGDA","leadId":"persona07","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"privada","name":"Privada","acronym":"Privada","leadId":"persona07","substitutes":[],"parentId":null,"active":true,"contact":"Responsable institucional por confirmar","documents":[]}],"projects":[],"milestones":[],"tasks":[],"weeks":[],"plans":[],"commitments":[],"issues":[],"interventions":[],"meetings":[],"agenda":[],"decisions":[],"recurrences":[],"comments":[],"links":[],"catalogs":[{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"tag-seguimiento","type":"Etiqueta","name":"Seguimiento","active":true},{"version":1,"createdAt":"2026-11-13T13:16:53.065Z","updatedAt":"2026-11-13T13:16:53.065Z","updatedBy":"system","id":"reason-externa","type":"Motivo","name":"Dependencia externa","active":true}],"filters":[],"notifications":[],"projectLinks":[],"areaContacts":[],"areaAssignments":[],"preferences":[],"jobRuns":[],"pilotRuns":[]},"audit":[{"id":"1b2d2a29-4690-4bd6-aad8-3c2c58d27494","at":"2026-11-13T13:16:53.065Z","actorId":"persona05","actorName":"Persona 05","actorEmail":"persona05@bue.edu.ar","entity":"members","entityId":"persona01","action":"configuración inicial","before":null,"after":null,"fields":["email","role","active"],"reason":"Padrón autorizado expresamente por la administradora solicitante. Coordinación inicial: persona01@bue.edu.ar","operationId":"32bb1b00-994f-433b-b161-7e3fea7d2e2e","source":"bootstrap administrativo"}],"snapshots":[],"receipts":{},"settings":{"staleDays":7,"dueDays":3,"priorityLimit":3,"timezone":"America/Argentina/Buenos_Aires"},"accessMode":"institutional"}$du_initial_fe6dd965a11a4088991ab649f3193480$::jsonb);
commit;

-- Verificación: deben resultar 9 integrantes, 8 carteras y 0 proyectos y tareas.
select id,revision,
 jsonb_array_length(payload#>'{data,members}') as integrantes,
 jsonb_array_length(payload#>'{data,areas}') as carteras,
 jsonb_array_length(payload#>'{data,projects}') as proyectos,
 jsonb_array_length(payload#>'{data,tasks}') as tareas
from public.du_workspaces where id='du-equipo';
