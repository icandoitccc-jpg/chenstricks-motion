// 功能B 排版引擎（确定性）：DirectorOutput（语义，无坐标）→ AnimSpec（含坐标）
// 规则：AI 不碰坐标；所有 x/y/w/h/字号/间距由本文件决定。
import type { AnimSpec, Beat, DirectorOutput, SpecAction, SpecElement } from '../../../src/spec/types';

const W = 1920, H = 1080, FPS = 30;
const C = {
  bg: '#0F1B16', text: '#F5F1E8', muted: 'rgba(245,241,232,0.55)',
  accent: '#E8A33D', blue: '#5EA8FF', green: '#4ADE80',
  card: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.14)',
};

interface Ctx { els: SpecElement[]; acts: SpecAction[]; beats: Beat[] }

function text(id: string, t: string, x: number, y: number, w: number, o: Partial<SpecElement> = {}): SpecElement {
  return { id, kind: 'text', text: t, x, y, w, fontSize: 40, fontWeight: 500, color: C.text, align: 'center', z: 3, ...o };
}
function box(id: string, x: number, y: number, w: number, h: number, o: Partial<SpecElement> = {}): SpecElement {
  return { id, kind: 'box', x, y, w, h, bg: C.card, borderColor: C.stroke, borderWidth: 1.5, radius: 14, z: 2, ...o };
}
function arrow(id: string, x: number, y: number, x2: number, y2: number, color: string): SpecElement {
  return { id, kind: 'arrow', x, y, x2, y2, stroke: color, strokeWidth: 3, z: 2 };
}
function chipPair(ctx: Ctx, id: string, label: string, cx: number, y: number, color: string) {
  const w = Math.max(220, label.length * 40 + 60);
  ctx.els.push(box(id, cx - w / 2, y, w, 68, { bg: `${color}1f`, borderColor: color, radius: 999 }));
  ctx.els.push(text(id + 't', label, cx - w / 2, y + 15, w, { fontSize: 32, fontWeight: 600, color }));
}

const STEP_W = 360, STEP_H = 76, STEP_GAP = 48;

// 一列步骤卡片 + 箭头（Comparison 左右列 / Progression 共用）
function stepColumn(ctx: Ctx, prefix: string, steps: string[], cx: number, y0: number, color: string, beatId: string, accentLast = false) {
  const targets: string[] = [];
  steps.forEach((s, i) => {
    const y = y0 + i * (STEP_H + STEP_GAP);
    const isLast = accentLast && i === steps.length - 1;
    ctx.els.push(box(`${prefix}${i}`, cx - STEP_W / 2, y, STEP_W, STEP_H,
      isLast ? { bg: `${C.accent}1a`, borderColor: C.accent } : {}));
    ctx.els.push(text(`${prefix}${i}t`, s, cx - STEP_W / 2, y + 18, STEP_W,
      { fontSize: 34, fontWeight: isLast ? 700 : 500, color: isLast ? C.accent : C.text }));
    targets.push(`${prefix}${i}`, `${prefix}${i}t`);
    if (i > 0) {
      const ay = y - STEP_GAP + 4;
      ctx.els.push(arrow(`${prefix}a${i}`, cx, ay, cx, ay + STEP_GAP - 10, color));
      ctx.acts.push({ action: 'connectArrow', target: `${prefix}a${i}`, beat: beatId, offset: 20 + i * 12, duration: 12 });
    }
  });
  ctx.acts.push({ action: 'stagger', target: targets[0], targets, beat: beatId, offset: 0, staggerGap: 11, duration: 16 });
}

function emphasisMarks(ctx: Ctx, d: DirectorOutput, beatId: string) {
  // emphasis 里的文字若与某文本元素内容匹配，加手绘圈
  if (!d.emphasis?.length) return;
  for (const el of ctx.els) {
    if (el.kind === 'text' && el.text && d.emphasis.some((e) => el.text!.includes(e))) {
      ctx.acts.push({ action: 'circleMark', target: el.id, beat: beatId, offset: 8, color: C.accent });
    }
  }
}

