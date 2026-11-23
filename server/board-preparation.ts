import {boardAreaId,boardPreparationProject} from '../shared/board-followups.ts';
import type {CalendarChoice} from '../shared/calendar.ts';
import {execute} from '../shared/domain.ts';
import type {CalendarConnection,CalendarStore} from './calendar.ts';

export function primaryCalendar(choice:CalendarChoice,email:string){
 return choice.primary||choice.id.toLowerCase()===email.toLowerCase()||choice.id==='primary';
}

export function primaryBoardEvents(connection:CalendarConnection){
 if(!connection.selected.some(choice=>primaryCalendar(choice,connection.email)))return [];
 return connection.events.filter(event=>(event.primaryCalendar??connection.selected.length===1)&&boardAreaId(event.title));
}

export async function reconcileBoardPreparation(store:CalendarStore,workspace:string,now=new Date()){
 for(let attempt=0;attempt<3;attempt++){
  const state=await store.load(workspace,{history:false,receiptIds:[]});
  if(!state)throw Error('board-preparation-workspace');
  const project=boardPreparationProject(state.data.projects);
  if(!project)return;
  const member=state.data.members.find(row=>row.id===(project.createdBy??project.leadId)&&row.active&&row.role==='Coordinación');
  if(!member)return;
  const calendar=await store.readCalendar(workspace,member.id);
  if(!calendar||calendar.email.toLowerCase()!==member.email?.toLowerCase()||calendar.syncError||!calendar.syncedAt)return;
  const age=now.getTime()-Date.parse(calendar.syncedAt);
  if(!Number.isFinite(age)||age>15*60*1000)return;
  const events=primaryBoardEvents(calendar);
  if(!events.length)return;
  const {state:next,result}=execute(state,'system:daily',{id:crypto.randomUUID(),kind:'sync_board_preparation'},now,
   {jobId:'calendar-boards',boardEvents:events,boardProjectId:project.id});
  if(!result.created&&!result.updated)return result;
  if((await store.readCalendar(workspace,member.id))?.revision!==calendar.revision)continue;
  if(await store.save(workspace,state.revision,next))return result;
 }
 throw Error('board-preparation-concurrent-conflict');
}
