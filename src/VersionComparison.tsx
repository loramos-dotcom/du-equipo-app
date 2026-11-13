import {useState} from 'react';
import type {Snapshot} from '../shared/model';
import {compareVersions,versionPath} from '../shared/versions';
export default function VersionComparison({snapshots,label}:{snapshots:Snapshot[];label:string}){
 const versions=[...snapshots].sort((a,b)=>a.version-b.version),[left,setLeft]=useState(versions.at(-2)?.version??0),[right,setRight]=useState(versions.at(-1)?.version??0);
 if(versions.length<2)return null;
 const before=versions.find(v=>v.version===(left||versions.at(-2)!.version)),after=versions.find(v=>v.version===(right||versions.at(-1)!.version));
 const rows=compareVersions(before?.payload,after?.payload),text=(value:unknown)=>value===undefined?'No existía':typeof value==='object'?JSON.stringify(value,null,2):String(value);
 return <details className="panel version-comparison"><summary>Comparar versiones de {label}</summary><div className="button-row"><label>Versión anterior <select aria-label={'Versión anterior de '+label} value={before?.version} onChange={e=>setLeft(Number(e.target.value))}>{versions.map(v=><option key={v.id} value={v.version}>Versión {v.version}</option>)}</select></label><label>Versión posterior <select aria-label={'Versión posterior de '+label} value={after?.version} onChange={e=>setRight(Number(e.target.value))}>{versions.map(v=><option key={v.id} value={v.version}>Versión {v.version}</option>)}</select></label></div>{rows.length?<div className="table-wrap"><table><thead><tr><th>Dato</th><th>Versión {before?.version}</th><th>Versión {after?.version}</th></tr></thead><tbody>{rows.map(row=><tr key={row.path}><th>{versionPath(row.path,before?.payload,after?.payload)}</th><td><pre>{text(row.before)}</pre></td><td><pre>{text(row.after)}</pre></td></tr>)}</tbody></table></div>:<p>No hay diferencias de contenido.</p>}</details>;
}
