import type {Project} from './types';

export function flattenProjects(projects:Project[]):Project[]{
 const result:Project[]=[],seen=new Set<string>();
 const visit=(project:Project)=>{if(seen.has(project.id))return;seen.add(project.id);result.push(project);project.children.forEach(visit);};
 projects.forEach(visit);return result;
}

// Keep ancestors as context when a matching record is nested several levels down.
export function filterProjectTree(projects:Project[],matches:(project:Project)=>boolean,keepChildrenOfMatch=true):Project[]{
 return projects.flatMap(project=>{
  const matched=matches(project);
  if(matched&&keepChildrenOfMatch)return [project];
  const children=filterProjectTree(project.children,matches,keepChildrenOfMatch);
  return matched||children.length?[{...project,children}]:[];
 });
}

// The path comes from the canonical tree, including subprojects nested in subprojects.
export function projectPath(projects:Project[],id:string):Project[]{
 const seen=new Set<string>();
 const visit=(nodes:Project[],ancestors:Project[]):Project[]=>{
  for(const project of nodes){
   if(seen.has(project.id))continue;
   seen.add(project.id);
   const path=[...ancestors,project];
   if(project.id===id)return path;
   const found=visit(project.children,path);if(found.length)return found;
  }
  return [];
 };
 return visit(projects,[]);
}

export function projectCatalog(projects:Project[],matchedIds:Set<string>){
 const groups=filterProjectTree(projects,p=>matchedIds.has(p.id));
 // A matching project retains its family; a matching descendant opens its path.
 const ancestors=new Set<string>();
 for(const id of matchedIds)for(const parent of projectPath(projects,id).slice(0,-1))ancestors.add(parent.id);
 return {groups,ancestors};
}
