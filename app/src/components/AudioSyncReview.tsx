import React,{useState} from 'react';
import {type SyncRow} from '../lib/audio-alignment';
export function AudioSyncReview({initial,onApply,onCancel,onListen}:{initial:SyncRow[];onApply:(rows:SyncRow[])=>void;onCancel:()=>void;onListen:(t:number)=>void}){
 const [rows,setRows]=useState(initial);const change=(i:number,patch:Partial<SyncRow>)=>setRows(old=>old.map((r,j)=>i===j?{...r,...patch}:r));
 const pending=rows.filter(r=>r.review).length;
 return <section className="audio-sync-review" aria-label="核对录音与画面"><h3>核对录音与画面</h3><p>按实际字幕找到 {rows.length} 段画面，其中 {pending} 段需要核对。时间来自字幕，不按字数估算；确认前不会覆盖项目。</p>
 <div className="studio-actions"><button className="primary" disabled={pending>0} onClick={()=>onApply(rows)}>采用画面时间</button><button onClick={onCancel}>取消本次匹配</button></div>
 {rows.map((r,i)=><details key={r.scene.id} className={r.review?'sync-needs-review':''} open={r.review||undefined}><summary>{i+1}. {r.scene.title} · {r.skip?'未朗读':r.review?'需要核对':'已找到对应'}</summary><p>{r.reason}</p><p>稿子：{r.text}</p><p>实际字幕：{r.spoken||'未找到对应文字'}</p><div className="studio-actions"><button onClick={()=>onListen(r.start??0)}>试听本段</button><label>开始（秒）<input aria-label={`${r.scene.id}同步开始`} type="number" min="0" step=".01" disabled={r.skip} value={r.start??''} onChange={e=>change(i,{start:e.target.value===''?null:Number(e.target.value),review:true})}/></label><label>结束（秒）<input aria-label={`${r.scene.id}同步结束`} type="number" min="0" step=".01" disabled={r.skip} value={r.end??''} onChange={e=>change(i,{end:e.target.value===''?null:Number(e.target.value),review:true})}/></label><button disabled={r.skip||r.start===null||r.end===null} onClick={()=>change(i,{review:false})}>确认此段</button></div><label className="studio-checkbox"><input type="checkbox" checked={r.skip} onChange={e=>change(i,{skip:e.target.checked,review:!e.target.checked})}/>这段未朗读，不单独出画面</label></details>)}
 </section>;
}
