// 功能A：让图片动起来
// 上传 → 框选 → 动作序列（每个区域一串动画）→ 实时预览 → 云端生成 MP4
// V2 数据模型：Region = 动作序列（多 Action）。引擎层不变。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from '../../../src/spec/types';
import {
  A_EFFECTS, AAction, AEffectCategory, AItem, AspectKey, ASPECTS,
  buildSpecA, effectByName, Hold, PRESETS, Relation, Speed, Intensity,
} from '../lib/spec-builder-a';
import { PreviewPlayer } from '../components/PreviewPlayer';
import { useCloudRender } from '../lib/useCloudRender';

interface ImageState { dataUrl: string; w: number; h: number }

let itemSeq = 0;
let actionSeq = 0;
const newActionId = () => `a-${actionSeq++}`;

const EXPORT_STEPS = [
  { key: 'uploading', label: '上传图片素材到云端' },
  { key: 'dispatching', label: '提交渲染任务' },
  { key: 'waiting', label: '云端渲染中' },
  { key: 'downloading', label: '下载 MP4' },
] as const;

const HOLD_LABEL: Record<Hold, string> = { none: '无', short: '短', long: '长' };
const RELATION_LABEL: Record<Relation, string> = { same: '同时', after: '接着', later: '稍后' };
const SPEED_LABEL: Record<Speed, string> = { slow: '慢', normal: '正常', fast: '快' };
const INTENSITY_LABEL: Record<Intensity, string> = { light: '轻', normal: '正常', strong: '明显' };

