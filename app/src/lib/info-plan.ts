import type { DirectorOutput, StructureName } from '../../../src/spec/types';

export const infoStructures: StructureName[] = ['Comparison','Flow','Progression','Divergence','Convergence','Focus'];
export function validateInfoPlan(value: unknown): DirectorOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('图解方案必须是一个对象。');
  const d = value as Record<string,unknown>;
  if (!infoStructures.includes(d.primaryStructure as StructureName)) throw new Error('图解结构不受支持，请使用对比、流程、递进、发散、汇聚或重点。');
  const text = (v: unknown, label: string, max: number, required = false) => {
    if(v===undefined || v===null) { if(required)throw new Error(`请填写${label}。`);return ''; }
    if(typeof v!=='string')throw new Error(`${label}需要文字。`);
    const s=v.trim();if((required&&!s)||s.length>max)throw new Error(`${label}${!s?'不能为空':`最多${max}个字`}。`);return s;
  };
  const list = (v: unknown, label: string, min: number, max: number) => {
    if(!Array.isArray(v)||v.length<min||v.length>max)throw new Error(`${label}需要${min}—${max}项内容。`);
    return v.map(x=>text(x,label+'每项',12,true));
  };
  const p: DirectorOutput={primaryStructure:d.primaryStructure as StructureName,meaning:text(d.meaning,'内容概述',500),title:text(d.title,'标题',24),conclusion:text(d.conclusion,'结论',24),center:text(d.center,'中心内容',12)};
  if(p.primaryStructure==='Comparison')for(const side of ['left','right'] as const){const v=d[side];if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(`请填写${side==='left'?'左':'右'}栏。`);const a=v as Record<string,unknown>;p[side]={label:text(a.label,'栏目名称',12,true),steps:list(a.steps,'每栏步骤',1,4)};}
  if(p.primaryStructure==='Flow'||p.primaryStructure==='Progression')p.steps=list(d.steps,'步骤',2,5);
  if(p.primaryStructure==='Divergence'||p.primaryStructure==='Convergence'){p.items=list(d.items,'关联内容',2,5);if(!p.center&&!p.title&&!p.conclusion)throw new Error('请填写中心内容、标题或结论。');}
  if(p.primaryStructure==='Focus'){p.items=d.items===undefined?[]:list(d.items,'重点清单',0,4);if(!p.title&&!p.center&&!p.conclusion)throw new Error('重点图解需要标题或核心内容。');}
  if(d.emphasis!==undefined)p.emphasis=list(d.emphasis,'强调内容',0,6);
  if(d.beats!==undefined){if(!Array.isArray(d.beats)||d.beats.length>5)throw new Error('动画节奏最多5项。');p.beats=d.beats.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('动画节奏格式错误。');return {label:text((v as Record<string,unknown>).label,'节奏名称',60,true)};});}
  return p;
}
export function parseInfoPlan(raw: string) {
  if(raw.length>64000)throw new Error('图解方案过大，请只导入一个片段。');
  try { return validateInfoPlan(JSON.parse(raw)); } catch(e) { if(e instanceof SyntaxError)throw new Error('方案文件不是有效JSON，请检查格式。');throw e; }
}
