import React, { useState } from 'react';
import { newProject } from '../lib/project';
import { confirmDraft } from '../lib/workflow';
import { saveProject } from '../lib/project-files';
import { readScriptFile } from '../lib/script-file';
import '../studio.css';
export function NewProject({ go }: { go: (path: string)=>void }) {
  const [title,setTitle]=useState('');const [text,setText]=useState('');const [fileName,setFileName]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const upload=async(f:File)=>{setBusy(true);setError('');try{setText(await readScriptFile(f));setFileName(f.name);if(!title)setTitle(f.name.replace(/\.[^.]+$/,''));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const create=async()=>{setBusy(true);setError('');try{const p=confirmDraft({...newProject(),title:title.trim()||'未命名视频',scriptFileName:fileName||undefined},text);await saveProject(p,new Map(),false);go('#/project/'+encodeURIComponent(p.id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="studio draft-page"><a className="back-link" href="#/projects">← 返回项目列表</a><h1>新建项目</h1>
    <fieldset className="studio-working-fields" disabled={busy}><label className="draft-name">项目名称<input autoFocus aria-label="项目名称" value={title} placeholder="为本期视频起个名字" onChange={e=>setTitle(e.target.value)}/></label>
      <div className="studio-section-heading"><h2>最终稿</h2><label className="studio-file-button">上传终稿<input type="file" accept=".pdf,.docx,.txt,.md" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/></label></div>
      {fileName && <p className="draft-filename">{fileName}</p>}<textarea aria-label="最终稿" rows={15} value={text} placeholder="上传稿件，或将最终稿粘贴到这里。" onChange={e=>setText(e.target.value)}/>
      {error && <p role="alert" className="studio-notice">{error}</p>}<div className="draft-footer"><span role="status">{busy?'正在处理…':text.trim()?`${text.trim().length} 字`:''}</span><button className="primary" disabled={!text.trim()} onClick={()=>void create()}>创建项目</button></div>
    </fieldset>
  </div>;
}