export const ImageMotion: React.FC = () => {
  const [image, setImage] = useState<ImageState | null>(null);
  const [aspect, setAspect] = useState<AspectKey>('16:9');
  const [items, setItems] = useState<AItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState<AEffectCategory>('出现');
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportStarted, setExportStarted] = useState(false);
  const [exportAspect, setExportAspect] = useState<AspectKey>('16:9');
  const canvasRef = useRef<HTMLDivElement>(null);
  const cloud = useCloudRender();

  const modalOpen = showPreview || showExport;
  useEffect(() => {
    if (!modalOpen) return;
    const y = window.scrollY;
    document.documentElement.classList.add('cm-scroll-locked');
    document.body.classList.add('cm-scroll-locked');
    return () => {
      document.documentElement.classList.remove('cm-scroll-locked');
      document.body.classList.remove('cm-scroll-locked');
      window.scrollTo(0, y);
    };
  }, [modalOpen]);

  const sel = items.find((i) => i.id === selected) ?? null;
  const MAX_SIZE = 10 * 1024 * 1024;
  const LOW_RES = 1280;

  const onUpload = (f: File) => {
    if (f.size > MAX_SIZE) { alert('图片超过 10MB，请换一张小一点的图片。'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage({ dataUrl: reader.result as string, w: img.naturalWidth, h: img.naturalHeight });
        setItems([]);
        setSelected(null);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  };

  const lowRes = image ? Math.max(image.w, image.h) < LOW_RES : false;

  const toImageCoords = (clientX: number, clientY: number) => {
    const wrap = canvasRef.current!;
    const rect = wrap.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (image!.w / rect.width),
      y: (clientY - rect.top) * (image!.h / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!image || (e.target as HTMLElement).closest('.region-box')) return;
    const p = toImageCoords(e.clientX, e.clientY);
    setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const p = toImageCoords(e.clientX, e.clientY);
    setDrawing({ ...drawing, x1: p.x, y1: p.y });
  };
  const onMouseUp = () => {
    if (!drawing) return;
    const r: Region = {
      x: Math.round(Math.max(0, Math.min(drawing.x0, drawing.x1))),
      y: Math.round(Math.max(0, Math.min(drawing.y0, drawing.y1))),
      w: Math.round(Math.abs(drawing.x1 - drawing.x0)),
      h: Math.round(Math.abs(drawing.y1 - drawing.y0)),
    };
    setDrawing(null);
    if (r.w < 12 || r.h < 12) return;
    const id = `item-${++itemSeq}`;
    setItems((prev) => [...prev, {
      id, region: r,
      speed: 'normal', intensity: 'normal', direction: 'up',
      relation: 'after',
      actions: [],
    }]);
    setSelected(id);
    setEditingActionId(null);
  };

  const updateItem = (id: string, patch: Partial<AItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selected === id) { setSelected(null); setEditingActionId(null); }
  };
  const moveItem = (id: string, dir: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  };

  const addActionToChain = (itemId: string, actionName: AAction['action']) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const newAct: AAction = { id: newActionId(), action: actionName };
    updateItem(itemId, { actions: [...item.actions, newAct] });
    setEditingActionId(newAct.id);
  };
  const updateAction = (itemId: string, actionId: string, patch: Partial<AAction>) => {
    setItems((prev) => prev.map((i) => i.id !== itemId ? i : {
      ...i, actions: i.actions.map((a) => a.id === actionId ? { ...a, ...patch } : a),
    }));
  };
  const removeAction = (itemId: string, actionId: string) => {
    setItems((prev) => prev.map((i) => i.id !== itemId ? i : {
      ...i, actions: i.actions.filter((a) => a.id !== actionId),
    }));
    if (editingActionId === actionId) setEditingActionId(null);
  };
  const moveActionInChain = (itemId: string, actionId: string, dir: -1 | 1) => {
    setItems((prev) => prev.map((i) => {
      if (i.id !== itemId) return i;
      const arr = [...i.actions];
      const idx = arr.findIndex((a) => a.id === actionId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= arr.length) return i;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...i, actions: arr };
    }));
  };
  const applyPreset = (itemId: string, presetIdx: number) => {
    const p = PRESETS[presetIdx];
    const acts: AAction[] = p.actions.map((a) => ({ id: newActionId(), ...a }));
    updateItem(itemId, { actions: acts });
    setEditingActionId(acts[acts.length - 1]?.id ?? null);
  };

  const spec = useMemo(() => {
    if (!image) return null;
    const ready = items.filter((i) => i.actions.length > 0);
    if (!ready.length) return null;
    return buildSpecA({ imageSrc: image.dataUrl, imageW: image.w, imageH: image.h, aspect, items: ready });
  }, [image, items, aspect]);

  if (!image) {
    return (
      <div>
        <div className="row" style={{ marginBottom: 6 }}>
          <a className="ghost" href="#/" style={{ textDecoration: 'none', padding: '4px 12px', fontSize: 13 }}>← 返回首页</a>
        </div>
        <h2 className="page-title">让图片动起来</h2>
        <p className="page-sub">上传一张已经完成构图的图片，框选局部区域，让它们按顺序动起来。</p>
        <div className="card" style={{ maxWidth: 560, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
          <p className="muted">支持 JPG / PNG，横图、竖图、方图、截图都可以，单张 ≤10MB</p>
          <p className="muted" style={{ fontSize: 12, opacity: 0.7 }}>图片越清晰，导出的视频越清晰</p>
          <label>
            <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            <span className="tag amber" style={{ cursor: 'pointer', padding: '10px 24px', fontSize: 15 }}>选择图片</span>
          </label>
        </div>
      </div>
    );
  }

  const isTall = image.h > image.w * 1.6;
  const px = (v: number) => `${(v / image.w) * 100}%`;
  const py = (v: number) => `${(v / image.h) * 100}%`;

  const startExport = () => {
    const ready = items.filter((i) => i.actions.length > 0);
    if (!image || !ready.length) return;
    setAspect(exportAspect);
    const s = buildSpecA({ imageSrc: image.dataUrl, imageW: image.w, imageH: image.h, aspect: exportAspect, items: ready });
    setExportStarted(true);
    cloud.run({ spec: s, imageDataUrl: image.dataUrl, fileName: `motion-a-${Date.now()}.mp4` });
  };

  const exportRunning = exportStarted && cloud.phase !== 'done' && cloud.phase !== 'error';
  const closeExport = () => { setShowExport(false); setExportStarted(false); };

  const chainSummary = (it: AItem): string => {
    if (it.actions.length === 0) return '未设置动作';
    const labels = it.actions.map((a) => effectByName(a.action)?.label ?? a.action);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} → ${labels[1]}`;
    return `${labels[0]} → ${labels[1]} +${labels.length - 2}`;
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row">
          <a className="ghost" href="#/" style={{ textDecoration: 'none', padding: '4px 12px', fontSize: 13 }}>← 返回首页</a>
          <b>让图片动起来</b>
          <button className="ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => { setImage(null); setItems([]); }}>换图片</button>
          {lowRes && <span className="tag" style={{ fontSize: 12 }}>源图分辨率较低，最终导出可能不够清晰</span>}
        </div>
        <div className="row">
          <button className="blue" disabled={!spec} onClick={() => setShowPreview(true)}>预览</button>
          <button className="primary" disabled={!spec || exportRunning || cloud.phase === 'waiting' || cloud.phase === 'dispatching' || cloud.phase === 'uploading'}
            onClick={() => { setExportAspect(aspect); setExportStarted(false); setShowExport(true); }}>
            生成高清 MP4
          </button>
        </div>
      </div>

      {cloud.phase !== 'idle' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row">
            <span className={cloud.phase === 'error' ? 'tag' : 'tag green'}>{cloud.phase === 'error' ? '出错' : cloud.phase === 'done' ? '完成' : '云端'}</span>
            <span className="muted">{cloud.message}</span>
            {(cloud.phase === 'done' || cloud.phase === 'error') && <button className="ghost" onClick={cloud.reset}>知道了</button>}
          </div>
          {(cloud.phase === 'waiting' || cloud.phase === 'dispatching' || cloud.phase === 'uploading' || cloud.phase === 'downloading') && (
            <div className="bar" style={{ marginTop: 10 }}><div style={{ width: '60%' }} /></div>
          )}
        </div>
      )}

      <div className="a-layout">
        <div>
          {items.length === 0 ? (
            <div className="card" style={{ marginBottom: 12, borderColor: 'var(--accent)', background: 'rgba(232,163,61,0.08)' }}>
              <b style={{ fontSize: 15 }}>下一步：在图片上拖动，框选你想让它动起来的区域</b>
              <div className="muted" style={{ marginTop: 4 }}>例如：标题、按钮、文字、卡片或其他想强调的部分{isTall ? '。图片较长，可以上下滚动查看整张图' : ''}</div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 12, padding: '10px 16px' }}>
              <span className="muted">
                {sel && sel.actions.length === 0
                  ? '已框选区域 → 在右侧为它添加动作，或先试一个预设序列'
                  : '继续在图片上框选其他区域，或点击右侧「预览」查看效果'}
              </span>
            </div>
          )}
          <div className="canvas-scroll" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            <div
              ref={canvasRef}
              className="canvas-wrap"
              style={{
                width: '100%', maxWidth: image.w,
                aspectRatio: `${image.w} / ${image.h}`, cursor: 'crosshair',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <img src={image.dataUrl} alt="" />
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className={`region-box ${selected === it.id ? 'selected' : ''}`}
                  style={{
                    left: px(it.region.x), top: py(it.region.y),
                    width: px(it.region.w), height: py(it.region.h),
                  }}
                  onClick={(e) => { e.stopPropagation(); setSelected(it.id); setEditingActionId(null); }}
                >
                  <span className="idx">{idx + 1}</span>
                </div>
              ))}
              {drawing && (
                <div className="draw-box" style={{
                  left: px(Math.min(drawing.x0, drawing.x1)),
                  top: py(Math.min(drawing.y0, drawing.y1)),
                  width: px(Math.abs(drawing.x1 - drawing.x0)),
                  height: px(Math.abs(drawing.y1 - drawing.y0)),
                }} />
              )}
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>在图片上拖动框选想让它动的区域；点击已有区域可在右侧编辑动作序列。</p>
        </div>

        <div className="col" style={{ gap: 14 }}>
          {sel ? (
            <div className="card col" style={{ gap: 12 }}>
              <b>动作序列 · 区域 {items.findIndex((i) => i.id === sel.id) + 1}</b>

              <div className="row">
                <span className="muted" style={{ fontSize: 12 }}>速度</span>
                <span className="seg">
                  {(['slow', 'normal', 'fast'] as const).map((s) => (
                    <button key={s} className={sel.speed === s ? 'active' : ''} onClick={() => updateItem(sel.id, { speed: s })}>
                      {SPEED_LABEL[s]}
                    </button>
                  ))}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>强度</span>
                <span className="seg">
                  {(['light', 'normal', 'strong'] as const).map((s) => (
                    <button key={s} className={sel.intensity === s ? 'active' : ''} onClick={() => updateItem(sel.id, { intensity: s })}>
                      {INTENSITY_LABEL[s]}
                    </button>
                  ))}
                </span>
              </div>

              {sel.actions.length === 0 ? (
                <div className="card muted" style={{ padding: '10px 12px', fontSize: 13 }}>
                  这个区域还没有动作。在下面选一个效果，或直接用预设序列。
                </div>
              ) : (
                <div className="col" style={{ gap: 6 }}>
                  {sel.actions.map((a, idx) => {
                    const e = effectByName(a.action);
                    const editing = editingActionId === a.id;
                    return (
                      <div key={a.id} className="card" style={{ padding: '8px 10px', gap: 6, background: editing ? 'rgba(232,163,61,0.08)' : undefined, borderColor: editing ? 'var(--accent)' : undefined }}>
                        <div className="row" style={{ gap: 6 }}>
                          <span style={{ width: 18, height: 18, borderRadius: 9, background: 'var(--accent)', color: '#1a1408', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
                          <span style={{ flex: 1, fontWeight: 600 }}>{e?.label ?? a.action}</span>
                          <span className="seg">
                            {(['none', 'short', 'long'] as const).map((h) => (
                              <button key={h} className={a.hold === h ? 'active' : ''} title={`保持${HOLD_LABEL[h]}`}
                                onClick={() => updateAction(sel.id, a.id, { hold: h })}>
                                {HOLD_LABEL[h]}
                              </button>
                            ))}
                          </span>
                          <button className="ghost" style={{ padding: '0 6px' }} onClick={() => moveActionInChain(sel.id, a.id, -1)}>↑</button>
                          <button className="ghost" style={{ padding: '0 6px' }} onClick={() => moveActionInChain(sel.id, a.id, 1)}>↓</button>
                          <button className="ghost" style={{ padding: '0 8px', color: 'var(--danger)' }} onClick={() => removeAction(sel.id, a.id)}>×</button>
                        </div>
                        {editing && (
                          <div className="col" style={{ gap: 6 }}>
                            <div className="row" style={{ gap: 6 }}>
                              <span className="muted" style={{ fontSize: 12 }}>强度</span>
                              <span className="seg">
                                {(['light', 'normal', 'strong'] as const).map((s) => (
                                  <button key={s} className={a.intensity === s ? 'active' : ''} onClick={() => updateAction(sel.id, a.id, { intensity: s })}>
                                    {INTENSITY_LABEL[s]}
                                  </button>
                                ))}
                              </span>
                            </div>
                            {e?.needsDir && (
                              <div className="row" style={{ gap: 6 }}>
                                <span className="muted" style={{ fontSize: 12 }}>方向</span>
                                <span className="seg">
                                  {(['up', 'down', 'left', 'right'] as const).map((d) => (
                                    <button key={d} className={a.direction === d ? 'active' : ''} onClick={() => updateAction(sel.id, a.id, { direction: d })}>
                                      {{ up: '上', down: '下', left: '左', right: '右' }[d]}
                                    </button>
                                  ))}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <button className="ghost" style={{ padding: '0 6px', fontSize: 11, alignSelf: 'flex-end' }}
                          onClick={() => setEditingActionId(editing ? null : a.id)}>
                          {editing ? '收起' : '调整'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="col" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>添加动作：</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  {(Object.keys(A_EFFECTS) as AEffectCategory[]).map((c) => (
                    <button key={c} className={addingCategory === c ? 'primary' : 'ghost'} style={{ padding: '3px 9px', fontSize: 12 }}
                      onClick={() => setAddingCategory(c)}>{c}</button>
                  ))}
                </div>
                <div className="effect-grid">
                  {A_EFFECTS[addingCategory].map((e) => (
                    <button key={e.action} className="effect-btn"
                      onClick={() => addActionToChain(sel.id, e.action)}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>预设序列（一键替换当前区域）：</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {PRESETS.map((p, i) => (
                    <button key={p.name} className="ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => applyPreset(sel.id, i)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <button className="ghost" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => removeItem(sel.id)}>删除此区域</button>
            </div>
          ) : (
            <div className="card muted">先框选一个区域，或点击画布上已有区域进行设置。</div>
          )}

          <div className="card col" style={{ gap: 10 }}>
            <b>动画列表</b>
            {items.length === 0 && <span className="muted">还没有动画。框选区域后在这里调整顺序。</span>}
            <div className="anim-list">
              {items.map((it, idx) => (
                <div key={it.id} className="anim-item" style={{ borderColor: selected === it.id ? 'var(--accent)' : undefined }}>
                  <div className="head">
                    <span className="num">{idx + 1}</span>
                    <span style={{ flex: 1 }}>{chainSummary(it)}</span>
                    <button className="ghost" style={{ padding: '2px 6px' }} onClick={() => moveItem(it.id, -1)}>↑</button>
                    <button className="ghost" style={{ padding: '2px 6px' }} onClick={() => moveItem(it.id, 1)}>↓</button>
                  </div>
                  {idx > 0 && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="seg">
                        {(['same', 'after', 'later'] as const).map((r) => (
                          <button key={r} className={it.relation === r ? 'active' : ''} onClick={() => updateItem(it.id, { relation: r })}>
                            {RELATION_LABEL[r]}
                          </button>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showPreview && spec && (
        <div className="modal-mask" onClick={() => setShowPreview(false)}>
          <div style={{ width: 900, maxWidth: '94vw' }} onClick={(e) => e.stopPropagation()}>
            <PreviewPlayer spec={spec} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setShowPreview(false)}>关闭预览</button>
            </div>
          </div>
        </div>
      )}

      {showExport && (() => {
        const cur = EXPORT_STEPS.findIndex((s) => s.key === cloud.phase);
        const finished = cloud.phase === 'done';
        return (
          <div className="modal-mask" onClick={() => { if (!exportRunning) closeExport(); }}>
            <div className="glass col" style={{ width: 440, maxWidth: '92vw', gap: 14, padding: 22 }}
              onClick={(e) => e.stopPropagation()}>
              <b style={{ fontSize: 16 }}>生成高清 MP4</b>

              {!exportStarted ? (
                <>
                  <span className="muted">选择最终视频的画布比例（原图会完整显示，不裁切；不足部分留背景色）：</span>
                  <div className="col" style={{ gap: 8 }}>
                    {(Object.keys(ASPECTS) as AspectKey[]).map((k) => (
                      <button key={k} className={exportAspect === k ? 'primary' : 'ghost'} style={{ textAlign: 'left', padding: '10px 14px' }}
                        onClick={() => setExportAspect(k)}>
                        {k}{ { '16:9': ' 横屏', '9:16': ' 竖屏', '3:4': ' 竖版' }[k] }
                        <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{ASPECTS[k].w}×{ASPECTS[k].h}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : cloud.phase === 'error' ? (
                <>
                  <span className="muted">输出比例 {exportAspect} · {ASPECTS[exportAspect].w}×{ASPECTS[exportAspect].h}</span>
                  <div style={{ border: '1px solid var(--danger)', background: 'rgba(248,113,113,0.12)', borderRadius: 10, padding: '12px 14px' }}>
                    <b style={{ color: 'var(--danger)' }}>生成失败</b>
                    <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {cloud.message || '未知错误，请到 GitHub Actions 查看日志'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <span className="muted">输出比例 {exportAspect} · {ASPECTS[exportAspect].w}×{ASPECTS[exportAspect].h}</span>
                  <div className="col" style={{ gap: 0 }}>
                    {EXPORT_STEPS.map((s, i) => {
                      const st = finished || i < cur ? 'done' : i === cur ? 'doing' : '';
                      return (
                        <div key={s.key} className={`export-step ${st}`}>
                          <span className="dot">{st === 'done' ? '✓' : i + 1}</span>
                          <span>{s.label}</span>
                          {i === cur && !finished && <span className="muted" style={{ marginLeft: 'auto' }}>{cloud.message}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="bar" style={{ marginTop: 10 }}>
                    <div style={{ width: `${Math.round(((finished ? EXPORT_STEPS.length : cur + 1) / EXPORT_STEPS.length) * 100)}%` }} />
                  </div>
                  {finished && (
                    <div style={{ border: '1px solid var(--green)', background: 'rgba(74,222,128,0.12)', borderRadius: 10, padding: '12px 14px', marginTop: 6 }}>
                      <b style={{ color: 'var(--green)' }}>已完成</b>
                      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word' }}>{cloud.message}</div>
                    </div>
                  )}
                </>
              )}

              <div className="export-actions">
                {exportRunning ? (
                  <button className="ghost" disabled>生成中，请勿关闭…</button>
                ) : exportStarted ? (
                  <button className="primary" onClick={closeExport}>{finished ? '完成' : '关闭'}</button>
                ) : (
                  <>
                    <button className="ghost" onClick={closeExport}>取消</button>
                    <button className="primary" onClick={startExport}>开始生成</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
