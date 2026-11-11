export type SceneKind = 'info' | 'image' | 'video';
export type Template = 'focus' | 'steps' | 'comparison' | 'list';
export interface Sentence { id: string; text: string; start: number | null; end: number | null }
export interface MediaAsset { id: string; name: string; kind: 'audio' | 'image' | 'video'; duration?: number; size: number; mime: string }
export interface Scene {
  id: string; title: string; sentenceIds: string[]; kind: SceneKind; assetId?: string;
  template: Template; items: string[]; leftLabel: string; rightLabel: string;
  sourceIn: number; motion: 'still' | 'push' | 'pan'; focusX: number; focusY: number;
}
export interface Project {
  version: 1; id: string; title: string; audioRevision: number; audioAssetId?: string;
  width: number; height: number; fps: number; captions: boolean;
  sentences: Sentence[]; scenes: Scene[]; assets: MediaAsset[];
}
export interface TimedScene extends Scene { start: number; end: number }
export interface Issue { level: 'error' | 'warning'; message: string }
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const newProject = (): Project => ({ version: 1, id: uid('project'), title: '我的口播项目', audioRevision: 0, width: 1920, height: 1080, fps: 30, captions: true, sentences: [], scenes: [], assets: [] });
export const newScene = (sentenceIds: string[] = []): Scene => ({ id: uid('scene'), title: '新画面', sentenceIds, kind: 'info', template: 'focus', items: [], leftLabel: '之前', rightLabel: '现在', sourceIn: 0, motion: 'push', focusX: 50, focusY: 50 });
export const splitScript = (text: string): Sentence[] => (text.match(/[^。！？!?\n]+[。！？!?]?/g) ?? []).map(s => s.trim()).filter(Boolean).map((text, i) => ({ id: `S${String(i + 1).padStart(3, '0')}`, text, start: null, end: null }));
export function formatTime(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toFixed(2).padStart(5, '0')}`;
}
export function parseSrt(text: string): Sentence[] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const blocks = clean.trim().split(/\n\s*\n/); const result: Sentence[] = [];
  const stamp = (s: string) => { const a = s.replace(',', '.').split(':').map(Number); return a.length === 3 ? a[0] * 3600 + a[1] * 60 + a[2] : a[0] * 60 + a[1]; };
  for (const block of blocks) {
    const lines = block.split('\n'); const ix = lines.findIndex(l => l.includes('-->')); if (ix < 0) continue;
    const m = lines[ix].match(/((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})/);
    if (!m) throw new Error('字幕时间格式错误，请导入标准 SRT 或 VTT。');
    const start = stamp(m[1]), end = stamp(m[2]); const body = lines.slice(ix + 1).join(' ').replace(/<[^>]*>/g, '').trim();
    if (!body || end <= start || start < 0 || !Number.isFinite(end)) throw new Error('字幕含空文字或无效时间。');
    if (result.length && start < result[result.length - 1].end!) throw new Error('字幕时间重叠，请先修正。');
    result.push({ id: `S${String(result.length + 1).padStart(3, '0')}`, text: body, start, end });
  }
  if (!result.length) throw new Error('没有读到时间字幕。支持 SRT / VTT，不会根据字数猜时间。');
  return result;
}
export function compileScenes(p: Project): TimedScene[] {
  const sentences = new Map(p.sentences.map(s => [s.id, s]));
  return p.scenes.flatMap(scene => {
    const ss = scene.sentenceIds.map(id => sentences.get(id));
    if (!ss.length || ss.some(s => !s || s.start === null || s.end === null)) return [];
    return [{ ...scene, start: Math.min(...ss.map(s => s!.start!)), end: Math.max(...ss.map(s => s!.end!)) }];
  }).sort((a, b) => a.start - b.start);
}
export function validateProject(p: Project, files?: Map<string, Blob>): Issue[] {
  const issues: Issue[] = []; const error = (message: string) => issues.push({ level: 'error', message });
  const warning = (message: string) => issues.push({ level: 'warning', message });
  const audio = p.assets.find(a => a.id === p.audioAssetId);
  if (!audio) error('请导入最终旁白。');
  if (!p.sentences.length) error('请导入稿子或时间字幕。');
  const seen = new Set<string>(); let lastEnd = 0;
  for (const s of p.sentences) {
    if (seen.has(s.id)) error(`句子编号重复：${s.id}`); seen.add(s.id);
    if (s.start === null || s.end === null) { error(`${s.id} 尚未标记实际时间。`); continue; }
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start) error(`${s.id} 时间无效。`);
    if (s.start < lastEnd - 0.001) error(`${s.id} 与上一句时间重叠或顺序错误。`);
    lastEnd = s.end;
    if (audio?.duration && s.end > audio.duration + 0.05) error(`${s.id} 超出旁白长度。`);
  }
  if (!p.scenes.length) error('请创建画面或导入 ChatGPT 场景方案。');
  const sceneIds = new Set<string>(); const owners = new Map<string, string>();
  const timed = compileScenes(p); const byScene = new Map(timed.map(s => [s.id, s]));
  for (const sc of p.scenes) {
    if (sceneIds.has(sc.id)) error(`场景编号重复：${sc.id}`); sceneIds.add(sc.id);
    if (!sc.sentenceIds.length) error(`${sc.title} 没有绑定句子。`);
    const indices = sc.sentenceIds.map(id => p.sentences.findIndex(s => s.id === id));
    if (indices.some(i => i < 0)) error(`${sc.title} 引用了不存在的句子。`);
    const sorted = [...new Set(indices)].sort((a, b) => a - b);
    if (sorted.length !== indices.length || sorted.some((v, i) => i > 0 && v !== sorted[i - 1] + 1)) error(`${sc.title} 只能绑定一组连续、不重复的句子。`);
    for (const id of sc.sentenceIds) { if (owners.has(id)) error(`${id} 被多个场景重复使用。`); owners.set(id, sc.id); }
    if (sc.kind !== 'info') {
      const a = p.assets.find(a => a.id === sc.assetId);
      if (!a || a.kind !== sc.kind) error(`${sc.title} 缺少匹配的${sc.kind === 'image' ? '图片' : '录屏'}素材。`);
      if (!Number.isFinite(sc.sourceIn) || sc.sourceIn < 0) error(`${sc.title} 的素材入点无效。`);
      const t = byScene.get(sc.id);
      if (a?.kind === 'video' && a.duration && t && sc.sourceIn + t.end - t.start > a.duration + 0.05) error(`${sc.title} 录屏剩余长度不足，请换素材、调整入点或缩短场景。`);
    } else {
      if (!sc.title.trim()) error('信息动画需要标题。');
      if (sc.items.length > 6) error(`${sc.title} 最多放6项，更多内容请拆成两个场景。`);
      if (sc.template === 'comparison' && sc.items.length !== 2) error(`${sc.title} 的对比模板需要恰好两项内容。`);
    }
  }
  for (const s of p.sentences) if (!owners.has(s.id)) error(`${s.id} 还没有画面。`);
  for (let i = 1; i < timed.length; i++) if (timed[i].start < timed[i - 1].end - 0.001) error('场景时间重叠。');
  if (audio?.duration && timed.length && audio.duration - timed[timed.length - 1].end > 0.5) warning('旁白结尾有未分配画面的停留，导出会保持最后一幕。');
  const used = new Set([p.audioAssetId, ...p.scenes.filter(s => s.kind !== 'info').map(s => s.assetId)].filter(Boolean));
  if (files) for (const id of used) if (!files.has(id!)) error(`素材文件未连接：${p.assets.find(a => a.id === id)?.name ?? id}`);
  return issues;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('文件必须是 JSON 对象。'); return value as Record<string, unknown>;
}
function str(x: unknown, fallback = '') { return typeof x === 'string' ? x : fallback; }
function number(x: unknown, fallback: number) { return typeof x === 'number' && Number.isFinite(x) ? x : fallback; }
export function parseScenePlan(raw: string, p: Project): Scene[] {
  const d = record(JSON.parse(raw));
  if (d.version !== 1 || !Array.isArray(d.scenes) || !d.scenes.length || d.scenes.length > 500) throw new Error('方案需要 version: 1 和1—500个 scenes。');
  if (d.projectId !== p.id || d.audioRevision !== p.audioRevision) throw new Error('方案属于其他项目或旧录音版本，请重新导出策划包。');
  const ids = new Set<string>();
  return d.scenes.map((value, i) => {
    const v = record(value); const s = newScene();
    if (!['info', 'image', 'video'].includes(String(v.kind))) throw new Error(`场景${i + 1}的 kind 不受支持。`);
    if (!Array.isArray(v.sentenceIds) || !v.sentenceIds.length || v.sentenceIds.some(id => typeof id !== 'string' || !p.sentences.some(s => s.id === id))) throw new Error(`场景${i + 1}需要有效的 sentenceIds。`);
    const id = str(v.id, s.id); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error('场景编号无效或重复。'); ids.add(id);
    const template = str(v.template, 'focus'); if (!['focus', 'steps', 'comparison', 'list'].includes(template)) throw new Error(`场景${i + 1}模板尚未实现：${template}`);
    return { ...s, id, title: str(v.title, s.title).slice(0, 200), sentenceIds: v.sentenceIds as string[], kind: v.kind as SceneKind,
      template: template as Template, items: Array.isArray(v.items) ? v.items.map(x => str(x)).filter(Boolean).slice(0, 20) : [], assetId: str(v.assetId) || undefined,
      leftLabel: str(v.leftLabel, '之前'), rightLabel: str(v.rightLabel, '现在'), sourceIn: number(v.sourceIn, 0), motion: ['still', 'push', 'pan'].includes(String(v.motion)) ? v.motion as Scene['motion'] : 'push', focusX: Math.max(0, Math.min(100, number(v.focusX, 50))), focusY: Math.max(0, Math.min(100, number(v.focusY, 50))) };
  });
}
export function parseProject(raw: string): Project {
  const d = record(JSON.parse(raw));
  if (d.version !== 1 || typeof d.id !== 'string' || !Array.isArray(d.sentences) || !Array.isArray(d.assets) || !Array.isArray(d.scenes)) throw new Error('不是受支持的 Motion 项目。');
  if (d.sentences.length > 5000 || d.assets.length > 500 || ![1920, 1080].includes(Number(d.width)) || ![1080, 1920].includes(Number(d.height))) throw new Error('项目规模或画幅不受支持。');
  const p = newProject(); p.id = d.id; p.title = str(d.title, p.title); p.audioRevision = number(d.audioRevision, 0); p.audioAssetId = str(d.audioAssetId) || undefined;
  p.width = Number(d.width); p.height = Number(d.height); p.captions = d.captions !== false;
  p.sentences = d.sentences.map(x => { const s = record(x); if (typeof s.id !== 'string' || typeof s.text !== 'string') throw new Error('句子格式错误。'); return { id: s.id, text: s.text, start: typeof s.start === 'number' ? number(s.start, -1) : null, end: typeof s.end === 'number' ? number(s.end, -1) : null }; });
  p.assets = d.assets.map(x => { const a = record(x); if (!/^[a-zA-Z0-9_-]{1,100}$/.test(str(a.id)) || !['audio', 'image', 'video'].includes(str(a.kind))) throw new Error('素材格式错误。'); return { id: str(a.id), name: str(a.name), kind: a.kind as MediaAsset['kind'], size: number(a.size, 0), mime: str(a.mime), duration: typeof a.duration === 'number' ? number(a.duration, 0) : undefined }; });
  p.scenes = d.scenes.length ? parseScenePlan(JSON.stringify({ version: 1, projectId: p.id, audioRevision: p.audioRevision, scenes: d.scenes }), p) : [];
  return p;
}