// ---------- 各结构 ----------
function layoutComparison(d: DirectorOutput): Ctx {
  const ctx: Ctx = { els: [], acts: [], beats: [
    { id: 'b1', label: '建立主题' }, { id: 'b2', label: '展开左侧' },
    { id: 'b3', label: '展开右侧' }, { id: 'b4', label: '强调差异' },
  ]};
  if (d.title) {
    ctx.els.push(text('title', d.title, W / 2 - 400, 90, 800, { fontSize: 64, fontWeight: 700 }));
    ctx.acts.push({ action: 'typeIn', target: 'title', beat: 'b1', offset: 0 });
  }
  const L = d.left ?? { label: 'A', steps: [] }, R = d.right ?? { label: 'B', steps: [] };
  const cxL = 450, cxR = 1470;
  chipPair(ctx, 'chipL', L.label, cxL, 240, C.blue);
  chipPair(ctx, 'chipR', R.label, cxR, 240, C.green);
  ctx.acts.push({ action: 'popIn', target: 'chipL', beat: 'b1', offset: 20 });
  ctx.acts.push({ action: 'popIn', target: 'chipLt', beat: 'b1', offset: 20 });
  ctx.acts.push({ action: 'popIn', target: 'chipR', beat: 'b1', offset: 26 });
  ctx.acts.push({ action: 'popIn', target: 'chipRt', beat: 'b1', offset: 26 });
  stepColumn(ctx, 'ls', L.steps, cxL, 380, C.blue, 'b2');
  stepColumn(ctx, 'rs', R.steps, cxR, 380, C.green, 'b3');
  ctx.els.push(text('vs', 'vs', W / 2 - 90, 520, 180, { fontSize: 68, fontWeight: 800, color: C.accent, z: 5 }));
  ctx.acts.push({ action: 'popIn', target: 'vs', beat: 'b4', offset: 0, intensity: 'strong' });
  if (d.conclusion) {
    ctx.els.push(text('cc', d.conclusion, W / 2 - 500, 880, 1000, { fontSize: 50, fontWeight: 700, color: C.accent }));
    ctx.acts.push({ action: 'slideIn', target: 'cc', beat: 'b4', offset: 10, direction: 'up' });
    ctx.acts.push({ action: 'underlineDraw', target: 'cc', beat: 'b4', offset: 24, color: C.accent });
    ctx.acts.push({ action: 'cameraPush', target: 'camera', beat: 'b4', offset: 40, region: { x: 400, y: 820, w: 1120, h: 180 }, speed: 'normal' });
    ctx.acts.push({ action: 'cameraPull', target: 'camera', beat: 'b4', offset: 82 });
  }
  emphasisMarks(ctx, d, 'b4');
  return ctx;
}

function layoutFlow(d: DirectorOutput): Ctx {
  const ctx: Ctx = { els: [], acts: [], beats: [
    { id: 'b1', label: '建立主题' }, { id: 'b2', label: '展开流程' }, { id: 'b3', label: '收束' },
  ]};
  if (d.title) {
    ctx.els.push(text('title', d.title, W / 2 - 400, 110, 800, { fontSize: 64, fontWeight: 700 }));
    ctx.acts.push({ action: 'typeIn', target: 'title', beat: 'b1', offset: 0 });
  }
  const steps = d.steps ?? [];
  const n = Math.max(1, steps.length);
  const bw = Math.min(340, (W - 240 - (n - 1) * 90) / n);
  const total = n * bw + (n - 1) * 90;
  const x0 = (W - total) / 2, y = 460;
  const targets: string[] = [];
  steps.forEach((s, i) => {
    const x = x0 + i * (bw + 90);
    ctx.els.push(box(`f${i}`, x, y, bw, 130, {}));
    ctx.els.push(text(`f${i}t`, s, x + 10, y + 42, bw - 20, { fontSize: 32 }));
    targets.push(`f${i}`, `f${i}t`);
    if (i > 0) {
      const ax = x - 90 + 12;
      ctx.els.push(arrow(`fa${i}`, ax, y + 65, x - 12, y + 65, C.accent));
      ctx.acts.push({ action: 'connectArrow', target: `fa${i}`, beat: 'b2', offset: i * 14, duration: 12 });
    }
  });
  ctx.acts.push({ action: 'stagger', target: targets[0] ?? 'f0', targets, beat: 'b2', offset: 0, staggerGap: 14, duration: 16 });
  if (d.conclusion) {
    ctx.els.push(text('cc', d.conclusion, W / 2 - 500, 760, 1000, { fontSize: 48, fontWeight: 700, color: C.accent }));
    ctx.acts.push({ action: 'slideIn', target: 'cc', beat: 'b3', offset: 0, direction: 'up' });
    ctx.acts.push({ action: 'underlineDraw', target: 'cc', beat: 'b3', offset: 14, color: C.accent });
  }
  emphasisMarks(ctx, d, 'b3');
  return ctx;
}

