// Keep an unresolved request in this tab even if the admin switches panels.
// It may already have committed; never turn a changed payload into a second create.
type Pending={signature:string;requestId:string;body:Record<string,unknown>};
const pending=new Map<string,Pending>();
export class UnresolvedKnowledgeWrite extends Error{}
export function createKnowledgeRetry(scope:string,submit:(action:string,body:Record<string,unknown>)=>Promise<unknown>,uuid=()=>crypto.randomUUID()){
 return async(action:string,body:Record<string,unknown>)=>{
  const key=`${scope}:${action}`,signature=JSON.stringify(body),previous=pending.get(key);
  if(previous&&previous.signature!==signature)throw new UnresolvedKnowledgeWrite('Попередній запит міг бути збережений. Поверніть попередні значення й повторіть його перед створенням іншого матеріалу. Якщо редактор закрито, оновіть список і перевірте журнал перед перезавантаженням сторінки.');
  const request=previous||{signature,requestId:uuid(),body};pending.set(key,request);
  try{const result=await submit(action,{...request.body,requestId:request.requestId});pending.delete(key);return result;}
  catch(error){const status=(error as {status?:number})?.status;if(status&&status>=400&&status<500&&status!==408)pending.delete(key);throw error;}
 };
}
