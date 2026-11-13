import { DurableObject } from 'cloudflare:workers';
import { parseProject, parseProductionPlan } from '../../app/src/lib/project';
export interface Env { HANDOFFS: DurableObjectNamespace }
const MAX=512000,TTL=24*60*60*1000;
export const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function body(req:Request){const raw=await req.text();if(new TextEncoder().encode(raw).length>MAX)throw new Error('交接文字超过500KB。');return JSON.parse(raw);}
export async function route(env:Env,key:string,action:string,data?:unknown){
 if(!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(key))return Response.json({error:'交接入口无效。'},{status:401});
 const [id,token]=key.split('.');return env.HANDOFFS.get(env.HANDOFFS.idFromName(id)).fetch(new Request('https://handoff/'+action,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(data??{})}));
}
interface Session { owner:string;agent:string;expires:number;revision:number;project:ReturnType<typeof parseProject>;plan?:unknown }
export class HandoffSession extends DurableObject<Env>{
 async alarm(){await this.ctx.storage.deleteAll();}
 async fetch(req:Request){try{
  const action=new URL(req.url).pathname.slice(1),input=await body(req);
  if(action==='create'){
   if(await this.ctx.storage.get('session'))throw new Error('交接已存在。');
   const project=parseProject(JSON.stringify(input.project));
   if(!project.scriptText?.trim()||project.draftText!==project.scriptText)throw new Error('请先保存终稿。');
   const session:Session={owner:await digest(input.owner),agent:await digest(input.agent),expires:Date.now()+TTL,revision:0,project};
   await this.ctx.storage.put('session',session);await this.ctx.storage.setAlarm(session.expires);
   return Response.json({expires:session.expires,revision:0});
  }
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')??'',hash=await digest(token);
  return await this.ctx.storage.transaction(async storage=>{
   const s=await storage.get<Session>('session');
   if(!s||s.expires<=Date.now()||(hash!==s.owner&&hash!==s.agent))return Response.json({error:'交接已失效，请在项目中重新交接。'},{status:401});
   if(action==='revoke'){
    if(hash!==s.owner)return Response.json({error:'只有项目持有人可以结束交接。'},{status:403});
    await storage.delete('session');return Response.json({revoked:true});
   }
   if(action==='read')return Response.json({revision:s.revision,expires:s.expires,project:s.project,plan:hash===s.owner?s.plan:undefined,guide:'https://icandoitccc-jpg.github.io/chenstricks-motion/motion-agent-guide.md',scope:'仅当前项目文字和素材清单；不含媒体文件。'});
   if(action==='submit'){
    if(input.expectedRevision!==s.revision)return Response.json({error:'交接版本已变化，请重新读取项目。'},{status:409});
    parseProductionPlan(JSON.stringify(input.plan),s.project);
    s.plan=input.plan;s.revision++;await storage.put('session',s);
    return Response.json({accepted:true,revision:s.revision,scope:'总表通过程序校验，等待用户在Motion查看并采用；未渲染、未对齐。'});
   }
   return Response.json({error:'未知操作。'},{status:404});
  });
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}}
}
export async function createHandoff(req:Request,env:Env){const input=await body(req),id=secret(),owner=secret(),agent=secret();const res=await env.HANDOFFS.get(env.HANDOFFS.idFromName(id)).fetch(new Request('https://handoff/create',{method:'POST',body:JSON.stringify({project:input.project,owner,agent})}));if(!res.ok)return res;return Response.json({...await res.json() as object,ownerKey:id+'.'+owner,accessKey:id+'.'+agent});}
