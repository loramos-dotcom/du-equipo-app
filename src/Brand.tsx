import escudo from '../public/brand/escudo-ciudad-azul.svg?raw';
import archivo from '../public/fonts/archivo-latin-variable.woff2?inline';

/** Ministry signature: the official shield is always complete, with its clear space. */
export function InstitutionalSignature(){
 return <div className="institutional-signature"><strong>Ministerio de<br/>Educación</strong><span className="signature-divider" aria-hidden="true"/><span className="shield-clearspace"><img src="/brand/escudo-ciudad-azul.svg" width="108" height="51" alt="Buenos Aires Ciudad"/></span></div>;
}

export function AppWordmark(){
 return <span className="app-wordmark"><strong>DU Equipo</strong><small>Delivery Unit · Educación</small></span>;
}

/** A downloaded minute keeps the institutional font and full vector signature offline. */
export function minutesDocument(escapedText:string,version:string,date:string){
 return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Minuta DU Equipo · ${version}</title><style>@font-face{font-family:Archivo;src:url('${archivo}') format('woff2');font-weight:400 800;font-display:swap}*{box-sizing:border-box}body{font:400 15px/1.6 Archivo,Arial,sans-serif;max-width:850px;margin:40px auto;padding:28px;color:#1d3343;background:#fcfcfc;border-top:8px solid #035c80}h1{font-weight:700;font-size:32px;line-height:1.2;margin:0 0 12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:28px 0}small{color:#526575}.signature{display:flex;align-items:center;justify-content:flex-end;gap:20px;border-top:1px solid #d4dce1;padding-top:24px;margin-top:36px}.signature strong{font-size:15px;line-height:1.2}.divider{height:42px;width:1px;background:#1d3343}.shield{padding:15px}.shield svg{display:block;width:119px;height:auto}@media print{body{margin:0;padding:24px;background:white}.signature{break-inside:avoid}}</style></head><body><h1>Minuta · DU Equipo</h1><small>${version} · Exportada ${date}</small><pre>${escapedText}</pre><footer class="signature"><strong>Ministerio de<br>Educación</strong><span class="divider"></span><span class="shield">${escudo}</span></footer></body></html>`;
}
