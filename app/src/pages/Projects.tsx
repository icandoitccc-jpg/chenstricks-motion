import React, { useEffect, useState } from 'react';
import { deleteProject, listProjects, loadProject, saveProject, readProjectZip, type ProjectEntry } from '../lib/project-files';
import { prepareWorkflow, projectProgress } from '../lib/workflow';
import { FileDrop } from '../components/FileDrop';
import '../studio.css';
export function Projects({ recent = false, go }: { recent?: boolean; go: (path: string)=>void }) {
  const [entries, setEntries] = useState<ProjectEntry[]>([]); const [error, setError] = useState(''); const [loading,setLoading] = useState(true); const [importing,setImporting]=useState(false);
  useEffect(()=>{ let live=true; (async()=>{ await loadProject(); const entries=await listProjects(); if(live)setEntries(entries); })().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
  const importPackage = async(f:File)=>{setImporting(true);setError('');try{const d=await readProjectZip(f);const p=prepareWorkflow(d.project);await saveProject(p,new Map(d.files),true);go('#/project/'+encodeURIComponent(p.id));}catch(e){setError((e as Error).message);}finally{setImporting(false);}};
  const remove = async (id: string) => { if(!window.confirm('删除这个项目？'))return; try { await deleteProject(id);localStorage.removeItem('motion.lastRun.'+id);setEntries(await listProjects()); }catch(e){setError((e as Error).message);} };
  return <div className="project-hub studio">
    {!recent && <a className="back-link" href="#/">← 返回首页</a>}
    <header className="hub-header"><h1>{recent ? '最近项目' : '我的项目'}</h1><button className="primary" onClick={()=>go('#/new')}>新建项目</button></header>
    {error && <p role="alert" className="studio-notice">{error}</p>}
    {loading ? <p role="status">正在读取项目…</p> : entries.length ? <div className="project-card-grid">{(recent ? entries.slice(0,6) : entries).map(entry=><article className="project-card" key={entry.project.id}>
      <h2>{entry.project.title}</h2><p>{projectProgress(entry.project)}</p><small>最近编辑：{new Date(entry.updatedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>
      <div className="studio-actions"><button className="primary" onClick={()=>go('#/project/'+encodeURIComponent(entry.project.id))}>继续制作</button>{!recent && <button onClick={()=>void remove(entry.project.id)}>删除</button>}</div>
    </article>)}</div> : <div className="hub-empty"><h2>还没有项目</h2><p>从本期视频的终稿开始。</p></div>}
    {recent && entries.length > 0 && <a className="hub-more" href="#/projects">查看全部项目 →</a>}
    {!recent && <details className="hub-import"><summary>导入已有项目包</summary><FileDrop label=".zip" accept=".zip" disabled={importing} onFiles={files=>importPackage(files[0])}><label className="studio-file-button">选择项目包<input type="file" accept=".zip" disabled={importing} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importPackage(f);}}/></label></FileDrop></details>}
  </div>;
}
