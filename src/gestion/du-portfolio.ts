import type {Project} from './domain/types';

export function projectFilterAreaKeys(project:Pick<Project,'areaKey'|'areaKeys'>,assignedAreaKeys:string[]=[]):string[]{
 return [...new Set([project.areaKey,...project.areaKeys,...assignedAreaKeys].filter(Boolean))];
}

export function isMyPortfolioProject(project:Project,portfolio?:DuPortfolio):boolean{
 return !!portfolio&&(portfolio.directProjectIds.includes(project.id)||projectFilterAreaKeys(project,portfolio.assignments[project.id]?.areaKeys).some(key=>portfolio.followedAreaKeys.includes(key)));
}

export function priorityFirstProjects(projects:Project[]):Project[]{
 const hasPriority=(project:Project):boolean=>project.favorite||project.children.some(hasPriority);
 return projects.map((project,index)=>({project,index,priority:hasPriority(project)})).sort((a,b)=>Number(b.priority)-Number(a.priority)||a.index-b.index).map(row=>row.project);
}

export const projectAreaLabels:Record<string,string>={gestion_administrativa:'SSGAD',aprendizaje:'SSGDA',tecnologia:'SSTEDU',planeamiento:'SSPIE',privada:'Privada',agencia:'Agencia',ueicee:'UEICEE',universidad:'Universidad',comu_prensa:'Comunicación',transversales:'Transversales'};

export type DuPortfolio={
 localProjects?:Project[];onOpenLocal?:(id:string)=>void;onCreateLocal?:()=>void;
 followedAreaKeys:string[];coordinator:boolean;directProjectIds:string[];
 people:{id:string;name:string}[];
 priorityIds:string[];assignments:Record<string,{memberIds:string[];members:string[];areaKeys:string[];version:number;leadName?:string}>;
 canAssign:(projectId:string)=>boolean;onAssign:(projectId:string)=>void;
 onPriority:(projectId:string,selected:boolean)=>Promise<void>;
 areaDetailsKeys?:string[];onAreaDetails?:(areaKey:string)=>void;
};
