import React from 'react';
import { formatTime, type Project } from '../lib/project';
import { orderedScenes, sceneReadiness } from '../lib/scene-board';

export function SceneBoard({ project, files, selected, busy, generated, onSelect, onRender, onBatch, planning = false }: {
  planning?: boolean; project: Project; files: Map<string, Blob>; selected: string; busy: boolean;
  generated: Set<string>; onSelect: (id: string) => void; onRender: (ids: string[]) => void; onBatch: () => void;
}) {
  const scenes = orderedScenes(project); const ready = scenes.filter(s => sceneReadiness(project, s.id, files).ready);
  return <section className="studio-board" aria-label="按稿子顺序排列的画面总表">
    <div className="studio-section-heading"><div><h2>画面总览 · {scenes.length} 段</h2></div>
      {!planning && <div className="studio-actions"><button disabled={busy || !ready.length} onClick={onBatch}>连续预览已就绪段落（{ready.length}）</button><button disabled={busy || !ready.length} onClick={() => onRender(ready.map(s => s.id))}>批量生成分段 MP4</button></div>}</div>
    {!scenes.length && <p className="studio-empty">导入制作总表后，每一段会在这里成为一张卡片。</p>}
    <div className="studio-board-grid">{scenes.map((s, index) => { const r = sceneReadiness(project, s.id, files); return <article key={s.id} className={`studio-shot ${selected === s.id ? 'selected' : ''}`}>
      <div className="studio-shot-top"><strong>{String(index + 1).padStart(2, '0')}</strong><span>{s.kind === 'info' ? '文字图解' : s.kind === 'image' ? '图片动画' : '录屏 / 视频'}</span></div>
      <h3>{s.title}</h3><p className="studio-shot-script">{r.text || '尚未关联原文'}</p>
      <small>{s.sentenceIds.join('—') || '未绑定句子'}</small><small>{planning ? '时长在录音步骤确定' : r.timed ? `${formatTime(r.timed.start)} → ${formatTime(r.timed.end)}` : '待匹配录音实际时间'}</small>
      <p className="studio-shot-source">{s.kind === 'info' ? ({ focus: '重点强调', steps: '步骤展开', comparison: '左右对比', list: '逐项解释' }[s.template]) + ' · ' + s.items.join(' / ') : r.asset?.name || '需要补充素材文件'}</p>
      {(s.recordingInstructions||s.fallback||s.sourceStatus)&&<details className="scene-preparation"><summary>素材准备与替代方案</summary>{s.sourceStatus&&<p>来源状态：{s.sourceStatus}</p>}{s.recordingInstructions&&<p>准备方法：{s.recordingInstructions}</p>}{s.fallback&&<p>替代方案：{s.fallback}</p>}</details>}
      <div className={`studio-shot-state ${r.ready ? 'ready' : ''}`}>{planning ? s.kind==='info'?'已安排':files.has(s.assetId??'')?'素材已连接':'待补素材' : generated.has(s.id) ? '已有分段 MP4' : r.label}</div>
      {!planning && !r.ready && <p className="studio-shot-error" title={r.errors.join('\n')}>{r.errors[0]}{r.errors.length > 1 ? `（另有${r.errors.length - 1}项）` : ''}</p>}
      <div className="studio-shot-actions"><button disabled={busy} onClick={() => onSelect(s.id)}>{planning ? '修改安排' : r.ready ? '预览 / 修改' : '查看 / 补齐'}</button>{!planning && <button disabled={busy || !r.ready} onClick={() => onRender([s.id])}>生成本段 MP4</button>}</div>
    </article>; })}</div>
  </section>;
}
