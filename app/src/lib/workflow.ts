import { splitScript, type Project } from './project';

export const steps = ['draft', 'plan', 'audio', 'scenes', 'export'] as const;
export type ProjectStep = typeof steps[number];
export const stepLabels: Record<ProjectStep, string> = { draft: '终稿', plan: '画面安排', audio: '录音', scenes: '分段制作', export: '完整视频' };

/** Upgrade existing projects without changing their sentence IDs or timings. */
export function prepareWorkflow(p: Project): Project {
  const text = p.scriptText ?? p.sentences.map(s => s.text).join('\n');
  return { ...p, scriptText: text, draftText: p.draftText ?? text,
    scriptRevision: p.scriptRevision ?? (text ? 1 : 0),
    planScriptRevision: p.planScriptRevision ?? (p.scenes.length ? p.scriptRevision ?? 1 : undefined),
    currentStep: p.currentStep ?? (p.scenes.length ? p.audioAssetId ? 'scenes' : 'plan' : 'draft') };
}
export function hasDraft(p: Project) { return !!p.scriptText?.trim() && p.scriptText === p.draftText; }
export function hasPlan(p: Project) { return hasDraft(p) && p.scenes.length > 0 && p.planScriptRevision === p.scriptRevision; }
export function hasTiming(p: Project) {
  const audio = p.assets.find(a => a.id === p.audioAssetId);
  let end = 0;
  return !!audio && p.sentences.length > 0 && p.sentences.every(s => {
    if (s.start === null || s.end === null || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < end || s.end <= s.start || s.end > (audio.duration ?? 0) + .05) return false;
    end = s.end; return true;
  });
}
export function canOpenStep(p: Project, step: ProjectStep) {
  if (step === 'draft') return true;
  if (step === 'plan') return hasDraft(p);
  if (step === 'audio') return hasPlan(p);
  return hasPlan(p) && hasTiming(p);
}
export function resumeStep(p: Project): ProjectStep {
  const value = prepareWorkflow(p);
  return value.currentStep && canOpenStep(value, value.currentStep) ? value.currentStep : 'draft';
}
export function projectProgress(p: Project) {
  p = prepareWorkflow(p);
  if (!p.scriptText?.trim()) return '等待上传终稿';
  if (!hasDraft(p)) return '终稿修改中';
  if (!hasPlan(p)) return '终稿已上传 · 尚未安排画面';
  if (!p.audioAssetId) return '画面已安排 · 等待录音';
  if (!hasTiming(p)) return '录音已添加 · 等待同步';
  return p.currentStep === 'export' ? '正在检查完整视频' : '录音已同步 · 准备分段画面';
}
export function confirmDraft(p: Project, text: string): Project {
  text = text.trim(); if (!text) throw new Error('请先上传或粘贴终稿。');
  if (text === p.scriptText) return { ...p, draftText: text };
  return { ...p, scriptText: text, draftText: text, scriptRevision: (p.scriptRevision ?? 0) + 1,
    planScriptRevision: undefined, sentences: splitScript(text), scenes: [], currentStep: 'draft' };
}
