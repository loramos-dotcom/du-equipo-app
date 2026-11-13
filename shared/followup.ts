import type {Row} from './model.ts';

export const closedIssue=(issue:Row|undefined)=>!!issue&&['Resuelta','Descartada'].includes(issue.status);

// Closing the issue ends its operational follow-up without inventing a
// resolution by Coordination or rewriting the request's recorded history.
export function interventionStatus(request:Row,issues:Row[]):string{
 return request.status!=='Resuelta'&&closedIssue(issues.find(i=>i.id===request.issueId))?'Incidencia cerrada':request.status;
}

export function pendingInterventions(requests:Row[],issues:Row[]):Row[]{
 return requests.filter(r=>!r.deletedAt&&!r.archived&&r.status!=='Resuelta'&&issues.some(i=>i.id===r.issueId&&!i.deletedAt&&!i.archived&&!closedIssue(i)));
}
