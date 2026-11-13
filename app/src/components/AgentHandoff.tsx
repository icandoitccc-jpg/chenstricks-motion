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
  const check=async()=>{if(inFlight||document.hidden)return;inFlight=true;try{const d=await request('/handoff/read',link.ownerKey);if(live&&d.plan&&d.revision>link.revision){setPending({plan:d.plan,revision:d.revision});setMessage('');}}catch(e){if(live){setMessage((e as Error).message);if((e as {status?:number}).status===401){localStorage.removeItem(storageKey);setLink(null);setPending(null);}}}finally{inFlight=false;}};
  void check();const timer=setInterval(check,12000);return()=>{live=false;clearInterval(timer);};
 },[link]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
 const start=()=>run(async()=>{const p=latest.current,d=await request('/handoff',undefined,{project:p});save({...d,base:snapshot(p)});setPending(null);setMessage('已准备好交接。复制指令交给Agent即可。');});
 const copy=()=>run(async()=>{if(!link)return;await navigator.clipboard.writeText(`请负责这个Motion项目的画面策划与交接。先读取最新production-planning规范，再读取项目，独立判断每幕画面和需要补录的素材，不预设幕数，不编造素材或时间。\nMotion MCP: ${BASE}/mcp\n交接密钥（仅当前项目，24小时有效，请勿公开）：${link.accessKey}\n调用read_project({accessKey})读取终稿及revision；调用submit_plan({accessKey,expectedRevision:revision,plan})提交完整制作总表。若客户端尚未刷新出新工具，可用HTTP POST ${BASE}/handoff/read 或 /handoff/submit，Authorization: Bearer <交接密钥>；提交正文为{expectedRevision,plan}。密钥不得写进源码、公开文件或链接。提交后说明待补素材和实际检查范围，不声称已渲染。`);setMessage('已复制，粘贴给Codex或WorkBuddy。');});
 const existing=project.scenes.length>0;
 const cancel=()=>run(async()=>{if(!link)return;await request('/handoff/revoke',link.ownerKey);save(null);setPending(null);setMessage('已取消本次画面策划。');});
 const begin=<><p>{existing?'把当前画面安排交给 Agent 修改，新方案返回后由你决定是否替换。':'让 Agent 根据终稿安排画面，方案会直接回到这个项目。'}</p><button className="primary" disabled={busy} onClick={start}>{existing?'让 Agent 修改安排':'让 Agent 策划画面'}</button></>;
 if(!link&&existing)return <div className="agent-revise"><details><summary>请 Agent 修改画面安排</summary>{begin}</details>{message&&<p role="status">{message}</p>}</div>;
 const preview=pending?.plan as {scenes?:{id:string;title:string;kind:string}[]}|undefined;
 return <div className="studio-card agent-handoff"><h3>{pending?'画面方案已收到':link?'等待 Agent 提交画面方案':'安排视频画面'}</h3>
 {!link?begin:<>
 {pending?<div role="status"><p>Agent 已提交制作总表，等待采用。</p><details className="handoff-preview"><summary>查看方案（{preview?.scenes?.length??0} 幕）</summary><ol>{preview?.scenes?.map(s=><li key={s.id}>{s.title} · {s.kind==='info'?'文字图解':s.kind==='image'?'图片动画':'录屏 / 视频'}</li>)}</ol></details><button className="primary" disabled={busy} onClick={()=>run(async()=>{if(snapshot(latest.current)!==link.base)throw new Error('项目在策划期间已有修改。请取消本次策划，再把最新项目交给 Agent。');const p=parseProductionPlan(JSON.stringify(pending.plan),latest.current);await onApply(p);let ended=true;try{await request('/handoff/revoke',link.ownerKey);}catch{ended=false;}save(null);setPending(null);setMessage(ended?'制作总表已采用，请查看下方画面卡片。':'制作总表已采用。临时交接未能立即关闭，将在到期后失效。');})}>采用制作总表</button></div>:<><p>复制指令交给 Codex 或 WorkBuddy，提交完成后会在这里显示。</p><button className="primary" disabled={busy} onClick={copy}>复制交接指令</button></>}
 <details className="handoff-options"><summary>更多操作</summary><div className="studio-actions">{pending&&<button disabled={busy} onClick={copy}>复制交接指令</button>}<button disabled={busy} onClick={cancel}>取消本次交接</button></div><small>本次仅提供项目文字与素材清单，24小时后失效；采用后自动结束。</small></details>
 </>}
 {message&&<p role="status">{message}</p>}
 </div>;
};