function layoutProgression(d: DirectorOutput): Ctx {
  const ctx: Ctx = { els: [], acts: [], beats: [
    { id: 'b1', label: '建立主题' }, { id: 'b2', label: '逐步递进' }, { id: 'b3', label: '落点' },
  ]};
  if (d.title) {
    ctx.els.push(text('title', d.title, W / 2 - 400, 90, 800, { fontSize: 60, fontWeight: 700 }));
    ctx.acts.push({ action: 'typeIn', target: 'title', beat: 'b1', offset: 0 });
  }
  // 递进：越往后越大、越靠近强调色
  stepColumn(ctx, 'p', d.steps ?? [], W / 2, 260, C.blue, 'b2', true);
  if (d.conclusion) {
    ctx.els.push(text('cc', d.conclusion, W / 2 - 500, 900, 1000, { fontSize: 52, fontWeight: 700, color: C.accent }));
    ctx.acts.push({ action: 'popIn', target: 'cc', beat: 'b3', offset: 0, intensity: 'strong' });
    ctx.acts.push({ action: 'cameraPush', target: 'camera', beat: 'b3', offset: 16, region: { x: 410, y: 850, w: 1100, h: 160 } });
    ctx.acts.push({ action: 'cameraPull', target: 'camera', beat: 'b3', offset: 58 });
  }
  emphasisMarks(ctx, d, 'b3');
  return ctx;
}

function layoutDivergence(d: DirectorOutput): Ctx {
  const ctx: Ctx = { els: [], acts: [], beats: [
    { id: 'b1', label: '建立核心' }, { id: 'b2', label: '发散展开' }, { id: 'b3', label: '收束' },
  ]};
  const center = d.center ?? d.title ?? '';
  const items = d.items ?? [];
  const cx = W / 2, cy = 500;
  chipPair(ctx, 'cc', center, cx, cy - 34, C.accent);
  ctx.acts.push({ action: 'popIn', target: 'cc', beat: 'b1', offset: 0, intensity: 'strong' });
  ctx.acts.push({ action: 'popIn', target: 'cct', beat: 'b1', offset: 0, intensity: 'strong' });
  // 分支：两行网格围绕中心
  const n = items.length;
  const cols = Math.ceil(n / 2) || 1;
  const bw = 300, bh = 84, gx = 90, gy = 340;
  items.forEach((s, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const rowCount = Math.min(cols, n - row * cols);
    const rowW = rowCount * bw + (rowCount - 1) * gx;
    const x = (W - rowW) / 2 + col * (bw + gx);
    const y = row === 0 ? cy - gy / 2 - bh : cy + gy / 2 + 60;
    ctx.els.push(box(`d${i}`, x, y, bw, bh, {}));
    ctx.els.push(text(`d${i}t`, s, x + 8, y + 24, bw - 16, { fontSize: 30 }));
    ctx.els.push(arrow(`da${i}`, cx, cy, x + bw / 2, y + (row === 0 ? bh : 0), C.blue));
    ctx.acts.push({ action: 'connect', target: `da${i}`, beat: 'b2', offset: 10 + i * 8, duration: 14 });
    ctx.acts.push({ action: 'diverge', target: `d${i}`, targets: [`d${i}`], beat: 'b2', offset: 0, from: { x: cx, y: cy, w: 0, h: 0 }, duration: 22 });
    ctx.acts.push({ action: 'diverge', target: `d${i}t`, targets: [`d${i}t`], beat: 'b2', offset: 0, from: { x: cx, y: cy, w: 0, h: 0 }, duration: 22 });
  });
  if (d.conclusion) {
    ctx.els.push(text('ccl', d.conclusion, W / 2 - 500, 940, 1000, { fontSize: 44, fontWeight: 600, color: C.accent }));
    ctx.acts.push({ action: 'fadeIn', target: 'ccl', beat: 'b3', offset: 0 });
  }
  emphasisMarks(ctx, d, 'b3');
  return ctx;
}

