import type {Row,State} from './model.ts';

export function panelPriority(task:Row,state:State,week:string):boolean{
 return typeof task.panelPriority==='boolean'?task.panelPriority:task.priority==='Alta'||state.data.commitments.some(commitment=>commitment.taskId===task.id&&commitment.weekId===week&&commitment.isPriority&&!['Cumplido','Desestimado'].includes(commitment.outcome));
}
