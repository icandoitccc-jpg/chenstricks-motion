import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Studio } from './pages/Studio';
import { SettingsModal } from './components/SettingsModal';
import './styles.css';

function Standalone() {
  const [settings, setSettings] = useState(false);
  return <div className="app-shell"><nav className="side-nav"><div className="brand">chenstricks <span>Motion</span></div><span className="nav-item active">口播项目 · 测试版</span><a className="nav-item" href="https://icandoitccc-jpg.github.io/chenstricks-motion/" target="_blank" rel="noreferrer">打开原版动画工具</a><div style={{ flex: 1 }} /><button className="nav-item" onClick={() => setSettings(true)}>云端连接设置</button></nav><main className="main"><Studio /></main>{settings && <SettingsModal githubOnly onClose={() => setSettings(false)} />}</div>;
}
createRoot(document.getElementById('root')!).render(<Standalone />);
