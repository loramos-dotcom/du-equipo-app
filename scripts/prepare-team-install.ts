import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {institutionalState} from '../shared/team.ts';

const roster=JSON.parse(await readFile(new URL('../config/team-authorized.json',import.meta.url),'utf8'));
const schema=await readFile(new URL('../supabase/schemas/du_equipo.sql',import.meta.url),'utf8');
const state=institutionalState('du-equipo',roster.emails,roster.operator,new Date(),roster.initialCoordinator);
const payload=JSON.stringify(state),tag='$du_initial_'+crypto.randomUUID().replaceAll('-','')+'$';
if(payload.includes(tag))throw Error('Delimitador inesperado.');
const sql=`-- DU Equipo: instalación inicial para el proyecto ${roster.infrastructure.supabaseProjectRef}.
-- Cuenta de infraestructura: ${roster.infrastructure.supabaseOwner}.
-- Crea una base vacía con padrón autorizado y carteras. No incluye credenciales ni proyectos ficticios.
-- Ejecutar únicamente en el proyecto indicado. Rechaza una instalación existente y no sobrescribe datos.
begin;
do $guard$ begin
 if to_regclass('public.du_workspaces') is not null or exists(select 1 from pg_namespace where nspname='du_private') then
  raise exception 'DU Equipo ya está instalado o tiene una instalación parcial. No se modificaron datos.';
 end if;
end $guard$;

${schema}

insert into public.du_workspaces(id,revision,payload)
values ('du-equipo',0,${tag}${payload}${tag}::jsonb);
commit;

-- Verificación: deben resultar 9 integrantes, 8 carteras y 0 proyectos y tareas.
select id,revision,
 jsonb_array_length(payload#>'{data,members}') as integrantes,
 jsonb_array_length(payload#>'{data,areas}') as carteras,
 jsonb_array_length(payload#>'{data,projects}') as proyectos,
 jsonb_array_length(payload#>'{data,tasks}') as tareas
from public.du_workspaces where id='du-equipo';
`;
await mkdir(new URL('../deploy/',import.meta.url),{recursive:true});
await writeFile(new URL('../deploy/du-equipo-inicial.sql',import.meta.url),sql);
console.log('Instalación inicial preparada. Revisar deploy/du-equipo-inicial.sql antes de aplicarla.');
