// Operational history may contain nested copies of an old member record.
// Apply the same identity minimization to every response path for team members.
export function withoutPrivateIdentityFields<T>(value:T):T{
 if(Array.isArray(value))return value.map(withoutPrivateIdentityFields) as T;
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['authUserId','activatedAt'].includes(key)).map(([key,entry])=>[key,['email','actorEmail'].includes(key)?null:withoutPrivateIdentityFields(entry)])) as T;
}
