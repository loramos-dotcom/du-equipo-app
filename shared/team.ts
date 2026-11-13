import {seed} from './seed.ts';
import type {State,Row} from './model.ts';
import {DomainError} from './domain.ts';

export type VerifiedIdentity={id:string;email:string;provider:'google';verified:true};
export type MembershipState=Pick<State,'accessMode'>&{data:{members:Row[]}};
export const normalizeEmail=(email:string)=>email.trim().toLowerCase();
export function institutionalState(workspaceId:string,emails:Record<string,string>,operator:string,now=new Date(),initialCoordinator=operator):State{
 const s=seed(now);s.workspaceId=workspaceId;s.accessMode='institutional';
 for(const key of Object.keys(s.data) as (keyof State['data'])[])if(!['members','areas','catalogs'].includes(key))s.data[key]=[];
 const seen=new Set<string>();
 for(const id of Object.keys(emails))if(!s.data.members.some(m=>m.id===id))throw new Error('Integrante desconocido: '+id);
 for(const m of s.data.members){
  const email=emails[m.id]?normalizeEmail(emails[m.id]):null;
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||seen.has(email)))throw new Error('Correo inválido o duplicado.');
  if(email)seen.add(email);
  Object.assign(m,{email,active:!!email,authUserId:null,setupStatus:email?'Autorizado; pendiente de primer acceso':'Pendiente de correo autorizado'});
 }
 const admin=s.data.members.find(m=>m.active&&m.role==='Coordinación'&&m.email===normalizeEmail(initialCoordinator));
 if(!admin)throw new Error('El alta inicial exige el correo explícito de Coordinación.');
 const operatorMember=s.data.members.find(m=>m.email===normalizeEmail(operator));
 s.audit.push({id:crypto.randomUUID(),at:now.toISOString(),actorId:operatorMember?.id??'bootstrap',actorName:operatorMember?.name??'Administración de infraestructura',actorEmail:normalizeEmail(operator),entity:'members',entityId:admin.id,action:'configuración inicial',before:null,after:null,fields:['email','role','active'],reason:'Padrón autorizado expresamente por la administradora solicitante. Coordinación inicial: '+admin.email,operationId:crypto.randomUUID(),source:'bootstrap administrativo'});
 return s;
}

// The caller must obtain this identity from Supabase getUser(), never request JSON or headers.
export function authorizedMember(s:MembershipState,identity:VerifiedIdentity){
 if(s.accessMode!=='institutional')throw new DomainError('El espacio institucional no está configurado.',503);
 if(!identity?.id||identity.verified!==true||identity.provider!=='google')throw new DomainError('Ingresá con tu cuenta institucional de Google.',401);
 const email=normalizeEmail(identity.email??'');
 const m=s.data.members.find(m=>m.email===email&&m.active===true);
 if(!m||m.authUserId&&m.authUserId!==identity.id||s.data.members.some(other=>other.id!==m.id&&other.authUserId===identity.id))throw new DomainError('Tu cuenta no tiene acceso activo. Consultá con Coordinación.',403);
 return m;
}
