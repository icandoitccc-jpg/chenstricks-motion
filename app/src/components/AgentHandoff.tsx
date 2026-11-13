import React, {useEffect,useState,useRef} from 'react';
import {parseProductionPlan,type Project} from '../lib/project';
const BASE='https://motion-guides.chens-tricks.workers.dev';
interface Link {ownerKey:string;accessKey:string;expires:number;revision:number;base:string}
const snapshot=(p:Project)=>JSON.stringify([p.id,p.scriptText,p.draftText,p.scriptRevision,p.audioRevision,p.sentences,p.scenes,p.assets]);
async function request(path:string,key?:string,data?:unknown){const r=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(data??{})});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error??'交接暂时不可用。'),{status:r.status});return d;}
export const AgentHandoff:React.FC<{project:Project;onApply:(p:Project)=>Promise<void>}>=({project,onApply})=>{
 const storageKey='motion.handoff.'+project.id;
 const [link,setLink]=useState<Link|null>(()=>{try{const l=JSON.parse(localStorage.getItem(storageKey)??'null');return l?.expires>Date.now()?l:null;}catch{return null;}});
 const [pending,setPending]=useState<{plan:unknown;revision:number}|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const latest=useRef(project);latest.current=project;
 const save=(l:Link|null)=>{setLink(l);if(l)localStorage.setItem(storageKey,JSON.stringify(l));else localStorage.removeItem(storageKey);};
 useEffect(()=>{if(!link)return;let live=true,inFlight=false;
  const check=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{const d=await request('/handoff/read',link.ownerKey);if(live&&d.plan&&d.revision>link.revision)setPending({plan:d.plan,revision:d.revision});}catch(e){if(live){setMessage((e as Error).message);if((e as {status?:number}).status===401){localStorage.removeItem(storageKey);setLink(null);setPending(null);}}}finally{inFlight=false;}};
  void check();const timer=setInterval(check,12000);return()=>{live=false;clearInterval(timer);};
 },[link]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
 const start=()=>run(async()=>{const p=latest.current,d=await request('/handoff',undefined,{project:p});save({...d,base:snapshot(p)});setPending(null);setMessage('已准备好交接。复制指令交给Agent即可。');});
 const copy=()=>run(async()=>{if(!link)return;await navigator.clipboard.writeText(`请负责这个Motion项目的画面策划与交接。先读取最新production-planning规范，再读取项目，独立判断每幕画面和需要补录的素材，不预设幕数，不编造素材或时间。\nMotion MCP: ${BASE}/mcp\n交接密钥（仅当前项目，24小时有效，请勿公开）：${link.accessKey}\n调用read_project({accessKey})读取终稿及revision；调用submit_plan({accessKey,expectedRevision:revision,plan})提交完整制作总表。若客户端尚未刷新出新工具，可用HTTP POST ${BASE}/handoff/read 或 /handoff/submit，Authorization: Bearer <交接密钥>；提交正文为{expectedRevision,plan}。密钥不得写进源码、公开文件或链接。提交后说明待补素材和实际检查范围，不声称已渲染。`);setMessage('已复制，粘贴给Codex或WorkBuddy。');});
 return <div className="studio-card agent-handoff"><h3>交给 Agent 安排画面</h3>
 {!link?<><p>将本项目的终稿和素材清单交给 Agent，制作总表会直接回到这里。</p><button disabled={busy} onClick={start}>准备交接</button></>:<><div className="studio-actions"><button disabled={busy} onClick={copy}>复制交接指令</button><button disabled={busy} onClick={()=>run(async()=>{await request('/handoff/revoke',link.ownerKey);save(null);setPending(null);setMessage('交接已结束。');})}>结束交接</button></div><small>仅交接当前项目文字与素材清单，24小时后失效；不上传录音、图片或录屏。</small></>}
 {pending&&link&&<div role="status"><p>Agent 已提交制作总表，等待采用。</p><button disabled={busy} onClick={()=>run(async()=>{if(snapshot(latest.current)!==link.base)throw new Error('项目在交接后已有修改。请结束本次交接，重新交接最新项目，避免覆盖修改。');const p=parseProductionPlan(JSON.stringify(pending.plan),latest.current);await onApply(p);await request('/handoff/revoke',link.ownerKey);save(null);setPending(null);setMessage('制作总表已采用，请查看下方画面卡片。');})}>采用制作总表</button></div>}
 {message&&<p role="status">{message}</p>}
 </div>;
};
