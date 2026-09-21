// SpecComposition — 统一动画引擎：解释执行 AnimSpec。
// 预览(@remotion/player)与云端渲染(renderMedia)共用本组件，结构性保证「预览=成品」。
// 全部效果仅基于 transform / opacity / clip-path / SVG stroke / color 稳定原语。
import React, { useMemo } from 'react';
import {
  AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { AnimSpec, SpecAction, SpecElement, Region } from '../spec/types';
import { compileSpec, INTENSITY_SCALE } from '../spec/compile';
import { FONT_FAMILY } from '../fonts';

// 素材路径归一：data/blob/http 直接用；相对路径走 staticFile（云端 bundle 时解析到 public/）
function resolveSrc(src?: string): string {
  if (!src) return '';
  if (/^(data:|blob:|https?:)/.test(src)) return src;
  return staticFile(src);
}

// ---------- 确定性伪随机（手绘抖动；由 id 哈希驱动，逐帧稳定） ----------
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function seeded(seed: string, i: number): number {
  const x = Math.sin(hashStr(seed) + i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- 手绘路径生成 ----------
function wavyLinePath(x1: number, y1: number, x2: number, y2: number, seed: string, amp = 4): string {
  const segs = 12;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const off = (seeded(seed, i) - 0.5) * 2 * amp * Math.sin(t * Math.PI);
    d += ` L ${x1 + dx * t + nx * off} ${y1 + dy * t + ny * off}`;
  }
  return d;
}
function scribbleEllipsePath(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const segs = 28;
  let d = '';
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const wob = 1 + (seeded(seed, i) - 0.5) * 0.09;
    const x = cx + Math.cos(t) * rx * wob;
    const y = cy + Math.sin(t) * ry * wob;
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return d;
}

// ---------- 元素动作状态计算 ----------
interface Motion {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  clipPath?: string;
  background?: string;
  color?: string;
  typeInRatio?: number; // typeIn：显示字符比例
  hidden: boolean;
}

function dirOffset(dir: string | undefined, dist: number): { dx: number; dy: number } {
  switch (dir) {
    case 'up': return { dx: 0, dy: dist };
    case 'down': return { dx: 0, dy: -dist };
    case 'left': return { dx: dist, dy: 0 };
    case 'right': return { dx: -dist, dy: 0 };
    default: return { dx: 0, dy: dist };
  }
}

function computeMotion(
  el: SpecElement, actions: SpecAction[], frame: number, fps: number,
): Motion {
  const m: Motion = { opacity: 1, translateX: 0, translateY: 0, scale: 1, hidden: false };
  for (const a of actions) {
    const at = a.at ?? 0;
    const dur = Math.max(1, a.duration ?? 15);
    const t = (frame - at) / dur; // 归一化进度
    const k = INTENSITY_SCALE[a.intensity ?? 'normal'];
    const easeOut = (x: number) => Easing.out(Easing.cubic)(Math.min(1, Math.max(0, x)));

    switch (a.action) {
      case 'fadeIn': {
        const p = easeOut(t);
        if (t < 0) { m.opacity = 0; m.hidden = true; }
        else m.opacity = Math.min(m.opacity, p);
        break;
      }
      case 'popIn': {
        if (t < 0) { m.opacity = 0; m.scale = 0.5; m.hidden = true; break; }
        const s = spring({ frame: frame - at, fps, config: { damping: 12 + 8 * (2 - k), mass: 0.8 }, durationInFrames: dur });
        m.scale = Math.min(m.scale, interpolate(s, [0, 1], [0.5, 1]));
        m.opacity = Math.min(m.opacity, Math.min(1, s * 2));
        break;
      }
      case 'slideIn': {
        const dist = 60 * k;
        const { dx, dy } = dirOffset(a.direction, dist);
        if (t < 0) { m.opacity = 0; m.translateX = dx; m.translateY = dy; m.hidden = true; break; }
        const p = easeOut(t);
        m.translateX += dx * (1 - p);
        m.translateY += dy * (1 - p);
        m.opacity = Math.min(m.opacity, p);
        break;
      }
      case 'reveal': {
        const dir = a.direction ?? 'right';
        if (t < 0) { m.hidden = true; m.opacity = 0; break; }
        const p = easeOut(t) * 100;
        m.opacity = Math.min(m.opacity, 1);
        m.clipPath = dir === 'right' ? `inset(0 ${100 - p}% 0 0)`
          : dir === 'left' ? `inset(0 0 0 ${100 - p}%)`
          : dir === 'down' ? `inset(0 0 ${100 - p}% 0)`
          : `inset(${100 - p}% 0 0 0)`;
        break;
      }
      case 'pulse': {
        if (t < 0 || t > 1) break;
        const s = spring({ frame: frame - at, fps, config: { damping: 9, mass: 0.7 }, durationInFrames: dur });
        m.scale = Math.max(m.scale, 1 + (1 - s) * 0.18 * k * -1 + s * 0 + (1 - Math.min(1, (frame - at) / dur)) * 0.18 * k * Math.exp(-(frame - at) / (dur / 3)));
        break;
      }
      case 'scaleEmphasis': {
        if (t < 0 || t > 1) break;
        const peak = 1 + 0.1 * k;
        const p = Math.sin(Math.min(1, t) * Math.PI);
        m.scale = Math.max(m.scale, 1 + (peak - 1) * p);
        break;
      }
      case 'shake': {
        if (t < 0 || t > 1) break;
        const decay = 1 - t;
        m.translateX += Math.sin((frame - at) * 1.9) * 6 * k * decay;
        break;
      }
      case 'highlight': {
        if (t < 0) break;
        const p = easeOut(t);
        m.background = a.color ?? 'rgba(250,204,21,0.85)';
        m.clipPath = `inset(0 ${(1 - p) * 100}% 0 0 round 4px)`;
        break;
      }
      case 'move': {
        if (!a.to) break;
        const p = t < 0 ? 0 : easeOut(t);
        m.translateX += (a.to.x - el.x) * p;
        m.translateY += (a.to.y - el.y) * p;
        break;
      }
      case 'fadeOut': {
        if (t < 0) break;
        m.opacity = Math.min(m.opacity, 1 - easeOut(t));
        break;
      }
      case 'slideOut': {
        if (t < 0) break;
        const dist = 60 * k;
        const { dx, dy } = dirOffset(a.direction, dist);
        const p = easeOut(t);
        m.translateX += -dx * p;
        m.translateY += -dy * p;
        m.opacity = Math.min(m.opacity, 1 - p);
        break;
      }
      case 'typeIn': {
        if (t < 0) { m.hidden = true; m.opacity = 0; m.typeInRatio = 0; break; }
        m.opacity = 1;
        m.typeInRatio = Math.min(1, Math.max(0, t));
        break;
      }
      case 'stagger': {
        const targets = a.targets ?? [];
        const idx = targets.indexOf(el.id);
        if (idx < 0) break;
        const gap = a.staggerGap ?? Math.round(dur * 0.5);
        const myAt = at + idx * gap;
        const myT = (frame - myAt) / dur;
        if (myT < 0) { m.opacity = 0; m.translateY = 18; m.hidden = true; break; }
        const p = easeOut(myT);
        m.opacity = Math.min(m.opacity, p);
        m.translateY += 18 * (1 - p);
        break;
      }
      case 'converge': {
        if (!a.to) break;
        if (t < 0) break; // converge 前元素静止在原位
        const p = easeOut(t);
        m.translateX += (a.to.x - el.x - (el.w ?? 0) / 2) * p;
        m.translateY += (a.to.y - el.y - (el.h ?? 0) / 2) * p;
        m.opacity = Math.min(m.opacity, 1 - p * 0.7);
        break;
      }
      case 'diverge': {
        if (!a.from) break;
        if (t < 0) { m.hidden = true; m.opacity = 0; break; }
        const p = easeOut(t);
        m.translateX += (a.from.x - el.x - (el.w ?? 0) / 2) * (1 - p);
        m.translateY += (a.from.y - el.y - (el.h ?? 0) / 2) * (1 - p);
        m.opacity = Math.min(m.opacity, p);
        break;
      }
      default:
        break; // 标记/连接/镜头类在其他层处理
    }
  }
  return m;
}

// ---------- 镜头状态 ----------
interface CamState { scale: number; tx: number; ty: number; focusRegion?: Region; dim: number }

function camTransformFor(region: Region, W: number, H: number): { scale: number; tx: number; ty: number } {
  const scale = Math.min(W / region.w, H / region.h) * 0.82;
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
  return { scale, tx: W / 2 - cx * scale, ty: H / 2 - cy * scale };
}

function computeCamera(actions: SpecAction[], frame: number, W: number, H: number): CamState {
  let state: CamState = { scale: 1, tx: 0, ty: 0, dim: 0 };
  for (const a of actions) {
    if (a.target !== 'camera') continue;
    const at = a.at ?? 0, dur = Math.max(1, a.duration ?? 20);
    if (frame < at) continue;
    const p = Easing.inOut(Easing.cubic)(Math.min(1, (frame - at) / dur));
    if (a.action === 'cameraPush' && a.region) {
      const to = camTransformFor(a.region, W, H);
      state = {
        scale: interpolate(p, [0, 1], [state.scale, to.scale]),
        tx: interpolate(p, [0, 1], [state.tx, to.tx]),
        ty: interpolate(p, [0, 1], [state.ty, to.ty]),
        focusRegion: a.region, dim: state.dim,
      };
    } else if (a.action === 'cameraPull') {
      state = {
        scale: interpolate(p, [0, 1], [state.scale, 1]),
        tx: interpolate(p, [0, 1], [state.tx, 0]),
        ty: interpolate(p, [0, 1], [state.ty, 0]),
        dim: state.dim * (1 - p),
      };
    } else if (a.action === 'cameraPan' && a.region) {
      const fromT = a.from ? camTransformFor(a.from, W, H) : { scale: state.scale, tx: state.tx, ty: state.ty };
      const toT = camTransformFor(a.region, W, H);
      state = {
        scale: interpolate(p, [0, 1], [fromT.scale, toT.scale]),
        tx: interpolate(p, [0, 1], [fromT.tx, toT.tx]),
        ty: interpolate(p, [0, 1], [fromT.ty, toT.ty]),
        focusRegion: a.region, dim: state.dim,
      };
    } else if (a.action === 'focus') {
      state = { ...state, focusRegion: a.region, dim: (a.dim ?? 0.55) * p };
    }
  }
  return state;
}

// ---------- 元素渲染 ----------
const ElementView: React.FC<{
  el: SpecElement; actions: SpecAction[]; frame: number; fps: number;
}> = ({ el, actions, frame, fps }) => {
  const m = useMemo(
    () => computeMotion(el, actions.filter((a) => a.target === el.id || (a.targets ?? []).includes(el.id)), frame, fps),
    [el, actions, frame, fps],
  );
  if (m.hidden && m.opacity === 0) return null;

  const base: React.CSSProperties = {
    position: 'absolute', left: el.x, top: el.y,
    width: el.w, height: el.h,
    zIndex: el.z ?? 0,
    opacity: (el.opacity ?? 1) * m.opacity,
    transform: `translate(${m.translateX}px, ${m.translateY}px) scale(${m.scale})${el.rotate ? ` rotate(${el.rotate}deg)` : ''}`,
    transformOrigin: 'center center',
    clipPath: m.clipPath,
    ...(el.style as React.CSSProperties),
  };

  if (el.kind === 'image' || el.kind === 'imageRegion') {
    if (el.kind === 'image') {
      return (
        <div style={base}>
          <Img src={resolveSrc(el.src)} style={{ width: '100%', height: '100%', objectFit: el.fit === 'contain' ? 'contain' : 'cover', display: 'block' }} />
        </div>
      );
    }
    // imageRegion：原图裁切副本叠加
    const r = el.region!;
    const scale = el.w && r.w ? el.w / r.w : 1;
    const iw = (el.imageW ?? 0) * scale;
    const ih = (el.imageH ?? 0) * scale;
    return (
      <div style={{ ...base, overflow: 'hidden', width: el.w ?? r.w, height: el.h ?? r.h }}>
        <Img src={resolveSrc(el.src)} style={{ width: iw, height: ih, marginLeft: -r.x * scale, marginTop: -r.y * scale, display: 'block', maxWidth: 'none' }} />
      </div>
    );
  }

  if (el.kind === 'text') {
    const fontSize = el.fontSize ?? 48;
    const common: React.CSSProperties = {
      ...base,
      fontFamily: FONT_FAMILY,
      fontSize,
      fontWeight: el.fontWeight ?? 500,
      color: m.color ?? el.color ?? '#F5F1E8',
      textAlign: el.align ?? 'left',
      lineHeight: el.lineHeight ?? 1.3,
      letterSpacing: el.letterSpacing,
      whiteSpace: 'pre-wrap',
    };
    if (m.typeInRatio != null) {
      const chars = Array.from(el.text ?? '');
      const shown = Math.ceil(chars.length * m.typeInRatio);
      return (
        <div style={common}>
          {chars.map((c, i) => (
            <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>{c}</span>
          ))}
        </div>
      );
    }
    if (m.background) {
      // highlight：文字背后的色块扫入
      return (
        <div style={common}>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <span style={{
              position: 'absolute', inset: '-2px -6px', background: m.background,
              clipPath: m.clipPath, zIndex: -1, borderRadius: 4,
            }} />
            {el.text}
          </span>
        </div>
      );
    }
    return <div style={common}>{el.text}</div>;
  }

  if (el.kind === 'box' || el.kind === 'chip') {
    return (
      <div style={{
        ...base,
        background: m.background ?? el.bg ?? 'rgba(255,255,255,0.06)',
        border: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor ?? 'rgba(255,255,255,0.15)'}` : undefined,
        borderRadius: el.radius ?? (el.kind === 'chip' ? 999 : 16),
        clipPath: m.clipPath,
      }} />
    );
  }

  if (el.kind === 'line' || el.kind === 'arrow') {
    const x2 = el.x2 ?? el.x + 100, y2 = el.y2 ?? el.y;
    const minX = Math.min(el.x, x2), minY = Math.min(el.y, y2);
    const w = Math.abs(x2 - el.x) || 2, h = Math.abs(y2 - el.y) || 2;
    const pad = 20;
    const d = el.curved === false
      ? `M ${el.x - minX + pad} ${el.y - minY + pad} L ${x2 - minX + pad} ${y2 - minY + pad}`
      : wavyLinePath(el.x - minX + pad, el.y - minY + pad, x2 - minX + pad, y2 - minY + pad, el.id, 3);
    // 描边生长由 connect/connectArrow/drawArrow action 驱动
    let ratio = 1;
    for (const a of actions) {
      if (a.target !== el.id) continue;
      if (a.action === 'connect' || a.action === 'connectArrow' || a.action === 'drawArrow') {
        const at = a.at ?? 0, dur = Math.max(1, a.duration ?? 15);
        ratio = Math.min(ratio, Math.min(1, Math.max(0, (frame - at) / dur)));
      }
    }
    const angle = Math.atan2(y2 - el.y, x2 - el.x);
    const headLen = 16;
    return (
      <svg style={{ ...base, left: minX - pad, top: minY - pad, overflow: 'visible' }}
        width={w + pad * 2} height={h + pad * 2}>
        <path d={d} fill="none" stroke={el.stroke ?? '#F5F1E8'} strokeWidth={el.strokeWidth ?? 3}
          pathLength={el.dashed ? undefined : 1}
          strokeDasharray={el.dashed ? '10 8' : 1}
          strokeDashoffset={el.dashed ? 0 : 1 - ratio}
          strokeLinecap="round" />
        {el.kind === 'arrow' && ratio > 0.95 && (
          <path
            d={`M ${x2 - minX + pad} ${y2 - minY + pad} l ${-headLen * Math.cos(angle - 0.45)} ${-headLen * Math.sin(angle - 0.45)} M ${x2 - minX + pad} ${y2 - minY + pad} l ${-headLen * Math.cos(angle + 0.45)} ${-headLen * Math.sin(angle + 0.45)}`}
            fill="none" stroke={el.stroke ?? '#F5F1E8'} strokeWidth={el.strokeWidth ?? 3} strokeLinecap="round" />
        )}
      </svg>
    );
  }

  if (el.kind === 'icon') {
    const size = el.w ?? 32;
    const color = el.color ?? el.stroke ?? '#4ADE80';
    return (
      <div style={{ ...base, width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 32 32">
          {el.icon === 'check' && <path d="M6 17 L13 24 L26 8" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
          {el.icon === 'cross' && <path d="M8 8 L24 24 M24 8 L8 24" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />}
          {(el.icon === 'dot' || !el.icon) && <circle cx={16} cy={16} r={7} fill={color} />}
        </svg>
      </div>
    );
  }
  return null;
};

// ---------- 标记层（underlineDraw / circleMark / drawArrow-to-element） ----------
const MarkLayer: React.FC<{
  actions: SpecAction[]; elements: Map<string, SpecElement>; frame: number; fps: number;
}> = ({ actions, elements, frame, fps }) => {
  const marks: React.ReactNode[] = [];
  for (const a of actions) {
    if (a.action !== 'underlineDraw' && a.action !== 'circleMark') continue;
    const el = elements.get(a.target);
    if (!el) continue;
    const at = a.at ?? 0, dur = Math.max(1, a.duration ?? 15);
    const ratio = Math.min(1, Math.max(0, (frame - at) / dur));
    if (ratio <= 0) continue;
    const color = a.color ?? '#5EA8FF'; // chenstricks 蓝
    const w = el.w ?? 100, h = el.h ?? (el.fontSize ? el.fontSize * 1.4 : 40);
    if (a.action === 'underlineDraw') {
      const pad = 10;
      const d = wavyLinePath(pad, 14, w + pad, 12, el.id, 3.5);
      marks.push(
        <svg key={a.target + '-ul'} style={{ position: 'absolute', left: el.x - pad, top: el.y + h - 4, zIndex: (el.z ?? 0) + 1, overflow: 'visible' }}
          width={w + pad * 2} height={26}>
          <path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ratio} />
        </svg>,
      );
    } else {
      const pad = 14;
      const d = scribbleEllipsePath(w / 2 + pad, h / 2 + pad, w / 2 + pad * 0.8, h / 2 + pad * 0.7, el.id);
      marks.push(
        <svg key={a.target + '-cm'} style={{ position: 'absolute', left: el.x - pad, top: el.y - pad, zIndex: (el.z ?? 0) + 1, overflow: 'visible' }}
          width={w + pad * 2} height={h + pad * 2}>
          <path d={d} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ratio} />
        </svg>,
      );
    }
  }
  return <>{marks}</>;
};

// ---------- 主组件 ----------
export const SpecComposition: React.FC<{ spec: AnimSpec }> = ({ spec: rawSpec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const spec = useMemo(() => compileSpec(rawSpec), [rawSpec]);
  const elements = useMemo(() => new Map(spec.elements.map((e) => [e.id, e])), [spec]);
  const cam = computeCamera(spec.actions, frame, width, height);

  return (
    <AbsoluteFill style={{ background: spec.meta.background ?? '#0F1B16', fontFamily: FONT_FAMILY }}>
      <AbsoluteFill style={{
        transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
        transformOrigin: '0 0',
      }}>
        {spec.elements.map((el) => (
          <ElementView key={el.id} el={el} actions={spec.actions} frame={frame} fps={fps} />
        ))}
        <MarkLayer actions={spec.actions} elements={elements} frame={frame} fps={fps} />
      </AbsoluteFill>
      {cam.dim > 0.01 && cam.focusRegion && (() => {
        const r = cam.focusRegion;
        const s = cam.scale;
        const rx = r.x * s + cam.tx, ry = r.y * s + cam.ty;
        return (
          <div style={{
            position: 'absolute', left: rx - 20, top: ry - 20,
            width: r.w * s + 40, height: r.h * s + 40,
            borderRadius: 16,
            boxShadow: `0 0 0 9999px rgba(6,10,9,${cam.dim})`,
            zIndex: 90, pointerEvents: 'none',
          }} />
        );
      })()}
    </AbsoluteFill>
  );
};
