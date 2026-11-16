import type {CSSProperties} from 'react';

export const areaPalette={
 gestion_administrativa:{ink:'#1e40af',background:'#dbeafe',border:'#93c5fd',accent:'#2563eb'},
 aprendizaje:{ink:'#166534',background:'#dcfce7',border:'#86efac',accent:'#16a34a'},
 tecnologia:{ink:'#6b21a8',background:'#f3e8ff',border:'#d8b4fe',accent:'#9333ea'},
 planeamiento:{ink:'#9a3412',background:'#ffedd5',border:'#fdba74',accent:'#ea580c'},
 privada:{ink:'#9d174d',background:'#fce7f3',border:'#f9a8d4',accent:'#db2777'},
 agencia:{ink:'#115e59',background:'#ccfbf1',border:'#5eead4',accent:'#0d9488'},
 ueicee:{ink:'#155e75',background:'#cffafe',border:'#67e8f9',accent:'#0891b2'},
 universidad:{ink:'#854d0e',background:'#fef9c3',border:'#fde047',accent:'#ca8a04'},
 comu_prensa:{ink:'#334155',background:'#e2e8f0',border:'#94a3b8',accent:'#64748b'},
 transversales:{ink:'#9f1239',background:'#ffe4e6',border:'#fda4af',accent:'#e11d48'},
} as const;
const aliases:Record<string,string>={
 ssgad:'gestion_administrativa',ssgda:'aprendizaje',
 gestion_del_aprendizaje:'aprendizaje',gestion_de_aprendizajes:'aprendizaje',aprendizajes:'aprendizaje',
 sstedu:'tecnologia',sspie:'planeamiento',
 comunicacion:'comu_prensa',comunicacion_y_prensa:'comu_prensa',comu_y_prensa:'comu_prensa',
};
export function canonicalAreaKey(value:string){
 const normalized=String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/^\d+\s*[.)-]\s*/,'').toLowerCase().replace(/[\s-]+/g,'_');
 return aliases[normalized]??normalized;
}
export function areaColors(area:string){
 const key=canonicalAreaKey(area),known=areaPalette[key as keyof typeof areaPalette];
 if(known)return known;
 let hash=0;for(const char of key)hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
 const hue=hash%360;
 return {ink:'hsl('+hue+' 60% 25%)',background:'hsl('+hue+' 65% 94%)',border:'hsl('+hue+' 45% 75%)',accent:'hsl('+hue+' 60% 40%)'};
}
export function areaTheme(area:string){
 const key=canonicalAreaKey(area);if(!key)return {};
 const c=areaColors(key);
 return {'data-area':key,style:{'--area-ink':c.ink,'--area-bg':c.background,'--area-border':c.border,'--area-accent':c.accent} as CSSProperties};
}
