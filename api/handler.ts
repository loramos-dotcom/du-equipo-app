import {runDriveBackup} from '../server/backup-runtime.ts';
import {syncTeamCalendars} from '../server/calendar.ts';
import {teamRequest} from '../server/team.ts';
import {teamConfig} from '../server/auth.ts';
import {supabaseStore} from '../server/supabase-store.ts';
import {dailyJobRequest} from '../server/jobs.ts';
export default {async fetch(request:Request){
 try{const config=teamConfig(process.env),store=supabaseStore({...config,relational:true});if(new URL(request.url).pathname==='/api/jobs/daily')return await dailyJobRequest(request,store,config.workspaceId,process.env.CRON_SECRET,()=>runDriveBackup(store,process.env),()=>syncTeamCalendars(store,process.env));return await teamRequest(request,config,store);}
 catch{return Response.json({error:'Coordinación debe completar la configuración del acceso institucional.'},{status:503,headers:{'cache-control':'no-store'}});}
}};
