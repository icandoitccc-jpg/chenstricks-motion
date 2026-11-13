// 功能B：文字图解动画
// 结构化方案 → 编辑 → 预览 → 云端MP4；不在产品内调用AI。
import React, { useMemo, useState } from 'react';
import type { DirectorOutput, StructureName } from '../../../src/spec/types';
import { DIRECTOR_EXAMPLE } from '../lib/director';
import { layoutDirectorOutput } from '../lib/layout';
import { PreviewPlayer } from '../components/PreviewPlayer';
import { FileDrop } from '../components/FileDrop';
import { parseInfoPlan, validateInfoPlan } from '../lib/info-plan';
import { useCloudRender } from '../lib/useCloudRender';

type Phase = 'input' | 'plan' | 'preview';

const STRUCTURES: { key: StructureName; label: string }[] = [
  { key: 'Comparison', label: '对比' },
  { key: 'Flow', label: '流程' },
  { key: 'Progression', label: '递进' },
  { key: 'Divergence', label: '发散' },
  { key: 'Convergence', label: '汇聚' },
  { key: 'Focus', label: '重点' },
];

export const InfoMotion: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('input');
  const [plan, setPlan] = useState<DirectorOutput | null>(null);
  const [error, setError] = useState('');
  const [manualJson, setManualJson] = useState(JSON.stringify(DIRECTOR_EXAMPLE, null, 2));
  const [importing,setImporting]=useState(false);
  const cloud = useCloudRender();

  const built = useMemo(() => {
    if(!plan)return {spec:null,error:''};
    try { return {spec:layoutDirectorOutput(validateInfoPlan(plan)),error:''}; }
    catch(e){return {spec:null,error:(e as Error).message};}
  },[plan]);
  const spec=built.spec;
  const applyManual = (raw=manualJson) => {
    try {const d=parseInfoPlan(raw);cloud.reset();setPlan(d);setManualJson(JSON.stringify(d,null,2));setError('');setPhase('plan');}
    catch(e){setError((e as Error).message);}
  };
  const importFile = async(files:File[])=>{
    setImporting(true);setError('');try{if(files[0].size>64000)throw new Error('图解方案过大，请只导入一个片段。');applyManual(await files[0].text());}catch(e){setError((e as Error).message);}finally{setImporting(false);}
  };
  const updatePlan = (patch: Partial<DirectorOutput>) => {cloud.reset();setPlan((p) => (p ? { ...p, ...patch } : p));};

  // ---------- 输入阶段 ----------
  if (phase === 'input') {
    return (
      <div className="info-import">
        <a className="back-link" href="#/tools">← 返回素材工具</a>
        <h2 className="page-title">文字图解动画</h2>
        <p className="info-source-note">导入 ChatGPT 或 Agent 编排好的图解方案（JSON）。要在现有图片上框选动画，请使用<a href="#/a">图片局部动画</a>。</p>
        <FileDrop hint="将图解方案 JSON 拖到这里" unsupportedHint="这里接收图解方案 JSON，不接收图片。请到“图片局部动画”上传图片。" label="图解方案" accept=".json" disabled={importing} onFiles={importFile}><label className="studio-file-button">导入图解方案（JSON）<input disabled={importing} type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile([f]);}}/></label></FileDrop>
        {error && <p className="info-error" role="alert">{error}</p>}
        <div className="info-input-actions"><button className="primary" disabled={importing} onClick={()=>applyManual(JSON.stringify(DIRECTOR_EXAMPLE))}>试用示例</button></div>
        <details><summary>粘贴或修改方案内容</summary><textarea aria-label="图解方案内容" className="code" rows={12} value={manualJson} onChange={e=>setManualJson(e.target.value)} style={{width:'100%'}}/><button disabled={importing} onClick={()=>applyManual()}>使用此方案</button></details>
        <details><summary>准备图解方案</summary><p>将示例格式交给ChatGPT或Agent，根据你的稿子编排；导入返回的JSON文件即可。导入和播放不调用付费AI。</p></details>
      </div>
    );
  }

  // ---------- 方案 / 预览阶段 ----------
  const p = plan!; const rendering=['uploading','waiting','dispatching','downloading'].includes(cloud.phase);
  return (
    <div className="info-form">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row">
          <a className="ghost" href="#/tools" style={{ textDecoration: 'none', padding: '4px 12px', fontSize: 13 }}>← 返回素材工具</a>
          <b>文字图解动画 · 动画方案</b>
        </div>
        <div className="row">
          <button className="ghost" disabled={rendering} onClick={() => { setPhase('input'); setPlan(null); }}>← 重新输入</button>
          <button className="ghost" disabled={rendering} onClick={() => {setManualJson(JSON.stringify(plan,null,2));setPhase('input');}}>修改方案</button>
          {phase === 'plan' && <button className="blue" disabled={!spec} onClick={() => setPhase('preview')}>预览动画 →</button>}
          {phase === 'preview' && (
            <button className="primary"
              disabled={['uploading','waiting','dispatching','downloading'].includes(cloud.phase) || !spec}
              onClick={() => spec && cloud.run({ spec, autoDownload:false, compatible:true, privateInfo:true, fileName: `motion-b-${Date.now()}.mp4` })}>
              生成高清 MP4
            </button>
          )}
        </div>
      </div>

      {built.error && <p className="info-error" role="alert">{built.error}</p>}
      {cloud.phase !== 'idle' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row">
            <span className={cloud.phase === 'error' ? 'tag' : 'tag green'}>{cloud.phase === 'error' ? '出错' : cloud.phase === 'done' ? '完成' : '云端'}</span>
            <span className="muted">{cloud.message}</span>
            {(cloud.phase === 'done' || cloud.phase === 'error') && <button className="ghost" onClick={cloud.reset}>知道了</button>}
          </div>
          {(cloud.phase === 'waiting' || cloud.phase === 'dispatching' || cloud.phase === 'downloading') && (
            <div className="bar" style={{ marginTop: 10 }}><div style={{ width: '60%' }} /></div>
          )}
        </div>
      )}

      {cloud.videoUrl && <section className="card col" style={{gap:12,marginBottom:20}}><h3>已生成的视频</h3><video controls src={cloud.videoUrl} style={{width:'100%',maxHeight:500}}/><a href={cloud.videoUrl} download={cloud.videoName}>下载 MP4</a></section>}
      <div className="a-layout">
        <div className="col" style={{ gap: 14 }}>
          {phase === 'preview' && spec ? (
            <PreviewPlayer spec={spec} />
          ) : (
            <div className="card col" style={{ gap: 14 }}>
              <div>
                <span className="tag">内容概述</span>
                <textarea aria-label="内容概述" rows={2} value={p.meaning} onChange={(e) => updatePlan({ meaning: e.target.value })} style={{ width: '100%', marginTop: 8 }} />
              </div>
              <div className="row">
                <span className="tag amber">图解结构</span>
                {STRUCTURES.map((s) => (
                  <button key={s.key} style={{ padding: '4px 14px', fontSize: 13 }}
                    className={p.primaryStructure === s.key ? 'primary' : 'ghost'}
                    onClick={() => updatePlan({ primaryStructure: s.key })}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="col">
                <span className="tag green">画面内容（可编辑）</span>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <label className="muted" style={{ width: 70 }}>标题</label>
                  <input aria-label="图解标题" style={{ flex: 1 }} value={p.title ?? ''} onChange={(e) => updatePlan({ title: e.target.value })} />
                </div>
                {p.primaryStructure === 'Comparison' && (
                  <>
                    {(['left', 'right'] as const).map((side) => (
                      <div className="row" key={side} style={{ alignItems: 'flex-start' }}>
                        <label className="muted" style={{ width: 70 }}>{side === 'left' ? '左栏' : '右栏'}</label>
                        <input style={{ width: 180 }} value={p[side]?.label ?? ''}
                          onChange={(e) => updatePlan({ [side]: { label: e.target.value, steps: p[side]?.steps ?? [] } } as Partial<DirectorOutput>)} />
                        <input style={{ flex: 1 }} value={(p[side]?.steps ?? []).join(' → ')}
                          onChange={(e) => updatePlan({ [side]: { label: p[side]?.label ?? '', steps: e.target.value.split(/[→,，]/).map((s) => s.trim()).filter(Boolean) } } as Partial<DirectorOutput>)} />
                      </div>
                    ))}
                  </>
                )}
                {(p.primaryStructure === 'Flow' || p.primaryStructure === 'Progression') && (
                  <div className="row">
                    <label className="muted" style={{ width: 70 }}>步骤</label>
                    <input style={{ flex: 1 }} value={(p.steps ?? []).join(' → ')}
                      onChange={(e) => updatePlan({ steps: e.target.value.split(/[→,，]/).map((s) => s.trim()).filter(Boolean) })} />
                  </div>
                )}
                {(p.primaryStructure === 'Divergence' || p.primaryStructure === 'Convergence') && (
                  <>
                    <div className="row">
                      <label className="muted" style={{ width: 70 }}>中心</label>
                      <input style={{ flex: 1 }} value={p.center ?? ''} onChange={(e) => updatePlan({ center: e.target.value })} />
                    </div>
                    <div className="row">
                      <label className="muted" style={{ width: 70 }}>{p.primaryStructure === 'Divergence' ? '分支' : '输入'}</label>
                      <input style={{ flex: 1 }} value={(p.items ?? []).join('，')}
                        onChange={(e) => updatePlan({ items: e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean) })} />
                    </div>
                  </>
                )}
                {p.primaryStructure === 'Focus' && (
                  <div className="row">
                    <label className="muted" style={{ width: 70 }}>清单</label>
                    <input style={{ flex: 1 }} value={(p.items ?? []).join('，')} placeholder="可空"
                      onChange={(e) => updatePlan({ items: e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean) })} />
                  </div>
                )}
                <div className="row">
                  <label className="muted" style={{ width: 70 }}>落点</label>
                  <input style={{ flex: 1 }} value={p.conclusion ?? ''} onChange={(e) => updatePlan({ conclusion: e.target.value })} />
                </div>
                <div className="row">
                  <label className="muted" style={{ width: 70 }}>强调</label>
                  <input style={{ flex: 1 }} value={(p.emphasis ?? []).join('，')}
                    onChange={(e) => updatePlan({ emphasis: e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean) })} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 分镜 */}
        <div className="card col" style={{ gap: 10 }}>
          <b>动画节奏（分镜）</b>
          {(p.beats ?? []).map((b, i) => (
            <div key={i} className="anim-item">
              <div className="head">
                <span className="num">{i + 1}</span>
                <input style={{ flex: 1, padding: '4px 8px', fontSize: 13 }} value={b.label}
                  onChange={(e) => {
                    const beats = [...(p.beats ?? [])];
                    beats[i] = { ...beats[i], label: e.target.value };
                    updatePlan({ beats });
                  }} />
              </div>
            </div>
          ))}
          <span className="muted">节奏由系统按分镜自动换算成时间；重点画面会自动留阅读时间。</span>
          {phase === 'preview' && (
            <button className="ghost" disabled={rendering} onClick={() => setPhase('plan')}>← 返回调整方案</button>
          )}
        </div>
      </div>
    </div>
  );
};
