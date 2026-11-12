import { compileScenes, validateProject, type Project, type Scene } from './project';

export function orderedScenes(p: Project): Scene[] {
  const rank = (s: Scene) => Math.min(...s.sentenceIds.map(id => {
    const index = p.sentences.findIndex(sentence => sentence.id === id);
    return index < 0 ? Infinity : index;
  }));
  return [...p.scenes].sort((a, b) => rank(a) - rank(b));
}

/** Isolate a scene so missing media in another scene cannot block this one. */
export function sceneProject(p: Project, id: string): Project {
  const scene = p.scenes.find(s => s.id === id);
  if (!scene) throw new Error('找不到这个画面。');
  return { ...p, scenes: [scene], sentences: p.sentences.filter(s => scene.sentenceIds.includes(s.id)),
    assets: p.assets.filter(a => a.id === p.audioAssetId || a.id === scene.assetId) };
}

export function sceneReadiness(p: Project, id: string, files: Map<string, Blob>) {
  const part = sceneProject(p, id);
  const errors = validateProject(part, files).filter(i => i.level === 'error').map(i => i.message);
  const scene = part.scenes[0];
  // Shared sentence ownership is a real ambiguity even during individual production.
  if (p.scenes.some(s => s.id !== id && s.sentenceIds.some(n => scene.sentenceIds.includes(n)))) errors.push('有原文同时属于其他画面，请先修正总表。');
  const timed = compileScenes(part)[0];
  return { ready: errors.length === 0, errors, timed,
    text: part.sentences.map(s => s.text).join(''),
    asset: part.assets.find(a => a.id === scene.assetId),
    label: errors.length === 0 ? '可同步预览 / 制作' : errors.some(e => /素材|录屏|图片|文件/.test(e)) ? '待补素材' : '待补时间或指令' };
}

/** Render ranges use the exact same master-audio clock as preview. */
export function segmentProject(p: Project, id: string) {
  const part = sceneProject(p, id); const timed = compileScenes(part)[0];
  if (!timed || timed.end <= timed.start) throw new Error('本段缺少有效实际时间。');
  const start = timed.start; const duration = timed.end - start;
  return { start, duration, project: { ...part,
    title: `${p.title} · ${part.scenes[0].title}`,
    sentences: part.sentences.map(s => ({ ...s, start: s.start! - start, end: s.end! - start })),
    assets: part.assets.map(a => a.id === p.audioAssetId ? { ...a, duration } : a) } };
}

export function sceneSignature(p: Project, id: string, files: Map<string, Blob>) {
  const part = sceneProject(p, id);
  return JSON.stringify([part, part.assets.map(a => [a.id, files.get(a.id)?.size, (files.get(a.id) as File | undefined)?.lastModified])]);
}
