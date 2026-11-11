import React from 'react';
import { type Project, type Scene, formatTime, compileScenes } from '../lib/project';

export function SceneEditor({ project, scene, onChange, onDelete, onDuplicate }: { project: Project; scene: Scene; onChange: (patch: Partial<Scene>) => void; onDelete: () => void; onDuplicate: () => void }) {
  const timed = compileScenes(project).find(s => s.id === scene.id);
  return <section className="studio-inspector" aria-label="画面设置">
    <div className="studio-section-heading"><h3>画面设置</h3><button onClick={onDelete}>删除</button></div>
    <label>画面标题<input value={scene.title} onChange={e => onChange({ title: e.target.value })} /></label>
    <label>画面来源<select value={scene.kind} onChange={e => onChange({ kind: e.target.value as Scene['kind'], assetId: undefined })}><option value="info">信息动画</option><option value="image">图片 / 截图</option><option value="video">录屏 / 视频</option></select></label>
    <p className="studio-hint">{timed ? `${formatTime(timed.start)} — ${formatTime(timed.end)} · ${(timed.end - timed.start).toFixed(2)} 秒` : '绑定句子并标记时间后，自动计算此幕时长。'}</p>
    <label>绑定哪些句子<select multiple size={Math.min(6, Math.max(2, project.sentences.length))} value={scene.sentenceIds} onChange={e => onChange({ sentenceIds: Array.from(e.target.selectedOptions, o => o.value) })}>{project.sentences.map(s => <option key={s.id} value={s.id}>{s.id} {s.text.slice(0, 22)}</option>)}</select></label>
    <p className="studio-hint">可按住 Shift 选择连续句子。每句只分配一个画面。</p>
    {scene.kind === 'info' ? <>
      <label>表达方式<select value={scene.template} onChange={e => onChange({ template: e.target.value as Scene['template'] })}><option value="focus">重点强调</option><option value="steps">步骤展开</option><option value="comparison">左右对比</option><option value="list">逐项解释</option></select></label>
      <label>上屏内容（每行一项，最多6项）<textarea rows={5} value={scene.items.join('\n')} onChange={e => onChange({ items: e.target.value.split('\n') })} /></label>
      {scene.template === 'comparison' && <div className="studio-fields"><label>左栏名称<input value={scene.leftLabel} onChange={e => onChange({ leftLabel: e.target.value })} /></label><label>右栏名称<input value={scene.rightLabel} onChange={e => onChange({ rightLabel: e.target.value })} /></label></div>}
    </> : <>
      <label>选用素材<select value={scene.assetId ?? ''} onChange={e => onChange({ assetId: e.target.value || undefined })}><option value="">请选择素材</option>{project.assets.filter(a => a.kind === scene.kind).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {scene.kind === 'video' ? <label>从原录屏第几秒开始<input type="number" min="0" step="0.1" value={scene.sourceIn} onChange={e => onChange({ sourceIn: Number(e.target.value) })} /></label> : <>
        <label>镜头运动<select value={scene.motion} onChange={e => onChange({ motion: e.target.value as Scene['motion'] })}><option value="push">缓慢推近</option><option value="pan">缓慢平移</option><option value="still">保持静止</option></select></label>
        <label>聚焦位置 · 横向 {scene.focusX}%<input type="range" min="0" max="100" value={scene.focusX} onChange={e => onChange({ focusX: Number(e.target.value) })} /></label>
        <label>聚焦位置 · 纵向 {scene.focusY}%<input type="range" min="0" max="100" value={scene.focusY} onChange={e => onChange({ focusY: Number(e.target.value) })} /></label>
      </>}
    </>}
    <button onClick={onDuplicate}>复制这一幕（重新绑定句子）</button>
  </section>;
}
