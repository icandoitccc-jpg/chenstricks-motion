// 功能A spec 构建：画布框选区域 + 效果配置 + 顺序/节奏 → AnimSpec
// 坐标约定：区域以原图像素记录；画布尺寸按输出比例；底图 contain 居中（完整显示不裁切，不足区域留背景）→ 区域副本按同一 scale/offset 映射。
import type { ActionName, AnimSpec, Region, SpecAction, SpecElement } from '../../../src/spec/types';

export type AspectKey = '16:9' | '9:16' | '3:4';
export const ASPECTS: Record<AspectKey, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '3:4': { w: 1440, h: 1920 },
};

export type AEffectCategory = '出现' | '强调' | '标记' | '镜头' | '消失';

// 功能A 对光栅图开放的效果（slideIn/move/slideOut 因原图残留不开放；typeIn 不适用）
export const A_EFFECTS: Record<AEffectCategory, { label: string; action: ActionName; needsDir?: boolean; camera?: boolean }[]> = {
  出现: [
    { label: '淡入', action: 'fadeIn' },
    { label: '弹出', action: 'popIn' },
    { label: '展开', action: 'reveal', needsDir: true },
  ],
  强调: [
    { label: '弹一下', action: 'pulse' },
    { label: '放大一下', action: 'scaleEmphasis' },
    { label: '轻震', action: 'shake' },
    { label: '高亮', action: 'highlight' },
  ],
  标记: [
    { label: '划线', action: 'underlineDraw' },
    { label: '圈出来', action: 'circleMark' },
  ],
  镜头: [
    { label: '推近', action: 'cameraPush', camera: true },
    { label: '拉远', action: 'cameraPull', camera: true },
    { label: '聚焦', action: 'focus', camera: true },
  ],
  消失: [{ label: '淡出', action: 'fadeOut' }],
};

export interface AItem {
  id: string;
  region: Region;          // 原图坐标
  effect: ActionName | null;
  speed: 'slow' | 'normal' | 'fast';
  intensity: 'light' | 'normal' | 'strong';
  direction: 'up' | 'down' | 'left' | 'right';
  relation: 'same' | 'after' | 'later'; // 与上一项：同时/接着/稍后
  isCamera: boolean;
}

export interface FitMap { scale: number; offsetX: number; offsetY: number }

// contain：完整显示原图，不裁切；不足区域留在画布背景中
export function fitMap(iw: number, ih: number, cw: number, ch: number): FitMap {
  const scale = Math.min(cw / iw, ch / ih);
  return { scale, offsetX: (cw - iw * scale) / 2, offsetY: (ch - ih * scale) / 2 };
}

const SPEED_FRAMES: Record<string, number> = { slow: 27, normal: 18, fast: 11 };
const CAMERA_FRAMES: Record<string, number> = { slow: 30, normal: 22, fast: 14 };

export function buildSpecA(opts: {
  imageSrc: string;           // 预览 dataURL；云端 uploads/ 路径
  imageW: number;
  imageH: number;
  aspect: AspectKey;
  items: AItem[];
  fps?: number;
}): AnimSpec {
  const { imageSrc, imageW, imageH, aspect, items } = opts;
  const fps = opts.fps ?? 30;
  const { w: cw, h: ch } = ASPECTS[aspect];
  const map = fitMap(imageW, imageH, cw, ch);

  const elements: SpecElement[] = [
    { id: 'base', kind: 'image', x: 0, y: 0, w: cw, h: ch, src: imageSrc, imageW, imageH, fit: 'contain', z: 0 },
  ];
  const actions: SpecAction[] = [];

  const toCanvas = (r: Region) => ({
    x: Math.round(r.x * map.scale + map.offsetX),
    y: Math.round(r.y * map.scale + map.offsetY),
    w: Math.round(r.w * map.scale),
    h: Math.round(r.h * map.scale),
  });

  let cursor = Math.round(0.4 * fps); // 开场留 0.4s
  let prevAt = cursor;
  items.forEach((it, idx) => {
    if (!it.effect) return;
    const elId = `r${idx}`;
    const cr = toCanvas(it.region);
    const isCam = it.isCamera;
    if (!isCam) {
      elements.push({
        id: elId, kind: 'imageRegion',
        x: cr.x, y: cr.y, w: cr.w, h: cr.h,
        src: imageSrc, imageW, imageH, region: it.region, z: 2,
      });
    }
    const dur = (isCam ? CAMERA_FRAMES : SPEED_FRAMES)[it.speed];
    const at = idx === 0 ? cursor
      : it.relation === 'same' ? prevAt
      : it.relation === 'later' ? cursor + Math.round(0.6 * fps)
      : cursor;
    if (it.effect === 'cameraPush' || it.effect === 'focus') {
      actions.push({ action: it.effect, target: 'camera', at, duration: dur, region: cr, dim: 0.5, speed: it.speed });
    } else if (it.effect === 'cameraPull') {
      actions.push({ action: 'cameraPull', target: 'camera', at, duration: dur, speed: it.speed });
    } else {
      actions.push({
        action: it.effect, target: elId, at, duration: dur,
        speed: it.speed, intensity: it.intensity,
        direction: it.direction,
        ...(it.effect === 'highlight' ? { color: 'rgba(232,163,61,0.55)' } : {}),
        ...(it.effect === 'underlineDraw' || it.effect === 'circleMark' ? { color: '#5EA8FF' } : {}),
      });
    }
    prevAt = at;
    cursor = Math.max(cursor, at + dur); // 同时项不推迟后续，除非它结束更晚
  });

  const durationInFrames = cursor + Math.round(1.2 * fps); // 结尾停留 1.2s
  return {
    version: 1,
    meta: { width: cw, height: ch, fps, durationInFrames, title: '让图片动起来' },
    elements,
    actions,
  };
}
