import type {HTMLAttributes} from 'react';
import {areaTheme,canonicalAreaKey} from './area-colors';
import './area-colors.css';

export type AreaReference=string|{key?:string;id?:string;name?:string};
type Props=HTMLAttributes<HTMLSpanElement>&{area:string;label?:string};
export function AreaBadge({area,label,className='',style,...props}:Props){
 const theme=areaTheme(area);
 return <span {...props} {...theme} className={'area-chip '+className} style={{...theme.style,...style}}>{label??area}</span>;
}
export function AreaTags({areas,className='',...props}:HTMLAttributes<HTMLSpanElement>&{areas:AreaReference[]}){
 const unique=new Map<string,{area:string;label:string}>();
 for(const item of areas){
  const area=typeof item==='string'?item:item.key??item.id??item.name??'',label=typeof item==='string'?item:item.name??area;
  const key=canonicalAreaKey(area);
  if(key&&!unique.has(key))unique.set(key,{area,label});
 }
 return <span {...props} className={'area-tags '+className}>{[...unique].map(([key,item])=><AreaBadge key={key} area={item.area} label={item.label}/>)}</span>;
}
