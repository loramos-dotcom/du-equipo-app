/** Separate an explicit PDF citation without hiding surrounding working notes. */
export function recordProvenance(value:string){
 const match=/(?:^|\s)(Fuente:\s*[^\n]*?\.pdf(?:,\s*p[aá]gina\s*\d+(?:\s*[-–]\s*\d+)?)?(?:,\s*sin fecha indicada)?\.?)/iu.exec(value);
 if(!match)return {description:value.trim(),source:''};
 const source=match[1],start=match.index+match[0].indexOf(source);
 return {description:(value.slice(0,start)+value.slice(start+source.length)).trim(),source};
}
