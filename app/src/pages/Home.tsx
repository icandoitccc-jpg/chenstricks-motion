import React from 'react';

export const Home: React.FC<{ go: (p: string) => void }> = ({ go }) => {
  return (
    <div>
      <h2 className="page-title" style={{ fontSize: 30 }}>让你的想法<br />变成动态画面</h2>
      <p className="page-sub">简单 · 清晰 · 专注于表达</p>
      <div className="home-card" style={{ maxWidth: 860, marginBottom: 18 }}>
        <h3>口播项目</h3>
        <p>导入自己的旁白和 ChatGPT 画面方案，穿插录屏、截图与信息动画。先预览，再导出。</p>
        <button className="primary" onClick={() => go('#/studio')}>打开口播项目 →</button>
      </div>
      <div className="home-grid">
        <div className="home-card">
          <div style={{ fontSize: 34 }}>🖼️</div>
          <h3>让图片动起来</h3>
          <p>上传一张完成构图的图片，框选局部区域，让文字、卡片、按钮按顺序独立动起来。</p>
          <button className="primary" onClick={() => go('#/a')}>开始创作 →</button>
        </div>
        <div className="home-card">
          <div style={{ fontSize: 34 }}>💡</div>
          <h3>信息动画</h3>
          <p>粘贴一段话，AI 先告诉你它打算怎么表达，确认后自动生成有逻辑、有节奏的动画。</p>
          <button className="primary" onClick={() => go('#/b')}>开始创作 →</button>
        </div>
      </div>
      <div className="row" style={{ marginTop: 28, gap: 22 }}>
        <span className="tag">☁️ 云端渲染 · GitHub Actions</span>
        <span className="tag amber">🎬 1080p · Q4 高画质</span>
        <span className="tag green">✨ 素材即用即删</span>
      </div>
    </div>
  );
};
