import type {State} from './model.ts';

/** Existing workspaces enable this after their task links have been completed. */
export const taskProjectRequired=(state:State)=>state.settings.requireTaskProject===true;
