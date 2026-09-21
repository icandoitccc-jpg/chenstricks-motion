// spec 编译：语义档位 → 数值；beats → 绝对帧时间；校验封闭枚举。
import { ACTION_NAMES, AnimSpec, Beat, Intensity, SpecAction, Speed } from './types';

export const SPEED_MS: Record<Speed, number> = { slow: 900, normal: 600, fast: 350 };
export const INTENSITY_SCALE: Record<Intensity, number> = { light: 0.6, normal: 1, strong: 1.5 };

// 各 action 的默认持续（毫秒，speed=normal 基准；实际 = default * speedFactor）
const DEFAULT_DUR_MS: Partial<Record<SpecAction['action'], number>> = {
  fadeIn: 500, popIn: 550, slideIn: 550, reveal: 600,
  pulse: 600, scaleEmphasis: 550, shake: 450, highlight: 900,
  underlineDraw: 700, circleMark: 800, drawArrow: 700,
  connect: 500, connectArrow: 600,
  move: 700, converge: 800, diverge: 800,
  typeIn: 900,
  cameraPush: 900, cameraPull: 900, cameraPan: 800, focus: 600,
  fadeOut: 450, slideOut: 500,
};

export function speedToMs(speed: Speed | undefined, fps: number): number {
  return SPEED_MS[speed ?? 'normal'] / (1000 / fps) / fps * 1000; // ms
}

export function actionDurationFrames(a: SpecAction, fps: number): number {
  if (a.duration && a.duration > 0) return Math.round(a.duration);
  const base = DEFAULT_DUR_MS[a.action] ?? 600;
  const speedFactor = SPEED_MS[a.speed ?? 'normal'] / SPEED_MS.normal;
  return Math.max(3, Math.round((base * speedFactor) / 1000 * fps));
}

// ---------- 校验 ----------
export function validateSpec(spec: AnimSpec): string[] {
  const errors: string[] = [];
  if (spec.version !== 1) errors.push('version 必须为 1');
  const m = spec.meta;
  if (!m || !m.width || !m.height || !m.fps || !m.durationInFrames) {
    errors.push('meta.width/height/fps/durationInFrames 必填');
  }
  const ids = new Set<string>();
  for (const el of spec.elements ?? []) {
    if (!el.id) errors.push('元素缺少 id');
    if (ids.has(el.id)) errors.push(`元素 id 重复: ${el.id}`);
    ids.add(el.id);
    if (typeof el.x !== 'number' || typeof el.y !== 'number') {
      errors.push(`元素 ${el.id} 缺少坐标（坐标只能由排版引擎或框选产生）`);
    }
  }
  for (const a of spec.actions ?? []) {
    if (!(ACTION_NAMES as readonly string[]).includes(a.action)) {
      errors.push(`未注册的 action: ${a.action}（封闭枚举，禁止生成不存在的能力）`);
    }
    const isCamera = a.action.startsWith('camera') || a.action === 'focus';
    if (isCamera) {
      if (a.target !== 'camera') errors.push(`${a.action} 的 target 必须为 'camera'`);
    } else if (a.action === 'stagger' || a.action === 'converge' || a.action === 'diverge') {
      const ts = a.targets ?? [a.target];
      for (const t of ts) if (!ids.has(t)) errors.push(`action ${a.action} 目标不存在: ${t}`);
    } else if (!ids.has(a.target)) {
      errors.push(`action ${a.action} 目标不存在: ${a.target}`);
    }
  }
  return errors;
}

// ---------- beats → 绝对帧 ----------
// 规则：beat 顺序衔接；withPrevious 与上一 beat 同起点；beat 内 action 按 offset 排列。
export function compileBeats(spec: AnimSpec): SpecAction[] {
  const fps = spec.meta.fps;
  const beats: Beat[] = spec.beats ?? [];
  if (beats.length === 0) {
    // 无 beats：action 自带 at 或按声明顺序衔接
    let cursor = 0;
    return spec.actions.map((a) => {
      const dur = actionDurationFrames(a, fps);
      const at = a.at ?? cursor;
      cursor = at + dur;
      return { ...a, at, duration: dur };
    });
  }

  const beatStart = new Map<string, number>();
  const beatEnd = new Map<string, number>();
  const actionsByBeat = new Map<string, SpecAction[]>();
  for (const b of beats) actionsByBeat.set(b.id, []);
  const loose: SpecAction[] = [];
  for (const a of spec.actions) {
    if (a.beat && actionsByBeat.has(a.beat)) actionsByBeat.get(a.beat)!.push(a);
    else loose.push(a);
  }

  let cursor = 0;
  const GAP = Math.round(0.5 * fps); // beat 间默认停顿
  beats.forEach((b, i) => {
    const start = b.withPrevious && i > 0 ? beatStart.get(beats[i - 1].id)! : (i === 0 ? 0 : cursor + (b.gapAfterPrev ?? GAP));
    beatStart.set(b.id, start);
    let end = start;
    for (const a of actionsByBeat.get(b.id) ?? []) {
      const dur = actionDurationFrames(a, fps);
      const at = a.at ?? start + (a.offset ?? 0);
      end = Math.max(end, at + dur);
    }
    beatEnd.set(b.id, end);
    cursor = Math.max(cursor, end);
  });

  const compiled: SpecAction[] = [];
  for (const b of beats) {
    const start = beatStart.get(b.id)!;
    // stagger 组内自动递增 offset
    let staggerCursor = 0;
    for (const a of actionsByBeat.get(b.id) ?? []) {
      const dur = actionDurationFrames(a, fps);
      let at: number;
      if (a.at != null) at = a.at;
      else if (a.action === 'stagger') {
        at = start + staggerCursor;
        const gap = a.staggerGap ?? Math.round(dur * 0.5);
        staggerCursor += gap;
      } else {
        at = start + (a.offset ?? 0);
      }
      compiled.push({ ...a, at, duration: dur });
    }
  }
  for (const a of loose) {
    compiled.push({ ...a, at: a.at ?? 0, duration: actionDurationFrames(a, fps) });
  }
  return compiled.sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
}

export function compileSpec(spec: AnimSpec): AnimSpec {
  const errors = validateSpec(spec);
  if (errors.length > 0) throw new Error('Spec 校验失败:\n' + errors.join('\n'));
  return { ...spec, actions: compileBeats(spec) };
}
