import {supabase} from './supabase';
export type ManagementRevision={projects_revision:number|string;portfolio_revision:number|string;access_revision:number|string};
export async function fetchManagementRevision():Promise<ManagementRevision>{
 const {data,error}=await supabase.from('du_management_revisions').select('projects_revision,portfolio_revision,access_revision').eq('id',true).single();
 if(error||!data){window.dispatchEvent(new Event('du-management-access-changed'));throw new Error('No se pudo verificar la actualización del tablero.');}return data;
}
