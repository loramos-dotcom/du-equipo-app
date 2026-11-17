import {createContext,useContext,useMemo} from 'react';
import type {ReactNode} from 'react';
import {avatarInitials} from './gestion/lib/avatarInitials';
import {personColors,personThemes} from './person-colors';
import type {Person} from './person-colors';
import './avatar.css';

const PeopleContext=createContext<{members:Person[];themes:ReturnType<typeof personThemes>}>({members:[],themes:new Map()});
export function AvatarProvider({members,children}:{members:Person[];children:ReactNode}){
 const value=useMemo(()=>({members,themes:personThemes(members)}),[members]);
 return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}
export default function Avatar({member,name,small=false,className=''}:{member?:Person;name?:string;small?:boolean;className?:string}){
 const {members,themes}=useContext(PeopleContext),person=members.find(person=>member?.id?person.id===member.id:person.name===(name??member?.name))??member??{name},label=person.name||'Sin asignar';
 return <span className={'avatar person-avatar '+(small?'small ':'')+className} style={personColors(person,themes)} title={label} role="img" aria-label={label} data-person={person.id||person.name||undefined}>{person.name?avatarInitials(person.name):'—'}</span>;
}

export function AvatarGroup({names,label='Referentes DU'}:{names:(string|undefined)[];label?:string}){
 const people=[...new Set(names.filter((name):name is string=>!!name))];
 return people.length?<span className="person-avatar-group" role="list" aria-label={label}>{people.map(name=><span role="listitem" key={name}><Avatar name={name} small/></span>)}</span>:<span className="muted-text">Sin asignar</span>;
}
