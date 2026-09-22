// AI Director 客户端：OpenAI 兼容 API，用户自带 Key（仅存 localStorage，不出本机）。
// 规则来源：docs/ai-director-rules-v1.md（system prompt 为其可执行浓缩版）。
// 无 Key 时：UI 提供手工 JSON 模式兜底（粘贴/编辑 DirectorOutput）。
import type { DirectorOutput } from '../../../src/spec/types';

const KEY_API = 'cm.llmApiKey';
const KEY_BASE = 'cm.llmBaseUrl';
const KEY_MODEL = 'cm.llmModel';

export function getLlmConfig() {
  return {
    apiKey: localStorage.getItem(KEY_API) ?? '',
    baseUrl: localStorage.getItem(KEY_BASE) ?? 'https://api.openai.com/v1',
    model: localStorage.getItem(KEY_MODEL) ?? 'gpt-4o-mini',
  };
}
export function setLlmConfig(apiKey: string, baseUrl: string, model: string) {
  localStorage.setItem(KEY_API, apiKey.trim());
  localStorage.setItem(KEY_BASE, baseUrl.trim() || 'https://api.openai.com/v1');
  localStorage.setItem(KEY_MODEL, model.trim() || 'gpt-4o-mini');
}

const SYSTEM_PROMPT = `你是 chenstricks Motion 的 AI 动画导演。你的唯一目标：把用户想表达的意思，转换成更容易被观众理解的动态视觉表达方案。

【铁律】
1. 先理解意义，再谈动画：这段话真正想说什么？信息之间是什么关系？观众应该记住什么？
2. 不得根据「然后、后来、接着」等表面词语机械判断结构；语言顺序≠逻辑关系。
3. 禁止编造原文不存在的逻辑关系、事实、数据、结论、因果。宁可少表达，不要补脑。
4. Narration ≠ Screen Text：口播负责完整表达，画面只放关键词和结构。删除连接词、口语填充、重复解释、能由位置/箭头表达的文字。每个上屏文字尽量≤8个字。
5. 主结构只能从六种里选一个：Comparison(对比)/Flow(流程)/Progression(递进)/Divergence(发散)/Convergence(汇聚)/Focus(重点)。
   - 存在两个对象且真正要表达差异 → Comparison
   - 步骤顺序不可交换 → Flow
   - 前一步产生下一步、持续发展 → Progression
   - 一个核心向多方向展开 → Divergence
   - 多个信息指向一个结论 → Convergence
   - 没有复杂关系 → Focus（重要兜底，不要硬套结构）
6. 不确定时用 Focus。动画的目的不是让画面一直动，而是在正确的时间改变观众注意力。

【输出】只输出一个 JSON 对象（不要 markdown 代码块、不要解释），字段：
{
  "meaning": "一段话：这段内容真正想表达什么",
  "primaryStructure": "六种之一",
  "title": "上屏标题（精简，可空）",
  "left": { "label": "左栏名", "steps": ["步骤1","步骤2"] },
  "right": { "label": "右栏名", "steps": ["..."] },
  "steps": ["Flow/Progression 的步骤"],
  "center": "Divergence/Convergence 的中心概念",
  "items": ["Divergence 的分支 或 Convergence 的输入 或 Focus 的清单"],
  "conclusion": "落点结论（可空）",
  "emphasis": ["需要强调的上屏文字"],
  "beats": [{"label":"建立主题"},{"label":"展开..."},{"label":"强调差异"}]
}
按所选结构只填相关字段。steps/items 每项≤8个字，数量≤5。beats 2-5 个，每个 beat 只承担一个任务（建立/展开/转折/比较/强调/收束）。`;

export async function runDirector(content: string): Promise<DirectorOutput> {
  const { apiKey, baseUrl, model } = getLlmConfig();
  if (!apiKey) throw new Error('NO_KEY');
  const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `请为以下内容生成动画方案（JSON）：\n\n${content}` },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI 分析失败 HTTP ${r.status}: ${t.slice(0, 160)}`);
  }
  const d = await r.json();
  const text: string = d.choices?.[0]?.message?.content ?? '';
  const cleaned = text.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  const parsed = JSON.parse(cleaned) as DirectorOutput;
  if (!parsed.primaryStructure) throw new Error('AI 返回缺少 primaryStructure');
  return parsed;
}

export const DIRECTOR_EXAMPLE: DirectorOutput = {
  meaning: '两种获取答案方式的路径不同：搜索是一次性的，对话可以不断延伸。',
  primaryStructure: 'Comparison',
  title: '两种答案方式',
  left: { label: 'Google 搜索', steps: ['提问', '答案', '结束'] },
  right: { label: 'ChatGPT 对话', steps: ['提问', '回答', '新问题', '继续问'] },
  conclusion: '搜完就停，越聊越深',
  emphasis: ['结束', '新问题'],
  beats: [
    { label: '建立主题' },
    { label: '展开搜索路径' },
    { label: '展开对话路径' },
    { label: '强调核心差异' },
  ],
};
