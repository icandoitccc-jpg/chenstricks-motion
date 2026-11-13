import React from 'react';
export function Help(){return <div className="studio help-page"><a className="back-link" href="#/">← 返回首页</a><h1>帮助与对接</h1>
  <details><summary>制作流程</summary><p>终稿 → 画面安排 → 录音 → 分段制作 → 完整视频。各步骤分别保存，下次从上次停留的位置继续。</p></details>
  <details><summary>与 ChatGPT 或 Agent 配合</summary><p>在项目的“画面安排”中下载制作资料，交给 Agent 策划。将返回的制作总表导入同一项目。总表应保留项目、终稿和录音版本，以及原文句子编号。尚未提供 Motion MCP；目前通过文件交接。</p><p>Agent 负责理解稿子、选择实际案例和安排画面；Motion 负责检查、预览和执行。Workspace 是文字依据，不能当成视频素材库。WorkPrint 自动取素材尚未接通，实际素材需要随项目包或手动导入。</p></details>
  <details><summary>录音与同步</summary><p>画面安排可以先于录音完成。制作前需要实际句子时间；现版不自动识别录音。可以导入与终稿分句一致的 SRT / VTT 字幕，或在录音步骤逐句标记。更换录音后需要重新同步。</p></details>
  <details><summary>项目、素材和成片保存在哪里？</summary><p>项目名称、终稿、画面安排和进度保存在当前浏览器，尚不跨设备同步。原始媒体默认不缓存，重新进入时可能需要连接原文件；可以在项目选项中开启缓存。清除网站数据会移除这些项目，请按需备份。</p><p>成片不写入项目缓存；观看需要临时缓冲，下载后才保存文件。GitHub 云端产物保留1天，但输入素材仍保留在私有仓库历史，自动清理尚未完成。</p></details>
  <details><summary>云端制作与费用</summary><p>制作动画和合成使用程序，不调用付费 AI。Agent 策划使用对应产品的订阅额度。云端渲染使用 GitHub Actions 标准运行器，受账户免费用量限制；首次需要在设置中连接 GitHub，并使用私有渲染仓库。</p><p>已验证60秒文字图解成片。新增分段出片及页面回传、混合素材与长片仍需验收。</p></details>
  <details><summary>单独的文字图解动画</summary><p>素材工具中的文字图解动画支持对比、流程、递进、发散、汇聚和重点。可以试用示例，或导入Agent编排的图解方案；方案会先校验再进入编辑和预览。对比每栏1—4项，流程/递进2—5项，重点清单最多4项。</p><p>单独图解方案与项目制作总表格式不同。目前单独导出的图解需要作为视频素材加入项目，还没有一键插入分段的通道。</p></details>
  <details><summary>给 Agent 的执行规范</summary><p>只使用已实现的画面类型：info（文字图解）、image（图片）、video（录屏）。图解模板为 focus、steps、comparison、list；图片动效为 still、push、pan。必须核实实际素材；时间未知就填 null，不按字数估算。每句只归属一个画面，每个画面覆盖连续句子。具体可导入格式随项目制作资料提供。</p></details>
</div>;}
