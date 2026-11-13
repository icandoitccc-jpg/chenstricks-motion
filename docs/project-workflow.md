# Motion 项目工作流

## 产品入口
首页展示最近项目及其当前进展；我的项目管理已有项目。新建项目只收集名称和终稿。素材工具与项目制作分别导航，帮助与对接集中放置格式、存储和能力边界。不得在主流程重复展示实现原理或开发验收说明。

## 项目状态与页面位置
Project 是唯一制作数据源。`scriptText` 是确认后的终稿，`draftText` 是尚在编辑的文字，`scriptRevision` 随确认修改递增；`planScriptRevision` 表明画面安排对应哪版终稿。`currentStep` 单独保存当前停留位置，不用它冒充已完成状态。

顺序为 draft（终稿）→ plan（画面安排）→ audio（录音）→ scenes（分段制作）→ export（完整视频）。前一步的必要资料就绪才开放后续步骤，缺少未来资料不能阻止当前项目保存。画面策划可先于录音；音画预览和渲染必须有实际时间。

`workflow.ts` 集中定义迁移、步骤条件、恢复位置和进度文案，界面不能各自猜测进度。`project-files.ts` 以项目ID保存数据，串行化写入；离开项目时提交最后快照，列表读取等待写入完成。旧项目保留句子ID、素材关系及实际时间。

## 变更规则
确认修改终稿前说明影响；确认后清除旧分镜及句子时间，保留原始媒体供重新使用。未确认的文字修改不能继续使用旧安排导出。普通策划总表按完整原文匹配，不要求Agent或用户提供内部项目编号；旧的项目绑定格式仍保留ID/版本校验。任何格式都不允许通过导入总表悄悄改稿。

换录音后清除旧时间，画面句子绑定保留。缺素材只阻断受影响段落；整片导出必须检查全部所需资料。显示“生成完成”必须以真实结果为依据，不能根据进入某页面或点击某按钮判断。

## 分工和费用边界
外部Agent理解终稿并选材，Motion检查和执行。未知时间填null。Agent策划使用对应订阅额度，程序检查和渲染不调用付费AI。GitHub Actions仍受免费用量限制；不能宣称无限免费。

现版没有录音自动对齐、Motion MCP或WorkPrint自动取媒体。Workspace只提供文字与文件依据，不能充当视频素材库。素材须以真实文件交接。

## 存储
项目文字、安排和阶段位置保存到当前浏览器；尚不跨设备同步。原始媒体缓存可选，成片不写入项目缓存。项目包用于备份。GitHub产物1天过期不代表Git历史输入文件已清除，后者仍待改进。

## 验收顺序
1. 创建只有终稿的项目，离开并刷新首页，显示终稿已上传，继续回到终稿页。
2. 进入画面安排后再次离开，继续恢复该步骤，终稿不重传。
3. 修改终稿使旧方案失效，旧版本和原文不一致的总表均被拒绝。
4. 用已有真实音频项目检查分段卡片、录音预览和项目迁移，确认旧能力未被入口重构破坏。
5. 后续再验证自动对齐、新分段MP4回传、混合媒体和云端清理，不把这些能力写成已经完成。


## Script-bound plans (2026-11-13)

Normal planning accepts `{version:1,binding:"script",sentences,assets,scenes}`. Do not require users to export internal project metadata. Require the complete final script, preserving punctuation; ignore only whitespace when comparing. Portable plans carry no projectId/audioRevision/scriptRevision and no timing (start/end must be null). Bind to the current project only after exact full-script validation. Map exact sentence boundaries back to current IDs and authoritative times; reject changes to boundaries when timing exists. Existing explicitly project-bound tables retain strict ID/version checks. No recording, media lookup or AI inference is performed by this binding step.


## 跨Agent交接

app/public/motion-agent-guide.md是给新对话的统一规范，包含分工、能力表、portable格式、中性示例、缺信息处理及比较标准。scripts/validate-production-plan.mjs直接调用产品parser做验收，不另写一套相似规则。production-contract.ts在portable总表导入前阻断空/过量图解、错误对比结构、倒序/缺失/重复原文、未实现模板和错误动效参数，避免到制作才暴露错误。独立Agent的真实策划结果由用户另开对话获得，未进行前不能声称跨Agent验收通过。
