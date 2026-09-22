// 功能A：让图片动起来
// 上传 → 框选 → 选效果（分类→具体）→ 实时预览 → 排序/节奏 → 云端生成 MP4
import React, { useMemo, useRef, useState } from 'react';
import type { Region } from '../../../src/spec/types';
import { A_EFFECTS, AEffectCategory, AItem, AspectKey, ASPECTS, buildSpecA } from '../lib/spec-builder-a';
import { PreviewPlayer } from '../components/PreviewPlayer';
import { useCloudRender } from '../lib/useCloudRender';

interface ImageState { dataUrl: string; w: number; h: number }

let itemSeq = 0;

export const ImageMotion: React.FC = () => {
  const [image, setImage] = useState<ImageState | null>(null);
  const [aspect, setAspect] = useState<AspectKey>('16:9');
  const [items, setItems] = useState<AItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState<AEffectCategory>('强调');
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cloud = useCloudRender();

  const sel = items.find((i) => i.id === selected) ?? null;

  const onUpload = (f: File) => {
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
        <h2 className="page-title">让图片动起来</h2>
        <p className="page-sub">上传一张已经完成构图的图片，框选局部区域，让它们按顺序动起来。</p>
        <div className="card" style={{ maxWidth: 560, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
          <p className="muted">支持 JPG / PNG，建议 ≥1280px，单张 ≤10MB</p>
          <label>
            <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
            <span className="tag amber" style={{ cursor: 'pointer', padding: '10px 24px', fontSize: 15 }}>选择图片</span>
          </label>
          <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
            <span className="muted">画布比例：</span>
            {(Object.keys(ASPECTS) as AspectKey[]).map((k) => (
              <button key={k} className={aspect === k ? 'primary' : ''} onClick={() => setAspect(k)}>{k}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const dispW = 920;
  const dispScale = dispW / image.w;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row">
          <b>让图片动起来</b>
          {(Object.keys(ASPECTS) as AspectKey[]).map((k) => (
            <button key={k} className={aspect === k ? 'primary' : 'ghost'} style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setAspect(k)}>{k}</button>
          ))}
          <button className="ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => { setImage(null); setItems([]); }}>换图片</button>
        </div>
        <div className="row">
          <button className="blue" disabled={!spec} onClick={() => setShowPreview(true)}>预览</button>
          <button className="primary" disabled={!spec || cloud.phase === 'waiting' || cloud.phase === 'dispatching' || cloud.phase === 'uploading'}
            onClick={() => spec && cloud.run({ spec, imageDataUrl: image.dataUrl, fileName: `motion-a-${Date.now()}.mp4` })}>
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
          <div
            ref={canvasRef}
            className="canvas-wrap"
            style={{ width: dispW, cursor: 'crosshair' }}
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
                  left: it.region.x * dispScale, top: it.region.y * dispScale,
                  width: it.region.w * dispScale, height: it.region.h * dispScale,
                }}
                onClick={(e) => { e.stopPropagation(); setSelected(it.id); }}
              >
                <span className="idx">{idx + 1}</span>
              </div>
            ))}
            {drawing && (
              <div className="draw-box" style={{
                left: Math.min(drawing.x0, drawing.x1) * dispScale,
                top: Math.min(drawing.y0, drawing.y1) * dispScale,
                width: Math.abs(drawing.x1 - drawing.x0) * dispScale,
                height: Math.abs(drawing.y1 - drawing.y0) * dispScale,
              }} />
            )}
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
    </div>
  );
};
