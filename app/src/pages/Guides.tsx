import React, { useEffect, useState } from 'react';
import '../studio.css';
interface Guide {id:string;title:string;version:string;kind:string;summary:string;path:string}
interface Catalog {mcpEndpoint:string;pluginUrl?:string;guides:Guide[]}
const publicBase='https://icandoitccc-jpg.github.io/chenstricks-motion/';
function GuideText({text}:{text:string}){
  const blocks:React.ReactNode[]=[];const lines=text.split('\n');
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.startsWith('```')){const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);blocks.push(<pre key={i} className="guide-code"><code>{code.join('\n')}</code></pre>);continue;}
    if(line.startsWith('|')){const rows=[line];while(i+1<lines.length&&lines[i+1].startsWith('|'))rows.push(lines[++i]);const cells=rows.filter(r=>!/^\|[\s:|\-]+\|$/.test(r)).map(r=>r.split('|').slice(1,-1).map(x=>x.trim()));blocks.push(<div key={i} className="guide-table"><table><tbody>{cells.map((row,j)=><tr key={j}>{row.map((cell,k)=>j===0?<th key={k}>{cell}</th>:<td key={k}>{cell}</td>)}</tr>)}</tbody></table></div>);continue;}
    const h=line.match(/^(#{1,3}) (.+)/);if(h){blocks.push(h[1].length===1?<h2 key={i}>{h[2]}</h2>:<h3 key={i}>{h[2]}</h3>);continue;}
    if(line.trim())blocks.push(<p key={i}>{line}</p>);
  }
  return <article className="guide-document">{blocks}</article>;
}
export function Guides({id,go}:{id?:string;go:(path:string)=>void}){
  const [catalog,setCatalog]=useState<Catalog|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{const a=new AbortController();fetch('./guides.json',{signal:a.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('制作规范暂时未能加载，请重试。');return r.json();}).then(setCatalog).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>a.abort();},[]);
  const selected=catalog?.guides.find(g=>g.id===id);
  useEffect(()=>{setText('');setNotice('');if(!selected)return;const a=new AbortController();fetch('./'+selected.path,{signal:a.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('规范正文加载失败，请重试。');return r.text();}).then(setText).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>a.abort();},[selected?.path]);
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setNotice('已复制');}catch{setNotice('复制未成功，请选择下面的链接复制。');}};
  return <div className="studio guides-page"><a className="back-link" href={id?'#/guides':'#/'}>{id?'← 返回制作规范':'← 返回首页'}</a><header className="hub-header"><h1>{selected?selected.title:'制作规范'}</h1>{selected&&<span className="tag">V{selected.version}</span>}</header>
    {error&&<p className="studio-notice" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!catalog&&!error&&<p>正在读取规范…</p>}
    {catalog&&!id&&<><div className="project-card-grid">{catalog.guides.map(g=><section className="project-card guide-card" key={g.id}><span className="tag">{g.kind==='skill'?'Skill':'Guide'} · V{g.version}</span><h2>{g.title}</h2><p>{g.summary}</p><div className="studio-actions"><button className="primary" onClick={()=>go('#/guides/'+g.id)}>阅读规范</button><button onClick={()=>void copy('请阅读 '+publicBase+g.path+' ，再根据我给你的最终稿制作可导入 Motion 的视频制作总表。')}>复制给 AI 的入口</button></div></section>)}</div>
      <section className="guide-connection"><h2>连接 Agent</h2><p>首次连接 MCP，之后让 Agent 读取这里的规范。规范更新后，Agent 读取的仍是同一来源。</p><div className="guide-endpoint">{catalog.pluginUrl&&<a className="studio-file-button" href={catalog.pluginUrl} target="_blank" rel="noreferrer">连接 ChatGPT</a>}<code>{catalog.mcpEndpoint}</code><button onClick={()=>void copy(catalog.mcpEndpoint)}>复制 MCP 地址</button></div><p className="muted">公开规范无需授权。项目终稿与总表仅在项目内主动交接后可读写；录音与媒体文件尚不通过此接口传输。</p><details><summary>连接方式</summary><p>Codex 或 WorkBuddy：在 MCP 设置新增远程 Streamable HTTP 服务，填入上面的地址，无需登录。</p><p>ChatGPT：通过 Motion 制作规范插件连接。若当前账号没有添加或使用自定义 MCP 的入口，可先让它读取规范网页；具体可用性以客户端实际显示为准。</p><p>网页与 MCP 读取规则不会调用付费 AI；策划仍使用你所选 Agent 的订阅额度。托管服务受免费配额限制。</p></details></section></>}
    {catalog&&id&&!selected&&<p role="alert">没有这份规范，请返回目录选择。</p>}
    {selected&&<><div className="studio-actions"><button onClick={()=>void copy(publicBase+selected.path)}>复制阅读链接</button><a className="studio-file-button" href={'./'+selected.path} download>下载规范</a></div>{text?<GuideText text={text}/>:!error&&<p>正在读取正文…</p>}</>}
  </div>;
}
