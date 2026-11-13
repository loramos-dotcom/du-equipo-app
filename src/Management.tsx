import type {DuPortfolio}from'./gestion/du-portfolio';
import {Component,useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import type {Session,User} from '@supabase/supabase-js';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AlertTriangle,RefreshCw} from 'lucide-react';
import Dashboard from './gestion/App';
import {managementSession} from './gestion/lib/management-session';
import {automaticManagementAccess,managementAccessReady} from './management-access';
import './gestion/management.css';
import './gestion/embedded.css';
import './gestion/du-projects.css';

class ManagementBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="empty"><AlertTriangle/><h2>No se pudo abrir esta vista del tablero</h2><p>Tus datos siguen guardados. Recargá para volver a consultar.</p><button className="btn" onClick={()=>location.reload()}>Recargar</button></div>:this.props.children;}
}
export default function Management({expectedEmail,initialArea='all_projects',projectId='',onDuTracking,initialView,onViewChange,duPortfolio}:{expectedEmail?:string;initialArea?:string;projectId?:string;onDuTracking?:(id:string)=>void;initialView?:any;onViewChange?:(view:any)=>void;duPortfolio?:DuPortfolio}){
 const [user,setUser]=useState<User|null|undefined>(undefined),[error,setError]=useState('');
 const client=useMemo(()=>new QueryClient({defaultOptions:{queries:{staleTime:10000,retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}}),[]);
 useEffect(()=>{
  let stopped=false,busy=false;
  let initial=true;
  async function check(){if(busy)return;busy=true;try{const result=await managementSession();if(stopped)return;if(result.connected&&result.user&&(!expectedEmail||result.user.email?.toLowerCase()===expectedEmail.toLowerCase())){managementAccessReady();setUser(result.user);setError('');}else{setUser(null);client.clear();if(initial&&!result.connected&&automaticManagementAccess())setError('');else setError(result.connected?'Ingresá con la misma cuenta institucional que usás en DU Equipo.':'No se pudo completar el ingreso al tablero. Volvé a ingresar con Google.');}}catch(e){if(!stopped){setUser(null);client.clear();setError((e as Error).message);}}finally{busy=false;initial=false;}}
  function disconnected(){setUser(null);client.clear();}
  const visible=()=>{if(document.visibilityState==='visible')void check();};
  void check();const timer=setInterval(visible,30000);window.addEventListener('focus',visible);window.addEventListener('du-management-access-changed',visible);window.addEventListener('du-management-disconnected',disconnected);
  document.body.classList.add('management-print');
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',visible);window.removeEventListener('du-management-access-changed',visible);window.removeEventListener('du-management-disconnected',disconnected);document.body.classList.remove('management-print');client.clear();};
 },[client,expectedEmail]);
 const pendingHeader=<><div className="page-heading"><div><span className="eyebrow">RESULTADOS Y PRÓXIMOS PASOS</span><h1>Proyectos y líneas<span>.</span></h1><p>Resultados esperados, participantes y próximos pasos de cada proyecto.</p></div></div></>;
 if(user===undefined||!user&&!error)return <section>{pendingHeader}<div className="empty" role="status"><RefreshCw className="spin"/><h2>Cargando proyectos</h2><p>El ingreso institucional se completa automáticamente.</p></div></section>;
 if(!user)return <section>{pendingHeader}<div className="panel management-connect"><div className="section-title"><AlertTriangle size={24}/><h2>No pudimos cargar los proyectos</h2></div><p role="alert" className="notice">{error}</p><a className="btn primary" href="/auth/login">Volver a ingresar con Google</a></div></section>;
 return <div aria-label="Proyectos compartidos con el Tablero de Gestión"><QueryClientProvider client={client}><ManagementBoundary><Dashboard duPortfolio={duPortfolio} session={{user} as Session} initialArea={initialArea} projectId={projectId} onDuTracking={onDuTracking} initialView={initialView} onViewChange={onViewChange}/></ManagementBoundary></QueryClientProvider></div>;
}
