import {privateArtifact} from './private-artifact';
import { createHandoff, route, body, type Env } from './handoff';
export { HandoffSession } from './handoff';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';

const BASE='https://icandoitccc-jpg.github.io/chenstricks-motion/';
const ENDPOINT='https://motion-guides.chens-tricks.workers.dev/mcp';
const READ_ORIGINS=['https://icandoitccc-jpg.github.io','https://chatgpt.com','https://chat.openai.com','https://motion-guides.chens-tricks.workers.dev'];
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
interface Guide {id:string;title:string;version:string;kind:string;summary:string;path:string}
let catalogCache:{until:number;guides:Guide[]}|undefined;
async function catalog():Promise<Guide[]> {
  if(catalogCache&&Date.now()<catalogCache.until)return catalogCache.guides;
  const r=await fetch(BASE+'guides.json',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Motion规范目录暂时不可用，请稍后重试。');
  const data=await r.json() as {guides:Guide[]};
  if(!Array.isArray(data.guides)||data.guides.length>50)throw new Error('规范目录格式无效。');
  for(const g of data.guides){const url=new URL(g.path,BASE);if(!/^[a-z0-9-]{1,80}$/.test(g.id)||url.origin!==new URL(BASE).origin||!url.pathname.startsWith('/chenstricks-motion/')||!url.pathname.endsWith('.md'))throw new Error('规范目录含无效资源。');}
  catalogCache={until:Date.now()+60000,guides:data.guides};return data.guides;
}
async function read(id:string) {
  const g=(await catalog()).find(g=>g.id===id);if(!g)throw new Error('没有这份制作规范，请先调用list_guides查看目录。');
  const url=new URL(g.path,BASE).href,r=await fetch(url,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('制作规范正文暂时不可用。');
  const text=await r.text();if(text.length<50||text.length>128000||/^\s*</.test(text))throw new Error('规范正文格式无效。');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  return {...g,url,sha256,text};
}
function createServer(env:Env){
  const s=new McpServer({name:'Motion 制作规范',version:'0.1.0'});
  s.registerTool('list_guides',{description:'查看Motion维护的制作规范目录。这里只提供公开规范，不读取私人稿件、录音、项目或素材。',inputSchema:z.object({}),annotations},async()=>({content:[{type:'text',text:JSON.stringify({guides:await catalog(),reader:BASE+'#/guides',mcp:ENDPOINT})}]}));
  s.registerTool('read_guide',{description:'按目录ID读取Motion最新制作规范全文。制作视频总表前先读production-planning，并依据用户的最终稿执行；不要要求内部项目资料，不编造时间或素材。',inputSchema:z.object({id:z.string().min(1).max(80).default('production-planning')}),annotations},async({id})=>{try{const g=await read(id);return {content:[{type:'text',text:`${g.title}\n版本: ${g.version}\n来源: ${g.url}\nSHA-256: ${g.sha256}\n\n${g.text}`}]};}catch(e){return {isError:true,content:[{type:'text',text:(e as Error).message}]};}});
  s.registerTool('read_project',{description:'凭用户从Motion项目提供的交接密钥，读取该项目终稿、画面和素材清单。无法读取媒体文件；不得索取全站密码。',inputSchema:z.object({accessKey:z.string().max(140)}),annotations},async({accessKey})=>{const r=await route(env,accessKey,'read');return {isError:!r.ok,content:[{type:'text',text:await r.text()}]};});
  s.registerTool('submit_plan',{description:'向用户授权的单个Motion项目提交制作总表。先read_project并读取规范；expectedRevision来自读取结果。服务端执行真实导入校验；用户在Motion采用后才替换本机画面，不渲染、不上传素材。',inputSchema:z.object({accessKey:z.string().max(140),expectedRevision:z.number().int().nonnegative(),plan:z.record(z.string(),z.unknown())}),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},async({accessKey,expectedRevision,plan})=>{const r=await route(env,accessKey,'submit',{expectedRevision,plan});return {isError:!r.ok,content:[{type:'text',text:await r.text()}]};});
  s.registerResource('production-planning','motion://guides/production-planning',{description:'Motion视频画面策划规范，完整正文与网页维护同一来源。',mimeType:'text/markdown'},async(uri)=>{const g=await read('production-planning');return {contents:[{uri:uri.href,mimeType:'text/markdown',text:g.text}]};});
  return s;
}
const handler=(env:Env)=>createMcpHandler(()=>createServer(env),{route:'/mcp',legacy:'stateless',allowedHostnames:['motion-guides.chens-tricks.workers.dev'],allowedOriginHostnames:READ_ORIGINS.map(x=>new URL(x).hostname),corsOptions:{origin:READ_ORIGINS[0]}});
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext){
    const path=new URL(request.url).pathname;
    if(path==='/private-audio-artifact')return privateArtifact(request);
    if(path==='/mcp'||path==='/mcp/')return handler(env)(request,env,ctx);
    if(path.startsWith('/handoff')){
      const origin=request.headers.get('Origin');
      if(origin&&origin!==READ_ORIGINS[0])return new Response('Origin not allowed',{status:403});
      const headers={'Access-Control-Allow-Origin':READ_ORIGINS[0],'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','Vary':'Origin'};
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers});
      try {
        const r=path==='/handoff'?await createHandoff(request,env):await route(env,request.headers.get('Authorization')?.replace(/^Bearer /,'')??'',path.slice('/handoff/'.length),await body(request));
        return new Response(r.body,{status:r.status,headers:{...headers,'Content-Type':'application/json'}});
      } catch(e){return Response.json({error:(e as Error).message},{status:400,headers});}
    }
    if(request.method!=='GET')return new Response('Method not allowed',{status:405});
    if(request.headers.has('Origin')&&!READ_ORIGINS.includes(request.headers.get('Origin')!))return new Response('Origin not allowed',{status:403});
    const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':READ_ORIGINS[0],'Cache-Control':'no-store'};
    if(path==='/health')return Response.json({service:'motion-guides',version:'0.2.0',publicGuidesReadOnly:true,projectAccess:'per-project temporary capability',mediaAccess:false},{headers});
    try{
      if(path==='/'||path==='/guides')return Response.json({guides:await catalog(),mcp:ENDPOINT,website:BASE+'#/guides'},{headers});
      if(path.startsWith('/guides/')){const g=await read(decodeURIComponent(path.slice(8)));return new Response(g.text,{headers:{...headers,'Content-Type':'text/markdown; charset=utf-8','X-Content-SHA256':g.sha256}});}
      return new Response('Not found',{status:404});
    }catch(e){return Response.json({error:(e as Error).message},{status:503,headers});}
  }
};
