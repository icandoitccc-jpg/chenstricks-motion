// 功能B：文字图解动画
// 输入 → AI 分析（先给可编辑方案，确认后才生成）→ 分镜 → 低清预览 → 细节调整 → 云端高清 MP4
import React, { useMemo, useState } from 'react';
import type { DirectorOutput, StructureName } from '../../../src/spec/types';
import { DIRECTOR_EXAMPLE } from '../lib/director';
import { layoutDirectorOutput } from '../lib/layout';
import { PreviewPlayer } from '../components/PreviewPlayer';
import { useCloudRender } from '../lib/useCloudRender';

type Phase = 'input' | 'analyzing' | 'plan' | 'preview';

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
  const showManual = true;
  const cloud = useCloudRender();

  const spec = useMemo(() => (plan ? layoutDirectorOutput(plan) : null), [plan]);

  const applyManual = () => {
    try {
      const d = JSON.parse(manualJson) as DirectorOutput;
      if (!d.primaryStructure) throw new Error('缺少 primaryStructure');
      setPlan(d);
      setError('');
      setPhase('plan');
    } catch (e) {
      setError(`JSON 解析失败：${(e as Error).message}`);
    }
  };

  const updatePlan = (patch: Partial<DirectorOutput>) => setPlan((p) => (p ? { ...p, ...patch } : p));

  // ---------- 输入阶段 ----------
  if (phase === 'input' || phase === 'analyzing') {
    return (
      <div style={{ maxWidth: 720 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <a className="ghost" href="#/" style={{ textDecoration: 'none', padding: '4px 12px', fontSize: 13 }}>← 返回首页</a>
        </div>
        <h2 className="page-title">文字图解动画</h2>
        <p className="page-sub">用ChatGPT编排的方案制作对比、流程或重点图解片段。</p>
        <div className="card col" style={{ gap: 12 }}>
          <p className="muted">这是单独的图解片段工具。完整视频请进入「视频制作」。下方为可预览示例；把稿子和此格式交给ChatGPT，返回后粘贴替换。Motion不调用付费AI。</p>{error && <p role="alert">{error}</p>}
          {showManual && (
            <div className="col" style={{ gap: 8 }}>
              <span className="muted">图解方案（JSON内容，下方已填入示例）</span>
              <textarea className="code" rows={12} value={manualJson} onChange={(e) => setManualJson(e.target.value)} style={{ width: '100%' }} />
              <div><button className="blue" onClick={applyManual}>使用此方案 →</button></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- 方案 / 预览阶段 ----------
  const p = plan!;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row">
          <a className="ghost" href="#/" style={{ textDecoration: 'none', padding: '4px 12px', fontSize: 13 }}>← 返回首页</a>
          <b>文字图解动画 · 动画方案</b>
        </div>
        <div className="row">
          <button className="ghost" onClick={() => { setPhase('input'); setPlan(null); }}>← 重新输入</button>
          <button className="ghost" onClick={() => setPhase('input')}>修改方案</button>
          {phase === 'plan' && <button className="blue" onClick={() => setPhase('preview')}>生成预览 →</button>}
          {phase === 'preview' && (
            <button className="primary"
              disabled={cloud.phase === 'waiting' || cloud.phase === 'dispatching' || !spec}
              onClick={() => spec && cloud.run({ spec, fileName: `motion-b-${Date.now()}.mp4` })}>
              生成高清 MP4
            </button>
          )}
        </div>
      </div>

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

      <div className="a-layout">
        <div className="col" style={{ gap: 14 }}>
          {phase === 'preview' && spec ? (
            <PreviewPlayer spec={spec} />
          ) : (
            <div className="card col" style={{ gap: 14 }}>
              <div>
                <span className="tag">我对这段内容的理解</span>
                <textarea rows={2} value={p.meaning} onChange={(e) => updatePlan({ meaning: e.target.value })} style={{ width: '100%', marginTop: 8 }} />
              </div>
              <div className="row">
                <span className="tag amber">建议结构</span>
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
                  <input style={{ flex: 1 }} value={p.title ?? ''} onChange={(e) => updatePlan({ title: e.target.value })} />
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
            <button className="ghost" onClick={() => setPhase('plan')}>← 返回调整方案</button>
          )}
        </div>
      </div>
    </div>
  );
};