function layoutConvergence(d: DirectorOutput): Ctx {
  const ctx: Ctx = { els: [], acts: [], beats: [
    { id: 'b1', label: '铺陈信息' }, { id: 'b2', label: '汇聚' }, { id: 'b3', label: '落结论' },
  ]};
  const items = d.items ?? [];
  const cx = W / 2, cy = 620;
  const n = items.length;
  const bw = 320, bh = 80, gap = 60;
  const total = n * bw + (n - 1) * gap;
  const x0 = (W - total) / 2, y = 260;
  items.forEach((s, i) => {
    const x = x0 + i * (bw + gap);
    ctx.els.push(box(`v${i}`, x, y, bw, bh, {}));
    ctx.els.push(text(`v${i}t`, s, x + 8, y + 22, bw - 16, { fontSize: 30 }));
    ctx.acts.push({ action: 'fadeIn', target: `v${i}`, beat: 'b1', offset: i * 10 });
    ctx.acts.push({ action: 'fadeIn', target: `v${i}t`, beat: 'b1', offset: i * 10 });
    ctx.els.push(arrow(`va${i}`, x + bw / 2, y + bh, cx, cy - 60, C.blue));
    ctx.acts.push({ action: 'connectArrow', target: `va${i}`, beat: 'b2', offset: i * 8, duration: 16 });
    ctx.acts.push({ action: 'converge', target: `v${i}`, targets: [`v${i}`], beat: 'b2', offset: 20, to: { x: cx, y: cy }, duration: 24 });
    ctx.acts.push({ action: 'converge', target: `v${i}t`, targets: [`v${i}t`], beat: 'b2', offset: 20, to: { x: cx, y: cy }, duration: 24 });
  });
  const conclusion = d.conclusion ?? d.center ?? '';
  if (conclusion) {
    const w2 = Math.max(360, conclusion.length * 52 + 80);
    ctx.els.push(box('cv', cx - w2 / 2, cy - 60, w2, 120, { bg: `${C.accent}1a`, borderColor: C.accent, radius: 20 }));
    ctx.els.push(text('cvt', conclusion, cx - w2 / 2, cy - 22, w2, { fontSize: 46, fontWeight: 700, color: C.accent }));
    ctx.acts.push({ action: 'popIn', target: 'cv', beat: 'b3', offset: 0, intensity: 'strong' });
    ctx.acts.push({ action: 'popIn', target: 'cvt', beat: 'b3', offset: 0, intensity: 'strong' });
    ctx.acts.push({ action: 'cameraPush', target: 'camera', beat: 'b3', offset: 20, region: { x: cx - w2 / 2 - 60, y: cy - 120, w: w2 + 120, h: 240 } });
    ctx.acts.push({ action: 'cameraPull', target: 'camera', beat: 'b3', offset: 62 });
  }
  return ctx;
}

function layoutFocus(d: DirectorOutput): Ctx {
  const ctx: Ctx = { els: [], acts: [], beats: [
    { id: 'b1', label: '呈现核心' }, { id: 'b2', label: '强调' },
  ]};
  const main = d.title ?? d.center ?? d.conclusion ?? '';
  ctx.els.push(text('main', main, W / 2 - 600, 420, 1200, { fontSize: 84, fontWeight: 800, lineHeight: 1.35 }));
  ctx.acts.push({ action: 'typeIn', target: 'main', beat: 'b1', offset: 0, speed: 'normal' });
  const items = d.items ?? [];
  items.forEach((s, i) => {
    const y = 660 + i * 90;
    ctx.els.push({ id: `i${i}c`, kind: 'icon', icon: 'check', x: W / 2 - 320, y, w: 40, color: C.green, z: 3 });
    ctx.els.push(text(`i${i}`, s, W / 2 - 260, y - 2, 620, { fontSize: 36, align: 'left' }));
  });
  if (items.length) {
    ctx.acts.push({ action: 'stagger', target: 'i0c', targets: items.flatMap((_, i) => [`i${i}c`, `i${i}`]), beat: 'b1', offset: 40, staggerGap: 14, duration: 16 });
  }
  if (d.conclusion && d.conclusion !== main) {
    ctx.els.push(text('cc', d.conclusion, W / 2 - 500, 880, 1000, { fontSize: 52, fontWeight: 700, color: C.accent }));
    ctx.acts.push({ action: 'slideIn', target: 'cc', beat: 'b2', offset: 0, direction: 'up' });
    ctx.acts.push({ action: 'underlineDraw', target: 'cc', beat: 'b2', offset: 16, color: C.accent });
  } else {
    ctx.acts.push({ action: 'pulse', target: 'main', beat: 'b2', offset: 0, intensity: 'normal' });
  }
  emphasisMarks(ctx, d, 'b2');
  return ctx;
}

const LAYOUTS = {
  Comparison: layoutComparison,
  Flow: layoutFlow,
  Progression: layoutProgression,
  Divergence: layoutDivergence,
  Convergence: layoutConvergence,
  Focus: layoutFocus,
};

export function layoutDirectorOutput(d: DirectorOutput): AnimSpec {
  const layout = LAYOUTS[d.primaryStructure] ?? layoutFocus;
  const ctx = layout(d);
  // 用导演给的 beats 标签替换默认（用户可见）
  if (d.beats?.length) {
    d.beats.forEach((b, i) => {
      if (ctx.beats[i]) { ctx.beats[i].label = b.label; if (b.purpose) ctx.beats[i].purpose = b.purpose; }
    });
  }
  // 估算时长：最后一拍结束 + 1.5s 收尾（编译层会算精确帧，这里给足上限）
  const perBeat = 2.6;
  const seconds = Math.max(8, ctx.beats.length * perBeat + 2.5);
  return {
    version: 1,
    meta: {
      width: W, height: H, fps: FPS,
      durationInFrames: Math.round(seconds * FPS),
      background: C.bg,
      title: d.title ?? d.meaning ?? '信息动画',
    },
    elements: ctx.els,
    beats: ctx.beats,
    actions: ctx.acts,
  };
}
