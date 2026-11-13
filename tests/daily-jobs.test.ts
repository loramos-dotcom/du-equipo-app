import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../shared/seed.ts';
import {execute} from '../shared/domain.ts';
import {dailyJobRequest,runDailyJobs} from '../server/jobs.ts';
import type {State} from '../shared/model.ts';
const now=new Date('2026-10-21T13:00:00Z');
function fixture(){let state=seed(now);state.data.recurrences.push({id:'routine',version:1,title:'Reporte DU',ownerId:'persona05',frequency:'Semanal',weekday:3,startsOn:'2026-09-01',active:true,generationCursor:'2026-10-04'});const store={load:async()=>structuredClone(state),create:async()=>{},save:async(_key:string,revision:number,next:State)=>{if(revision!==state.revision)return false;state=structuredClone(next);return true;}};return {store,state:()=>state};}
test('El proceso diario no exige una sesión de una persona ni permite imitar su identidad',async()=>{
 const f=fixture();assert.throws(()=>execute(f.state(),'system:daily',{id:'forged',kind:'generate_occurrences'},now),/acceso no está activo/);
 const run=await runDailyJobs(f.store,'test',now);assert.equal(run.job?.status,'Completado');assert.ok(f.state().audit.some(e=>e.actorId==='system:daily'&&e.source==='proceso automático'));assert.ok(!f.state().data.members.some(m=>m.id==='system:daily'));
 assert.equal(f.state().data.tasks.filter(t=>t.recurrenceId==='routine').length,2);assert.equal(f.state().data.commitments.length,7);
});
test('El reintento y dos ejecuciones simultáneas no duplican tareas, avisos ni la ejecución',async()=>{
 const f=fixture();await Promise.all([runDailyJobs(f.store,'test',now),runDailyJobs(f.store,'test',now)]);const before=structuredClone(f.state());const again=await runDailyJobs(f.store,'test',now);assert.equal(again.reused,true);assert.deepEqual(f.state(),before);assert.equal(f.state().data.jobRuns.length,1);
});
test('Las ocurrencias antiguas se muestran y solo se generan o descartan por decisión explícita',async()=>{
 const f=fixture();await runDailyJobs(f.store,'test',now);let s=f.state();const routine=s.data.recurrences[0];assert.deepEqual(routine.pendingDates,['2026-10-07','2026-10-14']);
 const result=execute(s,'persona05',{id:'recover-one',kind:'recover_occurrences',expectedVersion:routine.version,data:{recurrenceId:routine.id,dates:['2026-10-07'],action:'generate',reason:'Recuperar la entrega pendiente'}},now);s=result.state;assert.equal(result.result.created,1);assert.equal(s.data.tasks.filter(t=>t.occurrenceDate==='2026-10-07').length,1);assert.deepEqual(s.data.recurrences[0].pendingDates,['2026-10-14']);
 s=execute(s,'persona05',{id:'discard-one',kind:'recover_occurrences',expectedVersion:s.data.recurrences[0].version,data:{recurrenceId:routine.id,dates:['2026-10-14'],action:'discard',reason:'La entrega dejó de corresponder'}},now).state;assert.deepEqual(s.data.recurrences[0].pendingDates,[]);assert.ok(s.data.recurrences[0].dismissedDates.includes('2026-10-14'));
});
test('El endpoint diario rechaza ausencia de secreto, User-Agent falso y llamadas sin autorización',async()=>{
 const f=fixture();for(const headers of [{},{'user-agent':'vercel-cron/1.0'},{authorization:'Bearer wrong'}])assert.equal((await dailyJobRequest(new Request('https://du.example/api/jobs/daily',{headers:headers as Record<string,string>}),f.store,'test','test-secret')).status,401);
 assert.equal((await dailyJobRequest(new Request('https://du.example/api/jobs/daily'),f.store,'test',undefined)).status,503);assert.equal(f.state().data.jobRuns.length,0);
});
