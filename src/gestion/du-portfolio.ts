import type {Project} from './domain/types';

export function projectFilterAreaKeys(project:Pick<Project,'areaKey'|'areaKeys'>,assignedAreaKeys:string[]=[]):string[]{
 return [...new Set([project.areaKey,...project.areaKeys,...assignedAreaKeys].filter(Boolean))];
}

export type DuPortfolio={
 followedAreaKeys:string[];coordinator:boolean;directProjectIds:string[];
 people:{id:string;name:string}[];
 priorityIds:string[];assignments:Record<string,{memberIds:string[];members:string[];areaKeys:string[];version:number}>;
 canAssign:(projectId:string)=>boolean;onAssign:(projectId:string)=>void;
 onPriority:(projectId:string,selected:boolean)=>Promise<void>;
 areaDetailsKeys?:string[];onAreaDetails?:(areaKey:string)=>void;
};
