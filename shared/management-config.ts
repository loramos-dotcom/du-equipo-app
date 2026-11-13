// Public project identifiers only. No administrative credential is used by this integration.
export const managementUrl='https://fkboxwavttkrkfqbtrwc.supabase.co';
export const managementPublishableKey="sb_publishable_1sYsh0_BqIxc3tVy6k8UKQ_ARZl1_qe";
export const managementSite='https://tablero-prioritarios-rosy-theta-53.vercel.app/';
export const managementReturnPaths={home:'/#Inicio',projects:'/#Proyectos',management:'/#Gesti%C3%B3n',tasks:'/#Tareas',issues:'/#Incidencias'} as const;
export type ManagementPage=keyof typeof managementReturnPaths;
