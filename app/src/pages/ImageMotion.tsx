// 功能A：让图片动起来
// 上传 → 框选 → 选效果（分类→具体）→ 实时预览 → 排序/节奏 → 云端生成 MP4
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from '../../../src/spec/types';
import { A_EFFECTS, AEffectCategory, AItem, AspectKey, ASPECTS, buildSpecA } from '../lib/spec-builder-a';
import { PreviewPlayer } from '../components/PreviewPlayer';
import { useCloudRender } from '../lib/useCloudRender';

interface ImageState { dataUrl: string; w: number; h: number }

let itemSeq = 0;

// 云端渲染的四个阶段，用于在生成弹窗里显示明确进度
const EXPORT_STEPS = [
  { key: 'uploading', label: '上传图片素材到云端' },
  { key: 'dispatching', label: '提交渲染任务' },
  { key: 'waiting', label: '云端渲染中' },
  { key: 'downloading', label: '下载 MP4' },
] as const;

export const ImageMotion: React.FC = () => {
  const [image, setImage] = useState<ImageState | null>(null);
  const [aspect, setAspect] = useState<AspectKey>('16:9');
  const [items, setItems] = useState<AItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState<AEffectCategory>('强调');
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportStarted, setExportStarted] = useState(false);
  const [exportAspect, setExportAspect] = useState<AspectKey>('16:9');
  const canvasRef = useRef<HTMLDivElement>(null);
  const cloud = useCloudRender();

  // 弹窗打开时锁定页面滚动，关闭后回到原来的滚动位置
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

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const LOW_RES = 1280;

  const onUpload = (f: File) => {
    if (f.size > MAX_SIZE) {
      alert('图片超过 10MB，请换一张小一点的图片。');
      return;
    }
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

  // 画布坐标（显示）→ 原图坐标
  const toImageCoords = (clientX: number, clientY: number) => {
    const wrap = canvasRef.current!;
    const rect = wrap.getBoundingClientRect();
    const scaleX = image!.w / rect.width;
    const scaleY = image!.h / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
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
    if (r.w < 12 || r.h < 12) return; // 误触
    const id = `item-${++itemSeq}`;
    setItems((prev) => [...prev, {
      id, region: r, effect: null,
      speed: 'normal', intensity: 'normal', direction: 'up',
      relation: prev.length === 0 ? 'after' : 'after', isCamera: false,
    }]);
    setSelected(id);
  };

  const updateItem = (id: string, patch: Partial<AItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selected === id) setSelected(null);
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

  const spec = useMemo(() => {
    if (!image) return null;
    const ready = items.filter((i) => i.effect);
    if (!ready.length) return null;
    return buildSpecA({ imageSrc: image.dataUrl, imageW: image.w, imageH: image.h, aspect, items: ready });
  }, [image, items, aspect]);

  const effectOf = (action: string | null) => {
    if (!action) return null;
    for (const list of Object.values(A_EFFECTS)) {
      const found = list.find((e) => e.action === action);
      if (found) return found;
    }
    return null;
  };

  // ---------- 未上传：上传页 ----------
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

  // 画布显示：宽度撑满左栏可用空间（不超过原图宽度，避免把小图放大模糊），
  // 高度由 aspect-ratio 跟随；长图不强行缩进一屏，交给外层容器纵向滚动查看。
  const isTall = image.h > image.w * 1.6;
  // 区域框用百分比定位：画布随窗口缩放时框选位置仍然准确
  const px = (v: number) => `${(v / image.w) * 100}%`;
  const py = (v: number) => `${(v / image.h) * 100}%`;

  // 生成高清 MP4：先选输出比例，再发起云端渲染。
  // 弹窗不再点击即关——进度、成功、失败全部留在弹窗里，保证当前视口一定看得到反馈。
  const startExport = () => {
    const ready = items.filter((i) => i.effect);
    if (!image || !ready.length) return;
    setAspect(exportAspect); // 后续预览与导出比例一致
    const s = buildSpecA({ imageSrc: image.dataUrl, imageW: image.w, imageH: image.h, aspect: exportAspect, items: ready });
    setExportStarted(true);
    cloud.run({ spec: s, imageDataUrl: image.dataUrl, fileName: `motion-a-${Date.now()}.mp4` });
  };

  const exportRunning = exportStarted && cloud.phase !== 'done' && cloud.phase !== 'error';
  const closeExport = () => { setShowExport(false); setExportStarted(false); };

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
        {/* 画布 */}
        <div>
          {/* 下一步引导：未框选时明显提示；已框选后弱化为状态提示 */}
          {items.length === 0 ? (
            <div className="card" style={{ marginBottom: 12, borderColor: 'var(--accent)', background: 'rgba(232,163,61,0.08)' }}>
              <b style={{ fontSize: 15 }}>下一步：在图片上拖动，框选你想让它动起来的区域</b>
              <div className="muted" style={{ marginTop: 4 }}>例如：标题、按钮、文字、卡片或其他想强调的部分{isTall ? '。图片较长，可以上下滚动查看整张图' : ''}</div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 12, padding: '10px 16px' }}>
              <span className="muted">{sel && !sel.effect ? '已框选区域 → 在右侧为它选择一个动画效果' : '继续在图片上框选其他区域，或点击右侧「预览」查看效果'}</span>
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
                  onClick={(e) => { e.stopPropagation(); setSelected(it.id); }}
                >
                  <span className="idx">{idx + 1}</span>
                </div>
              ))}
              {drawing && (
                <div className="draw-box" style={{
                  left: px(Math.min(drawing.x0, drawing.x1)),
                  top: py(Math.min(drawing.y0, drawing.y1)),
                  width: px(Math.abs(drawing.x1 - drawing.x0)),
                  height: py(Math.abs(drawing.y1 - drawing.y0)),
                }} />
              )}
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>在图片上拖动框选想让它动的区域；点击已有区域可调整效果。</p>
        </div>

        {/* 右侧面板 */}
        <div className="col" style={{ gap: 14 }}>
          {sel ? (
            <div className="card col" style={{ gap: 12 }}>
              <b>动画设置 · 区域 {items.findIndex((i) => i.id === sel.id) + 1}</b>
              <div className="row">
                {(Object.keys(A_EFFECTS) as AEffectCategory[]).map((c) => (
                  <button key={c} style={{ padding: '4px 10px', fontSize: 13 }} className={category === c ? 'primary' : 'ghost'} onClick={() => setCategory(c)}>{c}</button>
                ))}
              </div>
              <div className="effect-grid">
                {A_EFFECTS[category].map((e) => (
                  <button key={e.action}
                    className={`effect-btn ${sel.effect === e.action ? 'active' : ''}`}
                    onClick={() => updateItem(sel.id, { effect: e.action, isCamera: !!e.camera })}>
                    {e.label}
                  </button>
                ))}
              </div>
              {effectOf(sel.effect)?.needsDir && (
                <div className="row">
                  <span className="muted">方向</span>
                  {(['up', 'down', 'left', 'right'] as const).map((d) => (
                    <button key={d} style={{ padding: '4px 10px', fontSize: 13 }} className={sel.direction === d ? 'primary' : 'ghost'}
                      onClick={() => updateItem(sel.id, { direction: d })}>
                      {{ up: '上', down: '下', left: '左', right: '右' }[d]}
                    </button>
                  ))}
                </div>
              )}
              <div className="row">
                <span className="muted">速度</span>
                <span className="seg">
                  {(['slow', 'normal', 'fast'] as const).map((s) => (
                    <button key={s} className={sel.speed === s ? 'active' : ''} onClick={() => updateItem(sel.id, { speed: s })}>
                      {{ slow: '慢', normal: '正常', fast: '快' }[s]}
                    </button>
                  ))}
                </span>
                <span className="muted">强度</span>
                <span className="seg">
                  {(['light', 'normal', 'strong'] as const).map((s) => (
                    <button key={s} className={sel.intensity === s ? 'active' : ''} onClick={() => updateItem(sel.id, { intensity: s })}>
                      {{ light: '轻', normal: '正常', strong: '明显' }[s]}
                    </button>
                  ))}
                </span>
              </div>
              <button className="ghost" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => removeItem(sel.id)}>删除此区域</button>
            </div>
          ) : (
            <div className="card muted">先框选一个区域，或点击画布上已有区域进行设置。</div>
          )}

          {/* 动画列表（顺序 + 先后关系） */}
          <div className="card col" style={{ gap: 10 }}>
            <b>动画列表</b>
            {items.length === 0 && <span className="muted">还没有动画。框选区域后在这里调整顺序。</span>}
            <div className="anim-list">
              {items.map((it, idx) => (
                <div key={it.id} className="anim-item" style={{ borderColor: selected === it.id ? 'var(--accent)' : undefined }}>
                  <div className="head">
                    <span className="num">{idx + 1}</span>
                    <span style={{ flex: 1 }}>{effectOf(it.effect)?.label ?? '未设置效果'}</span>
                    <button className="ghost" style={{ padding: '2px 6px' }} onClick={() => moveItem(it.id, -1)}>↑</button>
                    <button className="ghost" style={{ padding: '2px 6px' }} onClick={() => moveItem(it.id, 1)}>↓</button>
                  </div>
                  {idx > 0 && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="seg">
                        {(['same', 'after', 'later'] as const).map((r) => (
                          <button key={r} className={it.relation === r ? 'active' : ''} onClick={() => updateItem(it.id, { relation: r })}>
                            {{ same: '同时', after: '接着', later: '稍后' }[r]}
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

      {/* 预览弹层 */}
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

      {/* 生成弹层：选比例 → 就地在弹窗内显示进度/成功/失败（点击「开始生成」绝不静默） */}
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
