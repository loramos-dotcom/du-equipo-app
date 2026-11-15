import {institutionalState} from '../../shared/team.ts';

// These older fixtures test other workflows with their original workspace policy.
// Required-project coverage uses the actual institutionalState factory directly.
export function legacyInstitutionalState(...args:Parameters<typeof institutionalState>){
 const state=institutionalState(...args);state.settings.requireTaskProject=false;return state;
}
